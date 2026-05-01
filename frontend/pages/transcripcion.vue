<script setup lang="ts">
import { toast } from 'vue-sonner'

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

const resetInactivityTimer = () => {
  if (inactivityTimer.value) clearTimeout(inactivityTimer.value)
  if (isTranscribing.value) {
    inactivityTimer.value = setTimeout(() => {
      console.log('[STT] Inactividad detectada (3s). Reiniciando instancia...')
      if (recognition.value) {
        recognition.value.stop() // Trigger onend -> restart
      }
    }, 3000)
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

  recognition.value.onstart = () => {
    isTranscribing.value = true
    errorCount.value = 0
    setTranscriptionProducing(true)
    resetInactivityTimer()
  }

  recognition.value.onresult = (event: any) => {
    resetInactivityTimer()
    let interimTxt = ''
    let finalTxt = ''
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTxt += event.results[i][0].transcript
        // Append to full history with proper spacing
        const space = fullHistory.value && !fullHistory.value.endsWith(' ') ? ' ' : ''
        fullHistory.value += space + event.results[i][0].transcript
      }
      else {
        interimTxt += event.results[i][0].transcript
      }
    }
    interimTranscript.value = interimTxt
    if (finalTxt) finalTranscript.value = finalTxt
    updateTranscription({ final: finalTxt || finalTranscript.value, interim: interimTxt })
  }

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
