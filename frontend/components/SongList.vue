<script setup lang="ts">
type Song = {
  title: string,
  id: string,
  nh: number,
  type: string
  content?: string,
  score?: number
}

const props = defineProps<{
  elements: Song[];
  activeId: string;
  isSearching: boolean;
  searchTerm?: string;
  isLoading?: boolean;
}>();

defineEmits<{
  (e: 'changeSong', id: string): void;
}>();

const activeTab = ref('Todos');

const tabs = computed(() => {
  const types = new Set(props.elements.map(el => el.type));
  return ['Todos', ...Array.from(types).sort()];
});

const filteredElements = computed(() => {
  // If searching, show all matches regardless of tab
  if (props.searchTerm && props.searchTerm.length > 0) {
    return props.elements;
  }
  
  if (activeTab.value === 'Todos') {
    return props.elements;
  }
  
  return props.elements.filter(el => el.type === activeTab.value);
});

// Reset tab when elements change significantly or when starting search
watch(() => props.searchTerm, (newVal) => {
  if (newVal && newVal.length > 0) {
    // activeTab.value = 'Todos';
  }
});
</script>

<template>
  <div class="song-list-container w-full h-full flex flex-col overflow-hidden">
    <!-- Tabs -->
    <div v-if="tabs.length > 1" class="px-4 pt-4 pb-2 shrink-0 border-b border-border bg-background/50">
      <div 
        class="grid gap-1 p-1 bg-muted/50 rounded-lg"
        :style="{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }"
      >
        <button 
          v-for="tab in tabs" 
          :key="tab"
          @click="activeTab = tab"
          class="px-2 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all truncate text-center"
          :class="[activeTab === tab 
            ? 'bg-card text-primary shadow-sm border border-border' 
            : 'text-muted-foreground hover:text-foreground hover:bg-muted']"
        >
          {{ tab }}
        </button>
      </div>
    </div>

    <div v-if="filteredElements.length > 0 && searchTerm && searchTerm.length > 0"
      class="px-6 py-2 text-[10px] font-bold uppercase tracking-widest text-primary/70 border-b border-border bg-primary/5 shrink-0">
      {{ filteredElements.length }} resultado{{ filteredElements.length !== 1 ? 's' : '' }}
    </div>

    <div class="flex-1 overflow-y-auto scrollbar-hide py-2 px-3">
      <ul class="flex flex-col gap-1.5 pb-4">
        <li v-for="(item, index) in (isLoading && filteredElements.length === 0) ? Array(10).fill({}) : filteredElements"
          :key="item.id || `skeleton-${index}`" :data-id="item.id" class="song-item" :class="[
            filteredElements.length > 0 && activeId === item.id ? 'active' : '',
            isLoading && filteredElements.length === 0 ? 'opacity-50 pointer-events-none' : ''
          ]" @click="filteredElements.length > 0 && $emit('changeSong', item.id)">
          <div v-if="filteredElements.length > 0 || !isLoading" class="w-full">
            <div class="flex items-center justify-between w-full mb-0.5">
              <div class="flex items-center gap-1.5 opacity-60">
                <Icon class="size-3" :name="item.type === 'Especial' ? 'tabler:user-circle' : 'tabler:book'" />
                <span class="font-bold text-[10px] uppercase tracking-tighter">
                  {{ item.type }}
                </span>
              </div>
              <span v-if="item.type !== 'Especial'"
                class="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-white/5 rounded text-primary/80">
                #{{ item.nh }}
              </span>
            </div>

            <div class="min-w-0">
              <span class="font-bold text-sm truncate block group-hover:text-primary transition-colors">
                {{ item.title }}
              </span>
            </div>
          </div>

          <GSkeleton v-else class="w-full h-10 rounded-lg" />
        </li>

        <li v-if="filteredElements.length === 0 && !isLoading"
          class="flex flex-col items-center justify-center py-20 text-center text-muted-foreground/50">
          <Icon name="tabler:mood-empty" class="size-10 mb-2 opacity-20" />
          <p class="text-xs font-semibold uppercase tracking-widest">Sin cantos</p>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.song-item {
  @apply flex flex-col items-start justify-center p-3 rounded-xl cursor-pointer transition-all duration-300 border border-transparent select-none;
  background: transparent;
}

.song-item:hover {
  @apply bg-muted/50 translate-x-1 border-border shadow-sm;
}

.song-item.active {
  @apply bg-primary text-primary-foreground shadow-md border-primary scale-[1.01] translate-x-1;
}

.song-item.active * {
  @apply text-primary-foreground;
}

.song-item.active span.bg-white\/5 {
  @apply bg-white/20 text-white;
}

.song-list-container {
  @apply h-full max-h-full select-none will-change-scroll;
  scroll-behavior: smooth;
}

.scrollbar-hide::-webkit-scrollbar {
  display: none;
}

.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>