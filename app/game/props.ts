import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { PoiId } from '~/utils/world'

/* ------------------------------------------------------------------ */
/* Shared materials                                                   */
/* ------------------------------------------------------------------ */

const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0, ...extra })

/**
 * Soft vertex-coloured material for merged props. The per-instance tint only lands where the
 * geometry's `tint` attribute is 1, so one mesh can hold a pastel petal ring (tinted per flower)
 * around a fixed yellow centre, or a tinted canopy over a plain brown trunk.
 */
function paintedMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, metalness: 0, vertexColors: true })
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <color_pars_vertex>', '#include <color_pars_vertex>\nattribute float tint;')
      .replace('vColor.rgb *= instanceColor.rgb;', 'vColor.rgb *= mix(vec3(1.0), instanceColor.rgb, tint);')
  }
  m.customProgramCacheKey = () => 'painted-tint'
  return m
}

export const MAT = {
  white: std('#ffffff', { roughness: 0.7 }), // tinted per-instance
  painted: paintedMaterial(),
  grass: std('#8fcf73'),
  stem: std('#6fb35e'),
  trunk: std('#a47650'),
  center: std('#ffcf4d', { roughness: 0.6 }),
  pebble: std('#d8cfc2'),
  lily: std('#79c46b'),
  cloud: std('#ffffff', { roughness: 1, emissive: new THREE.Color('#fff6ec'), emissiveIntensity: 0.25 }),
  wood: std('#b88657'),
  woodDark: std('#8a5f3c'),
  straw: std('#f2c46b', { roughness: 0.85 }),
  strawDark: std('#d9a24a'),
  door: std('#5a3a22'),
  honey: std('#ffb627', { roughness: 0.25, emissive: new THREE.Color('#ff9d00'), emissiveIntensity: 0.15 }),
  moss: std('#8cc97a'),
  stone: std('#cfc6d6'),
  glow: new THREE.MeshStandardMaterial({ color: '#fff4c9', emissive: new THREE.Color('#ffd97a'), emissiveIntensity: 1.2, roughness: 0.4 }),
  seed: std('#fffaf0', { roughness: 1, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.2 }),
  sunDisc: std('#8a5a2b'),
  sparkle: new THREE.MeshStandardMaterial({ color: '#ffe27a', emissive: new THREE.Color('#ffc93c'), emissiveIntensity: 0.9, roughness: 0.3 }),
  nest: std('#d9b3e6'),
  nestDark: std('#b58fc7'),
}

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                   */
/* ------------------------------------------------------------------ */

type Shade = (x: number, y: number, z: number) => number
type Paint = THREE.ColorRepresentation | ((x: number, y: number, z: number) => THREE.Color)

const { smoothstep } = THREE.MathUtils
const TAU = Math.PI * 2

/**
 * Bakes a colour (flat, or a function of position) and a tint mask into a part. `shade`
 * multiplies the colour: a cheap baked contact shadow that keeps props soft without extra lights.
 */
function paint(g: THREE.BufferGeometry, color: Paint, tint = 0, shade?: Shade) {
  if (g.getAttribute('uv')) g.deleteAttribute('uv')
  const pos = g.getAttribute('position')
  const n = pos.count
  const flat = typeof color === 'function' ? null : new THREE.Color(color)
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const c = flat ?? (color as (x: number, y: number, z: number) => THREE.Color)(x, y, z)
    const k = shade ? shade(x, y, z) : 1
    col[i * 3] = c.r * k
    col[i * 3 + 1] = c.g * k
    col[i * 3 + 2] = c.b * k
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(n).fill(tint), 1))
  return g
}

/** Merges parts into one geometry (extrusions are non-indexed, so everything follows suit then). */
function merge(parts: THREE.BufferGeometry[]) {
  const indexed = parts.every(p => p.index)
  const list = indexed ? parts : parts.map(p => (p.index ? p.toNonIndexed() : p))
  const g = mergeGeometries(list)!
  for (const p of new Set([...parts, ...list])) p.dispose()
  return g
}

/** Darker underneath, full colour from `top` up: reads as soft light from above. */
const underShade = (bottom: number, top: number, dark = 0.72): Shade => (_x, y) => dark + (1 - dark) * smoothstep(y, bottom, top)

/**
 * A lathe from (radius, height) pairs. Order them from the bottom/outside up and in towards
 * the axis so the normals face outwards.
 */
function lathe(pts: [number, number][], segments: number, phiStart = 0, phiLength = TAU) {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segments, phiStart, phiLength)
}

/** A soft pointed leaf lying along +x from the origin, drooping a little towards the tip. */
function leafGeometry(len: number, width: number, droop = 0.25, ws = 8, hs = 5) {
  const g = new THREE.SphereGeometry(1, ws, hs)
  const p = g.getAttribute('position')
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const u = (x + 1) / 2
    // Pinch the ends so it tapers to a point rather than an egg.
    const z = p.getZ(i) * (1 - 0.5 * Math.abs(x)) * (width / 2)
    p.setXYZ(i, u * len, p.getY(i) * width * 0.12 - droop * len * u * u, z)
  }
  g.computeVertexNormals()
  return g
}

/** Tapered trunk with a root flare: a few lobes swell out near the ground. */
function trunkGeometry(height: number, base: number, top: number, roots = 4, segments = 9) {
  const g = lathe([[base * 1.5, 0], [base * 1.08, height * 0.07], [base * 0.86, height * 0.22], [(base * 0.86 + top) / 2, height * 0.6], [top, height]], segments)
  const p = g.getAttribute('position')
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const z = p.getZ(i)
    const flare = Math.max(0, 1 - p.getY(i) / (height * 0.3))
    const lobe = 1 + 0.3 * flare * Math.max(0, Math.cos(roots * Math.atan2(x, z))) ** 2
    p.setXYZ(i, x * lobe, p.getY(i), z * lobe)
  }
  return g
}

/** A rounded blob, darker underneath. */
function blob(x: number, y: number, z: number, r: number, color: Paint, tint = 1, squash = 1, ws = 12, hs = 8, dark = 0.72) {
  const g = new THREE.SphereGeometry(r, ws, hs)
  g.scale(1, squash, 1)
  paint(g, color, tint, underShade(-r * squash, r * squash * 0.55, dark))
  g.translate(x, y, z)
  return g
}

