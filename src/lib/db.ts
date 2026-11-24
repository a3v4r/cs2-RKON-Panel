import { api } from './api';

export interface ServerProfile {
  id?: number;
  name: string;
  host: string;
  port: number;
  // only sent when saving; the server returns has_password instead
  rcon_password: string;
  has_password?: boolean;
  country_code?: string;
  created_at?: string;
  managed?: ManagedConfig;
  // missing = MatchZy ('matchzy' only sent to switch back)
  mode?: 'vanilla' | 'matchzy';
}

export interface ManagedConfig {
  tvPort: number;
  map: string;
  maxPlayers: number;
  password: string;
  bindIp: string;
  autoRestart: boolean;
  // game_type / game_mode
  gameMode?: GameMode;
  // host_workshop_map, used instead of `map`
  workshopMap?: string;
  gslt?: string; // sv_setsteamaccount
  vac?: boolean; // false = -insecure
  hibernate?: boolean; // sv_hibernate_when_empty
  tv?: boolean; // tv_enable (GOTV)
  lan?: boolean; // sv_lan
  priority?: Priority; // Windows process priority of cs2.exe
  extraArgs?: string;
  extraCfg?: string;
  hideConsole?: boolean; // hidden by default
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
