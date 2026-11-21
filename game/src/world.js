// Verde Bay's rules and state, with no drawing and no browser in it: the
// player on foot and in cars, traffic, pedestrians, police and the wanted
// system, combat, missions, pickups, the economy and the save. stepWorld()
// advances one fixed step and returns what happened as bit flags, so the
// caller can react without the world knowing about screens or sound.
// Everything here is original: the city, the names, the story.

import {
  CAR_CLASS, CELL, ECONOMY, FIELD, HEAT, MISSION_COUNT, PALETTE, PLAYER,
  SAVE_KEY, STEP, TRAFFIC, WANTED, WORLD,
} from './config.js';
import { createCity } from './city.js';
import { MISSIONS } from './missions.js';
import { AudioSys } from './audio.js';

export const EVENT_HIT = 1;
export const EVENT_OVER = 2;
export const EVENT_WIN = 4;
export const EVENT_MISSION = 8;
export const EVENT_WANTED = 16;

const TAU = Math.PI * 2;
const CAR_COLORS = ['#c0392b', '#2e86c1', '#e8e3c8', '#5d6d7e', '#a93226', '#1e8449', '#7d3c98', '#b7950b'];
const PED_SHIRTS = ['#e8e0d0', '#7fa3b8', '#c98f5f', '#b0788a', '#5da85c', '#d9a441', '#8e7cc3', '#e07a5f'];
const PED_SKINS = ['#e8b98a', '#c98d5f', '#8a5a3b', '#f0c8a0'];
const STREET_KINDS = ['sedan', 'sedan', 'taxi', 'truck', 'sport', 'muscle'];

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function angleTo(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }
function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** A car: kind is a CAR_CLASS key; driver is 'traffic' | 'parked' | 'player' | 'police' | 'rival' | null. */
function makeCar(rng, kind, x, y, angle, driver) {
  const spec = CAR_CLASS[kind];
  const color = kind === 'taxi' ? PALETTE.taxi
    : kind === 'police' ? PALETTE.police
    : kind === 'rival' ? PALETTE.rival
    : CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
  return {
    id: Math.floor(rng() * 1e9), kind, driver, x, y, angle, speed: 0,
    health: spec.health, maxHealth: spec.health, color,
    targetSpeed: 0, turn: 0, stuck: 0, dead: false, siren: 0, hitCd: 0,
    nearMissed: false, wait: 0,
  };
}

function makePed(rng, x, y, cop) {
  return {
    x, y, angle: rng() * TAU, speed: 40 + rng() * 30, cop: !!cop,
    shirt: cop ? PALETTE.police : PED_SHIRTS[Math.floor(rng() * PED_SHIRTS.length)],
    skin: PED_SKINS[Math.floor(rng() * PED_SKINS.length)],
    hp: cop ? 60 : 30, hostile: false, flee: 0, punchCd: 0, arrest: 0,
    wander: 2 + rng() * 4, dead: false,
  };
}

function burst(state, x, y, color, n, speed, life, size) {
  for (let i = 0; i < n; i += 1) {
    const a = Math.random() * TAU;
    const s = speed * (0.4 + Math.random() * 0.8);
    state.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: life * (0.6 + Math.random() * 0.7), maxLife: life, color, size: size * (0.6 + Math.random() * 0.8),
    });
  }
}

function floatText(state, x, y, text, color) {
  state.floats.push({ x, y, text, life: 1.6, color });
}

export function createWorld(random) {
  const city = createCity(random);
  const state = {
    rng: random,
    city,
    time: 0,
    screen: 'title',
    player: {
      x: 0, y: 0, angle: -Math.PI / 2, health: PLAYER.health, ammo: PLAYER.startAmmo,
      car: null, punchCd: 0, shotCd: 0, invuln: 0, moving: false, aimAngle: 0,
    },
    cars: [],
    peds: [],
    pickups: [],
    particles: [],
    floats: [],
    wanted: 0,
    wantedStars: 0,
    unseen: 0,
    cash: ECONOMY.startCash,
    earned: 0,
    score: 0,
    kills: 0,
    carsStolen: 0,
    nearMisses: 0,
    missionIndex: 0,
    mission: null,
    package: false,
    camera: { x: 0, y: 0 },
    shake: 0,
    skidCd: 0,
    shopCd: 0,
    overReason: null,
    won: false,
    saveTimer: 0,
  };
  const world = { state, random };
  resetWorld(world);
  return world;
}

export function resetWorld(world, keepSave) {
  const { state, random } = world;
  const keep = keepSave ? { missionIndex: state.missionIndex, cash: state.cash, score: state.score } : null;
  const hideout = state.city.landmarks.hideout;
  state.time = 0;
  state.player.x = hideout.x;
  state.player.y = hideout.y;
  state.player.angle = -Math.PI / 2;
  state.player.health = PLAYER.health;
  state.player.ammo = PLAYER.startAmmo;
  state.player.car = null;
  state.player.punchCd = 0;
  state.player.shotCd = 0;
  state.player.invuln = 0;
  state.cars = [];
  state.peds = [];
  state.pickups = [];
  state.particles = [];
  state.floats = [];
  state.wanted = 0;
  state.wantedStars = 0;
  state.unseen = 0;
  state.kills = 0;
  state.carsStolen = 0;
  state.nearMisses = 0;
  state.mission = null;
  state.package = false;
  state.camera.x = clamp(hideout.x - FIELD.width / 2, 0, WORLD.size - FIELD.width);
  state.camera.y = clamp(hideout.y - FIELD.height / 2, 0, WORLD.size - FIELD.height);
  state.shake = 0;
  state.skidCd = 0;
  state.shopCd = 0;
  state.overReason = null;
  state.won = false;
  if (keep) {
    state.missionIndex = keep.missionIndex;
    state.cash = keep.cash;
    state.score = keep.score;
  } else {
    state.missionIndex = 0;
    state.cash = ECONOMY.startCash;
    state.earned = 0;
    state.score = 0;
  }
  // Seed the streets: parked cars and a few moving ones near the hideout.
  for (let i = 0; i < 14; i += 1) {
    const p = state.city.roadPoint(random);
    const car = makeCar(random, STREET_KINDS[Math.floor(random() * STREET_KINDS.length)], p.x, p.y, p.angle, random() < 0.5 ? 'parked' : 'traffic');
    state.cars.push(car);
  }
  for (let i = 0; i < 16; i += 1) {
    const p = state.city.sidewalkPoint(random);
    state.peds.push(makePed(random, p.x, p.y, false));
  }
  for (let i = 0; i < 4; i += 1) spawnPickup(state);
  startMission(world, state.missionIndex);
}

/** Put the player back on their feet after busted/wasted, keeping progress.
 * A wasted trip to the hospital costs the hospital fee — the bill comes out
 * of the player's cash, never below zero. */
