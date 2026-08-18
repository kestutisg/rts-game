export const NEW_ZEALAND = {
  id: 'new-zealand',
  name: 'New Zealand',
  description: 'Two long islands shaped by mountains, glaciers, and a narrow northern war zone.',
  accent: '#8ed6a5',
  dimensions: { width: 704, height: 1024 },
  climate: {
    defaultBiome: 'temperate',
    zones: [
      { name: 'Northern subtropics', from: 0, to: 0.18, biome: 'tropical' },
      { name: 'Southern cold zone', from: 0.76, to: 1, biome: 'polar' },
    ],
  },
  spawnPoints: {
    player: { x: 0.62, y: 0.22 },
    enemy: { x: 0.67, y: 0.39 },
  },
  rivers: [
    { points: [[0.52, 0.18], [0.62, 0.25], [0.70, 0.33], [0.79, 0.41]], width: 1 },
  ],
  bridges: [
    { points: [[0.69, 0.32]] },
  ],
  landPolygons: [
    // North Island - more complex coastline
    [[0.52, 0.10], [0.58, 0.07], [0.64, 0.08], [0.70, 0.12], [0.74, 0.17],
      [0.75, 0.23], [0.73, 0.29], [0.76, 0.35], [0.82, 0.40], [0.81, 0.46],
      [0.77, 0.51], [0.71, 0.52], [0.65, 0.49], [0.60, 0.44], [0.56, 0.38],
      [0.54, 0.32], [0.51, 0.27], [0.48, 0.22], [0.48, 0.16]],
    // South Island - two main features
    [[0.34, 0.48], [0.42, 0.44], [0.50, 0.46], [0.56, 0.50], [0.60, 0.56],
      [0.59, 0.63], [0.55, 0.70], [0.50, 0.77], [0.45, 0.84], [0.40, 0.90],
      [0.35, 0.94], [0.30, 0.92], [0.26, 0.86], [0.27, 0.79], [0.30, 0.72],
      [0.32, 0.65], [0.28, 0.58], [0.30, 0.52]],
  ],
};
