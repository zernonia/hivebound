import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { PoiId } from '~/utils/world'

/* ------------------------------------------------------------------ */
/* Shared materials                                                   */
/* ------------------------------------------------------------------ */

const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0, ...extra })

export const MAT = {
  white: std('#ffffff', { roughness: 0.7 }), // tinted per-instance
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
/* Instanced prop kinds                                               */
/* ------------------------------------------------------------------ */

function tuftGeometry() {
  const parts: THREE.BufferGeometry[] = []
  const blades = [
    [0, 0, 0.26, 0],
    [0.06, 0.03, 0.2, 0.35],
    [-0.05, 0.04, 0.22, -0.3],
    [0.01, -0.06, 0.18, 0.15],
  ] as const
  for (const [x, z, h, tilt] of blades) {
    const g = new THREE.ConeGeometry(0.045, h, 6, 1)
    g.translate(0, h / 2, 0)
    g.rotateZ(tilt)
    g.rotateX(tilt * 0.6)
    g.translate(x, 0, z)
    parts.push(g)
  }
  return mergeGeometries(parts)!
}

function petalsGeometry() {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 5; i++) {
    const g = new THREE.SphereGeometry(0.055, 7, 5)
    g.scale(1, 0.35, 0.7)
    const a = (i / 5) * Math.PI * 2
    g.translate(Math.cos(a) * 0.055, 0, Math.sin(a) * 0.055)
    parts.push(g)
  }
  return mergeGeometries(parts)!
}

function canopyGeometry() {
  const parts: THREE.BufferGeometry[] = []
  const blobs = [
    [0, 0.5, 0, 0.34],
    [0.18, 0.4, 0.06, 0.24],
    [-0.16, 0.42, -0.04, 0.25],
    [0.02, 0.72, 0.02, 0.24],
  ] as const
  for (const [x, y, z, r] of blobs) {
    const g = new THREE.SphereGeometry(r, 14, 10)
    g.translate(x, y, z)
    parts.push(g)
  }
  return mergeGeometries(parts)!
}

