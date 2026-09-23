import * as THREE from 'three'
import { buildBeeVariant } from './beeVariants'
import { type BuildingModel, buildBuilding } from './buildings'
import { cushionHexGeometry, hexRingGeometry } from './geometry'
import { type Hex, hexDistance, hexKey, hexToWorld } from '~/utils/hex'
import { BUILDINGS, type BuildingId, RESOURCE_INFO, type Resource } from '~/utils/resources'
import { type CellState, HIVE_DOOR } from '~/stores/hive'

/*
 * Inside the home hive: a honeycomb floor of cells around the Queen, a back wall of comb
 * columns, a warm glowing backdrop and floating motes. Buildings sit on cells; sealed cells
 * wear a wax lid.
 */

const CELL_RADIUS = 0.94
const CELL_TOP = 0.12

interface CellView {
  key: string
  hex: Hex
  pos: THREE.Vector3
  cap: THREE.Mesh
  lid: THREE.Mesh
  building?: { id: BuildingId, model: BuildingModel }
  work: number
  ring: THREE.Mesh
  jar: THREE.Group
  jarMat: THREE.MeshStandardMaterial
}

export interface HiveCellSnapshot {
  unlocked: boolean
  canUnlock: boolean
  state?: CellState
  /** 0..1 while a batch runs, otherwise null. */
  progress: number | null
}

const tmpV = new THREE.Vector3()

export class HiveView {
  readonly group = new THREE.Group()
  /** Where the bee comes in and goes out, just past the front edge of the comb. */
  readonly entrance = new THREE.Vector3(0, 0.55, 5.4)
  /** The doorway spot on the floor, selectable to leave. */
  readonly door = new THREE.Vector3(0, CELL_TOP, 4.75)
  private cells = new Map<string, CellView>()
  private pickables: THREE.Object3D[] = []
  private selectRing: THREE.Mesh
  private hoverRing: THREE.Mesh
  private queen = buildBeeVariant('queen')
  private motes: THREE.Points
  private moteBase: Float32Array
  private reducedMotion = false

