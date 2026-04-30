// src/scene/Environment.js
// Procedural side decorations: buildings, trees, alleys, banners

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { getAsset } from '../core/AssetRegistry.js';
import { applyWorldBend } from '../core/worldBend.js';

const TRACK_HALF_WIDTH = CONFIG.LANE_SPACING * (CONFIG.LANE_COUNT / 2) + 0.5;
const SIDE_OFFSET = TRACK_HALF_WIDTH + CONFIG.SIDE_SCENE_GAP;

export class Environment {
  constructor(scene) {
    this._scene = scene;
    this._leftObjects  = [];
    this._rightObjects = [];
    this._totalZ = 0; // how far we've generated
    this._stripLength = 60; // generate in strips
  }

  init() {
    this._buildGroundPlanes();

    const strips = 4;
    for (let i = 0; i < strips; i++) {
      this._generateStrip(this._totalZ);
      this._totalZ -= this._stripLength;
    }
  }

  _buildGroundPlanes() {
    const W = CONFIG.GROUND_PLANE_WIDTH;
    // Segment long enough to always cover the visible distance (FOG_FAR + headroom)
    const L = CONFIG.FAR;

    // Texture repeats once in X; in Z it tiles proportionally to keep square pixels
    const tex = new THREE.TextureLoader().load('/assets/models/environment/ground.png');
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, L / W);

    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1.0, metalness: 0 });
    applyWorldBend(mat);
    // Many segments along Z so the vertex shader has enough vertices to show curvature and turn bend
    const geo = new THREE.PlaneGeometry(W, L, 4, 80);

    // Two segments leapfrog so there is always ground ahead
    this._groundSegments = [0, 1].map(i => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, -0.05, -L / 2 - i * L);
      mesh.receiveShadow = true;
      this._scene.add(mesh);
      return mesh;
    });
  }

  _generateStrip(startZ) {
    const len = this._stripLength;

    // Left side
    let z = startZ;
    while (z > startZ - len) {
      const type = this._pickBuildingType();
      const obj = this._buildSideObject(type, 'left');
      if (!obj) { z -= 8; continue; }
      obj.position.set(-SIDE_OFFSET - obj.userData.halfW, 0, z - obj.userData.depth / 2);
      this._scene.add(obj);
      this._leftObjects.push(obj);
      z -= obj.userData.depth + 0.5 + Math.random() * 2;
    }

    // Right side
    z = startZ;
    while (z > startZ - len) {
      const type = this._pickBuildingType();
      const obj = this._buildSideObject(type, 'right');
      if (!obj) { z -= 8; continue; }
      obj.position.set(SIDE_OFFSET + obj.userData.halfW, 0, z - obj.userData.depth / 2);
      this._scene.add(obj);
      this._rightObjects.push(obj);
      z -= obj.userData.depth + 0.5 + Math.random() * 2;
    }
  }

  _pickBuildingType() {
    const r = Math.random();
    if (r < CONFIG.TREE_FREQUENCY) return 'tree';
    const buildingTypes = CONFIG.BUILDING_TYPES;
    return buildingTypes[Math.floor(Math.random() * buildingTypes.length)];
  }

  _buildSideObject(type, side) {
    let obj;
    if (type === 'tree') {
      obj = getAsset('environment/tree_oak');
      obj.userData.halfW = 1.0;
      obj.userData.depth = 2.0;
    } else if (type === 'building_a') {
      obj = getAsset('environment/building_a');
      obj.userData.halfW = 2.2;
      obj.userData.depth = 4.0;
    } else if (type === 'building_b') {
      obj = getAsset('environment/building_b');
      obj.userData.halfW = 1.8;
      obj.userData.depth = 4.0;
    } else if (type === 'alley') {
      // Alley gap — just place a banner overhead
      obj = getAsset('environment/banner');
      obj.userData.halfW = 0.1;
      obj.userData.depth = 2.0;
    } else {
      return null;
    }

    if (side === 'right') obj.scale.x = -1; // mirror for right side
    return obj;
  }

  update(dz) {
    if (this._groundSegments) {
      const L = CONFIG.FAR;
      for (const seg of this._groundSegments) {
        seg.position.z += dz;
        // When a segment scrolls fully past the player, leap it to the front
        if (seg.position.z > CONFIG.DESPAWN_Z) {
          seg.position.z -= L * 2;
        }
      }
    }

    const moveAll = (arr) => {
      for (let i = arr.length - 1; i >= 0; i--) {
        arr[i].position.z += dz;
        // Remove if too far behind camera
        if (arr[i].position.z > CONFIG.DESPAWN_Z + 10) {
          this._scene.remove(arr[i]);
          arr.splice(i, 1);
        }
      }
    };

    this._totalZ += dz; // keep leading edge in sync with world scroll

    moveAll(this._leftObjects);
    moveAll(this._rightObjects);

    // Generate more strips until we have content at least LOOKAHEAD units ahead
    const LOOKAHEAD = 120;
    while (this._totalZ > -LOOKAHEAD) {
      this._generateStrip(this._totalZ);
      this._totalZ -= this._stripLength;
    }
  }

  reset() {
    [...this._leftObjects, ...this._rightObjects].forEach(o => this._scene.remove(o));
    this._leftObjects = [];
    this._rightObjects = [];
    this._totalZ = 0;
    if (this._groundSegments) {
      const L = CONFIG.FAR;
      this._groundSegments.forEach((seg, i) => {
        seg.position.z = -L / 2 - i * L;
      });
    }
  }
}