/** Points spread evenly over a sphere (golden spiral). */
function fibonacciDirs(n: number) {
  const out: THREE.Vector3[] = []
  for (let k = 0; k < n; k++) {
    const y = 1 - (2 * (k + 0.5)) / n
    const r = Math.sqrt(1 - y * y)
    const a = k * 2.39996
    out.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r))
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Instanced prop kinds                                               */
/* ------------------------------------------------------------------ */

/** Soft grass blades: thin, tapered, each bending outwards, darker at the roots. */
function tuftGeometry() {
  const parts: THREE.BufferGeometry[] = []
  // [angle, distance from centre, height, lean, width]
  const blades = [
    [0.3, 0.01, 0.29, 0.1, 1.1],
    [1.4, 0.05, 0.22, 0.45, 1],
    [2.5, 0.05, 0.25, 0.35, 1.05],
    [3.6, 0.06, 0.17, 0.55, 0.9],
    [4.6, 0.05, 0.21, 0.4, 1],
    [5.5, 0.06, 0.15, 0.6, 0.85],
  ] as const
  for (const [a, d, h, lean, w] of blades) {
    // A blunt tip rather than a needle point keeps the blades soft.
    const g = new THREE.CylinderGeometry(0.009 * w, 0.042 * w, h, 4, 3, true)
    // Thin across the bend, broad along it, so blades curl like ribbons.
    g.scale(0.42, 1, 1)
    g.translate(0, h / 2, 0)
    const p = g.getAttribute('position')
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / h
      p.setX(i, p.getX(i) + lean * h * t * t)
    }
    g.computeVertexNormals()
    paint(g, '#ffffff', 1, underShade(0, h, 0.7))
    g.rotateY(-a)
    g.translate(Math.cos(a) * d, 0, Math.sin(a) * d)
    parts.push(g)
  }
  return merge(parts)
}

/** Flower stem with a little leaf, gently curved. Top ends at (0, 0.3, 0) for the head. */
function stemGeometry() {
  const stem = new THREE.CylinderGeometry(0.011, 0.016, 0.3, 5, 3, true)
  stem.translate(0, 0.15, 0)
  const p = stem.getAttribute('position')
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + 0.02 * Math.sin((p.getY(i) / 0.3) * Math.PI))
  paint(stem, '#6fb35e', 0, underShade(0, 0.15, 0.75))
  const leaf = leafGeometry(0.09, 0.045, 0.3, 6, 4)
  paint(leaf, '#80c86c', 0, (x: number) => 0.8 + 0.2 * smoothstep(x, 0, 0.06))
  leaf.rotateZ(0.55)
  leaf.rotateY(2.2)
  leaf.translate(0.012, 0.07, 0)
  return merge([stem, leaf])
}

/** Five soft petals (tinted per flower) around a fixed golden centre. */
function petalsGeometry() {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 5; i++) {
    const g = new THREE.SphereGeometry(1, 6, 4)
    const p = g.getAttribute('position')
    // Narrow at the base, round at the tip.
    for (let k = 0; k < p.count; k++) p.setZ(k, p.getZ(k) * (0.62 + 0.38 * (p.getX(k) + 1) / 2))
    g.scale(0.054, 0.016, 0.036)
    g.computeVertexNormals()
    paint(g, '#ffffff', 1, (x: number) => 0.84 + 0.16 * smoothstep(x, -0.04, 0.03))
    g.translate(0.052, 0, 0)
    g.rotateZ(0.24)
    g.rotateY((i / 5) * TAU)
    parts.push(g)
  }
  const c = new THREE.SphereGeometry(0.03, 8, 5)
  c.scale(1, 0.6, 1)
  paint(c, '#ffc93c', 0, underShade(-0.01, 0.018, 0.8))
  c.translate(0, 0.012, 0)
  parts.push(c)
  return merge(parts)
}

/** A closed tulip bud with three soft petal lobes. */
function tulipGeometry() {
  const g = lathe([[0.004, -0.005], [0.04, 0.008], [0.058, 0.04], [0.056, 0.08], [0.038, 0.112], [0.012, 0.126], [0.001, 0.128]], 12)
  const p = g.getAttribute('position')
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const z = p.getZ(i)
    const y = p.getY(i)
    const a = Math.atan2(x, z)
    const lobe = Math.cos(3 * a)
    const k = 1 + 0.16 * lobe * smoothstep(y, 0.03, 0.11)
    // Three petal tips poke up above the rounded bud.
    p.setXYZ(i, x * k, y + 0.03 * Math.max(0, lobe) ** 2 * smoothstep(y, 0.08, 0.126), z * k)
  }
  g.computeVertexNormals()
  return paint(g, '#ffffff', 1, underShade(0, 0.1, 0.78))
}

/** A round, layered canopy: three overlapping blobs in slightly different greens over a flared trunk. */
function treeGeometry() {
  const trunk = trunkGeometry(0.46, 0.075, 0.055)
  paint(trunk, '#a47650', 0, underShade(0, 0.3, 0.78))
  return merge([
    trunk,
    blob(0, 0.56, 0, 0.34, '#ffffff', 1, 0.92, 16, 10),
    blob(-0.2, 0.44, -0.08, 0.22, '#dfeede', 1, 1, 13, 9),
    blob(0.1, 0.8, 0.05, 0.21, '#fbffe6', 1, 1, 13, 9),
  ])
}

/** Little fruit or blossom dots scattered over a round tree's canopy (same transform as the tree). */
function treeBitsGeometry() {
  const parts: THREE.BufferGeometry[] = []
  const spots = [[0.2, 0.25], [1.3, 0.05], [2.2, 0.45], [3.1, -0.05], [4.0, 0.3], [5.0, 0.1], [5.8, 0.55]] as const
  for (const [a, e] of spots) {
    const g = new THREE.SphereGeometry(0.042, 7, 5)
    paint(g, '#ffffff', 1, underShade(-0.035, 0.03, 0.8))
    const r = 0.34
    g.translate(Math.cos(a) * Math.cos(e) * r, 0.56 + Math.sin(e) * r * 0.92, Math.sin(a) * Math.cos(e) * r)
    parts.push(g)
  }
  return merge(parts)
}

