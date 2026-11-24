import path from 'node:path';

// shared "admin" account, password from env (matchdesk.ini next to Matchdesk.exe)
export const ADMIN_LOGIN = 'admin';
export const adminPassword = () => process.env.PANEL_PASSWORD ?? '';

export const dataDir = () => process.env.PANEL_DATA_DIR || path.join(process.cwd(), 'data');
