// src/powerups/Jetpack.js
import * as THREE from 'three';
import { Collectible } from '../entities/Collectible.js';
import { CONFIG } from '../config.js';
import { applyWorldBend } from '../core/worldBend.js';

const COIN_ALT  = 5.5;   // Y height of jetpack coins
const COIN_MAT  = new THREE.MeshStandardMaterial({
  color: 0xffd700, emissive: 0xffaa00, emissiveIntensity: 0.9,
  roughness: 0.1, metalness: 1.0,
});
applyWorldBend(COIN_MAT);
const COIN_GEO  = new THREE.CylinderGeometry(0.38, 0.38, 0.09, 14);

const LANE_CHANGE_EVERY = 20; // coins per lane segment

function spawnJetpackCoins(scene, playerX, playerZ) {
  const group = new THREE.Group();
  group.userData.isJetpackCoins = true;
  const count = CONFIG.JETPACK_COINS_PER_CHUNK;
  const spacing = 2.2;

  // Start in the player's lane, then pick two different random lanes for the next segments
  const startLane = Math.round((playerX / CONFIG.LANE_SPACING) + 1); // 0|1|2
  const lanes = [Math.max(0, Math.min(2, startLane))];
  for (let s = 1; s * LANE_CHANGE_EVERY < count; s++) {
    const others = [0, 1, 2].filter(l => l !== lanes[lanes.length - 1]);
    lanes.push(others[Math.floor(Math.random() * others.length)]);
  }

  for (let i = 0; i < count; i++) {
    const segLane = lanes[Math.floor(i / LANE_CHANGE_EVERY)];
    const laneX = (segLane - 1) * CONFIG.LANE_SPACING;
    const coin = new THREE.Mesh(COIN_GEO, COIN_MAT);
    coin.rotation.x = Math.PI / 2;
    coin.position.set(laneX, COIN_ALT, playerZ - 8 - i * spacing);
    coin.userData.role = 'coin';
    coin.userData.collected = false;
    group.add(coin);
  }
  scene.add(group);
  return group;
}

export class Jetpack extends Collectible {
  constructor() {
    let _coinGroup = null;

    super({
      type:     'jetpack',
      duration: CONFIG.JETPACK_DURATION,
      icon:     '🚀',
      label:    'Jetpack',
      onActivate: (player, game) => {
        player.activateJetpack();
        game?.sceneManager?.setJetpackAltitude(true, 2.8);
        if (game?.sceneManager?.scene) {
          _coinGroup = spawnJetpackCoins(
            game.sceneManager.scene,
            player.group.position.x,
            player.group.position.z,
          );
        }
      },
      onExpire: (player, game) => {
        player.deactivateJetpack();
        game?.sceneManager?.setJetpackAltitude(false, 2.8);
        if (_coinGroup && game?.sceneManager?.scene) {
          game.sceneManager.scene.remove(_coinGroup);
          _coinGroup = null;
        }
      },
    });

    // Expose coin group so Game can scroll it with the world
    this._getCoinGroup = () => _coinGroup;
  }
}
