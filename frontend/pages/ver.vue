<script setup lang="ts">
const {
  activeLine,
  viewerActive,
  announcement,
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
  <main class="relative h-svh w-svw overflow-hidden flex flex-col transition-all duration-500 ease-in-out">
    
    <!-- Lyric Content Layer -->
    <div 
      class="flex-1 w-full flex items-center transition-all duration-500 ease-in-out"
      :class="[
        queries.bg && !queries.slide ? 'justify-end pb-16 px-10' : 'justify-center',
        isActive ? 'opacity-100' : 'opacity-0 scale-95 translate-y-8'
      ]"
    >
      <div 
        class="w-full flex justify-center items-center overflow-hidden relative"
        :class="[
          queries.slide ? 'h-full bg-blue-900/90' : '',
          queries.bg && !queries.slide ? 'bg-blue-900/80 py-8 px-12 rounded-[2.5rem] shadow-2xl backdrop-blur-md max-w-[95%] h-fit' : '',
          queries.no_bg && queries.slide ? '!bg-transparent' : ''
        ]"
      >
        <Transition name="lyric-fade" mode="out-in">
          <p 
            :key="line"
            class="text-center font-outfit drop-shadow-[0_10px_10px_rgba(0,0,0,0.3)] leading-[1.1] tracking-tight w-full"
            :class="[
              queries.slide ? 'text-[clamp(4vh,12vh,20vh)] font-bold px-10' : 'text-[clamp(1.5rem,6vw,8rem)] font-medium',
              (queries.no_bg && queries.slide) ? 'text-black drop-shadow-none' : 'text-white'
            ]"
          >
            {{ line.trim() || '· · ·' }}
          </p>
        </Transition>
      </div>
    </div>

    <!-- Lower Third Announcement (Independent Layer) -->
    <Transition name="slide-up">
      <LowerThird 
        v-if="announcement.active && !queries.slide" 
        :text="announcement.text" 
      />
    </Transition>
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

/* Transición de las letras: Movimiento interno sin solapamiento */
.lyric-fade-enter-active, 
.lyric-fade-leave-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.lyric-fade-enter-from {
  opacity: 0;
  transform: translateY(20px) scale(0.98);
}

.lyric-fade-leave-to {
  opacity: 0;
  transform: translateY(-20px) scale(0.98);
}

/* Lower Third Transition */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>