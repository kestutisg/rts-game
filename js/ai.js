/**
 * Simple Enemy Skirmish AI for Tiberian Odyssey
 * Automates resource collection, base expansion, combat unit production,
 * and periodic group attacks against the player.
 */

import { BUILDING_DEFS, UNIT_DEFS } from './tech.js';

export class EnemyAI {
  constructor(game) {
    this.game = game;
    
    // AI construction state
    this.state = 'idle'; // 'idle', 'building'
    this.buildTimer = 0;
    this.buildDuration = 0;
    this.queuedBuilding = null;
    this.targetTile = null;

    // Decision tick throttle (runs every 1.5 seconds)
    this.tickCooldown = 1.5;
    this.lastTickTime = 0;

    // Attack wave tracker
    this.attackInterval = 30.0; // seconds between attacks
    this.lastAttackTime = 0;
  }

  update(dt) {
    const now = this.game.currentTime;

    // 1. Process active building construction
    if (this.state === 'building') {
      const speedMultiplier = this.game.isLowPower('enemy') ? 0.5 : 1.0;
      this.buildTimer -= dt * speedMultiplier;

      if (this.buildTimer <= 0) {
        this.game.spawnBuilding('enemy', this.queuedBuilding, this.targetTile.x, this.targetTile.y);
        
        this.state = 'idle';
        this.queuedBuilding = null;
        this.targetTile = null;
      }
      return; // Do not make other placement decisions during build
    }

    // 2. Throttle economic and tactical decision loops
    if (now - this.lastTickTime >= this.tickCooldown) {
      this.makeTacticalDecisions();
      this.lastTickTime = now;
    }

    // 3. Process periodic assault waves
    if (now - this.lastAttackTime >= this.attackInterval) {
      this.launchAttackWave();
      this.lastAttackTime = now;
    }
  }

  makeTacticalDecisions() {
    const buildings = this.game.enemyEntities.filter(b => b.isBuilding && !b.isDead);
    const hasCyard = buildings.some(b => b.type === 'cyard');
    const hasPower = buildings.some(b => b.type === 'power' && !b.isUnderConstruction);
    const hasRefinery = buildings.some(b => b.type === 'refinery' && !b.isUnderConstruction);
    const hasBarracks = buildings.some(b => b.type === 'barracks' && !b.isUnderConstruction);
    const hasFence = buildings.some(b => b.type === 'fence' && !b.isUnderConstruction);
    const hasTurret = buildings.some(b => b.type === 'turret' && !b.isUnderConstruction);
    const hasLaser = buildings.some(b => b.type === 'laser' && !b.isUnderConstruction);

    if (!hasCyard) return; // AI defeated

    // --- Base Building Decisions ---
    if (this.state === 'idle') {
      let powerGen = 0;
      let powerDraw = 0;
      buildings.forEach(b => {
        if (!b.isUnderConstruction) {
          powerGen += b.powerProduction;
          powerDraw += b.powerUsage;
        }
      });

      // A. Build Power Plant if power deficit or near max
      if (powerGen === 0 || powerDraw >= powerGen - 30) {
        this.startBuildingDecision('power', 300, 4.0);
        return;
      }

      // B. Build Ore Refinery to establish economy
      if (!hasRefinery) {
        this.startBuildingDecision('refinery', 2000, 10.0);
        return;
      }

      // C. Build Barracks to train soldiers/tanks
      if (!hasBarracks) {
        this.startBuildingDecision('barracks', 500, 6.0);
        return;
      }

      const nextLevel = this.game.getCurrentLevel('enemy').id;
      if (nextLevel === 'basic' && this.game.enemyCredits > 3200 && this.game.upgradeEnemyLevel()) return;
      if (nextLevel === 'improved' && this.game.enemyCredits > 5500 && this.game.upgradeEnemyLevel()) return;
      if (nextLevel === 'advanced' && this.game.enemyCredits > 9000 && this.game.upgradeEnemyLevel()) return;

      if (this.game.canUseBuilding('enemy', 'fence') && !hasFence && this.game.enemyCredits > 700) {
        this.startBuildingDecision('fence', BUILDING_DEFS.fence.cost, BUILDING_DEFS.fence.duration);
        return;
      }

      if (this.game.canUseBuilding('enemy', 'turret') && !hasTurret && this.game.enemyCredits > 1400) {
        this.startBuildingDecision('turret', BUILDING_DEFS.turret.cost, BUILDING_DEFS.turret.duration);
        return;
      }

      if (this.game.canUseBuilding('enemy', 'laser') && !hasLaser && this.game.enemyCredits > 2600) {
        this.startBuildingDecision('laser', BUILDING_DEFS.laser.cost, BUILDING_DEFS.laser.duration);
        return;
      }

      // D. Build extra Barracks if credit reserves are high
      if (this.game.enemyCredits > 2500) {
        const type = Math.random() < 0.5 ? 'power' : 'barracks';
        this.startBuildingDecision(type, BUILDING_DEFS[type].cost, BUILDING_DEFS[type].duration);
        return;
      }
    }

    // --- Unit Training Decisions ---
    if (hasBarracks) {
      const activeBarracks = buildings.filter(b => b.type === 'barracks' && b.buildQueue.length === 0);
      
      activeBarracks.forEach(barracks => {
        const preferred = ['bio_rocket', 'nuke_rocket', 'plane', 'tank', 'buggy', 'motorcycle']
          .filter(type => this.game.canUseUnit('enemy', type) && this.game.enemyCredits >= UNIT_DEFS[type].cost);

        if (preferred.length === 0) return;

        const roll = Math.random();
        let chosen = preferred[preferred.length - 1];
        if (roll < 0.2) chosen = preferred[0];
        else if (roll < 0.55) chosen = preferred[Math.min(1, preferred.length - 1)];

        this.game.enemyCredits -= UNIT_DEFS[chosen].cost;
        barracks.queueUnit(chosen);
      });
    }

    // --- Auxiliary Harvester check ---
    if (hasRefinery && this.game.enemyCredits > 1200) {
      // Ensure AI always has at least one active harvester
      const harvesters = this.game.enemyEntities.filter(u => u.type === 'harvester' && !u.isDead);
      if (harvesters.length === 0) {
        const refinery = buildings.find(b => b.type === 'refinery');
        if (refinery && refinery.buildQueue.length === 0) {
          this.game.enemyCredits -= 1000;
          refinery.queueUnit('harvester');
        }
      }
    }
  }

