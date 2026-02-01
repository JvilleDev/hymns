export const useApi = () => {
  const { apiUrl: configApiUrl } = useRuntimeConfig().public
  const workingUrl = useState<string>('apiWorkingUrl', () => configApiUrl as string)
  const isInitializing = useState<boolean>('apiInitializing', () => false)

  const getFallbacks = () => {
    const baseUrl = configApiUrl as string
    if (!import.meta.client) return [baseUrl]

    const apiPort = baseUrl.match(/:(\d+)$/)?.[1] || '3100'

    const fallbacks = [
      // Priority 1: Current hostname with config port (essential for remote access)
      `${window.location.protocol}//${window.location.hostname}:${apiPort}`,
      // Priority 2: Original config URL
      baseUrl,
      // Priority 3: Current hostname with default port 3100
      `${window.location.protocol}//${window.location.hostname}:3100`
    ]
    return [...new Set(fallbacks)]
  }

  const request = async <T>(path: string, options: any = {}): Promise<T> => {
    const urls = getFallbacks()
    
    // Si no ha sido inicializado y estamos en cliente, podríamos intentar buscar cual funciona
    // Pero es más eficiente simplemente intentar la que creemos que funciona y rotar si falla.
    
    // Encontrar índice de la url actual de trabajo
    let startIndex = urls.indexOf(workingUrl.value)
    if (startIndex === -1) startIndex = 0

    const execute = async (index: number): Promise<T> => {
      const baseUrl = urls[index]
      const cleanPath = path.startsWith('/') ? path : `/${path}`
      const fullUrl = `${baseUrl}${cleanPath}`

      try {
        console.log(`[API] Requesting: ${fullUrl}`)
        const data = await $fetch<T>(fullUrl, {
          ...options,
          retry: 0, // Manejamos el reintento nosotros
          timeout: 5000
        })
        
        // Si funcionó, guardamos esta como la URL de trabajo
        if (workingUrl.value !== baseUrl) {
            console.log(`[API] Switched to working URL: ${baseUrl}`)
            workingUrl.value = baseUrl
        }
        
        return data
      } catch (error: any) {
        // Determinar si es un error de conexión (no un 4xx/5xx del servidor que sí responde)
        // FetchError ocurre cuando no se puede conectar
        const isConnectionError = !error.response || error.name === 'FetchError' || error.name === 'AbortError'
        
        if (isConnectionError && index + 1 < urls.length) {
          const nextIndex = index + 1
          console.warn(`[API] Connection failed to ${baseUrl}. Trying fallback ${nextIndex}: ${urls[nextIndex]}`)
          return execute(nextIndex)
        }
        
        throw error
      }
    }

    return execute(startIndex)
  }

  return {
    // Generic methods
    get: <T>(path: string, options: any = {}) => request<T>(path, { ...options, method: 'GET' }),
    post: <T>(path: string, body: any, options: any = {}) => request<T>(path, { ...options, method: 'POST', body }),
    put: <T>(path: string, body: any, options: any = {}) => request<T>(path, { ...options, method: 'PUT', body }),
    delete: <T>(path: string, options: any = {}) => request<T>(path, { ...options, method: 'DELETE' }),
    
    // Specific CRUD for Cantos
    getSongs: () => request<any[]>('/api/cantos'),
    getSong: (id: string) => request<any>(`/api/canto/${id}`),
    createSong: (song: any) => request<any>('/api/canto', { method: 'POST', body: song }),
    updateSong: (song: any) => request<any>('/api/canto', { method: 'PUT', body: song }),
    deleteSong: (id: string) => request<any>(`/api/canto/${id}`, { method: 'DELETE' }),

    // Anuncios
    getAnnouncements: () => request<any[]>('/api/anuncios'),
    createAnnouncement: (text: string, position: 'top' | 'bottom' = 'bottom') => request<any>('/api/anuncios', { method: 'POST', body: { text, position } }),
    deleteAnnouncement: (id: string) => request<any>(`/api/anuncios/${id}`, { method: 'DELETE' })
  }
}

