<script setup lang="ts">
import { cn } from '~/utils'
import { computed } from 'vue'

interface Props {
    modelValue?: string | number
    type?: string
    placeholder?: string
    class?: string
    disabled?: boolean
    error?: string
    label?: string
    rows?: number
}

const props = withDefaults(defineProps<Props>(), {
    type: 'text',
    rows: 3
})

const emit = defineEmits(['update:modelValue'])

const onInput = (event: Event) => {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement
    emit('update:modelValue', target.value)
}

const inputClass = computed(() => cn(
    'w-full bg-background border border-input rounded-xl px-4 py-2.5 text-sm transition-all duration-200 outline-none',
    'focus:border-primary focus:ring-2 focus:ring-ring focus:bg-background',
    'placeholder:text-muted-foreground',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    props.error && 'border-destructive focus:ring-destructive/10',
    props.class
))
</script>

<template>
    <div class="w-full">
        <label v-if="label" class="block text-sm font-medium mb-1.5 ml-1 text-foreground/80">
            {{ label }}
        </label>
        <div class="relative group">
            <template v-if="type === 'textarea'">
                <textarea :value="modelValue" @input="onInput" :placeholder="placeholder" :disabled="disabled"
                    :rows="rows" :class="cn(inputClass, 'resize-none')" />
            </template>
            <template v-else>
                <input :type="type" :value="modelValue" @input="onInput" :placeholder="placeholder" :disabled="disabled"
                    :class="inputClass" />
            </template>
            <div
                class="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent scale-x-0 group-focus-within:scale-x-100 transition-transform duration-500" />
        </div>
        <span v-if="error" class="text-xs text-destructive mt-1 ml-1">
            {{ error }}
        </span>
    </div>
</template>
