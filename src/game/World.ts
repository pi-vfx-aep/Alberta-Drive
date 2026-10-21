import * as THREE from 'three'
import type { AABB } from './physics'

/** Half the road width (10 m roads: two 3.5 m lanes + shoulders). */
export const ROAD_HALF = 5
/** Lateral offset from the road centreline to a lane's centre. */
export const LANE_OFFSET = 1.9

export type RoadAxis = 'x' | 'z'

export interface RoadSegment {
  id: string
  axis: RoadAxis
  coord: number
  from: number
  to: number
  width: number
  limit: number
  name: string
  /** Number of lanes in total (2 = one each way, 4 = two each way). */
  lanes?: 2 | 4
  /** Restrictive overlays (school zones) win when several segments overlap. */
  restrict?: boolean
}

export interface StopPoint {
  x: number
  z: number
  /** 'ns' = travelling north/south, 'ew' = travelling east/west. */
  axis: 'ns' | 'ew'
  kind: 'light' | 'stop'
  stopX: boolean
  stopZ: boolean
}

export interface Crosswalk {
  x: number
  z: number
  hx: number
  hz: number
  /** Signals allow pedestrians when the perpendicular traffic has a red. */
  signalised: boolean
}

export interface Intersection {
  x: number
  z: number
  kind: 'light' | 'stop' | 'uncontrolled'
}

export type LightPhase = 'green' | 'yellow' | 'red'

const NS_GREEN = 13
const NS_YELLOW = 3
const ALL_RED = 1.6
const EW_GREEN = 13
const EW_YELLOW = 3

/** Shared signal controller for all signalised intersections in the demo town. */
export class TrafficLights {
  ns: LightPhase = 'green'
  ew: LightPhase = 'red'
  private timer = NS_GREEN

  update(dt: number): void {
    this.timer -= dt
    if (this.timer > 0) return

    if (this.ns === 'green') {
      this.ns = 'yellow'
      this.timer = NS_YELLOW
    } else if (this.ns === 'yellow') {
      this.ns = 'red'
      this.ew = 'red'
      this.timer = ALL_RED
    } else if (this.ew === 'green') {
      this.ew = 'yellow'
      this.timer = EW_YELLOW
    } else if (this.ew === 'yellow') {
      this.ew = 'red'
      this.ns = 'red'
      this.timer = ALL_RED
    } else {
      // Both red during the all-red interval - hand over to the other axis.
      if (this.wasNsRed) {
        this.ns = 'green'
        this.ew = 'red'
        this.timer = NS_GREEN
      } else {
        this.ew = 'green'
        this.ns = 'red'
        this.timer = EW_GREEN
      }
      this.wasNsRed = !this.wasNsRed
    }
  }

  private wasNsRed = true

  for(axis: 'ns' | 'ew'): LightPhase {
    return axis === 'ns' ? this.ns : this.ew
  }

  /** Time remaining in the current phase (used by AI to anticipate). */
  get phaseTime(): number {
    return this.timer
  }
}

/* ------------------------------------------------------------------ */
/*  Textures                                                           */
/* ------------------------------------------------------------------ */

function canvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (ctx) draw(ctx)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function roadTexture(solidCenter: boolean, lanes: 2 | 4): THREE.CanvasTexture {
  const W = 160
  const H = 512 // represents 8 m of road length
  return canvasTexture(W, H, (ctx) => {
    ctx.fillStyle = '#3a3d43'
    ctx.fillRect(0, 0, W, H)

    // Subtle asphalt grain.
    for (let i = 0; i < 900; i++) {
      const shade = 40 + Math.random() * 35
      ctx.fillStyle = `rgba(${shade},${shade},${shade + 4},0.5)`
      ctx.fillRect(Math.random() * W, Math.random() * H, 3, 3)
    }

    // Solid white edge lines.
    ctx.fillStyle = '#e9ecef'
    ctx.fillRect(8, 0, 5, H)
    ctx.fillRect(W - 13, 0, 5, H)

    if (lanes === 4) {
      // Double solid yellow centre line (Canadian: yellow divides opposing traffic).
      ctx.fillStyle = '#f2c200'
      ctx.fillRect(W / 2 - 7, 0, 5, H)
      ctx.fillRect(W / 2 + 2, 0, 5, H)

      // White dashed lane dividers at the quarter points.
      ctx.fillStyle = '#e9ecef'
      for (const u of [0.25, 0.75]) {
        const x = Math.round(u * W)
        ctx.fillRect(x - 2, 0, 4, H * 0.375)
        ctx.fillRect(x - 2, H * 0.5, 4, H * 0.375)
      }
      return
    }

    // Two-lane road: broken yellow centre (passing permitted when safe).
    ctx.fillStyle = solidCenter ? '#f2c200' : '#f2c200'
    if (solidCenter) {
      ctx.fillRect(W / 2 - 7, 0, 5, H)
      ctx.fillRect(W / 2 + 2, 0, 5, H)
    } else {
      ctx.fillRect(W / 2 - 3, 0, 6, H * 0.375)
      ctx.fillRect(W / 2 - 3, H * 0.5, 6, H * 0.375)
    }
  })
}

function asphaltTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#3a3d43'
    ctx.fillRect(0, 0, 128, 128)
    for (let i = 0; i < 300; i++) {
      const shade = 40 + Math.random() * 35
      ctx.fillStyle = `rgba(${shade},${shade},${shade + 4},0.6)`
      ctx.fillRect(Math.random() * 128, Math.random() * 128, 3, 3)
    }
  })
}

type SignPainter = (ctx: CanvasRenderingContext2D, w: number, h: number) => void

const SIGN_PAINTERS: Record<string, SignPainter> = {
  stop: (ctx, w, h) => {
    const cx = w / 2
    const cy = h / 2
    const r = w * 0.46
    ctx.beginPath()
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i + Math.PI / 8
      const px = cx + Math.cos(a) * r
      const py = cy + Math.sin(a) * r
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.fillStyle = '#c8102e'
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 5
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 34px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('STOP', cx, cy + 2)
  },
  yield: (ctx, w, h) => {
    const cx = w / 2
    ctx.beginPath()
    ctx.moveTo(cx, h * 0.08)
    ctx.lineTo(w * 0.94, h * 0.88)
    ctx.lineTo(w * 0.06, h * 0.88)
    ctx.closePath()
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.strokeStyle = '#c8102e'
    ctx.lineWidth = 9
    ctx.stroke()
    ctx.fillStyle = '#c8102e'
    ctx.font = 'bold 22px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('YIELD', cx, h * 0.7)
  },
  school: (ctx, w, h) => {
    const cx = w / 2
    ctx.beginPath()
    ctx.moveTo(cx, h * 0.04)
    ctx.lineTo(w * 0.96, h * 0.34)
    ctx.lineTo(w * 0.96, h * 0.66)
    ctx.lineTo(cx, h * 0.96)
    ctx.lineTo(w * 0.04, h * 0.66)
    ctx.lineTo(w * 0.04, h * 0.34)
    ctx.closePath()
    ctx.fillStyle = '#f2e24a'
    ctx.fill()
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 5
    ctx.stroke()
    ctx.fillStyle = '#111'
    ctx.font = 'bold 20px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('SCHOOL', cx, h * 0.5)
  },
  pedestrian: (ctx, w, h) => {
    const cx = w / 2
    ctx.beginPath()
    ctx.moveTo(cx, h * 0.06)
    ctx.lineTo(w * 0.94, h * 0.5)
    ctx.lineTo(cx, h * 0.94)
    ctx.lineTo(w * 0.06, h * 0.5)
    ctx.closePath()
    ctx.fillStyle = '#f2e24a'
    ctx.fill()
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 5
    ctx.stroke()
    // Simple walking figure.
    ctx.fillStyle = '#111'
    ctx.beginPath()
    ctx.arc(cx, h * 0.3, 9, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(cx, h * 0.38)
    ctx.lineTo(cx, h * 0.6)
    ctx.moveTo(cx, h * 0.6)
    ctx.lineTo(cx - 14, h * 0.78)
    ctx.moveTo(cx, h * 0.6)
    ctx.lineTo(cx + 14, h * 0.78)
    ctx.moveTo(cx, h * 0.44)
    ctx.lineTo(cx - 14, h * 0.52)
    ctx.moveTo(cx, h * 0.44)
    ctx.lineTo(cx + 14, h * 0.52)
    ctx.stroke()
  },
  construction: (ctx, w, h) => {
    const cx = w / 2
    ctx.beginPath()
    ctx.moveTo(cx, h * 0.05)
    ctx.lineTo(w * 0.95, h * 0.5)
    ctx.lineTo(cx, h * 0.95)
    ctx.lineTo(w * 0.05, h * 0.5)
    ctx.closePath()
    ctx.fillStyle = '#f28c28'
    ctx.fill()
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 5
    ctx.stroke()
    ctx.fillStyle = '#111'
    ctx.font = 'bold 18px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('ROAD', cx, h * 0.45)
    ctx.fillText('WORK', cx, h * 0.6)
  },
  rail: (ctx, w, h) => {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#c8102e'
    ctx.lineWidth = 12
    ctx.strokeRect(6, 6, w - 12, h - 12)
    ctx.fillStyle = '#c8102e'
    ctx.font = 'bold 26px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('RAIL', w / 2, h * 0.4)
    ctx.fillText('CROSSING', w / 2, h * 0.68)
  },
}

function speedLimitTexture(kmh: number): THREE.CanvasTexture {
  return canvasTexture(128, 160, (ctx) => {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 128, 160)
    ctx.strokeStyle = '#111111'
    ctx.lineWidth = 6
    ctx.strokeRect(8, 8, 112, 144)
    ctx.fillStyle = '#111111'
    ctx.textAlign = 'center'
    ctx.font = 'bold 34px Arial'
    ctx.fillText('MAXIMUM', 64, 52)
    ctx.font = 'bold 62px Arial'
    ctx.fillText(String(kmh), 64, 122)
  })
}

