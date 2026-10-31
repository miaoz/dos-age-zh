import { wrapChinese, chineseTokens } from "./zh-layout.js";
import { SCENE } from "./scene.js";
import { stepPose, STEP_ANIM_MS, SLIDE } from "./motion.js";
import { makeWorld, makeRoom, makeShed, makeChurch, DEMON_AWAY } from "./world.js";
import { makeCave } from "./cave.js";
import { fogAtlases, redAtlases, flashAtlas, fogStep, fogDistance, FOG_STEPS, FOG_END } from "./fog.js";
import { fieldOfView } from "./sight.js";
import { createCrt } from "./crt.js";
import { footstep, chop, hit, whiff, loot, wail, pickUp, creak, thud, clasp, freeze, thunder, heartbeat, chant, night, onBeat, toggleMute, isMuted,
  levelUp, toll, endOfDays, morningBell, nightFalls, rareFind, dig, crystalHit, screech, twang, thunk, hammer, lunge, enthral, orbDrop, reaper,
  siphon, ward, stoneskin, rage, adrenaline, sneak, howl, roar, omen, alarm, feast, anvil, hammerWhispers, tape, tock, click, ping, surroundings, titleTune,
  SOUND_TEST } from "./sound.js";
import { ITEMS, RELIC_IDS, roll, drop, potion, setLuck, lootTier, lootOdds, variantOf } from "./items.js";
import { SKILLS, rollSkill } from "./skills.js";
import { fontReady, textWidth, drawText, sansReady, sansWidth, drawSans, setSansFont } from "./text.js";
import { SANS, DOSAGE } from "./sans.js";
import { loaded as pictureLoaded } from "./picture.js";
import { random, seedDice, diceDrawn, shuffled } from "./dice.js";
import { AFFIXES, challenge, dayKey, msToNext, isKey, seedOf, joinAffixes } from "./daily.js";
import { TITLE, drawTitle, focusTitle, titleFocus, titleStep, titleRowAt, titleLinkAt, hoverTitleLink, drawClassArt, classPicture, setTitleChallenge,
  titleLangAt, titleLangOpen, toggleTitleLang, stepTitleLang, focusTitleLang, pickTitleLang, drawWordmark } from "./title.js";
import { showKofi } from "./kofi.js";
import { settings, setSetting, resetSettings, onSettings, moveKeys, MOVES } from "./settings.js";
import { VERSION } from "./version.js";   // (its own scoreboard, see version.js)
import { tl, tr, noun, nameOf, english, language, pickedLanguage, setLanguage, languagePicks, languageName } from "./lang.js";   // (the game in other languages: what's shown and said, never what happens)


// Journeys watched again (replays): each journey's kept as it's played, so the board's best can
// be watched from the leaderboard. Every roll that matters comes off the dice (dice.js), seeded
// by the journey's `seed`; what the player does goes through act(), which notes it with when it
// was done, and so does whatever happens on its own between turns at the pace the screen's drawn
// (a bolt's flight, a fire burning out, the forest laid out further as it comes into view, a
// level's rewards coming up) and what came from the board (its ghosts). Watching does all of it
// again, in the same order, at the same moments by the game's own clock (clock()).
// A journey's record is { v, seed, t0, q, e, k }: `v` the game it was played on (BUILD, a hash of
// its code: any change to the game and the journeys before it can't be watched any more), `t0`
// the clock as it started, `q` the address's options that change a journey, `e` what was done
// ([ms since the one before, its code in ACTIONS, what it was given...]), and `k` a check every
// `checkEvery` turns (see checkJourney()), so one that's gone out of step says so. It's sent with
// the score (see sendScore()) when it's no bigger than `maxBytes` (and no more than `maxEvents`
// were noted), and the board keeps it while the journey's in its top 30 (worker/scores.js).
// Watching, [Space] or P pauses, 1-4 picks the speed (`speeds`, `speed` to start), and a wait of more
// than `idleMs` of the journey's time between two things is cut that short. On a local server
// each journey's record is kept in the browser too, and "?watch=last" watches it.
const REPLAY = { checkEvery: 25, maxBytes: 900000, maxEvents: 120000, speeds: [1, 2, 4, 8], speed: 2, idleMs: 1200 };
const query = new URLSearchParams(location.search);
// (the body text's font: the panels' paragraphs and descriptions in Dosage, the rest (the log and
// chat too, the user's) in MEK Sans (2026-10-27); ?sans for MEK Sans everywhere, as before, and
// ?dosage for Dosage everywhere, to see how it would look)
const BODY = query.has("sans") ? SANS : DOSAGE;
if (query.has("dosage")) setSansFont(DOSAGE);
// Checking a journey on the board (the dashboard's Leaderboard tab, stats.html: "?verify=<id>",
// Claude's design, 2026-10-18): it's watched with nothing drawn between, `chunk` of its record's
// events at a time, and once they're all done again, what's found is told to the page that opened
// it (window.opener, as { verify: id, ok, notes, score, sent, turns }): `ok` false if it went out
// of step, its record ended before the journey did, or it came to another score than it was sent
// with; it was played with the options only for trying things out (`trying`, as worker/scores.js
// REPLAYS.trying); a Daily Challenge's isn't on its day's seed; it went quicker than `minTurnMs`
// a turn on the whole; or its presses (`press`: ms from one step to the next, longer than a key
// held walks, STEP_MS) were more even than a hand's (their spread over their mean under `evenCv`,
// over `evenOf` of them at least). `ok` is null if it couldn't be watched at all (an older game's).
const VERIFY = { chunk: 2000, minTurnMs: 40, press: [250, 5000], evenCv: 0.1, evenOf: 100,
  trying: ["item", "exp", "turn", "ghost", "foe", "lady", "wear", "feast", "smith", "ownGhost", "fallen", "nemesis", "relic", "shrine", "class"] };
const verifyId = query.get("verify");
const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const trying = query.has("debug");   // (the address's options for trying things out are on)
// The game's code, as a short hash (`build` once it's known; BUILD() works it out the first time
// it's needed: watching, the leaderboard, a journey's end): a journey can only be watched on the
// game it was played on
const SIM_FILES = ["game.js", "world.js", "cave.js", "items.js", "skills.js", "dice.js", "daily.js", "scene.js", "sight.js", "fog.js", "motion.js"];
let build = null, building = null;
const BUILD = () => (building ??= (async () => {
  try {
    const texts = await Promise.all(SIM_FILES.map(f => fetch(new URL(`./${f}`, import.meta.url)).then(r => (r.ok ? r.text() : Promise.reject()))));
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texts.join("\0")));
    return (build = [...new Uint8Array(hash)].slice(0, 6).map(b => b.toString(16).padStart(2, "0")).join(""));
  } catch { return null; }
})());
// The journey being watched, if it is one: { name, score, rank, cls, classRank, record, events (with when each
// happens, by the clock), i (the next), at (the clock, as far as it's got), last (the page's time at
// the last frame), speed, paused, checked (its checks so far), outOfStep }, or null. Asked for from
// the leaderboard (see watchJourney()), or "?watch=<id>" in the address; `watchRefused` says why one
// couldn't be.
let watchRefused = null;
const watching = await (async () => {
  let id = query.get("watch") ?? verifyId;
  try { id ??= sessionStorage.getItem("mektxt.watch"); sessionStorage.removeItem("mektxt.watch"); } catch {}
  if (!id) return null;
  try { sessionStorage.setItem("mektxt.restart", "1"); } catch {}   // (straight into the game, see main.js)
  try {
    const got = id === "last" && local ? JSON.parse(localStorage.getItem("mektxt.lastJourney"))
      : await fetch(`/scores/replay?id=${encodeURIComponent(id)}`).then(r => r.json());
    const record = typeof got?.replay === "string" ? JSON.parse(got.replay) : got?.replay;
    if (!record || !Array.isArray(record.e)) throw new Error();
    if (record.v !== await BUILD()) { watchRefused = tl("That journey was played on an older version of the game."); return null; }
    let t = record.t0;
    const events = record.e.map(([dt, code, ...args]) => ({ t: (t += dt), code, args }));
    return { id, name: got.name ? String(got.name) : null, score: got.score, rank: got.rank ?? null, cls: got.cls ?? null, daily: got.daily ?? null,
      classRank: got.classRank ?? null, record, events, i: 0, at: record.t0, last: null, help: false,
      speed: REPLAY.speed, paused: false, checked: 0, outOfStep: false };
  } catch {
    watchRefused = tl("That journey can't be found.");
    return null;
  }
})();
// The mode the page came back laid out for ("daily" or "competitive"): picked on the title (see
// pickTitle()), to go on into at once (`wantGo`), or the one just played, started again (see
// startOver()), back on the title with its row picked
let wantMode = null, wantGo = false;
try {
  wantMode = watching ? null : sessionStorage.getItem("mektxt.mode");
  wantGo = sessionStorage.getItem("mektxt.go") === "1";
  sessionStorage.removeItem("mektxt.mode");
  sessionStorage.removeItem("mektxt.go");
} catch {}
// mektxt.com (the website, not dos-age.com's game alone, `data-game-only`) has a taste of the game,
// not all of it (the user's, 2026-10-18): no title, the Daily Challenge begun at once as a class
// picked at random (see siteClass(), the day's own on a class day), the chat joined only once a
// first turn's taken, and the game-over box pointing to dos-age.com for the rest. Such a journey
// has "web" in its options, so it's watched again the same anywhere
const ON_SITE = !("gameOnly" in document.body.dataset);
if (ON_SITE && !watching) wantMode = "daily";
// The address's options that change how a journey goes: the ones anyone can use, and those for
// trying things out where they're on (a watched journey has the ones it was played with). A Daily
// Challenge's is `daily`, its day's key (daily.js; trying things out, "?daily=2026-10-25" plays that day's)
const options = watching ? new URLSearchParams(watching.record.q) : new URLSearchParams([...query].filter(([k]) =>
  ["skill", "biome", "site", "siteIn"].includes(k) || (trying && ["item", "exp", "turn", "ghost", "foe", "lady", "wear", "feast", "smith", "ownGhost", "fallen", "nemesis", "relic", "daily", "shrine", "class"].includes(k))));
if (ON_SITE && !watching) options.set("web", "");
const onSite = options.has("web");   // (this journey's mektxt.com's, see ON_SITE)
if (!watching && wantMode === "daily" && !options.has("daily")) options.set("daily", dayKey());
if (!watching && wantMode === "competitive") options.delete("daily");   // (picked over the address's "?daily", see pickTitle())
if (!watching && options.has("daily") && !isKey(options.get("daily"))) options.set("daily", dayKey());
const dailyKey = options.get("daily") ?? null;
// The game's clock: the page's, in whole ms (so a journey's record has it exactly), or, watching,
// the watched journey's, as far as it's got
let watchNow = watching?.record.t0 ?? 0;
const clock = () => (watching ? watchNow : Math.round(performance.now()));
// The journey's seed (see world.js), which sets the dice too: a Daily Challenge's is its day's, the same for everyone
const seed = watching ? watching.record.seed : dailyKey ? seedOf(dailyKey) : Math.floor(Math.random() * 2 ** 31);
seedDice(seed);
const journal = watching ? null : { seed, t0: clock(), q: options.toString(), e: [], k: [], last: clock(), full: false };
// What the player (and the page) can do to the journey, by its code in the record. Each goes
// through act(), never straight to the function, from the keys, the pointer and the page.
const ACTIONS = { s: step, c: cast, f: interact, a: answer, w: startSwap, o: openPanel, x: closePanel, i: bagOp,
  l: nextLevelStep, L: pickLevel, y: answerPriest, k: pickClass, t: leaveTower, A: stopAim, W: said,
  X: growWorld, B: advanceBolts, E: expireFires, G: addGhosts, R: addFallen, N: addNemesis, m: pickMode, n: nameBush, g: answerBush, u: smithUpgrade, K: settleSiteClass };
let acting = 0, replaying = false;
// Does what the code stands for (see ACTIONS), and notes it, with when it was done, in the
// journey's record; nothing that comes of it is noted again. A step that changed nothing at all
// (into a wall, or before the last blows have landed, a second time) isn't noted, nor is anything
// that says it did nothing (`UNCHANGED`). Watching, only the record does anything.
const UNCHANGED = Symbol("unchanged");
const stepSign = () => [player.x, player.y, player.facing, player.heading, turns, map.id, diceDrawn(), jackSaid, shake.t0, !!talk, !!lookout, !!dead].join();
function act(code, ...args) {
  if (watching && !replaying) return;
  findLights();                    // (what's lit as it is now, which sight goes by)
  const t = clock(), outer = !acting && journal, before = outer && code === "s" ? stepSign() : null;
  let result;
  acting++;
  try { result = ACTIONS[code](...args); } finally { acting--; }
  if (outer && result !== UNCHANGED && (before === null || stepSign() !== before)) note(t, code, args);
  return result;
}
function note(t, code, args) {
  if (journal.full) return;
  while (args.length && args.at(-1) === undefined) args.pop();
  journal.e.push([t - journal.last, code, ...structuredClone(args)]);
  journal.last = t;
  if (journal.e.length > REPLAY.maxEvents) journal.full = true;
}
// Every `checkEvery` turns, a hash of how things stand: noted, or, watching, checked against the note
function checkJourney() {
  const s = [player.x, player.y, stats.hp, map.id, turns, diceDrawn(), progress.exp, foes.filter(f => !f.dead).length].join();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  if (journal) journal.k.push(h);
  else if (watching && watching.record.k?.[watching.checked++] !== h && !watching.outOfStep) {
    watching.outOfStep = true;
    console.warn(`Watched journey out of step at turn ${turns}`);
  }
}
// The journey's record as it's sent, or null if it can't be (too long, or the game's own hash unknown)
function journeyRecord() {
  if (!journal || journal.full || !build) return null;
  const { seed, t0, q, e, k } = journal, text = JSON.stringify({ v: build, seed, t0, q, e, k });
  return text.length <= REPLAY.maxBytes ? text : null;
}

const CW = 8, CH = 12;            // cell size in native pixels
const UI_ZOOM = 2;                // notice: screen (CSS) px per game px, fixed on every screen
const HUD_ZOOM = 2.5;             // the HUD at the bottom, likewise, as long as it fits
const HUD_GUTTER = 16;            // CSS px kept clear either side of the HUD on narrow screens
const DEFAULT_ROWS = 40;          // world: at most this many tiles tall at the default zoom
// Phones (the shorter side under PHONE_PX CSS px) see everything a little bigger: the world
// fits fewer rows, and the HUD, notice and panels may come closer to the sides.
const PHONE_PX = 600, PHONE_ROWS = 32, PHONE_GUTTER = 2;
const MIN_ROWS = 21, MAX_ROWS = 48; // world: how far the player may zoom in / out
const START_ZOOM = 2;             // world: notches in from the default each game starts at
const STEP_MS = 130;              // walk speed while a key is held
const BOB = [0, -1, -2, -1];      // cursor bob, in native pixels
const BOB_MS = 160;
const ARROW_STEPS = 3;            // the arrow over the character goes once they've walked this many steps (the user's, 2026-10-25)
let walked = 0;

const CAMERA_EASE = 0.15;         // fraction of the distance the camera covers per frame
const HUD = SCENE.hud;
const HUD_BOTTOM = 12;            // native px from the bottom edge of the screen, as in the mock
const PHONE_HUD_BOTTOM = 3;       // ...and on a phone, lower, for more room above it
// The v0.13 HUD ("main-ui", Figma 832:81931, 2026-10-25), drawn in code in its own px (each
// `hudScale` screen px): `w` by `h`. Along the top the 8 shortcut keys, `slot` px boxes (box
// `box`, its number `numY` down), `pitch` apart, a `split` more between 4 and 5 (4 ends at 65, 5 starts at 74), and the bag's
// box at the right; at `barY`, `barH` tall, the hp box (`hpW`: heart, `segs` segments, the
// number) and the four stats' boxes (`statW`, overlapping a px); the exp bar at `expY`; and at
// `statusY` the level, where the character is and the day. Above its right end, `rowUp` px up,
// the tools carried and the buffs and debuffs (not in the mock: Claude's, so they're still shown).
const HUD_W = 162, HUD_H = 61;
const HUD_V13 = { box: [14, 18], pitch: 17, split: 6, numY: 21, bagX: 148, barY: 31, barH: 18, hpW: 58, statW: 27, hpX: 41, valueX: 11,
  segs: 5, segX: 14, segW: 4, segGap: 1, expY: 48, expH: 5, statusY: 55, rowUp: 14, iconGap: 2,
  ink: { box: "#253a56", bg: "rgba(7, 19, 36, 0.9)", dim: "#306082", lit: "#9badb7", key: "#d9a066", bag: "#306082",
    seg: "#ac3232", segEmpty: "#253a56", exp: ["#3f3f74", "#306082", "#5b6ee1", "#639bff"] },
  order: ["atk", "def", "mag", "spd"] };

// hp is 100 at full health (more or less by class, see CLASSES). atk, def, mag and spd are the
// character's own; what's equipped adds to them (see stat()). spd is 10 for a normal pace:
// something with 20 moves twice for each of the character's turns (see skeletonTurn()).
// These are the hidden base every class's own are added to (v0.12, 2026-10-11: atk 1, def 0,
// mag 0 and spd 9, so the classes the panel shows with 1s come out as before; spells' damage is
// times mag, so a higher base would have strengthened every spell)
const stats = { hp: 100, atk: 1, def: 0, mag: 0, spd: 9 };
// Classes ("character-selection", 406:67419, v0.12): the class is picked before the journey, on
// the title (or, on mektxt.com, given; see CLASS_PICK). Each is one of four groups (CLASS_GROUPS), looks its own
// (SCENE.classes), has full hp `hp` at level 1, adds `stats` to the hidden base (see stats),
// starts with its own skill (`spell`, skills.js tier 0) and has `traits` (as the panel says
// them); besides that, by class:
//   dodge:     more percentage points of dodging, like gear's
//   reduce:    percent less damage taken, like gear's
//   noWeapons: weapons can't be worn, only carried (an axe or pickaxe still works from the bag)
//   blows:     how many blows it strikes at a monster each turn
//   points:    stat points banked each level up
//   exp:       how much of the exp it gains counts, out of 1
//   hiccup:    the chance a step or blow is lost to a hiccup instead (the monsters still move)
//   regen:     [hp, turns]: heals that much every that many turns, on top of the usual REGEN
const CLASSES = {
  fighter: { name: "Fighter", group: "melee", hp: 110, stats: { atk: 2, def: 2, mag: 1, spd: 1 }, reduce: 7,
    traits: [english("+7% dmg reduction")], spell: "lunge-normal" },
  rogue: { name: "Rogue", group: "melee", hp: 110, stats: { atk: 1, def: 1, mag: 1, spd: 3 }, dodge: 7,
    traits: [english("+7% dodge")], spell: "sneak-normal" },
  brawler: { name: "Brawler", group: "melee", hp: 120, stats: { atk: 1, def: 1, mag: 1, spd: 1 }, noWeapons: true, blows: 2,
    traits: [english("can't use weapon"), english("always double attack")], spell: "adrenaline-normal" },
  mage: { name: "Mage", group: "ranged", hp: 100, stats: { atk: 1, def: 1, mag: 2, spd: 1 }, spell: "firebolt-normal" },
  archer: { name: "Archer", group: "ranged", hp: 100, stats: { atk: 2, def: 1, mag: 1, spd: 1 }, spell: "shoot-normal" },
  pikeman: { name: "Pikeman", group: "ranged", hp: 100, stats: { atk: 1, def: 2, mag: 1, spd: 1 }, spell: "thrust-normal" },
  prodigy: { name: "Prodigy", group: "allround", hp: 75, stats: { atk: 1, def: 1, mag: 1, spd: 1 }, points: 2, exp: 1.1,
    traits: [english("+2 attribute/lvl up"), english("+10% bonus exp")], spell: "blink-normal" },
  cleric: { name: "Cleric", group: "allround", hp: 90, stats: { atk: 1, def: 1, mag: 1, spd: 2 }, spell: "regeneration-normal" },
  drunkard: { name: "Drunkard", group: "allround", hp: 100, stats: { atk: 1, def: 2, mag: 1, spd: 1 }, hiccup: 0.04, regen: [3, 5],
    traits: [english("4% hiccup chance"), english("regen +3 HP / 5 turns")], spell: "haste-normal" },
  dweorg: { name: "Dweorg", group: "special", hp: 100, stats: { atk: 1, def: 1, mag: 1, spd: 1 }, spell: "hammertime-normal" },
  siren: { name: "Siren", group: "special", hp: 100, stats: { atk: 1, def: 1, mag: 2, spd: 1 }, spell: "screech-normal" },
  shieldmaiden: { name: "Shieldmaiden", group: "special", hp: 110, stats: { atk: 1, def: 3, mag: 1, spd: 1 }, spell: "stoneskin-normal" },
};
// The panel's groups: the card's colour (`bg`), the group's name and the class picked in `ink`,
// and the classes' looks tinted `look`, in the list and in the game (SCENE.classes, 408:69039)
const CLASS_GROUPS = {
  melee: { name: "Melee", bg: "#45283c", ink: "#d9a066", look: "#df7126" },
  ranged: { name: "Ranged", bg: "#253a56", ink: "#639bff", look: "#5b6ee1" },
  allround: { name: "All-rounded", bg: "#323c39", ink: "#78c283", look: "#37946e" },
  special: { name: "Special", bg: "#4c4147", ink: "#eec39a", look: "#696a6a" },
};
// The class the character starts as: one of CLASSES at random each visit (the user's ask,
// 2026-10-12), not always the fighter, drawn from the journey's seed (see seed below) so a
// watched or loaded journey starts as the same one
let charClass = "fighter";
let classOpen = true;              // the class can still be changed (see CLASS_PICK)
// The journey's mode, picked as it starts (see MODES): "competitive", DAY.days days and its score
// on the leaderboard, or "daily", the Daily Challenge (daily.js): the same, on the day's map, with
// the day's affixes, and its score on the day's own board (the user's design, 2026-10-18; the
// exploration mode and its saves before it gone). null till it's picked; a first turn taken
// without picking makes it the page's (daily on a daily page, see `dailyKey`).
let gameMode = null;
// The day's challenge, on a Daily Challenge's page (see `dailyKey`): { key, seed, affixes, cls
// (the class it's played as, on a class day), name ("Blizzard Fighter Sunday") }
const daily = dailyKey ? (c => ({ ...c, name: dailyName(c) }))(challenge(dailyKey, Object.keys(CLASSES))) : null;
// ...what its affixes do, all together (see daily.js AFFIXES): to every monster's stats, its
// dodge, how far off it notices the character (times), the spell one that knows none casts, the
// affix every monster has (one that'd roll its own), and how many more monsters there are (see
// busyMore()); and what they do to the journey: how long a day is (times, see DAY), no potions
// (see drink()), how many past players' ghosts rise each night (see nightfall()), no skills (see
// cast(), foeCasts()), all gear and spells weak (see worse()), the chance of a hiccup whatever the class
// (see step()), and every miniboss in a pair (see addBoss()). (On the page, not the mode: the world's monsters are laid out before the mode's
// picked, and a daily page is only ever daily.)
const DAILY = (() => {
  const list = (daily?.affixes ?? []).map(id => AFFIXES[id]), stats = {};
  for (const a of list) for (const [k, v] of Object.entries(a.stats ?? {})) stats[k] = (stats[k] ?? 0) + v;
  return { stats, dodge: list.reduce((n, a) => n + (a.dodge ?? 0), 0), aggro: list.reduce((n, a) => n * (a.aggro ?? 1), 1),
    spell: list.find(a => a.spell)?.spell ?? null, affix: list.find(a => a.affix)?.affix ?? null, more: list.reduce((n, a) => n + (a.more ?? 0), 0),
    days: list.reduce((n, a) => n * (a.days ?? 1), 1), fasting: list.some(a => a.fasting), ghosts: Math.max(0, ...list.map(a => a.ghosts ?? 0)),
    noSkills: list.some(a => a.noSkills), inferior: list.some(a => a.inferior), hiccup: Math.max(0, ...list.map(a => a.hiccup ?? 0)),
    twins: list.some(a => a.twins) };
})();
// On an Inferior Daily Challenge (see DAILY), gear or a spell `id` made the weak one of it (a keepsake,
// a relic, a potion or anything with no weak one as it is): whatever's dropped, found in a chest,
// carried, learnt, offered at a level-up, and the class's own spell
function worse(id) {
  const it = DAILY.inferior && (ITEMS[id] ?? SKILLS[id]);
  if (!it?.affix || it.keepsake || it.relic || it.consumable) return id;
  const weak = `${it.variant}-weak`;
  return ITEMS[weak] || SKILLS[weak] ? weak : id;
}
const dailyMode = () => gameMode === "daily";
// A Daily Challenge's name, as it's shown ("Brutal Monday", "Brutal and Vigorous Thursday", "Brutal, Vigorous and
// Blizzard Weekend", "Blizzard Fighter Sunday" before daily.js CUTOVER), translated (lang.js; daily.js
// challengeName() is the English): `and` what joins the last two affixes
function dailyName(c, and = tl(" and ")) {
  const affixes = joinAffixes(c.affixes.map(id => nameOf(AFFIXES[id].name)), and), cls = c.cls && nameOf(CLASSES[c.cls].name), day = tl(c.day);
  return affixes && cls ? tl("{affixes} {cls} {day}", { affixes, cls, day }) : cls ? tl("{cls} {day}", { cls, day }) : tl("{affixes} {day}", { affixes, day });
}
const hero = () => CLASSES[charClass];
// (full hp grows by HP_PER_LEVEL each level, the same for every class; balance pass 2026-10-05;
// and by what's worn's `hp`, the heart pin's, see gearHp)
const HP_PER_LEVEL = 5;
// (and less what's been paid the blacksmith, for good, see SMITH; here, as maxHp() is asked for from the start)
let smith = null;
// The shrines' pacts taken (see SHRINE): max hp they've given (or taken), the rare ones' rules, how
// many times the Little Crown's been taken (once at most), and the steps walked since Envy's
const pact = { hp: 0, drain: false, crit: false, chain: false, forge: 0, steps: 0 };
// (and what the shrines' pacts have given or taken, see SHRINE)
const maxHp = () => Math.max(1, (hero().hp ?? 100) + HP_PER_LEVEL * (progress.level - 1) + gearHp() - (smith?.lost ?? 0) + pact.hp);
const hpPct = () => stats.hp * 100 / maxHp();
// Experience and level: killing a monster gives its `exp` (its kind's, times its affix's; see
// addFoe()). Going from one level to the next takes `per` times 1 + 2 + ... + the level's
// number, so each level takes longer than the last (24 exp from Lv.1 to Lv.2, 72 more to
// Lv.3, 144 to Lv.4, 240 to Lv.5), up to `max`. (20 till v0.12, where there are more monsters
// and stronger classes: the same bot earned 1.6 times v0.11's exp a turn; `per` went up only
// 1.2 times, so a journey levels a little further than in v0.11, to Lv.6 and its tier II
// spells, the user's ask 2026-10-12) Each level up banks a stat point and a
// spell to pick every third level, spent in the level-up overlay (see LEVEL_UP). The HUD ("ui-competitive", 429:20639) shows "Lv.N" in
// `ink` at `lv` (its top-left, in the HUD's px) and the exp bar along its bottom edge, `bar`:
// `h` px tall with a `line` px `edge` above and below, its `track` filled with `fill` as far
// as the exp so far goes towards the next level.
const LEVEL = { per: 24, max: 99, lv: [2, 26], fontPx: 0.6, ink: "#8f563b", day: { pad: 2, gap: 4, ink: "#3f3f74", num: "#8f563b", bg: "#071324", row: [24, 36] },
  bar: { y: 53, line: 2, h: 2, edge: "#222034", track: "#071324", fill: "#663931" } };
let hudBag = null;                 // where the HUD's bag button was last drawn (screen rect; see drawHudBag())
const progress = { level: 1, exp: 0, points: 0, spells: 0 };
// Levelling up ("level-up", 532:97473 for a stat and 532:97690 for a spell, 2026-10-12): once
// the blow that did it has landed the world stops and the panel comes up, centred like the
// notice, a step for each thing banked, costing no turn. Along the top "LEVEL-UP" ("LEARN NEW
// SKILL" for a spell, the user's 2026-10-14; "BLESSING", the priest's) and "?" (its help), but no "X": it can't be closed (532:97472); under it, on dark1 in dark2 lines, `pad`
// in, "Pick stat" (or "Pick skill", small, bw4) and the level at the right (brown4). First a
// stat to raise, by its `gains` (spd counts for less, so it goes up by more): a row for each,
// its icon and name (bw6), and at the right what it is (brown4) and, `partGap` on, what it would
// gain (small, green4); the one picked is framed green4. Then, every `spellEvery` levels, a
// spell: in a row at the top, "PICK" (small, bw5) over "< >" (green6) in a `pad`-in column at
// the left, and `slot` px boxes `slotGap` apart for up to three spells, each a different one,
// the one picked framed green4 and the rest blue1; under them the card of the one picked (as
// the bag shows it), and under that, `ctaH` px buttons `ctaGap` apart, `pad` in: Ski[P] (red1; [I]gnore 2026-10-14, then the user's Ski[P]),
// which passes on the spell once a Yes/No question over the panel says so (`ignore`, the user's
// 2026-10-14: Y, Enter, Space or F yes; N, Esc or P no), and [L]earn (green1), which learns it
// (they were [D]rop and [T]ake). One the character doesn't know goes to the first free shortcut (with none
// free, the shortcuts' panel asks which spell it replaces); one they do know is offered a step
// better instead (`better`: weak to normal to superior, in the slot it's in; its card says
// "Upgrade" along the bottom), and isn't offered if it can't be bettered. Esc does nothing:
// the spell's learnt or skipped. A new spell is of the tier the level's reached (`tiers`: tier II
// from Lv.6, III from Lv.9, IV from Lv.12, the user's ask 2026-10-12; tier I before). The arrows or WASD move the pick, Enter, Space, F or L learns it,
// and so does its number, and P skips it; the mouse picks what it's over, and a click on a stat
// (or on a spell's box already picked) takes it.
const LEVEL_UP = { gains: { atk: 1, def: 1, mag: 1, spd: 2 }, names: { atk: english("Attack"), def: english("Defence"), mag: english("Magic"), spd: english("Speed") },
  order: ["atk", "mag", "def", "spd"],   // (the rows, top to bottom, as the v0.13 sheet has them)
  spellEvery: 3, better: { weak: "normal", normal: "superior" }, tiers: [[12, 4], [9, 3], [6, 2]],
  w: 79, spellW: 79, pad: 4, iconGap: 2, partGap: 2, slot: 18, slotGap: 2, ctaH: 15, ctaGap: 4,
  buttons: { drop: { bg: "#45283c", key: "#d95763" }, take: { bg: "#323c39", key: "#37946e" } },
  ink: { ask: "#847e87", lv: "#d9a066", name: "#cbdbfc", value: "#d9a066", gain: "#37946e", caption: "#9badb7", arrows: "#78c283",
    slot: "#253a56", picked: "#37946e" },
  // (its help: Claude's lines, 2026-10-12)
  help: { stat: [english("Each level up gives you a point to raise one stat by. Speed goes up by 2, the rest by 1."),
    english("Every third level you also get to pick a spell.")],
    blessing: [english("The priest blesses one stat of your choice, once in your whole journey.")],
    spell: [english("Pick a spell from the row: its card shows what it does."), english("A spell you already know is offered a step better, as an Upgrade."),
      english("Skip passes on them, once you say yes.")] },
  keys: { stat: english("Keys: arrows pick, Enter raise, 1-4 raise."), spell: english("Keys: arrows pick, L or Enter learn, 1-3 learn, P skip."),
    spellF: english("Keys: arrows or move keys pick, F or Enter learn, 1-3 learn, P skip.") },   // (when L moves, see learnKey())
  ignore: { title: "Skip skill?", text: "You won't learn any of these skills this level." } };
// { step ("stat" or "spell"), focus, offers ([{ id, at: the slot it betters, if any }]), help, hits (screen rects),
// ignoring (the Yes/No question up, its answers' rects in `answers`) } while it's up
let leveling = null;
let levelAt = 0;                   // when the blow that last levelled the character up lands
const toNext = () => LEVEL.per * progress.level * (progress.level + 1) / 2;
// How hp looks and sounds as it falls ("health-tier", 65:21117): each tier holds from `above`
// up, its digits in `ink` and leading zeros in `dim`. From `heartbeat` down the forest goes quiet and a heartbeat takes over, and the world
// (not the character, HUD or panels) takes on a red wash (`red`, see RED_WASH). Falling into a
// tier with a `warn` says so in the game log.
const HP_TIERS = [
  { above: 65, ink: "9badb7", dim: "253a56" },
  { above: 50, ink: "d9a066", dim: "253a56" },
  { above: 35, ink: "df7126", dim: "253a56" },
  { above: 10, ink: "ac3232", dim: "253a56", heartbeat: "slow", red: 1, warn: "You feel weak." },
  { above: -Infinity, ink: "ac3232", dim: "253a56", heartbeat: "fast", red: 2, warn: "You're about to collapse!" },
];
const hpTier = () => HP_TIERS.find(t => hpPct() > t.above);
// With the heartbeat the world trembles on each beat, "lub-dub", then holds still till the next,
// so it stays playable: `px` CSS px, far finer than a game pixel (the HUD and panels never
// move), for `ms`, a step of TREMOR_STEPS every TREMOR_STEP_MS. Phones that can also buzz,
// `buzz` ms on, off, on.
// Reduced motion keeps the buzz but not the tremor.
const TREMOR = {
  slow: { px: 1, ms: 160, buzz: [12, 150, 8] },
  fast: { px: 2, ms: 220, buzz: [30, 130, 20] },
};
const TREMOR_STEPS = [[1, 0], [-1, 1], [0, -1], [1, 1], [-1, 0], [0, 1], [1, -1]];
const TREMOR_STEP_MS = 40;
// Motion's calmed (no shaking, swaying or flashing) when the device asks for it or the settings'
// Reduce Motion is on (settings.js)
const deviceCalm = matchMedia("(prefers-reduced-motion: reduce)");
const calm = { get matches() { return deviceCalm.matches || settings.calm; } };
let tremor = { px: 0, ms: 0, t0: -Infinity };
onBeat(rate => {
  if (!calm.matches) tremor = { ...TREMOR[rate], t0: clock() };
  try { navigator.vibrate?.(TREMOR[rate].buzz); } catch {}
});
function tremorOffset(now) {
  const t = now - tremor.t0;
  if (t < 0 || t >= tremor.ms) return [0, 0];
  const [x, y] = TREMOR_STEPS[Math.floor(t / TREMOR_STEP_MS) % TREMOR_STEPS.length];
  const d = Math.round(tremor.px * pixelRatio); // whole canvas px: still crisp
  return [x * d, y * d];
}
const STAT_ORDER = ["atk", "def", "mag", "spd"];
// The spells known (skills.js) are carried in the bag, a slot each, like items (see BAG_SIZE); a
// spell is learnt from a chest (which holds one CHEST.spell of the time, of a tier as gear's,
// see chestLoot()), by levelling up, or picked up again where it was dropped. Shortcut
// keys 1-8 each hold one of them or a potion, cast or drunk with their number (see cast()); one
// thing goes on one key at most. They're set in the bag (see PANEL); a spell learnt goes on the
// first free key, a potion taken on the last free one (8, then 7, 6..., see shortcutPotion()),
// and a key empties once what's on it is no longer carried. A key's number is lit while what's on
// it can be used; a skill still cooling down is drawn `coolDim` as bright, with the turns it has
// left over it; a potion has how many are carried in its corner (SHORTCUT.count).
const SLOTS = 8;                   // (keys 1-8, as the v0.13 HUD has them; 6 till 2026-10-25)
// (for trying them out, "?skill=<id>" in the address starts with that one, "?skill=firebolt-normal",
// and given again, with each of them in the slots after it)
const asked = options.getAll("skill").filter(id => SKILLS[id]).slice(0, SLOTS);
const shortcuts = [...asked, ...Array(SLOTS - asked.length).fill(null)];   // skill ids, or potions' item ids
// The tools carried have slots of their own on the HUD, under what's equipped: the pickaxe
// (which `digs`), then the axe (which `fells` trees), each the best one carried (see keepOneTool()),
// and ready as long as it's there
const tools = { fells: null, digs: null };   // item ids
// A tool's slot says what it's for in a tooltip while the mouse is over it, or for `ms` after
// it's pressed (a tap, on a phone): `text` in `ink` on a `bg` box `pad` HUD px round it, `gap`
// HUD px over the top of the tools' column (so the axe's never hides the pickaxe), over the log
// too, and moved in from the screen's edges if it would run off
const TOOLTIP = { text: { fells: english("You can cut trees"), digs: english("You can dig") }, ms: 1500, pad: 4, gap: 2,
  bg: "#222034", ink: "#d9a066", fontPx: 0.6 };
// A buff or debuff's slot (see BUFFS) does likewise, saying what it is and how long it has left.
let tooltip = null;                // { does (a tool's) or effect (a buff's index), until } while one's up
// (`potion`: of the chests that don't hold a spell, the share that hold a potion instead, see
// POTION; Claude's pick)
const CHEST = { spell: 0.15, potion: 0.3 };
// The tier of what's found at a cell of a map (items.js LOOT steps up from it): a cave floor's
// own (floor n is cave-n, tier n), otherwise the forest's biome's there (forest-1 tier I, and on;
// a shed's or house's where its door is), never past IV (the user's rule, 2026-10-12)
const biomeTier = (x, y) => Math.min(4, world.biomeAt(x, y) + 1);   // (outside)
function lootBase(on, x, y) {
  if (on.cave) return Math.min(4, on.depth);
  return on === MAPS.outside ? biomeTier(x, y) : biomeTier(...on.entrance ?? on.out ?? world.spawn);
}
// What a chest holds: a spell CHEST.spell of the time, a potion some of the rest, otherwise gear (items.js drop()), each of `base`'s tier or a step or two up by `odds` (items.js LOOT.found)
const chestLoot = (base, { odds } = {}) => (random() < CHEST.spell ? rollSkill(lootTier(base, odds), true)
  : random() < CHEST.potion ? potion() : drop(base, odds));
// How much a find's worth a second look, for its sound (sound.js rareFind()), where `base` is the
// tier there (lootBase()): 2 for a rare trinket, or gear or a spell of tier IV or two over it; 1
// for an uncommon trinket, gear or a spell a tier over it, or an enchanted one; 0 the rest (Claude's picks)
function rarity(item, base) {
  const it = ITEMS[item], tier = it?.tier ?? SKILLS[item]?.tier, over = tier ? tier - base : 0;
  if (it?.relic || it?.rarity === "rare" || (tier && over > 0 && (tier >= 4 || over >= 2))) return 2;
  return it?.rarity === "uncommon" || over > 0 || it?.affix === "enchanted" ? 1 : 0;
}
// A find's sound: the plain chime, or brighter the rarer it is (at least 1 for `least`)
function foundSound(item, base, least = 0) {
  const r = Math.max(rarity(item, base), item ? least : 0);
  if (r) rareFind(r); else loot();
}
const cooling = new Map();         // skill id -> turns till it can be cast again
const boosts = [];                 // what skills have cast on the character: { name, stats, left (turns) }
// A skill's boosts (skills.js), as they're cast: the stats it changes, grouped by how many turns each lasts
const boostsOf = skill => Object.values(Object.entries(skill.boost ?? {}).reduce((by, [k, [n, turns]]) => {
  (by[turns] ??= { stats: {}, left: turns }).stats[k] = n;
  return by;
}, {}));
// Regeneration (skills.js) gives back its hp a share at a time, on each of the `regenTurns` turns
// after it's cast, as evenly as whole hp go (10 over 3 turns: 4, 3, 3): what's still to come
const regenShares = ({ regen, regenTurns }) =>
  Array.from({ length: regenTurns }, (_, i) => Math.floor(regen * (i + 1) / regenTurns) - Math.floor(regen * i / regenTurns)).reverse();
const regens = [];                 // { name, shares (hp, next first) } on the character
// A Barrier (skills.js) soaks up the damage of what hits the character, as much as it `barrier`s
// in all, for as many turns, then breaks or fades; one at a time, a new one taking the old's place
let shield = null;                 // { name, left (damage it can still soak up), turns (left) }
// (`textMid`: how far down the font's line its digits' middle is, in font px)
// (`count`: a potion's number carried, in its slot's bottom right corner, on a `bg` box `pad` HUD px round it)
const SHORTCUT = { coolDim: 0.35, bg: "#071324", fontPx: 0.5, ink: "#cbdbfc", textMid: 4.5, count: { ink: "#cbdbfc", pad: 0.5 } };
// Everything carried is in the bag's BAG_SIZE slots, any kind in any slot: gear, potions, tools
// and the spells known (so they're all short of room together, as the user wants, 2026-10-11).
// A slot holds a stack: as many of one item as its `stack` allows (1 for gear and spells, 9 for
// a potion). Weapons, armour and trinkets (items with a `slot`) are worn one of each, from the
// slot they're in (marked "E" there). E, B or I opens the bag (see PANEL). Something new of a
// kind nothing's worn of is put on as it's taken. (15 slots till 2026-10-13, 16 with the 4x4 grid)
const BAG_SIZE = 16;
const GEAR = ["weapon", "armour", "trinket"];
const SLOT_WORDS = { weapon: english("weapon"), armour: english("armour"), trinket: english("trinket") };   // (as they're shown, translated)
const GEAR_NAMES = { weapon: english("Weapon"), armour: english("Armour"), trinket: english("Trinket") };
const bag = Array(BAG_SIZE).fill(null);                          // { id, n } or null
for (const [i, id] of asked.entries()) bag[i] = { id, n: 1 };
const equipped = { weapon: null, armour: null, trinket: null };  // the bag slot of what's worn of each kind
const wearing = slot => (equipped[slot] === null ? null : bag[equipped[slot]].id);
const wornAt = i => GEAR.find(slot => equipped[slot] === i);     // the kind worn from bag slot i, if any
const icon = id => SCENE.itemIcons[ITEMS[id]?.icon ?? id] ?? SCENE.skillIcons[id];
// Potions (items.js, "consumables", 306:29639) are drunk from the bag (see drink()). A monster
// that leaves nothing else leaves one `drop` of the time; chests hold them too (CHEST.potion).
// An Unknown Potion is known for what it is (its name, description and what it does shown in
// place of the unknown one's) by a character with at least `identify` mag, and once one like it
// has been drunk. A monster that leaves nothing at all then leaves a Health Potion `health` of
// the time (added 2026-10-05). (numbers Claude's picks)
const POTION = { drop: 0.15, health: 0.09, identify: 5 };   // (health 0.06 till 2026-10-12, the user's "slightly" more)
const identified = new Set();      // the Unknown Potions drunk, by id
const knows = id => !!ITEMS[id]?.truly && (identified.has(id) || stat("mag") >= POTION.identify);
// Gear that remembers (the user's, 2026-10-20): a weapon counts what it's killed, by its blows and
// the skills that strike with it (Lunge, Shoot, Hammertime; `credits`, how the log puts their hits),
// each by its family (`families`). At `named` kills it takes the name of what it's killed most
// (`banes`: "Goblinbane"); at `legend`, an epithet besides ("Goblinbane, the Unsated") and `atk` more
// attack while it's worn. Its card says what it was and what it's done (see bladeStory()). Its memory
// goes where it goes: dropped and taken up again, upgraded (the blacksmith's, the Forge's pact), and into
// the character's ghost (see ghostOf()), which walks with it, and leaves it, still remembering, when
// it's laid to rest. Kept by the weapon's id, so two of one kind carried share one memory.
// (the names, the epithets and the numbers Claude's placeholders, 2026-10-20, till .TIFF's)
const BLADE = { named: 10, legend: 30, atk: 1,
  families: { skeleton: "undead", skeletonMage: "undead", skeletonArcher: "undead", zombie: "undead", wraith: "undead", shade: "undead",
    lich: "undead", goblinGrunt: "goblin", goblinSoldier: "goblin", goblinBulwark: "goblin", goblinMage: "goblin", goblinKing: "goblin",
    kobold: "kobold", koboldDuelist: "kobold", slime: "slime", hornedSlime: "slime", hound: "beast", ironHound: "beast",
    sandSerpent: "beast", earthworm: "beast", stoneworm: "beast", fuzhu: "beast", golem: "giant", ent: "giant", demon: "demon" },
  banes: { undead: english("Bonebreaker"), goblin: english("Goblinbane"), kobold: english("Koboldbane"), slime: english("Slimecleaver"),
    beast: english("Fangbreaker"), folk: english("Kinslayer"), giant: english("Giantfeller"), demon: english("Demonbane") },
  plural: { undead: english("undead"), goblin: english("goblins"), kobold: english("kobolds"), slime: english("slimes"), beast: english("beasts"),
    folk: english("folk"), giant: english("giants"), demon: english("demons") },
  // (how many of a family it's killed, as its card says it)
  counts: { undead: english("{n} undead"), goblin: english("{n} {n|one:goblin|other:goblins}"), kobold: english("{n} {n|one:kobold|other:kobolds}"),
    slime: english("{n} {n|one:slime|other:slimes}"), beast: english("{n} {n|one:beast|other:beasts}"), folk: english("{n} folk"),
    giant: english("{n} {n|one:giant|other:giants}"), demon: english("{n} {n|one:demon|other:demons}") },
  epithets: [english("the Unsated"), english("the Long Night"), english("the Last Word"), english("the Widow's Due"), english("the Red Hymn"), english("the Quiet End")],
  credits: [english("You hit"), english("Critical! You hit"), english("You lunge at"), english("Your arrow hits"), english("Your shockwave hits"), english("Your pike hits")] };
// (the names and epithets are kept in English, as ghosts carry them to the board; they're translated as they're shown)
const blades = new Map();          // weapon id -> { kills: { family: n }, total, name, epithet }
const bladeName = m => (m.epithet ? tl("{name}, {epithet}", { name: tl(m.name), epithet: tl(m.epithet) }) : tl(m.name));   // (as it's shown, translated)
// An item as the character sees it: an Unknown Potion they know as what it is
// (and a weapon that's earned a name by it, see BLADE)
const seenAs = id => {
  const it = knows(id) ? { ...ITEMS[id], ...ITEMS[id].truly } : ITEMS[id], m = blades.get(id);
  return m?.name ? { ...it, name: bladeName(m) } : it;
};
const named = id => seenAs(id).name;
// ...as it's shown (translated, lang.js), and to fill a sentence's blank with, in `ink`
const shownName = id => nameOf(named(id));
// (a capital letter's as the language has it: Turkish's i is İ)
const upper = s => s.toLocaleUpperCase(language());
const itemNoun = (id, ink) => noun(named(id), ink);
// ...a spell's or an item's (`proper`: no article for a spell in English, "You drop Firebolt")
const thingNoun = (id, ink, proper = false) => noun(SKILLS[id]?.name ?? named(id), ink, proper && !!SKILLS[id]);
const bonus = (id, name) => (id && ITEMS[id].stats?.[name]) || 0;
const gearHp = () => GEAR.reduce((sum, slot) => sum + bonus(wearing(slot), "hp"), 0);
const stat = name => relicScaled(name, stats[name] + GEAR.reduce((sum, slot) => sum + bonus(wearing(slot), name), 0) +
  boosts.reduce((sum, b) => sum + (b.stats[name] || 0), 0) + (name === "atk" && blades.get(wearing("weapon"))?.epithet ? BLADE.atk : 0));
// Relics (items.js RELICS, the user's list, 2026-10-19): rare trinkets, one a journey at most,
// left `odds` of the time by a monster of a rank (or a nemesis, see NEMESIS), or in a chest where
// the loot's tier is `deep` or more; each bends a rule while it's worn:
//   Echo Stone: a spell that hurts is cast again the next turn, at the same cell, `echo` as strong
//   Bone Flute: the risen dead leave the character be (till hurt), and at nightfall one rises as
//               theirs, in blue (see ALLY), till dawn
//   Moon Dial: atk, def, mag and spd `moon` [at night, by day] times
//   Hungry Blade: `feed` hp back for every kill; out of a fight (no monster after the character
//               within `calm` cells), 1 hp lost every `hunger` turns, never the last
//   Lantern of Lost Souls: past players' ghosts and fallen players' graves show out of sight
//               (dimmed, `seeFog`), and at nightfall one past player's ghost fights for the
//               character, in blue, till dawn
//   Aegis, Hermes, Fang, Mistral, Thorn: their stats times `scale` (items.js)
// (numbers but the user's Claude's)
const RELIC = { odds: { hard: 0.02, miniboss: 0.08, nemesis: 0.25, chest: 0.03 }, deep: 3, echo: 0.5, moon: [1.3, 0.9],
  feed: 6, hunger: 7, calm: 8, seeFog: 2 };
const relicOn = id => wearing("trinket") === id;
function relicScaled(name, v) {
  const id = wearing("trinket");
  if (!id || !ITEMS[id].relic) return v;
  const m = id === "moon-dial" ? (["atk", "def", "mag", "spd"].includes(name) ? RELIC.moon[isNight() ? 0 : 1] : 1) : ITEMS[id].scale?.[name] ?? 1;
  return m === 1 ? v : Math.round(v * m);
}
let relicFound = false;            // (one a journey, see RELIC)
// A relic, `chance` of the time, if none's been found yet this journey
function relicDrop(chance) {
  if (relicFound || !chance || !(random() < chance)) return null;
  relicFound = true;
  return RELIC_IDS[Math.floor(random() * RELIC_IDS.length)];
}
// What the equipped items add up to in one of their other effects (dodge, light, regen, reduce)
const gear = name => GEAR.reduce((sum, slot) => sum + ((wearing(slot) && ITEMS[wearing(slot)][name]) || 0), 0);
// The character's dodge on top of what spd gives: their gear's and their class's
const dodging = () => gear("dodge") + (hero().dodge ?? 0);
const bagCount = () => bag.filter(Boolean).length;
// How many of an item (or a spell) are carried in the bag, over all its stacks
const carried = id => bag.reduce((n, b) => n + (b?.id === id ? b.n : 0), 0);
// Whether shortcut keys can hold it: a spell, or a potion
const keyable = id => !!(SKILLS[id] || ITEMS[id]?.consumable);
// Puts a potion just taken on the last free shortcut, unless one already holds it (see SHORTCUT)
function shortcutPotion(id) {
  if (!ITEMS[id]?.consumable || shortcuts.includes(id)) return;
  const free = shortcuts.lastIndexOf(null);
  if (free >= 0) shortcuts[free] = id;
}
// Empties any shortcut holding what's no longer carried (see SHORTCUT)
function tidyShortcuts() {
  shortcuts.forEach((id, i) => { if (id && !carried(id)) shortcuts[i] = null; });
}
const stackOf = id => ITEMS[id]?.stack ?? 1;
// Whether an item can be worn (one with a `slot`, and no weapon for a class that can't wear them)
const wearable = id => !!ITEMS[id]?.slot && !(ITEMS[id].slot === "weapon" && hero().noWeapons);
// The class's own spell (and the same spell bettered, or what it pairs with) can't be dropped or left behind
const classBound = id => !!SKILLS[id] && [SKILLS[hero().spell]?.variant, SKILLS[hero().spell]?.pairs].includes(SKILLS[id].variant);
// Where something found would go: a stack of it with room, or the first empty slot (a spell:
// the slot of the one of its kind known, which it takes the place of), or -1 when there's no room
function placeFor(id) {
  if (SKILLS[id]) return knownAt(id) >= 0 ? knownAt(id) : bag.indexOf(null);
  const stack = bag.findIndex(b => b?.id === id && b.n < stackOf(id));
  return stack >= 0 ? stack : bag.indexOf(null);
}
// Takes an item into the bag (putting it on, if nothing's worn of its kind; see placeFor())
function carry(id) {
  id = worse(id);
  const at = placeFor(id);
  if (bag[at]) bag[at].n++;
  else bag[at] = { id, n: 1 };
  if (wearable(id) && wearing(ITEMS[id].slot) === null) equipped[ITEMS[id].slot] = at;
  shortcutPotion(id);
  keepOneTool();
}
// Takes one of what's in bag slot i out of it (all of a spell), and off whatever it was worn
// as or on; what it was
function takeOut(i) {
  const id = bag[i].id;
  if (!--bag[i].n) {
    bag[i] = null;
    const slot = wornAt(i);
    if (slot) equipped[slot] = null;
  }
  tidyShortcuts();
  keepOneTool();
  return id;
}
// Swaps bag slots i and j, what's worn going with them
function swapSlots(i, j) {
  [bag[i], bag[j]] = [bag[j], bag[i]];
  for (const slot of GEAR) equipped[slot] = equipped[slot] === i ? j : equipped[slot] === j ? i : equipped[slot];
}
// Up a tower (walking up into its door, or F beside its foot, outside), the character looks out over the forest: they're not
// drawn, the cursor sits over the tower's top instead, and the view is from there, as far out
// as the player can zoom themselves (MAX_ROWS), but no further: past that there's so much more
// to draw that it lags. Their light reaches `light` further and
// nothing blocks the view within it; past it everything on screen still shows, monsters
// included, very dark (fog step `far`). No turn passes up there, and an arrow key (or a tap,
// Esc or F) brings them straight back down, where they stood.
const LOOKOUT = { light: 10, far: 4 };
let lookout = null;                // { tower, eye: { x, y } (cells) } while up one
// (a Screech's echoes, while they last, reach `less` cells short of a tower's view, see SCREECH;
// 3 less since 2026-10-11, the user finding it too wide)
const SCREECH = { less: 3 };
let revealLeft = 0;
// What the burning bush has done for the character (see BUSH): whether it's been told their name,
// the gift they took (`gift`), whether the dark's on them (`punished`), and whether it's done with
// them (`spent`), whichever bush it was
const bush = { named: false, gift: null, punished: false, forsaken: false, spent: false };
// (and no torch nor daylight helps while the dark's on them, see BUSH)
const light = () => (bush.punished ? 0 : gear("light") + (map === MAPS.outside ? daylight() : 0)) +
  (lookout ? LOOKOUT.light : revealLeft > 0 ? LOOKOUT.light - SCREECH.less : 0);
// Down in the cave (see caveMap()) it's dark: without a light the character sees `sees` cell
// widths at most, where outside it's FOG_END, the fog's steps all that much nearer (so things
// are clear some 2 cells off, and faint shapes past 4), and a light adds its cells to that as
// it does outside. Monsters there notice the character from `aggro` of their usual range: still
// from further than the character can make them out, but not by so much.
const CAVE = { sees: 7.5, aggro: 0.75 };
// Bumping the cave's dirt with a pickaxe carried (see `tools`) hits it, shaking like a
// hit tree: each hit dithers more of it away into the dark (one of `stages` looks,
// tools/extract.py), and the last digs it out, bare floor from then on. A built room's walls
// and the edge of the floor can't be dug (cave.js); its hard dirt and rock take more hits, as
// many times as their `hardness` (cave.js STRATA).
const DIG = { stages: SCENE.underground.dug[0].length };
// How many hits a tool (the axe or pickaxe in its slot) takes to clear a tree or dirt, by
// its affix, whatever it's made of. Each hit does that share of the work, so what's left of
// one part cleared is finished off by a better tool in fewer.
const TOOL_HITS = { weak: 4, normal: 3, superior: 2, cursed: 2, enchanted: 1 };
const toolHits = does => TOOL_HITS[ITEMS[tools[does]]?.affix];
// The work done on something by a hit more, and whether that clears it
function toolWork(done, k, does, hardness = 1) {
  const work = (done.get(k) || 0) + 1 / (toolHits(does) * hardness);
  if (work > 1 - 1e-9) { done.delete(k); return [1, true]; }
  done.set(k, work);
  return [work, false];
}
// ...and how it looks by then, of `stages` looks before it's cleared: 1 and up
const workStage = (work, stages) => Math.min(stages, Math.ceil(work * stages - 1e-9));
// How much nearer the fog's steps are on this map than outside (and with the burning bush's dark
// on the character, see BUSH, nearer still)
const murk = () => FOG_END / (map.sees ?? FOG_END) / (bush.punished ? BUSH.dark : 1);
// The fog step (fog.js) at dx, dy from the character, pushed back by any light they carry
const fogStepAt = (dx, dy) => fogStep(dx * murk(), dy * murk(), CW, CH, light() * murk(), fogSpread());
// A firebolt in flight and every fire are lights of their own: within `reach` cell widths of one
// the world is drawn as brightly as it would be that near the character, were their own light
// only `reach` far (so it's clear right by the fire and dithers away at its edge), and whatever
// the light can see is seen, though the character couldn't see it from where they stand. The
// lights' cells are found again each frame (see findLights()). So is every torch on a cave's
// walls (cave.js) the character can see from where they stand, nothing in the way, within
// `torchesNear` cell widths: one behind the dirt, a wall or a corner lights nothing for them;
// and a cave's lava (cave.js LAVA, from the middle of each pool and every so often along each
// river) and its crystals (cave.js CRYSTALS, from the middle of each patch) likewise.
const LIGHT = { reach: 7, torchesNear: 24 };
let lights = [];                   // [x, y] cells, on the map the character's on
// The fog step a cell is drawn at: the nearer of the character's and any light's
function litStep(x, y) {
  let step = fogStepAt(x - eye.x, y - eye.y);
  const k = FOG_END / LIGHT.reach;
  for (const [lx, ly] of lights) {
    const s = fogStep((x - lx) * k, (y - ly) * k, CW, CH);
    if (s >= 0 && (step < 0 || s < step)) step = s;
  }
  return step;
}
// Bumping a forest tree with an axe carried (see `tools`) hits it (as many times as TOOL_HITS has for it); the last hit leaves a walkable stump,
// and maybe something that was hidden in it (see FIND)
const CHOP = { hits: SCENE.biomes[0].treeHits[0].length, gapMs: 250, shake: [1, -1, 1, -1], shakeMs: 45 };
// What a felled tree, dug-through dirt or a mined crystal may leave, one roll: gear `gear` of the
// time, a Health Potion `health`, a spell `spell` (the user's 0.5%, 2026-10-12; dirt too since
// then), each of the tier there or a step off (items.js LOOT.found); nothing the rest. A tree a
// fire burns down leaves the same (see burnTurn()). (health 2% till 2026-10-12, then 3%)
const FIND = { gear: 0.01, health: 0.03, spell: 0.005 };
function findAt(x, y, on = map) {
  const r = random(), base = lootBase(on, x, y);
  return r < FIND.gear ? drop(base) : r < FIND.gear + FIND.health ? "potion-health"
    : r < FIND.gear + FIND.health + FIND.spell ? rollSkill(lootTier(base), true) : null;
}
const hits = new Map();            // forest cell -> how hit it looks, CHOP.hits once it's felled
const chopped = new Map();         // forest cell -> how far the character has got with it, 0..1 (see TOOL_HITS)
let shake = { k: null, t0: -Infinity };
// A tree that's cut down or trampled (not one that's burnt) grows back ("growing", 159:25567):
// its stump, or the grass an ent left, stays `bare` turns, then it's a sprout, a sapling and a
// young tree for `stage` turns each (walked over and seen past all the while, like the stump),
// then the tree it was, once nothing's standing there. Each takes up to `vary` longer or
// shorter than that, so a cut doesn't close up all at once.
const REGROW = { bare: 400, stage: 200, vary: 0.25, every: 10 };
const regrowing = new Map();       // forest cell -> { t0: the turn it fell, pace: how slowly it grows }
const fell = k => regrowing.set(k, { t0: turns, pace: 1 + REGROW.vary * (2 * random() - 1) });
// How far along one is: 0 still bare, 1..(a biome's growing.length) growing, past that grown
const regrowth = g => Math.max(0, 1 + Math.floor(((turns - g.t0) / g.pace - REGROW.bare) / REGROW.stage));
function regrowTurn() {
  if (turns % REGROW.every) return;
  const on = MAPS.outside;
  for (const [k, g] of regrowing) {
    if (regrowth(g) <= SCENE.biomes[0].growing.length) continue;
    const [x, y] = k.split(",").map(Number);
    if ((map === on && x === player.x && y === player.y) || on.loot.has(k) || jacks.some(j => j.on === on && j.x === x && j.y === y) ||
      foes.some(s => !s.dead && s.on === on && s.x === x && s.y === y)) continue;
    regrowing.delete(k);
    hits.delete(k);
    chopped.delete(k);
    overgrown.delete(k);
    sooty.delete(k);
    felled++;
  }
}

// "You found" notice (Figma 43:19950, the item box 51:15784), laid out in the mock's px.
// `zoom` is its size relative to the HUD's pixels (smaller if it wouldn't fit; see fitUi()); text is MEKMODE Text at 6px, so a font
// pixel is 0.6 of the notice's, and the small text (description, specials) at 5px. Every px
// rounds to whole screen px, so the width follows the text, from `boxW` up.
// The box shows the item, its description, and for equipment each stat it touches: its
// value (bw4), `gearGaps[0]` px after its icon, then, `gearGaps[1]` px after the value's
// letters, how that compares with what's equipped in its slot now (green up, red2 down, in
// the small text; nothing if the same: "delta-sample", 494:71281, 2026-10-11), then what else
// it does ("+cut trees"). A spell's or potion's cells keep 51:15471's `statPartGap`.
// [Y]es and [N]o can be clicked or tapped too, anywhere within `hitPad` of their text. It,
// the panels and the question over them cast a dithered dark1 shadow `shadow` px down and right.
const NOTICE = {
  zoom: 1.375, shadow: 4, pad: 4, gap: 6, bg: "#222034", box: "#071324", fontPx: 0.6, smallPx: 0.5, hitPad: 2,
  textH: 7, textDy: 2.5,           // a line of text's height, and its drop beside a 12px icon
  smallDy: 3,                      // likewise for the small text
  boxW: 92, boxGap: 4, iconGap: 3, statCols: 2, statGap: 2, statPartGap: 1, gearGaps: [2, 4], answerGap: 4, ctaGap: 4,
};
const INK = { title: "#d9a066", name: "#9badb7", up: "#37946e", down: "#d95763", less: "#ac3232", value: "#cbdbfc", same: "#847e87", trait: "#76428a", dealt: "#cbdbfc", desc: "#696a6a" };
// What's found, in a chest or on the ground, comes up in the pickup ("pickup", 494:66944, 2026-10-11),
// centred like the notice, `w` px wide: along the top, on dark2, "ITEM" ("ITEMS" for a pile), and
// at the right "?" (the help) and "X" (as the bag has them, see SHEET); under it, on dark1 in
// dark2 lines, the item's card (as the bag shows it), then `ctaH` px buttons `ctaGap` apart,
// `pad` in: [E]quip (gear: takes it and puts it on, a turn, as the bag's does), [T]ake (Y too),
// and [D]rop, which leaves it there (N, Esc and X too). With the bag full, [T]ake and [E]quip
// bring up the bag to leave something for it (S too, see PANEL); with no way to take it they're
// dimmed. Two or more things on one cell are a pile ("items", 516:90952): nothing's ever lost
// under something dropped on top of it (see dropAt()); what's on the cells touching it shows
// in the same pile (see groundAround()). Over its card, `pad` in, a `slot` px box
// for each (`slotGap` apart, as many to a row as fit, centred), the one picked framed green4,
// the rest blue1, the top of the pile picked to start with; a click or the arrows pick another,
// and its card shows framed green4. The answer goes with which was picked (see answer()).
const PICKUP = { w: 79, per: 4, pad: 4, slot: 18, slotGap: 2, ctaH: 15, ctaGap: 2,
  ink: { slot: "#253a56", picked: "#37946e", label: "#9badb7", dim: "#3f3f74" },
  buttons: { equip: { bg: "#222034", key: "#d9a066" }, take: { bg: "#323c39", key: "#78c283" }, drop: { bg: "#45283c", key: "#d95763" } },
  // (its help: the user's note, 494:66982, and Claude's for the rest)
  help: ["For gear, the small numbers show how it compares with what you're wearing now.",
    "With more than one thing here, pick one from the row at the top."],
  keys: "Keys: T take, E take and put on, S swap, D leave it, arrows pick." };
let notice = null;                 // { item, chest, pile, from, pick, buttons, slots, help, per } while it's up; buttons and slots are screen rects
let talk = null;                   // { priest, buttons } while the priest's offer is up (see TALK)

// The panels' cards (the level-up overlay and the shortcuts' panel lay theirs out like the old
// bags' "select-weapon", 53:17007): `cardW` px wide and at least `cardH` tall, `gap` apart,
// with an "Equipped" bar `barH` tall; the question over a panel is `choiceW` px wide
// ("panel-item", 54:18080), its answers `choiceGap` px apart.
const PANEL = { cardW: 92, cardH: 52, gap: 4, border: 1, barH: 6, barPad: 4, choiceW: 100, choiceGap: 2,
  dim: "rgba(7, 19, 36, 0.7)" };
const PANEL_INK = { equipped: "#37946e", equippedText: "#071324", focus: "#5b6ee1", empty: "#253a56",
  emptyText: "#306082", hint: "#595652", drop: "#eec39a" };
// The bag ("inventory-system", 419:79909, 2026-10-11): everything carried, in one panel, opened
// with B or I (or E, Q, or a press on the HUD's [B]Bag button), centred like the
// notice. Along the top, on dark2, "[B] BAG", and at the right a "?" (the help, see BAG_HELP)
// and "X". Under that, `rowH` px each, on dark1 in dark2 lines (420:81064), the GEARS row (what's
// worn as each kind, its icon over its kind's name) and the SHORTCUT KEYS row (what's on keys 1-8, each over
// its number, a potion with how many are carried beside it), each with its caption in a
// `captionW` px column at the left. Then the bag's BAG_SIZE slots, `cols` to a row, each a `cell`
// px box `gap` apart with its item's icon, marked with the key it's on (top left, in `key`), "E"
// while it's worn (top right) and a stack's count (bottom right). Two layouts since 2026-10-13
// (see bagLayout()), the user's: on a computer or tablet (419:79909), 4 slots to a row with the
// card of what's picked beside them (green framed, as the notice has it), [G] Auto Equip and
// [T] Auto Sort under the slots `autoGap` apart, and [D]rop, [S]wap and [U]se ([E]quip for
// gear, Un[E]quip for gear worn) along the bottom, `ctaH` px tall, `ctaGap` apart; on a phone
// (583:75025, the user's, 2026-10-13: 128 px wide so a phone draws it a scale step or two
// bigger), no captions beside GEARS and the keys, 6 slots to a row, the card under them as wide
// as the panel (at least `phoneCardH` tall), Use, Drop and Swap along the bottom (no keys shown
// on them, at least `phonePad` px either side of the words, for Unequip's sake), every
// button at least `phoneCss` CSS px tall for a finger (the user's 31), and no Auto Equip or Auto
// Sort (the user's: gone on a phone). See wearBest() and sortBag() for the autos.
// What's picked is green framed (the arrows move it, a click or tap picks one); the buttons and
// their keys act on it. Things are moved by dragging them (a mouse or a finger), or by [S]wap,
// Enter, Space or F, then picking where (blue framed till then): onto another bag slot swaps
// the two; gear onto its kind in GEARS puts it on (and off, dragged back into the bag); a spell
// or potion onto a key puts it there (swapping keys with what was there; one thing on one key
// at most), and 1-8 does that too; a key dragged anywhere else is cleared. Dragged out of the
// panel, a thing's dropped (the class's own spell can't be: see classBound()). Putting on,
// taking off, using and dropping take a turn; moving things doesn't. Esc lets go of what's being
// moved, or closes it; so do B, I and a click outside.
// With the bag full, a find can be swapped in (the notice's [S]wap), and a spell picked on
// levelling up likewise: the bag comes up as "LEAVE WHAT?", and what's picked is left where the
// find was (or dropped at the character's feet, for a spell learnt); Esc goes back.
// The blacksmith's comes up as "UPGRADE WHAT?" (see SMITH): only the gear he'd take lit, the rest
// dimmed, the card the one the picked piece would become (a step up), its price beside the slots (on
// a phone, only on the button), and one button, [U]pgrade, along the bottom (Claude's layout,
// 2026-10-13, after the codex's sketch of it: no Figma yet).
const BAG_PANEL = { headH: 14, rowH: 26, captionW: 41, cell: 18, gap: 2, pad: 4, cardGap: 4, ctaH: 15, ctaGap: 4,
  desk: { w: 186, cols: 4 }, phone: { w: 128, cols: 6 }, autoGap: 4, phoneCardH: 96, phonePad: 2, phoneCss: 31,
  iconY: 3, labelY: 16, markPad: 1, countY: 11, keyCount: 1, closeGap: 6, dragPx: 4,
  // (the desktop bag's rows as Figma's bag-ui has them, 834:90893: gears 30 tall; the shortcuts 36, a box
  // `top` down and its number `num` under it; the slots `gap` apart, `pad` above and below, `side`
  // px either side in all; buttons 21 tall)
  sheet: { gearsH: 30, keys: { h: 36, top: 6, num: 3 }, grid: { gap: 2, pad: 6, side: 12 }, ctaH: 21 },
  ink: { head: "#847e87", help: "#8f563b", caption: "#9badb7", gear: "#d9a066", key: "#639bff", count: "#9badb7", worn: "#d9a066",
    slot: "#253a56", picked: "#37946e", moving: "#5b6ee1", empty: "#306082", label: "#9badb7", dim: "#3f3f74" },
  buttons: { drop: { bg: "#45283c", key: "#d95763" }, swap: { bg: "#222034", key: "#d9a066" }, use: { bg: "#323c39", key: "#37946e" },
    best: { bg: "#222034", key: "#d9a066" }, sort: { bg: "#222034", key: "#d9a066" }, smith: { bg: "#323c39", key: "#37946e" } } };
// The bag's layout: 419:79909's (4 slots to a row, card beside them) on a computer or tablet,
// 583:75025's (6 to a row, card under them) on a phone (the user's, 2026-10-13)
const bagLayout = () => (phone ? BAG_PANEL.phone : BAG_PANEL.desk);
// The bag's cells, as the panel counts them: GEARS (0-2, as GEAR), the keys (KEY0 on), the bag's slots (BAG0 on)
const KEY0 = 3, BAG0 = KEY0 + SLOTS;
// The help ("help-tooltip", 421:81536): the "?" (or H) shows it beside the bag (over it where
// there's no room), `w` px wide, in blue4 on dark2; "?", H, Esc or a click anywhere hides it
// again. Its lines are Claude's, after the user's notes (2026-10-11), and say "tap" on a touch screen.
const BAG_HELP = { w: 114, gap: 26, pad: 4, lineGap: 3, ink: "#5b6ee1", key: "#9badb7",
  lines: [
    "{Click} a thing to see it, drag it to move it.",
    "Onto another slot: swaps them.",
    "Gear onto GEARS: wears it.",
    "A spell or potion onto a key: use it with 1-8.",
    "Out of the bag: drops it.",
    "Wearing, using and dropping take a turn.",
    "Spells take a slot too; your class's own can't be dropped.",
    "Auto Equip wears what suits your class best (a turn); Auto Sort tidies the bag.",
  ],
  keys: "Keys: arrows pick, S move, D drop, U use, E equip, G auto equip, T auto sort, 1-8 key." };
// Whether the last press was a finger's (or a pen's), not the mouse's
let tapping = matchMedia("(hover: none)").matches;
// ...and with no keyboard, no keys are shown: a shortcut's in brackets comes off what it's on, its
// letter kept where it's in a word ("[L]og" is "Log", "Cons[U]me" "Consume", "Ski[P]" "Skip") and dropped where
// it doesn't ("[G] View Leaderboard" is "View Leaderboard", "[Enter]Chat" "Chat"); "Esc X" is "X"
// (`plain` takes them off anyway: the bag's buttons on a phone, too narrow for them)
function tapKeys(runs, plain = tapping) {
  if (!plain) return runs;
  const out = [];
  for (let i = 0; i < runs.length; i++) {
    if (runs[i][0] !== "[" || !runs[i + 2]?.[0].startsWith("]")) { out.push(runs[i]); continue; }
    const k = runs[i + 1][0], rest = runs[i + 2][0].slice(1), after = /[a-z]$/i.test(out.at(-1)?.[0] ?? "");
    out.push([k.length === 1 && (/^[a-z]/.test(rest) || after) ? (after ? k.toLowerCase() : k) + rest : rest.trimStart(), runs[i + 2][1]]);
    i += 2;
  }
  return out;
}
const closeLabel = () => tapping ? "X" : "Esc X";
const PANEL_KEYS = ["KeyB", "KeyI"];   // (and E opens it, but in it, E equips)
// { focus (the cell picked), moving (the cell being moved, if any), drag ({ id, from, x, y, x0, y0, on }
// while one's pressed: on once it's moved far enough to be dragged), hover, help, swap ({ item,
// chest } while a find's swapped in, { item, level: true } for a spell learnt), hits (screen rects) } while it's up
let panel = null;

// A monster's panel ("observe", 449:76303, 2026-10-11), when one is clicked or tapped, centred
// like the notice, `w` px wide: along the top "OBSERVE", "?" (its help) and "X" (see SHEET);
// under it, on dark1 in dark2 lines, its card, `pad` in, its parts `gap` apart: its icon (in its
// affix's tint) and name (bw6), what it is (small, bw4), its stats, two to a row, `statGap`
// apart (hp alone, then atk and mag, then def and spd: each its icon and, `iconGap` on, its
// value), and its ways (small): how it behaves, at the left, and when it's about, at the right.
// Under that, for one that knows a spell, the spell's own box (its icon and name).
// How much it shows depends on the character's mag: each stat needs at least `insight` mag to
// be seen, and shows as "?" ("???" for its hp) till then; so does its spell. Its name, what it
// is and its ways are always shown, since they can be seen by eye; with enough mag its hp shows
// out of its full hp ("18/24"). Esc, X or clicking anywhere closes it; clicking another monster
// shows that one instead. Nothing happens in the world while it's up.
// Its ways, from what it does (Claude's words and colours for all but "aggressive", 2026-10-11):
// one that hunts the character (the demon, the iron hound), one that keeps away, one that
// wanders and never notices them (the ent), and all the rest; then
// "day" for one that only stirs by day, "night" for one risen at night, and "all-day" otherwise.
const MONSTER_PANEL = { w: 79, pad: 4, gap: 4, iconGap: 2, statGap: 2, unknown: "?", unknownHp: "???",
  insight: { spell: 5, hp: 3, atk: 5, mag: 7, def: 7, spd: 7, fullHp: 10 },
  ink: { name: "#cbdbfc", desc: "#847e87", value: "#cbdbfc", hidden: "#847e87", time: "#696a6a" },
  ranks: { "very-easy": english("Very easy"), easy: english("Easy"), medium: english("Medium"), hard: english("Hard"), miniboss: english("Miniboss") },
  ways: { hunts: ["hunts you", "#ac3232"], evasive: [english("evasive"), "#d9a066"], passive: [english("passive"), "#9badb7"], aggressive: [english("aggressive"), "#ac3232"] },
  // (its help: the user's notes, 452:79159)
  help: ["Your observation level is affected by your MAG. The more MAG you have, the more you'll learn about a monster.",
    "Superior, cursed and enchanted monsters each know a randomly chosen spell."] };
let inspecting = null;             // { foe, close, help, hits } while it's up; close and hits are screen rects

// Game over: at 0 hp the character dies, as the blow that kills them lands, or the last day
// runs out (see DAY). The fog lifts, so all that's round them can be seen, dark or not; the game
// stops (no more turns, and the heartbeat and the world's trembling with it), the world stays
// washed red as it is at the lowest hp (if that's how it ended), and a box comes up over it,
// centred like the notice, `w` px wide ("game-over", 445:22485, 2026-10-11): along the top
// "GAME OVER", "?" (its help, `help` or `helpDied`) and "X" (which hides it, till the next key or
// press; see SHEET); under it, on dark1 in a dark2 line, `pad` in, its parts `gap` apart:
// - the picture and its caption, `artGap` apart, `top` px above and below them (as the days ran
//   out, or they died): if the days ran out, the character, the HUD's heart six times over in
//   green on green1 (in a heart, three across), and a villager, `sideGap` apart, over
//   "YOUR JOURNEY ENDS HERE, ADVENTURER!" in brown4; if they died, the character ringed by six
//   skulls in red3 (`skulls`, px from it), over "YOU SUCCUMBED TO DEATH ON DAY" in red3 and the day in red4;
// - "See Leaderboard" (small, bw3; G too), `boardGap` over the score and the rank, each on dark2,
//   `rowPad` in: the label small at the left and the number at the right (the rank's "low" if it
//   didn't make the board; it's red4 for one who died, brown4 otherwise);
// - while the name's to be typed (see SCORE_NAME), its box, `nameH` tall in a dark2 line (blue
//   while it's being typed in): "SUBMIT NAME...[6]" while it's empty ("TRY AGAIN...[6]", red4,
//   when the board turned the last one back), then what's typed, with a "_" for each letter
//   still to come (the next blinking while it's being typed in); `ctaGap` under it, [Y] Submit Score (Enter too). Once
//   that's sent (or skipped with Esc), [S] Share to X (see SHARE; 445:38550) and [R] Restart (a new map),
//   `sentGap` apart. Each is `ctaH` tall; [Y] and [R] in green1 (red1, for one who died).
// Under the box the world's dimmed, dark1 at `dim` (fading in over `dimMs`), so what's round the
// character can still be made out, and the HUD, the log and the chat aren't.
const GAME_OVER = { dim: 0.55, dimMs: 400, w: 100, pad: 4, gap: 4, top: { time: 8, died: 4 }, artGap: 8, sideGap: 16,
  boardGap: 6, rowPad: 4, nameH: 17, ctaH: 15, ctaGap: 2, sentGap: 4, beam: 1,
  ink: { caption: "#d9a066", died: "#ac3232", day: "#d95763", board: "#696a6a", score: "#9badb7", number: "#cbdbfc", rank: "#d9a066",
    rankDied: "#d95763", name: "#cbdbfc", hint: "#4b692f", hintDied: "#ac3232", bad: "#d95763", focus: "#5b6ee1", label: "#9badb7",
    heart: "#7eae30", heartBg: "#323c39", skull: "#ac3232", villager: "#5fcde4" },
  buttons: { time: { bg: "#323c39", key: "#78c283" }, died: { bg: "#45283c", key: "#d95763" }, share: { bg: "#222034", key: "#d9a066" },
    full: { bg: "#222034", key: "#5d73ff" } },
  // (on mektxt.com, a third under them: [D] for the whole game at `fullUrl`, in a new tab, see ON_SITE;
  // the words the user's idea, 2026-10-18, its blue dos-age.com's gear's, Claude's pick)
  fullUrl: "https://dos-age.com/",
  // (the hearts' places in their 3 by 3, in cells, and the skulls' round the character, in px: 445:23391, 445:39005)
  hearts: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1], [1, 2]], skulls: [[-8, -12], [8, -12], [-16, 0], [16, 0], [-8, 12], [8, 12]],
  // (its help: the user's notes, 445:39109 and 445:39110)
  help: ["You're playing in competitive mode, which is limited by days.", "You've reached the last of your days, so your score is final.",
    "Your score goes on the leaderboard if it's in the top 30.", "Below the top 30 it isn't listed, and below 100th it isn't ranked at all."],
  helpDied: ["You've died.", "In competitive mode, your score goes on the leaderboard if it's in the top 30.",
    "Death is permanent: your character can't be brought back."],
  // (and a Daily Challenge's, either way; Claude's words, 2026-10-18)
  helpDaily: ["Today's Daily Challenge has a leaderboard of its own: your best score today is the one that counts.",
    "Play it again as often as you like, on the same map, till the next challenge comes at midnight (UTC).",
    "Death is permanent: your character can't be brought back."] };
let dead = null;                   // { at, buttons, timeUp, score, step, badName, help, hidden } once the character has died; buttons are screen rects;
                                   // step is "name" while the name's being typed, then "sent"; badName: the board turned the last one back

const canvas = document.getElementById("screen");
const ctx = canvas.getContext("2d");
let tiles = new Image();           // (a canvas once it's loaded, with FLOOR_DOT's tiles added on the end)
tiles.src = "assets/tiles.png";
let fog = [tiles]; // tile atlases per fog step, built once the tiles load
// ...and those again washed red for low health (HP_TIERS `red`), this much of the way to red
const RED_WASH = [0, 0.3, 0.6];
let fogByRed = [fog];
// "[F]" prompt over the character's head (Figma 23:11032), exported at 4x: 8x4 game px
const prompt = new Image();
prompt.src = "assets/interact.png";
// size in game px, zoom (each game px drawn as a whole number of screen px), and where its
// bottom edge sits relative to the top of the character's cell
// Tapping it (anywhere within `hitPad` game px) or the thing itself does what F does.
const PROMPT = { w: 8, h: 4, zoom: 1.25, bottom: -2.4, gap: 1, hitPad: 4,
  tap: { fontPx: 0.5, pad: 1, bg: "#222034", ink: "#ffffff" } };   // on a phone, "Tap" (in dark2, as the [F]'s box) instead
let promptRect = null;             // where the prompt was last drawn, while it's up (screen px)
const FADE_MS = 250;              // fade in after walking through a door
// Starting over is a reload (see startOver()), so it's hidden behind a curtain: the whole
// screen fades to the background, the page reloads, and the new game fades in from it
const CURTAIN_MS = 400;
let curtain = null;                // { t0 (null till the first frame's drawn), out } while it's moving
try { if (sessionStorage.getItem("mektxt.restart") === "1") curtain = { t0: null, out: false }; } catch {}
// Doors, chests and towers (the foot of one) are never lost in the fog, but you can't tell which is which from afar:
// past `reveal` cells (one beyond the edge of the light) they show as a "?" instead, pulsing
// between these opacities at any distance. Closer than that they're drawn like everything else.
const LANDMARK = { reveal: FOG_STEPS[1].from + 1, min: 0.25, max: 0.6, periodMs: 1800 };

const key = (x, y) => `${x},${y}`;
// (the outside map and the room inside the house are laid out fresh on every load, from the
// journey's seed, so every visit has its own way to find)
// A lady haunts the starting zone LADY_ODDS of the time in the house, as often outside it,
// and never both: one roll picks where, if anywhere
const LADY_ODDS = 0.2;
const ladyRoll = random();
// (where they're on, "?lady=outside" or "?lady=inside" has her there, for trying out her words)
const ladyAt = ["inside", "outside"].includes(options.get("lady")) ? options.get("lady")
  : ladyRoll < LADY_ODDS ? "inside" : ladyRoll < 2 * LADY_ODDS ? "outside" : null;
// (for trying out the forest's second biome, "?biome=<n>" in the address brings it n times
// further off: "?biome=0.1" has it start right by the house)
// ...and "?site=church", "?site=graveyard", "?site=bandits", "?site=ring", "?site=village" or
// "?site=bush" (or "?site=lake") has one of those rare sites (world.js SITES) a little way off, past SITE_TRY cell
// widths ("&siteIn=<n>" the first in biome n, 0 the first: with "?biome=" bringing it near)
const world = makeWorld(SCENE, seed, { lady: ladyAt === "outside",
  biomeScale: Number(options.get("biome")) || 1,
  site: options.get("site"), siteIn: options.has("siteIn") ? Number(options.get("siteIn")) : null, shrine: options.get("shrine") });
const { props, ground, blocked, treeAt, trailAt, river } = world;
// Each time the forest's laid out further (its chunks, in the order they came), and each time
// what's laid out is changed (a cave's way out opened, a chest left, see reshape()), noted in
// order, so a save can lay it all out again just the same (see SAVE): which chunks come of it
// hangs on what was there before them. ["grow", x0, y0, x1, y1], ["exit", entrance, at] or ["edit", edit]
const worldLog = [];
{
  const lay = world.extend;
  world.extend = (x0, y0, x1, y1) => {
    const had = world.chunks(), n = lay(x0, y0, x1, y1);
    if (world.chunks() !== had) worldLog.push(["grow", x0, y0, x1, y1]);
    return n;
  };
}

// Maps, joined by doorways: stepping onto one of a map's `doors` puts the character on the
// map it leads `to`, at the door's `spawn` cell or that map's own. `interactables` are what F
// can be used on, once standing right next to one; `keepClear` the doorways and their
// doorsteps, which enemies never stand on. `says` is what the log says on arriving.
const [doorX, doorY] = world.door;
// A room (the house's, or a shed's, see shedMap()) is a map of its own: only its cells, minus
// walls and furniture, can be walked on, its walls block sight, and its chest, if it has one,
// holds `loot`. Its way out leads `back` outside. A red house's or shed's chest more (world.js
// RED_BLUE) holds what an enemy might drop, or, if it's a blue one, a spell of tier I, II or III,
// as likely, as the fairy ring's do (see RITE).
function roomMap(r, { id, says, loot, back }) {
  const open = new Set(r.cells.map(([x, y]) => key(x, y)));
  for (const [x, y] of r.blocked) open.delete(key(x, y));
  const more = r.extra ? [[key(...r.extra.at), r.extra.blue ? rollSkill(1 + Math.floor(random() * 3)) : chestLoot(biomeTier(...back))]] : [];
  const chests = [...(r.chest ? [r.chest] : []), ...(r.extra ? [r.extra.at] : [])];
  return {
    id, room: r, says, spawn: r.player,
    open: (x, y) => open.has(key(x, y)),
    clear: (x, y) => open.add(key(x, y)),   // (where a ghost stood, once she's gone: see sayWord())
    walls: new Set((r.walls ?? r.cells.filter(([, , t]) => t === SCENE.inside.wall || t === SCENE.inside.exit)).map(([x, y]) => key(x, y))),
    interactables: chests,
    loot: new Map([...(r.chest ? [[key(...r.chest), loot]] : []), ...more]),
    drops: new Map(),
    landmarks: new Set([r.exit, ...chests].map(c => key(...c))),
    doors: new Map([[key(...r.exit), { to: () => MAPS.outside, spawn: back }]]),
    keepClear: new Set([key(...r.exit), key(...r.player)]),
    out: back,                     // (where it is, outside: see MONSTER_FAR)
  };
}
const MAPS = {
  outside: {
    id: "outside", says: "You step back outside.",
    // the forest closes the map in on every side, so there's no edge to check; the river's
    // water can't be walked into, only its bridges and sandbars
    open: (x, y) => !blocked.has(key(x, y)) && (treeAt(x, y) === null || hits.get(key(x, y)) === CHOP.hits) &&
      river.cell(x, y) !== "water",
    interactables: [world.chest, world.caveChest],
    // what's in each chest: a variant, until it's opened and its affix is rolled (the one by
    // the cave always holds a plain torch, for the dark down there)
    loot: new Map([[key(...world.chest), "axe"], [key(...world.caveChest), "torch-normal"]]),
    drops: new Map(),              // the items lying on the ground (left by an enemy or dropped), by cell: a pile, the last on top
    landmarks: new Set([world.door, world.chest, world.caveChest, world.entrance, ...world.towers.map(t => t.door)].map(c => key(...c))),
    // the house's door, the cave's entrance, and each shed's once its clearing is laid out (see wakePatches())
    doors: new Map([[key(doorX, doorY), { to: () => MAPS.inside }], [key(...world.entrance), { to: () => caveMap(1) }]]),
    keepClear: new Set([key(doorX, doorY), key(doorX, doorY + 1), key(...world.entrance), key(world.entrance[0], world.entrance[1] + 1)]),
  },
  // Inside the house, back out onto the road
  inside: roomMap(makeRoom(SCENE, seed, { lady: ladyAt === "inside", extra: world.redHouse }),
    { id: "inside", says: "You enter the house.", loot: variantOf("armour", 1), back: [doorX, doorY + 1] }),   // (its chest: any tier I armour, the user's, 2026-10-12)
};
// A shed's room (world.js), laid out the first time its door is walked into, from dice
// seeded by where it stands, and kept from then on: what's taken stays taken, and what's
// killed stays dead. Its chest, if it has one, holds whatever an enemy might drop, and its
// slime, if it has one, lives there. Its way out leads back to the shed's doorstep.
// (`chest`: it always has one, see world.js makeShed(); `extra`: a red shed's chest more)
const sheds = new Map();           // door cell -> its room's map
const ROOM_SAYS = { shed: "You enter the shed.", house: "You enter the house.", hall: "You enter the hall." };
function shedMap([x, y], { chest = false, extra = false } = {}) {
  const k = key(x, y);
  if (!sheds.has(k)) {
    const r = makeShed(SCENE, seed + 7919 * x + 104729 * y, { chest, extra });
    const says = ROOM_SAYS[roomDoors.get(k)?.room] ?? ROOM_SAYS.shed;   // (a village's house, a hideout's hall: world.js `room`)
    const m = roomMap(r, { id: `shed ${k}`, says, loot: chestLoot(biomeTier(x, y)), back: [x, y + 1] });
    if (r.slime) addFoe(r.slimeKind, r.slime, m);
    const note = shedNote(x, y);   // (see NOTES)
    if (note) pinNote(m, note, Math.floor(random() * 64));
    m.made = { chest, extra };     // (for a save, see SAVE)
    sheds.set(k, m);
  }
  return sheds.get(k);
}
// Inside a church (world.js makeChurch(), the wooden one's or the stone one's, `kind`), the
// first time its door is walked into, kept from then on like a shed's room. While the
// character's there the chant goes on (sound.js chant()) and its people talk (see CHURCH).
const churches = new Map();        // door cell -> its map
function churchMap([x, y], kind) {
  const k = key(x, y);
  if (!churches.has(k)) {
    const r = makeChurch(SCENE, kind);
    // (each of its people's looks, for when a spell makes one a monster, see FAITHFUL)
    for (const [cx, cy, t] of r.cells)
      if ([...r.chanters, ...r.parishioners].some(([px, py]) => px === cx && py === cy)) SCENE[`faithful${t}`] ??= { normal: { left: t, right: t } };
    churches.set(k, { ...roomMap(r, { id: `church ${k}`, says: "You enter the church.", back: [x, y + 1] }), church: true, made: { kind } });
  }
  return churches.get(k);
}
// A floor of the cave (cave.js), `depth` floors down: laid out the first time it's come to,
// from dice seeded by how deep it is, and kept from then on, like a shed's room. Its stairs are
// doorways: the ones up lead to the floor above, beside its stairs down (or, from the first
// floor, back out by the cave's entrance), and the ones down to the floor below. All but its
// floor is dirt, which blocks walking and sight (`dug` is how far what's being dug out has got,
// see DIG and TOOL_HITS), and what's been seen of it is `remembered` (drawn dimly from then on, see
// drawCave()), so the way back can be found in the dark.
// Every cave out in the forest (world.js WILD_CAVE) is one of its own, its floors by its
// `entrance` (the first cave's, by default), laid out and kept the same way. A cave is
// CAVE_EXIT.floors deep (min..max, rolled for each cave the first time it's gone into): the last floor's way down leads up and out instead, into the forest
// somewhere else, `away` cell widths (min..max) from its entrance, any way, where a hole (the
// stairs down) goes back down to it, so a cave is a way through the forest, and there are
// more of them out there to find. Its stone rooms'
// chests hold what one outside would, but of their floor's tier (floor n's tier n, see
// lootBase()), and on KING.chance of its floors the goblin king's waiting (see KING).
const caves = new Map();           // entrance and depth -> its map
const CAVE_EXIT = { floors: [4, 4], away: [70, 120] };   // (every cave 4 floors since cave-3 and cave-4 came, the user's ask, 2026-10-11; was 2-3)
const caveExits = new Map();       // entrance -> where its way out comes up in the forest
const caveDepths = new Map();      // entrance -> how many floors it has
function caveFloors(entrance) {
  const k = key(...entrance), [lo, hi] = CAVE_EXIT.floors;
  if (!caveDepths.has(k)) caveDepths.set(k, lo + Math.floor(random() * (hi - lo + 1)));
  return caveDepths.get(k);
}
// Where a cave's way out comes up: found the first time it's needed, on open ground with more
// below it to step out onto, and from then on a door back down
// (`was`: where a saved one came up, see SAVE)
function caveExit(entrance, was = null) {
  const k = key(...entrance);
  if (caveExits.has(k)) return caveExits.get(k);
  if (was) {
    caveExits.set(k, was);
    return openCaveExit(entrance, was);
  }
  const a = random() * 2 * Math.PI, d = CAVE_EXIT.away[0] + random() * (CAVE_EXIT.away[1] - CAVE_EXIT.away[0]);
  const tx = entrance[0] + Math.round(d * Math.cos(a)), ty = entrance[1] + Math.round(d * 8 / 12 * Math.sin(a)), M = MAPS.outside;
  grown += world.extend(tx - 24, ty - 16, tx + 24, ty + 16);
  wakePatches();
  const fits = (x, y) => [[x, y], [x, y + 1]].every(([cx, cy]) => M.open(cx, cy) && treeAt(cx, cy) === null && !M.doors.has(key(cx, cy)) &&
    !M.keepClear.has(key(cx, cy)) && !M.loot.has(key(cx, cy)) && !world.sanctuary.has(key(cx, cy)) && river.cell(cx, cy) === null && !foeAt(cx, cy));
  let at = null;
  for (let r = 0; r <= 20 && !at; r++)
    for (let dy = -r; dy <= r && !at; dy++)
      for (let dx = -r; dx <= r && !at; dx++)
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r && fits(tx + dx, ty + dy)) at = [tx + dx, ty + dy];
  at ??= [tx, ty];                 // (nowhere at all: the forest there gives way)
  caveExits.set(k, at);
  return openCaveExit(entrance, at);
}
function openCaveExit(entrance, at) {
  const M = MAPS.outside;
  worldLog.push(["exit", entrance, at]);
  blocked.delete(key(...at));
  ground.push([...at, SCENE.underground.down]);
  M.doors.set(key(...at), { to: () => caveMap(caveFloors(entrance), entrance), spawn: () => caveMap(caveFloors(entrance), entrance).cave.below });
  M.keepClear.add(key(...at)).add(key(at[0], at[1] + 1));
  M.landmarks.add(key(...at));
  return at;
}
function caveMap(depth, entrance = world.entrance) {
  const k = `${key(...entrance)} ${depth}`, first = entrance === world.entrance;
  if (!caves.has(k)) {
    // (the blacksmith's here if he was put here; till he's been put on a floor, each from
    // SMITH.from down has him `chance` of the time ("?smith": every one); a save taken up again
    // only puts him back where he was, see restore())
    const id = `cave ${k}`;
    const forge = smith ? smith.map === id : !restoring && (options.has("smith") || (depth >= SMITH.from && random() < SMITH.chance));
    // ("?shrine=<kind>": a shrine of that kind on the first floor too, see SHRINE)
    const c = makeCave(SCENE, seed + 15485863 * depth + (first ? 0 : 7919 * entrance[0] + 104729 * entrance[1]), depth, options.has("feast"), forge,
      depth === 1 && SCENE.shrines[options.get("shrine")] ? options.get("shrine") : null);
    if (forge && c.forge && !smith) smith = { map: id, met: false, heard: false, floorHp: 0, lost: 0, upgrades: 0 };
    const [ex, ey] = entrance;
    const up = depth > 1
      ? { to: () => caveMap(depth - 1, entrance), spawn: () => caveMap(depth - 1, entrance).cave.below, says: `You climb back up to floor ${depth - 1} of the cave.` }
      : { to: () => MAPS.outside, spawn: [ex, ey + 1] };
    const m = {
      id, cave: c, depth, entrance, spawn: c.spawn, ...CAVE,
      says: depth > 1 ? `You climb down to floor ${depth} of the cave.` : "You climb down into the cave. It's dark.",
      open: (x, y) => c.isFloor(x, y) && !c.blocks(x, y), opaque: (x, y) => !c.isFloor(x, y) || c.shut(x, y),   // (a shut door too, see openDoor())
      interactables: [...c.chests], drops: new Map(), remembered: new Set(), dug: new Map(),
      loot: new Map(c.chests.map(at => [key(...at), chestLoot(Math.min(4, depth))])),
      landmarks: new Set([...c.chests, ...(c.shrine ? [[c.shrine.x + SCENE.shrines[c.shrine.kind].icon[0], c.shrine.y + SCENE.shrines[c.shrine.kind].icon[1]]] : [])].map(at => key(...at))),
      doors: new Map([[key(...c.up), up], [key(...c.down), depth < caveFloors(entrance) ? { to: () => caveMap(depth + 1, entrance) }
        : { to: () => MAPS.outside, spawn: () => { const [x, y] = caveExit(entrance); return [x, y + 1]; }, says: "You climb up and out, into the forest." }]]),
      keepClear: new Set([c.up, c.down, c.spawn, c.below].map(at => key(...at))),
    };
    if (depth >= caveFloors(entrance)) c.setTile(...c.down, SCENE.underground.up);   // (the way out goes up)
    // (dirt dug out by anyone, the goblin king or a worm too, is done with: whatever the character
    // had half dug of it is forgotten, or it'd still be drawn cracked, from dirt that isn't there)
    // (and what's changed of its layout is noted, for a save, see SAVE: dug out, mined, a tile changed)
    const digOut = c.dig, mine = c.mine, setTile = c.setTile;
    m.edits = [];
    c.dig = (x, y) => { m.dug.delete(key(x, y)); m.edits.push(["dig", x, y]); digOut(x, y); };
    c.mine = (x, y) => { m.edits.push(["mine", x, y]); mine(x, y); };
    c.setTile = (x, y, t) => { m.edits.push(["tile", x, y, t]); setTile(x, y, t); };
    caves.set(k, m);
    for (const { kind, at } of c.monsters) { addFoe(kind, at, m); busyMore(kind, at, m); }
    const taken = new Set(c.monsters.map(({ at }) => key(...at)));   // (miners, see JACK; ghosts, see GHOST)
    m.feasts = c.feasts.map(f => ({ table: f.table, room: new Set(f.cells.map(at => key(...at))), heard: false, roused: false }));
    c.feasts.forEach((f, i) => f.seats.forEach((at, j) => {   // (see FEAST; its room's left to it)
      addFoe(FEAST.kinds[j], at, m);
      Object.assign(foes.at(-1), { band: `feast ${m.id} ${i}`, feast: i, facing: j === 0 ? "right" : "left" });
      for (const k of m.feasts[i].room) taken.add(k);
    }));
    if (forge && c.forge) {          // (see SMITH; his room's his alone)
      const [x, y] = c.forge.at;
      m.smith = { x, y, anvil: c.forge.anvil, room: new Set(c.forge.cells.map(at => key(...at))), facing: "right", inRoom: false, mutterAt: Infinity };
      for (const k of m.smith.room) taken.add(k);
    }
    m.ghosts = [];
    for (const chance of GHOST.cave) {
      if (random() >= chance) break;
      const spots = c.rooms.flatMap(r => r.cells).filter(([x, y]) => m.open(x, y) && !taken.has(key(x, y)) && !m.keepClear.has(key(x, y)));
      if (!spots.length) break;
      const at = spots[Math.floor(random() * spots.length)];
      taken.add(key(...at));
      m.ghosts.push(at);
    }
    for (const chance of MINERS) {
      if (random() >= chance) break;
      const spots = c.rooms.flatMap(r => r.cells).filter(([x, y]) => m.open(x, y) && !taken.has(key(x, y)) && !m.keepClear.has(key(x, y)));
      if (!spots.length) break;
      const at = spots[Math.floor(random() * spots.length)];
      taken.add(key(...at));
      addJack(at, m, depth === 1 ? "miner" : "archaeologist");   // (cave-1's miners, cave-2's and -3's archaeologists)
    }
    if (c.lair && random() < Math.min(KING.max, KING.chance * depth)) {
      addBoss("goblinKing", c.lair, m, { alert: true, stalked: 0 });
    }
    carveNote(m);                  // (see NOTES)
  }
  return caves.get(k);
}

// What the character can see (sight.js), out to the edge of the fog: standing forest trees (a
// stump doesn't count), the bases of the house, cave and big trees, and the room's walls block
// it. Past whatever first blocks a line of sight, the character still makes out the next
// cells along it, dimmer the further behind (BEHIND_STEPS). Nothing else out of sight is
// drawn, save a landmark's "?" and forest seen before (drawn dimly, see MEMORY_STEP); and the
// skeleton only notices the character when it's clearly in sight. Worked out again when the
// character, the map or the trees change.
let felled = 0;                    // trees cut down, so sight knows to look again
let grown = 0;                     // patches laid out further off as the character explores (likewise)
let seen = new Map();              // cell -> how clearly: 0 in sight, then 1, 2... behind
// (what `seen` was worked out for, checked a field at a time: sight() is asked of every cell
// drawn, and a key made of it all, as it was, made a new string each time, ~0.5 MB a frame)
let sightFor = null;
function sightSame() {
  const f = sightFor;
  if (!f || f.map !== map.id || f.x !== player.x || f.y !== player.y || f.felled !== felled || f.grown !== grown ||
    f.lookout !== !!lookout || f.reveal !== revealLeft > 0 || f.lights.length !== lights.length || f.light !== light()) return false;
  for (let i = 0; i < lights.length; i++) if (f.lights[i][0] !== lights[i][0] || f.lights[i][1] !== lights[i][1]) return false;
  return true;
}
const sightNoted = () => (sightFor = { map: map.id, x: player.x, y: player.y, felled, grown, lookout: !!lookout,
  reveal: revealLeft > 0, lights: lights.map(([x, y]) => [x, y]), light: light() });
const remembered = new Set();      // outside cells ever seen
// The fog step (FOG_STEPS) at least, for each cell behind what blocks the view: the first
// vaguely, the second very vaguely, then nothing
const BEHIND_STEPS = [2, 3];
// Forest seen before but out of sight now is drawn at this fog step (FOG_STEPS) or dimmer
const MEMORY_STEP = 3;
function sight() {
  if (sightSame()) return seen;
  const end = FOG_END * fogSpread() / murk() + light();   // a torch lets them see further, and daylight further still
  // from a tower: all of it, whatever's in the way (see LOOKOUT); and so, round the character,
  // nearly as far as a tower lets them see, while a Screech's echoes last (see SCREECH)
  if (lookout || revealLeft > 0) {
    const { x: ex, y: ey } = lookout ? lookout.eye : player, far = end;
    const rx = Math.ceil(far), ry = Math.ceil(far * CW / CH);
    seen = new Map();
    for (let y = Math.floor(ey) - ry; y <= Math.ceil(ey) + ry; y++)
      for (let x = Math.floor(ex) - rx; x <= Math.ceil(ex) + rx; x++)
        if (fogDistance(x - ex, y - ey, CW, CH) < far) { seen.set(key(x, y), 0); (map === MAPS.outside ? remembered : map.remembered)?.add(key(x, y)); }
    sightNoted();
    return seen;
  }
  const opaque = map === MAPS.outside
    ? (x, y) => world.opaque.has(key(x, y)) || (treeAt(x, y) !== null && hits.get(key(x, y)) !== CHOP.hits)
    : map.opaque ?? ((x, y) => map.walls.has(key(x, y)));
  const inRange = (dx, dy) => fogDistance(dx, dy, CW, CH) < end;
  const { x: ox, y: oy } = player;
  seen = new Map([...fieldOfView([ox, oy], opaque, inRange)].map(c => [c, 0]));
  // Behind: along the straight line out to each cell still hidden, how far it lies past the
  // first thing in the way (in the cave, only more dirt shows there, so it reads as solid:
  // never the floor or what's on it)
  const reachX = Math.ceil(end), reachY = Math.ceil(end * CW / CH);
  for (let dy = -reachY; dy <= reachY; dy++)
    for (let dx = -reachX; dx <= reachX; dx++) {
      const c = key(ox + dx, oy + dy);
      if (seen.has(c) || !inRange(dx, dy) || (map.cave && map.open(ox + dx, oy + dy))) continue;
      const line = lineTo(dx, dy), first = line.findIndex(([lx, ly]) => opaque(ox + lx, oy + ly));
      const behind = first < 0 ? 0 : line.length - 1 - first;
      if (behind >= 1 && behind <= BEHIND_STEPS.length) seen.set(c, behind);
    }
  // ...and whatever a light can see (see LIGHT)
  const lit = (dx, dy) => fogDistance(dx, dy, CW, CH) < LIGHT.reach;
  for (const at of lights) for (const c of fieldOfView(at, opaque, lit)) seen.set(c, 0);
  const known = map === MAPS.outside ? remembered : map.remembered;
  if (known) for (const c of seen.keys()) known.add(c);
  sightNoted();
  return seen;
}
// The cells on a straight line from the origin to (dx, dy), the origin left out (Bresenham)
function lineTo(dx, dy) {
  const cells = [], n = Math.max(Math.abs(dx), Math.abs(dy));
  for (let i = 1; i <= n; i++) cells.push([Math.round(dx * i / n), Math.round(dy * i / n)]);
  return cells;
}
// How clearly a cell is seen: 0 in sight, 1 and up behind something, -1 not at all
const sightLevel = (x, y) => sight().get(key(x, y)) ?? -1;
const inSight = (x, y) => sightLevel(x, y) === 0;
// The fog atlas for a cell at a distance `step` (fogStep) and sight level, or null
// (With the fog lifted for debugging, everything is drawn as if in full light, seen or not,
// buildings and enemies included; what the character and the enemies can see stays the same.)
let noFog = false;
const sightAtlas = (step, level) => (seeAll() ? fog[0] : lookout ? fog[step < 0 ? LOOKOUT.far : step] : step < 0 || level < 0 ? null
  : fog[Math.min(Math.max(step, level ? BEHIND_STEPS[level - 1] : 0), fog.length - 1)]);
let map = MAPS.outside;
let fadeT0 = -Infinity;

// `heading` is the way they last went (or tried to), [dx, dy]: where an aimed spell's target starts
const player = { x: world.spawn[0], y: world.spawn[1], facing: "right", heading: [1, 0], hitT0: -Infinity };

// The first fog step (FOG_STEPS) that dithers things away rather than just dimming them
const DITHER_STEP = FOG_STEPS.findIndex(s => s.density);

// Enemies: skeletons stand on the road to the cave, and slimes, plain and horned, lurk
// wherever there's open ground (world.js). Like everything in a roguelike, one only acts when the
// character does (a step, or a swing at a tree), `spd` against the character's (see
// skeletonTurn()). Once the character comes within its `aggro` range (cells: for a skeleton,
// as soon as the character without a light could see it whole, before the fog's dither
// starts; for a slime, two cells past that), in sight, it has seen them: for `alertTurns` of the
// character's turns a "!" bobs over its head and it hops on the spot, and from its next turn
// it gives chase, pathfinding up to `search` cells round, until the character gets its
// `forget` range away (a skeleton gives up where the fog turns dark; a slime not till they're
// out of sight). Next to the character, it attacks instead (see FIGHT). Enemies never walk
// into one another.
// ENEMIES has each kind's stats (mirrored in the Figma "game-logic" section): hp, atk, def,
// spd (half of it is its percentage chance of dodging), aggro, forget, and `drop`, the chance it leaves an item
// when it dies. A kind that `carries` has its item from the start (drawn like a drop), named
// when it's a weapon it hits with (its stats don't count yet); one that doesn't rolls an item
// when it dies, of the tier where it is (lootBase()) or a step or two up, by its `rank`'s odds
// (items.js LOOT: the user's, 2026-10-12; a kind that `carries` has its item rolled so too).
// (Only a superior, cursed or enchanted one, or a miniboss, leaves a spell: see MONSTER_AFFIXES.)
// `dies` is what the log says then, `exp` what killing it is worth (see LEVEL), `undead` if it's
// undead (nothing turns on that since silver's bane went, 2026-10-11), `name` what it's called when that isn't its key, `affixes` what an affix
// makes of it where that isn't what MONSTER_AFFIXES would, and `desc` what its panel says about it (see MONSTER_PANEL), `rank` how hard it is (very-easy, easy, medium, hard, miniboss: the
// card's difficulty, which decides the tier of a spell it may know, see SPELLCASTERS). A kind that `hunts` is the demon (see DEMON); one that
// `wanders` is an ent (see ENT). One that `fells` walks through the forest's trees, leaving a
// "stump" or "grass" where each stood. (hp and def raised, and the demon's hp, in the balance
// pass of 2026-10-05, for the way def works now: see FIGHT) (every kind's spd raised 2026-10-12, the user's
// ask for quicker monsters: +2 where it was 9 or less, +1 where it was more; Claude's split; but
// not the very-easy slimes, the user's call the same day, so hit-and-run still works against them)
const ENEMIES = {
  skeleton: { hp: 55, atk: 3, def: 2, spd: 8, rank: "easy", aggro: FOG_STEPS[DITHER_STEP].from, forget: FOG_STEPS[3].from, drop: 0.4, carries: true, dies: "falls apart", exp: 5, undead: true,
    desc: "An animated skeleton holding past grudges." },
  // (leading a graveyard's band, see BAND: it always `casts` a firebolt of its affix's (a superior
  // one's superior), keeps `keepsAway` cells off while it's cooling down, and always leaves a
  // spell only as any foe does, see MONSTER_AFFIXES, 2026-10-12; numbers picked by Claude)
  skeletonMage: { name: "Skeleton Mage", hp: 70, atk: 3, def: 2, mag: 3, spd: 10, rank: "hard", aggro: FOG_STEPS[DITHER_STEP].from, forget: FOG_STEPS[3].from,
    drop: 0, carries: false, dies: "crumbles to dust", exp: 25, undead: true, casts: "firebolt", keepsAway: 3,
    desc: "It still remembers the words." },
  // (down in the cave: quicker than the character, so it can't be outrun)
  // (a tier II monster, out in the second biome's forest (world.js KOBOLDS): quick, and hard to
  // hit, its `dodge` more percentage points of dodging on top of what its spd gives, like gear's;
  // numbers from Claude's simulated fights, 2026-10-05)
  kobold: { hp: 35, atk: 3, def: 1, spd: 15, dodge: 20, rank: "easy", aggro: FOG_STEPS[DITHER_STEP].from, forget: FOG_STEPS[3].from, drop: 0.35,
    carries: false, dies: "squeals and falls", exp: 8, desc: "Small, quick, and gone before your blow lands." },
  // (below the cave's first floor, out on the sand (cave.js DEEP): the sand serpent, slow to
  // tire and hard to wear down; the goblin mage, which `casts` a firebolt of its affix's and keeps
  // its distance like the skeleton mage; and the goblin king, the cave's own demon (see KING);
  // numbers from Claude's simulated fights, 2026-10-05)
  sandSerpent: { name: "Sandworm", hp: 70, atk: 6, def: 3, spd: 11, rank: "medium", aggro: FOG_STEPS[DITHER_STEP].from, forget: FOG_STEPS[3].from, drop: 0.3,
    carries: false, dies: "goes still", exp: 12, digs: true, desc: "It waits under the sand for something warm." },
  goblinMage: { name: "Goblin Mage", hp: 28, atk: 2, def: 1, mag: 2, spd: 12, rank: "easy", aggro: FOG_STEPS[DITHER_STEP].from, forget: FOG_STEPS[3].from,
    drop: 0.3, carries: false, dies: "drops dead", exp: 10, casts: "firebolt", keepsAway: 3,
    desc: "It learnt one spell, and it likes it a lot." },
  goblinKing: { name: "Goblin King", hp: 180, atk: 7, def: 4, spd: 12, rank: "miniboss", aggro: Infinity, forget: Infinity, drop: 1, carries: false,
    dies: "falls, and his halls go quiet", exp: 50, burrows: true, desc: "Every tunnel down here is his, and he's coming through." },
  // (a boss of the second biome's forest (world.js GOLEMS), like the demon and the goblin king,
  // but one that never comes looking: slow, so it can be walked away from, but as hard to hurt
  // as anything and it hits like nothing else. It walks through the trees, knocking them down,
  // and the ground shakes under every step (see QUAKE); numbers from Claude's simulated fights,
  // 2026-10-05)
  golem: { hp: 320, atk: 11, def: 8, spd: 8, rank: "miniboss", aggro: FOG_STEPS[DITHER_STEP].from, forget: FOG_END, drop: 1, carries: false,
    dies: "crumbles into a heap of stone", exp: 80, fells: "stump", heavy: true, desc: "A mountain that learnt to walk. Slowly." },
  goblinGrunt: { name: "Goblin Grunt", hp: 30, atk: 3, def: 1, spd: 14, rank: "easy", aggro: FOG_STEPS[DITHER_STEP].from, forget: FOG_STEPS[3].from, drop: 0.25, carries: false,
    dies: "drops dead", exp: 5, desc: "A small, mean thing, and quicker than it looks." },
  slime: { hp: 20, atk: 2, def: 0, spd: 6, rank: "very-easy", aggro: FOG_STEPS[DITHER_STEP].from + 2, forget: FOG_END, drop: 0.2, carries: false, dies: "bursts", exp: 3,
    desc: "A wobbling blob that dissolves its prey." },
  hornedSlime: { name: "Horned Slime", hp: 32, atk: 3, def: 1, spd: 7, rank: "very-easy", aggro: FOG_STEPS[DITHER_STEP].from + 2, forget: FOG_END, drop: 0.25, carries: false,
    dies: "bursts", exp: 4,
    desc: "A horned wobbling blob that dissolves its prey." },
  demon: { hp: 200, atk: 6, def: 4, mag: 15, spd: 13, rank: "miniboss", aggro: Infinity, forget: Infinity, drop: 1, carries: false,
    dies: "is banished", exp: 60, undead: true, hunts: true, fells: "stump", desc: "It hunts you through the first forest, and it never stops." },
  // (a lumberjack who's been hurt, see JACK: as strong as a cursed ent, at his own pace)
  lumberjack: { hp: 130, atk: 6, def: 3, spd: 8, rank: "medium", aggro: Infinity, forget: Infinity, drop: 0.5, carries: false,
    dies: "falls", exp: 24, fells: "stump", desc: "He had trees to cut. Now he has you." },
  // (and a miner who's been hurt, the same, down in the cave, looking like a lumberjack (`look`))
  miner: { hp: 130, atk: 6, def: 3, spd: 8, rank: "medium", aggro: Infinity, forget: Infinity, drop: 0.5, carries: false,
    dies: "falls", exp: 24, desc: "He had rock to dig. Now he has you." },
  // (a bandits' hideout's band, 3 to 5 of them, see BAND: all bandits since v0.12, as forest-1's
  // card has it, 450:77379; the exp and loot Claude's)
  bandit: { hp: 100, atk: 4, def: 3, spd: 8, rank: "medium", aggro: FOG_STEPS[DITHER_STEP].from, forget: FOG_STEPS[3].from, drop: 0.4,
    carries: true, dies: "falls", exp: 12, desc: "Lives off whatever comes down the road." },
  // (a past player's ghost, see GHOSTS: its stats, spell, look and name are the player's own)
  shade: { hp: 100, atk: 3, def: 1, spd: 11, rank: "medium", aggro: FOG_STEPS[DITHER_STEP].from, forget: FOG_STEPS[3].from, drop: 0, carries: false,
    dies: "fades away", exp: 30, undead: true, desc: "Someone who walked this forest before you, and won't rest." },
  // (a church's people, once a spell of the character's hits one, see FAITHFUL: they never move or fight back)
  parishioner: { hp: 20, atk: 0, def: 0, spd: 4, rank: "very-easy", aggro: -Infinity, forget: Infinity, drop: 0, carries: false,
    dies: "falls", exp: 0, still: true, desc: "Here to pray." },
  chanter: { hp: 24, atk: 0, def: 0, spd: 4, rank: "very-easy", aggro: -Infinity, forget: Infinity, drop: 0, carries: false,
    dies: "falls silent", exp: 0, still: true, desc: "Here to sing the hours." },
  ent: { hp: 100, atk: 4, def: 3, spd: 8, rank: "medium", aggro: -Infinity, forget: FOG_STEPS[3].from, drop: 0.5, carries: false,
    dies: "crashes down", exp: 12, wanders: true, fells: "grass", desc: "An old tree that pulled up its roots." },
  // v0.12's new ones ("monster", 450:77570; stats Claude's, approved by the user 2026-10-11). Forest-1's
  // zombie rises at night (see NIGHT), and its fuzhu only stirs by day (`day`) and keeps away (`evasive`,
  // see EVADE); forest-2's hound comes at night, and its kobold duelist goes about with the kobolds
  zombie: { hp: 70, atk: 3, def: 1, spd: 6, rank: "easy", aggro: FOG_STEPS[DITHER_STEP].from, forget: FOG_STEPS[3].from, drop: 0.3, carries: false,
    dies: "falls apart", exp: 6, undead: true, desc: "Slow, rotten, and it doesn't feel a thing." },
  fuzhu: { hp: 80, atk: 6, def: 2, mag: 2, spd: 17, dodge: 30, rank: "hard", aggro: FOG_STEPS[DITHER_STEP].from, forget: FOG_STEPS[3].from, drop: 0.5, carries: false,
    dies: "falls, and the ground goes dry", exp: 25, evasive: true, day: true, desc: "A white deer with four horns. Floods follow wherever it's seen." },
  hound: { hp: 35, atk: 4, def: 0, spd: 15, rank: "easy", aggro: FOG_STEPS[DITHER_STEP].from, forget: FOG_STEPS[3].from, drop: 0.2, carries: false,
    dies: "yelps and goes still", exp: 6, desc: "It hunts by night, and by smell." },
  koboldDuelist: { name: "Kobold Duelist", hp: 60, atk: 5, def: 2, spd: 16, dodge: 25, rank: "medium", aggro: FOG_STEPS[DITHER_STEP].from, forget: FOG_STEPS[3].from, drop: 0.4,
    carries: false, dies: "squeals and falls", exp: 15, desc: "A kobold that learnt to fence, and won't let you forget it." },
  // ...forest-3's (out in the third biome, see world.js FOREST3, and at night there, see NIGHT): the acolyte casts
  // firebolts from afar like a goblin mage, the skeleton archer shoots arrows (see FOE_SPELLS.shoot)
  acolyte: { name: "Acolyte", hp: 40, atk: 2, def: 1, mag: 2, spd: 10, rank: "easy", aggro: FOG_STEPS[DITHER_STEP].from, forget: FOG_STEPS[3].from, drop: 0.3, carries: false,
    dies: "falls", exp: 8, casts: "firebolt", keepsAway: 3, desc: "Sworn to something under the graves, and glad to show you." },
  skeletonArcher: { name: "Skeleton Archer", hp: 40, atk: 3, def: 1, spd: 9, rank: "easy", aggro: FOG_STEPS[DITHER_STEP].from, forget: FOG_STEPS[3].from, drop: 0.3, carries: false,
    dies: "falls apart", exp: 7, undead: true, casts: "shoot", keepsAway: 3, desc: "Its aim outlived its eyes." },
  wraith: { hp: 75, atk: 5, def: 1, mag: 2, spd: 12, rank: "medium", aggro: FOG_STEPS[DITHER_STEP].from, forget: FOG_STEPS[3].from, drop: 0.35, carries: false,
    dies: "fades into the cold", exp: 16, undead: true, desc: "Cold air in the shape of a grudge." },
  // ...the villagers' (no villages yet: none appear), once they're hurt (`calm` till then, as a
  // lumberjack is, see JACK); the second to the fourth keep away (EVADE)
  villager1: { name: "Villager", hp: 70, atk: 4, def: 2, spd: 11, rank: "medium", aggro: Infinity, forget: Infinity, drop: 0.3, carries: false,
    dies: "falls", exp: 10, desc: "You picked a fight with the wrong neighbour." },
  villager2: { name: "Villager", hp: 40, atk: 3, def: 1, spd: 11, rank: "easy", aggro: Infinity, forget: Infinity, drop: 0.3, carries: false,
    dies: "falls", exp: 6, evasive: true, desc: "You picked a fight with the wrong neighbour." },
  villager3: { name: "Villager", hp: 40, atk: 3, def: 1, spd: 11, rank: "easy", aggro: Infinity, forget: Infinity, drop: 0.3, carries: false,
    dies: "falls", exp: 6, evasive: true, desc: "You picked a fight with the wrong neighbour." },
  villager4: { name: "Villager", hp: 40, atk: 3, def: 1, spd: 11, rank: "easy", aggro: Infinity, forget: Infinity, drop: 0.3, carries: false,
    dies: "falls", exp: 6, evasive: true, desc: "You picked a fight with the wrong neighbour." },
  // ...the caves' (by floor, see cave.js FLOORS): the goblin soldier and bulwark, the earthworm,
  // which keeps to itself as an ent does (`wanders`), and the stoneworm; the worms all dig (`digs`,
  // see WORM); and the archaeologist,
  // who digs below the first floor as a miner does above it (see JACK)
  goblinSoldier: { name: "Goblin Soldier", hp: 60, atk: 4, def: 3, spd: 11, rank: "medium", aggro: FOG_STEPS[DITHER_STEP].from, forget: FOG_STEPS[3].from, drop: 0.3, carries: false,
    dies: "drops dead", exp: 10, desc: "A grunt with a helmet, and the attitude to match." },
  goblinBulwark: { name: "Goblin Bulwark", hp: 110, atk: 4, def: 5, spd: 8, rank: "medium", aggro: FOG_STEPS[DITHER_STEP].from, forget: FOG_STEPS[3].from, drop: 0.35, carries: false,
    dies: "drops dead behind its shield", exp: 14, desc: "Mostly shield. The rest is spite." },
  earthworm: { name: "Earth Worm", hp: 90, atk: 4, def: 2, spd: 7, rank: "medium", aggro: -Infinity, forget: FOG_STEPS[3].from, drop: 0.3,
    carries: false, dies: "curls up and goes still", exp: 10, wanders: true, digs: true, desc: "A worm the size of a tunnel. It only wants the dirt." },
  stoneworm: { name: "Earth Stone Worm", hp: 160, atk: 7, def: 6, spd: 7, rank: "hard", aggro: FOG_STEPS[DITHER_STEP].from, forget: FOG_STEPS[3].from, drop: 0.5,
    carries: false, dies: "crumbles", exp: 30, digs: true, long: true, desc: "Its skin is rock, and so is its patience." },
  archaeologist: { hp: 110, atk: 5, def: 3, mag: 2, spd: 10, rank: "medium", aggro: Infinity, forget: Infinity, drop: 0.5,
    carries: false, dies: "falls", exp: 20, desc: "You're standing on a find. Soon you'll be one." },
  // ...and two minibosses: the lich, forest-3's (world.js LICH_CHUNK), which casts thunderbolts from
  // afar and raises `raises` skeletons round it every `raiseEvery` turns while it's after the
  // character (see LICH), and the iron hound, forest-2's hunter, which comes for the character as
  // the demon does (see HUNTERS), felling the trees in its way as the demon and the golem do (see treesFall())
  lich: { hp: 220, atk: 4, def: 4, mag: 6, spd: 11, rank: "miniboss", aggro: FOG_STEPS[DITHER_STEP].from, forget: FOG_STEPS[3].from, drop: 1,
    carries: false, dies: "crumbles, and its notes with it", exp: 70, undead: true, casts: "thunderbolt", keepsAway: 3,
    raises: [2, 3], raiseEvery: 20, desc: "It cheated death, and kept the notes." },
  ironHound: { name: "Iron Hound", hp: 240, atk: 9, def: 6, spd: 15, rank: "miniboss", aggro: Infinity, forget: Infinity, drop: 1,
    carries: false, dies: "clangs to the ground", exp: 70, hunts: true, fells: "stump",
    desc: "Iron jaws, iron nerves, and your scent in the second forest." },
};
// The demon: one on every outside map, starting far off (world.js), that always knows where
// the character is and comes for them, so they can't stay on a map for ever. While it's
// `near` cells away or more it stalks, a step every `stalkEvery` of the character's turns
// (so there's time to explore and gear up first, and running keeps ahead of it); closer, it
// moves at its own spd, faster than the character's, and can't be outrun. It walks straight
// through the forest, felling every tree it walks into, and around anything else; within
// `hear` cells the trees are heard coming down, and the log says so the first time. It can't
// cross the river's water: with the river between them, it makes for whichever crossing
// (world.js) makes the shortest way round, looking up to `reach` px along the river beyond
// either of them.
// Once the character's banished every demon there is, more come: one more than last time
// (1, then 2, then 3...), starting `closer` times as far off as the last ones did (DEMON_AWAY
// at first, in world.js), round wherever the character is then, so each lot's on them sooner.
const DEMON = { stalkEvery: 4, near: FOG_END, hear: 30, reach: 500, closer: 0.7, search: 40, ink: "#ff2a3a" };
// The goblin king: down in the cave, KING.chance of a floor for each floor down (at most `max`),
// he waits in the room furthest from where the character comes down (cave.js `lair`), always
// knows where they are and comes for them: while `near` cells off or more, a step every
// `stalkEvery` of their turns, digging through the dirt in his way, straight at them; closer,
// at his own spd, and through the open where there's a way. Within `hear` cells his digging's
// heard, and the log says so the first time. He stays on his floor. (Claude's numbers, 2026-10-05)
const KING = { chance: 0.2, max: 0.75, stalkEvery: 3, near: FOG_END, hear: 25 };
// The ents: many of them, starting far off (world.js), roaming the forest at their spd (so a
// little slower than the character), and trampling the trees in their way
// into grass that can be walked on, so there are trails to come across. They keep on the way
// they're going, turning a new way `turn` of the time or when it's blocked, and head back
// towards where they started when they're more than `roam` cells from it, so each keeps to
// its own part of the forest (there are more further out, see WILD_ENT in world.js). Like the
// lumberjacks, they only stir within `awake` cells of the character. They never notice the character; hit one and it fights back, chasing like a
// skeleton (through the trees) until the character is `forget` cells off, then wanders again.
const ENT = { turn: 0.2, roam: 50, awake: 120 };
const overgrown = new Set();       // forest cells an ent has trampled into grass
const ENEMY = { search: 16, alertTurns: 3, hop: [0, -1], hopMs: 110 };
// Every monster comes with an affix ("monster", 104:33366), rolled as it appears, `odds` % of
// the time (by the day it is: the first's, the second's, the third's and on), so the stronger
// ones turn up more as the days go: it's named for it (a normal one just by its kind), tinted for it
// (tools/extract.py), and its kind's stats change by it: hp by `hp` of the kind's, the rest
// by whole points (atk never below 1, def never below 0), and what it's worth by `exp` times.
// Its loot's tier odds (its kind's rank's, items.js LOOT) are moved by `loot`, [points onto a
// step down, onto +1, onto +2] (items.js lootOdds()), and only a superior, cursed or enchanted one
// leaves a spell, `spell` of the time, in place of anything else, but for a miniboss, which
// leaves one MINIBOSS_SPELL of the time whatever its affix (the user's rules, 2026-10-12; the
// numbers Claude's, the miniboss's what it was)
const MINIBOSS_SPELL = 0.1;
// (an affix's word, as a Yig's name has it, translated where it's shown)
const AFFIX_NAMES = { weak: english("Weak"), normal: english("Normal"), superior: english("Superior"), cursed: english("Cursed"), enchanted: english("Enchanted") };
const MONSTER_AFFIXES = {
  weak: { odds: [30, 20, 10], hp: -1 / 6, atk: -1, def: 0, spd: 0, exp: 0.5, loot: [10, 0, 0] },
  normal: { odds: [42, 40, 32], hp: 0, atk: 0, def: 0, spd: 0, exp: 1 },
  superior: { odds: [18, 25, 32], hp: 1 / 6, atk: 1, def: 1, spd: 0, mag: 1, exp: 1.5, loot: [0, 5, 1], spell: 0.1 },
  cursed: { odds: [7, 10, 18], hp: 1 / 3, atk: 2, def: 0, spd: -2, mag: 2, exp: 2, loot: [0, 10, 2], spell: 0.15 },
  enchanted: { odds: [3, 5, 8], hp: 1 / 6, atk: 1, def: 1, spd: 2, mag: 1, exp: 2, loot: [0, 15, 3], spell: 0.2 },
};
// ...and each day after the first, whatever appears (wherever the character's not been yet, the
// night's risen dead, the demons) has `hp` more of its hp and `atk` more atk for each
// (balance pass 2026-10-05; numbers from Claude's simulated fights)
const MONSTER_DAYS = { hp: 0.15, atk: 1 };
const dayHp = () => MONSTER_DAYS.hp;
// ...and the further from where the journey started it is, the stronger: past `safe` cells
// (in cell widths, as the fog counts them) every `every` more is a step, and each floor of a cave
// past the first `floor` more (a cave or shed counting from where it is outside); each step adds
// `hp` of its hp, and every `atkEvery` steps 1 atk. Not the demon, which has its days.
// (for now, till there are monsters of their own further out; Claude's numbers, 2026-10-05)
const MONSTER_FAR = { safe: 60, every: 60, floor: 1, hp: 0.1, atkEvery: 2 };
function farSteps(on, x, y) {
  const [ox, oy] = on === MAPS.outside ? [x, y] : on.entrance ?? on.out ?? world.spawn;
  const d = fogDistance(ox - world.spawn[0], oy - world.spawn[1], CW, CH);
  return Math.floor(Math.max(0, d - MONSTER_FAR.safe) / MONSTER_FAR.every) + MONSTER_FAR.floor * Math.max(0, (on.depth ?? 1) - 1);
}
let monsterDay = 1;                // the day it is, as far as the monsters go (see sunrise())
// A superior, cursed or enchanted monster (not a miniboss that hunts the character) knows one
// spell, rolled like one found (rollSkill() in skills.js), tier I, or, for a medium or hard one
// (its kind's `rank`), tier II `tier2` of the time (the user's rule, 2026-10-11), and casts it as
// the character would (see FOE_SPELLS); its spells' damage is from its mag, as the character's is
// from theirs: its kind's `mag` (1 if it has none, like the character's to start with), and an
// enchanted one's 1 more
const SPELLCASTERS = ["superior", "cursed", "enchanted"], MONSTER_SPELLS = { tier2: 0.3, ranks: ["medium", "hard"] };
function rollMonsterAffix() {
  if (DAILY.affix) return DAILY.affix;   // (Omen's cursed, Enchanted's enchanted: every one, see DAILY)
  const of = ({ odds }) => odds[Math.min(monsterDay, odds.length) - 1];
  let r = random() * Object.values(MONSTER_AFFIXES).reduce((sum, a) => sum + of(a), 0);
  for (const [affix, a] of Object.entries(MONSTER_AFFIXES)) if ((r -= of(a)) < 0) return affix;
  return "normal";
}
const foes = [];
const yigs = [];                   // the Yig the character has summoned (see YIG)
// Each lives on a map (`on`): outside, or a shed's room. Only those where the character is
// take turns, and only they're drawn.
function addFoe(kind, [x, y], on = MAPS.outside, affix = rollMonsterAffix()) {
  const e = ENEMIES[kind], a = MONSTER_AFFIXES[affix];
  const title = w => w[0].toUpperCase() + w.slice(1), kindName = e.name ?? title(kind);
  const name = affix === "normal" ? kindName : `${title(affix)} ${kindName}`;
  const own = { hp: Math.round(e.hp * (1 + a.hp)), atk: Math.max(1, e.atk + a.atk), def: Math.max(0, e.def + a.def),
    spd: Math.max(1, e.spd + a.spd), mag: Math.max(1, (e.mag ?? 1) + (a.mag ?? 0)), ...e.affixes?.[affix] };
  const later = monsterDay - 1, far = e.hunts ? 0 : farSteps(on, x, y);   // (see MONSTER_DAYS and MONSTER_FAR)
  own.hp = Math.round(own.hp * (1 + dayHp() * later + MONSTER_FAR.hp * far));
  own.atk += MONSTER_DAYS.atk * later + Math.floor(far / MONSTER_FAR.atkEvery);
  // (a Daily Challenge's affixes, see DAILY: its stats, dodge and noticing on every monster, and its
  // spell for one that knows none of its own, of its affix)
  for (const [k, v] of Object.entries(DAILY.stats)) own[k] = Math.max(k === "def" ? 0 : 1, own[k] + v);
  if (DAILY.dodge) own.dodge = (e.dodge ?? 0) + DAILY.dodge;
  if (DAILY.aggro !== 1 && e.aggro) Object.assign(own, { aggro: e.aggro * DAILY.aggro, forget: Math.max(e.forget ?? 0, e.aggro * DAILY.aggro) });
  const spell = e.casts ? `${e.casts}-${e.casts === "shoot" ? "normal" : affix}` : SPELLCASTERS.includes(affix) && !e.hunts && !e.burrows
    ? rollSkill(MONSTER_SPELLS.ranks.includes(e.rank) && random() < MONSTER_SPELLS.tier2 ? 2 : 1) : null;
  foes.push({ kind, ...e, affix, name, kindName, called: name.toLowerCase(), ...own, fullHp: own.hp,
    exp: Math.max(1, Math.round(e.exp * a.exp)), on, x, y, home: [x, y], facing: "left", alert: false, alertT0: 0, alertLeft: 0, energy: 0, dead: false,
    hitT0: -Infinity, gear: e.carries ? drop(lootBase(on, x, y), lootOdds(e.rank, a.loot)) : null, anim: { t0: -Infinity, fromX: x, fromY: y },
    spell: spell ?? (DAILY.spell && !e.burrows && SKILLS[`${DAILY.spell}-${affix}`] ? `${DAILY.spell}-${affix}` : null),
    cooling: 0, boosts: [], regen: [] });
  // (a long one's tail, see WORM: on open ground behind it, or dug out where it lies)
  if (e.long && !on.open(x + 1, y)) {
    if (on.open(x - 1, y)) foes.at(-1).facing = "right";
    else if (on.cave?.diggable(x + 1, y)) on.cave.dig(x + 1, y);
  }
}
// A Busy Daily Challenge's crowd (see DAILY): one of each `more` of the forests' and the caves'
// monsters, as it's laid out, has another of its kind beside it (on `on`, open ground next to it)
function busyMore(kind, at, on) {
  if (!DAILY.more || random() >= DAILY.more) return;
  const by = openBeside(at, on);
  if (by) addFoe(kind, by, on);
}
// Open ground next to (x, y) on `on` that no one's standing on, the four cells round it first, then
// `far` cells off at most, nearest first (or null)
function openBeside([x, y], on, far = 1) {
  const free = ([cx, cy]) => on.open(cx, cy) && !on.keepClear?.has(key(cx, cy)) && !foes.some(f => !f.dead && f.on === on && f.x === cx && f.y === cy) &&
    !(on === map && cx === player.x && cy === player.y);
  const cells = [];
  for (let dy = -far; dy <= far; dy++) for (let dx = -far; dx <= far; dx++) if (dx || dy) cells.push([x + dx, y + dy]);
  return cells.sort(([ax, ay], [bx, by]) => Math.abs(ax - x) + Math.abs(ay - y) - Math.abs(bx - x) - Math.abs(by - y)).find(free) ?? null;
}
// A miniboss at `at` (with `props` on it), and on a Gemini Daily Challenge (see DAILY) another of its
// kind beside it, the same done to it: its twin, rolled as one of its own (a cell or two off, as
// there's room; none, if there's none)
const TWIN_FAR = 3;
function addBoss(kind, at, on = MAPS.outside, props = {}) {
  addFoe(kind, at, on);
  Object.assign(foes.at(-1), props);
  const by = DAILY.twins && openBeside(at, on, TWIN_FAR);
  if (!by) return;
  addFoe(kind, by, on);
  Object.assign(foes.at(-1), props);
}
// (the two skeletons on the road only rise at night, see NIGHT)
// The ghostly lady (LADY, further down): each time one comes into sight, wherever she is, the
// log says one of `lines` and her wailing is heard, softly (sound.js). Besides the one by the
// start, the odd clearing's and the house's (world.js), there are `church` ghosts round a church
// (the chance of one, then of another...), `graveyard` round a graveyard (min..max), and down in
// the cave, `cave` the chance of one on a floor, then of a second, each on the open ground there.
// (Claude's numbers.)
const GHOST = { church: [0.7, 0.3], graveyard: [2, 3], cave: [0.35, 0.15], lines: ["You hear the sound of wailing.", "A faint wailing drifts through the air.",
  "Someone is weeping, somewhere close.", "A soft wail sends a chill down your spine.", "You hear a woman sobbing in the dark."] };
let ghostCells = [], ghostPatches = -1;   // the ladies outside, listed again as more patches are laid out
function outsideGhosts() {
  if (ghostPatches !== world.patches.length) {
    ghostPatches = world.patches.length;
    ghostCells = [world.lady, ...world.patches.flatMap(p => [p.lady, ...siteGhosts(p)])].filter(Boolean);
  }
  return ghostCells;
}
// The ghosts round a site, picked as it's laid out (see wakePatches()), on its open ground
function siteGhosts(p) {
  if (p.ghosts) return p.ghosts;
  const open = (p.cells ?? []).filter(([x, y]) => MAPS.outside.open(x, y) && !MAPS.outside.keepClear.has(key(x, y)));
  let n = 0;
  if (p.kind === "church") for (const chance of GHOST.church) { if (random() >= chance) break; n++; }
  if (p.kind === "graveyard") n = GHOST.graveyard[0] + Math.floor(random() * (GHOST.graveyard[1] - GHOST.graveyard[0] + 1));
  p.ghosts = [];
  for (; n > 0 && open.length; n--) p.ghosts.push(open.splice(Math.floor(random() * open.length), 1)[0]);
  return p.ghosts;
}
const ghostsInSight = new Set();
function noticeGhosts() {
  const here = ghostsHere();
  const now = new Set(here.filter(([x, y]) => inSight(x, y) && fogStepAt(x - player.x, y - player.y) >= 0)
    .map(([x, y]) => `${map.id} ${x},${y}`));
  if ([...now].some(k => !ghostsInSight.has(k)) && !dead) {
    say(GHOST.lines[Math.floor(Math.random() * GHOST.lines.length)]);
    wail();
  }
  for (const k of ghostsInSight) if (k.startsWith(`${map.id} `) && !now.has(k)) ghostsInSight.delete(k);
  for (const k of now) ghostsInSight.add(k);
}

// Lumberjacks (npc type=man, 11:742): a few neutral ones at work in the forest (world.js),
// far apart. Like an enemy, one acts when the character does, at its `spd` against theirs: it
// swings at a forest tree beside it, `hits` swings to fell it (the character's axe takes
// CHOP.hits), steps onto the stump, and takes the next tree, mostly keeping the way it's going
// (turning `turn` of the time), or walks on when there's none. Its chopping is heard within
// `hear` cells. Walking into it gets one of its `lines` instead of a fight, taking no turn, and
// nothing walks through it. The first time it's plainly seen, the log says so. A spell can hurt
// it, though (a firebolt): then it turns red and comes for the character, as an enemy from then
// on (ENEMIES.lumberjack, never one of the affixes), straight through the trees, and never gives up.
// Miners are the same down in the cave (MINERS a floor, see caveMap()), and archaeologists below its first floor:
// they dig at the dirt instead (`hits` swings, more for hard dirt and rock, see cave.js
// STRATA), and each carries a torch, a light like the walls' (see LIGHT) wherever he goes.
// Each has his own `lines` about his work, and `tales` of the forest's and the cave's bosses,
// told `tale` of the time: a lumberjack's those of the forest he's in (`tales` by biome, forest-4
// telling forest-3's: the demon, the golem and the goblin king; the iron hound; the lich and the
// Mother). Each fits whole in the closed chat box, the name included (4 rows of about 24 letters on
// a desktop, 3 of about 30 on a phone). (Lines Claude's; tales .TIFF's codex, 2026-10-19, (T) hers,
// (C) Claude's, which forest each goes in Claude's pick)
const JACK = { spd: 6, hits: 10, turn: 0.25, hear: 12, tale: 0.5,
  lumberjack: { who: english("Lumberjack"), called: english("lumberjack"),
    lines: ["The trees won't cut themselves.", "Out of my way, I've got work to do.", "Can't you see I'm busy?",
      "Move it. Daylight's burning.", "Unless you're here to chop, keep walking.", "Less talking, more chopping.",
      "Mind the axe. I won't say it twice."],
    tales: [
      ["Something walks these woods that no axe can stop. Folk call it the demon.",
        "Trees crashing down to the east, nobody swinging. Keep moving.",
        "There's a golem in the red woods. Slow as winter, hits like an oak.",
        "My brother took an axe to a golem once. The ground shook for a week.",
        "Miners say a goblin king rules under the hills. Digs like it's water."],
      ["There's a hound in the red woods made of iron. It never tires.",
        "My axe rang off its hide like a bell. I didn't swing twice.",
        "Who forges a hound? Smiths make tools. Someone made that to hunt.",
        "It stops at the edge of the red woods. Like it's been told to.",
        "There's a golem in the red woods. Slow as winter, hits like an oak.",
        "My brother took an axe to a golem once. The ground shook for a week."],
      ["There's a dead man out here who won't lie down.",
        "They say the lich was a man once. Wanted what the forest had.",
        "Don't chop near the lone graves. Something answers.",
        "A dead man should stay dead, otherwise...",
        "My gran called this the Mother's wood. Said she gave, once.",
        "No sun gets in here. Folk say the wood's in mourning.",
        "The acolytes say Mother's forsaken us. Can't blame her.",
        "Cut a tree in the dark wood, and she hears it. So they say."]] },
  miner: { who: english("Miner"), called: english("miner"),
    lines: ["The rock won't dig itself.", "Mind your head, the ceiling's loose.", "Out of my light, friend.",
      "Pick, swing, pick, swing. That's the job.", "Keep your voice down. They listen, down here.", "Dig your own tunnel."],
    tales: ["Hear that digging? Pray it's mine.",
      "The goblin king makes his own tunnels, straight to whoever he's after.",
      "The goblin king keeps to his halls. Most days.",
      "The demon up top won't follow you down here. Small mercies.",
      "Saw a golem once, out in the red woods.",
      "A torch is the only friend you've got down here. Keep one close."] },
  // (below the cave's first floor, digging as a miner does, v0.12)
  archaeologist: { who: english("Archaeologist"), called: english("archaeologist"),
    lines: ["Careful where you step. Everything down here is a find.", "Please don't touch anything.", "Do you know how old this dirt is?",
      "Brush, don't swing. Brush.", "I'm cataloguing. Go away.", "If you break it, you're the exhibit."],
    tales: ["The goblins think these halls are theirs. The carvings disagree.",
      "Found a page in a dead man's hand. Notes on how not to die.",
      "Some worms here have skin like stone. Avoid the grey ones.",
      "The goblin king digs his own tunnels. Bad technique. Fast, though.",
      "A hound of iron hunts the red woods. Nobody's found its maker.",
      "These halls are older than the goblins. Older than the hills.",
      "Someone buried something big down here. Not the goblins."] },
};
const MINERS = [0.6, 0.3];         // the chance a floor has a first miner, and a second
const jacks = [];
const addJack = ([x, y], on = MAPS.outside, kind = "lumberjack") => jacks.push({ x, y, on, kind, facing: "left", energy: 0, heading: null,
  tree: null, chops: 0, onto: null, spotted: false, hitT0: -Infinity, anim: { t0: -Infinity, fromX: x, fromY: y } });
world.lumberjacks.forEach(at => addJack(at));
const jackAt = (x, y, on = map) => jacks.find(j => j.on === on && j.x === x && j.y === y);
const forestTree = (x, y) => treeAt(x, y) !== null && hits.get(key(x, y)) !== CHOP.hits;
function jackSays(j) {
  if (j.village !== undefined) return villagerSays(j);
  if (j.lakeHome) return lakeSays(j);
  const { lines, tales } = JACK[j.kind], here = Array.isArray(tales[0]) ? tales[Math.min(world.biomeAt(j.x, j.y), tales.length - 1)] : tales;
  const said = Math.random() < JACK.tale ? here : lines;
  say(speech(JACK[j.kind].who, pickLine(said)));
}
// The lumberjacks' and miners' turn, those on the map the character's on
function jackTurn(now) {
  const pace = Math.max(1, stat("spd"));
  for (const j of jacks) {
    if (j.on !== map || j.village !== undefined) continue;   // (a village's family keeps to its own, see VILLAGE)
    if (!j.spotted && inSight(j.x, j.y) && fogStepAt(j.x - player.x, j.y - player.y) < DITHER_STEP) {
      j.spotted = true;
      say(tl(j.rest ? "You see {who:a} resting by the water." : "You see {who:a} at work.", { who: noun(JACK[j.kind].called) }));
    }
    if (j.rest) continue;          // (by a lake, see world.js LAKE: he stays put, his axe down)
    if (fogDistance(j.x - player.x, j.y - player.y, CW, CH) > ENT.awake) continue;   // too far off to matter
    for (j.energy += JACK.spd; j.energy >= pace; j.energy -= pace) jackAct(now, j);
  }
}
function jackAct(now, j) {
  const free = (x, y) => map.open(x, y) && !map.keepClear.has(key(x, y)) && !foeAt(x, y) &&
    !jackAt(x, y) && !(x === player.x && y === player.y);
  const face = dx => { if (dx) j.facing = dx < 0 ? "left" : "right"; };
  const miner = j.kind !== "lumberjack", work = miner ? (x, y) => map.cave.diggable(x, y) : forestTree;
  if (j.tree && !work(...j.tree)) j.tree = null;   // someone else got to it first
  if (j.tree) {                    // a swing at the tree, or the dirt
    const [tx, ty] = j.tree, k = key(tx, ty), needs = JACK.hits * (miner ? map.cave.hardness(tx, ty) : 1), done = ++j.chops >= needs;
    if (miner) { if (done) map.dug.delete(k); else map.dug.set(k, j.chops / needs); }
    else {
      const stage = Math.min(CHOP.hits - 1, Math.floor(j.chops * CHOP.hits / JACK.hits));
      hits.set(k, done ? CHOP.hits : Math.max(hits.get(k) || 0, stage));
    }
    if (fogDistance(tx - player.x, ty - player.y, CW, CH) <= JACK.hear) {
      shake = { k: done ? null : k, t0: now };
      chop(done);
    }
    if (done) { felled++; if (miner) map.cave.dig(tx, ty); else fell(k); j.tree = null; j.onto = [tx, ty]; }
    return;
  }
  const step = ([x, y]) => {
    face(x - j.x);
    const from = visualPos(now, j, j.anim);
    Object.assign(j.anim, { t0: now, fromX: from.x, fromY: from.y });
    [j.x, j.y] = [x, y];
  };
  if (j.onto) {                    // onto the stump of the one just felled
    const onto = j.onto;
    j.onto = null;
    if (free(...onto)) return step(onto);
  }
  // the next tree (or dirt): the way it's going, unless it turns or there's none there
  const ways = NEIGHBOURS.filter(([dx, dy]) => work(j.x + dx, j.y + dy));
  if (ways.length) {
    const ahead = ways.find(([dx, dy]) => j.heading && dx === j.heading[0] && dy === j.heading[1]);
    j.heading = ahead && random() >= JACK.turn ? ahead : ways[Math.floor(random() * ways.length)];
    j.tree = [j.x + j.heading[0], j.y + j.heading[1]];
    j.chops = 0;
    face(j.heading[0]);
    return;
  }
  const open = NEIGHBOURS.filter(([dx, dy]) => free(j.x + dx, j.y + dy));   // no trees here: walk on
  if (!open.length) return;
  const ahead = open.find(([dx, dy]) => j.heading && dx === j.heading[0] && dy === j.heading[1]);
  j.heading = ahead && random() >= JACK.turn ? ahead : open[Math.floor(random() * open.length)];
  step([j.x + j.heading[0], j.y + j.heading[1]]);
}
// Drawn like an enemy: faded by the fog, lost in the dark
function drawJack(now, j) {
  const pos = visualPos(now, j, j.anim), atlas = skeletonAtlas(j, pos);
  if (atlas) drawSprite(SCENE[j.kind].calm[j.facing], pos, stepPose(stepProgress(now, j.anim)), 0, atlas);
}
// A lumberjack (or miner) hurt by a spell is an enemy from then on: the enemy he becomes (and a
// villager's whole family with them, wherever each is, see VILLAGE)
function enrage(j, now) {
  const family = j.village === undefined ? [j] : [j, ...jacks.filter(o => o.village === j.village && o !== j)];
  for (const o of family) {
    jacks.splice(jacks.indexOf(o), 1);
    addFoe(o.kind, [o.x, o.y], o.on, "normal");
    Object.assign(foes.at(-1), { facing: o.facing, spotted: true, alert: true, alertT0: now, alertLeft: ENEMY.alertTurns, anim: o.anim });
  }
  if (j.village !== undefined) alarm();
  say(j.village === undefined ? tr("{who:The} turns on you!", { who: noun(JACK[j.kind].called) }, INK.down) : tr("The villagers turn on you!", {}, INK.down));
  return foes.at(-family.length);
}

// The priest by a church (npc type=priest, 11:834; world.js SITES): he walks the edge of its
// grass, calmly, at his `spd`, keeping the forest at his left hand (so round and round it, the
// way a hand on a wall finds its way round), now and then stopping `pause` of the time. Nothing
// walks through him, and nothing hurts him. Walking into him, he offers to pray for the
// character (see TALK): taken up, they're blessed with a stat of their choice (as levelling up
// raises one, LEVEL_UP), and he says `amen` and steps on his way, once in the whole journey, whichever priest it is; turned down, he
// lets them be, and offers again the next time. Once a priest has prayed for them, every
// priest only says `after`. The first
// time he's plainly seen, the log says so. (His lines are Claude's suggestions.)
const PRIEST = { spd: 4, pause: 0.3,
  offer: "Peace be with you, traveller. The forest is dark and your road is long. May I pray for you?",
  amen: "Bless you, my child.",
  no: "Go in peace.",
  after: "I'm still praying for you." };
const priests = [];
let blessed = false;               // a priest's prayed for the character (see PRIEST)
// Inside a church (see churchMap()), every `every` ms (the first that long after coming in) one
// of its people says something in the log, a parishioner or, `chanters` of the time, a chanter;
// walking into one has them say something too.
const CHURCH = { every: 30000, chanters: 0.35,
  parishioner: ["Divine Liturgy is starting.", "Glory be to God for all things!", "It is later than you think.",
    "Lord, forgive me a sinner.", "Lord Jesus Christ, Son of God, have mercy on me, a sinner.", "Christ is risen!",
    "God became man so that man might become god, by grace.", "...", "Beauty will save the world."],
  chanter: ["Christ is risen from the dead!", "Kyrie eleison.", "Glory to the Father, to the Son, and to the Holy Spirit.",
    "Now and ever and unto ages of ages. Amen.", "Holy God, Holy Mighty, Holy Immortal, have mercy on us."] };
let churchTalkAt = Infinity, talkedIn = null;   // when someone next speaks, on the church map it was set for
// (never the same line twice running from one list, as the codex has it for the lake's lumberjack)
const lastPicked = new WeakMap();
function pickLine(lines) {
  const fresh = lines.length > 1 ? lines.filter(l => l !== lastPicked.get(lines)) : lines;
  const line = fresh[Math.floor(Math.random() * fresh.length)];
  lastPicked.set(lines, line);
  return line;
}
function churchSays(who, line = pickLine(CHURCH[who]), at = clock()) {
  say(speech(who === "chanter" ? english("Chanter") : english("Parishioner"), line), at);
}
// "chanter" or "parishioner", if one of them stands (alive) at x, y in the church the character's in
// (where one's fallen the floor's open, see mourn())
function churchSpeaker(x, y) {
  if (!map.church || map.open(x, y)) return null;
  const is = cells => cells.some(([cx, cy]) => cx === x && cy === y);
  return is(map.room.chanters) ? "chanter" : is(map.room.parishioners) ? "parishioner" : null;
}
// Which of a church's people are still standing there: "chanter", "parishioner", or both
const faithfulLeft = () => ["chanter", "parishioner"].filter(who => map.room[`${who}s`].some(([x, y]) => !map.open(x, y)));
function churchTalk(now) {
  if (!map.church || dead) { talkedIn = null; return; }
  if (talkedIn !== map) { talkedIn = map; churchTalkAt = now + CHURCH.every; }
  if (now < churchTalkAt) return;
  const left = faithfulLeft();
  if (left.length) churchSays(left.length > 1 ? (Math.random() < CHURCH.chanters ? "chanter" : "parishioner") : left[0]);
  churchTalkAt = now + CHURCH.every;
}
// FAITHFUL: a church's people are drawn with the room, and only a spell of the character's that
// hurts can hit them (walking into one still has them talk). The first that hits one makes them a
// monster of their own kind (`parishioner` or `chanter`, see ENEMIES) that stands `still` where they
// stood, looking as they did, never moving or fighting back; killed, their place is bare floor.
// Whoever dies in a church (one of them, a monster, the character), the others stay where they
// are and mourn: the parishioners say `mourn.parishioner`, the chanters `mourn.chanter`.
const FAITHFUL = { mourn: { parishioner: "Lord, have mercy.", chanter: "Kyrie eleison." } };
// One of a church's people, not yet hit, at x, y: "chanter" or "parishioner"
const faithfulAt = (x, y) => (map.church && !foeAt(x, y) ? churchSpeaker(x, y) : null);
// ...made a monster there (see FAITHFUL), the room's tile of them gone under it
function rouseFaithful(x, y, now) {
  const kind = faithfulAt(x, y);
  if (!kind) return null;
  const look = `faithful${map.room.cells.findLast(([cx, cy]) => cx === x && cy === y)[2]}`;
  reshape(map, ["floor", [x, y], map.room.floor]);
  addFoe(kind, [x, y], map, "normal");
  return Object.assign(foes.at(-1), { look, spotted: true, alert: true, alertT0: now, alertLeft: 0 });
}
// Someone at x, y a spell would turn on the character (a lumberjack, a miner, a villager; not the
// lumberjack's family at home, see LAKE_HOME)
const angerableAt = (x, y) => { const j = jackAt(x, y); return !!j && !j.safe; };
// Who a spell of the character's lands on at x, y: a lumberjack turns on them for it (see enrage()),
// one of a church's people is made a monster to take it (`faithful`, see FAITHFUL), else the monster there
function targetAt(x, y, now, faithful = true) {
  const j = jackAt(x, y);
  return j ? (j.safe ? null : enrage(j, now)) : (faithful && rouseFaithful(x, y, now)) || foeAt(x, y);
}
// Someone's died in the church the character's in (at `at`): the people left there mourn
function mourn(at) {
  if (!map.church) return;
  for (const who of faithfulLeft()) churchSays(who, FAITHFUL.mourn[who], at);
}
// Saying in the chat, in a church, that one is an Orthodox Christian ("I'm an orthodox christian"
// or "I am an orthodox christian", any case) brings grace, for good: `regen` [hp, turns] on top of
// any other (see turnTaken()). Once.
const GRACE = { regen: [2, 5], words: /^\s*i(?:['’]m|\s+am)\s+an\s+orthodox\s+christian[\s.!]*$/i };
let graced = false;
function receiveGrace() {
  graced = true;
  loot();
  say(speech(english("Priest"), "Glory to God! Welcome home, child. Christ is in our midst."));
  say(tr("You feel grace upon you. You'll heal <up>{hp} hp</> every {turns} turns.", { up: INK.up, hp: GRACE.regen[0], turns: GRACE.regen[1] }));
}
function addPriest([x, y], cells) {
  const inside = new Set(cells.map(c => key(...c)));
  // headed so the forest is at his left hand (see PRIEST)
  const heading = NEIGHBOURS.find(([dx, dy]) => !inside.has(key(x + dy, y - dx)) && inside.has(key(x + dx, y + dy))) ?? [1, 0];
  priests.push({ x, y, facing: "left", heading, energy: 0, inside, blessed: false, spotted: false,
    hitT0: -Infinity, anim: { t0: -Infinity, fromX: x, fromY: y } });
}
// (the blacksmith too, in the cave: in the way and unhurt alike, see SMITH)
const priestAt = (x, y) => (map === MAPS.outside ? priests.find(p => p.x === x && p.y === y) : smithAt(x, y));
function priestTurn(now) {
  if (map !== MAPS.outside) return;
  const pace = Math.max(1, stat("spd"));
  for (const p of priests) {
    if (!p.spotted && inSight(p.x, p.y) && fogStepAt(p.x - player.x, p.y - player.y) < DITHER_STEP) {
      p.spotted = true;
      say("You see a priest walking among the grass.");
    }
    if (fogDistance(p.x - player.x, p.y - player.y, CW, CH) > ENT.awake) continue;
    for (p.energy += PRIEST.spd; p.energy >= pace; p.energy -= pace) priestAct(now, p);
  }
}
// A step round the edge: left if he can, else ahead, right, or back the way he came
function priestAct(now, p, go = false) {
  if (talk?.priest === p || (!go && random() < PRIEST.pause)) return;
  const [hx, hy] = p.heading;
  const free = ([dx, dy]) => {
    const x = p.x + dx, y = p.y + dy;
    return p.inside.has(key(x, y)) && MAPS.outside.open(x, y) && !foeAt(x, y) && !jackAt(x, y, MAPS.outside) && !priestAt(x, y);
  };
  const way = [[hy, -hx], [hx, hy], [-hy, hx], [-hx, -hy]].find(free);
  if (!way) return;
  if (p.x + way[0] === player.x && p.y + way[1] === player.y) return;   // waits for them to pass
  p.heading = way;
  if (way[0]) p.facing = way[0] < 0 ? "left" : "right";
  const from = visualPos(now, p, p.anim);
  Object.assign(p.anim, { t0: now, fromX: from.x, fromY: from.y });
  p.x += way[0]; p.y += way[1];
}
function drawPriest(now, p) {
  const pos = visualPos(now, p, p.anim), atlas = skeletonAtlas(p, pos);
  if (atlas) drawSprite(SCENE.priest[p.facing], pos, stepPose(stepProgress(now, p.anim)), 0, atlas);
}
// Walking into him: his offer, or one of his lines once he's prayed for them
function meetPriest(p) {
  if (p.x !== player.x) p.facing = p.x > player.x ? "left" : "right";
  if (blessed) { say(speech("Priest", PRIEST.after)); return; }
  say(speech("Priest", PRIEST.offer));
  talk = { priest: p, buttons: {} };
  held.length = 0;
}
// The character's answer to his offer: a blessing to pick (see LEVEL_UP), or his leave
function answerPriest(yes) {
  if (talk?.shrine) return answerShrine(yes);   // (a shrine's pact, offered the same way, see SHRINE)
  const p = talk?.priest;
  talk = null;
  canvas.style.cursor = "";
  lived("priest");
  if (!yes) { say(speech("Priest", PRIEST.no)); return; }
  blessed = true;
  loot();
  leveling = { step: "stat", focus: 0, help: false, blessing: p ?? true };
}

// A small village's family (world.js SITES, Tiffany's "small-village", 454:39791): a man, a woman
// and one to three children, kept with the lumberjacks (see JACK; each with the `village` it's in,
// by its number in world.patches, and its `home`'s door) so they're in the way and can be hurt
// alike. By day they're about their clearing, each stepping at its `spd` (`pause` of the time
// standing still), never out of it; walking into one, they say one of their `lines` (no fight, no
// turn), the narrator now and then adding what they see of them (`aside`: how often, and the words).
// From sunset (DAY.dusk) till dawn, or whenever a monster's within `fear` cell widths of their
// home's door, they go home: each walks to the doorstep and in, and is in its room (as a shed's,
// see shedMap()) to be met there, saying their `home` lines; once it's day and safe again, and the
// character isn't in there, they come out, one a turn. Further than ENT.awake from the character
// they're simply where they'd be by then. A spell that hurts one turns the whole family on the
// character (see enrage()): the man stands and fights, the woman and the children keep away
// (ENEMIES' villagers). Now and then there's a `lone` woman too (world.js VILLAGE), at the second
// house, whose child is missing: night doesn't send her in (she waits out for it), only a monster
// near her own door does; at home she says nothing, the narrator saying what she's doing. (Tiffany's
// lines: "You are not one of them.", "You are not from here.", the woman averting her eyes, "Who are
// you?", "Mama said I can't talk to strangers.", "Have you... seen my child?" and the small shoe,
// with the codex's changes, 2026-10-20; the rest, and the numbers, Claude's, 2026-10-12)
const VILLAGE = { spd: 5, pause: 0.5, fear: 10, hide: "The villagers hurry inside.",
  villager1: { who: english("Man"), lines: ["You are not one of them.", "We don't want any trouble.", "Keep walking, stranger.",
    "Stay away from my children."], aside: [0.4, "The man looks you over and says nothing."],
    home: ["Shut the door behind you. Quickly."] },
  villager2: { who: english("Woman"), lines: ["You are not from here.", "Please, leave us be."],
    aside: [0.5, "The woman averts her eyes from you."], home: ["Quiet. They'll hear you."] },
  kid: { lines: ["Who are you?", "Mama said I can't talk to strangers.", "Are you lost?", "Papa says the woods aren't safe.",
    "Have you seen the trees falling? Nobody's chopping them."], home: ["Is it gone?", "Mama says we have to be quiet."] },
  lone: { who: english("Woman"), lines: ["Have you... seen my child?"], aside: [0.5, "The woman averts her eyes from you."],
    athome: "She doesn't look up from the small shoe in her lap." },
};
VILLAGE.villager3 = { ...VILLAGE.kid, who: english("Boy") };
VILLAGE.villager4 = { ...VILLAGE.kid, who: english("Girl") };
const villageOf = j => world.patches[j.village];
const villageCells = p => (p.inside ??= new Set(p.cells.map(c => key(...c))));
function addFamily(p, i) {
  for (const { kind, at, lone, home } of p.family) {
    addJack(at, MAPS.outside, kind);
    Object.assign(jacks.at(-1), { village: i, home: home ?? p.home }, lone && { lone });
  }
}
function villagerSays(j) {
  const V = j.lone ? VILLAGE.lone : VILLAGE[j.kind], home = j.on !== MAPS.outside;
  if (j.x !== player.x) j.facing = j.x > player.x ? "left" : "right";
  const line = home && V.athome ? null : pickLine(home ? V.home : V.lines);
  if (line) say(speech(V.who, line));
  else say(V.athome);
  if (j.lone ? line : /\bthem\b/.test(line)) lived(j.lone ? "lone" : "village");   // (her child asked about; "them" said)
  if (!home && V.aside && Math.random() < V.aside[0]) say(V.aside[1]);
}
// Why someone of a village should be at home, if they should: "night" (never for the lone woman)
// or "danger" (a monster near their own home's door)
function villageAfraid(j) {
  const t = dayTurn(), [hx, hy] = j.home;
  if (!j.lone && t >= DAY.dusk && t < DAY.dawn) return "night";
  return foes.some(s => !s.dead && s.on === MAPS.outside && !(s.charmed > 0) && !s.kind.startsWith("villager") &&
    fogDistance(s.x - hx, s.y - hy, CW, CH) <= VILLAGE.fear) ? "danger" : null;
}
function villageTurn(now) {
  const pace = Math.max(1, stat("spd")), [ox, oy] = map === MAPS.outside ? [player.x, player.y] : outsideAt, out = new Set();
  for (const j of [...jacks]) {
    if (j.village === undefined) continue;
    const p = villageOf(j), afraid = villageAfraid(j), home = j.on !== MAPS.outside, [dx, dy] = j.home;
    const near = fogDistance(dx - ox, dy - oy, CW, CH) <= ENT.awake;
    if (!afraid) p.hiding = false;
    if (!home && afraid) {
      if (afraid === "danger" && !p.hiding && map === MAPS.outside && inSight(j.x, j.y)) { p.hiding = true; say(VILLAGE.hide); }
      if (!near || (j.x === dx && j.y === dy + 1)) goHome(j);
      else for (j.energy += VILLAGE.spd * 2; j.energy >= pace; j.energy -= pace) villagerStep(now, j, [dx, dy + 1]);
    } else if (home && !afraid && map !== j.on && !out.has(j.village)) {
      out.add(j.village);          // (one a turn)
      comeOut(j, near);
    } else if (near || map === j.on)
      for (j.energy += VILLAGE.spd; j.energy >= pace; j.energy -= pace) if (random() >= VILLAGE.pause) villagerStep(now, j);
  }
}
// Whether someone could step onto x, y of map M (a villager going home onto its doorstep, `to`, too)
function villagerFree(M, x, y, area, to) {
  const k = key(x, y);
  return M.open(x, y) && (!M.keepClear.has(k) || (to && x === to[0] && y === to[1])) && (!area || area.has(k) || (to && x === to[0] && y === to[1])) &&
    !foes.some(s => !s.dead && s.on === M && s.x === x && s.y === y) && !jackAt(x, y, M) && !(M === MAPS.outside && priestAt(x, y)) &&
    !(map === M && x === player.x && y === player.y);
}
// The first step of the shortest way from j to `to` through its clearing (round the houses), if there's one
// (none if j's there already: villageTurn can step them twice a turn, the second from the doorstep,
// and the way back from `to` would never reach `from`, freezing the game)
function villagerWay(j, to) {
  if (j.x === to[0] && j.y === to[1]) return null;
  const area = villageCells(villageOf(j)), from = key(j.x, j.y), came = new Map([[from, null]]), queue = [[j.x, j.y]];
  while (queue.length) {
    const [x, y] = queue.shift();
    if (x === to[0] && y === to[1]) {
      let k = key(x, y);
      while (came.get(k) !== from) k = came.get(k);
      const [sx, sy] = k.split(",").map(Number);
      return [sx - j.x, sy - j.y];
    }
    for (const [dx, dy] of NEIGHBOURS) {
      const k = key(x + dx, y + dy);
      if (!came.has(k) && villagerFree(MAPS.outside, x + dx, y + dy, area, to)) { came.set(k, key(x, y)); queue.push([x + dx, y + dy]); }
    }
  }
  return null;
}
// A step: towards `to`, or anywhere in their clearing (or room)
function villagerStep(now, j, to = null) {
  const M = j.on, area = M === MAPS.outside ? villageCells(villageOf(j)) : null, way = to && villagerWay(j, to);
  const ways = to ? (way ? [way] : []) : NEIGHBOURS.filter(([dx, dy]) => villagerFree(M, j.x + dx, j.y + dy, area, to));
  if (!ways.length) return;
  const [dx, dy] = ways[Math.floor(random() * ways.length)];
  if (dx) j.facing = dx < 0 ? "left" : "right";
  const from = visualPos(now, j, j.anim);
  Object.assign(j.anim, { t0: now, fromX: from.x, fromY: from.y });
  j.x += dx; j.y += dy;
}
// In through their home's door, onto a free cell of its room (if there's none, they wait on the doorstep)
function goHome(j) {
  const room = shedMap(j.home), spots = room.room.cells.filter(([x, y]) => villagerFree(room, x, y));
  if (!spots.length) return;
  const [x, y] = spots[Math.floor(random() * spots.length)];
  Object.assign(j, { on: room, x, y, anim: { t0: -Infinity, fromX: x, fromY: y } });
}
// ...and back out onto the doorstep, or, out of the character's way, anywhere free in the clearing
function comeOut(j, near) {
  const [dx, dy] = j.home, area = villageCells(villageOf(j));
  const at = villagerFree(MAPS.outside, dx, dy + 1, null, [dx, dy + 1]) ? [dx, dy + 1]
    : near ? null : villageOf(j).cells.find(([x, y]) => villagerFree(MAPS.outside, x, y, area));
  if (!at) return;
  Object.assign(j, { on: MAPS.outside, x: at[0], y: at[1], anim: { t0: -Infinity, fromX: at[0], fromY: at[1] } });
}

// The lumberjack's house (.TIFF's codex lake-house, with lumberjack-locket, 2026-10-19; Figma
// 781:18240): the first lake laid out in a journey (world.js SITES' lake, `home`) is a lumberjack's
// home, and who's there depends on what the character's done. While they've killed no lumberjack
// this journey, `robbed` of the time it's two bandits on its shore, waiting as a hideout's band
// does, one of them carrying an Iron Axe (its affix rolled as any find's), dropped for certain;
// otherwise he's resting there with his daughter (the village's girl). Once any lumberjack's been
// killed by them (`jacksKilled`), she's there alone, waiting for him: it turns so the first time
// neither the house nor anyone at it is in sight (the user's call, as .TIFF wished, 2026-10-19),
// any bandit not yet roused gone. With the family there (`home`, `waiting`) the lake's a
// sanctuary, and neither of them can be hurt (`safe`: a spell passes them by, as the priest).
// The narrator says `seen` the first time it's seen so (in place of the clearing's line); walking
// into them, their lines, the girl's while she waits one more each time, in order, then the last
// of them or `late`. A thought for each (THOUGHTS: `lakeHome` once either's spoken to, `lakeAxe`
// once the axe's taken, `lakeTruth` after her second line). The words .TIFF's and Claude's, picked
// by her; `robbed` Claude's pick, 2026-10-19.
const LAKE_HOME = { robbed: 0.5, band: "lake home",
  seen: { home: "A girl stacks pebbles by the water. For a moment, the forest feels far away.",
    robbed: "The house is quiet.", waiting: "A girl sits by the water, watching the trees." },
  father: ["Day off. Even the trees need a rest from me.", "That's my girl. Don't scare her.", "A few more trees, and we're gone from here.",
    "This place won't stay safe for long. I can feel it.", "Sit if you like. Just keep your weapon down."],
  girl: ["Papa's resting. He chops all day.", "Are you a lumberjack too?", "Papa says we're leaving soon."],
  waiting: ["Have you seen my papa?", "He's chopping wood. He always comes back before dark.", "I'll wait. He promised."],
  late: "It's getting dark. He's never this late." };
let lakeHome = null;               // { p: its site, now: "home" | "robbed" | "waiting", told: what the narrator's said of, asked: the girl's lines while waiting, axe }
let jacksKilled = 0;               // lumberjacks the character's killed this journey
function wakeLakeHome(p) {
  lakeHome = { p, now: null, told: null, asked: 0, axe: null };
  setLakeHome(jacksKilled ? "waiting" : random() < LAKE_HOME.robbed ? "robbed" : "home");
}
function setLakeHome(now) {
  const L = lakeHome, shore = [...L.p.shore], safe = now !== "robbed";
  for (const j of jacks.filter(j => j.lakeHome)) jacks.splice(jacks.indexOf(j), 1);
  for (const s of foes) if (s.band === LAKE_HOME.band && !s.dead && !s.alert) Object.assign(s, { dead: true, diesAt: -Infinity });
  for (const c of L.p.land) world.sanctuary[safe ? "add" : "delete"](key(...c));
  if (safe) for (const s of foes) if (!s.dead && s.on === MAPS.outside && world.sanctuary.has(key(s.x, s.y))) offSanctuary(s);
  L.now = now;
  const spot = () => shore.splice(Math.floor(random() * shore.length), 1)[0];
  const add = (kind, at, more) => { addJack(at, MAPS.outside, kind); Object.assign(jacks.at(-1), { lakeHome: true, safe: true, rest: true, ...more }); };
  if (now === "robbed")
    for (let i = 0; i < 2 && shore.length; i++) {
      addFoe("bandit", spot(), MAPS.outside, i ? bandAffix() : "normal");
      foes.at(-1).band = LAKE_HOME.band;
      if (!i) Object.assign(foes.at(-1), { gear: roll("axe"), drop: 1, lakeAxe: true });   // (normal, so it's the axe it leaves, never a spell)
    }
  else {
    if (now === "home" && shore.length > 1) add("lumberjack", spot());
    if (shore.length) add("villager4", spot(), { spotted: true });
  }
}
// A monster on ground just made a sanctuary goes to the nearest open cell off it (no dice)
function offSanctuary(s) {
  const M = MAPS.outside, seen = new Set([key(s.x, s.y)]), queue = [[s.x, s.y]];
  for (let i = 0; i < queue.length && i < 4000; i++) {
    const [x, y] = queue[i], k = key(x, y);
    if (i && !world.sanctuary.has(k) && !M.keepClear.has(k) && !foes.some(o => !o.dead && o.on === M && o.x === x && o.y === y) && !jackAt(x, y, M) &&
      !(map === M && x === player.x && y === player.y)) return void Object.assign(s, { x, y });
    for (const [dx, dy] of NEIGHBOURS) {
      const n = key(x + dx, y + dy);
      if (!seen.has(n) && M.open(x + dx, y + dy)) { seen.add(n); queue.push([x + dx, y + dy]); }
    }
  }
}
// Each turn: once a lumberjack's been killed, the house turns to `waiting` when it's out of sight
function lakeHomeTurn() {
  const L = lakeHome;
  if (!L || L.now === "waiting" || !jacksKilled) return;
  const seen = q => map === MAPS.outside && inSight(...q);
  if (seen(L.p.heart) || jacks.some(j => j.lakeHome && seen([j.x, j.y])) ||
    foes.some(s => s.band === LAKE_HOME.band && !s.dead && s.on === MAPS.outside && seen([s.x, s.y]))) return;
  setLakeHome("waiting");
}
function lakeSays(j) {
  const L = lakeHome, girl = j.kind !== "lumberjack";
  if (j.x !== player.x) j.facing = j.x > player.x ? "left" : "right";
  let line;
  if (!girl) line = pickLine(LAKE_HOME.father);
  else if (L.now === "waiting") {
    const n = L.asked++;
    line = n < LAKE_HOME.waiting.length ? LAKE_HOME.waiting[n] : Math.random() < 0.5 || dayTurn() < DAY.dusk ? LAKE_HOME.waiting.at(-1) : LAKE_HOME.late;   // ("getting dark" only from dusk)
    if (n === 1) { lived("lakeTruth"); achieved("lakeTruth"); }
  } else line = pickLine(LAKE_HOME.girl);
  tell(speech(girl ? "Girl" : "Lumberjack", line));
  if (L.now === "home") lived("lakeHome");
}

// The burning bush (world.js SITES, Tiffany's "burning-bush", 402:33170): a big tree that burns and
// isn't burnt, its flames flickering (a frame every FIRE.frameMs, each at its own time) and lighting
// the clearing as a fire does. Standing by its foot, F speaks to it: it asks the character's name,
// and the next line they type in the chat is taken for it, whatever it is (never sent to the chat:
// it's only shown here, see sendChat()). Then, unless they're wearing cursed gear, it asks what
// they seek, and they pick one of `gifts` (1-3, or clicked), theirs for the rest of the journey:
//   - the executioner: each cursed monster and each miniboss (the demon, golem, goblin king...) on
//     the map they're on, within `near` cell widths, shows as a "!" in `seeInk` over where it is,
//     out of sight or not (up a tower, any on screen)
//   - the treasure: each chest with something still in it, and each shed or house whose room has
//     one, a "!" in `goldInk` over it within `near`; every other shed and house dimmed to `dim`
//   - the glory: `luck` points better odds of better gear from then on (items.js setLuck())
// Esc puts off choosing till the next time. Wearing cursed gear there's no gift: the dark closes in
// instead, the character seeing `dark` as far and no torch nor daylight helping, till they've taken
// off every cursed thing they wear (and it doesn't come back if they put one on again). Either
// way, once a journey, whichever bush. (Tiffany's design and lines; `near`, `dark` and `luck` her
// suggestions or Claude's picks, 2026-10-12)
const BUSH = { near: 24, dark: 0.5, luck: 5, dim: 0.4, seeInk: "#eec39a", goldInk: "#fbf236", ink: "#df7126", who: english("Burning Bush"),
  ask: "Speak your name, O human.", seek: "What do you seek?",
  gifts: [
    { id: "executioner", name: "The executioner", card: "See cursed and mighty foes when they're near.",
      says: "Then see them, as I see them.", after: "The fire leaps into your eyes. The Evil can no longer hide from you." },
    { id: "treasure", name: "The treasure", card: "See chests, and sheds with chests, when they're near.",
      says: "Seek, and you shall find.", after: "The fire leaps into your eyes. You sense what the land hides." },
    { id: "glory", name: "The glory", card: "Find better gear for the rest of your journey.",
      says: "The land will give you its finest.", after: "The fire settles in your hands. They feel blessed." },
  ],
  forsaken: "I see you have forsaken the light.", closes: "The flames turn away from you, and the dark draws close.",
  laugh: "Your {item} laughs softly.", freed: "The dark lets you go.", spent: "The fire burns on, and says nothing more." };
let bushAsking = null;             // the bush that's asked the character's name, till they answer or walk off
const bushTarget = () => (map === MAPS.outside && !lookout ? world.patches.find(p => p.bush &&
  Math.abs(p.bush.foot[0] - player.x) + Math.abs(p.bush.foot[1] - player.y) <= 1) ?? null : null);
// A grave next to the character (or under them), lone or a graveyard's (world.js graves): F, or a
// tap on it or its prompt, reads who lies there in the log (the user's, 2026-10-18: a supporter's
// name, see GRAVE_NAME in world.js), its mound's cell `at`
const GRAVE = { says: "Here lies {name}." };
const graveTarget = () => {
  if (map !== MAPS.outside || lookout) return null;
  for (const [dx, dy] of [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const at = [player.x + dx, player.y + dy], fell = fallenAt(...at), name = fell?.name ?? world.graves.get(key(...at));
    if (name) return { at, name, fell };
  }
  return null;
};
function readGrave({ name, fell }) {
  const who = noun(CLASSES[fell?.cls]?.name.toLowerCase() ?? english("traveller"));
  if (fell) return say(fell.by ? tr("Here lies {name}, {who:a}. Fell on day {day} to {by:a}.", { name: [name, INK.name], who, day: fell.day, by: noun(fell.by, INK.down) })
    : tr("Here lies {name}, {who:a}. Fell on day {day}.", { name: [name, INK.name], who, day: fell.day }));
  say(tr(GRAVE.says, { name: [name, INK.name] }));
}
// Fallen players' graves (the user's, 2026-10-19): on a Daily Challenge, everyone's map is the
// same, so where others fell today is a place on yours. A journey sent to the day's board that
// ended in a death outside brings where (`fell`, worker/scores.js FALLEN); `chance` of the day's
// journeys, `most` of them at most (picked from `ask` the board hands out, none within `away`
// cells of the house), lie where they fell as a red cross, never a grey one, read with F like a
// grave ("Here lies AXEL, a rogue. Fell on day 2 to a bandit."). They never block the way: a
// grave's drawn on the ground and walked over, and one on a cell that isn't open on this map
// (a tree they'd felled, the water) isn't there at all. (Claude's numbers)
const FALLEN = { chance: 0.5, most: 3, ask: 8, away: 12 };
const fallen = new Map();          // cell -> { name, cls, day, by }
const fallenAt = (x, y) => { const f = fallen.get(key(x, y)); return f && MAPS.outside.open(x, y) && !river.cell(x, y) ? f : null; };
function addFallen(got) {
  for (const { name, cls, day, x, y, by } of got) if (!fallen.has(key(x, y))) fallen.set(key(x, y), { name, cls, day, by });
}
// Nemeses (the user's, 2026-10-19): monsters that killed a player, shared by everyone (worker/scores.js
// NEMESIS: made from a death now and then, a kill more for each player they kill, gone for
// everyone once one's slain). `chance` of the journeys, one of those about is in it: the first time the
// character's in its forest (its biome), it comes `away` cells off, hunting them while they're
// in that forest, its hp, atk, def and mag `grow` times more for each of its kills (up to
// `most`), worth `exp` times the exp, with a bright red dot over its head and a name of its own,
// a title by what it's done (the Dread past `dread` kills, Bane of a class it's killed two of,
// Who Walks at Night, or of its forest) and a line on why it's like that. (Claude's numbers)
// v0.13 (the user's asks, 2026-10-25): none comes before nightfall of day `from` (so none hunts a
// journey's start; from then on, day or night), and each is `weaker` (hp, atk, def and mag, after its kills' growth).
const NEMESIS = { chance: 0.5, away: 25, grow: 0.15, most: 10, exp: 2, dread: 5, from: 3, weaker: 0.75, ink: "#e43b44",
  forests: ["the Green Wood", "the Red Woods", "the Dark Wood", "the Thorned Wood"] };
let nemesis = null;                // the one in this journey, once it's come: { id, kind, affix, biome, night, name, kills, classes, out }
function addNemesis(n) { nemesis = { ...n, out: false }; }
function callNemesis() {
  if (watching || offBoard || nemesis) return;   // (Math.random, not the dice: the record has what came)
  fetch(`/scores?nemeses&v=${VERSION}`).then(r => r.json()).then(d => {
    const about = (d.nemeses ?? []).filter(n => Number.isInteger(n?.id) && ENEMIES[n.kind] && n.name);
    if (about.length && Math.random() < NEMESIS.chance) act("N", about[Math.floor(Math.random() * about.length)]);
  }).catch(() => {});
}
const nemesisTop = n => Object.entries(n.classes ?? {}).sort((a, b) => b[1] - a[1])[0];
// (its title and words as they're shown, translated: see lang.js)
function nemesisTitle(n) {
  const top = nemesisTop(n);
  if (n.kills >= NEMESIS.dread) return tl("the Dread");
  if (top?.[1] >= 2) return tl("Bane of {cls:pl}", { cls: noun(CLASSES[top[0]]?.name ?? top[0]) });
  return n.night ? tl("Who Walks at Night") : tl("of {forest}", { forest: tl(NEMESIS.forests[n.biome] ?? NEMESIS.forests[0]) });
}
function nemesisDesc(n) {
  const top = nemesisTop(n), cls = top && noun((CLASSES[top[0]]?.name ?? top[0]).toLowerCase());
  if (n.kills <= 1) return cls ? tl("It killed {cls:a}, and every traveller remembers it.", { cls }) : tl("It killed a traveller, and every traveller remembers it.");
  return cls ? tl("It has killed {n} travellers, most of them {cls:pl}, and grown stronger with each.", { n: n.kills, cls })
    : tl("It has killed {n} travellers, and grown stronger with each.", { n: n.kills });
}
function nemesisTurn() {
  const n = nemesis;
  if (!n || n.out || map !== MAPS.outside || world.biomeAt(player.x, player.y) !== n.biome || (n.id > 0 && turns < (NEMESIS.from - 1) * DAY.turns + DAY.night)) return;
  n.out = true;
  const a = random() * 2 * Math.PI, away = n.id < 0 ? 8 : NEMESIS.away;   // (a made-up one, "?nemesis", close by)
  addFoe(n.kind, openNear(player.x + Math.round(away * Math.cos(a)), player.y + Math.round(away * CW / CH * Math.sin(a)), Math.sign(Math.cos(a)) || 1), MAPS.outside, n.affix);
  const s = foes.at(-1), k = (1 + NEMESIS.grow * Math.min(n.kills, NEMESIS.most)) * NEMESIS.weaker, by = v => Math.round(v * k), title = nemesisTitle(n), kind = s.kindName;
  Object.assign(s, { nemesis: n.id, nemesisBiome: n.biome, hp: by(s.hp), fullHp: by(s.hp), atk: by(s.atk), def: by(s.def), mag: by(s.mag), exp: s.exp * NEMESIS.exp,
    name: tl("{name}, {title}", { name: n.name, title }), kindName: tl("{name} the {kind}", { name: n.name, kind: noun(kind) }),
    called: tl("{kind} {name}", { kind: noun(kind.toLowerCase()), name: n.name }), desc: nemesisDesc(n), alert: true, alertT0: clock() });
  say(tr("{name}, {title}, has caught your scent.", { name: [n.name, NEMESIS.ink], title }, INK.down));
}
function slayNemesis(s, at) {
  say(tr("{name} is slain. Every traveller will hear of it.", { name: [s.kindName, NEMESIS.ink] }, INK.title), at);
  if (watching || offBoard || !ticket || !(s.nemesis > 0)) return;
  let name = "";
  try { name = localStorage.getItem("mektxt.scoreName") ?? ""; } catch {}
  fetch("/scores/nemesis", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticket, id: s.nemesis, name, cls: charClass }) }).catch(() => {});
}
// The name of what killed one, as the board has it (a kind, "-risen" after it, or "ghost")
// (its name, lower case: "{by:a}" where it's shown)
const fallenBy = by => {
  if (!by) return null;
  if (by === "ghost") return english("ghost");
  const kind = by.replace(/-risen$/, ""), name = ENEMIES[kind]?.name ?? kind.replace(/([A-Z])/g, " $1");
  return ENEMIES[kind] ? name.toLowerCase() : null;
};
function callFallen() {
  if (watching || !dailyKey || offBoard || !(Math.random() < FALLEN.chance)) return;   // (Math.random, not the dice: the record has what came)
  fetch(`/scores?graves=${FALLEN.ask}&v=${VERSION}&daily=${dailyKey}`).then(r => r.json()).then(d => {
    const [sx, sy] = world.spawn, mine = (() => { try { return localStorage.getItem("mektxt.scoreName") ?? ""; } catch { return ""; } })();
    const got = (d.graves ?? []).filter(g => g && Number.isInteger(g.x) && Number.isInteger(g.y) && typeof g.name === "string" && g.name !== mine &&
      fogDistance(g.x - sx, g.y - sy, CW, CH) > FALLEN.away)
      .map(g => ({ name: g.name, cls: g.cls, day: g.day, x: g.x, y: g.y, by: fallenBy(g.by) })).slice(0, 1 + Math.floor(Math.random() * FALLEN.most));
    if (got.length) act("R", got);
  }).catch(() => {});
}
// Notes (.TIFF's codex, friends-note and shed-notes, 2026-10-19): a note pinned to a room's back
// wall, read with F (or a tap on it or its prompt) next to it, says its words in the log, in
// quotes, as a carving does (no box since 2026-10-19, the user's). The house's is the friend's,
// always there, and once it's read the log says `after` under its words (it can be left unread:
// the way out was shut till it was, taken back at the user's ask, 2026-10-26). A shed has one `shed` of the time,
// from the pool of the forest it stands in (forest-4's from forest-3's, its own kept for when it's
// built), each at most once a journey. Who wrote which is ours, not the game's (the codex says).
// The words .TIFF's and Claude's, as the codex has them; how often a shed or cave floor has one Claude's pick.
const NOTES = {
  shed: 1 / 3, carving: 0.5,
  ajar: "Your friend's door is ajar.",
  house: { text: "Don't look for me.", enter: "You enter the house. It's empty. A note is pinned to the wall.",
    after: "It's your friend's hand. The last word tore through the page." },
  pinned: "A note is pinned to the wall.", carved: "A carving lies among the stones.",
  // ...and carved into a cave floor's wall: a stone room's, which can't be dug, `carving` of the floors (read in the log, no box)
  cave: ["Only something of its own could cut her. So we used what we took from the little one.",
    "It took twelve of us to carry the head down. It wept the whole way.",
    "We buried it as deep as the hills go. You can still hear her.",
    "There's a smith down here who won't say what he made. His hands shake when I ask.",
    "I followed the weeping down three floors. It's always one floor further."],
  forests: [
    ["Found my brother's shield by the river. No sign of him. There never is.",
      "Everyone in town has a cousin who went in. Nobody has a cousin who came out.",
      "They say whoever reaches the heart of the forest comes back a hero. Nobody's met one.",
      "Day three. The trees came down behind us. Not the wind.",
      "Grandmother says the forest used to give. Now it only takes.",
      "Treasure. Glory. Miracles. Pick a rumour. They all point the same way: in."],
    ["Every brother I've buried went in for glory. Not one knew what he was walking into. I mean to find out.",
      "Nobody remembers who walked in first, or why. Only that we keep walking in.",
      "Another child gone. The elders say the forest only takes back what it's owed.",
      "Something was taken from this forest. You can feel it, like a house after a funeral."],
    ["Flowers opened wherever it stepped. Why should a beast have that, and not us?",
      "We shared out its things. Whoever held them would hold its gift. That was the idea.",
      "The flowers still die in my hands.",
      "It wasn't a beast. It was a child. Hers.",
      "Mother has forsaken us.",
      "We don't pray for forgiveness. We pray she forgets us."],
  ],
};
const notesUsed = new Set();       // the notes already put in a shed this journey
// A carving for a cave floor's map `m`, or none: on a wall that can't be dug (a stone room's) with
// open floor right under it
function carveNote(m) {
  if (random() >= NOTES.carving) return;
  const pool = NOTES.cave.filter(t => !notesUsed.has(t)), c = m.cave, spots = [], lit = new Set(c.torches.map(t => key(...t)));
  if (!pool.length) return;
  for (const r of c.rooms) for (const [x, y] of r.cells) {
    const wx = x, wy = y - 1;
    if (!c.isFloor(wx, wy) && !c.diggable(wx, wy) && c.tile(wx, wy) >= 0 && !m.doors.has(key(wx, wy)) && !lit.has(key(wx, wy)) &&
      m.open(x, y) && !m.keepClear.has(key(x, y))) spots.push([wx, wy]);
  }
  if (!spots.length) return;
  const text = pool[Math.floor(random() * pool.length)];
  notesUsed.add(text);
  m.note = { at: spots[Math.floor(random() * spots.length)], text, read: false, carved: true };
  m.landmarks.add(key(...m.note.at));
}
// A note for a shed at x, y (outside), from its forest's pool, or null
function shedNote(x, y) {
  if (random() >= NOTES.shed) return null;
  const pool = NOTES.forests[Math.min(world.biomeAt(x, y), NOTES.forests.length - 1)].filter(t => !notesUsed.has(t));
  if (!pool.length) return null;
  const text = pool[Math.floor(random() * pool.length)];
  notesUsed.add(text);
  return text;
}
// Pins `text` to a room's map, on a cell of its back wall with open floor right under it (the
// `pick`th of them, wrapping round), a landmark till it's read
function pinNote(m, text, pick) {
  const spots = [...m.walls].map(k => k.split(",").map(Number)).filter(([x, y]) => m.open(x, y + 1) && !m.keepClear.has(key(x, y + 1)))
    .sort(([ax, ay], [bx, by]) => ay - by || ax - bx);
  if (!spots.length) return;
  m.note = { at: spots[Math.abs(pick) % spots.length], text, read: false };
  m.landmarks.add(key(...m.note.at));
}
const noteTarget = () => {
  const n = map.note;
  return n && !lookout && Math.abs(n.at[0] - player.x) + Math.abs(n.at[1] - player.y) <= 1 ? n : null;
};
// (one not yet read comes before a chest beside it, which F opens once it has been)
const unreadNote = () => (noteTarget()?.read === false ? noteTarget() : null);
function readNote(n) {
  const first = !n.read;
  n.read = true;
  map.landmarks.delete(key(...n.at));
  tell(tr("\u201c{text}\u201d", { text: tl(n.text) }, INK.value));   // (read in the log, no box: the user's, 2026-10-19; again as often as it's read)
  if (!first) return;
  if (n === MAPS.inside.note) tell(NOTES.house.after);
  else lived("note");
}
pinNote(MAPS.inside, NOTES.house.text, seed);
const bushSays = line => say(speech(BUSH.who, line));
const cursedWorn = () => GEAR.map(wearing).filter(id => id && ITEMS[id].affix === "cursed");
function speakToBush(p) {
  if (bush.spent) { say(bush.forsaken ? BUSH.closes : BUSH.spent); return; }   // (punished once, its line for good, the codex's 5.2)
  if (bush.named) return askGift();
  bushSays(BUSH.ask);
  bushAsking = p;
  if (!watching) setTimeout(() => openChat());   // (after the F that asked, so it isn't typed in)
}
// Their name's been said (see sendChat()): a gift to pick, or the dark
function nameBush() {
  bushAsking = null;
  if (bush.spent || dead) return;
  bush.named = true;
  const cursed = cursedWorn();
  if (!cursed.length) return askGift();
  Object.assign(bush, { punished: true, forsaken: true, spent: true });
  lived("punished");
  bushSays(BUSH.forsaken);
  say(tr(BUSH.closes, {}, INK.down));
  say(tr(BUSH.laugh, { item: noun(ITEMS[cursed[Math.floor(random() * cursed.length)]].name, INK.trait) }));
  felled++;                        // (so sight looks again, nearer)
}
function askGift() {
  bushSays(BUSH.seek);
  talk = { bush: true, buttons: {} };
  held.length = 0;
}
// The gift picked (its number in BUSH.gifts), or -1 for none yet
function answerBush(i) {
  talk = null;
  canvas.style.cursor = "";
  const g = BUSH.gifts[i];
  if (!g || bush.spent) return;
  Object.assign(bush, { gift: g.id, spent: true });
  lived("gift");
  achieved("gift");
  loot();
  bushSays(g.says);
  say(tr(g.after, {}, INK.up));
  if (g.id === "glory") setLuck(BUSH.luck);
}
// Every turn: the dark lifts once the last cursed thing worn is off
function bushTurn() {
  if (bushAsking && bushTarget() !== bushAsking) bushAsking = null;
  if (!bush.punished || cursedWorn().length) return;
  bush.punished = false;
  thoughtsHad.delete("punished");   // ("It's so dark" no longer, see THOUGHTS)
  if (thoughtNext === "punished") thoughtNext = null;
  say(tr(BUSH.freed, {}, INK.up));
  felled++;
}
// The doors outside that lead into a room that might hold a chest (a shed's, a site's building's,
// the house's), by their cell: what its room's made with (see shedMap()); and whether one has a
// chest still holding something, found out without going in (makeShed() laid out on the side)
const roomDoors = new Map([[key(...world.door), null]]), peeked = new Map();
function treasureIn(k) {
  const m = k === key(...world.door) ? MAPS.inside : sheds.get(k);
  if (m) return [...m.loot.keys()].some(c => !m.drops.has(c));
  if (!peeked.has(k)) {
    const [x, y] = k.split(",").map(Number), r = makeShed(SCENE, seed + 7919 * x + 104729 * y, roomDoors.get(k) ?? {});
    peeked.set(k, !!(r.chest || r.extra));
  }
  return peeked.get(k);
}
// ...and a building drawn dimmed for it: one whose room holds nothing, with the treasure
const dimmedProp = prop => bush.gift === "treasure" && map === MAPS.outside && prop.base.some(k => roomDoors.has(k) && !treasureIn(k));
// How the bush burns, so it's otherworldly (the user's ask, 2026-10-12; the numbers Claude's):
//   - its flames are seen from far off, a beacon in the dark: past where the fog would hide them,
//     drawn at fog step `beacon`, within `far` cell widths
//   - it glows far more than a fire (`glow` [how far, how strongly], as EMBER's), gold-white
//     (`ink`), swelling and sinking between `pulse` of its strength and all of it every `pulseMs`,
//     and flickering as fire does
//   - a halo of light round its canopy, `halo.r` cell widths, added to whatever's there (so even
//     the dark round it is lit), `halo.alpha` at its heart, swelling with the glow
//   - and embers rising off it, `sparks.n` at a time, each `sparks.ms` from a flame up `sparks.rise`
//     cells, drifting and fading as it goes
const BUSH_FIRE = { beacon: 2, far: 48, ink: "#ffcf6b", glow: [[1.5, 0.7], [3, 0.62], [4.5, 0.5], [6, 0.36], [7.5, 0.22], [9, 0.1]],
  pulse: 0.7, pulseMs: 2200, halo: { r: 11, alpha: 0.34, ink: [255, 190, 90] }, sparks: { n: 12, ms: 2600, rise: 5, ink: "#fff1b8" } };
const bushSwell = now => BUSH_FIRE.pulse + (1 - BUSH_FIRE.pulse) * (0.5 - 0.5 * Math.cos(2 * Math.PI * now / BUSH_FIRE.pulseMs));
const bushesOnScreen = () => world.patches.filter(p => p.bush && p.bush.foot[0] >= view.x0 - 12 && p.bush.foot[0] <= view.x1 + 12 &&
  p.bush.foot[1] >= view.y0 - 4 && p.bush.foot[1] <= view.y1 + 16);
// The bushes' flames, over their canopies, with their halo and embers (see drawOutside())
function drawBushes(now) {
  const { halo, sparks } = BUSH_FIRE, swell = bushSwell(now), size = CW * scale;
  for (const p of bushesOnScreen()) {
    const { foot: [fx, fy], flames } = p.bush;
    if (fogDistance(fx - player.x, fy - player.y, CW, CH) > BUSH_FIRE.far && !seeAll()) continue;
    for (const [x, y] of flames) {
      const t = SCENE.fire[(Math.floor(now / FIRE.frameMs) + hashCell(x, y)) % SCENE.fire.length];
      const atlas = sightAtlas(litStep(x, y), 0) ?? fog[BUSH_FIRE.beacon];
      drawTile(t, x, y, 0, atlas);
    }
    // the halo, round the middle of its flames
    const cx = originX + (flames.reduce((a, [x]) => a + x, 0) / flames.length + 0.5) * size;
    const cy = originY + (flames.reduce((a, [, y]) => a + y, 0) / flames.length + 0.5) * CH * scale;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, halo.r * size), [r, gr, b] = halo.ink;
    g.addColorStop(0, `rgba(${r}, ${gr}, ${b}, ${halo.alpha * swell})`);
    g.addColorStop(0.35, `rgba(${r}, ${gr}, ${b}, ${halo.alpha * swell * 0.45})`);
    g.addColorStop(1, `rgba(${r}, ${gr}, ${b}, 0)`);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = g;
    ctx.fillRect(cx - halo.r * size, cy - halo.r * size, 2 * halo.r * size, 2 * halo.r * size);
    // ...and the embers, each from a flame of its own, rising
    ctx.fillStyle = sparks.ink;
    const px = Math.max(1, Math.round(scale));
    for (let i = 0; i < sparks.n; i++) {
      const t = ((now + i * sparks.ms / sparks.n) % sparks.ms) / sparks.ms, round = Math.floor((now + i * sparks.ms / sparks.n) / sparks.ms);
      const [x, y] = flames[hashCell(i, round + fx) % flames.length];
      const sx = originX + (x + 0.5) * size + Math.sin(t * 6 + i) * 2 * scale, sy = originY + (y + 0.3 - t * sparks.rise) * CH * scale;
      ctx.globalAlpha = (1 - t) * swell;
      ctx.fillRect(Math.round(sx), Math.round(sy), px, px);
    }
    ctx.restore();
  }
}
// ...each a light, outside (see findLights())
const bushLights = () => world.patches.filter(p => p.bush && fogDistance(p.bush.foot[0] - player.x, p.bush.foot[1] - player.y, CW, CH) < 2 * BUSH.near)
  .map(p => [p.bush.foot[0], p.bush.foot[1] - 2]);
// The gifts' "!"s (see BUSH), over the world, a font px to each of its px, bobbing like the cursor's
function drawBushMarks(now) {
  if (!bush.gift || bush.gift === "glory" || dead) return;
  const f = Math.max(1, Math.round(scale)), bob = BOB[Math.floor(now / BOB_MS) % BOB.length] * scale;
  const within = (x, y) => lookout || fogDistance(x - player.x, y - player.y, CW, CH) <= BUSH.near;
  const mark = (x, y, ink) => {
    const runs = [["!", ink]], w = (sansWidth(runs) - 1) * f, h = SANS.cap * f;   // (in MEK Sans)
    drawSans(ctx, runs, Math.round(originX + (x + 0.5) * CW * scale - w / 2), Math.round(originY + (y - 0.5) * CH * scale - h / 2 + bob), f);
  };
  if (bush.gift === "executioner") {
    for (const s of foes) {
      if (s.dead || s.on !== map || !(s.affix === "cursed" || s.rank === "miniboss") || !within(s.x, s.y)) continue;
      const pos = visualPos(now, s, s.anim);
      if (!skeletonAtlas(s, pos)) mark(pos.x, pos.y, BUSH.seeInk);   // (one in sight is plain to see)
    }
    return;
  }
  for (const [x, y] of map.interactables) {
    const k = key(x, y);
    if (map.loot.has(k) && !map.drops.has(k) && within(x, y)) mark(x, y, BUSH.goldInk);
  }
  if (map === MAPS.outside)
    for (const k of roomDoors.keys()) {
      const [x, y] = k.split(",").map(Number);
      if (within(x, y) && treasureIn(k)) mark(x, y, BUSH.goldInk);
    }
}

// A graveyard's band (world.js SITES): a skeleton mage and three skeletons, never weak ones, in
// formation in front of the graves; or a bandits' hideout's, bandits all, in front of
// their hall, likewise. When one of them notices the character, or is hurt, they all do.
const BAND = { affixes: ["normal", "superior", "cursed", "enchanted"] };
function bandAffix() {
  let affix = rollMonsterAffix();
  while (!BAND.affixes.includes(affix)) affix = rollMonsterAffix();
  return affix;
}
// A goblin feast (story/CODEX.md goblin-feast; cave.js FEAST lays out where): `kinds` round a stone
// room's table, by its seats (the table's left end, its right, under it), facing it. They don't
// notice the character by sight: coming within `hear` cell widths of the table the log says
// `heard`, once, and hears them (sound.js feast()); stepping into the room, or hurting one, turns the whole table on them, and the
// log says one of `lines` (the lines Tiffany's; `hear` Claude's pick, 2026-10-13)
const FEAST = { kinds: ["goblinGrunt", "goblinGrunt", "goblinMage"], hear: 14,
  heard: "You hear a flurry of cackles and bones ripped apart.",
  lines: ["You are not welcome here.", "A bad move.", "They lunge at you like starving hounds."] };
const feastOf = s => (s.feast === undefined ? null : s.on.feasts?.[s.feast] ?? null);
function feastTurn(now) {
  for (const [i, f] of (map.feasts ?? []).entries()) {
    if (f.roused) continue;
    const [tx, ty] = f.table;
    if (f.room.has(key(player.x, player.y))) {
      const s = foes.find(o => o.on === map && o.feast === i && !o.dead);
      if (s) rouseBand(s, now); else f.roused = true;   // (`now`: the step's, so it's said before the spells it brings)
    } else if (!f.heard && Math.hypot(player.x - tx - 0.5, (player.y - ty) * CH / CW) <= FEAST.hear) {
      f.heard = true;
      lived("feast");
      say(FEAST.heard);
      feast();
    }
  }
}
function rouseBand(s, now) {
  if (!s.band) return;
  const f = feastOf(s);
  if (f && !f.roused) {
    f.roused = f.heard = true;
    say(tr(FEAST.lines[Math.floor(random() * FEAST.lines.length)], {}, INK.down), now);
  }
  for (const o of foes)
    if (o.band === s.band && !o.dead && !o.alert) Object.assign(o, { alert: true, spotted: true, alertT0: now, alertLeft: ENEMY.alertTurns });
}

// The blacksmith (story/CODEX.md blacksmith, Tiffany's; Figma 444:36581): a man at an anvil deep
// in the cave, once in a journey at most. Each floor from `from` down, till he's been put on one,
// has him `chance` of the time (see caveMap(); cave.js lays out his forge). He stays by his anvil;
// nothing hurts him and no monster sets foot in his room (see foeCanStand()), though the
// character's Yigs may. Within `hear` cell widths of his anvil the log says `heard`, once, and
// the hammering's heard (sound.js anvil()); in his room he mutters one of `mutter` every
// `mutterMs` or so; leaving it, once he's been met, the hammer starts again behind them.
// (`from` and `chance` the user's, 2026-10-13: from cave-1 down, half the floors.)
// Walking into him, he speaks, and with gear about them he'd work on (worn or in the bag, any
// slot, trinkets too: anything not yet enchanted), the bag comes up as "UPGRADE WHAT?" with
// only that gear to pick (see drawPanel()): the piece picked goes one step up in `steps`, weak
// to normal, normal to superior, superior to cursed, cursed to enchanted (the user's,
// 2026-10-16), for `cost` of their max hp, for good (a fixed
// number, rounded, taken off then: later levels still add all of theirs). He does it `upgrades`
// times in a journey, once (the user's, 2026-10-16): after that the hammer's fed. (He'd also
// take no more once their max hp would go under `floor` of what it was when they first met
// him, 100 met: 85, 72, 61, 52, then no, should `upgrades` be raised.) Their hp drops only
// where it's over the new max. Talking to him and paying take no turn; a spell aimed at him isn't cast
// (`stop`; nothing's spent). (The lines are Tiffany's and Claude's, as the codex has them;
// the hp being a fixed number, the spell not cast and the free turns Claude's picks, confirmed by
// the user 2026-10-13; `hear` and `mutterMs` Claude's.)
const SMITH = { steps: { weak: "normal", normal: "superior", superior: "cursed", cursed: "enchanted" }, upgrades: 1, from: 1, chance: 0.5, cost: 0.15, floor: 0.5, hear: 14, mutterMs: 25000,
  heard: "You hear iron being hammered somewhere in the dark.",
  mutter: ["Tell me... is the sun still up there?", "How many winters has it been?"],
  first: "It has been years since I saw another human.",
  offer: "Your gear is dull and rusted. You'll stand no chance in this darkness. Hand it over.",
  edge: "Your gear could bite deeper. Hand it over.",
  pity: "Your gear is sound. Pity.",
  whisper: "You hear whispering from his hammer.", drank: "It drank well.", wane: "You feel your strength wane.",
  no: "Suit yourself.", eyes: "His eyes are pools of black tar.",
  more: "More for the anvil?", fed: "The hammer is fed. Go.", spent: "There's not enough of you left.",
  stop: "You stop yourself upon seeing his blackened eyes on you.",
  behind: "Behind you, the hammer starts again.",
  title: "UPGRADE WHAT?", price: "Upgrade 1 gear at the cost of 15% max HP." };
let restoring = false;             // (a save being taken up again, see restore(): no new blacksmith's rolled for)
const smithAt = (x, y) => (map.smith && map.smith.x === x && map.smith.y === y ? map.smith : undefined);
const smithSays = line => say(speech(english("Blacksmith"), line));
// What he'd take for a piece, in max hp, and whether that's more than they've left to give
const smithCost = () => Math.round(maxHp() * SMITH.cost);
const smithCanPay = () => maxHp() - smithCost() >= smith.floorHp * SMITH.floor;
// What he'd make of the gear `id`: the same one, a step up (see SMITH; none: he won't take it, an enchanted one)
const smithMakes = id => {
  const it = ITEMS[id], next = it?.slot && !it.keepsake && !it.relic && SMITH.steps[it.affix];
  return next ? `${it.variant}-${next}` : null;
};
// Whether the bag's cell c (see KEY0) holds gear he'd take: worn, or in the bag
const upgradable = c => (c < KEY0 || c >= BAG0) && !!ITEMS[cellItem(c)]?.slot && !!smithMakes(cellItem(c));
const smithCells = () => [...GEAR.keys(), ...bag.map((_, i) => BAG0 + i)].filter(upgradable);
// Walking into him (see SMITH): what he says, and the bag to pick from, if there's anything he'd take
function meetSmith(s) {
  s.facing = player.x < s.x ? "left" : "right";
  const cells = smithCells();
  if (!smith.met) {
    Object.assign(smith, { met: true, floorHp: maxHp() });
    lived("smith");
    smithSays(SMITH.first);
    if (!cells.length) { smithSays(SMITH.pity); say(SMITH.eyes); return; }
    smithSays(cells.some(c => ITEMS[cellItem(c)].affix === "weak") ? SMITH.offer : SMITH.edge);
  } else if (!cells.length || smith.upgrades >= SMITH.upgrades) return smithSays(SMITH.fed);
  else if (!smithCanPay()) return smithSays(SMITH.spent);
  else smithSays(SMITH.more);
  openPanel(cells[0]);
  panel.smith = true;
}
// Paying him for the gear in cell c (the panel's [U]pgrade): it's made what smithMakes() says, and the price taken
function smithUpgrade(c) {
  if (!panel?.smith || !upgradable(c) || !smithCanPay() || smith.upgrades >= SMITH.upgrades) return UNCHANGED;
  const i = cellSlot(c), old = bag[i].id, id = smithMakes(old);
  smith.lost += smithCost();
  smith.upgrades++;
  bag[i].id = id;
  stats.hp = Math.min(stats.hp, maxHp());
  panel = null;
  canvas.style.cursor = "";
  say(SMITH.whisper);
  hammerWhispers();
  say(tr("Your {old} becomes {made}.", { old: itemNoun(old, INK.name), made: itemNoun(id, INK.name) }));
  rememberAs(old, id);   // (its memory with it, see BLADE)
  smithSays(SMITH.drank);
  say(tr(SMITH.wane, {}, INK.down));
  say(SMITH.eyes);
}
// Each turn: whether he's heard yet, and the character's coming into his room or leaving it
function smithTurn() {
  const s = map.smith;
  if (!s || !smith) return;
  const [ax, ay] = s.anvil, inRoom = s.room.has(key(player.x, player.y));
  if (!smith.heard && Math.hypot(player.x - ax, (player.y - ay) * CH / CW) <= SMITH.hear) {
    smith.heard = true;
    say(SMITH.heard);
    anvil(inRoom);
  }
  if (s.inRoom && !inRoom && smith.met) { say(SMITH.behind); anvil(); }
  if (!s.inRoom && inRoom) s.mutterAt = clock() + SMITH.mutterMs / 2;
  s.inRoom = inRoom;
}
// ...and, while they're in his room, his muttering (only what's said, so Math.random()'s)
function smithTalk(now) {
  const s = map.smith;
  if (!s?.inRoom || dead || now < s.mutterAt || panel?.smith) return;
  smithSays(pickLine(SMITH.mutter));
  s.mutterAt = now + SMITH.mutterMs * (0.75 + Math.random() / 2);
}
function drawSmith(s) {
  const pos = { x: s.x, y: s.y }, atlas = skeletonAtlas(s, pos);
  if (atlas) drawSprite(SCENE.blacksmith[s.facing], pos, stepPose(1), 0, atlas);
}

// Shrines (world.js SHRINE, cave.js SHRINE_CAVE; the user's, 2026-10-20, "shrines", 801:55109): rare,
// in every biome and on a quarter of the cave's floors, each a "?" from afar, as a chest is (its
// icon's cell a landmark, see LANDMARK), till its pact's been taken. Walking into its rocks (anywhere
// on it, in the cave), or F beside them, its pact comes up as the priest's offer does ([Y]es/[N]o,
// see drawTalk()); taken, it's for good, and the shrine goes cold. A common one gives `common.by` to
// its stat (the heart's `common.hp` max hp, healed as well) and takes `common.cost` off one of the
// other four stats, picked at random (a surprise till it's paid, the user's, 2026-10-20). A rare one
// bends a rule, at a price; each is taken once a journey (the Little Crown's too, the user's, 2026-10-20):
//   Envy:     the character's blows and spells drain, as a blood weapon's (DRAIN), and every `bleed`
//             steps they lose 1 hp (never the last)
//   Blade:    a blow (not a spell) lands critical `crit` of the time, `critX` times the damage; -`critSpd` spd
//   Blight:   a spell that hurts one monster leaps on to the nearest other in sight within
//             `chain.reach` cells, `chain.share` as strong at each leap, `chain.jumps` leaps at most; -`chainDef` def
//   Crown:    everything in the bag a tier up (see forgedOf(); tier IV stays), for `forgeHp` max hp
// The rare ones show in the buffs' row, each its shrine's icon, lit, its tooltip what it does and costs.
// The first sight of one, the log says `seen` (a common one's with its `animal`). The names and the
// words .TIFF's (codex `shrine`, 2026-10-20: the common ones the ghost-word animals people once
// worshipped, the rare ones named for the tragedy); the numbers Claude's, the user's OK 2026-10-20.
const SHRINE = { common: { by: 1, hp: 20, cost: 1 }, bleed: 4, crit: 0.5, critX: 2, critSpd: 4,
  chain: { reach: 3, jumps: 2, share: 0.6 }, chainDef: 4, forgeHp: 50,
  pacts: {
    atk: { name: "Shrine of the Wolf", animal: english("wolf") },
    mag: { name: "Shrine of the Owl", animal: english("owl") },
    def: { name: "Shrine of the Bear", animal: english("bear") },
    spd: { name: "Shrine of the Fox", animal: english("fox") },
    hp: { name: "Shrine of the Horse", animal: english("horse") },
    drain: { name: "Shrine of Envy", pact: "Pact of Envy",
      gift: "Your blows and spells drain life.", cost: "Lose 1 hp every 4 steps.", tip: ["drains life", "-1 hp every 4 steps"] },
    crit: { name: "Shrine of the Blade", pact: "Pact of the Blade",
      gift: "Your blows have a 50% chance to deal double damage.", cost: "-4 speed.", tip: ["50% double blows", "-4 speed"] },
    chain: { name: "Shrine of Blight", pact: "Pact of Blight",
      gift: "Your spells leap on to the next enemy nearby.", cost: "-4 defence.", tip: ["spells leap on", "-4 defence"] },
    forge: { name: "Shrine of the Little Crown", pact: "Pact of the Little Crown",
      gift: "Everything in your bag goes up a tier.", cost: "-50 max hp.", tip: ["bag a tier up", "-50 max hp"] },
  },
  says: "It gives, and it takes.",
  seen: { common: "You come upon an old shrine. A {animal} is carved into its stone.",
    rare: "You come upon an old shrine, red as a wound." },
  no: "You leave the shrine be.", cold: "The shrine is silent now.", borne: "You already bear this pact.",
  took: "The shrine takes its due." };
const shrinesUsed = new Set();     // the shrines whose pacts have been taken, by shrineKey()
const pactsTaken = [];             // the rare pacts taken, in order (the buffs' row shows them)
const shrineKey = (s, on = map) => `${on.id} ${s.x},${s.y}`;
const shrinesOn = (on = map) => (on === MAPS.outside ? world.shrines : on.cave?.shrine ? [on.cave.shrine] : []);
const shrineIcon = kind => SCENE.shrines[kind].cells.find(([dx, dy]) => dx === SCENE.shrines[kind].icon[0] && dy === SCENE.shrines[kind].icon[1])[2];
// Its cells in the way: its rocks outside, all of it in the cave
const shrineSolid = s => { const c = []; for (let y = map.cave ? s.y : s.y + 2; y < s.y + 3; y++) for (let x = s.x; x < s.x + 3; x++) c.push([x, y]); return c; };
const shrineAt = (x, y) => shrinesOn().find(s => shrineSolid(s).some(([cx, cy]) => cx === x && cy === y)) ?? null;
// The shrine the character's right beside, and which of its cells they're beside (for the [F] prompt)
function shrineTarget() {
  if (lookout) return null;
  for (const s of shrinesOn())
    for (const [x, y] of shrineSolid(s)) if (Math.abs(x - player.x) + Math.abs(y - player.y) === 1) return { shrine: s, at: [x, y] };
  return null;
}
// Walking into one (or F beside it): its pact offered, unless it's cold, or a rare one's borne already
function meetShrine(s) {
  const P = SHRINE.pacts[s.kind];
  if (shrinesUsed.has(shrineKey(s))) return say(SHRINE.cold);
  if (P.pact && pactsTaken.includes(s.kind)) return say(SHRINE.borne);
  say(speech(P.name, SHRINE.says));
  talk = { shrine: s, buttons: {} };
  held.length = 0;
}
// What a pact gives and costs, as the offer shows it: [gift, cost]
function pactWords(kind) {
  const P = SHRINE.pacts[kind], C = SHRINE.common;
  if (P.pact) return [tl(P.gift), tl(P.cost)];
  return [kind === "hp" ? tl("+{n} max hp.", { n: C.hp }) : tl("+{n} {stat}.", { n: C.by, stat: tl(STAT_WORDS[kind]) }), tl("-{n} to another stat, at random.", { n: C.cost })];
}
// The answer to it: the pact taken, or the shrine left be
function answerShrine(yes) {
  const s = talk?.shrine;
  talk = null;
  canvas.style.cursor = "";
  if (!s) return;
  if (!yes) return say(SHRINE.no);
  const P = SHRINE.pacts[s.kind], C = SHRINE.common;
  shrinesUsed.add(shrineKey(s));
  map.landmarks.delete(key(s.x + SCENE.shrines[s.kind].icon[0], s.y + SCENE.shrines[s.kind].icon[1]));
  say(tr(SHRINE.took, {}, INK.down));
  if (!P.pact) {                   // a common one
    if (s.kind === "hp") { pact.hp += C.hp; stats.hp += C.hp; } else stats[s.kind] += C.by;
    const others = STAT_ORDER.filter(k => k !== s.kind), lost = others[Math.floor(random() * others.length)];
    stats[lost] -= C.cost;
    say(tr("You feel {gain} and {loss}.", { gain: [s.kind === "hp" ? tl("+{n} max hp", { n: C.hp }) : tl("+{n} {stat}", { n: C.by, stat: tl(STAT_WORDS[s.kind]) }), INK.up],
      loss: [tl("-{n} {stat}", { n: C.cost, stat: tl(STAT_WORDS[lost]) }), INK.down] }));
    toll();
  } else {
    pactsTaken.push(s.kind);
    if (s.kind === "drain") pact.drain = true;
    if (s.kind === "crit") { pact.crit = true; stats.spd -= SHRINE.critSpd; }
    if (s.kind === "chain") { pact.chain = true; stats.def -= SHRINE.chainDef; }
    if (s.kind === "forge") {
      pact.forge++;
      pact.hp -= SHRINE.forgeHp;
      for (const [old, id] of forgeBag())
        say(tr("Your {old} becomes {made}.", { old: thingNoun(old, INK.name), made: thingNoun(id, INK.title) }));
    }
    stats.hp = Math.max(1, Math.min(stats.hp, maxHp()));
    say(tr("You bear the {pact}. {gift} {cost}", { pact: [tl(P.pact), INK.title], gift: [tl(P.gift), INK.up], cost: [tl(P.cost), INK.down] }));
    omen();
  }
}
// The first sight of a shrine (any of its cells clearly in sight), the log says what it is (see SHRINE.seen)
const shrinesSighted = new Set();
function noticeShrines() {
  for (const s of shrinesOn()) {
    const k = shrineKey(s);
    if (shrinesSighted.has(k) || !Array.from({ length: 9 }, (_, i) => [s.x + i % 3, s.y + Math.floor(i / 3)]).some(at => inSight(...at))) continue;
    shrinesSighted.add(k);
    tally.shrinePoints += SCORE.shrine[SHRINE.pacts[s.kind].pact ? 1 : 0];
    const P = SHRINE.pacts[s.kind];
    say(P.pact ? tr(SHRINE.seen.rare, {}, INK.down) : tl(SHRINE.seen.common, { animal: tl(P.animal) }));
  }
}
// Envy's price (see SHRINE): a step taken each turn the character's somewhere else than the last
let pactAt = null;
function pactTurn() {
  const here = `${map.id} ${player.x},${player.y}`, moved = pactAt !== null && here !== pactAt;
  pactAt = here;
  if (!pact.drain || !moved || ++pact.steps % SHRINE.bleed || stats.hp <= 1) return;
  stats.hp--;
}
// The Storm's leaps (see SHRINE): from the monster `from` a spell's hurt for `dmg`, on to the
// nearest one in sight not yet hit, weaker each time
function leap(from, dmg, skill, now) {
  if (!pact.chain || !dmg) return;
  const C = SHRINE.chain, hit = new Set([from]), far = (a, b) => fogDistance(a.x - b.x, a.y - b.y, CW, CH);
  let at = from, d = dmg;
  for (let n = 0; n < C.jumps; n++) {
    d = Math.max(1, Math.round(d * C.share));
    const next = foes.filter(t => !t.dead && t.on === map && !hit.has(t) && !(t.charmed > 0) && !t.still && far(t, at) <= C.reach && inSight(t.x, t.y))
      .sort((a, b) => far(a, at) - far(b, at))[0];
    if (!next) return;
    hit.add(next);
    strikeFx("thunderbolt", [next.x, next.y], now, true);
    wound(next, d, now, "your {by}", "Your {by} leaps to", true, skill.name);
    at = next;
  }
}
// The Forge's (see SHRINE): what one of the bag's things becomes a tier up, if anything. Gear the
// next tier's of its kind, the same affix (a trinket, or tier IV gear, an affix up, as the blacksmith
// makes it, see SMITH); a spell the next tier's one in its row (FORGE_UP, Claude's pairing), or an
// affix up at tier IV. A class's own skill, a relic and a keepsake stay as they are.
const FORGE_UP = { regeneration: "stoneskin", firebolt: "thunderbolt", blink: "ice-ring", haste: "rage",
  "ice-ring": "summon-yig-spirit", thunderbolt: "summon-yig-mage", stoneskin: "barrier", rage: "summon-yig-warrior",
  "summon-yig-warrior": "reaper", "summon-yig-mage": "void-orb", "summon-yig-spirit": "charm", barrier: "drain" };
function forgedOf(id) {
  const sk = SKILLS[id], it = ITEMS[id];
  if (sk) {
    if (!sk.tier || classBound(id)) return null;
    const up = FORGE_UP[sk.variant], next = SMITH.steps[sk.affix];
    if (up) return SKILLS[`${up}-${sk.affix}`] ? `${up}-${sk.affix}` : `${up}-normal`;
    return next && SKILLS[`${sk.variant}-${next}`] ? `${sk.variant}-${next}` : null;
  }
  if (!it?.slot || it.relic || it.keepsake) return null;
  const up = it.tier && Object.keys(ITEMS).find(k => ITEMS[k].slot === it.slot && ITEMS[k].kind === it.kind && ITEMS[k].tier === it.tier + 1 &&
    ITEMS[k].affix === it.affix && !ITEMS[k].relic && !ITEMS[k].keepsake);
  return up || smithMakes(id);
}
// Everything in the bag made what forgedOf() says (a spell that would be one of a kind already
// known stays as it is): each [what it was, what it is]
function forgeBag() {
  const made = [];
  bag.forEach((b, i) => {
    const id = b && forgedOf(b.id);
    if (!id || (SKILLS[id] && bag.some((o, j) => j !== i && SKILLS[o?.id]?.variant === SKILLS[id].variant))) return;
    const old = b.id;
    b.id = id;
    for (let k = 0; k < shortcuts.length; k++) if (shortcuts[k] === old) shortcuts[k] = id;
    if (cooling.has(old)) { cooling.set(id, cooling.get(old)); cooling.delete(old); }
    rememberAs(old, id);
    made.push([old, id]);
  });
  keepOneTool();
  return made;
}

// A kill by the weapon worn (see BLADE): counted, and, at enough of them, a name for it
function bladeKill(s, at) {
  const id = wearing("weapon");
  if (!id) return;
  const fam = BLADE.families[s.kind] ?? "folk", was = shownName(id);
  const m = blades.get(id) ?? { kills: {}, total: 0, name: null, epithet: null };
  blades.set(id, m);
  m.kills[fam] = (m.kills[fam] ?? 0) + 1;
  m.total++;
  if (!m.name && m.total >= BLADE.named) {
    const most = Object.entries(m.kills).sort((a, b) => b[1] - a[1])[0][0];
    m.name = BLADE.banes[most];
    say(tr("Your {was} has had its fill of {kinds}. It is {name} now.", { was: [was, INK.name], kinds: tl(BLADE.plural[most]), name: [tl(m.name), INK.title] }), at);
    setTimeout(() => rareFind(1), Math.max(0, at - clock()));
  } else if (m.name && !m.epithet && m.total >= BLADE.legend) {
    m.epithet = BLADE.epithets[Math.floor(random() * BLADE.epithets.length)];
    say(tr("{name} remembers every one of them. It is {full} now, and it strikes harder.", { name: [tl(m.name), INK.title], full: [bladeName(m), INK.title] }), at);
    setTimeout(() => rareFind(2), Math.max(0, at - clock()));
  }
}
// A weapon's memory, kept for it as it becomes another (upgraded, see SMITH and SHRINE)
function rememberAs(old, id) {
  const m = blades.get(old);
  if (!m || blades.has(id)) return;
  blades.set(id, m);
  blades.delete(old);
}
// What its card says of it: what it was, if it's been named, and what it's killed (the two most)
function bladeStory(id, m) {
  const most = Object.entries(m.kills).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([f, n]) => tl(BLADE.counts[f], { n }));
  return [m.name ? tl("Once {item:a}.", { item: noun(ITEMS[id].name) }) : "", tl("{n} {n|one:kill|other:kills}: {list}.", { n: m.total, list: most.join(tl(", ")) }),
    m.epithet ? tl("+{n} attack.", { n: BLADE.atk }) : ""].filter(Boolean).join(" ");
}

let demons = { count: 1, away: DEMON_AWAY };   // the last lot: how many, how far off they started
function addDemon(at) {
  addBoss("demon", at, MAPS.outside, { alert: true, stalked: 0 });
}
addDemon(world.demon);
// Open ground outside at (x, y), the world laid out there first, or nearest along sideways (`sx`
// the way, DEMON.search cells), or else the first cell a monster could walk into
function openNear(x, y, sx) {
  grown += world.extend(x - DEMON.search, y - 8, x + DEMON.search, y + 8);
  wakePatches();                   // (what it laid out woken now, in the turn that's noted, not in a frame's growWorld())
  const along = Array.from({ length: DEMON.search }, (_, n) => x + n * sx).filter(x => foeCanStand(x, y, true));
  return [along.find(x => MAPS.outside.open(x, y)) ?? along[0] ?? x, y];
}
// The next lot (see DEMON), when the last of this one's been banished, at `at`: each `away`
// cells off in its own direction (the world laid out there first), on open ground nearest
// along sideways (`search` cells), or else the first cell it could walk into
function nextDemons(at) {
  if (foes.some(s => s.kind === "demon" && !s.dead)) return;
  demons = { count: demons.count + 1, away: demons.away * DEMON.closer };
  for (let i = 0; i < demons.count; i++) {
    const a = random() * 2 * Math.PI;
    addDemon(openNear(player.x + Math.round(demons.away * Math.cos(a)), player.y + Math.round(demons.away * 8 / 12 * Math.sin(a)), Math.sign(Math.cos(a)) || 1));
  }
  setTimeout(roar, Math.max(0, (at ?? clock()) - clock()));
  say(tr("You feel <hunt>{n} demons</> hunting you now.", { hunt: DEMON.ink, n: foes.filter(s => s.kind === "demon" && !s.dead).length }), at);
}
for (const at of world.ents) addFoe("ent", at);
// The slimes on open ground and the doors of the clearings' sheds (see shedMap()), including
// those laid out further off as the character explores
let patchesSeen = 0, spawnsSeen = 0, chestsSeen = 0, towersSeen = world.towers.length, cavesSeen = 0, shrinesSeen = 0;
function wakePatches() {
  for (; shrinesSeen < world.shrines.length; shrinesSeen++) {   // a shrine's "?" (see SHRINE)
    const sh = world.shrines[shrinesSeen], [ix, iy] = SCENE.shrines[sh.kind].icon;
    MAPS.outside.landmarks.add(key(sh.x + ix, sh.y + iy));
  }
  for (; chestsSeen < world.chests.length; chestsSeen++) {   // a chest out in the forest: what an enemy might drop, or a spell
    const at = world.chests[chestsSeen];
    MAPS.outside.interactables.push(at);
    MAPS.outside.loot.set(key(...at), worse(chestLoot(biomeTier(...at))));
    MAPS.outside.landmarks.add(key(...at));
  }
  for (; towersSeen < world.towers.length; towersSeen++)   // a tower's "?" (see LANDMARK)
    MAPS.outside.landmarks.add(key(...world.towers[towersSeen].door));
  for (; cavesSeen < world.caves.length; cavesSeen++) {    // a cave out in the forest, and its own way down
    const { door } = world.caves[cavesSeen];
    MAPS.outside.landmarks.add(key(...door));
    MAPS.outside.doors.set(key(...door), { to: () => caveMap(1, door) });
    MAPS.outside.keepClear.add(key(...door)).add(key(door[0], door[1] + 1));
  }
  for (; spawnsSeen < world.spawns.length; spawnsSeen++) {
    const { kind, at, band, rest } = world.spawns[spawnsSeen];
    if (kind === "lumberjack") { addJack(at); if (rest) jacks.at(-1).rest = true; }   // at work (or resting by a lake), not the enemy one becomes
    else if (!band) { if (ENEMIES[kind]?.rank === "miniboss") addBoss(kind, at); else addFoe(kind, at); busyMore(kind, at, MAPS.outside); }
    else {                         // one of a graveyard's or a hideout's band (see BAND)
      addFoe(kind, at, MAPS.outside, bandAffix());
      foes.at(-1).band = band;
    }
  }
  const woken = patchesSeen;
  for (; patchesSeen < world.patches.length; patchesSeen++) {
    const { door, red, doors = [], landmark, priest, cells, church, family } = world.patches[patchesSeen];
    if (landmark) MAPS.outside.landmarks.add(key(...landmark));   // a church's door, a bush's foot
    if (priest) addPriest(priest, cells);
    if (world.patches[patchesSeen].racks) wakeRemnants(world.patches[patchesSeen]);   // (see REMNANTS)
    if (family) addFamily(world.patches[patchesSeen], patchesSeen);
    if (world.patches[patchesSeen].home === true) wakeLakeHome(world.patches[patchesSeen]);   // (see LAKE_HOME; a village's `home` is its door)
    if (church) {                  // (walked up into, see churchMap())
      MAPS.outside.doors.set(key(...church.door), { to: () => churchMap(church.door, church.kind) });
      MAPS.outside.keepClear.add(key(...church.door)).add(key(church.door[0], church.door[1] + 1));
    }
    for (const d of doors) {       // a graveyard's shed, a bandits' hideout's hall and sheds, a village's houses and shed
      MAPS.outside.doors.set(key(...d.door), { to: () => shedMap(d.door, { chest: d.chest }) });
      roomDoors.set(key(...d.door), { chest: d.chest, room: d.room });
      MAPS.outside.keepClear.add(key(...d.door)).add(key(d.door[0], d.door[1] + 1));
    }
    if (!door) continue;
    MAPS.outside.doors.set(key(...door), { to: () => shedMap(door, { extra: red }) });
    roomDoors.set(key(...door), { extra: red });
    MAPS.outside.keepClear.add(key(...door)).add(key(door[0], door[1] + 1));
  }
  for (const p of world.patches.slice(woken)) siteGhosts(p);   // (their ghosts, now that they're laid out)
}
// The forest laid out further, over x0, y0 to x1, y1 (cells), and what's in it woken: noted if
// either did anything, so a watched journey wakes it at the same moment. (What was laid out by
// something else, openNear(), is woken here, the next frame, as nothing new may be laid then:
// noted only when the forest grew, such a journey went out of step, 2026-10-18)
const wokenCount = () => patchesSeen + spawnsSeen + chestsSeen + towersSeen + cavesSeen + shrinesSeen;
function growWorld(x0, y0, x1, y1) {
  const had = world.chunks(), was = wokenCount();
  grown += world.extend(x0, y0, x1, y1);
  wakePatches();
  if (world.chunks() === had && wokenCount() === was) return UNCHANGED;
}
wakePatches();
// The living enemy on a cell of the map the character's on, if any
const foeAt = (x, y) => foes.find(s => !s.dead && s.on === map && s.y === y && (s.x === x || (s.long && tailOf(s)[0] === x)));   // (a long one's tail too, see WORM)
const yigAt = (x, y) => yigs.find(w => !w.dead && w.on === map && w.x === x && w.y === y);
// A monster at x, y that isn't charmed (see CHARM)
const hostileAt = (x, y) => { const s = foeAt(x, y); return s && !(s.charmed > 0) ? s : null; };

// Fighting: walking into an enemy attacks it, and next to the character it attacks back,
// each a turn. A blow does atk x `dmg`, less the share def takes off it, def / (def + `defK`)
// (6 def a third, 12 half), never more than `maxBlock`, give or take `spread`, unless it's
// dodged: the chance of that is `dodgePerSpd` % for each point of spd (10 spd, 5%), plus any
// dodge from gear, up to `maxDodge` %. Gear's damage reduction counts up to `maxReduce` %.
// Whoever's hit shakes and blinks red, and the damage
// (or "dodge") floats up from them for `popMs`, `rise` cells; blows in the same turn land
// `gapMs` apart, so a reply comes just after the blow it answers, and the character's next
// turn waits till they've all landed. A dead enemy leaves an item where it fell its kind's
// `drop` of the time. At 0 hp the character dies (see GAME_OVER).
// (so gear and levels count without ever making anyone untouchable; and the character's own
// spells do `spells` times their damage, as monsters have more hp than they had: balance pass
// 2026-10-05, numbers from Claude's simulated fights)
// A blood weapon drains: `DRAIN` of the damage the character's blows and spells do comes back
// to them as hp (the user's "8~12%", 2026-10-11), what's short of a whole hp kept for the next
const DRAIN = 0.1;
let drained = 0;
const FIGHT = { dmg: 10, defK: 6, maxBlock: 0.5, spells: 1.5, spellDef: 0.5, spread: 0.2, dodgePerSpd: 0.5, maxDodge: 50, maxReduce: 25, popMs: 800, rise: 0.75, gapMs: 250 };
const pops = [];                   // { runs, x, y (cells, over the head), t0, on (its map), heal }
// (a `heal` one, hp given back, waits till the turn's blows have all floated clear: first drawn once
// the whole turn's been played, it starts a `gapMs` after the last blow's landed, nextBlowAt, not on
// top of their numbers; the user's, 2026-10-26)
// Whatever dies leaves a skull (Figma type=death, 54:18133) where it fell, as its killing blow
// lands: it pops up `hop` px, bobs like the cursor and drifts up `rise` cells over `ms`,
// fading out from `fadeFrom` of the way through.
const DEATH = { ms: 1600, hop: 4, hopMs: 180, rise: 0.5, fadeFrom: 0.55 };
const deaths = [];                 // { x, y (cells), t0, on (its map) }
let nextBlowAt = 0;                // when the next blow can be shown landing

// Something next to the character (or under them) that F can be used on: a chest with
// something in it, or an item on the ground
// (what they face first, so a chest walked into is opened, not the pile they stand on)
function interactTarget() {
  const near = map.interactables.filter(([x, y]) => Math.abs(x - player.x) + Math.abs(y - player.y) <= 1 && map.loot.has(key(x, y)));
  const [hx, hy] = player.heading ?? [0, 0];
  return near.find(([x, y]) => x === player.x + hx && y === player.y + hy) ?? near[0];
}

// The tower the character is right beside, if any (see LOOKOUT), and the cell of its foot they're at
function towerTarget() {
  if (map !== MAPS.outside) return null;
  for (const tower of world.towers)
    for (let x = tower.x; x < tower.x + tower.w; x++) {
      const y = tower.y + tower.h - 1;
      if (Math.abs(x - player.x) + Math.abs(y - player.y) <= 1) return { tower, at: [x, y] };
    }
  return null;
}
function enterTower(tower) {
  lookout = { tower, eye: { x: tower.x + (tower.w - 1) / 2, y: tower.y } };
  held.length = 0;
  applyZoom();
  say("You climb the tower and look out over the forest.");
}
function leaveTower() {
  lookout = null;
  held.length = 0;
  applyZoom();
  say("You climb back down.");
}

// The latest step, for the squash-and-stretch and slide animation.
const anim = { t0: -Infinity, fromX: player.x, fromY: player.y };

function stepProgress(now, a = anim) {
  return Math.min(1, (now - a.t0) / STEP_ANIM_MS);
}

// Where the character (or the skeleton) is drawn, in cells: slides from the previous cell
// when enabled.
function visualPos(now, who = player, a = anim) {
  if (!SLIDE) return { x: who.x, y: who.y };
  const e = 1 - (1 - stepProgress(now, a)) ** 3; // ease-out
  return { x: a.fromX + (who.x - a.fromX) * e, y: a.fromY + (who.y - a.fromY) * e };
}

// Camera (native px) eases toward the player, keeping them centred: on the screen, or in
// portrait (a phone or tablet held upright, where the HUD and log take up much of the bottom)
// on the space above them.
const cam = { x: 0, y: 0 };
let scale = 1, uiScale = 1, hudScale = 1, originX = 0, originY = 0, hudX = 0, hudY = 0;
let phone = false, gutter = 0;     // whether it's a phone, and the screen px kept clear either side
let lift = 0;                      // screen px the on-screen keyboard covers at the bottom (see keyboardLift())

// World zoom, in whole device pixels per game pixel so tiles stay crisp. zoomStep is how
// many notches the player has moved from the default; it's clamped to MIN/MAX_ROWS. Each game
// (a page load) starts START_ZOOM notches in.
let zoomStep = START_ZOOM;

function applyZoom() {
  const rows = s => canvas.height / (CH * s);
  // rounded up: never more than DEFAULT_ROWS, so glyphs err on the bigger side
  const base = Math.max(1, Math.ceil(canvas.height / (CH * (phone ? PHONE_ROWS : DEFAULT_ROWS))));
  let lo = base, hi = base;
  while (lo > 1 && rows(lo - 1) <= MAX_ROWS) lo--;
  while (rows(hi + 1) >= MIN_ROWS) hi++;
  scale = Math.min(Math.max(base + zoomStep, lo), hi);
  zoomStep = scale - base;
  if (lookout) scale = lo;         // as far out as the zoom goes
}

function zoom(delta) {
  if (lookout) return;
  zoomStep = delta === 0 ? 0 : zoomStep + delta;
  applyZoom();
}

function camTarget() {
  if (lookout) return { x: lookout.eye.x * CW + CW / 2, y: lookout.eye.y * CH + CH / 2 };
  return { x: (player.x + 0.5) * CW, y: (player.y + 0.5) * CH };
}

// Canvas px per CSS px: the screen's own, unless the canvas would then be more than MAX_PIXELS
// (a big or sharp screen, full-screen), when it's a half, a third... of it, so a canvas px is
// still a whole number of the screen's (and drawn blocky, see site.css): every frame's drawn,
// and handed to the CRT pass, in a quarter of the time or less, as fast as on a smaller screen.
// A touch screen (a phone, a tablet) has a slower GPU for its pixels: TOUCH_MAX_PIXELS, so an
// iPad's or an Android tablet's (~4MP at its own resolution) is drawn at half of it
const MAX_PIXELS = 4.5e6, TOUCH_MAX_PIXELS = 2.5e6;
const touchScreen = matchMedia("(pointer: coarse)");
let pixelRatio = window.devicePixelRatio || 1;
function resize() {
  const screen = window.devicePixelRatio || 1, most = touchScreen.matches ? TOUCH_MAX_PIXELS : MAX_PIXELS;
  pixelRatio = screen / Math.max(1, Math.ceil(Math.sqrt(canvas.clientWidth * canvas.clientHeight * screen * screen / most)));
  const dpr = pixelRatio;
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  // The HUD is the same size on every screen, as long as it fits; the world fits ~DEFAULT_ROWS
  // tiles tall (PHONE_ROWS on a phone).
  phone = Math.min(canvas.clientWidth, canvas.clientHeight) < PHONE_PX;
  gutter = Math.round((phone ? PHONE_GUTTER : HUD_GUTTER) * dpr);
  uiScale = Math.max(1, Math.round(UI_ZOOM * dpr));
  hudScale = Math.max(1, Math.min(Math.round(HUD_ZOOM * dpr),
    Math.floor((canvas.width - 2 * gutter) / HUD_W)));
  applyZoom();
  ctx.imageSmoothingEnabled = false;
  Object.assign(cam, camTarget());
  placeHud();
}
function placeHud() {
  const dpr = pixelRatio;
  // HUD is pinned to the screen: horizontally centred, HUD_BOTTOM native px off the bottom
  // (PHONE_HUD_BOTTOM on a phone), and above a phone's home bar, if it has one, or above the
  // on-screen keyboard while it's up (so the chat, over the HUD, shows as it's typed)
  hudX = Math.round((canvas.width - HUD_W * hudScale) / 2);
  const homeBar = Math.round(parseFloat(getComputedStyle(safeProbe).paddingBottom) * dpr) || 0;
  lift = keyboardLift(dpr);
  hudY = canvas.height - (HUD_H + (phone ? PHONE_HUD_BOTTOM : HUD_BOTTOM)) * hudScale - (lift || homeBar);
}
// How much of the bottom of the screen a phone's or tablet's on-screen keyboard covers, in
// screen px: what the visual viewport (what's visible) leaves of the layout one under it. The
// hidden fields typed into sit at the top, so the browser has no reason to scroll the page up.
function keyboardLift(dpr) {
  const vv = window.visualViewport;
  if (!vv) return 0;
  const covered = window.innerHeight - (vv.offsetTop + vv.height);
  return covered > 80 ? Math.round(covered * dpr) : 0;   // (not a browser's toolbar coming and going)
}
window.visualViewport?.addEventListener("resize", placeHud);
window.visualViewport?.addEventListener("scroll", placeHud);
// The bottom safe area (a phone's home bar), read off a hidden element padded by it
const safeProbe = document.createElement("div");
safeProbe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom)";
document.body.append(safeProbe);
new ResizeObserver(resize).observe(canvas);
resize();

// Where the character is centred, down the screen (see cam): in portrait, halfway down the
// space above the HUD, and the log with it when that's stacked over the HUD (its entries and
// buttons; see drawLog()), and then PORTRAIT_DROP rows further down, where it looks centred
const PORTRAIT_DROP = 2.5;
function viewCentreY() {
  if (canvas.height <= canvas.width) return canvas.height / 2;
  const u = hudScale, lineH = SCENE.font.h * logFont();
  const beside = logWidth() > 0;
  const top = beside ? hudY : hudY - LOG.gap * u - lineH - LOG.buttonsGap * u - logEntries() * lineH;
  return top / 2 + Math.round(PORTRAIT_DROP * CH * scale);
}

function updateCamera(now) {
  const t = camTarget();
  cam.x += (t.x - cam.x) * CAMERA_EASE;
  cam.y += (t.y - cam.y) * CAMERA_EASE;
  // snap to whole native pixels so tiles never land between pixels; the tremor is whole
  // device px on top, moving everything together
  const [tx, ty] = tremorOffset(now);
  originX = Math.round(canvas.width / 2 - Math.round(cam.x) * scale) + tx;
  originY = Math.round(viewCentreY() - Math.round(cam.y) * scale) + ty;
}

function drawTile(t, x, y, dy = 0, atlas = tiles) {
  ctx.drawImage(atlas, t * CW, 0, CW, CH,
    originX + x * CW * scale, originY + (y * CH + dy) * scale, CW * scale, CH * scale);
}

// A world tile, faded by its distance from where the character is drawn; a landmark out of
// reveal range is a pulsing "?" instead
let eye = { x: 0, y: 0 }, pulse = 1;
// Faded by distance and by how clearly it's seen (`level`, see sightLevel()); out of sight it
// isn't drawn at all, unless it's a landmark (then it's a "?" too).
function drawWorldTile(t, x, y, ox = 0, level = sightLevel(x, y)) {
  if (typeof t === "string" && (t = noteTiles[t]) === undefined) return;   // (one of NOTE_LOOKS, by its name, once it's made)
  const dx = x - eye.x, dy = y - eye.y;
  if (!seeAll() && map.landmarks.has(key(x, y)) && (level < 0 || fogDistance(dx, dy, CW, CH) >= LANDMARK.reveal + light())) {
    ctx.globalAlpha = pulse;
    drawTile(SCENE.mystery, x, y);
    ctx.globalAlpha = 1;
    return;
  }
  const atlas = sightAtlas(litStep(x, y), level);
  if (atlas) drawTile(t, x + ox / CW, y, 0, atlas);
}

// The river's water ripples the way it flows, a px every `ms`: sideways where it runs more
// sideways, up or down where it runs more up/down (world.js); a lake's is still (its drift 0, world.js LAKE)
const WATER = { ms: 180 };
// Which of its water's drifting frames the river's cell x, y shows at `now`
function waterTile(x, y, now) {
  const frames = SCENE.biomes[world.biomeAt(x, y)].waterDrift, { down, drift } = river.flow(x, y);
  const n = frames[down ? "down" : "across"].length, tick = Math.floor(now / WATER.ms);
  return frames[down ? "down" : "across"][((drift * tick) % n + n) % n];
}

// Trees in every visible cell outside the clearing, knocked about as they're hit, and the
// river's water (drifting, see WATER), bridges and sandbars likewise
function drawForest(now) {
  const shaken = Math.floor((now - shake.t0) / CHOP.shakeMs); // frames into the shake
  const size = CW * scale, rowH = CH * scale;
  const x0 = Math.floor(-originX / size), x1 = Math.ceil((canvas.width - originX) / size);
  const y0 = Math.floor(-originY / rowH), y1 = Math.ceil((canvas.height - originY) / rowH);
  const inView = sight();          // (once, not for every cell: see sightLevel())
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const t = treeAt(x, y), r = river.cell(x, y), trail = t === null && !r ? trailAt(x, y) : null;
      if (t === null && !r && trail === null) continue;
      const k = key(x, y), n = hits.get(k) || 0, sprout = regrowing.has(k) ? regrowth(regrowing.get(k)) : 0;
      const ox = !r && k === shake.k && shaken < CHOP.shake.length && !calm.matches ? CHOP.shake[shaken] : 0;
      const b = r && SCENE.biomes[world.biomeAt(x, y)];   // (its water, bridge or sandbar, see world.js BIOMES)
      const tile = trail ?? (r === "water" ? waterTile(x, y, now) : r ? b[r]
        : sprout ? forestOf(t).growing[Math.min(sprout, forestOf(t).growing.length) - 1] : overgrown.has(k) ? SCENE.entGrass
        : burnt.has(k) ? SCENE.burnt : treeTile(t, n, sooty.has(k)));
      if (seeAll() || lookout || inView.has(k)) drawWorldTile(tile, x, y, ox, inView.get(k) ?? -1);
      else if (remembered.has(k)) {  // remembered: dim, but still fading out with distance
        const step = litStep(x, y);
        if (step >= 0) drawTile(tile, x, y, 0, fog[Math.min(Math.max(step, MEMORY_STEP), fog.length - 1)]);
      }
    }
}

// A big tree is seen through where it covers someone (the character, or a monster in sight)
// standing behind it: within `r` game px of their middle its pixels thin out in an ordered
// dither, `keep` of them left right over them and all of them at the edge, so they show
// through a ragged round gap. The dither keeps to the world's pixels, so it doesn't swim as
// they walk.
const SEE_THROUGH = { r: 15, keep: 0.12, tall: 0.8 };
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
// what to rub out round a middle, for each way the dither can fall on it: [x phase][y phase]
const gapMasks = [0, 1, 2, 3].map(px => [0, 1, 2, 3].map(py => {
  const { r, keep, tall } = SEE_THROUGH, c = document.createElement("canvas");
  c.width = c.height = 2 * r;
  const g = c.getContext("2d"), img = g.createImageData(2 * r, 2 * r);
  for (let y = 0; y < 2 * r; y++)
    for (let x = 0; x < 2 * r; x++) {
      const d = Math.hypot(x + 0.5 - r, (y + 0.5 - r) * tall) / r;
      if (d < 1 && BAYER[(y + py) % 4][(x + px) % 4] >= (keep + (1 - keep) * d * d) * 16) img.data[(y * 2 * r + x) * 4 + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return c;
}));
const gapCell = document.createElement("canvas");
gapCell.width = CW; gapCell.height = CH;
const gapCtx = gapCell.getContext("2d");
// The cells on screen (see drawOutside()), and who's been drawn so far this frame, each the
// middle of where they're drawn, in whole game px: what's drawn after them is in front of them
let view = { x0: 0, y0: 0, x1: 0, y1: 0 }, behind = [];
// Whether a cell's on screen, or within `m` cells of it (as last drawn, outside): what's further
// off isn't drawn at all, however many monsters the world's laid out by now
const nearView = (x, y, m = 2) => x >= view.x0 - m && x <= view.x1 + m && y >= view.y0 - m && y <= view.y1 + m;
// The ground's tiles by 32 x 32 chunks of cells, so a frame finds those on screen without looking
// through them all (more are laid with every patch explored, never taken away: `groundIndexed`
// is how many are in; the order they were laid kept, so the later's still drawn over the earlier)
const groundChunks = new Map(), NO_GROUND = [];
let groundIndexed = 0;
function groundChunk(cx, cy) {
  for (; groundIndexed < ground.length; groundIndexed++) {
    const g = ground[groundIndexed], k = ((g[0] >> 5) + 16384) * 32768 + (g[1] >> 5) + 16384;
    const list = groundChunks.get(k);
    if (list) list.push(g); else groundChunks.set(k, [g]);
  }
  return groundChunks.get((cx + 16384) * 32768 + cy + 16384) ?? NO_GROUND;
}
// A prop is seen whole, as clearly as the clearest of its base, so a roof isn't cut off by the
// wall under it; out of sight, only its landmarks show, as a "?"
function drawProp(prop) {
  if (!prop.box) {
    const xs = prop.cells.map(c => c[0]), ys = prop.cells.map(c => c[1]);
    prop.box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }
  const [bx0, by0, bx1, by1] = prop.box;
  if (bx1 < view.x0 || bx0 > view.x1 || by1 < view.y0 || by0 > view.y1) return;   // off screen
  const levels = prop.base.map(k => sight().get(k) ?? -1).filter(l => l >= 0);
  // (a big tree stands over whatever's in the way, so it's seen as far as the fog allows, in sight or not)
  const level = prop.canopy ? 0 : levels.length ? Math.min(...levels) : -1;
  const { r } = SEE_THROUGH, gaps = prop.canopy && !lookout ? behind : [];
  const alpha = dimmedProp(prop) ? BUSH.dim : 1;   // (an empty shed, with the burning bush's treasure)
  for (const [x, y, t] of prop.cells) {
    if (!(seeAll() || lookout || level >= 0 || map.landmarks.has(key(x, y)))) continue;
    ctx.globalAlpha = alpha;
    const over = gaps.filter(([gx, gy]) => gx + r > x * CW && gx - r < (x + 1) * CW && gy + r > y * CH && gy - r < (y + 1) * CH);
    if (!over.length) { drawWorldTile(t, x, y, 0, level); continue; }
    const atlas = sightAtlas(litStep(x, y), level);
    if (!atlas) continue;
    gapCtx.globalCompositeOperation = "copy";
    gapCtx.drawImage(atlas, t * CW, 0, CW, CH, 0, 0, CW, CH);
    gapCtx.globalCompositeOperation = "destination-out";
    for (const [gx, gy] of over) {
      const mx = gx - r, my = gy - r;
      gapCtx.drawImage(gapMasks[(mx % 4 + 4) % 4][(my % 4 + 4) % 4], mx - x * CW, my - y * CH);
    }
    ctx.drawImage(gapCell, 0, 0, CW, CH, originX + x * CW * scale, originY + y * CH * scale, CW * scale, CH * scale);
  }
  ctx.globalAlpha = 1;
}

// A character's tile at `pos` (cells), scaled around its feet and raised by `dy` game px. Only the
// figure stretches (the user's, 2026-10-26): the tile's block behind it (its most common colour, see
// spriteParts()) stays a cell's size, so no sub-pixel sliver of it shows as the figure squashes.
function drawSprite(t, pos, pose, dy = 0, atlas = tiles) {
  const w = CW * scale * pose.sx, h = CH * scale * pose.sy;
  const parts = pose.sx === 1 && pose.sy === 1 ? null : spriteParts(atlas);
  if (parts) {
    ctx.fillStyle = parts.ground[t];
    ctx.fillRect(Math.round(originX + pos.x * CW * scale), Math.round(originY + (pos.y * CH + dy) * scale), CW * scale, CH * scale);
  }
  ctx.drawImage(parts?.figure ?? atlas, t * CW, 0, CW, CH,
    Math.round(originX + (pos.x + 0.5) * CW * scale - w / 2),
    Math.round(originY + ((pos.y + 1) * CH + dy) * scale - h), Math.round(w), Math.round(h));
}
// An atlas's figures without their blocks and each tile's block colour, made the first time the
// atlas is stretched (null if it can't be read). The block is where the plain tiles have their most
// common colour that isn't white: white's always the figure (the user's, 2026-10-28), however
// much of the tile it covers; and an atlas recoloured from the tiles (a hit's red, a Blink's
// channels) takes its block from the same pixels, whatever colour they've become.
const WHITE = 0xffffffff, spritePartsOf = new WeakMap();
let blockMask = null;              // per pixel of the plain tiles, 1 where it's a tile's block
function rgbaAt(d, i) { return (d[i] << 24 | d[i + 1] << 16 | d[i + 2] << 8 | d[i + 3]) >>> 0; }
function blockOf(W, H) {
  if (!blockMask) {
    const c = Object.assign(document.createElement("canvas"), { width: tiles.width, height: tiles.height }).getContext("2d");
    c.drawImage(tiles, 0, 0);
    const d = c.getImageData(0, 0, tiles.width, tiles.height).data, TW = tiles.width;
    blockMask = new Uint8Array(TW * tiles.height);
    for (let t = 0; t * CW < TW; t++) {
      const seen = new Map();
      for (let y = 0; y < CH; y++) for (let x = t * CW; x < (t + 1) * CW; x++) {
        const c = rgbaAt(d, (y * TW + x) * 4);
        seen.set(c, (seen.get(c) ?? 0) + 1);
      }
      const all = [...seen], most = (all.filter(([c]) => c !== WHITE).length ? all.filter(([c]) => c !== WHITE) : all)
        .reduce((a, b) => (b[1] > a[1] ? b : a))[0];
      for (let y = 0; y < CH; y++) for (let x = t * CW; x < (t + 1) * CW; x++)
        if (rgbaAt(d, (y * TW + x) * 4) === most) blockMask[y * TW + x] = 1;
    }
  }
  return W === tiles.width && H === tiles.height ? blockMask : null;
}
function spriteParts(atlas) {
  if (spritePartsOf.has(atlas)) return spritePartsOf.get(atlas);
  let parts = null;
  try {
    const W = atlas.width, H = atlas.height, mask = blockOf(W, H);
    const figure = Object.assign(document.createElement("canvas"), { width: W, height: H }), g = figure.getContext("2d");
    g.drawImage(atlas, 0, 0);
    const img = g.getImageData(0, 0, W, H), d = img.data, ground = [];
    for (let t = 0; t * CW < W; t++) {
      const seen = new Map();
      for (let y = 0; y < Math.min(CH, H); y++) for (let x = t * CW; x < Math.min((t + 1) * CW, W); x++) {
        const i = (y * W + x) * 4, c = rgbaAt(d, i);
        if (!mask || mask[y * W + x]) seen.set(c, (seen.get(c) ?? 0) + 1);
      }
      const c = seen.size ? [...seen].reduce((a, b) => (b[1] > a[1] ? b : a))[0] : 0;
      ground.push(`rgba(${c >>> 24}, ${c >>> 16 & 255}, ${c >>> 8 & 255}, ${(c & 255) / 255})`);
      for (let y = 0; y < Math.min(CH, H); y++) for (let x = t * CW; x < Math.min((t + 1) * CW, W); x++) {
        const i = (y * W + x) * 4;
        if (mask ? mask[y * W + x] : rgbaAt(d, i) === c) d[i + 3] = 0;
      }
    }
    g.putImageData(img, 0, 0);
    parts = { figure, ground };
  } catch {}
  spritePartsOf.set(atlas, parts);
  return parts;
}

// How far (in cells) someone who's just taken a blow is knocked aside, shaking like a hit tree
function jolt(now, who) {
  const f = Math.floor((now - who.hitT0) / CHOP.shakeMs);
  return !calm.matches && f >= 0 && f < CHOP.shake.length ? CHOP.shake[f] / CW : 0;
}
// ...and blinks red as it lands: washed fully red for `ms`, then not, `times` over
const BLINK = { ms: 60, times: 2 };
const blinkAtlases = new Map();    // atlas -> the same washed red, made when first needed
function blink(now, who, atlas) {
  const f = Math.floor((now - who.hitT0) / BLINK.ms);
  if (f < 0 || f >= 2 * BLINK.times || f % 2) return atlas;
  if (!blinkAtlases.has(atlas)) blinkAtlases.set(atlas, redAtlases([atlas], 1)[0]);
  return blinkAtlases.get(atlas);
}

// Character: returns where it was drawn and the pose used. Sneaking (see SNEAK) it's see-through,
// added onto what's under it at SNEAKING's alpha (Figma 639:57888: plus-lighter at 60%).
const SNEAKING = { alpha: 0.6 };
// Buffed (the user's, 2026-10-16), the character's sprite glows a little: a soft halo `blur`
// game px round its box, breathing between `low` and `high` every `pulseMs` (held at `high`
// with reduced motion), in the colour of the first of `inks` that's on them: a Barrier's,
// regeneration's, a Sneak's, an echo's (Screech), or any boost that raises a stat (a spell's,
// a skill's or a potion's; a boost that only lowers them, a bad potion's, doesn't count)
const BUFF_GLOW = { blur: 3, low: 0.35, high: 0.75, pulseMs: 1600,
  inks: { shield: "#639bff", regen: "#99e57e", sneak: "#d77bba", reveal: "#cbdbfc", boost: "#fbf236" } };
function buffInk() {
  const on = { shield: !!shield, regen: regens.length > 0, sneak: sneakLeft > 0, reveal: revealLeft > 0,
    boost: boosts.some(b => Object.values(b.stats).some(n => n > 0)) };
  const k = Object.keys(BUFF_GLOW.inks).find(k => on[k]);
  return k && BUFF_GLOW.inks[k];
}
// Phasing (the user's, 2026-10-16): blinking and sneaking, the character's sprite comes apart
// like a lens's chromatic aberration, its red drawn `spread` game px to one side and its green
// and blue to the other (added onto it, so where they overlap it's its own colours again, and
// the edges fringe red and cyan). Just after a Blink it's `blink` px apart, closing evenly over `ms`;
// all the while they're sneaking it's `sneak` px, swaying side to side every `swayMs` (held
// apart, with reduced motion, and no Blink's).
const PHASE = { blink: 3, ms: 900, sneak: 1, swayMs: 1400 };
let blinkT0 = -Infinity;           // (when the character last blinked)
const channelAtlases = new Map();  // [r, g, b] kept -> the tiles with only those
function channelAtlas([r, g, b]) {
  const k = `${r}${g}${b}`;
  if (!channelAtlases.has(k)) {
    const c = document.createElement("canvas");
    [c.width, c.height] = [tiles.width, tiles.height];
    const x = c.getContext("2d");
    x.drawImage(tiles, 0, 0);
    const img = x.getImageData(0, 0, c.width, c.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) { d[i] *= r; d[i + 1] *= g; d[i + 2] *= b; }
    x.putImageData(img, 0, 0);
    channelAtlases.set(k, c);
  }
  return channelAtlases.get(k);
}
// How far apart (game px) the character's colours are now, 0 for not
function phase(now) {
  const t = (now - blinkT0) / PHASE.ms, blinking = !calm.matches && t >= 0 && t < 1 ? PHASE.blink * (1 - t) : 0;
  const sneaking = sneakLeft > 0 ? PHASE.sneak * (calm.matches ? 1 : Math.sin(2 * Math.PI * now / PHASE.swayMs)) : 0;
  return Math.abs(blinking) >= Math.abs(sneaking) ? blinking : sneaking;
}
function drawPlayer(now) {
  if (lookout) return { pos: lookout.eye, pose: stepPose(1) };   // up the tower: only the cursor, over its top
  const pos = visualPos(now);
  const pose = stepPose(stepProgress(now));
  const ink = !dead && buffInk();
  if (ink) {
    const G = BUFF_GLOW, swell = calm.matches ? 1 : 0.5 - 0.5 * Math.cos(2 * Math.PI * now / G.pulseMs);
    const a = Math.round(255 * (G.low + (G.high - G.low) * swell)).toString(16).padStart(2, "0");
    [ctx.shadowColor, ctx.shadowBlur] = [ink + a, G.blur * scale];
  }
  if (sneakLeft > 0) [ctx.globalAlpha, ctx.globalCompositeOperation] = [SNEAKING.alpha, "lighter"];
  const t = SCENE.classes[charClass][player.facing], x = pos.x + jolt(now, player), apart = dead ? 0 : phase(now);
  if (!dead) drawHasteGhosts(now, t);
  if (Math.abs(apart) * scale >= 0.5) {
    const off = Math.round(apart * scale) / scale / CW;
    drawSprite(t, { x: x - off, y: pos.y }, pose, 0, channelAtlas([1, 0, 0]));
    [ctx.shadowBlur, ctx.globalCompositeOperation] = [0, "lighter"];
    drawSprite(t, { x: x + off, y: pos.y }, pose, 0, channelAtlas([0, 1, 1]));
  } else drawSprite(t, { x, y: pos.y }, pose, 0, now - stoneT0 < STONE.flashMs ? stoneAtlas() : blink(now, player, tiles));
  [ctx.globalAlpha, ctx.globalCompositeOperation, ctx.shadowBlur, ctx.shadowColor] = [1, "source-over", 0, "transparent"];
  if (!dead) drawBarrier(now, { x, y: pos.y });
  return { pos, pose };
}

// Spell effects (the user's, 2026-10-16), each in a few px of the palette, drawn over everyone
// (drawFx()) unless they go with the character's sprite. All in game px; none of them moves
// with reduced motion but the ones that have to (a bolt's line, the specks that show where
// something went), and those are quicker.
//   bolt:    a Thunderbolt's (Reaper's, Drain's) jagged 1 px line from the character to where it
//            struck, re-jagged every `jagMs`, for `ms`; a Thunderbolt's also lights up the cells
//            round what it struck, bright for `flashMs` (`flash` cells round)
//   drain:   `n` specks drifting from what was drained back into the character over `ms`
//   ring:    a dithered 1 px ring spreading out from the character to `r` cells over `ms`
//            (Rage red, Adrenaline yellow, Screech pale and as far as its echoes go)
//   specks:  `n` specks drifting from the character to a monster over `ms` (Charm's pink)
//   square:  a Void Orb's 3x3 cells, dithered, when it strikes, fading over `ms`
//   puff:    `n` px of spirit dust rising round a Yig as it's summoned, over `ms`
//   chips:   `n` grey chips knocked off a stoneskinned character, falling over `ms`
//   shards:  `n` px of a Barrier flying apart as it breaks, over `ms`
const FX = {
  bolt: { ms: 170, jagMs: 50, step: 6, jag: 3, flashMs: 110, flash: 1.6,
    inks: { thunderbolt: ["#fbf236", "#ffffff"], reaper: ["#ac3232", "#663931"], drain: ["#d95763", "#ac3232"] }, flashInk: "255, 250, 200" },
  drain: { n: 8, ms: 520, ink: ["#d95763", "#ac3232"] },
  ring: { ms: 380, r: 2, inks: { rage: "#d95763", adrenaline: "#fbf236", screech: "#cbdbfc", guard: "#5fcde4" }, screechMs: 750 },
  specks: { n: 7, ms: 520, ink: ["#d77bba", "#f2a6c8"] },
  square: { ms: 380, ink: "#76428a", alpha: 0.7 },
  puff: { n: 14, ms: 650, rise: 7, inks: ["#cbdbfc", "#9badb7", "#5fcde4"] },
  chips: { n: 4, ms: 450, fall: 8, inks: ["#9badb7", "#847e87", "#696a6a"] },
  shards: { n: 18, ms: 450, far: 12, ink: "#639bff" },
};
const fx = [];                     // { kind, t0, on (its map), ... }
const addFx = (kind, t0, more) => fx.push({ kind, t0, on: map, ...more });
// Middle of a cell, in game px
const mid = (x, y) => [(x + 0.5) * CW, (y + 0.5) * CH];
// A game px at x, y, `size` of them square, in `ink`
function gpx(x, y, ink, size = 1) {
  ctx.fillStyle = ink;
  ctx.fillRect(originX + Math.round(x) * scale, originY + Math.round(y) * scale, size * scale, size * scale);
}
// The game px along a line, end to end
function pxLine(x0, y0, x1, y1, ink) {
  [x0, y0, x1, y1] = [x0, y0, x1, y1].map(Math.round);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  for (let e = dx + dy; ; ) {
    gpx(x0, y0, ink);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
}
// A strike's line (see FX.bolt) from the character to cell `to`, of `kind`
function strikeFx(kind, to, now, hit) {
  addFx("bolt", now, { from: mid(player.x, player.y), to: mid(...to), ink: kind, hit, seed: Math.floor(now) & 0xffff });
}
const fxShows = (x, y) => seeAll() || lookout || noFog || sight().has(key(Math.floor(x / CW), Math.floor(y / CH)));
function drawFx(now) {
  ctx.save();
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i], F = FX[f.kind], ms = f.ms ?? F.ms, t = (now - f.t0) / ms;
    if (t >= 1) { fx.splice(i, 1); continue; }
    if (t < 0 || f.on !== map) continue;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    if (f.kind === "bolt") {
      const [ink, core] = F.inks[f.ink], [x0, y0] = f.from, [x1, y1] = f.to, len = Math.hypot(x1 - x0, y1 - y0);
      if (f.hit && f.ink === "thunderbolt" && now - f.t0 < F.flashMs) {   // (the lightning's flash round what it struck)
        const a = 1 - (now - f.t0) / F.flashMs, r = F.flash * CW * scale, cx = originX + x1 * scale, cy = originY + y1 * scale;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(${F.flashInk}, ${0.8 * a})`);
        g.addColorStop(1, `rgba(${F.flashInk}, 0)`);
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = g;
        ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
        ctx.globalCompositeOperation = "source-over";
      }
      const n = Math.max(1, Math.round(len / F.step)), jag = Math.floor((now - f.t0) / F.jagMs), nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1);
      let px = x0, py = y0;
      for (let k = 1; k <= n; k++) {
        const off = k === n ? 0 : (cellHash(k, jag, f.seed) - 0.5) * 2 * F.jag;
        const qx = x0 + (x1 - x0) * k / n + nx * off, qy = y0 + (y1 - y0) * k / n + ny * off;
        pxLine(px, py, qx, qy, jag % 2 ? core : ink);
        [px, py] = [qx, qy];
      }
    } else if (f.kind === "drain") {
      const [x0, y0] = f.from, [x1, y1] = mid(player.x, player.y);
      for (let k = 0; k < F.n; k++) {
        const u = t * 1.4 - k * 0.4 / F.n;
        if (u < 0 || u > 1) continue;
        const e = u * u * (3 - 2 * u), w = Math.sin(u * Math.PI) * 4 * (cellHash(k, 1, f.seed) - 0.5);
        gpx(x0 + (x1 - x0) * e - (y1 - y0) / 40 * w, y0 + (y1 - y0) * e + w, F.ink[k % 2]);
      }
    } else if (f.kind === "ring") {
      const [cx, cy] = mid(player.x, player.y), r = (f.r ?? F.r) * CW * (1 - (1 - t) ** 2);
      ctx.globalAlpha = 1 - t * t;
      const n = Math.max(12, Math.round(2 * Math.PI * r));
      for (let k = 0; k < n; k += 2) {
        const a = 2 * Math.PI * k / n, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * CW / CH * 1.1;
        if (fxShows(x, y)) gpx(x, y, F.inks[f.ink]);
      }
    } else if (f.kind === "specks") {
      const [x0, y0] = mid(player.x, player.y), [x1, y1] = f.to;
      for (let k = 0; k < F.n; k++) {
        const u = t * 1.3 - k * 0.3 / F.n;
        if (u < 0 || u > 1) continue;
        const e = u * u * (3 - 2 * u), lift = Math.sin(u * Math.PI) * (6 + 4 * cellHash(k, 2, f.seed));
        gpx(x0 + (x1 - x0) * e + (cellHash(k, 3, f.seed) - 0.5) * 4, y0 + (y1 - y0) * e - lift, F.ink[k % 2]);
      }
    } else if (f.kind === "square") {
      ctx.globalAlpha = F.alpha * (1 - t);
      for (let gy = (f.y - 1) * CH; gy < (f.y + 2) * CH; gy++)
        for (let gx = (f.x - 1) * CW; gx < (f.x + 2) * CW; gx++)
          if ((gx + gy + Math.floor(t * 4)) % 2 === 0 && fxShows(gx, gy)) gpx(gx, gy, F.ink);
    } else if (f.kind === "puff" || f.kind === "chips" || f.kind === "shards") {
      const [cx, cy] = f.at;
      if (!fxShows(cx, cy)) continue;
      ctx.globalAlpha = 1 - t;
      for (let k = 0; k < F.n; k++) {
        const h = j => cellHash(k, j, f.seed), a = h(0) * 2 * Math.PI;
        if (f.kind === "puff") gpx(cx + Math.cos(a) * 5 * h(1), cy + 4 + Math.sin(a) * 3 * h(1) - F.rise * t * (0.5 + h(2)), F.inks[k % F.inks.length], h(3) > 0.6 ? 2 : 1);
        else if (f.kind === "chips") gpx(cx + (h(1) - 0.5) * 8 + Math.cos(a) * 4 * t, cy + (h(2) - 0.5) * 6 - 3 * Math.sin(Math.PI * t) + F.fall * t * t, F.inks[k % F.inks.length]);
        else gpx(cx + Math.cos(a) * (5 + F.far * t * (0.5 + h(1))), cy + Math.sin(a) * (7 + F.far * t * (0.5 + h(1))) * 0.8, F.ink, h(2) > 0.5 ? 2 : 1);
      }
    }
  }
  ctx.restore();
}
// A Barrier up (see shield): a dithered 1 px outline round the character's box, its dots
// shimmering from one half to the other every `ms`, all of them lit, brighter, for `hitMs`
// once it soaks up a blow
const BARRIER = { ms: 220, hitMs: 180, ink: "#639bff", hitInk: "#cbdbfc" };
let barrierHitT0 = -Infinity;
function drawBarrier(now, pos) {
  if (!shield) return;
  const x0 = Math.round(pos.x * CW) - 1, y0 = Math.round(pos.y * CH) - 1, w = CW + 2, h = CH + 2;
  const hit = now - barrierHitT0 >= 0 && now - barrierHitT0 < BARRIER.hitMs, flip = Math.floor(now / BARRIER.ms) % 2;
  for (let i = 0; i < 2 * (w + h) - 4; i++) {
    if (!hit && (i + flip) % 2) continue;
    const [x, y] = i < w ? [i, 0] : i < w + h - 1 ? [w - 1, i - w + 1] : i < 2 * w + h - 2 ? [w - 1 - (i - w - h + 2), h - 1] : [0, h - 1 - (i - 2 * w - h + 3)];
    gpx(x0 + x, y0 + y, hit ? BARRIER.hitInk : BARRIER.ink);
  }
}
// Hasted (a Haste or a Haste Potion), a step leaves after-images: the sprite where the character
// was `lagMs` and twice that ago, at each of `alphas`: no further back than where the step began
// (before it the slide's ease ran backwards, throwing them cells behind), and without the buff's
// glow, the sprite's own
const HASTE_GHOSTS = { lagMs: 55, alphas: [0.35, 0.15] };
const hasted = () => boosts.some(b => /haste/i.test(b.name) && (b.stats.spd ?? 0) > 0);
function drawHasteGhosts(now, t) {
  if (!hasted() || calm.matches || stepProgress(now) >= 1) return;
  const was = [ctx.globalAlpha, ctx.globalCompositeOperation, ctx.shadowBlur];
  ctx.shadowBlur = 0;
  HASTE_GHOSTS.alphas.forEach((a, k) => {
    const then = Math.max(anim.t0, now - HASTE_GHOSTS.lagMs * (k + 1));
    ctx.globalAlpha = a * was[0];
    drawSprite(t, visualPos(then), stepPose(stepProgress(then)), 0, tiles);
  });
  [ctx.globalAlpha, ctx.globalCompositeOperation, ctx.shadowBlur] = was;
}
// Stoneskin: cast, the character's sprite flashes stone grey for `flashMs`; while it's on, each
// blow that lands knocks a few grey chips off them (FX.chips)
// (stone grey: each px's lightness, from `dark` to `light`)
const STONE = { flashMs: 220, dark: [0x32, 0x3c, 0x39], light: [0xcb, 0xdb, 0xfc] };
let stoneT0 = -Infinity, stoneAtlasMade = null;
function stoneAtlas() {
  if (!stoneAtlasMade) {
    const c = document.createElement("canvas");
    [c.width, c.height] = [tiles.width, tiles.height];
    const x = c.getContext("2d");
    x.drawImage(tiles, 0, 0);
    const img = x.getImageData(0, 0, c.width, c.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const l = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255;
      for (let k = 0; k < 3; k++) d[i + k] = STONE.dark[k] + (STONE.light[k] - STONE.dark[k]) * l;
    }
    x.putImageData(img, 0, 0);
    stoneAtlasMade = c;
  }
  return stoneAtlasMade;
}
const stoneskinned = () => boosts.some(b => /stoneskin/i.test(b.name));
// A Yig summoned (see summon()) comes in phasing (see PHASE) for `ms`, `apart` px at first
const YIG_IN = { ms: 700, apart: 3 };

// A skeleton fades with the fog like the world around it, and is lost in the dark
const skeletonHop = (now, s) =>
  s.alert && s.alertLeft ? ENEMY.hop[Math.floor((now - s.alertT0) / ENEMY.hopMs) % ENEMY.hop.length] : 0;
function skeletonAtlas(s, pos) {
  return sightAtlas(litStep(pos.x, pos.y), sightLevel(s.x, s.y));
}
function drawSkeleton(now, s) {
  const pos = visualPos(now, s, s.anim), atlas = skeletonAtlas(s, pos) ?? (s.ghostGear && relicOn("lost-souls-lantern") ? fog[RELIC.seeFog] : null);
  if (!atlas) return;
  const pose = stepPose(stepProgress(now, s.anim)), hop = skeletonHop(now, s), look = shock(now, s, atlas) ?? blink(now, s, atlas);
  if (s.long) drawSprite(SCENE.stonewormTail[s.affix][s.facing], { x: tailOf(s, pos.x + jolt(now, s))[0], y: pos.y }, pose, hop, look);   // (see WORM)
  drawSprite(SCENE[s.look ?? s.kind][s.affix][s.facing], { x: pos.x + jolt(now, s), y: pos.y }, pose, hop, look);
}
// A Yig (see YIG) likewise, without a hop
function drawYig(now, w) {
  const pos = visualPos(now, w, w.anim), atlas = skeletonAtlas(w, pos);
  if (!atlas) return;
  const t = w.look?.[w.facing] ?? SCENE.yig[w.kind][w.facing], x = pos.x + jolt(now, w), pose = stepPose(stepProgress(now, w.anim));
  const u = (now - (w.summonT0 ?? -Infinity)) / YIG_IN.ms, apart = !calm.matches && u >= 0 && u < 1 ? YIG_IN.apart * (1 - u) : 0;
  if (apart * scale < 0.5) return drawSprite(t, { x, y: pos.y }, pose, 0, blink(now, w, atlas));
  const off = Math.round(apart * scale) / scale / CW;
  ctx.globalAlpha = Math.min(1, u * 2);
  drawSprite(t, { x: x - off, y: pos.y }, pose, 0, channelAtlas([1, 0, 0]));
  ctx.globalCompositeOperation = "lighter";
  drawSprite(t, { x: x + off, y: pos.y }, pose, 0, channelAtlas([0, 1, 1]));
  [ctx.globalAlpha, ctx.globalCompositeOperation] = [1, "source-over"];
}
// Struck by a Thunderbolt (or a Reaper's or Drain's strike), it flickers as if electrocuted:
// its colours inverted and back, a frame every `ms`, `times` over, from when the strike lands
// (instead of the red blink of a blow; inverted, the user's, 2026-10-16). Null when it isn't.
const SHOCK = { ms: 45, times: 5 };
const shockAtlases = new Map();    // atlas -> the same, its colours inverted, made when first needed
function invertAtlas(atlas) {
  const c = document.createElement("canvas");
  [c.width, c.height] = [atlas.width, atlas.height];
  const x = c.getContext("2d");
  x.drawImage(atlas, 0, 0);
  const img = x.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; }
  x.putImageData(img, 0, 0);
  return c;
}
function shock(now, s, atlas) {
  const f = Math.floor((now - (s.shockT0 ?? -Infinity)) / SHOCK.ms);
  if (f < 0 || f >= 2 * SHOCK.times) return null;
  if (f % 2) return atlas;
  if (!shockAtlases.has(atlas)) shockAtlases.set(atlas, invertAtlas(atlas));
  return shockAtlases.get(atlas);
}
// Its "!", bobbing like the cursor, over everything (trees included) so it's never hidden.
// With the character right on top of it, it sits beside its head on the facing side instead.
const ALERT_BESIDE = { dx: 0.75, dy: -0.25 };   // in cells
// A frozen one has the frost (icons, 272:62432) over it, still, and a paralysed one its mark
// (272:62443) over its head where the "!" goes, bobbing like it, in place of the "!".
function drawAlert(now, s) {
  if (s.dead) return;
  const pos = visualPos(now, s, s.anim), atlas = skeletonAtlas(s, pos);
  if (!atlas) return;
  if (s.frozen > 0) drawTile(SCENE.ice, pos.x, pos.y, 0, atlas);
  const bob = BOB[Math.floor(now / BOB_MS) % BOB.length] + skeletonHop(now, s);
  if (!(s.paralysed > 0) && !(s.alert && s.alertLeft) && !(s.charmed > 0) && !s.fleeing) {
    if (s.nemesis && noteTiles.nemesis !== undefined) drawTile(noteTiles.nemesis, pos.x, pos.y - 1, bob, atlas);   // (a nemesis's red dot, see NEMESIS)
    return;
  }
  let { x, y } = pos;
  if (player.x === s.x && player.y === s.y - 1) {
    x += (s.facing === "left" ? -1 : 1) * ALERT_BESIDE.dx;
    y += ALERT_BESIDE.dy;
  } else y -= 1;
  drawTile(s.charmed > 0 ? SCENE.heartEmpty : s.paralysed > 0 ? SCENE.paralysed : SCENE.alert, x, y, bob, atlas);
}
// A resonator worn ("sense", items.js) shows each monster on screen that the character can't
// see as a "?" in `ink` where it is, over the dark, bobbing like the "!"; a cursed one's radar
// ("radar") also shows each miniboss on this map that's off screen, at the screen's edge
// (`edge` cells in) the way it is from the character. The "?" is the game's text, a font px
// to each of the world's px.
const SENSE = { ink: "#d95763", edge: 1 };
function drawSense(now) {
  if (!gear("sense") || lookout || dead) return;
  const f = Math.max(1, Math.round(scale)), mark = [["?", SENSE.ink]], w = (sansWidth(mark) - 1) * f, h = SANS.cap * f;   // (in MEK Sans)
  const bob = BOB[Math.floor(now / BOB_MS) % BOB.length] * scale, edge = SENSE.edge * CW * scale;
  for (const s of foes) {
    if (s.dead || s.on !== map) continue;
    const pos = visualPos(now, s, s.anim);
    if (skeletonAtlas(s, pos)) continue;   // (drawn as it is: seen)
    let x = originX + (pos.x + 0.5) * CW * scale - w / 2, y = originY + (pos.y + 0.5) * CH * scale - h / 2 + bob;
    if (x < 0 || y < 0 || x + w > canvas.width || y + h > canvas.height) {
      if (!(gear("radar") && s.rank === "miniboss")) continue;
      // along the line from the character, to where it leaves the screen less the edge
      const cx = originX + (player.x + 0.5) * CW * scale, cy = originY + (player.y + 0.5) * CH * scale, dx = x - cx, dy = y - cy;
      const k = Math.min(dx ? Math.abs(((dx > 0 ? canvas.width - w - edge : edge) - cx) / dx) : Infinity,
        dy ? Math.abs(((dy > 0 ? canvas.height - h - edge : edge) - cy) / dy) : Infinity);
      [x, y] = [cx + dx * k, cy + dy * k];
    }
    drawSans(ctx, mark, Math.round(x), Math.round(y), f);
  }
}

// Reflections (the user's, 2026-10-16): whoever stands at the river's edge, or on a bridge over
// it, shows upside down in the water below their feet. Only their figure, without its box
// (Figma 700:58122, the fighter): a sprite's pixels of any colour but its box's, the colour in
// its top-left corner. The water stays 1-bit: each px of the figure swaps the water's two
// colours where it falls (the ripple's on the water's, the water's on a ripple), from the same
// faded atlas the water's drawn from, so it fades with the fog and ripples as the water does.
// Every other row sits a px aside, the rows swapping every `wobbleMs` as if the water moved
// (still, with reduced motion), and past `solid` rows down it thins to a checkerboard, the
// deeper half of them fading out. Only on water that's in sight; none for someone sneaking.
const REFLECT = { wobbleMs: 360, solid: 6, treeDeep: 1, treeSolid: 6, houseDeep: 3, houseSolid: 16 };
const atlasPixels = new WeakMap(); // atlas -> its pixels, read when first needed
function pixelsOf(atlas) {
  if (!atlasPixels.has(atlas)) {
    const c = document.createElement("canvas");
    [c.width, c.height] = [atlas.width, atlas.height];
    const g = c.getContext("2d");
    g.drawImage(atlas, 0, 0);
    atlasPixels.set(atlas, { w: c.width, d: g.getImageData(0, 0, c.width, c.height).data, pairs: new Map() });
  }
  return atlasPixels.get(atlas);
}
// A sprite's figure: for each of its rows, the columns that aren't its box's colour
// (`ground`: a world tile's instead, a tree's: its pixels of any colour but the ground's,
// FOG's background, so a canopy that fills its cell is all figure)
const figures = new Map();
const GROUND_INK = [7, 19, 36];
function figure(t, ground = false) {
  const k = ground ? -1 - t : t;
  if (!figures.has(k)) {
    const { w, d } = pixelsOf(tiles), at = (x, y) => ((y * w) + t * CW + x) * 4;
    const box = at(0, 0), ink = ground ? GROUND_INK : [d[box], d[box + 1], d[box + 2]];
    const same = i => d[i] === ink[0] && d[i + 1] === ink[1] && d[i + 2] === ink[2];
    figures.set(k, Array.from({ length: CH }, (_, y) =>
      Array.from({ length: CW }, (_, x) => x).filter(x => d[at(x, y) + 3] && !same(at(x, y)))));
  }
  return figures.get(k);
}
// A tile's two colours in an atlas, as css (a water tile's: its water and its ripples)
function tilePair(px, t) {
  if (!px.pairs.has(t)) {
    const seen = [];
    for (let y = 0; y < CH && seen.length < 2; y++)
      for (let x = 0; x < CW && seen.length < 2; x++) {
        const i = (y * px.w + t * CW + x) * 4, c = `rgb(${px.d[i]},${px.d[i + 1]},${px.d[i + 2]})`;
        if (px.d[i + 3] && !seen.includes(c)) seen.push(c);
      }
    px.pairs.set(t, seen);
  }
  return px.pairs.get(t);
}
// `who`: [{ tile, pos }], each sprite as it's drawn this frame
// One px of a reflection at game px wx, wy: the water's two colours swapped there, if it's
// water that's in sight
function reflectPx(wx, wy, now, inView) {
  const cx = Math.floor(wx / CW), cy = Math.floor(wy / CH);
  if (river.cell(cx, cy) !== "water") return;
  const k = key(cx, cy);
  if (!(seeAll() || lookout || inView.has(k))) return;
  const atlas = sightAtlas(litStep(cx, cy), inView.get(k) ?? -1);
  if (!atlas) return;
  const px = pixelsOf(atlas), t = waterTile(cx, cy, now), i = ((wy - cy * CH) * px.w + t * CW + wx - cx * CW) * 4;
  const pair = tilePair(px, t);
  if (!px.d[i + 3] || pair.length < 2) return;
  ctx.fillStyle = `rgb(${px.d[i]},${px.d[i + 1]},${px.d[i + 2]})` === pair[0] ? pair[1] : pair[0];
  ctx.fillRect(originX + wx * scale, originY + wy * scale, scale, scale);
}
// Whether a reflection's px `far` px below where it's mirrored is thinned out there (see REFLECT)
const thinned = (wx, wy, far, solid) => far >= solid && ((wx + wy) % 2 || (far >= (solid + CH) / 2 && (wx + wy) % 4));
function drawReflections(now, who) {
  const inView = sight(), wobble = calm.matches ? 0 : Math.floor(now / REFLECT.wobbleMs) % 2;
  for (const { tile, pos } of who) {
    const fig = figure(tile), left = Math.round(pos.x * CW), top = Math.round((pos.y + 1) * CH);
    for (let r = 0; r < CH; r++) {
      const wy = top + r, aside = (r + wobble) % 2;
      for (const c of fig[CH - 1 - r]) {
        const wx = left + c + aside;
        if (!thinned(wx, wy, r, REFLECT.solid)) reflectPx(wx, wy, now, inView);
      }
    }
  }
}
// ...and the trees on the bank (the user's, 2026-10-16): the forest's and the big trees' (their
// trunks and canopies), mirrored at the near edge of the water below them as the characters
// are, as far as `treeDeep` cells down the water, solid for `treeSolid` px and thinning out
// after (a tall tree's top never shows: the water ends it first), and wobbling with them. A
// house on a lake's shore (world.js LAKE, `reflects`) shows the same way, but deeper: as far as
// `houseDeep` cells down, solid for `houseSolid` px
let canopyCells = null, canopyKey = "", houseCells = null;   // cell -> a big tree's (or a lake house's) tile there, for the props as they are
function canopyAt(x, y, houses = false) {
  const k = `${props.length},${felled}`;
  if (k !== canopyKey) {
    canopyCells = new Map();
    houseCells = new Map();
    for (const p of props) for (const [cx, cy, t] of p.canopy || p.reflects ? p.cells : []) (p.canopy ? canopyCells : houseCells).set(key(cx, cy), t);
    canopyKey = k;
  }
  return (houses ? houseCells : canopyCells).get(key(x, y));
}
function bankTree(x, y) {
  const big = canopyAt(x, y);
  if (big !== undefined) return big;
  const t = treeAt(x, y), k = key(x, y);
  if (t === null || river.cell(x, y) || regrowing.has(k) || overgrown.has(k) || burnt.has(k)) return null;
  return treeTile(t, hits.get(k) || 0, sooty.has(k));
}
function drawTreeReflections(now) {
  const inView = sight(), wobble = calm.matches ? 0 : Math.floor(now / REFLECT.wobbleMs) % 2, { x0, y0, x1, y1 } = cellsInView();
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      if (river.cell(x, y) !== "water") continue;
      let top = y;
      while (y - top < REFLECT.houseDeep && river.cell(x, top - 1) === "water") top--;
      const d = y - top;
      if (river.cell(x, top - 1) === "water") continue;
      const house = canopyAt(x, top - 1 - d, true);
      if (d >= (house === undefined ? REFLECT.treeDeep : REFLECT.houseDeep)) continue;
      const t = house ?? bankTree(x, top - 1 - d);
      if (t === null || t === undefined) continue;
      const fig = figure(t, true), solid = house === undefined ? REFLECT.treeSolid : REFLECT.houseSolid;
      for (let r = 0; r < CH; r++) {
        const wy = y * CH + r, far = d * CH + r, aside = (r + wobble) % 2;
        for (const c of fig[CH - 1 - r]) {
          const wx = x * CW + c + aside;
          if (!thinned(wx, wy, far, solid)) reflectPx(wx, wy, now, inView);
        }
      }
    }
}

// Forest, ground and props, with the character depth-sorted between the props
function drawOutside(now) {
  drawForest(now);
  const size = CW * scale, rowH = CH * scale;
  view = { x0: Math.floor(-originX / size), y0: Math.floor(-originY / rowH),
    x1: Math.ceil((canvas.width - originX) / size), y1: Math.ceil((canvas.height - originY) / rowH) };
  // (the ground's tiles on screen only: there are thousands, more with every patch explored)
  for (let cy = view.y0 >> 5; cy <= view.y1 >> 5; cy++)
    for (let cx = view.x0 >> 5; cx <= view.x1 >> 5; cx++)
      for (const [x, y, t] of groundChunk(cx, cy)) if (x >= view.x0 && x <= view.x1 && y >= view.y0 && y <= view.y1) drawWorldTile(t, x, y);
  for (const [k, pile] of map.drops) drawWorldTile(icon(pile.at(-1)), ...k.split(",").map(Number));
  for (const k of fallen.keys()) {   // (fallen players' graves, on the ground, see FALLEN)
    const [x, y] = k.split(",").map(Number);
    if (!(x >= view.x0 && x <= view.x1 && y >= view.y0 && y <= view.y1 && fallenAt(x, y))) continue;
    if (relicOn("lost-souls-lantern") && sightLevel(x, y) < 0) drawTile(noteTiles.fallen, x, y, 0, fog[RELIC.seeFog]);   // (see RELIC)
    else drawWorldTile("fallen", x, y);
  }
  // Depth sort by feet: props whose base is lower on screen cover a character, the rest
  // (and ties) are covered by it. Props are pre-sorted, so the characters just slot in.
  behind = [];
  // (`seen`: where one that's in sight is drawn, for the big trees in front of it to be seen through)
  // (`tile`: its sprite, for its reflection, see REFLECT)
  const body = (who, a, draw, tile) => {
    kickDust(now, who, a);
    const pos = visualPos(now, who, a), seen = who === player ? !lookout && pos : skeletonAtlas(who, pos) && pos;
    return { feet: pos.y + 1, draw, seen, mirror: seen && !who.dead && !(who === player && sneakLeft > 0) && { tile, pos } };
  };
  const actors = [
    body(player, anim, () => drawPlayer(now), SCENE.classes[charClass][player.facing]),
    ...foes.filter(s => s.on === map && (!s.dead || now < s.diesAt) && nearView(s.x, s.y))
      .map(s => body(s, s.anim, () => drawSkeleton(now, s), SCENE[s.look ?? s.kind][s.affix][s.facing])),
    ...yigs.filter(w => w.on === map && (!w.dead || now < w.diesAt) && nearView(w.x, w.y)).map(w => body(w, w.anim, () => drawYig(now, w), w.look?.[w.facing] ?? SCENE.yig[w.kind][w.facing])),
    ...jacks.filter(j => j.on === map && nearView(j.x, j.y)).map(j => body(j, j.anim, () => drawJack(now, j), SCENE[j.kind].calm[j.facing])),
    ...priests.map(p => body(p, p.anim, () => drawPriest(now, p), SCENE.priest[p.facing])),
    ...ghostCells.filter(at => !laidToRest.has(`outside ${at[0]},${at[1]}`))
      .map(at => ({ feet: at[1] + 1, draw: () => drawLady(now, at) })),
  ].sort((a, b) => a.feet - b.feet);
  drawTreeReflections(now);
  drawReflections(now, actors.map(a => a.mirror).filter(Boolean));
  drawGlints(now);
  drawBlood(now);
  drawDust(now);
  let i = 0, drawn;
  for (const a of actors) {
    for (; i < props.length && props[i].feet <= a.feet; i++) drawProp(props[i]);
    drawn = a.draw() || drawn;
    if (a.seen) behind.push([Math.round((a.seen.x + 0.5) * CW), Math.round((a.seen.y + 0.5) * CH)]);
  }
  for (; i < props.length; i++) drawProp(props[i]);
  drawBushes(now);
  drawCritters(now, true);
  drawLeaves(now);
  drawGrade();
  const { night = 0, dusk = 0 } = gradeWeights(), warm = Math.min(1, night + WARMTH.dusk * dusk);
  if (warm > 0) drawWarmth(now, visualPos(now), warm * WARMTH.outside);   // (see WARMTH)
  drawCritters(now, false);       // (the fireflies' light over the hour's grade)
  for (const s of foes) if (s.on === map && nearView(s.x, s.y)) drawAlert(now, s);
  drawGlow(now);
  drawFire(now);
  drawSparks(now);
  drawFx(now);
  drawDeaths(now);
  drawPops(now);
  return drawn;
}

// Skulls where things died, over everything, faded by the fog like the world
function drawDeaths(now) {
  for (let i = deaths.length - 1; i >= 0; i--) {
    const d = deaths[i], t = (now - d.t0) / DEATH.ms;
    if (t >= 1) { deaths.splice(i, 1); continue; }
    if (t < 0 || d.on !== map) continue;   // its blow hasn't landed yet, or it's somewhere else
    const atlas = sightAtlas(litStep(d.x, d.y), sightLevel(d.x, d.y));
    if (!atlas) continue;
    const hop = -DEATH.hop * Math.sin(Math.PI * Math.min(1, (now - d.t0) / DEATH.hopMs));
    const bob = BOB[Math.floor(now / BOB_MS) % BOB.length];
    ctx.globalAlpha = t < DEATH.fadeFrom ? 1 : (1 - t) / (1 - DEATH.fadeFrom);
    drawTile(SCENE.death, d.x, d.y - DEATH.rise * (1 - (1 - t) ** 2), hop + bob, atlas);
    ctx.globalAlpha = 1;
  }
}

// Damage floating up from whoever took it and fading, in MEKMODE Text at 6px
// (`popsWhole`, for the classes' panel's skill clips: its pixels a game px each, on the world's own
// grid, so the clip, cut down to a game px a pixel, keeps them whole; at 0.6 of one they come out
// broken, scenes.mjs SKILL_CLIPS)
let popsWhole = false;
function drawPops(now) {
  const f = popsWhole ? scale : Math.max(1, Math.round(0.6 * scale));
  const snap = (v, o) => (popsWhole ? o + Math.round((v - o) / scale) * scale : Math.round(v));
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    if (p.heal) { p.t0 = Math.max(p.t0, nextBlowAt + FIGHT.gapMs); p.heal = false; }   // (see `heal` on pops)
    const t = (now - p.t0) / FIGHT.popMs;
    if (t >= 1) { pops.splice(i, 1); continue; }
    if (t < 0 || p.on !== map) continue;   // not landed yet, or somewhere else
    const w = sansWidth(p.runs) * f;
    const x = originX + (p.x + 0.5) * CW * scale - w / 2;
    const y = originY + (p.y - 0.5 - FIGHT.rise * (1 - (1 - t) ** 2)) * CH * scale;
    ctx.globalAlpha = Math.min(1, 3 * (1 - t));
    drawSans(ctx, p.runs, snap(x, originX), snap(y, originY) + f, f);   // (in MEK Sans, its capitals where the old font's were)
    ctx.globalAlpha = 1;
  }
}

// The room is a single layer: nothing in it is taller than a cell
// The lady (in the house, out by the forest, or in a hidden clearing: see LADY_ODDS and
// GHOST_CHANCE in world.js) fades in and out, never quite
// gone, over `periodMs`
const LADY = { min: 0.35, max: 1, periodMs: 4200 };
function drawLady(now, [x, y]) {
  const wave = 0.5 - 0.5 * Math.cos(2 * Math.PI * now / LADY.periodMs);
  ctx.globalAlpha = LADY.min + (LADY.max - LADY.min) * wave;
  drawWorldTile(SCENE.inside.lady, x, y);
  ctx.globalAlpha = 1;
}
// A floor of the cave: what's on screen of its dirt (past its edges too), walls, stairs and floor,
// faded like everything else where it's in sight, and at MEMORY_STEP, however far off, where it
// isn't but has been (stairs only dimmed, so they're easy to find again)
// A cave's lava (cave-4's, cave.js LAVA) drifts as the river's water does, a px every WATER.ms;
// its crystals (cave-3's, cave.js CRYSTALS) catch the light: each dark one shows light for `ms`
// once every `every` ms, each at its own time (Claude's picks, 2026-10-11)
const SHINE = { every: 4000, ms: 180 };
const hashCell = (x, y) => (Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1)) >>> 0;
// The cave's bare floor (the user's, 2026-10-16): each cell of it that has nothing else on it
// shows a faint dot, so open ground can be told from the dark where nothing's known. The dots
// are tiles of their own, made here and added on the end of the atlas as it loads, so the fog
// dims and dithers them as it does everything else, and a remembered floor keeps them; `looks`
// are where each one's px go (in the cell, x then y), picked for each cell by its hash, so they
// don't line up into a grid. `ink` is a muted green-grey, at `alpha` (the user's, 2026-10-16).
const FLOOR_DOT = { ink: [0x32, 0x3c, 0x39], alpha: 1,
  looks: [[[2, 5]], [[5, 3]], [[3, 8]], [[6, 7]], [[1, 2]], [[4, 10]], [[2, 4], [6, 9]], [[5, 6]]] };
let floorDot0 = -1;                // (the first of them in the atlas, once it's made)
function withFloorDots(img) {
  const c = document.createElement("canvas"), n = FLOOR_DOT.looks.length;
  [c.width, c.height] = [img.width + n * CW, img.height];
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  floorDot0 = img.width / CW;
  g.fillStyle = `rgba(${FLOOR_DOT.ink.join(",")}, ${FLOOR_DOT.alpha})`;
  FLOOR_DOT.looks.forEach((pxs, i) => {
    for (const [x, y] of pxs) g.fillRect((floorDot0 + i) * CW + x, y, 1, 1);
  });
  return c;
}
// A note pinned to a wall and a carving cut into one (see NOTES), drawn over the wall's own tile,
// each an 8x12 cell by row: the note ("notes", 723:75114) 5x7 px of paper, "p", with its lines,
// "l"; the carving ("carving", 722:74908) a 6x6 cross, "c", on whatever cave wall it's cut into
const NOTE_LOOKS = {
  // ...a nemesis's red dot, over its head as the character's arrow is (see NEMESIS)
  nemesis: ["", "", "", "", "", "", "", "...RR", "..RRRR", "..RRRR", "...RR"],
  // ...the relics' icons (items.js RELICS; the user's, "relic" 821:81898, 2026-10-21): white, "k", on gold, "t"
  "echo-stone": ["ttkkkktt", "tkttttkt", "tttkkttt", "tkttttkt", "kttkkttk", "ktkkkktk", "ktkkkktk", "kttkkttk", "tkttttkt", "tttkkttt", "tkttttkt", "ttkkkktt"],
  "bone-flute": ["tttttttt", "ttkttttt", "tkkttttt", "ttkttttt", "tttktttt", "tttktttt", "ttttkttt", "ttttkttt", "tttttktt", "tttttkkt", "tttttktt", "tttttttt"],
  "moon-dial": ["tttttttt", "tttttttt", "ttkkkktt", "tkktttkt", "kktttttt", "kktttttt", "kktttttt", "kktttttt", "tkktttkt", "ttkkkktt", "tttttttt", "tttttttt"],
  "hungry-blade": ["tttttttt", "tktttttt", "tkkttttt", "tkkktttt", "ttkktttt", "ttkkkttt", "tttkkttt", "tttkkkkt", "ttttkktt", "tttkktkt", "ttttttkt", "tttttttt"],
  "lost-souls-lantern": ["tttttttt", "tttkkttt", "ttkttktt", "ttkttktt", "tttkkttt", "ttkkkktt", "ttkttktt", "tkttttkt", "tkttktkt", "tktkttkt", "tkkkkkkt", "tttttttt"],
  aegis: ["tttttttt", "kttttttk", "tkkttkkt", "tktkktkt", "kkttttkk", "tkttttkt", "tkttttkt", "ktkttktk", "ttkttktt", "tttkkttt", "tttttttt", "tttttttt"],
  hermes: ["tttttttt", "tttttttt", "tkkttttt", "ttkkkttt", "tttkkttt", "tttkkttt", "tttkkttt", "tttkkktt", "tttkkkkt", "tttttttt", "tttttttt", "tttttttt"],
  fang: ["tttttttt", "tttttttt", "tttttttt", "ttkkkktt", "ttkkkttt", "ttkkkttt", "tttkkttt", "tttkkttt", "ttttkttt", "tttttktt", "tttttttt", "tttttttt"],
  mistral: ["tttttttt", "tttttttt", "tkkttkkt", "kttkkttk", "ktkttktk", "tktkktkt", "tktkktkt", "ktkttktk", "kttkkttk", "tkkttkkt", "tttttttt", "tttttttt"],
  thorn: ["tttttttt", "tttkkttt", "tkkkkttt", "tttkkkkt", "tttkkttt", "tkkkkttt", "tttkkkkt", "tttkkttt", "tkkkkttt", "tttkkkkt", "tttkkttt", "tttttttt"],
  // ...a fallen player's grave's red cross (see FALLEN): the graves' cross (97), in red1, "r", with no ground of its own
  fallen: ["", "", "...rr", "...rr", "...rr", "rrr..rrr", "rrr..rrr", "...rr", "...rr", "...rr", "...rr", "...rr"],
  note: ["", "", "..ppppp", "..plllp", "..ppppp", "..plllp", "..ppppp", "..ppllp", "..ppppp"],
  carving: ["", "", "", ".c....c", "..c..c", "...cc", "...cc", "..c..c", ".c....c"],
  // ...and a battlefield's broken blades stuck in the ground (the cave's rack, 758:75214, in pale
  // grey, "g", on dark1, "d"), its own tile, which world.js lays as "rack" (see REMNANTS)
  rack: ["dddddddd", "dgddddgd", "gggdddgg", "dgddgdgd", "dgdggdgd", ...Array(7).fill("dgddgdgd")],
  // ...and its skulls and crossbones lying about, walked over (798:21618): facing left or right, in
  // grey, "s", or a darker, "m", on whatever ground's under them; world.js lays them (see REMNANTS)
  "bones-l": ["", "..sssss", ".s.s.ss", ".s.s.ss", ".ssssss", ".s.s.s", "", ".ss..ss", "...ss", ".ss..ss"],
  "bones-r": ["", ".sssss", ".ss.s.s", ".ss.s.s", ".ssssss", "..s.s.s", "", ".ss..ss", "...ss", ".ss..ss"],
  "bones-l-dark": ["", "..mmmmm", ".m.m.mm", ".m.m.mm", ".mmmmmm", ".m.m.m", "", ".mm..mm", "...mm", ".mm..mm"],
  "bones-r-dark": ["", ".mmmmm", ".mm.m.m", ".mm.m.m", ".mmmmmm", "..m.m.m", "", ".mm..mm", "...mm", ".mm..mm"],
  // ...and the fuzhu's keepsake's icon, a White Tuft ("type=trinket", 755:75214: "w" on a trinket's dark, "t")
  tuft: ["tttttttt", "tttttttt", "tttttttt", "tttwwttt", "ttwttwtt", "twttttwt", "twttttwt", "ttwttwtt", "tttwwttt", "tttwwttt", "tttttttt", "tttttttt"],
  // ...and a lumberjack's Locket (466:50704: "p" on brown, "o")
  locket: ["oooooooo", "oooooooo", "oooppooo", "oopoopoo", "opoppopo", "opoppopo", "opoppopo", "opoppopo", "oopoopoo", "oooppooo", "oooooooo", "oooooooo"],
};
const NOTE_INK = { R: "#e43b44", b: "#5b6ee1", B: "#cbdbfc", k: "#ffffff", e: "#6abe30", r: "#ac3232", o: "#8f563b", p: "#eec39a", l: "#d9a066", c: "#ffd23f", g: "#9badb7", d: "#071324", t: "#323c39", w: "#d77bba", s: "#595652", m: "#4c4147" };
// ...and the relics' icons, each 1-bit whatever its letters: its ground ("t") the arrow's gold, the rest pure white (the user's, 2026-10-19)
const RELIC_INK = { bg: "#c18b1c", fg: "#ffffff" };   // (bg: amber gold, as in Figma's "relic", 2026-10-21)
// ...and wherever a relic's icon is shown in a box (the bag, a find's card, a pile), it shines, so
// it's seen to be something special: its white glows, softly pulsing (`glow` px of the box's own
// a ui px, over `pulseMs`), and a band of light (`band` px wide, `ink`) sweeps across the box
// every `every` ms, taking `sweep` ms; no sweep, and a steady glow, with reduced motion (Claude's numbers)
const RELIC_SHINE = { glow: 0.7, glowInk: "rgba(255, 255, 255, 0.8)", pulseMs: 1600, every: 2600, sweep: 650, band: 2, ink: "rgba(255, 244, 214, 0.55)" };
const relicGlow = {};              // relic -> its icon's white alone, on nothing, for the glow
function relicShine(id, x, y, w, h) {
  if (!relicGlow[id]) return;
  const now = performance.now(), u = w / CW, still = calm.matches;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.shadowColor = RELIC_SHINE.glowInk;
  ctx.shadowBlur = RELIC_SHINE.glow * u * (still ? 1 : 0.7 + 0.3 * Math.sin(now / RELIC_SHINE.pulseMs * 2 * Math.PI));
  ctx.drawImage(relicGlow[id], x, y, w, h);
  ctx.shadowBlur = 0;
  const t = (now % RELIC_SHINE.every) / RELIC_SHINE.sweep;
  if (!still && t < 1) {
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const bx = x + Math.round(t * (w + h) / u) * u, bw = RELIC_SHINE.band * u;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = RELIC_SHINE.ink;
    ctx.beginPath(); ctx.moveTo(bx, y); ctx.lineTo(bx + bw, y); ctx.lineTo(bx + bw - h, y + h); ctx.lineTo(bx - h, y + h); ctx.fill();
  }
  ctx.restore();
}
const noteTiles = {};              // look -> its tile in the atlas, once it's made
function withNoteTiles(img) {
  const c = document.createElement("canvas"), looks = Object.entries(NOTE_LOOKS);
  [c.width, c.height] = [img.width + looks.length * CW, img.height];
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  looks.forEach(([look, rows], i) => {
    noteTiles[look] = img.width / CW + i;
    const relic = ITEMS[look]?.relic;   // (a relic's icon is 1-bit: white on gold, see RELIC_INK)
    const glow = relic && (relicGlow[look] = document.createElement("canvas"));
    if (glow) [glow.width, glow.height] = [CW, CH];
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (glow && ch !== "t" && NOTE_INK[ch]) { const gg = glow.getContext("2d"); gg.fillStyle = RELIC_INK.fg; gg.fillRect(x, y, 1, 1); }
    }));
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (!NOTE_INK[ch]) return;
      g.fillStyle = relic ? RELIC_INK[ch === "t" ? "bg" : "fg"] : NOTE_INK[ch];
      g.fillRect(noteTiles[look] * CW + x, y, 1, 1);
    }));
  });
  return c;
}
const floorDotAt = (x, y) => floorDot0 + (hashCell(x, y) >>> 7) % FLOOR_DOT.looks.length;
function drawCave(now) {
  const { cave, remembered: known } = map, size = CW * scale, rowH = CH * scale;
  const flow = cave.flow, drift = flow && flow.drift[Math.floor(now / WATER.ms) % flow.drift.length];
  const glint = (x, y) => (now + (hashCell(x, y) % SHINE.every)) % SHINE.every < SHINE.ms;
  const shaken = Math.floor((now - shake.t0) / CHOP.shakeMs);   // frames into a hit's shake (see DIG)
  const x0 = Math.floor(-originX / size), x1 = Math.ceil((canvas.width - originX) / size);
  const y0 = Math.floor(-originY / rowH), y1 = Math.ceil((canvas.height - originY) / rowH);
  const inView = sight();          // (once, not for every cell: see sightLevel())
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const k = key(x, y), whole = cave.tile(x, y), hit = map.dug.get(k);
      let t = hit ? SCENE.underground.dug[SCENE.underground.walls.indexOf(whole)]?.[workStage(hit, DIG.stages) - 1] ?? whole : whole;   // (never a crack without its dirt)
      if (t < 0 && floorDot0 >= 0 && cave.isFloor(x, y)) t = floorDotAt(x, y);
      if (t < 0) continue;
      if (flow && t === flow.lava) t = drift;
      else if (cave.shine.has(t) && glint(x, y)) t = cave.shine.get(t);
      const ox = k === shake.k && shaken < CHOP.shake.length ? CHOP.shake[shaken] : 0;
      if (seeAll() || inView.has(k)) drawWorldTile(t, x, y, ox, inView.get(k) ?? -1);
      else if (known.has(k)) drawTile(t, x, y, 0, fog[map.doors.has(k) ? 1 : Math.min(MEMORY_STEP, fog.length - 1)]);
    }
}
// ...and whatever lives in it (a shed's slime, the cave's monsters and miners) with the character, the lower one in front
function drawInside(now) {
  const { room } = map;
  if (map.cave) drawCave(now);
  else for (const [x, y, t] of room.cells) drawWorldTile(t, x, y);
  if (map.note && noteTiles.note !== undefined) drawWorldTile(map.note.carved ? noteTiles.carving : noteTiles.note, ...map.note.at);
  for (const [k, pile] of map.drops) drawWorldTile(icon(pile.at(-1)), ...k.split(",").map(Number));
  for (const at of ghostsHere()) drawLady(now, at);
  const here = foes.filter(s => s.on === map && (!s.dead || now < s.diesAt));
  kickDust(now, player, anim);
  for (const s of [...here, ...yigs.filter(w => w.on === map), ...jacks.filter(j => j.on === map)]) kickDust(now, s, s.anim);
  drawBlood(now);
  drawDust(now);
  let drawn;
  for (const a of [{ feet: visualPos(now).y, draw: () => drawPlayer(now) },
    ...here.map(s => ({ feet: visualPos(now, s, s.anim).y, draw: () => drawSkeleton(now, s) })),
    ...yigs.filter(w => w.on === map && (!w.dead || now < w.diesAt))
      .map(w => ({ feet: visualPos(now, w, w.anim).y, draw: () => drawYig(now, w) })),
    ...jacks.filter(j => j.on === map).map(j => ({ feet: visualPos(now, j, j.anim).y, draw: () => drawJack(now, j) })),
    ...(map.smith ? [{ feet: map.smith.y, draw: () => drawSmith(map.smith) }] : [])]
    .sort((a, b) => a.feet - b.feet)) drawn = a.draw() || drawn;
  for (const s of here) drawAlert(now, s);
  if (map.cave) {                  // (the cave's air, see MOTES)
    const pos = visualPos(now);
    drawWarmth(now, pos);
    drawMotes(now, pos);
  }
  drawGlow(now);
  drawFire(now);
  drawSparks(now);
  drawFx(now);
  drawDeaths(now);
  drawPops(now);
  return drawn;
}

function drawHudTile(t, c, r) {
  ctx.drawImage(tiles, t * CW, 0, CW, CH,
    hudX + c * CW * hudScale, hudY + r * CH * hudScale, CW * hudScale, CH * hudScale);
}

// The HUD ("ui", 537:70369, 2026-10-12) sits on dark1 at 85% all over, the world showing faintly
// through where tools/ui.png leaves it see-through
const HUD_BACK = "rgba(7, 19, 36, 0.85)";
// Behind any panel that's open (not the replay's, the world being what's watched there): dark2
// at 45% over the whole screen, the world, HUD, log and chat (the user's, 2026-10-13)
const SCRIM = "rgba(34, 32, 52, 0.45)";
function drawHud() {
  const H = HUD_V13, I = H.ink, u = hudScale, X = v => hudX + Math.round(v * u), Y = v => hudY + Math.round(v * u);
  const k = Math.max(1, Math.round(u * 8 / SANS.h)), big = Math.max(k, Math.round(u * 12 / SANS.h));   // (MEK Sans at the mock's 8 and 12 px)
  const text = (runs, x, y, f = k, font) => drawSans(ctx, runs, x, y, f, font);
  const tw = (runs, f = k, font) => sansWidth(runs, font) * f;
  const tile = (t, x, y, alpha = 1) => { ctx.globalAlpha = alpha; ctx.drawImage(tiles, t * CW, 0, CW, CH, x, y, CW * u, CH * u); ctx.globalAlpha = 1; };
  const box = (x, y, w, h, line = I.box, fill = I.bg) => {   // (dark1 at 90% in a 1 px line, its corners left out)
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(X(x + 1), Y(y + 1), (w - 2) * u, (h - 2) * u); }
    ctx.fillStyle = line;
    ctx.fillRect(X(x + 1), Y(y), (w - 2) * u, u); ctx.fillRect(X(x + 1), Y(y + h - 1), (w - 2) * u, u);
    ctx.fillRect(X(x), Y(y + 1), u, (h - 2) * u); ctx.fillRect(X(x + w - 1), Y(y + 1), u, (h - 2) * u);
  };
  // (a number's size: its 12 px, or as much smaller as keeps it within `room` px)
  const fit = (runs, room) => { let f = big; while (f > 1 && tw(runs, f) - f > room * u) f--; return f; };   // (less the gap after its last letter)
  const [bw, bh] = H.box, inX = (x, w) => X(x) + Math.round((w * u - CW * u) / 2), inY = (y, h) => Y(y) + Math.round((h * u - CH * u) / 2);
  // the shortcut keys, their numbers under them (lit while what's on one can be used)
  for (let i = 0; i < SLOTS; i++) {
    const x = hudSlotX(i), id = shortcuts[i], ix = inX(x, bw), iy = inY(0, bh);
    box(x, 0, bw, bh);
    const lit = !!id && !cooling.has(id), num = [[String(i + 1), lit ? I.lit : I.dim]];
    text(num, X(x) + Math.round((bw * u - tw(num)) / 2), Y(H.numY));
    if (!id) { drawHatch(ix, iy, u); continue; }
    if (ITEMS[id]) {               // a potion, with how many are carried in its corner
      tile(icon(id), ix, iy);
      const n = [[String(carried(id)), SHORTCUT.count.ink]], nw = tw(n), pad = Math.round(SHORTCUT.count.pad * u);
      const nx = X(x + bw - 1) - nw - pad, ny = Y(bh - 1) - SANS.cap * k - pad;
      ctx.fillStyle = SHORTCUT.bg; ctx.fillRect(nx - pad, ny - pad, nw + 2 * pad, SANS.cap * k + 2 * pad);
      text(n, nx, ny);
      continue;
    }
    if (!cooling.has(id)) { tile(icon(id), ix, iy); continue; }
    tile(icon(id), ix, iy, SHORTCUT.coolDim);   // (cooling down: dim, with the turns it has left over it)
    const left = [[String(cooling.get(id)), SHORTCUT.ink]];
    text(left, X(x) + Math.round((bw * u - tw(left)) / 2), Y(0) + Math.round((bh * u - SANS.cap * k) / 2));
  }
  drawHudBag();
  // the tools carried and the buffs, above its right end
  hudRow().forEach(({ t, x, alpha, left, ink }) => {
    ctx.fillStyle = SHORTCUT.bg; ctx.fillRect(X(x), Y(-H.rowUp), CW * u, CH * u);
    tile(t, X(x), Y(-H.rowUp), alpha);
    if (left !== undefined) { const n = [[String(left), ink]]; text(n, X(x) + Math.round((CW * u - tw(n)) / 2), Y(-H.rowUp) + Math.round((CH * u - SANS.cap * k) / 2)); }
  });
  // hp: the heart, its segments (each a fifth: full red, part-full red checks, empty blue1 checks) and the number
  const tier = hpTier(), hpNow = Math.min(Math.max(Math.round(stats.hp), 0), maxHp());
  box(0, H.barY, H.hpW, H.barH);
  tile(HUD.statIcons.hp, X(3), Y(H.barY + 3));
  const share = hpNow / maxHp() * H.segs;
  for (let i = 0; i < H.segs; i++) {
    const sx = X(H.segX + i * (H.segW + H.segGap)), sy = Y(H.barY + 3), sw = H.segW * u, sh = CH * u, fill = Math.min(1, Math.max(0, share - i));
    if (fill >= 1) { ctx.fillStyle = I.seg; ctx.fillRect(sx, sy, sw, sh); continue; }
    ctx.fillStyle = fill > 0 ? I.seg : I.segEmpty;   // (checks, a px each)
    for (let py = 0; py < CH; py++) for (let px = 0; px < H.segW; px++) if ((px + py) % 2 === 0) ctx.fillRect(sx + px * u, sy + py * u, u, u);
  }
  // (in the middle of the room between the segments and the box's right line)
  const segEnd = H.segX + H.segs * (H.segW + H.segGap) - H.segGap, room = H.hpW - 1 - segEnd;
  const hp = [[String(hpNow), "#" + tier.ink]], hpF = fit(hp, room - 2), hpW = tw(hp, hpF) - hpF;
  text(hp, X(segEnd) + Math.round((room * u - hpW) / 2), Y(H.barY) + Math.round((H.barH * u - SANS.cap * hpF) / 2), hpF);
  heartbeat(dead ? "still" : tier.heartbeat ?? null);
  chant(!!map.church && !dead);
  night(daylight() < DAY.light / 2);   // (the forest's night sounds, from halfway through dusk to halfway through dawn)
  surroundings(around());
  // the stats, a box each, overlapping a px
  H.order.forEach((name, i) => {
    const x = H.hpW - 1 + i * (H.statW - 1), v = [[String(Math.min(Math.max(stat(name), 0), 99)), I.lit]];
    box(x, H.barY, H.statW, H.barH);
    tile(HUD.statIcons[name], X(x + 3), Y(H.barY + 3));
    const f = fit(v, H.statW - H.valueX - 1), mid = X(x + (H.valueX + H.statW - 1) / 2);   // (in the middle of what's right of the icon)
    text(v, mid - Math.round(tw(v, f) / 2), Y(H.barY) + Math.round((H.barH * u - SANS.cap * f) / 2), f);
  });
  // the exp bar: a 1 px line, filled darker to lighter as it goes, in a blue1 box (see-through inside)
  box(0, H.expY, HUD_W, H.expH, I.box, null);
  const full = progress.level >= LEVEL.max ? HUD_W - 4 : Math.floor((HUD_W - 4) * progress.exp / toNext());
  [0.59, 0.87, 0.98, 1].forEach((end, i, ends) => {   // (the mock's bands: 54, 26, 10 and 2 of its 92)
    const from = Math.round(full * (i ? ends[i - 1] : 0)), to = i === ends.length - 1 ? full : Math.round(full * end);
    ctx.fillStyle = I.exp[i];
    if (to > from) ctx.fillRect(X(2 + from), Y(H.expY + 2), (to - from) * u, u);
  });
  // the level, where the character is, and the day (or night), in Dosage (the user's, 2026-10-27)
  const sy = Y(H.statusY), lv = tr("Lv. <lit>{n}</>", { lit: I.lit, n: progress.level }, I.dim);
  const day = tr(isNight() ? "night <lit>{n}/{of}</>" : "day <lit>{n}/{of}</>", { lit: I.lit, n: dayNumber(), of: DAY.days }, I.dim), at = [[placeName(), I.lit]];
  text(lv, X(0), sy, k, DOSAGE);
  text(at, X(HUD_W / 2) - Math.round(tw(at, k, DOSAGE) / 2), sy, k, DOSAGE);
  text(day, X(HUD_W) - tw(day, k, DOSAGE), sy, k, DOSAGE);
}
// Where the character is, for the HUD: the forest's name, the cave's floor, or the room (translated)
const FOREST_NAMES = [english("Green Wood"), english("Red Woods"), english("Dark Wood"), english("Thorned Wood")];
function placeName() {
  if (map === MAPS.outside) return tl(FOREST_NAMES[world.biomeAt(player.x, player.y)] ?? FOREST_NAMES[0]);
  if (map.cave) return tl("Cave, floor {n}", { n: map.id.split(" ").at(-1) });
  return map.church ? tl("Church") : tl("Indoors");
}
// The HUD's px at which shortcut key i's box starts (see HUD_V13)
const hudSlotX = i => i * HUD_V13.pitch + (i >= SLOTS / 2 ? HUD_V13.split : 0);
// The row above the HUD's right end: the tools carried (rightmost), then the buffs and debuffs
// leftwards (see effects()), each { t (its tile), x (HUD px), alpha, left, ink, does / effect }
function hudRow() {
  const H = HUD_V13, out = [];
  let x = HUD_W - CW;
  for (const does of ["fells", "digs"]) if (tools[does]) { out.push({ t: icon(tools[does]), x, does }); x -= CW + H.iconGap; }
  effects().slice(0, 8).forEach((e, i) => {
    out.push(e.forGood ? { t: e.pact ? shrineIcon(e.pact) : SCENE.grace, x, effect: i }
      : { t: statIcon(e.stat), x, alpha: SHORTCUT.coolDim, left: e.left, ink: e.n < 0 ? INK.down : SHORTCUT.ink, effect: i });
    x -= CW + H.iconGap;
  });
  return out;
}
// The buffs and debuffs on the character (HUD "buff-or-debuff", 272:62431, the column beside
// the bag first, then leftwards), a slot each: every
// stat a spell's boost changes (see boostsOf()), and what a Regeneration has still to give back,
// in the order they were cast. Each shows its stat's icon, dimmed like a shortcut cooling down,
// with the turns it has left over it (in red for a debuff); its tooltip says what it is.
// (a Barrier's slot, the hp icon, says how much it can still soak up). Grace (see GRACE), for
// good, comes first, in its own icon, lit and with no turns over it.
function effects() {
  return [...(graced ? [{ name: english("Grace"), stat: "hp", n: GRACE.regen[0], every: GRACE.regen[1], forGood: true }] : []),
    ...pactsTaken.map(kind => ({ name: SHRINE.pacts[kind].pact, pact: kind, forGood: true })),   // (see SHRINE)
    ...boosts.flatMap(b => Object.entries(b.stats).map(([stat, n]) => ({ name: b.name, stat, n, left: b.left }))),
    ...regens.map(r => ({ name: r.name, stat: "hp", n: r.shares.reduce((a, b) => a + b, 0), left: r.shares.length })),
    ...(shield ? [{ name: shield.name, stat: "hp", n: shield.left, left: shield.turns, soaks: true }] : [])];
}
// (a stat's short name, as panels show it, translated where it's shown)
const STAT_SHORT = { hp: english("HP"), atk: english("ATK"), def: english("DEF"), mag: english("MAG"), spd: english("SPD") };
const STAT_WORDS = { hp: english("hp"), atk: english("attack"), def: english("defence"), mag: english("magic"), spd: english("speed"), reduce: english("% damage reduction") };
// What the tooltip that's up says and where (the column it's centred on and the HUD row it's
// over), or null if there's nothing to say
function tooltipText() {
  const at = hudRow().find(r => tooltip.does ? r.does === tooltip.does : r.effect === tooltip.effect);
  if (!at) return null;
  const c = at.x + CW / 2, top = -HUD_V13.rowUp;   // (centred on its slot, over the row)
  if (tooltip.does) return { runs: [[tl(TOOLTIP.text[tooltip.does]), TOOLTIP.ink]], c, top };
  const e = effects()[tooltip.effect];
  if (!e) return null;
  const name = nameOf(e.name), T = TOOLTIP.ink;
  if (e.pact) return { runs: tr("{name}: {gift}, {cost}", { name, gift: [tl(SHRINE.pacts[e.pact].tip[0]), INK.up], cost: [tl(SHRINE.pacts[e.pact].tip[1]), INK.down] }, T), c, top };
  if (e.forGood) return { runs: tr("{name}: {gain} every {every} turns, for good", { name, gain: [tl("+{n} {stat}", { n: e.n, stat: tl(STAT_WORDS[e.stat]) }), INK.up], every: e.every }, T), c, top };
  const change = e.soaks ? [tl("absorbs {n} damage", { n: e.n }), INK.up]
    : [e.stat === "reduce" ? tl(e.n < 0 ? "{n}{stat}" : "+{n}{stat}", { n: e.n, stat: tl(STAT_WORDS.reduce) }) : tl(e.n < 0 ? "{n} {stat}" : "+{n} {stat}", { n: e.n, stat: tl(STAT_WORDS[e.stat]) }), e.n < 0 ? INK.down : INK.up];
  return { runs: tr("{name}: {change}, {left} {left|one:turn|other:turns} left", { name, change, left: e.left }, T), c, top };
}
// The tooltip over a tool's or a buff's slot, if one's up (see TOOLTIP)
function drawTooltip(now) {
  if (!tooltip || dead || now >= tooltip.until) return;
  const said = tooltipText();
  if (!said) return;
  // (in MEK Sans at the HUD's 8 px, on dark1 framed blue1 with its corners chipped, as the HUD's
  // boxes are: option A of the ones shown the user, 2026-10-25)
  const T = TOOLTIP, u = hudScale, k = Math.max(1, Math.round(u * 8 / SANS.h)), { runs, c, top } = said;
  const pad = Math.round(T.pad * u);
  const w = sansWidth(runs) * k + 2 * pad, h = SANS.cap * k + 2 * pad;
  const x = Math.round(Math.min(Math.max(hudX + c * u - w / 2, 0), canvas.width - w));
  const y = Math.round(hudY + top * u - Math.round(T.gap * u) - h);
  ctx.fillStyle = SHEET.ink.bg;
  ctx.fillRect(x, y, w, h);
  sheetFrame(x, y, w, h, SHEET.ink.line, u, true);
  drawSans(ctx, runs, x + pad, y + pad, k);
}
// The tool's slot on the HUD at a canvas point ("fells" or "digs"), if there's a tool in it
function hudToolAt(x, y) {
  return hudRow().find(r => r.does && hudRowHit(r, x, y))?.does;
}
// Whether a canvas point is on slot r of the row above the HUD (see hudRow())
const hudRowHit = (r, x, y) => x >= hudX + r.x * hudScale && x < hudX + (r.x + CW) * hudScale &&
  y >= hudY - HUD_V13.rowUp * hudScale && y < hudY + (CH - HUD_V13.rowUp) * hudScale;


// The journey's score so far (see journeyScore()) in the HUD's digits ("score", 310:62105):
// `digits` of them at least, in `ink`, its leading zeros dim like hp's, at the HUD's scale: at
// the bottom right, its bottom level with the HUD's and as far in from the right edge as the log
// is from the left; or, held upright or wherever it won't fit beside the HUD, at the top right,
// that far under the website's header. It fades out as the website comes up, as the log's own
// lines do.
// (as the v0.13 sheet has it, "score" 833:83768: on dark1 at 90%, `pad` px round, 4 digits at least
// in the 12 px MEK Sans, the leading zeros blue1, the rest bw4, then a blue star, `gap` px on)
const SCORE_HUD = { digits: 4, ink: "#9badb7", dim: "#253a56", star: "#5b6ee1", pad: 2, gap: 2, bg: "rgba(7, 19, 36, 0.9)",
  // (its star, 7 by 7, a row of [x, width] runs each)
  shape: [[[3, 1]], [[3, 1]], [[0, 7]], [[1, 5]], [[2, 3]], [[1, 2], [4, 2]], [[0, 1], [6, 1]]] };
function drawScore() {
  const S = SCORE_HUD, u = hudScale, inset = LOG.left * u, k = Math.max(1, Math.round(u * 8 / SANS.h)), big = Math.max(k, Math.round(u * 12 / SANS.h));
  const text = String(journeyScore().score).padStart(S.digits, "0"), lead = text.length - String(+text).length;
  const runs = [[text.slice(0, lead), S.dim], [text.slice(lead), S.ink]], tw = sansWidth(runs) * big, th = SANS.cap * big, star = 7 * k;
  const w = tw + (S.gap + 2 * S.pad) * u + star, h = Math.max(th, star) + 2 * S.pad * u;
  const beside = canvas.width > canvas.height && hudX + HUD_W * u + LOG.gap * u + w + inset <= canvas.width;
  const x = canvas.width - inset - w, y = beside ? hudY + HUD_H * u - h : headerPx() + inset;
  if (webK >= 1) return;   // (only in the game)
  ctx.globalAlpha = webFade();
  ctx.fillStyle = S.bg;
  ctx.fillRect(x, y, w, h);
  drawSans(ctx, runs, x + S.pad * u, y + Math.round((h - th) / 2), big);
  ctx.fillStyle = S.star;
  const sx = x + S.pad * u + tw + S.gap * u, sy = y + Math.round((h - star) / 2);
  S.shape.forEach((row, r) => row.forEach(([cx, n]) => ctx.fillRect(sx + cx * k, sy + r * k, n * k, k)));
  ctx.globalAlpha = 1;
}

// Game log and chat ("game-chat", 439:75848): what just happened, a line or two each, and what's
// been said, in the HUD's px, each wrapped in the small (5px) text. The game's own (`log`) and
// the chat's (`chats`) show together in the order they came, but either can be hidden: "Log" and
// "Players" under them (the v0.13 "chat-box", 832:83745, in MEK Sans, on dark1 at 90% with a blue1 line over them), lit (bw5 closed, green4 open) while that kind shows, bw1 (red open) while
// it doesn't; pressing either, or "?", while typing leaves the line being typed open.
// Closed, it's the last `entries` lines, the newest of the game's own in blue4 with its numbers
// and names picked out, the ones before it in blue1; a chat line is ">" in blue4, the name in
// bw5 and what's said in bw6 (an announcement all in yellow). Open (L, or a click or tap on it),
// it's `history` lines over a dark1 backdrop, the game's older ones in blue3 (on a phone their
// ">" in blue2) so they can be read, with "?" (what it is, see LOG_HELP) and "X" (closes it, as
// L and Esc do) over them. Either way the wheel, or a drag, over it scrolls back through the rest
// (open, a thin bar at its right says where it's at). "[Enter] Chat" at the bottom right opens a
// line to type into (`chatMax` characters) under the rest, which opens it too: Enter says it, Esc
// drops it. None of the chat's lines older than `chatKeepMs` (a day) show.
// Beside the HUD (`left` px in from the left edge, its bottom level with the HUD's, `w` px wide
// or wider as the screen allows, see logWidth()) it's boxed: a 1px dark2 border, `pad` px in. On
// a phone, where there's no room beside it, it's right above the HUD, `gap` px up and as wide as
// it, unboxed, its buttons `pad` px in from either side. With the website up (setActive()) it
// fades out in `webMs` (and back in after), chat and all.
// The same thing twice in a row counts up ("(x2)") instead of taking another entry.
// Something said for later (a blow, which lands a moment after it's swung) shows once it happens.
const LOG = {
  entries: 3, history: 11, kept: 200, chatKeepMs: 24 * 60 * 60 * 1000, w: 130, grow: 162 / 130, left: 12, gap: 4, pad: 4, border: 1,
  buttonsGap: 4, toggleGap: 8, headerGap: 6, fontPx: 0.5, desk: { cssPx: 2, entries: 4 }, helpPx: 0.6, chatMax: 120,
  webMs: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 400,
  newest: "#5b6ee1", older: "#253a56", olderOpen: "#306082", markPhone: "#3f3f74", button: "#847e87", lit: "#cbdbfc",
  on: "#5b6ee1", onOpen: "#37946e", off: "#253a56", offOpen: "#d95763", help: "#8f563b", line: "#253a56", key: "#d9a066", bracket: "#306082", label: "#9badb7",
  backdrop: "rgba(7, 19, 36, 0.85)", you: "#eec39a", typed: "#cbdbfc",
};
// On a desktop (no touch screen, not a phone's size) its words are bigger, each font px `desk.cssPx`
// of the screen's (2x, as the rest of the UI: the user's, 2026-10-19), and `desk.entries` show
// closed; a phone's and a tablet's as they were, `fontPx` of the HUD's px, `entries` closed
const onDesk = () => !touchScreen.matches && !phone;
const logFont = () => Math.max(1, Math.round(hudScale * 8 / SANS.h));   // (MEK Sans at the chat-box's 8 px, as the HUD's)
const logEntries = () => (onDesk() ? LOG.desk.entries : LOG.entries);
const LOG_HELP = [
  "-the chat is scrollable when expanded or collapsed.",
  "-when expanded, the log and chat toggle is used to hide or view the log on that category.",
];
const log = [];                    // { runs: [[text, colour for picking out, if any]], t, n }, oldest first
let lineSeq = 0;                   // (each line's `seq`: of two said at the same moment, the log's and the chat's, the first said shows first)
// How wide it is beside the HUD, in the HUD's px: as much of the room left of the HUD as there
// is, from `w` up to `grow` times that; 0 where there's not even `w` (it goes over the HUD then)
function logWidth() {
  const room = Math.floor(hudX / hudScale) - LOG.left - LOG.gap;
  return room < LOG.w ? 0 : Math.min(room, Math.round(LOG.w * LOG.grow));
}
const chats = [];                  // the same, for the chat, each with `at`, when it was said (Date.now())
let logOpen = false;               // it's open
let logHelp = false;               // its "?" is showing
const logShows = { log: true, chat: true };   // which kinds of line show
let chat = null;                   // { text } while typing
let logButtons = {};               // screen rects of "Log", "Chat", "[Enter]Chat", "?" and "X"
let logScroll = 0, logLines = 0;   // lines scrolled back from the newest, and how many there were
let logBox = null, logDrag = null; // its screen rect; { id, y, scroll, moved } while a finger or the mouse drags it
const scrollLog = lines => { logScroll = Math.max(0, logScroll + lines); };   // (drawLog() keeps it in range)
const toggleLog = () => { logOpen = !logOpen; logScroll = 0; logHelp = false; };
let webK = 0, webLast = 0;         // how far it's gone over to the website's way (0 to 1), and when that was
const webFade = () => 1 - webK * webK * (3 - 2 * webK);   // what's only in the game fades out as it goes
function say(runs, t = clock(), story = false) {
  // (a line that's one piece is translated here, see lang.js; one in parts, by tr() where it's made)
  if (typeof runs === "string") runs = [[tl(runs)]];
  else if (runs.length === 1) runs = [[tl(runs[0][0]), ...runs[0].slice(1)]];
  const text = runs.map(([s]) => s).join(""), last = log.at(-1);
  if (last && last.runs.map(([s]) => s).join("") === text) { last.n++; last.t = t; return; }
  let i = log.length;              // kept in time order, so a blow still to land stays after what's before it
  while (i && log[i - 1].t > t) i--;
  log.splice(i, 0, { runs, t, n: 1, story, seq: ++lineSeq });
  if (log.length > LOG.kept) log.shift();
}
// ...and a line of the story (a note, a carving, the friend's door, a tale, a thought, the deer, the
// lake house, the remnants): not dimmed once something else is said after it (the user's, 2026-10-19)
const tell = (runs, t = clock()) => say(runs, t, true);
// What someone says, as the log has it: "Priest: " and their line (both translated, see lang.js)
const speech = (who, line) => [[tl("{who}: ", { who: nameOf(who) }), LOG.you], [tl(line), LOG.typed]];
// A line of the chat, said at `at` (Date.now()): placed by when it was said, so a line from
// before the game came in sits before what's happened since
function sayChat(runs, at = Date.now()) {
  const t = clock() - (Date.now() - at);
  let i = chats.length;
  while (i && chats[i - 1].t > t) i--;
  const line = { runs, t, at, n: 1, chat: true, seq: ++lineSeq };
  chats.splice(i, 0, line);
  if (chats.length > LOG.kept) chats.shift();
  return line;
}

// Runs of [text, colour] as lines no wider than w screen px, a font px being fs: words kept
// whole, each in its own colour; a word longer than a line (typed in the chat, say) is broken
// wherever the line runs out, as much on each line as fits
function wrapRuns(runs, w, fs, width = textWidth) {
  const words = runs.flatMap(([s, colour]) => String(s ?? "").split(/(?<= )/).map(word => [word, colour]));   // (a run with no words never stops the log)
  const fits = line => (width([[line.map(([s]) => s).join("").trimEnd()]]) - 1) * fs <= w;
  const out = [[]];
  for (let [word, colour] of words) {
    if (fits([...out.at(-1), [word]])) { out.at(-1).push([word, colour]); continue; }
    if (fits([[word]])) { out.push([[word, colour]]); continue; }
    while (word) {
      const line = out.at(-1);
      let n = 0;
      while (n < word.length && fits([...line, [word.slice(0, n + 1)]])) n++;
      if (!n && !line.length) n = 1;   // (not even a letter fits: one anyway)
      if (n) line.push([word.slice(0, n), colour]);
      word = word.slice(n);
      if (word) out.push([]);
    }
  }
  return out;
}

function drawLog(now) {
  const fs = logFont(), lineH = SANS.h * fs, u = hudScale, wrap = (runs, w) => wrapRuns(runs, w, fs, sansWidth);
  const text = (runs, x, y, font) => drawSans(ctx, runs, x, y + (SANS.h - SANS.cap) / 2 * fs, fs, font);   // (a line's capitals in the middle of its row)
  // beside the HUD it's boxed and `w` wide; stacked over it (a phone), unboxed and as wide as the HUD
  const beside = logWidth() > 0;
  webK = Math.max(0, Math.min(1, webK + (active ? -1 : 1) * Math.min(1, (now - webLast) / LOG.webMs)));
  webLast = now;
  const tall = logOpen || chat;
  const boxW = beside ? logWidth() * u : HUD_W * u, inset = beside ? (LOG.border + LOG.pad) * u : 0;
  const w = boxW - 2 * inset, x0 = beside ? LOG.left * u : hudX, x = x0 + inset;
  const shown = [...(logShows.log ? log.filter(e => e.t <= now) : []),
    ...(logShows.chat ? chats.filter(e => Date.now() - e.at < LOG.chatKeepMs) : [])].sort((a, b) => a.t - b.t || a.seq - b.seq);
  const lastOwn = shown.findLastIndex(e => !e.chat);
  const lines = shown.flatMap((e, i) => {
    const runs = [...e.runs, ...(e.n > 1 ? [[` (x${e.n})`, null]] : [])];
    if (e.chat) return wrap([["> ", LOG.newest], ...runs.map(([s, c]) => [s, c || LOG.typed])], w);
    const ink = i === lastOwn || e.story ? null : tall ? LOG.olderOpen : LOG.older;
    return wrap([["> ", ink ? (tall && !beside ? LOG.markPhone : ink) : LOG.newest],
      ...runs.map(([s, pick]) => [s, ink ?? (pick || LOG.newest)])], w);
  });
  // `history` lines of it open (`entries` closed), scrolled back `logScroll` from the newest:
  // what comes in while it's scrolled back pushes the scroll on with it, so what's being read stays put
  const room = tall ? LOG.history : logEntries();
  const all = lines.length;
  if (logScroll > 0) logScroll += Math.max(0, all - logLines);
  logScroll = Math.min(logScroll, Math.max(0, all - room));
  const from = Math.max(0, all - room - logScroll);
  lines.splice(0, from);
  lines.length = Math.min(lines.length, room);
  logLines = all;
  // what's typed so far, with a blinking cursor, after the name it'll go out under
  const cursor = Math.floor(now / 500) % 2 ? "_" : " ";
  const typed = chat ? wrap([[`> ${chatName} :`, LOG.you], [" " + chat.text + cursor, LOG.typed]], w) : [];
  const bottom = beside ? hudY + HUD_H * u : hudY - (LOG.gap + (hudRow().length ? HUD_V13.rowUp : 0)) * u;   // (on a phone, over the tools and buffs too)
  const buttonsY = bottom - inset - lineH, textBottom = buttonsY - LOG.buttonsGap * u, ruleY = buttonsY - Math.round(LOG.buttonsGap * u / 2);
  const rows = [...lines, ...typed];
  const textTop = textBottom - rows.length * lineH, headerY = textTop - LOG.pad * u - lineH;
  const top = (tall ? headerY : textTop) - inset;
  ctx.globalAlpha = webFade();
  logBox = [x0, top, boxW, bottom - top];
  ctx.fillStyle = LOG.backdrop;    // (dark1 at 90% under it, open or not, and a blue1 line over its buttons, as "chat-box" has it)
  ctx.fillRect(...logBox);
  ctx.fillStyle = LOG.line;
  ctx.fillRect(x0, ruleY, boxW, u);
  if (tall && all > room) {        // the bar: as tall a share of the lines' height as is showing, where they are
    const h = lines.length * lineH, barH = Math.max(fs, Math.round(h * room / all));
    ctx.fillStyle = LOG.button;
    ctx.fillRect(x0 + boxW - Math.ceil(inset / 2) - fs, textTop + Math.round((h - barH) * from / (all - room)), fs, barH);
  }
  rows.forEach((runs, i) => text(runs, x, textTop + i * lineH));
  const pad = Math.round(NOTICE.hitPad * u), side = beside ? 0 : LOG.pad * u;
  logButtons = {};
  const place = (name, runs, bx, by, font) => {
    text(runs, bx, by, font);
    logButtons[name] = [bx - pad, by - pad, sansWidth(runs, font) * fs + 2 * pad, lineH + 2 * pad];
  };
  if (webK < 1) {
    const toggle = on => tall ? (on ? LOG.onOpen : LOG.offOpen) : on ? LOG.on : LOG.off;
    // (Log, Players and [Enter] Chat in Dosage, and "Chat", not "Open Chat": the user's, 2026-10-27)
    place("log", [[tl("Log"), toggle(logShows.log)]], x + side, buttonsY, DOSAGE);
    place("chatView", [[tl("Players"), toggle(logShows.chat)]], x + side + (sansWidth([[tl("Log")]], DOSAGE) * fs) + LOG.toggleGap * u, buttonsY, DOSAGE);
    // ("Chat", or without its [Enter] where that won't fit beside Log and Players (a longer
    // language's words); past #1, which room it's in)
    const room = words => [` ${tl(words)}` + (chatRoom > 1 ? ` #${chatRoom}` : ""), LOG.label];
    const enterAs = words => tapKeys([["[", LOG.bracket], ["Enter", LOG.key], ["]", LOG.bracket], room(words)]);
    const toggles = sansWidth([[tl("Log")], [tl("Players")]], DOSAGE) * fs + LOG.toggleGap * u * 2;
    const fits = runs => sansWidth(runs, DOSAGE) * fs + toggles <= w - 2 * side;
    const enter = [enterAs(english("Chat"))].find(fits) ?? [room(english("Chat"))];
    place("chat", enter, x + w - side - sansWidth(enter, DOSAGE) * fs, buttonsY, DOSAGE);
    if (tall) {                    // "?" and "X" at its top right
      const xw = sansWidth([["X"]]) * fs, qw = sansWidth([["?"]]) * fs;
      place("close", [["X", "#d95763"]], x + w - xw, headerY);
      place("help", [["?", "#8a6f30"]], x + w - xw - LOG.headerGap * u - qw, headerY);
    }
  }
  // its help, right over it and as wide, in blue4 in the 6px text (`helpPx`), boxed the same way
  if (tall && logHelp && webK < 1) {
    const hs = fs, hl = SANS.h * hs, hp = (LOG.border + LOG.pad) * u;
    const help = LOG_HELP.flatMap(line => wrapRuns([[tl(line), LOG.newest]], boxW - 2 * hp, hs, sansWidth));
    const hh = help.length * hl + 2 * hp, hy = top - LOG.gap * u - hh;
    ctx.fillStyle = LOG.backdrop;
    ctx.fillRect(x0, hy, boxW, hh);
    const b = LOG.border * u;
    ctx.fillStyle = LOG.line;
    ctx.fillRect(x0, hy, boxW, b); ctx.fillRect(x0, hy + hh - b, boxW, b);
    ctx.fillRect(x0, hy, b, hh); ctx.fillRect(x0 + boxW - b, hy, b, hh);
    help.forEach((runs, i) => drawSans(ctx, runs, x0 + hp, hy + hp + i * hl, hs));
  }
  ctx.globalAlpha = 1;
}
const logButtonAt = (px, py) => Object.entries(logButtons).find(([, [x, y, w, h]]) =>
  px >= x && px < x + w && py >= y && py < y + h)?.[0];

// Typing goes to a hidden text field, so phones bring up their keyboard and every key (and
// accent) works as the browser would have it
const chatInput = document.createElement("input");
Object.assign(chatInput, { type: "text", maxLength: LOG.chatMax, autocomplete: "off", spellcheck: false, enterKeyHint: "send" });
chatInput.setAttribute("aria-label", "聊天（本地版离线）");
Object.assign(chatInput.style, { position: "fixed", left: "0", top: "0", width: "1px", height: "1px",
  opacity: "0", border: "0", padding: "0", fontSize: "16px" });  // 16px: iOS doesn't zoom in on it
document.body.append(chatInput);
chatInput.addEventListener("input", () => { if (chat) chat.text = chatInput.value; });
chatInput.addEventListener("keydown", e => {
  e.stopPropagation();             // the game's keys stay out of it
  if (e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter") { if (chat) sendChat(); }   // (a phone's Enter often has no `code`)
  else if (e.code === "Escape") closeChat();
});
// (a press on the panel's toggles or "?" leaves it open: the field gets its focus straight back)
let keepTyping = 0;
const keepsTyping = name => ["log", "chatView", "help"].includes(name);
chatInput.addEventListener("blur", () => {
  if (!chat) return;
  if (performance.now() < keepTyping) { keepTyping = 0; setTimeout(() => chat && chatInput.focus()); return; }
  closeChat();
});
canvas.addEventListener("mousedown", e => {   // (and with a mouse, it never even loses it)
  const dpr = pixelRatio;
  if (chat && keepsTyping(logButtonAt(e.offsetX * dpr, e.offsetY * dpr))) e.preventDefault();
});
function openChat(text = "") {     // (`text`: started for them)
  logScroll = 0; logShows.chat = true;
  chat = { text };
  chatInput.value = text;
  held.length = 0;                 // stop walking
  chatInput.focus();
}
function closeChat() {
  chat = null; logScroll = 0;
  chatInput.blur();
}
// What's said goes to everyone else playing, through the site's Worker (/chat, worker/chat.js),
// and shows here under the game's name, in `them` like everyone else's (while it's typed, in LOG.you). Coming in, the last
// few lines said show too (coming back, the ones missed). Each game is named once, at random (`CHAT_NAMES` and a number,
// kept in localStorage). It's in one of the chat's rooms (100 games each at most, worker/lobby.js),
// #1 if there's room, and coming back it asks for the one it was in; past #1 its [Enter]Chat
// says which ("Chat #2"), and coming in to a room it wasn't in, it says so in the chat, and
// shows the last few lines said there. The socket's closed while the tab's hidden, pinged every `pingMs`
// to keep it open, and tried again `retryMs` later (doubling, up to `retryMaxMs`) if it drops;
// where there's no Worker (a plain local server) it just never connects, and what's said is
// said here only. Text is kept to what the font has, as the Worker keeps it.
// A line from the dashboard (worker/chat.js MOD_NAME) has its name in `mod`'s ink (Claude's pick).
const CHAT = { pingMs: 30000, retryMs: 2000, retryMaxMs: 60000, them: "#d9a066", event: "#fbf236", mod: "#5fcde4" };
const CHAT_NAMES = ["Wanderer", "Pilgrim", "Stranger", "Drifter", "Nomad", "Rover", "Traveller", "Vagrant"];
const chatName = (() => {
  try {
    const kept = localStorage.getItem("mektxt.name");
    if (kept) return kept;
  } catch {}
  const name = `${CHAT_NAMES[Math.floor(Math.random() * CHAT_NAMES.length)]} ${100 + Math.floor(Math.random() * 900)}`;
  try { localStorage.setItem("mektxt.name", name); } catch {}
  return name;
})();
const plainText = s => s.normalize("NFKD").replace(/\s+/g, " ").replace(/[^\x20-\x7e]/g, "").trim();
const sending = [];                // our own lines sent, not yet answered, oldest first
let chatSocket = null, chatPing = 0, chatRetry = CHAT.retryMs, chatRetryAt = 0, chatSeen = 0;   // chatSeen: the last line's id
let chatRoom = 0;                  // the room it's in (0 till it's been in one)
// (on mektxt.com, only once the journey's first turn's taken, see ON_SITE: someone only looking
// at the website isn't online in the game, nor counted so)
let chatJoins = !ON_SITE;
function connectChat() {
  return; // Local edition: no official chat backend.

  if (chatSocket || document.hidden || !chatJoins) return;
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/chat?name=${encodeURIComponent(chatName)}${chatRoom ? `&room=${chatRoom}` : ""}`;
  const ws = chatSocket = new WebSocket(url);
  ws.onopen = () => {
    chatRetry = CHAT.retryMs;
    chatPing = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send("ping"), CHAT.pingMs);
  };
  ws.onmessage = e => {
    if (e.data === "pong") return;
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m.history) {
      if (m.room !== chatRoom && (chatRoom || m.room > 1)) {   // (a room it wasn't in: its own lines, from the start)
        chatSeen = 0;
        sayChat([[tl("You're in chatroom #{n}.", { n: m.room }), CHAT.them]]);
      }
      chatRoom = m.room || 1;
      m.history.forEach(heard);
    }
    else if (m.sent) {             // (one of ours gone out: our copy as it went, starred where it swore)
      chatSeen = Math.max(chatSeen, m.sent);
      const mine = sending.shift();
      if (mine && typeof m.text === "string") mine.runs[1][0] = m.text;
    }
    else if (heard(m)) ping();
  };
  ws.onclose = () => {
    clearInterval(chatPing);
    sending.length = 0;            // (what wasn't answered never will be)
    if (chatSocket !== ws) return;
    chatSocket = null;
    clearTimeout(chatRetryAt);
    chatRetryAt = setTimeout(connectChat, chatRetry);
    chatRetry = Math.min(chatRetry * 2, CHAT.retryMaxMs);
  };
}
function heard({ id, name, text, event, mod }) {
  if (!(id > chatSeen) || typeof name !== "string" || typeof text !== "string" || !text) return;
  chatSeen = id;
  sayChat(event ? [[bossEvent(text), CHAT.event]] : [[`${name}: `, mod ? CHAT.mod : CHAT.them], [text, LOG.typed]], id);
  return true;                     // (said: a live one's pinged, see connectChat())
}
// What's worth telling everyone playing (worker/chat.js EVENTS): the Worker says it to every
// game, this one too, in `event`'s ink, under no one's name. With no Worker to tell (a plain
// local server, or offline), it's said here only.
// (a boss beaten: its kind, and what's said of whoever did it, as worker/chat.js EVENTS says it)
const BOSSES = { demon: "has banished a demon!", goblinKing: "has slain the goblin king!", golem: "has brought down a golem!",
  lich: "has destroyed the lich!", ironHound: "has brought down the iron hound!" };
// (the Worker says it in English: one of these is said here in the game's language, see lang.js)
const bossEvent = text => {
  const kind = Object.keys(BOSSES).find(k => text.endsWith(` ${BOSSES[k]}`));
  return kind ? tl("{name} {did}", { name: text.slice(0, -BOSSES[kind].length - 1), did: tl(BOSSES[kind]) }) : text;
};
// (watching a journey again, it's said here only, of whoever played it)
function announce(event, text) {
  if (chatSocket?.readyState === WebSocket.OPEN && !watching) chatSocket.send(JSON.stringify({ event }));
  else sayChat([[bossEvent(text), CHAT.event]]);
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) { chatRetry = CHAT.retryMs; return connectChat(); }
  clearTimeout(chatRetryAt);
  const ws = chatSocket;
  chatSocket = null;
  ws?.close();
});
connectChat();
function sendChat() {
  const text = plainText(chat.text);
  closeChat();
  if (!text) return;
  if (/^\/help$/i.test(text.trim())) { showHelp(); return; }   // (never sent: see HELP)
  if (bushAsking && bushTarget() === bushAsking) {   // (a name for the burning bush: kept here, never sent, see BUSH)
    say([[tl("You give your name: "), LOG.you], [text, LOG.typed]]);   // (not as a chat line: no one else hears it)
    act("n");
    return;
  }
  const mine = sayChat([[`${chatName}: `, CHAT.them], [text, LOG.typed]]);
  if (chatSocket?.readyState === WebSocket.OPEN) { chatSocket.send(JSON.stringify({ text })); sending.push(mine); }
  const word = WORDS.list.findIndex(w => w.toLowerCase() === text.trim().toLowerCase()), grace = GRACE.words.test(text);
  if (word >= 0 || grace) act("W", word, grace);   // (only what's said that can change the journey goes in its record)
}
// HELP: "/help" said in the chat isn't sent; instead the chat shows how to play, here only, in
// `ink`, with the keys or the touches by what's been used (a phone's own words for a phone), and
// opens so it can all be read. The first time anyone plays (this browser), the log says to.
// (Claude's draft of the words, 2026-10-12, for the user to go over)
const HELP = {
  ink: "#99e550",
  commands: ["/help this list"], seen: "mektxt.helpHint",
  hint: { keys: "New here? Press Enter and type /help to learn how to play.", touch: "New here? Tap Chat and type /help to learn how to play." },
  lines: {
    // (the user's words, 2026-10-12; WASD as the keyboard's layout has it, see walkKeys())
    keys: () => [
      tl("[{walk}] / [Arrow Keys] move + attack", { walk: walkKeys() }),
      tl("[{use}] use / [1-8] quick shortcut", { use: keyName(settings.use) }),
      "[B] bag / [P] picks class / [G] leaderboard",
      "[Enter] log + chat / [M] mute",
      "[+/-] zoom / [O] full screen.",
      "[Esc] / [Backspace] Close",
    ],
    touch: [
      "Last 5 days in the forest. Explore, fight and open chests for points: the best scores go on the leaderboard.",
      "Hold a finger on the side you want to go, and slide it to turn. Walk into a monster to fight it, into a tree to chop it.",
      "Tap a monster to look at it. Tap the bag on the HUD for your bag, a spell beside it to cast it.",
      "Tap [F] when it shows to use what's beside you: chests, doors, people. Pinch to zoom.",
      "At night the dead rise, and the demon never stops looking for you. Caves go deep: take a torch.",
    ],
  },
};
const touchFirst = () => tapping || matchMedia("(pointer: coarse)").matches;
// The four walking keys (by where they are: WASD's places) as this keyboard labels them: ZQSD on an
// AZERTY, WARS on a Colemak. Chrome and Edge say so up front (the Keyboard API); elsewhere it's
// learnt from the keys as they're pressed, WASD till then
const WALK_AT = [...new Set(Object.values(MOVES).flat())], walkLabels = new Map();
navigator.keyboard?.getLayoutMap?.().then(m => { for (const at of WALK_AT) if (m.get(at)) walkLabels.set(at, m.get(at).toUpperCase()); }).catch(() => {});
addEventListener("keydown", e => { if (WALK_AT.includes(e.code) && /^[a-z]$/i.test(e.key)) walkLabels.set(e.code, e.key.toUpperCase()); }, { capture: true });
const walkKeys = () => [0, 2, 1, 3].map(i => moveKeys()[i]).map(at => walkLabels.get(at) ?? keyName(at)).join("");   // (the settings' keys, as WASD)
function showHelp() {
  for (const line of touchFirst() ? HELP.lines.touch : HELP.lines.keys()) sayChat([[tl(line), HELP.ink]]);
  for (const line of HELP.commands) sayChat([[tl(line), HELP.ink]]);   // (Claude's words, 2026-10-12)
  logShows.chat = true;
  if (!logOpen) toggleLog();
}
function helpHint() {
  if (watching) return;
  try { if (localStorage.getItem(HELP.seen)) return; localStorage.setItem(HELP.seen, "1"); } catch {}
  say(tr(HELP.hint[touchFirst() ? "touch" : "keys"], {}, HELP.ink));
}
helpHint();
// What's said in the chat that can change the journey: one of WORDS (by its index, or -1), and
// whether it's the words that bring grace (see GRACE)
function said(word, grace) {
  if (word >= 0) sayWord(WORDS.list[word]);
  if (grace && map.church && !graced) receiveGrace();
}

// Whether a canvas point is on the HUD (anywhere in its box), its bag's button, or a tool or buff over it
function inHud(x, y) {
  return (x >= hudX && x < hudX + HUD_W * hudScale && y >= hudY && y < hudY + HUD_H * hudScale) || onRect(hudBag, x, y) ||
    hudRow().some(r => hudRowHit(r, x, y));
}
// The bag's button on the HUD (see HUD_V13): its icon in a blue2-lined box, "[B]" under it ("Bag" on a touch screen)
function drawHudBag() {
  const H = HUD_V13, I = H.ink, u = hudScale, k = Math.max(1, Math.round(u * 8 / SANS.h)), [bw, bh] = H.box;
  const x = hudX + H.bagX * u, y = hudY;
  ctx.fillStyle = I.bg; ctx.fillRect(x + u, y + u, (bw - 2) * u, (bh - 2) * u);
  ctx.fillStyle = I.bag;   // (its line's corners left out)
  ctx.fillRect(x + u, y, (bw - 2) * u, u); ctx.fillRect(x + u, y + (bh - 1) * u, (bw - 2) * u, u);
  ctx.fillRect(x, y + u, u, (bh - 2) * u); ctx.fillRect(x + (bw - 1) * u, y + u, u, (bh - 2) * u);
  ctx.drawImage(tiles, HUD.bagIcon * CW, 0, CW, CH, x + Math.round((bw - CW) * u / 2), y + Math.round((bh - CH) * u / 2), CW * u, CH * u);
  const label = tapping ? [[tl("Bag"), I.lit]] : [["[", I.dim], ["B", I.key], ["]", I.dim]], lw = sansWidth(label) * k;
  drawSans(ctx, label, x + Math.round((bw * u - lw) / 2), y + H.numY * u, k);
  hudBag = [x, y, bw * u, (H.numY + 6) * u];
}
// "bag" when the bag's button on the HUD is at a canvas point
function hudSlotAt(x, y) {
  return onRect(hudBag, x, y) ? "bag" : undefined;
}
// The index of the buff over the HUD at a canvas point (see effects()), or -1
function hudBuffAt(x, y) {
  return hudRow().find(r => r.effect !== undefined && hudRowHit(r, x, y))?.effect ?? -1;
}
// Which of the shortcuts on the HUD is at a canvas point (its box or the number under it), or -1
function hudShortcutAt(x, y) {
  const u = hudScale;
  if (y < hudY || y >= hudY + (HUD_V13.numY + 6) * u) return -1;
  for (let i = 0; i < SLOTS; i++) if (x >= hudX + hudSlotX(i) * u && x < hudX + (hudSlotX(i) + HUD_V13.box[0]) * u) return i;
  return -1;
}

// (`page`: the page's time; the game goes by its own clock, which, watching, is the journey's)
// Each frame's drawn by drawFrame(); one that throws is told to the dashboard (see fault()) and
// the next comes all the same, so an error in a turn or a draw never stops the game for good
function frame(page) {
  try { drawFrame(page); }
  catch (err) {
    console.error(err);
    fault(`${err?.message ?? err} @ ${String(err?.stack ?? "").match(/\/([^/\s)]+:\d+):\d+/)?.[1] ?? "frame"}`);
  }
  finally { requestAnimationFrame(frame); }
}
function drawFrame(page) {
  const now = watching ? watchFrame(page) : clock();
  if (quiet && now - lastDraw < 1000 / QUIET_FPS) return;
  lastDraw = now;
  fog = fogByRed[hpTier().red ?? 0] ?? fog;
  ctx.fillStyle = "#071324";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  updateCamera(now);
  if (!watching) {                 // what happens between turns, as the screen's drawn (watching, the record has it)
    const reached = bolts.map(b => Math.min(b.path.length, Math.floor((now - b.t0) / BOLT.cellMs)));
    if (bolts.some((b, i) => dead || b.on !== map || b.done < reached[i])) act("B", reached);
    const out = [...fires].filter(([, f]) => now - f.t0 >= FIRE.groundMs).map(([k]) => k);
    if (out.length) act("E", out);
  }
  if (map === MAPS.outside && !watching) {   // the forest's further patches, for everything on screen or in reach of sight
    const reach = Math.ceil(FOG_END * fogSpread() + light()) + 2;
    const x0 = Math.min(Math.floor(-originX / (CW * scale)), player.x - reach);
    const y0 = Math.min(Math.floor(-originY / (CH * scale)), player.y - reach);
    const x1 = Math.max(Math.ceil((canvas.width - originX) / (CW * scale)), player.x + reach);
    const y1 = Math.max(Math.ceil((canvas.height - originY) / (CH * scale)), player.y + reach);
    act("X", x0, y0, x1, y1);
  }
  findLights();
  noticeGhosts();
  churchTalk(now);
  smithTalk(now);
  eye = lookout ? lookout.eye : visualPos(now);
  const wave = 0.5 - 0.5 * Math.cos(2 * Math.PI * now / LANDMARK.periodMs);
  pulse = LANDMARK.min + (LANDMARK.max - LANDMARK.min) * wave;
  const { pos, pose } = map === MAPS.outside ? drawOutside(now) : drawInside(now);
  drawSense(now);
  drawBushMarks(now);
  if (dead && now >= dead.at && !dead.shot) dead.shot = snapshot(pos);   // (for the score card, see SHARE)
  // the cursor, or the [F] prompt next to something usable, rides along with the head:
  // slide and stretch included
  const lift = -Math.round((pose.sy - 1) * CH);
  const target = lookout ? null : unreadNote()?.at ?? interactTarget() ?? bushTarget()?.bush.foot ?? towerTarget()?.at ?? shrineTarget()?.at ?? graveTarget()?.at ?? noteTarget()?.at;
  promptRect = null;
  if (target) {
    const px = Math.max(1, Math.round(PROMPT.zoom * scale)), T = PROMPT.tap, tap = [["Tap", T.ink]];
    const tf = Math.max(1, Math.round(T.fontPx * scale)), tpad = Math.max(1, Math.round(T.pad * scale));
    const w = tapping ? (sansWidth(tap) - 1) * tf + 2 * tpad : PROMPT.w * px, h = tapping ? SANS.cap * tf + 2 * tpad : PROMPT.h * px;   // ("Tap" in MEK Sans)
    const headY = originY + (pos.y * CH + lift) * scale;
    let x = originX + (pos.x + 0.5) * CW * scale - w / 2, y = headY + PROMPT.bottom * scale - h;
    if (target[1] < player.y) {
      // the thing is overhead: sit beside the head on the facing side, so it stays visible
      const side = player.facing === "left" ? -1 : 1;
      x += side * ((CW / 2 + PROMPT.gap) * scale + w / 2);
      y = headY - h / 2;
    }
    if (tapping) {
      ctx.fillStyle = T.bg;
      ctx.fillRect(Math.round(x), Math.round(y), w, h);
      drawSans(ctx, tap, Math.round(x) + tpad, Math.round(y) + tpad, tf);
    } else ctx.drawImage(prompt, Math.round(x), Math.round(y), w, h);
    const pad = PROMPT.hitPad * scale;
    promptRect = [x - pad, y - pad, w + 2 * pad, h + 2 * pad];
  } else if (walked < ARROW_STEPS) {
    drawTile(SCENE.arrow, pos.x, pos.y - 1, BOB[Math.floor(now / BOB_MS) % BOB.length] + lift);
  }
  drawRiteCount(originX + (pos.x + 0.5) * CW * scale, originY + ((pos.y - 1) * CH + lift) * scale);
  const fade = 1 - (now - fadeT0) / FADE_MS;
  if (fade > 0) {
    ctx.fillStyle = `rgba(7, 19, 36, ${fade})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (dead && now >= dead.at) {    // (game over: the world dimmed, not the HUD, log or chat, see GAME_OVER)
    ctx.fillStyle = `rgba(7, 19, 36, ${GAME_OVER.dim * Math.min(1, (now - dead.at) / GAME_OVER.dimMs)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  drawAim();
  drawHud();
  drawDpad();
  drawLog(now);
  drawScore();
  drawTooltip(now);
  if (notice || talk || panel || leveling || picking || inspecting || ranking || setting || (dead && now >= dead.at && !dead.hidden)) {
    ctx.fillStyle = SCRIM;         // (a panel's up: dark2 over everything behind it, see SCRIM)
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  openingBack();
  titleTune(!!opening);            // (the title's own tune, through what it brings up, till the journey begins)
  if (opening) {                   // (the title, or what it brought up, alone on dark1)
    ctx.fillStyle = TITLE.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (opening.step === "title") drawTitle(ctx, now, pixelRatio, phone);
    // (the classes' panel: its picture behind it, in the look of the picked class's group, see CLASS_ART)
    if (opening.step === "class" && picking) drawClassArt(ctx, CLASSES[Object.keys(CLASSES)[picking.focus]].group, now);
  }
  showKofi(opening?.step === "title" && active, phone);   // (Ko-fi's Support me, over the title alone, not the website)
  drawNotice();
  drawTalk();
  if (!watching && !leveling && !dead && (progress.points || progress.spells) && now >= levelAt &&
      !notice && !talk && !panel && !inspecting && !aiming && !lookout && !picking && !ranking && !setting) act("l");
  drawPanel();
  drawLevelUp();
  drawClasses();
  drawMonster();
  drawGameOver(now);
  drawLeaderboard();               // (over the game-over box, opened from it)
  drawSettings();
  drawWatching();
  drawHover();
  drawBetween();
  drawCurtain(now);
  crt(now, opening ? CRT_TITLE : 1);   // (none on the title and what it brings up, its words clearer; bowed all the same)
  tick(now);
}

// The character heals on their own too, 1 hp every `every` turns they take (a step, a blow, a
// swing at a tree, going through a door, equipping or dropping something), quietly, on top of
// any gear's (every 20 turns till 2026-10-12, the user's 8)
const REGEN = { every: 8 };
let turns = 0;
// Days and nights: a day is `turns` of the character's turns (a step, a blow, a spell...),
// starting at sunrise, and after `days` of them the journey ends (see endJourney()). Out in the
// forest daylight lets them see `light` cells further, as a torch does, and spreads the fog's
// steps `spread` wider apart on top (1 + spread times), so it darkens more gradually: all of it
// till `dusk` turns into the day, fading out by `night`, none till `dawn`, and back by the day's
// end; the night is as dark as the forest always was. (300 turns a day for 5 days, light 6 and
// spread 0.35 from 2026-10-05; 310 from 2026-10-12, dusk, night and dawn moved to the same
// share of the day) The HUD says which day it is (see drawHud()),
// and the log when the sun sets, night falls and day breaks. A Saga or Blitz Daily Challenge's
// days (see DAILY) are all as much longer or shorter, dusk, night and dawn with them.
const DAY = { days: 5, light: 6, spread: 0.35, ...Object.fromEntries(Object.entries({ turns: 310, dusk: 176, night: 207, dawn: 289 })
  .map(([k, n]) => [k, Math.round(n * DAILY.days)])) };
const dayTurn = () => turns % DAY.turns;
const dayNumber = () => Math.min(DAY.days, Math.floor(turns / DAY.turns) + 1);
const isNight = () => dayTurn() >= DAY.night && dayTurn() < DAY.dawn;
// How far apart the fog's steps are (see fogStep()): wider by day, outside
const fogSpread = () => (map === MAPS.outside ? 1 + DAY.spread * daylight() / DAY.light : 1);
function daylight() {
  if (inDarkWood && map === MAPS.outside) return 0;   // (no daylight gets into the dark wood, see DARK_WOOD)
  const t = dayTurn(), { dusk, night, dawn, turns: end } = DAY;
  return DAY.light * (t < dusk ? 1 : t < night ? 1 - (t - dusk) / (night - dusk) : t < dawn ? 0 : (t - dawn) / (end - dawn));
}
// Skeletons only walk at night: at nightfall the two that lie in wait on the road rise, and
// `rise` more (min..max) on open ground `away` cell widths (min..max) off the character, or off
// where they last stood outside, never in a church's clearing; at sunrise those still standing
// crumble. A graveyard's band keeps to its graves, day and night. Those `rise` are, by `kinds`'
// weights, the first biome's (forest-1's), the second's (forest-2's) or the third's (forest-3's, and
// any past it) night walkers (v0.12; Claude's weights).
const NIGHT = { rise: [3, 5], away: [8, 16], kinds: [{ skeleton: 60, zombie: 40 }, { skeleton: 30, zombie: 35, hound: 35 },
  { skeleton: 35, zombie: 25, skeletonArcher: 20, wraith: 20 }] };
function nightKind([x, y]) {
  const weights = NIGHT.kinds[Math.min(world.biomeAt(x, y), NIGHT.kinds.length - 1)];
  let r = random() * Object.values(weights).reduce((a, b) => a + b, 0);
  return Object.keys(weights).find(k => (r -= weights[k]) < 0) ?? "skeleton";
}
let outsideAt = [player.x, player.y];   // where the character last stood outside
// The third forest (and any past it: forest-4) is dark day and night: no daylight reaches the
// character in it (see daylight()), so they see only as far as at night, its monsters are about
// all day (see world.js FOREST3), and the log says so going into it, and coming out (2026-10-12,
// the user's ask; the words Claude's)
const DARK_WOOD = { from: 2, into: "The branches close overhead. In this forest it's always night.", out: "You leave the dark forest behind." };
let inDarkWood = false;
// Which biome the character counts as being in (world.js zoneAt(), not the ragged edge of the
// mix), as of their last turn outside: what the dark wood and the hunters go by
let zone = 0;
function zoneTurn() {
  if (map !== MAPS.outside) return;
  const was = zone;
  zone = world.zoneAt(player.x, player.y, zone);
  if (zone === was) return;
  const dark = zone >= DARK_WOOD.from;
  if (dark !== inDarkWood) {
    inDarkWood = dark;
    say(tr(dark ? DARK_WOOD.into : DARK_WOOD.out, {}, dark ? INK.down : INK.same));
  }
  huntersTurn(was);
}
// A superior, cursed or enchanted monster, the first time the character sees it: a quiet sting
// (sound.js omen()), once a turn however many come into sight together
const OMENS = new Set(["superior", "cursed", "enchanted"]);
function omenTurn() {
  let seen = false;
  for (const s of foes) {
    if (s.omened || s.dead || s.on !== map || !OMENS.has(s.affix) || s.charmed || !inSight(s.x, s.y)) continue;
    s.omened = seen = true;
  }
  if (seen) omen();
}
// What's heard round the character (sound.js surroundings()): the dead wood's bed or the cave's,
// and how near (1 beside it, 0 `HEAR` cells off or further) lava, crystals, a burning bush and a
// village's people are, and whether a void orb's on the map; worked out again only once something's
// moved (the cells Claude's picks)
const HEAR = { lava: 9, crystals: 6, bush: 14, village: 14 };
let heardAt = "", heardNow = null;
function around() {
  const k = `${map.id} ${player.x} ${player.y} ${turns} ${inDarkWood} ${orbs.length}`;
  if (k === heardAt) return heardNow;
  heardAt = k;
  const near = (cells, r) => {
    let d = Infinity;
    for (const [x, y] of cells) d = Math.min(d, Math.max(Math.abs(x - player.x), Math.abs(y - player.y)));
    return Math.max(0, 1 - d / r);
  };
  const outside = map === MAPS.outside;
  return heardNow = {
    bed: map.cave ? "cave" : outside && inDarkWood ? "dead" : "forest",
    deep: !!map.cave && map.depth >= 4,   // (cave-4's floors: the earth rumbling, no drips)
    lava: map.cave ? near(map.cave.lava, HEAR.lava) : 0,
    crystals: map.cave ? near([...map.cave.crystals.keys()].map(c => c.split(",").map(Number)), HEAR.crystals) : 0,
    bush: outside ? near(world.patches.filter(p => p.bush).map(p => p.bush.foot), HEAR.bush) : 0,
    village: near(jacks.filter(j => j.village !== undefined && j.on === map).map(j => [j.x, j.y]), HEAR.village),
    orb: orbs.some(o => o.on === map),
  };
}
// HUNTERS: one miniboss hunts the character in each zone, the demon in forest-1 and the iron hound
// in forest-2 (by `zone`, see zoneTurn()); out of its own it stands its ground (see standGround())
// till they come back, and the log says when either starts or stops. The iron hound's let out the
// first time the character's in forest-2, `away` cell widths further out from the house than they
// are (as the demons are, see DEMON), and only the one. (2026-10-12, the user's ask: only one
// miniboss hunts in a biome; forest-3's and past it none, `away` and `near` Claude's picks)
const HUNTERS = { demon: 0, ironHound: 1, away: 120, near: FOG_STEPS[DITHER_STEP].from };
let houndOut = false;
function huntersTurn(was) {
  const letOut = zone === HUNTERS.ironHound && !houndOut;
  if (letOut) {
    houndOut = true;
    const [sx, sy] = world.spawn, a = Math.atan2((player.y - sy) * CH / CW, player.x - sx);
    addBoss("ironHound", openNear(player.x + Math.round(HUNTERS.away * Math.cos(a)), player.y + Math.round(HUNTERS.away * CW / CH * Math.sin(a)), Math.sign(Math.cos(a)) || 1),
      MAPS.outside, { alert: true, stalked: 0 });
    howl();
    say(DAILY.twins ? tr("You feel <hunt>{n} iron hounds</> hunting you now.", { hunt: DEMON.ink, n: 2 }) : tr("You feel <hunt>the iron hound</> hunting you now.", { hunt: DEMON.ink }));
  }
  for (const kind of ["demon", "ironHound"]) {
    if (kind === "ironHound" && letOut) continue;   // (just let out: it's been said)
    const left = foes.filter(s => s.kind === kind && !s.dead && s.on === MAPS.outside);
    if (!left.length || (HUNTERS[kind] === zone) === (HUNTERS[kind] === was)) continue;
    const one = noun((ENEMIES[kind].name ?? kind).toLowerCase(), DEMON.ink), n = left.length, many = n > 1;
    if (HUNTERS[kind] === zone) { (kind === "demon" ? roar : howl)(); say(tr(many ? "You feel <hunt>{n} {one:pl}</> hunting you again." : "You feel {one:the} hunting you again.", { hunt: DEMON.ink, n, one })); }
    else say(tr(many ? "{n} {one:pl} stop hunting you, and stand their ground." : "{one:The} stops hunting you, and stands its ground.", { n, one: noun(one.noun) }, INK.same));
  }
}
function canRise(x, y, M = MAPS.outside) {
  const k = key(x, y), out = M === MAPS.outside;
  return M.open(x, y) && !(out ? M.keepClear.has(k) || world.sanctuary.has(k) : M.doors?.has(k)) && !(map === M && x === player.x && y === player.y) &&
    !foes.some(s => !s.dead && s.on === M && s.x === x && s.y === y) && !priests.some(p => p.x === x && p.y === y);
}
// n cells for the dead to rise on, NIGHT.away from where the character last was outside (or, on
// a cave's floor, `on`, NIGHT.away steps from where they are, along open ground, so none rise
// walled off from them)
function riseSpots(n, on = MAPS.outside) {
  if (on !== MAPS.outside) return walkSpots(n, on);
  const [ox, oy] = outsideAt, [lo, hi] = NIGHT.away, spots = [];
  for (let tries = 0; n > 0 && tries < 400; tries++) {
    const x = ox + Math.round((random() * 2 - 1) * hi), y = oy + Math.round((random() * 2 - 1) * hi * CW / CH);
    const d = fogDistance(x - ox, y - oy, CW, CH);
    if (d < lo || d > hi || !canRise(x, y) || spots.some(([sx, sy]) => sx === x && sy === y)) continue;
    spots.push([x, y]);
    n--;
  }
  return spots;
}
function walkSpots(n, on) {
  const [lo, hi] = NIGHT.away, seen = new Set([key(player.x, player.y)]), far = [], near = [];   // (near: in a small cave, 3 steps off will do)
  for (let ring = [[player.x, player.y]], d = 1; d <= hi && ring.length; d++) {
    const next = [];
    for (const [x, y] of ring) for (const [cx, cy] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (seen.has(key(cx, cy)) || !on.open(cx, cy)) continue;
      seen.add(key(cx, cy));
      next.push([cx, cy]);
      if (d >= 3 && canRise(cx, cy, on)) (d >= lo ? far : near).push([cx, cy]);
    }
    ring = next;
  }
  const spots = [], from = far.length >= n ? far : [...far, ...near];
  while (n-- > 0 && from.length) spots.push(from.splice(Math.floor(random() * from.length), 1)[0]);
  return spots;
}
// (a Spooky Daily Challenge's, DAILY.ghosts: that many ghosts every night, on the cave floor the
// character's on if they're down one)
function nightfall() {
  const many = DAILY.ghosts || 1, down = DAILY.ghosts && map.cave ? map : null;
  const spots = riseSpots(NIGHT.rise[0] + Math.floor(random() * (NIGHT.rise[1] - NIGHT.rise[0] + 1)) + (down ? 0 : many - 1));
  const own = ghostPool.find(g => g.own);   // (the character's own last one rises at the first nightfall it can, see OWN_GHOST)
  const ghostAts = (DAILY.ghosts || random() < GHOSTS.chance || own) && ghostPool.length
    ? (down ? riseSpots(many, down) : spots.splice(-many)).slice(0, ghostPool.length) : [];
  for (const at of [...world.skeletons.filter(at => canRise(...at)), ...spots]) {
    addFoe(spots.includes(at) ? nightKind(at) : "skeleton", at);
    foes.at(-1).risen = true;
  }
  nightFalls();
  say(tr("Night falls. The dead are stirring.", {}, INK.down));
  for (const at of ghostAts) {
    const mine = ghostPool.find(g => g.own);
    raiseGhost(ghostPool.splice(mine ? ghostPool.indexOf(mine) : Math.floor(random() * ghostPool.length), 1)[0], at, down ?? MAPS.outside);
  }
  if (relicOn("bone-flute")) boneAlly();   // (see RELIC)
  const lost = ghostPool.findIndex(g => !g.own);
  if (relicOn("lost-souls-lantern") && lost >= 0) soulAlly(ghostPool.splice(lost, 1)[0]);
  fetchGhosts();                   // (some more for the next night)
}
// Past players' ghosts ("ghost-players", 330:11032): the journeys on the scoreboard (worker/scores.js)
// each keep what their player was as it ended (see ghostOf()), and at nightfall, `chance` of
// the time, one of them rises with the skeletons, as their class's look in red, named for them
// ("Ghost of AXEL"), with their full hp and their atk, def, mag and spd (gear and all), and the
// best spell they knew, if it's one a monster can cast. A ghost far above the character (more
// than `levels` levels) is brought down to `levels` above, its hp and stats by as much. It
// crumbles at dawn like the skeletons; laid to rest, it leaves one of the things they wore,
// and the journey's score gains SCORE.ghost. The board hands out `fetch` at a time (only
// those still on it); with no board (a plain local server) none rise, but "?ghost=<class>" there
// (or with ?debug) makes one up to try. (Claude's numbers, 2026-10-05) Every ghost's hp, atk, def
// and mag are then `weaker` times that again (the user's ask, 2026-10-12: -45%); its spd is kept.
const GHOSTS = { chance: 0.6, levels: 2, fetch: 4, weaker: 0.55, classes: Object.keys(CLASSES) };
const ghostPool = [];              // { name, ghost } from the board, not risen yet
function fetchGhosts() {
  if (ghostPool.length >= GHOSTS.fetch || watching) return;   // (watching: the record has the ones that came)
  fetch(`/scores?ghosts=${GHOSTS.fetch}&v=${VERSION}${dailyKey ? `&daily=${dailyKey}` : ""}`).then(r => r.json()).then(d => {
    const got = (d.ghosts ?? []).filter(g => g?.ghost);
    if (got.length) act("G", got);
  }).catch(() => {});
}
// The character's own ghost (the user's, 2026-10-19, "by chance"): as a journey ends in a death
// (not time running out), what the character was then (ghostOf()) is kept in this browser, and
// `chance` of the journeys begun after it, it walks the forest at the first nightfall, as a past
// player's would (GHOSTS: as weak, as capped), "Your Ghost", leaving one of the things it wore
// when laid to rest. It comes but once: kept or not, the next death's takes its place; one that
// came is forgotten. (Claude's pick, `chance`)
const OWN_GHOST = { chance: 0.3, keep: "mektxt.ownGhost", name: "Your Ghost" };
function keepOwnGhost() {
  if (watching) return;
  try { localStorage.setItem(OWN_GHOST.keep, JSON.stringify(ghostOf())); } catch {}
}
function callOwnGhost() {
  if (watching) return;
  let g = null;
  try { g = JSON.parse(localStorage.getItem(OWN_GHOST.keep)); } catch {}
  if (!g?.cls || !(Math.random() < OWN_GHOST.chance || options.has("ownGhost"))) return;   // (Math.random, not the dice: the record has what came)
  try { localStorage.removeItem(OWN_GHOST.keep); } catch {}
  act("G", [{ id: "own", own: true, name: OWN_GHOST.name, ghost: g }]);
}
function addGhosts(got) {
  for (const g of got) if (!ghostPool.some(p => p.id === g.id)) ghostPool.push(g);
}
// What the character is as the journey ends, for their ghost (see GHOSTS): their class, level,
// full hp, stats with what they wear (not what's cast on them), what they wear, and their best spell
function ghostOf() {
  const worn = id => stats[id] + GEAR.reduce((sum, slot) => sum + bonus(wearing(slot), id), 0);
  const spells = bag.map(b => b?.id).filter(id => SKILLS[id]?.tier).sort((a, b) => (SKILLS[b].tier ?? 1) - (SKILLS[a].tier ?? 1));
  const w = wearing("weapon"), m = w && blades.get(w);   // (a named weapon worn goes with them, see BLADE)
  return { cls: charClass, level: progress.level, hp: maxHp(), atk: worn("atk"), def: worn("def"), mag: worn("mag"), spd: worn("spd"),
    gear: GEAR.map(wearing).filter(Boolean), spell: spells[0] ?? null,
    ...(m?.name ? { blade: { id: w, kills: m.kills, total: m.total, name: m.name, epithet: m.epithet } } : {}) };
}
function raiseGhost({ name, ghost: g, own }, at, on = MAPS.outside) {
  if (!GHOSTS.classes.includes(g.cls)) return;
  addFoe("shade", at, on, "normal");
  const s = foes.at(-1), k = Math.min(1, (progress.level + GHOSTS.levels) / Math.max(1, g.level)) * GHOSTS.weaker, by = n => Math.round(n * k);
  const spell = SKILLS[g.spell] && FOE_SPELLS[SKILLS[g.spell].variant] ? g.spell : null;
  const called = own ? tl(OWN_GHOST.name) : tl("Ghost of {name}", { name });   // (as it's shown, translated)
  Object.assign(s, { risen: true, look: `ghost-${g.cls}`, name: called, kindName: called, called: own ? called.toLowerCase() : tl("ghost of {name}", { name }), own: !!own,
    hp: Math.max(1, by(g.hp)), fullHp: Math.max(1, by(g.hp)), atk: Math.max(1, by(g.atk)), def: Math.max(0, by(g.def)),
    mag: Math.max(1, by(g.mag)), spd: g.spd, spell, ghostGear: (g.gear ?? []).filter(id => ITEMS[id]?.slot),
    level: Math.min(g.level, progress.level + GHOSTS.levels), exp: Math.max(ENEMIES.shade.exp, 10 * Math.min(g.level, progress.level + GHOSTS.levels)) });
  const where = on.cave ? tl("the cave") : tl("the forest");
  say(own ? tr("{name} walks {where} tonight, in what you died in.", { name: [s.name, INK.name], where }, INK.down)
    : tr("The {name} walks {where} tonight.", { name: [s.name, INK.name], where }, INK.down));
  const b = g.blade;
  if (b && ITEMS[b.id]?.slot === "weapon" && Object.values(BLADE.banes).includes(b.name)) {   // (see BLADE)
    s.blade = { id: b.id, kills: { ...b.kills }, total: b.total | 0, name: b.name, epithet: BLADE.epithets.includes(b.epithet) ? b.epithet : null };
    say(tr("It carries {blade}.", { blade: [bladeName(s.blade), INK.title] }));
  }
}
function sunrise(now) {
  monsterDay = dayNumber();
  tellRun();                       // (the dashboard told how far it's come, see RUN)
  let crumbled = false;
  const faded = [];
  for (const s of foes) {
    if (!s.risen || s.dead) continue;
    Object.assign(s, { dead: true, diesAt: now });
    if (s.ghostGear) faded.push(s);
    else if (s.on === map) { deaths.push({ x: s.x, y: s.y, t0: now, on: map }); crumbled = true; }
  }
  morningBell();
  say(dayNumber() === DAY.days ? tr("The last day dawns.", {}, INK.title) : tl("Day {n} dawns.", { n: dayNumber() }));
  if (crumbled) say("The skeletons crumble in the morning light.");
  for (const s of faded) say(tr(s.own ? "{name} fades with the dawn." : "The {name} fades with the dawn.", { name: [s.name, INK.name] }));
  for (const w of yigs) {           // (the night's allies go too, see ALLY)
    if (!w.night || w.dead) continue;
    Object.assign(w, { dead: true, diesAt: now });
    say(tr("Your {name} fades with the dawn.", { name: noun(w.name, INK.name) }));
  }
}
// The journey's score (see endJourney()), never explained in the game, weighed so that what
// the map hands out by luck counts for less the more of it there is, and what's chosen and
// risked counts for more (rebalanced 2026-10-05):
// - `exp` for each exp earned: monsters are worth more the stronger they are, and they're
//   stronger further out and on later days (MONSTER_FAR, MONSTER_DAYS), so going looking for a
//   fight is worth more than waiting for one (1 / 1.2 a point since v0.12, as LEVEL.per went up
//   1.2 times);
// - each clearing found, `clearing[0]` for the first `clearing[2]`, `clearing[1]` after;
// - each rare site (a church, a graveyard, a bandits' hideout) `site[0]` the first of its kind
//   and `site[1]` for any more of it, so a map thick with one kind isn't worth much more;
// - each shrine come upon, `shrine[0]`, or `shrine[1]` a rare one's (red, a pact);
// - each of the `events` seen through (the fairy ring's rite, the burning bush's gift, the lake
//   girl's truth), `event` once each;
// - each tree the character's axe fells, `tree[0]` for the first `tree[2]`, `tree[1]` after, times
//   `treeBiome` for the forest it stood in (forest-1, forest-2, forest-3 and on), each cell once
//   however often it grows back, so the forest pays as the cave's depth does (the user's,
//   2026-10-28: the cave was the plain choice for points; clearings and sites up from 5/2 and
//   60/20 then too);
// - caves by how deep they've been gone down, the deepest floor reached on any: `floor` times
//   1 + 2 + ... + that floor's depth, each floor further down worth more than the last;
// - each chest opened, `chest[0]` for the first `chest[2]`, `chest[1]` after;
// - each past player's ghost laid to rest (see GHOSTS), `ghost[0]` and `ghost[1]` for each of
//   its levels (as it was fought), the stronger the better;
// - and lasting: `perDay` more of the lot for each day the journey reached, from the second (4% on
//   day 2, 6% on day 3... 10% on day 5), and `alive` more on top for lasting all its days, the
//   character still standing (2026-10-06; perDay was 0.04, halved so long runs don't run away).
// Then the climb steepens (`top`, 2026-10-06): up to `from` every point counts in full, past it
// each one a little less, the more of them there are, so the middle of the board comes easily
// and the top of it is fought for (`ease` how slowly it steepens; 300 points in show as 290,
// 400 as 366, 600 as 493, 800 as 600).
const SCORE = { exp: 1 / 1.2, clearing: [10, 4, 10], site: [90, 30], floor: 20, chest: [10, 4, 15], ghost: [20, 12], perDay: 0.02, alive: 0.2,
  shrine: [15, 40], event: 30, events: ["riteDone", "gift", "lakeTruth"], tree: [1, 0.25, 100], treeBiome: [1, 1.5, 2],
  top: { from: 200, ease: 200 } };
const steepened = (x, { from, ease } = SCORE.top) => x <= from ? x : from + 2 * ease * (Math.sqrt(1 + (x - from) / ease) - 1);
const tally = { exp: 0, floors: new Set(), chests: new Set(), ghosts: 0, ghostPoints: 0, deepest: 0,   // (floors: each cave floor been to, by its map's id)
  shrinePoints: 0, events: new Set(), trees: new Set(), treePoints: 0 };
// (an event of SCORE.events seen through; the score's, so counted while watching too, as lived() isn't)
const achieved = event => SCORE.events.includes(event) && tally.events.add(event);
// (a tree the character's felled at cell k, (x, y) outside: see SCORE.tree)
function treeFelled(k, x, y) {
  if (tally.trees.has(k)) return;
  const [each, after, upTo] = SCORE.tree, b = SCORE.treeBiome;
  tally.treePoints += (tally.trees.size < upTo ? each : after) * b[Math.min(b.length - 1, world.biomeAt(x, y))];
  tally.trees.add(k);
}
const tapered = (n, [each, after, upTo]) => Math.min(n, upTo) * each + Math.max(0, n - upTo) * after;
// And, never told (not on the keepsakes' cards either, the user's, 2026-10-21), `keepsake` more for
// each kind of keepsake (KEEPSAKES, the White Tuft, the Locket) still carried when the journey ends,
// by death or by its days running out, added after the steepening; the HUD's score leaves it out
// (`final`), so it only shows on the board.
SCORE.keepsake = 70;
const keepsakesKept = () => new Set(bag.filter(b => b && ITEMS[b.id]?.keepsake).map(b => b.id)).size;
// (`survived`: the journey's over and the character lasted all its days)
function journeyScore(survived = false, final = false) {
  const kinds = [...found].map(i => world.patches[i].kind).filter(Boolean), clearings = found.size - kinds.length;
  const { exp } = tally, floor = tally.floors.size, chests = tally.chests.size, d = tally.deepest;
  const sites = new Set(kinds).size * SCORE.site[0] + (kinds.length - new Set(kinds).size) * SCORE.site[1];
  const total = exp * SCORE.exp + tapered(clearings, SCORE.clearing) + sites + SCORE.floor * d * (d + 1) / 2 +
    tapered(chests, SCORE.chest) + tally.ghostPoints + tally.shrinePoints + SCORE.event * tally.events.size + tally.treePoints;
  const lasted = (dayNumber() >= 2 ? SCORE.perDay * dayNumber() : 0) + (survived ? SCORE.alive : 0);
  return { exp, sites: kinds.length, clearings, floor, chests, days: dayNumber(), score: Math.round(steepened(total * (1 + lasted))) +
    (final ? SCORE.keepsake * keepsakesKept() : 0) };
}
// When the last day's out, the journey ends, as dying ends it (see die()), with the score
function endJourney(at) {
  turns = DAY.days * DAY.turns - 1;   // (the last day's, still)
  die(at, { timeUp: true });
}
// Each turn also brings the skills cast a turn nearer to being ready again, and what they've
// cast on the character a turn nearer to wearing off; the log says when either happens.
// An Echo Stone's echo (see RELIC): the spell just cast, again, as the next turn's taken
let echo = null;
function echoTurn() {
  const e = echo;
  echo = null;
  if (!e || e.on !== map || dead || !relicOn("echo-stone")) return;
  say(tr("Your {item} rings.", { item: itemNoun("echo-stone", INK.name) }));
  SPELLS[e.skill.variant](e.skill, clock(), e.at && [e.at[0] - player.x, e.at[1] - player.y]);
}
// A Hungry Blade's hunger (see RELIC)
function hungerTurn() {
  if (!relicOn("hungry-blade") || turns % RELIC.hunger || stats.hp <= 1) return;
  if (foes.some(s => !s.dead && s.on === map && s.alert && fogDistance(s.x - player.x, s.y - player.y, CW, CH) <= RELIC.calm)) return;
  stats.hp--;
}
function turnTaken(now = clock()) {
  if (dead) return;
  echoTurn();
  if (++turns >= CLASS_PICK.turns && classOpen) { settleClass(); tellRun(); }
  if (sneakLeft > 0 && !--sneakLeft) say("You stop sneaking.");
  if (revealLeft > 0 && !--revealLeft) say("The echoes fade.");
  if (turns % REPLAY.checkEvery === 0) checkJourney();
  if (!gameMode) settleMode(dailyKey ? "daily" : "competitive");   // (the journey's begun: its mode's settled, see MODES)
  if (turns === 1) askTicket();      // (and the scoreboard's ticket asked for)
  if (turns === 1 && !chatJoins && !watching) { chatJoins = true; connectChat(); }   // (and on mektxt.com, the chat joined, see connectChat())
  if (turns % REGEN.every === 0 && stats.hp < maxHp()) stats.hp += 1;
  if (map === MAPS.outside) outsideAt = [player.x, player.y];
  zoneTurn();
  riteTurn();
  bushTurn();
  omenTurn();
  feastTurn(now);
  smithTurn();
  hungerTurn();
  pactTurn();
  nemesisTurn();
  if (turns >= DAY.days * DAY.turns) return endJourney(Math.max(clock(), nextBlowAt));
  if (dayTurn() === DAY.dusk) say("The sun is setting.");
  if (dayTurn() === DAY.night) nightfall();
  remnantsTurn();                  // (after nightfall's "Night falls.", so its dead rise after it)
  if (dayTurn() === 0) sunrise(clock());
  for (const [regenHp, regenTurns] of [hero().regen, graced && GRACE.regen].filter(Boolean))   // (a class's, and grace)
    if (turns % regenTurns === 0 && stats.hp < maxHp()) stats.hp = Math.min(maxHp(), stats.hp + regenHp);
  for (const slot of GEAR) {         // (and gear's: each heals 1 hp every `regen` turns, see items.js)
    const every = ITEMS[wearing(slot)]?.regen;
    if (every && turns % every === 0 && stats.hp < maxHp()) stats.hp++;
  }
  burnTurn();
  regrowTurn();
  for (const [id, left] of cooling) {
    if (left > 1) { cooling.set(id, left - 1); continue; }
    cooling.delete(id);
    say(tr("{spell} is ready again.", { spell: noun(SKILLS[id].name, INK.name) }));
  }
  for (let i = regens.length - 1; i >= 0; i--) {   // (see regenShares())
    const r = regens[i], n = Math.min(r.shares.shift(), maxHp() - stats.hp);
    if (n > 0) {
      stats.hp += n;
      pops.push({ runs: [[`+${n}`, INK.up]], x: player.x, y: player.y, t0: clock(), on: map, heal: true });
    }
    if (!r.shares.length) regens.splice(i, 1);
  }
  if (shield && --shield.turns <= 0) {
    say(tr("{spell} fades.", { spell: noun(shield.name, INK.name) }));
    shield = null;
  }
  for (let i = boosts.length - 1; i >= 0; i--) {
    if (--boosts[i].left > 0) continue;
    const [{ name, stats: st }] = boosts.splice(i, 1);
    if (boosts.some(b => b.name === name)) continue;   // (all of it, see boostsOf())
    // (a Cursed Barrier's slowness wears off while the barrier's still up)
    if (shield?.name === name) say(tr("{spell}'s {stats} loss wears off.", { spell: noun(name, INK.name), stats: Object.keys(st).map(k => tl(STAT_WORDS[k])).join(tl(" and ")) }));
    else say(tr("{spell} wears off.", { spell: noun(name, INK.name) }));
  }
}
// Now and then (`WHISPER.chance` a step) something equipped that whispers does, in the log
// ...and `words` of the time it murmurs one of WORDS instead
const WHISPER = { chance: 0.03, words: 0.1, lines: ["Your {item} whispers your name.", "Something in your {item} murmurs.",
  "You hear whispering from your {item}."], murmur: "Your {item} murmurs: \"{word}\"" };
// The words cursed gear murmurs. Said in the chat near a ghost (within `near` cell widths of
// her, or with her in sight), one gives her rest: she's gone, and where she stood a chest is
// there, with whatever a chest might hold. Each works once a journey.
const WORDS = { near: 8, list: ["supul sinac", "sotcra susru", "oel arehtnap", "abla otyt", "xaroc suvroc", "sepluv sepluv",
  "sullabac suuqe", "airaropmet anar", "soteasyrhc aliuqa"] };
const spoken = new Set();          // the words that have worked already (lower case)
function whisper() {
  const cursed = GEAR.map(wearing).filter(id => id && ITEMS[id].traits?.includes("whispers"));
  if (!cursed.length || Math.random() >= WHISPER.chance) return;
  const name = ITEMS[cursed[Math.floor(Math.random() * cursed.length)]].name;
  if (Math.random() < WHISPER.words) {
    const word = WORDS.list[Math.floor(Math.random() * WORDS.list.length)];   // (never translated: they're typed in as they are)
    return say(tr(WHISPER.murmur, { item: noun(name, INK.trait), word }));
  }
  say(tr(WHISPER.lines[Math.floor(Math.random() * WHISPER.lines.length)], { item: noun(name, INK.trait) }));
}
// A change to a map's own layout, made and noted (in worldLog outside, the map's `edits` in a room
// or a cave), so a save can make it again (see SAVE): ["gone", at] where a ghost stood is open
// ground again, ["chest", at, tile] a chest's left there
function reshape(m, edit) {
  const [what, [x, y], tile] = edit, k = key(x, y);
  if (m === MAPS.outside) worldLog.push(["edit", edit]);
  else if (!m.cave) (m.edits ??= []).push(edit);   // (a cave notes its own, see caveMap())
  if (what === "gone") return void (m === MAPS.outside ? blocked.delete(k) : m.clear?.(x, y));
  if (m === MAPS.outside) {
    const prop = { feet: y + 1, cells: [[x, y, tile]], base: [k] };
    props.splice(props.findIndex(p => p.feet > prop.feet) >>> 0, 0, prop);
    blocked.add(k);
    felled++;                      // (so sight looks again)
  } else if (m.cave) { m.edits.push(["chest", x, y]); m.cave.setTile(x, y, tile); m.cave.chests.push([x, y]); }
  else m.room.cells.push([x, y, tile]);
}
// A word said in the chat (see WORDS): the ghost nearest the character, if one's near enough,
// goes, and a chest is left where she stood
const laidToRest = new Set();      // ghosts gone, as `${map id} ${x},${y}`
const ghostsHere = () => (map === MAPS.outside ? outsideGhosts() : map.cave ? map.ghosts : map.room?.lady ? [map.room.lady] : [])
  .filter(([x, y]) => !laidToRest.has(`${map.id} ${x},${y}`));
function sayWord(text) {
  const word = WORDS.list.find(w => w.toLowerCase() === text.trim().toLowerCase());
  if (!word || spoken.has(word.toLowerCase()) || dead) return;
  const near = ghostsHere().filter(([x, y]) => (inSight(x, y) && fogStepAt(x - player.x, y - player.y) >= 0) ||
    fogDistance(x - player.x, y - player.y, CW, CH) <= WORDS.near)
    .sort(([ax, ay], [bx, by]) => fogDistance(ax - player.x, ay - player.y, CW, CH) - fogDistance(bx - player.x, by - player.y, CW, CH))[0];
  if (!near) return;
  spoken.add(word.toLowerCase());
  laidToRest.add(`${map.id} ${near[0]},${near[1]}`);
  lived("ghost");
  reshape(map, ["gone", near]);   // (where she stood is open ground again)
  const free = ([x, y]) => map.open(x, y) && !map.loot.has(key(x, y)) && !map.doors.has(key(x, y)) && !foeAt(x, y) &&
    !jackAt(x, y) && !(x === player.x && y === player.y);
  const at = [near, ...AROUND.map(([dx, dy]) => [near[0] + dx, near[1] + dy])].find(free);
  tell(tr("The ghost sighs, and is gone.", {}, INK.trait));
  wail();
  if (!at) return;
  const k = key(...at);
  map.loot.set(k, worse(chestLoot(lootBase(map, ...at), { odds: lootOdds("medium") })));   // (a medium fight's odds: Claude's pick)
  map.interactables.push(at);
  map.landmarks.add(k);
  reshape(map, ["chest", at, map === MAPS.outside ? SCENE.chest : SCENE.inside.chest]);
  creak();
  say("Where she stood, there's a chest.");
}
// A step one of the four ways (never diagonally: no one moves or strikes across a corner)
function step(dx, dy) {
  if (dx) player.facing = dx < 0 ? "left" : "right"; // turn even when the way is blocked
  player.heading = [dx, dy];
  const nx = player.x + dx, ny = player.y + dy;
  const now = clock();
  // a turn waits for the last one's blows to land, so a held key never gets ahead of the fight
  if (dead || now < nextBlowAt - FIGHT.gapMs) return;
  if (heldBack(now)) return;        // (frozen or paralysed by a monster's spell, see HOLD)
  if (random() < Math.max(hero().hiccup ?? 0, DAILY.hiccup)) {   // (a drunkard's, see CLASSES, or anyone's on an Alcoholic day, see DAILY)
    say("*Hic!* You lose your footing.");
    turnTaken(now);
    return skeletonTurn(now);
  }
  const door = map.doors.get(key(nx, ny));
  if (door) { turnTaken(now); return enter(door, now); }
  if (jackAt(nx, ny)) { if (now - jackSaid > JACK_SAYS_MS) { jackSaid = now; jackSays(jackAt(nx, ny)); } return; }
  if (smithAt(nx, ny)) { if (now - jackSaid > JACK_SAYS_MS) { jackSaid = now; meetSmith(smithAt(nx, ny)); } return; }
  if (priestAt(nx, ny)) { if (now - jackSaid > JACK_SAYS_MS) { jackSaid = now; meetPriest(priestAt(nx, ny)); } return; }
  if (shrineAt(nx, ny)) { if (now - jackSaid > JACK_SAYS_MS) { jackSaid = now; meetShrine(shrineAt(nx, ny)); } return; }   // (see SHRINE)
  // walking up into a tower's door climbs it (see LOOKOUT)
  const tower = dy < 0 && map === MAPS.outside && world.towers.find(t => t.door[0] === nx && t.door[1] === ny);
  if (tower) { enterTower(tower); return; }
  const speaker = churchSpeaker(nx, ny);
  if (speaker) { if (now - jackSaid > JACK_SAYS_MS) { jackSaid = now; churchSays(speaker); } return; }
  if (!map.open(nx, ny)) return hitTree(nx, ny, now);
  if (map.cave?.shut(nx, ny) && !foeAt(nx, ny)) {   // walking into a shut door opens it, a turn (see openDoor())
    openDoor(map, nx, ny);
    say("You open the door.");
    turnTaken(now);
    return skeletonTurn(now);
  }
  const foe = foeAt(nx, ny);
  if (foe && !(foe.charmed > 0)) {
    for (let i = 0; i < (hero().blows ?? 1) && !foe.dead; i++) attackSkeleton(foe, now);
    turnTaken(now);
    return skeletonTurn(now);
  }
  const ally = yigAt(nx, ny) ?? foe;   // a Yig (or a charmed monster) in the way swaps places with the character
  if (ally) moveFoe(now, ally, [player.x, player.y]);
  const from = visualPos(now); // start from wherever it's drawn, so held keys never jump
  Object.assign(anim, { t0: now, fromX: from.x, fromY: from.y });
  if (gear("embers")) fires.set(key(player.x, player.y), { t0: now, on: map, ember: true });   // (see EMBERS)
  player.x = nx; player.y = ny;
  walked++;
  footstep();
  turnTaken(now);
  whisper();
  skeletonTurn(now);
  noticeClearings();
}

// With a pickaxe carried, walking into the cave's dirt digs at it instead
function digAt(x, y, now) {
  if (tools.digs && map.cave.crystals.has(key(x, y))) return mineCrystal(x, y, now);
  if (!tools.digs || !map.cave.diggable(x, y) || now - shake.t0 < CHOP.gapMs) return;
  const k = key(x, y), [, done] = toolWork(map.dug, k, "digs", map.cave.hardness(x, y));
  if (done) { map.cave.dig(x, y); felled++; say("You dig through."); }
  shake = { k: done ? null : k, t0: now };
  dig(done);
  turnTaken();
  const item = done && findAt(x, y);
  if (item) {
    dropAt(x, y, item);
    foundSound(item, lootBase(map, x, y));
    say(tr("Something turns up in the dirt: {item:a}.", { item: thingNoun(item, INK.name) }));
  }
  skeletonTurn(now);
}
// CRYSTAL: a pickaxe mines the cave's crystals too (cave.js CRYSTALS), `hardness` times as hard as
// dirt, as rock is; the last blow shatters it, leaving bare floor, and what a felled tree might
// leave (FIND), and on top of that `spell` of the time a spell of tier I to IV, each as likely
// (2026-10-12: the user's 1%, and tiers; the hardness Claude's). It only shakes as it's worked at: a crystal
// has no cracked looks (those are the dirt's, see drawCave())
const CRYSTAL = { hardness: 3, spell: 0.01 };
function mineCrystal(x, y, now) {
  if (now - shake.t0 < CHOP.gapMs) return;
  const k = key(x, y), [, done] = toolWork(map.mined ??= new Map(), k, "digs", CRYSTAL.hardness);
  if (done) { map.cave.mine(x, y); felled++; say("The crystal shatters."); }
  shake = { k: done ? null : k, t0: now };
  crystalHit(done);
  turnTaken();
  if (done) {
    const shards = [findAt(x, y), random() < CRYSTAL.spell && rollSkill(1 + Math.floor(random() * 4), true)].filter(Boolean);
    for (const item of shards) {
      dropAt(x, y, item);
      say(tr("Something glints among the shards: {item:a}.", { item: thingNoun(item, INK.name) }));
    }
    const base = lootBase(map, x, y);   // (the rarest of them's heard)
    if (shards.length) foundSound(shards.reduce((a, b) => (rarity(b, base) > rarity(a, base) ? b : a)), base);
  }
  skeletonTurn(now);
}
// With an axe carried, walking into a forest tree swings at it instead
function hitTree(x, y, now) {
  if (map.cave) return digAt(x, y, now);
  if (map !== MAPS.outside || !tools.fells || treeAt(x, y) === null) return;
  if (now - shake.t0 < CHOP.gapMs) return;
  // (a tree shows its hits in CHOP.hits - 1 looks, and one a lumberjack has been at keeps those)
  const k = key(x, y), [work, done] = toolWork(chopped, k, "fells");
  const n = done ? CHOP.hits : Math.max(hits.get(k) || 0, workStage(work, CHOP.hits - 1));
  hits.set(k, n);
  if (n === CHOP.hits) { felled++; fell(k); treeFelled(k, x, y); say("The tree falls."); }
  shake = { k: n < CHOP.hits ? k : null, t0: now };
  chop(n === CHOP.hits);
  turnTaken();
  const item = n === CHOP.hits && findAt(x, y);
  if (item) {
    dropAt(x, y, item);
    foundSound(item, lootBase(map, x, y));
    say(tr("Something falls out of the tree: {item:a}.", { item: thingNoun(item, INK.name) }));
  }
  skeletonTurn(now);
  noticeClearings();
}

// Leaves an item on the ground at x, y, to be picked up with F: on top of whatever's lying there
// already (a pile, see PICKUP), so nothing's ever lost under it
function dropAt(x, y, item, on = map) {
  item = worse(item);
  const k = key(x, y), pile = on.drops.get(k);
  if (pile) pile.push(item);
  else {
    on.drops.set(k, [item]);
    on.interactables.push([x, y]);
  }
  on.loot.set(k, item);
}
// Takes the i-th item off the pile at cell k (and the pile with it, once it's the last)
function takeFromPile(k, i) {
  const pile = map.drops.get(k);
  pile.splice(i, 1);
  if (pile.length) return void map.loot.set(k, pile.at(-1));
  map.drops.delete(k);
  map.loot.delete(k);
}

// The first time the heart of a hidden clearing (its shed, or its middle) comes into sight,
// the log says so, or what a rare site (world.js SITES) has in its place
const found = new Set();
const FOUND = { church: "You come upon a church in a great clearing.",
  graveyard: [["You come upon a graveyard. Something stirs among the graves.", INK.down]],
  bandits: [["You come upon a bandits' hideout. Someone's keeping watch.", INK.down]],
  ring: [["You come upon a ring of grass, a red altar at its heart.", INK.down]],
  // (the village's and the bush's: Claude's words, 2026-10-12, Tiffany's notes leaving them to come)
  village: "You come upon a few small houses in a clearing.",
  bush: [["You come upon a tree that burns, yet is not burnt.", BUSH.ink]],
  remnants: "You come upon a battlefield." };
function noticeClearings() {
  lakeHomeTurn();
  noticeShrines();
  if (map !== MAPS.outside) return;
  if (lakeHome && lakeHome.told !== lakeHome.now && inSight(...lakeHome.p.heart)) {   // (the first lake: what's there, see LAKE_HOME)
    lakeHome.told = lakeHome.now;
    found.add(world.patches.indexOf(lakeHome.p));
    tell(LAKE_HOME.seen[lakeHome.now]);
  }
  world.patches.forEach((p, i) => {
    if (found.has(i) || !inSight(...p.heart)) return;
    found.add(i);
    say(FOUND[p.kind] ?? "You find a clearing hidden in the trees.");
    lived(p.kind);   // (the graveyard's, the hideout's, the battlefield's thoughts, see THOUGHTS)
    if (p.racks) tell(REMNANTS.lines[p.line]);
  });
}

// Remnants of a battle (.TIFF's codex battle-remnants, world.js REMNANTS): warriors of the tradition
// who fell together, and left no foe among them. Coming within `hear` cell widths, the log says
// `near`, once; the first sight of it, "You come upon a battlefield." and one of `lines`. Its blood
// stays for good (`MAPS.outside.oldBlood`, never pushed off by a fight's), and gear lies there
// (a weapon or armour of its biome's tier, its affix rolled as any find's: the user's, 2026-10-19). Every night the character's within `hear`, `rise`
// (min..max) of the dead get up from it: zombies in forest-1, skeletons further in, crumbling at
// dawn like the rest, and the log says `stir`. The words Claude's, picked by .TIFF; numbers Claude's.
const REMNANTS = { hear: 14, rise: [2, 4], near: "The air smells of old iron.", stir: [["The bones begin to stir.", INK.down]],
  lines: ["Broken blades, split shields, bones. Whoever fought here lost.", "Whatever they fought, it isn't among the dead.",
    "They all fell facing the same way: deeper in."] };
function wakeRemnants(p) {
  const M = MAPS.outside, blood = (M.oldBlood ??= []);
  for (const [x, y, ink, size] of p.blood) blood.push({ x, y, ink: BLOOD.inks[ink], size, from: [x, y], t0: -Infinity });
  for (const [x, y] of p.finds) {
    const v = variantOf(random() < 0.5 ? "weapon" : "armour", biomeTier(x, y));
    dropAt(x, y, roll(v), M);
  }
}
function remnantsTurn() {
  if (map !== MAPS.outside) return;
  const night = dayTurn() >= DAY.night;
  for (const p of world.patches.slice(0, patchesSeen)) {
    if (!p.racks) continue;
    const [hx, hy] = p.heart, near = fogDistance(player.x - hx, player.y - hy, CW, CH) <= REMNANTS.hear;
    if (!near) continue;
    if (!p.smelt) { p.smelt = true; tell(REMNANTS.near); }
    if (!night || p.rose === dayNumber()) continue;
    p.rose = dayNumber();
    const spots = p.cells.filter(([x, y]) => canRise(x, y) && !(x === player.x && y === player.y));
    let n = REMNANTS.rise[0] + Math.floor(random() * (REMNANTS.rise[1] - REMNANTS.rise[0] + 1));
    for (; n > 0 && spots.length; n--) {
      const at = spots.splice(Math.floor(random() * spots.length), 1)[0];
      addFoe(world.biomeAt(...at) === 0 ? "zombie" : "skeleton", at);
      foes.at(-1).risen = true;
    }
    tell(REMNANTS.stir);
  }
}

// The fairy ring's rite (world.js SITES, Figma "event", 359:59136): the first time the
// character comes up beside its altar (any of the cells round it), the rite starts, and a
// countdown of `turns` stands over their head (see drawRiteCount()). `waves` rise from the ring,
// each [the turn of the rite it comes, slimes, horned slimes], already after the character;
// they come up on the ring's grass, as far from the character as there's room, or anywhere in
// the opening if the ring's full. Leaving the opening breaks the rite: nothing more comes, and
// nothing's left. Holding out till the count's run out leaves `chests` (min..max) blue chests by
// the altar, each with a spell of tier I, II or III, as likely (the slimes still about stay).
// Once a ring. (Claude's numbers, 2026-10-06: 27 in all, near one a turn, as a slime dies to about
// a blow; harder further out and later on, as every monster is, see MONSTER_DAYS and MONSTER_FAR.)
const RITE = { turns: 30, waves: [[0, 3, 0], [5, 4, 0], [10, 3, 1], [15, 3, 2], [20, 2, 3], [25, 2, 4]], chests: [1, 3], near: 3,
  ink: INK.down, bg: "#222034", sizePx: 2, pad: 3, gap: 2 };
let rite = null;                   // { site, t (turns since it started), cells (the opening's, by key) } while one's on
const riteLeft = () => (rite ? RITE.turns - rite.t : 0);
function riteTurn() {
  if (map !== MAPS.outside) return;
  if (!rite) {
    const site = world.patches.find(p => p.kind === "ring" && !p.rited &&
      p.altar.some(([x, y]) => Math.max(Math.abs(x - player.x), Math.abs(y - player.y)) === 1));
    if (!site) return;
    site.rited = true;
    rite = { site, t: 0, cells: new Set(site.cells.map(c => key(...c))) };
    used("rite");
    say([["The altar drinks the light. The ring stirs...", INK.down]]);
  } else if (!rite.cells.has(key(player.x, player.y))) {
    say([["You leave the ring, and the rite is broken.", INK.same]]);
    rite = null;
    lived("riteLeft");
    return;
  } else if (++rite.t >= RITE.turns) return riteDone();
  for (const [at, slimes, horned] of RITE.waves) if (at === rite.t) riseWave(slimes, horned);
}
function riseWave(slimes, horned) {
  const now = clock(), from = ([x, y]) => fogDistance(x - player.x, y - player.y, CW, CH);
  const free = cells => cells.filter(c => foeCanStand(...c) && !MAPS.outside.loot.has(key(...c)))
    .map(c => [c, from(c) + random() * 2]).sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const spots = [...free(rite.site.ring), ...free(rite.site.cells.filter(c => from(c) >= 3))];
  const kinds = [...Array(horned).fill("hornedSlime"), ...Array(slimes).fill("slime")];
  let n = 0;
  for (const kind of kinds) {
    const at = spots.shift();
    if (!at) break;
    addFoe(kind, at);
    Object.assign(foes.at(-1), { alert: true, spotted: true, alertT0: now, alertLeft: ENEMY.alertTurns });
    n++;
  }
  if (n) say([[rite.t ? "More slimes rise from the ring!" : "Slimes rise from the ring!", INK.down]]);
}
function riteDone() {
  const { site } = rite, [ax, ay] = site.altar[0];
  rite = null;
  lived("riteDone");
  achieved("riteDone");
  const free = ([x, y]) => MAPS.outside.open(x, y) && !MAPS.outside.loot.has(key(x, y)) && !foeAt(x, y) && !jackAt(x, y) &&
    !(x === player.x && y === player.y);
  const near = shuffled(site.cells.filter(([x, y]) => Math.max(Math.min(Math.abs(x - ax), Math.abs(x - ax - 1)), Math.abs(y - ay)) <= RITE.near && free([x, y])));
  const n = RITE.chests[0] + Math.floor(random() * (RITE.chests[1] - RITE.chests[0] + 1));
  for (const at of near.slice(0, n)) {
    const k = key(...at);
    MAPS.outside.loot.set(k, worse(rollSkill(1 + Math.floor(random() * 3))));
    MAPS.outside.interactables.push(at);
    MAPS.outside.landmarks.add(k);
    reshape(MAPS.outside, ["chest", at, SCENE.fairyRing.chest]);
  }
  say([["The ring falls quiet. Something waits by the altar.", INK.up]]);
  creak();
}
// The rite's count over the character's head (see RITE), over the cursor: the turns it has left
function drawRiteCount(cx, top) {
  if (!rite || lookout || dead || map !== MAPS.outside) return;
  const u = Math.max(1, Math.round(NOTICE.zoom * uiScale)), f = Math.max(1, Math.round(NOTICE.smallPx * u * RITE.sizePx));
  const runs = [[String(riteLeft()), RITE.ink]], pad = Math.round(RITE.pad * u);
  const w = sansWidth(runs) * f - f + 2 * pad, h = SANS.cap * f + 2 * pad;   // (MEK Sans, less its last letter's gap)
  const x = Math.round(cx - w / 2), y = Math.round(top - Math.round(RITE.gap * u) - h);
  ctx.fillStyle = RITE.bg;
  ctx.fillRect(x, y, w, h);
  drawSans(ctx, runs, x + pad, y + pad, f);
}

// The enemies' turn: each of the character's turns gives each its spd in energy, and it acts
// once for every whole character's spd of it, the rest carrying over. So twice the character's
// spd is two actions a turn, and 10 against 9 is an extra one every ninth turn.
function skeletonTurn(now) {
  jackTurn(now);
  villageTurn(now);
  priestTurn(now);
  yigTurn(now);
  orbTurn(now);
  const pace = Math.max(1, stat("spd"));
  for (const s of foes) {
    if (s.dead || s.on !== map) continue;
    if (s.burn > 0) {              // on fire (see BURN)
      s.burn--;
      wound(s, s.burnDmg, now, "", english("The fire burns"), true);
      if (s.dead) continue;
      if (!s.burn) say(tl("{foe:The} stops burning.", { foe: noun(s.called) }), nextBlowAt - FIGHT.gapMs);
    }
    // spotted once it's plainly seen: in sight and drawn whole, before the fog's dither starts
    const clear = inSight(s.x, s.y) && fogStepAt(s.x - player.x, s.y - player.y) < DITHER_STEP;
    if (!s.spotted && clear) { s.spotted = true; (s.kind === "fuzhu" && !fuzhuSeen++ ? tell(FUZHU_SAYS.first) : say(tl("You spot {foe:a}.", { foe: noun(s.called) }))); }
    if (s.alertLeft > 0) s.alertLeft--;
    if (s.cooling > 0) s.cooling--;
    s.boosts = s.boosts.filter(b => --b.left > 0);
    if (s.regen.length) {          // (its Regeneration, see FOE_SPELLS)
      const n = Math.min(s.regen.shift(), s.fullHp - s.hp);
      if (n > 0) { s.hp += n; pops.push({ runs: [[`+${n}`, INK.up]], x: s.x, y: s.y, t0: Math.max(now, nextBlowAt), on: map, heal: true }); }
    }
    if (s.still) continue;         // (one of a church's people, see FAITHFUL)
    if (s.frozen > 0) {            // frozen: no turn at all (see HELD)
      if (!--s.frozen && inSight(s.x, s.y)) say(tl("{foe:The} thaws out.", { foe: noun(s.called) }), nextBlowAt - FIGHT.gapMs);
      continue;
    }
    if (s.paralysed > 0) {         // paralysed: a turn lost now and then
      const lost = random() < HELD.paralysedLoses;
      if (!--s.paralysed && inSight(s.x, s.y)) say(tl("{foe:The} can move freely again.", { foe: noun(s.called) }), nextBlowAt - FIGHT.gapMs);
      if (lost) continue;
    }
    if (s.day && isNight()) continue;   // (one that only stirs by day sleeps through the night)
    if (s.scared > 0 && !(s.charmed > 0)) {   // (see SCARED)
      for (s.energy += foeStat(s, "spd"); s.energy >= pace && !s.dead; s.energy -= pace) runFrom(now, s);
      if (!--s.scared && !s.dead) {
        s.fleeing = false;
        if (inSight(s.x, s.y)) say(tl("{foe:The} gathers its courage.", { foe: noun(s.called) }), nextBlowAt - FIGHT.gapMs);
      }
      continue;
    }
    if (s.evasive && !(s.charmed > 0)) {   // (see EVADE)
      for (s.energy += foeStat(s, "spd"); s.energy >= pace && !s.dead; s.energy -= pace) evade(now, s);
      continue;
    }
    if (s.raises && s.alert) lichRaises(now, s);   // (see LICH)
    if (s.charmed > 0) {           // fighting for the character (see CHARM)
      for (s.energy += foeStat(s, "spd"); s.energy >= pace && !s.dead; s.energy -= pace) charmedAct(now, s);
      if (--s.charmed || s.dead) continue;
      Object.assign(s, { alert: true, alertT0: now, alertLeft: ENEMY.alertTurns });
      if (inSight(s.x, s.y)) say(tr("{foe:The} shakes off your charm!", { foe: noun(s.called) }, INK.down), nextBlowAt - FIGHT.gapMs);
      continue;
    }
    if (s.wanders && !s.alert) {
      if (fogDistance(player.x - s.x, player.y - s.y, CW, CH) > ENT.awake) continue;
      for (s.energy += foeStat(s, "spd"); s.energy >= pace; s.energy -= pace) wander(now, s);
      continue;
    }
    if (s.digs && !s.alert) {     // (an aggressive worm left alone tunnels about as the earthworm does, see WORM)
      if (fogDistance(player.x - s.x, player.y - s.y, CW, CH) > ENT.awake) continue;
      for (s.energy += foeStat(s, "spd"); s.energy >= pace; s.energy -= pace) { skeletonAct(now, s); if (!s.alert) wander(now, s); }
      continue;
    }
    if (s.burrows && fogDistance(player.x - s.x, player.y - s.y, CW, CH) >= KING.near) {
      if (++s.stalked % KING.stalkEvery === 0) skeletonAct(now, s);
      continue;
    }
    if (hunting(s) && fogDistance(player.x - s.x, player.y - s.y, CW, CH) >= DEMON.near) {
      if (++s.stalked % DEMON.stalkEvery === 0) skeletonAct(now, s);
      continue;
    }
    for (s.energy += foeStat(s, "spd"); s.energy >= pace; s.energy -= pace) skeletonAct(now, s);
  }
}
// EVADE: an `evasive` monster (the fuzhu; a villager, once hurt) keeps away from the character:
// once they're within `near` steps of it, and it can see them, it runs, the "!" over its head all the
// while, to whichever cell beside it is furthest from them, fighting only when cornered next to
// them; otherwise it wanders about as an ent does (see ENT), though only over open ground
const EVADE = { near: 3 };
// The fuzhu (fragments of the child's soul, LORE.md; .TIFF's codex fuzhu-soul, 2026-10-19): the first
// seen in a journey is `first`, not "You spot a fuzhu."; running, now and then (`bolt` of its steps
// in sight, never within `boltGap` turns of the last time) `bolts`; killed, after its own line, `quiet`.
// The words Claude's, picked by .TIFF; how often Claude's pick
const FUZHU_SAYS = { first: "A white deer watches you from the trees. It looks young.", bolts: "It bolts, stops, and looks back at you.",
  bolt: 0.2, boltGap: 20, quiet: "The forest goes very quiet." };
let fuzhuSeen = 0, fuzhuBolted = -Infinity;
function evade(now, s) {
  const close = Math.abs(player.x - s.x) + Math.abs(player.y - s.y) <= EVADE.near && inSight(s.x, s.y);
  if (!close) { s.fleeing = false; return wander(now, s); }
  if (!s.fleeing) {
    if (!s.spotted && s.kind === "fuzhu" && !fuzhuSeen++) tell(FUZHU_SAYS.first);   // (seen first as it runs)
    if (!s.fled) say(tr("{foe:The} flees from you!", { foe: noun(s.called) }, INK.down));   // (the first time only)
    Object.assign(s, { fleeing: true, fled: true, alert: true, spotted: true });
  }
  runFrom(now, s);
  if (s.kind === "fuzhu" && turns - fuzhuBolted >= FUZHU_SAYS.boltGap && inSight(s.x, s.y) && random() < FUZHU_SAYS.bolt) {
    fuzhuBolted = turns;
    tell(FUZHU_SAYS.bolts);
  }
}
// One step to whichever cell beside `s` is furthest from the character, or a blow at them if it's cornered beside them
function runFrom(now, s) {
  const far = ([x, y]) => fogDistance(player.x - x, player.y - y, CW, CH), d = far([s.x, s.y]);
  const away = NEIGHBOURS.map(([dx, dy]) => [s.x + dx, s.y + dy]).filter(c => foeCanStand(...c) && far(c) > d)
    .sort((a, b) => far(b) - far(a))[0];
  if (away) return void moveFoe(now, s, away);
  if (beside(player, s)) attackPlayer(s, now);
}
// LICH: while it's after the character, every `raiseEvery` turns the lich raises `raises`
// skeletons (min..max) on the open cells round it, each after them at once
function lichRaises(now, s) {
  if ((s.raiseIn = (s.raiseIn ?? s.raiseEvery) - 1) > 0) return;
  s.raiseIn = s.raiseEvery;
  const cells = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
    if ((dx || dy) && foeCanStand(s.x + dx, s.y + dy) && !(s.x + dx === player.x && s.y + dy === player.y)) cells.push([s.x + dx, s.y + dy]);
  const n = s.raises[0] + Math.floor(random() * (s.raises[1] - s.raises[0] + 1)), at = Math.max(now, nextBlowAt);
  for (const c of shuffled(cells).slice(0, n)) {
    addFoe("skeleton", c, s.on);
    Object.assign(foes.at(-1), { alert: true, spotted: true, alertT0: now, alertLeft: ENEMY.alertTurns, risen: true });
  }
  if (inSight(s.x, s.y)) say(tr("{foe:The} raises the dead!", { foe: noun(s.called) }, INK.down), at);
}
// A monster's stat, with what its spell's boosts add while they last
const foeStat = (s, k) => {
  const n = s[k] + s.boosts.reduce((sum, b) => sum + (b.stats[k] ?? 0), 0);
  return k === "spd" && chilled(s) ? Math.max(CHILL.least, n - CHILL.spd) : n;
};
// A Glacier Medallion's slow aura (items.js `chill`): a monster within `radius` cells of the
// character (every way, corners too) has `spd` less, though never under `least`, so it still
// gets a turn now and then (the floor is Claude's pick, 2026-10-11)
const CHILL = { radius: 2, spd: 2, least: 1 };
const chilled = s => !!gear("chill") && s.on === map && !(s.charmed > 0) &&
  Math.max(Math.abs(s.x - player.x), Math.abs(s.y - player.y)) <= CHILL.radius;

// One action: notice the character, give up once they're out of sight, attack them when
// they're next to it, or take a step along the shortest way to them. It faces the character,
// or the way it's walking when that's sideways. The demon only ever hunts.
function skeletonAct(now, s) {
  if (s.risen && !s.ghostGear && !s.provoked && relicOn("bone-flute")) return;   // (see RELIC)
  if (feastOf(s) && !feastOf(s).roused) return;   // (busy eating, facing the table, see FEAST)
  const d = fogDistance(player.x - s.x, player.y - s.y, CW, CH);
  if (player.x !== s.x) s.facing = player.x < s.x ? "left" : "right";
  if (s.burrows) return burrow(now, s, d);
  if (hunting(s)) return hunt(now, s, d);
  if (s.hunts) return standGround(now, s, d);
  if (!s.alert) {
    if (!sneakLeft && d < s.aggro * (map.aggro ?? 1) && inSight(s.x, s.y)) {
      Object.assign(s, { alert: true, alertT0: now, alertLeft: ENEMY.alertTurns });
      say(tl("{foe:The} notices you!", { foe: noun(s.called) }));
      rouseBand(s, now);
    }
    return;
  }
  if (d >= s.forget) {      // lost them: spotting it again is news again
    Object.assign(s, { alert: false, spotted: false });
    say(tl("{foe:The} loses track of you.", { foe: noun(s.called) }));
    return;
  }
  if (s.spell && foeCasts(now, s)) return;
  // (one that keeps away, while its spell cools down, backs off when the character's close)
  if (s.keepsAway && s.cooling > 0 && Math.abs(player.x - s.x) + Math.abs(player.y - s.y) < s.keepsAway) {
    const far = ([x, y]) => fogDistance(player.x - x, player.y - y, CW, CH);
    const back = NEIGHBOURS.map(([dx, dy]) => [s.x + dx, s.y + dy]).filter(c => foeCanStand(...c) && far(c) > d)
      .sort((a, b) => far(b) - far(a))[0];
    if (back) return void moveFoe(now, s, back);
  }
  if (beside(player, s)) return attackPlayer(s, now);
  const ally = yigBeside(s);       // (a Yig next to it gets hit rather than walked past, and a charmed monster)
  if (ally) return attackYig(s, ally, now);
  const thrall = foes.find(t => t.charmed > 0 && !t.dead && t.on === map && beside(t, s));
  if (thrall) return hitCharmed(s, thrall, now);
  // (a worm comes the open way when there is one, and otherwise digs straight for them, see WORM)
  if (s.digs && map.cave) {
    const boring = s.boring && wormFits(s, s.boring) ? s.boring : null;   // (what it's half dug, it finishes)
    const step = chaseStep(s), next = boring ?? (step && wormFits(s, step) ? step : digTowards(s));
    if (next) wormStep(now, s, next);
    return;
  }
  // (one that goes through the trees heads straight for them when they're too far to find a way to)
  if (moveFoe(now, s, chaseStep(s, !!s.fells) ?? (s.fells ? towards(s) : null)) && trample(s) && s.rank === "miniboss") treesFall(s, d);
}
// WORM: the cave's worms (`digs`) go through the dirt as well as the open, digging it out as they
// go, a tunnel behind them: the earthworm wanders about as an ent does and never minds the
// character till it's hit (passive); the sand and stone worms do the same till they notice them,
// then come on, the open way if there is one, otherwise straight through the dirt (aggressive). A
// stone room's walls stop them, as they stop a pickaxe. Within `hear` cell widths the digging's
// heard, and the log says so the first time on each floor (2026-10-12, the user's ask; numbers Claude's)
// v0.13 (the user's, 2026-10-25): a cell of dirt takes a worm `turns` of its turns to dig out
// (cracking as a pickaxe cracks it, map.dug), and it keeps at it till it's through (`boring`), so
// its tunnels run straighter. And a `long` one (the stone worm, Figma 884:83991) is two cells, its
// head and its tail behind it (tailOf(), SCENE.stonewormTail): side by side always, so going up or
// down it digs both cells of the row it goes into, and going back the way it came it turns round
// where it is. Its tail's hit as it is (foeAt()), and stands in the way as it does.
const WORM = { hear: 20, turns: 4 };
const digsAt = (s, x, y) => !!s.digs && !!map.cave?.diggable(x, y) && !map.keepClear.has(key(x, y));
// (where a long one's tail is, facing `facing` with its head at x, y)
const tailOf = (s, x = s.x, y = s.y, facing = s.facing) => s.long ? [x + (facing === "left" ? 1 : -1), y] : null;
// ...the cells it'd be in, its head stepping to `next` (the way it'd face then, as moveFoe() turns it)
const wormBody = (s, [x, y]) => {
  const facing = x === s.x ? s.facing : x < s.x ? "left" : "right", tail = tailOf(s, x, y, facing);
  return tail ? [[x, y], tail] : [[x, y]];
};
// ...whether its head can step to `next`: each cell of it then open (or its own already), or dirt it can dig
const wormFits = (s, next) => wormBody(s, next).every(([x, y]) =>
  (foeAt(x, y) === s ? map.open(x, y) : foeCanStand(x, y)) || digsAt(s, x, y));
// Its step to `next`: a turn more of digging what's dirt of where it's going, and once that's
// all dug out, the step; whether it's still digging
function wormStep(now, s, next) {
  if (!wormFits(s, next)) return false;
  const dirt = wormBody(s, next).filter(([x, y]) => digsAt(s, x, y));
  if (dirt.length) {
    let through = true;
    for (const [x, y] of dirt) {
      const k = key(x, y), n = Math.round((map.dug.get(k) ?? 0) * WORM.turns) + 1;
      if (n >= WORM.turns) digThrough(s, [x, y]);
      else { map.dug.set(k, n / WORM.turns); heardDigging(x, y); through = false; }
    }
    if (!through) { s.boring = next; return true; }
  }
  s.boring = null;
  moveFoe(now, s, next);
  return false;
}
function digThrough(s, [x, y]) {
  if (!digsAt(s, x, y)) return false;
  map.cave.dig(x, y);
  felled++;                        // (so sight looks again)
  heardDigging(x, y);
  return true;
}
function heardDigging(x, y) {
  if (fogDistance(player.x - x, player.y - y, CW, CH) >= WORM.hear) return;
  chop(true);
  if (!map.wormHeard) {
    map.wormHeard = true;
    if (!inSight(x, y)) say("Somewhere in the dark, something is tunnelling.");
  }
}
// ...its step straight for the character, through the open or the dirt
function digTowards(s) {
  const dx = Math.sign(player.x - s.x), dy = Math.sign(player.y - s.y), left = ([x, y]) => fogDistance(player.x - x, player.y - y, CW, CH);
  return [[s.x + dx, s.y], [s.x, s.y + dy]]
    .filter(([x, y]) => (x !== s.x || y !== s.y) && wormFits(s, [x, y])).sort((a, b) => left(a) - left(b))[0] ?? null;
}

// Whether a monster hunts the character: the demon and the iron hound do while the character's in
// their own zone (see HUNTERS), and with a cursed resonator worn ("hunted", items.js) every miniboss does
const hunting = s => (s.hunts && (HUNTERS[s.kind] ?? zone) === zone) || (s.rank === "miniboss" && !!gear("hunted")) ||
  (!!s.nemesis && s.on === MAPS.outside && map === MAPS.outside && world.biomeAt(player.x, player.y) === s.nemesisBiome);   // (see NEMESIS)
// The demon's action (see DEMON): attack the character next to it, or come on, the shortest
// way once it's close, otherwise straight at them, felling any tree where it steps
function hunt(now, s, d) {
  if (!s.near && d < DEMON.near) {
    s.near = true;
    say(tr("{foe:The} has found you!", { foe: noun(s.called) }, INK.down));
  }
  if (beside(player, s)) return attackPlayer(s, now);
  const ally = yigBeside(s);
  if (ally) return attackYig(s, ally, now);
  // (one that hunts only for a cursed resonator keeps to the open, the shortest way it can find)
  const step = s.hunts || s.nemesis ? chaseStep(s, true) ?? crossingStep(s) ?? towards(s) : chaseStep(s);
  if (moveFoe(now, s, step) && trample(s)) treesFall(s, d);
}
// A miniboss's felling (the demon's, the golem's, the iron hound's), `d` cells off: heard within
// DEMON.hear, and the log says so the first time
function treesFall(s, d) {
  if (d >= DEMON.hear) return;
  chop(true);
  if (!s.heard) {
    s.heard = true;
    say("Somewhere in the forest, trees are falling.");
  }
}

// A hunter out of its zone (see HUNTERS) stays where it is, unless the character comes within
// `near` cells of it where it can see them: then it fights as any monster does
function standGround(now, s, d) {
  s.near = false;
  if (beside(player, s)) return attackPlayer(s, now);
  if (d >= HUNTERS.near || !inSight(s.x, s.y)) return;
  const ally = yigBeside(s);
  if (ally) return attackYig(s, ally, now);
  if (moveFoe(now, s, chaseStep(s, !!s.fells)) && trample(s)) treesFall(s, d);
}

// The goblin king's action (see KING): attack the character next to him, or come on, the
// shortest way through the open once he's close, otherwise straight at them, digging out the
// dirt in his way as he goes (the walls of a stone room stop him)
function burrow(now, s, d) {
  if (!s.near && d < KING.near) {
    s.near = true;
    say(tr("{foe:The} has found you!", { foe: noun(s.called) }, INK.down));
  }
  if (beside(player, s)) return attackPlayer(s, now);
  const ally = yigBeside(s);
  if (ally) return attackYig(s, ally, now);
  const cave = map.cave, through = ([x, y]) => (map.open(x, y) || !!cave?.diggable(x, y)) && !map.keepClear.has(key(x, y)) &&
    !foeAt(x, y) && !yigAt(x, y) && !(x === player.x && y === player.y);
  const dx = Math.sign(player.x - s.x), dy = Math.sign(player.y - s.y), left = ([x, y]) => fogDistance(player.x - x, player.y - y, CW, CH);
  const next = (d < KING.near ? chaseStep(s) : null) ?? [[s.x + dx, s.y], [s.x, s.y + dy]]
    .filter(c => (c[0] !== s.x || c[1] !== s.y) && through(c)).sort((a, b) => left(a) - left(b))[0];
  if (!next) return;
  const dug = !!cave?.diggable(...next);   // (out of a cave, as "?foe=goblinKing" has him, there's nothing to dig)
  if (dug) { cave.dig(...next); felled++; }
  moveFoe(now, s, next);
  if (!dug || d >= KING.hear) return;
  chop(true);
  if (!s.heard) {
    s.heard = true;
    say("Somewhere in the dark, something is digging.");
  }
}

// The demon's step toward the crossing that makes the shortest way round (see DEMON), when
// the river's between it and the character (or they're on a crossing it isn't): onto the
// crossing from the bank, or along the bank to it, backing off the water where the bank
// bulges in its way. Null when there's no river between them.
function crossingStep(s) {
  const river = world.river.near(s.x, s.y);   // the river nearest it: the next one it would come to
  const me = river.side(s.x, s.y), them = river.side(player.x, player.y);
  if (me === 0 || me === them) return null;
  const a = river.along(s.x, s.y), b = river.along(player.x, player.y);
  const way = them === 0 ? river.crossingAt(player.x, player.y)
    : river.crossings(Math.min(a, b) - DEMON.reach, Math.max(a, b) + DEMON.reach)
      .sort((p, q) => Math.abs(a - p.t) + Math.abs(p.t - b) - Math.abs(a - q.t) - Math.abs(q.t - b))[0];
  if (!way) return null;
  const [lx, ly] = way.ends[me];
  if (s.x === lx && s.y === ly)    // on the bank at its end: step on
    return foeCanStand(...way.onto[me], true) ? way.onto[me] : null;
  const back = river.away(s.x, s.y, me);
  return towards(s, [lx, ly]) ?? (foeCanStand(...back, true) ? back : null);
}

// An ent's step while it's left alone (see ENT); one that keeps away (EVADE) wanders the same way,
// but only over open ground, never through the trees
function wander(now, s) {
  const gx = s.home[0] - s.x, gy = s.home[1] - s.y;
  const free = ([dx, dy]) => s.digs ? wormFits(s, [s.x + dx, s.y + dy]) : foeCanStand(s.x + dx, s.y + dy, !s.evasive);   // (a worm digs, see WORM)
  if (s.digs && s.boring && free([s.boring[0] - s.x, s.boring[1] - s.y])) return void wormStep(now, s, s.boring);   // (finishing what it's begun)
  if (fogDistance(gx, gy, CW, CH) > ENT.roam)
    s.heading = Math.abs(gx) > Math.abs(gy) * CH / CW ? [Math.sign(gx), 0] : [0, Math.sign(gy)];
  else if (!s.heading || random() < ENT.turn) s.heading = NEIGHBOURS[Math.floor(random() * 4)];
  if (!free(s.heading)) {
    const ways = NEIGHBOURS.filter(free);
    if (!ways.length) return;
    s.heading = ways[Math.floor(random() * ways.length)];
  }
  if (s.digs) return void wormStep(now, s, [s.x + s.heading[0], s.y + s.heading[1]]);
  moveFoe(now, s, [s.x + s.heading[0], s.y + s.heading[1]]);
  trample(s);
}

// Where an enemy that `fells` has stepped into a forest tree, it's gone: a stump, or grass;
// whether there was one
function trample(s) {
  const k = key(s.x, s.y);
  if (!s.fells || treeAt(s.x, s.y) === null || hits.get(k) === CHOP.hits) return false;
  hits.set(k, CHOP.hits);
  if (s.fells === "grass") overgrown.add(k);
  fell(k);
  felled++;
  return true;
}

// Steps an enemy to `next` (if there is one), sliding there; whether it moved. One that's
// `heavy` (the golem) shakes the screen as it lands, `px` (in CSS px, as the heartbeat's tremor
// is) when it's within `near` cell widths, `far` px when it's further but still within `hear`,
// for `ms`, and a phone that can buzzes. Reduced motion keeps the buzz but not the shake.
const QUAKE = { near: 6, hear: 18, px: 2, far: 1, ms: 220, buzz: [25] };
// A cave room's door: shut, it hides what's beyond it (see caveMap()'s opaque), till the
// character walks into it, or anyone walks through it, and it swings open, for good
function openDoor(m, x, y) {
  if (!m?.cave?.shut(x, y)) return;
  m.cave.setTile(x, y, m.cave.doors.get(key(x, y)).open);
  felled++;                        // (so sight looks again)
  if (m === map) creak();
}
function moveFoe(now, s, next) {
  if (!next) return false;
  openDoor(s.on, ...next);
  if (s.heavy && s.on === map) {
    const d = fogDistance(player.x - next[0], player.y - next[1], CW, CH);
    if (d < QUAKE.hear) {
      if (!calm.matches) tremor = { px: d < QUAKE.near ? QUAKE.px : QUAKE.far, ms: QUAKE.ms, t0: now };
      try { navigator.vibrate?.(QUAKE.buzz); } catch {}
    }
  }
  if (next[0] !== s.x) s.facing = next[0] < s.x ? "left" : "right";
  const from = visualPos(now, s, s.anim);
  Object.assign(s.anim, { t0: now, fromX: from.x, fromY: from.y });
  [s.x, s.y] = next;
  const fire = fires.get(key(...next));   // (walking into fiery footprints, see EMBERS)
  if (fire?.ember && fire.on === s.on && now - fire.t0 < FIRE.groundMs && foes.includes(s) && !(s.burn > 0)) {
    Object.assign(s, { burn: EMBERS.turns, burnDmg: EMBERS.dmg });
    say(tr("{foe:The} catches fire!", { foe: noun(s.called) }, AIM.ink), nextBlowAt - FIGHT.gapMs);
  }
  return true;
}

// A blow at something with `def` and `spd`: the damage it does, or null if it's dodged
// (and `dodge` more percentage points of dodging from gear)
function blow(atk, def, spd, dodge = 0) {
  if (random() * 100 < Math.min(spd * FIGHT.dodgePerSpd + dodge, FIGHT.maxDodge)) return null;
  const spread = 1 - FIGHT.spread + random() * 2 * FIGHT.spread;
  const block = Math.min(FIGHT.maxBlock, Math.max(0, def) / (Math.max(0, def) + FIGHT.defK));
  return Math.max(1, Math.round(Math.max(1, atk) * FIGHT.dmg * (1 - block) * spread));
}

// Shakes whoever took a blow and floats the damage (or "dodge") up from their head, once
// any blow before it in the turn has landed
// (or `label`, in place of the damage: "absorbed", when a Barrier took all of it)
function struck(who, dmg, colour, now, label = null) {
  const at = Math.max(now, nextBlowAt);
  nextBlowAt = at + FIGHT.gapMs;
  setTimeout(dmg === null ? whiff : hit, at - now);
  if (dmg) { who.hitT0 = at; if (!label) bleed(who, bloodFor(dmg), at); }
  if (dmg && who === player && stoneskinned()) addFx("chips", at, { at: mid(player.x, player.y), seed: at & 0xffff });
  pops.push({ runs: [[label ?? (dmg === null ? "dodge" : String(dmg)), dmg === null || label ? INK.same : colour]],
    x: who.x, y: who.y, t0: at, on: map });
  return at;
}

// Exp for the character, levelling up as often as it adds up to (see LEVEL)
function gainExp(n, at) {
  n = Math.round(n * (hero().exp ?? 1));   // (a prodigy's bonus, see CLASSES)
  tally.exp += n;
  if (progress.level >= LEVEL.max) return;
  progress.exp += n;
  const was = progress.level;
  say(tr("You gain {n} exp.", { n: [n, INK.up] }), at);
  while (progress.level < LEVEL.max && progress.exp >= toNext()) {
    progress.exp -= toNext();
    progress.level++;
    stats.hp += HP_PER_LEVEL;      // (full hp grows, and so does what's left of it)
    progress.points += hero().points ?? 1;
    if (progress.level % LEVEL_UP.spellEvery === 0) progress.spells++;
    levelAt = at ?? clock();
    say(tr("You reach <lv>level {n}</>!", { lv: INK.title, n: progress.level }), at);
  }
  if (progress.level > was) setTimeout(levelUp, Math.max(0, levelAt - clock()));
  if (progress.level >= LEVEL.max) progress.exp = 0;
}

// The character's blow at a skeleton, with what's equipped. Attacking one before it's noticed
// them gets its attention; killing it may leave an item on the ground.
function attackSkeleton(s, now) {
  endSneak();
  const dmg = blow(stat("atk"), s.def, s.spd, s.dodge ?? 0), crit = dmg !== null && pact.crit && random() < SHRINE.crit;   // (the Blade's, see SHRINE)
  wound(s, crit ? dmg * SHRINE.critX : dmg, now, "your blow", crit ? "Critical! You hit" : "You hit");
}
// What a blow or a spell of the character's does to a skeleton: `dmg`, or null if it dodged
// `what` ("your blow"); `how` is how the log puts it landing ("You hit"); both English, "{by}" in
// them the name `by` (a spell's, a Yig's), translated as they're said (lang.js)
// (the character turns to face it, unless it's `aside`: something that goes on by itself)
function wound(s, dmg, now, what, how, aside = false, by = null) {
  s.provoked = true;               // (a Bone Flute's dead fight back once hurt, see RELIC)
  if (!aside && s.x !== player.x) player.facing = s.x < player.x ? "left" : "right";
  if (!s.alert) Object.assign(s, { alert: true, alertT0: now, alertLeft: ENEMY.alertTurns });
  rouseBand(s, now);
  const at = struck(s, dmg, INK.dealt, now);
  const foe = noun(s.called), name = by && noun(by);
  say(dmg === null ? tl("{foe:The} dodges {what}.", { foe, what: tl(what, { by: name }) })
    : tr("{how} {foe:the} for {n} damage.", { how: tl(how, { by: name }), foe, n: [dmg, INK.dealt] }), at);
  if (!aside && dmg && (gear("drain") || pact.drain)) {   // (or Envy's, see SHRINE)
    drained += dmg * DRAIN;
    const n = Math.min(Math.floor(drained), maxHp() - stats.hp);
    drained -= Math.floor(drained);
    if (n > 0) {
      stats.hp += n;
      pops.push({ runs: [[`+${n}`, INK.up]], x: player.x, y: player.y, t0: at, on: map, heal: true });
    }
  }
  if (dmg === null || (s.hp -= dmg) > 0) return void (dmg !== null && !aside && thunderHelm(s, at));
  Object.assign(s, { dead: true, diesAt: at });  // still drawn till its killing blow lands
  if (BLADE.credits.includes(how) && !s.still) bladeKill(s, at);   // (the weapon worn remembers it, see BLADE)
  deaths.push({ x: s.x, y: s.y, t0: at, on: map });
  bleed(s, BLOOD.splat, at);
  say(tl("{foe:The} {dies}.", { foe: noun(s.called), dies: tl(s.dies) }), at);
  if (s.kind === "fuzhu") tell(FUZHU_SAYS.quiet, at);
  lived(s.kind);   // (the fuzhu's, a demon's, the iron hound's, the lich's, the goblin king's thoughts, see THOUGHTS)
  if (s.still) reshape(map, ["gone", [s.x, s.y]]);   // (one of a church's people, see FAITHFUL)
  mourn(at);
  if (s.still) return;
  gainExp(s.exp, at);
  if (relicOn("hungry-blade") && stats.hp < maxHp()) {   // (see RELIC)
    const n = Math.min(RELIC.feed, maxHp() - stats.hp);
    stats.hp += n;
    pops.push({ runs: [[`+${n}`, INK.up]], x: player.x, y: player.y, t0: at, on: map, heal: true });
  }
  if (s.nemesis) slayNemesis(s, at);
  const relic = relicDrop(s.nemesis ? RELIC.odds.nemesis : RELIC.odds[s.rank]);
  if (relic) {
    say(tr("It leaves {item:a}. <relic>A relic!</>", { item: itemNoun(relic, INK.title), relic: INK.title }), at);
    setTimeout(() => rareFind(2), Math.max(0, at - now));
    dropAt(s.x, s.y, relic);
  }
  if (BOSSES[s.kind]) setTimeout(() => announce(s.kind, `${watching ? watching.name ?? tl("You") : chatName} ${BOSSES[s.kind]}`), Math.max(0, at - now));
  if (s.kind === "demon") nextDemons(at);
  if (s.kind === "lumberjack") jacksKilled++;   // (his daughter waits for him, see LAKE_HOME)
  const keepsake = KEEPSAKE[s.kind];
  if (keepsake && random() < keepsake.chance) {   // (on top of whatever else it leaves)
    say(tr("It leaves {item:a}.", { item: itemNoun(keepsake.id, INK.name) }), at);
    dropAt(s.x, s.y, keepsake.id);
  }
  if (s.ghostGear) {               // a past player's ghost: one of the things they wore (see GHOSTS)
    tally.ghosts++;
    tally.ghostPoints += SCORE.ghost[0] + SCORE.ghost[1] * s.level;
    if (s.blade) {                 // (its named weapon, still remembering, see BLADE)
      const { id, ...m } = s.blade, mine = blades.get(id);
      // (one of a kind the character's used already, not yet named, takes on its name, the kills
      // added up; one already named keeps its own)
      if (!mine) blades.set(id, m);
      else if (!mine.name) {
        for (const [fam, n] of Object.entries(m.kills)) mine.kills[fam] = (mine.kills[fam] ?? 0) + n;
        Object.assign(mine, { total: mine.total + m.total, name: m.name, epithet: m.epithet });
      }
      say(tr("It leaves {blade}. <title>It remembers its way in your hand.</>", { blade: [bladeName(blades.get(id)), INK.title], title: INK.title }), at);
      setTimeout(() => rareFind(2), Math.max(0, at - now));
      return dropAt(s.x, s.y, id);
    }
    const item = s.ghostGear[Math.floor(random() * s.ghostGear.length)];
    if (!item) return;
    say(tr("It leaves {item:a}.", { item: itemNoun(item, INK.name) }), at);
    setTimeout(loot, at - now);
    return dropAt(s.x, s.y, item);
  }
  // (a superior, cursed or enchanted one, or any miniboss, leaves a spell (MONSTER_AFFIXES), to be
  // learnt like a chest's: the one it knows, unless the loot's tier is higher, when it's one of
  // that tier; gear and spells by its rank's odds and its affix's, MONSTER_AFFIXES)
  const a = MONSTER_AFFIXES[s.affix] ?? {}, base = lootBase(s.on, s.x, s.y), odds = lootOdds(s.rank, a.loot), tier = lootTier(base, odds);
  const spell = a.spell ?? (s.rank === "miniboss" ? MINIBOSS_SPELL : 0);
  const item = spell && random() < spell ? (s.spell && tier <= (SKILLS[s.spell]?.tier ?? 0) ? s.spell : rollSkill(tier, true))
    : random() < s.drop ? s.gear ?? drop(base, odds)
    : random() < POTION.drop ? potion() : random() < POTION.health ? "potion-health" : null;
  if (!item) return;
  say(tr("It drops {item:a}.", { item: thingNoun(item, INK.name) }), at);
  setTimeout(() => foundSound(item, base, SKILLS[item] ? 1 : 0), at - now);   // with the killing blow (a spell from a strong foe, a glint at least)
  dropAt(s.x, s.y, item);
  if (s.lakeAxe && lakeHome) lakeHome.axe = { k: key(s.x, s.y), id: item, on: s.on };   // (its thought, once it's taken: see LAKE_HOME)
}

// The character's thoughts (.TIFF's codex player-thoughts, 2026-10-19): a click or tap on the
// character (let go there, not slid off it: that still walks) says one in the log, in quotes. After
// one of `events`, its line comes first, the next time; from then on it's in the pool with `any`,
// though `feel`'s lines (how they are, where they are) come first while they apply. Never the same
// line twice in a row. Every line suits any class and any gender. The words Claude's and .TIFF's (T),
// as the codex has them; where an event has more than one, one of them. No dice: a thought changes
// nothing, so it isn't in a journey's record.
const THOUGHTS = {
  ink: LOG.you,
  any: ["He wouldn't just leave.", "Where are you?", "I didn't come all this way to turn back."],
  read: ["'Don't look for me.' As if."],   // (with `any`, once the house's note has been read)
  feel: [
    [() => stats.hp <= maxHp() * 0.3, ["Not yet.", "I've had worse. I think."]],
    [() => map === MAPS.outside && dayTurn() >= DAY.night, ["I hate this forest at night."]],
    [() => map === MAPS.outside && world.biomeAt(player.x, player.y) >= 2, ["Why does this place feel like it's grieving?"]],
    [() => !!map.cave, ["Someone's crying down here."]],
  ],
  events: {
    riteDone: ["Were the slimes at the altar guarding something? Why would they be there?", "Someone cast that summoning circle. How malicious.",
      "That altar drank the light. Who would build such a thing?"],
    riteLeft: ["I ran from that ring. I'd do it again."],
    graveyard: ["Even the dead keep watch out here."],
    bandits: ["Bandits, this far in. What are they hiding from?"],
    village: ["'Them.' Who are they so afraid of?"],
    lone: ["Waiting all night for her child... I hope it comes home."],
    feast: ["Whose bones were they eating?"],
    gift: ["The fire's still in me. I can feel it."],
    punished: ["It's so dark. Ever since that bush."],
    smith: ["He asked if the sun's still up. How long has he been down there?", "Those eyes. Like pools of tar."],
    priest: ["A church, this far out. Who still comes to pray?"],
    ghost: ["She's at rest now. I hope.", "Who was she waiting for?"],
    remnants: ["They all fell facing deeper in. What were they walking towards?"],
    note: ["Someone else came looking. Like me."],
    fuzhu: ["That deer looked back at me. Like it wanted me to follow."],
    demon: ["Why tear down the trees just to reach me?"],
    ironHound: ["Who makes a hound out of iron?"],
    lich: ["Notes on how not to die. Did they work?"],
    goblinKing: ["A king of tunnels. Who dug them before him?"],
    lakeHome: ["Gives me hope."],
    lakeAxe: ["They robbed a family just for this axe?"],
    lakeTruth: ["Should I tell her the truth?"],
  },
};
let thoughtNext = null, thoughtLast = null, thoughtN = 0;
const thoughtsHad = new Set();     // the events thought of already, in the pool from then on
// Something's happened that has a thought of its own (one of THOUGHTS.events)
function lived(event) {
  if (!THOUGHTS.events[event] || watching) return;
  thoughtNext = event;
  thoughtsHad.add(event);
}
function think() {
  const pickOf = lines => {
    const fresh = lines.filter(l => l !== thoughtLast);
    return fresh.length ? fresh[(cellHash(turns, ++thoughtN, seed) * fresh.length) | 0] : null;
  };
  let line = thoughtNext && pickOf(THOUGHTS.events[thoughtNext]);
  thoughtNext = null;
  line ??= pickOf(THOUGHTS.feel.filter(([applies]) => applies()).flatMap(([, lines]) => lines));
  line ??= pickOf([...THOUGHTS.any, ...(MAPS.inside.note?.read ? THOUGHTS.read : []), ...[...thoughtsHad].flatMap(e => THOUGHTS.events[e])]);
  if (!line) return;
  thoughtLast = line;
  tell(tr("\u201c{line}\u201d", { line: tl(line) }, THOUGHTS.ink));
}

// Keepsakes (items.js KEEPSAKES): what a monster of a kind leaves now and then, `chance` of the time,
// as well as anything else: the fuzhu (fragments of the child's soul, LORE.md) a White Tuft
// (.TIFF's codex fuzhu-soul, 2026-10-19; the chance Claude's pick), a lumberjack his Locket
// (.TIFF's lumberjack-locket, Figma 466:49127; the chance the White Tuft's, the user's, 2026-10-19)
const KEEPSAKE = { fuzhu: { id: "white-tuft", chance: 0.05 }, lumberjack: { id: "lumberjack-locket", chance: 0.05 } };

// Casting the skill in shortcut i (its number, or a click on it), once it's ready: what it
// does is in SPELLS, by variant, each saying why not and returning false when it can't be
// cast now. It takes a turn, like a step; then it cools down, and whatever it `boost`s lasts
// as many turns as it says (skills.js).
function cast(i, target) {
  const id = typeof i === "string" ? i : shortcuts[i], now = clock();   // (a key's number, or a spell's id, used from the bag)
  if (ITEMS[id] && !dead && now >= nextBlowAt - FIGHT.gapMs) return drink(bag.findLastIndex(b => b?.id === id));
  if (!SKILLS[id] || dead || now < nextBlowAt - FIGHT.gapMs) return;
  if (DAILY.noSkills) { say("Skills don't work on a Null day."); return; }   // (a Null Daily Challenge's, see DAILY)
  const skill = SKILLS[id], left = cooling.get(id);
  if (left) { say(tr("{spell} isn't ready yet ({n} {n|one:turn|other:turns}).", { spell: noun(skill.name, INK.name), n: left })); return; }
  if (skill.aimed && !target) return startAim(i);
  if (target && smithAt(player.x + target[0], player.y + target[1])) { say(SMITH.stop); return UNCHANGED; }   // (see SMITH)
  if (heldBack(now)) return;        // (see HOLD)
  // (one that's `buffFirst` has its boost on before it strikes, so it hits with it: a turn more
  // of it, as the turn it's cast in counts it down once)
  const early = skill.buffFirst ? boostsOf(skill).map(b => ({ name: skill.name, ...b, left: b.left + 1 })) : [];
  boosts.push(...early);
  if (!SPELLS[skill.variant](skill, now, target)) { boosts.splice(boosts.length - early.length, early.length); return; }
  if (skill.dmg || skill.arrow) endSneak();   // (attacking gives the character away, see SNEAK)
  turnTaken();
  used("spells");
  if (skill.dmg && relicOn("echo-stone")) echo = { skill: { ...skill, echo: true }, at: target && [player.x + target[0], player.y + target[1]], on: map };
  cooling.set(id, cooldownOf(skill));
  if (skill.pairs) pairUp(id);
  if (!skill.buffFirst) for (const b of boostsOf(skill)) boosts.push({ name: skill.name, ...b, ...(skill.sneak ? { sneak: true } : {}) });
  if (skill.sneak) sneakLeft = skill.sneak;
  if (skill.reveal) revealLeft = skill.reveal;
  if (skill.scare) scare(skill);
  if (skill.barrier) shield = { name: skill.name, left: skill.barrier[0], turns: skill.barrier[1] };
  skeletonTurn(now);
  noticeClearings();
}
// A skill's cooldown, less what an Amulet takes off it (items.js `cool`), never under a turn
const cooldownOf = skill => Math.max(1, skill.cooldown - gear("cool"));
// PAIRED (the pikeman's Thrust and Guard, the user's, 2026-10-25): a skill that `pairs` takes turns
// with its partner in one slot. Once it's cast, it becomes the partner, in the bag and the
// shortcuts, cooling down as long as the one just cast
function pairUp(id) {
  const next = `${SKILLS[id].pairs}-${SKILLS[id].affix}`;
  if (!SKILLS[next]) return;
  for (const b of bag) if (b?.id === id) b.id = next;
  shortcuts.forEach((s, i) => { if (s === id) shortcuts[i] = next; });
  cooling.set(next, cooling.get(id));
  cooling.delete(id);
}
// A firebolt is aimed first (see AIM), then flies in a straight line to the cell picked, a
// cell every `cellMs`; that cell can be no further than `range` cells, as many up and down as
// sideways (not as the fog counts them, by cell widths: that had a range of 4 reach only 2 cells
// up or down, found by the user 2026-10-12). It hits the first monster in its
// way when it gets there (the monsters have had their turn by then, so one that stepped out of
// its line is missed, and one that dodges it lets it fly on), a standing forest tree, or
// whatever else is solid (it stops just short of that); water it flies over. Where it lands
// a fire burns (FIRE).
const BOLT = { range: 6, cellMs: 70 };
const bolts = [];                  // in flight: { skill, x, y (where it left), path (cells from there), t0, done (cells flown), on (its map) }
// Aiming a skill that's `aimed` (skills.js): its number (or a click on it) brings up a target.
// A firebolt's is on the nearest monster in sight and range, or `ahead` cells the way the
// character last went, the line to it dotted and the cell framed, in `ink`. A blink's range is
// its own `blink`, and its target starts on the furthest cell the way the character last went
// that they could land on; only the cell is framed, in `bad` ink where they can't (see
// blinkable()). The arrows or WASD move it a cell, the
// mouse puts it on the cell pointed at (the nearest in range, along the same line, if that's
// too far); Enter, Space, F, the skill's number or a click casts it there, Esc (or a press
// on the HUD) calls it off. Nothing's spent till it's cast.
const AIM = { ahead: 3, ink: "#df7126", bad: INK.down, dot: 2, line: 1 };
let aiming = null;                 // { slot, x, y, range, blink } while it's up: the shortcut, the target from the character, how far it reaches, and whether it's a blink
const inRange = (dx, dy, range = BOLT.range) => (dx || dy) && Math.hypot(dx, dy) <= range;
const inBoltRange = (dx, dy) => inRange(dx, dy);
// Whether the character can blink to the cell dx, dy from them: one they can see and stand on
const blinkable = (dx, dy) => {
  const x = player.x + dx, y = player.y + dy;
  return (dx || dy) && inSight(x, y) && map.open(x, y) && !map.doors.has(key(x, y)) && !foeAt(x, y) && !yigAt(x, y) && !jackAt(x, y) && !priestAt(x, y);
};
function startAim(slot) {
  const skill = SKILLS[typeof slot === "string" ? slot : shortcuts[slot]], [hx, hy] = player.heading;
  const blink = skill.blink && skill.blink + gear("reach");   // (an Emerald Orb's reaches further, items.js `reach`)
  aiming = blink ? { slot, x: 0, y: 0, range: blink, blink: true } : { slot, x: 0, y: 0, range: (skill.range ?? BOLT.range) + gear("reach") };
  if (blink) {
    let n = Math.ceil(blink);
    while (n > 1 && !(inRange(hx * n, hy * n, blink) && blinkable(hx * n, hy * n))) n--;
    aimAt(hx * n, hy * n);
  } else {
    const far = s => fogDistance(s.x - player.x, s.y - player.y, CW, CH);
    const s = foes.filter(s => !s.dead && !(s.charmed > 0) && !s.still && s.on === map && inSight(s.x, s.y) && inRange(s.x - player.x, s.y - player.y, aiming.range))
      .sort((a, b) => far(a) - far(b))[0];
    aimAt(...(s ? [s.x - player.x, s.y - player.y] : [hx * AIM.ahead, hy * AIM.ahead]));
  }
  held.length = 0;
  say(tapping ? "Tap where to cast it, or the HUD to cancel." : "Pick where to cast it: arrows or mouse, Enter or click to cast, Esc to cancel.");
}
// Puts the target dx, dy from the character, or as far that way as the range allows
function aimAt(dx, dy) {
  const reach = lineTo(dx, dy).filter(([x, y]) => inRange(x, y, aiming.range)).at(-1);
  if (reach) [aiming.x, aiming.y] = reach;
}
function stopAim() {
  aiming = null;
  canvas.style.cursor = "";
}
// The cell (from the character) at a canvas point
const cellFromPlayer = (px, py) => [Math.floor((px - originX) / (CW * scale)) - player.x,
  Math.floor((py - originY) / (CH * scale)) - player.y];
// The target and the line to it, over the world
function drawAim() {
  if (!aiming) return;
  const cw = CW * scale, ch = CH * scale, d = AIM.dot * scale, b = AIM.line * scale;
  const at = ([dx, dy]) => [originX + (player.x + dx) * cw, originY + (player.y + dy) * ch];
  ctx.fillStyle = aiming.blink && !blinkable(aiming.x, aiming.y) ? AIM.bad : AIM.ink;
  if (!aiming.blink) for (const c of lineTo(aiming.x, aiming.y).slice(0, -1)) {
    const [x, y] = at(c);
    ctx.fillRect(x + (cw - d) / 2, y + (ch - d) / 2, d, d);
  }
  const [x, y] = at([aiming.x, aiming.y]);
  ctx.fillRect(x, y, cw, b); ctx.fillRect(x, y + ch - b, cw, b);
  ctx.fillRect(x, y, b, ch); ctx.fillRect(x + cw - b, y, b, ch);
}
// Fire (icons type=fire-1 and fire-2, a frame every `frameMs`): on the ground or a monster it
// burns out after `groundMs`, and does nothing more. A forest tree it lands on burns for
// `burn` of the character's turns and is then a burnt trunk (156:24909), which can be walked
// over; `spread` turns after it catches, the fire takes the trees right next to it too, no
// further than `radius` cells from where the bolt landed.
const FIRE = { frameMs: 180, groundMs: 6000, burn: 8, spread: 3, radius: 2 };
// Lava boots' fiery footprints: each step leaves fire on the cell stepped from, burning as long
// as a firebolt's on the ground, and a monster that walks into it catches fire (as BURN has it),
// for `dmg` on each of the next `turns` turns (Claude's picks, 2026-10-11). It leaves no soot.
const EMBERS = { dmg: 3, turns: 3 };
// Where the lights are now (see LIGHT): each bolt in flight (at the cell it's got to), and each
// fire. (Only from how things stand, never the time: monsters see by it, see act())
function findLights() {
  lights = [
    ...bolts.filter(b => b.on === map).map(b => {
      const [dx, dy] = b.path[b.done - 1] ?? [0, 0];
      return [b.x + dx, b.y + dy];
    }),
    ...[...fires].filter(([, f]) => f.on === map).map(([k]) => k.split(",").map(Number)),
    ...(map === MAPS.outside ? [...burning.keys()].map(k => k.split(",").map(Number)) : []),
    ...(map === MAPS.outside ? bushLights() : []),
    ...foes.filter(s => s.burn > 0 && !s.dead && s.on === map).map(s => [s.x, s.y]),
    ...(map.cave ? [...torchesInSight(), ...minersInSight()] : []),
  ];
}
// The torches the character can see (see LIGHT), worked out again when they move or the dirt's dug
let torchKey = "", torchesSeen = [];
function torchesInSight() {
  const k = `${map.id},${player.x},${player.y},${felled}`;
  if (k === torchKey) return torchesSeen;
  const view = fieldOfView([player.x, player.y], map.opaque, (dx, dy) => fogDistance(dx, dy, CW, CH) < LIGHT.torchesNear);
  torchKey = k;
  torchesView = view;
  // (the crystals' light is theirs, not fire's: it's kept out of the fire's glow, see drawGlow())
  const shines = map.cave.shines.map(([x, y]) => Object.assign([x, y], { cool: true }));
  return (torchesSeen = [...map.cave.torches, ...map.cave.glows, ...shines].filter(([x, y]) => view.has(key(x, y))));
}
let torchesView = new Set();
// ...and the miners' own torches, those the character can see (where each is now)
const minersInSight = () => jacks.filter(j => j.on === map && j.kind !== "lumberjack" && torchesView.has(key(j.x, j.y))).map(j => [j.x, j.y]);
// A monster a firebolt hits catches fire its `burn` % of the time (skills.js): it burns on each of the
// character's next `turns` turns (nothing dodges or shrugs that off), for `base` damage and
// `perMag` more for each point of the mag the bolt was cast with, rounded (3 a turn with mag 1,
// 4 with mag 2, 9 with mag 5; perMag 1 till the user's 1.5, 2026-10-26), a flame on it all the
// while, which lights what's round it like any fire. Hit again while burning, it may burn anew.
const BURN = { base: 1, perMag: 1.5, turns: 3 };
// An Ice Ring's frost freezes a monster its `freeze` % of the time: it takes no turn at all for
// the next `freeze` of the character's; a Thunderbolt paralyses one its `paralyse` % of the time,
// and for its next `paralyse` turns it loses each `paralysedLoses` of the time. Struck again, it
// may be held anew. The log says so in its `ink` as it takes hold.
const HELD = { freeze: 2, paralyse: 3, paralysedLoses: 0.5, ink: { freeze: "#5fcde4", paralyse: "#fbf236" } };
// A Thunder Helmet (items.js `shock`) paralyses what a blow or spell of the character's hurts
// and doesn't kill, its `shock` % of the time, for HELD.paralyse turns, as a Thunderbolt does
function thunderHelm(s, at) {
  const chance = gear("shock");
  if (!chance || !(random() * 100 < chance)) return;
  s.paralysed = HELD.paralyse;
  say(tr("{foe:The} is paralysed!", { foe: noun(s.called) }, HELD.ink.paralyse), at);
}
// What a spell that hurts (skills.js `dmg`) does: a roll from its least to its most, times the
// caster's mag (5-8 with mag 1, 10-16 with mag 2); but it can be dodged like a blow, by the spd
// of what it's cast at (and any dodge from gear). Null if it is. (`scale`: FIGHT.spells for the
// character's own; `def`: a monster's, which takes off FIGHT.spellDef of the share it'd take
// off a blow, so at most a quarter: the user's, 2026-10-26, to bring the mage back to the
// others; till then a monster's def did nothing against spells)
function spellHit({ dmg: [lo, hi], echo }, mag, spd, dodge = 0, scale = 1, def = 0) {
  if (random() * 100 < Math.min(spd * FIGHT.dodgePerSpd + dodge, FIGHT.maxDodge)) return null;
  const d = Math.max(0, def || 0), block = Math.min(FIGHT.maxBlock, d / (d + FIGHT.defK)) * FIGHT.spellDef;
  return Math.max(1, Math.round((lo + Math.floor(random() * (hi - lo + 1))) * Math.max(1, mag) * scale * (echo ? RELIC.echo : 1) * (1 - block)));
}
// What else a spell does to a monster it's hurt and not killed: sets it burning, freezes it or
// paralyses it, by the spell's chances (see BURN and HELD)
function afflict(s, skill, mag, now) {
  if (s.dead) return;
  const at = nextBlowAt - FIGHT.gapMs;
  if (random() * 100 < (skill.burn ?? 0)) {
    s.burn = BURN.turns;
    s.burnDmg = Math.max(1, Math.round(BURN.base + BURN.perMag * mag));
    say(tr("{foe:The} catches fire!", { foe: noun(s.called) }, AIM.ink), at);
  }
  for (const [held, is, says] of [["freeze", "frozen", english("freezes solid")], ["paralyse", "paralysed", english("is paralysed")]]) {
    if (!(random() * 100 < (skill[held] ?? 0))) continue;
    s[is] = skill.held ?? HELD[held];   // (marked over it while it lasts, see drawAlert())
    say(tr(skill.held ? "{foe:The} is stunned!" : `{foe:The} ${says}!`, { foe: noun(s.called) }, HELD.ink[held]), at);
  }
}
// A fire dwindles to the small flame (type=fire-small, 158:25461) when it's almost out: a tree's
// in its last `low` turns of burning, one on the ground in its last `lowMs`, a monster's in its
// last turn.
// Every light (see LIGHT) glows too: what's seen within reach of one takes on the fire's orange,
// `glow` [how far, in cell widths, how strongly] from the nearest out, a little less on the
// flame's other frame so it flickers.
const EMBER = { low: 2, lowMs: 1500, ink: "#df7126", glow: [[1.3, 0.45], [2.5, 0.28], [3.7, 0.14]], flicker: 0.8 };
// Some monsters glow as well, in a colour of their own, without lighting anything: every miniboss
// (the demon, the golem, the lich, the goblin king, the iron hound: rank "miniboss", the user's
// ask, 2026-10-16) intensely red and further, as the demon always has, and the ents green. Theirs
// swells and sinks slowly, between `pulse` of its strength and all of it, every `pulseMs`.
// A cave's lava glows like fire, every cell of it, flickering as fire does; its crystals glow in
// their own colours, each cell, steadily (cave.js; the user's ask, 2026-10-11, the strengths Claude's)
const CAVE_GLOW = { lava: { ink: "#df7126", glow: [[1.3, 0.5], [2.5, 0.3], [3.7, 0.15]] }, crystal: [[1.3, 0.55], [2.5, 0.32], [3.7, 0.16]] };
const MONSTER_GLOW = {
  miniboss: { ink: "#ff2a3a", glow: [[1.5, 0.8], [3, 0.6], [4.5, 0.4], [6, 0.22], [7.5, 0.1]], pulse: 0.75, pulseMs: 1400 },
  ent: { ink: "#6abe30", glow: [[1.3, 0.45], [2.5, 0.28], [3.7, 0.14]], pulse: 0.8, pulseMs: 2600 },
};
// One colour's glow from the cells it comes from, `dim` of its strength just now
function glowFrom(cells, { ink, glow }, dim) {
  if (!cells.length) return;
  const reach = glow.at(-1)[0], rx = Math.ceil(reach), ry = Math.ceil(reach * CW / CH);
  const strength = new Map();      // cell -> the strongest glow on it
  for (const [lx, ly] of cells)
    for (let dy = -ry; dy <= ry; dy++)
      for (let dx = -rx; dx <= rx; dx++) {
        const a = glow.find(([far]) => fogDistance(dx, dy, CW, CH) <= far)?.[1], k = key(lx + dx, ly + dy);
        if (a && a > (strength.get(k) || 0) && (seeAll() || sightLevel(lx + dx, ly + dy) === 0)) strength.set(k, a);
      }
  ctx.save();
  ctx.globalCompositeOperation = "overlay";   // colours what's there, and leaves the dark dark
  ctx.fillStyle = ink;
  for (const [k, a] of strength) {
    const [x, y] = k.split(",").map(Number);
    ctx.globalAlpha = a * dim;
    ctx.fillRect(originX + x * CW * scale, originY + y * CH * scale, CW * scale, CH * scale);
  }
  ctx.restore();
}
function drawGlow(now) {
  const { x0, y0, x1, y1 } = cellsInView(), near = ([x, y]) => x >= x0 - 4 && x <= x1 + 4 && y >= y0 - 3 && y <= y1 + 3;
  // (the monsters near enough to light what's on screen: there can be thousands about by now)
  const close = foes.filter(s => !s.dead && s.on === map && near([s.x, s.y]));
  for (const [kind, g] of Object.entries(MONSTER_GLOW)) {
    const swell = 0.5 - 0.5 * Math.cos(2 * Math.PI * now / g.pulseMs);
    glowFrom(close.filter(s => s.kind === kind || s.rank === kind).map(s => [s.x, s.y]), g, g.pulse + (1 - g.pulse) * swell);
  }
  const flicker = Math.floor(now / FIRE.frameMs) % 2 ? EMBER.flicker : 1;
  glowFrom(lights.filter(l => !l.cool), EMBER, flicker);
  if (map === MAPS.outside)          // (the burning bush's, see BUSH_FIRE)
    glowFrom(bushesOnScreen().flatMap(p => p.bush.flames), BUSH_FIRE, bushSwell(now) * (flicker === 1 ? 1 : 0.92));
  if (!map.cave) return;
  glowFrom(map.cave.lava.filter(near), CAVE_GLOW.lava, flicker);
  const byInk = new Map();
  for (const [k, ink] of map.cave.crystals) {
    const c = k.split(",").map(Number);
    if (near(c)) byInk.set(ink, [...(byInk.get(ink) ?? []), c]);
  }
  for (const [ink, cells] of byInk) glowFrom(cells, { ink, glow: CAVE_GLOW.crystal }, 1);
}
// The cells on screen, first to last each way
function cellsInView() {
  const size = CW * scale, rowH = CH * scale;
  return { x0: Math.floor(-originX / size), x1: Math.ceil((canvas.width - originX) / size),
    y0: Math.floor(-originY / rowH), y1: Math.ceil((canvas.height - originY) / rowH) };
}

// The forest's little lives, only to look at: nothing in them takes a turn or draws on the dice
// (each cell's are picked by hashing where it is, and they move by the clock), so a journey
// plays and is watched the same with them. Fireflies come out in the forest's trees as the
// light goes, more and more of them from dusk till night (`share` of the standing trees have
// one), each drifting about its tree's canopy (`box`, game px in the cell) and glowing now and
// then, a px of `ink` with a slight `glow` round it; butterflies flutter over open ground in
// the morning (`share` of it), coming out from dawn and gone by turn `gone` of the day, each
// in a `wings` colour, flapping every `flapMs` as it wanders `roam` game px about where it
// came out. Both fade with the fog like the world, though a firefly's light is seen out to its
// edge, past the trees in the way (`fade` for each step), and both keep still with reduced motion.
const FIREFLY = { share: 0.005, box: [1, 1, 6, 7], ink: "#fbf236", glow: "#99e550", periodMs: [2400, 4600],
  fade: [1, 0.85, 0.7, 0.55, 0.4, 0.3] };
const BUTTERFLY = { share: 0.01, until: 90, gone: 130, roam: [7, 5], flapMs: 120, body: "#222034",
  wings: ["#ffffff", "#fbf236", "#df7126", "#5fcde4", "#d77bba"] };
const BUTTERFLY_POSES = [["WW.WW", "WWBWW", ".WBW."], [".W.W.", ".WBW.", "..B.."]];   // wings open, then up
const FOG_FADE = [1, 0.75, 0.5, 0.3, 0.18, 0.1];
const cellHash = (x, y, n) => {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(n, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
// The light of the day's hours out in the forest (the user's ask, 2026-10-20, in place of the
// night's flat dark1 tint): the world under it (not the HUD, nor a fire's glow, a firefly or the
// "!" over a monster, drawn after it) multiplied by a `mul` colour, a touch of `tint` laid over
// it (overlay) and its edges darkened toward dark1 by `vig`, out from the middle of the screen.
// Dark1 itself always comes out dark1 (a faint add puts back what the rest took off it), so the
// world sits on the same ground as the HUD. Golden from `golden` turns before dusk, deepening
// into night, which is darker and bluer but keeps its contrast (the user's ask: multiplied, not
// washed over, so the brights stay bright against the dark); pink at dawn, gone by turn
// `morning` of the day. In the dark wood it's always night. (Claude's picks)
const GRADE = { golden: 40, morning: 40, ground: [7, 19, 36],
  dusk: { mul: [255, 222, 190], tint: [223, 113, 38], tintA: 0.14, vig: 0.25 },
  night: { mul: [190, 204, 242], tint: [91, 110, 225], tintA: 0.12, vig: 0.6 },
  dawn: { mul: [255, 230, 236], tint: [215, 123, 186], tintA: 0.1, vig: 0.12 } };
// How much of each of GRADE's hours it is now, 0..1 each
function gradeWeights() {
  if (inDarkWood) return { night: 1 };
  const t = dayTurn(), { dusk, night, dawn, turns: end } = DAY, from = dusk - GRADE.golden;
  if (t >= from && t < night) {
    const u = (t - from) / (night - from);
    return u < 0.6 ? { dusk: u / 0.6 } : { dusk: 1 - (u - 0.6) / 0.4, night: (u - 0.6) / 0.4 };
  }
  if (t >= night && t < dawn) return { night: 1 };
  if (t >= dawn) {
    const u = (t - dawn) / (end - dawn);
    return { night: Math.max(0, 1 - 2 * u), dawn: Math.min(1, 2 * u) };
  }
  return t < GRADE.morning ? { dawn: 1 - t / GRADE.morning } : {};
}
let vignette = null;               // { w, h, fill }: the vignette's gradient, for the canvas's size
function drawGrade() {
  const on = Object.entries(gradeWeights()).filter(([, a]) => a > 0);
  if (!on.length) return;
  const mul = [255, 255, 255];
  let vig = 0;
  for (const [hour, a] of on) {
    const g = GRADE[hour];
    for (let i = 0; i < 3; i++) mul[i] -= (255 - g.mul[i]) * a;
    vig += g.vig * a;
  }
  // what dark1 comes out as, to put back the difference
  const overlay = (b, t) => (b < 128 ? 2 * b * t / 255 : 255 - 2 * (255 - b) * (255 - t) / 255);
  let ground = GRADE.ground.map((c, i) => c * mul[i] / 255);
  for (const [hour, a] of on) {
    const { tint, tintA } = GRADE[hour];
    ground = ground.map((b, i) => b + (overlay(b, tint[i]) - b) * tintA * a);
  }
  const back = GRADE.ground.map((c, i) => Math.max(0, Math.round(c - ground[i])));
  const W = canvas.width, H = canvas.height;
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = `rgb(${mul.map(Math.round)})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "overlay";
  for (const [hour, a] of on) {
    ctx.globalAlpha = GRADE[hour].tintA * a;
    ctx.fillStyle = `rgb(${GRADE[hour].tint})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalAlpha = 1;
  if (back.some(c => c > 0)) {
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgb(${back})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalCompositeOperation = "source-over";
  if (vig > 0) {
    if (vignette?.w !== W || vignette.h !== H) {
      const r = Math.hypot(W, H) / 2, fill = ctx.createRadialGradient(W / 2, H / 2, r * 0.4, W / 2, H / 2, r);
      fill.addColorStop(0, "rgba(7, 19, 36, 0)");
      fill.addColorStop(1, "rgba(7, 19, 36, 1)");
      vignette = { w: W, h: H, fill };
    }
    ctx.globalAlpha = vig;
    ctx.fillStyle = vignette.fill;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}
// How much of the morning it is, 0..1: up from dawn to sunrise, then down from BUTTERFLY.until
function morning() {
  const t = dayTurn(), { dawn, turns: end } = DAY, { until, gone } = BUTTERFLY;
  return t >= dawn ? (t - dawn) / (end - dawn) : t < until ? 1 : t < gone ? 1 - (t - until) / (gone - until) : 0;
}
// (`flies`: the butterflies, drawn over everything as they fly; or the fireflies, over the hour's grade, see GRADE)
function drawCritters(now, flies) {
  const dusk = flies ? 0 : 1 - daylight() / DAY.light, dawn = flies ? morning() : 0;
  if (dusk <= 0 && dawn <= 0) return;
  const { x0, y0, x1, y1 } = cellsInView(), inView = sight(), t = calm.matches ? 0 : now;
  const px = (gx, gy, w, h, ink, a) => {   // whole game px, in world px from the map's corner
    ctx.globalAlpha = a;
    ctx.fillStyle = ink;
    ctx.fillRect(originX + gx * scale, originY + gy * scale, w * scale, h * scale);
  };
  // how clearly a cell's seen, 0 for not at all (`glows`: seen out to the fog's edge, in sight or not)
  const seen = (x, y, k, glows = false) => {
    if (noFog) return 1;
    if (!glows && (!(lookout || inView.has(k)) || (inView.get(k) ?? -1) < 0)) return 0;
    const step = litStep(x, y), fade = glows ? FIREFLY.fade : FOG_FADE;
    return step < 0 ? 0 : fade[Math.min(step, fade.length - 1)];
  };
  ctx.save();
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const k = key(x, y), tree = treeAt(x, y) !== null;
      if (tree === flies) continue;
      if (tree ? dusk <= 0 || cellHash(x, y, 1) >= FIREFLY.share : dawn <= 0 || cellHash(x, y, 2) >= BUTTERFLY.share) continue;
      const h = cellHash(x, y, 3), h2 = cellHash(x, y, 4), h3 = cellHash(x, y, 5);
      if (tree) {
        if (h > dusk || hits.get(k) === CHOP.hits || burning.has(k) || burnt.has(k) || regrowing.has(k) || overgrown.has(k)) continue;
        const clear = seen(x, y, k, true);
        if (!clear) continue;
        const [bx0, by0, bx1, by1] = FIREFLY.box, [lo, hi] = FIREFLY.periodMs, period = lo + (hi - lo) * h2;
        const fx = x * CW + Math.round(bx0 + (bx1 - bx0) * (0.5 + 0.35 * Math.sin(t / (1300 + 900 * h) + 6.3 * h2) + 0.15 * Math.sin(t / 470 + 6.3 * h3)));
        const fy = y * CH + Math.round(by0 + (by1 - by0) * (0.5 + 0.35 * Math.sin(t / (1700 + 800 * h3) + 6.3 * h) + 0.15 * Math.cos(t / 610 + 6.3 * h2)));
        const lit = Math.max(0, Math.sin(2 * Math.PI * (now / period + h3)));
        const a = clear * Math.min(1, 2 * dusk) * (0.25 + 0.75 * lit * lit);
        ctx.globalCompositeOperation = "lighter";
        px(fx - 2, fy, 5, 1, FIREFLY.glow, 0.1 * a);   // the glow: a faint diamond, stronger beside it
        px(fx, fy - 2, 1, 5, FIREFLY.glow, 0.1 * a);
        px(fx - 1, fy - 1, 3, 3, FIREFLY.glow, 0.2 * a);
        px(fx - 1, fy, 3, 1, FIREFLY.glow, 0.35 * a);
        px(fx, fy - 1, 1, 3, FIREFLY.glow, 0.35 * a);
        ctx.globalCompositeOperation = "source-over";
        px(fx, fy, 1, 1, FIREFLY.ink, a);
      } else {
        if (h > dawn || blocked.has(k) || river.cell(x, y) === "water") continue;
        const clear = seen(x, y, k);
        if (!clear) continue;
        const [rx, ry] = BUTTERFLY.roam, wing = BUTTERFLY.wings[Math.floor(h2 * BUTTERFLY.wings.length)];
        const flap = Math.floor(t / BUTTERFLY.flapMs + 4 * h3) % 2, pose = BUTTERFLY_POSES[flap];
        const bx = Math.round((x + 0.5) * CW + rx * Math.sin(t / (2100 + 1100 * h) + 6.3 * h3) + 3 * Math.sin(t / 530 + 6.3 * h));
        const by = Math.round((y + 0.5) * CH + ry * Math.sin(t / (1500 + 900 * h2) + 6.3 * h) - flap);
        for (let r = 0; r < pose.length; r++)
          for (let c = 0; c < pose[r].length; c++)
            if (pose[r][c] !== ".") px(bx - 2 + c, by - 1 + r, 1, 1, pose[r][c] === "B" ? BUTTERFLY.body : wing, clear);
      }
    }
  ctx.restore();
}
// How clearly a cell's seen, 0..1, faded with the fog like the world (`inView`: sight(), got once)
function fogClear(x, y, inView) {
  if (noFog) return 1;
  const k = key(x, y);
  if (!(lookout || inView.has(k)) || (inView.get(k) ?? -1) < 0) return 0;
  const step = litStep(x, y);
  return step < 0 ? 0 : FOG_FADE[Math.min(step, FOG_FADE.length - 1)];
}
// A px, or a w x h block of them, in whole game px from the map's corner
function gamePx(gx, gy, ink, a, w = 1, h = 1) {
  ctx.globalAlpha = a;
  ctx.fillStyle = ink;
  ctx.fillRect(originX + Math.round(gx) * scale, originY + Math.round(gy) * scale, w * scale, h * scale);
}
// Leaves fall from the second forest's trees (the user's ask, 2026-10-20, sparse and slow):
// `share` of its standing trees drop one every `periodMs` (min..max), from somewhere in the
// canopy's `box` (game px in the cell), down `drop` px over `fallMs`, swaying `sway` px either
// way every `swayMs` and turning edge-on now and then; it lies where it lands for `fadeMs`, fading.
// One of `inks`, faded with the fog; only to look at, like the critters (hashed, by the clock),
// and none with reduced motion. (Claude's picks)
const LEAVES = { biome: 1, share: 0.04, periodMs: [18000, 30000], fallMs: [7000, 10000], fadeMs: 3000, drop: [14, 22],
  sway: 3, swayMs: 3200, box: [1, 1, 6, 6], inks: ["#df7126", "#d9a066", "#ac3232", "#df7126", "#fbf236"] };
function drawLeaves(now) {
  if (calm.matches) return;
  const { x0, y0, x1, y1 } = cellsInView(), inView = sight(), L = LEAVES;
  ctx.save();
  for (let y = y0 - 2; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      if (cellHash(x, y, 21) >= L.share || treeAt(x, y) === null || world.biomeAt(x, y) !== L.biome) continue;
      const k = key(x, y);
      if (hits.get(k) === CHOP.hits || burning.has(k) || burnt.has(k) || regrowing.has(k) || overgrown.has(k)) continue;
      const h = n => cellHash(x, y, 22 + n), lerp = ([lo, hi], t) => lo + (hi - lo) * t;
      const period = lerp(L.periodMs, h(0)), fallMs = lerp(L.fallMs, h(1)), age = (now + period * h(2)) % period;
      if (age >= fallMs + L.fadeMs) continue;
      const clear = fogClear(x, y, inView);
      if (!clear) continue;
      const fell = Math.min(age, fallMs), t = fell / fallMs;
      const gx = x * CW + lerp([L.box[0], L.box[2]], h(3)) + L.sway * Math.sin(2 * Math.PI * (fell / L.swayMs + h(4))) + 2 * t;
      const gy = y * CH + lerp([L.box[1], L.box[3]], h(5)) + lerp(L.drop, h(6)) * t;
      const edgeOn = age < fallMs && Math.sin(2 * Math.PI * (fell / (L.swayMs / 2) + h(7))) > 0.4;
      gamePx(gx, gy, L.inks[Math.floor(h(8) * L.inks.length)], clear * (age < fallMs ? 1 : 1 - (age - fallMs) / L.fadeMs), edgeOn ? 1 : 2);
    }
  ctx.restore();
}
// Now and then a px of water out in the forest catches the light (the user's ask, 2026-10-20,
// slow): `share` of the water cells on screen have a glint, somewhere in `box` (game px in the
// cell), that flashes once every `periodMs` (min..max), a px of `ink` for `flashMs`, then a px
// wider each way in `fade` till `ms`; fewer as the light goes (`night` of them at night), faded
// with the fog; hashed, never the dice, and none with reduced motion. (Claude's picks)
const GLINT = { share: 0.14, night: 0.15, periodMs: [7000, 12000], ms: 1800, flashMs: 600, ink: "#ffffff", fade: "#cbdbfc",
  alpha: 0.9, box: [1, 2, 6, 9] };
function drawGlints(now) {
  if (calm.matches) return;
  const G = GLINT, share = G.share * (G.night + (1 - G.night) * daylight() / DAY.light);
  const { x0, y0, x1, y1 } = cellsInView(), inView = sight();
  ctx.save();
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      if (cellHash(x, y, 31) >= share || river.cell(x, y) !== "water") continue;
      const h = n => cellHash(x, y, 32 + n), period = G.periodMs[0] + (G.periodMs[1] - G.periodMs[0]) * h(0);
      const age = (now + period * h(1)) % period;
      if (age >= G.ms) continue;
      const clear = fogClear(x, y, inView);
      if (!clear) continue;
      const gx = x * CW + G.box[0] + Math.floor((G.box[2] - G.box[0] + 1) * h(2));
      const gy = y * CH + G.box[1] + Math.floor((G.box[3] - G.box[1] + 1) * h(3));
      const rise = Math.min(1, age / 200);   // (comes up, not on all at once)
      if (age < G.flashMs) gamePx(gx, gy, G.ink, G.alpha * clear * rise);
      else gamePx(gx - 1, gy, G.fade, G.alpha * clear * (1 - (age - G.flashMs) / (G.ms - G.flashMs)), 3);
    }
  ctx.restore();
}
// Sparks rise off fire (the user's ask, 2026-10-20, slow): off every light that's fire (not a
// crystal's), and `lava` of the lava cells on screen, `per` sparks each, every `periodMs`
// (min..max), rising `rise` px over `ms` and swaying `sway` px, yellow, then orange, then red
// (`inks`) as they cool, faded with the fog. Hashed, never the dice; none with reduced motion.
// (Claude's picks)
const SPARKS = { per: 2, lava: 0.12, periodMs: [3500, 6000], ms: 2600, rise: 18, sway: 2, inks: ["#fbf236", "#df7126", "#ac3232"] };
function drawSparks(now) {
  if (calm.matches) return;
  const { x0, y0, x1, y1 } = cellsInView(), near = ([x, y]) => x >= x0 - 1 && x <= x1 && y >= y0 && y <= y1 + 2;
  const from = [...lights.filter(l => !l.cool && near(l)),
    ...(map.cave ? map.cave.lava.filter(c => near(c) && cellHash(c[0], c[1], 41) < SPARKS.lava) : [])];
  if (!from.length) return;
  const inView = sight(), S = SPARKS;
  ctx.save();
  for (const [x, y] of from) {
    const clear = fogClear(x, y, inView);
    if (!clear) continue;
    for (let i = 0; i < S.per; i++) {
      const h = n => cellHash(x, y, 42 + 7 * i + n), period = S.periodMs[0] + (S.periodMs[1] - S.periodMs[0]) * h(0);
      const age = (now + period * h(1)) % period;
      if (age >= S.ms) continue;
      const t = age / S.ms;
      const gx = x * CW + 2 + 4 * h(2) + S.sway * Math.sin(2 * Math.PI * (t * 0.8 + h(3)));
      const gy = y * CH + 5 + 3 * h(4) - S.rise * t;
      gamePx(gx, gy, S.inks[Math.min(S.inks.length - 1, Math.floor(t * S.inks.length))], clear * (1 - t * t));
    }
  }
  ctx.restore();
}
// The cave's air (the user's ask, 2026-10-20): `share` of the cells within `reach` cell widths of
// the character have a mote of dust in them, drifting slowly (`driftMs`, `drift` px about), as
// faint as `alpha` (min..max), breathing in and out every `breatheMs`, fainter out to the reach's
// edge and with the fog; and the character's own light has a little warmth to it, `ink` laid
// over (screen, so it lifts the dark floor) at `alpha` (flickering by `flicker` every `flickerMs`) out to `reach` of their
// sight, in the fog's own 4x4 dither, thinning out to its edge (`dense` at the middle). Only
// to look at; none of the motes with reduced motion. (Claude's picks)
// Out in the forest (the user's ask, 2026-10-21) the warmth comes out with the night only, over
// the hour's grade (so it isn't turned blue): as much of it as it's night, plus `dusk` of the
// dusk's share, so it fades in through the golden hour; at `outside` of the cave's strength,
// as the forest floor has more in it than the cave's; always in the dark wood. No motes there.
const MOTES = { reach: 3.2, share: 0.3, driftMs: [11000, 17000], drift: [5, 4], alpha: [0.12, 0.32], breatheMs: 4000, ink: "#cbdbfc" };
const WARMTH = { ink: "#df7126", alpha: 0.13, flicker: 0.02, flickerMs: 700, reach: 0.4, dense: 0.75, outside: 0.85, dusk: 0.4 };
function drawMotes(now, pos) {
  if (calm.matches) return;
  const M = MOTES, inView = sight(), r = Math.ceil(M.reach), cx = pos.x + 0.5, cy = pos.y + 0.5;
  ctx.save();
  for (let y = Math.floor(cy) - r; y <= Math.floor(cy) + r; y++)
    for (let x = Math.floor(cx) - r; x <= Math.floor(cx) + r; x++) {
      if (cellHash(x, y, 51) >= M.share) continue;
      const h = n => cellHash(x, y, 52 + n), period = M.driftMs[0] + (M.driftMs[1] - M.driftMs[0]) * h(0);
      const a = 2 * Math.PI * (now / period + h(1));
      const gx = (x + h(2)) * CW + M.drift[0] * Math.sin(a), gy = (y + h(3)) * CH + M.drift[1] * Math.sin(2 * a + h(4));
      const far = fogDistance(gx / CW - cx, gy / CH - cy, CW, CH) / M.reach;
      if (far >= 1) continue;
      const clear = fogClear(Math.floor(gx / CW), Math.floor(gy / CH), inView);
      if (!clear) continue;
      const breathe = 0.5 + 0.5 * Math.sin(2 * Math.PI * (now / M.breatheMs + h(5)));
      gamePx(gx, gy, M.ink, clear * (1 - far) * (M.alpha[0] + (M.alpha[1] - M.alpha[0]) * breathe));
    }
  ctx.restore();
}
const warmths = new Map();         // "radius,phase x,phase y" -> its dithered disc (game px), made once
function drawWarmth(now, pos, strength = 1) {
  const W = WARMTH, R = Math.max(2, Math.round(W.reach * FOG_END * CW / murk()));
  const gx = Math.round((pos.x + 0.5) * CW), gy = Math.round((pos.y + 0.5) * CH);
  const px = ((gx % 4) + 4) % 4, py = ((gy % 4) + 4) % 4, k = `${R},${px},${py}`;
  let disc = warmths.get(k);
  if (!disc) {                     // (the dither lined up with the world's, as the fog's is)
    disc = document.createElement("canvas");
    disc.width = disc.height = 2 * R + 1;
    const g = disc.getContext("2d");
    g.fillStyle = W.ink;
    for (let y = -R; y <= R; y++)
      for (let x = -R; x <= R; x++) {
        const d = Math.hypot(x, y) / R;
        if (d < 1 && (1 - d) * W.dense * 16 > BAYER[(((y + py) % 4) + 4) % 4][(((x + px) % 4) + 4) % 4]) g.fillRect(x + R, y + R, 1, 1);
      }
    warmths.set(k, disc);
  }
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = strength * (W.alpha + W.flicker * Math.sin(2 * Math.PI * now / W.flickerMs) * Math.sin(2 * Math.PI * now / (W.flickerMs * 0.37)));
  ctx.drawImage(disc, originX + (gx - R) * scale, originY + (gy - R) * scale, disc.width * scale, disc.height * scale);
  ctx.restore();
}
// Each step anyone takes (the character, a monster, a villager...) kicks up a little dust where
// they stepped from, only to look at like the critters: `puffs` px of a soft `inks` colour, one
// after another over `spreadMs`, each drifting `drift` px back the way they came and `rise` px
// up as it fades out over `ms`; picked by hashing the step, never the dice. Not in water, and
// none with reduced motion (Claude's picks, 2026-10-16).
const DUST = { ms: 400, puffs: 4, spreadMs: 160, drift: 4, rise: 3, alpha: 0.35,
  inks: ["#d9a066", "#847e87", "#9badb7", "#eec39a"] };
const dust = [];                   // { x, y (game px), dx, dy, size, ink, t0, on (its map) }
const dustSeen = new WeakMap();    // a step's anim -> the t0 its dust was kicked up for
function kickDust(now, who, a) {
  if (calm.matches || !Number.isFinite(a.t0) || dustSeen.get(a) === a.t0) return;
  dustSeen.set(a, a.t0);
  const mx = who.x - a.fromX, my = who.y - a.fromY;
  if (Math.abs(mx) + Math.abs(my) !== 1 || now - a.t0 > STEP_ANIM_MS) return;   // a step, just taken
  if (map === MAPS.outside && river.cell(a.fromX, a.fromY) === "water") return;
  const seed = Math.floor(a.t0) & 0xffff;
  for (let i = 0; i < DUST.puffs; i++) {
    const h = cellHash(a.fromX, a.fromY, seed + 7 * i), h2 = cellHash(a.fromX, a.fromY, seed + 7 * i + 1),
      h3 = cellHash(a.fromX, a.fromY, seed + 7 * i + 2);
    const side = (h3 - 0.5) * 2;   // how far it goes off to the side of the way they went
    dust.push({ x: (a.fromX + 0.5 + 0.35 * mx * i / DUST.puffs) * CW + (h - 0.5) * 5, y: (a.fromY + 1) * CH - 2 - 2 * h2,
      dx: -mx * DUST.drift * (0.5 + h2) + (mx ? 0 : side * DUST.drift / 2), dy: -my * DUST.drift * (0.3 + h) / 2,
      size: h > 0.65 ? 2 : 1, ink: DUST.inks[Math.floor(h3 * DUST.inks.length)], t0: a.t0 + i * DUST.spreadMs / DUST.puffs, on: map });
  }
}
// A Lunge Attack (the user's, 2026-10-16) kicks up a cloud of it: `start` puffs where the
// character leaps from, `along` more on each cell they go over (as they pass it), and `hit`
// where they land by the monster, bigger, slower and more of them than a step's, spreading
// `spread` px every way and drifting back the way they came; none with reduced motion.
const LUNGE_DUST = { start: 12, along: 5, hit: 9, spread: 7, ms: 800, alpha: 0.6, big: 0.5 };
function lungeDust(now, from, to, foe) {
  if (calm.matches) return;
  const L = LUNGE_DUST, mx = Math.sign(foe[0] - from[0]), my = Math.sign(foe[1] - from[1]);
  const n = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]));
  const seed = Math.floor(now) & 0xffff;
  const puff = (x, y, count, t0) => {
    for (let i = 0; i < count; i++) {
      const h = j => cellHash(x, y, seed + 11 * i + j), angle = h(0) * 2 * Math.PI, far = L.spread * (0.3 + 0.7 * h(1));
      dust.push({ x: (x + 0.5) * CW + (h(2) - 0.5) * 6, y: (y + 1) * CH - 2 - 3 * h(3),
        dx: Math.cos(angle) * far - mx * L.spread * 0.6, dy: Math.sin(angle) * far * 0.5 - my * L.spread * 0.3,
        size: h(4) < L.big ? 2 : 1, ink: DUST.inks[Math.floor(h(5) * DUST.inks.length)], t0: t0 + h(6) * 80, on: map, ms: L.ms, alpha: L.alpha });
    }
  };
  puff(...from, L.start, now);
  for (let k = 1; k <= n; k++)
    puff(from[0] + Math.round((to[0] - from[0]) * k / n), from[1] + Math.round((to[1] - from[1]) * k / n), L.along, now + STEP_ANIM_MS * k / (n + 1));
  puff(...to, L.hit, now + STEP_ANIM_MS);
}
// On the ground, under everyone, faded with the fog like the world
function drawDust(now) {
  if (!dust.length) return;
  const inView = sight();
  ctx.save();
  for (let i = dust.length - 1; i >= 0; i--) {
    const d = dust[i], t = (now - d.t0) / (d.ms ?? DUST.ms);
    if (t >= 1) { dust.splice(i, 1); continue; }
    if (t < 0 || d.on !== map) continue;
    const cx = Math.floor(d.x / CW), cy = Math.floor(d.y / CH), k = key(cx, cy);
    let clear = 1;
    if (!noFog) {
      if (!(lookout || inView.has(k)) || (inView.get(k) ?? -1) < 0) continue;
      const step = litStep(cx, cy);
      if (step < 0) continue;
      clear = FOG_FADE[Math.min(step, FOG_FADE.length - 1)];
    }
    const e = 1 - (1 - t) ** 2, size = t < 0.5 ? d.size : 1;
    ctx.globalAlpha = (d.alpha ?? DUST.alpha) * clear * (1 - t);
    ctx.fillStyle = d.ink;
    ctx.fillRect(originX + Math.round(d.x + d.dx * e) * scale, originY + Math.round(d.y + d.dy * e - DUST.rise * e) * scale,
      size * scale, size * scale);
  }
  ctx.restore();
}
// Blood (the user's, 2026-10-16): every blow that lands throws `drops` px of it (one more for
// each `per` damage, up to `most`), and a kill `splat`, out from whoever's hurt, away from the
// character (any way, when it's the character that's hurt), up to `reach` cells off, in a
// little arc `arc` px high that lands in `flyMs`; there it stays, for good, the oldest going
// once a map has `keep`. Dark and muted: one of `inks` at `alpha`, faded with the fog; a
// slime's a dark green (`slime`), and the bloodless (`none`: bone, stone, iron, wood and
// spirits, and the risen ghosts) leave faint dust instead, the step's own colours (`dust`) at
// `dustAlpha` (the user's, 2026-10-16). None in water or where nothing can stand; picked by hashing the blow,
// never the dice; no arc with reduced motion. Kept with its map in a save (each drop as
// [x, y, ink and size]). (Claude's picks, after the user's "very muted and dark".)
const BLOOD = { drops: 3, per: 6, most: 6, splat: 10, reach: 0.9, arc: 5, flyMs: 260, keep: 400, alpha: 0.9,
  inks: ["#5c2a35", "#4e2232", "#663931", "#45283c"], slime: ["#3b4a3a", "#323c39"], slimes: ["slime", "hornedSlime"],
  dust: ["#847e87", "#9badb7", "#d9a066"], dustAlpha: 0.4, church: 0.5,
  none: new Set(["skeleton", "skeletonMage", "skeletonArcher", "golem", "shade", "ent", "wraith", "stoneworm", "lich", "ironHound", "spirit"]) };
let bled = 0;                      // (blows bled from, for each one's hashing)
// `n` drops of blood from `who`, landing at `at`
function bleed(who, n, at) {
  const seed = ++bled * 13, inks = who.risen || BLOOD.none.has(who.kind) ? BLOOD.dust : BLOOD.slimes.includes(who.kind) ? BLOOD.slime : BLOOD.inks;
  const away = who === player ? cellHash(who.x, who.y, seed) * 2 * Math.PI : Math.atan2(who.y - player.y, who.x - player.x);
  const blood = (map.blood ??= []);
  for (let i = 0; i < n; i++) {
    const h = j => cellHash(who.x, who.y, seed + 5 * i + j);
    const angle = (who === player || (who.x === player.x && who.y === player.y)) ? h(0) * 2 * Math.PI : away + (h(0) - 0.5) * 2.2;
    const far = BLOOD.reach * (0.15 + 0.85 * h(1));
    const x = Math.round((who.x + 0.5 + Math.cos(angle) * far) * CW), y = Math.round((who.y + 0.8 + Math.sin(angle) * far * 0.7) * CH);
    const cx = Math.floor(x / CW), cy = Math.floor(y / CH);
    if (!map.open(cx, cy) || (map === MAPS.outside && river.cell(cx, cy) === "water")) continue;
    blood.push({ x, y, ink: inks[Math.floor(h(2) * inks.length)], size: h(3) > 0.75 ? 2 : 1,
      from: [Math.round((who.x + 0.5) * CW), Math.round((who.y + 0.5) * CH)], t0: at });
  }
  if (blood.length > BLOOD.keep) blood.splice(0, blood.length - BLOOD.keep);
}
// Every ink a drop can be, in the order a save numbers them
const bloodInks = () => [...BLOOD.inks, ...BLOOD.slime, ...BLOOD.dust];
const bloodFor = dmg => Math.min(BLOOD.most, BLOOD.drops + Math.floor(dmg / BLOOD.per));
// On the ground, under everyone (and their dust), faded with the fog like the world
function drawBlood(now) {
  if ((!map.blood?.length && !map.oldBlood?.length) || !settings.blood) return;   // (the settings' Show Blood: kept, only not drawn)
  const inView = sight();
  ctx.save();
  for (const list of [map.oldBlood ?? [], map.blood ?? []]) for (const b of list) {   // (a battlefield's, see REMNANTS, then the fights')
    const t = (now - b.t0) / BLOOD.flyMs;
    if (t < 0) continue;           // (its blow hasn't landed yet)
    const flying = t < 1 && !calm.matches;
    const x = flying ? b.from[0] + (b.x - b.from[0]) * t : b.x;
    const y = flying ? b.from[1] + (b.y - b.from[1]) * t - BLOOD.arc * Math.sin(Math.PI * t) : b.y;
    const cx = Math.floor(b.x / CW), cy = Math.floor(b.y / CH), k = key(cx, cy);
    let clear = 1;
    if (!noFog) {
      if (!(lookout || inView.has(k)) || (inView.get(k) ?? -1) < 0) continue;
      const step = litStep(cx, cy);
      if (step < 0) continue;
      clear = FOG_FADE[Math.min(step, FOG_FADE.length - 1)];
    }
    ctx.globalAlpha = (BLOOD.dust.includes(b.ink) ? BLOOD.dustAlpha : BLOOD.alpha * (map.church ? BLOOD.church : 1)) * clear;
    ctx.fillStyle = b.ink;
    const size = flying ? 1 : b.size;
    ctx.fillRect(originX + Math.round(x) * scale, originY + Math.round(y) * scale, size * scale, size * scale);
  }
  ctx.restore();
}
const fires = new Map();           // cell -> { t0, on (its map) }, burning on the ground
// An Ice Ring's frost (icons, 272:62432) on each of the cells round where it was cast, for
// FROST.ms, over everything like fire, faded by the fog; a Hammertime!'s shockwave (icons,
// 569:70833) likewise
const FROST = { ms: 700 };
const frosts = [];                 // { cells, t0, on (its map), tile (the shockwave's; none, the frost) }
const burning = new Map();         // forest cell -> { age (turns), from (where the bolt landed) }
const burnt = new Set();           // forest cells burnt down
// Once a fire has burnt out, the forest's trees still standing all round where it was (the 8
// cells about it) are covered in soot, drawn from then on with their canopies in soot's colour
const sooty = new Set();
const AROUND = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
// The cells within `r` round the character, every way (corners too), but their own
function ringCells(r) {
  const cells = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx || dy) cells.push([player.x + dx, player.y + dy]);
  return cells;
}
function soot(x, y) {
  for (const [dx, dy] of AROUND) if (treeAt(x + dx, y + dy) !== null) sooty.add(key(x + dx, y + dy));
}
// The tiles of the biome a forest tree `t` is of (world.js BIOMES)
const forestOf = t => SCENE.biomes.find(b => b.trees.includes(t));
// A forest tree's tile: tree `t` after `n` hits, sooty or not
function treeTile(t, n, isSooty) {
  const F = forestOf(t), i = F.trees.indexOf(t);
  return n ? (isSooty ? F.sootHits : F.treeHits)[i][n - 1] : isSooty ? F.sootTrees[i] : t;
}
const standingTree = (x, y) => map === MAPS.outside && treeAt(x, y) !== null && hits.get(key(x, y)) !== CHOP.hits;
// Whether what's solid stops a bolt or a strike at a cell: a ghost doesn't (see GHOST), it
// flies through her, as sight goes past her
const shotStops = (x, y) => !ghostsHere().some(([gx, gy]) => gx === x && gy === y) &&
  (map === MAPS.outside ? blocked.has(key(x, y)) : !map.open(x, y));
// A bolt reaching its nth cell: whether it lands there (or just before it)
function boltLands(b, n, now) {
  const [cx, cy] = b.path[n - 1], [px, py] = b.path[n - 2] ?? [0, 0];
  if (b.from) return foeBoltLands(b, b.x + cx, b.y + cy, b.x + px, b.y + py, n, now);
  const x = b.x + cx, y = b.y + cy, s = targetAt(x, y, now, !b.ally);
  const ground = (fx, fy) => { if (fx !== player.x || fy !== player.y) fires.set(key(fx, fy), { t0: now, on: map }); };
  if (s && b.skill.arrow) {        // an arrow: a blow, from afar (see SHOOT)
    wound(s, blow(stat("atk"), s.def, s.spd, s.dodge ?? 0), now, "your {by}", "Your arrow hits", false, b.skill.name);
    return true;
  }
  if (b.skill.arrow && (priestAt(x, y) || standingTree(x, y) || shotStops(x, y))) { if (inSight(x, y)) thunk(); return true; }
  if (s) {                         // (a Yig mage's, see YIG, by its own mag)
    const { name } = b.skill, by = b.ally ? `${b.ally.name}'s ${name}` : name, mag = b.ally?.mag ?? stat("mag");
    const dmg = spellHit(b.skill, mag, s.spd, s.dodge ?? 0, FIGHT.spells, s.def);
    wound(s, dmg, now, "your {by}", "Your {by} hits", !!b.ally, by);
    if (dmg === null) return n >= b.path.length;   // (dodged at the end of its flight, it goes out)
    if (!b.ally) leap(s, dmg, b.skill, now);   // (the Storm's, see SHRINE)
    afflict(s, b.skill, mag, now);
    ground(x, y);
    return true;
  }
  if (priestAt(x, y)) {            // the fire parts round him
    if (!smithAt(x, y)) say(speech("Priest", "Lord, have mercy."));
    ground(b.x + px, b.y + py);
    return true;
  }
  if (standingTree(x, y)) {
    if (!burning.has(key(x, y))) burning.set(key(x, y), { age: 0, from: [x, y] });
    say("The tree catches fire.");
    return true;
  }
  if (shotStops(x, y)) { ground(b.x + px, b.y + py); return true; }
  if (n < b.path.length) return false;
  if (!b.skill.arrow && (map !== MAPS.outside || river.cell(x, y) !== "water")) ground(x, y);
  return true;
}
// A monster's bolt (see FOE_SPELLS) reaching cell x, y (px, py the one before it): it hits the
// character if they're still there, and otherwise stops at a monster or a lumberjack (hurting
// neither), sets a tree alight or stops short of anything solid, as the character's does
function foeBoltLands(b, x, y, px, py, n, now) {
  const ground = (fx, fy) => { if (fx !== player.x || fy !== player.y) fires.set(key(fx, fy), { t0: now, on: map }); };
  if (b.from.dead || b.on !== map) return true;
  const spell = b.skill.arrow ? null : b.skill;   // (an arrow hits as a blow, see FOE_SPELLS.shoot)
  if (x === player.x && y === player.y) { if (!dead) attackPlayer(b.from, now, spell); return true; }
  const ally = yigAt(x, y);
  if (ally) { attackYig(b.from, ally, now, spell); return true; }
  if (b.skill.arrow && (foeAt(x, y) || jackAt(x, y) || priestAt(x, y) || standingTree(x, y) || shotStops(x, y))) { if (inSight(x, y)) thunk(); return true; }
  if (foeAt(x, y) || jackAt(x, y) || priestAt(x, y)) { ground(px, py); return true; }
  if (standingTree(x, y)) {
    if (!burning.has(key(x, y))) burning.set(key(x, y), { age: 0, from: [x, y] });
    return true;
  }
  if (shotStops(x, y)) { ground(px, py); return true; }
  if (n < b.path.length) return false;
  if (map !== MAPS.outside || river.cell(x, y) !== "water") ground(x, y);
  return true;
}
// Moves the bolts on to the cells they've got to by now (`reached`, each bolt's, in order),
// landing those that hit something
function advanceBolts(reached) {
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    let landed = dead || b.on !== map;
    while (!landed && b.done < reached[i]) landed = boltLands(b, ++b.done, clock());
    if (landed) bolts.splice(i, 1);
  }
}
// Puts out the fires on the ground (by cell) that have burnt their time (FIRE.groundMs)
function expireFires(cells) {
  for (const k of cells) {
    const f = fires.get(k);
    if (!f) continue;
    if (f.on === MAPS.outside && !f.ember) soot(...k.split(",").map(Number));
    fires.delete(k);
  }
}
// The trees on fire burn a turn more: they spread it, then burn down, maybe leaving something as
// a felled tree does (see FIND)
function burnTurn() {
  for (const [k, f] of [...burning]) {
    const [x, y] = k.split(",").map(Number);
    if (++f.age === FIRE.spread)
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx, ny = y + dy, far = Math.hypot(nx - f.from[0], ny - f.from[1]);
        const standing = treeAt(nx, ny) !== null && hits.get(key(nx, ny)) !== CHOP.hits;
        if (standing && far <= FIRE.radius && !burning.has(key(nx, ny))) burning.set(key(nx, ny), { age: 0, from: f.from });
      }
    if (f.age < FIRE.burn) continue;
    burning.delete(k);
    const standing = hits.get(k) !== CHOP.hits;
    if (standing) { hits.set(k, CHOP.hits); felled++; }
    regrowing.delete(k);
    burnt.add(k);
    soot(x, y);
    const item = standing && findAt(x, y, MAPS.outside);
    if (item) {
      dropAt(x, y, item, MAPS.outside);
      if (map === MAPS.outside && inSight(x, y)) {
        foundSound(item, lootBase(MAPS.outside, x, y));
        say(tr("Something falls from the burning tree: {item:a}.", { item: thingNoun(item, INK.name) }));
      }
    }
    if (!burning.size) say("The fire burns itself out.");
  }
}
// Bolts in flight and fires, over everything, faded by the fog like the world
function drawFire(now) {
  const full = SCENE.fire[Math.floor(now / FIRE.frameMs) % SCENE.fire.length];
  const flame = low => (low ? SCENE.fireSmall : full);   // (see EMBER)
  const lit = (x, y) => sightAtlas(litStep(x, y), sightLevel(Math.round(x), Math.round(y)));
  if (map === MAPS.outside)
    for (const [k, f] of burning) {
      const [x, y] = k.split(",").map(Number), atlas = lit(x, y);
      if (atlas) drawTile(flame(f.age >= FIRE.burn - EMBER.low), x, y, 0, atlas);
    }
  for (const [k, f] of fires) {
    if (now - f.t0 >= FIRE.groundMs) continue;   // (out: see expireFires())
    const [x, y] = k.split(",").map(Number), atlas = f.on === map && lit(x, y);
    if (atlas) drawTile(flame(now - f.t0 >= FIRE.groundMs - EMBER.lowMs), x, y, 0, atlas);
  }
  for (let i = frosts.length - 1; i >= 0; i--) {   // (see FROST)
    const fr = frosts[i];
    if (now - fr.t0 >= FROST.ms) { frosts.splice(i, 1); continue; }
    if (fr.on !== map) continue;
    for (const [x, y] of fr.cells) { const atlas = lit(x, y); if (atlas) drawTile(fr.tile ?? SCENE.ice, x, y, 0, atlas); }
  }
  for (const o of orbs) {          // (see ORB)
    const atlas = o.on === map && lit(o.x, o.y);
    if (atlas) drawTile(SCENE.skillIcons[`${o.skill.variant}-${o.skill.affix}`], o.x, o.y, 0, atlas);
  }
  for (const s of foes) {          // those on fire (see BURN)
    if (!(s.burn > 0) || s.on !== map || (s.dead && now >= s.diesAt)) continue;
    const pos = visualPos(now, s, s.anim), atlas = lit(pos.x, pos.y);
    if (atlas) drawTile(flame(s.burn === 1), pos.x, pos.y, 0, atlas);
  }
  for (const b of bolts) {
    // between the cell it's left and the one it's coming to, in whole game px, so it stays crisp
    // (a frame's time can be a moment before the cast's)
    const n = Math.min(b.path.length, Math.max(0, (now - b.t0) / BOLT.cellMs)), i = Math.min(b.path.length - 1, Math.floor(n));
    const [fx, fy] = b.path[i - 1] ?? [0, 0], [tx, ty] = b.path[i], f = n - i;
    const x = b.x + Math.round((fx + (tx - fx) * f) * CW) / CW, y = b.y + Math.round((fy + (ty - fy) * f) * CH) / CH;
    const [ex, ey] = b.path.at(-1), across = Math.abs(ex) * CW >= Math.abs(ey) * CH;  // drawn the way it mostly goes
    const atlas = b.on === map && lit(x, y);
    const sprite = b.skill.arrow ? SCENE.shot : SCENE.bolt;   // (an arrow's blue-grey, a bolt's fire)
    if (atlas) drawTile(sprite[across ? (ex < 0 ? "left" : "right") : ey < 0 ? "up" : "down"], x, y, 0, atlas);
  }
}
const SPELLS = {
  // gives back hp over the next few turns, each share floating up in green (see regenShares())
  regeneration(skill) {
    if (stats.hp >= maxHp()) { say("You aren't wounded."); return false; }
    regens.push({ name: skill.name, shares: regenShares(skill) });
    loot();
    say(tr("You cast {spell} and your wounds begin to close.", { spell: noun(skill.name, INK.name) }));
    return true;
  },
  // sends a bolt off to the cell aimed at (see BOLT): a blow at the monster it hits, with mag
  // (and the spell's own) for atk
  firebolt(skill, now, [dx, dy]) {
    if (dx) player.facing = dx < 0 ? "left" : "right";
    bolts.push({ skill, x: player.x, y: player.y, path: lineTo(dx, dy), t0: now, done: 0, on: map });
    whiff();
    say(tr("You cast {spell}.", { spell: noun(skill.name, INK.name) }));
    return true;
  },
  // carries the character to the cell aimed at (see AIM), over whatever's between, if it's one
  // they can see and stand on
  blink({ name }, now, [dx, dy]) {
    if (!blinkable(dx, dy)) { say("You can't blink there."); return false; }
    if (dx) player.facing = dx < 0 ? "left" : "right";
    player.x += dx; player.y += dy;
    const n = Math.max(Math.abs(dx), Math.abs(dy));
    Object.assign(anim, { t0: -Infinity, fromX: player.x, fromY: player.y });
    fadeT0 = blinkT0 = now;
    whiff();
    say(tr("You cast {spell} and reappear {n} {n|one:cell|other:cells} away.", { spell: noun(name, INK.name), n }));
    return true;
  },
  // its boost does the rest (see cast())
  haste({ name }) {
    loot();
    say(tr("You cast {spell} and feel quick.", { spell: noun(name, INK.name) }));
    return true;
  },
  // frost on every monster within its `radius` round the character, in sight (a lumberjack there
  // turns on them for it, see enrage(); a charmed monster's spared), each may freeze (see HELD);
  // not worth casting with none there
  "ice-ring"(skill, now) {
    const cells = ringCells(skill.radius + gear("reach")), near = cells.filter(([x, y]) => (hostileAt(x, y) || angerableAt(x, y) || faithfulAt(x, y)) && inSight(x, y));
    if (!near.length) { say("There's nothing close enough to freeze."); return false; }
    freeze();
    frosts.push({ cells, t0: now, on: map });
    say(tr("You cast {spell}.", { spell: noun(skill.name, INK.name) }), now);
    for (const [x, y] of near) {
      const s = targetAt(x, y, now), dmg = spellHit(skill, stat("mag"), s.spd, s.dodge ?? 0, FIGHT.spells, s.def);
      wound(s, dmg, now, "your {by}", "Your {by} hits", true, skill.name);
      if (dmg !== null) afflict(s, skill, stat("mag"), now);
    }
    return true;
  },
  // strikes at once along the line to the cell aimed at (as far as a firebolt goes): the first
  // monster in the way, which may be paralysed (see HELD); it stops at a lumberjack (who turns on
  // the character for it), the priest (who's spared) or anything solid
  thunderbolt(skill, now, [dx, dy]) {
    if (dx) player.facing = dx < 0 ? "left" : "right";
    thunder();
    say(tr("You cast {spell}.", { spell: noun(skill.name, INK.name) }), now);
    let end = [player.x, player.y];
    for (const [cx, cy] of lineTo(dx, dy)) {
      const x = player.x + cx, y = player.y + cy, s = targetAt(x, y, now);
      if (s || priestAt(x, y)) strikeFx("thunderbolt", [x, y], now, !!s);
      if (s) {
        const dmg = spellHit(skill, stat("mag"), s.spd, s.dodge ?? 0, FIGHT.spells, s.def);
        wound(s, dmg, now, "your {by}", "Your {by} strikes", false, skill.name);
        if (dmg !== null) s.shockT0 = s.hitT0;   // (lit up as the strike lands, see SHOCK)
        if (dmg !== null) afflict(s, skill, stat("mag"), now);
        leap(s, dmg, skill, now);   // (the Storm's, see SHRINE)
        return true;
      }
      if (priestAt(x, y)) { say(smithAt(x, y) ? "The thunderbolt crackles round the blacksmith and leaves him unharmed." : "The thunderbolt crackles round the priest and leaves him unharmed."); return true; }
      if (standingTree(x, y) || shotStops(x, y)) break;
      end = [x, y];
    }
    strikeFx("thunderbolt", end, now, false);
    say("The thunderbolt strikes the ground.");
    return true;
  },
  stoneskin({ name }, now) {
    stoneT0 = now;
    stoneskin();
    say(tr("You cast {spell} and your skin hardens into stone.", { spell: noun(name, INK.name) }));
    return true;
  },
  // the barrier itself is put up once the turn's taken (see cast()), like a boost
  barrier({ name }) {
    ward();
    say(tr("You cast {spell} and a shimmering barrier surrounds you.", { spell: noun(name, INK.name) }));
    return true;
  },
  "summon-yig-warrior": (skill, now) => summon(skill, now),
  "summon-yig-mage": (skill, now) => summon(skill, now),
  "summon-yig-spirit": (skill, now) => summon(skill, now),
  // costs hp (never the last of it), and its boost does the rest
  rage({ name, hp }, now) {
    addFx("ring", now, { ink: "rage" });
    if (stats.hp <= hp) { say("You're too weak to rage."); return false; }
    stats.hp -= hp;
    pops.push({ runs: [[`-${hp}`, INK.down]], x: player.x, y: player.y, t0: now, on: map });
    rage();
    say(tr("You cast {spell} and trade {hp} hp for fury.", { spell: noun(name, INK.name), hp: [hp, INK.down] }));
    return true;
  },
  // The classes' own (skills.js tier 0, v0.12). Lunge: along the line to the cell aimed at, to the
  // first monster (or lumberjack) on it, the character carried to the cell before it, over open
  // ground only, and striking it as a firebolt would, but by atk
  lunge(skill, now, [dx, dy]) {
    let stand = [0, 0], foe = null;
    for (const [cx, cy] of lineTo(dx, dy)) {
      const x = player.x + cx, y = player.y + cy;
      if (foeAt(x, y) || angerableAt(x, y) || faithfulAt(x, y)) { foe = [x, y]; break; }
      if (!map.open(x, y) || map.doors.has(key(x, y)) || standingTree(x, y) || yigAt(x, y) || priestAt(x, y)) break;
      stand = [cx, cy];
    }
    if (!foe) { say("There's nothing to lunge at there."); return false; }
    if (dx) player.facing = dx < 0 ? "left" : "right";
    if (stand[0] || stand[1]) {
      Object.assign(anim, { t0: now, fromX: player.x, fromY: player.y });
      player.x += stand[0]; player.y += stand[1];
    }
    lungeDust(now, [player.x - stand[0], player.y - stand[1]], [player.x, player.y], foe);
    const s = targetAt(...foe, now);
    lunge();
    say(tr("You {spell}!", { spell: noun(skill.name, INK.name) }), now);
    wound(s, spellHit(skill, stat("atk"), s.spd, s.dodge ?? 0, FIGHT.spells), now, "your {by}", "You lunge at", false, skill.name);
    return true;
  },
  // turns the monsters that had noticed the character away from them (see SNEAK)
  sneak({ name }) {
    for (const f of foes) if (f.on === map && f.alert && !f.dead && !hunting(f) && !f.burrows) Object.assign(f, { alert: false, spotted: false });
    sneak();
    say(tr("You {spell:low} into the shadows.", { spell: noun(name, INK.name) }));
    return true;
  },
  adrenaline({ name }, now) {
    addFx("ring", now, { ink: "adrenaline" });
    adrenaline();
    say(tr("A rush of {spell:low} boils your blood.", { spell: noun(name, INK.name) }));
    return true;
  },
  // an arrow, flying like a firebolt (see boltLands())
  shoot(skill, now, [dx, dy]) {
    if (dx) player.facing = dx < 0 ? "left" : "right";
    bolts.push({ skill, x: player.x, y: player.y, path: lineTo(dx, dy), t0: now, done: 0, on: map });
    twang();
    say(tr("You {spell:low}.", { spell: noun(skill.name, INK.name) }));
    return true;
  },
  // a pike's reach: the first monster on the line, struck as a blow is (atk against def), no
  // further than its `range`; walls, doors and trees stop it (see PAIRED)
  thrust(skill, now, [dx, dy]) {
    let foe = null;
    for (const [cx, cy] of lineTo(dx, dy)) {
      const x = player.x + cx, y = player.y + cy;
      if (foeAt(x, y) || angerableAt(x, y) || faithfulAt(x, y)) { foe = [x, y]; break; }
      if (!map.open(x, y) || map.doors.has(key(x, y)) || standingTree(x, y) || yigAt(x, y) || priestAt(x, y)) break;
    }
    if (!foe) { say("There's nothing to thrust at there."); return false; }
    if (dx) player.facing = dx < 0 ? "left" : "right";
    const s = targetAt(...foe, now);
    lunge();
    say(tr("You {spell:low} your pike.", { spell: noun(skill.name, INK.name) }), now);
    wound(s, blow(stat("atk"), s.def, s.spd, s.dodge ?? 0), now, "your {by}", "Your pike hits", false, skill.name);
    return true;
  },
  guard({ name }, now) {
    addFx("ring", now, { ink: "guard" });
    ward();
    say(tr("You raise your {spell:low}.", { spell: noun(name, INK.name) }));
    return true;
  },
  // a shockwave on every monster within `radius` cells round the character, by atk, each may be
  // stunned; not worth it with none there
  hammertime(skill, now) {
    const cells = ringCells(skill.radius + gear("reach")), near = cells.filter(([x, y]) => (hostileAt(x, y) || angerableAt(x, y) || faithfulAt(x, y)) && inSight(x, y));
    if (!near.length) { say("There's nothing close enough to hit."); return false; }
    hammer();
    frosts.push({ cells, t0: now, on: map, tile: SCENE.shockwave });   // (shown as an Ice Ring's frost is, see FROST)
    say(tr("It's {spell}", { spell: noun(skill.name, INK.name) }), now);
    for (const [x, y] of near) {
      const s = targetAt(x, y, now), dmg = spellHit(skill, stat("atk"), s.spd, s.dodge ?? 0, FIGHT.spells);
      wound(s, dmg, now, "your {by}", "Your shockwave hits", true, skill.name);
      if (dmg !== null) afflict(s, skill, stat("atk"), now);
    }
    return true;
  },
  // the whole map shows for a few turns (see SCREECH)
  screech({ name }, now) {
    addFx("ring", now, { ink: "screech", r: LOOKOUT.light - SCREECH.less, ms: FX.ring.screechMs });
    screech();
    say(tr("You {spell:low} and the echoes show you everything round you.", { spell: noun(name, INK.name) }));
    return true;
  },
  // Tier IV (416:73093). Charm: the monster on the cell aimed at, one the character can see,
  // fights for them for a while (see CHARM); a miniboss (BOSSES: the demon, the goblin king, the
  // golem) won't be, nor a boss (an enemy that's `boss` in ENEMIES; none yet)
  charm(skill, now, [dx, dy]) {
    const x = player.x + dx, y = player.y + dy, s = foeAt(x, y);
    if (!s || !inSight(x, y)) { say("There's nothing there to charm."); return false; }
    if (BOSSES[s.kind] || ENEMIES[s.kind]?.boss) { say(tl("{foe:The} is too strong-willed to be charmed.", { foe: noun(s.called) })); return false; }
    if (dx) player.facing = dx < 0 ? "left" : "right";
    Object.assign(s, { charmed: skill.charm, alert: false, alertLeft: 0, spotted: true });
    addFx("specks", now, { to: mid(x, y), seed: Math.floor(now) & 0xffff });
    enthral();
    say(tr("You cast {spell} and {foe:the} turns to fight for you.", { spell: noun(skill.name, INK.name), foe: noun(s.called) }));
    return true;
  },
  // puts a void orb down on the cell aimed at, one the character can see and that's open (see ORB)
  "void-orb"(skill, now, [dx, dy]) {
    const x = player.x + dx, y = player.y + dy;
    if (!inSight(x, y) || !map.open(x, y)) { say("You can't place it there."); return false; }
    orbs.push({ skill, x, y, left: skill.orb, on: map });
    orbDrop();
    say(tr("You cast {spell}.", { spell: noun(skill.name, INK.name) }), now);
    return true;
  },
  // costs hp (never the last of it), then strikes as a thunderbolt does, without paralysing
  reaper(skill, now, target) {
    if (stats.hp <= skill.hp) { say("You're too weak to cast it."); return false; }
    if (target[0]) player.facing = target[0] < 0 ? "left" : "right";
    stats.hp -= skill.hp;
    pops.push({ runs: [[`-${skill.hp}`, INK.down]], x: player.x, y: player.y, t0: now, on: map });
    reaper();
    say(tr("You cast {spell} and give up {hp} hp.", { spell: noun(skill.name, INK.name), hp: [skill.hp, INK.down] }), now);
    if (strike(skill, now, target) === undefined) say("It strikes nothing.");
    return true;
  },
  // strikes as a thunderbolt does, and gives the character back `drain` hp when it hits
  drain(skill, now, target) {
    if (target[0]) player.facing = target[0] < 0 ? "left" : "right";
    siphon();
    say(tr("You cast {spell}.", { spell: noun(skill.name, INK.name) }), now);
    const dmg = strike(skill, now, target), n = Math.min(skill.drain, maxHp() - stats.hp), at = Math.max(now, nextBlowAt - FIGHT.gapMs);
    if (dmg === undefined) say("It finds no one to drain.");
    if (!dmg || n <= 0) return true;
    stats.hp += n;
    pops.push({ runs: [[`+${n}`, INK.up]], x: player.x, y: player.y, t0: at, on: map, heal: true });
    say(tr("You drain {n} hp.", { n: [n, INK.up] }), at);
    return true;
  },
};
// A Reaper's or Drain's strike: at once, along the line to the cell aimed at (as far as a
// firebolt goes), on the first monster in the way (a lumberjack turns on the character for it);
// the priest, a tree or anything solid stops it. The damage it did (null when dodged), or
// undefined when it hit no one.
function strike(skill, now, [dx, dy]) {
  let end = [player.x, player.y];
  for (const [cx, cy] of lineTo(dx, dy)) {
    const x = player.x + cx, y = player.y + cy, s = targetAt(x, y, now);
    if (s) {
      const dmg = spellHit(skill, stat("mag"), s.spd, s.dodge ?? 0, FIGHT.spells, s.def);
      strikeFx(skill.variant, [x, y], now, true);
      wound(s, dmg, now, "your {by}", "Your {by} strikes", false, skill.name);
      if (dmg !== null) s.shockT0 = s.hitT0;   // (lit up as it lands, see SHOCK)
      leap(s, dmg, skill, now);   // (the Storm's, see SHRINE)
      if (dmg !== null && skill.variant === "drain") addFx("drain", s.hitT0, { from: mid(x, y), seed: Math.floor(now) & 0xffff });
      return dmg;
    }
    if (priestAt(x, y) || standingTree(x, y) || shotStops(x, y)) { if (priestAt(x, y)) end = [x, y]; break; }
    end = [x, y];
  }
  strikeFx(skill.variant, end, now, false);
  return undefined;
}
// ORB: a Void Orb's orb (drawn as its icon) hurts everything on its own cell and the 8 round it,
// once each turn for its `orb` turns, the one it's cast in first: monsters, the character, their
// Yigs and charmed monsters alike, by the character's mag, each dodging it as a spell. Out of
// sight it goes on all the same; it's spent on another map without hurting anyone there.
const orbs = [];                   // { skill, x, y, left (turns), on (its map) }
function orbTurn(now) {
  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i], { name } = o.skill;
    if (o.on === map) addFx("square", now, { x: o.x, y: o.y });
    for (const [dx, dy] of [[0, 0], ...AROUND]) {
      const x = o.x + dx, y = o.y + dy;
      if (o.on !== map || dead) break;
      if (x === player.x && y === player.y) orbHitsYou(o, now);
      const w = yigAt(x, y), s = targetAt(x, y, now);
      if (w) {
        const dmg = spellHit(o.skill, stat("mag"), w.spd, 0, FIGHT.spells), at = struck(w, dmg, INK.down, now);
        say(dmg === null ? tr("Your {yig} dodges your {spell}.", { yig: noun(w.name), spell: noun(name, INK.name) })
          : tr("Your {spell} hits your {yig} for {n} damage.", { yig: noun(w.name), spell: noun(name, INK.name), n: [dmg, INK.down] }), at);
        if (dmg !== null && (w.hp -= dmg) <= 0) {
          Object.assign(w, { dead: true, diesAt: at });
          deaths.push({ x: w.x, y: w.y, t0: at, on: map });
          bleed(w, BLOOD.splat, at);
          say(tr("Your {yig} falls.", { yig: noun(w.name) }, INK.down), at);
        }
      }
      if (s) wound(s, spellHit(o.skill, stat("mag"), s.spd, s.dodge ?? 0, FIGHT.spells, s.def), now, "your {by}", "Your {by} hits", true, name);
    }
    if (--o.left > 0) continue;
    orbs.splice(i, 1);
    if (o.on === map && inSight(o.x, o.y)) say("The void orb collapses.", nextBlowAt - FIGHT.gapMs);
  }
}
// A Void Orb's hurt to the character, as a monster's spell would be (def and a Barrier cut it)
function orbHitsYou(o, now) {
  const block = 1 - Math.min(FIGHT.maxBlock, Math.max(0, stat("def")) / (Math.max(0, stat("def")) + FIGHT.defK));
  const cast = spellHit(o.skill, stat("mag"), stat("spd"), dodging(), FIGHT.spells), hit = cast === null ? null : Math.max(1, Math.round(cast * block));
  const soaked = hit !== null && shield ? Math.min(shield.left, hit) : 0, dmg = hit === null ? null : hit - soaked;
  const at = struck(player, dmg, INK.down, now, soaked && !dmg ? "absorbed" : null);
  const orb = noun(o.skill.name, INK.name);
  say(dmg === null ? tr("You dodge your own {spell}.", { spell: orb })
    : soaked && !dmg ? tr("Your {barrier} absorbs your {spell}.", { barrier: noun(shield.name, INK.name), spell: orb })
    : tr("Your {spell} hits you for {n} damage.", { spell: orb, n: [dmg, INK.down] }), at);
  if (soaked) barrierHitT0 = at;
  if (soaked && !(shield.left -= soaked)) { say(tr("Your {barrier} breaks.", { barrier: noun(shield.name, INK.name) }), at); shield = null; addFx("shards", at, { at: mid(player.x, player.y), seed: at & 0xffff }); }
  if (!dmg) return;
  const before = hpTier();
  stats.hp = Math.max(0, stats.hp - dmg);
  if (!stats.hp) return die(at, { by: "voidOrb" });
  if (hpTier() !== before && hpTier().warn) say([[tl(hpTier().warn), INK.down]], at);
}
// CHARM: a charmed monster (`charmed`, the turns left) fights for the character as a Yig warrior
// would (see YIG): it goes for the nearest monster in sight within YIG.reach and hits it (what it
// kills is the character's exp), or keeps within YIG.follow of them; walking into it swaps places
// with it. The other monsters hit it when it's next to them, and the character's own area spells
// spare it (a Void Orb doesn't). Once it's over it's after the character again.
function charmedAct(now, s) {
  const far = t => fogDistance(t.x - s.x, t.y - s.y, CW, CH);
  const t = foes.filter(f => f !== s && !f.dead && !(f.charmed > 0) && !f.still && f.on === map && inSight(f.x, f.y) && far(f) <= YIG.reach)
    .sort((a, b) => far(a) - far(b))[0];
  if (t && t.x !== s.x) s.facing = t.x < s.x ? "left" : "right";
  if (t && beside(s, t))
    return wound(t, blow(foeStat(s, "atk"), t.def, foeStat(t, "spd"), t.dodge ?? 0), now, "the {by}'s blow", "Your charmed {by} hits", true, s.called);
  if (t && moveFoe(now, s, chaseStep(s, false, [t.x, t.y]))) return;
  if (!near(s, YIG.follow)) moveFoe(now, s, chaseStep(s));
}
// A monster's blow at a charmed one next to it
function hitCharmed(s, t, now) {
  if (t.x !== s.x) s.facing = t.x < s.x ? "left" : "right";
  const dmg = blow(foeStat(s, "atk"), t.def, foeStat(t, "spd"), t.dodge ?? 0), at = struck(t, dmg, INK.down, now);
  const ours = noun(t.called), foe = noun(s.called);
  say(dmg === null ? tl("Your charmed {ours} dodges {foe:the}'s blow.", { ours, foe })
    : tr("{foe:The} hits your charmed {ours} for {n} damage.", { ours, foe, n: [dmg, INK.down] }), at);
  if (dmg === null || (t.hp -= dmg) > 0) return;
  Object.assign(t, { dead: true, diesAt: at });
  deaths.push({ x: t.x, y: t.y, t0: at, on: map });
  bleed(t, BLOOD.splat, at);
  say(tl("{foe:The} {dies}.", { foe: noun(t.called), dies: tl(t.dies) }), at);
}
// SNEAK (the rogue's Sneak): for `sneakLeft` turns monsters that haven't noticed the character
// don't (see skeletonAct()); attacking (a blow, or a spell that hurts) ends it, and the Sneak's
// own boost with it
let sneakLeft = 0;
function endSneak() {
  if (!sneakLeft) return;
  sneakLeft = 0;
  for (let i = boosts.length - 1; i >= 0; i--) if (boosts[i].sneak) boosts.splice(i, 1);
  say("You stop sneaking.");
}
// SCREECH (the siren's): for `revealLeft` turns everything round the character shows, whatever's
// in the way, `less` cells short of what a tower lets them see (LOOKOUT, see light() and sight()),
// monsters included
const seeAll = () => noFog;
// ...and each monster the echoes reach (as far as the character now sees) is scared off `scare`
// percent of the time (the user's ask, 2026-10-12: the siren sees what's coming and can keep it
// away): it runs from them for SCARED.turns turns, the "!" over its head, fighting only when
// cornered, as an evasive one does (see EVADE). Minibosses (BOSSES) and charmed ones don't scare.
// (5 turns is Claude's pick.)
const SCARED = { turns: 5 };
function scare(skill) {
  const far = FOG_END * fogSpread() / murk() + light();
  for (const s of foes) {
    if (s.dead || s.on !== map || BOSSES[s.kind] || s.charmed > 0 || s.scared > 0 || s.still) continue;
    if (fogDistance(player.x - s.x, player.y - s.y, CW, CH) >= far || random() * 100 >= skill.scare) continue;
    Object.assign(s, { scared: SCARED.turns, fleeing: true, alert: true, spotted: true });
    say(tr("{foe:The} is scared and flees!", { foe: noun(s.called) }, INK.down));
  }
}

// What a monster's spell does when it casts it, by variant: each returns false when it
// wouldn't be worth it just now (the monster acts otherwise instead). The log has it only while
// the monster's in sight. It casts regeneration once it's down to `healBelow` of its full hp; firebolt
// at the character when they're in range and nothing solid is in the way (not right next to
// it: it hits them then); blink to land as close as it can to the character, when they're more
// than `blinkFrom` cells off; haste as soon as it's chasing them.
const FOE_CAST = { healBelow: 0.5, blinkFrom: 3 };
const FOE_SPELLS = {
  regeneration(now, s, skill) {
    if (s.hp > s.fullHp * FOE_CAST.healBelow || s.regen.length) return false;
    s.regen = regenShares(skill);
    return tr("{foe:The} casts {spell} and its wounds begin to close.", { foe: noun(s.called), spell: noun(skill.name, INK.name) });
  },
  firebolt(now, s, skill) {
    const path = clearShot(s);
    if (!path) return false;
    bolts.push({ skill, from: s, x: s.x, y: s.y, path, t0: Math.max(now, nextBlowAt), done: 0, on: map });
    return tr("{foe:The} casts {spell}<down>!</>", { foe: noun(s.called), spell: noun(skill.name, INK.name), down: INK.down });
  },
  // the skeleton archer's arrow, flying as a firebolt does, as far as an archer's (Shoot's
  // `range`), and landing as a blow (see foeBoltLands())
  shoot(now, s, skill) {
    const path = clearShot(s, skill.range);
    if (!path) return false;
    bolts.push({ skill, from: s, x: s.x, y: s.y, path, t0: Math.max(now, nextBlowAt), done: 0, on: map });
    if (inSight(s.x, s.y)) setTimeout(twang, Math.max(0, nextBlowAt - now));
    return tr("{foe:The} shoots an arrow!", { foe: noun(s.called) }, INK.down);
  },
  // Tier II (a medium or hard monster's, now and then, see SPELLCASTERS). Ice Ring: frost round it,
  // when the character's within its `radius`, hurting them and maybe freezing them (see HOLD)
  "ice-ring"(now, s, skill) {
    if (Math.max(Math.abs(player.x - s.x), Math.abs(player.y - s.y)) > skill.radius || !inSight(s.x, s.y)) return false;
    const cells = [];
    for (let dy = -skill.radius; dy <= skill.radius; dy++) for (let dx = -skill.radius; dx <= skill.radius; dx++) if (dx || dy) cells.push([s.x + dx, s.y + dy]);
    freeze();
    frosts.push({ cells, t0: now, on: map });
    say(tr("{foe:The} casts {spell}<down>!</>", { foe: noun(s.called), spell: noun(skill.name, INK.name), down: INK.down }), Math.max(now, nextBlowAt));
    if (attackPlayer(s, now, skill) && random() * 100 < skill.freeze) holdPlayer("frozen", nextBlowAt - FIGHT.gapMs);
    return true;
  },
  // Thunderbolt: strikes the character at once when they're in a firebolt's range with nothing in
  // the way, maybe paralysing them (see HOLD)
  thunderbolt(now, s, skill) {
    const path = clearShot(s);
    if (!path) return false;
    thunder();
    say(tr("{foe:The} casts {spell}<down>!</>", { foe: noun(s.called), spell: noun(skill.name, INK.name), down: INK.down }), Math.max(now, nextBlowAt));
    if (attackPlayer(s, now, skill) && random() * 100 < skill.paralyse) holdPlayer("paralysed", nextBlowAt - FIGHT.gapMs);
    return true;
  },
  // its boost does the rest, cast once the character's next to it
  stoneskin(now, s, { name }) {
    if (!beside(player, s)) return false;
    stoneskin();
    return tr("{foe:The} casts {spell}<down> and its skin hardens!</>", { foe: noun(s.called), spell: noun(name, INK.name), down: INK.down });
  },
  // likewise, at the cost of its hp (never more than a third of what it has)
  rage(now, s, { name, hp }) {
    if (!beside(player, s) || s.hp <= hp * 3) return false;
    s.hp -= hp;
    rage();
    pops.push({ runs: [[`-${hp}`, INK.down]], x: s.x, y: s.y, t0: Math.max(now, nextBlowAt), on: map });
    return tr("{foe:The} casts {spell}<down> and flies into a fury!</>", { foe: noun(s.called), spell: noun(name, INK.name), down: INK.down });
  },
  blink(now, s, { name, blink }) {
    const far = (x, y) => Math.abs(player.x - x) + Math.abs(player.y - y);
    if (far(s.x, s.y) <= FOE_CAST.blinkFrom) return false;
    let best = null;
    for (let dy = -Math.ceil(blink); dy <= Math.ceil(blink); dy++)
      for (let dx = -Math.ceil(blink); dx <= Math.ceil(blink); dx++) {
        const x = s.x + dx, y = s.y + dy;
        if (inRange(dx, dy, blink) && foeCanStand(x, y) && (!best || far(x, y) < far(...best))) best = [x, y];
      }
    if (!best || far(...best) >= far(s.x, s.y) - 1) return false;
    [s.x, s.y] = best;
    Object.assign(s.anim, { t0: -Infinity, fromX: s.x, fromY: s.y });
    return tr("{foe:The} casts {spell}<down> and reappears closer!</>", { foe: noun(s.called), spell: noun(name, INK.name), down: INK.down });
  },
  haste(now, s, { name }) {
    return tr("{foe:The} casts {spell}<down> and speeds up!</>", { foe: noun(s.called), spell: noun(name, INK.name), down: INK.down });
  },
};
// A monster casting its spell, if it's ready and worth it (see FOE_SPELLS); whether it did
// (`true` from one that's said so itself)
function foeCasts(now, s) {
  const skill = SKILLS[s.spell];
  if (DAILY.noSkills || s.cooling > 0 || s.boosts.some(b => !b.hex)) return false;
  const says = FOE_SPELLS[skill.variant](now, s, skill);
  if (!says) return false;
  s.cooling = skill.cooldown;
  s.boosts.push(...boostsOf(skill));
  if (says !== true && inSight(s.x, s.y)) { whiff(); say(says, Math.max(now, nextBlowAt)); }
  return true;
}
// The line from a monster to the character, if it's a clear shot: in sight, within `range`
// (a firebolt's), not right next to it, with nothing solid between; it turns to face them. Null otherwise.
function clearShot(s, range = BOLT.range) {
  const dx = player.x - s.x, dy = player.y - s.y, path = lineTo(dx, dy);
  if (Math.max(Math.abs(dx), Math.abs(dy)) <= 1 || !inRange(dx, dy, range) || !inSight(s.x, s.y)) return null;
  if (path.slice(0, -1).some(([cx, cy]) => standingTree(s.x + cx, s.y + cy) || shotStops(s.x + cx, s.y + cy))) return null;
  if (dx) s.facing = dx < 0 ? "left" : "right";
  return path;
}
// HOLD: a monster's Ice Ring can freeze the character, losing them their next `frozen` turns
// outright, and its Thunderbolt paralyse them, for `paralysed` turns each action lost
// HELD.paralysedLoses of the time (as a monster held by theirs is, see HELD)
const HOLD = { frozen: 2, paralysed: 3 };
const playerHeld = { frozen: 0, paralysed: 0 };
function holdPlayer(how, at) {
  playerHeld[how] = Math.max(playerHeld[how], HOLD[how]);
  say(tr(how === "frozen" ? "You're frozen solid!" : "You're paralysed!", {}, HELD.ink[how === "frozen" ? "freeze" : "paralyse"]), at);
}
// Whether the character's action is lost to being held: if it is, the turn passes all the same
function heldBack(now) {
  const frozen = playerHeld.frozen > 0, paralysed = !frozen && playerHeld.paralysed > 0;
  if (!frozen && !paralysed) return false;
  if (frozen) playerHeld.frozen--;
  else playerHeld.paralysed--;
  if (paralysed && random() >= HELD.paralysedLoses) return false;
  say(frozen ? (playerHeld.frozen ? "You're frozen, and can't move." : "You thaw out.") : "You're paralysed, and can't move.");
  turnTaken();
  skeletonTurn(now);
  return true;
}

// The Yig (npc type=yig-warrior, yig-mage and yig-spirit, 201:68821-201:68932): what a tier III
// summon (skills.js) calls up on a free cell beside the character, to fight beside them till it
// dies, one of each kind at a time. Its stats are its kind's, times its spell's `scale` and
// `perMag` more for each point of the character's mag past 1, all but its spd: 12 for every kind (the user's,
// 2026-10-11; a cursed one's is 2 lower, for good). It acts at its spd against the character's, as a monster does (see
// skeletonTurn()), going for the nearest monster in sight no more than `reach` cells off (an
// ent only once it's roused); a warrior walks up and fights it hand to hand. A mage heals the
// character by its Regeneration's hp, at once, when they're below `healBelow` of their hp
// (then not for `healEvery` turns), and otherwise throws its Firebolt (by its own mag) at the
// monster, then not for `boltEvery` turns. A spirit, every `every` turns, puts one of its spells
// on the character (Regeneration when they're below `hurt` hp, Stoneskin with a monster on
// them, Haste otherwise), or, every other time, its `hex` on the monster. The spells it casts
// are of its own affix (a cursed one's superior). With no monster to go for, or one a mage or
// spirit can't reach, it keeps within `follow` cells of the character, and walking into it swaps
// places with it. One left more than `leash` cells behind (a slow one, say) appears again beside
// the character at the end of its turn, and every one comes along through a door, to another
// area or floor (the user's ask, 2026-10-11; `leash` is Claude's pick). Monsters hit one
// that's in their way instead of walking past it, and their bolts hit one in their line;
// what a Yig kills is the character's exp. Numbers are Claude's.
const YIG = {
  reach: 6, follow: 2, leash: 8, perMag: 0.25,
  kinds: {
    warrior: { name: "Yig Warrior", hp: 100, atk: 3, def: 2, mag: 1, spd: 12 },
    mage: { name: "Yig Mage", hp: 70, atk: 1, def: 1, mag: 2, spd: 12, healBelow: 0.5, healEvery: 8, boltEvery: 4 },
    spirit: { name: "Yig Spirit", hp: 70, atk: 1, def: 1, mag: 2, spd: 12, every: 5, hurt: 60,
      hex: { name: "Hex", stats: { atk: -2, spd: -2 }, turns: 3 } },
  },
};
const near = (w, n) => Math.max(Math.abs(w.x - player.x), Math.abs(w.y - player.y)) <= n;
// A free cell for a Yig: right round the character, or one further out; null when there's none
function yigCell() {
  for (const r of [1, 2]) {
    const ring = [];
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = player.x + dx, y = player.y + dy;
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r && foeCanStand(x, y, false, true) && !map.doors.has(key(x, y))) ring.push([x, y]);
      }
    if (ring.length) return ring[Math.floor(random() * ring.length)];
  }
  return null;
}
// Puts a Yig on a free cell by the character, on the map they're on (when there's one)
function placeYig(w) {
  const at = yigCell();
  if (!at) return false;
  [w.x, w.y] = at;
  w.on = map;
  Object.assign(w.anim, { t0: -Infinity, fromX: w.x, fromY: w.y });
  return true;
}
// Allies that aren't Yig (see RELIC): a Bone Flute's skeleton and a Lantern of Lost Souls' ghost,
// each the night's only (gone at dawn, `night`), in blue (`look`, made by withAllyTiles()), going
// after monsters as a Yig Warrior does. Their own looks' every px is put on the `blue` ramp by
// how light it is. A skeleton's hp and atk grow `perDay` with the days, as the risen do.
const ALLY = { blue: ["#222034", "#3f3f74", "#5b6ee1", "#639bff", "#cbdbfc"], looks: ["skeleton", ...Object.keys(CLASSES).map(c => `ghost-${c}`)],
  skeleton: { hp: 55, atk: 3, def: 2, spd: 10, perDay: 0.3 } };
function makeAlly({ name, look, hp, atk, def, mag = 1, spd }) {
  const w = { kind: "ally", chases: true, night: true, name, look: SCENE[`ally-${look}`], hp, fullHp: hp, atk, def, mag, spd,
    facing: player.facing, energy: 0, cooling: 0, healing: 0, hexNext: false, dead: false, hitT0: -Infinity, anim: { t0: -Infinity, fromX: 0, fromY: 0 } };
  if (!w.look || !placeYig(w)) return null;
  w.summonT0 = clock();
  addFx("puff", w.summonT0, { at: mid(w.x, w.y), seed: Math.floor(w.summonT0) & 0xffff });
  yigs.push(w);
  return w;
}
function boneAlly() {
  const A = ALLY.skeleton, k = 1 + A.perDay * (dayNumber() - 1);
  if (makeAlly({ name: tl("Skeleton"), look: "skeleton", hp: Math.round(A.hp * k), atk: Math.round(A.atk * k), def: A.def, spd: A.spd }))
    say(tr("A skeleton claws its way up beside you, and bows to your {item}.", { item: itemNoun("bone-flute", INK.name) }));
}
function soulAlly({ name, ghost: g }) {
  if (!GHOSTS.classes.includes(g.cls)) return;
  const k = Math.min(1, (progress.level + GHOSTS.levels) / Math.max(1, g.level)) * GHOSTS.weaker, by = n => Math.max(1, Math.round(n * k));
  if (makeAlly({ name: tl("Lost Soul of {name}", { name }), look: `ghost-${g.cls}`, hp: by(g.hp), atk: by(g.atk), def: Math.round(g.def * k), mag: by(g.mag), spd: g.spd }))
    say(tr("Your lantern flickers. The {soul} rises beside you, and fights for you tonight.", { soul: [tl("lost soul of {name}", { name }), INK.name] }));
}
function withAllyTiles(img) {
  const c = document.createElement("canvas"), looks = ALLY.looks.filter(l => SCENE[l]?.normal);
  [c.width, c.height] = [img.width + looks.length * 2 * CW, img.height];
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  const ramp = ALLY.blue.map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)));
  looks.forEach((look, i) => {
    SCENE[`ally-${look}`] = {};
    ["left", "right"].forEach((facing, j) => {
      const at = img.width / CW + 2 * i + j;
      g.drawImage(img, SCENE[look].normal[facing] * CW, 0, CW, CH, at * CW, 0, CW, CH);
      const px = g.getImageData(at * CW, 0, CW, CH), d = px.data;
      for (let p = 0; p < d.length; p += 4) {
        if (!d[p + 3]) continue;
        const l = (0.3 * d[p] + 0.59 * d[p + 1] + 0.11 * d[p + 2]) / 255, to = ramp[Math.min(ramp.length - 1, Math.floor(l * ramp.length))];
        [d[p], d[p + 1], d[p + 2]] = to;
      }
      g.putImageData(px, at * CW, 0);
      SCENE[`ally-${look}`][facing] = at;
    });
  });
  return c;
}
function summon(skill, now) {
  const k = YIG.kinds[skill.summons];
  if (yigs.some(w => !w.dead && w.kind === skill.summons)) { say(tl("Your {yig} is still with you.", { yig: noun(k.name) })); return false; }
  const m = skill.scale * (1 + YIG.perMag * (stat("mag") - 1)), by = n => Math.round(n * m);
  const name = skill.affix === "normal" ? nameOf(k.name) : tl("{affix} {yig}", { affix: tl(AFFIX_NAMES[skill.affix]), yig: noun(k.name) });   // (as it's shown, translated)
  const w = { ...k, kind: skill.summons, name, hp: Math.max(1, by(k.hp)), atk: Math.max(1, by(k.atk)), def: by(k.def),
    mag: Math.max(1, by(k.mag)), spd: k.spd + (skill.spd ?? 0), casts: skill.affix === "cursed" ? "superior" : skill.affix,
    facing: player.facing, energy: 0, cooling: 0, healing: 0, hexNext: false, dead: false, hitT0: -Infinity,
    anim: { t0: -Infinity, fromX: 0, fromY: 0 } };
  if (!placeYig(w)) { say("There's no room to summon it."); return false; }
  w.fullHp = w.hp;
  w.summonT0 = now;
  addFx("puff", now, { at: mid(w.x, w.y), seed: Math.floor(now) & 0xffff });
  yigs.push(w);
  whiff();
  say(tr("You cast {spell}, and {yig:a} appears beside you.", { spell: noun(skill.name, INK.name), yig: noun(name) }));
  return true;
}
// The Yig's turn (see YIG), before the monsters'; those that died are gone once they've been seen to
function yigTurn(now) {
  for (let i = yigs.length - 1; i >= 0; i--) if (yigs[i].dead && now >= yigs[i].diesAt) yigs.splice(i, 1);
  const pace = Math.max(1, stat("spd"));
  for (const w of yigs) {
    if (w.dead || w.on !== map) continue;
    if (w.cooling > 0) w.cooling--;
    if (w.healing > 0) w.healing--;
    for (w.energy += w.spd; w.energy >= pace && !w.dead; w.energy -= pace) yigAct(now, w);
  }
  for (const w of yigs) {          // (too far behind, or left on another map with no room by the door: see YIG.leash)
    if (w.dead || (w.on === map && near(w, YIG.leash))) continue;
    if (placeYig(w)) say(tr("Your {yig} catches up with you.", { yig: noun(w.name, INK.name) }));
  }
}
// The monster a Yig goes for, if any
function yigTarget(w) {
  const far = s => fogDistance(s.x - w.x, s.y - w.y, CW, CH);
  return foes.filter(s => !s.dead && !(s.charmed > 0) && !s.still && s.on === map && (s.alert || !s.wanders) && inSight(s.x, s.y) && far(s) <= YIG.reach)
    .sort((a, b) => far(a) - far(b))[0];
}
function yigAct(now, w) {
  const s = yigTarget(w), next = s && beside(s, w);
  if (s && s.x !== w.x) w.facing = s.x < w.x ? "left" : "right";
  if (w.kind === "mage" && !w.healing && stats.hp < maxHp() * w.healBelow && !dead) return yigHeals(now, w);
  if (s && w.kind === "spirit" && !w.cooling && yigChants(now, w, s)) return;
  if (s && w.kind === "mage" && !w.cooling && !next && yigBolts(now, w, s)) return;
  if (s && next) return yigHits(now, w, s);
  if (s && (w.kind === "warrior" || w.chases) && moveFoe(now, w, chaseStep(w, false, [s.x, s.y]))) return;
  if (!near(w, YIG.follow)) moveFoe(now, w, chaseStep(w));
}
function yigHits(now, w, s) {
  wound(s, blow(w.atk, s.def, foeStat(s, "spd"), s.dodge ?? 0), now, "your {by}'s blow", "Your {by} hits", true, w.name);
}
function yigHeals(now, w) {
  const n = Math.min(SKILLS[`regeneration-${w.casts}`].regen, maxHp() - stats.hp), at = Math.max(now, nextBlowAt);
  stats.hp += n;
  w.healing = w.healEvery;
  pops.push({ runs: [[`+${n}`, INK.up]], x: player.x, y: player.y, t0: at, on: map, heal: true });
  say(tr("Your {yig} heals you for {n} hp.", { yig: noun(w.name), n: [n, INK.up] }), at);
}
// A Yig mage's Firebolt at the monster, if it's in range with nothing in the way (the
// character or another Yig included); whether it threw it
function yigBolts(now, w, s) {
  const dx = s.x - w.x, dy = s.y - w.y, path = lineTo(dx, dy);
  if (!inBoltRange(dx, dy)) return false;
  const solid = (x, y) => standingTree(x, y) || shotStops(x, y) ||
    (x === player.x && y === player.y) || yigAt(x, y) || foeAt(x, y) || jackAt(x, y) || priestAt(x, y);
  if (path.slice(0, -1).some(([cx, cy]) => solid(w.x + cx, w.y + cy))) return false;
  const skill = SKILLS[`firebolt-${w.casts}`];
  bolts.push({ skill, ally: w, x: w.x, y: w.y, path, t0: Math.max(now, nextBlowAt), done: 0, on: map });
  w.cooling = w.boltEvery;
  whiff();
  say(tr("Your {yig} casts {spell}.", { yig: noun(w.name), spell: noun(skill.name, INK.name) }), Math.max(now, nextBlowAt));
  return true;
}
// A Yig spirit's spell: on the character, or its hex on the monster (see YIG); whether it cast one
function yigChants(now, w, s) {
  const at = Math.max(now, nextBlowAt), close = foes.some(f => !f.dead && f.on === map && beside(f, player));
  const pick = hpPct() < w.hurt ? "regeneration" : close ? "stoneskin" : "haste", spell = SKILLS[`${pick}-${w.casts}`];
  const name = `${w.name}'s ${spell.name}`, has = boosts.some(b => b.name === name) || regens.some(r => r.name === name);
  w.cooling = w.every;
  whiff();
  if (w.hexNext || has) {
    w.hexNext = false;
    if (s.boosts.some(b => b.hex)) return false;
    s.boosts.push({ name: w.hex.name, stats: { ...w.hex.stats }, left: w.hex.turns, hex: true });
    say(tr("Your {yig} casts {spell} on {foe:the}.", { yig: noun(w.name), spell: noun(w.hex.name, INK.name), foe: noun(s.called) }), at);
    return true;
  }
  w.hexNext = true;
  if (spell.regen) regens.push({ name, shares: regenShares(spell) });
  for (const b of boostsOf(spell)) boosts.push({ name, ...b });
  say(tr("Your {yig} casts {spell} on you.", { yig: noun(w.name), spell: noun(spell.name, INK.name) }), at);
  return true;
}
// The Yig right next to a monster, if any
const yigBeside = s => yigs.find(w => !w.dead && w.on === map && beside(w, s));
// A monster's blow at a Yig, or its bolt (`spell`), as at the character
function attackYig(s, w, now, spell = null) {
  if (!spell && w.x !== s.x) s.facing = w.x < s.x ? "left" : "right";
  const dmg = spell ? spellHit(spell, foeStat(s, "mag"), w.spd) : blow(foeStat(s, "atk"), w.def, w.spd);
  const at = struck(w, dmg, INK.down, now), yig = noun(w.name), foe = noun(s.called), cast = spell && noun(spell.name, INK.name);
  say(dmg === null ? tr(spell ? "Your {yig} dodges {foe:the}'s {spell}." : "Your {yig} dodges {foe:the}'s blow.", { yig, foe, spell: cast })
    : tr(spell ? "{foe:The}'s {spell} hits your {yig} for {n} damage." : "{foe:The} hits your {yig} for {n} damage.", { yig, foe, spell: cast, n: [dmg, INK.down] }), at);
  if (dmg === null || (w.hp -= dmg) > 0) return;
  Object.assign(w, { dead: true, diesAt: at });
  deaths.push({ x: w.x, y: w.y, t0: at, on: map });
  bleed(w, BLOOD.splat, at);
  say(tr("Your {yig} falls.", { yig: noun(w.name) }, INK.down), at);
}

// A skeleton's blow, against the character's def and spd with what's equipped, and any
// dodge their gear adds; what lands is cut by the percent their gear `reduce`s it (up to
// FIGHT.maxReduce), never below 1. Its firebolt (`spell`, the skill) lands the same way, its
// damage the spell's, by its mag (see spellHit()).
function attackPlayer(s, now, spell = null) {
  // (a spell's blocked by def as a blow is, v0.12: "DEF makes you more resistant to ATK and MAG
  // based hits", 406:67419's help)
  const spellBlock = 1 - Math.min(FIGHT.maxBlock, Math.max(0, stat("def")) / (Math.max(0, stat("def")) + FIGHT.defK));
  const cast = spell && spellHit(spell, foeStat(s, "mag"), stat("spd"), dodging());
  const hit = spell ? (cast === null ? null : Math.max(1, Math.round(cast * spellBlock)))
    : blow(foeStat(s, "atk"), stat("def"), stat("spd"), dodging());
  const reduce = gear("reduce") + (hero().reduce ?? 0) + boosts.reduce((n, b) => n + (b.stats.reduce ?? 0), 0);   // (a Guard's, see PAIRED)
  const landed = hit === null ? null : Math.max(1, Math.round(hit * (1 - Math.min(reduce, FIGHT.maxReduce) / 100)));
  // (a Barrier soaks up what it can of it first)
  const soaked = landed !== null && shield ? Math.min(shield.left, landed) : 0, dmg = landed === null ? null : landed - soaked;
  const at = struck(player, dmg, INK.down, now, soaked && !dmg ? "absorbed" : null);
  const foe = noun(s.called), its = spell && noun(spell.name, INK.name), barrier = shield && noun(shield.name, INK.name), n = [dmg, INK.down];
  const weapon = s.gear && ITEMS[s.gear].slot === "weapon" ? noun(ITEMS[s.gear].name, INK.name) : null;
  say(soaked && !dmg ? tr(spell ? "Your {barrier} absorbs {foe:the}'s {spell}." : "Your {barrier} absorbs {foe:the}'s blow.", { barrier, foe, spell: its })
    : spell ? (dmg === null ? tr("You dodge {foe:the}'s {spell}.", { foe, spell: its }) : tr("{foe:The}'s {spell} hits you for {n} damage.", { foe, spell: its, n }))
    : dmg === null ? tl("You dodge {foe:the}'s blow.", { foe })
    : weapon ? tr("{foe:The} hits you with its {weapon} for {n} damage.", { foe, weapon, n }) : tr("{foe:The} hits you for {n} damage.", { foe, n }), at);
  if (soaked && dmg) say(tr("Your {barrier} absorbs {n} of it.", { barrier, n: soaked }), at);
  if (soaked) barrierHitT0 = at;
  if (soaked && !(shield.left -= soaked)) {
    say(tr("Your {barrier} breaks.", { barrier: noun(shield.name, INK.name) }), at);
    shield = null;
    addFx("shards", at, { at: mid(player.x, player.y), seed: at & 0xffff });
  }
  if (!dmg) return dmg;
  const before = hpTier();
  stats.hp = Math.max(0, stats.hp - dmg);
  if (!stats.hp) { die(at, { by: s.ghostGear ? "ghost" : s.risen ? `${s.kind}-risen` : s.kind, foe: s }); return dmg; }
  if (hpTier() !== before && hpTier().warn) say([[tl(hpTier().warn), INK.down]], at);
  return dmg;
}

// Breadth-first from a skeleton to the character over open ground (never the doorway, the
// doorstep where the character comes back out, or another skeleton), within `search` cells;
// the first cell of the way there, or null when it's already next to them or there's no way.
// `throughTrees` (the demon) counts the forest's trees as open ground. No monster sets foot on a
// church's clearing (world.js `sanctuary`), though the character's own Yigs (`ally`) may.
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];   // (the only ways anyone steps or strikes)
// Whether two are next to each other, side by side (a corner isn't next to)
const beside = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
const foeGround = (x, y, throughTrees) => throughTrees && map === MAPS.outside ? !blocked.has(key(x, y)) && river.cell(x, y) !== "water" : map.open(x, y);
const foeCanStand = (x, y, throughTrees = false, ally = false) =>
  foeGround(x, y, throughTrees) &&
  (ally || map !== MAPS.outside || !world.sanctuary.has(key(x, y))) && (ally || !map.smith?.room.has(key(x, y))) &&
  !map.keepClear.has(key(x, y)) && !foeAt(x, y) && !yigAt(x, y) && !jackAt(x, y) && !priestAt(x, y) && !(x === player.x && y === player.y);
// (a Yig's way to the monster it's after, or back to the character, is found the same way, to `to`)
function chaseStep(s, throughTrees = false, to = [player.x, player.y]) {
  const start = key(s.x, s.y), goal = key(...to);
  const prev = new Map([[start, null]]), queue = [[s.x, s.y]];
  const walkable = (x, y) => foeCanStand(x, y, throughTrees, yigs.includes(s));
  while (queue.length) {
    const [x, y] = queue.shift();
    if (key(x, y) === goal) {
      let k = goal;
      while (prev.get(k) !== start) k = prev.get(k);
      return k === goal ? null : k.split(",").map(Number);
    }
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if (prev.has(k) || Math.abs(nx - s.x) > ENEMY.search || Math.abs(ny - s.y) > ENEMY.search) continue;
      if (k !== goal && !walkable(nx, ny)) continue;
      prev.set(k, key(x, y));
      queue.push([nx, ny]);
    }
  }
  return null;
}

// A step straight at the character (or `to`), along whichever way brings it closer (the
// demon, when they're too far off to look for the shortest way), or null if both are in the way
function towards(s, [tx, ty] = [player.x, player.y]) {
  const dx = Math.sign(tx - s.x), dy = Math.sign(ty - s.y);
  const left = ([x, y]) => fogDistance(tx - x, ty - y, CW, CH);
  return [[s.x + dx, s.y], [s.x, s.y + dy]]
    .filter(([x, y]) => (x !== s.x || y !== s.y) && foeCanStand(x, y, true))
    .sort((a, b) => left(a) - left(b))[0] ?? null;
}

// Through a doorway: land on the other map's spawn cell, camera snapped there, fading in
function enter(door, now) {
  const next = door.to(), at = door.spawn ?? next.spawn;
  const along = yigs.filter(w => !w.dead);
  [player.x, player.y] = typeof at === "function" ? at() : at;
  map = next;
  if (next.depth) { tally.floors.add(next.id); tally.deepest = Math.max(tally.deepest, next.depth); }
  if (next.church) used("church");
  for (const w of along) placeYig(w);
  Object.assign(anim, { t0: -Infinity, fromX: player.x, fromY: player.y });
  Object.assign(cam, camTarget());
  fadeT0 = now;
  if (next === MAPS.inside && next.note && !next.note.read) tell(NOTES.house.enter);
  else say(door.says ?? next.says);
  if (next.note && !next.note.read && next !== MAPS.inside) tell(next.note.carved ? NOTES.carved : NOTES.pinned);
  footstep();
}

// Held-direction input: of the keys held, the last pressed is the way (never diagonally; let
// go of, the one held before it takes over). A press steps at once, bar a SETTLE_MS wait (so
// one let go of as another goes down, swapping ways, isn't stepped in again), then repeats
// at STEP_MS while held; from standing still the first repeat waits STEP_MS * 2, but a
// press while already walking (swapping ways, or turning a corner) keeps the pace.
let jackSaid = -Infinity;          // a lumberjack speaks no more than once every JACK_SAYS_MS, however the key's held
const JACK_SAYS_MS = 700;
const DIRS = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0],
};
// (the bag's own keys take S and D, so only the arrows move about in it)
const ARROWS = Object.fromEntries(Object.entries(DIRS).filter(([k]) => k.startsWith("Arrow")));
const SETTLE_MS = 30;
const held = [];   // most recent last
let nextStep = 0, lastStep = -Infinity;
// The keys that move: the arrows, and the settings' (settings.js moveKeys(), up, down, left, right)
const WAYS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
onSettings(() => {
  for (const k of Object.keys(DIRS)) if (!k.startsWith("Arrow")) delete DIRS[k];
  moveKeys().forEach((k, i) => { if (k) DIRS[k] = WAYS[i]; });
  held.length = 0;
});
function heldWay() {
  return held.at(-1)?.dir ?? null;
}

// What the notice shows for an item: its stat cells, as [stat, value runs, delta runs], its
// main stat first (items.js `main`), the rest max hp (the heart pin's, shown "+" and labelled
// "+max HP" after any delta, as the sheet does, 494:67394) then STAT_ORDER
function noticeStats(id) {
  const item = ITEMS[id];
  if (item.consumable) return potionStats(seenAs(id));
  if (!item.slot || item.keepsake || item.relic) return [];   // (a keepsake's card has none, not even what's worn's to compare)
  const now = wearing(item.slot), order = [item.main, ...["hp", ...STAT_ORDER].filter(k => k !== item.main)].filter(Boolean);
  return order.filter(k => bonus(id, k) || bonus(now, k)).map(k => {
    const v = bonus(id, k), d = v - bonus(now, k);
    const delta = d ? [[(d < 0 ? "" : "+") + d, d > 0 ? INK.up : INK.less]] : [];
    return k === "hp" && v > 0 ? [k, [["+" + v, INK.value]], [...delta, [(d ? " " : "") + tl("+max HP"), INK.up]]] : [k, [[String(v), INK.value]], delta];
  });
}

// What a potion's card shows for what it does, one to a row (306:29639): the hp it gives back,
// the turns it takes off the spells' cooldowns, each stat it boosts and for how long, and the
// hp it costs (nothing, for an Unknown Potion not yet known)
function potionStats({ heal, cooldown, boost = {}, hp }) {
  const cell = (k, n, note = "") => [k, [[n, INK.title]], [[note, INK.same]]];
  return [...(heal ? [cell("hp", `+${heal}`)] : []), ...(cooldown ? [cell("cooldown", tl("-{n} turns", { n: cooldown }))] : []),
    ...Object.entries(boost).map(([k, [n, turns]]) => cell(k, `${n < 0 ? "" : "+"}${n}`, ` ${tl("{n} turns", { n: turns })}`)),
    ...(hp ? [cell("hp", `-${hp}`)] : [])];
}
const statIcon = k => HUD.statIcons[k === "reduce" ? "def" : k] ?? SCENE[k];   // (a Guard's reduce under the shield)   // (a spell's cooldown's is SCENE.cooldown, its damage's SCENE.dmgAtk/dmgMag)

// What else an item does, as the sheets word it (in green, a drawback in red), then its traits
// (in purple), wrapped to `w` notice px: lines of runs
const noticeSpecials = (id, w, wrapLine = (text, ink) => wrap(text, ink, w, NOTICE.smallPx)) => {
  const { fells, digs, dodge, reduce, light, regen, drain, embers, sense, radar, hunted, chill, shock, reach, cool, traits = [] } = ITEMS[id];
  // (translated, see lang.js)
  return [
    ...(fells ? [tl("+cut trees")] : []), ...(digs ? [tl("+dig")] : []), ...(reduce ? [tl("+{n}% dmg reduction", { n: reduce })] : []),
    ...(dodge ? [tl("+{n}% dodge", { n: dodge })] : []), ...(light ? [tl("+{n} light radius", { n: light })] : []), ...(regen ? [tl("+1HP / {n} turns", { n: regen })] : []),
    ...(drain ? [tl("+drain")] : []), ...(embers ? [tl("+fiery footprints")] : []), ...(sense ? [tl("+detect enemies on screen as a red \"?\".")] : []),
    ...(radar ? [tl("+miniboss radar")] : []), ...(hunted ? [tl("-all minibosses hunt you")] : []),
    ...(chill ? [tl("+slow aura, -{spd} SPD to foes {n} tiles radius from you.", { spd: CHILL.spd, n: CHILL.radius })] : []),
    ...(shock ? [tl("+{n}% paralyse chance on normal & magic attacks.", { n: shock })] : []), ...(reach ? [tl("+{n} range to all skills", { n: reach })] : []),
    ...(cool ? [tl("+{n} less cooldown on all skills", { n: cool })] : []),
  ].flatMap(text => wrapLine(text, text[0] === "-" ? INK.down : INK.up))
    .concat(traits.flatMap(t => wrapLine("\u2022" + tl(t), INK.trait)));
};

// Splits text into lines no wider than `w` px, breaking between words, where a font px is
// `scale` px. The notice wraps in its own px, as the mock does, so the lines break in the same
// places on every screen; like Figma, it doesn't count the blank column after the last letter
// and rounds to whole px.
function wrap(text, colour, w, scale) {
  if (/[\u2e80-\u9fff]/u.test(tl(text))) return wrapChinese(tl(text), t => Math.round((textWidth([[t]]) - 1) * scale), w).map(t => [[t, colour]]);
  const lines = [];
  for (const word of tl(text).split(/\s+/).filter(Boolean)) {
    const line = lines.at(-1), longer = line && `${line} ${word}`;
    if (line && Math.round((textWidth([[longer]]) - 1) * scale) <= w) lines[lines.length - 1] = longer;
    else lines.push(word);
  }
  return lines.map(line => [[line, colour]]);
}

// The notice's and the panel's scale: screen px per notice px, font px, and helpers
let uiU = 1;                       // screen px per notice px, for the notice or panel being drawn
function uiMetrics() {
  const N = NOTICE, u = uiU;
  const f = Math.max(1, Math.round(N.fontPx * u));
  let fs = Math.max(1, Math.round(N.smallPx * u));
  if (fs >= f && f >= 3) fs = f - 1;  // keep the small text smaller, where it can be
  return { u, f, fs, px: v => Math.round(v * u), tw: runs => textWidth(runs) * f, lineH: SCENE.font.h * fs };
}
// Sets uiU for a notice or panel: `zoom` times the UI's scale, or the biggest that keeps its
// width (as measure() finds it) and its shadow clear of the sides
function fitUi(measure) {
  for (uiU = Math.max(1, Math.round(NOTICE.zoom * uiScale)); uiU > 1; uiU--)
    if (measure() + 2 * Math.round(NOTICE.shadow * uiU) <= canvas.width - 2 * gutter) return;
}

// A dithered shadow under an overlay at x, y, w by h screen px: dark1 on every other notice
// px, like a checkerboard, NOTICE.shadow px down and right
const shadowPatterns = new Map();  // by notice px size
function drawShadow(x, y, w, h) {
  const { u, px } = uiMetrics(), d = px(NOTICE.shadow);
  if (!shadowPatterns.has(u)) {
    const c = document.createElement("canvas");
    c.width = c.height = 2 * u;
    const g = c.getContext("2d");
    g.fillStyle = NOTICE.box;
    g.fillRect(0, 0, u, u);
    g.fillRect(u, u, u, u);
    shadowPatterns.set(u, ctx.createPattern(c, "repeat"));
  }
  ctx.save();
  ctx.translate(x + d, y + d);     // the checks line up with the overlay's own px
  ctx.fillStyle = shadowPatterns.get(u);
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// What a skill's card shows for it, as an item's stat cells are (138:20400): the hp it gives
// back and over how long, the damage it does and its chance to burn, freeze or paralyse, each
// stat it boosts and for how long, the hp it costs, the damage a barrier absorbs and for how
// long (its damage under a sword when it goes by atk, a cross when by mag, 597:305941/305955), what a cursed or enchanted summon's Yig loses or gains for good, how long a charm holds,
// how long a void orb lasts, and the hp a drain gives back (a spell that hurts has its hp cost
// before its boosts, as 416:73093 has it)
function skillStats({ regen, regenTurns, dmg, byAtk, burn, freeze, paralyse, boost = {}, hp, barrier, summons, spd, charm, orb, drain }) {
  const cell = (k, n, note = "") => [k, [[(typeof n === "number" && n >= 0 ? "+" : "") + n, INK.title]], [[note, INK.same]]];
  const turnsOf = n => ` ${tl("{n} turns", { n })}`;   // (translated, see lang.js)
  const chance = burn ? ` ${tl("{n}% burn", { n: burn })}` : freeze ? ` ${tl("{n}% freeze", { n: freeze })}` : paralyse ? ` ${tl("{n}% paralyse", { n: paralyse })}` : orb ? turnsOf(orb) : "";
  const cost = hp ? [cell("hp", -hp)] : [];
  return [...(regen ? [cell("hp", regen, turnsOf(regenTurns))] : []), ...(dmg ? [cell(byAtk ? "dmgAtk" : "dmgMag", dmg.join("-"), chance)] : []),
    ...(charm ? [cell("heartEmpty", tl("{n} turns", { n: charm }))] : []), ...(drain ? [cell("hp", drain)] : []), ...(dmg ? cost : []),
    ...(barrier ? [cell("hp", String(barrier[0]), turnsOf(barrier[1]))] : []),
    ...Object.entries(boost).map(([k, [n, turns]]) => (k === "reduce" ? cell(k, `-${n}%`, ` ${tl("dmg {n} turns", { n: turns })}`) : cell(k, n, turnsOf(turns)))), ...(dmg ? [] : cost),
    ...(summons && spd ? [cell("spd", spd, ` ${tl("for good")}`)] : [])];
}

// An item's card, as the v0.13 sheet has it ("item" in 837:95615, 855:64871, 834:90893, see SHEET),
// in MEK Sans, `pad` in, its rows `gap` apart: its icon and name (wrapped beside it); with `desc`, its
// description (small, grey); its stats on dark1, each its icon, value and (smaller) delta, two to a
// row for gear, one for a spell or potion, `statGap` apart; what else it does (small: green, red,
// purple); and along the bottom, small and grey, the slot it goes in, or a spell's cooldown and
// "skill" with what it goes by. Its text wraps to `boxW` notice px; the card is `w` screen px wide
// (or wider where a word needs it) and `h` tall. draw() fills it at x, y, `w` wide and `h` tall.
const CARD = { w: 77, pad: 4, gap: 5,   // (77 inside the panel's lines: 69 of text, as the mock's)
  iconGap: 3, statGap: 3, partGap: 3, deltaGap: 3, foot: "#696a6a" };
function itemBox(id, { boxW = CARD.w, desc: withDesc = false, maxH = Infinity } = {}) {
  const C = CARD, { u, px } = uiMetrics(), skill = SKILLS[id], item = skill ?? seenAs(id), statCols = skill || item.consumable ? 1 : 2;
  const textW = px(boxW - 2 * C.pad), cells = skill ? skillStats(skill) : noticeStats(id);
  const specials = skill ? [] : noticeSpecials(id, 0, (text, ink) => sheetWrap(text, ink, textW, "fs"));
  const shown = nameOf(item.name), iconW = px(CW + C.iconGap), name = sheetWrap(shown, INK.value, textW - iconW, "f");
  const m = !skill && blades.get(id);   // (what a weapon remembers, see BLADE: shown whether or not its description is)
  let desc = [...(withDesc && item.desc ? sheetWrap(tl(item.desc), "#9badb7", textW, "fs", BODY) : []), ...(m ? sheetWrap(bladeStory(id, m), INK.title, textW, "fs", BODY) : [])];   // (in the body text's font)
  // a stat: its icon, value and (smaller) delta
  const cellW = ([, v, d]) => px(CW + C.partGap) + sheetW(v) + (d.length && d[0][0] ? px(C.deltaGap) + sheetW(d, "fs") : 0);
  const wide = c => statCols > 1 && cellW(c) > Math.floor((textW - px(C.statGap)) / 2);   // (a cell too wide for its column takes a row of its own)
  const places = [];
  let row = 0, col = 0;
  for (const c of cells) {
    if (wide(c)) { if (col) row++; places.push([row++, 0]); col = 0; continue; }
    places.push([row, col]);
    if (++col === statCols) { row++; col = 0; }
  }
  const rows = row + (col ? 1 : 0);
  // (one to a row, a stat's note wraps beside its value, as the mock's "50% chance to stun for 2 turns" does, rather than widen the card)
  const valueEnd = ([, v]) => px(CW + C.partGap) + sheetW(v) + px(C.deltaGap);
  const notes = cells.map(c => statCols > 1 || !c[2].length || !c[2][0][0].trim() ? [c[2]] : sheetWrap(c[2][0][0].trim(), c[2][0][1], textW - valueEnd(c), "fs"));   // (lines of runs)
  const rowH = r => Math.max(px(CH), ...cells.map((c, i) => places[i][0] === r && statCols === 1 && notes[i].length > 1 ? sheetLinesH(notes[i].length, "fs") : 0));
  const rowY = r => { let y = 0; for (let k = 0; k < r; k++) y += rowH(k) + px(C.statGap); return y; };
  const inner = Math.max(textW, ...cells.map(c => statCols > 1 ? cellW(c) : valueEnd(c)), ...shown.split(" ").map(word => iconW + sheetW([[word]])));
  const nameH = Math.max(px(CH), sheetLinesH(name.length, "f"));   // (the icon beside it, in the middle)
  const footInk = C.foot, foot = skill ? [[String(skill.cooldown ?? 0), footInk]] : [[item.slot ? tl(SLOT_WORDS[item.slot]) : item.consumable ? tl("consumable") : "", footInk]];
  // (its marks, grey: a spell's by what it goes by, at the right; gear's by its main stat, at the left)
  const mark = by => (by === "atk" ? PIX.atk : by === "mag" ? PIX.mag : PIX.neutral);
  const footRight = skill ? [[tl("skill"), footInk]] : [], footIcon = skill ? mark(skill.byAtk ? "atk" : "mag") : null;
  const footLeft = !skill && item.slot ? mark(item.main) : null;
  const hasFoot = !!(foot[0][0] || footRight.length);
  // (the foot's left and right as wide as they are, a little apart, so a longer word for "skill" doesn't run into the cooldown)
  const footW = hasFoot ? (skill ? px(CW + 2) : 0) + (footLeft ? px(CW + 2) : 0) + sheetW(foot, "fs", BODY) + px(4) + sheetW(footRight, "fs", BODY) + (footIcon !== null ? px(CW + 2) : 0) : 0;
  const statsH = rows ? rowY(rows - 1) + rowH(rows - 1) : 0;
  const boxH = () => [nameH, desc.length ? sheetLinesH(desc.length, "fs") : 0, statsH, sheetLinesH(specials.length, "fs"), hasFoot ? px(CH) : 0].filter(Boolean)
    .reduce((a, b) => a + b + px(C.gap)) + 2 * px(C.pad);
  // (taller than `maxH`: its description cut a line at a time, a line kept at least, and "..." where it stops)
  if (boxH() > maxH && desc.length > 1) {
    while (boxH() > maxH && desc.length > 1) desc.pop();
    const [[text, ink]] = desc.at(-1), words = text.split(" ");
    while (words.length > 1 && sheetW([[`${words.join(" ")}...`]], "fs", BODY) > textW) words.pop();
    desc = [...desc.slice(0, -1), [[`${words.join(" ").replace(/[.,;:!?]+$/, "")}...`, ink]]];
  }
  const w = Math.max(inner, footW) + 2 * px(C.pad), h = boxH();

  function draw(x0, y0, bw = w, bh = h) {
    const drawIcon = (t, x, y) => ctx.drawImage(tiles, t * CW, 0, CW, CH, x, y, CW * u, CH * u);
    const lines = (list, x, y, size, font) => list.forEach((runs, i) => sheetText(runs, x, y + i * sheetPitch(size), size, font));
    const ix = x0 + px(C.pad), iw = bw - 2 * px(C.pad), colW = Math.floor((iw + px(C.statGap)) / statCols);
    let y = y0 + px(C.pad);
    drawIcon(icon(id), ix, y + Math.round((nameH - px(CH)) / 2));
    relicShine(id, ix, y + Math.round((nameH - px(CH)) / 2), CW * u, CH * u);
    lines(name, ix + iconW, y + Math.round((nameH - sheetLinesH(name.length, "f")) / 2), "f");
    y += nameH + px(C.gap);
    if (desc.length) { lines(desc, ix, y, "fs", BODY); y += sheetLinesH(desc.length, "fs") + px(C.gap); }
    if (rows) {                    // (the stats on dark1)
      ctx.fillStyle = SHEET.ink.bg;
      ctx.fillRect(ix, y, iw, statsH);
      cells.forEach(([k, v, d], i) => {
        const cx = ix + places[i][1] * colW, cy = y + rowY(places[i][0]), ty = cy + Math.round((px(CH) - sheetLineH()) / 2);
        drawIcon(statIcon(k), cx, cy);
        const vx = cx + px(CW + C.partGap), nx = vx + sheetW(v) + px(C.deltaGap);
        sheetText(v, vx, ty);
        if (statCols > 1 || notes[i].length < 2) { if (d.length) sheetText(statCols > 1 ? d : notes[i][0] ?? d, nx, ty + sheetLineH() - sheetLineH("fs"), "fs"); }
        else notes[i].forEach((line, j) => sheetText(line, nx, ty + sheetLineH() - sheetLineH("fs") + j * sheetPitch("fs"), "fs"));
      });
      y += statsH + px(C.gap);
    }
    if (specials.length) { lines(specials, ix, y, "fs"); y += sheetLinesH(specials.length, "fs") + px(C.gap); }
    if (hasFoot) {
      const ty = y + Math.round((px(CH) - sheetLineH("fs")) / 2);
      let fx = ix;
      if (skill) { drawIcon(SCENE.cooldown, fx, y); fx += px(CW + 2); }
      if (footLeft) { drawPix(footLeft, fx, y, u, footInk); fx += px(CW + 2); }
      sheetText(foot, fx, ty, "fs", BODY);
      const rx = x0 + bw - px(C.pad) - (footIcon !== null ? px(CW) : 0);
      if (footIcon !== null) drawPix(footIcon, rx, y, u, footInk);
      sheetText(footRight, rx - (footIcon !== null ? px(2) : 0) - sheetW(footRight, "fs", BODY), ty, "fs", BODY);
    }
  }
  return { w, h, draw };
}

// The bag slot holding a spell of the same kind as `id` (a Weak Firebolt for a Firebolt), or -1:
// only one of each kind is ever known, so a new one of a kind known takes the old one's place
const knownAt = id => bag.findIndex(b => SKILLS[b?.id]?.variant === SKILLS[id].variant);
// Why something found can't be taken, if it can't: a spell already known, or no room in the bag
const noRoom = id => (SKILLS[id] && carried(id) ? tl("You already know this spell")
  : placeFor(id) === -1 ? tl("Your bag is full ({n}/{n})", { n: BAG_SIZE }) : null);

// The v0.13 panels' look ("main-game-ui", Figma 832:81931, 2026-10-25): dark1 all over, a blue1 line along the top,
// the title bar (its title gold, "?" brown, "X" red), then its parts one under another, each
// framed in blue1: a box (`pad` in, its lines `gap` apart: text, rows on dark2 `rowPad` in,
// meters), two boxes side by side (split), cards side by side `edge` in (cards), or the buttons
// (cta), `ctaH` tall, `btnGap` apart, `edge` in, green (go), red (stop) or dark2 (plain); and a
// blue1 bar `bottom` px along the bottom. Sizes in notice px. A part's `key` puts its rect in the
// panel's hits by that name; its `press` puts [rect, what it does] in hits.controls.
// The sheet's own little pictures, read off its vectors (Figma 832:81931): the title bar's "?" and
// "X" (5 by 5), an empty slot's hatching (8 by 12, a diagonal every 4 px), and the category marks
// a card's footer has (8 by 12: by attack, by magic, neither), as rows of "#" for a pixel
const PIX = {
  help: [".###.", "#...#", "..##.", ".....", "..#.."],
  close: ["#...#", ".#.#.", "..#..", ".#.#.", "#...#"],
  swap: ["...#.", "#####", ".....", "#####", ".#..."],   // (⇄, the class picker's pair preview)
  hatch: Array.from({ length: 12 }, (_, r) => [...Array(8)].map((_, x) => ((x + r) % 4 === 3 ? "#" : ".")).join("")),
  atk: ["........", "........", "........", ".##.....", ".#.#....", "..#.#.#.", "...#.#..", "....##..", "...#..#.", "........", "........", "........"],
  mag: ["........", "........", "........", "....#...", "...#....", "..####..", "....#...", "...#....", "...#....", "........", "........", "........"],
  neutral: ["........", "........", "........", "..####..", ".#....#.", ".#.##.#.", ".#.##.#.", ".#....#.", "..####..", "........", "........", "........"],
};
// Draws one at x, y (screen px), each of its pixels `s` screen px, in `colour`
function drawPix(rows, x, y, s, colour) {
  ctx.fillStyle = colour;
  rows.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] === "#") ctx.fillRect(x + c * s, y + r * s, s, s); });
}
// An empty slot: its hatching in blue1 over dark1, a tile's size at x, y
const drawHatch = (x, y, s) => { ctx.fillStyle = "#071324"; ctx.fillRect(x, y, CW * s, CH * s); drawPix(PIX.hatch, x, y, s, "#253a56"); };
const SHEET = { pad: 6, gap: 4, rowPad: 4, edge: 2, btnGap: 2, ctaH: 17, bottom: 2, meterH: 3, barH: 9, titleX: 3, iconGap: 3, iconEnd: 4,
  chipH: 9, chipPad: 3, chipGap: 2, segW: 3, segH: 6, segGap: 1, slot: 14, slotGap: 2, cardW: 100, wideW: 186,
  ink: { line: "#253a56", bg: "#071324", body: "rgba(7, 19, 36, 0.9)", row: "#222034", title: "#d9a066", help: "#8a6f30", helpOn: "#639bff", close: "#d95763",
    text: "#cbdbfc", label: "#9badb7", value: "#d9a066", dim: "#847e87", picked: "#37946e", pickedBg: "#323c39", focus: "#5b6ee1",
    chipOn: "#37946e", chipOff: "#253a56", chipOffText: "#306082", seg: "#5b6ee1", meter: "#d95763" },
  bg: { go: "#4b692f", stop: "#661c31", plain: "#222034", smith: "#323c39", tab: "#253a56" } };
// (a panel about one thing (the pickup, observe, level-up, game over, replay and the talks) is
// SHEET.cardW across on a computer, so they're all one width and less tall and thin, and one of
// many parts (the bag, classes, settings, leaderboard) SHEET.wideW, the user's, 2026-10-29; on a
// phone each keeps its own `w`)
const cardPanelW = w => phone ? w : SHEET.cardW;
// (a part's text, in MEK Sans (sans.js): the sheet's 7, 8 and 9 px text ("fs", "f", "btn") all at
// one whole number of screen px per font px, as near its 8 px as that gets (Figma draws them with
// pixels the same size; a smaller 7 px was tried and taken back, the user's, 2026-10-25: uneven on a
// phone), and its 12 px ("big") as near 12 as gets (at a small scale, where
// the 8 px comes out bigger than it should, the same). A line's height is the
// capitals' (as Figma's text boxes are), lines of a paragraph a strip's height apart; widths in
// screen px)
const sheetFont = (size = "f") => {
  const { u } = uiMetrics(), k = Math.max(1, Math.round(u * 8 / SANS.h));
  return size === "big" ? Math.max(k, Math.round(u * 12 / SANS.h)) : k;
};
const sheetLineH = size => SANS.cap * sheetFont(size);
const sheetPitch = size => SANS.h * sheetFont(size);
const sheetW = (runs, size, font) => sansWidth(runs, font) * sheetFont(size);
const sheetText = (runs, x, y, size, font) => {
  if (sheetTexts && sheetTexts.length < 4000) sheetTexts.push({ x, y, w: sheetW(runs, size, font), h: sheetLineH(size), text: runs.map(r => r[0]).join("") });
  drawSans(ctx, runs, x, y, sheetFont(size), font);
};
// (?overflow, for checking a language: each sheet panel's text that runs past the panel's edge or
// into other text is told in the console once, "[overflow] TITLE: text", see drawSheet)
const sheetTexts = query.has("overflow") ? [] : null, overflowsTold = new Set();
if (sheetTexts) console.info("[overflow] checking the panels' text");
function tellOverflows(title, [x0, y0, w, h]) {
  const t = sheetTexts.filter(r => r.text.trim()), slack = uiMetrics().px(1);
  const tell = why => { const k = `${title}: ${why}`; if (!overflowsTold.has(k)) { overflowsTold.add(k); console.warn(`[overflow] ${k}`); } };
  for (const r of t) if (r.x < x0 || r.x + r.w > x0 + w + slack || r.y + r.h > y0 + h + slack) tell(`"${r.text}" past the edge`);
  t.forEach((a, i) => t.slice(i + 1).forEach(b => {
    if (a.x < b.x + b.w - slack && b.x < a.x + a.w - slack && a.y < b.y + b.h - slack && b.y < a.y + a.h - slack) tell(`"${a.text}" over "${b.text}"`);
  }));
  sheetTexts.length = 0;
}
// Splits text into lines no wider than `w` screen px at `size`, breaking between words
function sheetWrap(text, ink, w, size, font) {
  if (/[\u2e80-\u9fff]/u.test(text)) return wrapChinese(text, t => sheetW([[t]], size, font), w).map(t => [[t, ink]]);
  const lines = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const line = lines.at(-1), longer = line && `${line} ${word}`;
    if (line && sheetW([[longer]], size, font) <= w) lines[lines.length - 1] = longer;
    else lines.push(word);
  }
  return lines.map(line => [[line, ink]]);
}
const sheetLinesH = (n, size) => n ? (n - 1) * sheetPitch(size) + sheetLineH(size) : 0;
// Its parts: each { minW(), h(w), draw(x, y, w, hits) }, in screen px
const sheet = {
  // text wrapped to the width, in one colour
  // (translated, see lang.js)
  // (in the body text's font, unless `font` says otherwise)
  text: (raw, ink = SHEET.ink.text, size = "f", font = BODY) => {
    const text = tl(raw), lines = w => sheetWrap(text, ink, w, size, font);
    // (as wide as its longest word, at least)
    return { lines, size, font, minW: () => Math.max(0, ...chineseTokens(text).map(word => sheetW([[word]], size, font))), h: w => sheetLinesH(lines(w).length, size),
      draw: (x, y, w) => lines(w).forEach((runs, i) => sheetText(runs, x, y + i * sheetPitch(size), size, font)) };
  },
  // runs as they are, a line each (`lines`: an array of lines of runs)
  lines: (lines, size = "f", centre = false, font) => ({ minW: () => Math.max(0, ...lines.map(r => sheetW(r, size, font))), h: () => sheetLinesH(lines.length, size),
    draw: (x, y, w) => lines.forEach((runs, i) => sheetText(runs, x + (centre ? Math.round((w - sheetW(runs, size, font)) / 2) : 0), y + i * sheetPitch(size), size, font)) }),
  // a dark2 row: `left` runs (in `leftFont`), and at the right `right` runs or an inline part ({ w(), h(), draw(x, y, hits) })
  row: (left, right = [], { bg = SHEET.ink.row, outline = null, key = null, press = null, size = "f", rightSize = size, pad = SHEET.rowPad, leftFont, rightFont } = {}) => {
    const inline = !Array.isArray(right), rh = () => {
      const { px } = uiMetrics();
      return 2 * px(pad) + Math.max(sheetLineH(size), inline ? right.h() : sheetLineH(rightSize));
    };
    return { minW: () => 2 * uiMetrics().px(SHEET.rowPad) + sheetW(left, size, leftFont) + uiMetrics().px(SHEET.gap) + (inline ? right.w() : sheetW(right, rightSize, rightFont)),
      h: rh,
      draw: (x, y, w, hits) => {
        const { px } = uiMetrics(), h = rh(), p = px(SHEET.rowPad);
        if (bg) { ctx.fillStyle = bg; ctx.fillRect(x, y, w, h); }
        if (outline) sheetFrame(x, y, w, h, outline);
        sheetText(left, x + p, y + Math.round((h - sheetLineH(size)) / 2), size, leftFont);
        if (inline) right.draw(x + w - p - right.w(), y + Math.round((h - right.h()) / 2), hits);
        else sheetText(right, x + w - p - sheetW(right, rightSize, rightFont), y + Math.round((h - sheetLineH(rightSize)) / 2), rightSize, rightFont);
        sheetHit(hits, [x, y, w, h], key, press);
      } };
  },
  // a bar `frac` full (an hp bar)
  meter: (frac, ink = SHEET.ink.meter) => ({ minW: () => 0, h: () => uiMetrics().px(SHEET.meterH),
    draw: (x, y, w) => {
      const h = uiMetrics().px(SHEET.meterH);
      ctx.fillStyle = SHEET.ink.row; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = ink; ctx.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, frac))), h);
    } }),
  // `slot` px boxes, as many to a row as fit: each { fill, outline, faded, icon (a tile), key, press }
  slots: cells => {
    const size = () => uiMetrics().px(SHEET.slot), gap = () => uiMetrics().px(SHEET.slotGap);
    const per = w => Math.max(1, Math.floor((w + gap()) / (size() + gap())));
    return { minW: () => size(), h: w => Math.ceil(cells.length / per(w)) * (size() + gap()) - gap(),
      draw: (x, y, w, hits) => cells.forEach((c, i) => {
        const { u } = uiMetrics(), s = size(), cx = x + (i % per(w)) * (s + gap()), cy = y + Math.floor(i / per(w)) * (s + gap());
        ctx.globalAlpha = c.faded ? 0.35 : 1;
        ctx.fillStyle = c.fill ?? SHEET.ink.row; ctx.fillRect(cx, cy, s, s);
        if (c.icon !== undefined) ctx.drawImage(tiles, c.icon * CW, 0, CW, CH, cx + Math.round((s - CW * u) / 2), cy + Math.round((s - CH * u) / 2), CW * u, CH * u);
        ctx.globalAlpha = 1;
        if (c.outline) sheetFrame(cx, cy, s, s, c.outline, undefined, true);
        sheetHit(hits, [cx, cy, s, s], c.key, c.press);
      }) };
  },
  // the sheet's item boxes ("class", 16 by 18), `per` to a row, `gap` apart, each row centred: each
  // { id (none: an empty one, hatched), picked (framed green), hit (where its rect goes, by index) }
  boxes: (list, { per = list.length, gap = 3, hits: into = "slots" } = {}) => {
    const W = () => uiMetrics().px(16), H = () => uiMetrics().px(18), G = () => uiMetrics().px(gap), rows = Math.ceil(list.length / per);
    return { minW: () => Math.min(per, list.length) * (W() + G()) - G(), h: () => rows * (H() + G()) - G(),
      draw: (x, y, w, hits) => list.forEach((b, i) => {
        const { u, px } = uiMetrics(), r = Math.floor(i / per), n = Math.min(per, list.length - r * per);
        const bx = x + Math.round((w - n * (W() + G()) + G()) / 2) + (i % per) * (W() + G()), by = y + r * (H() + G());
        ctx.fillStyle = SHEET.ink.bg; ctx.fillRect(bx, by, W(), H());
        sheetFrame(bx, by, W(), H(), b.picked ? SHEET.ink.picked : SHEET.ink.line, px(1), true);
        const ix = bx + Math.round((W() - CW * u) / 2), iy = by + Math.round((H() - CH * u) / 2);
        if (b.id) ctx.drawImage(tiles, icon(b.id) * CW, 0, CW, CH, ix, iy, CW * u, CH * u);
        else drawHatch(ix, iy, u);
        if (b.id) relicShine(b.id, ix, iy, CW * u, CH * u);
        if (hits && b.id) (hits[into] ??= [])[i] = [bx, by, W(), H()];
      }) };
  },
  // a tile in a chipped 16 by 18 box (as a class's), and parts beside it, `gap` px on and `lineGap`
  // px apart, centred down it
  portrait: (tile, parts, gap = 4, lineGap = 3) => {
    const { W, H, G } = { W: () => uiMetrics().px(16), H: () => uiMetrics().px(18), G: () => uiMetrics().px(gap) };
    const textW = w => w - W() - G(), textH = w => parts.reduce((a, p) => a + p.h(textW(w)), 0) + (parts.length - 1) * uiMetrics().px(lineGap);
    return { minW: () => W() + G() + Math.max(...parts.map(p => p.minW())), h: w => Math.max(H(), textH(w)),
      draw: (x, y, w, hits) => {
        const { u, px } = uiMetrics(), h = Math.max(H(), textH(w));
        ctx.fillStyle = SHEET.ink.bg; ctx.fillRect(x, y, W(), H());
        sheetFrame(x, y, W(), H(), SHEET.ink.line, px(1), true);
        ctx.drawImage(tiles, tile * CW, 0, CW, CH, x + Math.round((W() - CW * u) / 2), y + Math.round((H() - CH * u) / 2), CW * u, CH * u);
        let ty = y + Math.round((h - textH(w)) / 2);
        for (const p of parts) { p.draw(x + W() + G(), ty, textW(w), hits); ty += p.h(textW(w)) + px(lineGap); }
      } };
  },
  // a dark2 row 14 px tall: a stat's icon (or, with `tile`, that tile), its name, and its value gold at the right
  stat: (k, name, value, { tile = false, ink = SHEET.ink.label } = {}) => {
    const rh = () => uiMetrics().px(14), v = [[value, SHEET.ink.value]];
    name = tl(name);
    return { minW: () => uiMetrics().px(3 + CW + 3 + 4) + sheetW([[name]]) + (value ? uiMetrics().px(SHEET.gap) + sheetW(v) : 0), h: rh,
      draw: (x, y, w) => {
        const { u, px } = uiMetrics(), h = rh(), ty = y + Math.round((h - sheetLineH()) / 2);
        ctx.fillStyle = SHEET.ink.row; ctx.fillRect(x, y, w, h);
        ctx.drawImage(tiles, (tile ? k : HUD.statIcons[k]) * CW, 0, CW, CH, x + px(3), y + Math.round((h - CH * u) / 2), CW * u, CH * u);
        sheetText([[name, ink]], x + px(3 + CW + 3), ty);
        if (value) sheetText(v, x + w - px(4) - sheetW(v), ty);
      } };
  },
  // a part with `pad` notice px above and below it (a row of the mock's that's only text, "COMPETITIVE", "[G] Leaderboard")
  padded: (part, pad = 4) => ({ ...part, h: w => part.h(w) + 2 * uiMetrics().px(pad), draw: (x, y, w, hits) => part.draw(x, y + uiMetrics().px(pad), w, hits) }),
  // a gap, in notice px (on top of the box's own)
  gap: n => ({ minW: () => 0, h: () => uiMetrics().px(n), draw: () => {} }),
};
// Inline parts for a row's right: Y/N and the like, as chips (each { label, on, ask, press }), and a volume's segments
const chips = list => {
  list = list.map(c => (c.shown ? c : { ...c, label: tl(c.label) }));   // (`shown`: its label's as it's to be shown already)
  const S = SHEET, cw = c => Math.max(uiMetrics().px(S.chipH), sheetW([[c.label]], "fs") + 2 * uiMetrics().px(S.chipPad));
  return { w: () => list.reduce((a, c) => a + cw(c), 0) + (list.length - 1) * uiMetrics().px(S.chipGap), h: () => uiMetrics().px(S.chipH),
    draw: (x, y, hits) => list.forEach(c => {
      const { px } = uiMetrics(), w = cw(c), h = px(S.chipH), words = [[c.label, c.on || c.ask ? S.ink.text : S.ink.chipOffText]];
      ctx.fillStyle = c.ask ? S.ink.value : c.on ? S.ink.chipOn : S.ink.chipOff;
      ctx.fillRect(x, y, w, h);
      sheetText(words, x + Math.round((w - sheetW(words, "fs")) / 2), y + Math.round((h - sheetLineH("fs")) / 2), "fs");
      sheetHit(hits, [x, y, w, h], null, c.press);
      x += w + px(S.chipGap);
    }) };
};
const segments = (n, of, press) => {
  const S = SHEET, step = () => uiMetrics().px(S.segW + S.segGap);
  return { w: () => of * step() - uiMetrics().px(S.segGap), h: () => uiMetrics().px(S.segH),
    draw: (x, y, hits) => {
      for (let k = 0; k < of; k++) {
        ctx.fillStyle = k < n ? S.ink.seg : S.ink.chipOff;
        ctx.fillRect(x + k * step(), y, uiMetrics().px(S.segW), uiMetrics().px(S.segH));
        if (press) sheetHit(hits, [x + k * step(), y - uiMetrics().px(S.rowPad), step(), uiMetrics().px(S.segH + 2 * S.rowPad)], null, () => press(k));
      }
    } };
};
// (a 1 px line round a part; `chip`: its corners left out, as the sheet's boxes have them, the
// little ones a thing sits in, where a framed part's own line, a stroke in Figma, is square)
function sheetFrame(x, y, w, h, colour, b = uiMetrics().px(1), chip = false) {
  const c = chip ? b : 0;
  ctx.fillStyle = colour;
  ctx.fillRect(x + c, y, w - 2 * c, b); ctx.fillRect(x + c, y + h - b, w - 2 * c, b);
  ctx.fillRect(x, y + b, b, h - 2 * b); ctx.fillRect(x + w - b, y + b, b, h - 2 * b);
}
function sheetHit(hits, rect, key, press) {
  if (!hits) return;
  if (key) hits[key] = rect;
  if (press) hits.controls.push([rect, press]);
}
// The panel's parts, framed: a box of parts (`fill` false: no dark2 rows' backdrop...), two boxes side by side,
// cards side by side, and buttons (each { runs, bg, key, press, on }), down (`across` false) or across
const sheetParts = {
  box: (parts, { gap = SHEET.gap, pad = SHEET.pad } = {}) => ({
    minW: () => 2 * uiMetrics().px(pad) + Math.max(0, ...parts.map(p => p.minW())),
    h: w => { const { px } = uiMetrics(), iw = w - 2 * px(pad); return 2 * px(pad) + parts.reduce((a, p) => a + p.h(iw), 0) + (parts.length - 1) * px(gap); },
    draw: (x, y, w, hits) => {
      const { px } = uiMetrics(), iw = w - 2 * px(pad);
      let py = y + px(pad);
      for (const p of parts) { p.draw(x + px(pad), py, iw, hits); py += p.h(iw) + px(gap); }
    } }),
  split: (left, right) => {
    const half = w => [Math.floor(w / 2), w - Math.floor(w / 2)];
    return { minW: () => 2 * Math.max(left.minW(), right.minW()),
      h: w => Math.max(left.h(half(w)[0]), right.h(half(w)[1])),
      draw: (x, y, w, hits) => {
        const [a, b] = half(w);
        left.draw(x, y, a, hits);
        ctx.fillStyle = SHEET.ink.line; ctx.fillRect(x + a, y, uiMetrics().px(1), Math.max(left.h(a), right.h(b)));
        right.draw(x + a, y, b, hits);
      } };
  },
  // parts in a dark2 block, `pad` px in, `gap` apart
  block: (parts, { pad = 4, gap = 2 } = {}) => {
    const inner = sheetParts.box(parts, { pad, gap });
    return { ...inner, draw: (x, y, w, hits) => { ctx.fillStyle = SHEET.ink.row; ctx.fillRect(x, y, w, inner.h(w)); inner.draw(x, y, w, hits); } };
  },
  // two parts side by side, halves of the width, `gap` px apart
  pair: (a, b, gap = 2) => ({ minW: () => 2 * Math.max(a.minW(), b.minW()) + uiMetrics().px(gap), h: w => Math.max(a.h(w), b.h(w)),
    draw: (x, y, w, hits) => {
      const g = uiMetrics().px(gap), half = Math.floor((w - g) / 2);
      a.draw(x, y, half, hits); b.draw(x + half + g, y, w - half - g, hits);
    } }),
  // parts side by side, each as wide as it needs, the `grow`-th taking what's left, a blue1 line between
  across: (list, grow = 0, fullH = null) => {   // (fullH(w): the part's height, when it's more than its pieces', for the dividers)
    const ws = w => { const b = uiMetrics().px(1), m = list.map(p => p.minW()); m[grow] = Math.max(m[grow], w - m.reduce((a, x, i) => a + (i === grow ? 0 : x), 0) - (list.length - 1) * b); return m; };
    return { minW: () => list.reduce((a, p) => a + p.minW(), 0) + (list.length - 1) * uiMetrics().px(1),
      h: w => Math.max(...list.map((p, i) => p.h(ws(w)[i]))),
      draw: (x, y, w, hits) => {
        const b = uiMetrics().px(1), widths = ws(w), h = fullH ? fullH(w) : Math.max(...list.map((p, i) => p.h(widths[i])));
        list.forEach((p, i) => {
          p.draw(x, y, widths[i], hits);
          x += widths[i];
          if (i < list.length - 1) { ctx.fillStyle = SHEET.ink.line; ctx.fillRect(x, y, b, h); x += b; }
        });
      } };
  },
  cards: list => {
    const E = () => uiMetrics().px(SHEET.edge), cw = w => Math.floor((w - 2 * E() - (list.length - 1) * E()) / list.length);
    const inner = c => sheetParts.box(c.parts, { pad: 4 });
    return { minW: () => list.length * Math.max(...list.map(c => inner(c).minW())) + (list.length + 1) * E(),
      h: w => 2 * E() + Math.max(...list.map(c => inner(c).h(cw(w)))),
      draw: (x, y, w, hits) => {
        const h = Math.max(...list.map(c => inner(c).h(cw(w))));
        list.forEach((c, i) => {
          const cx = x + E() + i * (cw(w) + E()), cy = y + E();
          ctx.fillStyle = c.on ? SHEET.ink.pickedBg : SHEET.ink.row; ctx.fillRect(cx, cy, cw(w), h);
          if (c.on) sheetFrame(cx, cy, cw(w), h, SHEET.ink.picked);
          inner(c).draw(cx, cy, cw(w), hits);
          sheetHit(hits, [cx, cy, cw(w), h], c.key, c.press);
        });
      } };
  },
  cta: (buttons, across = false, ctaH = SHEET.ctaH) => {
    const { E, G, H } = { E: () => uiMetrics().px(SHEET.edge), G: () => uiMetrics().px(SHEET.btnGap), H: () => uiMetrics().px(ctaH) };
    const bw = b => Math.max(...[b.runs, ...(b.fit ?? [])].map(r => sheetW(r, "btn"))) + 2 * uiMetrics().px(SHEET.pad);   // (`fit`: the other labels it can have, so it keeps one width)
    return { minW: () => 2 * E() + (across ? buttons.length * Math.max(...buttons.map(bw)) + (buttons.length - 1) * G() : Math.max(...buttons.map(bw))),   // (across, each as wide as the widest)
      h: () => 2 * E() + (across ? H() : buttons.length * H() + (buttons.length - 1) * G()),
      draw: (x, y, w, hits) => {
        const n = buttons.length, each = Math.floor((w - 2 * E() - (n - 1) * G()) / n);
        buttons.forEach((b, i) => {
          const bx = across ? x + E() + i * (each + G()) : x + E(), by = across ? y + E() : y + E() + i * (H() + G());
          const width = across ? (i === n - 1 ? x + w - E() - bx : each) : w - 2 * E();
          ctx.globalAlpha = b.on === false ? 0.45 : 1;
          ctx.fillStyle = b.bg ?? SHEET.bg.plain;
          ctx.fillRect(bx, by, width, H());
          sheetText(b.runs, bx + Math.round((width - sheetW(b.runs, "btn")) / 2), by + Math.round((H() - sheetLineH("btn")) / 2), "btn");
          ctx.globalAlpha = 1;
          if (b.outline) sheetFrame(bx, by, width, H(), b.outline);
          sheetHit(hits, [bx, by, width, H()], b.key, b.on === false ? null : b.press);
        });
      } };
  },
};
// "[K] Label" for a button: the rest bw6, the key gold, or on a green button light green and on a
// red one red, as the sheet has them (no key on a touch screen, see tapKeys()); the label translated (lang.js)
const SHEET_KEYS = { go: "#99e57e", stop: "#d95763", plain: "#d9a066" };
const sheetKey = (k, label, keyInk = SHEET.ink.value) => tapKeys([["[", SHEET.ink.text], [k, keyInk], [`] ${tl(label)}`, SHEET.ink.text]]);
// ...and the button itself: `kind` go (green), stop (red) or plain (dark2)
const sheetButton = (k, label, kind = "plain", more = {}) => ({ runs: sheetKey(k, label, SHEET_KEYS[kind]), bg: SHEET.bg[kind], ...more });
let lastSheet = null;              // (the last panel drawn: x, y, w, h and its scale, for looking into from the console)
// A v0.13 panel, centred like the notice: { title, w (notice px, at least), help (its help up), helpText, closes, parts };
// `measuring`: only its width. Its hits: box, help, close, controls, and its parts' keys
function drawSheet(spec, measuring = false) {
  const { px } = uiMetrics(), b = px(1), S = SHEET;
  if (spec.title) spec = { ...spec, title: tl(spec.title) };   // (translated, see lang.js; titleRuns are the caller's)
  const titleW = sheetW(spec.titleRuns ?? [[spec.title]]) + px(SHEET.titleX + 8 + 5 + SHEET.iconGap + 5 + SHEET.iconEnd);
  const w = Math.max(px(spec.w), titleW, ...spec.parts.map(p => p.minW() + 2 * b));
  if (measuring) return w;
  // (its help up: the body swaps to the help, HELP and its lines, over [?] Back, option B of the ones
  // shown the user, 2026-10-25; the panel keeps its width)
  const helping = spec.help && spec.helpText;
  if (helping) spec = { ...spec, parts: [sheetParts.box([sheet.lines([[[tl("HELP"), S.ink.title]]], "fs"), ...spec.helpText.map(t => sheet.text(t, S.ink.label, "fs"))], { gap: 5 }),
    sheetParts.cta([sheetButton("?", "Back", "plain", { key: "helpBack" })])] };
  const iw = w - 2 * b, heights = spec.parts.map(p => p.h(iw));
  const bottom = spec.bottom ?? S.bottom;   // (1: the last part's line is the panel's bottom, chipped, as the bag's and the classes' have it)
  const h = b + px(S.barH) + heights.reduce((a, x) => a + x + b, 0) + px(bottom);
  if (h + 2 * px(NOTICE.shadow) > canvas.height - (spec.lift ?? 0) - 2 * gutter && uiU > 1) { uiU--; return drawSheet(spec); }   // (smaller, till it's not too tall either)
  // (centred as if each part were its `baseH`, where it has one, so a longer card only pushes the
  // bottom down: what's above it stays put under the pointer)
  const room = canvas.height - (spec.lift ?? 0), centreH = h - spec.parts.reduce((a, p, i) => a + (p.baseH ? heights[i] - p.baseH(iw) : 0), 0);
  const [x0, y0] = spec.at ?? [Math.round((canvas.width - w) / 2), Math.max(0, Math.min(Math.round((room - centreH) / 2), room - h))];
  const hits = { box: [x0, y0, w, h], controls: [], rows: [], slots: [] };
  lastSheet = [x0, y0, w, h, uiU];
  if (sheetTexts) sheetTexts.length = 0;
  drawShadow(x0, y0, w, h);
  ctx.fillStyle = S.ink.body;
  ctx.fillRect(x0, y0, w, h);
  ctx.fillStyle = S.ink.line;
  ctx.fillRect(x0 + b, y0, w - 2 * b, b);
  // the title bar
  const lineH = sheetLineH(), hy = y0 + b, bh = px(S.barH), ty = hy + Math.round((bh - lineH) / 2), hit = px(NOTICE.hitPad);
  ctx.fillStyle = S.ink.line;      // (its sides, as the panel's own)
  ctx.fillRect(x0, hy, b, bh); ctx.fillRect(x0 + w - b, hy, b, bh);
  // (its title `titleX` in; "?" and "X", 5 px each, `iconGap` apart, `iconEnd` px from its right edge:
  // 4, up from 2, the user's, 2026-10-25, as the older headers' "X")
  const icon5 = px(5), iy = hy + Math.round((bh - icon5) / 2), u = uiMetrics().u;
  const closeX = x0 + w - px(S.iconEnd + 5), helpX = spec.closes === false ? closeX - px(1) : closeX - px(S.iconGap + 5);
  sheetText(spec.titleRuns ?? [[spec.title, S.ink.title]], x0 + px(S.titleX), ty);
  if (spec.helpText) { drawPix(PIX.help, helpX, iy, u, spec.help ? S.ink.helpOn : S.ink.help); hits.help = [helpX - hit, iy - hit, icon5 + 2 * hit, icon5 + 2 * hit]; }
  if (spec.closes !== false) { drawPix(PIX.close, closeX, iy, u, S.ink.close); hits.close = [closeX - hit, iy - hit, icon5 + 2 * hit, icon5 + 2 * hit]; }
  // the parts, each framed (its top the line under the one above)
  let y = hy + bh;
  const line = (x, ly, lw, lh) => { ctx.fillStyle = S.ink.line; ctx.fillRect(x, ly, lw, lh); };
  line(x0, y, w, b);
  spec.parts.forEach((p, i) => {
    y += b;
    const chip = bottom === 1 && i === spec.parts.length - 1 ? b : 0;
    line(x0, y - b, b, heights[i] + 2 * b - chip); line(x0 + w - b, y - b, b, heights[i] + 2 * b - chip);
    p.draw(x0 + b, y, iw, hits);
    y += heights[i];
    line(x0 + chip, y, w - 2 * chip, b);
  });
  line(x0 + b, y + b, w - 2 * b, px(bottom) - b);
  if (helping) hits.help = [hits.help, hits.helpBack];   // (either takes it down, see onRect())
  if (sheetTexts) tellOverflows(spec.title, hits.box);
  return hits;
}
// ...and the press on one: X closes (`close`), "?" shows its help, a control does what it does; whether it was taken
function sheetPress(hits, px, py, { close, help }) {
  if (!hits) return false;
  if (onRect(hits.help, px, py)) { help(); return true; }
  if (onRect(hits.close, px, py)) { close(); return true; }
  const c = hits.controls.find(([r]) => onRect(r, px, py));
  if (c) { c[1](); return true; }
  return false;
}

// "[K] Label", the K in `keyInk` and the rest in `ink` (or all dimmed, when it can't be pressed); the label translated
const keyLabel = (k, label, keyInk, ink, on = true, dim = PICKUP.ink.dim) =>
  tapKeys([["[", on ? ink : dim], [k, on ? keyInk : dim], [`] ${tl(label)}`, on ? ink : dim]]);

// The pickup's buttons for what's picked: [label runs, enabled] for equip, take and drop
function pickupButtons() {
  const P = PICKUP, id = notice.item, full = !!noRoom(id), swap = full && canSwap(), take = !full || swap;
  const button = (name, k, label, on) => [keyLabel(k, label, P.buttons[name].key, P.ink.label, on), on];
  return { equip: button("equip", "E", "Equip", take && wearable(id)), take: button("take", "T", "Take", take), drop: button("drop", "D", "Drop", true) };
}
// The pickup (see PICKUP), as the v0.13 sheet has it ("pickup-single" 837:95615, "pickup-multiple"
// 837:95743, see SHEET): along the top "ITEM", "?" and "X"; for a pile, its boxes, `per` to a row
// (hatched where there's room for more), the one picked framed green, and its card framed green
// under them; then [S] Swap (with the bag full: leave something for it), [D] Drop and [T] Take.
// E still takes and puts on gear; gear that can go on at once (room for it, see takeFound()) has
// [E] Equip where Swap would be (the user's, 2026-10-25).
function drawNotice(measuring = false) {
  if (!notice) return;
  if (!measuring) fitUi(() => drawNotice(true));
  const P = PICKUP, pile = notice.pile?.length > 1 ? notice.pile : null, ids = pile ?? [notice.item];
  // (the card's as big as the biggest in the pile, so it doesn't change size as another's picked)
  const boxW = cardPanelW(P.w) - 2, boxes = () => ids.map(id => itemBox(id, { desc: true, boxW }));
  const card = { minW: () => Math.max(...boxes().map(x => x.w)), h: () => Math.max(...boxes().map(x => x.h)),
    draw: (x, y, w) => {
      const h = card.h();
      itemBox(notice.item, { desc: true, boxW }).draw(x, y, w, h);
      if (pile) sheetFrame(x, y, w, h, SHEET.ink.picked);
    } };
  const per = notice.per = P.per, parts = [];
  if (pile) parts.push(sheetParts.box([sheet.boxes([...pile, ...Array(Math.max(2 * per, Math.ceil(pile.length / per) * per) - pile.length).fill(null)]
    .map((id, i) => ({ id, picked: i === notice.pick })), { per, gap: 2 })], { pad: 3 }));
  const full = !!noRoom(notice.item), swap = full && canSwap(), take = !full || swap, equip = !full && wearable(notice.item);
  parts.push(card, sheetParts.cta([equip ? sheetButton("E", "Equip", "plain", { key: "equip" }) : sheetButton("S", "Swap", "plain", { key: "swap", on: swap }),
    sheetButton("D", "Drop", "stop", { key: "drop" }),
    sheetButton("T", "Take", "go", { key: "take", on: take })]));
  const spec = { title: "ITEM", w: cardPanelW(P.w), help: notice.help, helpText: [...P.help, ...(tapping ? [] : [P.keys])], parts };
  if (measuring) return drawSheet(spec, true);
  const hits = drawSheet(spec);
  notice.buttons = { help: hits.help, close: hits.close, drop: hits.drop, ...(take ? { take: hits.take } : {}), ...(swap ? { swap: hits.swap } : {}), ...(equip ? { equip: hits.equip } : {}) };
  notice.slots = hits.slots;
}

// The priest's offer (see PRIEST), or a shrine's pact, as a v0.13 sheet (option B of the ones shown
// the user, 2026-10-25): who's speaking as its title (a pact's in red), them in a box beside their
// words, a pact's gift and cost under GIVES and TAKES, and [N] No / [Y] Yes, which can be clicked or
// tapped too (and X is No). Y or N answers, and so does Esc (no).
const TALK = { w: SHEET.cardW };
function drawTalk(measuring = false) {
  if (!talk) return;
  if (!measuring) fitUi(() => drawTalk(true));
  if (talk.bush) return drawGifts(measuring);
  const S = SHEET.ink;
  // (a shrine's: its name, then what its pact gives, in green, and what it costs, in red, see SHRINE)
  const sh = talk.shrine && SHRINE.pacts[talk.shrine.kind], words = sh && pactWords(talk.shrine.kind);
  const look = sh ? SCENE.shrines[talk.shrine.kind] : null, face = look ? look.cells.find(([c, r]) => c === look.icon[0] && r === look.icon[1])[2] : SCENE.priest.right;
  const title = upper(sh ? nameOf(sh.name) : tl("Priest"));
  const said = sh ? tl("\u201c{text}\u201d", { text: tl(SHRINE.says) }) : tl(PRIEST.offer);
  const parts = [sheetParts.box([sheet.portrait(face, [sheet.text(said, sh ? S.text : S.label)])])];
  if (sh) parts.push(sheetParts.box([sheet.lines([[[tl("GIVES"), S.label]]], "fs"), sheetParts.block([sheet.text(words[0], INK.up)]),
    sheet.lines([[[tl("TAKES"), S.label]]], "fs"), sheetParts.block([sheet.text(words[1], INK.down)])], { gap: 2 }));
  parts.push(sheetParts.cta([sheetButton("N", "No", "stop", { key: "no" }), sheetButton("Y", "Yes", "go", { key: "yes" })], true));
  const spec = { title, titleRuns: [[title, sh?.pact ? INK.down : S.title]], w: TALK.w, parts };
  if (measuring) return drawSheet(spec, true);
  const hits = drawSheet(spec);
  talk.buttons = { yes: hits.yes, no: [hits.no, hits.close] };
}
// The burning bush's gifts (see BUSH), as a v0.13 sheet (option A, rows, of the ones shown the user,
// 2026-10-25): what it asks, then each gift in a dark2 block, [1] to [3] and its name over its card,
// each of which can be clicked or tapped too
function drawGifts(measuring) {
  const S = SHEET.ink;
  const gift = (g, i) => {
    const block = sheetParts.block([sheet.lines([sheetKey(String(i + 1), g.name)]), sheet.text(g.card, S.dim, "fs")]);
    return { ...block, draw: (x, y, w, hits) => { block.draw(x, y, w, hits); hits[`g${i}`] = [x, y, w, block.h(w)]; } };
  };
  const parts = [sheetParts.box([sheet.text(BUSH.seek, S.label)]), sheetParts.box(BUSH.gifts.map(gift), { gap: 2, pad: 4 })];
  const spec = { title: "BURNING BUSH", titleRuns: [[tl("BURNING BUSH"), BUSH.ink]], w: TALK.w, closes: false, parts };
  if (measuring) return drawSheet(spec, true);
  const hits = drawSheet(spec);
  talk.buttons = Object.fromEntries(BUSH.gifts.map((g, i) => [`g${i}`, hits[`g${i}`]]));
}
const talkButtonAt = (px, py) => Object.entries(talk?.buttons || {}).find(([, r]) => onRect(r, px, py))?.[0];

// The character dies: everything else that was up goes, and the game stops taking turns
// (or the journey's out of days, `timeUp`, see DAY); either way its score goes on the board
// (`by`: what killed the character, for the dashboard: the monster's kind, "-risen" after it for
// one risen at night, or "ghost" for a past player's)
// (watching a journey again, nothing's sent: its rank's the one it had when it was picked)
function die(at, { timeUp = false, by = null, foe = null } = {}) {
  if (!timeUp) { mourn(at); keepOwnGhost(); }
  dead = { at, buttons: {}, timeUp, score: journeyScore(timeUp, true), ghost: ghostOf(), step: watching ? "sent" : "name",
    fell: !timeUp && map === MAPS.outside ? { x: player.x, y: player.y, by } : null,   // (where, for the Daily's graves, see FALLEN)
    foe: foe?.called ?? null };   // (what killed them, as it's named, for the score card's epitaph)
  setTimeout(timeUp ? endOfDays : toll, Math.max(0, at - clock()));
  if (watching) board = { state: "done", rank: watching.rank, top: [] };
  else rankScore(dead.score, timeUp ? "time" : dayNumber(), by, foe);
  tellRun(timeUp ? "time" : "fell");
  setTimeout(() => typeName(), Math.max(0, at - clock()));   // once the box is up
  BUILD();                         // (for its record, see REPLAY)
  if (local && journal) BUILD().then(() => {   // (on a local server, kept for "?watch=last", once what ended it's in the record)
    try { localStorage.setItem("mektxt.lastJourney", JSON.stringify({ name: null, score: dead.score.score, replay: journeyRecord() })); } catch {}
  });
  held.length = 0;
  notice = null;
  talk = null;
  panel = null;
  aiming = null;
  leveling = null;
  inspecting = null;
  picking = null;
  ranking = null;
  if (chat) closeChat();
  setTimeout(() => { noFog = true; }, Math.max(0, at - clock()));   // with the blow
  say(timeUp ? [["Your time is up.", INK.title]] : [["You die.", INK.down]], at);
}
// The scoreboard (worker/scores.js): as the journey ends, the game-over box shows the rank its
// score would get there, and asks for a name to put it on the board under; once that's sent
// (Enter, or a tap on the box on a phone), the rank shows as it came. Esc skips it. Asking for the
// rank tells the board how the journey ended too (`ended`: the day it fell on, or "time", and
// `by`, what killed the character), for the dashboard (stats.html).
// The board takes a journey only with its ticket, asked for as its first turn's taken (tried
// again `retryMs` later, `tries` times, if it doesn't come), and only once it's been going as
// long as its days could be played (worker/scores.js TICKET). A name the board won't have (a
// swear or a slur, worker/moderate.js) comes back, and is typed again ("TRY AGAIN"). A journey
// with "?debug" in the address (its cheats) isn't sent, nor counted. Once sent (or skipped), it
// can be shared (see SHARE).
const TICKET = { retryMs: 5000, tries: 4 };
// Asking for a ticket, the page shows it's a person's (Cloudflare's Turnstile, Claude's design,
// 2026-10-18): a token from Turnstile's widget, unseen unless Cloudflare wants a click, sent with
// the asking (worker/index.js checks it, when the Worker has its TURNSTILE_SECRET). Its script's
// fetched only then, never as the page loads, so playing's no slower. `siteKey` is the widget's
// (Cloudflare: Turnstile, for mektxt.com and dos-age.com; null, none, till it's made), on a
// local server Cloudflare's test key that always passes unseen; given up on after `waitMs`
// (the ticket's asked for without one, which a Worker with its secret turns back).
const TURNSTILE = { siteKey: local ? "1x00000000000000000000BB" : null, waitMs: 15000,
  src: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" };
let turnstile = null;
function humanToken() {
  return Promise.resolve(null); // Local edition has no leaderboard ticket service.

  if (!TURNSTILE.siteKey) return Promise.resolve(null);
  turnstile ??= new Promise((ok, no) => document.head.append(Object.assign(document.createElement("script"), { src: TURNSTILE.src, async: true, onload: ok, onerror: no })));
  return turnstile.then(() => new Promise(ok => {
    const box = Object.assign(document.createElement("div"), { style: "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:50" });
    document.body.append(box);
    let widget = null, over = false;
    const done = token => {
      if (over) return;
      over = true;
      try { window.turnstile.remove(widget); } catch {}
      box.remove();
      ok(token);
    };
    widget = window.turnstile.render(box, { sitekey: TURNSTILE.siteKey, appearance: "interaction-only", action: "ticket",
      callback: done, "error-callback": () => done(null), "expired-callback": () => done(null), "timeout-callback": () => done(null) });
    setTimeout(() => done(null), TURNSTILE.waitMs);
  })).catch(() => { turnstile = null; return null; });
}
// (a Daily Challenge's journey goes on its day's board, and its rank's on that, see `daily`)
const dailyQuery = () => (dailyKey && dailyMode() ? `&daily=${dailyKey}` : "");
const offBoard = query.has("debug");
let ticket = null;
// (the ticket's the journey's id for the dashboard too, see RUN; a Daily Challenge's is good only
// for its day's board, `daily`)
function askTicket(tries = TICKET.tries) {
  return; // Local edition: no telemetry or leaderboard submissions.

  if (offBoard || watching || run.id || tries <= 0) return;
  humanToken().then(token => fetch(`/scores/start?v=${VERSION}&mode=${gameMode}${dailyQuery()}`, { method: "POST",
    ...(token ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) } : {}) })).then(r => r.json())
    .then(d => { if (typeof d.ticket !== "string") throw new Error(); run.id = ticket = d.ticket; })
    .catch(() => setTimeout(() => askTicket(tries - 1), TICKET.retryMs));
}
// What the dashboard (stats.html) learns of each journey, to make the game better, never who
// played it: no name, no address, only the journey's ticket (worker/scores.js RUN). Told as the
// class is settled, each sunrise, as the page is left or hidden, and as the journey ends: its mode,
// the class, whether it's played by touch or keys, the day, level and deepest floor reached, how
// long it's been played, and how often some things were done (`uses`: spells cast, potions drunk,
// Auto Equip and Auto Sort, a fairy ring's rite begun, a church gone into), and whether it was
// saved. `played` counts only the seconds the game's on screen, the website isn't up over it, and
// a key or a touch came in the last `idleMs`, so a tab left open isn't play. A journey not told of
// for a while without ending was left (the board decides when). Not while watching one again, nor
// with "?debug". (Claude's design, 2026-10-13)
const RUN = { idleMs: 60 * 1000, tickMs: 1000 };
const run = { id: null, played: 0, input: 0, ended: false, uses: { spells: 0, potions: 0, autoEquip: 0, autoSort: 0, rite: 0, church: 0 } };
const used = k => { if (!watching) run.uses[k]++; };
function tellRun(end = null) {
  if (!run.id || run.ended || watching) return;
  if (end) run.ended = true;
  fetch("/scores/run", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: run.id, end, cls: classOpen ? null : charClass, dev: tapping ? "touch" : "keys", day: dayNumber(), level: progress.level,
      floor: tally.deepest, played: Math.round(run.played / 1000), uses: run.uses }) }).catch(() => {});
}
for (const type of ["keydown", "pointerdown"]) addEventListener(type, () => { run.input = performance.now(); }, { capture: true, passive: true });
let runTick = performance.now();
setInterval(() => {
  const now = performance.now(), gap = now - runTick;
  runTick = now;
  if (run.id && !run.ended && active && !document.hidden && now - run.input < RUN.idleMs) run.played += Math.min(gap, 5 * RUN.tickMs);
}, RUN.tickMs);
addEventListener("pagehide", () => tellRun());
document.addEventListener("visibilitychange", () => { if (document.hidden) tellRun(); });
// Errors in the game, for the dashboard's Health tab: the message and where (file and line), a
// few kinds a page at most, each once, and a stall (the page held up `stallMs` or more while on
// screen, as a freeze that came back would). Nothing of the player's goes with it.
const FAULTS = { most: 3, stallMs: 5000 }, faulted = new Set();
function fault(msg) {
  return; // Errors remain in the local console.

  msg = String(msg ?? "").replace(/https?:\/\/[^/\s]+\//g, "").slice(0, 160);
  if (offBoard || watching || !msg || faulted.has(msg) || faulted.size >= FAULTS.most) return;
  faulted.add(msg);
  fetch("/scores/error", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ v: VERSION, msg }) }).catch(() => {});
}
addEventListener("error", e => fault(`${e.message} @ ${String(e.filename ?? "").split("/").pop()}:${e.lineno ?? 0}`));
addEventListener("unhandledrejection", e => fault(`${e.reason?.message ?? e.reason} (promise)`));
let stallTick = performance.now();
setInterval(() => {
  const now = performance.now();
  if (!document.hidden && now - stallTick >= FAULTS.stallMs + 1000) fault(`stalled ${now - stallTick >= 30000 ? "30s+" : now - stallTick >= 15000 ? "15-30s" : "5-15s"}`);
  stallTick = now;
}, 1000);
document.addEventListener("visibilitychange", () => { stallTick = performance.now(); });
let board = null;                  // { state ("sending", "done" or "offline"), rank, top }
const scoreFetch = (init, query = "", then) => {
  board = { state: "sending", rank: board?.rank ?? null, classRank: board?.classRank ?? null, top: [] };
  fetch(`/scores?v=${VERSION}${dailyQuery()}${query.replace("?", "&")}`, init)
    .then(r => r.json())
    .then(d => { if (!Array.isArray(d.top)) throw new Error(); board = { state: "done", rank: d.rank ?? board.rank, classRank: d.classRank ?? board.classRank, top: d.top }; then?.(d); })
    .catch(() => { board = { state: "offline", rank: board.rank, classRank: board.classRank, top: [] }; });
};
const rankScore = (sc, ended, by, foe) => scoreFetch(undefined, `?score=${sc.score}` +
  (offBoard || !ticket ? "" : `&ended=${ended}${by ? `&by=${by}` : ""}&as=${charClass}&ticket=${ticket}${killerQuery(foe)}`));
// What killed the character, for the nemeses (see NEMESIS): a nemesis's id, or a monster that
// could become one (out in the forest, not risen, a ghost, a hunter or a miniboss)
const killerQuery = s => !s ? "" : s.nemesis > 0 ? `&nem=${s.nemesis}`
  : s.on === MAPS.outside && !s.risen && !s.ghostGear && !s.hunts && !s.nemesis && s.rank !== "miniboss" && ENEMIES[s.kind]
    ? `&foe=${s.kind}&affix=${s.affix}&biome=${world.biomeAt(s.x, s.y)}${isNight() ? "&night=1" : ""}` : "";   // (as: the class, for the dashboard)
function sendScore(sc, name) {
  BUILD().then(() => scoreFetch({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, ticket, version: VERSION, ...sc, fell: dailyKey ? dead?.fell : null, replay: journeyRecord() }) }, "", d => {
    if (typeof d.card === "string" && dead) dead.card = d.card;   // (for putting its score card up, see shareScore())
    if (dead?.card && PHONE_OS) cardLink(scoreCard()).catch(() => {});   // (a phone's up at once: see shareOnPhone())
    if (d.error !== "name" || !dead) return;
    Object.assign(dead, { step: "name", badName: true, name: null });
    nameInput.value = "";
    try { localStorage.removeItem("mektxt.scoreName"); } catch {}
    typeName();
  }));
}
// The name's typed into a hidden field, like the chat (so phones bring up their keyboard): letters
// and digits only, in capitals, `max` at most (as the scoreboard keeps them). It starts as the
// name last sent from this browser; it can't be sent empty.
const SCORE_NAME = { max: 6 };
const nameInput = document.createElement("input");
Object.assign(nameInput, { type: "text", maxLength: SCORE_NAME.max, autocomplete: "off", spellcheck: false, enterKeyHint: "send" });
nameInput.setAttribute("aria-label", "排行榜昵称");
Object.assign(nameInput.style, { position: "fixed", left: "0", top: "0", width: "1px", height: "1px",
  opacity: "0", border: "0", padding: "0", fontSize: "16px" });
document.body.append(nameInput);
try { nameInput.value = (localStorage.getItem("mektxt.scoreName") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, SCORE_NAME.max); } catch {}
nameInput.addEventListener("input", () => { nameInput.value = nameInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, SCORE_NAME.max); });
nameInput.addEventListener("keydown", e => {
  e.stopPropagation();             // the game's keys stay out of it
  if (e.repeat) return;
  if (e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter") submitName();   // (a phone's Enter often has no `code`)
  else if (e.code === "Escape") { if (dead) dead.step = "sent"; nameInput.blur(); }   // (still focused once the game-over box has gone)
});
// (`tapped`: pressed, so it's focused afresh: a phone brings its keyboard up only for a focus
// that comes of a tap, not for one from before)
function typeName(tapped = false) {
  if (dead?.step !== "name" || !active) return;   // (not while the website's up)
  if (tapped) nameInput.blur();
  nameInput.focus();
  const end = nameInput.value.length;
  nameInput.setSelectionRange(end, end);
}
function submitName() {
  if (dead?.step !== "name") return;
  const name = nameInput.value.trim();
  if (!name) return;
  try { localStorage.setItem("mektxt.scoreName", name); } catch {}
  Object.assign(dead, { step: "sent", badName: false, name });
  nameInput.blur();
  if (!offBoard) sendScore({ ...dead.score, ghost: dead.ghost }, name);
}

// Sharing the journey ([S] Share to X, once the name's sent or skipped): a picture of it, the
// score card, and an invitation to play, linking `url` (dos-age.com's title screen, the user's
// ask 2026-10-19; `home` is where the card's own page is, see cardLink()), posted on X, on phones
// too (see shareScore()).
// The card (option D of four mock-ups, laid out as the user's own mock, 2026-10-28) is laid out
// on `W` by `H` px and drawn `m` times over, `w` * `k` by `h` * `k` (the size the Worker takes, see
// worker/scores.js putCard()), in the v0.13 fonts at whole px a font px:
// - the world round the character as they fell (`shot`, taken the frame the killing blow lands,
//   or the last day ends, before anything's drawn over it) on the left `worldW`, the character
//   at `heroX`, one of the `filters` added over it at `tint` (picked at random for each journey's
//   card), fading into dark1 from `fade` of the way across;
// - from `x` (to `right`), `top` down: the wordmark (title.js, `logo` px a logo px, red4) and the
//   site at the right (MEK Sans, bw5); `logoGap` on, the mode (bw4); `modeGap` on, the score (`score`
//   px a font px, brown5) and the score counter's star (blue4, as big); `scoreGap` on, the epitaph
//   (Dosage, bw5, the name bw6), its lines a strip and `leading` apart; `ranksGap` on, "All Rank"
//   and "Class Rank" stacked (`rank`: Dosage, MEK Sans for the "#n", "low" past 100th, or "-" if
//   it isn't on the board), each on a dark2 row with its corners chipped.
const SHARE = { url: "https://dos-age.com/", home: "https://dos-age.com", site: "DOS-AGE.com", file: "dos-age-score.png",
  w: 240, h: 135, k: 10, W: 1200, H: 675, m: 2,
  worldW: 600, heroX: 400, tint: 0.55, fade: 0.45, filters: ["#524b24", "#661c31", "#306082"],
  x: 650, right: 1165, top: 40, f: 2, logo: 2, siteY: 8, logoGap: 74, modeGap: 24, score: 6, starGap: 4, scoreGap: 36,
  leading: 8, ranksGap: 64, bottom: 30,
  rank: { f: 3, w: 400, padX: 20, padY: 15, gap: 12 },
  ink: { bg: "#071324", row: "#222034", word: "#d95763", site: "#9badb7", mode: "#847e87", score: "#eec39a", star: "#5b6ee1",
    says: "#9badb7", name: "#cbdbfc", allLabel: "#9badb7", classLabel: "#847e87", n: "#d9a066" } };
const shareRank = () => dead?.name && board?.state === "done" && board.rank <= RANKED ? board.rank : null;
// The world round the character, `w` by `h` of its own px, from the screen as it's drawn (at
// `scale` screen px each), lined up on them; what's off the screen is left dark1
function snapshot(pos) {
  const S = SHARE, c = document.createElement("canvas");
  c.width = S.w; c.height = S.h;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.fillStyle = S.ink.bg;
  g.fillRect(0, 0, S.w, S.h);
  const cx = (pos.x + 0.5) * CW, cy = (pos.y + 0.5) * CH;   // (the character's middle, in world px)
  const x0 = Math.round(cx - S.w / 2), y0 = Math.round(cy - S.h / 2);
  g.drawImage(canvas, originX + x0 * scale, originY + y0 * scale, S.w * scale, S.h * scale, 0, 0, S.w, S.h);
  return c;
}
function scoreCard() {
  const S = SHARE, I = S.ink, m = S.m, c = document.createElement("canvas");
  c.width = S.w * S.k; c.height = S.h * S.k;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  // (in layout px, each m card px; `f` px a font px)
  const text = (runs, x, y, f, font = SANS) => drawSans(g, runs, Math.round(x * m), Math.round(y * m), f * m, font);
  const width = (runs, f, font = SANS) => sansWidth(runs, font) * f;
  g.fillStyle = I.bg;
  g.fillRect(0, 0, c.width, c.height);
  // the world where they fell, on the left, fading out
  g.save();
  g.beginPath(); g.rect(0, 0, S.worldW * m, c.height); g.clip();
  if (dead.shot) g.drawImage(dead.shot, (S.heroX - S.W / 2) * m, 0, c.width, c.height);
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = S.tint;
  g.fillStyle = dead.filter ??= S.filters[Math.floor(Math.random() * S.filters.length)];   // (Math's, not the dice: it's no part of the journey)
  g.fillRect(0, 0, c.width, c.height);
  g.restore();
  // (a step each world px, not a smooth gradient: a colour of its own in every px made the PNG
  // nearly the Worker's 1 MB, CARD.maxBytes)
  for (let x = 0; x < S.worldW * m; x += S.k) {
    g.fillStyle = `rgba(7, 19, 36, ${Math.max(0, ((x + S.k / 2) / (S.worldW * m) - S.fade) / (1 - S.fade))})`;
    g.fillRect(x, 0, S.k, c.height);
  }
  // the wordmark and the site
  let y = S.top;
  drawWordmark(g, S.x * m, y * m, S.logo * m, I.word);
  const site = [[S.site, I.site]];
  text(site, S.right - width(site, S.f), y + S.siteY, S.f);
  y += 36 * S.logo + S.logoGap;
  // the mode, the score and its star (the score counter's, SCORE_HUD)
  text([[tl(dailyMode() ? "DAILY CHALLENGE MODE" : "COMPETITIVE MODE"), I.mode]], S.x, y, S.f);
  y += SANS.cap * S.f + S.modeGap;
  const score = dead.score.score.toLocaleString("en-US"), big = S.score;
  const sx = S.x + width([[score]], big) + S.starGap * big, sy = y + Math.round((SANS.cap - 7) * big / 2);
  text([[score, I.score]], S.x, y, big);
  g.fillStyle = I.star;
  SCORE_HUD.shape.forEach((row, r) => row.forEach(([cx, n]) => g.fillRect((sx + cx * big) * m, (sy + r * big) * m, n * big * m, big * m)));
  y += SANS.cap * big + S.scoreGap;
  // the epitaph, as many lines as leave the ranks room
  const R = S.rank, rowH = SANS.cap * R.f + 2 * R.padY, ranksH = 2 * rowH + R.gap;
  const vars = { name: [dead.name || "ADVENTURER", I.name], level: progress.level, who: noun(hero().name.toLowerCase()), day: dayNumber(), place: placeName().replaceAll(" ", "\u00a0") };   // (the place kept on one line)
  const foe = dead.foe ? noun(dead.foe) : null;
  const says = dead.timeUp ? tr("{name}, a level {level} {who}, lived through all {day} days.", vars, I.says)
    : foe ? tr("Here lies {name}, a level {level} {who}. Slain by {foe:a} on day {day}, in {place}.", { ...vars, foe }, I.says)
    : tr("Here lies {name}, a level {level} {who}. Fell on day {day}, in {place}.", vars, I.says);
  const pitch = SANS.h * S.f + S.leading, room = S.H - S.bottom - ranksH - S.ranksGap - y;
  const lines = wrapRuns(says, S.right - S.x, S.f, runs => sansWidth(runs, DOSAGE)).slice(0, Math.max(1, Math.floor((room - SANS.cap * S.f) / pitch) + 1))
    .map(line => line.map(([s, ink]) => [s.replaceAll("\u00a0", " "), ink]));
  lines.forEach((runs, i) => text(runs, S.x, y + i * pitch, S.f, DOSAGE));
  y += (lines.length - 1) * pitch + SANS.cap * S.f + S.ranksGap;
  // the ranks, stacked
  const shown = n => (dead.name && board?.state === "done" && n ? placeShown(n) : "-");
  [[tl("All Rank"), I.allLabel, shown(board?.rank)], [tl("Class Rank"), I.classLabel, shown(board?.classRank)]].forEach(([label, ink, n], i) => {
    const ry = y + i * (rowH + R.gap), chip = S.f;
    g.fillStyle = I.row;
    g.fillRect((S.x + chip) * m, ry * m, (R.w - 2 * chip) * m, rowH * m);
    g.fillRect(S.x * m, (ry + chip) * m, R.w * m, (rowH - 2 * chip) * m);
    text([[label, ink]], S.x + R.padX, ry + R.padY, R.f, DOSAGE);
    text([[n, I.n]], S.x + R.w - R.padX - width([[n]], R.f), ry + R.padY, R.f);
  });
  const bytes = Uint8Array.from(atob(c.toDataURL("image/png").split(",")[1]), ch => ch.charCodeAt(0));
  return new File([bytes], S.file, { type: "image/png" });
}
function shareScore() {
  if (!dead) return;
  const rank = shareRank(), score = dead.score.score.toLocaleString("en-US");
  const text = dailyMode()   // (a Daily Challenge's: Claude's words, 2026-10-18)
    ? tl(rank ? "I scored {score} and ranked #{rank} on today's Daily Challenge, {name}, in DOS-AGE by @michaelmicasso. Same map for everyone, free in your browser:"
      : "I scored {score} on today's Daily Challenge, {name}, in DOS-AGE by @michaelmicasso. Same map for everyone, free in your browser:", { score, rank, name: daily.name })
    : tl(rank ? "I scored {score} and ranked #{rank} in DOS-AGE by @michaelmicasso, a classic roguelike. Beat my score, free in your browser:"
      : "I scored {score} in DOS-AGE by @michaelmicasso, a classic roguelike. Beat my score, free in your browser:", { score, rank });
  // (to X, phones too, not the phone's share sheet: "Share to X", 445:38550, the user's ask 2026-10-12)
  // The card's put up on the site (/s/<id>, see worker/scores.js putCard()) and X
  // opened with its link, which X shows as the card itself, big. X's tab is opened now, while
  // this is still the press (a tab opened after waiting on the upload would be blocked), and
  // sent on to X once the link's back. Without one (offline, no card token, the upload refused),
  // as before: the card saved and copied, to paste into the post, and the game's own link.
  const intent = url => `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  if (PHONE_OS) return shareOnPhone(text, intent);
  const file = scoreCard();
  if (!dead.card && !dead.cardUrl) {   // (copied before X opens, while this page still has the focus a copy needs)
    keepCard(file);
    window.open(intent(SHARE.url), "_blank", "noopener");
    return;
  }
  const tab = window.open("", "_blank");
  if (tab) { tab.opener = null; tab.document.title = "Sharing..."; tab.document.body.style.background = "#071324"; }
  const post = url => { if (tab && !tab.closed) tab.location.href = intent(url); else window.open(intent(url), "_blank", "noopener"); };
  cardLink(file).then(url => { say("Your score card's up: post it on X."); post(url); }, () => {
    keepCard(file);
    post(SHARE.url);
  });
}
// A phone's or a tablet's own system, for opening the X app (null on a computer)
const PHONE_OS = /Android/i.test(navigator.userAgent) ? "android"
  : /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "ios" : null;
// On a phone, the X app first, the browser if there's none (the user's ask, 2026-10-12). An app
// opens only from the press itself, never after waiting on the upload, so a phone puts the card
// up as soon as it has its token (see sendScore()) and the press finds the link waiting. The app's
// tried by its own link (twitter://post): if this page is still showing a little after, there's no
// X app, and the next press posts from the browser instead.
const X_APP = { waitMs: 3000 };
function shareOnPhone(text, intent) {
  const go = url => {
    if (X_APP.none) { window.open(intent(url), "_blank", "noopener"); return; }
    let left = false;
    const away = () => { left = true; };
    for (const type of ["visibilitychange", "pagehide"]) window.addEventListener(type, away, { once: true });
    location.href = `twitter://post?message=${encodeURIComponent(`${text} ${url}`)}`;
    setTimeout(() => {
      for (const type of ["visibilitychange", "pagehide"]) window.removeEventListener(type, away);
      if (left || document.visibilityState !== "visible") return;
      X_APP.none = true;
      say("No X app? Press Share to X again to post from the browser.");
    }, X_APP.waitMs);
  };
  if (dead.cardUrl) return go(dead.cardUrl);
  if (!dead.card) { keepCard(scoreCard()); return go(SHARE.url); }
  say("Your score card's nearly ready...");
  cardLink(scoreCard()).then(() => say("Your score card's up: press Share to X again."), () => {
    dead.card = null;   // (the next press posts the game's own link, the card saved and copied)
    say("Your score card couldn't go up. Press Share to X again to post without it.");
  });
}
// The link to the journey's score card on the site, put up once (the same link the next time)
function cardLink(file) {
  if (dead.cardUrl) return Promise.resolve(dead.cardUrl);
  if (!dead.card) return Promise.reject(new Error("no card token"));
  return (dead.cardUp ??= fetch(`/scores/card?token=${dead.card}`, { method: "POST", headers: { "Content-Type": "image/png" }, body: file })
    .then(r => r.json()).then(d => {
      if (typeof d.url !== "string") throw new Error(d.error);
      return (dead.cardUrl = new URL(d.url, local || location.hostname.endsWith(".localhost") ? location.origin : SHARE.home).href);   // (dos-age.com's, from mektxt.com too: it's one Worker)
    })
    .finally(() => { if (dead) dead.cardUp = null; }));
}
// The card saved, and copied to paste into the post (when it can't be put up)
function keepCard(file) {
  // (the link's on the page while it's clicked, and the file kept a minute: some browsers won't
  // save from a link that isn't, or lose the file if it's let go of before they've saved it)
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(file), download: SHARE.file });
  a.style.display = "none";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60 * 1000);
  const saved = copied => say(copied ? "Your score card's saved and copied: paste it into your post." : "Your score card's saved: add it to your post.");
  try {
    navigator.clipboard.write([new ClipboardItem({ [file.type]: file })]).then(() => saved(true), () => saved(false));
  } catch { saved(false); }
}
// a new map, from a new seed, opened straight into the game (main.js), not the website: the
// screen goes dark first, and stays dark through the reload (index.html keeps the website hidden)
// (`mode`: the one the page is laid out for as it comes back, by default the one just played, so a
// Daily Challenge can be tried again with a press; `go`: straight on into it, see `opening`)
const startOver = (mode = watching ? null : gameMode, go = false) => {
  if (curtain?.out) return;
  try { sessionStorage.setItem("mektxt.restart", "1"); } catch {}
  try { if (mode) sessionStorage.setItem("mektxt.mode", mode); if (go) sessionStorage.setItem("mektxt.go", "1"); } catch {}
  try { if (dead) sessionStorage.setItem("mektxt.grow", "1"); } catch {}   // (the trees after a death, see BETWEEN)
  curtain = { t0: clock(), out: true };
  setTimeout(() => location.reload(), CURTAIN_MS);
};
function drawCurtain(now) {
  if (!curtain) return;
  curtain.t0 ??= now;
  const k = Math.min(1, (now - curtain.t0) / CURTAIN_MS);
  if (!curtain.out && k >= 1) { curtain = null; return; }
  ctx.fillStyle = `rgba(7, 19, 36, ${curtain.out ? k : 1 - k})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}
// (the whole game, from mektxt.com's game-over box: see GAME_OVER fullUrl)
const openFullGame = () => window.open(GAME_OVER.fullUrl, "_blank", "noopener");
const deadButtonAt = (px, py) => Object.entries(dead?.buttons || {}).find(([, [x, y, w, h]]) =>
  px >= x && px < x + w && py >= y && py < y + h)?.[0];

// A tile with some of its colours swapped (`swaps`: [from, to] hex pairs), made once
const recoloured = new Map();      // `${tile} ${swaps}` -> canvas
function recolour(t, swaps) {
  const k = `${t} ${swaps}`;
  if (!recoloured.has(k)) {
    const c = document.createElement("canvas"), g = c.getContext("2d"), rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    c.width = CW; c.height = CH;
    g.drawImage(tiles, t * CW, 0, CW, CH, 0, 0, CW, CH);
    const img = g.getImageData(0, 0, CW, CH), pairs = swaps.map(([a, b]) => [rgb(a), rgb(b)]);
    for (let i = 0; i < img.data.length; i += 4) {
      const to = pairs.find(([a]) => a.every((v, j) => img.data[i + j] === v))?.[1];
      if (to) [img.data[i], img.data[i + 1], img.data[i + 2]] = to;
    }
    g.putImageData(img, 0, 0);
    recoloured.set(k, c);
  }
  return recoloured.get(k);
}

// The game-over box, once the killing blow has landed, or the last day's out (see GAME_OVER)
// (as the v0.13 sheet has it, "days-up-1a/b/c" 876:84975... and "death-1a/b/c" 876:85495..., see
// SHEET: green for the days run out, red for one who died; the picture over its caption, or once
// the name's sent, the character between two hearts or skulls over their name and class; the mode
// over the score, rank and class rank on blue1, and [G] Leaderboard; then the name's box and
// [Y] Submit Score, or [S] Share to X and [R] Restart Game)
function drawGameOver(now, measuring = false) {
  if (!dead || now < dead.at || dead.hidden) return;
  if (!measuring) fitUi(() => drawGameOver(now, true));
  const G = GAME_OVER, I = G.ink, S = SHEET.ink, { timeUp, score: sc } = dead, kind = timeUp ? "go" : "stop";
  const naming = dead.step === "name", theme = timeUp ? I.hint : I.hintDied;
  const tile = (t, x, y) => { const { u } = uiMetrics(); ctx.drawImage(t instanceof HTMLCanvasElement ? t : tiles, ...(t instanceof HTMLCanvasElement ? [0, 0] : [t * CW, 0]), CW, CH, x, y, CW * u, CH * u); };
  const look = SCENE.classes[charClass].right;
  const heart = () => recolour(HUD.statIcons.hp, [["#d95763", I.heart], ["#45283c", I.heartBg]]), skull = () => recolour(SCENE.deathRed, [["#d95763", I.skull]]);
  // the picture: the days run out (hearts, the character and a villager) or death (skulls round the character)
  const art = { minW: () => uiMetrics().px(3 * CW + 2 * (G.sideGap + CW)), h: () => uiMetrics().px(3 * CH),
    draw: (x, y, w) => {
      const { px } = uiMetrics(), mid = x + Math.round(w / 2);
      if (timeUp) {
        const heartsX = mid - px(3 * CW / 2), hh = heart();
        for (const [c, r] of G.hearts) tile(hh, heartsX + px(c * CW), y + px(r * CH));
        tile(look, heartsX - px(G.sideGap + CW), y + px(CH));
        tile(recolour(SCENE.villager1.calm.left, [["#639bff", I.villager]]), heartsX + px(3 * CW + G.sideGap), y + px(CH));
      } else {
        const sk = skull(), cx = mid - px(CW / 2), cy = y + px(CH);
        tile(look, cx, cy);
        for (const [dx, dy] of G.skulls) tile(sk, cx + px(dx), cy + px(dy));
      }
    } };
  // (all of it MEK Sans, the user's, 2026-10-27)
  const caption = timeUp ? sheet.text("\"YOUR JOURNEY ENDS HERE, ADVENTURER!\"", I.caption, "f", SANS) : sheet.text(tl("YOU SUCCUMBED TO DEATH ON DAY {n}", { n: dayNumber() }), I.died, "f", SANS);
  // (once it's sent: the character between two hearts or skulls, over their name and class)
  const who = dead.name || tl("YOU"), sign = { minW: () => uiMetrics().px(3 * CW + 16), h: () => uiMetrics().px(CH),
    draw: (x, y, w) => {
      const { px } = uiMetrics(), mid = x + Math.round(w / 2), t = timeUp ? heart() : skull();
      tile(t, mid - px(CW / 2 + 8 + CW), y); tile(look, mid - px(CW / 2), y); tile(t, mid + px(CW / 2 + 8), y);
    } };
  const top = naming || !dead.name ? [art, centre(caption)]
    : [sign, sheet.lines([[[who, S.text]]], "big", true), sheet.lines([[[upper(nameOf(CLASSES[charClass].name)), I.caption]]], "f", true)];
  // the score, rank and class rank
  const value = (t, ink) => [[t, ink]];
  const rows = [[english("SCORE"), value(sc.score.toLocaleString("en-US"), S.text)], [english("RANK"), value(rankShown(), S.title)],
    [english("CLASS RANK"), value(board?.state === "done" ? (board.classRank ? placeShown(board.classRank) : "-") : rankShown(), S.title)]]
    .map(([l, v]) => sheet.row([[tl(l), S.label]], v, { bg: S.line, rightSize: "big" }));
  const boardLink = { ...sheet.lines([tapKeys([["[", "#847e87"], ["G", S.title], [`] ${tl("Leaderboard")}`, "#847e87"]])], "f", true), key: "board" };
  const scores = sheetParts.box([sheet.padded(sheet.lines([[[dailyMode() ? tl("DAILY") : tl("COMPETITIVE"), S.title]]], "f", true)), ...rows,
    sheet.padded({ ...boardLink, draw: (x, y, w, hits) => { boardLink.draw(x, y, w); hits.board = [x, y - uiMetrics().px(4), w, boardLink.h() + uiMetrics().px(8)]; } })], { pad: 2, gap: 2 });
  // the name's box (while it's typed) and Submit Score, or Share to X and Restart Game
  const nameBox = { minW: () => Math.max(...[tl("Submit Name"), tl("Try Again")].map(s => sheetW([[`${upper(s)}... [${SCORE_NAME.max}]`]]))) + uiMetrics().px(16), h: () => uiMetrics().px(18),
    draw: (x, y, w, hits) => {
      const { px } = uiMetrics(), h = px(18), focused = document.activeElement === nameInput, v = nameInput.value;
      ctx.fillStyle = S.bg; ctx.fillRect(x, y, w, h);
      sheetFrame(x, y, w, h, theme);
      const blinkOff = focused && Math.floor(now / 500) % 2 === 1;
      const runs = v ? [[v, S.text], ...(v.length < SCORE_NAME.max ? [["_", blinkOff ? S.bg : S.text], ["_".repeat(SCORE_NAME.max - v.length - 1), theme]] : [])]
        : [[`${dead.badName ? tl("Try Again") : tl("Submit Name")}... [${SCORE_NAME.max}]`, dead.badName ? I.bad : theme]];
      const size = v ? "big" : "f";
      drawSans(ctx, runs, x + Math.round((w - sheetW(runs, size)) / 2), y + Math.round((h - sheetLineH(size)) / 2), sheetFont(size));
      hits.name = [x, y, w, h];
    } };
  const toFull = ON_SITE && !watching;
  const cta = naming ? sheetParts.box([nameBox], { pad: 2 }) : null;
  const buttons = naming ? [sheetButton("Y", "Submit Score", kind, { key: "submit" })]
    : [sheetButton("S", "Share to X", "plain", { key: "share" }), sheetButton("R", "Restart Game", kind, { key: "start" }),
      ...(toFull ? [{ runs: sheetKey("D", "Play More on DOS-AGE.COM", "#5d73ff"), key: "full" }] : [])];
  const spec = { title: "GAME OVER", w: cardPanelW(90), help: dead.help, lift,
    helpText: dailyMode() ? G.helpDaily : timeUp ? G.help : G.helpDied,
    parts: [sheetParts.box(top, { pad: 8, gap: 8 }), scores, ...(cta ? [cta] : []), sheetParts.cta(buttons)] };
  if (measuring) return drawSheet(spec, true);
  const hits = drawSheet(spec);
  dead.buttons = { help: hits.help, close: hits.close, board: hits.board };
  for (const k of ["name", "submit", "share", "start", "full"]) if (hits[k]) dead.buttons[k] = hits[k];
}
// (a part with each of its lines in the middle)
const centre = part => ({ ...part, draw: (x, y, w, hits) => {
  const lines = part.lines?.(w);
  if (!lines) return part.draw(x, y, w, hits);
  lines.forEach((runs, i) => drawSans(ctx, runs, x + Math.round((w - sheetW(runs, part.size, part.font)) / 2), y + i * sheetPitch(part.size), sheetFont(part.size), part.font));
} });
// The rank the game-over box shows: its place on the board, "..." while that's being asked, "low"
// when it didn't make the board, "-" with the board out of reach
// A place on the board as it's shown: "#12", or "low" past the `RANKED` best (or with none)
const RANKED = 100;
const placeShown = rank => (rank && rank <= RANKED ? `#${rank}` : tl("low"));
const rankShown = () => board?.state === "done" ? placeShown(board.rank) : board?.state === "sending" ? "..." : "-";

// A monster's panel (see MONSTER_PANEL), a v0.13 sheet laid out as the item card (option A of the
// ones shown the user, 2026-10-25): its look in a box beside its name and its kind's rank, what it
// is, its hp over a 2 by 2 of its stats, its ways and when it's out, and the spell it knows
function drawMonster(measuring = false) {
  if (!inspecting) return;
  if (!measuring) fitUi(() => drawMonster(true));
  const M = MONSTER_PANEL, I = M.ink, s = inspecting.foe, sees = what => stat("mag") >= M.insight[what];
  const value = k => !sees(k) ? (k === "hp" ? M.unknownHp : M.unknown) : String(Math.max(0, s[k])) + (k === "hp" && sees("fullHp") ? `/${s.fullHp}` : "");
  const [way, wayInk] = M.ways[s.hunts || s.nemesis ? "hunts" : s.evasive ? "evasive" : s.wanders ? "passive" : "aggressive"];
  const time = tl(s.day ? english("day") : s.risen && !s.ghostGear ? english("night") : english("all-day"));
  const rank = ENEMIES[s.kind]?.rank, rankName = rank && tl(M.ranks[rank]);
  const spell = s.spell ? SKILLS[s.spell] : null;
  const stat2 = (a, b) => sheetParts.pair(sheet.stat(a, STAT_SHORT[a], value(a)), sheet.stat(b, STAT_SHORT[b], value(b)));
  const parts = [
    sheetParts.box([sheet.portrait(SCENE[s.look ?? s.kind][s.affix].right, [sheet.text(s.name, I.name, "f", SANS), ...(rankName ? [sheet.text(rankName, SHEET.ink.label, "fs")] : [])]),
      sheet.text(s.desc, I.desc, "fs")]),
    sheetParts.box([sheet.stat("hp", STAT_SHORT.hp, value("hp")), stat2("atk", "mag"), stat2("def", "spd")], { gap: 2, pad: 4 }),
    sheetParts.box([sheet.row([[tl(way), wayInk]], [[time, I.time]], { bg: null, pad: 0, size: "fs", leftFont: BODY, rightFont: BODY })], { pad: 4 }),
  ];
  if (spell) parts.push(sheetParts.box([sees("spell") ? sheet.stat(icon(s.spell), spell.name, "", { tile: true, ink: I.name }) : sheet.lines([[[M.unknownHp, I.hidden]]])], { pad: 4 }));
  const spec = { title: "OBSERVE", w: cardPanelW(M.w), help: inspecting.help, helpText: M.help, parts };
  if (measuring) return drawSheet(spec, true);
  const hits = drawSheet(spec);
  Object.assign(inspecting, { close: hits.close, help: !!inspecting.help, hits: { help: hits.help, close: hits.close } });
}

// The bag's card is the size of the biggest any item's or spell's can be (at the scale it's
// drawn at), so the bag never changes size as what's picked changes
const biggestCards = new Map();    // `${uiU} ${language}` -> { w, h } (another language's words, another size)
function biggestCard() {
  const k = `${uiU} ${language()}`;
  if (!biggestCards.has(k)) {
    const boxes = [...Object.keys(ITEMS), ...Object.keys(SKILLS)].map(id => itemBox(id, { desc: true }));
    biggestCards.set(k, { w: Math.max(...boxes.map(b => b.w)), h: Math.max(...boxes.map(b => b.h)) });
  }
  return biggestCards.get(k);
}
// What's in cell c of the bag (see KEY0): an item or spell id, or null
const cellItem = c => (c < KEY0 ? wearing(GEAR[c]) : c < BAG0 ? shortcuts[c - KEY0] : bag[c - BAG0]?.id ?? null);
// The bag slot of what's in cell c (a key's: the stack it uses, see cast()), or -1
function cellSlot(c) {
  if (c >= BAG0) return bag[c - BAG0] ? c - BAG0 : -1;
  if (c < KEY0) return equipped[GEAR[c]] ?? -1;
  const id = shortcuts[c - KEY0];
  return id ? bag.findLastIndex(b => b?.id === id) : -1;
}
// The bag's buttons: [label runs, enabled] for drop, swap and use (for what's picked), and for
// best and sort (Auto Equip and Auto Sort, for the whole bag)
function bagButtons() {
  const B = BAG_PANEL, I = B.ink, id = cellItem(panel.focus), at = cellSlot(panel.focus), swap = panel.swap;
  const key = (pre, k, rest, button, on) => [tapKeys([...(pre ? [[pre, on ? I.label : I.dim]] : []), ["[", on ? I.label : I.dim],
    [k, on ? B.buttons[button].key : I.dim], ["]" + rest, on ? I.label : I.dim]], tapping || phone), on];
  const gear = !!ITEMS[id]?.slot;
  const leavable = !!id && panel.focus >= BAG0 && !classBound(id);
  return {
    drop: key("", "D", "rop", "drop", !swap && !!id && !classBound(id)),
    swap: key("", "S", "wap", "swap", swap ? leavable : !!id || panel.moving !== null),
    use: gear ? key(at >= 0 && wornAt(at) ? "Un" : "", "E", "quip", "use", !swap && (wearable(id) || !!wornAt(at)))
      : key("", "U", "se", "use", !swap && !!id && keyable(id)),
    best: key("", "G", " Auto Equip", "best", !swap && panel.moving === null && bagCount() > 0),
    sort: key("", "T", " Auto Sort", "sort", !swap && panel.moving === null && bagCount() > 0),
    ...(panel.smith ? { smith: key("", "U", `pgrade: -${smithCost()} max HP`, "smith", upgradable(panel.focus) && smithCanPay()) } : {}),
  };
}
// The bag's panel (see BAG_PANEL), as the v0.13 sheet has it ("bag-ui" 834:90893, see SHEET):
// along the top "GEARS / SHORTCUT / BAG" (gold, blue, green); the three gears worn, each a box and
// its kind's name; the shortcut keys, a box each with its number under it, in two halves; then the
// bag's slots (each marked with its key, top left, "E" while worn, top right, and a stack's count)
// over [T] Auto Sort and [G] Auto Equip, beside the card of what's picked, framed green; and
// [D] Drop, [S] Swap and [U] Use (Equip, Unequip) along the bottom. On a phone the slots go 6
// to a row with the card under them, and no Auto Sort or Auto Equip.
function drawPanel(measuring = false) {
  if (!panel) return;
  if (!measuring) fitUi(() => drawPanel(true));
  const B = BAG_PANEL, I = B.ink, S = SHEET.ink, L = bagLayout(), cols = L.cols;
  const boxW = () => uiMetrics().px(16), boxH = () => uiMetrics().px(18);
  const dragging = panel.drag?.on ? panel.drag.from : null;
  const dim = c => (panel.smith && !upgradable(c)) || dragging === c;   // (drawn faint)
  const ring = c => (c === panel.moving || (dragging !== null && c === panel.hover && c !== dragging) ? I.moving
    : c === panel.focus ? I.picked : null);
  // a box: dark1 in a blue1 line (green picked, blue moving), its thing's icon or hatched
  const box = (x, y, id, c, faint = false) => {
    const { u, px } = uiMetrics(), w = boxW(), h = boxH();
    ctx.fillStyle = S.bg; ctx.fillRect(x, y, w, h);
    sheetFrame(x, y, w, h, ring(c) ?? S.line, px(1), true);
    const ix = x + Math.round((w - CW * u) / 2), iy = y + Math.round((h - CH * u) / 2);
    ctx.globalAlpha = faint ? SHORTCUT.coolDim : 1;
    if (id) ctx.drawImage(tiles, icon(id) * CW, 0, CW, CH, ix, iy, CW * u, CH * u);
    else drawHatch(ix, iy, u);
    if (id && !faint) relicShine(id, ix, iy, CW * u, CH * u);
    ctx.globalAlpha = 1;
    return [ix, iy];
  };
  const ss = "f";   // (the slots' numbers and marks: Figma's 8 px)
  // the gears worn: a box and its kind's name each, in thirds
  const gearNames = GEAR.map(g => tl(GEAR_NAMES[g]));
  const gears = { minW: () => 3 * (boxW() + uiMetrics().px(4) + Math.max(...gearNames.map(n => sheetW([[n]])))) + uiMetrics().px(8),
    h: () => (phone ? boxH() + uiMetrics().px(8) : uiMetrics().px(B.sheet.gearsH)),
    draw: (x, y, w, hits) => {
      const { u, px } = uiMetrics(), h = gears.h();
      GEAR.forEach((g, i) => {
        const cx = x + Math.round(i * w / 3), cw = x + Math.round((i + 1) * w / 3) - cx, id = wearing(g), name = [[gearNames[i], S.title]];
        const gw = boxW() + px(4) + sheetW(name), gx = cx + Math.round((cw - gw) / 2), by = y + Math.round((h - boxH()) / 2);
        const [ix, iy] = box(gx, by, id, i, dim(i));
        if (!id && i === 0 && hero().noWeapons) {   // a class that can't wear one (the brawler): a red cross where it'd go
          const n = 7, p = Math.max(1, Math.round(u)), crossX = ix + Math.round((CW * u - n * p) / 2), crossY = iy + Math.round((CH * u - n * p) / 2);
          ctx.fillStyle = INK.down;
          for (let k = 0; k < n; k++) { ctx.fillRect(crossX + k * p, crossY + k * p, p, p); ctx.fillRect(crossX + (n - 1 - k) * p, crossY + k * p, p, p); }
        }
        drawSans(ctx, name, gx + boxW() + px(4), y + Math.round((h - sheetLineH()) / 2), sheetFont());
        hits.cells[i] = [cx, y, cw, h];
      });
    } };
  // the shortcut keys: a box each, its number under it, in two halves
  const K = phone ? { top: 4, num: 2 } : B.sheet.keys;
  const keys = { minW: () => SLOTS * boxW() + uiMetrics().px((SLOTS - 1) * 2 + 8 + 10),   // (boxes 2 apart at least, 8 more between the halves, 5 in either side)
    h: () => (phone ? boxH() + uiMetrics().px(10) + sheetLineH(ss) : Math.max(uiMetrics().px(K.h), boxH() + uiMetrics().px(K.top + K.num + 1) + sheetLineH(ss))),
    draw: (x, y, w, hits) => {
      const { px } = uiMetrics(), half = Math.ceil(SLOTS / 2), split = px(8), pitch = Math.floor((w - px(12) - split) / SLOTS);
      for (let k = 0; k < SLOTS; k++) {
        const c = KEY0 + k, id = shortcuts[k], cx = x + px(6) + k * pitch + (k >= half ? split : 0), bx = cx + Math.round((pitch - boxW()) / 2), by = y + px(K.top);
        box(bx, by, id, c, dim(c) || (id && cooling.has(id)));
        if (ITEMS[id]) { const n = [[String(carried(id)), I.count]]; drawSans(ctx, n, bx + boxW() - sheetW(n, ss), by + boxH() - sheetLineH(ss) + px(1), sheetFont(ss)); }
        const num = [[String(k + 1), I.key]];
        drawSans(ctx, num, bx + Math.round((boxW() - sheetW(num, ss)) / 2), by + boxH() + px(K.num), sheetFont(ss));
        hits.cells[c] = [cx, y, pitch, keys.h()];
      }
    } };
  // the bag's slots, `cols` to a row
  const G = phone ? { gap: 3, pad: 4, side: 6 } : B.sheet.grid, autosUnder = !phone && !panel.swap;
  const gap = () => uiMetrics().px(G.gap), rows = Math.ceil(BAG_SIZE / cols);
  const grid = { minW: () => cols * (boxW() + gap()) - gap() + uiMetrics().px(G.side),
    h: () => rows * (boxH() + gap()) - gap() + uiMetrics().px(2 * G.pad + (autosUnder ? 1 : 0)),
    draw: (x, y, w, hits) => {
      const { px } = uiMetrics(), gx = x + Math.round((w - (cols * (boxW() + gap()) - gap())) / 2), gy = y + px(G.pad), mark = px(B.markPad);
      if (autosUnder) { ctx.fillStyle = S.line; ctx.fillRect(x, y + grid.h() - px(1), w, px(1)); }   // (Auto Sort's top, 834:90892)
      for (let i = 0; i < BAG_SIZE; i++) {
        const c = BAG0 + i, bx = gx + (i % cols) * (boxW() + gap()), by = gy + Math.floor(i / cols) * (boxH() + gap()), it = bag[i];
        box(bx, by, it?.id, c, dim(c));
        hits.cells[c] = [bx, by, boxW(), boxH()];
        if (!it) continue;
        const k = shortcuts.findIndex((id, k) => id && cellSlot(KEY0 + k) === i);
        if (k >= 0) drawSans(ctx, [[String(k + 1), I.key]], bx + mark, by + mark, sheetFont(ss));
        if (wornAt(i)) { const e = [["E", I.worn]]; drawSans(ctx, e, bx + boxW() - mark - sheetW(e, ss), by + mark, sheetFont(ss)); }
        if (it.n > 1) { const n = [[String(it.n), I.count]]; drawSans(ctx, n, bx + boxW() - mark - sheetW(n, ss), by + boxH() - sheetLineH(ss), sheetFont(ss)); }
      }
    } };
  // [T] Auto Sort and [G] Auto Equip: rows on dark1, a blue1 line under each
  const buttons = bagButtons();
  const auto = (name, k, label, last = false) => ({ minW: () => sheetW([[`[${k}] ${tl(label)}`]]) + uiMetrics().px(12), h: () => uiMetrics().px(last ? 17 : 18),
    draw: (x, y, w, hits) => {
      const { px } = uiMetrics(), h = px(17), on = buttons[name][1];
      const runs = tapKeys([["[", "#306082"], [k, on ? S.title : PICKUP.ink.dim], ["]", "#306082"], [` ${tl(label)}`, on ? S.label : PICKUP.ink.dim]], tapping || phone);
      ctx.fillStyle = S.bg; ctx.fillRect(x, y, w, h);
      drawSans(ctx, runs, x + Math.round((w - sheetW(runs)) / 2), y + Math.round((h - sheetLineH()) / 2), sheetFont());
      if (!last) { ctx.fillStyle = S.line; ctx.fillRect(x, y + h, w, px(1)); }
      hits.buttons[name] = [x, y, w, h];
    } });
  // (the blacksmith's: his price under the slots instead, see SMITH)
  const autos = panel.smith ? [sheetParts.box([sheet.text(SMITH.price, I.label, "fs")], { pad: 4 })] : phone || panel.swap ? [] : [auto("sort", "T", english("Auto Sort")), auto("best", "G", english("Auto Equip"), true)];
  const left = { minW: () => Math.max(grid.minW(), ...autos.map(a => a.minW())), h: (w = left.minW()) => grid.h() + autos.reduce((n, a) => n + a.h(w), 0),
    draw: (x, y, w, hits) => {
      grid.draw(x, y, w, hits);
      let ay = y + grid.h();
      for (const a of autos) { a.draw(x, ay, w, hits); ay += a.h(w); }
      if (autosUnder) { ctx.fillStyle = S.line; ctx.fillRect(x, ay, w, uiMetrics().px(1)); }   // (under Auto Equip, when a long card goes on below it)
    } };
  // the card of what's picked, framed green (EMPTY in the middle when there's nothing)
  const id = panel.smith && upgradable(panel.focus) ? smithMakes(cellItem(panel.focus)) : cellItem(panel.focus), cardBox = () => biggestCard();
  // (always as tall as the tallest card any item or spell has, see biggestCard, and on a computer as the slots
  // with [T] Auto Sort and [G] Auto Equip under them at least, so the bag never changes size as what's picked
  // changes; what grows past it, a blade's story, has its description cut short, see itemBox's maxH)
  const cardH = () => Math.max(cardBox().h + 2 * uiMetrics().px(1), phone ? 0 : grid.h() + uiMetrics().px(18) + uiMetrics().px(17));
  const card = { minW: () => cardBox().w + 2 * uiMetrics().px(1), h: () => cardH(),
    draw: (x, y, w) => {
      const { px } = uiMetrics(), h = Math.max(card.h(), phone ? 0 : left.h());
      if (id) itemBox(id, { desc: true, maxH: h - px(2) }).draw(x + px(1), y + px(1), w - px(2), h - px(2));
      else { const e = [[tl("EMPTY"), I.empty]]; drawSans(ctx, e, x + Math.round((w - sheetW(e)) / 2), y + Math.round((h - sheetLineH()) / 2), sheetFont()); }
      sheetFrame(x, y, w, h, id ? S.picked : S.line);
    } };
  const lower = phone ? [left, card] : [{ ...sheetParts.across([left, card], 1), h: w => Math.max(left.h(), card.h()) }];   // (centred on its own height: the card no longer changes it)
  // [D] Drop, [S] Swap and [U] Use (Equip / Unequip for gear)
  const gear = !!ITEMS[id]?.slot, at = cellSlot(panel.focus), worn = at >= 0 && !!wornAt(at);
  const useWords = gear ? [worn ? english("Unequip") : english("Equip"), "E"] : [english("Use"), "U"];
  const cta = panel.smith ? sheetParts.cta([sheetButton("U", tl("Upgrade: -{n} max HP", { n: smithCost() }), "go", { key: "smith", on: buttons.smith[1] })])
    : sheetParts.cta([sheetButton("D", "Drop", "stop", { key: "drop", on: buttons.drop[1] }),
    sheetButton("S", "Swap", "plain", { key: "swap", on: buttons.swap[1] }),
    sheetButton(useWords[1], useWords[0], "go", { key: "use", on: buttons.use[1] })], true, phone ? SHEET.ctaH : B.sheet.ctaH);
  const titleRuns = panel.smith ? [[tl(SMITH.title), S.title]] : panel.swap ? [[tl("LEAVE WHAT?"), S.title]]
    : [[tl("GEARS"), S.title], [" / ", "#3f3f74"], [tl("SHORTCUT"), "#5b6ee1"], [" / ", "#3f3f74"], [tl("BAG"), S.picked]];
  const spec = { title: "BAG", titleRuns, w: phone ? L.w : SHEET.wideW, help: panel.help, bottom: phone ? SHEET.bottom : 1,
    helpText: [...BAG_HELP.lines.filter(line => !phone || !line.includes("Auto Equip")).map(line => tl(line, { Click: tapping ? tl("Tap") : tl("Click") })), ...(tapping ? [] : [BAG_HELP.keys])],
    parts: [gears, keys, ...lower, cta] };
  let hits = { cells: [], buttons: {} };
  // (the parts write their rects into `hits`, which drawSheet() hands them)
  const wrapParts = spec.parts.map(p => ({ ...p, draw: (x, y, w, h0) => { h0.cells ??= []; h0.buttons ??= {}; hits = h0; p.draw(x, y, w, h0); } }));
  spec.parts = wrapParts;
  if (measuring) return drawSheet(spec, true);
  const drawn = drawSheet(spec);
  panel.hits = { box: drawn.box, cells: drawn.cells ?? [], close: drawn.close, help: drawn.help,
    buttons: { ...(drawn.buttons ?? {}), ...(drawn.drop ? { drop: drawn.drop } : {}), ...(drawn.swap ? { swap: drawn.swap } : {}), ...(drawn.use ? { use: drawn.use } : {}), ...(drawn.smith ? { smith: drawn.smith } : {}) } };
  // what's being dragged, under the pointer
  if (dragging !== null && cellItem(dragging)) {
    const { u } = uiMetrics();
    ctx.drawImage(tiles, icon(cellItem(dragging)) * CW, 0, CW, CH, Math.round(panel.drag.x - CW * u / 2), Math.round(panel.drag.y - CH * u / 2), CW * u, CH * u);
  }
}
// What's lying on the ground at cell k and on every cell touching it (any way, corners too), and
// touching those, and so on, as far as GROUND.reach cells from the character: shown together in
// the pickup as one pile (see PICKUP). Each item with [its cell, its place in that cell's pile];
// k's own pile last, so its top is picked to start with (Claude's picks, 2026-10-12)
const GROUND = { reach: 3 };
function groundAround(k) {
  const cells = [k], seen = new Set(cells);
  for (let n = 0; n < cells.length; n++) {
    const [x, y] = cells[n].split(",").map(Number);
    for (const [dx, dy] of AROUND) {
      const c = key(x + dx, y + dy);
      if (seen.has(c) || !map.drops.has(c) ||
        Math.max(Math.abs(x + dx - player.x), Math.abs(y + dy - player.y)) > GROUND.reach) continue;
      seen.add(c);
      cells.push(c);
    }
  }
  const order = [...cells.slice(1).sort((a, b) => { const [ax, ay] = a.split(","), [bx, by] = b.split(","); return ay - by || ax - bx; }), k];
  const from = order.flatMap(c => map.drops.get(c).map((_, i) => [c, i]));
  return { pile: from.map(([c, i]) => map.drops.get(c)[i]), from };
}

// F opens what's next to the character (see PICKUP): a chest's find, or what's lying on the
// ground there and next to it (see groundAround()), the top of the pile picked to start with.
// What's inside a chest is decided the first time, so it's the same if they come back.
function interact() {
  if (unreadNote()) return readNote(unreadNote());
  const target = interactTarget();
  if (!target) {
    const b = bushTarget();
    if (b) return speakToBush(b);   // (see BUSH)
    const t = towerTarget();
    if (t) { enterTower(t.tower); return; }
    const sh = shrineTarget();
    if (sh) return meetShrine(sh.shrine);   // (see SHRINE)
    const g = graveTarget();
    if (g) return readGrave(g);   // (see GRAVE)
    const n = noteTarget();
    if (n) readNote(n);   // (see NOTES)
    return;
  }
  const chest = key(...target), { pile, from } = map.drops?.has(chest) ? groundAround(chest) : { pile: null, from: null };
  if (!pile && !ITEMS[map.loot.get(chest)] && !SKILLS[map.loot.get(chest)])
    map.loot.set(chest, (lootBase(map, ...target) >= RELIC.deep && relicDrop(RELIC.odds.chest)) || roll(map.loot.get(chest)));
  if (!pile && DAILY.inferior && map.loot.has(chest)) map.loot.set(chest, worse(map.loot.get(chest)));   // (a chest's set one too, the cave's torch)
  notice = { item: pile ? pile.at(-1) : map.loot.get(chest), chest, pile, from, pick: pile ? pile.length - 1 : 0, buttons: {}, slots: [], help: false };
  if (!pile) {                     // a chest's lid, not something on the ground (and a glint after it for a find worth one)
    creak();
    const r = rarity(notice.item, lootBase(map, ...target));
    if (r && !tally.chests.has(`${map.id} ${chest}`)) setTimeout(() => rareFind(r), 350);
    tally.chests.add(`${map.id} ${chest}`);
  }
  held.length = 0;
}
// Picks the i-th of a pile's items to show (see PICKUP)
function pickPile(i) {
  if (!notice?.pile || i < 0 || i >= notice.pile.length) return;
  Object.assign(notice, { pick: i, item: notice.pile[i] });
}
// The answer to the pickup, for the pile's i-th item (or the chest's find): true takes it, "equip"
// takes it and puts it on (taking a turn, as the bag's [E]quip does), false leaves it there.
// Taking a chest's find leaves the chest open, and no longer a landmark worth a "?"
function answer(take, i = notice.pick) {
  if (notice.pile) pickPile(i);
  const id = notice.item, skill = SKILLS[id], full = noRoom(id);
  if (full && take) say(`${full}.`);
  if (take && !full) {
    pickUp();
    if (skill) learn(id);
    else {
      say(tr("You take the {item}.", { item: itemNoun(id, INK.name) }));
      carry(id);
    }
    const axe = lakeHome?.axe;
    if (axe && notice.pile && id === axe.id && map === axe.on && notice.from[notice.pick][0] === axe.k) { lakeHome.axe = null; lived("lakeAxe"); }
    if (notice.pile) takeFromPile(...notice.from[notice.pick]);
    else {
      map.loot.delete(notice.chest);
      map.landmarks.delete(notice.chest);
      const cells = map === MAPS.outside ? props.flatMap(p => p.cells) : map.room?.cells ?? [];
      for (const c of cells) if (key(c[0], c[1]) === notice.chest) c[2] = c[2] === SCENE.fairyRing.chest ? SCENE.fairyRing.chestOpen : SCENE.chestOpen;
      if (map.cave?.chests.some(c => key(...c) === notice.chest)) map.cave.setTile(...notice.chest.split(",").map(Number), SCENE.chestOpen);
    }
    const at = bag.findIndex(b => b?.id === id);
    if (take === "equip" && wearable(id) && at >= 0 && equipped[ITEMS[id].slot] !== at) { notice = null; wear(at); }
  }
  notice = null;
  canvas.style.cursor = "";
}

// Whether the find in the notice can be swapped in: something not known already, with the bag full
const canSwap = () => notice && !(SKILLS[notice.item] && carried(notice.item)) && placeFor(notice.item) === -1;
// The bag's cell to start on when something's to be left for a find: the first thing that can be
// (never the class's own spell, which would leave Swap dimmed with nothing said)
function leaveFocus() {
  const i = bag.findIndex(b => b && !classBound(b.id));
  return BAG0 + Math.max(0, i);
}
const cantLeave = id => say(tr("You can't leave {spell}, your class's own.", { spell: noun(SKILLS[id].name, INK.name) }));
// Brings up the bag to pick what to leave behind for the find in the notice (a pile's i-th)
function startSwap(i = notice.pick) {
  if (notice.pile) pickPile(i);
  openPanel(leaveFocus());
  say(tr("Your bag is full. Pick what to leave for {thing:the}.", { thing: thingNoun(notice.item, INK.name, true) }));
  const [chest, pick] = notice.pile ? notice.from[notice.pick] : [notice.chest, null];   // (the find's own cell, and its place there)
  panel.swap = { item: notice.item, chest, pick };
  notice = null;
}
// B, I or E open the bag, with cell `focus` picked (see BAG_PANEL)
function openPanel(focus = BAG0) {
  panel = { focus, moving: null, drag: null, hover: null, help: false, swap: null, hits: null };
  held.length = 0;
}
function closePanel() {
  const declined = panel?.smith;
  panel = null;
  canvas.style.cursor = "";
  if (declined) { smithSays(SMITH.no); say(SMITH.eyes); }   // (the blacksmith's, put down, see SMITH)
}
// What's done in the bag (see BAG_PANEL), noted for the journey's record: "move" from cell a to
// cell b, "drop", "use" or "equip" what's in cell a, or "leave" what's in it for what's being
// swapped in
function bagOp(op, a, b) {
  if (op === "move") return moveCell(a, b);
  if (op === "leave") return leaveFor(a - BAG0);
  if (op === "best") return wearBest();
  if (op === "sort") return sortBag();
  const at = cellSlot(a), id = cellItem(a);
  if (!id) return UNCHANGED;
  if (op === "drop") return dropSlot(at);
  if (op === "equip") return ITEMS[id]?.slot ? (wornAt(at) ? takeOff(wornAt(at)) : wear(at)) : UNCHANGED;
  if (op !== "use") return UNCHANGED;
  if (ITEMS[id]?.slot) return wornAt(at) ? takeOff(wornAt(at)) : wear(at);
  if (ITEMS[id]?.consumable) return drink(at);
  if (!SKILLS[id]) return UNCHANGED;
  closePanel();                    // a spell: cast as from its key
  cast(id);
}
// Moving what's in cell a to cell b (see BAG_PANEL)
function moveCell(a, b) {
  const id = cellItem(a), ka = a >= KEY0 && a < BAG0, kb = b >= KEY0 && b < BAG0;
  if (!id || a === b) return UNCHANGED;
  if (ka && !kb) { shortcuts[a - KEY0] = null; clasp(); return; }   // a key's cleared
  if (kb) {
    if (!keyable(id)) { say("Only spells and potions go on shortcut keys."); return UNCHANGED; }
    const k = b - KEY0, was = shortcuts.indexOf(id);
    if (was >= 0) shortcuts[was] = shortcuts[k];
    shortcuts[k] = id;
    clasp();
    return;
  }
  if (b < KEY0) {                  // onto GEARS: put on, as its kind
    if (ITEMS[id]?.slot !== GEAR[b]) { say(tl("That isn't worn as {slot:a}.", { slot: noun(SLOT_WORDS[GEAR[b]]) })); return UNCHANGED; }
    if (!wearable(id)) { say(tl("You can't wear {slot:a}.", { slot: noun(SLOT_WORDS[GEAR[b]]) })); return UNCHANGED; }
    return a < KEY0 ? UNCHANGED : wear(cellSlot(a));
  }
  if (a < KEY0) {                  // off GEARS: taken off, or what's dropped on put on instead
    const there = bag[b - BAG0]?.id;
    return there && ITEMS[there]?.slot === GEAR[a] && wearable(there) ? wear(b - BAG0) : takeOff(GEAR[a]);
  }
  swapSlots(a - BAG0, b - BAG0);
  clasp();
}
// Equipping, unequipping or dropping takes a turn, like a step
function spendTurn() {
  stats.hp = Math.min(stats.hp, maxHp());   // (a heart pin taken off takes its hp with it)
  turnTaken();
  skeletonTurn(clock());
}
// Puts on what's in bag slot i, in place of what was worn of its kind
function wear(i) {
  const id = bag[i].id;
  equipped[ITEMS[id].slot] = i;
  clasp();
  say(tr("You equip the {item}.", { item: noun(ITEMS[id].name, INK.name) }));
  spendTurn();
}
// Takes off what's worn as `slot` (it stays in the bag)
function takeOff(slot) {
  const id = wearing(slot);
  equipped[slot] = null;
  clasp();
  say(tr("You take off the {item}.", { item: noun(ITEMS[id].name, INK.name) }));
  spendTurn();
}
// The bag's [G] Auto Equip (2026-10-13; the old [G] Wear best gear, 2026-10-06, for v0.12's
// gear): for each kind, what's carried that's worth the most to the character's class, its
// stats times the class's `weights` (or `byClass`'s), plus what its other effects are worth:
// `dodge` and `reduce` per percent, `light` per cell, `regen` over its turns, `hp` per max hp,
// `drain` times the atk weight, `shock` per percent, `reach` times the mag weight, and the rest
// as they are (`hunted` against it). Cursed gear counts like any (the user's yes, 2026-10-13);
// a tie keeps what's worn, and a kind with nothing better is left alone. (numbers Claude's)
const BEST_GEAR = {
  weights: { atk: 1, def: 1, mag: 0.5, spd: 1 },
  byClass: { mage: { atk: 0.5, def: 1, mag: 1.5, spd: 1 }, siren: { atk: 0.5, def: 1, mag: 1.5, spd: 1 },
    prodigy: { atk: 1, def: 1, mag: 1, spd: 1 }, cleric: { atk: 1, def: 1, mag: 1, spd: 1 }, brawler: { atk: 1.5, def: 1, mag: 0.5, spd: 1 } },
  dodge: 0.2, reduce: 0.2, light: 0.5, regen: 10, hp: 0.1, drain: 2, shock: 0.1, reach: 1, cool: 1.5,
  chill: 1, sense: 0.5, radar: 0.5, embers: 0.5, hunted: -3,
};
function gearWorth(id) {
  const B = BEST_GEAR, w = B.byClass[charClass] ?? B.weights, it = ITEMS[id];
  return STAT_ORDER.reduce((sum, k) => sum + bonus(id, k) * (w[k] ?? 0), 0) + bonus(id, "hp") * B.hp +
    (it.dodge ?? 0) * B.dodge + (it.reduce ?? 0) * B.reduce + (it.light ?? 0) * B.light + (it.regen ? B.regen / it.regen : 0) +
    (it.shock ?? 0) * B.shock + (it.reach ?? 0) * B.reach * w.mag + (it.cool ?? 0) * B.cool + (it.drain ? B.drain * w.atk : 0) +
    ["chill", "sense", "radar", "embers", "hunted"].reduce((sum, k) => sum + (it[k] ? B[k] : 0), 0);
}
// What wearing the best would change: [kind, bag slot of the better thing] for each kind
const bestGear = () => GEAR.flatMap(slot => {
  let best = -1, worth = wearing(slot) ? gearWorth(wearing(slot)) : -Infinity;
  bag.forEach((b, i) => {
    if (!b || !wearable(b.id) || ITEMS[b.id].slot !== slot || gearWorth(b.id) <= worth) return;
    best = i; worth = gearWorth(b.id);
  });
  return best >= 0 ? [[slot, best]] : [];
});
// Puts on the best of everything at once, for one turn
function wearBest() {
  const changes = bestGear();
  if (!changes.length) { say("You're already wearing your best."); return UNCHANGED; }
  for (const [slot, i] of changes) equipped[slot] = i;
  used("autoEquip");
  clasp();
  const names = changes.map(([, i]) => noun(ITEMS[bag[i].id].name, INK.name)), [a, b, c] = names;
  say(c ? tr("You put on the {a}, the {b} and the {c}.", { a, b, c }) : b ? tr("You put on the {a} and the {b}.", { a, b }) : tr("You put on the {a}.", { a }));
  spendTurn();
}
// The bag's [T] Auto Sort (2026-10-13; the order's the user's): the class's own spell, the other
// spells, weapons, armour, trinkets, potions, then tools (what fells or digs), the best of each
// first (spells by tier, gear worn first then by gearWorth(), potions as items.js lists them, the
// unknown last), stacks of one potion put together, and the empty slots at the end. It takes no
// turn, as moving things doesn't; what's worn and what's on keys go with them.
const SORT_GROUPS = ["class", "spell", "weapon", "armour", "trinket", "potion", "tool"];
const sortGroup = id => (SKILLS[id] ? (classBound(id) ? "class" : "spell") : ITEMS[id].fells || ITEMS[id].digs ? "tool"
  : ITEMS[id].consumable ? "potion" : ITEMS[id].slot);
function sortBag() {
  used("autoSort");
  const ids = Object.keys(ITEMS), worn = new Set(GEAR.map(slot => equipped[slot]).filter(i => i !== null).map(i => bag[i]));
  const merged = [];
  for (const b of bag.filter(Boolean)) {
    const room = stackOf(b.id) > 1 && merged.find(m => m.id === b.id && m.n < stackOf(b.id));
    if (!room) { merged.push(b); continue; }
    const moved = Math.min(b.n, stackOf(b.id) - room.n);
    room.n += moved;
    if (b.n > moved) merged.push({ id: b.id, n: b.n - moved });
  }
  // (an Unknown Potion not yet known sorts as one, so the order gives nothing away)
  const potionRank = id => (ITEMS[id].truly && !knows(id) ? ids.length : ids.indexOf(id));
  const rank = b => {
    const g = sortGroup(b.id);
    return [SORT_GROUPS.indexOf(g), g === "class" || g === "spell" ? -SKILLS[b.id].tier : g === "potion" ? potionRank(b.id) : worn.has(b) ? -1e9 : -gearWorth(b.id),
      g === "potion" ? -b.n : 0];
  };
  const order = merged.map(b => [rank(b), b]).sort(([a], [c]) => a[0] - c[0] || a[1] - c[1] || a[2] - c[2]).map(([, b]) => b);
  const after = [...order, ...Array(BAG_SIZE - order.length).fill(null)];
  if (after.every((b, i) => b === bag[i])) { say("Your bag is already tidy."); return UNCHANGED; }
  const wornBy = Object.fromEntries(GEAR.map(slot => [slot, equipped[slot] === null ? null : bag[equipped[slot]]]));
  after.forEach((b, i) => { bag[i] = b; });
  for (const slot of GEAR) equipped[slot] = wornBy[slot] ? bag.indexOf(wornBy[slot]) : null;
  keepOneTool();
  clasp();
}
// Drops one of what's in bag slot i where the character stands
function dropSlot(i) {
  const id = bag[i].id;
  if (classBound(id)) { say(tr("You can't drop {spell}, your class's own.", { spell: noun(SKILLS[id].name, INK.name) })); return UNCHANGED; }
  if (!putDown(id)) { say("There's no room to drop it here."); return UNCHANGED; }
  thud();
  say(tr("You drop {thing:the}.", { thing: thingNoun(id, INK.name, true) }));
  takeOut(i);
  spendTurn();
}
// Leaves what's in bag slot i for what's being swapped in: where the find was, or, for a spell
// learnt on levelling up, at the character's feet
function leaveFor(i) {
  const old = bag[i]?.id, { item, chest, level, pick } = panel.swap;
  if (!old) return UNCHANGED;
  if (classBound(old)) { cantLeave(old); return UNCHANGED; }
  // (all of a stack's left: one in the find's place, the rest at the character's feet; all at their feet for a spell learnt)
  const feet = level ? bag[i].n : bag[i].n - 1;
  if (feet && !putDown(old)) { say("There's no room to leave it here."); return UNCHANGED; }
  for (let n = 1; n < feet; n++) putDown(old);
  const slot = wornAt(i);
  if (slot) equipped[slot] = null;
  bag[i] = null;
  tidyShortcuts();
  if (!level && pick !== null && map.drops?.has(chest)) {   // (in the find's place in its pile)
    map.drops.get(chest)[pick] = old;
    map.loot.set(chest, map.drops.get(chest).at(-1));
  } else if (!level) map.loot.set(chest, old);
  const oldName = thingNoun(old, INK.name, true);
  closePanel();
  clasp();
  if (SKILLS[item]) learn(item, i);
  else {
    carry(item);
    say(tr("You leave {old:the} and take the {item}.", { old: oldName, item: itemNoun(item, INK.name) }));
  }
  keepOneTool();
  if (level) {
    progress.spells--;
    nextLevelStep();
  }
}
// Drinks one of the potions in bag slot i (see POTION), unless it would do nothing (or, for a
// Rage Potion, take the last of the character's hp), which it says (an Unknown Potion not yet
// known is drunk regardless); an Unknown Potion does what it truly is, and says so. It takes a turn.
function drink(i) {
  if (i < 0 || !bag[i]) return;
  const id = bag[i].id, item = ITEMS[id], p = item.truly ?? item, now = clock();
  if (DAILY.fasting) { say("You can't drink potions on a Fasting day."); return; }   // (a Fasting Daily Challenge's, see DAILY)
  if (!item.truly || knows(id)) {
    if (p.heal && stats.hp >= maxHp()) { say("You aren't wounded."); return; }
    if (p.cooldown && !cooling.size) { say("None of your spells are cooling down."); return; }
    if (p.hp && stats.hp <= p.hp) { say("You're too weak to drink it."); return; }
  }
  takeOut(i);
  used("potions");
  const was = named(id);
  identified.add(id);
  say(item.truly && was !== p.name ? tr("You drink the {item}. It's {truly:a}!", { item: noun(was, INK.name), truly: noun(p.name, INK.name) })
    : tr("You drink the {item}.", { item: noun(item.truly ? was : p.name, INK.name) }));
  if (p.heal) {
    const n = Math.min(p.heal, maxHp() - stats.hp);
    stats.hp += n;
    if (n > 0) pops.push({ runs: [[`+${n}`, INK.up]], x: player.x, y: player.y, t0: now, on: map, heal: true });
  }
  if (p.cooldown) for (const [k, left] of cooling) {
    if (left > p.cooldown) { cooling.set(k, left - p.cooldown); continue; }
    cooling.delete(k);
    say(tr("{spell} is ready again.", { spell: noun(SKILLS[k].name, INK.name) }));
  }
  if (p.hp) {
    const n = Math.min(p.hp, Math.max(0, Math.ceil(stats.hp) - 1));
    stats.hp -= n;
    if (n > 0) pops.push({ runs: [[`-${n}`, INK.down]], x: player.x, y: player.y, t0: now, on: map });
  }
  loot();
  turnTaken();                     // (its boosts last from the next turn on, as a spell's do)
  for (const b of boostsOf(p)) boosts.push({ name: p.name, ...b });
  skeletonTurn(now);
}

// Puts an item on the ground where the character stands (on the pile there, if there's one), or
// on a cell beside them if a chest's there (never the doorway, nor under a skeleton); false if
// there's nowhere. It can be picked up again with F, like a skeleton's drop.
function putDown(id) {
  const free = ([x, y]) => (!map.loot.has(key(x, y)) || map.drops.has(key(x, y))) && !map.doors.has(key(x, y)) && !foeAt(x, y);
  const spot = [[player.x, player.y], ...NEIGHBOURS.map(([dx, dy]) => [player.x + dx, player.y + dy])
    .filter(([x, y]) => map.open(x, y))].find(free);
  if (!spot) return false;
  dropAt(...spot, id);
  return true;
}

// The tool of each kind in its slot (an axe, which fells; a pickaxe, which digs) is always the
// best one carried: the one that takes the fewest hits (TOOL_HITS), then the highest tier. So a
// better one found takes its place at once, and once it's dropped the next best does, or the
// slot's empty.
function keepOneTool() {
  for (const does of Object.keys(tools)) {
    const worth = id => [TOOL_HITS[ITEMS[id].affix], -ITEMS[id].tier];
    tools[does] = bag.map(b => b?.id).filter(id => ITEMS[id]?.[does])
      .sort((a, b) => worth(a)[0] - worth(b)[0] || worth(a)[1] - worth(b)[1])[0] ?? null;
  }
}

// The next thing banked to spend on levelling up (see LEVEL_UP), or back to the game
function nextLevelStep() {
  const offers = progress.spells ? spellOffers() : [];
  if (progress.spells && !offers.length) progress.spells = 0;   // nothing left to learn or better
  leveling = progress.points ? { step: "stat", focus: 0, help: false }
    : progress.spells ? { step: "spell", focus: 0, offers, help: false } : null;
  held.length = 0;
  canvas.style.cursor = "";
}
// Up to three spells to pick from, each a different one (see LEVEL_UP)
function spellOffers() {
  // (the level's tier, and whatever's known of any tier, to better it)
  const tier = LEVEL_UP.tiers.find(([lv]) => progress.level >= lv)?.[1] ?? 1;
  const known = variant => bag.some(b => SKILLS[b?.id]?.variant === variant);
  const offers = [...new Set(Object.values(SKILLS).filter(k => k.tier === tier || (k.tier && known(k.variant))).map(k => k.variant))].flatMap(variant => {
    const at = bag.findIndex(b => SKILLS[b?.id]?.variant === variant);
    if (at >= 0) {
      const better = !DAILY.inferior && LEVEL_UP.better[SKILLS[bag[at].id].affix];   // (none on an Inferior day: see worse())
      return better && SKILLS[`${variant}-${better}`] ? [{ id: `${variant}-${better}`, at }] : [];
    }
    let id = rollSkill(tier, true);
    while (SKILLS[id].variant !== variant) id = rollSkill(tier, true);
    return [{ id: worse(id) }];
  });
  for (let i = offers.length - 1; i > 0; i--) {   // shuffled
    const j = Math.floor(random() * (i + 1));
    [offers[i], offers[j]] = [offers[j], offers[i]];
  }
  return offers.slice(0, 3);
}
// How many picks the step has: the four stats, or the spells and passing (the last)
const levelCards = () => (leveling.step === "stat" ? STAT_ORDER.length : leveling.offers.length + 1);
// (the spell card's Learn: L, or F when L moves (HJKL); a move key picks first in the level-up's keys)
const learnKey = () => ["L", "F"].find(k => !moveKeys().includes(`Key${k}`)) ?? "L";
// Picking card i of the overlay
function pickLevel(i) {
  if (i < 0 || i >= levelCards()) return;
  if (leveling.step === "stat") {
    const k = LEVEL_UP.order[i];
    stats[k] += LEVEL_UP.gains[k];
    if (leveling.blessing) {         // the priest's (see PRIEST), not a level's
      say(tr("You feel blessed. Your {stat:low} goes up to {n}.", { stat: noun(LEVEL_UP.names[k], INK.name), n: [stat(k), INK.up] }));
      say(speech("Priest", PRIEST.amen));
      if (leveling.blessing !== true) priestAct(clock(), leveling.blessing, true);   // and he's on his way
      leveling = null;
      return;
    }
    progress.points--;
    say(tr("Your {stat:low} goes up to {n}.", { stat: noun(LEVEL_UP.names[k]), n: [stat(k), INK.up] }));
    return nextLevelStep();
  }
  const offer = leveling.offers[i];
  if (!offer) say("You pass on a new spell.");
  else if (offer.at !== undefined || bag.includes(null)) learn(offer.id);
  else {                           // no room: what's left for it? (see BAG_PANEL)
    openPanel(leaveFocus());
    panel.swap = { item: offer.id, level: true };
    say(tr("Your bag is full. Pick what to leave for {thing}.", { thing: noun(SKILLS[offer.id].name, INK.name) }));
    return;
  }
  progress.spells--;
  nextLevelStep();
}
// Puts a spell in bag slot i: in place of the one of its kind known, which hands on its key and
// its cooldown, or else (in an empty slot) on the first free key, if there is one
function learn(id, i = placeFor(worse(id))) {
  id = worse(id);
  const old = SKILLS[bag[i]?.id] ? bag[i].id : null;
  bag[i] = { id, n: 1 };
  if (old) {
    if (shortcuts.includes(old)) shortcuts[shortcuts.indexOf(old)] = id;
    if (cooling.has(old)) cooling.set(id, cooling.get(old));
    cooling.delete(old);
  } else if (shortcuts.includes(null)) shortcuts[shortcuts.indexOf(null)] = id;
  say(old ? tr("Your {old} becomes {made}.", { old: noun(SKILLS[old].name, INK.name), made: noun(SKILLS[id].name, INK.name) })
    : tr("You learn {spell}.", { spell: noun(SKILLS[id].name, INK.name) }));
}
// The panel, centred like the notice (see LEVEL_UP), as the v0.13 sheet has it ("level-up-stats"
// 871:60020 and "lvup-skill" 855:64871, see SHEET): along the top "LEVEL UP" and "?", then "Lv. n"
// in gold and what to pick in green; for a stat, a row each (its icon, the gain in green and its
// name, and in a cell of its own at the right its value now), the one picked framed green, and
// [Y] Select; for a spell, a box for each offered (the one picked framed green), the card of the
// one picked framed green, and [P] Skip (red) over [L] Learn (green).
function drawLevelUp(measuring = false) {
  if (!leveling || panel) return;
  if (!measuring) fitUi(() => drawLevelUp(true));
  const L = LEVEL_UP, I = SHEET.ink, spell = leveling.step === "spell";
  const title = leveling.blessing ? english("BLESSING") : english("LEVEL UP"), ask = spell ? tl("Pick skill") : tl("Pick stats");
  // (the level, and what to pick)
  const lv = leveling.blessing ? [] : [[tl("Lv. {n}", { n: progress.level }), I.title]], pick = [[ask, INK.up]];
  // (the level and what to pick 8 px apart, as the mock has them, or as little as 4 where they'd widen the panel)
  const capGap = w => lv.length ? Math.max(uiMetrics().px(4), Math.min(uiMetrics().px(8), w - sheetW(lv, "big") - sheetW(pick, "fs"))) : 0;
  const caption = { minW: () => sheetW(lv, "big") + (lv.length ? uiMetrics().px(4) : 0) + sheetW(pick, "fs"), h: () => sheetLineH(lv.length ? "big" : "fs"),
    draw: (x, y, w) => {
      const h = sheetLineH(lv.length ? "big" : "fs");
      drawSans(ctx, lv, x, y, sheetFont("big"));
      drawSans(ctx, pick, x + (lv.length ? sheetW(lv, "big") + capGap(w) : 0), y + Math.round((h - sheetLineH("fs")) / 2), sheetFont("fs"));
    } };
  const parts = [sheetParts.box([caption])];
  if (!spell) {                    // a row for each stat: its icon, +gain and name, and its value in a cell at the right
    const rowH = () => uiMetrics().px(2 * L.pad + CH), valueW = () => uiMetrics().px(2 * L.pad) + sheetW([["99"]]);
    parts.push({ minW: () => Math.max(...L.order.map(k => uiMetrics().px(2 * L.pad + CW + L.iconGap + 2) + sheetW([[`+${L.gains[k]} ${tl(L.names[k])}`]]))) + valueW(),
      h: () => L.order.length * rowH() + (L.order.length - 1) * uiMetrics().px(1),
      draw: (x, y, w, hits) => {
        const { u, px } = uiMetrics(), b = px(1), rh = rowH(), vw = valueW();
        L.order.forEach((k, i) => {
          const ry = y + i * (rh + b), ty = ry + Math.round((rh - sheetLineH()) / 2);
          ctx.fillStyle = I.line;
          if (i) ctx.fillRect(x, ry - b, w, b);
          ctx.fillRect(x + w - vw - b, ry, b, rh);
          ctx.drawImage(tiles, HUD.statIcons[k] * CW, 0, CW, CH, x + px(L.pad), ry + px(L.pad), CW * u, CH * u);
          const gain = [[`+${L.gains[k]} `, INK.up]], gx = x + px(L.pad + CW + L.iconGap + 2);
          drawSans(ctx, gain, gx, ty, sheetFont());
          drawSans(ctx, [[tl(L.names[k]), I.text]], gx + sheetW(gain), ty, sheetFont());
          const value = [[String(stat(k)), I.label]];
          drawSans(ctx, value, x + w - vw + Math.round((vw - sheetW(value)) / 2), ty, sheetFont());
          hits.rows[i] = [x, ry, w, rh];
          if (i === leveling.focus) sheetFrame(x, ry, w, rh, I.picked);
        });
      } });
    parts.push(sheetParts.cta([sheetButton("Y", "Select", "go", { key: "take" })]));
  } else {                         // a box for each spell offered, the card of the one picked, and Skip and Learn
    const offers = leveling.offers, o = offers[leveling.focus], upgrade = x => x?.at !== undefined;
    parts.push(sheetParts.box([sheet.boxes(offers.map((offer, i) => ({ id: offer.id, picked: i === leveling.focus })))], { pad: 4 }));
    if (o) {
      const box = () => itemBox(o.id, { boxW: Math.floor((drawLevelUp.cardW ?? 0) / uiMetrics().u) || CARD.w, desc: true }), barH = () => upgrade(o) ? uiMetrics().px(PANEL.barH) : 0;
      parts.push({ minW: () => box().w, h: w => { drawLevelUp.cardW = w; return box().h + barH(); },
        draw: (x, y, w) => {
          drawLevelUp.cardW = w;
          const bx = box(), h = bx.h + barH();
          bx.draw(x, y, w, bx.h);
          if (upgrade(o)) {
            ctx.fillStyle = PANEL_INK.equipped;
            ctx.fillRect(x, y + bx.h, w, barH());
            drawSans(ctx, [[tl("Upgrade"), PANEL_INK.equippedText]], x + uiMetrics().px(PANEL.barPad), y + bx.h + Math.round((barH() - sheetLineH("fs")) / 2), sheetFont("fs"));
          }
          sheetFrame(x, y, w, h, I.picked);
        } });
    }
    // (Skip's question, as the settings' Return to Title asks it (option A of the ones shown the user,
    // 2026-10-25): in red over [N] No / [Y] Yes, in the buttons' place)
    if (leveling.ignoring) parts.push(sheetParts.box([sheet.text(`${tl(L.ignore.title)} ${tl(L.ignore.text)}`, INK.down)], { pad: 4 }),
      sheetParts.cta([sheetButton("N", "No", "plain", { key: "no" }), sheetButton("Y", "Yes", "stop", { key: "yes" })], true));
    else parts.push(sheetParts.cta([sheetButton("P", "Skip", "stop", { key: "drop" }), sheetButton(learnKey(), english("Learn"), "go", { key: "take" })], !phone));   // (side by side on a computer, the user's, 2026-10-29)
  }
  const spec = { title, w: cardPanelW(spell ? L.spellW : L.w), closes: false, help: leveling.help, parts,
    helpText: [...L.help[leveling.blessing ? "blessing" : spell ? "spell" : "stat"], ...(tapping ? [] : [L.keys[spell ? (learnKey() === "F" ? "spellF" : "spell") : "stat"]])] };
  if (measuring) return drawSheet(spec, true);
  const hits = drawSheet(spec);
  leveling.hits = { help: hits.help, rows: hits.rows, slots: hits.slots ?? [], drop: hits.drop ?? null, take: hits.take ?? null };
  leveling.answers = leveling.ignoring ? { yes: hits.yes, no: hits.no } : null;
}
// Answering it: yes passes on the spells, no goes back to them
function answerIgnore(yes) {
  leveling.ignoring = false;
  leveling.answers = null;
  if (yes) act("L", levelCards() - 1);
}
// What's at a canvas point on the panel: "help", "drop", "take", { i } for a stat's row or a
// spell's slot, or null
function levelTargetAt(px, py) {
  const h = leveling?.hits;
  if (!h) return null;
  const on = r => r && onRect(r, px, py);
  if (leveling.ignoring) return on(leveling.answers?.yes) ? "yes" : on(leveling.answers?.no) ? "no" : null;
  if (on(h.help)) return "help";
  if (on(h.drop)) return "drop";
  if (on(h.take)) return "take";
  const i = [...h.rows, ...h.slots].findIndex(on);
  return i >= 0 ? { i } : null;
}
// A press on it: the help, dropping or taking the spell, or picking a stat or a spell (a spell
// not yet picked is picked first, then taken by a second press)
function pressLevel(px, py) {
  const t = levelTargetAt(px, py), help = leveling.help;
  if (t) click();
  if (leveling.ignoring) { if (t) answerIgnore(t === "yes"); return; }
  leveling.help = t === "help" && !help;
  if (t === "help" || help) return;   // (a press anywhere hides the help)
  if (t === "drop") leveling.ignoring = true;
  else if (t === "take") act("L", leveling.focus);
  else if (t && (leveling.step === "stat" || t.i === leveling.focus)) act("L", t.i);
  else if (t) leveling.focus = t.i;
}

// The class (see CLASSES) is settled for the board after the journey's first `turns` turns. There's
// no box beside the character for changing it or the mode any more, nor P to (the [P] Change
// Class / [G] View Leaderboard and NEW GAME boxes taken out, the user's ask, 2026-10-19): the
// title has them, and a journey without it (mektxt.com's, or one with the address's options for
// trying things out) is in the mode the page is laid out for, settled as its first turn's taken.
// G still brings up the leaderboard.
const CLASS_PICK = { turns: 10 };
// The journey's modes (see gameMode): only the one the page is laid out for (the log's words Claude's)
const MODES = dailyKey
  ? { daily: { name: "DAILY CHALLENGE", icon: 1, picked: () => tr("Daily Challenge: {name}. {n} days on the same map as everyone today, and the best scores go on today's leaderboard.", { name: daily.name, n: DAY.days }, INK.title) } }
  : { competitive: { name: "COMPETITIVE MODE", icon: 0, picked: () => tr("Competitive mode: {n} days, and the best scores go on the leaderboard.", { n: DAY.days }, INK.title) } };
// Picks the journey's mode (see MODES), before its first turn
function pickMode(id) {
  if (gameMode || !MODES[id]) return UNCHANGED;   // (watching, the record's mode is settled too, or on a class day the watched character kept the seed's class till their first turn)
  tock();
  settleMode(id);
}
// ...settled, picked or walked off into: the log says what it is, and a Daily Challenge's affixes,
// one a line, and on a class day, the class it's played as (the character made that class, for
// good: see CLASS_PICK)
function settleMode(id) {
  gameMode = id;
  say(MODES[id].picked());
  if (id === "daily") {
    for (const a of daily.affixes.map(k => AFFIXES[k])) say([[tl("{who}: ", { who: nameOf(a.name) }), INK.name], [tl(a.says)]]);
    if (daily.cls) {
      if (charClass !== daily.cls) becomeClass(daily.cls);
      settleClass();
      say(tr("Today everyone is {cls:a}.", { cls: noun(hero().name.toLowerCase(), INK.name) }));
    }
  }
  tell(NOTES.ajar);   // (no "Type /help." after it: the chat's first line says so, the user's ask, 2026-10-28)
}
// The title screen (see title.js) comes first, before the world: [1] DAILY CHALLENGE or [2]
// COMPETITIVE MODE there brings up the classes' panel alone on dark1, and its [Y] Choose starts the
// journey in that mode as that class (the world fading in), its [N] Cancel going back; on a class
// day the Daily Challenge starts at once, as the day's class. The page is laid out for one or the
// other (a Daily Challenge's on its day's map, see `dailyKey`), so picking the other first brings the
// page back for it, straight to the classes' panel (as does a daily page left open past its day).
// [3] the leaderboard, alone on dark1, back to the title as it's closed; [4] the game's about page
// (about.dos-age.com), in a new tab. Not when a journey's watched, nor with the address's options
// for trying things out. Starting again
// (see startOver()) comes back to the title, the mode just played picked and the page laid out for it.
// { step: "title", "class" (`mode` picked) or "board" } till the journey's begun
const tryingOptions = [...options.keys()].some(k => k !== "daily" && k !== "web");
let opening = !watching && !tryingOptions && !onSite ? { step: wantGo && TITLE_MODES().includes(wantMode) ? "class" : "title", mode: wantMode } : null;
function TITLE_MODES() { return ["daily", "competitive"]; }
function pickTitle(i) {
  focusTitle(i, clock());
  tock();
  const mode = TITLE_MODES()[i];
  if (mode && (mode === "daily" ? !dailyKey || (dailyKey !== dayKey() && !query.has("daily")) : !!dailyKey)) startOver(mode, true);
  else if (mode) openMode(mode);
  else if (i === 2) { opening.step = "board"; openLeaderboard(); }
  else if (i === 3) window.open(ABOUT_URL, "_blank", "noopener");
}
// The classes' panel for `mode`, or on a class day, the Daily Challenge begun as its class
function openMode(mode) {
  opening = { step: "class", mode };
  if (mode === "daily" && daily.cls) beginJourney(Object.keys(CLASSES).indexOf(daily.cls));
  else openClasses();
}
const ABOUT_URL = "/about.html";   // (DOS-AGE's about page, dos-age/: worker/index.js ABOUT_HOST)
// ...its keys: the arrows pick a card (title.js titleStep()), 1-4 or Enter, Space or F take one; Esc and the website's keys leave as ever
function titleKey(e) {
  const d = DIRS[e.pos], digit = e.code.match(/^(?:Digit|Numpad)([1-9])$/);
  if (titleLangOpen()) {           // (the language list, title.js TITLE.lang: arrows, Enter picks, Esc or L shuts it)
    e.preventDefault();
    if (d?.[1]) stepTitleLang(d[1]);
    else if (e.repeat) return;
    else if (["Enter", "NumpadEnter", "Space", "KeyF"].includes(e.code)) pickTitleLang();
    else if (["Escape", "Backspace", "KeyL"].includes(e.code)) toggleTitleLang();
    return;
  }
  if (e.code === "KeyL" && !e.repeat) { toggleTitleLang(); return; }
  if (d) { e.preventDefault(); focusTitle(titleStep(...d), clock()); return; }
  if (e.repeat) return;
  if (digit && digit[1] <= TITLE.cards.length) { e.preventDefault(); pickTitle(digit[1] - 1); }
  else if (["Enter", "NumpadEnter", "Space", "KeyF"].includes(e.code)) pickTitle(titleFocus());
  else leave(e);
}
// ...and back to it as what it brought up is closed
function openingBack() {
  if (opening?.step === "class" && !picking && !curtain?.out) opening = { step: "title" };
  else if (opening?.step === "board" && !ranking) opening.step = "title";
}
// The classes' panel's [Y] Choose: the class, and from the title, the mode first
function chooseClass() {
  const i = picking.focus;
  if (opening) beginJourney(i);
  else act("k", i);
}
// The class a mektxt.com journey's played as: one picked at random each journey, every load and
// every Restart (the user's, 2026-10-19; it was one a day a browser), and no picking another
function siteClass() {
  const ids = Object.keys(CLASSES);
  return ids[Math.floor(Math.random() * ids.length)];
}
// ...its journey begun as the page comes up: the Daily Challenge (the day's class on a class day,
// see settleMode()), as a class picked for it, for good (no [P] Change Class)
function beginOnSite() {
  act("m", "daily");
  if (!daily.cls) act("k", Object.keys(CLASSES).indexOf(siteClass()));
  act("K");
}
// ...the class settled, there, and said ("You're a Drunkard.", from the user's "Today you're..."; on a class
// day settleMode() says everyone is)
function settleSiteClass() {
  if (!onSite || turns) return UNCHANGED;
  settleClass();
  if (!daily?.cls) say(tr("You're {cls:a}.", { cls: noun(hero().name, INK.name) }));
}
// ...the journey begun from the title, in its mode, as class i (the world fading in)
function beginJourney(i) {
  act("m", opening.mode);
  opening = null;
  fadeT0 = clock();
  between = { t0: performance.now(), ms: BETWEEN.begin };   // (the trees, see BETWEEN)
  act("k", i);
}
let picking = null;                // { focus, help, hits (screen rects) } while the classes' panel is up
let classTaken = null;             // the class whose stats the character has now, if any
// Makes the character one of CLASSES: the old class's stats taken off and the new one's put on
// (whatever's been raised since stays), and their hp the same share of their new full hp
function becomeClass(id) {
  const had = classTaken ? bag.findIndex(b => b && classBound(b.id)) : -1;   // (the old class's own spell goes)
  if (had >= 0) { bag[had] = null; tidyShortcuts(); }
  const old = classTaken && CLASSES[classTaken], share = stats.hp / maxHp();
  charClass = classTaken = id;
  const c = hero();
  for (const k of STAT_ORDER) stats[k] += (c.stats?.[k] ?? 0) - (old?.stats?.[k] ?? 0);
  stats.hp = old ? Math.max(1, Math.round(share * maxHp())) : maxHp();   // (the first: at full hp)
  const spell = c.spell && worse(c.spell);   // (weak, on an Inferior day)
  if (spell && !carried(spell) && bag.includes(null)) {
    bag[bag.indexOf(null)] = { id: spell, n: 1 };
    if (shortcuts.includes(null)) shortcuts[shortcuts.indexOf(null)] = spell;
  }
  if (c.noWeapons) equipped.weapon = null;
}
// After `turns` turns it's settled
function settleClass() {
  classOpen = false;
  picking = null;
}
function openClasses() {
  picking = { focus: Object.keys(CLASSES).indexOf(charClass), help: false, hits: null };
  held.length = 0;
}
function closeClasses() {
  picking = null;
  canvas.style.cursor = "";
}
function pickClass(i) {
  const id = Object.keys(CLASSES)[i];
  if (!id) return;
  closeClasses();
  if (id === charClass) return;
  becomeClass(id);
  pickUp();
  if (!onSite || turns) say(tr("You are now {cls:a}.", { cls: noun(hero().name.toLowerCase(), INK.name) }));   // (a mektxt.com journey's says what it is, see settleSiteClass())
}
// (or on any of a list of rects, a sheet's help with its help up: the "?" and [?] Back)
const onRect = (r, px, py) => !!r && (Array.isArray(r[0]) ? r.some(q => onRect(q, px, py)) : px >= r[0] && px < r[0] + r[2] && py >= r[1] && py < r[1] + r[3]);

// The leaderboard ("leaderboard", 432:70073, v0.12): G, or its button over the character's head
// at the start or in the game-over box, brings up this version's best journeys (worker/scores.js).
// Each tab's board is fetched as it's first picked (all of this version's journeys, or one
// class's: each class has its own board); while it's loading or can't be reached, a line saying
// so sits in the middle. ← → (or a click on a tab, or on the arrows) pick another tab; ↑ ↓ frame a
// place (as hovering does); a place the board kept the record of, played on this game (see
// REPLAY), can be watched (while the character's own journey hasn't really begun, or is over, see
// canWatch()), its ▶ (right of the score) clicked or tapped (only the ▶, the user's, 2026-10-26), or framed
// and Enter, Space or F; one played on an older game has its ▶ dimmed and struck through. Esc, G, "X" or a click outside
// closes it; it takes no turn.
// Over the class tabs, two of a board's own (the user's, 2026-10-18): the Daily Challenge's (the
// day's, see `daily`: the day being played, or today's) and competitive mode's, under them the
// day's challenge over how long till the next one, or the version's board. Tab (or a click on one,
// or 1 and 2) picks the other; it starts on the mode played (the Daily Challenge's before one's begun).
// As a v0.13 sheet (option B, "pages of ten", of the ones shown the user, 2026-10-25): "[G] LEADERBOARD"
// with its "?" and "X"; the two boards' tabs over their lines; the class tabs, `tab` px boxes `tabGap`
// apart between "<" and ">", as many as fit; then `per` places a page, a `rowH` px dark2 row each,
// `rowGap` apart: the rank (the first three in `podium`'s inks), the class's look, the name (`yours`
// for this browser's), the minutes played and the class (`colGap` apart, in Dosage), then at the right
// the score and its ▶ (`play`, `playW` px across; dim while the journey's on, `old` struck through
// `strike` for one that can't be watched; right of the score, the user's, 2026-10-27); and [Q] [W] [E] for the pages, the one up framed.
const LEADERBOARD = { top: 30, per: 10, w: 130, tab: 14, tabGap: 2, rowH: 14, rowGap: 2, nameMax: 6, scoreMax: 99999, notes: 2,
  podium: ["#ffd23f", "#cbdbfc", "#d9a066"], yours: "#99e57e", arrows: "#78c283", empty: "#253a56",
  playW: 4, colGap: 6, clsMin: 3, minsMax: 999, noteInk: "#cbdbfc", countInk: "#9badb7", play: "#78c283", old: "#306082", strike: "#d95763",
  pageKeys: ["Q", "W", "E"], boards: [english("DAILY CHALLENGE"), english("COMPETITIVE")] };
// (the help's lines are Claude's, after the user's notes, 2026-10-11; exploration's journeys
// never come here, see gameMode)
const BOARD_HELP = [
  "{Tab} switches between the Daily Challenge's board, a new one each day, and competitive mode's.",
  "Each class has its own board: pick one along the top, or ALL.",
  "{Click} the green arrow by a score to watch that journey again.",
  "A crossed-out arrow was played on an older version of the game: it can't be watched.",
  "On each big patch the board is archived and a new one starts.",
  "Special league boards will come for challenges in new seasons (e.g. a Night-only Adventure).",
];
// { tab (0: ALL, then each class), boards (by tab: { state ("loading", "done" or "offline"),
// top }), focus (the place framed, or -1), help, hits (screen rects) } while it's up
// (`first`: the first tab shown)
// (`daily`: the Daily Challenge's board picked, see above; `boards` by it and the tab)
let ranking = null;
const boardTabs = () => ["all", ...Object.keys(CLASSES)];
// The day the daily board's for: the Daily Challenge being played (or watched), or today's; and its challenge
const boardDay = () => dailyKey ?? dayKey();
const boardChallenge = () => (dailyKey ? daily : (c => ({ ...c, name: dailyName(c) }))(challenge(dayKey(), Object.keys(CLASSES))));
// ...and the title's card of it, under [1] DAILY CHALLENGE! (title.js challengeCard())
setTitleChallenge(() => (c => ({ ...c, title: dailyName(c, " & "), clsName: c.cls && nameOf(CLASSES[c.cls].name) }))(boardChallenge()));
function openLeaderboard() {
  BUILD();                         // (for which places can be watched)
  ranking = { daily: gameMode !== "competitive", tab: 0, first: 0, page: 0, boards: {}, focus: -1, help: false, hits: null };
  held.length = 0;
  nameInput.blur();                // (opened from the game-over box: the name waits till it's closed)
  fetchBoard(0);
}
const boardKey = (i = ranking.tab) => `${ranking.daily ? `daily ${boardDay()}` : "competitive"} ${i}`;
// Fetches the board for tab i, the first time it's picked
function fetchBoard(i) {
  if (ranking.boards[boardKey(i)]) return;
  const board = ranking.boards[boardKey(i)] = { state: "loading", top: [] }, cls = boardTabs()[i];
  fetch(`/scores?v=${VERSION}${ranking.daily ? `&daily=${boardDay()}` : ""}${cls === "all" ? "" : `&cls=${cls}`}`).then(r => r.json())
    .then(d => { if (!Array.isArray(d.top)) throw new Error(); Object.assign(board, { state: "done", top: d.top }); })
    .catch(() => { board.state = "offline"; });
}
function pickBoard(i) {
  const n = boardTabs().length;
  ranking.tab = (i + n) % n;
  ranking.focus = -1;
  ranking.page = 0;
  fetchBoard(ranking.tab);
}
// ...and the Daily Challenge's board or competitive mode's (see `daily`)
function pickDaily(on) {
  if (ranking.daily === on) return;
  Object.assign(ranking, { daily: on, focus: -1, page: 0 });
  fetchBoard(ranking.tab);
}
function closeLeaderboard() {
  ranking = null;
  canvas.style.cursor = "";
  setTimeout(() => typeName());    // (back to the name, if it was being typed: after the key that closed it, so a G isn't typed in)
}
const boardTop = () => ranking.boards[boardKey()]?.top ?? [];
// Whether a place's journey can be watched here (see REPLAY): the board has its record, of this game
const watchable = t => t?.id != null && !!t.rv && t.rv === build;
const watchPlace = i => { if (watchable(boardTop()[i])) watchJourney(boardTop()[i].id); };
const rankRowAt = (px, py) => (ranking.hits?.rows ?? []).findIndex(r => onRect(r, px, py));
const rankPlayAt = (px, py) => (ranking.hits?.plays ?? []).findIndex(r => r && onRect(r, px, py));
// The leaderboard's keys: ← → pick a tab, ↑ ↓ frame a place (turning the page to it), Q W E turn
// to a page, Enter, Space or F watches the place framed, H or ? shows its help, and Esc or G closes it
function rankingKey(e) {
  const d = DIRS[e.pos], L = LEADERBOARD;
  if (d && e.pos.startsWith("Arrow")) {
    e.preventDefault();
    if (d[0]) pickBoard(ranking.tab + d[0]);
    else {
      ranking.focus = ranking.focus < 0 ? ranking.page * L.per : Math.max(0, Math.min(L.top - 1, ranking.focus + d[1]));
      ranking.page = Math.floor(ranking.focus / L.per);
    }
  }
  else if (e.repeat) return;
  else if (e.code === "Tab") { e.preventDefault(); pickDaily(!ranking.daily); }
  else if (["Digit1", "Numpad1", "Digit2", "Numpad2"].includes(e.code)) pickDaily(e.code.endsWith("1"));
  else if (L.pageKeys.some(k => e.code === `Key${k}`)) Object.assign(ranking, { page: L.pageKeys.findIndex(k => e.code === `Key${k}`), focus: -1 });
  else if (["Enter", "NumpadEnter", "Space", "KeyF"].includes(e.code)) watchPlace(ranking.focus);
  else if (e.code === "Escape" && ranking.help) ranking.help = false;
  else if (e.code === "KeyH" || e.key === "?") ranking.help = !ranking.help;
  else if (["Escape", "KeyG"].includes(e.code)) closeLeaderboard();
}
// ...and the pointer's: "X" or a click outside it closes it, a tab or the arrows pick a tab, "?"
// shows its help, and a place's ▶ watches it (if it can be)
function rankingPress(e, px, py) {
  const h = ranking.hits, help = ranking.help;
  ranking.help = onRect(h?.help, px, py) && !help;
  if (onRect(h?.help, px, py)) click();
  if (onRect(h?.help, px, py) || help) return;   // (a press anywhere hides the help)
  if (h && onRect(h.close, px, py)) click();
  if (!h || onRect(h.close, px, py) || !onRect(h.box, px, py)) return closeLeaderboard();
  if ([...h.boards, ...h.tabs, h.left, h.right, ...h.pages].some(r => r && onRect(r, px, py)) || rankPlayAt(px, py) >= 0 && canWatch()) click();
  const which = h.boards.findIndex(r => onRect(r, px, py));
  if (which >= 0) return pickDaily(which === 0);
  const tab = h.tabs.findIndex(r => r && onRect(r, px, py));
  if (tab >= 0) return pickBoard(tab);
  if (onRect(h.left, px, py)) return pickBoard(ranking.tab - 1);
  if (onRect(h.right, px, py)) return pickBoard(ranking.tab + 1);
  const page = h.pages.findIndex(r => onRect(r, px, py));
  if (page >= 0) return Object.assign(ranking, { page, focus: -1 });
  const place = rankPlayAt(px, py);
  if (place >= 0 && canWatch()) watchPlace(place);
}
// The screen px the website's header takes along the top of the game
function headerPx() {
  const h = document.getElementById("header");
  return h ? Math.round(h.getBoundingClientRect().bottom * pixelRatio) : 0;
}
function drawLeaderboard(measuring = false) {
  if (!ranking) return;
  if (!measuring) fitUi(() => drawLeaderboard(true));
  const L = LEADERBOARD, I = SHEET.ink, tabs = boardTabs(), picked = ranking.page ?? 0;
  const board = ranking.boards[boardKey()] ?? { state: "loading", top: [] };
  const nextIn = msToNext(), hours = Math.floor(nextIn / 36e5), mins = Math.floor(nextIn % 36e5 / 6e4);
  // (each board's lines under its tabs: the day's challenge over how long till the next, or the version's board)
  // (a step brighter each, and the countdown in Dosage, "New in 9h 58m": the user's, 2026-10-27)
  const notes = ranking.daily ? [[[upper(boardChallenge().name), L.noteInk]],
    [[boardDay() === dayKey() ? tl("New in {h}h {m}m", { h: hours, m: mins }) : boardDay(), L.countInk]]] : [[[tl("THE BEST OF {version}", { version: VERSION }), L.noteInk]]];
  const noteFont = n => n[0][1] === L.countInk ? DOSAGE : undefined;
  // the two boards' tabs, each half the width, the one up green
  const boardsPart = { minW: () => 2 * (Math.max(...L.boards.map(t => sheetW([[tl(t)]], "fs"))) + uiMetrics().px(8)) + uiMetrics().px(2), h: () => uiMetrics().px(11),
    draw: (x, y, w, hits) => {
      const { px } = uiMetrics(), g = px(2), each = Math.floor((w - g) / 2), h = px(11);
      hits.boards = L.boards.map((t, i) => {
        const on = (i === 0) === ranking.daily, bx = x + i * (each + g), bw = i ? w - each - g : each, words = [[tl(t), on ? I.text : I.chipOffText]];
        ctx.fillStyle = on ? I.chipOn : I.row; ctx.fillRect(bx, y, bw, h);
        sheetText(words, bx + Math.round((bw - sheetW(words, "fs")) / 2), y + Math.round((h - sheetLineH("fs")) / 2), "fs");
        return [bx, y, bw, h];
      });
    } };
  // (the lines as tall as two always, so both boards' panels are as tall)
  const notesPart = { minW: () => 0, h: () => sheetLinesH(L.notes, "fs"),
    draw: (x, y, w) => {
      const top = y + Math.round((sheetLinesH(L.notes, "fs") - sheetLinesH(notes.length, "fs")) / 2);
      notes.forEach((n, i) => sheetText(n, x + Math.round((w - sheetW(n, "fs", noteFont(n))) / 2), top + i * sheetPitch("fs"), "fs", noteFont(n)));
    } };
  // the class tabs between "<" and ">", as many as fit, scrolled to keep the one picked in view
  const left = [["<", L.arrows]], right = [[">", L.arrows]];
  // ("ALL"'s tab as wide as its word needs, in a language where that's more than a tab: "WSZYSCY")
  const allWord = picked => [[tl("ALL"), picked ? I.text : I.label]], allExtra = () => Math.max(0, sheetW(allWord(), "fs") + uiMetrics().px(4) - uiMetrics().px(L.tab));
  const tabsPart = { minW: () => sheetW(left) + sheetW(right) + uiMetrics().px(4 * L.tabGap + 3 * L.tab) + allExtra(), h: () => uiMetrics().px(L.tab),
    draw: (x, y, w, hits) => {
      const { u, px } = uiMetrics(), size = px(L.tab), pitch = px(L.tab + L.tabGap), aw = sheetW(left) + px(2 * L.tabGap), hit = px(NOTICE.hitPad);
      const extra = allExtra(), ty = y + Math.round((size - sheetLineH()) / 2), room = w - 2 * aw - extra;
      sheetText(left, x, ty); sheetText(right, x + w - sheetW(right), ty);
      hits.left = [x - hit, y, sheetW(left) + 2 * hit, size];
      hits.right = [x + w - sheetW(right) - hit, y, sheetW(right) + 2 * hit, size];
      const shown = Math.max(1, Math.min(tabs.length, Math.floor((room + px(L.tabGap)) / pitch)));
      if (ranking.tab < ranking.first) ranking.first = ranking.tab;
      if (ranking.tab >= ranking.first + shown) ranking.first = ranking.tab - shown + 1;
      ranking.first = Math.max(0, Math.min(tabs.length - shown, ranking.first));
      const allIn = ranking.first === 0 && tabs[0] === "all" ? extra : 0;   // (its extra width, when it's in view)
      const tx0 = x + aw + Math.round((room + extra - (shown * pitch - px(L.tabGap) + allIn)) / 2);
      hits.tabs = tabs.map((t, i) => {
        const k = i - ranking.first;
        if (k < 0 || k >= shown) return null;
        const tw = t === "all" ? size + extra : size, tx = tx0 + k * pitch + (t === "all" ? 0 : allIn);
        ctx.fillStyle = I.bg; ctx.fillRect(tx, y, tw, size);
        sheetFrame(tx, y, tw, size, i === ranking.tab ? I.picked : I.line, px(1), true);
        if (t === "all") {
          const all = allWord(i === ranking.tab);
          sheetText(all, tx + Math.round((tw - sheetW(all, "fs")) / 2), y + Math.round((size - sheetLineH("fs")) / 2), "fs");
        } else ctx.drawImage(tintedLook(t, CLASS_GROUPS[CLASSES[t].group].look), tx + Math.round((size - CW * u) / 2), y + Math.round((size - CH * u) / 2), CW * u, CH * u);
        return [tx, y, tw, size];
      });
    } };
  // the page's places
  const mine = (() => { try { return localStorage.getItem("mektxt.scoreName") ?? ""; } catch { return ""; } })();
  const rankW = () => sheetW([[String(L.top)]]);
  // (the playtime and class columns, in Dosage in the score's colour: the user's, 2026-10-27)
  const playMins = t => t.played == null ? "-" : tl("{n}m", { n: Math.max(1, Math.round(t.played / 60)) });
  const timeW = () => sheetW([[tl("{n}m", { n: L.minsMax })]], undefined, DOSAGE);
  const clsName = c => CLASSES[c] ? nameOf(CLASSES[c].name) : "-";
  // (the class column takes what the row has left and is cut to fit, with "." (so the list never
  // widens the panel past SHEET.wideW, the user's, 2026-10-29); at least `clsMin` letters' room)
  const clsMinW = () => sheetW([["M".repeat(L.clsMin)]], undefined, DOSAGE);
  const clsFit = (c, room) => {
    let name = clsName(c);
    if (sheetW([[name]], undefined, DOSAGE) <= room) return name;
    while (name.length > 1 && sheetW([[`${name}.`]], undefined, DOSAGE) > room) name = name.slice(0, -1).trimEnd();
    return `${name}.`;
  };
  const listPart = { minW: () => uiMetrics().px(4 + 4 + CW + 4 + 4 + L.colGap + L.colGap + 4 + 4 + L.playW + 4) + rankW() + sheetW([["M".repeat(L.nameMax)]]) + timeW() + clsMinW() + sheetW([[String(L.scoreMax)]]),
    h: () => L.per * uiMetrics().px(L.rowH + L.rowGap) - uiMetrics().px(L.rowGap),
    draw: (x, y, w, hits) => {
      const { u, px } = uiMetrics(), rh = px(L.rowH);
      hits.rows = []; hits.plays = [];
      for (let r = 0; r < L.per; r++) {
        const i = picked * L.per + r, t = board.top[i], ry = y + r * px(L.rowH + L.rowGap), ty = ry + Math.round((rh - sheetLineH()) / 2);
        ctx.fillStyle = I.row; ctx.fillRect(x, ry, w, rh);
        hits.rows[i] = [x, ry, w, rh];
        const rank = [[String(i + 1), i < 3 && t ? L.podium[i] : I.dim]];
        sheetText(rank, x + px(4) + rankW() - sheetW(rank), ty);
        const lx = x + px(4 + 4) + rankW(), nx = lx + px(CW + 4);
        if (!t) { sheetText([["-".repeat(L.nameMax), L.empty]], nx, ty); continue; }
        if (CLASSES[t.cls]) ctx.drawImage(tintedLook(t.cls, CLASS_GROUPS[CLASSES[t.cls].group].look), lx, ry + Math.round((rh - CH * u) / 2), CW * u, CH * u);
        sheetText([[String(t.name).slice(0, L.nameMax), t.name === mine && mine ? L.yours : I.text]], nx, ty);
        // the minutes played (to the right of their column) and the class
        const time = [[playMins(t), I.value]], tx = nx + sheetW([["M".repeat(L.nameMax)]]) + px(L.colGap) + timeW();
        sheetText(time, tx - sheetW(time, undefined, DOSAGE), ty, undefined, DOSAGE);
        const score = [[String(Math.min(t.score, L.scoreMax)), I.value]], scoreX = x + w - px(4 + L.playW + 4 + 4) - sheetW(score);
        sheetText([[clsFit(t.cls, scoreX - px(L.colGap) - (tx + px(L.colGap))), I.value]], tx + px(L.colGap), ty, undefined, DOSAGE);
        // its ▶ at the right, `playW` px across and twice that less one tall, at the row's middle (struck through from below its left to its top's right)
        const can = watchable(t), tall = 2 * L.playW - 1, ix = x + w - px(4 + L.playW), iy = ry + Math.round((rh - px(tall)) / 2);
        ctx.fillStyle = !can ? L.old : canWatch() ? L.play : I.dim;
        for (let c = 0; c < L.playW; c++) ctx.fillRect(ix + px(c), iy + px(c), px(1), px(tall - 2 * c));
        if (!can) { ctx.fillStyle = L.strike; for (let c = -1; c <= L.playW; c++) ctx.fillRect(ix + px(c), iy + px(tall - 2 - c), px(1), px(1)); }
        if (can) hits.plays[i] = [ix - px(4), ry, px(L.playW + 8), rh];
        // ...and the score left of it
        sheetText(score, scoreX, ty);
        if (i === ranking.focus) sheetFrame(x, ry, w, rh, I.focus);
      }
      if (board.state === "loading") {   // (the trees on the panel's ground, over the empty rows)
        const gw = px((GROWING.n - 1) * GROWING.step + CW), cx = x + Math.round(w / 2), cy = y + Math.round(listPart.h() / 2);
        ctx.fillStyle = I.bg; ctx.fillRect(cx - Math.round(gw / 2) - px(4), cy - Math.round(px(CH) / 2) - px(4), gw + px(8), px(CH) + px(8));
        drawGrowing(cx, cy, px(1), clock());
      } else if (board.state !== "done") {
        const note = [[tl("The leaderboard can't be reached."), I.dim]], h = listPart.h();
        const nw = sheetW(note), ny = y + Math.round((h - sheetLineH()) / 2);
        ctx.fillStyle = I.bg; ctx.fillRect(x + Math.round((w - nw) / 2) - px(4), ny - px(4), nw + px(8), sheetLineH() + px(8));
        sheetText(note, x + Math.round((w - nw) / 2), ny);
      }
    } };
  const pages = L.pageKeys.map((k, n) => sheetButton(k, `${n * L.per + 1}-${(n + 1) * L.per}`, "plain", { key: `page${n}`, outline: n === picked ? I.focus : null }));
  const spec = { title: "LEADERBOARD", titleRuns: tapKeys([["[", I.title], ["G", I.value], [`] ${tl("LEADERBOARD")}`, I.title]]), w: phone ? L.w : SHEET.wideW, help: ranking.help,
    helpText: BOARD_HELP.map(l => tl(l, { Click: tapping ? tl("Tap") : tl("Click"), Tab: tapping ? tl("The tabs at the top") : tl("Tab") })),
    parts: [sheetParts.box([boardsPart, notesPart, tabsPart], { gap: 4, pad: 4 }), sheetParts.box([listPart], { pad: 4 }), sheetParts.cta(pages, true)] };
  if (measuring) return drawSheet(spec, true);
  const hits = drawSheet(spec);
  ranking.hits = { box: hits.box, close: hits.close, help: hits.help, boards: hits.boards ?? [], tabs: hits.tabs ?? [], left: hits.left, right: hits.right,
    rows: hits.rows ?? [], plays: hits.plays ?? [], pages: L.pageKeys.map((k, n) => hits[`page${n}`]).filter(Boolean) };
}
// The settings ("[ESC] SETTINGS", the user's ask, 2026-10-18): on the game's own page
// (dos-age.com, `GAME_ONLY`: the website's Esc is untouched) Esc with nothing open, or the brown
// gear at the top left (web/site.js wireHeader(); on mektxt.com one under the header, main.js, the
// user's 2026-10-19), brings it up. A v0.13 sheet (drawSheet()), `w` px across, one column (option A
// of the four shown in chat, the user's pick, 2026-10-25): the title bar, then one box of sections,
// each its caption in grey and its rows on dark2, `rowGap` apart. SOUND: the Environment and Gameplay
// volumes, `segs` segments and the number (sound.js), and "[M] Mute", Y or N (M's own, sound.js
// toggleMute()). DISPLAY: Show Blood and Reduce Motion, Y or N. CONTROLS (not on a phone): the keys
// that move (WASD, HJKL, or Custom, its four keys on a row of their own, up, down, left and right),
// the key that uses and talks, and a line saying how (or which key's being asked for). TOUCH: the
// D-Pad. Under the box the buttons, side by side where they fit (else one over the other): [R]
// Reset (dark2) and, in a journey (not on the title, nor one watched, nor on mektxt.com), [T]
// Return to Title (red), which asks first: "Are you sure? You'll lose this journey." over [N] No
// and [Y] Yes (red: starts over, back on the title). The row picked is framed blue (the up and down
// keys, or the mouse over it); left and right change it, Enter, Space or the use key change it too
// or ask for its key (Esc keeps the old one; a key the game already uses is refused, in `refused`),
// Y and N answer a Y/N, R resets the lot (and unmutes); a click on a control does what it shows.
// Everything's kept as it's changed (settings.js).
const GAME_ONLY = "gameOnly" in document.body.dataset;
const SETTINGS = { w: SHEET.wideW, rowGap: 2, sectionGap: 4, segs: 10, valueGap: 3, refuseMs: 1600,
  key: "#d9a066", caption: "#847e87", hint: "#847e87", refused: "#d95763", asking: "#d9a066", sure: "#d95763" };
const SETTINGS_TITLE = ON_SITE ? english("SETTINGS") : "[ESC] SETTINGS";   // (on mektxt.com Esc's the website's, so it's only the gear)
const LEAVE_WORDS = { button: "Return to Title", sure: "Are you sure? You'll lose this journey." };
// (Claude's words)
const SETTINGS_HELP = [
  "The up and down keys pick a setting; left and right change it.",
  "Enter, Space or the use key change it too, or set its key: press the key you want, or Esc to keep the old one.",
  "Y and N answer Show Blood and Reduce Motion. M mutes everything; R puts every setting back.",
  "The arrows always move, whichever keys you pick.",
  "On a touch screen, D-Pad puts a pad to walk with over the HUD, on the side you pick.",
  ...(ON_SITE ? [] : ["Return to Title (T) asks first: say yes, and the journey you're on is over."]),
  "Settings are kept in this browser. They change nothing of a journey: its score and its replay are the same.",
];
// (LANGUAGE, 2026-10-26: the game's language, lang.js; "auto" the browser's)
const SETTING_ROWS = [
  { section: english("LANGUAGE"), id: "lang", label: english("Language"), kind: "lang" },
  { section: english("SOUND"), id: "env", label: "Environment", kind: "volume" },
  { section: english("SOUND"), id: "gameplay", label: "Gameplay", kind: "volume" },
  { section: english("SOUND"), id: "mute", label: "Mute", key: "M", kind: "yn", get: isMuted, set: on => { if (isMuted() !== on) toggleMute(); } },
  { section: english("DISPLAY"), id: "blood", label: "Show Blood", kind: "yn" },
  { section: english("DISPLAY"), id: "calm", label: "Reduce Motion", kind: "yn" },
  { section: english("DISPLAY"), id: "curve", label: "Screen Curve", kind: "yn" },   // (crt.js CURVE, 2026-10-27)
  { section: english("CONTROLS"), id: "move", label: "Move", kind: "pick", options: [["wasd", "WASD"], ["vim", "HJKL"], ["custom", english("Custom")]] },
  { section: english("CONTROLS"), id: "keys", label: "Keys", kind: "keys", when: () => settings.move === "custom" },
  { section: english("CONTROLS"), id: "use", label: "Use / Talk", kind: "key" },
  { section: english("TOUCH"), id: "dpad", label: "D-Pad", kind: "yn", when: () => tapping },   // (see DPAD)
  { section: english("TOUCH"), id: "dpadSide", label: "D-Pad Side", kind: "pick", options: [["right", english("Right")], ["left", english("Left")]], when: () => tapping && settings.dpad },
];
// A Y/N row's answer, and setting it (Mute's is sound.js's own, M's, never kept in settings.js)
const settingOn = row => (row.get ? row.get() : settings[row.id]);
const setOn = (row, on) => (row.set ? row.set(on) : setSetting(row.id, on));
// Reset: every setting as it was, and the sound back on
const resetAll = () => { resetSettings(); if (isMuted()) toggleMute(); };
// A row's label, "[M] MUTE" with its key (translated, see lang.js)
const rowLabel = row => (row.key ? keyLabel(row.key, row.label, SETTINGS.key, SHEET.ink.text) : [[tl(row.label), SHEET.ink.text]]);
// The language row's dropdown (option A of the ones shown the user, 2026-10-26): a box with the
// language picked and a gold ▼; Enter (or the use key) or a press opens its list under it, each
// language in its own name, the one picked on green (a dot by it), the one the arrows are on framed
// blue; Enter picks, Esc shuts it. Left and right on the row still step through them.
const LANG_LIST = { pad: 4, rowPad: 3, tri: 5 };
const settingRows = () => SETTING_ROWS.filter(r => (!r.when || r.when()) && !(phone && r.section === "CONTROLS"));
const WAY_NAMES = [english("Up"), english("Down"), english("Left"), english("Right")];
// A key's name as the panel shows it
const keyName = code => ({ Space: "SPACE", Comma: ",", Period: ".", Quote: "'", BracketLeft: "[", BracketRight: "]", Backslash: "\\",
  Backquote: "`", Semicolon: ";", Slash: "/" }[code] ?? code.replace(/^Key/, ""));
// Whether a key can be the one asked for (`ask`): a letter or one of these, none the game uses for
// anything else, nor already moving or using
const SPARE_KEYS = ["Space", "Comma", "Period", "Quote", "BracketLeft", "BracketRight", "Backslash", "Backquote"];
const TAKEN_KEYS = ["KeyB", "KeyE", "KeyG", "KeyH", "KeyI", "KeyM", "KeyN", "KeyO", "KeyP", "KeyQ", "KeyR", "KeyY",
  ...(ON_SITE ? ["KeyZ", "KeyX", "KeyC", "KeyV"] : [])];   // (mektxt.com's: to the website's pages, see LEAVE_KEYS)
function keyFree(code, ask) {
  if (!(/^Key[A-Z]$/.test(code) || SPARE_KEYS.includes(code)) || TAKEN_KEYS.includes(code)) return false;
  if (ask.id === "use") return !moveKeys().includes(code);
  return code !== settings.use && !(ask.one ? ask.keys.filter((_, j) => j !== ask.i) : ask.keys.slice(0, ask.i)).includes(code);
}
// { focus (the row picked), help, ask (null, or the key being asked for: { id: "use" }, or
// { id: "keys", i, keys, one }, the custom moves one by one from i, or only i, clicked), refused (when a key last was), hits } while it's up
let setting = null;
export function openSettings() {
  if (setting) return;
  setting = { focus: 0, help: false, ask: null, refused: -Infinity, hits: null, leaving: false };
  held.length = 0;
}
function closeSettings() {
  setting = null;
  canvas.style.cursor = "";
}
// Whether there's a journey to leave for the title (see SETTINGS)
const canLeave = () => !opening && !watching && !verifyId;
const canLeaveHere = () => !ON_SITE && canLeave();   // (mektxt.com has no title)
// A row changed by a step `d` (-1 or 1), or by Enter (0): a volume by ten, a Y/N the other way,
// the moves to the next, a key asked for
function changeSetting(row, d) {
  const { id } = row;
  if (row.kind === "volume") {
    if (!d) return;
    setSetting(id, Math.max(0, Math.min(100, settings[id] + 10 * d)));
    if (id === "gameplay") tock();   // (to hear it by)
  } else if (row.kind === "yn") setOn(row, !settingOn(row));
  else if (row.kind === "lang") {
    const picks = languagePicks(), i = picks.indexOf(pickedLanguage());
    if (d) setLanguage(picks[(i + d + picks.length) % picks.length]);
    else setting.langOpen = { focus: Math.max(0, i) };
  }
  else if (row.kind === "pick") {
    const n = row.options.length, i = row.options.findIndex(([k]) => k === settings[id]);
    setSetting(id, row.options[(i + (d || 1) + n) % n][0]);
    if (moveKeys().includes(settings.use)) setSetting("use", moveKeys().includes("KeyF") ? "Space" : "KeyF");   // (never a key that moves)
  } else if (!d) setting.ask = row.kind === "key" ? { id } : { id, i: 0, keys: [...settings.keys] };
}
// The key asked for, pressed: `use` by its letter (as keyOf() reads it, `raw`), the moves by where it is
function answerAsk(e) {
  const a = setting.ask, code = a.id === "use" ? e.raw : e.pos;
  if (!keyFree(code, a)) { setting.refused = performance.now(); return; }
  if (a.id === "use") { setSetting("use", code); setting.ask = null; return; }
  a.keys[a.i] = code;
  if (a.one || ++a.i === WAY_NAMES.length) { setSetting("keys", a.keys); setting.ask = null; }
}
function settingsKey(e) {
  if (setting.ask) {
    e.preventDefault();
    if (e.repeat) return;
    if (e.code === "Escape") setting.ask = null;
    else answerAsk(e);
    return;
  }
  if (setting.langOpen) {         // (the language list: arrows, Enter picks, Esc shuts it)
    const picks = languagePicks(), o = setting.langOpen, d = DIRS[e.pos];
    e.preventDefault();
    if (d?.[1]) o.focus = (o.focus + d[1] + picks.length) % picks.length;
    else if (["Enter", "NumpadEnter", "Space", "KeyF", settings.use].includes(e.code) && !e.repeat) { setLanguage(picks[o.focus]); setting.langOpen = null; }
    else if (e.code === "Escape" || e.code === "Backspace") setting.langOpen = null;
    return;
  }
  const rows = settingRows(), d = DIRS[e.pos];
  setting.focus = Math.min(setting.focus, rows.length - 1);
  const row = rows[setting.focus];
  if (d) {
    e.preventDefault();
    if (d[1]) setting.focus = (setting.focus + d[1] + rows.length) % rows.length;
    else if (!e.repeat || row.kind === "volume") changeSetting(row, d[0]);
    return;
  }
  if (e.repeat) return;
  if (setting.leaving && ["KeyY", "KeyN", "Escape"].includes(e.code)) { e.code === "KeyY" ? startOver() : (setting.leaving = false); return; }
  if (e.code === "Escape") setting.help ? (setting.help = false) : closeSettings();
  else if (e.code === "KeyH" || e.key === "?") setting.help = !setting.help;
  else if (["Enter", "NumpadEnter", "Space", "KeyF"].includes(e.code)) { e.preventDefault(); changeSetting(row, 0); }
  else if (row.kind === "yn" && ["KeyY", "KeyN"].includes(e.code)) setOn(row, e.code === "KeyY");
  else if (e.code === "KeyR") resetAll();
  else if (e.code === "KeyT" && canLeaveHere()) setting.leaving = true;
}
// ...and the pointer's: "X" or a click outside it closes it, "?" shows its help, a part of a row
// does what it shows, and a press anywhere gives up a key being asked for
function settingsPress(px, py) {
  const h = setting.hits, help = setting.help;
  setting.help = onRect(h?.help, px, py) && !help;
  if (onRect(h?.help, px, py)) click();
  if (onRect(h?.help, px, py) || help) return;
  if (setting.ask) { setting.ask = null; return; }
  if (setting.langOpen) {         // (a language pressed is picked; anywhere else shuts the list)
    const i = (setting.langRows ?? []).findIndex(r => onRect(r, px, py));
    if (i >= 0) setLanguage(languagePicks()[i]);
    setting.langOpen = null;
    click();
    return;
  }
  if (h && onRect(h.close, px, py)) click();
  if (!h || onRect(h.close, px, py) || !onRect(h.box, px, py)) return closeSettings();
  const control = h.controls.find(([r]) => onRect(r, px, py));
  const row = h.rows.findIndex(r => onRect(r, px, py));
  if (control || row >= 0) click();
  if (row >= 0) setting.focus = row;
  control?.[1]();
}
// The settings (see SETTINGS), a sheet centred on screen; `measuring`: only its width
function drawSettings(measuring = false) {
  if (!setting) return;
  if (!measuring) {
    fitUi(() => drawSettings(true));
    if (opening) { ctx.fillStyle = SCRIM; ctx.fillRect(0, 0, canvas.width, canvas.height); }   // (the title's drawn over the frame's own, see frame())
  }
  const S = SETTINGS, rows = settingRows(), a = setting.ask, { px } = uiMetrics();
  setting.focus = Math.min(setting.focus, rows.length - 1);
  // (a row's control, at its right: a volume's segments and number, or its chips)
  const volume = row => {
    const segs = segments(settings[row.id] / 10, S.segs, k => setSetting(row.id, settings[row.id] === 10 && k === 0 ? 0 : 10 * (k + 1)));
    const value = () => [[String(settings[row.id]), SHEET.ink.value]], numW = () => sheetW([["100"]]);
    return { w: () => segs.w() + px(S.valueGap) + numW(), h: () => Math.max(segs.h(), sheetLineH()),
      draw: (x, y, hits) => {
        const h = Math.max(segs.h(), sheetLineH());
        segs.draw(x, y + Math.round((h - segs.h()) / 2), hits);
        sheetText(value(), x + segs.w() + px(S.valueGap) + numW() - sheetW(value()), y + Math.round((h - sheetLineH()) / 2));
      } };
  };
  const control = row => {
    if (row.kind === "volume") return volume(row);
    if (row.kind === "lang") return langBox(row);
    if (row.kind === "yn") return chips(["Y", "N"].map((label, k) => ({ label, on: settingOn(row) === (k === 0), press: () => setOn(row, k === 0) })));
    if (row.kind === "pick") return chips(row.options.map(([id, label], k) => ({ label, on: settings[row.id] === id,
      press: () => changeSetting(row, k - row.options.findIndex(([o]) => o === settings[row.id])) })));
    if (row.kind === "keys") return chips((a?.id === "keys" ? a.keys : settings.keys).map((code, i) => {
      const ask = a?.id === "keys" && i === a.i;
      return { label: ask ? "?" : keyName(code), on: true, ask, press: () => (setting.ask = { id: "keys", i, keys: [...settings.keys], one: true }) };
    }));
    const ask = a?.id === "use";
    return chips([{ label: ask ? "?" : keyName(settings.use), on: true, ask, press: () => changeSetting(row, 0) }]);
  };
  // (each row, its rect kept by its place, for the pointer to pick it by; its label, and the hint under
  // the controls, in Dosage: the user's, 2026-10-27)
  const rowPart = (row, n) => {
    const part = sheet.row(rowLabel(row), control(row), { outline: n === setting.focus && !tapping ? SHEET.ink.focus : null, leftFont: DOSAGE });
    return { ...part, draw: (x, y, w, hits) => { part.draw(x, y, w, hits); hits.rows[n] = [x, y, w, part.h(w)]; } };
  };
  // (the line under the controls: how they go, or which key's asked for, or that it's taken)
  const hint = performance.now() - setting.refused < S.refuseMs ? [[tl("That key's taken"), S.refused]]
    : a ? [[tl("Press a key for {what}", { what: tl(a.id === "use" ? "Use / Talk" : WAY_NAMES[a.i]) }), S.asking]]
    : [[tl(settings.move === "custom" ? "Up, down, left, right" : "The arrows always move too"), S.hint]];
  const parts = [];
  rows.forEach((row, n) => {
    if (row.section !== rows[n - 1]?.section) {
      if (n) parts.push(sheet.gap(S.sectionGap - S.rowGap));
      parts.push(sheet.lines([[[tl(row.section), S.caption]]], "fs"));
    }
    parts.push(rowPart(row, n));
    if (row.section === "CONTROLS" && rows[n + 1]?.section !== "CONTROLS") parts.push(sheet.lines([hint], "fs", false, DOSAGE));
  });
  const panel = [sheetParts.box(parts, { gap: S.rowGap })];
  // the buttons: Reset and Return to Title, or the question and No / Yes; side by side where they fit
  const buttons = setting.leaving
    ? [sheetButton("N", "No", "plain", { press: () => (setting.leaving = false) }), sheetButton("Y", "Yes", "stop", { press: () => startOver() })]
    : [sheetButton("R", "Reset", "plain", { press: resetAll }), ...(canLeaveHere() ? [sheetButton("T", LEAVE_WORDS.button, "stop", { press: () => (setting.leaving = true) })] : [])];
  if (setting.leaving) panel.push(sheetParts.box([sheet.text(LEAVE_WORDS.sure, S.sure)], { pad: 4 }));
  const across = sheetParts.cta(buttons, true);
  panel.push(across.minW() + 2 * px(1) <= px(S.w) ? across : sheetParts.cta(buttons));
  const spec = { title: SETTINGS_TITLE, w: S.w, help: setting.help, helpText: SETTINGS_HELP, parts: panel };
  if (measuring) return drawSheet(spec, true);
  setting.hits = drawSheet(spec);
  drawLangList();
}
// The language row's box (see LANG_LIST): as wide as the longest language's name
function langBox(row) {
  const { px } = uiMetrics(), L = LANG_LIST, name = () => [[languageName(pickedLanguage()), SHEET.ink.text]];
  const textW = () => Math.max(...languagePicks().map(c => sheetW([[languageName(c)]])));
  return { w: () => textW() + px(2 * L.pad + 4 + L.tri + 2), h: () => sheetLineH() + px(2 * L.rowPad),
    draw: (x, y, hits) => {
      const { px } = uiMetrics(), w = textW() + px(2 * L.pad + 4 + L.tri + 2), h = sheetLineH() + px(2 * L.rowPad);
      ctx.fillStyle = SHEET.ink.bg; ctx.fillRect(x, y, w, h);
      sheetFrame(x, y, w, h, setting.langOpen ? SHEET.ink.focus : SHEET.ink.line);
      sheetText(name(), x + px(L.pad), y + px(L.rowPad));
      ctx.fillStyle = SHEET.ink.value;   // (▼, a row shorter each line down)
      for (let r = 0; r < 3; r++) ctx.fillRect(x + w - px(L.pad + L.tri) + px(r), y + Math.round((h - px(3)) / 2) + px(r), px(L.tri - 2 * r), px(1));
      setting.langBox = [x, y, w, h];
      sheetHit(hits, [x, y, w, h], null, () => { setting.langOpen = { focus: Math.max(0, languagePicks().indexOf(pickedLanguage())) }; });
    } };
}
// ...and its list, open, under it (over whatever's below)
function drawLangList() {
  setting.langRows = [];
  if (!setting.langOpen || !setting.langBox) return;
  const { px } = uiMetrics(), L = LANG_LIST, S = SHEET.ink, [bx, by, bw, bh] = setting.langBox, picks = languagePicks();
  const rowH = sheetLineH() + px(2 * L.rowPad), b = px(1), w = bw, h = picks.length * rowH + 2 * b + px(2);
  const x = bx, y = Math.min(by + bh + px(2), canvas.height - h - px(4));
  ctx.fillStyle = "rgba(7, 19, 36, 0.6)"; ctx.fillRect(x + px(4), y + px(4), w, h);   // (its shadow)
  ctx.fillStyle = S.bg; ctx.fillRect(x, y, w, h);
  sheetFrame(x, y, w, h, S.focus);
  picks.forEach((code, i) => {
    const ry = y + b + px(1) + i * rowH, rx = x + b + px(1), rw = w - 2 * b - px(2), on = code === pickedLanguage();
    if (on) { ctx.fillStyle = S.pickedBg; ctx.fillRect(rx, ry, rw, rowH); }
    if (i === setting.langOpen.focus) sheetFrame(rx, ry, rw, rowH, S.focus);
    sheetText([[languageName(code), on || i === setting.langOpen.focus ? S.text : S.label]], rx + px(L.pad - 1), ry + px(L.rowPad));
    if (on) { ctx.fillStyle = S.picked; ctx.fillRect(rx + rw - px(L.pad + 2), ry + Math.round((rowH - px(2)) / 2), px(2), px(2)); }
    setting.langRows[i] = [rx, ry, rw, rowH];
  });
}

// Watching a journey again (see REPLAY): the journey's clock moved on by the page's time since
// the last frame, times the speed (not while it's paused or the website's up), a long wait cut
// short, and everything its record has up to then done again; the clock as it is then
function watchFrame(page) {
  const W = watching, next = () => W.events[W.i];
  if (verifyId) return watchNow;   // (see verifyStep())
  if (W.last !== null && !W.paused && active) W.at += (page - W.last) * W.speed;
  W.last = page;
  if (!W.paused && next() && next().t - W.at > REPLAY.idleMs) W.at = next().t - REPLAY.idleMs;
  for (let e; (e = next()) && e.t <= W.at; W.i++) {
    watchNow = e.t;
    replaying = true;
    try { act(e.code, ...structuredClone(e.args)); }
    catch (err) { console.error(err); W.outOfStep = true; }
    finally { replaying = false; }
  }
  return (watchNow = W.at);
}
// Checking a journey (see VERIFY): the next `chunk` of its events done again, and once they're all
// done (or it's gone out of step), what's found told
function verifyStep() {
  const W = watching;
  for (let n = 0, e; n < VERIFY.chunk && !W.outOfStep && (e = W.events[W.i]); n++, W.i++) {
    watchNow = W.at = e.t;
    replaying = true;
    try { act(e.code, ...structuredClone(e.args)); }
    catch (err) { console.error(err); W.outOfStep = true; }
    finally { replaying = false; }
  }
  if (W.i < W.events.length && !W.outOfStep) return setTimeout(verifyStep, 0);
  const notes = [], q = new URLSearchParams(W.record.q ?? ""), score = dead?.score.score ?? null;
  if (W.outOfStep) notes.push(`out of step at turn ${turns}`);
  if (!dead) notes.push(`its record ends on turn ${turns}, before the journey does`);
  else if (score !== W.score) notes.push(`comes to ${score}, sent as ${W.score}`);
  const tried = VERIFY.trying.filter(k => q.has(k));
  if (tried.length) notes.push(`played with ${tried.join(", ")}`);
  if (W.daily && (q.get("daily") !== W.daily || W.record.seed !== seedOf(W.daily))) notes.push(`not on ${W.daily}'s seed`);
  const span = (W.events.at(-1)?.t ?? W.record.t0) - W.record.t0;
  if (turns && span / turns < VERIFY.minTurnMs) notes.push(`${Math.round(span / turns)} ms a turn`);
  const gaps = [];
  for (let i = 0, last = null; i < W.events.length; i++) if (W.events[i].code === "s") {
    const gap = last === null ? null : W.events[i].t - last;
    if (gap >= VERIFY.press[0] && gap <= VERIFY.press[1]) gaps.push(gap);
    last = W.events[i].t;
  }
  const mean = gaps.reduce((a, g) => a + g, 0) / (gaps.length || 1);
  const cv = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / (gaps.length || 1)) / (mean || 1);
  if (gaps.length >= VERIFY.evenOf && cv < VERIFY.evenCv) notes.push(`its presses even (${cv.toFixed(2)} over ${gaps.length})`);
  verified({ ok: notes.length === 0, notes, score, sent: W.score, turns, events: W.events.length, cv: Number(cv.toFixed(3)) });
}
// ...told to the page that opened this one (and kept, for looking at here)
function verified(result) {
  window.verified = { verify: verifyId, ...result };
  document.title = result.ok ? "Checked: good" : result.ok === false ? "Checked: not good" : "Checked: can't tell";
  try { window.opener?.postMessage(window.verified, "*"); } catch {}
}
// Watches journey `id` on the board (the page starts afresh into it, as starting over does), as
// long as the character's own journey hasn't really begun (they could still change class), or is over
const canWatch = () => !!watching || !!dead || classOpen;
// Loading (the user's pick B, 2026-10-28, as index.html's at start-up): `n` forest-1 trees, each felled
// and grown back (`seq`: its tree, two hits, stump, sprout, sapling, young tree, ms each), the next
// `lag` ms behind the last, `step` px apart, centred on (cx, cy), `u` screen px a pixel; its browns a
// step brighter than the game's (`inks`, the user's, 2026-10-28)
const GROWING = { seq: [[0, 500], [1, 110], [2, 110], [3, 260], [4, 200], [5, 200], [6, 200]], n: 5, lag: 170, step: 10,
  inks: [["#663931", "#8f563b"], ["#524b24", "#8a6f30"]] };
function drawGrowing(cx, cy, u, now) {
  const G = GROWING, b = SCENE.biomes[0], tiles7 = [b.trees[0], ...b.treeHits[0], ...b.growing], total = G.seq.reduce((t, [, ms]) => t + ms, 0);
  const at = t => { t = ((t % total) + total) % total; for (const [f, ms] of G.seq) { if (t < ms) return tiles7[f]; t -= ms; } return tiles7[0]; };
  const w = ((G.n - 1) * G.step + CW) * u, x0 = Math.round(cx - w / 2), y0 = Math.round(cy - CH * u / 2);
  for (let i = 0; i < G.n; i++) ctx.drawImage(recolour(at(now - i * G.lag), G.inks), 0, 0, CW, CH, x0 + i * G.step * u, y0, CW * u, CH * u);
}
// ...and the same trees over the whole screen on dark1, between journeys (the user's ask, 2026-10-28):
// after a death's reload, from the page's start for at least one pass of the wave (`hold`, index.html's
// trees going on into these, see startOver()), and as a journey begins from the class pick for `begin`
// ms; any key or tap ends it early (and goes no further), then it fades out over `fadeMs`, the
// world under it; `u` CSS px a pixel, as index.html's
const BETWEEN = { hold: GROWING.seq.reduce((t, [, ms]) => t + ms, 0) + (GROWING.n - 1) * GROWING.lag, begin: 1000, fadeMs: 300, u: 4 };
let between = null;                // { t0, ms } while it's up (performance.now(), not the replay's clock)
try { if (sessionStorage.getItem("mektxt.grow") === "1") { between = { t0: 0, ms: BETWEEN.hold }; curtain = null; } sessionStorage.removeItem("mektxt.grow"); } catch {}
function drawBetween() {
  if (!between) return;
  const now = performance.now(), left = between.t0 + between.ms - now;
  if (left <= -BETWEEN.fadeMs) { between = null; return; }
  ctx.globalAlpha = left > 0 ? 1 : 1 + left / BETWEEN.fadeMs;
  ctx.fillStyle = "#071324";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGrowing(canvas.width / 2, canvas.height / 2, Math.max(1, Math.round(BETWEEN.u * pixelRatio)), now);
  ctx.globalAlpha = 1;
}
for (const type of ["keydown", "keyup", "pointerdown", "pointerup", "click"]) addEventListener(type, e => {
  if (!between || e.metaKey || e.ctrlKey) return;
  e.stopImmediatePropagation();
  e.preventDefault();
  const now = performance.now();
  if ((type === "keydown" || type === "pointerdown") && between.t0 + between.ms > now) between.ms = now - between.t0;
}, { capture: true });
function watchJourney(id) {
  if (!canWatch()) return;
  try { sessionStorage.setItem("mektxt.watch", String(id)); } catch {}
  startOver(null);
}
// (↻: the same journey again from its start, the user's, 2026-10-29; R or X still starts one's own)
const watchAgain = () => { try { sessionStorage.setItem("mektxt.watch", String(watching.id)); } catch {} startOver(null); };
const pauseWatching = () => { watching.paused = !watching.paused; tape(watching.paused ? "pause" : "play"); };
const nextSpeed = () => { const s = REPLAY.speeds; watching.speed = s[(s.indexOf(watching.speed) + 1) % s.length]; tape("speed"); };
// Watching, the keys: [Space] or P pauses, 1-4 the speed, R starts a journey of one's own, G the
// leaderboard, ? or H its help, and the zoom and leaving keys as ever
function watchKey(e) {
  if (e.code in ZOOM_KEYS) { e.preventDefault(); zoom(ZOOM_KEYS[e.code]); return; }
  if (e.repeat) return;
  const n = e.code.match(/^(?:Digit|Numpad)([1-4])$/);
  if (e.code === "Space" || e.code === "KeyP") { e.preventDefault(); pauseWatching(); }
  else if (n && watching.speed !== REPLAY.speeds[n[1] - 1]) { watching.speed = REPLAY.speeds[n[1] - 1]; tape("speed"); }
  else if (e.code === "KeyR") startOver();
  else if (e.code === "KeyG") openLeaderboard();
  else if (e.code === "Slash" || e.code === "KeyH") watching.help = !watching.help;
  else if (e.code === "Escape" && watching.help) watching.help = false;
  else leave(e);
}
// The replay panel while watching ("replay", 525:97082, 2026-10-11), `w` px wide at the top left
// under the header, `gap` from the edges: along the top, on dark2, "REPLAY", "?" (its help) and
// "X" (stops watching: a journey of one's own); then on dark1, framed in dark2, `pad` in, `gap`
// apart: the player's look (their class's, tinted as the leaderboard has it), their name in bw4
// and score in `score` at the right; "All Rank" and "Class Rank", each with its place at the
// right (`lineGap` apart); and `ctaH` px buttons on dark2, `ctaGap` apart: "[P] Play" (or Pause)
// and "[1-4] Speed", the speed it's at after it (Claude's addition, so it shows), by key or
// click. A line in `warn` under them if the record's gone out of step or run out.
// On a phone it's lower and wider ("replay-mobile", 525:97206): the look, name, score and ranks
// in a column at the left, and the buttons beside them, `rowGap` apart, just "Play" (or "Pause")
// and the speed ("2x"), each as wide as the widest it can say; no more than `phoneMax` of the
// screen across (Claude's pick).
const WATCH_PANEL = { w: 87, gap: 4, pad: 4, rowGap: 6, lineGap: 2, ctaH: 15, ctaGap: 2, iconGap: 4, phoneColW: 75, phoneMax: 0.6,
  name: "#cbdbfc", score: "#eec39a", label: "#847e87", rank: "#d9a066", classRank: "#9badb7", key: "#d9a066", ink: "#9badb7",
  button: "#222034", warn: "#d95763" };
const WATCH_HELP = ["You're watching a journey from the leaderboard, as it was played.",
  "P or Space pauses it and plays it on; 1-4 picks how fast it goes (1x, 2x, 4x, 8x).",
  "R or X starts a journey of your own; G opens the leaderboard."];
let watchButtons = {};
// (as the v0.13 sheet has it, "replay-desktop" 876:86241 and "replay-mobile" 879:86612, see SHEET:
// the player's look and score, name and class on dark1; the mode in gold over Rank and Class Rank;
// then the buttons: ↻ (the journey again from its start), the speed, and Play (green) or Pause; on a phone
// the three side by side, the buttons one over the other)
function drawWatching(measuring = false) {
  if (!watching) return;
  if (!measuring) {
    fitUi(() => drawWatching(true));
    // (on a phone, no more than `phoneMax` of the screen across, so the game and the tape's counter show beside it)
    while (phone && uiU > 1 && drawWatching(true) > WATCH_PANEL.phoneMax * canvas.width) uiU--;
  }
  const P = WATCH_PANEL, W = watching, I = SHEET.ink;
  const cls = CLASSES[W.cls] ? W.cls : charClass, name = [[W.name ?? tl("YOU"), I.text]], clsName = [[nameOf(CLASSES[cls].name), I.label]];
  const score = [[String(W.score ?? 0), I.title]];
  // (the player: on desktop the look, name and class at the left and the score at the right; on a phone the look and score over the name and class)
  const who = { minW: () => { const { px } = uiMetrics(); return 2 * px(6) + (phone ? Math.max(px(CW + 4) + sheetW(score, "big"), sheetW(name), sheetW(clsName, "fs"))
      : px(CW + 4) + Math.max(sheetW(name), sheetW(clsName, "fs")) + px(8) + sheetW(score, "big")); },
    h: () => { const { px } = uiMetrics(), two = sheetLineH() + px(2) + sheetLineH("fs"); return 2 * px(6) + (phone ? px(CH) + px(4) + two : Math.max(px(CH), two)); },
    draw: (x, y, w) => {
      const { u, px } = uiMetrics(), h = who.h(), two = sheetLineH() + px(2) + sheetLineH("fs");
      ctx.fillStyle = I.bg; ctx.fillRect(x, y, w, h);
      const look = tintedLook(cls, CLASS_GROUPS[CLASSES[cls].group].look), lx = x + px(6);
      if (phone) {
        ctx.drawImage(look, lx, y + px(6), CW * u, CH * u);
        drawSans(ctx, score, lx + px(CW + 4), y + px(6) + Math.round((px(CH) - sheetLineH("big")) / 2), sheetFont("big"));
        const ty = y + px(6 + CH + 4);
        drawSans(ctx, name, lx, ty, sheetFont());
        drawSans(ctx, clsName, lx, ty + sheetLineH() + px(2), sheetFont("fs"));
      } else {
        const ty = y + Math.round((h - two) / 2);
        ctx.drawImage(look, lx, y + Math.round((h - px(CH)) / 2), CW * u, CH * u);
        drawSans(ctx, name, lx + px(CW + 4), ty, sheetFont());
        drawSans(ctx, clsName, lx + px(CW + 4), ty + sheetLineH() + px(2), sheetFont("fs"));
        drawSans(ctx, score, x + w - px(6) - sheetW(score, "big"), y + Math.round((h - sheetLineH("big")) / 2), sheetFont("big"));
      }
    } };
  const place = n => [[n ? placeShown(n) : "-", I.title]];
  const ranks = sheetParts.box([sheet.lines([[[gameMode === "daily" ? tl("DAILY") : tl("COMPETITIVE"), I.title]]], "f", true),
    sheet.row([[tl("RANK"), I.label]], place(W.rank), { bg: phone ? null : I.row, pad: phone ? 2 : 4 }),
    sheet.row([[tl("CLASS RANK"), I.label]], place(W.classRank), { bg: phone ? null : I.row, pad: phone ? 2 : 4 })], { pad: 2, gap: 2 });
  const ended = W.i >= W.events.length && !dead;
  const warnText = W.outOfStep ? "This journey has gone out of step." : ended ? "Its record ends here." : null;
  const again = { runs: [["", I.text]], key: "start", bg: SHEET.bg.plain };
  // (each as wide as its widest label, so the panel keeps one width playing or paused, the user's, 2026-10-29)
  const speed = { runs: [[`${W.speed}x`, I.text]], fit: REPLAY.speeds.map(n => [[`${n}x`]]), key: "speed" };
  const play = { runs: [[W.paused ? tl("Play") : tl("Pause"), I.text]], fit: [[[tl("Play")]], [[tl("Pause")]]], key: "pause", bg: W.paused ? SHEET.bg.go : SHEET.bg.plain };
  const buttons = sheetParts.cta(phone ? [speed, play] : [again, speed, play], !phone);
  const parts = phone ? [sheetParts.across([who, ranks, buttons], 1)] : [who, ranks, buttons];
  if (warnText) parts.push(sheetParts.box([sheet.text(warnText, P.warn, "fs")], { pad: 4 }));
  const spec = { title: "REPLAY", w: phone ? 150 : SHEET.cardW, help: W.help, helpText: WATCH_HELP, parts };
  if (measuring) return drawSheet(spec, true);
  spec.at = [gutter + uiMetrics().px(P.gap), headerPx() + uiMetrics().px(P.gap)];
  const hits = drawSheet(spec);
  watchButtons = { help: hits.help, close: hits.close, pause: hits.pause, speed: hits.speed, ...(hits.start ? { start: hits.start } : {}) };
  if (hits.start) {                // (↻ on its button: the cooldown's icon)
    const { u } = uiMetrics(), [bx, by, bw, bh] = hits.start;
    ctx.drawImage(tiles, SCENE.cooldown * CW, 0, CW, CH, bx + Math.round((bw - CW * u) / 2), by + Math.round((bh - CH * u) / 2), CW * u, CH * u);
  }
  drawTapeCounter();
}
// The tape's counter while watching, as a VCR's on-screen display (Claude's, 2026-10-12, not in
// Figma): at the top right, in line with the score, `gap` px under the header (and under the
// score, when that's up there too), in bw4 with a dark1 shadow a px down and right: what the tape's doing, with its symbol
// ("PLAY" and ▶, "PLAY" and ▶▶ and the speed when faster than 1x, "PAUSE" and ❚❚ blinking every
// `blinkMs`, "STOP" and ■ once the record runs out), and under it the journey's own time so far
// (hh:mm:ss), which runs at the speed it's played at and stops with it.
const TAPE = { gap: 4, lineGap: 3, iconGap: 3, blinkMs: 500, ink: "#cbdbfc", shadow: "#071324" };
function drawTapeCounter() {
  const W = watching, T = TAPE, { u, f, px, tw } = uiMetrics(), fh = SCENE.font.h * f, sh = Math.max(1, Math.round(u / 2));
  const ended = W.i >= W.events.length && !dead;
  const state = ended ? "stop" : W.paused ? "pause" : "play";
  const label = { stop: "STOP", pause: "PAUSE", play: "PLAY" }[state] + (state === "play" && W.speed > 1 ? ` ${W.speed}x` : "");
  const at = ended ? Math.min(W.at, W.events.at(-1)?.t ?? W.at) : W.at;   // (stopped where the record runs out)
  const secs = Math.max(0, Math.floor((at - W.record.t0) / 1000));
  const time = [Math.floor(secs / 3600), Math.floor(secs / 60) % 60, secs % 60].map(n => String(n).padStart(2, "0")).join(":");
  // its symbol, in font px (7 tall, as a capital is): ▶ (one or two), ❚❚ or ■, as rows of [x, width]
  const tri = [[0, 1], [0, 2], [0, 3], [0, 4], [0, 3], [0, 2], [0, 1]];
  const shape = state === "stop" ? Array(7).fill([[0, 7]])
    : state === "pause" ? Array(7).fill([[0, 2], [3, 2]])
    : W.speed > 1 ? tri.map(([x, n]) => [[x, n], [x + 4, n]]) : tri.map(r => [r]);
  const iconW = Math.max(...shape.flat().map(([x, n]) => x + n)) * f;
  const scoreUp = !(canvas.width > canvas.height);   // (see drawScore(): the score's at the top right too)
  const xr = canvas.width - Math.round(LOG.left * hudScale);   // (in line with the score)
  const y0 = headerPx() + (scoreUp ? Math.round(LOG.left * hudScale) + CH * hudScale : 0) + px(T.gap);
  const lw = tw([[label]]) + px(T.iconGap) + iconW, x1 = xr - lw, x2 = xr - tw([[time]]);
  const blinkOff = state === "pause" && Math.floor(performance.now() / T.blinkMs) % 2;
  for (const [dx, ink] of [[sh, T.shadow], [0, T.ink]]) {
    if (!blinkOff) {
      drawText(ctx, [[label, ink]], x1 + dx, y0 + dx, f);
      ctx.fillStyle = ink;
      const ix = x1 + tw([[label]]) + px(T.iconGap) + dx, iy = y0 + Math.round((fh - 7 * f) / 2) + dx;
      shape.forEach((row, r) => row.forEach(([x, n]) => ctx.fillRect(ix + x * f, iy + r * f, n * f, f)));
    }
    drawText(ctx, [[time, ink]], x2 + dx, y0 + fh + px(T.lineGap) + dx, f);
  }
}
const watchButtonAt = (px, py) => (watching ? Object.keys(watchButtons).find(id => onRect(watchButtons[id], px, py)) : undefined);
// The classes' panel ("character-selection", 406:67419, v0.12), from P or the button over the
// character's head, centred like the notice: "[P] PICK A CLASS", "?" (its help, CLASS_HELP) and
// "X" along the top on dark2; then on dark1 the classes in a `listW` px column, a `rowH` px row
// each `rowGap` apart (its look, tinted by its group, see CLASS_GROUPS, and its name), beside
// the card of the one picked, on its group's colour: its name and group, its hp, atk, mag, def
// and spd as the class adds them (two to a row under the hp), its traits, and its own skill's
// card; and under it all [Y] Choose and [N] Cancel, `ctaH` px tall. The arrows (or a click on
// one) pick a class, its row on its group's colour; Y, Enter, Space, F or [Y] Choose takes it;
// N, Esc, P, [N] Cancel, "X" or a click outside closes it. It takes no turn. Under the classes it's
// `lowerH` tall, as Figma's pick-a-class (834:91326) has it, longer only for a class whose card or
// traits need it; it's centred as if it were that, so a longer one only pushes the buttons down.
const CLASS_PANEL = { lowerH: 143, w: 165, headH: 14, pad: 4, gap: 4, listW: 55, rowH: 12, rowGap: 4, iconGap: 4, cardW: 100, ctaH: 15,
  statGap: 2, statRowH: 12, valueGap: 2, closeGap: 6, nameDy: 2.5, title: "#cbdbfc", trait: "#d9a066", name: "#9badb7",
  head: "#847e87", help: "#8f563b", choose: { bg: "#323c39", key: "#78c283" }, cancel: { bg: "#222034", key: "#d95763" } };
const CLASS_HELP = [
  "You're free to choose your class in the first 10 turns of the game.",
  "You can only choose one class per run.",
  "Each class has its own leaderboard.",
  "Each class has its own starting skill. The Pikeman's Thrust and Guard take turns: Swap skill (or Tab) shows Guard.",
  "HP: your health points, +5 each level up.",
  "ATK: makes your attacks and non-magic skills hit harder.",
  "DEF: makes you more resistant to ATK and MAG based hits.",
  "MAG: makes your magic skills hit harder.",
  "SPD: how fast you move relative to everything else.",
  "Each level up gives you +1 attribute.",
  "Every 3 levels you gain a random spell.",
];
// A class's look with its blue4 swapped for `ink` (the list's and the leaderboard's), made once
const tintedLooks = new Map();     // `${id} ${ink}` -> canvas
function tintedLook(id, ink) {
  const k = `${id} ${ink}`;
  if (!tintedLooks.has(k)) {
    const c = document.createElement("canvas"), g = c.getContext("2d");
    c.width = CW; c.height = CH;
    g.drawImage(tiles, SCENE.classes[id].right * CW, 0, CW, CH, 0, 0, CW, CH);
    const img = g.getImageData(0, 0, CW, CH), [r, gr, bl] = [1, 3, 5].map(i => parseInt(ink.slice(i, i + 2), 16));
    for (let i = 0; i < img.data.length; i += 4)
      if (!(img.data[i] === 255 && img.data[i + 1] === 255 && img.data[i + 2] === 255)) [img.data[i], img.data[i + 1], img.data[i + 2]] = [r, gr, bl];
    g.putImageData(img, 0, 0);
    tintedLooks.set(k, c);
  }
  return tintedLooks.get(k);
}
// The classes' panel's skill clips (the user's, 2026-10-26: a few seconds of a class's starting skill
// at work in place of its group's picture): assets/skill-clips/<class>.png, its frames `w` x `h` game
// px (the portrait's 60 tall, wider than it's ever drawn: its middle's shown), `cols` to a row, `fps` a
// second, `frames` of them, filmed from the game itself (tools/dos-age-clips: scenes.mjs SKILL_CLIPS,
// cut-skill.sh); a class with none, or one not loaded yet, shows its group's picture. All of them are
// asked for once the panel's first drawn (about 60 KB each), so stepping through the classes doesn't wait
const SKILL_CLIP = { w: 120, h: 60, cols: 8, fps: 30, frames: { fighter: 87, rogue: 108, brawler: 96, mage: 91, archer: 91, pikeman: 87, prodigy: 91, cleric: 96, drunkard: 91, dweorg: 82, siren: 87, shieldmaiden: 96 } };
const skillClips = new Map();
function skillClip(id) {
  if (!SKILL_CLIP.frames[id]) return null;
  if (!skillClips.has(id)) {
    const img = new Image(), clip = { img, frames: SKILL_CLIP.frames[id], ready: false };
    img.onload = () => { clip.ready = img.naturalWidth > 0; };
    img.src = `assets/skill-clips/${id}.png`;
    skillClips.set(id, clip);
  }
  const clip = skillClips.get(id);
  return clip.ready ? clip : null;
}
// A class's card at the scale it's drawn at, `inner` screen px wide inside its padding: its height
// (screen px), its skill's card, and its traits wrapped to the stats' box
function classCard(id, inner) {
  const B = CLASS_PANEL, { u, fs, px, lineH } = uiMetrics(), c = CLASSES[id];
  const box = itemBox(c.spell, { boxW: PANEL.cardW, desc: true });
  const traits = (c.traits ?? []).flatMap(t => wrap(t, B.trait, Math.floor((inner - px(2 * B.pad)) / u), fs / u));
  const statsH = px(2 * B.pad + 3 * B.statRowH + 2 * B.statGap) + (traits.length ? px(B.statGap) + traits.length * lineH : 0);
  return { box, traits, statsH, h: px(B.pad) + lineH + px(2 + B.gap) + statsH + px(B.gap) + box.h + px(B.pad) };
}
// (as the v0.13 sheet has it, "pick-a-class" 834:91326, see SHEET: the classes as boxes, each
// group's in a block of four, two blocks to a row, the rest of a block locked (a dim look and a red
// cross); the one picked framed green; under them, at the left, its name and group, its portrait
// (its group's picture) and its stats; at the right STARTING SKILL and its skill's card; then
// [Y] Choose and [N] Cancel)
// The classes' boxes in the panel, eight to a row: each group's classes, then locked ones (null),
// four to a block
function classSlots() {
  const ids = Object.keys(CLASSES);
  return Object.keys(CLASS_GROUPS).flatMap(g => { const of = ids.filter(k => CLASSES[k].group === g); return [...of, ...Array(Math.max(0, 4 - of.length)).fill(null)]; });
}

// The class picked after an arrow from class `i` (an index into CLASSES): left and right the box
// before or after it with a class in it, round the end; up and down the row above or below, round
// the top, the box under it or the nearest with a class in it (the user's, 2026-10-27: all four
// arrows, not up and down alone)
function classStep(i, dx, dy) {
  const ids = Object.keys(CLASSES), slots = classSlots(), n = slots.length, at = slots.indexOf(ids[i]);
  let to = at;
  if (dx) do to = (to + dx + n) % n; while (!slots[to]);
  else if (dy) {
    const rows = Math.ceil(n / 8), row = ((Math.floor(at / 8) + dy) % rows + rows) % rows, col = at % 8;
    const inRow = slots.map((k, j) => j).filter(j => Math.floor(j / 8) === row && slots[j]);
    if (inRow.length) to = inRow.reduce((b, j) => Math.abs(j % 8 - col) < Math.abs(b % 8 - col) ? j : b);
  }
  return ids.indexOf(slots[to]);
}

function drawClasses(measuring = false) {
  if (!picking) return;
  if (!measuring) fitUi(() => drawClasses(true));
  const B = CLASS_PANEL, S = SHEET.ink, ids = Object.keys(CLASSES), id = ids[picking.focus], c = CLASSES[id];
  const slots = classSlots();
  // (as Figma's pick-a-class has it, 834:91326: boxes 3 apart across and 2 down, 6 above and below)
  const boxW = () => uiMetrics().px(16), boxH = () => uiMetrics().px(18), gap = () => uiMetrics().px(3), rowGap = () => uiMetrics().px(2);
  const grid = { minW: () => 8 * (boxW() + gap()) + uiMetrics().px(8), h: () => 2 * boxH() + rowGap() + uiMetrics().px(12),
    draw: (x, y, w, hits) => {
      const { u, px } = uiMetrics(), rowW = 8 * boxW() + 7 * gap(), gx = x + Math.round((w - rowW) / 2), gy = y + px(6);
      slots.forEach((k, i) => {
        const bx = gx + (i % 8) * (boxW() + gap()), by = gy + Math.floor(i / 8) * (boxH() + rowGap()), on = k === id;
        ctx.fillStyle = S.bg; ctx.fillRect(bx, by, boxW(), boxH());
        sheetFrame(bx, by, boxW(), boxH(), on ? S.picked : S.line, px(1), true);
        const ix = bx + Math.round((boxW() - CW * u) / 2), iy = by + Math.round((boxH() - CH * u) / 2);
        if (k) {
          ctx.drawImage(tintedLook(k, CLASS_GROUPS[CLASSES[k].group].look), ix, iy, CW * u, CH * u);
          hits.rows[ids.indexOf(k)] = [bx, by, boxW(), boxH()];
        } else {                   // (locked: a dim look and a small red cross)
          ctx.globalAlpha = 0.22;
          ctx.drawImage(tintedLook(ids[0], S.bg), ix, iy, CW * u, CH * u);
          ctx.globalAlpha = 1;
          const n = 5, p = Math.max(1, Math.round(u)), cx = bx + boxW() - px(2) - n * p, cy = by + boxH() - px(2) - n * p;
          ctx.fillStyle = "#ac3232";
          for (let j = 0; j < n; j++) { ctx.fillRect(cx + j * p, cy + j * p, p, p); ctx.fillRect(cx + (n - 1 - j) * p, cy + j * p, p, p); }
        }
      });
    } };
  // the left: its name and group, its portrait and its stats
  // (its name 6 down and its group 17, in 27, as Figma has them; taller only for text that needs it)
  // (the name and the stats of class `k`: the column's as wide as the widest class's, so stepping
  // through them doesn't shift the panel)
  const nameOfClass = k => {
    const nameLine = sheet.lines([[[nameOf(CLASSES[k].name), S.text]]], "big"), groupLine = sheet.lines([[[nameOf(CLASS_GROUPS[CLASSES[k].group].name), S.label]]], "fs");
    return { minW: () => Math.max(nameLine.minW(), groupLine.minW()) + uiMetrics().px(12),
      h: w => Math.max(uiMetrics().px(27), uiMetrics().px(17 + 4) + groupLine.h(w - uiMetrics().px(12))),
      draw: (x, y, w, hits) => {
        const { px } = uiMetrics();
        nameLine.draw(x + px(6), y + px(6), w - px(12), hits);
        groupLine.draw(x + px(6), y + px(17), w - px(12), hits);
      } };
  };
  const name = nameOfClass(id);
  for (const k of ids) skillClip(k);   // (see SKILL_CLIP)
  const portrait = { minW: () => uiMetrics().px(78 + 4), h: () => uiMetrics().px(60 + 4),
    draw: (x, y, w) => {
      const { px, u } = uiMetrics(), pic = classPicture(c.group), pw = w - px(4), ph = px(60), clip = skillClip(id);
      ctx.fillStyle = S.bg; ctx.fillRect(x + px(2), y + px(2), pw, ph);
      ctx.imageSmoothingEnabled = false;
      if (clip) {                  // (its skill's clip, its middle as wide as the box takes, each pixel u screen px)
        const K = SKILL_CLIP, n = Math.floor(performance.now() * K.fps / 1000) % clip.frames, sw = Math.min(K.w, Math.floor(pw / u));
        ctx.drawImage(clip.img, (n % K.cols) * K.w + Math.floor((K.w - sw) / 2), Math.floor(n / K.cols) * K.h, sw, K.h,
          x + px(2) + Math.floor((pw - sw * u) / 2), y + px(2), sw * u, ph);
        return;
      }
      if (!pic) return;
      const sw = pic.width, sh = Math.round(sw * ph / pw);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(pic, 0, Math.round((pic.height - sh) / 2), sw, sh, x + px(2), y + px(2), pw, ph);
    } };
  const stat = (k, v) => ({ w: () => uiMetrics().px(CW + 2) + sheetW([[String(v)]]),
    draw: (x, y) => {
      const { u, px } = uiMetrics();
      ctx.drawImage(tiles, HUD.statIcons[k] * CW, 0, CW, CH, x, y, CW * u, CH * u);
      drawSans(ctx, [[String(v), S.text]], x + px(CW + 2), y + Math.round((px(CH) - sheetLineH()) / 2), sheetFont());
    } });
  const statLine = list => ({ minW: () => list.reduce((a, s) => a + s.w(), 0) + (list.length - 1) * uiMetrics().px(5), h: () => uiMetrics().px(CH),
    draw: (x, y) => { for (const s of list) { s.draw(x, y); x += s.w() + uiMetrics().px(5); } } });
  const statsOf = k => sheetParts.box([statLine([stat("hp", CLASSES[k].hp)]), statLine(["atk", "mag", "def", "spd"].map(s => stat(s, CLASSES[k].stats[s]))),
    ...(CLASSES[k].traits ?? []).map(t => sheet.text(t, B.trait, "fs"))], { pad: 6, gap: 5 });
  const stats = statsOf(id);
  const left = { minW: () => Math.max(portrait.minW(), ...ids.flatMap(k => [nameOfClass(k).minW(), statsOf(k).minW()])),
    h: w => name.h(w) + portrait.h() + stats.h(w) + 2 * uiMetrics().px(1),
    draw: (x, y, w, hits) => {
      const b = uiMetrics().px(1);
      name.draw(x, y, w, hits); y += name.h(w);
      ctx.fillStyle = S.line; ctx.fillRect(x, y, w, b); y += b;
      portrait.draw(x, y, w); y += portrait.h();
      ctx.fillStyle = S.line; ctx.fillRect(x, y, w, b); y += b;
      stats.draw(x, y, w, hits);
    } };
  // the right: STARTING SKILL, and its skill's card (as tall as the left, or as its card needs)
  // (a skill that `pairs` (the pikeman's Thrust): "Swap skill ⇄" at the column's bottom right, or Tab,
  // shows its partner's card instead, the user's place for it, 2026-10-25)
  const pair = pairOf(c.spell), shown = pair && picking.peek === id ? pair : c.spell;
  const cardH = () => itemBox(shown, { desc: true }).h, lowerH = w => Math.max(uiMetrics().px(B.lowerH), left.h(left.minW()), right.h());
  const head = sheet.lines([[[tl("STARTING SKILL"), S.label]]], "f");
  const right = { minW: () => Math.max(head.minW() + uiMetrics().px(8), ...ids.flatMap(k => [CLASSES[k].spell, pairOf(CLASSES[k].spell)]).filter(Boolean).map(k => itemBox(k, { desc: true }).w)),
    h: () => uiMetrics().px(12) + uiMetrics().px(1) + cardH() + (pair ? swapH() : 0),
    draw: (x, y, w, hits) => {
      const { px, u } = uiMetrics(), hh = px(12), ch = lowerH() - hh - px(1);
      head.draw(x + px(4), y + Math.round((hh - sheetLineH("f")) / 2), w);
      ctx.fillStyle = S.line; ctx.fillRect(x, y + hh, w, px(1));
      itemBox(shown, { desc: true }).draw(x, y + hh + px(1), w, ch);
      if (pair) {                  // (its caption, then ⇄, `pad` in from the bottom right)
        const on = picking.peek === id, cap = [[tl("Swap skill"), on ? S.helpOn : S.label]], gap = px(3), pad = px(4);
        const bw = sheetW(cap, "fs") + gap + px(5), bh = Math.max(px(5), sheetLineH("fs"));
        const bx = x + w - pad - bw, by = y + hh + px(1) + ch - pad - bh;
        sheetText(cap, bx, by + Math.round((bh - sheetLineH("fs")) / 2), "fs");
        drawPix(PIX.swap, bx + bw - px(5), by + Math.round((bh - px(5)) / 2), u, on ? S.helpOn : S.value);
        const hp = px(NOTICE.hitPad);
        hits.peek = [bx - hp, by - hp, bw + 2 * hp, bh + 2 * hp];
      }
    } };
  const swapH = () => Math.max(uiMetrics().px(5), sheetLineH("fs")) + uiMetrics().px(4);
  const spec = { title: "PICK A CLASS", w: SHEET.wideW, help: picking.help, helpText: CLASS_HELP, bottom: 1,
    parts: [grid, { ...sheetParts.across([left, right], 1, lowerH), h: lowerH, baseH: () => uiMetrics().px(CLASS_PANEL.lowerH) },
      sheetParts.cta([sheetButton("Y", "Choose", "go", { key: "choose" }), sheetButton("N", "Cancel", "stop", { key: "cancel" })], true, BAG_PANEL.sheet.ctaH)] };
  if (measuring) return drawSheet(spec, true);
  const hits = drawSheet(spec);
  picking.hits = { box: hits.box, rows: hits.rows, close: hits.close, help: hits.help, buttons: { choose: hits.choose, cancel: hits.cancel, ...(hits.peek ? { peek: hits.peek } : {}) } };
}
// What of the classes' panel is at a canvas point: a class's row (its index), "choose", "cancel",
// "close", "help", "box" for the rest of it, or null
// The skill a class's own one takes turns with (see PAIRED), if any
const pairOf = id => (SKILLS[id]?.pairs ? `${SKILLS[id].pairs}-${SKILLS[id].affix}` : null);
// The classes' panel's ⇄ (or Tab): the card shows the picked class's paired skill, or its own again
function peekPair() {
  const id = Object.keys(CLASSES)[picking.focus];
  if (pairOf(CLASSES[id].spell)) picking.peek = picking.peek === id ? null : id;
}
function classesTargetAt(px, py) {
  const h = picking?.hits;
  if (!h) return null;
  if (onRect(h.close, px, py)) return "close";
  if (onRect(h.help, px, py)) return "help";
  const button = Object.keys(h.buttons).find(k => onRect(h.buttons[k], px, py));
  if (button) return button;
  const i = h.rows.findIndex(r => onRect(r, px, py));
  return i >= 0 ? i : onRect(h.box, px, py) ? "box" : null;
}

// Picking cell c (Enter, Space, F or [S]wap, or a click or tap): with something being moved,
// it goes there; otherwise what's in c is picked, and, from the keyboard (`hold`), held to move
function pickBagCell(c, hold) {
  if (panel.moving !== null) {
    const from = panel.moving;
    panel.moving = null;
    if (from !== c) act("i", "move", from, c);
    followKey(from, c);
    return;
  }
  panel.focus = c;
  if (hold && cellItem(c)) panel.moving = c;
}
// A shortcut moved from key `from` to key `to` (swapping with what was there) stays picked there
function followKey(from, to) {
  const key = c => c >= KEY0 && c < BAG0;
  if (panel && key(from) && key(to) && cellItem(to)) panel.focus = to;
}
// The arrows move what's picked around the bag's cells, wrapping round: along GEARS, the keys or
// a row of the bag's slots, and between them to the nearest cell over or under
function movePanelFocus([dx, dy]) {
  const C = bagLayout().cols, rows = [[0, GEAR.length], [KEY0, SLOTS], ...Array.from({ length: Math.ceil(BAG_SIZE / C) }, (_, r) => [BAG0 + r * C, C])];
  const r = rows.findIndex(([first, n]) => panel.focus >= first && panel.focus < first + n), [first, n] = rows[r], i = panel.focus - first;
  if (dx) { panel.focus = first + (i + dx + n) % n; return; }
  const [to, m] = rows[(r + dy + rows.length) % rows.length];
  panel.focus = to + Math.min(m - 1, Math.floor((i + 0.5) * m / n));
}

// (a key pressed since the last step is `fresh`: let go of before it's been stepped for, it's
// still stepped, once, so a quick tap is never lost)
function press(id, dir) {
  if (held.some(h => h.id === id && !h.gone)) return;
  const now = clock();
  nextStep = held.length ? Math.min(nextStep, now + SETTLE_MS) : now + SETTLE_MS;
  held.push({ id, dir, fresh: true });
}
function release(id) {
  const i = held.findIndex(h => h.id === id && !h.gone);
  if (i < 0) return;
  if (held[i].fresh) held[i].gone = true;
  else held.splice(i, 1);
}
function tick(now) {
  if (!held.length || now < nextStep) return;
  const fresh = held.some(h => h.fresh), walking = now - lastStep < STEP_MS * 2.5;
  act("s", ...heldWay());
  for (let i = held.length - 1; i >= 0; i--) if (held[i].gone) held.splice(i, 1); else held[i].fresh = false;
  nextStep = now + (fresh && !walking ? STEP_MS * 2 : STEP_MS);
  lastStep = now;
}

const ZOOM_KEYS = { Equal: 1, NumpadAdd: 1, Minus: -1, NumpadSubtract: -1, Digit0: 0, Numpad0: 0 };

// With nothing open, Esc goes to the website (main.js), where it was last, and Z, X, C and V
// straight to its home, works, about and art market. preventDefault() tells main.js the key's
// been dealt with.
const LEAVE_KEYS = { Escape: null, KeyZ: "home", KeyX: "works", KeyC: "about", KeyV: "art-market" };
function leave(e) {
  if (GAME_ONLY && e.code === "Escape" && !e.repeat) { e.preventDefault(); openSettings(); return true; }   // (no website here: Esc's the settings, see SETTINGS)
  if (e.repeat || !(e.code in LEAVE_KEYS) || e.backspace) return false;   // (Backspace only ever closes things)
  e.preventDefault();
  onLeave(LEAVE_KEYS[e.code]);
  return true;
}

// Shortcuts with Cmd, Ctrl or Alt (Option) are the browser's (Cmd+S, Cmd+L, Cmd+R...), never the
// game's; and pressing or letting go of one stops walking, as on a Mac no key's ever let go of
// while Cmd's held, so the S of a Cmd+S would otherwise go on walking down for good
const MODIFIERS = ["MetaLeft", "MetaRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "OSLeft", "OSRight"];
// A key as the game reads it: `code` is the letter the keyboard's layout puts on it (so [Y]es is
// the Y wherever a QWERTZ, AZERTY or Colemak has it), as "KeyY", or, for anything but a latin
// letter (digits, Space, Enter, a Cyrillic letter...), where it is (its `code`); `pos` is always
// where it is, for walking and moving about (WASD, by place, is ZQSD on an AZERTY and WARS on a
// Colemak: under the left hand however it's labelled)
// Backspace is Esc as well (`backspace`), but for leaving the game: in full screen a browser keeps
// Esc for leaving it (all but Chrome and Edge in the game's own, see toggleFullscreen()), so
// there's always a key that closes what's open and leaves full screen alone (never while typing)
// The settings' use key (settings.js `use`) reads as F, and F then as nothing; `raw` is what it was
const keyOf = e => {
  const backspace = e.code === "Backspace" && !(document.activeElement instanceof HTMLInputElement);
  const raw = backspace ? "Escape" : /^[a-z]$/i.test(e.key) ? `Key${e.key.toUpperCase()}` : e.code;
  const code = settings.use === "KeyF" ? raw : raw === settings.use ? "KeyF" : raw === "KeyF" ? "" : raw;
  return { code, raw, pos: e.code, key: e.key, backspace,
    repeat: e.repeat, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, preventDefault: () => e.preventDefault() };
};
// Full screen, the game's own (O, on or off): whole page, website and all. In Chrome and Edge it
// keeps Esc for the game (the Keyboard Lock API: Esc held down still leaves full screen); other
// browsers take Esc back, so Backspace closes things there (see keyOf())
function toggleFullscreen() {
  const d = document, root = d.documentElement;
  if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen ?? d.webkitExitFullscreen)?.call(d)?.catch?.(() => {}); return; }
  const asked = (root.requestFullscreen ?? root.webkitRequestFullscreen)?.call(root);
  Promise.resolve(asked).then(() => navigator.keyboard?.lock?.(["Escape"])).catch(() => {});
}
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) navigator.keyboard?.unlock?.(); });
addEventListener("keydown", raw => {
  const e = keyOf(raw);
  if (MODIFIERS.includes(e.code) || e.metaKey || e.ctrlKey || e.altKey) { held.length = 0; return; }
  if (!active || chat) return;     // the website's up, or typing: the chat field has the keys
  if (e.code in ZOOM_KEYS) {       // (browser zoom, with Cmd or Ctrl, is left alone above)
    e.preventDefault();
    zoom(ZOOM_KEYS[e.code]);
    return;
  }
  if (e.code === "KeyM" && !e.repeat) { toggleMute(); return; }
  if (e.code === "KeyO" && !e.repeat) { e.preventDefault(); toggleFullscreen(); return; }
  if (setting) { settingsKey(e); return; }   // the settings, over everything, till they're closed
  if (watching && !ranking) { watchKey(e); return; }   // (watching a journey again: only its own keys)
  if (ranking) { rankingKey(e); return; }   // the leaderboard, till it's closed
  if (opening?.step === "title") { titleKey(e); return; }
  if (dead && !ranking) {          // only naming the score (see SCORE_NAME), the leaderboard, starting over from here, or leaving
    if (dead.hidden) { if (!e.repeat) dead.hidden = false; return; }   // (X hid the box: any key brings it back)
    if (!e.repeat && (e.code === "Slash" || e.code === "KeyH")) dead.help = !dead.help;
    else if (e.code === "Escape" && dead.help) dead.help = false;
    else if (dead.step === "name" && ["Enter", "NumpadEnter"].includes(e.code)) typeName();
    else if (!e.repeat && e.code === "KeyY" && dead.step === "name") submitName();
    else if (!e.repeat && e.code === "KeyR") startOver();   // (while the name's not being typed)
    else if (!e.repeat && e.code === "KeyD" && dead.buttons.full) openFullGame();
    else if (!e.repeat && e.code === "KeyG") openLeaderboard();
    else if (!e.repeat && e.code === "KeyS" && dead.step === "sent") shareScore();
    else leave(e);
    return;
  }
  if (lookout) {                   // up a tower: only coming back down
    if (DIRS[e.pos]) e.preventDefault();
    if (!e.repeat && (DIRS[e.pos] || ["Escape", "KeyF"].includes(e.code))) act("t");
    return;
  }
  if (talk?.bush) {                // the burning bush's gifts (see BUSH): 1-3 picks one, Esc puts it off
    const n = ["1", "2", "3"].indexOf(e.code.replace(/^(Digit|Numpad)/, ""));
    if (n >= 0 && !e.repeat) act("g", n);
    else if (e.code === "Escape") act("g", -1);
    return;
  }
  if (talk) {                      // and the priest's offer likewise
    if (e.code === "KeyY") act("y", true);
    else if (e.code === "KeyN" || e.code === "Escape") act("y", false);
    return;
  }
  if (notice) {                    // the pickup has the keys until it's answered (see PICKUP)
    const way = ARROWS[e.pos];
    if (way) { e.preventDefault(); pickPile(notice.pick + way[0] + way[1] * (notice.per ?? 1)); return; }
    if (e.repeat) return;
    if (e.code === "Escape" && notice.help) notice.help = false;
    else if (e.code === "Slash" || e.code === "KeyH") notice.help = !notice.help;
    else if (e.code === "KeyE") takeFound("equip");
    else if (e.code === "KeyT" || e.code === "KeyY") takeFound("take");
    else if (e.code === "KeyS" && canSwap()) act("w", notice.pick);
    else if (["KeyD", "KeyN", "Escape"].includes(e.code)) act("a", false, notice.pick);
    return;
  }
  if (inspecting) {                // a monster's panel until it's closed (Esc hides its help first)
    if (e.repeat) return;
    if (e.code === "Escape") inspecting.help ? (inspecting.help = false) : (inspecting = null);
    else if (e.code === "Slash" || e.code === "KeyH") inspecting.help = !inspecting.help;
    return;
  }
  if (panel) {                     // and the bag until it's closed (see BAG_PANEL)
    if (ARROWS[e.pos]) { e.preventDefault(); if (!panel.drag) movePanelFocus(ARROWS[e.pos]); return; }
    if (e.repeat || panel.drag) return;
    const n = e.code.match(/^(?:Digit|Numpad)([1-8])$/), buttons = bagButtons();
    if (e.code === "Escape") panel.help ? (panel.help = false) : panel.moving !== null ? (panel.moving = null) : act("x");
    else if (PANEL_KEYS.includes(e.code)) act("x");
    else if (e.code === "KeyH" || e.key === "?") panel.help = !panel.help;
    else if (panel.smith) { if (["KeyU", "Enter", "NumpadEnter", "Space", "KeyF"].includes(e.code) && buttons.smith[1]) act("u", panel.focus); }
    else if (panel.swap) {         // (the class's own spell can't be left: it says so)
      if (["KeyS", "Enter", "NumpadEnter", "Space", "KeyF"].includes(e.code))
        buttons.swap[1] ? act("i", "leave", panel.focus) : classBound(cellItem(panel.focus)) && cantLeave(cellItem(panel.focus));
    }
    else if (["KeyS", "Enter", "NumpadEnter", "Space", "KeyF"].includes(e.code)) pickBagCell(panel.focus, true);
    else if (n && cellItem(panel.focus)) act("i", "move", panel.focus, KEY0 + (n[1] - 1));
    else if (e.code === "KeyD" && buttons.drop[1]) act("i", "drop", panel.focus);
    else if (e.code === "KeyU" && buttons.use[1] && !ITEMS[cellItem(panel.focus)]?.slot) act("i", "use", panel.focus);
    else if (e.code === "KeyE" && buttons.use[1] && ITEMS[cellItem(panel.focus)]?.slot) act("i", "equip", panel.focus);
    else if (e.code === "KeyG" && !phone && buttons.best[1]) act("i", "best");
    else if (e.code === "KeyT" && !phone && buttons.sort[1]) act("i", "sort");
    return;
  }
  if (picking) {                   // the classes' panel: pick one, or close it (see CLASS_PANEL)
    if (DIRS[e.pos]) {
      e.preventDefault();
      picking.focus = classStep(picking.focus, ...DIRS[e.pos]);
      return;
    }
    if (e.repeat) return;
    if (e.code === "Escape" && picking.help) picking.help = false;
    else if (["KeyY", "Enter", "NumpadEnter", "Space", "KeyF"].includes(e.code)) chooseClass();
    else if (["Escape", "KeyN", "KeyP"].includes(e.code)) closeClasses();
    else if (e.code === "KeyH" || e.key === "?") picking.help = !picking.help;
    else if (e.code === "Tab") { e.preventDefault(); peekPair(); }   // (not S: that's down, see DIRS)
    return;
  }
  if (leveling) {                  // levelling up: pick a stat or a spell, or pass on the spell
    if (e.repeat) return;
    const n = e.code.match(/^(?:Digit|Numpad)([1-4])$/), picks = levelCards() - (leveling.step === "spell" ? 1 : 0);
    if (leveling.ignoring) {       // the Yes/No question over it
      if (["KeyY", "Enter", "NumpadEnter", "Space", "KeyF"].includes(e.code)) answerIgnore(true);
      else if (["KeyN", "Escape", "KeyP"].includes(e.code)) answerIgnore(false);
      return;
    }
    // (a key that moves picks before it's a letter: with HJKL, H and L go left and right, not help
    // and Learn, a player's report, 2026-10-29; Learn's key is F then, see learnKey())
    const way = DIRS[e.pos] && (e.code.startsWith("Arrow") || moveKeys().includes(e.code)) ? DIRS[e.pos] : null;
    if (e.code === "Escape" && leveling.help) leveling.help = false;
    else if (way) { e.preventDefault(); leveling.focus = (leveling.focus + (way[0] || way[1]) + picks) % picks; }
    else if (e.code === "KeyH" || e.key === "?") leveling.help = !leveling.help;
    else if (n) { if (n[1] <= picks) act("L", n[1] - 1); }
    else if (["Enter", "NumpadEnter", "Space", "KeyF"].includes(e.code) || (e.code === (leveling.step === "spell" ? `Key${learnKey()}` : "KeyY"))) act("L", leveling.focus);
    else if (e.code === "KeyP" && leveling.step === "spell") { leveling.help = false; leveling.ignoring = true; }
    return;
  }
  if (aiming) {                    // aiming a spell: move the target, cast it or call it off
    const { slot, x, y } = aiming, n = e.code.match(/^(?:Digit|Numpad)([1-8])$/);
    if (DIRS[e.pos]) { e.preventDefault(); aimAt(x + DIRS[e.pos][0], y + DIRS[e.pos][1]); }
    else if (e.repeat) return;
    else if (e.code === "Escape") act("A");
    else if (["Enter", "NumpadEnter", "Space", "KeyF"].includes(e.code) || n?.[1] - 1 === slot) {
      e.preventDefault();
      act("A");
      act("c", slot, [x, y]);
    }
    return;
  }
  if (DIRS[e.pos]) { e.preventDefault(); press(e.pos, DIRS[e.pos]); return; }   // (walking first: on an AZERTY, Z and Q are its W and A)
  if ((e.code === "Enter" || e.code === "NumpadEnter") && !e.repeat) { e.preventDefault(); openChat(); return; }
  if (["KeyQ", "KeyE"].includes(e.code) && !e.repeat) { act("o"); return; }
  if (e.code === "Escape" && logHelp) { logHelp = false; return; }
  if (e.code === "Escape" && logOpen) { toggleLog(); return; }
  if (e.code === "KeyG" && !e.repeat) { openLeaderboard(); return; }
  if (leave(e)) return;
  if (PANEL_KEYS.includes(e.code) && !e.repeat) { act("o"); return; }
  if (e.code === "KeyF" && !e.repeat) { act("f"); return; }
  const slot = e.code.match(/^(?:Digit|Numpad)([1-8])$/);
  if (slot) { if (!e.repeat) act("c", slot[1] - 1); return; }
});
addEventListener("keyup", e => { if (MODIFIERS.includes(e.code)) held.length = 0; else release(e.code); });
// Leaving the page (another app, another tab, the phone locked) stops walking, and forgets the
// fingers that were down: their lifting is never heard, and one still counted would make the
// next tap a pinch, so the character couldn't walk again
function letGo() {
  held.length = 0;
  touches.clear();
}
addEventListener("blur", letGo);
addEventListener("pagehide", letGo);
document.addEventListener("visibilitychange", () => { if (document.hidden) letGo(); else placeHud(); });

// Scroll wheel and trackpad pinch (a wheel event with ctrlKey) zoom the world.
let wheelAcc = 0;
canvas.addEventListener("wheel", e => {
  e.preventDefault();
  if (ranking || setting) return;  // (nothing to scroll on the leaderboard or the settings)
  const dpr = pixelRatio;
  if (onRect(logBox, e.offsetX * dpr, e.offsetY * dpr)) { scrollLog(-Math.sign(e.deltaY) * 3); return; }   // (and the log, over it)
  wheelAcc += e.deltaY * (e.ctrlKey ? 4 : 1); // pinch deltas are small
  if (Math.abs(wheelAcc) >= 100) { zoom(wheelAcc < 0 ? 1 : -1); wheelAcc = 0; }
}, { passive: false });

// Touch pinch: two fingers zoom a notch per 25% change in their distance.
const touches = new Map();
let pinchDist = 0;
const spread = () => { const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
canvas.addEventListener("pointermove", e => {
  if (logDrag?.id === e.pointerId) {       // and the log, a line a line's height dragged
    const lineH = SCENE.font.h * logFont();
    const dy = e.offsetY * pixelRatio - logDrag.y;
    if (Math.abs(dy) >= lineH / 2) logDrag.moved = true;
    logScroll = Math.max(0, logDrag.scroll + Math.round(dy / lineH));
  }
  if (!touches.has(e.pointerId)) return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size !== 2) return;
  const ratio = spread() / pinchDist;
  if (ratio > 1.25 || ratio < 0.8) { zoom(ratio > 1 ? 1 : -1); pinchDist = spread(); }
});

// What of the pickup is at a canvas point, if anything: a button's name ("equip", "take", "drop",
// "help", "close"; only one that can be pressed), or a pile's slot, by its number
function noticeButtonAt(px, py) {
  const button = Object.keys(notice?.buttons || {}).find(k => onRect(notice.buttons[k], px, py));
  if (button) return button;
  const i = (notice?.slots ?? []).findIndex(r => r && onRect(r, px, py));
  return i >= 0 ? i : undefined;
}
// The pickup's answer for its "equip" or "take" button (or E, T, Y, S): with the bag full, the bag
// comes up to leave something for it instead
function takeFound(how) {
  if (!pickupButtons()[how === "equip" ? "equip" : "take"][1]) return;
  if (noRoom(notice.item)) act("w", notice.pick);
  else act("a", how === "equip" ? "equip" : true, notice.pick);
}

// What of the bag is at a canvas point, if anything: a cell's number (see KEY0), a button's
// name ("drop", "swap", "use"), "close", "help", or "box" for the rest of it
function panelTargetAt(px, py) {
  const h = panel?.hits;
  if (!h) return null;
  const inside = r => !!r && px >= r[0] && px < r[0] + r[2] && py >= r[1] && py < r[1] + r[3];
  if (inside(h.close)) return "close";
  if (inside(h.help)) return "help";
  const button = Object.keys(h.buttons).find(k => inside(h.buttons[k]));
  if (button) return button;
  const c = h.cells.findIndex(inside);
  return c >= 0 ? c : inside(h.box) ? "box" : null;
}

// The monster at a canvas point, if it's drawn there (in sight, or with the fog lifted)
function foeAtPoint(px, py) {
  const s = foeAt(Math.floor((px - originX) / (CW * scale)), Math.floor((py - originY) / (CH * scale)));
  return s && skeletonAtlas(s, visualPos(clock(), s, s.anim)) ? s : null;
}
const onMonsterClose = (px, py) => {
  const [x, y, w, h] = inspecting?.close || [0, 0, 0, 0];
  return px >= x && px < x + w && py >= y && py < y + h;
};

// Whether a canvas point is on the [F] prompt or on the thing it's for (on a phone, tapping
// either picks it up)
function onPrompt(px, py) {
  const target = unreadNote()?.at ?? interactTarget() ?? bushTarget()?.bush.foot ?? towerTarget()?.at ?? shrineTarget()?.at ?? graveTarget()?.at ?? noteTarget()?.at;
  if (!target) return false;
  const [x, y, w, h] = promptRect || [0, 0, 0, 0];
  if (px >= x && px < x + w && py >= y && py < y + h) return true;
  return Math.floor((px - originX) / (CW * scale)) === target[0] && Math.floor((py - originY) / (CH * scale)) === target[1];
}

// Hovering: the button under the mouse (never a finger: there's no hovering one) is lit, a
// `light` wash over where it's pressed, on whatever screen is up (as the pointing hand has it,
// below), and so is a class's row in the classes' panel (but the one picked). Things picked
// rather than pressed (the bag's cells, the levelling up's cards, the leaderboard's places)
// show it as they're framed instead.
const HOVER = { light: "rgba(203, 219, 252, 0.18)" };
let mouseAt = null;                // [x, y] (canvas px) while the mouse is over the canvas
function hoverRect() {
  if (!mouseAt || tapping || opening?.step === "title") return null;
  const [px, py] = mouseAt, on = rects => Object.values(rects || {}).find(r => onRect(r, px, py)) ?? null;
  if (ranking) {
    const h = ranking.hits;
    return h && ([h.close, h.help, h.left, h.right, ...h.boards, ...h.tabs, ...h.pages].find(r => r && onRect(r, px, py)) ?? null);
  }
  if (watching) return on(watchButtons) ?? (dead ? on(dead.buttons) : null);
  if (dead) { const b = deadButtonAt(px, py); return b && b !== "name" ? dead.buttons[b] : null; }
  if (talk) return on(talk.buttons);
  if (notice) return on(notice.buttons);
  if (inspecting) return [inspecting.close, inspecting.hits?.help].find(r => onRect(r, px, py)) ?? null;
  if (panel) {
    const h = panel.hits, t = panelTargetAt(px, py);
    if (!h || panel.drag?.on) return null;
    return t === "close" || t === "help" ? h[t] : h.buttons[t] && bagButtons()[t]?.[1] ? h.buttons[t] : null;
  }
  if (leveling) return null;
  if (picking) {
    const h = picking.hits, t = classesTargetAt(px, py);
    if (!h) return null;
    if (Number.isInteger(t)) return t === picking.focus ? null : h.rows[t];   // (a class's row, but not the one picked)
    return t === "close" || t === "help" ? h[t] : h.buttons?.[t] ?? null;
  }
  if (aiming) return null;
  for (const r of [hudBag, ...Object.values(logButtons)]) if (onRect(r, px, py)) return r;
  const k = hudShortcutAt(px, py);
  if (k >= 0 && shortcuts[k]) {
    const u = hudScale;
    return [hudX + hudSlotX(k) * u, hudY, HUD_V13.box[0] * u, HUD_V13.box[1] * u];
  }
  return null;
}
function drawHover() {
  let r = hoverRect();
  if (r && Array.isArray(r[0])) r = r.find(q => onRect(q, ...mouseAt));   // (one of a list's, see onRect())
  if (!r) return;
  ctx.fillStyle = HOVER.light;
  ctx.fillRect(...r.map(Math.round));
}
canvas.addEventListener("pointermove", e => {
  const dpr = pixelRatio;
  mouseAt = e.pointerType === "mouse" ? [e.offsetX * dpr, e.offsetY * dpr] : null;
});
canvas.addEventListener("pointerleave", () => { mouseAt = null; });

// A pointing hand over the notice's answers, the panel's items and "Esc X", the HUD's
// bag, buffs and the shortcuts with a skill in them, the [F] prompt and
// what it's for, and the monsters in sight
canvas.addEventListener("pointermove", e => {
  const dpr = pixelRatio, px = e.offsetX * dpr, py = e.offsetY * dpr;
  if (e.pointerType === "mouse") {   // a tool's or a buff's tooltip while the mouse is over its slot
    const free = !notice && !talk && !panel && !leveling && !picking && !ranking && !setting && !inspecting && !dead && !opening;
    const does = free && hudToolAt(px, py), effect = free ? hudBuffAt(px, py) : -1;
    if (does) tooltip = { does, until: Infinity };
    else if (effect >= 0) tooltip = { effect, until: Infinity };
    else if (tooltip?.until === Infinity) tooltip = null;
  }
  if (setting?.langOpen) {         // (the language list: the one under the mouse is the one the arrows are on)
    const i = (setting.langRows ?? []).findIndex(r => onRect(r, px, py));
    if (e.pointerType === "mouse" && i >= 0) setting.langOpen.focus = i;
    canvas.style.cursor = i >= 0 ? "pointer" : "";
    return;
  }
  if (setting) {                   // the settings: the row under the mouse is picked, a hand over what can be pressed
    const h = setting.hits, row = (h?.rows ?? []).findIndex(r => onRect(r, px, py));
    if (e.pointerType === "mouse" && row >= 0 && !setting.ask) setting.focus = row;
    const live = !h || !onRect(h.box, px, py) || [h.close, h.help, ...h.controls.map(([r]) => r)].some(r => r && onRect(r, px, py));
    canvas.style.cursor = live ? "pointer" : "";
    return;
  }
  if (aiming && !watching) {       // the target follows the mouse
    if (!inHud(px, py) && e.pointerType === "mouse") aimAt(...cellFromPlayer(px, py));
    canvas.style.cursor = inHud(px, py) ? "" : "crosshair";
    return;
  }
  if (opening?.step === "title" && titleLangOpen()) {   // (the language list: the one under the mouse is the one the arrows are on)
    const at = titleLangAt(px, py);
    if (e.pointerType === "mouse" && Number.isInteger(at)) focusTitleLang(at);
    canvas.style.cursor = at !== null ? "pointer" : "";
    return;
  }
  if (opening?.step === "title") {   // (hovering picks a card, bringing its look in)
    if (titleLangAt(px, py) === "pill") { canvas.style.cursor = "pointer"; return; }
    const i = titleRowAt(px, py), link = titleLinkAt(px, py);
    if (e.pointerType === "mouse" && i >= 0 && i !== titleFocus()) focusTitle(i, clock());
    hoverTitleLink(e.pointerType === "mouse" ? link : null);   // (the credit's names light up, see TITLE.foot)
    canvas.style.cursor = i >= 0 || link ? "pointer" : "";
    return;
  }
  const target = panelTargetAt(px, py);
  if (ranking && e.pointerType === "mouse" && rankRowAt(px, py) >= 0) ranking.focus = rankRowAt(px, py);   // (hovering frames a place)
  const h = ranking?.hits, live = ranking ? !h || !onRect(h.box, px, py) || [h.close, h.help, h.left, h.right, ...h.tabs].some(r => r && onRect(r, px, py))
      || (canWatch() && rankPlayAt(px, py) >= 0)
    : watching ? watchButtonAt(px, py) ?? (dead && deadButtonAt(px, py))
    : dead ? deadButtonAt(px, py) : talk ? talkButtonAt(px, py) : notice ? noticeButtonAt(px, py) !== undefined
    : inspecting ? onMonsterClose(px, py) || onRect(inspecting.hits?.help, px, py) || foeAtPoint(px, py)
    : panel ? ["close", "help"].includes(target) || (typeof target === "string" && target !== "box" && bagButtons()[target]?.[1]) ||
      (Number.isInteger(target) && (!!cellItem(target) || panel.moving !== null || !!panel.drag?.on))
    : leveling ? !!levelTargetAt(px, py)
    : picking ? !["box", null].includes(classesTargetAt(px, py))
    : hudSlotAt(px, py) || hudToolAt(px, py) || hudBuffAt(px, py) >= 0 || shortcuts[hudShortcutAt(px, py)] || logButtonAt(px, py) ||
      onPrompt(px, py) || foeAtPoint(px, py) || (!lookout && onSelf(px, py));
  canvas.style.cursor = live === "name" ? "text" : live ? "pointer" : "";   // (an I-beam over the name's box)
  if (watching || ranking) return;
  if (leveling && !tapping && Number.isInteger(levelTargetAt(px, py)?.i)) leveling.focus = levelTargetAt(px, py).i;
  if (panel) {                     // (what's under the pointer, as something's dragged over it)
    panel.hover = Number.isInteger(target) ? target : null;
    const d = panel.drag;
    if (d?.id === e.pointerId) {
      Object.assign(d, { x: px, y: py });
      if (Math.hypot(px - d.x0, py - d.y0) >= Math.round(BAG_PANEL.dragPx * uiU)) d.on = true;
    }
  }
});

// Pointer: walk toward wherever you press, relative to the character.
canvas.addEventListener("pointerdown", e => {
  tapping = e.pointerType !== "mouse";
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { canvas.setPointerCapture(e.pointerId); } catch {}   // so every finger's pointerup reaches us (never the end of the press if it can't)
  if (touches.size === 2) { release("pointer"); pinchDist = spread(); return; } // pinch, not walk
  if (touches.size > 2) return;
  const dpr = pixelRatio;
  const px = e.offsetX * dpr, py = e.offsetY * dpr;
  if (setting) { settingsPress(px, py); return; }   // the settings (see settingsPress())
  if (watching && !ranking) {      // watching a journey again: only its buttons, and the game-over box's
    const own = watchButtonAt(px, py), b = own ?? (dead ? deadButtonAt(px, py) : undefined);
    if (b && b !== "pause" && b !== "speed") click();   // (those two the tape deck's own, see tape())
    watching.help = b === "help" && !watching.help;
    if (own === "start") watchAgain();
    else if (b === "pause") pauseWatching();
    else if (b === "speed") nextSpeed();
    else if (b === "play" || b === "start" || b === "close") startOver();
    else if (b === "board") openLeaderboard();
    return;
  }
  if (ranking) { rankingPress(e, px, py); return; }   // the leaderboard (see rankingPress())
  if (opening?.step === "title") {   // a card's picked; a name in the credit opens as it's let go (see pointerup)
    const at = titleLangAt(px, py);   // (the language's pill opens its list; a language in it is picked, anywhere else shuts it)
    if (at === "pill") { click(); toggleTitleLang(); return; }
    if (titleLangOpen()) { if (Number.isInteger(at)) { click(); pickTitleLang(at); } else toggleTitleLang(); return; }
    const i = titleRowAt(px, py);
    if (i >= 0 || titleLinkAt(px, py)) click();
    if (i === 3) { focusTitle(i, clock()); linkPress = { id: e.pointerId, row: i }; }   // (the about page's a new tab: on the letting go too)
    else if (i >= 0) pickTitle(i);
    else if (titleLinkAt(px, py)) linkPress = { id: e.pointerId, url: titleLinkAt(px, py) };
    return;
  }
  if (dead && !ranking) {          // dead: only the game-over box's name and buttons (see GAME_OVER)
    if (dead.hidden) { dead.hidden = false; return; }   // (X hid the box: a press brings it back)
    const b = deadButtonAt(px, py), help = dead.help;
    if (b) { e.preventDefault(); click(); }     // (so the press doesn't take the focus straight back off the name)
    dead.help = b === "help" && !help;
    if (b === "help" || help) return;   // (a press anywhere hides the help)
    if (b === "close") Object.assign(dead, { hidden: true, buttons: {} });
    else if (b === "submit") submitName();
    else if (b === "start") startOver();
    else if (b === "full") openFullGame();
    else if (b === "name") typeName(true);
    else if (b === "board") openLeaderboard();
    else if (b === "share") sharePress = e.pointerId;   // (shared as it's let go: see below)
    return;
  }
  if (lookout) { act("t"); return; }   // up a tower: a tap anywhere comes back down
  if (talk) {                      // nor while the priest's offer is
    const b = talkButtonAt(px, py);
    if (b) click();
    if (b && talk.bush) act("g", Number(b.slice(1)));
    else if (b) act("y", b === "yes");
    return;
  }
  if (notice) {                    // no walking while the pickup is up, only answering it (see PICKUP)
    const b = noticeButtonAt(px, py), help = notice.help;
    if (b !== null && b !== undefined && b !== "box") click();
    notice.help = b === "help" && !help;
    if (b === "help" || help) return;   // (a press anywhere hides the help)
    if (Number.isInteger(b)) pickPile(b);
    else if (b === "equip" || b === "take") takeFound(b);
    else if (b === "swap") act("w", notice.pick);
    else if (b === "drop" || b === "close") act("a", false, notice.pick);
    return;
  }
  if (inspecting) {                // a monster's panel: "?" its help, another monster shows that one, anything else closes it
    const onHelp = onRect(inspecting.hits?.help, px, py), help = inspecting.help;
    if (onHelp || onMonsterClose(px, py)) click();
    inspecting.help = onHelp && !help;
    if (onHelp || help) return;    // (a press anywhere hides the help)
    const s = foeAtPoint(px, py);
    inspecting = s && s !== inspecting.foe ? { foe: s } : null;
    return;
  }
  if (panel) {                     // nor while the bag is up (see BAG_PANEL)
    if (panel.drag) return;        // (one finger at a time)
    const target = panelTargetAt(px, py), buttons = bagButtons(), help = panel.help;
    if (target !== null && target !== "box" && (typeof target !== "string" || target === "help" || target === "close" || buttons[target]?.[1])) click();
    panel.help = target === "help" && !help;
    if (target === "help" || help) return;   // (a press anywhere hides the help)
    if (target === null) panel.moving !== null ? (panel.moving = null) : act("x");
    else if (target === "close") act("x");
    else if (Number.isInteger(target)) {
      if (panel.swap || panel.smith) { panel.focus = target; return; }
      const moving = panel.moving !== null;
      pickBagCell(target);
      if (!moving && cellItem(target)) panel.drag = { id: e.pointerId, from: target, x0: px, y0: py, x: px, y: py, on: false };
    } else if (panel.swap && target === "swap" && classBound(cellItem(panel.focus))) cantLeave(cellItem(panel.focus));
    else if (target !== "box" && buttons[target]?.[1]) {
      if (panel.smith) act("u", panel.focus);
      else if (panel.swap) act("i", "leave", panel.focus);
      else if (target === "swap") pickBagCell(panel.focus, true);
      else if (target === "best" || target === "sort") act("i", target);
      else act("i", target === "use" && ITEMS[cellItem(panel.focus)]?.slot ? "equip" : target, panel.focus);
    }
    return;
  }
  if (leveling) { pressLevel(px, py); return; }   // levelling up: only its panel
  if (picking) {                   // the classes' panel: pick one, take it, or close it
    const target = classesTargetAt(px, py), help = picking.help;
    if (target !== null && target !== undefined && target !== "box") click();
    picking.help = target === "help" && !help;
    if (target === "help" || help) return;   // (a press anywhere hides the help)
    if (Number.isInteger(target)) picking.focus = target;
    else if (target === "peek") peekPair();
    else if (target === "choose") chooseClass();
    else if (target !== "box") closeClasses();
    return;
  }
  if (aiming) {                    // aiming: cast it at the cell pressed, or call it off on the HUD
    const { slot } = aiming;
    if (inHud(px, py)) return act("A");
    aimAt(...cellFromPlayer(px, py));
    const { x, y } = aiming;
    act("A");
    act("c", slot, [x, y]);
    return;
  }
  const logButton = logButtonAt(px, py);
  if (logButton) click();
  if (chat && keepsTyping(logButton)) keepTyping = performance.now() + 1000;
  if (logButton === "log" || logButton === "chatView") { logShows[logButton === "log" ? "log" : "chat"] ^= true; logScroll = 0; return; }
  if (logButton === "chat") { e.preventDefault(); chat ? sendChat() : openChat(); return; }
  if (logButton === "help") { logHelp = !logHelp; return; }
  if (logButton === "close") { if (chat) closeChat(); if (logOpen) toggleLog(); return; }
  if (onRect(logBox, px, py)) { logDrag = { id: e.pointerId, y: py, scroll: logScroll, moved: false }; return; }   // (never walks; a press that doesn't drag opens it)
  if (inHud(px, py)) {             // pressing the HUD never walks; its bag opens the bag, a buff says what it is, a shortcut casts
    const slot = hudSlotAt(px, py), does = hudToolAt(px, py), effect = hudBuffAt(px, py);
    if (does || effect >= 0 || slot || hudShortcutAt(px, py) >= 0) click();
    if (does) tooltip = { does, until: clock() + TOOLTIP.ms };
    else if (effect >= 0) tooltip = { effect, until: clock() + TOOLTIP.ms };
    else if (slot) act("o");
    else act("c", hudShortcutAt(px, py));
    return;
  }
  const dpadWay = dpadShown() ? dpadWayAt(px, py) : null;
  if (dpadWay !== null) {          // the d-pad (see DPAD): never what's under it
    dpadPointer = e.pointerId;
    if (dpadWay) press("pointer", DPAD_WAYS[dpadWay]);
    return;
  }
  if (onPrompt(px, py)) { click(); act("f"); return; }
  const foe = foeAtPoint(px, py);
  if (foe) { release("pointer"); held.length = 0; inspecting = { foe }; return; }
  if (onSelf(px, py) && !lookout) { selfPress = e.pointerId; return; }   // (a thought, if it's let go there: see THOUGHTS)
  walker = e.pointerId;
  press("pointer", pointerWay(px, py));
});
// Whether a canvas point is on the character's own cell
const onSelf = (px, py) => Math.abs(px - (originX + (player.x + 0.5) * CW * scale)) < CW * scale / 2 &&
  Math.abs(py - (originY + (player.y + 0.5) * CH * scale)) < CH * scale / 2;
// A press on the character: let go on them, a thought (think()); slid off them, it walks that way, as any press does
let selfPress = null;
canvas.addEventListener("pointermove", e => {
  if (e.pointerId !== selfPress) return;
  const dpr = pixelRatio, px = e.offsetX * dpr, py = e.offsetY * dpr;
  if (onSelf(px, py)) return;
  selfPress = null;
  walker = e.pointerId;
  press("pointer", pointerWay(px, py));
});
canvas.addEventListener("pointerup", e => {
  if (e.pointerId !== selfPress) return;
  selfPress = null;
  if (onSelf(e.offsetX * pixelRatio, e.offsetY * pixelRatio) && !dead) think();
});
canvas.addEventListener("pointercancel", e => { if (e.pointerId === selfPress) selfPress = null; });
// Which way a press at (px, py) walks: four ways, by the quarter it's in round the character
function pointerWay(px, py) {
  const dx = px - (originX + (player.x + 0.5) * CW * scale), dy = py - (originY + (player.y + 0.5) * CH * scale);
  return Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
}
// The d-pad (the settings' D-PAD, on a touch screen; the user's pick of four, "fog disc", 2026-10-25):
// a disc `size` of the HUD's px across, dithered dark2 like the fog with a blue1 rim, the game's
// arrow glyphs in blue2 at its four quarters, `up` px over the HUD (and the log, see dpadRect()) on
// the side picked, `side` px in. A press on it walks the way of the quarter it's in, as a press on the world does (held, it
// walks on, and slid round it, it steers, even off it); the one walked lights up, its arrow pale.
// Pressing its very middle (`hub` px round it) walks nowhere. Hidden with anything open over the game.
const DPAD = { size: 47, up: 6, side: 6, hub: 3, rim: "#3f3f74", dots: "rgba(34, 32, 52, 0.9)", arrow: "#639bff", lit: "#cbdbfc",
  arrows: { up: ["...#...", "..###..", ".#.#.#.", "...#...", "...#...", "...#...", "...#..."],
    down: ["...#...", "...#...", "...#...", "...#...", ".#.#.#.", "..###..", "...#..."],
    left: ["..#....", ".#.....", "######.", ".#.....", "..#...."], right: ["....#..", ".....#.", ".######", ".....#.", "....#.."] } };
const DPAD_WAYS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const dpadLooks = new Map();       // the way lit ("" none) -> the disc, drawn when first needed
function dpadLook(lit) {
  if (dpadLooks.has(lit)) return dpadLooks.get(lit);
  const n = DPAD.size, c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d"), mid = (n - 1) / 2, r = n / 2, dot = (x, y, ink) => { g.fillStyle = ink; g.fillRect(x, y, 1, 1); };
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const dx = x - mid, dy = y - mid, d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      const way = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      if (d2 > (r - 1.2) ** 2) dot(x, y, DPAD.rim);
      else if ((x + y) % 2 === 0) dot(x, y, way === lit ? DPAD.rim : DPAD.dots);
    }
  const third = (n + 1) / 3;       // (each arrow in the middle of its third of the disc)
  for (const [way, rows] of Object.entries(DPAD.arrows)) {
    const [wx, wy] = DPAD_WAYS[way], cx = mid + wx * third, cy = mid + wy * third;
    rows.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch === "#") dot(Math.round(cx - (row.length - 1) / 2) + i, Math.round(cy - (rows.length - 1) / 2) + j, way === lit ? DPAD.lit : DPAD.arrow);
    }));
  }
  dpadLooks.set(lit, c);
  return c;
}
const dpadShown = () => settings.dpad && tapping && active && !opening && !dead && !watching && !chat && !logOpen && !notice && !talk && !panel &&
  !leveling && !picking && !inspecting && !ranking && !setting && !aiming && !lookout;
// Where it is on the canvas: its middle and its radius, in screen px (over the log and its
// buttons too, where they'd be under it)
function dpadRect() {
  const u = hudScale, r = DPAD.size * u / 2, gap = DPAD.side * u + gutter, x = settings.dpadSide === "left" ? gap + r : canvas.width - gap - r;
  const under = [logBox, ...Object.values(logButtons)].filter(b => b && b[0] < x + r && b[0] + b[2] > x - r);
  return { x, y: Math.min(hudY, ...under.map(b => b[1])) - DPAD.up * u - r, r };
}
let dpadPointer = null;            // the pointer pressing it
// The way a point walks by the d-pad: null off it (`far`, how far off still counts), "" in its middle
function dpadWayAt(px, py, far = 1) {
  const { x, y, r } = dpadRect(), dx = px - x, dy = py - y;
  if (Math.hypot(dx, dy) > r * far) return null;
  if (Math.hypot(dx, dy) < DPAD.hub * hudScale) return "";
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
}
function drawDpad() {
  if (!dpadShown()) return;
  const h = dpadPointer !== null && held.find(h => h.id === "pointer" && !h.gone);
  const lit = h ? Object.keys(DPAD_WAYS).find(w => DPAD_WAYS[w][0] === h.dir[0] && DPAD_WAYS[w][1] === h.dir[1]) ?? "" : "";
  const { x, y, r } = dpadRect();
  ctx.drawImage(dpadLook(lit), Math.round(x - r), Math.round(y - r), 2 * r, 2 * r);
}
canvas.addEventListener("pointermove", e => {
  if (e.pointerId !== dpadPointer) return;
  const way = dpadWayAt(e.offsetX * pixelRatio, e.offsetY * pixelRatio, Infinity);
  const h = held.find(h => h.id === "pointer" && !h.gone);
  if (way && h) h.dir = DPAD_WAYS[way];
  else if (way && !h) press("pointer", DPAD_WAYS[way]);   // (pressed in its middle, then slid off it)
});
for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
  canvas.addEventListener(type, e => { if (e.pointerId === dpadPointer) dpadPointer = null; });
// ...and, held, it steers: sliding the finger (or the pressed mouse) round the character turns the
// way it walks, past the character's own cell, so a slip of the finger never has to be let go of
let walker = null;                 // the pointer walking
canvas.addEventListener("pointermove", e => {
  if (e.pointerId !== walker) return;
  const h = held.find(h => h.id === "pointer" && !h.gone);
  if (!h) { walker = null; return; }
  const dpr = pixelRatio, px = e.offsetX * dpr, py = e.offsetY * dpr;
  const cx = originX + (player.x + 0.5) * CW * scale, cy = originY + (player.y + 0.5) * CH * scale;
  if (Math.abs(px - cx) < CW * scale / 2 && Math.abs(py - cy) < CH * scale / 2) return;   // (over the character: as it was)
  h.dir = pointerWay(px, py);
});
// A finger held on the game is the game's: no selecting text, no callout or magnifier (a
// phone's long press, which would also cancel the press, stopping the walk or the chopping),
// no scrolling or swiping the page (an app's own browser, Instagram's say, takes a swipe as
// going back or closing)
for (const type of ["touchstart", "touchmove"])
  canvas.addEventListener(type, e => { if (active) e.preventDefault(); }, { passive: false });
canvas.addEventListener("contextmenu", e => { if (active) e.preventDefault(); });
// [S]hare Score's shared as the press on it ends, still on it: a phone lets a page share only
// on a finger's lift, not as it comes down
let sharePress = null;
// The title's credit: a name pressed and let go on it opens its page in a new tab (on the letting
// go, so a phone's browser lets it open one)
let linkPress = null;
canvas.addEventListener("pointerup", e => {
  const press = linkPress, dpr = pixelRatio;
  linkPress = null;
  if (press?.id !== e.pointerId || opening?.step !== "title") return;
  if (press.row !== undefined) { if (titleRowAt(e.offsetX * dpr, e.offsetY * dpr) === press.row) pickTitle(press.row); }
  else if (titleLinkAt(e.offsetX * dpr, e.offsetY * dpr) === press.url) window.open(press.url, "_blank", "noopener");
});
canvas.addEventListener("pointerup", e => {
  if (sharePress !== e.pointerId) return;
  sharePress = null;
  const dpr = pixelRatio;
  if (dead && !ranking && deadButtonAt(e.offsetX * dpr, e.offsetY * dpr) === "share") shareScore();
});
for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
  canvas.addEventListener(type, e => {
    touches.delete(e.pointerId);
    release("pointer");
    if (logDrag?.id === e.pointerId && !logDrag.moved && type === "pointerup" && !logOpen && !chat) toggleLog();
    if (logDrag?.id === e.pointerId) logDrag = null;
    const dragged = panel?.drag;   // something dragged in the bag, let go of (see BAG_PANEL)
    if (dragged?.id !== e.pointerId) return;
    panel.drag = null;
    if (!dragged.on || type !== "pointerup") return;
    const dpr = pixelRatio, to = panelTargetAt(e.offsetX * dpr, e.offsetY * dpr), from = dragged.from;
    if (Number.isInteger(to)) { act("i", "move", from, to); followKey(from, to); }
    else if (to === null) act("i", from >= KEY0 && from < BAG0 ? "move" : "drop", from, BAG0);   // out of it: dropped (a key: cleared)
  });
}

// How much of the CRT pass the title (and what it brings up before the journey) gets: none, so
// its words read clearly (the user's, 2026-10-18; it was 0.35): at 0 the pass shows the picture as drawn
const CRT_TITLE = 0;
// (?nocrt in the address leaves the CRT pass off, to see how much it's slowing a device)
const crt = createCrt(canvas);
if (query.has("nocrt")) crt.enabled(false);
onSettings(s => crt.curved(s.curve));   // (the settings' Screen Curve)
// The screen's curve moves what's drawn a little from where it was drawn, so a press on the canvas
// is taken to where it lands on the picture before any of the game's own handlers read it (they're
// all on the canvas, and these, capturing on the window, come first)
for (const type of ["pointerdown", "pointermove", "pointerup", "mousedown", "wheel", "click", "dblclick", "contextmenu"]) {
  window.addEventListener(type, e => {
    if (e.target !== canvas) return;
    const [x, y] = crt.touchAt(e.offsetX, e.offsetY);
    Object.defineProperties(e, { offsetX: { value: x }, offsetY: { value: y } });
  }, { capture: true, passive: true });
}

// For the website over the game (main.js). While it's up the game takes no input, and,
// faint behind it, is drawn only QUIET_FPS times a second and without the CRT pass: it's
// turn-based, so nothing but its little animations would move anyway.
const QUIET_FPS = 10;
let active = true, quiet = false, lastDraw = -Infinity, onLeave = () => {};
export function setActive(on) {
  active = on;
  if (on) return;
  held.length = 0;                 // stop walking
  if (chat) closeChat();
  canvas.style.cursor = "";
}
export function setQuiet(on) {
  quiet = on;
  crt.enabled(!on && !query.has("nocrt"));
}
// fn(page) is called when the player leaves the game: page is "home", "works", "about",
// "art-market" or null (Esc: wherever the website was last)
export function onLeaveGame(fn) { onLeave = fn; }

// Debug, with ?debug in the address or on a local server: a button along the top lifts the fog
// of war, so the whole map shows, another brings the demon to SUMMON_AWAY cells off the
// character (outside only), on open ground, the next the goblin king, in the cave, a third goes
// down a floor of the cave, and the last ones go to the nearest rare site, end the journey (the
// days run out) and kill the character. Then a list of the events (DEBUG_EVENTS) and one of the
// forest's biomes (DEBUG_BIOMES): picking an event starts a journey over with it, in the biome
// picked, the character taken straight to it if it's a rare site (the address's options, see
// `options`, and "goSite").
const SUMMON_AWAY = 10;
const DEBUG_EVENTS = {
  church: { label: "Church (priest, grace)", site: "church" },
  graveyard: { label: "Graveyard", site: "graveyard" },
  bandits: { label: "Bandits' hideout", site: "bandits" },
  ring: { label: "Fairy ring (rite)", site: "ring" },
  village: { label: "Small village", site: "village" },
  villageDusk: { label: "Small village at sunset", site: "village", turn: DAY.dusk - 10 },
  bush: { label: "Burning bush", site: "bush" },
  lake: { label: "Lake house", site: "lake" },
  remnants: { label: "Battle remnants", site: "remnants" },
  remnantsNight: { label: "Battle remnants at nightfall", site: "remnants", turn: DAY.night - 10 },
  bushCursed: { label: "Burning bush, cursed gear on", site: "bush",
    wear: Object.keys(ITEMS).find(id => ITEMS[id].affix === "cursed" && ITEMS[id].slot === "weapon") },
  lady: { label: "Ghostly lady (ghost words)", lady: "outside" },
  night: { label: "Nightfall", turn: DAY.night - 5 },
  feast: { label: "Goblin feast (cave)", feast: "" },
  smith: { label: "Blacksmith (cave)", smith: "" },
};
// (each biome's "?biome=": how near it's brought, so a site's soon found in it, and "siteIn")
const DEBUG_BIOMES = [{ label: "forest-1", biome: 1 }, { label: "forest-2", biome: 0.15 }, { label: "forest-3", biome: 0.04 }, { label: "forest-4", biome: 0.03 }];
function goToSite(kind = null) {
  const far = c => Math.abs(c[0] - player.x) + Math.abs(c[1] - player.y), is = p => (kind ? p.kind === kind : p.kind);
  for (let r = 40; r <= 600 && !world.patches.some(is); r += 40) grown += world.extend(player.x - r, player.y - r, player.x + r, player.y + r);
  wakePatches();
  const site = world.patches.filter(is).sort((a, b) => far(a.heart) - far(b.heart))[0];
  const at = site?.cells.filter(c => MAPS.outside.open(...c) && foeCanStand(...c, false, true)).sort((a, b) => b[1] - a[1])[0];
  if (map !== MAPS.outside || !at) { say("No site laid out yet."); return; }
  [player.x, player.y] = at;
  Object.assign(anim, { t0: -Infinity, fromX: player.x, fromY: player.y });
  fadeT0 = clock();
}
function goToShrine() {
  const far = s => Math.abs(s.x + 1 - player.x) + Math.abs(s.y + 3 - player.y);
  if (map === MAPS.outside) for (let r = 40; r <= 600 && !world.shrines.length; r += 40) grown += world.extend(player.x - r, player.y - r, player.x + r, player.y + r);
  wakePatches();
  const s = shrinesOn().sort((a, b) => far(a) - far(b))[0];
  const at = s && (map.cave ? [[s.x + 1, s.y + 3], [s.x - 1, s.y + 1], [s.x + 3, s.y + 1], [s.x + 1, s.y - 1]].find(c => map.open(...c)) : [s.x + 1, s.y + 3]);
  if (!at) { say("No shrine here."); return; }
  [player.x, player.y] = at;
  Object.assign(anim, { t0: -Infinity, fromX: player.x, fromY: player.y });
  fadeT0 = clock();
}
if (trying) {
  // (and, for looking into from the browser's console, what's going on)
  window.mektxt = { get map() { return map; }, get player() { return player; }, get foes() { return foes; }, get jacks() { return jacks; }, world,
    // (how the journey stands, and how far a watched one's got: for trying journeys out and watching them again)
    get state() {
      return { turns, hp: stats.hp, exp: progress.exp, level: progress.level, dice: diceDrawn(), map: map.id, x: player.x, y: player.y,
        dead: !!dead, score: dead?.score.score ?? null, leveling: leveling?.step ?? null, notice: !!notice, talk: !!talk, aiming: !!aiming,
        panel: !!panel, picking: !!picking, lookout: !!lookout, events: journal?.e.length ?? null,
        watching: watching && { i: watching.i, of: watching.events.length, outOfStep: watching.outOfStep } };
    },
    set watchSpeed(n) { if (watching) watching.speed = n; },
    get hud() { return { x: hudX, y: hudY, u: hudScale, ui: uiU }; },
    get view() { return { scale, originX, originY, cls: charClass }; },
    get classes() { return Object.keys(CLASSES); },
    set popsWhole(on) { popsWhole = on; },   // (see drawPops())   // (where a world pixel lands on the canvas, and the class: for recording clips)
    get sheet() { return lastSheet; },
    // (the score card once dead, as a link to look at; `foe` names what killed them, to try the epitaph's wording)
    card(foe) { if (!dead) return null; if (foe) dead.foe = foe; return URL.createObjectURL(scoreCard()); },
    widest(n = 8) { return [...Object.keys(ITEMS), ...Object.keys(SKILLS)].map(id => [id, Math.round(itemBox(id, { desc: true }).w / uiU)]).sort((a, b) => b[1] - a[1]).slice(0, n); },   // (the cards that widen the bag)   // (where the HUD is on the canvas, and its scale)
    get pact() { return pact; }, get blades() { return blades; }, get bag() { return bag; }, get stats() { return stats; }, maxHp, stat,
    get lakeHome() { return lakeHome; }, set lakeHomeNow(now) { setLakeHome(now); }, set jacksKilled(n) { jacksKilled = n; },   // (the lumberjack's house, see LAKE_HOME)
    // (puts a panel up at once, to look at it: "priest", "shrine" (a pact's kind after it, "shrine:crit"),
    // "bush", "skill" (a level-up's spells), "smith", "look" (the nearest monster), "board" ("board:fake" for made-up places), "settings" or "pickup" ("pickup:3" for a pile))
    show(what) {
      const [kind, arg] = what.split(":");
      if (kind === "priest") talk = { priest: player, buttons: {} };
      else if (kind === "shrine") talk = { shrine: { kind: arg || "crit" }, buttons: {} };
      else if (kind === "bush") talk = { bush: true, buttons: {} };
      else if (kind === "skill") { Object.assign(progress, { points: 0, spells: Math.max(1, progress.spells) }); levelUp(); }
      else if (kind === "smith") { openPanel(smithCells()[0] ?? BAG0); panel.smith = true; }
      else if (kind === "look") inspecting = { foe: [...foes].sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0] };
      else if (kind === "board") {   // ("board:fake": with made-up places, the 23rd yours)
        openLeaderboard();
        if (arg === "fake") ranking.boards[boardKey()] = { state: "done", top: Array.from({ length: 30 }, (_, i) =>
          ({ name: i === 22 ? (localStorage.getItem("mektxt.scoreName") || "YOU") : `P${i + 1}`, cls: Object.keys(CLASSES)[i % Object.keys(CLASSES).length], score: 1300 - i * 37 })) };
      }
      else if (kind === "settings") openSettings();
      else if (kind === "pickup") {   // ("pickup:3": a pile of 3; the items made up, nothing's put on the map)
        const ids = Object.keys(ITEMS).filter(id => ITEMS[id].slot && ITEMS[id].affix === "cursed").slice(0, Math.max(1, Number(arg) || 1));
        notice = { item: ids.at(-1), chest: null, pile: ids.length > 1 ? ids : null, from: null, pick: ids.length - 1, buttons: {}, slots: [], help: false };
      }
    } };
  const bar = document.createElement("div");
  Object.assign(bar.style, { position: "fixed", top: "56px", left: "50%", transform: "translateX(-50%)", zIndex: "2",
    display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px", width: "max-content", maxWidth: "calc(100vw - 32px)" });
  const button = onClick => {
    const b = document.createElement("button");
    Object.assign(b.style, { background: "#222034", color: "#9badb7", border: "1px solid #253a56", padding: "4px 8px",
      font: "12px monospace", cursor: "pointer", whiteSpace: "nowrap" });
    b.addEventListener("click", () => { onClick(); b.blur(); });  // blur: keys go back to the game
    bar.append(b);
    return b;
  };
  const b = button(() => { noFog = !noFog; label(); });
  const label = () => { b.textContent = noFog ? "Fog: off" : "Fog: on"; };
  label();
  button(() => {
    if (map !== MAPS.outside) return;
    for (const s of foes.filter(s => s.hunts && !s.dead)) {
      const ring = [];
      for (let dx = -SUMMON_AWAY; dx <= SUMMON_AWAY; dx++)
        for (const dy of new Set([SUMMON_AWAY - Math.abs(dx), Math.abs(dx) - SUMMON_AWAY]))
          if (foeCanStand(player.x + dx, player.y + dy)) ring.push([player.x + dx, player.y + dy]);
      if (!ring.length) continue;
      const [x, y] = ring[Math.floor(random() * ring.length)];
      Object.assign(s, { x, y, anim: { t0: -Infinity, fromX: x, fromY: y } });
    }
  }).textContent = "Summon demon";
  button(() => {                   // (down in the cave: the goblin king, in the dirt 12 cells off, see KING)
    if (!map.cave) return;
    const at = [[12, 0], [-12, 0], [0, 8], [0, -8]].map(([dx, dy]) => [player.x + dx, player.y + dy])
      .find(([x, y]) => map.cave.diggable(x, y) || map.open(x, y));
    if (!at) return;
    if (map.cave.diggable(...at)) { map.cave.dig(...at); felled++; }
    addFoe("goblinKing", at, map);
    Object.assign(foes.at(-1), { alert: true, stalked: 0 });
  }).textContent = "Summon king";
  // ...and another goes straight down to the cave's next floor (the first, from anywhere else)
  button(() => {                   // (in a cave, its way down: on the last floor, out into the forest)
    if (!dead) enter(map.cave ? map.doors.get(key(...map.cave.down)) : { to: () => caveMap(1) }, clock());
  }).textContent = "Cave: down";
  // ...and another goes to the nearest rare site (world.js SITES; "?site=" has one near), laying
  // out the forest further and further round the character till there's one
  button(() => goToSite()).textContent = "Go to site";
  // ...and another to the nearest shrine (see SHRINE; "?shrine=<kind>" has one of that kind near),
  // in front of its rocks, or beside it in the cave
  button(goToShrine).textContent = "Go to shrine";
  // ...and another ends the journey as running out of days does (see endJourney()), to see the
  // game-over box without dying
  button(() => { if (!dead) endJourney(clock()); }).textContent = "Time up";
  // ...and another kills the character, to see that one
  button(() => { if (!dead) { stats.hp = 0; die(clock()); } }).textContent = "Die";
  // ...and the events' list, and the biomes'
  const pick = (choices, chosen) => {
    const s = document.createElement("select");
    Object.assign(s.style, { background: "#222034", color: "#9badb7", border: "1px solid #253a56", padding: "3px 4px", font: "12px monospace", cursor: "pointer" });
    for (const [value, label] of choices) s.append(Object.assign(document.createElement("option"), { value, textContent: label, selected: value === chosen }));
    // (the game's keys never change it, left focused: they go to the game, so a walk doesn't start a journey over)
    s.addEventListener("keydown", e => { if (!["Enter", "Space"].includes(e.code)) { e.preventDefault(); s.blur(); } });
    bar.append(s);
    return s;
  };
  const now = Object.keys(DEBUG_EVENTS).find(k => query.get("event") === k) ?? "";
  const events = pick([["", "Event..."], ...Object.entries(DEBUG_EVENTS).map(([k, e]) => [k, e.label])], now);
  const biomes = pick(DEBUG_BIOMES.map((b, i) => [String(i), b.label]), query.get("siteIn") ?? "0");
  const start = () => {
    const e = DEBUG_EVENTS[events.value];
    if (!e) return;
    const b = DEBUG_BIOMES[Number(biomes.value)], q = new URLSearchParams(query.has("debug") ? { debug: "" } : {});
    q.set("event", events.value);
    if (b.biome !== 1) q.set("biome", b.biome);
    if (e.site) { q.set("site", e.site); q.set("siteIn", biomes.value); q.set("goSite", ""); }
    for (const k of ["turn", "wear", "lady", "feast", "smith"]) if (e[k] !== undefined) q.set(k, e[k]);
    try { sessionStorage.setItem("mektxt.restart", "1"); } catch {}   // (straight back into the game, see main.js)
    location.href = `${location.pathname}?${q.toString().replace(/=(?=&|$)/g, "")}`;
  };
  events.addEventListener("change", start);
  biomes.addEventListener("change", start);
  // ...and every sound, by group (sound.js SOUND_TEST): picking one plays it (a bed's held till
  // another's picked, or "As in the game"), and the list goes back to its title to pick it again
  const sounds = pick([["", "Sound..."]], "");
  for (const [group, list] of Object.entries(SOUND_TEST)) {
    const g = Object.assign(document.createElement("optgroup"), { label: group });
    for (const name of Object.keys(list)) g.append(Object.assign(document.createElement("option"), { value: `${group}|${name}`, textContent: name }));
    sounds.append(g);
  }
  sounds.addEventListener("change", () => {
    const [group, name] = sounds.value.split("|");
    SOUND_TEST[group]?.[name]?.();
    sounds.value = "";
    sounds.blur();
  });
  document.body.append(bar);
  if (query.has("goSite") && options.get("site")) goToSite(options.get("site"));
  // ("?feast": a goblin feast on every floor of the cave, see FEAST; the character's taken down to
  // the first, FEAST.hear and a bit from its table, to walk up to it)
  if (options.has("feast")) {
    enter({ to: () => caveMap(1) }, clock());
    const f = map.feasts?.[0];
    if (f) {
      const off = ([x, y]) => Math.hypot(x - f.table[0], (y - f.table[1]) * CH / CW);
      const at = map.cave.rooms.flatMap(r => r.cells).filter(c => map.open(...c) && foeCanStand(...c) && !f.room.has(key(...c)))
        .sort((a, b) => Math.abs(off(a) - FEAST.hear - 4) - Math.abs(off(b) - FEAST.hear - 4))[0];
      if (at) { [player.x, player.y] = at; Object.assign(anim, { t0: -Infinity, fromX: player.x, fromY: player.y }); }
    }
  }
  // ("?smith": the blacksmith on the cave's first floor, see SMITH; the character's taken down to
  // it, a few cells out of his room, outside his hearing, with some weak gear for him, worn and not)
  if (options.has("smith")) {
    enter({ to: () => caveMap(1) }, clock());
    const s = map.smith;
    if (s) {
      const off = ([x, y]) => Math.hypot(x - s.anvil[0], (y - s.anvil[1]) * CH / CW);
      const at = map.cave.rooms.flatMap(r => r.cells).filter(c => map.open(...c) && foeCanStand(...c) && !s.room.has(key(...c)))
        .sort((a, b) => Math.abs(off(a) - SMITH.hear - 3) - Math.abs(off(b) - SMITH.hear - 3))[0];
      if (at) { [player.x, player.y] = at; Object.assign(anim, { t0: -Infinity, fromX: player.x, fromY: player.y }); }
    }
  }
}
// ("?class=<id>", trying things out: that class, as the classes' panel's skill clips are filmed, tools/dos-age-clips)
charClass = CLASSES[options.get("class")] ? options.get("class") : Object.keys(CLASSES)[seed % Object.keys(CLASSES).length];   // (a random one, by the seed; see charClass)
becomeClass(charClass);
// On a local server (or with ?debug), "?item=<id>" in the address starts with that item
// ("?item=pickaxe-normal"; more than one "&item=" for more)... (`options` has these only there,
// or in a watched journey that was played with them)
{
  for (const id of options.getAll("item")) if (ITEMS[id]) carry(id);
  // ...and "?wear=<id>" starts with it on ("?wear=sword-cursed", for trying out the burning bush's dark)
  for (const id of options.getAll("wear").filter(id => ITEMS[id]?.slot)) {
    carry(id);
    equipped[ITEMS[id].slot] = bag.findIndex(b => b?.id === id);
  }
  // ...and "?smith" (see above) weak gear for the blacksmith: a weapon, armour and a trinket of
  // tier I (or common), the armour worn
  if (options.has("smith"))
    for (const slot of ["weapon", "armour", "trinket"]) {
      const id = Object.keys(ITEMS).find(id => ITEMS[id].slot === slot && ITEMS[id].affix === "weak" && (ITEMS[id].tier ?? 1) === 1);
      carry(id);
      if (slot === "armour") equipped.armour = bag.findIndex(b => b?.id === id);
    }
  // ...and "?foe=<kind>" a monster of that kind (one of ENEMIES, "slime") a few cells off, one
  // for each, for trying out fights and the classes' skills
  for (const [i, kind] of options.getAll("foe").filter(k => ENEMIES[k]).entries()) {
    const at = [[3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, -2]].map(([dx, dy]) => [player.x + dx, player.y + dy])
      .filter(([x, y]) => foeCanStand(x, y))[i];
    if (at) addFoe(kind, at, map);
  }
  // ...and "?exp=<n>" in the address starts with that much exp, for trying out levelling up
  const exp = Number(options.get("exp"));
  if (exp > 0) gainExp(exp, clock());
  // ...and "?turn=<n>" starts that many turns into the journey, for trying out the days (see DAY)
  const turn = Number(options.get("turn"));
  if (turn > 0) turns = Math.min(turn, DAY.days * DAY.turns - 1);
  // ...and "?ghost=<class>" makes up a past player's ghost of that class, sure to rise at nightfall (see GHOSTS)
  const worn = slot => Object.keys(ITEMS).find(id => ITEMS[id].slot === slot);
  for (const cls of options.getAll("ghost")) {
    ghostPool.push({ id: -ghostPool.length - 1, name: "TEST", ghost: { cls, level: 3, hp: 115, atk: 5, def: 3, mag: 2, spd: 11,
      gear: [worn("weapon"), worn("trinket")], spell: "firebolt-normal" } });
    GHOSTS.chance = 1;
  }
  // ...and "?fallen" lays a made-up fallen player's grave a few cells right of the house's doorstep (see FALLEN)
  // ...and "?nemesis=<kind>" makes up a nemesis of that kind, in the first forest (see NEMESIS), and "?relic=<id>" starts wearing a relic (see RELIC)
  if (ENEMIES[options.get("nemesis")]) addNemesis({ id: -1, kind: options.get("nemesis"), affix: "superior", biome: 0, night: false, name: "Grubnak", kills: 3, classes: { rogue: 2, mage: 1 } });
  // ("?relic=all": every relic in the bag, the first worn)
  const relics = options.get("relic") === "all" ? RELIC_IDS : ITEMS[options.get("relic")]?.relic ? [options.get("relic")] : [];
  relics.forEach((id, k) => {
    const i = bag.findIndex(b => !b);
    if (i < 0) return;
    bag[i] = { id, n: 1 };
    if (!k) equipped.trinket = i;
    relicFound = true;
  });
  if (options.has("fallen")) addFallen([{ name: "TEST", cls: "rogue", day: 2, x: world.spawn[0] + 4, y: world.spawn[1] + 1, by: "a bandit" }]);
}
fetchGhosts();
callOwnGhost();
callFallen();
callNemesis();
if (watchRefused) say([[watchRefused, INK.down]]);
if (opening && TITLE_MODES().includes(wantMode)) focusTitle(TITLE_MODES().indexOf(wantMode), clock());   // (come back laid out for it, see startOver())
if (opening?.step === "class") openMode(opening.mode);   // (...and to go on into it)
if (onSite && !watching && !tryingOptions) beginOnSite();

// (a picture that wouldn't load even asked for twice: the game can't start, and says so (Figma
// 631:80641) with a way to reload, rather than staying blank)
Promise.all([pictureLoaded(tiles), pictureLoaded(prompt), fontReady, sansReady]).then(() => {
  document.getElementById("loading")?.remove();   // (index.html's trees, the game's own frames from here)
  tiles = withAllyTiles(withNoteTiles(withFloorDots(tiles)));
  for (const id of RELIC_IDS) SCENE.itemIcons[id] = noteTiles[id];   // (see RELIC)
  SCENE.itemIcons["white-tuft"] = noteTiles.tuft;   // (see KEEPSAKE)
  SCENE.itemIcons["lumberjack-locket"] = noteTiles.locket;
  fog = fogAtlases(tiles, CW, CH);
  fogByRed = RED_WASH.map(amount => (amount ? redAtlases(fog, amount) : fog));
  requestAnimationFrame(frame);
  if (verifyId) watching ? setTimeout(verifyStep, 0) : verified({ ok: null, notes: [watchRefused ?? "it can't be watched"] });
}).catch(err => {
  fault(err.message);
  document.getElementById("loading")?.remove();
  const shown = document.getElementById("load-error");
  shown.hidden = false;
  shown.querySelector("button").addEventListener("click", () => location.reload());
});
