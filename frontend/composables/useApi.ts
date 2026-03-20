export const useApi = () => {
  const { apiUrl: baseUrl, backendUrl: directUrlFallback } = useRuntimeConfig().public
  const directUrl = (directUrlFallback as string) || "http://localhost:3100"

  const activeBaseUrl = useState<string>('api_active_url', () => baseUrl)

  const request = async <T>(path: string, options: any = {}): Promise<T> => {
    const cleanPath = path.startsWith('/') ? path : `/${path}`
    
    // Try current active URL
    try {
      const fullUrl = `${activeBaseUrl.value}${cleanPath}`
      return await $fetch<T>(fullUrl, { ...options, timeout: 10000 })
    } catch (error) {
      // If we're already using directUrl, just throw
      if (activeBaseUrl.value === directUrl) throw error

      // Try fallback to directUrl
      console.warn(`[API] Proxy failed, retrying direct: ${directUrl}${cleanPath}`)
      try {
        const res = await $fetch<T>(`${directUrl}${cleanPath}`, { ...options, timeout: 10000 })
        
        // If successful, persist directUrl for future requests
        activeBaseUrl.value = directUrl
        console.info(`[API] Switched to direct URL for future requests`)
        
        return res
      } catch (retryError) {
        throw retryError
      }
    }
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
    deleteAnnouncement: (id: string) => request<any>(`/api/anuncios/${id}`, { method: 'DELETE' }),
    clearAnnouncements: () => request<any>('/api/anuncios', { method: 'DELETE' }),
    deleteSelectedAnnouncements: (ids: string[]) => request<any>('/api/anuncios/delete-selected', { method: 'POST', body: { ids } }),
    
    // Config & Helpers
    activeBaseUrl,
    getFullUrl: (path: string) => `${activeBaseUrl.value}${path.startsWith('/') ? path : `/${path}`}`
  }
}

