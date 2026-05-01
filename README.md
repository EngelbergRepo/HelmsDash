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

  ####################
  ####################
  ####################
  ####################

  REGARDING THE GRAPHICS .glb files
  ---
  Your options (ranked by impact)

  1. Decimate the mesh in Blender (biggest win, ~5 min)

  2. Use InstancedMesh instead of cloning (code change)

  Instead of getAsset('track/chunk') cloning the full scene graph for each chunk, extract the
  geometry/material once and use THREE.InstancedMesh. This collapses all N track chunks into a
  single draw call. This is the biggest architectural win but requires refactoring TrackGenerator
  and ChunkPool.
------->>>>>>>>>>>
------->>>>>>>>>>>

  Instead of getAsset('track/chunk') cloning the full scene graph for each chunk, extract the
  geometry/material once and use THREE.InstancedMesh. This collapses all N track chunks into a
  single draw call. This is the biggest architectural win but requires refactoring TrackGenerator
  and ChunkPool.
  worldBend.js — shader now has #ifdef USE_INSTANCING branch so the world-Z used for the bend curve
  is computed correctly per-instance (without this, all track tiles would bend as if they were at
  Z=0).

  TrackInstancedRenderer.js (new) — extracts geometry+material from one sample of the track GLB at
  startup; creates one THREE.InstancedMesh per sub-mesh with 256 slots. allocate/free/scroll manage
  slot lifecycles. All tiles = 1–N draw calls total (N = number of sub-meshes in the GLB) instead of   240+ draw calls.

  TrackGenerator.js — buildTrackGround now just allocates 6 instanced slots and returns their
  indices. _spawnAt attaches _onRelease to each chunk so slots are freed when the chunk is recycled.   update scrolls the renderer alongside the pool.

  ChunkPool.js — calls _onRelease before clearing children in release().


  to do:

leader borad. fire base- make a firebset prject


make a vercel project. 
make a vercel domain.
set enviroment variables.
create different collections for gameplay


claude:
make a leader board
go through all the rules and make sure they all check.


vibejam rules: yes


Widget (required) - checked. 

fix the vibejam portal: 
"
Note: this Vibe Jam Portal is a totally different thing than the required widget snippet above. The widget is mandatory and just tracks your game; portals are optional and let players hop between games like a webring.

Make an exit portal in your game players can walk/fly/drive into — you can add a label like Vibe Jam Portal. This way players can play and hop to the next game like a Vibe Jam 2026 Webring! Your game will be added to the webring if you have a portal.

When the player enters the portal, redirect them to:

https://vibej.am/portal/2026
You can send GET query params that get forwarded to the next game:

username= — username/name of the player
color= — player color in hex or just red/green/yellow
speed= — meters per second
ref= — URL of the game the player came from
Use ?ref= to add a portal BACK to the game they came from.

Example URL:

https://vibej.am/portal/2026?username=levelsio&color=red&speed=5&ref=fly.pieter.com
The receiving game can use this info to spawn the player with full continuity!

Optional extra params:

avatar_url=
team=
hp= — health points; 1..100 range
speed_x= — meters per second
speed_y= — meters per second
speed_z= — meters per second
rotation_x= — radians
rotation_y= — radians
rotation_z= — radians
The portal redirector will always add ?portal=true so you can detect when a user comes from a portal and instantly drop them into your game out of another portal — no start screens.

(!) IMPORTANT — Add a start portal:

When receiving a user (with ?portal=true in your URL) and a ?ref=, make a portal where the user spawns out of so they can return back to the previous game by walking into it. When returning them, make sure to send all the query parameters again too.

All parameters except portal are optional and may or may not be present — do not rely on their presence.

IMPORTANT: make sure your game instantly loads — no loading screens, no input screens — so the continuity is nice for players.

SAMPLE CODE — copy-paste-ready Three.js snippet for start + exit portals. Include it with a <script src>, call initVibeJamPortals({ scene, getPlayer }) once, and animateVibeJamPortals() inside your animate loop.

https://vibej.am/2026/portal/sample.js

<script src="https://vibej.am/2026/portal/sample.js"></script>
<script>
  initVibeJamPortals({
    scene: yourScene,
    getPlayer: () => yourPlayerObject3D,
    spawnPoint:   { x: 0, y: 0, z: 0 },
    exitPosition: { x: -200, y: 200, z: -300 },
  });
  // Inside your existing animate/render loop:
  // animateVibeJamPortals();
</script>
"