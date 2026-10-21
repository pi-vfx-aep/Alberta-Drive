import {
  ACHIEVEMENTS,
  DISCLAIMER,
  LESSONS,
  QUESTIONS,
  type LessonDef,
} from '../content/alberta'
import { Game, type WeatherKind } from '../game/Game'
import {
  ACTION_LABELS,
  defaultBindings,
  keyLabel,
  loadKeymap,
  saveBindings,
} from '../systems/Input'
import {
  DEFAULT_SETTINGS,
  type Action,
  type HudState,
  type Progress,
  type RunResult,
  type Settings,
  type TimeOfDay,
} from '../types'

type ScreenId =
  'menu' | 'free' | 'lessons' | 'knowledge' | 'settings' | 'howto' | 'pause' | 'results'

const SETTINGS_KEY = 'alberta-drive.settings'
const PROGRESS_KEY = 'alberta-drive.progress'

const WEATHER_LABELS: { id: WeatherKind; label: string }[] = [
  { id: 'clear', label: 'Clear' },
  { id: 'rain', label: 'Rain' },
  { id: 'snow', label: 'Snow / winter' },
  { id: 'fog', label: 'Fog' },
]

const HUD_KEYS: { action: Action; hint: string }[] = [
  { action: 'accelerate', hint: 'gas' },
  { action: 'brake', hint: 'brake' },
  { action: 'steerLeft', hint: 'left' },
  { action: 'steerRight', hint: 'right' },
  { action: 'handbrake', hint: 'park brake' },
  { action: 'signalLeft', hint: 'sig ◀' },
  { action: 'signalRight', hint: 'sig ▶' },
  { action: 'horn', hint: 'horn' },
  { action: 'headlights', hint: 'lights' },
  { action: 'camera', hint: 'camera' },
  { action: 'interact', hint: 'ignition' },
  { action: 'seatbelt', hint: 'belt' },
  { action: 'wipers', hint: 'wipers' },
  { action: 'recenter', hint: 'recenter' },
  { action: 'recover', hint: 'recover' },
  { action: 'pause', hint: 'pause' },
]

/**
 * Every screen in the game: menus, the HUD overlay, and the evaluation report.
 * The UI owns settings and progress persistence; the simulation lives in Game.
 */
export class UI {
  private readonly game: { current: Game | null } = { current: null }
  private settings: Settings
  private progress: Progress
  private returnTo: ScreenId = 'menu'
  private rebindAction: Action | null = null
  private quiz: {
    order: number[]
    index: number
    correct: number
    picked: number | null
  } | null = null
  private pendingResult: RunResult | null = null
  private lastObjectivesKey = ''

