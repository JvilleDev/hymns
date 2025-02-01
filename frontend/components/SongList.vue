<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton';

type Song = {
  title: string,
  id: string,
  nh: number,
  type: string
  content?: string,
}

const props = defineProps<{
  elements: Song[];
  activeId: string;
}>();

defineEmits<{
  (e: 'changeSong', id: string): void;
}>();
</script>

<template>
  <ul id="song-selector" class="flex flex-col gap-2 p-1 m-0 max-h-[80svh] overflow-y-auto">
    <li
      v-for="i in elements.length > 0 ? elements : Array(10).fill({})"
      :key="i.id || _"
      class="flex flex-col items-start justify-center p-3 rounded-md cursor-pointer transition-all duration-200 border shadow-sm bg-white hover:bg-gray-100 hover:shadow-md"
      :class="[elements.length > 0 && activeId === i.id ? 'active-song' : '']"
      @click="elements.length > 0 && $emit('changeSong', i.id)"
    >
      <div v-if="elements.length > 0">
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
          <span v-if="i.type !== 'Especial'" class="text-sm font-semibold text-gray-600">
            {{ i.nh }}
          </span>
          <span class="font-medium text-gray-800">
            {{ i.title }}
          </span>
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
</style>