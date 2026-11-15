<script setup lang="ts">
// Himnario: libro abierto con una nota musical. Usa currentColor; el fondo lo pone quien lo usa.
defineProps<{ label?: string }>()
</script>

<template>
  <svg
    viewBox="6 5 52 50"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
  >
    <path d="M30.5 52c-4.8-3.8-12.5-4.8-20.5-3V30c8-1.8 15.7-.8 20.5 3z" />
    <path d="M33.5 52c4.8-3.8 12.5-4.8 20.5-3V30c-8-1.8-15.7-.8-20.5 3z" />
    <ellipse cx="25" cy="21.5" rx="5.2" ry="3.9" transform="rotate(-20 25 21.5)" />
    <path d="M28.7 20.5h2.6V7.5c3.5 1 7 3.5 7.5 8-2.2-2.4-4.8-3.2-7.5-3.2z" />
  </svg>
</template>
