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
  isConnected, 
  connectionStatus 
} = useRealtime()
const { getAnnouncements, createAnnouncement, deleteAnnouncement, clearAnnouncements, deleteSelectedAnnouncements } = useApi()
const { icons: availableIcons } = useAnnouncementIcons()
const { isAdmin } = useAuth()

const textInput = ref('')
const currentTopic = ref(announcement.value.topic || '')
const isLoading = ref(false)
const history = ref<any[]>([])
const showMobileHistory = ref(false)
const transcriptionScrollRef = ref<HTMLElement | null>(null)
const transcriptionHistory = ref('')
const showFullHistory = ref(false)
const showHelp = ref(false)
const isMac = ref(false)

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
    
    if (isInput) return // Let the browser handle standard Paste

    e.preventDefault()
    const newState = !transcription.value.active
    setTranscriptionActive(newState)
    toast.success(`Transcripción: ${newState ? 'ACTIVADO' : 'DESACTIVADO'}`)
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

    // Background DB creation
    createAnnouncement(processedText, currentTopic.value)
      .then(() => fetchHistory())
      .catch(() => toast.error('Error al guardar historial'))
    
    if (autoSendToAir.value) {
        console.log('[Index] Auto-sending announcement to air:', processedText)
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
  textInput.value = item.text
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

// Robust Parser for HTML content (mirrors LowerThird logic)
const parseHTMLContent = (html: string) => {
  if (!html) return []
  
  // Auto-inject spans for keywords
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
      
      // Handle custom styles from classes
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

// Suggested topics based on history
const suggestedTopics = computed(() => {
    const topics = history.value
        .map(h => h.topic)
        .filter((t, i, arr) => t && arr.indexOf(t) === i)
        .slice(0, 8)
    return topics
})

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

watch(announcement, (newVal) => {
  console.log('[Index] Announcement state changed:', newVal)
  fetchHistory()
}, { deep: true })

watch(() => announcement.value.active, () => {
  fetchHistory()
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
    <!-- Desktop Command Center -->
    <div class="flex-1 flex overflow-hidden relative">
      
      <!-- LEFT SIDEBAR REMOVED -->

      <!-- CENTRAL PANEL: Studio Monitor & Editor -->
      <main class="flex-1 flex flex-col min-w-0 overflow-hidden">
        

        <!-- Editor Area -->
        <div class="flex-1 overflow-y-auto p-6 md:p-10 bg-background">
          <div class="max-w-4xl mx-auto space-y-10">
            
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
              <!-- Content Form -->
              <div class="lg:col-span-8 space-y-8">
                 <div class="space-y-4">
                    <div class="flex items-center justify-between">
                       <div class="flex items-center gap-4">
                          <div class="flex items-center gap-2">
                             <div class="size-2 rounded-full transition-colors duration-500" :class="announcement.active ? 'bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.6)]' : 'bg-muted-foreground/30'"></div>
                             <label class="text-[11px] font-black uppercase tracking-[0.2em]" :class="announcement.active ? 'text-red-500' : 'text-muted-foreground'">
                                {{ announcement.active ? 'EN PANTALLA' : 'NO EN PANTALLA' }}
                             </label>
                          </div>
                          <button 
                              @click="toggleVisibility"
                              class="px-3 py-1 rounded text-[9px] font-black uppercase tracking-widest transition-colors"
                              :class="announcement.active ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20' : 'bg-muted text-muted-foreground hover:bg-muted/80'"
                          >
                             {{ announcement.active ? 'Ocultar' : 'Mostrar' }}
                          </button>
                       </div>
                        <div class="flex items-center gap-3">
                           <button @click="showHelp = true" class="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                              <Icon name="tabler:help-circle" class="size-3.5" />
                              Comandos
                           </button>
                        </div>
                     </div>
                    <AnnouncementsEditor v-model="textInput" @submit="sendAnnouncement" />
                 </div>

                 <div class="flex items-center justify-end gap-2">
                     <button 
                       @click="textInput = ''"
                       :disabled="!textInput || isLoading"
                       class="px-6 py-3 rounded-xl bg-muted text-muted-foreground font-black text-[11px] uppercase tracking-[0.2em] hover:bg-muted/80 transition-all active:scale-95"
                     >
                        Limpiar
                     </button>
                     <button 
                       v-if="announcement.active"
                       @click="toggleVisibility"
                       class="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-red-500 text-white font-black text-[11px] uppercase tracking-[0.2em] transition-all hover:scale-[1.02] active:scale-95 shadow-xl shadow-red-500/20"
                     >
                        <Icon name="tabler:player-stop" class="size-4" />
                        Ocultar
                     </button>
                     <button 
                       @click="sendAnnouncement"
                       :disabled="!textInput || isLoading"
                       class="flex items-center justify-center gap-3 px-8 py-3 rounded-xl bg-primary text-primary-foreground font-black text-[11px] uppercase tracking-[0.2em] disabled:opacity-50 transition-all hover:scale-[1.02] active:scale-95 shadow-xl shadow-primary/20"
                     >
                        <Icon name="tabler:player-play" class="size-4" />
                        {{ autoSendToAir ? 'Mostrar en Pantalla' : 'Guardar' }}
                     </button>
                 </div>
              </div>

              <!-- Extra Controls -->
              <div class="lg:col-span-4 space-y-6">
                 <div class="bg-muted/30 border border-border/50 rounded-2xl p-6 space-y-6 shadow-sm">
                     <div class="space-y-2">
                        <label class="text-[10px] font-black uppercase tracking-wider block">Tema Actual</label>
                        <input 
                          v-model="currentTopic" 
                          type="text" 
                          placeholder="Escribir tema..." 
                          class="w-full bg-background border border-border rounded-md px-3 py-2 text-xs focus:ring-1 focus:ring-primary outline-none transition-all shadow-sm"
                        />
                     </div>
                     <div class="h-px bg-border/50"></div>
                     <div class="flex items-center justify-between">
                        <div>
                           <label class="text-[10px] font-black uppercase tracking-wider block mb-0.5">Auto-Emisión</label>
                           <p class="text-[10px] text-muted-foreground">Transmitir al pulsar Guardar</p>
                        </div>
                       <GSwitch v-model="autoSendToAir" />
                    </div>

                    <div class="h-px bg-border/50"></div>

                    <!-- Voice Transport Quick Link -->
                    <div class="space-y-4">
                       <div class="flex items-center justify-between">
                          <div class="flex items-center gap-2">
                             <div class="size-2.5 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.4)]"></div>
                             <span class="text-[10px] font-black uppercase tracking-widest text-indigo-500">Transcripción</span>
                          </div>
                          <GSwitch 
                            :model-value="transcription.active" 
                            @update:model-value="setTranscriptionActive" 
                          />
                       </div>
                       <NuxtLink 
                          to="/transcripcion" 
                          target="_blank"
                          class="flex items-center justify-center gap-3 w-full py-3 bg-background border border-border rounded-xl text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground hover:text-primary hover:border-primary transition-all hover:shadow-md"
                       >
                          <Icon name="tabler:terminal" class="size-3.5" />
                          Abrir Terminal
                       </NuxtLink>
                    </div>
                 </div>
              </div>
            </div>

          </div>
        </div>
      </main>

      <!-- RIGHT SIDEBAR: Transcription & History -->
      <aside class="hidden lg:flex flex-col w-80 border-l border-border bg-muted/10 shrink-0 overflow-hidden">
         
         <!-- Top: Live Transcription Monitor -->
         <div class="h-1/3 border-b border-border p-6 flex flex-col min-h-[220px]">
            <h3 class="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 mb-6 flex items-center gap-2">
               <Icon name="tabler:terminal-2" class="size-4" />
               Transcripción en Vivo
            </h3>
            
            <div 
               ref="transcriptionScrollRef"
               class="flex-1 bg-background rounded-2xl border border-border/50 p-5 overflow-y-auto scroll-smooth font-sans text-[12px] leading-relaxed group shadow-sm relative"
            >
               <div v-if="!transcription.final && !transcription.interim" class="h-full flex flex-col items-center justify-center text-muted-foreground/20">
                  <Icon name="tabler:activity" class="size-8 mb-2 animate-pulse" />
                  <span class="text-[8px] uppercase font-bold tracking-[0.4em] text-center">Silencio</span>
               </div>
                <div v-else class="relative space-y-4">
                   <!-- Collapsible History -->
                   <div v-if="transcriptionHistory" class="space-y-2">
                       <button 
                         @click="showFullHistory = !showFullHistory"
                         class="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-primary/40 hover:text-primary transition-colors"
                       >
                          <Icon :name="showFullHistory ? 'tabler:chevron-down' : 'tabler:chevron-right'" class="size-3" />
                          {{ showFullHistory ? 'Ver Registro' : 'Ver Registro' }}
                       </button>
                       
                       <div v-if="showFullHistory" class="text-muted-foreground font-medium leading-relaxed text-[11px] bg-muted/30 p-4 rounded-xl border border-border/50">
                          {{ transcriptionHistory }}
                          <div class="mt-3 pt-3 border-t border-border/50 flex justify-end">
                             <button @click="appendToEditor(transcriptionHistory)" class="text-[9px] font-black uppercase tracking-widest text-primary/60 hover:text-primary transition-colors">Copiar al editor</button>
                          </div>
                       </div>
                    </div>

                   <!-- Live Partial Stream -->
                    <TransitionGroup 
                      name="word-stream" 
                      tag="p" 
                      class="text-foreground font-bold leading-relaxed flex flex-wrap gap-x-1 gap-y-1 opacity-100"
                    >
                       <span 
                          v-for="word in interimWords" 
                          :key="word.id"
                          class="inline-block text-blue-600 italic"
                       >
                          {{ word.text }}
                       </span>
                   </TransitionGroup>
                </div>

               <!-- Terminal Glow -->
                <div class="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-background to-transparent pointer-events-none opacity-50"></div>
            </div>
         </div>

         <!-- Bottom: Command History -->
         <div class="flex-1 flex flex-col overflow-hidden bg-background">
            <div class="p-6 border-b border-border flex items-center justify-between">
               <h3 class="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Historial</h3>
               <div class="flex items-center gap-3">
                  <button v-if="isSelecting" @click="deleteSelected" class="flex items-center gap-1 text-[9px] font-black text-red-500 bg-red-500/10 px-2 py-1 rounded hover:bg-red-500/20 uppercase tracking-tighter transition-colors">
                     <Icon name="tabler:trash" class="size-3" />
                     Eliminar ({{ selectedIds.size }})
                  </button>
                  <button v-if="!isSelecting" @click="clearAll" class="text-[9px] font-black text-red-500/60 hover:text-red-500 uppercase tracking-tighter transition-colors">
                     Eliminar Todos
                  </button>
                  <button @click="selectAll" class="text-[9px] font-black text-primary hover:text-primary/80 uppercase tracking-tighter transition-colors">
                     {{ selectedIds.size === history.length && history.length > 0 ? 'Deseleccionar' : 'Seleccionar Todo' }}
                  </button>
               </div>
            </div>
            
            <div class="flex-1 overflow-y-auto p-4 space-y-4">
               <div v-if="history.length === 0" class="h-full flex flex-col items-center justify-center text-muted-foreground/10">
                  <Icon name="tabler:archive" class="size-12 mb-2" />
                  <p class="text-[9px] font-black uppercase tracking-widest">Historial Vacío</p>
               </div>
               
               <div 
                 v-for="item in history" 
                 :key="item.id"
                 class="p-4 rounded-xl transition-all group relative border-2"
                 :class="[
                    isActive(item) ? 'bg-primary/5 border-primary shadow-[0_0_15px_rgba(var(--primary-rgb),0.05)]' : 'bg-background border-border hover:border-primary/30',
                    selectedIds.has(item.id) ? 'border-primary ring-2 ring-primary/20' : ''
                 ]"
                 @click="isSelecting ? toggleSelect(item.id) : null"
               >
                  <!-- Selection Indicator -->
                  <div class="absolute -left-3 top-4 z-20">
                     <button @click.stop="toggleSelect(item.id)" class="size-5 rounded-full border-2 border-border bg-background flex items-center justify-center transition-all shadow-sm" :class="{ 'bg-primary border-primary': selectedIds.has(item.id) }">
                        <Icon v-if="selectedIds.has(item.id)" name="tabler:check" class="size-2.5 text-white" stroke-width="4" />
                     </button>
                  </div>

                  <div class="text-[13px] font-medium text-foreground leading-tight line-clamp-3 mb-3">
                     <template v-for="(segment, idx) in parseHTMLContent(item.text)" :key="idx">
                        <Icon v-if="segment.type === 'icon'" :name="segment.value" :class="segment.class" />
                        <span v-else v-html="segment.value" :class="segment.class"></span>
                     </template>
                  </div>

                  <div class="flex items-center justify-between">
                     <div class="flex items-center gap-2">
                        <span class="text-[9px] font-black text-muted-foreground/30 uppercase tracking-tighter">{{ new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</span>
                        <div v-if="isActive(item)" class="size-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
                     </div>
                     <div class="flex items-center gap-1">
                         <button @click.stop="resendFromHistory(item)" class="p-1.5 text-muted-foreground/40 hover:text-primary transition-colors" title="Reenviar">
                            <Icon name="tabler:send" class="size-4" />
                         </button>
                         <button @click.stop="deleteItem(item.id)" class="p-1.5 text-muted-foreground/40 hover:text-red-500 transition-colors" title="Eliminar">
                            <Icon name="tabler:trash" class="size-4" />
                         </button>
                     </div>
                  </div>
               </div>
            </div>
         </div>
      </aside>

    </div>

    <!-- Mobile History Popup -->
    <GSheet v-model="showMobileHistory">
        <div class="flex flex-col h-full bg-background p-8">
          <div class="flex items-center justify-between mb-8">
             <h2 class="text-lg font-black uppercase tracking-[0.2em]">Cola en Vivo</h2>
             <div class="flex items-center gap-4">
                <button @click="clearAll" class="text-[10px] font-bold uppercase text-red-500">Limpiar Todo</button>
                <button @click="showMobileHistory = false" class="text-muted-foreground hover:text-foreground transition-colors"><Icon name="tabler:x" class="size-8" /></button>
             </div>
          </div>
          
          <div class="flex-1 overflow-y-auto space-y-4">
             <div 
               v-for="item in history" 
               :key="item.id"
               @click="resendFromHistory(item); showMobileHistory = false"
               class="p-5 rounded-2xl border-2 border-border bg-muted/20 active:bg-primary/10 active:border-primary transition-all flex items-center gap-5 shadow-sm"
             >
                <div class="flex-1 min-w-0">
                   <div class="flex items-center justify-between mb-2">
                      <span class="text-[10px] font-black text-muted-foreground/40 uppercase">{{ new Date(item.createdAt).toLocaleTimeString() }}</span>

                   </div>
                   <div class="text-[15px] font-bold truncate text-foreground">
                      {{ item.text.replace(/<[^>]+>/g, '') }}
                   </div>
                </div>
                <Icon name="tabler:chevron-right" class="size-6 text-muted-foreground" />
             </div>
          </div>
        </div>
    </GSheet>

    <!-- Mobile History Trigger -->
    <button 
        @click="showMobileHistory = true"
        class="lg:hidden fixed bottom-8 right-8 size-16 bg-primary text-primary-foreground rounded-full shadow-2xl flex items-center justify-center z-50 active:scale-90 transition-transform shadow-primary/20"
    >
        <Icon name="tabler:history" class="size-8" />
    </button>
    
    <!-- Help Commands Sheet -->
    <GSheet v-model="showHelp">
        <div class="flex flex-col bg-background p-8">
          <div class="flex items-center justify-between mb-8">
             <h2 class="text-lg font-black uppercase tracking-[0.2em]">Comandos de Teclado</h2>
             <button @click="showHelp = false" class="text-muted-foreground hover:text-foreground transition-colors"><Icon name="tabler:x" class="size-8" /></button>
          </div>
          <div class="grid gap-3">
             <div class="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/20">
                <span class="text-[12px] font-bold">En Pantalla / Apagar</span>
                <span class="text-[11px] font-mono bg-background border border-border px-2 py-1 rounded">{{ isMac ? 'CMD' : 'CTRL' }} + L</span>
             </div>
             <div class="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/20">
                <span class="text-[12px] font-bold">Enviar Texto</span>
                <span class="text-[11px] font-mono bg-background border border-border px-2 py-1 rounded">{{ isMac ? 'CMD' : 'CTRL' }} + ENTER</span>
             </div>
             <div class="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/20">
                <span class="text-[12px] font-bold">Transcripción en vivo</span>
                <span class="text-[11px] font-mono bg-background border border-border px-2 py-1 rounded">{{ isMac ? 'CMD' : 'CTRL' }} + V</span>
             </div>
          </div>
        </div>
    </GSheet>

  </div>
</template>

<style scoped>
/* High contrast terminal feel for transcription */
::-webkit-scrollbar {
  width: 5px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 10px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--primary);
}

/* Streaming word animation */
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
