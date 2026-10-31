import { retainCanvas } from "./render-health.js";
// Fusion Pixel 12px, unmodified font. Copyright/license: assets/fonts/fusion-pixel/.
// Rasterize each glyph once at its native size; upscale like the original bitmap fonts.
export const CJK_ADVANCE = 12;
export const isCJK = ch => /[\u2e80-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/u.test(ch);
export const cjkReady = document.fonts.load('12px "DOSAGE Pixel SC"', '中文').then(faces => {
  if (!faces.length) throw new Error('中文像素字体加载失败');
});
const glyphCache = new Map();
export function drawCJK(ctx, ch, x, y, f, colour) {
  const ink = colour || '#c7bbb2', key = `${ch}:${ink}`;
  if (!glyphCache.has(key)) {
    const tile = document.createElement('canvas');
    tile.width = 12; tile.height = 16;
    const g = tile.getContext('2d');
    g.font = '12px "DOSAGE Pixel SC"';
    g.textBaseline = 'alphabetic';
    g.fillStyle = ink;
    g.fillText(ch, 0, 12);
    // Bound the cache for long sessions with many different colored messages.
    if (glyphCache.size >= 4096) glyphCache.delete(glyphCache.keys().next().value);
    glyphCache.set(key, retainCanvas(tile, "cjk-glyph"));
  }
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(glyphCache.get(key), Math.round(x), Math.round(y - 3 * f), 12 * f, 16 * f);
  ctx.restore();
}
