import { type BeeLook, HONEY_BEE } from '~/game/bee'
import { NOCTURNAL_BEE } from '~/game/beeVariants'
import { appI18n, activeLang } from './i18n'
import type { Lang } from '~/stores/settings'
import type { RawResource } from './resources'
import type { Terrain } from './world'

/*
 * Wild bee species you can befriend. Each is a BeeLook variant (colours and proportions),
 * lives on one kind of terrain, prefers gathering one resource, and has its own befriending
 * dance: how fast the marker spins and how wide the green arc is.
 *
 * Display text lives in i18n/locales (species.<id>.*), so a bee reads the same in any
 * language. French cares about gender and articles, so each species carries a few
 * ready-made phrases there ("un Bourdon sauvage", "la Maçonne est repartie"…).
 */

export type SpeciesId = 'bumble' | 'mason' | 'dew' | 'carpenter' | 'moon' | 'lavender' | 'ember'

export interface SpeciesDef {
  look: BeeLook
  habitat: Terrain
  favourite: RawResource
  /** Units carried home per trip. */
  carry: number
  /**
   * Seconds per hex of flight (the player bee is ~0.3). Helpers are deliberately unhurried:
   * roughly 3-4 units a minute each, so exploring yourself always gathers faster.
   */
  secondsPerHex: number
  /** Seconds to gather one unit. */
  gatherSeconds: number
  /** Only comes out at night (when day and night are on). */
  nightOnly?: boolean
  dance: {
    /** Marker speed in full turns per second. */
    turns: number
    /** Width of the green arc in degrees. */
    arc: number
  }
}

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  bumble: {
    look: {
      ...HONEY_BEE,
      body: { width: 0.56, height: 0.54, length: 0.58, corner: 0.15 },
      colors: { ...HONEY_BEE.colors, body: '#f6b33c', stripe: '#3b2a24', belly: '#fff1d8', antenna: '#3b2a24', legs: '#3b2a24' },
      stripes: [[0.02, 0.2], [0.3, 0.46]],
      eyes: { ...HONEY_BEE.eyes, bottom: '#c07a2c' },
    },
    habitat: 'meadow',
    favourite: 'nectar',
    carry: 3,
    secondsPerHex: 2.0,
    gatherSeconds: 6,
    dance: { turns: 0.7, arc: 72 },
  },
  mason: {
    look: {
      ...HONEY_BEE,
      colors: { ...HONEY_BEE.colors, body: '#8fd1bd', stripe: '#2f5d57', belly: '#e3f6ee', antenna: '#2f5d57', legs: '#2f5d57', blush: '#ff9fb8' },
      eyes: { ...HONEY_BEE.eyes, bottom: '#3f9c8e' },
    },
    habitat: 'flowers',
    favourite: 'pollen',
    carry: 2,
    secondsPerHex: 1.7,
    gatherSeconds: 5.5,
    dance: { turns: 0.85, arc: 60 },
  },
  dew: {
    look: {
      ...HONEY_BEE,
      colors: { ...HONEY_BEE.colors, body: '#a9d8ff', stripe: '#3d6f9e', belly: '#eef8ff', antenna: '#3d6f9e', legs: '#3d6f9e', antennaTip: '#e6f6ff', antennaGlow: 0.4 },
      eyes: { ...HONEY_BEE.eyes, bottom: '#5fb8ff' },
      wings: { ...HONEY_BEE.wings, fill: '#dff3ff', rim: '#ffffff' },
    },
    habitat: 'water',
    favourite: 'water',
    carry: 2,
    secondsPerHex: 1.8,
    gatherSeconds: 5,
    dance: { turns: 0.95, arc: 54 },
  },
  carpenter: {
    look: {
      ...HONEY_BEE,
      body: { width: 0.54, height: 0.5, length: 0.62, corner: 0.1 },
      colors: { ...HONEY_BEE.colors, body: '#4d3c34', stripe: '#f2b43c', belly: '#6e584a', antenna: '#2a1d17', legs: '#2a1d17', blush: '#e88a78' },
      eyes: { ...HONEY_BEE.eyes, bottom: '#d09a3c' },
    },
    habitat: 'forest',
    favourite: 'resin',
    carry: 2,
    secondsPerHex: 2.1,
    gatherSeconds: 7,
    dance: { turns: 1.1, arc: 44 },
  },
  moon: {
    look: NOCTURNAL_BEE,
    habitat: 'grass',
    favourite: 'nectar',
    carry: 3,
    secondsPerHex: 1.5,
    gatherSeconds: 5,
    nightOnly: true,
    dance: { turns: 1.15, arc: 42 },
  },
  // --- Beyond the mist ---
  lavender: {
    look: {
      ...HONEY_BEE,
      body: { width: 0.54, height: 0.52, length: 0.56, corner: 0.14 },
      colors: { ...HONEY_BEE.colors, body: '#c9b2ec', stripe: '#5c3f7a', belly: '#f1e8ff', antenna: '#5c3f7a', legs: '#5c3f7a', blush: '#ff9fc6' },
      eyes: { ...HONEY_BEE.eyes, bottom: '#8d6cc4' },
    },
    habitat: 'lavender',
    favourite: 'nectar',
    carry: 3,
    secondsPerHex: 1.8,
    gatherSeconds: 5,
    dance: { turns: 0.9, arc: 56 },
  },
  ember: {
    look: {
      ...HONEY_BEE,
      colors: { ...HONEY_BEE.colors, body: '#f09a4a', stripe: '#6a2f1c', belly: '#ffe0bf', antenna: '#6a2f1c', legs: '#6a2f1c', antennaTip: '#ffd36b', antennaGlow: 0.6 },
      eyes: { ...HONEY_BEE.eyes, bottom: '#d0662d' },
    },
    habitat: 'amber',
    favourite: 'resin',
    carry: 3,
    secondsPerHex: 1.9,
    gatherSeconds: 6,
    dance: { turns: 1.05, arc: 46 },
  },
}

