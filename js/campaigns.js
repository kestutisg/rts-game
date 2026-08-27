import { getMapById } from './maps/index.js';

export const CAMPAIGN_OBJECTIVE_TYPES = {
  DESTROY_BASE: 'destroy-base',
  DESTROY_ALL_FORCES: 'destroy-all-forces',
};

// Campaign missions use the same skirmish rules, maps, and AI, but provide a
// structured progression with faction-specific briefings and starting tech.
export const CAMPAIGNS = {
  gdi: {
    id: 'gdi',
    faction: 'gdi',
    name: 'GDI: SHIELD OF EARTH',
    subtitle: 'Restore order across the contested theatre.',
    enemyRace: 'nod',
    missions: [
      {
        title: 'OPERATION FIRST LIGHT',
        mapId: 'great-britain',
        briefing: 'Nod raiders have seized the northern supply corridor. Establish a beachhead and remove their forward command.',
        objective: 'Destroy the Nod base.',
        objectiveType: CAMPAIGN_OBJECTIVE_TYPES.DESTROY_BASE,
        playerLevelIndex: 0,
        enemyLevelIndex: 0,
        startingCredits: 10000,
      },
      {
        title: 'THE ICELAND LINE',
        mapId: 'iceland',
        briefing: 'A Tiberium extraction site is powering Nod operations in the volcanic frontier. Break the line before reinforcements arrive.',
        objective: 'Destroy all Nod forces.',
        objectiveType: CAMPAIGN_OBJECTIVE_TYPES.DESTROY_ALL_FORCES,
        playerLevelIndex: 1,
        enemyLevelIndex: 0,
        startingCredits: 11000,
      },
      {
        title: 'ALPINE HAMMER',
        mapId: 'italy',
        briefing: 'Nod armor is moving through the mountain passes. Secure the central river crossing and push into their industrial heartland.',
        objective: 'Destroy the Nod base.',
        objectiveType: CAMPAIGN_OBJECTIVE_TYPES.DESTROY_BASE,
        playerLevelIndex: 1,
        enemyLevelIndex: 1,
        startingCredits: 12000,
      },
      {
        title: 'PACIFIC THUNDER',
        mapId: 'japan',
        briefing: 'The Brotherhood has turned the island chain into a launch platform. Air superiority is the key to the counteroffensive.',
        objective: 'Destroy all Nod forces.',
        objectiveType: CAMPAIGN_OBJECTIVE_TYPES.DESTROY_ALL_FORCES,
        playerLevelIndex: 2,
        enemyLevelIndex: 2,
        startingCredits: 12500,
      },
      {
        title: 'ION DAWN',
        mapId: 'cuba',
        briefing: 'Kane\'s final strike group is massing in the tropics. Bring the Ion network online and end the campaign.',
        objective: 'Destroy the Nod base.',
        objectiveType: CAMPAIGN_OBJECTIVE_TYPES.DESTROY_BASE,
        playerLevelIndex: 3,
        enemyLevelIndex: 3,
        startingCredits: 14000,
      },
    ],
  },
  nod: {
    id: 'nod',
    faction: 'nod',
    name: 'NOD: ASCENSION',
    subtitle: 'Turn the fires of war into a new order.',
    enemyRace: 'gdi',
    missions: [
      {
        title: 'THE BROTHERHOOD AWAKENS',
        mapId: 'cuba',
        briefing: 'GDI has occupied the eastern ports and declared the island pacified. Strike from the interior and reclaim the Tiberium fields.',
        objective: 'Destroy the GDI base.',
        objectiveType: CAMPAIGN_OBJECTIVE_TYPES.DESTROY_BASE,
        playerLevelIndex: 0,
        enemyLevelIndex: 0,
        startingCredits: 10000,
      },
      {
        title: 'BLOOD IN THE SNOW',
        mapId: 'new-zealand',
        briefing: 'GDI armor is cutting the northern routes. Use speed and stealth to shatter their supply network before the front closes.',
        objective: 'Destroy all GDI forces.',
        objectiveType: CAMPAIGN_OBJECTIVE_TYPES.DESTROY_ALL_FORCES,
        playerLevelIndex: 1,
        enemyLevelIndex: 0,
        startingCredits: 11000,
      },
      {
        title: 'THE MOUNTAIN TEMPLE',
        mapId: 'italy',
        briefing: 'A forgotten temple site lies behind GDI defenses in the alpine passes. Capture the corridor and let the Obelisks speak.',
        objective: 'Destroy the GDI base.',
        objectiveType: CAMPAIGN_OBJECTIVE_TYPES.DESTROY_BASE,
        playerLevelIndex: 1,
        enemyLevelIndex: 1,
        startingCredits: 12000,
      },
      {
        title: 'VENOM OVER TOKYO',
        mapId: 'japan',
        briefing: 'GDI has deployed sonic technology across the islands. Take the skies with Venoms and make the enemy deaf to its own command.',
        objective: 'Destroy all GDI forces.',
        objectiveType: CAMPAIGN_OBJECTIVE_TYPES.DESTROY_ALL_FORCES,
        playerLevelIndex: 2,
        enemyLevelIndex: 2,
        startingCredits: 12500,
      },
      {
        title: 'THE LAST WORD',
        mapId: 'great-britain',
        briefing: 'The GDI command believes the Brotherhood broken. Gather the faithful, unleash the nuclear arsenal, and claim the final victory.',
        objective: 'Destroy the GDI base.',
        objectiveType: CAMPAIGN_OBJECTIVE_TYPES.DESTROY_BASE,
        playerLevelIndex: 3,
        enemyLevelIndex: 3,
        startingCredits: 14000,
      },
    ],
  },
};

export function getCampaign(campaignId) {
  return CAMPAIGNS[campaignId] || null;
}

export function getCampaignMission(campaignId, missionIndex = 0) {
  const campaign = getCampaign(campaignId);
  if (!campaign) return null;
  const safeIndex = Math.max(0, Math.min(campaign.missions.length - 1, missionIndex));
  const mission = campaign.missions[safeIndex];
  return {
    ...mission,
    index: safeIndex,
    number: safeIndex + 1,
    map: getMapById(mission.mapId),
  };
}

export function getObjectiveType(mission) {
  if (mission?.objectiveType) return mission.objectiveType;
  return mission?.objective?.toLowerCase().includes('base')
    ? CAMPAIGN_OBJECTIVE_TYPES.DESTROY_BASE
    : CAMPAIGN_OBJECTIVE_TYPES.DESTROY_ALL_FORCES;
}

export function isObjectiveComplete(objectiveType, enemyBuildings, enemyUnits) {
  if (objectiveType === CAMPAIGN_OBJECTIVE_TYPES.DESTROY_BASE) {
    return enemyBuildings === 0;
  }
  return enemyBuildings + enemyUnits === 0;
}
