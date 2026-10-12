import { api } from './api';

export async function sendRconCommand(serverId: number, command: string): Promise<string> {
  const { output } = await api<{ output: string }>(`/api/servers/${serverId}/rcon`, { body: { command } });
  return output;
}
