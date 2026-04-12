import { v4 as uuid } from 'uuid';

export const useApi = () => {
  const config = useRuntimeConfig().public
  const backendUrl = (config.apiUrl as string) || 'https://hymns-back.jville.dev'
  
  // Client ID management
  const clientIdCookie = useCookie('himnario_client_id', {
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: 'lax'
  });

  const isClientIdSetCookie = useCookie('himnario_client_id_set', {
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: 'lax'
  });

  const getClientId = () => {
    if (!clientIdCookie.value) {
      clientIdCookie.value = uuid();
    }
    return clientIdCookie.value;
  };

  const clientId = useState('api:clientId', () => getClientId());
  const isClientIdSet = useState('api:isClientIdSet', () => !!isClientIdSetCookie.value);

  // Connection status
  const isHealthy = useState<boolean>('api_is_healthy', () => true)
  const isConnectionError = useState<boolean>('api_connection_error', () => false)
  const isManualConnectionTrigger = useState<boolean>('api_manual_trigger', () => false)

  const request = async <T>(path: string, options: any = {}): Promise<T> => {
    const cleanPath = path.startsWith('/') ? path : `/${path}`
    const fullUrl = `${backendUrl}${cleanPath}`

    // Get auth token if available
    const authCookie = useCookie('himnario_auth_token');
    const headers = {
      ...options.headers,
      'X-Client-Id': clientId.value,
      'Authorization': authCookie.value || ''
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
      throw error
    }
  }

  return {
    clientId,
    setClientId: (id: string) => {
      clientIdCookie.value = id;
      clientId.value = id;
      isClientIdSetCookie.value = 'true';
      isClientIdSet.value = true;
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
    getAnnouncements: () => request<any[]>('/api/anuncios'),
    createAnnouncement: (text: string, position: 'top' | 'bottom' = 'bottom', topic?: string) => request<any>('/api/anuncios', { method: 'POST', body: { text, position, topic } }),
    deleteAnnouncement: (id: string) => request<any>(`/api/anuncios/${id}`, { method: 'DELETE' }),
    clearAnnouncements: () => request<any>('/api/anuncios', { method: 'DELETE' }),
    deleteSelectedAnnouncements: (ids: string[]) => request<any>('/api/anuncios/delete-selected', { method: 'POST', body: { ids } }),
    
    // Config & Helpers
    isHealthy,
    isConnectionError,
    isManualConnectionTrigger,
    isClientIdSet,
    getFullUrl: (path: string) => {
      return `${backendUrl}${path.startsWith('/') ? path : `/${path}`}`
    },
    getWsUrl: (path: string = '/ws') => {
      const wsBase = backendUrl.replace(/^http/, 'ws');
      return `${wsBase}${path.startsWith('/') ? path : `/${path}`}?clientId=${clientId.value}`;
    }
  }
}

