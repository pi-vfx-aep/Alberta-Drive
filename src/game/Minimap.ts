import type { Intersection, RoadSegment, World } from './World'

export interface MapPoi {
  name: string
  x: number
  z: number
}

/** Canvas size in CSS pixels; the backing store is scaled by devicePixelRatio. */
const VIEW = 190
/** ~190 m of world shown across the map. */
const SCALE = 1.0
/** Fixed north-up world window, baked once into an offscreen layer. */
const BOUNDS = { minX: -160, maxX: 160, minZ: -180, maxZ: 340 }

const COL = {
  grass: '#2c3a2b',
  road: '#565c64',
  roadBig: '#6a717a',
  centre: '#d8c35a',
  edge: '#9aa1a9',
  zone: '#ffd24a',
  text: '#d6dde5',
  goal: '#ffd24a',
  traffic: '#d8dee6',
  ped: '#7fd4ff',
  player: '#ff5b4a',
}

/**
 * Top-down, north-up navigation map.
 *
 * The road network and place names are baked into an offscreen canvas once at
 * construction; each frame only blits the slice centred on the car and draws
 * the moving parts on top. That keeps the per-frame cost to one `drawImage`
 * plus a handful of primitives, so it is safe to run every other frame.
 */
export class Minimap {
  private readonly ctx: CanvasRenderingContext2D | null
  private readonly layer: HTMLCanvasElement
  private readonly layerCtx: CanvasRenderingContext2D | null
  private readonly pois: readonly MapPoi[]
  private frame = 0

  constructor(
    canvas: HTMLCanvasElement,
    private readonly world: World,
    pois: readonly MapPoi[],
  ) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = VIEW * dpr
    canvas.height = VIEW * dpr
    this.ctx = canvas.getContext('2d')
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.pois = pois

