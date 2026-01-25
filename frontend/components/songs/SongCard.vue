<script setup lang="ts">
import type { Song } from '@/types/song';

defineProps<{
  song: Song
}>();

defineEmits<{
  (e: 'edit', song: Song): void
  (e: 'delete', id: string): void
}>();
</script>

<template>
  <GCard class="group h-full">
    <div class="flex justify-between items-start gap-4 h-full">
      <div class="flex-1 min-w-0">
        <h3 class="font-bold text-lg truncate group-hover:text-primary transition-colors">
          {{ song?.title }}
        </h3>
        <div class="flex items-center gap-2 mt-1">
          <span 
            class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-secondary/50 text-secondary-foreground"
            :class="song.type === 'Especial' ? 'bg-primary/10 text-primary' : 'bg-blue-500/10 text-blue-500'"
          >
            {{ song.type }}
          </span>
          <span v-if="song.type === 'Canto'"
            class="text-xs font-mono text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded">
            #{{ song.nh }}
          </span>
        </div>
      </div>
      <div class="flex gap-1 shrink-0">
        <GButton size="icon" variant="ghost" @click="$emit('edit', song)" tooltip="Editar canto">
          <Icon name="tabler:pencil" class="size-4" />
        </GButton>
        <GButton size="icon" variant="ghost" class="text-destructive hover:bg-destructive/10"
          @click="$emit('delete', song.id)" tooltip="Eliminar canto">
          <Icon name="tabler:trash" class="size-4" />
        </GButton>
      </div>
    </div>
  </GCard>
</template>
