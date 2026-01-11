import { io, type Socket } from 'socket.io-client'

export const useSocket = () => {
  const { socketUrl } = useRuntimeConfig().public
  const socket = useState<Socket | null>('socket', () => null)
  
  // State shared across components using useState
  const viewerActive = useState<boolean>('viewerActive', () => true)
  const activeLine = useState<string>('activeLine', () => '')
  const activeCantoId = useState<string>('activeCantoId', () => '')
  const activeIndex = useState<number>('activeIndex', () => 0)
  
  const connect = () => {
    if (socket.value?.connected) return

    if (import.meta.client) {
        const socketUrlStr = socketUrl as string
        
        // Generar lista de fallbacks únicos
        const fallbacks = [
          socketUrlStr,
          // Fallback 1: Misma base URL pero con puerto 3100
          socketUrlStr.replace(/:(\d+)$/, '') + ':3100',
          // Fallback 2: Hostname actual con puerto 3100
          `${window.location.protocol}//${window.location.hostname}:3100`
        ]
        
        // Filtrar duplicados
        const uniqueFallbacks = [...new Set(fallbacks)]
        let currentFallbackIndex = 0

        const initSocket = (url: string) => {
          console.log('Attempting socket connection to:', url)
          
          socket.value = io(url, {
            reconnectionAttempts: 3, // Reducido para saltar más rápido al siguiente fallback
            timeout: 5000
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
              // Pequeño delay para limpiar el estado previo
              setTimeout(() => {
                initSocket(nextUrl)
              }, 500)
            } else {
              console.error('All socket fallbacks failed.')
              import('vue-sonner').then(({ toast }) => {
                toast.error('No se pudo conectar con el servidor')
              })
            }
          })

          socket.value.on('initial', (data: any) => {
            viewerActive.value = data.viewerActive
            activeLine.value = data.activeLine
            activeCantoId.value = data.activeCantoId
            activeIndex.value = data.activeIndex
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

          socket.value.on('index', (index: number) => {
            activeIndex.value = index
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
    activeCantoId.value = id
    activeIndex.value = 0
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

  return {
    socket,
    viewerActive,
    activeLine,
    activeCantoId,
    activeIndex,
    connect,
    disconnect,
    sendLine,
    sendCanto,
    sendIndex,
    changeViewerState
  }
}
