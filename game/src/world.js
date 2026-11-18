// Star Harvest — the game's rules and state, with no drawing and no browser in
// it: the seed-ship, the pools of falling star-seeds, meteors and power-ups,
// spawning, collisions, combo scoring, hull, waves, the night timer, particles
// and floating score text. step() advances one fixed step and returns what
// happened as bit flags, so the caller can react (screens, sound) without the
// world knowing about either. Nothing here allocates after createWorld returns.
import {
  COMBO, FIELD, HULL, MAX_WAVE, METEOR, NIGHT_SECONDS, POOL, POWERUP, QUOTA, SEED, SHIP, WAVE_SECONDS,
} from './config.js';

export const EVENT_COLLECT = 1;
export const EVENT_HIT = 2;
export const EVENT_OVER = 4;
export const EVENT_WIN = 8;
export const EVENT_POWER = 16;
export const EVENT_SHIELD_BLOCK = 32;

export const POWER_SHIELD = 'shield';
export const POWER_MAGNET = 'magnet';

/** Particle colours, by name, so callers ask for a mood rather than a hex code. */
const SPARKS = {
  gold: '#ffd968',
  white: '#fff6d8',
  teal: '#7fe7d2',
  ember: '#ff9a5c',
  red: '#ff6b57',
  cyan: '#7fe3ff',
  magenta: '#ff8ae0',
  grey: '#b8c4d4',
};

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

/** The score multiplier a combo chain is worth: one step up per few links, capped. */
export function comboMultiplier(chain) {
  if (chain <= 0) return 1;
  return 1 + Math.min(COMBO.maxMultiplier - 1, Math.floor((chain - 1) / COMBO.perStep));
}

