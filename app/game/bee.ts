import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

/*
 * The player bee: a soft rounded block with painted stripes, big rectangular eyes,
 * curved antennae, two pairs of see-through wings and little round legs.
 *
 * Everything that defines how a bee looks lives in a `BeeLook`, so variants (a queen,
 * a nocturnal bee, seasonal colours…) are a spread of HONEY_BEE with a few values
 * changed. Accessories attach to `rig.anchors` rather than being baked in.
 */

export interface BeeLook {
  body: {
    width: number
    height: number
    /** Front to back. */
    length: number
    /** Edge rounding radius. */
    corner: number
  }
  colors: {
    body: string
    stripe: string
    /** Underside tint, blended up the sides. */
    belly: string
    antenna: string
    legs: string
    /** Cheek blush, or null for none. */
    blush: string | null
    /** Antenna tip colour and glow (0 = matte, like the stalks). Defaults to the antenna colour. */
    antennaTip?: string
    antennaGlow?: number
  }
  /** Stripe bands as [from, to] along the body: 0 = tail end, 1 = face. */
  stripes: [number, number][]
  eyes: {
    width: number
    height: number
    corner: number
    /** Horizontal distance of each eye's centre from the middle of the face. */
    spacing: number
    /** Vertical offset of the eyes from the middle of the face. */
    y: number
    rim: string
    /** Gradient inside the rim, top → bottom. */
    top: string
    bottom: string
  }
  wings: {
    /** Fore wing length (outward) and width. The hind wing is a smaller copy. */
    length: number
    width: number
    /** How far the wings sweep back towards the tail, in radians. */
    sweep: number
    fill: string
    rim: string
  }
}

export const HONEY_BEE: BeeLook = {
  body: { width: 0.52, height: 0.5, length: 0.56, corner: 0.1 },
  colors: {
    body: '#ffc94a',
    stripe: '#6e4128',
    belly: '#ffe3a0',
    antenna: '#4a2c1c',
    legs: '#4a2c1c',
    blush: '#ff8fa8',
  },
  stripes: [[0.08, 0.2], [0.32, 0.44]],
  eyes: {
    width: 0.16,
    height: 0.24,
    corner: 0.045,
    spacing: 0.108,
    y: 0.005,
    rim: '#1c120d',
    top: '#1a110c',
    bottom: '#b3733c',
  },
  wings: { length: 0.46, width: 0.34, sweep: 0.32, fill: '#e3f4ff', rim: '#ffffff' },
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
  /**
   * Attachment points for accessories, all children of `body` so they follow lean and bank.
   * Each has +Y pointing away from the body surface.
   */
  anchors: {
    /** Top of the head, just behind the antennae (crowns, hats, flowers). */
    head: THREE.Group
    /** Centre of the face (glasses, masks). */
    face: THREE.Group
    /** Middle of the back, between the wings (backpacks, capes). */
    back: THREE.Group
    /** Tail end (stingers, bows). */
    tail: THREE.Group
  }
}

/* ------------------------------------------------------------------ */
/* Textures                                                           */
/* ------------------------------------------------------------------ */

/** Body paint indexed by (u = height, v = length), so stripes wrap round the block as rings. */
function bodyTexture(look: BeeLook) {
  const w = 64
  const h = 256
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = look.colors.body
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = look.colors.stripe
  for (const [a, b] of look.stripes) ctx.fillRect(0, (1 - b) * h, w, (b - a) * h)
  // Belly: the lowest fifth of the height, fading out upwards.
  const belly = ctx.createLinearGradient(0, 0, w * 0.2, 0)
  belly.addColorStop(0, look.colors.belly)
  belly.addColorStop(0.75, look.colors.belly)
  belly.addColorStop(1, `${look.colors.belly}00`)
  ctx.fillStyle = belly
  ctx.fillRect(0, 0, w * 0.2, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)))
}

/**
 * The eye is painted rather than modelled: a dark rim, a deep gradient that warms towards
 * the bottom, a soft glow along the lower edge, and two crisp catchlights.
 */
