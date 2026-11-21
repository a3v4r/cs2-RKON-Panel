import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './accounts';
import { queryInfo } from './a2s';
import { rconCommand } from './rcon';
import { StoredServer } from './store';

// Map Explorer (as in Quatrix): workshop maps added by the judges and a config per map and server
// that the panel runs after the map has loaded.

export interface WorkshopMap {
  id: number;
  workshop_id: string;
  map_file?: string;
  name: string;
  image_url?: string;
  created_at: string;
}

const workshopFile = () => path.join(dataDir(), 'workshop-maps.json');

export function listWorkshop(): WorkshopMap[] {
  try {
    return JSON.parse(fs.readFileSync(workshopFile(), 'utf8')) as WorkshopMap[];
  } catch {
    return [];
  }
}

function saveWorkshop(items: WorkshopMap[]) {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(workshopFile() + '.tmp', JSON.stringify(items, null, 2));
  fs.renameSync(workshopFile() + '.tmp', workshopFile());
}

// Title and preview from Steam; on a LAN without internet the map is added under its id
async function steamDetails(workshopId: string): Promise<{ title?: string; preview?: string }> {
  try {
    const body = new URLSearchParams({ itemcount: '1', 'publishedfileids[0]': workshopId });
    const res = await fetch('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(6000),
    });
    const data = await res.json();
    const item = data?.response?.publishedfiledetails?.[0];
    return { title: item?.title, preview: item?.preview_url };
  } catch {
    return {};
  }
}

export async function addWorkshop(workshopId: string, mapFile?: string) {
  const id = workshopId.trim();
  if (!/^\d{4,20}$/.test(id)) throw new Error('Workshop ID: только цифры');
  const file = mapFile?.trim() || undefined;
  if (file && !/^[\w.-]+$/.test(file)) throw new Error('Имя карты: только латиница, цифры и _ - .');
  const items = listWorkshop();
  if (items.some((m) => m.workshop_id === id)) throw new Error('Эта карта уже добавлена');
  const details = await steamDetails(id);
  const item: WorkshopMap = {
    id: items.reduce((max, m) => Math.max(max, m.id), 0) + 1,
    workshop_id: id,
    map_file: file,
    name: details.title || file || id,
    image_url: details.preview,
    created_at: new Date().toISOString(),
  };
  saveWorkshop([...items, item]);
  return item;
}

export function removeWorkshop(id: number) {
  saveWorkshop(listWorkshop().filter((m) => m.id !== id));
}

// --- Config per map and server ---

const safeMap = (map: string) => {
  if (!/^[\w.-]+$/.test(map)) throw new Error('Неверное имя карты');
  return map;
};
const cfgFile = (serverId: number, map: string) => path.join(dataDir(), 'map-cfg', String(serverId), `${safeMap(map)}.cfg`);

export function readMapCfg(serverId: number, map: string) {
  try {
    return fs.readFileSync(cfgFile(serverId, map), 'utf8');
  } catch {
    return '';
  }
}

export function writeMapCfg(serverId: number, map: string, content: string) {
  const file = cfgFile(serverId, map);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

// Commands of a cfg: one per line, // comments and empty lines skipped
const cfgCommands = (content: string) =>
  content.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '').trim()).filter(Boolean);

const g = globalThis as unknown as { mapCfgJobs?: Map<number, NodeJS.Timeout> };
const jobs = (g.mapCfgJobs ??= new Map<number, NodeJS.Timeout>());

// After a map change: wait until A2S reports the new map, then send that map's config over RCON
function applyCfgWhenLoaded(server: StoredServer, map: string) {
  const commands = cfgCommands(readMapCfg(server.id, map));
  const old = jobs.get(server.id);
  if (old) clearTimeout(old);
  if (!commands.length) return;
  const started = Date.now();
  const check = async () => {
    jobs.delete(server.id);
    if (Date.now() - started > 120_000) return;
    const info = await queryInfo(server.host, server.port).catch(() => null);
    const current = info?.map?.toLowerCase() ?? '';
    if (!current.endsWith(map.toLowerCase())) {
      jobs.set(server.id, setTimeout(check, 3000));
      return;
    }
    for (const command of commands) {
      await rconCommand(server.host, server.port, server.rcon_password, command).catch(() => {});
    }
  };
  jobs.set(server.id, setTimeout(check, 5000));
}

// "map de_dust2" or "host_workshop_map <id>"; `map` is the name the map reports once loaded
export async function changeMap(server: StoredServer, target: { map: string; workshopId?: string }) {
  const command = target.workshopId ? `host_workshop_map ${target.workshopId}` : `map ${safeMap(target.map)}`;
  if (target.workshopId && !/^\d+$/.test(target.workshopId)) throw new Error('Неверный Workshop ID');
  const output = await rconCommand(server.host, server.port, server.rcon_password, command);
  applyCfgWhenLoaded(server, target.map);
  return output;
}
