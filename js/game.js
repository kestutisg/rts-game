import { Grid } from './grid.js';
import { InputHandler } from './input.js';
import { UIManager } from './ui.js';
import { Building } from './building.js';
import { Unit, Harvester } from './unit.js';
import { EnemyAI } from './ai.js';
import { AudioSynthesizer } from './audio.js';
import { DayCycle } from './daycycle.js';
import { BUILDING_DEFS, LEVELS, UNIT_DEFS, isUnlockedAt } from './tech.js';
import { normalizeRaceId } from './races.js';
import { DEFAULT_MAP_ID, getMapById } from './maps/index.js';
import {
  CAMPAIGN_OBJECTIVE_TYPES,
  getCampaign,
  getCampaignMission,
  getObjectiveType,
  isObjectiveComplete,
} from './campaigns.js';

const SAVE_STORAGE_KEY = 'tiberian-odyssey-save-v1';
const SAVE_VERSION = 1;

const TILE_TYPE_CODES = { grass: 0, water: 1, rock: 2, ore: 3 };
const TILE_TYPES = ['grass', 'water', 'rock', 'ore'];
const BIOME_CODES = { temperate: 0, dry: 1, polar: 2, tropical: 3 };
const BIOMES_BY_CODE = ['temperate', 'dry', 'polar', 'tropical'];
const WATER_VARIANT_CODES = { null: 0, lake: 1, river: 2, waterfall: 3 };
const WATER_VARIANTS_BY_CODE = [null, 'lake', 'river', 'waterfall'];
const BYTES_PER_TILE = 3;

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function serializeGrid(grid) {
  const bytes = new Uint8Array(grid.width * grid.height * BYTES_PER_TILE);
  let offset = 0;

  for (let x = 0; x < grid.width; x++) {
    for (let y = 0; y < grid.height; y++) {
      const tile = grid.tiles[x][y];
      const typeCode = TILE_TYPE_CODES[tile.type] ?? TILE_TYPE_CODES.grass;
      const biomeCode = BIOME_CODES[tile.biome] ?? BIOME_CODES.temperate;
      const waterVariantCode = WATER_VARIANT_CODES[tile.waterVariant ?? 'null'] ?? 0;
      const elevationCode = Math.max(0, Math.min(3, Math.round(tile.elevation || 0)));

      // Pack categorical tile state into one byte and keep resource amount and
      // waterfall depth in two additional bytes. This keeps even the largest
      // maps small enough for browser localStorage.
      bytes[offset++] = typeCode | (biomeCode << 2) | (waterVariantCode << 4) | (elevationCode << 6);
      bytes[offset++] = Math.max(0, Math.min(100, Math.round(tile.resourceAmount || 0)));
      const waterfallDrop = Math.max(0, Math.min(3, Math.round(tile.waterfallDrop || 0)));
      bytes[offset++] = waterfallDrop | (tile.isBridge ? 4 : 0);
    }
  }

  return {
    width: grid.width,
    height: grid.height,
    data: bytesToBase64(bytes),
  };
}

