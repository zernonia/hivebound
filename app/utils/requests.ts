import type { KeepsakeId } from './keepsakes'
import { hash2 } from './noise'
import type { Amounts, BuildingId } from './resources'
import type { PoiId } from './world'

/*
 * The Queen's requests: a short, hand-written first chapter that walks through the whole
 * loop (gather → press → friends → bake → wax → rooms → golden pollen → the old honeycomb),
 * then an endless run of smaller "little wishes" that keep honey and treasures flowing.
 */

export type Goal =
  /** Fly this much home yourself (counted as you unload, not taken from the store). */
  | { kind: 'bring', amounts: Amounts }
  /** Hand this much over from the store. */
  | { kind: 'deliver', amounts: Amounts }
  | { kind: 'build', building: BuildingId }
  | { kind: 'friends', count: number }
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
  title: string
  /** What the Queen says when asking. */
  ask: string
  goals: Goal[]
  reward: Reward
  /** Her thank-you, kept as a journal entry. */
  thanks: string
  /** Marked on the map when the request starts: a place, or the nearest golden pollen. */
  reveal?: PoiId | 'golden'
}

export const CHAPTER_ONE: RequestDef[] = [
  {
    id: 'sweet-start',
    title: 'A sweet start',
    ask: 'Could you fetch a little nectar for the Honey Press? Gather six drops from a sunny meadow and fly them home.',
    goals: [{ kind: 'bring', amounts: { nectar: 6 } }],
    reward: { gift: { honey: 2 } },
    thanks: 'Mmm, meadow nectar. You have a good nose for flowers, little one. The press is already squeaking. Here, two jars of honey for the road.',
  },
  {
    id: 'first-honey',
    title: 'Our first honey',
    ask: 'The Honey Press squeezes nectar into honey. Keep it fed and bring me three jars.',
    goals: [{ kind: 'deliver', amounts: { honey: 3 } }],
    reward: { storage: 10 },
    thanks: 'Real honey, from our own press! I\'ve had the store widened so there\'s room for more.',
  },
  {
    id: 'first-friend',
    title: 'A friend for the hive',
    ask: 'A hive needs more than one bee. There are wild bees out there, shy ones. I\'ve marked the Wild Nest on your map: dance with one and bring them home.',
    goals: [{ kind: 'friends', count: 1 }],
    reward: { gift: { wax: 3 } },
    thanks: 'A new friend! Give them a job in the Colony tab. And here is some wax, for building.',
    reveal: 'nest',
  },
  {
    id: 'bee-bread',
    title: 'Bee bread for everyone',
    ask: 'Build a Bee Bread Kitchen and bake me two loaves. Pollen from the flower patches, water from the ponds.',
    goals: [{ kind: 'build', building: 'kitchen' }, { kind: 'deliver', amounts: { beebread: 2 } }],
    reward: { storage: 10 },
    thanks: 'Warm bee bread! The whole hive smells lovely. I\'ve made the store a little bigger again.',
  },
  {
    id: 'wax-walls',
    title: 'Wax for the walls',
    ask: 'A Wax Works turns tree resin and honey into wax. Build one and bring me three wax.',
    goals: [{ kind: 'build', building: 'waxworks' }, { kind: 'deliver', amounts: { wax: 3 } }],
    reward: { gift: { honey: 4, wax: 2 } },
    thanks: 'Beautiful wax, smooth as a pebble. Keep some to unseal the old cells, and have this honey.',
  },
  {
    id: 'room-to-grow',
    title: 'Room to grow',
    ask: 'Our friends need somewhere to sleep. Build a Bee Room: four snug beds.',
    goals: [{ kind: 'build', building: 'room' }],
    reward: { storage: 10 },
    thanks: 'Such cosy beds. Now there\'s room for more friends, and I\'ve widened the store too.',
  },
  {
    id: 'more-friends',
    title: 'A busier hive',
    ask: 'Three friends would make the hive feel like home. Dandelion hills, ponds and woods all have their own bees.',
    goals: [{ kind: 'friends', count: 3 }],
    reward: { gift: { beebread: 3, honey: 3 } },
    thanks: 'Listen to that happy hum! A treat for you, from all of us.',
  },
  {
    id: 'golden',
    title: 'Something golden',
    ask: 'Far from home, some flowers sparkle with golden pollen, and only you can carry it. I\'ve marked one on your map. Bring me a grain.',
    goals: [{ kind: 'deliver', amounts: { golden: 1 } }],
    reward: { keepsake: 'ribbon' },
    thanks: 'Golden pollen! I haven\'t seen any since I was a tiny bee. This ribbon is yours: my own thank-you bow.',
    reveal: 'golden',
  },
  {
    id: 'old-stories',
    title: 'Old stories',
    ask: 'My grandmother spoke of a great old honeycomb, out past the woods. I\'ve marked where I think it is. Will you go and see?',
    goals: [{ kind: 'visit', poi: 'honeycomb' }],
    reward: { storage: 10 },
    thanks: 'Bigger cells than ours, you say? Then bees really did live far beyond the meadow once. How wonderful.',
    reveal: 'honeycomb',
  },
  {
    id: 'feast',
    title: 'A feast for the hive',
    ask: 'Let\'s celebrate everything you\'ve done. Fifteen honey, five bee bread and three golden pollen for a hive feast!',
    goals: [{ kind: 'deliver', amounts: { honey: 15, beebread: 5, golden: 3 } }],
    reward: { storage: 20, gift: { wax: 6 } },
    thanks: 'What a feast! Everyone danced until the lamps went dim. Thank you, little explorer. The meadow is ours to share now. There will always be little wishes, if you have time.',
  },
]

const WISH_TITLES = ['A little wish', 'Something sweet', 'For the nursery', 'A cosy evening', 'Spring cleaning', 'Tea with the Queen', 'Just because']
const WISH_ASKS = [
  'Nothing urgent, dear. Could you bring these when you have a moment?',
  'The little ones are hungry again. Would you mind?',
  'I\'m planning a small treat for the colony.',
  'A few things for the store, if you please.',
]

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
    title: WISH_TITLES[Math.floor(pick(4) * WISH_TITLES.length)]!,
    ask: WISH_ASKS[Math.floor(pick(5) * WISH_ASKS.length)]!,
    goals: [{ kind: 'deliver', amounts }],
    reward: pick(6) < 0.5 ? { storage: 5 } : { gift: { wax: 2 + Math.floor(step / 2), beebread: 1 } },
    thanks: 'Thank you, dear. The hive is humming.',
  }
}

/** The request at position `i` in the whole sequence. */
export function requestAt(i: number): RequestDef {
  return i < CHAPTER_ONE.length ? CHAPTER_ONE[i]! : littleWish(i - CHAPTER_ONE.length)
}
