export const useAuth = () => {
  const config = useRuntimeConfig();
  const authenticated = useCookie('himnario_auth_token', {
    maxAge: 60 * 60 * 24 * 7, // 1 week
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  });

  const login = (password: string) => {
    // Check against runtime config or .env
    const masterPassword = config.public.authPassword || '2486';
    
    if (password === masterPassword) {
      authenticated.value = 'true';
      return true;
    }
    return false;
  };

  const logout = () => {
    authenticated.value = null;
    return navigateTo('/login');
  }

  return {
    authenticated,
    login,
    logout
  };
};
