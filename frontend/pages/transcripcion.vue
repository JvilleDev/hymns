<script setup lang="ts">
import { toast } from 'vue-sonner'
import { watchDebounced } from '@vueuse/core'

const { 
  connect, 
  updateTranscription, 
  setTranscriptionProducing, 
  isConnected,
  onWebRTCAnswer,
  onWebRTCCandidate,
  onWebRTCRequest,
  sendWebRTCOffer,
  sendWebRTCCandidate,
  sendWebRTCRequest,
  transcription,
  connectionId
} = useRealtime()
const { clientId, isManualConnectionTrigger } = useApi()

const isSupportedBrowser = ref(false)
const isTranscribing = ref(false)
const isStreamingVideo = ref(false)
const recognition = ref<any>(null)
const interimTranscript = ref('')
const finalTranscript = ref('')
const fullHistory = ref('') // Lo que se envía al socket (Consolidado + Párrafo Activo)
const consolidatedText = ref('') // Párrafos ya cerrados
const activeParagraphRaw = ref('') // Texto crudo del párrafo actual
const activeParagraphPunctuated = ref('') // Texto puntuado del párrafo actual
const errorCount = ref(0)
const maxErrors = 10
const isLocalProducer = ref(false)
const lastFinalTimestamp = ref(Date.now())

const availableCameras = ref<MediaDeviceInfo[]>([])
const selectedCameraId = ref<string>('')
const previewVideo = ref<HTMLVideoElement | null>(null)

const localStream = ref<MediaStream | null>(null)
const peerConnections = ref(new Map<string, RTCPeerConnection>())
const iceQueues = ref(new Map<string, any[]>())

const addLog = (msg: string) => {
  console.log(`[WebRTC] ${msg}`)
}

const processIceQueue = (viewerId: string) => {
  const pc = peerConnections.value.get(viewerId)
  const queue = iceQueues.value.get(viewerId)
  if (!pc || !pc.remoteDescription || !queue) return
  
  while (queue.length > 0) {
    const candidate = queue.shift()
    pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => {
      console.warn(`[WebRTC] Error processing queued candidate for ${viewerId}`, e)
    })
  }
}

const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
}

const initCamera = async () => {
  try {
    const constraints: MediaStreamConstraints = {
      video: selectedCameraId.value ? { deviceId: { exact: selectedCameraId.value } } : true,
      audio: false
    }

    if (localStream.value) {
      localStream.value.getTracks().forEach(t => t.stop())
    }

    addLog('Solicitando acceso a cámara para preview...')
    localStream.value = await navigator.mediaDevices.getUserMedia(constraints)
    
    if (previewVideo.value) {
      previewVideo.value.srcObject = localStream.value
    }
    
    // Replace tracks for ALL active peer connections
    const videoTrack = localStream.value.getVideoTracks()[0]
    if (videoTrack) {
      peerConnections.value.forEach((pc) => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video')
        if (sender) sender.replaceTrack(videoTrack)
      })
    }
  } catch (e) {
    console.error('[Camera] Error initializing camera:', e)
    toast.error('Error al acceder a la cámara')
  }
}

const stopVideoStreaming = () => {
  addLog('Deteniendo todas las transmisiones WebRTC...')
  peerConnections.value.forEach(pc => pc.close())
  peerConnections.value.clear()
  iceQueues.value.clear()
  isStreamingVideo.value = false
}

const initSender = async (viewerId: string) => {
  if (!viewerId) return
  addLog(`Iniciando emisor WebRTC para viewer: ${viewerId}`)
  
  if (!window.isSecureContext) {
    addLog('ERROR: Requiere HTTPS (ngrok https)')
    toast.error('WebRTC requiere una conexión segura (HTTPS)')
    return
  }

  if (!localStream.value) {
    await initCamera()
  }

  if (!localStream.value) {
    addLog('ERROR: No hay stream de video disponible')
    return
  }

  try {
    // Close existing connection if any for THIS viewer
    if (peerConnections.value.has(viewerId)) {
      peerConnections.value.get(viewerId)?.close()
    }

    const pc = new RTCPeerConnection(rtcConfig)
    peerConnections.value.set(viewerId, pc)
    iceQueues.value.set(viewerId, [])
    
    addLog(`RTCPeerConnection creada para ${viewerId}`)

    localStream.value.getTracks().forEach(track => {
      pc.addTrack(track, localStream.value!)
    })

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendWebRTCCandidate(event.candidate, viewerId)
      }
    }
    
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        peerConnections.value.delete(viewerId)
        iceQueues.value.delete(viewerId)
      }
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    sendWebRTCOffer(offer, viewerId)
    addLog(`Oferta enviada a ${viewerId}`)
    isStreamingVideo.value = true
  } catch (e: any) {
    addLog(`Error en emisor para ${viewerId}: ${e.message}`)
    console.error(`[WebRTC] Error starting sender for ${viewerId}:`, e)
  }
}

