// Star Harvest — every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const SHIP = {
  radius: 16,
  accel: 1500,
  maxSpeed: 470,
  /** Velocity decay: each second the ship keeps exp(-damping) of its speed with no thrust. */
  damping: 2.4,
  /** Seconds of blink-and-grace after a hull hit. */
  invulnerable: 1.6,
};

/** Hull hits the ship can take before it goes down. */
export const HULL = 3;
/** Star-seeds to gather for the win. */
export const QUOTA = 40;
/** Length of one night, in seconds. */
export const NIGHT_SECONDS = 90;
/** Seconds per wave; each new wave the meteors come faster and thicker. */
export const WAVE_SECONDS = 18;
export const MAX_WAVE = 5;

export const SEED = {
  radius: 11,
  fallSpeed: 108,
  fallJitter: 34,
  /** Side-to-side drift of a falling seed, in pixels and radians per second. */
  sway: 24,
  swaySpeed: 1.7,
  /** Seconds between seed spawns (waves 1-2; later waves are a touch denser). */
  interval: 0.62,
  points: 10,
};

export const METEOR = {
  minRadius: 13,
  maxRadius: 27,
  baseSpeed: 178,
  speedPerWave: 40,
  speedJitter: 70,
  /** Sideways drift, pixels per second, either way. */
  drift: 55,
  baseInterval: 1.12,
  intervalPerWave: 0.13,
  minInterval: 0.42,
};

export const POWERUP = {
  radius: 14,
  fallSpeed: 96,
  /** Seconds before the first power-up can appear. */
  firstAt: 8,
  intervalMin: 9,
  intervalMax: 14,
  magnetSeconds: 6,
  magnetRadius: 205,
  magnetPull: 640,
};

/** Chained collects inside the window raise the score multiplier, one step per 3 chain links. */
export const COMBO = { window: 2.6, maxMultiplier: 5, perStep: 3 };

/** Pool sizes: every entity the game can show at once, allocated once at boot. */
export const POOL = { seeds: 48, meteors: 42, powerups: 4, particles: 280, texts: 24 };

export const PALETTE = {
  backdrop: '#05070f',
  skyTop: '#070b1e',
  skyMid: '#101736',
  skyLow: '#1d2c4e',
  hillFar: '#13253f',
  hillNear: '#0c1f1d',
  moon: '#f4ecd2',
  text: '#eef1f5',
  muted: '#93a0b8',
  gold: '#ffd968',
  goldDeep: '#f2a93b',
  heart: '#ff6b81',
  heartEmpty: '#3a4358',
  shield: '#7fe3ff',
  magnet: '#ff8ae0',
  danger: '#ff6b57',
  panel: 'rgba(9, 13, 26, 0.86)',
  panelEdge: 'rgba(255, 255, 255, 0.16)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score and the mute choice are kept between visits (this browser only). */
export const BEST_KEY = 'star-harvest.best';
export const MUTE_KEY = 'star-harvest.muted';
