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

const activeIndex = computed(() => Math.max(0, filterOptions.findIndex(o => o.value === props.activeFilter)))

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

    <!-- Filtros (el indicador se desliza al activo) -->
    <div class="relative grid grid-cols-3 p-1 rounded-2xl bg-muted/60 shrink-0 md:w-80" role="group" aria-label="Categoría">
      <span
        class="filter-pill absolute top-1 bottom-1 left-1 rounded-xl bg-primary shadow-sm shadow-primary/30"
        :style="{ transform: `translateX(${activeIndex * 100}%)` }"
        aria-hidden="true"
      />
      <button
        v-for="option in filterOptions"
        :key="option.value"
        type="button"
        @click="$emit('update:activeFilter', option.value)"
        :aria-pressed="activeFilter === option.value"
        class="relative z-10 px-5 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors duration-200"
        :class="activeFilter === option.value ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.filter-pill {
  width: calc((100% - 0.5rem) / 3);
  transition: transform 0.35s cubic-bezier(0.2, 0.7, 0.2, 1);
}
@media (prefers-reduced-motion: reduce) {
  .filter-pill { transition: none; }
}
</style>
