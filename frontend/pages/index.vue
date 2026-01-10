<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'
import { useDebounceFn } from '@vueuse/core'
import { toast } from 'vue-sonner'

const { apiUrl } = useRuntimeConfig().public
const {
  connect,
  disconnect,
  sendLine,
  sendCanto,
  sendIndex,
  changeViewerState,
  viewerActive,
  activeLine,
  activeCantoId,
  activeIndex
} = useSocket()

const initialInfo = ref({
  viewerActive: true,
  activeLine: ''
})

const isRemoteChange = ref(false)

const sheetOpen = ref(false)

// Sync viewerActive state
watch(viewerActive, (val) => {
  initialInfo.value.viewerActive = val
})

interface BaseSong {
  id: string;
  title: string;
  type: string;
  nh: number;
}

interface Song extends BaseSong {
  content: string;
  searchText?: string;
}

interface CurrentSong extends BaseSong {
  content: string[];
}

// Estados reactivos
const isChangingSong = ref(false)
const searchTerm = ref('')
const currentIndex = ref(0)
const isMac = ref(false)

const currentSong: Ref<CurrentSong> = ref({
  title: '',
  id: '',
  nh: 0,
  content: [],
  type: ''
})

const quickActions = ref([{
  text: '1',
  index: 0,
  endIndex: 0,
}])

