import fs from 'node:fs';
import path from 'node:path';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { Role, dataDir } from './accounts';
import { SESSION_COOKIE, SessionUser, resolveSession } from './session';

// Route guard: the current user if their role is allowed, else a 401/403 response to return as is.
export async function requireRole(allowed: Role[]): Promise<SessionUser | NextResponse> {
  const user = resolveSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });
  if (!allowed.includes(user.role)) return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
  return user;
}

export const JUDGE: Role[] = ['judge'];
export const ANY_ROLE: Role[] = ['judge', 'broadcast'];

const ROLE_NAMES: Record<Role, string> = { judge: 'судья', broadcast: 'трансляция' };

// Who did what, for disputes after the match (data/audit.log, one line per action).
export function audit(user: SessionUser, action: string) {
  const line = `${new Date().toISOString()}\t${ROLE_NAMES[user.role]}\t${action.replace(/\s+/g, ' ')}\n`;
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.appendFileSync(path.join(dataDir(), 'audit.log'), line);
  } catch {
    // the log must never break the action itself
  }
}

export function readAudit(limit: number): { time: string; who: string; action: string }[] {
  try {
    return fs.readFileSync(path.join(dataDir(), 'audit.log'), 'utf8').trimEnd().split('\n').slice(-limit).reverse()
      .map((line) => {
        const [time, who, ...action] = line.split('\t');
        return { time, who, action: action.join(' ') };
      });
  } catch {
    return [];
  }
}
