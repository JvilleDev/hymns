<script setup lang="ts">
const {
  activeLine,
  viewerActive,
  connect,
  disconnect,
} = useSocket();

const line = ref("");
const isActive = ref(false);

const route = useRoute();
const queries = computed(() => ({
  bg: route.query.bg !== undefined,
  slide: route.query.slide !== undefined,
  no_bg: route.query.no_bg !== undefined,
}));

definePageMeta({
  layout: false
});

// Sync state
watch(activeLine, (newValue) => {
  line.value = newValue || "";
}, { immediate: true });

watch(viewerActive, (newValue) => {
  isActive.value = newValue;
}, { immediate: true });

onMounted(() => {
  connect();
});

onUnmounted(() => {
  disconnect();
});
</script>

<template>
  <main 
    class="relative h-svh w-svw overflow-hidden flex flex-col items-center justify-center transition-all duration-500 ease-in-out"
    :class="[
      queries.bg ? 'justify-end pb-12 px-10' : '',
      isActive ? 'opacity-100' : 'opacity-0 scale-95 translate-y-8'
    ]"
  >
    <div 
      class="w-full flex justify-center items-center transition-all duration-500"
      :class="[
        queries.slide ? 'h-full bg-blue-900/90' : '',
        queries.bg && !queries.slide ? 'bg-blue-900/80 py-8 px-12 rounded-[2.5rem] shadow-2xl backdrop-blur-md h-fit max-w-[95%]' : '',
        queries.no_bg && queries.slide ? '!bg-transparent' : ''
      ]"
    >
      <Transition name="lyric-fade" mode="out-in">
        <p 
          :key="line"
          class="text-center font-outfit drop-shadow-[0_10px_10px_rgba(0,0,0,0.3)] leading-[1.1] tracking-tight"
          :class="[
            queries.slide ? 'text-[clamp(4vh,12vh,20vh)] font-bold px-10' : 'text-[clamp(1.5rem,6vw,8rem)] font-medium',
            (queries.no_bg && queries.slide) ? 'text-black drop-shadow-none' : 'text-white'
          ]"
        >
          {{ line.trim() || '· · ·' }}
        </p>
      </Transition>
    </div>
  </main>
</template>

<style>
/* Global resets for OBS/Background transparency */
html, body {
  background: transparent !important;
  margin: 0;
  padding: 0;
  overflow: hidden;
}

.font-outfit {
  font-family: 'Outfit', sans-serif;
}

/* Transición de las letras: Suave con un ligero desenfoque */
.lyric-fade-enter-active, 
.lyric-fade-leave-active {
  transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1);
}

.lyric-fade-enter-from {
  opacity: 0;
  filter: blur(10px);
  transform: translateY(15px);
}

.lyric-fade-leave-to {
  opacity: 0;
  filter: blur(10px);
  transform: translateY(-15px);
}
</style>