export function respawn(world, reason) {
  const { state } = world;
  const spot = reason === 'busted' ? state.city.landmarks.hideout : state.city.landmarks.hospital;
  state.player.x = spot.x;
  state.player.y = spot.y;
  state.player.health = PLAYER.health;
  state.player.car = null;
  state.player.invuln = 2;
  state.wanted = 0;
  state.wantedStars = 0;
  state.overReason = null;
  if (reason === 'wasted') {
    state.cash = Math.max(0, state.cash - ECONOMY.hospitalCost);
  }
  state.camera.x = clamp(spot.x - FIELD.width / 2, 0, WORLD.size - FIELD.width);
  state.camera.y = clamp(spot.y - FIELD.height / 2, 0, WORLD.size - FIELD.height);
  // The police scatter after a bust or a hospital stay.
  for (const car of state.cars) if (car.driver === 'police') car.dead = true;
  state.peds = state.peds.filter((p) => !p.cop);
}

function addWanted(state, n, silent) {
  const before = state.wantedStars;
  state.wanted = clamp(state.wanted + n, 0, WANTED.max);
  state.wantedStars = Math.ceil(state.wanted);
  if (!silent && state.wantedStars > before) {
    AudioSys.sfx('wantedUp');
    floatText(state, state.player.x, state.player.y - 30, `WANTED ${'★'.repeat(state.wantedStars)}`, PALETTE.star);
    return EVENT_WANTED;
  }
  return 0;
}

function spawnPickup(state) {
  const p = state.city.sidewalkPoint(state.rng);
  const kinds = ['cash', 'cash', 'ammo', 'health'];
  state.pickups.push({ x: p.x, y: p.y, kind: kinds[Math.floor(state.rng() * kinds.length)], t: state.rng() * TAU });
}

