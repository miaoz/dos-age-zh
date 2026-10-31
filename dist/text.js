import { isCJK, CJK_ADVANCE, drawCJK, cjkReady } from "./zh-font.js";
// Text in MEKMODE Text, drawn from the white glyph strip tools/extract.py bakes and tinted
// to whatever colour is asked for (each colour's copy is made once).

import { SCENE } from "./scene.js";
import { loaded } from "./picture.js";
import { SANS, DOSAGE } from "./sans.js";

const { glyphs, h: LINE } = SCENE.font;
const strip = new Image();
strip.src = SCENE.font.src;
export const fontReady = Promise.all([loaded(strip), cjkReady]);

const tinted = new Map();
function tint(colour) {
  if (!tinted.has(colour)) {
    const c = document.createElement("canvas");
    c.width = strip.width; c.height = strip.height;
    const g = c.getContext("2d");
    g.drawImage(strip, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = colour;
    g.fillRect(0, 0, c.width, c.height);
    tinted.set(colour, c);
  }
  return tinted.get(colour);
}

const glyph = ch => isCJK(ch) ? [0, CJK_ADVANCE] : glyphs[ch] || glyphs["?"];

// Width of runs of [text, colour], in font px
export const textWidth = runs => runs.reduce((w, [s]) => [...s].reduce((a, ch) => a + glyph(ch)[1], w), 0);

// Draws runs of [text, colour] with their top-left at x, y, each font px `f` screen px
export function drawText(ctx, runs, x, y, f) {
  for (const [s, colour] of runs) {
    const src = tint(colour);
    for (const ch of s) {
      if (isCJK(ch)) { drawCJK(ctx, ch, x, y, f, colour); x += CJK_ADVANCE * f; continue; }
      const [gx, adv] = glyph(ch);
      ctx.drawImage(src, gx, 0, adv, LINE, x, y, adv * f, LINE * f);
      x += adv * f;
    }
  }
}

// MEK Sans, the v0.13 panels' font (tools/sans.py, sans.js), drawn the same way: `sansWidth()` in
// font px; drawSans() with the top of its capitals at y (its rows above them, for accents and the
// like, go above y; its descenders below y + cap), each font px `f` screen px. `font` is SANS or
// DOSAGE (the body text's, 2026-10-27: the same rows, so either fits where the other does; a letter
// Dosage lacks is drawn in MEK Sans)
const strips = new Map([SANS, DOSAGE].map(font => { const img = new Image(); img.src = font.src; return [font, { img, tinted: new Map() }]; }));
export const sansReady = Promise.all([...strips.values()].map(s => loaded(s.img)));
function sansTint(font, colour) {
  const { img, tinted } = strips.get(font);
  if (!tinted.has(colour)) {
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = colour;
    g.fillRect(0, 0, c.width, c.height);
    tinted.set(colour, c);
  }
  return tinted.get(colour);
}
// (the font drawn when none's asked for: MEK Sans, or Dosage with ?dosage)
let sansFont = SANS;
export const setSansFont = font => { sansFont = font; };
// (the font that draws ch, and its [x, advance] there)
const sansGlyph = (ch, font = sansFont) => isCJK(ch) ? [font, [0, CJK_ADVANCE]] : font.glyphs[ch] ? [font, font.glyphs[ch]] : [SANS, SANS.glyphs[ch] || SANS.glyphs["?"]];
export const sansWidth = (runs, font = sansFont) => runs.reduce((w, [s]) => [...s].reduce((a, ch) => a + sansGlyph(ch, font)[1][1], w), 0);
export function drawSans(ctx, runs, x, y, f, font = sansFont) {
  const top = y - (SANS.base - SANS.cap) * f;
  for (const [s, colour] of runs) {
    for (const ch of s) {
      if (isCJK(ch)) { drawCJK(ctx, ch, x, y, f, colour); x += CJK_ADVANCE * f; continue; }
      const [from, [gx, adv]] = sansGlyph(ch, font);
      ctx.drawImage(sansTint(from, colour), gx, 0, adv, SANS.h, x, top, adv * f, SANS.h * f);
      x += adv * f;
    }
  }
}
