import { retainCanvas } from "./render-health.js";
import { wrapChinese } from "./zh-layout.js";
// The title screen (v0.13, the user's pick of four, "C", 2026-10-26): what a journey starts on,
// before the world. The art (tools/title-art.png, 270 px a side) fills the screen behind it all, its
// ink a dark blue (`night`) and its orb the look's, hung from the wordmark: the orb just over it,
// `clear` CSS px from its backing, at `scale` CSS px an art pixel (a phone's `phoneScale`, a short
// phone's `shortScale`), darkened toward the edges and the bottom (`shade`), and its own top, left
// and right faded into the screen's dark (`edge`, a part of the art's size: less far in than the
// bottom's, the user's, 2026-10-26), so its square's edges never show. Under the orb "DOS", the
// logo's cross of four stat icons (24 x 36 px) and "AGE" in MEKZANTINE Mono (`words`: its letters'
// size, the gaps beside the logo and how far the letters sit up from its middle in logo pixels, the
// Figma "landing"'s), the logo `logo` font px a pixel (a phone's `phoneLogo`), on a dark backing.
// Under that what the card picked is (`says`, in a wrapped, centred paragraph on a backing; the
// day's affixes, and its class, for the Daily Challenge), and then the four cards (`cards`): each a
// v0.13 sheet's frame (blue1, its corners chipped), its icon (one of the logo's four, `icons`, on a
// block of the card's colour), its name and key, and two lines of its own (the Daily Challenge's: the
// day's affixes and class, then its weekday and how hard it is, `meter`, daily.js difficulty()). The
// one picked is framed `focus` on its look's `dim`. Every text is MEK Sans on one line, never wrapped
// (but the cards' last lines and the credit, Dosage, a step brighter than they were, and their first lines
// Dosage too in their own colours, and the version and when the next Daily comes: the user's, 2026-10-27)
// in a card and never cut: the cards are all as wide as the widest one's words, four in a row where
// they fit, else two by two (a phone's one to a row, its icon beside its first two lines, no keys).
// Over them at the top, the version beside the settings' gear (web/site.css) and when the next Daily
// Challenge comes (`pill`, a phone's the time alone); at the bottom the credit, "by MEK.txt & .TIFF",
// each name a link that lights up under the mouse, in the band Ko-fi's Support me (kofi.js) sits in
// at the bottom right (centred on a computer, at the left on a phone). Text is `f` CSS px a font px
// (a phone's `phoneF`), each a whole number of screen px, never a half step (it smears and looks
// bold, the user's, 2026-10-26); where it all doesn't fit the paragraph goes first, then the art gets
// smaller, then a phone's cards lose their last line, and then the text a step smaller.
//
// The look is the card picked's (`tones`): red for the Daily Challenge, green for competitive (the
// user's, 2026-10-18), gold for the leaderboard (#8a6f30, the user's, 2026-10-13), grey for about
// (the user's, 2026-10-14), its `orb` for the art's orb and glow, the wordmark and the logo's blocks.
// Picking another card (hovering it, or the arrows) changes it through the website's dither (Bayer
// 4x4, in `steps` steps of `stepMs`), dot for dot with the art's pixels.
//
// The orb glows (`glow`): out to `reach` of the art's px past its edge (`orb`: its middle and
// radius there) the background lights in a dither of the orb's colour (`near` of the way out)
// and then the ink's, thinning outward, and the ink of what's in it lights to the orb's at
// `onInk` of that; how much, between `lo` and `hi`, comes and goes every `periodMs`, in
// `levels` steps.
import { drawSans, sansWidth } from "./text.js";
import { DOSAGE } from "./sans.js";
import { loaded } from "./picture.js";
import { VERSION } from "./version.js";
import { AFFIXES, DIFFICULTY, difficulty, dayKey, msToNext, joinAffixes } from "./daily.js";
import { settings } from "./settings.js";
import { tl, language, english, pickedLanguage, setLanguage, languagePicks, languageName } from "./lang.js";   // (its words in the game's language: lang.js)

