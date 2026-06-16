/**
 * UI Manager for Tiberian Odyssey
 * Handles tab switching, sidebar building queues, unit training queue dispatch,
 * tech tree validation, HUD updates, and status messages.
 */

export class UIManager {
  constructor(game) {
    this.game = game;

    // Cache DOM Elements
    this.creditsDisplay = document.getElementById('credits-amount');
    this.powerRatio = document.getElementById('power-ratio');
    this.powerBarFill = document.getElementById('power-bar-fill');
    this.fpsCounter = document.getElementById('fps-counter');
    this.statusText = document.getElementById('status-text');
    this.minimapCanvas = document.getElementById('minimap-canvas');

    this.tabBuildings = document.getElementById('tab-buildings');
    this.tabUnits = document.getElementById('tab-units');
    this.buildingsGrid = document.getElementById('buildings-grid');
    this.unitsGrid = document.getElementById('units-grid');

    // Sidebar Building Construction variables (Built inside sidebar, then placed)
    this.sidebarBuilding = null; // building type currently under construction ('power', 'refinery', 'barracks', 'cyard')
    this.sidebarProgress = 0; // 0 to 1
    this.sidebarCost = 0;
    this.sidebarDuration = 0;
    this.sidebarState = 'idle'; // 'idle', 'building', 'ready'

    this.selectedBuilding = null; // Currently selected structure

    this.initListeners();
  }

  initListeners() {
    // Tab Switching
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

    // Structure Buttons
    document.getElementById('build-cyard').addEventListener('click', () => this.startSidebarBuild('cyard', 1000, 8.0));
    document.getElementById('build-power').addEventListener('click', () => this.startSidebarBuild('power', 300, 4.0));
    document.getElementById('build-refinery').addEventListener('click', () => this.startSidebarBuild('refinery', 2000, 10.0));
    document.getElementById('build-barracks').addEventListener('click', () => this.startSidebarBuild('barracks', 500, 6.0));

    // Unit Buttons (Trains inside structures)
    document.getElementById('train-harvester').addEventListener('click', () => this.queueUnitTraining('harvester'));
    document.getElementById('train-soldier').addEventListener('click', () => this.queueUnitTraining('soldier'));
    document.getElementById('train-rocket').addEventListener('click', () => this.queueUnitTraining('rocket'));
    document.getElementById('train-tank').addEventListener('click', () => this.queueUnitTraining('tank'));
  }

  setStatusText(msg) {
    this.statusText.innerText = msg.toUpperCase();
  }

  /**
   * Selection change callback
   */
  onBuildingSelected(building) {
    this.selectedBuilding = building;
    if (building) {
      this.setStatusText(`${building.type.toUpperCase()} SELECTED. HEALTH: ${Math.floor(building.health)}/${building.maxHealth}`);
    } else {
      this.setStatusText("SYSTEM ONLINE. STANDBY FOR COMMAND.");
    }
  }

  startSidebarBuild(type, cost, duration) {
    if (this.sidebarState === 'ready' && this.sidebarBuilding === type) {
      // Re-click "READY" structure to enter placement mode
      this.enterPlacementMode(type, cost);
      return;
    }

    if (this.sidebarState !== 'idle') {
      this.setStatusText("CONSTRUCTION YARD IS BUSY.");
      return;
    }

    // Check credits
    if (this.game.playerCredits < cost) {
      this.setStatusText("INSUFFICIENT CREDITS.");
      return;
    }

    // Start construction in sidebar
    this.sidebarBuilding = type;
    this.sidebarProgress = 0;
    this.sidebarCost = cost;
    this.sidebarDuration = duration;
    this.sidebarState = 'building';
    this.setStatusText(`BUILDING ${type.toUpperCase()}...`);
  }

  enterPlacementMode(type, cost) {
    this.game.placementType = type;
    this.game.placementCost = cost;

    // Define footprints in tiles
    let tilesW = 2;
    let tilesH = 2;
    if (type === 'cyard') { tilesW = 3; tilesH = 3; }
    else if (type === 'refinery') { tilesW = 3; tilesH = 2; }

    this.game.ghostWTiles = tilesW;
    this.game.ghostHTiles = tilesH;
    this.game.ghostWPx = tilesW * this.game.grid.tileSize;
    this.game.ghostHPx = tilesH * this.game.grid.tileSize;

    // Unhide HTML placement ghost indicator
    const ghost = document.getElementById('placement-ghost');
    ghost.classList.remove('hidden');
    document.body.style.cursor = 'crosshair';
    
    this.setStatusText(`SELECT PLACEMENT COORDINATES FOR ${type.toUpperCase()}`);
  }

