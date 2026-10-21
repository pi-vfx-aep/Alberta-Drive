import * as THREE from 'three'
import { SEDAN, VehiclePhysics } from './physics'

export type BeamMode = 'off' | 'low' | 'high'
export type SignalSide = 'left' | 'right' | 'off'

export interface VisualState {
  beams: BeamMode
  signal: SignalSide
  handbrake: boolean
  seatbelt: boolean
  engineOn: boolean
  wipers: boolean
  fuel: number
  night: boolean
}

const GLASS = 0x0e1418
const BODY_COLOUR = 0x2f6fb0

/** Digital instrument cluster rendered to a canvas texture. */
class Gauges {
  readonly texture: THREE.CanvasTexture
  private readonly ctx: CanvasRenderingContext2D | null
  private readonly canvas: HTMLCanvasElement

  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.width = 512
    this.canvas.height = 256
    this.ctx = this.canvas.getContext('2d')
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.draw(0, 0, 'N', 1, {})
  }

  draw(
    rpm: number,
    kmh: number,
    gear: string,
    fuel: number,
    flags: {
      signal?: SignalSide
      beams?: BeamMode
      seatbelt?: boolean
      handbrake?: boolean
      engineOn?: boolean
      highRev?: boolean
    },
  ): void {
    const ctx = this.ctx
    if (!ctx) return
    const w = this.canvas.width
    const h = this.canvas.height

    ctx.fillStyle = '#0a0c10'
    ctx.fillRect(0, 0, w, h)

    // Tachometer (left) and speedometer (right).
    drawDial(ctx, 132, 128, 100, rpm / 1000, 8, 6.5, 'RPM x1000', flags.highRev ?? false)
    drawDial(ctx, 380, 128, 100, kmh, 220, 200, 'km/h', false)

    // Digital speed.
    ctx.fillStyle = '#e8ecf2'
    ctx.font = 'bold 54px system-ui, Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(String(Math.round(kmh)), 380, 148)

    // Gear.
    ctx.font = 'bold 40px system-ui, Arial'
    ctx.fillStyle = '#7fd0ff'
    ctx.fillText(gear, 256, 66)

    // Fuel bar.
    const fw = 96
    const fx = 256 - fw / 2
    const fy = 214
    ctx.strokeStyle = '#4a5058'
    ctx.lineWidth = 3
    ctx.strokeRect(fx, fy, fw, 14)
    ctx.fillStyle = fuel < 0.15 ? '#ff5a5a' : '#5ad07a'
    ctx.fillRect(fx + 2, fy + 2, (fw - 4) * Math.max(0, Math.min(1, fuel)), 10)
    ctx.fillStyle = '#8b929c'
    ctx.font = '13px system-ui, Arial'
    ctx.fillText(fuel < 0.15 ? 'LOW FUEL' : 'FUEL', 256, 206)

    // Warning / indicator lamps.
    drawArrow(ctx, 66, 224, '#37e08a', flags.signal === 'left', -1)
    drawArrow(ctx, 446, 224, '#37e08a', flags.signal === 'right', 1)
    drawLamp(ctx, 160, 224, flags.beams === 'high' ? '#5aa9ff' : '#3a4250', 'BEAM')
    drawLamp(ctx, 352, 224, flags.seatbelt ? '#ff5252' : '#3a4250', 'BELT')
    drawLamp(ctx, 256, 244, flags.handbrake ? '#ff5252' : '#3a4250', 'BRAKE')
    drawLamp(ctx, 60, 60, flags.engineOn ? '#3a4250' : '#ffb020', 'ENG')
    drawLamp(ctx, 452, 60, flags.beams === 'off' ? '#3a4250' : '#ffe066', 'LTS')

    this.texture.needsUpdate = true
  }
}

