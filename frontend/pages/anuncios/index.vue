<script setup lang="ts">
import { toast } from 'vue-sonner'
import { useAnnouncementIcons } from '~/composables/useAnnouncementIcons'

const { announcement, setAnnouncement, connect, socket } = useSocket()
const { getAnnouncements, createAnnouncement, deleteAnnouncement } = useApi()
const { icons: availableIcons } = useAnnouncementIcons()

const textInput = ref('')
const position = ref<'top' | 'bottom'>('bottom')
const isLoading = ref(false)
const history = ref<any[]>([])
const textareaRef = ref<HTMLDivElement | null>(null)
const showMobileHistory = ref(false)

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

// Get plain text from contenteditable
const getPlainText = (el: HTMLElement): string => {
  return el.textContent || ''
}

// Render content with icons in contenteditable
const renderContent = () => {
  if (!textareaRef.value) return
  
  const el = textareaRef.value
  const segments = parseContent(textInput.value)
  
  // Save cursor position
  const selection = window.getSelection()
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null
  const cursorOffset = range?.startOffset || 0
  
  // Clear and rebuild content
  el.innerHTML = ''
  
  segments.forEach(segment => {
    if (segment.type === 'icon') {
      const iconSpan = document.createElement('span')
      iconSpan.className = 'icon-wrapper inline-block align-middle mx-0.5'
      iconSpan.contentEditable = 'false'
      iconSpan.setAttribute('data-icon', segment.value)
      
      const iconEl = document.createElement('span')
      iconEl.className = 'iconify size-6 inline-block'
      iconEl.setAttribute('data-icon', segment.value)
      iconSpan.appendChild(iconEl)
      
      el.appendChild(iconSpan)
    } else {
      const textNode = document.createTextNode(segment.value)
      el.appendChild(textNode)
    }
  })
  
  // Restore cursor (simplified - place at end)
  nextTick(() => {
    const newRange = document.createRange()
    const sel = window.getSelection()
    
    if (el.childNodes.length > 0) {
      const lastNode = el.childNodes[el.childNodes.length - 1]
      if (lastNode.nodeType === Node.TEXT_NODE) {
        newRange.setStart(lastNode, lastNode.textContent?.length || 0)
      } else {
        newRange.setStartAfter(lastNode)
      }
      newRange.collapse(true)
      sel?.removeAllRanges()
      sel?.addRange(newRange)
    }
    
    el.focus()
  })
}

const handleContentEditableInput = (e: Event) => {
  const el = e.target as HTMLDivElement
  const text = getPlainText(el)
  textInput.value = text
  
  checkSlashCommand()
}

