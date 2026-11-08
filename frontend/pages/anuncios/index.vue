<script setup lang="ts">
import { toast } from 'vue-sonner'
import { useAnnouncementIcons } from '~/composables/useAnnouncementIcons'
import { onKeyStroke, watchDebounced } from '@vueuse/core'

useHead({ title: 'Anuncios' })

const { 
  announcement, 
  session,
  setAnnouncement, 
  transcription, 
  setTranscriptionActive, 
  connect, 
  isConnected,
} = useRealtime()
const { getAnnouncements, createAnnouncement, deleteAnnouncement, clearAnnouncements, deleteSelectedAnnouncements } = useApi()
const { icons: availableIcons } = useAnnouncementIcons()
const { confirmDialog, promptDialog } = useDialog()

const textInput = ref('')
const DRAFT_KEY = 'anuncios:draft'

// ponytail: borrador en localStorage para no perder lo escrito si la página se recarga
watch(textInput, (val) => {
  localStorage.setItem(DRAFT_KEY, val)
})
const currentTopic = ref(announcement.value.topic || '')
const isLoading = ref(true)
const history = ref<any[]>([])
const transcriptionScrollRef = ref<HTMLElement | null>(null)
const MAX_TRANSCRIPTION_LENGTH = 5000
const transcriptionHistory = computed(() => {
  const text = transcription.value.final || ''
  return text.length > MAX_TRANSCRIPTION_LENGTH ? text.slice(-MAX_TRANSCRIPTION_LENGTH) : text
})
const showFullHistory = ref(false)
const showHelp = ref(false)
const showMediaManager = ref(false)
const isMac = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const isUploading = ref(false)
const mediaList = ref<any[]>([])

const fetchMediaList = async () => {
  try {
    const data = await useApi().getMedia()
    mediaList.value = data
  } catch(e) {
    console.error('Error fetching media', e)
  }
}

const triggerFileUpload = () => {
  fileInput.value?.click()
}

const handleFileUpload = async (e: Event) => {
  const target = e.target as HTMLInputElement
  if (!target.files?.length) return
  const file = target.files[0]
  if (!file.type.startsWith('image/')) {
    toast.error('Solo se permiten imágenes por ahora')
    return
  }
  isUploading.value = true
  try {
    const name = await promptDialog('Nombre corto para esta imagen (usado con /):', file.name.split('.')[0])
    if (!name) {
      isUploading.value = false
      return
    }
    await useApi().uploadMedia(file, name.toLowerCase().replace(/\s+/g, '-'), 'image')
    toast.success('Imagen subida')
    fetchMediaList()
    useAnnouncementIcons().fetchMediaIcons()
  } catch (err) {
    toast.error('Error al subir imagen')
  } finally {
    isUploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

const deleteMediaItem = async (id: string) => {
  if (!(await confirmDialog('¿Eliminar esta imagen?'))) return
  try {
    await useApi().deleteMedia(id)
    fetchMediaList()
    useAnnouncementIcons().fetchMediaIcons()
    toast.success('Imagen eliminada')
  } catch (e) {
    toast.error('Error al eliminar')
  }
}


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
  if (!(await confirmDialog('¿Estás seguro de que quieres limpiar todo el historial?'))) return
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
  } finally {
    isLoading.value = false
  }
}

const autoSendToAir = ref(true)

// --- Outbox optimista: guarda en localStorage y sincroniza cuando hay conexión ---
type OutboxItem = {
  id: string
  text: string
  topic?: string
  createdAt: number
  status: 'pending' | 'sending' | 'failed'
}
const OUTBOX_KEY = 'anuncios:outbox'
const outbox = ref<OutboxItem[]>([])
const isSyncing = ref(false)

const persistOutbox = () => {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox.value))
}

const loadOutbox = () => {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY)
    outbox.value = raw ? JSON.parse(raw) : []
  } catch {
    outbox.value = []
  }
}

const removeFromOutbox = (id: string) => {
  outbox.value = outbox.value.filter(i => i.id !== id)
  persistOutbox()
}

