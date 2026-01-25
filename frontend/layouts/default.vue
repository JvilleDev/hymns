<script setup lang="ts">
import { Toaster } from 'vue-sonner'

const items = [
  { title: "Inicio", value: "/", icon: "tabler:home" },
  { title: "Lista", value: "/lista", icon: "tabler:list" },
  { title: "Visor", value: "/visor", icon: "tabler:eye" },
  { title: "Anuncios", value: "/anuncios", icon: "tabler:speakerphone" },
];
const route = useRoute();

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
      <div class="flex items-center gap-3">
        <div class="size-9 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20 transition-transform hover:scale-105 active:scale-95">
          <Icon name="tabler:book" class="size-5 text-primary-foreground" />
        </div>
        <span class="font-bold text-lg tracking-tight">Himnario</span>
      </div>
      
      <nav class="hidden md:flex items-center bg-muted/50 p-1 rounded-xl border border-border/50">
        <NuxtLink v-for="item in items" :key="item.value" :to="item.value"
          class="px-5 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2"
          :class="[route.path === item.value ? 'bg-background text-primary shadow-sm border border-border/50' : 'text-muted-foreground hover:text-foreground hover:bg-muted']">
          <Icon :name="item.icon" class="size-4" />
          <span>{{ item.title }}</span>
        </NuxtLink>
      </nav>

      <div class="md:hidden">
        <!-- Mobile Label Placeholder or Avatar -->
        <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{{ items.find(i => i.value === route.path)?.title || 'Himnario' }}</span>
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