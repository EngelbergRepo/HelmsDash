// src/core/worldBend.js
// Spherical ground curvature + lateral track bend, applied to all geometry via:
//   • MeshStandardMaterial / MeshPhongMaterial — onBeforeCompile injection
//   • ShaderMaterial (coins) — BEND_UNIFORMS shared directly into the material uniforms
//
// All bend values live in BEND_UNIFORMS so every consumer stays in sync automatically.

import { CONFIG } from '../config.js';

// Single source of truth — share these objects into every material's uniforms block.
export const BEND_UNIFORMS = {
  uCurveStrength: { value: CONFIG.WORLD_CURVE_STRENGTH },
  uTurnBend:      { value: 0 },
};

/** Called every frame by Game.js to drive the lateral turn bend. */
export function setTurnBend(v) {
  BEND_UNIFORMS.uTurnBend.value = v;
}

export function getTurnBend() { return BEND_UNIFORMS.uTurnBend.value; }

export function applyWorldBend(material) {
  if (!material) return;
  if (!material.isMeshStandardMaterial && !material.isMeshPhongMaterial) return;
  if (material.userData._worldBendApplied) return;
  material.userData._worldBendApplied = true;

  material.onBeforeCompile = shader => {
    // Share the same uniform objects so setTurnBend() updates them automatically.
    shader.uniforms.uCurveStrength = BEND_UNIFORMS.uCurveStrength;
    shader.uniforms.uTurnBend      = BEND_UNIFORMS.uTurnBend;

    shader.vertexShader = 'uniform float uCurveStrength;\nuniform float uTurnBend;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vec4 _wPos = modelMatrix * vec4(transformed, 1.0);
      gl_Position.y -= uCurveStrength * _wPos.z * _wPos.z * gl_Position.w;
      gl_Position.x += uTurnBend      * _wPos.z * _wPos.z * gl_Position.w;`
    );
  };
  material.needsUpdate = true;
}
