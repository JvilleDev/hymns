<script setup lang="ts">
import io from 'socket.io-client';

const { apiUrl } = useRuntimeConfig().app;
const socket = io(apiUrl.startsWith("https") ? "wss://" + apiUrl.split("//")[1] : 'ws://' + apiUrl.split("//")[1])
const line = ref("");
const changeLine = ref(true);

const isActive = ref(false);
const { bg, slide, no_bg } = useRoute().query;
const queries = {
  bg: bg !== undefined,
  slide: slide !== undefined,
  no_bg: no_bg !== undefined,
}
socket.on('line', (data) => {
  changeLine.value = true;
  line.value = data;
  setTimeout(() => {
    changeLine.value = false;
  }, 1);
});

socket.on('initial', (data) => {
  isActive.value = data.viewerActive;
  if(data.activeLine.length > 0) {
    changeLine.value = true;
    line.value = data.activeLine;
    setTimeout(() => {
      changeLine.value = false;
    }, 1);
  }
})

socket.on('viewerActive', (data) => {
  isActive.value = data;
})

definePageMeta({
  layout: false
});

onMounted(() => {
  socket.open();
  console.log(queries)
  console.log(bg, slide, no_bg)
});

onUnmounted(() => {
  socket.close();
});
</script>
<template>
  <main :class="[queries.bg ? 'bg' : '']">
    <div class="line-wrap" :class="[ queries.bg ? 'bg' : '', queries.slide ? 'slide' : '', isActive ? 'active' : 'inactive', queries.no_bg ? 'no-bg' : '']">
      <Transition name="fade" :duration="300">
      <p class="lyric" v-if="!changeLine">
          {{ line.length > 0 ? line : '· · ·' }}
        </p>
      </Transition>
    </div>
  </main>
</template>
<style>
.lyric {
  font-family: 'Outfit', sans-serif;
  @apply w-full text-center leading-none drop-shadow-xl shadow-black/20 text-5xl;
  background: transparent;
}

.line-wrap {
  @apply flex line-clamp-2 justify-center text-center items-center h-screen max-h-screen overflow-hidden w-full transition-[transform,opacity,filter] duration-300 ease-in-out;
  &.bg {
    @apply bg-blue-900/80 py-4 px-8 rounded-2xl text-white shadow-lg shadow-black/20 h-fit max-w-[98%];
  }
  &.slide {
    @apply bg-blue-900/80 py-4 px-8 rounded-none text-white shadow-xl;
    &.no-bg {
      @apply bg-transparent text-black shadow-md;
    }
  }

  &.active {
    @apply translate-y-0 opacity-100 scale-100
  }
  &.inactive {
    @apply translate-y-10 opacity-0 scale-50
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

main {
  @apply flex flex-col items-center justify-center w-screen h-screen;
  &.bg {
    @apply justify-end pb-4 px-4;
  }
}
</style>