    this.layer = document.createElement('canvas')
    this.layer.width = Math.round((BOUNDS.maxX - BOUNDS.minX) * SCALE)
    this.layer.height = Math.round((BOUNDS.maxZ - BOUNDS.minZ) * SCALE)
    this.layerCtx = this.layer.getContext('2d')
    this.bake()
  }

  /* ----------------------------- static layer ---------------------------- */

  /** World -> offscreen-layer pixel. North (+Z) is up. */
  private static sx(x: number): number {
    return (x - BOUNDS.minX) * SCALE
  }

  private static sy(z: number): number {
    return (BOUNDS.maxZ - z) * SCALE
  }

  private bake(): void {
    const g = this.layerCtx
    if (!g) return

    g.fillStyle = COL.grass
    g.fillRect(0, 0, this.layer.width, this.layer.height)

    const roads = this.world.roads.filter((road) => !road.restrict)
    const byWidth = (a: RoadSegment, b: RoadSegment) => a.width - b.width

    // Wide roads first so narrow ones draw on top of the shoulders.
    for (const road of [...roads].sort(byWidth)) {
      g.strokeStyle = road.width >= 12 ? COL.roadBig : COL.road
      g.lineCap = 'butt'
      g.lineWidth = road.width * SCALE
      g.beginPath()
      if (road.axis === 'z') {
        g.moveTo(Minimap.sx(road.coord), Minimap.sy(road.from))
        g.lineTo(Minimap.sx(road.coord), Minimap.sy(road.to))
      } else {
        g.moveTo(Minimap.sx(road.from), Minimap.sy(road.coord))
        g.lineTo(Minimap.sx(road.to), Minimap.sy(road.coord))
      }
      g.stroke()
    }

    // Lane dividers: yellow centre line on multi-lane roads, white edge lines
    // elsewhere. Cheap stand-in for the real markings - legibility beats
    // cartographic accuracy at this size.
    for (const road of roads) {
      const long = road.axis === 'z'
      const cx = long ? Minimap.sx(road.coord) : Minimap.sx(road.from)
      const cz = long ? Minimap.sy(road.from) : Minimap.sy(road.coord)
      const ex = long ? Minimap.sx(road.coord) : Minimap.sx(road.to)
      const ez = long ? Minimap.sy(road.to) : Minimap.sy(road.coord)

      g.strokeStyle = road.lanes === 4 ? COL.centre : COL.edge
      g.lineWidth = road.lanes === 4 ? 2 : 1
      g.beginPath()
      g.moveTo(cx, cz)
      g.lineTo(ex, ez)
      g.stroke()

      if (road.lanes !== 4) continue
      g.lineWidth = 1
      for (const side of [-1, 1]) {
        const off = side * (road.width / 4) * SCALE
        g.beginPath()
        if (road.axis === 'z') {
          g.moveTo(cx + off, cz)
          g.lineTo(ex + off, ez)
        } else {
          g.moveTo(cx, cz - off)
          g.lineTo(ex, ez - off)
        }
        g.stroke()
      }
    }

    // Restrictive overlays (school / playground zones) get an amber casing so
    // the reduced limit is obvious at a glance.
    for (const road of this.world.roads) {
      if (!road.restrict) continue
      g.save()
      g.strokeStyle = COL.zone
      g.lineWidth = 2
      g.setLineDash([5, 4])
      g.beginPath()
      if (road.axis === 'z') {
        g.moveTo(Minimap.sx(road.coord) - road.width * SCALE * 0.5, Minimap.sy(road.from))
        g.lineTo(Minimap.sx(road.coord) - road.width * SCALE * 0.5, Minimap.sy(road.to))
        g.moveTo(Minimap.sx(road.coord) + road.width * SCALE * 0.5, Minimap.sy(road.from))
        g.lineTo(Minimap.sx(road.coord) + road.width * SCALE * 0.5, Minimap.sy(road.to))
      } else {
        g.moveTo(Minimap.sx(road.from), Minimap.sy(road.coord) - road.width * SCALE * 0.5)
        g.lineTo(Minimap.sx(road.to), Minimap.sy(road.coord) - road.width * SCALE * 0.5)
        g.moveTo(Minimap.sx(road.from), Minimap.sy(road.coord) + road.width * SCALE * 0.5)
        g.lineTo(Minimap.sx(road.to), Minimap.sy(road.coord) + road.width * SCALE * 0.5)
      }
      g.stroke()
      g.restore()
    }

    this.bakeIntersections()
    this.bakePlaces()
  }

  private bakeIntersections(): void {
    const g = this.layerCtx
    if (!g) return
    const r = 5
    for (const node of this.world.intersections) this.bakeNode(g, node, r)
  }

  private bakeNode(
    g: CanvasRenderingContext2D,
    node: Pick<Intersection, 'x' | 'z' | 'kind'>,
    r: number,
  ): void {
    const x = Minimap.sx(node.x)
    const y = Minimap.sy(node.z)
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    if (node.kind === 'light') {
      g.fillStyle = '#e8eef5'
      g.fill()
      g.fillStyle = '#1d232b'
      g.beginPath()
      g.arc(x, y, r - 1.8, 0, Math.PI * 2)
      g.fill()
    } else if (node.kind === 'stop') {
      g.fillStyle = '#e8eef5'
      g.fill()
    }
  }

  private bakePlaces(): void {
    const g = this.layerCtx
    if (!g) return

    // Marked parking bays, so the lesson target is findable.
    for (const space of [this.world.parallelSpace, this.world.reverseSpace]) {
      g.strokeStyle = COL.text
      g.lineWidth = 1.5
      g.strokeRect(
        Minimap.sx(space.x - space.length / 2),
        Minimap.sy(space.z + space.width / 2),
        space.length * SCALE,
        space.width * SCALE,
      )
    }

    g.font = '600 11px system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'bottom'
    for (const poi of this.pois) {
      const x = Minimap.sx(poi.x)
      const y = Minimap.sy(poi.z)
      g.fillStyle = 'rgba(12,16,20,0.75)'
      g.fillRect(
        x - g.measureText(poi.name).width / 2 - 3,
        y - 22,
        g.measureText(poi.name).width + 6,
        15,
      )
      g.fillStyle = COL.text
      g.fillText(poi.name, x, y - 10)
      g.fillStyle = COL.text
      g.beginPath()
      g.arc(x, y, 2.6, 0, Math.PI * 2)
      g.fill()
    }
  }

  /* --------------------------------- draw -------------------------------- */

  draw(
    px: number,
    pz: number,
    yaw: number,
    traffic: { x: number; z: number }[],
    peds: { x: number; z: number }[],
    goal: { x: number; z: number; name: string } | null,
  ): void {
    const g = this.ctx
    if (!g) return
    // Static layer only needs redrawing if the world layout ever changes.
    if (this.frame++ % 2 !== 0) return

    const half = VIEW / 2
    g.clearRect(0, 0, VIEW, VIEW)
    g.save()
    g.beginPath()
    g.arc(half, half, half - 1, 0, Math.PI * 2)
    g.clip()

    g.fillStyle = COL.grass
    g.fillRect(0, 0, VIEW, VIEW)
    g.drawImage(
      this.layer,
      half - Minimap.sx(px),
      half - Minimap.sy(pz),
      this.layer.width / SCALE,
      this.layer.height / SCALE,
    )

    const sx = (x: number): number => half + (x - px) * SCALE
    const sy = (z: number): number => half - (z - pz) * SCALE

    for (const t of traffic) {
      g.fillStyle = COL.traffic
      g.fillRect(sx(t.x) - 2.4, sy(t.z) - 2.4, 4.8, 4.8)
    }
    for (const p of peds) {
      g.fillStyle = COL.ped
      g.beginPath()
      g.arc(sx(p.x), sy(p.z), 1.8, 0, Math.PI * 2)
      g.fill()
    }

    // Active destination: dashed bearing line plus a diamond at the target.
    if (goal) {
      const gx = sx(goal.x)
      const gy = sy(goal.z)
      g.strokeStyle = 'rgba(255,210,74,0.65)'
      g.setLineDash([4, 4])
      g.lineWidth = 1.5
      g.beginPath()
      g.moveTo(half, half)
      g.lineTo(gx, gy)
      g.stroke()
      g.setLineDash([])

      g.fillStyle = COL.goal
      g.beginPath()
      g.moveTo(gx, gy - 6)
      g.lineTo(gx + 6, gy)
      g.lineTo(gx, gy + 6)
      g.lineTo(gx - 6, gy)
      g.closePath()
      g.fill()
    }

    // The player, always at the centre, pointing up when heading north.
    g.save()
    g.translate(half, half)
    g.rotate(yaw)
    g.fillStyle = COL.player
    g.strokeStyle = 'rgba(0,0,0,0.55)'
    g.lineWidth = 1.5
    g.beginPath()
    g.moveTo(0, -8)
    g.lineTo(5.5, 7)
    g.lineTo(0, 4)
    g.lineTo(-5.5, 7)
    g.closePath()
    g.fill()
    g.stroke()
    g.restore()

    g.restore()

    // Compass and rim.
    g.fillStyle = 'rgba(12,16,20,0.72)'
    g.beginPath()
    g.arc(half, 14, 11, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = COL.text
    g.font = '700 11px system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('N', half, 14)

    g.strokeStyle = 'rgba(226,235,244,0.28)'
    g.lineWidth = 2
    g.beginPath()
    g.arc(half, half, half - 2, 0, Math.PI * 2)
    g.stroke()
  }

  dispose(): void {
    this.ctx?.clearRect(0, 0, VIEW, VIEW)
  }
}