const checkSlashCommand = () => {
  if (!textareaRef.value) return
  
  const el = textareaRef.value
  const text = getPlainText(el)
  
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return
  
  const range = selection.getRangeAt(0)
  let cursorPos = 0
  
  // Calculate cursor position in plain text
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null)
  let node
  while (node = walker.nextNode()) {
    if (node === range.startContainer) {
      cursorPos += range.startOffset
      break
    }
    cursorPos += node.textContent?.length || 0
  }
  
  const textBeforeCursor = text.slice(0, cursorPos)
  const lastSlashIndex = textBeforeCursor.lastIndexOf('/')
  
  if (lastSlashIndex !== -1) {
     const command = textBeforeCursor.slice(lastSlashIndex + 1)
     if (!/\s/.test(command)) {
         showIconMenu.value = true
         slashQuery.value = command
         iconMenuIndex.value = 0
         
         const rect = el.getBoundingClientRect()
         menuStyle.value = {
             position: 'fixed',
             left: `${rect.left}px`,
             bottom: `${window.innerHeight - rect.top + 8}px`,
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
  
  const el = textareaRef.value
  const text = textInput.value
  
  const lastSlashIndex = text.lastIndexOf('/')
  
  if (lastSlashIndex !== -1) {
      const prefix = text.slice(0, lastSlashIndex)
      const suffix = text.slice(lastSlashIndex + slashQuery.value.length + 1)
      
      textInput.value = `${prefix}/${icon.name} ${suffix}`
  }
  
  showIconMenu.value = false
  slashQuery.value = ''
}

const menuContainerRef = ref<HTMLElement | null>(null)
const iconRef = ref<HTMLElement[]>([])

const handleKeydown = (e: KeyboardEvent) => {
  if (!showIconMenu.value) return
  
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    iconMenuIndex.value = (iconMenuIndex.value + 1) % filteredIcons.value.length
    scrollToActive()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    iconMenuIndex.value = (iconMenuIndex.value - 1 + filteredIcons.value.length) % filteredIcons.value.length
    scrollToActive()
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault()
    if (filteredIcons.value.length > 0) {
        insertIcon(filteredIcons.value[iconMenuIndex.value])
    }
  } else if (e.key === 'Escape') {
    showIconMenu.value = false
  }
}

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

// Watch textInput and render content
watch(textInput, () => {
  if (textareaRef.value) {
    renderContent()
  }
})

onMounted(() => {
  connect()
  fetchHistory()
  if (textareaRef.value) {
    renderContent()
  }
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
                  <p class="text-xs text-muted-foreground">Escribe y envía mensajes a la pantalla</p>
                </div>
                <div class="flex items-center gap-2">
                  <div class="size-2 rounded-full" :class="socket?.connected ? 'bg-green-500' : 'bg-red-500 animate-pulse'"></div>
                  <span class="text-[10px] font-bold uppercase tracking-tight" :class="socket?.connected ? 'text-green-600/70' : 'text-red-600/70'">
                    {{ socket?.connected ? 'En Vivo' : 'Desconectado' }}
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
                  <div
                    ref="textareaRef"
                    contenteditable="true"
                    @input="handleContentEditableInput"
                    @keydown="handleKeydown"
                    class="announcement-input w-full min-h-[6rem] bg-background border border-border rounded-lg p-4 text-lg focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium overflow-y-auto"
                    style="max-height: 12rem;"
                  ></div>
                  
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

            <div v-if="announcement.text" class="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
              <div class="flex items-center justify-between">
                <h3 class="text-sm font-bold uppercase tracking-widest text-muted-foreground">En Pantalla</h3>
                <div class="flex items-center gap-2">
                  <span class="text-xs font-bold" :class="announcement.active ? 'text-green-600' : 'text-muted-foreground'">
                    {{ announcement.active ? 'Visible' : 'Oculto' }}
                  </span>
                  <GButton @click="toggleVisibility" variant="secondary" size="icon" class="size-8">
                    <Icon :name="announcement.active ? 'tabler:eye-off' : 'tabler:eye'" class="size-4" />
                  </GButton>
                </div>
              </div>
              <p class="text-base font-bold text-foreground">{{ announcement.text }}</p>
            </div>
          </div>
        </section>

        <!-- Right Column: History (Desktop) -->
        <section class="hidden lg:flex flex-col bg-background overflow-hidden">
          <div class="flex-1 flex flex-col overflow-hidden">
            <div class="px-6 pt-6 pb-4 border-b border-border shrink-0">
              <h2 class="text-lg font-bold tracking-tight mb-1">Historial</h2>
              <p class="text-xs text-muted-foreground">Doble clic para reenviar</p>
            </div>

            <div v-if="history.length === 0" class="flex flex-col items-center justify-center h-full text-center border-2 border-dashed border-border rounded-2xl bg-muted/5 lg:my-10">
              <Icon name="tabler:history" class="size-12 text-muted-foreground/20 mb-4" />
              <p class="text-sm text-muted-foreground font-medium">No hay historial de anuncios</p>
              <p class="text-xs text-muted-foreground/60 mt-1 italic">Los mensajes que envíes aparecerán aquí</p>
            </div>

            <div v-else class="flex-1 overflow-y-auto px-6 py-4">
              <div class="grid gap-4">
                <div 
                  v-for="item in history" 
                  :key="item.id"
                  class="group flex flex-col p-5 bg-card hover:bg-muted/20 border border-border hover:border-primary/20 rounded-xl transition-all shadow-sm active:scale-[0.99] cursor-default"
                  @dblclick="resendFromHistory(item)"
                >
                  <div class="flex items-start justify-between mb-3">
                    <div class="flex flex-col min-w-0 pr-4">
                      <span class="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-1">
                        {{ new Date(item.createdAt).toLocaleDateString() }} - {{ new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
                      </span>
                      <div class="text-base font-bold text-foreground leading-tight inline-flex flex-wrap items-center gap-x-1">
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
                    
                    <div class="flex items-center gap-1 shrink-0">
                      <div class="mr-2 px-2 py-1 rounded bg-muted/50 text-[10px] uppercase font-bold text-muted-foreground border border-border/50">
                          {{ item.position === 'top' ? 'Arriba' : 'Abajo' }}
                      </div>
                      <GButton @click="resendFromHistory(item)" variant="secondary" size="icon" class="size-8 rounded-lg" title="Enviar directamente">
                        <Icon name="tabler:send" class="size-4" />
                      </GButton>
                      <GButton @click="deleteItem(item.id)" variant="ghost" size="icon" class="size-8 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-500/10" title="Eliminar">
                        <Icon name="tabler:trash" class="size-4" />
                      </GButton>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

      </div>

      <!-- Mobile History Popup -->
      <GSheet v-model:open="showMobileHistory">
        <div class="flex flex-col h-full">
          <div class="px-6 pt-6 pb-4 border-b border-border shrink-0">
            <h2 class="text-lg font-bold tracking-tight mb-1">Historial</h2>
            <p class="text-xs text-muted-foreground">Toca para reenviar</p>
          </div>

          <div v-if="history.length === 0" class="flex flex-col items-center justify-center flex-1 text-center p-6">
            <Icon name="tabler:history" class="size-12 text-muted-foreground/20 mb-4" />
            <p class="text-sm text-muted-foreground font-medium">No hay historial de anuncios</p>
          </div>

          <div v-else class="flex-1 overflow-y-auto px-6 py-4">
            <div class="grid gap-4">
              <div 
                v-for="item in history" 
                :key="item.id"
                class="flex flex-col p-5 bg-card border border-border rounded-xl shadow-sm active:scale-[0.99]"
                @click="resendFromHistory(item); showMobileHistory = false"
              >
                <div class="flex items-start justify-between mb-3">
                  <div class="flex flex-col min-w-0 pr-4">
                    <span class="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-1">
                      {{ new Date(item.createdAt).toLocaleDateString() }} - {{ new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
                    </span>
                    <div class="text-base font-bold text-foreground leading-tight inline-flex flex-wrap items-center gap-x-1">
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
                  
                  <div class="px-2 py-1 rounded bg-muted/50 text-[10px] uppercase font-bold text-muted-foreground border border-border/50 shrink-0">
                    {{ item.position === 'top' ? 'Arriba' : 'Abajo' }}
                  </div>
                </div>
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

<style scoped>
.announcement-input:empty:before {
  content: attr(data-placeholder);
  color: hsl(var(--muted-foreground));
  opacity: 0.5;
  pointer-events: none;
}

.announcement-input:focus:before {
  content: '';
}

.icon-wrapper {
  user-select: none;
}
</style>
