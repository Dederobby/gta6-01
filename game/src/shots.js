// Deterministic scene staging for the screenshots: each scene runs the real
// game (real city, real traffic, real police) under an autopilot, then hands
// back the screen to paint. ?shot=chase|street|mission|title with &seed=N.
import { CELL, STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { currentObjective, resetWorld, stagePoliceChase, startMission, stepDemo, stepWorld } from './world.js';

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/** Breadth-first path over the road grid from the car's tile to the target's
 * tile. Returns tile centres from start to goal, or null if no road route
 * exists. The road network is a grid, so this always finds the route a
 * driver would take instead of cutting straight across blocks. */
function findPath(city, from, to) {
  const tiles = 60;
  const tile = 64;
  const clampT = (v) => Math.max(0, Math.min(tiles - 1, v));
  const isRoad = (tx, ty) => city.cellAt(tx, ty) === CELL.ROAD;
  // Snap a point to its nearest road tile (the car or the marker may sit
  // just off the road, on a kerb or a forecourt).
  const snap = (tx, ty) => {
    if (isRoad(tx, ty)) return tx + ty * tiles;
    for (let r = 1; r <= 8; r += 1) {
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = tx + dx;
          const ny = ty + dy;
          if (nx < 0 || ny < 0 || nx >= tiles || ny >= tiles) continue;
          if (isRoad(nx, ny)) return nx + ny * tiles;
        }
      }
    }
    return -1;
  };
  const start = snap(clampT(Math.floor(from.x / tile)), clampT(Math.floor(from.y / tile)));
  const goal = snap(clampT(Math.floor(to.x / tile)), clampT(Math.floor(to.y / tile)));
  if (start < 0 || goal < 0) return null;
  const prev = new Int32Array(tiles * tiles).fill(-1);
  const queue = [start];
  prev[start] = start;
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head];
    head += 1;
    if (cur === goal) break;
    const cx = cur % tiles;
    const cy = Math.floor(cur / tiles);
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= tiles || ny >= tiles) continue;
      const ni = ny * tiles + nx;
      if (prev[ni] !== -1 || !isRoad(nx, ny)) continue;
      prev[ni] = cur;
      queue.push(ni);
    }
  }
  if (prev[goal] === -1) return null;
  const path = [];
  let cur = goal;
  while (cur !== start) {
    path.push({ x: (cur % tiles) * tile + tile / 2, y: Math.floor(cur / tiles) * tile + tile / 2 });
    cur = prev[cur];
  }
  path.reverse();
  return path;
}

/** A synthetic input that drives or walks toward a target point. When
 * enterFirst is set, it first walks to the nearest car and keeps pressing E
 * until the player is behind the wheel, then drives to the target. If the
 * car stops making progress, it does a reverse-and-turn to get unstuck. */
