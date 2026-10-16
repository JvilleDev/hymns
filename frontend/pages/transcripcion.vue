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
const { clientId, isManualConnectionTrigger } = useApi()

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

// F2: PIN de productor (se guarda en localStorage una vez)
const transcribePin = ref('')
const pinError = ref('')
if (import.meta.client) {
  transcribePin.value = localStorage.getItem('transcripcion:pin') || ''
}
const claimProducing = async (): Promise<boolean> => {
  pinError.value = ''
  try {
    await useApi().post('/api/transcription/claim', { clientId: clientId.value, pin: transcribePin.value || '' })
    if (import.meta.client && transcribePin.value) localStorage.setItem('transcripcion:pin', transcribePin.value)
    return true
  } catch (e: any) {
    if (e?.status === 403 || e?.response?.status === 403 || e?.statusCode === 403) {
      pinError.value = 'PIN incorrecto'
    } else if (e?.status === 409 || e?.response?.status === 409 || e?.statusCode === 409) {
      pinError.value = 'Otro productor activo'
    } else {
      pinError.value = 'No se pudo tomar el micrófono'
    }
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

    // Siempre solicitar permiso de micrófono antes de enumerar (navegador solo muestra nombres tras permiso).
    if (!opts?.skipPermissionRequest && navigator.mediaDevices?.getUserMedia) {
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

const requestSegmentation = async (sentences: string[]): Promise<{
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
      documentId
    })
    return data
  } catch (e) {
    console.error('[Segment] Error:', e)
    return { paragraphs: [] }
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


  recognition.value.onstart = () => {
    isTranscribing.value = true
    isLocalProducer.value = true
    errorCount.value = 0
    setTranscriptionProducing(true)
    resetInactivityTimer()
  }

  recognition.value.onresult = async (event: any) => {
    if (isRestarting.value) return // Ignorar resultados mientras reiniciamos
    
    resetInactivityTimer()
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
          requestSegmentation(sentences).then(result => {
            if (result.paragraphs.length > 1) {
              // Hay un punto de corte: el primer párrafo se consolida, el resto sigue activo
              const firstParagraph = result.paragraphs[0]
              const remainingParagraphs = result.paragraphs.slice(1)
              
              bakeToConsolidated(firstParagraph.text)
              
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
    console.error('[STT] Error:', event.error)
    if (paused.value) return // F7: en pausa no soltar ownership ni reintentar
    isTranscribing.value = false
    setTranscriptionProducing(false)
    if (inactivityTimer.value) clearTimeout(inactivityTimer.value)
    
    if (event.error !== 'not-allowed' && isUserActive.value && errorCount.value < maxErrors) {
      errorCount.value++
      setTimeout(() => startRecognition(), 1000)
    }
  }

  recognition.value.onend = () => {
    if (paused.value) { // F7: pausa detiene recognition sin soltar ownership
      isTranscribing.value = false
      return
    }
    isTranscribing.value = false
    isLocalProducer.value = false
    isRestarting.value = false // Permitir nuevos resultados al terminar la sesión
    if (inactivityTimer.value) clearTimeout(inactivityTimer.value)
    
    if (isUserActive.value && errorCount.value < maxErrors) {
      startRecognition()
    } else {
      setTranscriptionProducing(false)
    }
  }
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
  if (isSomeoneElseTranscribing.value) return

  if (isTranscribing.value) {
    isUserActive.value = false
    paused.value = false
    stopPausedHeartbeat()
    recognition.value?.stop()
    isLocalProducer.value = false
    setTranscriptionProducing(false)
    stopAudioAnalysis()
    if (inactivityTimer.value) clearTimeout(inactivityTimer.value)
  } else {
    // F2: claim con PIN antes de tomar el mic
    if (!(await claimProducing())) {
      toast.error(pinError.value || 'PIN incorrecto')
      return
    }
    paused.value = false
    void getMicrophones()
    startRecognition()
    startAudioAnalysis()
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
  if (!confirm('¿Borrar toda la transcripción de esta sesión?')) return
  consolidatedText.value = ''
  activeParagraphRaw.value = ''
  activeParagraphPunctuated.value = ''
  punctuatedPrefix.value = ''
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

// Auto-scroll the history container
const historyContainer = ref<HTMLElement | null>(null)
watch([
  () => fullHistory.value, 
  () => interimTranscript.value,
  () => transcription.value.final,
  () => transcription.value.interim
], () => {
  nextTick(() => {
    if (historyContainer.value) {
      historyContainer.value.scrollTop = historyContainer.value.scrollHeight
    }
  })
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
    // F2: reclaim — mismo clientId recupera ownership automáticamente
    if (transcribePin.value) {
      try { await claimProducing().catch(() => false) } catch {}
    }
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
  <div class="min-h-screen bg-neutral-50 text-neutral-900 font-sans p-4 sm:p-8 flex flex-col items-center justify-center">
    <div v-if="!isSupportedBrowser" class="h-full flex items-center justify-center">
      <div class="p-8 border border-red-200 bg-red-50 rounded-3xl max-w-sm text-center">
        <Icon name="tabler:browser-off" class="size-12 text-red-500 mb-4 mx-auto" />
        <h1 class="text-xl font-bold mb-2">Usar Chrome o Safari</h1>
        <p class="text-sm text-neutral-500">Este sistema solo funciona en navegadores con soporte oficial de Web Speech API.</p>
      </div>
    </div>

    <div v-else class="h-[90vh] w-full max-w-[1600px] mx-auto flex flex-col lg:flex-row gap-8">
      
      <!-- Sidebar: Controls -->
      <aside class="w-full lg:w-[340px] flex flex-col gap-6 shrink-0 h-full overflow-y-auto pr-2">
        
        <!-- Header -->
        <header class="space-y-4">
          <div class="flex items-center justify-between">
            <h1 class="text-3xl font-black tracking-tighter text-neutral-900 uppercase">STT LIVE</h1>
            <div class="flex items-center gap-1.5 px-2 py-0.5 bg-neutral-100 rounded-full border border-neutral-200">
              <div class="size-1.5 rounded-full" :class="isConnected ? 'bg-green-500' : 'bg-red-500'"></div>
              <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-500">{{ isConnected ? 'Online' : 'Offline' }}</span>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <div class="flex items-center gap-1.5 px-3 py-1 bg-white rounded-full border border-neutral-200 cursor-pointer hover:bg-neutral-50 transition-colors" @click="isManualConnectionTrigger = true">
              <Icon name="tabler:id" class="size-3.5 text-blue-600" />
              <span class="text-[10px] font-bold uppercase tracking-widest text-neutral-600">
                {{ clientId?.length > 15 ? clientId.substring(0, 8) + '...' : clientId }}
              </span>
            </div>
            <div v-if="isTranscribing" class="flex items-center gap-1.5 px-2 py-1 bg-blue-50 rounded-full border border-blue-100">
              <div class="size-1.5 bg-blue-600 rounded-full animate-pulse"></div>
              <span class="text-[9px] font-black uppercase tracking-widest text-blue-600">Transmitiendo</span>
            </div>
          </div>
        </header>

        <!-- Microphone Selector -->
        <div class="flex items-center gap-3 bg-white p-2 rounded-2xl border border-neutral-200 shadow-sm">
          <div class="size-10 bg-neutral-50 rounded-xl flex items-center justify-center text-neutral-400">
            <Icon name="tabler:microphone" class="size-5" />
          </div>
          <div class="flex-1 min-w-0 relative">
            <select
              v-model="selectedMicrophoneId"
              class="w-full bg-transparent border-none py-1 pr-8 text-[12px] font-medium tracking-tight text-neutral-700 normal-case focus:ring-0 outline-none appearance-none cursor-pointer"
              @focus="() => void getMicrophones()"
            >
              <option v-if="!availableMicrophones.length" disabled value="">
                Lista de micrófonos vacía · toca la pantalla o activa dictado
              </option>
              <option
                v-for="(mic, idx) in availableMicrophones"
                :key="`${idx}:${mic.deviceId || ''}:${mic.groupId || ''}`"
                :value="mic.deviceId"
              >
                {{ microphoneLabelFor(mic, idx) }}
              </option>
            </select>
            <Icon name="tabler:chevron-down" class="absolute right-2 top-1/2 -translate-y-1/2 size-4 text-neutral-400 pointer-events-none" />
          </div>
        </div>

        <!-- Actions -->
        <div class="grid grid-cols-1 gap-3">
          <!-- F2: PIN productor -->
          <div class="flex items-center gap-2 bg-white p-2 rounded-2xl border border-neutral-200 shadow-sm">
            <Icon name="tabler:lock" class="size-4 text-neutral-400 ml-2 shrink-0" />
            <input
              v-model="transcribePin"
              type="password"
              placeholder="PIN productor"
              autocomplete="off"
              class="w-full bg-transparent border-none py-1 text-[12px] font-medium text-neutral-700 focus:ring-0 outline-none"
            />
          </div>
          <p v-if="pinError" class="text-[11px] font-bold text-red-500 px-1">{{ pinError }}</p>
          <!-- Audio/Transcription Toggle -->
          <button 
            @click="toggleTranscription"
            :disabled="isSomeoneElseTranscribing"
            class="group flex items-center justify-between px-6 py-5 rounded-[1.5rem] border-2 transition-all font-black uppercase tracking-widest text-xs"
            :class="[
              isTranscribing 
                ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-200' 
                : 'border-neutral-200 bg-white text-neutral-400 hover:border-neutral-300 hover:text-neutral-600',
              isSomeoneElseTranscribing ? 'opacity-50 cursor-not-allowed bg-neutral-100 grayscale' : ''
            ]"
          >
            <div class="flex items-center gap-4">
              <Icon :name="isTranscribing ? 'tabler:microphone' : 'tabler:microphone-off'" class="size-6" />
              <div class="text-left">
                <div class="leading-none">Transcripción Voz</div>
                <div class="text-[9px] font-bold opacity-60 mt-1">{{ isTranscribing ? 'Escuchando ahora' : 'Micrófono apagado' }}</div>
              </div>
            </div>
            
            <!-- Volume Meter -->
            <div v-if="isTranscribing" class="w-12 h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div 
                class="h-full bg-white transition-all duration-75" 
                :style="{ width: `${currentVolume * 100}%` }"
              ></div>
            </div>
            <Icon v-else name="tabler:arrow-right" class="size-4 opacity-0 group-hover:opacity-100 transition-all" />
          </button>
          <!-- F7: Pausar/Reanudar -->
          <button
            v-if="isLocalProducer"
            @click="togglePause"
            class="flex items-center justify-between px-6 py-4 rounded-[1.5rem] border-2 transition-all font-black uppercase tracking-widest text-xs border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300"
          >
            <div class="flex items-center gap-4">
              <Icon :name="paused ? 'tabler:player-play' : 'tabler:player-pause'" class="size-5" />
              <div class="text-left">
                <div class="leading-none">{{ paused ? 'Reanudar' : 'Pausar' }}</div>
                <div class="text-[9px] font-bold opacity-60 mt-1">{{ paused ? 'En pausa, ownership retenido' : 'Pausa sin soltar ownership' }}</div>
              </div>
            </div>
          </button>
          <!-- F3 copiar/exportar + F7 limpiar -->
          <div class="grid grid-cols-3 gap-2">
            <button @click="copyTranscript" class="px-3 py-3 rounded-2xl border border-neutral-200 bg-white text-[10px] font-black uppercase tracking-widest text-neutral-500 hover:border-neutral-300">Copiar</button>
            <button @click="downloadTranscript" class="px-3 py-3 rounded-2xl border border-neutral-200 bg-white text-[10px] font-black uppercase tracking-widest text-neutral-500 hover:border-neutral-300">Descargar</button>
            <button @click="clearTranscript" class="px-3 py-3 rounded-2xl border border-red-200 bg-white text-[10px] font-black uppercase tracking-widest text-red-500 hover:border-red-300">Limpiar</button>
          </div>
        </div>

        <div v-if="isSomeoneElseTranscribing" class="p-4 bg-orange-50 border border-orange-100 rounded-2xl text-center">
          <p class="text-[10px] font-black uppercase tracking-widest text-orange-600">Alguien más está transcribiendo</p>
        </div>

      </aside>

      <!-- Main Content: Transcription History -->
      <main class="flex-1 flex flex-col min-h-0 bg-white rounded-[3rem] border border-neutral-200 shadow-xl overflow-hidden relative">
        
        <!-- Decoration -->
        <div class="absolute top-8 left-10 flex items-center gap-3 pointer-events-none z-10">
           <div class="size-8 bg-neutral-50 rounded-xl flex items-center justify-center">
             <Icon name="tabler:history" class="size-4 text-neutral-400" />
           </div>
           <div>
             <span class="block text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">Registro en Tiempo Real</span>
             <span class="block text-[9px] font-bold text-neutral-300">Segmentación semántica activa</span>
           </div>
        </div>

        <!-- History Container -->
        <div 
          ref="historyContainer"
          class="flex-1 overflow-y-auto px-10 pt-28 pb-10 scroll-smooth"
        >
          <div 
            v-if="!(isSomeoneElseTranscribing ? (transcription.final || transcription.interim) : (fullHistory || interimTranscript))" 
            class="h-full flex flex-col items-center justify-center text-neutral-200"
          >
             <Icon name="tabler:ear" class="size-20 mb-6 opacity-30" />
             <p class="text-sm font-black uppercase tracking-[0.3em] text-center max-w-xs">
               {{ isSomeoneElseTranscribing ? 'Esperando señal del orador...' : 'Inicia la transcripción para capturar voz' }}
             </p>
          </div>
          
          <div v-else class="max-w-4xl">
            <p class="text-3xl sm:text-4xl font-medium leading-relaxed text-neutral-700 whitespace-pre-wrap">
              <span>{{ isSomeoneElseTranscribing ? transcription.final : fullHistory }}</span>
              <span v-if="isSomeoneElseTranscribing ? transcription.interim : interimTranscript" class="text-blue-600 ml-2 italic underline decoration-blue-200 decoration-4 underline-offset-8">{{ isSomeoneElseTranscribing ? transcription.interim : interimTranscript }}</span>
            </p>
          </div>
        </div>      </main>

    </div>
  </div>
</template>
