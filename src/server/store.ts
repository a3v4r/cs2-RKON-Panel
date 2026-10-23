import fs from 'node:fs';
import path from 'node:path';

// Panel data lives in JSON files next to the server (PANEL_DATA_DIR), shared by everyone who opens the panel.
// `matchzy` and `vanilla` only change which quick actions the panel offers; both talk to the same RCON.
export type ServerMode = 'matchzy' | 'vanilla';

export interface StoredServer {
  id: number;
  name: string;
  host: string;
  port: number;
  rcon_password: string;
  country_code?: string;
  mode: ServerMode;
  created_at: string;
}

export interface StoredCommand {
  id: number;
  label: string;
  command: string;
  created_at: string;
}

const dataDir = () => process.env.PANEL_DATA_DIR || path.join(process.cwd(), 'data');

function read<T>(file: string): T[] {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir(), file), 'utf8')) as T[];
  } catch {
    return [];
  }
}

function write<T>(file: string, items: T[]) {
  fs.mkdirSync(dataDir(), { recursive: true });
  const target = path.join(dataDir(), file);
  fs.writeFileSync(target + '.tmp', JSON.stringify(items, null, 2));
  fs.renameSync(target + '.tmp', target);
}

const nextId = (items: { id: number }[]) => items.reduce((max, i) => Math.max(max, i.id), 0) + 1;

export const servers = {
  list: () => read<StoredServer>('servers.json').sort((a, b) => b.created_at.localeCompare(a.created_at)),
  get: (id: number) => read<StoredServer>('servers.json').find((s) => s.id === id),
  add(data: Omit<StoredServer, 'id' | 'created_at' | 'mode'> & { mode?: ServerMode }) {
    const items = read<StoredServer>('servers.json');
    const server: StoredServer = {
      ...data,
      mode: data.mode === 'vanilla' ? 'vanilla' : 'matchzy',
      id: nextId(items),
      created_at: new Date().toISOString(),
    };
    write('servers.json', [...items, server]);
    return server;
  },
  update(id: number, data: Partial<Omit<StoredServer, 'id' | 'created_at'>>) {
    const items = read<StoredServer>('servers.json');
    const index = items.findIndex((s) => s.id === id);
    if (index < 0) return undefined;
    items[index] = { ...items[index], ...data };
    write('servers.json', items);
    return items[index];
  },
  remove(id: number) {
    write('servers.json', read<StoredServer>('servers.json').filter((s) => s.id !== id));
  },
};

export const commands = {
  list: () => read<StoredCommand>('commands.json').sort((a, b) => b.created_at.localeCompare(a.created_at)),
  add(label: string, command: string) {
    const items = read<StoredCommand>('commands.json');
    const item = { id: nextId(items), label, command, created_at: new Date().toISOString() };
    write('commands.json', [...items, item]);
    return item;
  },
  update(id: number, label: string, command: string) {
    write('commands.json', read<StoredCommand>('commands.json').map((c) => (c.id === id ? { ...c, label, command } : c)));
  },
  remove(id: number) {
    write('commands.json', read<StoredCommand>('commands.json').filter((c) => c.id !== id));
  },
};

// Tournament teams, shared by all judges: chosen from dropdowns instead of being retyped.
// Plain names in the order the judge entered them.
export const teams = {
  list: () => read<string>('teams.json'),
  replace(names: unknown[]) {
    const cleaned: string[] = [];
    const seen = new Set<string>();
    for (const raw of names) {
      const name = String(raw).trim();
      // Empty lines and duplicates (ignoring case) would only clutter the dropdowns
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      cleaned.push(name);
    }
    write('teams.json', cleaned);
    return cleaned;
  },
};

// Without the RCON password: it never leaves the panel server.
export function publicServer({ rcon_password, ...rest }: StoredServer) {
  return { ...rest, mode: rest.mode === 'vanilla' ? 'vanilla' : 'matchzy', has_password: rcon_password !== '' };
}

export interface StoredTemplate {
  id: number;
  name: string;
  message: string;
  created_at: string;
}

// Chat templates, shared by all judges
export const templates = {
  list: () => read<StoredTemplate>('templates.json'),
  add(name: string, message: string) {
    const items = read<StoredTemplate>('templates.json');
    const item = { id: nextId(items), name, message, created_at: new Date().toISOString() };
    write('templates.json', [...items, item]);
    return item;
  },
  remove(id: number) {
    write('templates.json', read<StoredTemplate>('templates.json').filter((t) => t.id !== id));
  },
};

export interface StoredAutoMessage {
  id: number;
  serverId: number;
  message: string;
  intervalMinutes: number;
  enabled: boolean;
  // Interval counts from here after a restart or re-enable
  updated_at: string;
}

// Messages the panel server repeats in a game server's chat (see scheduler.ts)
export const autoMessages = {
  list: () => read<StoredAutoMessage>('auto-messages.json'),
  forServer: (serverId: number) => read<StoredAutoMessage>('auto-messages.json').filter((m) => m.serverId === serverId),
  add(serverId: number, message: string, intervalMinutes: number) {
    const items = read<StoredAutoMessage>('auto-messages.json');
    const item = { id: nextId(items), serverId, message, intervalMinutes, enabled: true, updated_at: new Date().toISOString() };
    write('auto-messages.json', [...items, item]);
    return item;
  },
  setEnabled(id: number, enabled: boolean) {
    write('auto-messages.json', read<StoredAutoMessage>('auto-messages.json').map((m) =>
      m.id === id ? { ...m, enabled, updated_at: new Date().toISOString() } : m));
  },
  remove(id: number) {
    write('auto-messages.json', read<StoredAutoMessage>('auto-messages.json').filter((m) => m.id !== id));
  },
};
