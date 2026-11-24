// match configs for matchzy_loadmatch_url, memory only
const globalForMatches = globalThis as unknown as { matchConfigs?: Map<string, string> };
const configs = (globalForMatches.matchConfigs ??= new Map<string, string>());

export function setMatchConfig(id: string, json: string) {
  configs.set(id, json);
}

export function getMatchConfig(id: string): string | undefined {
  return configs.get(id);
}
