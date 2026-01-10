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

const emit = defineEmits(['update:modelValue'])

const close = () => {
    emit('update:modelValue', false)
}
</script>

<template>
    <Teleport to="body">
        <Transition name="slide">
            <div v-if="modelValue" class="fixed inset-0 z-50 flex justify-end">
                <!-- Backdrop -->
                <div class="absolute inset-0 bg-background/40 backdrop-blur-sm" @click="close" />

                <!-- Sheet Content -->
                <div :class="cn(
                    'relative glass h-full w-full max-w-md p-6 shadow-2xl flex flex-col',
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
.slide-enter-active,
.slide-leave-active {
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-enter-from,
.slide-leave-to {
    opacity: 0;
}

.slide-enter-from .glass {
    transform: translateX(100%);
}

.slide-leave-to .glass {
    transform: translateX(100%);
}

/* For left side if needed */
.left-side.slide-enter-from .glass,
.left-side.slide-leave-to .glass {
    transform: translateX(-100%);
}
</style>
