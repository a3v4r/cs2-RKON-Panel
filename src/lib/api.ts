// fetch wrapper for the panel API: JSON in/out, errors as Error(message), 401 -> login page.
export async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? (init?.body !== undefined ? 'POST' : 'GET'),
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  if (res.status === 401 && typeof window !== 'undefined') {
    window.location.href = '/login';
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}

export type Role = 'admin' | 'referee' | 'broadcast';

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Админ',
  referee: 'Судья',
  broadcast: 'Трансляция',
};

export const fetchMe = () => api<{ username: string; role: Role }>('/api/me');
