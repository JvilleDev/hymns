<script setup lang="ts">
import { ref, onMounted, computed, watch, onUnmounted } from 'vue'

const { isConnectionError, isManualConnectionTrigger, retryConnection, activeBaseUrl, checkUrl } = useApi()
const urlInput = ref('')
const useSsl = ref(false)
const isRetrying = ref(false)
const testStatus = ref<'idle' | 'testing' | 'success' | 'error'>('idle')
let debounceTimer: any = null

const isOpen = computed({
  get: () => isConnectionError.value || isManualConnectionTrigger.value,
  set: (val) => {
    isConnectionError.value = val
    isManualConnectionTrigger.value = val
  }
})

const dialogTitle = computed(() => isManualConnectionTrigger.value ? 'Configuración de Servidor' : 'Servidor no encontrado')
const dialogDescription = computed(() => isManualConnectionTrigger.value 
  ? 'Ajusta la dirección del backend. Esto reiniciará la conexión con el servidor especificado.' 
  : 'No se pudo establecer conexión con el backend. Por favor, especifica la dirección IP y el puerto para continuar.')

const runTest = async () => {
  if (!urlInput.value || urlInput.value.length < 3) {
    testStatus.value = 'idle'
    return
  }
  
  testStatus.value = 'testing'
  const protocol = useSsl.value ? 'https' : 'http'
  const fullUrl = `${protocol}://${urlInput.value.trim().replace(/^https?:\/\//, '')}`
  
  const isOk = await checkUrl(fullUrl)
  testStatus.value = isOk ? 'success' : 'error'
}

watch([urlInput, useSsl], () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  testStatus.value = 'testing'
  debounceTimer = setTimeout(runTest, 600)
})

onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})

onMounted(() => {
  // Inicializar input con la URL actual (sin el protocolo para facilitar edición rápida)
  if (activeBaseUrl.value) {
    urlInput.value = activeBaseUrl.value.replace(/^https?:\/\//, '')
    useSsl.value = activeBaseUrl.value.startsWith('https')
  }
})

const handleConnect = async () => {
  if (!urlInput.value) return
  isRetrying.value = true
  try {
    await retryConnection(urlInput.value, useSsl.value)
    // Cerrar si tiene éxito
    isOpen.value = false
  } catch (err) {
    console.error('[ConnectionDialog] Reintento fallido:', err)
  } finally {
    isRetrying.value = false
  }
}
</script>

<template>
  <GDialog 
    v-model="isOpen"
    :title="dialogTitle"
    :description="dialogDescription"
    class="max-w-md"
  >
    <div class="space-y-4 py-2">
      <GInput 
        v-model="urlInput"
        label="Dirección del Servidor"
        placeholder="ej: 192.168.1.40:3100"
        autofocus
        @keyup.enter="handleConnect"
      />

      <div class="space-y-3">
        <GSwitch 
          v-model="useSsl"
          label="Usar conexión segura (HTTPS/SSL)"
        />

        <div v-if="testStatus !== 'idle'" class="flex items-center gap-2 px-1">
          <template v-if="testStatus === 'testing'">
            <Icon name="tabler:loader-2" class="size-4 text-primary animate-spin" />
            <span class="text-xs text-muted-foreground italic">Probando conexión...</span>
          </template>
          <template v-else-if="testStatus === 'success'">
            <Icon name="tabler:circle-check" class="size-4 text-green-500" />
            <span class="text-xs text-green-600 font-medium tracking-tight">Conexión exitosa con el servidor</span>
          </template>
          <template v-else-if="testStatus === 'error'">
            <Icon name="tabler:circle-x" class="size-4 text-destructive" />
            <span class="text-xs text-destructive font-medium tracking-tight">No se pudo conectar al servidor</span>
          </template>
        </div>
      </div>
      
      <div class="p-3 bg-primary/5 border border-primary/10 rounded-xl flex items-start gap-3">
        <Icon name="tabler:info-circle" class="size-5 text-primary shrink-0 mt-0.5" />
        <div class="text-xs text-muted-foreground leading-relaxed">
          <p class="font-medium text-foreground mb-1 italic">¿Cómo encontrarla?</p>
          Si el servidor está en la misma red, usa la IP local del equipo que ejecuta el backend seguido de <code class="text-primary font-mono">:3100</code>.
        </div>
      </div>
    </div>

    <template #footer>
      <GButton 
        variant="default" 
        class="w-full sm:w-auto"
        :loading="isRetrying"
        @click="handleConnect"
      >
        Intentar conectar
      </GButton>
    </template>
  </GDialog>
</template>
