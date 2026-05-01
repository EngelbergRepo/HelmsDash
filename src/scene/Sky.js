// src/scene/Sky.js
// Pixel-art sky dome + scrolling blocky cloud pool.
// Dome follows camera X so the horizon colour always matches the scene fog.
// Clouds scroll with the world and wrap when they pass the camera.

import * as THREE from 'three';
import { CONFIG } from '../config.js';

const CLOUD_COUNT   = 12;
const CLOUD_Y_MIN   = 28;
const CLOUD_Y_MAX   = 52;
const CLOUD_X_RANGE = 180;  // half-width of spawn band
const CLOUD_Z_NEAR  = 25;   // wrap trigger (cloud passed camera)
const CLOUD_Z_FAR   = 220;  // furthest spawn distance ahead
const DRIFT_SPEED   = 0.6;  // m/s lateral drift

// Smooth horizon-fog → pastel blue gradient.
// ShaderMaterial bypasses Three.js tone-mapping so we output linear RGB directly.
const SKY_VERT = /* glsl */`
  varying float vY;
  void main() {
    vY = normalize(position).y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const SKY_FRAG = /* glsl */`
  varying float vY;
  uniform float uHorizonLine;   // vY of the fog/sky boundary
  uniform float uHorizonSpread; // transition sharpness
  void main() {
    // shift so the boundary sits at uHorizonLine, then scale by spread
    float t = clamp((vY - uHorizonLine) * uHorizonSpread, 0.0, 1.0);
    float smooth_t = t * t * (3.0 - 2.0 * t); // smoothstep S-curve

    vec3 horizon = vec3(0.78, 0.71, 0.60); // matches scene fog colour — hazy warm
    vec3 sky     = vec3(0.53, 0.72, 0.90); // single pastel cornflower blue

    gl_FragColor = vec4(mix(horizon, sky, smooth_t), 1.0);
  }
