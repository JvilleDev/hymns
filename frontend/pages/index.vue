<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'
import io from 'socket.io-client'
import { useDebounceFn } from '@vueuse/core'
import { Sheet, SheetContent, SheetTrigger, SheetClose } from '@/components/ui/sheet'

const { apiUrl } = useRuntimeConfig().app
const socket = io(apiUrl.startsWith("https") ? "wss://" + apiUrl.split("//")[1] : 'ws://' + apiUrl.split("//")[1])
let isChangingSong = ref(false);

onKeyStroke("ArrowUp", (e) => {
  e.preventDefault()
  if (currentSong.value.content.length > 0 && currentIndex.value > 0) {
    currentIndex.value--;
  }
})
onKeyStroke("ArrowDown", (e) => {
  e.preventDefault()
  if (currentSong.value.content.length > 0 && currentIndex.value < currentSong.value.content.length - 1) {
    currentIndex.value++;
  }
})

// Add keyboard shortcuts for quick actions (both NumPad and normal keys)
onKeyStroke(['0', 'Numpad0', '1', 'Numpad1', '2', 'Numpad2', '3', 'Numpad3', '4', 'Numpad4', '5', 'Numpad5', '6', 'Numpad6', '7', 'Numpad7', '8', 'Numpad8', '9', 'Numpad9'], (e) => {
  // Prevent activation if any search bar is focused
  if (document.activeElement?.id === 'search' || 
      document.activeElement?.id === 'search-desktop' || 
      document.activeElement?.id === 'search-mobile') {
    return;
  }
  
  const key = e.key.replace('Numpad', '');
  const numKey = parseInt(key);
  
  if (currentSong.value.id && quickActions.value.length > numKey) {
    e.preventDefault();
    currentIndex.value = quickActions.value[numKey].index;
    sendLine(currentSong.value.content[currentIndex.value]);
  }
})

// Atajo para activar/desactivar el visor (Ctrl+V en Windows/Linux, Cmd+V en Mac)
onKeyStroke('v', (e) => {
  // Solo en desktop y si la tecla modificadora está presionada (Ctrl en Windows/Linux, Cmd/Meta en Mac)
  if ((navigator.platform.includes('Mac') ? e.metaKey : e.ctrlKey) && window.innerWidth >= 768) {
    e.preventDefault();
    const newState = !initialInfo.value.viewerActive;
    changeViewerState(newState);
  }
})

interface BaseSong {
  id: string;
  title: string;
  type: string;
  nh: number;
}

interface Song extends BaseSong {
  content: string;
}

interface CurrentSong extends BaseSong {
  content: string[];
}

interface SearchResults {
  results: Song[];
}

// Cargar lista inicial de canciones
const { data: songs, refresh: refreshSongs } = await useAsyncData<Song[]>(
  'songs',
  () => $fetch<Song[]>(`${apiUrl}/api/cantos`)
);

let currentSong: Ref<CurrentSong> = ref({
  title: '',
  id: '',
  nh: 0,
  content: [],
  type: ''
});

let currentIndex = ref(0);
let initialInfo = ref({
  viewerActive: true,
  activeLine: ''
});

// ! Search
let searchTerm = ref('');
let isLoading = ref(false);
let isSearchOpen = ref(false)

// Búsqueda con useAsyncData
const { data: searchResults, refresh: refreshSearch } = await useAsyncData<SearchResults>(
  'songSearch',
  async () => {
    if (!searchTerm.value) return { results: [] };
    return $fetch<SearchResults>(`${apiUrl}/search?q=${searchTerm.value}`);
  },
  {
    watch: [searchTerm],
    immediate: false
  }
);

let quickActions = ref([{
  text: '1',
  index: 0,
  endIndex: 0,
}]);

const debouncedSearch = useDebounceFn(async () => {
  if (searchTerm.value.length > 0) {
    isLoading.value = true;
    try {
      await refreshSearch();
    } finally {
      isLoading.value = false;
    }
  } else {
    searchResults.value = { results: [] };
  }
}, 300);

const filteredSongs = computed(() => {
  if (searchTerm.value.length > 0 && searchResults.value?.results && searchResults.value.results.length > 0) {
    return searchResults.value.results.slice(0, 20);
  } else {
    return (songs.value || []).slice(0, songs.value?.length);
  }
});

const isSearching = computed(() => {
  return Boolean(searchTerm.value.length > 0 && searchResults.value?.results && searchResults.value.results.length > 0);
});

// ! Functions
function checkTags(text: string): string {
  const regexMark = /^(?:\d+|[->]|FINAL|(?:CORO|PRE[-]?CORO|ESTRIBILLO))/;
  const regexTag = /^Al\s+(?:CORO|PRE-CORO|PRECORO|FINAL)(?:\s+\d+)?/i;

  if (regexMark.test(text)) {
    return 't-mark';
  } else if (regexTag.test(text)) {
    return 'tag-mark';
  }
  return '';
}

