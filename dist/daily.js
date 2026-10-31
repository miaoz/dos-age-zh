// The Daily Challenge (the user's design, 2026-10-18): each day (UTC) everyone plays the same
// journey, laid out from the day's seed (`seedOf()`), with the day's affixes on every monster
// (`AFFIXES`, by tier), and its own leaderboard (worker/scores.js, by the day's `key`,
// "2026-10-18"). Which affixes a day has is never left to chance at the time: it's worked out
// from the date (`challenge()`), so the game and anyone watching a journey again agree on it.
// The week (`WEEK`, Monday first, the user's, 2026-10-26, from `CUTOVER`): one affix Monday to
// Wednesday, easy, medium then hard; two on Thursday (easy and medium) and Friday (medium and hard);
// and the weekend one challenge of 48 hours, Saturday and Sunday alike, its board one too, with three
// (easy, medium and hard: "Brutal, Vigorous & Blizzard Weekend"). Its key is Saturday's (dayKey()),
// so Sunday's journeys are the weekend's: its map, its affixes and its board. No class days. Each
// tier's affixes come round in a shuffled order, every one of them before any comes again (and never
// the same twice running); one that'd clash with the day's others (`clashes()`) gives way to one
// that doesn't.
// Before CUTOVER the days keep the week they were played in (`OLD_WEEK`: one affix a weekday and two
// on Saturday, class days on Wednesday and Sunday), so their boards and journeys watched again agree.
import { rng } from "./world.js";