export function createWorld(random) {
  const ship = {
    x: FIELD.width / 2, y: FIELD.height * 0.62, vx: 0, vy: 0,
    radius: SHIP.radius, invulnerable: 0, shield: false, magnetTimer: 0, tilt: 0, thrust: 0,
  };
  const seeds = [];
  for (let index = 0; index < POOL.seeds; index += 1) {
    seeds.push({ active: false, x: 0, baseX: 0, y: 0, vy: 0, phase: 0 });
  }
  const meteors = [];
  for (let index = 0; index < POOL.meteors; index += 1) {
    meteors.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, radius: 0, angle: 0, spin: 0, look: 0, fast: false });
  }
  const powerups = [];
  for (let index = 0; index < POOL.powerups; index += 1) {
    powerups.push({ active: false, x: 0, y: 0, vy: 0, kind: POWER_SHIELD, phase: 0 });
  }
  const particles = [];
  for (let index = 0; index < POOL.particles; index += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#ffffff', gravity: 0 });
  }
  const texts = [];
  for (let index = 0; index < POOL.texts; index += 1) {
    texts.push({ active: false, x: 0, y: 0, life: 0, maxLife: 1, value: '', color: '#ffffff', size: 20 });
  }

  const state = {
    ship, seeds, meteors, powerups, particles, texts,
    time: 0, elapsed: 0, timeLeft: NIGHT_SECONDS, wave: 1,
    score: 0, collected: 0, hull: HULL,
    combo: 0, comboTimer: 0, comboPulse: 0, bestChain: 0,
    over: false, won: false, overReason: '', lastPower: '',
    shake: 0, flash: 0, flashColor: '255, 70, 50',
    seedTimer: 0.35, meteorTimer: 1.3, powerTimer: POWERUP.firstAt, nextPower: POWER_SHIELD,
  };

  function reset() {
    ship.x = FIELD.width / 2;
    ship.y = FIELD.height * 0.62;
    ship.vx = 0;
    ship.vy = 0;
    ship.invulnerable = 0;
    ship.shield = false;
    ship.magnetTimer = 0;
    ship.tilt = 0;
    ship.thrust = 0;
    for (const seed of seeds) seed.active = false;
    for (const meteor of meteors) meteor.active = false;
    for (const powerup of powerups) powerup.active = false;
    for (const particle of particles) particle.active = false;
    for (const text of texts) text.active = false;
    state.elapsed = 0;
    state.timeLeft = NIGHT_SECONDS;
    state.wave = 1;
    state.score = 0;
    state.collected = 0;
    state.hull = HULL;
    state.combo = 0;
    state.comboTimer = 0;
    state.comboPulse = 0;
    state.bestChain = 0;
    state.over = false;
    state.won = false;
    state.overReason = '';
    state.lastPower = '';
    state.shake = 0;
    state.flash = 0;
    state.seedTimer = 0.35;
    state.meteorTimer = 1.3;
    state.powerTimer = POWERUP.firstAt + random() * 3;
    state.nextPower = random() < 0.5 ? POWER_SHIELD : POWER_MAGNET;
  }

  function burst(x, y, color, count, { speed = 260, life = 0.6, size = 3.4, gravity = 240 } = {}) {
    let spawned = 0;
    for (const particle of particles) {
      if (spawned >= count) break;
      if (particle.active) continue;
      const angle = random() * Math.PI * 2;
      const velocity = (0.25 + random() * 0.75) * speed;
      particle.active = true;
      particle.x = x;
      particle.y = y;
      particle.vx = Math.cos(angle) * velocity;
      particle.vy = Math.sin(angle) * velocity - speed * 0.25;
      particle.maxLife = life * (0.6 + random() * 0.7);
      particle.life = particle.maxLife;
      particle.size = size * (0.6 + random() * 0.8);
      particle.color = SPARKS[color] ?? color;
      particle.gravity = gravity;
      spawned += 1;
    }
  }

  function floatText(x, y, value, color, size = 20) {
    for (const text of texts) {
      if (text.active) continue;
      text.active = true;
      text.x = x;
      text.y = y;
      text.maxLife = 0.95;
      text.life = text.maxLife;
      text.value = value;
      text.color = color;
      text.size = size;
      return;
    }
  }

  /** A spray of celebration bursts across the sky, for the win. */
  function celebrate() {
    const colours = ['gold', 'white', 'teal', 'magenta'];
    for (let index = 0; index < 5; index += 1) {
      burst(
        140 + random() * (FIELD.width - 280),
        110 + random() * 260,
        colours[index % colours.length],
        22,
        { speed: 320, life: 0.95, size: 3.8, gravity: 150 },
      );
    }
    burst(ship.x, ship.y - 12, 'gold', 26, { speed: 300, life: 0.9, size: 4, gravity: 170 });
  }

  /** Where a new seed appears: the pattern changes with the wave. */
  function seedSpawnX() {
    const pattern = (state.wave - 1) % 3;
    if (pattern === 0) return SEED.radius + random() * (FIELD.width - SEED.radius * 2);
    const centre = FIELD.width / 2 + Math.sin(state.time * 0.33) * 360;
    const spread = pattern === 1 ? 160 : 70;
    return clamp(centre + (random() * 2 - 1) * spread, SEED.radius, FIELD.width - SEED.radius);
  }

  function spawnSeed() {
    for (const seed of seeds) {
      if (seed.active) continue;
      seed.active = true;
      seed.baseX = seedSpawnX();
      seed.x = seed.baseX;
      seed.y = -SEED.radius - 4;
      seed.vy = SEED.fallSpeed + (random() * 2 - 1) * SEED.fallJitter;
      seed.phase = random() * Math.PI * 2;
      return;
    }
  }

  function meteorInterval() {
    return Math.max(METEOR.minInterval, METEOR.baseInterval - (state.wave - 1) * METEOR.intervalPerWave);
  }

  function spawnMeteor() {
    for (const meteor of meteors) {
      if (meteor.active) continue;
      meteor.active = true;
      meteor.radius = METEOR.minRadius + random() * (METEOR.maxRadius - METEOR.minRadius);
      meteor.fast = state.wave >= 3 && random() < 0.18;
      if (meteor.fast) meteor.radius *= 0.75;
      meteor.x = meteor.radius + random() * (FIELD.width - meteor.radius * 2);
      meteor.y = -meteor.radius - 6;
      meteor.vx = (random() * 2 - 1) * METEOR.drift;
      meteor.vy = METEOR.baseSpeed + METEOR.speedPerWave * (state.wave - 1) + random() * METEOR.speedJitter;
      if (meteor.fast) meteor.vy *= 1.4;
      meteor.angle = random() * Math.PI * 2;
      meteor.spin = (random() * 2 - 1) * 1.6;
      meteor.look = random() * 1000;
      return;
    }
  }

  function spawnPowerup() {
    for (const powerup of powerups) {
      if (powerup.active) continue;
      powerup.active = true;
      powerup.kind = state.nextPower;
      state.nextPower = state.nextPower === POWER_SHIELD ? POWER_MAGNET : POWER_SHIELD;
      powerup.x = POWERUP.radius + 10 + random() * (FIELD.width - POWERUP.radius * 2 - 20);
      powerup.y = -POWERUP.radius - 4;
      powerup.vy = POWERUP.fallSpeed;
      powerup.phase = random() * Math.PI * 2;
      return;
    }
  }

  function finish(wonGame, reason) {
    state.over = true;
    state.won = wonGame;
    state.overReason = reason;
    if (!wonGame && reason === 'hull') {
      burst(ship.x, ship.y, 'ember', 34, { speed: 380, life: 0.9, size: 4.4, gravity: 200 });
      burst(ship.x, ship.y, 'red', 20, { speed: 260, life: 0.7, size: 3.6, gravity: 160 });
      state.shake = 16;
    }
  }

  /** Move the falling things with no collisions: the title backdrop and the settled end screens. */
  function driftEntities(dt) {
    for (const seed of seeds) {
      if (!seed.active) continue;
      seed.y += seed.vy * dt;
      seed.x = seed.baseX + Math.sin(state.time * SEED.swaySpeed + seed.phase) * SEED.sway;
      if (seed.y > FIELD.height + 24) seed.active = false;
    }
    for (const meteor of meteors) {
      if (!meteor.active) continue;
      meteor.x += meteor.vx * dt;
      meteor.y += meteor.vy * dt;
      meteor.angle += meteor.spin * dt;
      if (meteor.y - meteor.radius > FIELD.height || meteor.x < -90 || meteor.x > FIELD.width + 90) meteor.active = false;
    }
    for (const powerup of powerups) {
      if (!powerup.active) continue;
      powerup.y += powerup.vy * dt;
      if (powerup.y > FIELD.height + 24) powerup.active = false;
    }
  }

  function updateFx(dt) {
    for (const particle of particles) {
      if (!particle.active) continue;
      particle.life -= dt;
      if (particle.life <= 0) {
        particle.active = false;
        continue;
      }
      particle.vy += particle.gravity * dt;
      particle.vx *= Math.exp(-1.6 * dt);
      particle.vy *= Math.exp(-0.6 * dt);
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    }
    for (const text of texts) {
      if (!text.active) continue;
      text.life -= dt;
      if (text.life <= 0) {
        text.active = false;
        continue;
      }
      text.y -= 36 * dt;
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - 34 * dt);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - 2.4 * dt);
    if (state.comboPulse > 0) state.comboPulse = Math.max(0, state.comboPulse - dt);
  }

  function collectSeed(seed) {
    seed.active = false;
    state.collected += 1;
    state.combo = state.comboTimer > 0 ? state.combo + 1 : 1;
    state.comboTimer = COMBO.window;
    state.comboPulse = 0.28;
    if (state.combo > state.bestChain) state.bestChain = state.combo;
    const multiplier = comboMultiplier(state.combo);
    const gained = SEED.points * multiplier;
    state.score += gained;
    burst(seed.x, seed.y, 'gold', 7, { speed: 210, life: 0.5, size: 3, gravity: 130 });
    floatText(
      ship.x, ship.y - 32,
      multiplier > 1 ? `+${gained} x${multiplier}` : `+${gained}`,
      '#ffd968', multiplier > 1 ? 24 : 20,
    );
    return EVENT_COLLECT;
  }

  function hitMeteor(meteor) {
    if (ship.invulnerable > 0) return 0;
    meteor.active = false;
    if (ship.shield) {
      ship.shield = false;
      ship.invulnerable = 0.9;
      state.shake = Math.max(state.shake, 6);
      burst(meteor.x, meteor.y, 'cyan', 14, { speed: 250, life: 0.5, size: 3.2, gravity: 120 });
      burst(meteor.x, meteor.y, 'grey', 8, { speed: 190, life: 0.45, size: 3, gravity: 200 });
      floatText(ship.x, ship.y - 34, 'Shield down!', '#7fe3ff', 21);
      return EVENT_SHIELD_BLOCK;
    }
    state.hull -= 1;
    ship.invulnerable = SHIP.invulnerable;
    state.shake = 13;
    state.flash = 0.5;
    state.flashColor = '255, 70, 50';
    burst(ship.x, ship.y, 'ember', 16, { speed: 300, life: 0.6, size: 3.6, gravity: 190 });
    floatText(ship.x, ship.y - 34, 'Hull hit!', '#ff8a75', 22);
    if (state.hull <= 0) {
      finish(false, 'hull');
      return EVENT_HIT | EVENT_OVER;
    }
    return EVENT_HIT;
  }

  function collectPowerup(powerup) {
    powerup.active = false;
    state.lastPower = powerup.kind;
    if (powerup.kind === POWER_SHIELD) {
      if (ship.shield) {
        state.score += 100;
        floatText(ship.x, ship.y - 34, 'Shield full +100', '#7fe3ff', 20);
      } else {
        floatText(ship.x, ship.y - 34, 'Shield up!', '#7fe3ff', 22);
      }
      ship.shield = true;
      burst(powerup.x, powerup.y, 'cyan', 12, { speed: 200, life: 0.55, size: 3.2, gravity: 90 });
    } else {
      if (ship.magnetTimer > 0) state.score += 50;
      ship.magnetTimer = POWERUP.magnetSeconds;
      floatText(ship.x, ship.y - 34, 'Magnet on!', '#ff8ae0', 22);
      burst(powerup.x, powerup.y, 'magenta', 12, { speed: 200, life: 0.55, size: 3.2, gravity: 90 });
    }
    return EVENT_POWER;
  }

  /** Move everything in play and resolve what touches the ship. */
  function moveAndCollide(dt) {
    let events = 0;
    const magnetOn = ship.magnetTimer > 0;

    for (const seed of seeds) {
      if (!seed.active) continue;
      seed.y += seed.vy * dt;
      if (magnetOn) {
        const dx = ship.x - seed.baseX;
        const dy = ship.y - seed.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 1 && distance < POWERUP.magnetRadius) {
          const pull = POWERUP.magnetPull * (1.15 - distance / POWERUP.magnetRadius) * dt;
          seed.baseX += (dx / distance) * pull;
          seed.y += (dy / distance) * pull;
        }
      }
      seed.x = seed.baseX + Math.sin(state.time * SEED.swaySpeed + seed.phase) * SEED.sway;
      if (seed.y > FIELD.height + 24) {
        seed.active = false;
        continue;
      }
      const dx = seed.x - ship.x;
      const dy = seed.y - ship.y;
      const reach = ship.radius + SEED.radius + 5;
      if (dx * dx + dy * dy < reach * reach) {
        events |= collectSeed(seed);
        if (state.collected >= QUOTA && !state.over) {
          finish(true, '');
          events |= EVENT_WIN;
        }
      }
    }

    for (const meteor of meteors) {
      if (!meteor.active) continue;
      meteor.x += meteor.vx * dt;
      meteor.y += meteor.vy * dt;
      meteor.angle += meteor.spin * dt;
      if (random() < 0.4) {
        burst(
          meteor.x - meteor.vx * 0.06, meteor.y - meteor.radius * 0.8,
          meteor.fast ? 'red' : 'ember', 1,
          { speed: 40, life: 0.32, size: 2.6, gravity: -60 },
        );
      }
      if (meteor.y - meteor.radius > FIELD.height || meteor.x < -90 || meteor.x > FIELD.width + 90) {
        meteor.active = false;
        continue;
      }
      const dx = meteor.x - ship.x;
      const dy = meteor.y - ship.y;
      const reach = ship.radius + meteor.radius * 0.82;
      if (dx * dx + dy * dy < reach * reach) {
        events |= hitMeteor(meteor);
        if (state.over) return events;
      }
    }

    for (const powerup of powerups) {
      if (!powerup.active) continue;
      powerup.y += powerup.vy * dt;
      if (powerup.y > FIELD.height + 24) {
        powerup.active = false;
        continue;
      }
      const dx = powerup.x - ship.x;
      const dy = powerup.y - ship.y;
      const reach = ship.radius + POWERUP.radius + 7;
      if (dx * dx + dy * dy < reach * reach) events |= collectPowerup(powerup);
    }
    return events;
  }

  /**
   * One fixed step. `thrust` is a vector with each axis in -1..1. With
   * `harmless` set (the title screen's backdrop) things fall and the ship
   * hovers, but nothing can be collected or hit and the night does not run.
   */
  function step(dt, thrust, harmless) {
    state.time += dt;
    if (state.over) {
      driftEntities(dt);
      updateFx(dt);
      return 0;
    }
    if (harmless) {
      ship.x = FIELD.width / 2 + Math.sin(state.time * 0.45) * 70;
      ship.y = FIELD.height * 0.62 + Math.sin(state.time * 0.8) * 12;
      ship.tilt = Math.cos(state.time * 0.45) * 0.12;
      state.seedTimer -= dt;
      if (state.seedTimer <= 0) {
        spawnSeed();
        state.seedTimer += SEED.interval * 1.7;
      }
      state.meteorTimer -= dt;
      if (state.meteorTimer <= 0) {
        spawnMeteor();
        state.meteorTimer += meteorInterval() * 2.3;
      }
      driftEntities(dt);
      updateFx(dt);
      return 0;
    }

    let events = 0;
    state.elapsed += dt;
    state.timeLeft = Math.max(0, NIGHT_SECONDS - state.elapsed);
    state.wave = Math.min(MAX_WAVE, 1 + Math.floor(state.elapsed / WAVE_SECONDS));

    if (ship.invulnerable > 0) ship.invulnerable = Math.max(0, ship.invulnerable - dt);
    if (ship.magnetTimer > 0) ship.magnetTimer = Math.max(0, ship.magnetTimer - dt);
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }

    const rawX = thrust ? thrust.x : 0;
    const rawY = thrust ? thrust.y : 0;
    const length = Math.hypot(rawX, rawY);
    const scale = length > 1 ? 1 / length : 1;
    ship.thrust = Math.min(1, length);
    ship.vx += rawX * scale * SHIP.accel * dt;
    ship.vy += rawY * scale * SHIP.accel * dt;
    const damp = Math.exp(-SHIP.damping * dt);
    ship.vx *= damp;
    ship.vy *= damp;
    const speed = Math.hypot(ship.vx, ship.vy);
    if (speed > SHIP.maxSpeed) {
      ship.vx *= SHIP.maxSpeed / speed;
      ship.vy *= SHIP.maxSpeed / speed;
    }
    ship.x = clamp(ship.x + ship.vx * dt, ship.radius, FIELD.width - ship.radius);
    ship.y = clamp(ship.y + ship.vy * dt, ship.radius + 44, FIELD.height - ship.radius - 8);
    ship.tilt = clamp(ship.vx / SHIP.maxSpeed, -1, 1) * 0.38;

    state.seedTimer -= dt;
    if (state.seedTimer <= 0) {
      spawnSeed();
      if (state.wave >= 4 && random() < 0.3) spawnSeed();
      state.seedTimer += SEED.interval * (state.wave >= 3 ? 0.9 : 1);
    }
    state.meteorTimer -= dt;
    if (state.meteorTimer <= 0) {
      spawnMeteor();
      state.meteorTimer += meteorInterval();
    }
    state.powerTimer -= dt;
    if (state.powerTimer <= 0) {
      spawnPowerup();
      state.powerTimer = POWERUP.intervalMin + random() * (POWERUP.intervalMax - POWERUP.intervalMin);
    }

    events |= moveAndCollide(dt);
    updateFx(dt);

    if (!state.over && state.timeLeft <= 0) {
      finish(false, 'time');
      events |= EVENT_OVER;
    }
    return events;
  }

  reset();
  return { state, reset, step, burst, celebrate };
}
