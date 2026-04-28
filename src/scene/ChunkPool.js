// src/scene/ChunkPool.js
// Object-pool for track chunks — recycles THREE.Group objects

import * as THREE from 'three';

export class ChunkPool {
  constructor(size) {
    this._size = size;
    this._pool = [];   // available (inactive) chunks
    this._active = []; // currently in-scene chunks
  }

  /**
   * Get a chunk group from the pool or create a new one.
   * The caller is responsible for populating/reset-ting it.
   */
  acquire() {
    if (this._pool.length > 0) {
      const chunk = this._pool.pop();
      chunk.visible = true;
      this._active.push(chunk);
      return chunk;
    }
    const chunk = new THREE.Group();
    this._active.push(chunk);
    return chunk;
  }

  /**
   * Return a chunk to the pool — removes all children and hides it.
   * Disposes cloned materials to prevent GPU memory accumulation.
   * Geometry is NOT disposed because getAsset clones share the same geometry buffer.
   */
  release(chunk) {
    const idx = this._active.indexOf(chunk);
    if (idx !== -1) this._active.splice(idx, 1);

    while (chunk.children.length > 0) {
      const child = chunk.children[0];
      child.traverse(obj => {
        if (obj.isMesh) [].concat(obj.material).forEach(m => m.dispose());
      });
      chunk.remove(child);
    }

    chunk.visible = false;
    chunk.position.set(0, 0, 0);
    this._pool.push(chunk);
  }

  get active() { return this._active; }

  /** Update Z positions of all active chunks */
  scroll(dz) {
    for (const chunk of this._active) {
      chunk.position.z += dz;
    }
  }
}
