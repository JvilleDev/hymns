import { io, type Socket } from 'socket.io-client'

export const useSocket = () => {
  const { socketUrl } = useRuntimeConfig().public
  const socket = useState<Socket | null>('socket', () => null)
  
  // State shared across components using useState
  const viewerActive = useState<boolean>('viewerActive', () => true)
  const activeLine = useState<string>('activeLine', () => '')
  const activeCantoId = useState<string>('activeCantoId', () => '')
  const activeIndex = useState<number>('activeIndex', () => 0)
  const activeSong = useState<any>('activeSong', () => null) // New structured state
  const announcement = useState<{ text: string, active: boolean }>('announcement', () => ({ text: '', active: false }))
  
  // We can keep these for legacy or computed compatibility, or derive them.
  // For now let's keep them synced to avoid breaking other components immediately, 
  // but eventually we should use activeSong everywhere.
  
  const connect = () => {
    if (socket.value?.connected) return

    if (import.meta.client) {
        const socketUrlStr = socketUrl as string
        const socketPort = socketUrlStr.match(/:(\d+)$/)?.[1] || '3100'
        
        // Try current hostname first (essential for remote access), then fallback to configured URL
        const fallbacks = [
          `${window.location.protocol}//${window.location.hostname}:${socketPort}`,
          socketUrlStr,
          `${window.location.protocol}//${window.location.hostname}:3100`, // Extra fallback to 3100
        ]
        const uniqueFallbacks = [...new Set(fallbacks)]
        let currentFallbackIndex = 0

        const initSocket = (url: string) => {
          console.log('Attempting socket connection to:', url)
          
          socket.value = io(url, {
            reconnectionAttempts: 2, 
            timeout: 3000,
            transports: ['websocket', 'polling'] // Ensure websocket is tried first
          })

          socket.value.on('connect', () => {
            console.log('Socket connected successfully to:', url)
            import('vue-sonner').then(({ toast }) => {
              toast.success('Servidor conectado')
            })
          })

          socket.value.on('connect_error', () => {
            currentFallbackIndex++
            if (currentFallbackIndex < uniqueFallbacks.length) {
              const nextUrl = uniqueFallbacks[currentFallbackIndex]
              console.warn(`Connection to ${url} failed. Trying fallback ${currentFallbackIndex}: ${nextUrl}`)
              socket.value?.disconnect()
              setTimeout(() => initSocket(nextUrl), 500)
            } else {
              console.error('All socket fallbacks failed. Retrying cycle in 5s...')
              currentFallbackIndex = 0 // Reset for next cycle
              socket.value?.disconnect()
              
              // Only show error toast once in a while or never to avoid spamming
              // import('vue-sonner').then(({ toast }) => {
              //   toast.error('No se pudo conectar con el servidor. Reintentando...')
              // })

              setTimeout(() => {
                initSocket(uniqueFallbacks[0])
              }, 5000)
            }
          })

          socket.value.on('initial', (data: any) => {
            viewerActive.value = data.viewerActive
            activeLine.value = data.activeLine
            activeCantoId.value = data.activeCantoId
            activeIndex.value = data.activeIndex
            activeSong.value = data.activeSong || null
            announcement.value = data.announcement || { text: '', active: false }
          })


          socket.value.on('viewerActive', (state: boolean) => {
            viewerActive.value = state
          })
          
          socket.value.on('line', (line: string) => {
            activeLine.value = line
          })

          socket.value.on('canto', (id: string) => {
            activeCantoId.value = id
            activeIndex.value = 0
          })

          socket.value.on('activeSong', (song: any) => {
             console.log('[Socket] Received ActiveSong:', song)
             activeSong.value = song
             // Sync individual states if needed for legacy components, but components should switch to activeSong
             if (song) {
                 activeCantoId.value = song.id
             }
          })

          socket.value.on('index', (index: number) => {
            activeIndex.value = index
          })

          socket.value.on('announcement', (data: { text: string, active: boolean }) => {
            announcement.value = data
          })
        }

        initSocket(uniqueFallbacks[0])
    }
  }

  const disconnect = () => {
    if (socket.value) {
      socket.value.disconnect()
      socket.value = null
    }
  }

  const sendLine = (line: string) => {
    if (!socket.value) return
    socket.value.emit('newLine', line)
    activeLine.value = line
  }

  const sendCanto = (id: string) => {
    if (!socket.value) return
    socket.value.emit('changeCanto', id)
    // Optimistic update? Better wait for server response to ensure sync
    // activeCantoId.value = id 
    // activeIndex.value = 0
  }

  const sendIndex = (index: number) => {
    if (!socket.value) return
    socket.value.emit('changeIndex', index)
    activeIndex.value = index
  }

  const changeViewerState = (state: boolean) => {
    if (!socket.value) return
    socket.value.emit('view', state)
    viewerActive.value = state
  }

  const setAnnouncement = (data: { text: string, active: boolean }) => {
    if (!socket.value) return
    socket.value.emit('setAnnouncement', data)
  }

  return {
    socket,
    viewerActive,
    activeLine,
    activeCantoId,
    activeIndex,
    activeSong, // Export new state
    connect,
    disconnect,
    sendLine,
    sendCanto,
    sendIndex,
    changeViewerState,
    announcement,
    setAnnouncement
  }
}
