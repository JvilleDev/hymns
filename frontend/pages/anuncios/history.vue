<script setup lang="ts">
import { useAnnouncementIcons } from '@/composables/useAnnouncementIcons'

definePageMeta({
  layout: 'empty'
})

const { getAnnouncements } = useApi()
const { announcement, connect, disconnect } = useSocket()
const { icons } = useAnnouncementIcons()

const history = ref<any[]>([])
const isLoading = ref(true)
const pollInterval = ref<NodeJS.Timeout | null>(null)

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

onMounted(() => {
  connect()
  fetchHistory()
  pollInterval.value = setInterval(fetchHistory, 1000)
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
</script>

<template>
  <div class="min-h-screen bg-gray-50 text-neutral-900 p-8 font-sans">
    <header class="mb-8 border-b border-neutral-200 pb-6 flex items-center justify-between">
      <div class="flex items-center gap-4">
          <div>
              <h1 class="text-3xl font-bold tracking-tight text-neutral-900">Historial de Anuncios</h1>
              <p class="text-neutral-500 font-medium">Escritos enviados</p>
          </div>
      </div>
    </header>

    <div class="max-w-4xl mx-auto space-y-6">
      <div v-if="isLoading && !history.length" class="text-center py-20 text-neutral-400">
          Cargando historial...
      </div>

      <div v-else-if="!history.length" class="text-center py-20 border-2 border-dashed border-neutral-200 rounded-3xl bg-white/50">
          <Icon name="tabler:inbox" class="size-16 text-neutral-300 mb-4" />
          <p class="text-xl font-bold text-neutral-400">No hay anuncios registrados</p>
      </div>

      <TransitionGroup name="list">
        <div 
            v-for="item in history" 
            :key="item.id"
            class="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all"
        >
            <div class="flex items-start justify-between mb-4">
                <span class="text-xs font-bold text-neutral-400 uppercase tracking-widest">
                    {{ formatTimeAgo(new Date(item.createdAt)) }}
                </span>
            </div>
            
            <div class="text-2xl md:text-3xl font-bold leading-tight text-neutral-900">
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
      </TransitionGroup>
    </div>
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
</style>
