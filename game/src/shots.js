// The screenshot scenes behind ?shot=start|play|win|end. Each one plays the
// real rules forward from a fresh world, steered by a simple autopilot (chase
// the best seed, swerve away from meteors it sees coming), so the frame is
// what a short game really looks like — and the same seed always gives the
// same frame. The end scene flies a lazy patrol that never chases and never
// dodges, so the night beats it, as it beats a daydreaming player.
import { FIELD, QUOTA, STEP } from './config.js';
import { POWER_MAGNET, POWER_SHIELD } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 4.5;
const PLAY_SECONDS = 26;
const END_LIMIT_SECONDS = 200;

/**
 * One step of autopilot thrust: a unit pull toward the target (a power-up it
 * can use outranks any seed), plus — with `avoid` set — a stronger push away
 * from every meteor predicted to come close, which takes over entirely when
 * one is right on top of the ship.
 */
function pilotThrust(state, avoid) {
  const ship = state.ship;
  let targetX = FIELD.width / 2;
  let targetY = FIELD.height * 0.55;
  let bestScore = Infinity;

  for (const powerup of state.powerups) {
    if (!powerup.active) continue;
    const useful = (powerup.kind === POWER_SHIELD && !ship.shield)
      || (powerup.kind === POWER_MAGNET && ship.magnetTimer <= 0);
    if (useful) {
      targetX = powerup.x;
      targetY = powerup.y;
      bestScore = -Infinity;
    }
  }
  if (bestScore !== -Infinity) {
    // The most tempting seed: near, and low enough that it will not wait long.
    for (const seed of state.seeds) {
      if (!seed.active) continue;
      const dx = seed.x - ship.x;
      const dy = seed.y - ship.y;
      const score = dx * dx + dy * dy - seed.y * 60;
      if (score < bestScore) {
        bestScore = score;
        targetX = seed.x;
        targetY = seed.y + 26;
      }
    }
  }

  let thrustX = targetX - ship.x;
  let thrustY = targetY - ship.y;
  const chaseLength = Math.hypot(thrustX, thrustY);
  if (chaseLength > 1) {
    const strength = Math.min(1, chaseLength / 110);
    thrustX = (thrustX / chaseLength) * strength;
    thrustY = (thrustY / chaseLength) * strength;
  }

  if (avoid) {
    let avoidX = 0;
    let avoidY = 0;
    let nearest = Infinity;
    for (const meteor of state.meteors) {
      if (!meteor.active) continue;
      const aheadX = meteor.x + meteor.vx * 0.5;
      const aheadY = meteor.y + meteor.vy * 0.5;
      const dx = ship.x - aheadX;
      const dy = ship.y - aheadY;
      const distance = Math.hypot(dx, dy);
      const danger = meteor.radius + 132;
      if (distance > 1 && distance < danger) {
        const weight = (1 - distance / danger) * 2.6;
        avoidX += (dx / distance) * weight;
        avoidY += (dy / distance) * weight;
        if (distance < nearest) nearest = distance;
      }
    }
    if (nearest < 74) {
      // Something is right here: forget the seeds, just get out of the way.
      thrustX = avoidX;
      thrustY = avoidY - 0.25;
    } else {
      thrustX += avoidX;
      thrustY += avoidY;
    }
  }

  const length = Math.hypot(thrustX, thrustY);
  if (length < 0.04) return { x: 0, y: 0 };
  if (length > 1) {
    thrustX /= length;
    thrustY /= length;
  }
  return { x: thrustX, y: thrustY };
}

/** The end scene's pilot: a slow sweep across the meadow sky, heedless of everything. */
function patrolThrust(state) {
  const ship = state.ship;
  const targetX = FIELD.width / 2 + Math.sin(state.time * 0.42) * 440;
  const targetY = FIELD.height * 0.6 + Math.sin(state.time * 0.9) * 60;
  const dx = targetX - ship.x;
  const dy = targetY - ship.y;
  const length = Math.hypot(dx, dy);
  if (length < 20) return { x: 0, y: 0 };
  const strength = Math.min(1, length / 120);
  return { x: (dx / length) * strength, y: (dy / length) * strength };
}

/**
 * Set `world` to the named scene (start, play, win or end; any other name is
 * start) and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();

  if (name === 'play') {
    for (let index = 0; index < PLAY_SECONDS / STEP && !state.over; index += 1) {
      world.step(STEP, pilotThrust(state, true), false);
    }
    if (!state.over) {
      // End on a lively frame: a sparkle at the ship, and the combo showing.
      world.burst(state.ship.x, state.ship.y - 14, 'gold', 10, { speed: 190, life: 0.6, size: 3.2, gravity: 120 });
      if (state.comboTimer <= 0) {
        state.combo = 5;
        state.comboTimer = 1.8;
      }
    }
    return { screen: state.over ? (state.won ? SCREEN_WIN : SCREEN_OVER) : SCREEN_PLAY, best: state.score };
  }

  if (name === 'win') {
    for (let index = 0; index < 95 / STEP && !state.over; index += 1) {
      world.step(STEP, pilotThrust(state, true), false);
    }
    if (!state.won) {
      // The pilot fell short this seed: settle the scene on the win it nearly had.
      state.collected = QUOTA;
      state.won = true;
      state.over = true;
      state.overReason = '';
      if (state.hull <= 0) state.hull = 1;
    }
    world.celebrate();
    for (let index = 0; index < 46; index += 1) world.step(STEP, { x: 0, y: 0 }, false);
    return { screen: SCREEN_WIN, best: state.score };
  }

  if (name === 'end') {
    for (let index = 0; index < END_LIMIT_SECONDS / STEP && !state.over; index += 1) {
      world.step(STEP, patrolThrust(state), false);
    }
    if (!state.over) {
      state.hull = 0;
      state.over = true;
      state.won = false;
      state.overReason = 'hull';
      world.burst(state.ship.x, state.ship.y, 'ember', 30, { speed: 360, life: 0.9, size: 4.2, gravity: 200 });
    }
    for (let index = 0; index < 46; index += 1) world.step(STEP, { x: 0, y: 0 }, false);
    return { screen: SCREEN_OVER, best: state.score };
  }

  for (let index = 0; index < START_SECONDS / STEP; index += 1) {
    world.step(STEP, { x: 0, y: 0 }, true);
  }
  return { screen: SCREEN_TITLE, best: 0 };
}
