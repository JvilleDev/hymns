<script setup lang="ts">
const props = withDefaults(defineProps<{
  text: string,
  position?: 'top' | 'bottom'
}>(), {
  position: 'bottom'
})

const { parseHTML } = useContentParser()

const repeatCount = ref(20) 
const containerWidth = ref(1920) 
const isScrollable = ref(true)

const punctuatedText = ref(props.text)
const isPunctuating = ref(false)

const parsedContent = computed(() => parseHTML(punctuatedText.value))

const fetchPunctuation = async (textToPunctuate: string) => {
  if (!textToPunctuate) {
    punctuatedText.value = textToPunctuate
    return
  }
  
  isPunctuating.value = true
  try {
    const data = await useApi().post<{text: string}>('/api/punctuate', { text: textToPunctuate })
    if (data && data.text) {
      punctuatedText.value = data.text
    } else {
      punctuatedText.value = textToPunctuate
    }
  } catch (e) {
    // Fallback to raw text if service is unavailable
    punctuatedText.value = textToPunctuate
  } finally {
    isPunctuating.value = false
  }
}

watch(() => props.text, (newVal) => {
  fetchPunctuation(newVal)
}, { immediate: true })


const measureRef = ref<HTMLElement | null>(null)

const updateMetrics = async () => {
  if (typeof window === 'undefined') return
  await nextTick()
  if (!measureRef.value) return
  
  containerWidth.value = window.innerWidth
  const contentWidth = measureRef.value.offsetWidth
  
  if (contentWidth <= (window.innerWidth - 50)) {
      isScrollable.value = false
      repeatCount.value = 1
  } else {
      isScrollable.value = true
      const itemsPerScreen = Math.ceil(window.innerWidth / contentWidth)
      repeatCount.value = Math.min(Math.max(itemsPerScreen * 2, 5), 30)
  }
}

const duration = computed(() => {
  if (!measureRef.value) return 20 
  const contentWidth = measureRef.value.offsetWidth
  const totalContentWidth = contentWidth * repeatCount.value
  const speedPxPerSec = 150 
  return totalContentWidth / speedPxPerSec
})

watch(() => props.text, () => {
  updateMetrics()
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
    class="fixed left-0 right-0 z-50 bg-white text-black overflow-hidden py-4 font-bold tracking-widest border-y border-black/10"
    :class="[
      position === 'top' ? 'top-0 shadow-xl' : 'bottom-0 shadow-[0_-8px_40px_rgba(0,0,0,0.25)]'
    ]"
  >
    <div class="marquee-container w-full whitespace-nowrap text-center">
      <div 
        class="inline-block text-6xl font-bold tracking-wide uppercase"
        :class="{ 'animate-scroll': isScrollable }"
        :style="isScrollable ? { 
          animationDuration: `${duration}s`,
          animationDelay: '-10s'
        } : {}"
      >
        <span class="mx-48 inline-flex items-center gap-2" v-for="i in repeatCount" :key="i">
            <template v-for="(segment, idx) in parsedContent" :key="idx">
                <Icon 
                    v-if="segment.type === 'icon'" 
                    :name="segment.value" 
                    :class="segment.class"
                />
                <span 
                    v-else 
                    v-html="segment.value" 
                    :class="segment.class"
                ></span>
            </template>
        </span>
      </div>
    </div>
    
    <!-- Hidden Measure Element -->
    <div class="fixed top-0 left-0 -z-50 opacity-0 pointer-events-none invisible whitespace-nowrap">
       <div ref="measureRef" class="inline-block text-6xl font-bold tracking-wide uppercase">
          <span class="mx-48 inline-flex items-center gap-2">
            <template v-for="(segment, idx) in parsedContent" :key="idx">
                <Icon 
                    v-if="segment.type === 'icon'" 
                    :name="segment.value" 
                    :class="segment.class"
                />
                <span 
                    v-else 
                    v-html="segment.value" 
                    :class="segment.class"
                ></span>
            </template>
          </span>
       </div>
    </div>
  </div>
</template>

<style scoped>
.marquee-container {
  overflow: hidden;
}

.animate-scroll {
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
