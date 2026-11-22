// Reconocimiento de voz local (app "Hymns STT", Whisper en ws://localhost:8090).
// Imita la interfaz de SpeechRecognition (start(track?)/stop/onresult/onerror/onend) para que
// /transcripcion pueda usarlo en lugar del reconocedor de Google sin cambiar su lógica.

export const LOCAL_STT_HTTP = 'http://localhost:8090'
export const LOCAL_STT_WS = 'ws://localhost:8090/ws'

/** ¿Está la app local abierta y con el modelo cargado? */
export const probeLocalStt = async (): Promise<boolean> => {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 1500)
    const res = await fetch(`${LOCAL_STT_HTTP}/health`, { signal: ctrl.signal, cache: 'no-store' })
    clearTimeout(t)
    const data = await res.json()
    return !!(data?.ok && data?.ready)
  } catch {
    return false
  }
}

// AudioWorklet: promedia a 16 kHz y entrega bloques Int16 de ~100 ms.
const WORKLET_SRC = `
class Pcm16k extends AudioWorkletProcessor {
  constructor() { super(); this.acc = 0; this.n = 0; this.out = []; this.pos = 0; this.ratio = sampleRate / 16000 }
  process(inputs) {
    const chs = inputs[0]
    if (!chs || !chs.length) return true
    const ch = chs[0]
    for (let i = 0; i < ch.length; i++) {
      // promedia todos los canales (p. ej. BlackHole 2ch: si solo suena un lado, no se pierde la mitad)
      let v = 0
      for (let c = 0; c < chs.length; c++) v += chs[c][i]
      this.acc += v / chs.length; this.n++
      this.pos += 1
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio
        const s = Math.max(-1, Math.min(1, this.acc / this.n))
        this.out.push(s < 0 ? s * 32768 : s * 32767)
        this.acc = 0; this.n = 0
        if (this.out.length >= 1600) {
          this.port.postMessage(Int16Array.from(this.out).buffer)
          this.out = []
        }
      }
    }
    return true
  }
}
registerProcessor('pcm16k', Pcm16k)
`

export class LocalSpeechRecognition {
  continuous = true
  interimResults = true
  lang = 'es-ES'

  onstart: (() => void) | null = null
  onresult: ((e: any) => void) | null = null
  onerror: ((e: any) => void) | null = null
  onend: (() => void) | null = null
  // Sin equivalentes locales; existen para que el código de la página pueda asignarlos.
  onaudiostart: any = null
  onsoundstart: any = null
  onspeechstart: any = null
  onspeechend: any = null
  onsoundend: any = null
  onaudioend: any = null
  onnomatch: any = null

  private ws: WebSocket | null = null
  private ctx: AudioContext | null = null
  private node: AudioWorkletNode | null = null
  private src: MediaStreamAudioSourceNode | null = null
  private ownStream: MediaStream | null = null
  private running = false
  private ended = false
  private stopTimer: ReturnType<typeof setTimeout> | null = null

  async start(track?: MediaStreamTrack) {
    if (this.running) {
      const e = new Error('already started')
      e.name = 'InvalidStateError'
      throw e
    }
    this.running = true
    this.ended = false
    try {
      let stream: MediaStream
      if (track) {
        stream = new MediaStream([track]) // la pista pertenece a la página: no se detiene aquí
      } else {
        stream = this.ownStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      }

      const ws = this.ws = new WebSocket(LOCAL_STT_WS)
      ws.binaryType = 'arraybuffer'
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve()
        ws.onerror = () => reject(new Error('ws'))
      })
      ws.onmessage = (m) => this.handleMessage(m)
      ws.onclose = () => this.finish(this.running ? 'network' : undefined)
      ws.onerror = () => this.finish('network')
      ws.send(JSON.stringify({ type: 'start', language: this.lang.split('-')[0] }))

      const ctx = this.ctx = new AudioContext()
      const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }))
      await ctx.audioWorklet.addModule(url)
      URL.revokeObjectURL(url)
      this.src = ctx.createMediaStreamSource(stream)
      this.node = new AudioWorkletNode(ctx, 'pcm16k')
      this.node.port.onmessage = (ev) => {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(ev.data)
      }
      this.src.connect(this.node)
      if (ctx.state === 'suspended') await ctx.resume()
      this.onstart?.()
    } catch (e: any) {
      const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError'
      this.finish(denied ? 'not-allowed' : e?.name === 'NotFoundError' ? 'audio-capture' : 'network')
    }
  }

  private handleMessage(m: MessageEvent) {
    if (typeof m.data !== 'string') return
    let msg: any
    try { msg = JSON.parse(m.data) } catch { return }
    if (msg.type === 'result' && msg.text) {
      const alt = { transcript: msg.text, confidence: 1 }
      const result: any = Object.assign([alt], { isFinal: !!msg.final })
      this.onresult?.({ resultIndex: 0, results: [result] })
    } else if (msg.type === 'error') {
      this.onerror?.({ error: 'network', message: msg.message })
    } else if (msg.type === 'stopped') {
      this.finish()
    }
  }

  /** Cierra el enunciado en curso (emite su final) y termina. */
  stop() {
    if (!this.running) return
    this.teardownAudio()
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'stop' }))
      // por si el servidor tarda en el último final; se cancela en finish() para no matar la sesión siguiente
      this.stopTimer = setTimeout(() => this.finish(), 4000)
    } else {
      this.finish()
    }
  }

  abort() { this.stop() }

  private teardownAudio() {
    try { this.src?.disconnect() } catch {}
    try { this.node?.disconnect() } catch {}
    this.ctx?.close().catch(() => {})
    this.src = null
    this.node = null
    this.ctx = null
    this.ownStream?.getTracks().forEach(t => t.stop())
    this.ownStream = null
  }

  private finish(error?: string) {
    if (this.ended) return
    this.ended = true
    if (this.stopTimer) clearTimeout(this.stopTimer)
    this.stopTimer = null
    if (error) this.onerror?.({ error })
    this.teardownAudio()
    const ws = this.ws
    this.ws = null
    if (ws) {
      ws.onclose = null
      ws.onerror = null
      try { ws.close() } catch {}
    }
    this.running = false
    this.onend?.()
  }
}
