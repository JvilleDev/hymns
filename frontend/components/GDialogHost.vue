<script setup lang="ts">
const { dialogState, settleDialog } = useDialog()

const TITLE_ID = 'gdialog-title'
const MESSAGE_ID = 'gdialog-message'

const dialogRef = ref<HTMLElement | null>(null)
const confirmRef = ref<{ $el?: HTMLElement } | null>(null)
const inputValue = ref('')
let previouslyFocused: HTMLElement | null = null

const isOpen = computed(() => !!dialogState.value?.open)

// open=false al instante: una segunda llamada (Enter + click) no vuelve a resolver
const settle = (value: boolean | string | null) => {
  if (!isOpen.value) return
  settleDialog(value)
}

const confirm = () => settle(dialogState.value?.kind === 'prompt' ? inputValue.value : true)
const cancel = () => settle(dialogState.value?.kind === 'prompt' ? null : false)

const onModelUpdate = (open: boolean) => {
  if (!open) cancel()
}

watch(isOpen, async (open) => {
  if (!import.meta.client) return
  if (open) {
    previouslyFocused = document.activeElement as HTMLElement | null
    inputValue.value = dialogState.value?.defaultValue ?? ''
    await nextTick()
    const input = dialogRef.value?.querySelector('input') as HTMLInputElement | null
    if (input) {
      input.focus()
      input.select()
    } else {
      confirmRef.value?.$el?.focus()
    }
  } else {
    previouslyFocused?.focus()
    previouslyFocused = null
  }
})

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && isOpen.value) {
    e.preventDefault()
    cancel()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <GDialog :model-value="isOpen" class="max-w-md" @update:model-value="onModelUpdate">
    <div ref="dialogRef" role="dialog" aria-modal="true" :aria-labelledby="TITLE_ID" :aria-describedby="MESSAGE_ID">
      <h2 :id="TITLE_ID" class="text-xl font-bold text-foreground mb-2 pr-8">
        {{ dialogState?.title }}
      </h2>
      <p :id="MESSAGE_ID" class="text-sm text-muted-foreground">
        {{ dialogState?.message }}
      </p>

      <GInput v-if="dialogState?.kind === 'prompt'" v-model="inputValue" class="mt-4"
        :aria-label="dialogState?.title" @keydown.enter.prevent="confirm" />
    </div>

    <template #footer>
      <GButton variant="outline" @click="cancel">Cancelar</GButton>
      <GButton ref="confirmRef" :variant="dialogState?.destructive ? 'destructive' : 'default'" @click="confirm">
        {{ dialogState?.confirmLabel }}
      </GButton>
    </template>
  </GDialog>
</template>
