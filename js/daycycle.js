/**
 * Day Cycle for Tiberian Odyssey
 * Cycles through morning, day, evening, and night with ambient lighting.
 */

const PHASES = [
  { name: 'MORNING', start: 0.00, end: 0.25 },
  { name: 'DAY',     start: 0.25, end: 0.50 },
  { name: 'EVENING', start: 0.50, end: 0.75 },
  { name: 'NIGHT',   start: 0.75, end: 1.00 },
];

const KEYFRAMES = [
  { t: 0.00, skyTop: '#1a2844', skyBottom: '#4a6888', ambient: 0.55, warm: 0.35, overlay: 0.08, stars: 0.0,  sunX: 0.15, sunY: 0.72 },
  { t: 0.25, skyTop: '#3a7ab8', skyBottom: '#7ab8d8', ambient: 1.00, warm: 0.10, overlay: 0.00, stars: 0.0,  sunX: 0.35, sunY: 0.28 },
  { t: 0.50, skyTop: '#2a6aaa', skyBottom: '#6aaccc', ambient: 1.00, warm: 0.05, overlay: 0.00, stars: 0.0,  sunX: 0.65, sunY: 0.22 },
  { t: 0.75, skyTop: '#3a2848', skyBottom: '#884838', ambient: 0.65, warm: 0.55, overlay: 0.12, stars: 0.0,  sunX: 0.85, sunY: 0.65 },
  { t: 1.00, skyTop: '#080818', skyBottom: '#101828', ambient: 0.30, warm: 0.05, overlay: 0.38, stars: 0.85, sunX: 0.50, sunY: 0.88 },
];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpColor(c1, c2, t) {
  const parse = (hex) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = parse(c1);
  const [r2, g2, b2] = parse(c2);
  const r = Math.round(lerp(r1, r2, t));
  const g = Math.round(lerp(g1, g2, t));
  const b = Math.round(lerp(b1, b2, t));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function sampleKeyframes(time) {
  let a = KEYFRAMES[KEYFRAMES.length - 1];
  let b = KEYFRAMES[0];

  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    if (time >= KEYFRAMES[i].t && time < KEYFRAMES[i + 1].t) {
      a = KEYFRAMES[i];
      b = KEYFRAMES[i + 1];
      break;
    }
  }

  const range = b.t - a.t || 1;
  const t = (time - a.t) / range;

  return {
    skyTop: lerpColor(a.skyTop, b.skyTop, t),
    skyBottom: lerpColor(a.skyBottom, b.skyBottom, t),
    ambient: lerp(a.ambient, b.ambient, t),
    warm: lerp(a.warm, b.warm, t),
    overlay: lerp(a.overlay, b.overlay, t),
    stars: lerp(a.stars, b.stars, t),
    sunX: lerp(a.sunX, b.sunX, t),
    sunY: lerp(a.sunY, b.sunY, t),
  };
}

export class DayCycle {
  constructor(cycleDuration = 120) {
    this.cycleDuration = cycleDuration;
    this.time = 0.3; // start near morning
  }

  update(dt) {
    this.time = (this.time + dt / this.cycleDuration) % 1;
  }

  getPhaseName() {
    for (const phase of PHASES) {
      if (this.time >= phase.start && this.time < phase.end) {
        return phase.name;
      }
    }
    return 'NIGHT';
  }

  getAmbient() {
    return sampleKeyframes(this.time);
  }

  /** Tint an RGB hex color by ambient light and warm shift */
  tintColor(hex, ambient) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    const warmR = lerp(r, Math.min(255, r + 40), ambient.warm);
    const warmG = lerp(g, Math.max(0, g - 10), ambient.warm * 0.5);
    const warmB = lerp(b, Math.max(0, b - 30), ambient.warm);

    const outR = Math.round(warmR * ambient.ambient);
    const outG = Math.round(warmG * ambient.ambient);
    const outB = Math.round(warmB * ambient.ambient);

    return `rgb(${outR}, ${outG}, ${outB})`;
  }
}
