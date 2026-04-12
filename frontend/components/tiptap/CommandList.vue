<script setup lang="ts">
import { useAnnouncementIcons } from '~/composables/useAnnouncementIcons'

const props = defineProps({
  items: {
    type: Array,
    required: true,
  },
  command: {
    type: Function,
    required: true,
  },
})

const { icons: availableIcons } = useAnnouncementIcons()
const selectedIndex = ref(0)

// Filter icons based on query if needed
// Tiptap passes the query in the props, but we will handle it via items in suggestion.ts
// For now, let's assume props.items contains what we need or we filter here

const selectItem = (index: number) => {
  const item = props.items[index]
  if (item) {
    props.command(item)
  }
}

const onKeyDown = ({ event }) => {
  if (event.key === 'ArrowUp') {
    selectedIndex.value = ((selectedIndex.value + props.items.length) - 1) % props.items.length
    return true
  }

  if (event.key === 'ArrowDown') {
    selectedIndex.value = (selectedIndex.value + 1) % props.items.length
    return true
  }

  if (event.key === 'Tab') {
    selectItem(selectedIndex.value)
    return true
  }

  return false
}

defineExpose({
  onKeyDown,
})
</script>

<template>
  <div class="bg-popover border border-border rounded-lg shadow-lg overflow-hidden flex flex-col min-w-[12rem] max-w-[20rem]">
    <div class="p-2 bg-muted/50 text-[10px] uppercase font-bold text-muted-foreground border-b border-border">
      Insertar Icono
    </div>
    <div class="max-h-48 overflow-y-auto p-1" v-if="items.length">
      <button
        v-for="(item, index) in items"
        :key="index"
        class="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors text-left"
        :class="index === selectedIndex ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'"
        @click="selectItem(index)"
      >
        <Icon :name="item.icon" class="size-4" />
        <span class="font-bold font-mono text-xs bg-muted border border-border px-1.5 py-0.5 rounded shadow-sm text-foreground">/{{ item.name }}</span>
        <span class="ml-auto text-xs opacity-70">{{ item.label }}</span>
      </button>
    </div>
    <div v-else class="p-4 text-center text-xs text-muted-foreground">
      No se encontraron iconos
    </div>
  </div>
</template>
