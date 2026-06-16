/**
 * Input Handler for Tiberian Odyssey
 * Manages mouse drag selection, right-click commands, building placement clicks,
 * keyboard/mouse-edge camera panning, and coordinate translation.
 */

export class InputHandler {
  constructor(game) {
    this.game = game;
    this.canvas = game.canvas;

    // Mouse positions
    this.mouseX = 0; // screen coordinates
    this.mouseY = 0;
    this.worldMouseX = 0; // translation to world coordinates
    this.worldMouseY = 0;

    // Selection Drag Box
    this.isDragging = false;
    this.dragStartX = 0; // world coord when mousedown
    this.dragStartY = 0;

    // Camera Panning Keys
    this.keys = {};

    // Edge Panning threshold
    this.edgeThreshold = 25; // pixels from screen border to trigger scroll
    this.panSpeed = 300; // pixels per second

    this.initListeners();
  }

  initListeners() {
    // Keyboard
    window.addEventListener('keydown', (e) => {
      this.keys[e.key.toLowerCase()] = true;
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });

    // Mouse movement
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
      
      this.updateWorldCoordinates();

      // If building placement is active, update ghost position
      if (this.game.placementType) {
        this.updatePlacementGhost();
      }
    });

    // Mouse Down (Left click / Drag Start)
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // Only handle left clicks

      // If we are currently placing a building
      if (this.game.placementType) {
        this.tryPlaceBuilding();
        return;
      }

      this.isDragging = true;
      this.dragStartX = this.worldMouseX;
      this.dragStartY = this.worldMouseY;
    });

    // Mouse Up (Left click select / Drag End)
    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0 || !this.isDragging) return;
      this.isDragging = false;

      const dragEndX = this.worldMouseX;
      const dragEndY = this.worldMouseY;

      const width = Math.abs(dragEndX - this.dragStartX);
      const height = Math.abs(dragEndY - this.dragStartY);

      // 1. Check if it's a single click vs a drag box
      if (width < 6 && height < 6) {
        this.handleSingleClickSelection();
      } else {
        this.handleDragBoxSelection(
          Math.min(this.dragStartX, dragEndX),
          Math.min(this.dragStartY, dragEndY),
          Math.max(this.dragStartX, dragEndX),
          Math.max(this.dragStartY, dragEndY)
        );
      }
    });

    // Right Click (Issue Commands)
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault(); // Prevent standard browser menu
      this.issueCommand();
    });
  }

  updateWorldCoordinates() {
    this.worldMouseX = this.mouseX + this.game.camera.x;
    this.worldMouseY = this.mouseY + this.game.camera.y;
  }

  handleSingleClickSelection() {
    // Clear selection
    this.game.selectedEntities.forEach(ent => ent.selected = false);
    this.game.selectedEntities = [];

    // Find if we clicked on an entity (prioritize friendly units, then enemy units, then buildings)
    let clickedEntity = null;

    // Check friendly units
    for (const unit of this.game.playerEntities) {
      if (unit.isDead || unit.isBuilding) continue;
      const dist = Math.hypot(unit.x - this.worldMouseX, unit.y - this.worldMouseY);
      if (dist <= unit.radius + 4) {
        clickedEntity = unit;
        break;
      }
    }

    // Check enemy units
    if (!clickedEntity) {
      for (const unit of this.game.enemyEntities) {
        if (unit.isDead || unit.isBuilding) continue;
        const dist = Math.hypot(unit.x - this.worldMouseX, unit.y - this.worldMouseY);
        if (dist <= unit.radius + 4) {
          clickedEntity = unit;
          break;
        }
      }
    }

    // Check buildings (player and enemy)
    if (!clickedEntity) {
      const allBuildings = [...this.game.playerEntities, ...this.game.enemyEntities]
        .filter(ent => ent.isBuilding && !ent.isDead);

      for (const b of allBuildings) {
        const left = b.x - b.widthPx / 2;
        const right = b.x + b.widthPx / 2;
        const top = b.y - b.heightPx / 2;
        const bottom = b.y + b.heightPx / 2;

        if (this.worldMouseX >= left && this.worldMouseX <= right &&
            this.worldMouseY >= top && this.worldMouseY <= bottom) {
          clickedEntity = b;
          break;
        }
      }
    }

    if (clickedEntity) {
      clickedEntity.selected = true;
      this.game.selectedEntities.push(clickedEntity);
      
      // Update sidebar details if player building selected
      if (clickedEntity.isBuilding && clickedEntity.faction === 'player') {
        this.game.ui.onBuildingSelected(clickedEntity);
      }
    } else {
      this.game.ui.onBuildingSelected(null);
    }
  }

  handleDragBoxSelection(xMin, yMin, xMax, yMax) {
    // Clear selection
    this.game.selectedEntities.forEach(ent => ent.selected = false);
    this.game.selectedEntities = [];

    // Drag selection only selects player mobile units
    for (const unit of this.game.playerEntities) {
      if (unit.isDead || unit.isBuilding) continue;

      if (unit.x >= xMin && unit.x <= xMax &&
          unit.y >= yMin && unit.y <= yMax) {
        unit.selected = true;
        this.game.selectedEntities.push(unit);
      }
    }
    this.game.ui.onBuildingSelected(null); // Deselect structural UI when multiple units are grouped
  }

  issueCommand() {
    const selectedUnits = this.game.selectedEntities.filter(ent => !ent.isBuilding && ent.faction === 'player');
    if (selectedUnits.length === 0) return;

    // Check if right click target was an entity (enemy to attack, refinery to deposit)
    let clickTargetEntity = null;
    const allEntities = [...this.game.playerEntities, ...this.game.enemyEntities];
    
    for (const ent of allEntities) {
      if (ent.isDead) continue;
      
      if (ent.isBuilding) {
        const left = ent.x - ent.widthPx / 2;
        const right = ent.x + ent.widthPx / 2;
        const top = ent.y - ent.heightPx / 2;
        const bottom = ent.y + ent.heightPx / 2;

        if (this.worldMouseX >= left && this.worldMouseX <= right &&
            this.worldMouseY >= top && this.worldMouseY <= bottom) {
          clickTargetEntity = ent;
          break;
        }
      } else {
        const dist = Math.hypot(ent.x - this.worldMouseX, ent.y - this.worldMouseY);
        if (dist <= ent.radius + 6) {
          clickTargetEntity = ent;
          break;
        }
      }
    }

    const clickedTile = this.game.grid.getTileAtWorld(this.worldMouseX, this.worldMouseY);
    if (!clickedTile) return;

    // Order units
    selectedUnits.forEach((unit, idx) => {
      // 1. Attack Command (if enemy clicked)
      if (clickTargetEntity && clickTargetEntity.faction === 'enemy') {
        if (unit.type !== 'harvester') {
          unit.combatTarget = clickTargetEntity;
          unit.state = 'attacking';
        }
        return;
      }

      // 2. Harvester commands
      if (unit.type === 'harvester') {
        if (clickTargetEntity && clickTargetEntity.type === 'refinery' && clickTargetEntity.faction === 'player') {
          // Manual unload order
          unit.depositTargetRefinery = clickTargetEntity;
          unit.findRefineryAndGo(this.game); // route to this refinery
        } else if (clickedTile.type === 'ore') {
          // Manual harvest order
          unit.miningTargetTile = clickedTile;
          unit.goToOre(clickedTile, this.game);
        } else {
          // Normal move order
          const path = this.game.grid.findPath(
            this.game.grid.getTileAtWorld(unit.x, unit.y),
            clickedTile,
            unit
          );
          if (path) {
            unit.path = path;
            unit.pathIndex = 0;
            unit.state = 'moving';
            unit.miningTargetTile = null; // clear harvesting target
            unit.depositTargetRefinery = null;
          }
        }
        return;
      }

      // 3. Combat unit normal movement
      // Add slight offset for group movement so they don't stack on a single point
      let targetTile = clickedTile;
      if (selectedUnits.length > 1) {
        // Spiral offsets based on index
        const offsetRadius = Math.ceil(Math.sqrt(idx + 1) - 1);
        const angle = idx * 2.39996; // Golden angle for even spacing
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
        unit.combatTarget = null; // Clear attack orders
      }
    });

    // Play visual feedback ping at click location
    this.game.createClickPing(this.worldMouseX, this.worldMouseY);
  }

  tryPlaceBuilding() {
    const ghost = document.getElementById('placement-ghost');
    if (!ghost || ghost.classList.contains('invalid')) {
      this.game.ui.setStatusText("CANNOT BUILD HERE. OUT OF BASE LIMITS OR OBSTRUCTED.");
      return;
    }

    const tileX = Math.floor((this.worldMouseX - this.game.ghostWPx / 2) / this.game.grid.tileSize);
    const tileY = Math.floor((this.worldMouseY - this.game.ghostHPx / 2) / this.game.grid.tileSize);
    
    // Deduct credits
    this.game.playerCredits -= this.game.placementCost;
    
    // Spawn building
    this.game.spawnBuilding('player', this.game.placementType, tileX, tileY);
    
    // Reset placement
    this.game.placementType = null;
    ghost.classList.add('hidden');
    document.body.style.cursor = 'default';
  }

  updatePlacementGhost() {
    const ghost = document.getElementById('placement-ghost');
    if (!ghost) return;

    // Convert mouse to grid tile coordinate corresponding to the top-left of the building size
    const halfW = this.game.ghostWPx / 2;
    const halfH = this.game.ghostHPx / 2;

    const tileX = Math.floor((this.worldMouseX - halfW) / this.game.grid.tileSize);
    const tileY = Math.floor((this.worldMouseY - halfH) / this.game.grid.tileSize);

    // Screen draw coordinates
    const screenX = tileX * this.game.grid.tileSize - this.game.camera.x;
    const screenY = tileY * this.game.grid.tileSize - this.game.camera.y;

    ghost.style.left = `${screenX}px`;
    ghost.style.top = `${screenY}px`;
    ghost.style.width = `${this.game.ghostWPx}px`;
    ghost.style.height = `${this.game.ghostHPx}px`;

    // Validate placement
    const isValid = this.game.validateBuildingPlacement('player', tileX, tileY, this.game.ghostWTiles, this.game.ghostHTiles);
    if (isValid) {
      ghost.classList.remove('invalid');
    } else {
      ghost.classList.add('invalid');
    }
  }

  updateCamera(dt) {
    const cam = this.game.camera;
    const mapWidthPx = this.game.grid.width * this.game.grid.tileSize;
    const mapHeightPx = this.game.grid.height * this.game.grid.tileSize;

    let moveX = 0;
    let moveY = 0;

    // 1. Keyboard Panning (WASD / Arrows)
    if (this.keys['w'] || this.keys['arrowup']) moveY = -1;
    if (this.keys['s'] || this.keys['arrowdown']) moveY = 1;
    if (this.keys['a'] || this.keys['arrowleft']) moveX = -1;
    if (this.keys['d'] || this.keys['arrowright']) moveX = 1;

    // 2. Mouse-Edge Panning (active when page is focused)
    if (moveX === 0 && moveY === 0) {
      if (this.mouseX >= 0 && this.mouseX < this.edgeThreshold) moveX = -1;
      else if (this.mouseX > this.canvas.width - this.edgeThreshold && this.mouseX <= this.canvas.width) moveX = 1;

      if (this.mouseY >= 0 && this.mouseY < this.edgeThreshold) moveY = -1;
      else if (this.mouseY > this.canvas.height - this.edgeThreshold && this.mouseY <= this.canvas.height) moveY = 1;
    }

    // Apply movement
    if (moveX !== 0 || moveY !== 0) {
      // Normalize vector
      const length = Math.hypot(moveX, moveY);
      cam.x += (moveX / length) * this.panSpeed * dt;
      cam.y += (moveY / length) * this.panSpeed * dt;

      // Clamp camera to grid bounds
      cam.x = Math.max(0, Math.min(mapWidthPx - cam.width, cam.x));
      cam.y = Math.max(0, Math.min(mapHeightPx - cam.height, cam.y));
      
      this.updateWorldCoordinates();
    }
  }

  draw(ctx) {
    // Draw drag selection box on canvas
    if (this.isDragging) {
      const screenStartX = this.dragStartX - this.game.camera.x;
      const screenStartY = this.dragStartY - this.game.camera.y;
      
      ctx.strokeStyle = 'oklch(0.78 0.18 195)'; // Neon cyan
      ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(0, 255, 255, 0.1)';
      
      const width = this.mouseX - screenStartX;
      const height = this.mouseY - screenStartY;

      ctx.fillRect(screenStartX, screenStartY, width, height);
      ctx.strokeRect(screenStartX, screenStartY, width, height);
    }
  }
}
