import { onMounted, onUnmounted } from 'vue'

export interface ParsedSong {
    id: string;
    title: string;
    type: string;
    nh: number;
    lines: string[];
    quickActions: { text: string; index: number }[];
}

// Single instance of connections for the application
let sharedWS: WebSocket | null = null
let reconnectAttempt = 0
let wasConnected = false // ponytail: track if we ever connected — reload on reconnect

export const useRealtime = () => {
  const api = useApi()
  
  // Compartir el estado entre todas las instancias del composable usando useState
  const isConnected = useState('realtime:isConnected', () => false)
  const connectionStatus = useState<'disconnected' | 'connecting' | 'connected'>('realtime:status', () => 'disconnected')
  const connectionId = useState('realtime:connectionId', () => '')
  const viewerActive = useState('realtime:viewerActive', () => false)
  const activeLine = useState('realtime:activeLine', () => '')
  const activeCantoId = useState('realtime:activeCantoId', () => '')
  const activeIndex = useState('realtime:activeIndex', () => 0)
  const activeSong = useState<ParsedSong | null>('realtime:activeSong', () => null)
  const announcement = useState('realtime:announcement', () => ({
    text: '',
    active: false,
    topic: 'ANUNCIO'
  }))
  const transcription = useState('realtime:transcription', () => ({
    active: false,
    producing: false,
    final: '',
    interim: ''
  }))
  /** Marca de tiempo del servidor para el último cambio en anuncio (ms). */
  const lastAnnouncementUpdate = useState('realtime:lastAnnouncementUpdate', () => 0)

  const handleMessage = (payload: string) => {
    try {
      const msg = JSON.parse(payload)
      const { type, data, from, to } = msg
      
      // If the message is targeted to someone else, ignore it
      if (to && to !== connectionId.value) {
        return
      }
      
      switch (type) {
        case 'initial':
          connectionId.value = data.connectionId || ''
          viewerActive.value = data.viewerActive
          activeLine.value = data.activeLine
          activeCantoId.value = data.activeCantoId
          activeIndex.value = data.activeIndex
          activeSong.value = data.activeSong || null
          announcement.value = data.announcement || { text: '', active: false }
          transcription.value = data.transcription || { active: false, producing: false, final: '', interim: '' }
          lastAnnouncementUpdate.value =
            typeof data.lastAnnouncementUpdate === 'number' && !Number.isNaN(data.lastAnnouncementUpdate)
              ? data.lastAnnouncementUpdate
              : Date.now()
          break

        case 'viewerActive':
          viewerActive.value = data
          break
        
        case 'line':
          activeLine.value = data
          break

        case 'activeSong':
          console.log('[Realtime] Received ActiveSong:', data)
          activeSong.value = data
          if (data) {
              activeCantoId.value = data.id
          }
          break

        case 'index':
          activeIndex.value = data
          break

        case 'announcement':
          console.log('[Realtime] Received Announcement:', data)
          announcement.value = data
          lastAnnouncementUpdate.value =
            typeof msg.lastAnnouncementUpdate === 'number' && !Number.isNaN(msg.lastAnnouncementUpdate)
              ? msg.lastAnnouncementUpdate
              : Date.now()
          break

        case 'transcriptionState':
          transcription.value = data
          break

        case 'transcriptionUpdate':
          transcription.value.final = data.final
          transcription.value.interim = data.interim
          break

        case 'historyRefresh':
          break
      }
    } catch (e) {
      console.error('[Realtime] Error parsing message:', e)
    }
  }

  const tryWebSocket = async (): Promise<void> => {
    return new Promise(async (resolve, reject) => {
        const url = await api.getWsUrl()
        console.log('[Realtime] Intentando WebSocket:', url)
        
        const ws = new WebSocket(url)
        sharedWS = ws

        const timeout = setTimeout(() => {
            if (ws.readyState !== WebSocket.OPEN) {
                ws.close()
                reject(new Error('WS Timeout'))
            }
        }, 10000)

        ws.onopen = () => {
            clearTimeout(timeout)
            console.log('[Realtime] WebSocket connected')
            isConnected.value = true
            connectionStatus.value = 'connected'
            // ponytail: si nos reconectamos después de una caída, recargar para tomar cambios del server
            if (wasConnected) {
                console.log('[Realtime] Reconnected after disconnect — reloading page')
                location.reload()
                return
            }
            wasConnected = true
            reconnectAttempt = 0
            resolve()
        }

        ws.onmessage = (event) => {
            handleMessage(event.data)
        }

        ws.onerror = (err) => {
            clearTimeout(timeout)
            reject(err)
        }

        ws.onclose = () => {
            sharedWS = null
            isConnected.value = false
            connectionStatus.value = 'disconnected'
            // ponytail: siempre reintentar, sin importar si llegamos a conectar
            reconnectAttempt++
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempt - 1), 10000)
            console.log(`[Realtime] Reconnecting in ${delay}ms (attempt ${reconnectAttempt})`)
            setTimeout(() => connect(), delay)
        }
    })
  }

  const connect = async () => {
    if (import.meta.server) return
    if (sharedWS?.readyState === WebSocket.OPEN || sharedWS?.readyState === WebSocket.CONNECTING) return

    connectionStatus.value = 'connecting'

    try {
        await tryWebSocket()
    } catch (wsErr) {
        console.error('[Realtime] Error en la conexión WebSocket:', wsErr)
        isConnected.value = false
        connectionStatus.value = 'disconnected'
        // ponytail: el retry lo maneja ws.onclose (único punto de retry)
    }
  }

  const disconnect = () => {
    if (sharedWS) {
      sharedWS.close()
      sharedWS = null
    }
    isConnected.value = false
    connectionStatus.value = 'disconnected'
    wasConnected = false
    reconnectAttempt = 0
  }

  const sendEvent = (type: string, data: any, to?: string) => {
    // ponytail: WS directo, mitad de latencia vs HTTP POST round-trip
    const msg = JSON.stringify({ type, data, from: connectionId.value, to })
    if (sharedWS?.readyState === WebSocket.OPEN) {
      sharedWS.send(msg)
    }
    // ponytail: sin fallback HTTP, si el WS no está conectado el evento se pierde
    // y el reconnect re-sincroniza el estado via 'initial'. Más simple y correcto
    // que un POST que puede llegar fuera de orden tras reconexión.
  }

  const sendLine = (line: string) => {
    sendEvent('newLine', line)
    activeLine.value = line
  }

  const sendCanto = (id: string) => {
    // ponytail: optimistic — el server resuelve el parse del song,
    // pero seteamos el ID y reseteamos índice para feedback inmediato
    activeCantoId.value = id
    activeIndex.value = 0
    activeLine.value = ''
    activeSong.value = null
    sendEvent('changeCanto', id)
  }

  const sendIndex = (index: number) => {
    sendEvent('changeIndex', index)
    activeIndex.value = index
  }

  const changeViewerState = (state: boolean) => {
    sendEvent('view', state)
    viewerActive.value = state
  }

  const setAnnouncement = (data: { text: string, active: boolean, topic?: string }) => {
    // Optimistic Update
    announcement.value = {
      ...announcement.value,
      ...data
    }
    lastAnnouncementUpdate.value = Date.now()
    sendEvent('setAnnouncement', data)
  }

  const setTranscriptionActive = (active: boolean) => {
    // Optimistic Update
    transcription.value.active = active
    if (active) {
      announcement.value.active = false
      viewerActive.value = false
    }
    sendEvent('setTranscriptionActive', active)
  }

  const setTranscriptionProducing = (producing: boolean) => {
    sendEvent('setTranscriptionProducing', producing)
  }

  const updateTranscription = (data: { final: string, interim: string }) => {
    sendEvent('transcriptionUpdate', data)
  }

  return {
    isConnected,
    connectionStatus,
    connectionId,
    viewerActive,
    activeLine,
    activeCantoId,
    activeIndex,
    activeSong,
    announcement,
    transcription,
    lastAnnouncementUpdate,
    connect,
    disconnect,
    sendLine,
    sendCanto,
    sendIndex,
    changeViewerState,
    setAnnouncement,
    setTranscriptionActive,
    setTranscriptionProducing,
    updateTranscription
  }
}
