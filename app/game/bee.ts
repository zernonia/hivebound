import * as THREE from 'three'

/** Horizontal stripe texture wrapped around the body (front → back). */
function stripeTexture() {
  const c = document.createElement('canvas')
  c.width = 32
  c.height = 256
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffd24d'
  ctx.fillRect(0, 0, 32, 256)
  const brown = '#5b3a24'
  const band = (from: number, to: number) => {
    // Soft edges so stripes look painted rather than cut.
    const g = ctx.createLinearGradient(0, from * 256, 0, to * 256)
    g.addColorStop(0, 'rgba(91,58,36,0)')
    g.addColorStop(0.18, brown)
    g.addColorStop(0.82, brown)
    g.addColorStop(1, 'rgba(91,58,36,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, from * 256, 32, (to - from) * 256)
  }
  band(0.4, 0.55)
  band(0.64, 0.79)
  band(0.88, 1.0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export interface BeeRig {
  root: THREE.Group
  /** Inner group used for squash/stretch + lean, so root can hold world position/yaw. */
  body: THREE.Group
  wingL: THREE.Group
  wingR: THREE.Group
  antennae: THREE.Group
}

export function buildBee(): BeeRig {
  const root = new THREE.Group()
  root.name = 'bee'
  const body = new THREE.Group()
  root.add(body)

  const yellow = new THREE.MeshStandardMaterial({ color: '#ffd24d', roughness: 0.55 })
  const dark = new THREE.MeshStandardMaterial({ color: '#3a2618', roughness: 0.35 })
  const shine = new THREE.MeshBasicMaterial({ color: '#ffffff' })
  const blush = new THREE.MeshBasicMaterial({ color: '#ff9fb2', transparent: true, opacity: 0.8 })
  const wingMat = new THREE.MeshPhysicalMaterial({
    color: '#e8f6ff',
    transparent: true,
    opacity: 0.55,
    roughness: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
    emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 0.25,
  })

  // Abdomen: sphere with poles along Z so the stripe texture wraps as rings.
  const abdomenGeo = new THREE.SphereGeometry(0.27, 40, 28)
  abdomenGeo.rotateX(Math.PI / 2)
  const abdomen = new THREE.Mesh(abdomenGeo, new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: 0.55 }))
  abdomen.scale.set(1, 0.95, 1.22)
  abdomen.position.set(0, 0, -0.08)
  abdomen.castShadow = true
  body.add(abdomen)

  // Stinger.
  const sting = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 10), dark)
  sting.rotation.x = -Math.PI / 2
  sting.position.set(0, -0.01, -0.43)
  body.add(sting)

  // Head.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 36, 26), yellow)
  head.position.set(0, 0.07, 0.25)
  head.castShadow = true
  body.add(head)

  // Big shiny eyes.
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.058, 20, 16), dark)
    eye.scale.set(1, 1.2, 0.6)
    eye.position.set(side * 0.085, 0.1, 0.44)
    body.add(eye)
    const hi = new THREE.Mesh(new THREE.SphereGeometry(0.019, 10, 8), shine)
    hi.position.set(side * 0.085 + 0.018, 0.128, 0.472)
    body.add(hi)
    const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.04, 16), blush)
    cheek.position.set(side * 0.148, 0.02, 0.41)
    cheek.rotation.y = side * 0.55
    body.add(cheek)
  }

  // Little smile.
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 8, 16, Math.PI), dark)
  smile.rotation.z = Math.PI
  smile.position.set(0, 0.03, 0.463)
  body.add(smile)

  // Antennae.
  const antennae = new THREE.Group()
  antennae.position.set(0, 0.24, 0.3)
  for (const side of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.05, 0, 0),
      new THREE.Vector3(side * 0.09, 0.1, 0.05),
      new THREE.Vector3(side * 0.14, 0.17, 0.02),
    ])
    const stalk = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.012, 6), dark)
    antennae.add(stalk)
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), dark)
    tip.position.set(side * 0.14, 0.17, 0.02)
    antennae.add(tip)
  }
  body.add(antennae)

  // Wings: rounded teardrops pivoting at the shoulder.
  const wingShape = new THREE.Shape()
  wingShape.moveTo(0, 0)
  wingShape.bezierCurveTo(0.08, 0.02, 0.3, 0.1, 0.3, 0.2)
  wingShape.bezierCurveTo(0.3, 0.3, 0.12, 0.3, 0.04, 0.16)
  wingShape.bezierCurveTo(0.0, 0.1, 0.0, 0.04, 0, 0)
  const wingGeo = new THREE.ShapeGeometry(wingShape, 16)
  wingGeo.rotateX(-Math.PI / 2) // lie flat, extending along +x and -z
  const makeWing = (side: number) => {
    const pivot = new THREE.Group()
    pivot.position.set(side * 0.06, 0.22, 0.02)
    const w = new THREE.Mesh(wingGeo, wingMat)
    w.scale.set(side, 1, 1)
    w.rotation.y = side * 0.15
    w.renderOrder = 2
    pivot.add(w)
    // small second wing behind
    const w2 = new THREE.Mesh(wingGeo, wingMat)
    w2.scale.set(side * 0.7, 1, 0.7)
    w2.position.z = -0.08
    w2.rotation.y = side * -0.25
    w2.renderOrder = 2
    pivot.add(w2)
    body.add(pivot)
    return pivot
  }
  const wingL = makeWing(-1)
  const wingR = makeWing(1)

  // Tiny feet.
  for (const [x, z] of [[-0.09, 0.08], [0.09, 0.08], [-0.1, -0.08], [0.1, -0.08]] as const) {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), dark)
    foot.scale.set(1, 0.8, 1.3)
    foot.position.set(x, -0.25, z)
    body.add(foot)
  }

  return { root, body, wingL, wingR, antennae }
}
