/**
 * Input Handler for Tiberian Odyssey (Isometric 2.5D Upgrade)
 * Manages screen-to-isometric coordinate translations, group drag selections,
 * unit orders, and hover entity tracking.
 */

export class InputHandler {
  constructor(game) {
    this.game = game;
    this.canvas = game.canvas;

    // Mouse positions
    this.mouseX = 0; // Screen X
    this.mouseY = 0; // Screen Y
    this.worldMouseX = 0; // World X
    this.worldMouseY = 0; // World Y

    // Selection Drag Box (stored in screen space for correct projection overlap)
    this.isDragging = false;
    this.dragStartScreenX = 0;
    this.dragStartScreenY = 0;

    // Keyboard panning states
    this.keys = {};

    // Camera edge scrolling configuration
    this.edgeThreshold = 25;
    this.panSpeed = 350;

    this.initListeners();
  }

  initListeners() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.key.toLowerCase()] = true;
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
      
      this.updateWorldCoordinates();

      // Check hovered entity (units or buildings)
      this.updateHoveredEntity();
    });

    this.canvas.addEventListener('mousedown', (e) => {
      // Music Lazy Init (browser constraint)
      if (this.game.audio && !this.game.audio.ctx) {
        this.game.audio.start();
        document.getElementById('music-toggle').classList.add('active');
        document.getElementById('music-toggle').innerText = "MUSIC: ON";
      }

      if (e.button !== 0) return; // Left click only

      if (this.game.placementType) {
        this.tryPlaceBuilding();
        return;
      }

      this.isDragging = true;
      this.dragStartScreenX = this.mouseX;
      this.dragStartScreenY = this.mouseY;
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0 || !this.isDragging) return;
      this.isDragging = false;

      const width = Math.abs(this.mouseX - this.dragStartScreenX);
      const height = Math.abs(this.mouseY - this.dragStartScreenY);

      if (width < 6 && height < 6) {
        this.handleSingleClickSelection();
      } else {
        this.handleDragBoxSelection(
          Math.min(this.dragStartScreenX, this.mouseX),
          Math.min(this.dragStartScreenY, this.mouseY),
          Math.max(this.dragStartScreenX, this.mouseX),
          Math.max(this.dragStartScreenY, this.mouseY)
        );
      }
    });

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.issueCommand();
    });
  }

  updateWorldCoordinates() {
    this.worldMouseX = this.mouseX + this.game.camera.x;
    this.worldMouseY = this.mouseY + this.game.camera.y;
  }

  updateHoveredEntity() {
    // Find hovered grid tile in isometric coordinates
    const tile = this.game.grid.getTileAtWorld(this.worldMouseX, this.worldMouseY);
    if (tile && tile.occupiedBy) {
      this.game.hoveredEntity = tile.occupiedBy;
      return;
    }

    // Fallback: check unit radius overlaps (prioritize units)
    let hoveredUnit = null;
    const allUnits = [...this.game.playerEntities, ...this.game.enemyEntities].filter(e => !e.isBuilding && !e.isDead);
    
    for (const unit of allUnits) {
      const dist = Math.hypot(unit.x - this.worldMouseX, unit.y - this.worldMouseY);
      if (dist <= unit.radius + 6) {
        hoveredUnit = unit;
        break;
      }
    }

    this.game.hoveredEntity = hoveredUnit;
  }

  handleSingleClickSelection() {
    this.game.selectedEntities.forEach(ent => ent.selected = false);
    this.game.selectedEntities = [];

    if (this.game.hoveredEntity && this.game.hoveredEntity.faction === 'player') {
      this.game.hoveredEntity.selected = true;
      this.game.selectedEntities.push(this.game.hoveredEntity);

      if (this.game.hoveredEntity.isBuilding) {
        this.game.ui.onBuildingSelected(this.game.hoveredEntity);
      }
    } else if (this.game.hoveredEntity) {
      // Can click select enemy structures/units to inspect health
      this.game.hoveredEntity.selected = true;
      this.game.selectedEntities.push(this.game.hoveredEntity);
      this.game.ui.onBuildingSelected(null);
    } else {
      this.game.ui.onBuildingSelected(null);
    }
  }

  handleDragBoxSelection(screenXMin, screenYMin, screenXMax, screenYMax) {
    this.game.selectedEntities.forEach(ent => ent.selected = false);
    this.game.selectedEntities = [];

    // Select friendly combat units inside the screen bounding rectangle
    for (const unit of this.game.playerEntities) {
      if (unit.isDead || unit.isBuilding) continue;

      const sx = unit.x - this.game.camera.x;
      const sy = unit.y - this.game.camera.y;

      if (sx >= screenXMin && sx <= screenXMax &&
          sy >= screenYMin && sy <= screenYMax) {
        unit.selected = true;
        this.game.selectedEntities.push(unit);
      }
    }
    this.game.ui.onBuildingSelected(null);
  }

  issueCommand() {
    const selectedUnits = this.game.selectedEntities.filter(ent => !ent.isBuilding && ent.faction === 'player');
    if (selectedUnits.length === 0) return;

    // Issue commands on hovered entity
    const targetEntity = this.game.hoveredEntity;
    const clickedTile = this.game.grid.getTileAtWorld(this.worldMouseX, this.worldMouseY);
    if (!clickedTile) return;

    selectedUnits.forEach((unit, idx) => {
      // 1. Attack Command
      if (targetEntity && targetEntity.faction === 'enemy') {
        if (unit.type !== 'harvester') {
          unit.combatTarget = targetEntity;
          unit.state = 'attacking';
        }
        return;
      }

      // 2. Harvester controls
      if (unit.type === 'harvester') {
        if (targetEntity && targetEntity.type === 'refinery' && targetEntity.faction === 'player') {
          unit.depositTargetRefinery = targetEntity;
          unit.findRefineryAndGo(this.game);
        } else if (clickedTile.type === 'ore') {
          unit.miningTargetTile = clickedTile;
          unit.goToOre(clickedTile, this.game);
        } else {
          const path = this.game.grid.findPath(
            this.game.grid.getTileAtWorld(unit.x, unit.y),
            clickedTile,
            unit
          );
          if (path) {
            unit.path = path;
            unit.pathIndex = 0;
            unit.state = 'moving';
            unit.miningTargetTile = null;
            unit.depositTargetRefinery = null;
          }
        }
        return;
      }

      // 3. Normal Move orders (incorporates golden spiral offsets for group pathing)
      let targetTile = clickedTile;
      if (selectedUnits.length > 1) {
        const offsetRadius = Math.ceil(Math.sqrt(idx + 1) - 1);
        const angle = idx * 2.39996;
        const ox = Math.round(offsetRadius * Math.cos(angle));
        const oy = Math.round(offsetRadius * Math.sin(angle));

        const gridX = Math.min(this.game.grid.width - 1, Math.max(0, clickedTile.x + ox));
        const gridY = Math.min(this.game.grid.height - 1, Math.max(0, clickedTile.y + oy));
        targetTile = this.game.grid.tiles[gridX][gridY];
      }

      const startTile = this.game.grid.getTileAtWorld(unit.x, unit.y);
      const path = this.game.grid.findPath(startTile, targetTile, unit);
      if (path) {
        unit.path = path;
        unit.pathIndex = 0;
        unit.state = 'moving';
        unit.combatTarget = null;
      }
    });

    this.game.createClickPing(this.worldMouseX, this.worldMouseY);
  }

  tryPlaceBuilding() {
    const tile = this.game.grid.getTileAtWorld(this.worldMouseX, this.worldMouseY);
    if (!tile) return;

    // Anchor placement around the tile hovered by mouse (acting as top-left corner)
    const isValid = this.game.validateBuildingPlacement(
      'player', 
      tile.x, 
      tile.y, 
      this.game.ghostWTiles, 
      this.game.ghostHTiles
    );

    if (!isValid) {
      this.game.ui.setStatusText("CANNOT BUILD HERE. FOOTPRINT OBSTRUCTED OR OUT OF BASE BOUNDS.");
      return;
    }

    // Placement confirmed
    this.game.playerCredits -= this.game.placementCost;
    this.game.spawnBuilding('player', this.game.placementType, tile.x, tile.y);
    
    // Clear placement
    this.game.placementType = null;
    document.body.style.cursor = 'default';
  }

  updateCamera(dt) {
    const cam = this.game.camera;
    
    // Limits based on full isometric map boundary size
    const limitX = this.game.grid.mapWidthPx;
    const limitY = this.game.grid.mapHeightPx;

    let moveX = 0;
    let moveY = 0;

    if (this.keys['w'] || this.keys['arrowup']) moveY = -1;
    if (this.keys['s'] || this.keys['arrowdown']) moveY = 1;
    if (this.keys['a'] || this.keys['arrowleft']) moveX = -1;
    if (this.keys['d'] || this.keys['arrowright']) moveX = 1;

    // Edge panning
    if (moveX === 0 && moveY === 0) {
      if (this.mouseX >= 0 && this.mouseX < this.edgeThreshold) moveX = -1;
      else if (this.mouseX > this.canvas.width - this.edgeThreshold && this.mouseX <= this.canvas.width) moveX = 1;

      if (this.mouseY >= 0 && this.mouseY < this.edgeThreshold) moveY = -1;
      else if (this.mouseY > this.canvas.height - this.edgeThreshold && this.mouseY <= this.canvas.height) moveY = 1;
    }

    if (moveX !== 0 || moveY !== 0) {
      const len = Math.hypot(moveX, moveY);
      cam.x += (moveX / len) * this.panSpeed * dt;
      cam.y += (moveY / len) * this.panSpeed * dt;

      // Clamp camera offsets
      cam.x = Math.max(0, Math.min(limitX - cam.width, cam.x));
      cam.y = Math.max(0, Math.min(limitY - cam.height, cam.y));
      
      this.updateWorldCoordinates();
    }
  }

  draw(ctx) {
    // Left-click dragging selection box is screen space direct draw
    if (this.isDragging) {
      ctx.strokeStyle = 'oklch(0.78 0.18 195)';
      ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(0, 255, 255, 0.08)';

      const w = this.mouseX - this.dragStartScreenX;
      const h = this.mouseY - this.dragStartScreenY;

      ctx.fillRect(this.dragStartScreenX, this.dragStartScreenY, w, h);
      ctx.strokeRect(this.dragStartScreenX, this.dragStartScreenY, w, h);
    }
  }
}
