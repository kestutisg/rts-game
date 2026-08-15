/**
 * Climate zones and biome palettes for procedural map generation.
 * Polar bands at the north/south edges, dry subtropical belts, temperate center.
 */

export const BIOMES = {
  temperate: 'temperate',
  dry: 'dry',
  polar: 'polar',
};

/** Fraction of map height occupied by each edge band. */
export const CLIMATE_BANDS = {
  polar: 0.14,
  dry: 0.12,
};

export function getBiomeForTile(x, y, width, height) {
  const t = (x + y) / Math.max(1, width + height - 2);
  const { polar, dry } = CLIMATE_BANDS;

  if (t < polar || t > 1 - polar) return BIOMES.polar;
  if (t < polar + dry || t > 1 - polar - dry) return BIOMES.dry;
  return BIOMES.temperate;
}

export function getBiomeForY(y, height) {
  return getBiomeForTile(0, y, height, height);
}

/** Ground tile colors indexed by elevation (0 flat, 1 hill, 2 peak). */
export const GROUND_PALETTES = {
  temperate: [
    { top: '#101518', edge: '#182025', sideDark: '#121820', sideLight: '#1a2228' },
    { top: '#141c20', edge: '#1c2830', sideDark: '#121820', sideLight: '#1a2228' },
    { top: '#182428', edge: '#223038', sideDark: '#121820', sideLight: '#1a2228' },
  ],
  dry: [
    { top: '#2a2418', edge: '#3a3220', sideDark: '#221e14', sideLight: '#2e281c' },
    { top: '#322c1e', edge: '#443a28', sideDark: '#262018', sideLight: '#363024' },
    { top: '#3a3424', edge: '#4a4030', sideDark: '#2a2418', sideLight: '#3e3628' },
  ],
  polar: [
    { top: '#b8c8d4', edge: '#98aab8', sideDark: '#8898a4', sideLight: '#a8b8c4' },
    { top: '#c4d4de', edge: '#a4b4c0', sideDark: '#94a4b0', sideLight: '#b4c4ce' },
    { top: '#d0dee6', edge: '#b0c0ca', sideDark: '#a0b0ba', sideLight: '#c0d0d8' },
  ],
};

export const ROCK_PALETTES = {
  temperate: { top: '#303a42', left: '#181e22', right: '#22292f', edge: '#414d57' },
  dry: { top: '#4a4030', left: '#2a2418', right: '#363024', edge: '#5a5040' },
  polar: { top: '#788890', left: '#586870', right: '#647480', edge: '#8898a0' },
};

export const MINIMAP_GROUND = {
  temperate: ['#0a1014', '#141c20', '#1e2830'],
  dry: ['#1e1810', '#2a2418', '#363024'],
  polar: ['#8898a4', '#98a8b4', '#a8b8c4'],
};

export function getMinimapGroundColor(biome, elevation) {
  const palette = MINIMAP_GROUND[biome] || MINIMAP_GROUND.temperate;
  return palette[Math.min(elevation, palette.length - 1)];
}

export function isWaterAllowed(biome) {
  return biome === BIOMES.temperate;
}
