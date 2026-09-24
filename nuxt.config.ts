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
        // Warm honey (--honey), matching the manifest so the installed app's title bar agrees.
        { name: 'theme-color', content: '#ffb627' },
        { name: 'apple-mobile-web-app-title', content: 'Hivebound' },
      ],
      link: [
        // Installable + offline: manifest here, service worker from plugins/sw.client.ts.
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'icon', type: 'image/svg+xml', href: '/icon.svg' },
        { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
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
  // Always emit a plain static site, even inside Cloudflare's CI (which would otherwise
  // auto-select the cloudflare-module preset and override wrangler.jsonc).
  nitro: { preset: 'static' },
  tres: { devtools: true },
  typescript: { strict: true },
})
