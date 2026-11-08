<script setup lang="ts">
import type { Song } from '@/types/song'

const props = defineProps<{
  modelValue: boolean
  song: Song | null
  isAdmin: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'edit', song: Song): void
  (e: 'delete', id: string): void
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

// Se conserva el último canto mientras la sheet se desliza hacia afuera
const shown = ref<Song | null>(props.song)
watch(() => props.song, (s) => { if (s) shown.value = s })

// Una línea por salto de línea, vacías incluidas (también cuentan y pueden provocar errores).
const lines = computed(() =>
  typeof shown.value?.content === 'string' ? shown.value.content.split('\n') : []
)
const emptyCount = computed(() => lines.value.filter(l => !l.trim()).length)

// Marcadores de sección ("1", "2", "CORO", "Pre-CORO"): también son líneas, pero se destacan
const isMarker = (line: string) => /^\s*(\d+|(pre-?)?coro|puente|final|intro)\s*:?\s*$/i.test(line)
</script>

<template>
  <GSheet v-model="isOpen" class="md:max-w-xl w-full">
    <div v-if="shown" class="flex flex-col h-full min-h-0 pr-8">
      <div class="mb-5">
        <h2 class="text-2xl font-bold tracking-tight leading-tight">{{ shown.title }}</h2>

        <dl class="mt-4 grid grid-cols-3 gap-2">
          <div class="rounded-2xl bg-muted/60 px-4 py-3">
            <dt class="text-sm text-muted-foreground">{{ shown.type === 'Canto' ? 'Número' : 'Categoría' }}</dt>
            <dd class="text-xl font-bold tabular-nums mt-0.5" :class="shown.type === 'Canto' ? 'text-primary' : 'text-[#556b1f] dark:text-[#a9bd5b]'">
              {{ shown.type === 'Canto' ? shown.nh : songTypeLabel(shown.type) }}
            </dd>
          </div>
          <div class="rounded-2xl bg-muted/60 px-4 py-3">
            <dt class="text-sm text-muted-foreground">Líneas</dt>
            <dd class="text-xl font-bold tabular-nums mt-0.5">
              {{ lines.length }}<span v-if="emptyCount" class="text-sm font-medium text-muted-foreground"> · {{ emptyCount }} vacías</span>
            </dd>
          </div>
          <div class="rounded-2xl bg-muted/60 px-4 py-3">
            <dt class="text-sm text-muted-foreground">Secciones</dt>
            <dd class="text-xl font-bold tabular-nums mt-0.5">{{ lines.filter(isMarker).length }}</dd>
          </div>
        </dl>
      </div>

      <ol class="flex-1 min-h-0 overflow-y-auto -mr-2 pr-2 pb-2" aria-label="Líneas del canto">
        <li
          v-for="(line, i) in lines"
          :key="i"
          class="flex items-baseline gap-4 rounded-xl px-2 py-1.5"
          :class="isMarker(line) ? 'mt-3 first:mt-0 bg-primary/10' : ''"
        >
          <span
            class="w-8 shrink-0 text-right text-sm tabular-nums select-none"
            :class="line.trim() ? 'text-muted-foreground' : 'text-muted-foreground/45'"
          >{{ i + 1 }}</span>
          <span
            class="min-w-0 flex-1 text-lg leading-snug min-h-[1.6rem]"
            :class="isMarker(line) ? 'font-bold text-primary' : 'font-medium'"
          >{{ line }}</span>
        </li>
      </ol>

      <div v-if="isAdmin" class="pt-4 flex justify-end gap-2">
        <button
          type="button"
          @click="emit('delete', shown.id)"
          class="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-red-600 hover:bg-red-500/10 transition-colors"
        >
          <Icon name="tabler:trash" class="size-4" />
          Eliminar
        </button>
        <button
          type="button"
          @click="emit('edit', shown)"
          class="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-3 text-sm font-semibold transition-colors active:scale-95"
        >
          <Icon name="tabler:pencil" class="size-4" />
          Editar
        </button>
      </div>
    </div>
  </GSheet>
</template>