export const TITLE = { bg: "#071324",
  tones: { competitive: { ink: "#4b692f", orb: "#78c283", dim: "#323c39" }, daily: { ink: "#ac3232", orb: "#d95763", dim: "#45283c" },
    board: { ink: "#8a6f30", orb: "#d9a066", dim: "#3d3524" }, about: { ink: "#696a6a", orb: "#9badb7", dim: "#2f3238" } },
  night: "#253a56",
  art: { px: 270, ink: [172, 50, 50], orb: [217, 87, 99], scale: 4, phoneScale: 2.5, shortScale: 2, short: 620, clear: 16 },
  shade: { mid: 0.4, clear: 0.3, dark: 0.75, alpha: 0.85, foot: 0.08, footTo: 0.45, edge: { top: 0.2, side: 0.22 } },
  f: 2, phoneF: 1.5,
  side: 24, phoneSide: 16, top: 16,  // (CSS px in from the sides and the top; the gear's 16 in, web/site.css)
  words: { size: 34, track: 1.36, gap: 2.36, lift: 1.3, cap: 25 / 28, logo: 2, phoneLogo: 1.5,
    back: { x: 30, y: 10, phoneY: 6, alpha: 0.9, solid: 0.5 } },
  says: { w: 320, padX: 6, padY: 4, pitch: 15, above: 8, below: 12,
    competitive: ["Five days and nights. Score as high as you can for the leaderboard."],
    board: ["The best journeys, Daily and Competitive. Watch their replays."],
    about: ["What DOS-AGE is, how to play it, and who made it. Opens in a new tab."] },
  cards: [
    { tone: "daily", icon: "bolt", name: "Daily", key: "[1]" },
    { tone: "competitive", icon: "sword", name: "Competitive", key: "[2]", a: "5 days, 5 nights", b: "Climb the board" },
    { tone: "board", icon: "shield", name: "Leaderboard", key: "[3]", a: "Top journeys", b: "Watch replays" },
    { tone: "about", icon: "boot", name: "About", key: "[4]", a: "How to play", b: "Credits, contact" }],
  card: { pad: 8, gap: 4, rowGap: 6, phone: { padX: 7, padY: 6, gap: 3, rowGap: 5 }, shortPadY: 4, iconW: 18, iconH: 24, iconGap: 7, below: 10 },
  meter: { segW: 3, segH: 6, gap: 1, x: 5 },
  icons: { sword: [8, 0], shield: [0, 12], boot: [16, 12], bolt: [8, 24] },   // (in the logo, 8 by 12 px each)
  ink: { line: "#253a56", body: "rgba(7, 19, 36, 0.9)", focus: "#5b6ee1", focusAlpha: 0.92, text: "#cbdbfc", label: "#9badb7",
    key: "#d9a066", dim: "#847e87", lower: "#9badb7", version: "#9badb7", meterOff: "#253a56" },
  pill: { padX: 6, padY: 5, gap: 4, gearGap: 6 },
  // the language's pill by the version ([L] ES, a phone's the code alone, option D of the ones shown the
  // user, 2026-10-26): L or a press opens a list under it, each language in its own name and its code,
  // the one picked on green, the arrows' framed blue; Enter or a press picks, Esc or L shuts it
  lang: { gap: 6, rowPad: 4, padX: 6, codeGap: 12, picked: "#323c39", dot: "#37946e" },
  foot: { kofiIn: 40, phoneKofiIn: 24, kofiH: 36, ink: "#696a6a", name: "#cbdbfc", lit: "#ffffff",
    line: [[english("by ")], ["MEK.txt", "https://mektxt.com/"], [" & "], [".TIFF", "https://x.com/alexandratiff"]] },
  steps: 8, stepMs: 30,
  glow: { orb: [147.5, 155.5, 19], reach: 16, near: 0.35, fall: 1.6, onInk: 0.6, lo: 0.45, hi: 0.95, periodMs: 2600, levels: 6 },
};
const ROW_TONE = TITLE.cards.map(c => c.tone);   // each card's look
// (the credit's words translated, its names as they are)
const footLine = () => TITLE.foot.line.map(([s, url]) => [url ? s : tl(s), url]);
const TITLE_MODES_TONES = ["daily", "competitive"];   // (the looks that are a mode's)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const deviceStill = matchMedia("(prefers-reduced-motion: reduce)");
const still = { get matches() { return deviceStill.matches || settings.calm; } };   // (the device's, or the settings' Reduce Motion)
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

const sheet = new Image();
sheet.src = "assets/title.png";
let pixels = null;                 // the art's colours by pixel: 0 dark1, 1 ink, 2 orb (once it's loaded)
let lit = null;                    // the glow's pixels: [x, y, how far out (0-1), on ink?, the dither's threshold]
loaded(sheet).then(() => {
  const { px } = TITLE.art, c = document.createElement("canvas");
  c.width = c.height = px;
  const g = c.getContext("2d");
  g.drawImage(sheet, 0, 0);
  const d = g.getImageData(0, 0, px, px).data, { ink, orb } = TITLE.art;
  pixels = new Uint8Array(px * px);
  for (let i = 0; i < pixels.length; i++) {
    const r = d[4 * i], gr = d[4 * i + 1];
    pixels[i] = r === orb[0] && gr === orb[1] ? 2 : r === ink[0] && gr === ink[1] ? 1 : 0;
  }
  const G = TITLE.glow, [cx, cy, r] = G.orb;
  lit = [];
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    const out = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - r, p = pixels[y * px + x];
    if (out > 0 && out < G.reach && p !== 2) lit.push([x, y, out / G.reach, p === 1, (BAYER[(y % 4) * 4 + x % 4] + 0.5) / 16]);
  }
}).catch(() => {});
const fontOk = document.fonts?.load(`28px "MEKZANTINE Mono"`).catch(() => {});
let fontReady = false;
Promise.resolve(fontOk).then(() => { fontReady = true; });

// The art in a tone at a glow level (0 to `levels`), drawn once and kept: its ink `night`, its orb the tone's
const arts = new Map();
function artIn(tone, level) {
  const k = `${tone}:${level}`;
  if (arts.has(k)) return arts.get(k);
  const { px } = TITLE.art, G = TITLE.glow, T = TITLE.tones[tone];
  const cols = [rgb(TITLE.bg), rgb(TITLE.night), rgb(T.orb)], idx = Uint8Array.from(pixels);
  const strength = G.lo + (G.hi - G.lo) * level / G.levels;
  for (const [x, y, out, onInk, t] of lit) {
    const dens = strength * (1 - out) ** G.fall;
    if (onInk ? t < dens * G.onInk : t < dens) idx[y * px + x] = onInk || out < G.near ? 2 : 1;
  }
  const c = document.createElement("canvas");
  c.width = c.height = px;
  const g = c.getContext("2d"), img = g.createImageData(px, px);
  idx.forEach((v, i) => { img.data.set(cols[v], 4 * i); img.data[4 * i + 3] = 255; });
  g.putImageData(img, 0, 0);
  arts.set(k, retainCanvas(c, "title-arts"));
  return c;
}

// A piece of the logo (all of it, or one of its `icons`) with its blocks in a colour (the sheet's
// are grey, 155 173 183), made once
const logos = new Map();
function logoIn(ink, part = null) {
  const k = `${ink}:${part}`;
  if (logos.has(k)) return logos.get(k);
  const [sx, sy] = part ? TITLE.icons[part] : [0, 0], w = part ? 8 : 24, h = part ? 12 : 36;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.drawImage(sheet, TITLE.art.px + sx, sy, w, h, 0, 0, w, h);
  const img = g.getImageData(0, 0, w, h), d = img.data, col = rgb(ink);
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] && d[i] === 155 && d[i + 1] === 173) d.set(col, i);
  g.putImageData(img, 0, 0);
  logos.set(k, retainCanvas(c, "title-logos"));
  return c;
}

