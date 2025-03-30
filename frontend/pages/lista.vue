<script setup lang="ts">
import {
  Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger,
  DialogHeader, DialogFooter, DialogClose
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'vue-sonner';

const { apiUrl } = useRuntimeConfig().app;

const searchQuery = ref('');
const dialogOpen = ref(false);
const selectedSong = ref<Song | null>(null);

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

// Usar useAsyncData para la carga inicial
const { data: songs, refresh: refreshSongs, status: songsStatus } = await useAsyncData(
  'songs',
  () => $fetch<Song[]>(`${apiUrl}/api/cantos`)
);

// Usar useAsyncData para la búsqueda
const { data: searchResults, status: searchStatus, refresh: refreshSearch } = await useAsyncData(
  'songSearch',
  async () => {
    if (!searchQuery.value) return { results: [] };
    return $fetch<{ results: Song[] }>(`${apiUrl}/search?q=${searchQuery.value}`);
  },
  {
    watch: [searchQuery],
    immediate: false
  }
);

// Computed para los resultados mostrados
const displayedSongs = computed(() => {
  if (searchQuery.value && searchResults.value?.results) {
    return searchResults.value.results;
  }
  return songs.value || [];
});

// Computed para el estado de carga
const isLoading = computed(() => {
  return songsStatus.value === 'pending' || searchStatus.value === 'pending';
});

// Computed para determinar si es un nuevo canto o una edición
const isNewSong = computed(() => {
  return selectedSong.value === null;
});

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
    if (isNewSong.value) {
      // Add new song
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
        await refreshSongs();
        toast.success("Canto añadido exitosamente.");
      }
    } else if (selectedSong.value) {
      // Edit existing song
      const res = await $fetch(`${apiUrl}/api/canto`, {
        method: "PUT",
        body: { ...formData.value, "id": selectedSong.value.id },
      });
      
      if (res) {
        await refreshSongs();
        toast.success("Canto actualizado exitosamente.");
      }
    }
    
    // Reset form and close dialog
    formData.value = { title: '', type: 'Congregacional', nh: 0, content: '' };
    dialogOpen.value = false;
    selectedSong.value = null;
  } catch (error) {
    console.error("Error al guardar el canto:", error);
    toast.error(isNewSong.value ? "Error al añadir el canto." : "Error al actualizar el canto.");
  }
}

async function deleteItem(id: string) {
  try {
    await $fetch(`${apiUrl}/api/canto/${id}`, {
      method: 'DELETE'
    });
    await refreshSongs();
    toast.warning("Canto eliminado exitosamente.");
  } catch (error) {
    toast.error("Error al eliminar el canto.");
  }
}

// Debounce optimizado para TypeScript
const debounce = <T extends (...args: any[]) => any>(fn: T, delay: number) => {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      fn(...args);
    }, delay);
  };
};

const searchDebounce = debounce(async () => {
  await refreshSearch();
}, 200);

watch(searchQuery, () => {
  if (searchQuery.value.length < 1) {
    searchResults.value = { results: [] };
  } else {
    searchDebounce();
  }
});
</script>

<template>
  <main class="px-4 pb-16 relative">
    <div class="relative w-full items-center mb-2 max-w-4xl mx-auto">
      <Input id="search" type="text"
        placeholder="Buscar..." class="pl-10" v-model="searchQuery"/>
      <span class="absolute start-0 inset-y-0 flex items-center justify-center pl-4">
        <Icon name="tabler:search" class="size-4 text-muted-foreground" />
      </span>
    </div>

    <!-- Grid Layout -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 relative w-full min-h-[70svh] max-h-[70svh] overflow-scroll" v-auto-animate>
      <div
        v-for="(song, index) in displayedSongs"
        :key="song.id"
        class="p-4 border rounded-lg shadow-sm hover:shadow-md transition-shadow min-h-20 max-h-20"
      >
        <div class="flex justify-between items-start mb-2">
          <div>
            <h3 class="font-medium">{{ song?.title }}</h3>
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon
                :name="song.type === 'Especial' ? 'tabler:user-circle' : 'tabler:book'"
                class="size-3 opacity-50"
              />
              {{ song.type }}
              <span v-if="song.type === 'Congregacional'">#{{ song.nh }}</span>
            </div>
          </div>
          <div class="flex gap-2">
            <Button 
              size="sm" 
              variant="ghost" 
              @click="openEditDialog(song)"
            >
              <Icon name="tabler:pencil" class="size-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              class="text-destructive hover:text-destructive"
              @click="deleteItem(song.id)"
            >
              <Icon name="tabler:trash" class="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <div v-if="displayedSongs.length === 0" class="col-span-full text-center text-muted-foreground">
        No se encontraron resultados.
      </div>
    </div>

    <!-- Indicador de carga -->
    <div v-if="isLoading" class="flex justify-center mt-6">
      <Icon name="tabler:loader-2" class="animate-spin size-6" />
    </div>

    <!-- Add Button -->
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="lg" class="fixed bottom-5 right-5 rounded-full shadow-lg" @click="openAddDialog">
            <Icon name="tabler:plus" class="size-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Añadir</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>

    <!-- Unified Dialog for Add/Edit -->
    <ClientOnly>
      <Dialog @update:open="(e: boolean) => dialogOpen = e" :open="dialogOpen">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {{ isNewSong ? 'Añadir un canto' : `Editando "${formData.title}"` }}
            </DialogTitle>
            <DialogDescription>
              {{ isNewSong 
                ? 'Ingrese la información correspondiente. Recuerde que al usar palabras clave en una sola línea, se considerará como una etiqueta especial.'
                : 'Modifique la información del canto y presione "Guardar" para guardar los cambios.'
              }}
            </DialogDescription>
          </DialogHeader>
          <form @submit.prevent="saveItem">
            <div class="space-y-4" v-auto-animate>
              <div>
                <Label for="title" class="block text-sm font-medium text-gray-700">Título</Label>
                <Input
                    v-model="formData.title"
                    id="title"
                    type="text"
                    required
                    class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <Label for="type" class="block text-sm font-medium text-gray-700">Tipo</Label>
                <Select name="type" default-value="Congregacional" class="w-full" v-model="formData.type">
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione una opción"/>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="Congregacional">
                        Congregacional
                      </SelectItem>
                      <SelectItem value="Especial">
                        Especial
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div v-if="formData.type !== undefined && formData.type !== null && formData.type === 'Congregacional'">
                <Label for="nh" class="block text-sm font-medium text-gray-700">Número de himno</Label>
                <Input
                    v-model="formData.nh"
                    id="nh"
                    type="number"
                    required
                    class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <Label for="content" class="block text-sm font-medium text-gray-700">Contenido</Label>
                <Textarea
                    v-model="formData.content"
                    id="content"
                    rows="4"
                    required
                    class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                ></Textarea>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline"
                          @click="dialogOpen = false;formData = { title: '', type: 'Congregacional', nh: 0, content: '' }">
                    <Icon name="tabler:x" class="size-3"/>
                    Cancelar
                  </Button>
                </DialogClose>
                <Button type="submit" :disabled="isLoading">
                  <Icon :name="isNewSong ? 'tabler:plus' : 'tabler:check'" class="size-3"/>
                  <span v-if="isLoading">Cargando...</span>
                  <span v-else>{{ isNewSong ? 'Añadir Canto' : 'Guardar Cambios' }}</span>
                </Button>
              </DialogFooter>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </ClientOnly>
  </main>
</template>
