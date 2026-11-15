<script setup lang="ts">
import { toast } from 'vue-sonner'

useHead({ title: 'Historial' })

definePageMeta({
  layout: 'empty'
})

const { getAnnouncements, clientId } = useApi()
const {
  announcement,
  session,
  transcription,
  isConnected,
  historyRefreshVersion,
  connect,
  disconnect,
  connectionId
} = useRealtime()
const { parseHTML: originalParseHTML } = useContentParser()
const { icons } = useAnnouncementIcons()

const parseCache = new Map<string, any[]>()

// Clear cache when icons update so images render correctly
watch(icons, () => {
  parseCache.clear()
}, { deep: true })

const parseHTML = (text: string) => {
  // Access icons to track dependency in Vue
  const _ = icons.value
  if (!text) return []
  if (parseCache.has(text)) return parseCache.get(text)!
  const result = originalParseHTML(text)
  parseCache.set(text, result)
  if (parseCache.size > 100) parseCache.delete(parseCache.keys().next().value)
  return result
}

const history = shallowRef<any[]>([])
const isLoading = ref(true)
const showMonitor = ref(false)
const isMobileExpanded = ref(false)
const hideTimeout = ref<NodeJS.Timeout|null>(null)
const manuallyHidden = ref(false)
const scrollContainer = ref<HTMLElement | null>(null)
const showTranscription = ref(!!(transcription.value.final || transcription.value.interim))
const historyRailRef = ref<HTMLElement | null>(null)

watch([() => transcription.value.final, () => transcription.value.interim], ([f, i]) => {
  if ((f || i) && !manuallyHidden.value) showTranscription.value = true
})

// Per-user selection: clicking a history item shows it in the spotlight,
// overriding the live announcement only for this user.
const selectedHistoryId = ref<string | null>(null)
const selectedHistoryItem = computed(() => history.value.find(i => i.id === selectedHistoryId.value) || null)
const selectHistory = (item: any) => {
  selectedHistoryId.value = selectedHistoryId.value === item.id ? null : item.id
}

// Spotlight: user selection, else active announcement, else latest from history
const spotlight = computed(() => {
  if (selectedHistoryItem.value) {
    return { text: selectedHistoryItem.value.text, topic: selectedHistoryItem.value.topic, active: false }
  }
  if (announcement.value.active && announcement.value.text) {
    return { text: announcement.value.text, topic: announcement.value.topic, active: true }
  }
  if (history.value.length) {
    return { text: history.value[0].text, topic: history.value[0].topic, active: false }
  }
  return null
})

const interimWords = computed(() => {
  return transcription.value.interim.split(/\s+/).filter(Boolean).map((w, i) => ({
    id: `i-${i}`,
    text: w
  }))
})

const fetchHistory = async () => {
  try {
    const data = await getAnnouncements()
    history.value = data
  } catch (e) {
    console.error('Error fetching history', e)
  } finally {
    isLoading.value = false
  }
}

const copyToClipboard = async (text: string) => {
  try {
    const plainText = text.replace(/<[^>]*>/g, '')
    await navigator.clipboard.writeText(plainText)
    toast.success('Copiado al portapapeles', {
        description: 'El texto se ha copiado sin formato.'
    })
  } catch (err) {
    console.error('Error copying to clipboard', err)
    toast.error('Error al copiar')
  }
}

onMounted(() => {
  connect()
  fetchHistory()
})

watch(historyRefreshVersion, () => {
  fetchHistory()
})

// Re-fetch history when WS reconnects
watch(isConnected, (connected) => {
  if (connected) fetchHistory()
})

watch([() => transcription.value.final, () => transcription.value.interim], ([newFinal, newInterim]) => {
    if (newFinal || newInterim) {
        if (!manuallyHidden.value) showMonitor.value = true
        if (hideTimeout.value) clearTimeout(hideTimeout.value)
        if (!isMobileExpanded.value) {
            hideTimeout.value = setTimeout(() => { showMonitor.value = false }, 60000)
        }
    }
    nextTick(() => {
        if (newFinal && scrollContainer.value) scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
    })
})

