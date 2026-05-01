// src/core/AssetRegistry.js
// Maps logical asset names to placeholder factories + optional GLB paths.
// Reads asset_overrides.json at startup to substitute real models.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadFromFile } from './persist.js';
import { applyWorldBend } from './worldBend.js';
import { CONFIG } from '../config.js';

// ──────────────────────────────────────────────────────────────
// Placeholder factory functions
// ──────────────────────────────────────────────────────────────

function buildKnight() {
  const group = new THREE.Group();

  // Body (chainmail)
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.3, 1.0, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x6a7a8a, roughness: 0.7, metalness: 0.4 })
  );
  body.position.y = 0.9;
  body.castShadow = true;

  // Cape (red box behind body)
  const cape = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.9, 0.08),
    new THREE.MeshStandardMaterial({ color: 0xaa1a1a, roughness: 0.9 })
  );
  cape.position.set(0, 0.85, 0.2);

  // Head / Helmet
  const helmet = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.35, 8),
    new THREE.MeshStandardMaterial({ color: 0x888ea0, roughness: 0.3, metalness: 0.8 })
  );
  helmet.position.y = 1.65;

  // Visor slit
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.04, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x111111 })
  );
  visor.position.set(0, 1.52, -0.22);

  group.add(body, cape, helmet, visor);
  group.name = 'knight';
  return group;
}

function buildCart() {
  const group = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 1.4, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.9 })
  );
  box.position.y = 0.9;
  box.castShadow = true;

  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x3d2810, roughness: 0.8 });
  const positions = [[-0.8, 0.35, -0.7], [0.8, 0.35, -0.7], [-0.8, 0.35, 0.7], [0.8, 0.35, 0.7]];
  positions.forEach(([x, y, z]) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.12, 12), wheelMat);
    w.rotation.x = Math.PI / 2;
    w.position.set(x, y, z);
    w.castShadow = true;
    group.add(w);
  });

  group.add(box);
  group.name = 'cart';
  return group;
}

function buildBarrel() {
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.4, 1.2, 12),
    new THREE.MeshStandardMaterial({ color: 0x6b3d1e, roughness: 0.85 })
  );
  barrel.position.y = 0.6;
  barrel.castShadow = true;
  const group = new THREE.Group();
  group.add(barrel);
  group.name = 'barrel';
  return group;
}

function buildGate() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.8 });
  const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.8, 0.3), mat);
  pillarL.position.set(-1.3, 1.4, 0);
  pillarL.castShadow = true;
  const pillarR = pillarL.clone();
  pillarR.position.x = 1.3;
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.3, 0.3), mat);
  lintel.position.y = 2.85;
  lintel.castShadow = true;
  group.add(pillarL, pillarR, lintel);
  group.name = 'gate';
  return group;
}

function buildLowBeam() {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(8.0, 0.25, 0.25),
    new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.9 })
  );
  // Bottom of beam at y≈1.0 — rolling player top is 0.9 m, so rolling clears it
  beam.position.y = 1.125;
  beam.castShadow = true;
  group.add(beam);
  group.name = 'low_beam';
  return group;
}

function buildCoin() {
  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.08, 16),
    new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.2, metalness: 0.9, emissive: 0xffa500, emissiveIntensity: 0.3 })
  );
  coin.rotation.x = Math.PI / 2;
  coin.position.y = 0.6;
  coin.castShadow = false;
  const group = new THREE.Group();
  group.add(coin);
  group.name = 'coin';
  return group;
}

function buildMagnet() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xcc1111, roughness: 0.4, metalness: 0.5 });
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.45, 0.15), mat);
  armL.position.set(-0.2, 0.7, 0);
  const armR = armL.clone();
  armR.position.x = 0.2;
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.15, 0.15), mat);
  bridge.position.set(0, 0.95, 0);
  group.add(armL, armR, bridge);
  group.name = 'magnet';
  return group;
}

function buildDoubler() {
  const group = new THREE.Group();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.1, metalness: 1.0, emissive: 0xffaa00, emissiveIntensity: 0.5 })
  );
  sphere.position.y = 0.7;
  const x2 = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.18, 0.05),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1 })
  );
  x2.position.set(0, 0.7, 0.32);
  group.add(sphere, x2);
  group.name = 'doubler';
  return group;
}

function buildJetpack() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x777788, roughness: 0.4, metalness: 0.7 });
  const tankL = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.6, 10), mat);
  tankL.position.set(-0.2, 0.7, 0);
  const tankR = tankL.clone();
  tankR.position.x = 0.2;
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.1, 0.25, 8),
    new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 1, roughness: 1 })
  );
  flame.position.set(0, 0.3, 0);
  flame.rotation.z = Math.PI;
  group.add(tankL, tankR, flame);
  group.name = 'jetpack';
  return group;
}

