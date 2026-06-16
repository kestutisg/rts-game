import { Entity } from './entities.js';
import { Unit, Harvester } from './unit.js';

export class Building extends Entity {
  constructor(id, faction, type, gridX, gridY, tileSize) {
    let maxHealth = 500;
    let gridWidth = 2;
    let gridHeight = 2;
    let powerProd = 0;
    let powerUse = 0;
    let buildingHeight = 20; // 3D height extrusion

    switch (type) {
      case 'cyard':
        maxHealth = 1500;
        gridWidth = 3;
        gridHeight = 3;
        powerProd = 0;
        powerUse = 0;
        buildingHeight = 35;
        break;
      case 'power':
        maxHealth = 600;
        gridWidth = 2;
        gridHeight = 2;
        powerProd = 100;
        powerUse = 0;
        buildingHeight = 25;
        break;
      case 'refinery':
        maxHealth = 1000;
        gridWidth = 3;
        gridHeight = 2;
        powerProd = 0;
        powerUse = 40;
        buildingHeight = 28;
        break;
      case 'barracks':
        maxHealth = 800;
        gridWidth = 2;
        gridHeight = 2;
        powerProd = 0;
        powerUse = 20;
        buildingHeight = 24;
        break;
    }

    super(id, faction, maxHealth, maxHealth);
    
    this.type = type;
    this.gridX = gridX;
    this.gridY = gridY;
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;
    this.isBuilding = true;
    this.height3D = buildingHeight;
    
    this.powerProduction = powerProd;
    this.powerUsage = powerUse;
    
    // Isometric metrics to pre-calculate world coordinates
    const mapHeight = 60; // constant grid height
    const halfW = tileSize;
    const halfH = tileSize / 2;

    // Calculate center world coordinates for selection overlays and AI targeting
    this.x = (gridX - gridY) * halfW + mapHeight * halfW + (gridWidth - gridHeight) * halfW / 2;
    this.y = (gridX + gridY) * halfH + (gridWidth + gridHeight) * halfH / 2;
    
    this.widthPx = gridWidth * tileSize * 2; // bounding size for selection ellipses
    this.heightPx = gridHeight * tileSize;
    
    this.isUnderConstruction = true;
    this.constructionProgress = 0;
    this.constructionDuration = 4.0;
    
    this.buildQueue = [];
    this.trainingProgress = 0;
    
    // Rally point in world space
    this.rallyPoint = {
      x: this.x + (halfW * 2.5),
      y: this.y + (halfH * 2.5)
    };
  }

  update(dt, game) {
    if (this.isDead) return;

    const isLowPower = game.isLowPower(this.faction);
    const speedMultiplier = isLowPower ? 0.5 : 1.0;

    if (this.isUnderConstruction) {
      this.constructionProgress += (dt / this.constructionDuration) * speedMultiplier;
      if (this.constructionProgress >= 1.0) {
        this.constructionProgress = 1.0;
        this.isUnderConstruction = false;
        this.onBuildComplete(game);
      }
      return;
    }

    if (this.buildQueue.length > 0) {
      const activeItem = this.buildQueue[0];
      
      this.trainingProgress += (dt / activeItem.duration) * speedMultiplier;
      if (this.trainingProgress >= 1.0) {
        this.spawnTrainedUnit(activeItem.type, game);
        this.buildQueue.shift();
        this.trainingProgress = 0;
      }
    }
  }

  onBuildComplete(game) {
    if (this.type === 'refinery') {
      // Spawn harvester on adjacent tile in front
      const spawnTile = game.grid.getTile(this.gridX + 1, this.gridY + 2);
      if (spawnTile) {
        const coords = game.grid.getTileCoords(spawnTile.x, spawnTile.y);
        const harvester = new Harvester(
          game.generateEntityId(), 
          this.faction, 
          coords.x, 
          coords.y
        );
        game.addUnit(harvester);
      }
    }
  }

  queueUnit(unitType) {
    let cost = 100;
    let duration = 3.0;

    switch (unitType) {
      case 'soldier':
        cost = 100;
        duration = 3.0;
        break;
      case 'rocket':
        cost = 300;
        duration = 5.0;
        break;
      case 'tank':
        cost = 800;
        duration = 10.0;
        break;
      case 'harvester':
        cost = 1000;
        duration = 12.0;
        break;
    }

    this.buildQueue.push({ type: unitType, cost, duration });
  }

