// src/entities/Player.js
// Knight player: states RUNNING / JUMPING / ROLLING / HURT / JETPACK
// Uses placeholder geometry from AssetRegistry.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { getAsset, getAnimationClip } from '../core/AssetRegistry.js';

export const PlayerState = {
  RUNNING: 'RUNNING',
  JUMPING: 'JUMPING',
  ROLLING: 'ROLLING',
  HURT:    'HURT',
  JETPACK: 'JETPACK',
};

const LANE_X = [
  -CONFIG.LANE_SPACING,
  0,
  CONFIG.LANE_SPACING,
];

export class Player {
  constructor(scene) {
    this._scene = scene;

    // State
    this.state       = PlayerState.RUNNING;
    this.lane        = CONFIG.PLAYER_START_LANE;
    this.targetLane  = CONFIG.PLAYER_START_LANE;
    this.hp          = CONFIG.MAX_HP;
    this.coins       = 0;
    this.xp          = 0;
    this.alive       = true;

    // Physics helpers
    this._jumpVy      = 0;   // vertical velocity (m/s) during jump
    this._jumpT       = 0;   // kept for jetpack state only
    this._rollT       = 0;
    this._hurtT       = 0;
    this._laneT       = 0;
    this._laneSrcX    = LANE_X[this.lane];
    this._laneDstX    = LANE_X[this.lane];
    this._groundY     = 0;   // current floor height (0 = ground, >0 = carriage top)

    // Active power-ups
    this.activePowerups = [];

    // AABB
    this.bbox = new THREE.Box3();

    // Build mesh
    this.group = getAsset('player/knight');
    this.group.position.set(LANE_X[this.lane], 0, 0);
    this.group.rotation.y = Math.PI;
    this._scene.add(this.group);

    // Running bob animation helper
    this._bobT = 0;
    // Invincibility flash
    this._invincT = 0;
    // Original scale for roll
    this._baseScaleY = 1;

    // Particle trail for jetpack
    this._jetTrail = null;

    // Forward tilt during jetpack (radians)
    this._jetTilt      = 0;
    this._jetTiltDir   = 0; // +1 tilting in, -1 tilting out, 0 idle

    // Animation mixer — drives skeletal clips loaded from separate GLBs
    this._mixer        = new THREE.AnimationMixer(this.group);
    this._activeAction  = null;
    this._prevState     = null;
    this._prevSprinting = false;
    this._playClip('run'); // start with run so it plays immediately if GLB is ready
  }

  // ── Public API ──────────────────────────────────────────────

  jump() {
    if (this.state === PlayerState.JETPACK) return;
    if (this.state === PlayerState.ROLLING) {
      // Cancel roll — resume running without jumping
      this._rollT = 0;
      this.group.scale.y = 1;
      this.state = PlayerState.RUNNING;
      return;
    }
    if (this.state === PlayerState.RUNNING) {
      const maxObs = Math.max(...Object.values(CONFIG.OBSTACLE_HEIGHT));
      const h = maxObs * CONFIG.JUMP_HEIGHT_FACTOR;
      this._jumpVy = Math.sqrt(2 * CONFIG.GRAVITY * h);
      this.state   = PlayerState.JUMPING;
    }
  }

  setGroundY(y) {
    this._groundY = y;
  }

  roll() {
    if (this.state === PlayerState.JUMPING) {
      // Fast-land: slam downward so landing is quick but visibly animated
      this._jumpVy = -Math.sqrt(2 * CONFIG.GRAVITY * Math.max(this.group.position.y - this._groundY, 0.1)) * 1.8;
      return;
    }
    if (this.state === PlayerState.RUNNING) {
      this.state  = PlayerState.ROLLING;
      this._rollT = 0;
      this.group.scale.y = 0.5;
    }
  }

  moveLeft() {
    if (this.targetLane > 0) {
      this._startLaneSwitch(this.targetLane - 1);
    }
  }

  moveRight() {
    if (this.targetLane < CONFIG.LANE_COUNT - 1) {
      this._startLaneSwitch(this.targetLane + 1);
    }
  }

  hit() {
    if (this._invincT > 0) return; // still invincible
    this.hp = Math.max(0, this.hp - CONFIG.HP_LOST_PER_HIT);
    this._invincT = CONFIG.INVINCIBILITY_FRAMES;
    this.state = PlayerState.HURT;
    this._hurtT = 0;
    if (this.hp <= 0) this.alive = false;
  }

