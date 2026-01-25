<script setup lang="ts">
import type { SongFilter } from '@/composables/useSongs';

const props = defineProps<{
  searchTerm: string
  activeFilter: SongFilter
}>()

const emit = defineEmits<{
  (e: 'update:searchTerm', value: string): void
  (e: 'update:activeFilter', value: SongFilter): void
}>()

const filterOptions: { label: string, value: SongFilter }[] = [
  { label: 'Todos', value: 'Todos' },
  { label: 'Cantos', value: 'Canto' },
  { label: 'Especiales', value: 'Especial' }
]

const internalSearch = computed({
  get: () => props.searchTerm,
  set: (val) => emit('update:searchTerm', val)
})
</script>

<template>
  <div class="flex flex-col sm:flex-row gap-4 mb-6">
    <!-- Search -->
    <div class="relative flex-1">
      <GInput v-model="internalSearch" placeholder="Buscar por título o número..." class="pl-10 bg-background/50" />
      <Icon name="tabler:search" class="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground/70" />
    </div>

    <!-- Filters -->
    <div class="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 no-scrollbar">
      <template v-for="option in filterOptions" :key="option.value">
        <button 
          @click="$emit('update:activeFilter', option.value)"
          class="px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap border"
          :class="activeFilter === option.value 
            ? 'bg-primary text-primary-foreground border-primary' 
            : 'bg-background hover:bg-muted text-muted-foreground border-border'"
        >
          {{ option.label }}
        </button>
      </template>
    </div>
  </div>
</template>
