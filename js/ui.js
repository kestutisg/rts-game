/**
 * UI Manager for Tiberian Odyssey (Isometric 2.5D Upgrade)
 * Handles HUD bindings, building placements, music state updates,
 * radar network projection, and dynamic hovering tooltips.
 */

export class UIManager {
  constructor(game) {
    this.game = game;

    // Cache DOM elements
    this.creditsDisplay = document.getElementById('credits-amount');
    this.powerRatio = document.getElementById('power-ratio');
    this.powerBarFill = document.getElementById('power-bar-fill');
    this.fpsCounter = document.getElementById('fps-counter');
    this.timePhase = document.getElementById('time-phase');
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

    document.getElementById('build-cyard').addEventListener('click', () => this.startSidebarBuild('cyard', 1000, 8.0));
    document.getElementById('build-power').addEventListener('click', () => this.startSidebarBuild('power', 300, 4.0));
    document.getElementById('build-refinery').addEventListener('click', () => this.startSidebarBuild('refinery', 2000, 10.0));
    document.getElementById('build-barracks').addEventListener('click', () => this.startSidebarBuild('barracks', 500, 6.0));

    document.getElementById('train-harvester').addEventListener('click', () => this.queueUnitTraining('harvester'));
    document.getElementById('train-soldier').addEventListener('click', () => this.queueUnitTraining('soldier'));
    document.getElementById('train-rocket').addEventListener('click', () => this.queueUnitTraining('rocket'));
    document.getElementById('train-tank').addEventListener('click', () => this.queueUnitTraining('tank'));
  }

  setStatusText(msg) {
    this.statusText.innerText = msg.toUpperCase();
  }

  onBuildingSelected(building) {
    this.selectedBuilding = building;
    if (building) {
      this.setStatusText(`${building.type.toUpperCase()} SELECTED. HEALTH: ${Math.floor(building.health)}/${building.maxHealth}`);
    } else {
      this.setStatusText("SYSTEM ONLINE. STANDBY FOR COMMAND.");
    }
  }

  startSidebarBuild(type, cost, duration) {
    if (this.game.state !== 'playing') return;

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
    this.setStatusText(`BUILDING ${type.toUpperCase()}...`);
  }

  enterPlacementMode(type, cost) {
    this.game.placementType = type;
    this.game.placementCost = cost;

    let tilesW = 2;
    let tilesH = 2;
    if (type === 'cyard') { tilesW = 3; tilesH = 3; }
    else if (type === 'refinery') { tilesW = 3; tilesH = 2; }

    this.game.ghostWTiles = tilesW;
    this.game.ghostHTiles = tilesH;
    this.game.ghostWPx = tilesW * this.game.grid.tileSize;
    this.game.ghostHPx = tilesH * this.game.grid.tileSize;

    // Ghost element is now drawn on canvas in game.draw() directly, hide HTML helper
    const ghost = document.getElementById('placement-ghost');
    if (ghost) ghost.classList.add('hidden');
    
    document.body.style.cursor = 'crosshair';
    this.setStatusText(`SELECT PLACEMENT COORDINATES FOR ${type.toUpperCase()}`);
  }

  queueUnitTraining(type) {
    if (this.game.state !== 'playing') return;

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

    let cost = 100;
    if (type === 'rocket') cost = 300;
    if (type === 'tank') cost = 800;
    if (type === 'harvester') cost = 1000;

    if (this.game.playerCredits < cost) {
      this.setStatusText("INSUFFICIENT CREDITS.");
      return;
    }

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
    this.updateSidebarBuild(dt);

    this.creditsDisplay.innerText = `$${Math.floor(this.game.playerCredits)}`;
    this.fpsCounter.innerText = Math.round(this.game.fps);

    if (this.timePhase && this.game.dayCycle) {
      this.timePhase.innerText = this.game.dayCycle.getPhaseName();
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

    document.getElementById('build-cyard').disabled = this.sidebarState !== 'idle' && this.sidebarBuilding !== 'cyard';
    document.getElementById('build-power').disabled = !hasCyard || (this.sidebarState !== 'idle' && this.sidebarBuilding !== 'power');
    document.getElementById('build-refinery').disabled = !hasPower || (this.sidebarState !== 'idle' && this.sidebarBuilding !== 'refinery');
    document.getElementById('build-barracks').disabled = !hasRefinery || (this.sidebarState !== 'idle' && this.sidebarBuilding !== 'barracks');

    document.getElementById('train-harvester').disabled = !hasRefinery;
    document.getElementById('train-soldier').disabled = !hasBarracks;
    document.getElementById('train-rocket').disabled = !hasBarracks;
    document.getElementById('train-tank').disabled = !hasBarracks;
  }

  updateHoverLabels() {
    const ent = this.game.hoveredEntity;
    
    // Only draw hovering cards for buildings
    if (ent && ent.isBuilding && !ent.isDead) {
      const factionText = ent.faction === 'player' ? 'PLAYER' : 'ENEMY';
      const factionClass = ent.faction === 'player' ? '' : 'enemy';
      
      let queueText = 'None';
      if (ent.buildQueue.length > 0) {
        queueText = `${ent.buildQueue[0].type.toUpperCase()} (${Math.floor(ent.trainingProgress * 100)}%)`;
      }

      let statusMsg = ent.isUnderConstruction ? `CONSTRUCTING (${Math.floor(ent.constructionProgress * 100)}%)` : 'OPERATIONAL';

      this.hoverTooltip.innerHTML = `
        <div class="label-title ${factionClass}">${this.getBuildingName(ent.type)}</div>
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

  getBuildingName(type) {
    switch(type) {
      case 'cyard': return 'CONSTRUCTION YARD';
      case 'power': return 'POWER PLANT';
      case 'refinery': return 'ORE REFINERY';
      case 'barracks': return 'BARRACKS';
      default: return 'STRUCTURE';
    }
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

    drawDots(this.game.playerEntities, 'oklch(0.78 0.18 195)');
    drawDots(this.game.enemyEntities, 'oklch(0.62 0.22 25)');

    // Draw projected Camera Viewport on minimap
    const cam = this.game.camera;
    const getGridCellCoords = (wx, wy) => {
      // Simplified grid cell projections for viewport outline
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

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tl.x * cellW, tl.y * cellH);
    ctx.lineTo(tr.x * cellW, tr.y * cellH);
    ctx.lineTo(br.x * cellW, br.y * cellH);
    ctx.lineTo(bl.x * cellW, bl.y * cellH);
    ctx.closePath();
    ctx.stroke();
  }
}