// The wordmark as the title has it ("DOS", the logo, "AGE"), onto g with its top left at x, y,
// `lp` px a logo px, all in `ink` (the score card's, see game.js SHARE); its width
export function drawWordmark(g, x, y, lp, ink) {
  const Wd = TITLE.words;
  g.font = `${Wd.size * lp}px "MEKZANTINE Mono"`;
  const sw = s => [...s].reduce((w, ch) => w + g.measureText(ch).width, 0) + (s.length - 1) * Wd.track * lp;
  const dosW = sw("DOS"), base = y + 18 * lp - Wd.lift * lp + Wd.cap * Wd.size * lp / 2;
  if (sheet.complete) g.drawImage(logoIn(ink), Math.round(x + dosW + Wd.gap * lp), y, 24 * lp, 36 * lp);
  if (fontReady) {
    g.fillStyle = ink;
    spaced(g, "DOS", x, base, Wd.size * lp, Wd.track * lp);
    spaced(g, "AGE", x + dosW + 2 * Wd.gap * lp + 24 * lp, base, Wd.size * lp, Wd.track * lp);
  }
  return dosW + sw("AGE") + 2 * Wd.gap * lp + 24 * lp;
}

// What's up: the card picked, the look, and the one it's changing from (and since when)
const state = { focus: 0, tone: "daily", mode: "daily", from: null, t0: 0, rows: [], cols: 4,
  day: null,                       // (the day's challenge as the Daily card shows it, see dayCard())
  links: [], hover: null,          // (the credit's links: [x, y, w, h, url] in canvas px; the one under the mouse)
  lang: null, langPill: null, langRows: [] };   // (the language list, while it's open: { focus }; the pill's and its rows' rects)
export const titleFocus = () => state.focus;
export const titleTone = () => state.tone;
// Picks card i, bringing its look in through the dither
export function focusTitle(i, now) {
  state.focus = i;
  const tone = ROW_TONE[i] ?? state.mode;
  if (TITLE_MODES_TONES.includes(tone)) state.mode = tone;
  if (tone === state.tone) return;
  state.from = still.matches ? null : state.tone;
  state.tone = tone;
  state.t0 = now;
}
// The card an arrow goes to from the one picked: left and right one along, up and down a row (or
// one along, all four in a row)
export function titleStep(dx, dy) {
  const n = TITLE.cards.length, step = dx || (state.cols < n ? dy * state.cols : dy);
  return (state.focus + step + n) % n;
}
// Which card's at a canvas point, or -1
export const titleRowAt = (px, py) => state.rows.findIndex(([x, y, w, h]) => px >= x && px < x + w && py >= y && py < y + h);
// The credit's link at a canvas point (its address), or null; and the one to light up (null: none)
export const titleLinkAt = (px, py) => state.links.find(([x, y, w, h]) => px >= x && px < x + w && py >= y && py < y + h)?.[4] ?? null;
export function hoverTitleLink(url) { state.hover = url; }
// The language's pill and list (see TITLE.lang): what's at a canvas point ("pill", a row's number,
// or null), whether it's open, and opening, stepping through, picking from and shutting it
const inRect = (r, px, py) => !!r && px >= r[0] && px < r[0] + r[2] && py >= r[1] && py < r[1] + r[3];
export function titleLangAt(px, py) {
  if (inRect(state.langPill, px, py)) return "pill";
  const i = state.lang ? state.langRows.findIndex(r => inRect(r, px, py)) : -1;
  return i >= 0 ? i : null;
}
export const titleLangOpen = () => !!state.lang;
export function toggleTitleLang() { state.lang = state.lang ? null : { focus: Math.max(0, languagePicks().indexOf(pickedLanguage())) }; }
export function stepTitleLang(dy) { const n = languagePicks().length; if (state.lang) state.lang.focus = (state.lang.focus + dy + n) % n; }
export function focusTitleLang(i) { if (state.lang) state.lang.focus = i; }
export function pickTitleLang(i = state.lang?.focus) {
  if (i !== undefined) setLanguage(languagePicks()[i]);
  state.lang = null;
}
const langCode = () => language().split("-")[0].toUpperCase();

// The day's challenge as the Daily card shows it (game.js gives the getter: daily.js's challenge
// with `clsName`, its class's): { today, a (its affixes and class), b (its day: its weekday, or "Weekend"), level, says
// (what each affix does, and the class everyone plays) }, worked out again when the day changes
let getChallenge = null;
export function setTitleChallenge(fn) { getChallenge = fn; state.day = null; }
function dayCard() {
  if (!getChallenge) return null;
  const today = dayKey(), lang = language();
  if (state.day?.today === today && state.day.lang === lang) return state.day;
  const c = getChallenge();
  const a = [joinAffixes(c.affixes.map(id => tl(AFFIXES[id].name)), " & "), c.cls ? c.clsName : ""].filter(Boolean).join(" ");
  const says = [...c.affixes.map(id => tl(AFFIXES[id].says)), ...(c.cls ? [tl("Everyone plays the {cls}.", { cls: c.clsName })] : [])];
  return (state.day = { today, lang, a, b: tl(c.day), level: difficulty(c), says });
}
// A card's two lines (the Daily's from the day's challenge)
const cardLines = (card, day) => card.tone === "daily" ? (day ? [day.a, day.b] : [tl("Daily Challenge"), ""]) : [tl(card.a), tl(card.b)];
const untilNext = () => { const ms = msToNext(); return tl("{h}h {m}m", { h: Math.floor(ms / 36e5), m: Math.floor(ms % 36e5 / 6e4) }); };

