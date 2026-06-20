import { Entity } from './entities.js';
import { getFactionPalette, drawSoftShadow, getElevationLift } from './render.js';
import { UNIT_DEFS } from './tech.js';

export class Unit extends Entity {
  constructor(id, faction, type, x, y, speed, maxHealth, damage = 0, attackRange = 0) {
    const def = UNIT_DEFS[type];
    speed = speed ?? def?.speed ?? 100;
    maxHealth = maxHealth ?? def?.maxHealth ?? 50;
    damage = damage || def?.damage || 0;
    attackRange = attackRange || def?.attackRange || 0;

    super(id, faction, maxHealth, maxHealth);
    this.type = type;
    this.x = x; // World X (isometric space)
    this.y = y; // World Y (isometric space)
    this.speed = speed;
    this.radius = this.getRadiusForType(type);
    this.isFlying = Boolean(def?.flying);
    this.projectileType = def?.projectile || null;
    
    this.path = [];
    this.pathIndex = 0;
    this.state = 'idle';
    
    // Combat
    this.damage = damage;
    this.attackRange = attackRange;
    this.attackCooldown = this.getCooldownForType(type);
    this.lastAttackTime = 0;
    this.combatTarget = null;
    
    this.angle = 0;
    this.turretAngle = 0;
  }

  getRadiusForType(type) {
    if (type === 'tank' || type === 'harvester') return 14;
    if (type === 'buggy' || type === 'plane') return 12;
    if (type === 'nuke_rocket' || type === 'bio_rocket') return 13;
    if (type === 'motorcycle') return 8;
    return 7;
  }

  getCooldownForType(type) {
    if (type === 'tank') return 1.5;
    if (type === 'plane') return 0.9;
    if (type === 'nuke_rocket') return 3.2;
    if (type === 'bio_rocket') return 2.6;
    if (type === 'buggy') return 0.75;
    return 0.6;
  }

  update(dt, game) {
    if (this.isDead) return;

    // Tiberium toxicity for infantry
    if ((this.type === 'soldier' || this.type === 'rocket') && Math.random() < 0.005) {
      const tile = game.grid.getTileAtWorld(this.x, this.y);
      if (tile && tile.type === 'ore') {
        this.takeDamage(1);
      }
    }

    switch (this.state) {
      case 'idle':
        this.updateIdle(game);
        break;
      case 'moving':
        this.updateMovement(dt, game);
        break;
      case 'attacking':
        this.updateAttacking(dt, game);
        break;
    }
  }

  updateIdle(game) {
    if (this.type !== 'harvester' && this.damage > 0) {
      const enemies = this.faction === 'player' ? game.enemyEntities : game.playerEntities;
      let closestEnemy = null;
      let minDist = this.attackRange * 1.5;

      for (const enemy of enemies) {
        if (enemy.isDead) continue;
        const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
        if (dist < minDist) {
          minDist = dist;
          closestEnemy = enemy;
        }
      }

      if (closestEnemy) {
        this.combatTarget = closestEnemy;
        this.state = 'attacking';
      }
    }
  }

  updateMovement(dt, game) {
    if (this.path.length === 0 || this.pathIndex >= this.path.length) {
      this.state = 'idle';
      this.path = [];
      return;
    }

    const currentTargetTile = this.path[this.pathIndex];
    // Retrieve isometric coordinates of the destination tile
    const coords = game.grid.getTileCoords(currentTargetTile.x, currentTargetTile.y);
    const targetWorldX = coords.x;
    const targetWorldY = coords.y;

    const dx = targetWorldX - this.x;
    const dy = targetWorldY - this.y;
    const dist = Math.hypot(dx, dy);

    this.angle = Math.atan2(dy, dx);
    this.turretAngle = this.angle;

    const moveStep = this.speed * dt;
    if (dist <= moveStep) {
      this.x = targetWorldX;
      this.y = targetWorldY;
      this.pathIndex++;
      
      if (this.pathIndex >= this.path.length) {
        this.state = 'idle';
        this.path = [];
      }
    } else {
      this.x += (dx / dist) * moveStep;
      this.y += (dy / dist) * moveStep;
    }
  }

