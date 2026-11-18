// Star Harvest drawing: the world's state and the current screen in, pixels
// out. Everything is drawn in code — gradient sky, a parallax starfield, a
// crescent moon over meadow hills, the seed-ship, glowing star-seeds, burning
// meteors, power-ups, particles and floating score text. The 1280x720
// playfield is scaled to fit the window and centred. Drawing is a pure
// function of the state (its `time` drives every twinkle and pulse), so a
// staged screenshot scene always paints the same frame.
import { COMBO, FIELD, FONT, HULL, NIGHT_SECONDS, PALETTE, POWERUP, QUOTA } from './config.js';
import { comboMultiplier, POWER_MAGNET } from './world.js';
import { createRandom } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_WIN = 'win';
export const SCREEN_OVER = 'over';

const PANEL_WIDTH = 668;
const BUTTON_HEIGHT = 54;
const BUTTON_WIDTH = 252;

/** m:ss for the night timer. */
function friendlyTime(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function roundRectPath(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.arcTo(x + width, y, x + width, y + r, r);
  context.lineTo(x + width, y + height - r);
  context.arcTo(x + width, y + height, x + width - r, y + height, r);
  context.lineTo(x + r, y + height);
  context.arcTo(x, y + height, x, y + height - r, r);
  context.lineTo(x, y + r);
  context.arcTo(x, y, x + r, y, r);
  context.closePath();
}

function heartPath(context, cx, cy, s) {
  context.beginPath();
  context.moveTo(cx, cy + s * 0.88);
  context.bezierCurveTo(cx - s * 1.18, cy + s * 0.08, cx - s * 0.74, cy - s * 0.88, cx, cy - s * 0.3);
  context.bezierCurveTo(cx + s * 0.74, cy - s * 0.88, cx + s * 1.18, cy + s * 0.08, cx, cy + s * 0.88);
  context.closePath();
}

/**
 * The words and buttons of a menu screen, with the buttons' rectangles in
 * field coordinates. The renderer paints exactly this, and the main loop hit
 * -tests clicks against it, so the two can never disagree.
 */
export function panelContent(screen, state, best) {
  let title = '';
  let titleSize = 42;
  let titleColor = PALETTE.text;
  let lines = [];
  let buttons = [];
  let prompt = '';
  if (screen === SCREEN_TITLE) {
    title = 'STAR HARVEST';
    titleSize = 60;
    titleColor = PALETTE.gold;
    lines = [
      { text: 'Gather 40 golden star-seeds before the night runs out.', size: 20, color: PALETTE.text },
      { text: 'Fly with the Arrow Keys or WASD — or hold the mouse to steer.', size: 18, color: PALETTE.muted },
      { text: 'Dodge the meteors: your hull takes only 3 hits.', size: 18, color: PALETTE.muted },
      { text: 'Chain quick collects for combo points. Grab shields and magnets.', size: 18, color: PALETTE.muted },
      { text: 'P pauses · M mutes the sound · R restarts', size: 16, color: PALETTE.muted },
      { text: best > 0 ? `Best score ${best}` : '', size: 18, color: PALETTE.gold },
    ];
    buttons = [{ id: 'start', label: 'Start the harvest' }];
    prompt = 'or press Enter';
  } else if (screen === SCREEN_PAUSED) {
    title = 'Paused';
    lines = [
      { text: 'The night will wait for you.', size: 19, color: PALETTE.muted },
      { text: '', size: 19, color: PALETTE.muted },
    ];
    buttons = [
      { id: 'resume', label: 'Resume' },
      { id: 'restart', label: 'Restart' },
    ];
    prompt = 'P or Enter to resume';
  } else if (screen === SCREEN_WIN) {
    title = 'HARVEST COMPLETE!';
    titleColor = PALETTE.gold;
    lines = [
      { text: `All ${QUOTA} star-seeds gathered, with ${friendlyTime(state.timeLeft)} of night to spare.`, size: 20, color: PALETTE.text },
      { text: `Score ${state.score}`, size: 22, color: PALETTE.text },
      { text: `Best combo x${comboMultiplier(state.bestChain)} · Best score ${Math.max(best, state.score)}`, size: 18, color: PALETTE.muted },
    ];
    buttons = [{ id: 'restart', label: 'Play again' }];
    prompt = 'or press R';
  } else if (screen === SCREEN_OVER) {
    title = state.overReason === 'hull' ? 'THE SHIP GOES DOWN' : 'DAWN BREAKS';
    titleColor = PALETTE.danger;
    lines = [
      {
        text: state.overReason === 'hull'
          ? 'Three hits was all the little hull could take.'
          : 'The night ended before the harvest was done.',
        size: 20, color: PALETTE.text,
      },
      { text: `Seeds gathered ${state.collected} / ${QUOTA}`, size: 20, color: PALETTE.text },
      { text: `Score ${state.score} · Best score ${Math.max(best, state.score)}`, size: 18, color: PALETTE.muted },
    ];
    buttons = [{ id: 'restart', label: 'Try again' }];
    prompt = 'or press R';
  } else {
    return null;
  }

  const height = 44 + titleSize + 20 + lines.length * 32 + 20 + BUTTON_HEIGHT + 18 + 24 + 30;
  const x = (FIELD.width - PANEL_WIDTH) / 2;
  const y = (FIELD.height - height) / 2;
  const buttonY = y + height - 30 - 24 - 18 - BUTTON_HEIGHT;
  const totalWidth = buttons.length * BUTTON_WIDTH + (buttons.length - 1) * 18;
  let buttonX = FIELD.width / 2 - totalWidth / 2;
  for (const button of buttons) {
    button.x = buttonX;
    button.y = buttonY;
    button.w = BUTTON_WIDTH;
    button.h = BUTTON_HEIGHT;
    buttonX += BUTTON_WIDTH + 18;
  }
  return { title, titleSize, titleColor, lines, buttons, prompt, x, y, w: PANEL_WIDTH, h: height };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  // The backdrop's fixed layout, from its own seeded stream: star layers,
  // fireflies and meadow trees are the same on every visit and in every shot.
  const backdropRandom = createRandom(20261117);
  const starLayers = [
    { speed: 2.5, stars: [] },
    { speed: 6, stars: [] },
    { speed: 11, stars: [] },
  ];
  starLayers.forEach((layer, layerIndex) => {
    const count = [80, 54, 32][layerIndex];
    for (let index = 0; index < count; index += 1) {
      layer.stars.push({
        x: backdropRandom() * FIELD.width,
        y: backdropRandom() * FIELD.height,
        r: 0.7 + backdropRandom() * (0.8 + layerIndex * 0.55),
        phase: backdropRandom() * Math.PI * 2,
      });
    }
  });
  const fireflies = [];
  for (let index = 0; index < 24; index += 1) {
    fireflies.push({
      x: backdropRandom() * FIELD.width,
      y: 560 + backdropRandom() * 130,
      phase: backdropRandom() * Math.PI * 2,
    });
  }
  const trees = [];
  for (let index = 0; index < 7; index += 1) {
    trees.push({ x: 40 + backdropRandom() * (FIELD.width - 80), s: 0.7 + backdropRandom() * 0.9 });
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, weight = 400) {
    const key = `${weight}:${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function drawBackground(state) {
    const sky = context.createLinearGradient(0, 0, 0, FIELD.height);
    sky.addColorStop(0, PALETTE.skyTop);
    sky.addColorStop(0.55, PALETTE.skyMid);
    sky.addColorStop(0.82, PALETTE.skyLow);
    sky.addColorStop(1, '#274b52');
    context.fillStyle = sky;
    context.fillRect(0, 0, FIELD.width, FIELD.height);

    for (const layer of starLayers) {
      for (const star of layer.stars) {
        const y = (star.y + state.time * layer.speed) % FIELD.height;
        const twinkle = 0.55 + 0.45 * Math.sin(state.time * 1.7 + star.phase);
        context.globalAlpha = 0.75 * twinkle;
        context.fillStyle = '#dfe8ff';
        context.beginPath();
        context.arc(star.x, y, star.r, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.globalAlpha = 1;

    // The moon: a pale full disc with a soft halo and two quiet craters.
    const moonX = 1106;
    const moonY = 102;
    const halo = context.createRadialGradient(moonX, moonY, 20, moonX, moonY, 95);
    halo.addColorStop(0, 'rgba(244, 236, 210, 0.28)');
    halo.addColorStop(1, 'rgba(244, 236, 210, 0)');
    context.fillStyle = halo;
    context.fillRect(moonX - 95, moonY - 95, 190, 190);
    context.fillStyle = PALETTE.moon;
    context.beginPath();
    context.arc(moonX, moonY, 33, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = 'rgba(190, 178, 145, 0.5)';
    context.beginPath();
    context.arc(moonX - 10, moonY - 6, 7, 0, Math.PI * 2);
    context.arc(moonX + 12, moonY + 12, 5, 0, Math.PI * 2);
    context.fill();

    // Meadow hills: two sine ridges, the far one bluer, the near one greener.
    ridge(606, PALETTE.hillFar, 0.0042, 0.0113, 17, 6);
    ridge(652, PALETTE.hillNear, 0.0051, 0.0137, 13, 5);

    // Silhouette trees standing on the near ridge.
    context.fillStyle = '#08130f';
    for (const tree of trees) {
      const baseY = 652 + Math.sin(tree.x * 0.0051) * 13 + Math.sin(tree.x * 0.0137) * 5;
      context.fillRect(tree.x - 2.5 * tree.s, baseY - 26 * tree.s, 5 * tree.s, 26 * tree.s);
      context.beginPath();
      context.arc(tree.x, baseY - 38 * tree.s, 17 * tree.s, 0, Math.PI * 2);
      context.arc(tree.x - 13 * tree.s, baseY - 28 * tree.s, 12 * tree.s, 0, Math.PI * 2);
      context.arc(tree.x + 13 * tree.s, baseY - 28 * tree.s, 12 * tree.s, 0, Math.PI * 2);
      context.fill();
    }

    // Fireflies drifting over the meadow.
    for (const fly of fireflies) {
      const x = fly.x + Math.sin(state.time * 0.32 + fly.phase) * 30;
      const y = fly.y + Math.cos(state.time * 0.24 + fly.phase * 1.7) * 10;
      const pulse = 0.35 + 0.65 * Math.max(0, Math.sin(state.time * 0.9 + fly.phase * 2.3));
      context.globalAlpha = 0.5 * pulse;
      context.fillStyle = '#ffe98a';
      context.beginPath();
      context.arc(x, y, 2.1, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function ridge(base, color, freqA, freqB, ampA, ampB) {
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(0, FIELD.height);
    for (let x = 0; x <= FIELD.width; x += 16) {
      context.lineTo(x, base + Math.sin(x * freqA) * ampA + Math.sin(x * freqB) * ampB);
    }
    context.lineTo(FIELD.width, FIELD.height);
    context.closePath();
    context.fill();
  }

  function drawSeed(seed, time) {
    const pulse = 1 + 0.13 * Math.sin(time * 3.2 + seed.phase);
    const r = 11 * pulse;
    const glow = context.createRadialGradient(seed.x, seed.y, 1, seed.x, seed.y, r * 2.7);
    glow.addColorStop(0, 'rgba(255, 217, 104, 0.4)');
    glow.addColorStop(1, 'rgba(255, 217, 104, 0)');
    context.fillStyle = glow;
    context.fillRect(seed.x - r * 2.7, seed.y - r * 2.7, r * 5.4, r * 5.4);
    const rotation = time * 1.3 + seed.phase;
    context.fillStyle = PALETTE.gold;
    context.beginPath();
    for (let point = 0; point < 8; point += 1) {
      const angle = rotation + (point * Math.PI) / 4;
      const radius = point % 2 === 0 ? r * 1.3 : r * 0.44;
      const px = seed.x + Math.cos(angle) * radius;
      const py = seed.y + Math.sin(angle) * radius;
      if (point === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
    context.fill();
    context.fillStyle = '#fff6d8';
    context.beginPath();
    context.arc(seed.x, seed.y, r * 0.3, 0, Math.PI * 2);
    context.fill();
  }

  function drawMeteor(meteor, time) {
    const speed = Math.hypot(meteor.vx, meteor.vy) || 1;
    const dirX = meteor.vx / speed;
    const dirY = meteor.vy / speed;
    const tailLength = meteor.radius * 2.3 + speed * 0.07;
    const tailX = meteor.x - dirX * tailLength;
    const tailY = meteor.y - dirY * tailLength;
    const trail = context.createLinearGradient(tailX, tailY, meteor.x, meteor.y);
    trail.addColorStop(0, 'rgba(255, 120, 50, 0)');
    trail.addColorStop(1, meteor.fast ? 'rgba(255, 90, 60, 0.65)' : 'rgba(255, 150, 80, 0.5)');
    context.strokeStyle = trail;
    context.lineWidth = meteor.radius * 1.05;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(tailX, tailY);
    context.lineTo(meteor.x, meteor.y);
    context.stroke();

    const glow = context.createRadialGradient(meteor.x, meteor.y, 2, meteor.x, meteor.y, meteor.radius * 1.9);
    glow.addColorStop(0, 'rgba(255, 140, 70, 0.22)');
    glow.addColorStop(1, 'rgba(255, 140, 70, 0)');
    context.fillStyle = glow;
    context.fillRect(meteor.x - meteor.radius * 1.9, meteor.y - meteor.radius * 1.9, meteor.radius * 3.8, meteor.radius * 3.8);

    context.save();
    context.translate(meteor.x, meteor.y);
    context.rotate(meteor.angle);
    const body = context.createRadialGradient(
      -meteor.radius * 0.35, -meteor.radius * 0.35, meteor.radius * 0.2,
      0, 0, meteor.radius,
    );
    body.addColorStop(0, '#8a5f47');
    body.addColorStop(0.6, '#4a3226');
    body.addColorStop(1, '#2c1e16');
    context.fillStyle = body;
    context.beginPath();
    context.arc(0, 0, meteor.radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = 'rgba(0, 0, 0, 0.28)';
    for (let crater = 0; crater < 3; crater += 1) {
      const a = meteor.look * (crater + 1) * 1.37;
      const cx = Math.sin(a) * meteor.radius * 0.42;
      const cy = Math.cos(a * 1.3) * meteor.radius * 0.42;
      context.beginPath();
      context.arc(cx, cy, meteor.radius * (0.16 + (crater % 2) * 0.07), 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    void time;
  }

  function drawPowerup(powerup, time) {
    const bob = Math.sin(time * 2.4 + powerup.phase) * 4;
    const y = powerup.y + bob;
    const color = powerup.kind === POWER_MAGNET ? PALETTE.magnet : PALETTE.shield;
    const glow = context.createRadialGradient(powerup.x, y, 2, powerup.x, y, 34);
    glow.addColorStop(0, powerup.kind === POWER_MAGNET ? 'rgba(255, 138, 224, 0.32)' : 'rgba(127, 227, 255, 0.32)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.fillStyle = glow;
    context.fillRect(powerup.x - 34, y - 34, 68, 68);
    context.strokeStyle = color;
    context.globalAlpha = 0.75 + 0.25 * Math.sin(time * 3.4 + powerup.phase);
    context.lineWidth = 2;
    context.beginPath();
    context.arc(powerup.x, y, 19, 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha = 1;
    context.save();
    context.translate(powerup.x, y);
    if (powerup.kind === POWER_MAGNET) {
      context.strokeStyle = '#e14b4b';
      context.lineWidth = 5.5;
      context.lineCap = 'butt';
      context.beginPath();
      context.arc(0, 0, 8, Math.PI, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(-8, 0);
      context.lineTo(-8, 6);
      context.moveTo(8, 0);
      context.lineTo(8, 6);
      context.stroke();
      context.fillStyle = '#dfe6ee';
      context.fillRect(-10.5, 6, 5, 4.5);
      context.fillRect(5.5, 6, 5, 4.5);
    } else {
      context.fillStyle = 'rgba(127, 227, 255, 0.3)';
      context.strokeStyle = PALETTE.shield;
      context.lineWidth = 2.2;
      context.beginPath();
      context.moveTo(0, -10.5);
      context.quadraticCurveTo(8, -8, 8.5, -1);
      context.quadraticCurveTo(8.5, 6, 0, 11);
      context.quadraticCurveTo(-8.5, 6, -8.5, -1);
      context.quadraticCurveTo(-8, -8, 0, -10.5);
      context.closePath();
      context.fill();
      context.stroke();
    }
    context.restore();
  }

  function drawShip(state) {
    const ship = state.ship;
    if (ship.magnetTimer > 0) {
      context.strokeStyle = 'rgba(255, 138, 224, 0.13)';
      context.lineWidth = 2;
      context.setLineDash([14, 22]);
      context.lineDashOffset = -state.time * 34;
      context.beginPath();
      context.arc(ship.x, ship.y, POWERUP.magnetRadius, 0, Math.PI * 2);
      context.stroke();
      context.setLineDash([]);
    }
    const blink = ship.invulnerable > 0 && Math.floor(ship.invulnerable * 12) % 2 === 0;
    context.save();
    context.translate(ship.x, ship.y);
    context.rotate(ship.tilt);
    context.globalAlpha = blink ? 0.35 : 1;

    if (ship.thrust > 0.05) {
      const flame = 15 + ship.thrust * 15 + Math.sin(state.time * 42) * 4;
      const flameGradient = context.createLinearGradient(0, 11, 0, 11 + flame);
      flameGradient.addColorStop(0, 'rgba(255, 214, 120, 0.95)');
      flameGradient.addColorStop(0.5, 'rgba(255, 140, 60, 0.7)');
      flameGradient.addColorStop(1, 'rgba(255, 90, 40, 0)');
      context.fillStyle = flameGradient;
      context.beginPath();
      context.moveTo(-6.5, 10);
      context.lineTo(6.5, 10);
      context.lineTo(0, 11 + flame);
      context.closePath();
      context.fill();
    }

    // Side fins.
    context.fillStyle = '#4a7d94';
    context.beginPath();
    context.moveTo(-14, 2);
    context.lineTo(-24, 10);
    context.lineTo(-13, 10);
    context.closePath();
    context.moveTo(14, 2);
    context.lineTo(24, 10);
    context.lineTo(13, 10);
    context.closePath();
    context.fill();

    // The pod body: a plump seed shape, lit from above.
    const bodyGradient = context.createLinearGradient(0, -14, 0, 14);
    bodyGradient.addColorStop(0, '#e8f4f8');
    bodyGradient.addColorStop(0.55, '#8fc3d4');
    bodyGradient.addColorStop(1, '#4a7d94');
    context.fillStyle = bodyGradient;
    context.beginPath();
    context.ellipse(0, 0, 21, 13.5, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = 'rgba(32, 84, 105, 0.55)';
    context.beginPath();
    context.ellipse(0, 8.5, 13, 4.2, 0, 0, Math.PI * 2);
    context.fill();

    // The canopy dome.
    const dome = context.createLinearGradient(0, -13, 0, 0);
    dome.addColorStop(0, '#dff6ff');
    dome.addColorStop(1, '#6fb7d9');
    context.fillStyle = dome;
    context.beginPath();
    context.arc(0, -3.5, 8.6, Math.PI, Math.PI * 2);
    context.closePath();
    context.fill();
    context.fillStyle = 'rgba(255, 255, 255, 0.85)';
    context.beginPath();
    context.arc(-2.8, -8.6, 2.1, 0, Math.PI * 2);
    context.fill();

    // The sprout on top: this is a seed-ship, after all.
    context.strokeStyle = '#3fa653';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, -12.5);
    context.quadraticCurveTo(0.5, -16, 0, -19);
    context.stroke();
    context.fillStyle = '#57c96b';
    context.beginPath();
    context.ellipse(-4.4, -19.6, 4.6, 2.3, -0.62, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#3fa653';
    context.beginPath();
    context.ellipse(4.4, -19.6, 4.6, 2.3, 0.62, 0, Math.PI * 2);
    context.fill();
    context.restore();

    if (ship.shield) {
      context.strokeStyle = PALETTE.shield;
      context.globalAlpha = 0.55 + 0.25 * Math.sin(state.time * 5);
      context.lineWidth = 2.4;
      context.beginPath();
      context.arc(ship.x, ship.y, 31, 0, Math.PI * 2);
      context.stroke();
      context.globalAlpha = 0.08;
      context.fillStyle = PALETTE.shield;
      context.fill();
      context.globalAlpha = 1;
    }
  }

  function drawParticles(state) {
    for (const particle of state.particles) {
      if (!particle.active) continue;
      const fraction = particle.life / particle.maxLife;
      context.globalAlpha = Math.min(1, fraction * 1.6);
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, Math.max(0.4, particle.size * fraction), 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawTexts(state) {
    context.textBaseline = 'middle';
    for (const item of state.texts) {
      if (!item.active) continue;
      const alpha = Math.min(1, (item.life / item.maxLife) * 1.5);
      context.globalAlpha = alpha;
      context.lineWidth = 4;
      context.strokeStyle = 'rgba(5, 8, 18, 0.8)';
      const key = `600:${item.size}`;
      if (!fonts.has(key)) fonts.set(key, `600 ${item.size}px ${FONT}`);
      context.font = fonts.get(key);
      context.textAlign = 'center';
      context.strokeText(item.value, item.x, item.y);
      context.fillStyle = item.color;
      context.fillText(item.value, item.x, item.y);
    }
    context.globalAlpha = 1;
  }

  function drawHud(state) {
    // The night bar: what is left of the night, draining toward dawn gold.
    context.fillStyle = 'rgba(255, 255, 255, 0.09)';
    context.fillRect(0, 0, FIELD.width, 6);
    const nightGradient = context.createLinearGradient(0, 0, FIELD.width, 0);
    nightGradient.addColorStop(0, '#3550a0');
    nightGradient.addColorStop(1, PALETTE.goldDeep);
    context.fillStyle = nightGradient;
    context.fillRect(0, 0, FIELD.width * (state.timeLeft / NIGHT_SECONDS), 6);

    context.textBaseline = 'top';
    text('SCORE', 24, 16, 12, PALETTE.muted, 'left', 600);
    text(String(state.score), 24, 31, 30, PALETTE.text, 'left', 700);
    if (state.combo >= 2 && state.comboTimer > 0) {
      const multiplier = comboMultiplier(state.combo);
      const pop = 1 + state.comboPulse * 0.85;
      context.save();
      context.translate(24, 76);
      context.scale(pop, pop);
      text(`COMBO x${multiplier}`, 0, 0, 20, PALETTE.gold, 'left', 700);
      context.restore();
      context.fillStyle = 'rgba(255, 217, 104, 0.3)';
      context.fillRect(24, 101, 112, 4);
      context.fillStyle = PALETTE.gold;
      context.fillRect(24, 101, 112 * (state.comboTimer / COMBO.window), 4);
    }

    // The quota, centre top: a golden bar that fills as the harvest grows.
    const barX = 440;
    const barW = 400;
    context.fillStyle = 'rgba(255, 255, 255, 0.09)';
    roundRectPath(context, barX, 16, barW, 22, 11);
    context.fill();
    const fillW = Math.max(22, barW * (state.collected / QUOTA));
    if (state.collected > 0) {
      const fill = context.createLinearGradient(barX, 0, barX + barW, 0);
      fill.addColorStop(0, PALETTE.goldDeep);
      fill.addColorStop(1, PALETTE.gold);
      context.fillStyle = fill;
      roundRectPath(context, barX, 16, fillW, 22, 11);
      context.fill();
    }
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 1;
    roundRectPath(context, barX, 16, barW, 22, 11);
    context.stroke();
    context.save();
    context.shadowColor = 'rgba(0, 0, 0, 0.65)';
    context.shadowBlur = 4;
    text(`STAR-SEEDS  ${state.collected} / ${QUOTA}`, FIELD.width / 2, 20, 15, '#ffffff', 'center', 700);
    context.restore();
    const patterns = ['SEED RAIN', 'SEED ARC', 'SEED STREAM'];
    text(`WAVE ${state.wave} · ${patterns[(state.wave - 1) % 3]}`, FIELD.width / 2, 46, 13, PALETTE.muted, 'center', 600);

    // Hull hearts and the clock, top right.
    text('HULL', FIELD.width - 24, 16, 12, PALETTE.muted, 'right', 600);
    for (let index = 0; index < HULL; index += 1) {
      const cx = FIELD.width - 24 - 15 - (HULL - 1 - index) * 31;
      heartPath(context, cx, 44, 11);
      context.fillStyle = index < state.hull ? PALETTE.heart : PALETTE.heartEmpty;
      context.fill();
    }
    text(friendlyTime(state.timeLeft), FIELD.width - 24, 62, 18, PALETTE.text, 'right', 600);

    // Active power-ups, bottom left.
    let indicatorX = 24;
    context.textBaseline = 'middle';
    if (state.ship.shield) {
      text('SHIELD UP', indicatorX, FIELD.height - 24, 14, PALETTE.shield, 'left', 700);
      indicatorX += 104;
    }
    if (state.ship.magnetTimer > 0) {
      text(`MAGNET ${Math.ceil(state.ship.magnetTimer)}s`, indicatorX, FIELD.height - 24, 14, PALETTE.magnet, 'left', 700);
    }
    text('P pause · M sound', FIELD.width - 24, FIELD.height - 24, 12, PALETTE.muted, 'right', 400);
  }

  function drawPanel(screen, state, best) {
    const content = panelContent(screen, state, best);
    if (content === null) return;
    if (screen !== SCREEN_TITLE) {
      context.fillStyle = 'rgba(4, 6, 14, 0.45)';
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }
    roundRectPath(context, content.x, content.y, content.w, content.h, 18);
    context.fillStyle = PALETTE.panel;
    context.fill();
    context.lineWidth = 1.5;
    context.strokeStyle = screen === SCREEN_WIN
      ? 'rgba(255, 217, 104, 0.55)'
      : screen === SCREEN_OVER
        ? 'rgba(255, 107, 87, 0.45)'
        : PALETTE.panelEdge;
    context.stroke();

    context.textBaseline = 'top';
    if (screen === SCREEN_TITLE) {
      context.save();
      context.shadowColor = 'rgba(255, 190, 70, 0.55)';
      context.shadowBlur = 26;
      text(content.title, FIELD.width / 2, content.y + 40, content.titleSize, content.titleColor, 'center', 800);
      context.restore();
    } else {
      text(content.title, FIELD.width / 2, content.y + 42, content.titleSize, content.titleColor, 'center', 800);
    }
    let lineY = content.y + 44 + content.titleSize + 20;
    for (const line of content.lines) {
      if (line.text !== '') text(line.text, FIELD.width / 2, lineY, line.size, line.color, 'center', 400);
      lineY += 32;
    }
    content.buttons.forEach((button, index) => {
      roundRectPath(context, button.x, button.y, button.w, button.h, 12);
      if (index === 0) {
        const fill = context.createLinearGradient(0, button.y, 0, button.y + button.h);
        fill.addColorStop(0, '#ffc95e');
        fill.addColorStop(1, PALETTE.goldDeep);
        context.fillStyle = fill;
        context.fill();
        text(button.label, button.x + button.w / 2, button.y + 15, 21, '#241703', 'center', 700);
      } else {
        context.fillStyle = 'rgba(255, 255, 255, 0.06)';
        context.fill();
        context.strokeStyle = PALETTE.panelEdge;
        context.lineWidth = 1;
        context.stroke();
        text(button.label, button.x + button.w / 2, button.y + 15, 21, PALETTE.text, 'center', 600);
      }
    });
    text(content.prompt, FIELD.width / 2, content.y + content.h - 30 - 22, 15, PALETTE.muted, 'center', 400);
  }

  /** Paint one frame: the field, then the HUD, then a panel for menu screens. */
  function draw(state, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = state.shake > 0 ? Math.sin(state.time * 67) * state.shake * 0.6 : 0;
    const shakeY = state.shake > 0 ? Math.cos(state.time * 59) * state.shake * 0.45 : 0;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);

    drawBackground(state);
    for (const powerup of state.powerups) if (powerup.active) drawPowerup(powerup, state.time);
    for (const seed of state.seeds) if (seed.active) drawSeed(seed, state.time);
    for (const meteor of state.meteors) if (meteor.active) drawMeteor(meteor, state.time);
    if (!(state.over && !state.won && state.overReason === 'hull')) drawShip(state);
    drawParticles(state);
    drawTexts(state);

    if (state.flash > 0) {
      context.fillStyle = `rgba(${state.flashColor}, ${(state.flash * 0.5).toFixed(3)})`;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }
    const vignette = context.createRadialGradient(640, 350, 480, 640, 350, 920);
    vignette.addColorStop(0, 'rgba(2, 3, 8, 0)');
    vignette.addColorStop(1, 'rgba(2, 3, 8, 0.4)');
    context.fillStyle = vignette;
    context.fillRect(0, 0, FIELD.width, FIELD.height);

    if (screen !== SCREEN_TITLE) drawHud(state);
    if (screen !== SCREEN_PLAY) drawPanel(screen, state, best);
  }

  /** Convert client (CSS pixel) coordinates to playfield coordinates. */
  function toField(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * (canvas.width / Math.max(1, rect.width));
    const py = (clientY - rect.top) * (canvas.height / Math.max(1, rect.height));
    return { x: (px - view.x) / view.scale, y: (py - view.y) / view.scale };
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toField };
}