// Each affix: what's said of it (`says`, in the log as the journey starts), and what it does to
// the monsters (game.js addFoe() and the rest, see DAILY there): `stats` added to theirs, `dodge`
// more percent of dodging, `aggro` times as far off they notice the character, `spell` a spell of
// their own (theirs at their affix: a superior one's superior) for those that know none, `affix`
// the one every monster that'd roll its own has (cursed or enchanted), `more` that much again of
// the forests' and caves' monsters (one of each `more` of them with another beside it).
// (the list and the names the user's, 2026-10-18, with no weather of their own any more; the
// tiers Claude's, to confirm) And a few that change the journey, not the monsters (the user's,
// 2026-10-20; the tiers Claude's, to confirm): `days` times as long a day and night (DAY in
// game.js), `fasting` no potions drunk, `ghosts` that many past players' ghosts every night, rising
// on the cave's floor when the character's down one, `noSkills` no skills cast, by anyone. Each
// with a `from` comes round only from that day (its key), so the days before it keep their affixes.
// And three more (the user's, 2026-10-26; the tiers Claude's, to confirm): `inferior` every piece of
// gear and every spell the character has or finds weak (game.js worse()), `hiccup` the chance of a
// hiccup for every class (the drunkard's own no more than it), `twins` every miniboss with another
// of its kind beside it (game.js addBoss()).
export const AFFIXES = {
  brutal: { tier: "easy", name: "Brutal", says: "Monsters hit harder (+2 ATK).", stats: { atk: 2 } },
  stoic: { tier: "easy", name: "Stoic", says: "Monsters are tougher (+2 DEF).", stats: { def: 2 } },
  arcane: { tier: "easy", name: "Arcane", says: "Monsters' spells are stronger (+2 MAG).", stats: { mag: 2 } },
  swift: { tier: "easy", name: "Swift", says: "Monsters are faster (+2 SPD).", stats: { spd: 2 } },
  bulwark: { tier: "easy", name: "Bulwark", says: "Monsters get +1 ATK and +1 DEF.", stats: { atk: 1, def: 1 } },
  striker: { tier: "easy", name: "Striker", says: "Monsters get +1 ATK and +1 SPD.", stats: { atk: 1, spd: 1 } },   // (Blitz till 2026-10-20, its name the new Blitz's)
  spellblade: { tier: "easy", name: "Spellblade", says: "Monsters get +1 ATK and +1 MAG.", stats: { atk: 1, mag: 1 } },
  bruiser: { tier: "easy", name: "Bruiser", says: "Monsters get +1 DEF and +1 SPD.", stats: { def: 1, spd: 1 } },
  runic: { tier: "easy", name: "Runic", says: "Monsters get +1 DEF and +1 MAG.", stats: { def: 1, mag: 1 } },
  kiter: { tier: "easy", name: "Kiter", says: "Monsters get +1 MAG and +1 SPD.", stats: { mag: 1, spd: 1 } },
  impatient: { tier: "medium", name: "Impatient", says: "Monsters cast Haste.", spell: "haste" },
  inferno: { tier: "medium", name: "Inferno", says: "Monsters cast Firebolt.", spell: "firebolt" },
  vigorous: { tier: "medium", name: "Vigorous", says: "Monsters cast Regeneration.", spell: "regeneration" },
  marbled: { tier: "medium", name: "Marbled", says: "Monsters cast Stoneskin.", spell: "stoneskin" },
  wrath: { tier: "medium", name: "Wrath", says: "Monsters cast Rage.", spell: "rage" },
  bright: { tier: "medium", name: "Bright", says: "Monsters notice you from further off.", aggro: 1.5 },
  elusive: { tier: "medium", name: "Elusive", says: "Monsters dodge more (+20% dodge).", dodge: 20 },
  busy: { tier: "medium", name: "Busy", says: "There are more monsters about (+20%).", more: 0.2 },
  blizzard: { tier: "hard", name: "Blizzard", says: "Monsters cast Ice Ring.", spell: "ice-ring" },
  thunderstorm: { tier: "hard", name: "Thunderstorm", says: "Monsters cast Thunderbolt.", spell: "thunderbolt" },
  phasing: { tier: "hard", name: "Phasing", says: "Monsters cast Blink.", spell: "blink" },
  omen: { tier: "hard", name: "Omen", says: "Every monster is cursed.", affix: "cursed" },
  enchanted: { tier: "hard", name: "Enchanted", says: "Every monster is enchanted.", affix: "enchanted" },
  saga: { tier: "easy", name: "Saga", says: "Days and nights are 25% longer.", days: 1.25, from: "2026-10-21" },
  blitz: { tier: "medium", name: "Blitz", says: "Days and nights are 25% shorter.", days: 0.75, from: "2026-10-21" },
  fasting: { tier: "medium", name: "Fasting", says: "Potions can't be drunk.", fasting: true, from: "2026-10-21" },
  spooky: { tier: "hard", name: "Spooky", says: "Two players' ghosts rise every night, in the caves too.", ghosts: 2, from: "2026-10-21" },
  null: { tier: "hard", name: "Null", says: "No one can use skills, monsters or you.", noSkills: true, from: "2026-10-21" },
  alcoholic: { tier: "easy", name: "Alcoholic", says: "Everyone hiccups now and then (4%), whatever their class.", hiccup: 0.04, from: "2026-10-30" },
  gemini: { tier: "medium", name: "Gemini", says: "Minibosses come in pairs.", twins: true, from: "2026-10-30" },
  inferior: { tier: "hard", name: "Inferior", says: "All gear and skills are weak, yours too.", inferior: true, from: "2026-10-30" },
};
// Monday to Sunday: the tiers each day draws an affix from, and "class" for a class day (Sunday
// none of its own since CUTOVER: it's the weekend's, Saturday's)
export const WEEK = [["easy"], ["medium"], ["hard"], ["easy", "medium"], ["medium", "hard"], ["easy", "medium", "hard"], []];
const OLD_WEEK = [["easy"], ["medium"], ["class"], ["easy"], ["hard"], ["easy", "medium"], ["hard", "class"]];
export const CUTOVER = "2026-10-30";   // (a Friday: brought forward from Monday 2026-11-02, the user's, 2026-10-29; see WEEK)
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const WEEKEND = "Weekend";
const TIERS = ["easy", "medium", "hard", "class"];

