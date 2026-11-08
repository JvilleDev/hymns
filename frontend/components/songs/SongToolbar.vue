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
  { label: 'DR. JBP', value: 'Especial' }
]

const internalSearch = computed({
  get: () => props.searchTerm,
  set: (val) => emit('update:searchTerm', val)
})
</script>

<template>
  <div class="flex flex-col md:flex-row md:items-center gap-3">
    <!-- Búsqueda -->
    <div class="relative flex-1">
      <Icon name="tabler:search" class="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground pointer-events-none" />
      <input
        v-model="internalSearch"
        type="search"
        aria-label="Buscar canto"
        placeholder="Buscar por título o número"
        class="w-full rounded-2xl bg-muted/60 pl-12 pr-4 py-3.5 text-base font-medium outline-none border-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground placeholder:font-normal"
      />
    </div>

    <!-- Filtros -->
    <div class="flex p-1 rounded-2xl bg-muted/60 shrink-0" role="group" aria-label="Categoría">
      <button
        v-for="option in filterOptions"
        :key="option.value"
        type="button"
        @click="$emit('update:activeFilter', option.value)"
        :aria-pressed="activeFilter === option.value"
        class="flex-1 md:flex-none px-5 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors"
        :class="activeFilter === option.value
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground'"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>
