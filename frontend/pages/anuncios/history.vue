<script setup lang="ts">
import { toast } from 'vue-sonner'

definePageMeta({
  layout: 'empty'
})

const { getAnnouncements, clientId } = useApi()
const { 
  announcement, 
  transcription,
  lastAnnouncementUpdate,
  connect, 
  disconnect, 
  sendWebRTCOffer, 
  sendWebRTCAnswer, 
  sendWebRTCCandidate, 
  sendWebRTCRequest, 
  onWebRTCOffer, 
  onWebRTCAnswer, 
  onWebRTCCandidate, 
    onWebRTCRequest,
    connectionId
  } = useRealtime()
const { parseHTML: originalParseHTML } = useContentParser()

// Memoize HTML parsing to avoid heavy template work
const parseCache = new Map<string, any[]>()
const parseHTML = (text: string) => {
  if (!text) return []
  if (parseCache.has(text)) return parseCache.get(text)!
  const result = originalParseHTML(text)
  parseCache.set(text, result)
  // Limit cache size
  if (parseCache.size > 100) parseCache.delete(parseCache.keys().next().value)
  return result
}

const route = useRoute()

/** Por defecto el audio remoto está silenciado; use ?audio=true en la URL para escuchar el micrófono del transmitter. */
const playRemoteRtcAudio = computed(() => {
  const v = route.query.audio
  const s = Array.isArray(v) ? v[0] : v
  return s === 'true' || s === '1'
})

const videoRTC = ref(false)
const videoElement = ref<HTMLVideoElement | null>(null)
const videoElementBg = ref<HTMLVideoElement | null>(null)
const pc = shallowRef<RTCPeerConnection | null>(null)
const remoteStream = shallowRef<MediaStream | null>(null)
const iceQueue = ref<any[]>([])
const history = shallowRef<any[]>([])
const isLoading = ref(true)
const scrollContainer = ref<HTMLElement | null>(null)
const desktopScrollContainer = ref<HTMLElement | null>(null)
const mobileScrollContainer = ref<HTMLElement | null>(null)
const showMonitor = ref(false)
const isMobileExpanded = ref(false)
const hideTimeout = ref<NodeJS.Timeout|null>(null)
const transcriptionHistory = computed(() => transcription.value.final)
const autoScrollEnabled = ref(true)
const isAutoScrolling = ref(false)

const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle' as RTCBundlePolicy
}

const addLog = (msg: string) => {
  console.log(`[WebRTC] ${msg}`)
}

/** Tras 1 min sin nuevo anuncio, el vídeo llena la columna izquierda bajo el encabezado. */
const leftColumnVideoFullscreen = ref(false)

let idleTimer: ReturnType<typeof setTimeout> | null = null

const ANNOUNCEMENT_IDLE_MS = 60_000

/** Reinicia el contador de inactividad basándose en el timestamp del último anuncio. */
const resetIdleTimer = () => {
  if (idleTimer) clearTimeout(idleTimer)
  
  const at = lastAnnouncementUpdate.value
  const hasVideo = videoRTC.value
  
  addLog(`Checking idle timer: at=${at}, video=${hasVideo}`)

  if (at <= 0 || !hasVideo) {
    leftColumnVideoFullscreen.value = false
    return
  }

  const elapsed = Date.now() - at
  const remaining = ANNOUNCEMENT_IDLE_MS - elapsed

  if (remaining <= 0) {
    addLog('Idle threshold reached, setting fullscreen')
    leftColumnVideoFullscreen.value = true
  } else {
    addLog(`Still active, waiting ${remaining}ms`)
    leftColumnVideoFullscreen.value = false
    idleTimer = setTimeout(() => {
      if (videoRTC.value) {
        addLog('Idle timer fired, setting fullscreen')
        leftColumnVideoFullscreen.value = true
      }
    }, remaining)
  }
}

const handleScroll = () => {
    if (!desktopScrollContainer.value || isAutoScrolling.value) return
    const { scrollTop, scrollHeight, clientHeight } = desktopScrollContainer.value
    // If we are within 100px of bottom, consider it "at bottom"
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
            // Reset the flag after animation would roughly finish
            setTimeout(() => {
                isAutoScrolling.value = false
            }, 600)
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
    mobileAutoScrollEnabled.value = true
    isMobileAutoScrolling.value = true
    nextTick(() => {
        if (mobileScrollContainer.value) {
            mobileScrollContainer.value.scrollTo({
                top: mobileScrollContainer.value.scrollHeight,
                behavior: 'smooth'
            })
            setTimeout(() => {
                isMobileAutoScrolling.value = false
            }, 600)
        }
    })
}

