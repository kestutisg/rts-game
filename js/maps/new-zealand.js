export const NEW_ZEALAND = {
  id: 'new-zealand',
  name: 'New Zealand',
  description: 'Two long islands shaped by mountains, glaciers, and a narrow northern war zone.',
  accent: '#8ed6a5',
  spawnPoints: {
    player: { x: 0.62, y: 0.22 },
    enemy: { x: 0.67, y: 0.40 },
  },
  landPolygons: [
    // North Island
    [[0.53, 0.12], [0.64, 0.10], [0.73, 0.18], [0.70, 0.30], [0.76, 0.39],
      [0.68, 0.48], [0.58, 0.42], [0.55, 0.31], [0.48, 0.25]],
    // South Island
    [[0.38, 0.48], [0.51, 0.46], [0.59, 0.56], [0.55, 0.70], [0.48, 0.83],
      [0.37, 0.89], [0.30, 0.80], [0.34, 0.67], [0.27, 0.58]],
  ],
};
