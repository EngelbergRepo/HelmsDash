// vite-plugin-fs-persist.js  —  dev only, stripped from production build
import fs from 'fs/promises';
import path from 'path';

const ALLOWED_PATHS = [
  'assets/data/chunk_manifest.json',
  'assets/data/asset_overrides.json',
  'assets/data/lighting_preset.json',
  'assets/data/shader_overrides.json',
  'assets/data/obstacle_formations.json',
  // Chunk preset files authored by the Three.js Editor:
  /^assets\/chunks\/chunk_[\w-]+\.json$/,
];

function isAllowed(filePath) {
  return ALLOWED_PATHS.some(p =>
    typeof p === 'string' ? p === filePath : p.test(filePath)
  );
}

export default function fsPersistPlugin() {
  return {
    name: 'fs-persist',
    apply: 'serve',                       // dev server only — never in production build
    configureServer(server) {
      // POST /api/persist  { path: 'assets/data/chunk_manifest.json', data: {...} }
      server.middlewares.use('/api/persist', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }

        let body = '';
        req.on('data', chunk => (body += chunk));
        req.on('end', async () => {
          try {
            const { path: filePath, data } = JSON.parse(body);

            if (!isAllowed(filePath)) {
              res.statusCode = 403;
              res.end(JSON.stringify({ error: 'Path not in allowlist' }));
              return;
            }

            const abs = path.resolve(process.cwd(), filePath);
            await fs.mkdir(path.dirname(abs), { recursive: true });
            await fs.writeFile(abs, JSON.stringify(data, null, 2), 'utf-8');

            // Trigger Vite HMR so any importer reloads instantly
            server.watcher.emit('change', abs);

            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true, path: filePath }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
        });
      });
    },
  };
}
