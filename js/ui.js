/**
 * UI Manager for Tiberian Odyssey (Isometric 2.5D Upgrade)
 * Handles HUD bindings, building placements, music state updates,
 * radar network projection, and dynamic hovering tooltips.
 */

import { BUILDING_DEFS, LEVELS, UNIT_DEFS } from './tech.js';
import { applyRaceBuildingStats, getRace, getRaceBuildingName, getRaceUnitName } from './races.js';

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

    this.tabBuildings = document.getElementById('tab-buildings');
    this.tabUnits = document.getElementById('tab-units');
    this.buildingsGrid = document.getElementById('buildings-grid');
    this.unitsGrid = document.getElementById('units-grid');

    // Sidebar Building Construction variables
    this.sidebarBuilding = null;
    this.sidebarProgress = 0;
    this.sidebarCost = 0;
    this.sidebarDuration = 0;
    this.sidebarState = 'idle';

    this.selectedBuilding = null;

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

    // Faction launch button
    const launchBtn = document.getElementById('launch-btn');
    if (launchBtn) {
      launchBtn.addEventListener('click', () => {
        const enemySelect = document.getElementById('enemy-faction-select');
        const selectedEnemyRace = enemySelect ? enemySelect.value : 'nod';
        this.game.startGame(selectedPlayerRace, selectedEnemyRace);
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

  jumpCameraToMinimap(e, createPing = false) {
    if (!this.minimapCanvas || !this.game.grid) return;

    const rect = this.minimapCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const mouseX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const mouseY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    const canvasX = (mouseX / rect.width) * this.minimapCanvas.width;
    const canvasY = (mouseY / rect.height) * this.minimapCanvas.height;

    const mapW = this.game.grid.width;
    const mapH = this.game.grid.height;
    const cellW = this.minimapCanvas.width / mapW;
    const cellH = this.minimapCanvas.height / mapH;

    const targetGridX = canvasX / cellW;
    const targetGridY = canvasY / cellH;

    const worldCoords = this.game.grid.getTileCoords(targetGridX, targetGridY);
    const cam = this.game.camera;

    cam.x = worldCoords.x - cam.width / 2;
    cam.y = worldCoords.y - cam.height / 2;

    // Clamp camera within isometric map boundaries
    const limitX = this.game.grid.mapWidthPx;
    const limitY = this.game.grid.mapHeightPx;
    cam.x = Math.max(0, Math.min(limitX - cam.width, cam.x));
    cam.y = Math.max(0, Math.min(limitY - cam.height, cam.y));

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
    this.selectedBuilding = building;
    if (building) {
      const name = getRaceBuildingName(building.race, building.type).toUpperCase();
      this.setStatusText(`${name} SELECTED. HEALTH: ${Math.floor(building.health)}/${building.maxHealth}`);
    } else {
      this.setStatusText("SYSTEM ONLINE. STANDBY FOR COMMAND.");
    }
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

    if (this.game.playerCredits < cost) {
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

    let tilesW = 2;
    let tilesH = 2;
    const def = BUILDING_DEFS[type];
    if (def) {
      tilesW = def.gridWidth;
      tilesH = def.gridHeight;
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

    const cost = def.cost;

    if (this.game.playerCredits < cost) {
      this.setStatusText("INSUFFICIENT CREDITS.");
      return;
    }

    this.game.playerCredits -= cost;
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
  }

  update(dt) {
    this.updateSidebarBuild(dt);

    this.creditsDisplay.innerText = `$${Math.floor(this.game.playerCredits)}`;
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
        this.upgradeLevelBtn.disabled = this.game.playerCredits < nextLevel.upgradeCost || this.game.state !== 'playing';
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

      let statusMsg = ent.isUnderConstruction ? `CONSTRUCTING (${Math.floor(ent.constructionProgress * 100)}%)` : 'OPERATIONAL';

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

  drawMinimap() {
    const ctx = this.minimapCanvas.getContext('2d');
    const mapW = this.game.grid.width;
    const mapH = this.game.grid.height;
    
    const cellW = this.minimapCanvas.width / mapW;
    const cellH = this.minimapCanvas.height / mapH;

    ctx.fillStyle = '#060a0c';
    ctx.fillRect(0, 0, this.minimapCanvas.width, this.minimapCanvas.height);

    // Draw terrain
    for (let x = 0; x < mapW; x++) {
      for (let y = 0; y < mapH; y++) {
        const tile = this.game.grid.tiles[x][y];
        if (tile.type === 'water') {
          ctx.fillStyle = tile.waterVariant === 'waterfall' ? '#2196f3' :
                          tile.waterVariant === 'river' ? '#1565c0' : '#0d47a1';
          ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
        } else if (tile.elevation === 2) {
          ctx.fillStyle = '#37474f';
          ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
        } else if (tile.elevation === 1) {
          ctx.fillStyle = '#263238';
          ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
        } else if (tile.type === 'rock') {
          ctx.fillStyle = '#455a64';
          ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
        } else if (tile.type === 'ore') {
          ctx.fillStyle = '#00e676';
          ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
        }
      }
    }

    // Draw Entities (flat representations inside tactical matrix)
    const drawDots = (entities, color) => {
      ctx.fillStyle = color;
      entities.forEach(ent => {
        if (ent.isDead) return;

        if (ent.isBuilding) {
          ctx.fillRect(
            ent.gridX * cellW, 
            ent.gridY * cellH, 
            ent.gridWidth * cellW, 
            ent.gridHeight * cellH
          );
        } else {
          const ux = Math.floor(ent.x / this.game.grid.tileSize);
          const uy = Math.floor(ent.y / this.game.grid.tileSize);
          ctx.fillRect(ux * cellW - 1, uy * cellH - 1, cellW + 1, cellH + 1);
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
    const cx = this.minimapCanvas.width / 2;
    const cy = this.minimapCanvas.height / 2;
    const radius = Math.hypot(cx, cy);

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

    // Draw projected Camera Viewport on minimap
    const cam = this.game.camera;
    const getGridCellCoords = (wx, wy) => {
      const U = (wx - this.game.grid.height * this.game.grid.halfW) / this.game.grid.halfW;
      const V = wy / this.game.grid.halfH;
      return {
        x: Math.min(mapW - 1, Math.max(0, (V + U) / 2)),
        y: Math.min(mapH - 1, Math.max(0, (V - U) / 2))
      };
    };

    // Calculate grid coordinates of the four corners of screen viewport
    const tl = getGridCellCoords(cam.x, cam.y);
    const tr = getGridCellCoords(cam.x + cam.width, cam.y);
    const br = getGridCellCoords(cam.x + cam.width, cam.y + cam.height);
    const bl = getGridCellCoords(cam.x, cam.y + cam.height);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(tl.x * cellW, tl.y * cellH);
    ctx.lineTo(tr.x * cellW, tr.y * cellH);
    ctx.lineTo(br.x * cellW, br.y * cellH);
    ctx.lineTo(bl.x * cellW, bl.y * cellH);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}
