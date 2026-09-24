import * as THREE from 'three'
import { type SpeciesId, SPECIES } from '~/utils/species'
import { type BeeRig, buildBee } from './bee'

/*
 * Reusable bee models for everyone who isn't the player: wild bees, helpers on their trips,
 * and colony bees pottering about the hive. Each frame, call begin(), take() one rig per bee
 * that should be drawn (only those in view), then end() to hide the rest. Rigs are built
 * lazily per species and kept, so the pool only grows to the most ever on screen at once.
 */

/** Other bees are drawn smaller than the player's, so yours always stands out. */
export const OTHER_BEE_SCALE = 0.8

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
      const rig = buildBee(SPECIES[species].look)
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
