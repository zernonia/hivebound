import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

/*
 * A blocky bee built on a 7 × 7 × 10 unit grid (width × height × length), with softly
 * rounded edges: yellow face, brown stripes towards the tail, a darker underside row,
 * dark eyes that wrap round the front corners, L-shaped antennae poking forward,
 * outlined see-through wings and three pairs of flat legs.
 */

/** One grid unit in world units. */
const U = 0.066
const W = 7 * U
const H = 7 * U
const D = 10 * U
const R = 0.03

const C = {
  yellow: '#ffd54f',
  underside: '#e8993f',
  stripe: '#7a4524',
  tail: '#643a22',
  eye: '#2b2838',
  iris: '#58c9c4',
  leg: '#7a5238',
  foot: '#1e1714',
  antenna: '#211d26',
}

/**
 * Body paint, indexed by (u = height, v = length). v runs tail (0) → face (1), so the
 * same texture paints the sides, top and underside as rings round the body; the face
 * takes the v = 1 edge and the tail the v = 0 edge.
 */
function bodyTexture() {
  const px = 16 // texels per grid unit
  const c = document.createElement('canvas')
  c.width = 7 * px
  c.height = 10 * px
  const ctx = c.getContext('2d')!
  // Grid units along the body, measured from the tail: [from, to, colour].
  const bands: [number, number, string][] = [
    [0, 2, C.tail],
    [2, 3, C.yellow],
    [3, 4, C.stripe],
    [4, 5, C.yellow],
    [5, 6, C.stripe],
    [6, 10, C.yellow],
  ]
  for (const [a, b, col] of bands) {
    // Canvas y is flipped relative to v.
    const y0 = (10 - b) * px
    ctx.fillStyle = col
    ctx.fillRect(0, y0, 7 * px, (b - a) * px)
    // Bottom row: yellow bands turn a warm orange underneath.
    if (col === C.yellow) {
      ctx.fillStyle = C.underside
      ctx.fillRect(0, y0, px, (b - a) * px)
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
  return t
}

/** u follows height, v follows length, so bodyTexture() wraps the whole block. */
function bodyUVs(geo: THREE.BufferGeometry) {
  const pos = geo.attributes.position!
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = THREE.MathUtils.clamp(pos.getY(i) / H + 0.5, 0, 1)
    uv[i * 2 + 1] = THREE.MathUtils.clamp(pos.getZ(i) / D + 0.5, 0, 1)
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return geo
}

/** Rounded rectangle (w × h) in the XY plane, centred on the origin. */
function roundedRectShape(w: number, h: number, r: number) {
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
  return s
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

  const mat = (color: string, roughness = 0.6) => new THREE.MeshStandardMaterial({ color, roughness })
  const eyeMat = mat(C.eye, 0.3)
  const irisMat = mat(C.iris, 0.3)
  const legMat = mat(C.leg)
  const footMat = mat(C.foot)
  const antennaMat = mat(C.antenna, 0.5)

  // --- body block ---
  const torso = new THREE.Mesh(
    bodyUVs(new RoundedBoxGeometry(W, H, D, 3, R)),
    new THREE.MeshStandardMaterial({ map: bodyTexture(), roughness: 0.6 }),
  )
  torso.castShadow = true
  body.add(torso)
  const front = D / 2

  // --- eyes: 2 × 3 units on the face, wrapping 1 unit round the side ---
  // Each eye is a block hugging the front corner, a hair proud of the body so it reads cleanly.
  const lift = 0.004
  const eyeGeo = new RoundedBoxGeometry(2 * U + lift, 3 * U, U + lift, 3, R)
  const irisGeo = new THREE.PlaneGeometry(U * 0.96, U * 0.96)
  const eyes: THREE.Group[] = []
  for (const side of [-1, 1]) {
    const eye = new THREE.Group()
    eye.position.set(side * (W / 2 - U + lift / 2), 0, front - U / 2 + lift / 2)
    eye.add(new THREE.Mesh(eyeGeo, eyeMat))
    // Light square on the inner column, middle row.
    const iris = new THREE.Mesh(irisGeo, irisMat)
    iris.position.set(-side * U / 2, 0, U / 2 + lift / 2 + 0.001)
    eye.add(iris)
    body.add(eye)
    eyes.push(eye)
  }

  // --- antennae: a short stub up from the face, then a rod pointing forward ---
  const antennae = new THREE.Group()
  antennae.position.set(0, H / 2 - 1.5 * U, front)
  const t = U * 0.45
  const stubGeo = new RoundedBoxGeometry(t, U * 1.3, t, 2, t * 0.3)
  const rodGeo = new RoundedBoxGeometry(t, t, U * 3, 2, t * 0.3)
  for (const side of [-1, 1]) {
    const stub = new THREE.Mesh(stubGeo, antennaMat)
    stub.position.set(side * 2 * U, U * 0.4, U * 0.3)
    const rod = new THREE.Mesh(rodGeo, antennaMat)
    rod.position.set(side * 2 * U, U * 0.95, U * 1.8)
    antennae.add(stub, rod)
  }
  body.add(antennae)

  // --- stinger: a small dark block at the tail ---
  const sting = new THREE.Mesh(new RoundedBoxGeometry(U * 0.5, U * 0.5, U * 1.2, 2, U * 0.12), antennaMat)
  sting.position.set(0, -U * 0.5, -front - U * 0.4)
  body.add(sting)

  // --- legs: three pairs of thin plates, brown with dark feet ---
  const legGeo = new RoundedBoxGeometry(U * 1.6, U * 1.2, U * 0.35, 2, U * 0.1)
  const footGeo = new RoundedBoxGeometry(U * 1.6, U * 1.1, U * 0.35, 2, U * 0.1)
  for (const z of [2.25, 0.25, -1.75]) {
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, legMat)
      leg.position.set(side * 1.5 * U, -H / 2 - U * 0.5, z * U)
      const foot = new THREE.Mesh(footGeo, footMat)
      foot.position.set(side * 1.5 * U, -H / 2 - U * 1.6, z * U)
      body.add(leg, foot)
    }
  }

  // --- wings: white outlined frames with a faint see-through fill, swept back ---
  const wingW = 7.5 * U // outward from the body
  const wingH = 4.5 * U
  const border = 0.6 * U
  const outer = roundedRectShape(wingW, wingH, R)
  const frameShape = roundedRectShape(wingW, wingH, R)
  frameShape.holes.push(roundedRectShape(wingW - 2 * border, wingH - 2 * border, R * 0.5))
  const prepWing = (g: THREE.BufferGeometry) => {
    g.translate(wingW / 2, 0, 0) // hinge at x = 0
    g.rotateX(-Math.PI / 2) // lie flat
    return g
  }
  const frameGeo = prepWing(new THREE.ShapeGeometry(frameShape, 4))
  const fillGeo = prepWing(new THREE.ShapeGeometry(outer, 4))
  const frameMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.4,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
    emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 0.35,
  })
  const fillMat = new THREE.MeshBasicMaterial({
    color: '#eef8ff',
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const makeWing = (side: number) => {
    const pivot = new THREE.Group()
    pivot.position.set(side * U, H / 2 + U * 0.35, U * 0.5)
    const blade = new THREE.Group()
    blade.scale.set(side, 1, 1)
    // Swept back: the tip trails towards the tail.
    blade.rotation.y = side * 0.6
    const frame = new THREE.Mesh(frameGeo, frameMat)
    frame.renderOrder = 2
    const fill = new THREE.Mesh(fillGeo, fillMat)
    fill.renderOrder = 2
    blade.add(frame, fill)
    pivot.add(blade)
    body.add(pivot)
    return pivot
  }
  const wingL = makeWing(-1)
  const wingR = makeWing(1)

  return { root, body, wingL, wingR, antennae, eyes }
}
