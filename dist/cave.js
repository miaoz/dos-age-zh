// A floor of the cave, laid out fresh from a seed, the classic roguelike way: unlike the forest
// it has edges, SIZE cells of rock with
//   - ROOMS rooms dug out of it, a cell or more of rock between any two, of three kinds:
//     - most are dug: tidy rectangles (ROOM_SIZE), their edges straight
//     - CAVERNS of them are caverns instead, the odd organic pocket: a blob (CAVERN_SIZE) worn
//       out of the rock, rounded off, its edge ragged (NOOKS), and the tunnels to it wind
//       (TUNNEL_WANDER) and wear away at the rock beside them too
//     - BUILT of them are stone rooms (the biome's two "room1"s, by STYLES): a rectangle
//       (BUILT_SIZE), its corners cut away NOTCH of the time (a cut NOTCH_SIZE at most), floored
//       and walled all round, with a doorway wherever a corridor comes in (the first style's
//       with a door in it); a torch in a back corner; the second style TABLE of the time with a
//       table and chairs in the middle, the first a chair against its back wall CHAIR of the
//       time; CHEST of them with a chest against a wall, RACK with a weapon rack, and GUARDED
//       of them with monsters (GUARDS) on top of the usual; and a table's room FEAST.chance of the
//       time a goblin feast (story/CODEX.md goblin-feast), FEAST.max a floor at most: three goblins (game.js
//       FEAST) standing in the chairs' places at the table's ends and under it, and no other monsters;
//       and, on the floor the blacksmith's been put on (game.js SMITH decides which, `smith`), his
//       forge: a stone room (SMITH.size at least, never the arrival room) with an anvil in its
//       middle, the blacksmith beside it, a shelf and a chair against its back wall, a torch, and
//       nothing else, no monsters either (story/CODEX.md blacksmith)
//   - corridors, one cell wide, joining every room to the rest by the shortest set of links,
//     and LOOPS of the other links between rooms that are near each other as well, so there's
//     more than one way round and less doubling back: straight, turning once (whichever way
//     cuts through fewer stone rooms' walls), save those to a cavern, which wind
//   - the stairs up, at the back of a room picked at random, and the stairs down, at the back
//     of any other: next door or right across the floor. The character arrives on the cell
//     below the one they came by.
//   - torches on the walls (318:64736), all over the floor: in the face of the rock (or a stone
//     room's wall) right over floor, TORCH_APART cell widths at least from the next, TORCHES of
//     the places they could go; never on the floor, in anyone's way, nor dug out
//   - obstacles out in the open (the biome's "obstacle", where it has one), OBSTACLES of its cells
//     with floor all round them, never two side by side, so they're always walked round
//   - crystals on the floor (cave-3's), in patches like the mold's (CRYSTALS), each patch all one
//     colour, its light shade at the heart and its dark further out, a shape of the three to each
//     cell, never touching a wall (so each patch is an island, walked round); they stand in the way (but can be seen past), glow in their colour, light what's round
//     them, and the dark ones catch the light now and then (game.js SHINE, CAVE_GLOW)
//   - lava (cave-4's): a pool in LAVA.rooms of the rooms out in the open big enough for one (their
//     floor but for a cell's ring round its edge, ragged, a bridge across it LAVA.bridge of the
//     time), and LAVA.rivers rivers, `width` cells wide, winding right across the floor, through
//     the dirt as well, round the stone rooms. It can't be walked through, but it can be seen
//     across, and it glows and lights what's round it like fire (game.js CAVE_GLOW, LIGHT)
//   - and nothing ever stands in the way: a stone room's things, the obstacles and the crystals
//     each go only where the floor round them still joins up without them (see clear()), so
//     they never close a doorway or a corridor, and wherever a lava river cuts a way (or would
//     send the character more than LAVA.detour steps round), a bridge (either of the biome's
//     two, 2 by 2) goes over it (see unblock() for the rest)
//   - mold on the floor (the biome's "mushroom"), in patches: MOLD.patches of them (min..max) out in the open,
//     and in every cavern `caverns` more (it's damp there), each `radius` cell widths across
//     (min..max), thick in the middle, thinner further out and sparse at its edge, ragged all
//     round; never on a stone room's floor. It's only on the ground: it's walked over
//   - monsters in the other rooms (MONSTERS a room, by its size), by FLOORS: cave-1's on the first
//     floor, cave-2's on the second (out on the sand), cave-3's on the third and below
// Each floor is drawn from a biome of the cave (Figma "biomes", 501:78337; tools/extract.py
// CAVES): cave-1 for the first, cave-2 (the sand) for the second, cave-3 (the crystals) for the
// third, cave-4 (the lava) for the fourth and any below.
// Everything that isn't floor is solid dirt (the biome's common dirt-wall, its two looks by
// DIRT's weights), beyond the floor's edges too, and can be dug through with a pickaxe (see
// dig()), all but the stone rooms' walls and the very edge of the floor. Through the dirt run
// veins of hard dirt (its uncommon), and in the thick of them rock (its rare), the way strata lie: wherever a smooth noise
// (STRATA, `scale` cell widths across) is past `hard`, and past `rock` where a finer one
// (`grain`) breaks it up into clumps; and, besides, scattered all through the dirt, bits of
// either, 1 to 3 cells (`bits`), round `scatter` of its cells, rock `rockBits` of the time.
// They dig `hardness` times as hard (see hardness()); each cell of either is one of its two looks.
// The cave's own floor is bare, with a sprinkle (the biome's "dirt") on SPRINKLE of its cells. (Tidied 2026-10-05, from rooms all worn ragged and corridors all winding.)
import { rng, SHRINE } from "./world.js";

