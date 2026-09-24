// Offline play and "Add to Home Screen": register the service worker in built sites only,
// so dev never serves stale files. Waiting for load keeps it off the first-paint path.
export default defineNuxtPlugin(() => {
  if (import.meta.dev || !('serviceWorker' in navigator)) return
  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* offline support is a bonus */ })
  }
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
})
