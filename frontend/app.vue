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
  <NuxtRouteAnnouncer/>
  <NuxtLayout>
    <NuxtPage/>
  </NuxtLayout>
</template>
<style>
::-webkit-scrollbar {
  width: 3px;
  height: 3px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 1px;
}

* {
  font-family: 'Outfit', sans-serif;
}

html, main, body, #__nuxt, #__layout {
  background: transparent;
  margin: 0;
  padding: 0;
  max-width: 100svw;
  overflow-x: hidden;
}

.page-enter-active,
.page-leave-active {
  transition: opacity .3s, transform 0.4s cubic-bezier(0.68,-0.55,0.27,1.55);
}

.page-enter-from,
.page-leave-to {
  opacity: 0;
  transform: translateX(-10rem);
}
</style>