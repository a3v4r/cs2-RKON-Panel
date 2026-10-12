import { api } from './api';

export interface ServerStatus {
  name: string;
  map: string;
  players: {
    online: number;
    max: number;
    bots: number;
  };
  ping: number;
  tags: string[];
  keywords: string;
}

export async function fetchServerInfo(serverId: number): Promise<ServerStatus> {
  const info = await api<{ name: string; map: string; players: number; maxPlayers: number; bots: number; ping: number; keywords: string }>(
    `/api/servers/${serverId}/info`,
  );
  return {
    name: info.name,
    map: info.map,
    players: {
      online: Math.max(0, info.players - info.bots),
      max: info.maxPlayers,
      bots: info.bots,
    },
    ping: info.ping,
    tags: info.keywords ? info.keywords.split(',') : [],
    keywords: info.keywords || '',
  };
}
