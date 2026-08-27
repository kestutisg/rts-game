import assert from 'node:assert/strict';
import {
  CAMPAIGNS,
  CAMPAIGN_OBJECTIVE_TYPES,
  isObjectiveComplete,
} from '../js/campaigns.js';

const allMissions = Object.values(CAMPAIGNS).flatMap(campaign => campaign.missions);

assert.equal(allMissions.length, 10, 'Both campaigns should contain five missions');
assert.ok(allMissions.every(mission => mission.objectiveType), 'Every campaign mission needs an objective type');

assert.equal(
  isObjectiveComplete(CAMPAIGN_OBJECTIVE_TYPES.DESTROY_BASE, 0, 2),
  true,
  'Destroy-base missions complete when enemy structures are gone'
);
assert.equal(
  isObjectiveComplete(CAMPAIGN_OBJECTIVE_TYPES.DESTROY_BASE, 1, 0),
  false,
  'Destroy-base missions stay active while an enemy structure remains'
);
assert.equal(
  isObjectiveComplete(CAMPAIGN_OBJECTIVE_TYPES.DESTROY_ALL_FORCES, 0, 1),
  false,
  'Destroy-all-forces missions wait for enemy units too'
);
assert.equal(
  isObjectiveComplete(CAMPAIGN_OBJECTIVE_TYPES.DESTROY_ALL_FORCES, 0, 0),
  true,
  'Destroy-all-forces missions complete when no enemy entity remains'
);

console.log('Campaign objective checks passed.');
