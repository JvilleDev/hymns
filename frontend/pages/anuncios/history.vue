<script setup lang="ts">
import { toast } from 'vue-sonner'

definePageMeta({
  layout: 'empty'
})

const { getAnnouncements } = useApi()
const { announcement, transcription, connect, disconnect } = useRealtime()
const { parseHTML } = useContentParser()

const history = ref<any[]>([])
const isLoading = ref(true)
const pollInterval = ref<NodeJS.Timeout | null>(null)
const scrollContainer = ref<HTMLElement | null>(null)
const desktopScrollContainer = ref<HTMLElement | null>(null)
const showMonitor = ref(false)
const hideTimeout = ref<NodeJS.Timeout|null>(null)
const transcriptionHistory = ref('')
const showFullHistory = ref(false)

// Accumulate transcription history
watch(() => transcription.value.final, (newFinal) => {
  if (newFinal) {
    const space = transcriptionHistory.value && !transcriptionHistory.value.endsWith(' ') ? ' ' : ''
    transcriptionHistory.value += space + newFinal
  }
})

// Words only for the interim stream
const interimWords = computed(() => {
  return transcription.value.interim.split(/\s+/).filter(Boolean).map((w, i) => ({
    id: `i-${i}`,
    text: w
  }))
})

const fetchHistory = async () => {
  try {
    const data = await getAnnouncements()
    history.value = data
  } catch (e) {
    console.error('Error fetching history', e)
  } finally {
    isLoading.value = false
  }
}

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Copiado al portapapeles', {
        description: 'El contenido se ha copiado correctamente.'
    })
  } catch (err) {
    console.error('Error copying to clipboard', err)
    toast.error('Error al copiar')
  }
}

onMounted(() => {
  connect()
  fetchHistory()
  pollInterval.value = setInterval(fetchHistory, 1000)
})

// Auto-scroll transcription monitor & auto-hide logic
watch([() => transcription.value.final, () => transcription.value.interim], ([newFinal, newInterim]) => {
    // Show monitor when text is arriving
    if (newFinal || newInterim) {
        showMonitor.value = true
        
        // Reset hide timeout
        if (hideTimeout.value) clearTimeout(hideTimeout.value)
        hideTimeout.value = setTimeout(() => {
            showMonitor.value = false
        }, 5000)
    }

    nextTick(() => {
        if (scrollContainer.value) {
            scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
        }
        if (desktopScrollContainer.value) {
            desktopScrollContainer.value.scrollTop = desktopScrollContainer.value.scrollHeight
        }
    })
})

onUnmounted(() => {
  if (pollInterval.value) clearInterval(pollInterval.value)
  disconnect()
})

const formatTimeAgo = (date: Date | string | number) => {
  return useTimeAgo(date, {
    messages: {
      justNow: 'justo ahora',
      past: (n: string) => n.match(/\d/) ? `hace ${n}` : n,
      future: (n: string) => n.match(/\d/) ? `en ${n}` : n,
      month: (n: number, past: boolean) => n === 1 ? (past ? 'el mes pasado' : 'el próximo mes') : `${n} meses`,
      year: (n: number, past: boolean) => n === 1 ? (past ? 'el año pasado' : 'el próximo año') : `${n} años`,
      day: (n: number, past: boolean) => n === 1 ? (past ? 'ayer' : 'mañana') : `${n} días`,
      week: (n: number, past: boolean) => n === 1 ? (past ? 'la semana pasada' : 'la próxima semana') : `${n} semanas`,
      hour: (n: number) => `${n} h`,
      minute: (n: number) => `${n} min`,
      second: (n: number) => `${n} s`,
      invalid: 'Fecha inválida',
    } as any
  }).value
}

// Compute current topic title
const displayTopic = computed(() => {
    if (announcement.value.active && announcement.value.topic) {
        return announcement.value.topic
    }
    
    // Find the latest historical item that has a topic
    const latestWithTopic = history.value.find(item => item.topic)
    return latestWithTopic?.topic || 'Historial'
})


const generatePdf = () => {
  window.print()
}
</script>

