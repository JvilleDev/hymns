<script setup lang="ts">
import type { Song } from '@/types/song'

defineProps<{
  songs: Song[]
  isLoading: boolean
}>()

defineEmits<{
  (e: 'edit', song: Song): void
  (e: 'delete', id: string): void
}>()
</script>

<template>
  <div class="w-full relative">
    <div v-if="!isLoading" class="rounded-none border-t border-border bg-card overflow-hidden">
      <div v-if="songs.length > 0" class="overflow-x-auto">
        <table class="w-full text-sm text-left border-collapse table-fixed">
          <thead class="text-xs text-muted-foreground font-medium border-b border-border/50 sticky top-0 bg-card z-10 shadow-sm">
            <tr>
              <th scope="col" class="px-4 py-3 w-[80px] text-center font-normal">#</th>
              <th scope="col" class="px-4 py-3 w-[30%] font-normal">Título</th>
              <th scope="col" class="px-4 py-3 w-[40%] font-normal text-muted-foreground hidden md:table-cell">Letra</th>
              <th scope="col" class="px-4 py-3 w-[120px] font-normal">Categoría</th>
              <th scope="col" class="px-4 py-3 w-[100px] text-right font-normal"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border/30">
            <tr v-for="song in songs" :key="song.id" 
              class="group hover:bg-muted/40 transition-colors cursor-default"
              @click.self="$emit('edit', song)"
            >
              <!-- Number Column -->
              <td class="px-4 py-3 text-center" @click="$emit('edit', song)">
                <span v-if="song.type === 'Canto'" class="font-mono text-muted-foreground text-xs">
                  {{ song.nh }}
                </span>
                <Icon v-else name="tabler:star" class="size-3.5 text-orange-400/70 inline-block" />
              </td>

              <!-- Title Column -->
              <td class="px-4 py-3 font-medium text-foreground" @click="$emit('edit', song)">
                {{ song.title }}
              </td>

              <!-- Content Snippet Column (Hidden on mobile) -->
              <td class="px-4 py-3 hidden md:table-cell max-w-md" @click="$emit('edit', song)">
                <p class="truncate text-muted-foreground/70 text-xs font-normal">
                  {{ song.content?.replace(/\n/g, ' ') }}
                </p>
              </td>

              <!-- Category Column -->
              <td class="px-4 py-3" @click="$emit('edit', song)">
                <span 
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
                  :class="song.type === 'Especial' 
                    ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400' 
                    : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'"
                >
                  {{ song.type }}
                </span>
              </td>

              <!-- Actions Column -->
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    @click.stop="$emit('edit', song)" 
                    class="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                    title="Editar"
                  >
                    <Icon name="tabler:pencil" class="size-4" />
                  </button>
                  <button 
                    @click.stop="$emit('delete', song.id)" 
                    class="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                    title="Eliminar"
                  >
                    <Icon name="tabler:trash" class="size-4" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="py-20 text-center">
        <Icon name="tabler:mood-empty" class="size-10 text-muted-foreground/20 mx-auto mb-3" />
        <p class="text-sm text-muted-foreground">No se encontraron resultados.</p>
      </div>
    </div>

    <!-- Indicador de carga Table Skeleton -->
    <div v-else class="rounded-none border-t border-border bg-card overflow-hidden">
        <div class="divide-y divide-border/30">
            <div v-for="i in 10" :key="i" class="flex items-center gap-4 px-4 py-3">
                <GSkeleton class="h-4 w-8 bg-muted/30" />
                <GSkeleton class="h-4 w-1/3 bg-muted/40" />
                <GSkeleton class="h-4 w-1/3 hidden md:block bg-muted/30" />
                <GSkeleton class="h-4 w-16 bg-muted/30 ml-auto" />
            </div>
        </div>
    </div>
  </div>
</template>
