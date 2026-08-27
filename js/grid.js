/**
 * Grid & Pathfinding Manager for Tiberian Odyssey (Staggered 2.5D Upgrade)
 * Handles staggered diamond projection, terrain generation (elevation, water),
 * coordinate conversions, rendering, and pathfinding.
 */

import {
  BIOMES,
  getBiomeForTile,
  GROUND_PALETTES,
  ROCK_PALETTES,
  isWaterAllowed,
} from './biomes.js';

export class Tile {
  constructor(x, y, type = 'grass') {
    this.x = x;
    this.y = y;
    this.type = type; // 'grass', 'rock', 'ore', 'water'
    this.biome = BIOMES.temperate; // 'temperate', 'dry', 'polar', 'tropical'
    this.waterVariant = null; // 'lake', 'river', 'waterfall'
    this.elevation = 0; // 0 = flat, 1 = hill, 2 = peak
    this.resourceAmount = 0;
    this.maxResource = 100;
    this.walkable = type === 'grass' || type === 'ore';
    this.isBridge = false;
    // Keep buildings and mobile units separate so a unit can pass through a
    // friendly gate without allowing two units to share that cell.
    this.occupiedBy = null;
    this.unitOccupant = null;
  }
}

class PriorityQueue {
  constructor() {
    this.elements = [];
  }
  push(element, priority) {
    this.elements.push({ element, priority });
    this.bubbleUp(this.elements.length - 1);
  }
  pop() {
    if (this.elements.length === 0) return null;
    const top = this.elements[0].element;
    const bottom = this.elements.pop();
    if (this.elements.length > 0) {
      this.elements[0] = bottom;
      this.sinkDown(0);
    }
    return top;
  }
  isEmpty() {
    return this.elements.length === 0;
  }
  bubbleUp(n) {
    const element = this.elements[n];
    while (n > 0) {
      const parentN = Math.floor((n + 1) / 2) - 1;
      const parent = this.elements[parentN];
      if (element.priority >= parent.priority) break;
      this.elements[parentN] = element;
      this.elements[n] = parent;
      n = parentN;
    }
  }
  sinkDown(n) {
    const length = this.elements.length;
    const element = this.elements[n];
    while (true) {
      const child2N = (n + 1) * 2;
      const child1N = child2N - 1;
      let swap = null;
      if (child1N < length) {
        const child1 = this.elements[child1N];
        if (child1.priority < element.priority) {
          swap = child1N;
        }
      }
      if (child2N < length) {
        const child2 = this.elements[child2N];
        if (child2.priority < (swap === null ? element.priority : this.elements[child1N].priority)) {
          swap = child2N;
        }
      }
      if (swap === null) break;
      this.elements[n] = this.elements[swap];
      this.elements[swap] = element;
      n = swap;
    }
  }
}

export class Grid {
  constructor(width, height, tileSize, mapDefinition = null, options = {}) {
    const dimensions = mapDefinition?.dimensions || {};
    this.width = dimensions.width || width;
    this.height = dimensions.height || height;
    this.tileSize = tileSize;
    this.mapDefinition = mapDefinition;

    // Diamond cells are laid out in staggered horizontal rows. Every other
    // row shifts by half a cell, preserving the 2.5D/isometric silhouette
    // while keeping the logical y axis visually horizontal across the map.
    this.tileWidth = this.tileSize * 2;
    this.tileHeight = this.tileSize;
    this.halfW = this.tileWidth / 2;
    this.halfH = this.tileHeight / 2;
    this.mapOriginX = this.halfW;

    // Keep the starting bases far enough inside the staggered boundary that a
    // full camera viewport can remain completely tile-covered.
    this.spawnInset = Math.min(32, Math.floor(Math.min(this.width, this.height) / 4));
    this.startingBases = this.resolveStartingBases();

    this.mapWidthPx = this.width * this.tileWidth + this.halfW;
    this.mapHeightPx = (this.height + 1) * this.halfH;

    if (options.generate === false) {
      this.initializeTiles();
    } else {
      this.generateMap();
    }
  }

  initializeTiles() {
    this.tiles = [];
    for (let x = 0; x < this.width; x++) {
      this.tiles[x] = [];
      for (let y = 0; y < this.height; y++) {
        this.tiles[x][y] = new Tile(x, y, 'grass');
      }
    }
  }

