import * as THREE from 'three'
import type { BuildingId } from '~/utils/resources'

/*
 * Hive building models. Each is a small, chunky set piece sitting on a cell top (y = 0),
 * about a cell wide, with an `animate` hook that plays while the building is working.
 */

export interface BuildingModel {
  group: THREE.Group
  /** `work` eases 0 → 1 while a batch is running, so motion starts and stops softly. */
  animate: (time: number, work: number) => void
}

const std = (color: string, roughness = 0.7, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, ...extra })

const M = {
  wood: std('#c08a5a'),
  woodDark: std('#8a5a36'),
  honey: std('#ffb21f', 0.25, { emissive: new THREE.Color('#ff9a00'), emissiveIntensity: 0.2 }),
  clay: std('#e8946a', 0.85),
  clayDark: std('#c7704c', 0.85),
  pollen: std('#ffc933', 0.8),
  pot: std('#6e4a3a', 0.5),
  wax: std('#fff0b8', 0.55),
  waxGlow: std('#fff2c4', 0.4, { emissive: new THREE.Color('#ffd76a'), emissiveIntensity: 0.6 }),
  comb: std('#f2b43c', 0.5),
  lid: std('#ffe08a', 0.45),
  smoke: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0.8, depthWrite: false }),
  glow: new THREE.MeshStandardMaterial({ color: '#ffb35c', emissive: new THREE.Color('#ff8a2a'), emissiveIntensity: 0.2, roughness: 0.6 }),
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true) {
  const m = new THREE.Mesh(geo, mat)
  m.castShadow = shadow
  m.receiveShadow = true
  return m
}

/** Honey Press: a round wooden barrel with a honey top and a screw handle that turns. */
function press(): BuildingModel {
  const g = new THREE.Group()
  const profile: THREE.Vector2[] = []
  for (let i = 0; i <= 20; i++) {
    const t = i / 20
    profile.push(new THREE.Vector2(0.3 + Math.sin(t * Math.PI) * 0.06, t * 0.5))
  }
  const barrel = mesh(new THREE.LatheGeometry(profile, 32), M.wood)
  g.add(barrel)
  for (const y of [0.1, 0.4]) {
    const hoop = mesh(new THREE.TorusGeometry(0.345, 0.018, 8, 36), M.woodDark)
    hoop.rotation.x = Math.PI / 2
    hoop.position.y = y
    g.add(hoop)
  }
  const top = mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.04, 32), M.honey)
  top.position.y = 0.49
  g.add(top)
  const post = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 12), M.woodDark)
  post.position.y = 0.7
  g.add(post)
  const handle = new THREE.Group()
  handle.position.y = 0.88
  const bar = mesh(new THREE.CapsuleGeometry(0.03, 0.42, 4, 10), M.woodDark)
  bar.rotation.z = Math.PI / 2
  handle.add(bar)
  for (const x of [-0.24, 0.24]) {
    const knob = mesh(new THREE.SphereGeometry(0.05, 14, 10), M.wood)
    knob.position.x = x
    handle.add(knob)
  }
  g.add(handle)
  // Spout with a drip that swells and falls while pressing.
  const spout = mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.14, 12), M.woodDark)
  spout.rotation.x = Math.PI / 2
  spout.position.set(0, 0.16, 0.36)
  g.add(spout)
  const drip = mesh(new THREE.SphereGeometry(0.045, 12, 10), M.honey, false)
  drip.position.set(0, 0.12, 0.43)
  g.add(drip)
  return {
    group: g,
    animate(time, work) {
      handle.rotation.y += work * 0.03
      const cycle = (time * 0.8) % 1
      drip.scale.setScalar(0.4 + work * (0.6 + cycle * 0.5))
      drip.position.y = 0.12 - work * Math.max(0, cycle - 0.7) * 0.4
    },
  }
}

