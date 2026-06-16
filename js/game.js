import { Grid } from './grid.js';
import { InputHandler } from './input.js';
import { UIManager } from './ui.js';
import { Building } from './building.js';
import { Unit, Harvester } from './unit.js';
import { EnemyAI } from './ai.js';

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');

    // Dynamic sizing
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    // Game Constants
    this.nextEntityId = 1;
    this.currentTime = 0;

    // Viewport Camera
    this.camera = {
      x: 0,
      y: 0,
      width: this.canvas.width,
      height: this.canvas.height
    };

    // Economy
    this.playerCredits = 5000; // Start with sufficient cash for base expansion
    this.enemyCredits = 5000;

    // Entities Lists
    this.playerEntities = [];
    this.enemyEntities = [];
    this.selectedEntities = [];
    this.projectiles = [];
    this.particles = [];
    
    // Command placement helpers
    this.placementType = null;
    this.placementCost = 0;
    this.ghostWTiles = 0;
    this.ghostHTiles = 0;
    this.ghostWPx = 0;
    this.ghostHPx = 0;

    // Visual order pings
    this.clickPings = [];

    // FPS Counter variables
    this.lastTime = 0;
    this.fps = 60;
    this.fpsLastUpdate = 0;
    this.fpsFrames = 0;

    // Tiberium growth rate limiter
    this.lastResourceGrowTime = 0;

    // Initialize subsystems (Grid first, then handlers)
    this.grid = new Grid(60, 60, 40); // 60x60 map with 40px tiles
    this.input = new InputHandler(this);
    this.ui = new UIManager(this);
    this.ai = new EnemyAI(this);

    // Initial Setup
    this.setupStartingBases();

    // Start Loop
    requestAnimationFrame((t) => this.loop(t));
  }

  resizeCanvas() {
    // Canvas takes the remaining width after the sidebar
    this.canvas.width = window.innerWidth - 280;
    this.canvas.height = window.innerHeight;
    
    if (this.camera) {
      this.camera.width = this.canvas.width;
      this.camera.height = this.canvas.height;
    }
  }

  setupStartingBases() {
    // Player spawn: Place a Construction yard and two riflemen at (8, 8)
    this.spawnBuilding('player', 'cyard', 8, 8);
    this.spawnBuilding('player', 'power', 8, 12); // Pre-placed power plant to avoid immediate low power
    
    const u1 = new Unit(this.generateEntityId(), 'player', 'soldier', 460, 360, 100, 50, 8, 120);
    const u2 = new Unit(this.generateEntityId(), 'player', 'soldier', 480, 380, 100, 50, 8, 120);
    this.addUnit(u1);
    this.addUnit(u2);

    // Center camera on player's construction yard
    this.camera.x = Math.max(0, 10 * this.grid.tileSize - this.camera.width / 2);
    this.camera.y = Math.max(0, 10 * this.grid.tileSize - this.camera.height / 2);

    // AI spawn: Place a Construction Yard and a couple of defensive units
    const enemyCyardX = this.grid.width - 11;
    const enemyCyardY = this.grid.height - 11;
    this.spawnBuilding('enemy', 'cyard', enemyCyardX, enemyCyardY);
    this.spawnBuilding('enemy', 'power', enemyCyardX, enemyCyardY - 3);

    const eu1 = new Unit(this.generateEntityId(), 'enemy', 'soldier', 
      (enemyCyardX - 2) * this.grid.tileSize, (enemyCyardY + 1) * this.grid.tileSize, 
      100, 50, 8, 120);
    const eu2 = new Unit(this.generateEntityId(), 'enemy', 'soldier', 
      (enemyCyardX - 2) * this.grid.tileSize, (enemyCyardY + 2) * this.grid.tileSize, 
      100, 50, 8, 120);
    this.addUnit(eu1);
    this.addUnit(eu2);
  }

  generateEntityId() {
    return this.nextEntityId++;
  }

  addUnit(unit) {
    if (unit.faction === 'player') {
      this.playerEntities.push(unit);
    } else {
      this.enemyEntities.push(unit);
    }

    // Set grid tile occupied reference
    const tile = this.grid.getTileAtWorld(unit.x, unit.y);
    if (tile) {
      tile.occupiedBy = unit;
    }
  }

  spawnBuilding(faction, type, gridX, gridY) {
    const b = new Building(this.generateEntityId(), faction, type, gridX, gridY, this.grid.tileSize);
    
    // Buildings start under construction (except the starting structures)
    const isStartingBuilding = (gridX === 8 && gridY === 8) || (gridX === 8 && gridY === 12) || 
                               (gridX === this.grid.width - 11 && gridY === this.grid.height - 11) ||
                               (gridX === this.grid.width - 11 && gridY === this.grid.height - 14);
    
    if (isStartingBuilding) {
      b.isUnderConstruction = false;
      b.constructionProgress = 1.0;
    }

    if (faction === 'player') {
      this.playerEntities.push(b);
      this.ui.clearSidebarBuildVisuals();
    } else {
      this.enemyEntities.push(b);
    }

    // Lock all tiles in the footprint
    for (let x = gridX; x < gridX + b.gridWidth; x++) {
      for (let y = gridY; y < gridY + b.gridHeight; y++) {
        const tile = this.grid.getTile(x, y);
        if (tile) {
          tile.walkable = false;
          tile.occupiedBy = b;
        }
      }
    }

    // If Refinery completes immediately (starting), spawn Harvester
    if (isStartingBuilding && type === 'refinery') {
      b.onBuildComplete(this);
    }

    return b;
  }

  validateBuildingPlacement(faction, gridX, gridY, width, height) {
    // 1. Must fit inside grid limits
    if (gridX < 0 || gridX + width > this.grid.width || gridY < 0 || gridY + height > this.grid.height) {
      return false;
    }

    // 2. Footprint must be clear of obstacles, units, and resources
    for (let x = gridX; x < gridX + width; x++) {
      for (let y = gridY; y < gridY + height; y++) {
        const tile = this.grid.getTile(x, y);
        if (!tile || !tile.walkable || tile.occupiedBy || tile.type === 'ore') {
          return false;
        }
      }
    }

    // 3. Must be near (within 8 tiles radius) of an existing friendly building
    const friendlyBuildings = (faction === 'player' ? this.playerEntities : this.enemyEntities)
      .filter(ent => ent.isBuilding && !ent.isDead);

    // If starting out and have no buildings, allow placing anywhere
    if (friendlyBuildings.length === 0) return true;

    let nearBase = false;
    const maxRadius = 8;
    for (const b of friendlyBuildings) {
      const bxMin = b.gridX - maxRadius;
      const bxMax = b.gridX + b.gridWidth + maxRadius;
      const byMin = b.gridY - maxRadius;
      const byMax = b.gridY + b.gridHeight + maxRadius;

      if (gridX >= bxMin && gridX <= bxMax && gridY >= byMin && gridY <= byMax) {
        nearBase = true;
        break;
      }
    }

    return nearBase;
  }

  isLowPower(faction) {
    let powerGen = 0;
    let powerDraw = 0;
    const list = faction === 'player' ? this.playerEntities : this.enemyEntities;

    list.forEach(ent => {
      if (ent.isBuilding && !ent.isUnderConstruction && !ent.isDead) {
        powerGen += ent.powerProduction;
        powerDraw += ent.powerUsage;
      }
    });

    return powerDraw > powerGen;
  }

  createClickPing(x, y) {
    this.clickPings.push({
      x,
      y,
      radius: 2,
      maxRadius: 18,
      life: 0.3, // seconds
      maxLife: 0.3
    });
  }

  loop(time) {
    this.currentTime = time / 1000;
    if (this.lastTime === 0) this.lastTime = time;
    
    let dt = (time - this.lastTime) / 1000;
    this.lastTime = time;

    // Cap dt to prevent huge jumps when switching tabs
    if (dt > 0.1) dt = 0.1;

    // Calculate FPS
    this.fpsFrames++;
    if (time - this.fpsLastUpdate > 1000) {
      this.fps = (this.fpsFrames * 1000) / (time - this.fpsLastUpdate);
      this.fpsFrames = 0;
      this.fpsLastUpdate = time;
    }

    this.update(dt);
    this.draw();

    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    // Camera keys and edge checks
    this.input.updateCamera(dt);

    // Tiberium growth rate limiter (spread every 5 seconds)
    if (this.currentTime - this.lastResourceGrowTime > 5.0) {
      this.grid.regrowResources();
      this.lastResourceGrowTime = this.currentTime;
    }

    // Clear moving units grid occupancy pointers
    // Before moving units, clear their occupancy on the grid tile
    const clearUnitOccupancies = (entities) => {
      entities.forEach(ent => {
        if (!ent.isDead && !ent.isBuilding) {
          const tile = this.grid.getTileAtWorld(ent.x, ent.y);
          if (tile && tile.occupiedBy === ent) {
            tile.occupiedBy = null;
          }
        }
      });
    };
    clearUnitOccupancies(this.playerEntities);
    clearUnitOccupancies(this.enemyEntities);

    // Update all Entities
    this.playerEntities.forEach(ent => ent.update(dt, this));
    this.enemyEntities.forEach(ent => ent.update(dt, this));

    // Re-lock grid occupancy for alive entities
    const setUnitOccupancies = (entities) => {
      entities.forEach(ent => {
        if (!ent.isDead && !ent.isBuilding) {
          const tile = this.grid.getTileAtWorld(ent.x, ent.y);
          // Only lock if the tile is clear
          if (tile && !tile.occupiedBy) {
            tile.occupiedBy = ent;
          }
        }
      });
    };
    setUnitOccupancies(this.playerEntities);
    setUnitOccupancies(this.enemyEntities);

    // Update Projectiles
    this.projectiles.forEach(p => p.update(dt, this));
    this.projectiles = this.projectiles.filter(p => !p.isDead);

    // Update Particles
    this.particles.forEach(p => p.update(dt));
    this.particles = this.particles.filter(p => !p.isDead);

    // Update click feedback pings
    this.clickPings.forEach(p => {
      p.life -= dt;
      p.radius = p.maxRadius * (1 - p.life / p.maxLife);
    });
    this.clickPings = this.clickPings.filter(p => p.life > 0);

    // Remove dead entities and unlock their grid cells
    const cleanDeadList = (entities) => {
      return entities.filter(ent => {
        if (ent.isDead) {
          // If building, unlock tiles footprint
          if (ent.isBuilding) {
            for (let x = ent.gridX; x < ent.gridX + ent.gridWidth; x++) {
              for (let y = ent.gridY; y < ent.gridY + ent.gridHeight; y++) {
                const tile = this.grid.getTile(x, y);
                if (tile && tile.occupiedBy === ent) {
                  tile.walkable = true;
                  tile.occupiedBy = null;
                }
              }
            }
          } else {
            // Mobile unit: unlock current tile
            const tile = this.grid.getTileAtWorld(ent.x, ent.y);
            if (tile && tile.occupiedBy === ent) {
              tile.occupiedBy = null;
            }
          }
          
          // Trigger explosion particle
          this.particles.push(new ExplosionParticle(ent.x, ent.y, ent.isBuilding ? 30 : 12));
          return false;
        }
        return true;
      });
    };
    
    this.playerEntities = cleanDeadList(this.playerEntities);
    this.enemyEntities = cleanDeadList(this.enemyEntities);
    
    // Filter dead elements from selection list
    this.selectedEntities = this.selectedEntities.filter(ent => !ent.isDead);

    // AI Tick
    this.ai.update(dt);

    // UI Updates (Credits, Power, Radar)
    this.ui.update(dt);
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 1. Draw Grid / Tiberium tiles
    this.grid.draw(this.ctx, this.camera);

    // 2. Draw movement click feedback pings
    this.ctx.lineWidth = 1.5;
    this.clickPings.forEach(p => {
      const sx = p.x - this.camera.x;
      const sy = p.y - this.camera.y;
      this.ctx.strokeStyle = `rgba(0, 255, 102, ${p.life / p.maxLife})`;
      this.ctx.beginPath();
      this.ctx.arc(sx, sy, p.radius, 0, Math.PI * 2);
      this.ctx.stroke();
    });

    // 3. Draw Buildings (rendered behind units)
    this.playerEntities.filter(e => e.isBuilding).forEach(b => b.draw(this.ctx, this.camera));
    this.enemyEntities.filter(e => e.isBuilding).forEach(b => b.draw(this.ctx, this.camera));

    // 4. Draw Mobile Units
    this.playerEntities.filter(e => !e.isBuilding).forEach(u => u.draw(this.ctx, this.camera));
    this.enemyEntities.filter(e => !e.isBuilding).forEach(u => u.draw(this.ctx, this.camera));

    // 5. Draw flying bullets/missiles
    this.projectiles.forEach(p => p.draw(this.ctx, this.camera));

    // 6. Draw explosions/smoke particles
    this.particles.forEach(p => p.draw(this.ctx, this.camera));

    // 7. Draw click & drag selection helper box
    this.input.draw(this.ctx);
  }
}

// Particle class copy for immediate clean references
class ExplosionParticle {
  constructor(x, y, radius) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.maxLife = 0.4;
    this.life = 0.4;
    this.isDead = false;
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) this.isDead = true;
  }
  draw(ctx, camera) {
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    const ratio = this.life / this.maxLife;

    ctx.save();
    
    // Draw fire glow ring
    ctx.shadowColor = '#ff3300';
    ctx.shadowBlur = 12 * ratio;
    
    ctx.beginPath();
    ctx.arc(sx, sy, this.radius * (1.8 - ratio), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, ${Math.floor(80 + 175 * ratio)}, 0, ${ratio})`;
    ctx.fill();

    // Secondary smoke ring
    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgba(80, 80, 80, ${ratio * 0.5})`;
    ctx.beginPath();
    ctx.arc(sx + 3, sy - 2, this.radius * (1.2 - ratio), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

// Initialize game on window load
window.addEventListener('load', () => {
  window.game = new Game();
});
