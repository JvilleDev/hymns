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
  height: 100svh;
  overflow: hidden;
  font-family: 'Outfit', sans-serif;
}

/* Custom Selection */
::selection {
  background: var(--primary);
  color: white;
}

/* Scrollbar Cleanup (Transparent) */
::-webkit-scrollbar {
  width: 0px;
  background: transparent;
}
</style>