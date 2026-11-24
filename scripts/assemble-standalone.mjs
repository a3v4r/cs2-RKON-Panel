// next build leaves static/ and public/ out of .next/standalone
import fs from 'node:fs';
import path from 'node:path';

fs.rmSync('.next/standalone/.next/static', { recursive: true, force: true });
fs.cpSync('.next/static', '.next/standalone/.next/static', { recursive: true });
if (fs.existsSync('public')) fs.cpSync('public', '.next/standalone/public', { recursive: true });
// skins site, minus its local config, secret and cache
const skip = new Set(['config.json', '.secret', 'image-cache', 'node_modules']);
fs.rmSync('.next/standalone/skins-site', { recursive: true, force: true });
fs.cpSync('skins-site', '.next/standalone/skins-site', { recursive: true, filter: (src) => !skip.has(path.basename(src)) });
console.log('Standalone panel ready: .next/standalone (run: node server.js)');
