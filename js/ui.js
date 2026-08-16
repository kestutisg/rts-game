/**
 * UI Manager for Tiberian Odyssey (Staggered 2.5D Upgrade)
 * Handles HUD bindings, building placements, music state updates,
 * radar network projection, and dynamic hovering tooltips.
 */

import { BUILDING_DEFS, LEVELS, UNIT_DEFS } from './tech.js';
import { applyRaceBuildingStats, getRace, getRaceBuildingName, getRaceUnitName } from './races.js';
import { BIOMES, getMinimapGroundColor } from './biomes.js';
import { updateAllCardBackgrounds } from './card-art.js';
import { DEFAULT_MAP_ID, MAPS } from './maps/index.js';

export class UIManager {
  constructor(game) {
    this.game = game;

    // Cache DOM elements
    this.creditsDisplay = document.getElementById('credits-amount');
    this.powerRatio = document.getElementById('power-ratio');
    this.powerBarFill = document.getElementById('power-bar-fill');
    this.fpsCounter = document.getElementById('fps-counter');
    this.timePhase = document.getElementById('time-phase');
    this.techLevel = document.getElementById('tech-level');
    this.playerRaceEl = document.getElementById('player-race');
    this.enemyRaceEl = document.getElementById('enemy-race');
    this.sidebarFactionTitle = document.getElementById('sidebar-faction-title');
    this.sidebarFactionTagline = document.getElementById('sidebar-faction-tagline');
    this.levelName = document.getElementById('level-name');
    this.levelDescription = document.getElementById('level-description');
    this.upgradeLevelBtn = document.getElementById('upgrade-level');
    this.statusText = document.getElementById('status-text');
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.offscreenMinimapCanvas = null;
    this.offscreenMinimapDirty = true;

    this.tabBuildings = document.getElementById('tab-buildings');
    this.tabUnits = document.getElementById('tab-units');
    this.cancelBuildButton = document.getElementById('cancel-build');
    this.repairButton = document.getElementById('repair-selected');
    this.buildingsGrid = document.getElementById('buildings-grid');
    this.unitsGrid = document.getElementById('units-grid');

    // Sidebar Building Construction variables
    this.sidebarBuilding = null;
    this.sidebarProgress = 0;
    this.sidebarCost = 0;
    this.sidebarDuration = 0;
    this.sidebarState = 'idle';

    this.selectedBuilding = null;
    this.selectedMapId = DEFAULT_MAP_ID;

    // Create dynamic Hover Tooltip element
    this.hoverTooltip = document.createElement('div');
    this.hoverTooltip.id = 'structure-tooltip';
    this.hoverTooltip.className = 'structure-label hidden';
    document.body.appendChild(this.hoverTooltip);

    this.initListeners();
    this.initMinimapListeners();
    this.applyRaceLabels();
  }

  applyRaceLabels() {
    const playerRace = getRace(this.game.playerRace);
    const enemyRace = getRace(this.game.enemyRace);

    if (this.sidebarFactionTitle) {
      this.sidebarFactionTitle.innerText = `${playerRace.name} COMMAND`;
    }
    if (this.sidebarFactionTagline) {
      this.sidebarFactionTagline.innerText = playerRace.tagline;
    }
    if (this.playerRaceEl) {
      this.playerRaceEl.innerText = playerRace.name;
      this.playerRaceEl.className = `hud-value race-${playerRace.id}`;
    }
    if (this.enemyRaceEl) {
      this.enemyRaceEl.innerText = enemyRace.name;
      this.enemyRaceEl.className = `hud-value race-${enemyRace.id}`;
    }

    Object.keys(BUILDING_DEFS).forEach(type => {
      const btn = document.getElementById(`build-${type}`);
      if (!btn) return;
      const nameEl = btn.querySelector('.card-name');
      if (nameEl) nameEl.innerText = getRaceBuildingName(this.game.playerRace, type);
      btn.title = `${getRaceBuildingName(this.game.playerRace, type)}: ${BUILDING_DEFS[type].name}`;

      const powerEl = btn.querySelector('.card-power');
      if (powerEl) {
        const effectiveDef = applyRaceBuildingStats(this.game.playerRace, type, BUILDING_DEFS[type]);
        const power = effectiveDef.powerProduction - effectiveDef.powerUsage;
        powerEl.innerText = power === 0 ? '+0 MW' : `${power > 0 ? '+' : ''}${power} MW`;
      }
    });

    Object.keys(UNIT_DEFS).forEach(type => {
      const btn = document.getElementById(`train-${type}`);
      if (!btn) return;
      const nameEl = btn.querySelector('.card-name');
      if (nameEl) nameEl.innerText = getRaceUnitName(this.game.playerRace, type);
      btn.title = `${getRaceUnitName(this.game.playerRace, type)}: ${UNIT_DEFS[type].name}`;
    });

    // Update dynamic background card artwork matching player race
    updateAllCardBackgrounds(this.game.playerRace);
  }

