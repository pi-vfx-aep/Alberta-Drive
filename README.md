# Alberta Drive

A browser-based **first-person 3D driving simulator** that teaches Alberta road
rules and prepares players for the Class 7 learner knowledge test and the
Class 5 road test.

Built with **TypeScript** (strict) and **[Three.js](https://threejs.org/)**,
bundled with [Vite](https://vitejs.dev/).

> **Disclaimer:** Alberta Drive is an independent training aid. It is **not** an
> official Government of Alberta test and is not affiliated with the Government
> of Alberta. Always check the current _Alberta Driver's Guide_ for the rules
> that apply on the road.

## Quick start

```bash
npm install      # once
npm run dev      # dev server at http://localhost:5173
```

Click the canvas to lock the mouse, then press `E` (ignition), `B` (seatbelt)
and `Space` (release the parking brake) to drive away.

### All commands

| Command                | What it does                                       |
| ---------------------- | -------------------------------------------------- |
| `npm run dev`          | Start the dev server with hot reload               |
| `npm run build`        | Typecheck + produce an optimized bundle in `dist/` |
| `npm run preview`      | Serve the production build locally                 |
| `npm run typecheck`    | `tsc -b` — typecheck without emitting              |
| `npm run lint`         | ESLint over the project                            |
| `npm run format`       | Prettier — write formatted files                   |
| `npm run format:check` | Prettier — check formatting only                   |

## Controls

Every control is remappable in **Settings → Controls** (stored in
`localStorage`).

| Action                                 | Default                  |
| -------------------------------------- | ------------------------ |
| Accelerate                             | `W`                      |
| Brake / reverse                        | `S` (hold at rest for R) |
| Steer                                  | `A` / `D`                |
| Parking brake                          | `Space`                  |
| Left / right signal                    | `Q` / `R`                |
| Horn                                   | `H`                      |
| Headlights / high beam                 | `L`                      |
| Wipers                                 | `V`                      |
| Ignition                               | `E`                      |
| Seatbelt                               | `B`                      |
| Change camera (seat / bonnet / follow) | `C`                      |
| Recenter the view                      | `N`                      |
| Recover vehicle (back on the road)     | `T`                      |
| Pause                                  | `Esc`                    |
| Look around                            | Mouse (pointer lock)     |

Gamepads are supported: left stick steers, RT accelerates, LT brakes.

## Modes

- **Free Drive** — pick weather (clear / rain / snow / fog), time of day
  (dawn / day / dusk / night) and traffic density; navigate to marked
  destinations with no instructor.
- **Lessons** — startup, stop signs, lane changes, parallel parking.
- **Mock Road Test** — a Class 5-style route with live examiner instructions and
  a scored evaluation report.
- **Practice Knowledge Test** — randomized questions with per-item source notes
  and explanations.

## Features implemented

- First-person cockpit with mouse-look head movement, shoulder checks, three
  camera modes and a recenter key.
- Functional cockpit: rotating steering wheel driven by the real steering
  angle, digital cluster (km/h, RPM, gear, fuel, warning lamps), indicator
  stalks, pedals, gear lever, handbrake, seatbelt, wipers, horn, headlights.
- **Three live mirrors** (rearview + both wings) rendered to texture on
  alternate frames; disabled on the Low graphics preset.
- **Minimap** — a north-up, top-down navigation aid showing the road network,
  school zones, signalised vs. stop-controlled junctions, both marked parking
  targets, live AI traffic and pedestrians, and a bearing line to the active
  destination. The roads are baked into an offscreen layer once, so each frame
  costs one `drawImage` plus a few primitives.
- Custom bicycle-model vehicle dynamics: longitudinal/lateral decomposition,
  grip-limited lateral damping (understeer), speed-sensitive steering,
  automatic gearbox display, drag, rolling resistance, weight-transfer body
  pitch/roll, collision response.
- Surface grip varies with road vs. off-road and with weather
  (clear / fog / rain / snow).
- A built Alberta-style town: right-hand traffic, metric limits, Canadian
  signage, signalised intersections with mast-arm signal heads hung over the
  approach lanes, four-way stops, a school-zone 30 km/h overlay, crosswalks, a
  railway crossing, a driving-school lot with an entrance onto South Boulevard,
  painted parallel-parking bays, and a 100 km/h prairie highway.
- AI traffic on three routes that obeys signals and stop signs, keeps
  following distance and yields; pedestrians including a signalised crosswalk
  crosser.
- Instructor feedback engine driven by measurable game state (stop quality,
  red/yellow lights, lane changes, shoulder checks, turns, signals, speed,
  following gap, pedestrian yield, seatbelt, parking brake, off-road,
  wrong-way, collisions), with Beginner / Intermediate / Exam assistance
  levels and severity-weighted scoring.
- Procedural Web Audio — engine, road/wind noise, indicator tick, horn, crash.
- Weather and time-of-day lighting, rain/snow particles, fog, headlights.
- Settings: graphics preset, volume, look sensitivity, field of view,
  instructor level, traffic density, HUD style, full key remapping.
- Progress, XP and achievements persisted in `localStorage`.

## Known limitations

Be aware of these; none of them are faked or hidden behind a dead button:

- **Not implemented:** Chaos Mode, roundabouts/traffic circles, cyclists,
  construction workers, emergency-vehicle priority, manual gearbox, reverse
  (90°) parking lesson, highway on/off ramps, vehicle damage/deformation,
  event replay, and a day/night cycle (time of day is chosen up front).
- **Free Drive has no route planner** — only nearest-destination guidance.
- **Knowledge test** is deliberately limited to questions with well-established
  answers; it is not the official question bank.
- **Scoring thresholds are indicative**, not official Alberta road-test criteria.
- **AI traffic** follows fixed waypoint routes; it does not re-route around
  obstructions.
- Mirrors render every other frame to keep frame times down, so they are one
  frame behind the main view.

## Testing performed

Automated, run before every commit:

```bash
npm run format:check && npm run lint && npm run typecheck && npm run build
```

All four pass. The production bundle is a single ~642 kB JS chunk (mostly
Three.js); the size warning from Vite is expected.

Manual checks completed in Chrome: menu → free drive → camera starts in the
driver's seat → accelerate/brake/reverse → steering wheel matches input →
speedometer tracks speed → pause/resume → quit to menu.

**Not machine-tested:** mirrors, gauge legibility, the full mock road-test
route, and frame rate on integrated graphics. Report anything that looks wrong.

## Project structure

```
index.html               HTML shell — #app > canvas#game + div#ui
src/
  main.ts                Entry: mounts the UI over the canvas
  styles.css             Menus, HUD and results styling
  types.ts               Shared types, default settings and key bindings
  systems/
    Input.ts             Keyboard, mouse-look and gamepad; remapping + storage
  content/
    alberta.ts           Disclaimer, signs, knowledge questions, lessons, achievements
  ui/
    UI.ts                All screens, HUD sync, settings and progress persistence
  game/
    Game.ts              Orchestrator: fixed-step loop, rules, examiner, weather, HUD
    physics.ts           Vehicle dynamics and collision helpers
    World.ts             Roads, intersections, signals, signage, scenery, queries
    Vehicle.ts           Exterior, cockpit, wheels, gauges, lights, mirrors
    CameraRig.ts         Cockpit / bonnet / follow cameras and mouse look
    Traffic.ts           AI cars and pedestrians
    Instructor.ts        Event handling, feedback text and scoring
    Minimap.ts           North-up navigation map (static baked layer + live overlay)
    Sound.ts             Procedural Web Audio engine
```

### Conventions

- **Formatting**: Prettier — no semicolons, single quotes, trailing commas.
- **Types**: `strict` TypeScript; `verbatimModuleSyntax` means type-only
  imports use `import type { ... }`.
- **Coordinates**: forward is `+Z` at yaw `0`; increasing yaw turns left;
  `right = (-fz, 0, fx)`; traffic drives on the right.
- **Cleanup**: dispose Three.js resources (`.dispose()`) when tearing down.

## Production build

```bash
npm run build     # outputs dist/
npm run preview   # serve dist/ locally
```

`base: './'` in `vite.config.ts` makes the build path-relative, so `dist/` can
be hosted from any subdirectory.

## Publishing and updating

The repo ships with `.github/workflows/deploy.yml`, which typechecks, builds
and deploys to **GitHub Pages** on every push to `main`. You never run a build
or upload a file by hand: edit in VSCode, commit, push, and the public site
refreshes itself in about a minute.

### One-time setup

1. Create a repo on GitHub and push:

   ```bash
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```

   Or use VSCode's **Source Control** panel: add a remote, then Publish.

2. On GitHub, open **Settings -> Pages -> Build and deployment -> Source** and
   choose **GitHub Actions**.

3. If the **Actions** tab says workflows are disabled, enable them.

Your game will be live at `https://<you>.github.io/<repo>/`. The workflow runs
`npm run typecheck` first, so a broken build fails loudly instead of publishing
a dead page.

### Your everyday update loop

1. Edit files in VSCode.
2. Optionally check locally: `npm run dev` (http://localhost:5173/).
3. Source Control panel: **Commit**, then **Sync/Push**. Or from a terminal:

   ```bash
   git add -A
   git commit -m "Describe the change"
   git push
   ```

4. Wait ~1 minute, then hard-refresh the public URL (`Ctrl+F5`).

### Why GitHub Pages

Free, no bandwidth cap at this size, no account beyond GitHub, and it updates
on `git push`. If you later want a custom domain, add a `CNAME` file to
`public/` and set it under **Settings -> Pages -> Custom domain**; the build
does not change.

### Alternatives

| Host             | Trigger    | Notes                                                                         |
| ---------------- | ---------- | ----------------------------------------------------------------------------- |
| Cloudflare Pages | `git push` | Build command `npm run build`, output `dist`. No Actions file needed.         |
| Netlify          | `git push` | Same settings; dragging `dist/` onto the site also works for a manual deploy. |
| Vercel           | `git push` | Framework preset "Vite", no config needed.                                    |

Any of these replace the GitHub Actions job. The build itself is always
`npm run build` producing `dist/`.

## License

MIT — see [LICENSE](./LICENSE).
