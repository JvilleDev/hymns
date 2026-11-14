export const useApi = () => {
  const config = useRuntimeConfig().public
  
  // Dev mode persistence via cookie
  const isDevCookie = useCookie('himnario_dev_mode', {
    maxAge: 60 * 60 * 24 * 7, // 1 week
    sameSite: 'lax'
  });

  const isDevMode = useState('api:isDevMode', () => String(isDevCookie.value) === 'true');

  const setDevMode = (val: boolean) => {
    isDevCookie.value = val ? 'true' : undefined;
    isDevMode.value = val;
  }

  const backendUrl = isDevMode.value 
    ? 'http://localhost:3100' 
    : ((config.apiUrl as string) || 'https://hymns-back.jville.dev')
  
  // Tenant: el clientId es el ID del tenant (sesión iniciada) o el de la URL en las vistas públicas (/ver, historial)
  const authToken = useCookie<string | null>('himnario_auth_token')
  const tenantCookie = useCookie<{ id: string; isMaster: boolean } | null>('himnario_tenant')
  const clientId = useState<string>('api:clientId', () => tenantCookie.value?.id || '')

  // Connection status
  const isHealthy = useState<boolean>('api_is_healthy', () => true)
  const isConnectionError = useState<boolean>('api_connection_error', () => false)

  const request = async <T>(path: string, options: any = {}): Promise<T> => {
    const cleanPath = path.startsWith('/') ? path : `/${path}`
    const fullUrl = `${backendUrl}${cleanPath}`

    const headers = {
      ...options.headers,
      ...(authToken.value ? { Authorization: `Bearer ${authToken.value}` } : {})
    };

    try {
      return await $fetch<T>(fullUrl, { 
        ...options, 
        headers,
        timeout: 10000 
      })
    } catch (error: any) {
      if (error.status !== 304) {
        console.error(`[API] Error en ${path}:`, error)
      }
      // Sesión vencida o tenant desactivado: volver al login
      if (error.status === 401 && authToken.value && import.meta.client) {
        authToken.value = null
        tenantCookie.value = null
        clientId.value = ''
        navigateTo('/login')
      }
      throw error
    }
  }

  return {
    clientId,
    // Solo para vistas públicas: fija el tenant a leer desde la URL (no toca la sesión)
    setClientId: (id: string) => {
      clientId.value = id;
    },
    // Generic methods
    get: <T>(path: string, options: any = {}) => request<T>(path, { ...options, method: 'GET' }),
    post: <T>(path: string, body: any, options: any = {}) => request<T>(path, { ...options, method: 'POST', body }),
    put: <T>(path: string, body: any, options: any = {}) => request<T>(path, { ...options, method: 'PUT', body }),
    delete: <T>(path: string, options: any = {}) => request<T>(path, { ...options, method: 'DELETE' }),
    
    // CRUD para Cantos
    getSongs: () => request<any[]>('/api/cantos'),
    getSong: (id: string) => request<any>(`/api/canto/${id}`),
    createSong: (song: any) => request<any>('/api/canto', { method: 'POST', body: song }),
    updateSong: (song: any) => request<any>('/api/canto', { method: 'PUT', body: song }),
    deleteSong: (id: string) => request<any>(`/api/canto/${id}`, { method: 'DELETE' }),

    // Anuncios
    getAnnouncements: () => request<any[]>(`/api/anuncios?clientId=${encodeURIComponent(clientId.value)}`),
    createAnnouncement: (text: string, topic?: string) => request<any>('/api/anuncios', { method: 'POST', body: { text, topic } }),
    deleteAnnouncement: (id: string) => request<any>(`/api/anuncios/${id}`, { method: 'DELETE' }),
    clearAnnouncements: () => request<any>('/api/anuncios', { method: 'DELETE' }),
    deleteSelectedAnnouncements: (ids: string[]) => request<any>('/api/anuncios/delete-selected', { method: 'POST', body: { ids } }),
    
    // Media
    getMedia: () => request<any[]>(`/api/media?clientId=${encodeURIComponent(clientId.value)}`),
    uploadMedia: async (file: File, name?: string, type?: string) => {
      const formData = new FormData()
      formData.append('file', file)
      if (name) formData.append('name', name)
      if (type) formData.append('type', type)
      return request<any>('/api/media', { method: 'POST', body: formData })
    },
    deleteMedia: (id: string) => request<any>(`/api/media/${id}`, { method: 'DELETE' }),
    
    // Config & Helpers
    isHealthy,
    isConnectionError,
    isDevMode,
    setDevMode,
    getFullUrl: (path: string) => {
      return `${backendUrl}${path.startsWith('/') ? path : `/${path}`}`
    },
    getWsUrl: (path: string = '/ws') => {
      const wsBase = backendUrl.replace(/^http/, 'ws');
      const p = path.startsWith('/') ? path : `/${path}`;
      // Vistas públicas (/ver, historial): solo clientId → conexión de solo lectura
      const route = useRoute().path;
      const isViewer = route === '/ver' || route.startsWith('/anuncios/history');
      if (authToken.value && !isViewer) return `${wsBase}${p}?token=${encodeURIComponent(authToken.value)}`;
      return `${wsBase}${p}?clientId=${encodeURIComponent(clientId.value)}`;
    }
  }
}
