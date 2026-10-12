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
}

export const db_helper = {
  getServers: () => api<ServerProfile[]>('/api/servers'),
  addServer: (server: ServerProfile) => api<ServerProfile>('/api/servers', { body: server }),
  updateServer: (id: number, server: Partial<ServerProfile>) => api<ServerProfile>(`/api/servers/${id}`, { method: 'PUT', body: server }),
  deleteServer: (id: number) => api(`/api/servers/${id}`, { method: 'DELETE' }),

  getCommands: () => api<any[]>('/api/commands').catch(() => []),
  addCommand: (label: string, command: string) => api('/api/commands', { body: { label, command } }),
  updateCommand: (id: number, label: string, command: string) => api(`/api/commands/${id}`, { method: 'PUT', body: { label, command } }),
  deleteCommand: (id: number) => api(`/api/commands/${id}`, { method: 'DELETE' }),
};
