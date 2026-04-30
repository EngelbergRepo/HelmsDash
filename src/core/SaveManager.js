// src/core/SaveManager.js
// Handles localStorage persistence for player name, high score, etc.

const PREFIX = 'helmsdash:';

export class SaveManager {
  static setPlayerName(name) {
    localStorage.setItem(PREFIX + 'playerName', name);
  }

  static getPlayerName() {
    return localStorage.getItem(PREFIX + 'playerName') || '';
  }

  static setHighScore(score) {
    const current = SaveManager.getHighScore();
    if (score > current) {
      localStorage.setItem(PREFIX + 'highScore', String(score));
      return true; // new high score
    }
    return false;
  }

  static getHighScore() {
    return parseInt(localStorage.getItem(PREFIX + 'highScore') || '0', 10);
  }

  static getTotalCoins() {
    return parseInt(localStorage.getItem(PREFIX + 'totalCoins') || '0', 10);
  }

  static addCoins(amount) {
    const total = SaveManager.getTotalCoins() + amount;
    localStorage.setItem(PREFIX + 'totalCoins', String(total));
    return total;
  }

  static setTheme(theme) {
    localStorage.setItem(PREFIX + 'theme', theme);
  }

  static getTheme() {
    return localStorage.getItem(PREFIX + 'theme') || 'normal';
  }

  static clear() {
    Object.keys(localStorage)
      .filter(k => k.startsWith(PREFIX))
      .forEach(k => localStorage.removeItem(k));
  }
}