// Words only for the interim stream
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
    // Strip HTML tags for clean text copying
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

const processIceQueue = () => {
  if (!pc.value || !pc.value.remoteDescription) return
  while (iceQueue.value.length > 0) {
    const candidate = iceQueue.value.shift()
    pc.value.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => {
      console.warn('[WebRTC] Error processing queued candidate', e)
    })
  }
}

const initReceiver = async (offer: any, broadcasterId: string) => {
  // If we are already negotiating or connected, and the state is not stable, ignore new offers
  // to avoid the "Called in wrong state" error.
  if (pc.value && pc.value.signalingState !== 'stable') {
    return
  }

  addLog(`Oferta recibida de ${broadcasterId}, iniciando receptor...`)
  if (pc.value) {
    pc.value.close()
  }

  pc.value = new RTCPeerConnection(rtcConfig)
  addLog('RTCPeerConnection creada')

  pc.value.onicecandidate = (event) => {
    if (event.candidate) {
      addLog('Candidato ICE generado')
      sendWebRTCCandidate(event.candidate, broadcasterId)
    }
  }

  pc.value.ontrack = (event) => {
    addLog(event.track.kind === 'audio' ? 'Track de audio recibido' : 'Track de video recibido')
    remoteStream.value = event.streams[0]
    videoRTC.value = true
    
    // Apply jitter buffer hint (mini-buffer)
    if ('playoutDelayHint' in event.receiver) {
      try {
        (event.receiver as any).playoutDelayHint = 0.5 // 500ms delay hint
        addLog(`Playout delay hint set for ${event.track.kind}`)
      } catch (e) {
        console.warn('Failed to set playoutDelayHint', e)
      }
    }
  }

  const needsInteraction = ref(false)

  const startVideoManually = () => {
    needsInteraction.value = false
    if (videoElement.value) videoElement.value.play().catch(() => {})
    if (videoElementBg.value) videoElementBg.value.play().catch(() => {})
  }

  const assignStream = () => {
    const stream = remoteStream.value
    if (!stream) return
    
    if (videoElement.value && videoElement.value.srcObject !== stream) {
      addLog('Asignando stream a video principal')
      videoElement.value.srcObject = stream
      videoElement.value.play().catch(e => {
        addLog(`Play principal blocked: ${e.message}`)
        needsInteraction.value = true
      })
    }
    if (videoElementBg.value && videoElementBg.value.srcObject !== stream) {
      addLog('Asignando stream a video background')
      videoElementBg.value.srcObject = stream
      videoElementBg.value.play().catch(e => addLog(`Play background blocked: ${e.message}`))
    }
  }

  watch([remoteStream, videoElement, videoElementBg], () => {
    nextTick(assignStream)
  })

  try {
    await pc.value.setRemoteDescription(new RTCSessionDescription(offer))
    addLog('Descripción remota establecida')
    
    // Procesar candidatos en cola
    processIceQueue()

    const answer = await pc.value.createAnswer()
    addLog('Respuesta WebRTC creada')
    await pc.value.setLocalDescription(answer)
    sendWebRTCAnswer(answer, broadcasterId)
    addLog('Respuesta enviada vía Socket')
  } catch (e: any) {
    addLog(`Error en receiver: ${e.message}`)
    console.error('[WebRTC] Receiver error:', e)
  }
}

onMounted(() => {
  connect()
  fetchHistory()

  // Arrancar idle timer si ya hay un anuncio previo
  if (lastAnnouncementUpdate.value > 0) resetIdleTimer()

  onWebRTCOffer.value = ({ data: offer, from }) => {
    initReceiver(offer, from)
  }

  onWebRTCCandidate.value = ({ data: candidate, from }) => {
    if (pc.value && pc.value.remoteDescription && candidate) {
      pc.value.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => {
        console.error('[WebRTC] Error adding ice candidate:', e)
      })
    } else if (candidate) {
      iceQueue.value.push(candidate)
    }
  }
  
  // history.vue doesn't need onWebRTCAnswer, as it is the one sending the answers

  // Request stream if someone is already producing
  setTimeout(() => {
    addLog('Enviando petición de stream...')
    sendWebRTCRequest()
  }, 1500)
  
  // Retry once more just in case
  setTimeout(() => {
    if (!videoRTC.value) {
       addLog('Re-intentando petición de stream...')
       sendWebRTCRequest()
    }
  }, 4000)
})

