import crypto from 'node:crypto';
import { ManagedConfig, servers } from './store';

// Checks the launch settings of a server the panel starts itself; throws a message for the judge
export function parseManaged(raw: any, port: number, selfId?: number): ManagedConfig {
  const tvPort = Number(raw?.tvPort);
  const maxPlayers = Number(raw?.maxPlayers ?? 12);
  const validPort = (p: number) => Number.isInteger(p) && p >= 1024 && p <= 65535;
  if (!validPort(port)) throw new Error('Порт сервера: число от 1024 до 65535');
  if (!validPort(tvPort)) throw new Error('Порт GOTV: число от 1024 до 65535');
  if (tvPort === port) throw new Error('Порт GOTV должен отличаться от порта сервера');
  if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 64) throw new Error('Игроков: от 2 до 64');

  // Servers on this PC must not share ports, or the second one will not start
  for (const other of servers.list()) {
    if (other.id === selfId || !other.managed) continue;
    const taken = [other.port, other.managed.tvPort];
    if (taken.includes(port) || taken.includes(tvPort)) {
      throw new Error(`Порт ${taken.includes(port) ? port : tvPort} уже занят сервером «${other.name}»`);
    }
  }

  const map = String(raw?.map ?? 'de_dust2').trim();
  if (!/^[\w/.-]+$/.test(map)) throw new Error('Карта: только латиница, цифры и _ - / .');
  const bindIp = String(raw?.bindIp ?? '0.0.0.0').trim() || '0.0.0.0';
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(bindIp)) throw new Error('IP: адрес вида 0.0.0.0');

  return {
    tvPort,
    map,
    maxPlayers,
    password: String(raw?.password ?? ''),
    bindIp,
    autoRestart: raw?.autoRestart !== false,
  };
}

export const generatePassword = () => crypto.randomBytes(9).toString('base64url');