function buildSprintShoes() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.8 });
  const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.4), mat);
  shoeL.position.set(-0.15, 0.65, 0);
  const shoeR = shoeL.clone();
  shoeR.position.x = 0.15;
  const accent = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.03, 0.42),
    new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0xffcc00, emissiveIntensity: 0.4 })
  );
  accent.position.y = 0.72;
  group.add(shoeL, shoeR, accent);
  group.name = 'sprint_shoes';
  return group;
}

function buildTree() {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.3, 1.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x5c3d1e, roughness: 1 })
  );
  trunk.position.y = 0.75;
  trunk.castShadow = true;
  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(1.0, 2.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x2d5a1b, roughness: 0.9 })
  );
  canopy.position.y = 2.75;
  canopy.castShadow = true;
  group.add(trunk, canopy);
  group.name = 'tree_oak';
  return group;
}

function buildBuildingA() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(4, 5, 3),
    new THREE.MeshStandardMaterial({ color: 0xd4c08a, roughness: 0.95 })
  );
  body.position.y = 2.5;
  body.castShadow = true;
  // Timber frame strips
  const timberMat = new THREE.MeshStandardMaterial({ color: 0x3d1f0a, roughness: 1 });
  const horizontals = [-1.2, 0, 1.2].map(y => {
    const t = new THREE.Mesh(new THREE.BoxGeometry(4.02, 0.15, 0.05), timberMat);
    t.position.set(0, y + 2.5, -1.52);
    return t;
  });
  const verticals = [-1.5, 0, 1.5].map(x => {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.15, 5.02, 0.05), timberMat);
    t.position.set(x, 2.5, -1.52);
    return t;
  });
  // Roof
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(3.2, 1.5, 4),
    new THREE.MeshStandardMaterial({ color: 0x7a3a1a, roughness: 0.9 })
  );
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 5.75;
  group.add(body, ...horizontals, ...verticals, roof);
  group.name = 'building_a';
  return group;
}

function buildBuildingB() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(3, 9, 3),
    new THREE.MeshStandardMaterial({ color: 0xa0a0a0, roughness: 0.8 })
  );
  body.position.y = 4.5;
  body.castShadow = true;
  // Battlements
  for (let i = -1; i <= 1; i++) {
    const merlon = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.6, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9 })
    );
    merlon.position.set(i * 1.0, 9.3, 0);
    group.add(merlon);
  }
  group.add(body);
  group.name = 'building_b';
  return group;
}

function buildBanner() {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 4, 6),
    new THREE.MeshStandardMaterial({ color: 0x5c3a1e })
  );
  pole.position.y = 2;
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.8),
    new THREE.MeshStandardMaterial({ color: 0xcc1111, side: THREE.DoubleSide })
  );
  flag.position.set(0.6, 3.6, 0);
  group.add(pole, flag);
  group.name = 'banner';
  return group;
}

function buildRamp() {
  const group = new THREE.Group();
  const ramp = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.2, 3.0),
    new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.9 })
  );
  ramp.rotation.x = -Math.PI / 12;
  ramp.position.y = 0.3;
  ramp.castShadow = true;
  group.add(ramp);
  group.name = 'carriages/ramp';
  return group;
}

function buildFlatChunk() {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 30),
    new THREE.MeshStandardMaterial({ color: 0x8a7a6a, roughness: 0.95 })
  );
  mesh.rotation.x = -Math.PI / 2;
  const group = new THREE.Group();
  group.add(mesh);
  group.name = 'flat_chunk';
  return group;
}

// ──────────────────────────────────────────────────────────────
// Registry — meshes
// ──────────────────────────────────────────────────────────────

