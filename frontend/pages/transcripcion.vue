<script setup lang="ts">
import { toast } from 'vue-sonner'
import { watchDebounced, useThrottleFn } from '@vueuse/core'

const { 
  connect, 
  updateTranscription: rawUpdateTranscription, 
  setTranscriptionProducing, 
  isConnected,
  transcription,
  connectionId
} = useRealtime()
const { clientId } = useApi()
const { confirmDialog } = useDialog()

// ponytail: cola de reenvío — los updateTranscription durante un corte WS se pierden (sendEvent los descarta)
const pendingQueue = ref<Array<{ final: string, interim: string, attempts: number }>>([])
let flushingQueue = false
const sendOrEnqueue = (payload: { final: string, interim: string }) => {
  if (!isConnected.value) {
    pendingQueue.value.push({ ...payload, attempts: 0 })
    return
  }
  try {
    rawUpdateTranscription(payload)
  } catch {
    pendingQueue.value.push({ ...payload, attempts: 0 })
  }
}
// Evitamos saturar el WebSocket enviando un máximo de ~10 mensajes por segundo
const updateTranscription = useThrottleFn(sendOrEnqueue, 100)

// Al reconectar drena en FIFO con límite de 5 intentos; si falla, queda en cola y para
watch(isConnected, (connected) => {
  if (!connected || flushingQueue || pendingQueue.value.length === 0) return
  flushingQueue = true
  try {
    while (pendingQueue.value.length > 0) {
      const head = pendingQueue.value[0]
      // ponytail: dedupe — colapsa intermedios viejos, solo importa el estado más reciente no confirmado
      const isStale = pendingQueue.value.length > 1
      const confirmed = head.final === transcription.value.final && head.interim === transcription.value.interim
      pendingQueue.value.shift()
      if (isStale || confirmed) continue
      if (head.attempts >= 5) continue
      if (!isConnected.value) {
        pendingQueue.value.unshift(head)
        break
      }
      try {
        rawUpdateTranscription({ final: head.final, interim: head.interim })
      } catch {
        pendingQueue.value.unshift({ ...head, attempts: head.attempts + 1 })
        // ponytail: backoff simple — reintenta en el próximo reconnect, no en loop
        break
      }
    }
  } finally {
    flushingQueue = false
  }
})

const isSupportedBrowser = ref(false)
const isTranscribing = ref(false)
const recognition = ref<any>(null)
const interimTranscript = ref('')
const finalTranscript = ref('')
const fullHistory = ref('') // Lo que se envía al socket (Consolidado + Párrafo Activo)
const consolidatedText = ref('') // Párrafos ya cerrados
const activeParagraphRaw = ref('') // Texto crudo del párrafo actual
const activeParagraphPunctuated = ref('') // Texto puntuado del párrafo actual
const errorCount = ref(0)
const maxErrors = 10
const isLocalProducer = ref(false)
const lastFinalTimestamp = ref(Date.now())

// F12: post-corrección determinista tras puntuación (solo reemplazo exacto)
const BIBLICAL_TERMS: Record<string, string> = {
  efesios: 'Efesios',
  habacuc: 'Habacuc',
  melquisedec: 'Melquisedec',
  deuteronomio: 'Deuteronomio',
  apocalipsis: 'Apocalipsis'
}
const applyBiblicalTerms = (text: string) => {
  let out = text
  for (const [wrong, right] of Object.entries(BIBLICAL_TERMS)) {
    out = out.replace(new RegExp(`\\b${wrong}\\b`, 'gi'), right)
  }
  return out
}

// F1/F8: líneas horneadas con timestamp (vista en vivo sin hora; export la antepone)
interface TranscriptLine { ts: number; text: string }
const transcriptLines = ref<TranscriptLine[]>([])
const persistLine = (text: string, ts: number) => {
  try {
    void useApi().post('/api/transcription/append', { clientId: clientId.value, text, ts })
  } catch {}
}
const bakeToConsolidated = (text: string) => {
  const t = text.trim()
  if (!t) return
  const ts = Date.now()
  consolidatedText.value += (consolidatedText.value ? '\n\n' : '') + t
  transcriptLines.value.push({ ts, text: t })
  persistLine(t, ts)
}

// F7: pausa (detiene recognition sin soltar ownership) + heartbeat para el timeout de 10s del backend
const paused = ref(false)
let pausedHeartbeat: ReturnType<typeof setInterval> | null = null
const startPausedHeartbeat = () => {
  stopPausedHeartbeat()
  pausedHeartbeat = setInterval(() => setTranscriptionProducing(true), 5000)
}
const stopPausedHeartbeat = () => {
  if (pausedHeartbeat) clearInterval(pausedHeartbeat)
  pausedHeartbeat = null
}

