<script setup lang="ts">
const props = defineProps({
  items: {
    type: Array as () => any[],
    required: true,
  },
  command: {
    type: Function,
    required: true,
  },
  query: {
    type: String,
    default: '',
  },
})

const selectedIndex = ref(0)
const listRef = ref<HTMLElement | null>(null)

// Al cambiar los resultados (se escribe más) la selección vuelve al primero
watch(() => props.items, () => {
  selectedIndex.value = 0
  nextTick(() => listRef.value?.scrollTo({ top: 0 }))
})

// Mantiene visible la fila seleccionada al navegar con el teclado
watch(selectedIndex, () => {
  nextTick(() => {
    listRef.value
      ?.querySelector<HTMLElement>(`[data-index="${selectedIndex.value}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  })
})

const selectItem = (index: number) => {
  const item = props.items[index]
  if (item) props.command(item)
}

// Parte el nombre en [antes, coincidencia, después] para resaltar lo escrito
const parts = (name: string) => {
  const q = props.query.trim().toLowerCase()
  const i = q ? name.toLowerCase().indexOf(q) : -1
  if (i < 0) return { before: name, match: '', after: '' }
  return { before: name.slice(0, i), match: name.slice(i, i + q.length), after: name.slice(i + q.length) }
}

const onKeyDown = ({ event }: { event: KeyboardEvent }) => {
  if (!props.items.length) return false

  if (event.key === 'ArrowUp') {
    selectedIndex.value = (selectedIndex.value + props.items.length - 1) % props.items.length
    return true
  }

  if (event.key === 'ArrowDown') {
    selectedIndex.value = (selectedIndex.value + 1) % props.items.length
    return true
  }

  if (event.key === 'Tab' || event.key === 'Enter') {
    selectItem(selectedIndex.value)
    return true
  }

  return false
}

defineExpose({ onKeyDown })
</script>

<template>
  <div class="w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl bg-popover text-popover-foreground shadow-2xl overflow-hidden flex flex-col">
    <div class="flex items-baseline justify-between gap-3 px-4 pt-3 pb-2">
      <span class="text-sm font-semibold">Insertar imagen</span>
      <span v-if="items.length" class="text-xs text-muted-foreground tabular-nums">
        {{ items.length }} {{ items.length === 1 ? 'resultado' : 'resultados' }}
      </span>
    </div>

    <div v-if="items.length" ref="listRef" class="max-h-72 overflow-y-auto px-2 pb-2" role="listbox">
      <button
        v-for="(item, index) in items"
        :key="item.name"
        :data-index="index"
        role="option"
        :aria-selected="index === selectedIndex"
        type="button"
        class="w-full flex items-center gap-3 p-2 rounded-xl text-left transition-colors"
        :class="index === selectedIndex ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'"
        @mouseenter="selectedIndex = index"
        @mousedown.prevent
        @click="selectItem(index)"
      >
        <span class="size-11 shrink-0 rounded-lg bg-white flex items-center justify-center overflow-hidden">
          <img v-if="item.url" :src="item.url" :alt="item.name" class="size-full object-contain p-1" />
          <Icon v-else :name="item.icon" class="size-5 text-neutral-900" />
        </span>
        <span class="min-w-0 flex-1 text-sm font-medium truncate">
          <span class="opacity-60">/</span>{{ parts(item.name).before }}<mark
            v-if="parts(item.name).match"
            class="bg-transparent text-inherit font-bold underline decoration-2 underline-offset-2"
          >{{ parts(item.name).match }}</mark>{{ parts(item.name).after }}
        </span>
        <kbd
          v-if="index === selectedIndex"
          class="shrink-0 text-xs font-semibold px-2 py-1 rounded-md bg-primary-foreground/20"
        >Enter</kbd>
      </button>
    </div>

    <div v-else class="px-4 pb-5 pt-2 text-center">
      <p class="text-sm font-medium">Sin resultados para “{{ query }}”</p>
      <p class="text-xs text-muted-foreground mt-1">Súbela desde Medios para poder usarla.</p>
    </div>

    <div class="flex items-center gap-4 px-4 py-2.5 bg-muted/60 text-xs text-muted-foreground">
      <span><kbd class="font-semibold text-foreground">↑↓</kbd> moverse</span>
      <span><kbd class="font-semibold text-foreground">Enter</kbd> insertar</span>
      <span><kbd class="font-semibold text-foreground">Esc</kbd> cerrar</span>
    </div>
  </div>
</template>
