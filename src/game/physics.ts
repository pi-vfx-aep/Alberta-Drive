/**
 * Arcade-sim vehicle dynamics.
 *
 * A longitudinal/lateral decomposition of velocity around the car's heading:
 * engine, brake, drag and rolling resistance act along the forward axis, while
 * lateral velocity is bled off toward zero at a rate limited by tyre grip
 * (`mu * g`). That grip clamp is what produces believable understeer instead of
 * instant, arcade-style turning.
 */

export interface VehicleConfig {
  mass: number
  wheelbase: number
  /** Max steering angle at rest (radians). */
  maxSteer: number
  /** How quickly steering angle shrinks as speed rises. */
  steerFalloff: number
  maxEngineForce: number
  maxBrakeForce: number
  maxReverseForce: number
  topSpeed: number
  reverseTopSpeed: number
  drag: number
  rolling: number
  /** Tyre friction coefficient on dry asphalt. */
  grip: number
  /** Collision radius used for world collision (metres). */
  radius: number
  length: number
  width: number
  fuelCapacity: number
}

/** Learner training sedan - deliberate, not quick. */
export const SEDAN: VehicleConfig = {
  mass: 1400,
  wheelbase: 2.7,
  maxSteer: 0.58,
  steerFalloff: 0.075,
  maxEngineForce: 5200,
  maxBrakeForce: 9000,
  maxReverseForce: 2600,
  topSpeed: 52, // ~187 km/h limited
  reverseTopSpeed: 8,
  drag: 0.42,
  rolling: 190,
  grip: 1.0,
  radius: 1.55,
  length: 4.4,
  width: 1.8,
  fuelCapacity: 55,
}

export const G = 9.81

export interface Controls {
  throttle: number
  brake: number
  steer: number
  handbrake: boolean
  gear: 'D' | 'R'
}

export interface AABB {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  /** Optional label used when reporting what was hit. */
  name?: string
}

export class VehiclePhysics {
  x = 0
  z = 0
  yaw = 0
  vx = 0
  vz = 0

  steer = 0
  /** Displayed gear: R, N, or D1-D6. */
  gearDisplay = 'N'
  rpm = 800
  fuel: number

  /** Derived per-frame values for feedback and visuals. */
  speed = 0
  speedKmh = 0
  accelLong = 0
  accelLat = 0
  wheelSpin = 0
  slip = 0

  constructor(
    readonly cfg: VehicleConfig,
    x = 0,
    z = 0,
    yaw = 0,
  ) {
    this.x = x
    this.z = z
    this.yaw = yaw
    this.fuel = cfg.fuelCapacity
  }

  get forwardX(): number {
    return Math.sin(this.yaw)
  }

  get forwardZ(): number {
    return Math.cos(this.yaw)
  }

  get rightX(): number {
    return -this.forwardZ
  }

  get rightZ(): number {
    return this.forwardX
  }

  get heading(): number {
    return this.yaw
  }

  reset(x: number, z: number, yaw: number): void {
    this.x = x
    this.z = z
    this.yaw = yaw
    this.vx = 0
    this.vz = 0
    this.steer = 0
    this.gearDisplay = 'N'
    this.rpm = 800
    this.speed = 0
    this.speedKmh = 0
    this.accelLong = 0
    this.accelLat = 0
  }

