// src/ui/HUD.js
// DOM HUD overlay — HP, XP, coins, buff bar, pause, mute

import './hud.css';
import { CONFIG } from '../config.js';

export class HUD {
  constructor(game) {
    this._game = game;
    this._el = null;
    this._hpEl = null;
    this._xpEl = null;
    this._coinEl = null;
    this._buffBar = null;
    this._pillMap = new Map(); // type → pill element
    this._build();
  }

  _build() {
    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.innerHTML = `
      <div id="hud-top">
        <div id="hud-left">
          <div id="hud-controls">
            <button class="hud-btn" id="btn-pause">⏸ Pause</button>
            <button class="hud-btn" id="btn-mute">🔊 Sound</button>
          </div>
          <div id="hp-bar"></div>
        </div>
        <div id="hud-right">
          <div class="hud-stat" id="stat-xp">⭐ <span>0</span></div>
          <div class="hud-stat" id="stat-coins">💰 <span>0</span></div>
        </div>
      </div>
      <div id="buff-bar"></div>
    `;

    document.getElementById('app').appendChild(hud);

    this._el      = hud;
    this._hpEl    = hud.querySelector('#hp-bar');
    this._xpEl    = hud.querySelector('#stat-xp span');
    this._coinEl  = hud.querySelector('#stat-coins span');
    this._buffBar = hud.querySelector('#buff-bar');

    hud.querySelector('#btn-pause').addEventListener('click', () => {
      this._game.togglePause();
    });
    hud.querySelector('#btn-mute').addEventListener('click', () => {
      const muted = this._game.audioManager.toggleMute();
      hud.querySelector('#btn-mute').textContent = muted ? '🔇' : '🔊';
    });

    this._buildHearts();
  }

  _buildHearts() {
    this._hpEl.innerHTML = '<span class="heart-icon">❤️</span><span class="heart-count"></span>';
  }

  updateHP(current) {
    const el = this._hpEl.querySelector('.heart-count');
    if (el) el.textContent = current;
  }

  updateXP(xp)    { this._xpEl.textContent = Math.floor(xp).toLocaleString(); }
  updateCoins(n)  { this._coinEl.textContent = n.toLocaleString(); }

  // ── Buff Bar ────────────────────────────────────────────────

  syncBuffs(activePowerups) {
    const currentTypes = new Set(activePowerups.map(p => p.type));

    // Remove expired pills
    for (const [type, pill] of this._pillMap) {
      if (!currentTypes.has(type)) {
        pill.classList.add('fade-out');
        setTimeout(() => pill.remove(), 400);
        this._pillMap.delete(type);
      }
    }

    // Update / add pills
    for (const p of activePowerups) {
      if (!this._pillMap.has(p.type)) {
        const pill = this._createPill(p);
        this._buffBar.appendChild(pill);
        this._pillMap.set(p.type, pill);
      }

      const pill = this._pillMap.get(p.type);
      pill.querySelector('.buff-timer').textContent = `${Math.ceil(p.timer)}s`;
      pill.querySelector('.buff-fill').style.width = `${p.fraction * 100}%`;
      pill.classList.toggle('expiring', p.timer < 5);
    }
  }

  _createPill(powerup) {
    const pill = document.createElement('div');
    pill.className = 'buff-pill';
    pill.dataset.type = powerup.type;
    pill.innerHTML = `
      <span class="buff-icon">${powerup.icon}</span>
      <div class="buff-info">
        <div class="buff-label">${powerup.label}</div>
        <div class="buff-timer">${Math.ceil(powerup.timer)}s</div>
        <div class="buff-track"><div class="buff-fill" style="width:100%"></div></div>
      </div>
    `;
    return pill;
  }

  showAchievement(label) {
    const toast = document.createElement('div');
    toast.className = 'achievement-toast';
    toast.innerHTML = `<span class="achievement-icon">🏆</span><span class="achievement-text">${label}</span>`;
    this._el.appendChild(toast);
    // Remove after animation completes
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }

  show() { this._el.style.display = 'flex'; }
  hide() { this._el.style.display = 'none'; }

  destroy() {
    this._el?.remove();
  }
}
