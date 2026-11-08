<script setup lang="ts">
// Dos olivos: dos ramas curvas y enfrentadas, con hojas alternas. Ícono de la categoría DR. JBP.
// Usa currentColor; el color lo define quien lo usa.
defineProps<{ label?: string }>()

// Tallo de la rama izquierda (Bézier cúbica); la derecha es su espejo
const P = [[22, 45], [11, 39], [4, 26], [8, 7]] as const
const bez = (t: number, i: 0 | 1) => {
  const u = 1 - t
  return u ** 3 * P[0][i] + 3 * u ** 2 * t * P[1][i] + 3 * u * t ** 2 * P[2][i] + t ** 3 * P[3][i]
}
const dbez = (t: number, i: 0 | 1) => {
  const u = 1 - t
  return 3 * u ** 2 * (P[1][i] - P[0][i]) + 6 * u * t * (P[2][i] - P[1][i]) + 3 * t ** 2 * (P[3][i] - P[2][i])
}
const angleAt = (t: number) => (Math.atan2(dbez(t, 1), dbez(t, 0)) * 180) / Math.PI

// Hojas alternando a cada lado del tallo, más pequeñas hacia la punta, y una hoja terminal
const leaves = [
  ...Array.from({ length: 5 }, (_, i) => {
    const t = 0.14 + i * 0.17
    return {
      x: bez(t, 0),
      y: bez(t, 1),
      rot: angleAt(t) + (i % 2 ? 40 : -40),
      s: 1 - i * 0.05,
    }
  }),
  { x: bez(1, 0), y: bez(1, 1), rot: angleAt(1), s: 0.9 },
]

const stem = `M${P[0][0]} ${P[0][1]}C${P[1][0]} ${P[1][1]} ${P[2][0]} ${P[2][1]} ${P[3][0]} ${P[3][1]}`
const leafPath = 'M0 0C2.5-3.3 7-3.3 9.6 0C7 3.3 2.5 3.3 0 0Z'
</script>

<template>
  <svg
    viewBox="0 0 48 48"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
  >
    <g v-for="mirror in [false, true]" :key="String(mirror)" :transform="mirror ? 'translate(48 0) scale(-1 1)' : undefined">
      <path :d="stem" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" />
      <path
        v-for="(l, i) in leaves"
        :key="i"
        :d="leafPath"
        :transform="`translate(${l.x.toFixed(2)} ${l.y.toFixed(2)}) rotate(${l.rot.toFixed(1)}) scale(${l.s.toFixed(2)})`"
      />
    </g>
  </svg>
</template>
