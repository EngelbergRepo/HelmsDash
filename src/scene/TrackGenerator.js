// src/scene/TrackGenerator.js
// Procedural chunk spawner — samples chunk_manifest.json for preset chunks
// and generates procedural chunks as fallback / weighted mix.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { ChunkPool } from './ChunkPool.js';
import { ChunkPresetLoader } from './ChunkPresetLoader.js';
import { loadFromFile } from '../core/persist.js';
import { getAsset } from '../core/AssetRegistry.js';
import { applyWorldBend } from '../core/worldBend.js';

// Materials (shared, created once)
const MAT_COBBLE       = new THREE.MeshStandardMaterial({ color: 0x8a7a6a, roughness: 0.95, metalness: 0 });
const MAT_RAIL         = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.9 });
const MAT_COIN         = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.2, metalness: 0.9, emissive: 0xffa500, emissiveIntensity: 0.4 });
const MAT_WAGON_BODY   = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.9, metalness: 0.05 });
const MAT_WAGON_ROOF   = new THREE.MeshStandardMaterial({ color: 0x4a2e18, roughness: 0.85 });
const MAT_WAGON_WHEEL  = new THREE.MeshStandardMaterial({ color: 0x2a1a0e, roughness: 0.95 });
const MAT_WAGON_METAL  = new THREE.MeshStandardMaterial({ color: 0x556655, roughness: 0.6, metalness: 0.7 });
const MAT_WAGON_RAMP   = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.9 });

// Allow Game to inject the coin shader material so all newly spawned coins use it
let _activeCoinMaterial = MAT_COIN;
export function setCoinMaterial(mat) { _activeCoinMaterial = mat; }

const POWERUP_COLORS = { sprint: 0x44ddff, magnet: 0xff4444, doubler: 0xffdd00, jetpack: 0xff8800 };
const POWERUP_TYPES  = ['sprint', 'magnet', 'doubler', 'jetpack'];

function laneX(lane) {
  // Centre lane 1 → x=0; lane 0 → -LANE_SPACING; lane 2 → +LANE_SPACING
  return (lane - 1) * CONFIG.LANE_SPACING;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Procedural ground + rails ──────────────────────────────────
const MAT_DIRT  = new THREE.MeshStandardMaterial({ color: 0x6b5a3e, roughness: 1.0, metalness: 0 });
const MAT_TIE   = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 1 });
const MAT_STEEL = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4, metalness: 0.7 });

const LANE_W = CONFIG.LANE_SPACING * 0.75; // cobblestone strip width per lane

// Apply world-bend shader to all procedural materials
[MAT_COBBLE, MAT_DIRT, MAT_TIE, MAT_RAIL, MAT_STEEL,
 MAT_WAGON_BODY, MAT_WAGON_ROOF, MAT_WAGON_WHEEL, MAT_WAGON_METAL, MAT_WAGON_RAMP,
].forEach(applyWorldBend);

function buildGroundPlane() {
  const group = new THREE.Group();
  group.userData.role = 'ground';

  // Full-width dirt base — fills the gaps between lanes
  const baseGeo = new THREE.PlaneGeometry(
    CONFIG.LANE_SPACING * (CONFIG.LANE_COUNT + 0.5),
    CONFIG.TRACK_CHUNK_LENGTH,
    4, 4
  );
  const base = new THREE.Mesh(baseGeo, MAT_DIRT);
  base.rotation.x = -Math.PI / 2;
  base.position.set(0, -0.02, -CONFIG.TRACK_CHUNK_LENGTH / 2);
  base.receiveShadow = true;
  group.add(base);

  // Three cobblestone strips — one per lane
  const laneGeo = new THREE.PlaneGeometry(LANE_W, CONFIG.TRACK_CHUNK_LENGTH, 6, 8);
  for (let i = 0; i < CONFIG.LANE_COUNT; i++) {
    const strip = new THREE.Mesh(laneGeo, MAT_COBBLE);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(laneX(i), 0, -CONFIG.TRACK_CHUNK_LENGTH / 2);
    strip.receiveShadow = true;
    group.add(strip);
  }

  return group;
}

