// Star Harvest input: keyboard and pointer. Held keys give a thrust direction
// (arrows or WASD, both axes); one-shot presses (confirm, pause, restart, mute)
// are queued as bit flags and taken once by the loop, so a press between two
// frames is never lost and never counted twice. The pointer steers while it is
// held down: the loop reads its position and flies the ship toward it.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_MUTE = 8;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const RESTART = new Set(['KeyR']);
const MUTE = new Set(['KeyM']);
const GAME_KEYS = new Set([...UP, ...DOWN, ...LEFT, ...RIGHT, ...CONFIRM, ...PAUSE, ...RESTART, ...MUTE]);

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  /** Pointer state in client coordinates; the loop converts them to field coordinates. */
  const pointer = { x: 0, y: 0, down: false, seen: false };

  window.addEventListener('keydown', (event) => {
    if (!GAME_KEYS.has(event.code)) return;
    if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else {
      held.add(event.code);
    }
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.clear();
    pointer.down = false;
  });

  target.addEventListener('pointermove', (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.seen = true;
  });
  target.addEventListener('pointerdown', (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.seen = true;
    pointer.down = true;
  });
  window.addEventListener('pointerup', () => {
    pointer.down = false;
  });
  target.addEventListener('pointerleave', () => {
    pointer.down = false;
  });

  return {
    pointer,
    /** The held keys as a thrust vector: each axis -1, 0 or 1. */
    thrustKeys() {
      let x = 0;
      let y = 0;
      for (const code of held) {
        if (LEFT.has(code)) x -= 1;
        else if (RIGHT.has(code)) x += 1;
        else if (UP.has(code)) y -= 1;
        else if (DOWN.has(code)) y += 1;
      }
      return { x, y };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
