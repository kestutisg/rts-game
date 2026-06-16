import { Entity } from './entities.js';
import { Unit, Harvester, Projectile } from './unit.js';
import {
  getFactionPalette,
  drawIsoFootprint,
  drawExtrudedBlock,
  drawCylinder,
  drawSmokePuff,
} from './render.js';
import { BUILDING_DEFS, UNIT_DEFS } from './tech.js';

export class Building extends Entity {
  constructor(id, faction, type, gridX, gridY, tileSize) {
    const def = BUILDING_DEFS[type] || BUILDING_DEFS.barracks;
    const maxHealth = def.maxHealth;
    const gridWidth = def.gridWidth;
    const gridHeight = def.gridHeight;
    const powerProd = def.powerProduction;
    const powerUse = def.powerUsage;
    const buildingHeight = def.height3D;

    super(id, faction, maxHealth, maxHealth);
    
    this.type = type;
    this.def = def;
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
    this.weapon = def.weapon || null;
    this.lastAttackTime = 0;
    this.turretAngle = 0;
    
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

    if (this.weapon) {
      this.updateDefenseWeapon(game);
    }
  }

  updateDefenseWeapon(game) {
    if (game.isLowPower(this.faction)) return;

    const enemies = this.faction === 'player' ? game.enemyEntities : game.playerEntities;
    let closestEnemy = null;
    let minDist = this.weapon.range;

    for (const enemy of enemies) {
      if (enemy.isDead) continue;
      const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
      if (dist < minDist) {
        minDist = dist;
        closestEnemy = enemy;
      }
    }

    if (!closestEnemy) return;

    this.turretAngle = Math.atan2(closestEnemy.y - this.y, closestEnemy.x - this.x);
    if (game.currentTime - this.lastAttackTime < this.weapon.cooldown) return;

    game.projectiles.push(new Projectile(
      this.x,
      this.y - this.height3D * 0.7,
      closestEnemy,
      this.weapon.speed,
      this.weapon.damage,
      this.weapon.projectile,
      this.faction
    ));
    this.lastAttackTime = game.currentTime;
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
    const def = UNIT_DEFS[unitType] || UNIT_DEFS.motorcycle;
    const cost = def.cost;
    const duration = def.duration;

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
      } else {
        const def = UNIT_DEFS[unitType];
        unit = new Unit(
          unitId,
          this.faction,
          unitType,
          coords.x,
          coords.y,
          def?.speed,
          def?.maxHealth,
          def?.damage,
          def?.attackRange
        );
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

  draw(ctx, camera, game = null) {
    const palette = getFactionPalette(this.faction);
    const time = game?.currentTime ?? Date.now() / 1000;

    const getScreenCoords = (gx, gy) => {
      const coords = this.getTileCoordsLocal(gx, gy);
      return { x: coords.x - camera.x, y: coords.y - camera.y };
    };

    const ptTop = getScreenCoords(this.gridX, this.gridY);
    const ptRight = getScreenCoords(this.gridX + this.gridWidth, this.gridY);
    const ptBottom = getScreenCoords(this.gridX + this.gridWidth, this.gridY + this.gridHeight);
    const ptLeft = getScreenCoords(this.gridX, this.gridY + this.gridHeight);

    // Ground shadow beneath structure
    drawIsoFootprint(
      ctx,
      { x: ptTop.x + 6, y: ptTop.y + 4 },
      { x: ptRight.x + 6, y: ptRight.y + 4 },
      { x: ptBottom.x + 6, y: ptBottom.y + 4 },
      { x: ptLeft.x + 6, y: ptLeft.y + 4 },
      'rgba(0, 0, 0, 0.38)'
    );

    // Foundation pad
    drawIsoFootprint(ctx, ptTop, ptRight, ptBottom, ptLeft, '#1a2228', '#2a343c');

    const h = this.height3D;
    const wallColors = {
      left: '#141a1f',
      right: '#1e262d',
      top: '#2a323a',
      edge: '#3d4852',
    };

    const roof = drawExtrudedBlock(ctx, ptTop, ptRight, ptBottom, ptLeft, h, wallColors);

    // Faction trim band on front walls
    ctx.fillStyle = palette.trim;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(ptLeft.x, ptLeft.y - 2);
    ctx.lineTo(ptBottom.x, ptBottom.y - 2);
    ctx.lineTo(ptBottom.x, ptBottom.y - 8);
    ctx.lineTo(ptLeft.x, ptLeft.y - 8);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(ptBottom.x, ptBottom.y - 2);
    ctx.lineTo(ptRight.x, ptRight.y - 2);
    ctx.lineTo(ptRight.x, ptRight.y - 8);
    ctx.lineTo(ptBottom.x, ptBottom.y - 8);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    const rx = roof.centerX;
    const ry = roof.centerY;
    const roofW = roof.ptRightRoof.x - roof.ptLeftRoof.x;
    const roofH = roof.ptBottomRoof.y - roof.ptTopRoof.y;

    this.drawBuildingDetails(ctx, rx, ry, roofW, roofH, roof, palette, time);

    if (this.isUnderConstruction) {
      this.drawConstructionOverlay(ctx, ptTop, ptRight, ptBottom, ptLeft, h);
    }

    if (this.buildQueue.length > 0 && !this.isUnderConstruction) {
      const barW = roofW * 0.55;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(rx - barW / 2, roof.ptTopRoof.y + 6, barW, 5);
      ctx.fillStyle = palette.primary;
      ctx.fillRect(rx - barW / 2, roof.ptTopRoof.y + 6, barW * this.trainingProgress, 5);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(rx - barW / 2, roof.ptTopRoof.y + 6, barW, 5);
    }

    if (this.health < this.maxHealth * 0.35 && !this.isUnderConstruction) {
      drawSmokePuff(ctx, rx - 8, ry - h - 4, time, this.id);
      drawSmokePuff(ctx, rx + 6, ry - h - 8, time, this.id + 0.7);
    }

    this.drawSelectionAndHP(ctx, camera, rx, ry + h * 0.3, roofW * 0.75, roofH * 1.5, game);
  }

  drawBuildingDetails(ctx, rx, ry, roofW, roofH, roof, palette, time) {
    switch (this.type) {
      case 'cyard':
        this.drawCyardDetails(ctx, rx, ry, roofW, roofH, roof, palette, time);
        break;
      case 'power':
        this.drawPowerDetails(ctx, rx, ry, roofW, roofH, palette, time);
        break;
      case 'refinery':
        this.drawRefineryDetails(ctx, rx, ry, roofW, roofH, palette, time);
        break;
      case 'barracks':
        this.drawBarracksDetails(ctx, rx, ry, roofW, roofH, palette, time);
        break;
      case 'fence':
        this.drawFenceDetails(ctx, rx, ry, roofW, roofH, palette);
        break;
      case 'gate':
        this.drawGateDetails(ctx, rx, ry, roofW, roofH, palette, time);
        break;
      case 'turret':
        this.drawTurretDetails(ctx, rx, ry, roofW, roofH, palette);
        break;
      case 'laser':
        this.drawLaserDetails(ctx, rx, ry, roofW, roofH, palette, time);
        break;
      case 'explosive_tower':
        this.drawExplosiveTowerDetails(ctx, rx, ry, roofW, roofH, palette, time);
        break;
    }
  }

  drawCyardDetails(ctx, rx, ry, roofW, roofH, roof, palette, time) {
    // Command tower
    const tx = rx - roofW * 0.15;
    const ty = ry - roofH * 0.1;
    ctx.fillStyle = '#37474f';
    ctx.fillRect(tx - 8, ty - 28, 16, 28);
    ctx.strokeStyle = '#263238';
    ctx.strokeRect(tx - 8, ty - 28, 16, 28);

    ctx.fillStyle = palette.primary;
    ctx.fillRect(tx - 6, ty - 26, 12, 4);

    // Radar dish
    const pulse = time * 2.2;
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tx, ty - 32, 10, pulse - 0.8, pulse + 0.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx, ty - 32);
    ctx.lineTo(tx + Math.cos(pulse) * 14, ty - 32 + Math.sin(pulse) * 5);
    ctx.stroke();

    // Crane arm
    ctx.strokeStyle = '#78909c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(rx + roofW * 0.2, ry + roofH * 0.05);
    ctx.lineTo(rx + roofW * 0.35, ry - roofH * 0.25);
    ctx.lineTo(rx + roofW * 0.08, ry - roofH * 0.2);
    ctx.stroke();

    // Landing pad markings
    ctx.strokeStyle = palette.trim;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(rx, ry, roofW * 0.28, roofH * 0.22, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rx - roofW * 0.15, ry);
    ctx.lineTo(rx + roofW * 0.15, ry);
    ctx.moveTo(rx, ry - roofH * 0.12);
    ctx.lineTo(rx, ry + roofH * 0.12);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Blinking beacon
    if (Math.sin(time * 6) > 0) {
      ctx.fillStyle = '#ff5252';
      ctx.beginPath();
      ctx.arc(tx, ty - 38, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawPowerDetails(ctx, rx, ry, roofW, roofH, palette, time) {
    const pulse = (Math.sin(time * 4) + 1) / 2;

    // Cooling stacks
    drawCylinder(ctx, rx - 14, ry - 2, 7, 5, 16, { side: '#455a64', top: '#607d8b', edge: '#263238' });
    drawCylinder(ctx, rx + 14, ry + 2, 7, 5, 16, { side: '#455a64', top: '#607d8b', edge: '#263238' });

    if (!this.isUnderConstruction) {
      drawSmokePuff(ctx, rx - 14, ry - 20, time, 1.2);
      drawSmokePuff(ctx, rx + 14, ry - 18, time, 2.4);
    }

    // Reactor core glow
    ctx.shadowColor = '#00e676';
    ctx.shadowBlur = this.isUnderConstruction ? 0 : 10 + pulse * 8;
    ctx.fillStyle = this.isUnderConstruction ? '#1b5e20' : `rgba(0, 230, 118, ${0.45 + pulse * 0.45})`;
    ctx.beginPath();
    ctx.ellipse(rx, ry, 10, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#004d40';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Grille lines
    ctx.strokeStyle = '#263238';
    ctx.lineWidth = 1;
    for (let i = -8; i <= 8; i += 4) {
      ctx.beginPath();
      ctx.moveTo(rx + i, ry - 5);
      ctx.lineTo(rx + i, ry + 5);
      ctx.stroke();
    }
  }

  drawRefineryDetails(ctx, rx, ry, roofW, roofH, palette, time) {
    drawCylinder(ctx, rx - 18, ry, 9, 6, 22, { side: '#546e7a', top: '#78909c', edge: '#263238' });
    drawCylinder(ctx, rx + 16, ry + 4, 8, 5, 18, { side: '#546e7a', top: '#78909c', edge: '#263238' });

    // Pipe bridge
    ctx.strokeStyle = '#78909c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(rx - 18, ry - 8);
    ctx.lineTo(rx + 16, ry - 2);
    ctx.stroke();

    // Chimney
    ctx.fillStyle = '#37474f';
    ctx.fillRect(rx - 3, ry - 24, 7, 18);
    ctx.strokeStyle = '#263238';
    ctx.strokeRect(rx - 3, ry - 24, 7, 18);

    if (!this.isUnderConstruction) {
      drawSmokePuff(ctx, rx, ry - 28, time, 0.5, 0.4);
      drawSmokePuff(ctx, rx + 3, ry - 34, time, 1.1, 0.3);
    }

    // Ore loading dock
    ctx.fillStyle = palette.primary;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(rx - roofW * 0.12, ry + roofH * 0.08, roofW * 0.24, 4);
    ctx.globalAlpha = 1;

    // Tiberium stain
    ctx.fillStyle = 'rgba(0, 230, 118, 0.25)';
    ctx.beginPath();
    ctx.ellipse(rx + 4, ry + 6, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawBarracksDetails(ctx, rx, ry, roofW, roofH, palette, time) {
    // Bunker entrance
    ctx.fillStyle = '#263238';
    ctx.fillRect(rx - 10, ry + 2, 20, 10);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(rx - 10, ry + 2, 20, 10);

    ctx.fillStyle = '#37474f';
    ctx.fillRect(rx - 7, ry + 4, 14, 8);
    ctx.strokeStyle = palette.trim;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rx - 7, ry + 4, 14, 8);

    // Window slits with interior glow
    const glow = 0.5 + Math.sin(time * 3) * 0.15;
    ctx.fillStyle = `rgba(255, 183, 77, ${glow})`;
    ctx.fillRect(rx - 18, ry - 4, 5, 3);
    ctx.fillRect(rx + 13, ry - 2, 5, 3);

    // Sandbag corners
    ctx.fillStyle = '#8d6e63';
    for (const ox of [-roofW * 0.22, roofW * 0.18]) {
      ctx.beginPath();
      ctx.ellipse(rx + ox, ry + roofH * 0.12, 7, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#5d4037';
      ctx.stroke();
    }

    // Flag pole
    ctx.strokeStyle = '#cfd8dc';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rx + roofW * 0.22, ry - roofH * 0.15);
    ctx.lineTo(rx + roofW * 0.22, ry - roofH * 0.35);
    ctx.stroke();

    const wave = Math.sin(time * 5) * 2;
    ctx.fillStyle = palette.primary;
    ctx.beginPath();
    ctx.moveTo(rx + roofW * 0.22, ry - roofH * 0.35);
    ctx.lineTo(rx + roofW * 0.22 + 18 + wave, ry - roofH * 0.33);
    ctx.lineTo(rx + roofW * 0.22 + 16 + wave, ry - roofH * 0.28);
    ctx.lineTo(rx + roofW * 0.22, ry - roofH * 0.30);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = palette.dark;
    ctx.stroke();
  }

  drawFenceDetails(ctx, rx, ry, roofW, roofH, palette) {
    ctx.strokeStyle = '#90a4ae';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(rx - roofW * 0.3, ry);
    ctx.lineTo(rx + roofW * 0.3, ry);
    ctx.stroke();

    ctx.fillStyle = palette.primary;
    for (const ox of [-roofW * 0.25, 0, roofW * 0.25]) {
      ctx.fillRect(rx + ox - 2, ry - 18, 4, 22);
      ctx.strokeStyle = '#000';
      ctx.strokeRect(rx + ox - 2, ry - 18, 4, 22);
    }
  }

  drawGateDetails(ctx, rx, ry, roofW, roofH, palette, time) {
    ctx.strokeStyle = '#78909c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(rx - roofW * 0.32, ry + 2);
    ctx.lineTo(rx - 4, ry - 5 + Math.sin(time * 2) * 2);
    ctx.moveTo(rx + roofW * 0.32, ry + 2);
    ctx.lineTo(rx + 4, ry - 5 - Math.sin(time * 2) * 2);
    ctx.stroke();

    ctx.fillStyle = palette.primary;
    ctx.fillRect(rx - roofW * 0.36, ry - 20, 5, 24);
    ctx.fillRect(rx + roofW * 0.36 - 5, ry - 20, 5, 24);
  }

  drawTurretDetails(ctx, rx, ry, roofW, roofH, palette) {
    drawCylinder(ctx, rx, ry, 15, 9, 14, { side: '#37474f', top: palette.secondary, edge: '#111' });
    ctx.save();
    ctx.translate(rx, ry - 18);
    ctx.scale(1, 0.55);
    ctx.rotate(this.turretAngle);
    ctx.fillStyle = '#90a4ae';
    ctx.fillRect(0, -3, 26, 6);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(0, -3, 26, 6);
    ctx.fillStyle = palette.primary;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawLaserDetails(ctx, rx, ry, roofW, roofH, palette, time) {
    drawCylinder(ctx, rx, ry + 5, 13, 8, 28, { side: '#263238', top: '#455a64', edge: '#111' });
    const pulse = 0.5 + Math.sin(time * 7) * 0.25;
    ctx.save();
    ctx.translate(rx, ry - 28);
    ctx.scale(1, 0.55);
    ctx.rotate(this.turretAngle);
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(22, 0);
    ctx.stroke();
    ctx.restore();
    ctx.shadowColor = palette.accent;
    ctx.shadowBlur = 10;
    ctx.fillStyle = `rgba(128, 222, 234, ${pulse})`;
    ctx.beginPath();
    ctx.arc(rx, ry - 32, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  drawExplosiveTowerDetails(ctx, rx, ry, roofW, roofH, palette, time) {
    drawCylinder(ctx, rx, ry + 3, 14, 8, 24, { side: '#4e342e', top: '#6d4c41', edge: '#111' });
    ctx.fillStyle = '#ff7043';
    ctx.beginPath();
    ctx.moveTo(rx, ry - 40);
    ctx.lineTo(rx + 13, ry - 20);
    ctx.lineTo(rx - 13, ry - 20);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.stroke();

    ctx.fillStyle = `rgba(255, 171, 0, ${0.35 + Math.sin(time * 5) * 0.2})`;
    ctx.beginPath();
    ctx.arc(rx, ry - 24, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  drawConstructionOverlay(ctx, ptTop, ptRight, ptBottom, ptLeft, h) {
    const prog = this.constructionProgress;

    ctx.fillStyle = 'rgba(0, 255, 255, 0.12)';
    ctx.beginPath();
    ctx.moveTo(ptTop.x, ptTop.y - h * prog);
    ctx.lineTo(ptRight.x, ptRight.y - h * prog);
    ctx.lineTo(ptBottom.x, ptBottom.y - h * prog);
    ctx.lineTo(ptLeft.x, ptLeft.y - h * prog);
    ctx.closePath();
    ctx.fill();

    // Scaffolding corners
    ctx.strokeStyle = 'rgba(255, 171, 0, 0.7)';
    ctx.lineWidth = 1.5;
    for (const pt of [ptTop, ptRight, ptBottom, ptLeft]) {
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
      ctx.lineTo(pt.x, pt.y - h * prog);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(0, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.moveTo(ptLeft.x, ptLeft.y - h * prog);
    ctx.lineTo(ptRight.x, ptRight.y - h * prog);
    ctx.stroke();

    const cy = ptTop.y + (ptBottom.y - ptTop.y) / 2 - h / 2;
    const cx = (ptLeft.x + ptRight.x) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(cx - 28, cy - 5, 56, 10);
    ctx.fillStyle = '#ffab00';
    ctx.fillRect(cx - 28, cy - 5, 56 * prog, 10);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(cx - 28, cy - 5, 56, 10);
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
