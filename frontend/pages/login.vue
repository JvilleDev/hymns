<script setup lang="ts">
const { login } = useAuth();
const password = ref('');
const error = ref(false);
const showPassword = ref(false);

const handleLogin = async () => {
  error.value = false;
  if (login(password.value)) {
    // Redirect to list where admin powers are most needed
    return navigateTo('/');
  }
  error.value = true;
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
        <p class="text-sm text-muted-foreground font-medium px-4">Ingresa la contraseña maestra para habilitar las funciones administrativas.</p>
      </div>

      <!-- Card Principal -->
      <GCard class="p-8 shadow-2xl shadow-primary/5 border-border/50">
        <form @submit.prevent="handleLogin" class="space-y-6">
          <GInput 
            label="Contraseña de Acceso"
            :type="showPassword ? 'text' : 'password'"
            v-model="password"
            placeholder="••••••••"
            :error="error ? 'La contraseña es incorrecta' : ''"
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
            class="w-full h-12 text-base font-bold rounded-xl shadow-lg shadow-primary/20"
          >
            <span>Desbloquear Todo</span>
            <Icon name="tabler:arrow-right" class="size-5 ml-2" />
          </GButton>
        </form>

        <div class="mt-8 pt-6 border-t border-border/50">
          <p class="text-xs text-center text-muted-foreground font-semibold uppercase tracking-widest mb-4">Acceso Público</p>
          <GButton 
            variant="outline"
            class="w-full h-11 rounded-xl border-primary/20 hover:bg-primary/5 font-bold"
            @click="navigateTo('/anuncios/history')"
          >
            <Icon name="tabler:history" class="size-4 mr-2 text-primary" />
            <span>Ver Historial de Escritos</span>
          </GButton>
        </div>
      </GCard>

      <!-- Footer -->
      <p class="mt-8 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40">
        © 2024 Himnario Digital • Admin Panel
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
