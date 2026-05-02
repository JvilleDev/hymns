<script setup lang="ts">
import { toast } from 'vue-sonner'
import { watchDebounced } from '@vueuse/core'

const { connect, updateTranscription, setTranscriptionProducing, isConnected } = useRealtime()
const { clientId, isManualConnectionTrigger } = useApi()

const isSupportedBrowser = ref(false)
const isTranscribing = ref(false)
const recognition = ref<any>(null)
const interimTranscript = ref('')
const finalTranscript = ref('')
const fullHistory = ref('')
const errorCount = ref(0)
const maxErrors = 10

const inactivityTimer = ref<NodeJS.Timeout | null>(null)
const audioContext = ref<AudioContext | null>(null)
const analyser = ref<AnalyserNode | null>(null)
const microphone = ref<MediaStreamAudioSourceNode | null>(null)
const currentVolume = ref(0)
const lastActiveTime = ref(Date.now())

// Configuración de VAD (Voice Activity Detection)
const SILENCE_THRESHOLD = 0.15 // Ajusta esto si el micro tiene mucho ruido de fondo
const SILENCE_DURATION = 250   // Milisegundos de silencio para forzar el cierre

const resetInactivityTimer = () => {
  if (inactivityTimer.value) clearTimeout(inactivityTimer.value)
  if (isTranscribing.value) {
    inactivityTimer.value = setTimeout(() => {
      console.log('[STT] Inactividad detectada (3s). Reiniciando instancia...')
      if (recognition.value) {
        commitInterim()
        recognition.value.stop() 
      }
    }, 3000)
  }
}

const currentRawInterim = ref('')
const punctuatedInterim = ref('')
const lastPunctuatedWordCount = ref(0)
const isPunctuatingInterim = ref(false)
const isRestarting = ref(false)

const commitInterim = () => {
  const textToCommit = currentRawInterim.value.trim()
  if (!textToCommit) return
  
  console.log('[STT] Committing interim text:', textToCommit)
  const textAtCommit = textToCommit
  
  // Limpiar estados INSTANTÁNEAMENTE de forma síncrona
  currentRawInterim.value = ''
  interimTranscript.value = ''
  punctuatedInterim.value = ''
  lastPunctuatedWordCount.value = 0
  
  // Procesar puntuación en segundo plano sin bloquear el hilo
  requestPunctuation(textAtCommit).then(pFinal => {
    const space = fullHistory.value && !fullHistory.value.endsWith(' ') ? ' ' : ''
    fullHistory.value += space + pFinal
    finalTranscript.value += space + pFinal
    updateTranscription({ final: finalTranscript.value, interim: '' })
  })
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

  // Setup VAD Audio Analysis
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    audioContext.value = new (window.AudioContext || (window as any).webkitAudioContext)()
    analyser.value = audioContext.value.createAnalyser()
    microphone.value = audioContext.value.createMediaStreamSource(stream)
    
    analyser.value.fftSize = 256
    microphone.value.connect(analyser.value)
    
    const bufferLength = analyser.value.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    
    const checkVolume = () => {
      if (!isTranscribing.value) return
      
      analyser.value?.getByteFrequencyData(dataArray)
      let sum = 0
      for (let i = 0; i < bufferLength; i++) sum += dataArray[i]
      const avg = sum / bufferLength
      currentVolume.value = avg / 255
      
      if (currentVolume.value > SILENCE_THRESHOLD) {
        lastActiveTime.value = Date.now()
      } else {
        const silenceMs = Date.now() - lastActiveTime.value
        if (silenceMs > SILENCE_DURATION && isTranscribing.value) {
          console.log(`[VAD] Silencio detectado (${silenceMs}ms). Forzando cierre...`)
          isRestarting.value = true
          commitInterim()
          recognition.value?.stop()
          lastActiveTime.value = Date.now() 
        }
      }
      
      requestAnimationFrame(checkVolume)
    }
    
    checkVolume()
  }).catch(err => {
    console.error('[VAD] Error accediendo al micro para análisis:', err)
  })

  recognition.value.onstart = () => {
    isTranscribing.value = true
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

    // Process Final text
    if (newFinal) {
      const pFinal = await requestPunctuation(newFinal)
      const space = fullHistory.value && !fullHistory.value.endsWith(' ') ? ' ' : ''
      fullHistory.value += space + pFinal
      finalTranscript.value += space + pFinal
      
      // Reset interim tracking
      punctuatedInterim.value = ''
      lastPunctuatedWordCount.value = 0
      currentRawInterim.value = ''
      interimTranscript.value = ''
      
      updateTranscription({ final: finalTranscript.value, interim: '' })
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

const toggleTranscription = () => {
  if (isTranscribing.value) {
    isUserActive.value = false
    recognition.value?.stop()
    setTranscriptionProducing(false)
    if (inactivityTimer.value) clearTimeout(inactivityTimer.value)
  } else {
    startRecognition()
  }
}

// Auto-scroll the history container
const historyContainer = ref<HTMLElement | null>(null)
watch([() => fullHistory.value, () => interimTranscript.value], () => {
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
  }
})

onUnmounted(() => {
  recognition.value?.stop()
  setTranscriptionProducing(false)
  if (inactivityTimer.value) clearTimeout(inactivityTimer.value)
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
          class="flex items-center gap-3 px-6 py-3 rounded-full border-2 transition-all font-black uppercase tracking-[0.1em] text-sm shrink-0"
          :class="isTranscribing 
            ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-[0_0_20px_rgba(37,99,235,0.2)]' 
            : 'border-neutral-200 bg-white text-neutral-400 hover:border-neutral-300 hover:text-neutral-600'"
        >
          <Icon :name="isTranscribing ? 'tabler:microphone' : 'tabler:microphone-off'" class="size-5" />
          {{ isTranscribing ? 'Detener' : 'Iniciar' }}
        </button>
      </header>

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
          <div v-if="!fullHistory && !interimTranscript" class="h-full flex flex-col items-center justify-center text-neutral-300">
             <Icon name="tabler:ear" class="size-12 mb-4 opacity-50" />
             <p class="text-xs font-bold uppercase tracking-widest">
               {{ isTranscribing ? 'Esperando audio...' : 'Listo para iniciar' }}
             </p>
          </div>
          
          <p v-else class="text-2xl sm:text-3xl font-medium leading-relaxed text-neutral-700">
            <span>{{ fullHistory }}</span>
            <span v-if="interimTranscript" class="text-blue-600 ml-1 italic">{{ interimTranscript }}</span>
          </p>
        </div>
      </div>

    </div>
  </div>
</template>