// Cargar lista inicial de canciones
const { data: songs, refresh: refreshSongs, error: songsError } = await useAsyncData<Song[]>(
  'songs',
  async () => {
    return await $fetch<Song[]>(`${apiUrl}/api/cantos`)
  },
  {
    transform: (data: Song[]) => {
      return data.map(song => ({
        ...song,
        searchText: `${song.title.toLowerCase()} ${song.nh}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      }))
    },
    default: () => []
  }
)

if (songsError.value) {
  toast.error('Error al cargar las canciones. Verifica tu conexión.')
}

// Optimización: usar computed en lugar de watchers múltiples
const filteredSongs = computed(() => {
  if (!searchTerm.value?.trim() || !songs.value) {
    return songs.value || []
  }

  const term = searchTerm.value.toLowerCase().trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")

  // Búsqueda optimizada con includes simple
  return songs.value.filter(song =>
    (song.searchText ?? '').includes(term)
  )
})

// Computed optimizado para determinar si está buscando
const isSearching = computed(() => searchTerm.value.length > 0)

// Optimización: debounce mejorado solo para acciones costosas
const debouncedRefresh = useDebounceFn(() => {
  if (filteredSongs.value.length === 0 && searchTerm.value.length > 2) {
    refreshSongs()
  }
}, 1000)

// Computed para quickAction activa - optimizado
const activeQuickAction = computed(() => {
  const current = currentIndex.value
  return quickActions.value.findIndex(action =>
    current >= action.index && current <= action.endIndex
  )
})

// Optimización de event listeners
onKeyStroke("ArrowUp", (e) => {
  e.preventDefault()
  const content = currentSong.value.content
  if (content.length > 0 && currentIndex.value > 0) {
    currentIndex.value--
  }
})

onKeyStroke("ArrowDown", (e) => {
  e.preventDefault()
  const content = currentSong.value.content
  if (content.length > 0 && currentIndex.value < content.length - 1) {
    currentIndex.value++
  }
})

// Optimización: usar Set para mejor performance en validaciones
const SEARCH_INPUT_IDS = new Set(['search', 'search-desktop', 'search-mobile'])

onKeyStroke(['0', 'Numpad0', '1', 'Numpad1', '2', 'Numpad2', '3', 'Numpad3', '4', 'Numpad4', '5', 'Numpad5', '6', 'Numpad6', '7', 'Numpad7', '8', 'Numpad8', '9', 'Numpad9'], (e) => {
  // Optimización: verificación más eficiente
  if (SEARCH_INPUT_IDS.has(document.activeElement?.id || '')) {
    return
  }

  const key = e.key.replace('Numpad', '')
  const numKey = parseInt(key)
  const actions = quickActions.value

  if (currentSong.value.id && actions.length > numKey) {
    e.preventDefault()
    const targetIndex = actions[numKey].index
    currentIndex.value = targetIndex
    sendLine(currentSong.value.content[targetIndex])
    sendIndex(targetIndex)
  }
})

onKeyStroke('v', (e) => {
  if ((navigator.platform.includes('Mac') ? e.metaKey : e.ctrlKey) && window.innerWidth >= 768) {
    e.preventDefault()
    changeViewerState(!initialInfo.value.viewerActive)
  }
})

// Optimización: cache para requests de canciones
const songCache = new Map<string, Song>()

async function changeSong(id: string) {
  if (!id || isChangingSong.value || currentSong.value.id === id) {
    return
  }

  try {
    isChangingSong.value = true

    // Optimización: usar cache
    let songData = songCache.get(id)

    if (!songData) {
      try {
        songData = await $fetch<Song>(`${apiUrl}/api/canto/${id}`)
        if (songData) {
          songCache.set(id, songData)
        }
      } catch (e) {
        throw new Error('No se pudo obtener la canción')
      }
    }

    if (!songData) throw new Error('No se pudo obtener la canción')

    // Optimización: procesar contenido de forma más eficiente
    const titlePrefix = songData.type === 'Especial'
      ? `Especial - ${songData.title}`
      : `#${songData.nh} - ${songData.title}`

    const processedContent = `${titlePrefix}\n${songData.content}`.split("\n")

    currentSong.value = {
      ...songData,
      content: processedContent
    }

    currentIndex.value = 0
    if (!isRemoteChange.value) {
      sendLine(processedContent[0])
    }

    // Limpiar búsqueda solo si es necesario
    if (searchTerm.value) {
      searchTerm.value = ''
    }

    // Optimización: generar quickActions de forma más eficiente
    generateQuickActions(processedContent)

    // Cerrar el panel móvil si está abierto
    if (sheetOpen.value) sheetOpen.value = false

    // Emitir cambio de canto si es una acción local
    if (!isRemoteChange.value) {
      sendCanto(id)
    }

  } catch (error) {
    console.error("Error al cambiar la canción:", error)
    toast.error('Error al cargar la canción seleccionada.')
  } finally {
    isChangingSong.value = false
  }
}

// Función separada y optimizada para generar quickActions
function generateQuickActions(content: string[]) {
  const actions = [{
    text: 'TÍTULO',
    index: 0,
    endIndex: 0,
  }]

  const actionsSet = new Set<string>()

  // Optimización: una sola pasada por el contenido
  for (let index = 1; index < content.length; index++) {
    const line = content[index]
    const tagType = checkTags(line)

    if (tagType === 't-mark' && !actionsSet.has(line)) {
      // Actualizar el endIndex de la acción anterior
      actions[actions.length - 1].endIndex = index - 1

      actionsSet.add(line)
      actions.push({
        text: line.trim(),
        index: index,
        endIndex: content.length - 1,
      })
    }
  }

  quickActions.value = actions
}

// Optimización: scroll con throttle
const scrollToActiveLine = useDebounceFn(() => {
  nextTick(() => {
    const activeElement = document.querySelector('.active.line') as HTMLElement
    const container = document.querySelector("#line-container") as HTMLElement

    if (activeElement && container) {
      try {
        const containerRect = container.getBoundingClientRect()
        const activeRect = activeElement.getBoundingClientRect()
        const containerScrollTop = container.scrollTop
        const relativeTop = activeRect.top - containerRect.top + containerScrollTop
        const targetScroll = relativeTop - (containerRect.height / 2) + (activeRect.height / 2)

        container.scrollTo({
          top: targetScroll,
          behavior: 'smooth'
        })
      } catch (error) {
        activeElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        })
      }
    }

    if (!isRemoteChange.value) {
      sendLine(currentSong.value.content[currentIndex.value])
      sendIndex(currentIndex.value)
    }
  })
}, 100)

// Optimización: watcher más eficiente
watch(currentIndex, scrollToActiveLine, { flush: 'post' })

// Optimización: usar watchEffect para search debounce
watchEffect(() => {
  if (searchTerm.value.length > 2) {
    debouncedRefresh()
  }
})

// Socket listeners
watch(activeCantoId, async (newId) => {
  if (newId && newId !== currentSong.value.id) {
    isRemoteChange.value = true
    await changeSong(newId)
    isRemoteChange.value = false
  }
})

watch(activeIndex, (newIndex) => {
  if (newIndex !== currentIndex.value) {
    isRemoteChange.value = true
    currentIndex.value = newIndex
    setTimeout(() => {
      isRemoteChange.value = false
    }, 200) // Small delay to ensure scrollToActiveLine finishes and its sendIndex check sees isRemoteChange=true
  }
})

onMounted(() => {
  connect()
  isMac.value = navigator.platform.includes('Mac')
  // Optimización: solo refrescar si no hay datos
  if (!songs.value?.length) {
    refreshSongs()
  }
})

onUnmounted(() => {
  disconnect()
  // Limpiar cache al desmontar
  songCache.clear()
})
</script>

<template>
  <div class="flex flex-col w-full h-[calc(100svh-56px)] overflow-hidden">
    <!-- Buscador y acciones principales -->
    <div class="w-full p-4 flex flex-col md:flex-row items-center gap-4 shrink-0 bg-background/50 border-b border-border">
      <div class="relative flex-1 group w-full">
        <GInput id="search-desktop" v-model="searchTerm" placeholder="Buscar por título o número..."
          class="pl-12 h-10 text-base"
          @keydown.enter="(searchTerm.length > 0 && filteredSongs.length > 0) ? changeSong(filteredSongs[0].id) : ''" />
        <Icon name="tabler:search"
          class="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
      </div>

      <div class="flex items-center gap-4">
        <GSwitch :modelValue="initialInfo.viewerActive" @update:modelValue="changeViewerState" label="Visor Externo"
          class="font-medium" :tooltip="isMac ? 'Comando: ⌘V' : 'Comando: Ctrl+V'" />

        <GButton variant="outline" size="icon" class="md:hidden" @click="sheetOpen = true">
          <Icon name="tabler:music" class="size-6" />
        </GButton>
      </div>
    </div>

    <GSheet v-model="sheetOpen" side="left" title="Biblioteca de Himnos"
      description="Selecciona un himno para proyectar.">
      <div class="mt-4 flex flex-col h-[70svh] overflow-hidden">
        <div class="px-1 mb-4">
          <GInput v-model="searchTerm" placeholder="Buscar..." class="h-10" />
        </div>
        <div class="flex-1 overflow-hidden">
          <SongList :elements="filteredSongs" :activeId="currentSong.id || ''" :isSearching="isSearching"
            :searchTerm="searchTerm" :isLoading="isChangingSong" @changeSong="changeSong" />
        </div>
      </div>
    </GSheet>

    <!-- Contenido principal -->
    <div class="flex-1 w-full flex min-h-0 overflow-hidden">
      <!-- Desktop Song List -->
      <section class="hidden md:flex w-80 shrink-0 border-r border-border min-h-0 flex-col bg-muted/5">
        <div class="flex-1 min-h-0 overflow-hidden">
          <SongList :elements="filteredSongs" :activeId="currentSong.id || ''" :isSearching="isSearching"
            :searchTerm="searchTerm" :isLoading="isChangingSong" @changeSong="changeSong" />
        </div>
      </section>

      <!-- Visor principal -->
      <main class="flex-1 flex flex-col gap-4 w-full min-w-0 min-h-0 p-4">
        <!-- Quick Actions -->
        <Transition name="fade">
          <div v-if="currentSong.id" class="w-full shrink-0">
            <GCard class="p-1 px-2 overflow-hidden shadow-sm border-border" noHover>
              <div class="flex gap-1.5 items-center overflow-x-auto pb-1 scrollbar-hide" v-auto-animate>
                <div v-for="(action, idx) in quickActions" :key="`${action.index}-${action.text}`"
                  class="shrink-0 relative cursor-pointer"
                  @click="currentIndex = action.index; sendLine(currentSong.content[action.index]); sendIndex(action.index)">
                  <div
                    class="px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 select-none border border-transparent"
                    :class="[idx === activeQuickAction
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-secondary text-muted-foreground hover:bg-accent hover:text-accent-foreground']">
                    {{ action.text }}
                  </div>
                </div>
              </div>
            </GCard>
          </div>
        </Transition>

        <!-- Contenido -->
        <GCard class="flex-1 flex flex-col overflow-hidden border border-border bg-card p-0" noHover>
          <div v-if="currentSong.id" class="h-full flex flex-col min-h-0">
            <div class="flex justify-between items-center px-5 py-3 border-b border-border shrink-0 bg-muted/5">
              <div class="flex flex-col min-w-0">
                <span class="text-[10px] font-bold uppercase tracking-widest text-primary/70">
                  {{ currentSong.type === 'Especial' ? 'Canto Especial' : `Himno #${currentSong.nh}` }}
                </span>
                <h2 class="font-bold text-lg truncate tracking-tight">{{ currentSong.title }}</h2>
              </div>
              <div class="px-3 py-1.5 rounded-lg bg-secondary text-xs font-bold border border-border">
                {{ currentIndex + 1 }} <span class="mx-1 text-muted-foreground">/</span> {{ currentSong.content.length
                }}
              </div>
            </div>

            <div class="flex-1 overflow-y-auto min-h-0" id="line-container">
              <div class="p-2 space-y-1.5">
                <div v-for="(line, index) in currentSong.content" :key="`${currentSong.id}-${index}`"
                  @click="currentIndex = index; sendLine(line); sendIndex(index)" class="line-item" :class="[
                    checkTags(line),
                    currentIndex === index ? 'active' : ''
                  ]">
                  {{ line }}
                </div>
              </div>
            </div>
          </div>
          <div v-else class="h-full flex flex-col items-center justify-center gap-4 p-8 text-center">
            <div
              class="size-16 rounded-full bg-secondary/50 flex items-center justify-center border border-border">
              <Icon name="tabler:music" class="size-8 text-muted-foreground/30" />
            </div>
            <div class="max-w-xs">
              <h2 class="text-lg font-bold mb-1">Listo para proyectar</h2>
              <p class="text-xs text-muted-foreground">
                Selecciona un himno de la biblioteca.
              </p>
            </div>
          </div>
        </GCard>
      </main>
    </div>
  </div>
</template>

<style scoped>
.line-item {
  @apply px-4 py-2.5 rounded-lg text-base font-medium transition-all duration-200 cursor-pointer border border-transparent shadow-sm select-none;
  background: var(--card);
}

.line-item:hover {
  background: var(--accent);
  transform: translateX(2px);
  border-color: var(--border);
}

.line-item.active {
  @apply bg-primary text-primary-foreground shadow-md scale-[1.01];
  transform: translateX(3px);
}

/* Custom categories */
.t-mark {
  @apply border-l-4 border-l-blue-500 bg-blue-500/5 text-blue-400 font-bold;
}

.tag-mark {
  @apply border-l-4 border-l-red-500 bg-red-500/5 text-red-300 font-bold italic;
}

#line-container {
  scrollbar-width: thin;
  scrollbar-color: var(--glass-border) transparent;
}

