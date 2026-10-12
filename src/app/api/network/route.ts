import { NextResponse } from 'next/server';
import { lanAddresses, primaryAddress } from '@/server/network';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ip: await primaryAddress(),
    addresses: lanAddresses(),
    port: Number(process.env.PORT || 3000),
  });
}