// Ownership: la auth del tenant basta, sin PIN
// Logs de diagnóstico del STT (filtra la consola por "[STT]")
const stt = (...a: any[]) => console.log(`[STT ${new Date().toISOString().slice(11, 23)}]`, ...a)
const logMicInfo = async (where: string) => {
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput')
    const sel = devs.find(d => d.deviceId === selectedMicrophoneId.value)
    const def = devs.find(d => d.deviceId === 'default')
    let perm = 'n/d'
    try { perm = (await (navigator as any).permissions.query({ name: 'microphone' })).state } catch {}
    stt(`mic [${where}]`, {
      permiso: perm,
      seleccionado: sel?.label || selectedMicrophoneId.value || '(ninguno)',
      predeterminadoDelSistema: def?.label || '(sin etiqueta)',
      totalEntradas: devs.length,
      entradas: devs.map(d => d.label || d.deviceId.slice(0, 8)),
      nota: 'SpeechRecognition usa SIEMPRE el micrófono predeterminado del sistema/navegador, no el seleccionado aquí'
    })
  } catch (e) { stt('mic: no se pudo leer dispositivos', e) }
}

const claimError = ref('')
const claimProducing = async (): Promise<boolean> => {
  claimError.value = ''
  try {
    await useApi().post('/api/transcription/claim', { clientId: clientId.value })
    stt('claim OK', { clientId: clientId.value })
    return true
  } catch (e: any) {
    const st = e?.status || e?.response?.status || e?.statusCode
    stt('claim FALLÓ', { status: st, msg: e?.message })
    claimError.value = st === 409 ? 'Otro productor activo' : 'No se pudo tomar el micrófono'
    return false
  }
}

