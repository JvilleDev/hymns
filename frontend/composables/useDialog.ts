import { ref } from 'vue'

export interface DialogOptions {
  title?: string
  confirmLabel?: string
  destructive?: boolean
}

interface DialogState extends DialogOptions {
  open: boolean
  kind: 'confirm' | 'prompt'
  message: string
  defaultValue: string
}

// ponytail: singleton de módulo, un solo diálogo a la vez (el anterior se cancela)
const dialogState = ref<DialogState | null>(null)
let resolveCurrent: ((value: boolean | string | null) => void) | null = null

const open = (kind: DialogState['kind'], message: string, defaultValue: string, options: DialogOptions = {}) => {
  // una llamada nueva cancela la pendiente para no dejar promesas colgadas
  resolveCurrent?.(kind === 'prompt' ? null : false)
  return new Promise<boolean | string | null>((resolve) => {
    resolveCurrent = resolve
    dialogState.value = {
      open: true,
      kind,
      message,
      defaultValue,
      title: kind === 'confirm' ? 'Confirmar' : 'Nombre corto',
      confirmLabel: 'Confirmar',
      destructive: false,
      ...options
    }
  })
}

export function confirmDialog(message: string, options?: DialogOptions): Promise<boolean> {
  return open('confirm', message, '', options) as Promise<boolean>
}

export function promptDialog(message: string, defaultValue = '', options?: DialogOptions): Promise<string | null> {
  return open('prompt', message, defaultValue, options) as Promise<string | null>
}

export function settleDialog(value: boolean | string | null) {
  const resolve = resolveCurrent
  resolveCurrent = null
  // se mantiene el estado con open=false para que la transición de salida se vea
  if (dialogState.value) dialogState.value = { ...dialogState.value, open: false }
  resolve?.(value)
}

export const useDialog = () => ({ dialogState, confirmDialog, promptDialog, settleDialog })