const getCameras = async () => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    availableCameras.value = devices.filter(d => d.kind === 'videoinput')
    if (availableCameras.value.length && !selectedCameraId.value) {
      selectedCameraId.value = availableCameras.value[0].deviceId
    }
  } catch (e) {
    console.error('[WebRTC] Error listing cameras:', e)
  }
}

const switchCamera = async () => {
  await initCamera()
}

const TRANSITION_WORDS = [
  'Ahora', 'Miren', 'Escuchen', 'Pero', 'Entonces', 'Dice', 
  'Finalmente', 'Así que', 'O sea', 'Por ejemplo', 'En fin'
]

const isSomeoneElseTranscribing = computed(() => transcription.value.producing && !isLocalProducer.value)

const inactivityTimer = ref<NodeJS.Timeout | null>(null)
const audioContext = ref<AudioContext | null>(null)
const analyser = ref<AnalyserNode | null>(null)
const microphone = ref<MediaStreamAudioSourceNode | null>(null)
const currentVolume = ref(0)
const lastActiveTime = ref(Date.now())

// Puntos para saltos de línea
const PUNCTUATION_PAUSE = 5000 
const SILENCE_THRESHOLD = 0.05 
const MAX_PARAGRAPH_LENGTH = 160 // Mucho más corto para legibilidad en móviles
const INACTIVITY_FLUSH = 10000 

const resetInactivityTimer = () => {
  if (inactivityTimer.value) clearTimeout(inactivityTimer.value)
  if (isTranscribing.value) {
    inactivityTimer.value = setTimeout(() => {
      console.log('[STT] Inactividad prolongada detectada. Cerrando párrafo...')
      commitInterim()
      if (recognition.value) {
        recognition.value.stop() 
      }
    }, INACTIVITY_FLUSH)
  }
}

const currentRawInterim = ref('')
const punctuatedInterim = ref('')
const lastPunctuatedWordCount = ref(0)
const isPunctuatingInterim = ref(false)
const isRestarting = ref(false)

const commitInterim = () => {
  // Al cerrar sesión o inactividad larga, horneamos lo que quede en el buffer
  if (activeParagraphPunctuated.value.trim()) {
    const p = activeParagraphPunctuated.value.trim()
    const capitalized = p.charAt(0).toUpperCase() + p.slice(1)
    consolidatedText.value += (consolidatedText.value ? '\n\n' : '') + capitalized
    
    activeParagraphRaw.value = ''
    activeParagraphPunctuated.value = ''
  }

  currentRawInterim.value = ''
  interimTranscript.value = ''
  punctuatedInterim.value = ''
  lastPunctuatedWordCount.value = 0
  
  fullHistory.value = consolidatedText.value
  finalTranscript.value = fullHistory.value
  updateTranscription({ final: finalTranscript.value, interim: '' })
}

const requestPunctuation = async (text: string) => {
  if (!text.trim()) return ''
  try {
    const data = await useApi().post<{text: string}>('/api/punctuate', { text })
    return data?.text || text
  } catch (e) {
    return text
  }
}

const checkBrowser = () => {
  const ua = navigator.userAgent.toLowerCase()
  const isChrome = /chrome/.test(ua) && !/edge|opr/.test(ua)
  const isSafari = /safari/.test(ua) && !/chrome/.test(ua)
  isSupportedBrowser.value = isChrome || isSafari
}

