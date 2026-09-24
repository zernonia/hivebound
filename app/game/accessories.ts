import * as THREE from 'three'

/*
 * Accessories are plain three.js groups built around their own origin, with +Y as "up and
 * away from the bee". Attach one to an anchor on the bee rig, e.g.
 * `rig.anchors.head.add(buildCrown())`.
 */

/** A small, chunky gold crown with pearl-tipped points and a rose gem at the front. */
export function buildCrown(opts: { gold?: string, gem?: string, pearl?: string } = {}) {
  const gold = new THREE.MeshStandardMaterial({
    color: opts.gold ?? '#ffc93d',
    roughness: 0.3,
    metalness: 0.25,
    emissive: new THREE.Color('#7a4a00'),
    emissiveIntensity: 0.15,
  })
  const pearl = new THREE.MeshStandardMaterial({ color: opts.pearl ?? '#fff6e8', roughness: 0.25 })
  const gem = new THREE.MeshStandardMaterial({
    color: opts.gem ?? '#f0507a',
    roughness: 0.15,
    emissive: new THREE.Color(opts.gem ?? '#f0507a'),
    emissiveIntensity: 0.25,
  })

  const crown = new THREE.Group()
  crown.name = 'crown'
  const radius = 0.085
  const bandH = 0.045

  // Band: a thick ring with rounded rims top and bottom.
  const band = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.04, bandH, 40, 1, true), gold)
  band.material.side = THREE.DoubleSide
  band.position.y = bandH / 2
  band.castShadow = true
  const rimGeo = new THREE.TorusGeometry(radius * 1.02, 0.011, 10, 40)
  rimGeo.rotateX(Math.PI / 2)
  const rimLow = new THREE.Mesh(rimGeo, gold)
  rimLow.position.y = 0.004
  const rimHigh = new THREE.Mesh(rimGeo, gold)
  rimHigh.position.y = bandH
  rimHigh.scale.setScalar(0.98)
  crown.add(band, rimLow, rimHigh)

  // Five rounded points, each tipped with a pearl.
  const pointGeo = new THREE.ConeGeometry(0.026, 0.06, 16)
  const pearlGeo = new THREE.SphereGeometry(0.014, 14, 10)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2 // one point straight ahead (+Z)
    const x = Math.cos(a) * radius * 0.96
    const z = Math.sin(a) * radius * 0.96
    const point = new THREE.Mesh(pointGeo, gold)
    point.position.set(x, bandH + 0.028, z)
    const tip = new THREE.Mesh(pearlGeo, pearl)
    tip.position.set(x, bandH + 0.064, z)
    crown.add(point, tip)
  }

  // Rose gem on the front of the band.
  const front = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 12), gem)
  front.scale.set(1, 1.2, 0.6)
  front.position.set(0, bandH / 2, radius * 1.06)
  crown.add(front)

  // A jaunty tilt reads cuter than dead straight.
  crown.rotation.set(0.08, 0, -0.14)
  return crown
}

/* ------------------------------------------------------------------ */
/* Keepsakes: wearables found around the island                       */
/* ------------------------------------------------------------------ */
/*
 * Each builder returns a group positioned in the bee's *body* space (x right, y up, z towards
 * the face) for the standard bee (0.52 wide, 0.5 tall, 0.56 long): add it to `rig.body`.
 */

const mat = (color: string, roughness = 0.6, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, ...extra })

function specs() {
  const g = new THREE.Group()
  const frame = mat('#8a5a2b', 0.35, { metalness: 0.2 })
  const ring = new THREE.TorusGeometry(0.1, 0.014, 10, 32)
  for (const side of [-1, 1]) {
    const r = new THREE.Mesh(ring, frame)
    r.position.set(side * 0.108, 0.005, 0.296)
    r.scale.set(0.95, 1.2, 1)
    g.add(r)
  }
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.03, 8), frame)
  bridge.rotation.z = Math.PI / 2
  bridge.position.set(0, 0.06, 0.298)
  g.add(bridge)
  return g
}

