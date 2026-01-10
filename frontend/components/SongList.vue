<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  elements: any[]
  activeId: string
  isSearching: boolean
  searchTerm: string
  isLoading: boolean
}>()

const emit = defineEmits(['changeSong'])

const tabs = computed(() => {
  const types = new Set(props.elements.map(e => e.type || 'Canto'))
  if (types.size <= 1) return ['Todos']
  return ['Todos', ...Array.from(types).sort()]
})

const activeTab = ref('Todos')

const filteredElements = computed(() => {
  if (activeTab.value === 'Todos') return props.elements
  return props.elements.filter(e => e.type === activeTab.value)
})

// Text cleaning for reliable matching
function clean(text: string) {
  return text.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function getSnippet(content: string[], term: string) {
  if (!term || term.length < 2) return null
  const cleanTerm = clean(term)
  for (const line of content) {
    if (clean(line).includes(cleanTerm)) return line
  }
  return null
}

function highlight(text: string, term: string) {
  if (!term || !text) return text
  const words = term.split(' ').filter(w => w.length > 1).map(clean)
  if (words.length === 0) return text

  const cleanText = clean(text)
  const sortedWords = [...words].sort((a, b) => b.length - a.length)
  
  let result = text
  let offset = 0
  
  const matches: { start: number, end: number }[] = []
  
  for (const word of sortedWords) {
    let pos = cleanText.indexOf(word)
    while (pos !== -1) {
      const start = pos
      const end = pos + word.length
      
      if (!matches.some(m => (start >= m.start && start < m.end) || (end > m.start && end <= m.end))) {
        matches.push({ start, end })
      }
      pos = cleanText.indexOf(word, pos + 1)
    }
  }

  matches.sort((a, b) => a.start - b.start)

  let finalHtml = ''
  let lastIndex = 0
  let charMap: number[] = []
  
  let cleanIdx = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    const cleanedC = clean(c)
    if (cleanedC !== "" || c === " ") {
      charMap[cleanIdx] = i
      cleanIdx++
    }
  }

  matches.forEach(match => {
    const realStart = charMap[match.start]
    const realEnd = charMap[match.end - 1] + 1
    
    finalHtml += text.substring(lastIndex, realStart)
    finalHtml += `<mark class="highlight">${text.substring(realStart, realEnd)}</mark>`
    lastIndex = realEnd
  })
  
  finalHtml += text.substring(lastIndex)
  return finalHtml
}
</script>

<template>
  <div class="song-list-container w-full h-full flex flex-col overflow-hidden">
    <!-- Tabs -->
    <div v-if="tabs.length > 1" class="h-12 px-3 flex items-center shrink-0 border-b border-border bg-background/50">
      <div class="grid gap-1 p-1 bg-muted/50 rounded-lg w-full" :style="{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }">
        <button v-for="tab in tabs" :key="tab" @click="activeTab = tab"
          class="px-2 h-8 flex items-center justify-center rounded-md text-[10px] font-bold uppercase tracking-wider transition-all truncate text-center"
          :class="[activeTab === tab ? 'bg-card text-primary shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground hover:bg-muted']">
          {{ tab }}
        </button>
      </div>
    </div>

    <div class="flex-grow h-0 overflow-y-auto scrollbar-hide py-2 px-3">
      <ul class="flex flex-col gap-1.5 pb-20">
        <li v-for="(item, index) in (isLoading && filteredElements.length === 0) ? Array(10).fill({}) : filteredElements"
          :key="item.id || `skeleton-${index}`" :data-id="item.id" class="song-item" :class="[
            filteredElements.length > 0 && activeId === item.id ? 'active' : '',
            isLoading ? 'opacity-50 pointer-events-none' : ''
          ]" @click="emit('changeSong', item.id)">
          
          <template v-if="item.id">
            <div class="flex justify-between items-start mb-1">
              <span class="text-[9px] font-bold uppercase tracking-tighter opacity-50 flex items-center gap-1">
                <Icon :name="item.type === 'Especial' ? 'tabler:star' : 'tabler:book'" class="size-3" />
                {{ item.type || 'Canto' }}
              </span>
              <span class="text-[10px] font-mono font-bold text-primary/60">#{{ item.nh }}</span>
            </div>
            <h3 class="font-bold text-sm leading-tight group-hover:text-primary transition-colors">{{ item.title }}</h3>
            <p v-if="searchTerm.length > 1 && getSnippet(item.content, searchTerm)" 
               class="text-[11px] mt-1.5 text-muted-foreground line-clamp-2 leading-relaxed bg-muted/30 p-1.5 rounded-md border border-border/5"
               v-html="highlight(getSnippet(item.content, searchTerm) || '', searchTerm)">
            </p>
          </template>
          
          <template v-else>
            <div class="h-12 w-full animate-pulse bg-muted/50 rounded-lg"></div>
          </template>
        </li>
      </ul>

      <div v-if="!isLoading && filteredElements.length === 0" class="flex flex-col items-center justify-center py-20 text-center opacity-30">
        <Icon name="tabler:mood-empty" class="size-10 mb-2" />
        <p class="text-xs font-bold uppercase tracking-wider">No se encontraron cantos</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.song-item {
  @apply p-3 rounded-xl border border-transparent transition-all duration-300 cursor-pointer select-none bg-card hover:bg-accent/50 hover:border-border/50 hover:shadow-sm active:scale-[0.98];
}
.song-item.active {
  @apply bg-primary text-primary-foreground border-primary shadow-md translate-x-1;
}
.song-item.active .text-primary\/60,
.song-item.active .text-muted-foreground {
  @apply text-primary-foreground/80;
}
.song-item.active .bg-muted\/30 {
  @apply bg-white/10 border-white/10;
}
:deep(.highlight) {
  @apply bg-yellow-400 text-black px-0.5 rounded-sm font-bold;
}
.song-item.active :deep(.highlight) {
  @apply bg-white text-primary px-0.5 rounded-sm;
}
.scrollbar-hide::-webkit-scrollbar { display: none; }
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
</style>