function buildRailTies() {
  const group = new THREE.Group();
  const tieGeo  = new THREE.BoxGeometry(LANE_W + 0.2, 0.08, 0.32);
  const railGeo = new THREE.BoxGeometry(0.1, 0.1, CONFIG.TRACK_CHUNK_LENGTH);
  const tieCount   = Math.floor(CONFIG.TRACK_CHUNK_LENGTH / CONFIG.RAIL_TIE_SPACING);
  const railOffset = LANE_W * 0.34; // distance from lane centre to each steel rail

  for (let i = 0; i < CONFIG.LANE_COUNT; i++) {
    const cx = laneX(i);

    // Cross-ties (sleepers)
    for (let t = 0; t < tieCount; t++) {
      const tie = new THREE.Mesh(tieGeo, MAT_TIE);
      tie.position.set(cx, 0.04, -t * CONFIG.RAIL_TIE_SPACING);
      tie.receiveShadow = true;
      group.add(tie);
    }

    // Two steel rail beams per lane
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, MAT_STEEL);
      rail.position.set(cx + side * railOffset, 0.1, -CONFIG.TRACK_CHUNK_LENGTH / 2);
      group.add(rail);
    }
  }

  return group;
}

// ── Coin patterns ──────────────────────────────────────────────
function spawnCoinRow(group, lane, startZ, count) {
  for (let i = 0; i < count; i++) {
    const coin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.07, 12),
      _activeCoinMaterial
    );
    coin.rotation.x = Math.PI / 2;
    coin.position.set(laneX(lane), CONFIG.COIN_FLOAT_HEIGHT, startZ - i * CONFIG.COIN_SPACING);
    coin.userData.role = 'coin';
    coin.userData.collected = false;
    group.add(coin);
  }
}

function spawnCoinZigzag(group, startZ, count) {
  for (let i = 0; i < count; i++) {
    const lane = i % 3;
    const coin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.07, 12),
      _activeCoinMaterial
    );
    coin.rotation.x = Math.PI / 2;
    coin.position.set(laneX(lane), CONFIG.COIN_FLOAT_HEIGHT, startZ - i * CONFIG.COIN_SPACING * 1.2);
    coin.userData.role = 'coin';
    coin.userData.collected = false;
    group.add(coin);
  }
}

function spawnCoinArc(group, lane, startZ, count) {
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const arcY = CONFIG.COIN_FLOAT_HEIGHT + Math.sin(t * Math.PI) * 1.8;
    const coin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.07, 12),
      _activeCoinMaterial
    );
    coin.rotation.x = Math.PI / 2;
    coin.position.set(laneX(lane), arcY, startZ - i * CONFIG.COIN_SPACING);
    coin.userData.role = 'coin';
    coin.userData.collected = false;
    group.add(coin);
  }
}

// ── Power-up spawner ──────────────────────────────────────────
function spawnPowerup(group, lane, z) {
  const type  = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
  const color = POWERUP_COLORS[type];

  // Glowing floating orb placeholder
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 12, 12),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, roughness: 0.3, metalness: 0.5 })
  );
  // Outer halo ring
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.05, 8, 24),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2, transparent: true, opacity: 0.7 })
  );
  const group2 = new THREE.Group();
  group2.add(orb, halo);
  group2.position.set(laneX(lane), CONFIG.COIN_FLOAT_HEIGHT + 0.4, z);
  group2.userData.role = 'powerup';
  group2.userData.powerupType = type;
  group2.userData.collected = false;
  group.add(group2);
}

