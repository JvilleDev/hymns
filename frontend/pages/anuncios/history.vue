<script setup lang="ts">
import { useAnnouncementIcons } from '@/composables/useAnnouncementIcons'
import { toast } from 'vue-sonner'

definePageMeta({
  layout: 'empty'
})

const { getAnnouncements } = useApi()
const { announcement, transcription, connect, disconnect } = useRealtime()
const { icons } = useAnnouncementIcons()

const history = ref<any[]>([])
const isLoading = ref(true)
const pollInterval = ref<NodeJS.Timeout | null>(null)
const scrollContainer = ref<HTMLElement | null>(null)
const showMonitor = ref(false)
const hideTimeout = ref<NodeJS.Timeout|null>(null)

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

// Parsing logic (similar to LowerThird.vue) to render icons
const parseContent = (text: string) => {
  const segments: Array<{ type: 'text' | 'icon', value: string, class?: string }> = []
  
  const iconNames = icons.map(i => i.name).join('|')
  const regex = new RegExp(`(\\[/?(?:red|blue|purple)\\]|\\[/\\]|\\*\\*|\\*|/(?:${iconNames}))`, 'gi')
  
  const parts = text.split(regex)
  
  let color = ''
  let bold = false
  let italic = false
  
  parts.forEach(part => {
    if (!part) return
    
    // Tags
    if (part.startsWith('[') && part.endsWith(']')) {
        const content = part.slice(1, -1).toLowerCase()
        if (content.startsWith('/') || content === '/') {
            color = ''
        } else if (['red', 'blue', 'purple'].includes(content)) {
            color = content
        }
        return
    }
    
    // Formatting
    if (part === '**') { bold = !bold; return }
    if (part === '*') { italic = !italic; return }
    
    // Icons
    if (part.startsWith('/')) {
        const name = part.slice(1).toLowerCase()
        const iconDef = icons.find(i => i.name === name)
        if (iconDef) {
            let iconColorClass = ''
            if (name === 'check') iconColorClass = 'text-green-500'
            else if (name === 'heart') iconColorClass = 'text-red-500'
            else if (name === 'star') iconColorClass = 'text-yellow-500'
            
            const finalColorClass = color ? `text-${color}-600` : iconColorClass

            segments.push({
                type: 'icon',
                value: iconDef.icon,
                class: `inline-block align-text-bottom mb-1 size-[1.2em] ${finalColorClass}`
            })
            return 
        }
    }
    
    // Text
    let val = part
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
    
    val = val.replace(/WSS:/gi, '<span class="text-red-600">WSS:</span>')
    val = val.replace(/WMB/gi, '<span class="text-purple-600">WMB</span>')
    
    const classes = [
        color ? `text-${color}-600` : '',
        bold ? 'font-black' : '', 
        italic ? 'italic' : ''
    ].filter(Boolean).join(' ')
    
    segments.push({
        type: 'text',
        value: val,
        class: classes
    })
  })
  
  return segments
}

