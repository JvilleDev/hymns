import ip from 'ip'

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
    app: {
      apiUrl: process.env.BACKEND_URL ?? "https://hymns-back.jville.dev",
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
  }
})
