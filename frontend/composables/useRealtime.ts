import { ref, onMounted, onUnmounted } from 'vue'

export interface ParsedSong {
    id: string;
    title: string;
    type: string;
    nh: number;
    lines: string[];
    quickActions: { text: string; index: number }[];
}

export const useRealtime = () => {
  const isConnected = ref(false)
  const viewerActive = ref(false)
  const activeLine = ref('')
  const activeCantoId = ref('')
  const activeIndex = ref(0)
  const activeSong = ref<ParsedSong | null>(null)
  const announcement = ref({
    text: '',
    active: false,
    position: 'bottom' as 'top' | 'bottom'
  })
  const transcription = ref({
    active: false,
    final: '',
    interim: ''
  })

  const eventSource = ref<EventSource | null>(null)

  const connect = () => {
    if (eventSource.value && eventSource.value.readyState !== EventSource.CLOSED) return

    if (import.meta.client) {
        console.log('Attempting SSE connection')
        
        // SSE is just HTTP, so /sse should work via proxy
        const url = `/sse`

        const es = new EventSource(url)
        eventSource.value = es

        es.onopen = () => {
          console.log('SSE connection headers received')
          // We wait for the first message to confirm full data flow through proxy
        }

        es.onmessage = (event) => {
          if (!isConnected.value) {
            isConnected.value = true
            console.log('SSE connected successfully via proxy')
            import('vue-sonner').then(({ toast }) => {
              toast.success('Servidor conectado (Realtime)')
            })
          }
          
          try {
            const { type, data } = JSON.parse(event.data)
            
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
            console.error('Error parsing Realtime message:', e)
          }
        }

        es.onerror = (err) => {
          isConnected.value = false
          console.error('Realtime connection error:', err)
          es.close()
          setTimeout(connect, 5000)
        }
    }
  }

  const disconnect = () => {
    if (eventSource.value) {
      eventSource.value.close()
      eventSource.value = null
      isConnected.value = false
    }
  }

  const sendEvent = async (type: string, data: any) => {
    try {
        await $fetch(`/api/ws-events/${type}`, {
            method: 'POST',
            body: { data }
        })
    } catch (e) {
        console.error(`Error sending event ${type}:`, e)
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