  startBuildingDecision(type, cost, duration) {
    if (!this.game.canUseBuilding('enemy', type)) return;
    if (this.game.enemyCredits < cost) return;

    // Find a valid spot close to the main Construction Yard
    const cyard = this.game.enemyEntities.find(b => b.type === 'cyard');
    if (!cyard) return;

    let tilesW = 2;
    let tilesH = 2;
    const def = BUILDING_DEFS[type];
    if (def) {
      tilesW = def.gridWidth;
      tilesH = def.gridHeight;
    }

    const spawnTile = this.findPlacementSpot(cyard.gridX, cyard.gridY, tilesW, tilesH);
    if (spawnTile) {
      this.game.enemyCredits -= cost;
      this.state = 'building';
      this.queuedBuilding = type;
      this.buildTimer = duration;
      this.buildDuration = duration;
      this.targetTile = spawnTile;
    }
  }

  findPlacementSpot(centerX, centerY, width, height) {
    // Spiral search outwards to find closest walkable and unblocked spot
    const searchRadii = [3, 4, 5, 6, 7, 8];
    for (const radius of searchRadii) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          // Check perimeter of current radius
          if (Math.abs(dx) === radius || Math.abs(dy) === radius) {
            const tx = centerX + dx;
            const ty = centerY + dy;
            if (this.game.validateBuildingPlacement('enemy', tx, ty, width, height)) {
              return { x: tx, y: ty };
            }
          }
        }
      }
    }
    return null;
  }

  launchAttackWave() {
    // Find all combat units owned by the AI
    const combatUnits = this.game.enemyEntities.filter(
      u => !u.isBuilding && !u.isDead && u.type !== 'harvester'
    );

    // AI gathers army until it has 4+ combat units
    if (combatUnits.length < 4) return;

    // Target the player's construction yard or any player building/unit
    const targets = this.game.playerEntities.filter(e => !e.isDead);
    if (targets.length === 0) return;

    // Prioritize targeting the player's primary Construction Yard, otherwise first available building
    let target = targets.find(e => e.type === 'cyard');
    if (!target) {
      target = targets.find(e => e.isBuilding);
    }
    if (!target) {
      target = targets[0]; // fallback
    }

    // Send all units in group attack
    combatUnits.forEach(unit => {
      unit.combatTarget = target;
      unit.state = 'attacking';
    });

    this.game.ui.setStatusText("INCOMING ENEMY ATTACK WAVE IDENTIFIED!");
  }
}
