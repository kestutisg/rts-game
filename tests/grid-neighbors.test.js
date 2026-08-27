import assert from 'node:assert/strict';
import { Grid } from '../js/grid.js';

const grid = new Grid(5, 5, 40, null, { generate: false });

const hasTile = (tiles, x, y) => tiles.some(tile => tile.x === x && tile.y === y);

assert.equal(
  hasTile(grid.getNeighbors(grid.getTile(2, 0)), 2, 2),
  true,
  'Even rows should connect directly to the next even row'
);
assert.equal(
  hasTile(grid.getNeighbors(grid.getTile(2, 1)), 2, 3),
  true,
  'Odd rows should connect directly to the next odd row'
);

const evenRowCoords = grid.getTileCoords(2, 0);
const nextEvenRowCoords = grid.getTileCoords(2, 2);
assert.equal(
  nextEvenRowCoords.x,
  evenRowCoords.x,
  'Same-parity row links should preserve the world X coordinate'
);

const straightPath = grid.findPath(grid.getTile(2, 0), grid.getTile(2, 2));
assert.deepEqual(
  straightPath?.map(tile => [tile.x, tile.y]),
  [[2, 2]],
  'A clear path between aligned rows should use the direct same-parity step'
);

console.log('Staggered-grid neighbor checks passed.');