  constructor(cellHexes: Hex[], private queenKey: string) {
    this.group.name = 'hive-interior'

    // --- warm backdrop dome ---
    const domeGeo = new THREE.SphereGeometry(40, 32, 16)
    const colors: number[] = []
    const pos = domeGeo.attributes.position!
    const low = new THREE.Color('#8a4a14')
    const high = new THREE.Color('#ffd27a')
    for (let i = 0; i < pos.count; i++) {
      const t = THREE.MathUtils.clamp(pos.getY(i) / 40 * 0.5 + 0.5, 0, 1)
      const c = low.clone().lerp(high, Math.pow(t, 1.4))
      colors.push(c.r, c.g, c.b)
    }
    domeGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    const dome = new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }))
    this.group.add(dome)

    // --- floor slab under the comb ---
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.8, 0.6, 6), new THREE.MeshStandardMaterial({ color: '#c77d24', roughness: 0.8 }))
    floor.rotation.y = Math.PI / 6
    floor.position.y = -0.34
    floor.receiveShadow = true
    this.group.add(floor)

    // --- back wall: comb columns of varying height behind the floor ---
    const colGeo = new THREE.CylinderGeometry(0.9, 0.9, 1, 6)
    const colMat = new THREE.MeshStandardMaterial({ color: '#e8a33a', roughness: 0.6 })
    const capMat = new THREE.MeshStandardMaterial({ color: '#ffd27a', roughness: 0.45, emissive: new THREE.Color('#ffb640'), emissiveIntensity: 0.15 })
    const capGeo = new THREE.CylinderGeometry(0.78, 0.82, 0.08, 6)
    for (let q = -5; q <= 5; q++) {
      for (let r = -5; r <= 5; r++) {
        const h = { q, r }
        const d = hexDistance(h, { q: 0, r: 0 })
        if (d < 3 || d > 4) continue
        const { x, z } = hexToWorld(h)
        if (z > 1.2) continue // keep the front open towards the camera
        const height = 1.2 + (d - 3) * 1.6 + Math.abs(Math.sin(q * 3.1 + r * 1.7)) * 1.4 + Math.max(0, -z) * 0.25
        const col = new THREE.Mesh(colGeo, colMat)
        col.scale.y = height
        col.position.set(x, height / 2 - 0.3, z)
        col.castShadow = true
        col.receiveShadow = true
        const cap = new THREE.Mesh(capGeo, capMat)
        cap.position.set(x, height - 0.28, z)
        this.group.add(col, cap)
      }
    }

    // --- cells ---
    const cellGeo = cushionHexGeometry(CELL_RADIUS, CELL_TOP + 0.3, 0.07, 0.24)
    const lidGeo = cushionHexGeometry(CELL_RADIUS * 0.84, 0.1, 0.09, 0.3, 4, 3)
    const ringGeo = new THREE.RingGeometry(0.66, 0.76, 48, 1)
    ringGeo.rotateX(-Math.PI / 2)
    for (const hex of cellHexes) {
      const key = hexKey(hex)
      const { x, z } = hexToWorld(hex)
      const p = new THREE.Vector3(x, CELL_TOP, z)
      const cap = new THREE.Mesh(cellGeo, new THREE.MeshStandardMaterial({ color: '#ffd98a', roughness: 0.55 }))
      cap.position.set(x, CELL_TOP, z)
      cap.receiveShadow = true
      cap.userData.cellKey = key
      const lid = new THREE.Mesh(lidGeo, new THREE.MeshStandardMaterial({ color: '#f2b544', roughness: 0.4, emissive: new THREE.Color('#ffb640'), emissiveIntensity: 0 }))
      lid.position.set(x, CELL_TOP + 0.1, z)
      lid.userData.cellKey = key
      lid.castShadow = true
      // Progress ring (per cell so each can have its own draw range).
      const ring = new THREE.Mesh(ringGeo.clone(), new THREE.MeshBasicMaterial({ color: '#fff4d0', transparent: true, opacity: 0.9, depthWrite: false }))
      ring.position.set(x, CELL_TOP + 0.015, z)
      ring.renderOrder = 3
      ring.visible = false
      // Tray jar: floats above a building when goods are ready.
      const jarMat = new THREE.MeshStandardMaterial({ color: '#ffae1f', roughness: 0.3, emissive: new THREE.Color('#ffae1f'), emissiveIntensity: 0.35 })
      const jar = new THREE.Group()
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.18, 16), jarMat)
      const lidTop = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 16), new THREE.MeshStandardMaterial({ color: '#8a5a36', roughness: 0.6 }))
      lidTop.position.y = 0.11
      jar.add(body, lidTop)
      jar.position.set(x, CELL_TOP + 1.25, z)
      jar.visible = false
      this.group.add(cap, lid, ring, jar)
      this.pickables.push(cap, lid)
      this.cells.set(key, { key, hex, pos: p, cap, lid, work: 0, ring, jar, jarMat })
    }

    // --- the Queen on her cushion ---
    const qc = this.cells.get(queenKey)
    if (qc) {
      qc.lid.visible = false
      const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.2, 32), new THREE.MeshStandardMaterial({ color: '#f7a1b5', roughness: 0.9 }))
      cushion.position.copy(qc.pos).add(tmpV.set(0, 0.1, 0))
      cushion.castShadow = true
      const piping = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.035, 8, 40), new THREE.MeshStandardMaterial({ color: '#ffe08a', roughness: 0.5 }))
      piping.rotation.x = Math.PI / 2
      piping.position.copy(qc.pos).add(tmpV.set(0, 0.2, 0))
      cushion.userData.cellKey = queenKey
      this.group.add(cushion, piping)
      this.queen.root.position.copy(qc.pos).add(tmpV.set(0, 0.75, 0))
      this.queen.root.scale.setScalar(1.15)
      this.group.add(this.queen.root)
      this.queen.root.traverse(o => (o.userData.cellKey = queenKey))
      this.pickables.push(cushion, this.queen.root)
    }

    // --- selection / hover rings ---
    this.selectRing = new THREE.Mesh(hexRingGeometry(0.96, 0.1), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false }))
    this.selectRing.renderOrder = 4
    this.hoverRing = new THREE.Mesh(hexRingGeometry(0.96, 0.06), new THREE.MeshBasicMaterial({ color: '#fff4d0', transparent: true, opacity: 0.6, depthWrite: false }))
    this.hoverRing.renderOrder = 4
    this.hoverRing.visible = false
    this.group.add(this.selectRing, this.hoverRing)

    // --- entrance glow on the floor edge ---
    const pool = document.createElement('canvas')
    pool.width = pool.height = 64
    const pctx = pool.getContext('2d')!
    const grad = pctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, 'rgba(255,236,190,0.9)')
    grad.addColorStop(1, 'rgba(255,236,190,0)')
    pctx.fillStyle = grad
    pctx.fillRect(0, 0, 64, 64)
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.9, 32), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(pool), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }))
    glow.rotation.x = -Math.PI / 2
    glow.scale.set(1.4, 0.8, 1)
    glow.position.set(this.door.x, 0.02, this.door.z)
    this.group.add(glow)

    // --- the doorway: a little wax arch you can select to leave ---
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.08, 12, 32, Math.PI), new THREE.MeshStandardMaterial({ color: '#ffd98a', roughness: 0.5, emissive: new THREE.Color('#ffb640'), emissiveIntensity: 0.2 }))
    arch.position.set(this.door.x, 0.02, this.door.z + 0.25)
    arch.castShadow = true
    const doorPad = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24), new THREE.MeshBasicMaterial({ visible: false }))
    doorPad.rotation.x = -Math.PI / 2
    doorPad.position.set(this.door.x, 0.05, this.door.z)
    arch.userData.cellKey = HIVE_DOOR
    doorPad.userData.cellKey = HIVE_DOOR
    this.group.add(arch, doorPad)
    this.pickables.push(arch, doorPad)

    // --- warm light ---
    const lamp = new THREE.PointLight('#ffc36b', 28, 22, 1.6)
    lamp.position.set(0, 5, 1)
    this.group.add(lamp)

    // --- drifting motes ---
    const n = 60
    this.moteBase = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      this.moteBase[i * 3] = (Math.random() - 0.5) * 12
      this.moteBase[i * 3 + 1] = 0.5 + Math.random() * 4
      this.moteBase[i * 3 + 2] = (Math.random() - 0.5) * 10
    }
    const moteGeo = new THREE.BufferGeometry()
    moteGeo.setAttribute('position', new THREE.BufferAttribute(this.moteBase.slice(), 3))
    this.motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ color: '#fff3c4', size: 0.08, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }))
    this.group.add(this.motes)
  }

  setReducedMotion(v: boolean) {
    this.reducedMotion = v
    this.motes.visible = !v
  }

  /** The spot the bee hovers at when visiting a cell: just in front of it, towards the camera. */
  hoverSpot(key: string | null, out = new THREE.Vector3()) {
    if (key === HIVE_DOOR) return out.copy(this.door).add(tmpV.set(0.45, 0.85, -0.1))
    const c = key ? this.cells.get(key) : undefined
    if (!c) return out.set(0, 1.1, 2.4)
    return out.copy(c.pos).add(tmpV.set(0.45, 1.0, 0.7))
  }

  /** Where the floating action prompt sits for a cell (above its tray jar) or the doorway. */
  promptAnchor(key: string | null, out = new THREE.Vector3()) {
    if (key === HIVE_DOOR) return out.copy(this.door).add(tmpV.set(0, 1.25, 0))
    const c = key ? this.cells.get(key) : undefined
    if (!c) return null
    return out.copy(c.pos).add(tmpV.set(0, 1.75, 0))
  }

  /** Returns the cell key under a raycast, if any. */
  pick(raycaster: THREE.Raycaster): string | null {
    const hit = raycaster.intersectObjects(this.pickables, true)[0]
    let o: THREE.Object3D | null = hit?.object ?? null
    while (o) {
      if (o.userData.cellKey) return o.userData.cellKey as string
      o = o.parent
    }
    return null
  }

  select(key: string | null) {
    this.placeRing(this.selectRing, key, 0.02)
  }

  hover(key: string | null) {
    this.placeRing(this.hoverRing, key, 0.025)
  }

  private placeRing(ring: THREE.Mesh, key: string | null, lift: number) {
    const isDoor = key === HIVE_DOOR
    const c = key && !isDoor ? this.cells.get(key) : undefined
    ring.visible = isDoor || !!c
    if (isDoor) ring.position.copy(this.door).add(tmpV.set(0, lift - CELL_TOP + 0.03, 0))
    else if (c) ring.position.copy(c.pos).add(tmpV.set(0, lift, 0))
    ring.scale.setScalar(isDoor ? 0.7 : 1)
  }

  /** Brings cell visuals in line with hive state: lids, buildings, trays, progress. */
  sync(snapshot: (key: string) => HiveCellSnapshot) {
    for (const c of this.cells.values()) {
      if (c.key === this.queenKey) continue
      const s = snapshot(c.key)
      const sealed = !s.unlocked
      c.lid.visible = sealed
      ;(c.cap.material as THREE.MeshStandardMaterial).color.set(sealed ? '#d99a3c' : '#ffd98a')
      ;(c.lid.material as THREE.MeshStandardMaterial).userData.hint = s.canUnlock
      const want = s.state?.building
      if (c.building?.id !== want) {
        if (c.building) {
          const old = c.building.model.group
          this.group.remove(old)
          this.pickables = this.pickables.filter(o => o !== old)
        }
        c.building = undefined
        if (want) {
          const model = buildBuilding(want)
          model.group.position.copy(c.pos)
          model.group.traverse(o => (o.userData.cellKey = c.key))
          this.group.add(model.group)
          this.pickables.push(model.group)
          c.building = { id: want, model }
        }
      }
      // Tray jar coloured by the product.
      const out = want ? BUILDINGS[want].recipe?.out : undefined
      const product = out ? (Object.keys(out)[0] as Resource) : undefined
      c.jar.visible = !!product && (s.state?.output ?? 0) > 0
      if (product) {
        c.jarMat.color.set(RESOURCE_INFO[product].color)
        c.jarMat.emissive.set(RESOURCE_INFO[product].color)
      }
      c.ring.userData.progress = s.progress
    }
  }

  update(dt: number, time: number) {
    const rm = this.reducedMotion
    for (const c of this.cells.values()) {
      const progress = c.ring.userData.progress as number | null | undefined
      const working = progress != null
      c.work += ((working ? 1 : 0) - c.work) * (1 - Math.exp(-dt * 3))
      c.building?.model.animate(time, rm ? 0 : c.work)
      // Progress ring fills clockwise.
      c.ring.visible = working
      if (working) {
        const segs = Math.max(1, Math.floor(progress * 48))
        c.ring.geometry.setDrawRange(0, segs * 6)
      }
      if (c.jar.visible) {
        c.jar.position.y = c.pos.y + 1.2 + (rm ? 0 : Math.sin(time * 2.2 + c.hex.q) * 0.06)
        c.jar.rotation.y = rm ? 0 : time * 0.8
      }
      // Sealed cells you can open glow softly to invite a look.
      const lidMat = c.lid.material as THREE.MeshStandardMaterial
      lidMat.emissiveIntensity = lidMat.userData.hint ? (rm ? 0.25 : 0.18 + Math.sin(time * 2.5) * 0.12) : 0
    }

    // Queen: gentle hover and flutter.
    const q = this.queen
    const qc = this.cells.get(this.queenKey)
    if (qc) q.root.position.y = qc.pos.y + 0.75 + (rm ? 0 : Math.sin(time * 1.6) * 0.05)
    const f = Math.sin(time * (rm ? 10 : 22)) * (rm ? 0.15 : 0.35) + 0.25
    q.wingR.rotation.z = f
    q.wingL.rotation.z = -f
    q.antennae.rotation.x = rm ? 0 : Math.sin(time * 1.3) * 0.08

    if (!rm) {
      const arr = this.motes.geometry.attributes.position!.array as Float32Array
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] = this.moteBase[i]! + Math.sin(time * 0.3 + i) * 0.3
        arr[i + 1] = this.moteBase[i + 1]! + ((time * 0.15 + i * 0.37) % 1.5)
        arr[i + 2] = this.moteBase[i + 2]! + Math.cos(time * 0.25 + i) * 0.3
      }
      this.motes.geometry.attributes.position!.needsUpdate = true
    }
  }
}