/** A cute stacked pine: three soft rounded tiers on a short flared trunk. */
function pineGeometry() {
  const trunk = trunkGeometry(0.3, 0.07, 0.05, 3)
  paint(trunk, '#9a6c48', 0, underShade(0, 0.2, 0.78))
  const parts = [trunk]
  const tiers = [[0.16, 0.36, 0.34, '#dce9dc'], [0.38, 0.32, 0.27, '#ffffff'], [0.58, 0.3, 0.19, '#f6fde8']] as const
  for (const [base, h, r, tone] of tiers) {
    const g = lathe([[0.001, -0.03], [r * 0.6, -0.025], [r * 0.95, 0], [r, h * 0.08], [r * 0.82, h * 0.26], [r * 0.34, h * 0.72], [0.001, h]], 10)
    paint(g, tone, 1, underShade(-0.02, h * 0.45, 0.7))
    g.translate(0, base, 0)
    parts.push(g)
  }
  return merge(parts)
}

/** A rounded pebble with a little companion. */
function pebbleGeometry() {
  const big = new THREE.SphereGeometry(0.09, 9, 6)
  big.scale(1, 0.55, 0.8)
  paint(big, '#ffffff', 1, underShade(-0.04, 0.04, 0.8))
  const small = new THREE.SphereGeometry(0.045, 7, 5)
  small.scale(1, 0.7, 0.85)
  paint(small, '#f1ece6', 1, underShade(-0.03, 0.03, 0.8))
  small.translate(0.1, 0, 0.05)
  return merge([big, small])
}

/** Mushroom parts: cream stem, tinted cap with a paler rim underneath and white spots. */
function mushroomParts(scale: number, ox: number, oz: number, spots: number) {
  const stem = lathe([[0.033, 0], [0.037, 0.03], [0.033, 0.08], [0.026, 0.115]], 8)
  paint(stem, '#fff3e3', 0, underShade(0, 0.06, 0.82))
  const cap = new THREE.SphereGeometry(0.1, 12, 5, 0, TAU, 0, Math.PI / 2)
  cap.scale(1, 0.72, 1)
  paint(cap, '#ffffff', 1, underShade(0, 0.07, 0.8))
  cap.translate(0, 0.108, 0)
  const under = new THREE.CircleGeometry(0.099, 12)
  under.rotateX(Math.PI / 2)
  paint(under, '#f5dcc6', 0)
  under.translate(0, 0.108, 0)
  const parts = [stem, cap, under]
  const z = new THREE.Vector3(0, 0, 1)
  for (let i = 0; i < spots; i++) {
    const a = i * 2.3 + 0.4
    const e = 0.45 + (i % 2) * 0.35
    const n = new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e) * 0.72, Math.sin(a) * Math.cos(e)).normalize()
    const s = new THREE.SphereGeometry(0.017 + (i % 3) * 0.004, 6, 4)
    s.scale(1, 1, 0.4)
    s.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(z, n))
    paint(s, '#fffaf2', 0)
    s.translate(Math.cos(a) * Math.cos(e) * 0.1, 0.108 + Math.sin(e) * 0.072, Math.sin(a) * Math.cos(e) * 0.1)
    parts.push(s)
  }
  for (const p of parts) {
    p.scale(scale, scale, scale)
    p.translate(ox, 0, oz)
  }
  return parts
}

function mushroomGeometry() {
  return merge([...mushroomParts(1, 0, 0, 5), ...mushroomParts(0.55, 0.1, 0.07, 3)])
}

/** A lily pad with a notch and a softly raised rim, paler towards the middle. */
function lilyPadGeometry(r = 0.2, color: THREE.ColorRepresentation = '#ffffff', tint = 1) {
  const notch = 0.55
  // Lathe angles are measured from +z, so the notch sits around +z.
  const g = lathe([[r * 0.9, 0], [r, 0.008], [r, 0.022], [r * 0.9, 0.015], [r * 0.55, 0.012], [0.001, 0.014]], 18, notch / 2, TAU - notch)
  return paint(g, color, tint, (x, _y, z) => 1 - 0.16 * smoothstep(Math.hypot(x, z), r * 0.2, r * 0.92))
}

/** Lotus bloom: an outer and inner ring of pointed petals around a golden heart. */
function lotusParts(color: THREE.ColorRepresentation, tint: number) {
  const parts: THREE.BufferGeometry[] = []
  const ring = (n: number, len: number, lift: number, dist: number, off: number, y: number) => {
    for (let i = 0; i < n; i++) {
      const g = new THREE.SphereGeometry(1, 6, 4)
      const p = g.getAttribute('position')
      for (let k = 0; k < p.count; k++) p.setZ(k, p.getZ(k) * (1 - 0.45 * Math.abs(p.getX(k))))
      g.scale(len, len * 0.3, len * 0.5)
      g.computeVertexNormals()
      paint(g, color, tint, (x: number) => 0.8 + 0.2 * smoothstep(x, -len, len * 0.6))
      g.translate(dist, 0, 0)
      g.rotateZ(lift)
      g.rotateY((i / n) * TAU + off)
      g.translate(0, y, 0)
      parts.push(g)
    }
  }
  ring(6, 0.032, 0.55, 0.035, 0, 0.012)
  ring(5, 0.027, 1.0, 0.018, 0.5, 0.02)
  const heart = new THREE.SphereGeometry(0.017, 6, 4)
  paint(heart, '#ffcf4d', 0)
  heart.translate(0, 0.04, 0)
  parts.push(heart)
  return parts
}

function cloudGeometry() {
  const parts: THREE.BufferGeometry[] = []
  const blobs = [
    [0, 0, 0, 0.38],
    [0.32, -0.06, 0.05, 0.28],
    [-0.3, -0.05, -0.02, 0.3],
    [0.08, 0.14, -0.14, 0.26],
  ] as const
  for (const [x, y, z, r] of blobs) {
    const g = new THREE.SphereGeometry(r, 12, 8)
    g.translate(x, y, z)
    parts.push(g)
  }
  return mergeGeometries(parts)!
}

export type PropKind =
  | 'tuft'
  | 'stem'
  | 'petals'
  | 'tulip'
  | 'tree'
  | 'pine'
  | 'treeBits'
  | 'pebble'
  | 'lily'
  | 'lilyBloom'
  | 'mushroom'
  | 'cloud'

export interface PropKindDef {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  castShadow: boolean
  /** Uses per-instance colours. */
  tinted?: boolean
}

