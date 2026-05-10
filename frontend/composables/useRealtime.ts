import { ref, onMounted, onUnmounted } from 'vue'

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

export const useRealtime = () => {
  const api = useApi()
  
  // Compartir el estado entre todas las instancias del composable usando useState
  const isConnected = useState('realtime:isConnected', () => false)
  const connectionStatus = useState<'disconnected' | 'connecting' | 'connected'>('realtime:status', () => 'disconnected')
  const viewerActive = useState('realtime:viewerActive', () => false)
  const activeLine = useState('realtime:activeLine', () => '')
  const activeCantoId = useState('realtime:activeCantoId', () => '')
  const activeIndex = useState('realtime:activeIndex', () => 0)
  const activeSong = useState<ParsedSong | null>('realtime:activeSong', () => null)
  const announcement = useState('realtime:announcement', () => ({
    text: '',
    active: false,
    position: 'bottom' as 'top' | 'bottom',
    topic: 'ANUNCIO'
  }))
  const transcription = useState('realtime:transcription', () => ({
    active: false,
    producing: false,
    final: '',
    interim: ''
  }))

  const handleMessage = (payload: string) => {
    try {
      const { type, data } = JSON.parse(payload)
      
      switch (type) {
        case 'initial':
          viewerActive.value = data.viewerActive
          activeLine.value = data.activeLine
          activeCantoId.value = data.activeCantoId
          activeIndex.value = data.activeIndex
          activeSong.value = data.activeSong || null
          announcement.value = data.announcement || { text: '', active: false, position: 'bottom' }
          transcription.value = data.transcription || { active: false, producing: false, final: '', interim: '' }
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
          announcement.value = data
          break

        case 'transcriptionState':
          transcription.value = data
          break

        case 'transcriptionUpdate':
          transcription.value.final = data.final
          transcription.value.interim = data.interim
          break

        case 'historyRefresh':
          // The backend sends this when it clears history due to inactivity
          // We don't need to do much here because announcement watchers will trigger fetchHistory
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
            if (isConnected.value) {
                isConnected.value = false
                connectionStatus.value = 'disconnected'
                // Reconnect attempt
                setTimeout(() => connect(), 3000)
            }
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
    }
  }

  const disconnect = () => {
    if (sharedWS) {
      sharedWS.close()
      sharedWS = null
    }
    isConnected.value = false
    connectionStatus.value = 'disconnected'
  }

  const sendEvent = async (type: string, data: any) => {
    try {
        await api.post(`/api/ws-events/${type}`, { data })
    } catch (e) {
        console.error(`[Realtime] Error sending event ${type}:`, e)
    }
  }

  const sendLine = (line: string) => {
    sendEvent('newLine', line)
    activeLine.value = line
  }

  const sendCanto = (id: string) => {
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

  const setAnnouncement = (data: { text: string, active: boolean, position?: 'top' | 'bottom', topic?: string }) => {
    sendEvent('setAnnouncement', data)
  }

  const setTranscriptionActive = (active: boolean) => {
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
    viewerActive,
    activeLine,
    activeCantoId,
    activeIndex,
    activeSong,
    announcement,
    transcription,
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