const initRecognition = () => {
  if (!import.meta.client) return
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  
  if (!SpeechRecognition) {
    toast.error('API de voz no disponible')
    return
  }

  recognition.value = new SpeechRecognition()
  recognition.value.continuous = true
  recognition.value.interimResults = true
  recognition.value.lang = 'es-ES'

  // VAD analysis removed to avoid aggressive cut-offs
  // Using native SpeechRecognition continuous mode and a more relaxed inactivity timer instead


  recognition.value.onstart = () => {
    isTranscribing.value = true
    isLocalProducer.value = true
    errorCount.value = 0
    setTranscriptionProducing(true)
    resetInactivityTimer()
  }

  recognition.value.onresult = async (event: any) => {
    if (isRestarting.value) return // Ignorar resultados mientras reiniciamos
    
    resetInactivityTimer()
    let rawInterim = ''
    let newFinal = ''
    
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        newFinal += event.results[i][0].transcript
      } else {
        rawInterim += event.results[i][0].transcript
      }
    }

    // Process Final text (Continuous refinement)
    if (newFinal) {
      const now = Date.now()
      const silenceGap = now - lastFinalTimestamp.value
      lastFinalTimestamp.value = now

      // 1. Acumulamos en el párrafo activo
      const trimmedNew = newFinal.trim()
      activeParagraphRaw.value += (activeParagraphRaw.value ? ' ' : '') + trimmedNew
      
      // 2. Pedimos puntuación
      const currentRaw = activeParagraphRaw.value
      requestPunctuation(currentRaw).then(pFinal => {
        if (currentRaw !== activeParagraphRaw.value) return 

        let processed = pFinal.trim()
        processed = processed.replace(/([.!?]\s+)([a-z])/g, (match, p1, p2) => p1 + p2.toUpperCase())
        processed = processed.charAt(0).toUpperCase() + processed.slice(1)

        activeParagraphPunctuated.value = processed
        
        // 3. Lógica de Salto de Párrafo Híbrida y PROACTIVA
        // Dividimos el buffer en oraciones para ver si podemos "soltar" párrafos ya terminados
        const sentences = activeParagraphPunctuated.value.match(/[^.!?]+[.!?](\s+|$)/g) || []
        
        if (sentences.length > 1) {
          let currentParagraphSize = 0
          let splitIndex = -1

          for (let i = 0; i < sentences.length; i++) {
            currentParagraphSize += sentences[i].length
            // Si este conjunto de oraciones ya es suficientemente largo, o hay una pausa natural
            if (currentParagraphSize > MAX_PARAGRAPH_LENGTH || silenceGap > 1500) {
              splitIndex = i
              break
            }
          }

          // Si encontramos un punto de corte (no al final del todo)
          if (splitIndex !== -1 && splitIndex < sentences.length - 1) {
            const head = sentences.slice(0, splitIndex + 1).join('').trim()
            const tail = sentences.slice(splitIndex + 1).join('').trim()
            
            consolidatedText.value += (consolidatedText.value ? '\n\n' : '') + head
            activeParagraphRaw.value = tail // El resto vuelve a ser el buffer crudo
            activeParagraphPunctuated.value = tail
          }
        }

        // 4. Verificación final (por si el orador se calla o el buffer es corto pero termina)
        const isLongEnough = activeParagraphPunctuated.value.length > MAX_PARAGRAPH_LENGTH
        const endsInDot = /[.!?]$/.test(activeParagraphPunctuated.value)
        const startOfNew = trimmedNew.charAt(0).toUpperCase() + trimmedNew.slice(1)
        const startsWithTransition = TRANSITION_WORDS.some(word => startOfNew.startsWith(word))
        const isNaturalPause = silenceGap > 1500 

        if ((isLongEnough && endsInDot) || (isNaturalPause && endsInDot) || (startsWithTransition && sentences.length > 1)) {
          consolidatedText.value += (consolidatedText.value ? '\n\n' : '') + activeParagraphPunctuated.value
          activeParagraphRaw.value = ''
          activeParagraphPunctuated.value = ''
        }

        // 5. Actualizar el estado global
        const currentActive = activeParagraphPunctuated.value
        fullHistory.value = consolidatedText.value + (consolidatedText.value && currentActive ? '\n\n' : '') + currentActive
        finalTranscript.value = fullHistory.value
        updateTranscription({ final: finalTranscript.value, interim: interimTranscript.value })
      })

      // Reset interim tracking
      punctuatedInterim.value = ''
      lastPunctuatedWordCount.value = 0
      currentRawInterim.value = ''
      interimTranscript.value = ''
    }

    // Process Interim text smoothly
    if (rawInterim) {
      currentRawInterim.value = rawInterim
      
      const rawWords = rawInterim.trim().split(/\s+/).filter(Boolean)
      
      // Construct the display string (Punctuated base + fresh raw words)
      let displayInterim = rawInterim
      if (punctuatedInterim.value) {
        const pWords = punctuatedInterim.value.trim().split(/\s+/).filter(Boolean)
        const newRawWords = rawWords.slice(lastPunctuatedWordCount.value)
        displayInterim = [...pWords, ...newRawWords].join(' ')
      }
      
      interimTranscript.value = displayInterim
      updateTranscription({ final: finalTranscript.value, interim: displayInterim })
    }
  }

  // Debounced interim punctuation
  watchDebounced(currentRawInterim, (newVal) => {
    if (!newVal.trim() || isPunctuatingInterim.value) return
    
    const rawWords = newVal.trim().split(/\s+/).filter(Boolean)
    const wordCount = rawWords.length
    
    // Trigger punctuation if word count has changed
    if (wordCount > lastPunctuatedWordCount.value) {
      isPunctuatingInterim.value = true
      const countAtRequest = wordCount
      
      requestPunctuation(newVal).then(punctuated => {
        punctuatedInterim.value = punctuated
        lastPunctuatedWordCount.value = countAtRequest
        isPunctuatingInterim.value = false
        
        // Re-sync display instantly with any new words spoken during the network request
        const latestRawWords = currentRawInterim.value.trim().split(/\s+/).filter(Boolean)
        const latestPWords = punctuated.trim().split(/\s+/).filter(Boolean)
        const trailingRaw = latestRawWords.slice(countAtRequest)
        const newDisplay = [...latestPWords, ...trailingRaw].join(' ')
        
        interimTranscript.value = newDisplay
        updateTranscription({ final: finalTranscript.value, interim: newDisplay })
      })
    }
  }, { debounce: 300 })

  recognition.value.onerror = (event: any) => {
    console.error('[STT] Error:', event.error)
    isTranscribing.value = false
    setTranscriptionProducing(false)
    if (inactivityTimer.value) clearTimeout(inactivityTimer.value)
    
    if (event.error !== 'not-allowed' && isUserActive.value && errorCount.value < maxErrors) {
      errorCount.value++
      setTimeout(() => startRecognition(), 1000)
    }
  }

  recognition.value.onend = () => {
    isTranscribing.value = false
    isLocalProducer.value = false
    isRestarting.value = false // Permitir nuevos resultados al terminar la sesión
    if (inactivityTimer.value) clearTimeout(inactivityTimer.value)
    
    if (isUserActive.value && errorCount.value < maxErrors) {
      startRecognition()
    } else {
      setTranscriptionProducing(false)
    }
  }
}

