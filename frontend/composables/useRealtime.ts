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

  const onWebRTCOffer = ref<((data: any) => void) | null>(null)
  const onWebRTCAnswer = ref<((data: any) => void) | null>(null)
  const onWebRTCCandidate = ref<((data: any) => void) | null>(null)
  const onWebRTCRequest = ref<((data: any) => void) | null>(null)

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
          // The backend sends this when it clears history due to inactivity
          // We don't need to do much here because announcement watchers will trigger fetchHistory
          break

        case 'webrtc-offer':
          if (onWebRTCOffer.value) onWebRTCOffer.value({ data, from })
          break
        
        case 'webrtc-answer':
          if (onWebRTCAnswer.value) onWebRTCAnswer.value({ data, from })
          break
        
        case 'webrtc-ice-candidate':
          if (onWebRTCCandidate.value) onWebRTCCandidate.value({ data, from })
          break
        
        case 'webrtc-request':
          if (onWebRTCRequest.value) onWebRTCRequest.value({ data, from })
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

  const sendEvent = async (type: string, data: any, to?: string) => {
    try {
        await api.post(`/api/ws-events/${type}`, { data, from: connectionId.value, to })
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

  const sendWebRTCOffer = (offer: any, to: string) => sendEvent('webrtc-offer', offer, to)
  const sendWebRTCAnswer = (answer: any, to: string) => sendEvent('webrtc-answer', answer, to)
  const sendWebRTCCandidate = (candidate: any, to?: string) => sendEvent('webrtc-ice-candidate', candidate, to)
  const sendWebRTCRequest = () => sendEvent('webrtc-request', {})

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
    onWebRTCOffer,
    onWebRTCAnswer,
    onWebRTCCandidate,
    onWebRTCRequest,
    connect,
    disconnect,
    sendLine,
    sendCanto,
    sendIndex,
    changeViewerState,
    setAnnouncement,
    setTranscriptionActive,
    setTranscriptionProducing,
    updateTranscription,
    sendWebRTCOffer,
    sendWebRTCAnswer,
    sendWebRTCCandidate,
    sendWebRTCRequest
  }
}