const SIZE = [120, 60];            // cells (8x12 px each, so it's as far across as up and down)
const ROOMS = [20, 26];
const ROOM_SIZE = [[6, 14], [4, 8]];   // [cols, rows], min..max
const CAVERNS = 0.18;
const CAVERN_SIZE = [[9, 16], [6, 10]];
const TUNNEL_WANDER = 0.3;         // chance of a winding tunnel's step going sideways instead of on
const NOOKS = 0.12;                // of the rock round a cavern or its tunnels, worn away
const BUILT = 0.2;
const BUILT_SIZE = [[5, 12], [3, 7]];
const NOTCH = 0.35, NOTCH_SIZE = [3, 2];
const STYLES = [1, 1];             // the two kinds of stone room, by these weights (Claude's pick)
const TABLE = 0.5, CHAIR = 0.6, CHEST = 0.4, RACK = 0.35, GUARDED = 0.45, GUARDS = [1, 3];
// (`max` by floor: one on cave-1's, two on cave-2's and below, the user's; `chance` Claude's pick, 2026-10-13)
const FEAST = { chance: 0.7, max: [1, 2] };
// The blacksmith's forge: a stone room at least `size` [cols, rows] (Claude's pick, 2026-10-13)
const SMITH = { size: [6, 4] };
// Vaults: VAULT.count of them a floor, a chasm (a cavern's blob) `chasms` of the time, otherwise a
// stone room (either style), `rock` cells of dirt at least between them and the rest of the
// floor; 1-3 chests in each, nothing else (all Claude's picks bar the chests)
const VAULT = { count: [1, 3], chasms: 0.5, rock: 2, roomSize: [[4, 8], [3, 5]], chasmSize: [[7, 12], [5, 8]], chests: [1, 3] };
const OBSTACLES = 0.03;            // Claude's pick
const LOOPS = 0.3;
const LOOP_REACH = 34;             // how far apart (in cell widths) two rooms a loop joins may be
const SPRINKLE = 0.1;
const TORCHES = 0.6, TORCH_APART = 11;
const STRATA = { scale: 9, hard: 0.64, rock: 0.77, grain: 3.5, grainOver: 0.42, scatter: 0.03, bits: [1, 3], rockBits: 0.4,
  hardness: { hard: 2, rock: 3 } };
const MOLD = { patches: [5, 9], caverns: [1, 2], radius: [2, 5], thick: 0.4, thin: 0.75, ragged: 0.25 };
// (Claude's picks, 2026-10-11)
const CRYSTALS = { patches: [8, 12], caverns: [1, 2], radius: [1.5, 3.5], light: 0.45, fill: 0.5, ragged: 0.3 };
const LAVA = { rooms: 0.55, size: [7, 5], ragged: 0.3, bridge: 0.75, rivers: [1, 2], width: [1, 2], wander: 0.3, lightEvery: 6, detour: 10 };
const DIRT = [35, 65];             // ground-wall-1 (the more pitted), -2
// (20% more since 2026-10-12, a little less than the forests' 30%, the user's ask; was 0.035 and 3)
const MONSTERS = 0.042;            // to each cell of a room's floor, on average
const MONSTERS_MAX = 4;            // in any one room
// What a monster is on each floor, by these weights ("monster", 450:77570's cave-1, -2 and -3, v0.12;
// the weights Claude's picks). The miners and archaeologists are laid out in game.js (caveMap()).
// Floor 4 and below take cave-3's for now: cave-4's own monsters, and a final boss there, come later
// (the user's, 2026-10-12).
const FLOORS = [
  { slime: 20, goblinGrunt: 35, goblinSoldier: 15, earthworm: 10, skeleton: 20 },
  { goblinSoldier: 25, goblinMage: 20, sandSerpent: 20, earthworm: 10, skeleton: 15, skeletonArcher: 10 },
  { goblinSoldier: 25, goblinMage: 20, goblinBulwark: 15, earthworm: 10, sandSerpent: 20, stoneworm: 10 },
];

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const key = (x, y) => `${x},${y}`;

// `pieces` is the extracted scene data (scene.js); `depth` the floor (1 the first); `feast`, for
// trying it out (game.js "?feast"), has a feast on the floor wherever there's a table for one;
// `smith`, the blacksmith's forge on it (see SMITH); `shrine`, a shrine of that kind on it, for
// trying it out (game.js "?shrine"), wherever it'll go (see SHRINE_CAVE)
// (a floor with nowhere for his forge, however it's tried, is laid out as if he weren't on it, as it
// would be without him, so a save taken up again, which doesn't put him there, lays it out the same)
export function makeCave(pieces, seed, depth = 1, feast = false, smith = false, shrine = null) {
  for (let attempt = 0; smith && attempt < 200; attempt++) {
    const cave = layout(pieces, seed + attempt * 7919, depth, feast, true, shrine);
    if (cave?.forge && (!feast || cave.feasts.length)) return cave;
  }
  for (let attempt = 0; attempt < 200; attempt++) {
    const cave = layout(pieces, seed + attempt * 7919, depth, feast, false, shrine);
    if (cave && (!feast || cave.feasts.length || attempt === 199)) return cave;
  }
  throw new Error(`no playable cave for seed ${seed}`);
}

// A shrine (world.js SHRINE, the user's, 2026-10-20): `chance` of the floors have one, its kind as
// the forest's are picked (from dice of its own, so the rest of the floor's laid out as it would be
// without it), standing in a room out in the open (never the one the character arrives in, nor a
// stone room) with floor all round it, all nine of its cells in the way. (Claude's pick)
const SHRINE_CAVE = { chance: 0.15 };   // (the user's, 2026-10-20)

