<script setup lang="ts">
useHead({ title: 'Ver' })

const {
  activeLine,
  viewerActive,
  announcement,
  transcription,
  session,
  connect,
  disconnect,
  activeSong,
} = useRealtime();

const line = ref("");
const isActive = ref(false);

// Exclusión mutua: letra y anuncio nunca se muestran a la vez.
// Gana lo último que el operador activó.
const surface = ref<'lyrics' | 'announcement' | null>(null);

const route = useRoute();
const queries = computed(() => ({
  bg: route.query.bg !== undefined,
  slide: route.query.slide !== undefined,
  no_bg: route.query.no_bg !== undefined,
  live: route.query.live !== undefined,
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

// Estado inicial: si ambos vienen activos, el anuncio gana
surface.value = announcement.value.active ? 'announcement' : (isActive.value ? 'lyrics' : null);

// Un solo watcher: gana lo que se activó; si ambos cambian a la vez, el anuncio
watch([() => announcement.value.active, isActive], ([annOn, lyrOn], [annWas, lyrWas]) => {
  const annTurnedOn = annOn && !annWas;
  const lyrTurnedOn = lyrOn && !lyrWas;
  if (annTurnedOn) surface.value = 'announcement';
  else if (lyrTurnedOn) surface.value = 'lyrics';
  else if (!annOn && surface.value === 'announcement') surface.value = lyrOn ? 'lyrics' : null;
  else if (!lyrOn && surface.value === 'lyrics') surface.value = annOn ? 'announcement' : null;
});

// Mover la letra con un anuncio en pantalla devuelve el protagonismo a la letra
watch(activeLine, (_, previous) => {
  // ignora la carga inicial (de vacío a una línea)
  if (!previous) return;
  if (isActive.value && announcement.value.active) surface.value = 'lyrics';
});

// En modo ?slide el anuncio no se muestra, así que no debe tapar la letra
const showLyrics = computed(() =>
  (surface.value === 'lyrics' || (surface.value === 'announcement' && queries.value.slide)) && !transcription.value.active
);
const showAnnouncement = computed(() =>
  announcement.value.active && surface.value === 'announcement' && !queries.value.slide && !transcription.value.active
);

onMounted(() => {
  connect();
});

onUnmounted(() => {
  disconnect();
});
</script>

<template>
  <main class="relative h-svh w-svw overflow-hidden flex flex-col transition-all duration-500 ease-in-out will-change-[transform,opacity]">
    <!-- Sin sesión viva: pantalla vacía (transparente en OBS), sin restos -->
    <template v-if="session.live">

    <!-- Lyric Content Layer -->
    <div class="flex-1 w-full flex items-end justify-center transition-all duration-500 ease-in-out" :class="[
      showLyrics ? 'opacity-100' : 'opacity-0 scale-95 translate-y-8'
    ]">
      <div class="w-full flex justify-center items-center overflow-hidden relative" :class="[
        queries.slide ? 'h-full bg-blue-900/90' : '',
        queries.bg && !queries.slide ? 'bg-blue-900/80 py-4 w-full h-fit shadow-2xl backdrop-blur-md' : '',
        queries.no_bg && queries.slide ? '!bg-transparent' : ''
      ]">
        <Transition name="lyric-fade" mode="out-in">
          <p :key="line"
            class="text-center font-outfit drop-shadow-[0_10px_10px_rgba(0,0,0,0.3)] leading-none tracking-tight w-full"
            :class="[
              queries.slide ? 'text-[clamp(4vh,12vh,20vh)] font-bold px-10' : 'text-[clamp(1.5rem,5vw,6rem)] font-medium',
              (queries.no_bg && queries.slide) ? 'text-black drop-shadow-none' : 'text-white'
            ]">
            {{ line.trim() || '· · ·' }}
          </p>
        </Transition>
      </div>
    </div>

    <!-- Lower Third Announcement (Independent Layer) -->
    <Transition name="announce-up">
      <LowerThird v-if="showAnnouncement"
        :text="announcement.text" />
    </Transition>

    <!-- Transcription Layer -->
    <Transition name="slide-up">
      <LowerTranscription v-if="(transcription.active || queries.live) && !queries.slide" :final="transcription.final"
        :interim="transcription.interim" />
    </Transition>
    </template>
  </main>
</template>

<style>
/* Global resets for OBS/Background transparency */
html,
body {
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
  will-change: transform, opacity;
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
  will-change: transform, opacity;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

/* Anuncio: solo transform */
.announce-up-enter-active,
.announce-up-leave-active {
  transition: transform 0.5s cubic-bezier(0.32, 0.72, 0, 1);
  will-change: transform;
}

.announce-up-enter-from,
.announce-up-leave-to {
  transform: translateY(100%);
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