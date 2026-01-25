<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { toast } from 'vue-sonner'

const { announcement, setAnnouncement, connect } = useSocket()
const { getAnnouncements, createAnnouncement, deleteAnnouncement } = useApi()

const textInput = ref('')
const isLoading = ref(false)
const history = ref<any[]>([])

const fetchHistory = async () => {
  try {
    history.value = await getAnnouncements()
  } catch (e) {
    toast.error('Error al cargar historial')
  }
}

const sendAnnouncement = async () => {
  if (!textInput.value) return

  isLoading.value = true
  try {
    // 1. Save to history
    await createAnnouncement(textInput.value)
    
    // 2. Activate on screen
    setAnnouncement({
      text: textInput.value,
      active: true
    })

    toast.success('Anuncio enviado y guardado')
    textInput.value = ''
    fetchHistory()
  } catch (e) {
    toast.error('Error al enviar anuncio')
  } finally {
    isLoading.value = false
  }
}

const toggleVisibility = () => {
  setAnnouncement({
    text: announcement.value.text,
    active: !announcement.value.active
  })
}

const resendFromHistory = (item: any) => {
  textInput.value = item.text
  setAnnouncement({
    text: item.text,
    active: true
  })
  toast.success('Anuncio enviado')
}

const deleteItem = async (id: string) => {
  try {
    await deleteAnnouncement(id)
    fetchHistory()
  } catch (e) {
    toast.error('Error al eliminar')
  }
}

onMounted(() => {
  connect()
  fetchHistory()
})
</script>

<template>
  <div class="flex-1 flex flex-col w-full min-h-0 overflow-hidden bg-background">
    <!-- Header -->
    <header class="w-full h-16 px-6 flex items-center justify-between border-b border-border bg-card/30 shrink-0">
      <div class="flex items-center gap-3">
        <div class="size-10 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
          <Icon name="tabler:speakerphone" class="size-6 text-orange-500" />
        </div>
        <div>
          <h1 class="text-lg font-bold tracking-tight">Anuncios</h1>
          <p class="text-[10px] uppercase font-bold tracking-widest text-muted-foreground/60">Lower Third / Cinta de noticias</p>
        </div>
      </div>
    </header>

    <div class="flex-1 flex overflow-hidden">
      <div class="flex-1 grid grid-cols-1 lg:grid-cols-2 min-h-0 overflow-hidden">
        
        <!-- Left Column: Control Panel -->
        <section class="flex flex-col border-r border-border bg-muted/5 overflow-y-auto p-6 md:p-8">
          <div class="space-y-6">
            <div class="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
              <div class="flex items-start justify-between">
                <div>
                  <h2 class="text-lg font-bold">Panel de Control</h2>
                  <p class="text-sm text-muted-foreground">Escribe el mensaje que aparecerá en la parte inferior</p>
                </div>
                <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg border" 
                     :class="announcement.active ? 'bg-green-500/10 border-green-500/20 text-green-600' : 'bg-muted/50 border-transparent text-muted-foreground'">
                  <div class="size-2 rounded-full" :class="announcement.active ? 'bg-green-500 animate-pulse' : 'bg-slate-400'"></div>
                  <span class="text-xs font-bold uppercase tracking-wider">{{ announcement.active ? 'VISUALIZANDO' : 'OCULTO' }}</span>
                </div>
              </div>

              <div class="space-y-4">
                <div class="relative">
                  <textarea 
                    v-model="textInput" 
                    rows="4"
                    class="w-full bg-background border border-border rounded-lg p-4 text-lg focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                    placeholder="Escribe el anuncio aquí..."
                  ></textarea>
                  <div class="absolute bottom-3 right-3 text-xs text-muted-foreground">
                    {{ textInput.length }} caracteres
                  </div>
                </div>

                <div class="flex items-center gap-3">
                  <GButton 
                    @click="sendAnnouncement" 
                    size="lg" 
                    class="flex-1"
                    :disabled="!textInput || isLoading"
                  >
                    <Icon name="tabler:send" class="size-5 mr-2" />
                    Enviar al Aire
                  </GButton>

                  <GButton 
                    v-if="announcement.text"
                    @click="toggleVisibility" 
                    variant="secondary" 
                    size="lg"
                    :class="announcement.active ? 'border-red-500/20 text-red-500 hover:bg-red-500/10' : ''"
                  >
                    <Icon :name="announcement.active ? 'tabler:eye-off' : 'tabler:eye'" class="size-5 mr-2" />
                    {{ announcement.active ? 'Ocultar' : 'Mostrar' }}
                  </GButton>
                </div>
              </div>
            </div>

            <!-- Current Active Preview -->
            <div v-if="announcement.text" class="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
              <h3 class="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                <Icon name="tabler:broadcast" class="size-4" />
                Texto Actual en el Visor
              </h3>
              <div class="bg-muted/30 p-5 rounded-lg border border-border/50 font-bold text-xl italic break-words leading-relaxed text-center">
                {{ announcement.text }}
              </div>
            </div>
          </div>
        </section>

        <!-- Right Column: History -->
        <section class="flex flex-col overflow-hidden bg-background p-6 md:p-8 space-y-4">
          <div class="flex items-center justify-between shrink-0">
            <h3 class="text-sm font-bold uppercase tracking-widest text-muted-foreground">Historial Reciente</h3>
            <span v-if="history.length" class="text-[10px] bg-muted px-2 py-0.5 rounded-full font-bold text-muted-foreground uppercase tracking-widest">
              {{ history.length }} anuncios
            </span>
          </div>
          
          <div class="flex-1 overflow-y-auto min-h-0 pr-2 -mr-2">
            <div v-if="isLoading && !history.length" class="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
              <GSkeleton class="w-full h-24 rounded-xl" />
              <GSkeleton class="w-full h-24 rounded-xl opacity-70" />
              <GSkeleton class="w-full h-24 rounded-xl opacity-40" />
            </div>

            <div v-else-if="history.length === 0" class="flex flex-col items-center justify-center h-full text-center border-2 border-dashed border-border rounded-2xl bg-muted/5 lg:my-10">
              <Icon name="tabler:history" class="size-12 text-muted-foreground/20 mb-4" />
              <p class="text-sm text-muted-foreground font-medium">No hay historial de anuncios</p>
              <p class="text-xs text-muted-foreground/60 mt-1 italic">Los mensajes que envíes aparecerán aquí</p>
            </div>

            <div v-else class="grid gap-4 pb-4">
              <div 
                v-for="item in history" 
                :key="item.id"
                class="group flex flex-col p-5 bg-card hover:bg-muted/20 border border-border hover:border-primary/20 rounded-xl transition-all shadow-sm active:scale-[0.99] cursor-default"
                @dblclick="resendFromHistory(item)"
              >
                <div class="flex items-start justify-between mb-3">
                  <div class="flex flex-col min-w-0 pr-4">
                    <span class="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-1">
                      {{ new Date(item.createdAt).toLocaleDateString() }} - {{ new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
                    </span>
                    <p class="text-base font-bold text-foreground leading-tight">{{ item.text }}</p>
                  </div>
                  
                  <div class="flex items-center gap-1 shrink-0">
                    <GButton @click="resendFromHistory(item)" variant="secondary" size="icon" class="size-8 rounded-lg" title="Enviar directamente">
                      <Icon name="tabler:send" class="size-4" />
                    </GButton>
                    <GButton @click="deleteItem(item.id)" variant="ghost" size="icon" class="size-8 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-500/10" title="Eliminar">
                      <Icon name="tabler:trash" class="size-4" />
                    </GButton>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  </div>
</template>
