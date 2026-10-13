import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Role, accountPassword, dataDir, roleByLogin } from './accounts';

// Session cookie: base64url(JSON payload) + "." + HMAC. The payload carries a fingerprint of the account's
// current password, so changing a password in settings.ini ends that account's sessions.
export const SESSION_COOKIE = 'cs2panel_session';
const SESSION_DAYS = 30;

export interface SessionUser {
  role: Role;
}

let cachedSecret: Buffer | undefined;
function secret(): Buffer {
  if (cachedSecret) return cachedSecret;
  const file = path.join(dataDir(), 'secret.key');
  try {
    cachedSecret = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex');
  } catch {
    cachedSecret = crypto.randomBytes(32);
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.writeFileSync(file, cachedSecret.toString('hex'));
  }
  return cachedSecret;
}

const hmac = (data: string) => crypto.createHmac('sha256', secret()).update(data).digest('hex');
const fingerprint = (password: string) => hmac('fp:' + password).slice(0, 16);

// Token MatchZy sends with its events (remote log header), one per game server
export const eventToken = (serverId: number) => hmac('events:' + serverId);

// No judge password = development: everyone is a judge without logging in.
export const authDisabled = () => !accountPassword('judge');

function createSession(role: Role): string {
  const payload = Buffer.from(JSON.stringify({
    r: role,
    f: fingerprint(accountPassword(role)),
    exp: Date.now() + SESSION_DAYS * 24 * 3600 * 1000,
  })).toString('base64url');
  return `${payload}.${hmac(payload)}`;
}

export function resolveSession(token: string | undefined): SessionUser | null {
  if (authDisabled()) return { role: 'judge' };
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig || sig.length !== 64) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(hmac(payload)))) return null;

  let data: { r: Role; f: string; exp: number };
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (Date.now() > data.exp || (data.r !== 'judge' && data.r !== 'broadcast')) return null;
  const password = accountPassword(data.r);
  return password && data.f === fingerprint(password) ? { role: data.r } : null;
}

// Checks a login; returns the session token or null.
export function login(username: string, password: string): string | null {
  const role = roleByLogin(username);
  if (!role) return null;
  const expected = accountPassword(role);
  if (!expected || password !== expected) return null; // an account without a password is switched off
  return createSession(role);
}
