<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton';

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
</script>

<template>
  <div class="song-list-container w-full h-full">
    <div v-if="elements.length > 0 && searchTerm && searchTerm.length > 0" class="px-3 py-2 text-sm text-muted-foreground border-b">
      {{ elements.length }} resultado{{ elements.length !== 1 ? 's' : '' }} para "{{ searchTerm }}"
    </div>

    <ul class="flex flex-col gap-2 p-2 overflow-y-auto h-full">
      <li
          v-for="(item, index) in elements.length > 0 ? elements : Array(5).fill({})"
          :key="item.id || `skeleton-${index}`"
          :data-id="item.id"
          class="flex flex-col items-start justify-center p-3 rounded-md cursor-pointer transition-all duration-200 border shadow-sm bg-white hover:bg-gray-100 hover:shadow-md"
          :class="[
          elements.length > 0 && activeId === item.id ? 'active-song' : '',
          isLoading ? 'opacity-50 pointer-events-none' : ''
        ]"
          @click="elements.length > 0 && $emit('changeSong', item.id)"
      >
        <div v-if="elements.length > 0" class="w-full">
          <div class="flex items-center justify-between w-full">
            <div class="flex items-center opacity-50 gap-1">
              <Icon
                  class="size-3 opacity-65"
                  :name="item.type === 'Especial' ? 'tabler:user-circle' : 'tabler:book'"
              />
              <span class="font-medium text-gray-700 text-sm">
                {{ item.type }}
              </span>
            </div>
            <span
                v-if="item.type !== 'Especial'"
                class="text-xs font-semibold px-2 py-0.5 bg-gray-100 rounded-full text-gray-600"
            >
              {{ item.nh }}
            </span>
          </div>

          <div class="mt-1">
            <span class="font-medium text-gray-800 overflow-hidden text-ellipsis block">
              {{ item.title }}
            </span>
          </div>
        </div>

        <Skeleton v-else class="w-full h-[72px] rounded-md" />
      </li>

      <li v-if="elements.length === 0 && !isLoading" class="flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
        <Icon name="tabler:search-off" class="size-10 mb-2 opacity-40" />
        <p>No se encontraron resultados</p>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.active-song {
  @apply !bg-emerald-100 !text-emerald-700 !shadow-lg;
}

.active-song * {
  @apply !text-emerald-700;
}

.song-list-container {
  @apply h-full max-h-full select-none will-change-scroll;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
}
</style>