export const REGISTRY = {
  // knight_run.glb has the rigged skeleton — use it as the mesh source.
  // knight.glb is static (no bones) and can't be animated.
  'player/knight':             { placeholder: buildKnight,      glbPath: 'assets/models/player/knight_run.glb' },
  'obstacles/cart':            { placeholder: buildCart,        glbPath: 'assets/models/obstacles/cart.glb' },
  'obstacles/barrel':          { placeholder: buildBarrel,      glbPath: 'assets/models/obstacles/barrel.glb' },
  'obstacles/gate':            { placeholder: buildGate,        glbPath: 'assets/models/obstacles/gate.glb' },
  'obstacles/low_beam':        { placeholder: buildLowBeam,     glbPath: 'assets/models/obstacles/low_beam.glb' },
  'collectibles/coin':         { placeholder: buildCoin,        glbPath: 'assets/models/collectibles/coin.glb' },
  'collectibles/magnet':       { placeholder: buildMagnet,      glbPath: 'assets/models/collectibles/magnet.glb' },
  'collectibles/doubler':      { placeholder: buildDoubler,     glbPath: 'assets/models/collectibles/doubler.glb' },
  'collectibles/jetpack':      { placeholder: buildJetpack,     glbPath: 'assets/models/collectibles/jetpack.glb' },
  'collectibles/sprint_shoes': { placeholder: buildSprintShoes, glbPath: 'assets/models/collectibles/sprint_shoes.glb' },
  'carriages/wagon':           { placeholder: buildCart,        glbPath: 'assets/models/carriages/wagon.glb' },
  'carriages/ramp':            { placeholder: buildRamp,        glbPath: 'assets/models/carriages/wagon_ramp.glb' },
  'environment/tree_oak':      { placeholder: buildTree,        glbPath: 'assets/models/environment/tree_oak.glb' },
  'environment/building_a':    { placeholder: buildBuildingA,   glbPath: 'assets/models/environment/building_a.glb' },
  'environment/building_b':    { placeholder: buildBuildingB,   glbPath: 'assets/models/environment/building_b.glb' },
  'environment/banner':        { placeholder: buildBanner,      glbPath: 'assets/models/environment/banner.glb' },
  'track/turn_left':           { placeholder: buildFlatChunk,   glbPath: 'assets/models/track/turn_left.glb' },
  'track/turn_right':          { placeholder: buildFlatChunk,   glbPath: 'assets/models/track/turn_right.glb' },
  'track/chunk':               { placeholder: buildFlatChunk,   glbPath: 'assets/models/obstacles/track.glb' },
};

// ──────────────────────────────────────────────────────────────
// Animation name map — maps our canonical state names to the actual
// clip names baked into the GLB by the exporter (e.g. Meshy.ai).
// Open the browser console after loading to see what names your
// GLB contains: [AssetRegistry] animations in knight.glb: "Run", "Jump" …
// Then update the values here to match exactly.
// ──────────────────────────────────────────────────────────────

// Maps canonical state names → GLB file paths (one animation per file).
// Add entries here as you export more clips from Meshy.ai.
// Missing entries are silently skipped — placeholder geometry stays visible.
export const ANIMATION_REGISTRY = {
  run:          'assets/models/player/knight_run.glb',
  sprint:       'assets/models/player/knight_sprint.glb',
  // jump_up:   'assets/models/player/knight_jump.glb',
  roll:      'assets/models/player/knight_roll.glb',
  hurt:      'assets/models/player/knight_hurt.glb',
  // land:      'assets/models/player/knight_land.glb',
  jetpack_hover: 'assets/models/player/knight_jetpack.glb',
  // idle:      'assets/models/player/knight_idle.glb',
};

const _gltfLoader  = new GLTFLoader();
const _glbCache    = new Map();             // path → THREE.Group (meshes)
const _clipCache   = new Map();             // clipName → THREE.AnimationClip
const _overrides   = {};

