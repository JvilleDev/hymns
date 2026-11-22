<script setup lang="ts">
// Sin chrome (login). Necesita un único elemento raíz para que layoutTransition funcione:
// no poner comentarios HTML antes del <div> (en dev Vue los conserva y cuentan como 2º nodo raíz).
</script>

<template>
  <div>
    <slot />
  </div>
</template>
