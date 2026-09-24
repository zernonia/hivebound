import * as THREE from 'three'
import { type SpeciesId, SPECIES } from '~/utils/species'
import { type BeeRig, buildBee } from './bee'

/*
 * Reusable bee models for everyone who isn't the player: wild bees, helpers on their trips,
 * and colony bees pottering about the hive. Each frame, call begin(), take() one rig per bee
 * that should be drawn (only those in view), then end() to hide the rest. Rigs are kept, so
 * the pool only grows to the most ever on screen at once.
 *
 * Building a bee (extruded eyes, tube wings, canvas textures) is slow enough to hitch a frame,
 * so each species is built once as a template and every rig is a clone sharing its geometry,
 * materials and textures. `warmBees` builds the templates and uploads their textures up front.
 */

/** Other bees are drawn smaller than the player's, so yours always stands out. */
export const OTHER_BEE_SCALE = 0.8

const templates = new Map<SpeciesId, BeeRig>()

function template(species: SpeciesId) {
  let t = templates.get(species)
  if (!t) {
    t = buildBee(SPECIES[species].look)
    templates.set(species, t)
  }
  return t
}

/** A copy of a rig that shares geometry and materials, with its handles pointing at the copy. */
function cloneRig(src: BeeRig): BeeRig {
  const root = src.root.clone()
  const map = new Map<THREE.Object3D, THREE.Object3D>()
  const a: THREE.Object3D[] = []
  const b: THREE.Object3D[] = []
  src.root.traverse(o => a.push(o))
  root.traverse(o => b.push(o))
  a.forEach((o, i) => map.set(o, b[i]!))
  const m = <T extends THREE.Object3D>(o: T) => map.get(o) as T
  return {
    root,
    body: m(src.body),
    wingL: m(src.wingL),
    wingR: m(src.wingR),
    antennae: m(src.antennae),
    eyes: src.eyes.map(m),
    anchors: {
      head: m(src.anchors.head),
      face: m(src.anchors.face),
      back: m(src.anchors.back),
      tail: m(src.anchors.tail),
    },
  }
}

/**
 * Builds every species' template and sends its textures to the GPU now, so the first time a
 * helper or wild bee flies into view costs no more than any other frame.
 */
export function warmBees(renderer: { initTexture: (texture: THREE.Texture) => unknown }) {
  for (const species of Object.keys(SPECIES) as SpeciesId[]) {
    template(species).root.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
      if (mat?.map) renderer.initTexture(mat.map)
    })
  }
}

export class BeePool {
  readonly group = new THREE.Group()
  private rigs = new Map<SpeciesId, BeeRig[]>()
  private used = new Map<SpeciesId, number>()

  begin() {
    this.used.clear()
  }

  take(species: SpeciesId): BeeRig {
    let list = this.rigs.get(species)
    if (!list) {
      list = []
      this.rigs.set(species, list)
    }
    const i = this.used.get(species) ?? 0
    if (i >= list.length) {
      const rig = cloneRig(template(species))
      rig.root.scale.setScalar(OTHER_BEE_SCALE)
      this.group.add(rig.root)
      list.push(rig)
    }
    this.used.set(species, i + 1)
    const rig = list[i]!
    rig.root.visible = true
    return rig
  }

  end() {
    for (const [species, list] of this.rigs) {
      const n = this.used.get(species) ?? 0
      for (let i = n; i < list.length; i++) list[i]!.root.visible = false
    }
  }
}

/** Shared idle / flight animation for pooled bees. `phase` keeps neighbours out of sync. */
export function animateBee(rig: BeeRig, time: number, phase: number, flying: number, reducedMotion: boolean) {
  const flap = reducedMotion ? 12 : THREE.MathUtils.lerp(26, 40, flying)
  const f = Math.sin(time * flap + phase * 10) * (reducedMotion ? 0.2 : 0.45) + 0.25
  rig.wingR.rotation.z = f
  rig.wingL.rotation.z = -f
  rig.antennae.rotation.x = reducedMotion ? 0 : Math.sin(time * 2.6 + phase * 5) * 0.1
  rig.body.rotation.x = flying * 0.25
}

const frustum = new THREE.Frustum()
const projView = new THREE.Matrix4()
const sphere = new THREE.Sphere(new THREE.Vector3(), 0.7)

/** Call once per frame before `inView`. */
export function updateFrustum(camera: THREE.Camera) {
  projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  frustum.setFromProjectionMatrix(projView)
}

/** Is a bee at this point on screen? */
export function inView(p: THREE.Vector3) {
  sphere.center.copy(p)
  return frustum.intersectsSphere(sphere)
}
