import fs from 'node:fs';
import path from 'node:path';
import { cs2Paths } from './panel-settings';

// Problems WeaponPaints reports in its own log (addons/counterstrikesharp/logs/log-WeaponPaints*.txt), shown on the
// Plugins tab so nobody has to read the log:
// - "Skins are not applied": a native call failed, almost always gamedata/weaponpaints.json out of date after a CS2
//   update. Counted only after the gamedata file last changed, so a plugin update with new gamedata clears it.
// - "Skins will not be applied": FollowCS2ServerGuidelines is on. The panel turns it off before each start, so this
//   only shows for a server started some other way; counted after core.json last changed.

const FILES = 5; // the plugin starts a new file on every load
const TAIL = 256 * 1024;
const CACHE_MS = 30_000;

export interface WeaponPaintsProblem {
  kind: 'gamedata' | 'guidelines';
  at: string; // ISO time of the log line
  detail: string;
}

const g = globalThis as unknown as { wpHealth?: { at: number; problem: WeaponPaintsProblem | null } };

function tail(file: string) {
  const size = fs.statSync(file).size;
  const fd = fs.openSync(file, 'r');
  try {
    const length = Math.min(size, TAIL);
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, size - length);
    return buf.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

const mtime = (file: string) => {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
};

// "2026-11-22 21:46:06.514 +01:00 [EROR] plugin:WeaponPaints Skins are not applied: ..."
const LINE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?) ([+-]\d{2}:\d{2}) \[\w+\] plugin:WeaponPaints (Skins (?:are|will) not (?:be )?applied.*)$/;

function scan(): WeaponPaintsProblem | null {
  const css = path.join(cs2Paths().csgo, 'addons', 'counterstrikesharp');
  const logs = path.join(css, 'logs');
  let files: string[];
  try {
    files = fs.readdirSync(logs).filter((f) => /^log-WeaponPaints.*\.txt$/i.test(f)).map((f) => path.join(logs, f));
  } catch {
    return null;
  }
  files = files.sort((a, b) => mtime(b) - mtime(a)).slice(0, FILES);

  const since = {
    gamedata: mtime(path.join(css, 'gamedata', 'weaponpaints.json')),
    guidelines: mtime(path.join(css, 'configs', 'core.json')),
  };
  let found: WeaponPaintsProblem | null = null;
  for (const file of files) {
    for (const line of tail(file).split(/\r?\n/)) {
      const m = LINE.exec(line.trim());
      if (!m) continue;
      const time = Date.parse(`${m[1]}T${m[2]}${m[3]}`);
      const kind = m[4].startsWith('Skins are') ? 'gamedata' : 'guidelines';
      if (!Number.isFinite(time) || time <= since[kind]) continue;
      if (!found || time > Date.parse(found.at)) found = { kind, at: new Date(time).toISOString(), detail: m[4] };
    }
  }
  return found;
}

export function weaponPaintsProblem(): WeaponPaintsProblem | null {
  if (g.wpHealth && Date.now() - g.wpHealth.at < CACHE_MS) return g.wpHealth.problem;
  let problem: WeaponPaintsProblem | null = null;
  try {
    problem = scan();
  } catch {
    // an unreadable log is not worth an error on the page
  }
  g.wpHealth = { at: Date.now(), problem };
  return problem;
}
