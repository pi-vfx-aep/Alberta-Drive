import * as THREE from 'three'
import {
  SEDAN,
  VehiclePhysics,
  circleOverlap,
  resolveCircleAABB,
  type AABB,
} from './physics'
import type { World, TrafficLights } from './World'

type VehicleKind = 'sedan' | 'suv' | 'bus'

interface Waypoint {
  x: number
  z: number
  /** Slow down for a corner. */
  slow?: boolean
}

const ROUTE_A: Waypoint[] = [
  { x: -50, z: 1.9 },
  { x: -1.9, z: 1.9, slow: true },
  { x: -1.9, z: 12 },
  { x: -1.9, z: 50 },
  { x: -1.9, z: 58.1, slow: true },
  { x: -14, z: 58.1 },
  { x: -50, z: 58.1 },
  { x: -58.1, z: 58.1, slow: true },
  { x: -58.1, z: 50 },
  { x: -58.1, z: 12 },
  { x: -58.1, z: 1.9, slow: true },
]

const ROUTE_B: Waypoint[] = [
  { x: 12, z: 61.9 },
  { x: 58.1, z: 61.9, slow: true },
  { x: 58.1, z: 75 },
  { x: 58.1, z: 110 },
  { x: 58.1, z: 118.1, slow: true },
  { x: 45, z: 118.1 },
  { x: 14, z: 118.1 },
  { x: 1.9, z: 118.1, slow: true },
  { x: 1.9, z: 110 },
  { x: 1.9, z: 75 },
  { x: 1.9, z: 61.9, slow: true },
  { x: 12, z: 61.9 },
]

const ROUTE_C: Waypoint[] = [
  { x: -61.9, z: -55 },
  { x: -61.9, z: -20 },
  { x: -61.9, z: -9.4, slow: true },
  { x: -61.9, z: -1.9 },
  { x: -61.9, z: 30 },
  { x: -61.9, z: 50.6, slow: true },
  { x: -61.9, z: 58.1 },
  { x: -70, z: 58.1 },
  { x: -95, z: 58.1 },
  { x: -95, z: -58.1 },
  { x: -70, z: -58.1 },
  { x: -61.9, z: -58.1, slow: true },
]

const KINDS: Record<
  VehicleKind,
  { colour: number; width: number; height: number; length: number; speed: number }
> = {
  sedan: { colour: 0xc7ccd4, width: 1.8, height: 0.6, length: 4.4, speed: 14 },
  suv: { colour: 0x2f3540, width: 1.95, height: 0.8, length: 4.8, speed: 13 },
  bus: { colour: 0xf5c518, width: 2.5, height: 1.4, length: 10.5, speed: 10 },
}

function buildVehicleMesh(kind: VehicleKind): {
  group: THREE.Group
  wheels: THREE.Mesh[]
} {
  const spec = KINDS[kind]
  const group = new THREE.Group()
  const wheels: THREE.Mesh[] = []

  const paint = new THREE.MeshStandardMaterial({
    color: spec.colour,
    roughness: 0.5,
    metalness: 0.3,
  })
  const glass = new THREE.MeshStandardMaterial({
    color: 0x12181e,
    roughness: 0.15,
    metalness: 0.2,
    transparent: true,
    opacity: 0.75,
  })
  const tyre = new THREE.MeshStandardMaterial({ color: 0x14171a, roughness: 0.95 })

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(spec.width, spec.height, spec.length),
    paint,
  )
  body.position.y = spec.height / 2 + 0.34
  body.castShadow = true
  group.add(body)

  const cabinHeight = kind === 'bus' ? spec.height * 0.7 : 0.6
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(
      spec.width * 0.9,
      cabinHeight,
      kind === 'bus' ? spec.length * 0.95 : spec.length * 0.5,
    ),
    kind === 'bus' ? paint : glass,
  )
  cabin.position.set(0, spec.height + 0.34 + cabinHeight / 2, kind === 'bus' ? 0 : -0.2)
  cabin.castShadow = true
  group.add(cabin)

  const tyreGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 14)
  const halfTrack = spec.width / 2
  const axle = spec.length * 0.32
  for (const [sx, sz] of [
    [halfTrack, axle],
    [-halfTrack, axle],
    [halfTrack, -axle],
    [-halfTrack, -axle],
  ]) {
    const wheel = new THREE.Mesh(tyreGeo, tyre)
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(sx, 0.34, sz)
    group.add(wheel)
    wheels.push(wheel)
  }

  return { group, wheels }
}

class AICar {
  readonly physics: VehiclePhysics
  readonly group: THREE.Group
  readonly wheels: THREE.Mesh[]
  readonly radius: number
  /** Human-readable label used when the instructor reports a collision. */
  readonly kindLabel: string

