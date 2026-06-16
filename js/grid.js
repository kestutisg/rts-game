/**
 * Grid & Pathfinding Manager for Tiberian Odyssey
 * Handles the tilemap representation, rendering, resource regrowth, and A* pathfinding.
 */

export class Tile {
  constructor(x, y, type = 'grass') {
    this.x = x; // grid x coordinate
    this.y = y; // grid y coordinate
    this.type = type; // 'grass', 'rock', 'ore' (resource)
    this.resourceAmount = 0; // amount of ore (if type === 'ore')
    this.maxResource = 100;
    this.walkable = type === 'grass';
    this.occupiedBy = null; // reference to building or unit occupying the tile
  }
}

export class Grid {
  constructor(width, height, tileSize) {
    this.width = width;
    this.height = height;
    this.tileSize = tileSize; // pixels per tile (e.g., 40px)
    this.tiles = [];
    
    this.generateMap();
  }

  generateMap() {
    this.tiles = [];
    for (let x = 0; x < this.width; x++) {
      this.tiles[x] = [];
      for (let y = 0; y < this.height; y++) {
        // Default to grass
        this.tiles[x][y] = new Tile(x, y, 'grass');
      }
    }

    // Generate rocks/obstacles in clusters
    this.createClusters(12, 'rock', 3, 0.4);

    // Generate Tiberium ore patches in clusters
    this.createClusters(8, 'ore', 4, 0.65);

    // Populate resource amounts for ore tiles
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        const tile = this.tiles[x][y];
        if (tile.type === 'ore') {
          tile.resourceAmount = Math.floor(Math.random() * 40) + 60; // 60-100 resource
          tile.walkable = true; // harvesters can walk on ore
        }
      }
    }

    // Ensure central areas are relatively clear for player and AI bases
    this.clearSpawnArea(10, 10, 8); // Player base spawn
    this.clearSpawnArea(this.width - 11, this.height - 11, 8); // AI base spawn
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
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance <= radius && Math.random() < density * (1 - distance / radius)) {
              this.tiles[tx][ty].type = type;
              this.tiles[tx][ty].walkable = type !== 'rock';
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
          tile.walkable = true;
          tile.resourceAmount = 0;
        }
      }
    }
  }

  getTileAtWorld(worldX, worldY) {
    const tx = Math.floor(worldX / this.tileSize);
    const ty = Math.floor(worldY / this.tileSize);
    if (tx >= 0 && tx < this.width && ty >= 0 && ty < this.height) {
      return this.tiles[tx][ty];
    }
    return null;
  }

  getTile(x, y) {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      return this.tiles[x][y];
    }
    return null;
  }

  /**
   * Tiberium resource regrowth tick
   * Spreads existing patches slowly over time
   */
  regrowResources() {
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        const tile = this.tiles[x][y];
        if (tile.type === 'ore' && tile.resourceAmount > 0) {
          // Increase resource amount on current tile if not full
          if (tile.resourceAmount < tile.maxResource && Math.random() < 0.05) {
            tile.resourceAmount = Math.min(tile.maxResource, tile.resourceAmount + 5);
          }

          // Small chance to spread to adjacent tiles
          if (tile.resourceAmount > 40 && Math.random() < 0.005) {
            const neighbors = this.getNeighbors(tile);
            const grassNeighbors = neighbors.filter(t => t.type === 'grass' && !t.occupiedBy);
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
    const dirs = [
      {x: 0, y: -1}, {x: 1, y: 0}, {x: 0, y: 1}, {x: -1, y: 0}, // orthogonal
      {x: -1, y: -1}, {x: 1, y: -1}, {x: 1, y: 1}, {x: -1, y: 1} // diagonal
    ];

    for (const dir of dirs) {
      const tx = tile.x + dir.x;
      const ty = tile.y + dir.y;
      if (tx >= 0 && tx < this.width && ty >= 0 && ty < this.height) {
        neighbors.push(this.tiles[tx][ty]);
      }
    }
    return neighbors;
  }

  /**
   * A* Pathfinding algorithm
   * Returns an array of Tiles representing the shortest path from start to end, or null if blocked.
   */
  findPath(startTile, endTile, unit = null) {
    if (!startTile || !endTile) return null;
    if (!endTile.walkable && endTile.occupiedBy !== unit) {
      // If end tile is solid, try to find a walkable neighbor close to it
      const neighbors = this.getNeighbors(endTile);
      const walkableNeighbors = neighbors.filter(n => n.walkable && (!n.occupiedBy || n.occupiedBy === unit));
      if (walkableNeighbors.length > 0) {
        // Sort by distance to startTile
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

    const openSet = [startTile];
    const cameFrom = new Map();

    const gScore = new Map();
    gScore.set(startTile, 0);

    const fScore = new Map();
    fScore.set(startTile, this.heuristic(startTile, endTile));

    while (openSet.length > 0) {
      // Find node in openSet with lowest fScore
      openSet.sort((a, b) => (fScore.get(a) ?? Infinity) - (fScore.get(b) ?? Infinity));
      const current = openSet.shift();

      if (current === endTile) {
        // Reconstruct path
        const path = [];
        let temp = current;
        while (cameFrom.has(temp)) {
          path.push(temp);
          temp = cameFrom.get(temp);
        }
        return path.reverse(); // returns path from first step to destination
      }

      const neighbors = this.getNeighbors(current);
      for (const neighbor of neighbors) {
        // Pathfinding checks walkability. We also block if another unit/building is on it,
        // unless it is the destination or the current tile itself.
        const isOccupied = neighbor.occupiedBy && neighbor.occupiedBy !== unit && neighbor !== endTile;
        if (!neighbor.walkable || isOccupied) {
          continue;
        }

        // Diagonal move cost = 1.4, orthogonal = 1.0
        const isDiagonal = neighbor.x !== current.x && neighbor.y !== current.y;
        const moveCost = isDiagonal ? 1.414 : 1.0;
        const tentativeGScore = (gScore.get(current) ?? Infinity) + moveCost;

        if (tentativeGScore < (gScore.get(neighbor) ?? Infinity)) {
          cameFrom.set(neighbor, current);
          gScore.set(neighbor, tentativeGScore);
          fScore.set(neighbor, tentativeGScore + this.heuristic(neighbor, endTile));

          if (!openSet.includes(neighbor)) {
            openSet.push(neighbor);
          }
        }
      }
    }

    return null; // No path found
  }

  heuristic(a, b) {
    // Octile distance for 8-directional movement
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    const F = 1.414 - 1.0;
    return dx < dy ? F * dx + dy : F * dy + dx;
  }

  /**
   * Draw the entire map to the viewport
   */
  draw(ctx, camera) {
    // Determine the range of visible tiles (frustum culling for efficiency)
    const startX = Math.max(0, Math.floor(camera.x / this.tileSize));
    const startY = Math.max(0, Math.floor(camera.y / this.tileSize));
    const endX = Math.min(this.width, Math.ceil((camera.x + camera.width) / this.tileSize));
    const endY = Math.min(this.height, Math.ceil((camera.y + camera.height) / this.tileSize));

    for (let x = startX; x < endX; x++) {
      for (let y = startY; y < endY; y++) {
        const tile = this.tiles[x][y];
        const screenX = x * this.tileSize - camera.x;
        const screenY = y * this.tileSize - camera.y;

        // Draw tile terrain base
        if (tile.type === 'grass') {
          // Draw subtle dark grid pattern to look retro-sci-fi
          ctx.fillStyle = '#101518';
          ctx.fillRect(screenX, screenY, this.tileSize, this.tileSize);
          
          ctx.strokeStyle = '#182025';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(screenX, screenY, this.tileSize, this.tileSize);
        } else if (tile.type === 'rock') {
          // Obstacle style: dark block with jagged borders
          ctx.fillStyle = '#22292f';
          ctx.fillRect(screenX, screenY, this.tileSize, this.tileSize);
          
          ctx.strokeStyle = '#323a42';
          ctx.lineWidth = 1;
          ctx.strokeRect(screenX + 2, screenY + 2, this.tileSize - 4, this.tileSize - 4);
          
          // Little detail inside rock
          ctx.fillStyle = '#1b2025';
          ctx.fillRect(screenX + 6, screenY + 6, this.tileSize - 12, this.tileSize - 12);
        } else if (tile.type === 'ore') {
          // Resource style: neon glowing crystal mounds
          ctx.fillStyle = '#0f1715'; // Dark tiberium field base
          ctx.fillRect(screenX, screenY, this.tileSize, this.tileSize);
          
          ctx.strokeStyle = '#1d2c25';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(screenX, screenY, this.tileSize, this.tileSize);

          // Draw the crystal patch (drawn larger depending on resourceAmount)
          const ratio = tile.resourceAmount / tile.maxResource;
          const radius = (this.tileSize / 2.5) * ratio;

          ctx.shadowColor = '#00ff66';
          ctx.shadowBlur = 8 * ratio;
          
          // Draw 1-3 crystal shapes on the tile
          ctx.fillStyle = `oklch(0.8 0.25 142 / ${0.4 + 0.6 * ratio})`;
          ctx.beginPath();
          ctx.moveTo(screenX + this.tileSize / 2, screenY + this.tileSize / 2 - radius);
          ctx.lineTo(screenX + this.tileSize / 2 + radius, screenY + this.tileSize / 2 + radius / 2);
          ctx.lineTo(screenX + this.tileSize / 2 - radius, screenY + this.tileSize / 2 + radius / 2);
          ctx.closePath();
          ctx.fill();

          if (ratio > 0.6) {
            // Draw a second smaller crystal
            ctx.fillStyle = `oklch(0.7 0.22 142 / ${ratio})`;
            ctx.beginPath();
            ctx.moveTo(screenX + this.tileSize / 3, screenY + this.tileSize * 0.7 - radius / 2);
            ctx.lineTo(screenX + this.tileSize / 3 + radius / 2, screenY + this.tileSize * 0.7 + radius / 4);
            ctx.lineTo(screenX + this.tileSize / 3 - radius / 2, screenY + this.tileSize * 0.7 + radius / 4);
            ctx.closePath();
            ctx.fill();
          }

          // Reset shadow fields so it doesn't slow down rendering other elements
          ctx.shadowBlur = 0;
        }
      }
    }
  }
}