  generateMap() {
    const areaScale = (this.width * this.height) / (60 * 60);
    const scaledCount = (base) => Math.max(base, Math.round(base * areaScale));

    this.initializeTiles();

    this.applyMapShape();
    this.assignBiomes();
    this.generateElevation(scaledCount(7));
    this.generateLakes(scaledCount(4), 5, 0.55);
    if (this.mapDefinition?.rivers?.length) {
      this.generateDefinedRivers();
      this.applyDefinedBridges();
    } else {
      this.generateRivers(scaledCount(2));
    }
    this.markWaterfalls();
    this.createClusters(scaledCount(12), 'rock', 3, 0.4);
    this.scatterDryRocks();
    this.createClusters(scaledCount(8), 'ore', 4, 0.65);

    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        const tile = this.tiles[x][y];
        if (tile.type === 'ore') {
          tile.resourceAmount = Math.floor(Math.random() * 40) + 60;
          tile.walkable = true;
        }
      }
    }

    this.clearSpawnArea(this.startingBases.player.x, this.startingBases.player.y, 10);
    this.clearSpawnArea(this.startingBases.enemy.x, this.startingBases.enemy.y, 10);

    // Random water and rock generation must never seal the route between the
    // two starting bases. Keep the natural map when it is already connected,
    // and only carve a small fallback corridor when it is not.
    this.ensureBasePath();
    this.ensureHarvesterResourceAccess();
  }

  getBasePathEndpoints() {
    return {
      start: this.getTile(this.startingBases.player.x, this.startingBases.player.y),
      end: this.getTile(this.startingBases.enemy.x, this.startingBases.enemy.y),
    };
  }

  resolveStartingBases() {
    const points = this.mapDefinition?.spawnPoints;
    const toTile = (point, fallbackX, fallbackY) => ({
      x: Math.max(0, Math.min(this.width - 1, Math.round((point?.x ?? fallbackX) * (this.width - 1)))),
      y: Math.max(0, Math.min(this.height - 1, Math.round((point?.y ?? fallbackY) * (this.height - 1)))),
    });

    return {
      player: toTile(points?.player, this.spawnInset / Math.max(1, this.width - 1), this.spawnInset / Math.max(1, this.height - 1)),
      enemy: toTile(points?.enemy, (this.width - this.spawnInset - 1) / Math.max(1, this.width - 1), (this.height - this.spawnInset - 1) / Math.max(1, this.height - 1)),
    };
  }

  applyMapShape() {
    const polygons = this.mapDefinition?.landPolygons;
    if (!polygons?.length) return;

    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        if (this.isLandPoint((x + 0.5) / this.width, (y + 0.5) / this.height, polygons)) continue;

        const tile = this.tiles[x][y];
        tile.type = 'water';
        tile.waterVariant = 'lake';
        tile.walkable = false;
        tile.resourceAmount = 0;
      }
    }
  }

  isLandPoint(x, y, polygons) {
    return polygons.some(polygon => {
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        const intersects = ((yi > y) !== (yj > y)) &&
          (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
        if (intersects) inside = !inside;
      }
      return inside;
    });
  }

  ensureBasePath() {
    const { start, end } = this.getBasePathEndpoints();
    if (!start || !end) return;

    if (this.findPath(start, end)) return;

    // Clear a three-tile-wide Bresenham corridor. The overlapping 3x3 brush
    // keeps diagonal and cardinal sections connected for the same 8-direction
    // movement used by A*.
    let x = start.x;
    let y = start.y;
    const dx = Math.abs(end.x - start.x);
    const sx = start.x < end.x ? 1 : -1;
    const dy = -Math.abs(end.y - start.y);
    const sy = start.y < end.y ? 1 : -1;
    let error = dx + dy;

    while (true) {
      this.clearPathBrush(x, y);
      if (x === end.x && y === end.y) break;

      const doubledError = 2 * error;
      if (doubledError >= dy) {
        error += dy;
        x += sx;
      }
      if (doubledError <= dx) {
        error += dx;
        y += sy;
      }
    }
  }

  clearPathBrush(centerX, centerY) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const tile = this.getTile(centerX + dx, centerY + dy);
        if (!tile) continue;

        if (tile.type === 'water' && tile.waterVariant === 'river') {
          this.setBridgeTile(centerX + dx, centerY + dy);
          continue;
        }

        tile.type = 'grass';
        tile.waterVariant = null;
        tile.isBridge = false;
        tile.waterfallDrop = 0;
        tile.elevation = 0;
        tile.walkable = true;
        tile.resourceAmount = 0;
      }
    }
  }

  ensureHarvesterResourceAccess() {
    const { start } = this.getBasePathEndpoints();
    if (!start || !start.walkable) return;

    const totalTiles = this.width * this.height;
    const visited = new Uint8Array(totalTiles);
    const queue = new Int32Array(totalTiles);
    let head = 0;
    let tail = 0;
    const indexOf = (x, y) => x * this.height + y;
    const enqueue = (tile) => {
      if (!tile || !tile.walkable) return;
      const index = indexOf(tile.x, tile.y);
      if (visited[index]) return;
      visited[index] = 1;
      queue[tail++] = index;
    };

    enqueue(start);
    while (head < tail) {
      const index = queue[head++];
      const x = Math.floor(index / this.height);
      const y = index % this.height;
      for (const neighbor of this.getNeighbors(this.tiles[x][y])) enqueue(neighbor);
    }

    // Do not leave ore fields on isolated islands or behind a sealed river.
    // Every resource that remains on the map is reachable by a harvester from
    // the connected starting-base landmass.
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        const tile = this.tiles[x][y];
        if (tile.type !== 'ore' || visited[indexOf(x, y)]) continue;
        tile.type = 'grass';
        tile.resourceAmount = 0;
        tile.walkable = true;
        tile.waterVariant = null;
        tile.isBridge = false;
      }
    }
  }

  assignBiomes() {
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        this.tiles[x][y].biome = this.getBiomeForTile(x, y);
      }
    }
  }

  getBiomeForTile(x, y) {
    return getBiomeForTile(x, y, this.width, this.height, this.mapDefinition?.climate);
  }

  scatterDryRocks() {
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        const tile = this.tiles[x][y];
        if (tile.biome !== BIOMES.dry || tile.type !== 'grass') continue;
        if (Math.random() < 0.07) {
          tile.type = 'rock';
          tile.walkable = false;
        }
      }
    }
  }

  generateElevation(clusterCount = 7) {
    const noise = [];
    for (let x = 0; x < this.width; x++) {
      noise[x] = [];
      for (let y = 0; y < this.height; y++) {
        noise[x][y] = Math.random();
      }
    }

    // Smooth noise for rolling hills
    for (let pass = 0; pass < 3; pass++) {
      for (let x = 1; x < this.width - 1; x++) {
        for (let y = 1; y < this.height - 1; y++) {
          const avg = (
            noise[x - 1][y] + noise[x + 1][y] +
            noise[x][y - 1] + noise[x][y + 1] +
            noise[x][y] * 2
          ) / 6;
          noise[x][y] = avg;
        }
      }
    }

    // Place distinct hill clusters
    for (let c = 0; c < clusterCount; c++) {
      const cx = Math.floor(Math.random() * (this.width - 10)) + 5;
      const cy = Math.floor(Math.random() * (this.height - 10)) + 5;
      const radius = 4 + Math.floor(Math.random() * 4);

      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          const tx = cx + dx;
          const ty = cy + dy;
          if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) continue;

          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > radius) continue;

          const falloff = 1 - dist / radius;
          noise[tx][ty] = Math.max(noise[tx][ty], 0.45 + falloff * 0.55);
        }
      }
    }

    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        const v = noise[x][y];
        this.tiles[x][y].elevation = v > 0.82 ? 2 : v > 0.58 ? 1 : 0;
      }
    }
  }

  setWaterTile(x, y, variant) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const tile = this.tiles[x][y];
    if (variant === 'river' && this.mapDefinition?.landPolygons?.length &&
        !this.isLandPoint((x + 0.5) / this.width, (y + 0.5) / this.height, this.mapDefinition.landPolygons)) {
      return;
    }
    if ((!isWaterAllowed(tile.biome) && variant !== 'river') || tile.type === 'rock') return;

    tile.type = 'water';
    tile.waterVariant = variant;
    tile.isBridge = false;
    tile.walkable = false;
    tile.resourceAmount = 0;
    tile.elevation = Math.min(tile.elevation, variant === 'lake' ? 0 : tile.elevation);
  }

  setBridgeTile(x, y) {
    const tile = this.getTile(x, y);
    if (!tile || tile.type !== 'water' || tile.waterVariant !== 'river') return false;
    tile.isBridge = true;
    tile.walkable = true;
    tile.resourceAmount = 0;
    return true;
  }

  setNearestRiverBridge(x, y, maxRadius = 3) {
    let nearest = null;
    for (let dx = -maxRadius; dx <= maxRadius; dx++) {
      for (let dy = -maxRadius; dy <= maxRadius; dy++) {
        const tile = this.getTile(x + dx, y + dy);
        if (!tile || tile.type !== 'water' || tile.waterVariant !== 'river') continue;
        const distance = Math.hypot(dx, dy);
        if (!nearest || distance < nearest.distance) nearest = { tile, distance };
      }
    }
    return nearest ? this.setBridgeTile(nearest.tile.x, nearest.tile.y) : false;
  }

  normalizedPointToTile(point) {
    return {
      x: Math.max(0, Math.min(this.width - 1, Math.round(point[0] * (this.width - 1)))),
      y: Math.max(0, Math.min(this.height - 1, Math.round(point[1] * (this.height - 1)))),
    };
  }

  generateDefinedRivers() {
    for (const river of this.mapDefinition.rivers || []) {
      const points = river.points || [];
      if (points.length < 2) continue;

      for (let i = 1; i < points.length; i++) {
        const start = this.normalizedPointToTile(points[i - 1]);
        const end = this.normalizedPointToTile(points[i]);
        this.carveDefinedRiverSegment(start.x, start.y, end.x, end.y, river.width || 1);
      }
    }
  }

  carveDefinedRiverSegment(startX, startY, endX, endY, width = 1) {
    const steps = Math.max(Math.abs(endX - startX), Math.abs(endY - startY));
    const halfWidth = Math.max(0, Math.floor((width - 1) / 2));

    for (let step = 0; step <= steps; step++) {
      const ratio = steps === 0 ? 0 : step / steps;
      const cx = Math.round(startX + (endX - startX) * ratio);
      const cy = Math.round(startY + (endY - startY) * ratio);

      for (let dx = -halfWidth; dx <= halfWidth; dx++) {
        for (let dy = -halfWidth; dy <= halfWidth; dy++) {
          this.setWaterTile(cx + dx, cy + dy, 'river');
        }
      }
    }
  }

  applyDefinedBridges() {
    for (const bridge of this.mapDefinition.bridges || []) {
      const points = bridge.points || [];
      if (points.length === 0) continue;

      if (points.length === 1) {
        const point = this.normalizedPointToTile(points[0]);
        this.setNearestRiverBridge(point.x, point.y);
        continue;
      }

      for (let i = 1; i < points.length; i++) {
        const start = this.normalizedPointToTile(points[i - 1]);
        const end = this.normalizedPointToTile(points[i]);
        const steps = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
        for (let step = 0; step <= steps; step++) {
          const ratio = steps === 0 ? 0 : step / steps;
          this.setNearestRiverBridge(
            Math.round(start.x + (end.x - start.x) * ratio),
            Math.round(start.y + (end.y - start.y) * ratio)
          );
        }
      }
    }
  }

  generateLakes(count, radius, density) {
    for (let c = 0; c < count; c++) {
      const centerX = Math.floor(Math.random() * (this.width - 2 * radius)) + radius;
      const centerY = Math.floor(Math.random() * (this.height - 2 * radius)) + radius;

      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          const tx = centerX + dx;
          const ty = centerY + dy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= radius && Math.random() < density * (1 - dist / radius)) {
            this.setWaterTile(tx, ty, 'lake');
          }
        }
      }
    }
  }

  generateRivers(count) {
    // Lake locations do not need to be rediscovered for every river. Keeping
    // this scan outside the loop matters on the largest maps, where the
    // terrain grid can contain hundreds of thousands of cells.
    const lakes = [];
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        if (this.tiles[x][y].waterVariant === 'lake') {
          lakes.push({ x, y });
        }
      }
    }

    for (let r = 0; r < count; r++) {
      let startX, startY, endX, endY;

      if (lakes.length >= 2) {
        const a = lakes[Math.floor(Math.random() * lakes.length)];
        let b = lakes[Math.floor(Math.random() * lakes.length)];
        while (b.x === a.x && b.y === a.y && lakes.length > 1) {
          b = lakes[Math.floor(Math.random() * lakes.length)];
        }
        startX = a.x;
        startY = a.y;
        endX = b.x;
        endY = b.y;
      } else {
        const edge = Math.floor(Math.random() * 4);
        if (edge === 0) { startX = 0; startY = Math.floor(Math.random() * this.height); endX = this.width - 1; endY = Math.floor(Math.random() * this.height); }
        else if (edge === 1) { startX = this.width - 1; startY = Math.floor(Math.random() * this.height); endX = 0; endY = Math.floor(Math.random() * this.height); }
        else if (edge === 2) { startX = Math.floor(Math.random() * this.width); startY = 0; endX = Math.floor(Math.random() * this.width); endY = this.height - 1; }
        else { startX = Math.floor(Math.random() * this.width); startY = this.height - 1; endX = Math.floor(Math.random() * this.width); endY = 0; }
      }

      this.carveRiver(startX, startY, endX, endY);
    }
  }

  carveRiver(startX, startY, endX, endY) {
    let cx = startX;
    let cy = startY;
    let safety = this.width * this.height * 2;

    while ((cx !== endX || cy !== endY) && safety-- > 0) {
      this.setWaterTile(cx, cy, 'river');
      // Widen river slightly
      if (Math.random() < 0.35) this.setWaterTile(cx + 1, cy, 'river');
      if (Math.random() < 0.35) this.setWaterTile(cx, cy + 1, 'river');

      const dx = endX - cx;
      const dy = endY - cy;

      if (Math.abs(dx) > Math.abs(dy)) {
        cx += Math.sign(dx);
        if (Math.random() < 0.25) cy += Math.sign(dy) || (Math.random() < 0.5 ? 1 : -1);
      } else {
        cy += Math.sign(dy);
        if (Math.random() < 0.25) cx += Math.sign(dx) || (Math.random() < 0.5 ? 1 : -1);
      }
    }

    this.setWaterTile(endX, endY, 'river');
  }

  markWaterfalls() {
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        const tile = this.tiles[x][y];
        if (tile.type !== 'water' || tile.waterVariant === 'lake' || tile.isBridge) continue;

        for (const neighbor of this.getNeighbors(tile)) {
          if (neighbor.elevation > tile.elevation && neighbor.type !== 'water') {
            tile.waterVariant = 'waterfall';
            tile.waterfallDrop = neighbor.elevation - tile.elevation;
            break;
          }
        }
      }
    }
  }

  createClusters(numClusters, type, radius, density) {
    for (let c = 0; c < numClusters; c++) {
      const centerX = Math.floor(Math.random() * (this.width - 2 * radius)) + radius;
      const centerY = Math.floor(Math.random() * (this.height - 2 * radius)) + radius;

      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          const tx = centerX + dx;
          const ty = centerY + dy;

          if (tx >= 0 && tx < this.width && ty >= 0 && ty < this.height) {
            const tile = this.tiles[tx][ty];
            if (tile.type === 'water') continue;

            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance <= radius && Math.random() < density * (1 - distance / radius)) {
              tile.type = type;
              tile.walkable = type !== 'rock';
              tile.waterVariant = null;
            }
          }
        }
      }
    }
  }

  clearSpawnArea(centerX, centerY, radius) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const tx = centerX + dx;
        const ty = centerY + dy;
        if (tx >= 0 && tx < this.width && ty >= 0 && ty < this.height) {
          const tile = this.tiles[tx][ty];
          tile.type = 'grass';
          tile.biome = this.getBiomeForTile(tx, ty);
          tile.waterVariant = null;
          tile.isBridge = false;
          tile.elevation = 0;
          tile.walkable = true;
          tile.resourceAmount = 0;
        }
      }
    }
  }

  getElevationOffset(elevation) {
    return elevation * 10;
  }

  getTileCoords(x, y) {
    const rowOffset = Math.abs(Math.floor(y)) % 2 === 1 ? this.halfW : 0;
    const worldX = this.mapOriginX + x * this.tileWidth + rowOffset;
    const worldY = (y + 1) * this.halfH;
    return { x: worldX, y: worldY };
  }

  getTileCornerCoords(x, y) {
    return {
      x: this.mapOriginX + x * this.tileWidth + (Math.abs(Math.floor(y)) % 2 === 1 ? this.halfW : 0),
      y: y * this.halfH,
    };
  }

  getTileAtWorld(worldX, worldY) {
    const approxY = Math.floor(worldY / this.halfH) - 1;
    let closest = null;
    let closestDistance = Infinity;

    for (let y = approxY - 1; y <= approxY + 1; y++) {
      if (y < 0 || y >= this.height) continue;
      const rowOffset = y % 2 === 1 ? this.halfW : 0;
      const approxX = Math.round((worldX - this.mapOriginX - rowOffset) / this.tileWidth);

      for (let x = approxX - 1; x <= approxX + 1; x++) {
        if (x < 0 || x >= this.width) continue;
        const tile = this.tiles[x][y];
        const coords = this.getTileCoords(x, y);
        const distance = Math.abs(worldX - coords.x) / this.halfW +
          Math.abs(worldY - coords.y) / this.halfH;

        if (distance <= 1.001 && distance < closestDistance) {
          closest = tile;
          closestDistance = distance;
        }
      }
    }

    return closest;
  }

  /** Clamp a rectangular camera viewport inside the staggered map bounds. */
  clampCamera(camera) {
    if (!camera) return camera;

    const maxX = Math.max(0, this.mapWidthPx - camera.width);
    const maxY = Math.max(0, this.mapHeightPx - camera.height);
    camera.x = Math.max(0, Math.min(maxX, camera.x));
    camera.y = Math.max(0, Math.min(maxY, camera.y));
    return camera;
  }

  getTile(x, y) {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      return this.tiles[x][y];
    }
    return null;
  }

  regrowResources(elapsedSeconds = 5) {
    // Depleted fields recover steadily, like Tiberian Sun's tiberium fields.
    // The rate is intentionally slow enough that active harvesters still need
    // to move between nearby fields, while an exhausted field is never lost.
    const regrowthRate = 1.5;
    const regrowthAmount = regrowthRate * Math.max(0, elapsedSeconds);

    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        const tile = this.tiles[x][y];
        if (tile.type === 'ore') {
          if (tile.resourceAmount < tile.maxResource) {
            tile.resourceAmount = Math.min(tile.maxResource, tile.resourceAmount + regrowthAmount);
          }

          if (tile.resourceAmount > 40 && Math.random() < 0.005) {
            const neighbors = this.getNeighbors(tile);
            const grassNeighbors = neighbors.filter(t => t.type === 'grass' && !t.occupiedBy && !t.unitOccupant);
            if (grassNeighbors.length > 0) {
              const target = grassNeighbors[Math.floor(Math.random() * grassNeighbors.length)];
              target.type = 'ore';
              target.resourceAmount = 20;
            }
          }
        }
      }
    }
  }

  getNeighbors(tile) {
    const neighbors = [];
    // In a staggered horizontal offset grid, neighbor offsets depend on row parity
    const isOddRow = tile.y % 2 === 1;
    
    let dirs;
    if (isOddRow) {
      // Odd rows (shifted right): neighbors are offset accordingly
      dirs = [
        { x: 0, y: -2 },   // aligned row above (odd to odd)
        { x: 0, y: 2 },    // aligned row below (odd to odd)
        { x: 0, y: -1 },   // top-left (relative to even row)
        { x: 1, y: -1 },   // top-right
        { x: -1, y: 0 },   // left
        { x: 1, y: 0 },    // right
        { x: 0, y: 1 },    // bottom-left
        { x: 1, y: 1 },    // bottom-right
      ];
    } else {
      // Even rows (not shifted): neighbors are also adjusted
      dirs = [
        { x: 0, y: -2 },   // aligned row above (even to even)
        { x: 0, y: 2 },    // aligned row below (even to even)
        { x: -1, y: -1 },  // top-left
        { x: 0, y: -1 },   // top-right (relative to odd row)
        { x: -1, y: 0 },   // left
        { x: 1, y: 0 },    // right
        { x: -1, y: 1 },   // bottom-left
        { x: 0, y: 1 },    // bottom-right
      ];
    }

    for (const dir of dirs) {
      const tx = tile.x + dir.x;
      const ty = tile.y + dir.y;
      if (tx >= 0 && tx < this.width && ty >= 0 && ty < this.height) {
        neighbors.push(this.tiles[tx][ty]);
      }
    }
    return neighbors;
  }

  isTilePassableForUnit(tile, unit = null) {
    if (!tile || !tile.walkable) return false;
    if (tile.unitOccupant && tile.unitOccupant !== unit) return false;

    const building = tile.occupiedBy;
    if (!building || building === unit) return true;
    return Boolean(
      building.def?.isGate &&
      (!unit || building.faction === unit.faction)
    );
  }

  findPath(startTile, endTile, unit = null) {
    if (!startTile || !endTile) return null;
    if (startTile === endTile) return [];

    const endIsBlocked = !endTile.walkable ||
      (endTile.unitOccupant && endTile.unitOccupant !== unit);
    if (endIsBlocked) {
      const neighbors = this.getNeighbors(endTile);
      const walkableNeighbors = neighbors.filter(n =>
        this.isTilePassableForUnit(n, unit) && !n.occupiedBy
      );
      if (walkableNeighbors.length > 0) {
        walkableNeighbors.sort((a, b) => {
          const distA = Math.hypot(a.x - startTile.x, a.y - startTile.y);
          const distB = Math.hypot(b.x - startTile.x, b.y - startTile.y);
          return distA - distB;
        });
        endTile = walkableNeighbors[0];
      } else {
        return null;
      }
    }

    if (startTile === endTile) return [];

    const openHeap = new PriorityQueue();
    const cameFrom = new Map();
    const gScore = new Map();
    const closedSet = new Set();

    gScore.set(startTile, 0);
    openHeap.push(startTile, this.heuristic(startTile, endTile));

    // The starting bases are far apart on the wide battlefield. Allow the
    // search to explore enough of the map to find a valid route around terrain
    // instead of failing solely because of the old fixed 500-node cap.
    const maxNodes = Math.min(
      this.width * this.height,
      Math.max(5000, Math.round((this.width + this.height) * 10))
    );
    let remainingNodes = maxNodes;
    while (!openHeap.isEmpty() && remainingNodes-- > 0) {
      const current = openHeap.pop();

      if (current === endTile) {
        const path = [];
        let temp = current;
        while (cameFrom.has(temp)) {
          path.push(temp);
          temp = cameFrom.get(temp);
        }
        return path.reverse();
      }

      if (closedSet.has(current)) continue;
      closedSet.add(current);

      for (const neighbor of this.getNeighbors(current)) {
        if (closedSet.has(neighbor)) continue;

        if (!this.isTilePassableForUnit(neighbor, unit)) continue;

        // Same-parity rows are visually aligned, so allow a direct two-row
        // step instead of forcing units through an offset row and making them
        // zigzag. Use logical distance so this link costs two normal row steps.
        const deltaX = neighbor.x - current.x;
        const deltaY = neighbor.y - current.y;
        const moveCost = Math.hypot(deltaX, deltaY) * (1 + neighbor.elevation * 0.4);
        const tentativeGScore = (gScore.get(current) ?? Infinity) + moveCost;

        if (tentativeGScore < (gScore.get(neighbor) ?? Infinity)) {
          cameFrom.set(neighbor, current);
          gScore.set(neighbor, tentativeGScore);
          openHeap.push(neighbor, tentativeGScore + this.heuristic(neighbor, endTile));
        }
      }
    }

    return null;
  }

  heuristic(a, b) {
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    const F = 1.414 - 1.0;
    return dx < dy ? F * dx + dy : F * dy + dx;
  }

  drawGroundTile(ctx, sx, sy, fill, stroke, lineWidth = 0.5) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(sx, sy - this.halfH);
    ctx.lineTo(sx + this.halfW, sy);
    ctx.lineTo(sx, sy + this.halfH);
    ctx.lineTo(sx - this.halfW, sy);
    ctx.closePath();
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  drawElevatedBlock(ctx, sx, sy, h, topColor, leftColor, rightColor, edgeColor) {
    const left = sx - this.halfW;
    const right = sx + this.halfW;
    const roofLeft = left;
    const roofRight = right;
    const roofTop = sy - this.halfH - h;
    const roofSideY = sy - h;

    ctx.fillStyle = leftColor;
    ctx.beginPath();
    ctx.moveTo(left, sy);
    ctx.lineTo(sx, sy + this.halfH);
    ctx.lineTo(sx, sy + this.halfH - h);
    ctx.lineTo(left, sy - h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = rightColor;
    ctx.beginPath();
    ctx.moveTo(sx, sy + this.halfH);
    ctx.lineTo(right, sy);
    ctx.lineTo(right, sy - h);
    ctx.lineTo(sx, sy + this.halfH - h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = topColor;
    ctx.beginPath();
    ctx.moveTo(sx, roofTop);
    ctx.lineTo(roofRight, roofSideY);
    ctx.lineTo(sx, sy + this.halfH - h);
    ctx.lineTo(roofLeft, roofSideY);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = edgeColor;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  drawGrassTile(ctx, sx, sy, tile, ambient, dayCycle) {
    const elevOff = this.getElevationOffset(tile.elevation);
    const syE = sy - elevOff;

    const biomeKey = tile.biome || BIOMES.temperate;
    const grassColors = GROUND_PALETTES[biomeKey] || GROUND_PALETTES.temperate;
    const pal = grassColors[tile.elevation];

    if (tile.elevation > 0) {
      const h = 8 + tile.elevation * 6;
      this.drawElevatedBlock(
        ctx, sx, sy, h,
        dayCycle.tintColor(pal.top, ambient),
        dayCycle.tintColor(pal.sideDark, ambient),
        dayCycle.tintColor(pal.sideLight, ambient),
        dayCycle.tintColor(pal.edge, ambient)
      );
    } else {
      this.drawGroundTile(ctx, sx, syE,
        dayCycle.tintColor(pal.top, ambient),
        dayCycle.tintColor(pal.edge, ambient)
      );
    }
  }

  drawWaterTile(ctx, sx, sy, tile, time, ambient, dayCycle) {
    const elevOff = this.getElevationOffset(tile.elevation);
    const syE = sy - elevOff;
    const pulse = Math.sin(time * 2.5 + tile.x * 0.4 + tile.y * 0.3) * 0.5 + 0.5;
    const isIce = tile.biome === BIOMES.polar;

    const lakeTop = dayCycle.tintColor(isIce ? '#c8dce8' : '#0a2848', ambient);
    const lakeEdge = dayCycle.tintColor(isIce ? '#a8c0d0' : '#143858', ambient);
    const riverTop = dayCycle.tintColor(isIce ? '#b8d0e0' : '#0c3058', ambient);
    const riverEdge = dayCycle.tintColor(isIce ? '#98b4c8' : '#185070', ambient);

    if (tile.isBridge) {
      this.drawGroundTile(ctx, sx, syE, riverTop, riverEdge);
      ctx.fillStyle = dayCycle.tintColor('#76502f', ambient);
      ctx.beginPath();
      ctx.moveTo(sx - this.halfW * 0.72, syE);
      ctx.lineTo(sx, syE - this.halfH * 0.45);
      ctx.lineTo(sx + this.halfW * 0.72, syE);
      ctx.lineTo(sx, syE + this.halfH * 0.45);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = dayCycle.tintColor('#c69656', ambient);
      ctx.lineWidth = 2;
      for (let i = -2; i <= 2; i++) {
        const offset = i * 7;
        ctx.beginPath();
        ctx.moveTo(sx - this.halfW * 0.48 + offset * 0.15, syE - this.halfH * 0.25 + offset * 0.35);
        ctx.lineTo(sx + this.halfW * 0.48 + offset * 0.15, syE + this.halfH * 0.25 + offset * 0.35);
        ctx.stroke();
      }
      return;
    }

    if (tile.waterVariant === 'lake') {
      this.drawGroundTile(ctx, sx, syE, lakeTop, lakeEdge);

      if (!isIce) {
        ctx.fillStyle = `rgba(80, 180, 255, ${0.08 + pulse * 0.06})`;
        ctx.beginPath();
        ctx.ellipse(sx, syE, this.halfW * 0.55, this.halfH * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.12 + pulse * 0.08})`;
        ctx.beginPath();
        ctx.ellipse(sx, syE, this.halfW * 0.45, this.halfH * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (tile.waterVariant === 'waterfall') {
      const dropH = 18 + (tile.waterfallDrop || 1) * 12;

      this.drawGroundTile(ctx, sx, syE, riverTop, riverEdge);

      const grad = ctx.createLinearGradient(sx, syE - dropH, sx, syE + this.halfH);
      grad.addColorStop(0, `rgba(180, 220, 255, ${0.55 + pulse * 0.2})`);
      grad.addColorStop(0.5, `rgba(60, 140, 220, ${0.45 + pulse * 0.15})`);
      grad.addColorStop(1, `rgba(20, 60, 120, ${0.3})`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(sx - 8, syE - dropH);
      ctx.lineTo(sx + 8, syE - dropH);
      ctx.lineTo(sx + 5, syE + this.halfH * 0.5);
      ctx.lineTo(sx - 5, syE + this.halfH * 0.5);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = `rgba(255, 255, 255, ${0.15 + pulse * 0.2})`;
      for (let i = 0; i < 3; i++) {
        const ox = -4 + i * 4;
        ctx.fillRect(sx + ox, syE - dropH + ((time * 80 + i * 20) % dropH), 2, 6);
      }
    } else {
      // River
      this.drawGroundTile(ctx, sx, syE, riverTop, riverEdge);

      const flowOffset = (time * 40 + tile.x * 12 + tile.y * 8) % 24;
      ctx.strokeStyle = `rgba(100, 200, 255, ${0.25 + pulse * 0.15})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx - this.halfW + flowOffset - 24, sy);
      ctx.lineTo(sx + this.halfW + flowOffset - 24, sy);
      ctx.stroke();
    }
  }

  draw(ctx, camera, time = 0, ambient = null, dayCycle = null) {
    const defaultAmbient = { ambient: 1, warm: 0, overlay: 0 };
    const amb = ambient || defaultAmbient;
    const dc = dayCycle || { tintColor: (hex) => hex };

    // Large country maps can contain hundreds of thousands of cells. Only
    // visit the tile window that can overlap the current camera viewport.
    const minX = Math.max(0, Math.floor((camera.x - this.mapOriginX - this.halfW) / this.tileWidth) - 2);
    const maxX = Math.min(this.width - 1, Math.ceil((camera.x + camera.width - this.mapOriginX + this.halfW) / this.tileWidth) + 2);
    const minY = Math.max(0, Math.floor(camera.y / this.halfH) - 2);
    const maxY = Math.min(this.height - 1, Math.ceil((camera.y + camera.height) / this.halfH) + 2);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const tile = this.tiles[x][y];
        const coords = this.getTileCoords(x, y);
        const maxHeight = 20 + tile.elevation * 16 + (tile.waterVariant === 'waterfall' ? 30 : 0);

        if (coords.x + this.halfW < camera.x || coords.x - this.halfW > camera.x + camera.width ||
            coords.y + this.halfH < camera.y - maxHeight || coords.y - this.halfH > camera.y + camera.height) {
          continue;
        }

        const sx = coords.x - camera.x;
        const sy = coords.y - camera.y;

        if (tile.type === 'water') {
          this.drawWaterTile(ctx, sx, sy, tile, time, amb, dc);
        } else if (tile.type === 'grass') {
          this.drawGrassTile(ctx, sx, sy, tile, amb, dc);
        } else if (tile.type === 'rock') {
          const h = 18;
          const rockPal = ROCK_PALETTES[tile.biome] || ROCK_PALETTES.temperate;
          this.drawElevatedBlock(
            ctx, sx, sy, h,
            dc.tintColor(rockPal.top, amb),
            dc.tintColor(rockPal.left, amb),
            dc.tintColor(rockPal.right, amb),
            dc.tintColor(rockPal.edge, amb)
          );
        } else if (tile.type === 'ore') {
          const elevOff = this.getElevationOffset(tile.elevation);
          const syE = sy - elevOff;
          const groundPal = (GROUND_PALETTES[tile.biome] || GROUND_PALETTES.temperate)[tile.elevation];

          this.drawGroundTile(ctx, sx, syE,
            dc.tintColor(groundPal.top, amb),
            dc.tintColor(groundPal.edge, amb)
          );

          const ratio = tile.resourceAmount / tile.maxResource;
          const cryH = 22 * ratio;
          const cryW = 6 * ratio;

          ctx.shadowColor = '#00ff66';
          ctx.shadowBlur = 8 * ratio * amb.ambient;
          ctx.fillStyle = `oklch(${0.5 + 0.3 * ratio * amb.ambient} 0.25 142 / ${0.5 + 0.5 * ratio})`;

          ctx.beginPath();
          ctx.moveTo(sx, syE - cryH);
          ctx.lineTo(sx + cryW, syE - cryH / 2);
          ctx.lineTo(sx, syE);
          ctx.lineTo(sx - cryW, syE - cryH / 2);
          ctx.closePath();
          ctx.fill();

          if (ratio > 0.5) {
            ctx.fillStyle = `oklch(${0.45 + 0.25 * ratio * amb.ambient} 0.22 142 / ${ratio})`;
            ctx.beginPath();
            ctx.moveTo(sx - 10, syE + 2 - cryH / 1.6);
            ctx.lineTo(sx - 10 + 3, syE + 2 - cryH / 3.2);
            ctx.lineTo(sx - 10, syE + 2);
            ctx.lineTo(sx - 10 - 3, syE + 2 - cryH / 3.2);
            ctx.closePath();
            ctx.fill();
          }

          ctx.shadowBlur = 0;
        }
      }
    }
  }
}
