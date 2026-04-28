editor : http://localhost:5173/?editor=formations    

# HelmsDash

A medieval endless runner built with Three.js — sprint through cobblestone streets as a knight, dodge mine-carts, and collect gold coins.

## Run Locally

**Requirements:** Node.js 18+

```bash
# From the HelmsDash/ directory:
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

## Other Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start dev server with hot-reload |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview the production build locally |

## Dev Tools

| URL | Tool |
|---|---|
| `http://localhost:5173` | Game (homepage → play) |
| `http://localhost:5173/?editor=chunks` | Chunk Library Editor — tag/weight chunk presets |
| `http://localhost:5173/editor/index.html` | Three.js Editor (requires `vendor/three` submodule — see below) |

## Controls

| Input | Action |
|---|---|
| `← / A` | Move left |
| `→ / D` | Move right |
| `Space / ↑ / W` | Jump |
| `↓ / S / Ctrl` | Roll |
| `Escape` | Pause / Resume |
| `M` | Mute / Unmute |
| Swipe left/right | Lane change (touch) |
| Swipe up/down | Jump / Roll (touch) |

## Three.js Editor (optional)

The official Three.js Editor lets you author chunk presets visually:

```bash
git submodule add https://github.com/mrdoob/three.js.git vendor/three
```

Then access it at `http://localhost:5173/editor/index.html` while `npm run dev` is running.

## Project Structure

```
HelmsDash/
├── src/
│   ├── main.js              # Bootstrap
│   ├── config.js            # All tunable game variables
│   ├── core/                # Game loop, input, audio, save, shaders
│   ├── scene/               # Track generator, chunk pool, environment
│   ├── entities/            # Player, collectibles
│   ├── powerups/            # Sprint, Magnet, CoinDoubler, Jetpack
│   ├── ui/                  # HUD, HomePage, PauseMenu, GameOver
│   └── editors/             # ChunkLibraryEditor
│
├── public/                  # ← Static files served at / by Vite — DROP ASSETS HERE
│   └── assets/
│       ├── models/          # GLB models loaded at runtime by AssetRegistry
│       │   ├── player/      #   knight.glb            ← mesh + skeleton (no animation)
│       │   │                #   knight_run.glb         ← one GLB per animation clip
│       │   │                #   knight_jump.glb
│       │   │                #   knight_roll.glb
│       │   │                #   knight_hurt.glb
│       │   │                #   knight_land.glb
│       │   │                #   knight_slide_left.glb
│       │   │                #   knight_slide_right.glb
│       │   │                #   knight_jetpack.glb
│       │   │                #   knight_idle.glb
│       │   ├── obstacles/   #   cart.glb  barrel.glb  gate.glb  low_beam.glb
│       │   ├── carriages/   #   wagon_body.glb  wagon_ramp.glb  wagon_wheel.glb
│       │   ├── collectibles/#   coin.glb  magnet.glb  doubler.glb  jetpack.glb  sprint_shoes.glb
│       │   └── environment/ #   tree_oak.glb  building_a.glb  building_b.glb  banner.glb
│       ├── audio/
│       │   ├── sfx/
│       │   └── music/
│       ├── chunks/          # Chunk preset JSONs (authored in Three.js Editor)
│       └── data/            # chunk_manifest.json and other persistent config
│
├── assets/                  # ← Dev-server writable copies (vite-plugin-fs-persist writes here)
│   ├── chunks/              #   same paths as public/assets/chunks/ — Vite HMR picks up changes
│   └── data/
│
├── vite-plugin-fs-persist.js # Dev plugin: saves editor JSON straight to disk
└── vite.config.js
```

> **Important:** Vite only serves files in `public/` as static assets at runtime.
> Put all GLB models and audio files inside `public/assets/`.
> The `assets/` folder at the project root is only used by the dev-server persist plugin for JSON writes.



────────────────────────────────────────────────  ⏵⏵ accept edits on (shift+tab to cycle)      
  ├───────────────┼─────────────────────────────────────────────────┼────────────────────┤
  │ jetpack_hover │ JETPACK state — slight hover bob                │ Yes                │
  ├───────────────┼─────────────────────────────────────────────────┼────────────────────┤
  │ climb_ramp    │ Walking up carriage ramp (can reuse run tilted) │ Yes                │
  ├───────────────┼─────────────────────────────────────────────────┼────────────────────┤
  │ idle          │ Menu / game-over screen                         │ Yes                │
  └───────────────┴─────────────────────────────────────────────────┴────────────────────┘

  ---
  What does NOT need a model

  These are built procedurally in code and intentionally stay that way:
  - Ground cobblestone strips & dirt base
  - Rail ties and steel rail beams
  - Coin shader material (GPU animated spin)
  - Jetpack particle trail (ShaderManager)
  - Ground fog plane (inline shader in SceneManager)

  ---
  The animation mixer integration (AnimationMixer, clip loading from GLB) is not yet wired in Player.js — that's the main code work needed once the GLBs are ready.