function nearestCar(state, x, y, maxDist, filter) {
  let best = null;
  let bestD = maxDist;
  for (const car of state.cars) {
    if (car.dead || (filter && !filter(car))) continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function nearestCop(state, x, y) {
  let best = Infinity;
  for (const car of state.cars) {
    if (car.dead || car.driver !== 'police') continue;
    best = Math.min(best, Math.hypot(car.x - x, car.y - y));
  }
  for (const ped of state.peds) {
    if (ped.dead || !ped.cop) continue;
    best = Math.min(best, Math.hypot(ped.x - x, ped.y - y));
  }
  return best;
}

/* ---------------- player on foot ---------------- */

function blockedAt(state, x, y, r) {
  const city = state.city;
  if (x < r || y < r || x > WORLD.size - r || y > WORLD.size - r) return true;
  for (let a = 0; a < 8; a += 1) {
    const px = x + Math.cos((a / 8) * TAU) * r;
    const py = y + Math.sin((a / 8) * TAU) * r;
    if (city.isBlockedAt(px, py)) return true;
  }
  return city.isBlockedAt(x, y);
}

/** Is a car body at (x, y, angle) touching a building or the map edge?
 * Five sample points (nose, tail, centre, both flanks) so a rotated car
 * cannot slip a corner past a wall. */
function carBlockedAt(state, x, y, angle, spec) {
  if (x < 40 || y < 40 || x > WORLD.size - 40 || y > WORLD.size - 40) return true;
  const fx = Math.cos(angle);
  const fy = Math.sin(angle);
  const rx = -fy;
  const ry = fx;
  const hl = spec.length / 2;
  const hw = spec.width / 2;
  const pts = [
    [x + fx * hl, y + fy * hl],
    [x - fx * hl, y - fy * hl],
    [x, y],
    [x + rx * hw, y + ry * hw],
    [x - rx * hw, y - ry * hw],
  ];
  for (const [px, py] of pts) {
    if (state.city.isBlockedAt(px, py)) return true;
  }
  return false;
}

function moveCircle(state, ent, dx, dy, r) {
  const nx = ent.x + dx;
  if (!blockedAt(state, nx, ent.y, r)) ent.x = nx;
  const ny = ent.y + dy;
  if (!blockedAt(state, ent.x, ny, r)) ent.y = ny;
}

function damagePlayer(state, amount) {
  const p = state.player;
  if (p.invuln > 0 || p.health <= 0) return 0;
  p.health -= amount;
  p.invuln = PLAYER.invulnerable;
  state.shake = Math.max(state.shake, 8);
  burst(state, p.x, p.y, '#ff5a3c', 8, 120, 0.5, 4);
  AudioSys.sfx('punch');
  if (p.health <= 0) {
    p.health = 0;
    state.overReason = 'wasted';
    return EVENT_OVER;
  }
  return EVENT_HIT;
}

function stepOnFoot(state, dt, input, aim) {
  const p = state.player;
  const mv = input.move();
  const speed = input.runHeld() ? PLAYER.runSpeed : PLAYER.walkSpeed;
  p.moving = mv.active;
  if (mv.active) {
    p.angle = Math.atan2(mv.y, mv.x);
    moveCircle(state, p, mv.x * speed * dt, mv.y * speed * dt, PLAYER.radius);
  }
  if (aim) p.aimAngle = Math.atan2(aim.y - p.y, aim.x - p.x);
  else if (mv.active) p.aimAngle = p.angle;
  p.punchCd = Math.max(0, p.punchCd - dt);
  p.shotCd = Math.max(0, p.shotCd - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  return 0;
}

function punch(state) {
  const p = state.player;
  if (p.punchCd > 0 || p.car) return 0;
  p.punchCd = PLAYER.punchCooldown;
  AudioSys.sfx('punch');
  const hx = p.x + Math.cos(p.aimAngle) * PLAYER.punchRange;
  const hy = p.y + Math.sin(p.aimAngle) * PLAYER.punchRange;
  burst(state, hx, hy, '#ffffff', 4, 60, 0.25, 3);
  let events = 0;
  // Hit the nearest thug, cop or pedestrian in range.
  let best = null;
  let bestD = PLAYER.punchRange + 16;
  for (const ped of state.peds) {
    if (ped.dead) continue;
    const d = Math.hypot(ped.x - p.x, ped.y - p.y);
    if (d < bestD) { bestD = d; best = ped; }
  }
  if (best) {
    best.hp -= PLAYER.punchDamage;
    best.flee = 2;
    if (best.hostile || best.cop) {
      burst(state, best.x, best.y, '#ffd23f', 8, 140, 0.4, 4);
      if (best.hp <= 0) {
        best.dead = true;
        state.kills += 1;
        state.score += 25;
        floatText(state, best.x, best.y - 20, 'DOWN', '#ffd23f');
        AudioSys.sfx('cash');
        if (best.cop) events |= addWanted(state, 1);
      }
    } else {
      // Assaulting a bystander is a crime when the police can see it.
      if (nearestCop(state, p.x, p.y) < 500) events |= addWanted(state, 1);
      else state.wanted = clamp(state.wanted + 0.25, 0, WANTED.max);
      best.x += Math.cos(p.aimAngle) * 30;
      best.y += Math.sin(p.aimAngle) * 30;
    }
    return events;
  }
  // Punch a nearby car door instead.
  const car = nearestCar(state, p.x, p.y, PLAYER.punchRange + 30);
  if (car) {
    car.health -= PLAYER.punchDamage;
    burst(state, car.x, car.y, '#ffd23f', 6, 120, 0.4, 4);
    if (car.health <= 0) explodeCar(state, car);
  }
  return events;
}

/** Fire the pistol at the aim point. On foot the shot leaves the player's
 * hands; from a car it is a drive-by out of the window — weaker, but the
 * player keeps moving, which is what the `destroy` missions need. */
function shoot(state, aim) {
  const p = state.player;
  if (p.shotCd > 0 || p.ammo <= 0 || !aim) return 0;
  const fromCar = !!p.car;
  const ox = fromCar ? p.car.x : p.x;
  const oy = fromCar ? p.car.y : p.y;
  p.shotCd = PLAYER.shotCooldown;
  p.ammo -= 1;
  AudioSys.sfx('shot');
  const aimAngle = Math.atan2(aim.y - oy, aim.x - ox);
  p.aimAngle = aimAngle;
  const damage = fromCar ? PLAYER.driveByDamage : PLAYER.shotDamage;
  const dx = Math.cos(aimAngle);
  const dy = Math.sin(aimAngle);
  burst(state, ox + dx * 18, oy + dy * 18, '#ffe08a', 3, 80, 0.15, 3);
  // Walk the bullet out until it hits a car, a person or a wall.
  let events = 0;
  for (let t = 24; t < PLAYER.shotRange; t += 12) {
    const x = ox + dx * t;
    const y = oy + dy * t;
    if (state.city.isBlockedAt(x, y)) {
      burst(state, x, y, '#c9c2b2', 5, 90, 0.3, 3);
      break;
    }
    let hit = false;
    for (const car of state.cars) {
      if (car.dead) continue;
      if (fromCar && car === p.car) continue;
      if (Math.abs((x - car.x) * Math.cos(car.angle) + (y - car.y) * Math.sin(car.angle)) < CAR_CLASS[car.kind].length / 2
        && Math.abs(-(x - car.x) * Math.sin(car.angle) + (y - car.y) * Math.cos(car.angle)) < CAR_CLASS[car.kind].width / 2) {
        car.health -= damage;
        burst(state, x, y, '#ff5a3c', 6, 120, 0.35, 4);
        if (car.driver === 'police') events |= addWanted(state, 1);
        if (car.health <= 0) explodeCar(state, car);
        hit = true;
        break;
      }
    }
    if (hit) break;
    for (const ped of state.peds) {
      if (ped.dead) continue;
      if (Math.hypot(ped.x - x, ped.y - y) < 16) {
        ped.hp -= damage;
        ped.flee = 3;
        burst(state, ped.x, ped.y, '#ff5a3c', 8, 130, 0.4, 4);
        if (ped.hp <= 0) {
          ped.dead = true;
          state.kills += 1;
          state.score += 25;
          if (ped.cop) events |= addWanted(state, 2);
          else events |= addWanted(state, 1);
        }
        hit = true;
        break;
      }
    }
    if (hit) break;
    if (t > PLAYER.shotRange - 12) burst(state, x, y, '#ffffff', 2, 40, 0.2, 2);
  }
  state.wanted = clamp(state.wanted + 0.25, 0, WANTED.max);
  state.wantedStars = Math.ceil(state.wanted);
  return events;
}

function explodeCar(state, car) {
  if (car.dead) return;
  car.dead = true;
  AudioSys.sfx('explosion');
  state.shake = Math.max(state.shake, 16);
  burst(state, car.x, car.y, '#ff9a3c', 26, 260, 0.8, 7);
  burst(state, car.x, car.y, '#ff3b30', 18, 180, 0.6, 6);
  burst(state, car.x, car.y, '#3c3c44', 14, 90, 1.2, 8);
  const p = state.player;
  if (p.car === car) {
    p.car = null;
    p.x = car.x + 40;
    p.y = car.y;
    return;
  }
  if (Math.hypot(p.x - car.x, p.y - car.y) < 130) {
    // Standing too close to a blast hurts.
    p.health -= 30;
    if (p.health <= 0) {
      p.health = 0;
      state.overReason = 'wasted';
    }
  }
  if (car.driver === 'rival' && state.mission) {
    state.mission.data.destroyed = (state.mission.data.destroyed || 0) + 1;
  }
}

/* ---------------- cars: steal, drive, collide ---------------- */

function enterCar(state) {
  const p = state.player;
  if (p.car) {
    // Get out on the driver's side.
    const car = p.car;
    car.driver = car.kind === 'police' ? 'police' : 'parked';
    car.speed = 0;
    p.car = null;
    p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    p.invuln = Math.max(p.invuln, 0.5);
    AudioSys.sfx('enterCar');
    return 0;
  }
  const car = nearestCar(state, p.x, p.y, 56);
  if (!car) return 0;
  let events = 0;
  if (car.driver === 'traffic') {
    // Yank the driver out; they run for it.
    const driver = makePed(state.rng, car.x, car.y, false);
    driver.flee = 5;
    state.peds.push(driver);
    if (nearestCop(state, p.x, p.y) < 420) events |= addWanted(state, 1);
    else state.wanted = clamp(state.wanted + 0.5, 0, WANTED.max);
    state.carsStolen += 1;
    state.score += 10;
  } else if (car.driver === 'police') {
    events |= addWanted(state, 2);
    state.carsStolen += 1;
    state.score += 10;
  } else if (car.driver === 'rival') {
    events |= addWanted(state, 1);
  }
  car.driver = 'player';
  p.car = car;
  AudioSys.sfx('enterCar');
  return events;
}

function stepDrive(state, dt, input, aim) {
  const car = state.player.car;
  if (!car) return 0;
  const spec = CAR_CLASS[car.kind];
  const mv = input.move();
  const steer = mv.x;
  const throttle = mv.y < 0 ? 1 : mv.y > 0 ? -0.6 : 0; // up = gas, down = brake/reverse
  if (aim) state.player.aimAngle = Math.atan2(aim.y - car.y, aim.x - car.x);
  // Cooldowns tick down in the car too: the drive-by pistol uses shotCd,
  // and it must recover while driving or the player fires exactly once.
  state.player.shotCd = Math.max(0, state.player.shotCd - dt);
  state.player.punchCd = Math.max(0, state.player.punchCd - dt);
  if (throttle > 0) car.speed += spec.accel * dt;
  else if (throttle < 0) car.speed -= (car.speed > 0 ? spec.accel * 1.4 : spec.accel * 0.7) * dt;
  else car.speed -= car.speed * 0.7 * dt;
  if (input.spaceHeld()) {
    car.speed -= car.speed * 2.2 * dt; // handbrake
    // A hard handbrake turn at speed skids: one short screech per half second.
    if (Math.abs(car.speed) > 200 && state.skidCd <= 0) {
      AudioSys.sfx('skid');
      state.skidCd = 0.5;
    }
  }
  car.speed = clamp(car.speed, -spec.reverse, spec.maxSpeed);
  const turnRate = spec.grip * clamp(Math.abs(car.speed) / spec.maxSpeed, 0.45, 1) * (car.speed < 0 ? -1 : 1);
  car.angle += steer * turnRate * dt * (input.spaceHeld() ? 1.5 : 1);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  // Nose-first collision: slide along the wall when possible, stop hard on
  // a solid hit and take damage.
  if (!carBlockedAt(state, nx, ny, car.angle, spec)) {
    car.x = nx;
    car.y = ny;
  } else if (!carBlockedAt(state, nx, car.y, car.angle, spec)) {
    car.x = nx;
  } else if (!carBlockedAt(state, car.x, ny, car.angle, spec)) {
    car.y = ny;
  } else {
    const impact = Math.abs(car.speed);
    if (impact > 140) {
      car.health -= Math.min(15, impact * 0.02);
      state.shake = Math.max(state.shake, Math.min(12, impact / 40));
      burst(state, nx + Math.cos(car.angle) * (spec.length / 2), ny + Math.sin(car.angle) * (spec.length / 2), '#e8e3c8', 8, 140, 0.4, 4);
      AudioSys.sfx('crash');
      if (car.health <= 0) explodeCar(state, car);
    }
    car.speed *= -0.25;
  }
  car.x = clamp(car.x, 40, WORLD.size - 40);
  car.y = clamp(car.y, 40, WORLD.size - 40);
  // Near miss: threading past a traffic car at speed, without touching it,
  // pays a small score bonus — once per car until it is far away again.
  if (Math.abs(car.speed) > ECONOMY.nearMissSpeed) {
    for (const other of state.cars) {
      if (other === car || other.dead || other.driver !== 'traffic') continue;
      const d = Math.hypot(other.x - car.x, other.y - car.y);
      if (d < 80 && !other.nearMissed) {
        other.nearMissed = true;
        state.nearMisses += 1;
        floatText(state, car.x, car.y - 34, `NEAR MISS +${ECONOMY.nearMissScore}`, PALETTE.star);
        AudioSys.sfx('nearMiss');
      } else if (d > 220) {
        other.nearMissed = false;
      }
    }
  }
  return 0;
}

function collideCars(state, dt) {
  const cars = state.cars;
  for (const car of cars) car.hitCd = Math.max(0, car.hitCd - dt);
  for (let i = 0; i < cars.length; i += 1) {
    const a = cars[i];
    if (a.dead) continue;
    for (let j = i + 1; j < cars.length; j += 1) {
      const b = cars[j];
      if (b.dead) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = (CAR_CLASS[a.kind].length + CAR_CLASS[b.kind].length) / 2 * 0.8;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        const ux = dx / d;
        const uy = dy / d;
        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
        const rel = Math.abs(a.speed - b.speed);
        // Damage only on a fresh impact: two cars pressed together must
        // not grind each other down every single step.
        if (rel > 120 && a.hitCd <= 0 && b.hitCd <= 0) {
          // Pursuit-rated police cars shrug off half the crash damage.
          const da = a.driver === 'police' ? 0.5 : 1;
          const db = b.driver === 'police' ? 0.5 : 1;
          a.health -= rel * 0.03 * da;
          b.health -= rel * 0.03 * db;
          a.hitCd = 0.3;
          b.hitCd = 0.3;
          burst(state, (a.x + b.x) / 2, (a.y + b.y) / 2, '#e8e3c8', 5, 100, 0.3, 3);
          if (a.driver === 'player' || b.driver === 'player') AudioSys.sfx('crash');
          if (a.health <= 0) explodeCar(state, a);
          if (b.health <= 0) explodeCar(state, b);
        }
        a.speed *= 0.9;
        b.speed *= 0.9;
      }
    }
  }
}

/* ---------------- traffic, pedestrians, police ---------------- */

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

function roadAhead(state, x, y, dx, dy, look) {
  const tx = Math.floor((x + dx * look) / WORLD.tile);
  const ty = Math.floor((y + dy * look) / WORLD.tile);
  return state.city.cellAt(tx, ty) === CELL.ROAD;
}

function stepTrafficCar(state, car, dt) {
  const spec = CAR_CLASS[car.kind];
  const dir = DIRS[Math.round(((car.angle % TAU) + TAU) % TAU / (Math.PI / 2)) % 4];
  const dx = dir[0];
  const dy = dir[1];
  // Slow for the car ahead.
  let blocked = false;
  for (const other of state.cars) {
    if (other === car || other.dead) continue;
    const ox = other.x - car.x;
    const oy = other.y - car.y;
    if (ox * dx + oy * dy > 0 && Math.hypot(ox, oy) < 90) { blocked = true; break; }
  }
  // A car that waits forever behind a stopped car gridlocks the street:
  // after a few seconds it gives up and turns away (a U-turn if no crossing
  // road is open), so traffic keeps flowing around a jam instead of joining it.
  if (blocked) car.wait += dt;
  else car.wait = 0;
  if (car.wait > 2.5) {
    car.wait = 0;
    const options = [];
    for (let i = 0; i < 4; i += 1) {
      if (i === (DIRS.indexOf(dir) + 2) % 4) continue; // not a U-turn if avoidable
      const nd = DIRS[i];
      if (roadAhead(state, car.x, car.y, nd[0], nd[1], 70)) options.push(nd);
    }
    if (options.length === 0) car.angle += Math.PI; // U-turn
    else {
      const nd = options[Math.floor(state.rng() * options.length)];
      car.angle = Math.atan2(nd[1], nd[0]);
    }
    car.speed *= 0.5;
    blocked = false;
  }
  const target = blocked ? 0 : 120 + car.targetSpeed;
  car.speed += clamp(target - car.speed, -300 * dt, 200 * dt);
  // At a dead end, turn onto a crossing road.
  if (!roadAhead(state, car.x, car.y, dx, dy, 60)) {
    const options = [];
    for (let i = 0; i < 4; i += 1) {
      if (i === (DIRS.indexOf(dir) + 2) % 4) continue; // not a U-turn if avoidable
      const nd = DIRS[i];
      if (roadAhead(state, car.x, car.y, nd[0], nd[1], 70)) options.push(nd);
    }
    if (options.length === 0) {
      car.angle += Math.PI; // U-turn
    } else {
      const nd = options[Math.floor(state.rng() * options.length)];
      car.angle = Math.atan2(nd[1], nd[0]);
    }
    car.speed *= 0.5;
  }
  // Snap to the road centre line so traffic stays in its lane.
  const tile = WORLD.tile;
  const cx = Math.floor(car.x / tile) * tile + tile / 2;
  const cy = Math.floor(car.y / tile) * tile + tile / 2;
  const lane = 13;
  if (dx !== 0) car.y += clamp(cy + lane - car.y, -60 * dt, 60 * dt);
  else car.x += clamp(cx + lane - car.x, -60 * dt, 60 * dt);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  if (!carBlockedAt(state, nx, ny, car.angle, spec)) {
    car.x = nx;
    car.y = ny;
  } else {
    car.angle += Math.PI / 2;
    car.speed *= 0.4;
  }
  // Traffic cars that stray into the player are a fender-bender, not a crime.
  const p = state.player;
  if (!p.car && Math.hypot(p.x - car.x, p.y - car.y) < 34 && Math.abs(car.speed) > 60) {
    car.speed *= 0.3;
  }
}

function stepPed(state, ped, dt) {
  if (ped.dead) return;
  ped.punchCd = Math.max(0, ped.punchCd - dt);
  ped.wander -= dt;
  const p = state.player;
  const danger = state.particles.length > 0 && Math.hypot(p.x - ped.x, p.y - ped.y) < 220 && p.car;
  if (ped.flee > 0) {
    ped.flee -= dt;
    // Run away from the player.
    const a = Math.atan2(ped.y - p.y, ped.x - p.x);
    moveCircle(state, ped, Math.cos(a) * 150 * dt, Math.sin(a) * 150 * dt, 10);
    return;
  }
  if (ped.hostile) {
    // Thugs chase the player on foot and swing when close.
    const d = Math.hypot(p.x - ped.x, p.y - ped.y);
    if (p.car) {
      // A thug cannot chase a car: they wait, menacing, by the road.
      return;
    }
    const a = Math.atan2(p.y - ped.y, p.x - ped.x);
    ped.angle = a;
    moveCircle(state, ped, Math.cos(a) * 170 * dt, Math.sin(a) * 170 * dt, 10);
    if (d < 30 && ped.punchCd <= 0) {
      ped.punchCd = 1.0;
      damagePlayer(state, 8);
    }
    return;
  }
  if (ped.cop) {
    // Foot officers run the player down and try to make an arrest.
    const d = Math.hypot(p.x - ped.x, p.y - ped.y);
    if (p.car) return; // cops on foot cannot catch a car
    const a = Math.atan2(p.y - ped.y, p.x - ped.x);
    ped.angle = a;
    moveCircle(state, ped, Math.cos(a) * WANTED.copSpeed * dt, Math.sin(a) * WANTED.copSpeed * dt, 10);
    if (d < WANTED.copArrestRange) {
      ped.arrest += dt;
      if (ped.arrest > WANTED.copArrestTime) {
        state.overReason = 'busted';
        state.wanted = 0;
        state.wantedStars = 0;
      }
    } else {
      ped.arrest = 0;
    }
    return;
  }
  if (ped.wander <= 0) {
    ped.wander = 2 + state.rng() * 5;
    ped.angle = Math.floor(state.rng() * 4) * (Math.PI / 2);
  }
  const speed = danger ? 130 : ped.speed;
  moveCircle(state, ped, Math.cos(ped.angle) * speed * dt, Math.sin(ped.angle) * speed * dt, 10);
  // Pedestrians stay on sidewalks: if they wander onto a road, turn back.
  const tx = Math.floor(ped.x / WORLD.tile);
  const ty = Math.floor(ped.y / WORLD.tile);
  if (state.city.cellAt(tx, ty) === CELL.ROAD) ped.angle += Math.PI / 2;
}

function stepPoliceCar(state, car, dt) {
  const p = state.player;
  const target = p.car ? { x: p.car.x, y: p.car.y } : { x: p.x, y: p.y };
  const want = Math.atan2(target.y - car.y, target.x - car.x);
  const turn = clamp(angleDiff(car.angle, want), -2.4 * dt, 2.4 * dt);
  car.angle += turn;
  const spec = CAR_CLASS.police;
  const d = Math.hypot(target.x - car.x, target.y - car.y);
  const targetSpeed = d < 60 ? 120 : spec.maxSpeed * 0.9;
  car.speed += clamp(targetSpeed - car.speed, -500 * dt, 420 * dt);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  if (!carBlockedAt(state, nx, ny, car.angle, spec)) {
    car.x = nx;
    car.y = ny;
  } else {
    // Back out of the wall and swing toward the player while reversing,
    // so the car rounds the building corner instead of grinding on it.
    car.speed = -Math.abs(car.speed) * 0.4;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    car.angle += angleDiff(car.angle, want) * 0.6;
  }
  car.siren += dt;
  // Ram the player's car; shove a player on foot.
  if (p.car) {
    const pd = Math.hypot(p.car.x - car.x, p.car.y - car.y);
    if (pd < 60 && Math.abs(car.speed) > 150) {
      // A ram hurts, but three police cars piling on must not delete the
      // player's car in a second: the damage is per second of contact.
      p.car.health -= WANTED.ramDamage * dt;
      state.shake = Math.max(state.shake, 6);
      if (p.car.health <= 0) explodeCar(state, p.car);
    }
  } else if (Math.hypot(p.x - car.x, p.y - car.y) < 40 && Math.abs(car.speed) > 80) {
    damagePlayer(state, 10);
    car.speed *= 0.4;
  }
}

function maintainPolice(state, dt) {
  const stars = state.wantedStars;
  const p = state.player;
  // Police cars.
  let have = state.cars.filter((c) => !c.dead && c.driver === 'police').length;
  const wantCars = WANTED.policeCars[stars] || 0;
  if (have < wantCars && state.time % 1 < dt * 2) {
    const spot = state.city.roadPoint(state.rng);
    const d = Math.hypot(spot.x - p.x, spot.y - p.y);
    if (d > 500 && d < 1100) {
      const car = makeCar(state.rng, 'police', spot.x, spot.y, spot.angle, 'police');
      car.speed = 200;
      state.cars.push(car);
    }
  }
  // Foot officers, only when the player is on foot.
  let cops = state.peds.filter((x) => !x.dead && x.cop).length;
  const wantCops = p.car ? 0 : (WANTED.policeFoot[stars] || 0);
  if (cops < wantCops && state.time % 1 < dt * 2) {
    const spot = state.city.sidewalkPoint(state.rng);
    const d = Math.hypot(spot.x - p.x, spot.y - p.y);
    if (d > 260 && d < 600) state.peds.push(makePed(state.rng, spot.x, spot.y, true));
  }
  // Stand down when the heat is gone.
  if (stars === 0) {
    for (const car of state.cars) {
      if (car.driver === 'police' && !car.dead) {
        car.driver = 'traffic';
        car.targetSpeed = 60;
      }
    }
    state.peds = state.peds.filter((x) => !x.cop || x.dead);
  }
}

function stepWanted(state, dt) {
  const p = state.player;
  const seen = nearestCop(state, p.x, p.y) < 550;
  if (seen) state.unseen = 0;
  else state.unseen += dt;
  if (state.wanted > 0 && state.unseen > WANTED.decayDelay) {
    state.wanted = Math.max(0, state.wanted - WANTED.decayPerSecond * dt);
    const stars = Math.ceil(state.wanted);
    if (stars !== state.wantedStars) {
      state.wantedStars = stars;
      if (stars === 0) floatText(state, p.x, p.y - 30, 'HEAT CLEARED', PALETTE.health);
    }
  }
  AudioSys.siren(state.wantedStars > 0);
}

function stepShops(state, dt) {
  const p = state.player;
  const lm = state.city.landmarks;
  state.shopCd = Math.max(0, state.shopCd - dt);
  // Paint shop: drive in with heat and cash, drive out clean.
  if (p.car && state.wantedStars > 0 && state.cash >= ECONOMY.paintCost) {
    const d = Math.hypot(p.car.x - lm.paintShop.x, p.car.y - lm.paintShop.y);
    if (d < 80) {
      state.cash -= ECONOMY.paintCost;
      state.wanted = 0;
      state.wantedStars = 0;
      p.car.color = CAR_COLORS[Math.floor(state.rng() * CAR_COLORS.length)];
      floatText(state, p.car.x, p.car.y - 40, `RESPRAY -$${ECONOMY.paintCost}`, PALETTE.health);
      AudioSys.sfx('missionDone');
      burst(state, p.car.x, p.car.y, '#3ddc6a', 12, 120, 0.6, 4);
    }
  }
  // Hospital: patch up on foot.
  if (!p.car && p.health < PLAYER.health && state.cash >= ECONOMY.hospitalCost) {
    const d = Math.hypot(p.x - lm.hospital.x, p.y - lm.hospital.y);
    if (d < 80) {
      state.cash -= ECONOMY.hospitalCost;
      p.health = PLAYER.health;
      floatText(state, p.x, p.y - 30, `PATCHED UP -$${ECONOMY.hospitalCost}`, PALETTE.health);
      AudioSys.sfx('pickup');
    }
  }
  // Gun shop: walk in short on bullets and the clerk sells 24 for cash.
  // One box per visit pause (shopCd), so standing in the doorway does not
  // drain the wallet in a single frame.
  if (!p.car && p.ammo <= PLAYER.maxAmmo - 24 && state.cash >= ECONOMY.ammoCost && state.shopCd <= 0) {
    const d = Math.hypot(p.x - lm.gunShop.x, p.y - lm.gunShop.y);
    if (d < 80) {
      state.cash -= ECONOMY.ammoCost;
      p.ammo = Math.min(PLAYER.maxAmmo, p.ammo + 24);
      state.shopCd = 1.5;
      floatText(state, p.x, p.y - 30, `+24 AMMO -$${ECONOMY.ammoCost}`, PALETTE.ammo);
      AudioSys.sfx('buy');
    }
  }
}

/* ---------------- missions ---------------- */

export function startMission(world, index) {
  const { state } = world;
  if (index >= MISSION_COUNT) {
    state.mission = null;
    state.won = true;
    return;
  }
  const def = MISSIONS[index];
  state.mission = {
    def,
    oi: 0,
    data: { timer: 0, destroyed: 0, killsAtStart: state.kills, spawned: 0, heatCd: 0 },
  };
  state.package = false;
  AudioSys.sfx('missionStart');
}

function landmarkPos(state, name) {
  const lm = state.city.landmarks[name];
  return lm ? { x: lm.x, y: lm.y } : { x: WORLD.size / 2, y: WORLD.size / 2 };
}

function advanceObjective(state) {
  const m = state.mission;
  if (!m) return 0;
  m.oi += 1;
  m.data = { timer: 0, destroyed: 0, killsAtStart: state.kills, spawned: 0, heatCd: 0 };
  AudioSys.sfx('pickup');
  floatText(state, state.player.x, state.player.y - 34, 'OBJECTIVE DONE', PALETTE.health);
  if (m.oi >= m.def.objectives.length) {
    const reward = m.def.reward;
    state.cash += reward;
    state.earned += reward;
    state.missionIndex += 1;
    state.score = state.earned + state.missionIndex * 500 + state.kills * 25 + state.carsStolen * 10 + state.nearMisses * ECONOMY.nearMissScore;
    floatText(state, state.player.x, state.player.y - 54, `+$${reward}`, PALETTE.star);
    AudioSys.sfx('missionDone');
    burst(state, state.player.x, state.player.y, '#ffd23f', 16, 160, 0.7, 5);
    saveGame(state);
    if (state.missionIndex >= MISSION_COUNT) {
      state.mission = null;
      state.won = true;
      return EVENT_WIN;
    }
    startMission({ state }, state.missionIndex);
    return EVENT_MISSION;
  }
  return EVENT_MISSION;
}

function stepMission(state, dt) {
  const m = state.mission;
  if (!m) return 0;
  const obj = m.def.objectives[m.oi];
  if (!obj) return 0;
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  switch (obj.type) {
    case 'goto': {
      const t = landmarkPos(state, obj.landmark);
      if (Math.hypot(px - t.x, py - t.y) < obj.radius) return advanceObjective(state);
      break;
    }
    case 'steal':
      if (p.car) return advanceObjective(state);
      break;
    case 'drive': {
      if (!p.car) break;
      const t = landmarkPos(state, obj.landmark);
      if (Math.hypot(p.car.x - t.x, p.car.y - t.y) < obj.radius) return advanceObjective(state);
      break;
    }
    case 'pickup': {
      if (!m.data.pkg) m.data.pkg = landmarkPos(state, obj.landmark);
      if (Math.hypot(px - m.data.pkg.x, py - m.data.pkg.y) < 48) {
        state.package = true;
        AudioSys.sfx('cash');
        return advanceObjective(state);
      }
      break;
    }
    case 'deliver': {
      if (!state.package) break;
      const t = landmarkPos(state, obj.landmark);
      if (Math.hypot(px - t.x, py - t.y) < obj.radius) {
        state.package = false;
        return advanceObjective(state);
      }
      break;
    }
    case 'destroy': {
      const alive = state.cars.filter((c) => !c.dead && c.driver === 'rival').length;
      if (alive < 2 && (m.data.destroyed || 0) + alive < obj.count) {
        const spot = state.city.roadPoint(state.rng);
        if (Math.hypot(spot.x - px, spot.y - py) > 300 && Math.hypot(spot.x - px, spot.y - py) < 700) {
          const car = makeCar(state.rng, 'rival', spot.x, spot.y, spot.angle, 'rival');
          car.speed = 200;
          state.cars.push(car);
          m.data.spawned += 1;
        }
      }
      if ((m.data.destroyed || 0) >= obj.count) return advanceObjective(state);
      break;
    }
    case 'survive': {
      // The job brings its own heat: if the wanted level is below the
      // objective's floor, raise it (and re-raise it every few seconds
      // while the timer runs), so the player can always finish the job
      // instead of depending on crimes they may not have committed.
      // The heat also never cools off on its own mid-job: the cops stay
      // on the player's tail until the timer is done, so the timer runs
      // in real time instead of stalling whenever the chase goes quiet.
      state.unseen = 0;
      if (state.wantedStars < (obj.wanted || 1)) {
        m.data.heatCd = (m.data.heatCd || 0) - dt;
        if (m.data.heatCd <= 0) {
          state.wanted = obj.wanted || 1;
          state.wantedStars = Math.ceil(state.wanted);
          m.data.heatCd = HEAT.reraiseSeconds;
          AudioSys.sfx('wantedUp');
          floatText(state, p.x, p.y - 30, `THE HEAT IS ON — ${'★'.repeat(state.wantedStars)}`, PALETTE.star);
        }
      }
      if (state.wantedStars >= (obj.wanted || 1)) m.data.timer += dt;
      else m.data.timer = Math.max(0, m.data.timer - dt);
      if (m.data.timer >= obj.seconds) return advanceObjective(state);
      break;
    }
    case 'escape':
      if (state.wantedStars === 0) return advanceObjective(state);
      break;
    case 'fight': {
      const alive = state.peds.filter((x) => !x.dead && x.hostile).length;
      if (alive < 3 && state.kills - m.data.killsAtStart < obj.count) {
        const spot = state.city.sidewalkPoint(state.rng);
        if (Math.hypot(spot.x - px, spot.y - py) > 200 && Math.hypot(spot.x - px, spot.y - py) < 500) {
          const thug = makePed(state.rng, spot.x, spot.y, false);
          thug.hostile = true;
          thug.hp = 60;
          thug.shirt = '#7a1f1f';
          state.peds.push(thug);
        }
      }
      if (state.kills - m.data.killsAtStart >= obj.count) return advanceObjective(state);
      break;
    }
    default:
      break;
  }
  return 0;
}

/** The current objective for the HUD: text plus an optional world marker. */
export function currentObjective(world) {
  const m = world.state.mission;
  if (!m) return null;
  const obj = m.def.objectives[m.oi];
  if (!obj) return null;
  const out = { text: obj.text, title: m.def.title, index: m.def.id, total: MISSION_COUNT };
  if (obj.type === 'goto' || obj.type === 'drive' || obj.type === 'deliver') {
    const t = landmarkPos(world.state, obj.landmark);
    out.x = t.x;
    out.y = t.y;
  } else if (obj.type === 'pickup') {
    const t = m.data.pkg || landmarkPos(world.state, obj.landmark);
    out.x = t.x;
    out.y = t.y;
  } else if (obj.type === 'destroy') {
    // Point at the NEAREST rival, not the first spawned: the marker should
    // name the car the player can actually reach and shoot right now.
    let rival = null;
    let bestD = Infinity;
    for (const c of world.state.cars) {
      if (c.dead || c.driver !== 'rival') continue;
      const d = Math.hypot(c.x - (world.state.player.car ? world.state.player.car.x : world.state.player.x),
        c.y - (world.state.player.car ? world.state.player.car.y : world.state.player.y));
      if (d < bestD) { bestD = d; rival = c; }
    }
    if (rival) { out.x = rival.x; out.y = rival.y; }
    out.count = `${m.data.destroyed || 0}/${obj.count}`;
  } else if (obj.type === 'fight') {
    // Same: the nearest thug is the fight the player is already in.
    let thug = null;
    let bestD = Infinity;
    for (const x of world.state.peds) {
      if (x.dead || !x.hostile) continue;
      const d = Math.hypot(x.x - world.state.player.x, x.y - world.state.player.y);
      if (d < bestD) { bestD = d; thug = x; }
    }
    if (thug) { out.x = thug.x; out.y = thug.y; }
    out.count = `${world.state.kills - m.data.killsAtStart}/${obj.count}`;
  } else if (obj.type === 'survive') {
    out.count = `${Math.floor(m.data.timer)}/${obj.seconds}s`;
  }
  return out;
}

/* ---------------- pickups, save, main step ---------------- */

function stepPickups(state, dt) {
  state.pickupTimer = (state.pickupTimer || 0) - dt;
  if (state.pickupTimer <= 0) {
    state.pickupTimer = 7;
    if (state.pickups.length < 6) spawnPickup(state);
  }
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  for (const pk of state.pickups) {
    pk.t += dt;
    if (Math.hypot(px - pk.x, py - pk.y) < 30) {
      pk.dead = true;
      if (pk.kind === 'cash') {
        state.cash += ECONOMY.cashPickup;
        state.earned += ECONOMY.cashPickup;
        floatText(state, pk.x, pk.y - 20, `+$${ECONOMY.cashPickup}`, PALETTE.star);
        AudioSys.sfx('cash');
      } else if (pk.kind === 'ammo') {
        p.ammo = Math.min(PLAYER.maxAmmo, p.ammo + 24);
        floatText(state, pk.x, pk.y - 20, '+24 AMMO', PALETTE.ammo);
        AudioSys.sfx('pickup');
      } else {
        p.health = Math.min(PLAYER.health, p.health + 30);
        floatText(state, pk.x, pk.y - 20, '+30 HP', PALETTE.health);
        AudioSys.sfx('pickup');
      }
    }
  }
  state.pickups = state.pickups.filter((pk) => !pk.dead);
}

function saveGame(state) {
  try {
    const best = Math.max(readBest(), state.score);
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 1, missionIndex: state.missionIndex, cash: state.cash, best,
    }));
  } catch { /* storage can be off: the save then lasts this visit only */ }
}

