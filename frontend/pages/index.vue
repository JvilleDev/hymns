<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'
import io from 'socket.io-client'
import { useDebounceFn } from '@vueuse/core'
import { Sheet, SheetContent, SheetTrigger, SheetClose } from '@/components/ui/sheet'

const { apiUrl } = useRuntimeConfig().public
const socket = io(window.location.origin)

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

const initialInfo = ref({
  viewerActive: true,
  activeLine: ''
})

const quickActions = ref([{
  text: '1',
  index: 0,
  endIndex: 0,
}])

// Cargar lista inicial de canciones
const { data: songs, refresh: refreshSongs } = await useAsyncData<Song[]>(
  'songs',
  async () => {
    try {
      return await $fetch<Song[]>(`/backend/api/cantos`)
    } catch (e) {
      // Si error, intentar con localhost
      return await $fetch<Song[]>(`http://localhost:3100/api/cantos`)
    }
  },
  {
    // Optimización: usar cache y transformación
    transform: (data: Song[]) => {
      // Pre-procesar datos para búsqueda más rápida
      return data.map(song => ({
        ...song,
        searchText: `${song.title.toLowerCase()} ${song.nh}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      }))
    },
    default: () => []
  }
)

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
  }
})

onKeyStroke('v', (e) => {
  if ((navigator.platform.includes('Mac') ? e.metaKey : e.ctrlKey) && window.innerWidth >= 768) {
    e.preventDefault()
    changeViewerState(!initialInfo.value.viewerActive)
  }
})

// Funciones optimizadas
function checkTags(text: string): string {
  // Quitar espacios iniciales
  const cleanText = text.trimStart()

  // Optimización: regex compiladas una sola vez
  const regexMark = /^(?:\d+|[->]|FINAL|(?:CORO|PRE[-]?CORO|ESTRIBILLO))/
  const regexTag = /^Al\s+(?:CORO|PRE-CORO|PRECORO|FINAL)(?:\s+\d+)?/i

  if (regexMark.test(cleanText)) return 't-mark'
  if (regexTag.test(cleanText)) return 'tag-mark'
  return ''
}


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
      songData = await $fetch<Song>(`${apiUrl}/api/canto/${id}`)
      if (songData) {
        songCache.set(id, songData)
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
    sendLine(processedContent[0])

    // Limpiar búsqueda solo si es necesario
    if (searchTerm.value) {
      searchTerm.value = ''
    }

    // Optimización: generar quickActions de forma más eficiente
    generateQuickActions(processedContent)

  } catch (error) {
    console.error("Error al cambiar la canción:", error)
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
  let lastActionIndex = 0

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

function changeViewerState(state: boolean) {
  socket.emit('view', state)
  initialInfo.value.viewerActive = state
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

    sendLine(currentSong.value.content[currentIndex.value])
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

function sendLine(data: string) {
  socket.emit('newLine', data)
}

// Socket listeners
socket.on('initial', (data) => {
  initialInfo.value = data
})

onMounted(() => {
  socket.open()
  isMac.value = navigator.platform.includes('Mac')
  // Optimización: solo refrescar si no hay datos
  if (!songs.value?.length) {
    refreshSongs()
  }
})

onUnmounted(() => {
  socket.close()
  // Limpiar cache al desmontar
  songCache.clear()
})
</script>

<template>
  <div class="flex flex-col pb-6 w-full sm:max-w-[90%]">
    <!-- Buscador y acciones principales (solo visible en desktop) -->
    <div class="w-full mx-auto mb-4 px-4 hidden md:block">
      <div class="flex items-center gap-3 p-2">
        <div class="relative flex-1">
          <Input
              id="search-desktop"
              type="text"
              @keydown.enter="(searchTerm.length > 0 && filteredSongs.length > 0) ? changeSong(filteredSongs[0].id) : ''"
              placeholder="Buscar por título o número..."
              class="pl-10"
              v-model="searchTerm"
          />
          <span class="absolute start-0 inset-y-0 flex items-center justify-center pl-4">
            <Icon name="tabler:search" class="size-4 text-muted-foreground" />
          </span>
        </div>

        <!-- Switch personalizado -->
        <label class="relative inline-block w-28 h-8 cursor-pointer select-none overflow-visible group">
          <input
              type="checkbox"
              class="sr-only"
              :checked="initialInfo.viewerActive"
              @change="changeViewerState(!initialInfo.viewerActive)"
          />
          <span
              class="absolute inset-0 rounded-full transition-all duration-300"
              :class="initialInfo.viewerActive ? 'bg-green-700' : 'bg-red-700'"
          >
            <span
                class="absolute top-1/2 transform -translate-y-1/2 font-semibold transition-all duration-300 text-white text-xs"
                :class="[
                initialInfo.viewerActive
                  ? 'translate-x-0 left-3'
                  : 'translate-x-0 right-3'
              ]"
            >
              {{ initialInfo.viewerActive ? 'Activo' : 'Inactivo' }}
            </span>

            <span
                class="absolute bg-white h-7 w-7 rounded-full top-0.5 transition-all duration-300"
                :class="[
                initialInfo.viewerActive
                  ? 'translate-x-[calc(100%+3.5rem)] left-[-0.5rem] transform rotate-360 shadow-[0_0_10px_3px_rgba(74,222,128,0.5)]'
                  : 'translate-x-0 left-0.5 shadow-lg'
              ]"
            >
              <span class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center transition-all duration-300">
                <Icon
                    :name="initialInfo.viewerActive ? 'tabler:eye' : 'tabler:eye-off'"
                    class="size-4"
                    :class="initialInfo.viewerActive ? 'text-green-800' : 'text-red-800'"
                />
              </span>
            </span>
          </span>

          <span class="absolute opacity-0 group-hover:opacity-100 bg-black/80 text-white text-xs px-2 py-1 rounded -bottom-8 left-1/2 transform -translate-x-1/2 transition-opacity pointer-events-none whitespace-nowrap hidden md:block">
            {{ isMac ? '⌘V' : 'Ctrl+V' }}
          </span>
        </label>
      </div>
    </div>

    <!-- Controles móviles -->
    <div class="md:hidden flex justify-between items-center w-full mb-2 px-4">
      <Sheet>
        <SheetTrigger as-child>
          <Button variant="outline" class="shadow-sm flex items-center gap-2">
            <Icon name="tabler:music" class="size-4" />
            <span class="font-medium">Himnos</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" class="w-[85%] sm:w-[350px] p-0 flex flex-col">
          <div class="flex items-center justify-between p-3 border-b bg-background sticky top-0 z-10">
            <h3 class="font-semibold">Lista de himnos</h3>
            <SheetClose class="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
              <Icon name="tabler:x" class="size-4" />
              <span class="sr-only">Cerrar</span>
            </SheetClose>
          </div>

          <div class="p-3 border-b bg-background">
            <div class="relative w-full">
              <Input
                  id="search-mobile"
                  type="text"
                  @keydown.enter="(searchTerm.length > 0 && filteredSongs.length > 0) ? changeSong(filteredSongs[0].id) : ''"
                  placeholder="Buscar por título o número..."
                  class="pl-10 w-full"
                  v-model="searchTerm"
              />
              <span class="absolute start-0 inset-y-0 flex items-center justify-center pl-4">
                <Icon name="tabler:search" class="size-4 text-muted-foreground" />
              </span>
            </div>
          </div>

          <div class="flex-1 overflow-hidden">
            <SongList
                :elements="filteredSongs"
                :activeId="currentSong.id || ''"
                :isSearching="isSearching"
                :searchTerm="searchTerm"
                :isLoading="isChangingSong"
                @changeSong="changeSong"
            />
          </div>
        </SheetContent>
      </Sheet>

      <!-- Switch móvil -->
      <label class="relative inline-block w-28 h-8 cursor-pointer select-none overflow-visible">
        <input
            type="checkbox"
            class="sr-only"
            :checked="initialInfo.viewerActive"
            @change="changeViewerState(!initialInfo.viewerActive)"
        />
        <span
            class="absolute inset-0 rounded-full transition-all duration-300 shadow-md"
            :class="initialInfo.viewerActive ? 'bg-green-700' : 'bg-red-700'"
        >
          <span
              class="absolute top-1/2 transform -translate-y-1/2 font-semibold transition-all duration-300 text-white text-xs whitespace-nowrap"
              :class="[
              initialInfo.viewerActive
                ? 'translate-x-0 left-3'
                : 'translate-x-0 right-3'
            ]"
          >
            {{ initialInfo.viewerActive ? 'Activo' : 'Inactivo' }}
          </span>

          <span
              class="absolute bg-white h-7 w-7 rounded-full top-0.5 transition-all duration-300"
              :class="[
              initialInfo.viewerActive
                ? 'translate-x-[calc(100%+3.5rem)] left-[-0.5rem] transform rotate-360 shadow-[0_0_10px_3px_rgba(74,222,128,0.5)]'
                : 'translate-x-0 left-0.5 shadow-lg'
            ]"
          >
            <span class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center transition-all duration-300">
              <Icon
                  :name="initialInfo.viewerActive ? 'tabler:eye' : 'tabler:eye-off'"
                  class="size-4"
                  :class="initialInfo.viewerActive ? 'text-green-800' : 'text-red-800'"
              />
            </span>
          </span>
        </span>
      </label>
    </div>

    <!-- Contenido principal -->
    <div class="w-full mx-auto px-2 sm:px-4 h-[calc(100vh-11rem)] flex gap-4">
      <!-- Desktop Song List -->
      <section class="hidden md:block md:w-[280px] lg:w-[300px] xl:w-[320px] bg-background rounded-lg border overflow-hidden shrink-0">
        <SongList
            :elements="filteredSongs"
            :activeId="currentSong.id || ''"
            :isSearching="isSearching"
            :searchTerm="searchTerm"
            :isLoading="isChangingSong"
            @changeSong="changeSong"
        />
      </section>

      <!-- Visor principal -->
      <div class="flex-1 flex flex-col gap-4 w-full">
        <!-- Quick Actions -->
        <div v-if="currentSong.id" class="bg-background rounded-lg border p-3 pb-4 overflow-x-auto w-full">
          <div class="flex gap-2 items-center flex-nowrap min-w-max" v-auto-animate>
            <span
                v-for="(action, idx) in quickActions"
                :key="`${action.index}-${action.text}`"
                class="t-mark rounded-md line transition-all duration-200 relative"
                :class="[idx === activeQuickAction ? 'active-section' : '']"
                @click="currentIndex = action.index; sendLine(currentSong.content[action.index])"
            >
              <span class="absolute -top-2 -left-1 text-[10px] text-neutral-500">{{ idx }}</span>
              {{ action.text }}
            </span>
          </div>
        </div>

        <!-- Contenido -->
        <div class="flex-1 bg-background rounded-lg border overflow-hidden w-full">
          <div v-if="currentSong.id" class="h-full flex flex-col">
            <div class="flex justify-between items-center p-3 border-b sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10">
              <h2 class="font-semibold text-lg truncate">
                <span class="font-bold">{{ currentSong.type === 'Especial' ? 'Especial' : `#${currentSong.nh}` }}</span>
                <span class="mx-1">-</span>
                <span>{{ currentSong.title }}</span>
              </h2>
              <Badge variant="outline">{{ currentIndex + 1 }}/{{ currentSong.content.length }}</Badge>
            </div>
            <div class="h-full overflow-y-auto overscroll-contain" id="line-container">
              <ul class="flex flex-col gap-2 p-4">
                <li
                    v-for="(line, index) in currentSong.content"
                    :key="`${currentSong.id}-${index}`"
                    @click="currentIndex = index; sendLine(line)"
                    class="rounded-md"
                    :data-index="index + 1"
                    :class="[checkTags(line), currentIndex === index ? 'active line' : 'line']"
                >
                  {{ line }}
                </li>
              </ul>
            </div>
          </div>
          <div v-else class="h-full flex flex-col items-center justify-center gap-4 p-6">
            <Icon name="tabler:music-off" class="size-12 opacity-25" />
            <div class="text-center max-w-md">
              <h2 class="text-xl font-bold">No hay canción seleccionada</h2>
              <p class="text-muted-foreground mt-2">
                Selecciona una canción de la lista o usa el buscador para encontrar una canción específica.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

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