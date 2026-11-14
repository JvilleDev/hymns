<script setup lang="ts">
import { toast } from 'vue-sonner'

useHead({ title: 'Cuentas' })

interface Tenant {
  id: string
  name: string
  hasPassword: boolean
  isActive: boolean
  isMaster: boolean
  createdAt: number
}

type StatusFilter = 'all' | 'active' | 'inactive'

const api = useApi()
const { confirmDialog } = useDialog()

const tenants = ref<Tenant[]>([])
const loading = ref(true)
const search = ref('')
const status = ref<StatusFilter>('all')

const statusOptions: { label: string; value: StatusFilter }[] = [
  { label: 'Todas', value: 'all' },
  { label: 'Activas', value: 'active' },
  { label: 'Desactivadas', value: 'inactive' },
]
const statusIndex = computed(() => statusOptions.findIndex(o => o.value === status.value))

const errMsg = (e: any) => e?.data?.error || 'Error inesperado'

const load = async () => {
  try {
    tenants.value = await api.get<Tenant[]>('/api/tenants')
  } catch (e) {
    toast.error('No se pudieron cargar las cuentas')
  } finally {
    loading.value = false
  }
}

// -- Métricas y filtrado --
const stats = computed(() => ({
  total: tenants.value.length,
  active: tenants.value.filter(t => t.isActive).length,
  noPassword: tenants.value.filter(t => !t.hasPassword && !t.isMaster).length,
}))

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return tenants.value
    .filter(t => (status.value === 'all' ? true : status.value === 'active' ? t.isActive : !t.isActive))
    .filter(t => !q || t.id.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
    .sort((a, b) => Number(b.isMaster) - Number(a.isMaster) || b.createdAt - a.createdAt)
})

// -- Presentación --
const initials = (t: Tenant) => (t.name || t.id).replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9 ]/g, ' ').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
const HUES = [221, 262, 172, 24, 340, 198, 142, 38]
const hue = (id: string) => HUES[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length]
const created = (ts: number) => new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })

const randomPassword = () => {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return [...bytes].map(b => chars[b % chars.length]).join('')
}

const copy = async (text: string, msg: string) => {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(msg)
  } catch {
    toast.error('No se pudo copiar')
  }
}
const copyLink = (t: Tenant) => copy(`${window.location.origin}/ver?clientId=${encodeURIComponent(t.id)}`, 'Enlace del visor copiado')

// -- Crear --
const createOpen = ref(false)
const newId = ref('')
const newName = ref('')
const newPassword = ref('')
const showNewPassword = ref(false)
const creating = ref(false)
const idValid = computed(() => /^[A-Za-z0-9_-]{3,64}$/.test(newId.value))

const openCreate = () => {
  newId.value = newName.value = ''
  newPassword.value = randomPassword()
  showNewPassword.value = true
  createOpen.value = true
}

const create = async () => {
  creating.value = true
  try {
    await api.post('/api/tenants', { id: newId.value, name: newName.value, password: newPassword.value })
    toast.success(`Cuenta "${newId.value}" creada`)
    createOpen.value = false
    await load()
  } catch (e) {
    toast.error(errMsg(e))
  } finally {
    creating.value = false
  }
}

// -- Contraseña --
const pwTarget = ref<Tenant | null>(null)
const pwValue = ref('')
const showPw = ref(false)
const savingPw = ref(false)

const openPassword = (t: Tenant) => {
  pwTarget.value = t
  pwValue.value = randomPassword()
  showPw.value = true
}

const savePassword = async () => {
  if (!pwTarget.value) return
  savingPw.value = true
  try {
    await api.put(`/api/tenants/${encodeURIComponent(pwTarget.value.id)}`, { password: pwValue.value })
    toast.success('Contraseña actualizada')
    pwTarget.value = null
    await load()
  } catch (e) {
    toast.error(errMsg(e))
  } finally {
    savingPw.value = false
  }
}

