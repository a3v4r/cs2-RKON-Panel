import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dataDir } from './accounts';
import { queryInfo } from './a2s';
import { servers } from './store';
import { systemInfo } from './system';

// System Analytics, as in Quatrix: a snapshot every 5 minutes, kept for 30 days.
// CPU and RAM of the panel PC, and players online over all servers of the panel.

export interface Snapshot {
  t: number;
  cpu: number;
  ram: number;
  players: number;
}

const EVERY_MS = 5 * 60_000;
const KEEP_MS = 30 * 24 * 3600_000;

const file = () => path.join(dataDir(), 'analytics.jsonl');
const g = globalThis as unknown as { analyticsTimer?: NodeJS.Timeout };

async function playersOnline() {
  const counts = await Promise.all(servers.list().map((s) =>
    queryInfo(s.host, s.port).then((i) => Math.max(0, i.players - i.bots)).catch(() => 0)));
  return counts.reduce((a, b) => a + b, 0);
}

async function snapshot() {
  // CPU: average of the last 5 minutes of the background sampler; RAM: now
  const recent = systemInfo().samples.filter((s) => s.t > Date.now() - EVERY_MS);
  const cpu = recent.length ? recent.reduce((a, s) => a + s.cpu, 0) / recent.length : 0;
  const ram = (1 - os.freemem() / os.totalmem()) * 100;
  const snap: Snapshot = { t: Date.now(), cpu: Math.round(cpu * 10) / 10, ram: Math.round(ram * 10) / 10, players: await playersOnline() };
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.appendFileSync(file(), JSON.stringify(snap) + '\n');
  // Drop snapshots older than 30 days once in a while (the file stays below a few MB)
  if (new Date().getMinutes() < 5 && new Date().getHours() === 3) {
    const kept = read().filter((s) => s.t > Date.now() - KEEP_MS);
    fs.writeFileSync(file(), kept.map((s) => JSON.stringify(s)).join('\n') + '\n');
  }
}

function read(): Snapshot[] {
  try {
    return fs.readFileSync(file(), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as Snapshot);
  } catch {
    return [];
  }
}

const RANGES = { '24h': { span: 24 * 3600_000, bucket: 5 * 60_000 }, '7d': { span: 7 * 24 * 3600_000, bucket: 30 * 60_000 }, '30d': { span: KEEP_MS, bucket: 2 * 3600_000 } } as const;
export type Range = keyof typeof RANGES;
export const isRange = (r: string): r is Range => r in RANGES;

// Snapshots of the range, averaged per bucket so a chart has a few hundred points at most
export function analytics(range: Range) {
  const { span, bucket } = RANGES[range];
  const from = Date.now() - span;
  const buckets = new Map<number, Snapshot[]>();
  for (const s of read()) {
    if (s.t < from) continue;
    const key = Math.floor(s.t / bucket) * bucket;
    const list = buckets.get(key) ?? [];
    list.push(s);
    buckets.set(key, list);
  }
  const avg = (list: Snapshot[], k: 'cpu' | 'ram' | 'players') => Math.round((list.reduce((a, s) => a + s[k], 0) / list.length) * 10) / 10;
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([t, list]) => ({ t, cpu: avg(list, 'cpu'), ram: avg(list, 'ram'), players: avg(list, 'players') }));
}

export function startAnalytics() {
  if (g.analyticsTimer) return;
  // first snapshot once the CPU sampler has a few minutes of data
  g.analyticsTimer = setInterval(() => { snapshot().catch(() => {}); }, EVERY_MS);
}
