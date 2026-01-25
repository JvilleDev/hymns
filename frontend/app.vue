<script setup lang="ts">
useHead({
  title: 'Himnario',
  link: [
    {
      rel: 'icon',
      type: 'image/x-icon',
      href: '/favicon.ico'
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
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
<style>
/* Base Smoothness */
html,
body,
#__nuxt {
  margin: 0;
  padding: 0;
  width: 100%;
  min-height: 100svh;
  font-family: 'Outfit', sans-serif;
}

/* Custom Selection */
::selection {
  background: var(--primary);
  color: white;
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