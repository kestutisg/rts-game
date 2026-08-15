export const ITALY = {
  id: 'italy',
  name: 'Italy',
  description: 'A fortified northern plain narrows into the mountainous boot and southern peninsula.',
  accent: '#d6b27c',
  spawnPoints: {
    player: { x: 0.48, y: 0.22 },
    enemy: { x: 0.59, y: 0.79 },
  },
  landPolygons: [
    // Mainland and the boot
    [[0.34, 0.12], [0.50, 0.09], [0.63, 0.15], [0.66, 0.25],
      [0.59, 0.34], [0.64, 0.43], [0.58, 0.51], [0.65, 0.59],
      [0.69, 0.70], [0.78, 0.78], [0.72, 0.86], [0.60, 0.79],
      [0.52, 0.68], [0.47, 0.58], [0.41, 0.49], [0.35, 0.38],
      [0.28, 0.28]],
    // Sicily
    [[0.68, 0.90], [0.79, 0.89], [0.84, 0.94], [0.73, 0.97], [0.65, 0.94]],
  ],
};
