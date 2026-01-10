<script setup lang="ts">
import { cn } from '~/utils'

interface Props {
    modelValue?: boolean
    label?: string
    class?: string
}

const props = defineProps<Props>()
const emit = defineEmits(['update:modelValue'])

const toggle = () => {
    emit('update:modelValue', !props.modelValue)
}
</script>

<template>
    <div class="flex items-center gap-3 cursor-pointer select-none group" @click="toggle">
        <div :class="cn(
            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-300 outline-none',
            'glass',
            modelValue ? 'bg-primary' : 'bg-surface-2',
            props.class
        )">
            <span :class="cn(
                'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-300',
                modelValue ? 'translate-x-5' : 'translate-x-0'
            )" />
        </div>
        <span v-if="label" class="text-sm font-medium text-foreground/80 group-hover:text-foreground transition-colors">
            {{ label }}
        </span>
    </div>
</template>
