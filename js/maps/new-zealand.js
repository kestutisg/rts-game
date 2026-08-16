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
  landPolygons: [
    // North Island
    [[0.54, 0.12], [0.60, 0.09], [0.66, 0.10], [0.72, 0.14], [0.76, 0.19],
      [0.75, 0.25], [0.72, 0.30], [0.75, 0.35], [0.81, 0.40], [0.79, 0.44],
      [0.75, 0.48], [0.69, 0.50], [0.63, 0.47], [0.59, 0.42], [0.56, 0.37],
      [0.55, 0.32], [0.51, 0.29], [0.48, 0.24], [0.49, 0.19]],
    // South Island
    [[0.36, 0.47], [0.44, 0.44], [0.52, 0.47], [0.58, 0.51], [0.62, 0.57],
      [0.60, 0.64], [0.56, 0.70], [0.52, 0.77], [0.48, 0.84], [0.43, 0.90],
      [0.37, 0.93], [0.32, 0.90], [0.28, 0.85], [0.29, 0.79], [0.32, 0.73],
      [0.33, 0.67], [0.29, 0.61], [0.32, 0.54]],
  ],
};