  spawnTrainedUnit(unitType, game) {
    let spawnTile = null;
    const searchDirs = [
      {x: 0, y: this.gridHeight}, // South
      {x: this.gridWidth, y: 0}, // East
      {x: -1, y: 0},
      {x: 0, y: -1}
    ];

    for (const dir of searchDirs) {
      const tx = this.gridX + dir.x;
      const ty = this.gridY + dir.y;
      const tile = game.grid.getTile(tx, ty);
      if (tile && tile.walkable && !tile.occupiedBy) {
        spawnTile = tile;
        break;
      }
    }

    if (!spawnTile) {
      spawnTile = game.grid.getTile(this.gridX, this.gridY + this.gridHeight);
    }

    if (spawnTile) {
      const coords = game.grid.getTileCoords(spawnTile.x, spawnTile.y);
      const unitId = game.generateEntityId();
      
      let unit;
      if (unitType === 'harvester') {
        unit = new Harvester(unitId, this.faction, coords.x, coords.y);
      } else if (unitType === 'soldier') {
        unit = new Unit(unitId, this.faction, 'soldier', coords.x, coords.y, 100, 50, 8, 120);
      } else if (unitType === 'rocket') {
        unit = new Unit(unitId, this.faction, 'rocket', coords.x, coords.y, 85, 45, 22, 180);
      } else if (unitType === 'tank') {
        unit = new Unit(unitId, this.faction, 'tank', coords.x, coords.y, 110, 250, 45, 200);
      }

      game.addUnit(unit);

      // Order unit to move to rally point
      const startTile = game.grid.getTileAtWorld(unit.x, unit.y);
      const rallyTile = game.grid.getTileAtWorld(this.rallyPoint.x, this.rallyPoint.y);
      if (startTile && rallyTile) {
        const path = game.grid.findPath(startTile, rallyTile, unit);
        if (path) {
          unit.path = path;
          unit.pathIndex = 0;
          unit.state = 'moving';
        }
      }
    }
  }

