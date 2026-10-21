/**
 * Procedural vehicle and cabin audio built on the Web Audio API - no asset
 * files required. Engine note tracks RPM, road/wind noise tracks speed, and
 * the indicators, horn and chimes are synthesised.
 */

export class Sound {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private engineGain: GainNode | null = null
  private engineFilter: BiquadFilterNode | null = null
  private oscA: OscillatorNode | null = null
  private oscB: OscillatorNode | null = null
  private noiseGain: GainNode | null = null
  private noiseFilter: BiquadFilterNode | null = null
  private tickTimer = 0
  private running = false

  constructor(private volume: number) {}

  /** Must be called from a user gesture (browsers block audio otherwise). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }

    const Ctor =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return

    const ctx = new Ctor()
    this.ctx = ctx

    const master = ctx.createGain()
    master.gain.value = this.volume
    master.connect(ctx.destination)
    this.master = master

    // --- Engine: two detuned saws through a lowpass, plus a sub ---
    const engineGain = ctx.createGain()
    engineGain.gain.value = 0
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 700
    filter.Q.value = 1.2
    engineGain.connect(filter)
    filter.connect(master)

    const oscA = ctx.createOscillator()
    oscA.type = 'sawtooth'
    oscA.frequency.value = 45
    const oscB = ctx.createOscillator()
    oscB.type = 'square'
    oscB.frequency.value = 22.5
    const subGain = ctx.createGain()
    subGain.gain.value = 0.5
    oscA.connect(engineGain)
    oscB.connect(subGain)
    subGain.connect(engineGain)
    oscA.start()
    oscB.start()

    this.engineGain = engineGain
    this.engineFilter = filter
    this.oscA = oscA
    this.oscB = oscB

    // --- Road / wind noise: filtered white noise ---
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuffer
    noise.loop = true
    const noiseFilter = ctx.createBiquadFilter()
    noiseFilter.type = 'bandpass'
    noiseFilter.frequency.value = 500
    noiseFilter.Q.value = 0.7
    const noiseGain = ctx.createGain()
    noiseGain.gain.value = 0
    noise.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(master)
    noise.start()

    this.noiseGain = noiseGain
    this.noiseFilter = noiseFilter
    this.running = true
  }

  setVolume(value: number): void {
    this.volume = value
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05)
    }
  }

  /**
   * Drive the engine and road noise from the current vehicle state.
   *
   * @param rpm Engine speed.
   * @param speed Metres per second.
   * @param throttle 0..1
   * @param slip Tyre slip amount (drives the "scrubbing" sound).
   */
  updateEngine(
    rpm: number,
    speed: number,
    throttle: number,
    slip: number,
    engineOn: boolean,
  ): void {
    if (!this.ctx || !this.engineGain || !this.oscA || !this.oscB || !this.noiseGain)
      return

    const t = this.ctx.currentTime
    // Firing frequency of a 4-cylinder: rpm/60 * 2.
    const base = engineOn ? (Math.max(rpm, 600) / 60) * 2 : 0
    this.oscA.frequency.setTargetAtTime(base, t, 0.05)
    this.oscB.frequency.setTargetAtTime(base * 0.5, t, 0.05)

    const load = engineOn ? 0.05 + throttle * 0.1 + (rpm / 6500) * 0.05 : 0
    this.engineGain.gain.setTargetAtTime(load, t, 0.08)
    if (this.engineFilter) {
      this.engineFilter.frequency.setTargetAtTime(
        400 + rpm * 0.15 + throttle * 400,
        t,
        0.1,
      )
    }

    const roadVolume = Math.min(speed / 35, 1) * 0.12 + Math.min(slip / 6, 1) * 0.1
    this.noiseGain.gain.setTargetAtTime(roadVolume, t, 0.15)
    if (this.noiseFilter) {
      this.noiseFilter.frequency.setTargetAtTime(350 + speed * 22, t, 0.15)
    }
  }

  /** Tick-tock for an active indicator. Called each frame with dt. */
  updateSignal(active: boolean, dt: number): void {
    if (!this.ctx || !this.master) return
    if (!active) {
      this.tickTimer = 0
      return
    }
    this.tickTimer -= dt
    if (this.tickTimer <= 0) {
      this.tickTimer = 0.85
      this.blip(1400, 0.045, 0.06, 'square')
    }
  }

  horn(active: boolean): void {
    if (!active) return
    this.blip(392, 0.12, 0.18, 'sawtooth', 0.0)
  }

  private hornStop: OscillatorNode | null = null

  setHorn(on: boolean): void {
    if (!this.ctx || !this.master) return
    if (on && !this.hornStop) {
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.value = 400
      gain.gain.value = 0.12
      osc.connect(gain)
      gain.connect(this.master)
      osc.start()
      this.hornStop = osc
    } else if (!on && this.hornStop) {
      try {
        this.hornStop.stop()
      } catch {
        /* already stopped */
      }
      this.hornStop.disconnect()
      this.hornStop = null
    }
  }

  /** Short chime used for warnings and the seatbelt reminder. */
  chime(freq = 880): void {
    this.blip(freq, 0.12, 0.08, 'sine')
  }

  /** Indicators/engine-stop click. */
  click(): void {
    this.blip(2200, 0.03, 0.05, 'square')
  }

  crash(intensity: number): void {
    if (!this.ctx || !this.master) return
    const ctx = this.ctx
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
      const decay = 1 - i / data.length
      data[i] = (Math.random() * 2 - 1) * decay * decay
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 1800
    const gain = ctx.createGain()
    gain.gain.value = Math.min(0.6, 0.15 + intensity * 0.06)
    source.connect(filter)
    filter.connect(gain)
    gain.connect(this.master)
    source.start()
  }

  private blip(
    freq: number,
    duration: number,
    level: number,
    type: OscillatorType,
    delay = 0,
  ): void {
    if (!this.ctx || !this.master) return
    const ctx = this.ctx
    const start = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(level, start + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    osc.connect(gain)
    gain.connect(this.master)
    osc.start(start)
    osc.stop(start + duration + 0.05)
  }

  dispose(): void {
    this.running = false
    this.setHorn(false)
    try {
      void this.ctx?.close()
    } catch {
      /* ignore */
    }
    this.ctx = null
    this.master = null
    this.engineGain = null
    this.oscA = null
    this.oscB = null
    this.noiseGain = null
  }

  get isRunning(): boolean {
    return this.running
  }
}
