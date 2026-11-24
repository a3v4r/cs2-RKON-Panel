import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const file = process.env.SKINS_CONFIG || path.join(root, 'config.json');
if (!fs.existsSync(file)) {
  console.error(`Нет файла настроек ${file}. Скопируйте config.example.json в config.json и заполните его.`);
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));

const port = Number(raw.port ?? 80);
const pluginDir = raw.pluginDir;
if (!pluginDir) {
  console.error('В config.json не указан pluginDir: папка плагина WeaponPaints на сервере.');
  process.exit(1);
}

function loadSecret() {
  if (raw.sessionSecret) return raw.sessionSecret;
  const secretFile = path.join(root, '.secret');
  if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(secretFile, 'utf8').trim();
}

let servers = { mtimeMs: 0, list: [] };
function currentServers() {
  try {
    const { mtimeMs } = fs.statSync(file);
    if (mtimeMs !== servers.mtimeMs) {
      const list = JSON.parse(fs.readFileSync(file, 'utf8')).servers;
      servers = { mtimeMs, list: Array.isArray(list) ? list : [] };
    }
  } catch {
    // mid-write: keep the last good list
  }
  return servers.list;
}

export const config = {
  port,
  host: raw.host ?? '0.0.0.0',
  // https:// makes the cookie Secure
  publicUrl: String(raw.publicUrl ?? (port === 80 ? 'http://localhost' : `http://localhost:${port}`)).replace(/\/+$/, ''),
  database: raw.database ?? path.join(pluginDir, 'weapon_paints.db'),
  dataDir: raw.dataDir ?? path.join(pluginDir, 'data'),
  language: raw.language ?? 'ru',
  // local image mirror, ~1.4 GB
  imageCacheDir: raw.imageCacheDir ?? path.join(root, 'image-cache'),
  // RCON targets for css_wp_reload. Re-read on change: Matchdesk rewrites the file when servers change
  get servers() {
    return currentServers();
  },
  // /auth/dev: any SteamID, localhost only. Testing only
  devLogin: raw.devLogin === true,
  secret: loadSecret(),
};