  draw(ctx, camera) {
    const factionColor = this.faction === 'player' ? 'oklch(0.78 0.18 195)' : 'oklch(0.62 0.22 25)';

    // 1. Calculate floor corner projections
    const getScreenCoords = (gx, gy) => {
      const coords = this.getTileCoordsLocal(gx, gy);
      return { x: coords.x - camera.x, y: coords.y - camera.y };
    };

    const ptTop = getScreenCoords(this.gridX, this.gridY);
    const ptRight = getScreenCoords(this.gridX + this.gridWidth, this.gridY);
    const ptBottom = getScreenCoords(this.gridX + this.gridWidth, this.gridY + this.gridHeight);
    const ptLeft = getScreenCoords(this.gridX, this.gridY + this.gridHeight);

    // 2. Draw shadow (flat black offset footprint diamond)
    const sxOffset = 5;
    const syOffset = 3;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.moveTo(ptTop.x + sxOffset, ptTop.y + syOffset);
    ctx.lineTo(ptRight.x + sxOffset, ptRight.y + syOffset);
    ctx.lineTo(ptBottom.x + sxOffset, ptBottom.y + syOffset);
    ctx.lineTo(ptLeft.x + sxOffset, ptLeft.y + syOffset);
    ctx.closePath();
    ctx.fill();

    // 3. Extrude building vertical height
    const h = this.height3D;
    const ptTopRoof = { x: ptTop.x, y: ptTop.y - h };
    const ptRightRoof = { x: ptRight.x, y: ptRight.y - h };
    const ptBottomRoof = { x: ptBottom.x, y: ptBottom.y - h };
    const ptLeftRoof = { x: ptLeft.x, y: ptLeft.y - h };

    // Left wall face
    ctx.fillStyle = '#171c20'; // dark shadow wall
    ctx.beginPath();
    ctx.moveTo(ptLeft.x, ptLeft.y);
    ctx.lineTo(ptBottom.x, ptBottom.y);
    ctx.lineTo(ptBottomRoof.x, ptBottomRoof.y);
    ctx.lineTo(ptLeftRoof.x, ptLeftRoof.y);
    ctx.closePath();
    ctx.fill();

    // Right wall face
    ctx.fillStyle = '#21282d'; // medium wall
    ctx.beginPath();
    ctx.moveTo(ptBottom.x, ptBottom.y);
    ctx.lineTo(ptRight.x, ptRight.y);
    ctx.lineTo(ptRightRoof.x, ptRightRoof.y);
    ctx.lineTo(ptBottomRoof.x, ptBottomRoof.y);
    ctx.closePath();
    ctx.fill();

    // Roof face (flat diamond on top of extruded walls)
    ctx.fillStyle = '#2b333a'; // light roof
    ctx.beginPath();
    ctx.moveTo(ptTopRoof.x, ptTopRoof.y);
    ctx.lineTo(ptRightRoof.x, ptRightRoof.y);
    ctx.lineTo(ptBottomRoof.x, ptBottomRoof.y);
    ctx.lineTo(ptLeftRoof.x, ptLeftRoof.y);
    ctx.closePath();
    ctx.fill();

    // Outline roof
    ctx.strokeStyle = '#3a444d';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 4. Draw type-specific decorative roof decals
    const rx = ptTopRoof.x;
    const ry = ptTopRoof.y + (ptBottomRoof.y - ptTopRoof.y) / 2;
    const roofW = ptRightRoof.x - ptLeftRoof.x;
    const roofH = ptBottomRoof.y - ptTopRoof.y;

    if (this.type === 'cyard') {
      // Large faction generator core on roof
      ctx.fillStyle = factionColor;
      ctx.beginPath();
      ctx.ellipse(rx, ry, roofW * 0.2, roofH * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.stroke();

      // Mini rotating radar dish
      const pulse = Date.now() / 250;
      ctx.strokeStyle = '#78909c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rx, ry - 4);
      ctx.lineTo(rx + Math.cos(pulse) * 12, ry - 4 + Math.sin(pulse) * 6);
      ctx.stroke();

    } else if (this.type === 'power') {
      // Dual glowing coils
      const pulseRatio = (Math.sin(Date.now() / 200) + 1.0) / 2.0;
      ctx.shadowColor = '#00ff66';
      ctx.shadowBlur = this.isUnderConstruction ? 0 : 8 * pulseRatio;
      ctx.fillStyle = this.isUnderConstruction ? '#1c2226' : `oklch(0.8 0.22 142 / ${0.5 + 0.5 * pulseRatio})`;
      
      // Left coil cylinder
      ctx.fillRect(rx - 12, ry - 14, 6, 10);
      ctx.strokeRect(rx - 12, ry - 14, 6, 10);
      // Right coil cylinder
      ctx.fillRect(rx + 6, ry - 14, 6, 10);
      ctx.strokeRect(rx + 6, ry - 14, 6, 10);

      ctx.shadowBlur = 0;

    } else if (this.type === 'refinery') {
      // Large refinery tanks
      ctx.fillStyle = '#455a64';
      ctx.beginPath();
      ctx.ellipse(rx - 15, ry - 4, 10, 8, 0, 0, Math.PI * 2);
      ctx.ellipse(rx + 15, ry + 2, 8, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.stroke();

      // Exhaust chimney
      ctx.fillStyle = '#1c2226';
      ctx.fillRect(rx - 2, ry - 14, 5, 12);
      ctx.strokeRect(rx - 2, ry - 14, 5, 12);

    } else if (this.type === 'barracks') {
      // Faction flag banner
      ctx.fillStyle = factionColor;
      ctx.fillRect(rx - 16, ry - 4, 32, 3);
      ctx.strokeStyle = '#000';
      ctx.strokeRect(rx - 16, ry - 4, 32, 3);
    }

    // 5. Draw construction grid sweep visual
    if (this.isUnderConstruction) {
      // Slice overlay based on progress
      ctx.fillStyle = 'rgba(0, 255, 255, 0.15)';
      ctx.beginPath();
      ctx.moveTo(ptTop.x, ptTop.y - h * this.constructionProgress);
      ctx.lineTo(ptRight.x, ptRight.y - h * this.constructionProgress);
      ctx.lineTo(ptBottom.x, ptBottom.y - h * this.constructionProgress);
      ctx.lineTo(ptLeft.x, ptLeft.y - h * this.constructionProgress);
      ctx.closePath();
      ctx.fill();

      // Green scan line
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ptLeft.x, ptLeft.y - h * this.constructionProgress);
      ctx.lineTo(ptRight.x, ptRight.y - h * this.constructionProgress);
      ctx.stroke();

      // Construction progress bar overlay
      const cy = ptTop.y + (ptBottom.y - ptTop.y) / 2 - h / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(ptTop.x - 25, cy - 4, 50, 8);
      ctx.fillStyle = 'oklch(0.7 0.2 45)';
      ctx.fillRect(ptTop.x - 25, cy - 4, 50 * this.constructionProgress, 8);
    }

    // 6. Draw active training queue
    if (this.buildQueue.length > 0 && !this.isUnderConstruction) {
      const barW = roofW * 0.5;
      const bx = rx - barW / 2;
      const by = ptTopRoof.y + 4;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx, by, barW, 4);
      ctx.fillStyle = 'oklch(0.78 0.18 195)';
      ctx.fillRect(bx, by, barW * this.trainingProgress, 4);
    }

    // 7. Render flat isometric selection ellipsis around floor coordinates
    this.drawSelectionAndHP(ctx, camera, rx, ry + h, roofW * 0.7, roofH * 1.4);
  }

  getTileCoordsLocal(x, y) {
    const mapHeight = 60;
    const halfW = 40; // tile width = 80, half = 40
    const halfH = 20; // tile height = 40, half = 20
    const worldX = (x - y) * halfW + mapHeight * halfW;
    const worldY = (x + y) * halfH;
    return { x: worldX, y: worldY };
  }
}
