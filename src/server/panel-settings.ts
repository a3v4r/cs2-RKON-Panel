import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './accounts';
import type { AgentSettings } from './agent';

// Panel-wide settings judges change in the interface (data/settings.json)
export interface PanelSettings {
  cs2Dir?: string;
  steamcmd?: string;
  panelName?: string;
  defaultPort?: number;
  // Name before the plugins' chat messages, see chat-prefix.ts
  chatPrefix?: string;
  // Plugins update by themselves (on unless set to false), see plugins.ts
  pluginAutoUpdate?: boolean;
  // Skins website for players, run by the panel (on unless enabled is false), see skins-site.ts
  skinsSite?: { enabled?: boolean; port?: number };
  // Connection of the Agent tab (OpenAI-compatible API), see agent.ts
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

// Folder of the CS2 dedicated server: the one set in the panel, else CS2_DIR, else the tournament kit default
export function cs2Dir() {
  return readSettings().cs2Dir || process.env.CS2_DIR || 'C:\\cs2server\\cs2';
}

export function cs2Paths(dir = cs2Dir()) {
  const game = path.join(dir, 'game');
  const csgo = path.join(game, 'csgo');
  return {
    dir,
    // The kit puts steamcmd next to the server: INSTALL_DIR\steamcmd and INSTALL_DIR\cs2
    steamcmd: readSettings().steamcmd || process.env.STEAMCMD || path.join(path.dirname(dir), 'steamcmd', 'steamcmd.exe'),
    csgo,
    exe: path.join(game, 'bin', 'win64', 'cs2.exe'),
    gameinfo: path.join(csgo, 'gameinfo.gi'),
  };
}
