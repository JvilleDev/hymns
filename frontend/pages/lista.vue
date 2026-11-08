<script setup lang="ts">
import SongToolbar from '@/components/songs/SongToolbar.vue';
import SongSheet from '@/components/songs/SongSheet.vue';
import SongList from '@/components/songs/SongList.vue';
import SongViewSheet from '@/components/songs/SongViewSheet.vue';

useHead({ title: 'Lista' })

const {
  songs: _songs,
  isLoading,
  searchTerm,
  activeFilter,
  filteredSongs,
  isSheetOpen,
  formData,
  isNewSong,
  getSongs,
  openCreatesSheet,
  openEditSheet,
  saveSong,
  deleteSong
} = useSongs()

const { isAdmin } = useAuth()

// Vista de solo lectura: cualquiera puede ver la letra completa
const viewSong = ref<any>(null)
const isViewOpen = ref(false)
const openView = (song: any) => {
  viewSong.value = song
  isViewOpen.value = true
}
const editFromView = (song: any) => {
  isViewOpen.value = false
  openEditSheet(song)
}
const deleteFromView = async (id: string) => {
  await deleteSong(id)
  // si se canceló la confirmación el canto sigue ahí y la vista se mantiene
  if (!_songs.value.some((s: any) => s.id === id)) isViewOpen.value = false
}

onMounted(() => {
  getSongs()
})
</script>

<template>
  <main class="flex-1 min-h-0 flex flex-col w-full bg-background">
    <div class="flex-1 min-h-0 w-full overflow-y-auto">
      <div class="w-full max-w-5xl mx-auto px-4 md:px-8 py-5 md:py-8 flex flex-col gap-5">
        <SongToolbar
          v-model:search-term="searchTerm"
          v-model:active-filter="activeFilter"
        />

        <div class="flex items-center justify-between gap-3 px-1 min-h-10">
          <p class="text-base text-muted-foreground tabular-nums" aria-live="polite">
            <template v-if="isLoading">Cargando cantos…</template>
            <template v-else>
              <span class="font-semibold text-foreground">{{ filteredSongs.length }}</span>
              {{ filteredSongs.length === 1 ? 'canto' : 'cantos' }}
              <template v-if="searchTerm"> para “{{ searchTerm }}”</template>
            </template>
          </p>
          <NuxtLink
            v-if="!isAdmin"
            :to="{ path: '/login', query: { redirect: $route.fullPath } }"
            class="inline-flex items-center gap-2 rounded-xl bg-muted/60 hover:bg-muted text-sm font-semibold px-4 py-2.5 transition-colors"
          >
            <Icon name="tabler:lock" class="size-4" />
            Iniciar sesión para editar
          </NuxtLink>
          <button
            v-if="isAdmin"
            type="button"
            @click="openCreatesSheet"
            class="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-semibold px-4 py-2.5 transition-colors active:scale-95"
          >
            <Icon name="tabler:plus" class="size-4" />
            Nuevo canto
          </button>
        </div>

        <SongList
          :songs="filteredSongs"
          :is-loading="isLoading"
          :is-admin="isAdmin"
          @view="openView"
          @edit="openEditSheet"
          @delete="deleteSong"
        />
      </div>
    </div>

    <SongViewSheet
      v-model="isViewOpen"
      :song="viewSong"
      :is-admin="isAdmin"
      @edit="editFromView"
      @delete="deleteFromView"
    />

    <!-- Side Sheet de creación/edición -->
    <SongSheet
      v-model="isSheetOpen"
      :form-data="formData"
      :is-new="isNewSong"
      :is-loading="isLoading"
      @save="saveSong"
    />
  </main>
</template>
