import { appI18n, activeLang } from './i18n'
import type { KeepsakeId } from './keepsakes'
import { hash2 } from './noise'
import type { Amounts, BuildingId } from './resources'
import type { SpeciesId } from './species'
import type { PoiId } from './world'
import type { Lang } from '~/stores/settings'

/*
 * The Queen's requests: a short, hand-written first chapter that walks through the whole
 * loop (gather → press → friends → bake → wax → rooms → golden pollen → the old honeycomb),
 * then an endless run of smaller "little wishes" that keep honey and treasures flowing.
 *
 * Only structure lives here; everything she says lives in i18n/locales (requests.<id>.*).
 */

export type Goal =
  /** Fly this much home yourself (counted as you unload, not taken from the store). */
  | { kind: 'bring', amounts: Amounts }
  /** Hand this much over from the store. */
  | { kind: 'deliver', amounts: Amounts }
  | { kind: 'build', building: BuildingId }
  | { kind: 'friends', count: number }
  /** Have this many helpers of one species. */
  | { kind: 'species', species: SpeciesId, count: number }
  | { kind: 'visit', poi: PoiId }

export interface Reward {
  /** Extra room in the store for every resource. */
  storage?: number
  /** Resources handed over. */
  gift?: Amounts
  keepsake?: KeepsakeId
}

export interface RequestDef {
  id: string
  goals: Goal[]
  reward: Reward
  /** Marked on the map when the request starts: a place, or the nearest golden pollen. */
  reveal?: PoiId | 'golden'
}

export const CHAPTER_ONE: RequestDef[] = [
  {
    id: 'sweet-start',
    goals: [{ kind: 'bring', amounts: { nectar: 6 } }],
    reward: { gift: { honey: 2 } },
  },
  {
    id: 'first-honey',
    goals: [{ kind: 'deliver', amounts: { honey: 3 } }],
    reward: { storage: 10 },
  },
  {
    id: 'first-friend',
    goals: [{ kind: 'friends', count: 1 }],
    reward: { gift: { wax: 3 } },
    reveal: 'nest',
  },
  {
    id: 'bee-bread',
    goals: [{ kind: 'build', building: 'kitchen' }, { kind: 'deliver', amounts: { beebread: 2 } }],
    reward: { storage: 10 },
  },
  {
    id: 'wax-walls',
    goals: [{ kind: 'build', building: 'waxworks' }, { kind: 'deliver', amounts: { wax: 4 } }],
    reward: { gift: { honey: 4, wax: 2 } },
  },
  {
    id: 'room-to-grow',
    goals: [{ kind: 'build', building: 'room' }],
    reward: { storage: 10 },
  },
  {
    id: 'more-friends',
    goals: [{ kind: 'friends', count: 3 }],
    reward: { gift: { beebread: 3, honey: 3 } },
  },
  {
    id: 'golden',
    goals: [{ kind: 'deliver', amounts: { golden: 1 } }],
    reward: { keepsake: 'ribbon' },
    reveal: 'golden',
  },
  {
    id: 'old-stories',
    goals: [{ kind: 'visit', poi: 'honeycomb' }],
    reward: { storage: 10 },
    reveal: 'honeycomb',
  },
  {
    id: 'feast',
    goals: [{ kind: 'deliver', amounts: { honey: 12, beebread: 4, golden: 3 } }],
    reward: { storage: 20, gift: { wax: 6 } },
  },
]

