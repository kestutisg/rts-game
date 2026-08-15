/**
 * Card Art Generator for Tiberian Odyssey
 * Procedurally generates high-DPI isometric schematic backgrounds
 * for structure and unit build cards with faction-themed backdrops,
 * tech grids, tactical telemetry, and crisp 3D entity renders.
 */

import { Building } from './building.js';
import { Unit, Harvester } from './unit.js';
import { getRace, getRacePalette } from './races.js';
import { BUILDING_DEFS, UNIT_DEFS } from './tech.js';

// Cache for generated data URLs: key is `${race}_${type}`
const cardArtCache = new Map();

/**
 * Generate a high-DPI Data URL for a card background
 * @param {string} type - Building or unit type key
 * @param {boolean} isBuilding - True if structure, false if unit
 * @param {string} race - 'gdi' or 'nod'
 * @returns {string} Data URL of the generated image
 */
export function getCardArtUrl(type, isBuilding, race = 'gdi') {
  const cacheKey = `${race}_${isBuilding ? 'b' : 'u'}_${type}`;
  if (cardArtCache.has(cacheKey)) {
    return cardArtCache.get(cacheKey);
  }

  const dataUrl = renderCardBackground(type, isBuilding, race);
  cardArtCache.set(cacheKey, dataUrl);
  return dataUrl;
}

/**
 * Render a single card background on an offscreen canvas
 */
