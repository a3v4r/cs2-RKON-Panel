// Stock CS2 maps with pictures, shared by Servers, Maps, Match and Match setup.
// Newer maps use CS2 screenshots (panorama/images/map_icons/screenshots) cut to 640x360.
export interface StockMap {
  name: string;
  displayName: string;
  type: 'Defusal' | 'Hostage';
  image: string;
  aliases?: string[];
}

export const STOCK_MAPS: StockMap[] = [
  { name: 'de_dust2', displayName: 'Dust II', type: 'Defusal', image: '/images/maps/de_dust2.webp' },
  { name: 'de_inferno', displayName: 'Inferno', type: 'Defusal', image: '/images/maps/de_inferno.webp' },
  { name: 'de_mirage', displayName: 'Mirage', type: 'Defusal', image: '/images/maps/de_mirage.webp' },
  { name: 'de_nuke', displayName: 'Nuke', type: 'Defusal', image: '/images/maps/de_nuke_cs2.webp' },
  { name: 'de_overpass', displayName: 'Overpass', type: 'Defusal', image: '/images/maps/de_overpass.webp' },
  { name: 'de_ancient', displayName: 'Ancient', type: 'Defusal', image: '/images/maps/de_ancient.webp' },
  { name: 'de_ancient_night', displayName: 'Ancient Night', type: 'Defusal', image: '/images/maps/de_ancient_night.jpg' },
  { name: 'de_anubis', displayName: 'Anubis', type: 'Defusal', image: '/images/maps/de_anubis.webp' },
  { name: 'de_vertigo', displayName: 'Vertigo', type: 'Defusal', image: '/images/maps/de_vertigo.webp' },
  { name: 'de_train', displayName: 'Train', type: 'Defusal', image: '/images/maps/de_train.webp' },
  { name: 'de_cache', displayName: 'Cache', type: 'Defusal', image: '/images/maps/de_cache.jpg' },
  { name: 'de_cbble', displayName: 'Cobblestone', type: 'Defusal', image: '/images/maps/de_cbble.jpg' },
  { name: 'de_debris', displayName: 'Debris', type: 'Defusal', image: '/images/maps/de_debris.jpg' },
  { name: 'de_eldorado', displayName: 'Eldorado', type: 'Defusal', image: '/images/maps/de_eldorado.jpg' },
  { name: 'de_poseidon', displayName: 'Poseidon', type: 'Defusal', image: '/images/maps/de_poseidon.jpg' },
  { name: 'cs_italy', displayName: 'Italy', type: 'Hostage', image: '/images/maps/de_italy.webp', aliases: ['de_italy'] },
  { name: 'cs_office', displayName: 'Office', type: 'Hostage', image: '/images/maps/de_office.webp', aliases: ['de_office'] },
];

// "workshop/123/de_cache.vpk" -> "de_cache"
export const mapBaseName = (map?: string | null) =>
  (map ?? '').split(/[/\\]/).pop()?.replace(/\.(vpk|bsp)$/i, '').toLowerCase() ?? '';

export const stockMap = (map?: string | null) => {
  const name = mapBaseName(map);
  return STOCK_MAPS.find((m) => m.name === name || m.aliases?.includes(name));
};

export const mapImage = (map?: string | null) => stockMap(map)?.image ?? '/images/maps/de_dust2.webp';
