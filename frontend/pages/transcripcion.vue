<script setup lang="ts">
import { toast } from 'vue-sonner'

const { connect, updateTranscription, isConnected } = useRealtime()

const isSupportedBrowser = ref(false)
const isTranscribing = ref(false)
const recognition = ref<any>(null)
const interimTranscript = ref('')
const finalTranscript = ref('')
const errorCount = ref(0)
const maxErrors = 10

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
  }

  recognition.value.onresult = (event: any) => {
    let interimTxt = ''
    let finalTxt = ''
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) finalTxt += event.results[i][0].transcript
      else interimTxt += event.results[i][0].transcript
    }
    interimTranscript.value = interimTxt
    if (finalTxt) finalTranscript.value = finalTxt
    updateTranscription({ final: finalTxt || finalTranscript.value, interim: interimTxt })
  }

  recognition.value.onerror = (event: any) => {
    console.error('[STT] Error:', event.error)
    isTranscribing.value = false
    if (event.error !== 'not-allowed' && isUserActive.value && errorCount.value < maxErrors) {
      errorCount.value++
      setTimeout(() => startRecognition(), 1000)
    }
  }

  recognition.value.onend = () => {
    isTranscribing.value = false
    if (isUserActive.value && errorCount.value < maxErrors) startRecognition()
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
  } else {
    startRecognition()
  }
}

onMounted(() => {
  checkBrowser()
  if (isSupportedBrowser.value) {
    connect()
    initRecognition()
  }
})

onUnmounted(() => {
  recognition.value?.stop()
})

definePageMeta({
  layout: false
})
</script>

<template>
  <div class="min-h-screen bg-black text-white font-outfit flex flex-col items-center justify-center p-6 text-center">
    <div v-if="!isSupportedBrowser" class="p-8 border border-red-900/30 bg-red-950/20 rounded-3xl max-w-sm">
      <Icon name="tabler:browser-off" class="size-12 text-red-500 mb-4" />
      <h1 class="text-xl font-bold mb-2">Usar Chrome o Safari</h1>
      <p class="text-sm text-slate-400">Este sistema solo funciona en navegadores con soporte oficial de Web Speech API.</p>
    </div>

    <div v-else class="space-y-8 w-full max-w-lg">
      <div class="space-y-2">
        <h1 class="text-2xl font-black tracking-tighter uppercase italic">Transporte STT</h1>
        <div class="flex items-center justify-center gap-3">
          <div class="flex items-center gap-1.5 px-2 py-0.5 bg-slate-900 rounded-full border border-slate-800">
            <div class="size-1.5 rounded-full" :class="isConnected ? 'bg-green-500' : 'bg-red-500'"></div>
            <span class="text-[9px] font-bold uppercase tracking-widest text-slate-500">{{ isConnected ? 'Online' : 'Offline' }}</span>
          </div>
          <div v-if="isTranscribing" class="flex items-center gap-1.5 px-2 py-0.5 bg-red-500/10 rounded-full border border-red-500/20">
            <div class="size-1.5 bg-red-500 rounded-full animate-pulse"></div>
            <span class="text-[9px] font-bold uppercase tracking-widest text-red-500">Live</span>
          </div>
        </div>
      </div>

      <div class="aspect-square w-full max-w-[280px] mx-auto relative group">
        <div class="absolute inset-0 bg-primary/20 rounded-full blur-3xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
        <button 
          @click="toggleTranscription"
          class="relative w-full h-full rounded-full border-2 transition-all duration-500 flex flex-col items-center justify-center gap-4 group"
          :class="isTranscribing ? 'border-primary bg-primary/5' : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'"
        >
          <Icon :name="isTranscribing ? 'tabler:microphone' : 'tabler:microphone-off'" class="size-16 transition-transform group-active:scale-90" :class="isTranscribing ? 'text-primary' : 'text-slate-600'" />
          <span class="text-xs font-black uppercase tracking-[0.2em]">{{ isTranscribing ? 'DETENER' : 'INICIAR' }}</span>
        </button>
      </div>

      <div class="p-6 bg-slate-900/30 rounded-3xl border border-slate-800/50 min-h-[120px] flex items-center justify-center italic text-slate-400">
        <p v-if="interimTranscript || finalTranscript" class="text-lg leading-tight">
          {{ finalTranscript }} <span class="text-primary">{{ interimTranscript }}</span>
        </p>
        <p v-else class="text-sm opacity-50 uppercase tracking-widest">{{ isTranscribing ? 'Escuchando...' : 'Listo para transcribir' }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.font-outfit { font-family: 'Outfit', sans-serif; }
</style>