function drawDial(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  value: number,
  maxValue: number,
  redline: number,
  label: string,
  hot: boolean,
): void {
  const start = Math.PI * 0.75
  const sweep = Math.PI * 1.5

  ctx.beginPath()
  ctx.arc(cx, cy, r, start, start + sweep)
  ctx.strokeStyle = '#1b2028'
  ctx.lineWidth = 16
  ctx.stroke()

  const frac = Math.max(0, Math.min(1, value / maxValue))
  const redFrac = Math.max(0, Math.min(1, redline / maxValue))

  ctx.beginPath()
  ctx.arc(cx, cy, r, start, start + sweep * frac)
  ctx.strokeStyle = hot ? '#ff5252' : '#5aa9ff'
  ctx.lineWidth = 8
  ctx.stroke()

  if (redFrac < frac || hot) {
    ctx.beginPath()
    ctx.arc(cx, cy, r, start + sweep * redFrac, start + sweep * Math.max(redFrac, frac))
    ctx.strokeStyle = '#ff5252'
    ctx.lineWidth = 8
    ctx.stroke()
  }

  // Ticks.
  ctx.strokeStyle = '#6b727d'
  ctx.lineWidth = 2
  const ticks = 9
  for (let i = 0; i <= ticks; i++) {
    const a = start + (sweep * i) / ticks
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12))
    ctx.lineTo(cx + Math.cos(a) * (r - 22), cy + Math.sin(a) * (r - 22))
    ctx.stroke()
  }

  // Needle.
  const angle = start + sweep * frac
  ctx.beginPath()
  ctx.moveTo(cx - Math.cos(angle) * 14, cy - Math.sin(angle) * 14)
  ctx.lineTo(cx + Math.cos(angle) * (r - 16), cy + Math.sin(angle) * (r - 16))
  ctx.strokeStyle = '#ff9f43'
  ctx.lineWidth = 4
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, cy, 7, 0, Math.PI * 2)
  ctx.fillStyle = '#cfd6e0'
  ctx.fill()

  ctx.fillStyle = '#8b929c'
  ctx.font = '15px system-ui, Arial'
  ctx.textAlign = 'center'
  ctx.fillText(label, cx, cy + r * 0.55)
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  colour: string,
  on: boolean,
  dir: number,
): void {
  ctx.fillStyle = on ? colour : '#2b3038'
  ctx.beginPath()
  ctx.moveTo(x + dir * 16, y - 16)
  ctx.lineTo(x - dir * 4, y)
  ctx.lineTo(x + dir * 4, y)
  ctx.lineTo(x + dir * 4, y + 14)
  ctx.lineTo(x - dir * 4, y + 14)
  ctx.lineTo(x - dir * 4, y)
  ctx.lineTo(x - dir * 16, y)
  ctx.closePath()
  ctx.fill()
}

function drawLamp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  colour: string,
  text: string,
): void {
  ctx.fillStyle = colour
  ctx.beginPath()
  ctx.roundRect(x - 34, y - 11, 68, 22, 5)
  ctx.fill()
  ctx.fillStyle = '#0a0c10'
  ctx.font = 'bold 13px system-ui, Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y + 1)
  ctx.textBaseline = 'alphabetic'
}

export class Vehicle {
  readonly group = new THREE.Group()
  /** Chassis only - carries pitch/roll so the body leans independently. */
  private readonly bodyGroup = new THREE.Group()
  readonly physics: VehiclePhysics
  readonly gauges = new Gauges()

  private readonly disposables: { dispose: () => void }[] = []
  private readonly frontSteer: THREE.Group[] = []
  private readonly wheelSpin: THREE.Group[] = []
  private readonly wheelTurn = new THREE.Group()
  private wiperArm: THREE.Group | null = null
  private wiperPhase = 0

  private headlightMeshes: THREE.Mesh[] = []
  private taillightMeshes: THREE.Mesh[] = []
  private signalMeshes: Record<SignalSide, THREE.Mesh[]> = {
    left: [],
    right: [],
    off: [],
  }
  private spot: THREE.SpotLight | null = null
  private interiorLight: THREE.PointLight | null = null