  private index = 1
  private waitTimer = 0
  private readonly served = new Set<string>()
  private spin = 0

  constructor(
    private readonly route: Waypoint[],
    startAt: number,
    kind: VehicleKind,
    private readonly world: World,
    private readonly lights: TrafficLights,
  ) {
    const built = buildVehicleMesh(kind)
    this.group = built.group
    this.wheels = built.wheels
    const spec = KINDS[kind]
    this.radius = kind === 'bus' ? 3.2 : 1.6
    this.kindLabel = kind === 'bus' ? 'a school bus' : kind === 'suv' ? 'an SUV' : 'a car'

    const cfg = {
      ...SEDAN,
      mass: kind === 'bus' ? 9000 : kind === 'suv' ? 1900 : 1400,
      maxEngineForce: kind === 'bus' ? 14000 : kind === 'suv' ? 6500 : 5400,
      maxBrakeForce: kind === 'bus' ? 24000 : kind === 'suv' ? 11000 : 9500,
      topSpeed: kind === 'bus' ? 24 : 40,
      grip: kind === 'suv' ? 0.94 : kind === 'bus' ? 0.85 : 1,
      radius: this.radius,
      length: spec.length,
      width: spec.width,
    }

    const start = route[startAt % route.length]
    const next = route[(startAt + 1) % route.length]
    const yaw = Math.atan2(next.x - start.x, next.z - start.z)
    this.physics = new VehiclePhysics(cfg, start.x, start.z, yaw)
    this.index = (startAt + 1) % route.length
  }

  update(dt: number, obstacles: { x: number; z: number; radius: number }[]): void {
    const p = this.physics
    const target = this.route[this.index]

    // Advance along the route.
    if (Math.hypot(target.x - p.x, target.z - p.z) < 5.5) {
      this.index = (this.index + 1) % this.route.length
    }
    const wp = this.route[this.index]

    // --- Steering toward the waypoint ---
    const desiredYaw = Math.atan2(wp.x - p.x, wp.z - p.z)
    let diff = desiredYaw - p.yaw
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    const steer = THREE.MathUtils.clamp(-diff * 2.2, -1, 1)

    // --- Target speed ---
    const limit = this.world.speedLimitAt(p.x, p.z)
    let targetSpeed = Math.min(limit * 0.82, wp.slow ? 8.5 : KINDS.sedan.speed)

    const stopControl = this.evaluateStops(this.world.stopPoints)
    if (stopControl !== null) targetSpeed = Math.min(targetSpeed, stopControl)

    if (this.waitTimer > 0) {
      this.waitTimer -= dt
      targetSpeed = 0
    }

    // --- Following distance to whatever is ahead ---
    const fx = p.forwardX
    const fz = p.forwardZ
    for (const o of obstacles) {
      const dx = o.x - p.x
      const dz = o.z - p.z
      const ahead = dx * fx + dz * fz
      const lateral = Math.abs(dx * -fz + dz * fx)
      if (ahead > 0 && ahead < 26 && lateral < 3.2) {
        const gap = ahead - o.radius - p.cfg.radius
        targetSpeed = Math.min(targetSpeed, Math.max(0, (gap - 7) * 0.75))
      }
    }

    const speedError = targetSpeed - p.speed
    const throttle = speedError > 0.4 ? THREE.MathUtils.clamp(speedError * 0.35, 0, 1) : 0
    const brake = speedError < -0.6 ? THREE.MathUtils.clamp(-speedError * 0.3, 0, 1) : 0

    p.step(
      dt,
      { throttle, brake, steer, handbrake: false, gear: 'D' },
      this.world.surfaceGrip(p.x, p.z),
      true,
    )

    this.spin += (p.speed / 0.34) * dt
    for (const wheel of this.wheels) wheel.rotation.x = this.spin

    this.group.position.set(p.x, 0, p.z)
    this.group.rotation.y = p.yaw
  }

