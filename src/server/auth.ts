import fs from 'node:fs';
import path from 'node:path';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ADMIN_LOGIN, dataDir } from './accounts';
import { SESSION_COOKIE, SessionUser, resolveSession } from './session';

// Route guard: the logged-in user, else a 401 response to return as is. Everyone who is in has full access.
export async function requireUser(): Promise<SessionUser | NextResponse> {
  const user = resolveSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });
  return user;
}

// Who did what, for disputes after the match (data/audit.log, one line per action).
export function audit(user: SessionUser, action: string) {
  // A personal account is logged by its name, the shared one as admin
  const line = `${new Date().toISOString()}\t${user.name ?? ADMIN_LOGIN}\t${action.replace(/\s+/g, ' ')}\n`;
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
