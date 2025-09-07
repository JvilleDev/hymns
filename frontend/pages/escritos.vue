<script setup lang="ts">
import { io } from "socket.io-client"

const socket = io(window.location.origin)

const editorRef = ref<HTMLElement | null>(null)
const hiddenTextarea = ref<HTMLTextAreaElement | null>(null)
const messages = ref<{ html: string }[]>([])

const activeStates = ref({
  bold: false,
  italic: false,
  underline: false,
  blockquote: false
})

function updateHidden() {
  if (!editorRef.value || !hiddenTextarea.value) return
  hiddenTextarea.value.value = editorRef.value.innerHTML
}

function updateToolbarState() {
  activeStates.value.bold = document.queryCommandState('bold')
  activeStates.value.italic = document.queryCommandState('italic')
  activeStates.value.underline = document.queryCommandState('underline')
  const selection = window.getSelection()
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0)
    const container = range.commonAncestorContainer
    const element = container.nodeType === Node.TEXT_NODE ? container.parentElement : container
    activeStates.value.blockquote = !!element?.closest('blockquote')
  }
}

function execCmd(cmd: string, value?: string) {
  document.execCommand(cmd, false, value ?? null)
  updateHidden()
  updateToolbarState()
  editorRef.value?.focus()
}

function onKeydown(e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.key === 'Enter') { e.preventDefault(); send(); return }
  if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); execCmd("bold"); return }
  if (mod && e.key.toLowerCase() === "i") { e.preventDefault(); execCmd("italic"); return }
  if (mod && e.key.toLowerCase() === "u") { e.preventDefault(); execCmd("underline"); return }

  if (e.altKey && !mod) {
    if (e.key === "1") { e.preventDefault(); execCmd("foreColor", "#ef4444"); return }
    if (e.key === "2") { e.preventDefault(); execCmd("foreColor", "#059669"); return }
    if (e.key === "3") { e.preventDefault(); execCmd("foreColor", "#2563eb"); return }
  }
}

function onInput() { updateHidden() }
function onSelectionChange() { updateToolbarState() }

function send() {
  if (!editorRef.value) return
  const html = editorRef.value.innerHTML.trim()
  if (!html) return
  const msg = { html }
  messages.value.unshift(msg)
  socket.emit("newWritten", msg)
  editorRef.value.innerHTML = ""
  updateHidden()
  updateToolbarState()
  editorRef.value.focus()
}

onMounted(() => {
  updateHidden()
  document.addEventListener('selectionchange', onSelectionChange)
})
onUnmounted(() => {
  document.removeEventListener('selectionchange', onSelectionChange)
})
</script>

<template>
  <div class="flex h-screen w-full">
    <!-- Editor -->
    <div class="flex-1 p-6 flex flex-col">
      <div class="bg-white border rounded-lg shadow flex flex-col">
        <!-- Toolbar -->
        <div class="flex justify-between items-center px-4 py-2 border-b bg-gray-50">
          <div class="flex gap-2">
            <button @click="() => execCmd('bold')" :class="['px-2 py-1 rounded', activeStates.bold ? 'bg-blue-500 text-white' : 'hover:bg-gray-200']"><b>B</b></button>
            <button @click="() => execCmd('italic')" :class="['px-2 py-1 rounded', activeStates.italic ? 'bg-blue-500 text-white' : 'hover:bg-gray-200']"><i>I</i></button>
            <button @click="() => execCmd('underline')" :class="['px-2 py-1 rounded', activeStates.underline ? 'bg-blue-500 text-white' : 'hover:bg-gray-200']"><u>U</u></button>
            <button @click="() => execCmd('formatBlock','blockquote')" :class="['px-2 py-1 rounded', activeStates.blockquote ? 'bg-blue-500 text-white' : 'hover:bg-gray-200']">❝</button>
          </div>
          <div class="flex gap-2">
            <button @click="() => execCmd('foreColor', '#ef4444')" class="w-5 h-5 rounded bg-red-500"></button>
            <button @click="() => execCmd('foreColor', '#059669')" class="w-5 h-5 rounded bg-green-600"></button>
            <button @click="() => execCmd('foreColor', '#2563eb')" class="w-5 h-5 rounded bg-blue-600"></button>
          </div>
        </div>

        <!-- Editor area -->
        <div ref="editorRef"
          class="flex-1 p-4 outline-none overflow-y-auto min-h-[120px] max-h-[300px]"
          contenteditable="true"
          spellcheck="false"
          data-placeholder="Escribe tu mensaje... (Ctrl+Enter para enviar)"
          @input="onInput"
          @keydown="onKeydown"
          @mouseup="updateToolbarState"
          @keyup="updateToolbarState"
        ></div>

        <!-- Footer -->
        <div class="flex justify-between items-center px-4 py-2 border-t bg-gray-50">
          <span class="text-xs text-gray-500">Ctrl+B/I/U • Alt+1,2,3 • Ctrl+Enter envía</span>
          <button @click="send" class="px-4 py-1 rounded bg-blue-500 text-white hover:bg-blue-600">Enviar</button>
        </div>
      </div>
    </div>

    <!-- Aside lateral -->
    <aside class="w-80 border-l bg-gray-50 p-4 overflow-y-auto">
      <h3 class="text-lg font-semibold mb-4">Mensajes enviados</h3>
      <div class="flex flex-col gap-3" v-auto-animate>
        <div v-for="(m, i) in messages" :key="i" class="p-3 bg-white rounded-lg border shadow-sm">
          <div v-html="m.html"></div>
        </div>
      </div>
    </aside>

    <textarea ref="hiddenTextarea" class="hidden" aria-hidden="true" readonly></textarea>
  </div>
</template>
