import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { lanAddresses, primaryAddress } from '@/server/network';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json({
    ip: await primaryAddress(),
    addresses: lanAddresses(),
    port: Number(process.env.PORT || 3000),
  });
}
