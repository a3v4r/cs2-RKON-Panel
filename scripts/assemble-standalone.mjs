// After `next build`: copy static assets into .next/standalone so the folder runs on its own (`node server.js`).
import fs from 'node:fs';

fs.rmSync('.next/standalone/.next/static', { recursive: true, force: true });
fs.cpSync('.next/static', '.next/standalone/.next/static', { recursive: true });
if (fs.existsSync('public')) fs.cpSync('public', '.next/standalone/public', { recursive: true });
console.log('Standalone panel ready: .next/standalone (run: node server.js)');
