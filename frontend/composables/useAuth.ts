export const useAuth = () => {
  const config = useRuntimeConfig();
  const authenticated = useCookie('himnario_auth_token', {
    maxAge: 60 * 60 * 24 * 7, // 1 week
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  });

  const login = (password: string) => {
    // En el nuevo sistema, guardamos la contraseña directamente como token
    // El backend la validará en cada petición protegida
    const masterPassword = config.public.authPassword || '2486';
    
    if (password === masterPassword) {
      authenticated.value = password;
      return true;
    }
    return false;
  };

  const logout = () => {
    authenticated.value = null;
    return navigateTo('/login');
  }

  const isAdmin = computed(() => !!authenticated.value);

  return {
    authenticated,
    isAdmin,
    login,
    logout
  };
};
