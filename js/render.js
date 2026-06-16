/**
 * Shared isometric rendering helpers for Tiberian Odyssey
 */

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
