<script setup lang="ts">
import io from 'socket.io-client';

const { apiUrl } = useRuntimeConfig().public;
const socket = io(window.location.origin)
const line = ref("");
const changeLine = ref(true);

const isActive = ref(false);
const { bg, slide, no_bg } = useRoute().query;
const queries = {
  bg: bg !== undefined,
  slide: slide !== undefined,
  no_bg: no_bg !== undefined,
}

// Estado para las notificaciones written
const writtenNotifications = ref<Array<{
  id: string;
  html: string;
  visible: boolean;
  duration: number;
  timeRemaining: number;
  intervalId?: number;
}>>([]);

let notificationId = 0;

// Función para calcular duración basada en longitud del texto
function calculateDuration(htmlContent: string): number {
  // Remover tags HTML para contar solo el texto
  const textContent = htmlContent.replace(/<[^>]*>/g, '');
  const baseTime = 3000; // 3 segundos base
  const extraTimePerChar = 50; // 50ms por caracter adicional
  const minTime = 2000; // mínimo 2 segundos
  const maxTime = 8000; // máximo 8 segundos

  const calculatedTime = baseTime + (textContent.length * extraTimePerChar);
  return Math.max(minTime, Math.min(maxTime, calculatedTime));
}

// Función para mostrar notificación written
function showWrittenNotification(htmlContent: string) {
  const id = `written-${++notificationId}`;
  const duration = calculateDuration(htmlContent);

  const notification = {
    id,
    html: htmlContent,
    visible: false,
    duration,
    timeRemaining: duration
  };

  writtenNotifications.value.push(notification);

  // Hacer visible con un pequeño delay para la animación
  nextTick(() => {
    const notif = writtenNotifications.value.find(n => n.id === id);
    if (notif) {
      notif.visible = true;
    }
  });

  // Contador de tiempo restante
  let intervalId: any;
  if(import.meta.client) {
    intervalId = setInterval(() => {
      const notif = writtenNotifications.value.find(n => n.id === id);
      if (notif && notif.timeRemaining > 0) {
        notif.timeRemaining -= 100;
      }
    }, 100);
  }

  // Actualizar el intervalId en la notificación
  const notif = writtenNotifications.value.find(n => n.id === id);
  if (notif) {
    notif.intervalId = intervalId;
  }

  // Remover después de la duración calculada
  setTimeout(() => {
    const index = writtenNotifications.value.findIndex(n => n.id === id);
    if (index !== -1) {
      const notification = writtenNotifications.value[index];
      if (notification.intervalId) {
        clearInterval(notification.intervalId);
      }
      notification.visible = false;
      // Remover del array después de la animación de salida
      setTimeout(() => {
        const finalIndex = writtenNotifications.value.findIndex(n => n.id === id);
        if (finalIndex !== -1) {
          writtenNotifications.value.splice(finalIndex, 1);
        }
      }, 300);
    }
  }, duration);
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
  if (data.activeLine.length > 0) {
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

// Nuevo evento para recibir mensajes written
socket.on('written', (data) => {
  if (data.html && data.html.trim()) {
    showWrittenNotification(data.html);

    // 🔴 Si el viewer está activo, desactivarlo y avisar al socket
    if (isActive.value) {
      isActive.value = false;
      socket.emit("viewerActive", false);
    }
  }
});

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

    <!-- Contenedor de notificaciones written -->
    <div class="written-notifications-container">
      <TransitionGroup name="notification" tag="div" class="notifications-list">
        <div v-for="(notification, index) in writtenNotifications" :key="notification.id" :class="['written-notification', {
          'visible': notification.visible,
          'stacked': index > 0
        }]" :style="{
            '--stack-index': index,
            zIndex: 1000 - index
          }">
          <div class="notification-content" v-html="notification.html"></div>
          <div class="notification-progress-line">
            <div class="progress-line-fill" :style="{
              width: `${(notification.timeRemaining / notification.duration) * 100}%`
            }"></div>
          </div>
        </div>
      </TransitionGroup>
    </div>
  </main>
</template>

<style>
.lyric {
  font-family: 'Outfit', sans-serif;
  font-size: inherit;
  @apply w-full text-center leading-none drop-shadow-xl shadow-black/20;
  background: transparent;
}

.line-wrap {
  @apply flex line-clamp-2 justify-center text-center items-center h-screen max-h-screen overflow-hidden w-full transition-[transform,opacity,filter] duration-300 ease-in-out;

  &.bg {
    font-size: clamp(2rem, 6vw, 8rem); /* fluido según ancho */
    @apply bg-blue-900/80 py-4 px-8 rounded-2xl text-white shadow-lg shadow-black/20 h-fit max-w-[98%];
  }

  &.slide {
    font-size: clamp(5vh, 15vh, 20vh); /* fluido según alto */
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
  @apply flex flex-col items-center justify-center w-screen h-screen;

  &.bg {
    @apply justify-end pb-4 px-4;
  }
}

/* Estilos para las notificaciones written */
.written-notifications-container {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  pointer-events: none;
  max-width: 90vw;
}

.notifications-list {
  display: flex;
  flex-direction: column-reverse;
  gap: 0;
  align-items: center;
  position: relative;
}

.written-notification {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  padding: 16px 20px;
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -1px rgba(0, 0, 0, 0.06),
    0 0 0 1px rgba(255, 255, 255, 0.05);
  transform: translateY(20px) scale(0.95);
  opacity: 0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  max-width: 90svw;
  min-width: 200px;
}

.written-notification.visible {
  transform: translateY(0) scale(1);
  opacity: 1;
}

.notification-content {
  font-size: clamp(1.5svw, 3vw, 3svw); /* mínimo 16px, fluido hasta 2vw, máximo 32px */
  line-height: 1.6;
  color: #1f2937;
  text-align: center;
  word-wrap: break-word;
}

.notification-header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-bottom: 16px;
}

.time-indicator {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  background: rgba(107, 114, 128, 0.1);
  padding: 2px 8px;
  border-radius: 10px;
  min-width: 28px;
  text-align: center;
}

.notification-progress-line {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: rgba(156, 163, 175, 0.2);
  border-radius: 0 0 16px 16px;
  overflow: hidden;
}

.progress-line-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #1d4ed8);
  transition: width 0.1s linear;
  border-radius: 0 0 16px 16px;
}

/* Estilos para el contenido HTML en las notificaciones */
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

/* Colores personalizados en las notificaciones */
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

/* Animaciones para TransitionGroup */
.notification-enter-active,
.notification-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.notification-enter-from {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}

.notification-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.95);
}

.notification-move {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Adaptaciones responsivas */
@media (max-width: 640px) {
  .written-notifications-container {
    bottom: 16px;
    max-width: 95vw;
  }

  .written-notification {
    padding: 16px 20px 12px 20px;
    border-radius: 12px;
    min-width: 250px;
    width: 85%;
  }

  .notification-content {
    font-size: 16px;
  }

  .notification-header {
    margin-bottom: 12px;
  }

  .notification-progress-line {
    border-radius: 0 0 12px 12px;
  }

  .progress-line-fill {
    border-radius: 0 0 12px 12px;
  }
}

/* Tema oscuro para cuando se usa con bg */
main.bg .written-notification {
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

main.bg .time-indicator {
  color: #6b7280;
  background: rgba(107, 114, 128, 0.15);
}

main.bg .progress-bar {
  background: rgba(156, 163, 175, 0.25);
}

main.bg .notification-progress-line {
  background: rgba(156, 163, 175, 0.2);
}
</style>