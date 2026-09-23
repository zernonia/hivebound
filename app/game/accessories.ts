import * as THREE from 'three'

/*
 * Accessories are plain three.js groups built around their own origin, with +Y as "up and
 * away from the bee". Attach one to an anchor on the bee rig, e.g.
 * `rig.anchors.head.add(buildCrown())`.
 */

/** A small, chunky gold crown with pearl-tipped points and a rose gem at the front. */
export function buildCrown(opts: { gold?: string, gem?: string, pearl?: string } = {}) {
  const gold = new THREE.MeshStandardMaterial({
    color: opts.gold ?? '#ffc93d',
    roughness: 0.3,
    metalness: 0.25,
    emissive: new THREE.Color('#7a4a00'),
    emissiveIntensity: 0.15,
  })
  const pearl = new THREE.MeshStandardMaterial({ color: opts.pearl ?? '#fff6e8', roughness: 0.25 })
  const gem = new THREE.MeshStandardMaterial({
    color: opts.gem ?? '#f0507a',
    roughness: 0.15,
    emissive: new THREE.Color(opts.gem ?? '#f0507a'),
    emissiveIntensity: 0.25,
  })

  const crown = new THREE.Group()
  crown.name = 'crown'
  const radius = 0.085
  const bandH = 0.045

  // Band: a thick ring with rounded rims top and bottom.
  const band = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.04, bandH, 40, 1, true), gold)
  band.material.side = THREE.DoubleSide
  band.position.y = bandH / 2
  band.castShadow = true
  const rimGeo = new THREE.TorusGeometry(radius * 1.02, 0.011, 10, 40)
  rimGeo.rotateX(Math.PI / 2)
  const rimLow = new THREE.Mesh(rimGeo, gold)
  rimLow.position.y = 0.004
  const rimHigh = new THREE.Mesh(rimGeo, gold)
  rimHigh.position.y = bandH
  rimHigh.scale.setScalar(0.98)
  crown.add(band, rimLow, rimHigh)

  // Five rounded points, each tipped with a pearl.
  const pointGeo = new THREE.ConeGeometry(0.026, 0.06, 16)
  const pearlGeo = new THREE.SphereGeometry(0.014, 14, 10)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2 // one point straight ahead (+Z)
    const x = Math.cos(a) * radius * 0.96
    const z = Math.sin(a) * radius * 0.96
    const point = new THREE.Mesh(pointGeo, gold)
    point.position.set(x, bandH + 0.028, z)
    const tip = new THREE.Mesh(pearlGeo, pearl)
    tip.position.set(x, bandH + 0.064, z)
    crown.add(point, tip)
  }

  // Rose gem on the front of the band.
  const front = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 12), gem)
  front.scale.set(1, 1.2, 0.6)
  front.position.set(0, bandH / 2, radius * 1.06)
  crown.add(front)

  // A jaunty tilt reads cuter than dead straight.
  crown.rotation.set(0.08, 0, -0.14)
  return crown
}
