export const ICELAND = {
  id: 'iceland',
  name: 'Iceland',
  description: 'A broad volcanic island of ice shelves, lava fields, and open approaches.',
  accent: '#b8dceb',
  dimensions: { width: 960, height: 640 },
  climate: {
    defaultBiome: 'polar',
    zones: [
      { name: 'Milder coastal belt', from: 0.25, to: 0.75, biome: 'temperate' },
    ],
  },
  spawnPoints: {
    player: { x: 0.30, y: 0.47 },
    enemy: { x: 0.70, y: 0.50 },
  },
  rivers: [
    { points: [[0.12, 0.45], [0.31, 0.42], [0.50, 0.47], [0.70, 0.52], [0.88, 0.56]], width: 1 },
  ],
  bridges: [
    { points: [[0.50, 0.47]] },
  ],
  landPolygons: [[
    // Northern coast
    [0.20, 0.20], [0.25, 0.18], [0.31, 0.17], [0.37, 0.18], [0.42, 0.20],
    [0.48, 0.19], [0.54, 0.18], [0.60, 0.19], [0.66, 0.22], [0.72, 0.25],
    [0.78, 0.26], [0.82, 0.29], [0.84, 0.33], [0.83, 0.37],
    // North-east fjords
    [0.82, 0.42], [0.80, 0.47], [0.78, 0.52], [0.76, 0.57],
    // East coast
    [0.75, 0.62], [0.74, 0.68], [0.73, 0.73], [0.72, 0.78],
    // South-east corner
    [0.70, 0.82], [0.66, 0.85], [0.60, 0.86], [0.54, 0.85],
    // Southern coast
    [0.48, 0.84], [0.42, 0.84], [0.36, 0.85], [0.30, 0.84], [0.24, 0.83],
    // South-west coast
    [0.18, 0.80], [0.14, 0.76], [0.11, 0.70], [0.09, 0.64],
    // West coast with fjords
    [0.08, 0.58], [0.07, 0.52], [0.08, 0.46], [0.10, 0.40], [0.12, 0.34],
    [0.15, 0.27], [0.18, 0.23],
  ]],
};
