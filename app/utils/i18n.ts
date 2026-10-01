import { useNuxtApp } from '#imports'
import type { Composer } from 'vue-i18n'
import type { Lang } from '~/stores/settings'

/*
 * The i18n composer for stores and utils, which have no component context for
 * useI18n(). Its locale is reactive, so strings built inside computed() or
 * getters re-translate when the language setting changes.
 *
 * Like useI18n(), this needs a running Nuxt app: call it when a string is
 * needed (or when a store is first used from a component), never at module
 * load.
 */

export function appI18n(): Composer {
  return useNuxtApp().$i18n
}

/** The language being played, for the few data pools that keep one copy per language. */
export function activeLang(): Lang {
  return appI18n().locale.value === 'fr' ? 'fr' : 'en'
}

/** Joins a list the way the current language does ("A, B and C" / « A, B et C »). */
export function joinList(items: string[], and?: string): string {
  if (items.length <= 1) return items.join('')
  const conj = and ?? appI18n().t('common.and')
  return `${items.slice(0, -1).join(', ')} ${conj} ${items[items.length - 1]}`
}

