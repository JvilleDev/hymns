<script setup lang="ts">
const {
  activeLine,
  viewerActive,
  announcement,
  transcription,
  connect,
  disconnect,
  activeSong,
} = useRealtime();

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
      class="flex-1 w-full flex items-end justify-center transition-all duration-500 ease-in-out"
      :class="[
        (isActive && !transcription.active) ? 'opacity-100' : 'opacity-0 scale-95 translate-y-8'
      ]"
    >
      <div 
        class="w-full flex justify-center items-center overflow-hidden relative"
        :class="[
          queries.slide ? 'h-full bg-blue-900/90' : '',
          queries.bg && !queries.slide ? 'bg-blue-900/80 py-4 w-full h-fit shadow-2xl backdrop-blur-md' : '',
          queries.no_bg && queries.slide ? '!bg-transparent' : ''
        ]"
      >
        <Transition name="lyric-fade" mode="out-in">
          <p 
            :key="line"
            class="text-center font-outfit drop-shadow-[0_10px_10px_rgba(0,0,0,0.3)] leading-none tracking-tight w-full"
            :class="[
              queries.slide ? 'text-[clamp(4vh,12vh,20vh)] font-bold px-10' : 'text-[clamp(1.5rem,5vw,6rem)] font-medium',
              (queries.no_bg && queries.slide) ? 'text-black drop-shadow-none' : 'text-white'
            ]"
          >
            {{ line.trim() || '· · ·' }}
          </p>
        </Transition>
      </div>
    </div>

    <!-- Lower Third Announcement (Independent Layer) -->
    <Transition :name="announcement.position === 'top' ? 'slide-down' : 'slide-up'">
      <LowerThird 
        v-if="announcement.active && !queries.slide && !transcription.active" 
        :key="announcement.text"
        :text="announcement.text" 
        :position="announcement.position"
      />
    </Transition>

    <!-- Transcription Layer -->
    <Transition name="slide-up">
      <LowerTranscription 
        v-if="transcription.active && !queries.slide"
        :final="transcription.final"
        :interim="transcription.interim"
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

/* Lower Third Transition (Bottom) */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

/* Lower Third Transition (Top) */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-down-enter-from,
.slide-down-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
</style>