const generatePdf = () => {
  window.print()
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 text-neutral-900 p-4 sm:p-8 font-sans print:bg-white print:p-0">
    <header class="mb-6 border-b border-neutral-200 pb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:border-neutral-300 print:mb-12">
      <div class="flex items-center gap-4">
          <div>
              <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 uppercase leading-tight">
                 {{ displayTopic }}
              </h1>
              <p class="text-sm sm:text-base text-neutral-500 font-medium">Buzón de escritos recientes</p>
          </div>
      </div>
      <div class="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto border-t border-neutral-100 pt-3 sm:border-0 sm:pt-0">
         <div class="flex items-center gap-2 print:hidden bg-neutral-100 px-3 py-1.5 rounded-full">
            <Icon :name="announcement.active ? 'tabler:broadcast' : 'tabler:broadcast-off'" 
                  class="size-4" :class="announcement.active ? 'text-blue-600 animate-pulse' : 'text-neutral-400'" />
            <span class="text-[9px] font-black uppercase tracking-widest" :class="announcement.active ? 'text-blue-600' : 'text-neutral-400'">
               {{ announcement.active ? 'En vivo' : 'Inactivo' }}
            </span>
         </div>
         
         <button 
           @click="generatePdf"
           class="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-2xl transition-all shadow-lg shadow-blue-600/20 text-[10px] font-bold uppercase tracking-widest transform active:scale-95 print:hidden"
         >
           <Icon name="tabler:file-type-pdf" class="size-4" />
           <span>Generar PDF</span>
         </button>
      </div>
    </header>

    <div class="max-w-4xl mx-auto space-y-6 print:max-w-none">
      <div v-if="isLoading && !history.length" class="text-center py-20 text-neutral-400 print:hidden">
          Cargando historial...
      </div>

      <div v-else-if="!history.length" class="text-center py-20 border-2 border-dashed border-neutral-200 rounded-3xl bg-white/50 print:hidden">
          <Icon name="tabler:inbox" class="size-16 text-neutral-300 mb-4" />
          <p class="text-xl font-bold text-neutral-400">No hay anuncios registrados</p>
      </div>

      <TransitionGroup name="list" tag="div" class="space-y-6">
        <div 
            v-for="item in history" 
            :key="item.id"
            class="bg-white border transition-all duration-500 group relative rounded-[1rem]"
            :class="[
                announcement.active && announcement.text === item.text 
                ? 'border-blue-500 shadow-[0_0_20px_rgba(79,70,229,0.15)] ring-1 ring-blue-500/20 scale-[1.02] z-10' 
                : 'border-neutral-200 shadow-sm hover:shadow-md'
            ]"
        >
            <!-- Live Indicator Badge -->
            <div 
                v-if="announcement.active && announcement.text === item.text"
                class="absolute -top-3 left-6 bg-blue-600 text-white text-[9px] font-black px-2 py-1 rounded-md shadow-lg shadow-blue-600/30 uppercase tracking-[0.2em] flex items-center gap-1.5 animate-bounce-subtle"
            >
                <div class="size-1.5 bg-white rounded-full animate-pulse"></div>
                Ahora en pantalla
            </div>

            <div class="p-6 print:shadow-none print:border-neutral-100 print:break-inside-avoid">
                <div class="flex items-start justify-between mb-4">
                    <div class="flex flex-col gap-1">
                        <span class="text-xs font-bold text-neutral-400 uppercase tracking-widest">
                            {{ formatTimeAgo(new Date(item.createdAt)) }}
                        </span>
                        <span class="hidden print:block text-[10px] text-neutral-300 font-mono">
                          {{ new Date(item.createdAt).toLocaleString() }}
                        </span>
                    </div>
                    <button 
                      @click="copyToClipboard(item.text)"
                      class="p-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-500 hover:text-neutral-900 transition-colors flex items-center gap-2 text-[10px] font-bold uppercase tracking-tighter print:hidden"
                    >
                      <Icon name="tabler:copy" class="size-4" />
                      <span>Copiar</span>
                    </button>
                </div>
                
                <div 
                    class="text-2xl md:text-3xl font-bold leading-tight transition-colors duration-500"
                    :class="announcement.active && announcement.text === item.text ? 'text-blue-900' : 'text-neutral-900'"
                >
                    <span class="inline-flex flex-wrap items-center gap-x-2">
                        <template v-for="(segment, idx) in parseContent(item.text)" :key="idx">
                            <Icon 
                                v-if="segment.type === 'icon'" 
                                :name="segment.value" 
                                :class="segment.class"
                            />
                            <span 
                                v-else 
                                v-html="segment.value" 
                                :class="segment.class"
                            ></span>
                        </template>
                    </span>
                </div>
            </div>
        </div>
      </TransitionGroup>
    </div>

    <!-- Live Transcription Floating Monitor -->
    <Teleport to="body">
      <Transition 
        enter-active-class="transition duration-500 ease-out"
        enter-from-class="translate-y-20 opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-active-class="transition duration-300 ease-in"
        leave-from-class="translate-y-0 opacity-100"
        leave-to-class="translate-y-20 opacity-0"
      >
        <div 
          v-if="showMonitor"
          class="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-xl z-50 print:hidden"
        >
          <div class="bg-neutral-900/95 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)] group">
            <div class="min-w-0">
               <div class="flex items-center gap-3 mb-1.5">
                  <div class="size-2 rounded-full animate-pulse"
                       :class="transcription.active ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]' : 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]'">
                  </div>
                  <span class="text-[10px] font-black uppercase tracking-[0.2em]"
                        :class="transcription.active ? 'text-red-500' : 'text-blue-400'">
                    {{ transcription.active ? 'Voz al aire' : 'Transcripción automática' }}
                  </span>
                  <div class="h-px flex-1 bg-white/10"></div>
               </div>
               <div 
                 ref="scrollContainer"
                 class="max-h-16 overflow-y-auto pr-2 scroll-smooth"
                 style="scrollbar-width: thin; scrollbar-color: rgba(59, 130, 246, 0.3) transparent;"
               >
                 <p class="text-base font-medium text-white leading-snug">
                    <span class="text-neutral-200">{{ transcription.final }}</span>
                    <span class="text-neutral-400/90 italic">{{ transcription.interim }}</span>
                 </p>
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
  transition: all 0.5s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}

.list-leave-active {
  position: absolute;
}

@media print {
  @page {
    margin: 1.5cm;
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
  
  .print\:no-shadow {
    box-shadow: none !important;
  }
}

@keyframes bounce-subtle {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
}

.animate-bounce-subtle {
  animation: bounce-subtle 2s infinite ease-in-out;
}
</style>