function flower(petal: string, centre: string, petals: number, r: number) {
  const g = new THREE.Group()
  const petalGeo = new THREE.SphereGeometry(1, 12, 8)
  const pm = mat(petal, 0.5)
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2
    const p = new THREE.Mesh(petalGeo, pm)
    p.scale.set(r * 0.55, r * 0.14, r * 0.28)
    p.position.set(Math.cos(a) * r * 0.75, 0, Math.sin(a) * r * 0.75)
    p.rotation.y = -a
    g.add(p)
  }
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.45, r * 0.22, 20), mat(centre, 0.9))
  g.add(disc)
  return g
}

function sunflowerClip() {
  const f = flower('#ffcb2e', '#6b3e1f', 12, 0.13)
  f.position.set(0.17, 0.28, 0.12)
  f.rotation.set(0.5, 0, -0.5)
  return f
}

function lilyPadHat() {
  const g = new THREE.Group()
  const shape = new THREE.Shape()
  shape.absarc(0, 0, 0.2, 0.35, Math.PI * 2 - 0.05, false)
  shape.lineTo(0, 0)
  const pad = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.018, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2 }), mat('#7cc36a', 0.7))
  pad.rotation.x = -Math.PI / 2
  g.add(pad)
  const bloom = flower('#ffb3c7', '#ffe27a', 8, 0.06)
  bloom.position.set(-0.05, 0.035, 0.03)
  g.add(bloom)
  g.position.set(0, 0.265, -0.03)
  g.rotation.set(0.06, 0.4, -0.1)
  return g
}

function dandelionPuff() {
  const g = new THREE.Group()
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.2, 8), mat('#6fa64f', 0.8))
  stalk.position.y = 0.1
  const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 2), mat('#ffffff', 0.9, { transparent: true, opacity: 0.9 }))
  puff.position.y = 0.22
  const seeds = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 1), mat('#d9cfae', 0.9))
  seeds.position.y = 0.22
  g.add(stalk, puff, seeds)
  // In front of the wings, leaning out to the side so it reads from the camera.
  g.position.set(-0.16, 0.24, 0.14)
  g.rotation.set(0.25, 0, 0.45)
  return g
}

function acornCap() {
  const g = new THREE.Group()
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat('#9a6a3c', 0.95))
  cap.scale.y = 0.6
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.148, 0.018, 8, 32), mat('#7c522d', 0.95))
  rim.rotation.x = Math.PI / 2
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.06, 8), mat('#6e4128', 0.9))
  stem.position.y = 0.11
  stem.rotation.z = 0.3
  g.add(cap, rim, stem)
  g.position.set(0, 0.25, -0.02)
  g.rotation.set(0.05, 0, -0.12)
  return g
}

function satchel() {
  const g = new THREE.Group()
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.14), mat('#d99a4a', 0.85))
  const flap = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.05, 0.146), mat('#a86a3a', 0.85))
  flap.position.y = 0.04
  const button = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), mat('#fff0b8', 0.4))
  button.position.set(0.03, 0.02, 0)
  g.add(bag, flap, button)
  g.position.set(0.285, -0.08, -0.06)
  return g
}

function oldCrown() {
  const c = buildCrown({ gold: '#e2bd66', gem: '#6fb8ff', pearl: '#f4ecd8' })
  c.scale.setScalar(1.6)
  c.position.set(0, 0.25, 0.06)
  return c
}

function mistScarf() {
  const g = new THREE.Group()
  const m = mat('#cdbdf0', 0.8, { emissive: new THREE.Color('#9d8bd6'), emissiveIntensity: 0.15 })
  // A snug band round the middle of the body (behind the face), with one loose end.
  const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.034, 12, 40), m)
  wrap.scale.set(1, 0.96, 1.6)
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.025), m)
  tail.position.set(0.17, -0.24, 0.03)
  tail.rotation.z = 0.25
  g.add(wrap, tail)
  g.position.set(0, -0.01, 0.06)
  return g
}

