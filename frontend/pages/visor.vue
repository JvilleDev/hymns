<script setup lang="ts">
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { computed, ref, watch, onMounted } from 'vue'
import { toast } from 'vue-sonner'
// Opciones disponibles para el visor
const options = ref({
  bg: true,      // Añade un fondo azul detrás del texto
  slide: false,   // Formatea el texto como una diapositiva a pantalla completa
  no_bg: false,   // Si se usa con slide, quita el fondo y hace que el texto sea negro
})

// URL base para el visor (usado en la versión desplegada)
const runtimeConfig = useRuntimeConfig()
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
  <div class="w-full px-3 py-4 pb-0 md:mx-auto md:max-w-[80%]">
    <!-- Cabecera -->
    <header class="mb-4 text-center">
      <h1 class="text-2xl font-bold mb-1">Constructor de Visor</h1>
      <p class="text-muted-foreground text-sm">Configura las opciones para el visor y obtén una URL personalizada</p>
    </header>
    
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
      <!-- Panel de configuración -->
      <section class="bg-background rounded-lg border shadow-sm overflow-hidden">
        <div class="bg-muted/40 p-3 border-b flex items-center">
          <Icon name="tabler:settings" class="size-5 mr-2 text-primary/70" />
          <h2 class="text-base font-semibold">Opciones de visualización</h2>
        </div>
        
        <div class="p-4 space-y-4">
          <!-- Opciones agrupadas -->
          <div class="space-y-3 border-b pb-4">
            <h3 class="text-xs font-medium text-muted-foreground mb-2">APARIENCIA DEL TEXTO</h3>
            
            <!-- Opción: Fondo -->
            <div class="flex items-center justify-between rounded-md p-2 hover:bg-muted/50 transition-colors">
              <div>
                <Label class="text-sm font-medium">Fondo azul</Label>
                <p class="text-xs text-muted-foreground">Añade un fondo azul semitransparente detrás del texto</p>
              </div>
              <div class="flex items-center space-x-2">
                <Switch 
                  v-model="options.bg"
                  id="bg-option" 
                />
              </div>
            </div>
            
            <!-- Opción: Modo Slide -->
            <div class="flex items-center justify-between rounded-md p-2 hover:bg-muted/50 transition-colors">
              <div>
                <Label class="text-sm font-medium">Modo Diapositiva</Label>
                <p class="text-xs text-muted-foreground">Formatea el texto como una diapositiva a pantalla completa</p>
              </div>
              <div class="flex items-center space-x-2">
                <Switch 
                  v-model="options.slide"
                  id="slide-option" 
                />
              </div>
            </div>
            
            <!-- Opción: Sin fondo (solo disponible si slide está activado) -->
            <div class="flex items-center justify-between rounded-md p-2 hover:bg-muted/50 transition-colors" :class="{ 'opacity-50': !options.slide }">
              <div>
                <Label class="text-sm font-medium">Sin fondo (texto negro)</Label>
                <p class="text-xs text-muted-foreground">Quita el fondo azul y hace que el texto sea negro</p>
              </div>
              <div class="flex items-center space-x-2">
                <Switch 
                  v-model="options.no_bg"
                  id="no-bg-option" 
                  :disabled="!options.slide"
                />
              </div>
            </div>
          </div>
          
          <!-- Texto de ejemplo para la vista previa -->
          <div class="pt-1 pb-3 border-b">
            <Label for="preview-text" class="text-xs font-medium text-muted-foreground block mb-2">TEXTO DE EJEMPLO</Label>
            <div class="flex">
              <Input 
                id="preview-text"
                v-model="previewText" 
                class="w-full text-sm"
                placeholder="Escribe un texto para la vista previa..."
              />
            </div>
          </div>
          
          <!-- URL resultante -->
          <div class="pt-1">
            <Label class="text-xs font-medium text-muted-foreground block mb-2">URL GENERADA</Label>
            <div class="flex mt-1">
              <Input 
                :value="viewerUrl" 
                readonly 
                class="flex-1 bg-muted/30 border-dashed text-sm"
              />
              <Button @click="copyUrlToClipboard" class="ml-2" variant="outline" size="sm">
                <Icon name="tabler:copy" class="size-4 mr-1" />
                Copiar
              </Button>
            </div>
          </div>
        </div>
      </section>
      
      <!-- Vista previa -->
      <section class="bg-blue-800 rounded-lg border shadow-sm overflow-hidden flex flex-col">
        <div class="bg-blue-900 text-white p-3 text-sm font-medium flex items-center border-b border-blue-700">
          <Icon name="tabler:eye" class="size-4 mr-2" />
          Vista previa
        </div>
        
        <div class="flex-1 relative" style="min-height: 320px;">
          <!-- Simulación de la vista del visor -->
          <div class="absolute inset-0 flex items-center justify-center p-4 overflow-hidden bg-white">
            <div 
              class="flex justify-center items-center transition-all duration-300"
              :class="{
                'bg-blue-900/80 py-3 px-6 rounded-2xl shadow-lg shadow-black/20': options.bg && !options.slide,
                'bg-blue-900/80 py-3 px-6 w-full h-full flex items-center justify-center': options.slide && !options.no_bg,
                'py-3 px-6 w-full h-full flex items-center justify-center': options.slide && options.no_bg,
                'max-w-[98%]': !options.slide,
                'h-fit': options.bg && !options.slide
              }"
            >
              <p 
                class="text-center text-3xl sm:text-4xl drop-shadow-xl font-medium"
                :class="{
                  'text-white': !options.no_bg || !options.slide,
                  'text-black': options.no_bg && options.slide
                }"
              >
                {{ previewText || 'Texto de ejemplo' }}
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>    
  </div>
</template>