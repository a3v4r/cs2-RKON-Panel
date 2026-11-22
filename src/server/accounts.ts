import path from 'node:path';

// The shared account "admin": its password comes from the environment (matchdesk.ini next to Matchdesk.exe).
// More people get personal accounts on the Users page; everyone has full access.
export const ADMIN_LOGIN = 'admin';
export const adminPassword = () => process.env.PANEL_PASSWORD ?? '';

export const dataDir = () => process.env.PANEL_DATA_DIR || path.join(process.cwd(), 'data');
