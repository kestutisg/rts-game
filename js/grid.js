/**
 * Grid & Pathfinding Manager for Tiberian Odyssey (Isometric 2.5D Upgrade)
 * Handles isometric projection, terrain generation (elevation, water),
 * coordinate conversions, rendering, and pathfinding.
 */

export class Tile {
  constructor(x, y, type = 'grass') {
    this.x = x;
    this.y = y;
    this.type = type; // 'grass', 'rock', 'ore', 'water'
    this.waterVariant = null; // 'lake', 'river', 'waterfall'
    this.elevation = 0; // 0 = flat, 1 = hill, 2 = peak
    this.resourceAmount = 0;
    this.maxResource = 100;
    this.walkable = type === 'grass' || type === 'ore';
    this.occupiedBy = null;
  }
}

export class Grid {
  constructor(width, height, tileSize) {
    this.width = width;
    this.height = height;
    this.tileSize = tileSize;

    this.isoWidth = this.tileSize * 2;
    this.isoHeight = this.tileSize;
    this.halfW = this.isoWidth / 2;
    this.halfH = this.isoHeight / 2;

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

    this.generateElevation();
    this.generateLakes(4, 5, 0.55);
    this.generateRivers(2);
    this.markWaterfalls();
    this.createClusters(12, 'rock', 3, 0.4);
    this.createClusters(8, 'ore', 4, 0.65);

    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        const tile = this.tiles[x][y];
        if (tile.type === 'ore') {
          tile.resourceAmount = Math.floor(Math.random() * 40) + 60;
          tile.walkable = true;
        }
      }
    }

    this.clearSpawnArea(10, 10, 8);
    this.clearSpawnArea(this.width - 11, this.height - 11, 8);
  }

  generateElevation() {
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
    for (let c = 0; c < 7; c++) {
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
    if (tile.type === 'rock') return;

    tile.type = 'water';
    tile.waterVariant = variant;
    tile.walkable = false;
    tile.resourceAmount = 0;
    tile.elevation = Math.min(tile.elevation, variant === 'lake' ? 0 : tile.elevation);
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
    for (let r = 0; r < count; r++) {
      const lakes = [];
      for (let x = 0; x < this.width; x++) {
        for (let y = 0; y < this.height; y++) {
          if (this.tiles[x][y].waterVariant === 'lake') {
            lakes.push({ x, y });
          }
        }
      }

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
        if (tile.type !== 'water' || tile.waterVariant === 'lake') continue;

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
          tile.waterVariant = null;
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
    const worldX = (x - y) * this.halfW + this.height * this.halfW;
    const worldY = (x + y) * this.halfH;
    return { x: worldX, y: worldY };
  }

  getTileAtWorld(worldX, worldY) {
    const U = (worldX - this.height * this.halfW) / this.halfW;
    const V = worldY / this.halfH;
    const tx = Math.floor((V + U) / 2);
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
      { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
      { x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }
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

      for (const neighbor of this.getNeighbors(current)) {
        const isOccupied = neighbor.occupiedBy && neighbor.occupiedBy !== unit && neighbor !== endTile;
        if (!neighbor.walkable || isOccupied) continue;

        const isDiagonal = neighbor.x !== current.x && neighbor.y !== current.y;
        const elevCost = 1 + neighbor.elevation * 0.4;
        const moveCost = (isDiagonal ? 1.414 : 1.0) * elevCost;
        const tentativeGScore = (gScore.get(current) ?? Infinity) + moveCost;

        if (tentativeGScore < (gScore.get(neighbor) ?? Infinity)) {
          cameFrom.set(neighbor, current);
          gScore.set(neighbor, tentativeGScore);
          fScore.set(neighbor, tentativeGScore + this.heuristic(neighbor, endTile));
          if (!openSet.includes(neighbor)) openSet.push(neighbor);
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

  drawDiamond(ctx, sx, sy, fill, stroke, lineWidth = 0.5) {
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
    ctx.fillStyle = leftColor;
    ctx.beginPath();
    ctx.moveTo(sx - this.halfW, sy);
    ctx.lineTo(sx, sy + this.halfH);
    ctx.lineTo(sx, sy + this.halfH - h);
    ctx.lineTo(sx - this.halfW, sy - h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = rightColor;
    ctx.beginPath();
    ctx.moveTo(sx, sy + this.halfH);
    ctx.lineTo(sx + this.halfW, sy);
    ctx.lineTo(sx + this.halfW, sy - h);
    ctx.lineTo(sx, sy + this.halfH - h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = topColor;
    ctx.beginPath();
    ctx.moveTo(sx, sy - this.halfH - h);
    ctx.lineTo(sx + this.halfW, sy - h);
    ctx.lineTo(sx, sy + this.halfH - h);
    ctx.lineTo(sx - this.halfW, sy - h);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = edgeColor;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  drawGrassTile(ctx, sx, sy, tile, ambient, dayCycle) {
    const elevOff = this.getElevationOffset(tile.elevation);
    const syE = sy - elevOff;

    const grassColors = [
      { top: '#101518', edge: '#182025' },
      { top: '#141c20', edge: '#1c2830' },
      { top: '#182428', edge: '#223038' },
    ];
    const pal = grassColors[tile.elevation];

    if (tile.elevation > 0) {
      const h = 8 + tile.elevation * 6;
      this.drawElevatedBlock(
        ctx, sx, sy, h,
        dayCycle.tintColor(pal.top, ambient),
        dayCycle.tintColor('#121820', ambient),
        dayCycle.tintColor('#1a2228', ambient),
        dayCycle.tintColor(pal.edge, ambient)
      );
    } else {
      this.drawDiamond(ctx, sx, syE,
        dayCycle.tintColor(pal.top, ambient),
        dayCycle.tintColor(pal.edge, ambient)
      );
    }
  }

  drawWaterTile(ctx, sx, sy, tile, time, ambient, dayCycle) {
    const elevOff = this.getElevationOffset(tile.elevation);
    const syE = sy - elevOff;
    const pulse = Math.sin(time * 2.5 + tile.x * 0.4 + tile.y * 0.3) * 0.5 + 0.5;

    const lakeTop = dayCycle.tintColor('#0a2848', ambient);
    const lakeEdge = dayCycle.tintColor('#143858', ambient);
    const riverTop = dayCycle.tintColor('#0c3058', ambient);
    const riverEdge = dayCycle.tintColor('#185070', ambient);

    if (tile.waterVariant === 'lake') {
      this.drawDiamond(ctx, sx, syE, lakeTop, lakeEdge);

      ctx.fillStyle = `rgba(80, 180, 255, ${0.08 + pulse * 0.06})`;
      ctx.beginPath();
      ctx.ellipse(sx, syE, this.halfW * 0.55, this.halfH * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (tile.waterVariant === 'waterfall') {
      const dropH = 18 + (tile.waterfallDrop || 1) * 12;

      this.drawDiamond(ctx, sx, syE, riverTop, riverEdge);

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
      this.drawDiamond(ctx, sx, syE, riverTop, riverEdge);

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

    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
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
          this.drawElevatedBlock(
            ctx, sx, sy, h,
            dc.tintColor('#303a42', amb),
            dc.tintColor('#181e22', amb),
            dc.tintColor('#22292f', amb),
            dc.tintColor('#414d57', amb)
          );
        } else if (tile.type === 'ore') {
          const elevOff = this.getElevationOffset(tile.elevation);
          const syE = sy - elevOff;

          this.drawDiamond(ctx, sx, syE,
            dc.tintColor('#0f1715', amb),
            dc.tintColor('#1c2e24', amb)
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
