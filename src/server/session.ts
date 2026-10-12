import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { BUILTIN_ADMIN, Role, dataDir, users } from './users';

// Session cookie: base64url(JSON payload) + "." + HMAC. The payload carries a fingerprint of the user's current
// password (or PANEL_PASSWORD for the built-in admin), so a password change, role change or deletion ends the session.
export const SESSION_COOKIE = 'cs2panel_session';
const SESSION_DAYS = 30;

export interface SessionUser {
  username: string;
  role: Role;
}

export function panelPassword(): string {
  return process.env.PANEL_PASSWORD ?? '';
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
const fingerprint = (credential: string) => hmac('fp:' + credential).slice(0, 16);

// Login is not needed at all only when nothing is configured (development).
export function authDisabled(): boolean {
  return !panelPassword() && users.list().length === 0;
}

export function createSession(username: string, credential: string): string {
  const payload = Buffer.from(JSON.stringify({
    u: username,
    f: fingerprint(credential),
    exp: Date.now() + SESSION_DAYS * 24 * 3600 * 1000,
  })).toString('base64url');
  return `${payload}.${hmac(payload)}`;
}

export function resolveSession(token: string | undefined): SessionUser | null {
  if (authDisabled()) return { username: BUILTIN_ADMIN, role: 'admin' };
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig || sig.length !== 64) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(hmac(payload)))) return null;

  let data: { u: string; f: string; exp: number };
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (Date.now() > data.exp) return null;

  if (data.u === BUILTIN_ADMIN) {
    const pw = panelPassword();
    return pw && data.f === fingerprint(pw) ? { username: BUILTIN_ADMIN, role: 'admin' } : null;
  }
  const user = users.find(data.u);
  return user && data.f === fingerprint(user.password_hash) ? { username: user.username, role: user.role } : null;
}

// Checks a login; returns the session token or null.
export function login(username: string, password: string): string | null {
  const name = username.trim();
  if (!name) return null;
  if (name.toLowerCase() === BUILTIN_ADMIN) {
    const pw = panelPassword();
    if (pw ? password === pw : authDisabled()) return createSession(BUILTIN_ADMIN, pw);
    return null;
  }
  const user = users.verify(name, password);
  return user ? createSession(user.username, user.password_hash) : null;
}
