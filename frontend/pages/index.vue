<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'

interface Song {
  id: string
  nh: number
  title: string
  content: string[]
  type: string
}

const { $api } = useNuxtApp() as { $api: any }
const { activeIndex, activeLine, viewerActive, connect, disconnect, changeViewerState, sendLine, sendIndex } = useSocket()
const isMac = ref(false)

onMounted(() => {
  isMac.value = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  connect()
  fetchSongs()
})

const searchTerm = ref("")
const currentIndex = ref(0)
const sheetOpen = ref(false)
const isRemoteChange = ref(false)

const songs = ref<Song[]>([])
const isLoadingSongs = ref(false)

async function fetchSongs() {
  isLoadingSongs.value = true
  try {
    const data = await $api('/api/cantos') as any[]
    songs.value = data.map(song => {
      // Normalize content to array if it comes as string
      const contentArray = Array.isArray(song.content) 
        ? song.content 
        : (typeof song.content === 'string' ? song.content.split('\n').filter(Boolean) : [])
        
      return {
        ...song,
        content: contentArray,
        searchText: `${song.nh} ${clean(song.title || '')} ${contentArray.map(clean).join(' ')}`
      }
    }) as Song[]
  } catch (error) {
    console.error("Error al cargar cantos:", error)
  } finally {
    isLoadingSongs.value = false
  }
}

const isChangingSong = ref(false)
const currentSong = ref<Partial<Song>>({})

