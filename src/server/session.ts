// Session cookie = HMAC-SHA256 of a fixed label keyed by PANEL_PASSWORD, so changing the password logs everyone out.
// Web Crypto only: this module is also used by the middleware.
export const SESSION_COOKIE = 'cs2panel_session';

export function panelPassword(): string {
  return process.env.PANEL_PASSWORD ?? '';
}

export async function sessionToken(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('cs2-panel-session-v1'));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function isValidSession(cookie: string | undefined): Promise<boolean> {
  const password = panelPassword();
  if (!password) return true; // auth disabled (development)
  if (!cookie) return false;
  return cookie === (await sessionToken(password));
}