// -- Activar / desactivar --
const toggleActive = async (t: Tenant) => {
  if (t.isActive && !(await confirmDialog(`"${t.name}" no podrá iniciar sesión mientras esté desactivada.`, { title: 'Desactivar cuenta', confirmLabel: 'Desactivar', destructive: true }))) return
  try {
    await api.put(`/api/tenants/${encodeURIComponent(t.id)}`, { isActive: !t.isActive })
    await load()
  } catch (e) {
    toast.error(errMsg(e))
  }
}

onMounted(load)
</script>

<template>
  <main class="flex-1 min-h-0 overflow-y-auto bg-background">
    <div class="w-full max-w-[1400px] mx-auto px-4 md:px-8 xl:px-10 py-6 md:py-8 flex flex-col gap-6">
      <!-- Encabezado -->
      <header class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-3xl md:text-4xl font-bold tracking-tight">Cuentas</h1>
          <p class="mt-1.5 text-muted-foreground">Quién puede entrar y con qué credenciales.</p>
        </div>
        <GButton class="font-bold gap-2" @click="openCreate">
          <Icon name="tabler:plus" class="size-5" />
          Nueva cuenta
        </GButton>
      </header>

      <!-- Métricas -->
      <div class="grid grid-cols-3 gap-3">
        <div v-for="m in [
          { label: 'Cuentas', value: stats.total, icon: 'tabler:users', tone: 'text-primary bg-primary/10' },
          { label: 'Activas', value: stats.active, icon: 'tabler:circle-check', tone: 'text-emerald-600 bg-emerald-500/10' },
          { label: 'Sin contraseña', value: stats.noPassword, icon: 'tabler:key-off', tone: 'text-amber-600 bg-amber-500/10' },
        ]" :key="m.label" class="flex items-center gap-3 sm:gap-4 rounded-2xl bg-muted/40 px-4 sm:px-5 py-4">
          <span class="hidden sm:flex size-11 shrink-0 items-center justify-center rounded-xl" :class="m.tone">
            <Icon :name="m.icon" class="size-6" />
          </span>
          <div class="min-w-0">
            <Transition name="count" mode="out-in">
              <p :key="m.value" class="text-2xl sm:text-3xl font-bold tabular-nums leading-none">{{ m.value }}</p>
            </Transition>
            <p class="mt-1 text-xs sm:text-sm text-muted-foreground truncate">{{ m.label }}</p>
          </div>
        </div>
      </div>

      <!-- Búsqueda y filtro -->
      <div class="flex flex-col md:flex-row md:items-center gap-3">
        <div class="relative flex-1">
          <Icon name="tabler:search" class="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground pointer-events-none" />
          <input
            v-model="search"
            type="search"
            aria-label="Buscar cuenta"
            placeholder="Buscar por nombre o ID"
            class="w-full rounded-2xl bg-muted/60 pl-12 pr-4 py-3.5 text-base font-medium outline-none border-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground placeholder:font-normal"
          />
        </div>
        <div class="relative grid grid-cols-3 p-1 rounded-2xl bg-muted/60 shrink-0 md:w-96" role="group" aria-label="Estado">
          <span
            class="status-pill absolute top-1 bottom-1 left-1 rounded-xl bg-primary shadow-sm shadow-primary/30"
            :style="{ transform: `translateX(${statusIndex * 100}%)` }"
            aria-hidden="true"
          />
          <button
            v-for="o in statusOptions"
            :key="o.value"
            type="button"
            :aria-pressed="status === o.value"
            class="relative z-10 px-3 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors duration-200"
            :class="status === o.value ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
            @click="status = o.value"
          >{{ o.label }}</button>
        </div>
      </div>

      <!-- Contenido -->
      <Transition name="swap" mode="out-in">
        <div v-if="loading" key="loading" class="grid gap-3 grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3">
          <div v-for="i in 6" :key="i" class="rounded-3xl bg-muted/40 p-5 space-y-4 skeleton-in" :style="{ '--i': i }">
            <div class="flex items-center gap-4">
              <GSkeleton class="size-12 rounded-2xl" />
              <div class="flex-1 space-y-2"><GSkeleton class="h-5 w-1/2" /><GSkeleton class="h-4 w-1/3" /></div>
            </div>
            <GSkeleton class="h-9 w-full" />
          </div>
        </div>

        <div v-else-if="filtered.length === 0" key="empty" class="rounded-3xl bg-muted/40 py-20 px-6 text-center">
          <Icon name="tabler:users-minus" class="size-10 text-muted-foreground/50 mx-auto mb-3" />
          <p class="text-lg font-semibold">No hay cuentas que mostrar</p>
          <p class="text-base text-muted-foreground mt-1">Cambia la búsqueda o el filtro, o crea una cuenta nueva.</p>
        </div>

        <div v-else key="list">
          <TransitionGroup name="card" appear tag="ul" class="grid gap-3 grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3">
            <li
              v-for="(t, i) in filtered"
              :key="t.id"
              :style="{ '--i': Math.min(i, 18) }"
              class="rounded-3xl bg-muted/40 p-5 flex flex-col gap-4 transition-opacity min-w-0"
              :class="{ 'opacity-60': !t.isActive }"
            >
              <div class="flex items-center gap-4 min-w-0">
                <span
                  class="size-12 shrink-0 rounded-2xl flex items-center justify-center text-base font-bold"
                  :style="{ background: `hsl(${hue(t.id)} 80% 55% / 0.15)`, color: `hsl(${hue(t.id)} 70% 38%)` }"
                >{{ initials(t) }}</span>
                <div class="min-w-0 flex-1">
                  <p class="text-lg font-semibold leading-tight truncate">{{ t.name }}</p>
                  <p class="text-sm text-muted-foreground font-mono truncate">{{ t.id }}</p>
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                <span v-if="t.isMaster" class="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-2.5 py-1">
                  <Icon name="tabler:crown" class="size-3.5" /> Maestra
                </span>
                <span v-if="!t.isActive" class="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground px-2.5 py-1">
                  <Icon name="tabler:player-pause" class="size-3.5" /> Desactivada
                </span>
                <span v-else-if="!t.isMaster && !t.hasPassword" class="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 px-2.5 py-1">
                  <Icon name="tabler:key-off" class="size-3.5" /> Sin contraseña
                </span>
                <span v-else-if="!t.isMaster" class="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-2.5 py-1">
                  <Icon name="tabler:circle-check" class="size-3.5" /> Activa
                </span>
                <span class="ml-auto text-muted-foreground font-medium">Desde {{ created(t.createdAt) }}</span>
              </div>

              <div class="flex items-center gap-2 pt-1 border-t border-border/50 -mx-1 px-1 pt-3">
                <GButton variant="secondary" size="sm" class="gap-2 flex-1 sm:flex-none" @click="copyLink(t)">
                  <Icon name="tabler:link" class="size-4" /> Enlace del visor
                </GButton>
                <template v-if="!t.isMaster">
                  <GButton variant="secondary" size="sm" class="gap-2 flex-1 sm:flex-none" @click="openPassword(t)">
                    <Icon name="tabler:key" class="size-4" /> Contraseña
                  </GButton>
                  <GButton
                    variant="ghost"
                    size="sm"
                    class="ml-auto"
                    :class="t.isActive ? 'text-muted-foreground hover:text-red-500' : 'text-emerald-600'"
                    :title="t.isActive ? 'Desactivar' : 'Activar'"
                    @click="toggleActive(t)"
                  >
                    <Icon :name="t.isActive ? 'tabler:player-pause' : 'tabler:player-play'" class="size-4" />
                  </GButton>
                </template>
              </div>
            </li>
          </TransitionGroup>
        </div>
      </Transition>
    </div>

    <!-- Nueva cuenta -->
    <GDialog v-model="createOpen" title="Nueva cuenta" description="El ID identifica la cuenta y va en el enlace del visor." class="max-w-md">
      <form class="space-y-4" @submit.prevent="create">
        <GInput v-model="newId" label="ID" placeholder="mi-iglesia" autocapitalize="off" spellcheck="false"
          :error="newId && !idValid ? '3-64 caracteres: letras, números, - y _' : ''" />
        <GInput v-model="newName" label="Nombre (opcional)" placeholder="Mi Iglesia" />
        <GInput v-model="newPassword" label="Contraseña" :type="showNewPassword ? 'text' : 'password'" class="font-mono">
          <template #suffix>
            <button type="button" class="text-muted-foreground hover:text-primary transition-colors" @click="showNewPassword = !showNewPassword">
              <Icon :name="showNewPassword ? 'tabler:eye-off' : 'tabler:eye'" class="size-[18px]" />
            </button>
          </template>
        </GInput>
        <div class="flex items-center gap-2">
          <GButton type="button" variant="ghost" size="sm" class="gap-1.5" @click="newPassword = randomPassword(); showNewPassword = true">
            <Icon name="tabler:refresh" class="size-4" /> Generar otra
          </GButton>
          <GButton type="button" variant="ghost" size="sm" class="gap-1.5" @click="copy(newPassword, 'Contraseña copiada')">
            <Icon name="tabler:copy" class="size-4" /> Copiar
          </GButton>
        </div>
        <div class="flex justify-end gap-3 pt-2">
          <GButton type="button" variant="ghost" @click="createOpen = false">Cancelar</GButton>
          <GButton type="submit" class="font-bold" :disabled="creating || !idValid || newPassword.length < 6">
            {{ creating ? 'Creando...' : 'Crear cuenta' }}
          </GButton>
        </div>
      </form>
    </GDialog>

    <!-- Cambiar contraseña -->
    <GDialog :model-value="!!pwTarget" :title="`Contraseña de ${pwTarget?.name ?? ''}`" description="Se reemplaza la actual. Cópiala antes de guardar: no se puede volver a ver." class="max-w-md" @update:model-value="v => { if (!v) pwTarget = null }">
      <form class="space-y-4" @submit.prevent="savePassword">
        <GInput v-model="pwValue" label="Nueva contraseña" :type="showPw ? 'text' : 'password'" class="font-mono">
          <template #suffix>
            <button type="button" class="text-muted-foreground hover:text-primary transition-colors" @click="showPw = !showPw">
              <Icon :name="showPw ? 'tabler:eye-off' : 'tabler:eye'" class="size-[18px]" />
            </button>
          </template>
        </GInput>
        <div class="flex items-center gap-2">
          <GButton type="button" variant="ghost" size="sm" class="gap-1.5" @click="pwValue = randomPassword(); showPw = true">
            <Icon name="tabler:refresh" class="size-4" /> Generar otra
          </GButton>
          <GButton type="button" variant="ghost" size="sm" class="gap-1.5" @click="copy(pwValue, 'Contraseña copiada')">
            <Icon name="tabler:copy" class="size-4" /> Copiar
          </GButton>
        </div>
        <div class="flex justify-end gap-3 pt-2">
          <GButton type="button" variant="ghost" @click="pwTarget = null">Cancelar</GButton>
          <GButton type="submit" class="font-bold" :disabled="savingPw || pwValue.length < 6">
            {{ savingPw ? 'Guardando...' : 'Guardar' }}
          </GButton>
        </div>
      </form>
    </GDialog>
  </main>
