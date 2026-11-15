<script setup lang="ts">
useHead({
  title: 'Himnario',
  link: [
    {
      rel: 'icon',
      type: 'image/svg+xml',
      href: '/icon.svg?v=2'
    },
    {
      rel: 'icon',
      type: 'image/x-icon',
      href: '/favicon.ico?v=2'
    }
  ],
  htmlAttrs: {
    lang: 'es'
  }
})
</script>
<template>
  <NuxtRouteAnnouncer />
  <TooltipProvider />
  <CustomCursor />
  <GDialogHost />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
<style>
/* Transición entre layouts (p. ej. login ⇄ app) */
.layout-enter-active,
.layout-leave-active {
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), filter 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.layout-enter-from,
.layout-leave-to {
  opacity: 0;
  filter: blur(6px);
}

html,
body,
#__nuxt {
  margin: 0;
  padding: 0;
  width: 100%;
  min-height: 100svh;
}

* {
  font-family: 'Outfit', sans-serif;
}

/* Custom Selection */
::selection {
  background: hsl(var(--primary) / 0.25);
  color: inherit;
}

/* Scrollbar Cleanup (Transparent) */
/* Scrollbar Styling */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent; 
}

::-webkit-scrollbar-thumb {
  background: var(--muted-foreground);
  opacity: 0.5;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--foreground);
}
</style>