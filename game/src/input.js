// Keyboard and pointer input for Verde Bay. Held keys give a movement vector;
// one-shot presses (confirm, pause, enter-car, punch, horn, mute, restart) are
// queued as bit flags and taken once by the loop, so a press between two frames
// is never lost and never counted twice. The mouse position (in canvas pixels)
// aims the pistol; a click shoots — on foot, or out of a car window.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;
export const ACTION_HORN = 16;
export const ACTION_MUTE = 32;
export const ACTION_RESTART = 64;

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
};

const PRESSMAP = {
  Enter: ACTION_CONFIRM,
  KeyE: ACTION_ENTER,
  KeyX: ACTION_ENTER,
  KeyF: ACTION_PUNCH,
  KeyQ: ACTION_PUNCH,
  KeyH: ACTION_HORN,
  KeyM: ACTION_MUTE,
  KeyR: ACTION_RESTART,
  KeyP: ACTION_PAUSE,
  Escape: ACTION_PAUSE,
};

export function createInput(canvas) {
  const held = { up: false, down: false, left: false, right: false, run: false };
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let spaceHeld = false; // Space: shoot on foot, handbrake in a car

  window.addEventListener('keydown', (event) => {
    const dir = KEYMAP[event.code];
    if (dir) {
      held[dir] = true;
      event.preventDefault();
      return;
    }
    if (event.code === 'Space') {
      spaceHeld = true;
      if (!event.repeat) actions |= ACTION_CONFIRM;
      event.preventDefault();
      return;
    }
    const flag = PRESSMAP[event.code];
    if (flag && !event.repeat) {
      actions |= flag;
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    const dir = KEYMAP[event.code];
    if (dir) held[dir] = false;
    if (event.code === 'Space') spaceHeld = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.up = held.down = held.left = held.right = held.run = false;
    spaceHeld = false;
    mouseDown = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseDown = true;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => { mouseDown = false; });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** Normalised {x, y} movement vector from the held keys. */
    move() {
      const x = (held.right ? 1 : 0) - (held.left ? 1 : 0);
      const y = (held.down ? 1 : 0) - (held.up ? 1 : 0);
      const len = Math.hypot(x, y) || 1;
      return { x: x / len, y: y / len, active: x !== 0 || y !== 0 };
    },
    runHeld() { return held.run; },
    spaceHeld() { return spaceHeld; },
    mouseDown() { return mouseDown; },
    mouse() { return { x: mouseX, y: mouseY }; },
    /** The one-shot WORLD presses since the last call (enter, punch, horn).
     * UI presses (confirm, pause, restart, mute) are separate, so the
     * screen handler cannot eat a car-entry press before the world sees it. */
    takeActions() {
      const taken = actions & (ACTION_ENTER | ACTION_PUNCH | ACTION_HORN);
      actions &= ~(ACTION_ENTER | ACTION_PUNCH | ACTION_HORN);
      return taken;
    },
    /** The one-shot UI presses since the last call. */
    takeUiActions() {
      const taken = actions & (ACTION_CONFIRM | ACTION_PAUSE | ACTION_RESTART | ACTION_MUTE);
      actions &= ~(ACTION_CONFIRM | ACTION_PAUSE | ACTION_RESTART | ACTION_MUTE);
      return taken;
    },
  };
}
