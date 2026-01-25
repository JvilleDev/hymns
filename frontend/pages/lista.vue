<script setup lang="ts">
import SongToolbar from '@/components/songs/SongToolbar.vue';
import SongSheet from '@/components/songs/SongSheet.vue';
import SongList from '@/components/songs/SongList.vue';

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

onMounted(() => getSongs())
</script>

<template>
  <main class="h-screen flex flex-col w-full bg-background">
    <div class="px-6 pt-8 pb-4 shrink-0">
      <div class="mb-6">
        <h1 class="text-3xl font-bold mb-2 text-foreground tracking-tight">
          Biblioteca
        </h1>
        <p class="text-muted-foreground text-sm">
          Gestiona tus cantos e himnos
        </p>
      </div>

      <!-- Barra de herramientas (Search & Filters) -->
      <SongToolbar 
        v-model:search-term="searchTerm"
        v-model:active-filter="activeFilter"
      />
    </div>

    <!-- Lista tipo Tabla (Scrollable Area) -->
    <div class="flex-1 min-h-0 w-full px-6 pb-6 overflow-y-auto">
      <SongList 
        :songs="filteredSongs" 
        :is-loading="isLoading" 
        @edit="openEditSheet" 
        @delete="deleteSong" 
        class="h-full"
      />
    </div>

    <!-- Botón flotante -->
    <GButton 
      size="lg" 
      class="fixed bottom-8 right-8 rounded-full shadow-2xl p-0 w-14 h-14 bg-primary text-primary-foreground hover:bg-primary/90 transition-all hover:scale-105 z-50" 
      @click="openCreatesSheet"
      tooltip="Añadir nuevo canto"
    >
      <Icon name="tabler:plus" class="size-6" />
    </GButton>

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
