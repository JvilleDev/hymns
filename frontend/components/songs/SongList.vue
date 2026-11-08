<script setup lang="ts">
import type { Song } from '@/types/song'

const props = defineProps<{
  songs: Song[]
  isLoading: boolean
  isAdmin: boolean
}>()

const emit = defineEmits<{
  (e: 'view', song: Song): void
  (e: 'edit', song: Song): void
  (e: 'delete', id: string): void
}>()

// Admin: el clic abre el editor. El resto ve la letra en modo lectura.
const open = (song: Song) => (props.isAdmin ? emit('edit', song) : emit('view', song))
</script>

<template>
  <div class="w-full">
    <!-- Cargando -->
    <div v-if="isLoading" class="space-y-2">
      <div v-for="i in 10" :key="i" class="flex items-center gap-4 rounded-2xl bg-muted/40 px-5 py-4">
        <GSkeleton class="h-5 w-8" />
        <GSkeleton class="h-5 w-1/3" />
        <GSkeleton class="h-5 w-1/3 hidden md:block" />
        <GSkeleton class="h-5 w-16 ml-auto" />
      </div>
    </div>

    <!-- Vacío -->
    <div v-else-if="songs.length === 0" class="rounded-3xl bg-muted/40 py-20 px-6 text-center">
      <Icon name="tabler:music-off" class="size-10 text-muted-foreground/50 mx-auto mb-3" />
      <p class="text-lg font-semibold">No encontramos cantos</p>
      <p class="text-base text-muted-foreground mt-1">Prueba con otro título, número o categoría.</p>
    </div>

    <!-- Lista -->
    <ul v-else class="space-y-2">
      <li
        v-for="song in songs"
        :key="song.id"
        class="group flex items-center gap-4 rounded-2xl bg-muted/40 hover:bg-muted px-4 md:px-5 py-3.5 md:py-4 transition-colors cursor-pointer"
        tabindex="0"
        role="button"
        :aria-label="`${isAdmin ? 'Editar' : 'Ver'} ${song.title}`"
        @click="open(song)"
        @keydown.enter.self="open(song)"
      >
        <!-- Número -->
        <span class="w-12 shrink-0 text-center">
          <span v-if="song.type === 'Canto'" class="text-xl md:text-2xl font-bold tabular-nums text-primary">{{ song.nh }}</span>
          <OlivosIcon v-else class="size-8 mx-auto text-[#708238]" label="DR. JBP" />
        </span>

        <!-- Título y letra -->
        <div class="min-w-0 flex-1">
          <h3 class="text-base md:text-lg font-semibold leading-snug line-clamp-2 md:line-clamp-1">{{ song.title }}</h3>
          <p class="mt-0.5 text-sm text-muted-foreground truncate">{{ song.content?.replace(/\n/g, ' ') }}</p>
        </div>

        <!-- Categoría -->
        <span
          class="hidden md:inline-flex shrink-0 items-center rounded-full px-3 py-1 text-sm font-semibold"
          :class="song.type === 'Especial'
            ? 'bg-[#708238]/15 text-[#556b1f] dark:text-[#a9bd5b]'
            : 'bg-primary/10 text-primary'"
        >{{ songTypeLabel(song.type) }}</span>

        <!-- Acciones -->
        <div v-if="isAdmin" class="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            @click.stop="$emit('edit', song)"
            :aria-label="`Editar ${song.title}`"
            class="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
          >
            <Icon name="tabler:pencil" class="size-5" />
          </button>
          <button
            type="button"
            @click.stop="$emit('delete', song.id)"
            :aria-label="`Eliminar ${song.title}`"
            class="p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-background transition-colors"
          >
            <Icon name="tabler:trash" class="size-5" />
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
