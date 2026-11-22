// Login through Steam (OpenID 2.0): no API key needed
const OP = 'https://steamcommunity.com/openid/login';
const ID_RE = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

export function loginUrl(returnTo, realm) {
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': realm,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });
  return `${OP}?${params}`;
}

// Asks Steam whether the answer the browser brought back is genuine; returns the SteamID64
export async function verifyLogin(query, returnTo) {
  if (query.get('openid.mode') !== 'id_res') return null;
  if (query.get('openid.op_endpoint') !== OP) return null;
  if (query.get('openid.return_to') !== returnTo) return null;
  const match = ID_RE.exec(query.get('openid.claimed_id') ?? '');
  if (!match || query.get('openid.identity') !== query.get('openid.claimed_id')) return null;

  // The signature has to cover the fields we rely on
  const signed = (query.get('openid.signed') ?? '').split(',');
  for (const field of ['claimed_id', 'identity', 'return_to', 'op_endpoint', 'response_nonce']) {
    if (!signed.includes(field)) return null;
  }

  const body = new URLSearchParams();
  for (const [key, value] of query) if (key.startsWith('openid.')) body.set(key, value);
  body.set('openid.mode', 'check_authentication');

  const res = await fetch(OP, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  return /^is_valid\s*:\s*true$/m.test(text) ? match[1] : null;
}

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
