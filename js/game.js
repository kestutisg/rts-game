import { Grid } from './grid.js';
import { InputHandler } from './input.js';
import { UIManager } from './ui.js';
import { Building } from './building.js';
import { Unit, Harvester } from './unit.js';
import { EnemyAI } from './ai.js';
import { AudioSynthesizer } from './audio.js';
import { DayCycle } from './daycycle.js';

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    // Subsystems & Helpers
    this.nextEntityId = 1;
    this.currentTime = 0;
    this.state = 'playing'; // 'playing', 'victory', 'defeat'

    // Camera
    this.camera = {
      x: 0,
      y: 0,
      width: this.canvas.width,
      height: this.canvas.height
    };

    // Economy
    this.playerCredits = 5000;
    this.enemyCredits = 5000;

    // Faction Entity Lists
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

    // Hovered structure label
    this.hoveredEntity = null;

    // Visual order pings
    this.clickPings = [];

    // Frame timing
    this.lastTime = 0;
    this.fps = 60;
    this.fpsLastUpdate = 0;
    this.fpsFrames = 0;
    this.lastResourceGrowTime = 0;

    // Initialize systems
    this.grid = new Grid(60, 60, 40);
    this.input = new InputHandler(this);
    this.ui = new UIManager(this);
    this.ai = new EnemyAI(this);
    this.audio = new AudioSynthesizer();
    this.dayCycle = new DayCycle(120);
    this.stars = this.generateStars(120);

    // Initial Setup
    this.setupStartingBases();
    this.initHUDListeners();

    // Start Game Loop
    requestAnimationFrame((t) => this.loop(t));
  }

  resizeCanvas() {
    this.canvas.width = window.innerWidth - 280;
    this.canvas.height = window.innerHeight;
    
    if (this.camera) {
      this.camera.width = this.canvas.width;
      this.camera.height = this.canvas.height;
    }
  }

  initHUDListeners() {
    // Music Toggle listener
    const musicBtn = document.getElementById('music-toggle');
    if (musicBtn) {
      musicBtn.addEventListener('click', () => {
        const isPlaying = this.audio.toggle();
        if (isPlaying) {
          musicBtn.classList.add('active');
          musicBtn.innerText = "MUSIC: ON";
        } else {
          musicBtn.classList.remove('active');
          musicBtn.innerText = "MUSIC: OFF";
        }
      });
    }

    // Restart button listener
    const restartBtn = document.getElementById('restart-btn');
    if (restartBtn) {
      restartBtn.addEventListener('click', () => {
        this.restart();
      });
    }
  }

  setupStartingBases() {
    // Spawn player starting structures
    this.spawnBuilding('player', 'cyard', 8, 8);
    this.spawnBuilding('player', 'power', 8, 12);
    
    // Initial units (computed isometric start points)
    const c1 = this.grid.getTileCoords(12, 10);
    const c2 = this.grid.getTileCoords(13, 11);

    const u1 = new Unit(this.generateEntityId(), 'player', 'soldier', c1.x, c1.y, 100, 50, 8, 120);
    const u2 = new Unit(this.generateEntityId(), 'player', 'soldier', c2.x, c2.y, 100, 50, 8, 120);
    this.addUnit(u1);
    this.addUnit(u2);

    // Center camera on player's construction yard
    const startCoords = this.grid.getTileCoords(8, 8);
    this.camera.x = Math.max(0, startCoords.x - this.camera.width / 2);
    this.camera.y = Math.max(0, startCoords.y - this.camera.height / 2);

    // Spawn Enemy starting structures
    const enemyCyardX = this.grid.width - 11;
    const enemyCyardY = this.grid.height - 11;
    this.spawnBuilding('enemy', 'cyard', enemyCyardX, enemyCyardY);
    this.spawnBuilding('enemy', 'power', enemyCyardX, enemyCyardY - 3);

    const ec1 = this.grid.getTileCoords(enemyCyardX - 2, enemyCyardY + 1);
    const ec2 = this.grid.getTileCoords(enemyCyardX - 2, enemyCyardY + 2);

    const eu1 = new Unit(this.generateEntityId(), 'enemy', 'soldier', ec1.x, ec1.y, 100, 50, 8, 120);
    const eu2 = new Unit(this.generateEntityId(), 'enemy', 'soldier', ec2.x, ec2.y, 100, 50, 8, 120);
    this.addUnit(eu1);
    this.addUnit(eu2);
  }

  restart() {
    this.playerCredits = 5000;
    this.enemyCredits = 5000;

    this.playerEntities = [];
    this.enemyEntities = [];
    this.selectedEntities = [];
    this.projectiles = [];
    this.particles = [];
    this.clickPings = [];
    this.hoveredEntity = null;

    this.grid.generateMap();
    this.setupStartingBases();
    
    // Hide game-over overlay
    document.getElementById('game-over-overlay').classList.add('hidden');
    
    this.state = 'playing';
    this.currentTime = 0;
    this.lastTime = 0;
    this.ui.setStatusText("SYSTEM REBOOTED. CONSTRUCT STRUCTURES TO EXPAND BASE.");
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

    const tile = this.grid.getTileAtWorld(unit.x, unit.y);
    if (tile) {
      tile.occupiedBy = unit;
    }
  }

  spawnBuilding(faction, type, gridX, gridY) {
    const b = new Building(this.generateEntityId(), faction, type, gridX, gridY, this.grid.tileSize);
    
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

    for (let x = gridX; x < gridX + b.gridWidth; x++) {
      for (let y = gridY; y < gridY + b.gridHeight; y++) {
        const tile = this.grid.getTile(x, y);
        if (tile) {
          tile.walkable = false;
          tile.occupiedBy = b;
        }
      }
    }

    if (isStartingBuilding && type === 'refinery') {
      b.onBuildComplete(this);
    }

    return b;
  }

  validateBuildingPlacement(faction, gridX, gridY, width, height) {
    if (gridX < 0 || gridX + width > this.grid.width || gridY < 0 || gridY + height > this.grid.height) {
      return false;
    }

    for (let x = gridX; x < gridX + width; x++) {
      for (let y = gridY; y < gridY + height; y++) {
        const tile = this.grid.getTile(x, y);
        if (!tile || !tile.walkable || tile.occupiedBy || tile.type === 'ore' || tile.type === 'water') {
          return false;
        }
      }
    }

    const friendlyBuildings = (faction === 'player' ? this.playerEntities : this.enemyEntities)
      .filter(ent => ent.isBuilding && !ent.isDead);

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
      maxRadius: 20,
      life: 0.35,
      maxLife: 0.35
    });
  }

  triggerGameOver(status) {
    this.state = status; // 'victory' or 'defeat'
    
    const overlay = document.getElementById('game-over-overlay');
    const title = document.getElementById('game-over-title');
    const desc = document.getElementById('game-over-status');

    if (overlay && title && desc) {
      overlay.classList.remove('hidden');
      if (status === 'victory') {
        title.innerText = "MISSION ACCOMPLISHED";
        title.classList.remove('defeat');
        desc.innerText = "ALL ENEMY FORCES ENIMINATED. REGION SECURED.";
      } else {
        title.innerText = "MISSION FAILED";
        title.classList.add('defeat');
        desc.innerText = "YOUR BASE AND FORCES HAVE BEEN TOTALLY DESTROYED.";
      }
    }
  }

  loop(time) {
    this.currentTime = time / 1000;
    if (this.lastTime === 0) this.lastTime = time;
    
    let dt = (time - this.lastTime) / 1000;
    this.lastTime = time;

    if (dt > 0.1) dt = 0.1;

    this.fpsFrames++;
    if (time - this.fpsLastUpdate > 1000) {
      this.fps = (this.fpsFrames * 1000) / (time - this.fpsLastUpdate);
      this.fpsFrames = 0;
      this.fpsLastUpdate = time;
    }

    // Skirmish updates
    this.update(dt);
    this.draw();

    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    // 1. Camera key panning always active so player can view the map
    this.input.updateCamera(dt);

    if (this.state !== 'playing') {
      // Freeze simulation loop on game over, only update UI ticks
      this.ui.update(dt);
      return;
    }

    // 2. Victory / Defeat trigger conditions evaluation
    const playerAlive = this.playerEntities.length > 0;
    const enemyAlive = this.enemyEntities.length > 0;

    if (!playerAlive) {
      this.triggerGameOver('defeat');
      return;
    }

    if (!enemyAlive) {
      this.triggerGameOver('victory');
      return;
    }

    // 3. Tiberium resource spread tick
    if (this.currentTime - this.lastResourceGrowTime > 5.0) {
      this.grid.regrowResources();
      this.lastResourceGrowTime = this.currentTime;
    }

    // 4. Temporarily unlock mobile unit grid references for dynamic moving calculations
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

    // Update Entities
    this.playerEntities.forEach(ent => ent.update(dt, this));
    this.enemyEntities.forEach(ent => ent.update(dt, this));

    // Relock mobile units grid reference
    const setUnitOccupancies = (entities) => {
      entities.forEach(ent => {
        if (!ent.isDead && !ent.isBuilding) {
          const tile = this.grid.getTileAtWorld(ent.x, ent.y);
          if (tile && !tile.occupiedBy) {
            tile.occupiedBy = ent;
          }
        }
      });
    };
    setUnitOccupancies(this.playerEntities);
    setUnitOccupancies(this.enemyEntities);

    // Projectiles & Particles
    this.projectiles.forEach(p => p.update(dt, this));
    this.projectiles = this.projectiles.filter(p => !p.isDead);

    this.particles.forEach(p => p.update(dt));
    this.particles = this.particles.filter(p => !p.isDead);

    // Click feedback Pings
    this.clickPings.forEach(p => {
      p.life -= dt;
      p.radius = p.maxRadius * (1 - p.life / p.maxLife);
    });
    this.clickPings = this.clickPings.filter(p => p.life > 0);

    // Clear dead references and spawn explosions
    const cleanDeadList = (entities) => {
      return entities.filter(ent => {
        if (ent.isDead) {
          if (ent.isBuilding) {
            for (let x = ent.gridX; x < ent.gridX + ent.gridWidth; x++) {
              for (let y = ent.gridY; y < ent.gridY + ent.gridHeight; y++) {
                const tile = this.grid.getTile(x, y);
                if (tile && tile.occupiedBy === ent) {
                  tile.walkable = tile.type === 'grass' || tile.type === 'ore';
                  tile.occupiedBy = null;
                }
              }
            }
          } else {
            const tile = this.grid.getTileAtWorld(ent.x, ent.y);
            if (tile && tile.occupiedBy === ent) {
              tile.occupiedBy = null;
            }
          }
          this.particles.push(new ExplosionParticle(ent.x, ent.y, ent.isBuilding ? 30 : 12));
          return false;
        }
        return true;
      });
    };
    this.playerEntities = cleanDeadList(this.playerEntities);
    this.enemyEntities = cleanDeadList(this.enemyEntities);
    this.selectedEntities = this.selectedEntities.filter(ent => !ent.isDead);

    // AI tick
    this.ai.update(dt);

    // Day/night cycle
    this.dayCycle.update(dt);

    // UI Panel update
    this.ui.update(dt);
  }

  generateStars(count) {
    const stars = [];
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random() * 0.65,
        size: 0.5 + Math.random() * 1.5,
        twinkle: Math.random() * Math.PI * 2,
      });
    }
    return stars;
  }

  drawSky(ambient) {
    const grad = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    grad.addColorStop(0, ambient.skyTop);
    grad.addColorStop(1, ambient.skyBottom);
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (ambient.stars > 0.05) {
      this.stars.forEach(star => {
        const sx = star.x * this.canvas.width;
        const sy = star.y * this.canvas.height;
        const alpha = ambient.stars * (0.4 + 0.6 * Math.abs(Math.sin(this.currentTime * 1.5 + star.twinkle)));
        this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        this.ctx.fillRect(sx, sy, star.size, star.size);
      });
    }

    if (ambient.ambient > 0.4) {
      const sunX = ambient.sunX * this.canvas.width;
      const sunY = ambient.sunY * this.canvas.height;
      const sunGrad = this.ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 60);
      sunGrad.addColorStop(0, `rgba(255, 240, 180, ${0.25 * ambient.ambient})`);
      sunGrad.addColorStop(1, 'rgba(255, 200, 100, 0)');
      this.ctx.fillStyle = sunGrad;
      this.ctx.fillRect(sunX - 60, sunY - 60, 120, 120);
    }
  }

  draw() {
    const ambient = this.dayCycle.getAmbient();

    // 1. Sky and celestial bodies
    this.drawSky(ambient);

    // 2. Terrain with day-cycle tinting
    this.grid.draw(this.ctx, this.camera, this.currentTime, ambient, this.dayCycle);

    // 2. Draw movement click feedback pings (drawn flat as ellipses)
    this.ctx.lineWidth = 1.5;
    this.clickPings.forEach(p => {
      const sx = p.x - this.camera.x;
      const sy = p.y - this.camera.y;
      this.ctx.strokeStyle = `rgba(0, 255, 102, ${p.life / p.maxLife})`;
      this.ctx.beginPath();
      this.ctx.ellipse(sx, sy, p.radius, p.radius * 0.5, 0, 0, Math.PI * 2);
      this.ctx.stroke();
    });

    // 3. Draw Building Placement Ghost directly in isometric projection
    if (this.placementType) {
      const tile = this.grid.getTileAtWorld(this.input.worldMouseX, this.input.worldMouseY);
      if (tile) {
        const isValid = this.validateBuildingPlacement('player', tile.x, tile.y, this.ghostWTiles, this.ghostHTiles);
        
        // Floor corners of ghost
        const getScreenCoords = (gx, gy) => {
          const coords = this.grid.getTileCoords(gx, gy);
          return { x: coords.x - this.camera.x, y: coords.y - this.camera.y };
        };

        const ptTop = getScreenCoords(tile.x, tile.y);
        const ptRight = getScreenCoords(tile.x + this.ghostWTiles, tile.y);
        const ptBottom = getScreenCoords(tile.x + this.ghostWTiles, tile.y + this.ghostHTiles);
        const ptLeft = getScreenCoords(tile.x, tile.y + this.ghostHTiles);

        this.ctx.fillStyle = isValid ? 'rgba(0, 255, 102, 0.22)' : 'rgba(255, 30, 30, 0.22)';
        this.ctx.strokeStyle = isValid ? 'oklch(0.8 0.22 142)' : 'oklch(0.62 0.22 25)';
        this.ctx.lineWidth = 2;

        this.ctx.beginPath();
        this.ctx.moveTo(ptTop.x, ptTop.y);
        this.ctx.lineTo(ptRight.x, ptRight.y);
        this.ctx.lineTo(ptBottom.x, ptBottom.y);
        this.ctx.lineTo(ptLeft.x, ptLeft.y);
        this.ctx.closePath();
        
        this.ctx.fill();
        this.ctx.stroke();
      }
    }

    // 4. Collected Depth-Sorted rendering: draw units and buildings back-to-front
    const drawables = [...this.playerEntities, ...this.enemyEntities];
    // Sort by projected Y coordinate
    drawables.sort((a, b) => a.y - b.y);

    drawables.forEach(ent => ent.draw(this.ctx, this.camera, this));

    // 5. Draw flying Projectiles (always on top of entities)
    this.projectiles.forEach(p => p.draw(this.ctx, this.camera, this));

    // 6. Draw impact particles
    this.particles.forEach(p => p.draw(this.ctx, this.camera));

    // 7. Draw screen-space drag-select box
    this.input.draw(this.ctx);

    // 8. Atmospheric overlay (dusk/night tint)
    if (ambient.overlay > 0.01) {
      this.ctx.fillStyle = `rgba(8, 12, 32, ${ambient.overlay})`;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
}

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
    
    ctx.shadowColor = '#ff3300';
    ctx.shadowBlur = 12 * ratio;
    
    ctx.beginPath();
    ctx.ellipse(sx, sy, this.radius * (1.8 - ratio), this.radius * 0.9 * (1.8 - ratio), 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, ${Math.floor(80 + 175 * ratio)}, 0, ${ratio})`;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgba(80, 80, 80, ${ratio * 0.5})`;
    ctx.beginPath();
    ctx.ellipse(sx + 3, sy - 2, this.radius * (1.2 - ratio), this.radius * 0.6 * (1.2 - ratio), 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

window.addEventListener('load', () => {
  window.game = new Game();
});