const DAY_MS = 864e5;
// Today's key (UTC; a Sunday's since CUTOVER the Saturday before it, the weekend's, see WEEK), and the
// ms till the next one (on a Saturday, till Monday)
const weekdayOf = t => (Math.floor(t / DAY_MS) + 3) % 7;   // (0 Monday: day 0 was a Thursday)
const date = t => new Date(t).toISOString().slice(0, 10);
const weekend = t => date(t) >= CUTOVER && weekdayOf(t) >= 5;
export const dayKey = (t = Date.now()) => date(weekend(t) && weekdayOf(t) === 6 ? t - DAY_MS : t);
export const msToNext = (t = Date.now()) => DAY_MS - (t % DAY_MS) + (weekend(t) && weekdayOf(t) === 5 ? DAY_MS : 0);
export const isKey = k => typeof k === "string" && /^\d{4}-\d{2}-\d{2}$/.test(k) && dayKey(Date.parse(k)) === k;
// The day's seed, the same for everyone (a 31-bit hash of its key)
export function seedOf(key) {
  let h = 2166136261;
  for (const c of `dos-age daily ${key}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) % 2 ** 31;
}

// The n-th of `list` in its shuffled turns: each round of them shuffled by its own seed, and the
// first of a round never the last of the one before
function nth(list, n, salt) {
  const round = r => {
    const out = [...list], next = rng(seedOf(`${salt} ${r}`));
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  };
  const r = Math.floor(n / list.length), at = n % list.length, order = round(r);
  if (r > 0 && list.length > 1 && order[0] === round(r - 1).at(-1)) order.push(order.shift());
  return order[at];
}

// Whether affix `id` clashes with one of `with`: two that'd each give the monsters a spell, or each
// an affix (only one's ever used: game.js DAILY), or each change the day's length (they'd undo
// each other), or Null (no skills) and a spell (it'd never be cast)
const kind = a => (a.spell ? "spell" : a.affix ? "affix" : a.days ? "days" : null);
const clashes = (id, list) => list.some(o => {
  const a = AFFIXES[id], b = AFFIXES[o];
  return (kind(a) && kind(a) === kind(b)) || (a.noSkills && b.spell) || (b.noSkills && a.spell);
});
// The day `key`'s challenge: { key, seed, weekday (0 Monday; the weekend's Saturday), weekend (its
// 48 hours, see WEEK), day (its word: "Monday", "Weekend"), affixes (ids), cls (a class id, or null:
// only before CUTOVER) }; `classes` the class ids in their turn
export function challenge(key, classes) {
  const n = Math.floor(Date.parse(key) / DAY_MS), weekday = (n + 3) % 7, week = Math.floor((n + 3) / 7);   // (day 0 was a Thursday)
  const old = key < CUTOVER, W = old ? OLD_WEEK : WEEK, affixes = [];
  let cls = null;
  // (since CUTOVER, every other week the hardest tier's drawn first: whichever's drawn later gives way
  // in a clash, so the two take turns at it and no tier's few that fit come up far the most)
  const tiers = !old && week % 2 ? [...W[weekday]].reverse() : W[weekday];
  for (const tier of tiers) {
    // (how many times the tier's come up before this day: the weeks before, then this week's days before)
    const per = W.flat().filter(t => t === tier).length, before = W.slice(0, weekday).flat().filter(t => t === tier).length;
    const k = week * per + before;
    if (tier === "class") { cls = classes[k % classes.length]; continue; }
    const list = Object.keys(AFFIXES).filter(id => AFFIXES[id].tier === tier && !(AFFIXES[id].from > key));
    let id = nth(list, k, tier);
    if (!old && clashes(id, affixes)) {   // (one that clashes: in its place one of those that don't, picked by the day's seed, so no one of them comes up most)
      const fits = list.filter(o => !clashes(o, affixes));
      id = fits[seedOf(`${key} ${tier}`) % fits.length];
    }
    affixes.push(id);
  }
  if (tiers !== W[weekday]) affixes.reverse();   // (named easiest first all the same)
  const weekend = !old && weekday === 5;
  return { key, seed: seedOf(key), weekday, weekend, day: weekend ? WEEKEND : DAYS[weekday], affixes, cls, tiers: W[weekday].filter(t => TIERS.includes(t)) };
}
// How hard a day is, out of `most` (the title's meter, 733:62403): each of its tiers' worth added up
// ("Brutal and Vigorous Thursday" 1 + 3, "Blizzard Fighter Sunday" 4 + 3). (the user's, 2026-10-18;
// the weekend's 1 + 3 + 4 shows as `most`, full, the user's pick 2026-10-26)
export const DIFFICULTY = { easy: 1, medium: 3, hard: 4, class: 3, most: 7 };
export const difficulty = c => Math.min(DIFFICULTY.most, c.tiers.reduce((n, t) => n + DIFFICULTY[t], 0));

// Its name: "Brutal Monday", "Brutal and Vigorous Thursday", "Brutal, Vigorous and Blizzard Weekend",
// and before CUTOVER "Fighter Wednesday", "Blizzard Fighter Sunday" (`className` a class id's name;
// `and` what joins the last two affixes, "&" on the title, the ones before it by commas)
export const joinAffixes = (names, and) => (names.length > 2 ? `${names.slice(0, -1).join(", ")}${and}${names.at(-1)}` : names.join(and));
export function challengeName(c, className, and = " and ") {
  const words = joinAffixes(c.affixes.map(id => AFFIXES[id].name), and);
  return [words, c.cls ? className(c.cls) : "", c.day].filter(Boolean).join(" ");
}
