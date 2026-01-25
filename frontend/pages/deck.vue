<script setup lang="ts">
const { activeIndex, activeCantoId, connect, disconnect, sendIndex, activeSong } = useSocket()
const socketConnected = ref(false)

// Init
onMounted(() => {
  connect()
  socketConnected.value = true
})

onUnmounted(() => {
  disconnect()
})

const activeQuickActionIndex = computed(() => {
  if (!activeSong.value?.quickActions) return -1
  // Find the last action whose index is <= activeIndex
  let activeIdx = -1
  for (let i = 0; i < activeSong.value.quickActions.length; i++) {
    if (activeSong.value.quickActions[i].index <= activeIndex.value) {
      activeIdx = i
    } else {
      break
    }
  }
  return activeIdx
})

function triggerAction(action: { text: string, index: number }) {
  sendIndex(action.index)
  if (navigator.vibrate) navigator.vibrate(50)
}

definePageMeta({
  layout: false
})
</script>

<template>
  <div class="fixed inset-0 bg-background text-foreground flex flex-col overflow-hidden">
    <!-- Header -->
    <header class="h-14 shrink-0 border-b border-border bg-muted/10 flex items-center px-4 justify-between">
      <div class="flex flex-col overflow-hidden">
        <span class="text-[10px] font-bold uppercase tracking-widest text-primary/70 leading-none mb-0.5">
            {{ activeSong ? (activeSong.nh ? `Himno #${activeSong.nh}` : 'Especial') : 'Esperando...' }}
        </span>
        <h1 class="font-bold text-base truncate leading-none">
          {{ activeSong ? activeSong.title : 'Conectando...' }}
        </h1>
      </div>
      <div class="flex items-center gap-2">
         <div class="size-2 rounded-full" :class="activeCantoId ? 'bg-green-500' : 'bg-yellow-500'"></div>
      </div>
    </header>

    <!-- Grid -->
    <main class="flex-1 p-4 overflow-y-auto">
      <div v-if="activeSong && activeSong.quickActions" 
           class="grid grid-cols-2 gap-4 h-full content-start">
        <button
          v-for="(action, idx) in activeSong.quickActions"
          :key="idx"
          @click="triggerAction(action)"
          class="relative h-24 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all duration-150 active:scale-95 border-2"
          :class="[
            idx === activeQuickActionIndex 
              ? 'bg-primary border-primary text-primary-foreground shadow-lg scale-[1.02]' 
              : 'bg-card border-border hover:border-primary/50 text-card-foreground'
          ]"
        >
          <span class="text-2xl font-bold uppercase text-center leading-tight px-2">
            {{ action.text }}
          </span>
          <span v-if="idx === 0" class="absolute top-2 right-3 text-[10px] opacity-50">#1</span>
        </button>
      </div>

      <div v-else class="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground opacity-50">
        <Icon name="tabler:device-mobile-vibration" class="size-16" />
        <p class="text-center font-medium px-8">Selecciona un canto en la computadora principal para ver los controles aquí.</p>
      </div>
    </main>
  </div>
</template>