const isUserActive = ref(false)

const startRecognition = () => {
  if (!recognition.value) initRecognition()
  isUserActive.value = true
  try { recognition.value.start() } catch (e) {}
}

const startAudioAnalysis = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    audioContext.value = new (window.AudioContext || (window as any).webkitAudioContext)()
    analyser.value = audioContext.value.createAnalyser()
    microphone.value = audioContext.value.createMediaStreamSource(stream)
    microphone.value.connect(analyser.value)
    
    analyser.value.fftSize = 256
    const bufferLength = analyser.value.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const analyze = () => {
      if (!analyser.value || !isTranscribing.value) return
      analyser.value.getByteFrequencyData(dataArray)
      
      let sum = 0
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i]
      }
      const average = sum / bufferLength
      currentVolume.value = average / 128 // Normalize to 0-1 approx
      
      requestAnimationFrame(analyze)
    }
    analyze()
  } catch (e) {
    console.error('[Audio] Error starting analysis:', e)
  }
}

const stopAudioAnalysis = () => {
  if (microphone.value) {
    microphone.value.disconnect()
    microphone.value = null
  }
  if (audioContext.value) {
    audioContext.value.close()
    audioContext.value = null
  }
  analyser.value = null
  currentVolume.value = 0
}

const toggleTranscription = () => {
  if (isSomeoneElseTranscribing.value) return

  if (isTranscribing.value) {
    isUserActive.value = false
    recognition.value?.stop()
    isLocalProducer.value = false
    setTranscriptionProducing(false)
    stopAudioAnalysis()
    if (inactivityTimer.value) clearTimeout(inactivityTimer.value)
  } else {
    startRecognition()
    startAudioAnalysis()
  }
}

