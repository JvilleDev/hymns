<template>
  <div 
    class="fixed left-0 right-0 z-50 bg-white text-black overflow-hidden py-6 font-bold border-y border-black/10 shadow-[0_-8px_40px_rgba(0,0,0,0.25)]"
    :class="[position === 'top' ? 'top-0 shadow-xl' : 'bottom-0']"
  >
    <!-- Transcription Container -->
    <div class="relative max-w-[95vw] mx-auto">
      <!-- Left Gradient Overlay -->
      <div class="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none"></div>
      
      <div 
        ref="containerRef"
        class="overflow-x-auto no-scrollbar flex items-center"
      >
        <div class="w-full text-center min-w-max">
          <p class="text-[clamp(1.5rem,5vh,6vh)] font-black leading-tight uppercase tracking-tight font-outfit whitespace-nowrap inline-flex items-center">
            <!-- Animated Interim Stream -->
            <TransitionGroup name="word-stream" tag="span" class="inline-flex gap-x-2">
              <span 
                v-for="word in interimWords" 
                :key="word.id"
                class="inline-block text-black"
              >
                {{ word.text }}
              </span>
            </TransitionGroup>
          
          <!-- Caret -->
          <span v-if="interim || final" class="inline-block w-[0.15em] h-[0.9em] bg-black/10 ml-2 translate-y-[0.1em] animate-pulse"></span>
          
          <!-- Idle State -->
          <span v-if="!final && !interim" class="text-black/10 italic text-[3vh] font-medium tracking-normal lowercase">
            esperando voz...
          </span>
        </p>
      </div>
    </div>
  </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  final: string
  interim: string
  position?: 'top' | 'bottom'
}>()

const containerRef = ref<HTMLElement | null>(null)

const interimWords = computed(() => {
  return props.interim.split(/\s+/).filter(Boolean).map((w, i) => ({
    id: `w-${i}-${w}`,
    text: w
  }))
})

const scrollToEnd = () => {
  if (containerRef.value) {
    containerRef.value.scrollLeft = containerRef.value.scrollWidth
  }
}

watch([() => props.final, () => props.interim], () => {
  nextTick(scrollToEnd)
})
</script>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* Word stream animation: subtle fade only */
.word-stream-enter-active {
  transition: opacity 0.15s ease-out;
}

.word-stream-enter-from {
  opacity: 0;
}

.word-stream-move {
  transition: transform 0.2s ease;
}
</style>
