<script setup lang="ts">
import { toast } from 'vue-sonner'

useHead({ title: 'Historial' })

definePageMeta({
  layout: 'empty'
})

const { getAnnouncements, clientId } = useApi()
const {
  announcement,
  transcription,
  isConnected,
  historyRefreshVersion,
  connect,
  disconnect,
  connectionId
} = useRealtime()
const { parseHTML: originalParseHTML } = useContentParser()

const parseCache = new Map<string, any[]>()
const parseHTML = (text: string) => {
  if (!text) return []
  if (parseCache.has(text)) return parseCache.get(text)!
  const result = originalParseHTML(text)
  parseCache.set(text, result)
  if (parseCache.size > 100) parseCache.delete(parseCache.keys().next().value)
  return result
}

const history = shallowRef<any[]>([])
const isLoading = ref(true)
const desktopScrollContainer = ref<HTMLElement | null>(null)
const mobileScrollContainer = ref<HTMLElement | null>(null)
const showMonitor = ref(false)
const isMobileExpanded = ref(false)
const hideTimeout = ref<NodeJS.Timeout|null>(null)
const manuallyHidden = ref(false)
const transcriptionHistory = computed(() => transcription.value.final)
const autoScrollEnabled = ref(true)
const isAutoScrolling = ref(false)
const scrollContainer = ref<HTMLElement | null>(null)
const showTranscription = ref(!!(transcription.value.final || transcription.value.interim))
const historyRailRef = ref<HTMLElement | null>(null)

watch([() => transcription.value.final, () => transcription.value.interim], ([f, i]) => {
  if (f || i) showTranscription.value = true
})

// Spotlight: active announcement or latest from history
const spotlight = computed(() => {
  if (announcement.value.active && announcement.value.text) {
    return { text: announcement.value.text, topic: announcement.value.topic, active: true }
  }
  if (history.value.length) {
    return { text: history.value[0].text, topic: history.value[0].topic, active: false }
  }
  return null
})

const handleScroll = () => {
    if (!desktopScrollContainer.value || isAutoScrolling.value) return
    const { scrollTop, scrollHeight, clientHeight } = desktopScrollContainer.value
    const isAtBottom = scrollHeight - scrollTop <= clientHeight + 100
    autoScrollEnabled.value = isAtBottom
}

const scrollToBottom = () => {
    autoScrollEnabled.value = true
    isAutoScrolling.value = true
    nextTick(() => {
        if (desktopScrollContainer.value) {
            desktopScrollContainer.value.scrollTo({
                top: desktopScrollContainer.value.scrollHeight,
                behavior: 'smooth'
            })
            setTimeout(() => { isAutoScrolling.value = false }, 600)
        }
    })
}

const mobileAutoScrollEnabled = ref(true)
const isMobileAutoScrolling = ref(false)

const handleMobileScroll = () => {
    if (!mobileScrollContainer.value || isMobileAutoScrolling.value) return
    const { scrollTop, scrollHeight, clientHeight } = mobileScrollContainer.value
    const isAtBottom = scrollHeight - scrollTop <= clientHeight + 100
    mobileAutoScrollEnabled.value = isAtBottom
}

const scrollMobileToBottom = () => {
    if (!mobileScrollContainer.value) return
    mobileAutoScrollEnabled.value = true
    isMobileAutoScrolling.value = true
    mobileScrollContainer.value.scrollTo({
        top: mobileScrollContainer.value.scrollHeight,
        behavior: 'smooth'
    })
    // Guard until scroll actually reaches bottom
    const check = setInterval(() => {
        if (!mobileScrollContainer.value) { clearInterval(check); return }
        const { scrollTop, scrollHeight, clientHeight } = mobileScrollContainer.value
        if (scrollHeight - scrollTop <= clientHeight + 10) {
            isMobileAutoScrolling.value = false
            clearInterval(check)
        }
    }, 100)
    // Fallback: release guard after 2s max
    setTimeout(() => { isMobileAutoScrolling.value = false; clearInterval(check) }, 2000)
}

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
        if (desktopScrollContainer.value && autoScrollEnabled.value) {
            desktopScrollContainer.value.scrollTop = desktopScrollContainer.value.scrollHeight
        }
        if (mobileScrollContainer.value && mobileAutoScrollEnabled.value) {
            mobileScrollContainer.value.scrollTop = mobileScrollContainer.value.scrollHeight
        }
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
    if (announcement.value.active && announcement.value.topic) {
        return announcement.value.topic
    }
    const latestWithTopic = history.value.find(item => item.topic)
    return latestWithTopic?.topic || 'Historial'
})

const generatePdf = () => {
  window.print()
}
</script>

