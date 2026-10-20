import type { RouterConfig } from '@nuxt/schema'
import { createWebHashHistory } from 'vue-router'

// The itch.io build runs from whatever sub-folder itch serves it in, so it routes by hash
// relative to the page itself. Everywhere else, Nuxt's usual history is used.
export default {
  history: () => (import.meta.client && useRuntimeConfig().public.itch ? createWebHashHistory() : undefined),
} satisfies RouterConfig
