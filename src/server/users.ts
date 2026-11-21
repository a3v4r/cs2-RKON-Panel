import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Role, dataDir } from './accounts';

// Personal accounts (User Management, as in Quatrix), next to the two shared kit accounts judge / broadcast.
// Passwords are kept as scrypt hashes; a session carries a fingerprint of the hash, so changing the
// password or deleting the user ends their sessions.

export interface StoredUser {
  id: number;
  username: string;
  hash: string; // "salt:key", hex
  role: Role;
  created_at: string;
  last_login?: string;
}

const file = () => path.join(dataDir(), 'users.json');

export function listUsers(): StoredUser[] {
  try {
    return JSON.parse(fs.readFileSync(file(), 'utf8')) as StoredUser[];
  } catch {
    return [];
  }
}

function save(items: StoredUser[]) {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(file() + '.tmp', JSON.stringify(items, null, 2));
  fs.renameSync(file() + '.tmp', file());
}

const hashPassword = (password: string) => {
  const salt = crypto.randomBytes(16);
  return `${salt.toString('hex')}:${crypto.scryptSync(password, salt, 32).toString('hex')}`;
};

function verify(password: string, stored: string) {
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;
  const given = crypto.scryptSync(password, Buffer.from(salt, 'hex'), 32);
  return crypto.timingSafeEqual(given, Buffer.from(key, 'hex'));
}

// The shared kit accounts keep their names
const RESERVED = ['judge', 'broadcast'];

function checkUsername(username: string) {
  const name = username.trim();
  if (!/^[\p{L}\p{N}_.-]{2,32}$/u.test(name)) throw new Error('Логин: 2-32 символа, буквы, цифры, _ . -');
  if (RESERVED.includes(name.toLowerCase())) throw new Error('Логины judge и broadcast заняты общими аккаунтами');
  return name;
}

function checkPassword(password: string) {
  if (password.length < 6) throw new Error('Пароль: не короче 6 символов');
  return password;
}

const isRole = (r: unknown): r is Role => r === 'judge' || r === 'broadcast';

export function createUser(username: string, password: string, role: unknown) {
  const name = checkUsername(username);
  if (!isRole(role)) throw new Error('Неизвестная роль');
  const items = listUsers();
  if (items.some((u) => u.username.toLowerCase() === name.toLowerCase())) throw new Error('Такой логин уже есть');
  const user: StoredUser = {
    id: items.reduce((max, u) => Math.max(max, u.id), 0) + 1,
    username: name,
    hash: hashPassword(checkPassword(password)),
    role,
    created_at: new Date().toISOString(),
  };
  save([...items, user]);
  return user;
}

export function updateUser(id: number, update: { role?: unknown; password?: string }) {
  const items = listUsers();
  const user = items.find((u) => u.id === id);
  if (!user) throw new Error('Пользователь не найден');
  if (update.role !== undefined) {
    if (!isRole(update.role)) throw new Error('Неизвестная роль');
    user.role = update.role;
  }
  if (update.password) user.hash = hashPassword(checkPassword(update.password));
  save(items);
  return user;
}

export function deleteUser(id: number) {
  save(listUsers().filter((u) => u.id !== id));
}

export const findUser = (username: string) => listUsers().find((u) => u.username.toLowerCase() === username.trim().toLowerCase());

export function checkLogin(username: string, password: string): StoredUser | null {
  const user = findUser(username);
  if (!user || !verify(password, user.hash)) return null;
  user.last_login = new Date().toISOString();
  save(listUsers().map((u) => (u.id === user.id ? user : u)));
  return user;
}

export const publicUser = ({ hash, ...rest }: StoredUser) => rest;
