// src/main.js — Bootstrap: scene, renderer, game loop

import { Game }          from './core/Game.js';
import { HomePage }      from './ui/HomePage.js';
import { SaveManager }   from './core/SaveManager.js';
import { LoadingScreen } from './ui/LoadingScreen.js';

async function bootstrap() {
  const app = document.getElementById('app');
  const params = new URLSearchParams(window.location.search);

  // Editor routes — boot before the game engine so nothing covers the UI
  if (params.get('editor') === 'formations') {
    const { FormationEditor } = await import('./editors/FormationEditor.js');
    new FormationEditor(app);
    return;
  }

  // Create canvas
  const canvas = document.createElement('canvas');
  app.appendChild(canvas);

  // Boot the game engine — show progress bar while assets load
  const loading = new LoadingScreen();
  const game = new Game(canvas);
  if (import.meta.env.DEV) window._game = game;
  await game.init((loaded, total) => loading.onProgress(loaded, total));
  loading.destroy();

  // Apply saved theme on boot
  const savedTheme = SaveManager.getTheme();
  if (savedTheme === 'pixel') game.sceneManager.setPixelArt(true);

  const applyTheme = (theme) => game.sceneManager.setPixelArt(theme === 'pixel');

  let homepage = null;

  function showHomePage() {
    homepage?.destroy();
    game.playHomeMusic();
    homepage = new HomePage((playerName) => {
      homepage = null;
      game.startFromMenu(playerName);
    }, applyTheme);
  }

  // Listen for game requesting menu
  window.addEventListener('helmsdash:showMenu', showHomePage);

  if (params.get('editor') === 'chunks') {
    const { ChunkLibraryEditor } = await import('./editors/ChunkLibraryEditor.js');
    new ChunkLibraryEditor(app, game.sceneManager.scene);
    return;
  }

  // Show homepage on startup
  showHomePage();
}

bootstrap().catch(console.error);
