import { buildCrown } from './accessories'
import { type BeeLook, type BeeRig, HONEY_BEE, buildBee } from './bee'

/*
 * Named bee variants: a look plus the accessories that come with it. New variants are a
 * spread of HONEY_BEE with the differences, and an optional `dress` step that attaches
 * accessories to the rig's anchors.
 */

/** The Queen: a larger, richer gold bee with three stripes, rosy eyes, gold-rimmed wings and a crown. */
export const QUEEN_BEE: BeeLook = {
  ...HONEY_BEE,
  body: { width: 0.58, height: 0.55, length: 0.64, corner: 0.11 },
  colors: {
    ...HONEY_BEE.colors,
    body: '#ffab2e',
    stripe: '#5a2e1c',
    belly: '#ffe0a0',
    antennaTip: '#ffd76a',
  },
  stripes: [[0.06, 0.15], [0.24, 0.33], [0.42, 0.5]],
  eyes: { ...HONEY_BEE.eyes, width: 0.17, height: 0.25, spacing: 0.118, bottom: '#c46a5a' },
  wings: { ...HONEY_BEE.wings, length: 0.52, width: 0.38, rim: '#ffe7a3' },
}

/** Nocturnal bee: periwinkle and navy, eyes glowing cyan at the bottom, firefly-bright antenna tips. */
export const NOCTURNAL_BEE: BeeLook = {
  ...HONEY_BEE,
  colors: {
    ...HONEY_BEE.colors,
    body: '#8a8fe0',
    stripe: '#2d2b63',
    belly: '#c9c3f5',
    antenna: '#2d2b63',
    legs: '#2d2b63',
    blush: '#d59be0',
    antennaTip: '#ffe27a',
    antennaGlow: 1.1,
  },
  eyes: { ...HONEY_BEE.eyes, rim: '#12122e', top: '#0d0f2b', bottom: '#5fdcff' },
  wings: { ...HONEY_BEE.wings, fill: '#d6dcff', rim: '#eef0ff' },
}

export interface BeeVariant {
  label: string
  look: BeeLook
  /** Attaches this variant's accessories to a freshly built rig. */
  dress?: (rig: BeeRig) => void
}

export const BEE_VARIANTS = {
  honey: { label: 'Honey bee', look: HONEY_BEE },
  queen: {
    label: 'Queen',
    look: QUEEN_BEE,
    dress: (rig) => {
      const crown = buildCrown()
      // Queen-sized, and nudged back so the antennae stay in front of it.
      crown.scale.setScalar(1.35)
      crown.position.z = -0.03
      rig.anchors.head.add(crown)
    },
  },
  nocturnal: { label: 'Nocturnal bee', look: NOCTURNAL_BEE },
} satisfies Record<string, BeeVariant>

export type BeeVariantId = keyof typeof BEE_VARIANTS

export function isBeeVariantId(id: unknown): id is BeeVariantId {
  return typeof id === 'string' && Object.hasOwn(BEE_VARIANTS, id)
}

export function buildBeeVariant(id: BeeVariantId = 'honey'): BeeRig {
  const variant: BeeVariant = BEE_VARIANTS[id]
  const rig = buildBee(variant.look)
  variant.dress?.(rig)
  return rig
}