export function makePilot(world, getTarget, enterFirst) {
  let windowSteps = 0;
  let windowX = 0;
  let windowY = 0;
  let windowAngle = 0;
  let unstickSteps = 0;
  let path = null;
  let pathTarget = null;
  let pathAge = 0;
  return {
    move() {
      const state = world.state;
      const p = state.player;
      if (enterFirst && !p.car) {
        // Walk to the nearest stealable car first.
        let best = null;
        let bestD = Infinity;
        for (const car of state.cars) {
          if (car.dead || car.driver === 'police' || car.driver === 'rival') continue;
          const d = Math.hypot(car.x - p.x, car.y - p.y);
          if (d < bestD) { bestD = d; best = car; }
        }
        if (!best) return { x: 0, y: 0, active: false };
        if (bestD < 24) return { x: 0, y: 0, active: false };
        return { x: (best.x - p.x) / bestD, y: (best.y - p.y) / bestD, active: true };
      }
      const target = getTarget();
      if (!target) return { x: 0, y: 0, active: false };
      if (p.car) {
        const car = p.car;
        if (unstickSteps > 0) {
          unstickSteps -= 1;
          return { x: -1, y: 1, active: true }; // reverse + hard turn
        }
        // Stuck detection over a 3 s window: only a car that is nearly
        // stopped, has barely moved AND has barely turned counts as stuck.
        // A slow turn or a braking approach moves slowly but is not stuck.
        if (windowSteps === 0) { windowX = car.x; windowY = car.y; windowAngle = car.angle; }
        windowSteps += 1;
        if (windowSteps >= 180) {
          const moved = Math.hypot(car.x - windowX, car.y - windowY);
          const turned = Math.abs(angleDiff(windowAngle, car.angle));
          windowSteps = 0;
          if (moved < 40 && turned < 0.3 && Math.abs(car.speed) < 40) unstickSteps = 60;
        }
        // Follow the road route to the target, replanned every half second
        // (or when the target moves): steer at the first waypoint more
        // than 100 px ahead, so turns are taken at intersections.
        pathAge += 1;
        if (!path || pathAge >= 30
          || !pathTarget || Math.hypot(pathTarget.x - target.x, pathTarget.y - target.y) > 1) {
          path = findPath(state.city, { x: car.x, y: car.y }, target);
          pathTarget = { x: target.x, y: target.y };
          pathAge = 0;
        }
        let wp = null;
        if (path) {
          for (const pt of path) {
            if (Math.hypot(pt.x - car.x, pt.y - car.y) > 100) { wp = pt; break; }
          }
          if (!wp) wp = path[path.length - 1];
        }
        if (!wp) wp = target;
        const want = Math.atan2(wp.y - car.y, wp.x - car.x);
        const turn = Math.abs(angleDiff(car.angle, want));
        const steer = clamp(angleDiff(car.angle, want) * 2.5, -1, 1);
        // Slow for a turn: brake for a sharp one, coast for a gentle one.
        // NOTE: y=+1 is reverse in this game, not a brake pedal — only use
        // it while the car still has forward speed to shed; near a stop,
        // coast and let the car rotate toward the waypoint instead.
        let throttle = -1;
        if (turn > 1.0) throttle = Math.abs(car.speed) > 60 ? 1 : 0;
        else if (turn > 0.5) throttle = 0;
        return { x: steer, y: throttle, active: true };
      }
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 24) return { x: 0, y: 0, active: false };
      return { x: dx / d, y: dy / d, active: true };
    },
    runHeld() { return true; },
    spaceHeld() { return false; },
    mouseDown() { return false; },
    mouse() { return { x: 640, y: 360 }; },
    takeActions() {
      if (enterFirst && !world.state.player.car) return 4; // ACTION_ENTER
      return 0;
    },
    // QA hook: inspect the autopilot's stuck-detection state.
    debug() {
      return { windowSteps, unstickSteps, pathLen: path ? path.length : 0 };
    },
  };
}

function aimAt(world) {
  const p = world.state.player;
  return p.car ? { x: p.car.x, y: p.car.y } : { x: p.x, y: p.y };
}

/** Staging: put the player on foot right next to the nearest street car, so
 * the steal that opens every driving scene happens on the first step. */
export function placePlayerByCar(world) {
  const p = world.state.player;
  let best = null;
  let bestD = Infinity;
  for (const car of world.state.cars) {
    if (car.dead || car.driver === 'police' || car.driver === 'rival') continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  if (best) {
    p.x = best.x - 40;
    p.y = best.y;
    world.state.camera.x = Math.max(0, Math.min(3840 - 1280, p.x - 640));
    world.state.camera.y = Math.max(0, Math.min(3840 - 720, p.y - 360));
  }
}

function stepFor(world, input, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) stepWorld(world, STEP, input, aimAt(world));
}

export function stageShot(name, world) {
  resetWorld(world);
  if (name === 'title') {
    for (let i = 0; i < 360; i += 1) stepDemo(world, STEP);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'street') {
    // Walk toward the nearest parked car while traffic rolls past.
    const car = world.state.cars.find((c) => c.driver === 'parked') || world.state.cars[0];
    const pilot = makePilot(world, () => ({ x: car.x, y: car.y }), false);
    stepFor(world, pilot, 7);
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'mission') {
    // Mission 2: pick up at the warehouse, deliver to the garage.
    world.state.missionIndex = 1;
    startMission(world, 1);
    placePlayerByCar(world);
    const pilot = makePilot(world, () => {
      const o = currentObjective(world);
      return o && o.x !== undefined ? { x: o.x, y: o.y } : null;
    }, true);
    stepFor(world, pilot, 10);
    return { screen: SCREEN_PLAY, best: 0 };
  }
  // Default: chase — the cover. Steal a car first (no heat yet, so the
  // player takes a street car, not a police car), then three stars, police
  // on the tail, driving hard toward the first mission marker. (The paint
  // shop can clear heat mid-drive, so the heat is staged at the end, right
  // before the frame.)
  placePlayerByCar(world);
  const pilot = makePilot(world, () => {
    const o = currentObjective(world);
    return o && o.x !== undefined ? { x: o.x, y: o.y } : null;
  }, true);
  stepFor(world, pilot, 3);
  world.state.wanted = 3;
  world.state.wantedStars = 3;
  stepFor(world, pilot, 6);
  stagePoliceChase(world, 3);
  stepFor(world, pilot, 1);
  return { screen: SCREEN_PLAY, best: 0 };
}
