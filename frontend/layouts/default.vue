<script setup lang="ts">
import { Toaster } from 'vue-sonner'

const { isMaster } = useAuth();
const { config, changeConfig } = useRealtime();

const items = computed(() => [
  { title: "Inicio", value: "/", icon: "tabler:home", description: "En pantalla viva" },
  { title: "Lista", value: "/lista", icon: "tabler:list", description: "Base de datos global" },
  { title: "Visor", value: "/visor", icon: "tabler:eye", description: "Control de proyección" },
  { title: "Anuncios", value: "/anuncios", icon: "tabler:speakerphone", description: "Gestión de escritos" },
  ...(isMaster.value ? [{ title: "Cuentas", value: "/cuentas", icon: "tabler:users-group", description: "Accesos y contraseñas" }] : []),
]);

const route = useRoute();
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
  <div class="h-svh w-screen flex overflow-hidden bg-app text-foreground selection:bg-primary/10 selection:text-primary">
    <!-- Sidebar (Desktop & Tablet) -->
    <aside class="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-sidebar z-40 p-3">
      <div class="flex items-center gap-3 px-2 py-3 mb-2">
        <div class="size-9 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20 transition-transform hover:scale-105 active:scale-95">
          <HymnalIcon class="size-6 text-primary-foreground" />
        </div>
        <span class="font-bold text-lg tracking-tight">Himnario</span>
      </div>

      <nav class="flex flex-col gap-1">
        <NuxtLink v-for="item in items" :key="item.value" :to="item.value"
          class="px-3 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-3 border"
          :class="[route.path === item.value ? 'bg-primary/10 text-primary border-primary/20' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted']">
          <Icon :name="item.icon" class="size-5 shrink-0" />
          <span class="flex flex-col leading-tight min-w-0">
            <span>{{ item.title }}</span>
            <span class="text-[10px] font-medium opacity-70 truncate">{{ item.description }}</span>
          </span>
        </NuxtLink>
      </nav>

      <div class="mt-auto mb-3 rounded-xl border border-border bg-background/70 p-3">
        <div class="flex items-center justify-between mb-2">
          <span class="flex items-center gap-2 text-xs font-bold text-muted-foreground">
            <Icon name="tabler:typography" class="size-4" />
            Tamaño de letra
          </span>
          <span class="text-xs font-bold tabular-nums text-primary">{{ config.fontSize }}%</span>
        </div>
        <input type="range" min="50" max="200" step="5" :value="config.fontSize"
          class="w-full accent-[hsl(var(--primary))]"
          aria-label="Tamaño de letra"
          @input="changeConfig({ fontSize: Number(($event.target as HTMLInputElement).value) })" />
        <button v-if="config.fontSize !== 100" type="button"
          class="mt-1 text-[10px] font-semibold text-muted-foreground hover:text-primary transition-colors"
          @click="changeConfig({ fontSize: 100 })">Restablecer</button>
      </div>

      <div class="pt-3 border-t border-border/50">
        <SettingsMenu placement="top-start" v-slot="{ open, toggle }">
          <button
            class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-muted-foreground hover:text-primary hover:bg-muted transition-all"
            :class="{ 'bg-muted text-primary': open }"
            @click.stop="toggle"
          >
            <Icon name="tabler:settings" class="size-5 transition-transform duration-500" :class="{ 'rotate-90': open }" />
            <span>Ajustes</span>
          </button>
        </SettingsMenu>
      </div>
    </aside>

    <div class="flex-1 min-w-0 flex flex-col">
      <!-- Header (Mobile Only) -->
      <header class="md:hidden h-14 shrink-0 border-b border-border bg-background/80 backdrop-blur-md z-40 px-4 flex items-center justify-between">
        <div class="min-w-0">
          <h1 class="font-bold text-lg tracking-tight leading-none truncate">{{ currentPage.title }}</h1>
          <p v-if="currentPage.description" class="hidden sm:block text-[10px] text-muted-foreground font-medium mt-1">{{ currentPage.description }}</p>
        </div>
        <SettingsMenu />
      </header>

      <!-- Page Content -->
      <main class="flex-1 min-h-0 w-full relative overflow-hidden flex flex-col">
        <NuxtLoadingIndicator :height="2" :duration="300" color="hsl(var(--primary))" />
        <slot />
      </main>

      <!-- Bottom Nav (Mobile Only) -->
      <nav class="md:hidden shrink-0 border-t border-border bg-background/90 backdrop-blur-lg z-40 grid pb-[env(safe-area-inset-bottom)]" :style="{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }">
        <NuxtLink v-for="item in items" :key="item.value" :to="item.value"
          class="relative flex flex-col items-center justify-center gap-0.5 h-14 transition-colors"
          :class="[route.path === item.value ? 'text-primary' : 'text-muted-foreground']">
          <span v-if="route.path === item.value" class="absolute top-0 h-0.5 w-8 rounded-full bg-primary" />
          <Icon :name="item.icon" class="size-5" />
          <span class="text-[10px] font-bold uppercase tracking-tight">{{ item.title }}</span>
        </NuxtLink>
      </nav>
    </div>

    <Toaster position="bottom-left" richColors />
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