export async function initAssetRegistry(onProgress) {
  // console.log('[AssetRegistry] init start');

  const overrides = await loadFromFile('assets/data/asset_overrides.json');
  if (overrides) {
    Object.assign(_overrides, overrides);
    // console.log('[AssetRegistry] overrides loaded:', Object.keys(_overrides));
  }

  // ── Pre-load mesh GLBs ───────────────────────────────────────
  const meshEntries = Object.entries(REGISTRY);
  const animEntries = Object.entries(ANIMATION_REGISTRY);
  const total = meshEntries.length + animEntries.length;
  let loaded = 0;
  const tick = () => { onProgress?.(++loaded, total); };

  // console.log(`[AssetRegistry] queuing ${meshEntries.length} mesh loads`);

  const meshLoads = meshEntries.map(([key, entry]) => {
    const path = _overrides[key] || entry.glbPath;
    if (!path) {
      // console.log(`[AssetRegistry] skip ${key} — no glbPath`);
      tick(); return Promise.resolve();
    }
    if (_glbCache.has(path)) {
      // console.log(`[AssetRegistry] skip ${key} — already cached`);
      tick(); return Promise.resolve();
    }
    const url = '/' + path;
    // console.log(`[AssetRegistry] loading mesh ${key} from ${url}`);
    return new Promise(resolve => {
      _gltfLoader.load(url,
        gltf => {
          tick();
          _glbCache.set(path, gltf.scene);
          // Apply world-bend shader to all materials in this GLB
          gltf.scene.traverse(child => {
            if (child.isMesh) [].concat(child.material).forEach(applyWorldBend);
          });
          // Apply configurable emission to collectible GLBs
          const collectibleName = key.startsWith('collectibles/') ? key.slice('collectibles/'.length) : null;
          const emCfg = collectibleName && CONFIG.COLLECTIBLE_EMISSION[collectibleName];
          if (emCfg) {
            gltf.scene.traverse(child => {
              if (!child.isMesh) return;
              [].concat(child.material).forEach(mat => {
                if (mat.emissive !== undefined) {
                  mat.emissive.setHex(emCfg.color);
                  mat.emissiveIntensity = emCfg.intensity * 0.5;
                }
              });
            });
          }
          const size = new THREE.Vector3();
          new THREE.Box3().setFromObject(gltf.scene).getSize(size);
          // console.info(`[AssetRegistry] ✓ mesh  ${path}  ${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)} m`);
          // Cache any animations bundled in the same file (e.g. knight_run.glb)
          if (gltf.animations.length > 0) {
            // Find which canonical clip name maps to this path
            const clipName = Object.entries(ANIMATION_REGISTRY).find(([, p]) => p === path)?.[0];
            if (clipName) {
              const clip = gltf.animations[0];
              clip.name = clipName;
              _clipCache.set(clipName, clip);
              // console.info(`[AssetRegistry] ✓ anim  "${clipName}" cached from mesh load  (${gltf.animations.length} clip(s) in file)`);
            }
          }
          resolve();
        },
        undefined,
        (err) => {
          tick();
          // console.warn(`[AssetRegistry] ✗ mesh  ${path} — not found (placeholder used)`, err?.message ?? err);
          resolve();
        }
      );
    });
  });

  // ── Pre-load animation GLBs (one clip per file) ──────────────
  // Skip any whose path is already loaded as a mesh (e.g. knight_run.glb serves double duty).
  // For those, the mesh load above already cached the clip.
  // console.log(`[AssetRegistry] queuing ${animEntries.length} anim loads:`, animEntries.map(([k]) => k));

  const animLoads = animEntries.map(([clipName, path]) => {
    if (_clipCache.has(clipName)) {
      // console.log(`[AssetRegistry] skip anim "${clipName}" — already cached (shared with mesh load)`);
      tick(); return Promise.resolve();
    }
    const url = '/' + path;
    // console.log(`[AssetRegistry] loading anim "${clipName}" from ${url}`);
    return new Promise(resolve => {
      _gltfLoader.load(url,
        gltf => {
          tick();
          // console.log(`[AssetRegistry] anim GLB loaded for "${clipName}": ${gltf.animations.length} clip(s) found`);
          if (gltf.animations.length > 0) {
            gltf.animations.forEach((c, i) =>
              console.log(`  [${i}] name="${c.name}" duration=${c.duration.toFixed(2)}s tracks=${c.tracks.length}`)
            );
            const clip = gltf.animations[0];
            clip.name = clipName;
            _clipCache.set(clipName, clip);
            // console.info(`[AssetRegistry] ✓ anim  "${clipName}" cached`);
          } else {
            // console.warn(`[AssetRegistry] ✗ anim  "${clipName}" — GLB has no animation tracks`);
          }
          resolve();
        },
        undefined,
        (err) => {
          tick();
          // console.warn(`[AssetRegistry] ✗ anim  "${clipName}" (${url}) — load failed:`, err?.message ?? err);
          resolve();
        }
      );
    });
  });

  await Promise.all([...meshLoads, ...animLoads]);
  // console.log(`[AssetRegistry] init complete — meshCache:${_glbCache.size} clipCache:${_clipCache.size}`);
}

/**
 * Returns the cached AnimationClip for the given clip name, or null if not loaded yet.
 * Usage in Player.js:
 *   const clip = getAnimationClip('run');
 *   if (clip) mixer.clipAction(clip).play();
 */
export function getAnimationClip(clipName) {
  const clip = _clipCache.get(clipName) ?? null;
  if (!clip) console.warn(`[AssetRegistry] getAnimationClip("${clipName}") — not in cache (clips available: [${[..._clipCache.keys()].join(', ')}])`);
  return clip;
}

function _hasSkinnedMesh(obj) {
  let found = false;
  obj.traverse(c => { if (c.isSkinnedMesh) found = true; });
  return found;
}

export function getAsset(key) {
  const entry = REGISTRY[key];
  if (!entry) {
    // console.warn(`[AssetRegistry] Unknown key: ${key}`);
    return new THREE.Group();
  }

  const glbPath = _overrides[key] || entry.glbPath;

  if (glbPath && _glbCache.has(glbPath)) {
    const cached = _glbCache.get(glbPath);
    const skinned = _hasSkinnedMesh(cached);
    // console.log(`[AssetRegistry] getAsset("${key}") — ${skinned ? 'SkeletonUtils.clone' : '.clone'}`);
    return skinned ? SkeletonUtils.clone(cached) : cached.clone();
  }

  // Return placeholder — apply world bend to its materials
  const placeholder = entry.placeholder();
  placeholder.traverse(child => {
    if (child.isMesh) [].concat(child.material).forEach(applyWorldBend);
  });

  if (glbPath) {
    _gltfLoader.load(glbPath, (gltf) => {
      _glbCache.set(glbPath, gltf.scene);
    }, undefined, () => { /* silently ignore missing GLB */ });
  }

  return placeholder;
}
