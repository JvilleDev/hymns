<script setup lang="ts">
const props = defineProps<{
  final: string
  interim: string
}>()

// We keep a history of finalized segments to create the vertical scroll effect
const containerRef = ref<HTMLElement | null>(null)

// Auto-scroll to bottom of the text container
const scrollToBottom = () => {
  if (containerRef.value) {
    containerRef.value.scrollTop = containerRef.value.scrollHeight
  }
}

watch([() => props.final, () => props.interim], () => {
  nextTick(scrollToBottom)
})
</script>

<template>
  <div class="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md text-black shadow-[0_-8px_40px_rgba(0,0,0,0.2)] h-[140px] border-t border-slate-200 overflow-hidden flex flex-col">
    <!-- Automatic Transcription Indicator -->
    <div class="absolute top-3 right-6 z-10 flex items-center gap-2 px-2.5 py-1 bg-red-500/10 border border-red-500/20 rounded-full">
      <div class="size-1.5 bg-red-500 rounded-full animate-pulse"></div>
      <span class="text-[8px] font-black text-red-500 uppercase tracking-[0.2em]">Transcripción Automática</span>
    </div>

    <!-- Main Text Area -->
    <div 
      ref="containerRef"
      class="flex-1 px-12 py-6 overflow-y-auto scroll-smooth no-scrollbar flex flex-col justify-end"
    >
      <div class="max-w-7xl mx-auto w-full">
        <div class="text-[42px] font-bold leading-[1.1] tracking-tight uppercase">
          <!-- Finalized Text (Stable) -->
          <span v-if="final" class="text-black">
            {{ final }}
          </span>
          
          <!-- Interim Text (Instant) -->
          <span v-if="interim" class="text-slate-400 italic">
             {{ interim }}
          </span>
          
          <!-- Caret / Pulse -->
          <span v-if="interim || final" class="inline-block w-1.5 h-[1.1em] bg-primary/40 ml-1 translate-y-2 animate-pulse"></span>
          
          <span v-if="!final && !interim" class="text-slate-300 italic text-3xl font-medium tracking-normal lowercase">
            esperando voz...
          </span>
        </div>
      </div>
    </div>

    <!-- Decorative Bottom Accent -->
    <div class="h-1.5 w-full bg-gradient-to-r from-primary/20 via-primary to-primary/20"></div>
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* Ensure text doesn't have jarring jumps when new words appear */
span {
  display: inline;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