`;

// Cloud material — shared, flat-shaded for the pixelated look
const CLOUD_MAT = new THREE.MeshStandardMaterial({
  color:      0xF2E5FF,   // warm purple-white
  flatShading: true,
  roughness:  1.0,
  metalness:  0.0,
  fog:        false,      // clouds sit above the ground fog layer
});

// 20 hand-authored voxel cloud shapes.
// Each entry is an array of boxes: [cx, cy, cz, w, h, d]
// Using small block sizes (1–2 units) for a granular pixel-art look.
const CLOUD_SHAPES = [
  // 0 — classic small puff
  [ [0,0,0, 6,1,2],  [-1.5,1,0, 2,1,1.5], [0,1,0, 3,1.5,1.5], [1.5,1,0, 2,1,1.5] ],
  // 1 — wide flat stratus
  [ [0,0,0, 10,1,2], [-3,1,0, 3,1,1.5], [0,1,0, 2,1.5,1.5], [3,1,0, 3,1,1.5] ],
  // 2 — tall central peak
  [ [0,0,0, 5,1,2],  [-1,1,0, 2,1.5,1.5], [0,1,0, 3,2,1.5], [1.5,1,0, 1.5,1,1] ],
  // 3 — double-hump
  [ [0,0,0, 8,1,2],  [-2.5,1,0, 2.5,2,2], [2.5,1,0, 2.5,2,2], [0,1,0, 2,1,1.5] ],
  // 4 — lumpy medium
  [ [0,0,0, 7,1,2],  [-2,1,0, 2,1,1.5], [-0.5,1,0, 2,2,1.5], [2,1,0, 2,1.5,1.5], [0,2,0, 1.5,1,1] ],
  // 5 — tiny wisp
  [ [0,0,0, 4,1,1.5], [-1,1,0, 1.5,1,1], [0.5,1,0, 2,1.5,1], [1.5,0.5,0, 1,0.5,1] ],
  // 6 — long banner cloud
  [ [0,0,0, 12,1,1.5], [-4,1,0, 2,1,1], [-1,1,0, 3,1.5,1.5], [3,1,0, 2,1,1], [5,0.5,0, 2,0.5,1] ],
  // 7 — chunky square
  [ [0,0,0, 6,1,3],  [-1.5,1,0.5, 2,2,2], [1.5,1,-0.5, 2,1.5,2], [0,1,0, 2,2.5,1.5] ],
  // 8 — stepped pyramid
  [ [0,0,0, 8,1,2],  [0,1,0, 6,1,1.5], [0,2,0, 4,1,1], [0,3,0, 2,1,1] ],
  // 9 — asymmetric lean-right
  [ [0,0,0, 7,1,2],  [-2,1,0, 2,1,1.5], [0.5,1,0, 3,2,2], [2.5,2,0, 2,1.5,1.5], [3,3,0, 1.5,1,1] ],
  // 10 — fat low cloud
  [ [0,0,0, 9,1.5,3], [-3,1.5,0, 2,1,2], [0,1.5,0, 4,2,2], [3,1.5,0, 2,1,2] ],
  // 11 — three-peak
  [ [0,0,0, 9,1,2],  [-3,1,0, 2,1.5,1.5], [0,1,0, 2,2.5,1.5], [3,1,0, 2,1.5,1.5], [-1.5,2,0, 1,1,1], [1.5,2,0, 1,1,1] ],
  // 12 — wispy left-trail
  [ [0,0,0, 8,1,2],  [-3,1,0, 3,2,2], [0,1,0, 2,1.5,1.5], [2.5,0.5,0, 3,0.5,1], [4,0,0, 2,0.5,1] ],
  // 13 — tall thunderhead
  [ [0,0,0, 6,1,2],  [-1,1,0, 2,1.5,1.5], [0,1,0, 3,3,2], [1.5,1,0, 2,2,1.5], [0,3,0, 2,1.5,1.5], [0,4,0, 1.5,1,1] ],
  // 14 — scattered blobs
  [ [-3,0,0, 3,1,1.5], [-3,1,0, 2,1,1], [0,0,0, 4,1,2], [0,1,0, 3,1.5,1.5], [3,0,0, 3,1,1.5], [2.5,1,0, 2,1,1] ],
  // 15 — shallow wide
  [ [0,0,0, 11,1,2],  [-3.5,1,0, 2,1,1.5], [-1,1,0, 3,1.5,2], [2,1,0, 2,1,1.5], [4,1,0, 1.5,0.5,1] ],
  // 16 — compact dense
  [ [0,0,0, 5,1,2.5], [-1,1,0, 2,1.5,2], [0,1,0.5, 3,2,1.5], [1,2,0, 2,1.5,1.5], [0,3,0, 1.5,1,1] ],
  // 17 — two separate puffs
  [ [-4,0,0, 4,1,2],  [-4.5,1,0, 2.5,1.5,1.5], [-3,1,0, 2,2,1.5],
    [3,0,0, 4,1,2],   [2.5,1,0, 2,1.5,1.5], [4,1,0, 2,1,1.5] ],
  // 18 — right-leaning stack
  [ [0,0,0, 6,1,2],  [-1,1,0, 3,1.5,2], [0,2,0, 2.5,1.5,1.5], [1,3,0, 2,1,1.5], [1.5,4,0, 1.5,1,1] ],
  // 19 — broad anvil top
  [ [0,0,0, 7,1,2],  [0,1,0, 5,1.5,2], [0,2,0, 8,1,1.5], [-3,2,0, 1.5,0.5,1], [3,2,0, 1.5,0.5,1] ],
];

function makeCloud(shapeIndex) {
  const group = new THREE.Group();
  const boxes = CLOUD_SHAPES[shapeIndex];
  for (const [cx, cy, cz, w, h, d] of boxes) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), CLOUD_MAT);
    mesh.position.set(cx, cy, cz);
    group.add(mesh);
  }
  return group;
}

function randomCloudPos() {
  return {
    x: (Math.random() - 0.5) * CLOUD_X_RANGE * 2,
    y: CLOUD_Y_MIN + Math.random() * (CLOUD_Y_MAX - CLOUD_Y_MIN),
    z: -(CLOUD_Z_NEAR + Math.random() * (CLOUD_Z_FAR - CLOUD_Z_NEAR)),
  };
}

export class Sky {
  constructor(scene) {
    this._scene  = scene;
    this._clouds = [];
    this._dome   = null;
    this._time   = 0;
  }

  init() {
    this._buildDome();
    this._buildClouds();
  }

  _buildDome() {
    // Radius must be safely inside camera FAR (300). Camera can drift ±~10 units in X;
    // dome follows camera X so worst-case distance = radius. 240 < 300 with headroom.
    const geo = new THREE.SphereGeometry(240, 16, 10);
    const mat = new THREE.ShaderMaterial({
      vertexShader:   SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        uHorizonLine:   { value: CONFIG.SKY_HORIZON_LINE },
        uHorizonSpread: { value: CONFIG.SKY_HORIZON_SPREAD },
      },
      side:           THREE.BackSide,
      depthTest:      false,  // never occluded — always drawn as background
      depthWrite:     false,
    });
    this._dome = new THREE.Mesh(geo, mat);
    this._dome.renderOrder = -1;        // draw before all scene objects
    this._dome.frustumCulled = false;   // camera is always inside — skip culling test
    this._scene.add(this._dome);
  }

  _buildClouds() {
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const shapeIndex = Math.floor(Math.random() * CLOUD_SHAPES.length);
      const cloud = makeCloud(shapeIndex);
      const p = randomCloudPos();
      cloud.position.set(p.x, p.y, p.z);
      cloud.rotation.y = Math.random() * Math.PI * 2;
      this._scene.add(cloud);
      this._clouds.push(cloud);
    }
  }

  /** Call every frame. dz = world scroll this frame, cameraX = camera world X */
  update(dz, cameraX, dt) {
    this._time += dt;

    // Dome follows camera entirely so it's always centred on the view
    if (this._dome) {
      this._dome.position.x = cameraX;
      this._dome.position.y = CONFIG.CAMERA_HEIGHT;
      this._dome.position.z = CONFIG.CAMERA_BEHIND;
    }

    for (const cloud of this._clouds) {
      cloud.position.z += dz;
      cloud.position.x += DRIFT_SPEED * dt; // slow lateral drift

      // When a cloud scrolls past the camera, swap shape and recycle far ahead
      if (cloud.position.z > CLOUD_Z_NEAR) {
        const idx = Math.floor(Math.random() * CLOUD_SHAPES.length);
        // Rebuild children in-place: clear old boxes, add new ones
        while (cloud.children.length) cloud.remove(cloud.children[0]);
        for (const [cx, cy, cz, w, h, d] of CLOUD_SHAPES[idx]) {
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), CLOUD_MAT);
          mesh.position.set(cx, cy, cz);
          cloud.add(mesh);
        }
        const p = randomCloudPos();
        cloud.position.set(p.x, p.y, p.z);
        cloud.rotation.y = Math.random() * Math.PI * 2;
      }
    }
  }

  reset() {
    for (const cloud of this._clouds) {
      const p = randomCloudPos();
      cloud.position.set(p.x, p.y, p.z);
    }
  }

  destroy() {
    if (this._dome) this._scene.remove(this._dome);
    for (const cloud of this._clouds) this._scene.remove(cloud);
    this._clouds = [];
    this._dome   = null;
  }
}
