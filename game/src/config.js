// Verde Bay — an original sun-soaked coastal city, and every tuning number in
// one place. The game is a top-down open-world crime game: the playfield is a
// fixed 1280x720 logical area, the renderer scales it to the window, and the
// world is a 3840x3840 city the camera follows. No rule below depends on the
// screen size. Nothing here names a real place, person or commercial game.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The city: a 60x60 grid of 64 px tiles (3840x3840 world units). */
export const WORLD = { tiles: 60, tile: 64, size: 3840 };

/** Grid cell kinds (see city.js). */
export const CELL = { BUILDING: 0, ROAD: 1, SIDEWALK: 2, PARK: 3, WATER: 4, BEACH: 5 };

/** Named places every system agrees on. city.js puts each on the map and
 * missions.js refers to them by key; world.js resolves the coordinates. */
export const LANDMARKS = [
  'hideout', 'garage', 'bank', 'docks', 'paintShop', 'hospital',
  'park', 'stadium', 'warehouse', 'mansion', 'casino', 'marina',
];

export const PLAYER = {
  radius: 14,
  walkSpeed: 195,
  runSpeed: 305,
  health: 100,
  punchDamage: 34,
  punchRange: 34,
  punchCooldown: 0.38,
  shotDamage: 25,
  shotCooldown: 0.22,
  shotRange: 520,
  startAmmo: 24,
  maxAmmo: 120,
  invulnerable: 1.0,
};

/** Car classes: the city spawns sedans, taxis, trucks and sports cars. */
export const CAR_CLASS = {
  sedan: { length: 64, width: 32, accel: 420, maxSpeed: 430, reverse: 160, grip: 3.4, health: 100 },
  taxi: { length: 64, width: 32, accel: 400, maxSpeed: 410, reverse: 160, grip: 3.4, health: 100 },
  truck: { length: 84, width: 36, accel: 300, maxSpeed: 330, reverse: 130, grip: 2.8, health: 160 },
  sport: { length: 62, width: 30, accel: 560, maxSpeed: 560, reverse: 190, grip: 4.2, health: 80 },
  police: { length: 66, width: 32, accel: 500, maxSpeed: 520, reverse: 180, grip: 4.0, health: 120 },
  rival: { length: 64, width: 32, accel: 470, maxSpeed: 480, reverse: 170, grip: 3.8, health: 90 },
};

export const TRAFFIC = { cars: 26, peds: 34, despawn: 1400, spawn: 1100 };

export const WANTED = {
  max: 5,
  decayDelay: 6, // seconds out of police sight before the level starts to fall
  decayPerSecond: 0.25, // stars per second once decaying
  policeCars: [0, 1, 2, 3, 4, 6], // active police cars per star level
  policeFoot: [0, 0, 1, 2, 3, 4], // foot officers per star level
  copSpeed: 205,
  copArrestRange: 26,
  copArrestTime: 0.9, // seconds of contact to get busted on foot
  ramDamage: 6,
};

export const ECONOMY = {
  startCash: 150,
  paintCost: 100, // respray clears the wanted level
  hospitalCost: 80,
  ammoCost: 40, // per 24 bullets at the gun shop (ammo pickup)
  missionReward: [400, 600, 800, 1000, 1200, 1600, 2000, 3000],
  cashPickup: 50,
};

export const MISSION_COUNT = 8;

/** Controls. Mouse aims the pistol; click shoots. */
export const CONTROLS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  enterCar: ['KeyE'],
  punch: ['KeyF'],
  shoot: ['Space'],
  handbrake: ['Space'],
  horn: ['KeyH'],
  pause: ['KeyP', 'Escape'],
  restart: ['KeyR'],
  mute: ['KeyM'],
  confirm: ['Enter', 'Space'],
};

export const PALETTE = {
  sky: '#f7c873', // golden-hour backdrop behind the canvas
  water: '#2fa8a0',
  waterDeep: '#1f7f86',
  beach: '#e8d39a',
  sand: '#d9c184',
  asphalt: '#4a4a52',
  asphaltDark: '#3c3c44',
  roadLine: '#e8e3c8',
  sidewalk: '#b9b3a4',
  park: '#5da85c',
  parkDark: '#4c8f4b',
  building: '#c98f5f',
  building2: '#b0788a',
  building3: '#7fa3b8',
  building4: '#d9a441',
  roof: '#8a5a44',
  tree: '#3f7d3a',
  treeDark: '#356b31',
  player: '#2f6fed',
  playerShirt: '#ffd23f',
  ped: '#e8e0d0',
  police: '#1c2733',
  policeLight: '#ff3b30',
  rival: '#7a1f1f',
  taxi: '#f2c200',
  hud: '#10141a',
  text: '#f2f0e8',
  muted: '#9aa0a8',
  star: '#ffd23f',
  marker: '#ff5a3c',
  health: '#3ddc6a',
  ammo: '#ffd23f',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save lives between visits (this browser only). */
export const SAVE_KEY = 'verde-bay.save.v1';
export const BEST_KEY = 'verde-bay.best.v1';

/** The city, the crew and the job. All names are invented for this game. */
export const STORY = {
  city: 'Verde Bay',
  hero: 'Deke Rook',
  heroTitle: 'getaway driver',
  fixer: 'Marisol Vega',
  fixerTitle: 'fixer at the Coral Garage',
  crew: 'the Kestrels',
  intro: 'Deke Rook came back to Verde Bay with a busted car, an empty wallet and one rule: never work for free. Marisol Vega has eight jobs. Do them clean, and the Bay is yours.',
};