// Al recibir un anuncio nuevo: volver a vista partida y reiniciar cuenta regresiva
watch(lastAnnouncementUpdate, (next, prev) => {
  if (next <= 0) return
  resetIdleTimer()
  fetchHistory() // Refresh history when new announcement arrives
})

// Auto-scroll transcription monitor & auto-hide logic
watch([() => transcription.value.final, () => transcription.value.interim], ([newFinal, newInterim]) => {
    // Show monitor when text is arriving
    if (newFinal || newInterim) {
        showMonitor.value = true
        
        // Reset hide timeout
        if (hideTimeout.value) clearTimeout(hideTimeout.value)
        if (!isMobileExpanded.value) {
            hideTimeout.value = setTimeout(() => {
                showMonitor.value = false
            }, 5000)
        }
    }

    nextTick(() => {
        if (scrollContainer.value) {
            scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
        }
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
        // Resume hide timeout when closing
        if (hideTimeout.value) clearTimeout(hideTimeout.value)
        hideTimeout.value = setTimeout(() => {
            showMonitor.value = false
        }, 5000)
    } else {
        // Ensure monitor stays visible while expanded
        if (hideTimeout.value) clearTimeout(hideTimeout.value)
        showMonitor.value = true
    }
})

onUnmounted(() => {
  if (idleTimer) clearTimeout(idleTimer)
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

// Compute current topic title
const displayTopic = computed(() => {
    if (announcement.value.active && announcement.value.topic) {
        return announcement.value.topic
    }
    
    // Find the latest historical item that has a topic
    const latestWithTopic = history.value.find(item => item.topic)
    return latestWithTopic?.topic || 'Historial'
})


watch(videoRTC, (on) => {
  if (!on) {
    leftColumnVideoFullscreen.value = false
    if (idleTimer) clearTimeout(idleTimer)
  } else if (lastAnnouncementUpdate.value > 0) {
    // Video conectado con anuncio previo → arrancar timer
    resetIdleTimer()
  }
})

const leftHistoryAreaClass = computed(() => {
  const base =
    'flex-1 min-h-0 overflow-y-auto scroll-smooth group/container transition-all duration-700 ease-in-out print:!flex-auto print:!max-h-none print:!opacity-100 print:!overflow-y-auto print:!pointer-events-auto will-change-[height,opacity]'
  return base
})

/** Padding inferior para que el contenido no quede tapado por el video parcial */
const leftHistoryStyle = computed(() => {
  if (!videoRTC.value || leftColumnVideoFullscreen.value) return {}
  return { paddingBottom: '35vh' }
})

/** Video siempre bottom-0; height anima entre 35 vh y 100% */
const leftVideoAreaClass = computed(() => {
  const base = 'bg-black overflow-hidden bottom-0 left-0 right-0 z-30 transition-[height,opacity] duration-700 ease-in-out will-change-[height,opacity]'
  // En mobile usamos fixed para asegurar que se vea sobre todo el viewport
  return `${base} fixed lg:absolute`
})

const leftVideoStyle = computed(() => ({
  height: leftColumnVideoFullscreen.value ? '100%' : '35vh'
}))

const generatePdf = () => {
  window.print()
}
</script>

<template>
  <div class="h-svh lg:grid lg:grid-cols-2 overflow-hidden bg-white text-neutral-900 font-sans print:bg-white print:p-0">
    <!-- Left Column: Announcements + Video -->
    <div class="flex flex-col h-svh lg:h-full min-h-0 bg-white overflow-hidden relative">
      <!-- Fixed Header -->
      <div class="bg-white px-6 pt-12 sm:pt-20 pb-8 border-b border-neutral-50 z-10">
        <div class="max-w-2xl mx-auto">
          <header class="space-y-6">
            <h1 class="text-3xl sm:text-4xl font-black tracking-tight text-neutral-900 uppercase leading-tight">
                {{ displayTopic }}
            </h1>
            
            <div class="flex items-center gap-3 print:hidden">
              <button 
                @click="generatePdf"
                class="flex items-center gap-2 text-neutral-400 hover:text-neutral-900 text-[10px] font-bold uppercase tracking-widest border border-neutral-200 px-4 py-2 rounded-full hover:bg-neutral-50 shadow-sm hover:shadow-md active:scale-95 transition-all w-fit"
              >
                <Icon name="tabler:file-type-pdf" class="size-4" />
                <span>Exportar PDF</span>
              </button>

              <div v-if="announcement.active" class="flex items-center gap-1.5 bg-blue-50 text-blue-600 px-2 py-1 rounded-md border border-blue-100 animate-pulse">
                <div class="size-1.5 bg-blue-600 rounded-full"></div>
                <span class="text-[9px] font-black uppercase tracking-wider">En vivo</span>
              </div>
            </div>
          </header>
        </div>
      </div>

      <div class="flex flex-col flex-1 min-h-0">
        <!-- Announcements History (Scrollable) -->
        <div :class="leftHistoryAreaClass" :style="leftHistoryStyle">
          <div class="max-w-2xl mx-auto px-6 py-12 print:py-12">
        
        <div class="relative">
          <!-- Vertical Timeline Line -->
          <div class="absolute left-0 top-0 bottom-0 w-px bg-neutral-100 ml-4 sm:ml-0 overflow-hidden print:hidden"></div>

          <TransitionGroup name="list" tag="div" class="space-y-16 relative">
            <div 
                v-for="item in history" 
                :key="item.id"
                class="relative pl-10 sm:pl-12 group/item"
            >
                <!-- Timeline Dot -->
                <div 
                  class="absolute left-[15.5px] sm:left-[-4.5px] top-3 size-2 rounded-full border-2 transition-all duration-500 z-10"
                  :class="[
                    announcement.active && announcement.text === item.text 
                    ? 'bg-blue-600 border-blue-600 scale-125 shadow-[0_0_10px_rgba(37,99,235,0.3)]' 
                    : 'bg-white border-neutral-200 group-hover/item:border-neutral-400'
                  ]"
                ></div>

                <div 
                  class="transition-all duration-500"
                >
                    <div class="flex items-center justify-between mb-4">
                        <div class="flex items-center gap-3">
                          <span class="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                              {{ formatTimeAgo(new Date(item.createdAt)) }}
                          </span>
                          <span v-if="announcement.active && announcement.text === item.text" 
                                class="text-[9px] font-black text-blue-600 uppercase tracking-[0.2em] bg-blue-50 px-2 py-0.5 rounded">
                            Ahora
                          </span>
                        </div>
                        
                        <button 
                          @click="copyToClipboard(item.text)"
                          class="p-1.5 text-neutral-400 hover:text-neutral-900 transition-all print:hidden"
                          title="Copiar texto"
                        >
                          <Icon name="tabler:copy" class="size-4" />
                        </button>
                    </div>
                    
                    <div 
                        class="text-2xl sm:text-3xl font-black leading-tight transition-colors duration-500"
                        :class="announcement.active && announcement.text === item.text ? 'text-neutral-900' : 'text-neutral-700'"
                    >
                        <div class="inline-flex flex-wrap items-center gap-x-2">
                            <template v-for="(segment, idx) in parseHTML(item.text)" :key="idx">
                                <Icon 
                                    v-if="segment.type === 'icon'" 
                                    :name="segment.value" 
                                    :class="segment.class"
                                    class="mb-1"
                                />
                                <span 
                                    v-else 
                                    v-html="segment.value" 
                                    :class="segment.class"
                                ></span>
                            </template>
                        </div>
                    </div>

                    <div class="hidden print:block text-[10px] text-neutral-300 mt-2 font-mono">
                      {{ new Date(item.createdAt).toLocaleString() }}
                    </div>
                </div>
            </div>
          </TransitionGroup>
        </div>

        <div v-if="isLoading && !history.length" class="text-center py-20 text-neutral-400 animate-pulse">
            Sincronizando historial...
        </div>

        <div v-else-if="!history.length" class="text-center py-32">
            <div class="size-16 bg-neutral-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <Icon name="tabler:hourglass-empty" class="size-8 text-neutral-200" />
            </div>
            <p class="text-[10px] font-black text-neutral-300 uppercase tracking-[0.3em]">Sin registros recientes</p>
        </div>
          </div>
        </div>

        <!-- Video (llena la columna si 1 min sin nuevo anuncio; altura anima) -->
        <Transition
          enter-active-class="transition-[height,opacity] duration-700 ease-out"
          enter-from-class="opacity-0"
          enter-to-class="opacity-100"
          leave-active-class="transition-[height,opacity] duration-500 ease-in"
          leave-from-class="opacity-100"
          leave-to-class="opacity-0"
        >
          <div 
            v-if="videoRTC" 
            :class="leftVideoAreaClass"
            :style="leftVideoStyle"
          >
             <!-- Background Blur Video -->
             <video
               ref="videoElementBg"
               autoplay
               playsinline
               muted
               class="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-30"
             ></video>

             <!-- Main Video -->
             <video
               ref="videoElement"
               autoplay
               playsinline
               :muted="!playRemoteRtcAudio"
               class="absolute inset-0 w-full h-full object-contain z-10"
             ></video>

             <!-- Play Button Overlay (for blocked autoplay) -->
             <Transition
               enter-active-class="transition duration-300 ease-out"
               enter-from-class="opacity-0 scale-95"
               enter-to-class="opacity-100 scale-100"
               leave-active-class="transition duration-200 ease-in"
               leave-from-class="opacity-100 scale-100"
               leave-to-class="opacity-0 scale-95"
             >
               <div 
                 v-if="needsInteraction"
                 class="absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-sm"
               >
                  <button 
                    @click="startVideoManually"
                    class="group flex flex-col items-center gap-4 active:scale-95 transition-transform"
                  >
                     <div class="size-20 bg-white rounded-full flex items-center justify-center shadow-2xl group-hover:bg-blue-600 transition-all">
                        <Icon name="tabler:play-filled" class="size-10 text-black group-hover:text-white transition-colors ml-1" />
                     </div>
                     <span class="text-white text-[10px] font-black uppercase tracking-[0.3em] drop-shadow-lg">Activar Transmisión</span>
                  </button>
               </div>
             </Transition>
          </div>
        </Transition>
      </div>
    </div>

    <!-- Right Panel: Live Transcription (Full Height) -->
    <aside 
      class="hidden lg:flex flex-col h-full bg-black text-white relative overflow-hidden"
    >
      <!-- Static Header Area -->
      <div class="p-12 pb-0">
        <div class="flex items-center gap-4 mb-8">
          <div class="relative flex size-3">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                  :class="transcription.active ? 'bg-red-400' : 'bg-blue-400'"></span>
            <span class="relative inline-flex rounded-full size-3"
                  :class="transcription.active ? 'bg-red-500' : 'bg-blue-500'"></span>
          </div>
          <div class="flex flex-col">
            <h2 class="text-xs font-black uppercase tracking-[0.4em] text-white/40">Traducción en vivo</h2>
          </div>
        </div>
      </div>

      <!-- Scrollable area -->
      <div 
        ref="desktopScrollContainer"
        @scroll="handleScroll"
        class="flex-1 overflow-y-auto px-12 pb-12 space-y-8"
      >
        <div class="space-y-4">
          <div v-if="transcriptionHistory" class="flex flex-col gap-y-6">
             <h3 class="text-xs font-black uppercase tracking-[0.3em] text-white/20">
                Registro Anterior
             </h3>
             <p 
               v-for="(p, i) in transcriptionHistory.split('\n').filter(p => p.trim())" 
               :key="i"
               class="text-2xl sm:text-4xl font-normal text-white/70 leading-relaxed"
             >
                {{ p }}
             </p>
          </div>

          <!-- Live Partial Stream -->
          <div class="prose prose-invert max-w-none">
             <TransitionGroup 
               name="word-stream" 
               tag="p" 
               class="text-2xl sm:text-4xl leading-relaxed tracking-tight flex flex-wrap gap-x-3 gap-y-2 text-white opacity-100"
             >
                <span 
                   v-for="word in interimWords" 
                   :key="word.id"
                   class="transition-colors"
                >
                   {{ word.text }}
                </span>
             </TransitionGroup>
          </div>
          
          <div v-if="!transcription.final && !transcription.interim" class="py-20 text-center border border-dashed border-white/10 rounded-3xl">
            <Icon name="tabler:ear" class="size-12 text-white/5 mx-auto mb-4" />
            <p class="text-xs font-bold text-white/20 uppercase tracking-widest italic">Silencio detectado</p>
          </div>
        </div>
      </div>

      <!-- Floating Back to bottom button -->
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

    <!-- Mobile Floating Monitor (Hidden on Desktop) -->
    <Teleport to="body">
      <Transition 
        enter-active-class="transition duration-700 ease-out"
        enter-from-class="translate-y-24 opacity-0 scale-90"
        enter-to-class="translate-y-0 opacity-100 scale-100"
        leave-active-class="transition duration-500 ease-in"
        leave-from-class="translate-y-0 opacity-100 scale-100"
        leave-to-class="translate-y-24 opacity-0 scale-90"
      >
        <div 
          v-if="showMonitor && !isMobileExpanded"
          @click="isMobileExpanded = true"
          class="fixed bottom-10 left-1/2 -translate-x-1/2 w-full max-w-lg z-50 px-6 lg:hidden print:hidden active:scale-95 transition-transform cursor-pointer"
        >
          <div class="bg-black/90 rounded-3xl p-6 shadow-2xl">
            <div class="min-w-0">
               <div class="flex items-center gap-3 mb-3">
                  <div class="relative flex size-2">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                          :class="transcription.active ? 'bg-red-400' : 'bg-blue-400'"></span>
                    <span class="relative inline-flex rounded-full size-2"
                          :class="transcription.active ? 'bg-red-500' : 'bg-blue-500'"></span>
                  </div>
                  <span class="text-[10px] font-black uppercase tracking-[0.4em] text-white/50">
                    {{ transcription.active ? 'Live Audio' : 'Processing' }}
                  </span>
                  <div class="h-px flex-1 bg-white/5"></div>
               </div>
                 <div 
                   ref="scrollContainer"
                   class="max-h-24 overflow-y-auto pr-2"
                   style="scrollbar-width: none; -ms-overflow-style: none;"
                 >
                   <!-- Live Partial Stream (Mini) -->
                   <TransitionGroup 
                     name="word-stream-mini" 
                     tag="p" 
                     class="text-xl leading-tight tracking-tight flex flex-wrap gap-x-1.5 text-white opacity-100"
                   >
                     <span 
                       v-for="word in interimWords" 
                       :key="word.id"
                       class="transition-colors"
                     >
                       {{ word.text }}
                     </span>
                   </TransitionGroup>
                 </div>
            </div>
          </div>
        </div>
      </Transition>
      <!-- Mobile Expanded View -->
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
              
              <button 
                @click="isMobileExpanded = false"
                class="p-2 -mr-2 text-white/40 hover:text-white"
              >
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
                  <TransitionGroup 
                    name="word-stream" 
                    tag="p" 
                    class="text-2xl sm:text-4xl leading-relaxed tracking-tight flex flex-wrap gap-x-3 gap-y-2 text-white opacity-100"
                  >
                    <span 
                       v-for="word in interimWords" 
                       :key="word.id"
                       class="transition-colors"
                    >
                       {{ word.text }}
                    </span>
                 </TransitionGroup>
              </div>
           </div>

           <!-- Back to bottom mobile -->
           <Transition
              enter-active-class="transition duration-300 ease-out"
              enter-from-class="translate-y-4 opacity-0 scale-90"
              enter-to-class="translate-y-0 opacity-100 scale-100"
              leave-active-class="transition duration-200 ease-in"
              leave-from-class="translate-y-0 opacity-100 scale-100"
              leave-to-class="translate-y-4 opacity-0 scale-90"
            >
              <button
                v-if="!mobileAutoScrollEnabled"
                @click="scrollMobileToBottom"
                class="fixed bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-full text-xs font-black uppercase tracking-widest shadow-2xl z-20 border border-blue-400/30"
              >
                <Icon name="tabler:arrow-down" class="size-4" />
                <span>Volver abajo</span>
              </button>
            </Transition>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.list-move,
.list-enter-active,
.list-leave-active {
  transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.list-leave-active {
  position: absolute;
  width: 100%;
}

@media print {
  @page {
    margin: 2cm;
  }
  
  body {
    background: white !important;
  }
  
  .print\:hidden {
    display: none !important;
  }
  
  .print\:block {
    display: block !important;
  }
}

/* Streaming word animation */
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
