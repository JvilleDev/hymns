export default defineNuxtRouteMiddleware((to) => {
  const { setClientId, setDevMode } = useApi();
  const clientIdFromQuery = to.query.clientId as string;
  const devFromQuery = to.query.dev as string;

  if (clientIdFromQuery) {
    console.log(`[CLIENT-ID] Found clientId in query: ${clientIdFromQuery}. Updating context.`);
    setClientId(clientIdFromQuery);
  }

  if (devFromQuery === 'true') {
    setDevMode(true);
  } else if (devFromQuery === 'false') {
    setDevMode(false);
  }

  const { authenticated } = useAuth();
  const requestURL = useRequestURL();
  const hostname = requestURL.hostname;

  // Localhost (127.0.0.1 or localhost) has full access
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';

  if (isLocal) {
    return;
  }

  // Handle Remote Access (Tunnel)
  const publicPaths = ['/login', '/anuncios/history', '/ver', '/anuncios'];
  const isPublic = publicPaths.includes(to.path) || to.path.startsWith('/_'); // Allow specific paths and internal assets

  if (!authenticated.value && !isPublic) {
    console.warn(`[AUTH] Remote access detected from ${hostname} to ${to.path}. Redirecting to /login.`);
    return navigateTo('/login');
  }
});
