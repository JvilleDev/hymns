<script setup lang="ts">
import { toast } from 'vue-sonner'
import { useAnnouncementIcons } from '~/composables/useAnnouncementIcons'
import { onKeyStroke, watchDebounced } from '@vueuse/core'

const { 
  announcement, 
  setAnnouncement, 
  transcription, 
  setTranscriptionActive, 
  connect, 
} = useRealtime()
const { getAnnouncements, createAnnouncement, deleteAnnouncement, clearAnnouncements, deleteSelectedAnnouncements } = useApi()
const { icons: availableIcons } = useAnnouncementIcons()

const textInput = ref('')
const currentTopic = ref(announcement.value.topic || '')
const isLoading = ref(true)
const history = ref<any[]>([])
const showMobileHistory = ref(false)
const transcriptionScrollRef = ref<HTMLElement | null>(null)
const transcriptionHistory = ref('')
const showFullHistory = ref(false)
const showHelp = ref(false)
const isMac = ref(false)
const showTranscription = ref(false)

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

// Select Logic
const selectedIds = ref<Set<string>>(new Set())
const isSelecting = computed(() => selectedIds.value.size > 0)

const toggleSelect = (id: string) => {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id)
  } else {
    selectedIds.value.add(id)
  }
}

const selectAll = () => {
  if (selectedIds.value.size === history.value.length) {
    selectedIds.value.clear()
  } else {
    selectedIds.value = new Set(history.value.map(item => item.id))
  }
}

const deleteSelected = async () => {
  if (selectedIds.value.size === 0) return
  isLoading.value = true
  try {
    await deleteSelectedAnnouncements(Array.from(selectedIds.value))
    toast.success('Anuncios eliminados')
    selectedIds.value.clear()
    fetchHistory()
  } catch (e) {
    toast.error('Error al eliminar seleccionados')
  } finally {
    isLoading.value = false
  }
}

const clearAll = async () => {
  if (!confirm('¿Estás seguro de que quieres limpiar todo el historial?')) return
  isLoading.value = true
  try {
    await clearAnnouncements()
    toast.success('Historial limpiado')
    selectedIds.value.clear()
    fetchHistory()
  } catch (e) {
    toast.error('Error al limpiar historial')
  } finally {
    isLoading.value = false
  }
}

// Quick-Fill logic
const appendToEditor = (text: string) => {
  if (!text) return
  const cleanText = text.trim()
  if (textInput.value.includes('</p>')) {
      textInput.value = textInput.value.replace(/<\/p>$/, ` ${cleanText}</p>`)
  } else {
      textInput.value = textInput.value ? `${textInput.value} ${cleanText}` : cleanText
  }
  toast.info('Texto añadido al editor')
}

// Shortcuts
onKeyStroke(['l', 'L'], (e) => {
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault()
    toggleVisibility()
  }
})

onKeyStroke(['Enter'], (e) => {
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault()
    sendAnnouncement()
  }
})

onKeyStroke(['v', 'V'], (e) => {
  if (e.metaKey || e.ctrlKey) {
    const target = e.target as HTMLElement
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
    
    if (isInput) return

    e.preventDefault()
    const newState = !transcription.value.active
    setTranscriptionActive(newState)
    showTranscription.value = newState
    toast.success(`Transcripción: ${newState ? 'ACTIVADO' : 'DESACTIVADO'}`)
  }
})

onKeyStroke(['Escape'], (e) => {
  if (textInput.value) {
    e.preventDefault()
    textInput.value = ''
    toast.info('Texto limpiado')
  } else if (announcement.value.active) {
    e.preventDefault()
    toggleVisibility()
    toast.info('Pantalla apagada')
  }
})

const fetchHistory = async () => {
  try {
    history.value = await getAnnouncements()
    if (!currentTopic.value && history.value.length > 0) {
      const lastItemWithTopic = history.value.find(item => item.topic)
      if (lastItemWithTopic) {
        currentTopic.value = lastItemWithTopic.topic
      }
    }
  } catch (e) {
    toast.error('Error al cargar historial')
  }
}

const autoSendToAir = ref(true)

