import * as THREE from 'three'
import { hexToWorld } from '~/utils/hex'
import { mulberry32 } from '~/utils/noise'
import type { Palette } from '~/utils/palette'
import type { PoiId, Tile, World } from '~/utils/world'
import { cushionHexGeometry, mixColor } from './geometry'
import {
  CANOPY_COLORS,
  FLOWER_COLORS,
  MUSHROOM_COLORS,
  type PropKind,
  TUFT_COLORS,
  buildHive,
  buildPoi,
  buildSparkle,
  createPropKinds,
} from './props'

interface PropInstance {
  kind: PropKind
  index: number
  base: THREE.Matrix4
  /** Visible regardless of discovery (mist clouds on the edge ring). */
  always?: boolean
  /** Fog puff: visible only while the tile is undiscovered. */
  fog?: boolean
}

interface TileView {
  tile: Tile
  capIndex: number
  props: PropInstance[]
  poi?: THREE.Group
  sparkle?: THREE.Group
  /** Reveal animation progress 0..1, or -1 when idle. */
  anim: number
  discovered: boolean
}

const TILE_RADIUS = 0.96
const CAP_DEPTH = 0.1
const SOIL_DEPTH = 1.1

const tmpM = new THREE.Matrix4()
const tmpP = new THREE.Vector3()
const tmpQ = new THREE.Quaternion()
const tmpS = new THREE.Vector3()
const tmpC = new THREE.Color()
const UP = new THREE.Vector3(0, 1, 0)

