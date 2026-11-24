// shared by the browser and the panel server; no imports so it is safe on both

export interface TeamPlayer {
  steamid: string; // SteamID64
  name: string;
}

export interface TeamInput {
  name: string;
  tag: string;
  flag: string; // two-letter country code, empty = none
  players: TeamPlayer[];
}

export const MAX_PLAYERS = 10; // 5 players + subs and coaches

const STEAM64_BASE = BigInt('76561197960265728');

// SteamID64 from SteamID64, STEAM_0:1:123, [U:1:123] or a steamcommunity.com/profiles/ link
export function toSteamId64(input: string): string | null {
  const s = input.trim();
  let m = s.match(/^(?:https?:\/\/)?(?:www\.)?steamcommunity\.com\/profiles\/(\d{17})\/?$/i);
  if (m) return m[1];
  if (/^7656119\d{10}$/.test(s)) return s;
  m = s.match(/^STEAM_[0-5]:([01]):(\d+)$/i);
  if (m) return (STEAM64_BASE + BigInt(m[2]) * BigInt(2) + BigInt(m[1])).toString();
  m = s.match(/^\[?U:1:(\d+)\]?$/i);
  if (m) return (STEAM64_BASE + BigInt(m[1])).toString();
  return null;
}

export function cleanTeam(raw: any): TeamInput | string {
  const name = String(raw?.name ?? '').trim().slice(0, 40);
  if (!name) return 'Нужно название команды';
  const tag = String(raw?.tag ?? '').trim().slice(0, 12);
  const flag = String(raw?.flag ?? '').trim().toUpperCase();
  if (flag && !/^[A-Z]{2}$/.test(flag)) return 'Флаг: двухбуквенный код страны (RU, KZ, UA...)';
  const list = Array.isArray(raw?.players) ? raw.players : [];
  if (list.length > MAX_PLAYERS) return `Не больше ${MAX_PLAYERS} игроков`;
  const players: TeamPlayer[] = [];
  for (const p of list) {
    const steamid = toSteamId64(String(p?.steamid ?? ''));
    if (!steamid) return `Неверный SteamID: ${String(p?.steamid ?? '').slice(0, 40) || '(пусто)'}`;
    if (players.some((x) => x.steamid === steamid)) return `SteamID повторяется: ${steamid}`;
    players.push({ steamid, name: String(p?.name ?? '').trim().slice(0, 32) });
  }
  return { name, tag, flag, players };
}
