// Fog of war: world cells fade in steps with distance from the character.
// Each step is a recoloured copy of the tile atlas. Past the dimmed step, tiles become a
// dithered silhouette (the 50% level is the Figma "checker", 11:1539) that thins out
// until nothing is drawn.

const MUTED = [[0x45, 0x28, 0x3c], [0x32, 0x3c, 0x39], [0x25, 0x3a, 0x56]];
const MUTED_FALLBACK = [0x32, 0x3c, 0x39]; // for tiles with no foreground
const DARK2 = [0x22, 0x20, 0x34];
const BG = [7, 19, 36];

// `from`: distance (in cell widths) where the step starts. A step either dims the original
// colours toward the background, or draws `density` of the tile's foreground in `tone`
// ("closest" picks one of MUTED per tile).
export const FOG_STEPS = [
  { from: 0 },                                  // untouched
  { from: 4.2, dim: 0.3 },
  { from: 6.6, tone: "closest", density: 1 / 2 },
  { from: 9, tone: DARK2, density: 1 / 2 },
  { from: 10.6, tone: DARK2, density: 1 / 4 },
  { from: 12.2, tone: DARK2, density: 1 / 8 },
];
export const FOG_END = 13.8; // nothing is drawn from here on

// 4x4 ordered dither: a pixel is kept when its threshold is below density * 16.
// At 1/2 this is a 1px checkerboard; it tiles seamlessly because cells are 8x12.
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;

// Colour "direction", so a bright brown still counts as closest to the dark plum
const chroma = ([r, g, b]) => { const s = r + g + b || 1; return [r / s, g / s, b / s]; };
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

function closestMuted(rgb) {
  const c = chroma(rgb);
  return MUTED.reduce((best, m) => (dist2(chroma(m), c) < dist2(chroma(best), c) ? m : best));
}

// Returns one atlas per FOG_STEPS entry.
export function fogAtlases(tiles, cw, ch) {
  const w = tiles.width, h = tiles.height;
  const src = document.createElement("canvas");
  src.width = w; src.height = h;
  src.getContext("2d").drawImage(tiles, 0, 0);
  const px = src.getContext("2d").getImageData(0, 0, w, h).data;
  const isFg = i => px[i + 3] > 0 && (px[i] !== BG[0] || px[i + 1] !== BG[1] || px[i + 2] !== BG[2]);

  // per tile: the MUTED colour closest to its average foreground colour, and its brightness
  const closest = [], bright = [];
  for (let tx = 0; tx < w; tx += cw) {
    const sum = [0, 0, 0];
    let n = 0;
    for (let y = 0; y < ch; y++)
      for (let x = tx; x < tx + cw; x++) {
        const i = (y * w + x) * 4;
        if (isFg(i)) { sum[0] += px[i]; sum[1] += px[i + 1]; sum[2] += px[i + 2]; n++; }
      }
    const avg = n ? sum.map(v => v / n) : BG;
    closest.push(n ? closestMuted(avg) : MUTED_FALLBACK);
    bright.push(luma(avg));
  }

  return FOG_STEPS.map(step => {
    if (!step.dim && !step.tone) return tiles;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    const img = g.createImageData(w, h);
    const out = img.data;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        out.set(px.subarray(i, i + 4), i);
        if (!isFg(i)) continue;
        if (step.dim) {
          for (let k = 0; k < 3; k++) out[i + k] = Math.round(px[i + k] + (BG[k] - px[i + k]) * step.dim);
        } else {
          // fog never brightens: a tile darker than its fog colour keeps its own colours
          // (dithered the same way) rather than dropping out and leaving a hole
          const t = Math.floor(x / cw);
          const tone = step.tone === "closest" ? closest[t] : step.tone;
          const on = BAYER[y % 4][x % 4] < step.density * 16;
          out.set(!on ? BG : luma(tone) <= bright[t] ? tone : px.subarray(i, i + 3), i);
        }
      }
    g.putImageData(img, 0, 0);
    return c;
  });
}

// Distance of a cell from the character, in cell widths (cells are taller than wide)
export const fogDistance = (dx, dy, cw, ch) => Math.hypot(dx, dy * ch / cw);

// Which step a cell is in, given its offset (in cells) from the character; -1 once hidden.
// `light`: cells the fog is pushed back by (a torch); `spread`: how much wider apart its steps
// are (daylight), so it darkens more gradually
export function fogStep(dx, dy, cw, ch, light = 0, spread = 1) {
  const d = (fogDistance(dx, dy, cw, ch) - light) / spread;
  if (d >= FOG_END) return -1;
  let s = 0;
  while (s + 1 < FOG_STEPS.length && d >= FOG_STEPS[s + 1].from) s++;
  return s;
}

// A red wash over atlases (low health): every pixel but the background moves `amount` (0..1)
// of the way to a red of the same brightness, so what's light stays light, what's dark stays
// dark, and things read as clearly as before.
const RED = [0xd9, 0x57, 0x63];
export function redAtlases(atlases, amount) {
  const redLuma = luma(RED);
  return atlases.map(atlas => {
    const c = document.createElement("canvas");
    c.width = atlas.width; c.height = atlas.height;
    const g = c.getContext("2d");
    g.drawImage(atlas, 0, 0);
    const img = g.getImageData(0, 0, c.width, c.height), px = img.data;
    for (let i = 0; i < px.length; i += 4) {
      if (!px[i + 3] || (px[i] === BG[0] && px[i + 1] === BG[1] && px[i + 2] === BG[2])) continue;
      const l = luma([px[i], px[i + 1], px[i + 2]]) / redLuma;
      for (let k = 0; k < 3; k++) px[i + k] = Math.round(px[i + k] + (Math.min(255, RED[k] * l) - px[i + k]) * amount);
    }
    g.putImageData(img, 0, 0);
    return c;
  });
}

// An atlas with every pixel but the background (and what's see-through) in one flat colour
// (a monster lit up by a thunderbolt)
export function flashAtlas(atlas, colour) {
  const c = document.createElement("canvas");
  c.width = atlas.width; c.height = atlas.height;
  const g = c.getContext("2d");
  g.drawImage(atlas, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height), px = img.data;
  for (let i = 0; i < px.length; i += 4) {
    if (!px[i + 3] || (px[i] === BG[0] && px[i + 1] === BG[1] && px[i + 2] === BG[2])) continue;
    px.set(colour, i);
  }
  g.putImageData(img, 0, 0);
  return c;
}
