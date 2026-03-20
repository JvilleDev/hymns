export const useApi = () => {
  const { apiUrl: baseUrl, backendUrl: directUrlFallback } = useRuntimeConfig().public
  const directUrl = (directUrlFallback as string) || "http://localhost:3100"

  const request = async <T>(path: string, options: any = {}): Promise<T> => {
    const cleanPath = path.startsWith('/') ? path : `/${path}`
    const fullUrl = `${baseUrl}${cleanPath}`

    try {
      return await $fetch<T>(fullUrl, { ...options, timeout: 10000 })
    } catch (error) {
      // Ensure we have a valid absolute directUrl and it's not just pointing back to the same host
      const isAbsolute = directUrl.startsWith('http')
      const currentHost = typeof window !== 'undefined' ? window.location.host : ''
      const isDirectUrlSameAsHost = directUrl.includes(currentHost)
      
      if (isAbsolute && !isDirectUrlSameAsHost) {
        console.warn(`[API] Proxy failed, retrying direct: ${directUrl}${cleanPath}`)
        return await $fetch<T>(`${directUrl}${cleanPath}`, { ...options, timeout: 10000 })
      }
      
      console.error(`[API] Request failed and no valid fallback available: ${fullUrl}`)
      throw error
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
    deleteSelectedAnnouncements: (ids: string[]) => request<any>('/api/anuncios/delete-selected', { method: 'POST', body: { ids } })
  }
}

