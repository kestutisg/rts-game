import { Entity } from './entities.js';
import { Unit, Harvester } from './unit.js';

export class Building extends Entity {
  constructor(id, faction, type, gridX, gridY, tileSize) {
    // Determine size and health based on structure type
    let maxHealth = 500;
    let gridWidth = 2;
    let gridHeight = 2;
    let powerProd = 0;
    let powerUse = 0;

    switch (type) {
      case 'cyard':
        maxHealth = 1500;
        gridWidth = 3;
        gridHeight = 3;
        powerProd = 0;
        powerUse = 0;
        break;
      case 'power':
        maxHealth = 600;
        gridWidth = 2;
        gridHeight = 2;
        powerProd = 100;
        powerUse = 0;
        break;
      case 'refinery':
        maxHealth = 1000;
        gridWidth = 3;
        gridHeight = 2;
        powerProd = 0;
        powerUse = 40;
        break;
      case 'barracks':
        maxHealth = 800;
        gridWidth = 2;
        gridHeight = 2;
        powerProd = 0;
        powerUse = 20;
        break;
    }

    super(id, faction, maxHealth, maxHealth);
    
    this.type = type;
    this.gridX = gridX;
    this.gridY = gridY;
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;
    this.isBuilding = true;
    
    this.powerProduction = powerProd;
    this.powerUsage = powerUse;
    
    // World coordinates (center of the building structure)
    this.x = (gridX + gridWidth / 2) * tileSize;
    this.y = (gridY + gridHeight / 2) * tileSize;
    
    this.widthPx = gridWidth * tileSize;
    this.heightPx = gridHeight * tileSize;
    
    // Construction state (when placing structure)
    this.isUnderConstruction = true;
    this.constructionProgress = 0; // 0 to 1
    this.constructionDuration = 4.0; // seconds to build
    
    // Unit production states
    this.buildQueue = [];
    this.trainingProgress = 0; // 0 to 1
    
    // Set rally point (offset to the bottom right of the structure)
    this.rallyPoint = {
      x: this.x + this.widthPx / 2 + tileSize,
      y: this.y + this.heightPx / 2 + tileSize
    };
  }

  update(dt, game) {
    if (this.isDead) return;

    const isLowPower = game.isLowPower(this.faction);
    const speedMultiplier = isLowPower ? 0.5 : 1.0; // low power cuts building/training speed in half

    // 1. Handle structure building phase
    if (this.isUnderConstruction) {
      this.constructionProgress += (dt / this.constructionDuration) * speedMultiplier;
      if (this.constructionProgress >= 1.0) {
        this.constructionProgress = 1.0;
        this.isUnderConstruction = false;
        this.onBuildComplete(game);
      }
      return; // Can't train units or function until built
    }

    // 2. Handle unit training queue
    if (this.buildQueue.length > 0) {
      const activeItem = this.buildQueue[0];
      
      this.trainingProgress += (dt / activeItem.duration) * speedMultiplier;
      if (this.trainingProgress >= 1.0) {
        this.spawnTrainedUnit(activeItem.type, game);
        this.buildQueue.shift(); // remove item
        this.trainingProgress = 0;
      }
    }
  }

  onBuildComplete(game) {
    // If Refinery, spawn a harvester immediately
    if (this.type === 'refinery') {
      const spawnTile = game.grid.getTile(this.gridX + 1, this.gridY + 2); // place in front
      if (spawnTile) {
        const harvesterId = game.generateEntityId();
        const harvester = new Harvester(
          harvesterId, 
          this.faction, 
          (this.gridX + 1.5) * game.grid.tileSize, 
          (this.gridY + 2.5) * game.grid.tileSize
        );
        game.addUnit(harvester);
      }
    }
  }

