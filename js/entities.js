/**
 * Base Entity definition for Tiberian Odyssey
 * Represents any active object on the map (Units and Buildings).
 */

import { drawSelectionBrackets, drawHealthBar } from './render.js';

export class Entity {
  constructor(id, faction, health, maxHealth) {
    this.id = id;
    this.faction = faction; // 'player' or 'enemy'
    this.health = health;
    this.maxHealth = maxHealth;
    this.selected = false;
    this.isDead = false;
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
      drawSelectionBrackets(
        ctx, screenX, screenY, width, height,
        this.faction === 'player' ? '#4fc3f7' : '#ef5350'
      );
    }

    drawHealthBar(ctx, screenX, screenY, width, this.health / this.maxHealth);
  }
}
