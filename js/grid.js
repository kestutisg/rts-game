/**
 * Grid & Pathfinding Manager for Tiberian Odyssey (Isometric 2.5D Upgrade)
 * Handles the isometric projection coordinate conversions, rendering, and pathfinding.
 */

export class Tile {
  constructor(x, y, type = 'grass') {
    this.x = x; // grid x coordinate
    this.y = y; // grid y coordinate
    this.type = type; // 'grass', 'rock', 'ore'
    this.resourceAmount = 0;
    this.maxResource = 100;
    this.walkable = type === 'grass';
    this.occupiedBy = null;
  }
}

export class Grid {
  constructor(width, height, tileSize) {
    this.width = width;
    this.height = height;
    this.tileSize = tileSize; // base cell size
    
    // Isometric metrics (2:1 ratio standard)
    this.isoWidth = this.tileSize * 2; // e.g. 80px
    this.isoHeight = this.tileSize;      // e.g. 40px
    this.halfW = this.isoWidth / 2;
    this.halfH = this.isoHeight / 2;

    // Full bounds of the isometric diamond map
    this.mapWidthPx = (this.width + this.height) * this.halfW;
    this.mapHeightPx = (this.width + this.height) * this.halfH;

    this.generateMap();
  }

  generateMap() {
    this.tiles = [];
    for (let x = 0; x < this.width; x++) {
      this.tiles[x] = [];
      for (let y = 0; y < this.height; y++) {
        this.tiles[x][y] = new Tile(x, y, 'grass');
      }
    }

    this.createClusters(12, 'rock', 3, 0.4);
    this.createClusters(8, 'ore', 4, 0.65);

    // Populate resource amounts
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        const tile = this.tiles[x][y];
        if (tile.type === 'ore') {
          tile.resourceAmount = Math.floor(Math.random() * 40) + 60;
          tile.walkable = true;
        }
      }
    }

    this.clearSpawnArea(10, 10, 8); // Player
    this.clearSpawnArea(this.width - 11, this.height - 11, 8); // Enemy
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

  /**
   * Projects 2D grid coordinates to 2.5D Isometric World Space
   */
  getTileCoords(x, y) {
    const worldX = (x - y) * this.halfW + this.height * this.halfW;
    const worldY = (x + y) * this.halfH;
    return { x: worldX, y: worldY };
  }

  /**
   * Inverse Isometric conversion: World coordinate back to 2D grid coordinates
   */
  getTileAtWorld(worldX, worldY) {
    const U = (worldX - this.height * this.halfW) / this.halfW;
    const V = worldY / this.halfH;
    const tx = Math.floor((V + U) / 2);
    const ty = Math.floor((V - V + V - U) / 2); // simplified: (V - U) / 2
    const yGrid = Math.floor((V - U) / 2);

    if (tx >= 0 && tx < this.width && yGrid >= 0 && yGrid < this.height) {
      return this.tiles[tx][yGrid];
    }
    return null;
  }

  getTile(x, y) {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      return this.tiles[x][y];
    }
    return null;
  }

  regrowResources() {
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        const tile = this.tiles[x][y];
        if (tile.type === 'ore' && tile.resourceAmount > 0) {
          if (tile.resourceAmount < tile.maxResource && Math.random() < 0.05) {
            tile.resourceAmount = Math.min(tile.maxResource, tile.resourceAmount + 5);
          }

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
      {x: 0, y: -1}, {x: 1, y: 0}, {x: 0, y: 1}, {x: -1, y: 0},
      {x: -1, y: -1}, {x: 1, y: -1}, {x: 1, y: 1}, {x: -1, y: 1}
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

  findPath(startTile, endTile, unit = null) {
    if (!startTile || !endTile) return null;
    
    if (!endTile.walkable && endTile.occupiedBy !== unit) {
      const neighbors = this.getNeighbors(endTile);
      const walkableNeighbors = neighbors.filter(n => n.walkable && (!n.occupiedBy || n.occupiedBy === unit));
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

    const openSet = [startTile];
    const cameFrom = new Map();

    const gScore = new Map();
    gScore.set(startTile, 0);

    const fScore = new Map();
    fScore.set(startTile, this.heuristic(startTile, endTile));

    while (openSet.length > 0) {
      openSet.sort((a, b) => (fScore.get(a) ?? Infinity) - (fScore.get(b) ?? Infinity));
      const current = openSet.shift();

      if (current === endTile) {
        const path = [];
        let temp = current;
        while (cameFrom.has(temp)) {
          path.push(temp);
          temp = cameFrom.get(temp);
        }
        return path.reverse();
      }

      const neighbors = this.getNeighbors(current);
      for (const neighbor of neighbors) {
        const isOccupied = neighbor.occupiedBy && neighbor.occupiedBy !== unit && neighbor !== endTile;
        if (!neighbor.walkable || isOccupied) {
          continue;
        }

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

    return null;
  }

  heuristic(a, b) {
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    const F = 1.414 - 1.0;
    return dx < dy ? F * dx + dy : F * dy + dx;
  }

  /**
   * Draw the entire isometric tile grid
   */
  draw(ctx, camera) {
    // Render flat ground tiles. Loop rows & cols
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        const tile = this.tiles[x][y];
        const coords = this.getTileCoords(x, y);

        // Frustum culling (account for 3D rock heights)
        const rockH = 20;
        if (coords.x + this.halfW < camera.x || coords.x - this.halfW > camera.x + camera.width ||
            coords.y + this.halfH < camera.y - rockH || coords.y - this.halfH > camera.y + camera.height) {
          continue;
        }

        const sx = coords.x - camera.x;
        const sy = coords.y - camera.y;

        // Draw Grass Flat Tile
        if (tile.type === 'grass') {
          ctx.fillStyle = '#101518';
          ctx.beginPath();
          ctx.moveTo(sx, sy - this.halfH);
          ctx.lineTo(sx + this.halfW, sy);
          ctx.lineTo(sx, sy + this.halfH);
          ctx.lineTo(sx - this.halfW, sy);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = '#182025';
          ctx.lineWidth = 0.5;
          ctx.stroke();

        } else if (tile.type === 'rock') {
          // Draw 2.5D Rock Prism
          const h = 18; // Rock height offset

          // Left Wall Face
          ctx.fillStyle = '#181e22';
          ctx.beginPath();
          ctx.moveTo(sx - this.halfW, sy);
          ctx.lineTo(sx, sy + this.halfH);
          ctx.lineTo(sx, sy + this.halfH - h);
          ctx.lineTo(sx - this.halfW, sy - h);
          ctx.closePath();
          ctx.fill();
          
          // Right Wall Face
          ctx.fillStyle = '#22292f';
          ctx.beginPath();
          ctx.moveTo(sx, sy + this.halfH);
          ctx.lineTo(sx + this.halfW, sy);
          ctx.lineTo(sx + this.halfW, sy - h);
          ctx.lineTo(sx, sy + this.halfH - h);
          ctx.closePath();
          ctx.fill();

          // Top Diamond Face
          ctx.fillStyle = '#303a42';
          ctx.beginPath();
          ctx.moveTo(sx, sy - this.halfH - h);
          ctx.lineTo(sx + this.halfW, sy - h);
          ctx.lineTo(sx, sy + this.halfH - h);
          ctx.lineTo(sx - this.halfW, sy - h);
          ctx.closePath();
          ctx.fill();

          // Highlight edges
          ctx.strokeStyle = '#414d57';
          ctx.lineWidth = 0.5;
          ctx.stroke();

        } else if (tile.type === 'ore') {
          // Draw flat green tiberium field base
          ctx.fillStyle = '#0f1715';
          ctx.beginPath();
          ctx.moveTo(sx, sy - this.halfH);
          ctx.lineTo(sx + this.halfW, sy);
          ctx.lineTo(sx, sy + this.halfH);
          ctx.lineTo(sx - this.halfW, sy);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = '#1c2e24';
          ctx.lineWidth = 0.5;
          ctx.stroke();

          // Draw 3D Crystal spire (height depends on resource amount)
          const ratio = tile.resourceAmount / tile.maxResource;
          const cryH = 22 * ratio;
          const cryW = 6 * ratio;

          ctx.shadowColor = '#00ff66';
          ctx.shadowBlur = 8 * ratio;
          ctx.fillStyle = `oklch(0.8 0.25 142 / ${0.5 + 0.5 * ratio})`;

          // Vertical crystal spire drawn in center
          ctx.beginPath();
          ctx.moveTo(sx, sy - cryH); // top spire tip
          ctx.lineTo(sx + cryW, sy - cryH/2); // right
          ctx.lineTo(sx, sy); // bottom base
          ctx.lineTo(sx - cryW, sy - cryH/2); // left
          ctx.closePath();
          ctx.fill();

          // Secondary minor crystal spire
          if (ratio > 0.5) {
            ctx.fillStyle = `oklch(0.7 0.22 142 / ${ratio})`;
            ctx.beginPath();
            ctx.moveTo(sx - 10, sy + 2 - cryH/1.6);
            ctx.lineTo(sx - 10 + 3, sy + 2 - cryH/3.2);
            ctx.lineTo(sx - 10, sy + 2);
            ctx.lineTo(sx - 10 - 3, sy + 2 - cryH/3.2);
            ctx.closePath();
            ctx.fill();
          }

          ctx.shadowBlur = 0;
        }
      }
    }
  }
}
