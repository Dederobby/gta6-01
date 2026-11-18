// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between five screens: title,
// play, paused, game over and victory.
//
// ?seed=N fixes the city and traffic. ?shot=chase|street|mission|title (with
// &seed=N) stages that scene instead of running the loop, paints it twice and
// sets window.__shotReady for a screenshot.
import { FIELD, SAVE_KEY, STEP, STORY } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_HIT, EVENT_MISSION, EVENT_OVER, EVENT_WIN, EVENT_WANTED,
  applySave, createWorld, readBest, readSave, respawn, resetWorld, stepDemo, stepWorld,
} from './world.js';
import {
  ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput,
} from './input.js';
import { AudioSys } from './audio.js';
import {
  SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN, createRenderer,
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
const input = createInput(canvas);
const save = readSave();
let best = readBest();

// First gesture wakes audio (browsers require it) and starts the music.
let audioStarted = false;
function wakeAudio() {
  if (audioStarted) return;
  audioStarted = true;
  try {
    AudioSys.init();
    AudioSys.resume();
    AudioSys.setMusic(true);
  } catch { /* no audio device: the game plays silent */ }
}
window.addEventListener('keydown', wakeAudio);
window.addEventListener('pointerdown', wakeAudio);

// The mouse aims the pistol: canvas pixels to world coordinates.
function aimWorld() {
  const rect = canvas.getBoundingClientRect();
  const mouse = input.mouse();
  const scale = Math.min(rect.width / FIELD.width, rect.height / FIELD.height);
  const offsetX = (rect.width - FIELD.width * scale) / 2;
  const offsetY = (rect.height - FIELD.height * scale) / 2;
  return {
    x: world.state.camera.x + (mouse.x - offsetX) / scale,
    y: world.state.camera.y + (mouse.y - offsetY) / scale,
  };
}

// Debug handle for the playtest driver (and curious players).
window.__verde = {
  get state() { return world.state; },
  get screen() { return screen; },
  world,
};

let screen = SCREEN_TITLE;

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, world, scene.screen, scene.best, save);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startGame(fromSave) {
    if (fromSave && save) applySave(world, save);
    else resetWorld(world);
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Playing. ${STORY.hero} is out in ${STORY.city}.`);
  }

  function endGame() {
    screen = SCREEN_OVER;
    AudioSys.sfx(world.state.overReason === 'busted' ? 'busted' : 'wasted');
    announce(world.state.overReason === 'busted' ? 'Busted.' : 'Wasted.');
  }

  function winGame() {
    screen = SCREEN_WIN;
    AudioSys.sfx('win');
    announce('All eight jobs done. The Bay is yours.');
  }

  function handleActions() {
    const actions = input.takeUiActions();
    if (actions & ACTION_MUTE) {
      AudioSys.setMuted(!AudioSys.muted);
      return;
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startGame(false);
      return;
    }
    if (screen === SCREEN_OVER) {
      if (actions & ACTION_CONFIRM) {
        respawn(world, world.state.overReason);
        screen = SCREEN_PLAY;
        announce('Back on the streets.');
      }
      return;
    }
    if (screen === SCREEN_WIN) {
      if (actions & ACTION_CONFIRM) {
        screen = SCREEN_PLAY;
        announce('Free roam.');
      } else if (actions & ACTION_RESTART) {
        startGame(false);
      }
      return;
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    } else if (actions & ACTION_RESTART && screen === SCREEN_PLAY) {
      startGame(false);
    }
  }

  // 'C' on the title screen continues a saved game.
  window.addEventListener('keydown', (event) => {
    if (screen === SCREEN_TITLE && event.code === 'KeyC' && save) startGame(true);
  });

  function step() {
    if (screen === SCREEN_TITLE) {
      stepDemo(world, STEP);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const events = stepWorld(world, STEP, input, aimWorld());
    if (events & EVENT_OVER) endGame();
    else if (events & EVENT_WIN) winGame();
    else if (events & EVENT_MISSION) announce('Mission complete.');
    else if (events & EVENT_WANTED) announce(`Wanted level ${world.state.wantedStars}.`);
    else if (events & EVENT_HIT) announce('Hit.');
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, world, screen, best, save);
  }

  // Leaving the tab pauses a running game rather than letting the city move unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce(`${STORY.city}. Press Enter or click to start.`);
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