export function readBest() {
  const save = readSave();
  return save ? (save.best || 0) : 0;
}

export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && data.v === 1) return data;
    return null;
  } catch {
    return null;
  }
}

export function applySave(world, save) {
  const { state } = world;
  state.missionIndex = Math.min(save.missionIndex || 0, MISSION_COUNT - 1);
  state.cash = save.cash || ECONOMY.startCash;
  resetWorld(world, true);
}

function stepParticles(state, dt) {
  for (const pt of state.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.96;
    pt.vy *= 0.96;
    pt.life -= dt;
  }
  state.particles = state.particles.filter((pt) => pt.life > 0);
  for (const f of state.floats) {
    f.y -= 24 * dt;
    f.life -= dt;
  }
  state.floats = state.floats.filter((f) => f.life > 0);
}

function stepCamera(state, dt) {
  const p = state.player;
  const tx = p.car ? p.car.x : p.x;
  const ty = p.car ? p.car.y : p.y;
  const cx = clamp(tx - FIELD.width / 2, 0, WORLD.size - FIELD.width);
  const cy = clamp(ty - FIELD.height / 2, 0, WORLD.size - FIELD.height);
  state.camera.x += (cx - state.camera.x) * Math.min(1, 6 * dt);
  state.camera.y += (cy - state.camera.y) * Math.min(1, 6 * dt);
  state.shake = Math.max(0, state.shake - 30 * dt);
}

