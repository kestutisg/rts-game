export const NEW_ZEALAND = {
  id: 'new-zealand',
  name: 'New Zealand',
  description: 'Two long islands shaped by mountains, glaciers, and a narrow northern war zone.',
  accent: '#8ed6a5',
  dimensions: { width: 176, height: 256 },
  spawnPoints: {
    player: { x: 0.62, y: 0.22 },
    enemy: { x: 0.67, y: 0.39 },
  },
  landPolygons: [
    // North Island
    [[0.52, 0.13], [0.59, 0.10], [0.66, 0.11], [0.72, 0.16], [0.75, 0.22],
      [0.71, 0.28], [0.73, 0.34], [0.78, 0.39], [0.74, 0.45], [0.68, 0.49],
      [0.62, 0.45], [0.57, 0.40], [0.55, 0.33], [0.50, 0.29], [0.47, 0.23]],
    // South Island
    [[0.37, 0.48], [0.45, 0.45], [0.52, 0.48], [0.59, 0.55], [0.57, 0.63],
      [0.54, 0.70], [0.49, 0.78], [0.45, 0.85], [0.38, 0.90], [0.32, 0.87],
      [0.28, 0.81], [0.32, 0.73], [0.34, 0.66], [0.29, 0.59]],
  ],
};