  updateAttacking(dt, game) {
    if (!this.combatTarget || this.combatTarget.isDead) {
      this.state = 'idle';
      this.combatTarget = null;
      return;
    }

    const dx = this.combatTarget.x - this.x;
    const dy = this.combatTarget.y - this.y;
    const dist = Math.hypot(dx, dy);

    this.angle = Math.atan2(dy, dx);
    this.turretAngle = this.angle;

    if (dist <= this.attackRange) {
      this.path = [];
      const now = game.currentTime;
      if (now - this.lastAttackTime >= this.attackCooldown) {
        this.shoot(game);
        this.lastAttackTime = now;
      }
    } else {
      if (Math.random() < 0.05) {
        const startTile = game.grid.getTileAtWorld(this.x, this.y);
        const endTile = game.grid.getTileAtWorld(this.combatTarget.x, this.combatTarget.y);
        const newPath = game.grid.findPath(startTile, endTile, this);
        if (newPath) {
          this.path = newPath;
          this.pathIndex = 0;
          this.state = 'moving';
        }
      }
    }
  }

  shoot(game) {
    let projectileType = this.projectileType;
    if (!projectileType) {
      if (this.type === 'rocket') projectileType = 'rocket';
      else if (this.type === 'tank') projectileType = 'shell';
      else if (this.type === 'plane') projectileType = 'rocket';
      else projectileType = 'bullet';
    }

    const projectileSpeed = {
      bullet: 420,
      shell: 280,
      rocket: 210,
      nuke: 170,
      bio: 190,
    }[projectileType] || 360;

    game.projectiles.push(new Projectile(
      this.x, 
      this.y, 
      this.combatTarget, 
      projectileSpeed, 
      this.damage,
      projectileType,
      this.faction
    ));
  }

  draw(ctx, camera, game = null) {
    const lift = getElevationLift(game, this.x, this.y);
    const screenX = this.x - camera.x;
    const screenY = this.y - camera.y - lift;
    const palette = getFactionPalette(this.faction);
    const time = game?.currentTime ?? Date.now() / 1000;
    const bob = this.state === 'moving' ? Math.sin(time * 14) * 1.5 : 0;

    drawSoftShadow(ctx, screenX, screenY + lift * 0.3, this.radius, this.radius * 0.5);

    if (this.type === 'soldier' || this.type === 'rocket') {
      this.drawInfantry(ctx, screenX, screenY - bob, palette, this.type === 'rocket', time);
    } else if (this.type === 'motorcycle') {
      this.drawMotorcycle(ctx, screenX, screenY - bob, palette, time);
    } else if (this.type === 'buggy') {
      this.drawBuggy(ctx, screenX, screenY - bob, palette, time);
    } else if (this.type === 'tank') {
      this.drawTank(ctx, screenX, screenY - bob, palette, time);
    } else if (this.type === 'plane') {
      this.drawPlane(ctx, screenX, screenY - 24 - bob, palette, time);
    } else if (this.type === 'nuke_rocket' || this.type === 'bio_rocket') {
      this.drawStrategicRocket(ctx, screenX, screenY - bob, palette, time);
    }

    this.drawSelectionAndHP(ctx, camera, screenX, screenY, this.radius * 1.8, this.radius * 1.2, game);
  }

  drawInfantry(ctx, sx, sy, palette, isRocket, time) {
    const facing = this.angle;
    const flip = Math.cos(facing) < 0 ? -1 : 1;

    // Legs
    ctx.fillStyle = '#37474f';
    ctx.fillRect(sx - 3 * flip, sy + 1, 3, 6);
    ctx.fillRect(sx, sy + 1, 3, 6);
    ctx.strokeStyle = '#263238';
    ctx.strokeRect(sx - 3 * flip, sy + 1, 3, 6);
    ctx.strokeRect(sx, sy + 1, 3, 6);

    // Torso armor
    const chestColor = isRocket ? '#e65100' : '#455a64';
    ctx.fillStyle = chestColor;
    ctx.fillRect(sx - 5, sy - 4, 10, 10);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx - 5, sy - 4, 10, 10);

    // Faction shoulder pad
    ctx.fillStyle = palette.primary;
    ctx.fillRect(sx + (flip > 0 ? 3 : -7), sy - 5, 4, 5);
    ctx.strokeRect(sx + (flip > 0 ? 3 : -7), sy - 5, 4, 5);