  updateFactionTheme(raceId) {
    const root = document.documentElement;
    if (raceId === 'nod') {
      root.style.setProperty('--accent-cyan', 'oklch(0.62 0.22 25)'); // Crimson Red
      root.style.setProperty('--accent-cyan-glow', 'oklch(0.62 0.22 25 / 0.4)');
      root.style.setProperty('--panel-border', 'oklch(0.3 0.05 25 / 0.6)');
    } else {
      root.style.setProperty('--accent-cyan', 'oklch(0.78 0.18 195)'); // Cyan Blue
      root.style.setProperty('--accent-cyan-glow', 'oklch(0.78 0.18 195 / 0.4)');
      root.style.setProperty('--panel-border', 'oklch(0.3 0.05 200 / 0.6)');
    }
  }

  initListeners() {
    this.tabBuildings.addEventListener('click', () => {
      this.tabBuildings.classList.add('active');
      this.tabUnits.classList.remove('active');
      this.buildingsGrid.classList.remove('hidden');
      this.unitsGrid.classList.add('hidden');
    });

    this.tabUnits.addEventListener('click', () => {
      this.tabUnits.classList.add('active');
      this.tabBuildings.classList.remove('active');
      this.unitsGrid.classList.remove('hidden');
      this.buildingsGrid.classList.add('hidden');
    });

    Object.entries(BUILDING_DEFS).forEach(([type, def]) => {
      const btn = document.getElementById(`build-${type}`);
      if (btn) {
        btn.addEventListener('click', () => this.startSidebarBuild(type, def.cost, def.duration));
      }
    });

    if (this.cancelBuildButton) {
      this.cancelBuildButton.addEventListener('click', () => this.cancelSidebarBuild());
    }

    if (this.repairButton) {
      this.repairButton.addEventListener('click', () => this.toggleRepairSelected());
    }

    Object.keys(UNIT_DEFS).forEach(type => {
      const btn = document.getElementById(`train-${type}`);
      if (btn) {
        btn.addEventListener('click', () => this.queueUnitTraining(type));
      }
    });

    if (this.upgradeLevelBtn) {
      this.upgradeLevelBtn.addEventListener('click', () => this.game.upgradePlayerLevel());
    }

    // Faction startup selection cards
    const cardGdi = document.getElementById('card-gdi');
    const cardNod = document.getElementById('card-nod');
    let selectedPlayerRace = 'gdi';

    if (cardGdi && cardNod) {
      cardGdi.addEventListener('click', () => {
        cardGdi.classList.add('selected');
        cardNod.classList.remove('selected');
        selectedPlayerRace = 'gdi';
        this.syncEnemyRaceOptions(selectedPlayerRace);
      });

      cardNod.addEventListener('click', () => {
        cardNod.classList.add('selected');
        cardGdi.classList.remove('selected');
        selectedPlayerRace = 'nod';
        this.syncEnemyRaceOptions(selectedPlayerRace);
      });
    }

    // Battlefield selection
    const mapCards = document.querySelectorAll('.map-card');
    const mapDescription = document.getElementById('selected-map-description');
    mapCards.forEach(card => {
      card.addEventListener('click', () => {
        this.selectedMapId = card.dataset.map || DEFAULT_MAP_ID;
        mapCards.forEach(otherCard => {
          const selected = otherCard === card;
          otherCard.classList.toggle('selected', selected);
          otherCard.setAttribute('aria-pressed', String(selected));
        });

        const map = MAPS.find(candidate => candidate.id === this.selectedMapId);
        if (mapDescription && map) mapDescription.innerText = map.description;
      });
    });

    // Faction launch button
    const launchBtn = document.getElementById('launch-btn');
    if (launchBtn) {
      launchBtn.addEventListener('click', () => {
        const enemySelect = document.getElementById('enemy-faction-select');
        const selectedEnemyRace = enemySelect ? enemySelect.value : 'nod';
        this.game.startGame(selectedPlayerRace, selectedEnemyRace, this.selectedMapId);
      });
    }

    this.syncEnemyRaceOptions(selectedPlayerRace);
  }

