import { Entity } from './entities.js';
import { Unit, Harvester, Projectile } from './unit.js';
import {
  getFactionPalette,
  getEntityPalette,
  drawIsoFootprint,
  drawExtrudedBlock,
  drawCylinder,
  drawSmokePuff,
  drawHazardStripes,
  drawTiberiumCrystal,
  drawElectricArc,
  drawRadarDish,
} from './render.js';
import { BUILDING_DEFS, UNIT_DEFS } from './tech.js';
import { applyRaceBuildingStats, normalizeRaceId } from './races.js';

export class Building extends Entity {
  constructor(id, faction, type, gridX, gridY, tileSize, mapHeight = 60, race = 'gdi') {
    const resolvedRace = normalizeRaceId(race);
    const baseDef = BUILDING_DEFS[type] || BUILDING_DEFS.barracks;
    const def = applyRaceBuildingStats(resolvedRace, type, baseDef);
    const maxHealth = def.maxHealth;
    const gridWidth = def.gridWidth;
    const gridHeight = def.gridHeight;
    const powerProd = def.powerProduction;
    const powerUse = def.powerUsage;
    const buildingHeight = def.height3D;

    super(id, faction, maxHealth, maxHealth, resolvedRace);
    
    this.type = type;
    this.def = def;
    this.gridX = gridX;
    this.gridY = gridY;
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;
    this.tileSize = tileSize;
    this.mapHeight = mapHeight;
    this.isBuilding = true;
    this.height3D = buildingHeight;
    
    this.powerProduction = powerProd;
    this.powerUsage = powerUse;
    
    // Keep the original diamond footprint for structures. The terrain grid is
    // staggered, but buildings still use the classic diamond silhouette that
    // gives them their readable 2.5D shape.
    const halfW = tileSize;
    const halfH = tileSize / 2;
    const footprintCorners = [
      this.getTileCoordsLocal(gridX, gridY),
      this.getTileCoordsLocal(gridX + gridWidth, gridY),
      this.getTileCoordsLocal(gridX + gridWidth, gridY + gridHeight),
      this.getTileCoordsLocal(gridX, gridY + gridHeight),
    ];
    this.x = footprintCorners.reduce((sum, point) => sum + point.x, 0) / footprintCorners.length;
    this.y = footprintCorners.reduce((sum, point) => sum + point.y, 0) / footprintCorners.length;
    
    this.widthPx = gridWidth * tileSize * 2;
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
      // Skip stealthed units unless detected by this faction
      if (enemy.isStealthed && !game.isEntityDetected(enemy, this.faction)) continue;
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
          coords.y,
          this.race
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
        unit = new Harvester(unitId, this.faction, coords.x, coords.y, this.race);
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
          def?.attackRange,
          this.race
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
    const palette = getEntityPalette(this, game);
    const time = game?.currentTime ?? Date.now() / 1000;
    const isNod = this.race === 'nod';

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

    // Shared architectural pass: readable facades make the structure feel like
    // a building instead of a single extruded tile. Individual silhouettes
    // below still provide the faction-specific identity on top of this layer.
    if (['cyard', 'power', 'refinery', 'barracks'].includes(this.type)) {
      this.drawSharedFacadeDetails(
        ctx,
        ptLeft,
        ptBottom,
        ptRight,
        roof,
        h,
        palette,
        time,
        isNod
      );
    }

    const rx = roof.centerX;
    const ry = roof.centerY;
    const roofW = roof.ptRightRoof.x - roof.ptLeftRoof.x;
    const roofH = roof.ptBottomRoof.y - roof.ptTopRoof.y;

    this.drawBuildingDetails(ctx, rx, ry, roofW, roofH, roof, palette, time, isNod);

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

  drawSharedFacadeDetails(ctx, ptLeft, ptBottom, ptRight, roof, h, palette, time, isNod) {
    const leftTop = roof.ptLeftRoof;
    const centerTop = roof.ptBottomRoof;
    const rightTop = roof.ptRightRoof;

    // Return a point on one of the two vertical front walls. `t` follows the
    // wall from left-to-right and `v` travels from the roof down to the base.
    const wallPoint = (topA, topB, baseA, baseB, t, v) => ({
      x: topA.x + (topB.x - topA.x) * t,
      y: topA.y + (topB.y - topA.y) * t + (baseA.y + (baseB.y - baseA.y) * t - (topA.y + (topB.y - topA.y) * t)) * v,
    });

    const drawWallPanel = (topA, topB, baseA, baseB, t1, t2, v1, v2, fill, stroke) => {
      const p1 = wallPoint(topA, topB, baseA, baseB, t1, v1);
      const p2 = wallPoint(topA, topB, baseA, baseB, t2, v1);
      const p3 = wallPoint(topA, topB, baseA, baseB, t2, v2);
      const p4 = wallPoint(topA, topB, baseA, baseB, t1, v2);

      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.fill();

      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
      return { p1, p2, p3, p4 };
    };

    const windowColor = isNod ? '#ff5266' : palette.accent;
    const windowGlow = isNod ? 'rgba(255, 23, 68, 0.72)' : 'rgba(128, 222, 234, 0.72)';
    const windowCount = (wallLength) => Math.max(2, Math.min(3, wallLength));

    const drawFacadeWindow = (topA, topB, baseA, baseB, center, span) => {
      const frame = drawWallPanel(
        topA,
        topB,
        baseA,
        baseB,
        center - span,
        center + span,
        0.28,
        0.61,
        '#10181d',
        'rgba(0, 0, 0, 0.9)'
      );
      const inset = drawWallPanel(
        topA,
        topB,
        baseA,
        baseB,
        center - span * 0.7,
        center + span * 0.7,
        0.33,
        0.56,
        windowGlow,
        null
      );

      // Mullions and a thin upper reflection keep the windows legible at
      // normal game scale without turning them into flat bright rectangles.
      ctx.strokeStyle = 'rgba(220, 250, 255, 0.55)';
      ctx.lineWidth = 0.65;
      const mullionTop = wallPoint(topA, topB, baseA, baseB, center, 0.34);
      const mullionBottom = wallPoint(topA, topB, baseA, baseB, center, 0.55);
      ctx.beginPath();
      ctx.moveTo(mullionTop.x, mullionTop.y);
      ctx.lineTo(mullionBottom.x, mullionBottom.y);
      ctx.stroke();

      ctx.strokeStyle = windowColor;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.moveTo(inset.p1.x, inset.p1.y + 0.6);
      ctx.lineTo(inset.p2.x, inset.p2.y + 0.6);
      ctx.stroke();
      ctx.globalAlpha = 1;
      return frame;
    };

    const drawWindowRow = (topA, topB, baseA, baseB, count) => {
      const span = count === 3 ? 0.075 : 0.1;
      for (let i = 0; i < count; i++) {
        drawFacadeWindow(topA, topB, baseA, baseB, (i + 1) / (count + 1), span);
      }
    };

    // Windows are recessed into the two visible walls, with the wall length
    // controlling the number of bays so larger structures gain detail.
    drawWindowRow(leftTop, centerTop, ptLeft, ptBottom, windowCount(this.gridHeight));
    drawWindowRow(centerTop, rightTop, ptBottom, ptRight, windowCount(this.gridWidth));

    // A service entrance anchors the facade at ground level. The barracks has
    // a larger animated roll-up door of its own, so use a compact personnel
    // door there and let the specialized treatment sit over it.
    const doorCenter = this.type === 'refinery' ? 0.66 : 0.5;
    const door = drawWallPanel(
      leftTop,
      centerTop,
      ptLeft,
      ptBottom,
      doorCenter - 0.11,
      doorCenter + 0.11,
      0.55,
      0.96,
      isNod ? '#240d13' : '#0b1216',
      isNod ? 'rgba(255, 23, 68, 0.78)' : 'rgba(128, 222, 234, 0.55)'
    );

    // Door frame, handle light, and a small protective canopy.
    ctx.strokeStyle = isNod ? '#ff1744' : palette.trim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(door.p1.x, door.p1.y);
    ctx.lineTo(door.p4.x, door.p4.y);
    ctx.moveTo(door.p2.x, door.p2.y);
    ctx.lineTo(door.p3.x, door.p3.y);
    ctx.stroke();

    const handle = wallPoint(leftTop, centerTop, ptLeft, ptBottom, doorCenter + 0.065, 0.78);
    ctx.fillStyle = isNod ? '#ff5266' : '#ffab00';
    ctx.fillRect(handle.x - 0.8, handle.y - 0.8, 1.6, 1.6);

    const canopyA = wallPoint(leftTop, centerTop, ptLeft, ptBottom, doorCenter - 0.15, 0.5);
    const canopyB = wallPoint(leftTop, centerTop, ptLeft, ptBottom, doorCenter + 0.15, 0.5);
    ctx.strokeStyle = isNod ? '#7f0000' : '#607d8b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(canopyA.x, canopyA.y);
    ctx.lineTo(canopyB.x, canopyB.y);
    ctx.stroke();

    // Reinforced vertical corner posts and roof-edge highlights provide a
    // crisp silhouette against the terrain at both day and night.
    ctx.strokeStyle = '#10171b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ptLeft.x, ptLeft.y);
    ctx.lineTo(leftTop.x, leftTop.y);
    ctx.moveTo(ptBottom.x, ptBottom.y);
    ctx.lineTo(centerTop.x, centerTop.y);
    ctx.moveTo(ptRight.x, ptRight.y);
    ctx.lineTo(rightTop.x, rightTop.y);
    ctx.stroke();

    ctx.strokeStyle = palette.trim;
    ctx.globalAlpha = 0.58;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(leftTop.x, leftTop.y);
    ctx.lineTo(centerTop.x, centerTop.y);
    ctx.lineTo(rightTop.x, rightTop.y);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Small roof vents add scale and a sense of working machinery. They are
    // intentionally subtle so the existing structure-specific props remain
    // the visual focus.
    const ventX = centerTop.x + (rightTop.x - centerTop.x) * 0.38;
    const ventY = centerTop.y + (rightTop.y - centerTop.y) * 0.38 - 2;
    ctx.fillStyle = isNod ? '#291014' : '#18242a';
    ctx.fillRect(ventX - 4, ventY - 2, 8, 3);
    ctx.strokeStyle = isNod ? '#7f0000' : '#607d8b';
    ctx.lineWidth = 0.7;
    for (let i = -2; i <= 2; i += 2) {
      ctx.beginPath();
      ctx.moveTo(ventX + i, ventY - 1.5);
      ctx.lineTo(ventX + i, ventY + 0.5);
      ctx.stroke();
    }

    // A soft animated status lamp gives the otherwise static facade a bit of
    // life without adding another large light source.
    const lamp = wallPoint(centerTop, rightTop, ptBottom, ptRight, 0.16, 0.72);
    ctx.fillStyle = isNod ? '#ff1744' : '#00e5ff';
    ctx.globalAlpha = 0.55 + Math.sin(time * 4) * 0.2;
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawBuildingDetails(ctx, rx, ry, roofW, roofH, roof, palette, time, isNod) {
    switch (this.type) {
      case 'cyard':
        this.drawCyardDetails(ctx, rx, ry, roofW, roofH, roof, palette, time, isNod);
        break;
      case 'power':
        this.drawPowerDetails(ctx, rx, ry, roofW, roofH, palette, time, isNod);
        break;
      case 'refinery':
        this.drawRefineryDetails(ctx, rx, ry, roofW, roofH, palette, time, isNod);
        break;
      case 'barracks':
        this.drawBarracksDetails(ctx, rx, ry, roofW, roofH, palette, time, isNod);
        break;
      case 'fence':
        this.drawFenceDetails(ctx, rx, ry, roofW, roofH, palette, isNod);
        break;
      case 'gate':
        this.drawGateDetails(ctx, rx, ry, roofW, roofH, palette, time, isNod);
        break;
      case 'turret':
        this.drawTurretDetails(ctx, rx, ry, roofW, roofH, palette, isNod);
        break;
      case 'laser':
        this.drawLaserDetails(ctx, rx, ry, roofW, roofH, palette, time, isNod);
        break;
      case 'explosive_tower':
        this.drawExplosiveTowerDetails(ctx, rx, ry, roofW, roofH, palette, time, isNod);
        break;
    }
  }

  drawCyardDetails(ctx, rx, ry, roofW, roofH, roof, palette, time, isNod) {
    if (isNod) {
      // Nod Construction Yard / Temple HQ
      // Base dark obsidian pyramid module
      ctx.fillStyle = '#141414';
      ctx.beginPath();
      ctx.moveTo(rx, ry - 54);
      ctx.lineTo(rx + roofW * 0.38, ry + roofH * 0.1);
      ctx.lineTo(rx - roofW * 0.38, ry + roofH * 0.1);
      ctx.closePath();
      ctx.fill();

      // Red glowing armor seam cuts
      ctx.strokeStyle = '#ef5350';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(rx, ry - 54);
      ctx.lineTo(rx, ry + roofH * 0.1);
      ctx.moveTo(rx - roofW * 0.18, ry - 22);
      ctx.lineTo(rx + roofW * 0.18, ry - 22);
      ctx.stroke();

      // Top Obelisk Spire & Pulsing Orb
      const pulse = 0.5 + Math.sin(time * 5) * 0.4;
      ctx.save();
      ctx.shadowColor = '#ff1744';
      ctx.shadowBlur = 16 * pulse;
      ctx.fillStyle = `rgba(255, 23, 68, ${0.6 + 0.4 * pulse})`;
      ctx.beginPath();
      ctx.arc(rx, ry - 54, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Nod Scorpion Insignia on facade
      ctx.fillStyle = palette.primary;
      ctx.beginPath();
      ctx.moveTo(rx, ry - 14);
      ctx.lineTo(rx + 6, ry - 2);
      ctx.lineTo(rx + 2, ry + 2);
      ctx.lineTo(rx - 2, ry + 2);
      ctx.lineTo(rx - 6, ry - 2);
      ctx.closePath();
      ctx.fill();

      // Holographic scanning grid projected on pad
      const gridScan = (time * 1.5) % 1;
      ctx.strokeStyle = 'rgba(255, 23, 68, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(rx, ry + roofH * 0.15, roofW * 0.32, roofH * 0.18, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255, 23, 68, ${0.7 * (1 - gridScan)})`;
      ctx.beginPath();
      ctx.ellipse(rx, ry + roofH * 0.15, roofW * 0.32 * gridScan, roofH * 0.18 * gridScan, 0, 0, Math.PI * 2);
      ctx.stroke();

      return;
    }

    // GDI Construction Yard
    // Front foundation hazard stripes
    if (roof.ptLeftRoof && roof.ptBottomRoof) {
      drawHazardStripes(ctx, roof.ptLeftRoof, roof.ptBottomRoof, 3, 5, palette.accent, '#1a1a1a');
    }

    // Multi-tier Command Tower on Left
    const tx = rx - roofW * 0.2;
    const ty = ry - roofH * 0.1;
    ctx.fillStyle = '#263238';
    ctx.fillRect(tx - 10, ty - 32, 20, 32);
    ctx.strokeStyle = '#102027';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(tx - 10, ty - 32, 20, 32);

    // Command Tower Illuminated Glass Windows
    const windowGlow = 0.7 + Math.sin(time * 3) * 0.2;
    ctx.fillStyle = `rgba(79, 195, 247, ${windowGlow})`;
    ctx.fillRect(tx - 8, ty - 28, 16, 5);
    ctx.fillRect(tx - 8, ty - 20, 16, 4);

    // Rotating Radar Dish Array on top of Command Tower
    drawRadarDish(ctx, tx, ty - 36, 11, time, palette.primary);

    // Blinking red beacon light
    if (Math.sin(time * 7) > 0) {
      ctx.fillStyle = '#ff1744';
      ctx.beginPath();
      ctx.arc(tx + 8, ty - 34, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Heavy Industrial Crane Arm on Right
    const cx = rx + roofW * 0.18;
    const cy = ry + roofH * 0.05;
    const craneTipX = rx + roofW * 0.35 + Math.sin(time * 0.8) * 4;
    const craneTipY = ry - roofH * 0.32;

    ctx.strokeStyle = '#607d8b';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(craneTipX, craneTipY);
    ctx.stroke();

    // Crane lattice truss lines
    ctx.strokeStyle = '#37474f';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 8);
    ctx.lineTo(craneTipX - 5, craneTipY + 8);
    ctx.stroke();

    // Crane Cable & Hook
    ctx.strokeStyle = '#cfd8dc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(craneTipX, craneTipY);
    ctx.lineTo(craneTipX, craneTipY + 18);
    ctx.stroke();

    // Hook payload
    ctx.fillStyle = palette.accent;
    ctx.fillRect(craneTipX - 3, craneTipY + 18, 6, 4);

    // Animated Welding Sparks at tip
    if (Math.sin(time * 18) > 0.3) {
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = palette.accent;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(craneTipX + Math.sin(time * 25) * 3, craneTipY + 22 + Math.cos(time * 25) * 2, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Roof Helipad / Drop Zone Markings
    const hx = rx + roofW * 0.08;
    const hy = ry + roofH * 0.02;
    ctx.strokeStyle = palette.trim;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.ellipse(hx, hy, roofW * 0.2, roofH * 0.18, 0, 0, Math.PI * 2);
    ctx.stroke();

    // "H" Marking
    ctx.fillStyle = palette.trim;
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('H', hx, hy);
    ctx.globalAlpha = 1.0;
  }

  drawPowerDetails(ctx, rx, ry, roofW, roofH, palette, time, isNod) {
    if (isNod) {
      // Nod Tiberium Reactor
      // Base metallic housing
      drawCylinder(ctx, rx, ry + 4, 18, 10, 16, { side: '#1a1a1a', top: '#2c2c2c', edge: '#000' });

      // Translucent Glowing Tiberium Containment Core
      const pulse = (Math.sin(time * 4) + 1) / 2;
      const coreColor = `rgba(0, 230, 118, ${0.6 + pulse * 0.35})`;

      ctx.save();
      ctx.shadowColor = '#00e676';
      ctx.shadowBlur = this.isUnderConstruction ? 0 : 16 + pulse * 10;
      ctx.fillStyle = coreColor;
      ctx.beginPath();
      ctx.ellipse(rx, ry - 8, 11, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      // Tiberium Crystal inside core
      if (!this.isUnderConstruction) {
        drawTiberiumCrystal(ctx, rx, ry - 10, 7, '#00e676');
      }
      ctx.restore();

      // Glowing Liquid Conduits / Pipes wrapping around
      ctx.strokeStyle = '#00e676';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(rx - 10, ry, 6, 0, Math.PI);
      ctx.arc(rx + 10, ry, 6, 0, Math.PI);
      ctx.stroke();
      ctx.globalAlpha = 1.0;

      // Exhaust heat vent grilles with orange thermal glow
      ctx.fillStyle = '#ff6d00';
      ctx.fillRect(rx - 6, ry + 2, 12, 3);
      return;
    }

    // GDI Advanced Power Plant
    // Twin Heavy Cooling Towers / Turbines
    drawCylinder(ctx, rx - 16, ry, 9, 6, 22, { side: '#37474f', top: '#546e7a', edge: '#102027' });
    drawCylinder(ctx, rx + 16, ry + 3, 9, 6, 22, { side: '#37474f', top: '#546e7a', edge: '#102027' });

    // Spinning turbine fan blades inside top grilles
    const fanAngle = time * 8;
    for (const cx of [rx - 16, rx + 16]) {
      const cy = cx < rx ? ry - 22 : ry - 19;
      ctx.strokeStyle = '#263238';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(fanAngle) * 5, cy - Math.sin(fanAngle) * 3);
      ctx.lineTo(cx + Math.cos(fanAngle) * 5, cy + Math.sin(fanAngle) * 3);
      ctx.stroke();
    }

    // Central High-Voltage Generator Housing
    ctx.fillStyle = '#263238';
    ctx.fillRect(rx - 10, ry - 12, 20, 16);
    ctx.strokeStyle = '#102027';
    ctx.strokeRect(rx - 10, ry - 12, 20, 16);

    // High Voltage Danger Decal (Yellow Triangle)
    ctx.fillStyle = '#ffab00';
    ctx.beginPath();
    ctx.moveTo(rx, ry - 10);
    ctx.lineTo(rx + 4, ry - 3);
    ctx.lineTo(rx - 4, ry - 3);
    ctx.closePath();
    ctx.fill();

    // High-Voltage Tesla Electric Plasma Arc between cooling tower electrodes!
    if (!this.isUnderConstruction) {
      drawElectricArc(ctx, rx - 16, ry - 24, rx + 16, ry - 21, time, palette.primary);
      drawSmokePuff(ctx, rx - 16, ry - 26, time, 1.2, 0.4);
      drawSmokePuff(ctx, rx + 16, ry - 23, time, 2.7, 0.4);
    }
  }

  drawRefineryDetails(ctx, rx, ry, roofW, roofH, palette, time, isNod) {
    if (isNod) {
      // Nod Tiberium Refinery
      drawCylinder(ctx, rx - 16, ry - 2, 10, 6, 24, { side: '#1a1a1a', top: '#333333', edge: '#000' });
      drawCylinder(ctx, rx + 16, ry + 3, 9, 5, 20, { side: '#1a1a1a', top: '#333333', edge: '#000' });

      // Crimson accent panels
      ctx.fillStyle = palette.primary;
      ctx.fillRect(rx - 16, ry - 14, 10, 3);
      ctx.fillRect(rx + 16, ry - 10, 9, 3);

      // Tiberium Processing Swirling Vat
      ctx.fillStyle = 'rgba(0, 230, 118, 0.5)';
      ctx.beginPath();
      ctx.ellipse(rx, ry + 2, 8, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Harvester laser guide lines at loading chute
      ctx.strokeStyle = '#ff1744';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(rx - 12, ry + roofH * 0.12);
      ctx.lineTo(rx + 12, ry + roofH * 0.12);
      ctx.stroke();

      if (!this.isUnderConstruction) {
        drawSmokePuff(ctx, rx - 16, ry - 28, time, 0.6, 0.5);
      }
      return;
    }

    // GDI Tiberium Refinery
    // Dual Storage Silos with Liquid Level Gauges
    drawCylinder(ctx, rx - 18, ry, 10, 6, 24, { side: '#455a64', top: '#607d8b', edge: '#102027' });
    drawCylinder(ctx, rx + 16, ry + 4, 9, 5, 20, { side: '#455a64', top: '#607d8b', edge: '#102027' });

    // Vertical Glowing Liquid Level Sight Gauge on Silos
    const gaugeFill = 0.4 + Math.sin(time * 1.5) * 0.25;
    ctx.fillStyle = '#0f1416';
    ctx.fillRect(rx - 20, ry - 18, 3, 14);
    ctx.fillStyle = '#00e676';
    ctx.fillRect(rx - 20, ry - 18 + (14 * (1 - gaugeFill)), 3, 14 * gaugeFill);

    // Industrial Pipe Bridge connecting silos
    ctx.strokeStyle = '#78909c';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(rx - 18, ry - 12);
    ctx.lineTo(rx + 16, ry - 6);
    ctx.stroke();

    // Tiberium Ore Hopper with Crystal Clusters
    ctx.fillStyle = '#263238';
    ctx.beginPath();
    ctx.moveTo(rx - 8, ry - 4);
    ctx.lineTo(rx + 8, ry - 4);
    ctx.lineTo(rx + 5, ry + 8);
    ctx.lineTo(rx - 5, ry + 8);
    ctx.closePath();
    ctx.fill();

    // Tiberium Crystals in Hopper
    drawTiberiumCrystal(ctx, rx - 2, ry, 5, '#00e676');
    drawTiberiumCrystal(ctx, rx + 3, ry + 2, 4, '#76ff03');

    // Harvester Unloading Dock Ramp with Hazard Stripes
    const rampPt1 = { x: rx - roofW * 0.16, y: ry + roofH * 0.12 };
    const rampPt2 = { x: rx + roofW * 0.16, y: ry + roofH * 0.12 };
    drawHazardStripes(ctx, rampPt1, rampPt2, 4, 5, palette.accent, '#1a1a1a');

    // Overhead guide lamps
    ctx.fillStyle = '#ffab00';
    ctx.beginPath();
    ctx.arc(rampPt1.x, rampPt1.y - 4, 2, 0, Math.PI * 2);
    ctx.arc(rampPt2.x, rampPt2.y - 4, 2, 0, Math.PI * 2);
    ctx.fill();

    // Exhaust Smokestacks
    ctx.fillStyle = '#37474f';
    ctx.fillRect(rx - 3, ry - 26, 6, 18);

    if (!this.isUnderConstruction) {
      drawSmokePuff(ctx, rx, ry - 30, time, 0.5, 0.45);
      drawSmokePuff(ctx, rx + 3, ry - 36, time, 1.4, 0.35);
    }
  }

  drawBarracksDetails(ctx, rx, ry, roofW, roofH, palette, time, isNod) {
    if (isNod) {
      // HAND OF NOD — a black, armored hand rising from a red-lit temple.
      // The silhouette is deliberately built from filled shapes so the five
      // digits remain readable at the game's normal zoom level.
      ctx.save();

      // Low plinth and recessed infantry deployment door.
      ctx.fillStyle = '#0c0d0e';
      ctx.beginPath();
      ctx.moveTo(rx - 26, ry + 8);
      ctx.lineTo(rx - 20, ry - 9);
      ctx.lineTo(rx + 20, ry - 9);
      ctx.lineTo(rx + 26, ry + 8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#4f1118';
      ctx.lineWidth = 1.3;
      ctx.stroke();

      ctx.fillStyle = '#300b11';
      ctx.fillRect(rx - 10, ry - 1, 20, 10);
      ctx.strokeStyle = '#9e1b2b';
      ctx.lineWidth = 1;
      ctx.strokeRect(rx - 10, ry - 1, 20, 10);
      ctx.fillStyle = '#ff1744';
      ctx.globalAlpha = 0.7 + Math.sin(time * 6) * 0.2;
      ctx.fillRect(rx - 7, ry + 2, 14, 3);
      ctx.globalAlpha = 1;

      // Tapered armored wrist. The red side panels give the silhouette a
      // hard, sculpted edge instead of looking like a floating icon.
      ctx.fillStyle = '#17191b';
      ctx.beginPath();
      ctx.moveTo(rx - 13, ry - 4);
      ctx.lineTo(rx - 10, ry - 30);
      ctx.lineTo(rx + 10, ry - 30);
      ctx.lineTo(rx + 13, ry - 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#070809';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#60111a';
      ctx.beginPath();
      ctx.moveTo(rx - 10, ry - 27);
      ctx.lineTo(rx - 6, ry - 29);
      ctx.lineTo(rx - 6, ry - 6);
      ctx.lineTo(rx - 11, ry - 8);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(rx + 10, ry - 27);
      ctx.lineTo(rx + 6, ry - 29);
      ctx.lineTo(rx + 6, ry - 6);
      ctx.lineTo(rx + 11, ry - 8);
      ctx.closePath();
      ctx.fill();

      // Draw a digit as a dark armored tube with a narrow crimson edge. The
      // joints and pointed tips make each finger distinct at small scale.
      const drawDigit = (points, width, tip) => {
        ctx.strokeStyle = '#08090a';
        ctx.lineWidth = width + 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(rx + points[0][0], ry + points[0][1]);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(rx + points[i][0], ry + points[i][1]);
        }
        ctx.stroke();

        ctx.strokeStyle = '#25282b';
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(rx + points[0][0], ry + points[0][1]);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(rx + points[i][0], ry + points[i][1]);
        }
        ctx.stroke();

        ctx.strokeStyle = '#8f1828';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(rx + points[0][0] - 0.8, ry + points[0][1] - 1);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(rx + points[i][0] - 0.8, ry + points[i][1] - 1);
        }
        ctx.stroke();

        const last = points[points.length - 1];
        const previous = points[points.length - 2];
        const length = Math.hypot(last[0] - previous[0], last[1] - previous[1]) || 1;
        const nx = (last[0] - previous[0]) / length;
        const ny = (last[1] - previous[1]) / length;
        ctx.fillStyle = '#08090a';
        ctx.beginPath();
        ctx.moveTo(rx + last[0] + nx * tip, ry + last[1] + ny * tip);
        ctx.lineTo(rx + last[0] - ny * 3, ry + last[1] + nx * 3);
        ctx.lineTo(rx + last[0] + ny * 3, ry + last[1] - nx * 3);
        ctx.closePath();
        ctx.fill();
      };

      // Thumb, index, middle, ring, and little finger curl inward around the
      // orb, matching the iconic raised-hand silhouette.
      drawDigit([[-8, -25], [-19, -30], [-25, -40], [-23, -47]], 7, 5);
      drawDigit([[-7, -28], [-14, -41], [-15, -56], [-11, -64]], 8, 5);
      drawDigit([[-3, -29], [-6, -44], [-4, -61], [0, -70]], 8.5, 5);
      drawDigit([[4, -29], [7, -44], [11, -58], [15, -65]], 8, 5);
      drawDigit([[9, -25], [18, -35], [22, -47], [21, -55]], 6.5, 5);

      // Palm armor overlaps the digit roots, visually joining the fingers to
      // the wrist instead of leaving five separate floating strokes.
      ctx.fillStyle = '#1b1d1f';
      ctx.beginPath();
      ctx.moveTo(rx - 12, ry - 29);
      ctx.lineTo(rx - 16, ry - 38);
      ctx.lineTo(rx - 9, ry - 45);
      ctx.lineTo(rx, ry - 42);
      ctx.lineTo(rx + 10, ry - 45);
      ctx.lineTo(rx + 16, ry - 36);
      ctx.lineTo(rx + 11, ry - 27);
      ctx.lineTo(rx + 10, ry - 13);
      ctx.lineTo(rx - 10, ry - 13);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#070809';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Knuckle plates and palm seams add the segmented, industrial look of a
      // Nod production building without obscuring the hand silhouette.
      ctx.fillStyle = '#4d1119';
      for (const [x, y, w] of [[-10, -37, 5], [-4, -40, 5], [4, -40, 5], [10, -36, 5]]) {
        ctx.fillRect(rx + x - w / 2, ry + y, w, 2.5);
      }
      ctx.strokeStyle = '#8f1828';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rx - 7, ry - 27);
      ctx.lineTo(rx - 3, ry - 17);
      ctx.lineTo(rx + 4, ry - 15);
      ctx.lineTo(rx + 8, ry - 27);
      ctx.stroke();

      // The red power orb sits in the palm and gives the structure an
      // unmistakable focal point, like the original Hand of Nod artwork.
      const pulse = 0.5 + Math.sin(time * 5) * 0.4;
      ctx.save();
      ctx.shadowColor = '#ff1744';
      ctx.shadowBlur = 16 * pulse;
      ctx.fillStyle = `rgba(255, 23, 68, ${0.65 + 0.35 * pulse})`;
      ctx.beginPath();
      ctx.arc(rx, ry - 34, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = 'rgba(255, 125, 140, 0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(rx - 1, ry - 35, 3.5, Math.PI * 1.1, Math.PI * 1.8);
      ctx.stroke();

      // Nod emblem on the temple plinth.
      ctx.fillStyle = palette.primary;
      ctx.beginPath();
      ctx.moveTo(rx, ry - 7);
      ctx.lineTo(rx + 5, ry - 2);
      ctx.lineTo(rx, ry + 1);
      ctx.lineTo(rx - 5, ry - 2);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
      return;
    }

    // GDI Warfactory / Motor Pool
    // Heavy Vehicle Roll-Up Shutter Door with Hazard Stripes
    const doorPt1 = { x: rx - 10, y: ry + 6 };
    const doorPt2 = { x: rx + 10, y: ry + 6 };
    ctx.fillStyle = '#263238';
    ctx.fillRect(rx - 12, ry + 1, 24, 10);
    drawHazardStripes(ctx, doorPt1, doorPt2, 3, 4, palette.accent, '#1a1a1a');

    // Overhead Crane Gantry Rail Frame for vehicle repairs
    ctx.strokeStyle = '#78909c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rx - 16, ry - 14);
    ctx.lineTo(rx + 16, ry - 14);
    ctx.lineTo(rx + 16, ry - 2);
    ctx.moveTo(rx - 16, ry - 14);
    ctx.lineTo(rx - 16, ry - 2);
    ctx.stroke();

    // Workshop Window Slits with warm interior amber glow
    const glow = 0.5 + Math.sin(time * 3) * 0.2;
    ctx.fillStyle = `rgba(255, 179, 0, ${glow})`;
    ctx.fillRect(rx - 18, ry - 6, 5, 3);
    ctx.fillRect(rx + 13, ry - 6, 5, 3);

    // Sandbag fortified corners
    ctx.fillStyle = '#795548';
    for (const ox of [-roofW * 0.24, roofW * 0.2]) {
      ctx.beginPath();
      ctx.ellipse(rx + ox, ry + roofH * 0.1, 7, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#4e342e';
      ctx.stroke();
    }

    // Flagpole with waving GDI Faction Banner
    ctx.strokeStyle = '#cfd8dc';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rx + roofW * 0.22, ry - roofH * 0.1);
    ctx.lineTo(rx + roofW * 0.22, ry - roofH * 0.38);
    ctx.stroke();

    const wave = Math.sin(time * 6) * 2.5;
    ctx.fillStyle = palette.primary;
    ctx.beginPath();
    ctx.moveTo(rx + roofW * 0.22, ry - roofH * 0.38);
    ctx.lineTo(rx + roofW * 0.22 + 16 + wave, ry - roofH * 0.35);
    ctx.lineTo(rx + roofW * 0.22 + 14 + wave, ry - roofH * 0.28);
    ctx.lineTo(rx + roofW * 0.22, ry - roofH * 0.31);
    ctx.closePath();
    ctx.fill();
  }

  drawFenceDetails(ctx, rx, ry, roofW, roofH, palette, isNod) {
    if (isNod) {
      // Nod Spike Barrier with Red Laser Razor Wire
      ctx.fillStyle = '#1c1c1c';
      for (const ox of [-roofW * 0.28, 0, roofW * 0.28]) {
        ctx.fillRect(rx + ox - 2, ry - 18, 4, 20);
        // Angular spike tip
        ctx.fillStyle = palette.primary;
        ctx.beginPath();
        ctx.moveTo(rx + ox, ry - 24);
        ctx.lineTo(rx + ox + 3, ry - 18);
        ctx.lineTo(rx + ox - 3, ry - 18);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#1c1c1c';
      }

      // Glowing Red Laser Wires between spikes
      ctx.save();
      ctx.shadowColor = '#ff1744';
      ctx.shadowBlur = 6;
      ctx.strokeStyle = '#ff1744';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rx - roofW * 0.28, ry - 14);
      ctx.lineTo(rx + roofW * 0.28, ry - 14);
      ctx.moveTo(rx - roofW * 0.28, ry - 8);
      ctx.lineTo(rx + roofW * 0.28, ry - 8);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // GDI Concrete Barrier Wall with Steel Caps & Warning Stripes
    ctx.fillStyle = '#546e7a';
    ctx.fillRect(rx - roofW * 0.35, ry - 12, roofW * 0.7, 14);
    ctx.strokeStyle = '#263238';
    ctx.lineWidth = 1;
    ctx.strokeRect(rx - roofW * 0.35, ry - 12, roofW * 0.7, 14);

    // Yellow Hazard Stripes along barrier top
    const p1 = { x: rx - roofW * 0.32, y: ry - 12 };
    const p2 = { x: rx + roofW * 0.32, y: ry - 12 };
    drawHazardStripes(ctx, p1, p2, 3, 4, palette.accent, '#1a1a1a');

    // Steel cap posts
    ctx.fillStyle = '#78909c';
    ctx.fillRect(rx - roofW * 0.35 - 1, ry - 14, 4, 16);
    ctx.fillRect(rx + roofW * 0.35 - 3, ry - 14, 4, 16);
  }

  drawGateDetails(ctx, rx, ry, roofW, roofH, palette, time, isNod) {
    if (isNod) {
      // Nod Laser Gate Pillars & Forcefield Beam
      ctx.fillStyle = '#1c1c1c';
      ctx.fillRect(rx - roofW * 0.35, ry - 22, 6, 26);
      ctx.fillRect(rx + roofW * 0.35 - 6, ry - 22, 6, 26);

      // Crimson Emitter Tops
      ctx.fillStyle = palette.primary;
      ctx.fillRect(rx - roofW * 0.35 - 1, ry - 25, 8, 4);
      ctx.fillRect(rx + roofW * 0.35 - 7, ry - 25, 8, 4);

      // Pulsing Red Forcefield Barrier Beam when gate is active
      const pulse = 0.5 + Math.sin(time * 8) * 0.35;
      ctx.save();
      ctx.shadowColor = '#ff1744';
      ctx.shadowBlur = 10 * pulse;
      ctx.strokeStyle = `rgba(255, 23, 68, ${0.7 + pulse * 0.3})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(rx - roofW * 0.32, ry - 10);
      ctx.lineTo(rx + roofW * 0.32, ry - 10);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // GDI Reinforced Gate Posts & Overhead Bar
    ctx.fillStyle = '#37474f';
    ctx.fillRect(rx - roofW * 0.36, ry - 22, 7, 26);
    ctx.fillRect(rx + roofW * 0.36 - 7, ry - 22, 7, 26);

    // Sliding steel gate leaf with inset rails and vertical locking bars.
    // Keeping the center panel dark preserves the readable opening between
    // the posts while the trim catches the faction color at game scale.
    const gateLeft = rx - roofW * 0.29;
    const gateRight = rx + roofW * 0.29;
    const gateTop = ry - 14;
    const gateBottom = ry + 2;
    ctx.fillStyle = '#172126';
    ctx.fillRect(gateLeft, gateTop, gateRight - gateLeft, gateBottom - gateTop);
    ctx.strokeStyle = palette.trim;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1;
    ctx.strokeRect(gateLeft, gateTop, gateRight - gateLeft, gateBottom - gateTop);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = '#607d8b';
    ctx.lineWidth = 1.2;
    for (let y = gateTop + 4; y < gateBottom; y += 5) {
      ctx.beginPath();
      ctx.moveTo(gateLeft + 2, y);
      ctx.lineTo(gateRight - 2, y);
      ctx.stroke();
    }
    for (let i = 1; i < 5; i++) {
      const x = gateLeft + ((gateRight - gateLeft) * i) / 5;
      ctx.beginPath();
      ctx.moveTo(x, gateTop + 1);
      ctx.lineTo(x, gateBottom - 1);
      ctx.stroke();
    }

    // Center lock housing and a tiny access indicator.
    ctx.fillStyle = '#263238';
    ctx.fillRect(rx - 4, ry - 8, 8, 8);
    ctx.strokeStyle = '#0f1416';
    ctx.strokeRect(rx - 4, ry - 8, 8, 8);
    ctx.fillStyle = '#00e676';
    ctx.fillRect(rx - 1, ry - 5, 2, 2);

    // Hazard stripes on gate posts
    const p1 = { x: rx - roofW * 0.36, y: ry - 18 };
    const p2 = { x: rx - roofW * 0.36, y: ry - 4 };
    drawHazardStripes(ctx, p1, p2, 4, 3, palette.accent, '#111');

    // Overhead Barrier Bar
    ctx.strokeStyle = '#78909c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(rx - roofW * 0.36, ry - 20);
    ctx.lineTo(rx + roofW * 0.36, ry - 20);
    ctx.stroke();

    // Warning Light Lamp
    if (Math.sin(time * 6) > 0) {
      ctx.fillStyle = '#ffab00';
      ctx.beginPath();
      ctx.arc(rx, ry - 22, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawTurretDetails(ctx, rx, ry, roofW, roofH, palette, isNod) {
    if (isNod) {
      // OBELISK OF LIGHT (Iconic Nod Heavy Laser Tower)
      // Tall obsidian pyramid spire
      ctx.fillStyle = '#0d0d0d';
      ctx.beginPath();
      ctx.moveTo(rx, ry - 48);
      ctx.lineTo(rx + 12, ry + 4);
      ctx.lineTo(rx - 12, ry + 4);
      ctx.closePath();
      ctx.fill();

      // Red glowing border frames along edges
      ctx.strokeStyle = '#ef5350';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rx, ry - 48);
      ctx.lineTo(rx + 8, ry + 3);
      ctx.moveTo(rx, ry - 48);
      ctx.lineTo(rx - 8, ry + 3);
      ctx.stroke();

      // Red central charging crystal slit
      ctx.fillStyle = '#ff1744';
      ctx.fillRect(rx - 2.5, ry - 22, 5, 18);

      // Tip intense pulsing crystal orb with aura flare!
      const pulse = 0.5 + Math.sin(Date.now() / 120) * 0.45;
      ctx.save();
      ctx.shadowColor = '#ff1744';
      ctx.shadowBlur = 18 * pulse;
      ctx.fillStyle = `rgba(255, 23, 68, ${0.55 + 0.45 * pulse})`;
      ctx.beginPath();
      ctx.arc(rx, ry - 48, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    // GDI Guard Tower / Cannon Turret
    // Fortified Pillbox Bunker Base with Sandbags
    drawCylinder(ctx, rx, ry + 4, 16, 9, 12, { side: '#37474f', top: '#546e7a', edge: '#102027' });

    // Sandbag Ring at base
    ctx.fillStyle = '#795548';
    ctx.beginPath();
    ctx.ellipse(rx, ry + 6, 17, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4e342e';
    ctx.stroke();

    // Rotating Twin Cannon Turret Top
    ctx.save();
    ctx.translate(rx, ry - 14);
    ctx.scale(1, 0.55);
    ctx.rotate(this.turretAngle);

    // Twin Cannon Barrels with Recoil Brakes
    ctx.fillStyle = '#90a4ae';
    ctx.fillRect(2, -5, 24, 4);
    ctx.fillRect(2, 1, 24, 4);
    ctx.strokeStyle = '#102027';
    ctx.strokeRect(2, -5, 24, 4);
    ctx.strokeRect(2, 1, 24, 4);

    // Turret Dome Cupola
    ctx.fillStyle = palette.primary;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawLaserDetails(ctx, rx, ry, roofW, roofH, palette, time, isNod) {
    if (isNod) {
      // Nod High-Tech Laser Turret Spire
      drawCylinder(ctx, rx, ry + 4, 12, 7, 10, { side: '#1c1c1c', top: '#333333', edge: '#000' });
      drawCylinder(ctx, rx, ry - 6, 6, 4, 22, { side: '#141414', top: palette.secondary, edge: '#000' });

      // Dual Red Laser Optics
      const pulse = 0.4 + Math.sin(time * 9) * 0.35;
      ctx.save();
      ctx.shadowColor = '#ff1744';
      ctx.shadowBlur = 12 * pulse;
      ctx.fillStyle = `rgba(255, 23, 68, ${0.5 + pulse * 0.5})`;
      ctx.beginPath();
      ctx.arc(rx - 3, ry - 28, 3.5, 0, Math.PI * 2);
      ctx.arc(rx + 3, ry - 28, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    // GDI Sonic Emitter Tower
    drawCylinder(ctx, rx, ry + 5, 14, 8, 26, { side: '#263238', top: '#455a64', edge: '#102027' });

    // Acoustic Speaker Rings Emitting Sonic Pulses
    const pulse = (time * 3) % 1;
    ctx.save();
    ctx.translate(rx, ry - 28);
    ctx.scale(1, 0.55);

    // Triple Concentric Acoustic Dish Rings
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.stroke();

    // Expanding Sonic Ring Wave
    ctx.strokeStyle = `rgba(128, 222, 234, ${0.8 * (1 - pulse)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 12 + pulse * 14, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  drawExplosiveTowerDetails(ctx, rx, ry, roofW, roofH, palette, time, isNod) {
    if (isNod) {
      // NOD SAM SITE (Anti-Air & Ground Missile Turret Pod)
      // Armored Base Pedestal
      drawCylinder(ctx, rx, ry + 4, 13, 8, 14, { side: '#1c1c1c', top: '#333333', edge: '#000' });

      // Rotating Quad Missile Launcher Box
      ctx.save();
      ctx.translate(rx, ry - 14);
      ctx.scale(1, 0.55);
      ctx.rotate(this.turretAngle);

      // Launcher Pod Box
      ctx.fillStyle = '#263238';
      ctx.fillRect(-8, -10, 22, 20);
      ctx.strokeStyle = '#000';
      ctx.strokeRect(-8, -10, 22, 20);

      // 4 Loaded Missiles with Red Warhead Tips
      ctx.fillStyle = '#d32f2f';
      ctx.fillRect(14, -8, 5, 3);
      ctx.fillRect(14, -3, 5, 3);
      ctx.fillRect(14, 2, 5, 3);
      ctx.fillRect(14, 7, 5, 3);

      ctx.restore();
      return;
    }

    // GDI Disruptor / Heavy Mortar Tower
    drawCylinder(ctx, rx, ry + 3, 15, 9, 22, { side: '#4e342e', top: '#6d4c41', edge: '#102027' });

    // Reinforced Concrete Blast Shield Wall
    ctx.strokeStyle = palette.primary;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(rx, ry - 14, 12, Math.PI * 0.2, Math.PI * 1.8);
    ctx.stroke();

    // Heavy Mortar Cannon Barrel
    ctx.fillStyle = '#212121';
    ctx.fillRect(rx - 4, ry - 38, 8, 20);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(rx - 4, ry - 38, 8, 20);
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
    const halfW = this.tileSize;
    const halfH = this.tileSize / 2;
    const rowOffset = Math.abs(Math.floor(this.gridY)) % 2 === 1 ? halfW : 0;
    const originX = halfW + this.gridX * halfW * 2 + rowOffset;
    const originY = this.gridY * halfH;
    const localX = x - this.gridX;
    const localY = y - this.gridY;

    // Anchor the diamond at the top vertex of the starting terrain cell.
    return {
      x: originX + (localX - localY) * halfW,
      y: originY + (localX + localY) * halfH,
    };
  }
}
