import * as THREE from 'three'
import { hexKey, hexToWorld, hexesInRange } from '~/utils/hex'
import { mulberry32 } from '~/utils/noise'
import type { Palette } from '~/utils/palette'
import type { PoiId, Tile, World } from '~/utils/world'
import { cushionHexGeometry, mixColor } from './geometry'
import {
  AMBER_CANOPY_COLORS,
  AMBER_MUSHROOM_COLORS,
  AMBER_PINE_COLORS,
  CANOPY_COLORS,
  LAVENDER_COLORS,
  FLOWER_COLORS,
  LILY_COLORS,
  LOTUS_COLORS,
  MUSHROOM_COLORS,
  PEBBLE_COLORS,
  PINE_COLORS,
  type PropKind,
  TREE_BIT_COLORS,
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
  /** Which gatherable bit this is part of (a flower, a lily pad…), or -1 for scenery. */
  group: number
  /** Visible regardless of discovery (mist clouds on the edge ring). */
  always?: boolean
  /** Fog puff: visible only while the tile is undiscovered. */
  fog?: boolean
  /** A cloud of the mist ring round the first island: most drift away once it lifts. */
  gate?: boolean
}

interface PlannedProp {
  kind: PropKind
  m: THREE.Matrix4
  group: number
  color?: THREE.ColorRepresentation
  always?: boolean
  fog?: boolean
  gate?: boolean
}

interface TileView {
  tile: Tile
  /** Instance slot in caps/soil once loaded, else -1. */
  capIndex: number
  /** Built into the scene yet? Tiles stream in as the player explores. */
  loaded: boolean
  /** Props decided up front (deterministic), turned into instances when the tile loads. */
  planned: PlannedProp[]
  props: PropInstance[]
  poi?: THREE.Group
  sparkle?: THREE.Group
  /** Reveal animation progress 0..1, or -1 when idle. */
  anim: number
  /** Rise-out-of-the-mist animation when the tile first loads, 0..1, or -1 when idle. */
  rise: number
  /** How many gatherable groups (flowers, lily pads, mushrooms) the tile has. */
  groups: number
  /** Shown fullness of the tile's resource, 0..1, easing towards `fullTarget`. */
  full: number
  fullTarget: number
  discovered: boolean
}

/** Tiles load this far beyond anything discovered, so land rises out of the mist ahead of the bee. */
const LOAD_RADIUS = 3
const TILE_RADIUS = 0.96
const CAP_DEPTH = 0.1
const SOIL_DEPTH = 1.1

