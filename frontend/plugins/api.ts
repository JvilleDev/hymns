export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.apiUrl as string

  const api = $fetch.create({
    baseURL: apiUrl,
    onRequest({ request, options }) {
      // Add any global headers here
    },
    onResponseError({ response }) {
      console.error('API Error:', response)
    }
  })

  return {
    provide: {
      api
    }
  }
})
