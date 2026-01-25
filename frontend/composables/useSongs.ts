import type { Song } from '@/types/song'
import { toast } from 'vue-sonner'

export type SongFilter = 'Canto' | 'Especial' | 'Todos'

export const useSongs = () => {
  const api = useApi()
  const songs = ref<Song[] | null>(null)
  const isLoading = ref(false)
  
  // State for UI
  const searchTerm = ref('')
  const activeFilter = ref<SongFilter>('Todos')
  const isSheetOpen = ref(false) // Changed from dialogOpen to isSheetOpen for clarity
  const selectedSong = ref<Song | null>(null)

  const initialFormData = {
    title: '',
    type: 'Canto',
    nh: 0,
    content: ''
  }

  const formData = ref({ ...initialFormData })

  const getSongs = async () => {
    isLoading.value = true
    try {
      const data = await api.getSongs()
      songs.value = data as Song[]
    } catch (error) {
      console.error("Error al obtener cantos:", error)
      toast.error("Error al cargar los cantos")
    } finally {
      isLoading.value = false
    }
  }

  const filteredSongs = computed(() => {
    let result = songs.value || []

    // 1. Text Search
    if (searchTerm.value?.trim()) {
      const term = searchTerm.value.toLowerCase().trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
      
      result = result.filter(song =>
        (song.title ?? '').toLowerCase().includes(term) || (String(song.nh) ?? '').includes(term)
      )
    }

    // 2. Type Filter
    if (activeFilter.value !== 'Todos') {
      result = result.filter(song => song.type === activeFilter.value)
    }

    return result
  })

  const isNewSong = computed(() => selectedSong.value === null)

  function openCreatesSheet() {
    selectedSong.value = null
    formData.value = { ...initialFormData }
    isSheetOpen.value = true
  }

  function openEditSheet(song: Song) {
    selectedSong.value = song
    formData.value = { 
      title: song.title,
      type: song.type,
      nh: song.nh,
      content: song.content
    }
    isSheetOpen.value = true
  }

  async function saveSong() {
    try {
      isLoading.value = true
      
      const payload = {
        title: formData.value.title,
        type: formData.value.type,
        nh: formData.value.type === 'Canto' ? formData.value.nh : 0,
        content: formData.value.content
      }

      let res
      if (isNewSong.value) {
        res = await api.createSong(payload)
        if (res) toast.success("Canto añadido exitosamente.")
      } else if (selectedSong.value) {
        res = await api.updateSong({ ...payload, "id": selectedSong.value.id })
        if (res) toast.success("Canto actualizado exitosamente.")
      }

      await getSongs()
      isSheetOpen.value = false
    } catch (error) {
      console.error("Error al guardar el canto:", error)
      toast.error(isNewSong.value ? "Error al añadir el canto." : "Error al actualizar el canto.")
    } finally {
      isLoading.value = false
    }
  }

  async function deleteSong(id: string) {
    try {
      if(!confirm("¿Estás seguro de que quieres eliminar este canto?")) return;
      
      await api.deleteSong(id)
      toast.warning("Canto eliminado exitosamente.")
      await getSongs()
    } catch (error) {
      console.error("Error al eliminar el canto:", error)
      toast.error("Error al eliminar el canto.")
    }
  }

  return {
    songs,
    isLoading,
    searchTerm,
    activeFilter,
    filteredSongs,
    isSheetOpen,
    formData,
    isNewSong,
    selectedSong,
    getSongs,
    openCreatesSheet,
    openEditSheet,
    saveSong,
    deleteSong
  }
}
