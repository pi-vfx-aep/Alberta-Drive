import type { Action } from '../types'

const STORAGE_KEY = 'alberta-drive.keymap'

/** Human-readable key labels for the settings screen. */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code === 'Space') return 'Space'
  if (code === 'Escape') return 'Esc'
  if (code.startsWith('Arrow')) return code.slice(5)
  return code
}

export const ACTION_LABELS: Record<Action, string> = {
  accelerate: 'Accelerate',
  brake: 'Brake / Reverse',
  steerLeft: 'Steer left',
  steerRight: 'Steer right',
  handbrake: 'Parking brake',
  signalLeft: 'Left signal',
  signalRight: 'Right signal',
  horn: 'Horn',
  headlights: 'Headlights / High beam',
  camera: 'Change camera',
  interact: 'Interact / Start engine',
  seatbelt: 'Seatbelt',
  wipers: 'Wipers',
  recenter: 'Recenter camera',
  recover: 'Recover vehicle',
  pause: 'Pause',
}

function loadKeymap(): Record<Action, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {} as Record<Action, string>
    const parsed = JSON.parse(raw) as Partial<Record<Action, string>>
    const out: Record<Action, string> = {} as Record<Action, string>
    for (const key of Object.keys(parsed) as Action[]) {
      const value = parsed[key]
      if (typeof value === 'string') out[key] = value
    }
    return out
  } catch {
    return {} as Record<Action, string>
  }
}

export { loadKeymap }

export function saveBindings(bindings: Record<Action, string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings))
  } catch {
    /* storage unavailable - ignore */
  }
}

/**
 * Keyboard, pointer and gamepad input.
 *
 * Keyboard state is edge-triggered per frame; pointer deltas accumulate until
 * consumed by the camera. A gamepad, when present, is merged in on read.
 */
export class Input {
  readonly bindings: Record<Action, string>

  /** Accumulated pointer-look deltas in pixels (pointer lock). */
  lookX = 0
  lookY = 0
  pointerLocked = false

  private readonly down = new Set<string>()
  private readonly pressed = new Set<string>()
  private readonly released = new Set<string>()
  private readonly buttonPressed = new Set<number>()

  constructor(private readonly target: HTMLElement) {
    this.bindings = { ...defaultBindings(), ...loadKeymap() }

    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    window.addEventListener('mousemove', this.onMouseMove)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    target.addEventListener('contextmenu', this.preventMenu)
  }

  rebind(action: Action, code: string): void {
    this.bindings[action] = code
    saveBindings(this.bindings)
  }

  resetBindings(): void {
    Object.assign(this.bindings, defaultBindings())
    saveBindings(this.bindings)
  }

  /** True while the bound key (or gamepad equivalent) is held. */
  isDown(action: Action): boolean {
    if (this.down.has(this.bindings[action])) return true
    return this.gamepadDown(action)
  }

  /** True only on the frame the action was triggered. */
  justPressed(action: Action): boolean {
    if (this.pressed.has(this.bindings[action])) return true
    return this.buttonPressed.has(this.gamepadButton(action))
  }

  /** Steering in [-1, 1] from keyboard and/or gamepad stick. */
  get steer(): number {
    let value = 0
    if (this.down.has(this.bindings.steerLeft)) value -= 1
    if (this.down.has(this.bindings.steerRight)) value += 1

    const pad = this.pad()
    if (pad) {
      const axis = pad.axes[0] ?? 0
      if (Math.abs(axis) > 0.12) value = axis
    }
    return Math.max(-1, Math.min(1, value))
  }

  /** Throttle in [0, 1]. */
  get throttle(): number {
    let value = this.down.has(this.bindings.accelerate) ? 1 : 0
    const pad = this.pad()
    if (pad) {
      const trigger = pad.buttons[7]?.value ?? 0
      if (trigger > 0.05) value = Math.max(value, trigger)
      if (pad.buttons[0]?.pressed) value = Math.max(value, 1)
    }
    return value
  }

  /** Service brake in [0, 1]. */
  get brake(): number {
    let value = this.down.has(this.bindings.brake) ? 1 : 0
    const pad = this.pad()
    if (pad) {
      const trigger = pad.buttons[6]?.value ?? 0
      if (trigger > 0.05) value = Math.max(value, trigger)
    }
    return value
  }

  /**
   * Clear key/button edges once a simulation step has consumed them.
   *
   * The game loop is a fixed-step accumulator, so some animation frames run
   * zero steps (any display above ~60 Hz, or a jittery one). Clearing edges on
   * the render frame instead of here silently swallowed those key presses -
   * taps like E and B simply never registered.
   */
  endStep(): void {
    this.pressed.clear()
    this.released.clear()
    this.buttonPressed.clear()
  }

  /** Clear pointer-look deltas after the camera has consumed them. */
  endFrame(): void {
    this.lookX = 0
    this.lookY = 0
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    window.removeEventListener('mousemove', this.onMouseMove)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    this.target.removeEventListener('contextmenu', this.preventMenu)
    this.down.clear()
    this.pressed.clear()
    this.released.clear()
    this.exitPointerLock()
  }

  requestPointerLock(): void {
    if (this.pointerLocked) return
    try {
      const result: unknown = this.target.requestPointerLock?.()
      // Chrome returns a promise that rejects (e.g. after an Esc exit cooldown).
      if (result instanceof Promise) result.catch(() => undefined)
    } catch {
      /* pointer lock unavailable - the player can click the canvas to retry */
    }
  }

  exitPointerLock(): void {
    if (this.pointerLocked) document.exitPointerLock?.()
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return
    if (!this.down.has(event.code)) this.pressed.add(event.code)
    this.down.add(event.code)
    // Stop the page scrolling / activating focused buttons while driving.
    if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault()
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (this.down.delete(event.code)) this.released.add(event.code)
  }

  private readonly onBlur = (): void => {
    for (const code of this.down) this.released.add(code)
    this.down.clear()
  }

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.pointerLocked) return
    this.lookX += event.movementX
    this.lookY += event.movementY
  }

  private readonly onPointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.target
  }

  private readonly preventMenu = (event: MouseEvent): void => event.preventDefault()

  private pad(): Gamepad | null {
    const pads = navigator.getGamepads?.() ?? []
    for (const pad of pads) if (pad && pad.connected) return pad
    return null
  }

  private gamepadButton(action: Action): number {
    switch (action) {
      case 'handbrake':
        return 1
      case 'horn':
        return 2
      case 'camera':
        return 3
      case 'interact':
        return 0
      case 'signalLeft':
        return 4
      case 'signalRight':
        return 5
      default:
        return -1
    }
  }

  private gamepadDown(action: Action): boolean {
    const pad = this.pad()
    if (!pad) return false
    const index = this.gamepadButton(action)
    if (index < 0) return false
    return pad.buttons[index]?.pressed ?? false
  }
}

export function defaultBindings(): Record<Action, string> {
  return {
    accelerate: 'KeyW',
    brake: 'KeyS',
    steerLeft: 'KeyA',
    steerRight: 'KeyD',
    handbrake: 'Space',
    signalLeft: 'KeyQ',
    signalRight: 'KeyR',
    horn: 'KeyH',
    headlights: 'KeyL',
    camera: 'KeyC',
    interact: 'KeyE',
    seatbelt: 'KeyB',
    wipers: 'KeyV',
    recenter: 'KeyN',
    recover: 'KeyT',
    pause: 'Escape',
  }
}