watch(isMobileExpanded, (expanded) => {
    if (!expanded) {
        if (hideTimeout.value) clearTimeout(hideTimeout.value)
        hideTimeout.value = setTimeout(() => { showMonitor.value = false }, 60000)
    } else {
        if (hideTimeout.value) clearTimeout(hideTimeout.value)
        showMonitor.value = true
    }
})

onUnmounted(() => {
  disconnect()
})

const formatTimeAgo = (date: Date | string | number) => {
  return useTimeAgo(date, {
    messages: {
      justNow: 'justo ahora',
      past: (n: string) => n.match(/\d/) ? `hace ${n}` : n,
      future: (n: string) => n.match(/\d/) ? `en ${n}` : n,
      month: (n: number, past: boolean) => n === 1 ? (past ? 'el mes pasado' : 'el próximo mes') : `${n} meses`,
      year: (n: number, past: boolean) => n === 1 ? (past ? 'el año pasado' : 'el próximo año') : `${n} años`,
      day: (n: number, past: boolean) => n === 1 ? (past ? 'ayer' : 'mañana') : `${n} días`,
      week: (n: number, past: boolean) => n === 1 ? (past ? 'la semana pasada' : 'la próxima semana') : `${n} semanas`,
      hour: (n: number) => `${n} h`,
      minute: (n: number) => `${n} min`,
      second: (n: number) => `${n} s`,
      invalid: 'Fecha inválida',
    } as any
  }).value
}

const displayTopic = computed(() => {
    if (selectedHistoryItem.value) {
        return selectedHistoryItem.value.topic || 'Historial'
    }
    if (announcement.value.active && announcement.value.topic) {
        return announcement.value.topic
    }
    const latestWithTopic = history.value.find(item => item.topic)
    return latestWithTopic?.topic || 'Historial'
})

const spotlightSizeClass = computed(() => {
  const len = (spotlight.value?.text || '').replace(/<[^>]*>/g, '').length
  if (len > 500) return 'text-xl sm:text-2xl'
  if (len > 250) return 'text-2xl sm:text-3xl'
  if (len > 120) return 'text-3xl sm:text-4xl'
  return 'text-5xl sm:text-6xl'
})

const generatePdf = () => {
  window.print()
}
</script>