function restoreGrid(grid, savedGrid) {
  if (!savedGrid || savedGrid.width !== grid.width || savedGrid.height !== grid.height) {
    throw new Error('Saved map dimensions do not match the selected map.');
  }

  const bytes = base64ToBytes(savedGrid.data);
  const expectedLength = grid.width * grid.height * BYTES_PER_TILE;
  if (bytes.length !== expectedLength) {
    throw new Error('Saved terrain data is incomplete.');
  }

  let offset = 0;
  for (let x = 0; x < grid.width; x++) {
    for (let y = 0; y < grid.height; y++) {
      const tile = grid.tiles[x][y];
      const packed = bytes[offset++];
      const typeCode = packed & 0x03;
      const biomeCode = (packed >> 2) & 0x03;
      const waterVariantCode = (packed >> 4) & 0x03;
      const elevationCode = (packed >> 6) & 0x03;

      tile.type = TILE_TYPES[typeCode] || 'grass';
      tile.biome = BIOMES_BY_CODE[biomeCode] || 'temperate';
      tile.waterVariant = WATER_VARIANTS_BY_CODE[waterVariantCode] || null;
      tile.elevation = elevationCode;
      tile.resourceAmount = bytes[offset++];
      const waterFlags = bytes[offset++];
      tile.waterfallDrop = waterFlags & 0x03;
      tile.isBridge = Boolean(waterFlags & 0x04);
      tile.walkable = tile.type === 'grass' || tile.type === 'ore' || tile.isBridge;
      tile.occupiedBy = null;
      tile.unitOccupant = null;
    }
  }
}

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    // Subsystems & Helpers
    this.nextEntityId = 1;
    this.currentTime = 0;
    this.state = 'menu'; // 'menu', 'playing', 'victory', 'defeat'
    this.enemyBaseDestroyedRemainingCount = null;
    this.chemicalClouds = [];

    // Camera
    this.camera = {
      x: 0,
      y: 0,
      width: this.canvas.width,
      height: this.canvas.height
    };

    // Economy
    this.playerCredits = 10000;
    this.enemyCredits = 10000;
    this.playerLevelIndex = 0;
    this.enemyLevelIndex = 0;

    // Faction Entity Lists
    this.playerEntities = [];
    this.enemyEntities = [];
    this.selectedEntities = [];
    this.projectiles = [];
    this.particles = [];
    
    // Race/Faction types
    this.playerRace = 'gdi';
    this.enemyRace = 'nod';
    this.mapId = DEFAULT_MAP_ID;
    this.mapDefinition = getMapById(this.mapId);
    this.campaignId = null;
    this.campaignMissionIndex = null;
    this.missionConfig = {};
    
    // Command placement helpers
    this.placementType = null;
    this.placementCost = 0;
    this.ghostWTiles = 0;
    this.ghostHTiles = 0;
    this.ghostWPx = 0;
    this.ghostHPx = 0;
    this.fencePlacementStartTile = null;
    this.fencePlacementPreviewTiles = [];

    // Hovered structure label
    this.hoveredEntity = null;

    // Visual order pings
    this.clickPings = [];

    // Frame timing
    this.lastTime = 0;
    this.fps = 60;
    this.fpsLastUpdate = 0;
    this.fpsFrames = 0;
    this.lastResourceGrowTime = 0;

    // Initialize systems. Each map supplies its own logical grid dimensions;
    // the fallback keeps older/custom map definitions playable.
    this.grid = this.createGrid();
    this.ai = new EnemyAI(this);
    this.input = new InputHandler(this);
    this.ui = new UIManager(this);
    this.audio = new AudioSynthesizer();
    this.dayCycle = new DayCycle(120);
    this.stars = this.generateStars(120);

    // Initial Setup
    this.initHUDListeners();

    // Start Game Loop
    requestAnimationFrame((t) => this.loop(t));
  }

  resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(rect.width));
    this.canvas.height = Math.max(1, Math.round(rect.height));
    
    if (this.camera) {
      this.camera.width = this.canvas.width;
      this.camera.height = this.canvas.height;
    }
  }

  initHUDListeners() {
    // Music Toggle listener
    const musicBtn = document.getElementById('music-toggle');
    if (musicBtn) {
      musicBtn.addEventListener('click', () => {
        const isPlaying = this.audio.toggle();
        if (isPlaying) {
          musicBtn.classList.add('active');
          musicBtn.innerText = "MUSIC: ON";
        } else {
          musicBtn.classList.remove('active');
          musicBtn.innerText = "MUSIC: OFF";
        }
      });
    }

    // Restart button listener
    const restartBtn = document.getElementById('restart-btn');
    if (restartBtn) {
      restartBtn.addEventListener('click', () => {
        this.restart();
      });
    }

    const nextMissionBtn = document.getElementById('next-mission-btn');
    if (nextMissionBtn) {
      nextMissionBtn.addEventListener('click', () => {
        if (this.startNextCampaignMission()) {
          nextMissionBtn.classList.add('hidden');
        }
      });
    }

    // Change Faction button listener
    const changeFactionBtn = document.getElementById('change-faction-btn');
    if (changeFactionBtn) {
      changeFactionBtn.addEventListener('click', () => {
        document.getElementById('game-over-overlay').classList.add('hidden');
        this.state = 'menu';
        const selectionOverlay = document.getElementById('faction-selection-overlay');
        if (selectionOverlay) selectionOverlay.classList.remove('hidden');
      });
    }

    const saveBtn = document.getElementById('save-game-btn');
    if (saveBtn) saveBtn.addEventListener('click', () => this.saveGame());

    document.querySelectorAll('[data-load-game]').forEach(loadBtn => {
      loadBtn.addEventListener('click', () => this.loadGame());
    });
  }

  startGame(playerRace, enemyRace, mapId = DEFAULT_MAP_ID, options = {}) {
    this.playerRace = normalizeRaceId(playerRace);
    this.enemyRace = normalizeRaceId(enemyRace);
    this.mapId = getMapById(mapId).id;
    this.mapDefinition = getMapById(this.mapId);
    this.campaignId = options.campaignId || null;
    this.campaignMissionIndex = Number.isInteger(options.campaignMissionIndex)
      ? options.campaignMissionIndex
      : null;
    this.missionConfig = {
      campaignId: this.campaignId,
      campaignMissionIndex: this.campaignMissionIndex,
      missionTitle: options.missionTitle || null,
      briefing: options.briefing || null,
      objective: options.objective || null,
      objectiveType: options.objectiveType || null,
      startingCredits: options.startingCredits,
      playerLevelIndex: options.playerLevelIndex,
      enemyLevelIndex: options.enemyLevelIndex,
    };
    
    // Reset economy & levels
    this.playerCredits = options.startingCredits ?? 10000;
    this.enemyCredits = options.enemyStartingCredits ?? this.playerCredits;
    this.playerLevelIndex = options.playerLevelIndex ?? 0;
    this.enemyLevelIndex = options.enemyLevelIndex ?? 0;

    this.playerEntities = [];
    this.enemyEntities = [];
    this.selectedEntities = [];
    this.projectiles = [];
    this.particles = [];
    this.chemicalClouds = [];
    this.clickPings = [];
    this.hoveredEntity = null;
    this.placementType = null;
    this.enemyBaseDestroyedRemainingCount = null;
    this.fencePlacementStartTile = null;
    this.fencePlacementPreviewTiles = [];
    if (this.input) this.input.isPlacingFence = false;
    this.nextEntityId = 1;
    this.lastResourceGrowTime = 0;
    if (this.ai) {
      this.ai.lastTickTime = 0;
      this.ai.lastAttackTime = 0;
      this.ai.state = 'idle';
      this.ai.buildTimer = 0;
      this.ai.queuedBuilding = null;
      this.ai.targetTile = null;
    }
    if (this.ui) this.ui.clearSidebarBuildVisuals();
    document.body.style.cursor = 'default';

    this.grid = this.createGrid();
    this.setupStartingBases();
    if (this.ui) this.ui.offscreenMinimapDirty = true;
    
    this.state = 'playing';
    this.currentTime = 0;
    this.lastTime = 0;
    this.ui.renderMissionAssignment();
    this.ui.setStatusText("MISSION COMMENCED. DEPLOY FORCES.");
    if (options.missionTitle) {
      this.ui.setStatusText(`${options.missionTitle}. ${options.objective || 'DESTROY ALL ENEMY FORCES.'}`);
    }
    this.ui.applyRaceLabels();
    this.ui.updateFactionTheme(this.playerRace);
    
    const overlay = document.getElementById('faction-selection-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  startCampaign(campaignId, missionIndex = 0) {
    const campaign = getCampaign(campaignId);
    const mission = getCampaignMission(campaignId, missionIndex);
    if (!campaign || !mission) return false;

    this.startGame(campaign.faction, campaign.enemyRace, mission.mapId, {
      campaignId: campaign.id,
      campaignMissionIndex: mission.index,
      missionTitle: mission.title,
      briefing: mission.briefing,
      objective: mission.objective,
      objectiveType: mission.objectiveType,
      startingCredits: mission.startingCredits,
      playerLevelIndex: mission.playerLevelIndex,
      enemyLevelIndex: mission.enemyLevelIndex,
    });
    return true;
  }

  startNextCampaignMission() {
    const campaign = getCampaign(this.campaignId);
    if (!campaign || this.campaignMissionIndex === null) return false;
    const nextIndex = this.campaignMissionIndex + 1;
    if (nextIndex >= campaign.missions.length) return false;
    return this.startCampaign(campaign.id, nextIndex);
  }

  getMissionObjectiveType() {
    if (this.campaignId) {
      const mission = getCampaignMission(this.campaignId, this.campaignMissionIndex ?? 0);
      return getObjectiveType(mission);
    }
    return CAMPAIGN_OBJECTIVE_TYPES.DESTROY_ALL_FORCES;
  }

  isEntityDetected(entity, detectorFaction) {
    if (entity.faction === detectorFaction) return true;
    if (!entity.isStealthed) return true;
    if (entity.decloakTimer > 0) return true;

    const detectors = detectorFaction === 'player' ? this.playerEntities : this.enemyEntities;
    for (const det of detectors) {
      if (det.isDead) continue;
      
      const dist = Math.hypot(det.x - entity.x, det.y - entity.y);
      let detectionRange = 100;
      if (det.isBuilding) {
        detectionRange = det.type === 'cyard' || det.type === 'turret' || det.type === 'laser' ? 260 : 150;
      } else {
        detectionRange = det.type === 'plane' ? 220 : 80;
      }
      
      if (dist <= detectionRange) {
        return true;
      }
    }
    return false;
  }

  setupStartingBases() {
    const playerBase = this.getStartingBaseCoordinates('player');
    const enemyBase = this.getStartingBaseCoordinates('enemy');

    // Spawn player starting structures
    this.spawnBuilding('player', 'cyard', playerBase.x, playerBase.y, this.playerRace);
    this.spawnBuilding('player', 'power', playerBase.x, playerBase.y + 4, this.playerRace);

    // Initial units (computed staggered-grid start points)
    const c1 = this.grid.getTileCoords(playerBase.x + 4, playerBase.y + 2);
    const c2 = this.grid.getTileCoords(playerBase.x + 5, playerBase.y + 3);

    const u1 = new Unit(this.generateEntityId(), 'player', 'motorcycle', c1.x, c1.y, null, null, 0, 0, this.playerRace);
    const u2 = new Unit(this.generateEntityId(), 'player', 'buggy', c2.x, c2.y, null, null, 0, 0, this.playerRace);
    this.addUnit(u1);
    this.addUnit(u2);

    // Center camera on player's construction yard
    const startCoords = this.grid.getTileCoords(playerBase.x, playerBase.y);
    this.camera.x = startCoords.x - this.camera.width / 2;
    this.camera.y = startCoords.y - this.camera.height / 2;
    this.grid.clampCamera(this.camera);

    // Spawn Enemy starting structures
    const enemyCyardX = enemyBase.x;
    const enemyCyardY = enemyBase.y;
    this.spawnBuilding('enemy', 'cyard', enemyCyardX, enemyCyardY, this.enemyRace);
    this.spawnBuilding('enemy', 'power', enemyCyardX, enemyCyardY - 3, this.enemyRace);

    const ec1 = this.grid.getTileCoords(enemyCyardX - 2, enemyCyardY + 1);
    const ec2 = this.grid.getTileCoords(enemyCyardX - 2, enemyCyardY + 2);

    const eu1 = new Unit(this.generateEntityId(), 'enemy', 'motorcycle', ec1.x, ec1.y, null, null, 0, 0, this.enemyRace);
    const eu2 = new Unit(this.generateEntityId(), 'enemy', 'buggy', ec2.x, ec2.y, null, null, 0, 0, this.enemyRace);
    this.addUnit(eu1);
    this.addUnit(eu2);
  }

  getStartingBaseCoordinates(faction) {
    const base = this.grid.startingBases[faction] || this.grid.startingBases.player;
    return { x: base.x, y: base.y };
  }

  createGrid(options = {}) {
    const dimensions = this.mapDefinition?.dimensions || { width: 320, height: 180 };
    return new Grid(dimensions.width, dimensions.height, 40, this.mapDefinition, options);
  }

  getStorage() {
    try {
      return window.localStorage;
    } catch (error) {
      return null;
    }
  }

  serializeEntity(entity) {
    const record = {
      id: entity.id,
      faction: entity.faction,
      type: entity.type,
      race: entity.race,
      health: entity.health,
      maxHealth: entity.maxHealth,
      selected: entity.selected,
      repairing: entity.repairing,
    };

    if (entity.isBuilding) {
      return {
        ...record,
        gridX: entity.gridX,
        gridY: entity.gridY,
        isUnderConstruction: entity.isUnderConstruction,
        constructionProgress: entity.constructionProgress,
        constructionDuration: entity.constructionDuration,
        buildQueue: entity.buildQueue.map(item => ({ ...item })),
        trainingProgress: entity.trainingProgress,
        turretAngle: entity.turretAngle,
        lastAttackTime: entity.lastAttackTime,
        rallyPoint: entity.rallyPoint ? { ...entity.rallyPoint } : null,
      };
    }

    const unitRecord = {
      ...record,
      x: entity.x,
      y: entity.y,
      speed: entity.speed,
      damage: entity.damage,
      attackRange: entity.attackRange,
      attackCooldown: entity.attackCooldown,
      lastAttackTime: entity.lastAttackTime,
      angle: entity.angle,
      turretAngle: entity.turretAngle,
      state: entity.state,
      path: entity.path.map(tile => ({ x: tile.x, y: tile.y })),
      pathIndex: entity.pathIndex,
      combatTargetId: entity.combatTarget?.id ?? null,
      isStealthed: entity.isStealthed,
      decloakTimer: entity.decloakTimer,
      repathTimer: entity.repathTimer,
    };

    if (entity instanceof Harvester || entity.type === 'harvester') {
      unitRecord.cargo = entity.cargo;
      unitRecord.maxCargo = entity.maxCargo;
      unitRecord.miningRate = entity.miningRate;
      unitRecord.depositRate = entity.depositRate;
      unitRecord.miningTargetTile = entity.miningTargetTile
        ? { x: entity.miningTargetTile.x, y: entity.miningTargetTile.y }
        : null;
      unitRecord.depositTargetRefineryId = entity.depositTargetRefinery?.id ?? null;
    }

    return unitRecord;
  }

  createEntityFromSave(record) {
    let entity;
    if (record.type && record.gridX !== undefined && record.gridY !== undefined) {
      entity = new Building(
        record.id,
        record.faction,
        record.type,
        record.gridX,
        record.gridY,
        this.grid.tileSize,
        this.grid.height,
        normalizeRaceId(record.race)
      );
    } else if (record.type === 'harvester') {
      entity = new Harvester(
        record.id,
        record.faction,
        record.x,
        record.y,
        normalizeRaceId(record.race)
      );
    } else {
      // Use definition defaults in the constructor, then restore the exact
      // saved combat values so race modifiers are not applied twice.
      entity = new Unit(
        record.id,
        record.faction,
        record.type,
        record.x,
        record.y,
        null,
        null,
        0,
        0,
        normalizeRaceId(record.race)
      );
    }

    entity.health = record.health;
    entity.maxHealth = record.maxHealth;
    entity.selected = Boolean(record.selected);
    entity.repairing = Boolean(record.repairing);

    if (entity.isBuilding) {
      entity.isUnderConstruction = Boolean(record.isUnderConstruction);
      entity.constructionProgress = record.constructionProgress ?? 0;
      entity.constructionDuration = record.constructionDuration ?? entity.constructionDuration;
      entity.buildQueue = Array.isArray(record.buildQueue) ? record.buildQueue.map(item => ({ ...item })) : [];
      entity.trainingProgress = record.trainingProgress ?? 0;
      entity.turretAngle = record.turretAngle ?? 0;
      entity.lastAttackTime = record.lastAttackTime ?? 0;
      if (record.rallyPoint) entity.rallyPoint = { ...record.rallyPoint };
      return entity;
    }

    entity.speed = record.speed ?? entity.speed;
    entity.damage = record.damage ?? entity.damage;
    entity.attackRange = record.attackRange ?? entity.attackRange;
    entity.attackCooldown = record.attackCooldown ?? entity.attackCooldown;
    entity.lastAttackTime = record.lastAttackTime ?? 0;
    entity.angle = record.angle ?? 0;
    entity.turretAngle = record.turretAngle ?? entity.angle;
    entity.state = record.state || 'idle';
    entity.path = Array.isArray(record.path)
      ? record.path.map(tile => this.grid.getTile(tile.x, tile.y)).filter(Boolean)
      : [];
    entity.pathIndex = Math.max(0, Math.min(entity.path.length, record.pathIndex ?? 0));
    entity.isStealthed = Boolean(record.isStealthed);
    entity.decloakTimer = record.decloakTimer ?? 0;
    entity.repathTimer = record.repathTimer ?? 0;

    if (entity.type === 'harvester') {
      entity.cargo = record.cargo ?? 0;
      entity.maxCargo = record.maxCargo ?? entity.maxCargo;
      entity.miningRate = record.miningRate ?? entity.miningRate;
      entity.depositRate = record.depositRate ?? entity.depositRate;
      entity.miningTargetTile = record.miningTargetTile
        ? this.grid.getTile(record.miningTargetTile.x, record.miningTargetTile.y)
        : null;
    }

    return entity;
  }

  rebuildOccupancy() {
    for (let x = 0; x < this.grid.width; x++) {
      for (let y = 0; y < this.grid.height; y++) {
        this.grid.tiles[x][y].occupiedBy = null;
        this.grid.tiles[x][y].unitOccupant = null;
        this.grid.tiles[x][y].walkable = this.grid.tiles[x][y].type === 'grass' ||
          this.grid.tiles[x][y].type === 'ore' || this.grid.tiles[x][y].isBridge;
      }
    }

    const entities = [...this.playerEntities, ...this.enemyEntities];
    entities.filter(entity => entity.isBuilding && !entity.isDead).forEach(building => {
      for (let x = building.gridX; x < building.gridX + building.gridWidth; x++) {
        for (let y = building.gridY; y < building.gridY + building.gridHeight; y++) {
          const tile = this.grid.getTile(x, y);
          if (tile) {
            tile.walkable = Boolean(building.def?.isGate) &&
              !Boolean(building.def?.blocksMovement);
            tile.occupiedBy = building;
          }
        }
      }
    });

    entities.filter(entity => !entity.isBuilding && !entity.isDead).forEach(unit => {
      const originTile = this.grid.getTileAtWorld(unit.x, unit.y);
      const tile = this.findNearestFreeUnitTile(originTile, unit);
      if (tile) {
        const coords = this.grid.getTileCoords(tile.x, tile.y);
        const wasRelocated = unit.x !== coords.x || unit.y !== coords.y;
        unit.x = coords.x;
        unit.y = coords.y;
        tile.unitOccupant = unit;
        if (wasRelocated) {
          unit.path = [];
          unit.pathIndex = 0;
          unit.state = 'idle';
        }
      }
    });
  }

  saveGame() {
    if (this.state !== 'playing') {
      this.ui.setStatusText('START A MISSION BEFORE SAVING.');
      return false;
    }

    const storage = this.getStorage();
    if (!storage) {
      this.ui.setStatusText('SAVE UNAVAILABLE: BROWSER STORAGE IS BLOCKED.');
      return false;
    }

    const save = {
      version: SAVE_VERSION,
      mapId: this.mapId,
      playerRace: this.playerRace,
      enemyRace: this.enemyRace,
      campaignId: this.campaignId,
      campaignMissionIndex: this.campaignMissionIndex,
      missionConfig: this.missionConfig,
      state: 'playing',
      currentTime: this.currentTime,
      lastResourceGrowTime: this.lastResourceGrowTime,
      playerCredits: this.playerCredits,
      enemyCredits: this.enemyCredits,
      playerLevelIndex: this.playerLevelIndex,
      enemyLevelIndex: this.enemyLevelIndex,
      nextEntityId: this.nextEntityId,
      camera: { x: this.camera.x, y: this.camera.y },
      dayCycleTime: this.dayCycle.time,
      chemicalClouds: this.chemicalClouds.map(cloud => ({
        x: cloud.x,
        y: cloud.y,
        radius: cloud.radius,
        duration: cloud.duration,
        maxDuration: cloud.maxDuration,
        faction: cloud.faction,
      })),
      grid: serializeGrid(this.grid),
      entities: [...this.playerEntities, ...this.enemyEntities]
        .filter(entity => !entity.isDead)
        .map(entity => this.serializeEntity(entity)),
      ai: {
        state: this.ai.state,
        buildTimer: this.ai.buildTimer,
        buildDuration: this.ai.buildDuration,
        queuedBuilding: this.ai.queuedBuilding,
        targetTile: this.ai.targetTile ? { ...this.ai.targetTile } : null,
        lastTickTime: this.ai.lastTickTime,
        lastAttackTime: this.ai.lastAttackTime,
      },
    };

    try {
      storage.setItem(SAVE_STORAGE_KEY, JSON.stringify(save));
      this.ui.setStatusText('GAME SAVED. MISSION STATE STORED LOCALLY.');
      return true;
    } catch (error) {
      this.ui.setStatusText('SAVE FAILED: BROWSER STORAGE LIMIT REACHED.');
      return false;
    }
  }

  loadGame() {
    const storage = this.getStorage();
    if (!storage) {
      this.ui.setStatusText('LOAD UNAVAILABLE: BROWSER STORAGE IS BLOCKED.');
      return false;
    }

    let save;
    try {
      const raw = storage.getItem(SAVE_STORAGE_KEY);
      if (!raw) {
        this.ui.setStatusText('NO SAVED GAME FOUND.');
        return false;
      }
      save = JSON.parse(raw);
      if (save.version !== SAVE_VERSION || !save.grid || !Array.isArray(save.entities)) {
        throw new Error('Unsupported save format.');
      }
    } catch (error) {
      this.ui.setStatusText('LOAD FAILED: SAVED DATA IS INVALID.');
      return false;
    }

    try {
      this.mapId = getMapById(save.mapId).id;
      this.mapDefinition = getMapById(this.mapId);
      this.playerRace = normalizeRaceId(save.playerRace);
      this.enemyRace = normalizeRaceId(save.enemyRace);
      this.campaignId = save.campaignId || null;
      this.campaignMissionIndex = Number.isInteger(save.campaignMissionIndex)
        ? save.campaignMissionIndex
        : null;
      this.missionConfig = save.missionConfig || {};
      this.playerCredits = save.playerCredits;
      this.enemyCredits = save.enemyCredits;
      this.playerLevelIndex = save.playerLevelIndex;
      this.enemyLevelIndex = save.enemyLevelIndex;
      this.currentTime = save.currentTime || 0;
      this.lastTime = 0;
      this.lastResourceGrowTime = save.lastResourceGrowTime || 0;
      this.nextEntityId = save.nextEntityId || 1;

      this.grid = this.createGrid({ generate: false });
      restoreGrid(this.grid, save.grid);

      this.playerEntities = [];
      this.enemyEntities = [];
      const entitiesById = new Map();
      save.entities.forEach(record => {
        const entity = this.createEntityFromSave(record);
        entitiesById.set(entity.id, entity);
        if (entity.faction === 'player') this.playerEntities.push(entity);
        else this.enemyEntities.push(entity);
      });

      save.entities.forEach(record => {
        const entity = entitiesById.get(record.id);
        if (!entity || entity.isBuilding) return;
        entity.combatTarget = entitiesById.get(record.combatTargetId) || null;
        if (entity.type === 'harvester') {
          entity.depositTargetRefinery = entitiesById.get(record.depositTargetRefineryId) || null;
        }
      });
      this.selectedEntities = [...this.playerEntities, ...this.enemyEntities].filter(entity => entity.selected);
      this.hoveredEntity = null;
      this.projectiles = [];
      this.particles = [];
      this.chemicalClouds = (save.chemicalClouds || []).map(cloud => {
        const restoredCloud = new ChemicalCloud(
          cloud.x,
          cloud.y,
          cloud.radius,
          cloud.duration,
          cloud.faction
        );
        restoredCloud.maxDuration = cloud.maxDuration || restoredCloud.maxDuration;
        return restoredCloud;
      });
      this.clickPings = [];
      this.placementType = null;
      this.placementCost = 0;
      this.enemyBaseDestroyedRemainingCount = null;
      this.fencePlacementStartTile = null;
      this.fencePlacementPreviewTiles = [];
      if (this.input) this.input.isPlacingFence = false;
      this.ui.clearSidebarBuildVisuals();
      this.ui.selectedBuilding = this.selectedEntities.find(entity => entity.faction === 'player' && entity.isBuilding) || null;
      this.ui.hoverTooltip?.classList.add('hidden');
      this.ui.updateRepairButton();
      document.body.style.cursor = 'default';

      this.rebuildOccupancy();

      this.ai.state = save.ai?.state || 'idle';
      this.ai.buildTimer = save.ai?.buildTimer || 0;
      this.ai.buildDuration = save.ai?.buildDuration || 0;
      this.ai.queuedBuilding = save.ai?.queuedBuilding || null;
      this.ai.targetTile = save.ai?.targetTile || null;
      this.ai.lastTickTime = save.ai?.lastTickTime || 0;
      this.ai.lastAttackTime = save.ai?.lastAttackTime || 0;

      if (this.dayCycle) this.dayCycle.time = save.dayCycleTime ?? this.dayCycle.time;
      if (save.camera) {
        this.camera.x = save.camera.x || 0;
        this.camera.y = save.camera.y || 0;
      }
      this.grid.clampCamera(this.camera);

      this.state = 'playing';
      document.getElementById('game-over-overlay')?.classList.add('hidden');
      document.getElementById('faction-selection-overlay')?.classList.add('hidden');
      this.ui.offscreenMinimapDirty = true;
      this.ui.applyRaceLabels();
      this.ui.updateFactionTheme(this.playerRace);
      this.ui.renderMissionAssignment();
      this.ui.setStatusText('GAME LOADED. MISSION RESUMED.');
      return true;
    } catch (error) {
      this.ui.setStatusText('LOAD FAILED: SAVED MAP COULD NOT BE RESTORED.');
      return false;
    }
  }

  restart() {
    this.startGame(this.playerRace, this.enemyRace, this.mapId, this.missionConfig);
  }

  getLevelIndexForFaction(faction) {
    return faction === 'player' ? this.playerLevelIndex : this.enemyLevelIndex;
  }

  getCurrentLevel(faction = 'player') {
    return LEVELS[this.getLevelIndexForFaction(faction)];
  }

  normalizeCredits(amount) {
    return Math.round((amount + Number.EPSILON) * 100) / 100;
  }

  canAffordCredits(faction, cost) {
    const credits = faction === 'player' ? this.playerCredits : this.enemyCredits;
    return this.normalizeCredits(credits) >= cost;
  }

  spendCredits(faction, cost) {
    if (!this.canAffordCredits(faction, cost)) return false;

    if (faction === 'player') {
      this.playerCredits = this.normalizeCredits(this.playerCredits - cost);
    } else {
      this.enemyCredits = this.normalizeCredits(this.enemyCredits - cost);
    }
    return true;
  }

  addCredits(faction, amount) {
    if (faction === 'player') {
      this.playerCredits = this.normalizeCredits(this.playerCredits + amount);
    } else {
      this.enemyCredits = this.normalizeCredits(this.enemyCredits + amount);
    }
  }

  canUseBuilding(faction, type) {
    const def = BUILDING_DEFS[type];
    return Boolean(def) && isUnlockedAt(this.getLevelIndexForFaction(faction), def);
  }

  canUseUnit(faction, type) {
    const def = UNIT_DEFS[type];
    return Boolean(def) && isUnlockedAt(this.getLevelIndexForFaction(faction), def);
  }

  upgradePlayerLevel() {
    const nextLevel = LEVELS[this.playerLevelIndex + 1];
    if (!nextLevel || this.state !== 'playing') return;

    if (!this.canAffordCredits('player', nextLevel.upgradeCost)) {
      this.ui.setStatusText(`INSUFFICIENT CREDITS. ${nextLevel.name.toUpperCase()} LEVEL REQUIRES $${nextLevel.upgradeCost}.`);
      return;
    }

    this.spendCredits('player', nextLevel.upgradeCost);
    this.playerLevelIndex++;
    this.ui.setStatusText(`${nextLevel.name.toUpperCase()} LEVEL UNLOCKED: ${nextLevel.description}.`);
  }

  upgradeEnemyLevel() {
    const nextLevel = LEVELS[this.enemyLevelIndex + 1];
    if (!nextLevel || !this.canAffordCredits('enemy', nextLevel.upgradeCost)) return false;

    this.spendCredits('enemy', nextLevel.upgradeCost);
    this.enemyLevelIndex++;
    return true;
  }

  getRaceForFaction(faction) {
    return faction === 'player' ? this.playerRace : this.enemyRace;
  }

  generateEntityId() {
    return this.nextEntityId++;
  }

  addUnit(unit) {
    const originTile = this.grid.getTileAtWorld(unit.x, unit.y);
    const tile = this.findNearestFreeUnitTile(originTile, unit);
    if (!tile) return false;

    const coords = this.grid.getTileCoords(tile.x, tile.y);
    unit.x = coords.x;
    unit.y = coords.y;

    if (unit.faction === 'player') {
      this.playerEntities.push(unit);
    } else {
      this.enemyEntities.push(unit);
    }

    tile.unitOccupant = unit;
    return true;
  }

  findNearestFreeUnitTile(originTile, unit = null, maxRadius = 8, reservedTiles = null) {
    if (!originTile) return null;

    const isAvailable = (tile) => Boolean(
      tile &&
      tile.walkable &&
      (!tile.unitOccupant || tile.unitOccupant === unit) &&
      !tile.occupiedBy &&
      !reservedTiles?.has(`${tile.x},${tile.y}`)
    );

    if (isAvailable(originTile)) return originTile;

    for (let radius = 1; radius <= maxRadius; radius++) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const tile = this.grid.getTile(originTile.x + dx, originTile.y + dy);
          if (isAvailable(tile)) return tile;
        }
      }
    }

    return null;
  }

  claimUnitTile(unit, tile) {
    if (!tile || !tile.walkable) return false;
    if (tile.unitOccupant && tile.unitOccupant !== unit) return false;
    if (tile.occupiedBy &&
        (!tile.occupiedBy.def?.isGate || tile.occupiedBy.faction !== unit.faction)) return false;
    tile.unitOccupant = unit;
    return true;
  }

  canUnitTraverseSegment(unit, fromX, fromY, toX, toY) {
    const isBlockingBuilding = (tile) => {
      const building = tile?.occupiedBy;
      return Boolean(
        building && building !== unit &&
        (!building.def?.isGate || building.faction !== unit.faction)
      );
    };

    const fromTile = this.grid.getTileAtWorld(fromX, fromY);
    const toTile = this.grid.getTileAtWorld(toX, toY);
    if (fromTile && toTile) {
      const logicalSteps = Math.max(
        Math.abs(toTile.x - fromTile.x),
        Math.abs(toTile.y - fromTile.y)
      );
      for (let step = 1; step <= logicalSteps; step++) {
        const ratio = step / logicalSteps;
        const tile = this.grid.getTile(
          Math.round(fromTile.x + (toTile.x - fromTile.x) * ratio),
          Math.round(fromTile.y + (toTile.y - fromTile.y) * ratio)
        );
        if (isBlockingBuilding(tile)) return false;
      }
    }

    const distance = Math.hypot(toX - fromX, toY - fromY);
    const samples = Math.max(2, Math.ceil(distance / (this.grid.tileSize * 0.2)));

    for (let sample = 1; sample <= samples; sample++) {
      const ratio = sample / samples;
      const x = fromX + (toX - fromX) * ratio;
      const y = fromY + (toY - fromY) * ratio;
      const tile = this.grid.getTileAtWorld(x, y);
      if (isBlockingBuilding(tile)) return false;
    }

    return true;
  }

  spawnBuilding(faction, type, gridX, gridY, race, options = {}) {
    if (!this.canUseBuilding(faction, type)) return null;

    const b = new Building(
      this.generateEntityId(),
      faction,
      type,
      gridX,
      gridY,
      this.grid.tileSize,
      this.grid.height,
      normalizeRaceId(race || this.getRaceForFaction(faction))
    );
    
    const playerBase = this.getStartingBaseCoordinates('player');
    const enemyBase = this.getStartingBaseCoordinates('enemy');
    const isStartingBuilding = (gridX === playerBase.x && gridY === playerBase.y) ||
                               (gridX === playerBase.x && gridY === playerBase.y + 4) ||
                               (gridX === enemyBase.x && gridY === enemyBase.y) ||
                               (gridX === enemyBase.x && gridY === enemyBase.y - 3);
    
    if (isStartingBuilding) {
      b.isUnderConstruction = false;
      b.constructionProgress = 1.0;
    }

    if (faction === 'player') {
      this.playerEntities.push(b);
      if (options?.clearUi !== false) this.ui.clearSidebarBuildVisuals();
    } else {
      this.enemyEntities.push(b);
    }

    for (let x = gridX; x < gridX + b.gridWidth; x++) {
      for (let y = gridY; y < gridY + b.gridHeight; y++) {
        const tile = this.grid.getTile(x, y);
        if (tile) {
          tile.walkable = Boolean(BUILDING_DEFS[type]?.isGate) &&
            !Boolean(BUILDING_DEFS[type]?.blocksMovement);
          tile.occupiedBy = b;
        }
      }
    }

    if (isStartingBuilding && type === 'refinery') {
      b.onBuildComplete(this);
    }

    return b;
  }

  getFenceChainTiles(faction, startTile, endTile = startTile, maxPieces = 5) {
    if (!startTile || !endTile) return [];

    const startBuilding = startTile.occupiedBy;
    const startsFromExistingFence = Boolean(
      startBuilding?.isBuilding &&
      startBuilding.type === 'fence' &&
      startBuilding.faction === faction &&
      !startBuilding.isDead
    );
    const deltaX = endTile.x - startTile.x;
    const deltaY = endTile.y - startTile.y;
    const distance = Math.max(Math.abs(deltaX), Math.abs(deltaY));
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);
    let directionX = 0;
    let directionY = 0;
    if (absDeltaX > absDeltaY * 1.8) {
      directionX = Math.sign(deltaX);
    } else if (absDeltaY > absDeltaX * 1.8) {
      directionY = Math.sign(deltaY);
    } else {
      // Snap the drag to the nearest 45-degree grid direction.
      directionX = Math.sign(deltaX);
      directionY = Math.sign(deltaY);
    }
    const requestedLength = startsFromExistingFence
      ? Math.max(1, Math.min(maxPieces, distance))
      : Math.max(1, Math.min(maxPieces, distance + 1));
    const chain = [];

    for (let offset = 0; offset < requestedLength; offset++) {
      const tile = this.grid.getTile(
        startTile.x + directionX * (offset + (startsFromExistingFence ? 1 : 0)),
        startTile.y + directionY * (offset + (startsFromExistingFence ? 1 : 0))
      );
      if (!tile || !this.validateBuildingPlacement(faction, tile.x, tile.y, 1, 1)) break;
      chain.push(tile);
    }
    return chain;
  }

  validateBuildingPlacement(faction, gridX, gridY, width, height) {
    if (this.placementType && !this.canUseBuilding(faction, this.placementType)) {
      return false;
    }

    if (gridX < 0 || gridX + width > this.grid.width || gridY < 0 || gridY + height > this.grid.height) {
      return false;
    }

    for (let x = gridX; x < gridX + width; x++) {
      for (let y = gridY; y < gridY + height; y++) {
        const tile = this.grid.getTile(x, y);
        if (!tile || !tile.walkable || tile.occupiedBy || tile.unitOccupant || tile.type === 'ore' || tile.type === 'water') {
          return false;
        }
      }
    }

    const friendlyBuildings = (faction === 'player' ? this.playerEntities : this.enemyEntities)
      .filter(ent => ent.isBuilding && !ent.isDead);

    if (friendlyBuildings.length === 0) return true;

    let nearBase = false;
    const maxRadius = 8;
    for (const b of friendlyBuildings) {
      const bxMin = b.gridX - maxRadius;
      const bxMax = b.gridX + b.gridWidth + maxRadius;
      const byMin = b.gridY - maxRadius;
      const byMax = b.gridY + b.gridHeight + maxRadius;

      if (gridX >= bxMin && gridX <= bxMax && gridY >= byMin && gridY <= byMax) {
        nearBase = true;
        break;
      }
    }

    return nearBase;
  }

  isLowPower(faction) {
    let powerGen = 0;
    let powerDraw = 0;
    const list = faction === 'player' ? this.playerEntities : this.enemyEntities;

    list.forEach(ent => {
      if (ent.isBuilding && !ent.isUnderConstruction && !ent.isDead) {
        powerGen += ent.powerProduction;
        powerDraw += ent.powerUsage;
      }
    });

    return powerDraw > powerGen;
  }

  createClickPing(x, y) {
    this.clickPings.push({
      x,
      y,
      radius: 2,
      maxRadius: 20,
      life: 0.35,
      maxLife: 0.35
    });
  }

  triggerGameOver(status) {
    this.state = status; // 'victory' or 'defeat'
    
    const overlay = document.getElementById('game-over-overlay');
    const title = document.getElementById('game-over-title');
    const desc = document.getElementById('game-over-status');

    if (overlay && title && desc) {
      overlay.classList.remove('hidden');
      const nextMissionBtn = document.getElementById('next-mission-btn');
      if (status === 'victory') {
        const campaign = getCampaign(this.campaignId);
        const isCampaignComplete = !campaign || this.campaignMissionIndex === null ||
          this.campaignMissionIndex >= campaign.missions.length - 1;
        title.innerText = campaign && !isCampaignComplete ? 'MISSION COMPLETE' :
          (campaign ? 'CAMPAIGN VICTORY' : 'MISSION ACCOMPLISHED');
        title.classList.remove('defeat');
        desc.innerText = campaign
          ? (isCampaignComplete
            ? `${campaign.name} COMPLETE. THE REGION IS SECURED.`
            : `ALL ENEMY FORCES ELIMINATED. ${campaign.missions[this.campaignMissionIndex + 1].title} AWAITS.`)
          : "ALL ENEMY FORCES ELIMINATED. REGION SECURED.";
        if (nextMissionBtn) {
          nextMissionBtn.classList.toggle('hidden', !campaign || isCampaignComplete);
          nextMissionBtn.innerText = campaign && !isCampaignComplete
            ? `NEXT MISSION: ${campaign.missions[this.campaignMissionIndex + 1].title}`
            : 'NEXT MISSION';
        }
      } else {
        title.innerText = "MISSION FAILED";
        title.classList.add('defeat');
        desc.innerText = "YOUR BASE AND FORCES HAVE BEEN TOTALLY DESTROYED.";
        if (nextMissionBtn) nextMissionBtn.classList.add('hidden');
      }
    }
  }

  loop(time) {
    this.currentTime = time / 1000;
    if (this.lastTime === 0) this.lastTime = time;
    
    let dt = (time - this.lastTime) / 1000;
    this.lastTime = time;

    if (dt > 0.1) dt = 0.1;

    this.fpsFrames++;
    if (time - this.fpsLastUpdate > 1000) {
      this.fps = (this.fpsFrames * 1000) / (time - this.fpsLastUpdate);
      this.fpsFrames = 0;
      this.fpsLastUpdate = time;
    }

    // Skirmish updates
    this.update(dt);
    this.draw();

    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    // 1. Camera key panning always active so player can view the map
    this.input.updateCamera(dt);

    if (this.state !== 'playing') {
      // Freeze simulation loop on game over, only update UI ticks
      this.ui.update(dt);
      return;
    }

    // 2. Victory / Defeat trigger conditions evaluation
    const livePlayerEntities = this.playerEntities.filter(entity => !entity.isDead);
    const liveEnemyEntities = this.enemyEntities.filter(entity => !entity.isDead);
    const liveEnemyBuildings = liveEnemyEntities.filter(entity => entity.isBuilding);
    const liveEnemyUnits = liveEnemyEntities.filter(entity => !entity.isBuilding);
    const playerAlive = livePlayerEntities.length > 0;

    if (!playerAlive) {
      this.triggerGameOver('defeat');
      return;
    }

    const objectiveType = this.getMissionObjectiveType();
    if (isObjectiveComplete(objectiveType, liveEnemyBuildings.length, liveEnemyUnits.length)) {
      this.triggerGameOver('victory');
      return;
    }

    if (liveEnemyBuildings.length === 0 && liveEnemyUnits.length > 0) {
      if (this.enemyBaseDestroyedRemainingCount !== liveEnemyUnits.length) {
        const unitsByType = liveEnemyUnits.reduce((counts, unit) => {
          counts[unit.type] = (counts[unit.type] || 0) + 1;
          return counts;
        }, {});
        const remaining = Object.entries(unitsByType)
          .map(([type, count]) => `${count} ${type.replaceAll('_', ' ')}`)
          .join(', ');
        this.ui.setStatusText(
          `ENEMY BASE DESTROYED. ${liveEnemyUnits.length} ENEMY UNIT${liveEnemyUnits.length === 1 ? '' : 'S'} REMAIN: ${remaining}.`
        );
        this.enemyBaseDestroyedRemainingCount = liveEnemyUnits.length;
      }
    } else if (liveEnemyBuildings.length > 0) {
      this.enemyBaseDestroyedRemainingCount = null;
    }

    // 3. Tiberium resource spread tick
    if (this.currentTime - this.lastResourceGrowTime > 5.0) {
      const elapsedSinceResourceTick = this.currentTime - this.lastResourceGrowTime;
      this.grid.regrowResources(elapsedSinceResourceTick);
      this.lastResourceGrowTime = this.currentTime;
    }

    // 4. Temporarily unlock mobile unit grid references for dynamic moving calculations
    const clearUnitOccupancies = (entities) => {
      entities.forEach(ent => {
        if (!ent.isDead && !ent.isBuilding && ent.state === 'moving') {
          const tile = this.grid.getTileAtWorld(ent.x, ent.y);
          if (tile && tile.unitOccupant === ent) {
            tile.unitOccupant = null;
          }
        }
      });
    };
    clearUnitOccupancies(this.playerEntities);
    clearUnitOccupancies(this.enemyEntities);

    // Update Entities
    this.playerEntities.forEach(ent => ent.update(dt, this));
    this.enemyEntities.forEach(ent => ent.update(dt, this));

    // Player repairs run after entity updates so units remain stationary while
    // they are being serviced and credit costs are applied consistently.
    this.updateRepairs(dt);

    // Relock mobile units grid reference
    const setUnitOccupancies = (entities) => {
      entities.forEach(ent => {
        if (!ent.isDead && !ent.isBuilding) {
          const tile = this.grid.getTileAtWorld(ent.x, ent.y);
          if (tile && (!tile.unitOccupant || tile.unitOccupant === ent)) {
            tile.unitOccupant = ent;
          } else if (tile && tile.unitOccupant !== ent) {
            const freeTile = this.findNearestFreeUnitTile(tile, ent);
            if (freeTile) {
              const coords = this.grid.getTileCoords(freeTile.x, freeTile.y);
              ent.x = coords.x;
              ent.y = coords.y;
              freeTile.unitOccupant = ent;
              ent.path = [];
              ent.pathIndex = 0;
              ent.state = 'idle';
            }
          }
        }
      });
    };
    setUnitOccupancies(this.playerEntities);
    setUnitOccupancies(this.enemyEntities);

    // Projectiles & Particles
    this.projectiles.forEach(p => p.update(dt, this));
    this.projectiles = this.projectiles.filter(p => !p.isDead);

    this.chemicalClouds.forEach(c => c.update(dt, this));
    this.chemicalClouds = this.chemicalClouds.filter(c => !c.isDead);

    this.particles.forEach(p => p.update(dt));
    this.particles = this.particles.filter(p => !p.isDead);

    // Click feedback Pings
    this.clickPings.forEach(p => {
      p.life -= dt;
      p.radius = p.maxRadius * (1 - p.life / p.maxLife);
    });
    this.clickPings = this.clickPings.filter(p => p.life > 0);

    // Clear dead references and spawn explosions
    const cleanDeadList = (entities) => {
      return entities.filter(ent => {
        if (ent.isDead) {
          if (ent.isBuilding) {
            for (let x = ent.gridX; x < ent.gridX + ent.gridWidth; x++) {
              for (let y = ent.gridY; y < ent.gridY + ent.gridHeight; y++) {
                const tile = this.grid.getTile(x, y);
                if (tile && tile.occupiedBy === ent) {
                  tile.walkable = tile.type === 'grass' || tile.type === 'ore';
                  tile.occupiedBy = null;
                }
              }
            }
          } else {
            const tile = this.grid.getTileAtWorld(ent.x, ent.y);
            if (tile && tile.unitOccupant === ent) {
              tile.unitOccupant = null;
            }
          }
          this.particles.push(new ExplosionParticle(ent.x, ent.y, ent.isBuilding ? 30 : 12));
          return false;
        }
        return true;
      });
    };
    this.playerEntities = cleanDeadList(this.playerEntities);
    this.enemyEntities = cleanDeadList(this.enemyEntities);
    this.selectedEntities = this.selectedEntities.filter(ent => !ent.isDead);

    // AI tick
    this.ai.update(dt);

    // Day/night cycle
    this.dayCycle.update(dt);

    // UI Panel update
    this.ui.update(dt);
  }

  updateRepairs(dt) {
    this.playerEntities.forEach(entity => {
      if (!entity.repairing || entity.isDead || entity.isUnderConstruction || entity.health >= entity.maxHealth) {
        if (entity.health >= entity.maxHealth || entity.isDead || entity.isUnderConstruction) {
          entity.repairing = false;
        }
        return;
      }

      const healthPerSecond = entity.isBuilding ? 42 : 30;
      const creditsPerSecond = entity.isBuilding ? 8 : 5;
      const missingHealth = entity.maxHealth - entity.health;
      const affordableHealth = (this.playerCredits / creditsPerSecond) * healthPerSecond;
      const restoredHealth = Math.min(missingHealth, healthPerSecond * dt, affordableHealth);

      if (restoredHealth <= 0) {
        entity.repairing = false;
        return;
      }

      const cost = (restoredHealth / healthPerSecond) * creditsPerSecond;
      if (!this.spendCredits('player', cost)) {
        entity.repairing = false;
        return;
      }

      entity.health = Math.min(entity.maxHealth, entity.health + restoredHealth);
      if (entity.health >= entity.maxHealth) entity.repairing = false;
    });
  }

  generateStars(count) {
    const stars = [];
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random() * 0.65,
        size: 0.5 + Math.random() * 1.5,
        twinkle: Math.random() * Math.PI * 2,
      });
    }
    return stars;
  }

  drawSky(ambient) {
    const grad = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    grad.addColorStop(0, ambient.skyTop);
    grad.addColorStop(1, ambient.skyBottom);
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (ambient.stars > 0.05) {
      this.stars.forEach(star => {
        const sx = star.x * this.canvas.width;
        const sy = star.y * this.canvas.height;
        const alpha = ambient.stars * (0.4 + 0.6 * Math.abs(Math.sin(this.currentTime * 1.5 + star.twinkle)));
        this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        this.ctx.fillRect(sx, sy, star.size, star.size);
      });
    }

    if (ambient.ambient > 0.4) {
      const sunX = ambient.sunX * this.canvas.width;
      const sunY = ambient.sunY * this.canvas.height;
      const sunGrad = this.ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 60);
      sunGrad.addColorStop(0, `rgba(255, 240, 180, ${0.25 * ambient.ambient})`);
      sunGrad.addColorStop(1, 'rgba(255, 200, 100, 0)');
      this.ctx.fillStyle = sunGrad;
      this.ctx.fillRect(sunX - 60, sunY - 60, 120, 120);
    }
  }

  draw() {
    const ambient = this.dayCycle.getAmbient();

    // 1. Sky and celestial bodies
    this.drawSky(ambient);

    // 2. Terrain with day-cycle tinting
    this.grid.draw(this.ctx, this.camera, this.currentTime, ambient, this.dayCycle);

    // 2. Draw movement click feedback pings (drawn flat as ellipses)
    this.ctx.lineWidth = 1.5;
    this.clickPings.forEach(p => {
      const sx = p.x - this.camera.x;
      const sy = p.y - this.camera.y;
      this.ctx.strokeStyle = `rgba(0, 255, 102, ${p.life / p.maxLife})`;
      this.ctx.beginPath();
      this.ctx.ellipse(sx, sy, p.radius, p.radius * 0.5, 0, 0, Math.PI * 2);
      this.ctx.stroke();
    });

    // 3. Draw the classic diamond-shaped building placement ghost
    if (this.placementType) {
      const tile = this.grid.getTileAtWorld(this.input.worldMouseX, this.input.worldMouseY);
      if (tile) {
        if (this.placementType === 'fence') {
          this.fencePlacementPreviewTiles.forEach((previewTile) => {
            const coords = this.grid.getTileCoords(previewTile.x, previewTile.y);
            const sx = coords.x - this.camera.x;
            const sy = coords.y - this.camera.y;
            this.ctx.fillStyle = 'rgba(0, 255, 102, 0.22)';
            this.ctx.strokeStyle = 'oklch(0.8 0.22 142)';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(sx, sy - this.grid.halfH);
            this.ctx.lineTo(sx + this.grid.halfW, sy);
            this.ctx.lineTo(sx, sy + this.grid.halfH);
            this.ctx.lineTo(sx - this.grid.halfW, sy);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
          });
        } else {
          const isValid = this.validateBuildingPlacement('player', tile.x, tile.y, this.ghostWTiles, this.ghostHTiles);

          // Floor corners of the structure ghost.
          const getScreenCoords = (gx, gy) => {
            const halfW = this.grid.halfW;
            const halfH = this.grid.halfH;
            const rowOffset = Math.abs(Math.floor(tile.y)) % 2 === 1 ? halfW : 0;
            const originX = this.grid.mapOriginX + tile.x * this.grid.tileWidth + rowOffset;
            const originY = tile.y * halfH;
            const localX = gx - tile.x;
            const localY = gy - tile.y;
            const coords = {
              x: originX + (localX - localY) * halfW,
              y: originY + (localX + localY) * halfH,
            };
            return { x: coords.x - this.camera.x, y: coords.y - this.camera.y };
          };

          const ptTop = getScreenCoords(tile.x, tile.y);
          const ptRight = getScreenCoords(tile.x + this.ghostWTiles, tile.y);
          const ptBottom = getScreenCoords(tile.x + this.ghostWTiles, tile.y + this.ghostHTiles);
          const ptLeft = getScreenCoords(tile.x, tile.y + this.ghostHTiles);

          this.ctx.fillStyle = isValid ? 'rgba(0, 255, 102, 0.22)' : 'rgba(255, 30, 30, 0.22)';
          this.ctx.strokeStyle = isValid ? 'oklch(0.8 0.22 142)' : 'oklch(0.62 0.22 25)';
          this.ctx.lineWidth = 2;

          this.ctx.beginPath();
          this.ctx.moveTo(ptTop.x, ptTop.y);
          this.ctx.lineTo(ptRight.x, ptRight.y);
          this.ctx.lineTo(ptBottom.x, ptBottom.y);
          this.ctx.lineTo(ptLeft.x, ptLeft.y);
          this.ctx.closePath();
          this.ctx.fill();
          this.ctx.stroke();
        }
      }
    }

    // 4. Collected Depth-Sorted rendering: draw units and buildings back-to-front
    const drawables = [...this.playerEntities, ...this.enemyEntities];
    // Sort by projected Y coordinate
    drawables.sort((a, b) => a.y - b.y);

    drawables.forEach(ent => ent.draw(this.ctx, this.camera, this));

    // 5. Draw flying Projectiles (always on top of entities)
    this.projectiles.forEach(p => p.draw(this.ctx, this.camera, this));

    // 5.5. Draw chemical lingering clouds
    this.chemicalClouds.forEach(c => c.draw(this.ctx, this.camera, this));

    // 6. Draw impact particles
    this.particles.forEach(p => p.draw(this.ctx, this.camera));

    // 7. Draw screen-space drag-select box
    this.input.draw(this.ctx);

    // 8. Atmospheric overlay (dusk/night tint)
    if (ambient.overlay > 0.01) {
      this.ctx.fillStyle = `rgba(8, 12, 32, ${ambient.overlay})`;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
}

class ExplosionParticle {
  constructor(x, y, radius) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.maxLife = 0.4;
    this.life = 0.4;
    this.isDead = false;
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) this.isDead = true;
  }
  draw(ctx, camera) {
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    const ratio = this.life / this.maxLife;

    ctx.save();
    
    ctx.shadowColor = '#ff3300';
    ctx.shadowBlur = 12 * ratio;
    
    ctx.beginPath();
    ctx.ellipse(sx, sy, this.radius * (1.8 - ratio), this.radius * 0.9 * (1.8 - ratio), 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, ${Math.floor(80 + 175 * ratio)}, 0, ${ratio})`;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgba(80, 80, 80, ${ratio * 0.5})`;
    ctx.beginPath();
    ctx.ellipse(sx + 3, sy - 2, this.radius * (1.2 - ratio), this.radius * 0.6 * (1.2 - ratio), 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

class ChemicalCloud {
  constructor(x, y, radius, duration, faction) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.duration = duration;
    this.maxDuration = duration;
    this.faction = faction;
    this.isDead = false;
  }
  update(dt, game) {
    this.duration -= dt;
    if (this.duration <= 0) {
      this.isDead = true;
      return;
    }
    const targets = this.faction === 'player' ? game.enemyEntities : game.playerEntities;
    targets.forEach(ent => {
      if (ent.isDead || ent.isBuilding || ent.isFlying) return;
      if (ent.race === 'nod') return; // Nod units are immune to tiberium/chemical gas
      
      const dist = Math.hypot(ent.x - this.x, ent.y - this.y);
      if (dist <= this.radius) {
        ent.takeDamage(32 * dt);
      }
    });
  }
  draw(ctx, camera, game) {
    const screenX = this.x - camera.x;
    const screenY = this.y - camera.y;
    const ratio = this.duration / this.maxDuration;
    
    ctx.save();
    ctx.shadowColor = '#69f0ae';
    ctx.shadowBlur = 15 * ratio;
    
    const circlesCount = 5;
    for (let i = 0; i < circlesCount; i++) {
      const seed = i * 4.3;
      const pulseX = Math.sin(game.currentTime * 2 + seed) * 8;
      const pulseY = Math.cos(game.currentTime * 1.5 + seed) * 4;
      const r = this.radius * (0.3 + 0.5 * ratio) + Math.sin(game.currentTime + seed) * 5;
      
      ctx.fillStyle = `rgba(46, 125, 50, ${0.15 * ratio})`;
      ctx.beginPath();
      ctx.ellipse(screenX + pulseX, screenY + pulseY, r, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = `rgba(105, 240, 174, ${0.08 * ratio})`;
      ctx.beginPath();
      ctx.ellipse(screenX - pulseX * 0.7, screenY - pulseY * 0.7, r * 0.8, r * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  }
}

window.addEventListener('load', () => {
  window.game = new Game();
});