export function createPropKinds(): Record<PropKind, PropKindDef> {
  const P = MAT.painted
  return {
    tuft: { geometry: tuftGeometry(), material: P, castShadow: false, tinted: true },
    stem: { geometry: stemGeometry(), material: P, castShadow: false },
    petals: { geometry: petalsGeometry(), material: P, castShadow: false, tinted: true },
    tulip: { geometry: tulipGeometry(), material: P, castShadow: false, tinted: true },
    tree: { geometry: treeGeometry(), material: P, castShadow: true, tinted: true },
    pine: { geometry: pineGeometry(), material: P, castShadow: true, tinted: true },
    treeBits: { geometry: treeBitsGeometry(), material: P, castShadow: false, tinted: true },
    pebble: { geometry: pebbleGeometry(), material: P, castShadow: false, tinted: true },
    lily: { geometry: lilyPadGeometry(), material: P, castShadow: false, tinted: true },
    lilyBloom: { geometry: merge(lotusParts('#ffffff', 1)), material: P, castShadow: false, tinted: true },
    mushroom: { geometry: mushroomGeometry(), material: P, castShadow: false, tinted: true },
    cloud: { geometry: cloudGeometry(), material: MAT.cloud, castShadow: false },
  }
}

export const FLOWER_COLORS = ['#ff9ec7', '#ffffff', '#c9a7ff', '#ffb38a', '#9fd3ff', '#ffe27a']
export const CANOPY_COLORS = ['#7cc47a', '#8fd07a', '#6fb87e', '#a3d67c']
/** Pines lean cooler and deeper than the round trees. */
export const PINE_COLORS = ['#5fae86', '#6bb88c', '#58a47f']
export const MUSHROOM_COLORS = ['#ff8a80', '#ffab91', '#f48fb1']
export const TUFT_COLORS = ['#8fcf73', '#9ed97c', '#7fc56e']
export const PEBBLE_COLORS = ['#d8cfc2', '#d6cedd', '#e2d6c4', '#cbc6c0']
export const LILY_COLORS = ['#79c46b', '#86cf74', '#6dbb6c']
export const LOTUS_COLORS = ['#ffc2dc', '#fff4f8', '#e3c8ff']
/** Fruit and blossom dots for the occasional round tree. */
export const TREE_BIT_COLORS = ['#ff7b7b', '#ffb38a', '#ffd1e3', '#fff1a8']

/* ------------------------------------------------------------------ */
/* Unique set pieces                                                  */
/* ------------------------------------------------------------------ */

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true) {
  const m = new THREE.Mesh(geo, mat)
  m.castShadow = shadow
  m.receiveShadow = true
  return m
}

/** Classic straw skep hive: smooth lathe with soft ridges. */
export function buildHive() {
  const g = new THREE.Group()
  const pts: THREE.Vector2[] = []
  const H = 1.05
  for (let i = 0; i <= 80; i++) {
    const t = i / 80
    const y = t * H
    const dome = Math.sqrt(Math.max(0, 1 - Math.pow(t, 2.2))) * 0.62
    const ridge = 0.035 * Math.pow(Math.sin(t * Math.PI * 6), 2)
    pts.push(new THREE.Vector2(Math.max(0.001, dome + ridge), y))
  }
  const skep = mesh(new THREE.LatheGeometry(pts, 48), MAT.straw)
  g.add(skep)

  const knob = mesh(new THREE.SphereGeometry(0.09, 16, 12), MAT.strawDark)
  knob.position.y = H + 0.02
  g.add(knob)

  // Arched door facing the camera (+z).
  const doorShape = new THREE.Shape()
  doorShape.moveTo(-0.13, 0)
  doorShape.lineTo(-0.13, 0.12)
  doorShape.absarc(0, 0.12, 0.13, Math.PI, 0, true)
  doorShape.lineTo(0.13, 0)
  doorShape.closePath()
  const door = mesh(new THREE.ExtrudeGeometry(doorShape, { depth: 0.04, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 3 }), MAT.door, false)
  door.position.set(0, 0.03, 0.56)
  g.add(door)

  // Wooden base plate.
  const base = mesh(new THREE.CylinderGeometry(0.78, 0.82, 0.08, 40), MAT.wood)
  base.position.y = -0.02
  g.add(base)

  // A honey drip for charm.
  const drip = mesh(new THREE.SphereGeometry(0.05, 12, 10), MAT.honey, false)
  drip.scale.set(1, 1.4, 1)
  drip.position.set(0.22, 0.5, 0.5)
  g.add(drip)
  return g
}

/** Arched door outline, `w` wide and `h` tall, standing on y = 0. */
function archShape(w: number, h: number) {
  const s = new THREE.Shape()
  const r = w / 2
  s.moveTo(-r, 0)
  s.lineTo(-r, h - r)
  s.absarc(0, h - r, r, Math.PI, 0, true)
  s.lineTo(r, 0)
  s.closePath()
  return s
}

/** A little frog facing +z: round body, bulgy eyes, rosy cheeks. */
function frogParts() {
  const parts: THREE.BufferGeometry[] = []
  const green = '#8fd07a'
  const body = new THREE.SphereGeometry(0.09, 12, 8)
  body.scale(1.1, 0.72, 1)
  paint(body, green, 0, underShade(-0.06, 0.05, 0.75))
  body.translate(0, 0.065, 0)
  parts.push(body)
  const belly = new THREE.SphereGeometry(0.07, 10, 6)
  belly.scale(1, 0.6, 0.7)
  paint(belly, '#eaf6cc', 0)
  belly.translate(0, 0.05, 0.045)
  parts.push(belly)
  for (const sx of [-1, 1]) {
    const lid = new THREE.SphereGeometry(0.032, 10, 8)
    paint(lid, green, 0, underShade(-0.03, 0.02, 0.8))
    lid.translate(sx * 0.045, 0.12, 0.03)
    const white = new THREE.SphereGeometry(0.023, 8, 6)
    paint(white, '#ffffff', 0)
    white.translate(sx * 0.047, 0.127, 0.05)
    const pupil = new THREE.SphereGeometry(0.012, 6, 5)
    paint(pupil, '#2b2320', 0)
    pupil.translate(sx * 0.048, 0.13, 0.069)
    const blush = new THREE.SphereGeometry(0.016, 6, 4)
    blush.scale(1, 0.5, 0.4)
    paint(blush, '#ff9fb4', 0)
    blush.translate(sx * 0.062, 0.078, 0.078)
    const foot = new THREE.SphereGeometry(0.03, 8, 5)
    foot.scale(1.3, 0.4, 1)
    paint(foot, '#7fc56e', 0)
    foot.translate(sx * 0.065, 0.012, 0.06)
    parts.push(lid, white, pupil, blush, foot)
  }
  return parts
}

