<script setup lang="ts">
const { login } = useAuth();
const password = ref('');
const error = ref(false);
const showPassword = ref(false);

const handleLogin = async () => {
  error.value = false;
  if (login(password.value)) {
    // Redirect to home or wherever the user was headed
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
  <div class="min-h-screen bg-[#020617] flex items-center justify-center p-6 selection:bg-indigo-500/30">
    <!-- Fondos dinámicos -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
      <div class="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px]"></div>
      <div class="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px]"></div>
    </div>

    <div class="w-full max-w-md relative">
      <!-- Card principal -->
      <div class="bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative z-10">
        <div class="flex flex-col items-center mb-8">
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 mb-6 group transition-all duration-500 hover:scale-110">
            <Icon name="lucide:lock" class="text-indigo-400 w-8 h-8 group-hover:rotate-12 transition-transform duration-500" />
          </div>
          <h1 class="text-3xl font-bold text-white tracking-tight mb-2">Acceso Remoto</h1>
          <p class="text-slate-400 text-center">Este himnario está protegido. Ingresa la contraseña maestra para continuar.</p>
        </div>

        <form @submit.prevent="handleLogin" class="space-y-6">
          <div class="space-y-2">
            <label for="password" class="text-sm font-medium text-slate-300 ml-1">Contraseña</label>
            <div class="relative group">
              <input 
                :type="showPassword ? 'text' : 'password'" 
                id="password" 
                v-model="password"
                placeholder="••••••••"
                class="w-full bg-slate-950/50 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all duration-300"
                :class="{'border-red-500/50 ring-2 ring-red-500/20': error}"
                required
              />
              <button 
                type="button"
                @click="showPassword = !showPassword"
                class="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                title="Mostrar/Ocultar"
              >
                <Icon :name="showPassword ? 'lucide:eye-off' : 'lucide:eye'" class="w-5 h-5" />
              </button>
            </div>
          </div>

          <!-- Mensaje de error -->
          <Transition name="fade-slide">
            <div v-if="error" class="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm">
              <Icon name="lucide:alert-circle" class="w-4 h-4 shrink-0" />
              <span>Contraseña incorrecta. Inténtalo de nuevo.</span>
            </div>
          </Transition>

          <button 
            type="submit"
            class="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold py-4 rounded-2xl transition-all duration-300 shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 group"
          >
            <span>Desbloquear</span>
            <Icon name="lucide:arrow-right" class="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </form>

        <!-- Acceso directo al historial de escritos -->
        <div class="mt-10 pt-6 border-t border-white/10 text-center space-y-4">
          <p class="text-sm text-slate-400">Si buscas los escritos, dale al siguiente botón:</p>
          <NuxtLink 
            to="/anuncios/history" 
            class="inline-flex w-full items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3.5 rounded-2xl transition-all duration-300 border border-white/5 shadow-xl hover:shadow-slate-900/40 group"
          >
            <Icon name="lucide:history" class="w-4 h-4 text-indigo-400 group-hover:-rotate-12 transition-transform" />
            <span>Ver escritos</span>
          </NuxtLink>
        </div>

        <!-- Footer -->
        <div class="mt-8 pt-6 border-t border-white/5 flex justify-center opacity-40">
           <span class="text-xs text-white/50 tracking-widest uppercase">Himnario Digital • 2024</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
