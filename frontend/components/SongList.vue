<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton';
import { watch } from 'vue';

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

// Optimizar el cálculo de similitud con memoización
const similarityCache = new Map<string, boolean>();

function getCacheKey(word1: string, word2: string): string {
  return `${word1}:${word2}`;
}

function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // deletion
        matrix[j - 1][i] + 1, // insertion
        matrix[j - 1][i - 1] + substitutionCost // substitution
      );
    }
  }

  return matrix[b.length][a.length];
}

function areSimilar(word1: string, word2: string, threshold = 0.3): boolean {
  const cacheKey = getCacheKey(word1.toLowerCase(), word2.toLowerCase());
  if (similarityCache.has(cacheKey)) {
    return similarityCache.get(cacheKey)!;
  }

  // Si ambas son números, usar una lógica especial
  if (!isNaN(Number(word1)) && !isNaN(Number(word2))) {
    const result = word1.includes(word2) || word2.includes(word1);
    similarityCache.set(cacheKey, result);
    return result;
  }

  const distance = levenshteinDistance(word1.toLowerCase(), word2.toLowerCase());
  const maxLength = Math.max(word1.length, word2.length);
  const result = distance / maxLength <= threshold;
  similarityCache.set(cacheKey, result);
  return result;
}

// Cache para el texto resaltado
const highlightCache = new Map<string, string>();

function highlightText(text: string, query: string) {
  if (!query || !text) return text;
  
  const cacheKey = `${text}:${query}`;
  if (highlightCache.has(cacheKey)) {
    return highlightCache.get(cacheKey)!;
  }
  
  const searchWords = query.trim().split(/\s+/).filter(word => word.length > 0);
  const words = text.split(/(\s+)/);
  
  const highlightedWords = words.map(word => {
    if (/^\s+$/.test(word)) return word;
    
    const shouldHighlight = searchWords.some(searchWord => {
      if (searchWord.length <= 2) {
        return word.toLowerCase().includes(searchWord.toLowerCase());
      }
      return areSimilar(word, searchWord);
    });
    
    return shouldHighlight
      ? `<mark class="bg-yellow-200/75 rounded-sm px-0.5">${word}</mark>`
      : word;
  });
  
  const result = highlightedWords.join('');
  highlightCache.set(cacheKey, result);
  return result;
}

// Limpiar caché cuando cambian las props
watch(() => props.searchTerm, () => {
  highlightCache.clear();
  similarityCache.clear();
});

defineEmits<{
  (e: 'changeSong', id: string): void;
}>();
</script>

<template>
  <ul id="song-selector" class="flex flex-col gap-2 p-1 m-0 max-h-[80svh] overflow-y-auto" v-auto-animate>
    <li
      v-for="i in elements.length > 0 ? elements : Array(5).fill({})"
      :key="i.id || '_' + Math.random()"
      :data-id="i.id"
      class="flex flex-col items-start justify-center p-3 rounded-md cursor-pointer transition-all duration-200 border shadow-sm bg-white hover:bg-gray-100 hover:shadow-md group"
      :class="[elements.length > 0 && activeId === i.id ? 'active-song' : '', isLoading ? 'opacity-50 pointer-events-none' : '']"
      @click="elements.length > 0 && $emit('changeSong', i.id)"
      v-auto-animate
    >
      <div v-if="elements.length > 0" v-auto-animate>
        <div class="flex items-center opacity-50 gap-1">
          <Icon
            class="size-3 opacity-65"
            :name="i.type === 'Especial' ? 'tabler:user-circle' : 'tabler:book'"
          />
          <span class="font-medium text-gray-700 text-sm">
            {{ i.type }}
          </span>
        </div>
        <div class="flex items-center space-x-2">
          <span v-if="i.type !== 'Especial'" class="text-sm font-semibold text-gray-600" v-html="highlightText(i.nh.toString(), props.searchTerm || '')">
          </span>
          <span class="font-medium text-gray-800" v-html="highlightText(i.title, props.searchTerm || '')">
          </span>
        </div>
        <div v-if="isSearching && i.content" class="mt-2 text-sm text-gray-500 line-clamp-2 text-ellipsis group-hover:bg-white transition bg-gray-100 rounded-m p-1 rounded-md" v-html="highlightText(i.content, props.searchTerm || '')">
        </div>
      </div>
      <Skeleton v-else class="w-full h-[72px] rounded-md" />
    </li>
  </ul>
</template>

<style>
.active-song {
  @apply !bg-emerald-100 !text-emerald-700 !shadow-lg;
  & * {
    @apply !text-emerald-700;
  }
}

mark {
  @apply transition-colors duration-200;
}

#song-selector {
  @apply rounded-lg max-h-[80svh] h-[80svh] select-none w-[40svw] will-change-scroll;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;

  @media (max-width: 640px) {
    @apply w-full;
  }
}
</style>