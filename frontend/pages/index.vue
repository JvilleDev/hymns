<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'
import io from 'socket.io-client'
import { useDebounceFn } from '@vueuse/core'

const { apiUrl } = useRuntimeConfig().app
const socket = io(apiUrl.startsWith("https") ? "wss://" : 'ws://' + apiUrl.split("//")[1])
let isChangingSong = ref(false); // Estado de bloqueo

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

let songs: Ref<{ title: string; id: string; nh: number; content: string; type: string }[]> = ref([])
let currentSong: Ref<{ title: string; id: string; nh: number; content: string[]; type: string }> = ref({
  title: '',
  id: '',
  nh: 0,
  content: [],
  type: ''
})
let currentIndex = ref(0);
let initialInfo = ref({
  viewerActive: true,
  activeLine: ''
})

// ! Search
let searchTerm = ref('')
let isLoading = ref(false)
let results: Ref<{ results: { title: string; id: string; nh: number; content: string; type: string }[] }> = ref({ results: [] })
let quickActions = ref([{
  text: '1',
  index: 0,
}])

const debouncedSearch = useDebounceFn(async () => {
  if (searchTerm.value.length > 0) {
    isLoading.value = true
    try {
      await searchData()
    } finally {
      isLoading.value = false
    }
  } else {
    results.value = { results: [] }
  }
}, 300)

const filteredSongs = computed(() => {
  if (searchTerm.value.length > 0 && results.value.results && results.value.results.length > 0) {
    // Limitar a 20 resultados para mejor rendimiento
    return results.value.results.slice(0, 20);
  } else {
    // Mostrar solo los primeros 50 cantos cuando no hay búsqueda
    return songs.value.slice(0, 50);
  }
});

const isSearching = computed(() => {
  return searchTerm.value.length > 0 && results.value.results && results.value.results.length > 0;
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

async function fetchData() {
  const res = await fetch(`${apiUrl}/api/cantos`)
  songs.value = await res.json()
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

    const res = await fetch(`${apiUrl}/api/canto/${id}`);
    if (!res.ok) {
      throw new Error(`Error al obtener la canción: ${res.statusText}`);
    }

    let songData = await res.json();
    songData.content = `${songData.type === 'Especial' ? 'Especial - ' + songData.title : `#${songData.nh}` + ' - ' + songData.title}` + '\n' + songData.content;
    songData.content = songData.content.split("\n");

    currentSong.value = songData;
    currentIndex.value = 0;
    console.log("SONG DATA", songData)

    sendLine(songData.content[0]);

    searchTerm.value = '';
    results.value = { results: [] };

    quickActions.value = [];
    await new Promise((resolve) => setTimeout(resolve, 400));

    const actionsSet = new Set<string>();
    const labelLines = document.querySelectorAll("#index-select .t-mark");

    labelLines.forEach((line) => {
      const text = (line as HTMLElement).innerText;
      const index = (line as HTMLElement).dataset.index;

      if (!actionsSet.has(text)) {
        actionsSet.add(text);
        quickActions.value.push({
          text,
          index: Number(index),
        });
      }
    });

    console.log('Cambio de canción completado');
  } catch (error) {
    console.error("Error al cambiar la canción:", error);
  } finally {
    isChangingSong.value = false;
  }
}

async function searchData() {
  const res = await fetch(`${apiUrl}/search?q=${searchTerm.value}`)
  results.value = await res.json()

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
  const activeIndex = document.querySelector('.active.line');
  const indexSelect = document.querySelector("#line-container");
  if (activeIndex && indexSelect) {
    setTimeout(() => {
      const offset = activeIndex.offsetTop - indexSelect.offsetHeight / 1.5;
      indexSelect.scrollTop = offset;
      indexSelect.scrollLeft = 0;
    }, 200)
  }
  sendLine(currentSong.value.content[currentIndex.value])
});

function sendLine(data: string) {
  socket.emit('newLine', data)
}

onMounted(() => {
  socket.open()
  fetchData()
})
onUnmounted(() => {
  socket.close()
})
</script>
<template>
  <main class="max-w-7xl mx-auto w-full flex flex-col items-center justify-center">
    <div class="relative w-full items-center mb-2">
      <Input id="search" type="text"
        @keydown.enter="(searchTerm.length > 0 && results.results.length > 0) ? changeSong(filteredSongs[0].id) : ''"
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
            <span v-for="action in quickActions" :key="action.index" class="t-mark rounded-md line"
              @click="currentIndex = action.index; sendLine(currentSong.content[action.index])">
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
</style>
