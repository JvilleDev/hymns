<script setup lang="ts">
import { cn } from '~/utils'

interface Props {
    class?: string
    noHover?: boolean
}

const props = defineProps<Props>()
</script>

<template>
    <div :class="cn(
        'bg-card text-card-foreground p-6 rounded-xl border border-border shadow-sm transition-all duration-200',
        !noHover && 'hover:shadow-md hover:-translate-y-0.5',
        props.class
    )">
        <div v-if="$slots.header" class="mb-4">
            <slot name="header" />
        </div>
        <div class="relative">
            <slot />
        </div>
        <div v-if="$slots.footer" class="mt-6 pt-4 border-t border-glass-border">
            <slot name="footer" />
        </div>
    </div>
</template>