const sendAnnouncement = async () => {
  if (!textInput.value) return
  const isEmpty = textInput.value.replace(/<[^>]*>?/gm, '').trim().length === 0 && !textInput.value.includes('data-icon')
  if (isEmpty) {
     textInput.value = ''
     return
  }

  isLoading.value = true
  try {
    const processedText = textInput.value
      .replace(/WSS:/g, '<span class="text-red-600 font-black">WSS:</span>')
      .replace(/WMB/g, '<span class="text-purple-600 font-black">WMB</span>')

    createAnnouncement(processedText, currentTopic.value)
      .then(() => fetchHistory())
      .catch(() => toast.error('Error al guardar historial'))
    
    if (autoSendToAir.value) {
        setAnnouncement({
          text: processedText,
          active: true,
        })
    }

    toast.success(autoSendToAir.value ? 'Anuncio enviado' : 'Anuncio guardado')
    textInput.value = ''
  } catch (e) {
    toast.error('Error al enviar anuncio')
  } finally {
    isLoading.value = false
  }
}

const isActive = (item: any) => {
  return announcement.value.active && announcement.value.text === item.text
}

const toggleVisibility = () => {
  setAnnouncement({
    text: announcement.value.text,
    active: !announcement.value.active,
  })
}

const resendFromHistory = (item: any) => {
  setAnnouncement({
    text: item.text,
    active: true,
  })
  toast.success('Anuncio al aire')
}

const deleteItem = async (id: string) => {
  try {
    await deleteAnnouncement(id)
    fetchHistory()
  } catch (e) {
    toast.error('Error al eliminar')
  }
}

const parseHTMLContent = (html: string) => {
  if (!html) return []
  
  const enrichedHTML = html
    .replace(/WSS:/g, '<span class="text-red-600 font-black">WSS:</span>')
    .replace(/WMB/g, '<span class="text-purple-600 font-black">WMB</span>')

  const segments: Array<{ type: 'text' | 'icon', value: string, class?: string }> = []
  
  const parser = new DOMParser()
  const doc = parser.parseFromString(enrichedHTML, 'text/html')
  
  const walk = (node: Node, currentStyles: { bold?: boolean, italic?: boolean, color?: string } = {}) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) {
        const classes = [
            currentStyles.color ? `text-${currentStyles.color}-600` : '',
            currentStyles.bold ? 'font-black' : 'font-bold', 
            currentStyles.italic ? 'italic' : ''
        ].filter(Boolean).join(' ')
        
        segments.push({
            type: 'text',
            value: node.textContent,
            class: classes
        })
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      const newStyles = { ...currentStyles }
      
      if (['STRONG', 'B'].includes(el.tagName)) newStyles.bold = true
      if (['EM', 'I'].includes(el.tagName)) newStyles.italic = true
      
      if (el.classList.contains('text-red-600')) newStyles.color = 'red'
      if (el.classList.contains('text-purple-600')) newStyles.color = 'purple'
      if (el.classList.contains('font-black')) newStyles.bold = true
      if (el.classList.contains('italic')) newStyles.italic = true
      
      if (el.classList.contains('announcement-icon') || el.hasAttribute('data-icon')) {
        const iconName = el.getAttribute('data-icon')
        if (iconName) {
            const iconDef = availableIcons.find(i => i.name === iconName)
            if (iconDef) {
                 let iconColorClass = ''
                 if (iconName === 'david') iconColorClass = 'text-primary'
                 
                 segments.push({
                     type: 'icon',
                     value: iconDef.icon,
                     class: `inline-block align-text-bottom mb-1 size-[1.1em] ${iconColorClass}`
                 })
                 return 
            }
        }
      }
      
      el.childNodes.forEach(child => walk(child, newStyles))
      if (el.tagName === 'P') {
        segments.push({ type: 'text', value: ' ', class: '' })
      }
    }
  }
  
  doc.body.childNodes.forEach(child => walk(child))
  return segments
}

watchDebounced(currentTopic, (newVal) => {
  if (newVal !== announcement.value.topic) {
    setAnnouncement({ ...announcement.value, topic: newVal })
  }
}, { debounce: 500 })

watch(() => announcement.value.topic, (newVal) => {
  if (newVal !== currentTopic.value) {
    currentTopic.value = newVal || ''
  }
})

watch([() => transcription.value.final, () => transcription.value.interim], () => {
    nextTick(() => {
        if (transcriptionScrollRef.value) {
            transcriptionScrollRef.value.scrollTop = transcriptionScrollRef.value.scrollHeight
        }
    })
})

onMounted(() => {
  isMac.value = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  connect()
  fetchHistory()
})
</script>

