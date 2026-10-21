import type { LessonDef, LessonObjective } from '../content/alberta'
import type {
  Feedback,
  InstructorLevel,
  Mistake,
  ObjectiveState,
  RunResult,
  Severity,
} from '../types'

export type SimEvent =
  | { type: 'engineStart' }
  | { type: 'seatbelt' }
  | { type: 'parkingRelease' }
  | { type: 'moveOff'; signalled: boolean }
  | { type: 'properStop' }
  | { type: 'failedStop' }
  | { type: 'laneChange'; signalled: boolean; shoulderChecked: boolean }
  | { type: 'turn'; signalled: boolean; side: string }
  | { type: 'speeding'; limit: number; speed: number }
  | { type: 'following'; gapSeconds: number }
  | { type: 'collision'; impact: number; other: string }
  | { type: 'redLight' }
  | { type: 'yellowLightRun' }
  | { type: 'yieldPed'; yielded: boolean }
  | { type: 'wrongWay' }
  | { type: 'handbrakeDriving' }
  | { type: 'seatbeltMissing' }
  | { type: 'offRoad' }
  | { type: 'lightsNeeded' }
  | { type: 'parking'; success: boolean; kind: string }

const PENALTY: Record<Severity, number> = {
  info: 0,
  minor: -2,
  serious: -6,
  dangerous: -15,
}

/**
 * Turns driving events into instructor feedback, tracks lesson objectives, and
 * produces the final evaluation.
 *
 * Feedback is deliberately explanatory: the player is told *why* the rule
 * exists, not just that they were wrong.
 */
export class Instructor {
  level: InstructorLevel = 'beginner'
  lesson: LessonDef | null = null

  private score = 100
  private mistakes: Mistake[] = []
  private readonly counts = new Map<string, number>()
  private readonly cooldowns = new Map<string, number>()
  private current: Feedback | null = null
  private currentTimer = 0
  private elapsed = 0
  private seriousCount = 0
  private dangerousCount = 0
  private readonly praised = new Set<string>()

  begin(lesson: LessonDef | null, level: InstructorLevel): void {
    this.lesson = lesson
    this.level = level
    this.score = 100
    this.mistakes = []
    this.counts.clear()
    this.cooldowns.clear()
    this.praised.clear()
    this.current = null
    this.currentTimer = 0
    this.elapsed = 0
    this.seriousCount = 0
    this.dangerousCount = 0
  }

  tick(dt: number): void {
    this.elapsed += dt
    for (const [key, value] of this.cooldowns) {
      const next = value - dt
      if (next <= 0) this.cooldowns.delete(key)
      else this.cooldowns.set(key, next)
    }
    if (this.currentTimer > 0) {
      this.currentTimer -= dt
      if (this.currentTimer <= 0) this.current = null
    }
  }

  get liveFeedback(): Feedback | null {
    // Exam mode: no hand-holding during the drive.
    return this.level === 'exam' ? null : this.current
  }

  get currentScore(): number {
    return Math.round(Math.max(0, Math.min(100, this.score)))
  }

  get violationCount(): number {
    return this.mistakes.length
  }

  handle(event: SimEvent): void {
    const note = this.evaluate(event)
    if (!note) return

    const { id, severity, text, cooldown } = note
    this.counts.set(id, (this.counts.get(id) ?? 0) + 1)

    if (severity !== 'info') {
      this.score += PENALTY[severity]
      if (this.mistakes.every((m) => m.text !== text)) {
        this.mistakes.push({ text, severity })
      }
      if (severity === 'serious') this.seriousCount++
      if (severity === 'dangerous') this.dangerousCount++
    }

    if (this.level === 'exam') return

    // Beginner hears the good news too; intermediate only hears about problems.
    const isPraise = severity === 'info'
    if (isPraise && this.level !== 'beginner') return

    if (this.cooldowns.has(id)) return
    this.cooldowns.set(id, cooldown)

    this.current = { text, severity }
    this.currentTimer = severity === 'info' ? 4 : 7
  }

  /** Latest feedback, shown by the HUD. */
  get feedback(): Feedback | null {
    return this.current
  }

  objectives(): ObjectiveState[] {
    const defs = this.lesson?.objectives ?? []
    return defs.map((def) => ({ text: def.text, done: this.isObjectiveMet(def) }))
  }

  private isObjectiveMet(def: LessonObjective): boolean {
    const have = this.counts.get(def.id) ?? 0
    return def.need === 0 ? have === 0 : have >= def.need
  }

  get objectivesComplete(): boolean {
    const defs = this.lesson?.objectives ?? []
    if (defs.length === 0) return false
    return defs.every((def) => this.isObjectiveMet(def))
  }