  activatePowerup(powerup) {
    // Remove existing same-type buff and restart
    this.activePowerups = this.activePowerups.filter(p => {
      if (p.type === powerup.type) { p.onExpire(this); return false; }
      return true;
    });
    powerup.onActivate(this);
    this.activePowerups.push(powerup);
  }

  activateJetpack() {
    this.state       = PlayerState.JETPACK;
    this._jumpT      = 0;
    this._jetTiltDir = 1;
  }

  deactivateJetpack() {
    if (this.state === PlayerState.JETPACK) {
      this.state       = PlayerState.RUNNING;
      this._jetTiltDir = -1;
    }
  }

  // ── Animation helpers ────────────────────────────────────────

  /**
   * Switch to a named clip loaded from its own GLB file.
   * If the file hasn't been placed yet the call is a no-op (placeholder stays).
   * once=true plays the clip once then freezes on the last frame.
   */
  _playClip(name, { once = false, fadeIn = 0.15 } = {}) {
    const clip = getAnimationClip(name);
    if (!clip) return;

    const next = this._mixer.clipAction(clip);
    next.loop              = once ? THREE.LoopOnce : THREE.LoopRepeat;
    next.clampWhenFinished = once;

    if (this._activeAction && this._activeAction !== next) {
      this._activeAction.fadeOut(fadeIn);
      next.reset().fadeIn(fadeIn).play();
    } else if (!this._activeAction) {
      next.play();
    }
    this._activeAction = next;
  }

  // ── Update ──────────────────────────────────────────────────

  update(dt, game) {
    this._updateLaneSlide(dt);
    this._updateState(dt);
    this._updateJetTilt(dt);
    this._updateAnimation(dt);
    this._updatePowerups(dt, game);
    this._updateInvincibility(dt);
    this._updateBBox();
  }

  _updateJetTilt(dt) {
    if (this._jetTiltDir === 0) return;
    const MAX  = 74 * Math.PI / 180;
    const RATE = MAX / CONFIG.JETPACK_TRANSITION_DURATION; // reach 84° in transition window
    this._jetTilt += this._jetTiltDir * RATE * dt;
    if (this._jetTilt >= MAX) { this._jetTilt = MAX; if (this._jetTiltDir > 0) this._jetTiltDir = 0; }
    if (this._jetTilt <= 0)   { this._jetTilt = 0;   this._jetTiltDir = 0; }
    this.group.rotation.x = -this._jetTilt;
  }

  _updateAnimation(dt) {
    const sprinting = this.hasPowerup('sprint');

    if (this.state !== this._prevState || sprinting !== this._prevSprinting) {
      switch (this.state) {
        case PlayerState.RUNNING: this._playClip(sprinting ? 'sprint' : 'run'); break;
        case PlayerState.JUMPING: this._playClip('jump_up');                    break;
        case PlayerState.ROLLING: this._playClip('roll');                       break;
        case PlayerState.HURT:    this._playClip('hurt', { once: true });       break;
        case PlayerState.JETPACK: this._playClip('jetpack_hover');              break;
      }
      this._prevState     = this.state;
      this._prevSprinting = sprinting;
    }
    this._mixer.update(dt);
  }

  _startLaneSwitch(newLane) {
    this.lane     = this.targetLane;
    this.targetLane = newLane;
    this._laneSrcX = this.group.position.x;
    this._laneDstX = LANE_X[newLane];
    this._laneT   = 0;
  }

  _updateLaneSlide(dt) {
    if (this._laneT >= 1) return;
    this._laneT = Math.min(1, this._laneT + dt / CONFIG.LANE_SWITCH_DURATION);
    // Ease in-out
    const t = this._laneT < 0.5
      ? 2 * this._laneT * this._laneT
      : -1 + (4 - 2 * this._laneT) * this._laneT;
    this.group.position.x = this._laneSrcX + (this._laneDstX - this._laneSrcX) * t;
    if (this._laneT >= 1) {
      this.lane = this.targetLane;
      this.group.position.x = this._laneDstX;
    }
  }

