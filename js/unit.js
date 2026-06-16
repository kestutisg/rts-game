import { Entity } from './entities.js';
import { getFactionPalette, drawSoftShadow, getElevationLift } from './render.js';

export class Unit extends Entity {
  constructor(id, faction, type, x, y, speed, maxHealth, damage = 0, attackRange = 0) {
    super(id, faction, maxHealth, maxHealth);
    this.type = type; // 'soldier', 'rocket', 'tank', 'harvester'
    this.x = x; // World X (isometric space)
    this.y = y; // World Y (isometric space)
    this.speed = speed;
    this.radius = type === 'tank' || type === 'harvester' ? 14 : 7;
    
    this.path = [];
    this.pathIndex = 0;
    this.state = 'idle';
    
    // Combat
    this.damage = damage;
    this.attackRange = attackRange;
    this.attackCooldown = type === 'tank' ? 1.5 : 0.6;
    this.lastAttackTime = 0;
    this.combatTarget = null;
    
    this.angle = 0;
    this.turretAngle = 0;
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
    game.projectiles.push(new Projectile(
      this.x, 
      this.y, 
      this.combatTarget, 
      this.type === 'rocket' ? 180 : 400, 
      this.damage,
      this.type === 'rocket' ? 'rocket' : 'bullet',
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
    } else if (this.type === 'tank') {
      this.drawTank(ctx, screenX, screenY - bob, palette, time);
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

    // Hull with sloped front
    ctx.fillStyle = palette.secondary;
    ctx.beginPath();
    ctx.moveTo(-12, -7);
    ctx.lineTo(10, -7);
    ctx.lineTo(12, -3);
    ctx.lineTo(12, 3);
    ctx.lineTo(10, 7);
    ctx.lineTo(-12, 7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();

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
    ctx.fillStyle = bodyColor;
    ctx.fillRect(-15, -9, 30, 18);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(-15, -9, 30, 18);

    // Ore hopper on back
    ctx.fillStyle = '#546e7a';
    ctx.fillRect(-14, -6, 12, 12);
    ctx.strokeRect(-14, -6, 12, 12);
    ctx.fillStyle = `rgba(0, 230, 118, ${0.15 + cargoRatio * 0.55})`;
    ctx.fillRect(-13, -5 + (1 - cargoRatio) * 10, 10, 10 * cargoRatio);

    // Cab
    ctx.fillStyle = '#455a64';
    ctx.fillRect(2, -6, 12, 12);
    ctx.strokeRect(2, -6, 12, 12);

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
      this.target.takeDamage(this.damage);
      this.isDead = true;
      game.particles.push(new ExplosionParticle(this.target.x, this.target.y, this.type === 'rocket' ? 12 : 5));
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
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
    } else if (this.type === 'rocket') {
      const angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.rotate(angle);

      ctx.shadowColor = '#ff6f00';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#ff8f00';
      ctx.fillRect(-6, -2, 10, 4);
      ctx.fillStyle = '#ff3d00';
      ctx.beginPath();
      ctx.moveTo(4, 0);
      ctx.lineTo(10, -3);
      ctx.lineTo(10, 3);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = `rgba(255, 200, 50, ${0.45 + Math.sin(time * 30) * 0.2})`;
      ctx.beginPath();
      ctx.arc(-8, 0, 3 + Math.sin(time * 30) * 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }
}

class ExplosionParticle {
  constructor(x, y, radius) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.maxLife = 0.25;
    this.life = 0.25;
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
    ctx.beginPath();
    ctx.ellipse(screenX, screenY, this.radius * (1.5 - ratio), this.radius * 0.75 * (1.5 - ratio), 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, ${Math.floor(100 + 155 * ratio)}, 0, ${ratio})`;
    ctx.fill();
    ctx.restore();
  }
}
