<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

// Opciones disponibles para el visor
const options = ref({
  bg: true,      // Añade un fondo azul detrás del texto
  slide: false,   // Formatea el texto como una diapositiva a pantalla completa
  no_bg: false,   // Si se usa con slide, quita el fondo y hace que el texto sea negro
})

// URL base para el visor (usado en la versión desplegada)
const baseUrl = useRoute().fullPath

// Texto de ejemplo para la vista previa
const previewText = ref('Texto de ejemplo para el visor')
// Construir la URL basada en las opciones seleccionadas
const viewerUrl = computed(() => {
  // Verificar si estamos en el cliente o en el servidor
  const baseOrigin = import.meta.client
    ? window.location.origin
    : 'https://himnos.jville.dev'

  // Creamos una URL absoluta
  const url = new URL('/ver', baseOrigin)

  if (options.value.bg) {
    url.searchParams.append('bg', '')
  }

  if (options.value.slide) {
    url.searchParams.append('slide', '')
  }

  if (options.value.no_bg && options.value.slide) {
    url.searchParams.append('no_bg', '')
  }

  return url.toString()
})

// Función para copiar la URL al portapapeles
const copyUrlToClipboard = async () => {
  if (!import.meta.client) return

  try {
    await navigator.clipboard.writeText(viewerUrl.value)
    toast.success('URL copiada al portapapeles')
  } catch (err) {
    toast.error('No se pudo copiar la URL')
    console.error('Error al copiar: ', err)
  }
}

// Función para abrir el visor en una nueva ventana
const openViewerInNewWindow = () => {
  if (!import.meta.client) return

  window.open(viewerUrl.value, '_blank', 'width=1280,height=720')
}

// Para gestionar el comportamiento cuando slide cambia
watch(() => options.value.slide, (newValue) => {
  if (newValue) {
    // Si se activa el modo diapositiva, desactivamos el fondo (bg)
    options.value.bg = false;
  } else {
    // Si se desactiva el modo diapositiva, desactivamos la opción sin fondo
    options.value.no_bg = false;
  }
})

// Para gestionar el comportamiento cuando bg cambia
watch(() => options.value.bg, (newValue) => {
  if (newValue) {
    // Al activar bg, desactivamos slide y no_bg
    options.value.slide = false;
    options.value.no_bg = false;
  }
})

// Para desactivar bg cuando no_bg se activa
watch(() => options.value.no_bg, (newValue) => {
  if (newValue) {
    options.value.bg = false;
  }
})

</script>

<template>
  <div class="w-full px-3 py-8 pb-0 md:mx-auto md:max-w-7xl">
    <!-- Cabecera -->
    <header class="mb-8 text-center">
      <h1
        class="text-2xl font-bold mb-2 text-foreground text-center tracking-tight">
        Constructor de Visor</h1>
      <p class="text-muted-foreground text-sm">Configura las opciones para el visor y obtén una URL personalizada</p>
    </header>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:items-start">
      <!-- Panel de configuración -->
      <GCard class="h-full">
        <template #header>
          <div class="flex items-center">
            <Icon name="tabler:settings" class="size-5 mr-2 text-primary/70" />
            <h2 class="text-lg font-semibold">Opciones de visualización</h2>
          </div>
        </template>

        <div class="space-y-6">
          <!-- Opciones agrupadas -->
          <div class="space-y-4">
            <h3 class="text-xs font-bold text-primary/60 tracking-widest uppercase mb-4">APARIENCIA DEL TEXTO</h3>

            <!-- Opción: Fondo -->
            <div class="flex items-center justify-between group">
              <div>
                <span
                  class="text-sm font-semibold text-foreground/90 group-hover:text-foreground transition-colors">Fondo
                  azul</span>
                <p class="text-xs text-muted-foreground">Añade un fondo azul semitransparente detrás del texto</p>
              </div>
              <GSwitch v-model="options.bg" />
            </div>

            <!-- Opción: Modo Slide -->
            <div class="flex items-center justify-between group">
              <div>
                <span
                  class="text-sm font-semibold text-foreground/90 group-hover:text-foreground transition-colors">Modo
                  Diapositiva</span>
                <p class="text-xs text-muted-foreground">Formatea el texto como una diapositiva a pantalla completa</p>
              </div>
              <GSwitch v-model="options.slide" />
            </div>

            <!-- Opción: Sin fondo (solo disponible si slide está activado) -->
            <div class="flex items-center justify-between group transition-opacity duration-300"
              :class="{ 'opacity-40 pointer-events-none': !options.slide }">
              <div>
                <span class="text-sm font-semibold text-foreground/90 group-hover:text-foreground transition-colors">Sin
                  fondo
                  (texto negro)</span>
                <p class="text-xs text-muted-foreground">Quita el fondo azul y hace que el texto sea negro</p>
              </div>
              <GSwitch v-model="options.no_bg" />
            </div>
          </div>

          <div class="grid gap-6">
            <GInput label="TEXTO DE EJEMPLO" v-model="previewText"
              placeholder="Escribe un texto para la vista previa..."
              tooltip="Escribe algo para ver cómo se verá en el visor" />

            <div class="space-y-1.5">
              <label class="text-xs font-bold text-primary/60 tracking-widest uppercase ml-1">URL GENERADA</label>
              <div class="flex gap-2">
                <GInput :modelValue="viewerUrl" readonly class="flex-1 font-mono text-[10px]" />
                <GButton @click="copyUrlToClipboard" variant="glass" size="sm" tooltip="Copiar al portapapeles">
                  <Icon name="tabler:copy" class="size-4" />
                </GButton>
              </div>
            </div>
          </div>
        </div>
      </GCard>

      <!-- Vista previa -->
      <section class="bg-blue-800 rounded-lg border shadow-sm overflow-hidden flex flex-col">
        <div class="bg-blue-900 text-white p-3 text-sm font-medium flex items-center border-b border-blue-700">
          <Icon name="tabler:eye" class="size-4 mr-2" />
          Vista previa
        </div>

        <div class="flex-1 relative" style="min-height: 320px;">
          <!-- Simulación de la vista del visor -->
          <div class="absolute inset-0 flex items-center justify-center p-4 overflow-hidden bg-white">
            <div class="flex justify-center items-center transition-all duration-300" :class="{
              'bg-blue-900/80 py-3 px-6 rounded-2xl shadow-lg shadow-black/20': options.bg && !options.slide,
              'bg-blue-900/80 py-3 px-6 w-full h-full flex items-center justify-center': options.slide && !options.no_bg,
              'py-3 px-6 w-full h-full flex items-center justify-center': options.slide && options.no_bg,
              'max-w-[98%]': !options.slide,
              'h-fit': options.bg && !options.slide
            }">
              <p class="text-center text-3xl sm:text-4xl drop-shadow-xl font-medium" :class="{
                'text-white': !options.no_bg || !options.slide,
                'text-black': options.no_bg && options.slide
              }">
                {{ previewText || 'Texto de ejemplo' }}
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>