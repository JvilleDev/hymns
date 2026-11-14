// Solo /login, /ver y /anuncios/history son públicas; el resto exige sesión de un tenant.
// /ver y el historial leen el tenant desde ?clientId=<id> (solo lectura).
const PUBLIC_PATHS = ['/login', '/ver', '/anuncios/history']
const VIEWER_PATHS = ['/ver', '/anuncios/history']
const MASTER_PATHS = ['/tenants']

export default defineNuxtRouteMiddleware((to) => {
  const { setClientId, setDevMode } = useApi()
  const { isLoggedIn, isMaster } = useAuth()

  const devFromQuery = to.query.dev as string
  if (devFromQuery === 'true') setDevMode(true)
  else if (devFromQuery === 'false') setDevMode(false)

  // Vistas públicas: el tenant a leer viene en la URL
  const clientIdFromQuery = to.query.clientId
  if (VIEWER_PATHS.includes(to.path) && typeof clientIdFromQuery === 'string' && clientIdFromQuery) {
    setClientId(clientIdFromQuery)
  }

  if (PUBLIC_PATHS.includes(to.path) || to.path.startsWith('/_')) {
    // Con sesión no tiene sentido ver el login
    if (to.path === '/login' && isLoggedIn.value) return navigateTo('/')
    return
  }

  if (!isLoggedIn.value) {
    // guarda a dónde iba para volver tras el login
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }

  if (MASTER_PATHS.includes(to.path) && !isMaster.value) return navigateTo('/')
})
