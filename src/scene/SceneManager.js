// src/scene/SceneManager.js
// Lights, fog, sky, camera rig

import * as THREE from 'three';
import { CONFIG } from '../config.js';

export class SceneManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = null;
    this._cameraTargetY   = CONFIG.CAMERA_HEIGHT;
    this._cameraCurrentY  = CONFIG.CAMERA_HEIGHT;
    this._lookTargetY     = 1;      // smoothly interpolated lookAt Y
    this._lookCurrentY    = 1;
    this._shakeIntensity  = 0;
    this._shakeDecay      = 5;
    this._flashEl         = null;
    this._init();
  }

  _init() {
    const scene = this.scene;
    const renderer = this.renderer;

    // Renderer settings
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    // Sky colour
    scene.background = new THREE.Color(0xc8b89a);
    scene.fog = new THREE.Fog(CONFIG.FOG_COLOR, CONFIG.FOG_NEAR, CONFIG.FOG_FAR);

    // Hemisphere light (sky/ground)
    const hemi = new THREE.HemisphereLight(0xffe4b5, 0x8b6914, 0.6);
    scene.add(hemi);

    // Sun (directional)
    const sun = new THREE.DirectionalLight(0xfff5e0, 1.8);
    sun.position.set(-20, 40, 20);
    sun.castShadow = true;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 200;
    sun.shadow.camera.left = -50;
    sun.shadow.camera.right = 50;
    sun.shadow.camera.top = 50;
    sun.shadow.camera.bottom = -50;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.001;
    scene.add(sun);

    // Ambient fill
    const ambient = new THREE.AmbientLight(0x7a6050, 0.4);
    scene.add(ambient);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      CONFIG.FOV,
      window.innerWidth / window.innerHeight,
      CONFIG.NEAR,
      CONFIG.FAR
    );
    this.camera.position.set(0, CONFIG.CAMERA_HEIGHT, CONFIG.CAMERA_BEHIND);
    this.camera.lookAt(0, 1, -CONFIG.CAMERA_LOOK_AHEAD);

    // Ground fog plane — large sheet just above ground level
    this._fogTime = { value: 0 };
    const fogMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vWorldPos; varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position,1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        varying vec3 vWorldPos; varying vec2 vUv;
        uniform float uTime;
        void main() {
          float fogH = clamp(1.0 - vWorldPos.y/1.2, 0.0, 1.0);
          float swirl = sin(vWorldPos.x*0.5 + uTime*0.4)*sin(vWorldPos.z*0.3 + uTime*0.25)*0.5+0.5;
          float dens = fogH * swirl * 0.22;
          gl_FragColor = vec4(0.78,0.71,0.60, dens);
        }`,
      uniforms: { uTime: this._fogTime },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const fogPlane = new THREE.Mesh(new THREE.PlaneGeometry(400, 800), fogMat);
    fogPlane.rotation.x = -Math.PI / 2;
    fogPlane.position.y = 0.05;
    fogPlane.position.z = -150;
    scene.add(fogPlane);

    // Screen flash overlay
    this._flashEl = document.createElement('div');
    Object.assign(this._flashEl.style, {
      position: 'fixed', inset: '0', pointerEvents: 'none',
      opacity: '0', transition: 'opacity 0.05s ease-out',
      zIndex: '100',
    });
    document.body.appendChild(this._flashEl);

    window.addEventListener('resize', () => this._onResize());
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /** Follow a target position — called every frame from Game */
  updateCamera(targetX, targetZ, dt) {
    const lerp = Math.min(dt * 5, 1);
    this._cameraCurrentY += (this._cameraTargetY - this._cameraCurrentY) * lerp;
    this._lookCurrentY   += (this._lookTargetY   - this._lookCurrentY)   * lerp;
    // Camera shake
    const shakeX = this._shakeIntensity > 0 ? (Math.random() - 0.5) * this._shakeIntensity * 0.3 : 0;
    const shakeY = this._shakeIntensity > 0 ? (Math.random() - 0.5) * this._shakeIntensity * 0.2 : 0;
    this._shakeIntensity = Math.max(0, this._shakeIntensity - dt * this._shakeDecay);

    this.camera.position.set(
      targetX + shakeX,
      this._cameraCurrentY + shakeY,
      targetZ + CONFIG.CAMERA_BEHIND
    );
    this.camera.lookAt(targetX, this._lookCurrentY, targetZ - CONFIG.CAMERA_LOOK_AHEAD);
  }

  setJetpackAltitude(active, obstacleMaxHeight) {
    if (active) {
      // Raise camera by a modest fixed offset — avoid a steep downward angle
      this._cameraTargetY = CONFIG.CAMERA_HEIGHT + 5;
      // Raise lookAt to keep the horizon in view
      this._lookTargetY = obstacleMaxHeight + 1.5;
    } else {
      this._cameraTargetY = CONFIG.CAMERA_HEIGHT;
      this._lookTargetY   = 1;
    }
  }

  shake(intensity = 0.5) {
    this._shakeIntensity = Math.max(this._shakeIntensity, intensity);
  }

  flash(color = '#ff0000', durationMs = 200) {
    if (!this._flashEl) return;
    this._flashEl.style.background = color;
    this._flashEl.style.opacity = '0.35';
    setTimeout(() => { this._flashEl.style.opacity = '0'; }, durationMs);
  }

  render(dt = 0) {
    this._fogTime.value += dt;
    this.renderer.render(this.scene, this.camera);
  }
}
