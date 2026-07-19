/**
 * GDI vs NOD race definitions (Tiberian Sun inspired)
 */

export const RACES = {
  gdi: {
    id: 'gdi',
    name: 'GDI',
    fullName: 'Global Defense Initiative',
    tagline: 'Steel, discipline, and ion firepower',
    palette: {
      primary: '#4fc3f7',
      secondary: '#1565c0',
      dark: '#0d47a1',
      accent: '#ffd54f',
      trim: '#ffca28',
      glow: 'rgba(79, 195, 247, 0.65)',
      minimap: '#4fc3f7',
    },
    unitModifiers: {
      tank: { maxHealth: 1.2, damage: 1.1 },
      plane: { maxHealth: 1.1 },
      motorcycle: { speed: 0.95 },
    },
    buildingModifiers: {
      cyard: { maxHealth: 1.1 },
      power: { powerProduction: 110 },
      turret: { damage: 1.05 },
    },
    buildings: {
      cyard: 'Construction Yard',
      power: 'Advanced Power Plant',
      refinery: 'Tiberium Refinery',
      barracks: 'Warfactory',
      fence: 'Concrete Barrier',
      gate: 'Secure Gate',
      turret: 'Guard Tower',
      laser: 'Sonic Emitter',
      explosive_tower: 'Disruptor Tower',
    },
    units: {
      harvester: 'Harvester',
      motorcycle: 'Pitbull',
      buggy: 'Humvee',
      tank: 'Predator Tank',
      plane: 'Orca Fighter',
      nuke_rocket: 'Ion Cannon Strike',
      bio_rocket: 'Chem Strike',
    },
  },
  nod: {
    id: 'nod',
    name: 'NOD',
    fullName: 'Brotherhood of Nod',
    tagline: 'Faith, stealth, and tiberium fury',
    palette: {
      primary: '#ef5350',
      secondary: '#b71c1c',
      dark: '#4a0000',
      accent: '#ce93d8',
      trim: '#ff5252',
      glow: 'rgba(239, 83, 80, 0.6)',
      minimap: '#ef5350',
    },
    unitModifiers: {
      motorcycle: { speed: 1.15, damage: 1.1 },
      buggy: { speed: 1.1, damage: 1.05 },
      plane: { damage: 1.15 },
      bio_rocket: { damage: 1.2 },
    },
    buildingModifiers: {
      power: { powerProduction: 125 },
      refinery: { powerUsage: 30 },
      laser: { damage: 1.2, range: 1.05 },
      gate: { maxHealth: 0.9 },
    },
    buildings: {
      cyard: 'Nod Construction Yard',
      power: 'Tiberium Reactor',
      refinery: 'Nod Refinery',
      barracks: 'Hand of Nod',
      fence: 'Spike Barrier',
      gate: 'Nod Gate',
      turret: 'Obelisk of Light',
      laser: 'Laser Turret',
      explosive_tower: 'SAM Site',
    },
    units: {
      harvester: 'Nod Harvester',
      motorcycle: 'Attack Bike',
      buggy: 'Raider Buggy',
      tank: 'Scorpion Tank',
      plane: 'Venom Craft',
      nuke_rocket: 'Nuclear Missile',
      bio_rocket: 'Tiberium Weapon',
    },
  },
};

export function getRace(raceId) {
  return RACES[raceId] || RACES.gdi;
}

export function normalizeRaceId(raceId) {
  return RACES[raceId] ? raceId : 'gdi';
}

export function getRacePalette(raceId) {
  return getRace(raceId).palette;
}

export function getRaceBuildingName(raceId, type) {
  return getRace(raceId).buildings[type] || type;
}

export function getRaceUnitName(raceId, type) {
  return getRace(raceId).units[type] || type;
}

export function applyRaceUnitStats(raceId, type, stats) {
  const mod = getRace(raceId).unitModifiers[type];
  if (!mod) return stats;
  return {
    speed: Math.round(stats.speed * (mod.speed || 1)),
    maxHealth: Math.round(stats.maxHealth * (mod.maxHealth || 1)),
    damage: Math.round(stats.damage * (mod.damage || 1)),
    attackRange: Math.round(stats.attackRange * (mod.attackRange || 1)),
  };
}

export function applyRaceBuildingStats(raceId, type, def) {
  const result = { ...def };
  const mod = getRace(raceId).buildingModifiers[type];
  
  if (mod && mod.maxHealth) {
    result.maxHealth = Math.round(def.maxHealth * mod.maxHealth);
  }

  if (mod?.powerProduction) result.powerProduction = mod.powerProduction;
  if (mod?.powerUsage) result.powerUsage = mod.powerUsage;
  
  // Custom weapons per race for defense towers
  if (result.weapon) {
    result.weapon = { ...result.weapon };
    
    if (raceId === 'nod') {
      if (type === 'turret') { // Obelisk of Light
        result.weapon.projectile = 'obelisk_laser';
        result.weapon.damage = 140;
        result.weapon.cooldown = 2.4;
        result.weapon.range = 280;
        result.weapon.speed = 1000; // instant
      } else if (type === 'laser') { // Laser Turret
        result.weapon.projectile = 'laser';
        result.weapon.damage = 18;
        result.weapon.cooldown = 0.55;
        result.weapon.range = 220;
        result.weapon.speed = 650;
      }
    } else { // GDI
      if (type === 'turret') { // Guard Tower
        result.weapon.projectile = 'shell';
        result.weapon.damage = 22;
        result.weapon.cooldown = 0.9;
        result.weapon.range = 220;
        result.weapon.speed = 320;
      } else if (type === 'laser') { // Sonic Emitter
        result.weapon.projectile = 'sonic_beam';
        result.weapon.damage = 55;
        result.weapon.cooldown = 1.3;
        result.weapon.range = 260;
        result.weapon.speed = 450;
      }
    }

    // Apply building specific modifiers defined in RACES object on top
    if (mod) {
      if (mod.damage) result.weapon.damage = Math.round(result.weapon.damage * mod.damage);
      if (mod.range) result.weapon.range = Math.round(result.weapon.range * mod.range);
    }
  }
  
  return result;
}

export function getRaceForEntity(entity, game) {
  if (entity?.race) return entity.race;
  if (!game) return 'gdi';
  return entity?.faction === 'player' ? game.playerRace : game.enemyRace;
}
