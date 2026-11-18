// Verde Bay — the city itself: a deterministic 60x60 tile grid (3840x3840 px)
// of roads, sidewalks, building blocks, parks and a southern waterfront.
// Everything is generated from the seeded rng passed to createCity, so the
// same seed always builds the same city. No imports beyond config/random,
// no network, no external assets. All names are original to this game.

import { WORLD, CELL, LANDMARKS, PALETTE } from './config.js';

const { tiles, tile, size } = WORLD;

// Block layout: roads are 1 tile wide every 7 tiles (tx%7===6 or ty%7===6).
// The tiles between roads form 6x6 blocks; the outer ring of each block is
// sidewalk and the 4x4 interior holds buildings or park.
const ROAD_EVERY = 7;
const WATER_ROW = 57; // ty >= 57 is open water
const BEACH_ROW = 56; // one beach strip between the beachfront road and the sea

const BUILDING_COLORS = [PALETTE.building, PALETTE.building2, PALETTE.building3, PALETTE.building4];
const ROOF_COLORS = [PALETTE.roof, '#6b4a3a', '#a0714f', '#7a6a58'];
const WAREHOUSE_COLORS = ['#9aa0a8', '#8d9299', '#a8a49a'];

// Special blocks, keyed "bx,by". Parks have trees and no buildings; the
// stadium is one big structure; the east edge is warehouses; downtown
// (centre-north) gets taller, denser buildings.
const PARK_BLOCKS = new Set(['1,4', '6,1', '4,6']);
const STADIUM_BLOCK = '7,4';
const MANSION_BLOCK = '0,0';

function blockKey(bx, by) {
  return `${bx},${by}`;
}

function isDowntown(bx, by) {
  return bx >= 3 && bx <= 5 && by >= 0 && by <= 2;
}

