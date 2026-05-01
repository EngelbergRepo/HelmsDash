// src/scene/ChunkPresetLoader.js
// Loads THREE.ObjectLoader JSON chunk presets authored in the Three.js Editor.

import * as THREE from 'three';
import { loadFromFile } from '../core/persist.js';

const STRIP_TYPES = ['PerspectiveCamera', 'OrthographicCamera',
                     'AmbientLight', 'DirectionalLight', 'PointLight'];

export class ChunkPresetLoader {
  constructor() {
    this.loader = new THREE.ObjectLoader();
    this.cache  = new Map();   // filename → parsed Group
  }

  async loadAll(manifest) {
    // manifest = array of { file, difficulty, spawnWeight, hasPowerup, hasObstacle }
    const results = [];
    for (const entry of manifest) {
      try {
        const group = await this._load(entry.file);
        results.push({ ...entry, group });
      } catch (e) {
        // console.warn(`[ChunkPresetLoader] Failed to load ${entry.file}:`, e);
      }
    }
    return results;
  }

  async _load(filename) {
    if (this.cache.has(filename)) return this.cache.get(filename).clone();

    const json = await loadFromFile(`assets/chunks/${filename}`);
    if (!json) throw new Error(`File not found: assets/chunks/${filename}`);

    const scene = this.loader.parse(json);

    // Strip cameras and lights — they come from the main scene
    scene.traverse(obj => {
      if (STRIP_TYPES.includes(obj.type)) obj.parent?.remove(obj);
    });

    // Parse naming convention → userData roles
    scene.traverse(obj => {
      const name = obj.name;
      if      (name.startsWith('OBS_'))    obj.userData.role = 'obstacle';
      else if (name.startsWith('COIN_'))   obj.userData.role = 'coin';
      else if (name.startsWith('JCOIN_'))  obj.userData.role = 'jetpackCoin';
      else if (name.startsWith('PWR_'))    obj.userData.role = 'powerup';
      else if (name.startsWith('SIDE_'))   obj.userData.role = 'deco';
      else if (name.startsWith('DECO_'))   obj.userData.role = 'deco';
      else if (name.startsWith('GROUND_')) obj.userData.role = 'ground';
    });

    this.cache.set(filename, scene);
    return scene.clone();
  }
}