<template>
  <div class="h-svh flex overflow-hidden bg-white text-neutral-900 font-sans print:block print:h-auto print:overflow-visible print:bg-white print:p-0">

    <!-- History Rail (left edge, desktop only) -->
    <div class="hidden lg:flex flex-col w-72 border-r border-neutral-100 shrink-0 print:hidden">
      <div class="px-5 pt-10 pb-4 border-b border-neutral-50">
        <h2 class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-300">Historial</h2>
      </div>
      <div ref="historyRailRef" class="flex-1 overflow-y-auto py-3">
        <!-- Loading skeleton -->
        <div v-if="isLoading && !history.length" class="space-y-1 px-4">
          <div v-for="n in 5" :key="n" class="space-y-2 py-3">
            <GSkeleton class="h-2 w-12 rounded-full" />
            <GSkeleton class="h-3 w-full rounded" />
            <GSkeleton class="h-3 w-2/3 rounded" />
          </div>
        </div>

        <!-- History items -->
        <div v-else v-auto-animate="{ duration: 280, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }" class="space-y-0.5">
          <button
            v-for="item in history"
            :key="item.id"
            @click="selectHistory(item)"
            class="w-full text-left px-5 py-3 rounded-lg transition-all group"
            :class="[
              selectedHistoryId === item.id
                ? 'bg-amber-50 border border-amber-200'
                : announcement.active && session.live && announcement.text === item.text
                  ? 'bg-blue-50 border border-blue-100'
                  : 'hover:bg-neutral-50 border border-transparent'
            ]"
          >
            <div class="flex items-center gap-2 mb-1.5">
              <span class="text-[9px] font-bold text-neutral-300 uppercase tracking-widest">
                {{ formatTimeAgo(new Date(item.createdAt)) }}
              </span>
              <Transition name="badge" mode="out-in">
                <span v-if="selectedHistoryId === item.id" key="showing"
                      class="text-[8px] font-black text-amber-600 uppercase tracking-[0.2em] bg-amber-100 px-1.5 py-0.5 rounded">
                  Mostrando
                </span>
                <span v-else-if="announcement.active && session.live && announcement.text === item.text" key="now"
                      class="text-[8px] font-black text-blue-600 uppercase tracking-[0.2em] bg-blue-100 px-1.5 py-0.5 rounded">
                  Ahora
                </span>
              </Transition>
            </div>
            <div class="text-xs font-medium text-neutral-600 leading-snug line-clamp-2 group-hover:text-neutral-900 transition-colors">
              <template v-for="(segment, idx) in parseHTML(item.text)" :key="idx">
                <img
                  v-if="segment.type === 'image'"
                  :src="segment.value"
                  :class="segment.class"
                  class="!max-h-[1.25em] !mx-0.5"
                />
                <Icon
                  v-else-if="segment.type === 'icon'"
                  :name="segment.value"
                  :class="segment.class"
                  class="size-3.5 align-text-bottom"
                />
                <span v-else v-html="segment.value" :class="segment.class"></span>
              </template>
            </div>
          </button>
        </div>

        <div v-if="!isLoading && !history.length" class="px-5 py-12 text-center">
          <p class="text-[9px] font-black text-neutral-200 uppercase tracking-[0.3em]">Sin registros</p>
        </div>
      </div>
    </div>

    <!-- Spotlight (center, main) -->
    <div class="flex-1 flex flex-col min-w-0 min-h-0">
      <!-- Top bar -->
      <div class="flex-none px-4 sm:px-10 pt-5 sm:pt-12 pb-4 sm:pb-6 border-b border-neutral-50 print:hidden z-10 space-y-3">
        <h1 class="text-lg sm:text-xl font-black tracking-tight text-neutral-900 uppercase">
          {{ displayTopic }}
        </h1>
        <div class="flex items-center gap-3">
          <Transition name="badge">
            <div v-if="announcement.active && session.live" class="flex items-center gap-1.5 bg-blue-50 text-blue-600 px-2 py-1 rounded-md border border-blue-100 animate-pulse">
              <div class="size-1.5 bg-blue-600 rounded-full"></div>
              <span class="text-[9px] font-black uppercase tracking-wider">En vivo</span>
            </div>
          </Transition>
          <Transition name="swap" mode="out-in">
          <button
            v-if="showTranscription" key="hide"
            @click="showTranscription = false; manuallyHidden = true"
            class="hidden lg:flex items-center gap-2 text-neutral-400 hover:text-neutral-900 text-[10px] font-bold uppercase tracking-widest border border-neutral-200 px-4 py-2 rounded-full hover:bg-neutral-50 active:scale-95 transition-all"
          >
            <Icon name="tabler:eye-off" class="size-4" />
            <span>Transcripción</span>
          </button>
          <button
            v-else key="show"
            @click="showTranscription = true; manuallyHidden = false"
            class="hidden lg:flex items-center gap-2 text-neutral-400 hover:text-neutral-900 text-[10px] font-bold uppercase tracking-widest border border-neutral-200 px-4 py-2 rounded-full hover:bg-neutral-50 active:scale-95 transition-all"
          >
            <Icon name="tabler:eye" class="size-4" />
            <span>Transcripción</span>
          </button>
          </Transition>
          <button
            @click="generatePdf"
            class="flex items-center gap-2 text-neutral-400 hover:text-neutral-900 text-[10px] font-bold uppercase tracking-widest border border-neutral-200 px-4 py-2 rounded-full hover:bg-neutral-50 active:scale-95 transition-all"
          >
            <Icon name="tabler:file-type-pdf" class="size-4" />
            <span>Exportar PDF</span>
          </button>
        </div>
      </div>

      <!-- Spotlight area (desktop only) -->
      <div class="hidden lg:flex flex-1 items-center justify-center px-6 sm:px-12 py-8 overflow-y-auto relative">

        <Transition name="fade-up" mode="out-in">
        <!-- Empty state -->
        <div v-if="!spotlight && !isLoading" key="empty" class="text-center">
          <div class="size-20 bg-neutral-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Icon name="tabler:speakerphone" class="size-10 text-neutral-200" />
          </div>
          <p class="text-[10px] font-black text-neutral-300 uppercase tracking-[0.3em]">Esperando anuncios</p>
        </div>

        <!-- Loading skeleton -->
        <div v-else-if="isLoading && !spotlight" key="loading" class="w-full max-w-3xl space-y-6 px-4">
          <GSkeleton class="h-10 w-3/4 mx-auto rounded-xl" />
          <GSkeleton class="h-10 w-1/2 mx-auto rounded-xl" />
        </div>

        <!-- Spotlight text -->
        <div v-else-if="spotlight" key="spotlight" class="w-full max-w-4xl text-center">
          <Transition
            mode="out-in"
            enter-active-class="transition duration-500 ease-out"
            enter-from-class="opacity-0 translate-y-2"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition duration-300 ease-in"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 -translate-y-2"
          >
            <div :key="spotlight.text" class="whitespace-pre-line font-black leading-tight tracking-tight text-balance" :class="spotlightSizeClass">
                <template v-for="(segment, idx) in parseHTML(spotlight.text)" :key="idx">
                  <img
                    v-if="segment.type === 'image'"
                    :src="segment.value"
                    :class="segment.class"
                  />
                  <Icon
                    v-else-if="segment.type === 'icon'"
                    :name="segment.value"
                    :class="segment.class"
                    class="size-6 mb-1"
                  />
                  <span
                    v-else
                    v-html="segment.value"
                    :class="segment.class"
                  ></span>
                </template>
            </div>
          </Transition>
        </div>
        </Transition>
      </div>

      <!-- Mobile: history list (spotlight is just the first item with different bg) -->
      <div class="lg:hidden flex-1 overflow-y-auto px-4 py-4 pb-24 print:hidden relative">

        <!-- Loading skeleton -->
        <div v-if="isLoading && !history.length" class="space-y-2">
          <div v-for="n in 4" :key="n" class="px-3 py-3 space-y-2">
            <GSkeleton class="h-2 w-16 rounded-full" />
            <GSkeleton class="h-4 w-3/4 rounded" />
            <GSkeleton class="h-4 w-1/2 rounded" />
          </div>
        </div>

        <div v-else v-auto-animate="{ duration: 280, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }" class="space-y-1">
          <div
            v-for="(item, idx) in history"
            :key="item.id"
            class="w-full text-left px-3 py-3 rounded-xl transition-all"
            :class="[
              announcement.active && session.live && announcement.text === item.text
                ? 'bg-blue-50 border border-blue-200 shadow-sm'
                : idx === 0 && !announcement.active
                  ? 'bg-neutral-50 border border-neutral-100'
                  : 'border border-transparent'
            ]"
          >
            <div class="flex items-center gap-2 mb-1.5">
              <span class="text-[9px] font-bold text-neutral-300 uppercase tracking-widest">
                {{ formatTimeAgo(new Date(item.createdAt)) }}
              </span>
              <Transition name="badge">
                <span v-if="announcement.active && session.live && announcement.text === item.text"
                      class="text-[8px] font-black text-blue-600 uppercase tracking-[0.2em] bg-blue-100 px-1.5 py-0.5 rounded">
                  Ahora
                </span>
              </Transition>
            </div>
            <div class="whitespace-pre-line text-sm font-semibold leading-snug">
              <template v-for="(segment, idx) in parseHTML(item.text)" :key="idx">
                <img v-if="segment.type === 'image'" :src="segment.value" :class="segment.class" />
                <Icon
                  v-else-if="segment.type === 'icon'"
                  :name="segment.value"
                  :class="segment.class"
                  class="size-4 mb-0.5"
                />
                <span
                  v-else
                  v-html="segment.value"
                  :class="segment.class"
                ></span>
              </template>
            </div>
          </div>
        </div>

        <div v-if="!isLoading && !history.length" class="py-20 text-center">
          <div class="size-16 bg-neutral-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Icon name="tabler:speakerphone" class="size-8 text-neutral-200" />
          </div>
          <p class="text-[10px] font-black text-neutral-300 uppercase tracking-[0.3em]">Esperando anuncios</p>
        </div>
      </div>
    </div>

    <!-- Right Panel: Live Transcription (mismo componente y estilo que /anuncios) -->
    <Transition name="panel-slide">
    <aside
      v-if="showTranscription"
      class="hidden lg:flex flex-col h-full w-[420px] xl:w-[500px] bg-muted/40 text-foreground border-l border-border/60 shrink-0 overflow-hidden"
    >
      <!-- Ancho fijo interno: el aside colapsa su ancho sin que el contenido se comprima -->
      <div class="flex flex-col h-full w-[420px] xl:w-[500px] shrink-0">
      <div class="flex items-center gap-3 px-7 pt-7 pb-5">
        <div class="relative flex size-2.5">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                :class="transcription.active ? 'bg-red-400' : 'bg-primary/60'"></span>
          <span class="relative inline-flex rounded-full size-2.5"
                :class="transcription.active ? 'bg-red-500' : 'bg-primary'"></span>
        </div>
        <h2 class="text-xl font-bold tracking-tight">Transcripción en vivo</h2>
      </div>

      <LiveTranscript :final="transcription.final || ''" :interim="transcription.interim || ''" />
      </div>
    </aside>
    </Transition>

    <!-- Mobile Floating Monitor (Bottom Bar) -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-500 ease-out"
        enter-from-class="translate-y-full"
        enter-to-class="translate-y-0"
        leave-active-class="transition duration-300 ease-in"
        leave-from-class="translate-y-0"
        leave-to-class="translate-y-full"
      >
        <div
          v-if="showMonitor && !isMobileExpanded"
          @click="isMobileExpanded = true"
          class="fixed bottom-0 left-0 right-0 z-50 lg:hidden print:hidden cursor-pointer"
        >
          <div class="bg-background/95 backdrop-blur-md border-t border-border px-5 h-20 flex flex-col justify-center shadow-[0_-4px_20px_rgba(0,0,0,0.3)] overflow-hidden">
             <div class="flex items-center gap-3">
                <div class="relative flex size-2">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                        :class="transcription.active ? 'bg-red-400' : 'bg-primary/60'"></span>
                  <span class="relative inline-flex rounded-full size-2"
                        :class="transcription.active ? 'bg-red-500' : 'bg-primary'"></span>
                </div>
                <span class="text-xs font-bold tracking-tight text-muted-foreground">
                  Transcripción en vivo
                </span>
                <div class="h-px flex-1 bg-border"></div>
                <button @click.stop="showMonitor = false; manuallyHidden = true" class="flex items-center justify-center p-1 -mr-1 text-muted-foreground hover:text-foreground transition-colors">
                  <Icon name="tabler:x" class="size-3.5" />
                </button>
                <Icon name="tabler:chevron-up" class="size-4 text-muted-foreground/50" />
             </div>
             <div
               ref="scrollContainer"
               class="overflow-y-auto"
               style="scrollbar-width: none; -ms-overflow-style: none;"
             >
               <TransitionGroup
                 name="word-stream-mini"
                 tag="p"
                 class="text-base leading-tight tracking-tight flex flex-wrap gap-x-1.5 text-foreground"
               >
                 <span v-for="word in interimWords" :key="word.id" class="transition-colors">
                   {{ word.text }}
                 </span>
               </TransitionGroup>
             </div>
          </div>
        </div>
      </Transition>

      <Transition
        enter-active-class="transition duration-500 ease-out"
        enter-from-class="translate-y-full"
        enter-to-class="translate-y-0"
        leave-active-class="transition duration-400 ease-in"
        leave-from-class="translate-y-0"
        leave-to-class="translate-y-full"
      >
        <div
          v-if="isMobileExpanded"
          class="fixed inset-0 z-[60] bg-background text-foreground lg:hidden flex flex-col p-5 pb-8 sm:p-8 sm:pb-12"
        >
           <header class="flex items-center justify-between mb-5 sm:mb-8">
              <div class="flex items-center gap-3">
                <div class="relative flex size-2">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                        :class="transcription.active ? 'bg-red-400' : 'bg-blue-400'"></span>
                  <span class="relative inline-flex rounded-full size-2"
                        :class="transcription.active ? 'bg-red-500' : 'bg-blue-500'"></span>
                </div>
                <h2 class="text-base font-bold tracking-tight">Transcripción en vivo</h2>
              </div>
              <button @click="isMobileExpanded = false; showMonitor = false; manuallyHidden = true" class="flex items-center justify-center p-2 -mr-2 text-muted-foreground hover:text-foreground">
                <Icon name="tabler:x" class="size-6" />
              </button>
           </header>

           <LiveTranscript
             :final="transcription.final || ''"
             :interim="transcription.interim || ''"
             content-class="pb-4"
           />
        </div>
      </Transition>
    </Teleport>

    <!-- Print: historial completo, compacto y fluyendo en varias páginas -->
    <div class="hidden print:block print:bg-white">
      <h1 class="text-xl font-black uppercase mb-1">{{ displayTopic }}</h1>
      <p class="text-[10px] text-neutral-400 mb-4">{{ new Date().toLocaleDateString() }} · {{ history.length }} anuncios</p>
      <div>
        <div v-for="item in history" :key="item.id" class="print-item flex gap-3 border-b border-neutral-200 py-2">
          <span class="w-11 shrink-0 whitespace-nowrap text-[10px] font-mono tabular-nums text-neutral-400 pt-0.5">
            {{ new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) }}
          </span>
          <div class="flex-1 min-w-0 text-[13px] font-semibold leading-snug whitespace-pre-line">
            <template v-for="(segment, idx) in parseHTML(item.text)" :key="idx">
              <img v-if="segment.type === 'image'" :src="segment.value" :class="segment.class" class="!max-h-[1.2em]" />
              <Icon v-else-if="segment.type === 'icon'" :name="segment.value" :class="segment.class" class="size-3.5 align-text-bottom" />
              <span v-else v-html="segment.value" :class="segment.class"></span>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');

