<script setup lang="ts">
const modelValue = defineModel<string>()
</script>

<template>
  <div class="relative w-full max-w-2xl mx-auto mb-10">
    <GInput v-model="modelValue" placeholder="Buscar por título o número..." class="pl-11" />
    <Icon name="tabler:search" class="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground/70" />
  </div>
</template>
