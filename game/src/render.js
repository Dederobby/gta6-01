// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x720 playfield is scaled to fit the window and centred, the margin
// filled with the golden-hour backdrop. Flat shapes and canvas text for the
// HUD, the minimap and the panels.

import { CAR_CLASS, CELL, FIELD, FONT, PALETTE, PLAYER, WORLD } from './config.js';
import { currentObjective } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const PANEL = { width: 640, top: 110, line: 32, bottom: 64 };
const MINIMAP = { x: FIELD.width - 240, y: 16, w: 224, h: 168 };

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCar(ctx, car, time) {
  const spec = CAR_CLASS[car.kind];
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  roundRect(ctx, -spec.length / 2 + 3, -spec.width / 2 + 4, spec.length, spec.width, 8);
  ctx.fill();
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -spec.length / 2, -spec.width / 2, spec.length, spec.width, 8);
  ctx.fill();
  // Roof and windshield.
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  roundRect(ctx, -spec.length / 6, -spec.width / 2 + 4, spec.length / 3, spec.width - 8, 5);
  ctx.fill();
  ctx.fillStyle = '#20242e';
  roundRect(ctx, spec.length / 2 - 14, -spec.width / 2 + 4, 8, spec.width - 8, 3);
  ctx.fill();
  // Headlights and taillights.
  ctx.fillStyle = '#fff6c8';
  ctx.fillRect(spec.length / 2 - 2, -spec.width / 2 + 3, 3, 5);
  ctx.fillRect(spec.length / 2 - 2, spec.width / 2 - 8, 3, 5);
  ctx.fillStyle = '#ff3b30';
  ctx.fillRect(-spec.length / 2 - 1, -spec.width / 2 + 3, 3, 5);
  ctx.fillRect(-spec.length / 2 - 1, spec.width / 2 - 8, 3, 5);
  if (car.kind === 'taxi') {
    ctx.fillStyle = '#1c2733';
    ctx.font = 'bold 9px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 3);
  }
  if (car.kind === 'muscle') {
    // Hood scoop: the muscle car's tell.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, spec.length / 2 - 26, -5, 14, 10, 3);
    ctx.fill();
  }
  if (car.kind === 'police') {
    // Flashing light bar.
    const phase = Math.floor(time * 3) % 2 === 0;
    ctx.fillStyle = phase ? '#ff3b30' : '#2f6fed';
    roundRect(ctx, -6, -spec.width / 2 - 3, 12, 7, 3);
    ctx.fill();
    ctx.fillStyle = phase ? '#2f6fed' : '#ff3b30';
    roundRect(ctx, -6, spec.width / 2 - 4, 12, 7, 3);
    ctx.fill();
    ctx.fillStyle = '#f2f0e8';
    ctx.font = 'bold 9px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('POLICE', 0, 3);
  }
  if (car.kind === 'truck') {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(-spec.length / 2 + 6, -spec.width / 2 + 4, spec.length / 2 - 10, spec.width - 8);
  }
  // Damage smoke.
  if (car.health < car.maxHealth * 0.45) {
    ctx.fillStyle = 'rgba(60,60,68,0.5)';
    ctx.beginPath();
    ctx.arc(-spec.length / 4, 0, 6 + Math.sin(time * 9) * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // Health bar over a hurt car the player is fighting.
  if (car.health < car.maxHealth && (car.driver === 'rival' || car.driver === 'police')) {
    const w = 44;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(car.x - w / 2, car.y - 34, w, 5);
    ctx.fillStyle = car.health > car.maxHealth * 0.5 ? PALETTE.health : '#ff5a3c';
    ctx.fillRect(car.x - w / 2, car.y - 34, w * (car.health / car.maxHealth), 5);
  }
}

function drawPed(ctx, ped, time) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(1, 2, 11, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.shirt;
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  if (ped.cop) {
    ctx.fillStyle = '#2f6fed';
    ctx.beginPath();
    ctx.arc(0, -1, 6, Math.PI, 0);
    ctx.fill();
  }
  if (ped.hostile) {
    ctx.strokeStyle = '#ff3b30';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPlayer(ctx, player, time) {
  if (player.car) return; // the car drawing carries the player
  ctx.save();
  ctx.translate(player.x, player.y);
  if (player.invuln > 0 && Math.floor(time * 12) % 2 === 0) ctx.globalAlpha = 0.45;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(2, 3, 13, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(player.angle);
  ctx.fillStyle = PALETTE.playerShirt;
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.player;
  ctx.beginPath();
  ctx.arc(4, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  // Pistol barrel toward the aim.
  ctx.rotate(player.aimAngle - player.angle);
  ctx.strokeStyle = '#1c2733';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(20, 0);
  ctx.stroke();
  ctx.restore();
}

function drawMarker(ctx, x, y, time, color) {
  const pulse = 1 + Math.sin(time * 4) * 0.15;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, 26 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  // A beam so the marker reads from far away.
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 90);
  ctx.lineTo(x, y - 26);
  ctx.stroke();
  ctx.restore();
}

/** The shops the player can use, as minimap dots: paint (green), hospital
 * (white cross) and gun shop (yellow). Landmarks come from the city so the
 * dots can never drift from the world. */
const SHOP_DOTS = [
  { name: 'paintShop', color: PALETTE.health },
  { name: 'hospital', color: '#ffffff' },
  { name: 'gunShop', color: PALETTE.ammo },
];

function drawMinimap(ctx, state, world) {
  const m = MINIMAP;
  ctx.save();
  ctx.fillStyle = 'rgba(16,20,26,0.85)';
  roundRect(ctx, m.x - 6, m.y - 6, m.w + 12, m.h + 12, 8);
  ctx.fill();
  state.city.drawMinimapBase(ctx, m.x, m.y, m.w, m.h);
  const sx = m.w / WORLD.size;
  const sy = m.h / WORLD.size;
  const dot = (x, y, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(m.x + x * sx, m.y + y * sy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const shop of SHOP_DOTS) {
    const lm = state.city.landmarks[shop.name];
    if (lm) dot(lm.x, lm.y, shop.color, 2.5);
  }
  for (const car of state.cars) {
    if (car.dead) continue;
    if (car.driver === 'police') dot(car.x, car.y, '#ff3b30', 3);
    else if (car.driver === 'rival') dot(car.x, car.y, '#ff9a3c', 2.5);
  }
  const obj = currentObjective(world);
  if (obj && obj.x !== undefined) dot(obj.x, obj.y, PALETTE.marker, 4);
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  ctx.save();
  ctx.translate(m.x + px * sx, m.y + py * sy);
  ctx.rotate(p.car ? p.car.angle : p.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4, -4);
  ctx.lineTo(-4, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

function drawHud(ctx, state, world) {
  const p = state.player;
  ctx.textBaseline = 'alphabetic';
  // Wanted stars, top centre.
  ctx.font = 'bold 26px ' + FONT;
  ctx.textAlign = 'center';
  let stars = '';
  for (let i = 0; i < 5; i += 1) stars += i < state.wantedStars ? '★' : '☆';
  ctx.fillStyle = 'rgba(16,20,26,0.7)';
  roundRect(ctx, FIELD.width / 2 - 95, 10, 190, 38, 8);
  ctx.fill();
  ctx.fillStyle = PALETTE.star;
  ctx.fillText(stars, FIELD.width / 2, 38);
  // Mission panel, top left.
  const obj = currentObjective(world);
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(16,20,26,0.75)';
  roundRect(ctx, 16, 16, 330, obj ? 64 : 40, 8);
  ctx.fill();
  ctx.fillStyle = PALETTE.star;
  ctx.font = 'bold 15px ' + FONT;
  if (obj) {
    ctx.fillText(`${obj.index}. ${obj.title}`, 28, 38);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '14px ' + FONT;
    let line = obj.text;
    if (obj.count) line += `  (${obj.count})`;
    ctx.fillText(line, 28, 60);
    if (obj.x !== undefined) {
      const px = p.car ? p.car.x : p.x;
      const py = p.car ? p.car.y : p.y;
      ctx.fillStyle = PALETTE.muted;
      ctx.fillText(`${Math.round(Math.hypot(obj.x - px, obj.y - py))}m`, 28, 78);
    }
  } else if (state.won) {
    ctx.fillText('All jobs done — free roam!', 28, 38);
  } else {
    ctx.fillText('Free roam', 28, 38);
  }
  // Cash, health, ammo, bottom left.
  ctx.fillStyle = 'rgba(16,20,26,0.75)';
  roundRect(ctx, 16, FIELD.height - 64, 250, 48, 8);
  ctx.fill();
  ctx.fillStyle = PALETTE.star;
  ctx.font = 'bold 18px ' + FONT;
  ctx.fillText(`$${state.cash}`, 28, FIELD.height - 34);
  ctx.fillStyle = PALETTE.health;
  ctx.fillRect(120, FIELD.height - 48, 110 * (p.health / PLAYER.health), 10);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.strokeRect(120, FIELD.height - 48, 110, 10);
  ctx.fillStyle = PALETTE.text;
  ctx.font = '13px ' + FONT;
  ctx.fillText(`HP ${Math.ceil(p.health)}`, 120, FIELD.height - 52 + 26);
  ctx.fillStyle = PALETTE.ammo;
  ctx.fillText(`AMMO ${p.ammo}`, 28, FIELD.height - 52 + 26);
  // Speed, bottom right (when driving).
  if (p.car) {
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(16,20,26,0.75)';
    roundRect(ctx, FIELD.width - 150, FIELD.height - 64, 134, 48, 8);
    ctx.fill();
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 22px ' + FONT;
    ctx.fillText(`${Math.round(Math.abs(p.car.speed) * 0.22)} km/h`, FIELD.width - 28, FIELD.height - 32);
    ctx.textAlign = 'left';
  }
  // Controls hint, bottom centre.
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(16,20,26,0.55)';
  ctx.font = '12px ' + FONT;
  ctx.fillText('WASD drive / move · E car · Space shoot / brake · F punch · H horn · P pause · M mute', FIELD.width / 2, FIELD.height - 8);
  ctx.textAlign = 'left';
}

function drawPanel(ctx, lines, prompt) {
  const width = PANEL.width;
  const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
  const x = (FIELD.width - width) / 2;
  const y = (FIELD.height - height) / 2;
  ctx.fillStyle = 'rgba(12,16,22,0.88)';
  roundRect(ctx, x, y, width, height, 12);
  ctx.fill();
  ctx.strokeStyle = PALETTE.star;
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, width, height, 12);
  ctx.stroke();
  ctx.textAlign = 'center';
  let cy = y + 52;
  for (const line of lines) {
    ctx.fillStyle = line.color || PALETTE.text;
    ctx.font = line.big ? 'bold 34px ' + FONT : line.small ? '14px ' + FONT : 'bold 18px ' + FONT;
    ctx.fillText(line.text, FIELD.width / 2, cy);
    cy += line.big ? 48 : line.small ? 24 : PANEL.line;
  }
  if (prompt) {
    ctx.fillStyle = PALETTE.star;
    ctx.font = 'bold 16px ' + FONT;
    ctx.fillText(prompt, FIELD.width / 2, y + height - 26);
  }
  ctx.textAlign = 'left';
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    offsetX = (canvas.width - FIELD.width * scale) / 2;
    offsetY = (canvas.height - FIELD.height * scale) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  function drawWorld(state, world, time) {
    const cam = state.camera;
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    ctx.save();
    ctx.translate(offsetX - (cam.x + shakeX) * scale, offsetY - (cam.y + shakeY) * scale);
    ctx.scale(scale, scale);
    const view = { x: cam.x - 40, y: cam.y - 40, w: FIELD.width + 80, h: FIELD.height + 80 };
    state.city.drawGround(ctx, view);
    // Mission marker under everything moving.
    const obj = currentObjective(world);
    if (obj && obj.x !== undefined) drawMarker(ctx, obj.x, obj.y, time, PALETTE.marker);
    if (state.mission && state.mission.data.pkg && !state.package) {
      const pkg = state.mission.data.pkg;
      drawMarker(ctx, pkg.x, pkg.y, time, PALETTE.star);
    }
    for (const pk of state.pickups) {
      const bob = Math.sin(pk.t * 3) * 3;
      ctx.fillStyle = pk.kind === 'cash' ? PALETTE.star : pk.kind === 'ammo' ? '#ffd23f' : PALETTE.health;
      ctx.beginPath();
      ctx.arc(pk.x, pk.y + bob, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1c2733';
      ctx.font = 'bold 11px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(pk.kind === 'cash' ? '$' : pk.kind === 'ammo' ? 'A' : '+', pk.x, pk.y + bob + 4);
      ctx.textAlign = 'left';
    }
    for (const car of state.cars) {
      if (!car.dead) drawCar(ctx, car, time);
    }
    for (const ped of state.peds) {
      if (!ped.dead) drawPed(ctx, ped, time);
    }
    drawPlayer(ctx, state.player, time);
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 15px ' + FONT;
    ctx.textAlign = 'center';
    for (const f of state.floats) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.restore();
    // Off-screen mission arrow.
    if (obj && obj.x !== undefined) {
      const p = state.player;
      const px = p.car ? p.car.x : p.x;
      const py = p.car ? p.car.y : p.y;
      const sx = offsetX + (obj.x - cam.x) * scale;
      const sy = offsetY + (obj.y - cam.y) * scale;
      if (sx < 60 || sx > canvas.width - 60 || sy < 60 || sy > canvas.height - 60) {
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const a = Math.atan2(sy - cy, sx - cx);
        const ax = cx + Math.cos(a) * 300;
        const ay = cy + Math.sin(a) * 200;
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(a);
        ctx.fillStyle = PALETTE.marker;
        ctx.beginPath();
        ctx.moveTo(18, 0);
        ctx.lineTo(-10, -10);
        ctx.lineTo(-10, 10);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  }

  /** Full-screen feedback, drawn in screen space after the world: a red
   * vignette that deepens as health falls, and a pulsing red frame while
   * the wanted level is 3 stars or higher. */
  function drawDanger(state, time) {
    const p = state.player;
    // Screen space, not world space: the HUD transform is still applied.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const lowHp = 1 - p.health / PLAYER.health;
    if (lowHp > 0.25) {
      const alpha = (lowHp - 0.25) * 0.5 * (0.7 + 0.3 * Math.sin(time * 5));
      const grad = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) * 0.35,
        canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.72,
      );
      grad.addColorStop(0, 'rgba(255,30,20,0)');
      grad.addColorStop(1, `rgba(255,30,20,${alpha.toFixed(3)})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (state.wantedStars >= 3) {
      const pulse = 0.25 + 0.2 * Math.sin(time * 6);
      ctx.strokeStyle = `rgba(255,59,48,${pulse.toFixed(3)})`;
      ctx.lineWidth = 10;
      ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
    }
  }

  return {
    draw(state, world, screen, best, save) {
      const time = state.time;
      // Backdrop.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = PALETTE.sky;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (screen === SCREEN_TITLE) {
        // A live city drifts behind the title panel.
        drawWorld(state, world, time);
        ctx.fillStyle = 'rgba(20,16,10,0.45)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
        const lines = [
          { text: 'VERDE BAY', big: true, color: PALETTE.star },
          { text: 'An open-world crime game', color: PALETTE.text },
          { text: 'Deke Rook is back in town. Marisol Vega has eight jobs.', small: true, color: PALETTE.muted },
          { text: 'Steal cars · Outrun the police · Run the missions', small: true, color: PALETTE.muted },
          { text: 'WASD move/drive · E car · Space shoot/brake · F punch · P pause', small: true, color: PALETTE.muted },
        ];
        if (save) lines.push({ text: `Save found — Mission ${Math.min(save.missionIndex + 1, 8)} · $${save.cash}`, small: true, color: PALETTE.health });
        if (best > 0) lines.push({ text: `Best score ${best}`, small: true, color: PALETTE.muted });
        drawPanel(ctx, lines, save ? 'ENTER start new game · C continue' : 'Press ENTER or click to start');
        return;
      }
      drawWorld(state, world, time);
      ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
      if (screen === SCREEN_PLAY) {
        drawHud(ctx, state, world);
        drawMinimap(ctx, state, world);
        drawDanger(state, time);
        return;
      }
      if (screen === SCREEN_PAUSED) {
        drawHud(ctx, state, world);
        drawMinimap(ctx, state, world);
        drawPanel(ctx, [
          { text: 'PAUSED', big: true, color: PALETTE.star },
          { text: 'Take a breath. The Bay waits.', small: true, color: PALETTE.muted },
        ], 'P resume · R restart');
        return;
      }
      if (screen === SCREEN_WIN) {
        drawPanel(ctx, [
          { text: 'THE BAY IS YOURS', big: true, color: PALETTE.star },
          { text: 'All eight jobs done. Marisol pays out, the Kestrels scatter,', small: true, color: PALETTE.text },
          { text: 'and Deke Rook drives off into the sunset — in a stolen car, obviously.', small: true, color: PALETTE.text },
          { text: `Score ${state.score} · Cash $${state.cash}`, color: PALETTE.star },
        ], 'ENTER free roam · R play again');
        return;
      }
      // SCREEN_OVER: busted or wasted.
      const busted = state.overReason === 'busted';
      drawPanel(ctx, [
        { text: busted ? 'BUSTED' : 'WASTED', big: true, color: '#ff5a3c' },
        { text: busted
          ? 'The Verde Bay police finally caught up with you.'
          : 'You woke up at St. Aurelia Hospital, lighter by some cash.',
          small: true, color: PALETTE.text },
        { text: `Missions done ${state.missionIndex} / 8 · Cash $${state.cash} · Score ${state.score}`, small: true, color: PALETTE.muted },
      ], 'ENTER get back out there');
    },
  };
}
