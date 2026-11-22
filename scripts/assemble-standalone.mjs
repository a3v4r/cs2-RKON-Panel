// After `next build`: copy static assets into .next/standalone so the folder runs on its own (`node server.js`).
import fs from 'node:fs';
import path from 'node:path';

fs.rmSync('.next/standalone/.next/static', { recursive: true, force: true });
fs.cpSync('.next/static', '.next/standalone/.next/static', { recursive: true });
if (fs.existsSync('public')) fs.cpSync('public', '.next/standalone/public', { recursive: true });
// Skins website the panel runs for players (src/server/skins-site.ts); its local files stay out
const skip = new Set(['config.json', '.secret', 'image-cache', 'node_modules']);
fs.rmSync('.next/standalone/skins-site', { recursive: true, force: true });
fs.cpSync('skins-site', '.next/standalone/skins-site', { recursive: true, filter: (src) => !skip.has(path.basename(src)) });
console.log('Standalone panel ready: .next/standalone (run: node server.js)');
