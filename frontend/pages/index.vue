<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'
import io from 'socket.io-client'
import { useDebounceFn } from '@vueuse/core'

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
  // Prevent activation if search bar is focused
  if (document.activeElement?.id === 'search') return;
  
  const key = e.key.replace('Numpad', '');
  const numKey = parseInt(key);
  
  if (currentSong.value.id && quickActions.value.length > numKey) {
    e.preventDefault();
    currentIndex.value = quickActions.value[numKey].index;
    sendLine(currentSong.value.content[currentIndex.value]);
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
  () => $fetch(`${apiUrl}/api/cantos`)
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
    return (songs.value || []).slice(0, 50);
  }
});

const isSearching = computed(() => {
  return searchTerm.value.length > 0 && searchResults.value?.results && searchResults.value.results.length > 0;
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
    const activeIndex = document.querySelector('.active.line') as HTMLElement;
    const indexSelect = document.querySelector("#line-container") as HTMLElement;
    
    if (activeIndex && indexSelect) {
      // Calcular la posición del elemento activo relativa al contenedor
      const containerTop = indexSelect.scrollTop;
      const containerHeight = indexSelect.offsetHeight;
      const elementTop = activeIndex.offsetTop;
      const elementHeight = activeIndex.offsetHeight;

      // Calcular el punto medio del contenedor
      const containerMiddle = containerHeight / 2;
      
      // Calcular el scroll necesario para centrar el elemento
      const targetScroll = elementTop - containerMiddle + elementHeight / 2;

      // Aplicar el scroll con animación suave
      indexSelect.scrollTo({
        top: targetScroll,
        left: 0,
        behavior: 'smooth'
      });
    }
    
    sendLine(currentSong.value.content[currentIndex.value]);
  });
});

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

onMounted(() => {
  socket.open();
  refreshSongs();
})
onUnmounted(() => {
  socket.close()
})
</script>
<template>
  <main class="max-w-7xl mx-auto w-full flex flex-col items-center justify-center px-4 py-2">
    <div class="relative w-full items-center mb-2">
      <Input id="search" type="text"
        @keydown.enter="(searchTerm.length > 0 && filteredSongs.length > 0) ? changeSong(filteredSongs[0].id) : ''"
        placeholder="Buscar..." 
        :disabled="isLoading"
        class="pl-10" 
        v-model="searchTerm" 
      />
      <span class="absolute start-0 inset-y-0 flex items-center justify-center pl-4">
        <Icon v-if="!isLoading" name="tabler:search" class="size-4 text-muted-foreground" />
        <Icon v-else name="tabler:loader-2" class="size-4 text-muted-foreground animate-spin" />
      </span>
      <span class="absolute end-0 m-0 inset-y-0 flex items-center justify-center p-1">
        <Button :variant="initialInfo.viewerActive ? 'default' : 'destructive'"
          @click="changeViewerState(!initialInfo.viewerActive)" size="sm">
          <Icon :name="initialInfo.viewerActive ? 'tabler:eye' : 'tabler:eye-off'" class="size-4 text-secondary" />
        </Button>
      </span>
    </div>
    <div class="container">
      <section>
        <SongList 
          :elements="filteredSongs" 
          :activeId="currentSong.id || ''" 
          :isSearching="isSearching"
          :searchTerm="searchTerm"
          :isLoading="isLoading"
          @changeSong="changeSong" 
        />
      </section>
      <Card id="song-viewer" v-if="currentSong.id != null && currentSong.id.length > 0" class="overflow-hidden">
        <CardHeader>
          <CardTitle v-auto-animate>{{ currentSong.type === 'Especial' ? 'Especial' : `#${currentSong.nh}` }} - {{ currentSong.title }}
          </CardTitle>
          <CardDescription class="flex gap-2 items-center" v-auto-animate>
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
          </CardDescription>
        </CardHeader>
        <CardContent id="line-container" class="overflow-y-auto max-h-[80%]">
          <ul id="index-select" class="max-h-full">
            <li @click="currentIndex = index; sendLine(c)" class="rounded-md" v-for="(c, index) in currentSong.content"
              :key="`song-${currentSong.id}`" :data-index="index + 1"
              :class="[checkTags(c), currentIndex == index ? 'active line' : 'line']">{{ c }}
            </li>
          </ul>
        </CardContent>
      </Card>
      <Card v-else class="max-h-[80svh] h-[80svh] select-none w-[60%]">
        <CardContent class="h-full w-full flex flex-col items-center opacity-50 justify-center gap-2">
          <h2 class="text-center text-xl font-bold">No hay datos disponibles</h2>
          <Icon name="tabler:music-off" class="size-10" />
        </CardContent>
      </Card>
    </div>
  </main>
</template>
<style>
#song-selector {
  @apply rounded-lg max-h-[80svh] h-[80svh] select-none w-[40svw];

  @media (max-width: 640px) {
    @apply w-full;
  }
}

#song-viewer {
  @apply rounded-lg max-h-[80svh] h-[80svh] select-none w-[60%];

  @media (max-width: 640px) {
    @apply w-full h-full max-h-full min-h-[80svh];
  }
}

.line {
  @apply text-gray-800 text-sm px-4 py-2 hover:bg-neutral-100 shadow-sm transition-all duration-200 ease-in-out select-none cursor-pointer;

  &.active {
    @apply !bg-emerald-100 !text-emerald-700 !shadow-lg;
  }
}

#index-select {
  @apply flex flex-col gap-2 overflow-y-auto p-2;
}

.t-mark {
  @apply bg-blue-100 text-blue-600 font-bold;
}

.tag-mark {
  @apply bg-red-100 text-red-600 font-bold;
}

.container {
  @apply flex gap-4 m-0 p-0 w-full justify-between items-center;

  @media (max-width: 512px) {
    @apply flex-col;
  }
}

.active-section {
  @apply !bg-emerald-100 !text-emerald-700 !shadow-md scale-105;
}
</style>
