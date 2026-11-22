import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN_LOGIN, adminPassword, dataDir } from './accounts';
import { StoredUser, checkLogin, findUser } from './users';

// Session cookie: base64url(JSON payload) + "." + HMAC. The payload carries a fingerprint of the account's
// current password, so changing a password (matchdesk.ini or the Users page) ends that account's sessions.
export const SESSION_COOKIE = 'cs2panel_session';
const SESSION_DAYS = 30;

export interface SessionUser {
  // Personal account (Users page); absent for the shared account admin
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

// Token MatchZy sends with its events (remote log header), one per game server
export const eventToken = (serverId: number) => hmac('events:' + serverId);

// No admin password = development: everyone is in without logging in.
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

  // r: the role of sessions made before roles were dropped; the broadcast ones are no longer valid
  let data: { r?: string; u?: string; f: string; exp: number };
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (Date.now() > data.exp || data.r === 'broadcast') return null;
  if (data.u) {
    // A personal account: still there and with the same password
    const user = findUser(data.u);
    return user && data.f === fingerprint(user.hash) ? { name: user.username } : null;
  }
  const password = adminPassword();
  return password && data.f === fingerprint(password) ? {} : null;
}

// Checks a login; returns the session token or null.
export function login(username: string, password: string): string | null {
  const user = checkLogin(username, password);
  if (user) return createSession(user);
  if (username.trim().toLowerCase() !== ADMIN_LOGIN) return null;
  const expected = adminPassword();
  if (!expected || password !== expected) return null;
  return createSession();
}
