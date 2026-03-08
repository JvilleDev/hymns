<script setup lang="ts">
import { toast } from 'vue-sonner'
import { useAnnouncementIcons } from '~/composables/useAnnouncementIcons'
import { onKeyStroke } from '@vueuse/core'

const { announcement, setAnnouncement, transcription, setTranscriptionActive, connect, socket, isConnected } = useRealtime()
const { getAnnouncements, createAnnouncement, deleteAnnouncement, clearAnnouncements, deleteSelectedAnnouncements } = useApi()
const { icons: availableIcons } = useAnnouncementIcons()

const textInput = ref('')
const position = ref<'top' | 'bottom'>('bottom')
const isLoading = ref(false)
const history = ref<any[]>([])
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const showMobileHistory = ref(false)

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

// Autocomplete State
const showIconMenu = ref(false)
const iconMenuIndex = ref(0)
const slashQuery = ref('')

// Computed Filtered Icons
const filteredIcons = computed(() => {
  if (!slashQuery.value) return availableIcons
  return availableIcons.filter(icon => 
    icon.name.toLowerCase().includes(slashQuery.value.toLowerCase()) || 
    icon.label.toLowerCase().includes(slashQuery.value.toLowerCase())
  )
})

const menuStyle = ref({})

// Textarea specific logic
const checkSlashCommand = () => {
  if (!textareaRef.value) return
  
  const el = textareaRef.value as HTMLTextAreaElement
  const cursorPosition = el.selectionStart
  const text = textInput.value
  
  const textBeforeCursor = text.slice(0, cursorPosition)
  const lastSlashIndex = textBeforeCursor.lastIndexOf('/')
  
  if (lastSlashIndex !== -1) {
     const command = textBeforeCursor.slice(lastSlashIndex + 1)
     // Check if there's any space between slash and cursor
     if (!/\s/.test(command)) {
         showIconMenu.value = true
         slashQuery.value = command
         iconMenuIndex.value = 0
         
         // Use a more approximate positioning for the menu since we can't easily get precise XY coords in textarea
         // or use a fixed position relative to the textarea
         const rect = el.getBoundingClientRect()
         menuStyle.value = {
             position: 'fixed',
             left: `${rect.left}px`,
             bottom: `${window.innerHeight - rect.top + 8}px`, // Keep it simple: above or simple dropdown
             width: '20rem',
             zIndex: 9999
         }
         return
     }
  }
  
  showIconMenu.value = false
  slashQuery.value = ''
}

const insertIcon = (icon: any) => {
  if (!textareaRef.value) return
  
  const el = textareaRef.value as HTMLTextAreaElement
  const cursorPosition = el.selectionStart
  const text = textInput.value
  
  const textBeforeCursor = text.slice(0, cursorPosition)
  const lastSlashIndex = textBeforeCursor.lastIndexOf('/')
  
  if (lastSlashIndex !== -1) {
      const prefix = text.slice(0, lastSlashIndex)
      const suffix = text.slice(cursorPosition)
      
      const newText = `${prefix}/${icon.name} ${suffix}`
      textInput.value = newText
      
      // Move cursor to end of inserted icon
      nextTick(() => {
          const newCursorPos = lastSlashIndex + icon.name.length + 2 // +1 for slash, +1 for space
          el.focus()
          el.setSelectionRange(newCursorPos, newCursorPos)
      })
  }
  
  showIconMenu.value = false
  slashQuery.value = ''
}


const menuContainerRef = ref<HTMLElement | null>(null)
const iconRef = ref<HTMLElement[]>([])

