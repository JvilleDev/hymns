export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',
  devtools: { enabled: false },
  modules: [
    "@nuxtjs/tailwindcss",
    "@nuxt/icon",
    "@nuxtjs/mdc",
    "@nuxtjs/google-fonts",
    '@vueuse/nuxt',
    '@formkit/auto-animate/nuxt',
  ],
  runtimeConfig: {
    public: {
      apiUrl: process.env.BACKEND_URL ?? "http://localhost:3100",
      socketUrl: process.env.BACKEND_URL ?? "http://localhost:3100",
    }
  },
  experimental: {
    appManifest: false
  },
  app: {
    pageTransition: {
      name: 'page',
      mode: 'out-in',
      type: "transition"
    }
  },
  googleFonts: {
    families: {
      'Outfit': true,
    }
  },
  routeRules: {
    "/backend/**": { proxy: `${process.env.BACKEND_URL ?? "http://localhost:3100"}/**` }
  },
  ssr: false,
})