  /**
   * Returns the speed the car should be at to service the nearest stop point
   * ahead, or `null` if there is no applicable control.
   */
  private evaluateStops(stopPoints: World['stopPoints']): number | null {
    const p = this.physics
    const fx = p.forwardX
    const fz = p.forwardZ
    const rx = -fz
    const rz = fx

    let best: { dist: number; speed: number } | null = null

    for (const sp of stopPoints) {
      const dx = sp.x - p.x
      const dz = sp.z - p.z
      const ahead = dx * fx + dz * fz
      const lateral = Math.abs(dx * rx + dz * rz)
      if (ahead < -6 || ahead > 34 || lateral > 4.5) continue

      const key = `${Math.round(sp.x)}:${Math.round(sp.z)}`

      if (sp.kind === 'stop') {
        if (this.served.has(key)) continue
      } else {
        const phase = this.lights.for(sp.axis)
        if (phase === 'green') {
          this.served.delete(key)
          continue
        }
        // Yellow: clear the stop if we are already too close to stop safely.
        if (phase === 'yellow' && ahead < 7) {
          this.served.add(key)
          continue
        }
      }

      // Decelerate smoothly toward the stop line.
      const desired = Math.max(0, (ahead - 1.2) * 0.55)
      if (best === null || ahead < best.dist) best = { dist: ahead, speed: desired }

      // Come to a full stop, hold briefly, then treat this control as served.
      if (ahead < 3.5 && p.speed < 0.6) {
        this.served.add(key)
        if (sp.kind === 'stop') this.waitTimer = 1.4
      }
      if (ahead < -8) this.served.delete(key)
    }

    return best ? best.speed : null
  }
}

interface PedDef {
  path: { x: number; z: number }[]
  crossing?: boolean
}

class Pedestrian {
  readonly group: THREE.Group
  private index = 0
  private forward = true
  private pause = 0
  private readonly legs: THREE.Object3D[] = []
  private phase = 0

  readonly position = new THREE.Vector2()

  constructor(
    def: PedDef,
    private readonly lights: TrafficLights | null,
  ) {
    const skin = new THREE.MeshStandardMaterial({ color: 0xe0b08a, roughness: 0.9 })
    const shirt = new THREE.MeshStandardMaterial({
      color: [0x3f6fbf, 0xbf4f4f, 0x4fbf7a, 0xbfb24f][Math.floor(Math.random() * 4)],
      roughness: 0.9,
    })
    const trousers = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.95 })

    this.group = new THREE.Group()
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.6, 0.26), shirt)
    torso.position.y = 1.15
    torso.castShadow = true
    this.group.add(torso)

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), skin)
    head.position.y = 1.6
    this.group.add(head)

    for (const sx of [-0.1, 0.1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.8, 0.16), trousers)
      leg.geometry.translate(0, -0.4, 0)
      leg.position.set(sx, 0.85, 0)
      this.group.add(leg)
      this.legs.push(leg)
    }

    this.path = def.path
    this.crossing = def.crossing ?? false
    if (this.crossing) this.pause = 4
    const start = this.path[0]
    this.position.set(start.x, start.z)
    this.group.position.set(start.x, 0, start.z)
  }

  private readonly path: { x: number; z: number }[]
  private readonly crossing: boolean

  /** True while the pedestrian is standing in a roadway crosswalk. */
  inCrosswalk = false

  update(dt: number, crosswalks: World['crosswalks'], speedScale: number): void {
    if (this.pause > 0) {
      this.pause -= dt
      this.animateLegs(0, dt)
      return
    }

    const target = this.path[this.index]
    const dx = target.x - this.position.x
    const dz = target.z - this.position.y
    const dist = Math.hypot(dx, dz)

    if (dist < 0.3) {
      if (this.crossing) {
        // Standing at the kerb: step out only when traffic on this road is stopped.
        const safe = this.lights ? this.lights.ns === 'red' : true
        if (safe) {
          this.index = (this.index + 1) % this.path.length
          this.pause = 0.1
        } else {
          this.pause = 1
        }
      } else if (this.forward) {
        this.forward = false
        this.index = Math.max(0, this.path.length - 1)
        this.pause = 1.5
      } else {
        this.forward = true
        this.index = 0
        this.pause = 1.5
      }
    } else {
      const step = 1.45 * speedScale * dt
      const nx = this.position.x + (dx / dist) * step
      const nz = this.position.y + (dz / dist) * step
      this.position.set(nx, nz)
      this.group.position.set(nx, 0, nz)
      this.group.rotation.y = Math.atan2(dx, dz)
      this.animateLegs(1, dt)
    }

    // Are we standing on painted crosswalk stripes?
    this.inCrosswalk = crosswalks.some(
      (c) =>
        Math.abs(this.position.x - c.x) <= c.hx + 0.6 &&
        Math.abs(this.position.y - c.z) <= c.hz + 0.6,
    )
  }

  private animateLegs(amount: number, dt: number): void {
    this.phase += dt * 7
    this.legs.forEach((leg, i) => {
      leg.rotation.x = Math.sin(this.phase + i * Math.PI) * 0.5 * amount
    })
  }
}

export interface PedState {
  x: number
  z: number
  inCrosswalk: boolean
}

export class TrafficSystem {
  readonly cars: AICar[] = []
  readonly pedestrians: Pedestrian[] = []

