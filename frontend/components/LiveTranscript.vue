<script setup lang="ts">
// Registro de transcripción en vivo (compartido por /anuncios y /transcripcion).
// Texto final por párrafos + palabras interinas. Sigue al final solo si el usuario
// está abajo; si sube para leer, no lo arrastra y ofrece volver al final.
const props = withDefaults(defineProps<{
  final: string
  interim: string
  /** Recorta el texto final a los últimos N caracteres. */
  maxLength?: number
  /** Muestra el botón de copiar en cada párrafo (emite `copy`). */
  copyable?: boolean
  size?: 'md' | 'lg'
  emptyText?: string
  /** Clases del contenedor con scroll (padding horizontal, etc.). */
  contentClass?: string
}>(), {
  maxLength: 0,
  copyable: false,
  size: 'md',
  emptyText: 'Escuchando… aún no hay voz.',
  contentClass: 'px-7 pb-6',
})

const emit = defineEmits<{ copy: [text: string] }>()

const BOTTOM_THRESHOLD = 64
const scroller = ref<HTMLElement | null>(null)
const stickToBottom = ref(true)

const paragraphs = computed(() => {
  const text = props.maxLength && props.final.length > props.maxLength
    ? props.final.slice(-props.maxLength)
    : props.final
  return text.split('\n').filter(p => p.trim())
})

const interimWords = computed(() =>
  props.interim.split(/\s+/).filter(Boolean).map((text, i) => ({ id: `i-${i}`, text }))
)

const isEmpty = computed(() => !paragraphs.value.length && !interimWords.value.length)

const textClass = computed(() =>
  props.size === 'lg'
    ? 'text-3xl sm:text-4xl leading-snug font-medium tracking-tight'
    : 'text-xl leading-snug font-medium tracking-tight'
)

const scrollToBottom = (smooth = false) => {
  const el = scroller.value
  if (!el) return
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  stickToBottom.value = true
}

const onScroll = () => {
  const el = scroller.value
  if (!el) return
  stickToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD
}

watch([() => props.final, () => props.interim], () => {
  if (isEmpty.value) stickToBottom.value = true
  if (!stickToBottom.value) return
  nextTick(() => scrollToBottom())
})

onMounted(() => nextTick(() => scrollToBottom()))
</script>

<template>
  <div class="relative flex-1 min-h-0">
    <div ref="scroller" class="h-full overflow-y-auto flex flex-col" :class="contentClass" @scroll.passive="onScroll">
      <div v-if="isEmpty" class="my-auto text-center py-8">
        <Icon name="tabler:ear" class="size-10 text-muted-foreground/40 mx-auto mb-3" />
        <p class="text-lg text-muted-foreground max-w-sm mx-auto">{{ emptyText }}</p>
      </div>

      <div v-else class="mt-auto space-y-5" :class="size === 'lg' ? 'max-w-4xl' : ''">
        <div
          v-for="(p, i) in paragraphs"
          :key="i"
          class="group relative rounded-xl -mx-3 px-3 py-2 transition-colors"
          :class="copyable ? 'hover:bg-foreground/5' : ''"
        >
          <p :class="[textClass, 'text-muted-foreground whitespace-pre-wrap', copyable ? 'pr-10' : '']">{{ p }}</p>
          <button
            v-if="copyable"
            type="button"
            aria-label="Copiar al editor"
            class="absolute top-2 right-2 flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-1.5 rounded-lg bg-background text-muted-foreground hover:text-foreground shadow-sm transition-opacity"
            @click="emit('copy', p)"
          >
            <Icon name="tabler:copy" class="size-4" />
          </button>
        </div>

        <TransitionGroup name="word-stream" tag="p" :class="[textClass, 'text-foreground']">
          <span v-for="word in interimWords" :key="word.id">{{ word.text + ' ' }}</span>
        </TransitionGroup>
      </div>
    </div>

    <Transition name="jump-fade">
      <button
        v-if="!stickToBottom && !isEmpty"
        type="button"
        class="absolute bottom-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-3.5 py-2 text-sm font-semibold shadow-lg shadow-primary/25 active:scale-95 transition-transform"
        @click="scrollToBottom(true)"
      >
        <Icon name="tabler:arrow-down" class="size-4" />
        Ir al final
      </button>
    </Transition>
  </div>
</template>

<style scoped>
/* solo opacidad: spans inline con espacio real, igual que el texto final */
.word-stream-enter-active { transition: opacity 0.3s ease; }
.word-stream-enter-from { opacity: 0; }

.jump-fade-enter-active, .jump-fade-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.jump-fade-enter-from, .jump-fade-leave-to { opacity: 0; transform: translate(-50%, 8px); }
</style>