  _updateState(dt) {
    const maxObs = Math.max(...Object.values(CONFIG.OBSTACLE_HEIGHT));

    switch (this.state) {
      case PlayerState.RUNNING: {
        const bobRate = 8 * (CONFIG.START_SPEED / 10);
        this._bobT += dt * bobRate;
        this.group.position.y = this._groundY + Math.abs(Math.sin(this._bobT)) * 0.08;
        this.group.scale.y = 1;
        break;
      }

      case PlayerState.JUMPING: {
        this._jumpVy -= CONFIG.GRAVITY * dt;
        this.group.position.y = Math.max(this._groundY, this.group.position.y + this._jumpVy * dt);
        this.group.scale.y = 1;
        if (this.group.position.y <= this._groundY && this._jumpVy < 0) {
          this.group.position.y = this._groundY;
          this._jumpVy = 0;
          this.state   = PlayerState.RUNNING;
        }
        break;
      }

      case PlayerState.ROLLING: {
        this._rollT += dt / CONFIG.ROLL_DURATION;
        this.group.scale.y = 0.5;
        if (this._rollT >= 1) {
          this.group.scale.y = 1;
          this.state = PlayerState.RUNNING;
        }
        break;
      }

      case PlayerState.HURT: {
        this._hurtT += dt;
        this.group.position.y = this._groundY + Math.sin(this._hurtT * 20) * 0.1 * (1 - this._hurtT / 0.4);
        if (this._hurtT >= 0.4) {
          this.group.position.y = this._groundY;
          this.state = PlayerState.RUNNING;
        }
        break;
      }

      case PlayerState.JETPACK: {
        // Vertical hover — altitude is handled by SceneManager camera
        this._bobT += dt * 4;
        this.group.position.y = 4.5 + Math.sin(this._bobT) * 0.15;
        break;
      }
    }
  }

  _updatePowerups(dt, game) {
    this.activePowerups = this.activePowerups.filter(p => {
      p.timer -= dt;
      // Debug: log timer every ~1s to verify duration
      if (Math.floor((p.timer + dt) * 2) !== Math.floor(p.timer * 2)) {
        // console.log(`[Powerup] ${p.type} timer: ${p.timer.toFixed(2)}s / ${p.duration}s  (dt=${dt.toFixed(4)})`);
      }
      if (p.timer <= 0) {
        p.onExpire(this, game);
        return false;
      }
      return true;
    });
  }

  _updateInvincibility(dt) {
    if (this._invincT <= 0) {
      this.group.traverse(c => { if (c.isMesh) c.visible = true; });
      return;
    }
    this._invincT -= dt;
    // Flash effect — blink every 0.1s
    const visible = Math.floor(this._invincT / 0.1) % 2 === 0;
    this.group.traverse(c => { if (c.isMesh) c.visible = visible; });
  }

  _updateBBox() {
    const h = this.state === PlayerState.ROLLING
      ? CONFIG.PLAYER_HEIGHT * 0.5
      : CONFIG.PLAYER_HEIGHT;
    const hw = CONFIG.PLAYER_WIDTH / 2;
    const wp = this.group.position;
    this.bbox.min.set(wp.x - hw, wp.y,     wp.z - hw);
    this.bbox.max.set(wp.x + hw, wp.y + h, wp.z + hw);
  }

  hasPowerup(type) {
    return this.activePowerups.some(p => p.type === type);
  }

  get speedMultiplier() {
    if (this.hasPowerup('sprint')) return CONFIG.SPRINT_MULTIPLIER;
    return 1;
  }

  reset() {
    this.state      = PlayerState.RUNNING;
    this.lane       = CONFIG.PLAYER_START_LANE;
    this.targetLane = CONFIG.PLAYER_START_LANE;
    this.hp         = CONFIG.MAX_HP;
    this.coins      = 0;
    this.xp         = 0;
    this.alive      = true;
    this._invincT   = 0;
    this._laneT     = 1;
    this._bobT      = 0;
    this._groundY      = 0;
    this._prevState     = null;
    this._prevSprinting = false;
    this._activeAction  = null;
    this._jetTilt      = 0;
    this._jetTiltDir   = 0;
    this.group.rotation.set(0, Math.PI, 0);
    this._mixer.stopAllAction();
    this._playClip('run');
    this.activePowerups = [];
    this.group.position.set(LANE_X[CONFIG.PLAYER_START_LANE], 0, 0);
    this.group.rotation.y = Math.PI;
    this.group.scale.set(1, 1, 1);
  }

  destroy() {
    this._scene.remove(this.group);
  }
}
