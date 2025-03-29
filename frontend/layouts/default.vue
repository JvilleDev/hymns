<script setup lang="ts">
import { Toaster } from '@/components/ui/sonner'
const items = [
  {title: "Inicio", value: "/", icon: "tabler:home"},
  {title: "Lista", value: "/lista", icon: "tabler:list"},
  {title: "Visor", value: "/visor", icon: "tabler:eye"},
  {title: "Ayuda", value: "/ayuda", icon: "tabler:help-circle"},
];
const route = useRoute();

onMounted(() => {
  const currentTitle = computed(() => items.find((item) => item.value === useRoute().path)?.title ?? "Inicio");
  useHead({
    htmlAttrs: {lang: "es"},
    titleTemplate: currentTitle,
  });
});
</script>
<template>
  <div class="flex flex-col min-h-screen">
    <!-- Navbar para desktop -->
    <header class="bg-background/95 backdrop-blur-md border-b shadow-sm z-50 sticky top-0 mb-3 hidden md:block">
      <div class="px-5 py-2 flex items-center justify-between max-w-7xl mx-auto">
        <NuxtLink to="/" :external="false"
                  class="flex items-center gap-2 select-none cursor-pointer hover:bg-blue-50/50 transition-all ease-in-out p-2 rounded-md">
          <img src="/favicon.ico" alt="Logo" class="size-5 rounded-full"/>
          <h1 class="text-base font-bold text-blue-700">Himnario</h1>
        </NuxtLink>
        <nav class="flex gap-2">
          <NuxtLink
              v-for="item in items"
              :key="item.value"
              :to="item.value"
              class="relative flex items-center px-4 py-1.5 rounded-md transition-all duration-200 overflow-hidden"
              :class="{
                'text-blue-600 font-medium bg-blue-100/40 shadow-sm': route.path === item.value,
                'text-gray-500 hover:text-blue-500 hover:bg-blue-50/50 active:scale-95': route.path !== item.value
              }"
              @mousedown="$event.currentTarget.classList.add('animate-ripple')"
              @animationend="$event.currentTarget.classList.remove('animate-ripple')"
          >
            <!-- Icono con efecto -->
            <Icon 
              :name="item.icon" 
              class="size-4.5 mr-2 transition-all duration-200"
              :class="{ 
                'text-blue-600': route.path === item.value
              }" 
            />            
            
            <!-- Texto con efecto de resaltado -->
            <span class="font-medium transition-all duration-200"
                  :class="{
                    'text-blue-700': route.path === item.value
                  }">
              {{ item.title }}
            </span>
          </NuxtLink>
        </nav>
      </div>
      <NuxtLoadingIndicator :height="2" :duration="300" :color="'#3b82f6'"/>
    </header>
    
    <!-- Contenido principal -->
    <main class="flex-1 w-full">
      <slot/>
    </main>
    
    <!-- Bottombar para mobile -->
    <nav class="md:hidden fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-md border-t shadow-lg z-50">
      <div class="flex justify-around items-center py-1 px-1">
        <NuxtLink
          v-for="item in items"
          :key="item.value"
          :to="item.value"
          class="relative flex flex-col items-center py-1.5 px-3 rounded-md transition-all duration-200 overflow-hidden"
          :class="{
            'text-blue-600 font-medium bg-blue-100/30': route.path === item.value,
            'text-gray-500 hover:text-blue-500 hover:bg-blue-50/50 active:scale-95': route.path !== item.value
          }"
          @mousedown="$event.currentTarget.classList.add('animate-ripple')"
          @animationend="$event.currentTarget.classList.remove('animate-ripple')"
          @touchstart="$event.currentTarget.classList.add('touch-effect')"
          @touchend="$event.currentTarget.classList.remove('touch-effect')"
        >
          <!-- Icono con efecto en active -->
          <Icon 
            :name="item.icon" 
            class="size-5 mb-0.5 transition-all duration-200"
            :class="{ 
              'text-blue-600': route.path === item.value
            }" 
          />            
          
          <!-- Texto con efecto de resaltado -->
          <span class="text-[10px] font-medium transition-all duration-200"
                :class="{
                  'text-blue-700': route.path === item.value
                }">
            {{ item.title }}
          </span>
        </NuxtLink>
      </div>
    </nav>
    
    <!-- Agregar espacio abajo en mobile para el bottombar -->
    <div class="h-14 md:hidden"></div>
    
    <Toaster position="bottom-right"/>
  </div>
</template>
<style>
/* Efectos para el bottombar */
.animate-ripple {
  animation: ripple 0.8s cubic-bezier(0.22, 1, 0.36, 1);
  position: relative;
  overflow: hidden;
}

.touch-effect {
  transform: scale(0.97);
}

.shadow-glow {
  box-shadow: 0 0 8px 2px rgba(59, 130, 246, 0.3);
}

.animate-pulse-slow {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.animate-ping-slow {
  animation: ping 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes ripple {
  0% {
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.3) inset;
  }
  100% {
    box-shadow: 0 0 0 100px rgba(59, 130, 246, 0) inset;
  }
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.8;
  }
}

@keyframes ping {
  0% {
    transform: scale(0.8);
    opacity: 0.6;
  }
  50% {
    transform: scale(1.2);
    opacity: 0.4;
  }
  100% {
    transform: scale(0.8);
    opacity: 0.6;
  }
}
</style>