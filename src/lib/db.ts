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
}

export interface ManagedConfig {
  tvPort: number;
  map: string;
  maxPlayers: number;
  password: string;
  bindIp: string;
  autoRestart: boolean;
}

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