/** Bee Bread Kitchen: a round clay oven with a glowing door, a chimney that puffs, and a pollen pile. */
function kitchen(): BuildingModel {
  const g = new THREE.Group()
  const dome = mesh(new THREE.SphereGeometry(0.36, 32, 18, 0, Math.PI * 2, 0, Math.PI / 2), M.clay)
  dome.scale.set(1, 1.1, 1)
  dome.position.y = 0.06
  g.add(dome)
  const base = mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.08, 32), M.clayDark)
  base.position.y = 0.03
  g.add(base)
  const doorShape = new THREE.Shape()
  doorShape.moveTo(-0.1, 0)
  doorShape.lineTo(-0.1, 0.08)
  doorShape.absarc(0, 0.08, 0.1, Math.PI, 0, true)
  doorShape.lineTo(0.1, 0)
  const door = mesh(new THREE.ShapeGeometry(doorShape, 12), M.glow, false)
  door.position.set(0, 0.08, 0.35)
  door.rotation.x = -0.12
  g.add(door)
  const chimney = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.2, 14), M.clayDark)
  chimney.position.set(0.14, 0.44, -0.08)
  g.add(chimney)
  const puffs: THREE.Mesh[] = []
  for (let i = 0; i < 3; i++) {
    const p = mesh(new THREE.SphereGeometry(0.05, 12, 10), M.smoke, false)
    p.userData.phase = i / 3
    g.add(p)
    puffs.push(p)
  }
  for (const [x, z, s] of [[-0.36, 0.2, 1], [-0.28, 0.3, 0.8], [-0.42, 0.32, 0.7]] as const) {
    const ball = mesh(new THREE.SphereGeometry(0.07 * s, 14, 10), M.pollen)
    ball.position.set(x, 0.07 * s, z)
    g.add(ball)
  }
  return {
    group: g,
    animate(time, work) {
      M.glow.emissiveIntensity = 0.2 + work * (0.9 + Math.sin(time * 5) * 0.2)
      for (const p of puffs) {
        const t = (time * 0.5 + (p.userData.phase as number)) % 1
        p.visible = work > 0.05
        p.position.set(0.14 + Math.sin(t * 6) * 0.03, 0.56 + t * 0.4, -0.08)
        p.scale.setScalar((0.6 + t) * work)
      }
    },
  }
}

/** Wax Works: a little melting pot with glowing wax, and a stack of wax bricks. */
function waxworks(): BuildingModel {
  const g = new THREE.Group()
  const pot = mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.3, 28, 1, true), M.pot)
  pot.material.side = THREE.DoubleSide
  pot.position.set(0.05, 0.25, 0)
  g.add(pot)
  const rim = mesh(new THREE.TorusGeometry(0.26, 0.025, 8, 32), M.pot)
  rim.rotation.x = Math.PI / 2
  rim.position.set(0.05, 0.4, 0)
  g.add(rim)
  const melt = mesh(new THREE.CircleGeometry(0.25, 28), M.waxGlow, false)
  melt.rotation.x = -Math.PI / 2
  melt.position.set(0.05, 0.36, 0)
  g.add(melt)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    const leg = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 8), M.pot)
    leg.position.set(0.05 + Math.cos(a) * 0.15, 0.06, Math.sin(a) * 0.15)
    g.add(leg)
  }
  const bubble = mesh(new THREE.SphereGeometry(0.04, 12, 10), M.waxGlow, false)
  g.add(bubble)
  const brickGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.07, 6)
  for (const [x, y, z] of [[-0.3, 0.035, 0.2], [-0.3, 0.035, 0.0], [-0.3, 0.105, 0.1]] as const) {
    const b = mesh(brickGeo, M.wax)
    b.position.set(x, y, z)
    g.add(b)
  }
  return {
    group: g,
    animate(time, work) {
      M.waxGlow.emissiveIntensity = 0.3 + work * 0.6
      const t = (time * 0.9) % 1
      bubble.visible = work > 0.05
      bubble.position.set(0.1, 0.36 + t * 0.05, 0.05)
      bubble.scale.setScalar(work * (0.4 + t))
      pot.rotation.y = Math.sin(time * 9) * 0.02 * work
    },
  }
}

/** Larder Comb: a small stack of capped honeycomb cells. */
function larder(): BuildingModel {
  const g = new THREE.Group()
  const cellGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.26, 6)
  const lidGeo = new THREE.CylinderGeometry(0.15, 0.16, 0.03, 6)
  const spots: [number, number, number][] = [[-0.17, 0.13, 0.1], [0.17, 0.13, 0.1], [0, 0.13, -0.19], [0, 0.39, 0.0]]
  for (const [x, y, z] of spots) {
    const c = mesh(cellGeo, M.comb)
    c.position.set(x, y, z)
    g.add(c)
    const lid = mesh(lidGeo, M.lid)
    lid.position.set(x, y + 0.14, z)
    g.add(lid)
  }
  return { group: g, animate() {} }
}

const BUILDERS: Record<BuildingId, () => BuildingModel> = { press, kitchen, waxworks, larder }

export function buildBuilding(id: BuildingId): BuildingModel {
  const model = BUILDERS[id]()
  model.group.name = id
  return model
}
