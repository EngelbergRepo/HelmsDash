// src/core/ShaderManager.js
// Loads GLSL shaders and creates ShaderMaterials for coins, fog, buff glow, jetpack trail

import * as THREE from 'three';
import { BEND_UNIFORMS } from './worldBend.js';
import { CONFIG } from '../config.js';

// Inline GLSL strings — allows Vite to bundle without raw plugin
const SHADERS = {
  coin: {
    vert: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying float vWorldZ;
      uniform float uTime;
      uniform float uCurveStrength;
      uniform float uTurnBend;
      void main() {
        vUv = uv; vNormal = normalize(normalMatrix * normal);
        float angle = uTime * 2.5;
        float cosA = cos(angle); float sinA = sin(angle);
        vec3 pos = position;
        float x = cosA*pos.x - sinA*pos.z;
        float z = sinA*pos.x + cosA*pos.z;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(x, pos.y, z, 1.0);
        vec4 _wPos = modelMatrix * vec4(x, pos.y, z, 1.0);
        vWorldZ = _wPos.z;
        gl_Position.y -= uCurveStrength * _wPos.z * _wPos.z * gl_Position.w;
        gl_Position.x += uTurnBend      * _wPos.z * _wPos.z * gl_Position.w;
      }`,
    frag: `
      varying vec2 vUv; varying vec3 vNormal;
      varying float vWorldZ;
      uniform float uTime;
      uniform float uCoinFadeNear;
      uniform float uCoinFadeFar;
      void main() {
        vec3 goldBase = vec3(1.0,0.82,0.1); vec3 goldShine = vec3(1.0,0.98,0.6);
        float rim = abs(dot(vNormal, vec3(0.0,0.0,1.0)));
        float shimmer = 0.5 + 0.5*sin(uTime*4.0 + vUv.x*10.0);
        vec3 col = mix(goldBase, goldShine, rim*0.6 + shimmer*0.2);
        float em = 0.25 + 0.15*shimmer;
        float dist = -vWorldZ; // positive = distance ahead of player
        float alpha = 1.0 - smoothstep(uCoinFadeNear, uCoinFadeFar, dist);
        gl_FragColor = vec4(col + col*em, alpha);
      }`,
  },
  groundFog: {
    vert: `
      varying vec3 vWorldPos; varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position,1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    frag: `
      varying vec3 vWorldPos; varying vec2 vUv;
      uniform float uTime;
      void main() {
        float fogH = clamp(1.0 - vWorldPos.y/1.2, 0.0, 1.0);
        float swirl = sin(vWorldPos.x*0.5 + uTime*0.4)*sin(vWorldPos.z*0.3 + uTime*0.25)*0.5+0.5;
        float dens = fogH * swirl * 0.22;
        gl_FragColor = vec4(0.78,0.71,0.60, dens);
      }`,
  },
  buffGlow: {
    vert: `
      varying vec3 vNormal;
      uniform float uTime; uniform float uIntensity;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        float pulse = 1.0 + sin(uTime*6.0)*0.04*uIntensity;
        vec3 pos = position + normal*0.04*uIntensity;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos*pulse, 1.0);
      }`,
    frag: `
      varying vec3 vNormal;
      uniform float uTime; uniform vec3 uColor; uniform float uIntensity;
      void main() {
        float rim = 1.0 - abs(dot(vNormal, vec3(0.0,0.0,1.0)));
        float pulse = 0.7 + 0.3*sin(uTime*6.0);
        float alpha = rim*rim*pulse*uIntensity;
        gl_FragColor = vec4(uColor, alpha);
      }`,
  },
  jetpackTrail: {
    vert: `
      attribute float aSize; attribute float aAlpha;
      varying float vAlpha;
      void main() {
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = aSize*(300.0/-mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    frag: `
      varying float vAlpha;
      void main() {
        vec2 c = gl_PointCoord - vec2(0.5);
        float d = length(c);
        if(d > 0.5) discard;
        float alpha = (1.0 - d*2.0)*vAlpha;
        vec3 col = mix(vec3(1.0,0.5,0.1), vec3(1.0,0.9,0.3), 1.0-d*2.0);
        gl_FragColor = vec4(col, alpha);
      }`,
  },
};

export class ShaderManager {
  constructor() {
    this.uTime = { value: 0 };
    this._materials = {};
  }

  get coinMaterial() {
    if (!this._materials.coin) {
      this._materials.coin = new THREE.ShaderMaterial({
        vertexShader: SHADERS.coin.vert,
        fragmentShader: SHADERS.coin.frag,
        uniforms: {
          uTime:         this.uTime,
          uCoinFadeNear: { value: CONFIG.COIN_FADE_NEAR },
          uCoinFadeFar:  { value: CONFIG.COIN_FADE_FAR  },
          ...BEND_UNIFORMS,
        },
        transparent: true,
        depthWrite: false,
      });
    }
    return this._materials.coin;
  }

  get groundFogMaterial() {
    if (!this._materials.groundFog) {
      this._materials.groundFog = new THREE.ShaderMaterial({
        vertexShader: SHADERS.groundFog.vert,
        fragmentShader: SHADERS.groundFog.frag,
        uniforms: { uTime: this.uTime },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    }
    return this._materials.groundFog;
  }

  getBuffGlowMaterial(color = new THREE.Color(0xffd700)) {
    return new THREE.ShaderMaterial({
      vertexShader: SHADERS.buffGlow.vert,
      fragmentShader: SHADERS.buffGlow.frag,
      uniforms: {
        uTime:      this.uTime,
        uColor:     { value: color },
        uIntensity: { value: 1.0 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide, // renders behind the main mesh for outline effect
    });
  }

  createJetpackTrail(scene, playerGroup) {
    const COUNT = 15;
    const positions = new Float32Array(COUNT * 3);
    const sizes     = new Float32Array(COUNT);
    const alphas    = new Float32Array(COUNT);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize',    new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aAlpha',   new THREE.BufferAttribute(alphas, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader:   SHADERS.jetpackTrail.vert,
      fragmentShader: SHADERS.jetpackTrail.frag,
      uniforms: { uTime: this.uTime },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(geo, mat);
    scene.add(particles);

    // Particle state
    const life    = new Float32Array(COUNT).fill(0);
    const maxLife = new Float32Array(COUNT).map(() => 0.4 + Math.random() * 0.3);
    const vel     = [];
    for (let i = 0; i < COUNT; i++) vel.push(new THREE.Vector3());

    return {
      particles,
      update(dt) {
        const pp = playerGroup.position;
        for (let i = 0; i < COUNT; i++) {
          life[i] -= dt;
          if (life[i] <= 0) {
            // Respawn near player exhaust
            life[i] = maxLife[i];
            positions[i*3]   = pp.x + (Math.random()-0.5)*0.3;
            positions[i*3+1] = pp.y + 0.1;
            positions[i*3+2] = pp.z;
            vel[i].set((Math.random()-0.5)*0.5, -(0.5+Math.random()*1.5), (Math.random()-0.5)*0.5);
          }
          positions[i*3]   += vel[i].x * dt;
          positions[i*3+1] += vel[i].y * dt;
          positions[i*3+2] += vel[i].z * dt;
          const t = life[i] / maxLife[i];
          sizes[i]  = (0.3 + t*0.5) * 8;
          alphas[i] = t * 0.8;
        }
        geo.attributes.position.needsUpdate = true;
        geo.attributes.aSize.needsUpdate    = true;
        geo.attributes.aAlpha.needsUpdate   = true;
      },
      destroy() { scene.remove(particles); geo.dispose(); mat.dispose(); },
    };
  }

  /** Add a buff glow clone mesh to the player group */
  addBuffGlow(playerGroup, color) {
    const glowMat = this.getBuffGlowMaterial(new THREE.Color(color));
    const meshes = [];
    // Collect targets first to avoid traversing newly added glow children
    const targets = [];
    playerGroup.traverse(child => {
      if (child.isMesh && !child.userData.isGlow) targets.push(child);
    });
    for (const child of targets) {
      const glow = new THREE.Mesh(child.geometry, glowMat);
      glow.scale.setScalar(1.05);
      glow.userData.isGlow = true;
      child.add(glow);
      meshes.push(glow);
    }
    return meshes;
  }

  removeBuffGlow(playerGroup) {
    playerGroup.traverse(child => {
      if (!child.isMesh) return;
      const glows = child.children.filter(c => c.userData.isGlow);
      glows.forEach(g => child.remove(g));
    });
  }

  /** Called every frame — update time uniform */
  update(dt) {
    this.uTime.value += dt;
  }

  /** Apply coin shader to all coin meshes in a group */
  applyCoinShader(object3d) {
    object3d.traverse(c => {
      if (c.isMesh && c.parent?.userData?.role === 'coin') {
        c.material = this.coinMaterial;
      }
    });
  }
}