async function changeSong(id: string) {
  if (!id) {
    console.error('ID de canción inválido');
    return;
  }

  if (isChangingSong.value) {
    console.log('Ya hay un cambio de canción en proceso');
    return;
  }

  if (currentSong.value.id && id === currentSong.value.id) {
    console.log('La canción ya está seleccionada');
    return;
  }

  try {
    isChangingSong.value = true;
    console.log('Cambiando a la canción:', id);

    // Usar useAsyncData para obtener la canción
    const { data: songData } = await useAsyncData<Song>(
      `song-${id}`,
      () => $fetch(`${apiUrl}/api/canto/${id}`),
      { immediate: true }
    );

    if (!songData.value) throw new Error('No se pudo obtener la canción');

    const processedContent = `${songData.value.type === 'Especial' ? 'Especial - ' + songData.value.title : `#${songData.value.nh}` + ' - ' + songData.value.title}` + '\n' + songData.value.content;
    
    currentSong.value = {
      ...songData.value,
      content: processedContent.split("\n")
    };
    
    currentIndex.value = 0;
    sendLine(currentSong.value.content[0]);

    searchTerm.value = '';
    searchResults.value = { results: [] };

    // Extraer quickActions directamente del contenido con rangos
    quickActions.value = [];
    const actionsSet = new Set<string>();
    let lastActionIndex = -1;

    // Agregar siempre la quickAction del título
    quickActions.value.push({
      text: 'TÍTULO',
      index: 0,
      endIndex: 0,
    });
    lastActionIndex = 0;

    currentSong.value.content.forEach((line: string, index: number) => {
      if (index === 0) return;
      
      const tagType = checkTags(line);
      if (tagType === 't-mark' && !actionsSet.has(line)) {
        if (lastActionIndex !== -1) {
          quickActions.value[lastActionIndex].endIndex = index - 1;
        }
        
        actionsSet.add(line);
        quickActions.value.push({
          text: line.trim(),
          index: index,
          endIndex: currentSong.value.content.length - 1,
        });
        lastActionIndex = quickActions.value.length - 1;
      }
    });

    console.log('Cambio de canción completado');
  } catch (error) {
    console.error("Error al cambiar la canción:", error);
  } finally {
    isChangingSong.value = false;
  }
}

socket.on('initial', (data) => {
  initialInfo.value = data
})

function changeViewerState(state: boolean) {
  socket.emit('view', state)
  initialInfo.value.viewerActive = state
}

watch(searchTerm, () => {
  debouncedSearch()
})

watch(currentIndex, () => {
  nextTick(() => {
    scrollToActiveLine();
  });
});

// Función separada para manejar el scroll a la línea activa
function scrollToActiveLine() {
  nextTick(() => {
    const activeIndex = document.querySelector('.active.line') as HTMLElement;
    const lineContainer = document.querySelector("#line-container") as HTMLElement;
    
    if (activeIndex && lineContainer) {
      try {
        // Usar getBoundingClientRect para cálculos más precisos
        const containerRect = lineContainer.getBoundingClientRect();
        const activeRect = activeIndex.getBoundingClientRect();
        
        // Calcular posición relativa dentro del contenedor
        const containerScrollTop = lineContainer.scrollTop;
        const relativeTop = activeRect.top - containerRect.top + containerScrollTop;
        
        // Calcular posición ideal (centrada)
        const targetScroll = relativeTop - (containerRect.height / 2) + (activeRect.height / 2);
        
        // Aplicar scroll con animación suave
        lineContainer.scrollTo({
          top: targetScroll,
          behavior: 'smooth'
        });
      } catch (error) {
        console.warn('Error al intentar scroll automático:', error);
        
        // Método alternativo como respaldo
        activeIndex.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }
    }
    
    sendLine(currentSong.value.content[currentIndex.value]);
  });
}

function sendLine(data: string) {
  socket.emit('newLine', data)
}

// Computed para determinar qué quickAction está activa
const activeQuickAction = computed(() => {
  return quickActions.value.findIndex(action => 
    currentIndex.value >= action.index && 
    currentIndex.value <= action.endIndex
  );
});

let isDrawerOpen = ref(false)

// Ref para guardar si es Mac o PC
const isMac = ref(false);