  private pitch = 0
  private roll = 0

  /** Mirrors: one render target per glass. */
  private readonly mirrorSurfaces: THREE.Mesh[] = []
  private readonly mirrorCameras: THREE.PerspectiveCamera[] = []
  private readonly mirrorTargets: THREE.WebGLRenderTarget[] = []
  private mirrorFrame = 0

  constructor(
    x: number,
    z: number,
    yaw: number,
    private readonly cockpitOffset = new THREE.Vector3(0.36, 1.3, 0.08),
  ) {
    this.physics = new VehiclePhysics(SEDAN, x, z, yaw)
    this.group.add(this.bodyGroup)
    this.buildExterior()
    this.buildCockpit()
    this.buildWheels()
    this.buildLights()
    this.buildMirrors()
    this.syncTransform()
  }

  /* ---------------------------- building --------------------------- */

  private mat(
    colour: number,
    opts: THREE.MeshStandardMaterialParameters = {},
  ): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({
      color: colour,
      roughness: 0.55,
      metalness: 0.25,
      ...opts,
    })
    this.disposables.push(m)
    return m
  }

  private box(
    w: number,
    h: number,
    d: number,
    colour: number,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D,
    opts?: THREE.MeshStandardMaterialParameters,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(colour, opts))
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    this.disposables.push(mesh.geometry)
    return mesh
  }

  private buildExterior(): void {
    const b = this.bodyGroup

    // Main shell.
    this.box(1.8, 0.6, 4.4, BODY_COLOUR, 0, 0.62, 0, b)
    this.box(1.74, 0.3, 1.5, BODY_COLOUR, 0, 1.0, 1.35, b)
    this.box(1.74, 0.3, 1.3, BODY_COLOUR, 0, 1.0, -1.6, b)
    this.box(1.62, 0.14, 2.3, BODY_COLOUR, 0, 1.6, -0.15, b)
    this.box(1.84, 0.32, 0.34, 0x24282d, 0, 0.46, 2.2, b)
    this.box(1.84, 0.32, 0.3, 0x24282d, 0, 0.46, -2.2, b)
    this.box(1.5, 0.22, 0.1, 0x1a1d21, 0, 0.72, 2.24, b) // grille

    // Pillars.
    for (const sx of [-1, 1]) {
      const pillar = this.box(0.1, 0.78, 0.1, 0x1c2026, sx * 0.76, 1.3, 0.9, b)
      pillar.rotation.x = -0.5
      const rear = this.box(0.1, 0.7, 0.1, 0x1c2026, sx * 0.76, 1.28, -1.3, b)
      rear.rotation.x = 0.45
      this.box(0.06, 0.42, 0.14, 0x1c2026, sx * 0.78, 1.32, -0.15, b) // B-pillar
    }

    // Glass.
    const glassMat = this.mat(GLASS, {
      transparent: true,
      opacity: 0.55,
      roughness: 0.08,
      metalness: 0.1,
    })
    const windscreen = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.74, 0.04), glassMat)
    windscreen.position.set(0, 1.3, 1.02)
    windscreen.rotation.x = -0.5
    b.add(windscreen)
    this.disposables.push(windscreen.geometry)

    const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.66, 0.04), glassMat)
    rearGlass.position.set(0, 1.3, -1.4)
    rearGlass.rotation.x = 0.45
    b.add(rearGlass)
    this.disposables.push(rearGlass.geometry)

    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 2.1), glassMat)
      side.position.set(sx * 0.78, 1.34, -0.2)
      b.add(side)
      this.disposables.push(side.geometry)
    }

    // Door seams for a bit of shape.
    for (const sx of [-1, 1]) {
      this.box(0.04, 0.5, 0.05, 0x1c2026, sx * 0.9, 0.75, -0.1, b)
    }
  }

  private buildCockpit(): void {
    const b = this.bodyGroup
    const dark = 0x33383f

    // Dashboard and footwell.
    this.box(1.66, 0.3, 0.52, dark, 0, 0.94, 1.0, b, { roughness: 0.85, metalness: 0.05 })
    this.box(1.66, 0.26, 0.3, 0x272b31, 0, 0.68, 1.05, b, { roughness: 0.95 })
    this.box(1.66, 0.06, 0.1, 0x4a5058, 0, 1.09, 0.78, b) // dash top lip
    // Centre vents and hazard switch.
    this.box(0.36, 0.09, 0.06, 0x1c2026, 0, 1.02, 0.9, b, { metalness: 0.35 })
    this.box(0.07, 0.05, 0.05, 0xb03a2e, 0, 0.93, 0.9, b, {
      emissive: 0x5a1a12,
      emissiveIntensity: 0.6,
    })
    // Glovebox seam.
    this.box(0.52, 0.2, 0.03, 0x2c3138, -0.5, 0.8, 0.78, b)

    // Instrument cluster.
    const cluster = new THREE.Mesh(
      new THREE.PlaneGeometry(0.46, 0.23),
      new THREE.MeshBasicMaterial({ map: this.gauges.texture }),
    )
    cluster.position.set(0.36, 1.0, 0.755)
    cluster.rotation.set(-0.18, Math.PI, 0)
    b.add(cluster)
    this.disposables.push(cluster.geometry, cluster.material as THREE.Material)

    // Steering column + wheel (pivot holds the tilt, group holds the turn).
    const pivot = new THREE.Group()
    pivot.position.set(0.36, 1.0, 0.86)
    pivot.rotation.x = 0.42
    b.add(pivot)

    this.wheelTurn.position.set(0, 0, 0)
    pivot.add(this.wheelTurn)

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.205, 0.031, 12, 48),
      this.mat(0x3a414a, { roughness: 0.62, metalness: 0.2 }),
    )
    rim.rotation.y = Math.PI
    this.wheelTurn.add(rim)
    this.disposables.push(rim.geometry)

    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI * 2) / 3
      const spoke = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.19, 0.028),
        this.mat(0x454c56, { roughness: 0.6, metalness: 0.15 }),
      )
      spoke.position.set(Math.sin(angle) * 0.1, Math.cos(angle) * 0.1, 0)
      spoke.rotation.z = -angle
      this.wheelTurn.add(spoke)
      this.disposables.push(spoke.geometry)
    }

    // Top-of-wheel marker so rotation is obvious at a glance.
    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.034, 0.038),
      this.mat(0xd9553f, { emissive: 0x6a1c10, emissiveIntensity: 0.5, roughness: 0.5 }),
    )
    marker.position.set(0, 0.205, 0)
    this.wheelTurn.add(marker)
    this.disposables.push(marker.geometry)

    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.058, 0.058, 0.045, 18),
      this.mat(0x4a515b, { roughness: 0.6, metalness: 0.2 }),
    )
    hub.rotation.x = Math.PI / 2
    this.wheelTurn.add(hub)
    this.disposables.push(hub.geometry)

    // Column shroud and indicator/wiper stalks.
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.3), this.mat(dark))
    column.position.set(0.36, 0.98, 1.04)
    column.rotation.x = 0.42
    b.add(column)
    this.disposables.push(column.geometry)

    for (const sx of [-1, 1]) {
      const stalk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.17, 8),
        this.mat(0x363c44, { roughness: 0.7 }),
      )
      stalk.rotation.set(0, 0, Math.PI / 2)
      stalk.position.set(0.36 + sx * 0.17, 1.0, 1.0)
      b.add(stalk)
      this.disposables.push(stalk.geometry)
    }

    // Centre console, gear lever, handbrake.
    this.box(0.42, 0.3, 1.1, 0x272c33, 0.0, 0.7, 0.15, b, { roughness: 0.9 })
    const lever = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.05, 0.24, 10),
      this.mat(0x3a414a),
    )
    lever.position.set(0.0, 0.98, 0.5)
    lever.rotation.x = -0.2
    b.add(lever)
    this.disposables.push(lever.geometry)
    const grip = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 12, 10),
      this.mat(0x1d2127),
    )
    grip.position.set(0.0, 1.1, 0.47)
    b.add(grip)
    this.disposables.push(grip.geometry)
    const brakeLever = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, 0.4),
      this.mat(0x3a414a),
    )
    brakeLever.position.set(0.26, 0.9, 0.1)
    brakeLever.rotation.x = -0.25
    b.add(brakeLever)
    this.disposables.push(brakeLever.geometry)

    // Pedals.
    const brakePedal = this.box(0.11, 0.17, 0.05, 0x6c737c, 0.3, 0.42, 1.24, b, {
      metalness: 0.6,
    })
    brakePedal.rotation.x = -0.25
    const accelPedal = this.box(0.09, 0.2, 0.05, 0x6c737c, 0.52, 0.4, 1.26, b, {
      metalness: 0.6,
    })
    accelPedal.rotation.x = -0.3

    // Seats.
    for (const sx of [0.4, -0.4]) {
      this.box(0.5, 0.12, 0.5, 0x353b44, sx, 0.66, -0.3, b, { roughness: 0.95 })
      const back = this.box(0.5, 0.6, 0.12, 0x353b44, sx, 0.98, -0.58, b, {
        roughness: 0.95,
      })
      back.rotation.x = -0.15
      this.box(0.3, 0.16, 0.1, 0x353b44, sx, 1.32, -0.6, b, { roughness: 0.95 })
    }

    // Door cards and roof lining.
    for (const sx of [-1, 1]) {
      this.box(0.06, 0.44, 2.2, 0x3b424c, sx * 0.84, 0.98, 0.0, b, { roughness: 0.95 })
      // Inner door handle.
      this.box(0.03, 0.05, 0.14, 0x9aa3ad, sx * 0.8, 1.06, 0.25, b, {
        metalness: 0.7,
        roughness: 0.35,
      })
    }
    this.box(1.58, 0.06, 2.2, 0x4b525b, 0, 1.55, -0.15, b, { roughness: 1 })

    // Rear-view mirror.
    const rvBody = this.box(0.36, 0.11, 0.05, 0x111418, 0, 1.5, 0.74, b)
    void rvBody

    // Windscreen wipers (parked at the base of the glass).
    for (const sx of [0.45, -0.45]) {
      const arm = new THREE.Group()
      arm.position.set(sx, 1.11, 1.2)
      arm.rotation.x = -0.5
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.6, 0.02),
        this.mat(0x0e1114, { roughness: 0.9 }),
      )
      blade.position.set(0, 0.3, 0.03)
      arm.add(blade)
      this.disposables.push(blade.geometry)
      b.add(arm)
      if (sx > 0) this.wiperArm = arm
      else arm.visible = true
    }
  }

  private buildWheels(): void {
    const tyreMat = this.mat(0x14171a, { roughness: 0.95, metalness: 0 })
    const rimMat = this.mat(0xb9c0c9, { roughness: 0.35, metalness: 0.7 })
    const tyreGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.22, 20)
    const rimGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.23, 14)
    this.disposables.push(tyreGeo, rimGeo)

    const positions: [number, number, boolean][] = [
      [0.85, 1.42, true],
      [-0.85, 1.42, true],
      [0.85, -1.45, false],
      [-0.85, -1.45, false],
    ]

    for (const [x, z, isFront] of positions) {
      const steerGroup = new THREE.Group()
      steerGroup.position.set(x, 0.33, z)
      this.group.add(steerGroup)

      const spinGroup = new THREE.Group()
      steerGroup.add(spinGroup)

      const tyre = new THREE.Mesh(tyreGeo, tyreMat)
      tyre.rotation.z = Math.PI / 2
      spinGroup.add(tyre)
      const rim = new THREE.Mesh(rimGeo, rimMat)
      rim.rotation.z = Math.PI / 2
      spinGroup.add(rim)

      this.wheelSpin.push(spinGroup)
      if (isFront) this.frontSteer.push(steerGroup)
    }
  }

  private buildLights(): void {
    const b = this.bodyGroup

    const headMat = this.mat(0xfff6e0, { emissive: 0xfff2d0, emissiveIntensity: 0 })
    const tailMat = this.mat(0xd21f2a, { emissive: 0xff2233, emissiveIntensity: 0.35 })
    this.disposables.push(headMat, tailMat)

    for (const sx of [-0.62, 0.62]) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.08), headMat)
      head.position.set(sx, 0.86, 2.2)
      b.add(head)
      this.headlightMeshes.push(head)
      this.disposables.push(head.geometry)

      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.08), tailMat)
      tail.position.set(sx, 0.9, -2.2)
      b.add(tail)
      this.taillightMeshes.push(tail)
      this.disposables.push(tail.geometry)
    }

    // Turn-signal repeaters.
    for (const [side, sx] of [
      ['left', 1],
      ['right', -1],
    ] as const) {
      const mat = this.mat(0xff8a1e, { emissive: 0xff8a1e, emissiveIntensity: 0 })
      for (const z of [2.18, -2.18]) {
        const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.06), mat)
        bulb.position.set(sx * 0.8, 0.9, z)
        b.add(bulb)
        this.signalMeshes[side].push(bulb)
        this.disposables.push(bulb.geometry)
      }
    }

    // Headlight beam.
    const spot = new THREE.SpotLight(0xfff2d8, 0, 70, 0.55, 0.55, 1.2)
    spot.position.set(0, 0.9, 2.2)
    const target = new THREE.Object3D()
    target.position.set(0, -1.2, 30)
    this.group.add(target)
    spot.target = target
    this.group.add(spot)
    this.spot = spot

    // Cabin light so the interior reads clearly day and night.
    const cabin = new THREE.PointLight(0xffe9cc, 0.5, 5, 1.6)
    cabin.position.set(0.35, 1.44, 0.25)
    this.bodyGroup.add(cabin)
    this.interiorLight = cabin
  }

  private buildMirrors(): void {
    const make = (
      x: number,
      y: number,
      z: number,
      yaw: number,
      pitch: number,
      w: number,
      h: number,
      rw: number,
      rh: number,
    ): void => {
      const rt = new THREE.WebGLRenderTarget(rw, rh, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: true,
      })
      this.mirrorTargets.push(rt)

      const camera = new THREE.PerspectiveCamera(46, rw / rh, 0.1, 400)
      camera.position.set(x, y, z)
      camera.rotation.set(pitch, yaw, 0, 'YXZ')
      this.group.add(camera)
      this.mirrorCameras.push(camera)

      const surface = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: rt.texture }),
      )
      surface.position.set(x, y, z - 0.03)
      surface.rotation.set(pitch, yaw, 0, 'YXZ')
      this.bodyGroup.add(surface)
      this.mirrorSurfaces.push(surface)
      this.disposables.push(surface.geometry, surface.material as THREE.Material)
    }

    // Rear-view (centre of the windscreen) and both wing mirrors.
    make(0, 1.5, 0.7, Math.PI, 0, 0.34, 0.1, 384, 112)
    make(1.0, 1.16, 1.5, Math.PI + 0.5, -0.12, 0.24, 0.15, 256, 160)
    make(-1.0, 1.16, 1.5, Math.PI - 0.5, -0.12, 0.24, 0.15, 256, 160)
  }

  /* ----------------------------- update ---------------------------- */

  /** Reset to a spawn pose, keeping the vehicle's runtime state consistent. */
  respawn(x: number, z: number, yaw: number): void {
    this.physics.reset(x, z, yaw)
    this.physics.fuel = SEDAN.fuelCapacity
    this.syncTransform()
  }

  /** Local eye position of the driver, in world space. */
  eyePosition(out = new THREE.Vector3()): THREE.Vector3 {
    return out
      .copy(this.cockpitOffset)
      .applyQuaternion(this.group.quaternion)
      .add(this.group.position)
  }

  update(dt: number, visual: VisualState): void {
    const p = this.physics
    this.syncTransform()

    // Body leans under braking/acceleration and cornering.
    const targetPitch = Math.max(-0.05, Math.min(0.05, -p.accelLong * 0.011))
    const targetRoll = Math.max(-0.07, Math.min(0.07, -p.accelLat * 0.006))
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 5)
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 5)
    this.bodyGroup.rotation.set(this.pitch, 0, this.roll)

    // Wheels.
    for (const steerGroup of this.frontSteer) steerGroup.rotation.y = p.steer
    for (const spin of this.wheelSpin) spin.rotation.x = p.wheelSpin

    // Steering wheel follows the road wheels (opposite sign to the yaw angle).
    this.wheelTurn.rotation.z = -p.steer * 1.7

    // Wipers.
    if (visual.wipers) {
      this.wiperPhase += dt * 2.4
      const angle = Math.sin(this.wiperPhase) * 0.55
      if (this.wiperArm) this.wiperArm.rotation.z = angle
    } else if (this.wiperArm) {
      this.wiperArm.rotation.z += (0 - this.wiperArm.rotation.z) * Math.min(1, dt * 4)
    }

    // Lights.
    const beamIntensity = visual.beams === 'off' ? 0 : visual.beams === 'low' ? 1.6 : 3.2
    if (this.spot) this.spot.intensity = beamIntensity * 60
    const headGlow = visual.beams === 'off' ? 0 : visual.beams === 'low' ? 1.4 : 2.6
    for (const mesh of this.headlightMeshes) {
      ;(mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = headGlow
    }
    for (const mesh of this.taillightMeshes) {
      const m = mesh.material as THREE.MeshStandardMaterial
      m.emissiveIntensity = visual.engineOn ? 0.5 : 0.15
    }

    const blink = Math.floor(performance.now() / 380) % 2 === 0
    for (const side of ['left', 'right'] as const) {
      const on = visual.signal === side && blink
      for (const mesh of this.signalMeshes[side]) {
        const m = mesh.material as THREE.MeshStandardMaterial
        if (m) m.emissiveIntensity = on ? 3 : 0
      }
    }

    // Cabin lighting: brighter at night, barely there in daylight.
    if (this.interiorLight) {
      this.interiorLight.intensity = visual.night ? 1.8 : 0.45
    }

    // Cluster.
    this.gauges.draw(p.rpm, p.speedKmh, p.gearDisplay, p.fuelFraction, {
      signal: visual.signal,
      beams: visual.beams,
      seatbelt: visual.seatbelt,
      handbrake: visual.handbrake,
      engineOn: visual.engineOn,
      highRev: p.rpm > 5600,
    })
  }

  private syncTransform(): void {
    const p = this.physics
    this.group.position.set(p.x, 0, p.z)
    this.group.rotation.y = p.yaw
  }

  /** Render the three mirror cameras into their targets. Call before the main pass. */
  renderMirrors(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
    this.mirrorFrame++
    if (this.mirrorFrame % 2 !== 0) return // mirrors update on alternate frames

    const prevTarget = renderer.getRenderTarget()
    for (const camera of this.mirrorCameras) {
      const index = this.mirrorCameras.indexOf(camera)
      renderer.setRenderTarget(this.mirrorTargets[index])
      renderer.render(scene, camera)
    }
    renderer.setRenderTarget(prevTarget)
  }

  setMirrorsVisible(visible: boolean): void {
    for (const surface of this.mirrorSurfaces) surface.visible = visible
  }

  dispose(): void {
    for (const target of this.mirrorTargets) target.dispose()
    for (const d of this.disposables) d.dispose()
    this.gauges.texture.dispose()
    this.group.clear()
  }
}
