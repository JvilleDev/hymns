<script setup lang="ts">
import { cn } from '~/utils'

// Botón de ajustes + menú desplegable. `placement` define hacia dónde se abre.
withDefaults(defineProps<{ placement?: 'bottom-end' | 'top-start' }>(), { placement: 'bottom-end' })

const { tenantId, isMaster, logout } = useAuth()
const isCopied = ref(false)

const copyViewerLink = async () => {
  try {
    await navigator.clipboard.writeText(`${window.location.origin}/ver?clientId=${encodeURIComponent(tenantId.value)}`)
    isCopied.value = true
    setTimeout(() => { isCopied.value = false }, 2000)
  } catch (e) {
    console.error('Error al copiar:', e)
  }
}

const isOpen = ref(false)
const rootRef = ref(null)
onClickOutside(rootRef, () => { isOpen.value = false })
</script>

<template>
  <div ref="rootRef" class="relative">
    <slot :open="isOpen" :toggle="() => (isOpen = !isOpen)">
      <GButton
        variant="ghost"
        size="icon"
        :class="cn('rounded-xl text-muted-foreground hover:text-primary transition-all duration-300', isOpen && 'bg-muted text-primary')"
        @click.stop="isOpen = !isOpen"
      >
        <Icon name="tabler:settings" class="size-5 transition-transform duration-500" :class="{ 'rotate-90': isOpen }" />
      </GButton>
    </slot>

    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="isOpen"
        class="absolute w-64 rounded-2xl border border-border bg-background/95 backdrop-blur-xl shadow-2xl z-50 overflow-hidden ring-1 ring-black/5"
        :class="placement === 'top-start' ? 'left-0 bottom-full mb-3 origin-bottom-left' : 'right-0 top-full mt-3 origin-top-right'"
      >
        <div class="p-2.5 space-y-1">
          <div class="px-4 py-2">
            <span class="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-bold">Grupo</span>
            <p class="text-sm font-bold truncate">{{ tenantId }}</p>
          </div>

          <div class="h-px bg-border/50 mx-2 my-1"></div>

          <button
            class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all text-left"
            @click="copyViewerLink"
          >
            <div class="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Icon :name="isCopied ? 'tabler:check' : 'tabler:link'" class="size-4" />
            </div>
            <div class="flex flex-col">
              <span>{{ isCopied ? 'Enlace copiado' : 'Copiar enlace del visor' }}</span>
              <span class="text-[10px] text-muted-foreground/60 font-medium">Para la pantalla (/ver)</span>
            </div>
          </button>

          <button
            v-if="isMaster"
            class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all text-left"
            @click="navigateTo('/tenants'); isOpen = false"
          >
            <div class="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Icon name="tabler:users-group" class="size-4" />
            </div>
            <div class="flex flex-col">
              <span>Gestionar grupos</span>
              <span class="text-[10px] text-muted-foreground/60 font-medium">Tenants y contraseñas</span>
            </div>
          </button>

          <div class="h-px bg-border/50 mx-2 my-1"></div>

          <button
            class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-red-500 hover:bg-red-500/10 transition-all text-left group"
            @click="logout(); isOpen = false"
          >
            <div class="size-8 rounded-lg bg-red-500 flex items-center justify-center text-white group-hover:scale-110 transition-transform">
              <Icon name="tabler:logout" class="size-4" />
            </div>
            <div class="flex flex-col">
              <span class="uppercase tracking-widest text-[10px]">Cerrar Sesión</span>
              <span class="text-[10px] text-red-400/60 font-medium normal-case">Salir del panel</span>
            </div>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