/** Cattail reed: thin stalk with a velvety brown head. */
function reedParts(x: number, z: number, h: number, lean: number) {
  const stalk = new THREE.CylinderGeometry(0.009, 0.013, h, 5, 1, true)
  paint(stalk, '#6fb35e', 0, underShade(0, h * 0.4, 0.8))
  stalk.translate(0, h / 2, 0)
  const head = new THREE.SphereGeometry(0.026, 7, 6)
  head.scale(1, 2.6, 1)
  paint(head, '#9a6436', 0, underShade(-0.05, 0.05, 0.8))
  head.translate(0, h - 0.04, 0)
  const tip = new THREE.CylinderGeometry(0.003, 0.005, 0.05, 4)
  paint(tip, '#6fb35e', 0)
  tip.translate(0, h + 0.05, 0)
  const parts = [stalk, head, tip]
  for (const p of parts) {
    p.rotateZ(lean)
    p.translate(x, 0, z)
  }
  return parts
}

export function buildPoi(id: PoiId): THREE.Group {
  const g = new THREE.Group()
  const P = MAT.painted
  switch (id) {
    case 'signpost': {
      const parts: THREE.BufferGeometry[] = []
      const post = new THREE.CylinderGeometry(0.042, 0.055, 0.92, 8, 2)
      post.translate(0, 0.46, 0)
      parts.push(paint(post, '#8a5f3c', 0, underShade(0, 0.25, 0.75)))
      const cap = new THREE.SphereGeometry(0.058, 8, 6)
      cap.scale(1, 0.65, 1)
      cap.translate(0, 0.93, 0)
      parts.push(paint(cap, '#b88657', 0))
      // Arrow-tipped boards in three warm woods.
      const boards: [number, number, number, string][] = [[0.72, 0.4, 0, '#c99a66'], [0.56, -0.5, 0.2, '#b88657'], [0.4, 2.6, -0.15, '#d8ae7a']]
      for (const [y, rot, tilt, color] of boards) {
        const s = new THREE.Shape()
        const h = 0.055
        s.moveTo(-0.02, -h)
        s.lineTo(0.37, -h)
        s.lineTo(0.44, 0)
        s.lineTo(0.37, h)
        s.lineTo(-0.02, h)
        s.closePath()
        const b = new THREE.ExtrudeGeometry(s, { depth: 0.022, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.01, bevelSegments: 1, curveSegments: 1 })
        b.translate(0, 0, -0.011)
        paint(b, color, 0, (_x, yy) => 0.86 + 0.14 * smoothstep(yy, -h, h))
        b.rotateZ(tilt)
        b.rotateY(rot)
        b.translate(0, y, 0)
        parts.push(b)
        // A nail head where each board meets the post.
        const nail = new THREE.SphereGeometry(0.012, 5, 4)
        nail.translate(0.02, 0, 0.024)
        paint(nail, '#6b4a30', 0)
        nail.rotateZ(tilt)
        nail.rotateY(rot)
        nail.translate(0, y, 0)
        parts.push(nail)
      }
      // A few pebbles and a leafy sprout around the foot.
      for (const [x, z, r, c] of [[0.1, 0.06, 0.05, '#d8cfc2'], [-0.08, 0.09, 0.04, '#d6cedd'], [0.02, -0.1, 0.035, '#e2d6c4']] as const) {
        const pb = new THREE.SphereGeometry(r, 8, 5)
        pb.scale(1, 0.6, 0.85)
        paint(pb, c, 0, underShade(-r * 0.5, r * 0.5, 0.8))
        pb.translate(x, r * 0.2, z)
        parts.push(pb)
      }
      for (const a of [0.6, 2.4, 4.3]) {
        const lf = leafGeometry(0.1, 0.05, 0.2, 6, 4)
        paint(lf, '#86cf74', 0, (x: number) => 0.8 + 0.2 * smoothstep(x, 0, 0.07))
        lf.rotateZ(0.7)
        lf.rotateY(a)
        lf.translate(0, 0.01, 0)
        parts.push(lf)
      }
      g.add(mesh(merge(parts), P))
      break
    }
    case 'sunflower': {
      const body: THREE.BufferGeometry[] = []
      const stem = new THREE.CylinderGeometry(0.035, 0.05, 1.3, 8, 4, true)
      stem.translate(0, 0.65, 0)
      const sp = stem.getAttribute('position')
      // Curve forward so the head nods towards the viewer.
      for (let i = 0; i < sp.count; i++) sp.setZ(i, sp.getZ(i) + 0.05 * (sp.getY(i) / 1.3) ** 2)
      body.push(paint(stem, '#6fb35e', 0, underShade(0, 0.5, 0.78)))
      for (const [y, a, len] of [[0.45, 0, 0.34], [0.7, 2.8, 0.28], [0.2, 4.6, 0.24]] as const) {
        const lf = leafGeometry(len, len * 0.55, 0.35, 10, 6)
        paint(lf, '#79c46b', 0, (x: number) => 0.78 + 0.22 * smoothstep(x, 0, len * 0.6))
        lf.rotateZ(0.35)
        lf.rotateY(a)
        lf.translate(0, y, 0.05 * (y / 1.3) ** 2)
        body.push(lf)
      }
      // A ladybird resting on the big leaf.
      const bug = new THREE.SphereGeometry(0.028, 8, 5, 0, TAU, 0, Math.PI / 2)
      bug.scale(1, 0.8, 1.2)
      paint(bug, '#ff6b6b', 0)
      const bugHead = new THREE.SphereGeometry(0.014, 6, 4)
      paint(bugHead, '#3a2a2a', 0)
      bugHead.translate(0, 0.004, 0.032)
      const bugParts = [bug, bugHead]
      for (const [dx, dz] of [[0.012, 0.005], [-0.012, 0.005], [0, -0.016]] as const) {
        const dot = new THREE.SphereGeometry(0.007, 5, 3)
        paint(dot, '#3a2a2a', 0)
        dot.translate(dx, 0.021, dz)
        bugParts.push(dot)
      }
      for (const b of bugParts) {
        b.rotateY(0.8)
        b.translate(0.2, 0.43, 0.02)
        body.push(b)
      }
      g.add(mesh(merge(body), P))

      // The head: two rings of petals around a domed, darker-hearted seed disc.
      const head: THREE.BufferGeometry[] = []
      const back = new THREE.CylinderGeometry(0.2, 0.15, 0.06, 18)
      back.rotateX(Math.PI / 2)
      back.translate(0, 0, -0.035)
      head.push(paint(back, '#6fb35e', 0))
      const disc = new THREE.SphereGeometry(0.2, 18, 6, 0, TAU, 0, Math.PI / 2)
      disc.scale(1, 0.3, 1)
      disc.rotateX(Math.PI / 2)
      const dark = new THREE.Color('#5c3a1c')
      const light = new THREE.Color('#a8703a')
      head.push(paint(disc, (x, y) => dark.clone().lerp(light, smoothstep(Math.hypot(x, y), 0.03, 0.19))))
      for (const [n, r, len, color, z, off] of [[14, 0.29, 1.4, '#ffd23f', -0.01, 0], [12, 0.24, 1.15, '#ffbf2e', 0.012, 0.5]] as const) {
        for (let i = 0; i < n; i++) {
          const p = new THREE.SphereGeometry(0.1, 7, 5)
          p.scale(0.55, len, 0.22)
          paint(p, color, 0, (_x, y) => 0.85 + 0.15 * smoothstep(y, -0.1, 0.08))
          const a = ((i + off) / n) * TAU
          p.rotateZ(a - Math.PI / 2)
          p.translate(Math.cos(a) * r, Math.sin(a) * r, z)
          head.push(p)
        }
      }
      const h = mesh(merge(head), P)
      h.position.set(0, 1.32, 0.05)
      h.rotation.x = 0.45
      g.add(h)
      break
    }
    case 'pond': {
      const pads: THREE.BufferGeometry[] = []
      for (const [x, z, s, a] of [[-0.25, 0.1, 1.2, 0.3], [0.28, -0.15, 1, 2.2], [0.05, 0.35, 0.8, 4.1]] as const) {
        const pad = lilyPadGeometry(0.2 * s, '#79c46b', 0)
        pad.rotateY(a)
        pad.translate(x, 0.01, z)
        pads.push(pad)
      }
      g.add(mesh(merge(pads), P, false))
      const bits: THREE.BufferGeometry[] = []
      for (const p of lotusParts('#ffc2dc', 0)) {
        p.scale(1.5, 1.5, 1.5)
        p.translate(0.28, 0.03, -0.15)
        bits.push(p)
      }
      // A frog friend on the biggest pad (the journal mentions one).
      for (const p of frogParts()) {
        p.rotateY(0.5)
        p.translate(-0.25, 0.035, 0.1)
        bits.push(p)
      }
      bits.push(...reedParts(-0.42, -0.28, 0.46, 0.1), ...reedParts(-0.34, -0.36, 0.36, -0.12), ...reedParts(0.44, 0.2, 0.4, -0.08))
      g.add(mesh(merge(bits), P))
      break
    }
    case 'stump': {
      const parts: THREE.BufferGeometry[] = []
      const top = 0.45
      const body = lathe([[0.41, 0], [0.365, 0.035], [0.338, 0.1], [0.325, 0.28], [0.315, 0.41], [0.3, 0.44], [0.26, top], [0.19, top], [0.12, top], [0.05, top], [0.001, top]], 24)
      const bp = body.getAttribute('position')
      for (let i = 0; i < bp.count; i++) {
        const x = bp.getX(i)
        const z = bp.getZ(i)
        // Root lobes, with a gap facing +z for the door.
        const flare = Math.max(0, 1 - bp.getY(i) / 0.16) ** 1.5
        const lobe = 1 + 0.14 * flare * Math.max(0, Math.cos(5 * Math.atan2(x, z) + Math.PI)) ** 1.5
        bp.setXYZ(i, x * lobe, bp.getY(i), z * lobe)
      }
      const bark = new THREE.Color('#8a5f3c')
      const rings = [new THREE.Color('#f0d8b0'), new THREE.Color('#d9b07f')]
      paint(body, (x, y, z) => {
        if (y < top - 0.004) return bark
        // Growth rings on the cut top.
        const r = Math.hypot(x, z)
        return r > 0.28 ? bark : rings[Math.round(r / 0.07) % 2]!
      }, 0, (_x, y) => 0.75 + 0.25 * smoothstep(y, 0, 0.2))
      parts.push(body)
      // Moss cushions on top and spilling over the rim.
      parts.push(blob(0.1, 0.45, 0.05, 0.14, '#8cc97a', 0, 0.5), blob(-0.12, 0.45, -0.08, 0.11, '#9ed48a', 0, 0.5), blob(0.22, 0.4, -0.16, 0.09, '#8cc97a', 0, 0.6))
      // Shelf fungi on the side.
      for (const [a, y, r] of [[-1.3, 0.24, 0.07], [-1.05, 0.16, 0.05]] as const) {
        const f = new THREE.SphereGeometry(r, 10, 4)
        f.scale(1, 0.32, 1)
        paint(f, '#ffc59a', 0, underShade(-r * 0.3, r * 0.3, 0.75))
        f.translate(Math.sin(a) * 0.33, y, Math.cos(a) * 0.33)
        parts.push(f)
      }
      // Arched door with a lighter frame and a honey-gold knob.
      const frame = new THREE.ExtrudeGeometry(archShape(0.17, 0.2), { depth: 0.015, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 1, curveSegments: 8 })
      paint(frame, '#c99a66', 0)
      frame.translate(0, 0.02, 0.33)
      const door = new THREE.ExtrudeGeometry(archShape(0.13, 0.17), { depth: 0.015, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 1, curveSegments: 8 })
      paint(door, '#5a3a22', 0)
      door.translate(0, 0.025, 0.345)
      const knob = new THREE.SphereGeometry(0.012, 6, 4)
      paint(knob, '#ffb627', 0)
      knob.translate(0.035, 0.1, 0.372)
      parts.push(frame, door, knob)
      g.add(mesh(merge(parts), P))
      // A warm little window: someone is home.
      const win = mesh(new THREE.SphereGeometry(0.035, 10, 6), MAT.glow, false)
      win.scale.set(1, 1, 0.35)
      win.position.set(Math.sin(0.7) * 0.318, 0.3, Math.cos(0.7) * 0.318)
      win.rotation.y = 0.7
      g.add(win)
      break
    }
    case 'dandelion': {
      const green: THREE.BufferGeometry[] = []
      const fluff: THREE.BufferGeometry[] = []
      const seedDirs = fibonacciDirs(24)
      const puffs = [[0, 0, 0.55], [0.25, 0.15, 0.42], [-0.22, 0.2, 0.48], [0.1, -0.25, 0.38], [-0.28, -0.12, 0.35]] as const
      for (const [x, z, h] of puffs) {
        const st = new THREE.CylinderGeometry(0.011, 0.016, h, 5, 2, true)
        st.translate(0, h / 2, 0)
        paint(st, '#78b865', 0, underShade(0, h * 0.4, 0.8))
        st.translate(x, 0, z)
        green.push(st)
        const core = new THREE.SphereGeometry(0.045, 8, 6)
        core.translate(x, h + 0.06, z)
        fluff.push(core)
        // Each puff is a ball of tiny seeds, so its outline is soft and fuzzy.
        for (const d of seedDirs) {
          const s = new THREE.SphereGeometry(0.024, 5, 4)
          s.translate(x + d.x * 0.085, h + 0.06 + d.y * 0.085, z + d.z * 0.085)
          fluff.push(s)
        }
      }
      // Parachutes drifting off.
      for (const [x, y, z] of [[0.18, 0.78, 0.05], [-0.1, 0.9, -0.12], [0.34, 0.66, -0.2], [-0.3, 0.72, 0.18]] as const) {
        const cap = new THREE.SphereGeometry(0.022, 6, 4)
        cap.scale(1, 0.45, 1)
        cap.translate(x, y, z)
        const tail = new THREE.CylinderGeometry(0.003, 0.003, 0.045, 3)
        tail.translate(x, y - 0.025, z)
        fluff.push(cap, tail)
      }
      // Leaf rosette at the base.
      for (let i = 0; i < 7; i++) {
        const lf = leafGeometry(0.2, 0.07, 0.15, 8, 4)
        paint(lf, i % 2 ? '#7fc56e' : '#8fcf73', 0, (x: number) => 0.78 + 0.22 * smoothstep(x, 0, 0.12))
        lf.rotateZ(0.25)
        lf.rotateY((i / 7) * TAU + 0.2)
        lf.translate(0, 0.01, 0)
        green.push(lf)
      }
      // One still in bloom.
      {
        const x = 0.06
        const z = 0.32
        const h = 0.28
        const st = new THREE.CylinderGeometry(0.011, 0.015, h, 5, 1, true)
        st.translate(x, h / 2, z)
        green.push(paint(st, '#78b865', 0))
        for (let i = 0; i < 16; i++) {
          const p = new THREE.SphereGeometry(1, 5, 3)
          p.scale(0.045, 0.01, 0.012)
          paint(p, i % 2 ? '#ffd84a' : '#ffc93c', 0)
          p.translate(0.035, 0, 0)
          p.rotateZ(0.35)
          p.rotateY((i / 16) * TAU)
          p.translate(x, h + 0.01, z)
          green.push(p)
        }
        const c = new THREE.SphereGeometry(0.026, 8, 5)
        c.scale(1, 0.6, 1)
        paint(c, '#ffb627', 0)
        c.translate(x, h + 0.015, z)
        green.push(c)
      }
      g.add(mesh(merge(green), P), mesh(mergeGeometries(fluff)!, MAT.seed, false))
      for (const f of fluff) f.dispose()
      break
    }
    case 'nest': {
      const parts: THREE.BufferGeometry[] = []
      const branch = new THREE.CylinderGeometry(0.035, 0.055, 0.9, 8, 2)
      paint(branch, '#8a5f3c', 0, underShade(-0.45, -0.1, 0.78))
      branch.translate(-0.2, 0.45, -0.1)
      const arm = new THREE.CylinderGeometry(0.026, 0.036, 0.5, 8)
      paint(arm, '#8a5f3c', 0)
      arm.rotateZ(Math.PI / 2.4)
      arm.translate(0, 0.82, -0.1)
      const knot = new THREE.SphereGeometry(0.045, 8, 6)
      paint(knot, '#7a5234', 0)
      knot.translate(-0.2, 0.84, -0.1)
      parts.push(branch, arm, knot)
      for (const [x, y, a, tilt] of [[0.18, 0.88, 0.3, 0.5], [0.05, 0.84, 2.6, 0.6], [-0.2, 0.92, 1.4, 0.9]] as const) {
        const lf = leafGeometry(0.16, 0.08, 0.3, 8, 4)
        paint(lf, '#86cf74', 0, (xx: number) => 0.8 + 0.2 * smoothstep(xx, 0, 0.1))
        lf.rotateZ(tilt)
        lf.rotateY(a)
        lf.translate(x, y, -0.1)
        parts.push(lf)
      }
      // A ridged, hanging skep in lavender, like a wild cousin of the home hive.
      const y0 = 0.26
      const H = 0.52
      const radius = (t: number) => 0.21 * Math.sin(Math.PI * t ** 0.8) ** 0.8 + 0.018 * Math.sin(t * Math.PI * 5) ** 2 * Math.sin(Math.PI * t)
      const pts: [number, number][] = []
      for (let i = 0; i <= 24; i++) {
        const t = i / 24
        pts.push([Math.max(0.001, radius(t)), y0 + t * H])
      }
      const body = lathe(pts, 20)
      const base = new THREE.Color('#dcb8ea')
      const ridge = new THREE.Color('#c29cd6')
      const tmp = new THREE.Color()
      paint(body, (_x, y) => tmp.copy(ridge).lerp(base, Math.sin(((y - y0) / H) * Math.PI * 5) ** 2), 0, underShade(y0, y0 + H * 0.6, 0.78))
      body.translate(0.12, 0, -0.05)
      parts.push(body)
      const stalk = new THREE.CylinderGeometry(0.02, 0.035, 0.1, 6)
      paint(stalk, '#b58fc7', 0)
      stalk.translate(0.12, 0.8, -0.05)
      parts.push(stalk)
      // Entrance hole with a soft rim.
      const tHole = (0.44 - y0) / H
      const zHole = radius(tHole) - 0.005
      const hole = new THREE.CircleGeometry(0.045, 14)
      paint(hole, '#5a3a22', 0)
      hole.translate(0.12, 0.44, -0.05 + zHole + 0.012)
      const rim = new THREE.TorusGeometry(0.048, 0.014, 6, 16)
      paint(rim, '#b58fc7', 0)
      rim.translate(0.12, 0.44, -0.05 + zHole + 0.008)
      parts.push(hole, rim)
      g.add(mesh(merge(parts), P))
      const drip = mesh(new THREE.SphereGeometry(0.035, 10, 8), MAT.honey, false)
      drip.scale.set(1, 1.4, 1)
      drip.position.set(0.12, y0 - 0.03, -0.05)
      g.add(drip)
      break
    }
    case 'honeycomb': {
      const parts: THREE.BufferGeometry[] = []
      const r = 0.07
      const gap = 0.078
      // Chunks of real hex cells: [q, r, height, filled] per cell.
      const chunk = (cells: [number, number, number, boolean][], x: number, y: number, z: number, rx: number, ry: number, rz: number) => {
        for (const [q, rr, h, filled] of cells) {
          const cx = Math.sqrt(3) * gap * (q + rr / 2)
          const cz = 1.5 * gap * rr
          const wall = new THREE.CylinderGeometry(r, r, h, 6)
          paint(wall, '#f6c453', 0, underShade(-h / 2, h / 2, 0.72))
          wall.translate(cx, h / 2, cz)
          const cap = new THREE.CylinderGeometry(r * 0.8, r * 0.8, 0.012, 6)
          paint(cap, filled ? '#ffb020' : '#c98a2a', 0)
          cap.translate(cx, h - 0.002, cz)
          for (const p of [wall, cap]) {
            p.rotateX(rx)
            p.rotateY(ry)
            p.rotateZ(rz)
            p.translate(x, y, z)
            parts.push(p)
          }
        }
      }
      chunk([[0, 0, 0.16, true], [1, 0, 0.13, false], [0, 1, 0.15, true], [-1, 1, 0.12, true], [-1, 0, 0.14, false], [0, -1, 0.11, true], [1, -1, 0.13, true]], 0, -0.02, 0, 0.18, 0.3, 0.1)
      chunk([[0, 0, 0.12, true], [1, 0, 0.1, false], [0, 1, 0.11, true], [1, -1, 0.09, false]], 0.34, 0.04, 0.12, -0.2, 1.2, 1.1)
      chunk([[0, 0, 0.1, false], [1, 0, 0.09, true], [0, 1, 0.08, true]], -0.3, 0, 0.2, 0.5, 2.2, -0.35)
      g.add(mesh(merge(parts), P))
      // A glossy drop and a little puddle of spilled honey.
      const drop = new THREE.SphereGeometry(0.05, 12, 10)
      drop.scale(1, 1.25, 1)
      drop.translate(0.2, 0.05, 0.3)
      const puddle = new THREE.SphereGeometry(0.16, 16, 6)
      puddle.scale(1, 0.08, 0.8)
      puddle.translate(0.16, 0, 0.3)
      g.add(mesh(mergeGeometries([drop, puddle])!, MAT.honey, false))
      drop.dispose()
      puddle.dispose()
      break
    }
    case 'mist': {
      const parts: THREE.BufferGeometry[] = []
      const tones = ['#cfc6d6', '#dcd4e2', '#c6bccf']
      for (const [i, [y, r, dx]] of ([[0.1, 0.24, 0], [0.3, 0.19, 0.02], [0.47, 0.14, -0.015]] as const).entries()) {
        parts.push(blob(dx, y, 0, r, tones[i]!, 0, 0.62, 16, 10, 0.78))
      }
      for (const [x, z, r] of [[0.28, 0.1, 0.07], [-0.24, 0.18, 0.055], [0.1, -0.27, 0.05]] as const) {
        parts.push(blob(x, r * 0.3, z, r, '#d6cedd', 0, 0.6, 9, 6, 0.8))
      }
      // Moss on the bottom stone.
      parts.push(blob(-0.08, 0.17, 0.1, 0.11, '#9ed48a', 0, 0.45, 10, 6))
      g.add(mesh(merge(parts), P))
      const orb = mesh(new THREE.SphereGeometry(0.1, 20, 14), MAT.glow, false)
      orb.position.y = 0.72
      orb.name = 'orb'
      g.add(orb)
      // Tiny motes hanging around the orb.
      const motes: THREE.BufferGeometry[] = []
      for (const [a, y, d] of [[0.3, 0.62, 0.2], [1.9, 0.8, 0.22], [3.3, 0.68, 0.18], [4.6, 0.86, 0.16], [5.6, 0.58, 0.24]] as const) {
        const m = new THREE.SphereGeometry(0.018, 6, 4)
        m.translate(Math.cos(a) * d, y, Math.sin(a) * d)
        motes.push(m)
      }
      g.add(mesh(mergeGeometries(motes)!, MAT.glow, false))
      // Wisps of mist curling around the foot, lit like the clouds.
      const wisps: THREE.BufferGeometry[] = []
      for (const [x, z, r] of [[0.3, -0.1, 0.13], [-0.3, -0.12, 0.1], [0.05, 0.3, 0.09], [-0.18, 0.28, 0.07]] as const) {
        const w = new THREE.SphereGeometry(r, 10, 6)
        w.scale(1.4, 0.55, 1)
        w.translate(x, r * 0.3, z)
        wisps.push(w)
      }
      g.add(mesh(mergeGeometries(wisps)!, MAT.cloud, false))
      for (const p of [...motes, ...wisps]) p.dispose()
      break
    }
  }
  return g
}

/** Floating marker over discovered-but-unvisited points of interest. */
export function buildSparkle() {
  const g = new THREE.Group()
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), MAT.sparkle)
  gem.scale.y = 1.5
  g.add(gem)
  return g
}

/** Clouds glow softly by day; at night (n → 1) they dim and take on the moonlight. */
const CLOUD_DAY = new THREE.Color('#ffffff')
const CLOUD_NIGHT = new THREE.Color('#aab6dc')
export function setCloudNight(n: number) {
  const m = MAT.cloud as THREE.MeshStandardMaterial
  m.color.copy(CLOUD_DAY).lerp(CLOUD_NIGHT, n)
  m.emissiveIntensity = 0.25 * (1 - n) + 0.03 * n
}
