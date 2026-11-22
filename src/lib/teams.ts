import { api } from './api';
import type { TeamInput } from './team-rules';

export { toSteamId64, MAX_PLAYERS } from './team-rules';
export type { TeamPlayer, TeamInput } from './team-rules';

export interface Team extends TeamInput {
  id: number;
  created_at: string;
}

export const teamsApi = {
  list: () => api<Team[]>('/api/teams'),
  add: (team: TeamInput) => api<Team>('/api/teams', { body: team }),
  update: (id: number, team: TeamInput) => api<Team>(`/api/teams/${id}`, { method: 'PUT', body: team }),
  remove: (id: number) => api(`/api/teams/${id}`, { method: 'DELETE' }),
};

