<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { SongLines, isSongMarker } from '~/lib/tiptap/SongLines'

const props = defineProps<{
  modelValue: boolean
  formData: {
    title: string
    type: string
    nh: number
    content: string
  }
  isNew: boolean
  isLoading: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'save'): void
}>()

const typeOptions = [
  { label: 'Canto', value: 'Canto' },
  { label: 'DR. JBP', value: 'Especial' }
]

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// --- Editor ---------------------------------------------------------------
// Un párrafo por línea. El contenido se guarda como texto plano separado por \n.
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const toHtml = (content: string) =>
  (content ?? '').split('\n').map(l => `<p>${escapeHtml(l)}</p>`).join('')

let lastEmitted = props.formData.content ?? ''

const editor = useEditor({
  content: toHtml(props.formData.content),
  extensions: [
    // Solo documento, párrafo, texto e historial (deshacer/rehacer): la letra es texto plano
    StarterKit.configure({
      heading: false, blockquote: false, bulletList: false, orderedList: false, listItem: false,
      listKeymap: false, codeBlock: false, code: false, horizontalRule: false, hardBreak: false,
      bold: false, italic: false, strike: false, underline: false, link: false,
    }),
    Placeholder.configure({ placeholder: 'Escribe la letra: una línea por cada línea que se proyecta…' }),
    SongLines,
  ],
  editorProps: {
    attributes: {
      class: 'song-editor-content focus:outline-none',
      spellcheck: 'false',
      'aria-label': 'Letra del canto',
    },
  },
  onUpdate: ({ editor }) => {
    const text = editor.getText({ blockSeparator: '\n' })
    lastEmitted = text
    props.formData.content = text
  },
})

// Carga el canto al abrir y ante cambios externos del contenido
const loadContent = () => {
  const content = props.formData.content ?? ''
  if (editor.value && content !== lastEmitted) {
    lastEmitted = content
    editor.value.commands.setContent(toHtml(content), false)
  }
}
watch(() => props.formData.content, loadContent)
watch(() => props.modelValue, (open) => {
  if (!open) return
  lastEmitted = ''
  loadContent()
})

// Estadísticas en vivo
const allLines = computed(() => (props.formData.content ?? '').split('\n'))
const lines = computed(() => allLines.value.filter(l => l.trim()))
const emptyCount = computed(() => allLines.value.length - lines.value.length)
const sectionCount = computed(() => lines.value.filter(isSongMarker).length)

// Ctrl/⌘ + S guarda sin salir del editor (requestSubmit respeta los campos requeridos)
const formRef = ref<HTMLFormElement | null>(null)
useEventListener(typeof window !== 'undefined' ? window : undefined, 'keydown', (e: KeyboardEvent) => {
  if (!props.modelValue) return
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    formRef.value?.requestSubmit()
  }
})

const isMac = ref(false)
onMounted(() => {
  isMac.value = navigator.platform.toUpperCase().indexOf('MAC') >= 0
})
onBeforeUnmount(() => editor.value?.destroy())
</script>

