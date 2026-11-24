import fs from 'node:fs';
import { NextResponse } from 'next/server';
import { audit, requireUser } from '@/server/auth';
import { backupPath, deleteBackup, restoreBackup } from '@/server/backups';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ scope: string; name: string }> };

const idOf = async (params: Params['params']) => {
  const { scope, name } = await params;
  return `${scope}/${name}`;
};

export async function GET(_req: Request, { params }: Params) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  try {
    const { file } = backupPath(await idOf(params));
    const data = fs.readFileSync(file);
    return new NextResponse(data, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${(await params).name}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Бэкап не найден' }, { status: 404 });
  }
}

export async function POST(_req: Request, { params }: Params) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const id = await idOf(params);
  try {
    await restoreBackup(id);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
  audit(user, `backup restore ${id}`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const id = await idOf(params);
  try {
    deleteBackup(id);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  audit(user, `backup delete ${id}`);
  return NextResponse.json({ ok: true });
}
