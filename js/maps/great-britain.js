export const GREAT_BRITAIN = {
  id: 'great-britain',
  name: 'Great Britain',
  description: 'A rugged north-south island with exposed coasts and narrow invasion routes.',
  accent: '#7dc9e8',
  dimensions: { width: 576, height: 1024 },
  climate: {
    defaultBiome: 'temperate',
    zones: [
      { name: 'Northern cold uplands', from: 0, to: 0.10, biome: 'polar' },
    ],
  },
  spawnPoints: {
    player: { x: 0.48, y: 0.18 },
    enemy: { x: 0.49, y: 0.82 },
  },
  rivers: [
    { points: [[0.40, 0.43], [0.47, 0.47], [0.55, 0.51], [0.61, 0.61]], width: 1 },
  ],
  bridges: [
    { points: [[0.49, 0.48]] },
  ],
  landPolygons: [[
    // Scotland - Northern tip
    [0.50, 0.00], [0.52, 0.02], [0.54, 0.01], [0.56, 0.03], [0.58, 0.02],
    [0.60, 0.04], [0.62, 0.03], [0.63, 0.06], [0.65, 0.05], [0.66, 0.08],
    // Scottish east coast - Firth of Forth area
    [0.68, 0.12], [0.70, 0.15], [0.71, 0.18], [0.70, 0.22], [0.72, 0.25],
    [0.71, 0.28], [0.73, 0.32], [0.72, 0.36], [0.70, 0.40], [0.69, 0.44],
    // Scottish/English border area
    [0.68, 0.48], [0.70, 0.52], [0.69, 0.56], [0.71, 0.60], [0.70, 0.64],
    // English east coast - Northumberland
    [0.68, 0.68], [0.67, 0.72], [0.66, 0.76], [0.65, 0.80],
    // East Anglia
    [0.66, 0.84], [0.67, 0.88], [0.68, 0.92], [0.67, 0.96],
    // Southern England - Kent area
    [0.65, 0.98], [0.62, 0.99], [0.59, 0.98], [0.56, 0.99], [0.53, 0.98],
    // South coast - English Channel
    [0.50, 0.99], [0.47, 0.98], [0.44, 0.99], [0.41, 0.98], [0.38, 0.99],
    [0.35, 0.98], [0.32, 0.97],
    // South west - Devon/Cornwall area
    [0.30, 0.95], [0.28, 0.92], [0.27, 0.88], [0.28, 0.84], [0.27, 0.80],
    // Welsh coast
    [0.26, 0.76], [0.25, 0.72], [0.24, 0.68], [0.23, 0.64], [0.22, 0.60],
    [0.21, 0.56], [0.20, 0.52], [0.19, 0.48], [0.18, 0.44], [0.17, 0.40],
    // North Wales coast
    [0.16, 0.36], [0.15, 0.32], [0.14, 0.28], [0.13, 0.24], [0.12, 0.20],
    // Lancashire/Liverpool area
    [0.11, 0.16], [0.10, 0.12], [0.09, 0.08], [0.10, 0.04],
    // Back up the west side - Scottish west coast
    [0.15, 0.02], [0.20, 0.00], [0.25, 0.01], [0.30, 0.00], [0.35, 0.01],
    [0.40, 0.00], [0.45, 0.01],
  ]],
};
