import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_DEFS } from '../js/tech.js';
import { RACES, getRaceBuildingName } from '../js/races.js';
import { Building } from '../js/building.js';

test('Tiberian Sun Structure Definitions & Naming', () => {
  // GDI Names
  assert.equal(getRaceBuildingName('gdi', 'cyard'), 'Construction Yard');
  assert.equal(getRaceBuildingName('gdi', 'power'), 'Power Plant');
  assert.equal(getRaceBuildingName('gdi', 'refinery'), 'Tiberium Refinery');
  assert.equal(getRaceBuildingName('gdi', 'barracks'), 'Barracks');
  assert.equal(getRaceBuildingName('gdi', 'fence'), 'Concrete Wall');
  assert.equal(getRaceBuildingName('gdi', 'gate'), 'Gate');
  assert.equal(getRaceBuildingName('gdi', 'turret'), 'Component Tower (Vulcan)');
  assert.equal(getRaceBuildingName('gdi', 'laser'), 'Sonic Emitter');
  assert.equal(getRaceBuildingName('gdi', 'explosive_tower'), 'Component Tower (RPG)');

  // NOD Names
  assert.equal(getRaceBuildingName('nod', 'cyard'), 'Nod Construction Yard');
  assert.equal(getRaceBuildingName('nod', 'power'), 'Tiberium Reactor');
  assert.equal(getRaceBuildingName('nod', 'refinery'), 'Nod Refinery');
  assert.equal(getRaceBuildingName('nod', 'barracks'), 'Hand of Nod');
  assert.equal(getRaceBuildingName('nod', 'turret'), 'Obelisk of Light');
  assert.equal(getRaceBuildingName('nod', 'laser'), 'Laser Turret');
  assert.equal(getRaceBuildingName('nod', 'explosive_tower'), 'SAM Site');
});

test('Building Instances Initialization and Footprints', () => {
  const types = ['cyard', 'power', 'refinery', 'barracks', 'fence', 'gate', 'turret', 'laser', 'explosive_tower'];

  for (const type of types) {
    const gdiB = new Building(1, 'player', type, 10, 10, 36, 60, 'gdi');
    assert.equal(gdiB.race, 'gdi');
    assert.ok(gdiB.maxHealth > 0);
    assert.ok(gdiB.gridWidth > 0);
    assert.ok(gdiB.gridHeight > 0);

    const nodB = new Building(2, 'enemy', type, 10, 10, 36, 60, 'nod');
    assert.equal(nodB.race, 'nod');
    assert.ok(nodB.maxHealth > 0);
  }
});

test('Building Mock Rendering for all Faction Structures', () => {
  // Mock canvas context that tracks operations without throwing
  const createMockCtx = () => {
    const noop = () => {};
    const grad = { addColorStop: noop };
    return {
      save: noop,
      restore: noop,
      beginPath: noop,
      closePath: noop,
      moveTo: noop,
      lineTo: noop,
      arc: noop,
      ellipse: noop,
      stroke: noop,
      fill: noop,
      fillRect: noop,
      strokeRect: noop,
      fillText: noop,
      translate: noop,
      scale: noop,
      rotate: noop,
      createRadialGradient: () => grad,
      createLinearGradient: () => grad,
      fillStyle: '#000',
      strokeStyle: '#000',
      lineWidth: 1,
      globalAlpha: 1,
      shadowColor: '#000',
      shadowBlur: 0,
      font: '10px sans-serif',
      textAlign: 'left',
      textBaseline: 'top',
    };
  };

  const camera = { x: 0, y: 0 };
  const fakeGame = {
    currentTime: 12.5,
    isLowPower: () => false,
    playerRace: 'gdi',
    enemyRace: 'nod',
    selectedBuilding: null,
  };

  const types = ['cyard', 'power', 'refinery', 'barracks', 'fence', 'gate', 'turret', 'laser', 'explosive_tower'];
  const mockCtx = createMockCtx();

  for (const race of ['gdi', 'nod']) {
    for (const type of types) {
      const b = new Building(100, 'player', type, 5, 5, 36, 60, race);
      b.isUnderConstruction = false;
      b.turretAngle = 0.5;
      
      // Should execute without error
      assert.doesNotThrow(() => {
        b.draw(mockCtx, camera, fakeGame);
      }, `Building ${type} for race ${race} should render cleanly`);
    }
  }
});