    // Helmet
    ctx.fillStyle = palette.secondary;
    ctx.beginPath();
    ctx.arc(sx, sy - 9, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.stroke();

    // Visor
    ctx.fillStyle = palette.accent;
    ctx.fillRect(sx - 3, sy - 10, 6, 2);

    if (isRocket) {
      // Rocket launcher tube
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(facing);
      ctx.fillStyle = '#546e7a';
      ctx.fillRect(flip * 2, -3, 16 * flip, 6);
      ctx.strokeStyle = '#000';
      ctx.strokeRect(flip * 2, -3, 16 * flip, 6);
      ctx.fillStyle = '#ff6f00';
      ctx.fillRect(flip * 16, -2, 4 * flip, 4);
      // Backpack
      ctx.fillStyle = '#37474f';
      ctx.fillRect(-6 * flip, -2, 5, 8);
      ctx.strokeRect(-6 * flip, -2, 5, 8);
      ctx.restore();
    } else {
      // Rifle
      ctx.strokeStyle = '#263238';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(facing) * 12, sy + Math.sin(facing) * 6);
      ctx.stroke();
      ctx.fillStyle = '#78909c';
      ctx.beginPath();
      ctx.arc(sx + Math.cos(facing) * 12, sy + Math.sin(facing) * 6, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Idle breathing
    if (this.state === 'idle' && Math.sin(time * 2) > 0.95) {
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(sx - 1, sy - 12, 2, 1);
    }
  }

  darkenColor(hex, amount = 0.35) {
    if (!hex || hex[0] !== '#') return hex;
    const value = hex.slice(1);
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    const scale = 1 - amount;
    return `rgb(${Math.floor(r * scale)}, ${Math.floor(g * scale)}, ${Math.floor(b * scale)})`;
  }

  drawRaisedVehicleBody(ctx, points, topColor, sideColor, edgeColor = '#000', depth = 5) {
    const lower = points.map(pt => ({ x: pt.x, y: pt.y + depth }));

    ctx.fillStyle = sideColor;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    for (let i = lower.length - 1; i >= 0; i--) {
      ctx.lineTo(lower[i].x, lower[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = edgeColor;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = topColor;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  drawTank(ctx, sx, sy, palette, time) {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1, 0.5);
    ctx.rotate(this.angle);

    // Track wheels
    ctx.fillStyle = '#1a1d1f';
    for (let i = -10; i <= 8; i += 4) {
      ctx.beginPath();
      ctx.arc(i, -8, 2.5, 0, Math.PI * 2);
      ctx.arc(i, 8, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Tracks
    ctx.fillStyle = '#263238';
    ctx.fillRect(-14, -10, 28, 5);
    ctx.fillRect(-14, 5, 28, 5);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(-14, -10, 28, 5);
    ctx.strokeRect(-14, 5, 28, 5);

    // Hull with a shaded side wall so armor reads as raised mass.
    this.drawRaisedVehicleBody(ctx, [
      { x: -13, y: -8 },
      { x: 10, y: -8 },
      { x: 14, y: -3 },
      { x: 14, y: 3 },
      { x: 10, y: 8 },
      { x: -13, y: 8 },
    ], palette.secondary, this.darkenColor(palette.dark, 0.15), '#000', 5);

    // Hull detail stripe
    ctx.strokeStyle = palette.trim;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(8, 0);
    ctx.stroke();

    ctx.restore();

    // Turret (raised above hull)
    const turretY = sy - 8;
    ctx.save();
    ctx.translate(sx, turretY);
    ctx.scale(1, 0.5);
    ctx.rotate(this.turretAngle);

    // Barrel
    const barrelGrad = ctx.createLinearGradient(0, -2, 18, 2);
    barrelGrad.addColorStop(0, '#90a4ae');
    barrelGrad.addColorStop(1, '#546e7a');
    ctx.fillStyle = barrelGrad;
    ctx.fillRect(0, -2.5, 18, 5);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(0, -2.5, 18, 5);
    ctx.fillStyle = '#37474f';
    ctx.fillRect(16, -3, 3, 6);

    // Turret body
    ctx.fillStyle = palette.primary;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.stroke();

    // Commander cupola
    ctx.fillStyle = palette.dark;
    ctx.beginPath();
    ctx.arc(-2, -1, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    // Exhaust puff when moving
    if (this.state === 'moving' && Math.sin(time * 20) > 0.6) {
      ctx.fillStyle = 'rgba(120, 120, 120, 0.25)';
      ctx.beginPath();
      ctx.arc(sx - Math.cos(this.angle) * 14, sy - Math.sin(this.angle) * 7 - 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawMotorcycle(ctx, sx, sy, palette, time) {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1, 0.55);
    ctx.rotate(this.angle);

    ctx.strokeStyle = '#101416';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(-8, 0, 4, 0, Math.PI * 2);
    ctx.arc(8, 0, 4, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = this.darkenColor(palette.dark, 0.1);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(0, -5);
    ctx.lineTo(8, 0);
    ctx.moveTo(0, -5);
    ctx.lineTo(3, -10);
    ctx.stroke();

    this.drawRaisedVehicleBody(ctx, [
      { x: -4, y: -8 },
      { x: 5, y: -9 },
      { x: 8, y: -5 },
      { x: 0, y: -3 },
      { x: -6, y: -5 },
    ], palette.primary, this.darkenColor(palette.secondary, 0.3), '#000', 3);

    ctx.fillStyle = '#263238';
    ctx.fillRect(-2, -14, 7, 5);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(-2, -14, 7, 5);
    ctx.fillStyle = '#fff59d';
    ctx.fillRect(8, -2, 3, 4);
    ctx.restore();

    if (this.state === 'moving' && Math.sin(time * 24) > 0.5) {
      ctx.fillStyle = 'rgba(160, 160, 160, 0.25)';
      ctx.beginPath();
      ctx.arc(sx - Math.cos(this.angle) * 12, sy - Math.sin(this.angle) * 6, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawBuggy(ctx, sx, sy, palette, time) {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1, 0.55);
    ctx.rotate(this.angle);

    ctx.fillStyle = '#111619';
    for (const x of [-10, 10]) {
      for (const y of [-7, 7]) {
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    this.drawRaisedVehicleBody(ctx, [
      { x: -13, y: -8 },
      { x: 9, y: -8 },
      { x: 14, y: -3 },
      { x: 13, y: 6 },
      { x: -10, y: 8 },
      { x: -14, y: 3 },
    ], palette.secondary, this.darkenColor(palette.dark, 0.05), '#000', 5);

    this.drawRaisedVehicleBody(ctx, [
      { x: -4, y: -7 },
      { x: 5, y: -7 },
      { x: 7, y: 4 },
      { x: -4, y: 5 },
    ], '#263238', '#111619', '#000', 4);
    ctx.fillStyle = palette.accent;
    ctx.fillRect(3, -5, 5, 7);

    ctx.strokeStyle = '#90a4ae';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(16, 0);
    ctx.stroke();
    ctx.restore();
  }

  drawPlane(ctx, sx, sy, palette, time) {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1, 0.65);
    ctx.rotate(this.angle);

    ctx.fillStyle = this.darkenColor(palette.dark, 0.05);
    ctx.beginPath();
    ctx.moveTo(16, 4);
    ctx.lineTo(-14, 8);
    ctx.lineTo(-18, 3);
    ctx.lineTo(-12, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = palette.secondary;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-14, -5);
    ctx.lineTo(-18, 0);
    ctx.lineTo(-14, 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.stroke();

    ctx.fillStyle = palette.primary;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-8, -18);
    ctx.lineTo(4, -4);
    ctx.lineTo(4, 4);
    ctx.lineTo(-8, 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(128, 222, 234, 0.75)';
    ctx.fillRect(6, -3, 7, 6);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(13, -1);
    ctx.lineTo(-10, -3);
    ctx.stroke();

    ctx.fillStyle = `rgba(255, 245, 157, ${0.45 + Math.sin(time * 20) * 0.2})`;
    ctx.beginPath();
    ctx.arc(-19, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawStrategicRocket(ctx, sx, sy, palette, time) {
    const isBio = this.type === 'bio_rocket';
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1, 0.55);
    ctx.rotate(this.angle);

    this.drawRaisedVehicleBody(ctx, [
      { x: -17, y: -10 },
      { x: 10, y: -10 },
      { x: 15, y: -4 },
      { x: 15, y: 7 },
      { x: -14, y: 9 },
      { x: -18, y: 3 },
    ], '#263238', '#111619', '#000', 6);

    this.drawRaisedVehicleBody(ctx, [
      { x: -14, y: -7 },
      { x: -2, y: -7 },
      { x: -1, y: 6 },
      { x: -14, y: 6 },
    ], palette.secondary, this.darkenColor(palette.dark, 0.1), '#000', 4);
    ctx.fillStyle = isBio ? '#66bb6a' : '#ff7043';
    ctx.fillRect(-2, -3, 18, 6);
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(22, -5);
    ctx.lineTo(22, 5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#111619';
    for (let i = -10; i <= 8; i += 6) {
      ctx.beginPath();
      ctx.arc(i, -10, 2.5, 0, Math.PI * 2);
      ctx.arc(i, 10, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    const glow = isBio ? 'rgba(102, 187, 106, 0.25)' : 'rgba(255, 112, 67, 0.25)';
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sx + Math.sin(time * 4) * 2, sy - 10, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

export class Harvester extends Unit {
  constructor(id, faction, x, y) {
    super(id, faction, 'harvester', x, y, 70, 300);
    this.cargo = 0;
    this.maxCargo = 500;
    this.miningRate = 75;
    this.depositRate = 200;
    
    this.miningTargetTile = null;
    this.depositTargetRefinery = null;
  }

  update(dt, game) {
    if (this.isDead) return;

    switch (this.state) {
      case 'idle':
        this.updateIdleHarvester(game);
        break;
      case 'moving':
        this.updateMovement(dt, game);
        break;
      case 'mining':
        this.updateMining(dt, game);
        break;
      case 'unloading':
        this.updateUnloading(dt, game);
        break;
    }
  }

  updateIdleHarvester(game) {
    if (this.cargo >= this.maxCargo) {
      this.findRefineryAndGo(game);
      return;
    }

    if (this.cargo < this.maxCargo) {
      const nearestOre = this.findNearestOre(game);
      if (nearestOre) {
        this.goToOre(nearestOre, game);
      }
    }
  }

  findNearestOre(game) {
    let nearest = null;
    let minDist = Infinity;
    const startTile = game.grid.getTileAtWorld(this.x, this.y);
    if (!startTile) return null;

    for (let x = 0; x < game.grid.width; x++) {
      for (let y = 0; y < game.grid.height; y++) {
        const tile = game.grid.tiles[x][y];
        if (tile.type === 'ore' && tile.resourceAmount > 0 && !tile.occupiedBy) {
          const dist = Math.hypot(tile.x - startTile.x, tile.y - startTile.y);
          if (dist < minDist) {
            minDist = dist;
            nearest = tile;
          }
        }
      }
    }
    return nearest;
  }

  goToOre(tile, game) {
    const startTile = game.grid.getTileAtWorld(this.x, this.y);
    const path = game.grid.findPath(startTile, tile, this);
    if (path) {
      this.path = path;
      this.pathIndex = 0;
      this.state = 'moving';
      this.miningTargetTile = tile;
    }
  }

  updateMining(dt, game) {
    if (!this.miningTargetTile || this.miningTargetTile.type !== 'ore' || this.miningTargetTile.resourceAmount <= 0) {
      this.miningTargetTile = null;
      this.state = 'idle';
      return;
    }

    const amountToMine = Math.min(this.miningRate * dt, this.maxCargo - this.cargo);
    const actualMined = Math.min(amountToMine, this.miningTargetTile.resourceAmount);

    this.cargo += actualMined;
    this.miningTargetTile.resourceAmount -= actualMined;

    if (this.miningTargetTile.resourceAmount <= 0) {
      this.miningTargetTile.type = 'grass';
      this.miningTargetTile = null;
      this.state = 'idle';
      return;
    }

    const coords = game.grid.getTileCoords(this.miningTargetTile.x, this.miningTargetTile.y);
    const dx = coords.x - this.x;
    const dy = coords.y - this.y;
    this.angle = Math.atan2(dy, dx);

    if (this.cargo >= this.maxCargo) {
      this.findRefineryAndGo(game);
    }
  }

  findRefineryAndGo(game) {
    const buildings = this.faction === 'player' ? game.playerEntities : game.enemyEntities;
    const refineries = buildings.filter(b => b.isBuilding && b.type === 'refinery' && !b.isUnderConstruction);

    if (refineries.length === 0) {
      this.state = 'idle';
      this.path = [];
      return;
    }

    let nearest = null;
    let minDist = Infinity;
    for (const ref of refineries) {
      const dist = Math.hypot(ref.x - this.x, ref.y - this.y);
      if (dist < minDist) {
        minDist = dist;
        nearest = ref;
      }
    }

    const startTile = game.grid.getTileAtWorld(this.x, this.y);
    const endTile = game.grid.getTileAtWorld(nearest.x, nearest.y);
    const path = game.grid.findPath(startTile, endTile, this);

    if (path) {
      this.path = path;
      this.pathIndex = 0;
      this.state = 'moving';
      this.depositTargetRefinery = nearest;
    } else {
      this.state = 'idle';
    }
  }

  updateUnloading(dt, game) {
    if (!this.depositTargetRefinery || this.depositTargetRefinery.isDead) {
      this.depositTargetRefinery = null;
      this.state = 'idle';
      return;
    }

    const amountToUnload = Math.min(this.depositRate * dt, this.cargo);
    this.cargo -= amountToUnload;

    if (this.faction === 'player') {
      game.playerCredits += amountToUnload;
    } else {
      game.enemyCredits += amountToUnload;
    }

    const dx = this.depositTargetRefinery.x - this.x;
    const dy = this.depositTargetRefinery.y - this.y;
    this.angle = Math.atan2(dy, dx);

    if (this.cargo <= 0) {
      this.cargo = 0;
      this.state = 'idle';
    }
  }

  updateMovement(dt, game) {
    if (this.path.length === 0 || this.pathIndex >= this.path.length) {
      this.state = 'idle';
      this.path = [];
      return;
    }

    const currentTargetTile = this.path[this.pathIndex];
    const coords = game.grid.getTileCoords(currentTargetTile.x, currentTargetTile.y);
    const targetWorldX = coords.x;
    const targetWorldY = coords.y;

    const dx = targetWorldX - this.x;
    const dy = targetWorldY - this.y;
    const dist = Math.hypot(dx, dy);

    this.angle = Math.atan2(dy, dx);

    // Adjacent checks in isometric space
    if (this.miningTargetTile && this.pathIndex === this.path.length - 1) {
      const tileCoords = game.grid.getTileCoords(this.miningTargetTile.x, this.miningTargetTile.y);
      const tileDist = Math.hypot(tileCoords.x - this.x, tileCoords.y - this.y);
      if (tileDist <= game.grid.tileSize * 2.0) {
        this.state = 'mining';
        this.path = [];
        return;
      }
    }

    if (this.depositTargetRefinery && this.pathIndex === this.path.length - 1) {
      const bDist = Math.hypot(this.depositTargetRefinery.x - this.x, this.depositTargetRefinery.y - this.y);
      if (bDist <= game.grid.tileSize * 2.8) {
        this.state = 'unloading';
        this.path = [];
        return;
      }
    }

    const moveStep = this.speed * dt;
    if (dist <= moveStep) {
      this.x = targetWorldX;
      this.y = targetWorldY;
      this.pathIndex++;
    } else {
      this.x += (dx / dist) * moveStep;
      this.y += (dy / dist) * moveStep;
    }
  }

  draw(ctx, camera, game = null) {
    const lift = getElevationLift(game, this.x, this.y);
    const screenX = this.x - camera.x;
    const screenY = this.y - camera.y - lift;
    const palette = getFactionPalette(this.faction);
    const time = game?.currentTime ?? Date.now() / 1000;
    const bob = this.state === 'moving' ? Math.sin(time * 10) * 1.2 : 0;
    const cargoRatio = this.cargo / this.maxCargo;

    drawSoftShadow(ctx, screenX, screenY + lift * 0.3, this.radius + 2, (this.radius + 2) * 0.5);

    ctx.save();
    ctx.translate(screenX, screenY - bob);
    ctx.scale(1, 0.5);
    ctx.rotate(this.angle);

    // Heavy tracks
    ctx.fillStyle = '#1a1d1f';
    ctx.fillRect(-18, -12, 36, 5);
    ctx.fillRect(-18, 7, 36, 5);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(-18, -12, 36, 5);
    ctx.strokeRect(-18, 7, 36, 5);

    for (let i = -14; i <= 12; i += 4) {
      ctx.fillStyle = '#37474f';
      ctx.beginPath();
      ctx.arc(i, -9.5, 2, 0, Math.PI * 2);
      ctx.arc(i, 9.5, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Main chassis
    const bodyColor = this.faction === 'player' ? '#f9a825' : palette.primary;
    this.drawRaisedVehicleBody(ctx, [
      { x: -16, y: -10 },
      { x: 13, y: -10 },
      { x: 17, y: -4 },
      { x: 15, y: 8 },
      { x: -13, y: 10 },
      { x: -17, y: 4 },
    ], bodyColor, this.darkenColor(bodyColor, 0.35), '#000', 6);

    // Ore hopper on back
    this.drawRaisedVehicleBody(ctx, [
      { x: -14, y: -7 },
      { x: -2, y: -7 },
      { x: -1, y: 6 },
      { x: -14, y: 6 },
    ], '#546e7a', '#263238', '#000', 4);
    ctx.fillStyle = `rgba(0, 230, 118, ${0.15 + cargoRatio * 0.55})`;
    ctx.fillRect(-13, -5 + (1 - cargoRatio) * 10, 10, 10 * cargoRatio);

    // Cab
    this.drawRaisedVehicleBody(ctx, [
      { x: 1, y: -7 },
      { x: 14, y: -6 },
      { x: 14, y: 6 },
      { x: 3, y: 7 },
    ], '#455a64', '#263238', '#000', 5);

    // Windshield
    ctx.fillStyle = 'rgba(79, 195, 247, 0.65)';
    ctx.fillRect(8, -4, 5, 8);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(8, -4, 5, 8);

    // Headlights
    ctx.fillStyle = '#fff59d';
    ctx.beginPath();
    ctx.arc(14, -2, 2, 0, Math.PI * 2);
    ctx.arc(14, 2, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Harvester drill arm (screen space, upright)
    const drillSpin = time * (this.state === 'mining' ? 18 : 4);
    ctx.save();
    ctx.translate(screenX + Math.cos(this.angle) * 14, screenY - 6 - bob + Math.sin(this.angle) * 7);
    ctx.rotate(drillSpin);

    ctx.fillStyle = '#78909c';
    ctx.fillRect(-2, -10, 4, 12);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(-2, -10, 4, 12);

    ctx.strokeStyle = '#cfd8dc';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(Math.cos(i * Math.PI / 2) * 6, -10 + Math.sin(i * Math.PI / 2) * 6);
      ctx.stroke();
    }

    if (this.state === 'mining') {
      ctx.fillStyle = 'rgba(0, 230, 118, 0.4)';
      ctx.beginPath();
      ctx.arc(0, 4, 5 + Math.sin(time * 12) * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    this.drawSelectionAndHP(ctx, camera, screenX, screenY, this.radius * 2, this.radius * 1.3, game);

    if (this.selected) {
      ctx.fillStyle = '#00e676';
      ctx.font = '9px Share Tech Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`ORE: ${Math.floor(this.cargo)}/${this.maxCargo}`, screenX, screenY + 18);
    }
  }
}

export class Projectile {
  constructor(startX, startY, targetEntity, speed, damage, type, faction) {
    this.x = startX;
    this.y = startY;
    this.target = targetEntity;
    this.speed = speed;
    this.damage = damage;
    this.type = type;
    this.faction = faction;
    this.isDead = false;
  }

  update(dt, game) {
    if (this.target.isDead) {
      this.isDead = true;
      return;
    }

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);

    const step = this.speed * dt;
    if (dist <= step) {
      if (['explosive', 'nuke', 'bio'].includes(this.type)) {
        this.applySplashDamage(game);
      } else {
        this.target.takeDamage(this.damage);
      }
      this.isDead = true;
      const radius = {
        bullet: 5,
        shell: 10,
        rocket: 12,
        laser: 8,
        explosive: 18,
        nuke: 34,
        bio: 26,
      }[this.type] || 8;
      game.particles.push(new ExplosionParticle(this.target.x, this.target.y, radius, this.type));
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
  }

  applySplashDamage(game) {
    const radius = {
      explosive: 95,
      nuke: 170,
      bio: 135,
    }[this.type] || 60;
    const entities = this.faction === 'player' ? game.enemyEntities : game.playerEntities;

    entities.forEach(ent => {
      if (ent.isDead) return;
      const dist = Math.hypot(ent.x - this.target.x, ent.y - this.target.y);
      if (dist > radius) return;

      const falloff = 1 - dist / radius;
      const minimumRatio = this.type === 'bio' ? 0.35 : 0.25;
      ent.takeDamage(this.damage * Math.max(minimumRatio, falloff));
    });
  }

  draw(ctx, camera, game = null) {
    const lift = getElevationLift(game, this.x, this.y);
    const screenX = this.x - camera.x;
    const screenY = this.y - camera.y - lift;
    const time = game?.currentTime ?? Date.now() / 1000;

    if (this.type === 'bullet') {
      ctx.shadowColor = '#ffeb3b';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#fff176';
      ctx.beginPath();
      ctx.arc(screenX, screenY, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ff8f00';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(screenX - Math.cos(time * 20) * 5, screenY);
      ctx.lineTo(screenX, screenY);
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else if (this.type === 'laser') {
      const angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.rotate(angle);
      ctx.shadowColor = '#00e5ff';
      ctx.shadowBlur = 10;
      ctx.strokeStyle = '#80deea';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(12, 0);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
    } else if (this.type === 'shell' || this.type === 'explosive' || this.type === 'rocket' || this.type === 'nuke' || this.type === 'bio') {
      const angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.rotate(angle);

      const isBio = this.type === 'bio';
      const isNuke = this.type === 'nuke';
      const isExplosive = this.type === 'explosive';
      ctx.shadowColor = isBio ? '#69f0ae' : isNuke ? '#ff7043' : '#ff6f00';
      ctx.shadowBlur = isNuke || isBio ? 14 : 8;
      ctx.fillStyle = isBio ? '#66bb6a' : isNuke ? '#ff7043' : isExplosive ? '#ffab00' : '#ff8f00';
      ctx.fillRect(-6, -2.5, isNuke || isBio ? 16 : 10, 5);
      ctx.fillStyle = isBio ? '#1b5e20' : '#ff3d00';
      ctx.beginPath();
      ctx.moveTo(isNuke || isBio ? 10 : 4, 0);
      ctx.lineTo(isNuke || isBio ? 17 : 10, -3);
      ctx.lineTo(isNuke || isBio ? 17 : 10, 3);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = isBio
        ? `rgba(105, 240, 174, ${0.45 + Math.sin(time * 30) * 0.2})`
        : `rgba(255, 200, 50, ${0.45 + Math.sin(time * 30) * 0.2})`;
      ctx.beginPath();
      ctx.arc(-8, 0, 3 + Math.sin(time * 30) * 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }
}

class ExplosionParticle {
  constructor(x, y, radius, type = 'default') {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.type = type;
    this.maxLife = 0.25;
    this.life = type === 'nuke' || type === 'bio' ? 0.55 : 0.25;
    this.maxLife = this.life;
    this.isDead = false;
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) {
      this.isDead = true;
    }
  }

  draw(ctx, camera) {
    const screenX = this.x - camera.x;
    const screenY = this.y - camera.y;
    const ratio = this.life / this.maxLife;

    ctx.save();
    const isBio = this.type === 'bio';
    const isNuke = this.type === 'nuke';
    ctx.shadowColor = isBio ? '#69f0ae' : isNuke ? '#ff3300' : '#ff6f00';
    ctx.shadowBlur = (isBio || isNuke) ? 18 * ratio : 0;
    ctx.beginPath();
    ctx.ellipse(screenX, screenY, this.radius * (1.5 - ratio), this.radius * 0.75 * (1.5 - ratio), 0, 0, Math.PI * 2);
    ctx.fillStyle = isBio
      ? `rgba(80, ${Math.floor(180 + 60 * ratio)}, 120, ${ratio * 0.85})`
      : `rgba(255, ${Math.floor(100 + 155 * ratio)}, 0, ${ratio})`;
    ctx.fill();

    if (isNuke || isBio) {
      ctx.strokeStyle = isBio ? `rgba(105, 240, 174, ${ratio})` : `rgba(255, 245, 157, ${ratio})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(screenX, screenY, this.radius * (2.0 - ratio), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