const flushOutbox = async () => {
  if (isSyncing.value || outbox.value.length === 0) return
  isSyncing.value = true
  const items = [...outbox.value]
  for (const item of items) {
    const wasFailed = item.status === 'failed'
    item.status = 'sending'
    persistOutbox()
    try {
      await createAnnouncement(item.text, item.topic)
      outbox.value = outbox.value.filter(i => i.id !== item.id)
      persistOutbox()
      if (wasFailed) toast.success('Anuncio sincronizado')
    } catch (e) {
      item.status = 'failed'
      persistOutbox()
      toast.error('Sin conexión: el anuncio quedó pendiente')
      break
    }
  }
  isSyncing.value = false
  fetchHistory()
}

const enqueueAnnouncement = (text: string, topic?: string) => {
  outbox.value.push({ id: crypto.randomUUID(), text, topic, createdAt: Date.now(), status: 'pending' })
  persistOutbox()
  flushOutbox()
}

// Al renovar la conexión, sincroniza lo pendiente SIN mandar a live
watch(isConnected, (connected) => {
  if (connected) flushOutbox()
})

const sendAnnouncement = () => {
  if (!textInput.value) return
  const isEmpty = textInput.value.replace(/<[^>]*>?/gm, '').trim().length === 0 && !textInput.value.includes('data-icon')
  if (isEmpty) {
     textInput.value = ''
     return
  }

  const processedText = textInput.value
    .replace(/WSS:/g, '<span class="text-red-600 font-black">WSS:</span>')
    .replace(/WMB/g, '<span class="text-purple-600 font-black">WMB</span>')

  if (autoSendToAir.value) {
      setAnnouncement({
        text: processedText,
        active: true,
      })
  }

  enqueueAnnouncement(processedText, currentTopic.value)
  toast.success(autoSendToAir.value ? 'Anuncio enviado' : 'Anuncio guardado')
  textInput.value = ''
}

const isActive = (item: any) => {
  return announcement.value.active && announcement.value.text === item.text
}

