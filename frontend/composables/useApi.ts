export const useApi = () => {
  const { apiUrl: baseUrl, backendUrl: directUrlFallback } = useRuntimeConfig().public
  const directUrl = (directUrlFallback as string) || "http://localhost:3100"

  const request = async <T>(path: string, options: any = {}): Promise<T> => {
    const cleanPath = path.startsWith('/') ? path : `/${path}`
    const fullUrl = `${baseUrl}${cleanPath}`

    try {
      console.log(`[API] Requesting: ${fullUrl}`)
      return await $fetch<T>(fullUrl, {
        ...options,
        timeout: 10000
      })
    } catch (error: any) {
      console.error(`[API] Error requesting ${fullUrl}, checking if fallback is needed...`)
      
      // If it's a proxy issue or connection error, try direct URL
      // We check if the current request was already using the direct URL to avoid infinite loops
      if (!fullUrl.startsWith(directUrl)) {
        const fallbackUrl = `${directUrl}${cleanPath}`
        console.warn(`[API] Retrying with direct URL: ${fallbackUrl}`)
        try {
          return await $fetch<T>(fallbackUrl, {
            ...options,
            timeout: 10000
          })
        } catch (retryError: any) {
          console.error(`[API] Direct fallback failed for ${fallbackUrl}:`, retryError)
          throw retryError
        }
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