/** Chapter two: past the mist. Unlocked by the feast, which lifts the mist ring. */
export const CHAPTER_TWO: RequestDef[] = [
  {
    id: 'past-the-mist',
    goals: [{ kind: 'visit', poi: 'cottage' }],
    reward: { storage: 10 },
    reveal: 'cottage',
  },
  {
    id: 'lavender-friend',
    goals: [{ kind: 'species', species: 'lavender', count: 1 }],
    reward: { gift: { honey: 5, beebread: 2 } },
  },
  {
    id: 'amber-resin',
    goals: [{ kind: 'bring', amounts: { resin: 10 } }],
    reward: { gift: { wax: 5 } },
  },
  {
    id: 'hollow-oak',
    goals: [{ kind: 'visit', poi: 'hollowoak' }],
    reward: { storage: 10 },
    reveal: 'hollowoak',
  },
  {
    id: 'moonwell',
    goals: [{ kind: 'visit', poi: 'moonwell' }, { kind: 'deliver', amounts: { golden: 3 } }],
    reward: { storage: 10, gift: { honey: 6 } },
    reveal: 'moonwell',
  },
  {
    id: 'big-family',
    goals: [{ kind: 'friends', count: 8 }, { kind: 'deliver', amounts: { honey: 20, wax: 10 } }],
    reward: { storage: 20, keepsake: 'starpin' },
  },
]

/** Chapter one and two, back to back. */
export const STORY: RequestDef[] = [...CHAPTER_ONE, ...CHAPTER_TWO]

/** Wish titles and asks, one pool per language, picked deterministically from the wish number. */
const WISH_TITLES: Record<Lang, readonly string[]> = {
  en: ['A little wish', 'Something sweet', 'For the nursery', 'A cosy evening', 'Spring cleaning', 'Tea with the Queen', 'Just because'],
  fr: ['Un petit souhait', 'Quelque chose de doux', 'Pour la nurserie', 'Une soirée douillette', 'Grand ménage de printemps', 'Le thé avec la Reine', 'Sans raison'],
}
const WISH_ASKS: Record<Lang, readonly string[]> = {
  en: [
    'Nothing urgent, dear. Could you bring these when you have a moment?',
    'The little ones are hungry again. Would you mind?',
    'I\'m planning a small treat for the colony.',
    'A few things for the store, if you please.',
  ],
  fr: [
    'Rien d\'urgent, chérie. Tu m\'apporteras ça quand tu auras un moment ?',
    'Les petits ont encore faim. Ça ne te dérange pas ?',
    'Je prépare une petite gâterie pour la colonie.',
    'Quelques choses pour les réserves, s\'il te plaît.',
  ],
}

/** Endless requests after chapter one: modest asks that slowly grow, with a gift back. */
export function littleWish(n: number): RequestDef {
  const step = Math.min(10, Math.floor(n / 2))
  const pick = (salt: number) => hash2(n, salt, 4242)
  const amounts: Amounts = { honey: 5 + step }
  if (pick(1) < 0.6) amounts.beebread = 2 + Math.floor(step / 2)
  if (pick(2) < 0.5) amounts.wax = 2 + Math.floor(step / 3)
  if (pick(3) < 0.4) amounts.golden = 1 + Math.floor(step / 5)
  return {
    id: `wish-${n}`,
    goals: [{ kind: 'deliver', amounts }],
    reward: pick(6) < 0.5 ? { storage: 5 } : { gift: { wax: 2 + Math.floor(step / 2), beebread: 1 } },
  }
}

/** The request at position `i` in the whole sequence. */
export function requestAt(i: number): RequestDef {
  return i < STORY.length ? STORY[i]! : littleWish(i - STORY.length)
}

/* ---------------- what the Queen says ---------------- */

const i18n = () => appI18n()

/** Wishes pick their words deterministically, so they re-say the same thing every time. */
function wishPick(n: number, salt: number, len: number) {
  return Math.floor(hash2(n, salt, 4242) * len)
}

export function requestTitle(req: RequestDef): string {
  const wish = req.id.startsWith('wish-')
  if (wish) return WISH_TITLES[activeLang()]![wishPick(Number(req.id.slice(5)), 4, WISH_TITLES.en.length)]!
  return i18n().t(`requests.${req.id}.title`)
}

export function requestAsk(req: RequestDef): string {
  const wish = req.id.startsWith('wish-')
  if (wish) return WISH_ASKS[activeLang()]![wishPick(Number(req.id.slice(5)), 5, WISH_ASKS.en.length)]!
  return i18n().t(`requests.${req.id}.ask`)
}

export function requestThanks(req: RequestDef): string {
  return i18n().t(req.id.startsWith('wish-') ? 'requests.wishes.thanks' : `requests.${req.id}.thanks`)
}