// ── Standalone ramp ───────────────────────────────────────────
function buildRamp(lane) {
  const group    = new THREE.Group();
  const W        = CONFIG.LANE_SPACING * 0.85;
  const H        = CONFIG.CARRIAGE_WAGON_HEIGHT;
  const RL       = CONFIG.CARRIAGE_RAMP_LENGTH;  // 6 m = 1 slot
  const rampW    = W * CONFIG.CARRIAGE_RAMP_WIDTH_FACTOR;
  const slopeLen = Math.sqrt(H * H + RL * RL);

  const visual = new THREE.Mesh(
    new THREE.BoxGeometry(rampW, CONFIG.CARRIAGE_RAMP_THICKNESS, slopeLen),
    MAT_WAGON_RAMP
  );
  // Tilt: bottom at z=0 (slot front), top at z=-RL (slot back), rising to height H
  visual.rotation.x = Math.atan2(H, RL);
  visual.position.set(0, H / 2, -RL / 2);  // centred in the 6 m slot
  visual.castShadow = true;
  group.add(visual);
  group.position.x = laneX(lane);
  return group;
}

// ── Obstacle builders (delegate to AssetRegistry) ─────────────
function buildObstacle(type) {
  const mesh = getAsset(`obstacles/${type}`);
  mesh.userData.role = 'obstacle';
  mesh.userData.obstacleType = type;
  mesh.userData.height = CONFIG.OBSTACLE_HEIGHT[type] || 2.0;
  mesh.traverse(c => { if (c.isMesh) c.castShadow = true; });
  return mesh;
}

// ── Carriage builder ──────────────────────────────────────────

// W is always single-lane width — carriages must never span more than one lane.
// hasRamp is only ever true on the FIRST wagon; all others are plain solid wagons.
// The ramp is a SEPARATE piece leaning against the FRONT (+z side) of the wagon body.
// The wagon body always has full length L; the ramp extends RL metres in front of it.
function _buildWagon(wg, W, H, L, hasRamp, skipRampVisual = false) {
  const ROOF_H = 0.18;
  const wheelR = H * 0.25;
  const platY  = H + ROOF_H;   // surface the player stands on
  const INVIS  = new THREE.MeshBasicMaterial({ visible: false });

  // ── Wagon body (always full length) ────────────────────────
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, L), MAT_WAGON_BODY);
  body.position.set(0, H / 2, -L / 2);
  body.castShadow = true;
  wg.add(body);

  if (hasRamp) {
    const RL       = CONFIG.CARRIAGE_RAMP_LENGTH;
    const rampW    = W * CONFIG.CARRIAGE_RAMP_WIDTH_FACTOR;

    if (!skipRampVisual) {
      // Visual ramp — omitted when a standalone 'ramp' slot in the preceding chunk already shows it.
      const slopeLen   = Math.sqrt(H * H + RL * RL);
      const rampVisual = new THREE.Mesh(
        new THREE.BoxGeometry(rampW, CONFIG.CARRIAGE_RAMP_THICKNESS, slopeLen),
        MAT_WAGON_RAMP
      );
      rampVisual.rotation.x = Math.atan2(H, RL);
      rampVisual.position.set(0, H / 2, RL / 2);
      rampVisual.castShadow = true;
      wg.add(rampVisual);
    }

    // Physics ramp trigger — always present so the player is elevated correctly.
    const rampTrig = new THREE.Mesh(new THREE.BoxGeometry(W, H + 0.2, RL), INVIS);
    rampTrig.position.set(0, H / 2, RL / 2);
    rampTrig.userData.role       = 'ramp_trigger';
    rampTrig.userData.halfW      = W / 2;
    rampTrig.userData.halfZ      = RL / 2;
    rampTrig.userData.rampHeight = platY;
    wg.add(rampTrig);

  } else {
    // No ramp — front face is a wall the player must avoid
    const wall = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.32), INVIS);
    wall.position.set(0, H / 2, -0.16);
    wall.userData.role         = 'obstacle';
    wall.userData.obstacleType = 'carriage_wall';
    wall.userData.height       = H;
    wg.add(wall);
  }

  // ── Roof — spans body only, not the ramp ───────────────────
  const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, ROOF_H, L + 0.1), MAT_WAGON_ROOF);
  roof.position.set(0, H + ROOF_H / 2, -L / 2);
  roof.castShadow = true;
  wg.add(roof);

  // ── Platform trigger — lane-scoped, body length only ────────
  const platTrig = new THREE.Mesh(new THREE.BoxGeometry(W, 0.15, L), INVIS);
  platTrig.position.set(0, platY + 0.075, -L / 2);
  platTrig.userData.role      = 'platform';
  platTrig.userData.halfW     = W / 2;
  platTrig.userData.halfZ     = L / 2;
  platTrig.userData.platformY = platY;
  wg.add(platTrig);

  // ── Wheels — four per wagon, at front and back of body ──────
  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.24, 14);
  for (const wz of [-0.5, -(L - 0.5)]) {
    for (const wx of [-(W / 2 - 0.14), W / 2 - 0.14]) {
      const wheel = new THREE.Mesh(wheelGeo, MAT_WAGON_WHEEL);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, wheelR, wz);
      wheel.castShadow = true;
      wg.add(wheel);
    }
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, W - 0.28, 8), MAT_WAGON_METAL);
    axle.rotation.z = Math.PI / 2;
    axle.position.set(0, wheelR, wz);
    wg.add(axle);
  }

  // ── Coins on top of wagon body ─────────────────────────────
  const coinY = platY + CONFIG.COIN_FLOAT_HEIGHT;
  const n     = CONFIG.CARRIAGE_COINS_PER_WAGON;
  for (let c = 0; c < n; c++) {
    const coin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.07, 12),
      _activeCoinMaterial
    );
    coin.rotation.x = Math.PI / 2;
    const t = (c + 1) / (n + 1);
    coin.position.set(0, coinY, -(t * L));
    coin.userData.role      = 'coin';
    coin.userData.collected = false;
    wg.add(coin);
  }
}

