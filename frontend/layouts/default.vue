<script setup lang="ts">
import { Toaster } from 'vue-sonner'

const colorMode = useColorMode()
const items = [
  { title: "Inicio", value: "/", icon: "tabler:home" },
  { title: "Lista", value: "/lista", icon: "tabler:list" },
  { title: "Visor", value: "/visor", icon: "tabler:eye" },
];
const route = useRoute();

const toggleColorMode = () => {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

onMounted(() => {
  const currentTitle = computed(() => items.find((item) => item.value === useRoute().path)?.title ?? "Inicio");
  useHead({
    htmlAttrs: { lang: "es" },
    titleTemplate: (title) => title ? `${title} | Himnario` : "Himnario",
  });
});
</script>

<template>
  <div class="flex flex-col min-h-screen relative overflow-x-hidden">
    <!-- Navbar para desktop -->
    <header class="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div class="w-full flex items-center justify-between px-4 lg:px-6 py-2">
        <NuxtLink to="/" class="flex items-center gap-2 select-none group">
          <div
            class="size-7 rounded-lg bg-primary flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
            <img src="/favicon.ico" alt="Logo" class="size-4 rounded-full brightness-0 invert" />
          </div>
          <h1
            class="text-base font-bold tracking-tight text-foreground">
            Himnario
          </h1>
        </NuxtLink>

        <nav class="flex items-center gap-1">
          <NuxtLink v-for="item in items" :key="item.value" :to="item.value" class="nav-link"
            :class="{ 'active': route.path === item.value }">
            <Icon :name="item.icon" class="size-4" />
            <span>{{ item.title }}</span>
          </NuxtLink>

          <div class="w-px h-5 bg-border mx-2"></div>

          <GButton variant="ghost" size="icon" @click="toggleColorMode"
            :tooltip="colorMode.value === 'dark' ? 'Modo Claro' : 'Modo Oscuro'" class="size-8">
            <ClientOnly>
              <Icon :name="colorMode.value === 'dark' ? 'tabler:sun' : 'tabler:moon'" class="size-4" />
            </ClientOnly>
          </GButton>
        </nav>
      </div>
    </header>

    <!-- Contenido principal -->
    <main class="flex-1 w-full pt-14">
      <NuxtLoadingIndicator :height="2" :duration="300"
        color="hsl(var(--primary))" />
      <slot />
    </main>

    <!-- Bottombar para mobile -->
    <nav class="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-lg border-t border-border">
      <div class="flex justify-around items-center py-3 px-3">
        <NuxtLink v-for="item in items" :key="item.value" :to="item.value" class="mobile-nav-link"
          :class="{ 'active': route.path === item.value }">
          <Icon :name="item.icon" class="size-6 mb-1" />
          <span>{{ item.title }}</span>
        </NuxtLink>

        <button @click="toggleColorMode" class="mobile-nav-link text-muted-foreground">
          <ClientOnly>
            <Icon :name="colorMode.value === 'dark' ? 'tabler:sun' : 'tabler:moon'" class="size-6 mb-1" />
          </ClientOnly>
          <span>Tema</span>
        </button>
      </div>
    </nav>

    <Toaster :theme="colorMode.value === 'dark' ? 'dark' : 'light'" position="bottom-right" :toastOptions="{
      class: 'bg-popover border border-border shadow-lg font-medium text-popover-foreground',
    }" />
  </div>
</template>

<style scoped>
.nav-link {
  @apply flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-accent;
}

.nav-link.active {
  @apply text-primary bg-primary/10 font-bold;
}

.mobile-nav-link {
  @apply flex flex-col items-center py-2 px-4 rounded-2xl transition-all duration-300 text-muted-foreground text-[10px] font-bold uppercase tracking-widest;
}

.mobile-nav-link.active {
  @apply text-primary bg-primary/10 scale-110;
}

.mobile-nav-link.active span {
  @apply opacity-100;
}
</style>

<style>
/* Global Glass Backdrop */
body {
  background-attachment: fixed;
}

.page-enter-active,
.page-leave-active {
  transition: all 0.3s ease;
}

.page-enter-from,
.page-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
<style>

@keyframes ripple {
  0% {
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.3) inset;
  }

  100% {
    box-shadow: 0 0 0 100px rgba(59, 130, 246, 0) inset;
  }
}

@keyframes pulse {

  0%,
  100% {
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