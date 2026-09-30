/*
 * Phones: narrow screens, or any screen held sideways with little height. Parts of the HUD that
 * only earn their space on bigger screens (the minimap) are left out here.
 */
const QUERY = '(max-width: 640px), (max-height: 500px)'

export function useCompactScreen() {
  const compact = ref(import.meta.client ? window.matchMedia(QUERY).matches : false)
  let mq: MediaQueryList | undefined
  const update = (e: MediaQueryListEvent) => (compact.value = e.matches)
  onMounted(() => {
    mq = window.matchMedia(QUERY)
    compact.value = mq.matches
    mq.addEventListener('change', update)
  })
  onBeforeUnmount(() => mq?.removeEventListener('change', update))
  return compact
}