// lane: 0=left, 1=centre, 2=right — carriage occupies exactly that one lane.
// Only the first wagon may have a ramp (CARRIAGE_RAMP_CHANCE); all others are solid walls.
// forceRamp: true/false to override the random ramp chance (null = use config probability)
function buildCarriage(numWagons, lane, forceRamp = null, skipRampVisual = false) {
  const group = new THREE.Group();
  group.userData.isCarriage = true;

  const W = CONFIG.LANE_SPACING * 0.85;  // single-lane width — never exceed this
  const H = CONFIG.CARRIAGE_WAGON_HEIGHT;
  const L = CONFIG.CARRIAGE_WAGON_LENGTH;

  group.position.x = laneX(lane);

  const firstHasRamp = forceRamp !== null ? forceRamp : Math.random() < CONFIG.CARRIAGE_RAMP_CHANCE;

  for (let i = 0; i < numWagons; i++) {
    const wg = new THREE.Group();
    wg.position.z = -(i * L);
    _buildWagon(wg, W, H, L, i === 0 && firstHasRamp, i === 0 && skipRampVisual);
    group.add(wg);
  }

  return group;
}

// ── Track ground builder — tiled GLB, 2 tiles per chunk per lane ─
function buildTrackGround(group) {
  const tileZ = CONFIG.TRACK_CHUNK_LENGTH / 2; // 3 m per tile
  for (let i = 0; i < CONFIG.LANE_COUNT; i++) {
    for (let t = 0; t < 2; t++) {
      const tile = getAsset('track/chunk');
      tile.rotation.x = -Math.PI / 2;
      tile.position.set(laneX(i), 0, -t * tileZ);
      group.add(tile);
    }
  }
}