// VueUse Shortcuts
onKeyStroke(['Enter'], (e) => {
  if ((e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    sendAnnouncement()
    return
  }

  if (showIconMenu.value) {
    e.preventDefault()
    if (filteredIcons.value.length > 0) {
        insertIcon(filteredIcons.value[iconMenuIndex.value])
    }
  }
}, { target: textareaRef })

onKeyStroke(['Tab'], (e) => {
  if (showIconMenu.value) {
    e.preventDefault()
    if (filteredIcons.value.length > 0) {
        insertIcon(filteredIcons.value[iconMenuIndex.value])
    }
  }
}, { target: textareaRef })

onKeyStroke(['ArrowDown'], (e) => {
  if (showIconMenu.value) {
    e.preventDefault()
    iconMenuIndex.value = (iconMenuIndex.value + 1) % filteredIcons.value.length
    scrollToActive()
  }
}, { target: textareaRef })

onKeyStroke(['ArrowUp'], (e) => {
  if (showIconMenu.value) {
    e.preventDefault()
    iconMenuIndex.value = (iconMenuIndex.value - 1 + filteredIcons.value.length) % filteredIcons.value.length
    scrollToActive()
  }
}, { target: textareaRef })

onKeyStroke(['l', 'L'], (e) => {
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault()
    toggleVisibility()
  }
})

onKeyStroke(['Escape'], (e) => {
  if (showIconMenu.value) {
    showIconMenu.value = false
  } else {
    textInput.value = ''
  }
}, { target: textareaRef })

const scrollToActive = () => {
    nextTick(() => {
        if (!iconRef.value || !iconRef.value[iconMenuIndex.value] || !menuContainerRef.value) return
        
        const activeEl = iconRef.value[iconMenuIndex.value]
        const container = menuContainerRef.value
        
        if (activeEl.offsetTop + activeEl.clientHeight > container.scrollTop + container.clientHeight) {
            container.scrollTop = activeEl.offsetTop + activeEl.clientHeight - container.clientHeight
        } else if (activeEl.offsetTop < container.scrollTop) {
            container.scrollTop = activeEl.offsetTop
        }
    })
}

const fetchHistory = async () => {
  try {
    history.value = await getAnnouncements()
  } catch (e) {
    toast.error('Error al cargar historial')
  }
}

const autoSendToAir = ref(true)

const sendAnnouncement = async () => {
  if (!textInput.value) return

  isLoading.value = true
  try {
    // 1. Save to history
    await createAnnouncement(textInput.value, position.value)
    
    // 2. Activate on screen (only if auto-send is enabled)
    if (autoSendToAir.value) {
        setAnnouncement({
          text: textInput.value,
          active: true,
          position: position.value
        })
    }

    toast.success(autoSendToAir.value ? 'Anuncio enviado y guardado' : 'Anuncio guardado en historial')
    textInput.value = ''
    fetchHistory()
  } catch (e) {
    toast.error('Error al enviar anuncio')
  } finally {
    isLoading.value = false
  }
}

const toggleVisibility = () => {
  setAnnouncement({
    text: announcement.value.text,
    active: !announcement.value.active,
    position: announcement.value.position
  })
}

const resendFromHistory = (item: any) => {
  textInput.value = item.text
  position.value = item.position || 'bottom'
  setAnnouncement({
    text: item.text,
    active: true,
    position: item.position || 'bottom'
  })
  toast.success('Anuncio enviado')
}

const deleteItem = async (id: string) => {
  try {
    await deleteAnnouncement(id)
    fetchHistory()
  } catch (e) {
    toast.error('Error al eliminar')
  }
}

// Parse announcement text to render icons
const parseContent = (text: string) => {
  const segments: Array<{ type: 'text' | 'icon', value: string, class?: string }> = []
  const regex = /\/([a-zA-Z0-9-]+)/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    // Add text before icon
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        value: text.slice(lastIndex, match.index)
      })
    }

    // Find icon
    const iconName = match[1]
    const icon = availableIcons.find(i => i.name === iconName)
    
    if (icon) {
      segments.push({
        type: 'icon',
        value: icon.icon,
        class: 'inline-block size-6 md:size-7'
      })
    } else {
      // If icon not found, keep the text
      segments.push({
        type: 'text',
        value: match[0]
      })
    }

    lastIndex = regex.lastIndex
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      value: text.slice(lastIndex)
    })
  }

  return segments
}

// Watch textInput for slash commands
watch(textInput, () => {
  checkSlashCommand()
})

onMounted(() => {
  connect()
  fetchHistory()
})
</script>

