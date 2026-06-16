/**
 * Base Entity definition for Tiberian Odyssey
 * Represents any active object on the map (Units and Buildings).
 */

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
   * Helper to render HP bar above selected or damaged entities
   */
  drawSelectionAndHP(ctx, camera, screenX, screenY, width, height) {
    if (!this.selected && this.health === this.maxHealth) return;

    const barW = width;
    const barH = 4;
    const bx = screenX - barW / 2;
    const by = screenY - height / 2 - 10;

    // Draw Selection Ring if selected
    if (this.selected) {
      ctx.strokeStyle = this.faction === 'player' ? 'oklch(0.78 0.18 195)' : 'oklch(0.62 0.22 25)';
      ctx.lineWidth = 1.2;
      
      // Draw flat ellipse to lie flat on the 2.5D ground
      ctx.beginPath();
      ctx.ellipse(screenX, screenY, width * 0.9, height * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Draw Health Bar
    ctx.fillStyle = '#0f1416'; // Background gray
    ctx.fillRect(bx, by, barW, barH);

    const ratio = this.health / this.maxHealth;
    // Tiberian Sun theme health colors: Green (>50%), Yellow (25-50%), Red (<25%)
    if (ratio > 0.5) {
      ctx.fillStyle = 'oklch(0.8 0.22 142)';
    } else if (ratio > 0.25) {
      ctx.fillStyle = 'oklch(0.7 0.2 45)';
    } else {
      ctx.fillStyle = 'oklch(0.62 0.22 25)';
    }
    ctx.fillRect(bx, by, barW * ratio, barH);
    
    // Draw outline
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(bx, by, barW, barH);
  }
}
