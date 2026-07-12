<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import { AnnouncementIcon } from '~/lib/tiptap/AnnouncementIcon'
import { SlashCommand } from '~/lib/tiptap/SlashCommand'
import { SpecialTextHighlight } from '~/lib/tiptap/SpecialTextHighlight'
import suggestion from '~/lib/tiptap/suggestion'
import 'tippy.js/dist/tippy.css'

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['update:modelValue', 'submit'])

const editor = useEditor({
  content: props.modelValue,
  extensions: [
    StarterKit.configure({
        // Disable features we don't want or handle manually
        heading: false,
        codeBlock: false,
    }),
    Placeholder.configure({
      placeholder: 'Escribe un anuncio o "/" para comandos...',
    }),
    CharacterCount.configure({
      limit: 1000,
    }),
    AnnouncementIcon,
    SpecialTextHighlight,
    SlashCommand.configure({
      suggestion,
    }),
  ],
  onUpdate: ({ editor }) => {
    emit('update:modelValue', editor.getHTML())
  },
  editorProps: {
    attributes: {
      class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl focus:outline-none min-h-[6rem] max-h-[12rem] overflow-y-auto outline-none',
    },
    handleKeyDown: (view, event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        event.stopPropagation()
        emit('submit')
        return true
      }
      return false
    }
  },
})

// Sync modelValue -> editor
watch(() => props.modelValue, (value) => {
  const isSame = editor.value?.getHTML() === value
  if (isSame) {
    return
  }
  editor.value?.commands.setContent(value, false)
})

onBeforeUnmount(() => {
  editor.value?.destroy()
})
</script>

<template>
  <div class="relative w-full bg-background border border-border rounded-lg p-5 transition-all focus-within:border-primary/50 focus-within:shadow-[0_0_20px_rgba(0,0,0,0.05)]">
    <editor-content :editor="editor" class="announcement-tiptap-editor" />
    
    <div v-if="editor" class="absolute bottom-3 right-3 text-[10px] font-mono text-muted-foreground pointer-events-none flex items-center gap-2">
      <span>{{ editor.storage.characterCount.characters() }} caracteres</span>
    </div>
  </div>
</template>

<style>
.announcement-tiptap-editor .tiptap p {
  margin: 0;
}

.announcement-tiptap-editor .tiptap p + p {
  margin-top: 0.25rem;
}

.announcement-tiptap-editor .tiptap {
  outline: none !important;
  font-size: 1.125rem;
  line-height: 1.5;
  font-weight: 500;
}

/* Custom icon rendering in editor */
.announcement-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--muted);
  border: 1px solid var(--border);
  border-radius: 0.25rem;
  padding: 0 0.25rem;
  margin: 0 0.125rem;
  vertical-align: middle;
  font-family: monospace;
  font-size: 0.75rem;
  font-weight: bold;
}

/* Tippy container overrides to avoid double borders/shadows */
.tippy-box {
  background: transparent !important;
  box-shadow: none !important;
}

.tippy-content {
  padding: 0 !important;
}

.tippy-arrow {
  color: var(--popover) !important;
}

/* Special keyword styling */
.announcement-tiptap-editor .text-red-600 {
  color: #dc2626;
  font-weight: 900;
}

.announcement-tiptap-editor .text-purple-600 {
  color: #9333ea;
  font-weight: 900;
}

.tiptap p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: #adb5bd;
  pointer-events: none;
  height: 0;
}
</style>
