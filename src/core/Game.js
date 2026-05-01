// src/core/Game.js
// Central state machine: MENU → PLAYING → PAUSED → GAMEOVER

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { SceneManager }    from '../scene/SceneManager.js';
import { TrackGenerator, setCoinMaterial } from '../scene/TrackGenerator.js';
import { Environment }     from '../scene/Environment.js';
import { Player, PlayerState } from '../entities/Player.js';
import { InputManager }    from './InputManager.js';
import { AudioManager }    from './AudioManager.js';
import { ShaderManager }   from './ShaderManager.js';
import { SaveManager }     from './SaveManager.js';
import { StepPlayer }     from './StepPlayer.js';
import { SfxPool }        from './SfxPool.js';
import { initAssetRegistry } from './AssetRegistry.js';
import { setTurnBend } from './worldBend.js';
import { HUD }      from '../ui/HUD.js';
import { PauseMenu } from '../ui/PauseMenu.js';
import { GameOver }  from '../ui/GameOver.js';

import { SprintShoes } from '../powerups/SprintShoes.js';
import { Magnet }      from '../powerups/Magnet.js';
import { CoinDoubler } from '../powerups/CoinDoubler.js';
import { Jetpack, resetJetpackCounter } from '../powerups/Jetpack.js';

const GameState = { MENU: 'MENU', PLAYING: 'PLAYING', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER' };

const POWERUP_FACTORIES = {
  sprint_shoes: () => new SprintShoes(),
  magnet:       () => new Magnet(),
  doubler:      () => new CoinDoubler(),
  jetpack:      () => new Jetpack(),
};

const POWERUP_COLORS = {
  sprint_shoes: '#44ddff',
  magnet:       '#ff4444',
  doubler:      '#ffdd00',
  jetpack:      '#ff8800',
};

export class Game {
  constructor(canvasEl) {
    this._canvas = canvasEl;
    this._state  = GameState.MENU;

    // Core systems
    this._renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: false });
    this._renderer.setSize(window.innerWidth, window.innerHeight);

    this.sceneManager  = new SceneManager(this._renderer);
    this.audioManager  = new AudioManager();
    this._inputManager = new InputManager();
    this._shaderMgr    = new ShaderManager();

    // Game state
    this._speed       = CONFIG.START_SPEED;
    this._elapsed     = 0;
    this._playerName  = '';
    this._nextPowerupIn = this._randomPowerupInterval();
    this._jetTrail    = null;
    this._buffGlows   = [];

    // These are created per-session
    this._trackGen    = null;
    this._environment = null;
    this._player      = null;
    this._hud         = null;
    this._pauseMenu   = null;
    this._gameOver    = null;
    this._stepPlayer  = new StepPlayer(this.audioManager);
    this._coinSfx     = new SfxPool(this.audioManager);
    this._hitSfx      = new SfxPool(this.audioManager);
    this._powerupSfx  = new SfxPool(this.audioManager);

    // RAF id
    this._rafId = null;
    this._lastTime = 0;

    // Turn bend state machine
    this._turnPhase  = 'waiting'; // 'waiting' | 'in' | 'hold' | 'out'
    this._turnTimer  = CONFIG.TURN_FREQUENCY;
    this._turnDir    = 1;         // +1 = right, -1 = left
    this._turnBend   = 0;         // current bend value driven toward target

    // Window resize handled by SceneManager
    window.addEventListener('resize', () => {});
  }

  async init(onProgress) {
    await initAssetRegistry(onProgress);
    await this.audioManager.init();

    // Pre-create UI elements
    this._gameOver = new GameOver(
      () => this._startSession(this._playerName),
      () => this._showMenu()
    );

    // Wire input
    this._inputManager.on('pause', () => this.togglePause());
    this._inputManager.on('mute',  () => this.audioManager.toggleMute());

    // Start game loop
    this._rafId = requestAnimationFrame(t => this._loop(t));
  }

  // ── Session lifecycle ──────────────────────────────────────

  async startFromMenu(playerName) {
    this._playerName = playerName;
    const veil = this._showVeil();
    await this._startSession(playerName);
    this._hideVeil(veil);
  }

  _showVeil() {
    const el = document.createElement('div');
    el.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:100',
      'background:#000', 'opacity:0',
      'transition:opacity 0.25s ease',
      'pointer-events:all',
    ].join(';');
    document.getElementById('app').appendChild(el);
    // Trigger reflow so the transition fires
    el.getBoundingClientRect();
    el.style.opacity = '1';
    return el;
  }

  _hideVeil(el) {
    el.style.pointerEvents = 'none'; // stop blocking clicks immediately
    el.style.transition = 'opacity 0.4s ease';
    el.style.opacity = '0';
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  }

  async _startSession(playerName) {
    this._playerName = playerName;
    this._cleanupSession();

    // Build scene objects
    this._trackGen   = new TrackGenerator(this.sceneManager.scene);
    this._environment = new Environment(this.sceneManager.scene);
    this._player     = new Player(this.sceneManager.scene);
    this._hud        = new HUD(this);
    this._pauseMenu  = new PauseMenu(
      () => this.togglePause(),
      () => this._showMenu()
    );
    this._pauseMenu.hide();

    // Inject coin shader before init so the initial chunks use it
    setCoinMaterial(this._shaderMgr.coinMaterial);

    await this._trackGen.init();
    this._environment.init();

    this._speed          = CONFIG.START_SPEED;
    this._elapsed        = 0;
    this._nextPowerupIn  = this._randomPowerupInterval();
    this._coinMilestone  = CONFIG.ACHIEVEMENT_THRESHOLD;
    resetJetpackCounter();

    // Reset turn bend
    this._turnPhase = 'waiting';
    this._turnTimer = CONFIG.TURN_FREQUENCY;
    this._turnBend  = 0;
    setTurnBend(0);

    // Wire player input
    // Lane-switch is blocked when a carriage body occupies the target lane at player's Z
    // (only enforced while on the ground — on top of a carriage the player can jump off freely)
    this._inputManager.on('moveLeft', this._boundLeft = () => {
      const p = this._player;
      if (!p) return;
      if (p._groundY < 0.5 && p.state !== PlayerState.JETPACK &&
          this._trackGen?.isCarriageBlockingLane(p.targetLane - 1, p.group.position.z)) return;
      p.moveLeft();
      this.audioManager.play('swish_left', '/assets/music/steps/swish_left.mp3', { volume: CONFIG.SWISH_VOLUME });
    });
    this._inputManager.on('moveRight', this._boundRight = () => {
      const p = this._player;
      if (!p) return;
      if (p._groundY < 0.5 && p.state !== PlayerState.JETPACK &&
          this._trackGen?.isCarriageBlockingLane(p.targetLane + 1, p.group.position.z)) return;
      p.moveRight();
      this.audioManager.play('swish_right', '/assets/music/steps/swish_right.mp3', { volume: CONFIG.SWISH_VOLUME });
    });
    this._inputManager.on('jump', this._boundJump = () => {
      const p = this._player;
      if (!p) return;
      if (p.state === PlayerState.ROLLING || p.state === PlayerState.JETPACK) return;
      p.jump();
      this.audioManager.play('swish_jump', '/assets/music/steps/swish_jump.mp3', { volume: CONFIG.SWISH_VOLUME });
    });
    this._inputManager.on('roll', this._boundRoll = () => {
      const p = this._player;
      if (!p) return;
      if (p.state === PlayerState.JUMPING || p.state === PlayerState.JETPACK) return;
      p.roll();
      this.audioManager.play('swish_roll', '/assets/music/steps/swish_roll.mp3', { volume: CONFIG.SWISH_VOLUME });
    });

    this.playGameplayMusic();

    // Footsteps — seeded per session so each game has a different shuffle
    this._stepPlayer.init({
      srcs: Array.from({ length: 10 }, (_, i) =>
        `/assets/music/steps/step${i + 1}.mp3`
      ),
      volume:   CONFIG.STEPS_VOLUME,
      interval: CONFIG.STEPS_INTERVAL,
      seed:     (Math.random() * 0xffffffff) >>> 0,
    });

    this._coinSfx.init({
      srcs:      Array.from({ length: 10 }, (_, i) => `/assets/music/coins/coin${i + 1}.mp3`),
      volume:    CONFIG.COINS_VOLUME,
      keyPrefix: 'coin_sfx',
    });

    this._hitSfx.init({
      srcs:      [1, 2, 3].map(n => `/assets/music/steps/hit_${n}.mp3`),
      volume:    CONFIG.HIT_VOLUME,
      keyPrefix: 'hit_sfx',
    });

    this._powerupSfx.init({
      srcs:      [1, 2, 3].map(n => `/assets/music/steps/powerup${n}.mp3`),
      volume:    CONFIG.POWERUP_SFX_VOLUME,
      keyPrefix: 'powerup_sfx',
    });

    this._state = GameState.PLAYING;
  }

  _cleanupSession() {
    // Remove input listeners
    if (this._boundLeft)  { this._inputManager.off('moveLeft', this._boundLeft); }
    if (this._boundRight) { this._inputManager.off('moveRight', this._boundRight); }
    if (this._boundJump)  { this._inputManager.off('jump', this._boundJump); }
    if (this._boundRoll)  { this._inputManager.off('roll', this._boundRoll); }

    if (this._jetTrail)   { this._jetTrail.destroy(); this._jetTrail = null; }
    this._stepPlayer?.destroy();
    this._coinSfx?.destroy();
    this._hitSfx?.destroy();
    this._powerupSfx?.destroy();

    this._trackGen?.reset();
    this._environment?.reset?.();

    // Remove scene objects
    if (this._player)  { this._player.destroy(); this._player = null; }
    if (this._hud)     { this._hud.destroy(); this._hud = null; }
    if (this._pauseMenu) { this._pauseMenu.destroy(); this._pauseMenu = null; }
  }

  _showMenu() {
    this._cleanupSession();
    this._state = GameState.MENU;
    // HomePage re-spawns itself via main.js — we emit a custom event
    window.dispatchEvent(new CustomEvent('helmsdash:showMenu'));
  }

  // ── Pause ──────────────────────────────────────────────────

  togglePause() {
    if (this._state === GameState.PLAYING) {
      this._state = GameState.PAUSED;
      this._pauseMenu?.show();
      this.audioManager.setPaused(true);
    } else if (this._state === GameState.PAUSED) {
      this._state = GameState.PLAYING;
      this._pauseMenu?.hide();
      this.audioManager.setPaused(false);
    }
  }

  // ── Game Over ──────────────────────────────────────────────

  _triggerGameOver() {
    this._state = GameState.GAMEOVER;
    const xp    = this._player?.xp   || 0;
    const coins = this._player?.coins || 0;
    const isNew = SaveManager.setHighScore(Math.floor(xp));
    SaveManager.addCoins(coins);

    this.audioManager.play('gameover', '/assets/music/steps/gameover.mp3', { volume: CONFIG.GAMEOVER_VOLUME });
    this.playHomeMusic();
    this.sceneManager.flash('#ff0000', 400);
    this.sceneManager.shake(1.0);

    setTimeout(() => {
      this._gameOver.show({
        xp,
        coins,
        playerName:      this._playerName,
        isNewHighScore:  isNew,
      });
    }, 600);
  }

  // ── Main Loop ──────────────────────────────────────────────

  _loop(timestamp) {
    this._rafId = requestAnimationFrame(t => this._loop(t));

    const dt = Math.min((timestamp - this._lastTime) / 1000, 0.05); // cap at 50ms
    this._lastTime = timestamp;

    if (this._state === GameState.PLAYING) {
      this._update(dt);
    }

    this._shaderMgr.update(dt);
    this.sceneManager.render(dt);
  }

  _update(dt) {
    const player = this._player;
    if (!player) return;

    // Speed ramp
    this._speed = Math.min(
      CONFIG.MAX_SPEED,
      this._speed + CONFIG.SPEED_RAMP * dt
    );
    const effectiveSpeed = this._speed * player.speedMultiplier;

    // Elapsed & XP
    this._elapsed += dt;
    player.xp     += CONFIG.XP_PER_SECOND * dt;

    // Update systems
    player.update(dt, this);
    this._trackGen.update(dt, effectiveSpeed);
    this._environment.update(effectiveSpeed * dt);

    // Scroll jetpack coin groups and portal with the world
    const dz = effectiveSpeed * dt;
    for (const buff of player.activePowerups) {
      const coinGroup = buff._getCoinGroup?.();
      if (coinGroup) coinGroup.position.z += dz;

      const portal = buff._getPortal?.();
      if (portal && !portal.collected) {
        portal.group.position.z += dz;
        portal.update(dt);
      }
    }

    // Camera follow player X, world Z=0 (player stays at z=0, world moves)
    this._updateTurnBend(dt);
    this.sceneManager.updateCamera(player.group.position.x, 0, dt);

    // Collision detection
    this._checkCarriages();   // must run first — sets player._groundY
    this._checkObstacles();
    this._checkCoins(dt);
    this._checkPowerups();
    this._checkPortals();

    // Powerup spawning (in-track powerups placed by TrackGenerator)
    this._nextPowerupIn -= dt;
    if (this._nextPowerupIn <= 0) {
      this._nextPowerupIn = this._randomPowerupInterval();
      // Powerup items are now placed inside chunks; no extra spawning needed here
    }

    // Footsteps — active only while running/hurt; jetpack state already excluded
    const steppingState = player.state === PlayerState.RUNNING || player.state === PlayerState.HURT;
    const stepRate = (steppingState && player.hasPowerup('sprint_shoes'))
      ? CONFIG.STEPS_SPRINT_RATE : 1.0;
    this._stepPlayer.update(dt, steppingState, stepRate);

    // Jetpack trail
    if (player.state === PlayerState.JETPACK) {
      if (!this._jetTrail) {
        this._jetTrail = this._shaderMgr.createJetpackTrail(this.sceneManager.scene, player.group);
      }
      this._jetTrail.update(dt);
    } else if (this._jetTrail) {
      this._jetTrail.destroy();
      this._jetTrail = null;
    }

    // Buff glows — rebuild when powerup set changes
    this._syncBuffGlows();

    // HUD update
    this._hud?.updateHP(player.hp, CONFIG.MAX_HP);
    this._hud?.updateXP(player.xp);
    this._hud?.updateCoins(player.coins);
    this._hud?.syncBuffs(player.activePowerups);

    // Death check
    if (!player.alive) {
      this._triggerGameOver();
    }
  }

  // ── Collision Detection ────────────────────────────────────

  _checkCarriages() {
    const player = this._player;
    if (!player || !this._trackGen) return;

    const px = player.group.position.x;
    const pz = player.group.position.z; // ≈ 0 — world scrolls past
    const py = player.group.position.y;

    let newGroundY = 0;
    const tmpPos = new THREE.Vector3();
    const { ramps, platforms } = this._trackGen.getCarriagePhysics();

    for (const ramp of ramps) {
      ramp.updateWorldMatrix(true, false);
      ramp.getWorldPosition(tmpPos);
      const { halfW, halfZ, rampHeight } = ramp.userData;
      if (Math.abs(px - tmpPos.x) < halfW &&
          pz > tmpPos.z - halfZ && pz < tmpPos.z + halfZ) {
        // t = 0 at front face (player starts climbing), 1 at back face (fully on top)
        const t = (tmpPos.z + halfZ - pz) / (2 * halfZ);
        newGroundY = Math.max(newGroundY, t * rampHeight);
      }
    }

    for (const plat of platforms) {
      plat.updateWorldMatrix(true, false);
      plat.getWorldPosition(tmpPos);
      const { halfW, halfZ, platformY } = plat.userData;
      if (Math.abs(px - tmpPos.x) < halfW &&
          pz > tmpPos.z - halfZ && pz < tmpPos.z + halfZ) {
        newGroundY = Math.max(newGroundY, platformY);
      }
    }

    const prevGroundY = player._groundY;
    player.setGroundY(newGroundY);

    // Shift camera up with the player — only when not in jetpack (which manages its own altitude)
    if (player.state !== PlayerState.JETPACK) {
      this.sceneManager._cameraTargetY = CONFIG.CAMERA_HEIGHT + newGroundY;
      this.sceneManager._lookTargetY   = 1 + newGroundY;
    }

    // Ground dropped away (end of carriage) — start a fall
    if (newGroundY < prevGroundY - 0.1 &&
        player.state === PlayerState.RUNNING &&
        py > newGroundY + 0.3) {
      player._jumpVy = 0;
      player.state   = PlayerState.JUMPING;
    }
  }

  _checkObstacles() {
    const player = this._player;
    if (!player || player._invincT > 0) return;

    const obstacles = this._trackGen?.getObstacles() || [];
    const meshBox = new THREE.Box3(); // reused to avoid allocations
    let hit = false;

    let hitMesh = null;
    let hitObs  = null;

    for (const obs of obstacles) {
      if (hitMesh) break;
      // Force world-matrix update so setFromObject uses the current scrolled position,
      // not the stale matrixWorld from before this frame's chunk scroll.
      obs.updateWorldMatrix(true, true);
      const isGate = obs.userData?.obstacleType === 'gate';
      const rolling = player.state === PlayerState.ROLLING;
      obs.traverse(child => {
        if (hitMesh || !child.isMesh) return;
        meshBox.setFromObject(child);
        // Rolling player ducks under a gate — skip all gate collision
        if (isGate && rolling) return;
        if (player.bbox.intersectsBox(meshBox)) {
          hitMesh = child;
          hitObs  = obs;
        }
      });
    }

    if (hitMesh) {
      const f = arr => arr.map(v => (+v).toFixed(2)).join(', ');
      const pb = this._player.bbox;
      const meshWorldPos = new THREE.Vector3();
      hitMesh.getWorldPosition(meshWorldPos);
      console.log(
        `[HIT]`
        + `\n  obstacle type : ${hitObs.userData?.obstacleType ?? '(unknown)'}`
        + `\n  mesh name     : ${hitMesh.name || '(unnamed)'}`
        + `\n  mesh visible  : ${hitMesh.visible}  |  obs visible: ${hitObs.visible}`
        + `\n  obs  world pos: x=${hitObs.getWorldPosition(new THREE.Vector3()).x.toFixed(2)}  y=${hitObs.getWorldPosition(new THREE.Vector3()).y.toFixed(2)}  z=${hitObs.getWorldPosition(new THREE.Vector3()).z.toFixed(2)}`
        + `\n  mesh world pos: x=${meshWorldPos.x.toFixed(2)}  y=${meshWorldPos.y.toFixed(2)}  z=${meshWorldPos.z.toFixed(2)}`
        + `\n  player state  : ${this._player.state}`
        + `\n  player pos    : x=${f(this._player.group.position.toArray())}`
        + `\n  player bbox   : min(${f(pb.min.toArray())})  max(${f(pb.max.toArray())})`
        + `\n  mesh bbox     : min(${f(meshBox.min.toArray())})  max(${f(meshBox.max.toArray())})`
      );
      player.hit();
      this.sceneManager.shake(0.6);
      this.sceneManager.flash('#ff2200', 150);
      this._hitSfx.play();
    }
  }

  _checkCoins(dt) {
    const player = this._player;
    if (!player) return;

    // Collect jetpack elevated coins from active buff groups
    const jetpackCoins = [];
    for (const buff of player.activePowerups) {
      const g = buff._getCoinGroup?.();
      if (g) g.traverse(c => { if (c.userData.role === 'coin') jetpackCoins.push(c); });
    }

    const coins = [...(this._trackGen?.getCoins() || []), ...jetpackCoins];
    const hasMagnet = player.hasPowerup('magnet');
    const hasDoubler = player.hasPowerup('doubler');
    const magnetRadius = CONFIG.MAGNET_RADIUS;

    for (const coin of coins) {
      if (coin.userData.collected) continue;

      coin.updateWorldMatrix(true, false);
      const coinPos = new THREE.Vector3();
      coin.getWorldPosition(coinPos);

      const dist = player.group.position.distanceTo(coinPos);

      if (hasMagnet && dist < magnetRadius) {
        const dir = player.group.position.clone().sub(coinPos).normalize();
        coin.position.addScaledVector(dir, Math.min(dist, CONFIG.MAGNET_PULL_SPEED * dt));
      }

      if (dist < CONFIG.COIN_COLLECT_RADIUS) {
        coin.userData.collected = true;
        coin.visible = false;
        const value = CONFIG.COIN_VALUE * (hasDoubler ? 2 : 1);
        player.coins += value;
        this._coinSfx.play();

        if (player.coins >= this._coinMilestone) {
          player.coins += CONFIG.ACHIEVEMENT_BONUS;
          this._coinMilestone += CONFIG.ACHIEVEMENT_THRESHOLD;
          this.audioManager.play('achievement', '/assets/music/steps/achievement.mp3', { volume: CONFIG.ACHIEVEMENT_VOLUME });
          this._hud?.showAchievement(`+${CONFIG.ACHIEVEMENT_BONUS} Bonus! ${this._coinMilestone - CONFIG.ACHIEVEMENT_THRESHOLD} Coins`);
        }
      }
    }
  }

  _checkPowerups() {
    const player = this._player;
    if (!player) return;

    const powerups = this._trackGen?.getPowerups() || [];
    for (const pwr of powerups) {
      if (pwr.userData.collected) continue;

      pwr.updateWorldMatrix(true, false);
      const pwrPos = new THREE.Vector3();
      pwr.getWorldPosition(pwrPos);

      const dist = player.group.position.distanceTo(pwrPos);
      if (dist < 1.5) {
        pwr.userData.collected = true;
        pwr.visible = false;

        const type = pwr.userData.powerupType || Object.keys(POWERUP_FACTORIES)[
          Math.floor(Math.random() * Object.keys(POWERUP_FACTORIES).length)
        ];
        const factory = POWERUP_FACTORIES[type];
        if (factory) {
          const buff = factory();
          buff.onActivate(player, this);
          player.activePowerups.push(buff);
          this._powerupSfx.play();
        }
      }
    }
  }

  _checkPortals() {
    const player = this._player;
    if (!player) return;
    const playerPos = player.group.position;
    for (const buff of player.activePowerups) {
      const portal = buff._getPortal?.();
      if (portal) portal.checkCollect(playerPos);
    }
  }

  // ── Buff Glow Sync ─────────────────────────────────────────

  _syncBuffGlows() {
    const player = this._player;
    if (!player) return;

    const hasBuff = player.activePowerups.length > 0;
    if (hasBuff && this._buffGlows.length === 0) {
      const type = player.activePowerups[0].type;
      const color = POWERUP_COLORS[type] || '#ffffff';
      this._buffGlows = this._shaderMgr.addBuffGlow(player.group, color);
    } else if (!hasBuff && this._buffGlows.length > 0) {
      this._shaderMgr.removeBuffGlow(player.group);
      this._buffGlows = [];
    }
  }

  // ── Helpers ────────────────────────────────────────────────

  playHomeMusic() {
    this.audioManager.stopLoop('gameplay_music', 600);
    setTimeout(() => {
      this.audioManager.playGaplessLoop('home_music', '/assets/music/steps/home_music.mp3', { volume: CONFIG.HOME_MUSIC_VOLUME });
    }, 620);
  }

  playGameplayMusic() {
    this.audioManager.stopLoop('home_music', 600);
    setTimeout(() => {
      this.audioManager.playGaplessLoop('gameplay_music', '/assets/music/steps/gameplay_music.mp3', { volume: CONFIG.GAMEPLAY_MUSIC_VOLUME });
    }, 620);
  }

  _randomPowerupInterval() {
    const [min, max] = CONFIG.POWERUP_SPAWN_INTERVAL;
    return min + Math.random() * (max - min);
  }

  _updateTurnBend(dt) {
    const { TURN_STRENGTH, TURN_FREQUENCY, TURN_HOLD_DURATION, TURN_TRANSITION_TIME } = CONFIG;
    const rate = TURN_STRENGTH / TURN_TRANSITION_TIME; // bend units per second

    switch (this._turnPhase) {
      case 'waiting':
        this._turnTimer -= dt;
        if (this._turnTimer <= 0) {
          this._turnDir   = Math.random() < 0.5 ? 1 : -1;
          this._turnPhase = 'in';
        }
        break;

      case 'in':
        this._turnBend += this._turnDir * rate * dt;
        if (Math.abs(this._turnBend) >= TURN_STRENGTH) {
          this._turnBend  = this._turnDir * TURN_STRENGTH;
          this._turnTimer = TURN_HOLD_DURATION;
          this._turnPhase = 'hold';
        }
        break;

      case 'hold':
        this._turnTimer -= dt;
        if (this._turnTimer <= 0) this._turnPhase = 'out';
        break;

      case 'out':
        this._turnBend -= this._turnDir * rate * dt;
        if (Math.abs(this._turnBend) <= 0.000001) {
          this._turnBend  = 0;
          this._turnTimer = TURN_FREQUENCY * (0.7 + Math.random() * 0.6); // vary interval
          this._turnPhase = 'waiting';
        }
        break;
    }

    setTurnBend(this._turnBend);
  }
}
