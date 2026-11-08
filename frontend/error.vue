<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const status = computed(() => props.error?.statusCode || 500)
const isNotFound = computed(() => status.value === 404)

const copy = computed(() => {
  if (isNotFound.value) {
    return {
      title: 'No encontramos esta página',
      body: 'La dirección no existe o fue movida. Revisa que esté bien escrita o vuelve a una sección.',
    }
  }
  if (status.value === 401 || status.value === 403) {
    return {
      title: 'No tienes acceso a esta página',
      body: 'Inicia sesión con una cuenta que tenga permiso para verla.',
    }
  }
  if (status.value >= 500) {
    return {
      title: 'Algo salió mal de nuestro lado',
      body: 'Ocurrió un error inesperado. Intenta de nuevo; si continúa, avisa a quien administra el himnario.',
    }
  }
  return {
    title: 'No pudimos abrir esta página',
    body: 'Ocurrió un problema al cargarla. Intenta de nuevo.',
  }
})

// Detalle técnico: útil para quien opera, irrelevante en un 404
const detail = computed(() => {
  if (isNotFound.value) return ''
  return props.error?.statusMessage || props.error?.message || ''
})

const links = [
  { title: 'Inicio', to: '/', icon: 'tabler:home' },
  { title: 'Lista', to: '/lista', icon: 'tabler:list' },
  { title: 'Visor', to: '/visor', icon: 'tabler:eye' },
  { title: 'Anuncios', to: '/anuncios', icon: 'tabler:speakerphone' },
]

useHead({
  title: `${status.value} · ${copy.value.title} | Himnario`,
  htmlAttrs: { lang: 'es' },
})

const goHome = () => clearError({ redirect: '/' })
const retry = () => {
  if (import.meta.client) window.location.reload()
}
const goTo = (to: string) => clearError({ redirect: to })
</script>

<template>
  <div class="min-h-svh bg-background text-foreground flex flex-col" style="font-family: 'Outfit', sans-serif">
    <header class="px-6 lg:px-10 h-16 flex items-center">
      <button type="button" @click="goHome" class="inline-flex items-center gap-3 rounded-xl -ml-2 px-2 py-1.5 hover:bg-muted transition-colors">
        <span class="size-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
          <Icon name="tabler:book" class="size-5" />
        </span>
        <span class="text-lg font-bold tracking-tight">Himnario</span>
      </button>
    </header>

    <main class="flex-1 flex items-center px-6 lg:px-10 py-10">
      <div class="w-full max-w-6xl mx-auto grid lg:grid-cols-[1fr_auto] items-center gap-10 lg:gap-20">
        <div class="max-w-xl">
          <h1 class="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">{{ copy.title }}</h1>
          <p class="mt-5 text-lg text-muted-foreground leading-relaxed">{{ copy.body }}</p>

          <p v-if="detail" class="mt-5 rounded-2xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground break-words">
            {{ detail }}
          </p>

          <div class="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              @click="goHome"
              class="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-base font-semibold px-6 py-3.5 transition-colors active:scale-95"
            >
              <Icon name="tabler:home" class="size-5" />
              Volver al inicio
            </button>
            <button
              v-if="!isNotFound"
              type="button"
              @click="retry"
              class="inline-flex items-center justify-center gap-2 rounded-xl bg-muted hover:bg-muted/70 text-base font-semibold px-6 py-3.5 transition-colors active:scale-95"
            >
              <Icon name="tabler:refresh" class="size-5" />
              Reintentar
            </button>
          </div>

          <nav v-if="isNotFound" aria-label="Secciones" class="mt-10">
            <p class="text-base font-semibold mb-3">O ve directo a</p>
            <ul class="grid grid-cols-2 gap-2 max-w-md">
              <li v-for="l in links" :key="l.to">
                <button
                  type="button"
                  @click="goTo(l.to)"
                  class="w-full inline-flex items-center gap-3 rounded-xl bg-muted/60 hover:bg-muted px-4 py-3 text-base font-medium text-left transition-colors"
                >
                  <Icon :name="l.icon" class="size-5 text-muted-foreground" />
                  {{ l.title }}
                </button>
              </li>
            </ul>
          </nav>
        </div>

        <!-- El código, grande -->
        <p
          class="order-first lg:order-none font-black leading-none tracking-tighter text-primary select-none text-[clamp(7rem,22vw,18rem)]"
          aria-label="Código de error"
        >{{ status }}</p>
      </div>
    </main>
  </div>
</template>
