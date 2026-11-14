<script setup lang="ts">
import { toast } from 'vue-sonner'

useHead({ title: 'Grupos' })

interface Tenant {
  id: string
  name: string
  hasPassword: boolean
  isActive: boolean
  isMaster: boolean
  createdAt: number
}

const api = useApi()
const tenants = ref<Tenant[]>([])
const loading = ref(true)

const newId = ref('')
const newName = ref('')
const newPassword = ref('')
const creating = ref(false)

const load = async () => {
  try {
    tenants.value = await api.get<Tenant[]>('/api/tenants')
  } catch (e) {
    toast.error('No se pudieron cargar los grupos')
  } finally {
    loading.value = false
  }
}

const errMsg = (e: any) => e?.data?.error || 'Error inesperado'

const create = async () => {
  creating.value = true
  try {
    await api.post('/api/tenants', { id: newId.value, name: newName.value, password: newPassword.value })
    toast.success(`Grupo "${newId.value}" creado`)
    newId.value = newName.value = newPassword.value = ''
    await load()
  } catch (e) {
    toast.error(errMsg(e))
  } finally {
    creating.value = false
  }
}

const setPassword = async (t: Tenant) => {
  const password = window.prompt(`Nueva contraseña para "${t.id}" (mínimo 6 caracteres)`)
  if (!password) return
  try {
    await api.put(`/api/tenants/${encodeURIComponent(t.id)}`, { password })
    toast.success('Contraseña actualizada')
    await load()
  } catch (e) {
    toast.error(errMsg(e))
  }
}

const toggleActive = async (t: Tenant) => {
  try {
    await api.put(`/api/tenants/${encodeURIComponent(t.id)}`, { isActive: !t.isActive })
    await load()
  } catch (e) {
    toast.error(errMsg(e))
  }
}

const copyLink = async (t: Tenant) => {
  await navigator.clipboard.writeText(`${window.location.origin}/ver?clientId=${encodeURIComponent(t.id)}`)
  toast.success('Enlace del visor copiado')
}

onMounted(load)
</script>

<template>
  <main class="flex-1 min-h-0 overflow-y-auto bg-background">
    <div class="w-full max-w-3xl mx-auto px-4 md:px-8 py-6 flex flex-col gap-6">
      <header>
        <h1 class="text-3xl font-bold tracking-tight">Grupos</h1>
        <p class="text-sm text-muted-foreground mt-1">Cada grupo (tenant) entra con su ID y contraseña. El ID también sirve para el enlace del visor.</p>
      </header>

      <GCard class="p-5">
        <form class="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] items-end" @submit.prevent="create">
          <GInput v-model="newId" label="ID" placeholder="mi-iglesia" autocapitalize="off" />
          <GInput v-model="newName" label="Nombre (opcional)" placeholder="Mi Iglesia" />
          <GInput v-model="newPassword" label="Contraseña" type="password" placeholder="mín. 6 caracteres" />
          <GButton type="submit" :disabled="creating || !newId" class="h-10 font-bold">Crear</GButton>
        </form>
      </GCard>

      <div v-if="loading" class="text-sm text-muted-foreground">Cargando…</div>
      <ul v-else class="flex flex-col gap-2">
        <li
          v-for="t in tenants"
          :key="t.id"
          class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-muted/20 px-4 py-3"
          :class="{ 'opacity-60': !t.isActive }"
        >
          <div class="min-w-0">
            <p class="font-bold truncate">
              {{ t.name }}
              <span v-if="t.isMaster" class="ml-2 text-[10px] uppercase tracking-widest rounded-full bg-primary/15 text-primary px-2 py-0.5">Maestro</span>
            </p>
            <p class="text-xs text-muted-foreground font-mono truncate">
              {{ t.id }}
              <span v-if="!t.hasPassword && !t.isMaster" class="ml-2 text-amber-600">· sin contraseña</span>
              <span v-if="!t.isActive" class="ml-2">· desactivado</span>
            </p>
          </div>
          <div class="flex items-center gap-1.5">
            <GButton variant="ghost" size="sm" @click="copyLink(t)" title="Copiar enlace del visor">
              <Icon name="tabler:link" class="size-4" />
            </GButton>
            <GButton v-if="!t.isMaster" variant="ghost" size="sm" @click="setPassword(t)" title="Cambiar contraseña">
              <Icon name="tabler:key" class="size-4" />
            </GButton>
            <GButton v-if="!t.isMaster" variant="ghost" size="sm" @click="toggleActive(t)" :title="t.isActive ? 'Desactivar' : 'Activar'">
              <Icon :name="t.isActive ? 'tabler:player-pause' : 'tabler:player-play'" class="size-4" />
            </GButton>
          </div>
        </li>
      </ul>
    </div>
  </main>
</template>