  queueUnitTraining(type) {
    // Check if player has the factory building for this unit type
    let parentBuildingType = 'barracks';
    if (type === 'harvester') {
      parentBuildingType = 'refinery';
    }

    const friendlyBuildings = this.game.playerEntities.filter(b => b.isBuilding && !b.isDead);
    const parentBuilding = friendlyBuildings.find(b => b.type === parentBuildingType && !b.isUnderConstruction);

    if (!parentBuilding) {
      this.setStatusText(`REQUIRES ACTIVE ${parentBuildingType.toUpperCase()} TO TRAIN.`);
      return;
    }

    // Cost checks
    let cost = 100;
    if (type === 'rocket') cost = 300;
    if (type === 'tank') cost = 800;
    if (type === 'harvester') cost = 1000;

    if (this.game.playerCredits < cost) {
      this.setStatusText("INSUFFICIENT CREDITS.");
      return;
    }

    // Deduct credits and queue in structure
    this.game.playerCredits -= cost;
    parentBuilding.queueUnit(type);
    this.setStatusText(`TRAINING ${type.toUpperCase()}... QUEUED: ${parentBuilding.buildQueue.length}`);
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
      
      this.setStatusText(`${this.sidebarBuilding.toUpperCase()} READY FOR PLACEMENT.`);
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
    // 1. Process sidebar building timer progress
    this.updateSidebarBuild(dt);

    // 2. Update HUD Values
    this.creditsDisplay.innerText = `$${Math.floor(this.game.playerCredits)}`;
    this.fpsCounter.innerText = Math.round(this.game.fps);

    // Power Bar calculation
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

    // 3. Tech Tree availability evaluation
    this.updateTechButtons(powerGen, powerDraw);

    // 4. Render radar minimap
    this.drawMinimap();
  }

  updateTechButtons(powerGen, powerDraw) {
    const friendlyBuildings = this.game.playerEntities.filter(b => b.isBuilding && !b.isDead && !b.isUnderConstruction);
    const hasCyard = friendlyBuildings.some(b => b.type === 'cyard');
    const hasPower = friendlyBuildings.some(b => b.type === 'power');
    const hasRefinery = friendlyBuildings.some(b => b.type === 'refinery');
    const hasBarracks = friendlyBuildings.some(b => b.type === 'barracks');

    // Build buttons disabled status
    document.getElementById('build-cyard').disabled = this.sidebarState !== 'idle' && this.sidebarBuilding !== 'cyard';
    document.getElementById('build-power').disabled = !hasCyard || (this.sidebarState !== 'idle' && this.sidebarBuilding !== 'power');
    document.getElementById('build-refinery').disabled = !hasPower || (this.sidebarState !== 'idle' && this.sidebarBuilding !== 'refinery');
    document.getElementById('build-barracks').disabled = !hasRefinery || (this.sidebarState !== 'idle' && this.sidebarBuilding !== 'barracks');

    // Train units disabled status
    document.getElementById('train-harvester').disabled = !hasRefinery;
    document.getElementById('train-soldier').disabled = !hasBarracks;
    document.getElementById('train-rocket').disabled = !hasBarracks;
    document.getElementById('train-tank').disabled = !hasBarracks;
  }

  drawMinimap() {
    const ctx = this.minimapCanvas.getContext('2d');
    const mapW = this.game.grid.width;
    const mapH = this.game.grid.height;
    
    // Scale factor
    const cellW = this.minimapCanvas.width / mapW;
    const cellH = this.minimapCanvas.height / mapH;

    ctx.fillStyle = '#060a0c'; // Very dark gray-blue background
    ctx.fillRect(0, 0, this.minimapCanvas.width, this.minimapCanvas.height);

    // Draw terrain
    for (let x = 0; x < mapW; x++) {
      for (let y = 0; y < mapH; y++) {
        const tile = this.game.grid.tiles[x][y];
        if (tile.type === 'rock') {
          ctx.fillStyle = '#263238'; // Rock gray
          ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
        } else if (tile.type === 'ore') {
          ctx.fillStyle = '#00e676'; // Tiberium green
          ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
        }
      }
    }

    // Draw Buildings & Units
    const drawDots = (entities, color) => {
      ctx.fillStyle = color;
      entities.forEach(ent => {
        if (ent.isDead) return;

        if (ent.isBuilding) {
          // Draw rectangle matching building footprint
          ctx.fillRect(
            ent.gridX * cellW, 
            ent.gridY * cellH, 
            ent.gridWidth * cellW, 
            ent.gridHeight * cellH
          );
        } else {
          // Draw small unit dot
          const ux = Math.floor(ent.x / this.game.grid.tileSize);
          const uy = Math.floor(ent.y / this.game.grid.tileSize);
          ctx.fillRect(ux * cellW - 1, uy * cellH - 1, cellW + 1, cellH + 1);
        }
      });
    };

    drawDots(this.game.playerEntities, 'oklch(0.78 0.18 195)'); // Cyan dots
    drawDots(this.game.enemyEntities, 'oklch(0.62 0.22 25)');    // Red dots

    // Draw Camera Viewport rectangle
    const cam = this.game.camera;
    const vx = (cam.x / (mapW * this.game.grid.tileSize)) * this.minimapCanvas.width;
    const vy = (cam.y / (mapH * this.game.grid.tileSize)) * this.minimapCanvas.height;
    const vw = (cam.width / (mapW * this.game.grid.tileSize)) * this.minimapCanvas.width;
    const vh = (cam.height / (mapH * this.game.grid.tileSize)) * this.minimapCanvas.height;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(vx, vy, vw, vh);
  }
}