<template>
  <div class="flex-1 flex flex-col w-full min-h-0 overflow-hidden bg-background">
    <div class="flex-1 flex overflow-hidden relative">
      <div class="flex-1 grid grid-cols-1 lg:grid-cols-2 min-h-0 overflow-hidden">
        
        <!-- Left Column: Control Panel -->
        <section class="flex flex-col border-r border-border bg-muted/5 overflow-y-auto p-6 md:p-8 w-full">
          <div class="space-y-6">
            <div class="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
              <div class="flex items-start justify-between">
                <div>
                  <h2 class="text-lg font-bold tracking-tight mb-1">Crear Anuncio</h2>
                  <p class="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted border border-border text-[9px] font-mono leading-none">
                      <Icon name="tabler:command" class="size-2.5" />
                      ENTER
                    </span>
                    para enviar
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <div class="size-2 rounded-full" :class="isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500 animate-pulse'"></div>
                  <span class="text-[10px] font-bold uppercase tracking-tight text-muted-foreground/70">
                    {{isConnected ? "Conectado" : "Desconectado"}}
                  </span>
                </div>
              </div>

              <div class="space-y-4">
                <div class="relative">
                  <!-- Icon Autocomplete Menu -->
                  <Teleport to="body">
                    <div 
                      v-if="showIconMenu && filteredIcons.length > 0"
                      class="bg-popover border border-border rounded-lg shadow-lg overflow-hidden flex flex-col"
                      :style="menuStyle"
                    >
                      <div class="p-2 bg-muted/50 text-[10px] uppercase font-bold text-muted-foreground border-b border-border">
                        Insertar Icono
                      </div>
                      <div class="max-h-48 overflow-y-auto p-1" ref="menuContainerRef">
                        <button
                          v-for="(icon, idx) in filteredIcons"
                          :key="icon.name"
                          ref="iconRef"
                          class="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors"
                          :class="idx === iconMenuIndex ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'"
                          @click="insertIcon(icon)"
                        >
                           <Icon :name="icon.icon" class="size-4" />
                           <span class="font-bold font-mono text-xs bg-muted border border-border px-1.5 py-0.5 rounded shadow-sm text-foreground">/{{ icon.name }}</span>
                           <span class="ml-auto text-xs opacity-70">{{ icon.label }}</span>
                        </button>
                      </div>
                    </div>
                  </Teleport>

                  <!-- Contenteditable div with icon rendering -->
                  <textarea
                    ref="textareaRef"
                    v-model="textInput"
                    class="announcement-input w-full min-h-[6rem] bg-background border border-border rounded-lg p-4 text-lg focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium resize-none"
                    :class="{ 'border-primary/50 ring-2 ring-primary/10': showIconMenu }"
                    style="max-height: 12rem;"
                    placeholder="Escribe un anuncio..."
                  ></textarea>
                  
                  <!-- Command Indicator Badge -->
                  <div 
                    v-if="showIconMenu"
                    class="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded bg-primary/10 border border-primary/20 text-[10px] font-bold text-primary animate-in fade-in zoom-in duration-200"
                  >
                    <Icon name="tabler:terminal-2" class="size-3" />
                    MODO COMANDO
                  </div>
                  
                  <div class="absolute bottom-3 right-3 text-xs text-muted-foreground pointer-events-none">
                    {{ textInput.length }} caracteres
                  </div>
                </div>

                <div class="flex flex-col gap-3">
                  <div class="flex items-center justify-between">
                    <label class="text-sm font-bold">Posición</label>
                    <div class="flex gap-2">
                      <button 
                        @click="position = 'top'" 
                        class="px-4 py-2 rounded-lg text-sm font-bold transition-all"
                        :class="position === 'top' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted/80'"
                      >
                        Arriba
                      </button>
                      <button 
                        @click="position = 'bottom'" 
                        class="px-4 py-2 rounded-lg text-sm font-bold transition-all"
                        :class="position === 'bottom' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted/80'"
                      >
                        Abajo
                      </button>
                    </div>
                  </div>

                  <div class="flex items-center justify-between">
                    <div>
                      <label class="text-sm font-bold block">Enviar al aire automáticamente</label>
                      <p class="text-xs text-muted-foreground">Mostrar inmediatamente en pantalla</p>
                    </div>
                    <GSwitch v-model="autoSendToAir" />
                  </div>

                  <div class="pt-4 border-t border-border">
                    <div class="bg-primary/5 border border-primary/10 rounded-xl p-4 space-y-4">
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                          <div class="size-10 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
                            <Icon name="tabler:message-chatbot" class="size-5 text-primary" />
                          </div>
                          <div>
                            <label class="text-sm font-bold block">Transcripción Automática</label>
                            <p class="text-[10px] text-muted-foreground">Sustituye cantos y anuncios</p>
                          </div>
                        </div>
                        <GSwitch 
                          :model-value="transcription.active" 
                          @update:model-value="setTranscriptionActive" 
                        />
                      </div>
                      
                      <div v-if="transcription.active" class="bg-background/50 rounded-lg p-3 border border-primary/10 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div class="flex items-center gap-2 mb-2">
                           <div class="size-1.5 bg-red-500 rounded-full animate-pulse"></div>
                           <span class="text-[9px] font-bold text-red-500 uppercase tracking-widest">Capturando...</span>
                        </div>
                        <p class="text-xs text-foreground font-medium italic line-clamp-2">
                          {{ transcription.final }}
                          <span class="text-primary/60">{{ transcription.interim }}</span>
                          <span v-if="!transcription.final && !transcription.interim">Esperando voz...</span>
                        </p>
                      </div>

                      <NuxtLink 
                        to="/transcripcion" 
                        target="_blank"
                        class="flex items-center justify-center gap-2 w-full py-2 text-[10px] font-bold text-primary hover:bg-primary/5 rounded-lg transition-colors border border-primary/20 bg-background"
                      >
                        <Icon name="tabler:external-link" class="size-3" />
                        ABRIR TRANSPORTE DE VOZ
                      </NuxtLink>
                    </div>
                  </div>
                </div>

                <GButton 
                  @click="sendAnnouncement" 
                  :disabled="!textInput || isLoading"
                  variant="default"
                  size="lg"
                  class="w-full font-bold"
                >
                  <Icon name="tabler:send" class="size-5 mr-2" />
                  {{ autoSendToAir ? 'Enviar y Guardar' : 'Guardar en Historial' }}
                </GButton>
              </div>
            </div>

            <!-- Live Preview Card -->
            <div class="relative overflow-hidden group">
              <div 
                class="absolute inset-0 bg-gradient-to-br transition-all duration-500"
                :class="announcement.active ? 'from-green-500/10 via-transparent to-primary/5 opacity-100' : 'from-muted/20 to-transparent opacity-50'"
              ></div>
              
              <div class="relative bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <div class="flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider"
                      :class="announcement.active 
                        ? 'bg-green-500/10 border-green-500/20 text-green-600' 
                        : 'bg-muted border-border text-muted-foreground'"
                    >
                      <span v-if="announcement.active" class="relative flex h-2 w-2">
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                      </span>
                      {{ announcement.active ? 'Mostrando' : 'Oculto' }}
                    </div>
                  </div>
                  
                  <div class="flex items-center gap-3">
                    <p class="hidden md:block text-[10px] text-muted-foreground font-mono">
                      <span class="px-1 border rounded bg-muted">⌘</span> + L
                    </p>
                    <button 
                      @click="toggleVisibility" 
                      class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 bg-muted"
                      :class="{ 'bg-primary': announcement.active }"
                    >
                      <span 
                        class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                        :class="announcement.active ? 'translate-x-5' : 'translate-x-0'"
                      ></span>
                    </button>
                  </div>
                </div>

                <div class="min-h-[3rem] flex items-center transition-all duration-300" :class="{ 'opacity-50 blur-[1px]': !announcement.active }">
                  <p v-if="announcement.text" class="text-lg font-bold text-foreground leading-tight">
                    <template v-for="(segment, idx) in parseContent(announcement.text)" :key="idx">
                      <Icon 
                        v-if="segment.type === 'icon'" 
                        :name="segment.value" 
                        :class="segment.class"
                      />
                      <span v-else>{{ segment.value }}</span>
                    </template>
                  </p>
                  <p v-else class="text-sm italic text-muted-foreground">No hay anuncio activo</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Right Column: History (Desktop) -->
        <section class="hidden lg:flex flex-col bg-background overflow-hidden border-l border-border">
          <div class="flex-1 flex flex-col overflow-hidden">
            <div class="px-6 pt-6 pb-4 border-b border-border shrink-0 flex items-center justify-between">
              <div>
                <h2 class="text-lg font-bold tracking-tight mb-1">Historial</h2>
                <p class="text-xs text-muted-foreground">Gestiona tus anuncios previos</p>
              </div>
              <div class="flex items-center gap-2">
                <GButton 
                  v-if="isSelecting"
                  @click="deleteSelected"
                  variant="ghost" 
                  size="sm" 
                  class="text-red-500 hover:text-red-600 hover:bg-red-50"
                >
                  <Icon name="tabler:trash" class="size-4 mr-1" />
                  Borrar ({{ selectedIds.size }})
                </GButton>
                <GButton 
                  v-if="history.length > 0"
                  @click="clearAll"
                  variant="ghost" 
                  size="sm" 
                  class="text-muted-foreground hover:text-red-600 hover:bg-red-50"
                >
                  Limpiar Todo
                </GButton>
              </div>
            </div>

            <div v-if="history.length === 0" class="flex flex-col items-center justify-center h-full text-center p-6">
              <Icon name="tabler:history" class="size-12 text-muted-foreground/20 mb-4" />
              <p class="text-sm text-muted-foreground font-medium">No hay historial de anuncios</p>
            </div>

            <div v-else class="flex-1 overflow-y-auto px-6 py-4">
              <div class="flex items-center justify-between mb-4 px-2">
                <button @click="selectAll" class="text-xs font-bold text-primary hover:underline flex items-center gap-1.5">
                  <Icon :name="selectedIds.size === history.length ? 'tabler:square-rounded-minus' : 'tabler:square-rounded-check'" class="size-4" />
                  {{ selectedIds.size === history.length ? 'Deseleccionar todo' : 'Seleccionar todo' }}
                </button>
              </div>

              <div class="grid gap-4">
                <div 
                  v-for="item in history" 
                  :key="item.id"
                  class="group relative flex items-start gap-4 p-5 bg-card hover:bg-muted/10 border border-border hover:border-primary/20 rounded-xl transition-all shadow-sm"
                  :class="{ 'border-primary bg-primary/5 ring-1 ring-primary/20': selectedIds.has(item.id) }"
                >
                  <!-- Checkbox area -->
                  <div class="pt-1">
                    <button 
                      @click="toggleSelect(item.id)"
                      class="size-5 rounded border-2 transition-all flex items-center justify-center"
                      :class="selectedIds.has(item.id) ? 'bg-primary border-primary text-white' : 'border-muted-foreground/30 hover:border-primary/50 bg-background'"
                    >
                      <Icon v-if="selectedIds.has(item.id)" name="tabler:check" class="size-3" stroke-width="3" />
                    </button>
                  </div>

                  <div class="flex-1 min-w-0 pr-2">
                    <div class="flex items-start justify-between mb-2">
                      <span class="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">
                        {{ new Date(item.createdAt).toLocaleDateString() }} - {{ new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
                      </span>
                      <div class="px-2 py-0.5 rounded bg-muted/50 text-[10px] uppercase font-bold text-muted-foreground border border-border/50">
                        {{ item.position === 'top' ? 'Arriba' : 'Abajo' }}
                      </div>
                    </div>

                    <div class="text-base font-bold text-foreground leading-tight inline-flex flex-wrap items-center gap-x-1 mb-4">
                      <template v-for="(segment, idx) in parseContent(item.text)" :key="idx">
                        <Icon 
                          v-if="segment.type === 'icon'" 
                          :name="segment.value" 
                          :class="segment.class"
                        />
                        <span v-else>{{ segment.value }}</span>
                      </template>
                    </div>

                    <div class="flex items-center gap-2">
                      <GButton @click="resendFromHistory(item)" variant="secondary" size="sm" class="h-8 gap-1.5 px-3">
                        <Icon name="tabler:send" class="size-3.5" />
                        Reenviar
                      </GButton>
                      <button @click="deleteItem(item.id)" class="p-1.5 text-muted-foreground hover:text-red-500 transition-colors">
                        <Icon name="tabler:trash" class="size-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

      </div>

      <!-- Mobile History Popup -->
      <GSheet v-model="showMobileHistory">
        <div class="flex flex-col h-full bg-background">
          <div class="px-6 pt-6 pb-4 border-b border-border shrink-0 flex items-center justify-between">
            <div>
              <h2 class="text-lg font-bold tracking-tight mb-1">Historial</h2>
              <p class="text-xs text-muted-foreground">Gestiona tus anuncios</p>
            </div>
            <div class="flex items-center gap-2">
               <GButton 
                v-if="history.length > 0"
                @click="clearAll"
                variant="ghost" 
                size="sm" 
                class="text-red-500"
              >
                Limpiar Todo
              </GButton>
            </div>
          </div>

          <div v-if="history.length === 0" class="flex flex-col items-center justify-center flex-1 text-center p-6">
            <Icon name="tabler:history" class="size-12 text-muted-foreground/20 mb-4" />
            <p class="text-sm text-muted-foreground font-medium">No hay historial</p>
          </div>

          <div v-else class="flex-1 overflow-y-auto px-6 py-4">
            <div class="flex items-center justify-between mb-4">
               <div class="flex items-center gap-2">
                  <GButton 
                    v-if="isSelecting"
                    @click="deleteSelected"
                    variant="default" 
                    size="sm" 
                    class="bg-red-500 hover:bg-red-600 h-8"
                  >
                    Borrar seleccionados ({{ selectedIds.size }})
                  </GButton>
                  <button v-else @click="selectAll" class="text-xs font-bold text-primary">
                    Seleccionar todo
                  </button>
               </div>
               <button v-if="isSelecting" @click="selectedIds.clear()" class="text-xs font-bold text-muted-foreground">
                  Cancelar
               </button>
            </div>

            <div class="grid gap-3">
              <div 
                v-for="item in history" 
                :key="item.id"
                class="flex items-center gap-3 p-4 bg-muted/30 border border-border rounded-xl active:scale-[0.98] transition-transform"
                :class="{ 'border-primary bg-primary/5': selectedIds.has(item.id) }"
                @click="isSelecting ? toggleSelect(item.id) : null"
              >
                 <div v-if="isSelecting || true" class="shrink-0">
                    <button 
                      @click.stop="toggleSelect(item.id)"
                      class="size-5 rounded border-2 transition-all flex items-center justify-center"
                      :class="selectedIds.has(item.id) ? 'bg-primary border-primary text-white' : 'border-muted-foreground/30 bg-background'"
                    >
                      <Icon v-if="selectedIds.has(item.id)" name="tabler:check" class="size-3" stroke-width="3" />
                    </button>
                 </div>

                <div class="flex-1 min-w-0" @click="!isSelecting && resendFromHistory(item); !isSelecting && (showMobileHistory = false)">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest">
                      {{ new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
                    </span>
                    <div class="px-1.5 py-0.5 rounded bg-muted/50 text-[8px] uppercase font-bold text-muted-foreground border border-border/50">
                      {{ item.position === 'top' ? 'Arriba' : 'Abajo' }}
                    </div>
                  </div>
                  <div class="text-sm font-bold text-foreground leading-tight truncate">
                    <template v-for="(segment, idx) in parseContent(item.text)" :key="idx">
                      <Icon 
                        v-if="segment.type === 'icon'" 
                        :name="segment.value" 
                        :class="segment.class"
                      />
                      <span v-else>{{ segment.value }}</span>
                    </template>
                  </div>
                </div>

                <GButton v-if="!isSelecting" @click.stop="resendFromHistory(item); showMobileHistory = false" variant="ghost" size="icon" class="size-8">
                  <Icon name="tabler:send" class="size-4" />
                </GButton>
              </div>
            </div>
          </div>
        </div>
      </GSheet>

      <!-- Mobile History Button -->
      <button 
        @click="showMobileHistory = true"
        class="lg:hidden absolute bottom-6 right-6 size-12 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center justify-center z-40 transition-transform active:scale-95"
      >
        <Icon name="tabler:history" class="size-6" />
      </button>

    </div>
  </div>
</template>

