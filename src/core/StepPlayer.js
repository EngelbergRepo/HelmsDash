// src/core/StepPlayer.js
// Reusable footstep audio sequencer.
//
// Usage:
//   const steps = new StepPlayer(audioManager);
//   steps.init({ srcs, volume, interval, seed });   // call once per session
//   steps.update(dt, isActive);                     // call every frame
//   steps.destroy();                                // call on session end
//
// The seeded shuffle ensures each game session has its own varied but deterministic
// playback order without repeating the same step twice in a row.

// Mulberry32 — fast, good-quality 32-bit seeded PRNG
function makePRNG(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleArray(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export class StepPlayer {
  constructor(audioManager) {
    this._am       = audioManager;
    this._howls    = [];   // one Howl per src
    this._deck     = [];   // shuffled indices, consumed left-to-right
    this._rng      = null;
    this._timer    = 0;
    this._interval = 0.28;
    this._volume   = 0.5;
    this._ready    = false;
  }

  /**
   * Load sounds and seed the shuffle.  Call once at session start.
   * @param {object} opts
   * @param {string[]} opts.srcs     - Array of audio file paths
   * @param {number}   opts.volume   - Playback volume (0–1)
   * @param {number}   opts.interval - Seconds between steps
   * @param {number}   opts.seed     - Integer seed for this session's shuffle
   */
  init({ srcs, volume, interval, seed }) {
    this.destroy(); // clear previous session if any

    this._volume   = volume   ?? this._volume;
    this._interval = interval ?? this._interval;
    this._rng      = makePRNG(seed ?? Date.now());
    this._timer    = this._interval; // fire first step immediately on run start

    // Load each sound once; re-used for the entire session
    this._howls = srcs.map((src, i) =>
      this._am._loadSound(`steps_${i}`, src, { volume: this._volume })
    );

    this._refillDeck();
    this._ready = true;
  }

  /**
   * Call every frame.
   * @param {number}  dt       - Delta time in seconds
   * @param {boolean} isActive - True when footsteps should play (RUNNING / HURT states)
   * @param {number}  rate     - Playback rate multiplier (>1 = faster cadence, e.g. sprinting)
   */
  update(dt, isActive, rate = 1.0) {
    if (!this._ready) return;

    if (!isActive) {
      // Reset timer so the first step after resuming fires promptly
      this._timer = this._interval * 0.5;
      return;
    }

    const effectiveInterval = this._interval / Math.max(rate, 0.1);
    this._timer -= dt;
    if (this._timer <= 0) {
      this._timer += effectiveInterval;
      this._playNext();
    }
  }

  /** Update volume live (e.g. from settings screen) */
  setVolume(v) {
    this._volume = v;
    for (const h of this._howls) h?.volume(v);
  }

  destroy() {
    // Stop any playing step sounds; do NOT dispose the Howls — AudioManager owns them
    for (const h of this._howls) h?.stop();
    this._howls  = [];
    this._deck   = [];
    this._ready  = false;
  }

  // ── Private ────────────────────────────────────────────────

  _playNext() {
    if (this._deck.length === 0) this._refillDeck();
    const idx = this._deck.pop();
    const h   = this._howls[idx];
    if (h) {
      h.stop();   // cut previous instance of same sound if still playing
      h.play();
    }
  }

  _refillDeck() {
    const n = this._howls.length || 10;
    this._deck = shuffleArray([...Array(n).keys()], this._rng);
  }
}
