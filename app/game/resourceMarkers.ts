import * as THREE from 'three'
import { hexToWorld } from '~/utils/hex'
import { RAW_RESOURCES, RESOURCE_INFO, type RawResource } from '~/utils/resources'
import type { Tile } from '~/utils/world'

/*
 * Floating badges over tiles that can be gathered from: a round token with the resource's
 * glyph (shape and colour both differ, matching the HUD icons). Tiles with something left
 * show a full-size badge; picked-clean tiles show a small faded one until they regrow.
 *
 * The camera never rotates (it only moves and zooms), so every badge can share one fixed
 * "face the camera" orientation and live in a single InstancedMesh per resource.
 */

/** Direction from the ground towards the camera (matches the camera offset in GameScene). */
const TO_CAMERA = new THREE.Vector3(0, 12.5, 10).normalize()
const FACE_CAMERA = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), TO_CAMERA)

const INK = '#5b3a24'

function glyph(ctx: CanvasRenderingContext2D, r: RawResource) {
  const color = RESOURCE_INFO[r].color
  ctx.lineWidth = 1.6
  ctx.strokeStyle = INK
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  const shape = (d: string, fill: string) => {
    const p = new Path2D(d)
    ctx.fillStyle = fill
    ctx.fill(p)
    ctx.stroke(p)
  }
  const dot = (x: number, y: number, rad: number, fill: string) => {
    ctx.beginPath()
    ctx.arc(x, y, rad, 0, Math.PI * 2)
    ctx.fillStyle = fill
    ctx.fill()
  }
  switch (r) {
    case 'nectar':
      shape('M12 3.5c3.2 4 6 7.2 6 10.4a6 6 0 0 1-12 0c0-3.2 2.8-6.4 6-10.4z', color)
      dot(12, 14.5, 1.4, '#fff')
      for (const [x, y] of [[12, 12.3], [14.1, 14.5], [9.9, 14.5], [12, 16.7]]) dot(x!, y!, 1, '#fff')
      break
    case 'pollen':
      shape('M19.5 12a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0z', color)
      for (const [x, y, rad] of [[9.5, 9.5, 1.2], [14.5, 10, 1.2], [12, 13.5, 1.2], [8.8, 14.5, 1], [15.2, 14.8, 1]]) dot(x!, y!, rad!, '#b37a00')
      break
    case 'water':
      shape('M12 2.8 17.6 12a6 6 0 1 1-11.2 0z', color)
      ctx.strokeStyle = '#fff'
      ctx.stroke(new Path2D('M8.6 15.2c1.1-1 2.3-1 3.4 0s2.3 1 3.4 0'))
      break
    case 'resin':
      shape('M7 7.5c2-3 8-3.5 10.5-.5 2.2 2.7 1.6 8.8-1.5 10.8-3 2-8.8 1.4-10.4-1.6C4.2 13.6 5.4 9.9 7 7.5z', color)
      ctx.strokeStyle = '#fff'
      ctx.stroke(new Path2D('M9.5 8.8c1-.8 2.2-1 3.2-.8'))
      break
  }
}

function badgeTexture(r: RawResource) {
  const S = 128
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  // Soft shadow + cream token with a coloured rim.
  ctx.beginPath()
  ctx.arc(S / 2, S / 2 + 3, S * 0.44, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(91,58,36,0.25)'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(S / 2, S / 2, S * 0.43, 0, Math.PI * 2)
  ctx.fillStyle = '#fffaf0'
  ctx.fill()
  ctx.lineWidth = S * 0.06
  ctx.strokeStyle = RESOURCE_INFO[r].color
  ctx.stroke()
  ctx.save()
  ctx.translate(S * 0.18, S * 0.18)
  ctx.scale((S * 0.64) / 24, (S * 0.64) / 24)
  glyph(ctx, r)
  ctx.restore()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

interface Marker {
  tile: Tile
  resource: RawResource
  base: THREE.Vector3
  phase: number
}

export class ResourceMarkers {
  readonly group = new THREE.Group()
  private full = {} as Record<RawResource, THREE.InstancedMesh>
  private faded = {} as Record<RawResource, THREE.InstancedMesh>
  private shown: { m: Marker, full: boolean }[] = []
  private reducedMotion = false

  constructor(capacity: number) {
    const geo = new THREE.PlaneGeometry(0.82, 0.82)
    for (const r of RAW_RESOURCES) {
      const map = badgeTexture(r)
      const make = (opacity: number) => {
        const im = new THREE.InstancedMesh(
          geo,
          new THREE.MeshBasicMaterial({ map, transparent: true, opacity, depthWrite: false, fog: false }),
          capacity,
        )
        im.count = 0
        im.frustumCulled = false
        im.renderOrder = 5
        this.group.add(im)
        return im
      }
      this.full[r] = make(1)
      this.faded[r] = make(0.45)
    }
  }

  setReducedMotion(v: boolean) {
    this.reducedMotion = v
  }

  /**
   * Chooses which badges to show. `amount` gives what's left on a tile right now; `skip` hides
   * the badge on one tile (the one the bee is on, where the HUD shows the details instead).
   */
  refresh(tiles: { tile: Tile, resource: RawResource }[], amount: (t: Tile) => number, skipKey: string | null) {
    this.shown = []
    for (const { tile, resource } of tiles) {
      if (tile.key === skipKey) continue
      const { x, z } = hexToWorld(tile)
      // Float above the tallest things on the tile (trees in the woods).
      const lift = tile.terrain === 'forest' ? 2.05 : tile.poi ? 2.2 : 1.1
      this.shown.push({
        m: { tile, resource, base: new THREE.Vector3(x, tile.height + lift, z), phase: tile.rand * 6.28 },
        full: amount(tile) > 0,
      })
    }
  }

  private tmpM = new THREE.Matrix4()
  private tmpP = new THREE.Vector3()
  private tmpS = new THREE.Vector3()

  update(time: number) {
    const counts = {} as Record<string, number>
    for (const r of RAW_RESOURCES) {
      counts[`f${r}`] = 0
      counts[`d${r}`] = 0
    }
    const bob = this.reducedMotion ? 0 : 1
    for (const { m, full } of this.shown) {
      const im = full ? this.full[m.resource] : this.faded[m.resource]
      const key = `${full ? 'f' : 'd'}${m.resource}`
      const i = counts[key]!++
      this.tmpP.copy(m.base)
      this.tmpP.y += Math.sin(time * 1.8 + m.phase) * 0.06 * bob
      const s = full ? 1 : 0.7
      this.tmpM.compose(this.tmpP, FACE_CAMERA, this.tmpS.set(s, s, s))
      im.setMatrixAt(i, this.tmpM)
    }
    for (const r of RAW_RESOURCES) {
      this.full[r].count = counts[`f${r}`]!
      this.faded[r].count = counts[`d${r}`]!
      this.full[r].instanceMatrix.needsUpdate = true
      this.faded[r].instanceMatrix.needsUpdate = true
    }
  }
}