</template>

<style scoped>
.status-pill {
  width: calc((100% - 0.5rem) / 3);
  transition: transform 0.35s cubic-bezier(0.2, 0.7, 0.2, 1);
}

.swap-enter-active, .swap-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.swap-enter-from, .swap-leave-to { opacity: 0; transform: translateY(6px); }

.count-enter-active, .count-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.count-enter-from { opacity: 0; transform: translateY(-6px); }
.count-leave-to { opacity: 0; transform: translateY(6px); }

.card-enter-active {
  transition: opacity 0.3s ease, transform 0.35s cubic-bezier(0.2, 0.7, 0.2, 1);
  transition-delay: calc(var(--i, 0) * 25ms);
}
.card-enter-from { opacity: 0; transform: translateY(12px) scale(0.98); }
.card-move { transition: transform 0.35s cubic-bezier(0.2, 0.7, 0.2, 1); }

.skeleton-in { animation: skeleton-in 0.35s ease both; animation-delay: calc(var(--i, 0) * 30ms); }
@keyframes skeleton-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

@media (prefers-reduced-motion: reduce) {
  .status-pill, .swap-enter-active, .swap-leave-active, .count-enter-active, .count-leave-active, .card-enter-active, .card-move { transition: none; }
  .skeleton-in { animation: none; }
}
</style>
