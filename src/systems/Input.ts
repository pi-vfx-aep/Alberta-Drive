/**
 * Keyboard and pointer state.
 *
 * Edge-triggered queries ({@link Input.justPressed} / {@link Input.justReleased})
 * are only valid within the current frame; they are cleared by
 * {@link Input.endFrame}, which the {@link Game} calls once per frame.
 *
 * Keys are identified by `KeyboardEvent.code` (physical key), e.g. `'KeyW'`,
 * `'ArrowLeft'`, `'Space'`.
 */

export interface PointerState {
  /** Pointer position in CSS pixels relative to the canvas. */
  x: number
  y: number
  /** Pointer position in normalised device coordinates [-1, 1]. */
  ndcX: number
  ndcY: number
  /** Change in pointer position since the previous frame (CSS pixels). */
  deltaX: number
  deltaY: number
  /** Currently held mouse buttons (bitmask from `MouseEvent.button`). */
  buttons: number
}

export class Input {
  readonly pointer: PointerState = {
    x: 0,
    y: 0,
    ndcX: 0,
    ndcY: 0,
    deltaX: 0,
    deltaY: 0,
    buttons: 0,
  }

  private readonly down = new Set<string>()
  private readonly pressed = new Set<string>()
  private readonly released = new Set<string>()
  private lastPointerX = 0
  private lastPointerY = 0
  private hasPointer = false

  constructor(private readonly target: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)

    target.addEventListener('pointerdown', this.onPointerDown)
    target.addEventListener('pointerup', this.onPointerUp)
    target.addEventListener('pointermove', this.onPointerMove)
    target.addEventListener('pointerleave', this.onPointerLeave)
    target.addEventListener('contextmenu', this.onContextMenu)
  }

  /** True while the key is held. */
  isDown(code: string): boolean {
    return this.down.has(code)
  }

  /** True only on the frame the key went down. */
  justPressed(code: string): boolean {
    return this.pressed.has(code)
  }

  /** True only on the frame the key went up. */
  justReleased(code: string): boolean {
    return this.released.has(code)
  }

  /** True while any of the given keys is held. */
  anyDown(...codes: string[]): boolean {
    return codes.some((code) => this.down.has(code))
  }

  /** Clear edge-triggered state. Called by the Game at the end of each frame. */
  endFrame(): void {
    this.pressed.clear()
    this.released.clear()
    this.pointer.deltaX = 0
    this.pointer.deltaY = 0
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)

    this.target.removeEventListener('pointerdown', this.onPointerDown)
    this.target.removeEventListener('pointerup', this.onPointerUp)
    this.target.removeEventListener('pointermove', this.onPointerMove)
    this.target.removeEventListener('pointerleave', this.onPointerLeave)
    this.target.removeEventListener('contextmenu', this.onContextMenu)
    this.down.clear()
    this.pressed.clear()
    this.released.clear()
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return
    if (!this.down.has(event.code)) this.pressed.add(event.code)
    this.down.add(event.code)
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (this.down.delete(event.code)) this.released.add(event.code)
  }

  /** Releasing keys on focus loss avoids stuck keys when the tab changes. */
  private readonly onBlur = (): void => {
    for (const code of this.down) this.released.add(code)
    this.down.clear()
    this.pointer.buttons = 0
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.target.setPointerCapture?.(event.pointerId)
    this.target.focus?.()
    this.pointer.buttons = event.buttons
    this.updatePointerPosition(event)
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    this.pointer.buttons = event.buttons
    this.updatePointerPosition(event)
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    this.updatePointerPosition(event)
  }

  private readonly onPointerLeave = (_event: PointerEvent): void => {
    this.pointer.buttons = 0
  }

  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
  }

  private updatePointerPosition(event: PointerEvent): void {
    const rect = this.target.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    if (!this.hasPointer) {
      this.lastPointerX = x
      this.lastPointerY = y
      this.hasPointer = true
    }

    this.pointer.deltaX += x - this.lastPointerX
    this.pointer.deltaY += y - this.lastPointerY
    this.lastPointerX = x
    this.lastPointerY = y

    this.pointer.x = x
    this.pointer.y = y
    this.pointer.ndcX = rect.width > 0 ? (x / rect.width) * 2 - 1 : 0
    this.pointer.ndcY = rect.height > 0 ? 1 - (y / rect.height) * 2 : 0
  }
}
