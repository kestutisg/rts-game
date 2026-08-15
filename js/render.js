/**
 * Shared 2.5D rendering helpers for Tiberian Odyssey
 */

import { getRacePalette as racePalette } from './races.js';

export function getFactionPalette(faction) {
  if (faction === 'player') {
    return {
      primary: '#4fc3f7',
      secondary: '#0288d1',
      dark: '#01579b',
      accent: '#80deea',
      trim: '#00bcd4',
      glow: 'rgba(79, 195, 247, 0.6)',
    };
  }
  return {
    primary: '#ef5350',
    secondary: '#c62828',
    dark: '#7f0000',
    accent: '#ff8a80',
    trim: '#ff5252',
    glow: 'rgba(239, 83, 80, 0.55)',
  };
}

export function getRacePalette(race) {
  return racePalette(race);
}

/** Prefer race palette; fall back to player/enemy colors */
export function getEntityPalette(entity, game = null) {
  if (entity?.race) return getRacePalette(entity.race);
  if (game) {
    const race = entity?.faction === 'player' ? game.playerRace : game.enemyRace;
    return getRacePalette(race);
  }
  return getFactionPalette(entity?.faction);
}

export function getScreenPos(worldX, worldY, camera) {
  return { x: worldX - camera.x, y: worldY - camera.y };
}

export function getElevationLift(game, worldX, worldY) {
  if (!game?.grid) return 0;
  const tile = game.grid.getTileAtWorld(worldX, worldY);
  return tile ? game.grid.getElevationOffset(tile.elevation) : 0;
}

