// https://nuxt.com/docs/api/configuration/nuxt-config

// `npm run build:itch` makes a copy for itch.io, which serves the game from a sub-folder inside
// an iframe: relative asset paths, hash routing, and no offline service worker or install manifest.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
const itch = env?.HIVEBOUND_TARGET === 'itch'

export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  devtools: { enabled: true },
  modules: ['@tresjs/nuxt', '@pinia/nuxt'],
  css: ['~/assets/css/main.css'],
  // Components are named by file name only (ui/Minimap.vue → <Minimap>).
  components: [{ path: '~/components', pathPrefix: false }],
  app: {
    // Assets load relative to index.html; app/router.options.ts routes by hash in this build.
    ...(itch ? { cdnURL: './' } : {}),
    head: {
      title: 'Hivebound',
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no' },
        { name: 'description', content: 'A cozy bee exploration game. Hop hex to hex, grow your hive, and fill your journal.' },
        // Warm honey (--honey), matching the manifest so the installed app's title bar agrees.
        { name: 'theme-color', content: '#ffb627' },
        { name: 'apple-mobile-web-app-title', content: 'Hivebound' },
        // Link previews when the game is shared.
        { property: 'og:type', content: 'website' },
        { property: 'og:title', content: 'Hivebound' },
        { property: 'og:description', content: 'A cozy bee exploration game. Hop hex to hex, befriend wild bees, grow your hive, and fill your journal.' },
        { property: 'og:url', content: 'https://hivebound.zernonia.workers.dev/' },
        { property: 'og:image', content: 'https://hivebound.zernonia.workers.dev/icons/icon-512.png' },
        { name: 'twitter:card', content: 'summary' },
      ],
      link: [
        // Installable + offline: manifest here, service worker from plugins/sw.client.ts.
        ...(itch ? [] : [{ rel: 'manifest' as const, href: '/manifest.webmanifest' }]),
        { rel: 'icon', type: 'image/svg+xml', href: itch ? 'icon.svg' : '/icon.svg' },
        { rel: 'apple-touch-icon', href: itch ? 'icons/apple-touch-icon.png' : '/icons/apple-touch-icon.png' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Patrick+Hand&display=swap' },
      ],
    },
  },
  runtimeConfig: { public: { itch } },
  router: { options: { hashMode: itch } },
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
