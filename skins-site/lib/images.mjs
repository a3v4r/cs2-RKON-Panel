import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';

// Item pictures from the plugin data live in one GitHub folder. The site keeps a copy on disk and
// serves it at /img/<file>, so players in the LAN do not wait for GitHub; the in-game menu uses it too.
const UPSTREAM = 'https://raw.githubusercontent.com/Nereziel/cs2-WeaponPaints/main/website/img/skins/';
const NAME_RE = /^[a-z0-9_-]+\.png$/i;

fs.mkdirSync(config.imageCacheDir, { recursive: true });

const fileOf = (name) => path.join(config.imageCacheDir, name);
const inFlight = new Map(); // name -> Promise<Buffer>

// GitHub address -> address on this site; anything else stays as it is
export function localImage(url) {
  if (typeof url !== 'string' || !url.startsWith(UPSTREAM)) return url ?? '';
  const name = url.slice(UPSTREAM.length);
  return NAME_RE.test(name) ? `/img/${name}` : url;
}

export const imageName = (localUrl) => localUrl.startsWith('/img/') ? localUrl.slice(5) : null;

async function download(name) {
  const res = await fetch(UPSTREAM + name, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`GitHub ответил ${res.status}`);
  const data = Buffer.from(await res.arrayBuffer());
  const tmp = `${fileOf(name)}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, fileOf(name));
  return data;
}

// Picture from disk, or fetched from GitHub once and kept
export function getImage(name) {
  if (!NAME_RE.test(name)) return Promise.resolve(null);
  try {
    return Promise.resolve(fs.readFileSync(fileOf(name)));
  } catch {
    // not cached yet
  }
  if (!inFlight.has(name)) {
    inFlight.set(name, download(name).finally(() => inFlight.delete(name)));
  }
  return inFlight.get(name);
}

// Fetch in the background everything that is not on disk yet
export async function prefetchImages(names) {
  const missing = [...new Set(names)].filter((n) => NAME_RE.test(n) && !fs.existsSync(fileOf(n)));
  if (missing.length === 0) {
    console.log(`Картинки: все ${names.length} уже на диске (${config.imageCacheDir})`);
    return;
  }
  console.log(`Картинки: докачиваю ${missing.length} из ${names.length} в ${config.imageCacheDir}`);
  let next = 0;
  let done = 0;
  let failed = 0;
  const worker = async () => {
    while (next < missing.length) {
      const name = missing[next++];
      try {
        await getImage(name);
        done++;
      } catch {
        failed++;
        // No internet: stop instead of waiting out every timeout
        if (done === 0 && failed >= 20) next = missing.length;
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  if (done === 0 && failed >= 20) {
    console.warn('Картинки: GitHub недоступен, докачаю, когда появится интернет (при открытии или перезапуске сайта)');
  } else {
    console.log(`Картинки: скачано ${done}${failed ? `, не удалось ${failed}` : ''}`);
  }
}
