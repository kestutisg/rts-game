export const JAPAN = {
  id: 'japan',
  name: 'Japan',
  description: 'A chain of mountainous islands where the central corridor becomes the frontline.',
  accent: '#ef9aa7',
  spawnPoints: {
    player: { x: 0.43, y: 0.46 },
    enemy: { x: 0.67, y: 0.61 },
  },
  landPolygons: [
    // Hokkaido
    [[0.61, 0.16], [0.72, 0.13], [0.79, 0.20], [0.75, 0.30], [0.64, 0.29], [0.58, 0.23]],
    // Honshu
    [[0.34, 0.39], [0.45, 0.34], [0.57, 0.39], [0.66, 0.47], [0.75, 0.57],
      [0.70, 0.66], [0.59, 0.64], [0.50, 0.58], [0.41, 0.54], [0.33, 0.47]],
    // Shikoku
    [[0.43, 0.62], [0.52, 0.61], [0.57, 0.67], [0.52, 0.72], [0.43, 0.70]],
    // Kyushu
    [[0.28, 0.65], [0.36, 0.62], [0.42, 0.70], [0.38, 0.80], [0.29, 0.78], [0.25, 0.70]],
  ],
};