  /**
   * Advance the vehicle one fixed step.
   *
   * @param gripMultiplier Surface condition (1 = dry asphalt, ~0.35 = ice).
   * @param engineOn Whether the engine can produce force.
   */
  step(dt: number, controls: Controls, gripMultiplier: number, engineOn: boolean): void {
    const cfg = this.cfg
    const fx = this.forwardX
    const fz = this.forwardZ
    const rx = this.rightX
    const rz = this.rightZ

    let vLong = this.vx * fx + this.vz * fz
    let vLat = this.vx * rx + this.vz * rz

    const inDrive = controls.gear === 'D'
    // In D, W drives and S brakes; in R the roles swap (S reverses, W brakes).
    const drive = engineOn ? (inDrive ? controls.throttle : controls.brake) : 0
    const service = inDrive ? controls.brake : controls.throttle

    let force = 0

    if (drive > 0) {
      const maxV = inDrive ? cfg.topSpeed : cfg.reverseTopSpeed
      const base = inDrive ? cfg.maxEngineForce : cfg.maxReverseForce
      // Traction curve: strong off the line, tapering toward top speed.
      const taper = 1 - Math.min(Math.abs(vLong) / maxV, 1)
      const direction = inDrive ? 1 : -1
      // Only push the way the gear allows.
      const pushingForward = direction * vLong > -0.5
      if (pushingForward) force += direction * drive * base * (0.3 + 0.7 * taper)
    }

    if (service > 0 && Math.abs(vLong) > 0.12) {
      const dir = -Math.sign(vLong)
      force += dir * service * cfg.maxBrakeForce
    }

    if (!engineOn) {
      // Coasting with the engine off: brakes still work.
      if (service > 0 && Math.abs(vLong) > 0.12) {
        force = -Math.sign(vLong) * service * cfg.maxBrakeForce * 0.8
      } else {
        force = 0
      }
    }

    // Aerodynamic drag and rolling resistance.
    force -= cfg.drag * vLong * Math.abs(vLong)
    if (Math.abs(vLong) > 0.04) {
      force -= Math.sign(vLong) * cfg.rolling * gripMultiplier
    } else if (Math.abs(force) < cfg.rolling * 1.5) {
      // Static resistance stops the car from creeping.
      force -= vLong * cfg.mass * 4
    }

    if (controls.handbrake && Math.abs(vLong) > 0.02) {
      // ~7 m/s^2 retardation, applied through the force path so it shows up
      // in the reported acceleration and is not counted twice.
      force -= Math.sign(vLong) * cfg.mass * 7
    }

    const aLong = force / cfg.mass
    vLong += aLong * dt

    // Clamp reverse/forward travel to their limits.
    if (vLong > cfg.topSpeed) vLong = cfg.topSpeed
    if (vLong < -cfg.reverseTopSpeed) vLong = -cfg.reverseTopSpeed

    // Lateral grip: bleed lateral velocity toward zero, limited by mu*g.
    let mu = cfg.grip * gripMultiplier
    if (controls.handbrake) mu *= 0.3
    const maxLatDelta = mu * G * dt
    let dLat = -vLat
    const maxStep = maxLatDelta * cfg.mass
    // Convert the velocity change we *want* into what grip allows.
    const desiredImpulse = dLat * cfg.mass
    const allowedImpulse =
      Math.sign(desiredImpulse) * Math.min(Math.abs(desiredImpulse), maxStep)
    dLat = allowedImpulse / cfg.mass
    const beforeLat = vLat
    vLat += dLat

    this.slip = Math.abs(vLat)

    // Speed-sensitive steering with smoothing toward the requested angle.
    // The input is positive for a right turn, while growing `yaw` turns the
    // car left in this coordinate system, so the angle is negated here.
    const speedAbs = Math.abs(vLong)
    const steerMax = cfg.maxSteer / (1 + speedAbs * cfg.steerFalloff)
    const targetSteer = -controls.steer * steerMax
    const steerRate = 6 + 6 * (1 - Math.min(speedAbs / 30, 1))
    this.steer += (targetSteer - this.steer) * Math.min(1, dt * steerRate)

    const yawRate = (vLong / cfg.wheelbase) * Math.tan(this.steer)
    this.yaw += yawRate * dt

    // Rebuild world velocity from the (unchanged) heading basis.
    this.vx = fx * vLong + rx * vLat
    this.vz = fz * vLong + rz * vLat

    this.x += this.vx * dt
    this.z += this.vz * dt

    this.speed = Math.hypot(this.vx, this.vz)
    this.speedKmh = this.speed * 3.6
    this.accelLong = aLong
    this.accelLat = (vLat - beforeLat) / dt
    this.wheelSpin += (vLong / 0.33) * dt

    this.updateDrivetrain(dt, vLong, drive, engineOn)

    if (engineOn && drive > 0.1) {
      this.fuel = Math.max(0, this.fuel - dt * 0.0022 * drive)
    }
  }

