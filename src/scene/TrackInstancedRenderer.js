// src/scene/TrackInstancedRenderer.js
// Renders all track-ground tiles as InstancedMesh — one draw call per sub-mesh
// in the source GLB instead of N clones per chunk.

import * as THREE from 'three';
import { getAsset } from '../core/AssetRegistry.js';
import { CONFIG } from '../config.js';

// 2 tiles per lane per chunk, 3 lanes, up to CHUNK_POOL_SIZE chunks + small headroom
const MAX_TILES = CONFIG.CHUNK_POOL_SIZE * CONFIG.LANE_COUNT * 2 + 16;

export class TrackInstancedRenderer {
  constructor(scene) {
    this._scene        = scene;
    this._meshInfos    = []; // { localMatrix: Matrix4 }
    this._iMeshes      = []; // THREE.InstancedMesh[]
    this._slots        = new Array(MAX_TILES).fill(null); // {x,y,z,rotX} | null
    this._freeIndices  = Array.from({ length: MAX_TILES }, (_, i) => i);
    this._dummy        = new THREE.Object3D();
    this._tmpMatrix    = new THREE.Matrix4();
  }

  /**
   * Must be called after AssetRegistry has finished loading assets.
   * Extracts geometry+material from the track GLB and builds InstancedMesh objects.
   */
  init() {
    const source = getAsset('track/chunk');

    // Compute the source root's world matrix (it's not in the scene yet, so force it)
    source.updateMatrixWorld(true);
    const srcWorldInv = new THREE.Matrix4().copy(source.matrixWorld).invert();

    source.traverse(obj => {
      if (!obj.isMesh) return;
      obj.updateWorldMatrix(true, false);

      // Sub-mesh transform relative to source root
      const localMatrix = new THREE.Matrix4()
        .copy(srcWorldInv)
        .multiply(obj.matrixWorld);

      this._meshInfos.push({ localMatrix });

      const im = new THREE.InstancedMesh(obj.geometry, obj.material, MAX_TILES);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.castShadow    = false;
      im.receiveShadow = true;
      this._iMeshes.push(im);
      this._scene.add(im);
    });

    // Hide all instances by zeroing their scale
    this._dummy.scale.set(0, 0, 0);
    this._dummy.updateMatrix();
    for (const im of this._iMeshes) {
      for (let i = 0; i < MAX_TILES; i++) im.setMatrixAt(i, this._dummy.matrix);
      im.instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * Reserve a slot and place it at (x, y, z) with rotation rotX around X.
   * Returns the slot index (store it to free later).
   */
  allocate(x, y, z, rotX) {
    if (this._freeIndices.length === 0) {
      // console.warn('[TrackInstancedRenderer] out of slots — increase MAX_TILES');
      return -1;
    }
    const idx = this._freeIndices.pop();
    this._slots[idx] = { x, y, z, rotX };
    this._writeMatrix(idx);
    return idx;
  }

  /** Release a slot and hide the instance. */
  free(idx) {
    if (idx < 0 || !this._slots[idx]) return;
    this._slots[idx] = null;
    this._dummy.position.set(0, 0, 0);
    this._dummy.rotation.set(0, 0, 0);
    this._dummy.scale.set(0, 0, 0);
    this._dummy.updateMatrix();
    for (const im of this._iMeshes) {
      im.setMatrixAt(idx, this._dummy.matrix);
      im.instanceMatrix.needsUpdate = true;
    }
    this._freeIndices.push(idx);
  }

  /** Scroll all active slots by dz (called every frame alongside chunk scroll). */
  scroll(dz) {
    let dirty = false;
    for (let i = 0; i < MAX_TILES; i++) {
      const s = this._slots[i];
      if (!s) continue;
      s.z += dz;
      this._writeMatrix(i);
      dirty = true;
    }
    if (dirty) {
      for (const im of this._iMeshes) im.instanceMatrix.needsUpdate = true;
    }
  }

  /** Remove all InstancedMeshes from the scene and release GPU resources. */
  destroy() {
    for (const im of this._iMeshes) {
      this._scene.remove(im);
      im.geometry.dispose();
    }
    this._iMeshes   = [];
    this._meshInfos = [];
    this._slots.fill(null);
    this._freeIndices = Array.from({ length: MAX_TILES }, (_, i) => i);
  }

  _writeMatrix(idx) {
    const s = this._slots[idx];
    this._dummy.position.set(s.x, s.y, s.z);
    this._dummy.rotation.set(s.rotX, 0, 0);
    this._dummy.scale.set(1, 1, 1);
    this._dummy.updateMatrix();

    for (let mi = 0; mi < this._iMeshes.length; mi++) {
      this._tmpMatrix.multiplyMatrices(this._dummy.matrix, this._meshInfos[mi].localMatrix);
      this._iMeshes[mi].setMatrixAt(idx, this._tmpMatrix);
    }
  }
}
