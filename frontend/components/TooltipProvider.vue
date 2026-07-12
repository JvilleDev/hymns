<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const isVisible = ref(false)
const content = ref('')
const tooltipRef = ref<HTMLElement | null>(null)
const position = ref({ x: 0, y: 0 })

const showTooltip = (el: HTMLElement, text: string) => {
    content.value = text
    isVisible.value = true

    const rect = el.getBoundingClientRect()
    position.value = {
        x: rect.left + rect.width / 2,
        y: rect.top - 8
    }
}

const hideTooltip = () => {
    isVisible.value = false
}

onMounted(() => {
    window.addEventListener('tooltip-show', ((e: CustomEvent) => {
        showTooltip(e.detail.el, e.detail.text)
    }) as EventListener)

    window.addEventListener('tooltip-hide', hideTooltip)
})

onUnmounted(() => {
    window.removeEventListener('tooltip-show', hideTooltip as EventListener)
    window.removeEventListener('tooltip-hide', hideTooltip)
})
</script>

<template>
    <Teleport to="body">
        <div ref="tooltipRef" class="tooltip-container" :class="{ 'visible': isVisible }" :style="{
            left: `${position.x}px`,
            top: `${position.y}px`,
            transform: `translate(-50%, -100%) ${isVisible ? 'translateY(-4px)' : 'translateY(0)'}`
        }">
            {{ content }}
        </div>
    </Teleport>
</template>

<style scoped>
/* Base styles are in tailwind.css */
</style>
