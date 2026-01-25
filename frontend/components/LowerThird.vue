<script setup lang="ts">
const props = defineProps<{
  text: string
}>()
</script>

<template>
  <div class="fixed bottom-0 left-0 right-0 z-50 bg-white text-black overflow-hidden py-6 border-t-[6px] border-black font-bold tracking-widest shadow-2xl">
    <div class="marquee-container w-full whitespace-nowrap text-center">
      <div class="marquee-content inline-block text-5xl font-black tracking-wide uppercase">
        <span class="mx-48" v-for="i in 100" :key="i">{{ text }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.marquee-container {
  overflow: hidden;
}

.marquee-content {
  animation: scroll 1200s linear infinite;
}

@keyframes scroll {
  0% {
    transform: translateX(100vw);
  }
  100% {
    transform: translateX(-100%);
  }
}
</style>