<template>
  <div class="min-h-screen lg:h-screen lg:flex lg:overflow-hidden bg-white text-neutral-900 font-sans print:bg-white print:p-0">
    
    <!-- Left Panel: Announcements History -->
    <div class="flex-1 h-full overflow-y-auto scroll-smooth group/container">
      <div class="max-w-2xl mx-auto px-6 py-12 sm:py-20">
        
        <header class="mb-16 space-y-4 print:mb-12">
          <div class="flex items-center gap-3">
            <h1 class="text-3xl sm:text-4xl font-black tracking-tight text-neutral-900 uppercase leading-none">
                {{ displayTopic }}
            </h1>
            <div v-if="announcement.active" class="flex items-center gap-1.5 bg-blue-50 text-blue-600 px-2 py-1 rounded-md border border-blue-100 animate-pulse print:hidden">
              <div class="size-1.5 bg-blue-600 rounded-full"></div>
              <span class="text-[9px] font-black uppercase tracking-wider">En vivo</span>
            </div>
          </div>

          <button 
            @click="generatePdf"
            class="flex items-center gap-2 text-neutral-400 hover:text-neutral-900 transition-colors text-[10px] font-bold uppercase tracking-widest print:hidden border border-neutral-200 px-4 py-2 rounded-full hover:bg-neutral-50 shadow-sm hover:shadow-md active:scale-95 transition-all w-fit"
          >
            <Icon name="tabler:file-type-pdf" class="size-4" />
            <span>Exportar PDF</span>
          </button>
        </header>

        <div class="relative">
          <!-- Vertical Timeline Line -->
          <div class="absolute left-0 top-0 bottom-0 w-px bg-neutral-100 ml-4 sm:ml-0 overflow-hidden print:hidden"></div>

          <TransitionGroup name="list" tag="div" class="space-y-16 relative">
            <div 
                v-for="item in history" 
                :key="item.id"
                class="relative pl-10 sm:pl-12 group/item"
            >
                <!-- Timeline Dot -->
                <div 
                  class="absolute left-[15.5px] sm:left-[-4.5px] top-3 size-2 rounded-full border-2 transition-all duration-500 z-10"
                  :class="[
                    announcement.active && announcement.text === item.text 
                    ? 'bg-blue-600 border-blue-600 scale-125 shadow-[0_0_10px_rgba(37,99,235,0.3)]' 
                    : 'bg-white border-neutral-200 group-hover/item:border-neutral-400'
                  ]"
                ></div>

                <div 
                  class="transition-all duration-500"
                >
                    <div class="flex items-center justify-between mb-4">
                        <div class="flex items-center gap-3">
                          <span class="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                              {{ formatTimeAgo(new Date(item.createdAt)) }}
                          </span>
                          <span v-if="announcement.active && announcement.text === item.text" 
                                class="text-[9px] font-black text-blue-600 uppercase tracking-[0.2em] bg-blue-50 px-2 py-0.5 rounded">
                            Ahora
                          </span>
                        </div>
                        
                        <button 
                          @click="copyToClipboard(item.text)"
                          class="p-1.5 text-neutral-400 hover:text-neutral-900 transition-all print:hidden"
                          title="Copiar texto"
                        >
                          <Icon name="tabler:copy" class="size-4" />
                        </button>
                    </div>
                    
                    <div 
                        class="text-2xl sm:text-3xl font-black leading-tight transition-colors duration-500"
                        :class="announcement.active && announcement.text === item.text ? 'text-neutral-900' : 'text-neutral-700'"
                    >
                        <div class="inline-flex flex-wrap items-center gap-x-2">
                            <template v-for="(segment, idx) in parseHTML(item.text)" :key="idx">
                                <Icon 
                                    v-if="segment.type === 'icon'" 
                                    :name="segment.value" 
                                    :class="segment.class"
                                    class="mb-1"
                                />
                                <span 
                                    v-else 
                                    v-html="segment.value" 
                                    :class="segment.class"
                                ></span>
                            </template>
                        </div>
                    </div>

                    <div class="hidden print:block text-[10px] text-neutral-300 mt-2 font-mono">
                      {{ new Date(item.createdAt).toLocaleString() }}
                    </div>
                </div>
            </div>
          </TransitionGroup>
        </div>

        <div v-if="isLoading && !history.length" class="text-center py-20 text-neutral-400 animate-pulse">
            Sincronizando historial...
        </div>

        <div v-else-if="!history.length" class="text-center py-32">
            <div class="size-16 bg-neutral-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <Icon name="tabler:hourglass-empty" class="size-8 text-neutral-200" />
            </div>
            <p class="text-[10px] font-black text-neutral-300 uppercase tracking-[0.3em]">Sin registros recientes</p>
        </div>
      </div>
    </div>

    <!-- Right Panel: Live Transcription (Desktop) -->
    <aside 
      ref="desktopScrollContainer"
      class="hidden lg:flex flex-col w-[450px] bg-black text-white h-full p-12 overflow-y-auto border-l border-white/10 scroll-smooth"
    >
      <div class="flex items-center gap-4 mb-12">
        <div class="relative flex size-3">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                :class="transcription.active ? 'bg-red-400' : 'bg-blue-400'"></span>
          <span class="relative inline-flex rounded-full size-3"
                :class="transcription.active ? 'bg-red-500' : 'bg-blue-500'"></span>
        </div>
        <div class="flex flex-col">
          <h2 class="text-xs font-black uppercase tracking-[0.4em] text-white/40">Traducción en vivo</h2>
          <span class="text-[10px] font-bold text-white/20 uppercase tracking-widest">
            {{ transcription.active ? 'Audio capturado' : 'Esperando señal' }}
          </span>
        </div>
      </div>

      <div class="space-y-8">
        <!-- Collapsible History -->
        <div v-if="transcriptionHistory" class="space-y-4">
           <button 
             @click="showFullHistory = !showFullHistory"
             class="flex items-center gap-3 text-xs font-black uppercase tracking-[0.3em] text-white/40 hover:text-white transition-colors"
           >
              <Icon :name="showFullHistory ? 'tabler:chevron-down' : 'tabler:chevron-right'" class="size-4" />
              {{ showFullHistory ? 'Minimizar Registro' : 'Ver Registro Completo' }}
           </button>
           
           <div v-if="showFullHistory" class="text-xl font-normal text-white/50 leading-relaxed max-h-[300px] overflow-y-auto pr-4 scroll-smooth">
              {{ transcriptionHistory }}
           </div>
        </div>

        <!-- Live Partial Stream -->
        <div class="prose prose-invert max-w-none">
           <TransitionGroup 
             name="word-stream" 
             tag="p" 
             class="text-3xl sm:text-4xl leading-tight tracking-tight flex flex-wrap gap-x-3 gap-y-2 font-bold text-white opacity-100"
           >
              <span 
                 v-for="word in interimWords" 
                 :key="word.id"
                 class="transition-colors"
              >
                 {{ word.text }}
              </span>
           </TransitionGroup>
        </div>
        
        <div v-if="!transcription.final && !transcription.interim" class="py-20 text-center border border-dashed border-white/10 rounded-3xl">
          <Icon name="tabler:ear" class="size-12 text-white/5 mx-auto mb-4" />
          <p class="text-xs font-bold text-white/20 uppercase tracking-widest italic">Silencio detectado</p>
        </div>
      </div>

      <div class="mt-auto pt-12 border-t border-white/5">
        <div class="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-white/30">
          <span>{{ new Date().toLocaleDateString() }}</span>
          <span>Sincronizado</span>
        </div>
      </div>
    </aside>

    <!-- Mobile Floating Monitor (Hidden on Desktop) -->
    <Teleport to="body">
      <Transition 
        enter-active-class="transition duration-700 ease-out"
        enter-from-class="translate-y-24 opacity-0 scale-90"
        enter-to-class="translate-y-0 opacity-100 scale-100"
        leave-active-class="transition duration-500 ease-in"
        leave-from-class="translate-y-0 opacity-100 scale-100"
        leave-to-class="translate-y-24 opacity-0 scale-90"
      >
        <div 
          v-if="showMonitor"
          class="fixed bottom-10 left-1/2 -translate-x-1/2 w-full max-w-lg z-50 px-6 lg:hidden print:hidden"
        >
          <div class="bg-black/90 rounded-3xl p-6 shadow-2xl">
            <div class="min-w-0">
               <div class="flex items-center gap-3 mb-3">
                  <div class="relative flex size-2">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                          :class="transcription.active ? 'bg-red-400' : 'bg-blue-400'"></span>
                    <span class="relative inline-flex rounded-full size-2"
                          :class="transcription.active ? 'bg-red-500' : 'bg-blue-500'"></span>
                  </div>
                  <span class="text-[10px] font-black uppercase tracking-[0.4em] text-white/50">
                    {{ transcription.active ? 'Live Audio' : 'Processing' }}
                  </span>
                  <div class="h-px flex-1 bg-white/5"></div>
               </div>
                 <div 
                   ref="scrollContainer"
                   class="max-h-24 overflow-y-auto pr-2 scroll-smooth"
                   style="scrollbar-width: none; -ms-overflow-style: none;"
                 >
                   <!-- Live Partial Stream (Mini) -->
                   <TransitionGroup 
                     name="word-stream-mini" 
                     tag="p" 
                     class="text-xl font-normal leading-tight tracking-tight flex flex-wrap gap-x-1.5 text-white opacity-100"
                   >
                     <span 
                       v-for="word in interimWords" 
                       :key="word.id"
                       class="transition-colors"
                     >
                       {{ word.text }}
                     </span>
                   </TransitionGroup>
                 </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.list-move,
.list-enter-active,
.list-leave-active {
  transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.list-leave-active {
  position: absolute;
  width: 100%;
}

@media print {
  @page {
    margin: 2cm;
  }
  
  body {
    background: white !important;
  }
  
  .print\:hidden {
    display: none !important;
  }
  
  .print\:block {
    display: block !important;
  }
}

/* Streaming word animation */
.word-stream-enter-active,
.word-stream-mini-enter-active {
  transition: all 0.4s cubic-bezier(0.2, 0, 0, 1);
  transition-delay: 0.1s;
}

.word-stream-enter-from,
.word-stream-mini-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.9);
  filter: blur(8px);
}

.word-stream-move,
.word-stream-mini-move {
  transition: transform 0.5s ease;
}
</style>
