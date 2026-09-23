import type { Tile } from './world'

/*
 * Resources, the tiles that yield them, hive buildings and upgrades.
 * Pure data + small helpers; state lives in stores/hive.ts.
 */

export type RawResource = 'nectar' | 'pollen' | 'water' | 'resin'
export type Product = 'honey' | 'beebread' | 'wax'
export type Resource = RawResource | Product
export type Amounts = Partial<Record<Resource, number>>

export const RAW_RESOURCES: RawResource[] = ['nectar', 'pollen', 'water', 'resin']
export const PRODUCTS: Product[] = ['honey', 'beebread', 'wax']
export const ALL_RESOURCES: Resource[] = [...RAW_RESOURCES, ...PRODUCTS]

export const RESOURCE_INFO: Record<Resource, { name: string, color: string, blurb: string }> = {
  nectar: { name: 'Nectar', color: '#ff9fb8', blurb: 'Sweet and runny, from meadow flowers.' },
  pollen: { name: 'Pollen', color: '#ffc933', blurb: 'Golden dust from flower patches.' },
  water: { name: 'Water', color: '#6fb8ff', blurb: 'Cool drops from ponds and lily water.' },
  resin: { name: 'Resin', color: '#c9803a', blurb: 'Sticky tree resin from the woods.' },
  honey: { name: 'Honey', color: '#ffae1f', blurb: 'Made from nectar in the Honey Press.' },
  beebread: { name: 'Bee Bread', color: '#e0a15a', blurb: 'Pollen and water, baked soft.' },
  wax: { name: 'Wax', color: '#fff0b8', blurb: 'For building and expanding the hive.' },
}

export function formatAmounts(a: Amounts) {
  return ALL_RESOURCES.filter(r => a[r]).map(r => `${a[r]} ${RESOURCE_INFO[r].name}`).join(', ')
}

/* ------------------------------------------------------------------ */
/* Where resources come from                                          */
/* ------------------------------------------------------------------ */

export interface TileSource {
  resource: RawResource
  /** Units the tile holds when full. */
  max: number
  /** Seconds to regrow one unit. */
  regen: number
}

export function tileSource(tile: Tile | undefined): TileSource | null {
  if (!tile || !tile.walkable) return null
  switch (tile.poi) {
    case 'sunflower': return { resource: 'nectar', max: 8, regen: 25 }
    case 'dandelion': return { resource: 'pollen', max: 8, regen: 25 }
    case 'pond': return { resource: 'water', max: 10, regen: 20 }
    case 'stump': return { resource: 'resin', max: 6, regen: 40 }
  }
  switch (tile.terrain) {
    case 'meadow': return { resource: 'nectar', max: 3, regen: 60 }
    case 'flowers': return { resource: 'pollen', max: 3, regen: 60 }
    case 'water': return { resource: 'water', max: 4, regen: 45 }
    case 'forest': return { resource: 'resin', max: 2, regen: 90 }
    default: return null
  }
}

/* ------------------------------------------------------------------ */
/* Hive buildings                                                     */
/* ------------------------------------------------------------------ */

export type BuildingId = 'press' | 'kitchen' | 'waxworks' | 'larder'

export interface Recipe {
  in: Amounts
  out: Amounts
  seconds: number
}

export interface BuildingDef {
  name: string
  blurb: string
  cost: Amounts
  recipe?: Recipe
  /** Extra storage per resource. */
  storage?: number
}

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  press: {
    name: 'Honey Press',
    blurb: 'Slowly squeezes nectar into golden honey.',
    cost: { nectar: 6 },
    recipe: { in: { nectar: 3 }, out: { honey: 1 }, seconds: 30 },
  },
  kitchen: {
    name: 'Bee Bread Kitchen',
    blurb: 'Bakes pollen and water into soft bee bread.',
    cost: { honey: 4, pollen: 4 },
    recipe: { in: { pollen: 2, water: 1 }, out: { beebread: 1 }, seconds: 40 },
  },
  waxworks: {
    name: 'Wax Works',
    blurb: 'Melts resin with a little honey into building wax.',
    cost: { honey: 6, resin: 3 },
    recipe: { in: { resin: 2, honey: 1 }, out: { wax: 1 }, seconds: 50 },
  },
  larder: {
    name: 'Larder Comb',
    blurb: 'Extra comb for storing more of everything.',
    cost: { wax: 4 },
    storage: 40,
  },
}

export const BUILDING_LIST = Object.keys(BUILDINGS) as BuildingId[]

/** Finished goods a building can hold before someone collects them. */
export const TRAY_CAP = 10
/** Buildings catch up at most this long while the game is closed. */
export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000
export const BASE_STORAGE = 40
export const UNLOCK_CELL_COST: Amounts = { wax: 3 }

/* ------------------------------------------------------------------ */
/* Upgrades                                                           */
/* ------------------------------------------------------------------ */

export type UpgradeId = 'pouch' | 'wings' | 'gathering'

export interface UpgradeDef {
  name: string
  /** Describes the value at a level, e.g. "Holds 15". */
  describe: (value: number) => string
  /** Value at each level; level 0 is the start. */
  values: number[]
  /** Cost to go from level i to i + 1. */
  costs: Amounts[]
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  pouch: {
    name: 'Bigger pouch',
    describe: v => `Carry ${v}`,
    values: [10, 15, 20, 30],
    costs: [{ honey: 4 }, { honey: 8, beebread: 2 }, { honey: 15, beebread: 5, wax: 3 }],
  },
  wings: {
    name: 'Stronger wings',
    describe: v => `${Math.round(v * 100)}% flying speed`,
    values: [1, 1.15, 1.3, 1.5],
    costs: [{ beebread: 3 }, { beebread: 6, honey: 4 }, { beebread: 10, wax: 4 }],
  },
  gathering: {
    name: 'Quick gathering',
    describe: v => `${v.toFixed(2).replace(/0$/, '')}s per unit`,
    values: [1.2, 0.95, 0.75, 0.55],
    costs: [{ honey: 3 }, { honey: 6, beebread: 3 }, { honey: 10, wax: 3 }],
  },
}

export const UPGRADE_LIST = Object.keys(UPGRADES) as UpgradeId[]
