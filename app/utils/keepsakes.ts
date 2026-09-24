import type { PoiId } from './world'

/*
 * Keepsakes: little things to wear, found at each place on the island (and one from the
 * Queen). One per slot can be worn at a time.
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
  name: string
  blurb: string
  slot: KeepsakeSlot
  /** Where it's found: a place, or a gift from the Queen. */
  from: PoiId | 'queen'
}

export const KEEPSAKES: Record<KeepsakeId, KeepsakeDef> = {
  specs: { name: 'Explorer\'s Specs', blurb: 'Round glasses hung on the old signpost. Everything looks a bit more findable.', slot: 'face', from: 'signpost' },
  sunflower: { name: 'Sunflower Clip', blurb: 'A baby sunflower from the giant one, for tucking by an antenna.', slot: 'head', from: 'sunflower' },
  lilypad: { name: 'Lily Pad Hat', blurb: 'A small, springy lily pad with a flower on top. The frog insisted.', slot: 'head', from: 'pond' },
  dandelion: { name: 'Dandelion Puff', blurb: 'A whole dandelion clock that somehow never blows away.', slot: 'head', from: 'dandelion' },
  acorn: { name: 'Acorn Cap', blurb: 'Left on the mossy stump\'s doorstep. It fits perfectly.', slot: 'head', from: 'stump' },
  satchel: { name: 'Wild Satchel', blurb: 'A tiny woven bag from the wild bees, for carrying good thoughts.', slot: 'side', from: 'nest' },
  oldcrown: { name: 'Ancient Crown', blurb: 'Dug from the old honeycomb. Whoever wore it was very small and very important.', slot: 'head', from: 'honeycomb' },
  mistscarf: { name: 'Mist Scarf', blurb: 'Woven from the shimmer at the edge of the world. Cool and soft.', slot: 'neck', from: 'mist' },
  ribbon: { name: 'Royal Ribbon', blurb: 'The Queen\'s own thank-you bow, for a very helpful bee.', slot: 'tail', from: 'queen' },
  sprig: { name: 'Lavender Sprig', blurb: 'From the cottage window box. Tucked behind an antenna, it smells like a nap.', slot: 'head', from: 'cottage' },
  leafcape: { name: 'Amber Leaf Cape', blurb: 'One huge glowing leaf from the Hollow Oak, worn like a little cape.', slot: 'back', from: 'hollowoak' },
  locket: { name: 'Moon Locket', blurb: 'A tiny silver locket from the Moonwell. It glows softly after dark.', slot: 'neck', from: 'moonwell' },
  starpin: { name: 'Star Pin', blurb: 'The Queen\'s star, for the bee who flew further than any other.', slot: 'head', from: 'queen' },
}

export const KEEPSAKE_LIST = Object.keys(KEEPSAKES) as KeepsakeId[]

export const KEEPSAKE_BY_POI: Partial<Record<PoiId, KeepsakeId>> = Object.fromEntries(
  KEEPSAKE_LIST.filter(id => KEEPSAKES[id].from !== 'queen').map(id => [KEEPSAKES[id].from, id]),
)
