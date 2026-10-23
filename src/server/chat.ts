import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './accounts';

// Player chat collected from the game server's log stream (see chat-log.ts).
// Stored on the panel server, so messages keep arriving with every panel tab closed.
export interface ChatMessage {
  id: number;
  at: string;
  author: string;
  steamId: string;
  // CT, T, SPEC or whatever tag the game put in the log ('' when unknown)
  team: string;
  teamOnly: boolean;
  text: string;
  // The panel's own broadcasts and anything else written as Console, not by a player
  console: boolean;
}

const KEPT_PER_SERVER = 500;
// A duplicated log stream (the same logaddress registered twice) delivers every line
// several times in the same moment. A player repeating a message this fast is not a thing.
const DEDUPE_MS = 1500;

const globalForChat = globalThis as unknown as {
  chatMessages?: Map<number, ChatMessage[]>;
  chatLastLine?: Map<string, number>;
};
const messages = (globalForChat.chatMessages ??= new Map<number, ChatMessage[]>());
const lastLine = (globalForChat.chatLastLine ??= new Map<string, number>());

const file = (serverId: number) => path.join(dataDir(), `chat-${serverId}.json`);

function load(serverId: number): ChatMessage[] {
  const cached = messages.get(serverId);
  if (cached) return cached;
  let loaded: ChatMessage[] = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file(serverId), 'utf8'));
    if (Array.isArray(parsed)) loaded = parsed.filter((m): m is ChatMessage => !!m && typeof m.text === 'string');
  } catch {
    // no chat yet
  }
  messages.set(serverId, loaded);
  return loaded;
}

function save(serverId: number, items: ChatMessage[]) {
  messages.set(serverId, items);
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    const target = file(serverId);
    fs.writeFileSync(target + '.tmp', JSON.stringify(items));
    fs.renameSync(target + '.tmp', target);
  } catch {
    // chat is a convenience: never fail the log listener
  }
}

export function getChat(serverId: number, limit = KEPT_PER_SERVER): ChatMessage[] {
  return load(serverId).slice(-limit);
}

export function addChat(serverId: number, message: Omit<ChatMessage, 'id' | 'at'>): ChatMessage | null {
  const text = message.text.trim();
  if (!text) return null;

  // The same chat line arriving from a replayed HTTP log chunk or a duplicated registration
  const key = `${serverId}\u0000${message.author}\u0000${message.steamId}\u0000${message.teamOnly}\u0000${text}`;
  const now = Date.now();
  const previous = lastLine.get(key);
  if (previous != null && now - previous < DEDUPE_MS) return null;
  lastLine.set(key, now);

  const items = load(serverId);
  const item: ChatMessage = {
    id: items.reduce((max, m) => Math.max(max, m.id), 0) + 1,
    at: new Date(now).toISOString(),
    ...message,
    text,
  };
  items.push(item);
  // Keep memory and disk small: a tournament day easily has thousands of lines
  if (items.length > KEPT_PER_SERVER) items.splice(0, items.length - KEPT_PER_SERVER);
  save(serverId, items);
  return item;
}

export function clearChat(serverId: number) {
  save(serverId, []);
  for (const key of lastLine.keys()) {
    if (key.startsWith(`${serverId}\u0000`)) lastLine.delete(key);
  }
}
