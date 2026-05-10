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
  sendWebRTCCandidate
} = useRealtime()
const { clientId, isManualConnectionTrigger } = useApi()

const isSupportedBrowser = ref(false)
const isTranscribing = ref(false)
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
const showCamera = ref(false)

const localStream = ref<MediaStream | null>(null)
const pc = ref<RTCPeerConnection | null>(null)
const rtcLogs = ref<string[]>([])

const addLog = (msg: string) => {
  const time = new Date().toLocaleTimeString()
  rtcLogs.value.unshift(`[${time}] ${msg}`)
  if (rtcLogs.value.length > 20) rtcLogs.value.pop()
}

const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
}

const initSender = async () => {
  addLog('Iniciando emisor WebRTC...')
  
  if (!window.isSecureContext) {
    addLog('ERROR: Requiere HTTPS (ngrok https)')
    toast.error('WebRTC requiere una conexión segura (HTTPS)')
    return
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    addLog('ERROR: MediaDevices no disponible')
    return
  }

  try {
    const constraints: MediaStreamConstraints = {
      video: {
        deviceId: selectedCameraId.value ? { exact: selectedCameraId.value } : undefined,
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 24 }
      },
      audio: false
    }

    if (localStream.value) {
       localStream.value.getTracks().forEach(t => t.stop())
    }

    addLog('Solicitando acceso a cámara...')
    localStream.value = await navigator.mediaDevices.getUserMedia(constraints)
    addLog('Cámara accedida con éxito')
    
    if (previewVideo.value) {
      previewVideo.value.srcObject = localStream.value
    }

    if (pc.value) pc.value.close()
    pc.value = new RTCPeerConnection(rtcConfig)
    addLog('RTCPeerConnection creada')

    localStream.value.getTracks().forEach(track => {
      pc.value?.addTrack(track, localStream.value!)
    })

    pc.value.onicecandidate = (event) => {
      if (event.candidate) {
        addLog('Candidato ICE generado')
        sendWebRTCCandidate(event.candidate)
      }
    }

    const offer = await pc.value.createOffer()
    addLog('Oferta WebRTC creada')
    await pc.value.setLocalDescription(offer)
    sendWebRTCOffer(offer)
    addLog('Oferta enviada vía Socket')
  } catch (e: any) {
    addLog(`Error en emisor: ${e.message}`)
    console.error('[WebRTC] Error starting sender:', e)
    toast.error('Error al acceder a la cámara')
  }
}

const getCameras = async () => {
  try {
    // Request permission first to get labels
    await navigator.mediaDevices.getUserMedia({ video: true })
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
  if (isTranscribing.value) {
    await initSender()
  } else if (showCamera.value) {
    // Just update preview
    const constraints = {
      video: { deviceId: { exact: selectedCameraId.value } },
      audio: false
    }
    if (localStream.value) localStream.value.getTracks().forEach(t => t.stop())
    localStream.value = await navigator.mediaDevices.getUserMedia(constraints)
    if (previewVideo.value) previewVideo.value.srcObject = localStream.value
  }
}

const toggleCamera = async () => {
  showCamera.value = !showCamera.value
  if (showCamera.value) {
    await getCameras()
    const constraints = {
      video: selectedCameraId.value ? { deviceId: { exact: selectedCameraId.value } } : true,
      audio: false
    }
    localStream.value = await navigator.mediaDevices.getUserMedia(constraints)
    nextTick(() => {
      if (previewVideo.value) previewVideo.value.srcObject = localStream.value
    })
  } else if (!isTranscribing.value) {
    if (localStream.value) localStream.value.getTracks().forEach(t => t.stop())
    localStream.value = null
  }
}

const TRANSITION_WORDS = [
  'Ahora', 'Miren', 'Escuchen', 'Pero', 'Entonces', 'Dice', 
  'Finalmente', 'Así que', 'O sea', 'Por ejemplo', 'En fin'
]

const { transcription } = useRealtime()
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
    
    // Iniciar video automáticamente
    nextTick(() => {
      initSender()
    })
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
  }

  onWebRTCRequest.value = () => {
    addLog('Petición de stream recibida')
    if (isTranscribing.value) {
      initSender()
    }
  }

  onWebRTCAnswer.value = (answer) => {
    addLog('Respuesta WebRTC recibida')
    if (pc.value) {
      pc.value.setRemoteDescription(new RTCSessionDescription(answer))
      addLog('Descripción remota establecida')
    }
  }

  onWebRTCCandidate.value = (candidate) => {
    if (pc.value && candidate) {
      pc.value.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => {
        addLog(`Error ICE: ${e.message}`)
        console.error('[WebRTC] Error adding ice candidate:', e)
      })
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
  if (pc.value) pc.value.close()
  if (localStream.value) {
    localStream.value.getTracks().forEach(t => t.stop())
  }
})

