<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

// Opciones disponibles para el visor
const options = ref({
  bg: true,      // Añade un fondo azul detrás del texto
  slide: false,   // Formatea el texto como una diapositiva a pantalla completa
  no_bg: false,   // Si se usa con slide, quita el fondo y hace que el texto sea negro
})

// Texto de ejemplo para la vista previa
const previewText = ref('Ejemplo de letra para el visor externo')

// Construir la URL basada en las opciones seleccionadas
const viewerUrl = computed(() => {
  const baseOrigin = import.meta.client
    ? window.location.origin
    : 'https://himnos.jville.dev'

  const url = new URL('/ver', baseOrigin)
  if (options.value.bg) url.searchParams.append('bg', 'true')
  if (options.value.slide) url.searchParams.append('slide', 'true')
  if (options.value.no_bg && options.value.slide) url.searchParams.append('no_bg', 'true')
  return url.toString()
})

const copyUrlToClipboard = async () => {
  if (!import.meta.client) return
  try {
    await navigator.clipboard.writeText(viewerUrl.value)
    toast.success('URL copiada al portapapeles')
  } catch (err) {
    toast.error('No se pudo copiar la URL')
  }
}

const openViewerInNewWindow = () => {
  if (!import.meta.client) return
  window.open(viewerUrl.value, '_blank', 'width=1280,height=720')
}

// Logic for exclusive options
watch(() => options.value.slide, (newValue) => {
  if (newValue) options.value.bg = false
  else options.value.no_bg = false
})

watch(() => options.value.bg, (newValue) => {
  if (newValue) {
    options.value.slide = false
    options.value.no_bg = false
  }
})

watch(options, (newVal) => {
  if (!newVal.bg && !newVal.slide && !newVal.no_bg) {
    options.value.bg = true
  }
}, { deep: true })
</script>

<template>
  <div class="flex-1 flex flex-col w-full min-h-0 overflow-hidden bg-background">
    <div class="flex-1 flex overflow-hidden">
      <!-- Panel de Opciones -->
      <aside class="w-80 border-r border-border bg-muted/5 flex flex-col p-6 gap-8 overflow-y-auto">
        <div class="space-y-6">
          <div>
            <h3 class="text-[10px] font-bold text-primary tracking-widest uppercase mb-4 opacity-70">APARIENCIA</h3>
            <div class="space-y-5">
              <div class="flex items-center justify-between">
                <div>
                  <label class="text-sm font-bold block">Fondo Azul</label>
                  <p class="text-[11px] text-muted-foreground">Caja contenedora de texto</p>
                </div>
                <GSwitch v-model="options.bg" />
              </div>

              <div class="flex items-center justify-between">
                <div>
                  <label class="text-sm font-bold block">Modo Pantalla</label>
                  <p class="text-[11px] text-muted-foreground">Fondo completo (Slide)</p>
                </div>
                <GSwitch v-model="options.slide" />
              </div>

              <div class="flex items-center justify-between" :class="{ 'opacity-30': !options.slide }">
                <div>
                  <label class="text-sm font-bold block">Sin Fondo</label>
                  <p class="text-[11px] text-muted-foreground">Solo texto negro</p>
                </div>
                <GSwitch v-model="options.no_bg" :disabled="!options.slide" />
              </div>
            </div>
          </div>

          <div class="pt-6 border-t border-border/50">
            <label class="text-[10px] font-bold text-primary tracking-widest uppercase mb-4 block opacity-70">CONTENIDO</label>
            <GInput v-model="previewText" placeholder="Escribe algo..." class="mt-2" />
          </div>
        </div>

        <div class="mt-auto pt-6 border-t border-border/50 space-y-4">
          <div>
            <label class="text-[10px] font-bold text-muted-foreground tracking-widest uppercase mb-2 block">URL DEL VISOR</label>
            <div class="flex gap-2">
              <input :value="viewerUrl" readonly class="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-[10px] font-mono outline-none" />
              <GButton @click="copyUrlToClipboard" variant="secondary" size="icon" class="shrink-0">
                <Icon name="tabler:copy" class="size-4" />
              </GButton>
            </div>
          </div>
          
          <GButton @click="openViewerInNewWindow" variant="default" size="sm" class="w-full gap-2">
            <Icon name="tabler:external-link" class="size-4" />
            Abrir Ventana
          </GButton>
        </div>
      </aside>

      <!-- Panel de Vista Previa Realista -->
      <main class="flex-1 bg-transparency flex flex-col relative overflow-hidden">
        <div class="absolute top-4 left-4 z-10">
          <span class="px-3 py-1 rounded-full bg-slate-800/80 backdrop-blur-md border border-slate-700/50 text-[10px] font-bold text-white uppercase tracking-widest shadow-sm">
            Vista Previa Real
          </span>
        </div>

        <div class="flex-1 flex flex-col items-center justify-center p-6 md:p-12 transition-all duration-500 overflow-hidden" 
          :class="[options.bg ? 'justify-end pb-12 md:pb-20' : '']">
          
          <div class="w-full flex justify-center items-center transition-all duration-500"
            :class="[
              options.slide ? 'h-full bg-blue-900/90' : '',
              options.bg && !options.slide ? 'bg-blue-900/80 py-6 px-8 md:py-8 md:px-12 rounded-[2.5rem] shadow-2xl backdrop-blur-md h-fit max-w-[95%]' : '',
              options.no_bg && options.slide ? '!bg-white border border-slate-200' : ''
            ]">
            <p class="text-center transition-all duration-500 leading-tight w-full"
              :class="[
                options.slide ? 'text-[clamp(1.2rem,6vh,10vh)] font-bold px-6' : 'text-[clamp(1rem,4vw,4.5rem)] font-medium px-4',
                (options.no_bg && options.slide) ? 'text-black' : 'text-white'
              ]">
              {{ previewText || '· · ·' }}
            </p>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.bg-transparency {
  background-color: #ffffff;
  background-image: 
    linear-gradient(45deg, #f1f5f9 25%, transparent 25%), 
    linear-gradient(-45deg, #f1f5f9 25%, transparent 25%), 
    linear-gradient(45deg, transparent 75%, #f1f5f9 75%), 
    linear-gradient(-45deg, transparent 75%, #f1f5f9 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
}
</style>