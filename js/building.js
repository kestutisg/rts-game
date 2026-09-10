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
  drawGeodesicDome,
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
      if (tile && tile.walkable && !tile.occupiedBy && !tile.unitOccupant) {
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

      if (!game.addUnit(unit)) return;

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
      'rgba(0, 0, 0, 0.44)'
    );

    // Authentic Tiberian Sun Material Palettes:
    // GDI: Heavy reinforced desert-tan / ochre-yellow composite armor with dark steel seams
    // Nod: Stealth obsidian carbon composites with crimson energy seams
    const wallColors = isNod
      ? {
          left: '#101215',
          right: '#1a1d22',
          top: '#242830',
          edge: '#090a0c',
          pad: '#0e1013',
          padEdge: '#1c2026',
        }
      : {
          left: '#786139',
          right: '#9e824c',
          top: '#baa16b',
          edge: '#4a381d',
          pad: '#4a3b25',
          padEdge: '#614f33',
        };

    // Foundation pad
    drawIsoFootprint(ctx, ptTop, ptRight, ptBottom, ptLeft, wallColors.pad, wallColors.padEdge);

    // GDI Foundation Corner Hydraulic Anchor Jacks / Footings
    if (!isNod && !['fence', 'gate'].includes(this.type)) {
      ctx.fillStyle = '#37474f';
      ctx.strokeStyle = '#212121';
      ctx.lineWidth = 1;
      for (const pt of [ptTop, ptRight, ptBottom, ptLeft]) {
        ctx.beginPath();
        ctx.ellipse(pt.x, pt.y, 6, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Heavy hydraulic cylinder pin with yellow warning collar
        ctx.fillStyle = '#ffab00';
        ctx.fillRect(pt.x - 1.5, pt.y - 4, 3, 4);
        ctx.fillStyle = '#37474f';
      }
    }

    const h = this.height3D;
    const roof = drawExtrudedBlock(ctx, ptTop, ptRight, ptBottom, ptLeft, h, wallColors);

    // Faction trim band on front walls (GDI blue vs Nod crimson)
    ctx.fillStyle = isNod ? '#ef5350' : '#0288d1';
    ctx.globalAlpha = 0.65;
    ctx.beginPath();
    ctx.moveTo(ptLeft.x, ptLeft.y - 2);
    ctx.lineTo(ptBottom.x, ptBottom.y - 2);
    ctx.lineTo(ptBottom.x, ptBottom.y - 7);
    ctx.lineTo(ptLeft.x, ptLeft.y - 7);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(ptBottom.x, ptBottom.y - 2);
    ctx.lineTo(ptRight.x, ptRight.y - 2);
    ctx.lineTo(ptRight.x, ptRight.y - 7);
    ctx.lineTo(ptBottom.x, ptBottom.y - 7);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // GDI Yellow/Black Hazard Striping along bottom perimeter of primary installations
    if (!isNod && ['cyard', 'refinery'].includes(this.type)) {
      const hzP1 = { x: ptLeft.x, y: ptLeft.y - 3 };
      const hzP2 = { x: ptBottom.x, y: ptBottom.y - 3 };
      drawHazardStripes(ctx, hzP1, hzP2, 3, 5, '#ffb300', '#1a1a1a');
    }

    // Shared architectural pass: readable facades make the structure feel like
    // a building instead of a single extruded tile. Individual silhouettes
    // below provide the faction-specific identity on top of this layer.
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

    const windowColor = isNod ? '#ff5266' : '#80deea';
    const windowGlow = isNod ? 'rgba(255, 23, 68, 0.75)' : 'rgba(79, 195, 247, 0.85)';
    const windowCount = (wallLength) => Math.max(2, Math.min(3, wallLength));

    // Tiberian Sun GDI armored visor slits & Nod energy seams
    const drawFacadeVisor = (topA, topB, baseA, baseB, center, span) => {
      // Protective steel blast frame / armor eyebrow
      const frame = drawWallPanel(
        topA,
        topB,
        baseA,
        baseB,
        center - span,
        center + span,
        0.26,
        0.58,
        isNod ? '#0c0e11' : '#2b343a',
        isNod ? 'rgba(0, 0, 0, 0.95)' : '#192024'
      );
      // Ballistic visor slit with interior glow
      const inset = drawWallPanel(
        topA,
        topB,
        baseA,
        baseB,
        center - span * 0.75,
        center + span * 0.75,
        0.32,
        0.52,
        windowGlow,
        null
      );

      // Steel visor divider / mullion
      ctx.strokeStyle = isNod ? '#ff1744' : 'rgba(220, 250, 255, 0.7)';
      ctx.lineWidth = 0.7;
      const mullionTop = wallPoint(topA, topB, baseA, baseB, center, 0.33);
      const mullionBottom = wallPoint(topA, topB, baseA, baseB, center, 0.51);
      ctx.beginPath();
      ctx.moveTo(mullionTop.x, mullionTop.y);
      ctx.lineTo(mullionBottom.x, mullionBottom.y);
      ctx.stroke();

      // Slanted sunshade / blast deflector lip above visor
      ctx.strokeStyle = isNod ? '#7f0000' : '#455a64';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(frame.p1.x - 1, frame.p1.y - 0.5);
      ctx.lineTo(frame.p2.x + 1, frame.p2.y - 0.5);
      ctx.stroke();

      return frame;
    };

    const drawVisorRow = (topA, topB, baseA, baseB, count) => {
      const span = count === 3 ? 0.075 : 0.1;
      for (let i = 0; i < count; i++) {
        drawFacadeVisor(topA, topB, baseA, baseB, (i + 1) / (count + 1), span);
      }
    };

    // Visors on both visible walls
    drawVisorRow(leftTop, centerTop, ptLeft, ptBottom, windowCount(this.gridHeight));
    drawVisorRow(centerTop, rightTop, ptBottom, ptRight, windowCount(this.gridWidth));

    // Heavy Reinforced Personnel Blast Door
    const doorCenter = this.type === 'refinery' ? 0.68 : 0.5;
    const door = drawWallPanel(
      leftTop,
      centerTop,
      ptLeft,
      ptBottom,
      doorCenter - 0.11,
      doorCenter + 0.11,
      0.54,
      0.97,
      isNod ? '#1c080d' : '#21292f',
      isNod ? 'rgba(255, 23, 68, 0.85)' : '#10171b'
    );

    // Sliding blast panel seam
    ctx.strokeStyle = isNod ? '#ff1744' : '#607d8b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const doorMidTop = wallPoint(leftTop, centerTop, ptLeft, ptBottom, doorCenter, 0.56);
    const doorMidBottom = wallPoint(leftTop, centerTop, ptLeft, ptBottom, doorCenter, 0.96);
    ctx.moveTo(doorMidTop.x, doorMidTop.y);
    ctx.lineTo(doorMidBottom.x, doorMidBottom.y);
    ctx.stroke();

    // Hazard lintel above blast door (GDI yellow/black or Nod red/black)
    const lintelA = wallPoint(leftTop, centerTop, ptLeft, ptBottom, doorCenter - 0.12, 0.52);
    const lintelB = wallPoint(leftTop, centerTop, ptLeft, ptBottom, doorCenter + 0.12, 0.52);
    drawHazardStripes(ctx, lintelA, lintelB, 2.5, 3, isNod ? '#ff1744' : '#ffb300', '#1a1a1a');

    // Access status LED beacon beside door
    const ledPt = wallPoint(leftTop, centerTop, ptLeft, ptBottom, doorCenter + 0.13, 0.72);
    ctx.fillStyle = isNod ? '#ff1744' : '#00e676';
    ctx.beginPath();
    ctx.arc(ledPt.x, ledPt.y, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Reinforced corner pilasters / structural bevels
    ctx.strokeStyle = isNod ? '#07080a' : '#372b17';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(ptLeft.x, ptLeft.y);
    ctx.lineTo(leftTop.x, leftTop.y);
    ctx.moveTo(ptBottom.x, ptBottom.y);
    ctx.lineTo(centerTop.x, centerTop.y);
    ctx.moveTo(ptRight.x, ptRight.y);
    ctx.lineTo(rightTop.x, rightTop.y);
    ctx.stroke();

    // Roof edge highlight
    ctx.strokeStyle = isNod ? '#ef5350' : '#d8ba78';
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(leftTop.x, leftTop.y);
    ctx.lineTo(centerTop.x, centerTop.y);
    ctx.lineTo(rightTop.x, rightTop.y);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Roof air filtration intake louvers
    const ventX = centerTop.x + (rightTop.x - centerTop.x) * 0.38;
    const ventY = centerTop.y + (rightTop.y - centerTop.y) * 0.38 - 2;
    ctx.fillStyle = isNod ? '#1c080d' : '#263238';
    ctx.fillRect(ventX - 5, ventY - 2.5, 10, 4);
    ctx.strokeStyle = isNod ? '#7f0000' : '#455a64';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(ventX - 5, ventY - 2.5, 10, 4);
    for (let i = -3; i <= 3; i += 2) {
      ctx.beginPath();
      ctx.moveTo(ventX + i, ventY - 2);
      ctx.lineTo(ventX + i, ventY + 1);
      ctx.stroke();
    }
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

    // GDI Construction Yard (Authentic Tiberian Sun Heavy Command Hub)
    // 1. Foundation hazard boundary along front edges
    if (roof.ptLeftRoof && roof.ptBottomRoof) {
      drawHazardStripes(ctx, roof.ptLeftRoof, roof.ptBottomRoof, 3, 5, '#ffb300', '#1a1a1a');
    }

    // 2. Command Bridge Superstructure on the Left
    const tx = rx - roofW * 0.22;
    const ty = ry - roofH * 0.08;
    // Reinforced tan composite bunker tower
    ctx.fillStyle = '#9e824c';
    ctx.fillRect(tx - 12, ty - 34, 24, 34);
    ctx.fillStyle = '#baa16b';
    ctx.beginPath();
    ctx.moveTo(tx - 12, ty - 34);
    ctx.lineTo(tx, ty - 40);
    ctx.lineTo(tx + 12, ty - 34);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#4a381d';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(tx - 12, ty - 34, 24, 34);

    // Panoramic Blue Glass Command Bridge Visor
    const windowGlow = 0.75 + Math.sin(time * 3) * 0.2;
    ctx.fillStyle = `rgba(79, 195, 247, ${windowGlow})`;
    ctx.fillRect(tx - 9, ty - 30, 18, 5);
    ctx.fillRect(tx - 9, ty - 22, 18, 4);

    // GDI Blue Identification Plate on Command Bridge
    ctx.fillStyle = '#0288d1';
    ctx.fillRect(tx - 8, ty - 14, 16, 3);

    // Red Obstruction Beacon atop command bridge mast
    ctx.strokeStyle = '#37474f';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tx, ty - 40);
    ctx.lineTo(tx, ty - 48);
    ctx.stroke();
    if (Math.sin(time * 7) > 0) {
      ctx.fillStyle = '#ff1744';
      ctx.beginPath();
      ctx.arc(tx, ty - 49, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Dual Geodesic Radar Radomes on Rear Deck (Tiberian Sun Signature)
    drawGeodesicDome(ctx, rx - roofW * 0.06, ry - roofH * 0.28, 10, '#e5e1d8', '#0288d1');
    drawGeodesicDome(ctx, rx + roofW * 0.16, ry - roofH * 0.22, 8.5, '#e5e1d8', '#0288d1');

    // Central Communications Antenna Dish between radomes
    drawRadarDish(ctx, rx + roofW * 0.05, ry - roofH * 0.26, 7.5, time, '#0288d1');

    // 4. Central Telescoping Heavy Crane & Gantry Truss on Front Deck
    const cx = rx + roofW * 0.22;
    const cy = ry + roofH * 0.06;
    const craneTipX = rx + roofW * 0.38 + Math.sin(time * 0.7) * 5;
    const craneTipY = ry - roofH * 0.34;

    // Heavy Gantry Turntable Base with Hazard Trim
    ctx.fillStyle = '#37474f';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffb300';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Crane boom lattice structure
    ctx.strokeStyle = '#baa16b';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 4);
    ctx.lineTo(craneTipX, craneTipY);
    ctx.stroke();

    // Lattice internal cross-braces
    ctx.strokeStyle = '#4a381d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(craneTipX - 6, craneTipY + 8);
    ctx.moveTo(cx + 4, cy - 6);
    ctx.lineTo(craneTipX - 2, craneTipY + 12);
    ctx.stroke();

    // Heavy Hoist Cable & Hook Block
    ctx.strokeStyle = '#cfd8dc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(craneTipX, craneTipY);
    ctx.lineTo(craneTipX, craneTipY + 20);
    ctx.stroke();

    // Hook payload / construction module
    ctx.fillStyle = '#ffb300';
    ctx.fillRect(craneTipX - 3.5, craneTipY + 20, 7, 4.5);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(craneTipX - 3.5, craneTipY + 20, 7, 4.5);

    // Active electric welding sparks burst
    if (Math.sin(time * 16) > 0.25) {
      ctx.save();
      ctx.shadowColor = '#80deea';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(craneTipX + Math.sin(time * 24) * 3, craneTipY + 24 + Math.cos(time * 24) * 2, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 5. Staging Pad / Assembly Bay Markings
    const hx = rx + roofW * 0.04;
    const hy = ry + roofH * 0.06;
    ctx.strokeStyle = '#ffb300';
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.7;
    ctx.strokeRect(hx - 12, hy - 7, 24, 14);
    ctx.fillStyle = '#0288d1';
    ctx.fillRect(hx - 8, hy - 4, 16, 8);
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

    // GDI Power Plant (Tiberian Sun Cylindrical Generator & Cooling Turbine Hub)
    // 1. Central Heavy Turbine Generator Housing with Tan Composite Buttresses
    drawCylinder(ctx, rx, ry + 2, 16, 9, 20, { side: '#786139', top: '#baa16b', edge: '#4a381d' });

    // Angled reinforced composite buttress wings
    ctx.fillStyle = '#9e824c';
    ctx.beginPath();
    ctx.moveTo(rx - 16, ry + 2);
    ctx.lineTo(rx - 22, ry + 8);
    ctx.lineTo(rx - 16, ry - 12);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(rx + 16, ry + 2);
    ctx.lineTo(rx + 22, ry + 8);
    ctx.lineTo(rx + 16, ry - 12);
    ctx.closePath();
    ctx.fill();

    // 2. Twin High-Speed Cooling Turbotowers
    drawCylinder(ctx, rx - 18, ry - 4, 8.5, 5.5, 24, { side: '#37474f', top: '#546e7a', edge: '#212121' });
    drawCylinder(ctx, rx + 18, ry - 1, 8.5, 5.5, 24, { side: '#37474f', top: '#546e7a', edge: '#212121' });

    // Spinning turbine fan blades inside cooling stacks
    const fanAngle = time * 9;
    for (const [cx, cy] of [[rx - 18, ry - 28], [rx + 18, ry - 25]]) {
      ctx.strokeStyle = '#212121';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(fanAngle) * 5, cy - Math.sin(fanAngle) * 3);
      ctx.lineTo(cx + Math.cos(fanAngle) * 5, cy + Math.sin(fanAngle) * 3);
      ctx.moveTo(cx - Math.cos(fanAngle + Math.PI / 2) * 5, cy - Math.sin(fanAngle + Math.PI / 2) * 3);
      ctx.lineTo(cx + Math.cos(fanAngle + Math.PI / 2) * 5, cy + Math.sin(fanAngle + Math.PI / 2) * 3);
      ctx.stroke();
    }

    // 3. Step-Down Substation & High-Voltage Busbars
    ctx.fillStyle = '#263238';
    ctx.fillRect(rx - 9, ry - 12, 18, 14);
    ctx.strokeStyle = '#102027';
    ctx.strokeRect(rx - 9, ry - 12, 18, 14);

    // Heatsink cooling fins on substation
    ctx.strokeStyle = '#455a64';
    ctx.lineWidth = 1;
    for (let x = rx - 7; x <= rx + 7; x += 3.5) {
      ctx.beginPath();
      ctx.moveTo(x, ry - 11);
      ctx.lineTo(x, ry + 1);
      ctx.stroke();
    }

    // Insulated Conduit Busbars feeding into substation
    ctx.strokeStyle = '#0288d1';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(rx - 18, ry - 14);
    ctx.lineTo(rx - 9, ry - 8);
    ctx.moveTo(rx + 18, ry - 11);
    ctx.lineTo(rx + 9, ry - 8);
    ctx.stroke();

    // High Voltage Warning Emblem
    ctx.fillStyle = '#ffb300';
    ctx.beginPath();
    ctx.moveTo(rx, ry - 9);
    ctx.lineTo(rx + 3.5, ry - 3);
    ctx.lineTo(rx - 3.5, ry - 3);
    ctx.closePath();
    ctx.fill();

    // 4. High-Voltage Tesla Plasma Discharge & Turbine Steam
    if (!this.isUnderConstruction) {
      drawElectricArc(ctx, rx - 18, ry - 28, rx + 18, ry - 25, time, '#80deea');
      drawSmokePuff(ctx, rx - 18, ry - 30, time, 1.2, 0.4);
      drawSmokePuff(ctx, rx + 18, ry - 27, time, 2.7, 0.4);
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

    // GDI Tiberium Refinery (Tiberian Sun Processing Hangar & Harvester Bay)
    // 1. Dual Pressurized Storage Silos with Active Sight Gauges
    drawCylinder(ctx, rx - 20, ry - 2, 10, 6, 26, { side: '#455a64', top: '#607d8b', edge: '#212121' });
    drawCylinder(ctx, rx - 6, ry - 8, 9, 5.5, 22, { side: '#455a64', top: '#607d8b', edge: '#212121' });

    // Vertical Glowing Liquid Level Sight Gauge on primary silo
    const gaugeFill = 0.45 + Math.sin(time * 1.5) * 0.25;
    ctx.fillStyle = '#0f1416';
    ctx.fillRect(rx - 22, ry - 22, 3, 16);
    ctx.fillStyle = '#00e676';
    ctx.fillRect(rx - 22, ry - 22 + (16 * (1 - gaugeFill)), 3, 16 * gaugeFill);

    // Industrial Transfer Pipe Bridge
    ctx.strokeStyle = '#78909c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(rx - 20, ry - 16);
    ctx.lineTo(rx - 6, ry - 14);
    ctx.lineTo(rx + 8, ry - 6);
    ctx.stroke();

    // 2. Raw Ore Intake Hopper & Active Crystal Conveyor
    ctx.fillStyle = '#263238';
    ctx.beginPath();
    ctx.moveTo(rx - 4, ry - 4);
    ctx.lineTo(rx + 14, ry - 4);
    ctx.lineTo(rx + 10, ry + 8);
    ctx.lineTo(rx - 2, ry + 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#102027';
    ctx.stroke();

    // Active Tiberium Crystals in Hopper
    drawTiberiumCrystal(ctx, rx + 2, ry, 5.5, '#00e676');
    drawTiberiumCrystal(ctx, rx + 7, ry + 3, 4.5, '#76ff03');
    drawTiberiumCrystal(ctx, rx - 1, ry + 4, 3.5, '#00e676');

    // 3. Dedicated Harvester Docking Platform & Ramp with Hazard Stripes
    const rampPt1 = { x: rx - 8, y: ry + roofH * 0.14 };
    const rampPt2 = { x: rx + roofW * 0.28, y: ry + roofH * 0.14 };
    drawHazardStripes(ctx, rampPt1, rampPt2, 4, 5, '#ffb300', '#1a1a1a');

    // Steel Dock Guide Curbs & Overhead Lamps
    ctx.fillStyle = '#ffb300';
    ctx.beginPath();
    ctx.arc(rampPt1.x, rampPt1.y - 5, 2.5, 0, Math.PI * 2);
    ctx.arc(rampPt2.x, rampPt2.y - 5, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // 4. Industrial Processing Smokestacks
    ctx.fillStyle = '#37474f';
    ctx.fillRect(rx - 2, ry - 28, 5, 18);
    ctx.fillRect(rx + 6, ry - 24, 4, 15);

    if (!this.isUnderConstruction) {
      drawSmokePuff(ctx, rx, ry - 32, time, 0.5, 0.45);
      drawSmokePuff(ctx, rx + 8, ry - 28, time, 1.4, 0.35);
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

    // GDI Barracks (Hardened Tactical Infantry Garrison)
    // 1. Reinforced Personnel Deployment Blast Door with Staging Beacon
    const doorPt1 = { x: rx - 12, y: ry + 6 };
    const doorPt2 = { x: rx + 12, y: ry + 6 };
    ctx.fillStyle = '#21292f';
    ctx.fillRect(rx - 14, ry + 1, 28, 12);
    ctx.strokeStyle = '#10171b';
    ctx.lineWidth = 1;
    ctx.strokeRect(rx - 14, ry + 1, 28, 12);
    drawHazardStripes(ctx, doorPt1, doorPt2, 3, 4, '#ffb300', '#1a1a1a');

    // Staging threshold ramp extending forward
    ctx.fillStyle = '#37474f';
    ctx.beginPath();
    ctx.moveTo(rx - 12, ry + 12);
    ctx.lineTo(rx + 12, ry + 12);
    ctx.lineTo(rx + 16, ry + 16);
    ctx.lineTo(rx - 16, ry + 16);
    ctx.closePath();
    ctx.fill();

    // Staging readiness LED beacon above blast door
    const stagingGreen = Math.sin(time * 4) > 0 ? '#00e676' : '#00b0ff';
    ctx.fillStyle = stagingGreen;
    ctx.beginPath();
    ctx.arc(rx, ry + 2, 2, 0, Math.PI * 2);
    ctx.fill();

    // 2. Command Observation Cupola on Roof
    ctx.fillStyle = '#786139';
    ctx.fillRect(rx - 14, ry - 14, 12, 10);
    ctx.strokeStyle = '#4a381d';
    ctx.strokeRect(rx - 14, ry - 14, 12, 10);

    // Ballistic glass slit with cyan interior glow
    ctx.fillStyle = 'rgba(79, 195, 247, 0.85)';
    ctx.fillRect(rx - 12, ry - 11, 8, 4);

    // 3. Roof-Mounted Satellite Uplink Dish & Whip Antenna
    drawRadarDish(ctx, rx + 10, ry - 14, 8, time * 0.8, '#0288d1');

    ctx.strokeStyle = '#37474f';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(rx - 10, ry - 14);
    ctx.lineTo(rx - 10, ry - 32);
    ctx.stroke();

    // Obstruction beacon tip
    if (Math.sin(time * 6) > 0) {
      ctx.fillStyle = '#ff1744';
      ctx.beginPath();
      ctx.arc(rx - 10, ry - 33, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Embossed GDI Eagle/Shield Emblem on front roof plate
    ctx.fillStyle = '#ffb300';
    ctx.beginPath();
    ctx.moveTo(rx, ry - 4);
    ctx.lineTo(rx + 6, ry);
    ctx.lineTo(rx + 3, ry + 4);
    ctx.lineTo(rx, ry + 2);
    ctx.lineTo(rx - 3, ry + 4);
    ctx.lineTo(rx - 6, ry);
    ctx.closePath();
    ctx.fill();

    // 5. Fortified Sandbag Revetments at Corners
    ctx.fillStyle = '#8d6e63';
    ctx.strokeStyle = '#5d4037';
    ctx.lineWidth = 0.8;
    for (const ox of [-roofW * 0.28, roofW * 0.26]) {
      ctx.beginPath();
      ctx.ellipse(rx + ox, ry + roofH * 0.1, 8, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
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

    // GDI Concrete Wall (Authentic Pre-Cast Interlocking Barrier Segments)
    const wallW = roofW * 0.72;
    // Heavy tan pre-cast concrete barrier block
    ctx.fillStyle = '#9e824c';
    ctx.fillRect(rx - wallW / 2, ry - 13, wallW, 15);
    ctx.fillStyle = '#baa16b';
    ctx.beginPath();
    ctx.moveTo(rx - wallW / 2, ry - 13);
    ctx.lineTo(rx, ry - 16);
    ctx.lineTo(rx + wallW / 2, ry - 13);
    ctx.lineTo(rx + wallW / 2 - 2, ry - 11);
    ctx.lineTo(rx, ry - 14);
    ctx.lineTo(rx - wallW / 2 + 2, ry - 11);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#4a381d';
    ctx.lineWidth = 1;
    ctx.strokeRect(rx - wallW / 2, ry - 13, wallW, 15);

    // Yellow Hazard Safety Stripe along top chamfer
    const p1 = { x: rx - wallW * 0.44, y: ry - 12 };
    const p2 = { x: rx + wallW * 0.44, y: ry - 12 };
    drawHazardStripes(ctx, p1, p2, 3, 4, '#ffb300', '#1a1a1a');

    // Steel Rebar Interlocking End Caps
    ctx.fillStyle = '#37474f';
    ctx.fillRect(rx - wallW / 2 - 2, ry - 15, 4, 18);
    ctx.fillRect(rx + wallW / 2 - 2, ry - 15, 4, 18);
    ctx.strokeStyle = '#212121';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(rx - wallW / 2 - 2, ry - 15, 4, 18);
    ctx.strokeRect(rx + wallW / 2 - 2, ry - 15, 4, 18);
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

    // GDI Reinforced Gatehouses & Sliding Steel Blast Gate
    const pylonW = 8;
    const pylonH = 26;
    const leftX = rx - roofW * 0.36;
    const rightX = rx + roofW * 0.36 - pylonW;

    // Heavy tan concrete gatehouse pylons
    ctx.fillStyle = '#9e824c';
    ctx.fillRect(leftX, ry - 22, pylonW, pylonH);
    ctx.fillRect(rightX, ry - 22, pylonW, pylonH);
    ctx.strokeStyle = '#4a381d';
    ctx.lineWidth = 1;
    ctx.strokeRect(leftX, ry - 22, pylonW, pylonH);
    ctx.strokeRect(rightX, ry - 22, pylonW, pylonH);

    // Hazard stripes on gatehouse pylon faces
    const hp1 = { x: leftX, y: ry - 18 };
    const hp2 = { x: leftX, y: ry - 4 };
    drawHazardStripes(ctx, hp1, hp2, 4, 3, '#ffb300', '#111');

    // Overhead Structural Clearance Girder
    ctx.fillStyle = '#37474f';
    ctx.fillRect(leftX, ry - 24, rightX - leftX + pylonW, 5);
    ctx.strokeStyle = '#212121';
    ctx.strokeRect(leftX, ry - 24, rightX - leftX + pylonW, 5);
    const beamP1 = { x: leftX + 2, y: ry - 21.5 };
    const beamP2 = { x: rightX + pylonW - 2, y: ry - 21.5 };
    drawHazardStripes(ctx, beamP1, beamP2, 2.5, 3, '#ffb300', '#111');

    // Amber Caution Flasher atop overhead beam
    if (Math.sin(time * 6) > 0) {
      ctx.fillStyle = '#ffab00';
      ctx.beginPath();
      ctx.arc(rx, ry - 26, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sliding Armored Steel Blast Gate Leaf
    const gateLeft = leftX + pylonW;
    const gateRight = rightX;
    const gateTop = ry - 15;
    const gateBottom = ry + 2;

    ctx.fillStyle = '#21292f';
    ctx.fillRect(gateLeft, gateTop, gateRight - gateLeft, gateBottom - gateTop);
    ctx.strokeStyle = '#0288d1';
    ctx.lineWidth = 1;
    ctx.strokeRect(gateLeft, gateTop, gateRight - gateLeft, gateBottom - gateTop);

    // Horizontal reinforcement corrugation ribs
    ctx.strokeStyle = '#455a64';
    ctx.lineWidth = 1;
    for (let y = gateTop + 3; y < gateBottom; y += 4) {
      ctx.beginPath();
      ctx.moveTo(gateLeft + 2, y);
      ctx.lineTo(gateRight - 2, y);
      ctx.stroke();
    }

    // Center magnetic lock unit & green indicator
    ctx.fillStyle = '#10171b';
    ctx.fillRect(rx - 4, ry - 8, 8, 8);
    ctx.fillStyle = '#00e676';
    ctx.fillRect(rx - 1.5, ry - 5.5, 3, 3);
  }

  drawTurretDetails(ctx, rx, ry, roofW, roofH, palette, isNod) {
    if (isNod) {
      // OBELISK OF LIGHT (Iconic Nod Heavy Laser Tower)
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

    // GDI Component Tower (Vulcan Cannon) — Authentic Tiberian Sun Defense
    // 1. Concrete Component Tower Base Pylon
    drawCylinder(ctx, rx, ry + 4, 15, 8.5, 18, { side: '#786139', top: '#baa16b', edge: '#4a381d' });

    // Sandbag revetment around base
    ctx.fillStyle = '#8d6e63';
    ctx.beginPath();
    ctx.ellipse(rx, ry + 6, 17, 9.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5d4037';
    ctx.stroke();

    // Steel collar mounting ring
    ctx.fillStyle = '#37474f';
    ctx.beginPath();
    ctx.ellipse(rx, ry - 14, 13, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#212121';
    ctx.stroke();

    // 2. Revolving 360° Vulcan Minigun Cupola
    ctx.save();
    ctx.translate(rx, ry - 15);
    ctx.scale(1, 0.55);
    ctx.rotate(this.turretAngle);

    // Twin 50mm Vulcan Cannon Barrels with Slotted Flash Hiders
    ctx.fillStyle = '#78909c';
    ctx.fillRect(2, -5.5, 25, 4);
    ctx.fillRect(2, 1.5, 25, 4);
    ctx.strokeStyle = '#102027';
    ctx.lineWidth = 1;
    ctx.strokeRect(2, -5.5, 25, 4);
    ctx.strokeRect(2, 1.5, 25, 4);

    // Barrel muzzle flash hider vents
    ctx.fillStyle = '#263238';
    ctx.fillRect(23, -6, 4, 5);
    ctx.fillRect(23, 1, 4, 5);

    // Ammo feed hopper chutes
    ctx.fillStyle = '#ffb300';
    ctx.fillRect(-6, -7, 6, 4);
    ctx.fillRect(-6, 3, 6, 4);

    // Turret Dome Cupola with GDI Blue Visor
    ctx.fillStyle = '#9e824c';
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4a381d';
    ctx.stroke();

    ctx.fillStyle = '#0288d1';
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();

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

    // GDI Sonic Emitter (Tiberian Sun Legendary Acoustic Resonator Defense)
    // 1. Concrete Component Tower Base with Power Capacitor Housing
    drawCylinder(ctx, rx, ry + 5, 15, 8.5, 22, { side: '#786139', top: '#baa16b', edge: '#4a381d' });

    // Generator housing and cooling fins at tower base
    ctx.fillStyle = '#263238';
    ctx.fillRect(rx - 9, ry + 4, 18, 9);
    ctx.strokeStyle = '#0288d1';
    ctx.lineWidth = 1;
    ctx.strokeRect(rx - 9, ry + 4, 18, 9);

    // 2. Revolving Parabolic Acoustic Reflector Dish Assembly
    const pulse = (time * 3.2) % 1;
    ctx.save();
    ctx.translate(rx, ry - 22);
    ctx.scale(1, 0.55);
    ctx.rotate(this.turretAngle || 0);

    // Heavy Parabolic Acoustic Dish Reflector (Facing Target)
    ctx.fillStyle = '#37474f';
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#baa16b';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Concentric Harmonic Resonator Rings
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
    ctx.stroke();

    // Central Acoustic Transducer Emitter Horn
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Expanding Cyan Sonic Ring Waves Emitter Shockwave
    ctx.strokeStyle = `rgba(0, 229, 255, ${0.85 * (1 - pulse)})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 12 + pulse * 18, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  drawExplosiveTowerDetails(ctx, rx, ry, roofW, roofH, palette, time, isNod) {
    if (isNod) {
      // NOD SAM SITE (Anti-Air & Ground Missile Turret Pod)
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

    // GDI Component Tower (RPG Launcher Pod) — Authentic Tiberian Sun
    // 1. Concrete Component Tower Pylon
    drawCylinder(ctx, rx, ry + 3, 15, 8.5, 18, { side: '#786139', top: '#baa16b', edge: '#4a381d' });

    // Sandbag fortified base ring
    ctx.fillStyle = '#8d6e63';
    ctx.beginPath();
    ctx.ellipse(rx, ry + 5, 16, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5d4037';
    ctx.stroke();

    // 2. Revolving Armored Rocket-Propelled Grenade Launcher Box
    ctx.save();
    ctx.translate(rx, ry - 14);
    ctx.scale(1, 0.55);
    ctx.rotate(this.turretAngle);

    // Armored Launcher Box Hull
    ctx.fillStyle = '#9e824c';
    ctx.fillRect(-10, -9, 24, 18);
    ctx.strokeStyle = '#4a381d';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-10, -9, 24, 18);

    // Rear exhaust blast deflector
    ctx.fillStyle = '#263238';
    ctx.fillRect(-14, -7, 4, 14);

    // Front honeycomb launch tube cells (6 loaded rocket tubes)
    ctx.fillStyle = '#10171b';
    ctx.fillRect(14, -8, 4, 16);
    ctx.fillStyle = '#ffb300';
    for (let ty = -6; ty <= 6; ty += 4.5) {
      ctx.beginPath();
      ctx.arc(16, ty, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Top targeting sensor optic
    ctx.fillStyle = '#0288d1';
    ctx.fillRect(-2, -12, 6, 3);

    ctx.restore();
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
