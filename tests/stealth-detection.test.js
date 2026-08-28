import assert from 'node:assert/strict';
import { Unit } from '../js/unit.js';
import { UNIT_DEFS, isUnlockedAt } from '../js/tech.js';

const sensorDef = UNIT_DEFS.sensor_array;
assert.ok(sensorDef, 'GDI should have a Mobile Sensor Array unit definition');
assert.deepEqual(sensorDef.races, ['gdi'], 'Mobile Sensor Array should be restricted to GDI');
assert.equal(sensorDef.detectionRange, 320, 'Mobile Sensor Array should have an extended detection range');
assert.equal(isUnlockedAt(0, sensorDef), true, 'Mobile Sensor Array should be available at Basic level');

const sensor = new Unit(1, 'player', 'sensor_array', 100, 100, null, null, 0, 0, 'gdi');
assert.equal(
  sensor.detectionRange,
  sensorDef.detectionRange,
  'Trained Mobile Sensor Arrays should carry the configured detection range'
);

const isInRange = (detector, target) =>
  Math.hypot(detector.x - target.x, detector.y - target.y) <= detector.detectionRange;

assert.equal(
  isInRange(sensor, { x: 100 + sensor.detectionRange - 1, y: 100 }),
  true,
  'The sensor should reveal a cloaked unit inside its range'
);
assert.equal(
  isInRange(sensor, { x: 100 + sensor.detectionRange + 1, y: 100 }),
  false,
  'The sensor should not reveal units outside its range'
);

console.log('Stealth detection checks passed.');
