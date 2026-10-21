/** Shared types used across the game, UI, and input layers. */

export type Action =
  | 'accelerate'
  | 'brake'
  | 'steerLeft'
  | 'steerRight'
  | 'handbrake'
  | 'signalLeft'
  | 'signalRight'
  | 'horn'
  | 'headlights'
  | 'camera'
  | 'interact'
  | 'seatbelt'
  | 'wipers'
  | 'recenter'
  | 'recover'
  | 'pause'

export type GraphicsPreset = 'low' | 'medium' | 'high'
export type InstructorLevel = 'beginner' | 'intermediate' | 'exam'
export type TrafficDensity = 'low' | 'normal' | 'high'
export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night'

export interface Settings {
  graphics: GraphicsPreset
  volume: number
  lookSensitivity: number
  fov: number
  instructorLevel: InstructorLevel
  immersiveHud: boolean
  trafficDensity: TrafficDensity
  bindings: Record<Action, string>
}

export type Severity = 'info' | 'minor' | 'serious' | 'dangerous'

export interface Feedback {
  text: string
  severity: Severity
}

export interface ObjectiveState {
  text: string
  done: boolean
}

export interface HudState {
  speed: number
  limit: number
  gear: string
  rpm: number
  fuel: number
  engineOn: boolean
  seatbelt: boolean
  handbrake: boolean
  signal: 'left' | 'right' | 'off'
  beams: 'off' | 'low' | 'high'
  clock: string
  instructor: string
  instructorSeverity: Severity | 'none'
  objectives: ObjectiveState[]
  destination: string
  distance: number
  score: number
  violations: number
}

export interface Mistake {
  text: string
  severity: Severity
}

export interface RunResult {
  kind: 'lesson' | 'mocktest' | 'free'
  title: string
  passed: boolean
  score: number
  mistakes: Mistake[]
  strengths: string[]
  tips: string[]
  xp: number
}

export interface Progress {
  xp: number
  lessons: Record<string, number>
  mockBest: number
  knowledgeBest: number
  achievements: string[]
}

export const DEFAULT_SETTINGS: Settings = {
  graphics: 'medium',
  volume: 0.7,
  lookSensitivity: 1,
  fov: 70,
  instructorLevel: 'beginner',
  immersiveHud: false,
  trafficDensity: 'normal',
  bindings: {
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
  },
}