export function drawSoftShadow(ctx, sx, sy, rx, ry, alpha = 0.42) {
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(sx + 4, sy + 3, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawIsoFootprint(ctx, ptTop, ptRight, ptBottom, ptLeft, fill, stroke) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(ptTop.x, ptTop.y);
  ctx.lineTo(ptRight.x, ptRight.y);
  ctx.lineTo(ptBottom.x, ptBottom.y);
  ctx.lineTo(ptLeft.x, ptLeft.y);
  ctx.closePath();
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

export function drawExtrudedBlock(ctx, ptTop, ptRight, ptBottom, ptLeft, h, colors) {
  const ptTopRoof = { x: ptTop.x, y: ptTop.y - h };
  const ptRightRoof = { x: ptRight.x, y: ptRight.y - h };
  const ptBottomRoof = { x: ptBottom.x, y: ptBottom.y - h };
  const ptLeftRoof = { x: ptLeft.x, y: ptLeft.y - h };

  ctx.fillStyle = colors.left;
  ctx.beginPath();
  ctx.moveTo(ptLeft.x, ptLeft.y);
  ctx.lineTo(ptBottom.x, ptBottom.y);
  ctx.lineTo(ptBottomRoof.x, ptBottomRoof.y);
  ctx.lineTo(ptLeftRoof.x, ptLeftRoof.y);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = colors.right;
  ctx.beginPath();
  ctx.moveTo(ptBottom.x, ptBottom.y);
  ctx.lineTo(ptRight.x, ptRight.y);
  ctx.lineTo(ptRightRoof.x, ptRightRoof.y);
  ctx.lineTo(ptBottomRoof.x, ptBottomRoof.y);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = colors.top;
  ctx.beginPath();
  ctx.moveTo(ptTopRoof.x, ptTopRoof.y);
  ctx.lineTo(ptRightRoof.x, ptRightRoof.y);
  ctx.lineTo(ptBottomRoof.x, ptBottomRoof.y);
  ctx.lineTo(ptLeftRoof.x, ptLeftRoof.y);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = colors.edge || '#3a444d';
  ctx.lineWidth = 1;
  ctx.stroke();

  return { ptTopRoof, ptRightRoof, ptBottomRoof, ptLeftRoof, centerX: (ptTopRoof.x + ptBottomRoof.x) / 2, centerY: (ptTopRoof.y + ptBottomRoof.y) / 2 };
}

export function drawWindowGlow(ctx, x, y, w, h, color, alpha = 0.7) {
  ctx.fillStyle = color.replace(')', ` / ${alpha})`).replace('rgb', 'rgba').replace('#', '');
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
}

export function drawCylinder(ctx, cx, cy, rx, ry, h, colors) {
  ctx.fillStyle = colors.side;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.top;
  ctx.beginPath();
  ctx.ellipse(cx, cy - h, rx * 0.92, ry * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = colors.edge || '#000';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - rx, cy);
  ctx.lineTo(cx - rx * 0.92, cy - h);
  ctx.moveTo(cx + rx, cy);
  ctx.lineTo(cx + rx * 0.92, cy - h);
  ctx.stroke();
}

export function drawSmokePuff(ctx, x, y, time, seed, alpha = 0.35) {
  const t = (time * 0.8 + seed) % 1;
  const px = x + Math.sin(seed * 3) * 4;
  const py = y - t * 18;
  const r = 3 + t * 5;
  ctx.fillStyle = `rgba(180, 180, 180, ${alpha * (1 - t)})`;
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fill();
}

export function drawSelectionBrackets(ctx, sx, sy, w, h, color) {
  const hw = w * 0.55;
  const hh = h * 0.28;
  const len = Math.min(hw, hh) * 0.45;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(sx - hw, sy - hh + len);
  ctx.lineTo(sx - hw, sy - hh);
  ctx.lineTo(sx - hw + len, sy - hh);
  ctx.moveTo(sx + hw - len, sy - hh);
  ctx.lineTo(sx + hw, sy - hh);
  ctx.lineTo(sx + hw, sy - hh + len);
  ctx.moveTo(sx + hw, sy + hh - len);
  ctx.lineTo(sx + hw, sy + hh);
  ctx.lineTo(sx + hw - len, sy + hh);
  ctx.moveTo(sx - hw + len, sy + hh);
  ctx.lineTo(sx - hw, sy + hh);
  ctx.lineTo(sx - hw, sy + hh - len);
  ctx.stroke();
}

export function drawHealthBar(ctx, sx, sy, w, ratio) {
  const barW = w;
  const barH = 4;
  const bx = sx - barW / 2;
  const by = sy - 18;

  ctx.fillStyle = '#0f1416';
  ctx.fillRect(bx, by, barW, barH);

  if (ratio > 0.5) ctx.fillStyle = '#00e676';
  else if (ratio > 0.25) ctx.fillStyle = '#ffab00';
  else ctx.fillStyle = '#ff5252';

  ctx.fillRect(bx, by, barW * ratio, barH);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(bx, by, barW, barH);
}

export function drawHazardStripes(ctx, p1, p2, thickness = 4, stripeW = 6, c1 = '#ffb300', c2 = '#1a1a1a') {
  ctx.save();
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);

  ctx.translate(p1.x, p1.y);
  ctx.rotate(angle);

  ctx.fillStyle = c2;
  ctx.fillRect(0, -thickness / 2, dist, thickness);

  ctx.fillStyle = c1;
  const stripeStep = stripeW * 2;
  for (let x = -stripeW; x < dist + stripeW; x += stripeStep) {
    ctx.beginPath();
    ctx.moveTo(x, -thickness / 2);
    ctx.lineTo(x + stripeW, -thickness / 2);
    ctx.lineTo(x, thickness / 2);
    ctx.lineTo(x - stripeW, thickness / 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function drawTiberiumCrystal(ctx, x, y, size = 6, color = '#00e676') {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size * 0.5, y - size * 0.2);
  ctx.lineTo(x + size * 0.3, y + size * 0.3);
  ctx.lineTo(x - size * 0.3, y + size * 0.3);
  ctx.lineTo(x - size * 0.5, y - size * 0.2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size * 0.2, y - size * 0.2);
  ctx.lineTo(x, y);
  ctx.lineTo(x - size * 0.2, y - size * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawElectricArc(ctx, x1, y1, x2, y2, time, color = '#80deea') {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const steps = 4;
  
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const nx = x1 + dx * t + (Math.sin(time * 35 + i * 4) * 6);
    const ny = y1 + dy * t + (Math.cos(time * 35 + i * 3) * 4);
    ctx.lineTo(nx, ny);
  }
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Core bright wire
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.restore();
}

export function drawRadarDish(ctx, x, y, radius, time, color = '#90a4ae') {
  ctx.save();
  const angle = time * 2.5;
  ctx.translate(x, y);
  ctx.scale(1, 0.55);

  // Rim
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Dish interior lattice
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.5, 0, Math.PI * 2);
  ctx.stroke();

  // Rotating feed horn arm
  const armX = Math.cos(angle) * radius;
  const armY = Math.sin(angle) * radius;
  ctx.strokeStyle = '#37474f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(armX, armY);
  ctx.stroke();

  // Feed tip
  ctx.fillStyle = '#ffab00';
  ctx.beginPath();
  ctx.arc(armX, armY, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
