<script setup lang="ts">
import { cn } from '~/utils'

interface Props {
    modelValue?: boolean
    title?: string
    description?: string
    class?: string
    side?: 'left' | 'right'
}

const props = withDefaults(defineProps<Props>(), {
    side: 'right'
})

const modelValue = defineModel<boolean>()

const close = () => {
    modelValue.value = false
}
</script>

<template>
    <Teleport to="body">
        <Transition name="slide" :duration="400">
            <div v-if="modelValue" class="fixed inset-0 z-50 flex justify-end">
                <!-- Backdrop -->
                <div class="sheet-backdrop absolute inset-0 bg-background/40 backdrop-blur-sm" @click="close" />

                <!-- Sheet Content -->
                <div :data-side="side" :class="cn(
                    'sheet-panel relative glass h-full w-full max-w-md p-6 shadow-2xl flex flex-col',
                    side === 'left' ? 'left-0 mr-auto' : 'right-0 ml-auto',
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

                    <div class="flex-1 overflow-y-auto">
                        <slot />
                    </div>

                    <div v-if="$slots.footer" class="mt-8 flex flex-col gap-3">
                        <slot name="footer" />
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
/* El panel entra y sale solo con transform; el fondo atenúa su opacidad aparte */
.slide-enter-active .sheet-panel,
.slide-leave-active .sheet-panel {
    transition: transform 0.4s cubic-bezier(0.32, 0.72, 0, 1);
    will-change: transform;
}

.slide-enter-active .sheet-backdrop,
.slide-leave-active .sheet-backdrop {
    transition: opacity 0.4s ease;
}

.slide-enter-from .sheet-panel,
.slide-leave-to .sheet-panel {
    transform: translateX(100%);
}

.slide-enter-from .sheet-panel[data-side='left'],
.slide-leave-to .sheet-panel[data-side='left'] {
    transform: translateX(-100%);
}

.slide-enter-from .sheet-backdrop,
.slide-leave-to .sheet-backdrop {
    opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
    .slide-enter-active .sheet-panel,
    .slide-leave-active .sheet-panel,
    .slide-enter-active .sheet-backdrop,
    .slide-leave-active .sheet-backdrop {
        transition-duration: 0.01ms;
    }
}
</style>