function eyeTexture(eyes: BeeLook['eyes']) {
  const scale = 512 / Math.max(eyes.width, eyes.height)
  const cw = Math.round(eyes.width * scale)
  const ch = Math.round(eyes.height * scale)
  const cr = eyes.corner * scale
  const c = document.createElement('canvas')
  c.width = cw
  c.height = ch
  const ctx = c.getContext('2d')!

  roundRectPath(ctx, 0, 0, cw, ch, cr)
  ctx.fillStyle = eyes.rim
  ctx.fill()

  const b = cw * 0.075
  roundRectPath(ctx, b, b, cw - 2 * b, ch - 2 * b, cr - b)
  ctx.save()
  ctx.clip()
  const g = ctx.createLinearGradient(0, b, 0, ch - b)
  g.addColorStop(0, eyes.top)
  g.addColorStop(0.42, eyes.top)
  g.addColorStop(1, eyes.bottom)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, cw, ch)
  // Warm glow pooling at the bottom, like light passing through the eye.
  const glow = ctx.createRadialGradient(cw * 0.5, ch * 1.02, 0, cw * 0.5, ch * 1.02, cw * 0.62)
  glow.addColorStop(0, 'rgba(255,236,200,0.5)')
  glow.addColorStop(1, 'rgba(255,236,200,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, cw, ch)
  ctx.restore()

  // Catchlights: a big rounded one up top, a small square lower down on the other side.
  ctx.fillStyle = '#ffffff'
  roundRectPath(ctx, cw * 0.47, ch * 0.11, cw * 0.34, ch * 0.24, cw * 0.11)
  ctx.fill()
  roundRectPath(ctx, cw * 0.2, ch * 0.58, cw * 0.17, cw * 0.17, cw * 0.06)
  ctx.fill()

  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                   */
/* ------------------------------------------------------------------ */

function roundRectShape(w: number, h: number, r: number) {
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

/** Rounded teardrop wing outline, hinged at the origin and extending along +x. */
function wingShape(len: number, wid: number) {
  const s = new THREE.Shape()
  s.moveTo(0, 0)
  s.bezierCurveTo(len * 0.25, wid * 0.1, len, wid * 0.35, len, -wid * 0.05)
  s.bezierCurveTo(len, -wid * 0.5, len * 0.35, -wid * 0.75, len * 0.12, -wid * 0.35)
  s.bezierCurveTo(0, -wid * 0.15, 0, -wid * 0.05, 0, 0)
  return s
}

/** UVs for the body texture: u follows height, v follows length. */
function bodyUVs(geo: THREE.BufferGeometry, height: number, length: number) {
  const pos = geo.attributes.position!
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = THREE.MathUtils.clamp(pos.getY(i) / height + 0.5, 0, 1)
    uv[i * 2 + 1] = THREE.MathUtils.clamp(pos.getZ(i) / length + 0.5, 0, 1)
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return geo
}

/* ------------------------------------------------------------------ */
/* Builder                                                            */
/* ------------------------------------------------------------------ */

export function buildBee(look: BeeLook = HONEY_BEE): BeeRig {
  const root = new THREE.Group()
  root.name = 'bee'
  const body = new THREE.Group()
  root.add(body)

  const { width: W, height: H, length: D, corner: R } = look.body
  const std = (color: string, roughness: number) => new THREE.MeshStandardMaterial({ color, roughness })

  // --- body block ---
  const torso = new THREE.Mesh(
    bodyUVs(new RoundedBoxGeometry(W, H, D, 8, R), H, D),
    new THREE.MeshStandardMaterial({ map: bodyTexture(look), roughness: 0.75 }),
  )
  torso.castShadow = true
  body.add(torso)

  /** Places `obj` on the front face at (x, y), following the rounded edges, facing outwards. */
  const onFace = <T extends THREE.Object3D>(obj: T, x: number, y: number, lift = 0): T => {
    const dx = Math.max(0, Math.abs(x) - (W / 2 - R)) * Math.sign(x)
    const dy = Math.max(0, Math.abs(y) - (H / 2 - R)) * Math.sign(y)
    const dz = Math.sqrt(Math.max(0, R * R - dx * dx - dy * dy))
    const n = new THREE.Vector3(dx, dy, dz).normalize()
    obj.position.set(x, y, D / 2 - R + dz).addScaledVector(n, lift)
    obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)
    body.add(obj)
    return obj
  }

  // --- eyes: a thin raised slab for depth, with the painted eye on its front ---
  const e = look.eyes
  const eyeOutline = roundRectShape(e.width, e.height, e.corner)
  const slabGeo = new THREE.ExtrudeGeometry(eyeOutline, {
    depth: 0.006, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 3, curveSegments: 10,
  })
  const slabMat = std(e.rim, 0.3)
  const paintGeo = new THREE.ShapeGeometry(eyeOutline, 10)
  {
    // ShapeGeometry UVs are in shape units; normalise them to 0..1 across the eye.
    const uv = paintGeo.attributes.uv!
    const pos = paintGeo.attributes.position!
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / e.width + 0.5, pos.getY(i) / e.height + 0.5)
  }
  // Unlit so the catchlights stay crisp white whatever the lighting.
  const paintMat = new THREE.MeshBasicMaterial({ map: eyeTexture(e), transparent: true })
  const eyes: THREE.Group[] = []
  for (const side of [-1, 1]) {
    const eye = onFace(new THREE.Group(), side * e.spacing, e.y, 0.002)
    const slab = new THREE.Mesh(slabGeo, slabMat)
    slab.position.z = -0.004
    const paint = new THREE.Mesh(paintGeo, paintMat)
    paint.position.z = 0.0111
    eye.add(slab, paint)
    eyes.push(eye)
  }

  // --- blush, tucked under the outer corner of each eye ---
  if (look.colors.blush) {
    const blushMat = new THREE.MeshBasicMaterial({ color: look.colors.blush, transparent: true, opacity: 0.6, depthWrite: false })
    const blushGeo = new THREE.CircleGeometry(1, 24)
    for (const side of [-1, 1]) {
      const cheek = new THREE.Mesh(blushGeo, blushMat)
      cheek.scale.set(0.036, 0.022, 1)
      onFace(cheek, side * (e.spacing + e.width / 2 + 0.01), e.y - e.height / 2 - 0.012, 0.003)
    }
  }

  // --- antennae: curved stalks with round tips, leaning forward and out ---
  const antennaMat = std(look.colors.antenna, 0.5)
  const antennae = new THREE.Group()
  antennae.position.set(0, H / 2 - 0.03, D / 2 - 0.12)
  const tipGeo = new THREE.SphereGeometry(0.028, 14, 10)
  const tipColor = look.colors.antennaTip ?? look.colors.antenna
  const tipMat = new THREE.MeshStandardMaterial({
    color: tipColor,
    roughness: 0.5,
    emissive: new THREE.Color(tipColor),
    emissiveIntensity: look.colors.antennaGlow ?? 0,
  })
  for (const side of [-1, 1]) {
    const tip = new THREE.Vector3(side * 0.14, 0.16, 0.08)
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(side * 0.07, 0, 0), new THREE.Vector3(side * 0.08, 0.13, 0.02), tip)
    const ball = new THREE.Mesh(tipGeo, tipMat)
    ball.position.copy(tip)
    antennae.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.012, 8), antennaMat), ball)
  }
  body.add(antennae)

  // --- wings: a big fore wing and a smaller hind wing per side, with a soft white rim ---
  const w = look.wings
  const outline = wingShape(w.length, w.width)
  const fillGeo = new THREE.ShapeGeometry(outline, 24)
  const rimGeo = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(outline.getPoints(48).map(p => new THREE.Vector3(p.x, p.y, 0)), true),
    96, 0.009, 6, true,
  )
  // Lay flat: the shape's -y side trails towards the tail.
  fillGeo.rotateX(Math.PI / 2)
  rimGeo.rotateX(Math.PI / 2)
  const fillMat = new THREE.MeshPhysicalMaterial({
    color: w.fill,
    transparent: true,
    opacity: 0.45,
    roughness: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
    emissive: new THREE.Color(w.fill),
    emissiveIntensity: 0.3,
  })
  const rimMat = new THREE.MeshStandardMaterial({ color: w.rim, roughness: 0.4, emissive: new THREE.Color(w.rim), emissiveIntensity: 0.3 })
  const blade = (scale: number, sweep: number, side: number) => {
    const g = new THREE.Group()
    const fill = new THREE.Mesh(fillGeo, fillMat)
    const rim = new THREE.Mesh(rimGeo, rimMat)
    fill.renderOrder = rim.renderOrder = 2
    g.add(fill, rim)
    g.scale.set(side * scale, 1, scale)
    g.rotation.y = side * sweep
    return g
  }
  const makeWing = (side: number) => {
    // GameScene flaps each pivot on rotation.z.
    const pivot = new THREE.Group()
    pivot.position.set(side * 0.09, H / 2 - 0.01, -0.06)
    const hind = blade(0.66, w.sweep + 0.55, side)
    hind.position.set(0, -0.006, -0.05)
    pivot.add(blade(1, w.sweep, side), hind)
    body.add(pivot)
    return pivot
  }
  const wingL = makeWing(-1)
  const wingR = makeWing(1)

  // --- legs: little round nubs ---
  const legMat = std(look.colors.legs, 0.55)
  const legGeo = new THREE.CapsuleGeometry(0.028, 0.04, 6, 10)
  for (const z of [0.11, -0.08]) {
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, legMat)
      leg.position.set(side * 0.12, -H / 2 - 0.01, z)
      body.add(leg)
    }
  }

  // --- accessory anchors ---
  const anchor = (x: number, y: number, z: number) => {
    const a = new THREE.Group()
    a.position.set(x, y, z)
    body.add(a)
    return a
  }
  const face = anchor(0, 0, D / 2)
  face.rotation.x = Math.PI / 2 // +Y points out of the face
  const tail = anchor(0, 0, -D / 2)
  tail.rotation.x = -Math.PI / 2 // +Y points out of the tail
  const anchors = {
    head: anchor(0, H / 2, D / 2 - 0.2),
    face,
    back: anchor(0, H / 2, -0.1),
    tail,
  }

  return { root, body, wingL, wingR, antennae, eyes, anchors }
}
