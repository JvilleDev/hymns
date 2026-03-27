<script setup lang="ts">
import { ref, onMounted } from 'vue'

const { isConnectionError, retryConnection, activeBaseUrl } = useApi()
const urlInput = ref('')
const isRetrying = ref(false)

onMounted(() => {
  // Inicializar input con la URL actual (sin el protocolo para facilitar edición rápida)
  if (activeBaseUrl.value) {
    urlInput.value = activeBaseUrl.value.replace(/^https?:\/\//, '')
  }
})

const handleConnect = async () => {
  if (!urlInput.value) return
  isRetrying.value = true
  try {
    await retryConnection(urlInput.value)
  } catch (err) {
    console.error('[ConnectionDialog] Reintento fallido:', err)
  } finally {
    isRetrying.value = false
  }
}
</script>

<template>
  <GDialog 
    v-model="isConnectionError"
    title="Servidor no encontrado"
    description="No se pudo establecer conexión con el backend. Por favor, especifica la dirección IP y el puerto para continuar."
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