// ── Procedural chunk generator ────────────────────────────────
export function generateProceduralChunk(difficulty, lastObstacleLane = -1, skipObstacles = false) {
  const group = new THREE.Group();
  group.userData.isChunk = true;

  buildTrackGround(group);

  const len = CONFIG.TRACK_CHUNK_LENGTH;

  // ── Carriage chunk (replaces normal obstacles) ─────────────
  if (!skipObstacles && Math.random() < CONFIG.CARRIAGE_SPAWN_CHANCE) {
    const numWagons    = randomInt(CONFIG.CARRIAGE_MIN_WAGONS, CONFIG.CARRIAGE_MAX_WAGONS);
    const carriageLane = randomInt(0, CONFIG.LANE_COUNT - 1);
    const carriage     = buildCarriage(numWagons, carriageLane);
    carriage.position.z = -2;
    group.add(carriage);
    return group;
  }

  // Decide coin pattern
  const coinPattern = pick(['row', 'zigzag', 'arc']);
  const coinLane = randomInt(0, 2);
  if (coinPattern === 'row')    spawnCoinRow(group, coinLane, -2, CONFIG.COINS_PER_CLUSTER);
  else if (coinPattern === 'zigzag') spawnCoinZigzag(group, -2, CONFIG.COINS_PER_CLUSTER + 3);
  else                          spawnCoinArc(group, coinLane, -2, CONFIG.COINS_PER_CLUSTER);

  if (!skipObstacles) {
    // One obstacle per chunk — chunk is only 6 m so multiple placements always violate OBSTACLE_MIN_GAP.
    let lane;
    do { lane = randomInt(0, 2); } while (lane === lastObstacleLane && Math.random() > 0.3);

    const zPos = -(randomInt(2, len - 2));
    const type = pick(CONFIG.OBSTACLE_TYPES);
    const obs  = buildObstacle(type);
    obs.position.set(laneX(lane), 0, zPos);
    group.add(obs);
    group.userData.lastObstacleLane = lane; // read back by TrackGenerator to update _lastObstacleLane

    // Occasionally spawn a power-up in a different lane
    if (Math.random() < 0.20) {
      const pwrLane = randomInt(0, 2);
      spawnPowerup(group, pwrLane, -(randomInt(2, len - 2)));
    }
  }

  return group;
}

// ── TrackGenerator ─────────────────────────────────────────────
export class TrackGenerator {
  constructor(scene) {
    this._scene = scene;
    this._pool = new ChunkPool(CONFIG.CHUNK_POOL_SIZE);
    this._presetLoader = new ChunkPresetLoader();
    this._presets = [];
    this._manifest = [];
    this._lastObstacleLane = -1;
    this._lastChunkHadObstacle = false;
    this._formations = [];
    this._formationQueue = []; // pending formation slots to spawn next
  }

  async init() {
    const manifest = await loadFromFile('assets/data/chunk_manifest.json');
    if (manifest) {
      this._manifest = manifest;
      this._presets = await this._presetLoader.loadAll(manifest);
    }

    const formations = await loadFromFile('assets/data/obstacle_formations.json');
    if (Array.isArray(formations)) this._formations = formations;

    // Spawn initial pool of chunks starting at z=0
    let z = 0;
    for (let i = 0; i < CONFIG.CHUNK_POOL_SIZE; i++) {
      this._spawnAt(z);
      z -= CONFIG.TRACK_CHUNK_LENGTH;
    }
  }

  _getDifficulty(speed) {
    if (speed < 14) return 'easy';
    if (speed < 20) return 'medium';
    return 'hard';
  }

  _pickPreset(difficulty) {
    const candidates = this._presets.filter(p =>
      p.difficulty === difficulty && p.spawnWeight > 0
    );
    if (!candidates.length) return null;

    const total = candidates.reduce((s, c) => s + c.spawnWeight, 0);
    let r = Math.random() * total;
    for (const c of candidates) {
      r -= c.spawnWeight;
      if (r <= 0) return c.group.clone();
    }
    return candidates[0].group.clone();
  }

  /** Compute the Z position of the farthest active chunk (most negative). */
  _frontierZ() {
    let z = 0;
    for (const c of this._pool.active) {
      if (c.position.z < z) z = c.position.z;
    }
    return z;
  }

  _spawnNext(speed = CONFIG.BASE_SPEED) {
    // Place new chunk just ahead of the current frontier
    const spawnZ = this._frontierZ() - CONFIG.TRACK_CHUNK_LENGTH;
    this._spawnAt(spawnZ, speed);
  }

