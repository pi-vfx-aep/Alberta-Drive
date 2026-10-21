import * as THREE from 'three'
import { World, LANE_OFFSET, type RoadSegment, type StopPoint } from './World'
import { Vehicle, type BeamMode, type SignalSide, type VisualState } from './Vehicle'
import { CameraRig } from './CameraRig'
import { TrafficSystem } from './Traffic'
import { Instructor } from './Instructor'
import { Input } from '../systems/Input'
import { Sound } from './Sound'
import { resolveCircleAABB } from './physics'
import type { LessonDef } from '../content/alberta'
import type { HudState, RunResult, Settings, TimeOfDay } from '../types'

export type WeatherKind = 'clear' | 'rain' | 'snow' | 'fog'

export const WEATHER_GRIP: Record<WeatherKind, number> = {
  clear: 1,
  fog: 0.92,
  rain: 0.76,
  snow: 0.52,
}

const CLOCK: Record<TimeOfDay, string> = {
  dawn: '06:20',
  day: '14:30',
  dusk: '19:45',
  night: '22:10',
}

const START_MINUTES: Record<TimeOfDay, number> = {
  dawn: 6 * 60 + 20,
  day: 14 * 60 + 30,
  dusk: 19 * 60 + 45,
  night: 22 * 60 + 10,
}

export interface GameOptions {
  canvas: HTMLCanvasElement
  settings: Settings
  lesson: LessonDef | null
  weather: WeatherKind
  time: TimeOfDay
  onHud: (state: HudState) => void
  onPaused: () => void
  onFinish: (result: RunResult) => void
}

interface StopState {
  armed: boolean
  served: boolean
  timer: number
}

interface ExaminerStep {
  text: string
  when: (ctx: ExaminerContext) => boolean
}

interface ExaminerContext {
  x: number
  z: number
  road: string
  speed: number
}

const FIXED_STEP = 1 / 60

const MOCK_ROUTE: ExaminerStep[] = [
  {
    text: 'Start the engine, fasten your seatbelt and release the parking brake. When safe, pull away from the kerb.',
    when: (c) => c.speed > 5,
  },
  { text: 'Head north on Central Avenue.', when: (c) => c.z > -34 },
  {
    text: 'At the traffic lights, turn right onto Main Street when it is safe.',
    when: (c) => c.z > -14,
  },
  {
    text: 'When safe, change lanes to the left.',
    when: (c) => c.road === 'Main Street' && c.x < -8,
  },
  {
    text: 'At the stop sign, turn left when it is safe to do so.',
    when: (c) => c.road === 'Main Street' && c.x < -48,
  },
  { text: 'Continue straight ahead.', when: (c) => c.road === 'West Street' && c.z > 8 },
  {
    text: 'Find a safe place, pull over and park alongside the kerb.',
    when: (c) => c.road === 'West Street' && c.z > 30,
  },
]

/** Free-drive points of interest for the simple navigation prompt. */
const POIS: { name: string; x: number; z: number }[] = [
  { name: 'Driving school lot', x: -30, z: -30 },
  { name: 'Downtown (Main Street)', x: 0, z: 0 },
  { name: 'School zone (North Blvd)', x: -30, z: 60 },
  { name: 'Prairie Highway', x: 0, z: 200 },
]

/**
 * The whole playable game: renderer, world, vehicle, traffic, rules and HUD.
 *
 * The simulation runs on a fixed 60 Hz accumulator so the driving physics is
 * frame-rate independent; visuals and mirrors run once per animation frame.
 */
export class Game {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly rig: CameraRig
  private readonly world: World
  private readonly vehicle: Vehicle
  private readonly traffic: TrafficSystem
  private readonly input: Input
  private readonly sound: Sound
  private readonly instructor = new Instructor()
  private readonly hud: HudState
  private readonly sun: THREE.DirectionalLight
  private readonly fill: THREE.DirectionalLight
  private readonly hemi: THREE.HemisphereLight
  private readonly precipitation: THREE.Points | null

  private readonly stopStates: StopState[]
  private accumulator = 0
  private lastTime = 0
  private rafId = 0
  private paused = false
  private finished = false
  private suppressPauseEvent = false

  // --- vehicle control state ---
  private engineOn = false
  private seatbelt = false
  private handbrake = true
  private signal: SignalSide = 'off'
  private beams: BeamMode = 'off'
  private gear: 'D' | 'R' = 'D'
  private wipers = false
  private reverseHold = 0
  private forwardHold = 0
  private signalYaw = 0
  private signalCancelTimer = 0
  private gearDisplayOverride = 'P'

  // --- rule detection state ---
  private overSpeedTimer = 0
  private wrongWayTimer = 0
  private turnAccum = 0
  private prevLane: number | null = null
  private lastLookTime = -99
  private moveOffDone = false
  private wasMoving = false
  private stoppedTimer = 0
  private readonly pedYielded = new Set<number>()
  private readonly pedFailed = new Set<number>()