function ribbon() {
  const g = new THREE.Group()
  const m = mat('#f06f97', 0.45)
  const loop = new THREE.ConeGeometry(0.06, 0.11, 16)
  for (const side of [-1, 1]) {
    const l = new THREE.Mesh(loop, m)
    l.rotation.z = side * Math.PI / 2
    l.position.x = side * 0.055
    g.add(l)
  }
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), m))
  g.position.set(0, 0.2, -0.29)
  return g
}

function lavenderSprig() {
  const g = new THREE.Group()
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.22, 6), mat('#6f9a5a', 0.8))
  stem.position.y = 0.11
  g.add(stem)
  // Little buds stacked up the top of the stem, smaller towards the tip.
  const bud = new THREE.SphereGeometry(1, 10, 8)
  const bm = mat('#a88be0', 0.6)
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Mesh(bud, bm)
    const k = 1 - i / 9
    b.scale.set(0.028 * k, 0.034 * k, 0.028 * k)
    b.position.set((i % 2 ? 1 : -1) * 0.012, 0.13 + i * 0.022, 0)
    g.add(b)
  }
  g.position.set(0.15, 0.24, 0.1)
  g.rotation.set(0.2, 0, -0.5)
  return g
}

function leafCape() {
  const g = new THREE.Group()
  // A broad leaf laid over the back, gently curled, with a midrib.
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.bezierCurveTo(0.2, 0.06, 0.2, 0.32, 0, 0.42)
  shape.bezierCurveTo(-0.2, 0.32, -0.2, 0.06, 0, 0)
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.01, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2 })
  const leaf = new THREE.Mesh(geo, mat('#e8913a', 0.7, { emissive: new THREE.Color('#c25a12'), emissiveIntensity: 0.12 }))
  leaf.rotation.x = -Math.PI / 2 + 0.25
  const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.4, 6), mat('#a8561c', 0.8))
  rib.rotation.x = Math.PI / 2 - 0.25
  rib.position.set(0, 0.035, -0.19)
  g.add(leaf, rib)
  g.position.set(0, 0.26, 0.04)
  return g
}

function moonLocket() {
  const g = new THREE.Group()
  const chain = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.008, 6, 40), mat('#dfe6f2', 0.3, { metalness: 0.5 }))
  chain.scale.set(1, 0.96, 1.5)
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.018, 20), mat('#eef3ff', 0.25, { metalness: 0.4, emissive: new THREE.Color('#b9cbff'), emissiveIntensity: 0.35 }))
  disc.rotation.x = Math.PI / 2
  disc.position.set(0, -0.2, 0.305)
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 10), mat('#fff6c9', 0.3, { emissive: new THREE.Color('#fff0a0'), emissiveIntensity: 0.6 }))
  moon.position.set(0.008, -0.2, 0.318)
  g.add(chain, disc, moon)
  g.position.set(0, 0, 0.06)
  return g
}

function starPin() {
  const g = new THREE.Group()
  const shape = new THREE.Shape()
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2
    const r = i % 2 ? 0.035 : 0.08
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  const star = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2 }),
    mat('#ffd24a', 0.3, { metalness: 0.3, emissive: new THREE.Color('#ffb400'), emissiveIntensity: 0.3 }),
  )
  g.add(star)
  g.position.set(-0.14, 0.3, 0.14)
  g.rotation.set(-0.2, 0.3, 0.25)
  return g
}

const KEEPSAKE_BUILDERS: Record<string, () => THREE.Object3D> = {
  specs,
  sunflower: sunflowerClip,
  lilypad: lilyPadHat,
  dandelion: dandelionPuff,
  acorn: acornCap,
  satchel,
  oldcrown: oldCrown,
  mistscarf: mistScarf,
  ribbon,
  sprig: lavenderSprig,
  leafcape: leafCape,
  locket: moonLocket,
  starpin: starPin,
}

/** Builds a keepsake in body space (add to `rig.body`), or null for an unknown id. */
export function buildKeepsake(id: string): THREE.Object3D | null {
  const b = KEEPSAKE_BUILDERS[id]
  if (!b) return null
  const obj = b()
  obj.name = `keepsake:${id}`
  obj.traverse(o => (o.castShadow = o instanceof THREE.Mesh))
  return obj
}