// Splits text into lines no wider than `w` screen px at `k` screen px a font px, between words
function wrap(text, w, k) {
  if (/[\u2e80-\u9fff]/u.test(text)) return wrapChinese(text, t => sansWidth([[t]]) * k, w);
  const lines = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const line = lines.at(-1), longer = line && `${line} ${word}`;
    if (line && sansWidth([[longer]]) * k <= w) lines[lines.length - 1] = longer;
    else lines.push(word);
  }
  return lines;
}

// Where everything goes, in canvas px, for the text at `k` screen px a font px (see layout())
function fit(g, W, H, dpr, phone, k, opts, day) {
  const u = n => Math.round(n * k), C = TITLE.card, P = phone ? C.phone : null, M = TITLE.meter;
  const side = Math.round((phone ? TITLE.phoneSide : TITLE.side) * dpr), tw = s => sansWidth([[s]]) * k;
  const capH = u(SANS_CAP);
  // the top: the gear (the page's, web/site.css), the version beside it, and the countdown at the right
  const gear = pageBox("gear", dpr), top = Math.round(TITLE.top * dpr), Pi = TITLE.pill;
  const pillText = [...(phone ? [] : [[tl("Next daily in"), TITLE.ink.label]]), [untilNext(), TITLE.tones.daily.orb]];
  const td = s => sansWidth([[s]], DOSAGE) * k;
  const pillW = u(2 * Pi.padX) + pillText.reduce((w, run) => w + td(run[0]), 0) + (pillText.length - 1) * u(Pi.gap), pillH = u(2 * Pi.padY) + capH;
  const barMid = gear ? gear.y + gear.h / 2 : top + pillH / 2;
  const pill = { x: W - side - pillW, y: Math.round(barMid - pillH / 2), w: pillW, h: pillH, phone };
  const version = { x: gear ? Math.round(gear.x + gear.w + u(Pi.gearGap)) : side, y: Math.round(barMid - capH / 2) };
  const langText = [...(phone ? [] : [["[", TITLE.ink.dim], ["L", TITLE.ink.key], ["]", TITLE.ink.dim]]), [langCode(), TITLE.ink.text]];
  const langW = u(2 * Pi.padX) + langText.reduce((w, run) => w + tw(run[0]), 0) + (phone ? 0 : u(Pi.gap));
  const langPill = { x: version.x + td(VERSION) + u(TITLE.lang.gap), y: pill.y, w: langW, h: pillH, text: langText };
  const barBottom = Math.max(pill.y + pill.h, gear ? gear.y + gear.h : 0);
  // the cards: each as wide as the widest one's words
  const padX = u(P ? P.padX : C.pad), padY = u(opts.noB ? C.shortPadY : P ? P.padY : C.pad), rowGap = u(P ? P.rowGap : C.rowGap);
  const meterW = u(DIFFICULTY.most * (M.segW + M.gap) - M.gap);
  const inner = Math.max(...TITLE.cards.map(card => {
    const [a, b] = cardLines(card, day), ta = sansWidth([[a]], DOSAGE) * k, bw = sansWidth([[b]], DOSAGE) * k + (card.tone === "daily" && day ? u(M.x) + meterW : 0);
    const head = u(C.iconW + C.iconGap) + (phone ? Math.max(tw(tl(card.name)), ta) : tw(tl(card.name)) + u(C.iconGap) + tw(card.key));
    return Math.max(head, phone ? 0 : ta, opts.noB ? 0 : bw);
  }));
  const avail = W - 2 * side, gap = u(P ? P.gap : C.gap);
  let cardW = inner + 2 * padX, cols = 1;
  if (phone) cardW = Math.max(cardW, avail);
  else cols = [4, 2, 1].find(n => n * cardW + (n - 1) * gap <= avail) ?? 1;
  const cardH = phone ? 2 * padY + u(C.iconH) + (opts.noB ? 0 : rowGap + capH) : 2 * padY + u(C.iconH) + 2 * (rowGap + capH);
  const rows = Math.ceil(TITLE.cards.length / cols), tilesW = cols * cardW + (cols - 1) * gap, tilesH = rows * cardH + (rows - 1) * gap;
  // the bottom band, Ko-fi's and the credit's (the credit on a line of its own over it where Ko-fi
  // would cover it), and the cards over that
  const F = TITLE.foot, band = Math.round(((phone ? F.phoneKofiIn : F.kofiIn) + F.kofiH) * dpr), kofi = pageBox("kofi", dpr);
  const creditW = sansWidth(footLine(), DOSAGE) * k, creditX = phone ? side : Math.round((W - creditW) / 2);
  const over = kofi && creditX + creditW + u(8) > kofi.x ? capH + u(C.below) : 0;
  const tilesY = H - band - over - u(C.below) - tilesH, tilesX = Math.round((W - tilesW) / 2);
  const cards = TITLE.cards.map((_, i) => ({ x: tilesX + (i % cols) * (cardW + gap), y: tilesY + Math.floor(i / cols) * (cardH + gap), w: cardW, h: cardH }));
  const foot = over ? { x: Math.round((W - creditW) / 2), y: H - band - over }
    : { x: creditX, y: Math.round(H - (phone ? F.phoneKofiIn : F.kofiIn) * dpr - F.kofiH * dpr / 2 - capH / 2) };
  // what the card picked is, over the cards, in room for the longest of them (so nothing above it
  // moves as another card's picked, the user's, 2026-10-26), at the top of that room
  const S = TITLE.says;
  let says = null, above = tilesY;
  if (opts.says) {
    const w = Math.min(phone ? tilesW : u(S.w), avail) - u(2 * S.padX);
    const linesOf = tone => (tone === "daily" ? day?.says ?? [] : S[tone]).flatMap(t => wrap(tl(t), w, k));
    const tall = n => (n - 1) * u(S.pitch) + capH + u(2 * S.padY);
    const lines = linesOf(TITLE.cards[state.focus].tone), room = tall(Math.max(1, ...TITLE.cards.map(c => linesOf(c.tone).length)));
    says = { lines, y: tilesY - u(S.below) - room, h: tall(lines.length) };
    above = says.y - u(S.above);
  } else above = tilesY - u(S.below + S.above);
  // the wordmark, as big as fits across
  const Wd = TITLE.words;
  let lp = Math.max(1, Math.round(k * (phone ? Wd.phoneLogo : Wd.logo))), wordW = 0, dosW = 0;
  for (; ; lp--) {
    g.font = `${Wd.size * lp}px "MEKZANTINE Mono"`;
    const sw = s => [...s].reduce((x, ch) => x + g.measureText(ch).width, 0) + (s.length - 1) * Wd.track * lp;
    dosW = sw("DOS");
    wordW = dosW + sw("AGE") + 2 * Wd.gap * lp + 24 * lp;
    if (wordW <= avail || lp === 1) break;
  }
  const backY = u(phone ? Wd.back.phoneY : Wd.back.y);
  const wordY = Math.round(above - backY - 36 * lp), wordX = Math.round((W - wordW) / 2);
  const word = { x: wordX, y: wordY, w: wordW, lp, dosW, backY };
  // the art, its orb just over the wordmark's backing
  const A = TITLE.art, a = opts.art, [ox, oy, or] = TITLE.glow.orb;
  const orbY = wordY - backY - Math.round(A.clear * dpr) - or * a;
  const art = { x: Math.round(W / 2 - ox * a), y: Math.round(orbY - oy * a), a, orbY };
  const fits = orbY - or * a >= barBottom + u(8) && tilesW <= avail && pill.x >= langPill.x + langPill.w + u(8);
  return { k, u, phone, cards, cols, cardW, cardH, padX, padY, rowGap, capH, tilesW, tilesY, says, word, art, pill, pillText, version, langPill, foot, fits, noB: opts.noB };
}
const SANS_CAP = 9;               // (MEK Sans's capitals, font px tall: a line's height)