/* ------------------------------------------------------------------ */
/*  World                                                              */
/* ------------------------------------------------------------------ */

/** Deterministic RNG so the town looks the same every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class World {
  readonly group = new THREE.Group()
  readonly colliders: AABB[] = []
  readonly roads: RoadSegment[] = []
  readonly intersections: Intersection[] = []
  readonly stopPoints: StopPoint[] = []
  readonly crosswalks: Crosswalk[] = []
  readonly lights = new TrafficLights()
  readonly spawn = { x: -3.6, z: -40, yaw: 0 }

  /** Parallel-parking target: centre and footprint of the marked space. */
  readonly parallelSpace = { x: -45, z: -3.6, length: 6.4, width: 2.2 }
  /** Reverse-parking bay inside the lot. */
  readonly reverseSpace = { x: -30, z: -30, length: 5, width: 2.6 }

  private readonly lampMeshes: {
    nsRed: THREE.Mesh[]
    nsAmber: THREE.Mesh[]
    nsGreen: THREE.Mesh[]
    ewRed: THREE.Mesh[]
    ewAmber: THREE.Mesh[]
    ewGreen: THREE.Mesh[]
  } = { nsRed: [], nsAmber: [], nsGreen: [], ewRed: [], ewAmber: [], ewGreen: [] }

  private readonly disposables: { dispose: () => void }[] = []

  constructor() {
    this.buildRoads()
    this.buildIntersections()
    this.buildTown()
    this.buildNature()
    this.buildRailway()
    this.updateSignals(0)
  }

  /* ---------------------------- roads ---------------------------- */

  private buildRoads(): void {
    this.roads.push(
      {
        id: 'west',
        axis: 'z',
        coord: -60,
        from: -140,
        to: 140,
        width: 10,
        limit: 50,
        name: 'West Street',
      },
      {
        id: 'central',
        axis: 'z',
        coord: 0,
        from: -140,
        to: 140,
        width: 10,
        limit: 50,
        name: 'Central Avenue',
      },
      {
        id: 'east',
        axis: 'z',
        coord: 60,
        from: -140,
        to: 140,
        width: 10,
        limit: 50,
        name: 'East Street',
      },
      {
        id: 'south',
        axis: 'x',
        coord: -60,
        from: -100,
        to: 100,
        width: 10,
        limit: 50,
        name: 'South Boulevard',
      },
      {
        id: 'main',
        axis: 'x',
        coord: 0,
        from: -100,
        to: 100,
        width: 14,
        limit: 60,
        name: 'Main Street',
        lanes: 4,
      },
      {
        id: 'north',
        axis: 'x',
        coord: 60,
        from: -100,
        to: 100,
        width: 10,
        limit: 50,
        name: 'North Boulevard',
      },
      {
        id: 'park',
        axis: 'x',
        coord: 120,
        from: -100,
        to: 100,
        width: 10,
        limit: 50,
        name: 'Park Road',
      },
      {
        id: 'school',
        axis: 'x',
        coord: 60,
        from: -60,
        to: 0,
        width: 10,
        limit: 30,
        name: 'School Zone',
        restrict: true,
      },
      {
        id: 'highway',
        axis: 'z',
        coord: 0,
        from: 140,
        to: 300,
        width: 12,
        limit: 100,
        name: 'Prairie Highway',
      },
    )

    const walkMat = new THREE.MeshStandardMaterial({ color: 0x8d9096, roughness: 1 })
    this.disposables.push(walkMat)

    const baseTextures = new Map<string, THREE.CanvasTexture>()

    for (const road of this.roads) {
      const length = road.to - road.from
      const centre = road.from + length / 2

      // Restrictive overlays (school zone) only contribute a speed limit -
      // the underlying road geometry is already drawn by the base segment.
      if (road.restrict) continue

      const lanes = road.lanes ?? 2
      let base = baseTextures.get(String(lanes))
      if (!base) {
        base = roadTexture(false, lanes)
        baseTextures.set(String(lanes), base)
      }

      const texture = base.clone()
      texture.wrapT = THREE.RepeatWrapping
      texture.repeat.set(1, length / 8)
      texture.needsUpdate = true
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.95,
        metalness: 0,
      })
      this.disposables.push(texture, material)

      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(road.width, length), material)
      mesh.rotation.x = -Math.PI / 2
      if (road.axis === 'x') mesh.rotation.z = Math.PI / 2
      mesh.position.set(
        road.axis === 'z' ? road.coord : centre,
        0.02,
        road.axis === 'z' ? centre : road.coord,
      )
      this.group.add(mesh)

      // Sidewalk just outside each edge of the roadway (town roads only).
      if (road.id === 'highway') continue
      const edge = road.width / 2
      for (const side of [-1, 1]) {
        const walkGeo =
          road.axis === 'z'
            ? new THREE.BoxGeometry(3, 0.16, length)
            : new THREE.BoxGeometry(length, 0.16, 3)
        const walk = new THREE.Mesh(walkGeo, walkMat)
        walk.position.set(
          road.axis === 'z' ? road.coord + side * (edge + 1.5) : centre,
          0.08,
          road.axis === 'z' ? centre : road.coord + side * (edge + 1.5),
        )
        this.group.add(walk)
      }
    }

    for (const texture of baseTextures.values()) texture.dispose()

    // Ground plane under everything.
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x5d7a4a, roughness: 1 })
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.02
    this.group.add(ground)
    this.disposables.push(groundMat)
  }

  private buildIntersections(): void {
    const xs = [-60, 0, 60]
    const zs = [-60, 0, 60, 120]

    const lighted: [number, number][] = [
      [0, 0],
      [0, 60],
    ]
    const stops: [number, number][] = [
      [60, 0],
      [-60, 0],
      [-60, 60],
    ]

    const patchMat = new THREE.MeshStandardMaterial({
      map: asphaltTexture(),
      roughness: 0.95,
    })
    const lineMat = new THREE.MeshBasicMaterial({
      color: 0xf2f4f7,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    this.disposables.push(patchMat, lineMat)

    for (const x of xs) {
      for (const z of zs) {
        const kind: Intersection['kind'] = lighted.some(([a, b]) => a === x && b === z)
          ? 'light'
          : stops.some(([a, b]) => a === x && b === z)
            ? 'stop'
            : 'uncontrolled'
        this.intersections.push({ x, z, kind })

        const patch = new THREE.Mesh(new THREE.PlaneGeometry(11, 11), patchMat)
        patch.rotation.x = -Math.PI / 2
        patch.position.set(x, 0.04, z)
        this.group.add(patch)

        // Crosswalks on all four sides.
        for (const side of [-1, 1]) {
          this.addCrosswalk(x, z + side * 7.4, 4.5, 1.5, kind === 'light')
          this.addCrosswalk(x + side * 7.4, z, 1.5, 4.5, kind === 'light')
        }

        if (kind === 'uncontrolled') continue

        // One stop point per approach: the lane's stop bar, plus the near-right
        // corner where the sign or signal head stands (clear of the roadway).
        const approaches = [
          {
            axis: 'ns' as const,
            x: x - LANE_OFFSET,
            z: z - 9.4,
            headX: x - 6.5,
            headZ: z - 9.4,
            yaw: Math.PI,
          },
          {
            axis: 'ns' as const,
            x: x + LANE_OFFSET,
            z: z + 9.4,
            headX: x + 6.5,
            headZ: z + 9.4,
            yaw: 0,
          },
          {
            axis: 'ew' as const,
            x: x - 9.4,
            z: z + LANE_OFFSET,
            headX: x - 9.4,
            headZ: z + 6.5,
            yaw: -Math.PI / 2,
          },
          {
            axis: 'ew' as const,
            x: x + 9.4,
            z: z - LANE_OFFSET,
            headX: x + 9.4,
            headZ: z - 6.5,
            yaw: Math.PI / 2,
          },
        ]

        for (const a of approaches) {
          this.stopPoints.push({
            x: a.x,
            z: a.z,
            axis: a.axis,
            kind: kind === 'light' ? 'light' : 'stop',
            stopX: a.axis === 'ns',
            stopZ: a.axis === 'ew',
          })

          // Painted stop bar across the lane.
          const bar = new THREE.Mesh(
            a.axis === 'ns'
              ? new THREE.BoxGeometry(4.5, 0.02, 0.45)
              : new THREE.BoxGeometry(0.45, 0.02, 4.5),
            lineMat,
          )
          bar.position.set(a.x, 0.06, a.z)
          this.group.add(bar)

          if (kind === 'stop') this.addStopSign(a)
          else this.addSignalHead(a)
        }
      }
    }
  }

  private addCrosswalk(
    x: number,
    z: number,
    hx: number,
    hz: number,
    signalised: boolean,
  ): void {
    this.crosswalks.push({ x, z, hx, hz, signalised })
    const mat = new THREE.MeshBasicMaterial({
      color: 0xf2f4f7,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    })
    this.disposables.push(mat)
    const stripes = 6
    for (let i = 0; i < stripes; i++) {
      const t = (i + 0.5) / stripes
      const geo =
        hx > hz
          ? new THREE.BoxGeometry((hx * 2) / stripes / 2, 0.02, hz * 2)
          : new THREE.BoxGeometry(hx * 2, 0.02, (hz * 2) / stripes / 2)
      const stripe = new THREE.Mesh(geo, mat)
      if (hx > hz) stripe.position.set(x - hx + t * hx * 2, 0.07, z)
      else stripe.position.set(x, 0.07, z - hz + t * hz * 2)
      this.group.add(stripe)
    }
  }

  private addStopSign(a: { headX: number; headZ: number; yaw: number }): void {
    const postMat = new THREE.MeshStandardMaterial({
      color: 0x9aa0a6,
      roughness: 0.6,
      metalness: 0.4,
    })
    const signMat = new THREE.MeshBasicMaterial({
      map: stopFaceTexture(),
      side: THREE.DoubleSide,
    })
    this.disposables.push(postMat, signMat)

    const group = new THREE.Group()
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 8), postMat)
    post.position.y = 1.2
    group.add(post)

    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), signMat)
    face.position.y = 2.2
    group.add(face)

    group.position.set(a.headX, 0, a.headZ)
    group.rotation.y = a.yaw
    this.group.add(group)
  }

  private addSignalHead(a: {
    axis: 'ns' | 'ew'
    headX: number
    headZ: number
    yaw: number
  }): void {
    const postMat = new THREE.MeshStandardMaterial({
      color: 0x3c4043,
      roughness: 0.7,
      metalness: 0.3,
    })
    const housingMat = new THREE.MeshStandardMaterial({ color: 0x24272b, roughness: 0.8 })
    this.disposables.push(postMat, housingMat)

    const group = new THREE.Group()
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 5.0, 8), postMat)
    post.position.y = 2.5
    group.add(post)

    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.35), housingMat)
    housing.position.y = 4.4
    group.add(housing)

    const colours: Record<'red' | 'amber' | 'green', number> = {
      red: 0xff2d2d,
      amber: 0xffb020,
      green: 0x2ee06a,
    }
    const slots: ('red' | 'amber' | 'green')[] = ['red', 'amber', 'green']
    const buckets: (keyof typeof this.lampMeshes)[] =
      a.axis === 'ns' ? ['nsRed', 'nsAmber', 'nsGreen'] : ['ewRed', 'ewAmber', 'ewGreen']

    slots.forEach((slot, i) => {
      const mat = new THREE.MeshStandardMaterial({
        color: colours[slot],
        emissive: colours[slot],
        emissiveIntensity: 0.15,
        roughness: 0.4,
      })
      this.disposables.push(mat)
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), mat)
      lamp.position.set(0, 4.82 - i * 0.42, 0.19)
      group.add(lamp)
      this.lampMeshes[buckets[i]].push(lamp)
    })

    group.position.set(a.headX, 0, a.headZ)
    group.rotation.y = a.yaw
    this.group.add(group)
  }

  /* --------------------------- townscape -------------------------- */

  private buildTown(): void {
    const rng = mulberry32(20261019)
    const xs = [-105, -60, 0, 60, 105]
    const zs = [-140, -60, 0, 60, 120, 145]

    const palette = [0xb9a48a, 0x9aa7b5, 0xc8b7a6, 0x8f9aa6, 0xd6cdbf, 0xa8735a, 0xbfc4c9]

    const buildingGeos: THREE.BoxGeometry[] = []
    const buildingMat = new THREE.MeshStandardMaterial({
      roughness: 0.9,
      metalness: 0.05,
    })
    this.disposables.push(buildingMat)

    const instances: { m: THREE.Matrix4; color: THREE.Color }[] = []

    for (let i = 0; i < xs.length - 1; i++) {
      for (let j = 0; j < zs.length - 1; j++) {
        const minX = xs[i] + 7
        const maxX = xs[i + 1] - 7
        const minZ = zs[j] + 7
        const maxZ = zs[j + 1] - 7
        if (maxX - minX < 8 || maxZ - minZ < 8) continue

        // The south-west block holds the driving-school parking lot instead.
        const isLot = i === 0 && j === 1
        if (isLot) {
          this.buildParkingLot(minX + 4, minZ + 4, maxX - 4, maxZ - 4)
          continue
        }

        const count = 2 + Math.floor(rng() * 3)
        for (let k = 0; k < count; k++) {
          const w = 8 + rng() * Math.min(20, (maxX - minX) * 0.45)
          const d = 8 + rng() * Math.min(20, (maxZ - minZ) * 0.45)
          const h = 5 + rng() * 14
          const x = minX + w / 2 + rng() * Math.max(1, maxX - minX - w)
          const z = minZ + d / 2 + rng() * Math.max(1, maxZ - minZ - d)

          const geo = new THREE.BoxGeometry(w, h, d)
          buildingGeos.push(geo)
          const matrix = new THREE.Matrix4().makeTranslation(x, h / 2, z)
          const colour = new THREE.Color(palette[Math.floor(rng() * palette.length)])
          instances.push({ m: matrix, color: colour })

          this.colliders.push({
            minX: x - w / 2,
            maxX: x + w / 2,
            minZ: z - d / 2,
            maxZ: z + d / 2,
            name: 'building',
          })
        }
      }
    }

    // Merge instances into one InstancedMesh per unique geometry size is
    // impractical; instead draw each as its own mesh - the town is small.
    for (let i = 0; i < instances.length; i++) {
      const mesh = new THREE.Mesh(buildingGeos[i], buildingMat)
      mesh.applyMatrix4(instances[i].m)
      mesh.material = buildingMat
      ;(mesh.material as THREE.MeshStandardMaterial).vertexColors = false
      mesh.castShadow = true
      mesh.receiveShadow = true
      // Per-instance tint via a cloned material would multiply draw calls, so
      // tint with vertex colouring on a per-mesh material clone instead.
      const mat = buildingMat.clone()
      mat.color.copy(instances[i].color)
      mesh.material = mat
      this.disposables.push(mat)
      this.group.add(mesh)
    }

    // A sign for the driving school and a couple of roadside details.
    this.addSimpleSign(-18, -52, 0, SIGN_PAINTERS.school, 1.1, 1.1)
    this.addSpeedSign(50, 6.5, 0, 60)
    this.addSpeedSign(-66, 52, Math.PI, 60)
    this.addSpeedSign(6.5, 30, Math.PI / 2, 50)
    this.addSpeedSign(-6.5, -100, -Math.PI / 2, 50)
    this.addSpeedSign(6.5, 150, Math.PI / 2, 100)
    this.addSimpleSign(-2.5, 150, Math.PI / 2, SIGN_PAINTERS.rail, 1.4, 1.1)
    this.addSimpleSign(-6.5, 68, 0, SIGN_PAINTERS.pedestrian, 1.0, 1.0)
    this.addSimpleSign(-6.5, 48, 0, SIGN_PAINTERS.school, 1.1, 1.1)
    this.addSimpleSign(-52, 66.5, Math.PI, SIGN_PAINTERS.construction, 1.0, 1.0)
    this.addSimpleSign(66.5, -4, -Math.PI / 2, SIGN_PAINTERS.yield, 1.0, 1.0)
  }

  private buildParkingLot(minX: number, minZ: number, maxX: number, maxZ: number): void {
    const mat = new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.95 })
    this.disposables.push(mat)
    const w = maxX - minX
    const d = maxZ - minZ
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat)
    lot.rotation.x = -Math.PI / 2
    lot.position.set((minX + maxX) / 2, 0.03, (minZ + maxZ) / 2)
    this.group.add(lot)

    // Perimeter curb colliders keep the car inside the block.
    this.colliders.push({
      minX: minX - 2,
      maxX: minX,
      minZ: minZ - 2,
      maxZ: maxZ + 2,
      name: 'curb',
    })
    this.colliders.push({
      minX: maxX,
      maxX: maxX + 2,
      minZ: minZ - 2,
      maxZ: maxZ + 2,
      name: 'curb',
    })
    this.colliders.push({
      minX: minX - 2,
      maxX: maxX + 2,
      minZ: minZ - 2,
      maxZ: minZ,
      name: 'curb',
    })
    this.colliders.push({
      minX: minX - 2,
      maxX: maxX + 2,
      minZ: maxZ,
      maxZ: maxZ + 2,
      name: 'curb',
    })

    // Painted reverse-parking bays along the north edge.
    const lineMat = new THREE.MeshBasicMaterial({
      color: 0xf2f4f7,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    this.disposables.push(lineMat)
    const stalls = Math.floor(w / 2.8)
    for (let i = 0; i <= stalls; i++) {
      const x = minX + 1 + i * ((w - 2) / stalls)
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 5), lineMat)
      line.position.set(x, 0.07, maxZ - 3.2)
      this.group.add(line)
    }

    // Driving-school signage on the lot.
    this.addSimpleSign(minX + 4, maxZ - 6, Math.PI, SIGN_PAINTERS.school, 1.3, 1.3)
  }

  private buildNature(): void {
    const rng = mulberry32(7734)

    // Evergreen trees scattered across the prairie outside the blocks.
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 2.4, 6)
    const foliageGeo = new THREE.ConeGeometry(1.8, 5.5, 7)
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: 1 })
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x2f5233, roughness: 1 })
    this.disposables.push(trunkGeo, foliageGeo, trunkMat, foliageMat)

    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, 220)
    const foliageMesh = new THREE.InstancedMesh(foliageGeo, foliageMat, 220)
    const matrix = new THREE.Matrix4()
    let placed = 0
    let guard = 0
    while (placed < 220 && guard < 4000) {
      guard++
      const x = (rng() - 0.5) * 560
      const z = (rng() - 0.5) * 560
      if (Math.abs(x) < 112 && z > -146 && z < 150) continue // keep the town clear
      if (Math.abs(x) < 12 && z > 130 && z < 310) continue // keep the highway clear
      const scale = 0.75 + rng() * 0.7
      matrix.compose(
        new THREE.Vector3(x, 1.2 * scale, z),
        new THREE.Quaternion(),
        new THREE.Vector3(scale, scale, scale),
      )
      trunkMesh.setMatrixAt(placed, matrix)
      matrix.compose(
        new THREE.Vector3(x, (2.4 + 2.4) * scale, z),
        new THREE.Quaternion(),
        new THREE.Vector3(scale, scale, scale),
      )
      foliageMesh.setMatrixAt(placed, matrix)
      this.colliders.push({
        minX: x - 0.5,
        maxX: x + 0.5,
        minZ: z - 0.5,
        maxZ: z + 0.5,
        name: 'tree',
      })
      placed++
    }
    trunkMesh.count = placed
    foliageMesh.count = placed
    trunkMesh.instanceMatrix.needsUpdate = true
    foliageMesh.instanceMatrix.needsUpdate = true
    this.group.add(trunkMesh, foliageMesh)

    // Prairie field patches for a bit of visual variety.
    const fieldMat = new THREE.MeshStandardMaterial({ color: 0x93a35a, roughness: 1 })
    this.disposables.push(fieldMat)
    for (let i = 0; i < 6; i++) {
      const patch = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), fieldMat)
      patch.rotation.x = -Math.PI / 2
      patch.position.set(-260 + i * 95, -0.01, 250 + (i % 2) * 60)
      this.group.add(patch)
    }
  }

  private buildRailway(): void {
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x4a4d52,
      roughness: 0.5,
      metalness: 0.6,
    })
    const tieMat = new THREE.MeshStandardMaterial({ color: 0x3b2f26, roughness: 1 })
    this.disposables.push(railMat, tieMat)

    const track = new THREE.Mesh(new THREE.BoxGeometry(300, 0.16, 0.5), railMat)
    track.position.set(0, 0.14, 200)
    this.group.add(track)

    for (let i = -140; i <= 140; i += 2) {
      const tie = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 0.4), tieMat)
      tie.position.set(i, 0.07, 200)
      this.group.add(tie)
    }

    // Crossbucks either side of the highway.
    for (const x of [-7.5, 7.5]) {
      const postMat = new THREE.MeshStandardMaterial({ color: 0xdadce0, roughness: 0.7 })
      this.disposables.push(postMat)
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.6, 0.15), postMat)
      post.position.set(x, 1.3, 205)
      this.group.add(post)
      const faceMat = new THREE.MeshBasicMaterial({ map: crossbuckTexture() })
      this.disposables.push(faceMat)
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.6), faceMat)
      face.position.set(x, 2.3, 205)
      face.rotation.y = Math.PI
      this.group.add(face)
    }

    // Treat the tracks as a solid obstacle so drivers don't cut the corner.
    this.colliders.push({ minX: -300, maxX: -8, minZ: 197, maxZ: 203, name: 'railway' })
    this.colliders.push({ minX: 8, maxX: 300, minZ: 197, maxZ: 203, name: 'railway' })
  }

  private addSimpleSign(
    x: number,
    z: number,
    yaw: number,
    painter: SignPainter,
    w: number,
    h: number,
  ): void {
    const texture = canvasTexture(128, 128, (ctx) => painter(ctx, 128, 128))
    const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
    const postMat = new THREE.MeshStandardMaterial({
      color: 0x9aa0a6,
      roughness: 0.6,
      metalness: 0.4,
    })
    this.disposables.push(mat, postMat)

    const group = new THREE.Group()
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 8), postMat)
    post.position.y = 1.2
    group.add(post)
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
    face.position.y = 1.2 + h / 2 + 0.6
    group.add(face)
    group.position.set(x, 0, z)
    group.rotation.y = yaw
    this.group.add(group)
  }

  private addSpeedSign(x: number, z: number, yaw: number, kmh: number): void {
    const texture = speedLimitTexture(kmh)
    const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
    const postMat = new THREE.MeshStandardMaterial({
      color: 0x9aa0a6,
      roughness: 0.6,
      metalness: 0.4,
    })
    this.disposables.push(mat, postMat)

    const group = new THREE.Group()
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8), postMat)
    post.position.y = 1.3
    group.add(post)
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.1), mat)
    face.position.y = 3.0
    group.add(face)
    group.position.set(x, 0, z)
    group.rotation.y = yaw
    this.group.add(group)
  }

  /* ---------------------------- queries --------------------------- */

  update(dt: number): void {
    this.lights.update(dt)
    this.updateSignals(dt)
  }

  private updateSignals(_dt: number): void {
    const set = (meshes: THREE.Mesh[], on: boolean) => {
      for (const mesh of meshes) {
        const mat = mesh.material as THREE.MeshStandardMaterial
        mat.emissiveIntensity = on ? 2.2 : 0.08
      }
    }
    set(this.lampMeshes.nsRed, this.lights.ns === 'red')
    set(this.lampMeshes.nsAmber, this.lights.ns === 'yellow')
    set(this.lampMeshes.nsGreen, this.lights.ns === 'green')
    set(this.lampMeshes.ewRed, this.lights.ew === 'red')
    set(this.lampMeshes.ewAmber, this.lights.ew === 'yellow')
    set(this.lampMeshes.ewGreen, this.lights.ew === 'green')
  }

  /** Most restrictive posted limit covering this point (50 if unknown). */
  speedLimitAt(x: number, z: number): number {
    let best: number | null = null
    for (const road of this.roads) {
      if (!this.covers(road, x, z)) continue
      if (best === null || road.limit < best) best = road.limit
    }
    return best ?? 50
  }

  private covers(road: RoadSegment, x: number, z: number): boolean {
    if (road.axis === 'z') {
      if (Math.abs(x - road.coord) > road.width / 2) return false
      return z >= road.from && z <= road.to
    }
    if (Math.abs(z - road.coord) > road.width / 2) return false
    return x >= road.from && x <= road.to
  }

  isOnRoad(x: number, z: number): boolean {
    return this.roads.some((road) => this.covers(road, x, z))
  }

  /** Friction multiplier for the surface under the car. */
  surfaceGrip(x: number, z: number): number {
    return this.isOnRoad(x, z) ? 1 : 0.62
  }

  /** Name of the road the car is on, for navigation prompts. */
  roadNameAt(x: number, z: number): string {
    for (const road of this.roads) {
      if (this.covers(road, x, z) && !road.restrict) return road.name
    }
    return 'open road'
  }

  /**
   * The road whose centreline is nearest this point. Used for lane-position
   * and right-of-way checks; returns null when off every road.
   */
  roadAt(x: number, z: number): RoadSegment | null {
    let best: RoadSegment | null = null
    let bestDist = Infinity
    for (const road of this.roads) {
      if (road.restrict) continue
      if (!this.covers(road, x, z)) continue
      const dist = road.axis === 'z' ? Math.abs(x - road.coord) : Math.abs(z - road.coord)
      if (dist < bestDist) {
        bestDist = dist
        best = road
      }
    }
    return best
  }

  /**
   * Signed distance from the road centreline toward the driver's right-hand
   * side, in metres. Negative means the car is on the wrong side of the road.
   * Returns `null` when the car is not on a road.
   */
  offsetFromCentre(
    x: number,
    z: number,
    headingX: number,
    headingZ: number,
  ): number | null {
    const road = this.roadAt(x, z)
    if (!road) return null
    const cx = road.axis === 'z' ? road.coord : x
    const cz = road.axis === 'z' ? z : road.coord
    return (x - cx) * -headingZ + (z - cz) * headingX
  }

  dispose(): void {
    this.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
    })
    for (const d of this.disposables) d.dispose()
    this.group.clear()
  }
}

function stopFaceTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx) => SIGN_PAINTERS.stop(ctx, 128, 128))
}

function crossbuckTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 96, (ctx) => {
    ctx.fillStyle = '#f2f4f7'
    ctx.fillRect(0, 0, 256, 96)
    ctx.strokeStyle = '#c8102e'
    ctx.lineWidth = 6
    ctx.strokeRect(4, 4, 248, 88)
    ctx.fillStyle = '#c8102e'
    ctx.font = 'bold 44px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('RAILWAY', 128, 50)
  })
}
