export const JAPAN = {
  id: 'japan',
  name: 'Japan',
  description: 'A chain of mountainous islands where the central corridor becomes the frontline.',
  accent: '#ef9aa7',
  dimensions: { width: 704, height: 1152 },
  climate: {
    defaultBiome: 'temperate',
    zones: [
      { name: 'Northern cold zone', from: 0, to: 0.16, biome: 'polar' },
      { name: 'Southern subtropics', from: 0.82, to: 1, biome: 'tropical' },
    ],
  },
  spawnPoints: {
    player: { x: 0.49, y: 0.47 },
    enemy: { x: 0.67, y: 0.56 },
  },
  rivers: [
    { points: [[0.32, 0.47], [0.45, 0.50], [0.60, 0.55], [0.76, 0.60]], width: 1 },
  ],
  bridges: [
    { points: [[0.57, 0.54]] },
  ],
  landPolygons: [
    // Hokkaido - Northern island
    [[0.58, 0.12], [0.64, 0.08], [0.72, 0.08], [0.80, 0.12], [0.85, 0.18],
      [0.85, 0.25], [0.80, 0.30], [0.73, 0.32], [0.66, 0.30], [0.60, 0.26],
      [0.56, 0.20]],
    // Honshu - Main island with Kanto plain
    [[0.28, 0.38], [0.35, 0.33], [0.43, 0.30], [0.51, 0.32], [0.59, 0.37],
      [0.66, 0.42], [0.72, 0.48], [0.80, 0.54], [0.83, 0.61], [0.80, 0.67],
      [0.75, 0.72], [0.68, 0.74], [0.62, 0.71], [0.56, 0.68], [0.50, 0.64],
      [0.45, 0.60], [0.40, 0.56], [0.35, 0.52], [0.30, 0.48], [0.26, 0.44],
      [0.25, 0.40]],
    // Shikoku - Small southern island
    [[0.40, 0.65], [0.47, 0.62], [0.54, 0.64], [0.60, 0.70], [0.58, 0.76],
      [0.50, 0.78], [0.43, 0.75], [0.38, 0.70]],
    // Kyushu - Southern island
    [[0.24, 0.68], [0.32, 0.64], [0.39, 0.67], [0.43, 0.75], [0.41, 0.83],
      [0.36, 0.89], [0.30, 0.91], [0.25, 0.86], [0.22, 0.77], [0.23, 0.71]],
    // Ryukyu Islands chain (simplified)
    [[0.22, 0.94], [0.26, 0.92], [0.28, 0.97]],
  ],
};