onMounted(() => {
  socket.open();
  refreshSongs();
  // Detectar si el usuario está en Mac
  isMac.value = navigator.platform.includes('Mac');
})
onUnmounted(() => {
  socket.close()
})
</script>
<template>
  <div class="flex flex-col pb-6 w-full sm:max-w-[90%]">
    <!-- Buscador y acciones principales (solo visible en desktop) -->
    <div class="w-full mx-auto mb-4 px-4 hidden md:block">
      <div class="flex items-center gap-3 p-2">
        <div class="relative flex-1">
          <Input id="search-desktop" type="text"
            @keydown.enter="(searchTerm.length > 0 && filteredSongs.length > 0) ? changeSong(filteredSongs[0].id) : ''"
            placeholder="Buscar por título o número..." 
            :disabled="isLoading"
            class="pl-10" 
            v-model="searchTerm" 
          />
          <span class="absolute start-0 inset-y-0 flex items-center justify-center pl-4">
            <Icon v-if="!isLoading" name="tabler:search" class="size-4 text-muted-foreground" />
            <Icon v-else name="tabler:loader-2" class="size-4 text-muted-foreground animate-spin" />
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
            <!-- Texto (animado pero visible) -->
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
            
            <!-- Círculo -->
            <span 
              class="absolute bg-white h-7 w-7 rounded-full top-0.5 transition-all duration-300"
              :class="[
                initialInfo.viewerActive 
                  ? 'translate-x-[calc(100%+3.5rem)] left-[-0.5rem] transform rotate-360 shadow-[0_0_10px_3px_rgba(74,222,128,0.5)]' 
                  : 'translate-x-0 left-0.5 shadow-lg'
              ]"
            >
              <!-- Icono -->
              <span class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center transition-all duration-300">
                <Icon 
                  :name="initialInfo.viewerActive ? 'tabler:eye' : 'tabler:eye-off'" 
                  class="size-4"
                  :class="initialInfo.viewerActive ? 'text-green-800' : 'text-red-800'"
                />
              </span>
            </span>
          </span>
          
          <!-- Tooltip con el atajo -->
          <span class="absolute opacity-0 group-hover:opacity-100 bg-black/80 text-white text-xs px-2 py-1 rounded -bottom-8 left-1/2 transform -translate-x-1/2 transition-opacity pointer-events-none whitespace-nowrap hidden md:block">
            {{ isMac ? '⌘V' : 'Ctrl+V' }}
          </span>
        </label>
      </div>
    </div>

    <!-- Controles móviles (solo visible en móvil) -->
    <div class="md:hidden flex justify-between items-center w-full mb-2 px-4">
      <!-- Botón de lista de himnos -->
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
          
          <!-- Buscador dentro del Sheet (solo en móvil) -->
          <div class="p-3 border-b bg-background">
            <div class="relative w-full">
              <Input id="search-mobile" type="text"
                @keydown.enter="(searchTerm.length > 0 && filteredSongs.length > 0) ? changeSong(filteredSongs[0].id) : ''"
                placeholder="Buscar por título o número..." 
                :disabled="isLoading"
                class="pl-10 w-full" 
                v-model="searchTerm" 
              />
              <span class="absolute start-0 inset-y-0 flex items-center justify-center pl-4">
                <Icon v-if="!isLoading" name="tabler:search" class="size-4 text-muted-foreground" />
                <Icon v-else name="tabler:loader-2" class="size-4 text-muted-foreground animate-spin" />
              </span>
            </div>
          </div>
          
          <!-- Lista de canciones -->
          <div class="flex-1 overflow-hidden">
            <SongList 
              :elements="filteredSongs" 
              :activeId="currentSong.id || ''" 
              :isSearching="isSearching"
              :searchTerm="searchTerm"
              :isLoading="isLoading"
              @changeSong="changeSong" 
            />
          </div>
        </SheetContent>
      </Sheet>
      
      <!-- Switch personalizado móvil -->
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
          <!-- Texto (animado pero visible) -->
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
          
          <!-- Círculo -->
          <span 
            class="absolute bg-white h-7 w-7 rounded-full top-0.5 transition-all duration-300"
            :class="[
              initialInfo.viewerActive 
                ? 'translate-x-[calc(100%+3.5rem)] left-[-0.5rem] transform rotate-360 shadow-[0_0_10px_3px_rgba(74,222,128,0.5)]' 
                : 'translate-x-0 left-0.5 shadow-lg'
            ]"
          >
            <!-- Icono -->
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
          :isLoading="isLoading"
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
              :key="action.index" 
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
                <li @click="currentIndex = index; sendLine(c)" 
                  class="rounded-md" 
                  v-for="(c, index) in currentSong.content"
                  :key="`song-${currentSong.id}-${index}`" 
                  :data-index="index + 1"
                  :class="[checkTags(c), currentIndex == index ? 'active line' : 'line']"
                >{{ c }}</li>
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

/* Estilos específicos para garantizar el scroll en todos los dispositivos */
#line-container {
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;
  overscroll-behavior: contain;
}

/* Mejoras para iOS */
@supports (-webkit-touch-callout: none) {
  #line-container {
    padding-bottom: env(safe-area-inset-bottom, 20px);
  }
}
</style>