function renderCardBackground(type, isBuilding, race) {
  const width = 280;
  const height = 160;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const palette = getRacePalette(race);
  const isNod = race === 'nod';

  // 1. Base Gradient Backdrop
  const bgGrad = ctx.createRadialGradient(
    width * 0.72, height * 0.45, 10,
    width * 0.5, height * 0.5, width * 0.75
  );

  if (isNod) {
    bgGrad.addColorStop(0, 'rgba(68, 14, 20, 0.95)');
    bgGrad.addColorStop(0.4, 'rgba(40, 10, 15, 0.95)');
    bgGrad.addColorStop(0.8, 'rgba(18, 8, 10, 0.98)');
    bgGrad.addColorStop(1, 'rgba(10, 5, 6, 1)');
  } else {
    bgGrad.addColorStop(0, 'rgba(18, 48, 72, 0.95)');
    bgGrad.addColorStop(0.4, 'rgba(12, 32, 50, 0.95)');
    bgGrad.addColorStop(0.8, 'rgba(8, 18, 28, 0.98)');
    bgGrad.addColorStop(1, 'rgba(5, 10, 16, 1)');
  }

  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // 2. Tactical Tech Grid / Isometric Grid in Background
  ctx.save();
  ctx.strokeStyle = isNod ? 'rgba(239, 83, 80, 0.12)' : 'rgba(79, 195, 247, 0.12)';
  ctx.lineWidth = 1;

  // Isometric Grid Lines in subject area
  const gridStep = 18;
  const startX = width * 0.35;
  for (let x = startX; x < width + 60; x += gridStep) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - height * 0.6, height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x - height * 0.6, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  // Horizontal Tech Scanlines
  ctx.strokeStyle = isNod ? 'rgba(255, 23, 68, 0.06)' : 'rgba(0, 229, 255, 0.06)';
  for (let y = 6; y < height; y += 8) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();

  // 3. Tactical Watermark Emblem & Telemetry
  ctx.save();
  const themeColor = isNod ? '#ef5350' : '#4fc3f7';
  const subColor = isNod ? '#ff8a80' : '#80deea';

  // Faction Emblem Watermark in background behind subject
  ctx.globalAlpha = 0.13;
  ctx.fillStyle = themeColor;
  const emblemX = width * 0.72;
  const emblemY = height * 0.52;

  if (isNod) {
    // Nod Scorpion Triangle motif
    ctx.beginPath();
    ctx.moveTo(emblemX, emblemY - 42);
    ctx.lineTo(emblemX + 48, emblemY + 38);
    ctx.lineTo(emblemX - 48, emblemY + 38);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.moveTo(emblemX, emblemY - 20);
    ctx.lineTo(emblemX + 28, emblemY + 28);
    ctx.lineTo(emblemX - 28, emblemY + 28);
    ctx.closePath();
    ctx.fill();
  } else {
    // GDI Eagle Wing motif
    ctx.beginPath();
    ctx.moveTo(emblemX, emblemY - 32);
    ctx.lineTo(emblemX + 50, emblemY - 6);
    ctx.lineTo(emblemX + 38, emblemY + 28);
    ctx.lineTo(emblemX, emblemY + 12);
    ctx.lineTo(emblemX - 38, emblemY + 28);
    ctx.lineTo(emblemX - 50, emblemY - 6);
    ctx.closePath();
    ctx.fill();
  }

  // Telemetry stamp in top right
  ctx.globalAlpha = 0.55;
  ctx.font = '700 8px monospace';
  ctx.fillStyle = subColor;
  ctx.textAlign = 'right';
  const tag = isBuilding ? 'STRUC' : 'UNIT';
  ctx.fillText(`// ${race.toUpperCase()}-${tag} // [${type.toUpperCase()}]`, width - 8, 14);

  // Corner HUD Brackets
  ctx.strokeStyle = themeColor;
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.4;
  
  // Top right corner bracket
  ctx.beginPath();
  ctx.moveTo(width - 24, 6);
  ctx.lineTo(width - 6, 6);
  ctx.lineTo(width - 6, 24);
  ctx.stroke();

  // Bottom right corner bracket
  ctx.beginPath();
  ctx.moveTo(width - 24, height - 6);
  ctx.lineTo(width - 6, height - 6);
  ctx.lineTo(width - 6, height - 24);
  ctx.stroke();

  ctx.restore();

  // 4. Soft Focal Radial Spotlight under the model
  const spotGrad = ctx.createRadialGradient(
    width * 0.7, height * 0.62, 5,
    width * 0.7, height * 0.62, 65
  );
  spotGrad.addColorStop(0, isNod ? 'rgba(255, 23, 68, 0.22)' : 'rgba(79, 195, 247, 0.24)');
  spotGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = spotGrad;
  ctx.beginPath();
  ctx.ellipse(width * 0.7, height * 0.62, 70, 36, 0, 0, Math.PI * 2);
  ctx.fill();

  // 5. Draw 3D Isometric Entity (Building or Unit)
  ctx.save();
  const mockGame = {
    currentTime: 3.2,
    playerRace: race,
    enemyRace: isNod ? 'gdi' : 'nod',
    isEntityDetected: () => true,
    isLowPower: () => false,
    grid: null,
  };

  const targetX = width * 0.70;
  const targetY = height * 0.58;

  if (isBuilding) {
    // Instantiate building with dummy coordinates
    const b = new Building(999, 'player', type, 0, 0, 36, 10, race);
    b.isUnderConstruction = false;
    b.health = b.maxHealth;
    b.selected = false;

    // Building center coordinates
    const previewCorners = [
      b.getTileCoordsLocal(0, 0),
      b.getTileCoordsLocal(b.gridWidth, 0),
      b.getTileCoordsLocal(b.gridWidth, b.gridHeight),
      b.getTileCoordsLocal(0, b.gridHeight),
    ];
    const worldCenterX = previewCorners.reduce((sum, point) => sum + point.x, 0) / previewCorners.length;
    const worldCenterY = previewCorners.reduce((sum, point) => sum + point.y, 0) / previewCorners.length;

    // Adjust vertical offset based on building height and size for optimal framing
    let yOffset = b.height3D * 0.45;
    if (type === 'cyard') yOffset += 6;
    if (type === 'laser') yOffset += 8;
    if (type === 'turret') yOffset += 4;
    if (type === 'fence' || type === 'gate') yOffset -= 8;

    const camera = {
      x: worldCenterX - targetX,
      y: worldCenterY - targetY - yOffset,
    };

    b.draw(ctx, camera, mockGame);
  } else {
    // Instantiate Unit
    let u;
    if (type === 'harvester') {
      u = new Harvester(999, 'player', 0, 0, race);
    } else {
      u = new Unit(999, 'player', type, 0, 0, race);
    }
    u.selected = false;
    u.health = u.maxHealth;

    let uYOffset = 0;
    if (type === 'plane') uYOffset = 14;
    if (type === 'harvester') uYOffset = -4;

    const camera = {
      x: -targetX,
      y: -targetY - uYOffset,
    };

    u.draw(ctx, camera, mockGame);
  }
  ctx.restore();

  // 6. High-Contrast Dark Gradient Scrim on Left Side (for text legibility)
  const textScrim = ctx.createLinearGradient(0, 0, width, 0);
  if (isNod) {
    textScrim.addColorStop(0, 'rgba(12, 6, 8, 0.95)');
    textScrim.addColorStop(0.38, 'rgba(12, 6, 8, 0.88)');
    textScrim.addColorStop(0.65, 'rgba(12, 6, 8, 0.45)');
    textScrim.addColorStop(1, 'rgba(12, 6, 8, 0.1)');
  } else {
    textScrim.addColorStop(0, 'rgba(6, 12, 18, 0.95)');
    textScrim.addColorStop(0.38, 'rgba(6, 12, 18, 0.88)');
    textScrim.addColorStop(0.65, 'rgba(6, 12, 18, 0.45)');
    textScrim.addColorStop(1, 'rgba(6, 12, 18, 0.1)');
  }

  ctx.fillStyle = textScrim;
  ctx.fillRect(0, 0, width, height);

  // 7. Subtle Vignette & Neon Edge Trim
  ctx.strokeStyle = isNod ? 'rgba(239, 83, 80, 0.25)' : 'rgba(79, 195, 247, 0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

  return canvas.toDataURL('image/png');
}

/**
 * Apply card background images to all building and unit cards in the DOM
 * @param {string} race - Active player race ('gdi' or 'nod')
 */
export function updateAllCardBackgrounds(race = 'gdi') {
  // Update building cards
  Object.keys(BUILDING_DEFS).forEach(type => {
    const btn = document.getElementById(`build-${type}`);
    if (!btn) return;
    const bgUrl = getCardArtUrl(type, true, race);
    btn.style.setProperty('--card-bg', `url("${bgUrl}")`);
  });

  // Update unit cards
  Object.keys(UNIT_DEFS).forEach(type => {
    const btn = document.getElementById(`train-${type}`);
    if (!btn) return;
    const bgUrl = getCardArtUrl(type, false, race);
    btn.style.setProperty('--card-bg', `url("${bgUrl}")`);
  });
}
