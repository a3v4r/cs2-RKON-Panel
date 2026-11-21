import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './accounts';

// Panel-wide settings judges change in the interface (data/settings.json)
export interface PanelSettings {
  cs2Dir?: string;
}

const file = () => path.join(dataDir(), 'settings.json');

export function readSettings(): PanelSettings {
  try {
    return JSON.parse(fs.readFileSync(file(), 'utf8')) as PanelSettings;
  } catch {
    return {};
  }
}

export function writeSettings(update: PanelSettings) {
  const next = { ...readSettings(), ...update };
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(file() + '.tmp', JSON.stringify(next, null, 2));
  fs.renameSync(file() + '.tmp', file());
  return next;
}

// Folder of the CS2 dedicated server: the one set in the panel, else CS2_DIR, else the tournament kit default
export function cs2Dir() {
  return readSettings().cs2Dir || process.env.CS2_DIR || 'C:\\cs2server\\cs2';
}

export function cs2Paths(dir = cs2Dir()) {
  const game = path.join(dir, 'game');
  const csgo = path.join(game, 'csgo');
  return {
    dir,
    csgo,
    exe: path.join(game, 'bin', 'win64', 'cs2.exe'),
    gameinfo: path.join(csgo, 'gameinfo.gi'),
  };
}
