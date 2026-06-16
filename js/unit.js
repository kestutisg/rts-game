import { Entity } from './entities.js';

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

  draw(ctx, camera) {
    const screenX = this.x - camera.x;
    const screenY = this.y - camera.y;

    const factionColor = this.faction === 'player' ? 'oklch(0.78 0.18 195)' : 'oklch(0.62 0.22 25)';

    // 1. Draw flat shadow on grid floor (squeezed circle)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(screenX + 2, screenY + 2, this.radius, this.radius * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Draw mobile unit models
    if (this.type === 'soldier' || this.type === 'rocket') {
      // Draw infantry standing vertically (unsquashed Y to stand upright)
      const isRocket = this.type === 'rocket';
      
      // Draw upright body capsule
      ctx.fillStyle = factionColor;
      ctx.beginPath();
      ctx.arc(screenX, screenY - 6, 4, 0, Math.PI * 2); // head
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = isRocket ? 'oklch(0.7 0.2 45)' : '#41525c'; // rocket orange chest vs soldier gray-blue chest
      ctx.fillRect(screenX - 3, screenY - 2, 6, 8);
      ctx.strokeStyle = '#000';
      ctx.strokeRect(screenX - 3, screenY - 2, 6, 8);

      // Weapon line
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(screenX, screenY + 2);
      ctx.lineTo(screenX + Math.cos(this.angle) * 8, screenY + 2 + Math.sin(this.angle) * 4);
      ctx.stroke();

    } else if (this.type === 'tank') {
      // Draw 2.5D Armored Tank (chassis lies flat on ground)
      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.scale(1, 0.5); // Project tracks & body chassis
      ctx.rotate(this.angle);

      // Tracks
      ctx.fillStyle = '#2b3033';
      ctx.fillRect(-12, -9, 24, 4);
      ctx.fillRect(-12, 5, 24, 4);

      // Chassis body
      ctx.fillStyle = factionColor;
      ctx.fillRect(-10, -6, 20, 12);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.strokeRect(-10, -6, 20, 12);

      ctx.restore();

      // Draw Turret dome and barrel slightly higher to give volumetric height
      const heightOffset = -5; // draw 5px above ground level
      ctx.save();
      ctx.translate(screenX, screenY + heightOffset);
      ctx.scale(1, 0.5); // Project turret
      ctx.rotate(this.turretAngle);

      // Barrel
      ctx.fillStyle = '#9eabb5';
      ctx.fillRect(0, -2, 16, 4);
      ctx.strokeStyle = '#000000';
      ctx.strokeRect(0, -2, 16, 4);

      // Turret Dome
      ctx.fillStyle = this.faction === 'player' ? 'oklch(0.68 0.15 195)' : 'oklch(0.52 0.18 25)';
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }

    // 3. Render flat selection rings
    this.drawSelectionAndHP(ctx, camera, screenX, screenY, this.radius * 1.5, this.radius * 1.5);
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

  draw(ctx, camera) {
    const screenX = this.x - camera.x;
    const screenY = this.y - camera.y;

    // Draw shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(screenX + 3, screenY + 2, this.radius, this.radius * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Draw Harvester chassis
    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.scale(1, 0.5); // Project flat to ground
    ctx.rotate(this.angle);

    // Tracks
    ctx.fillStyle = '#1c1f21';
    ctx.fillRect(-16, -11, 32, 4);
    ctx.fillRect(-16, 7, 32, 4);

    // Cab/Cargo Chassis
    const color = this.faction === 'player' ? 'oklch(0.85 0.15 85)' : 'oklch(0.62 0.22 25)';
    ctx.fillStyle = color;
    ctx.fillRect(-13, -8, 26, 16);
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(-13, -8, 26, 16);

    // Cockpit
    ctx.fillStyle = 'rgba(0, 255, 255, 0.6)';
    ctx.fillRect(5, -4, 5, 8);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(5, -4, 5, 8);

    // Cargo indicator light
    const ratio = this.cargo / this.maxCargo;
    ctx.fillStyle = `oklch(0.65 0.25 142 / ${ratio})`;
    ctx.beginPath();
    ctx.arc(-8, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    this.drawSelectionAndHP(ctx, camera, screenX, screenY, this.radius * 1.5, this.radius * 1.5);
    
    if (this.selected) {
      ctx.fillStyle = '#00ff66';
      ctx.font = '9px var(--font-mono)';
      ctx.textAlign = 'center';
      ctx.fillText(`ORE: ${Math.floor(this.cargo)}/${this.maxCargo}`, screenX, screenY + 16);
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

  draw(ctx, camera) {
    const screenX = this.x - camera.x;
    const screenY = this.y - camera.y;

    if (this.type === 'bullet') {
      ctx.fillStyle = '#ffff55';
      ctx.beginPath();
      ctx.arc(screenX, screenY, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === 'rocket') {
      // 3D flying height arch (offset Y visually)
      ctx.fillStyle = '#ffaa33';
      ctx.beginPath();
      ctx.arc(screenX, screenY, 4, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#ff3300';
      ctx.beginPath();
      ctx.arc(screenX - 2, screenY, 2, 0, Math.PI * 2);
      ctx.fill();
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
