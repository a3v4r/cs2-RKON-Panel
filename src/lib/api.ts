// fetch wrapper for the panel API: JSON in/out, errors as Error(message), 401 -> login page.
import { tNow } from '@/lib/i18n';

export async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init?.method ?? (init?.body !== undefined ? 'POST' : 'GET'),
      headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
    });
  } catch {
    // The panel server itself is not reachable (stopped, or the phone left the network)
    throw new Error(tNow('нет связи с панелью - она запущена, а устройство в той же сети?', 'no connection to the panel - is it running and is this device on the same network?'));
  }
  if (res.status === 401 && typeof window !== 'undefined') {
    window.location.href = '/login';
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}

// Logged-in user: name of a personal account, absent for the shared account admin
export const fetchMe = () => api<{ name?: string }>('/api/me');