  initMinimapListeners() {
    if (!this.minimapCanvas) return;

    this.isMinimapDragging = false;
    this.minimapPings = [];

    this.minimapCanvas.addEventListener('mousedown', (e) => {
      if (this.game.state !== 'playing') return;
      this.isMinimapDragging = true;
      this.jumpCameraToMinimap(e, true);
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isMinimapDragging && this.game.state === 'playing') {
        this.jumpCameraToMinimap(e, false);
      }
    });

    window.addEventListener('mouseup', () => {
      this.isMinimapDragging = false;
    });
  }

  getMinimapLayout() {
    const canvasWidth = this.minimapCanvas.width;
    const canvasHeight = this.minimapCanvas.height;
    const mapAspect = this.game.grid.width / this.game.grid.height;
    const padding = 4;
    const availableWidth = Math.max(1, canvasWidth - padding * 2);
    const availableHeight = Math.max(1, canvasHeight - padding * 2);

    let width = availableWidth;
    let height = width / mapAspect;
    if (height > availableHeight) {
      height = availableHeight;
      width = height * mapAspect;
    }

    return {
      x: (canvasWidth - width) / 2,
      y: (canvasHeight - height) / 2,
      width,
      height,
      cellWidth: width / this.game.grid.width,
      cellHeight: height / this.game.grid.height,
    };
  }

  getMinimapGridPosition(gridX, gridY, layout, tileCenter = false) {
    const offset = tileCenter ? 0.5 : 0;
    const rowOffset = Math.abs(Math.floor(gridY)) % 2 === 1 ? 0.5 : 0;
    const mapColumns = this.game.grid.width + 0.5;
    return {
      x: layout.x + ((gridX + offset + rowOffset) / mapColumns) * layout.width,
      y: layout.y + ((gridY + offset) / this.game.grid.height) * layout.height,
    };
  }

  getGridPositionAtWorld(worldX, worldY) {
    const grid = this.game.grid;
    const tile = grid.getTileAtWorld(worldX, worldY);
    if (tile) return { x: tile.x, y: tile.y };

    return {
      x: Math.round((worldX - grid.mapOriginX) / grid.tileWidth),
      y: Math.round(worldY / grid.halfH) - 1,
    };
  }

  getMinimapEntityPosition(entity, layout) {
    if (entity.isBuilding) {
      return this.getMinimapGridPosition(
        entity.gridX + entity.gridWidth / 2,
        entity.gridY + entity.gridHeight / 2,
        layout
      );
    }

    const gridPosition = this.getGridPositionAtWorld(entity.x, entity.y);
    return this.getMinimapGridPosition(gridPosition.x, gridPosition.y, layout, true);
  }

  jumpCameraToMinimap(e, createPing = false) {
    if (!this.minimapCanvas || !this.game.grid) return;

    const rect = this.minimapCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const mouseX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const mouseY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    const canvasX = (mouseX / rect.width) * this.minimapCanvas.width;
    const canvasY = (mouseY / rect.height) * this.minimapCanvas.height;
    const layout = this.getMinimapLayout();

    // The radar uses the same staggered row coordinates as the battlefield,
    // so clicks are converted through tile coordinates before becoming world points.
    const normX = Math.max(0, Math.min(1, (canvasX - layout.x) / layout.width));
    const normY = Math.max(0, Math.min(1, (canvasY - layout.y) / layout.height));

    const targetWorld = this.game.grid.getTileCoords(
      normX * this.game.grid.width,
      normY * this.game.grid.height
    );

    const cam = this.game.camera;

    cam.x = targetWorld.x - cam.width / 2;
    cam.y = targetWorld.y - cam.height / 2;

    // Keep the viewport inside the staggered ground plane.
    this.game.grid.clampCamera(cam);

    if (createPing) {
      this.minimapPings.push({ x: canvasX, y: canvasY, radius: 2, alpha: 1.0 });
    }

    if (this.game.input) {
      this.game.input.updateWorldCoordinates();
      this.game.input.updateHoveredEntity();
    }
  }

  syncEnemyRaceOptions(playerRace) {
    const enemySelect = document.getElementById('enemy-faction-select');
    if (!enemySelect) return;

    [...enemySelect.options].forEach(option => {
      option.disabled = option.value === playerRace;
    });

    if (enemySelect.value === playerRace) {
      const opposingOption = [...enemySelect.options].find(option => !option.disabled);
      if (opposingOption) enemySelect.value = opposingOption.value;
    }
  }

  setStatusText(msg) {
    this.statusText.innerText = msg.toUpperCase();
  }

  onBuildingSelected(building) {
    this.onSelectionChanged(building ? [building] : []);
  }

  onSelectionChanged(entities = []) {
    const playerEntities = entities.filter(entity => entity.faction === 'player' && !entity.isDead);
    this.selectedBuilding = playerEntities.find(entity => entity.isBuilding) || null;

    if (playerEntities.length === 1) {
      const entity = playerEntities[0];
      const name = entity.isBuilding
        ? getRaceBuildingName(entity.race, entity.type).toUpperCase()
        : getRaceUnitName(entity.race, entity.type).toUpperCase();
      this.setStatusText(`${name} SELECTED. HEALTH: ${Math.floor(entity.health)}/${entity.maxHealth}`);
    } else if (playerEntities.length > 1) {
      this.setStatusText(`${playerEntities.length} UNITS SELECTED.`);
    } else {
      this.setStatusText("SYSTEM ONLINE. STANDBY FOR COMMAND.");
    }

    this.updateRepairButton();
  }

  getRepairableSelection() {
    return this.game.selectedEntities.filter(entity =>
      entity.faction === 'player' &&
      !entity.isDead &&
      !entity.isUnderConstruction &&
      entity.health < entity.maxHealth
    );
  }

  toggleRepairSelected() {
    if (this.game.state !== 'playing') return;

    const repairable = this.getRepairableSelection();
    if (repairable.length === 0) {
      this.setStatusText('SELECT A DAMAGED FRIENDLY UNIT OR STRUCTURE.');
      return;
    }

    const shouldStop = repairable.some(entity => entity.repairing);
    repairable.forEach(entity => {
      entity.repairing = !shouldStop;
      if (entity.repairing && !entity.isBuilding) {
        entity.state = 'idle';
        entity.path = [];
        entity.combatTarget = null;
      }
    });

    this.setStatusText(shouldStop ? 'REPAIR HALTED.' : `REPAIRING ${repairable.length} ASSET${repairable.length === 1 ? '' : 'S'}.`);
    this.updateRepairButton();
  }

  startSidebarBuild(type, cost, duration) {
    if (this.game.state !== 'playing') return;

    if (!this.game.canUseBuilding('player', type)) {
      this.setStatusText(`${this.getBuildingName(type)} REQUIRES ${BUILDING_DEFS[type].level.toUpperCase()} LEVEL.`);
      return;
    }

    if (this.sidebarState === 'ready' && this.sidebarBuilding === type) {
      this.enterPlacementMode(type, cost);
      return;
    }

    if (this.sidebarState !== 'idle') {
      this.setStatusText("CONSTRUCTION YARD IS BUSY.");
      return;
    }

    if (!this.game.canAffordCredits('player', cost)) {
      this.setStatusText("INSUFFICIENT CREDITS.");
      return;
    }

    this.sidebarBuilding = type;
    this.sidebarProgress = 0;
    this.sidebarCost = cost;
    this.sidebarDuration = duration;
    this.sidebarState = 'building';
    this.setStatusText(`BUILDING ${this.getBuildingName(type)}...`);
  }

  enterPlacementMode(type, cost) {
    this.game.placementType = type;
    this.game.placementCost = cost;
    this.game.fencePlacementStartTile = null;
    this.game.fencePlacementPreviewTiles = [];
    if (this.game.input) this.game.input.isPlacingFence = false;

    let tilesW = 2;
    let tilesH = 2;
    const def = BUILDING_DEFS[type];
    if (def) {
      tilesW = def.gridWidth;
      tilesH = def.gridHeight;
    }
    if (type === 'fence') {
      tilesW = 5;
      tilesH = 1;
    }

    this.game.ghostWTiles = tilesW;
    this.game.ghostHTiles = tilesH;
    this.game.ghostWPx = tilesW * this.game.grid.tileSize;
    this.game.ghostHPx = tilesH * this.game.grid.tileSize;

    // Ghost element is now drawn on canvas in game.draw() directly, hide HTML helper
    const ghost = document.getElementById('placement-ghost');
    if (ghost) ghost.classList.add('hidden');
    
    document.body.style.cursor = 'crosshair';
    this.setStatusText(`SELECT PLACEMENT COORDINATES FOR ${this.getBuildingName(type)}`);
  }

  queueUnitTraining(type) {
    if (this.game.state !== 'playing') return;

    const def = UNIT_DEFS[type];
    if (!def) return;

    if (!this.game.canUseUnit('player', type)) {
      this.setStatusText(`${def.name.toUpperCase()} REQUIRES ${def.level.toUpperCase()} LEVEL.`);
      return;
    }

    const parentBuildingType = def.producer;
    const friendlyBuildings = this.game.playerEntities.filter(b => b.isBuilding && !b.isDead);
    const parentBuilding = friendlyBuildings.find(b => b.type === parentBuildingType && !b.isUnderConstruction);

    if (!parentBuilding) {
      this.setStatusText(`REQUIRES ACTIVE ${parentBuildingType.toUpperCase()} TO TRAIN.`);
      return;
    }

    const currentPlayerUnits = this.game.playerEntities.filter(e => !e.isBuilding && !e.isDead).length;
    if (currentPlayerUnits >= 50) {
      this.setStatusText("POPULATION LIMIT REACHED (MAX 50 UNITS).");
      return;
    }

    const cost = def.cost;

    if (!this.game.canAffordCredits('player', cost)) {
      this.setStatusText("INSUFFICIENT CREDITS.");
      return;
    }

    this.game.spendCredits('player', cost);
    parentBuilding.queueUnit(type);
    const unitName = getRaceUnitName(this.game.playerRace, type).toUpperCase();
    this.setStatusText(`TRAINING ${unitName}... QUEUED: ${parentBuilding.buildQueue.length}`);
  }

  updateSidebarBuild(dt) {
    if (this.sidebarState !== 'building') return;

    const speedMultiplier = this.game.isLowPower('player') ? 0.5 : 1.0;
    this.sidebarProgress += (dt / this.sidebarDuration) * speedMultiplier;

    const btnId = `build-${this.sidebarBuilding}`;
    const progressFill = document.getElementById(`progress-${this.sidebarBuilding}`);

    if (progressFill) {
      progressFill.style.width = `${this.sidebarProgress * 100}%`;
    }

    if (this.sidebarProgress >= 1.0) {
      this.sidebarProgress = 1.0;
      this.sidebarState = 'ready';
      
      const btn = document.getElementById(btnId);
      if (btn) btn.classList.add('ready-to-place');
      
      this.setStatusText(`${this.getBuildingName(this.sidebarBuilding)} READY FOR PLACEMENT.`);
    }
  }

  clearSidebarBuildVisuals() {
    const btn = document.getElementById(`build-${this.sidebarBuilding}`);
    if (btn) btn.classList.remove('ready-to-place');
    
    const progressFill = document.getElementById(`progress-${this.sidebarBuilding}`);
    if (progressFill) progressFill.style.width = '0%';

    this.sidebarBuilding = null;
    this.sidebarProgress = 0;
    this.sidebarState = 'idle';
    this.updateCancelBuildButton();
  }

  cancelSidebarBuild() {
    const hasSidebarBuild = this.sidebarState !== 'idle';
    const hasPlacement = Boolean(this.game.placementType);
    if (!hasSidebarBuild && !hasPlacement) return false;

    const buildingName = this.sidebarBuilding ? this.getBuildingName(this.sidebarBuilding) : 'BUILDING';
    this.clearSidebarBuildVisuals();
    this.game.placementType = null;
    this.game.placementCost = 0;
    this.game.ghostWTiles = 0;
    this.game.ghostHTiles = 0;
    this.game.fencePlacementStartTile = null;
    this.game.fencePlacementPreviewTiles = [];
    if (this.game.input) this.game.input.isPlacingFence = false;
    document.body.style.cursor = 'default';
    this.setStatusText(`${buildingName} BUILD CANCELLED. CREDITS UNCHANGED.`);
    return true;
  }

  updateCancelBuildButton() {
    if (!this.cancelBuildButton) return;
    this.cancelBuildButton.disabled = this.game.state !== 'playing' ||
      (this.sidebarState === 'idle' && !this.game.placementType);
  }

  updateRepairButton() {
    if (!this.repairButton) return;

    const repairable = this.getRepairableSelection();
    const active = repairable.some(entity => entity.repairing);
    this.repairButton.disabled = this.game.state !== 'playing' || repairable.length === 0;
    this.repairButton.innerText = active ? 'STOP REPAIR' : 'REPAIR SELECTED';
    this.repairButton.classList.toggle('repairing', active);
  }

  update(dt) {
    this.updateSidebarBuild(dt);
    this.updateCancelBuildButton();
    this.updateRepairButton();

    // Show only whole credits that are actually available to spend. Credits
    // are stored to cents, so rounding here could display an unaffordable
    // whole-dollar amount (for example, $2,499.99 as $2,500).
    this.creditsDisplay.innerText = `$${Math.floor(this.game.normalizeCredits(this.game.playerCredits))}`;
    this.fpsCounter.innerText = Math.round(this.game.fps);

    if (this.timePhase && this.game.dayCycle) {
      this.timePhase.innerText = this.game.dayCycle.getPhaseName();
    }

    const level = this.game.getCurrentLevel('player');
    if (this.techLevel) this.techLevel.innerText = level.name.toUpperCase();
    if (this.levelName) this.levelName.innerText = level.name.toUpperCase();
    if (this.levelDescription) this.levelDescription.innerText = level.description.toUpperCase();
    if (this.upgradeLevelBtn) {
      const nextLevel = LEVELS[this.game.playerLevelIndex + 1];
      if (nextLevel) {
        this.upgradeLevelBtn.innerText = `UPGRADE: ${nextLevel.name.toUpperCase()} $${nextLevel.upgradeCost}`;
        this.upgradeLevelBtn.disabled = !this.game.canAffordCredits('player', nextLevel.upgradeCost) || this.game.state !== 'playing';
      } else {
        this.upgradeLevelBtn.innerText = 'MAX LEVEL';
        this.upgradeLevelBtn.disabled = true;
      }
    }

    // Power Calculation
    let powerGen = 0;
    let powerDraw = 0;
    this.game.playerEntities.forEach(ent => {
      if (ent.isBuilding && !ent.isUnderConstruction) {
        powerGen += ent.powerProduction;
        powerDraw += ent.powerUsage;
      }
    });

    this.powerRatio.innerText = `${powerDraw} / ${powerGen} MW`;
    const powerPct = powerGen === 0 ? 0 : Math.min(100, (powerDraw / powerGen) * 100);
    this.powerBarFill.style.width = `${powerPct}%`;

    if (powerDraw > powerGen) {
      this.powerBarFill.classList.add('low-power');
    } else {
      this.powerBarFill.classList.remove('low-power');
    }

    this.updateTechButtons(powerGen, powerDraw);
    
    // Update hovering labels overlay
    this.updateHoverLabels();

    this.drawMinimap();
  }

  updateTechButtons(powerGen, powerDraw) {
    if (this.game.state !== 'playing') {
      // Disable everything on game over
      const allButtons = document.querySelectorAll('.build-card');
      allButtons.forEach(btn => btn.disabled = true);
      return;
    }

    const friendlyBuildings = this.game.playerEntities.filter(b => b.isBuilding && !b.isDead && !b.isUnderConstruction);
    const hasCyard = friendlyBuildings.some(b => b.type === 'cyard');
    const hasPower = friendlyBuildings.some(b => b.type === 'power');
    const hasRefinery = friendlyBuildings.some(b => b.type === 'refinery');
    const hasBarracks = friendlyBuildings.some(b => b.type === 'barracks');

    Object.keys(BUILDING_DEFS).forEach(type => {
      const btn = document.getElementById(`build-${type}`);
      if (!btn) return;

      let blockedByPrereq = false;
      if (type === 'power') blockedByPrereq = !hasCyard;
      else if (type === 'refinery') blockedByPrereq = !hasPower;
      else if (type === 'barracks') blockedByPrereq = !hasRefinery;
      else if (!['cyard', 'power', 'refinery', 'barracks'].includes(type)) blockedByPrereq = !hasCyard;

      const sidebarBusy = this.sidebarState !== 'idle' && this.sidebarBuilding !== type;
      btn.disabled = blockedByPrereq || sidebarBusy || !this.game.canUseBuilding('player', type);
    });

    Object.entries(UNIT_DEFS).forEach(([type, def]) => {
      const btn = document.getElementById(`train-${type}`);
      if (!btn) return;
      const hasProducer = def.producer === 'refinery' ? hasRefinery : hasBarracks;
      btn.disabled = !hasProducer || !this.game.canUseUnit('player', type);
    });
  }

  updateHoverLabels() {
    const ent = this.game.hoveredEntity;
    
    // Only draw hovering cards for buildings
    if (ent && ent.isBuilding && !ent.isDead) {
      const race = getRace(ent.race || this.game.playerRace);
      const factionText = ent.faction === 'player' ? race.name : getRace(ent.race || this.game.enemyRace).name;
      const factionClass = ent.faction === 'player' ? ent.race || this.game.playerRace : ent.race || this.game.enemyRace;
      
      let queueText = 'None';
      if (ent.buildQueue.length > 0) {
        const queuedType = ent.buildQueue[0].type;
        const queuedName = UNIT_DEFS[queuedType]
          ? getRaceUnitName(ent.race || (ent.faction === 'player' ? this.game.playerRace : this.game.enemyRace), queuedType)
          : queuedType.toUpperCase();
        queueText = `${queuedName} (${Math.floor(ent.trainingProgress * 100)}%)`;
      }

      let statusMsg = ent.repairing
        ? 'REPAIRING'
        : ent.isUnderConstruction
          ? `CONSTRUCTING (${Math.floor(ent.constructionProgress * 100)}%)`
          : 'OPERATIONAL';

      this.hoverTooltip.innerHTML = `
        <div class="label-title ${factionClass}">${this.getBuildingName(ent.type, ent.race)}</div>
        <div class="label-row"><span class="label-label">Faction:</span><span class="label-value">${factionText}</span></div>
        <div class="label-row"><span class="label-label">Health:</span><span class="label-value">${Math.floor(ent.health)}/${ent.maxHealth}</span></div>
        <div class="label-row"><span class="label-label">Status:</span><span class="label-value green">${statusMsg}</span></div>
        <div class="label-row"><span class="label-label">Power usage:</span><span class="label-value">${ent.powerUsage} MW</span></div>
        <div class="label-row"><span class="label-label">Power prod:</span><span class="label-value green">${ent.powerProduction} MW</span></div>
        <div class="label-row"><span class="label-label">Training Q:</span><span class="label-value">${queueText}</span></div>
      `;

      // Float tooltip slightly offsets cursor to prevent overlaps
      this.hoverTooltip.style.left = `${this.game.input.mouseX + 15}px`;
      this.hoverTooltip.style.top = `${this.game.input.mouseY + 15}px`;
      this.hoverTooltip.classList.remove('hidden');
    } else {
      this.hoverTooltip.classList.add('hidden');
    }
  }

  getBuildingName(type, race = null) {
    const raceId = race || this.game.playerRace;
    return getRaceBuildingName(raceId, type).toUpperCase();
  }

  renderMinimapTerrainCache() {
    if (!this.minimapCanvas || !this.game.grid) return;

    if (!this.offscreenMinimapCanvas) {
      this.offscreenMinimapCanvas = document.createElement('canvas');
    }
    if (this.offscreenMinimapCanvas.width !== this.minimapCanvas.width ||
        this.offscreenMinimapCanvas.height !== this.minimapCanvas.height) {
      this.offscreenMinimapCanvas.width = this.minimapCanvas.width;
      this.offscreenMinimapCanvas.height = this.minimapCanvas.height;
    }

    const ctx = this.offscreenMinimapCanvas.getContext('2d');
    const mapW = this.game.grid.width;
    const mapH = this.game.grid.height;
    const mw = this.offscreenMinimapCanvas.width;
    const mh = this.offscreenMinimapCanvas.height;
    const layout = this.getMinimapLayout();
    const tileW = layout.cellWidth;
    const tileH = layout.cellHeight;

    ctx.fillStyle = '#060a0c';
    ctx.fillRect(0, 0, mw, mh);

    // Render terrain in the same staggered row layout used by the main view.
    for (let x = 0; x < mapW; x++) {
      for (let y = 0; y < mapH; y++) {
        const tile = this.game.grid.tiles[x][y];
        const point = this.getMinimapGridPosition(x, y, layout);
        const mx = point.x;
        const my = point.y;

        if (tile.type === 'water') {
          const isIce = tile.biome === BIOMES.polar;
          ctx.fillStyle = tile.isBridge
            ? '#9a6a3a'
            : tile.waterVariant === 'waterfall'
            ? (isIce ? '#a8c8dc' : '#2196f3')
            : tile.waterVariant === 'river'
              ? (isIce ? '#98b8cc' : '#1565c0')
              : (isIce ? '#88a8bc' : '#0d47a1');
          ctx.fillRect(mx, my, tileW + 0.5, tileH + 0.5);
        } else if (tile.type === 'rock') {
          ctx.fillStyle = tile.biome === BIOMES.dry ? '#5a5040'
            : tile.biome === BIOMES.polar ? '#788890' : '#455a64';
          ctx.fillRect(mx, my, tileW + 0.5, tileH + 0.5);
        } else if (tile.type === 'ore') {
          ctx.fillStyle = '#00e676';
          ctx.fillRect(mx, my, tileW + 0.5, tileH + 0.5);
        } else if (tile.type === 'grass') {
          ctx.fillStyle = getMinimapGroundColor(tile.biome, tile.elevation);
          ctx.fillRect(mx, my, tileW + 0.5, tileH + 0.5);
        }
      }
    }
    this.offscreenMinimapDirty = false;
  }

  drawMinimap() {
    if (this.offscreenMinimapDirty || !this.offscreenMinimapCanvas) {
      this.renderMinimapTerrainCache();
    }

    const ctx = this.minimapCanvas.getContext('2d');
    const layout = this.getMinimapLayout();

    ctx.drawImage(this.offscreenMinimapCanvas, 0, 0);

    ctx.save();
    ctx.beginPath();
    ctx.rect(layout.x, layout.y, layout.width, layout.height);
    ctx.clip();

    // Draw Entities (flat representations inside tactical matrix)
    const drawDots = (entities, color) => {
      ctx.fillStyle = color;
      entities.forEach(ent => {
        if (ent.isDead) return;

        const position = this.getMinimapEntityPosition(ent, layout);
        const mx = position.x;
        const my = position.y;

        if (ent.isBuilding) {
          const bw = Math.max(3, (ent.gridWidth / this.game.grid.width) * layout.width);
          const bh = Math.max(3, (ent.gridHeight / this.game.grid.height) * layout.height);
          ctx.fillRect(mx - bw / 2, my - bh / 2, bw, bh);
        } else {
          ctx.fillRect(mx - 1.5, my - 1.5, 3, 3);
        }
      });
    };

    drawDots(this.game.playerEntities, getRace(this.game.playerRace).palette.minimap);
    drawDots(
      this.game.enemyEntities.filter(ent => !ent.isStealthed || this.game.isEntityDetected(ent, 'player')),
      getRace(this.game.enemyRace).palette.minimap
    );

    // Rotating Radar Sweep Line
    const time = this.game.currentTime || (Date.now() / 1000);
    const sweepAngle = time * 2.0;
    const cx = layout.x + layout.width / 2;
    const cy = layout.y + layout.height / 2;
    const radius = Math.hypot(layout.width, layout.height);

    ctx.save();
    ctx.strokeStyle = 'rgba(79, 195, 247, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sweepAngle) * radius, cy + Math.sin(sweepAngle) * radius);
    ctx.stroke();
    ctx.restore();

    // Render Click Pings
    if (this.minimapPings) {
      for (let i = this.minimapPings.length - 1; i >= 0; i--) {
        const ping = this.minimapPings[i];
        ping.radius += 1.2;
        ping.alpha -= 0.04;
        if (ping.alpha <= 0) {
          this.minimapPings.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.strokeStyle = `rgba(255, 255, 255, ${ping.alpha})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ping.x, ping.y, ping.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Draw the camera's world-space viewport as its staggered tile-space
    // bounds. This stays aligned with the staggered radar terrain.
    const cam = this.game.camera;
    const cameraCorners = [
      this.getGridPositionAtWorld(cam.x, cam.y),
      this.getGridPositionAtWorld(cam.x + cam.width, cam.y),
      this.getGridPositionAtWorld(cam.x, cam.y + cam.height),
      this.getGridPositionAtWorld(cam.x + cam.width, cam.y + cam.height),
    ];
    const minGridX = Math.max(0, Math.min(...cameraCorners.map(point => point.x)));
    const maxGridX = Math.min(this.game.grid.width, Math.max(...cameraCorners.map(point => point.x)));
    const minGridY = Math.max(0, Math.min(...cameraCorners.map(point => point.y)));
    const maxGridY = Math.min(this.game.grid.height, Math.max(...cameraCorners.map(point => point.y)));

    const cvx = layout.x + (minGridX / this.game.grid.width) * layout.width;
    const cvy = layout.y + (minGridY / this.game.grid.height) * layout.height;
    const cvw = ((maxGridX - minGridX) / this.game.grid.width) * layout.width;
    const cvh = ((maxGridY - minGridY) / this.game.grid.height) * layout.height;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(cvx, cvy, cvw, cvh);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cvx, cvy, cvw, cvh);

    ctx.restore();
  }
}
