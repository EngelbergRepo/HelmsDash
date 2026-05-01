// src/core/persist.js
// Call this from any editor to write JSON straight to disk.
// In production (no dev server) it silently falls back to localStorage.

export async function persistToFile(filePath, data) {
  try {
    const res = await fetch('/api/persist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, data }),
    });
    if (!res.ok) throw new Error(await res.text());
    // console.info(`[persist] Saved → ${filePath}`);
  } catch {
    // Dev server not available — fall back to localStorage
    localStorage.setItem('helmsdash:' + filePath, JSON.stringify(data));
    // console.warn(`[persist] File write unavailable; saved to localStorage: ${filePath}`);
  }
}

export async function loadFromFile(filePath) {
  // Always fetch from the static asset URL; Vite serves assets/ directly
  try {
    const res = await fetch('/' + filePath);
    if (res.ok) return await res.json();
  } catch { /* fall through */ }
  // Fallback: localStorage
  const ls = localStorage.getItem('helmsdash:' + filePath);
  return ls ? JSON.parse(ls) : null;
}
