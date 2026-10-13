import { rconCommand } from './rcon';
import { autoMessages, servers } from './store';

// Sends auto-messages on the panel server, so they keep going with every browser closed.
const TICK_MS = 10_000;

const globalForScheduler = globalThis as unknown as { autoMessageTimer?: NodeJS.Timeout; autoMessageLastSent?: Map<number, number> };
const lastSent = (globalForScheduler.autoMessageLastSent ??= new Map<number, number>());

async function tick() {
  const now = Date.now();
  for (const m of autoMessages.list()) {
    if (!m.enabled) continue;
    const since = lastSent.get(m.id) ?? Date.parse(m.updated_at);
    if (now - since < m.intervalMinutes * 60_000) continue;
    lastSent.set(m.id, now);
    const server = servers.get(m.serverId);
    if (!server) continue;
    // An offline server just misses this round; the next interval tries again
    await rconCommand(server.host, server.port, server.rcon_password, `say ${m.message}`).catch(() => {});
  }
}

export function startScheduler() {
  if (globalForScheduler.autoMessageTimer) return;
  globalForScheduler.autoMessageTimer = setInterval(() => { tick().catch(() => {}); }, TICK_MS);
}

// A changed or re-enabled message starts its interval again
export function resetAutoMessage(id: number) {
  lastSent.delete(id);
}
