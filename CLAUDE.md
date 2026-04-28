# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from the `HelmsDash/` directory.

```bash
npm run dev       # Dev server at http://localhost:5173 with hot-reload
npm run build     # Production build → dist/
npm run preview   # Serve the production build locally
```

There are no tests and no linter configured.

**Dev-only URLs** (port defaults to 5173; Vite auto-increments if busy — check the terminal output):
- `http://localhost:517X/?editor=formations` — Formation Editor (build multi-chunk obstacle combos, export to `assets/data/obstacle_formations.json`)
- `http://localhost:517X/?editor=chunks` — Chunk Library Editor (tag/weight preset chunks)
- `http://localhost:517X/editor/index.html` — Three.js Editor (requires `vendor/three` git submodule)

Formation editor workflow: place assets in the 2D grid → Save Formation → Export All to JSON. Exported file is auto-loaded on next editor open. No manual file copying needed in dev mode.

## Architecture

**Stack:** Three.js r165, Vite 5, Howler.js, vanilla ES modules. No framework, no TypeScript.

### Entry point & game loop

`src/main.js` bootstraps the canvas and wires `Game` → `HomePage`. `Game` owns the `requestAnimationFrame` loop and is exposed as `window._game` for debugging.

`src/core/Game.js` is the central state machine (`MENU → PLAYING → PAUSED → GAMEOVER`). It owns all top-level systems and drives the per-frame update. Per-session objects (`TrackGenerator`, `Player`, `HUD`, etc.) are created in `_startSession()` and torn down in `_endSession()`.

### Key systems and their responsibilities

| File | Role |
|------|------|
| `src/config.js` | **Single source of truth for every tunable.** Change game feel here, not in individual files. |
| `src/core/AssetRegistry.js` | Maps logical keys (`'obstacles/cart'`, `'player/knight'`) to procedural placeholders + optional GLB paths. Reads `assets/data/asset_overrides.json` at startup. All GLB loads apply `applyWorldBend` to every material automatically. Use `getAsset(key)` to obtain a clone; use `getAnimationClip(key)` for animation GLBs. Skinned meshes require `SkeletonUtils.clone()` — the registry handles this transparently via `_hasSkinnedMesh()`. |
| `src/core/worldBend.js` | Exports `BEND_UNIFORMS` (shared uniform objects) and `applyWorldBend(material)`. All `MeshStandardMaterial` / `MeshPhongMaterial` get the world-bend vertex shader injected via `onBeforeCompile`. `ShaderMaterial` (coins) spreads `BEND_UNIFORMS` directly. Call `setTurnBend(v)` from `Game.js` to update the lateral bend for all materials at once. |
| `src/core/ShaderManager.js` | Custom `ShaderMaterial` instances for coins (gold spin + fade + world bend), ground fog, buff glow, and jetpack trail particles. Coin material must be injected into `TrackGenerator` via `setCoinMaterial()` **before** `trackGen.init()` so the initial chunks use it. |
| `src/scene/TrackGenerator.js` | Spawns and scrolls track chunks using a pool (`ChunkPool`). 70% of chunks come from JSON presets (`ChunkPresetLoader`), 30% are procedurally generated. Exports `setCoinMaterial()` to swap the coin material after the shader manager is ready. |
| `src/scene/SceneManager.js` | Owns the Three.js scene, camera, renderer sizing, lighting, fog, and `updateCamera()`. Also manages jetpack altitude transitions via `setJetpackAltitude()`. |
| `src/entities/Player.js` | State machine: `RUNNING / JUMPING / ROLLING / HURT / JETPACK`. Owns physics (gravity, lane slide), AABB collision box, animation mixer, and active power-up list. `group.rotation.y = Math.PI` keeps the knight facing away from the camera. |
| `src/powerups/` | Each powerup extends `Collectible` with `onActivate` / `onExpire` hooks. `Jetpack.js` also spawns its own coin group directly into the scene and exposes it via `_getCoinGroup()` so `Game.js` can scroll it. |

### World coordinate convention

The world scrolls in **+Z** each frame; the player stays near `z = 0`. Chunks ahead of the player have **negative Z**. The world-bend shaders use `_wPos.z²` so the curve is symmetric and strongest at the horizon.

### Asset pipeline

- Static assets (GLBs, audio) live in `public/assets/` and are served at runtime.
- Chunk preset JSONs are authored in Three.js Editor → saved to `assets/chunks/` (dev root, writable by `vite-plugin-fs-persist.js`) and must be copied to `public/assets/chunks/` for production.
- `assets/data/asset_overrides.json` maps asset keys to GLB paths, letting you swap any placeholder for a real model without touching source code.
- Animation clips are separate GLBs (one per action: `knight_run.glb`, `knight_sprint.glb`, etc.). Register them in `ANIMATION_REGISTRY` inside `AssetRegistry.js`.

### Chunk preset system

`assets/data/chunk_manifest.json` lists preset JSONs with `difficulty`, `spawnWeight`, `hasObstacle`, and `hasPowerup` metadata. `TrackGenerator._pickPreset()` does weighted-random selection filtered by current difficulty tier (`easy` < 14 m/s, `medium` < 20 m/s, `hard` ≥ 20 m/s). Preset objects use name prefixes (`OBS_*`, `COIN_*`, `PWR_*`, `SIDE_*`) that `ChunkPresetLoader` maps to `userData.role`.