const easeOutBack = (t: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

export class WorldView {
  readonly group = new THREE.Group()
  readonly caps: THREE.InstancedMesh
  readonly soil: THREE.InstancedMesh
  private kinds = createPropKinds()
  private propMeshes = {} as Record<PropKind, THREE.InstancedMesh>
  private views: TileView[] = []
  private byKey = new Map<string, TileView>()
  private animating = new Set<TileView>()
  private sparkles: TileView[] = []
  private palette: Palette
  private reducedMotion = false
  private hive: THREE.Group
  private time = 0

  constructor(private world: World, palette: Palette) {
    this.palette = palette
    const n = world.tiles.length

    const capGeo = cushionHexGeometry(TILE_RADIUS, CAP_DEPTH, 0.07, 0.24)
    this.caps = new THREE.InstancedMesh(capGeo, new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0 }), n)
    this.caps.receiveShadow = true
    this.caps.castShadow = false
    this.caps.name = 'caps'

    const soilGeo = cushionHexGeometry(TILE_RADIUS - 0.05, SOIL_DEPTH, 0.05, 0.22, 1, 2)
    this.soil = new THREE.InstancedMesh(soilGeo, new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 }), n)
    this.soil.receiveShadow = true

    // --- Plan all prop instances deterministically ------------------------------------------
    const plan: Record<PropKind, { tile: TileView, m: THREE.Matrix4, color?: string, always?: boolean, fog?: boolean }[]> = {
      tuft: [], stem: [], petals: [], center: [], trunk: [], canopy: [], pebble: [], lily: [], mushStem: [], mushCap: [], cloud: [],
    }

    world.tiles.forEach((tile, i) => {
      const view: TileView = { tile, capIndex: i, props: [], anim: -1, discovered: false }
      this.views.push(view)
      this.byKey.set(tile.key, view)
      this.planProps(view, plan)
    })

    for (const kind of Object.keys(plan) as PropKind[]) {
      const def = this.kinds[kind]
      const list = plan[kind]
      const im = new THREE.InstancedMesh(def.geometry, def.material, Math.max(1, list.length))
      im.count = list.length
      // Each prop kind spans the whole island, and instances scale up from 0 as fog lifts, so
      // three's one-off bounding sphere (taken while most were hidden) goes stale and the whole
      // mesh would get culled once home is off-screen. Culling it as one lump never saves work.
      im.frustumCulled = false
      im.castShadow = def.castShadow
      im.receiveShadow = true
      list.forEach((p, idx) => {
        im.setMatrixAt(idx, p.m)
        if (def.tinted) im.setColorAt(idx, tmpC.set(p.color ?? '#ffffff'))
        p.tile.props.push({ kind, index: idx, base: p.m, always: p.always, fog: p.fog })
      })
      if (im.instanceColor) im.instanceColor.needsUpdate = true
      this.propMeshes[kind] = im
      this.group.add(im)
    }

    // --- Tile bodies ---------------------------------------------------------------------------
    for (const v of this.views) this.writeTile(v, 1)
    this.recolor()
    this.group.add(this.soil, this.caps)

    // --- Set pieces ----------------------------------------------------------------------------
    this.hive = buildHive()
    this.hive.position.set(0, 0.18, 0)
    this.group.add(this.hive)

    for (const v of this.views) {
      if (!v.tile.poi) continue
      const { x, z } = hexToWorld(v.tile)
      const poi = buildPoi(v.tile.poi)
      poi.position.set(x, v.tile.height, z)
      poi.rotation.y = v.tile.poi === 'sunflower' || v.tile.poi === 'signpost' ? 0 : v.tile.rand * Math.PI * 2
      poi.visible = false
      v.poi = poi
      this.group.add(poi)
      const sp = buildSparkle()
      sp.position.set(x, v.tile.height + 1.7, z)
      sp.visible = false
      v.sparkle = sp
      this.sparkles.push(v)
      this.group.add(sp)
    }
  }

  // -------------------------------------------------------------------------------------------
  private planProps(view: TileView, plan: Record<PropKind, { tile: TileView, m: THREE.Matrix4, color?: string, always?: boolean, fog?: boolean }[]>) {
    const t = view.tile
    const rng = mulberry32(Math.floor(t.rand * 1e9) + 7)
    const { x, z } = hexToWorld(t)
    const y = t.height
    const pick = <T>(arr: T[]) => arr[Math.floor(rng() * arr.length)]!
    const spot = (r = 0.62) => {
      const a = rng() * Math.PI * 2
      const d = Math.sqrt(rng()) * r
      return [x + Math.cos(a) * d, z + Math.sin(a) * d] as const
    }
    const mat = (px: number, py: number, pz: number, s: number, rotY = rng() * Math.PI * 2, sy = s) =>
      new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), new THREE.Quaternion().setFromAxisAngle(UP, rotY), new THREE.Vector3(s, sy, s))

    const add = (kind: PropKind, m: THREE.Matrix4, color?: string, extra: { always?: boolean, fog?: boolean } = {}) =>
      plan[kind].push({ tile: view, m, color, ...extra })

    const flower = (px: number, pz: number, s = 1) => {
      const h = 0.7 + rng() * 0.5
      const m = mat(px, y, pz, s, rng() * 6.28, h * s)
      add('stem', m)
      const head = mat(px, y + 0.3 * h * s, pz, s * (0.9 + rng() * 0.4))
      add('petals', head, pick(FLOWER_COLORS))
      add('center', head)
    }

    const occupied = t.poi || t.terrain === 'hive'
    // Mist ring: clouds that are always visible, forming the world's soft border.
    if (t.terrain === 'edge') {
      const n = 1 + Math.floor(rng() * 2)
      for (let i = 0; i < n; i++) {
        const [px, pz] = spot(0.5)
        add('cloud', mat(px, y + 0.25 + rng() * 0.35, pz, 0.9 + rng() * 0.6), undefined, { always: true })
      }
      return
    }

    // Fog puffs over undiscovered land (skipped close to home).
    if (Math.abs(t.q) + Math.abs(t.r) > 3 && rng() < 0.32) {
      const [px, pz] = spot(0.3)
      add('cloud', mat(px, y + 0.55 + rng() * 0.4, pz, 0.7 + rng() * 0.5), undefined, { fog: true })
    }

    if (occupied) return

    switch (t.terrain) {
      case 'clearing': {
        if (rng() < 0.6) { const [px, pz] = spot(); add('pebble', mat(px, y, pz, 0.8 + rng() * 0.6)) }
        if (rng() < 0.5) { const [px, pz] = spot(); flower(px, pz, 0.8) }
        break
      }
      case 'grass': {
        const n = Math.floor(rng() * 3)
        for (let i = 0; i < n; i++) { const [px, pz] = spot(); add('tuft', mat(px, y, pz, 0.9 + rng() * 0.5), pick(TUFT_COLORS)) }
        if (rng() < 0.35) { const [px, pz] = spot(); flower(px, pz) }
        if (rng() < 0.15) { const [px, pz] = spot(); add('pebble', mat(px, y, pz, 0.7 + rng() * 0.8)) }
        break
      }
      case 'meadow': {
        const n = 2 + Math.floor(rng() * 3)
        for (let i = 0; i < n; i++) { const [px, pz] = spot(); add('tuft', mat(px, y, pz, 1.1 + rng() * 0.6), pick(TUFT_COLORS)) }
        const f = 1 + Math.floor(rng() * 2)
        for (let i = 0; i < f; i++) { const [px, pz] = spot(); flower(px, pz, 1.1) }
        break
      }
      case 'flowers': {
        const f = 4 + Math.floor(rng() * 4)
        for (let i = 0; i < f; i++) { const [px, pz] = spot(0.66); flower(px, pz, 0.9 + rng() * 0.4) }
        if (rng() < 0.5) { const [px, pz] = spot(); add('tuft', mat(px, y, pz, 0.9), pick(TUFT_COLORS)) }
        break
      }
      case 'forest': {
        const n = rng() < 0.35 ? 2 : 1
        for (let i = 0; i < n; i++) {
          const [px, pz] = n === 1 ? spot(0.25) : spot(0.5)
          const s = (n === 1 ? 1.25 : 0.9) * (0.85 + rng() * 0.3)
          add('trunk', mat(px, y, pz, s))
          add('canopy', mat(px, y, pz, s), pick(CANOPY_COLORS))
        }
        if (rng() < 0.4) {
          const [px, pz] = spot(0.7)
          const m = mat(px, y, pz, 0.9 + rng() * 0.5)
          add('mushStem', m)
          add('mushCap', m, pick(MUSHROOM_COLORS))
        }
        break
      }
      case 'water': {
        if (rng() < 0.55) { const [px, pz] = spot(0.5); add('lily', mat(px, y + 0.012, pz, 0.8 + rng() * 0.6)) }
        break
      }
    }
  }

  // -------------------------------------------------------------------------------------------
  private tileColor(t: Tile, discovered: boolean) {
    const base = t.terrain === 'water' ? this.palette.water : this.palette.terrain[t.terrain]
    tmpC.set(base)
    const hsl = { h: 0, s: 0, l: 0 }
    tmpC.getHSL(hsl)
    tmpC.setHSL(hsl.h + (t.rand - 0.5) * 0.02, hsl.s, Math.min(0.95, hsl.l + (t.rand - 0.5) * 0.06))
    if (!discovered && t.terrain !== 'edge') tmpC.lerp(new THREE.Color(this.palette.fog), 0.68)
    return tmpC
  }

  private writeTile(v: TileView, p: number) {
    const { x, z } = hexToWorld(v.tile)
    const hidden = !v.discovered && v.tile.terrain !== 'edge'
    // Undiscovered tiles sit a touch lower, like un-risen dough.
    const e = v.anim >= 0 ? easeOutBack(p) : 1
    const drop = hidden ? -0.05 : (v.anim >= 0 ? (1 - e) * -0.12 : 0)
    const s = hidden ? 0.97 : (v.anim >= 0 ? 0.9 + 0.1 * e : 1)
    tmpP.set(x, v.tile.height + drop, z)
    tmpS.set(s, 1, s)
    tmpM.compose(tmpP, tmpQ.identity(), tmpS)
    this.caps.setMatrixAt(v.capIndex, tmpM)
    tmpP.y = v.tile.height + drop - CAP_DEPTH - 0.02
    this.soil.setMatrixAt(v.capIndex, tmpM.compose(tmpP, tmpQ, tmpS))

    for (const pr of v.props) {
      const im = this.propMeshes[pr.kind]
      let k: number
      if (pr.always) k = 1
      else if (pr.fog) k = v.discovered ? (v.anim >= 0 ? Math.max(0, 1 - p * 2) : 0) : 1
      else k = v.discovered ? (v.anim >= 0 ? easeOutBack(Math.min(1, Math.max(0, p * 1.4 - 0.25))) : 1) : 0
      if (k <= 0.001) {
        tmpM.makeScale(0, 0, 0)
      }
      else if (k === 1) {
        tmpM.copy(pr.base)
      }
      else {
        pr.base.decompose(tmpP, tmpQ, tmpS)
        if (pr.fog) tmpP.y += (1 - k) * 0.5
        tmpS.multiplyScalar(k)
        tmpM.compose(tmpP, tmpQ, tmpS)
      }
      im.setMatrixAt(pr.index, tmpM)
      im.instanceMatrix.needsUpdate = true
    }
    if (v.poi) {
      v.poi.visible = v.discovered
      const k = v.anim >= 0 ? easeOutBack(Math.min(1, p * 1.2)) : 1
      v.poi.scale.setScalar(Math.max(0.001, k) * 1.3)
    }
    this.caps.instanceMatrix.needsUpdate = true
    this.soil.instanceMatrix.needsUpdate = true
  }

  recolor() {
    const soilA = new THREE.Color(this.palette.soil)
    const soilB = new THREE.Color(this.palette.soilDark)
    for (const v of this.views) {
      this.caps.setColorAt(v.capIndex, this.tileColor(v.tile, v.discovered || v.tile.terrain === 'edge'))
      const sc = soilA.clone().lerp(soilB, v.tile.rand * 0.6)
      if (!v.discovered && v.tile.terrain !== 'edge') sc.lerp(new THREE.Color(this.palette.fog), 0.5)
      this.soil.setColorAt(v.capIndex, sc)
    }
    this.caps.instanceColor!.needsUpdate = true
    this.soil.instanceColor!.needsUpdate = true
  }

  setPalette(p: Palette) {
    this.palette = p
    this.recolor()
  }

  setReducedMotion(r: boolean) {
    this.reducedMotion = r
  }

  /** Sync discovery state. `fresh` tiles get a pop-in animation. */
  syncDiscovered(discovered: Set<string>, fresh: string[]) {
    const freshSet = new Set(fresh)
    let changed = false
    for (const v of this.views) {
      const d = discovered.has(v.tile.key)
      if (d === v.discovered) continue
      v.discovered = d
      changed = true
      if (d && freshSet.has(v.tile.key) && !this.reducedMotion) {
        v.anim = 0
        this.animating.add(v)
      }
      else {
        v.anim = -1
      }
      this.writeTile(v, 1)
      this.caps.setColorAt(v.capIndex, this.tileColor(v.tile, d))
    }
    if (changed) {
      this.recolor()
    }
  }

  setVisitedPois(visited: PoiId[]) {
    for (const v of this.sparkles) {
      v.sparkle!.visible = v.discovered && !visited.includes(v.tile.poi!)
    }
  }

  /** Per-frame update. */
  update(dt: number) {
    this.time += dt
    for (const v of this.animating) {
      v.anim = Math.min(1, v.anim + dt / 0.55)
      this.writeTile(v, v.anim)
      if (v.anim >= 1) {
        v.anim = -1
        this.animating.delete(v)
        this.writeTile(v, 1)
      }
    }
    const motion = this.reducedMotion ? 0 : 1
    for (const v of this.sparkles) {
      const s = v.sparkle!
      if (!s.visible) continue
      s.rotation.y += dt * 1.6 * (motion || 0.3)
      s.position.y = v.tile.height + 1.6 + Math.sin(this.time * 2 + v.tile.rand * 6) * 0.1 * motion
    }
  }

  tileAtInstance(id: number) {
    return this.views[id]?.tile
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose?.()
    })
  }
}
