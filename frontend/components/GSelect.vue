<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { cn } from '~/utils'

interface Option {
    label: string
    value: string | number
}

interface Props {
    modelValue?: string | number
    options: Option[]
    placeholder?: string
    label?: string
    class?: string
}

const props = withDefaults(defineProps<Props>(), {
    placeholder: 'Seleccione una opción'
})

const emit = defineEmits(['update:modelValue'])

const isOpen = ref(false)
const containerRef = ref<HTMLElement | null>(null)

const toggle = () => (isOpen.value = !isOpen.value)
const close = () => (isOpen.value = false)

const selectOption = (option: Option) => {
    emit('update:modelValue', option.value)
    close()
}

const selectedLabel = computed(() => {
    return props.options.find(o => o.value === props.modelValue)?.label || props.placeholder
})

const handleClickOutside = (event: MouseEvent) => {
    if (containerRef.value && !containerRef.value.contains(event.target as Node)) {
        close()
    }
}

onMounted(() => window.addEventListener('click', handleClickOutside))
onUnmounted(() => window.removeEventListener('click', handleClickOutside))
</script>

<template>
    <div class="w-full" ref="containerRef">
        <label v-if="label" class="block text-sm font-medium mb-1.5 ml-1 text-foreground/80">
            {{ label }}
        </label>
        <div class="relative">
            <div @click="toggle" :class="cn(
                'w-full bg-background border border-input rounded-xl px-4 py-2.5 text-sm flex items-center justify-between cursor-pointer transition-all duration-200',
                'hover:bg-accent hover:text-accent-foreground',
                isOpen && 'border-primary ring-2 ring-ring',
                props.class
            )">
                <span :class="{ 'text-muted-foreground': !modelValue }">{{ selectedLabel }}</span>
                <Icon name="tabler:chevron-down" class="size-4 text-muted-foreground transition-transform duration-300"
                    :class="{ 'rotate-180': isOpen }" />
            </div>

            <Transition name="dropdown">
                <div v-if="isOpen"
                    class="absolute z-50 w-full mt-2 bg-popover border border-border rounded-xl p-1 shadow-md overflow-hidden origin-top">
                    <div v-for="option in options" :key="option.value" @click="selectOption(option)" :class="cn(
                        'px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer',
                        modelValue === option.value ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground'
                    )">
                        {{ option.label }}
                    </div>
                </div>
            </Transition>
        </div>
    </div>
</template>

<style scoped>
.dropdown-enter-active,
.dropdown-leave-active {
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.dropdown-enter-from,
.dropdown-leave-to {
    opacity: 0;
    transform: translateY(-8px) scale(0.98);
}
</style>