const toggleVideoStreaming = async () => {
  if (isStreamingVideo.value) {
    stopVideoStreaming()
  } else {
    // If not streaming, we don't have a target yet, 
    // but we can set the flag so new requests are accepted
    isStreamingVideo.value = true
    addLog('Modo transmisión activado, esperando peticiones...')
    // We also broadcast a request to see if anyone wants to connect
    sendWebRTCRequest()
  }
}

// Auto-scroll the history container
const historyContainer = ref<HTMLElement | null>(null)
watch([
  () => fullHistory.value, 
  () => interimTranscript.value,
  () => transcription.value.final,
  () => transcription.value.interim
], () => {
  nextTick(() => {
    if (historyContainer.value) {
      historyContainer.value.scrollTop = historyContainer.value.scrollHeight
    }
  })
})

onMounted(() => {
  checkBrowser()
  if (isSupportedBrowser.value) {
    connect()
    initRecognition()
    getCameras()
    initCamera()
  }

  onWebRTCRequest.value = ({ from }) => {
    addLog(`Petición de stream recibida de ${from}`)
    if (isStreamingVideo.value) {
      initSender(from)
    }
  }

  onWebRTCAnswer.value = ({ data: answer, from }) => {
    const pc = peerConnections.value.get(from)
    if (pc && pc.signalingState === 'have-local-offer') {
      addLog(`Respuesta WebRTC recibida de ${from}`)
      pc.setRemoteDescription(new RTCSessionDescription(answer)).then(() => {
        addLog(`Descripción remota establecida para ${from}`)
        processIceQueue(from)
      }).catch(e => {
        addLog(`Error setRemote para ${from}: ${e.message}`)
      })
    }
  }

  onWebRTCCandidate.value = ({ data: candidate, from }) => {
    const pc = peerConnections.value.get(from)
    if (pc && pc.remoteDescription && candidate) {
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => {
        addLog(`Error ICE para ${from}: ${e.message}`)
      })
    } else if (candidate) {
      let queue = iceQueues.value.get(from)
      if (!queue) {
        queue = []
        iceQueues.value.set(from, queue)
      }
      queue.push(candidate)
    }
  }
})

// Log when transcription state changes for debugging
watch(transcription, (newVal) => {
}, { deep: true })

onUnmounted(() => {
  recognition.value?.stop()
  setTranscriptionProducing(false)
  if (inactivityTimer.value) clearTimeout(inactivityTimer.value)
  peerConnections.value.forEach(pc => pc.close())
  if (localStream.value) {
    localStream.value.getTracks().forEach(t => t.stop())
  }
})

definePageMeta({
  layout: false
})
</script>

