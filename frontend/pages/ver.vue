<script setup lang="ts">
const {
  activeLine,
  viewerActive,
  connect,
  disconnect,
  socket
} = useSocket();

const line = ref("");
const changeLine = ref(true);
const isActive = ref(false);

const { bg, slide, no_bg } = useRoute().query;
const queries = {
  bg: bg !== undefined,
  slide: slide !== undefined,
  no_bg: no_bg !== undefined,
}

definePageMeta({
  layout: false
});

// Enhanced notification system with progress bar
const notificationText = ref("");
const showNotification = ref(false);
const progressPercent = ref(100);
let hideTimer: any = null;
let progressInterval: any = null;

function calculateDuration(text: string): number {
  const baseTime = 3000;
  const extraTimePerChar = 150;
  const minTime = 2000;
  const maxTime = 10000;

  const calculatedTime = baseTime + (text.length * extraTimePerChar);
  return Math.max(minTime, Math.min(maxTime, calculatedTime));
}

function displayNotification(htmlContent: string) {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }

  if (showNotification.value) {
    showNotification.value = false;
    setTimeout(() => showNewNotification(htmlContent), 100);
  } else {
    showNewNotification(htmlContent);
  }
}

function showNewNotification(htmlContent: string) {
  notificationText.value = htmlContent;
  showNotification.value = true;
  progressPercent.value = 100;

  const duration = calculateDuration(htmlContent.replace(/<[^>]*>/g, ''));
  const updateInterval = 50;
  const steps = duration / updateInterval;
  let currentStep = 0;

  progressInterval = setInterval(() => {
    currentStep++;
    progressPercent.value = Math.max(0, 100 - (currentStep / steps) * 100);

    if (currentStep >= steps) {
      clearInterval(progressInterval);
      progressInterval = null;
      showNotification.value = false;
      hideTimer = null;
    }
  }, updateInterval);
}

// Watch for socket updates
watch(activeLine, (newValue) => {
  changeLine.value = true;
  line.value = newValue;
  setTimeout(() => {
    changeLine.value = false;
  }, 1);
}, { immediate: true });

watch(viewerActive, (newValue) => {
  isActive.value = newValue;
}, { immediate: true });

onMounted(() => {
  connect();

  // Listen for the special 'written' event
  watch(socket, (newSocket) => {
    if (newSocket) {
      newSocket.off('written'); // Avoid duplicates
      newSocket.on('written', (data: any) => {
        if (data.html && data.html.trim()) {
          displayNotification(data.html);
          if (isActive.value) {
            isActive.value = false;
            newSocket.emit("view", false);
          }
        }
      });
    }
  }, { immediate: true });
});

onUnmounted(() => {
  if (hideTimer) clearTimeout(hideTimer);
  if (progressInterval) clearInterval(progressInterval);
  disconnect();
})
</script>

<template>
  <main :class="[queries.bg ? 'bg' : '']" class="w-svw h-svh max-h-svh max-w-svw overflow-hidden">
    <div class="line-wrap" :class="[queries.bg ? 'bg' : '', queries.slide ? 'slide' : '',
    isActive ? 'active' : 'inactive',
    queries.no_bg ? 'no-bg' : '']">
      <Transition name="fade" :duration="300">
        <p class="lyric" v-if="!changeLine">
          {{ line.length > 0 ? line : '· · ·' }}
        </p>
      </Transition>
    </div>

    <!-- Enhanced notification with progress bar -->
    <div class="notification-container">
      <Transition name="slide-up" mode="out-in">
        <div v-if="showNotification" class="notification">
          <div class="notification-content" v-html="notificationText"></div>
          <div class="notification-progress-bar">
            <div class="notification-progress-line" :style="{ width: progressPercent + '%' }"></div>
          </div>
        </div>
      </Transition>
    </div>
  </main>
</template>

<style>
html,
body {
  background: transparent !important;
}

.lyric {
  font-family: 'Outfit', sans-serif;
  font-size: inherit;
  @apply w-full text-center leading-none drop-shadow-xl shadow-black/20;
  background: transparent;
}