// Where one of the page's own things is over the canvas, in canvas px, or null where it's not
// shown (looked at twice a second): the settings gear (web/site.css), Ko-fi's button (kofi.js)
const PAGE = { gear: "body[data-game-only] .header .mute",
  kofi: "#kofi:not([hidden]) .floatingchat-container-wrap, #kofi:not([hidden]) .floatingchat-container-wrap-mobi" };
const pageAt = new Map();
function pageBox(what, dpr) {
  const now = performance.now(), seen = pageAt.get(what);
  if (seen && now - seen.t < 500) return seen.box;
  const canvas = document.querySelector("canvas")?.getBoundingClientRect();
  const r = [...document.querySelectorAll(PAGE[what])].map(el => el.getBoundingClientRect()).find(r => r.width && r.height);
  const box = r ? { x: (r.left - (canvas?.left ?? 0)) * dpr, y: (r.top - (canvas?.top ?? 0)) * dpr, w: r.width * dpr, h: r.height * dpr } : null;
  pageAt.set(what, { t: now, box });
  return box;
}

// The layout that fits: the paragraph first to go, then the art smaller, then a phone's cards'
// last lines, then the text a step smaller (never under 1 screen px a font px)
function layout(g, W, H, dpr, phone) {
  const A = TITLE.art, short = phone && H / dpr < A.short, day = dayCard();
  const big = Math.max(1, Math.round((short ? A.shortScale : phone ? A.phoneScale : A.scale) * dpr)), small = Math.max(1, Math.round(A.shortScale * dpr));
  const tries = [{ says: true, art: big }, { says: false, art: big }, { says: false, art: small }, ...(phone ? [{ says: false, art: small, noB: true }] : [])];
  let L = null;
  for (let k = Math.max(1, Math.round((phone ? TITLE.phoneF : TITLE.f) * dpr)); k >= 1; k--) {
    for (const opts of short ? tries.slice(1) : tries) {
      L = fit(g, W, H, dpr, phone, k, opts, day);
      if (L.fits) return { ...L, day };
    }
  }
  return { ...L, day };
}

// A v0.13 sheet's frame (its corners chipped) on its body
function frame(g, x, y, w, h, u1, line, body) {
  g.fillStyle = body;
  g.fillRect(x + u1, y, w - 2 * u1, h);
  g.fillRect(x, y + u1, u1, h - 2 * u1);
  g.fillRect(x + w - u1, y + u1, u1, h - 2 * u1);
  g.fillStyle = line;
  g.fillRect(x + u1, y, w - 2 * u1, u1);
  g.fillRect(x + u1, y + h - u1, w - 2 * u1, u1);
  g.fillRect(x, y + u1, u1, h - 2 * u1);
  g.fillRect(x + w - u1, y + u1, u1, h - 2 * u1);
}
const alpha = (hex, a) => `rgba(${rgb(hex).join(", ")}, ${a})`;

// Text in MEKZANTINE Mono, `size` px with `track` between letters, its baseline at y
function spaced(g, text, x, y, size, track) {
  g.font = `${size}px "MEKZANTINE Mono"`;
  for (const ch of text) {
    g.fillText(ch, Math.round(x), Math.round(y));
    x += g.measureText(ch).width + track;
  }
  return x;
}