const toggleVisibility = () => {
  const willBeActive = !announcement.value.active
  setAnnouncement({
    text: announcement.value.text,
    active: willBeActive,
  })
  if (willBeActive) {
    toast.success('Anuncio en pantalla')
  } else {
    toast.info('Anuncio oculto')
  }
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
            const iconDef = availableIcons.value.find(i => i.name === iconName)
            if (iconDef) {
                 let iconColorClass = ''
                 if (iconName === 'david') iconColorClass = 'text-primary'
                 
                 if (iconDef.url) {
                     segments.push({
                         type: 'image',
                         value: iconDef.url,
                         class: 'inline-block align-text-bottom mx-1 max-h-[1.5em] rounded object-contain'
                     } as any)
                 } else {
                     segments.push({
                         type: 'icon',
                         value: iconDef.icon,
                         class: `inline-block align-text-bottom mb-1 size-[1.1em] ${iconColorClass}`
                     })
                 }
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

watch(showMediaManager, (val) => {
  if (val) fetchMediaList()
})

onMounted(() => {
  textInput.value = localStorage.getItem(DRAFT_KEY) || ''
  isMac.value = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  loadOutbox()
  if (isConnected.value) flushOutbox()
  connect()
  fetchHistory()
})
</script>

<template>
  <div class="flex-1 flex flex-row w-full h-full min-h-0 overflow-hidden bg-background">
    <main class="flex-1 min-w-0 min-h-0 overflow-y-auto">
      <div class="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10 space-y-8">

        <!-- EN PANTALLA -->
        <section
          aria-label="Estado de la pantalla"
          class="flex items-center gap-4 rounded-2xl px-5 py-4 transition-colors"
          :class="announcement.active ? 'bg-red-500/10' : 'bg-muted/60'"
        >
          <span class="relative flex size-3 shrink-0">
            <span v-if="announcement.active" class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-70"></span>
            <span class="relative inline-flex size-3 rounded-full" :class="announcement.active ? 'bg-red-500' : 'bg-muted-foreground/40'"></span>
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold" :class="announcement.active ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'">
              {{ announcement.active ? 'En pantalla ahora' : 'Pantalla libre' }}
            </p>
            <p v-if="announcement.active" class="text-base text-foreground truncate mt-0.5">
              {{ (announcement.topic ? announcement.topic + ' · ' : '') + (announcement.text || '').replace(/<[^>]+>/g, '') }}
            </p>
            <p v-else-if="!session.live" class="text-sm text-muted-foreground mt-0.5">Sin sesión activa</p>
            <p v-else class="text-sm text-muted-foreground mt-0.5">Escribe un anuncio o reenvía uno del historial.</p>
          </div>
          <button
            v-if="announcement.active"
            @click="toggleVisibility()"
            class="shrink-0 inline-flex items-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2.5 transition-colors active:scale-95"
          >
            <Icon name="tabler:player-stop" class="size-4" />
            Ocultar
          </button>
        </section>
        <p v-if="announcement.active && !session.live" class="-mt-5 px-1 text-sm text-red-500">
          La sesión está inactiva: la pantalla se ve en negro en /ver.
        </p>

        <!-- EDITOR -->
        <section aria-label="Nuevo anuncio" class="rounded-2xl bg-muted/40 p-4 md:p-6">
          <label for="announcement-topic" class="sr-only">Título del anuncio</label>
          <input
            id="announcement-topic"
            v-model="currentTopic"
            type="text"
            placeholder="Título del anuncio"
            class="w-full bg-transparent text-2xl md:text-3xl font-bold tracking-tight border-none outline-none mb-3 px-2 placeholder:text-muted-foreground/40 focus:ring-0 text-foreground"
          />
          <AnnouncementsEditor v-model="textInput" @submit="sendAnnouncement" />

          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4">
            <div class="flex items-center gap-1 overflow-x-auto scrollbar-hide">
              <button
                @click="textInput = ''"
                :disabled="!textInput || isLoading"
                class="px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:pointer-events-none whitespace-nowrap"
              >
                Limpiar
              </button>
              <button
                @click="showMediaManager = true"
                class="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
              >
                <Icon name="tabler:photo" class="size-4" />
                Medios
              </button>
              <button
                @click="showHelp = true"
                aria-label="Ayuda y atajos"
                class="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
              >
                <Icon name="tabler:help-circle" class="size-4" />
              </button>
              <label class="flex items-center gap-2 pl-3 ml-1 shrink-0 cursor-pointer text-sm font-medium text-muted-foreground whitespace-nowrap" title="Enviar directamente a la pantalla al guardar">
                Enviar al guardar
                <GSwitch v-model="autoSendToAir" />
              </label>
            </div>

            <button
              v-if="!announcement.active"
              @click="sendAnnouncement()"
              :disabled="!textInput || isLoading"
              class="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-semibold px-6 py-3 transition-colors active:scale-95 disabled:opacity-40 disabled:pointer-events-none w-full sm:w-auto shrink-0"
            >
              <Icon name="tabler:player-play" class="size-4" />
              {{ autoSendToAir ? 'Mostrar en pantalla' : 'Guardar' }}
            </button>
            <button
              v-else
              @click="sendAnnouncement()"
              :disabled="!textInput || isLoading"
              class="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-semibold px-6 py-3 transition-colors active:scale-95 disabled:opacity-40 disabled:pointer-events-none w-full sm:w-auto shrink-0"
            >
              <Icon name="tabler:refresh" class="size-4" />
              {{ autoSendToAir ? 'Reemplazar en pantalla' : 'Guardar' }}
            </button>
          </div>
        </section>

        <!-- PENDIENTES -->
        <section v-if="outbox.length" aria-label="Pendientes de sincronizar">
          <div class="flex items-center justify-between mb-3 px-1">
            <h2 class="text-base font-semibold text-amber-600 dark:text-amber-400">Pendientes de sincronizar</h2>
            <button
              @click="flushOutbox"
              :disabled="isSyncing"
              class="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline disabled:opacity-40"
            >
              <Icon :name="isSyncing ? 'tabler:loader' : 'tabler:refresh'" class="size-4" :class="{ 'animate-spin': isSyncing }" />
              {{ isSyncing ? 'Sincronizando…' : 'Reintentar' }}
            </button>
          </div>
          <ul class="space-y-2">
            <li
              v-for="item in outbox"
              :key="item.id"
              class="flex items-center gap-3 px-4 py-3 rounded-xl"
              :class="item.status === 'failed' ? 'bg-red-500/10' : 'bg-amber-500/10'"
            >
              <Icon
                :name="item.status === 'sending' ? 'tabler:loader' : (item.status === 'failed' ? 'tabler:cloud-off' : 'tabler:clock')"
                class="size-4 shrink-0"
                :class="item.status === 'sending' ? 'animate-spin text-primary' : item.status === 'failed' ? 'text-red-500' : 'text-amber-500'"
              />
              <span class="flex-1 min-w-0 text-sm text-foreground truncate">{{ item.text.replace(/<[^>]+>/g, '') }}</span>
              <span class="shrink-0 text-sm font-medium" :class="item.status === 'failed' ? 'text-red-500' : 'text-amber-600 dark:text-amber-400'">
                {{ item.status === 'sending' ? 'Enviando…' : item.status === 'failed' ? 'Error' : 'Pendiente' }}
              </span>
              <button
                v-if="item.status !== 'sending'"
                @click="removeFromOutbox(item.id)"
                aria-label="Descartar"
                class="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-background/60 transition-colors"
              >
                <Icon name="tabler:x" class="size-4" />
              </button>
            </li>
          </ul>
        </section>

        <!-- HISTORIAL -->
        <section aria-label="Historial">
          <div class="flex items-center justify-between mb-3 px-1 min-h-9">
            <h2 class="text-base font-semibold text-foreground">
              Historial
              <span v-if="history.length" class="ml-1 font-normal text-muted-foreground tabular-nums">{{ history.length }}</span>
            </h2>
            <div class="flex items-center gap-1">
              <button
                v-if="isSelecting"
                @click="deleteSelected"
                class="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Icon name="tabler:trash" class="size-4" />
                Eliminar {{ selectedIds.size }}
              </button>
              <button
                v-if="!isSelecting && history.length > 0"
                @click="clearAll"
                class="text-sm font-medium text-muted-foreground hover:text-red-500 px-3 py-1.5 rounded-lg transition-colors"
              >
                Vaciar
              </button>
              <button
                v-if="history.length > 0"
                @click="selectAll"
                class="text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg transition-colors"
              >
                {{ selectedIds.size === history.length ? 'Deseleccionar' : 'Seleccionar' }}
              </button>
            </div>
          </div>

          <!-- Loading -->
          <div v-if="isLoading && history.length === 0" class="space-y-2">
            <div v-for="n in 4" :key="n" class="flex items-center gap-3 px-4 py-4 rounded-xl bg-muted/40">
              <GSkeleton class="size-5 rounded-md shrink-0" />
              <GSkeleton class="h-4 flex-1 rounded" />
              <GSkeleton class="h-3 w-12 rounded shrink-0" />
            </div>
          </div>

          <!-- Empty -->
          <div v-else-if="history.length === 0" class="py-14 rounded-2xl bg-muted/40 flex flex-col items-center text-center px-6">
            <Icon name="tabler:speakerphone" class="size-8 mb-3 text-muted-foreground/50" />
            <p class="text-base font-medium text-foreground">Aún no hay anuncios</p>
            <p class="text-sm text-muted-foreground mt-1">Los que muestres en pantalla aparecerán aquí para reenviarlos.</p>
          </div>

          <!-- List -->
          <ul v-else class="space-y-2">
            <li
              v-for="item in history"
              :key="item.id"
              class="flex items-center gap-3 pl-4 pr-3 py-3 rounded-xl transition-colors group"
              :class="selectedIds.has(item.id)
                ? 'bg-primary/15'
                : isActive(item) ? 'bg-red-500/10' : 'bg-muted/40 hover:bg-muted'"
            >
              <button
                @click.stop="toggleSelect(item.id)"
                :aria-label="selectedIds.has(item.id) ? 'Quitar de la selección' : 'Seleccionar'"
                :aria-pressed="selectedIds.has(item.id)"
                class="flex-none size-5 rounded-md border-2 flex items-center justify-center transition-colors"
                :class="selectedIds.has(item.id) ? 'bg-primary border-primary' : 'border-muted-foreground/40 hover:border-primary'"
              >
                <Icon v-if="selectedIds.has(item.id)" name="tabler:check" class="size-3 text-white" stroke-width="4" />
              </button>

              <div
                class="flex-1 min-w-0 text-[15px] text-foreground truncate cursor-pointer"
                @click="resendFromHistory(item)"
              >
                <template v-for="(segment, idx) in parseHTMLContent(item.text)" :key="idx">
                  <img v-if="segment.type === 'image'" :src="segment.value" :class="segment.class" />
                  <Icon v-else-if="segment.type === 'icon'" :name="segment.value" :class="segment.class" />
                  <span v-else v-html="segment.value" :class="segment.class"></span>
                </template>
              </div>

              <span v-if="isActive(item)" class="flex-none text-xs font-semibold text-red-600 dark:text-red-400">En pantalla</span>
              <span class="flex-none text-sm text-muted-foreground tabular-nums">
                {{ new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
              </span>

              <div class="flex-none flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
                <button
                  v-if="!isActive(item)"
                  @click.stop="resendFromHistory(item)"
                  aria-label="Reenviar"
                  class="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-background/60 transition-colors"
                >
                  <Icon name="tabler:send" class="size-4" />
                </button>
                <button
                  @click.stop="deleteItem(item.id)"
                  aria-label="Eliminar"
                  class="p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-background/60 transition-colors"
                >
                  <Icon name="tabler:trash" class="size-4" />
                </button>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </main>

    <!-- TRADUCCIÓN EN VIVO -->
    <aside class="hidden lg:flex flex-col h-full w-[420px] xl:w-[500px] bg-neutral-950 text-neutral-50 shrink-0">
      <div class="flex items-center justify-between gap-3 px-7 pt-7 pb-5">
        <h2 class="text-xl font-bold tracking-tight">Traducción en vivo</h2>
        <span
          class="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold"
          :class="transcription.active ? 'bg-red-500 text-white' : 'bg-white/10 text-neutral-300'"
        >
          <span class="size-2 rounded-full" :class="transcription.active ? 'bg-white animate-pulse' : 'bg-neutral-500'"></span>
          {{ transcription.active ? 'En pantalla' : 'Solo aquí' }}
        </span>
      </div>

      <div ref="transcriptionScrollRef" class="flex-1 overflow-y-auto px-7 pb-6 flex flex-col">
        <div class="mt-auto space-y-5">
          <div
            v-for="(p, i) in transcriptionHistory.split('\n').filter(p => p.trim())"
            :key="i"
            class="group relative rounded-xl -mx-3 px-3 py-2 hover:bg-white/5 transition-colors"
          >
            <p class="text-xl leading-snug text-neutral-400 pr-10">{{ p }}</p>
            <button
              @click="appendToEditor(p)"
              aria-label="Copiar al editor"
              class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-1.5 rounded-lg bg-white/10 text-neutral-200 hover:bg-white/20 transition-opacity"
            >
              <Icon name="tabler:copy" class="size-4" />
            </button>
          </div>

          <TransitionGroup
            name="word-stream"
            tag="p"
            class="text-3xl xl:text-4xl leading-tight font-semibold tracking-tight flex flex-wrap gap-x-2.5 gap-y-1 text-white"
          >
            <span v-for="word in interimWords" :key="word.id">{{ word.text }}</span>
          </TransitionGroup>

          <div v-if="!transcription.final && !transcription.interim" class="py-20 text-center">
            <Icon name="tabler:ear" class="size-10 text-neutral-600 mx-auto mb-3" />
            <p class="text-lg text-neutral-400">Escuchando… aún no hay voz.</p>
          </div>
        </div>
      </div>

      <div class="p-7 pt-4 space-y-3 bg-neutral-900">
        <button
          @click="setTranscriptionActive(!transcription.active)"
          class="w-full inline-flex items-center justify-center gap-2 text-base font-semibold px-4 py-3.5 rounded-xl transition-colors active:scale-[0.99]"
          :class="transcription.active ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-white text-neutral-950 hover:bg-neutral-200'"
        >
          <Icon :name="transcription.active ? 'tabler:player-stop' : 'tabler:player-play'" class="size-5" />
          {{ transcription.active ? 'Quitar de la pantalla' : 'Mostrar en pantalla' }}
        </button>
        <button
          v-if="transcriptionHistory"
          @click="appendToEditor(transcriptionHistory.split('\n').filter(p => p.trim()).pop() || '')"
          class="w-full inline-flex items-center justify-center gap-2 text-sm font-medium px-4 py-2.5 rounded-xl text-neutral-300 hover:bg-white/10 transition-colors"
        >
          <Icon name="tabler:copy" class="size-4" />
          Copiar último fragmento al editor
        </button>
      </div>
    </aside>

    <!-- Atajos -->
    <GSheet v-model="showHelp">
      <div class="flex flex-col bg-background">
        <h2 class="text-xl font-bold mb-6 pr-8">Atajos de teclado</h2>
        <ul class="grid gap-2">
          <li v-for="s in [
            { label: 'Enviar texto', keys: (isMac ? '⌘' : 'Ctrl') + ' + Enter' },
            { label: 'Mostrar u ocultar en pantalla', keys: (isMac ? '⌘' : 'Ctrl') + ' + L' },
            { label: 'Limpiar / apagar', keys: 'Esc' },
          ]" :key="s.label" class="flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-muted/50">
            <span class="text-sm font-medium">{{ s.label }}</span>
            <kbd class="text-sm font-semibold bg-background px-2.5 py-1 rounded-md">{{ s.keys }}</kbd>
          </li>
        </ul>
      </div>
    </GSheet>

    <!-- Medios -->
    <GSheet v-model="showMediaManager">
      <div class="flex flex-col bg-background p-8 h-full">
        <div class="flex items-center justify-between mb-6 gap-4">
          <h2 class="text-xl font-bold">Librería de medios</h2>
          <div class="mr-8">
            <button @click="triggerFileUpload" :disabled="isUploading" class="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
              <Icon :name="isUploading ? 'tabler:loader' : 'tabler:upload'" class="size-4" :class="{ 'animate-spin': isUploading }" />
              {{ isUploading ? 'Subiendo…' : 'Subir imagen' }}
            </button>
            <input type="file" ref="fileInput" class="hidden" accept="image/*" @change="handleFileUpload" />
          </div>
        </div>
        <div class="flex-1 overflow-y-auto">
          <div v-if="mediaList.length === 0 && !isUploading" class="py-12 flex flex-col items-center text-center">
            <Icon name="tabler:photo" class="size-10 mb-3 text-muted-foreground/40" />
            <p class="text-base font-medium">Sin imágenes</p>
            <p class="text-sm text-muted-foreground mt-1">Súbelas y úsalas en un anuncio con su nombre.</p>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div v-for="media in mediaList" :key="media.id" class="group relative rounded-xl overflow-hidden bg-muted/50 flex flex-col">
              <img :src="useApi().getFullUrl(media.url)" :alt="media.name" class="w-full h-32 object-contain" />
              <div class="px-3 py-2.5">
                <div class="text-sm font-medium text-foreground truncate">/{{ media.name }}</div>
              </div>
              <button @click="deleteMediaItem(media.id)" aria-label="Eliminar imagen" class="absolute top-2 right-2 bg-red-600 text-white p-1.5 rounded-lg md:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity">
                <Icon name="tabler:trash" class="size-4" />
              </button>
            </div>
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
