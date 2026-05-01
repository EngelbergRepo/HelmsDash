// src/core/AudioManager.js
// Wraps Howler.js for all game audio

import { CONFIG } from '../config.js';

export class AudioManager {
  constructor() {
    this._muted = false;
    this._sounds = {};
    this._music = null;
    this._initialized = false;
  }

  async init() {
    // Dynamically import Howler (only loaded once)
    const { Howl, Howler } = await import('howler');
    this._Howl = Howl;
    this._Howler = Howler;
    Howler.volume(1.0);
    this._initialized = true;
  }

  _loadSound(key, src, options = {}) {
    if (!this._initialized) return null;
    if (this._sounds[key]) return this._sounds[key];

    this._sounds[key] = new this._Howl({
      src: Array.isArray(src) ? src : [src],
      loop: options.loop || false,
      volume: options.volume ?? CONFIG.SFX_VOLUME,
      preload: true,
      onloaderror: (_id, err) => console.error(`[Audio] Failed to load "${src}":`, err),
    });

    return this._sounds[key];
  }

  playMusic(key, src) {
    if (!this._initialized) return;
    if (this._music) {
      this._music.fade(this._music.volume(), 0, 500);
      setTimeout(() => { this._music?.stop(); }, 500);
    }
    const howl = new this._Howl({
      src: [src],
      loop: true,
      volume: 0,
      preload: true,
    });
    howl.play();
    howl.fade(0, CONFIG.MUSIC_VOLUME, 800);
    this._music = howl;
    this._sounds[key] = howl;
  }

  stopMusic(fadeMs = 1000) {
    if (!this._music) return;
    this._music.fade(this._music.volume(), 0, fadeMs);
    setTimeout(() => { this._music?.stop(); this._music = null; }, fadeMs);
  }

  play(key, src, options = {}) {
    if (!this._initialized || this._muted) return;
    const sound = this._loadSound(key, src, options);
    if (sound) sound.play();
  }

  playLoop(key, src, options = {}) {
    if (!this._initialized) return;
    const sound = this._loadSound(key, src, { ...options, loop: true });
    if (sound && !sound.playing()) sound.play();
  }

  // Truly gapless loop via Web Audio API — no MP3 encoder-padding silence.
  // Falls back to playLoop if the AudioContext is unavailable.
  async playGaplessLoop(key, src, options = {}) {
    if (!this._initialized) return;
    if (this._sounds[key]) return; // already running

    const ctx = this._Howler.ctx;
    if (!ctx) { this.playLoop(key, src, options); return; }

    const volume = options.volume ?? CONFIG.SFX_VOLUME;
    try {
      const buf = await fetch(src).then(r => r.arrayBuffer());
      const audioBuffer = await ctx.decodeAudioData(buf);

      const gainNode = ctx.createGain();
      gainNode.gain.value = this._muted ? 0 : volume;
      gainNode.connect(ctx.destination);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.loop   = true;
      source.connect(gainNode);
      source.start(0);

      this._sounds[key] = {
        _webAudio: true,
        _gain:     gainNode,
        _source:   source,
        _volume:   volume,
        stop() { try { source.stop(); } catch (_) {} gainNode.disconnect(); },
        fade(from, to, ms) {
          gainNode.gain.setValueAtTime(from, ctx.currentTime);
          gainNode.gain.linearRampToValueAtTime(to, ctx.currentTime + ms / 1000);
        },
      };
    } catch (e) {
      console.error(`[Audio] playGaplessLoop failed for "${src}":`, e);
      this.playLoop(key, src, options); // fallback
    }
  }

  stopLoop(key, fadeMs = 300) {
    const sound = this._sounds[key];
    if (!sound) return;

    if (sound._webAudio) {
      if (fadeMs > 0) {
        sound.fade(sound._gain.gain.value, 0, fadeMs);
        setTimeout(() => { sound.stop(); delete this._sounds[key]; }, fadeMs);
      } else {
        sound.stop();
        delete this._sounds[key];
      }
      return;
    }

    if (fadeMs > 0) {
      sound.fade(sound.volume(), 0, fadeMs);
      setTimeout(() => sound.stop(), fadeMs);
    } else {
      sound.stop();
    }
  }

  setMuted(muted) {
    this._muted = muted;
    if (!this._initialized) return;
    this._Howler.mute(muted);
    // Web Audio nodes bypass Howler — mute their gain nodes directly
    const ctx = this._Howler.ctx;
    for (const sound of Object.values(this._sounds)) {
      if (sound && sound._webAudio === true && sound._gain) {
        sound._gain.gain.setTargetAtTime(muted ? 0 : sound._volume, ctx.currentTime, 0.05);
      }
    }
  }

  toggleMute() {
    this.setMuted(!this._muted);
    return this._muted;
  }

  isMuted() {
    return this._muted;
  }

  setPaused(paused) {
    if (!this._music) return;
    if (paused) {
      this._music.fade(this._music.volume(), 0.1, 300);
    } else {
      this._music.fade(this._music.volume(), CONFIG.MUSIC_VOLUME, 300);
    }
  }
}
