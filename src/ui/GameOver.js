// src/ui/GameOver.js
import { SaveManager } from '../core/SaveManager.js';
import { submitScore, fetchTopScores } from '../leaderboard.js';
import { escapeHtml } from './escapeHtml.js';

export class GameOver {
  constructor(onRestart, onQuit) {
    this._el = null;
    this._onRestart = onRestart;
    this._onQuit = onQuit;
  }

  show({ xp, coins, playerName, isNewHighScore }) {
    if (this._el) this._el.remove();

    const el = document.createElement('div');
    el.className = 'game-overlay';
    el.id = 'game-over';
    el.innerHTML = `
      <div class="overlay-card">
        <div class="overlay-title">⚔️ Fallen!</div>
        <div class="overlay-subtitle">${escapeHtml(playerName || 'Knight')}'s run has ended</div>

        ${isNewHighScore ? `<div style="color:#f5c842;font-size:0.85rem;margin-bottom:12px;letter-spacing:0.1em;">✨ NEW BEST RUN! ✨</div>` : ''}

        <div class="overlay-stat-row">
          <span>Final Score</span>
          <span>⭐ ${Math.floor(xp).toLocaleString()}</span>
        </div>
        <div class="overlay-stat-row">
          <span>Coins Collected</span>
          <span>💰 ${coins.toLocaleString()}</span>
        </div>
        <div class="overlay-stat-row">
          <span>Best Score</span>
          <span>⭐ ${SaveManager.getHighScore().toLocaleString()}</span>
        </div>

        <div class="overlay-stat-row" id="lb-status" style="font-size:0.75rem;opacity:0.6;">
          <span>Leaderboard</span><span>Submitting…</span>
        </div>

        <div id="lb-table" style="width:100%;margin:10px 0 4px;font-size:0.78rem;"></div>

        <button class="big-btn" id="restart-btn">⚔️ Run Again!</button>
        <button class="ghost-btn" id="quit-go-btn">🏠 Return to Village</button>
      </div>
    `;

    document.getElementById('app').appendChild(el);
    this._el = el;

    el.querySelector('#restart-btn').addEventListener('click', () => {
      this.hide(); this._onRestart();
    });
    el.querySelector('#quit-go-btn').addEventListener('click', () => {
      this.hide(); this._onQuit();
    });

    this._submitAndShow(playerName, coins);
  }

  async _submitAndShow(playerName, coins) {
    const statusEl = this._el?.querySelector('#lb-status span:last-child');
    const tableEl  = this._el?.querySelector('#lb-table');
    try {
      await submitScore(playerName || 'Knight', coins);
      if (statusEl) statusEl.textContent = 'Submitted ✓';
      const scores = await fetchTopScores();
      if (tableEl) tableEl.innerHTML = _renderTable(scores, playerName);
    } catch {
      if (statusEl) statusEl.textContent = 'Offline';
    }
  }

  hide() {
    if (!this._el) return;
    this._el.classList.add('fade-out');
    setTimeout(() => { this._el?.remove(); this._el = null; }, 400);
  }

  destroy() {
    this._el?.remove();
    this._el = null;
  }
}

function _renderTable(scores, currentName) {
  if (!scores.length) return '';
  const rows = scores.map(s => {
    const highlight = s.name === currentName ? 'style="color:#f5c842;"' : '';
    return `<tr ${highlight}>
      <td style="padding:1px 6px;opacity:0.5;">#${s.rank}</td>
      <td style="padding:1px 6px;">${escapeHtml(s.name)}</td>
      <td style="padding:1px 6px;text-align:right;">💰 ${escapeHtml(s.score.toLocaleString())}</td>
    </tr>`;
  }).join('');
  return `<table style="width:100%;border-collapse:collapse;">${rows}</table>`;
}
