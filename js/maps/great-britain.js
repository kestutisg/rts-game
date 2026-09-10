export const GREAT_BRITAIN = {
  id: 'great-britain',
  name: 'Great Britain',
  description: 'A rugged north-south island with exposed coasts, mountain highlands, and a fortified central river crossing.',
  accent: '#7dc9e8',
  dimensions: { width: 576, height: 1024 },
  climate: {
    defaultBiome: 'temperate',
    zones: [
      { name: 'Northern cold uplands', from: 0, to: 0.28, biome: 'polar' },
    ],
  },
  spawnPoints: {
    player: { x: 0.48, y: 0.24 },
    enemy: { x: 0.50, y: 0.80 },
  },
  rivers: [
    { points: [[0.33, 0.50], [0.42, 0.53], [0.51, 0.56], [0.60, 0.59]], width: 1 },
  ],
  bridges: [
    { points: [[0.46, 0.545]] },
  ],
  landPolygons: [
    // Main island of Great Britain (Scotland, England, Wales)
    [
      // Scotland - North Coast (Dunnet Head / Duncansby Head)
      [0.49, 0.05], [0.52, 0.05], [0.54, 0.07], [0.55, 0.09], [0.53, 0.12],
      // Moray Firth & Inverness
      [0.49, 0.15], [0.45, 0.16], [0.48, 0.17],
      // Aberdeenshire / Buchan Ness (northeastern shoulder)
      [0.55, 0.16], [0.60, 0.17], [0.62, 0.19], [0.63, 0.21], [0.60, 0.25], [0.58, 0.28],
      // Firth of Tay & Firth of Forth
      [0.54, 0.30], [0.51, 0.31], [0.56, 0.32], [0.50, 0.33], [0.46, 0.34], [0.49, 0.35],
      // Scottish Borders & Northumberland coast
      [0.55, 0.37], [0.55, 0.40], [0.56, 0.43], [0.55, 0.46], [0.54, 0.49],
      // Yorkshire Coast & Flamborough Head
      [0.58, 0.52], [0.62, 0.55], [0.63, 0.58], [0.59, 0.60], [0.56, 0.61],
      // The Wash & East Anglia bulge (Norfolk / Suffolk / Lowestoft)
      [0.58, 0.63], [0.55, 0.65], [0.53, 0.67], [0.58, 0.67], [0.64, 0.68],
      [0.69, 0.70], [0.72, 0.73], [0.71, 0.77], [0.67, 0.80], [0.63, 0.82],
      // Thames Estuary & Kent (Dover / Dungeness)
      [0.58, 0.83], [0.54, 0.84], [0.58, 0.85], [0.66, 0.85], [0.67, 0.88],
      [0.65, 0.90], [0.60, 0.92], [0.56, 0.92],
      // South Coast (Sussex / Hampshire / Dorset / Portland Bill)
      [0.52, 0.93], [0.47, 0.93], [0.44, 0.93], [0.41, 0.94], [0.38, 0.94],
      [0.36, 0.95], [0.33, 0.94], [0.30, 0.94], [0.26, 0.95],
      // South-West Peninsula (Cornwall & Devon - Lizard Point & Land's End)
      [0.22, 0.96], [0.18, 0.94], [0.17, 0.92], [0.20, 0.89], [0.23, 0.86],
      [0.24, 0.83], [0.25, 0.80],
      // Bristol Channel
      [0.30, 0.80], [0.36, 0.79], [0.40, 0.78], [0.36, 0.76], [0.31, 0.76],
      // South Wales & Pembrokeshire (St David's Head)
      [0.26, 0.76], [0.23, 0.75], [0.18, 0.74], [0.15, 0.71], [0.16, 0.68],
      // Cardigan Bay & Llŷn Peninsula
      [0.20, 0.67], [0.23, 0.64], [0.22, 0.61], [0.17, 0.60], [0.15, 0.58], [0.19, 0.56],
      // Anglesey & North Wales coast
      [0.18, 0.54], [0.19, 0.52], [0.23, 0.52], [0.26, 0.51], [0.30, 0.52],
      // Liverpool Bay, Ribble Estuary & Morecambe Bay
      [0.33, 0.52], [0.35, 0.50], [0.34, 0.48], [0.35, 0.46], [0.38, 0.45],
      [0.36, 0.43], [0.33, 0.42], [0.32, 0.39],
      // Solway Firth (English/Scottish West Border)
      [0.35, 0.37], [0.39, 0.36], [0.36, 0.34],
      // Galloway & Firth of Clyde
      [0.32, 0.34], [0.28, 0.33], [0.29, 0.31], [0.32, 0.30], [0.35, 0.28], [0.32, 0.26],
      // Western Highlands & Cape Wrath
      [0.30, 0.24], [0.27, 0.21], [0.29, 0.18], [0.33, 0.16], [0.35, 0.12],
      [0.38, 0.08], [0.42, 0.06], [0.46, 0.05],
    ],
    // Isle of Man in the Irish Sea
    [
      [0.24, 0.43], [0.26, 0.41], [0.28, 0.43], [0.27, 0.47], [0.24, 0.46],
    ],
    // Isle of Wight off the South Coast
    [
      [0.43, 0.94], [0.47, 0.94], [0.46, 0.96], [0.42, 0.95],
    ],
  ],
};
