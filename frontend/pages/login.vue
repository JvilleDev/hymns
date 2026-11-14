<script setup lang="ts">
useHead({ title: 'Iniciar sesión' })

const { login } = useAuth();
const tenantId = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);
const showPassword = ref(false);

// Reloj en vivo (solo en cliente para evitar desajustes de hidratación)
const now = ref<Date | null>(null);
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  now.value = new Date();
  timer = setInterval(() => { now.value = new Date(); }, 1000);
});
onBeforeUnmount(() => clearInterval(timer));

const greeting = computed(() => {
  if (!now.value) return 'Hola';
  const h = now.value.getHours();
  if (h >= 5 && h < 12) return 'Buenos días';
  if (h >= 12 && h < 19) return 'Buenas tardes';
  return 'Buenas noches';
});

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const weekday = computed(() => (now.value ? cap(now.value.toLocaleDateString('es', { weekday: 'long' })) : ''));
const dateText = computed(() => (now.value ? now.value.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }) : ''));
const hm = computed(() => {
  if (!now.value) return '--:--';
  const h = now.value.getHours() % 12 || 12;
  return `${h}:${String(now.value.getMinutes()).padStart(2, '0')}`;
});
const period = computed(() => (now.value ? (now.value.getHours() < 12 ? 'AM' : 'PM') : ''));
const sec = computed(() => (now.value ? String(now.value.getSeconds()).padStart(2, '0') : '--'));

const route = useRoute();

// Destino tras el login: solo rutas internas (evita open redirect con //host o esquemas)
const redirectTo = computed(() => {
  const target = route.query.redirect;
  if (typeof target !== 'string') return '/';
  if (!target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) return '/';
  if (target === '/login' || target.startsWith('/login?')) return '/';
  return target;
});

const handleLogin = async () => {
  error.value = '';
  loading.value = true;
  const err = await login(tenantId.value, password.value);
  loading.value = false;
  if (!err) {
    // Vuelve a donde intentaba entrar (o al inicio)
    return navigateTo(redirectTo.value);
  }
  error.value = err;
};

// Layout blank for login page
definePageMeta({
  layout: false
});
</script>

<template>
  <div class="min-h-svh w-screen grid lg:grid-cols-[1.05fr_1fr] bg-background selection:bg-primary/10">
    <!-- Panel de marca (solo escritorio) -->
    <aside class="relative hidden lg:flex flex-col justify-between overflow-hidden p-12 text-primary-foreground bg-gradient-to-br from-primary via-blue-700 to-blue-900">
      <div class="absolute -top-32 -right-32 size-[28rem] rounded-full bg-white/10 blur-3xl pointer-events-none"></div>
      <div class="absolute -bottom-40 -left-24 size-[26rem] rounded-full bg-blue-300/20 blur-3xl pointer-events-none"></div>
      <OlivosIcon class="absolute -right-16 bottom-8 w-[34rem] text-white/[0.07] pointer-events-none" />

      <div class="relative flex items-center gap-3">
        <div class="size-11 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center ring-1 ring-white/25">
          <Icon name="tabler:book" class="size-6" />
        </div>
        <span class="text-lg font-bold tracking-tight">Himnario Digital</span>
      </div>

      <div class="relative" aria-live="off">
        <p class="text-xl font-medium text-primary-foreground/80">{{ weekday }}&nbsp;</p>
        <p class="mt-2 font-bold tracking-tight tabular-nums leading-none text-[7rem] xl:text-[9rem]">
          {{ hm }}<span class="ml-3 inline-flex flex-col align-top text-3xl xl:text-4xl font-medium leading-tight text-primary-foreground/60"><span>{{ sec }}</span><span class="text-xl xl:text-2xl">{{ period }}</span></span>
        </p>
        <p class="mt-5 text-xl text-primary-foreground/80">{{ dateText }}&nbsp;</p>
      </div>

      <p class="relative text-xs text-primary-foreground/50">© 2024 Himnario Digital</p>
    </aside>

    <!-- Formulario -->
    <main class="relative flex items-center justify-center p-6 sm:p-10">
      <div class="absolute inset-0 overflow-hidden pointer-events-none lg:hidden">
        <div class="absolute -top-24 -left-16 size-72 bg-primary/10 rounded-full blur-3xl"></div>
        <div class="absolute -bottom-24 -right-16 size-72 bg-primary/10 rounded-full blur-3xl"></div>
      </div>

      <div class="relative w-full max-w-sm">
        <div class="lg:hidden flex items-center gap-3 mb-10">
          <div class="size-11 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
            <Icon name="tabler:book" class="size-6 text-primary-foreground" />
          </div>
          <span class="text-lg font-bold tracking-tight">Himnario Digital</span>
        </div>

        <h1 class="text-3xl font-bold tracking-tight">{{ greeting }}</h1>

        <form @submit.prevent="handleLogin" class="mt-8 space-y-5">
          <GInput
            label="ID"
            v-model="tenantId"
            placeholder="mi-iglesia"
            autocomplete="username"
            autocapitalize="off"
            spellcheck="false"
            autofocus
            class="h-12"
          >
            <template #prefix><Icon name="tabler:users-group" class="size-[18px]" /></template>
          </GInput>

          <GInput
            label="Contraseña"
            :type="showPassword ? 'text' : 'password'"
            v-model="password"
            placeholder="••••••••"
            autocomplete="current-password"
            class="h-12"
          >
            <template #prefix><Icon name="tabler:lock" class="size-[18px]" /></template>
            <template #suffix>
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="text-muted-foreground hover:text-primary transition-colors"
                :title="showPassword ? 'Ocultar' : 'Mostrar'"
              >
                <Icon :name="showPassword ? 'tabler:eye-off' : 'tabler:eye'" class="size-[18px]" />
              </button>
            </template>
          </GInput>

          <Transition name="fade-slide">
            <div
              v-if="error"
              role="alert"
              class="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/5 px-3.5 py-3 text-sm text-destructive"
            >
              <Icon name="tabler:alert-circle" class="size-[18px] shrink-0 mt-px" />
              <span>{{ error }}</span>
            </div>
          </Transition>

          <GButton
            type="submit"
            :disabled="loading || !tenantId || !password"
            class="w-full h-12 text-base font-bold rounded-xl shadow-lg shadow-primary/25"
          >
            <Icon v-if="loading" name="tabler:loader-2" class="size-5 mr-2 animate-spin" />
            <span>{{ loading ? 'Entrando...' : 'Entrar' }}</span>
            <Icon v-if="!loading" name="tabler:arrow-right" class="size-5 ml-2" />
          </GButton>
        </form>

        <p class="mt-8 text-xs text-muted-foreground leading-relaxed">
          ¿Sin acceso? Pídele a tu administrador tus credenciales de acceso.
        </p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