  private evaluate(event: SimEvent): {
    id: string
    severity: Severity
    text: string
    cooldown: number
  } | null {
    switch (event.type) {
      case 'engineStart':
        return {
          id: 'engineStart',
          severity: 'info',
          cooldown: 6,
          text: 'Engine running. Check your mirrors before you move.',
        }
      case 'seatbelt':
        return {
          id: 'seatbelt',
          severity: 'info',
          cooldown: 6,
          text: 'Seatbelt fastened. It is the single most effective safety device in the car.',
        }
      case 'parkingRelease':
        return {
          id: 'parkingRelease',
          severity: 'info',
          cooldown: 6,
          text: 'Parking brake released. Check the indicator light is out before you move.',
        }
      case 'moveOff':
        if (!event.signalled) {
          return {
            id: 'moveOff',
            severity: 'minor',
            cooldown: 10,
            text: 'You pulled away without signalling. Even moving off from the kerb tells other road users what you are about to do.',
          }
        }
        return {
          id: 'moveOff',
          severity: 'info',
          cooldown: 8,
          text: 'Good start: mirrors, signal, shoulder check, then move away smoothly.',
        }

      case 'properStop':
        return {
          id: 'properStop',
          severity: 'info',
          cooldown: 6,
          text: 'Complete stop. Stationary is the only way you get a full view of the intersection before you commit.',
        }

      case 'failedStop':
        return {
          id: 'failedStop',
          severity: 'dangerous',
          cooldown: 8,
          text: 'You rolled through the stop sign. A stop means all four wheels stop turning behind the line - other road users are planning their move on the assumption that you are stationary.',
        }

      case 'laneChange':
        if (!event.signalled) {
          return {
            id: 'laneChange',
            severity: 'serious',
            cooldown: 6,
            text: 'You changed lanes without signalling. Signal at least three seconds before you move so others can anticipate where you will be.',
          }
        }
        if (!event.shoulderChecked) {
          return {
            id: 'laneChange',
            severity: 'serious',
            cooldown: 6,
            text: 'You moved over without checking your blind spot. Mirrors leave a gap - turn your head and look before you commit.',
          }
        }
        return {
          id: 'laneChange',
          severity: 'info',
          cooldown: 5,
          text: 'Correct lane change: mirror, signal, shoulder check, then a smooth move.',
        }

      case 'turn':
        if (!event.signalled) {
          return {
            id: 'turn',
            severity: 'serious',
            cooldown: 6,
            text: `You turned ${event.side} without signalling. Your signal tells others your intention before you start the manoeuvre - after the turn it is too late.`,
          }
        }
        return {
          id: 'turn',
          severity: 'info',
          cooldown: 8,
          text: 'Signal given in good time for the turn.',
        }

      case 'speeding': {
        const over = Math.round(event.speed - event.limit)
        if (over > 15) {
          return {
            id: 'speeding',
            severity: 'dangerous',
            cooldown: 8,
            text: `${event.speed} km/h in a ${event.limit} km/h zone - ${over} km/h over. At that speed your stopping distance roughly doubles and a pedestrian impact becomes unsurvivable.`,
          }
        }
        if (over > 5) {
          return {
            id: 'speeding',
            severity: 'serious',
            cooldown: 8,
            text: `${event.speed} km/h in a ${event.limit} km/h zone. Limits are set for ideal conditions; ease off before you reach the sign, not after you pass it.`,
          }
        }
        return {
          id: 'speeding',
          severity: 'minor',
          cooldown: 8,
          text: `A little over the posted ${event.limit} km/h limit (${event.speed} km/h). Small overages still shorten your stopping distance.`,
        }
      }

      case 'following': {
        const gap = event.gapSeconds.toFixed(1)
        if (event.gapSeconds < 1.2) {
          return {
            id: 'following',
            severity: 'serious',
            cooldown: 10,
            text: `Following distance is far too short (${gap}s). You need room to react - use at least a two-second gap and more when conditions worsen.`,
          }
        }
        return {
          id: 'following',
          severity: 'minor',
          cooldown: 12,
          text: `Close on the vehicle ahead (${gap}s). Pick a fixed point and count two full seconds to it.`,
        }
      }

      case 'collision': {
        const heavy = event.impact > 6
        return {
          id: 'collision',
          severity: heavy ? 'dangerous' : 'serious',
          cooldown: 3,
          text: heavy
            ? `Collision with ${event.other} at speed. Leave more space and scan further ahead so you have time to act.`
            : `You hit ${event.other}. Even a light contact is avoidable - keep your space cushion and watch what develops ahead.`,
        }
      }

      case 'redLight':
        return {
          id: 'redLight',
          severity: 'dangerous',
          cooldown: 6,
          text: 'You entered the intersection on a red light. A red light means stop and stay stopped - do not treat it as a stop sign you may roll past.',
        }

      case 'yellowLightRun':
        return {
          id: 'yellowLightRun',
          severity: 'serious',
          cooldown: 8,
          text: 'The light was amber and you accelerated to beat it. Amber means stop if you can do so safely - only proceed when stopping would be more dangerous.',
        }

      case 'yieldPed':
        if (!event.yielded) {
          return {
            id: 'yieldPed',
            severity: 'serious',
            cooldown: 8,
            text: 'A pedestrian was in the crosswalk and you did not yield. Drivers must stop and let them finish crossing before you move.',
          }
        }
        if (!this.praised.has('yieldPed')) {
          this.praised.add('yieldPed')
          return {
            id: 'yieldPed',
            severity: 'info',
            cooldown: 6,
            text: 'Good - you gave the pedestrian the whole crossing.',
          }
        }
        this.counts.set('yieldPed', (this.counts.get('yieldPed') ?? 0) + 1)
        return null

      case 'wrongWay':
        return {
          id: 'wrongWay',
          severity: 'dangerous',
          cooldown: 6,
          text: 'You are on the wrong side of the road. Keep right - the left side is for opposing traffic unless the road marking says otherwise.',
        }

      case 'handbrakeDriving':
        return {
          id: 'handbrakeDriving',
          severity: 'minor',
          cooldown: 12,
          text: 'You are moving with the parking brake still engaged. It overheats the brakes and ruins your stopping ability.',
        }

      case 'seatbeltMissing':
        return {
          id: 'seatbeltMissing',
          severity: 'minor',
          cooldown: 20,
          text: 'Your seatbelt is not fastened. It must be on before the vehicle moves - press B.',
        }

      case 'offRoad':
        return {
          id: 'offRoad',
          severity: 'info',
          cooldown: 10,
          text: 'Careful - you have left the roadway. Grip drops on grass and gravel, so straighten up and slow down before steering back on.',
        }

      case 'lightsNeeded':
        return {
          id: 'lightsNeeded',
          severity: 'minor',
          cooldown: 30,
          text: 'Headlights are required at night, in fog and in rain. You cannot see and cannot be seen without them - press L.',
        }

      case 'parking':
        if (event.success) {
          return {
            id: event.kind,
            severity: 'info',
            cooldown: 6,
            text: `Clean ${event.kind} park - lined up, close to the kerb, and nothing touched.`,
          }
        }
        return {
          id: event.kind,
          severity: 'minor',
          cooldown: 6,
          text: `That ${event.kind} park needs another go. Aim to finish parallel to the kerb, roughly half a metre out, fully inside the space.`,
        }

      default:
        return null
    }
  }

