export interface TenantSession {
  id: string
  isMaster: boolean
}

export const useAuth = () => {
  const api = useApi()
  const opts = {
    maxAge: 60 * 60 * 24 * 7, // 1 semana (igual que el token del backend)
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production'
  }
  const token = useCookie<string | null>('himnario_auth_token', opts)
  const tenant = useCookie<TenantSession | null>('himnario_tenant', opts)

  /** Inicia sesión con el ID y la contraseña del tenant. Devuelve null si ok, o el mensaje de error. */
  const login = async (tenantId: string, password: string): Promise<string | null> => {
    try {
      const res = await $fetch<{ token: string; tenantId: string; isMaster: boolean }>(
        api.getFullUrl('/api/auth/login'),
        { method: 'POST', body: { tenantId: tenantId.trim(), password } }
      )
      token.value = res.token
      tenant.value = { id: res.tenantId, isMaster: res.isMaster }
      api.clientId.value = res.tenantId
      return null
    } catch (e: any) {
      if (e?.status === 429) return 'Demasiados intentos, espera un minuto'
      if (e?.status === 401) return 'ID o contraseña incorrectos'
      return 'No se pudo conectar con el servidor'
    }
  }

  const logout = () => {
    token.value = null
    tenant.value = null
    api.clientId.value = ''
    return navigateTo('/login')
  }

  const isLoggedIn = computed(() => !!token.value && !!tenant.value)
  /** Tenant maestro: único que edita cantos y gestiona tenants. */
  const isMaster = computed(() => !!tenant.value?.isMaster)

  return {
    token,
    tenant,
    tenantId: computed(() => tenant.value?.id || ''),
    isLoggedIn,
    isMaster,
    // alias histórico usado en la UI de cantos
    isAdmin: isMaster,
    login,
    logout
  }
}
