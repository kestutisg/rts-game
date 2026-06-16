import { Entity } from './entities.js';

export class Unit extends Entity {
  constructor(id, faction, type, x, y, speed, maxHealth, damage = 0, attackRange = 0) {
    super(id, faction, maxHealth, maxHealth);
    this.type = type; // 'soldier', 'rocket', 'tank', 'harvester'
    this.x = x; // world X
    this.y = y; // world Y
    this.speed = speed; // world pixels per sec
    this.radius = type === 'tank' || type === 'harvester' ? 14 : 7;
    
    this.path = [];
    this.pathIndex = 0;
    this.state = 'idle'; // 'idle', 'moving', 'attacking', 'mining', 'unloading'
    
    // Combat
    this.damage = damage;
    this.attackRange = attackRange;
    this.attackCooldown = type === 'tank' ? 1.5 : 0.6; // seconds
    this.lastAttackTime = 0;
    this.combatTarget = null;
    
    // Direction angle (in radians)
    this.angle = 0;
    this.turretAngle = 0;
  }

  update(dt, game) {
    if (this.isDead) return;

    // Tiberium damage: infantry standing on ore takes very minor damage over time
    if ((this.type === 'soldier' || this.type === 'rocket') && Math.random() < 0.005) {
      const tile = game.grid.getTileAtWorld(this.x, this.y);
      if (tile && tile.type === 'ore') {
        this.takeDamage(1);
      }
    }

    // Process state machine
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
      case 'mining':
      case 'unloading':
        // Overridden in Harvester subclass
        break;
    }
  }

  updateIdle(game) {
    // Basic automatic guard mode: if combat unit, look for nearby enemies
    if (this.type !== 'harvester' && this.damage > 0) {
      const enemies = this.faction === 'player' ? game.enemyEntities : game.playerEntities;
      let closestEnemy = null;
      let minDist = this.attackRange * 1.5; // Aggro range slightly larger than attack range

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
    const targetWorldX = (currentTargetTile.x + 0.5) * game.grid.tileSize;
    const targetWorldY = (currentTargetTile.y + 0.5) * game.grid.tileSize;

    const dx = targetWorldX - this.x;
    const dy = targetWorldY - this.y;
    const dist = Math.hypot(dx, dy);

    // Turn towards target
    this.angle = Math.atan2(dy, dx);
    this.turretAngle = this.angle; // Lock turret to body angle during move

    const moveStep = this.speed * dt;
    if (dist <= moveStep) {
      // Snapped to node
      this.x = targetWorldX;
      this.y = targetWorldY;
      this.pathIndex++;
      
      if (this.pathIndex >= this.path.length) {
        this.state = 'idle';
        this.path = [];
      }
    } else {
      // Standard linear interpolation
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
    this.turretAngle = this.angle; // Point turret to target

    if (dist <= this.attackRange) {
      // In range: stop moving and attack!
      this.path = [];
      
      const now = game.currentTime;
      if (now - this.lastAttackTime >= this.attackCooldown) {
        this.shoot(game);
        this.lastAttackTime = now;
      }
    } else {
      // Out of range: pathfind to follow target
      if (Math.random() < 0.05) { // Throttle pathfinding to avoid performance drops
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
    // Create visual projectile
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

    // Draw unit shadow (offset circle)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.arc(screenX + 2, screenY + 2, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // Faction color
    const factionColor = this.faction === 'player' ? 'oklch(0.78 0.18 195)' : 'oklch(0.62 0.22 25)';

    // Unit-specific graphics
    if (this.type === 'soldier') {
      // Small circle with gun line
      ctx.fillStyle = factionColor;
      ctx.beginPath();
      ctx.arc(screenX, screenY, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Gun orientation
      ctx.strokeStyle = '#dddddd';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(screenX, screenY);
      ctx.lineTo(screenX + Math.cos(this.angle) * (this.radius + 3), screenY + Math.sin(this.angle) * (this.radius + 3));
      ctx.stroke();

    } else if (this.type === 'rocket') {
      // Slightly larger orange-highlighted helmet soldier
      ctx.fillStyle = factionColor;
      ctx.beginPath();
      ctx.arc(screenX, screenY, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.stroke();

      // Shoulder launcher barrel
      ctx.fillStyle = '#555555';
      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.rotate(this.angle);
      ctx.fillRect(-2, -this.radius - 2, 8, 4);
      ctx.restore();

    } else if (this.type === 'tank') {
      // Tank body (rotates with movement angle)
      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.rotate(this.angle);
      
      // Tracks
      ctx.fillStyle = '#2b3033';
      ctx.fillRect(-12, -9, 24, 4);
      ctx.fillRect(-12, 5, 24, 4);

      // Chassis
      ctx.fillStyle = factionColor;
      ctx.fillRect(-10, -6, 20, 12);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.strokeRect(-10, -6, 20, 12);
      
      ctx.restore();

      // Tank turret (rotates towards target)
      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.rotate(this.turretAngle);

      // Gun barrel
      ctx.fillStyle = '#888888';
      ctx.fillRect(0, -2, 16, 4);
      ctx.strokeStyle = '#000000';
      ctx.strokeRect(0, -2, 16, 4);

      // Turret dome
      ctx.fillStyle = this.faction === 'player' ? 'oklch(0.68 0.15 195)' : 'oklch(0.52 0.18 25)';
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }

    // Selection ring & health overlay
    this.drawSelectionAndHP(ctx, camera, screenX, screenY, this.radius * 2, this.radius * 2);
  }
}

/**
 * Harvester unit with automated ore mining state machine
 */
export class Harvester extends Unit {
  constructor(id, faction, x, y) {
    super(id, faction, 'harvester', x, y, 70, 300); // Harvesters are slower but heavy-duty
    this.cargo = 0;
    this.maxCargo = 500;
    this.miningRate = 75; // resource gathered per second
    this.depositRate = 200; // credits processed per second
    
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
    // If cargo is full, go dump it
    if (this.cargo >= this.maxCargo) {
      this.findRefineryAndGo(game);
      return;
    }

    // If we have room, look for nearest ore tile
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
    // Verify mining tile still has resources
    if (!this.miningTargetTile || this.miningTargetTile.type !== 'ore' || this.miningTargetTile.resourceAmount <= 0) {
      this.miningTargetTile = null;
      this.state = 'idle';
      return;
    }

    // Mine crystals
    const amountToMine = Math.min(this.miningRate * dt, this.maxCargo - this.cargo);
    const actualMined = Math.min(amountToMine, this.miningTargetTile.resourceAmount);

    this.cargo += actualMined;
    this.miningTargetTile.resourceAmount -= actualMined;

    // If empty, clean tile type
    if (this.miningTargetTile.resourceAmount <= 0) {
      this.miningTargetTile.type = 'grass';
      this.miningTargetTile = null;
      this.state = 'idle';
      return;
    }

    // Rotate harvester towards mining spot
    const dx = (this.miningTargetTile.x + 0.5) * game.grid.tileSize - this.x;
    const dy = (this.miningTargetTile.y + 0.5) * game.grid.tileSize - this.y;
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
      return; // No refinery found
    }

    // Find nearest refinery
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

    // Unload cargo
    const amountToUnload = Math.min(this.depositRate * dt, this.cargo);
    this.cargo -= amountToUnload;

    // Credit gain
    if (this.faction === 'player') {
      game.playerCredits += amountToUnload;
    } else {
      game.enemyCredits += amountToUnload;
    }

    // Face refinery
    const dx = this.depositTargetRefinery.x - this.x;
    const dy = this.depositTargetRefinery.y - this.y;
    this.angle = Math.atan2(dy, dx);

    if (this.cargo <= 0) {
      this.cargo = 0;
      this.state = 'idle'; // automatically goes back to mining
    }
  }

  // Override updateMovement to trigger mining/unloading states when adjacent
  updateMovement(dt, game) {
    if (this.path.length === 0 || this.pathIndex >= this.path.length) {
      this.state = 'idle';
      this.path = [];
      return;
    }

    const currentTargetTile = this.path[this.pathIndex];
    const targetWorldX = (currentTargetTile.x + 0.5) * game.grid.tileSize;
    const targetWorldY = (currentTargetTile.y + 0.5) * game.grid.tileSize;

    const dx = targetWorldX - this.x;
    const dy = targetWorldY - this.y;
    const dist = Math.hypot(dx, dy);

    this.angle = Math.atan2(dy, dx);

    // Check if we are heading to harvest and are adjacent to target tile
    if (this.miningTargetTile && this.pathIndex === this.path.length - 1) {
      const tileDist = Math.hypot(this.miningTargetTile.x * game.grid.tileSize + game.grid.tileSize / 2 - this.x, 
                                  this.miningTargetTile.y * game.grid.tileSize + game.grid.tileSize / 2 - this.y);
      if (tileDist <= game.grid.tileSize * 1.5) {
        this.state = 'mining';
        this.path = [];
        return;
      }
    }

    // Check if we are heading to unload and are adjacent to refinery
    if (this.depositTargetRefinery && this.pathIndex === this.path.length - 1) {
      const bDist = Math.hypot(this.depositTargetRefinery.x - this.x, this.depositTargetRefinery.y - this.y);
      if (bDist <= game.grid.tileSize * 2.2) {
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
    ctx.arc(screenX + 3, screenY + 3, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(this.angle);

    // Tracks
    ctx.fillStyle = '#1c1f21';
    ctx.fillRect(-15, -11, 30, 4);
    ctx.fillRect(-15, 7, 30, 4);

    // Cab/Cargo Chassis
    const color = this.faction === 'player' ? 'oklch(0.85 0.15 85)' : 'oklch(0.62 0.22 25)'; // Yellow body for player harvester
    ctx.fillStyle = color;
    ctx.fillRect(-13, -8, 26, 16);
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(-13, -8, 26, 16);

    // Cockpit
    ctx.fillStyle = 'rgba(0, 255, 255, 0.6)';
    ctx.fillRect(5, -4, 5, 8);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(5, -4, 5, 8);

    // Cargo indicator light based on full level
    const ratio = this.cargo / this.maxCargo;
    ctx.fillStyle = `oklch(0.65 0.25 142 / ${ratio})`; // Green light intensifies
    ctx.beginPath();
    ctx.arc(-8, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    // Selection ring & health overlay
    this.drawSelectionAndHP(ctx, camera, screenX, screenY, this.radius * 2, this.radius * 2);
    
    // Cargo Text Overlay above selection if selected
    if (this.selected) {
      ctx.fillStyle = '#00ff66';
      ctx.font = '9px var(--font-mono)';
      ctx.textAlign = 'center';
      ctx.fillText(`ORE: ${Math.floor(this.cargo)}/${this.maxCargo}`, screenX, screenY + this.radius + 12);
    }
  }
}

/**
 * Bullet / Rocket flying projectile class
 */
export class Projectile {
  constructor(startX, startY, targetEntity, speed, damage, type, faction) {
    this.x = startX;
    this.y = startY;
    this.target = targetEntity;
    this.speed = speed;
    this.damage = damage;
    this.type = type; // 'bullet', 'rocket'
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
      // Impact!
      this.target.takeDamage(this.damage);
      this.isDead = true;
      
      // Bullet flash or rocket blast particle effect
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
      // Drawing small flame trail
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

/**
 * Impact visual effects particles
 */
class ExplosionParticle {
  constructor(x, y, radius) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.maxLife = 0.25; // seconds
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
    ctx.arc(screenX, screenY, this.radius * (1.5 - ratio), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, ${Math.floor(100 + 155 * ratio)}, 0, ${ratio})`;
    ctx.fill();
    ctx.restore();
  }
}
