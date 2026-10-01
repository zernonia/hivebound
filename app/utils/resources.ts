import { appI18n } from './i18n'
import type { Tile } from './world'

/*
 * Resources, the tiles that yield them, hive buildings and upgrades.
 * Pure data + small helpers; state lives in stores/hive.ts. Display text lives in
 * i18n/locales (resources.<id>.*, buildings.<id>.*, upgrades.<id>.*).
 */

export type RawResource = 'nectar' | 'pollen' | 'water' | 'resin'
export type Product = 'honey' | 'beebread' | 'wax'
/** Rare finds only the player's own bee can pick up (never helpers, never a pouch). */
export type Treasure = 'golden'
export type Resource = RawResource | Product | Treasure
export type Amounts = Partial<Record<Resource, number>>

export const RAW_RESOURCES: RawResource[] = ['nectar', 'pollen', 'water', 'resin']
export const PRODUCTS: Product[] = ['honey', 'beebread', 'wax']
export const TREASURES: Treasure[] = ['golden']
export const ALL_RESOURCES: Resource[] = [...RAW_RESOURCES, ...PRODUCTS, ...TREASURES]

export const RESOURCE_INFO: Record<Resource, { color: string }> = {
  nectar: { color: '#ff9fb8' },
  pollen: { color: '#ffc933' },
  water: { color: '#6fb8ff' },
  resin: { color: '#c9803a' },
  honey: { color: '#ffae1f' },
  beebread: { color: '#e0a15a' },
  wax: { color: '#fff0b8' },
  golden: { color: '#ffd84a' },
}

const i18n = () => appI18n()

/** Proper-case name ("Honey" / « Miel »). */
export const resourceName = (r: Resource) => i18n().t(`resources.${r}.name`)
export const resourceBlurb = (r: Resource) => i18n().t(`resources.${r}.blurb`)
/** Lowercase for sliding into English sentences ("2 more honey"); French uses its own phrasings. */
export const resourceLower = (r: Resource) => i18n().t(`resources.${r}.lower`)
/** Partitive, for gathering talk ("some nectar" / « du nectar », "some wax" / « de la cire »). */
export const resourceSome = (r: Resource) => i18n().t(`resources.${r}.some`)
/** "The nectar" / « Le nectar » — capital included, for sentence starts. */
export const resourceThe = (r: Resource) => i18n().t(`resources.${r}.the`)

/** "3 Honey, 1 Wax" / « 3 Miel, 1 Cire ». */
export function formatAmounts(a: Amounts) {
  return ALL_RESOURCES.filter(r => a[r]).map(r => `${a[r]} ${resourceName(r)}`).join(', ')
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
    case 'cottage': return { resource: 'nectar', max: 10, regen: 25 }
    case 'hollowoak': return { resource: 'resin', max: 8, regen: 35 }
    case 'moonwell': return { resource: 'water', max: 12, regen: 20 }
  }
  switch (tile.terrain) {
    case 'meadow': return { resource: 'nectar', max: 3, regen: 60 }
    case 'flowers': return { resource: 'pollen', max: 3, regen: 60 }
    case 'water': return { resource: 'water', max: 4, regen: 45 }
    case 'forest': return { resource: 'resin', max: 2, regen: 90 }
    // Beyond the mist, the land is richer.
    case 'lavender': return { resource: 'nectar', max: 5, regen: 50 }
    case 'amber': return { resource: 'resin', max: 4, regen: 60 }
    default: return null
  }
}

/* ------------------------------------------------------------------ */
/* Hive buildings                                                     */
/* ------------------------------------------------------------------ */

export type BuildingId = 'press' | 'kitchen' | 'waxworks' | 'larder' | 'room'

export interface Recipe {
  in: Amounts
  out: Amounts
  seconds: number
}

export interface BuildingDef {
  cost: Amounts
  recipe?: Recipe
  /** Extra storage per resource. */
  storage?: number
  /** Helper bees it can house. */
  housing?: number
}

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  press: {
    cost: { nectar: 6 },
    recipe: { in: { nectar: 3 }, out: { honey: 1 }, seconds: 20 },
  },
  kitchen: {
    cost: { honey: 4, pollen: 4 },
    recipe: { in: { pollen: 2, water: 1 }, out: { beebread: 1 }, seconds: 40 },
  },
  waxworks: {
    cost: { honey: 6, resin: 3 },
    recipe: { in: { resin: 2, honey: 1 }, out: { wax: 1 }, seconds: 50 },
  },
  larder: {
    cost: { wax: 4 },
    storage: 40,
  },
  room: {
    cost: { wax: 3, honey: 4 },
    housing: 4,
  },
}

export const BUILDING_LIST = Object.keys(BUILDINGS) as BuildingId[]

export const buildingName = (b: BuildingId) => i18n().t(`buildings.${b}.name`)
export const buildingBlurb = (b: BuildingId) => i18n().t(`buildings.${b}.blurb`)
/** "the Honey Press" / « le Pressoir à Miel » — inside a sentence. */
export const buildingThe = (b: BuildingId) => i18n().t(`buildings.${b}.the`)
/** "at the Honey Press" / « au Pressoir à Miel » — includes the preposition. */
export const buildingAt = (b: BuildingId) => i18n().t(`buildings.${b}.at`)
/** "of the Honey Press" / « du Pressoir à Miel » — includes the preposition. */
export const buildingOf = (b: BuildingId) => i18n().t(`buildings.${b}.of`)

/** Finished goods a building can hold before someone collects them. */
export const TRAY_CAP = 10
/** Buildings catch up at most this long while the game is closed. */
export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000
export const BASE_STORAGE = 40
export const UNLOCK_CELL_COST: Amounts = { wax: 1 }

/* ------------------------------------------------------------------ */
/* Upgrades                                                           */
/* ------------------------------------------------------------------ */

export type UpgradeId = 'pouch' | 'wings' | 'gathering'

export interface UpgradeDef {
  /** Value at each level; level 0 is the start. */
  values: number[]
  /** Cost to go from level i to i + 1. */
  costs: Amounts[]
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  pouch: {
    values: [10, 15, 20, 30],
    costs: [{ honey: 4 }, { honey: 8, beebread: 2 }, { honey: 15, beebread: 5, wax: 3 }],
  },
  wings: {
    values: [1, 1.15, 1.3, 1.5],
    costs: [{ beebread: 3 }, { beebread: 6, honey: 4 }, { beebread: 10, wax: 4 }],
  },
  gathering: {
    values: [1.2, 0.95, 0.75, 0.55],
    costs: [{ honey: 3 }, { honey: 6, beebread: 3 }, { honey: 10, wax: 3 }],
  },
}

export const UPGRADE_LIST = Object.keys(UPGRADES) as UpgradeId[]

export const upgradeName = (u: UpgradeId) => i18n().t(`upgrades.${u}.name`)

/** Describes the value at a level, e.g. "Carry 15" / « Transporter 15 ». */
export function upgradeDescribe(u: UpgradeId, v: number): string {
  const t = i18n().t
  switch (u) {
    case 'pouch': return t('upgrades.pouch.describe', { v })
    case 'wings': return t('upgrades.wings.describe', { pct: Math.round(v * 100) })
    case 'gathering': return t('upgrades.gathering.describe', { v: v.toFixed(2).replace(/0$/, '') })
  }
}
