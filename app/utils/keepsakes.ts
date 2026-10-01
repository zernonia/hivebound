import { appI18n } from './i18n'
import type { PoiId } from './world'

/*
 * Keepsakes: little things to wear, found at each place on the island (and one from the
 * Queen). One per slot can be worn at a time. Names and blurbs live in i18n/locales
 * (keepsakes.<id>.*).
 */

export type KeepsakeSlot = 'head' | 'face' | 'neck' | 'side' | 'back' | 'tail'

export type KeepsakeId =
  | 'specs'
  | 'sunflower'
  | 'lilypad'
  | 'dandelion'
  | 'acorn'
  | 'satchel'
  | 'oldcrown'
  | 'mistscarf'
  | 'ribbon'
  | 'sprig'
  | 'leafcape'
  | 'locket'
  | 'starpin'

export interface KeepsakeDef {
  slot: KeepsakeSlot
  /** Where it's found: a place, or a gift from the Queen. */
  from: PoiId | 'queen'
}

export const KEEPSAKES: Record<KeepsakeId, KeepsakeDef> = {
  specs: { slot: 'face', from: 'signpost' },
  sunflower: { slot: 'head', from: 'sunflower' },
  lilypad: { slot: 'head', from: 'pond' },
  dandelion: { slot: 'head', from: 'dandelion' },
  acorn: { slot: 'head', from: 'stump' },
  satchel: { slot: 'side', from: 'nest' },
  oldcrown: { slot: 'head', from: 'honeycomb' },
  mistscarf: { slot: 'neck', from: 'mist' },
  ribbon: { slot: 'tail', from: 'queen' },
  sprig: { slot: 'head', from: 'cottage' },
  leafcape: { slot: 'back', from: 'hollowoak' },
  locket: { slot: 'neck', from: 'moonwell' },
  starpin: { slot: 'head', from: 'queen' },
}

export const KEEPSAKE_LIST = Object.keys(KEEPSAKES) as KeepsakeId[]

export const KEEPSAKE_BY_POI: Partial<Record<PoiId, KeepsakeId>> = Object.fromEntries(
  KEEPSAKE_LIST.filter(id => KEEPSAKES[id].from !== 'queen').map(id => [KEEPSAKES[id].from, id]),
)

export const keepsakeName = (id: KeepsakeId) => appI18n().t(`keepsakes.${id}.name`)
export const keepsakeBlurb = (id: KeepsakeId) => appI18n().t(`keepsakes.${id}.blurb`)
