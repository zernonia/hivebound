/**
 * Flat-top hex grid helpers using axial coordinates (q, r).
 * Reference: https://www.redblobgames.com/grids/hexagons/
 *
 * World axes: +x = screen right, -z = screen "up" (away from camera).
 */

export interface Hex {
  q: number
  r: number
}

/** Circumradius of one tile in world units. */
export const HEX_SIZE = 1

export type Direction = 'N' | 'NE' | 'SE' | 'S' | 'SW' | 'NW'

export const DIRECTIONS: Record<Direction, Hex> = {
  N: { q: 0, r: -1 },
  NE: { q: 1, r: -1 },
  SE: { q: 1, r: 0 },
  S: { q: 0, r: 1 },
  SW: { q: -1, r: 1 },
  NW: { q: -1, r: 0 },
}

export const DIRECTION_LIST = Object.keys(DIRECTIONS) as Direction[]

export const DIRECTION_NAMES: Record<Direction, string> = {
  N: 'north',
  NE: 'north-east',
  SE: 'south-east',
  S: 'south',
  SW: 'south-west',
  NW: 'north-west',
}

export const hexKey = (h: Hex) => `${h.q},${h.r}`

export function parseKey(key: string): Hex {
  const [q, r] = key.split(',').map(Number)
  return { q: q!, r: r! }
}

export const hexAdd = (a: Hex, b: Hex): Hex => ({ q: a.q + b.q, r: a.r + b.r })

export const hexEquals = (a: Hex, b: Hex) => a.q === b.q && a.r === b.r

export function hexDistance(a: Hex, b: Hex) {
  const dq = a.q - b.q
  const dr = a.r - b.r
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2
}

export function neighbor(h: Hex, d: Direction): Hex {
  return hexAdd(h, DIRECTIONS[d])
}

/** Axial → world-space centre (x, z). */
export function hexToWorld(h: Hex, size = HEX_SIZE) {
  return {
    x: size * 1.5 * h.q,
    z: size * Math.sqrt(3) * (h.r + h.q / 2),
  }
}

/** World (x, z) → nearest axial hex. */
export function worldToHex(x: number, z: number, size = HEX_SIZE): Hex {
  const q = ((2 / 3) * x) / size
  const r = ((-1 / 3) * x + (Math.sqrt(3) / 3) * z) / size
  return hexRound(q, r)
}

export function hexRound(qf: number, rf: number): Hex {
  const sf = -qf - rf
  let q = Math.round(qf)
  let r = Math.round(rf)
  const s = Math.round(sf)
  const dq = Math.abs(q - qf)
  const dr = Math.abs(r - rf)
  const ds = Math.abs(s - sf)
  if (dq > dr && dq > ds) q = -r - s
  else if (dr > ds) r = -q - s
  return { q, r }
}

/** All hexes within `radius` of `center`, inclusive. */
export function hexesInRange(center: Hex, radius: number): Hex[] {
  const out: Hex[] = []
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius)
    const r2 = Math.min(radius, -q + radius)
    for (let r = r1; r <= r2; r++) out.push({ q: center.q + q, r: center.r + r })
  }
  return out
}

/** Direction from a to an adjacent b, or null if not adjacent. */
export function directionBetween(a: Hex, b: Hex): Direction | null {
  for (const d of DIRECTION_LIST) {
    const o = DIRECTIONS[d]
    if (a.q + o.q === b.q && a.r + o.r === b.r) return d
  }
  return null
}

/** Rough compass direction (8-way words) from a to any b, for narration. */
export function compassWord(a: Hex, b: Hex): string {
  const pa = hexToWorld(a)
  const pb = hexToWorld(b)
  const dx = pb.x - pa.x
  const dz = pb.z - pa.z
  const angle = (Math.atan2(dx, -dz) * 180) / Math.PI // 0 = north, clockwise
  const words = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']
  return words[(Math.round(((angle + 360) % 360) / 45)) % 8]!
}

/**
 * Breadth-first path over existing tiles. Returns the path excluding `from`,
 * including `to`. Empty if unreachable or same tile.
 */
export function findPath(from: Hex, to: Hex, isWalkable: (h: Hex) => boolean, maxNodes = 4000): Hex[] {
  if (hexEquals(from, to) || !isWalkable(to)) return []
  const startKey = hexKey(from)
  const goalKey = hexKey(to)
  const came = new Map<string, string>([[startKey, '']])
  const queue: Hex[] = [from]
  let visited = 0
  while (queue.length && visited < maxNodes) {
    const cur = queue.shift()!
    visited++
    const ck = hexKey(cur)
    if (ck === goalKey) break
    // Order neighbours by distance to goal so ties produce straight-ish lines.
    const nbrs = DIRECTION_LIST.map(d => neighbor(cur, d))
      .filter(isWalkable)
      .sort((a, b) => hexDistance(a, to) - hexDistance(b, to))
    for (const n of nbrs) {
      const nk = hexKey(n)
      if (!came.has(nk)) {
        came.set(nk, ck)
        queue.push(n)
      }
    }
  }
  if (!came.has(goalKey)) return []
  const path: Hex[] = []
  let k = goalKey
  while (k !== startKey) {
    path.unshift(parseKey(k))
    k = came.get(k)!
  }
  return path
}