export const SPECIES_LIST = Object.keys(SPECIES) as SpeciesId[]

export const SPECIES_BY_HABITAT: Partial<Record<Terrain, SpeciesId>> = Object.fromEntries(
  SPECIES_LIST.map(id => [SPECIES[id].habitat, id]),
)

const i18n = () => appI18n()

export const speciesName = (id: SpeciesId) => i18n().t(`species.${id}.name`)
export const speciesBlurb = (id: SpeciesId) => i18n().t(`species.${id}.blurb`)
/** "A wild Bumble" / "Un Bourdon sauvage" — article and gender baked in, as French needs. */
export const speciesWild = (id: SpeciesId) => i18n().t(`species.${id}.wild`)
/** "The Bumble" / "Le Bourdon" — sentence-ready, capital included. */
export const speciesThe = (id: SpeciesId) => i18n().t(`species.${id}.the`)
/** "Bumbles" / "Bourdons" — for "Moon Bees only come out at night". */
export const speciesPlural = (id: SpeciesId) => i18n().t(`species.${id}.plural`)
/** The F prompt: "Befriend a Bumble" / "Apprivoiser un Bourdon". */
export const speciesBefriend = (id: SpeciesId) => i18n().t(`species.${id}.befriend`)
/** Goal line with a count, pluralised by vue-i18n ("Befriend 2 Masons"). */
export const speciesBefriendCount = (id: SpeciesId, n: number) => i18n().t(`species.${id}.befriendCount`, n)
/** When one flies off, gender and all ("La Maçonne s'est envolée…"). */
export const speciesFled = (id: SpeciesId) => i18n().t(`species.${id}.fled`)

/**
 * Cosy first names for new friends, one pool per language (bees already in a colony keep
 * the name they were given, whatever language it came from).
 */
const NAME_POOLS: Record<Lang, readonly string[]> = {
  en: [
    'Biscuit', 'Pip', 'Clover', 'Mochi', 'Button', 'Honeybun', 'Pebble', 'Dot', 'Waffle', 'Sprout',
    'Bramble', 'Tansy', 'Juniper', 'Poppy', 'Fig', 'Nutmeg', 'Maple', 'Toffee', 'Wren', 'Nib',
    'Crumpet', 'Bean', 'Marigold', 'Sorrel', 'Puddle', 'Acorn', 'Thistle', 'Dumpling',
  ],
  fr: [
    'Biscuit', 'Pip', 'Trèfle', 'Mochi', 'Bouton', 'Chouquette', 'Caillou', 'Puce', 'Gaufre', 'Pousse',
    'Ronce', 'Tanaisie', 'Genièvre', 'Coquelicot', 'Figue', 'Muscade', 'Érable', 'Caramel', 'Roitelet', 'Graine',
    'Madeleine', 'Haricot', 'Souci', 'Oseille', 'Flaque', 'Gland', 'Chardon', 'Ravioli',
  ],
}

/** A cosy name not already used in the colony, in the language being played. */
export function pickName(taken: string[], seed: number) {
  const names = NAME_POOLS[activeLang()] ?? NAME_POOLS.en
  const free = names.filter(n => !taken.includes(n))
  const pool = free.length ? free : names
  return pool[Math.abs(Math.floor(seed)) % pool.length]!
}