.badge-enter-active, .badge-leave-active { transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.32, 0.72, 0, 1); }
.badge-enter-from, .badge-leave-to { opacity: 0; transform: scale(0.7); }

.swap-enter-active, .swap-leave-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.swap-enter-from { opacity: 0; transform: translateY(4px); }
.swap-leave-to { opacity: 0; transform: translateY(-4px); }

.fade-up-enter-active, .fade-up-leave-active { transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.32, 0.72, 0, 1); }
.fade-up-enter-from { opacity: 0; transform: translateY(10px); }
.fade-up-leave-to { opacity: 0; transform: translateY(-6px); }

/* El ancho colapsa a 0 a la vez que el panel se desvanece: el spotlight crece en simultáneo, sin saltar */
.panel-slide-enter-active, .panel-slide-leave-active {
  transition: width 0.35s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.3s ease, border-width 0.35s ease;
}
.panel-slide-enter-from, .panel-slide-leave-to { width: 0; opacity: 0; border-left-width: 0; }


.line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

@media print {
  @page { margin: 1.2cm; }
  body { background: white !important; }
  /* un anuncio no se parte entre páginas */
  .print-item { break-inside: avoid; }
}

.word-stream-enter-active,
.word-stream-mini-enter-active {
  transition: all 0.4s cubic-bezier(0.2, 0, 0, 1);
  transition-delay: 0.1s;
}

.word-stream-enter-from,
.word-stream-mini-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.9);
  filter: blur(8px);
}

.word-stream-move,
.word-stream-mini-move {
  transition: transform 0.5s ease;
}
</style>
