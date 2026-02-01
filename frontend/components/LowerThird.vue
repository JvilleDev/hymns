<script setup lang="ts">
const props = withDefaults(defineProps<{
  text: string,
  position?: 'top' | 'bottom'
}>(), {
  position: 'bottom'
})

const repeatCount = ref(20) // Start with a safe lower default
const containerWidth = ref(1920) // Default HD width

const updateMetrics = () => {
  if (typeof window === 'undefined') return
  containerWidth.value = window.innerWidth
  
  const charWidth = 70
  const gap = 384 // mx-48
  // Use stripped length for accurate width calculation
  const textLen = strippedText.value.length
  
  const widthPerItem = textLen * charWidth + gap
  const itemsPerScreen = Math.ceil(window.innerWidth / widthPerItem)
  repeatCount.value = Math.min(Math.max(itemsPerScreen * 2, 5), 30)
}

// Compute simple text length without formatting tags for metrics
const strippedText = computed(() => {
  let s = props.text
  // Remove markdown symbols
  s = s.replace(/\*\*/g, '').replace(/\*/g, '')
  // Remove color tags [red], [/red], [/], etc.
  s = s.replace(/\[\/?(red|blue|purple)\]/gi, '')
  s = s.replace(/\[\/\]/g, '')
  return s
})

const formattedText = computed(() => {
  let s = props.text
    // Escape HTML to be safe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  // Auto-format "WSS:" to red
  s = s.replace(/WSS:/g, '<span class="text-red-600">WSS:</span>');
  
  // Auto-format "WMB" to purple
  s = s.replace(/WMB/g, '<span class="text-purple-600">WMB</span>');

  // Bold **text** -> font-black (stronger than base font-bold)
  s = s.replace(/\*\*(.*?)\*\*/g, '<span class="font-black">$1</span>');

  // Italic *text* -> italic
  s = s.replace(/\*(.*?)\*/g, '<span class="italic">$1</span>');

  // Colors [red]text[/red] or [red]text[/]
  const colors = ['red', 'blue', 'purple'];
  colors.forEach(c => {
    const re = new RegExp(`\\[${c}\\](.*?)\\[(\\/${c}|\\/)\\]`, 'gi');
    s = s.replace(re, `<span class="text-${c}-600 pb-2 inline-block">$1</span>`);
  });

  return s;
})

const duration = computed(() => {
  const charWidth = 70
  const gap = 384
  
  const totalContentWidth = (strippedText.value.length * charWidth + gap) * repeatCount.value
  const speedPxPerSec = 150 
  
  return totalContentWidth / speedPxPerSec
})

onMounted(() => {
  updateMetrics()
  window.addEventListener('resize', updateMetrics)
})

onUnmounted(() => {
  if (typeof window !== 'undefined') window.removeEventListener('resize', updateMetrics)
})
</script>

<template>
  <div 
    class="fixed left-0 right-0 z-50 bg-white text-black overflow-hidden py-4 font-bold tracking-widest shadow-2xl border-black"
    :class="[
      position === 'top' ? 'top-0 border-b-[6px]' : 'bottom-0 border-t-[6px]'
    ]"
  >
    <div class="marquee-container w-full whitespace-nowrap text-center">
      <div 
        class="marquee-content inline-block text-8xl font-bold tracking-wide uppercase"
        :style="{ animationDuration: `${duration}s` }"
      >
        <span class="mx-48" v-for="i in repeatCount" :key="i" v-html="formattedText"></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.marquee-container {
  overflow: hidden;
}

.marquee-content {
  animation: scroll linear infinite;
}

@keyframes scroll {
  0% {
    transform: translateX(100vw);
  }
  100% {
    transform: translateX(-100%);
  }
}
</style>
