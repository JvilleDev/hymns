// Variable de módulo para actuar como "lock" global durante la fase de descubrimiento en el cliente
let discoveryPromise: Promise<void> | null = null;

export const useApi = () => {
  const { apiUrl: baseUrl, backendUrl: directUrlFallback } = useRuntimeConfig().public
  const directUrl = (directUrlFallback as string) || "http://localhost:3100"

  // El estado de la URL base activa para toda la aplicación
  const activeBaseUrl = useState<string>('api_active_url', () => baseUrl)
  
  // Estado para saber si ya hemos comprobado que la conexión es exitosa
  const isHealthy = useState<boolean>('api_is_healthy', () => false)

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
      try {
        console.log(`[API] Comprobando salud de: ${activeBaseUrl.value}`);
        // Intentamos una petición ligera a los cantos
        await $fetch(`${activeBaseUrl.value}/api/cantos`, { timeout: 3000 });
        isHealthy.value = true;
        console.log(`[API] Conexión saludable confirmada: ${activeBaseUrl.value}`);
      } catch (err) {
        console.warn(`[API] Fallo de salud en ${activeBaseUrl.value}, intentando fallback directo...`);
        try {
          await $fetch(`${directUrl}/api/cantos`, { timeout: 3000 });
          activeBaseUrl.value = directUrl;
          isHealthy.value = true;
          console.info(`[API] Fallback exitoso a: ${directUrl}`);
        } catch (fallbackErr) {
          console.error(`[API] Error crítico: No se pudo conectar ni al proxy ni al backend directo.`);
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
    getFullUrl: async (path: string) => {
      await ensureHealthy();
      return `${activeBaseUrl.value}${path.startsWith('/') ? path : `/${path}`}`
    }
  }
}