function isIndustrial(bx, by) {
  return bx >= 7 && by <= 3;
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Tiny stable hash of two numbers, used for per-building window patterns so
// drawing never needs the rng.
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function createCity(rng) {
  const grid = new Uint8Array(tiles * tiles);
  const buildings = [];
  const trees = [];
  const piers = [];

  // ---- grid: water / beach / roads / sidewalks / block interiors ----
  for (let ty = 0; ty < tiles; ty += 1) {
    for (let tx = 0; tx < tiles; tx += 1) {
      let cell;
      if (ty >= WATER_ROW) {
        cell = CELL.WATER;
      } else if (ty === BEACH_ROW) {
        cell = CELL.BEACH;
      } else if (tx % ROAD_EVERY === ROAD_EVERY - 1 || ty % ROAD_EVERY === ROAD_EVERY - 1) {
        cell = CELL.ROAD;
      } else {
        const bx = Math.floor(tx / ROAD_EVERY);
        const by = Math.floor(ty / ROAD_EVERY);
        const inRing = tx % ROAD_EVERY === 0 || tx % ROAD_EVERY === ROAD_EVERY - 2
          || ty % ROAD_EVERY === 0 || ty % ROAD_EVERY === ROAD_EVERY - 2;
        if (inRing) {
          cell = CELL.SIDEWALK;
        } else if (PARK_BLOCKS.has(blockKey(bx, by))) {
          cell = CELL.PARK;
        } else {
          cell = CELL.BUILDING;
        }
      }
      grid[ty * tiles + tx] = cell;
    }
  }

  // ---- buildings: rects inside block interiors, never on roads ----
  // Block interiors span tiles bx*7+1 .. bx*7+4 (4x4 tiles = 256x256 px).
  for (let by = 0; by < 8; by += 1) {
    for (let bx = 0; bx < 9; bx += 1) {
      const key = blockKey(bx, by);
      if (PARK_BLOCKS.has(key)) continue;
      const ix = (bx * ROAD_EVERY + 1) * tile;
      const iy = (by * ROAD_EVERY + 1) * tile;
      // The east edge column (bx 8) is only 3 interior tiles wide.
      const inner = (bx === 8 ? 3 : 4) * tile;

      if (key === STADIUM_BLOCK) {
        buildings.push({
          x: ix + 12, y: iy + 12, w: inner - 24, h: inner - 24,
          color: '#c9c2b4', roof: '#7fa3b8', height: 2, stadium: true,
        });
        continue;
      }
      if (key === MANSION_BLOCK) {
        buildings.push({
          x: ix + 48, y: iy + 40, w: 150, h: 120,
          color: PALETTE.building4, roof: PALETTE.roof, height: 2,
        });
        continue;
      }
      if (isIndustrial(bx, by)) {
        const count = rng() < 0.5 ? 1 : 2;
        for (let i = 0; i < count; i += 1) {
          const w = count === 1 ? inner - 32 : inner / 2 - 20;
          const h = inner - 48 - rng() * 40;
          buildings.push({
            x: ix + 16 + i * (inner / 2), y: iy + 20 + rng() * 16,
            w, h, color: pick(rng, WAREHOUSE_COLORS), roof: '#6e7278',
            height: 1, warehouse: true,
          });
        }
        continue;
      }
      if (isDowntown(bx, by)) {
        // Denser downtown: a 2x2 cluster of taller towers.
        for (let gy = 0; gy < 2; gy += 1) {
          for (let gx = 0; gx < 2; gx += 1) {
            const w = 96 + rng() * 24;
            const h = 96 + rng() * 24;
            buildings.push({
              x: ix + 8 + gx * 128 + rng() * 8, y: iy + 8 + gy * 128 + rng() * 8,
              w, h, color: pick(rng, BUILDING_COLORS), roof: pick(rng, ROOF_COLORS),
              height: 3 + Math.floor(rng() * 4), // 3-6 storeys
            });
          }
        }
        continue;
      }
      // Ordinary blocks: one or two low buildings, kept inside the interior.
      const count = rng() < 0.6 ? 1 : 2;
      for (let i = 0; i < count; i += 1) {
        const slot = inner / count;
        const w = count === 1 ? Math.min(150 + rng() * 70, inner - 24) : Math.min(100 + rng() * 30, slot - 24);
        const h = count === 1 ? Math.min(140 + rng() * 70, inner - 24) : Math.min(100 + rng() * 30, inner - 24);
        buildings.push({
          x: ix + 12 + i * slot,
          y: iy + 12 + rng() * 20,
          w, h, color: pick(rng, BUILDING_COLORS), roof: pick(rng, ROOF_COLORS),
          height: 1 + Math.floor(rng() * 3), // 1-3 storeys
        });
      }
    }
  }

  // ---- trees: in parks, plus a few along sidewalks ----
  for (const key of PARK_BLOCKS) {
    const [bx, by] = key.split(',').map(Number);
    const count = 10 + Math.floor(rng() * 5);
    for (let i = 0; i < count; i += 1) {
      trees.push({
        x: (bx * ROAD_EVERY + 1) * tile + 16 + rng() * (4 * tile - 32),
        y: (by * ROAD_EVERY + 1) * tile + 16 + rng() * (4 * tile - 32),
        r: 10 + rng() * 7,
      });
    }
  }
  // Mansion grounds get a small grove too.
  for (let i = 0; i < 6; i += 1) {
    trees.push({
      x: tile + 16 + rng() * (4 * tile - 32),
      y: tile + 16 + rng() * (4 * tile - 32),
      r: 10 + rng() * 6,
    });
  }
  // Sidewalk trees: scattered along block outer rings.
  for (let i = 0; i < 42; i += 1) {
    const bx = Math.floor(rng() * 8); // bx 8 is the narrow edge strip; skip it
    const by = Math.floor(rng() * 8);
    if (PARK_BLOCKS.has(blockKey(bx, by))) continue;
    const edge = Math.floor(rng() * 4);
    const along = rng() * 6 * tile;
    let x;
    let y;
    if (edge === 0) { x = bx * ROAD_EVERY * tile + along; y = by * ROAD_EVERY * tile + tile / 2; }
    else if (edge === 1) { x = bx * ROAD_EVERY * tile + along; y = (by * ROAD_EVERY + 5) * tile + tile / 2; }
    else if (edge === 2) { x = bx * ROAD_EVERY * tile + tile / 2; y = by * ROAD_EVERY * tile + along; }
    else { x = (bx * ROAD_EVERY + 5) * tile + tile / 2; y = by * ROAD_EVERY * tile + along; }
    trees.push({ x, y, r: 9 + rng() * 5 });
  }

  // ---- docks piers: wooden walkways jutting south from the beachfront ----
  for (let i = 0; i < 3; i += 1) {
    const px = (10 + i * 17 + rng() * 4) * tile;
    piers.push({ x: px, y: BEACH_ROW * tile, w: 26, h: (WATER_ROW + 3) * tile - BEACH_ROW * tile });
  }

  // ---- landmarks: one road-adjacent point per name in LANDMARKS ----
  // southOf(bx,by): centre of the road just south of a block.
  // eastOf(bx,by): centre of the road just east of a block.
  function southOf(bx, by) {
    return { x: (bx * ROAD_EVERY + 3.5) * tile, y: (by * ROAD_EVERY + 6.5) * tile };
  }
  function eastOf(bx, by) {
    return { x: (bx * ROAD_EVERY + 6.5) * tile, y: (by * ROAD_EVERY + 3.5) * tile };
  }
  const beachRoadY = (BEACH_ROW - 1 + 0.5) * tile; // ty 55 beachfront road
  const landmarks = {
    hideout: southOf(2, 5),
    garage: eastOf(2, 5), // next door to the hideout
    bank: southOf(4, 1), // downtown
    docks: { x: (piers[0].x + piers[0].w / 2), y: beachRoadY },
    paintShop: southOf(3, 5),
    hospital: eastOf(5, 3),
    park: southOf(1, 4), // beside the west park
    stadium: southOf(7, 4),
    warehouse: southOf(8, 1), // industrial east
    mansion: southOf(0, 0),
    casino: eastOf(5, 1), // downtown
    marina: { x: (piers[2].x + piers[2].w / 2), y: beachRoadY },
  };
  // Sanity: every landmark must sit on a road tile (cheap assert in dev).
  for (const name of LANDMARKS) {
    const p = landmarks[name];
    const tx = Math.floor(p.x / tile);
    const ty = Math.floor(p.y / tile);
    if (grid[ty * tiles + tx] !== CELL.ROAD) {
      throw new Error(`city: landmark ${name} is not on a road (${tx},${ty})`);
    }
  }

  // ---- queries ----
  function cellAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= tiles || ty >= tiles) return CELL.WATER;
    return grid[ty * tiles + tx];
  }

  function tileAtPx(x, y) {
    return { tx: Math.floor(x / tile), ty: Math.floor(y / tile) };
  }

  function isRoadAt(x, y) {
    const { tx, ty } = tileAtPx(x, y);
    return cellAt(tx, ty) === CELL.ROAD;
  }

  function isWaterAt(x, y) {
    const { tx, ty } = tileAtPx(x, y);
    return cellAt(tx, ty) === CELL.WATER;
  }

  function isBlockedAt(x, y) {
    const { tx, ty } = tileAtPx(x, y);
    const cell = cellAt(tx, ty);
    if (cell === CELL.WATER) return true;
    if (cell !== CELL.BUILDING) return false;
    // Precision: a BUILDING cell is only blocked inside a building rect.
    for (const b of buildings) {
      if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return true;
    }
    return false;
  }

  // A random point at a road centre; angle is the road's direction.
  function roadPoint(r) {
    const horizontal = r() < 0.5;
    const line = Math.floor(r() * 8); // road lines at index 6,13,...,55
    const along = Math.floor(r() * tiles);
    if (horizontal) {
      const ty = line * ROAD_EVERY + ROAD_EVERY - 1;
      return { x: (along + 0.5) * tile, y: (ty + 0.5) * tile, angle: r() < 0.5 ? 0 : Math.PI };
    }
    const tx = line * ROAD_EVERY + ROAD_EVERY - 1;
    return { x: (tx + 0.5) * tile, y: (along + 0.5) * tile, angle: r() < 0.5 ? Math.PI / 2 : -Math.PI / 2 };
  }

  // A random point on a sidewalk tile.
  function sidewalkPoint(r) {
    for (let tries = 0; tries < 40; tries += 1) {
      const tx = Math.floor(r() * tiles);
      const ty = Math.floor(r() * (WATER_ROW - 1));
      if (cellAt(tx, ty) === CELL.SIDEWALK) {
        return { x: (tx + 0.5) * tile + (r() - 0.5) * 24, y: (ty + 0.5) * tile + (r() - 0.5) * 24 };
      }
    }
    // Fallback: a sidewalk tile we know exists (block 0,0 north ring).
    return { x: 2.5 * tile, y: 0.5 * tile };
  }

  // ---- drawing ----
  function drawGround(ctx, cam) {
    const tx0 = Math.max(0, Math.floor(cam.x / tile));
    const ty0 = Math.max(0, Math.floor(cam.y / tile));
    const tx1 = Math.min(tiles - 1, Math.floor((cam.x + cam.w) / tile));
    const ty1 = Math.min(tiles - 1, Math.floor((cam.y + cam.h) / tile));

    // Tiles.
    for (let ty = ty0; ty <= ty1; ty += 1) {
      for (let tx = tx0; tx <= tx1; tx += 1) {
        const px = tx * tile;
        const py = ty * tile;
        const cell = grid[ty * tiles + tx];
        if (cell === CELL.WATER) {
          ctx.fillStyle = (tx + ty) % 2 === 0 ? PALETTE.water : PALETTE.waterDeep;
          ctx.fillRect(px, py, tile, tile);
          // Subtle wave line, phase from tile coords so it is stable.
          ctx.strokeStyle = 'rgba(255,255,255,0.18)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          const wy = py + 18 + ((tx * 7 + ty * 13) % 28);
          ctx.moveTo(px + 8, wy);
          ctx.quadraticCurveTo(px + tile / 2, wy - 5, px + tile - 8, wy);
          ctx.stroke();
        } else if (cell === CELL.BEACH) {
          ctx.fillStyle = PALETTE.beach;
          ctx.fillRect(px, py, tile, tile);
          ctx.fillStyle = PALETTE.sand;
          ctx.fillRect(px, py + tile - 10, tile, 4);
        } else if (cell === CELL.PARK) {
          ctx.fillStyle = (tx + ty) % 2 === 0 ? PALETTE.park : PALETTE.parkDark;
          ctx.fillRect(px, py, tile, tile);
        } else if (cell === CELL.SIDEWALK) {
          ctx.fillStyle = PALETTE.sidewalk;
          ctx.fillRect(px, py, tile, tile);
          ctx.strokeStyle = 'rgba(0,0,0,0.08)';
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 0.5, py + 0.5, tile - 1, tile - 1);
        } else if (cell === CELL.ROAD) {
          ctx.fillStyle = (tx + ty) % 2 === 0 ? PALETTE.asphalt : PALETTE.asphaltDark;
          ctx.fillRect(px, py, tile, tile);
        } else {
          // BUILDING cell: bare ground under the building rects.
          ctx.fillStyle = '#a89f8d';
          ctx.fillRect(px, py, tile, tile);
        }
      }
    }

    // Road centre dashes: one dashed line per road row / column in view.
    ctx.fillStyle = PALETTE.roadLine;
    for (let line = 0; line < 8; line += 1) {
      const rc = line * ROAD_EVERY + ROAD_EVERY - 1;
      const cy = (rc + 0.5) * tile;
      if (cy >= cam.y - tile && cy <= cam.y + cam.h + tile) {
        for (let x = Math.max(cam.x, 0); x < Math.min(cam.x + cam.w, size); x += tile) {
          ctx.fillRect(x + 14, cy - 2, 36, 4);
        }
      }
      const cx = (rc + 0.5) * tile;
      if (cx >= cam.x - tile && cx <= cam.x + cam.w + tile) {
        for (let y = Math.max(cam.y, 0); y < Math.min(cam.y + cam.h, BEACH_ROW * tile); y += tile) {
          ctx.fillRect(cx - 2, y + 14, 4, 36);
        }
      }
    }

    // Docks piers (wooden walkways into the water).
    for (const p of piers) {
      if (p.x + p.w < cam.x || p.x > cam.x + cam.w || p.y + p.h < cam.y || p.y > cam.y + cam.h) continue;
      ctx.fillStyle = '#8a6a45';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = '#a3805a';
      for (let y = p.y + 6; y < p.y + p.h; y += 22) ctx.fillRect(p.x, y, p.w, 4);
      ctx.fillStyle = '#6e5233';
      ctx.fillRect(p.x - 3, p.y, 3, p.h);
      ctx.fillRect(p.x + p.w, p.y, 3, p.h);
    }

    // Buildings: drop shadow, base, lighter roof, a few windows.
    for (const b of buildings) {
      if (b.x + b.w < cam.x || b.x > cam.x + cam.w || b.y + b.h < cam.y || b.y > cam.y + cam.h) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
      if (b.stadium) {
        // Running track ring + pitch.
        ctx.fillStyle = '#c96f4a';
        ctx.fillRect(b.x + 22, b.y + 22, b.w - 44, b.h - 44);
        ctx.fillStyle = PALETTE.park;
        ctx.fillRect(b.x + 44, b.y + 44, b.w - 88, b.h - 88);
        ctx.strokeStyle = '#f2f0e8';
        ctx.lineWidth = 2;
        ctx.strokeRect(b.x + 44, b.y + 44, b.w - 88, b.h - 88);
      } else if (!b.warehouse) {
        // Windows: deterministic pattern from the building position.
        ctx.fillStyle = 'rgba(20,30,44,0.55)';
        const cols = Math.max(1, Math.floor(b.w / 34));
        const rows = Math.max(1, Math.floor(b.h / 34));
        for (let r = 0; r < rows; r += 1) {
          for (let c = 0; c < cols; c += 1) {
            if (hash2(b.x + c * 31, b.y + r * 37) < 0.45) continue;
            ctx.fillRect(b.x + 12 + c * 34, b.y + 12 + r * 34, 14, 18);
          }
        }
      } else {
        // Warehouse: skylight strip.
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(b.x + 12, b.y + 12, b.w - 24, 8);
      }
    }

    // Trees: canopy + darker core.
    for (const t of trees) {
      if (t.x + t.r < cam.x || t.x - t.r > cam.x + cam.w || t.y + t.r < cam.y || t.y - t.r > cam.y + cam.h) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.arc(t.x + 3, t.y + 4, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.tree;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.treeDark;
      ctx.beginPath();
      ctx.arc(t.x - t.r * 0.25, t.y - t.r * 0.25, t.r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMinimapBase(ctx, x, y, w, h) {
    const sx = w / size;
    const sy = h / size;
    ctx.fillStyle = PALETTE.waterDeep;
    ctx.fillRect(x, y, w, h);
    // Beach strip.
    ctx.fillStyle = PALETTE.beach;
    ctx.fillRect(x, y + BEACH_ROW * tile * sy, w, tile * sy);
    // Parks.
    ctx.fillStyle = PALETTE.park;
    for (const key of PARK_BLOCKS) {
      const [bx, by] = key.split(',').map(Number);
      ctx.fillRect(
        x + (bx * ROAD_EVERY + 1) * tile * sx, y + (by * ROAD_EVERY + 1) * tile * sy,
        4 * tile * sx, 4 * tile * sy,
      );
    }
    // Roads as light lines.
    ctx.fillStyle = PALETTE.roadLine;
    for (let line = 0; line < 8; line += 1) {
      const rc = line * ROAD_EVERY + ROAD_EVERY - 1;
      ctx.fillRect(x, y + (rc + 0.5) * tile * sy - 1, w, 2);
      ctx.fillRect(x + (rc + 0.5) * tile * sx - 1, y, 2, h);
    }
    // Building blocks as dark rects.
    ctx.fillStyle = '#3a3a42';
    for (const b of buildings) {
      ctx.fillRect(x + b.x * sx, y + b.y * sy, Math.max(1, b.w * sx), Math.max(1, b.h * sy));
    }
  }

  return {
    size, tile, tiles, grid, buildings, trees, landmarks,
    cellAt, isRoadAt, isWaterAt, isBlockedAt, roadPoint, sidewalkPoint,
    drawGround, drawMinimapBase,
  };
}