definePageMeta({
  layout: false
})
</script>

<template>
  <div class="min-h-screen bg-white text-neutral-900 font-sans flex flex-col items-center justify-center p-6">
    <div v-if="!isSupportedBrowser" class="p-8 border border-red-200 bg-red-50 rounded-3xl max-w-sm text-center">
      <Icon name="tabler:browser-off" class="size-12 text-red-500 mb-4 mx-auto" />
      <h1 class="text-xl font-bold mb-2">Usar Chrome o Safari</h1>
      <p class="text-sm text-neutral-500">Este sistema solo funciona en navegadores con soporte oficial de Web Speech API.</p>
    </div>

    <div v-else class="w-full max-w-3xl flex flex-col h-[85vh]">
      
      <!-- Header Area -->
      <header class="mb-10 flex flex-col sm:flex-row items-center justify-between gap-6 shrink-0">
        <div class="space-y-2 text-center sm:text-left">
          <h1 class="text-3xl sm:text-4xl font-black tracking-tight text-neutral-900 uppercase leading-none">
            Generador STT
          </h1>
          <div class="flex flex-wrap items-center justify-center sm:justify-start gap-3">
            <div class="flex items-center gap-1.5 px-2 py-0.5 bg-neutral-100 rounded-full border border-neutral-200">
              <div class="size-1.5 rounded-full" :class="isConnected ? 'bg-green-500' : 'bg-red-500'"></div>
              <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-500">{{ isConnected ? 'Socket Activo' : 'Offline' }}</span>
            </div>
            <div class="flex items-center gap-1.5 px-3 py-1 bg-neutral-100 rounded-full border border-neutral-200 cursor-pointer hover:bg-neutral-200 transition-colors" @click="isManualConnectionTrigger = true" title="Cambiar ID de Cliente">
              <Icon name="tabler:id" class="size-3.5 text-blue-600" />
              <span class="text-[10px] font-bold uppercase tracking-widest text-neutral-600">
                {{ clientId?.length > 15 ? clientId.substring(0, 8) + '...' : clientId }}
              </span>
            </div>
            <div v-if="isTranscribing" class="flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 rounded-full border border-blue-100">
              <div class="size-1.5 bg-blue-600 rounded-full animate-pulse"></div>
              <span class="text-[9px] font-black uppercase tracking-widest text-blue-600">En vivo</span>
            </div>
          </div>
        </div>

        <!-- Volume Meter / VAD Indicator -->
        <div v-if="isTranscribing" class="flex items-center gap-2 px-3 py-1 bg-neutral-100 rounded-full border border-neutral-200">
          <Icon name="tabler:inner-shadow-top-left" class="size-3 text-neutral-400" />
          <div class="w-16 h-1 bg-neutral-200 rounded-full overflow-hidden">
            <div 
              class="h-full transition-all duration-75" 
              :class="currentVolume > SILENCE_THRESHOLD ? 'bg-green-500' : 'bg-neutral-400'"
              :style="{ width: `${currentVolume * 100}%` }"
            ></div>
          </div>
        </div>

        <button 
          @click="toggleTranscription"
          :disabled="isSomeoneElseTranscribing"
          class="flex items-center gap-3 px-6 py-3 rounded-full border-2 transition-all font-black uppercase tracking-[0.1em] text-sm shrink-0"
          :class="[
            isTranscribing 
              ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-[0_0_20px_rgba(37,99,235,0.2)]' 
              : 'border-neutral-200 bg-white text-neutral-400 hover:border-neutral-300 hover:text-neutral-600',
            isSomeoneElseTranscribing ? 'opacity-50 cursor-not-allowed bg-neutral-100 grayscale' : ''
          ]"
        >
          <Icon :name="isSomeoneElseTranscribing ? 'tabler:eye' : (isTranscribing ? 'tabler:microphone' : 'tabler:microphone-off')" class="size-5" />
          {{ isSomeoneElseTranscribing ? 'Modo Espectador' : (isTranscribing ? 'Detener' : 'Iniciar') }}
        </button>
      </header>

      <!-- Camera Preview & Selector -->
      <Transition
        enter-active-class="transition duration-500 ease-out"
        enter-from-class="opacity-0 -translate-y-4 scale-95"
        enter-to-class="opacity-100 translate-y-0 scale-100"
        leave-active-class="transition duration-300 ease-in"
        leave-from-class="opacity-100 translate-y-0 scale-100"
        leave-to-class="opacity-0 -translate-y-4 scale-95"
      >
        <div v-if="isTranscribing || showCamera" class="mb-10 flex flex-col items-center gap-6 shrink-0">
          <div class="relative group aspect-video w-72 bg-black rounded-3xl overflow-hidden shadow-2xl ring-1 ring-neutral-200">
             <video 
               ref="previewVideo" 
               autoplay 
               muted 
               playsinline 
               class="w-full h-full object-cover scale-x-[-1]"
             ></video>
             <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex items-end p-4">
                <div class="flex items-center gap-2">
                  <div class="size-2 bg-blue-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.8)]"></div>
                  <span class="text-[10px] font-black text-white uppercase tracking-[0.2em]">Vista Previa Local</span>
                </div>
             </div>
          </div>
          
          <div class="flex items-center gap-3 bg-neutral-100 p-1.5 rounded-2xl border border-neutral-200 w-full max-w-xs shadow-sm">
            <div class="size-8 bg-white rounded-xl flex items-center justify-center text-neutral-400 shadow-sm">
              <Icon name="tabler:video" class="size-4" />
            </div>
            <div class="flex-1 min-w-0 relative">
              <select 
                v-model="selectedCameraId"
                @change="switchCamera"
                class="w-full bg-transparent border-none py-1 pr-8 text-[10px] font-black uppercase tracking-widest text-neutral-600 focus:ring-0 outline-none appearance-none cursor-pointer truncate"
              >
                <option v-for="cam in availableCameras" :key="cam.deviceId" :value="cam.deviceId">
                  {{ cam.label || `Cámara ${availableCameras.indexOf(cam) + 1}` }}
                </option>
              </select>
              <Icon name="tabler:chevron-down" class="absolute right-2 top-1/2 -translate-y-1/2 size-3 text-neutral-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </Transition>

      <div v-if="!isTranscribing" class="mb-10 flex justify-center">
         <button 
           @click="toggleCamera"
           class="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] transition-all"
           :class="showCamera ? 'bg-blue-600 text-white shadow-lg' : 'bg-neutral-100 text-neutral-400 hover:bg-neutral-200'"
         >
           <Icon :name="showCamera ? 'tabler:video-off' : 'tabler:video'" class="size-4" />
           {{ showCamera ? 'Ocultar Cámara' : 'Configurar Cámara' }}
         </button>
      </div>

      <!-- History & Live Text Area -->
      <div 
        class="flex-1 bg-neutral-50 rounded-[2rem] border border-neutral-200 p-8 flex flex-col overflow-hidden relative shadow-inner"
      >
        <div class="absolute top-6 left-8 flex items-center gap-2 pointer-events-none">
           <Icon name="tabler:history" class="size-4 text-neutral-300" />
           <span class="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Registro Completo</span>
        </div>

        <div 
          ref="historyContainer"
          class="flex-1 overflow-y-auto mt-6 pr-4 scroll-smooth"
        >
          <div 
            v-if="!(isSomeoneElseTranscribing ? (transcription.final || transcription.interim) : (fullHistory || interimTranscript))" 
            class="h-full flex flex-col items-center justify-center text-neutral-300"
          >
             <Icon name="tabler:ear" class="size-12 mb-4 opacity-50" />
             <p class="text-xs font-bold uppercase tracking-widest text-center px-4">
               {{ isSomeoneElseTranscribing ? 'El orador está en silencio o esperando audio...' : (isTranscribing ? 'Esperando audio...' : 'Listo para iniciar') }}
             </p>
          </div>
          
          <p v-else class="text-2xl sm:text-3xl font-medium leading-relaxed text-neutral-700 whitespace-pre-wrap">
            <span>{{ isSomeoneElseTranscribing ? transcription.final : fullHistory }}</span>
            <span v-if="isSomeoneElseTranscribing ? transcription.interim : interimTranscript" class="text-blue-600 ml-1 italic">{{ isSomeoneElseTranscribing ? transcription.interim : interimTranscript }}</span>
          </p>
        </div>

        <!-- WebRTC Logs -->
        <div v-if="rtcLogs.length" class="mt-4 p-3 bg-neutral-100 rounded-xl border border-neutral-200 font-mono text-[9px] text-neutral-500 overflow-y-auto max-h-24">
           <div v-for="(log, i) in rtcLogs" :key="i" class="mb-1 last:mb-0 border-b border-neutral-200/50 pb-1">
             {{ log }}
           </div>
        </div>
      </div>

    </div>
  </div>
</template>
