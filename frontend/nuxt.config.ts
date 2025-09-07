export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',
  devtools: { enabled: false },
  modules: [
    "@nuxtjs/tailwindcss",
    "shadcn-nuxt",
    "@nuxt/icon",
    "@nuxtjs/color-mode",
    "@formkit/auto-animate/nuxt",
    "@nuxtjs/mdc",
    "@nuxtjs/google-fonts",
    '@vueuse/nuxt',
    "nuxt-tiptap-editor",
    "nuxt-tiptap-editor"
  ],
  vite: {
    vue: {
      template: {
        compilerOptions: {
          isCustomElement: (tag) => ['vue-inspector'].includes(tag)
        }
      }
    }
  },
  runtimeConfig: {
    public: {
      apiUrl: process.env.BACKEND_URL ?? "http://localhost:3100",
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
      'Outfit': [400, 500, 700, 800],
    }
  },
  routeRules: {
    "/backend/**": { proxy: `http://localhost:3100/**` }
  },
  ssr: true,
  tiptap: {
    prefix: 'Tiptap',
  },
})