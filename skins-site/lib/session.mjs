import crypto from 'node:crypto';
import { config } from './config.mjs';

// Login cookie: SteamID + how he logged in, signed. No Max-Age: the browser drops it when closed
// (club PCs are shared). The site also checks on every request that the player is still on the server.
const COOKIE = 'skins_session';
const KINDS = new Set(['game', 'steam', 'dev']);

function sign(data) {
  return crypto.createHmac('sha256', config.secret).update(data).digest('base64url');
}

export function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// { steamId, kind } of the logged-in player, or null
export function readSession(req) {
  const value = parseCookies(req)[COOKIE];
  if (!value) return null;
  const [steamId, kind, mac] = value.split('.');
  if (!steamId || !kind || !mac) return null;
  const expected = Buffer.from(sign(`${steamId}.${kind}`));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  if (!/^\d{17}$/.test(steamId) || !KINDS.has(kind)) return null;
  return { steamId, kind };
}

const attrs = () => `; Path=/; HttpOnly; SameSite=Lax${config.publicUrl.startsWith('https://') ? '; Secure' : ''}`;

export function sessionCookie(steamId, kind) {
  const data = `${steamId}.${kind}`;
  return `${COOKIE}=${data}.${sign(data)}${attrs()}`;
}

export function clearCookie() {
  return `${COOKIE}=${attrs()}; Max-Age=0`;
}
