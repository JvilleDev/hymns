<script setup lang="ts">
import { toast } from 'vue-sonner';

const searchTerm = ref('');
const dialogOpen = ref(false);
const selectedSong = ref<Song | null>(null);
const searchResults = ref<{ results: Song[] } | null>(null);
const songs = ref<Song[] | null>(null);
const isLoading = ref(false);

const formData = ref({
  title: '',
  type: 'Congregacional',
  nh: 0,
  content: ''
});

interface Song {
  id: string;
  title: string;
  type: string;
  nh: number;
  content: string;
}

const config = useRuntimeConfig()
const { apiUrl } = config.public

const getSongs = async () => {
  isLoading.value = true;
  try {
    songs.value = await $fetch(`${apiUrl}/api/cantos`) as unknown as Song[];
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => getSongs())

const filteredSongs = computed(() => {
  if (!searchTerm.value?.trim() || !songs.value) {
    return songs.value || []
  }
  const term = searchTerm.value.toLowerCase().trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")

  return songs.value.filter(song =>
    (song.title ?? '').toLowerCase().includes(term) || (String(song.nh) ?? '').includes(term)
  )
})

const isNewSong = computed(() => selectedSong.value === null);

function openAddDialog() {
  selectedSong.value = null;
  formData.value = { title: '', type: 'Congregacional', nh: 0, content: '' };
  dialogOpen.value = true;
}

async function openEditDialog(song: Song) {
  selectedSong.value = song;
  formData.value = { ...song };
  dialogOpen.value = true;
}

async function saveItem() {
  try {
    isLoading.value = true;
    if (isNewSong.value) {
      const newSong = {
        title: formData.value.title,
        type: formData.value.type,
        nh: formData.value.type === 'Congregacional' ? formData.value.nh : 0,
        content: formData.value.content
      };

      const res = await $fetch(`${apiUrl}/api/canto`, {
        method: 'POST',
        body: newSong,
      });

      if (res) {
        toast.success("Canto añadido exitosamente.");
      }
    } else if (selectedSong.value) {
      const res = await $fetch(`${apiUrl}/api/canto`, {
        method: "PUT",
        body: { ...formData.value, "id": selectedSong.value.id },
      });

      if (res) {
        toast.success("Canto actualizado exitosamente.");
      }
    }

    await getSongs();
    dialogOpen.value = false;
  } catch (error) {
    console.error("Error al guardar el canto:", error);
    toast.error(isNewSong.value ? "Error al añadir el canto." : "Error al actualizar el canto.");
  } finally {
    isLoading.value = false;
  }
}

async function deleteItem(id: string) {
  try {
    await $fetch(`${apiUrl}/api/canto/${id}`, { method: 'DELETE' });
    toast.warning("Canto eliminado exitosamente.");
    await getSongs();
  } catch (error) {
    toast.error("Error al eliminar el canto.");
  }
}

const typeOptions = [
  { label: 'Congregacional', value: 'Congregacional' },
  { label: 'Especial', value: 'Especial' }
];
</script>

<template>
  <main class="px-4 py-8 relative max-w-7xl mx-auto min-h-screen">
    <div class="mb-12">
      <h1
        class="text-2xl font-bold mb-2 text-foreground text-center tracking-tight">
        Gestión de Cantos</h1>
      <p class="text-muted-foreground text-sm text-center">Administra la biblioteca de himnos y cantos especiales</p>
    </div>

    <div class="relative w-full max-w-2xl mx-auto mb-10">
      <GInput v-model="searchTerm" placeholder="Buscar por título o número..." class="pl-11" />
      <Icon name="tabler:search" class="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground/70" />
    </div>

    <div v-if="!isLoading" v-auto-animate>
      <div v-if="filteredSongs.length > 0" class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <GCard v-for="song in filteredSongs" :key="song.id" class="group">
          <div class="flex justify-between items-start gap-4">
            <div class="flex-1 min-w-0">
              <h3 class="font-bold text-lg truncate group-hover:text-primary transition-colors">{{ song?.title }}</h3>
              <div class="flex items-center gap-2 mt-1">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                  :class="song.type === 'Especial' ? 'bg-primary/10 text-primary' : 'bg-blue-500/10 text-blue-500'">
                  {{ song.type }}
                </span>
                <span v-if="song.type === 'Congregacional'"
                  class="text-xs font-mono text-muted-foreground bg-white/5 px-2 py-0.5 rounded">
                  #{{ song.nh }}
                </span>
              </div>
            </div>
            <div class="flex gap-1">
              <GButton size="icon" variant="ghost" @click="openEditDialog(song)" tooltip="Editar canto">
                <Icon name="tabler:pencil" class="size-4" />
              </GButton>
              <GButton size="icon" variant="ghost" class="text-destructive hover:bg-destructive/10"
                @click="deleteItem(song.id)" tooltip="Eliminar canto">
                <Icon name="tabler:trash" class="size-4" />
              </GButton>
            </div>
          </div>
        </GCard>
      </div>

      <div v-else class="py-20 text-center border border-border rounded-xl bg-muted/20">
        <Icon name="tabler:mood-empty" class="size-12 text-muted-foreground/30 mx-auto mb-4" />
        <p class="text-muted-foreground font-medium">No se encontraron resultados.</p>
      </div>
    </div>

    <!-- Indicador de carga -->
    <div v-if="isLoading" class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      <GSkeleton v-for="i in 6" :key="i" class="h-32" />
    </div>

    <!-- Floating Add Button -->
    <GButton size="lg" class="fixed bottom-8 right-8 rounded-2xl shadow-2xl p-0 w-14 h-14" @click="openAddDialog"
      tooltip="Añadir nuevo canto">
      <Icon name="tabler:plus" class="size-6" />
    </GButton>

    <GDialog v-model="dialogOpen" :title="isNewSong ? 'Añadir un canto' : `Editando canto`"
      :description="isNewSong ? 'Completa los campos para añadir un nuevo canto a la biblioteca.' : 'Modifica los campos necesarios y guarda los cambios.'">
      <form id="song-form" @submit.prevent="saveItem" class="space-y-5">
        <GInput label="Título" v-model="formData.title" placeholder="Nombre del canto..." required />

        <GSelect label="Categoría" v-model="formData.type" :options="typeOptions" />

        <div class="min-h-[80px]">
          <Transition name="fade" mode="out-in">
            <div v-if="formData.type === 'Congregacional'" key="nh-input">
              <GInput label="Número de himno" v-model="formData.nh" type="number" required />
            </div>
            <div v-else key="empty" class="h-0"></div>
          </Transition>
        </div>

        <GInput label="Contenido" v-model="formData.content" type="textarea" :rows="10"
          placeholder="Escribe la letra aquí..." required />
      </form>

      <template #footer>
        <GButton type="button" variant="ghost" @click="dialogOpen = false">
          Cancelar
        </GButton>
        <GButton type="submit" form="song-form" :loading="isLoading">
          {{ isNewSong ? 'Añadir Canto' : 'Guardar Cambios' }}
        </GButton>
      </template>
    </GDialog>
  </main>
</template>
