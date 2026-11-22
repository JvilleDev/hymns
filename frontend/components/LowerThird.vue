<script setup lang="ts">
const props = defineProps<{
  text: string,
}>()

const { parseHTML } = useContentParser()
const { config } = useRealtime()
// Escala compartida con la letra (configChange del server)
const fontScale = computed(() => config.value.fontSize / 100)

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
  <div class="lower-root fixed left-0 right-0 bottom-0 z-50" :style="{ '--fs': fontScale }">
  <div class="relative bg-white text-neutral-950 overflow-hidden py-4">
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
/* Misma altura que la caja de la letra: py-4 + 1 línea de leading-none */
.lower-root {
  --fsz-lyric: calc(clamp(1.5rem, 5vw, 6rem) * var(--fs, 1));
  /* Mayúsculas + peso 800/900 se ven ~1.4x más grandes que la letra (minúsculas, peso 500)
     con el mismo font-size; 0.7 iguala el tamaño percibido */
  --fsz: calc(var(--fsz-lyric) * 0.7);
}

/* La caja conserva la altura de la letra; el texto, más pequeño, va centrado */
.marquee-container {
  overflow: hidden;
  height: var(--fsz-lyric);
  display: flex;
  align-items: center;
  justify-content: center;
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
  font-size: var(--fsz);
  line-height: 1;
  /* inline-flex + top: evita que la línea crezca por la alineación de base de imágenes e íconos y recorte el contenido */
  display: inline-flex;
  align-items: center;
  vertical-align: top;
  height: 1em;
  flex-shrink: 0;
  letter-spacing: -0.01em;
}

/* El ancho/alto de los medios sigue al texto */
.announcement-text :deep(img) {
  height: 1em;
  width: auto;
  max-width: none;
  flex-shrink: 0;
}

.announcement-gap {
  vertical-align: top;
  flex-shrink: 0;
  margin-inline: 6vw;
}

/* Cambio de texto: solo transform, sin fade */
.announcement-fade-enter-active,
.announcement-fade-leave-active {
  transition: transform 0.45s cubic-bezier(0.32, 0.72, 0, 1);
}

/* La distancia incluye el relleno (py-4 = 1rem) para que el texto salga y entre
   por completo sin asomarse, sea cual sea el tamaño de letra */
.announcement-fade-enter-from {
  transform: translateY(calc(100% + 1rem));
}

.announcement-fade-leave-to {
  transform: translateY(calc(-100% - 1rem));
}

/* Íconos no deben estirar la línea */
.announcement-text :deep(svg) {
  max-height: 1em;
}
</style>