  // --- visual / signal bookkeeping ---
  private lastYaw = 0
  private lastTurnYaw = 0

  // --- lesson / examiner ---
  private examinerStep = 0
  private examinerStopTimer = 0
  private examinerLine = ''
  private examinerTimer = 0
  private lessonDoneTimer = 0
  private elapsed = 0

  constructor(private readonly options: GameOptions) {
    const preset = options.settings.graphics

    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      antialias: preset !== 'low',
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(
      preset === 'high'
        ? Math.min(window.devicePixelRatio, 2)
        : preset === 'medium'
          ? Math.min(window.devicePixelRatio, 1.3)
          : 1,
    )
    this.renderer.shadowMap.enabled = preset !== 'low'
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.18

    this.world = new World()
    this.scene.add(this.world.group)

    this.scene.background = new THREE.Color()
    this.scene.fog = new THREE.Fog(0xbfd3e6, 90, 460)

    this.hemi = new THREE.HemisphereLight(0xcfe2ff, 0x5c6b4a, 0.95)
    this.scene.add(this.hemi)

    // Soft bounce fill opposite the sun so shadowed sides are not pure black.
    this.fill = new THREE.DirectionalLight(0xdfe8f5, 0.55)
    this.scene.add(this.fill)
    this.scene.add(this.fill.target)

    this.sun = new THREE.DirectionalLight(0xfff2df, 1.7)
    this.sun.castShadow = preset !== 'low'
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 160
    const extent = 48
    this.sun.shadow.camera.left = -extent
    this.sun.shadow.camera.right = extent
    this.sun.shadow.camera.top = extent
    this.sun.shadow.camera.bottom = -extent
    this.sun.shadow.bias = -0.0006
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)

    const spawn = this.world.spawn
    this.vehicle = new Vehicle(spawn.x, spawn.z, spawn.yaw)
    this.scene.add(this.vehicle.group)

    this.traffic = new TrafficSystem(
      this.scene,
      this.world,
      this.world.lights,
      this.world.colliders,
      options.settings.trafficDensity,
    )

    this.input = new Input(options.canvas)
    this.sound = new Sound(options.settings.volume)
    this.rig = new CameraRig(
      options.canvas.clientWidth / Math.max(1, options.canvas.clientHeight),
      options.settings.fov,
    )

    this.stopStates = this.world.stopPoints.map(() => ({
      armed: false,
      served: false,
      timer: 0,
    }))

    this.precipitation = this.buildPrecipitation(options.weather)
    if (this.precipitation) this.scene.add(this.precipitation)

    this.applyAtmosphere()

    this.instructor.begin(options.lesson, options.settings.instructorLevel)

    this.hud = {
      speed: 0,
      limit: this.world.speedLimitAt(spawn.x, spawn.z),
      gear: 'P',
      rpm: 0,
      fuel: 1,
      engineOn: false,
      seatbelt: false,
      handbrake: true,
      signal: 'off',
      beams: 'off',
      clock: CLOCK[options.time],
      instructor: '',
      instructorSeverity: 'none',
      objectives: [],
      destination: '',
      distance: 0,
      score: 100,
      violations: 0,
    }

    if (options.lesson?.id === 'mock5') this.announce(MOCK_ROUTE[0].text)

