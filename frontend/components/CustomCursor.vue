<script setup lang="ts">
// Cursor propio para todo el sitio: un punto exacto en el puntero y un anillo que lo sigue con inercia.
// El anillo cambia según lo que hay debajo: crece en acciones, se vuelve barra en campos de texto
// y se atenúa en elementos deshabilitados. Solo con mouse real; en táctil o con movimiento
// reducido se mantiene el cursor nativo. En /ver (pantalla de proyección) no se usa.
const route = useRoute()
const fine = ref(false)
const dot = ref<HTMLElement | null>(null)
const ring = ref<HTMLElement | null>(null)
const visible = ref(false)
const state = ref<'default' | 'action' | 'text' | 'disabled'>('default')
const pressed = ref(false)

const enabled = computed(() => fine.value && route.path !== '/ver')

const TEXT = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]):not([type=range]):not([type=file]):not([type=color]), textarea, [contenteditable=""], [contenteditable="true"], .ProseMirror'
const DISABLED = ':disabled, [aria-disabled="true"]'
const ACTION = 'a[href], button, summary, select, label[for], [role=button], [role=tab], [role=menuitem], [role=option], [role=switch], input[type=checkbox], input[type=radio], input[type=button], input[type=submit], input[type=reset], input[type=range], input[type=file], .cursor-pointer'

const RING_TAU_MS = 35 // menor = más pegado al mouse
let raf = 0
let lastT = 0
let tx = 0, ty = 0 // objetivo (mouse real)
let rx = 0, ry = 0 // anillo
let seen = false
let lastTarget: Element | null = null

function tick(now: number) {
  const dt = lastT ? Math.min(now - lastT, 50) : 16
  lastT = now
  const k = 1 - Math.exp(-dt / RING_TAU_MS)
  rx += (tx - rx) * k
  ry += (ty - ry) * k
  if (ring.value) ring.value.style.transform = `translate3d(${rx}px, ${ry}px, 0)`
  if (Math.abs(tx - rx) + Math.abs(ty - ry) > 0.2) raf = requestAnimationFrame(tick)
  else { raf = 0; lastT = 0 }
}

function classify(el: Element | null) {
  if (el === lastTarget) return
  lastTarget = el
  if (!el) { state.value = 'default'; return }
  if (el.closest(DISABLED)) state.value = 'disabled'
  else if (el.closest(TEXT)) state.value = 'text'
  else if (el.closest(ACTION)) state.value = 'action'
  else state.value = 'default'
}

function onMove(e: PointerEvent) {
  if (e.pointerType !== 'mouse') return
  tx = e.clientX
  ty = e.clientY
  if (!seen) { rx = tx; ry = ty; seen = true }
  // el punto va directo al puntero, sin esperar al siguiente frame
  if (dot.value) dot.value.style.transform = `translate3d(${tx}px, ${ty}px, 0)`
  visible.value = true
  classify(e.target as Element | null)
  if (!raf) raf = requestAnimationFrame(tick)
}
const onLeave = () => { visible.value = false }
const onDown = (e: PointerEvent) => { if (e.pointerType === 'mouse') pressed.value = true }
const onUp = () => { pressed.value = false }

onMounted(() => {
  fine.value = matchMedia('(hover: hover) and (pointer: fine)').matches
    && !matchMedia('(prefers-reduced-motion: reduce)').matches
  window.addEventListener('pointermove', onMove, { passive: true })
  window.addEventListener('pointerdown', onDown, { passive: true })
  window.addEventListener('pointerup', onUp, { passive: true })
  document.documentElement.addEventListener('pointerleave', onLeave)
})

// Oculta el cursor nativo solo mientras el propio está activo
watchEffect(() => {
  if (import.meta.client) document.documentElement.classList.toggle('custom-cursor', enabled.value)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerdown', onDown)
  window.removeEventListener('pointerup', onUp)
  document.documentElement.removeEventListener('pointerleave', onLeave)
  document.documentElement.classList.remove('custom-cursor')
})
</script>

<template>
  <template v-if="enabled">
    <div ref="dot" class="cc" :class="{ 'cc-on': visible }" aria-hidden="true">
      <span class="cc-dot" :data-state="state" />
    </div>
    <div ref="ring" class="cc" :class="{ 'cc-on': visible }" aria-hidden="true">
      <span class="cc-ring" :data-state="state" :data-pressed="pressed" />
    </div>
  </template>
</template>

<style>
/* Oculta el cursor nativo en todo, campos de texto incluidos */
html.custom-cursor, html.custom-cursor * { cursor: none !important; }

.cc {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 2147483647;
  pointer-events: none;
  opacity: 0;
  transition: opacity 200ms ease;
  will-change: transform;
}
.cc.cc-on { opacity: 1; }

.cc-dot, .cc-ring {
  position: absolute;
  border-radius: 9999px;
  translate: -50% -50%;
}

.cc-dot {
  width: 8px;
  height: 8px;
  background: hsl(var(--foreground));
  box-shadow: 0 0 0 1.5px rgb(255 255 255 / 0.9);
  transition: opacity 150ms ease, scale 150ms ease;
}
.cc-dot[data-state='text'] { opacity: 0; }

.cc-ring {
  width: 36px;
  height: 36px;
  border: 1.5px solid hsl(var(--foreground) / 0.6);
  box-shadow: 0 0 0 1px rgb(255 255 255 / 0.35);
  background: transparent;
  transition:
    width 220ms cubic-bezier(0.2, 0.7, 0.2, 1),
    height 220ms cubic-bezier(0.2, 0.7, 0.2, 1),
    border-radius 220ms ease,
    background-color 220ms ease,
    border-color 220ms ease,
    opacity 220ms ease,
    scale 120ms ease;
}
/* acción: el anillo crece y se rellena */
.cc-ring[data-state='action'] { width: 58px; height: 58px; background: hsl(var(--foreground) / 0.1); }
/* texto: barra vertical (I-beam) */
.cc-ring[data-state='text'] {
  width: 3px;
  height: 28px;
  border-width: 0;
  border-radius: 2px;
  background: hsl(var(--foreground));
  box-shadow: 0 0 0 1.5px rgb(255 255 255 / 0.9);
}
/* deshabilitado: anillo pequeño y tenue */
.cc-ring[data-state='disabled'] { width: 26px; height: 26px; opacity: 0.45; border-style: dashed; }
/* click: el anillo se contrae */
.cc-ring[data-pressed='true'] { scale: 0.82; }
</style>