  _spawnAt(z, speed = CONFIG.BASE_SPEED) {
    const difficulty = this._getDifficulty(speed);
    let chunkGroup;
    let isObstacleChunk = false;

    if (this._formationQueue.length > 0) {
      // Mid-formation: never insert a gap between formation slots.
      // Mark obstacle only after the last slot so the gap falls after the formation.
      chunkGroup = this._buildFormationSlot(this._formationQueue.shift());
      isObstacleChunk = this._formationQueue.length === 0;
    } else if (this._lastChunkHadObstacle) {
      // Mandatory breathing room: coins only, no carriages, no obstacles.
      chunkGroup = generateProceduralChunk(difficulty, this._lastObstacleLane, true);
      isObstacleChunk = false;
    } else {
      // Normal spawn: maybe formation, preset, or procedural.
      if (this._formations.length > 0 && Math.random() < CONFIG.FORMATION_SPAWN_CHANCE) {
        const formation = this._pickFormation(difficulty);
        if (formation?.slots?.length) {
          for (let i = 1; i < formation.slots.length; i++) {
            // Annotate each slot with which lanes had 'ramp' in the preceding slot,
            // so wagons that follow a ramp skip the wall and get a trigger instead.
            const prev = formation.slots[i - 1];
            const prevRampLanes = new Set(
              [0, 1, 2].filter(li => prev[`lane${li}`] === 'ramp')
            );
            this._formationQueue.push({ ...formation.slots[i], _prevRampLanes: prevRampLanes });
          }
          chunkGroup = this._buildFormationSlot(formation.slots[0]);
          // Single-slot formation ends immediately; multi-slot gap is set when queue drains.
          isObstacleChunk = this._formationQueue.length === 0;
        }
      }

      if (!chunkGroup) {
        const usePreset = Math.random() > CONFIG.PROCEDURAL_CHUNK_WEIGHT && this._presets.length > 0;
        if (usePreset) {
          const candidate = this._pickPreset(difficulty);
          if (candidate?.children.length > 0) chunkGroup = candidate;
        }
        if (!chunkGroup) chunkGroup = generateProceduralChunk(difficulty, this._lastObstacleLane);
        // Persist the lane used so the next obstacle chunk avoids it.
        if (chunkGroup.userData.lastObstacleLane !== undefined)
          this._lastObstacleLane = chunkGroup.userData.lastObstacleLane;
        isObstacleChunk = true;
      }
    }

    this._lastChunkHadObstacle = isObstacleChunk;

    const chunk = this._pool.acquire();
    chunk.add(chunkGroup);
    chunk.position.z = z;
    this._scene.add(chunk);
  }

  _pickFormation(difficulty) {
    const candidates = this._formations.filter(f =>
      Array.isArray(f.difficulty) && f.difficulty.includes(difficulty) && (f.spawnWeight ?? 1) > 0
    );
    if (!candidates.length) return null;
    const total = candidates.reduce((s, f) => s + (f.spawnWeight ?? 1), 0);
    let r = Math.random() * total;
    for (const f of candidates) {
      r -= f.spawnWeight ?? 1;
      if (r <= 0) return f;
    }
    return candidates[0];
  }

