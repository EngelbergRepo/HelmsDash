// src/core/SfxPool.js
// Reusable on-demand random SFX picker with shuffle-deck (no back-to-back repeats).
//
// Usage:
//   const pool = new SfxPool(audioManager);
//   pool.init({ srcs, volume, keyPrefix });   // once per session (or once globally)
//   pool.play();                              // call whenever the sound should fire
//   pool.destroy();                           // on session end

function shuffleDeck(n) {
  const deck = [...Array(n).keys()];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export class SfxPool {
  constructor(audioManager) {
    this._am     = audioManager;
    this._howls  = [];
    this._deck   = [];
    this._ready  = false;
  }

  /**
   * Load the sound pool. Safe to call multiple times (re-uses cached Howls).
   * @param {object}   opts
   * @param {string[]} opts.srcs      - Array of audio file paths
   * @param {number}   opts.volume    - Playback volume (0–1)
   * @param {string}   opts.keyPrefix - Unique prefix for AudioManager cache keys (e.g. 'coin')
   */
  init({ srcs, volume, keyPrefix }) {
    this._howls = srcs.map((src, i) =>
      this._am._loadSound(`${keyPrefix}_${i}`, src, { volume })
    );
    this._deck  = shuffleDeck(this._howls.length);
    this._ready = true;
  }

  /** Play the next sound from the shuffled deck. */
  play() {
    if (!this._ready || !this._howls.length) return;
    if (this._deck.length === 0) this._deck = shuffleDeck(this._howls.length);
    const h = this._howls[this._deck.pop()];
    if (h) {
      h.stop();
      h.play();
    }
  }

  /** Update volume live. */
  setVolume(v) {
    for (const h of this._howls) h?.volume(v);
  }

  destroy() {
    for (const h of this._howls) h?.stop();
    this._howls = [];
    this._deck  = [];
    this._ready = false;
  }
}
