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
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    // Pixel art: low-res render target + fullscreen blit quad
    this._pixelTarget = null;
    this._quadScene   = null;
    this._quadCamera  = null;
    if (CONFIG.PIXEL_ART_ENABLED) this._buildPixelTarget();

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
    if (CONFIG.PIXEL_ART_ENABLED) this._buildPixelTarget();
  }

  _buildPixelTarget() {
    if (this._pixelTarget) this._pixelTarget.dispose();

    const pw = CONFIG.PIXEL_ART_WIDTH;
    const ph = CONFIG.PIXEL_ART_HEIGHT;

    const depthTex = new THREE.DepthTexture(pw, ph);
    depthTex.minFilter = THREE.NearestFilter;
    depthTex.magFilter = THREE.NearestFilter;

    this._pixelTarget = new THREE.WebGLRenderTarget(pw, ph, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
      depthTexture: depthTex,
    });

    this._quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Blit shader: exposure, saturation, split-tone, palette reduction, outline
    const blitMat = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uColor:          { value: this._pixelTarget.texture },
        uDepth:          { value: depthTex },
        uResolution:     { value: new THREE.Vector2(pw, ph) },
        uPaletteLevels:  { value: CONFIG.PIXEL_ART_PALETTE_LEVELS },
        uOutlinePx:      { value: CONFIG.PIXEL_ART_OUTLINE_PX },
        uExposure:       { value: CONFIG.PIXEL_ART_EXPOSURE },
        uSaturation:     { value: CONFIG.PIXEL_ART_SATURATION },
        uHighlightTint:  { value: new THREE.Vector3(...CONFIG.PIXEL_ART_HIGHLIGHT_TINT) },
        uShadowTint:     { value: new THREE.Vector3(...CONFIG.PIXEL_ART_SHADOW_TINT) },
        uTintStrength:   { value: CONFIG.PIXEL_ART_TINT_STRENGTH },
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D uColor;
        uniform sampler2D uDepth;
        uniform vec2      uResolution;
        uniform float     uPaletteLevels;
        uniform float     uOutlinePx;
        uniform float     uExposure;
        uniform float     uSaturation;
        uniform vec3      uHighlightTint;
        uniform vec3      uShadowTint;
        uniform float     uTintStrength;
        varying vec2 vUv;

        void main() {
          vec3 col = texture2D(uColor, vUv).rgb;

          // ── Exposure ───────────────────────────────────────────
          col *= uExposure;

          // ── Saturation ─────────────────────────────────────────
          float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(vec3(luma), col, uSaturation);

          // ── Split-tone: warm highlights / cool shadows ─────────
          float brightness = clamp(luma, 0.0, 1.0);
          vec3 tint = mix(uShadowTint, uHighlightTint, brightness);
          col = mix(col, col * tint, uTintStrength);

          // ── Palette reduction ──────────────────────────────────
          if (uPaletteLevels > 1.0) {
            col = floor(col * uPaletteLevels) / (uPaletteLevels - 1.0);
          }

          // ── Depth-based outline ────────────────────────────────
          if (uOutlinePx > 0.0) {
            vec2 texel = uOutlinePx / uResolution;
            float dN = texture2D(uDepth, vUv + vec2( 0.0,  texel.y)).r;
            float dS = texture2D(uDepth, vUv + vec2( 0.0, -texel.y)).r;
            float dE = texture2D(uDepth, vUv + vec2( texel.x,  0.0)).r;
            float dW = texture2D(uDepth, vUv + vec2(-texel.x,  0.0)).r;
            float diff = abs(dN - dS) + abs(dE - dW);
            float edge = step(0.002, diff);
            col = mix(col, vec3(0.0), edge * 0.85);
          }

          gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
        }
      `,
    });
    // Texture filters already set on the render target, but set on the
    // sampler too so the shader sees nearest-neighbor sampling.
    blitMat.uniforms.uColor.value.minFilter = THREE.NearestFilter;
    blitMat.uniforms.uColor.value.magFilter = THREE.NearestFilter;

    this._quadScene = new THREE.Scene();
    this._quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blitMat));
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

  setPixelArt(enabled) {
    CONFIG.PIXEL_ART_ENABLED = enabled;
    if (enabled) {
      this._buildPixelTarget();
    } else if (this._pixelTarget) {
      this._pixelTarget.dispose();
      this._pixelTarget = null;
      this._quadScene   = null;
      this._quadCamera  = null;
      // Restore renderer state that pixel art pass changes
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.setRenderTarget(null);
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
    if (CONFIG.PIXEL_ART_ENABLED) {
      // Pass 1: render scene into linear render target (no gamma encode yet)
      this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      this.renderer.setRenderTarget(this._pixelTarget);
      this.renderer.render(this.scene, this.camera);

      // Pass 2: blit to screen — gamma encode happens exactly once here
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.setRenderTarget(null);
      this.renderer.render(this._quadScene, this._quadCamera);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
