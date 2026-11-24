import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN_LOGIN, adminPassword, dataDir } from './accounts';
import { StoredUser, checkLogin, findUser } from './users';

// cookie: base64url(JSON) + "." + HMAC. payload carries a password fingerprint, so a password change
// (matchdesk.ini or Users page) ends that account's sessions
export const SESSION_COOKIE = 'cs2panel_session';
const SESSION_DAYS = 30;

export interface SessionUser {
  // absent for the shared admin account
  name?: string;
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

// sent by MatchZy in the remote log header
export const eventToken = (serverId: number) => hmac('events:' + serverId);

// no admin password = dev mode, no login
export const authDisabled = () => !adminPassword();

function createSession(user?: StoredUser): string {
  const payload = Buffer.from(JSON.stringify({
    u: user?.username,
    f: fingerprint(user ? user.hash : adminPassword()),
    exp: Date.now() + SESSION_DAYS * 24 * 3600 * 1000,
  })).toString('base64url');
  return `${payload}.${hmac(payload)}`;
}

export function resolveSession(token: string | undefined): SessionUser | null {
  if (authDisabled()) return {};
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig || sig.length !== 64) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(hmac(payload)))) return null;

  // r: legacy role field, 'broadcast' sessions are rejected
  let data: { r?: string; u?: string; f: string; exp: number };
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (Date.now() > data.exp || data.r === 'broadcast') return null;
  if (data.u) {
    const user = findUser(data.u);
    return user && data.f === fingerprint(user.hash) ? { name: user.username } : null;
  }
  const password = adminPassword();
  return password && data.f === fingerprint(password) ? {} : null;
}

export function login(username: string, password: string): string | null {
  const user = checkLogin(username, password);
  if (user) return createSession(user);
  if (username.trim().toLowerCase() !== ADMIN_LOGIN) return null;
  const expected = adminPassword();
  if (!expected || password !== expected) return null;
  return createSession();
}
