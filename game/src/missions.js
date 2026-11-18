// Verde Bay — missions.
// One story arc in eight jobs: Marisol Vega hires Deke Rook, the work gets
// hotter, the Kestrels start hitting back, and it all ends in a final heist
// at the docks. Every name, place and line here is original to this game.
//
// THE ARC
//   1. First Keys      — tutorial: steal a car, drive it to the garage.
//   2. The Coral Run   — first real job: pick up a package, deliver it.
//   3. Kestrel Trouble — the rival crew appears: wreck 3 of their cars.
//   4. High Roller     — a casino cash case, moved quietly to the hideout.
//   5. Hot Wheels      — payback at the marina, then a respray to cool off.
//   6. Heat Wave       — first real police heat: fight, survive, escape.
//   7. The Long Way Home — the ledger is stolen; take it back under a
//                          three-star manhunt and lose the cops.
//   8. The Docks Job   — the finale: grab the Kestrels' whole shipment,
//                          survive the storm they send, lose the cops,
//                          and escape to the docks. After tonight, the
//                          Bay belongs to Deke.
//
// DIFFICULTY
//   Rewards climb with ECONOMY.missionReward (400 → 3000). Early missions
//   are 2-3 objectives with no wanted level; from mission 6 on, every job
//   ends with police heat that must be survived and then shaken off.
//   Rival-car counts rise 3 → 4, survive timers rise 20s → 25s, and the
//   wanted floor rises from 2 stars to 3.
//
// OBJECTIVE TYPES (exactly the ones world.js implements — no others)
//   goto    { landmark, radius, text }   — reach the marker, on foot or in a car.
//   steal   { text }                     — get into any car (steal it).
//   drive   { landmark, radius, text }   — arrive at the marker while driving.
//   pickup  { landmark, radius, text }   — collect the package at the marker.
//   deliver { landmark, radius, text }   — arrive at the marker carrying it.
//   destroy { count, kind:'rival', text }— destroy N rival cars (world.js
//                                          spawns them; ram or shoot them).
//   survive { seconds, wanted, text }    — survive N seconds while wanted
//                                          is at least `wanted` stars.
//   escape  { text }                     — bring the wanted level down to 0.
//   fight   { count, text }              — defeat N foot enemies (world.js
//                                          spawns thugs who chase the player).
//
// RULES FOLLOWED HERE
//   - Every mission has 2-4 objectives, in play order.
//   - Every `landmark` is one of the LANDMARKS names in config.js.
//   - Every `radius` is 60-90.
//   - Every objective `text` is the short HUD line for that step
//     (under ~60 characters).
//   - Every `reward` is taken from ECONOMY.missionReward, in order,
//     so tuning the economy in config.js retunes every payout at once.
//   - Givers are 'Marisol Vega' throughout: she is the fixer, and the
//     whole arc is her hiring Deke — no other giver is needed for
//     these eight jobs, though the contract allows others.
//
// STORY_TEXT is the copy for the title screen (intro), the final victory
// screen (win) and the busted/wasted screen (lose). Each is 1-2 sentences.
// MISSION_TITLES is the plain list of the eight titles, in order, for
// the HUD and the mission list screen.

import { ECONOMY } from './config.js';

export const STORY_TEXT = {
  intro:
    'Deke Rook came back to Verde Bay with a busted car, an empty wallet and one rule: never work for free. ' +
    'Marisol Vega has eight jobs — do them clean, and the Bay is yours.',
  win:
    'The last Kestrel car burns out on the pier and the docks go quiet. ' +
    'Deke Rook drives off into the Verde Bay sunrise — the best wheelman in the city, and finally paid.',
  lose:
    'The cops close in and the engine dies. Deke Rook is busted — but in Verde Bay, ' +
    'a driver with Marisol Vega on his side always gets one more run.',
};

const R = ECONOMY.missionReward;

