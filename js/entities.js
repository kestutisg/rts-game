/**
 * Base Entity definition for Tiberian Odyssey
 * Represents any active object on the map (Units and Buildings).
 */

import { drawSelectionBrackets, drawHealthBar, getEntityPalette } from './render.js';
import { normalizeRaceId } from './races.js';

export class Entity {
  constructor(id, faction, health, maxHealth, race = 'gdi') {
    this.id = id;
    this.faction = faction; // 'player' or 'enemy'
    this.race = normalizeRaceId(race); // 'gdi' or 'nod'
    this.health = health;
    this.maxHealth = maxHealth;
    this.selected = false;
    this.isDead = false;
    this.repairing = false;
  }

  takeDamage(amount) {
    if (this.isDead) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) {
      this.die();
    }
  }

  die() {
    this.isDead = true;
  }

  update(dt, game) {
    // Override in subclasses
  }

  draw(ctx, camera) {
    // Override in subclasses
  }

  /**
   * Helper to render HP bar and selection brackets above entities
   */
  drawSelectionAndHP(ctx, camera, screenX, screenY, width, height, game = null) {
    if (!this.selected && this.health === this.maxHealth) return;

    if (this.selected) {
      const palette = getEntityPalette(this, game);
      drawSelectionBrackets(ctx, screenX, screenY, width, height, palette.primary);
    }

    drawHealthBar(ctx, screenX, screenY, width, this.health / this.maxHealth);

    if (this.repairing) {
      const markerY = screenY - height / 2 - 10;
      ctx.strokeStyle = '#00e676';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(screenX - 5, markerY);
      ctx.lineTo(screenX + 5, markerY);
      ctx.moveTo(screenX, markerY - 5);
      ctx.lineTo(screenX, markerY + 5);
      ctx.stroke();
    }
  }
}
