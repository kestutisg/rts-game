export const CUBA = {
  id: 'cuba',
  name: 'Cuba',
  description: 'A long tropical island where the battle runs from western foothills to eastern ports.',
  accent: '#e7c76f',
  dimensions: { width: 1152, height: 512 },
  climate: {
    defaultBiome: 'tropical',
    zones: [
      { name: 'Seasonally dry southern belt', from: 0.48, to: 0.72, biome: 'dry' },
    ],
  },
  spawnPoints: {
    player: { x: 0.25, y: 0.49 },
    enemy: { x: 0.75, y: 0.53 },
  },
  rivers: [
    { points: [[0.31, 0.41], [0.42, 0.45], [0.54, 0.50], [0.67, 0.57]], width: 1 },
  ],
  bridges: [
    { points: [[0.51, 0.49]] },
  ],
  landPolygons: [[
    // Northern coast
    [0.02, 0.42], [0.06, 0.38], [0.11, 0.36], [0.16, 0.36], [0.21, 0.36],
    [0.26, 0.36], [0.31, 0.35], [0.36, 0.33], [0.41, 0.33], [0.46, 0.34],
    [0.51, 0.36], [0.56, 0.37], [0.61, 0.38], [0.66, 0.38], [0.71, 0.39],
    [0.76, 0.41], [0.81, 0.43], [0.86, 0.46], [0.91, 0.49], [0.95, 0.52],
    // Eastern end
    [0.97, 0.54], [0.98, 0.58], [0.96, 0.62],
    // Southern coast - more irregular
    [0.92, 0.64], [0.87, 0.65], [0.82, 0.64], [0.77, 0.66], [0.72, 0.67],
    [0.67, 0.68], [0.62, 0.70], [0.57, 0.71], [0.52, 0.70], [0.47, 0.68],
    [0.42, 0.66], [0.37, 0.67], [0.32, 0.68], [0.27, 0.67], [0.22, 0.65],
    [0.17, 0.62], [0.12, 0.60], [0.07, 0.58], [0.03, 0.54],
  ]],
};