function mushroomCapGeometry() {
  const g = new THREE.SphereGeometry(0.09, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)
  g.scale(1, 0.75, 1)
  g.translate(0, 0.1, 0)
  return g
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
  | 'center'
  | 'trunk'
  | 'canopy'
  | 'pebble'
  | 'lily'
  | 'mushStem'
  | 'mushCap'
  | 'cloud'

export interface PropKindDef {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  castShadow: boolean
  /** Uses per-instance colours. */
  tinted?: boolean
}

export function createPropKinds(): Record<PropKind, PropKindDef> {
  const stem = new THREE.CylinderGeometry(0.012, 0.018, 0.3, 6)
  stem.translate(0, 0.15, 0)
  const trunk = new THREE.CylinderGeometry(0.07, 0.11, 0.42, 10)
  trunk.translate(0, 0.21, 0)
  const pebble = new THREE.SphereGeometry(0.09, 8, 6)
  pebble.scale(1, 0.55, 0.8)
  const lily = new THREE.CylinderGeometry(0.2, 0.2, 0.025, 24, 1, false, 0.35, Math.PI * 2 - 0.7)
  const mushStem = new THREE.CylinderGeometry(0.03, 0.035, 0.12, 8)
  mushStem.translate(0, 0.06, 0)
  const center = new THREE.SphereGeometry(0.035, 6, 4)
  center.scale(1, 0.6, 1)
  return {
    tuft: { geometry: tuftGeometry(), material: MAT.white, castShadow: false, tinted: true },
    stem: { geometry: stem, material: MAT.stem, castShadow: false },
    petals: { geometry: petalsGeometry(), material: MAT.white, castShadow: false, tinted: true },
    center: { geometry: center, material: MAT.center, castShadow: false },
    trunk: { geometry: trunk, material: MAT.trunk, castShadow: true },
    canopy: { geometry: canopyGeometry(), material: MAT.white, castShadow: true, tinted: true },
    pebble: { geometry: pebble, material: MAT.pebble, castShadow: false },
    lily: { geometry: lily, material: MAT.lily, castShadow: false },
    mushStem: { geometry: mushStem, material: std('#fff3e3'), castShadow: false },
    mushCap: { geometry: mushroomCapGeometry(), material: MAT.white, castShadow: false, tinted: true },
    cloud: { geometry: cloudGeometry(), material: MAT.cloud, castShadow: false },
  }
}

export const FLOWER_COLORS = ['#ff9ec7', '#ffffff', '#c9a7ff', '#ffb38a', '#9fd3ff', '#ffe27a']
export const CANOPY_COLORS = ['#7cc47a', '#8fd07a', '#6fb87e', '#a3d67c']
export const MUSHROOM_COLORS = ['#ff8a80', '#ffab91', '#f48fb1']
export const TUFT_COLORS = ['#8fcf73', '#9ed97c', '#7fc56e']

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

export function buildPoi(id: PoiId): THREE.Group {
  const g = new THREE.Group()
  switch (id) {
    case 'signpost': {
      const post = mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 10), MAT.woodDark)
      post.position.y = 0.45
      g.add(post)
      const boards: [number, number, number][] = [[0.72, 0.4, 0], [0.56, -0.5, 0.2], [0.4, 2.6, -0.15]]
      for (const [y, rot, tilt] of boards) {
        const b = mesh(new THREE.BoxGeometry(0.46, 0.11, 0.035), MAT.wood)
        b.geometry.translate(0.18, 0, 0)
        b.position.y = y
        b.rotation.set(0, rot, tilt)
        g.add(b)
      }
      break
    }
    case 'sunflower': {
      const stem = mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.3, 10), MAT.stem)
      stem.position.y = 0.65
      g.add(stem)
      const leaf = mesh(new THREE.SphereGeometry(0.14, 12, 8), MAT.lily)
      leaf.scale.set(1.3, 0.2, 0.6)
      leaf.position.set(0.14, 0.45, 0)
      leaf.rotation.z = 0.4
      g.add(leaf)
      const head = new THREE.Group()
      head.position.set(0, 1.32, 0.05)
      head.rotation.x = 0.45
      const disc = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 28), MAT.sunDisc)
      disc.rotation.x = Math.PI / 2
      head.add(disc)
      const petalGeo = new THREE.SphereGeometry(0.1, 12, 8)
      petalGeo.scale(0.55, 1.4, 0.25)
      const petalMat = new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.6 })
      for (let i = 0; i < 14; i++) {
        const p = mesh(petalGeo, petalMat, false)
        const a = (i / 14) * Math.PI * 2
        p.position.set(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0)
        p.rotation.z = a - Math.PI / 2
        head.add(p)
      }
      g.add(head)
      break
    }
    case 'pond': {
      const lotusMat = new THREE.MeshStandardMaterial({ color: '#ffc2dc', roughness: 0.6 })
      for (const [x, z, s] of [[-0.25, 0.1, 1.2], [0.28, -0.15, 1], [0.05, 0.35, 0.8]] as const) {
        const pad = mesh(new THREE.CylinderGeometry(0.2 * s, 0.2 * s, 0.025, 24, 1, false, 0.35, Math.PI * 2 - 0.7), MAT.lily, false)
        pad.position.set(x, 0.02, z)
        g.add(pad)
      }
      for (let i = 0; i < 7; i++) {
        const p = mesh(new THREE.SphereGeometry(0.06, 10, 8), lotusMat, false)
        p.scale.set(0.6, 1.3, 0.6)
        const a = (i / 7) * Math.PI * 2
        p.position.set(-0.25 + Math.cos(a) * 0.05, 0.1, 0.1 + Math.sin(a) * 0.05)
        p.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5)
        g.add(p)
      }
      break
    }
    case 'stump': {
      const s = mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.42, 24), MAT.woodDark)
      s.position.y = 0.21
      g.add(s)
      const top = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 24), std('#e6c49a'))
      top.position.y = 0.43
      g.add(top)
      for (const [x, z, r] of [[0.1, 0.05, 0.14], [-0.12, -0.08, 0.11]] as const) {
        const m = mesh(new THREE.SphereGeometry(r, 16, 10), MAT.moss)
        m.scale.y = 0.5
        m.position.set(x, 0.44, z)
        g.add(m)
      }
      const door = mesh(new THREE.CircleGeometry(0.08, 20), MAT.door, false)
      door.position.set(0, 0.12, 0.39)
      door.rotation.x = -0.12
      g.add(door)
      break
    }
    case 'dandelion': {
      for (const [x, z, h] of [[0, 0, 0.55], [0.25, 0.15, 0.42], [-0.22, 0.2, 0.48], [0.1, -0.25, 0.38], [-0.28, -0.12, 0.35]] as const) {
        const st = mesh(new THREE.CylinderGeometry(0.012, 0.016, h, 6), MAT.stem, false)
        st.position.set(x, h / 2, z)
        g.add(st)
        const puff = mesh(new THREE.SphereGeometry(0.1, 16, 12), MAT.seed, false)
        puff.position.set(x, h + 0.06, z)
        g.add(puff)
      }
      break
    }
    case 'nest': {
      const branch = mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 8), MAT.woodDark)
      branch.position.set(-0.2, 0.45, -0.1)
      g.add(branch)
      const arm = mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.5, 8), MAT.woodDark)
      arm.rotation.z = Math.PI / 2.4
      arm.position.set(0.0, 0.82, -0.1)
      g.add(arm)
      const nest = mesh(new THREE.SphereGeometry(0.22, 24, 18), MAT.nest)
      nest.scale.set(1, 1.2, 1)
      nest.position.set(0.12, 0.52, -0.05)
      g.add(nest)
      for (let i = 0; i < 3; i++) {
        const band = mesh(new THREE.TorusGeometry(0.2 - Math.abs(i - 1) * 0.04, 0.025, 8, 24), MAT.nestDark, false)
        band.rotation.x = Math.PI / 2
        band.position.set(0.12, 0.4 + i * 0.12, -0.05)
        g.add(band)
      }
      const hole = mesh(new THREE.CircleGeometry(0.05, 16), MAT.door, false)
      hole.position.set(0.12, 0.45, 0.17)
      g.add(hole)
      break
    }
    case 'honeycomb': {
      const combMat = new THREE.MeshStandardMaterial({ color: '#f6c453', roughness: 0.4 })
      const cell = new THREE.CylinderGeometry(0.12, 0.12, 0.22, 6, 1, true)
      for (const [x, z, rx, rz, y] of [[0, 0, 0.2, 0.1, 0.1], [0.2, 0.1, -0.3, 0.2, 0.06], [-0.18, 0.12, 0.5, -0.2, 0.05], [0.05, -0.22, 1.2, 0.3, 0.08]] as const) {
        const c = mesh(cell, new THREE.MeshStandardMaterial({ color: '#f6c453', roughness: 0.4, side: THREE.DoubleSide }))
        c.position.set(x, y, z)
        c.rotation.set(rx, 0, rz)
        g.add(c)
      }
      const drop = mesh(new THREE.SphereGeometry(0.06, 12, 10), MAT.honey, false)
      drop.position.set(0.02, 0.04, 0.02)
      g.add(drop)
      void combMat
      break
    }
    case 'mist': {
      for (const [y, r] of [[0.1, 0.24], [0.3, 0.19], [0.47, 0.14]] as const) {
        const s = mesh(new THREE.SphereGeometry(r, 18, 12), MAT.stone)
        s.scale.y = 0.62
        s.position.y = y
        g.add(s)
      }
      const orb = mesh(new THREE.SphereGeometry(0.1, 20, 14), MAT.glow, false)
      orb.position.y = 0.72
      orb.name = 'orb'
      g.add(orb)
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
