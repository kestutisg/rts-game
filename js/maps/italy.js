export const ITALY = {
  id: 'italy',
  name: 'Italy',
  description: 'A fortified northern plain narrows into the mountainous boot and southern peninsula.',
  accent: '#d6b27c',
  dimensions: { width: 704, height: 1088 },
  climate: {
    defaultBiome: 'temperate',
    zones: [
      { name: 'Alpine cold zone', from: 0, to: 0.12, biome: 'polar' },
      { name: 'Mediterranean south', from: 0.74, to: 1, biome: 'dry' },
    ],
  },
  spawnPoints: {
    player: { x: 0.48, y: 0.22 },
    enemy: { x: 0.63, y: 0.78 },
  },
  rivers: [
    { points: [[0.37, 0.16], [0.49, 0.25], [0.57, 0.37], [0.65, 0.52]], width: 1 },
  ],
  bridges: [
    { points: [[0.54, 0.33]] },
  ],
  landPolygons: [
    // Northern plain and Alpine region
    [[0.22, 0.10], [0.28, 0.07], [0.35, 0.06], [0.42, 0.06], [0.49, 0.07],
      [0.56, 0.09], [0.62, 0.13], [0.66, 0.18],
    // Eastern Adriatic coast
      [0.68, 0.24], [0.67, 0.30], [0.65, 0.36], [0.63, 0.42], [0.64, 0.48],
    // Heel of the boot
      [0.67, 0.54], [0.70, 0.60], [0.74, 0.66], [0.80, 0.72], [0.85, 0.78],
      [0.88, 0.84], [0.87, 0.90], [0.82, 0.95],
    // Southern tip
      [0.76, 0.98], [0.70, 0.97], [0.64, 0.95],
    // Western side of boot - Tyrrhenian coast
      [0.58, 0.88], [0.54, 0.82], [0.51, 0.75], [0.48, 0.68], [0.45, 0.62],
      [0.42, 0.56], [0.40, 0.50], [0.38, 0.44], [0.36, 0.38], [0.34, 0.32],
      [0.32, 0.26], [0.30, 0.20], [0.26, 0.15]],
    // Corsica
    [[0.24, 0.52], [0.29, 0.49], [0.32, 0.55], [0.31, 0.63], [0.28, 0.68],
      [0.24, 0.67], [0.21, 0.60]],
    // Sardinia
    [[0.16, 0.72], [0.22, 0.69], [0.26, 0.76], [0.26, 0.86], [0.23, 0.92],
      [0.18, 0.93], [0.14, 0.86], [0.14, 0.78]],
    // Sicily
    [[0.62, 0.92], [0.70, 0.90], [0.80, 0.93], [0.86, 0.98], [0.77, 1.00],
      [0.68, 0.99]],
  ],
};