// F3: copiar + descargar .txt (sin título, usa fecha)
const copyTranscript = async () => {
  try {
    await navigator.clipboard.writeText(fullHistory.value)
    toast.success('Copiado')
  } catch {
    toast.error('No se pudo copiar')
  }
}
const formatTs = (ts: number) => {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
const downloadTranscript = () => {
  const body = transcriptLines.value.length
    ? transcriptLines.value.map(l => `[${formatTs(l.ts)}] ${l.text}`).join('\n\n')
    : fullHistory.value
  const fecha = new Date().toISOString().slice(0, 10)
  const blob = new Blob([body], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `servicio-${fecha}.txt`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

const availableMicrophones = ref<MediaDeviceInfo[]>([])
const selectedMicrophoneId = ref<string>('')

let onDeviceInputsChanged: (() => void) | null = null

/** Safari y otros pueden bloquear getUserMedia de audio hasta gesto del usuario — reintentamos tras el primer toque/clic */
let micEnumeratePointerHooked = false
const attachMicEnumerateRetryOnFirstPointer = () => {
  if (!import.meta.client || micEnumeratePointerHooked) return
  micEnumeratePointerHooked = true
  window.addEventListener(
    'pointerdown',
    () => void getMicrophones(),
    { once: true, capture: true, passive: true }
  )
}

const dedupeDevices = (list: MediaDeviceInfo[]) => {
  const seen = new Set<string>()
  const out: MediaDeviceInfo[] = []
  for (const d of list) {
    const key =
      typeof d.deviceId === 'string' && d.deviceId.length > 0
        ? d.deviceId
        : `g:${d.groupId || '?'}:${d.kind}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(d)
  }
  return out
}

const microphoneLabelFor = (mic: MediaDeviceInfo, index: number) => {
  const raw = mic.label.trim()
  if (raw.length) return raw
  const id = mic.deviceId
  const shortId = id && id.length > 8 ? `${id.slice(0, 6)}…` : id || ''
  if (shortId) return `Entrada ${index + 1} (${shortId})`
  return `Micrófono ${index + 1}`
}

const getMicrophones = async (opts?: { skipPermissionRequest?: boolean }) => {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return

    // Nunca abrir el micrófono mientras el reconocedor está activo: le quita el audio (no-speech)
    // y al soltar las pistas dispara 'devicechange', que re-llama a esta función en bucle.
    const skip = opts?.skipPermissionRequest || isUserActive.value
    if (!skip && navigator.mediaDevices?.getUserMedia) {
      try {
        const tmp = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false
        })
        tmp.getTracks().forEach((t) => t.stop())
      } catch (e) {
        console.warn('[WebRTC] Sin permiso de micrófono; la lista puede quedar incompleta', e)
      }
    }

    const list = dedupeDevices(
      (await navigator.mediaDevices.enumerateDevices()).filter(
        (d) => d.kind === 'audioinput'
      )
    )

    availableMicrophones.value = list

    const sel = selectedMicrophoneId.value
    const selectionStillValid =
      typeof sel === 'string' &&
      sel.length > 0 &&
      list.some((m) => m.deviceId === sel)

    if (!selectionStillValid && list.length > 0) {
      selectedMicrophoneId.value = list[0].deviceId || ''
    }
  } catch (e) {
    console.error('[WebRTC] Error listing microphones:', e)
  }
}

// LEGACY: reemplazado por segmentación semántica
// const TRANSITION_WORDS = [
//   'Ahora', 'Miren', 'Escuchen', 'Pero', 'Entonces', 'Dice', 
//   'Finalmente', 'Así que', 'O sea', 'Por ejemplo', 'En fin'
// ]

const isSomeoneElseTranscribing = computed(() => transcription.value.producing && !isLocalProducer.value)

const inactivityTimer = ref<NodeJS.Timeout | null>(null)
const audioContext = shallowRef<AudioContext | null>(null)
const analyser = shallowRef<AnalyserNode | null>(null)
const microphone = shallowRef<MediaStreamAudioSourceNode | null>(null)
const vuMeterMicStream = shallowRef<MediaStream | null>(null)
const currentVolume = ref(0)
const lastActiveTime = ref(Date.now())

// Puntos para saltos de línea
const PUNCTUATION_PAUSE = 5000 
const SILENCE_THRESHOLD = 0.05 
const MAX_PARAGRAPH_LENGTH = 400 // Safety net — la segmentación semántica es el mecanismo principal
const INACTIVITY_FLUSH = 10000 

const resetInactivityTimer = () => {
  if (inactivityTimer.value) clearTimeout(inactivityTimer.value)
  if (paused.value) return // F7: INACTIVITY_FLUSH ignorado en pausa
  if (isTranscribing.value) {
    inactivityTimer.value = setTimeout(() => {
      console.log('[STT] Inactividad prolongada detectada. Cerrando párrafo...')
      commitInterim()
      if (recognition.value) {
        recognition.value.stop() 
      }
    }, INACTIVITY_FLUSH)
  }
}

const currentRawInterim = ref('')
const punctuatedInterim = ref('')
const lastPunctuatedWordCount = ref(0)
const isPunctuatingInterim = ref(false)
const isRestarting = ref(false)

// Q2: interim crudo por defecto (gris, sin red); subir a true solo si se quiere puntuar interims
const PUNCTUATE_INTERIM = false
let interimRequestId = 0 // Q2: ignora respuestas obsoletas

// Q1 delta: prefijo congelado — cada final solo re-puntúa contexto + cola nueva
const punctuatedPrefix = ref('')
const CONTEXT_WORDS = 25
const SILENCE_FLUSH_MS = 4000 // Q9
const lastWords = (text: string, n: number) => text.trim().split(/\s+/).filter(Boolean).slice(-n).join(' ')

// Q9: cierra el párrafo solo si no llegó ningún final nuevo desde que se programó
const scheduleSilenceFlush = (scheduledAt: number) => {
  setTimeout(() => {
    if (lastFinalTimestamp.value !== scheduledAt) return
    if (paused.value) return // F7: no hornear por silencio en pausa
    if (!activeParagraphPunctuated.value.trim()) return
    bakeToConsolidated(activeParagraphPunctuated.value)
    activeParagraphRaw.value = ''
    activeParagraphPunctuated.value = ''
    punctuatedPrefix.value = ''
    activeChunkGaps.value = []
    activeChunkWords.value = []
    fullHistory.value = consolidatedText.value
    finalTranscript.value = fullHistory.value
    updateTranscription({ final: finalTranscript.value, interim: interimTranscript.value })
  }, SILENCE_FLUSH_MS)
}

const commitInterim = () => {
  // Al cerrar sesión o inactividad larga, horneamos lo que quede en el buffer
  if (activeParagraphPunctuated.value.trim()) {
    const p = activeParagraphPunctuated.value.trim()
    const capitalized = p.charAt(0).toUpperCase() + p.slice(1)
    bakeToConsolidated(applyBiblicalTerms(capitalized))
    
    activeParagraphRaw.value = ''
    activeParagraphPunctuated.value = ''
    punctuatedPrefix.value = ''
    activeChunkGaps.value = []
    activeChunkWords.value = []
  }

  currentRawInterim.value = ''
  interimTranscript.value = ''
  punctuatedInterim.value = ''
  lastPunctuatedWordCount.value = 0
  
  fullHistory.value = consolidatedText.value
  finalTranscript.value = fullHistory.value
  updateTranscription({ final: finalTranscript.value, interim: '' })
}

const requestPunctuation = async (text: string) => {
  if (!text.trim()) return ''
  try {
    const data = await useApi().post<{text: string}>('/api/punctuate', { text })
    return applyBiblicalTerms(data?.text || text)
  } catch (e) {
    return applyBiblicalTerms(text)
  }
}

const requestSegmentation = async (sentences: string[], gaps?: (number | null)[]): Promise<{
  paragraphs: Array<{
    id: string
    text: string
    paragraphIndex: number
    confidenceScore: number
  }>
}> => {
  try {
    const documentId = clientId.value || 'default'
    const data = await useApi().post<any>('/api/segment', {
      sentences,
      documentId,
      gaps: gaps ?? []
    })
    return data
  } catch (e) {
    console.error('[Segment] Error:', e)
    return { paragraphs: [] }
  }
}

// Brain #6: silencio previo a cada final del párrafo activo (ts_actual - ts_anterior).
// gapsForSentences mapea cada oración al chunk que la inicia (aprox. por offset de palabras;
// puntuado vs crudo difieren levemente, pero el prior es sesgo, no regla).
const activeChunkGaps = ref<number[]>([])
const activeChunkWords = ref<number[]>([])
const gapsForSentences = (sentences: string[]): (number | null)[] => {
  const bounds: number[] = []
  let off = 0
  for (const w of activeChunkWords.value) { bounds.push(off); off += w }
  let acc = 0
  return sentences.map((s, j) => {
    const start = acc
    acc += s.split(/\s+/).filter(Boolean).length
    if (j === 0) return 0
    for (let k = bounds.length - 1; k >= 1; k--) {
      if (bounds[k] <= start + 2) return activeChunkGaps.value[k] ?? null
    }
    return null
  })
}
// Al consolidar el primer párrafo, descarta los chunks ya horneados
const dropConsumedChunks = (consumedWords: number) => {
  let rest = consumedWords
  while (activeChunkWords.value.length > 1 && rest > 0) {
    rest -= activeChunkWords.value[0]
    activeChunkWords.value.shift()
    activeChunkGaps.value.shift()
  }
}

const checkBrowser = () => {
  const ua = navigator.userAgent.toLowerCase()
  const isChrome = /chrome/.test(ua) && !/edge|opr/.test(ua)
  const isSafari = /safari/.test(ua) && !/chrome/.test(ua)
  isSupportedBrowser.value = isChrome || isSafari
}

const initRecognition = () => {
  if (!import.meta.client) return
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  
  if (!SpeechRecognition) {
    toast.error('API de voz no disponible')
    return
  }

  recognition.value = new SpeechRecognition()
  recognition.value.continuous = true
  recognition.value.interimResults = true
  recognition.value.lang = 'es-ES'

  // VAD analysis removed to avoid aggressive cut-offs
  // Using native SpeechRecognition continuous mode and a more relaxed inactivity timer instead


  const r = recognition.value
  r.onaudiostart = () => stt('audiostart: el navegador ya captura audio del micrófono')
  r.onsoundstart = () => stt('soundstart: se detectó sonido')
  r.onspeechstart = () => stt('speechstart: se detectó voz')
  r.onspeechend = () => stt('speechend')
  r.onsoundend = () => stt('soundend')
  r.onaudioend = () => stt('audioend: terminó la captura de audio')
  r.onnomatch = () => stt('nomatch: audio sin coincidencia')

  recognition.value.onstart = () => {
    stt('start (reconocimiento iniciado)', { lang: r.lang, continuous: r.continuous, interim: r.interimResults, https: window.isSecureContext, ua: navigator.userAgent })
    void logMicInfo('onstart')
    isTranscribing.value = true
    isLocalProducer.value = true
    errorCount.value = 0
    setTranscriptionProducing(true)
    resetInactivityTimer()
  }

  recognition.value.onresult = async (event: any) => {
    if (isRestarting.value) return // Ignorar resultados mientras reiniciamos
    
    resetInactivityTimer()
    {
      const last = event.results[event.results.length - 1]
      stt('result', { final: last?.isFinal, texto: last?.[0]?.transcript, confianza: last?.[0]?.confidence })
    }
    let rawInterim = ''
    let newFinal = ''
    
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        newFinal += event.results[i][0].transcript
      } else {
        rawInterim += event.results[i][0].transcript
      }
    }

    // Process Final text (Continuous refinement)
    if (newFinal) {
      const now = Date.now()
      const silenceGap = now - lastFinalTimestamp.value
      lastFinalTimestamp.value = now
      interimRequestId++ // invalida interims en vuelo

      // 1. Acumulamos en el párrafo activo
      const trimmedNew = newFinal.trim()
      activeParagraphRaw.value += (activeParagraphRaw.value ? ' ' : '') + trimmedNew
      activeChunkGaps.value.push(silenceGap)
      activeChunkWords.value.push(trimmedNew.split(/\s+/).filter(Boolean).length)

      // 2. Q1 delta: puntuar solo contexto (~25 palabras) + cola nueva, no todo el párrafo
      const frozenPrefix = punctuatedPrefix.value
      const contextTail = lastWords(frozenPrefix, CONTEXT_WORDS)
      const contextCount = contextTail ? contextTail.split(/\s+/).filter(Boolean).length : 0
      const windowRaw = (contextTail ? contextTail + ' ' : '') + trimmedNew
      const rawSnapshot = activeParagraphRaw.value
      requestPunctuation(windowRaw).then(pWindow => {
        if (rawSnapshot !== activeParagraphRaw.value) return

        // La ventana devuelve contexto+cola; la cola son las palabras extra.
        // Si falla, el fallback de requestPunctuation devuelve windowRaw en crudo → cola cruda como hoy.
        const pWords = pWindow.trim().split(/\s+/).filter(Boolean)
        let tail = pWords.length > contextCount ? pWords.slice(contextCount).join(' ') : trimmedNew
        if (!tail) tail = trimmedNew

        // Q1 costura: si el prefijo terminaba en punto pero el modelo ya no lo puntúa así, recortarlo
        let prefix = frozenPrefix
        const contextReturned = contextCount ? pWords.slice(0, contextCount).join(' ') : ''
        if (/[.!?]$/.test(prefix.trim()) && contextReturned && !/[.!?]$/.test(contextReturned.trim())) {
          prefix = prefix.trim().replace(/[.!?]+$/, '')
        }

        let processed = ((prefix ? prefix + ' ' : '') + tail).trim()
        processed = processed.replace(/([.!?]\s+)([a-z])/g, (match, p1, p2) => p1 + p2.toUpperCase())
        processed = processed.charAt(0).toUpperCase() + processed.slice(1)
        processed = applyBiblicalTerms(processed)

        punctuatedPrefix.value = processed
        activeParagraphPunctuated.value = processed
        
        // 3. Segmentación Semántica (nuevo pipeline)
        const sentences = activeParagraphPunctuated.value
          .split(/(?<=[.!?])\s+/)
          .map(s => s.trim())
          .filter(Boolean)

        // Solo segmentar cuando hay suficientes oraciones para formar ventanas
        if (sentences.length >= 3) {
          // Llamada asíncrona al pipeline — no bloquea el display
          const gaps = gapsForSentences(sentences)
          requestSegmentation(sentences, gaps).then(result => {
            if (result.paragraphs.length > 1) {
              // Hay un punto de corte: el primer párrafo se consolida, el resto sigue activo
              const firstParagraph = result.paragraphs[0]
              const remainingParagraphs = result.paragraphs.slice(1)

              bakeToConsolidated(firstParagraph.text)
              dropConsumedChunks(firstParagraph.text.split(/\s+/).filter(Boolean).length)
              
              // El último párrafo incompleto sigue como activo
              const lastParagraph = remainingParagraphs[remainingParagraphs.length - 1]
              activeParagraphRaw.value = lastParagraph.text
              activeParagraphPunctuated.value = lastParagraph.text
              punctuatedPrefix.value = lastParagraph.text
            }
            // Si solo hay 1 párrafo → MERGE, no hacer nada
          })
        }

        // 4. Fallback: salto por silencio prolongado o largo extremo (mantener como safety net)
        const isVeryLong = activeParagraphPunctuated.value.length > 250
        const endsInDot = /[.!?]$/.test(activeParagraphPunctuated.value)
        const isVeryLongPause = silenceGap > SILENCE_FLUSH_MS

        if ((isVeryLong && endsInDot) || isVeryLongPause) {
          bakeToConsolidated(activeParagraphPunctuated.value)
          activeParagraphRaw.value = ''
          activeParagraphPunctuated.value = ''
          punctuatedPrefix.value = ''
          activeChunkGaps.value = []
          activeChunkWords.value = []
        }

        // 5. Actualizar el estado global
        const currentActive = activeParagraphPunctuated.value
        fullHistory.value = consolidatedText.value + (consolidatedText.value && currentActive ? '\n\n' : '') + currentActive
        finalTranscript.value = fullHistory.value
        updateTranscription({ final: finalTranscript.value, interim: interimTranscript.value })

        // Q9: programa flush por silencio validado contra timestamp (no ciego)
        scheduleSilenceFlush(now)
      })

      // Reset interim tracking
      punctuatedInterim.value = ''
      lastPunctuatedWordCount.value = 0
      currentRawInterim.value = ''
      interimTranscript.value = ''
    }

    // Process Interim text smoothly
    if (rawInterim) {
      currentRawInterim.value = rawInterim
      
      const rawWords = rawInterim.trim().split(/\s+/).filter(Boolean)
      
      // Construct the display string (Punctuated base + fresh raw words)
      let displayInterim = rawInterim
      if (punctuatedInterim.value) {
        const pWords = punctuatedInterim.value.trim().split(/\s+/).filter(Boolean)
        const newRawWords = rawWords.slice(lastPunctuatedWordCount.value)
        displayInterim = [...pWords, ...newRawWords].join(' ')
      }
      
      interimTranscript.value = displayInterim
      updateTranscription({ final: finalTranscript.value, interim: displayInterim })
    }
  }

  // Q2: interim crudo por defecto (sin red); solo puntúa si PUNCTUATE_INTERIM=true
  watchDebounced(currentRawInterim, (newVal) => {
    if (!PUNCTUATE_INTERIM) return
    if (!newVal.trim() || isPunctuatingInterim.value) return
    
    const rawWords = newVal.trim().split(/\s+/).filter(Boolean)
    const wordCount = rawWords.length
    
    // Trigger punctuation if word count has changed
    if (wordCount > lastPunctuatedWordCount.value) {
      isPunctuatingInterim.value = true
      const countAtRequest = wordCount
      const myId = ++interimRequestId

      requestPunctuation(newVal).then(punctuated => {
        if (myId !== interimRequestId) return // Q2: ignora respuestas obsoletas
        punctuatedInterim.value = punctuated
        lastPunctuatedWordCount.value = countAtRequest
        isPunctuatingInterim.value = false
        
        // Re-sync display instantly with any new words spoken during the network request
        const latestRawWords = currentRawInterim.value.trim().split(/\s+/).filter(Boolean)
        const latestPWords = punctuated.trim().split(/\s+/).filter(Boolean)
        const trailingRaw = latestRawWords.slice(countAtRequest)
        const newDisplay = [...latestPWords, ...trailingRaw].join(' ')
        
        interimTranscript.value = newDisplay
        updateTranscription({ final: finalTranscript.value, interim: newDisplay })
      })
    }
  }, { debounce: 900 })

  recognition.value.onerror = (event: any) => {
    console.error('[STT] Error:', event.error, { message: event.message, estado: { activo: isUserActive.value, pausa: paused.value, errores: errorCount.value } })
    if (paused.value) return // F7: en pausa no soltar ownership ni reintentar
    // no-speech/aborted son normales: onend reinicia solo si el usuario sigue activo
    if (event.error === 'no-speech' || event.error === 'aborted') return
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'audio-capture') {
      toast.error(event.error === 'audio-capture' ? 'No se detecta el micrófono' : 'Permiso de micrófono denegado')
      stopAll()
      return
    }
    errorCount.value++
    if (errorCount.value >= maxErrors) stopAll()
  }

  recognition.value.onend = () => {
    stt('end', { activo: isUserActive.value, pausa: paused.value, errores: errorCount.value, reiniciara: isUserActive.value && !paused.value })
    if (paused.value) { // F7: pausa detiene recognition sin soltar ownership
      isTranscribing.value = false
      return
    }
    isRestarting.value = false // Permitir nuevos resultados al terminar la sesión
    if (inactivityTimer.value) clearTimeout(inactivityTimer.value)
    
    if (isUserActive.value && errorCount.value < maxErrors) {
      // reinicio transparente: los controles (pausa, etc.) no parpadean
      setTimeout(() => { if (isUserActive.value && !paused.value) { try { recognition.value?.start() } catch {} } }, 300)
    } else {
      stopAll()
    }
  }
}

const stopAll = () => {
  stt('stopAll (detención completa)', new Error().stack?.split('\n')[2]?.trim())
  isUserActive.value = false
  paused.value = false
  stopPausedHeartbeat()
  try { recognition.value?.stop() } catch {}
  isTranscribing.value = false
  isLocalProducer.value = false
  setTranscriptionProducing(false)
  stopAudioAnalysis()
  if (inactivityTimer.value) clearTimeout(inactivityTimer.value)
}

const isUserActive = ref(false)

const startRecognition = () => {
  if (!recognition.value) initRecognition()
  isUserActive.value = true
  try { recognition.value.start() } catch (e) {}
}

const startAudioAnalysis = async () => {
  stopAudioAnalysis()
  try {
    const audioOpts: MediaTrackConstraints = {}
    if (selectedMicrophoneId.value) audioOpts.deviceId = { exact: selectedMicrophoneId.value }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: Object.keys(audioOpts).length ? audioOpts : true,
      video: false
    })
    vuMeterMicStream.value = stream
    audioContext.value = new (window.AudioContext || (window as any).webkitAudioContext)()
    analyser.value = audioContext.value.createAnalyser()
    microphone.value = audioContext.value.createMediaStreamSource(stream)
    microphone.value.connect(analyser.value)
    
    analyser.value.fftSize = 256
    const bufferLength = analyser.value.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const analyze = () => {
      if (!analyser.value || !isTranscribing.value) return
      analyser.value.getByteFrequencyData(dataArray)
      
      let sum = 0
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i]
      }
      const average = sum / bufferLength
      const val = average / 128
      
      // Throttle reactive updates
      if (Math.abs(val - currentVolume.value) > 0.05) {
        currentVolume.value = val
      }
      
      requestAnimationFrame(analyze)
    }
    analyze()
  } catch (e) {
    console.error('[Audio] Error starting analysis:', e)
  }
}

const stopAudioAnalysis = () => {
  if (microphone.value) {
    microphone.value.disconnect()
    microphone.value = null
  }
  if (audioContext.value) {
    audioContext.value.close().catch(() => {})
    audioContext.value = null
  }
  analyser.value = null
  vuMeterMicStream.value?.getTracks().forEach((t) => t.stop())
  vuMeterMicStream.value = null
  currentVolume.value = 0
}

const toggleTranscription = async () => {
  stt('botón principal', { activo: isUserActive.value, transcribiendo: isTranscribing.value })
  if (isSomeoneElseTranscribing.value) return

  if (isUserActive.value || isTranscribing.value) {
    stopAll()
  } else {
    if (!(await claimProducing())) {
      toast.error(claimError.value)
      return
    }
    paused.value = false
    errorCount.value = 0
    startRecognition()
    // En móviles un 2º stream de micrófono deja sin audio al reconocedor (no-speech): solo en escritorio
    if (!window.matchMedia('(pointer: coarse)').matches) startAudioAnalysis()
  }
}

// F7: Pausar/Reanudar sin soltar ownership (producing sigue true)
const togglePause = () => {
  if (!isLocalProducer.value) return
  if (paused.value) {
    paused.value = false
    stopPausedHeartbeat()
    startRecognition()
  } else {
    paused.value = true
    try { recognition.value?.stop() } catch {}
    isTranscribing.value = false
    setTranscriptionProducing(true) // mantener ownership
    startPausedHeartbeat()
    if (inactivityTimer.value) clearTimeout(inactivityTimer.value)
  }
}

// F7: Limpiar (vacía local, broadcast final vacío, borra líneas de la sesión)
const clearTranscript = async () => {
  if (!(await confirmDialog('¿Borrar toda la transcripción de esta sesión?'))) return
  consolidatedText.value = ''
  activeParagraphRaw.value = ''
  activeParagraphPunctuated.value = ''
  punctuatedPrefix.value = ''
  activeChunkGaps.value = []
  activeChunkWords.value = []
  fullHistory.value = ''
  finalTranscript.value = ''
  interimTranscript.value = ''
  transcriptLines.value = []
  updateTranscription({ final: '', interim: '' })
  try {
    await useApi().delete(`/api/transcription/state?clientId=${encodeURIComponent(clientId.value)}`)
  } catch {}
}

watch(selectedMicrophoneId, () => {
  if (isTranscribing.value) void startAudioAnalysis()
})


onMounted(() => {
  checkBrowser()
  if (!isSupportedBrowser.value) return

  connect()
  initRecognition()

  // F1: cargar líneas persistidas ya-procesadas (sin re-puntuar/re-segmentar)
  void (async () => {
    try {
      const data = await useApi().get<{ lines: Array<{ ts: number; text: string }> }>(
        `/api/transcription/state?clientId=${encodeURIComponent(clientId.value)}`
      )
      const lines = Array.isArray(data?.lines) ? data.lines : []
      if (lines.length) {
        transcriptLines.value = lines
        consolidatedText.value = lines.map(l => l.text).join('\n\n')
        fullHistory.value = consolidatedText.value
        finalTranscript.value = fullHistory.value
      }
    } catch {}
  })()

  onDeviceInputsChanged = () => {
    void getMicrophones()
  }
  navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceInputsChanged)

  attachMicEnumerateRetryOnFirstPointer()

  void (async () => {
    try {
      await getMicrophones()
    } catch (e) {
      console.error('[Transcripción] Fallo al listar micrófonos', e)
    }
  })()
})

// Log when transcription state changes for debugging
watch(transcription, (newVal) => {
}, { deep: true })

onUnmounted(() => {
  recognition.value?.stop()
  stopPausedHeartbeat()
  setTranscriptionProducing(false)
  if (inactivityTimer.value) clearTimeout(inactivityTimer.value)
  stopAudioAnalysis()
  if (onDeviceInputsChanged) {
    navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceInputsChanged)
    onDeviceInputsChanged = null
  }
})

useHead({ title: 'Transcripción' })

definePageMeta({
  layout: false
})
</script>

<template>
  <div class="min-h-svh bg-background text-foreground p-4 lg:p-6 flex flex-col">
    <!-- Navegador no soportado -->
    <div v-if="!isSupportedBrowser" class="flex-1 flex items-center justify-center">
      <div class="max-w-md rounded-3xl bg-red-500/10 p-10 text-center">
        <Icon name="tabler:browser-off" class="size-12 text-red-500 mb-5 mx-auto" />
        <h1 class="text-2xl font-bold tracking-tight mb-2">Usa Chrome o Safari</h1>
        <p class="text-base text-muted-foreground">Esta página necesita un navegador con soporte oficial de la Web Speech API.</p>
      </div>
    </div>

    <div v-else class="w-full max-w-[1600px] mx-auto flex flex-col lg:flex-row gap-4 lg:gap-6 lg:flex-none lg:h-[calc(100svh-3rem)] lg:min-h-0">

      <!-- Controles -->
      <!-- En móvil el aside se "disuelve" (contents) para intercalar el registro entre la acción principal y los ajustes -->
      <aside class="contents lg:flex lg:w-[380px] lg:shrink-0 lg:flex-col lg:gap-4 lg:overflow-y-auto">

        <header class="max-lg:order-1 flex items-start justify-between gap-3 px-1 pt-1">
          <div class="min-w-0">
            <h1 class="text-3xl font-bold tracking-tight">Transcripción</h1>
            <span class="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Icon name="tabler:id" class="size-4" />
              <span class="truncate max-w-[14rem]">{{ clientId }}</span>
            </span>
          </div>
          <span
            class="mt-1.5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold shrink-0"
            :class="isConnected ? 'bg-green-500/15 text-green-700 dark:text-green-400' : 'bg-red-500/15 text-red-600 dark:text-red-400'"
          >
            <span class="size-2 rounded-full" :class="isConnected ? 'bg-green-500' : 'bg-red-500'"></span>
            {{ isConnected ? 'Conectado' : 'Sin conexión' }}
          </span>
        </header>

        <!-- Acción principal -->
        <button
          @click="toggleTranscription"
          :disabled="isSomeoneElseTranscribing"
          class="max-lg:order-2 group flex items-center gap-4 rounded-3xl p-5 text-left transition-colors active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none"
          :class="isTranscribing ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-muted/60 hover:bg-muted'"
        >
          <span
            class="size-14 shrink-0 rounded-2xl flex items-center justify-center"
            :class="isTranscribing ? 'bg-white/20' : 'bg-background'"
          >
            <Icon :name="isTranscribing ? 'tabler:microphone' : 'tabler:microphone-off'" class="size-7" />
          </span>
          <span class="flex-1 min-w-0">
            <span class="block text-lg font-semibold leading-tight">
              {{ isTranscribing ? 'Detener transcripción' : 'Iniciar transcripción' }}
            </span>
            <span class="block text-sm mt-0.5" :class="isTranscribing ? 'text-primary-foreground/80' : 'text-muted-foreground'">
              {{ isTranscribing ? 'Escuchando ahora' : 'Micrófono apagado' }}
            </span>
          </span>
          <span v-if="isTranscribing" class="w-14 h-2 rounded-full bg-white/25 overflow-hidden shrink-0" aria-hidden="true">
            <span class="block h-full bg-white transition-all duration-75" :style="{ width: `${currentVolume * 100}%` }"></span>
          </span>
        </button>

        <p v-if="isSomeoneElseTranscribing" class="max-lg:order-2 rounded-2xl bg-amber-500/15 px-4 py-3 text-sm font-medium text-amber-700 dark:text-amber-400">
          Alguien más está transcribiendo. Verás su transcripción aquí en tiempo real.
        </p>

        <button
          v-if="isLocalProducer"
          @click="togglePause"
          class="max-lg:order-3 flex items-center gap-4 rounded-2xl bg-muted/60 hover:bg-muted px-5 py-4 text-left transition-colors active:scale-[0.99]"
        >
          <Icon :name="paused ? 'tabler:player-play' : 'tabler:player-pause'" class="size-6 shrink-0" />
          <span class="min-w-0">
            <span class="block text-base font-semibold leading-tight">{{ paused ? 'Reanudar' : 'Pausar' }}</span>
            <span class="block text-sm text-muted-foreground mt-0.5">{{ paused ? 'En pausa, conservas el control' : 'Pausa sin soltar el control' }}</span>
          </span>
        </button>

        <!-- Micrófono -->
        <div class="max-lg:order-5 rounded-2xl bg-muted/60 p-4">
          <label for="mic-select" class="block text-sm font-semibold mb-2">Micrófono</label>
          <div class="relative">
            <select
              id="mic-select"
              v-model="selectedMicrophoneId"
              class="w-full appearance-none rounded-xl bg-background pl-4 pr-10 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
              @focus="() => void getMicrophones()"
            >
              <option v-if="!availableMicrophones.length" disabled value="">
                Sin micrófonos: toca la pantalla o activa el dictado
              </option>
              <option
                v-for="(mic, idx) in availableMicrophones"
                :key="`${idx}:${mic.deviceId || ''}:${mic.groupId || ''}`"
                :value="mic.deviceId"
              >
                {{ microphoneLabelFor(mic, idx) }}
              </option>
            </select>
            <Icon name="tabler:chevron-down" class="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        <!-- Utilidades -->
        <div class="max-lg:order-5 grid grid-cols-3 gap-2">
          <button @click="copyTranscript" class="inline-flex flex-col items-center gap-1.5 rounded-2xl bg-muted/60 hover:bg-muted py-3.5 text-sm font-semibold transition-colors active:scale-95">
            <Icon name="tabler:copy" class="size-5" />
            Copiar
          </button>
          <button @click="downloadTranscript" class="inline-flex flex-col items-center gap-1.5 rounded-2xl bg-muted/60 hover:bg-muted py-3.5 text-sm font-semibold transition-colors active:scale-95">
            <Icon name="tabler:download" class="size-5" />
            Descargar
          </button>
          <button @click="clearTranscript" class="inline-flex flex-col items-center gap-1.5 rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 py-3.5 text-sm font-semibold transition-colors active:scale-95">
            <Icon name="tabler:trash" class="size-5" />
            Limpiar
          </button>
        </div>
      </aside>

      <!-- Registro en tiempo real -->
      <main class="max-lg:order-4 max-lg:h-[70svh] max-lg:shrink-0 lg:flex-1 lg:min-h-0 flex flex-col rounded-3xl bg-muted/40 text-foreground overflow-hidden">
        <div class="flex items-center justify-between gap-3 px-6 lg:px-8 pt-6 pb-4 shrink-0">
          <h2 class="text-xl font-bold tracking-tight">Registro en tiempo real</h2>
          <span
            class="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold"
            :class="(isTranscribing || isSomeoneElseTranscribing) ? 'bg-red-500 text-white' : 'bg-muted text-muted-foreground'"
          >
            <span class="size-2 rounded-full" :class="(isTranscribing || isSomeoneElseTranscribing) ? 'bg-white animate-pulse' : 'bg-muted-foreground/50'"></span>
            {{ isTranscribing ? 'Transmitiendo' : isSomeoneElseTranscribing ? 'En vivo' : 'En espera' }}
          </span>
        </div>

        <LiveTranscript
          :final="isSomeoneElseTranscribing ? transcription.final : fullHistory"
          :interim="isSomeoneElseTranscribing ? transcription.interim : interimTranscript"
          size="lg"
          content-class="px-6 lg:px-8 pb-8"
          :empty-text="isSomeoneElseTranscribing ? 'Esperando la señal del orador…' : 'Inicia la transcripción para capturar la voz.'"
        />
      </main>

    </div>
  </div>
</template>
