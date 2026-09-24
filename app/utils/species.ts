import { type BeeLook, HONEY_BEE } from '~/game/bee'
import { NOCTURNAL_BEE } from '~/game/beeVariants'
import type { RawResource } from './resources'
import type { Terrain } from './world'

/*
 * Wild bee species you can befriend. Each is a BeeLook variant (colours and proportions),
 * lives on one kind of terrain, prefers gathering one resource, and has its own befriending
 * dance: how fast the marker spins and how wide the green arc is.
 */

export type SpeciesId = 'bumble' | 'mason' | 'dew' | 'carpenter' | 'moon'

export interface SpeciesDef {
  name: string
  /** One cosy line for the journal and the colony list. */
  blurb: string
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
    name: 'Bumble',
    blurb: 'Round, fuzzy and never in a hurry. Hums happily over the meadow nectar.',
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
    name: 'Mason',
    blurb: 'A tidy little bee in mint and teal who pats pollen into neat balls.',
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
    name: 'Dew Bee',
    blurb: 'Pale as morning sky, with wings that sparkle. Sips from ponds and lily water.',
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
    name: 'Carpenter',
    blurb: 'Dark and glossy with golden stripes. Knows every sticky tree in the woods.',
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
    name: 'Moon Bee',
    blurb: 'Deep blue with glowing antennae. Only hums over the soft grass at night, and flies faster than anyone.',
    look: NOCTURNAL_BEE,
    habitat: 'grass',
    favourite: 'nectar',
    carry: 3,
    secondsPerHex: 1.5,
    gatherSeconds: 5,
    nightOnly: true,
    dance: { turns: 1.15, arc: 42 },
  },
}

export const SPECIES_LIST = Object.keys(SPECIES) as SpeciesId[]

export const SPECIES_BY_HABITAT: Partial<Record<Terrain, SpeciesId>> = Object.fromEntries(
  SPECIES_LIST.map(id => [SPECIES[id].habitat, id]),
)

const NAMES = [
  'Biscuit', 'Pip', 'Clover', 'Mochi', 'Button', 'Honeybun', 'Pebble', 'Dot', 'Waffle', 'Sprout',
  'Bramble', 'Tansy', 'Juniper', 'Poppy', 'Fig', 'Nutmeg', 'Maple', 'Toffee', 'Wren', 'Nib',
  'Crumpet', 'Bean', 'Marigold', 'Sorrel', 'Puddle', 'Acorn', 'Thistle', 'Dumpling',
]

/** A cosy name not already used in the colony. */
export function pickName(taken: string[], seed: number) {
  const free = NAMES.filter(n => !taken.includes(n))
  const pool = free.length ? free : NAMES
  return pool[Math.abs(Math.floor(seed)) % pool.length]!
}
