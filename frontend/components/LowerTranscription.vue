<script setup lang="ts">
const props = defineProps<{
  final: string
  interim: string
  position?: 'top' | 'bottom'
}>()

const containerRef = ref<HTMLElement | null>(null)

// Use a simple split but keep it responsive
const words = computed(() => {
  const allText = props.interim || ''
  return allText.split(/\s+/).filter(Boolean).map((text, i) => ({
    id: `word-${i}`,
    text
  }))
})

const scrollToBottom = () => {
  if (containerRef.value) {
    containerRef.value.scrollTop = containerRef.value.scrollHeight
  }
}

watch(words, () => {
  nextTick(scrollToBottom)
}, { deep: true })
</script>

<template>
  <div 
    class="fixed left-0 right-0 z-50 flex justify-center pointer-events-none px-6"
    :class="[position === 'top' ? 'top-10' : 'bottom-10']"
  >
    <Transition name="pill">
      <div 
        v-if="interim || final"
        class="bg-white/95 backdrop-blur-xl px-12 py-5 rounded-[2.5rem] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.2)] border border-black/5 flex flex-col justify-center w-full max-w-[90vw] xl:max-w-6xl overflow-hidden relative"
      >
        <!-- Top fade for scrolling text -->
        <div class="absolute top-0 inset-x-0 h-6 bg-gradient-to-b from-white/95 to-transparent pointer-events-none z-10 rounded-t-[2.5rem]"></div>

        <!-- Vertical Flow Container -->
        <div 
          ref="containerRef"
          class="w-full text-center overflow-y-auto no-scrollbar scroll-smooth relative z-0 py-1 font-outfit text-[clamp(1.5rem,4vh,5vh)] leading-[1.3]"
          style="height: 2.6em;"
        >
          <TransitionGroup 
            name="word-pop" 
            tag="p" 
            class="font-black uppercase tracking-tight text-neutral-900"
          >
            <span 
              v-for="word in words" 
              :key="word.id"
              class="inline-block mr-3"
            >
              {{ word.text }}
            </span>
          </TransitionGroup>
        </div>

        <!-- Bottom fade -->
        <div class="absolute bottom-0 inset-x-0 h-6 bg-gradient-to-t from-white/95 to-transparent pointer-events-none z-10 rounded-b-[2.5rem]"></div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Word entry: pop-up effect */
.word-pop-enter-active {
  transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.word-pop-enter-from {
  opacity: 0;
  transform: scale(0.9);
  filter: blur(4px);
}

/* Smooth shifting as new words push old ones */
.word-pop-move {
  transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* Pill appearance transition */
.pill-enter-active, .pill-leave-active {
  transition: all 0.6s cubic-bezier(0.23, 1, 0.32, 1);
}
.pill-enter-from, .pill-leave-to {
  opacity: 0;
  transform: translateY(30px) scale(0.9);
}
</style>
