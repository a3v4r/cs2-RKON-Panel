import { api } from './api';

export interface ServerProfile {
  id?: number;
  name: string;
  host: string;
  port: number;
  // Only sent when saving; the panel server never returns it (has_password instead)
  rcon_password: string;
  has_password?: boolean;
  country_code?: string;
  created_at?: string;
  // Set for servers the panel starts itself on its own PC
  managed?: ManagedConfig;
  // Server without MatchZy (Vanilla mode); missing = MatchZy ('matchzy' is only sent to switch back)
  mode?: 'vanilla' | 'matchzy';
}

export interface ManagedConfig {
  tvPort: number;
  map: string;
  maxPlayers: number;
  password: string;
  bindIp: string;
  autoRestart: boolean;
  // Game mode (game_type / game_mode), as the Quatrix "Game Alias"
  gameMode?: GameMode;
  // Workshop map id to start with instead of `map` (host_workshop_map)
  workshopMap?: string;
  gslt?: string; // Game Server Login Token (sv_setsteamaccount)
  vac?: boolean; // false = -insecure
  hibernate?: boolean; // sv_hibernate_when_empty
  tv?: boolean; // tv_enable (GOTV)
  lan?: boolean; // sv_lan
  priority?: Priority; // Windows process priority of cs2.exe
  extraArgs?: string; // more launch arguments
  extraCfg?: string; // more lines for the server cfg
  hideConsole?: boolean; // start cs2.exe without a console window (default: hidden)
}

export const GAME_MODES = ['competitive', 'wingman', 'casual', 'deathmatch', 'armsrace', 'demolition', 'training', 'custom'] as const;
export type GameMode = (typeof GAME_MODES)[number];
export const PRIORITIES = ['Normal', 'AboveNormal', 'High'] as const;
export type Priority = (typeof PRIORITIES)[number];

export type ProcState = 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed';

export interface InstancesInfo {
  cs2Dir: string;
  cs2Found: boolean;
  states: Record<number, { state: ProcState; message?: string; startedAt?: number }>;
}

export const db_helper = {
  getServers: () => api<ServerProfile[]>('/api/servers'),
  addServer: (server: ServerProfile) => api<ServerProfile>('/api/servers', { body: server }),
  updateServer: (id: number, server: Partial<ServerProfile>) => api<ServerProfile>(`/api/servers/${id}`, { method: 'PUT', body: server }),
  deleteServer: (id: number) => api(`/api/servers/${id}`, { method: 'DELETE' }),

  getInstances: () => api<InstancesInfo>('/api/instances'),
  serverProcess: (id: number, action: 'start' | 'stop' | 'restart') => api(`/api/servers/${id}/process`, { body: { action } }),
  getPanelSettings: () => api<{ cs2Dir: string; cs2Found: boolean }>('/api/panel-settings'),
  setPanelSettings: (cs2Dir: string) => api<{ cs2Dir: string; cs2Found: boolean }>('/api/panel-settings', { method: 'PUT', body: { cs2Dir } }),

  getCommands: () => api<any[]>('/api/commands').catch(() => []),
  addCommand: (label: string, command: string) => api('/api/commands', { body: { label, command } }),
  updateCommand: (id: number, label: string, command: string) => api(`/api/commands/${id}`, { method: 'PUT', body: { label, command } }),
  deleteCommand: (id: number) => api(`/api/commands/${id}`, { method: 'DELETE' }),
};
