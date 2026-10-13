import path from 'node:path';

// Two shared accounts: the judges (organisers, full access) and the broadcast team.
// Passwords come from the environment, so they are set in one place (settings.ini of the tournament kit).
export type Role = 'judge' | 'broadcast';

export const ACCOUNTS: Record<Role, { login: string; passwordEnv: string }> = {
  judge: { login: 'judge', passwordEnv: 'PANEL_PASSWORD' },
  broadcast: { login: 'broadcast', passwordEnv: 'BROADCAST_PASSWORD' },
};

export const accountPassword = (role: Role) => process.env[ACCOUNTS[role].passwordEnv] ?? '';

export function roleByLogin(login: string): Role | undefined {
  const name = login.trim().toLowerCase();
  return (Object.keys(ACCOUNTS) as Role[]).find((r) => ACCOUNTS[r].login === name);
}

export const dataDir = () => process.env.PANEL_DATA_DIR || path.join(process.cwd(), 'data');
