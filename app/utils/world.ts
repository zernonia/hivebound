import { fbm, hash2, mulberry32 } from './noise'
import { type Hex, hexDistance, hexKey, hexesInRange, hexToWorld } from './hex'

export type Terrain = 'hive' | 'clearing' | 'grass' | 'meadow' | 'flowers' | 'forest' | 'water' | 'edge' | 'lavender' | 'amber'

export interface Tile {
  q: number
  r: number
  key: string
  terrain: Terrain
  /** Top surface height in world units. */
  height: number
  /** 0..1 stable per-tile random, used for colour jitter and props. */
  rand: number
  poi?: PoiId
  walkable: boolean
  /** The ring of mist round the first island: impassable until chapter two lifts it. */
  gate?: boolean
  /** Beyond the mist (chapter two's land): hidden and closed until the mist lifts. */
  beyond?: boolean
}

export type PoiId =
  | 'signpost'
  | 'sunflower'
  | 'pond'
  | 'stump'
  | 'dandelion'
  | 'nest'
  | 'honeycomb'
  | 'mist'
  | 'cottage'
  | 'hollowoak'
  | 'moonwell'

export interface PoiDef {
  id: PoiId
  name: string
  terrain: Terrain[]
  ring: [number, number]
  journal: { title: string, body: string }
}

export const WORLD_SEED = 1337
/** The first island ends in a ring of mist at this distance. */
export const WORLD_RADIUS = 24
/** Chapter two's land lies between the mist and the far edge of the world. */
export const OUTER_RADIUS = 32
export const HOME: Hex = { q: 0, r: 0 }
/** Doorstep of the home hive: where the bee starts and returns to. */
export const DOORSTEP: Hex = { q: 0, r: 1 }
export const REVEAL_RADIUS = 2

export const TERRAIN_LABEL: Record<Terrain, string> = {
  hive: 'Home Hive',
  clearing: 'Home Clearing',
  grass: 'Soft Grass',
  meadow: 'Sunny Meadow',
  flowers: 'Flower Patch',
  forest: 'Whispering Woods',
  water: 'Lily Water',
  edge: 'The Mist',
  lavender: 'Lavender Heath',
  amber: 'Amber Woods',
}

export const POIS: PoiDef[] = [
  {
    id: 'signpost',
    name: 'Old Signpost',
    terrain: ['grass', 'meadow'],
    ring: [3, 4],
    journal: {
      title: 'An old signpost',
      body: 'Three arrows, all pointing different ways. One just says "HONEY?" with a question mark. Somebody was lost, or very hopeful.',
    },
  },
  {
    id: 'sunflower',
    name: 'Giant Sunflower',
    terrain: ['meadow', 'grass', 'flowers'],
    ring: [4, 6],
    journal: {
      title: 'The tallest flower',
      body: 'A sunflower so big it has its own shadow weather. The nectar smells like warm toast. I will be back with more empty pockets.',
    },
  },
  {
    id: 'pond',
    name: 'Quiet Pond',
    terrain: ['water'],
    ring: [4, 9],
    journal: {
      title: 'A quiet pond',
      body: 'Lily pads big enough to nap on. A frog looked at me for a very long time and then said nothing. I think we are friends now.',
    },
  },
  {
    id: 'dandelion',
    name: 'Dandelion Hill',
    terrain: ['flowers', 'meadow'],
    ring: [6, 9],
    journal: {
      title: 'Dandelion hill',
      body: 'Every step sends little parachutes floating up. I counted forty-two before I lost count and started again.',
    },
  },
  {
    id: 'stump',
    name: 'Mossy Stump',
    terrain: ['forest'],
    ring: [5, 10],
    journal: {
      title: 'The mossy stump',
      body: 'Soft as a pillow and humming quietly. Something small lives inside. It left a crumb of wax on the doorstep, like a hello.',
    },
  },
  {
    id: 'nest',
    name: 'Wild Nest',
    terrain: ['forest', 'grass', 'meadow'],
    ring: [8, 11],
    journal: {
      title: 'A wild nest!',
      body: 'Another hive, out here on its own. The bees inside have stripes I have never seen. They buzzed hello in a funny accent.',
    },
  },
  {
    id: 'honeycomb',
    name: 'Broken Honeycomb',
    terrain: ['grass', 'meadow', 'clearing', 'flowers'],
    ring: [9, 11],
    journal: {
      title: 'Old honeycomb',
      body: 'Pieces of honeycomb, very very old, half buried in the grass. The cells are bigger than ours. Who built this?',
    },
  },
  {
    id: 'mist',
    name: "The Mist's Edge",
    terrain: ['grass', 'meadow', 'flowers', 'forest', 'clearing'],
    ring: [WORLD_RADIUS - 1, WORLD_RADIUS - 1],
    journal: {
      title: 'The edge of the mist',
      body: 'The meadow just... stops. Beyond is a warm, shimmering haze. My wings feel too thin to go further. Not yet, anyway.',
    },
  },
  // --- Beyond the mist (chapter two) ---
  {
    id: 'cottage',
    name: 'Lavender Cottage',
    terrain: ['lavender'],
    ring: [26, 28],
    journal: {
      title: 'A cottage in the heather',
      body: 'A tiny round house with a lavender roof, and nobody home. The doormat says WELCOME, BEES in very old letters. So someone expected us.',
    },
  },
  {
    id: 'hollowoak',
    name: 'The Hollow Oak',
    terrain: ['amber'],
    ring: [27, 30],
    journal: {
      title: 'The Hollow Oak',
      body: 'The biggest tree I have ever seen, glowing orange all the way up. Inside it is warm and hums like our hive. Old bees lived here. I am sure of it.',
    },
  },
  {
    id: 'moonwell',
    name: 'The Moonwell',
    terrain: ['water', 'lavender', 'grass'],
    ring: [28, 30],
    journal: {
      title: 'The Moonwell',
      body: 'A round stone well full of water so still it holds the whole sky. At night, they say, it keeps a little piece of the moon.',
    },
  },
]

