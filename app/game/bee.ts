import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

/*
 * A chunky, toy-like bee: one soft rounded block for the body with painted stripes,
 * a flat face carrying big glossy eyes, stubby block legs and flat wings on top.
 * Blocky silhouette, smooth edges.
 */

const YELLOW = '#ffcf3f'
const BROWN = '#4a2f1d'

// Body block (x = width, y = height, z = length; the face is on +Z).
const W = 0.54
const H = 0.46
const D = 0.62
const R = 0.1

/**
 * Stripe texture indexed by v = position along the body (0 = tail, 1 = face).
 * Bands have a few pixels of blend so they read as painted rather than cut.
 */
function stripeTexture() {
  const size = 256
  const c = document.createElement('canvas')
  c.width = 8
  c.height = size
  const ctx = c.getContext('2d')!
  ctx.fillStyle = YELLOW
  ctx.fillRect(0, 0, 8, size)
  ctx.fillStyle = BROWN
  // [from, to] in v. The front ~45% stays yellow so the face is clean.
  for (const [a, b] of [[0.1, 0.24], [0.38, 0.52]] as const) {
    const y0 = (1 - b) * size
    const y1 = (1 - a) * size
    const g = ctx.createLinearGradient(0, y0, 0, y1)
    const e = 2 / (y1 - y0)
    g.addColorStop(0, `${BROWN}00`)
    g.addColorStop(e, BROWN)
    g.addColorStop(1 - e, BROWN)
    g.addColorStop(1, `${BROWN}00`)
    ctx.fillStyle = g
    ctx.fillRect(0, y0, 8, y1 - y0)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
  return t
}

/** Re-map UVs so v runs tail → face on every side of the block; stripes then wrap as rings. */
function uvAlongZ(geo: THREE.BufferGeometry, depth: number) {
  const pos = geo.attributes.position!
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = 0.5
    uv[i * 2 + 1] = THREE.MathUtils.clamp(pos.getZ(i) / depth + 0.5, 0, 1)
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return geo
}

/** Flat rounded rectangle in the XY plane, centred on the origin. */
function roundedRect(w: number, h: number, r: number, segments = 6) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return new THREE.ShapeGeometry(s, segments)
}

export interface BeeRig {
  root: THREE.Group
  /** Inner group used for squash/stretch + lean, so root can hold world position/yaw. */
  body: THREE.Group
  wingL: THREE.Group
  wingR: THREE.Group
  antennae: THREE.Group
  /** One group per eye, scaled on Y to blink. */
  eyes: THREE.Group[]
}

export function buildBee(): BeeRig {
  const root = new THREE.Group()
  root.name = 'bee'
  const body = new THREE.Group()
  root.add(body)

  const dark = new THREE.MeshStandardMaterial({ color: BROWN, roughness: 0.5 })
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#1f140d', roughness: 0.18, metalness: 0.05 })
  const shine = new THREE.MeshBasicMaterial({ color: '#ffffff' })
  const blush = new THREE.MeshBasicMaterial({ color: '#ff9fb2', transparent: true, opacity: 0.75, depthWrite: false })
  const wingMat = new THREE.MeshPhysicalMaterial({
    color: '#e8f6ff',
    transparent: true,
    opacity: 0.6,
    roughness: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
    emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 0.25,
  })

  // --- body block ---
  const torso = new THREE.Mesh(
    uvAlongZ(new RoundedBoxGeometry(W, H, D, 5, R), D),
    new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: 0.55 }),
  )
  torso.castShadow = true
  body.add(torso)
  const front = D / 2

  // --- face: big rounded-square eyes with two catchlights, blush, small smile ---
  const eyeW = 0.15
  const eyeH = 0.18
  const eyeGeo = new RoundedBoxGeometry(eyeW, eyeH, 0.03, 3, 0.04)
  const bigShine = roundedRect(0.055, 0.06, 0.02)
  const smallShine = roundedRect(0.026, 0.026, 0.01)
  const eyes: THREE.Group[] = []
  for (const side of [-1, 1]) {
    const eye = new THREE.Group()
    eye.position.set(side * 0.105, 0.035, front)
    const ball = new THREE.Mesh(eyeGeo, eyeMat)
    eye.add(ball)
    const hi = new THREE.Mesh(bigShine, shine)
    hi.position.set(side * 0.028, 0.042, 0.0155)
    eye.add(hi)
    const lo = new THREE.Mesh(smallShine, shine)
    lo.position.set(-side * 0.035, -0.05, 0.0155)
    eye.add(lo)
    body.add(eye)
    eyes.push(eye)

    const cheek = new THREE.Mesh(roundedRect(0.06, 0.036, 0.018), blush)
    cheek.position.set(side * 0.165, -0.085, front + 0.002)
    body.add(cheek)
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.008, 8, 16, Math.PI), dark)
  smile.rotation.z = Math.PI
  smile.position.set(0, -0.075, front + 0.002)
  body.add(smile)

  // --- antennae: straight stalks with block tips, leaning forward ---
  const antennae = new THREE.Group()
  antennae.position.set(0, H / 2 - 0.01, front - 0.1)
  const stalkGeo = new RoundedBoxGeometry(0.035, 0.16, 0.035, 2, 0.012)
  stalkGeo.translate(0, 0.08, 0)
  const tipGeo = new RoundedBoxGeometry(0.07, 0.07, 0.07, 3, 0.022)
  for (const side of [-1, 1]) {
    const a = new THREE.Group()
    a.position.set(side * 0.09, 0, 0)
    a.rotation.set(0.5, 0, side * -0.18)
    a.add(new THREE.Mesh(stalkGeo, dark))
    const tip = new THREE.Mesh(tipGeo, dark)
    tip.position.y = 0.17
    a.add(tip)
    antennae.add(a)
  }
  body.add(antennae)

  // --- stinger ---
  const sting = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 4), dark)
  sting.rotation.set(-Math.PI / 2, Math.PI / 4, 0)
  sting.position.set(0, -0.05, -front - 0.04)
  body.add(sting)

  // --- stubby block legs (three pairs) ---
  const legGeo = new RoundedBoxGeometry(0.05, 0.09, 0.05, 2, 0.018)
  for (const z of [0.14, 0, -0.14]) {
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, dark)
      leg.position.set(side * 0.13, -H / 2 - 0.03, z)
      body.add(leg)
    }
  }

  // --- wings: flat rounded panels on the back, pivoting at the top edge ---
  // Extends along +x from the pivot, lying flat; swept slightly back.
  const wingGeo = roundedRect(0.36, 0.24, 0.1, 8)
  wingGeo.translate(0.18, 0.04, 0) // after rotateX, +y becomes -z (towards the tail)
  wingGeo.rotateX(-Math.PI / 2)
  const makeWing = (side: number) => {
    const pivot = new THREE.Group()
    pivot.position.set(side * 0.1, H / 2 + 0.005, -0.04)
    const w = new THREE.Mesh(wingGeo, wingMat)
    w.scale.set(side, 1, 1)
    w.rotation.y = side * 0.2
    w.renderOrder = 2
    pivot.add(w)
    const w2 = new THREE.Mesh(wingGeo, wingMat)
    w2.scale.set(side * 0.7, 1, 0.7)
    w2.position.set(0, -0.004, -0.1)
    w2.rotation.y = side * 0.5
    w2.renderOrder = 2
    pivot.add(w2)
    body.add(pivot)
    return pivot
  }
  const wingL = makeWing(-1)
  const wingR = makeWing(1)

  return { root, body, wingL, wingR, antennae, eyes }
}
