import * as THREE from 'three'

/*
 * Fireflies: a few dozen soft glowing specks that drift around the bee after dark. Each one
 * wanders round its own home spot; homes that fall too far behind the bee are moved ahead of
 * it, so there are always fireflies nearby without simulating the whole island. One
 * additive InstancedMesh, faded in and out with the night.
 */

const COUNT = 36
/** Fireflies live within this distance of the bee. */
const RANGE = 7

interface Fly {
  home: THREE.Vector3
  phase: number
  speed: number
}

export class Fireflies {
  readonly group = new THREE.Group()
  private mesh: THREE.InstancedMesh
  private mat: THREE.MeshBasicMaterial
  private flies: Fly[] = []
  private m = new THREE.Matrix4()
  private p = new THREE.Vector3()
  private q = new THREE.Quaternion()
  private s = new THREE.Vector3()
  private placed = false

  constructor() {
    this.mat = new THREE.MeshBasicMaterial({ color: '#fff2a0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.05, 1), this.mat, COUNT)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 5
    this.group.add(this.mesh)
    for (let i = 0; i < COUNT; i++) this.flies.push({ home: new THREE.Vector3(), phase: Math.random() * 100, speed: 0.4 + Math.random() * 0.6 })
    this.group.visible = false
  }

  private respawn(f: Fly, around: THREE.Vector3, ground: number) {
    const a = Math.random() * Math.PI * 2
    const r = 1.5 + Math.random() * (RANGE - 1.5)
    f.home.set(around.x + Math.cos(a) * r, ground + 0.5 + Math.random() * 1.4, around.z + Math.sin(a) * r)
  }

  /**
   * `night` is 0 (day) to 1 (deep night); `around` is the bee. `ground` is roughly the land
   * height there, so fireflies hover over it rather than inside hills.
   */
  update(time: number, night: number, around: THREE.Vector3, ground: number, reducedMotion: boolean) {
    const shown = night > 0.35
    this.group.visible = shown
    if (!shown) {
      this.placed = false
      return
    }
    if (!this.placed) {
      for (const f of this.flies) this.respawn(f, around, ground)
      this.placed = true
    }
    // Fade in through dusk rather than popping on.
    this.mat.opacity = Math.min(1, (night - 0.35) / 0.4) * 0.9
    this.flies.forEach((f, i) => {
      if (Math.hypot(f.home.x - around.x, f.home.z - around.z) > RANGE) this.respawn(f, around, ground)
      const t = time * f.speed + f.phase
      const drift = reducedMotion ? 0 : 0.35
      this.p.set(
        f.home.x + Math.sin(t * 0.9) * drift,
        f.home.y + Math.sin(t * 1.3) * drift * 0.5,
        f.home.z + Math.cos(t * 0.7) * drift,
      )
      // Each one blinks on its own slow rhythm.
      const blink = reducedMotion ? 0.8 : Math.max(0.15, Math.sin(t * 1.7) * 0.5 + 0.5)
      this.m.compose(this.p, this.q, this.s.setScalar(blink))
      this.mesh.setMatrixAt(i, this.m)
    })
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
