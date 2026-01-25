<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean
  formData: {
    title: string
    type: string
    nh: number
    content: string
  }
  isNew: boolean
  isLoading: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'save'): void
}>()

const typeOptions = [
  { label: 'Canto', value: 'Canto' },
  { label: 'Especial', value: 'Especial' }
]

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})
</script>

<template>
  <GSheet 
    v-model="isOpen" 
    :title="isNew ? 'Nuevo Canto' : 'Editar Canto'"
    :description="isNew ? 'Añade un nuevo canto a tu colección.' : 'Modifica los detalles del canto seleccionado.'"
    class="md:min-w-[500px] w-full"
  >
    <form id="sheet-form" @submit.prevent="$emit('save')" class="flex flex-col h-full">
      <div class="flex-1 space-y-6 overflow-y-auto pr-2">
        <!-- Header Image or Icon Placeholder (Notion style aesthetic) -->
        <div class="h-32 bg-gradient-to-r from-primary/10 to-blue-500/10 rounded-lg flex items-center justify-center mb-6 border border-border/50">
          <Icon name="tabler:music" class="size-12 text-primary/40" />
        </div>

        <div class="space-y-4">
            <GInput label="Título" v-model="formData.title" placeholder="Ej. Sublime Gracia" required class="text-lg font-bold" />

            <div class="grid grid-cols-2 gap-4">
                <GSelect label="Categoría" v-model="formData.type" :options="typeOptions" />
                <div v-if="formData.type === 'Canto'">
                     <GInput label="Número" v-model="formData.nh" type="number" required />
                </div>
            </div>

            <div class="space-y-2">
                <label class="text-sm font-medium text-muted-foreground">Letra / Contenido</label>
                <textarea 
                    v-model="formData.content" 
                    rows="15"
                    class="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none font-mono leading-relaxed"
                    placeholder="Escribe la letra del canto aquí..."
                    required
                ></textarea>
            </div>
        </div>
      </div>

      <!-- Footer Actions -->
      <div class="pt-6 mt-4 border-t border-border flex justify-end gap-3 bg-background">
        <GButton type="button" variant="ghost" @click="isOpen = false">
          Cancelar
        </GButton>
        <GButton type="submit" :loading="isLoading">
          Guardar Cambios
        </GButton>
      </div>
    </form>
  </GSheet>
</template>
