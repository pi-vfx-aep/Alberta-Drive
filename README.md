# Alberta Drive

A web game built with **TypeScript** and **[Three.js](https://threejs.org/)**, bundled with [Vite](https://vitejs.dev/).

> Status: early scaffold — a road and a car. The game itself is still being defined.

## Quick start

```bash
npm install      # once
npm run dev      # dev server at http://localhost:5173
```

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

## Tech stack

- **Three.js** — scene graph, camera, materials, renderer
- **TypeScript** (strict mode)
- **Vite** — dev server and production bundler
- **ESLint + Prettier** — linting and formatting

Runtime dependencies are just `three`; everything else is dev tooling.

## Project structure

```
index.html               HTML shell — hosts the <canvas id="game">
public/                  Static assets copied as-is (favicon, etc.)
src/
  main.ts                Entry point: builds and renders the scene
  styles.css             Fullscreen canvas + page reset
  systems/
    Input.ts             Keyboard + pointer state (held / just-pressed)
  vite-env.d.ts          Vite client type reference
```

`src/systems/Input.ts` is kept even though nothing calls it yet — Three.js
provides no input handling, and the game will need steering/throttle controls.

## The scene

Everything lives in `src/main.ts`:

- **Road** — `PlaneGeometry(9, 120)` rotated flat on the X axis
- **Car** — `BoxGeometry(2, 1, 4)` resting on the road at `y = 0.5`
- **Camera** — perspective, elevated behind the car
- **Lights** — one ambient + one directional, so surfaces shade as 3D

Rendering runs on `renderer.setAnimationLoop(...)`, and the canvas is resized
with the window.

## Adding content

```ts
const mesh = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0xff0000 }),
)
scene.add(mesh)
```

As the scene grows, split it out of `main.ts` into its own module and keep
`main.ts` to wiring only (renderer + camera + loop).

## Conventions

- **Formatting**: Prettier — no semicolons, single quotes, 90-col, trailing commas.
- **Types**: `strict` TypeScript; `verbatimModuleSyntax` means type-only imports
  use `import type { ... }`.
- **Cleanup**: dispose Three.js resources you create (`.dispose()` on geometries,
  materials, textures) when tearing them down.
- **Input**: query via `Input` — `isDown()` for held keys, `justPressed()` for
  one-frame edges. Edge state is cleared automatically each frame.

## Production build

```bash
npm run build     # outputs dist/
npm run preview   # serve dist/ locally
```

`base: './'` in `vite.config.ts` makes the build path-relative, so `dist/` can
be hosted from any subdirectory.

## License

MIT — see [LICENSE](./LICENSE).
