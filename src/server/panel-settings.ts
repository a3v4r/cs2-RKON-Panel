import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './accounts';
import type { AgentSettings } from './agent';

export interface PanelSettings {
  cs2Dir?: string;
  steamcmd?: string;
  panelName?: string;
  defaultPort?: number;
  chatPrefix?: string;
  // on unless false, see plugins.ts
  pluginAutoUpdate?: boolean;
  // on unless enabled is false, see skins-site.ts
  skinsSite?: { enabled?: boolean; port?: number };
  agent?: AgentSettings;
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

// panel setting, else CS2_DIR, else the kit default
export function cs2Dir() {
  return readSettings().cs2Dir || process.env.CS2_DIR || 'C:\\cs2server\\cs2';
}

export function cs2Paths(dir = cs2Dir()) {
  const game = path.join(dir, 'game');
  const csgo = path.join(game, 'csgo');
  return {
    dir,
    // kit layout: INSTALL_DIR\steamcmd next to INSTALL_DIR\cs2
    steamcmd: readSettings().steamcmd || process.env.STEAMCMD || path.join(path.dirname(dir), 'steamcmd', 'steamcmd.exe'),
    csgo,
    exe: path.join(game, 'bin', 'win64', 'cs2.exe'),
    gameinfo: path.join(csgo, 'gameinfo.gi'),
  };
}
