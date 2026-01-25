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

// Usamos computed con get/set para modelValue para mantener la reactividad correcta con v-model
const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})
</script>

<template>
  <GDialog v-model="isOpen" :title="isNew ? 'Añadir un canto' : `Editando canto`"
    :description="isNew ? 'Completa los campos para añadir un nuevo canto a la biblioteca.' : 'Modifica los campos necesarios y guarda los cambios.'">
    <form id="song-form" @submit.prevent="$emit('save')" class="space-y-5">
      <GInput label="Título" v-model="formData.title" placeholder="Nombre del canto..." required />

      <GSelect label="Categoría" v-model="formData.type" :options="typeOptions" />

      <div class="min-h-[80px]">
        <Transition name="fade" mode="out-in">
          <div v-if="formData.type === 'Canto'" key="nh-input">
            <GInput label="Número de himno" v-model="formData.nh" type="number" required />
          </div>
          <div v-else key="empty" class="h-0"></div>
        </Transition>
      </div>

      <GInput label="Contenido" v-model="formData.content" type="textarea" :rows="10"
        placeholder="Escribe la letra aquí..." required />
    </form>

    <template #footer>
      <GButton type="button" variant="ghost" @click="isOpen = false">
        Cancelar
      </GButton>
      <GButton type="submit" form="song-form" :loading="isLoading">
        {{ isNew ? 'Añadir Canto' : 'Guardar Cambios' }}
      </GButton>
    </template>
  </GDialog>
</template>