    this.onResize()
    window.addEventListener('resize', this.onResize)
    options.canvas.addEventListener('click', this.onCanvasClick)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
  }

  /* ------------------------------ lifecycle ----------------------------- */

  start(): void {
    this.sound.unlock()
    this.lastTime = performance.now()
    this.accumulator = 0
    this.input.requestPointerLock()
    this.rafId = requestAnimationFrame(this.frame)
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused || this.finished) return
    this.paused = paused
    // Drop any presses that happened while the loop was not consuming them.
    this.input.endStep()
    if (paused) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
      this.suppressPauseEvent = true
      this.input.exitPointerLock()
      this.suppressPauseEvent = false
      this.sound.setHorn(false)
    } else {
      this.sound.unlock()
      this.lastTime = performance.now()
      this.accumulator = 0
      this.input.requestPointerLock()
      this.rafId = requestAnimationFrame(this.frame)
    }
  }

  get isPaused(): boolean {
    return this.paused
  }

  /** Low-light conditions: headlights should be on. */
  private get dark(): boolean {
    return this.options.time === 'dusk' || this.options.time === 'night'
  }

  setVolume(value: number): void {
    this.options.settings.volume = value
    this.sound.setVolume(value)
  }

  restart(): void {
    const spawn = this.world.spawn
    this.vehicle.respawn(spawn.x, spawn.z, spawn.yaw)
    this.engineOn = false
    this.seatbelt = false
    this.handbrake = true
    this.signal = 'off'
    this.beams = 'off'
    this.gear = 'D'
    this.wipers = false
    this.gearDisplayOverride = 'P'
    this.examinerStep = 0
    this.examinerStopTimer = 0
    this.examinerLine = ''
    this.examinerTimer = 0
    this.lessonDoneTimer = 0
    this.elapsed = 0
    this.overSpeedTimer = 0
    this.wrongWayTimer = 0
    this.turnAccum = 0
    this.prevLane = null
    this.moveOffDone = false
    this.wasMoving = false
    this.stoppedTimer = 0
    this.finished = false
    this.pedYielded.clear()
    this.pedFailed.clear()
    for (const state of this.stopStates) {
      state.armed = false
      state.served = false
      state.timer = 0
    }
    this.instructor.begin(this.options.lesson, this.options.settings.instructorLevel)
    if (this.options.lesson?.id === 'mock5') this.announce(MOCK_ROUTE[0].text)
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId)
    this.rafId = 0
    window.removeEventListener('resize', this.onResize)
    this.options.canvas.removeEventListener('click', this.onCanvasClick)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    this.input.dispose()
    this.sound.dispose()
    this.traffic.dispose()
    this.vehicle.dispose()
    this.world.dispose()
    if (this.precipitation) {
      this.precipitation.geometry.dispose()
      ;(this.precipitation.material as THREE.Material).dispose()
    }
    this.renderer.dispose()
  }

  /* --------------------------------- loop -------------------------------- */

  private readonly frame = (now: number): void => {
    this.rafId = requestAnimationFrame(this.frame)
    const dt = Math.min((now - this.lastTime) / 1000, 0.1)
    this.lastTime = now

    this.accumulator += dt
    let steps = 0
    while (this.accumulator >= FIXED_STEP && steps < 4) {
      this.step(FIXED_STEP)
      // Edges are single-shot: consume them as soon as one step has seen them.
      // On a frame where no step runs they stay pending instead of being lost.
      this.input.endStep()
      this.accumulator -= FIXED_STEP
      steps++
    }
    if (steps === 4) this.accumulator = 0

    this.render(dt)
    this.input.endFrame()
  }

  private step(dt: number): void {
    const p = this.vehicle.physics

    this.world.update(dt)
    this.elapsed += dt
    this.instructor.tick(dt)
    this.instructor.level = this.options.settings.instructorLevel
    this.rig.setBaseFov(this.options.settings.fov)

    // --- discrete controls (edge triggered) ---
    if (this.input.justPressed('interact')) this.toggleIgnition()
    if (this.input.justPressed('seatbelt')) this.toggleSeatbelt()
    if (this.input.justPressed('handbrake')) this.toggleHandbrake()
    if (this.input.justPressed('signalLeft')) this.setSignal('left')
    if (this.input.justPressed('signalRight')) this.setSignal('right')
    if (this.input.justPressed('headlights')) this.cycleBeams()
    if (this.input.justPressed('wipers')) this.wipers = !this.wipers
    if (this.input.justPressed('camera')) this.rig.cycleMode()
    if (this.input.justPressed('recenter')) this.rig.recenter()
    if (this.input.justPressed('recover')) this.recoverVehicle()
    if (this.input.justPressed('pause') && !this.input.pointerLocked) {
      this.options.onPaused()
      return
    }

    this.sound.setHorn(this.input.isDown('horn') && this.engineOn)

    // --- automatic transmission: swap between D and R at a standstill ---
    const throttleInput = this.input.throttle
    const brakeInput = this.input.brake
    if (this.gear === 'D') {
      if (brakeInput > 0.5 && p.speed < 0.4 && throttleInput < 0.05) {
        this.reverseHold += dt
        if (this.reverseHold > 0.4) {
          this.gear = 'R'
          this.reverseHold = 0
        }
      } else {
        this.reverseHold = 0
      }
    } else if (throttleInput > 0.5 && p.speed < 0.4 && brakeInput < 0.05) {
      this.forwardHold += dt
      if (this.forwardHold > 0.4) {
        this.gear = 'D'
        this.forwardHold = 0
      }
    } else {
      this.forwardHold = 0
    }

    // --- signal auto-cancel once the manoeuvre is complete ---
    if (this.signal !== 'off') {
      this.signalYaw += Math.abs(p.yaw - this.lastYaw)
      if (Math.abs(p.steer) < 0.06) {
        this.signalCancelTimer += dt
        if (this.signalCancelTimer > 0.5 && this.signalYaw > 0.35 && p.speed > 2) {
          this.signal = 'off'
          this.sound.click()
          this.signalYaw = 0
          this.signalCancelTimer = 0
        }
      } else {
        this.signalCancelTimer = 0
      }
    }
    this.lastYaw = p.yaw

    // --- drive the physics ---
    const grip = this.world.surfaceGrip(p.x, p.z) * WEATHER_GRIP[this.options.weather]
    const engineOn = this.engineOn && p.fuelFraction > 0.001
    p.step(
      dt,
      {
        throttle: throttleInput,
        brake: brakeInput,
        steer: this.input.steer,
        handbrake: this.handbrake,
        gear: this.gear,
      },
      grip,
      engineOn,
    )

    // --- collisions with the static world ---
    for (const box of this.world.colliders) {
      const impact = resolveCircleAABB(p, p.cfg.radius, box, 0.25)
      if (impact > 1.6) {
        this.instructor.handle({
          type: 'collision',
          impact,
          other: box.name ?? 'an obstacle',
        })
        this.sound.crash(impact)
      }
    }

    // --- traffic ---
    this.traffic.update(
      dt,
      { x: p.x, z: p.z, radius: p.cfg.radius, vx: p.vx, vz: p.vz },
      (impact, other) => {
        if (impact > 1.2) {
          this.instructor.handle({ type: 'collision', impact, other })
          this.sound.crash(impact)
        }
      },
    )

    this.detectRules(dt)
    this.updateExaminer(dt)
    this.updateAudio(dt)

    // --- lesson completion (for lessons with objectives) ---
    if (
      this.options.lesson &&
      this.options.lesson.kind === 'lesson' &&
      this.instructor.objectivesComplete
    ) {
      this.lessonDoneTimer += dt
      if (this.lessonDoneTimer > 2.2) this.finish('lesson')
    }
  }

  /* ------------------------------- rendering ----------------------------- */

  private render(dt: number): void {
    // Sync the body first so the camera reads this frame's transform.
    this.vehicle.update(dt, this.visualState())
    this.rig.update(dt, this.vehicle, this.input, this.options.settings.lookSensitivity)

    if (this.options.settings.graphics !== 'low') {
      this.vehicle.setMirrorsVisible(true)
      this.vehicle.renderMirrors(this.renderer, this.scene)
    } else {
      this.vehicle.setMirrorsVisible(false)
    }

    // Keep the shadow frustum tight around the player.
    const pos = this.vehicle.group.position
    this.sun.position.set(pos.x - 42, 70, pos.z - 28)
    this.sun.target.position.set(pos.x, 0, pos.z)
    this.sun.target.updateMatrixWorld()
    this.fill.position.set(pos.x + 34, 44, pos.z + 30)
    this.fill.target.position.set(pos.x, 0, pos.z)
    this.fill.target.updateMatrixWorld()

    if (this.precipitation) this.updatePrecipitation(dt)

    this.renderer.render(this.scene, this.rig.camera)
    this.options.onHud(this.buildHud())
  }

  private visualState(): VisualState {
    return {
      beams: this.beams,
      signal: this.signal,
      handbrake: this.handbrake,
      seatbelt: this.seatbelt,
      engineOn: this.engineOn,
      wipers: this.wipers,
      fuel: this.vehicle.physics.fuelFraction,
      night: this.dark,
    }
  }

  /* ------------------------------ rule engine ---------------------------- */

  private detectRules(dt: number): void {
    const p = this.vehicle.physics
    const fx = p.forwardX
    const fz = p.forwardZ
    const speedKmh = p.speedKmh
    const now = this.elapsed

    // Headlights when it is dark or the weather is poor.
    if (
      (this.dark || this.options.weather !== 'clear') &&
      this.beams === 'off' &&
      speedKmh > 5
    ) {
      this.instructor.handle({ type: 'lightsNeeded' })
    }

    // --- speed limit ---
    const limit = this.world.speedLimitAt(p.x, p.z)
    if (speedKmh > limit + 3) {
      this.overSpeedTimer += dt
      if (this.overSpeedTimer > 1) {
        this.instructor.handle({ type: 'speeding', limit, speed: Math.round(speedKmh) })
        this.overSpeedTimer = 0.4
      }
    } else {
      this.overSpeedTimer = 0
    }

    // --- stop signs and traffic lights ---
    const stops = this.world.stopPoints
    for (let i = 0; i < stops.length; i++) {
      const sp = stops[i]
      const state = this.stopStates[i]
      const dx = sp.x - p.x
      const dz = sp.z - p.z
      const dist = Math.hypot(dx, dz)

      if (dist > 22) {
        state.armed = false
        state.served = false
        state.timer = 0
        continue
      }

      if (dist < 7.5) {
        state.armed = true
        if (p.speed < 0.5) {
          state.timer += dt
          if (state.timer >= 0.35 && !state.served) {
            state.served = true
            if (sp.kind === 'stop') this.instructor.handle({ type: 'properStop' })
          }
        } else {
          state.timer = 0
        }
      } else if (state.armed && !state.served) {
        state.armed = false
        state.served = true
        if (sp.kind === 'stop') this.instructor.handle({ type: 'failedStop' })
      }

      if (sp.kind === 'light') {
        const ahead = dx * fx + dz * fz
        const lateral = Math.abs(dx * -fz + dz * fx)
        if (lateral < 4.5 && ahead > -2.5 && ahead < 8) {
          const phase = this.world.lights.for(sp.axis)
          // Entering the intersection while the light is still red.
          if (phase === 'red' && ahead > 0.5 && p.speed > 3) {
            this.instructor.handle({ type: 'redLight' })
          } else if (
            phase === 'yellow' &&
            ahead < -0.5 &&
            p.speed > 7 &&
            this.input.brake < 0.15
          ) {
            // Coasting through a yellow that was not even attempted.
            this.instructor.handle({ type: 'yellowLightRun' })
          }
        }
      }
    }

    // --- lane position, lane changes, wrong-side-of-road ---
    const road = this.world.roadAt(p.x, p.z)
    const offset = this.world.offsetFromCentre(p.x, p.z, fx, fz)
    if (road && offset !== null) {
      // Ignore the brief cut across the centre line while actually turning.
      if (offset < -1.8 && p.speed > 3 && Math.abs(p.steer) < 0.2) {
        this.wrongWayTimer += dt
        if (this.wrongWayTimer > 0.6) this.instructor.handle({ type: 'wrongWay' })
      } else {
        this.wrongWayTimer = 0
      }

      if (road.lanes === 4 && offset > 1.2) {
        const lane = Math.floor(offset / 3.5)
        if (this.prevLane !== null && lane !== this.prevLane && lane >= 0 && lane <= 1) {
          this.instructor.handle({
            type: 'laneChange',
            signalled: this.signal !== 'off',
            shoulderChecked: now - this.lastLookTime < 1.5,
          })
        }
        this.prevLane = lane
      } else {
        this.prevLane = null
      }
    } else {
      this.prevLane = null
    }

    // Shoulder / mirror check tracking (mouse look to the side).
    if (Math.abs(this.rig.lookAngle) > 0.5) this.lastLookTime = now

    // --- turns ---
    if (p.speed > 2 && Math.abs(p.steer) > 0.25) {
      this.turnAccum += Math.abs(p.yaw - this.lastTurnYaw)
    } else if (Math.abs(p.steer) < 0.1) {
      this.turnAccum = Math.max(0, this.turnAccum - dt * 0.6)
    }
    this.lastTurnYaw = p.yaw
    if (this.turnAccum > 0.75) {
      this.turnAccum = 0
      const side =
        this.signal === 'left' ? 'left' : this.signal === 'right' ? 'right' : 'the'
      this.instructor.handle({ type: 'turn', signalled: this.signal !== 'off', side })
    }

    // --- following distance ---
    let closestGap = Infinity
    for (const car of this.traffic.cars) {
      const cp = car.physics
      const dx = cp.x - p.x
      const dz = cp.z - p.z
      const ahead = dx * fx + dz * fz
      const lateral = Math.abs(dx * -fz + dz * fx)
      if (ahead <= 0 || ahead > 32 || lateral > 3.6) continue
      const closing = (p.vx - cp.vx) * fx + (p.vz - cp.vz) * fz
      if (closing <= 1) continue
      closestGap = Math.min(closestGap, (ahead - 4.2) / closing)
    }
    // Only judge while cruising - braking is already the correct response.
    if (this.input.brake < 0.1 && closestGap < 1.6)
      this.instructor.handle({ type: 'following', gapSeconds: Math.max(0.1, closestGap) })

    // --- pedestrians ---
    const peds = this.traffic.pedestrianStates()
    for (let i = 0; i < peds.length; i++) {
      const ped = peds[i]
      if (!ped.inCrosswalk) {
        this.pedYielded.delete(i)
        this.pedFailed.delete(i)
        continue
      }
      const dist = Math.hypot(ped.x - p.x, ped.z - p.z)
      if (dist > 11) continue
      if (p.speed > 2.5) {
        if (!this.pedFailed.has(i)) {
          this.pedFailed.add(i)
          this.instructor.handle({ type: 'yieldPed', yielded: false })
        }
      } else if (!this.pedYielded.has(i)) {
        this.pedYielded.add(i)
        this.instructor.handle({ type: 'yieldPed', yielded: true })
      }
    }

    // --- moving off, seatbelt, parking brake, off-road ---
    if (!this.moveOffDone && p.speed > 1.5) {
      this.moveOffDone = true
      this.instructor.handle({ type: 'moveOff', signalled: this.signal !== 'off' })
    }
    if (p.speed > 1 && !this.seatbelt) this.instructor.handle({ type: 'seatbeltMissing' })
    if (p.speed > 2 && this.handbrake)
      this.instructor.handle({ type: 'handbrakeDriving' })
    if (!this.world.isOnRoad(p.x, p.z)) this.instructor.handle({ type: 'offRoad' })

    // --- parallel parking check ---
    this.checkParking(dt, road)
  }

  /** Detect a completed parallel park next to the marked kerb space. */
  private checkParking(dt: number, road: RoadSegment | null): void {
    const p = this.vehicle.physics
    const space = this.world.parallelSpace
    if (!road || road.id !== 'main') {
      this.stoppedTimer = 0
      return
    }

    const dx = Math.abs(p.x - space.x)
    const dz = Math.abs(p.z - space.z)
    const aligned = Math.abs(Math.cos(p.yaw)) < 0.12
    const close = dx < space.length / 2 && dz < 2.6
    const parallel = Math.abs(p.z - road.coord) > 2.6 && p.z < road.coord

    if (this.wasMoving && p.speed < 0.4 && close && aligned && parallel) {
      this.stoppedTimer += dt
      if (this.stoppedTimer > 1.6) {
        this.stoppedTimer = -999
        this.instructor.handle({ type: 'parking', success: true, kind: 'parallel park' })
        if (this.options.lesson?.id === 'parking') this.finish('lesson')
      }
    } else if (p.speed > 1) {
      this.stoppedTimer = 0
    }

    this.wasMoving = p.speed > 1.2
  }

  /* ------------------------------- examiner ------------------------------ */

  private updateExaminer(dt: number): void {
    if (this.options.lesson?.id !== 'mock5') return
    const p = this.vehicle.physics
    const ctx: ExaminerContext = {
      x: p.x,
      z: p.z,
      road: this.world.roadNameAt(p.x, p.z),
      speed: p.speedKmh,
    }

    while (
      this.examinerStep < MOCK_ROUTE.length &&
      MOCK_ROUTE[this.examinerStep].when(ctx)
    ) {
      this.examinerStep++
      if (this.examinerStep < MOCK_ROUTE.length)
        this.announce(MOCK_ROUTE[this.examinerStep].text)
      else
        this.announce(
          'When safe, pull over and park along the kerb. Your drive is complete once stopped.',
        )
    }

    // The drive ends once the player has parked after the final instruction.
    if (this.examinerStep >= MOCK_ROUTE.length && p.speed < 0.4) {
      this.examinerStopTimer += dt
      if (this.examinerStopTimer > 2.5 && this.elapsed > 40) this.finish('mocktest')
    } else if (p.speed > 1.2) {
      this.examinerStopTimer = 0
    }
  }

  private announce(text: string): void {
    this.examinerLine = text
    this.examinerTimer = 9
  }

  /* -------------------------------- audio -------------------------------- */

  private updateAudio(dt: number): void {
    const p = this.vehicle.physics
    this.sound.updateEngine(p.rpm, p.speed, this.input.throttle, p.slip, this.engineOn)
    this.sound.updateSignal(this.signal !== 'off', dt)
    if (this.examinerTimer > 0) this.examinerTimer -= dt
  }

  /* ------------------------------- finishing ----------------------------- */

  private finish(kind: 'lesson' | 'mocktest' | 'free'): void {
    if (this.finished) return
    this.finished = true
    const title = this.options.lesson?.title ?? 'Free drive'
    const result = this.instructor.finish(kind, title)
    this.suppressPauseEvent = true
    this.input.exitPointerLock()
    this.suppressPauseEvent = false
    cancelAnimationFrame(this.rafId)
    this.rafId = 0
    this.paused = true
    this.options.onFinish(result)
  }

  /* --------------------------------- HUD --------------------------------- */

  private buildHud(): HudState {
    const p = this.vehicle.physics
    const feedback = this.instructor.liveFeedback

    this.hud.speed = Math.round(p.speedKmh)
    this.hud.limit = this.world.speedLimitAt(p.x, p.z)
    this.hud.gear = this.engineOn ? p.gearDisplay : this.gearDisplayOverride
    this.hud.rpm = Math.round(p.rpm)
    this.hud.fuel = p.fuelFraction
    this.hud.engineOn = this.engineOn
    this.hud.seatbelt = this.seatbelt
    this.hud.handbrake = this.handbrake
    this.hud.signal = this.signal
    this.hud.beams = this.beams
    this.hud.score = this.instructor.currentScore
    this.hud.violations = this.instructor.violationCount
    this.hud.objectives = this.instructor.objectives()

    const minutes = Math.floor(START_MINUTES[this.options.time] + this.elapsed * 0.6)
    this.hud.clock = `${String(Math.floor((minutes / 60) % 24)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

    if (feedback) {
      this.hud.instructor = feedback.text
      this.hud.instructorSeverity = feedback.severity
    } else if (this.examinerTimer > 0 && this.examinerLine) {
      this.hud.instructor = this.examinerLine
      this.hud.instructorSeverity = 'info'
    } else {
      this.hud.instructor = ''
      this.hud.instructorSeverity = 'none'
    }
    this.updateDestination()
    return this.hud
  }

  private updateDestination(): void {
    const p = this.vehicle.physics
    const lesson = this.options.lesson

    if (lesson?.id === 'mock5' && this.examinerTimer > 0) {
      this.hud.destination = 'Examiner'
      this.hud.distance = 0
      return
    }

    if (!lesson) {
      let best = POIS[0]
      let bestDist = Infinity
      for (const poi of POIS) {
        const d = Math.hypot(poi.x - p.x, poi.z - p.z)
        if (d < bestDist) {
          bestDist = d
          best = poi
        }
      }
      this.hud.destination = best.name
      this.hud.distance = Math.round(bestDist)
      return
    }

    switch (lesson.id) {
      case 'startup':
        this.hud.destination = 'Pull away from the kerb'
        this.hud.distance = 0
        break
      case 'stopsign': {
        let bestDist = Infinity
        for (const sp of this.world.stopPoints) {
          if (sp.kind !== 'stop') continue
          bestDist = Math.min(bestDist, Math.hypot(sp.x - p.x, sp.z - p.z))
        }
        this.hud.destination = 'Nearest stop sign'
        this.hud.distance = Math.round(bestDist)
        break
      }
      case 'lanes':
        this.hud.destination = 'Main Street (4 lanes)'
        this.hud.distance = Math.round(Math.abs(p.z - 0) + Math.abs(p.x - 0) * 0.2)
        break
      case 'parking': {
        const space = this.world.parallelSpace
        this.hud.destination = 'Parallel parking space'
        this.hud.distance = Math.round(Math.hypot(space.x - p.x, space.z - p.z))
        break
      }
      default:
        this.hud.destination = this.world.roadNameAt(p.x, p.z)
        this.hud.distance = 0
    }
  }

  /* ----------------------------- vehicle actions -------------------------- */

  /** Put the car back on the nearest road, facing the direction of travel. */
  private recoverVehicle(): void {
    const p = this.vehicle.physics
    let best: RoadSegment | null = null
    let bestDist = Infinity

    for (const road of this.world.roads) {
      const along =
        road.axis === 'z'
          ? Math.max(road.from - p.z, p.z - road.to, 0)
          : Math.max(road.from - p.x, p.x - road.to, 0)
      const across =
        road.axis === 'z' ? Math.abs(p.x - road.coord) : Math.abs(p.z - road.coord)
      const dist = along + across
      if (dist < bestDist) {
        bestDist = dist
        best = road
      }
    }
    if (!best) return

    let x: number
    let z: number
    let yaw: number
    if (best.axis === 'z') {
      x = best.coord - LANE_OFFSET
      z = THREE.MathUtils.clamp(p.z, best.from + 12, best.to - 12)
      yaw = 0 // northbound, right-hand lane
    } else {
      z = best.coord + LANE_OFFSET
      x = THREE.MathUtils.clamp(p.x, best.from + 12, best.to - 12)
      yaw = Math.PI / 2 // eastbound, right-hand lane
    }

    this.vehicle.respawn(x, z, yaw)
    this.gear = 'D'
    this.handbrake = true
    this.announce(`Recovered onto ${best.name}. Parking brake is set.`)
    this.sound.click()
  }

  private toggleIgnition(): void {
    if (this.engineOn) {
      this.engineOn = false
      this.gearDisplayOverride = 'P'
      this.sound.click()
      return
    }
    if (this.vehicle.physics.fuelFraction <= 0.001) return
    this.engineOn = true
    this.gearDisplayOverride = 'P'
    this.sound.unlock()
    this.instructor.handle({ type: 'engineStart' })
  }

  private toggleSeatbelt(): void {
    this.seatbelt = !this.seatbelt
    if (this.seatbelt) {
      this.sound.chime(1180)
      this.instructor.handle({ type: 'seatbelt' })
    }
  }

  private toggleHandbrake(): void {
    this.handbrake = !this.handbrake
    this.sound.click()
    if (!this.handbrake) this.instructor.handle({ type: 'parkingRelease' })
  }

  private setSignal(side: SignalSide): void {
    this.signal = this.signal === side ? 'off' : side
    this.signalYaw = 0
    this.signalCancelTimer = 0
    this.sound.click()
  }

  private cycleBeams(): void {
    this.beams = this.beams === 'off' ? 'low' : this.beams === 'low' ? 'high' : 'off'
    this.sound.click()
  }

  /* -------------------------------- weather ------------------------------ */

  private applyAtmosphere(): void {
    const time = this.options.time
    const weather = this.options.weather

    const skyByTime: Record<TimeOfDay, Record<WeatherKind, number>> = {
      dawn: { clear: 0xf0b98a, fog: 0xc6b4a6, rain: 0x8b8790, snow: 0xd9d1d3 },
      day: { clear: 0xa9c9e8, fog: 0xb8bec4, rain: 0x8d99a6, snow: 0xd5dde4 },
      dusk: { clear: 0xe39a63, fog: 0xb0938a, rain: 0x7a7884, snow: 0xc7c0c4 },
      night: { clear: 0x0a1018, fog: 0x0d1218, rain: 0x0b1016, snow: 0x141b24 },
    }
    const sky = skyByTime[time][weather]

    const bg = (this.scene.background as THREE.Color) ?? new THREE.Color()
    bg.setHex(sky)
    this.scene.background = bg

    const fog = this.scene.fog as THREE.Fog
    fog.color.setHex(sky)
    if (weather === 'fog') {
      fog.near = 8
      fog.far = 70
    } else if (weather === 'rain' || weather === 'snow') {
      fog.near = 40
      fog.far = 240
    } else {
      fog.near = 120
      fog.far = 520
    }

    const overcast = weather !== 'clear'
    switch (time) {
      case 'night':
        this.sun.intensity = 0.22
        this.sun.color.setHex(0x9fb6ff)
        this.hemi.intensity = 0.38
        this.hemi.color.setHex(0x2e3a56)
        this.fill.intensity = 0.12
        this.fill.color.setHex(0x4a5a78)
        this.renderer.toneMappingExposure = 1.0
        break
      case 'dawn':
      case 'dusk':
        this.sun.intensity = overcast ? 0.7 : 1.45
        this.sun.color.setHex(0xffd0a0)
        this.hemi.intensity = overcast ? 0.6 : 0.8
        this.hemi.color.setHex(0xd8cfe0)
        this.fill.intensity = 0.35
        this.fill.color.setHex(0xb9c6dd)
        this.renderer.toneMappingExposure = 1.14
        break
      default:
        this.sun.intensity = overcast ? 0.9 : 2.1
        this.sun.color.setHex(0xfff4e4)
        this.hemi.intensity = overcast ? 0.75 : 1.05
        this.hemi.color.setHex(0xcfe2ff)
        this.fill.intensity = overcast ? 0.45 : 0.6
        this.fill.color.setHex(0xdfe8f5)
        this.renderer.toneMappingExposure = 1.18
    }
  }

  private buildPrecipitation(weather: WeatherKind): THREE.Points | null {
    if (weather !== 'rain' && weather !== 'snow') return null
    const count = weather === 'rain' ? 1600 : 900
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 70
      positions[i * 3 + 1] = Math.random() * 30
      positions[i * 3 + 2] = (Math.random() - 0.5) * 70
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const material = new THREE.PointsMaterial({
      color: weather === 'rain' ? 0xa8c4e0 : 0xffffff,
      size: weather === 'rain' ? 0.12 : 0.26,
      transparent: true,
      opacity: weather === 'rain' ? 0.55 : 0.85,
      depthWrite: false,
    })
    return new THREE.Points(geometry, material)
  }

  private updatePrecipitation(dt: number): void {
    if (!this.precipitation) return
    const attribute = this.precipitation.geometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute
    const array = attribute.array as Float32Array
    const rain = this.options.weather === 'rain'
    const fall = (rain ? 26 : 4.5) * dt
    const drift = rain ? 2.5 : 1.4
    const cam = this.rig.camera.position

    for (let i = 0; i < array.length; i += 3) {
      array[i + 1] -= fall
      array[i] += Math.sin(this.elapsed * drift + i) * dt * (rain ? 1.5 : 2.4)
      if (array[i + 1] < -2) {
        array[i + 1] = 28
        array[i] = cam.x + (Math.random() - 0.5) * 70
        array[i + 2] = cam.z + (Math.random() - 0.5) * 70
      }
    }
    attribute.needsUpdate = true
    this.precipitation.position.set(0, 0, 0)
  }

  /* --------------------------------- misc --------------------------------- */

  private readonly onResize = (): void => {
    const canvas = this.options.canvas
    const width = canvas.clientWidth || window.innerWidth
    const height = canvas.clientHeight || window.innerHeight
    this.renderer.setSize(width, height, false)
    this.rig.setAspect(width / Math.max(1, height))
  }

  private readonly onCanvasClick = (): void => {
    if (this.paused || this.finished) return
    this.sound.unlock()
    this.input.requestPointerLock()
  }

  private readonly onPointerLockChange = (): void => {
    if (this.suppressPauseEvent) return
    if (!this.input.pointerLocked && !this.paused && !this.finished)
      this.options.onPaused()
  }
}

export type { StopPoint }
