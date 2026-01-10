<script setup lang="ts">
import { computed } from 'vue'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '~/utils'

const buttonVariants = cva(
    'inline-flex items-center justify-center rounded-xl text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 active:scale-95',
    {
        variants: {
            variant: {
                default: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
                destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm',
                outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
                secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-sm',
                ghost: 'hover:bg-accent hover:text-accent-foreground',
                link: 'text-primary underline-offset-4 hover:underline',
                glass: 'bg-white/20 hover:bg-white/30 text-foreground border border-white/10 backdrop-blur-sm',
            },
            size: {
                default: 'h-11 px-6 py-2',
                sm: 'h-9 px-4 rounded-lg',
                lg: 'h-13 px-10 rounded-2xl text-base',
                icon: 'h-11 w-11',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    }
)

interface Props {
    variant?: VariantProps<typeof buttonVariants>['variant']
    size?: VariantProps<typeof buttonVariants>['size']
    class?: string
    loading?: boolean
    tooltip?: string
}

const props = defineProps<Props>()
</script>

<template>
    <button :class="cn(buttonVariants({ variant, size }), props.class)" v-tooltip="tooltip">
        <template v-if="loading">
            <Icon name="mdi:loading" class="mr-2 h-4 w-4 animate-spin" />
        </template>
        <slot />
    </button>
</template>
