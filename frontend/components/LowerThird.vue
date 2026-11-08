<script setup lang="ts">
const props = defineProps<{
  text: string,
}>()

const { parseHTML } = useContentParser()

const repeatCount = ref(20) 
const isScrollable = ref(true)
// Ancho medido del contenido: debe ser reactivo, offsetWidth del DOM no lo es
const contentWidth = ref(0)

const parsedContent = computed(() => parseHTML(props.text))

const measureRef = ref<HTMLElement | null>(null)

const updateMetrics = () => {
  if (typeof window === 'undefined' || !measureRef.value) return

  const width = measureRef.value.offsetWidth
  if (!width) return
  contentWidth.value = width

  if (width <= (window.innerWidth - 50)) {
    isScrollable.value = false
    repeatCount.value = 1
  } else {
    isScrollable.value = true
    const itemsPerScreen = Math.ceil(window.innerWidth / width)
    repeatCount.value = Math.min(Math.max(itemsPerScreen * 2, 5), 30)
  }
}

// Velocidad constante en px/s: depende del ancho de UNA repetición más el hueco,
// recalculada cada vez que cambia el contenido medido
const duration = computed(() => {
  if (!contentWidth.value) return 20
  const speedPxPerSec = 150
  return (contentWidth.value * repeatCount.value) / speedPxPerSec
})

let observer: ResizeObserver | undefined

// El texto nuevo se pinta en el DOM después del cambio de prop, así que se mide
// cuando el elemento de medida realmente cambia de tamaño (texto, fuentes, imágenes)
watch(() => props.text, () => {
  nextTick(updateMetrics)
})

onMounted(() => {
  updateMetrics()
  if (measureRef.value && 'ResizeObserver' in window) {
    observer = new ResizeObserver(() => updateMetrics())
    observer.observe(measureRef.value)
  }
  window.addEventListener('resize', updateMetrics)
  document.fonts?.ready.then(updateMetrics)
})

onUnmounted(() => {
  observer?.disconnect()
  if (typeof window !== 'undefined') window.removeEventListener('resize', updateMetrics)
})
</script>

<template>
  <div class="fixed left-0 right-0 bottom-0 z-50">
  <div class="relative bg-white text-neutral-950 overflow-hidden py-[1.6vh]">
    <Transition name="announcement-fade" mode="out-in">
      <div :key="text" class="marquee-container w-full whitespace-nowrap text-center">
        <div 
          class="inline-block announcement-text font-extrabold uppercase"
          :class="{ 'animate-scroll': isScrollable }"
          :style="isScrollable ? { 
            animationDuration: `${duration}s`,
            animationDelay: '-10s'
          } : {}"
        >
          <span class="announcement-gap inline-flex items-center gap-[0.3em]" v-for="i in repeatCount" :key="i">
              <template v-for="(segment, idx) in parsedContent" :key="idx">
                  <img 
                      v-if="segment.type === 'image'" 
                      :src="segment.value" 
                      :class="segment.class" 
                  />
                  <Icon 
                      v-else-if="segment.type === 'icon'" 
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
    </Transition>
    
    <!-- Hidden Measure Element -->
    <div class="fixed top-0 left-0 -z-50 opacity-0 pointer-events-none invisible whitespace-nowrap">
       <div ref="measureRef" class="inline-block announcement-text font-extrabold uppercase">
          <span class="announcement-gap inline-flex items-center gap-[0.3em]">
            <template v-for="(segment, idx) in parsedContent" :key="idx">
                <img 
                    v-if="segment.type === 'image'" 
                    :src="segment.value" 
                    :class="segment.class" 
                />
                <Icon 
                    v-else-if="segment.type === 'icon'" 
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
.announcement-text {
  font-family: 'Outfit', sans-serif;
  font-size: clamp(2.5rem, 6vw, 6.5rem);
  line-height: 1.15;
  letter-spacing: -0.01em;
}

.announcement-gap {
  margin-inline: 6vw;
}

/* Cambio de texto: solo transform, sin fade */
.announcement-fade-enter-active,
.announcement-fade-leave-active {
  transition: transform 0.45s cubic-bezier(0.32, 0.72, 0, 1);
}

.announcement-fade-enter-from {
  transform: translateY(100%);
}

.announcement-fade-leave-to {
  transform: translateY(-100%);
}
</style>