.line-wrap {
  @apply flex line-clamp-2 justify-center text-center items-center h-svh max-h-svh overflow-hidden w-full duration-300 ease-in-out;
  transition-property: transform, opacity, filter;

  &.bg {
    font-size: clamp(2rem, 6vw, 8rem);
    @apply bg-blue-900/80 py-4 px-8 rounded-2xl text-white shadow-lg shadow-black/20 h-fit max-w-[98%];
  }

  &.slide {
    font-size: clamp(5vh, 15vh, 20vh);
    @apply bg-blue-900/80 py-4 px-8 rounded-none text-white shadow-xl;

    &.no-bg {
      @apply bg-transparent text-black shadow-md;
    }
  }

  &.active {
    @apply translate-y-0 opacity-100 scale-100;
  }

  &.inactive {
    @apply translate-y-10 opacity-0 scale-50;
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
  @apply flex flex-col items-center justify-center w-screen h-screen bg-transparent;

  &.bg {
    @apply justify-end pb-4 px-4;
  }
}

/* Enhanced notification styles with progress bar */
.notification-container {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  pointer-events: none;
  width: 100%;
  max-width: 90vw;
  display: flex;
  justify-content: center;
}

.notification {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  padding: 0;
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -1px rgba(0, 0, 0, 0.06),
    0 0 0 1px rgba(255, 255, 255, 0.05);
  max-width: 90svw;
  width: 100%;
  overflow: hidden;
}

.notification-content {
  padding: 16px 20px;
  font-size: clamp(2rem, 4vw, 3.5rem);
  line-height: 1;
  color: #1f2937;
  text-align: center;
  word-wrap: break-word;
}

.notification-progress-bar {
  height: 4px;
  background: rgba(156, 163, 175, 0.2);
  overflow: hidden;
}

.notification-progress-line {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #1d4ed8);
  transition: width 0.1s ease-out;
  border-radius: 0 2px 2px 0;
}

/* Transition animations */
.slide-up-enter-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-up-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-up-enter-from {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}

.slide-up-leave-to {
  opacity: 0;
  transform: translateY(-20px) scale(0.95);
}

/* HTML content styling */
.notification-content strong {
  font-weight: 700;
  color: #111827;
}

.notification-content em {
  font-style: italic;
  color: #374151;
}

.notification-content u {
  text-decoration: underline;
}

.notification-content blockquote {
  border-left: 4px solid #3b82f6;
  margin: 12px 0;
  padding-left: 16px;
  color: #4b5563;
  background: rgba(59, 130, 246, 0.08);
  border-radius: 0 8px 8px 0;
  font-style: italic;
}

/* Custom colors */
.notification-content [style*="color: rgb(239, 68, 68)"],
.notification-content [style*="color:#ef4444"] {
  color: #ef4444 !important;
  font-weight: 600;
}

.notification-content [style*="color: rgb(5, 150, 105)"],
.notification-content [style*="color:#059669"] {
  color: #059669 !important;
  font-weight: 600;
}

.notification-content [style*="color: rgb(37, 99, 235)"],
.notification-content [style*="color:#2563eb"] {
  color: #2563eb !important;
  font-weight: 600;
}

/* Responsive */
@media (max-width: 640px) {
  .notification-container {
    bottom: 16px;
    max-width: 95vw;
  }

  .notification {
    width: 85%;
  }

  .notification-content {
    padding: 16px 20px;
    font-size: 16px;
  }
}

/* Dark theme support */
main.bg .notification {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(0, 0, 0, 0.1);
}

main.bg .notification-content {
  color: #1f2937;
}

main.bg .notification-content strong {
  color: #111827;
}

main.bg .notification-content em {
  color: #374151;
}

main.bg .notification-content blockquote {
  background: rgba(59, 130, 246, 0.08);
  color: #4b5563;
  border-left-color: #3b82f6;
}

main.bg .notification-progress-bar {
  background: rgba(156, 163, 175, 0.3);
}

main.bg .notification-progress-line {
  background: linear-gradient(90deg, #3b82f6, #1d4ed8);
}
</style>