function layout(P, seed, depth, forceFeast, wantSmith, wantShrine = null) {
  const rand = rng(seed);
  const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const pick = list => list[int(0, list.length - 1)];
  const [w, h] = SIZE;
  const floor = new Uint8Array(w * h);
  const inside = (x, y) => x >= 1 && y >= 1 && x < w - 1 && y < h - 1;   // a cell of rock all round the edge
  const isFloor = (x, y) => x >= 0 && y >= 0 && x < w && y < h && floor[y * w + x] === 1;
  const dig = (x, y) => { if (inside(x, y)) floor[y * w + x] = 1; };
  const sand = depth > 1;
  const B = P.underground.biomes[Math.min(depth, P.underground.biomes.length) - 1];

  // Rooms: wherever one fits with rock between it and the rest
  const rooms = [], want = int(...ROOMS);
  for (let tries = 0; tries < 2000 && rooms.length < want; tries++) {
    const r0 = rand(), kind = r0 < BUILT ? "built" : r0 < BUILT + CAVERNS ? "cavern" : "dug";
    const size = kind === "built" ? BUILT_SIZE : kind === "cavern" ? CAVERN_SIZE : ROOM_SIZE;
    const rw = int(...size[0]), rh = int(...size[1]);
    const rx = int(2, w - rw - 2), ry = int(2, h - rh - 2);
    if (rooms.some(r => rx < r.x + r.w + 2 && r.x < rx + rw + 2 && ry < r.y + r.h + 2 && r.y < ry + rh + 2)) continue;
    const style = kind === "built" ? (rand() * (STYLES[0] + STYLES[1]) < STYLES[0] ? 0 : 1) : null;
    rooms.push({ kind, built: kind === "built", style, x: rx, y: ry, w: rw, h: rh, cx: rx + (rw >> 1), cy: ry + (rh >> 1), cells: [] });
  }
  if (rooms.length < ROOMS[0]) return null;
  const carve = r => {
    const has = new Set();
    if (r.kind === "cavern") {
      // a blob: inside an ellipse pushed in and out by coarse noise, then smoothed once
      const bump = new Map(), noise = (x, y) => {
        const k = key(x >> 1, y >> 1);
        if (!bump.has(k)) bump.set(k, rand() * 0.6 - 0.3);
        return bump.get(k);
      };
      for (let y = r.y; y < r.y + r.h; y++)
        for (let x = r.x; x < r.x + r.w; x++) {
          const dx = (x + 0.5 - r.x - r.w / 2) / (r.w / 2), dy = (y + 0.5 - r.y - r.h / 2) / (r.h / 2);
          if (dx * dx + dy * dy + noise(x, y) < 1) has.add(key(x, y));
        }
      const smooth = new Set();
      for (let y = r.y; y < r.y + r.h; y++)
        for (let x = r.x; x < r.x + r.w; x++) {
          let n = 0;
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) n += has.has(key(x + ox, y + oy)) ? 1 : 0;
          if (n >= 5) smooth.add(key(x, y));
        }
      smooth.add(key(r.cx, r.cy));
      for (const k of smooth) has.add(k);
      for (const k of [...has]) if (!smooth.has(k)) has.delete(k);
    } else {
      const cut = r.built && r.w >= 6 && r.h >= 4
        ? [[0, 0], [1, 0], [0, 1], [1, 1]].filter(() => rand() < NOTCH).map(c => [...c, int(1, NOTCH_SIZE[0]), int(1, NOTCH_SIZE[1])]) : [];
      for (let y = r.y; y < r.y + r.h; y++)
        for (let x = r.x; x < r.x + r.w; x++) {
          const notched = cut.some(([right, down, cw, ch]) =>
            (right ? x >= r.x + r.w - cw : x < r.x + cw) && (down ? y >= r.y + r.h - ch : y < r.y + ch));
          if (!notched) has.add(key(x, y));
        }
    }
    for (const k of has) { const [x, y] = k.split(",").map(Number); dig(x, y); r.cells.push([x, y]); }
  };
  for (const r of rooms) carve(r);
  // every cell of a stone room, and its walls (the rock right round its floor) -> the room
  const builtAt = new Map(), builtFloor = new Set();
  const build = r => {
    for (const [x, y] of r.cells) {
      builtFloor.add(key(x, y));
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) builtAt.set(key(x + ox, y + oy), r);
    }
  };
  for (const r of rooms.filter(r => r.built)) build(r);
  const wall = (x, y) => builtAt.has(key(x, y)) && !builtFloor.has(key(x, y));

  // Corridors: straight, turning once, from one room's middle to another's; to or from a
  // cavern, winding instead, and wearing at the rock beside it
  const worn = new Set();
  const corridor = (a, b) => {
    if (a.kind === "cavern" || b.kind === "cavern") {
      let x = a.cx, y = a.cy;
      for (let guard = 0; (x !== b.cx || y !== b.cy) && guard < 2000; guard++) {
        const dx = b.cx - x, dy = b.cy - y;
        let across = Math.abs(dx) * 8 >= Math.abs(dy) * 12;
        if (!builtAt.has(key(x, y)) && rand() < TUNNEL_WANDER) across = !across;   // (straight out of a stone room)
        if (across && !dx) across = false;
        if (!across && !dy) across = true;
        if (across) x += Math.sign(dx);
        else y += Math.sign(dy);
        dig(x, y);
        if (!builtAt.has(key(x, y))) worn.add(key(x, y));
      }
      return;
    }
    const path = acrossFirst => {
      const cells = [];
      let x = a.cx, y = a.cy;
      const go = (tx, ty) => { while (x !== tx || y !== ty) { x += Math.sign(tx - x); y += Math.sign(ty - y); cells.push([x, y]); } };
      if (acrossFirst) { go(b.cx, y); go(x, b.cy); } else { go(x, b.cy); go(b.cx, y); }
      return cells;
    };
    const walls = cells => cells.filter(([x, y]) => wall(x, y) && builtAt.get(key(x, y)) !== a && builtAt.get(key(x, y)) !== b).length;
    const one = path(true), other = path(false);
    for (const c of walls(one) <= walls(other) ? one : other) dig(...c);
  };
  for (const r of rooms) if (r.kind === "cavern") for (const [x, y] of r.cells) worn.add(key(x, y));
  const apart = (a, b) => Math.hypot(a.cx - b.cx, (a.cy - b.cy) * 12 / 8);
  // every room joined to the nearest one already joined (Prim's)...
  const joined = [rooms[0]], links = new Set();
  while (joined.length < rooms.length) {
    let best = null;
    for (const a of joined)
      for (const b of rooms)
        if (!joined.includes(b) && (!best || apart(a, b) < apart(...best))) best = [a, b];
    corridor(...best);
    links.add(key(rooms.indexOf(best[0]), rooms.indexOf(best[1])));
    joined.push(best[1]);
  }
  // ...and the odd loop between neighbours that aren't
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++)
      if (!links.has(key(i, j)) && !links.has(key(j, i)) && apart(rooms[i], rooms[j]) <= LOOP_REACH && rand() < LOOPS)
        corridor(rooms[i], rooms[j]);

  // Nooks: the rock round a cavern and its tunnels worn away here and there
  const nooks = [];
  for (const k of worn) {
    const [cx, cy] = k.split(",").map(Number);
    for (const [dx, dy] of DIRS) {
      const x = cx + dx, y = cy + dy;
      if (!isFloor(x, y) && !builtAt.has(key(x, y)) && rand() < NOOKS) nooks.push([x, y]);
    }
  }
  for (const c of nooks) dig(...c);

  // Stairs: each at the back of its room (rock right above it), with floor below to arrive on
  const stairSpots = r => {
    const spots = [];
    for (let y = r.y; y < r.y + r.h - 1; y++)
      for (let x = r.x; x < r.x + r.w; x++)
        if (isFloor(x, y) && !isFloor(x, y - 1) && isFloor(x, y + 1)) spots.push([x, y]);
    return spots;
  };
  const first = pick(rooms), last = pick(rooms.filter(r => r !== first));
  const ups = stairSpots(first), downs = stairSpots(last);
  if (!ups.length || !downs.length) return null;
  const up = pick(ups), down = pick(downs);
  const spawn = [up[0], up[1] + 1], below = [down[0], down[1] + 1];
  const stairs = new Set([key(...up), key(...down)]);

  const props = new Map();         // cell -> tile (a stone room's things, obstacles, chests: see below)
  // Lava (cave-4's, see LAVA): a pool inside a cell's ring of a room's floor, and now and then a
  // bridge over it, through its middle, across or down; then the rivers (below)
  const lava = new Map(), glows = [];   // lava's cells (-> its tile: the lava, or a bridge's), and cells it lights from
  const near = [...stairs, key(...spawn), key(...below)];
  if (B.lava)
    for (const r of rooms.filter(r => !r.built && r !== first && r !== last && r.w >= LAVA.size[0] && r.h >= LAVA.size[1])) {
      if (rand() >= LAVA.rooms) continue;
      const mine = new Set(r.cells.map(c => key(...c)));
      const pool = r.cells.filter(([x, y]) => {
        if (![-1, 0, 1].every(oy => [-1, 0, 1].every(ox => mine.has(key(x + ox, y + oy)))) || near.includes(key(x, y))) return false;
        const dx = (x + 0.5 - r.x - r.w / 2) / (r.w / 2 - 1), dy = (y + 0.5 - r.y - r.h / 2) / (r.h / 2 - 1);
        return dx * dx + dy * dy + (rand() - 0.5) * LAVA.ragged < 1;
      });
      if (!pool.length) continue;
      for (const c of pool) lava.set(key(...c), B.lava.lava);
      glows.push(pool.reduce((a, c) => Math.hypot(c[0] - r.cx, c[1] - r.cy) < Math.hypot(a[0] - r.cx, a[1] - r.cy) ? c : a));
      if (rand() < LAVA.bridge) {
        const br = pick(B.lava.bridges), across = rand() < 0.5;
        for (const [x, y] of pool) if (across ? y === r.cy || y === r.cy + 1 : x === r.cx || x === r.cx + 1)
          lava.set(key(x, y), br[(y - r.cy) & 1][(x - r.cx) & 1]);   // (its 2 by 2 tiled over the way across)
      }
    }
  const molten = (x, y) => !!B.lava && lava.get(key(x, y)) === B.lava.lava;   // (lava, not a bridge over it)
  // Where the character can get to from where they arrive, stepping on what `passable` lets them
  // (never the stairs: they lead away)
  const reachable = passable => {
    const seen = new Set([key(...spawn)]), queue = [spawn];
    while (queue.length) {
      const [x, y] = queue.shift();
      for (const [dx, dy] of DIRS) {
        const k = key(x + dx, y + dy);
        if (!seen.has(k) && !stairs.has(k) && passable(x + dx, y + dy)) { seen.add(k); queue.push([x + dx, y + dy]); }
      }
    }
    return seen;
  };
  // Opens the way to every cell of `needed` (keys) that `blocks` has closed off, by `clearing` the
  // fewest of what blocks it, the nearest first, until all can be got to again
  const unblock = (needed, blocks, clearing) => {
    for (let guard = 0; guard < 400; guard++) {
      const reach = reachable((x, y) => isFloor(x, y) && !props.has(key(x, y)) && !molten(x, y) && !blocks(x, y));
      const missing = new Set([...needed].filter(k => !reach.has(k) && !blocks(...k.split(",").map(Number))));
      if (!missing.size) return;
      // (a search through what blocks the way, out from the cells that can be got to)
      const prev = new Map(), queue = [];
      for (const k of reach) {
        const [x, y] = k.split(",").map(Number);
        for (const [dx, dy] of DIRS) if (blocks(x + dx, y + dy) && !prev.has(key(x + dx, y + dy))) { prev.set(key(x + dx, y + dy), null); queue.push([x + dx, y + dy]); }
      }
      let end = null;
      while (queue.length && !end) {
        const [x, y] = queue.shift();
        for (const [dx, dy] of DIRS) {
          const k = key(x + dx, y + dy);
          if (missing.has(k)) { end = [x, y]; break; }
          if (!prev.has(k) && blocks(x + dx, y + dy)) { prev.set(k, key(x, y)); queue.push([x + dx, y + dy]); }
        }
      }
      if (!end) return;
      for (let k = key(...end); k; k = prev.get(k)) clearing(...k.split(",").map(Number));
    }
  };
  const before = B.lava ? reachable(isFloor) : null;   // (every cell that could be got to before there was lava)
  if (B.lava) {
    // the rivers: across the floor one way or the other, winding, round the stone rooms
    const keepOff = (x, y) => [-1, 0, 1].some(oy => [-1, 0, 1].some(ox => builtAt.has(key(x + ox, y + oy)))) || near.includes(key(x, y));
    const cut = new Set();   // (floor the rivers ran over)
    for (let n = int(...LAVA.rivers); n > 0; n--) {
      const down = rand() < 0.5, wide = int(...LAVA.width), long = down ? h : w, span = down ? w : h;
      let at = int(Math.floor(span * 0.15), Math.floor(span * 0.85)), i = 0;
      for (let t = 1; t < long - 1; t++) {
        const was = at;
        if (rand() < LAVA.wander) at = Math.min(span - 2 - wide, Math.max(1, at + (rand() < 0.5 ? -1 : 1)));
        for (let j = Math.min(was, at); j < Math.max(was, at) + wide; j++) {   // (where it shifts, joined up, never by a corner)
          const [x, y] = down ? [j, t] : [t, j];
          if (!inside(x, y) || keepOff(x, y)) continue;
          if (isFloor(x, y)) cut.add(key(x, y));
          dig(x, y);
          lava.set(key(x, y), B.lava.lava);
          if (i++ % LAVA.lightEvery === 0) glows.push([x, y]);
        }
      }
    }
    // ...and where one ran over a way, a bridge, unless the way round is short (LAVA.detour):
    // each stretch of the floor it covered, from the floor beside it on one bank to the rest
    const walk = (x, y) => isFloor(x, y) && !molten(x, y) && !stairs.has(key(x, y));
    const left = new Set(cut);
    for (const k0 of cut) {
      if (!left.has(k0)) continue;
      const stretch = [k0];
      left.delete(k0);
      for (let i = 0; i < stretch.length; i++) {
        const [x, y] = stretch[i].split(",").map(Number);
        for (const [dx, dy] of DIRS) { const k = key(x + dx, y + dy); if (left.has(k)) { left.delete(k); stretch.push(k); } }
      }
      const banks = [...new Set(stretch.flatMap(k => { const [x, y] = k.split(",").map(Number); return DIRS.map(([dx, dy]) => [x + dx, y + dy]); })
        .filter(c => walk(...c)).map(c => key(...c)))];
      for (let guard = 0; banks.length > 1 && guard < 20; guard++) {
        // (how far the character walks from the first bank, a little further than across)
        const limit = stretch.length + 2 + LAVA.detour, dist = new Map([[banks[0], 0]]), queue = [banks[0]];
        while (queue.length) {
          const k = queue.shift(), d = dist.get(k), [x, y] = k.split(",").map(Number);
          if (d >= limit) continue;
          for (const [dx, dy] of DIRS) { const n = key(x + dx, y + dy); if (!dist.has(n) && walk(x + dx, y + dy)) { dist.set(n, d + 1); queue.push(n); } }
        }
        const far = banks.find(k => !dist.has(k));
        if (!far) break;
        // the bridge: the shortest way over the covered floor to it
        const prev = new Map([[banks[0], null]]), q = [banks[0]], over = new Set(stretch);
        while (q.length && !prev.has(far)) {
          const [x, y] = q.shift().split(",").map(Number);
          for (const [dx, dy] of DIRS) {
            const n = key(x + dx, y + dy);
            if (!prev.has(n) && (walk(x + dx, y + dy) || over.has(n))) { prev.set(n, key(x, y)); q.push(n); }
          }
        }
        if (!prev.has(far)) break;
        for (let k = far; k; k = prev.get(k)) if (over.has(k)) { const [x, y] = k.split(",").map(Number); lava.set(k, pick(B.lava.bridges)[y & 1][x & 1]); }
      }
    }
  }

  // A stone room's things: a torch in a back corner; in the second style a table (two cells)
  // with a chair either side and one or two under it, in the middle where there's a cell of
  // floor all round it, in the first a chair against its back wall; a chest and a weapon rack
  // against its back wall. They stand on the floor and can't be walked through.
  const chests = [], roomTorches = [], feasts = [], feastMax = FEAST.max[Math.min(depth, FEAST.max.length) - 1];
  const busy = new Set([...stairs, key(...spawn), key(...below), ...lava.keys()]);
  // Whether something can stand on a cell without being in the way: the floor beside it (that
  // can be walked on, `walkable`) still joins up round it, through the eight cells round it, so
  // it never closes a doorway or a corridor, nor sends anyone further round than a step or two
  const RING = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
  const clear = (x, y, walkable) => {
    const on = RING.map(([dx, dy]) => walkable(x + dx, y + dy));
    if (on.every(Boolean)) return true;
    // (the runs of floor round it, going round; the cells beside it must all be in one)
    let runs = 0;
    for (let i = 0; i < 8; i++) {
      if (!on[i] || on[(i + 7) % 8]) continue;
      let beside = false;
      for (let j = i; on[j % 8] && j < i + 8; j++) if (j % 2) beside = true;
      if (beside) runs++;
    }
    return runs <= 1;
  };
  const walkable = (x, y) => isFloor(x, y) && !props.has(key(x, y)) && !molten(x, y) && !stairs.has(key(x, y));
  const free = (x, y) => isFloor(x, y) && !props.has(key(x, y)) && !busy.has(key(x, y));
  const backWall = r => r.cells.filter(([x, y]) => free(x, y) && wall(x, y - 1) && isFloor(x, y + 1) && !props.has(key(x, y + 1)) && clear(x, y, walkable));
  // (the blacksmith's room, if he's on this floor: one big enough, not where the character arrives)
  const forgeRoom = wantSmith ? rooms.find(r => r.built && r !== first && r.w >= SMITH.size[0] && r.h >= SMITH.size[1]) ?? null : null;
  let forge = null;
  for (const r of rooms.filter(r => r.built)) {
    const S = B.rooms[r.style];
    const corners = backWall(r).filter(([x, y]) => wall(x - 1, y) || wall(x + 1, y));
    if (corners.length) {
      const at = pick(corners);
      props.set(key(...at), B.torch);
      roomTorches.push(at);
    }
    if (r === forgeRoom) {
      // the anvil in the middle with floor all round it, the blacksmith on its left, facing it;
      // a shelf and a chair against the back wall
      const ax = r.cx, ay = r.cy, room = new Set(r.cells.map(c => key(...c)));
      const ring = [-1, 0, 1].flatMap(oy => [-2, -1, 0, 1].map(ox => [ax + ox, ay + oy]));
      if (ring.every(([x, y]) => room.has(key(x, y)) && free(x, y))) {
        props.set(key(ax, ay), P.anvil);
        busy.add(key(ax - 1, ay));
        for (const t of [P.inside.shelf, S.chair]) {
          const spots = backWall(r);
          if (spots.length) props.set(key(...pick(spots)), t);
        }
        r.forge = true;
        forge = { at: [ax - 1, ay], anvil: [ax, ay], cells: r.cells };
      }
      continue;
    }
    if (r.style === 1 && r.w >= 6 && r.h >= 4 && rand() < TABLE) {
      const tx = r.cx - 1, ty = r.cy;
      const set = [[tx - 1, ty, S.chair], [tx, ty, S.table[0]], [tx + 1, ty, S.table[1]],
        [tx + 2, ty, S.chair], [tx, ty + 1, S.chair], ...(rand() < 0.5 ? [[tx + 1, ty + 1, S.chair]] : [])];
      const room = new Set(r.cells.map(c => key(...c)));
      // (only with floor all round it, so it never closes a way through)
      const ring = set.flatMap(([x, y]) => [-1, 0, 1].flatMap(oy => [-1, 0, 1].map(ox => [x + ox, y + oy])));
      if (set.every(([x, y]) => free(x, y)) && ring.every(([x, y]) => room.has(key(x, y)) && !busy.has(key(x, y)) && !props.has(key(x, y)))) {
        // (a feast, never where the character arrives: the goblins where the chairs at its ends and the first under it were)
        const seats = r !== first && feasts.length < feastMax && (rand() < FEAST.chance || forceFeast) ? [[tx - 1, ty], [tx + 2, ty], [tx, ty + 1]] : null;
        for (const [x, y, t] of set) if (!seats?.some(([sx, sy]) => sx === x && sy === y)) props.set(key(x, y), t);
        if (seats) {
          for (const at of seats) busy.add(key(...at));
          r.feast = true;
          feasts.push({ seats, table: [tx, ty], cells: r.cells });
        }
      }
    }
    if (r.style === 0 && rand() < CHAIR) {
      const spots = backWall(r);
      if (spots.length) props.set(key(...pick(spots)), S.chair);
    }
    if (rand() < CHEST) {
      const spots = backWall(r);
      if (spots.length) {
        const at = pick(spots);
        props.set(key(...at), P.inside.chest);
        chests.push(at);
      }
    }
    if (B.rack !== null && rand() < RACK) {
      const spots = backWall(r);
      if (spots.length) props.set(key(...pick(spots)), B.rack);
    }
  }
  // Obstacles out in the open: only with floor all round (none of it taken), so never in the way
  const open = (x, y) => isFloor(x, y) && !builtAt.has(key(x, y)) && !props.has(key(x, y)) && !busy.has(key(x, y));
  if (B.obstacles.length)
    for (const r of rooms.filter(r => !r.built))
      for (const [x, y] of r.cells)
        if (rand() < OBSTACLES && [-1, 0, 1].every(oy => [-1, 0, 1].every(ox => open(x + ox, y + oy))))
          props.set(key(x, y), pick(B.obstacles));

  // A bridge wherever the lava closes a way (now that everything else stands where it will)
  if (B.lava) unblock(before, molten, (x, y) => lava.set(key(x, y), pick(B.lava.bridges)[y & 1][x & 1]));
  // Whatever floor can't be reached from where the character arrives, without stepping on the
  // stairs (they lead away) or through things, is rock after all: the odd corner cut off
  const seen = new Set([key(...spawn)]), queue = [spawn];
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const [dx, dy] of DIRS) {
      const k = key(x + dx, y + dy);
      if (!seen.has(k) && isFloor(x + dx, y + dy) && !stairs.has(k) && !props.has(k) && !molten(x + dx, y + dy)) { seen.add(k); queue.push([x + dx, y + dy]); }
    }
  }
  if (!seen.has(key(...below))) return null;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = key(x, y);
      if (floor[y * w + x] && !seen.has(k) && !stairs.has(k) && !props.has(k) && !molten(x, y)) { floor[y * w + x] = 0; lava.delete(k); }   // (lava's left, deep in the dirt)
    }
  // (a chest no one can get to isn't one)
  for (let i = chests.length - 1; i >= 0; i--) {
    const [x, y] = chests[i];
    if (!DIRS.some(([dx, dy]) => seen.has(key(x + dx, y + dy)))) { props.delete(key(x, y)); floor[y * w + x] = 0; chests.splice(i, 1); }
  }
  for (const k of props.keys()) if (!chests.some(c => key(...c) === k)) {
    const [x, y] = k.split(",").map(Number);
    if (!DIRS.some(([dx, dy]) => seen.has(key(x + dx, y + dy)))) { props.delete(k); floor[y * w + x] = 0; }
  }

  for (let i = roomTorches.length - 1; i >= 0; i--) if (!props.has(key(...roomTorches[i]))) roomTorches.splice(i, 1);
  // (a stone room cut off from the rest is no room at all: just more dirt)
  for (const r of rooms.filter(r => r.built && !r.cells.some(c => seen.has(key(...c)))))
    for (const [k, owner] of [...builtAt]) if (owner === r) { builtAt.delete(k); builtFloor.delete(k); }

  // Vaults: rooms and chasms sealed in the dirt, VAULT.rock cells of it at least between them and
  // any other floor, so only digging gets in; in each, VAULT.chests chests and nothing else
  const vaults = [], vaultWall = new Set();
  const solid = (x0, y0, x1, y1) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!inside(x, y) || floor[y * w + x] || builtAt.has(key(x, y))) return false;
    return true;
  };
  for (let n = int(...VAULT.count), tries = 0; vaults.length < n && tries < 400; tries++) {
    const kind = rand() < VAULT.chasms ? "cavern" : "built", size = kind === "built" ? VAULT.roomSize : VAULT.chasmSize;
    const rw = int(...size[0]), rh = int(...size[1]), rx = int(3, w - rw - 3), ry = int(3, h - rh - 3);
    const m = VAULT.rock + (kind === "built" ? 1 : 0);   // (a room's wall is round its floor)
    if (!solid(rx - m, ry - m, rx + rw - 1 + m, ry + rh - 1 + m)) continue;
    const r = { kind, built: kind === "built", style: int(0, 1), vault: true, x: rx, y: ry, w: rw, h: rh, cx: rx + (rw >> 1), cy: ry + (rh >> 1), cells: [] };
    carve(r);
    if (r.built) {
      build(r);
      for (const [k, owner] of builtAt) if (owner === r && !builtFloor.has(k)) vaultWall.add(k);
    }
    // its chests, anywhere that leaves the rest of its floor in one piece with every chest beside
    // it, so however it's dug into, all can be got at
    const mine = r.cells.map(c => key(...c));
    const whole = () => {
      const left = mine.filter(k => !props.has(k));
      const reach = new Set(left.slice(0, 1)), queue = left.slice(0, 1);
      while (queue.length) {
        const [x, y] = queue.shift().split(",").map(Number);
        for (const [dx, dy] of DIRS) { const k = key(x + dx, y + dy); if (left.includes(k) && !reach.has(k)) { reach.add(k); queue.push(k); } }
      }
      return reach.size === left.length && r.chests.every(([x, y]) => DIRS.some(([dx, dy]) => reach.has(key(x + dx, y + dy))));
    };
    r.chests = [];
    for (let c = int(...VAULT.chests); c > 0; c--) {
      const spots = r.cells.filter(c => !props.has(key(...c)));
      for (let i = spots.length - 1; i > 0; i--) { const j = int(0, i); [spots[i], spots[j]] = [spots[j], spots[i]]; }
      const at = spots.find(c => { props.set(key(...c), P.inside.chest); r.chests.push(c); if (whole()) return true; props.delete(key(...c)); r.chests.pop(); return false; });
      if (!at) break;
      chests.push(at);
    }
    vaults.push(r);
  }

  // Strata: smooth value noise, a random lattice every `scale` cells, eased in between
  const noise = scale => {
    const lattice = new Map(), at = (i, j) => { const k = key(i, j); if (!lattice.has(k)) lattice.set(k, rand()); return lattice.get(k); };
    const ease = t => t * t * (3 - 2 * t);
    return (x, y) => {
      const fx = x / scale, fy = y * 12 / 8 / scale, i = Math.floor(fx), j = Math.floor(fy), u = ease(fx - i), v = ease(fy - j);
      return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
    };
  };
  const vein = noise(STRATA.scale), grain = noise(STRATA.grain);
  const stratum = (x, y) => {
    const n = vein(x, y);
    return n > STRATA.rock && grain(x, y) > STRATA.grainOver ? pick(B.rock) : n > STRATA.hard ? pick(B.hard) : null;
  };

  // Tiles: -1 where nothing's drawn (the cave's bare floor)
  const tiles = new Int16Array(w * h).fill(-1);
  const doors = new Map();         // a room's doors (cells): { shut, open } (its tiles; shut till it's opened, see game.js)
  const dirtOdds = DIRT[0] / (DIRT[0] + DIRT[1]), walls = B.dirt;
  const floorOf = S => Array.isArray(S.floor) ? pick(S.floor) : S.floor;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x, k = key(x, y), built = builtAt.has(k), S = built && B.rooms[builtAt.get(k).style];
      if (props.has(k)) tiles[i] = props.get(k);
      else if (lava.has(k)) tiles[i] = lava.get(k);
      else if (floor[i]) {
        tiles[i] = !built ? (rand() < SPRINKLE ? pick(B.sprinkle) : -1)
          : !builtFloor.has(k) && S.door != null ? S.door : floorOf(S);   // (a doorway, in a wall with a door)
        if (built && tiles[i] === S.door) doors.set(k, { shut: S.door, open: S.doorOpen });
      }
      else tiles[i] = built ? S.wall : stratum(x, y) ?? walls[rand() < dirtOdds ? 0 : 1];
    }
  // ...and the scattered bits: a cell of plain dirt, and a step or two on to more of it
  const plain = (x, y) => x >= 0 && y >= 0 && x < w && y < h && walls.includes(tiles[y * w + x]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!plain(x, y) || rand() >= STRATA.scatter) continue;
      const t = pick(rand() < STRATA.rockBits ? B.rock : B.hard);
      let cx = x, cy = y;
      for (let n = int(...STRATA.bits); n > 0; n--) {
        if (plain(cx, cy)) tiles[cy * w + cx] = t;
        const [dx, dy] = pick(DIRS);
        cx += dx; cy += dy;
      }
    }
  // Mold: in patches, round a cell of bare floor
  const bare = (x, y) => isFloor(x, y) && !builtAt.has(key(x, y)) && !props.has(key(x, y)) && !lava.has(key(x, y));
  const openFloor = rooms.filter(r => !r.built).flatMap(r => r.cells).filter(c => bare(...c));
  const centres = [...Array(int(...MOLD.patches))].map(() => openFloor.length ? pick(openFloor) : null).filter(Boolean);
  for (const r of rooms.filter(r => r.kind === "cavern"))
    for (let n = int(...MOLD.caverns); n > 0; n--) { const c = r.cells.filter(c => bare(...c)); if (c.length) centres.push(pick(c)); }
  for (const [cx, cy] of centres) {
    const radius = MOLD.radius[0] + rand() * (MOLD.radius[1] - MOLD.radius[0]), ry = Math.ceil(radius * 8 / 12);
    for (let y = cy - ry; y <= cy + ry; y++)
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        const t = Math.hypot(x - cx, (y - cy) * 12 / 8) / radius + (rand() - 0.5) * MOLD.ragged;
        if (t >= 1 || !bare(x, y)) continue;
        const thickness = t < MOLD.thick ? 0 : t < MOLD.thin ? 1 : 2, i = y * w + x;
        const was = B.mold.indexOf(tiles[i]);
        if (was < 0 || thickness < was) tiles[i] = B.mold[thickness];   // (where patches meet, the thicker)
      }
  }
  // Crystals (cave-3's, see CRYSTALS): in patches like the mold's, each its own colour, light at
  // its heart and dark further out, only on bare floor (over the mold, where they meet)
  const shine = new Map();         // a dark crystal's tile -> the same, light
  const crystals = new Map(), shines = [];   // crystal cells -> their colour; a cell to light from in each patch
  if (B.crystals) {
    for (const c of B.crystals) c.dark.forEach((t, i) => shine.set(t, c.light[i]));
    const spots = [...Array(int(...CRYSTALS.patches))].map(() => openFloor.length ? pick(openFloor) : null).filter(Boolean);
    for (const r of rooms.filter(r => r.kind === "cavern"))
      for (let n = int(...CRYSTALS.caverns); n > 0; n--) { const c = r.cells.filter(c => bare(...c)); if (c.length) spots.push(pick(c)); }
    // (never on the stairs, where the character arrives, nor right by a chest)
    const kept = (x, y) => busy.has(key(x, y)) || chests.some(([cx, cy]) => Math.abs(cx - x) + Math.abs(cy - y) <= 1);
    for (const [cx, cy] of spots) {
      const set = pick(B.crystals), radius = CRYSTALS.radius[0] + rand() * (CRYSTALS.radius[1] - CRYSTALS.radius[0]), ry = Math.ceil(radius * 8 / 12);
      for (let y = cy - ry; y <= cy + ry; y++)
        for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
          const t = Math.hypot(x - cx, (y - cy) * 12 / 8) / radius + (rand() - 0.5) * CRYSTALS.ragged;
          if (t >= 1 || !bare(x, y) || kept(x, y) || rand() >= CRYSTALS.fill + (1 - t) * (1 - CRYSTALS.fill)) continue;
          // (never in the way: floor all round, so each patch is an island that's walked round)
          if (!RING.every(([dx, dy]) => walkable(x + dx, y + dy)) || !clear(x, y, (x, y) => walkable(x, y) && !crystals.has(key(x, y)))) continue;
          tiles[y * w + x] = pick(t < CRYSTALS.light ? set.light : set.dark);
          crystals.set(key(x, y), set.ink);
        }
      if (crystals.has(key(cx, cy)) || DIRS.some(([dx, dy]) => crystals.has(key(cx + dx, cy + dy)))) shines.push([cx, cy]);
    }
    // ...and none where they'd close a way
    unblock(seen, (x, y) => crystals.has(key(x, y)), (x, y) => { crystals.delete(key(x, y)); tiles[y * w + x] = -1; });
  }
  tiles[up[1] * w + up[0]] = P.underground.up;
  tiles[down[1] * w + down[0]] = P.underground.down;
  // Torches: in the walls, over floor, spread out
  const torches = [...roomTorches], torchAt = new Set(), spots = [];
  for (let y = 1; y < h - 2; y++)
    for (let x = 1; x < w - 1; x++)
      if (!floor[y * w + x] && seen.has(key(x, y + 1)) && !stairs.has(key(x, y + 1)) && !props.has(key(x, y + 1))) spots.push([x, y]);
  for (let i = spots.length - 1; i > 0; i--) { const j = int(0, i); [spots[i], spots[j]] = [spots[j], spots[i]]; }
  for (const [x, y] of spots)
    if (rand() < TORCHES && !torches.some(([tx, ty]) => Math.hypot(tx - x, (ty - y) * 12 / 8) < TORCH_APART)) {
      torches.push([x, y]);
      torchAt.add(key(x, y));
      tiles[y * w + x] = B.torch;
    }
  // ...and past the floor's edges, more dirt (or sand), the same every time it's asked for
  const beyond = (x, y) => walls[((Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1)) >>> 7 & 255) < dirtOdds * 256 ? 0 : 1];

  // Digging (a pickaxe): dirt that isn't a stone room's wall or the edge of the floor can be
  // dug out, and is bare floor from then on
  const diggable = (x, y) => inside(x, y) && !floor[y * w + x] && (!builtAt.has(key(x, y)) || vaultWall.has(key(x, y))) && !torchAt.has(key(x, y));
  const digOut = (x, y) => { floor[y * w + x] = 1; tiles[y * w + x] = -1; };
  // ...and a crystal can be mined away (see game.js CRYSTAL), leaving bare floor; a patch whose
  // crystals are all gone stops lighting what's round it
  const mine = (x, y) => {
    crystals.delete(key(x, y));
    tiles[y * w + x] = -1;
    for (let i = shines.length - 1; i >= 0; i--) {
      const [sx, sy] = shines[i];
      if (![[0, 0], ...DIRS].some(([dx, dy]) => crystals.has(key(sx + dx, sy + dy)))) shines.splice(i, 1);
    }
  };
  // ...the harder for hard dirt and rock (see STRATA): how many times the usual digging it takes
  const hardness = (x, y) => {
    const t = x >= 0 && y >= 0 && x < w && y < h ? tiles[y * w + x] : -1;
    return B.rock.includes(t) || vaultWall.has(key(x, y)) ? STRATA.hardness.rock : B.hard.includes(t) ? STRATA.hardness.hard : 1;
  };

  // The shrine, if there's one (see SHRINE_CAVE)
  let shrine = null;
  const s0 = rng(seed + 71);
  if (wantShrine || s0() < SHRINE_CAVE.chance) {
    const tier = s0() < SHRINE.rareOdds ? SHRINE.rare : SHRINE.common;
    const kind = wantShrine ?? tier[Math.floor(s0() * tier.length)], T = P.shrines[kind];
    const spots = rooms.filter(r => r !== first && !r.built).flatMap(r => {
      const room = new Set(r.cells.map(c => key(...c)));
      return r.cells.filter(([x, y]) => [-1, 0, 1, 2, 3].every(oy => [-1, 0, 1, 2, 3].every(ox => {
        const k = key(x + ox, y + oy);
        return room.has(k) && isFloor(x + ox, y + oy) && seen.has(k) && !props.has(k) && !busy.has(k) && !crystals.has(k) && !lava.has(k);
      })));
    });
    if (spots.length) {
      const [x, y] = spots[Math.floor(s0() * spots.length)];
      for (const [dx, dy, t] of T.cells) {
        props.set(key(x + dx, y + dy), t);
        busy.add(key(x + dx, y + dy));
        tiles[(y + dy) * w + x + dx] = t;
      }
      shrine = { x, y, w: 3, h: 3, kind };
    }
  }

  // Monsters: in every room but the one the character arrives in, clear of the stairs and
  // things; a guarded stone room has GUARDS more
  const kindOf = () => {
    const weights = FLOORS[Math.min(depth, FLOORS.length) - 1];
    let r = rand() * Object.values(weights).reduce((a, b) => a + b, 0);
    return Object.keys(weights).find(k => (r -= weights[k]) < 0) ?? "goblinGrunt";
  };
  const monsters = [];
  for (const r of rooms) {
    if (r === first || r.feast || r.forge) continue;
    const cells = r.cells.filter(([x, y]) => isFloor(x, y) && seen.has(key(x, y)) && !busy.has(key(x, y)) && !crystals.has(key(x, y)));
    let n = 0;
    for (let i = 0; i < cells.length; i++) if (rand() < MONSTERS) n++;
    n = Math.min(n, MONSTERS_MAX) + (r.built && rand() < GUARDED ? int(...GUARDS) : 0);
    for (; n > 0 && cells.length; n--) {
      const at = cells.splice(int(0, cells.length - 1), 1)[0];
      busy.add(key(...at));
      monsters.push({ kind: kindOf(), at });
    }
  }
  // ...and, should one come (see the goblin king in game.js), where: the room furthest from
  // where the character arrives
  const far = rooms.filter(r => r !== first && !r.forge).sort((a, b) => apart(b, first) - apart(a, first))[0];
  const lair = far.cells.find(([x, y]) => isFloor(x, y) && seen.has(key(x, y)) && !busy.has(key(x, y)) && !crystals.has(key(x, y))) ?? null;

  // (a feast cut off from the rest is no feast; nor's a forge)
  if (forge && !seen.has(key(...forge.at))) forge = null;
  for (let i = feasts.length - 1; i >= 0; i--) if (!feasts[i].seats.every(c => seen.has(key(...c)))) feasts.splice(i, 1);

  return { w, h, isFloor, blocks: (x, y) => props.has(key(x, y)) || molten(x, y) || crystals.has(key(x, y)),
    tile: (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? tiles[y * w + x] : beyond(x, y)),
    setTile: (x, y, t) => { tiles[y * w + x] = t; },
    // a door that's shut: it blocks sight, and walking into it opens it (game.js)
    shut: (x, y) => doors.get(key(x, y))?.shut === (x >= 0 && y >= 0 && x < w && y < h ? tiles[y * w + x] : null), doors,
    diggable, dig: digOut, mine, hardness, up, down, spawn, below, rooms, vaults, monsters, feasts, forge, shrine, chests, torches, lair, sand,
    glows, shines, shine, crystals, flow: B.lava ? B.lava : null,
    lava: [...lava].filter(([, t]) => t === B.lava?.lava).map(([k]) => k.split(",").map(Number)) };
}
