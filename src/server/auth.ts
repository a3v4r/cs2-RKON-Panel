import fs from 'node:fs';
import path from 'node:path';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ADMIN_LOGIN, dataDir } from './accounts';
import { SESSION_COOKIE, SessionUser, resolveSession } from './session';

export async function requireUser(): Promise<SessionUser | NextResponse> {
  const user = resolveSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });
  return user;
}

export function audit(user: SessionUser, action: string) {
  const line = `${new Date().toISOString()}\t${user.name ?? ADMIN_LOGIN}\t${action.replace(/\s+/g, ' ')}\n`;
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.appendFileSync(path.join(dataDir(), 'audit.log'), line);
  } catch {
    // must never break the action
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