export const POI_BY_ID = Object.fromEntries(POIS.map(p => [p.id, p])) as Record<PoiId, PoiDef>

function pickTerrain(q: number, r: number, d: number): { terrain: Terrain, height: number } {
  if (d === 0) return { terrain: 'hive', height: 0.18 }
  if (d === WORLD_RADIUS || d >= OUTER_RADIUS) return { terrain: 'edge', height: 0 }
  if (d > WORLD_RADIUS) return pickBeyond(q, r)
  const { x, z } = hexToWorld({ q, r })
  const e = fbm(x * 0.09, z * 0.09, WORLD_SEED)
  const m = fbm(x * 0.12 + 40, z * 0.12 - 17, WORLD_SEED + 7)
  if (d <= 1) return { terrain: 'clearing', height: 0.06 }

  const step = 0.14
  if (m > 0.63 && d > 3) return { terrain: 'water', height: -0.1 }
  if (e > 0.6 && d > 2) return { terrain: 'forest', height: step * 2 }
  if (m < 0.36 && d > 2) return { terrain: 'flowers', height: step * (e > 0.45 ? 1 : 0) }
  if (e > 0.47) return { terrain: 'meadow', height: step }
  return { terrain: 'grass', height: 0 }
}

/** Chapter two's land: lavender heath, amber woods, meadow and a few pools. */
function pickBeyond(q: number, r: number): { terrain: Terrain, height: number } {
  const { x, z } = hexToWorld({ q, r })
  const e = fbm(x * 0.1 + 90, z * 0.1 - 33, WORLD_SEED + 21)
  const m = fbm(x * 0.13 - 12, z * 0.13 + 71, WORLD_SEED + 29)
  const step = 0.14
  if (m > 0.66) return { terrain: 'water', height: -0.1 }
  if (e > 0.55) return { terrain: 'amber', height: step * 2 }
  if (m < 0.44) return { terrain: 'lavender', height: step }
  if (e > 0.45) return { terrain: 'meadow', height: step }
  return { terrain: 'grass', height: 0 }
}

export interface World {
  tiles: Tile[]
  byKey: Map<string, Tile>
  pois: { id: PoiId, hex: Hex }[]
}

export function generateWorld(): World {
  const tiles: Tile[] = []
  const byKey = new Map<string, Tile>()
  // The first island is generated exactly as before (same order, so the same places land in
  // the same spots), then the land beyond the mist is appended after it.
  const beyond = hexesInRange(HOME, OUTER_RADIUS).filter(h => hexDistance(HOME, h) > WORLD_RADIUS)
  for (const h of [...hexesInRange(HOME, WORLD_RADIUS), ...beyond]) {
    const d = hexDistance(HOME, h)
    const { terrain, height } = pickTerrain(h.q, h.r, d)
    const t: Tile = {
      q: h.q,
      r: h.r,
      key: hexKey(h),
      terrain,
      height,
      rand: hash2(h.q, h.r, WORLD_SEED + 99),
      walkable: terrain !== 'edge' && terrain !== 'hive',
    }
    if (d === WORLD_RADIUS) t.gate = true
    if (d > WORLD_RADIUS) t.beyond = true
    tiles.push(t)
    byKey.set(t.key, t)
  }

  // Place points of interest deterministically.
  const rng = mulberry32(WORLD_SEED)
  const pois: World['pois'] = []
  const used = new Set<string>()
  for (const def of POIS) {
    let candidates = tiles.filter((t) => {
      const d = hexDistance(HOME, t)
      return d >= def.ring[0] && d <= def.ring[1] && def.terrain.includes(t.terrain) && !used.has(t.key)
    })
    // Keep POIs from bunching up.
    candidates = candidates.filter(t => pois.every(p => hexDistance(p.hex, t) >= 3))
    if (def.id === 'mist') candidates = candidates.filter(t => t.r < 0 && t.q >= -2 && t.q <= 4)
    if (!candidates.length) continue
    const pick = candidates[Math.floor(rng() * candidates.length)]!
    pick.poi = def.id
    used.add(pick.key)
    pois.push({ id: def.id, hex: { q: pick.q, r: pick.r } })
  }
  return { tiles, byKey, pois }
}

let cached: World | null = null
/** The world is deterministic, so every consumer shares one instance. */
export function useWorldData(): World {
  if (!cached) cached = generateWorld()
  return cached
}
