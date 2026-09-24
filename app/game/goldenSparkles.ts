import * as THREE from 'three'
import { hexToWorld } from '~/utils/hex'
import type { Tile } from '~/utils/world'

/*
 * Golden pollen spots: a soft glowing orb with little gems circling it over each spot that
 * has pollen right now. One InstancedMesh for the orbs and one for the gems; the list only
 * changes when a spot is found, picked or sparkles again, so it's refreshed rarely.
 */

const MAX_SPOTS = 32
const GEMS_PER_SPOT = 3

export class GoldenSparkles {
  readonly group = new THREE.Group()
  private orbs: THREE.InstancedMesh
  private gems: THREE.InstancedMesh
  private halos: THREE.InstancedMesh
  private spots: THREE.Vector3[] = []
  private reducedMotion = false
  private m = new THREE.Matrix4()
  private q = new THREE.Quaternion()
  private s = new THREE.Vector3()
  private p = new THREE.Vector3()

  constructor() {
    const orbMat = new THREE.MeshStandardMaterial({
      color: '#ffd84a',
      emissive: new THREE.Color('#ffb400'),
      emissiveIntensity: 0.9,
      roughness: 0.3,
      transparent: true,
      opacity: 0.92,
    })
    this.orbs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.16, 2), orbMat, MAX_SPOTS)
    const gemMat = new THREE.MeshStandardMaterial({ color: '#fff6c9', emissive: new THREE.Color('#ffe27a'), emissiveIntensity: 1, roughness: 0.2 })
    this.gems = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.07), gemMat, MAX_SPOTS * GEMS_PER_SPOT)
    // A soft additive glow round each orb, so spots read as "something magic" rather than a badge.
    const haloMat = new THREE.MeshBasicMaterial({ color: '#ffd24a', transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false })
    this.halos = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.42, 2), haloMat, MAX_SPOTS)
    for (const mesh of [this.orbs, this.gems, this.halos]) {
      mesh.count = 0
      // Instances move every frame; skip the (stale) bounding-sphere culling.
      mesh.frustumCulled = false
      this.group.add(mesh)
    }
  }

  setReducedMotion(v: boolean) {
    this.reducedMotion = v
  }

  /** The tiles that currently have golden pollen and are discovered. */
  refresh(tiles: Tile[]) {
    this.spots = tiles.slice(0, MAX_SPOTS).map((t) => {
      const { x, z } = hexToWorld(t)
      return new THREE.Vector3(x, t.height + 0.75, z)
    })
    this.orbs.count = this.spots.length
    this.halos.count = this.spots.length
    this.gems.count = this.spots.length * GEMS_PER_SPOT
  }

  update(time: number) {
    const rm = this.reducedMotion
    this.spots.forEach((c, i) => {
      const bob = rm ? 0 : Math.sin(time * 1.8 + i) * 0.08
      const pulse = rm ? 1 : 1 + Math.sin(time * 3 + i * 2) * 0.08
      this.m.compose(this.p.copy(c).setY(c.y + bob), this.q.identity(), this.s.setScalar(pulse))
      this.orbs.setMatrixAt(i, this.m)
      this.m.compose(this.p, this.q, this.s.setScalar(rm ? 1 : 0.85 + Math.sin(time * 2.2 + i) * 0.15))
      this.halos.setMatrixAt(i, this.m)
      for (let g = 0; g < GEMS_PER_SPOT; g++) {
        const a = (rm ? 0 : time * 1.2) + i + (g / GEMS_PER_SPOT) * Math.PI * 2
        this.p.set(c.x + Math.cos(a) * 0.4, c.y + bob + Math.sin(a * 2) * 0.08, c.z + Math.sin(a) * 0.4)
        this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rm ? 0 : time * 2 + g)
        this.m.compose(this.p, this.q, this.s.setScalar(1))
        this.gems.setMatrixAt(i * GEMS_PER_SPOT + g, this.m)
      }
    })
    this.orbs.instanceMatrix.needsUpdate = true
    this.gems.instanceMatrix.needsUpdate = true
    this.halos.instanceMatrix.needsUpdate = true
  }
}
