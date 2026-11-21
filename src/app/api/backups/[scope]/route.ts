import { NextResponse } from 'next/server';
import { JUDGE, audit, requireRole } from '@/server/auth';
import { createBackup, listBackups, saveUpload, Scope, SCOPES, startBackupScheduler } from '@/server/backups';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ scope: string }> };

async function scopeOf(params: Params['params']) {
  const scope = (await params).scope as Scope;
  return SCOPES.includes(scope) ? scope : null;
}

export async function GET(_req: Request, { params }: Params) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const scope = await scopeOf(params);
  if (!scope) return NextResponse.json({ error: 'Неизвестный тип бэкапа' }, { status: 404 });
  startBackupScheduler(); // normally already running from instrumentation
  return NextResponse.json(listBackups(scope));
}

// JSON body: create a backup now. multipart/form-data with "backup": upload an external zip.
export async function POST(req: Request, { params }: Params) {
  const user = await requireRole(JUDGE);
  if (user instanceof NextResponse) return user;
  const scope = await scopeOf(params);
  if (!scope) return NextResponse.json({ error: 'Неизвестный тип бэкапа' }, { status: 404 });
  try {
    if ((req.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('backup');
      if (!(file instanceof File)) return NextResponse.json({ error: 'Нет файла' }, { status: 400 });
      const item = saveUpload(scope, file.name, Buffer.from(await file.arrayBuffer()));
      audit(user, `backup upload ${item.id}`);
      return NextResponse.json(item);
    }
    const item = await createBackup(scope);
    audit(user, `backup create ${item.id}`);
    return NextResponse.json(item);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
