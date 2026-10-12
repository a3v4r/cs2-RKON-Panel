import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type Role = 'admin' | 'referee' | 'broadcast';
export const ROLES: Role[] = ['admin', 'referee', 'broadcast'];

// The built-in "admin" account uses PANEL_PASSWORD and always works (recovery login); it is not stored here.
export const BUILTIN_ADMIN = 'admin';

export interface StoredUser {
  id: number;
  username: string;
  role: Role;
  password_hash: string;
  created_at: string;
}

export const dataDir = () => process.env.PANEL_DATA_DIR || path.join(process.cwd(), 'data');
const usersFile = () => path.join(dataDir(), 'users.json');

function read(): StoredUser[] {
  try {
    return JSON.parse(fs.readFileSync(usersFile(), 'utf8')) as StoredUser[];
  } catch {
    return [];
  }
}

function write(users: StoredUser[]) {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(usersFile() + '.tmp', JSON.stringify(users, null, 2));
  fs.renameSync(usersFile() + '.tmp', usersFile());
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function checkPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

export const users = {
  list: () => read().map(({ password_hash, ...u }) => u),
  find: (username: string) => read().find((u) => u.username.toLowerCase() === username.toLowerCase()),
  verify(username: string, password: string): StoredUser | undefined {
    const user = users.find(username);
    return user && checkPassword(password, user.password_hash) ? user : undefined;
  },
  add(username: string, password: string, role: Role) {
    const all = read();
    if (username.toLowerCase() === BUILTIN_ADMIN || all.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      throw new Error('Такой логин уже занят');
    }
    const user: StoredUser = {
      id: all.reduce((max, u) => Math.max(max, u.id), 0) + 1,
      username,
      role,
      password_hash: hashPassword(password),
      created_at: new Date().toISOString(),
    };
    write([...all, user]);
    return user;
  },
  update(id: number, data: { password?: string; role?: Role }) {
    write(read().map((u) => (u.id !== id ? u : {
      ...u,
      role: data.role ?? u.role,
      password_hash: data.password ? hashPassword(data.password) : u.password_hash,
    })));
  },
  remove(id: number) {
    write(read().filter((u) => u.id !== id));
  },
};