<template>
  <GSheet v-model="isOpen" class="md:max-w-3xl w-full">
    <form id="sheet-form" ref="formRef" @submit.prevent="$emit('save')" class="flex flex-col h-full min-h-0">
      <!-- Cabecera -->
      <div class="pr-8 mb-4 space-y-3">
        <p class="text-sm font-semibold text-muted-foreground">{{ isNew ? 'Nuevo canto' : 'Editar canto' }}</p>
        <div class="flex flex-col md:flex-row md:items-end gap-3">
          <div class="flex-1 min-w-0">
            <label for="song-title" class="sr-only">Título</label>
            <input
              id="song-title"
              v-model="formData.title"
              required
              placeholder="Título del canto"
              class="w-full bg-transparent text-2xl md:text-3xl font-bold tracking-tight outline-none border-none px-0 placeholder:text-muted-foreground/50 focus:ring-0"
            />
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <div class="flex p-1 rounded-xl bg-muted/60" role="group" aria-label="Categoría">
              <button
                v-for="opt in typeOptions"
                :key="opt.value"
                type="button"
                @click="formData.type = opt.value"
                :aria-pressed="formData.type === opt.value"
                class="px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                :class="formData.type === opt.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
              >{{ opt.label }}</button>
            </div>
            <template v-if="formData.type === 'Canto'">
              <label for="song-number" class="sr-only">Número</label>
              <input
                id="song-number"
                v-model="formData.nh"
                type="number"
                inputmode="numeric"
                required
                placeholder="Nº"
                class="w-20 rounded-xl bg-muted/60 px-3 py-2 text-base font-bold tabular-nums text-center outline-none border-none focus:ring-2 focus:ring-primary/40"
              />
            </template>
          </div>
        </div>
      </div>

      <!-- Editor: una sola superficie, las líneas se numeran en su lugar -->
      <div class="flex-1 min-h-0 overflow-y-auto -mr-2 pr-2 song-editor" @click.self="editor?.commands.focus('end')">
        <EditorContent :editor="editor" />
      </div>

      <!-- Pie -->
      <div class="pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p class="text-sm text-muted-foreground tabular-nums">
          {{ allLines.length }} {{ allLines.length === 1 ? 'línea' : 'líneas' }}
          <template v-if="emptyCount"> ({{ emptyCount }} {{ emptyCount === 1 ? 'vacía' : 'vacías' }})</template>
          · {{ sectionCount }} {{ sectionCount === 1 ? 'sección' : 'secciones' }}
          <span class="hidden md:inline"> · <kbd class="font-semibold text-foreground">{{ isMac ? '⌘' : 'Ctrl' }} + S</kbd> guarda</span>
        </p>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            @click="isOpen = false"
            class="flex-1 sm:flex-none rounded-xl px-5 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >Cancelar</button>
          <button
            type="submit"
            :disabled="isLoading || !lines.length"
            class="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-3 text-sm font-semibold transition-colors active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
          >
            <Icon v-if="isLoading" name="tabler:loader" class="size-4 animate-spin" />
            {{ isNew ? 'Crear canto' : 'Guardar cambios' }}
          </button>
        </div>
      </div>
    </form>
  </GSheet>
</template>

<style>
/* Cada párrafo = una línea; el número va en el medianil izquierdo (decoración data-n) */
.song-editor .song-editor-content {
  min-height: 100%;
  padding-bottom: 4rem;
  font-size: 1.125rem;
  font-weight: 500;
  line-height: 1.4;
}

.song-editor .song-editor-content p {
  position: relative;
  margin: 0;
  padding: 0.3rem 0.75rem 0.3rem 3.5rem;
  min-height: 2.1rem;
  border-radius: 0.75rem;
}

.song-editor .song-editor-content p[data-n]::before {
  content: attr(data-n);
  position: absolute;
  left: 0;
  top: 0.3rem;
  width: 2.25rem;
  text-align: right;
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.8;
  font-variant-numeric: tabular-nums;
  color: hsl(var(--muted-foreground));
  user-select: none;
}

.song-editor .song-editor-content p.song-line-empty[data-n]::before {
  color: hsl(var(--muted-foreground) / 0.45);
}

.song-editor .song-editor-content p.song-line-marker {
  margin-top: 0.5rem;
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
  font-weight: 700;
}

.song-editor .song-editor-content p.song-line-active {
  background: hsl(var(--primary) / 0.08);
}

.song-editor .song-editor-content p.song-line-active[data-n]::before {
  color: hsl(var(--foreground));
  font-weight: 700;
}

.song-editor .song-editor-content p.is-editor-empty:first-child::after {
  content: attr(data-placeholder);
  color: hsl(var(--muted-foreground) / 0.6);
  pointer-events: none;
}
</style>
