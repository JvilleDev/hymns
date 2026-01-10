<script setup lang="ts">
import { cn } from '~/utils'

interface Props {
    modelValue?: boolean
    title?: string
    description?: string
    class?: string
}

const props = defineProps<Props>()
const emit = defineEmits(['update:modelValue'])

const close = () => {
    emit('update:modelValue', false)
}
</script>

<template>
    <Teleport to="body">
        <Transition name="fade">
            <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center p-4">
                <!-- Backdrop -->
                <div class="absolute inset-0 bg-background/40 backdrop-blur-sm" @click="close" />

                <!-- Dialog Content -->
                <div :class="cn(
                    'relative glass-card w-full max-w-lg p-6 shadow-2xl overflow-hidden',
                    props.class
                )">
                    <!-- Close button -->
                    <button @click="close"
                        class="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors">
                        <Icon name="tabler:x" class="size-5" />
                    </button>

                    <div v-if="title" class="mb-2">
                        <h2 class="text-xl font-bold text-foreground">{{ title }}</h2>
                    </div>

                    <p v-if="description" class="text-sm text-muted-foreground mb-6">
                        {{ description }}
                    </p>

                    <div class="relative">
                        <slot />
                    </div>

                    <div v-if="$slots.footer" class="mt-8 flex justify-end gap-3">
                        <slot name="footer" />
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

.fade-enter-active .glass-card,
.fade-leave-active .glass-card {
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.fade-enter-from .glass-card {
    transform: scale(0.95) translateY(10px);
}

.fade-leave-to .glass-card {
    transform: scale(0.95);
}
</style>
