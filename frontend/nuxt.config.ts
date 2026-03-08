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
      apiUrl: "/backend",
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
    "/backend/**": { proxy: "http://localhost:3100/**" },
    "/api/**": { proxy: "http://localhost:3100/api/**" },
    "/sse": { proxy: "http://localhost:3100/sse" },
    "/search": { proxy: "http://localhost:3100/search" },
    "/import": { proxy: "http://localhost:3100/import" },
  },
  ssr: false,
  vite: {
    server: {
      allowedHosts: ["h1wrh0-ip-181-32-81-2.tunnelmole.net"],
      proxy: {
        '/sse': {
          target: 'http://localhost:3100',
          changeOrigin: false
        }
      }
    }
  }
})