#line-container::-webkit-scrollbar {
  width: 4px;
}

#line-container::-webkit-scrollbar-thumb {
  background: var(--glass-border);
  border-radius: 10px;
}

.scrollbar-hide::-webkit-scrollbar {
  display: none;
}

.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>

<style>
#song-selector {
  @apply rounded-lg max-h-[80svh] h-[80svh] select-none w-[40svw];

  @media (max-width: 640px) {
    @apply w-full;
  }
}

#song-viewer {
  @apply rounded-lg max-h-[80svh] h-[80svh] select-none w-full md:w-[60%];

  @media (max-width: 640px) {
    @apply w-full h-full max-h-full min-h-[80svh];
  }
}

.line {
  @apply text-gray-800 text-sm px-4 py-2 hover:bg-accent hover:text-accent-foreground shadow-sm transition-all duration-200 ease-in-out select-none cursor-pointer;

  &.active {
    @apply !bg-emerald-100 !text-emerald-700 !shadow-lg;
  }
}

#index-select {
  @apply flex flex-col gap-2 overflow-y-auto p-2;
}

.t-mark {
  @apply bg-blue-100 text-blue-600 font-bold hover:bg-blue-200 transition-colors px-3 py-1;
}

.tag-mark {
  @apply bg-red-100 text-red-600 font-bold hover:bg-red-200 transition-colors px-3 py-1;
}

.container {
  @apply flex gap-4 m-0 p-0 w-full justify-between items-start;

  @media (max-width: 768px) {
    @apply flex-col;
  }
}

.active-section {
  @apply !bg-emerald-100 !text-emerald-700 !shadow-md scale-105;
}

#line-container {
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;
  overscroll-behavior: contain;
}

@supports (-webkit-touch-callout: none) {
  #line-container {
    padding-bottom: env(safe-area-inset-bottom, 20px);
  }
}
</style>