<template>
  <div class="flex-1 flex flex-col w-full min-h-0 overflow-hidden bg-background">

    <!-- STATUS BAR: Always visible -->
    <div class="flex-none flex items-center justify-between px-6 py-3 border-b border-border bg-muted/30">
      <div class="flex items-center gap-3 select-none">
        <div class="flex items-center gap-2">
          <span 
            class="size-2 rounded-full transition-all duration-300"
            :class="announcement.active 
              ? 'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]' 
              : 'bg-neutral-300 dark:bg-neutral-700'"
          ></span>
          <span 
            class="text-[11px] font-black uppercase tracking-[0.15em]"
            :class="announcement.active ? 'text-red-500' : 'text-neutral-400 dark:text-neutral-500'"
          >
            {{ announcement.active ? 'EN PANTALLA' : 'FUERA DEL AIRE' }}
          </span>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button 
          v-if="announcement.active"
          @click="toggleVisibility"
          class="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase tracking-wider transition-all active:scale-95"
        >
          <Icon name="tabler:player-stop" class="size-3" />
          Ocultar
        </button>
        <button 
          @click="showHelp = true"
          class="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Icon name="tabler:help-circle" class="size-4" />
        </button>
      </div>
    </div>

    <!-- MAIN CONTENT: Scrollable -->
    <div class="flex-1 flex flex-col min-h-0 overflow-y-auto">

      <!-- EDITOR -->
      <div class="px-6 md:px-10 pt-6 pb-4">
        <div class="max-w-3xl mx-auto">
          <AnnouncementsEditor v-model="textInput" @submit="sendAnnouncement" />
          <div class="flex items-center justify-between mt-4">
            <button 
              @click="textInput = ''"
              :disabled="!textInput || isLoading"
              class="px-4 py-2 rounded-lg border border-border/60 hover:border-border text-neutral-500 dark:text-neutral-450 hover:text-neutral-700 dark:hover:text-neutral-200 text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
            >
              Limpiar
            </button>
            <button 
              @click="sendAnnouncement"
              :disabled="!textInput || isLoading"
              class="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-black uppercase tracking-wider disabled:opacity-50 transition-all hover:scale-[1.01] active:scale-95 shadow-lg shadow-primary/20"
            >
              <Icon name="tabler:player-play" class="size-3.5" />
              {{ autoSendToAir ? 'Mostrar en Pantalla' : 'Guardar' }}
            </button>
          </div>
        </div>
      </div>

      <!-- SETTINGS ROW -->
      <div class="px-6 md:px-10 pb-4">
        <div class="max-w-3xl mx-auto flex flex-wrap items-center gap-4 text-[10px]">
          <div class="flex items-center gap-2">
            <label class="font-black uppercase tracking-wider text-muted-foreground">Tema</label>
            <input 
              v-model="currentTopic" 
              type="text" 
              placeholder="Categoría..."
              class="w-40 bg-background border border-border rounded-md px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-primary outline-none transition-all"
            />
          </div>
          <div class="h-4 w-px bg-border"></div>
          <div class="flex items-center gap-2">
            <label class="font-black uppercase tracking-wider text-muted-foreground">Auto</label>
            <GSwitch v-model="autoSendToAir" />
          </div>
          <div class="h-4 w-px bg-border"></div>
          <button 
            @click="showTranscription = !showTranscription; if (showTranscription && !transcription.active) setTranscriptionActive(true)"
            class="flex items-center gap-1.5 font-black uppercase tracking-wider transition-colors"
            :class="transcription.active ? 'text-red-500' : 'text-muted-foreground hover:text-foreground'"
          >
            <span 
              class="size-1.5 rounded-full"
              :class="transcription.active ? 'bg-red-500 animate-pulse' : 'bg-neutral-300 dark:bg-neutral-700'"
            ></span>
            Transcripción
          </button>
        </div>
      </div>

      <!-- TRANSCRIPTION PANEL (collapsible) -->
      <div v-if="showTranscription" class="px-6 md:px-10 pb-4">
        <div class="max-w-3xl mx-auto border border-border/50 rounded-xl bg-muted/20 overflow-hidden">
          <div class="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
            <div class="flex items-center gap-2">
              <Icon name="tabler:terminal-2" class="size-3.5 text-muted-foreground" />
              <span class="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Transcripción en Vivo</span>
            </div>
            <div class="flex items-center gap-2">
              <button 
                v-if="transcriptionHistory"
                @click="appendToEditor(transcriptionHistory)"
                class="text-[9px] font-black uppercase tracking-wider text-primary/60 hover:text-primary transition-colors"
              >
                Copiar al editor
              </button>
              <button 
                @click="setTranscriptionActive(false); showTranscription = false"
                class="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Icon name="tabler:x" class="size-3.5" />
              </button>
            </div>
          </div>
          <div 
            ref="transcriptionScrollRef"
            class="p-4 max-h-48 overflow-y-auto font-sans text-[12px] leading-relaxed scroll-smooth"
          >
            <div v-if="!transcription.final && !transcription.interim" class="py-6 flex flex-col items-center text-muted-foreground/30">
              <Icon name="tabler:activity" class="size-6 mb-1 animate-pulse" />
              <span class="text-[9px] uppercase font-bold tracking-widest">Silencio</span>
            </div>
            <div v-else class="space-y-3">
              <div v-if="transcriptionHistory && showFullHistory" class="text-muted-foreground text-[11px] bg-background/50 p-3 rounded-lg border border-border/50">
                {{ transcriptionHistory }}
              </div>
              <button 
                v-if="transcriptionHistory"
                @click="showFullHistory = !showFullHistory"
                class="text-[9px] font-black uppercase tracking-wider text-primary/40 hover:text-primary transition-colors"
              >
                {{ showFullHistory ? 'Ocultar registro' : 'Ver registro' }}
              </button>
              <TransitionGroup name="word-stream" tag="p" class="text-foreground font-bold leading-relaxed flex flex-wrap gap-x-1 gap-y-1">
                <span 
                  v-for="word in interimWords" 
                  :key="word.id"
                  class="inline-block text-blue-600 italic"
                >
                  {{ word.text }}
                </span>
              </TransitionGroup>
            </div>
          </div>
        </div>
      </div>

      <!-- HISTORY: Compact Rows -->
      <div class="px-6 md:px-10 pb-6 flex-1">
        <div class="max-w-3xl mx-auto">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60">Historial</h3>
            <div class="flex items-center gap-3">
              <button 
                v-if="isSelecting" 
                @click="deleteSelected" 
                class="flex items-center gap-1 text-[9px] font-black text-red-500 bg-red-500/10 px-2 py-0.5 rounded hover:bg-red-500/20 uppercase tracking-tighter transition-colors"
              >
                <Icon name="tabler:trash" class="size-3" />
                Eliminar ({{ selectedIds.size }})
              </button>
              <button 
                v-if="!isSelecting && history.length > 0" 
                @click="clearAll" 
                class="text-[9px] font-medium text-muted-foreground hover:text-red-500 uppercase tracking-wider transition-colors"
              >
                Limpiar
              </button>
              <button 
                v-if="history.length > 0"
                @click="selectAll" 
                class="text-[9px] font-medium text-muted-foreground hover:text-primary uppercase tracking-wider transition-colors"
              >
                {{ selectedIds.size === history.length ? 'Deseleccionar' : 'Seleccionar' }}
              </button>
            </div>
          </div>

          <!-- Loading skeleton -->
          <div v-if="isLoading && history.length === 0" class="space-y-1">
            <div v-for="n in 4" :key="n" class="flex items-center gap-3 px-3 py-2">
              <GSkeleton class="size-4 rounded border-2 shrink-0" />
              <GSkeleton class="h-3.5 flex-1 rounded" />
              <GSkeleton class="h-2.5 w-12 rounded shrink-0" />
            </div>
          </div>

          <!-- Empty state -->
          <div v-else-if="history.length === 0" class="py-12 flex flex-col items-center text-muted-foreground/15">
            <Icon name="tabler:archive" class="size-8 mb-2" />
            <p class="text-[9px] font-black uppercase tracking-widest">Sin anuncios</p>
          </div>

          <!-- Compact list -->
          <div v-else class="space-y-1">
            <div 
              v-for="item in history" 
              :key="item.id"
              class="flex items-center gap-3 px-3 py-2 rounded-lg transition-all group"
              :class="[
                isActive(item) ? 'bg-primary/5 border border-primary/30' : 'hover:bg-muted/50 border border-transparent',
                selectedIds.has(item.id) ? 'bg-primary/10 border-primary/40' : ''
              ]"
            >
              <!-- Select checkbox -->
              <button 
                @click.stop="toggleSelect(item.id)" 
                class="flex-none size-4 rounded border-2 flex items-center justify-center transition-all"
                :class="selectedIds.has(item.id) 
                  ? 'bg-primary border-primary' 
                  : 'border-border/60 hover:border-primary/50'"
              >
                <Icon v-if="selectedIds.has(item.id)" name="tabler:check" class="size-2.5 text-white" stroke-width="4" />
              </button>

              <!-- Text preview -->
              <div 
                class="flex-1 min-w-0 text-[12px] font-medium text-foreground leading-tight truncate cursor-pointer"
                @click="resendFromHistory(item)"
              >
                <template v-for="(segment, idx) in parseHTMLContent(item.text)" :key="idx">
                  <Icon v-if="segment.type === 'icon'" :name="segment.value" :class="segment.class" />
                  <span v-else v-html="segment.value" :class="segment.class"></span>
                </template>
              </div>

              <!-- Time -->
              <span class="flex-none text-[9px] font-black text-muted-foreground/40 uppercase tracking-tighter tabular-nums">
                {{ new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
              </span>

              <!-- Actions (visible on hover) -->
              <div class="flex-none flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  @click.stop="resendFromHistory(item)" 
                  class="p-1 rounded text-muted-foreground hover:text-primary transition-colors"
                  title="Reenviar"
                >
                  <Icon name="tabler:send" class="size-3.5" />
                </button>
                <button 
                  @click.stop="deleteItem(item.id)" 
                  class="p-1 rounded text-muted-foreground hover:text-red-500 transition-colors"
                  title="Eliminar"
                >
                  <Icon name="tabler:trash" class="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- Mobile History Trigger -->
    <button 
        @click="showMobileHistory = true"
        class="lg:hidden fixed bottom-6 right-6 size-14 bg-primary text-primary-foreground rounded-full shadow-2xl flex items-center justify-center z-50 active:scale-90 transition-transform shadow-primary/20"
    >
        <Icon name="tabler:history" class="size-6" />
    </button>
    
    <!-- Mobile History Sheet -->
    <GSheet v-model="showMobileHistory">
        <div class="flex flex-col h-full bg-background p-6">
          <div class="flex items-center justify-between mb-6">
             <h2 class="text-lg font-black uppercase tracking-[0.2em]">Historial</h2>
             <div class="flex items-center gap-4">
                <button @click="clearAll" class="text-[10px] font-bold uppercase text-red-500">Limpiar</button>
                <button @click="showMobileHistory = false" class="text-muted-foreground hover:text-foreground transition-colors"><Icon name="tabler:x" class="size-6" /></button>
             </div>
          </div>
          <div class="flex-1 overflow-y-auto space-y-2">
             <div 
               v-for="item in history" 
               :key="item.id"
               @click="resendFromHistory(item); showMobileHistory = false"
               class="p-4 rounded-xl border border-border bg-muted/10 active:bg-primary/10 active:border-primary transition-all flex items-center gap-4"
             >
                <div class="flex-1 min-w-0">
                   <div class="text-[13px] font-bold truncate text-foreground">
                      {{ item.text.replace(/<[^>]+>/g, '') }}
                   </div>
                   <span class="text-[9px] font-black text-muted-foreground/40 uppercase mt-1 block">
                      {{ new Date(item.createdAt).toLocaleTimeString() }}
                   </span>
                </div>
                <Icon name="tabler:chevron-right" class="size-5 text-muted-foreground flex-none" />
             </div>
          </div>
        </div>
    </GSheet>

    <!-- Help Sheet -->
    <GSheet v-model="showHelp">
        <div class="flex flex-col bg-background p-8">
          <div class="flex items-center justify-between mb-6">
             <h2 class="text-lg font-black uppercase tracking-[0.2em]">Comandos</h2>
          </div>
          <div class="grid gap-2">
             <div class="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20">
                <span class="text-[12px] font-bold">Enviar texto</span>
                <span class="text-[11px] font-mono bg-background border border-border px-2 py-0.5 rounded">{{ isMac ? '⌘' : 'Ctrl' }} + Enter</span>
             </div>
             <div class="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20">
                <span class="text-[12px] font-bold">Toggle en pantalla</span>
                <span class="text-[11px] font-mono bg-background border border-border px-2 py-0.5 rounded">{{ isMac ? '⌘' : 'Ctrl' }} + L</span>
             </div>
             <div class="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20">
                <span class="text-[12px] font-bold">Limpiar / Apagar</span>
                <span class="text-[11px] font-mono bg-background border border-border px-2 py-0.5 rounded">Esc</span>
             </div>
             <div class="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20">
                <span class="text-[12px] font-bold">Transcripción</span>
                <span class="text-[11px] font-mono bg-background border border-border px-2 py-0.5 rounded">{{ isMac ? '⌘' : 'Ctrl' }} + V</span>
             </div>
          </div>
        </div>
    </GSheet>

  </div>
</template>

<style scoped>
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 10px; }
::-webkit-scrollbar-thumb:hover { background: var(--primary); }

.word-stream-enter-active {
  transition: all 0.3s cubic-bezier(0.2, 0, 0, 1);
  transition-delay: 0.05s;
}
.word-stream-enter-from {
  opacity: 0;
  transform: translateY(4px) scale(0.95);
  filter: blur(4px);
}
.word-stream-move {
  transition: transform 0.4s ease;
}
</style>