// The whole screen in a tone, onto g
function paint(g, tone, L, level, W, H) {
  const T = TITLE.tones[tone], { k, u } = L, I = TITLE.ink, u1 = u(1), S = TITLE.shade;
  g.imageSmoothingEnabled = false;
  // the art, darkened to the edges and the bottom
  const Ar = L.art;
  if (pixels) g.drawImage(artIn(tone, level), Ar.x, Ar.y, TITLE.art.px * Ar.a, TITLE.art.px * Ar.a);
  // (its top, left and right faded out, eased so no line shows where a fade ends)
  const side = TITLE.art.px * Ar.a, fade = (x0, y0, x1, y1, rect) => {
    const eg = g.createLinearGradient(x0, y0, x1, y1);
    for (let i = 0; i <= 8; i++) eg.addColorStop(i / 8, alpha(TITLE.bg, (1 - i / 8) ** 2));
    g.fillStyle = eg;
    g.fillRect(...rect);
  };
  const top = side * S.edge.top, sw = side * S.edge.side;
  fade(0, Ar.y, 0, Ar.y + top, [0, Ar.y, W, top]);
  fade(Ar.x, 0, Ar.x + sw, 0, [Ar.x, 0, sw, H]);
  fade(Ar.x + side, 0, Ar.x + side - sw, 0, [Ar.x + side - sw, 0, sw, H]);
  const r = Math.hypot(W, H) / 2, vg = g.createRadialGradient(W / 2, H * S.mid, 0, W / 2, H * S.mid, r);
  vg.addColorStop(S.clear, alpha(TITLE.bg, 0));
  vg.addColorStop(S.dark, alpha(TITLE.bg, S.alpha));
  vg.addColorStop(1, alpha(TITLE.bg, S.alpha));
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
  const fg = g.createLinearGradient(0, H, 0, H * (1 - S.footTo));
  fg.addColorStop(0, TITLE.bg);
  fg.addColorStop(S.foot / S.footTo, TITLE.bg);
  fg.addColorStop(1, alpha(TITLE.bg, 0));
  g.fillStyle = fg;
  g.fillRect(0, H * (1 - S.footTo), W, H * S.footTo);
  // the wordmark on its backing
  const Wd = TITLE.words, wd = L.word, lp = wd.lp, B = Wd.back;
  const rx = wd.w / 2 + u(B.x), ry = 18 * lp + wd.backY, cx = W / 2, cy = wd.y + 18 * lp;
  g.save();
  g.translate(cx, cy);
  g.scale(1, ry / rx);
  const bg = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  bg.addColorStop(0, alpha(TITLE.bg, B.alpha));
  bg.addColorStop(B.solid, alpha(TITLE.bg, B.alpha));
  bg.addColorStop(1, alpha(TITLE.bg, 0));
  g.fillStyle = bg;
  g.fillRect(-rx, -rx, 2 * rx, 2 * rx);
  g.restore();
  if (sheet.complete) g.drawImage(logoIn(T.orb), Math.round(wd.x + wd.dosW + Wd.gap * lp), wd.y, 24 * lp, 36 * lp);
  if (fontReady) {
    g.fillStyle = T.orb;
    const base = wd.y + 18 * lp - Wd.lift * lp + Wd.cap * Wd.size * lp / 2;
    spaced(g, "DOS", wd.x, base, Wd.size * lp, Wd.track * lp);
    spaced(g, "AGE", wd.x + wd.dosW + 2 * Wd.gap * lp + 24 * lp, base, Wd.size * lp, Wd.track * lp);
  }
  // the top: the version, the language's pill, and when the next Daily Challenge comes
  drawSans(g, [[VERSION, I.version]], L.version.x, L.version.y, k, DOSAGE);
  const Pi = TITLE.pill, pl = L.pill, lg = L.langPill;
  frame(g, lg.x, lg.y, lg.w, lg.h, u1, state.lang ? I.focus : I.line, I.body);
  let gx = lg.x + u(Pi.padX);
  lg.text.forEach(([s, ink], i) => { drawSans(g, [[s, ink]], gx, lg.y + u(Pi.padY), k); gx += sansWidth([[s]]) * k + (i === 2 ? u(Pi.gap) : 0); });
  frame(g, pl.x, pl.y, pl.w, pl.h, u1, I.line, I.body);
  let px = pl.x + u(Pi.padX);
  for (const [s, ink] of L.pillText) {
    drawSans(g, [[s, ink]], px, pl.y + u(Pi.padY), k, DOSAGE);
    px += sansWidth([[s]], DOSAGE) * k + u(Pi.gap);
  }
  // what the card picked is
  if (L.says?.lines.length) {
    const Sa = TITLE.says, w = Math.max(...L.says.lines.map(s => sansWidth([[s]]) * k)) + u(2 * Sa.padX);
    g.fillStyle = I.body;
    g.fillRect(Math.round((W - w) / 2), L.says.y, w, L.says.h);
    L.says.lines.forEach((s, i) => drawSans(g, [[s, I.label]], Math.round((W - sansWidth([[s]]) * k) / 2), L.says.y + u(Sa.padY) + i * u(Sa.pitch), k));
  }
  // the cards
  const C = TITLE.card, M = TITLE.meter;
  TITLE.cards.forEach((card, i) => {
    const { x, y, w, h } = L.cards[i], CT = TITLE.tones[card.tone], on = i === state.focus;
    frame(g, x, y, w, h, u1, on ? I.focus : I.line, on ? alpha(CT.dim, I.focusAlpha) : I.body);
    const x0 = x + L.padX, y0 = y + L.padY, [a, b] = cardLines(card, L.day);
    g.fillStyle = CT.orb;
    g.fillRect(x0, y0, u(C.iconW), u(C.iconH));
    if (sheet.complete) g.drawImage(logoIn(CT.orb, card.icon), x0 + Math.round((u(C.iconW) - 16 * k) / 2), y0 + Math.round((u(C.iconH) - 24 * k) / 2), 16 * k, 24 * k);
    const tx = x0 + u(C.iconW + C.iconGap), aInk = CT.orb;
    let by;
    if (L.phone) {                 // (its name and first line beside the icon, its last under them)
      drawSans(g, [[tl(card.name), I.text]], tx, y0, k);
      drawSans(g, [[a, aInk]], tx, y0 + u(C.iconH) - L.capH, k, DOSAGE);
      by = y0 + u(C.iconH) + L.rowGap;
    } else {
      drawSans(g, [[tl(card.name), I.text]], tx, y0 + Math.round((u(C.iconH) - L.capH) / 2), k);
      drawSans(g, [[card.key, I.key]], x + w - L.padX - sansWidth([[card.key]]) * k, y0 + Math.round((u(C.iconH) - L.capH) / 2), k);
      drawSans(g, [[a, aInk]], x0, y0 + u(C.iconH) + L.rowGap, k, DOSAGE);
      by = y0 + u(C.iconH) + 2 * L.rowGap + L.capH;
    }
    if (L.noB) return;
    drawSans(g, [[b, I.lower]], x0, by, k, DOSAGE);
    if (card.tone === "daily" && L.day) {   // (how hard the day is, lit from the left)
      const mx = x0 + sansWidth([[b]], DOSAGE) * k + u(M.x), my = by + Math.round((L.capH - u(M.segH)) / 2);
      for (let s = 0; s < DIFFICULTY.most; s++) {
        g.fillStyle = s < L.day.level ? CT.orb : I.meterOff;
        g.fillRect(mx + s * u(M.segW + M.gap), my, u(M.segW), u(M.segH));
      }
    }
  });
  // the credit, centred in Ko-fi's band (a phone's at the left), or over it
  const Fo = TITLE.foot;
  let lx = L.foot.x;
  state.links = [];
  for (const [s, url] of footLine()) {
    const w = sansWidth([[s]], DOSAGE) * k;
    drawSans(g, [[s, url ? (url === state.hover ? Fo.lit : Fo.name) : Fo.ink]], lx, L.foot.y, k, DOSAGE);
    if (url) state.links.push([lx, L.foot.y - u(4), w, L.capH + u(8), url]);
    lx += w;
  }
}

