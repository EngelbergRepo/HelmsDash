// src/editors/FormationEditor.js
// Visual 2D grid editor for obstacle formations.
// Access via: http://localhost:5173/?editor=formations

import { persistToFile, loadFromFile } from '../core/persist.js';

const ASSET_KEYS = ['cart', 'barrel', 'gate', 'low_beam', 'wagon', 'ramp'];
const ASSET_LABELS = {
  cart:     'Cart',
  barrel:   'Barrel',
  gate:     'Gate',
  low_beam: 'Low Beam',
  wagon:    'Wagon',
  ramp:     'Ramp',
};
const ASSET_COLORS = {
  cart:     '#8b5c2a',
  barrel:   '#5a7a3a',
  gate:     '#7a3a5a',
  low_beam: '#2a5a7a',
  wagon:    '#4a4a8a',
  ramp:     '#6a3a8a',
};
const DIFFICULTIES = ['easy', 'medium', 'hard'];

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  #fe-overlay {
    position: fixed; inset: 0; background: #0d0b09;
    z-index: 200; display: flex; flex-direction: column;
    font-family: 'Cinzel', serif; color: #e8d5a0;
  }
  #fe-header {
    padding: 13px 20px; border-bottom: 1px solid rgba(245,200,66,0.25);
    font-size: 1.05rem; font-weight: 700; letter-spacing: 0.06em;
    color: #f5c842; display: flex; justify-content: space-between; align-items: center;
    flex-shrink: 0;
  }
  #fe-body { display: flex; flex: 1; overflow: hidden; }

  /* ── Left: asset palette ───────────────────────── */
  #fe-assets {
    width: 160px; border-right: 1px solid rgba(255,255,255,0.08);
    padding: 12px 8px; display: flex; flex-direction: column; gap: 6px;
    overflow-y: auto; flex-shrink: 0;
  }
  .fe-section-label {
    font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.12em;
    color: #a09070; padding: 4px 6px 2px;
  }
  .fe-asset-btn {
    padding: 9px 10px; border-radius: 8px; border: 2px solid transparent;
    cursor: pointer; font-family: 'Cinzel', serif; font-size: 0.78rem;
    font-weight: 700; text-align: left; transition: transform 0.1s, border-color 0.1s;
    color: #fff;
  }
  .fe-asset-btn:hover { transform: translateX(2px); }
  .fe-asset-btn.selected { border-color: #f5c842; box-shadow: 0 0 8px rgba(245,200,66,0.4); }
  .fe-clear-btn {
    padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15);
    background: transparent; cursor: pointer; font-family: 'Cinzel', serif;
    font-size: 0.75rem; color: #a09070; text-align: left;
  }
  .fe-clear-btn:hover { color: #e8d5a0; border-color: rgba(255,255,255,0.3); }

  /* ── Centre: grid ───────────────────────────────── */
  #fe-main {
    flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 16px;
  }
  #fe-grid-wrap { flex: 1; overflow-y: auto; padding-bottom: 12px; }
  #fe-grid {
    display: grid;
    grid-template-columns: 64px repeat(3, 1fr);
    gap: 6px; min-width: 320px;
  }
  .fe-header-cell {
    text-align: center; font-size: 0.68rem; text-transform: uppercase;
    letter-spacing: 0.1em; color: #a09070; padding: 4px 0 8px;
  }
  .fe-slot-label {
    display: flex; align-items: center; justify-content: flex-end;
    padding-right: 10px; font-size: 0.72rem; color: #706050;
  }
  .fe-cell {
    min-height: 52px; border-radius: 8px; border: 2px dashed rgba(255,255,255,0.1);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; font-size: 0.72rem; font-weight: 700;
    transition: border-color 0.12s, background 0.12s;
    color: #fff; text-align: center; padding: 4px;
    user-select: none;
  }
  .fe-cell:hover { border-color: rgba(245,200,66,0.4); background: rgba(245,200,66,0.04); }
  .fe-cell.filled { border-style: solid; border-color: rgba(255,255,255,0.3); }
  .fe-cell.wagon-body {
    background: rgba(40,40,60,0.6) !important; border-style: solid !important;
    border-color: #4a4a8a88 !important; color: #4a4a8a !important;
    cursor: not-allowed; font-size: 0.65rem; letter-spacing: 0.05em;
  }

  #fe-grid-controls {
    display: flex; gap: 10px; padding-top: 12px; flex-shrink: 0; flex-wrap: wrap;
  }
  .fe-ctrl-btn {
    padding: 8px 16px; border-radius: 8px; border: 1px solid rgba(245,200,66,0.3);
    background: transparent; color: #a09070; font-family: 'Cinzel', serif;
    font-size: 0.78rem; cursor: pointer; transition: color 0.15s, border-color 0.15s;
  }
  .fe-ctrl-btn:hover { color: #f5c842; border-color: #f5c842; }
  .fe-save-formation-btn {
    padding: 9px 20px; border-radius: 8px;
    background: linear-gradient(135deg,#c8941a,#f5c842);
    border: none; color: #1a0f03; font-family: 'Cinzel', serif;
    font-size: 0.85rem; font-weight: 900; cursor: pointer;
    transition: transform 0.1s; letter-spacing: 0.04em;
  }
  .fe-save-formation-btn:hover { transform: translateY(-1px); }

  /* ── Right: formation list + metadata ───────────── */
  #fe-panel {
    width: 270px; border-left: 1px solid rgba(255,255,255,0.08);
    display: flex; flex-direction: column; overflow: hidden; flex-shrink: 0;
  }
  #fe-formation-list {
    flex: 1; overflow-y: auto; padding: 10px 0;
  }
  .fe-formation-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 14px; cursor: pointer; font-size: 0.8rem;
    border-left: 3px solid transparent; transition: background 0.1s;
  }
  .fe-formation-item:hover { background: rgba(255,255,255,0.04); }
  .fe-formation-item.active { background: rgba(245,200,66,0.08); border-left-color: #f5c842; color: #f5c842; }
  .fe-formation-item .fe-del { color: #a09070; cursor: pointer; padding: 0 4px; font-size: 0.9rem; }
  .fe-formation-item .fe-del:hover { color: #ff6666; }
  #fe-meta {
    padding: 14px; border-top: 1px solid rgba(255,255,255,0.08);
    display: flex; flex-direction: column; gap: 10px; flex-shrink: 0;
  }
  .fe-field { display: flex; flex-direction: column; gap: 5px; }
  .fe-label { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em; color: #a09070; }
  .fe-input, .fe-select {
    background: rgba(255,255,255,0.06); border: 1px solid rgba(245,200,66,0.2);
    border-radius: 6px; padding: 7px 10px; color: #e8d5a0;
    font-family: 'Cinzel', serif; font-size: 0.82rem; outline: none;
    transition: border-color 0.15s; width: 100%;
  }
  .fe-input:focus, .fe-select:focus { border-color: #f5c842; }
  .fe-diff-row { display: flex; gap: 6px; flex-wrap: wrap; }
  .fe-diff-check { display: flex; align-items: center; gap: 5px; font-size: 0.78rem; }
  .fe-diff-check input { accent-color: #f5c842; }
  .fe-export-btn {
    padding: 10px; border-radius: 8px;
    background: linear-gradient(135deg,#1a4a1a,#2a8a2a);
    border: none; color: #aaffaa; font-family: 'Cinzel', serif;
    font-size: 0.82rem; font-weight: 700; cursor: pointer;
    transition: transform 0.1s; letter-spacing: 0.04em;
  }
  .fe-export-btn:hover { transform: translateY(-1px); }
  #fe-status {
    padding: 6px 12px; font-size: 0.72rem; color: #88cc88;
    border-top: 1px solid rgba(255,255,255,0.06); text-align: center; flex-shrink: 0;
  }
  .fe-new-btn {
    display: block; width: calc(100% - 28px); margin: 8px 14px 0;
    padding: 8px; border-radius: 8px; border: 1px dashed rgba(245,200,66,0.25);
    background: transparent; color: #a09070; font-family: 'Cinzel', serif;
    font-size: 0.75rem; cursor: pointer; transition: color 0.15s, border-color 0.15s;
  }
  .fe-new-btn:hover { color: #f5c842; border-color: #f5c842; }
`;

export class FormationEditor {
  constructor(container) {
    this._container  = container;
    this._selected   = null;           // active asset key
    this._slots      = [[null,null,null]]; // [slotIdx][lane 0-2]
    this._formations = [];
    this._editingIdx = null;           // index into _formations, null = new

    this._injectCSS();
    this._buildUI();
    this._loadFormations();
  }

  _injectCSS() {
    if (document.getElementById('fe-styles')) return;
    const s = document.createElement('style');
    s.id = 'fe-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  _buildUI() {
    const overlay = document.createElement('div');
    overlay.id = 'fe-overlay';
    overlay.innerHTML = `
      <div id="fe-header">
        <span>⚔️ HelmsDash — Formation Editor</span>
        <a href="/" style="color:#a09070;font-size:0.8rem;text-decoration:none;">✕ Exit</a>
      </div>
      <div id="fe-body">

        <div id="fe-assets">
          <div class="fe-section-label">Assets</div>
        </div>

        <div id="fe-main">
          <div id="fe-grid-wrap">
            <div id="fe-grid"></div>
          </div>
          <div id="fe-grid-controls">
            <button class="fe-ctrl-btn" id="fe-add-slot">+ Add Slot</button>
            <button class="fe-ctrl-btn" id="fe-remove-slot">− Remove Slot</button>
            <button class="fe-save-formation-btn" id="fe-save-formation">Save Formation</button>
          </div>
        </div>

        <div id="fe-panel">
          <div id="fe-formation-list">
            <button class="fe-new-btn" id="fe-new-btn">+ New Formation</button>
          </div>
          <div id="fe-meta">
            <div class="fe-field">
              <div class="fe-label">Formation ID</div>
              <input class="fe-input" id="fe-id" type="text" placeholder="e.g. middle_corridor" />
            </div>
            <div class="fe-field">
              <div class="fe-label">Difficulty</div>
              <div class="fe-diff-row">
                ${DIFFICULTIES.map(d => `
                  <label class="fe-diff-check">
                    <input type="checkbox" value="${d}" id="fe-diff-${d}" checked />
                    ${d}
                  </label>`).join('')}
              </div>
            </div>
            <div class="fe-field">
              <div class="fe-label">Spawn Weight</div>
              <input class="fe-input" id="fe-weight" type="number" min="0.1" max="5" step="0.1" value="1.0" />
            </div>
            <button class="fe-export-btn" id="fe-export">💾 Export All to JSON</button>
          </div>
          <div id="fe-status">Ready.</div>
        </div>

      </div>
    `;
    this._container.appendChild(overlay);
    this._overlay = overlay;

    // Asset palette
    const assetsEl = overlay.querySelector('#fe-assets');
    for (const key of ASSET_KEYS) {
      const btn = document.createElement('button');
      btn.className = 'fe-asset-btn';
      btn.dataset.key = key;
      btn.textContent = ASSET_LABELS[key];
      btn.style.background = ASSET_COLORS[key];
      btn.addEventListener('click', () => this._selectAsset(key, btn));
      assetsEl.appendChild(btn);
    }
    const clearBtn = document.createElement('button');
    clearBtn.className = 'fe-clear-btn';
    clearBtn.textContent = '✕ Clear (right-click)';
    assetsEl.appendChild(clearBtn);

    overlay.querySelector('#fe-add-slot').addEventListener('click', () => this._addSlot());
    overlay.querySelector('#fe-remove-slot').addEventListener('click', () => this._removeSlot());
    overlay.querySelector('#fe-save-formation').addEventListener('click', () => this._saveFormation());
    overlay.querySelector('#fe-export').addEventListener('click', () => this._exportJSON());
    overlay.querySelector('#fe-new-btn').addEventListener('click', () => this._newFormation());

    this._rebuildGrid();
  }

  // ── Asset selection ──────────────────────────────────────────

  _selectAsset(key, btn) {
    this._selected = key;
    this._overlay.querySelectorAll('.fe-asset-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  }

  // ── Grid ─────────────────────────────────────────────────────

  _rebuildGrid() {
    const grid = this._overlay.querySelector('#fe-grid');
    grid.innerHTML = '';

    // Header row
    grid.appendChild(this._el('div', 'fe-header-cell', ''));
    ['Lane 0', 'Lane 1', 'Lane 2'].forEach(t => {
      grid.appendChild(this._el('div', 'fe-header-cell', t));
    });

    // Slot rows
    this._slots.forEach((slot, si) => {
      grid.appendChild(this._el('div', 'fe-slot-label', `Slot ${si}`));
      slot.forEach((val, li) => {
        const cell = document.createElement('div');
        const isBody = val === 'wagon_body';
        cell.className = 'fe-cell' + (val && !isBody ? ' filled' : '') + (isBody ? ' wagon-body' : '');
        cell.textContent = isBody ? '▓ wagon' : (val ? ASSET_LABELS[val] : '—');
        if (!isBody) {
          cell.style.background = val ? ASSET_COLORS[val] + '55' : '';
          cell.style.borderColor = val ? ASSET_COLORS[val] : '';
        }
        if (!isBody) {
          cell.addEventListener('click', () => this._cellClick(si, li));
          cell.addEventListener('contextmenu', (e) => { e.preventDefault(); this._cellClear(si, li); });
        } else {
          cell.addEventListener('contextmenu', (e) => { e.preventDefault(); this._cellClearWagon(si, li); });
        }
        grid.appendChild(cell);
      });
    });
  }

  _cellClick(si, li) {
    if (!this._selected) return;
    if (this._selected === 'wagon') {
      // Need 2 more slots after si to hold the body
      if (si + 2 >= this._slots.length) {
        this._setStatus(`⚠️ Wagon needs 2 more slots after slot ${si} — add more slots first.`);
        return;
      }
      // Block if either body slot in this lane is already occupied
      if (this._slots[si + 1][li] || this._slots[si + 2][li]) {
        this._setStatus('⚠️ Not enough clear space in this lane for a wagon.');
        return;
      }
      this._slots[si][li]     = 'wagon';
      this._slots[si + 1][li] = 'wagon_body';
      this._slots[si + 2][li] = 'wagon_body';
    } else {
      // Block placing anything in a wagon_body cell
      if (this._slots[si][li] === 'wagon_body') return;
      this._slots[si][li] = this._selected;
    }
    this._rebuildGrid();
  }

  _cellClear(si, li) {
    const val = this._slots[si][li];
    if (val === 'wagon') {
      // Clear head + body
      this._slots[si][li] = null;
      if (this._slots[si + 1]?.[li] === 'wagon_body') this._slots[si + 1][li] = null;
      if (this._slots[si + 2]?.[li] === 'wagon_body') this._slots[si + 2][li] = null;
    } else {
      this._slots[si][li] = null;
    }
    this._rebuildGrid();
  }

  _cellClearWagon(si, li) {
    // Find the wagon head above this body cell and clear all 3
    for (let s = si - 1; s >= 0; s--) {
      if (this._slots[s][li] === 'wagon') {
        this._cellClear(s, li);
        return;
      }
    }
  }

  _addSlot() {
    this._slots.push([null, null, null]);
    this._rebuildGrid();
  }

  _removeSlot() {
    if (this._slots.length > 1) this._slots.pop();
    this._rebuildGrid();
  }

  // ── Formation save / load ────────────────────────────────────

  _saveFormation() {
    const id = this._overlay.querySelector('#fe-id').value.trim();
    if (!id) { this._setStatus('⚠️ Please enter a Formation ID.'); return; }

    const difficulty = DIFFICULTIES.filter(d =>
      this._overlay.querySelector(`#fe-diff-${d}`)?.checked
    );
    if (!difficulty.length) { this._setStatus('⚠️ Select at least one difficulty.'); return; }


    const spawnWeight = parseFloat(this._overlay.querySelector('#fe-weight').value) || 1.0;

    const formation = {
      id,
      difficulty,
      spawnWeight,
      slots: this._slots.map(slot => ({
        lane0: slot[0] === 'wagon_body' ? null : slot[0],
        lane1: slot[1] === 'wagon_body' ? null : slot[1],
        lane2: slot[2] === 'wagon_body' ? null : slot[2],
      })),
    };

    if (this._editingIdx !== null) {
      this._formations[this._editingIdx] = formation;
    } else {
      this._formations.push(formation);
    }

    this._rebuildFormationList();
    this._newFormation();
    this._setStatus(`✅ Formation "${id}" saved. Hit Export to write to disk.`);
  }

  _newFormation() {
    this._editingIdx = null;
    this._slots = [[null, null, null]];
    this._overlay.querySelector('#fe-id').value = '';
    this._overlay.querySelector('#fe-weight').value = '1.0';
    DIFFICULTIES.forEach(d => {
      const cb = this._overlay.querySelector(`#fe-diff-${d}`);
      if (cb) cb.checked = true;
    });
    this._overlay.querySelectorAll('.fe-formation-item').forEach(i => i.classList.remove('active'));
    this._rebuildGrid();
  }

  _loadFormationIntoGrid(formation, idx) {
    this._editingIdx = idx;
    this._slots = formation.slots.map(s => [s.lane0 ?? null, s.lane1 ?? null, s.lane2 ?? null]);
    this._overlay.querySelector('#fe-id').value = formation.id;
    this._overlay.querySelector('#fe-weight').value = formation.spawnWeight ?? 1.0;
    DIFFICULTIES.forEach(d => {
      const cb = this._overlay.querySelector(`#fe-diff-${d}`);
      if (cb) cb.checked = (formation.difficulty ?? []).includes(d);
    });
    this._overlay.querySelectorAll('.fe-formation-item').forEach((el, i) => {
      el.classList.toggle('active', i === idx);
    });
    this._rebuildGrid();
  }

  _rebuildFormationList() {
    const list = this._overlay.querySelector('#fe-formation-list');
    // Remove old items, keep the "+ New" button
    list.querySelectorAll('.fe-formation-item').forEach(el => el.remove());

    this._formations.forEach((f, idx) => {
      const item = document.createElement('div');
      item.className = 'fe-formation-item' + (this._editingIdx === idx ? ' active' : '');

      const label = document.createElement('span');
      label.textContent = f.id;
      label.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;';
      label.addEventListener('click', () => this._loadFormationIntoGrid(f, idx));

      const del = document.createElement('span');
      del.className = 'fe-del';
      del.textContent = '✕';
      del.title = 'Delete formation';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        this._formations.splice(idx, 1);
        if (this._editingIdx === idx) this._newFormation();
        else if (this._editingIdx > idx) this._editingIdx--;
        this._rebuildFormationList();
      });

      item.appendChild(label);
      item.appendChild(del);
      list.insertBefore(item, list.querySelector('#fe-new-btn'));
    });
  }

  // ── Persistence ──────────────────────────────────────────────

  async _loadFormations() {
    const data = await loadFromFile('assets/data/obstacle_formations.json');
    if (Array.isArray(data) && data.length > 0) {
      this._formations = data;
      this._rebuildFormationList();
      this._setStatus(`Loaded ${data.length} formation(s).`);
    } else {
      this._setStatus('No formations yet. Build one and hit Save.');
    }
  }

  async _exportJSON() {
    if (!this._formations.length) {
      this._setStatus('⚠️ Nothing to export — save at least one formation first.');
      return;
    }
    await persistToFile('assets/data/obstacle_formations.json', this._formations);
    this._setStatus(`✅ Exported ${this._formations.length} formation(s) to obstacle_formations.json`);
  }

  // ── Helpers ──────────────────────────────────────────────────

  _el(tag, cls, text) {
    const el = document.createElement(tag);
    el.className = cls;
    el.textContent = text;
    return el;
  }

  _setStatus(msg) {
    const el = this._overlay?.querySelector('#fe-status');
    if (el) el.textContent = msg;
  }

  destroy() {
    this._overlay?.remove();
  }
}
