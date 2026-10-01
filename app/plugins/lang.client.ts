import { useSettings } from '~/stores/settings'

/*
 * Applies the saved (or system) language before the game boots, so the very
 * first paint is already in the right language. Settings load twice (once
 * here, once in index.vue) — load() is idempotent. Runtime switches are
 * watched in index.vue.
 */

export default defineNuxtPlugin(async (nuxtApp) => {
  const settings = useSettings()
  settings.load()
  if (nuxtApp.$i18n.locale.value !== settings.lang)
    await nuxtApp.$i18n.setLocale(settings.lang)
})