  private updateDrivetrain(
    dt: number,
    vLong: number,
    drive: number,
    engineOn: boolean,
  ): void {
    const kmh = Math.abs(vLong) * 3.6
    if (vLong < -0.3) {
      this.gearDisplay = 'R'
      this.rpm = engineOn ? 1000 + Math.min(kmh / 12, 1) * 2500 + drive * 800 : 0
      return
    }
    if (kmh < 0.5 && drive < 0.05) {
      this.gearDisplay = 'N'
      this.rpm = engineOn ? 800 + drive * 400 : 0
      return
    }

    const bands: [number, number][] = [
      [0, 18],
      [18, 32],
      [32, 50],
      [50, 70],
      [70, 95],
      [95, 200],
    ]
    let index = 0
    for (let i = 0; i < bands.length; i++) {
      if (kmh >= bands[i][0] && kmh < bands[i][1]) {
        index = i
        break
      }
      index = i
    }
    const [lo, hi] = bands[index]
    const frac = Math.min(Math.max((kmh - lo) / (hi - lo), 0), 1)
    this.gearDisplay = engineOn ? `D${index + 1}` : 'N'
    this.rpm = engineOn
      ? Math.min(6400, 900 + frac * 3600 + drive * 900 + (1 - frac) * 0)
      : 0
    if (engineOn && drive < 0.05 && kmh >= 0.5) this.rpm = Math.min(this.rpm, 1600)
    void dt
  }

  /** Current fuel fraction 0..1. */
  get fuelFraction(): number {
    return this.fuel / this.cfg.fuelCapacity
  }
}

/** Push a circle out of an AABB. Returns impact speed (0 if no contact). */
export function resolveCircleAABB(
  body: { x: number; z: number; vx: number; vz: number },
  radius: number,
  box: AABB,
  restitution = 0.2,
): number {
  const nearestX = Math.max(box.minX, Math.min(body.x, box.maxX))
  const nearestZ = Math.max(box.minZ, Math.min(body.z, box.maxZ))

  const dx = body.x - nearestX
  const dz = body.z - nearestZ
  const distSq = dx * dx + dz * dz

  if (distSq >= radius * radius) return 0

  let nx: number
  let nz: number
  let penetration: number

  if (distSq > 1e-8) {
    const dist = Math.sqrt(distSq)
    nx = dx / dist
    nz = dz / dist
    penetration = radius - dist
  } else {
    // Centre is inside the box: escape through the nearest face.
    const toLeft = body.x - box.minX
    const toRight = box.maxX - body.x
    const toTop = body.z - box.minZ
    const toBottom = box.maxZ - body.z
    const min = Math.min(toLeft, toRight, toTop, toBottom)
    if (min === toLeft) {
      nx = -1
      nz = 0
      penetration = toLeft + radius
    } else if (min === toRight) {
      nx = 1
      nz = 0
      penetration = toRight + radius
    } else if (min === toTop) {
      nx = 0
      nz = -1
      penetration = toTop + radius
    } else {
      nx = 0
      nz = 1
      penetration = toBottom + radius
    }
  }

  body.x += nx * penetration
  body.z += nz * penetration

  const normalVelocity = body.vx * nx + body.vz * nz
  if (normalVelocity >= 0) return 0

  // Remove the inward component, then add a little bounce.
  body.vx -= normalVelocity * nx
  body.vz -= normalVelocity * nz
  body.vx -= -normalVelocity * restitution * nx
  body.vz -= -normalVelocity * restitution * nz

  // Scrub some speed along the surface so cars don't slide forever.
  const tangentX = -nz
  const tangentZ = nx
  const tangentVelocity = body.vx * tangentX + body.vz * tangentZ
  const scrub = tangentVelocity * 0.35
  body.vx -= scrub * tangentX
  body.vz -= scrub * tangentZ

  return -normalVelocity
}

export function circleOverlap(
  ax: number,
  az: number,
  ar: number,
  bx: number,
  bz: number,
  br: number,
): boolean {
  const dx = ax - bx
  const dz = az - bz
  const r = ar + br
  return dx * dx + dz * dz < r * r
}
