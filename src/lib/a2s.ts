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

interface RawServerInfo {
  name: string;
  map: string;
  players: number;
  maxPlayers: number;
  bots: number;
  ping: number;
  keywords: string;
}

function toServerStatus(info: RawServerInfo): ServerStatus {
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

export async function fetchServerInfo(serverId: number): Promise<ServerStatus> {
  return toServerStatus(await api<RawServerInfo>(`/api/servers/${serverId}/info`));
}

// Drops the panel's RCON connection to this server and polls it again from scratch.
export async function reconnectServer(serverId: number): Promise<ServerStatus> {
  return toServerStatus(await api<RawServerInfo>(`/api/servers/${serverId}/reconnect`, { method: 'POST' }));
}
