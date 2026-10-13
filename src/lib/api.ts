// fetch wrapper for the panel API: JSON in/out, errors as Error(message), 401 -> login page.
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
    throw new Error('нет связи с панелью - она запущена, а устройство в той же сети?');
  }
  if (res.status === 401 && typeof window !== 'undefined') {
    window.location.href = '/login';
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}

export type Role = 'judge' | 'broadcast';

export const ROLE_LABELS: Record<Role, string> = {
  judge: 'Судья',
  broadcast: 'Трансляция',
};

export const fetchMe = () => api<{ role: Role }>('/api/me');

export interface BroadcastRequest {
  id: number;
  serverId: number;
  serverName: string;
  type: 'pause' | 'unpause';
  reason: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  createdAt: string;
  resolvedAt?: string;
}
