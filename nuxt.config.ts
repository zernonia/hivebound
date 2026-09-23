// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  devtools: { enabled: true },
  modules: ['@tresjs/nuxt', '@pinia/nuxt'],
  css: ['~/assets/css/main.css'],
  // Components are named by file name only (ui/Minimap.vue → <Minimap>).
  components: [{ path: '~/components', pathPrefix: false }],
  app: {
    head: {
      title: 'Hivebound',
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no' },
        { name: 'description', content: 'A cozy bee exploration game. Hop hex to hex, grow your hive, and fill your journal.' },
        { name: 'theme-color', content: '#fbe9c9' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Patrick+Hand&display=swap' },
      ],
    },
  },
  // The game itself is client-only (WebGL). Marketing / Beedex pages can be SSR'd later.
  routeRules: {
    '/': { ssr: false },
  },
  tres: { devtools: true },
  typescript: { strict: true },
})
