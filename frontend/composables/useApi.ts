// Variable de módulo para actuar como "lock" global durante la fase de descubrimiento en el cliente
let discoveryPromise: Promise<void> | null = null;
const MANUAL_URL_KEY = 'api_manual_backend_url';
const LAST_WORKING_URL_KEY = 'api_last_working_url';

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

  // Estado para saber si el usuario solicitó abrir el diálogo manualmente
  const isManualConnectionTrigger = useState<boolean>('api_manual_trigger', () => false)

  // Estado para saber si ya hemos comprobado que la conexión es exitosa
  const isHealthy = useState<boolean>('api_is_healthy', () => false)

  // Cargar URL manual y última URL funcional de localStorage en el cliente
  if (import.meta.client) {
    if (!manualUrl.value) {
      const saved = localStorage.getItem(MANUAL_URL_KEY);
      if (saved) manualUrl.value = saved;
    }
    
    // Si tenemos URL manual o una que funcionó antes, usarla INMEDIATAMENTE para evitar el fallback a /backend
    const lastWorking = localStorage.getItem(LAST_WORKING_URL_KEY);
    const preferred = manualUrl.value || lastWorking;
    
    if (preferred && activeBaseUrl.value === baseUrl) {
      console.log(`[API] Inicializando con URL preferida: ${preferred}`);
      activeBaseUrl.value = preferred;
    }
  }

  /**
   * Asegura que el host actual es saludable antes de proceder.
   * Si hay múltiples llamadas simultáneas, todas esperan a la misma promesa.
   */
  const ensureHealthy = async () => {
    // Si ya sabemos que está saludable, o estamos en proceso de descubrirlo, no re-iniciar
    if (isHealthy.value) return;

    if (discoveryPromise) {
      return discoveryPromise;
    }

    discoveryPromise = (async () => {
      const lastWorking = import.meta.client ? localStorage.getItem(LAST_WORKING_URL_KEY) : null;
      const manual = manualUrl.value;

      // Lista de URLs para probar en orden de prioridad
      const candidates = [
        { url: manual, name: 'Manual' },
        { url: lastWorking, name: 'Memoria' },
        { url: baseUrl, name: 'Proxy/Config' },
        { url: directUrl, name: 'Directo (3100)' }
      ].filter(c => c.url && c.url !== '');

      console.log(`[API] Iniciando descubrimiento de conexión (${candidates.length} candidatos)`);

      for (const candidate of candidates) {
        if (!candidate.url) continue;
        
        try {
          // Si el candidato es solo un path relativo (como /backend), lo probamos con cautela
          const testUrl = candidate.url.startsWith('/') 
            ? (import.meta.client ? `${window.location.origin}${candidate.url}` : candidate.url)
            : candidate.url;

          console.log(`[API] Probando ${candidate.name}: ${testUrl}`);
          await $fetch(`${testUrl}/api/cantos`, { timeout: 2500 });
          
          // EXITOSO
          activeBaseUrl.value = candidate.url;
          isHealthy.value = true;
          isConnectionError.value = false;
          
          if (import.meta.client && candidate.url !== baseUrl) {
            localStorage.setItem(LAST_WORKING_URL_KEY, candidate.url);
          }
          
          console.info(`[API] Conexión establecida via ${candidate.name}: ${candidate.url}`);
          return;
        } catch (e) {
          console.warn(`[API] ${candidate.name} falló: ${candidate.url}`);
        }
      }

      // Si llegamos aquí, NADA funcionó
      console.error(`[API] Error crítico: No se pudo establecer ninguna conexión funcional.`);
      isHealthy.value = false;
      isConnectionError.value = true;
    })().finally(() => {
      discoveryPromise = null;
    });

    return discoveryPromise;
  }

  const request = async <T>(path: string, options: any = {}): Promise<T> => {
    // Primero nos aseguramos de que el host es saludable
    await ensureHealthy();
    
    const cleanPath = path.startsWith('/') ? path : `/${path}`
    const fullUrl = `${activeBaseUrl.value}${cleanPath}`

    try {
      return await $fetch<T>(fullUrl, { ...options, timeout: 10000 })
    } catch (error: any) {
      // Solo logueamos si no es un error de redirección o algo esperado
      if (error.status !== 304) {
        console.error(`[API] Error en ${path}:`, error)
      }
      
      // Si la petición falla por red, invalidamos salud para forzar re-descubrimiento en la próxima
      if (error.name === 'FetchError' || error.name === 'AbortError' || !error.response) {
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
    createAnnouncement: (text: string, position: 'top' | 'bottom' = 'bottom', topic?: string) => request<any>('/api/anuncios', { method: 'POST', body: { text, position, topic } }),
    deleteAnnouncement: (id: string) => request<any>(`/api/anuncios/${id}`, { method: 'DELETE' }),
    clearAnnouncements: () => request<any>('/api/anuncios', { method: 'DELETE' }),
    deleteSelectedAnnouncements: (ids: string[]) => request<any>('/api/anuncios/delete-selected', { method: 'POST', body: { ids } }),
    
    // Config & Helpers
    activeBaseUrl,
    isHealthy,
    isConnectionError,
    isManualConnectionTrigger,
    retryConnection: async (inputUrl: string, useSsl: boolean = false) => {
      // Limpiar input (eliminar espacios)
      let cleaned = inputUrl.trim().replace(/^https?:\/\//, '');
      
      // Aplicar protocolo basado en switch
      cleaned = `${useSsl ? 'https' : 'http'}://${cleaned}`;
      
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
    },
    checkUrl: async (url: string): Promise<boolean> => {
      try {
        await $fetch(`${url}/api/cantos`, { timeout: 2000 });
        return true;
      } catch (e) {
        return false;
      }
    }
  }
}