function clean(text: string) {
  return text.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

const filteredSongs = computed(() => {
  if (!songs.value) return []
  if (!searchTerm.value) return songs.value
  const cleanTerm = clean(searchTerm.value)
  return songs.value.filter(song => (song as any).searchText.includes(cleanTerm))
})

const isSearching = computed(() => searchTerm.value.length > 0)

const songCache = new Map<string, Song>()

async function changeSong(id: string) {
  if (currentSong.value.id === id) return
  isChangingSong.value = true
  try {
    if (songCache.has(id)) {
      currentSong.value = songCache.get(id)!
    } else {
      const song = await $api(`/api/canto/${id}`) as any
      // Normalize content to array if it comes as string
      const contentArray = Array.isArray(song.content) 
        ? song.content 
        : (typeof song.content === 'string' ? song.content.split('\n').filter(Boolean) : [])
      
      const normalizedSong = { ...song, content: contentArray } as Song
      songCache.set(id, normalizedSong)
      currentSong.value = normalizedSong
    }
    currentIndex.value = 0
    sheetOpen.value = false
    scrollToActiveLine()
  } catch (error) {
    console.error("Error al cargar el canto:", error)
  } finally {
    isChangingSong.value = false
  }
}

const quickActions = computed(() => {
  if (!currentSong.value.content) return []
  const actions: { text: string, index: number }[] = []
  currentSong.value.content.forEach((line, index) => {
    const mark = checkTags(line)
    if (mark === 't-mark' || mark === 'tag-mark') {
      const text = line.trim()
      actions.push({ text: text || `Sec ${index + 1}`, index })
    }
  })
  return actions
})

const activeQuickAction = computed(() => {
  if (!quickActions.value.length) return -1
  let activeIdx = -1
  for (let i = 0; i < quickActions.value.length; i++) {
    if (quickActions.value[i].index <= currentIndex.value) {
      activeIdx = i
    } else {
      break
    }
  }
  return activeIdx
})

const scrollToActiveLine = useDebounceFn(() => {
  nextTick(() => {
    const activeElement = document.querySelector('.line-item.active') as HTMLElement
    const container = document.querySelector("#line-container") as HTMLElement
    if (activeElement && container) {
      const containerRect = container.getBoundingClientRect()
      const activeRect = activeElement.getBoundingClientRect()
      const containerScrollTop = container.scrollTop
      const relativeTop = activeRect.top - containerRect.top + containerScrollTop
      const targetScroll = relativeTop - (containerRect.height / 2) + (activeRect.height / 2)
      container.scrollTo({ top: targetScroll, behavior: 'smooth' })
    }
    const activeAction = document.querySelector('#quick-actions-container .bg-primary') as HTMLElement
    if (activeAction) activeAction.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  })
}, 100)

function isTyping() {
  const el = document.activeElement as HTMLElement
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

onKeyStroke(['ArrowUp', 'ArrowDown'], (e) => {
  if (isTyping()) return
  e.preventDefault()
  if (!currentSong.value.content) return
  if (e.key === 'ArrowUp' && currentIndex.value > 0) currentIndex.value--
  if (e.key === 'ArrowDown' && currentIndex.value < currentSong.value.content.length - 1) currentIndex.value++
  sendLine(currentSong.value.content[currentIndex.value])
  sendIndex(currentIndex.value)
})

onKeyStroke(['v', 'V'], (e) => {
  if (isTyping()) return
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    changeViewerState(!viewerActive.value)
  }
})

watch(activeIndex, (newIdx) => {
  if (newIdx !== currentIndex.value) {
    isRemoteChange.value = true
    currentIndex.value = newIdx
    setTimeout(() => { isRemoteChange.value = false }, 200)
  }
})

watch(currentIndex, () => {
  scrollToActiveLine()
})

onUnmounted(() => {
  disconnect()
  songCache.clear()
})
</script>

<template>
  <div class="flex-1 flex flex-col w-full min-h-0 overflow-hidden">
    <!-- Buscador y acciones principales -->
    <div class="w-full h-16 px-4 flex items-center gap-4 shrink-0 bg-background/50 border-b border-border">
      <div class="relative flex-1 group">
        <GInput id="search-desktop" v-model="searchTerm" placeholder="Buscar..." class="pl-10 h-10 text-sm"
          @keydown.enter="(searchTerm.length > 0 && filteredSongs.length > 0) ? changeSong(filteredSongs[0].id) : ''" />
        <Icon name="tabler:search" class="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
      </div>

      <div class="flex items-center gap-4">
        <GSwitch :modelValue="viewerActive" @update:modelValue="changeViewerState" label="Visor Externo" class="font-medium" />
        <GButton variant="outline" size="icon" class="md:hidden" @click="sheetOpen = true">
          <Icon name="tabler:music" class="size-6" />
        </GButton>
      </div>
    </div>

    <!-- Contenido principal -->
    <div class="flex-1 w-full flex min-h-0 overflow-hidden">
      <!-- Desktop Song List -->
      <section class="hidden md:flex w-80 shrink-0 border-r border-border min-h-0 flex-col bg-muted/5">
        <div class="flex-1 min-h-0 overflow-hidden">
          <SongList :elements="filteredSongs" :activeId="currentSong.id || ''" :isSearching="isSearching" :searchTerm="searchTerm" :isLoading="isLoadingSongs || isChangingSong" @changeSong="changeSong" />
        </div>
      </section>

      <!-- Visor principal -->
      <main class="flex-1 flex flex-col min-w-0 min-h-0 bg-background">
        <!-- Quick Actions Bar -->
        <div v-if="currentSong.id" class="w-full h-12 shrink-0 bg-muted/5 border-b border-border overflow-hidden">
          <div id="quick-actions-container" class="flex gap-1.5 items-center h-full px-3 overflow-x-auto scrollbar-hide">
            <button v-for="(action, idx) in quickActions" :key="`${action.index}-${action.text}`"
              @click="currentIndex = action.index + 1; sendLine(currentSong.content[action.index]); sendIndex(action.index + 1)"
              class="px-3 h-8 flex items-center justify-center rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-300 select-none border border-transparent whitespace-nowrap"
              :class="[idx === activeQuickAction ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-secondary/50 text-muted-foreground hover:bg-accent hover:text-accent-foreground']">
              {{ action.text }}
            </button>
          </div>
        </div>

        <!-- Contenido -->
        <div v-if="currentSong.id" class="flex-1 flex flex-col min-h-0">
          <div class="flex justify-between items-center h-14 px-4 border-b border-border shrink-0 bg-muted/5">
            <div class="flex flex-col min-w-0">
              <span class="text-[9px] font-bold uppercase tracking-widest text-primary/70 leading-none mb-0.5">
                {{ currentSong.type === 'Especial' ? 'Canto Especial' : `Himno #${currentSong.nh}` }}
              </span>
              <h2 class="font-bold text-base truncate tracking-tight leading-none">{{ currentSong.title }}</h2>
            </div>
            <div class="px-3 py-1.5 rounded-lg bg-secondary/50 text-xs font-bold border border-border">
              {{ currentIndex + 1 }} <span class="mx-1 text-muted-foreground">/</span> {{ currentSong.content.length }}
            </div>
          </div>

          <div class="flex-grow h-0 overflow-y-auto min-h-0" id="line-container">
            <div class="p-3 pb-32 space-y-1.5">
              <div v-for="(line, index) in currentSong.content" :key="`${currentSong.id}-${index}`"
                @click="currentIndex = index; sendLine(line); sendIndex(index)" class="line-item" :class="[checkTags(line), currentIndex === index ? 'active' : '']">
                {{ line }}
              </div>
            </div>
          </div>
        </div>

        <div v-else class="h-full flex flex-col items-center justify-center gap-4 p-8 text-center text-muted-foreground/40 bg-muted/2">
          <div class="size-16 rounded-full bg-secondary/30 flex items-center justify-center border border-border/50">
            <Icon name="tabler:music" class="size-8 opacity-20" />
          </div>
          <div class="max-w-xs text-center"><p class="text-lg font-bold text-muted-foreground/60">Selecciona un canto para comenzar</p></div>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.line-item {
  @apply p-4 rounded-xl text-lg font-medium transition-all duration-300 cursor-pointer select-none border border-transparent hover:bg-muted/50 hover:translate-x-1;
}
.line-item.active {
  @apply bg-primary/10 text-primary border-primary/20 font-bold translate-x-1 shadow-sm;
}
.line-item.t-mark { @apply text-primary font-bold border-l-4 border-l-primary rounded-l-none; }
.line-item.tag-mark { @apply text-muted-foreground italic text-base border-l-4 border-l-muted-foreground/20 rounded-l-none bg-muted/5; }
.scrollbar-hide::-webkit-scrollbar { display: none; }
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
</style>