export const MISSIONS = [
  {
    id: 1,
    title: 'First Keys',
    giver: 'Marisol Vega',
    brief:
      'Marisol needs a wheelman she can trust, and trust starts with a test. ' +
      'Lift a car off the street and bring it to the Coral Garage — no scratches, no cops.',
    reward: R[0],
    objectives: [
      { type: 'steal', text: 'Steal a car (walk up and press E)' },
      { type: 'drive', landmark: 'garage', radius: 75, text: 'Drive it to the Coral Garage' },
    ],
  },
  {
    id: 2,
    title: 'The Coral Run',
    giver: 'Marisol Vega',
    brief:
      'A client left a package stashed by the old warehouse and Marisol wants it moved quietly. ' +
      'Pick it up and bring it home to the garage — slow is smooth, smooth is fast.',
    reward: R[1],
    objectives: [
      { type: 'goto', landmark: 'warehouse', radius: 80, text: 'Head to the warehouse' },
      { type: 'pickup', landmark: 'warehouse', radius: 80, text: 'Pick up the package' },
      { type: 'deliver', landmark: 'garage', radius: 75, text: 'Deliver it to the Coral Garage' },
    ],
  },
  {
    id: 3,
    title: 'Kestrel Trouble',
    giver: 'Marisol Vega',
    brief:
      'The Kestrels have been leaning on Marisol’s clients around the stadium. ' +
      'Go show them the Coral Garage doesn’t scare easy — then bring the car back in one piece.',
    reward: R[2],
    objectives: [
      { type: 'goto', landmark: 'stadium', radius: 85, text: 'Get to the stadium' },
      { type: 'destroy', count: 3, kind: 'rival', text: 'Wreck 3 Kestrel cars' },
      { type: 'drive', landmark: 'garage', radius: 75, text: 'Drive back to the Coral Garage' },
    ],
  },
  {
    id: 4,
    title: 'High Roller',
    giver: 'Marisol Vega',
    brief:
      'A high roller at the casino owes Marisol a favour, and the favour is a heavy case of cash. ' +
      'Collect it, keep your head down, and stash it at the hideout before anyone notices it’s gone.',
    reward: R[3],
    objectives: [
      { type: 'steal', text: 'Steal a fast car for the job' },
      { type: 'pickup', landmark: 'casino', radius: 80, text: 'Pick up the case at the casino' },
      { type: 'deliver', landmark: 'hideout', radius: 80, text: 'Deliver the case to the hideout' },
    ],
  },
  {
    id: 5,
    title: 'Hot Wheels',
    giver: 'Marisol Vega',
    brief:
      'The Kestrels torched one of Marisol’s tow trucks down by the marina, and payback is due. ' +
      'Wreck their cars, then get yours resprayed at the paint shop before the cops learn your plates.',
    reward: R[4],
    objectives: [
      { type: 'goto', landmark: 'marina', radius: 85, text: 'Get down to the marina' },
      { type: 'destroy', count: 4, kind: 'rival', text: 'Wreck 4 Kestrel cars' },
      { type: 'drive', landmark: 'paintShop', radius: 70, text: 'Reach the paint shop for a respray' },
    ],
  },
  {
    id: 6,
    title: 'Heat Wave',
    giver: 'Marisol Vega',
    brief:
      'A pickup at the park went loud — the Kestrels brought friends, and the friends brought the cops. ' +
      'Fight your way clear, ride out the heat, then vanish before the net closes.',
    reward: R[5],
    objectives: [
      { type: 'goto', landmark: 'park', radius: 85, text: 'Get to the park pickup' },
      { type: 'fight', count: 4, text: 'Fight off 4 Kestrel thugs' },
      { type: 'survive', seconds: 20, wanted: 2, text: 'Survive the heat for 20 seconds' },
      { type: 'escape', text: 'Lose the cops — get wanted down to 0' },
    ],
  },
  {
    id: 7,
    title: 'The Long Way Home',
    giver: 'Marisol Vega',
    brief:
      'The Kestrels hit the warehouse and took Marisol’s ledger — every name, every debt, everything. ' +
      'Take it back, run the gauntlet to the garage, and don’t let the cops or the Kestrels stop you.',
    reward: R[6],
    objectives: [
      { type: 'pickup', landmark: 'warehouse', radius: 80, text: 'Grab the ledger at the warehouse' },
      { type: 'deliver', landmark: 'garage', radius: 75, text: 'Deliver the ledger to the garage' },
      { type: 'survive', seconds: 25, wanted: 3, text: 'Survive the manhunt for 25 seconds' },
      { type: 'escape', text: 'Lose the cops — get wanted down to 0' },
    ],
  },
  {
    id: 8,
    title: 'The Docks Job',
    giver: 'Marisol Vega',
    brief:
      'One last job, and the biggest: the Kestrels’ whole shipment is sitting at the warehouse, ' +
      'unguarded for one hour only. Grab it, ride out the storm they send after you, ' +
      'lose the cops, and bring it all home to the docks. After tonight, Verde Bay is yours.',
    reward: R[7],
    objectives: [
      { type: 'pickup', landmark: 'warehouse', radius: 80, text: 'Grab the shipment at the warehouse' },
      { type: 'survive', seconds: 20, wanted: 3, text: 'Survive the Kestrel storm for 20 seconds' },
      { type: 'escape', text: 'Lose the cops — get wanted down to 0' },
      { type: 'drive', landmark: 'docks', radius: 90, text: 'Escape to the docks — finish the job' },
    ],
  },
];

export const MISSION_TITLES = MISSIONS.map((m) => m.title);
