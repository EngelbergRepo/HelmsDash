// src/ui/LoadingScreen.js — Full-screen loading overlay shown while assets load

const CSS = `
#loading-screen {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse at 60% 40%, #3d1a06 0%, #0a0604 70%);
  font-family: 'Cinzel', serif;
  color: #f0e6c8;
  transition: opacity 0.5s ease;
}
#loading-screen.fade-out {
  opacity: 0;
  pointer-events: none;
}
#loading-title {
  font-family: 'Cinzel Decorative', serif;
  font-size: 2.4rem;
  color: #f5c842;
  text-shadow: 0 0 30px rgba(245,200,66,0.55), 0 4px 20px rgba(0,0,0,0.9);
  margin-bottom: 6px;
  letter-spacing: 0.05em;
}
#loading-subtitle {
  font-size: 0.78rem;
  color: #c8a870;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  margin-bottom: 42px;
}
#loading-bar-wrap {
  width: min(340px, 76vw);
  height: 14px;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(245,200,66,0.25);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 14px;
}
#loading-bar-fill {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, #c8941a, #f5c842, #ffe98a);
  border-radius: 8px;
  transition: width 0.18s ease-out;
  box-shadow: 0 0 12px rgba(245,200,66,0.45);
}
#loading-label {
  font-size: 0.75rem;
  color: #a08050;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
`;

export class LoadingScreen {
  constructor() {
    // Inject styles once
    if (!document.getElementById('loading-screen-style')) {
      const style = document.createElement('style');
      style.id = 'loading-screen-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    this._el = document.createElement('div');
    this._el.id = 'loading-screen';
    this._el.innerHTML = `
      <div id="loading-title">HelmsDash</div>
      <div id="loading-subtitle">Medieval Endless Runner</div>
      <div id="loading-bar-wrap">
        <div id="loading-bar-fill"></div>
      </div>
      <div id="loading-label">Preparing the kingdom…</div>
    `;
    document.getElementById('app').appendChild(this._el);

    this._fill  = this._el.querySelector('#loading-bar-fill');
    this._label = this._el.querySelector('#loading-label');
  }

  // Called by initAssetRegistry as each asset resolves
  onProgress(loaded, total) {
    const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
    this._fill.style.width = `${pct}%`;
    this._label.textContent = `Loading assets… ${loaded} / ${total}`;
  }

  // Fade out then remove
  destroy() {
    this._el.classList.add('fade-out');
    this._el.addEventListener('transitionend', () => this._el.remove(), { once: true });
  }
}
