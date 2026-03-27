// Variable de módulo para actuar como "lock" global durante la fase de descubrimiento en el cliente
let discoveryPromise: Promise<void> | null = null;
const MANUAL_URL_KEY = 'api_manual_backend_url';

export const useApi = () => {
  const { apiUrl: baseUrl, backendUrl: configDirectUrl } = useRuntimeConfig().public
  
  // Calcular la URL directa (fallback) dinámicamente si no está en el config
  const getDirectUrl = () => {
    if (configDirectUrl) return configDirectUrl as string;
    if (import.meta.client) {
      // Si estamos en el cliente, usamos el mismo host pero el puerto 3100
      const protocol = window.location.protocol;
      const hostname = window.location.hostname;
      return `${protocol}//${hostname}:3100`;
    }
    return "http://localhost:3100";
  };

  const directUrl = getDirectUrl();

  // El estado de la URL base activa para toda la aplicación
  const activeBaseUrl = useState<string>('api_active_url', () => baseUrl)
  
  // URL manual ingresada por el usuario (persiste en localStorage)
  const manualUrl = useState<string | null>('api_manual_url', () => null)

  // Estado para saber si hay un error de conexión crítico que requiere intervención
  const isConnectionError = useState<boolean>('api_connection_error', () => false)

  // Estado para saber si ya hemos comprobado que la conexión es exitosa
  const isHealthy = useState<boolean>('api_is_healthy', () => false)

  // Cargar URL manual de localStorage en el cliente
  if (import.meta.client && !manualUrl.value) {
    const saved = localStorage.getItem(MANUAL_URL_KEY);
    if (saved) manualUrl.value = saved;
  }

  /**
   * Asegura que el host actual es saludable antes de proceder.
   * Si hay múltiples llamadas simultáneas, todas esperan a la misma promesa.
   */
  const ensureHealthy = async () => {
    if (isHealthy.value) return;

    if (discoveryPromise) {
      await discoveryPromise;
      return;
    }

    discoveryPromise = (async () => {
      // 1. Intentar con URL manual si existe
      if (manualUrl.value) {
        try {
          console.log(`[API] Probando URL manual: ${manualUrl.value}`);
          await $fetch(`${manualUrl.value}/api/cantos`, { timeout: 3000 });
          activeBaseUrl.value = manualUrl.value;
          isHealthy.value = true;
          isConnectionError.value = false;
          return;
        } catch (e) {
          console.warn(`[API] URL manual fallida: ${manualUrl.value}`);
        }
      }

      // 2. Intentar con URL base (proxy/config)
      try {
        console.log(`[API] Comprobando salud de: ${activeBaseUrl.value}`);
        await $fetch(`${activeBaseUrl.value}/api/cantos`, { timeout: 3000 });
        isHealthy.value = true;
        isConnectionError.value = false;
        console.log(`[API] Conexión saludable confirmada: ${activeBaseUrl.value}`);
      } catch (err) {
        console.warn(`[API] Fallo de salud en ${activeBaseUrl.value}, intentando fallback directo...`);
        // 3. Intentar con fallback directo
        try {
          await $fetch(`${directUrl}/api/cantos`, { timeout: 3000 });
          activeBaseUrl.value = directUrl;
          isHealthy.value = true;
          isConnectionError.value = false;
          console.info(`[API] Fallback exitoso a: ${directUrl}`);
        } catch (fallbackErr) {
          console.error(`[API] Error crítico: No se pudo conectar ni al proxy ni al backend directo.`);
          isHealthy.value = false;
          isConnectionError.value = true;
        }
      } finally {
        discoveryPromise = null;
      }
    })();

    await discoveryPromise;
  }

  const request = async <T>(path: string, options: any = {}): Promise<T> => {
    // Primero nos aseguramos de que el host es saludable (esto encola peticiones paralelas)
    await ensureHealthy();
    
    const cleanPath = path.startsWith('/') ? path : `/${path}`
    const fullUrl = `${activeBaseUrl.value}${cleanPath}`

    try {
      return await $fetch<T>(fullUrl, { ...options, timeout: 10000 })
    } catch (error: any) {
      console.error(`[API] Error en ${path}:`, error)
      // Si la petición falla por conexión, invalidamos la salud para forzar re-descubrimiento
      if (error.name === 'FetchError' || error.code === 'ECONNREFUSED') {
        isHealthy.value = false;
      }
      throw error
    }
  }

  return {
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
    createAnnouncement: (text: string, position: 'top' | 'bottom' = 'bottom') => request<any>('/api/anuncios', { method: 'POST', body: { text, position } }),
    deleteAnnouncement: (id: string) => request<any>(`/api/anuncios/${id}`, { method: 'DELETE' }),
    clearAnnouncements: () => request<any>('/api/anuncios', { method: 'DELETE' }),
    deleteSelectedAnnouncements: (ids: string[]) => request<any>('/api/anuncios/delete-selected', { method: 'POST', body: { ids } }),
    
    // Config & Helpers
    activeBaseUrl,
    isHealthy,
    isConnectionError,
    retryConnection: async (inputUrl: string) => {
      // Limpiar input (eliminar espacios, asegurar http://)
      let cleaned = inputUrl.trim();
      if (!cleaned.startsWith('http')) {
        cleaned = `http://${cleaned}`;
      }
      
      manualUrl.value = cleaned;
      if (import.meta.client) {
        localStorage.setItem(MANUAL_URL_KEY, cleaned);
      }
      
      // Forzar re-descubrimiento
      isHealthy.value = false;
      isConnectionError.value = false;
      await ensureHealthy();
    },
    getFullUrl: async (path: string) => {
      await ensureHealthy();
      return `${activeBaseUrl.value}${path.startsWith('/') ? path : `/${path}`}`
    },
    getWsUrl: async (path: string = '/ws') => {
      await ensureHealthy();
      // Convierte http:// a ws:// y https:// a wss://
      const wsBase = activeBaseUrl.value.replace(/^http/, 'ws');
      return `${wsBase}${path.startsWith('/') ? path : `/${path}`}`;
    }
  }
}