// The dither's masks, one per step, in dots of `dot` screen px, made as they're first needed
const masks = new Map();
function mask(g, k, dot) {
  const key = `${k}:${dot}`;
  if (!masks.has(key)) {
    const tile = document.createElement("canvas");
    tile.width = tile.height = 4 * dot;
    const t = tile.getContext("2d");
    t.fillStyle = "#000";
    BAYER.forEach((b, i) => { if ((b + 0.5) / 16 < k / TITLE.steps) t.fillRect((i % 4) * dot, Math.floor(i / 4) * dot, dot, dot); });
    masks.set(key, retainCanvas(tile, "title-masks"));
  }
  return g.createPattern(masks.get(key), "repeat");
}
let layer = null;                  // the look coming in, drawn here and masked, while it's changing

// Draws the title screen over the whole canvas (dark1 under it is the caller's)
export function drawTitle(ctx, now, dpr, phone) {
  const W = ctx.canvas.width, H = ctx.canvas.height, L = layout(ctx, W, H, dpr, !!phone), G = TITLE.glow;
  state.cols = L.cols;
  const wave = 0.5 - 0.5 * Math.cos(2 * Math.PI * now / G.periodMs);
  const level = still.matches ? G.levels : Math.round(wave * G.levels);
  const k = state.from ? Math.floor((now - state.t0) / TITLE.stepMs) : TITLE.steps;
  if (k >= TITLE.steps) state.from = null;
  if (!state.from) paint(ctx, state.tone, L, level, W, H);
  else {
    paint(ctx, state.from, L, level, W, H);
    layer ??= document.createElement("canvas");
    if (layer.width !== W || layer.height !== H) Object.assign(layer, { width: W, height: H });
    const g = layer.getContext("2d");
    g.globalCompositeOperation = "source-over";
    g.clearRect(0, 0, W, H);
    paint(g, state.tone, L, level, W, H);
    const pat = mask(g, Math.max(0, k), L.art.a);
    pat.setTransform(new DOMMatrix().translate(L.art.x, L.art.y));   // (dot for dot with the art's pixels)
    g.globalCompositeOperation = "destination-in";
    g.fillStyle = pat;
    g.fillRect(0, 0, W, H);
    ctx.drawImage(layer, 0, 0);
  }
  state.rows = L.cards.map(({ x, y, w, h }) => [x, y, w, h]);   // (each card's a button)
  state.langPill = [L.langPill.x, L.langPill.y, L.langPill.w, L.langPill.h];
  drawLangList(ctx, L);
}
// The language list, open, under its pill (see TITLE.lang)
function drawLangList(g, L) {
  state.langRows = [];
  if (!state.lang) return;
  const { k, u } = L, I = TITLE.ink, Lg = TITLE.lang, picks = languagePicks(), u1 = u(1);
  const codeOf = c => (c === "auto" ? "" : c.split("-")[0].toUpperCase()), nameW = Math.max(...picks.map(c => sansWidth([[languageName(c)]]) * k));
  const rowH = L.capH + u(2 * Lg.rowPad), w = nameW + u(Lg.codeGap) + sansWidth([["MM"]]) * k + u(2 * Lg.padX) + 2 * u1, h = picks.length * rowH + 2 * u1 + u(2);
  const x = L.langPill.x, y = L.langPill.y + L.langPill.h + u(3);
  frame(g, x, y, w, h, u1, I.focus, "rgba(7, 19, 36, 0.97)");
  picks.forEach((c, i) => {
    const rx = x + u1 + u(1), ry = y + u1 + u(1) + i * rowH, rw = w - 2 * u1 - u(2), on = c === pickedLanguage(), at = i === state.lang.focus;
    if (on) { g.fillStyle = Lg.picked; g.fillRect(rx, ry, rw, rowH); }
    if (at) { g.fillStyle = I.focus; g.fillRect(rx, ry, rw, u1); g.fillRect(rx, ry + rowH - u1, rw, u1); g.fillRect(rx, ry, u1, rowH); g.fillRect(rx + rw - u1, ry, u1, rowH); }
    drawSans(g, [[languageName(c), on || at ? I.text : I.label]], rx + u(Lg.padX - 1), ry + u(Lg.rowPad), k);
    const code = [[codeOf(c), on ? Lg.dot : I.dim]];
    drawSans(g, code, rx + rw - u(Lg.padX - 1) - sansWidth(code) * k, ry + u(Lg.rowPad), k);
    state.langRows[i] = [rx, ry, rw, rowH];
  });
}

