<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'

const { isConnectionError, isManualConnectionTrigger, clientId, setClientId, isClientIdSet } = useApi()
const { isConnected, connectionStatus } = useRealtime()

const idInput = ref('')
const isCopied = ref(false)

const isOpen = computed({
  get: () => isConnectionError.value || isManualConnectionTrigger.value || !isClientIdSet.value,
  set: (val) => {
    // Si no está configurado el ID, no permitimos cerrar el diálogo manualmente
    if (!isClientIdSet.value && !val) return
    isConnectionError.value = val
    isManualConnectionTrigger.value = val
  }
})

const dialogTitle = computed(() => {
  if (!isClientIdSet.value) return 'Configuración Inicial'
  return isConnected.value ? 'Configuración de Cuenta' : 'Buscando servidor...'
})

const dialogDescription = computed(() => {
  if (!isClientIdSet.value) return 'Bienvenido. Para comenzar, confirma o genera tu identificador único para sincronizar tus dispositivos.'
  return isConnected.value 
    ? 'Este es tu identificador único. Compártelo con otros dispositivos (visor, monitor, etc.) para sincronizarlos.' 
    : 'Conectando con el servidor remoto. Podrás ver tus cantos y anuncios una vez establecida la conexión.'
})

onMounted(() => {
  idInput.value = clientId.value
})

const handleSave = () => {
  if (idInput.value && idInput.value !== clientId.value) {
    setClientId(idInput.value)
    // Recargar página para asegurar que todo se reinicie con el nuevo ID
    window.location.reload()
  } else {
    isOpen.value = false
  }
}

const copyId = async () => {
  try {
    await navigator.clipboard.writeText(clientId.value)
    isCopied.value = true
    setTimeout(() => { isCopied.value = false }, 2000)
  } catch (err) {
    console.error('Error al copiar:', err)
  }
}

const generateNewId = () => {
  const newId = crypto.randomUUID()
  idInput.value = newId
}
</script>

<template>
  <GDialog 
    v-model="isOpen"
    :title="dialogTitle"
    :description="dialogDescription"
    class="max-w-md"
  >
    <div class="space-y-6 py-4">
      <!-- Status Badge -->
      <div class="flex items-center justify-between p-3 rounded-2xl bg-muted/30 border border-border/50">
        <span class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estado de Conexión</span>
        <div class="flex items-center gap-2">
          <div class="size-2 rounded-full animate-pulse" 
            :class="isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'">
          </div>
          <span class="text-sm font-bold" :class="isConnected ? 'text-green-500' : 'text-amber-500'">
            {{ isConnected ? 'Conectado' : 'Conectando...' }}
          </span>
        </div>
      </div>

      <!-- Client ID Management -->
      <div v-if="isConnected" class="space-y-4">
        <div class="space-y-2">
          <label class="text-xs font-bold text-primary uppercase tracking-widest ml-1">Mi Identificador (Client ID)</label>
          <div class="relative group">
            <GInput 
              v-model="idInput"
              placeholder="Introduce un ID..."
              class="pr-24 font-mono text-sm h-12"
            />
            <div class="absolute right-1.5 top-1.5 flex gap-1">
              <GButton variant="secondary" size="sm" class="h-9 px-3" @click="generateNewId" title="Generar nuevo ID">
                <Icon name="tabler:refresh" class="size-4" />
              </GButton>
              <GButton variant="default" size="sm" class="h-9 px-3" @click="copyId">
                <Icon :name="isCopied ? 'tabler:check' : 'tabler:copy'" class="size-4" />
              </GButton>
            </div>
          </div>
          <p class="text-[10px] text-muted-foreground ml-1 italic">
            * Cambiar el ID hará que se recargue la aplicación para sincronizar los datos.
          </p>
        </div>

        <div class="p-4 bg-primary/5 border border-primary/10 rounded-2xl flex items-start gap-3">
          <Icon name="tabler:info-circle-filled" class="size-6 text-primary shrink-0 opacity-80" />
          <div class="text-xs text-muted-foreground leading-relaxed">
            <p class="font-bold text-foreground mb-1">¿Para qué sirve el ID?</p>
            Permite que varios dispositivos (el que controla, el visor de la pantalla, el de los músicos) compartan la misma lista y anuncios en tiempo real.
          </div>
        </div>
      </div>

      <div v-else class="flex flex-col items-center justify-center py-8 text-center space-y-4">
        <Icon name="tabler:loader-2" class="size-12 text-primary animate-spin opacity-50" />
        <p class="text-sm text-muted-foreground max-w-[200px]">Estableciendo túnel seguro con la nube...</p>
      </div>
    </div>

    <template #footer>
      <GButton 
        variant="default" 
        class="w-full sm:w-auto font-bold"
        :disabled="!isConnected"
        @click="handleSave"
      >
        {{ !isClientIdSet ? 'Comenzar' : (idInput !== clientId ? 'Guardar y Reiniciar' : 'Entendido') }}
      </GButton>
    </template>
  </GDialog>
</template>
