// Star Harvest — boot and the one loop: input is read every frame, the world
// advances in fixed 1/60 s steps (several in a slow frame, none in a fast
// one), and the renderer paints what is there. The game moves between five
// screens: title, play, paused, win and game over.
//
// ?seed=N fixes the falling pattern. ?shot=start|play|win|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import {
  createWorld, EVENT_COLLECT, EVENT_HIT, EVENT_OVER, EVENT_POWER, EVENT_SHIELD_BLOCK, EVENT_WIN,
} from './world.js';
import {
  ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput,
} from './input.js';
import {
  createRenderer, panelContent, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const audio = createAudio();
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and the big events.
  function announce(message) {
    status.textContent = message;
  }

  function refreshAmbient() {
    audio.setAmbient(screen === SCREEN_TITLE || screen === SCREEN_PLAY || screen === SCREEN_WIN || screen === SCREEN_OVER);
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    refreshAmbient();
    announce('Playing. Gather 40 star-seeds before the night ends. Hull at full.');
  }

  function finishGame(wonGame) {
    screen = wonGame ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    refreshAmbient();
    if (wonGame) {
      audio.win();
      announce(`Harvest complete. Score ${world.state.score}. Best ${best}.`);
    } else {
      audio.lose();
      announce(`Game over. ${world.state.collected} of 40 seeds. Score ${world.state.score}. Best ${best}.`);
    }
  }

  /** Run a menu button ('start', 'resume', 'restart') — the same actions the keys perform. */
  function pressButton(id) {
    audio.unlock();
    audio.click();
    if (id === 'start' || id === 'restart') startGame();
    else if (id === 'resume' && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      refreshAmbient();
      announce('Playing.');
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.unlock();
      announce(audio.toggleMute() ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM) audio.unlock();
    if (screen === SCREEN_TITLE && (actions & ACTION_CONFIRM)) startGame();
    else if (screen === SCREEN_PLAY && (actions & ACTION_PAUSE)) {
      screen = SCREEN_PAUSED;
      refreshAmbient();
      announce('Paused.');
    } else if (screen === SCREEN_PAUSED && (actions & (ACTION_PAUSE | ACTION_CONFIRM))) {
      screen = SCREEN_PLAY;
      refreshAmbient();
      announce('Playing.');
    } else if (screen === SCREEN_PAUSED && (actions & ACTION_RESTART)) startGame();
    else if ((screen === SCREEN_WIN || screen === SCREEN_OVER) && (actions & (ACTION_CONFIRM | ACTION_RESTART))) startGame();
    else if (screen === SCREEN_PLAY && (actions & ACTION_RESTART)) startGame();
  }

  /** Clicks: a menu button if the click lands on one, else the pointer-steering the loop reads. */
  function handleClick() {
    if (!input.pointer.down) return;
    const content = panelContent(screen, world.state, best);
    if (content === null) return;
    const point = renderer.toField(input.pointer.x, input.pointer.y);
    for (const button of content.buttons) {
      if (point.x >= button.x && point.x <= button.x + button.w && point.y >= button.y && point.y <= button.y + button.h) {
        pressButton(button.id);
        input.pointer.down = false;
        return;
      }
    }
    // A click anywhere else on a menu screen is the screen's main action.
    if (screen === SCREEN_TITLE) startGame();
    else if (screen === SCREEN_WIN || screen === SCREEN_OVER) startGame();
    else if (screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      refreshAmbient();
    }
    input.pointer.down = false;
  }

  /** This step's thrust: the held keys, or the held pointer steering toward itself. */
  function currentThrust() {
    const keys = input.thrustKeys();
    if (keys.x !== 0 || keys.y !== 0) return keys;
    if (input.pointer.down && input.pointer.seen) {
      const point = renderer.toField(input.pointer.x, input.pointer.y);
      const dx = point.x - world.state.ship.x;
      const dy = point.y - world.state.ship.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 16) {
        const strength = Math.min(1, distance / 130);
        return { x: (dx / distance) * strength, y: (dy / distance) * strength };
      }
    }
    return { x: 0, y: 0 };
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { x: 0, y: 0 }, true);
      return;
    }
    if (screen === SCREEN_WIN || screen === SCREEN_OVER) {
      world.step(STEP, { x: 0, y: 0 }, false);
      return;
    }
    const events = world.step(STEP, currentThrust(), false);
    if (events & EVENT_COLLECT) audio.collect(world.state.combo);
    if (events & EVENT_POWER) audio.power(world.state.lastPower);
    if (events & EVENT_SHIELD_BLOCK) audio.shieldBlock();
    if (events & EVENT_HIT) {
      announce(world.state.hull === 1 ? 'Hit. 1 hull left.' : `Hit. ${world.state.hull} hull left.`);
      if (!(events & EVENT_OVER)) audio.hit();
    }
    if (events & EVENT_WIN) {
      world.celebrate();
      finishGame(true);
    } else if (events & EVENT_OVER) {
      finishGame(false);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    handleClick();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY || screen === SCREEN_WIN || screen === SCREEN_OVER) {
      while (accumulator >= STEP) {
        step();
        accumulator -= STEP;
        if (screen === SCREEN_PAUSED) {
          accumulator = 0;
          break;
        }
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting meteors fall unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      refreshAmbient();
      announce('Paused.');
    }
  });
  canvas.addEventListener('pointerdown', () => audio.unlock());

  announce('Star Harvest. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
