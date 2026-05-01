// src/core/InputManager.js
// Keyboard + touch + mouse input handling

export class InputManager {
  constructor() {
    this._keys = new Set();
    this._callbacks = {};
    this._touchStart = null;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('touchstart', this._onTouchStart, { passive: true });
    window.addEventListener('touchend', this._onTouchEnd, { passive: true });
  }

  on(action, callback) {
    if (!this._callbacks[action]) this._callbacks[action] = [];
    this._callbacks[action].push(callback);
  }

  off(action, callback) {
    if (!this._callbacks[action]) return;
    this._callbacks[action] = this._callbacks[action].filter(cb => cb !== callback);
  }

  _emit(action) {
    (this._callbacks[action] || []).forEach(cb => cb());
  }

  _onKeyDown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (this._keys.has(e.code)) return; // prevent key repeat
    this._keys.add(e.code);

    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this._emit('moveLeft');
        break;
      case 'ArrowRight':
      case 'KeyD':
        this._emit('moveRight');
        break;
      case 'Space':
      case 'ArrowUp':
      case 'KeyW':
        e.preventDefault();
        this._emit('jump');
        break;
      case 'ArrowDown':
      case 'KeyS':
      case 'ControlLeft':
      case 'ControlRight':
        e.preventDefault();
        this._emit('roll');
        break;
      case 'Escape':
        this._emit('pause');
        break;
      case 'KeyM':
        this._emit('mute');
        break;
    }
  }

  _onKeyUp(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    this._keys.delete(e.code);
  }

  _onTouchStart(e) {
    const t = e.changedTouches[0];
    this._touchStart = { x: t.clientX, y: t.clientY };
  }

  _onTouchEnd(e) {
    if (!this._touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - this._touchStart.x;
    const dy = t.clientY - this._touchStart.y;
    const threshold = 40;

    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > threshold) this._emit('moveRight');
      else if (dx < -threshold) this._emit('moveLeft');
    } else {
      if (dy < -threshold) this._emit('jump');
      else if (dy > threshold) this._emit('roll');
    }

    this._touchStart = null;
  }

  isKeyDown(code) {
    return this._keys.has(code);
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('touchstart', this._onTouchStart);
    window.removeEventListener('touchend', this._onTouchEnd);
  }
}
