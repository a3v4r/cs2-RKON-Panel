// Name and avatar from the public profile; cached, the page works without them
const profiles = new Map();
const PROFILE_TTL_MS = 3600_000;

function cdata(xml, tag) {
  const m = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`).exec(xml);
  return m ? m[1] : null;
}

export async function steamProfile(steamId) {
  const cached = profiles.get(steamId);
  if (cached && Date.now() - cached.at < PROFILE_TTL_MS) return cached.profile;
  let profile = { name: null, avatar: null };
  try {
    const res = await fetch(`https://steamcommunity.com/profiles/${steamId}/?xml=1`, { signal: AbortSignal.timeout(5000) });
    const xml = await res.text();
    const avatar = cdata(xml, 'avatarMedium');
    profile = { name: cdata(xml, 'steamID'), avatar: avatar?.startsWith('https://') ? avatar : null };
  } catch {
    // Steam is slow or down: show the SteamID instead
  }
  profiles.set(steamId, { at: Date.now(), profile });
  return profile;
}
