import crypto from 'node:crypto';
import { GAME_MODES, GameMode, ManagedConfig, PRIORITIES, Priority, servers } from './store';

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
  const workshopMap = String(raw?.workshopMap ?? '').trim();
  if (workshopMap && !/^\d{4,20}$/.test(workshopMap)) throw new Error('Карта из Workshop: только цифры ID');
  const bindIp = String(raw?.bindIp ?? '0.0.0.0').trim() || '0.0.0.0';
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(bindIp)) throw new Error('IP: адрес вида 0.0.0.0');

  const gameMode = (GAME_MODES as readonly string[]).includes(raw?.gameMode) ? (raw.gameMode as GameMode) : 'competitive';
  const priority = (PRIORITIES as readonly string[]).includes(raw?.priority) ? (raw.priority as Priority) : 'Normal';
  const gslt = String(raw?.gslt ?? '').trim();
  if (gslt && !/^[A-Fa-f0-9]{32}$/.test(gslt)) throw new Error('GSLT: 32 символа 0-9 и A-F (выдаётся на steamcommunity.com/dev/managegameservers)');
  // Passed to cs2.exe inside a quoted PowerShell string: one line, no quotes of either kind
  const extraArgs = String(raw?.extraArgs ?? '').trim();
  if (/[\r\n'"`]/.test(extraArgs)) throw new Error('Дополнительные аргументы: одна строка без кавычек');
  const extraCfg = String(raw?.extraCfg ?? '').replace(/\r/g, '').slice(0, 4000);

  return {
    tvPort,
    map,
    workshopMap: workshopMap || undefined,
    maxPlayers,
    password: String(raw?.password ?? ''),
    bindIp,
    autoRestart: raw?.autoRestart !== false,
    gameMode,
    gslt: gslt || undefined,
    vac: raw?.vac !== false,
    hibernate: raw?.hibernate === true,
    tv: raw?.tv !== false,
    lan: raw?.lan !== false,
    priority,
    extraArgs: extraArgs || undefined,
    extraCfg: extraCfg.trim() || undefined,
  };
}

// Address the panel reaches a server on this PC at: a server bound to one IP does not answer on 127.0.0.1
export const managedHost = (m: ManagedConfig) => (m.bindIp && m.bindIp !== '0.0.0.0' ? m.bindIp : '127.0.0.1');

export const generatePassword =() => crypto.randomBytes(9).toString('base64url');
