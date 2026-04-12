<script setup lang="ts">
import { nodeViewProps, NodeViewWrapper } from '@tiptap/vue-3'
import { useAnnouncementIcons } from '~/composables/useAnnouncementIcons'

const props = defineProps(nodeViewProps)
const { icons } = useAnnouncementIcons()

const iconName = computed(() => props.node.attrs.name)
const iconDef = computed(() => icons.find(i => i.name === iconName.value))

const iconColorClass = computed(() => {
  if (iconName.value === 'check') return 'text-green-500'
  if (iconName.value === 'heart') return 'text-red-500'
  if (iconName.value === 'star') return 'text-yellow-500'
  return ''
})
</script>

<template>
  <node-view-wrapper class="inline-block align-middle mx-1">
    <div 
      class="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-muted border border-border group select-none cursor-default"
      :class="{ 'ring-2 ring-primary/20 border-primary/50': props.selected }"
    >
      <Icon 
        v-if="iconDef" 
        :name="iconDef.icon" 
        class="size-4"
        :class="iconColorClass"
      />
      <span v-else class="text-[10px] font-mono text-muted-foreground uppercase">
        {{ iconName }}
      </span>
      <span class="text-[10px] font-bold text-muted-foreground group-hover:block hidden px-1 border-l border-border ml-1">
        /{{ iconName }}
      </span>
    </div>
  </node-view-wrapper>
</template>

<style scoped>
.node-view-wrapper {
    display: inline-block;
}
</style>
