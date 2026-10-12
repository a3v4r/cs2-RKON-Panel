// Servers the broadcast role has paused (in memory). The broadcast role may lift only these pauses,
// never a technical pause of the players or a referee's pause.
const globalForPauses = globalThis as unknown as { broadcastPauses?: Set<number> };
const broadcastPauses = (globalForPauses.broadcastPauses ??= new Set<number>());

export const pauses = {
  markBroadcast: (serverId: number) => broadcastPauses.add(serverId),
  clear: (serverId: number) => broadcastPauses.delete(serverId),
  isBroadcast: (serverId: number) => broadcastPauses.has(serverId),
};