  finish(
    kind: 'lesson' | 'mocktest' | 'free',
    title: string,
    destinationReached = true,
  ): RunResult {
    const score = this.currentScore
    const passed =
      kind === 'mocktest'
        ? score >= 70 && this.dangerousCount < 3
        : kind === 'lesson'
          ? this.objectivesComplete
          : true

    const strengths: string[] = []
    const tips: string[] = []
    const seen = new Set<string>()

    for (const mistake of this.mistakes) {
      const category = mistake.text.split('.')[0].split(' ').slice(0, 3).join(' ')
      if (seen.has(category)) continue
      seen.add(category)
      if (tips.length < 4) tips.push(mistake.text)
    }

    if ((this.counts.get('properStop') ?? 0) >= 3)
      strengths.push('Consistent, complete stops at stop signs.')
    if ((this.counts.get('laneChange') ?? 0) >= 2)
      strengths.push('Well-structured lane changes with shoulder checks.')
    if ((this.counts.get('yieldPed') ?? 0) >= 1)
      strengths.push('Correctly yielded to pedestrians.')
    if (
      !this.mistakes.some((m) => m.severity === 'serious' || m.severity === 'dangerous')
    ) {
      strengths.push('No serious or dangerous errors during the drive.')
    }
    if ((this.counts.get('speeding') ?? 0) === 0)
      strengths.push('Held to the posted speed limit throughout.')
    if ((this.counts.get('collision') ?? 0) === 0)
      strengths.push('Kept clear of other road users - no collisions.')

    if (strengths.length === 0) strengths.push('You completed the drive.')
    if (tips.length === 0)
      tips.push('Repeat the route and concentrate on smoothness and observation.')

    const objectiveBonus = this.objectives().filter((o) => o.done).length * 5
    const xp = Math.max(10, Math.round(score * 1.5 + objectiveBonus + (passed ? 60 : 15)))

    void destinationReached
    void this.seriousCount

    return {
      kind,
      title,
      passed,
      score,
      mistakes: this.mistakes,
      strengths,
      tips,
      xp,
    }
  }
}
