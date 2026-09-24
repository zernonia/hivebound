import type { KeepsakeId } from './keepsakes'
import { hash2 } from './noise'
import type { Amounts, BuildingId } from './resources'
import type { SpeciesId } from './species'
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
    ask: 'A Wax Works turns tree resin and honey into wax. Build one and bring me four wax. (You can pause it in its panel when you\'d rather keep your honey.)',
    goals: [{ kind: 'build', building: 'waxworks' }, { kind: 'deliver', amounts: { wax: 4 } }],
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
    ask: 'Let\'s celebrate everything you\'ve done. Twelve honey, four bee bread and three golden pollen for a hive feast!',
    goals: [{ kind: 'deliver', amounts: { honey: 12, beebread: 4, golden: 3 } }],
    reward: { storage: 20, gift: { wax: 6 } },
    thanks: 'What a feast! Everyone danced until the lamps went dim. And listen: the mist at the edge of the meadow is thinning. Something is waiting out there, little explorer.',
  },
]

/** Chapter two: past the mist. Unlocked by the feast, which lifts the mist ring. */
export const CHAPTER_TWO: RequestDef[] = [
  {
    id: 'past-the-mist',
    title: 'Past the mist',
    ask: 'The mist has thinned enough to fly through! Old stories speak of a little cottage in the lavender beyond it. I\'ve marked where I think it is.',
    goals: [{ kind: 'visit', poi: 'cottage' }],
    reward: { storage: 10 },
    thanks: 'A cottage that says WELCOME, BEES? Then this land was ours once, too. How lovely to be expected.',
    reveal: 'cottage',
  },
  {
    id: 'lavender-friend',
    title: 'A friend in purple',
    ask: 'Lavender Bees hum in the heath out there. Would you dance with one and bring them home?',
    goals: [{ kind: 'species', species: 'lavender', count: 1 }],
    reward: { gift: { honey: 5, beebread: 2 } },
    thanks: 'Such a calm, sweet-smelling friend. The nursery already feels sleepier.',
  },
  {
    id: 'amber-resin',
    title: 'Amber resin',
    ask: 'The Amber Woods drip with the finest resin. Fly home ten, and the Wax Works will sing.',
    goals: [{ kind: 'bring', amounts: { resin: 10 } }],
    reward: { gift: { wax: 5 } },
    thanks: 'Glowing like little suns! This wax will be the best we\'ve ever made.',
  },
  {
    id: 'hollow-oak',
    title: 'The Hollow Oak',
    ask: 'Deep in the Amber Woods there is a tree so big a whole hive could live inside. I\'ve marked it. Go and see?',
    goals: [{ kind: 'visit', poi: 'hollowoak' }],
    reward: { storage: 10 },
    thanks: 'A hive inside a tree, humming all by itself? Then we were never really alone out here.',
    reveal: 'hollowoak',
  },
  {
    id: 'moonwell',
    title: 'The Moonwell',
    ask: 'They say the Moonwell holds a piece of the moon. Visit it, and bring me three grains of golden pollen for a wish.',
    goals: [{ kind: 'visit', poi: 'moonwell' }, { kind: 'deliver', amounts: { golden: 3 } }],
    reward: { storage: 10, gift: { honey: 6 } },
    thanks: 'I made my wish. I can\'t tell you what it was, but I think you\'ll like it.',
    reveal: 'moonwell',
  },
  {
    id: 'big-family',
    title: 'One big family',
    ask: 'Our hive, the wild bees, the old hive in the oak. Let\'s bring everyone together: eight helpers, and a feast of twenty honey and ten wax.',
    goals: [{ kind: 'friends', count: 8 }, { kind: 'deliver', amounts: { honey: 20, wax: 10 } }],
    reward: { storage: 20, keepsake: 'starpin' },
    thanks: 'Look at us all! You flew further than any bee in a hundred summers. Wear this star, little explorer. You\'ve earned it. The little wishes will keep coming, whenever you like.',
  },
]

/** Chapter one and two, back to back. */
export const STORY: RequestDef[] = [...CHAPTER_ONE, ...CHAPTER_TWO]

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
  return i < STORY.length ? STORY[i]! : littleWish(i - STORY.length)
}
