import * as THREE from 'three'
import type { Input } from '../systems/Input'
import type { Vehicle } from './Vehicle'

export type CameraMode = 'cockpit' | 'hood' | 'chase'

const MODE_ORDER: CameraMode[] = ['cockpit', 'hood', 'chase']
const MODE_LABEL: Record<CameraMode, string> = {
  cockpit: 'Driver seat',
  hood: 'Bonnet',
  chase: 'Follow',
}

/**
 * First-person camera with free look, plus two exterior views.
 *
 * In cockpit mode the camera sits at the driver's eye and the mouse (pointer
 * lock) adds a clamped yaw/pitch offset, which is how the player checks
 * mirrors and looks over their shoulder.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera
  mode: CameraMode = 'cockpit'

  private lookYaw = 0
  private lookPitch = 0
  private baseFov: number
  private readonly chasePos = new THREE.Vector3(0, 4, -10)
  private readonly tmp = new THREE.Vector3()

  constructor(aspect: number, fov = 64) {
    this.baseFov = fov
    this.camera = new THREE.PerspectiveCamera(fov, aspect, 0.05, 600)
    this.camera.rotation.order = 'YXZ'
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
  }

  /** Apply a user-selected field of view (degrees). */
  setBaseFov(fov: number): void {
    this.baseFov = THREE.MathUtils.clamp(fov, 55, 100)
  }

  /** Cycle driver seat -> bonnet -> follow. */
  cycleMode(): string {
    const index = MODE_ORDER.indexOf(this.mode)
    this.mode = MODE_ORDER[(index + 1) % MODE_ORDER.length]
    if (this.mode !== 'cockpit') {
      this.lookYaw = 0
      this.lookPitch = 0
    }
    return MODE_LABEL[this.mode]
  }

  get currentModeLabel(): string {
    return MODE_LABEL[this.mode]
  }

  /** Current cockpit look offset in radians (used for shoulder-check checks). */
  get lookAngle(): number {
    return this.lookYaw
  }

  /** Snap the view straight ahead (bound to its own key). */
  recenter(): void {
    this.lookYaw = 0
    this.lookPitch = 0
  }

  update(dt: number, vehicle: Vehicle, input: Input, sensitivity: number): void {
    const physics = vehicle.physics

    if (this.mode === 'cockpit' || this.mode === 'hood') {
      // Consume pointer-look.
      const scale = 0.0026 * sensitivity
      this.lookYaw -= input.lookX * scale
      this.lookPitch -= input.lookY * scale
      this.lookYaw = THREE.MathUtils.clamp(this.lookYaw, -2.1, 2.1)
      this.lookPitch = THREE.MathUtils.clamp(this.lookPitch, -0.75, 0.6)

      const heading = physics.yaw
      if (this.mode === 'cockpit') {
        vehicle.eyePosition(this.tmp)
        this.camera.position.copy(this.tmp)
        this.camera.rotation.set(
          this.lookPitch,
          heading + Math.PI + this.lookYaw,
          0,
          'YXZ',
        )
      } else {
        // Bonnet view: forward of the windscreen, level with the road.
        this.tmp
          .set(0, 1.28, 1.95)
          .applyAxisAngle(THREE.Object3D.DEFAULT_UP, physics.yaw)
          .add(vehicle.group.position)
        this.camera.position.copy(this.tmp)
        this.camera.rotation.set(
          this.lookPitch * 0.6,
          heading + Math.PI + this.lookYaw,
          0,
          'YXZ',
        )
      }
    } else {
      // Follow camera trails behind and above the car.
      const back = 7.5 + Math.min(physics.speed * 0.22, 3)
      this.tmp
        .set(
          -Math.sin(physics.yaw) * back,
          3.2 + physics.speed * 0.02,
          -Math.cos(physics.yaw) * back,
        )
        .add(vehicle.group.position)

      const smoothing = 1 - Math.exp(-6 * dt)
      this.chasePos.lerp(this.tmp, smoothing)
      this.camera.position.copy(this.chasePos)
      this.camera.rotation.set(0, 0, 0)
      this.camera.lookAt(
        vehicle.group.position.x,
        vehicle.group.position.y + 1.2,
        vehicle.group.position.z,
      )
    }

    // A little speed-driven field-of-view change for a sense of pace.
    const targetFov = this.baseFov + Math.min(physics.speedKmh * 0.06, 14)
    const nextFov = THREE.MathUtils.lerp(
      this.camera.fov,
      targetFov,
      1 - Math.exp(-4 * dt),
    )
    if (Math.abs(nextFov - this.camera.fov) > 0.01) {
      this.camera.fov = nextFov
      this.camera.updateProjectionMatrix()
    }
  }
}
