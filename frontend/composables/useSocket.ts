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

    // Ensure we run this only on client side
    if (import.meta.client) {
        socket.value = io(socketUrl as string)
        
        socket.value.on('connect', () => {
          console.log('Socket connected to', socketUrl)
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