<template>
  <div class="min-h-screen bg-neutral-50 text-neutral-900 font-sans p-4 sm:p-8 flex flex-col items-center justify-center">
    <div v-if="!isSupportedBrowser" class="h-full flex items-center justify-center">
      <div class="p-8 border border-red-200 bg-red-50 rounded-3xl max-w-sm text-center">
        <Icon name="tabler:browser-off" class="size-12 text-red-500 mb-4 mx-auto" />
        <h1 class="text-xl font-bold mb-2">Usar Chrome o Safari</h1>
        <p class="text-sm text-neutral-500">Este sistema solo funciona en navegadores con soporte oficial de Web Speech API.</p>
      </div>
    </div>

    <div v-else class="h-[90vh] w-full max-w-[1600px] mx-auto flex flex-col lg:flex-row gap-8">
      
      <!-- Sidebar: Controls & Preview -->
      <aside class="w-full lg:w-[400px] flex flex-col gap-6 shrink-0 h-full overflow-y-auto pr-2">
        
        <!-- Header -->
        <header class="space-y-4">
          <div class="flex items-center justify-between">
            <h1 class="text-3xl font-black tracking-tighter text-neutral-900 uppercase">STT LIVE</h1>
            <div class="flex items-center gap-1.5 px-2 py-0.5 bg-neutral-100 rounded-full border border-neutral-200">
              <div class="size-1.5 rounded-full" :class="isConnected ? 'bg-green-500' : 'bg-red-500'"></div>
              <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-500">{{ isConnected ? 'Online' : 'Offline' }}</span>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <div class="flex items-center gap-1.5 px-3 py-1 bg-white rounded-full border border-neutral-200 cursor-pointer hover:bg-neutral-50 transition-colors" @click="isManualConnectionTrigger = true">
              <Icon name="tabler:id" class="size-3.5 text-blue-600" />
              <span class="text-[10px] font-bold uppercase tracking-widest text-neutral-600">
                {{ clientId?.length > 15 ? clientId.substring(0, 8) + '...' : clientId }}
              </span>
            </div>
            <div v-if="isTranscribing || isStreamingVideo" class="flex items-center gap-1.5 px-2 py-1 bg-blue-50 rounded-full border border-blue-100">
              <div class="size-1.5 bg-blue-600 rounded-full animate-pulse"></div>
              <span class="text-[9px] font-black uppercase tracking-widest text-blue-600">Transmitiendo</span>
            </div>
          </div>
        </header>

        <!-- Video Preview Area -->
        <div class="relative group aspect-video w-full bg-black rounded-[2rem] overflow-hidden shadow-2xl ring-1 ring-neutral-200">
           <video 
             ref="previewVideo" 
             autoplay 
             muted 
             playsinline 
             class="w-full h-full object-cover"
           ></video>
           <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex items-end p-6">
              <div class="flex items-center gap-2">
                <div class="size-2 rounded-full animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.8)]" :class="isStreamingVideo ? 'bg-red-500' : 'bg-blue-500'"></div>
                <span class="text-[10px] font-black text-white uppercase tracking-[0.2em]">{{ isStreamingVideo ? 'En Vivo (WebRTC)' : 'Vista Previa Local' }}</span>
              </div>
           </div>
        </div>

        <!-- Camera Selector -->
        <div class="flex items-center gap-3 bg-white p-2 rounded-2xl border border-neutral-200 shadow-sm">
          <div class="size-10 bg-neutral-50 rounded-xl flex items-center justify-center text-neutral-400">
            <Icon name="tabler:video" class="size-5" />
          </div>
          <div class="flex-1 min-w-0 relative">
            <select 
              v-model="selectedCameraId"
              @change="switchCamera"
              class="w-full bg-transparent border-none py-1 pr-8 text-[11px] font-bold uppercase tracking-widest text-neutral-600 focus:ring-0 outline-none appearance-none cursor-pointer truncate"
            >
              <option v-for="cam in availableCameras" :key="cam.deviceId" :value="cam.deviceId">
                {{ cam.label || `Cámara ${availableCameras.indexOf(cam) + 1}` }}
              </option>
            </select>
            <Icon name="tabler:chevron-down" class="absolute right-2 top-1/2 -translate-y-1/2 size-4 text-neutral-400 pointer-events-none" />
          </div>
        </div>

        <!-- Actions -->
        <div class="grid grid-cols-1 gap-3">
          <!-- Video Toggle -->
          <button 
            @click="toggleVideoStreaming"
            class="group flex items-center justify-between px-6 py-5 rounded-[1.5rem] border-2 transition-all font-black uppercase tracking-widest text-xs"
            :class="isStreamingVideo ? 'border-red-500 bg-red-50 text-red-600 shadow-lg shadow-red-100' : 'border-neutral-200 bg-white text-neutral-400 hover:border-neutral-300 hover:text-neutral-600'"
          >
            <div class="flex items-center gap-4">
              <Icon :name="isStreamingVideo ? 'tabler:video-off' : 'tabler:video'" class="size-6" />
              <div class="text-left">
                <div class="leading-none">Transmisión Video</div>
                <div class="text-[9px] font-bold opacity-60 mt-1">{{ isStreamingVideo ? 'Transmitiendo cámara' : 'WebRTC desactivado' }}</div>
              </div>
            </div>
            <Icon name="tabler:arrow-right" class="size-4 opacity-0 group-hover:opacity-100 transition-all" />
          </button>

          <!-- Audio/Transcription Toggle -->
          <button 
            @click="toggleTranscription"
            :disabled="isSomeoneElseTranscribing"
            class="group flex items-center justify-between px-6 py-5 rounded-[1.5rem] border-2 transition-all font-black uppercase tracking-widest text-xs"
            :class="[
              isTranscribing 
                ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-200' 
                : 'border-neutral-200 bg-white text-neutral-400 hover:border-neutral-300 hover:text-neutral-600',
              isSomeoneElseTranscribing ? 'opacity-50 cursor-not-allowed bg-neutral-100 grayscale' : ''
            ]"
          >
            <div class="flex items-center gap-4">
              <Icon :name="isTranscribing ? 'tabler:microphone' : 'tabler:microphone-off'" class="size-6" />
              <div class="text-left">
                <div class="leading-none">Transcripción Voz</div>
                <div class="text-[9px] font-bold opacity-60 mt-1">{{ isTranscribing ? 'Escuchando ahora' : 'Micrófono apagado' }}</div>
              </div>
            </div>
            
            <!-- Volume Meter -->
            <div v-if="isTranscribing" class="w-12 h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div 
                class="h-full bg-white transition-all duration-75" 
                :style="{ width: `${currentVolume * 100}%` }"
              ></div>
            </div>
            <Icon v-else name="tabler:arrow-right" class="size-4 opacity-0 group-hover:opacity-100 transition-all" />
          </button>
        </div>

        <div v-if="isSomeoneElseTranscribing" class="p-4 bg-orange-50 border border-orange-100 rounded-2xl text-center">
          <p class="text-[10px] font-black uppercase tracking-widest text-orange-600">Alguien más está transcribiendo</p>
        </div>

      </aside>

      <!-- Main Content: Transcription History -->
      <main class="flex-1 flex flex-col min-h-0 bg-white rounded-[3rem] border border-neutral-200 shadow-xl overflow-hidden relative">
        
        <!-- Decoration -->
        <div class="absolute top-8 left-10 flex items-center gap-3 pointer-events-none z-10">
           <div class="size-8 bg-neutral-50 rounded-xl flex items-center justify-center">
             <Icon name="tabler:history" class="size-4 text-neutral-400" />
           </div>
           <div>
             <span class="block text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">Registro en Tiempo Real</span>
             <span class="block text-[9px] font-bold text-neutral-300">Puntuación automática activa</span>
           </div>
        </div>

        <!-- History Container -->
        <div 
          ref="historyContainer"
          class="flex-1 overflow-y-auto px-10 pt-28 pb-10 scroll-smooth"
        >
          <div 
            v-if="!(isSomeoneElseTranscribing ? (transcription.final || transcription.interim) : (fullHistory || interimTranscript))" 
            class="h-full flex flex-col items-center justify-center text-neutral-200"
          >
             <Icon name="tabler:ear" class="size-20 mb-6 opacity-30" />
             <p class="text-sm font-black uppercase tracking-[0.3em] text-center max-w-xs">
               {{ isSomeoneElseTranscribing ? 'Esperando señal del orador...' : 'Inicia la transcripción para capturar voz' }}
             </p>
          </div>
          
          <div v-else class="max-w-4xl">
            <p class="text-3xl sm:text-4xl font-medium leading-relaxed text-neutral-700 whitespace-pre-wrap">
              <span>{{ isSomeoneElseTranscribing ? transcription.final : fullHistory }}</span>
              <span v-if="isSomeoneElseTranscribing ? transcription.interim : interimTranscript" class="text-blue-600 ml-2 italic underline decoration-blue-200 decoration-4 underline-offset-8">{{ isSomeoneElseTranscribing ? transcription.interim : interimTranscript }}</span>
            </p>
          </div>
        </div>      </main>

    </div>
  </div>
</template>
