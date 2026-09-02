import assert from 'node:assert/strict';
import { Unit } from '../js/unit.js';
import { UNIT_DEFS, LEVELS, isUnlockedAt } from '../js/tech.js';
import { getRaceUnitName } from '../js/races.js';

// 1. Check all infantry units exist
const expectedInfantry = [
  'light_infantry',
  'disc_thrower',
  'rocket_infantry',
  'engineer',
  'medic',
  'cyborg',
  'jumpjet',
  'ghost_stalker',
  'cyborg_commando',
  'hijacker',
];

for (const type of expectedInfantry) {
  assert.ok(UNIT_DEFS[type], `UNIT_DEFS should contain definition for ${type}`);
  assert.equal(UNIT_DEFS[type].category, 'infantry', `${type} should be marked as infantry category`);
  assert.equal(UNIT_DEFS[type].producer, 'barracks', `${type} should be produced at barracks`);
}

// 2. Faction restriction checks
const gdiOnly = ['disc_thrower', 'medic', 'jumpjet', 'ghost_stalker'];
for (const type of gdiOnly) {
  assert.deepEqual(UNIT_DEFS[type].races, ['gdi'], `${type} must be restricted to GDI`);
}

const nodOnly = ['rocket_infantry', 'cyborg', 'cyborg_commando', 'hijacker'];
for (const type of nodOnly) {
  assert.deepEqual(UNIT_DEFS[type].races, ['nod'], `${type} must be restricted to NOD`);
}

const shared = ['light_infantry', 'engineer'];
for (const type of shared) {
  assert.equal(UNIT_DEFS[type].races, undefined, `${type} must be shared across all factions`);
}

// 3. Level unlocks
assert.equal(isUnlockedAt(0, UNIT_DEFS.light_infantry), true, 'Light Infantry unlocked at Basic');
assert.equal(isUnlockedAt(0, UNIT_DEFS.disc_thrower), true, 'Disc Thrower unlocked at Basic');
assert.equal(isUnlockedAt(0, UNIT_DEFS.rocket_infantry), true, 'Rocket Infantry unlocked at Basic');
assert.equal(isUnlockedAt(0, UNIT_DEFS.engineer), true, 'Engineer unlocked at Basic');

assert.equal(isUnlockedAt(0, UNIT_DEFS.medic), false, 'Medic locked at Basic');
assert.equal(isUnlockedAt(1, UNIT_DEFS.medic), true, 'Medic unlocked at Improved');

assert.equal(isUnlockedAt(1, UNIT_DEFS.cyborg), true, 'Cyborg unlocked at Improved');

assert.equal(isUnlockedAt(1, UNIT_DEFS.jumpjet), false, 'Jump Jet locked at Improved');
assert.equal(isUnlockedAt(2, UNIT_DEFS.jumpjet), true, 'Jump Jet unlocked at Advanced');

assert.equal(isUnlockedAt(2, UNIT_DEFS.ghost_stalker), false, 'Ghost Stalker locked at Advanced');
assert.equal(isUnlockedAt(3, UNIT_DEFS.ghost_stalker), true, 'Ghost Stalker unlocked at High');
assert.equal(isUnlockedAt(3, UNIT_DEFS.cyborg_commando), true, 'Cyborg Commando unlocked at High');
assert.equal(isUnlockedAt(3, UNIT_DEFS.hijacker), true, 'Mutant Hijacker unlocked at High');

// 4. Hero unit designations
assert.equal(Boolean(UNIT_DEFS.ghost_stalker.isHero), true, 'Ghost Stalker is a hero');
assert.equal(Boolean(UNIT_DEFS.cyborg_commando.isHero), true, 'Cyborg Commando is a hero');
assert.equal(Boolean(UNIT_DEFS.hijacker.isHero), true, 'Mutant Hijacker is a hero');
assert.equal(Boolean(UNIT_DEFS.light_infantry.isHero), false, 'Light Infantry is not a hero');

// 5. Unit instantiation & mechanics
const jumpjet = new Unit(10, 'player', 'jumpjet', 50, 50, null, null, null, null, 'gdi');
assert.equal(jumpjet.isFlying, true, 'Jump Jet infantry must have isFlying flag set');

const disc = new Unit(11, 'player', 'disc_thrower', 50, 50, null, null, null, null, 'gdi');
assert.equal(disc.projectileType, 'disc', 'Disc thrower must fire disc projectile');

const ghost = new Unit(12, 'player', 'ghost_stalker', 50, 50, null, null, null, null, 'gdi');
assert.equal(ghost.projectileType, 'railgun', 'Ghost Stalker must fire railgun projectile');

const commando = new Unit(13, 'player', 'cyborg_commando', 50, 50, null, null, null, null, 'nod');
assert.equal(commando.projectileType, 'plasma', 'Cyborg commando must fire plasma projectile');

// 6. Cyborg dismemberment / crawling state on fatal damage
const cyborg = new Unit(14, 'player', 'cyborg', 50, 50, null, null, null, null, 'nod');
assert.equal(cyborg.isCrawling, false, 'Cyborg starts upright');
cyborg.takeDamage(999); // lethal damage
assert.equal(cyborg.isDead, false, 'Cyborg should not die immediately upon first lethal damage');
assert.equal(cyborg.isCrawling, true, 'Cyborg must transition into crawling state');
assert.ok(cyborg.health > 0, 'Crawling cyborg should retain partial health');

// Second lethal damage should kill the crawling torso
cyborg.takeDamage(999);
assert.equal(cyborg.isDead, true, 'Second lethal blow must destroy the crawling cyborg');

// 7. Faction naming check
assert.equal(getRaceUnitName('gdi', 'light_infantry'), 'Light Infantry');
assert.equal(getRaceUnitName('nod', 'light_infantry'), 'Nod Militant');
assert.equal(getRaceUnitName('gdi', 'disc_thrower'), 'Disc Thrower');
assert.equal(getRaceUnitName('nod', 'rocket_infantry'), 'Rocket Infantry');

console.log('All Tiberian Sun Infantry unit checks passed successfully!');