<template>
  <div class="h-svh flex overflow-hidden bg-white text-neutral-900 font-sans print:bg-white print:p-0">

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
        <div v-else class="space-y-0.5">
          <button
            v-for="item in history"
            :key="item.id"
            class="w-full text-left px-5 py-3 rounded-lg transition-all group"
            :class="[
              announcement.active && announcement.text === item.text
                ? 'bg-blue-50 border border-blue-100'
                : 'hover:bg-neutral-50 border border-transparent'
            ]"
          >
            <div class="flex items-center gap-2 mb-1.5">
              <span class="text-[9px] font-bold text-neutral-300 uppercase tracking-widest">
                {{ formatTimeAgo(new Date(item.createdAt)) }}
              </span>
              <span v-if="announcement.active && announcement.text === item.text"
                    class="text-[8px] font-black text-blue-600 uppercase tracking-[0.2em] bg-blue-100 px-1.5 py-0.5 rounded">
                Ahora
              </span>
            </div>
            <p class="text-xs font-medium text-neutral-600 leading-snug line-clamp-2 group-hover:text-neutral-900 transition-colors">
              {{ item.text.replace(/<[^>]*>/g, '') }}
            </p>
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
      <div class="flex-none px-6 sm:px-10 pt-8 sm:pt-12 pb-6 border-b border-neutral-50 print:hidden z-10 space-y-3">
        <h1 class="text-lg sm:text-xl font-black tracking-tight text-neutral-900 uppercase">
          {{ displayTopic }}
        </h1>
        <div class="flex items-center gap-3">
          <div v-if="announcement.active" class="flex items-center gap-1.5 bg-blue-50 text-blue-600 px-2 py-1 rounded-md border border-blue-100 animate-pulse">
            <div class="size-1.5 bg-blue-600 rounded-full"></div>
            <span class="text-[9px] font-black uppercase tracking-wider">En vivo</span>
          </div>
          <button
            v-if="showTranscription"
            @click="showTranscription = false; manuallyHidden = true"
            class="hidden lg:flex items-center gap-2 text-neutral-400 hover:text-neutral-900 text-[10px] font-bold uppercase tracking-widest border border-neutral-200 px-4 py-2 rounded-full hover:bg-neutral-50 active:scale-95 transition-all"
          >
            <Icon name="tabler:eye-off" class="size-4" />
            <span>Transcripción</span>
          </button>
          <button
            v-else
            @click="showTranscription = true; manuallyHidden = false"
            class="hidden lg:flex items-center gap-2 text-neutral-400 hover:text-neutral-900 text-[10px] font-bold uppercase tracking-widest border border-neutral-200 px-4 py-2 rounded-full hover:bg-neutral-50 active:scale-95 transition-all"
          >
            <Icon name="tabler:eye" class="size-4" />
            <span>Transcripción</span>
          </button>
          <button
            @click="generatePdf"
            class="flex items-center gap-2 text-neutral-400 hover:text-neutral-900 text-[10px] font-bold uppercase tracking-widest border border-neutral-200 px-4 py-2 rounded-full hover:bg-neutral-50 active:scale-95 transition-all"
          >
            <Icon name="tabler:file-type-pdf" class="size-4" />
            <span class="hidden sm:inline">Exportar PDF</span>
          </button>
        </div>
      </div>

      <!-- Spotlight area (desktop only) -->
      <div class="hidden lg:flex flex-1 items-center justify-center px-6 sm:px-12 py-8 overflow-hidden">
        <!-- Empty state -->
        <div v-if="!spotlight && !isLoading" class="text-center">
          <div class="size-20 bg-neutral-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Icon name="tabler:speakerphone" class="size-10 text-neutral-200" />
          </div>
          <p class="text-[10px] font-black text-neutral-300 uppercase tracking-[0.3em]">Esperando anuncios</p>
        </div>

        <!-- Loading skeleton -->
        <div v-else-if="isLoading && !spotlight" class="w-full max-w-3xl space-y-6 px-4">
          <GSkeleton class="h-10 w-3/4 mx-auto rounded-xl" />
          <GSkeleton class="h-10 w-1/2 mx-auto rounded-xl" />
        </div>

        <!-- Spotlight text -->
        <div v-else-if="spotlight" class="w-full max-w-4xl text-center">
          <Transition
            mode="out-in"
            enter-active-class="transition duration-500 ease-out"
            enter-from-class="opacity-0 translate-y-2"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition duration-300 ease-in"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 -translate-y-2"
          >
            <div :key="spotlight.text" class="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              <template v-for="(segment, idx) in parseHTML(spotlight.text)" :key="idx">
                <Icon
                  v-if="segment.type === 'icon'"
                  :name="segment.value"
                  :class="segment.class"
                  class="size-6 mb-1"
                />
                <span
                  v-else
                  v-html="segment.value"
                  :class="segment.class"
                  class="text-3xl font-bold leading-snug"
                ></span>
              </template>
            </div>
          </Transition>
        </div>
      </div>

      <!-- Mobile: history list (spotlight is just the first item with different bg) -->
      <div class="lg:hidden flex-1 overflow-y-auto px-4 py-4 pb-24 print:hidden">
        <!-- Loading skeleton -->
        <div v-if="isLoading && !history.length" class="space-y-2">
          <div v-for="n in 4" :key="n" class="px-3 py-3 space-y-2">
            <GSkeleton class="h-2 w-16 rounded-full" />
            <GSkeleton class="h-4 w-3/4 rounded" />
            <GSkeleton class="h-4 w-1/2 rounded" />
          </div>
        </div>

        <div v-else class="space-y-1">
          <div
            v-for="(item, idx) in history"
            :key="item.id"
            class="w-full text-left px-3 py-3 rounded-xl transition-all"
            :class="[
              announcement.active && announcement.text === item.text
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
              <span v-if="announcement.active && announcement.text === item.text"
                    class="text-[8px] font-black text-blue-600 uppercase tracking-[0.2em] bg-blue-100 px-1.5 py-0.5 rounded">
                Ahora
              </span>
            </div>
            <div class="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <template v-for="(segment, idx) in parseHTML(item.text)" :key="idx">
                <Icon
                  v-if="segment.type === 'icon'"
                  :name="segment.value"
                  :class="segment.class"
                  class="size-4 mb-0.5"
                />
                <span
                  v-else
                  v-html="segment.value"
                  :class="segment.class"
                  class="text-sm font-semibold leading-snug"
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

    <!-- Right Panel: Live Transcription -->
    <aside
      v-if="showTranscription"
      class="hidden lg:flex flex-col h-full w-[480px] bg-black text-white relative overflow-hidden shrink-0"
    >
      <div class="p-10 pb-0">
        <div class="flex items-center gap-4 mb-6">
          <div class="relative flex size-3">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                  :class="transcription.active ? 'bg-red-400' : 'bg-blue-400'"></span>
            <span class="relative inline-flex rounded-full size-3"
                  :class="transcription.active ? 'bg-red-500' : 'bg-blue-500'"></span>
          </div>
          <h2 class="text-xs font-black uppercase tracking-[0.4em] text-white/40">Traducción en vivo</h2>
        </div>
      </div>

      <div
        ref="desktopScrollContainer"
        @scroll="handleScroll"
        class="flex-1 overflow-y-auto px-10 pb-10 space-y-8"
      >
        <div class="space-y-4">
          <div v-if="transcriptionHistory" class="flex flex-col gap-y-6">
             <h3 class="text-xs font-black uppercase tracking-[0.3em] text-white/20">Registro Anterior</h3>
             <p
               v-for="(p, i) in transcriptionHistory.split('\n').filter(p => p.trim())"
               :key="i"
               class="text-xl sm:text-2xl font-normal text-white/70 leading-relaxed"
             >
                {{ p }}
             </p>
          </div>

          <div class="prose prose-invert max-w-none">
             <TransitionGroup
               name="word-stream"
               tag="p"
               class="text-xl sm:text-2xl leading-relaxed tracking-tight flex flex-wrap gap-x-3 gap-y-2 text-white opacity-100"
             >
                <span v-for="word in interimWords" :key="word.id" class="transition-colors">
                   {{ word.text }}
                </span>
             </TransitionGroup>
          </div>

          <div v-if="!transcription.final && !transcription.interim" class="py-16 text-center border border-dashed border-white/10 rounded-3xl">
            <Icon name="tabler:ear" class="size-10 text-white/5 mx-auto mb-3" />
            <p class="text-[10px] font-bold text-white/20 uppercase tracking-widest italic">Silencio detectado</p>
          </div>
        </div>
      </div>

      <Transition
        enter-active-class="transition duration-300 ease-out"
        enter-from-class="translate-y-4 opacity-0 scale-90"
        enter-to-class="translate-y-0 opacity-100 scale-100"
        leave-active-class="transition duration-200 ease-in"
        leave-from-class="translate-y-0 opacity-100 scale-100"
        leave-to-class="translate-y-4 opacity-0 scale-90"
      >
        <button
          v-if="!autoScrollEnabled"
          @click="scrollToBottom"
          class="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest shadow-2xl hover:scale-110 active:scale-95 transition-all z-20 border border-blue-400/30"
        >
          <Icon name="tabler:arrow-down" class="size-4" />
          <span>Volver abajo</span>
        </button>
      </Transition>
    </aside>

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
          <div class="bg-black/95 backdrop-blur-md border-t border-white/10 px-5 h-20 flex flex-col justify-center shadow-[0_-4px_20px_rgba(0,0,0,0.3)] overflow-hidden">
             <div class="flex items-center gap-3">
                <div class="relative flex size-2">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                        :class="transcription.active ? 'bg-red-400' : 'bg-blue-400'"></span>
                  <span class="relative inline-flex rounded-full size-2"
                        :class="transcription.active ? 'bg-red-500' : 'bg-blue-500'"></span>
                </div>
                <span class="text-[10px] font-black uppercase tracking-[0.4em] text-white/50">
                  Transcripción automática
                </span>
                <div class="h-px flex-1 bg-white/5"></div>
                <button @click.stop="showMonitor = false; manuallyHidden = true" class="p-1 -mr-1 text-white/30 hover:text-white/70 transition-colors">
                  <Icon name="tabler:x" class="size-3.5" />
                </button>
                <Icon name="tabler:chevron-up" class="size-4 text-white/20" />
             </div>
             <div
               ref="scrollContainer"
               class="overflow-y-auto"
               style="scrollbar-width: none; -ms-overflow-style: none;"
             >
               <TransitionGroup
                 name="word-stream-mini"
                 tag="p"
                 class="text-base leading-tight tracking-tight flex flex-wrap gap-x-1.5 text-white opacity-100"
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
          class="fixed inset-0 z-[60] bg-black lg:hidden flex flex-col p-8 pb-12"
        >
           <header class="flex items-center justify-between mb-8">
              <div class="flex items-center gap-3">
                <div class="relative flex size-2">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                        :class="transcription.active ? 'bg-red-400' : 'bg-blue-400'"></span>
                  <span class="relative inline-flex rounded-full size-2"
                        :class="transcription.active ? 'bg-red-500' : 'bg-blue-500'"></span>
                </div>
                <h2 class="text-xs font-black uppercase tracking-[0.4em] text-white/40">Traducción en vivo</h2>
              </div>
              <button @click="isMobileExpanded = false; showMonitor = false; manuallyHidden = true" class="p-2 -mr-2 text-white/40 hover:text-white">
                <Icon name="tabler:x" class="size-6" />
              </button>
           </header>

           <div
             ref="mobileScrollContainer"
             @scroll="handleMobileScroll"
             class="flex-1 overflow-y-auto space-y-8 pr-2"
           >
               <div v-if="transcriptionHistory" class="flex flex-col gap-y-6">
                  <h3 class="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Registro Anterior</h3>
                  <p
                    v-for="(p, i) in transcriptionHistory.split('\n').filter(p => p.trim())"
                    :key="i"
                    class="text-2xl sm:text-4xl font-normal text-white/70 leading-relaxed"
                  >
                     {{ p }}
                  </p>
               </div>

               <div class="prose prose-invert max-w-none">
                  <TransitionGroup name="word-stream" tag="p" class="text-2xl sm:text-4xl leading-none tracking-tight flex flex-wrap gap-x-3 gap-y-2 text-white opacity-100">
                    <span v-for="word in interimWords" :key="word.id" class="transition-colors">
                       {{ word.text }}
                    </span>
                 </TransitionGroup>
              </div>
           </div>

           <Transition
              enter-active-class="transition duration-300 ease-out"
              enter-from-class="translate-y-2 opacity-0"
              enter-to-class="translate-y-0 opacity-100"
              leave-active-class="transition duration-200 ease-in"
              leave-from-class="translate-y-0 opacity-100"
              leave-to-class="translate-y-2 opacity-0"
            >
              <button
                v-if="!mobileAutoScrollEnabled"
                @click="scrollMobileToBottom"
                class="fixed bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg z-20"
              >
                <Icon name="tabler:arrow-down" class="size-3.5" />
                <span>Volver abajo</span>
              </button>
            </Transition>
        </div>
      </Transition>
    </Teleport>

    <!-- Print: full history list -->
    <div class="hidden print:block print:absolute print:inset-0 print:bg-white print:p-8">
      <h1 class="text-3xl font-black uppercase mb-8">{{ displayTopic }}</h1>
      <div class="space-y-8">
        <div v-for="item in history" :key="item.id" class="border-b border-neutral-100 pb-6">
          <div class="flex items-center gap-3 mb-3">
            <span class="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
              {{ formatTimeAgo(new Date(item.createdAt)) }}
            </span>
            <span class="hidden print:block text-[10px] text-neutral-300 font-mono">
              {{ new Date(item.createdAt).toLocaleString() }}
            </span>
          </div>
          <div class="text-xl font-bold leading-relaxed">
            <div class="inline-flex flex-wrap items-center gap-x-2">
              <template v-for="(segment, idx) in parseHTML(item.text)" :key="idx">
                <Icon v-if="segment.type === 'icon'" :name="segment.value" :class="segment.class" class="mb-1" />
                <span v-else v-html="segment.value" :class="segment.class"></span>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');

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
  @page { margin: 2cm; }
  body { background: white !important; }
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
