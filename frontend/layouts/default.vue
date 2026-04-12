<script setup lang="ts">
import { Toaster } from 'vue-sonner'
import { cn } from '~/utils'

const { isAdmin } = useAuth();

const items = computed(() => [
  { title: "Inicio", value: "/", icon: "tabler:home", description: "En pantalla viva" },
  { title: "Lista", value: "/lista", icon: "tabler:list", description: "Base de datos global" },
  { title: "Visor", value: "/visor", icon: "tabler:eye", description: "Control de proyección" },
  { title: "Anuncios", value: "/anuncios", icon: "tabler:speakerphone", description: "Gestión de escritos" },
]);

const { logout } = useAuth();

const { isManualConnectionTrigger } = useApi();
const route = useRoute();
const isSettingsOpen = ref(false);
const settingsRef = ref(null);

onClickOutside(settingsRef, () => {
  isSettingsOpen.value = false;
});

const currentPage = computed(() => {
  return items.value.find(i => i.value === route.path) || { title: 'Himnario', description: '' }
})

onMounted(() => {
  useHead({
    htmlAttrs: { lang: "es" },
    titleTemplate: (title) => title ? `${title} | Himnario` : "Himnario",
  });
});
</script>

<template>
  <div class="h-svh w-screen flex flex-col overflow-hidden bg-background text-foreground selection:bg-primary/10 selection:text-primary">
    <!-- Navbar (Desktop & Tablet) -->
    <header class="h-16 shrink-0 border-b border-border bg-background/80 backdrop-blur-md z-40 px-4 md:px-6 flex items-center justify-between">
      <div class="flex items-center gap-4">
        <div class="size-9 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20 transition-transform hover:scale-105 active:scale-95">
          <Icon name="tabler:book" class="size-5 text-primary-foreground" />
        </div>
        
        <!-- Dynamic Page Title -->
        <div class="hidden sm:block">
          <h1 class="font-bold text-base tracking-tight leading-none">{{ currentPage.title }}</h1>
          <p v-if="currentPage.description" class="text-[10px] text-muted-foreground font-medium">{{ currentPage.description }}</p>
        </div>
      </div>
      
      <nav class="hidden md:flex items-center bg-muted/50 p-1 rounded-xl border border-border/50">
        <NuxtLink v-for="item in items" :key="item.value" :to="item.value"
          class="px-5 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2"
          :class="[route.path === item.value ? 'bg-background text-primary shadow-sm border border-border/50' : 'text-muted-foreground hover:text-foreground hover:bg-muted']">
          <Icon :name="item.icon" class="size-4" />
          <span>{{ item.title }}</span>
        </NuxtLink>
      </nav>

      <div class="flex items-center gap-2 relative" ref="settingsRef">
        <!-- Page Title (Mobile Only, next to gear) -->
        <span class="sm:hidden text-[10px] font-bold uppercase tracking-widest text-muted-foreground mr-1">{{ currentPage.title }}</span>

        <!-- Unified Settings Toggle -->
        <GButton 
          variant="ghost" 
          size="icon" 
          :class="cn(
            'rounded-xl text-muted-foreground hover:text-primary transition-all duration-300', 
            isSettingsOpen && 'bg-muted text-primary'
          )"
          @click.stop="isSettingsOpen = !isSettingsOpen"
        >
          <Icon 
            name="tabler:settings" 
            class="size-5 transition-transform duration-500" 
            :class="{ 'rotate-90': isSettingsOpen }" 
          />
        </GButton>

        <!-- Shared Settings Dropdown -->
        <Transition
          enter-active-class="transition duration-300 ease-out"
          enter-from-class="translate-y-2 opacity-0 scale-95"
          enter-to-class="translate-y-0 opacity-100 scale-100"
          leave-active-class="transition duration-200 ease-in"
          leave-from-class="translate-y-0 opacity-100 scale-100"
          leave-to-class="translate-y-2 opacity-0 scale-95"
        >
          <div v-if="isSettingsOpen" class="absolute right-0 top-full mt-3 w-64 origin-top-right rounded-2xl border border-border bg-background/95 backdrop-blur-xl shadow-2xl z-50 overflow-hidden ring-1 ring-black/5">
            <div class="p-2.5 space-y-1">
              <!-- User ID Settings -->
              <button 
                @click="isManualConnectionTrigger = true; isSettingsOpen = false"
                class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all text-left"
              >
                <div class="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <Icon name="tabler:user-cog" class="size-4" />
                </div>
                <div class="flex flex-col">
                  <span>Configuración Cuenta</span>
                  <span class="text-[10px] text-muted-foreground/60 font-medium">Sincronizar dispositivos</span>
                </div>
              </button>
              
              <div class="h-px bg-border/50 mx-2 my-1"></div>

              <!-- Admin Action -->
              <button 
                v-if="!isAdmin"
                @click="navigateTo('/login'); isSettingsOpen = false"
                class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-primary hover:bg-primary/5 transition-all text-left group"
              >
                <div class="size-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground group-hover:scale-110 transition-transform">
                  <Icon name="tabler:lock" class="size-4" />
                </div>
                <div class="flex flex-col">
                  <span class="uppercase tracking-widest text-[10px]">Acceso Admin</span>
                  <span class="text-[10px] text-muted-foreground/80 font-medium normal-case">Gestionar cantos</span>
                </div>
              </button>
              <button 
                v-else
                @click="logout(); isSettingsOpen = false"
                class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-red-500 hover:bg-red-500/10 transition-all text-left group"
              >
                 <div class="size-8 rounded-lg bg-red-500 flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                  <Icon name="tabler:logout" class="size-4" />
                </div>
                <div class="flex flex-col">
                  <span class="uppercase tracking-widest text-[10px]">Cerrar Sesión</span>
                  <span class="text-[10px] text-red-400/60 font-medium normal-case">Salir del panel</span>
                </div>
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </header>

    <!-- Page Content -->
    <main class="flex-1 min-h-0 w-full relative overflow-hidden flex flex-col">
      <NuxtLoadingIndicator :height="2" :duration="300" color="hsl(var(--primary))" />
      <slot />
    </main>

    <!-- Bottom Nav (Mobile Only) -->
    <nav class="md:hidden h-20 shrink-0 border-t border-border bg-background/80 backdrop-blur-lg z-40 px-6 pb-2 flex items-center justify-around">
      <NuxtLink v-for="item in items" :key="item.value" :to="item.value"
        class="flex flex-col items-center gap-1 transition-all duration-300 px-4 py-2 rounded-2xl"
        :class="[route.path === item.value ? 'text-primary bg-primary/10 scale-110 font-bold' : 'text-muted-foreground']">
        <Icon :name="item.icon" class="size-6" />
        <span class="text-[10px] font-bold uppercase tracking-tighter">{{ item.title }}</span>
      </NuxtLink>
    </nav>

    <Toaster position="top-center" richColors />
  </div>
</template>

<style>
.page-enter-active,
.page-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.page-enter-from,
.page-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>