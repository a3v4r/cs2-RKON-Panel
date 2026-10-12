// Match configs handed to MatchZy via matchzy_loadmatch_url, kept per match id (memory only, like the desktop app).
const globalForMatches = globalThis as unknown as { matchConfigs?: Map<string, string> };
const configs = (globalForMatches.matchConfigs ??= new Map<string, string>());

export function setMatchConfig(id: string, json: string) {
  configs.set(id, json);
}

export function getMatchConfig(id: string): string | undefined {
  return configs.get(id);
}
