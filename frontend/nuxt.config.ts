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
    'nuxt-tiptap-editor',
  ],
  runtimeConfig: {
    public: {
      apiUrl: process.env.BACKEND_URL || "https://hymns-back.jville.dev",
      backendUrl: process.env.BACKEND_URL || "https://hymns-back.jville.dev",
      authPassword: process.env.NUXT_AUTH_PASSWORD || "Jville24861937",
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
      'Outfit': [400, 500, 600, 700, 800],
    }
  },
  ssr: true,
})