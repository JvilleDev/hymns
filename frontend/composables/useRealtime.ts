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
let sharedES: EventSource | null = null
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
    position: 'bottom' as 'top' | 'bottom'
  }))
  const transcription = useState('realtime:transcription', () => ({
    active: false,
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
          transcription.value = data.transcription || { active: false, final: '', interim: '' }
          break

        case 'viewerActive':
          viewerActive.value = data
          break
        
        case 'line':
          activeLine.value = data
          break

        case 'canto':
          activeCantoId.value = data
          activeIndex.value = 0
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
            
            import('vue-sonner').then(({ toast }) => {
                toast.success('Servidor conectado (WebSocket)')
            })
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
                console.log('[Realtime] WebSocket closed, retrying cascade...')
                connect()
            }
        }
    })
  }

  const trySSE = async (): Promise<void> => {
    return new Promise(async (resolve, reject) => {
        const url = await api.getFullUrl('/sse')
        console.log('[Realtime] Intentando SSE:', url)

        const es = new EventSource(url)
        sharedES = es

        const timeout = setTimeout(() => {
          if (es.readyState !== EventSource.OPEN) {
            console.warn('[Realtime] SSE Timeout reached')
            es.close()
            sharedES = null
            reject(new Error('SSE Timeout'))
          }
        }, 10000)

        es.onopen = () => {
          clearTimeout(timeout)
          console.log('[Realtime] SSE connected')
          isConnected.value = true
          connectionStatus.value = 'connected'
          
          import('vue-sonner').then(({ toast }) => {
            toast.success('Servidor conectado (SSE)')
          })
          resolve()
        }

        es.onmessage = (event) => {
          handleMessage(event.data)
        }

        es.onerror = (err) => {
          clearTimeout(timeout)
          es.close()
          sharedES = null
          reject(err)
        }
    })
  }

  const connect = async () => {
    if (import.meta.server) return
    
    // Si ya estamos conectando o conectados, abortar
    if (sharedWS?.readyState === WebSocket.OPEN || sharedWS?.readyState === WebSocket.CONNECTING) return
    if (sharedES?.readyState === EventSource.OPEN || sharedES?.readyState === EventSource.CONNECTING) return

    connectionStatus.value = 'connecting'

    try {
        await tryWebSocket()
    } catch (wsErr) {
        console.warn('[Realtime] WebSocket falló, probando SSE...')
        try {
            await trySSE()
        } catch (sseErr) {
            console.error('[Realtime] Ambos protocolos fallaron.')
            isConnected.value = false
            connectionStatus.value = 'disconnected'
            // Activar diálogo de error de conexión en useApi
            api.isHealthy.value = false
            api.isConnectionError.value = true
        }
    }
  }

  const disconnect = () => {
    if (sharedES) {
      sharedES.close()
      sharedES = null
    }
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

  const setAnnouncement = (data: { text: string, active: boolean, position?: 'top' | 'bottom' }) => {
    sendEvent('setAnnouncement', data)
  }

  const setTranscriptionActive = (active: boolean) => {
    sendEvent('setTranscriptionActive', active)
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
    updateTranscription
  }
}
