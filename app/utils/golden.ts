import { hexDistance } from './hex'
import { hash2 } from './noise'
import { HOME, type Tile, WORLD_SEED } from './world'

/*
 * Golden pollen: a handful of sparkling tiles far from home. Only the player's own bee picks
 * it up (flying onto the tile), one at a time, and each spot sparkles again after a while.
 */

/** Golden spots are never closer to home than this. */
export const GOLDEN_MIN_DISTANCE = 7
/** Share of far-off tiles that sparkle (~25 on the island). */
const GOLDEN_RATE = 0.016
/** A picked spot sparkles again after this long. */
export const GOLDEN_REGROW_MS = 30 * 60 * 1000

export function isGoldenSpot(tile: Tile | undefined): tile is Tile {
  if (!tile || !tile.walkable || tile.poi) return false
  if (hexDistance(tile, HOME) < GOLDEN_MIN_DISTANCE) return false
  return hash2(tile.q, tile.r, WORLD_SEED + 901) < GOLDEN_RATE
}
