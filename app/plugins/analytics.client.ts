/*
 * Cloudflare Web Analytics: privacy-friendly traffic numbers (visits, pages, countries,
 * referrers, devices). No cookies and nothing that identifies a player, so no consent banner.
 * Only loads in production builds that have a token set (see runtimeConfig.public).
 */
export default defineNuxtPlugin(() => {
  const token = useRuntimeConfig().public.cfAnalyticsToken
  if (import.meta.dev || !token) return
  const s = document.createElement('script')
  s.defer = true
  s.src = 'https://static.cloudflareinsights.com/beacon.min.js'
  s.dataset.cfBeacon = JSON.stringify({ token })
  document.head.appendChild(s)
})