// Behind the classes' panel when it's brought up from here ("class-choice", 634:219065, the
// user's, 2026-10-14): a picture of its own (`CLASS_ART`, assets/class-art.png, 270 px a side
// in three colours: dark1, `ink`, `lit`) in the look of the group of the class picked, at `alpha`
// over dark1, filling the screen and centred, its edges cut off as they must be (the mock's
// desktop and phone alike); at 2x and over each of its pixels takes a whole number of screen px.
// Picking a class of another group changes it through the title's dither, pixel for pixel.
export const CLASS_ART = { px: 270, alpha: 0.35,
  groups: { melee: { ink: "#ac3232", lit: "#d95763" }, ranged: { ink: "#3f3f74", lit: "#639bff" },
    allround: { ink: "#524b24", lit: "#78c283" }, special: { ink: "#595652", lit: "#cbdbfc" } } };
const classSheet = new Image();
classSheet.src = "assets/class-art.png";
let classPixels = null;            // the picture's colours by pixel: 0 dark1, 1 ink, 2 lit (once it's loaded)
loaded(classSheet).then(() => {
  const { px } = CLASS_ART, c = document.createElement("canvas");
  c.width = c.height = px;
  const g = c.getContext("2d");
  g.drawImage(classSheet, 0, 0);
  const d = g.getImageData(0, 0, px, px).data;
  classPixels = new Uint8Array(px * px).map((_, i) => d[4 * i] === 217 ? 2 : d[4 * i] === 172 ? 1 : 0);
}).catch(() => {});
// A group's picture, its pixels as they're drawn (`data`) and on a canvas, made once
const classArts = new Map();
function classArtIn(group) {
  if (classArts.has(group)) return classArts.get(group);
  const { px, alpha } = CLASS_ART, G = CLASS_ART.groups[group];
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), bg = rgb(TITLE.bg);
  const cols = [bg, rgb(G.ink), rgb(G.lit)].map(c => c.map((v, i) => Math.round(bg[i] + (v - bg[i]) * alpha)));
  const c = document.createElement("canvas");
  c.width = c.height = px;
  const g = c.getContext("2d"), img = g.createImageData(px, px);
  classPixels.forEach((v, i) => { img.data.set(cols[v], 4 * i); img.data[4 * i + 3] = 255; });
  g.putImageData(img, 0, 0);
  const art = { canvas: retainCanvas(c, "class-art"), data: img.data };
  classArts.set(group, art);
  return art;
}
// ...and at full strength, for the classes' panel's portrait (game.js drawClasses()), or null till it's loaded
const classPictures = new Map();
export function classPicture(group) {
  if (!classPixels || !CLASS_ART.groups[group]) return null;
  if (classPictures.has(group)) return classPictures.get(group);
  const { px } = CLASS_ART, G = CLASS_ART.groups[group];
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), cols = [rgb(TITLE.bg), rgb(G.ink), rgb(G.lit)];
  const c = document.createElement("canvas");
  c.width = c.height = px;
  const g = c.getContext("2d"), img = g.createImageData(px, px);
  classPixels.forEach((v, i) => { img.data.set(cols[v], 4 * i); img.data[4 * i + 3] = 255; });
  g.putImageData(img, 0, 0);
  classPictures.set(group, retainCanvas(c, "title-classPictures"));
  return c;
}
const shift = { group: null, from: null, t0: 0, last: -Infinity, mix: null };   // (the look, the one it's changing from, since when)
// Draws it for `group` over the whole canvas (dark1 under it is the caller's)
export function drawClassArt(ctx, group, now) {
  if (!classPixels || !CLASS_ART.groups[group]) return;
  if (now - shift.last > 200) shift.group = null;   // (brought up afresh: no change to show)
  shift.last = now;
  if (group !== shift.group) Object.assign(shift, { from: shift.group && !still.matches ? shift.group : null, group, t0: now });
  const k = shift.from ? Math.floor((now - shift.t0) / TITLE.stepMs) : TITLE.steps;
  if (k >= TITLE.steps) shift.from = null;
  let pic = classArtIn(group).canvas;
  if (shift.from) {                // (the new look's pixels where the dither's reached, the old one's elsewhere)
    const { px } = CLASS_ART, a = classArtIn(shift.from).data, b = classArtIn(group).data;
    if (!shift.mix) {
      shift.mix = document.createElement("canvas");
      shift.mix.width = shift.mix.height = px;
    }
    const g = shift.mix.getContext("2d"), img = g.createImageData(px, px);
    for (let i = 0; i < px * px; i++) {
      const on = (BAYER[(Math.floor(i / px) % 4) * 4 + i % 4] + 0.5) / 16 < Math.max(0, k) / TITLE.steps;
      img.data.set((on ? b : a).subarray(4 * i, 4 * i + 4), 4 * i);
    }
    g.putImageData(img, 0, 0);
    pic = shift.mix;
  }
  const W = ctx.canvas.width, H = ctx.canvas.height, { px } = CLASS_ART;
  let s = Math.max(W, H) / px;
  if (s >= 2) s = Math.ceil(s);
  const size = Math.round(px * s);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(pic, Math.round((W - size) / 2), Math.round((H - size) / 2), size, size);
}