  constructor(
    private readonly scene: THREE.Scene,
    private readonly world: World,
    lights: TrafficLights,
    private readonly colliders: AABB[],
    density: 'low' | 'normal' | 'high' = 'normal',
  ) {
    const all: [Waypoint[], number, VehicleKind][] = [
      [ROUTE_A, 0, 'sedan'],
      [ROUTE_A, 5, 'suv'],
      [ROUTE_A, 8, 'sedan'],
      [ROUTE_B, 0, 'sedan'],
      [ROUTE_B, 6, 'bus'],
      [ROUTE_C, 0, 'suv'],
      [ROUTE_B, 3, 'sedan'],
      [ROUTE_C, 7, 'sedan'],
      [ROUTE_A, 14, 'suv'],
    ]
    const wanted = density === 'low' ? 3 : density === 'normal' ? 6 : 9
    const spawn = all.slice(0, wanted)
    for (const [route, at, kind] of spawn) {
      const car = new AICar(route, at, kind, world, lights)
      this.scene.add(car.group)
      this.cars.push(car)
    }

    const pedDefs: PedDef[] = [
      {
        path: [
          { x: -6.8, z: -50 },
          { x: -6.8, z: 50 },
        ],
      },
      {
        path: [
          { x: -55, z: 6.8 },
          { x: 55, z: 6.8 },
        ],
      },
      {
        path: [
          { x: -6.8, z: 52.6 },
          { x: 6.8, z: 52.6 },
        ],
        crossing: true,
      },
    ]
    for (const def of pedDefs) {
      const ped = new Pedestrian(def, def.crossing ? lights : null)
      this.scene.add(ped.group)
      this.pedestrians.push(ped)
    }
  }

  /**
   * Step all AI, then resolve overlaps between AI cars, the player, and the
   * static world.
   *
   * @param impact Report a collision with this magnitude (0 = none).
   */
  update(
    dt: number,
    player: { x: number; z: number; radius: number; vx: number; vz: number },
    onImpact: (speed: number, other: string) => void,
  ): void {
    const obstacles = this.cars.map((car) => ({
      x: car.physics.x,
      z: car.physics.z,
      radius: car.radius,
    }))
    obstacles.push({ x: player.x, z: player.z, radius: player.radius })

    for (const car of this.cars) {
      car.update(dt, obstacles)
    }

    // Car vs static world.
    for (const car of this.cars) {
      for (const box of this.colliders) {
        resolveCircleAABB(car.physics, car.radius, box, 0.2)
      }
    }

    // Car vs player.
    for (const car of this.cars) {
      const p = car.physics
      const dx = p.x - player.x
      const dz = p.z - player.z
      const dist = Math.hypot(dx, dz)
      const minDist = car.radius + player.radius
      if (dist > 0.0001 && dist < minDist) {
        const nx = dx / dist
        const nz = dz / dist
        const overlap = minDist - dist
        p.x += nx * overlap * 0.6
        p.z += nz * overlap * 0.6
        const relativeSpeed = Math.hypot(p.vx - player.vx, p.vz - player.vz)
        onImpact(relativeSpeed, car.kindLabel)
      }
    }

    // Car vs car (cheap n^2, only a handful of vehicles).
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i].physics
        const b = this.cars[j].physics
        const ar = this.cars[i].radius
        const br = this.cars[j].radius
        if (!circleOverlap(a.x, a.z, ar, b.x, b.z, br)) continue
        const dx = a.x - b.x
        const dz = a.z - b.z
        const dist = Math.max(0.001, Math.hypot(dx, dz))
        const overlap = ar + br - dist
        a.x += (dx / dist) * overlap * 0.5
        a.z += (dz / dist) * overlap * 0.5
        b.x -= (dx / dist) * overlap * 0.5
        b.z -= (dz / dist) * overlap * 0.5
      }
    }

    for (const ped of this.pedestrians) ped.update(dt, this.world.crosswalks, 1)
  }

  pedestrianStates(): PedState[] {
    return this.pedestrians.map((p) => ({
      x: p.position.x,
      z: p.position.y,
      inCrosswalk: p.inCrosswalk,
    }))
  }

  dispose(): void {
    for (const car of this.cars) {
      car.group.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        const material = mesh.material as THREE.Material | THREE.Material[]
        if (Array.isArray(material)) material.forEach((m) => m.dispose())
        else material?.dispose()
      })
      this.scene.remove(car.group)
    }
    for (const ped of this.pedestrians) {
      ped.group.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        const material = mesh.material as THREE.Material | THREE.Material[]
        if (Array.isArray(material)) material.forEach((m) => m.dispose())
        else material?.dispose()
      })
      this.scene.remove(ped.group)
    }
    this.cars.length = 0
    this.pedestrians.length = 0
  }
}