  _buildFormationSlot(slot) {
    const group = new THREE.Group();
    group.userData.isChunk = true;
    buildTrackGround(group);

    const L  = CONFIG.CARRIAGE_WAGON_LENGTH;  // 4 m
    const RL = CONFIG.CARRIAGE_RAMP_LENGTH;   // 4 m
    const CL = CONFIG.TRACK_CHUNK_LENGTH;     // 6 m

    // Default z for non-train obstacles: centred in the chunk
    const obsZ = -CL / 2;

    const lanes = [slot.lane0 ?? null, slot.lane1 ?? null, slot.lane2 ?? null];

    for (let li = 0; li < 3; li++) {
      const type = lanes[li];
      if (!type) continue;

      if (type === 'wagon') {
        // Wagon front face flush with chunk start; body runs z=0…-12 across the next 2 chunks.
        // If the preceding slot had a 'ramp' on this lane: use forceRamp=true (removes wall,
        // adds ramp_trigger) but skip the visual (standalone ramp already provides it).
        const hasExtRamp = slot._prevRampLanes?.has(li) ?? false;
        const carriage = buildCarriage(1, li, hasExtRamp ? true : false, hasExtRamp);
        carriage.position.z = 0;
        group.add(carriage);
      } else if (type === 'wagon_ramp') {
        // Wagon with built-in ramp: forceRamp=true removes the front wall, adds ramp_trigger,
        // and the ramp visual extends 6 m forward into the preceding chunk (same space as a
        // standalone 'ramp' slot would occupy — no separate ramp slot needed).
        const carriage = buildCarriage(1, li, true);
        carriage.position.z = 0;
        group.add(carriage);
      } else if (type === 'ramp') {
        // Visual-only standalone ramp (legacy / non-wagon contexts).
        const ramp = buildRamp(li);
        ramp.position.z = 0;
        group.add(ramp);
      } else {
        const obs = buildObstacle(type);
        obs.position.set(laneX(li), 0, obsZ);
        group.add(obs);
      }
    }
    return group;
  }

  update(dt, speed) {
    // Scroll all active chunks toward the camera
    const dz = speed * dt;
    this._pool.scroll(dz);

    // Despawn chunks that have passed the camera
    for (const chunk of [...this._pool.active]) {
      if (chunk.position.z > CONFIG.DESPAWN_Z) {
        this._scene.remove(chunk);
        this._pool.release(chunk);
        this._spawnNext(speed);
      }
    }
  }

  /** Returns all coin meshes in active chunks */
  getCoins() {
    const coins = [];
    for (const chunk of this._pool.active) {
      chunk.traverse(obj => {
        if (obj.userData.role === 'coin' && !obj.userData.collected) coins.push(obj);
      });
    }
    return coins;
  }

  /** Returns all obstacle meshes in active chunks */
  getObstacles() {
    const obs = [];
    for (const chunk of this._pool.active) {
      chunk.traverse(obj => {
        if (obj.userData.role === 'obstacle') obs.push(obj);
      });
    }
    return obs;
  }

  /**
   * Returns true if a carriage (body or ramp) occupies `lane` at the given worldZ.
   * Used to block lane-switch input when the player is on the ground.
   */
  isCarriageBlockingLane(lane, worldZ) {
    const targetX = (lane - 1) * CONFIG.LANE_SPACING;
    const tmpPos  = new THREE.Vector3();
    for (const chunk of this._pool.active) {
      let blocked = false;
      chunk.traverse(obj => {
        if (blocked) return;
        const role = obj.userData?.role;
        if (role !== 'platform' && role !== 'ramp_trigger') return;
        obj.updateWorldMatrix(true, false);
        obj.getWorldPosition(tmpPos);
        if (Math.abs(tmpPos.x - targetX) < obj.userData.halfW &&
            worldZ > tmpPos.z - obj.userData.halfZ &&
            worldZ < tmpPos.z + obj.userData.halfZ) {
          blocked = true;
        }
      });
      if (blocked) return true;
    }
    return false;
  }

  /** Returns ramp triggers and platform triggers for carriage physics */
  getCarriagePhysics() {
    const ramps = [], platforms = [];
    for (const chunk of this._pool.active) {
      chunk.traverse(obj => {
        if (!obj.userData) return;
        if (obj.userData.role === 'ramp_trigger') ramps.push(obj);
        if (obj.userData.role === 'platform')     platforms.push(obj);
      });
    }
    return { ramps, platforms };
  }

  /** Returns all power-up meshes in active chunks */
  getPowerups() {
    const pwrs = [];
    for (const chunk of this._pool.active) {
      chunk.traverse(obj => {
        if (obj.userData.role === 'powerup' && !obj.userData.collected) pwrs.push(obj);
      });
    }
    return pwrs;
  }

  reset() {
    for (const chunk of [...this._pool.active]) {
      this._scene.remove(chunk);
      this._pool.release(chunk);
    }
    this._formationQueue = [];
    this._lastChunkHadObstacle = false;
  }
}