  queueUnit(unitType) {
    // Define cost and train duration for units
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
    // Find a free adjacent tile to spawn unit
    let spawnTile = null;
    const searchDirs = [
      {x: 0, y: this.gridHeight}, // South
      {x: this.gridWidth, y: 0}, // East
      {x: -1, y: 0}, // West
      {x: 0, y: -1} // North
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

    // Fallback if blocked: just spawn on first tile outside
    if (!spawnTile) {
      spawnTile = game.grid.getTile(this.gridX, this.gridY + this.gridHeight);
    }

    if (spawnTile) {
      const worldX = (spawnTile.x + 0.5) * game.grid.tileSize;
      const worldY = (spawnTile.y + 0.5) * game.grid.tileSize;
      const unitId = game.generateEntityId();
      
      let unit;
      if (unitType === 'harvester') {
        unit = new Harvester(unitId, this.faction, worldX, worldY);
      } else if (unitType === 'soldier') {
        unit = new Unit(unitId, this.faction, 'soldier', worldX, worldY, 100, 50, 8, 120);
      } else if (unitType === 'rocket') {
        unit = new Unit(unitId, this.faction, 'rocket', worldX, worldY, 85, 45, 22, 180);
      } else if (unitType === 'tank') {
        unit = new Unit(unitId, this.faction, 'tank', worldX, worldY, 110, 250, 45, 200);
      }

      game.addUnit(unit);

      // Order unit to move to the rally point
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
    const screenX = this.x - camera.x;
    const screenY = this.y - camera.y;

    const left = screenX - this.widthPx / 2;
    const top = screenY - this.heightPx / 2;

    // Draw building shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(left + 6, top + 6, this.widthPx, this.heightPx);

    // Main base structure colors
    const factionColor = this.faction === 'player' ? 'oklch(0.78 0.18 195)' : 'oklch(0.62 0.22 25)';
    
    // Draw outer foundation
    ctx.fillStyle = '#1c2226';
    ctx.fillRect(left, top, this.widthPx, this.heightPx);
    ctx.strokeStyle = '#2b343b';
    ctx.lineWidth = 2;
    ctx.strokeRect(left, top, this.widthPx, this.heightPx);

    // Draw building inner details based on type
    ctx.fillStyle = '#121619';
    ctx.fillRect(left + 4, top + 4, this.widthPx - 8, this.heightPx - 8);

    if (this.type === 'cyard') {
      // Construction Yard: Large core generator and visual construction crane arm
      ctx.fillStyle = factionColor;
      ctx.fillRect(left + 16, top + 16, this.widthPx - 32, this.heightPx - 32);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.strokeRect(left + 16, top + 16, this.widthPx - 32, this.heightPx - 32);
      
      // Central radar dome
      ctx.fillStyle = '#3a444d';
      ctx.beginPath();
      ctx.arc(screenX, screenY, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

    } else if (this.type === 'power') {
      // Power Plant: glowing coils
      ctx.fillStyle = '#2b343b';
      ctx.fillRect(left + 8, top + 8, this.widthPx - 16, this.heightPx - 16);

      // Glowing power cells
      const pulseRatio = (Math.sin(Date.now() / 200) + 1.0) / 2.0; // pulsating neon glow
      ctx.shadowColor = '#00ff66';
      ctx.shadowBlur = this.isUnderConstruction ? 0 : 8 * pulseRatio;
      
      ctx.fillStyle = this.isUnderConstruction ? '#222' : `oklch(0.8 0.22 142 / ${0.5 + 0.5 * pulseRatio})`;
      ctx.fillRect(left + 12, top + 12, 10, this.heightPx - 24);
      ctx.fillRect(left + this.widthPx - 22, top + 12, 10, this.heightPx - 24);
      
      ctx.shadowBlur = 0;

    } else if (this.type === 'refinery') {
      // Refinery: Large storage dock and processor chimney
      ctx.fillStyle = '#22282c';
      ctx.fillRect(left + 8, top + 8, this.widthPx - 16, this.heightPx - 16);

      // Harvester unloading dock marker (neon yellow lines)
      ctx.strokeStyle = 'oklch(0.85 0.15 85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(left + 12, top + this.heightPx - 4);
      ctx.lineTo(left + this.widthPx - 12, top + this.heightPx - 4);
      ctx.stroke();

      // Exhaust towers
      ctx.fillStyle = '#3a4349';
      ctx.fillRect(left + 12, top + 12, 12, 12);
      ctx.fillRect(left + 28, top + 12, 12, 12);
      
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(left + 18, top + 18, 3, 0, Math.PI * 2);
      ctx.arc(left + 34, top + 18, 3, 0, Math.PI * 2);
      ctx.fill();

    } else if (this.type === 'barracks') {
      // Barracks: Infantry training facility with a flag / logo
      ctx.fillStyle = factionColor;
      ctx.fillRect(left + 10, top + 10, this.widthPx - 20, 8); // color strip
      
      // Training gate
      ctx.fillStyle = '#0f1214';
      ctx.fillRect(left + 16, top + this.heightPx - 16, this.widthPx - 32, 14);
      ctx.strokeStyle = '#222';
      ctx.strokeRect(left + 16, top + this.heightPx - 16, this.widthPx - 32, 14);
    }

    // Draw construction grid scan effect if building
    if (this.isUnderConstruction) {
      ctx.fillStyle = 'rgba(0, 255, 255, 0.15)';
      ctx.fillRect(left, top, this.widthPx, this.heightPx * (1 - this.constructionProgress));
      
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, top + this.heightPx * (1 - this.constructionProgress));
      ctx.lineTo(left + this.widthPx, top + this.heightPx * (1 - this.constructionProgress));
      ctx.stroke();

      // Progress bar overlay on top of structure
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(screenX - 25, screenY - 4, 50, 8);
      ctx.fillStyle = 'oklch(0.7 0.2 45)'; // orange
      ctx.fillRect(screenX - 25, screenY - 4, 50 * this.constructionProgress, 8);
    }

    // Draw training queue progress bar
    if (this.buildQueue.length > 0 && !this.isUnderConstruction) {
      const barW = this.widthPx * 0.8;
      const bx = screenX - barW / 2;
      const by = top + 8;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx, by, barW, 4);
      ctx.fillStyle = 'oklch(0.78 0.18 195)'; // cyan
      ctx.fillRect(bx, by, barW * this.trainingProgress, 4);

      // Queue length indicator
      ctx.fillStyle = 'oklch(0.78 0.18 195)';
      ctx.font = '10px var(--font-mono)';
      ctx.textAlign = 'right';
      ctx.fillText(`Q:${this.buildQueue.length}`, left + this.widthPx - 4, top + 20);
    }

    // Selection ring & health overlay
    this.drawSelectionAndHP(ctx, camera, screenX, screenY, this.widthPx, this.heightPx);
  }
}