export function stepWorld(world, dt, input, aim) {
  const { state } = world;
  let events = 0;
  state.time += dt;
  state.skidCd = Math.max(0, state.skidCd - dt);
  const p = state.player;
  const actions = input ? input.takeActions() : 0;
  if (actions & 4) events |= enterCar(state); // ACTION_ENTER
  if (actions & 8) events |= punch(state); // ACTION_PUNCH
  if (actions & 16) AudioSys.sfx('horn'); // ACTION_HORN
  // Click shoots on foot and out of a car window; Space shoots on foot only
  // (in a car it is the handbrake).
  if (input && (input.mouseDown() || (input.spaceHeld() && !p.car))) events |= shoot(state, aim);
  if (p.car) events |= stepDrive(state, dt, input, aim);
  else if (input) events |= stepOnFoot(state, dt, input, aim);
  // Traffic and rivals.
  for (const car of state.cars) {
    if (car.dead) continue;
    if (car.driver === 'police') stepPoliceCar(state, car, dt);
    else if (car.driver === 'rival') stepPoliceCar(state, car, dt); // rivals chase like police, no siren
    else if (car.driver === 'traffic') stepTrafficCar(state, car, dt);
  }
  collideCars(state, dt);
  state.cars = state.cars.filter((c) => !c.dead);
  if (p.car && p.car.dead) p.car = null;
  // Pedestrians.
  for (const ped of state.peds) stepPed(state, ped, dt);
  state.peds = state.peds.filter((x) => !x.dead);
  // Keep the streets populated near the camera.
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  const trafficCount = state.cars.filter((c) => c.driver === 'traffic').length;
  if (trafficCount < TRAFFIC.cars && state.time % 0.5 < dt) {
    const spot = state.city.roadPoint(state.rng);
    if (Math.hypot(spot.x - px, spot.y - py) > 600 && Math.hypot(spot.x - px, spot.y - py) < 1200) {
      const car = makeCar(state.rng, STREET_KINDS[Math.floor(state.rng() * STREET_KINDS.length)], spot.x, spot.y, spot.angle, 'traffic');
      car.speed = 120;
      car.targetSpeed = 40;
      state.cars.push(car);
    }
  }
  if (state.peds.length < TRAFFIC.peds && state.time % 0.5 < dt) {
    const spot = state.city.sidewalkPoint(state.rng);
    if (Math.hypot(spot.x - px, spot.y - py) > 500 && Math.hypot(spot.x - px, spot.y - py) < 1000) {
      state.peds.push(makePed(state.rng, spot.x, spot.y, false));
    }
  }
  // Far-away actors despawn so the arrays stay small.
  state.cars = state.cars.filter((c) => c.driver === 'player' || c.driver === 'police' || c.driver === 'rival'
    || Math.hypot(c.x - px, c.y - py) < TRAFFIC.despawn);
  state.peds = state.peds.filter((x) => x.hostile || x.cop || Math.hypot(x.x - px, x.y - py) < TRAFFIC.despawn);
  maintainPolice(state, dt);
  stepWanted(state, dt);
  stepShops(state, dt);
  stepPickups(state, dt);
  events |= stepMission(state, dt);
  stepParticles(state, dt);
  stepCamera(state, dt);
  // Engine hum follows the player's car.
  AudioSys.engine(p.car ? Math.abs(p.car.speed) / CAR_CLASS[p.car.kind].maxSpeed : 0);
  state.score = state.earned + state.missionIndex * 500 + state.kills * 25 + state.carsStolen * 10 + state.nearMisses * ECONOMY.nearMissScore;
  state.saveTimer += dt;
  if (state.saveTimer > 5) {
    state.saveTimer = 0;
    saveGame(state);
  }
  if (state.overReason) return events | EVENT_OVER;
  if (state.won) return events | EVENT_WIN;
  return events;
}

