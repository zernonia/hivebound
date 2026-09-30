import * as THREE from 'three'

/** Flat-top hexagon with rounded corners, in the XY plane. */
export function roundedHexShape(radius: number, corner: number) {
  const shape = new THREE.Shape()
  const pts: THREE.Vector2[] = []
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i
    pts.push(new THREE.Vector2(Math.cos(a) * radius, Math.sin(a) * radius))
  }
  for (let i = 0; i < 6; i++) {
    const p = pts[i]!
    const prev = pts[(i + 5) % 6]!
    const next = pts[(i + 1) % 6]!
    const toPrev = prev.clone().sub(p).normalize().multiplyScalar(corner)
    const toNext = next.clone().sub(p).normalize().multiplyScalar(corner)
    const a = p.clone().add(toPrev)
    const b = p.clone().add(toNext)
    if (i === 0) shape.moveTo(a.x, a.y)
    else shape.lineTo(a.x, a.y)
    shape.quadraticCurveTo(p.x, p.y, b.x, b.y)
  }
  shape.closePath()
  return shape
}

/**
 * A soft "cushion" tile: rounded hex with a generous bevel.
 * Top surface sits at y = 0; body extends downward by `depth`.
 */
export function cushionHexGeometry(radius: number, depth: number, bevel: number, corner = 0.2, bevelSegments = 3, curveSegments = 3) {
  const shape = roundedHexShape(radius - bevel, corner)
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments,
    curveSegments,
  })
  // Extrude goes along +z; lay it flat so it rises along +y, top at y = 0.
  geo.rotateX(-Math.PI / 2)
  geo.computeBoundingBox()
  const top = geo.boundingBox!.max.y
  geo.translate(0, -top, 0)
  geo.computeVertexNormals()
  return geo
}

/** Flat rounded-hex outline, for hover / destination rings. */
export function hexRingGeometry(outer: number, thickness: number, corner = 0.22) {
  const shape = roundedHexShape(outer, corner)
  const hole = roundedHexShape(outer - thickness, Math.max(0.02, corner - thickness * 0.6))
  shape.holes.push(new THREE.Path(hole.getPoints(8)))
  const geo = new THREE.ShapeGeometry(shape, 8)
  geo.rotateX(-Math.PI / 2)
  return geo
}

/** Soft blob shadow texture (radial gradient). */
export function blobShadowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(60,40,20,0.45)')
  g.addColorStop(0.6, 'rgba(60,40,20,0.18)')
  g.addColorStop(1, 'rgba(60,40,20,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Mix a CSS colour toward another by t (0..1), returning a THREE.Color. */
export function mixColor(a: string | THREE.Color, b: string | THREE.Color, t: number) {
  return new THREE.Color(a).lerp(new THREE.Color(b), t)
}

const hexOutlines = new Map<number, THREE.Vector2[]>()
/** Points round a rounded-hex outline, clockwise on screen from the middle of the top edge. */
function hexOutline(radius: number) {
  let pts = hexOutlines.get(radius)
  if (!pts) {
    const raw = roundedHexShape(radius, Math.max(0.05, 0.22 - (0.93 - radius) * 0.6)).getSpacedPoints(360)
    raw.pop()
    const score = (v: THREE.Vector2) => v.y - 5 * Math.abs(v.x)
    let start = 0
    for (let i = 1; i < raw.length; i++) if (score(raw[i]!) > score(raw[start]!)) start = i
    pts = raw.map((_, i) => raw[(start - i + raw.length) % raw.length]!)
    hexOutlines.set(radius, pts)
  }
  return pts
}

/** World-space (x, z) of the point `t` (0..1) of the way round a rounded-hex outline. */
export function hexOutlinePoint(t: number, radius: number, out = new THREE.Vector3()) {
  const pts = hexOutline(radius)
  const f = (((t % 1) + 1) % 1) * pts.length
  const i = Math.floor(f)
  const a = pts[i % pts.length]!
  const b = pts[(i + 1) % pts.length]!
  const k = f - i
  return out.set(a.x + (b.x - a.x) * k, out.y, -(a.y + (b.y - a.y) * k))
}

/**
 * A flat band following a rounded-hex outline from the top, clockwise, made of `segments`
 * quads (6 indices each) so `setDrawRange` can show just the first part of it.
 */
export function hexTrackGeometry(inner: number, outer: number, segments: number) {
  const pos: number[] = []
  const idx: number[] = []
  const p = new THREE.Vector3()
  for (let i = 0; i <= segments; i++) {
    hexOutlinePoint(i / segments, inner, p)
    pos.push(p.x, 0, p.z)
    hexOutlinePoint(i / segments, outer, p)
    pos.push(p.x, 0, p.z)
    if (i < segments) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  return geo
}
