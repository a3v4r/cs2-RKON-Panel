// Broadcast team's requests to the judges ("pause, please" / "we are ready, continue"), kept in memory.
export type RequestType = 'pause' | 'unpause';
export type RequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export interface BroadcastRequest {
  id: number;
  serverId: number;
  serverName: string;
  type: RequestType;
  reason: string;
  status: RequestStatus;
  createdAt: string;
  resolvedAt?: string;
}

const KEEP = 50;
const globalForRequests = globalThis as unknown as { broadcastRequests?: { list: BroadcastRequest[]; nextId: number } };
const state = (globalForRequests.broadcastRequests ??= { list: [], nextId: 1 });

export const requests = {
  list: () => [...state.list].reverse(),
  get: (id: number) => state.list.find((r) => r.id === id),
  pendingFor: (serverId: number) => state.list.find((r) => r.serverId === serverId && r.status === 'pending'),
  latestFor: (serverId: number) => [...state.list].reverse().find((r) => r.serverId === serverId),

  create(serverId: number, serverName: string, type: RequestType, reason: string): BroadcastRequest {
    const request: BroadcastRequest = {
      id: state.nextId++,
      serverId,
      serverName,
      type,
      reason,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    state.list.push(request);
    if (state.list.length > KEEP) state.list.splice(0, state.list.length - KEEP);
    return request;
  },

  resolve(id: number, status: Exclude<RequestStatus, 'pending'>) {
    const request = requests.get(id);
    if (request) {
      request.status = status;
      request.resolvedAt = new Date().toISOString();
    }
    return request;
  },
};
