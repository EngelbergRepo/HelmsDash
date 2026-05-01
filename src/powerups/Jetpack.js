// src/powerups/Jetpack.js
import * as THREE from 'three';
import { Collectible } from '../entities/Collectible.js';
import { VibejamPortal } from '../entities/VibejamPortal.js';
import { CONFIG } from '../config.js';
import { getAsset } from '../core/AssetRegistry.js';

const COIN_ALT = 5.5;
const LANE_CHANGE_EVERY = 20; // coins per lane segment

// Persists across Jetpack instances within a run; reset by resetJetpackCounter()
let _activationCount = 0;
export function resetJetpackCounter() { _activationCount = 0; }

function spawnJetpackCoins(scene, playerX, playerZ) {
  const group = new THREE.Group();
  group.userData.isJetpackCoins = true;
  const count = CONFIG.JETPACK_COINS_PER_CHUNK;
  const spacing = 2.2;

  const startLane = Math.round((playerX / CONFIG.LANE_SPACING) + 1); // 0|1|2
  const lanes = [Math.max(0, Math.min(2, startLane))];
  for (let s = 1; s * LANE_CHANGE_EVERY < count; s++) {
    const others = [0, 1, 2].filter(l => l !== lanes[lanes.length - 1]);
    lanes.push(others[Math.floor(Math.random() * others.length)]);
  }

  for (let i = 0; i < count; i++) {
    const segLane = lanes[Math.floor(i / LANE_CHANGE_EVERY)];
    const laneX = (segLane - 1) * CONFIG.LANE_SPACING;
    const asset = getAsset('collectibles/coin');
    asset.scale.setScalar(0.6);
    asset.userData.role = 'coin';
    asset.userData.collected = false;
    asset.position.set(laneX, COIN_ALT, playerZ - 8 - i * spacing);
    group.add(asset);
  }
  scene.add(group);
  return group;
}

export class Jetpack extends Collectible {
  constructor() {
    let _coinGroup = null;
    let _portal    = null;

    super({
      type:     'jetpack',
      duration: CONFIG.JETPACK_DURATION,
      icon:     '🚀',
      label:    'Jetpack',
      onActivate: (player, game) => {
        player.activateJetpack();
        game?.sceneManager?.setJetpackAltitude(true, 2.8);
        game?.audioManager?.playGaplessLoop('jetpack_sfx', '/assets/music/steps/jetpack.mp3', { volume: CONFIG.JETPACK_SFX_VOLUME });

        if (game?.sceneManager?.scene) {
          const scene  = game.sceneManager.scene;
          const pz     = player.group.position.z;
          const px     = player.group.position.x;

          _coinGroup = spawnJetpackCoins(scene, px, pz);

          _activationCount++;
          if (_activationCount % 3 === 0) {
            // Place the portal roughly in the middle of the coin trail
            const midCount = Math.floor(CONFIG.JETPACK_COINS_PER_CHUNK / 2);
            const portalZ  = pz - 8 - midCount * 2.2;
            _portal = new VibejamPortal(scene, 0, COIN_ALT, portalZ);
          }
        }
      },
      onExpire: (player, game) => {
        player.deactivateJetpack();
        game?.sceneManager?.setJetpackAltitude(false, 2.8);
        game?.audioManager?.stopLoop('jetpack_sfx', 400);
        if (_coinGroup && game?.sceneManager?.scene) {
          game.sceneManager.scene.remove(_coinGroup);
          _coinGroup = null;
        }
        if (_portal) {
          _portal.destroy();
          _portal = null;
        }
      },
    });

    this._getCoinGroup = () => _coinGroup;
    this._getPortal    = () => _portal;
  }
}
