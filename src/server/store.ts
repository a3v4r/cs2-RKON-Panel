import fs from 'node:fs';
import path from 'node:path';

// Panel data lives in JSON files next to the server (PANEL_DATA_DIR), shared by everyone who opens the panel.
export interface StoredServer {
  id: number;
  name: string;
  host: string;
  port: number;
  rcon_password: string;
  country_code?: string;
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
  add(data: Omit<StoredServer, 'id' | 'created_at'>) {
    const items = read<StoredServer>('servers.json');
    const server = { ...data, id: nextId(items), created_at: new Date().toISOString() };
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

// Without the RCON password: it never leaves the panel server.
export function publicServer({ rcon_password, ...rest }: StoredServer) {
  return { ...rest, has_password: rcon_password !== '' };
}