  constructor(
    private readonly root: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.settings = loadJson<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS)
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...this.settings,
      bindings: { ...defaultBindings(), ...loadKeymap() },
    }
    this.progress = loadJson<Progress>(PROGRESS_KEY, {
      xp: 0,
      lessons: {},
      mockBest: 0,
      knowledgeBest: 0,
      achievements: [],
    })

    this.root.innerHTML = this.template()
    this.wire()
    this.show('menu')
  }

  /* ------------------------------- template ------------------------------ */

  private template(): string {
    return `
    <div class="hud immersive-off" id="hud" hidden>
      <div class="hud-tl">
        <div class="hud-dest"><span id="hud-dest"></span><b id="hud-dist"></b></div>
        <ul id="hud-objectives"></ul>
      </div>
      <div class="hud-tr">
        <div class="hud-score"><b id="hud-score">100</b><span>score &middot; <span id="hud-violations">0</span> faults</span></div>
        <div class="hud-clock" id="hud-clock">14:30</div>
      </div>
      <div class="hud-bl">
        <div class="hud-speed"><b id="hud-speed">0</b><span>km/h</span></div>
        <div class="hud-limit"><span>limit</span><b id="hud-limit">50</b></div>
        <div class="hud-gear" id="hud-gear">P</div>
        <div class="hud-lamps" id="hud-lamps"></div>
      </div>
      <div class="hud-c"><div class="hud-instructor" id="hud-instructor"></div></div>
      <div class="hud-keys">${HUD_KEYS.map(
        (k) =>
          `<span><kbd>${keyLabel(this.settings.bindings[k.action] ?? defaultBindings()[k.action])}</kbd> ${k.hint}</span>`,
      ).join('')}</div>
    </div>

    <section class="screen" data-screen="menu">
      <div class="panel wide">
        <h1>Alberta Drive</h1>
        <p class="tagline">A first-person driving simulator for Alberta learner and road-test preparation.</p>
        <div class="menu-grid">
          <button class="big" data-go="free">Free Drive</button>
          <button class="big" data-go="lessons">Lessons &amp; Mock Road Test</button>
          <button class="big" data-action="knowledge">Practice Knowledge Test</button>
          <button class="big" data-go="settings">Settings</button>
          <button class="big" data-go="howto">How to Play</button>
        </div>
        <div class="stats" id="menu-stats"></div>
        <ul class="achievements" id="menu-achievements"></ul>
        <p class="disclaimer">${DISCLAIMER}</p>
      </div>
    </section>

    <section class="screen" data-screen="free">
      <div class="panel">
        <h2>Free Drive</h2>
        <p>Explore the town and highway with no instructor. Pick your conditions.</p>
        <label>Weather
          <select id="opt-weather">
            ${WEATHER_LABELS.map((w) => `<option value="${w.id}">${w.label}</option>`).join('')}
          </select>
        </label>
        <label>Time of day
          <select id="opt-time">
            <option value="dawn">Dawn (06:20)</option>
            <option value="day" selected>Day (14:30)</option>
            <option value="dusk">Dusk (19:45)</option>
            <option value="night">Night (22:10) - headlights required</option>
          </select>
        </label>
        <div class="buttons">
          <button class="primary" data-action="start-free">Start driving</button>
          <button data-go="menu">Back</button>
        </div>
      </div>
    </section>

    <section class="screen" data-screen="lessons">
      <div class="panel wide">
        <h2>Lessons</h2>
        <div class="lesson-grid" id="lesson-grid"></div>
        <div class="buttons"><button data-go="menu">Back</button></div>
      </div>
    </section>

    <section class="screen" data-screen="knowledge">
      <div class="panel">
        <h2>Practice Knowledge Test</h2>
        <div id="quiz-body"></div>
        <div class="buttons">
          <button data-action="quiz-restart">Restart</button>
          <button data-go="menu">Exit</button>
        </div>
        <p class="disclaimer">${DISCLAIMER}</p>
      </div>
    </section>

    <section class="screen" data-screen="settings">
      <div class="panel">
        <h2>Settings</h2>
        <label>Graphics preset
          <select id="opt-graphics">
            <option value="low">Low (no shadows or mirrors)</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label>Volume <input type="range" id="opt-volume" min="0" max="1" step="0.05" /></label>
        <label>Look sensitivity <input type="range" id="opt-sens" min="0.3" max="2.5" step="0.1" /></label>
        <label>Field of view <input type="range" id="opt-fov" min="60" max="95" step="1" /></label>
        <label>Instructor
          <select id="opt-instructor">
            <option value="beginner">Beginner - frequent guidance</option>
            <option value="intermediate">Intermediate - feedback after mistakes</option>
            <option value="exam">Exam mode - minimal assistance</option>
          </select>
        </label>
        <label class="row"><input type="checkbox" id="opt-immersive" /> Simplified HUD (maximum immersion)</label>
        <label>Traffic density
          <select id="opt-traffic">
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </label>
        <h3>Controls</h3>
        <div class="binds" id="bind-list"></div>
        <div class="buttons">
          <button data-action="reset-binds">Restore default keys</button>
          <button data-action="settings-back">Done</button>
        </div>
        <p class="hint">Gamepads and steering wheels are supported: left stick steers, RT accelerates, LT brakes.</p>
      </div>
    </section>

    <section class="screen" data-screen="howto">
      <div class="panel">
        <h2>How to Play</h2>
        <ol class="howto">
          <li>Click the road to lock the mouse, then use it to look around, check mirrors and look over your shoulder.</li>
          <li><kbd>${this.key('interact')}</kbd> starts and stops the engine, <kbd>${this.key('seatbelt')}</kbd> fastens the seatbelt, <kbd>${this.key('handbrake')}</kbd> releases the parking brake.</li>
          <li><kbd>${this.key('accelerate')}</kbd> accelerate, <kbd>${this.key('brake')}</kbd> brake - hold the brake at a standstill to select reverse.</li>
          <li><kbd>${this.key('signalLeft')}</kbd> / <kbd>${this.key('signalRight')}</kbd> turn signals, <kbd>${this.key('headlights')}</kbd> headlights and high beams, <kbd>${this.key('camera')}</kbd> changes camera.</li>
          <li><kbd>${this.key('recenter')}</kbd> recentres your view, <kbd>${this.key('recover')}</kbd> puts the car back on the road if you get stuck.</li>
          <li>Learn by driving: the instructor explains the reason behind every correction.</li>
        </ol>
        <p class="disclaimer">${DISCLAIMER}</p>
        <div class="buttons"><button data-go="menu">Back</button></div>
      </div>
    </section>

    <section class="screen" data-screen="pause">
      <div class="panel">
        <h2>Paused</h2>
        <div class="buttons stack">
          <button class="primary" data-action="resume">Resume</button>
          <button data-action="restart">Restart drive</button>
          <button data-action="open-settings">Settings</button>
          <button data-action="quit">Quit to menu</button>
        </div>
        <p class="hint">Click the road to lock the mouse again when you resume.</p>
      </div>
    </section>

    <section class="screen" data-screen="results">
      <div class="panel wide" id="results-body"></div>
    </section>`
  }

  /* --------------------------------- wiring ------------------------------- */

  private wire(): void {
    this.root.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('button, .card')
      if (!target) return
      // Any click other than a bind row disarms a pending rebind.
      if (!target.dataset.bind) this.rebindAction = null

      const go = target.dataset.go as ScreenId | undefined
      if (go) {
        this.returnTo = 'menu'
        this.show(go)
        return
      }

      const lessonId = target.dataset.lesson
      if (lessonId) {
        const lesson = LESSONS.find((l) => l.id === lessonId)
        if (lesson) this.startRun(lesson, 'clear', 'day')
        return
      }

      switch (target.dataset.action) {
        case 'start-free':
          this.startRun(
            null,
            (this.$<HTMLSelectElement>('#opt-weather').value ?? 'clear') as WeatherKind,
            (this.$<HTMLSelectElement>('#opt-time').value ?? 'day') as TimeOfDay,
          )
          break
        case 'knowledge':
          this.startQuiz()
          this.show('knowledge')
          break
        case 'quiz-restart':
          this.startQuiz()
          break
        case 'resume':
          this.resume()
          break
        case 'restart':
          this.game.current?.restart()
          this.resume()
          break
        case 'quit':
          this.quitToMenu()
          break
        case 'open-settings':
          this.returnTo = 'pause'
          this.show('settings')
          break
        case 'settings-back':
          this.show(this.returnTo)
          break
        case 'reset-binds':
          saveBindings(defaultBindings())
          this.renderBinds()
          break
        default:
          break
      }
    })

    this.$<HTMLSelectElement>('#opt-graphics').addEventListener('change', (event) => {
      this.settings.graphics = (event.target as HTMLSelectElement)
        .value as Settings['graphics']
      this.saveSettings()
    })
    this.$<HTMLInputElement>('#opt-volume').addEventListener('input', (event) => {
      this.settings.volume = Number((event.target as HTMLInputElement).value)
      this.game.current?.setVolume(this.settings.volume)
      this.saveSettings()
    })
    this.$<HTMLInputElement>('#opt-sens').addEventListener('input', (event) => {
      this.settings.lookSensitivity = Number((event.target as HTMLInputElement).value)
      this.saveSettings()
    })
    this.$<HTMLInputElement>('#opt-fov').addEventListener('input', (event) => {
      this.settings.fov = Number((event.target as HTMLInputElement).value)
      this.saveSettings()
    })
    this.$<HTMLSelectElement>('#opt-instructor').addEventListener('change', (event) => {
      this.settings.instructorLevel = (event.target as HTMLSelectElement)
        .value as Settings['instructorLevel']
      this.saveSettings()
    })
    this.$<HTMLInputElement>('#opt-immersive').addEventListener('change', (event) => {
      this.settings.immersiveHud = (event.target as HTMLInputElement).checked
      this.$('#hud').classList.toggle('immersive', this.settings.immersiveHud)
      this.saveSettings()
    })
    this.$<HTMLSelectElement>('#opt-traffic').addEventListener('change', (event) => {
      this.settings.trafficDensity = (event.target as HTMLSelectElement)
        .value as Settings['trafficDensity']
      this.saveSettings()
    })

    // Key rebinding capture. Only armed while its own row was clicked, and
    // disarmed by show() or by clicking anything that is not a bind row -
    // otherwise an abandoned rebind silently eats the next key press.
    window.addEventListener('keydown', (event) => {
      if (!this.rebindAction) return
      event.preventDefault()
      event.stopPropagation()
      const action = this.rebindAction
      this.rebindAction = null
      const bindings = { ...loadKeymap(), [action]: event.code }
      saveBindings(bindings)
      this.renderBinds()
    })
  }

  private $<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.root.querySelector<T>(selector) as T
  }

  /** Current binding label for an action, falling back to the default. */
  private key(action: Action): string {
    return keyLabel(this.settings.bindings[action] ?? defaultBindings()[action])
  }

  private show(screen: ScreenId): void {
    this.rebindAction = null
    for (const section of this.root.querySelectorAll<HTMLElement>('.screen')) {
      section.hidden = section.dataset.screen !== screen
    }
    this.$('#hud').hidden = screen !== 'pause'

    if (screen === 'menu') {
      this.$('#menu-stats').innerHTML =
        `<b>${this.progress.xp}</b> XP &middot; best mock test <b>${this.progress.mockBest}</b> &middot; best knowledge <b>${this.progress.knowledgeBest}%</b>`
      this.$('#menu-achievements').innerHTML = ACHIEVEMENTS.map((a) => {
        const owned = this.progress.achievements.includes(a.id)
        return `<li class="${owned ? 'owned' : ''}">${a.name}<span>${a.desc}</span></li>`
      }).join('')
    }

    if (screen === 'lessons') {
      this.$('#lesson-grid').innerHTML = LESSONS.map((lesson) => {
        const best = this.progress.lessons[lesson.id] ?? 0
        return `<button class="card" data-lesson="${lesson.id}">
          <div class="card-title">${lesson.title}</div>
          <div class="card-sub">${lesson.kind === 'mocktest' ? 'Road test simulation' : 'Lesson'}${
            best ? ` &middot; best ${best}` : ''
          }</div>
          <p>${lesson.blurb}</p>
        </button>`
      }).join('')
    }

    if (screen === 'settings') {
      this.$<HTMLSelectElement>('#opt-graphics').value = this.settings.graphics
      this.$<HTMLInputElement>('#opt-volume').value = String(this.settings.volume)
      this.$<HTMLInputElement>('#opt-sens').value = String(this.settings.lookSensitivity)
      this.$<HTMLInputElement>('#opt-fov').value = String(this.settings.fov)
      this.$<HTMLSelectElement>('#opt-instructor').value = this.settings.instructorLevel
      this.$<HTMLInputElement>('#opt-immersive').checked = this.settings.immersiveHud
      this.$<HTMLSelectElement>('#opt-traffic').value = this.settings.trafficDensity
      this.renderBinds()
    }
  }

  private renderBinds(): void {
    const bindings = loadKeymap()
    const list = this.$('#bind-list')
    list.innerHTML = (Object.keys(ACTION_LABELS) as Action[])
      .map((action) => {
        const code = bindings[action] ?? defaultBindings()[action]
        const active = this.rebindAction === action
        return `<button class="bind" data-bind="${action}"><span>${ACTION_LABELS[action]}</span><kbd>${
          active ? 'press a key…' : keyLabel(code)
        }</kbd></button>`
      })
      .join('')

    for (const button of list.querySelectorAll<HTMLElement>('[data-bind]')) {
      button.addEventListener('click', () => {
        this.rebindAction = button.dataset.bind as Action
        this.renderBinds()
      })
    }
  }

  /* --------------------------------- game --------------------------------- */

  private startRun(
    lesson: LessonDef | null,
    weather: WeatherKind,
    time: TimeOfDay,
  ): void {
    this.game.current?.dispose()
    this.lastObjectivesKey = ''

    const game = new Game({
      canvas: this.canvas,
      settings: this.settings,
      lesson,
      weather,
      time,
      onHud: (state) => this.updateHud(state),
      onPaused: () => this.pause(),
      onFinish: (result) => this.showResults(result),
    })
    this.game.current = game

    for (const section of this.root.querySelectorAll<HTMLElement>('.screen'))
      section.hidden = true
    this.$('#hud').hidden = false
    this.$('#hud').classList.toggle('immersive', this.settings.immersiveHud)
    game.start()
  }

  private pause(): void {
    if (!this.game.current) return
    this.game.current.setPaused(true)
    this.show('pause')
    this.$('#hud').hidden = false
  }

  private resume(): void {
    if (!this.game.current) {
      this.show('menu')
      return
    }
    for (const section of this.root.querySelectorAll<HTMLElement>('.screen'))
      section.hidden = true
    this.$('#hud').hidden = false
    this.game.current.setPaused(false)
  }

  private quitToMenu(): void {
    this.game.current?.dispose()
    this.game.current = null
    this.$('#hud').hidden = true
    this.show('menu')
  }

  /* --------------------------------- HUD ---------------------------------- */

  private updateHud(state: HudState): void {
    this.$('#hud-speed').textContent = String(state.speed)
    this.$('#hud-limit').textContent = String(state.limit)
    this.$('#hud-gear').textContent = state.gear
    this.$('#hud-clock').textContent = state.clock
    this.$('#hud-score').textContent = String(state.score)
    this.$('#hud-violations').textContent = String(state.violations)
    this.$('#hud-dest').textContent = state.destination
    this.$('#hud-dist').textContent = state.distance > 0 ? `${state.distance} m` : ''

    const lamps = this.$('#hud-lamps')
    const lampKey = [
      state.signal,
      state.beams,
      state.seatbelt,
      state.handbrake,
      state.engineOn,
      state.fuel < 0.15,
    ].join('|')
    if (lampKey !== this.lastLampKey) {
      this.lastLampKey = lampKey
      lamps.innerHTML = [
        state.signal === 'left'
          ? '<i class="lamp on green">◀</i>'
          : '<i class="lamp green">◀</i>',
        state.signal === 'right'
          ? '<i class="lamp on green">▶</i>'
          : '<i class="lamp green">▶</i>',
        state.beams === 'high' ? '<i class="lamp on blue">HIGH</i>' : '',
        state.seatbelt ? '' : '<i class="lamp on red">BELT</i>',
        state.handbrake ? '<i class="lamp on red">BRAKE</i>' : '',
        state.engineOn ? '' : '<i class="lamp on amber">ENG OFF</i>',
        state.fuel < 0.15 ? '<i class="lamp on amber">FUEL</i>' : '',
      ].join('')
    }

    const instructor = this.$('#hud-instructor')
    instructor.textContent = state.instructor
    instructor.className = `hud-instructor sev-${state.instructorSeverity}`

    const objectivesKey = state.objectives.map((o) => `${o.text}:${o.done}`).join('|')
    if (objectivesKey !== this.lastObjectivesKey) {
      this.lastObjectivesKey = objectivesKey
      this.$('#hud-objectives').innerHTML = state.objectives
        .map(
          (o) =>
            `<li class="${o.done ? 'done' : ''}">${o.done ? '✓' : '○'} ${o.text}</li>`,
        )
        .join('')
    }
  }

  private lastLampKey = ''

  /* -------------------------------- results ------------------------------- */

  private showResults(result: RunResult): void {
    this.pendingResult = result
    this.applyProgress(result)

    const verdict = result.passed ? 'PASS' : 'NEEDS PRACTICE'
    const body = this.$('#results-body')
    body.innerHTML = `
      <h2>${result.title}</h2>
      <div class="verdict ${result.passed ? 'pass' : 'fail'}">${verdict}</div>
      <div class="result-grid">
        <div><b>${result.score}</b><span>score</span></div>
        <div><b>+${result.xp}</b><span>XP</span></div>
        <div><b>${result.mistakes.length}</b><span>faults</span></div>
      </div>
      <h3>Strengths</h3>
      <ul class="good">${result.strengths.map((s) => `<li>${s}</li>`).join('')}</ul>
      <h3>Mistakes and how to fix them</h3>
      ${
        result.mistakes.length
          ? `<ul class="bad">${result.mistakes
              .map(
                (m) =>
                  `<li class="sev-${m.severity}"><b>${m.severity}</b> ${m.text}</li>`,
              )
              .join('')}</ul>`
          : '<p class="hint">No faults recorded.</p>'
      }
      <h3>Practise next</h3>
      <ul class="tips">${result.tips.map((t) => `<li>${t}</li>`).join('')}</ul>
      <p class="disclaimer">${DISCLAIMER}</p>
      <div class="buttons">
        <button class="primary" data-action="retry">Drive again</button>
        <button data-action="quit">Main menu</button>
      </div>`

    for (const button of body.querySelectorAll<HTMLElement>('[data-action="retry"]')) {
      button.addEventListener('click', () => {
        const game = this.game.current
        if (!game) return
        game.restart()
        for (const section of this.root.querySelectorAll<HTMLElement>('.screen'))
          section.hidden = true
        this.$('#hud').hidden = false
        game.setPaused(false)
      })
    }

    for (const section of this.root.querySelectorAll<HTMLElement>('.screen'))
      section.hidden = true
    this.$('#hud').hidden = true
    this.show('results')
  }

  private applyProgress(result: RunResult): void {
    this.progress.xp += result.xp

    if (result.kind === 'lesson' && this.pendingResult) {
      const lesson = LESSONS.find((l) => l.title === result.title)
      if (lesson) {
        const previous = this.progress.lessons[lesson.id] ?? 0
        this.progress.lessons[lesson.id] = Math.max(previous, result.score)
      }
    }
    if (result.kind === 'mocktest')
      this.progress.mockBest = Math.max(this.progress.mockBest, result.score)

    const unlock = (id: string): void => {
      if (!this.progress.achievements.includes(id)) this.progress.achievements.push(id)
    }

    if (result.passed) unlock('firstLesson')
    if (
      result.passed &&
      result.score >= 90 &&
      !result.mistakes.some((m) => m.severity !== 'info')
    ) {
      unlock('safeDriver')
    }
    if (result.kind === 'mocktest' && result.passed) unlock('mockPassed')

    const lesson = LESSONS.find((l) => l.title === result.title)
    if (lesson && result.passed && result.score >= 90) {
      if (lesson.id === 'parking') unlock('perfectPark')
      if (lesson.id === 'stopsign') unlock('stopPro')
      if (lesson.id === 'lanes') unlock('mirrorMaster')
    }
    if (result.passed && !result.mistakes.some((m) => m.text.includes('pedestrian')))
      unlock('hazardSpotter')

    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(this.progress))
    } catch {
      /* ignore */
    }
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings))
    } catch {
      /* ignore */
    }
  }

  /* ------------------------------ knowledge test --------------------------- */

  private startQuiz(): void {
    const order = QUESTIONS.map((_, i) => i)
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    this.quiz = { order, index: 0, correct: 0, picked: null }
    this.renderQuiz()
  }

  private renderQuiz(): void {
    const quiz = this.quiz
    const body = this.$('#quiz-body')
    if (!quiz) {
      body.innerHTML = ''
      return
    }

    if (quiz.index >= quiz.order.length) {
      const percent = Math.round((quiz.correct / quiz.order.length) * 100)
      this.progress.knowledgeBest = Math.max(this.progress.knowledgeBest, percent)
      if (percent >= 80 && !this.progress.achievements.includes('knowledgePassed')) {
        this.progress.achievements.push('knowledgePassed')
      }
      try {
        localStorage.setItem(PROGRESS_KEY, JSON.stringify(this.progress))
      } catch {
        /* ignore */
      }
      body.innerHTML = `
        <div class="verdict ${percent >= 80 ? 'pass' : 'fail'}">${percent}%</div>
        <p>${percent >= 80 ? 'That would pass most practice tests. Keep it up.' : 'Review the explanations and try again - you need 80% or better.'}</p>
        <p class="hint">Best score: ${this.progress.knowledgeBest}%</p>`
      return
    }

    const question = QUESTIONS[quiz.order[quiz.index]]
    const answered = quiz.picked !== null
    body.innerHTML = `
      <p class="quiz-progress">Question ${quiz.index + 1} of ${quiz.order.length}</p>
      <h3>${question.q}</h3>
      <div class="quiz-options">
        ${question.options
          .map((option, i) => {
            let cls = ''
            if (answered && i === question.answer) cls = 'correct'
            else if (answered && i === quiz.picked) cls = 'wrong'
            return `<button data-answer="${i}" class="${cls}">${option}</button>`
          })
          .join('')}
      </div>
      ${
        answered
          ? `<div class="quiz-explain ${quiz.picked === question.answer ? 'ok' : 'no'}">
              <b>${quiz.picked === question.answer ? 'Correct.' : 'Not quite.'}</b> ${question.explain}
              <span class="hint">Source: ${question.source}</span>
            </div>
            <button class="primary" data-action="quiz-next">${
              quiz.index + 1 >= quiz.order.length ? 'See score' : 'Next question'
            }</button>`
          : ''
      }`

    for (const button of body.querySelectorAll<HTMLElement>('[data-answer]')) {
      button.addEventListener('click', () => {
        if (!this.quiz || this.quiz.picked !== null) return
        this.quiz.picked = Number(button.dataset.answer)
        if (this.quiz.picked === question.answer) this.quiz.correct++
        this.renderQuiz()
      })
    }

    const next = body.querySelector<HTMLElement>('[data-action="quiz-next"]')
    next?.addEventListener('click', () => {
      if (!this.quiz) return
      this.quiz.index++
      this.quiz.picked = null
      this.renderQuiz()
    })
  }
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) }
  } catch {
    return fallback
  }
}