const tmpM = new THREE.Matrix4()
const tmpP = new THREE.Vector3()
const tmpQ = new THREE.Quaternion()
const tmpS = new THREE.Vector3()
const tmpC = new THREE.Color()
const tmpC2 = new THREE.Color()
const tmpC3 = new THREE.Color()
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
  /** Loaded tiles by caps/soil instance slot, for picking. */
  private byCap: TileView[] = []
  private visitedPois: PoiId[] = []
  private animating = new Set<TileView>()
  private sparkles: TileView[] = []
  private palette: Palette
  private reducedMotion = false
  private hive: THREE.Group
  private time = 0
  private mistLifted = false

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
    // Allocate colour buffers now; slots fill in as tiles load.
    this.caps.setColorAt(0, tmpC.set('#ffffff'))
    this.soil.setColorAt(0, tmpC)
    this.caps.count = 0
    this.soil.count = 0

    // --- Plan every tile's props up front (cheap, deterministic); build them on load ---------
    const counts = {} as Record<PropKind, number>
    for (const kind of Object.keys(this.kinds) as PropKind[]) counts[kind] = 0
    for (const tile of world.tiles) {
      const view: TileView = { tile, capIndex: -1, loaded: false, planned: [], props: [], anim: -1, rise: -1, discovered: false, groups: 0, full: 1, fullTarget: 1 }
      this.views.push(view)
      this.byKey.set(tile.key, view)
      this.planProps(view)
      for (const p of view.planned) counts[p.kind]++
    }

    for (const kind of Object.keys(this.kinds) as PropKind[]) {
      const def = this.kinds[kind]
      const im = new THREE.InstancedMesh(def.geometry, def.material, Math.max(1, counts[kind]))
      if (def.tinted) im.setColorAt(0, tmpC.set('#ffffff'))
      im.count = 0
      im.castShadow = def.castShadow
      im.receiveShadow = true
      this.propMeshes[kind] = im
      this.group.add(im)
    }

    // Instances stream in and scale up from nothing, so three's one-off bounding spheres would
    // go stale and cull (or miss picks on) whole meshes. Each spans the island anyway.
    for (const im of [this.caps, this.soil, ...Object.values(this.propMeshes)]) im.frustumCulled = false
    this.group.add(this.soil, this.caps)

    // --- Set pieces ----------------------------------------------------------------------------
    this.hive = buildHive()
    this.hive.position.set(0, 0.18, 0)
    this.group.add(this.hive)
  }

  /** Builds a tile into the scene: its body, props and any landmark. */
  private loadTile(v: TileView, rise: boolean) {
    if (v.loaded) return
    v.loaded = true
    v.capIndex = this.caps.count
    this.caps.count++
    this.soil.count = this.caps.count
    this.byCap[v.capIndex] = v

    for (const p of v.planned) {
      const im = this.propMeshes[p.kind]
      const index = im.count++
      if (this.kinds[p.kind].tinted) {
        im.setColorAt(index, tmpC.set(p.color ?? '#ffffff'))
        im.instanceColor!.needsUpdate = true
      }
      v.props.push({ kind: p.kind, index, base: p.m, always: p.always, fog: p.fog, gate: p.gate, group: p.group })
    }

    if (v.tile.poi) {
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

    this.colorTile(v)
    if (rise && !this.reducedMotion) {
      v.rise = 0
      this.animating.add(v)
    }
    this.writeTile(v, 1)
  }

  // -------------------------------------------------------------------------------------------
  private planProps(view: TileView) {
    const t = view.tile
    const rng = mulberry32(Math.floor(t.rand * 1e9) + 7)
    // A second, independent stream for purely cosmetic jitter (tilt, hue, variants), so the
    // layout drawn from `rng` stays exactly where it always was.
    const jit = mulberry32(Math.floor(t.rand * 1e9) + 911)
    const pickJ = <T>(arr: T[]) => arr[Math.floor(jit() * arr.length)]!
    /** A colour nudged a little in hue, saturation and lightness so repeats don't look stamped. */
    const tone = (c: THREE.ColorRepresentation, h = 0.015, s = 0.08, l = 0.04) =>
      new THREE.Color(c).offsetHSL((jit() - 0.5) * 2 * h, (jit() - 0.5) * 2 * s, (jit() - 0.5) * 2 * l)
    /** Tips a prop off vertical by up to `amount` radians, in a random direction. */
    const lean = (m: THREE.Matrix4, amount: number) => {
      const a = jit() * Math.PI * 2
      const k = jit() * amount
      m.decompose(tmpP, tmpQ, tmpS)
      tmpQ.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.cos(a) * k, 0, Math.sin(a) * k)))
      return m.compose(tmpP, tmpQ, tmpS)
    }
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

    // Gatherable bits (each flower, lily pad, mushroom) get a group so they can thin out as
    // the tile is gathered; `group` is set while planning one of them.
    let group = -1
    const add = (kind: PropKind, m: THREE.Matrix4, color?: THREE.ColorRepresentation, extra: { always?: boolean, fog?: boolean, gate?: boolean } = {}) =>
      view.planned.push({ kind, m, color, group, ...extra })
    const gatherable = (build: () => void) => {
      group = view.groups++
      build()
      group = -1
    }

    const flower = (px: number, pz: number, s = 1) => gatherable(() => {
      const h = 0.7 + rng() * 0.5
      const m = lean(mat(px, y, pz, s, rng() * 6.28, h * s), 0.14)
      add('stem', m)
      // The head sits on the (leaning) stem's tip.
      const tip = new THREE.Vector3(0, 0.3, 0).applyMatrix4(m)
      const head = mat(tip.x, tip.y, tip.z, s * (0.9 + rng() * 0.4))
      const color = pick(FLOWER_COLORS)
      const tulip = jit() < 0.22
      add(tulip ? 'tulip' : 'petals', lean(head, tulip ? 0.1 : 0.3), tone(color, 0.02, 0.1, 0.03))
    })

    const occupied = t.poi || t.terrain === 'hive'
    // Mist ring: clouds that are always visible, forming the world's soft border.
    if (t.terrain === 'edge') {
      const n = 1 + Math.floor(rng() * 2)
      for (let i = 0; i < n; i++) {
        const [px, pz] = spot(0.5)
        add('cloud', mat(px, y + 0.25 + rng() * 0.35, pz, 0.9 + rng() * 0.6), undefined, { always: true, gate: !!t.gate && i > 0 })
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
        if (rng() < 0.6) { const [px, pz] = spot(); add('pebble', mat(px, y, pz, 0.8 + rng() * 0.6), tone(pickJ(PEBBLE_COLORS))) }
        if (rng() < 0.5) { const [px, pz] = spot(); flower(px, pz, 0.8) }
        break
      }
      case 'grass': {
        const n = Math.floor(rng() * 3)
        for (let i = 0; i < n; i++) { const [px, pz] = spot(); add('tuft', lean(mat(px, y, pz, 0.9 + rng() * 0.5), 0.15), tone(pick(TUFT_COLORS))) }
        if (rng() < 0.35) { const [px, pz] = spot(); flower(px, pz) }
        if (rng() < 0.15) { const [px, pz] = spot(); add('pebble', mat(px, y, pz, 0.7 + rng() * 0.8), tone(pickJ(PEBBLE_COLORS))) }
        break
      }
      case 'meadow': {
        const n = 2 + Math.floor(rng() * 3)
        for (let i = 0; i < n; i++) { const [px, pz] = spot(); add('tuft', lean(mat(px, y, pz, 1.1 + rng() * 0.6), 0.15), tone(pick(TUFT_COLORS))) }
        const f = 1 + Math.floor(rng() * 2)
        for (let i = 0; i < f; i++) { const [px, pz] = spot(); flower(px, pz, 1.1) }
        break
      }
      case 'flowers': {
        const f = 4 + Math.floor(rng() * 4)
        for (let i = 0; i < f; i++) { const [px, pz] = spot(0.66); flower(px, pz, 0.9 + rng() * 0.4) }
        if (rng() < 0.5) { const [px, pz] = spot(); add('tuft', lean(mat(px, y, pz, 0.9), 0.15), tone(pick(TUFT_COLORS))) }
        break
      }
      case 'forest': {
        const n = rng() < 0.35 ? 2 : 1
        for (let i = 0; i < n; i++) {
          const [px, pz] = n === 1 ? spot(0.25) : spot(0.5)
          const s = (n === 1 ? 1.25 : 0.9) * (0.85 + rng() * 0.3)
          rng() // the old separate trunk's spin: keeps the layout stream in step
          const m = lean(mat(px, y, pz, s), 0.06)
          const leaf = pick(CANOPY_COLORS)
          // Some trees are little pines; some round ones carry fruit or blossom.
          if (jit() < 0.3) {
            add('pine', m, tone(pickJ(PINE_COLORS), 0.015, 0.06, 0.05))
          }
          else {
            add('tree', m, tone(leaf, 0.02, 0.08, 0.05))
            if (jit() < 0.3) add('treeBits', m, tone(pickJ(TREE_BIT_COLORS), 0.01, 0.05, 0.03))
          }
        }
        if (rng() < 0.4) {
          const [px, pz] = spot(0.7)
          const m = lean(mat(px, y, pz, 0.9 + rng() * 0.5), 0.12)
          gatherable(() => add('mushroom', m, tone(pick(MUSHROOM_COLORS), 0.02, 0.06, 0.04)))
        }
        break
      }
      // --- Beyond the mist ---
      case 'lavender': {
        const n = 2 + Math.floor(rng() * 3)
        for (let i = 0; i < n; i++) {
          const [px, pz] = spot(0.62)
          const m = lean(mat(px, y, pz, 1 + rng() * 0.5), 0.1)
          gatherable(() => add('lavender', m, tone(pick(LAVENDER_COLORS), 0.015, 0.08, 0.04)))
        }
        if (rng() < 0.4) { const [px, pz] = spot(); add('tuft', lean(mat(px, y, pz, 0.9), 0.15), tone(pick(TUFT_COLORS))) }
        break
      }
      case 'amber': {
        const n = rng() < 0.35 ? 2 : 1
        for (let i = 0; i < n; i++) {
          const [px, pz] = n === 1 ? spot(0.25) : spot(0.5)
          const s = (n === 1 ? 1.3 : 0.95) * (0.85 + rng() * 0.3)
          const m = lean(mat(px, y, pz, s), 0.06)
          if (jit() < 0.25) add('pine', m, tone(pickJ(AMBER_PINE_COLORS), 0.015, 0.06, 0.05))
          else add('tree', m, tone(pick(AMBER_CANOPY_COLORS), 0.02, 0.08, 0.05))
        }
        // Resin-gold mushrooms are what thin out as the tile is gathered.
        const k = 1 + Math.floor(rng() * 2)
        for (let i = 0; i < k; i++) {
          const [px, pz] = spot(0.7)
          const m = lean(mat(px, y, pz, 0.8 + rng() * 0.4), 0.12)
          gatherable(() => add('mushroom', m, tone(pick(AMBER_MUSHROOM_COLORS), 0.02, 0.06, 0.04)))
        }
        break
      }
      case 'water': {
        if (rng() < 0.55) {
          const [px, pz] = spot(0.5)
          gatherable(() => {
            const m = mat(px, y + 0.012, pz, 0.8 + rng() * 0.6)
            add('lily', m, tone(pickJ(LILY_COLORS), 0.01, 0.05, 0.03))
            // Now and then a bloom sits on the pad, and goes with it when gathered.
            if (jit() < 0.4) add('lilyBloom', m.clone().multiply(new THREE.Matrix4().makeTranslation(0.05, 0.012, -0.04)), tone(pickJ(LOTUS_COLORS), 0.02, 0.05, 0.02))
          })
        }
        break
      }
    }
  }

  // -------------------------------------------------------------------------------------------
  private tileColor(t: Tile, discovered: boolean, full = 1) {
    const base = t.terrain === 'water' ? this.palette.water : this.palette.terrain[t.terrain]
    tmpC.set(base)
    const hsl = { h: 0, s: 0, l: 0 }
    tmpC.getHSL(hsl)
    // A gathered tile looks a little sun-bleached until it regrows.
    const spent = 1 - full
    tmpC.setHSL(hsl.h + (t.rand - 0.5) * 0.02, hsl.s * (1 - spent * 0.4), Math.min(0.95, hsl.l + (t.rand - 0.5) * 0.06 + spent * 0.03))
    if (!discovered && t.terrain !== 'edge') tmpC.lerp(new THREE.Color(this.palette.fog), 0.68)
    return tmpC
  }

  private writeTile(v: TileView, p: number) {
    const { x, z } = hexToWorld(v.tile)
    const hidden = !v.discovered && v.tile.terrain !== 'edge'
    // Undiscovered tiles sit a touch lower, like un-risen dough.
    const e = v.anim >= 0 ? easeOutBack(p) : 1
    // Rising out of the mist when first loaded.
    const r = v.rise >= 0 ? easeOutBack(v.rise) : 1
    const drop = (hidden ? -0.05 : (v.anim >= 0 ? (1 - e) * -0.12 : 0)) - (1 - r) * 0.9
    const s = (hidden ? 0.97 : (v.anim >= 0 ? 0.9 + 0.1 * e : 1)) * (0.7 + 0.3 * r)
    tmpP.set(x, v.tile.height + drop, z)
    tmpS.set(s, 1, s)
    tmpM.compose(tmpP, tmpQ.identity(), tmpS)
    this.caps.setMatrixAt(v.capIndex, tmpM)
    tmpP.y = v.tile.height + drop - CAP_DEPTH - 0.02
    this.soil.setMatrixAt(v.capIndex, tmpM.compose(tmpP, tmpQ, tmpS))

    for (const pr of v.props) {
      const im = this.propMeshes[pr.kind]
      let k: number
      if (pr.gate && this.mistLifted) k = 0
      else if (pr.always) k = 1
      else if (pr.fog) k = v.discovered ? (v.anim >= 0 ? Math.max(0, 1 - p * 2) : 0) : 1
      else k = v.discovered ? (v.anim >= 0 ? easeOutBack(Math.min(1, Math.max(0, p * 1.4 - 0.25))) : 1) : 0
      k *= Math.max(0, r)
      // Thin out gathered bits: the last groups shrink away first as fullness drops.
      if (pr.group >= 0 && v.full < 1) k *= THREE.MathUtils.clamp(v.full * v.groups - pr.group, 0, 1)
      if (k <= 0.001) {
        tmpM.makeScale(0, 0, 0)
      }
      else if (k === 1) {
        tmpM.copy(pr.base)
      }
      else if (v.rise >= 0 && k > 0) {
        pr.base.decompose(tmpP, tmpQ, tmpS)
        tmpP.y -= (1 - r) * 0.9
        tmpS.multiplyScalar(k)
        tmpM.compose(tmpP, tmpQ, tmpS)
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

  private colorTile(v: TileView) {
    const shown = v.discovered || v.tile.terrain === 'edge'
    this.caps.setColorAt(v.capIndex, this.tileColor(v.tile, shown, v.full))
    const sc = tmpC2.set(this.palette.soil).lerp(tmpC3.set(this.palette.soilDark), v.tile.rand * 0.6)
    if (!shown) sc.lerp(tmpC3.set(this.palette.fog), 0.5)
    this.soil.setColorAt(v.capIndex, sc)
    this.caps.instanceColor!.needsUpdate = true
    this.soil.instanceColor!.needsUpdate = true
  }

  recolor() {
    for (const v of this.byCap) this.colorTile(v)
  }

  setPalette(p: Palette) {
    this.palette = p
    this.recolor()
  }

  setReducedMotion(r: boolean) {
    this.reducedMotion = r
  }

  /**
   * Sync discovery state. `fresh` tiles get a pop-in animation. Discovering a tile also loads
   * everything within LOAD_RADIUS of it, so the island streams in as the bee explores.
   */
  syncDiscovered(discovered: Set<string>, fresh: string[]) {
    const freshSet = new Set(fresh)
    // First sync (page load) builds quietly; later ones let new land rise into view.
    const initial = this.caps.count === 0
    const changedViews: TileView[] = []
    for (const v of this.views) {
      const d = discovered.has(v.tile.key)
      if (d === v.discovered) continue
      v.discovered = d
      changedViews.push(v)
    }
    const before = this.caps.count
    for (const v of changedViews) {
      if (!v.discovered) continue
      for (const h of hexesInRange(v.tile, LOAD_RADIUS)) {
        const w = this.byKey.get(hexKey(h))
        // The land beyond the mist stays unbuilt (and unseen) until the mist lifts.
        if (w && !w.loaded && (this.mistLifted || !w.tile.beyond)) this.loadTile(w, !initial)
      }
    }
    // Tile picking raycasts the caps, which first test the mesh's bounding sphere: keep it current.
    if (this.caps.count !== before) this.caps.computeBoundingSphere()
    for (const v of changedViews) {
      if (!v.loaded) continue
      if (v.discovered && freshSet.has(v.tile.key) && !this.reducedMotion) {
        v.anim = 0
        this.animating.add(v)
      }
      else {
        v.anim = -1
      }
      this.writeTile(v, 1)
      this.colorTile(v)
    }
    for (const v of this.sparkles) v.sparkle!.visible = v.discovered && !this.visitedPois.includes(v.tile.poi!)
  }

  /**
   * Chapter two: thin the mist ring (most of its clouds drift off) and build the land beyond
   * next to anything already discovered, so it's there when the bee looks through.
   */
  setMistLifted(lifted: boolean) {
    if (this.mistLifted === lifted) return
    this.mistLifted = lifted
    const before = this.caps.count
    if (lifted) {
      for (const v of this.views) {
        if (!v.discovered) continue
        for (const h of hexesInRange(v.tile, LOAD_RADIUS)) {
          const w = this.byKey.get(hexKey(h))
          if (w && !w.loaded) this.loadTile(w, true)
        }
      }
    }
    if (this.caps.count !== before) this.caps.computeBoundingSphere()
    for (const v of this.views) if (v.loaded && v.tile.gate) this.writeTile(v, 1)
  }

  setVisitedPois(visited: PoiId[]) {
    this.visitedPois = [...visited]
    for (const v of this.sparkles) {
      v.sparkle!.visible = v.discovered && !visited.includes(v.tile.poi!)
    }
  }

  private fading = new Set<TileView>()

  /** How much of a tile's resource is left (0..1); its flowers / lilies / mushrooms follow. */
  setFullness(key: string, full: number) {
    const v = this.byKey.get(key)
    if (!v || Math.abs(v.fullTarget - full) < 1e-3) return
    v.fullTarget = full
    if (!v.loaded || this.reducedMotion) {
      v.full = full
      if (v.loaded) {
        this.writeTile(v, 1)
        this.colorTile(v)
      }
      return
    }
    this.fading.add(v)
  }

  /** Number of tiles currently built into the scene. */
  get loadedCount() {
    return this.caps.count
  }

  /** Per-frame update. */
  update(dt: number) {
    this.time += dt
    for (const v of this.animating) {
      if (v.anim >= 0) v.anim = Math.min(1, v.anim + dt / 0.55)
      if (v.rise >= 0) v.rise = Math.min(1, v.rise + dt / 0.7)
      this.writeTile(v, v.anim >= 0 ? v.anim : 1)
      if ((v.anim < 0 || v.anim >= 1) && (v.rise < 0 || v.rise >= 1)) {
        v.anim = -1
        v.rise = -1
        this.animating.delete(v)
        this.writeTile(v, 1)
      }
    }
    for (const v of this.fading) {
      v.full += (v.fullTarget - v.full) * Math.min(1, dt * 3)
      if (Math.abs(v.fullTarget - v.full) < 0.005) {
        v.full = v.fullTarget
        this.fading.delete(v)
      }
      if (!this.animating.has(v)) this.writeTile(v, 1)
      this.colorTile(v)
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
    return this.byCap[id]?.tile
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose?.()
    })
  }
}