/** Ambient demo for the title screen: traffic and pedestrians only, the
 * camera drifting slowly over downtown. */
export function stepDemo(world, dt) {
  const { state } = world;
  state.time += dt;
  for (const car of state.cars) {
    if (car.dead) continue;
    if (car.driver === 'traffic') stepTrafficCar(state, car, dt);
  }
  for (const ped of state.peds) stepPed(state, ped, dt);
  state.camera.x = clamp(WORLD.size / 2 - FIELD.width / 2 + Math.sin(state.time * 0.05) * 500, 0, WORLD.size - FIELD.width);
  state.camera.y = clamp(WORLD.size / 2 - FIELD.height / 2 + Math.cos(state.time * 0.04) * 350, 0, WORLD.size - FIELD.height);
  stepParticles(state, dt);
}

/** Staging helper for the cover screenshot: set the wanted level and put
 * police cars on the player's tail. The chase that follows is the real
 * police AI; only the starting heat is staged. The extra cars are placed
 * directly on the player's own road, behind the player, so they are in
 * the frame — random road points almost never land close enough. */
export function stagePoliceChase(world, stars) {
  const { state } = world;
  state.wanted = stars;
  state.wantedStars = stars;
  state.unseen = 0;
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  const heading = p.car ? p.car.angle : p.angle;
  const hx = Math.cos(heading);
  const hy = Math.sin(heading);
  const tile = WORLD.tile;
  // Centre of the road row/column nearest to v (roads are every 7 tiles).
  const nearestAxis = (v) => (Math.round((v / tile - 6) / 7) * 7 + 6) * tile + tile / 2;
  const close = state.cars.filter((c) => !c.dead && c.driver === 'police'
    && Math.hypot(c.x - px, c.y - py) < 500).length;
  const eastWest = Math.abs(hx) >= Math.abs(hy);
  let added = 0;
  for (let k = 0; k < 2 - close && added < 2; k += 1) {
    const back = 230 + added * 140;
    let sx;
    let sy;
    if (eastWest) { sx = px - hx * back; sy = nearestAxis(py); }
    else { sx = nearestAxis(px); sy = py - hy * back; }
    sx = Math.max(80, Math.min(WORLD.size - 80, sx));
    sy = Math.max(80, Math.min(WORLD.size - 80, sy));
    if (!state.city.isRoadAt(sx, sy)) continue;
    const car = makeCar(state.rng, 'police', sx, sy, heading, 'police');
    car.speed = 300;
    state.cars.push(car);
    added += 1;
  }
}
