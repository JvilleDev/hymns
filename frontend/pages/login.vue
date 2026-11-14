<script setup lang="ts">
useHead({ title: 'Iniciar sesión' })

const { login } = useAuth();
const tenantId = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);
const showPassword = ref(false);

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
  <div class="h-svh w-screen flex flex-col items-center justify-center p-6 bg-background selection:bg-primary/10 overflow-hidden relative">
    <!-- Fondos sutiles (Coherentes con el layout principal) -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none opacity-50">
      <div class="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] bg-primary/5 rounded-full blur-[120px]"></div>
      <div class="absolute -bottom-[20%] -right-[10%] w-[60%] h-[60%] bg-primary/5 rounded-full blur-[120px]"></div>
    </div>

    <div class="w-full max-w-sm relative z-10">
      <!-- Logo y Título -->
      <div class="flex flex-col items-center mb-8 text-center">
        <div class="size-16 rounded-2xl bg-primary flex items-center justify-center shadow-2xl shadow-primary/30 mb-6 transition-transform hover:scale-105 duration-500">
          <Icon name="tabler:book" class="size-8 text-primary-foreground" />
        </div>
        <h1 class="text-3xl font-bold tracking-tight text-foreground mb-2">Himnario Digital</h1>
        <p class="text-sm text-muted-foreground font-medium px-4">Ingresa con el ID y la contraseña de tu grupo.</p>
      </div>

      <!-- Card Principal -->
      <GCard class="p-8 shadow-2xl shadow-primary/5 border-border/50">
        <form @submit.prevent="handleLogin" class="space-y-6">
          <GInput
            label="ID del grupo"
            v-model="tenantId"
            placeholder="mi-iglesia"
            autocomplete="username"
            autocapitalize="off"
          />

          <GInput 
            label="Contraseña"
            :type="showPassword ? 'text' : 'password'"
            v-model="password"
            placeholder="••••••••"
            :error="error"
          >
            <template #suffix>
              <button 
                type="button"
                @click="showPassword = !showPassword"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors pr-1"
                title="Mostrar/Ocultar"
              >
                <Icon :name="showPassword ? 'tabler:eye-off' : 'tabler:eye'" class="size-5" />
              </button>
            </template>
          </GInput>

          <GButton 
            type="submit"
            :disabled="loading || !tenantId || !password"
            class="w-full h-12 text-base font-bold rounded-xl shadow-lg shadow-primary/20"
          >
            <span>{{ loading ? 'Entrando...' : 'Entrar' }}</span>
            <Icon name="tabler:arrow-right" class="size-5 ml-2" />
          </GButton>
        </form>

      </GCard>

      <!-- Footer -->
      <p class="mt-8 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40">
        © 2024 Himnario Digital
      </p>
    </div>
  </div>
</template>

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
