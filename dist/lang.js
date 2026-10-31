// The game in other languages (players' asks, 2026-10-26). The English is the game's own text, as
// it's written in the code: each line shown is passed through tl() (a string) or tr() (runs of
// [text, colour]) as a whole sentence, its English the key it's found by in the language's file,
// lang/<code>.json (made and kept up by tools/strings.py), and English is what shows where there's
// no translation. Text that's kept in a constant before it's shown is marked with english(), so
// tools/strings.py finds it too; it's translated where it's shown.
//
// A sentence has blanks, {name}, filled from `vars`: a string or a number as it is; [text, colour]
// in its own colour (tr()); a thing's name, noun(name), as the language names it. A name can be
// asked for in a form: {item:a} ("a Wooden Torch", "an Iron Axe"), {item:the} ("the Iron Axe"),
// {item:pl} ("demons"), {spell:low} ("you sneak"), or any other a language's file gives its names (German's cases, say); a capital form's first
// letter is a capital ({item:The}). {n|one:turn|other:turns} picks by the number n as the
// language counts (Intl.PluralRules: one, two, few, many, other). <name>...</> is in the colour
// vars[name] (tr()).
//
// A language's file: { "strings": { English: its own, ... }, "nouns": { English name: { "": its
// own, "a": ..., "the": ..., ... }, ... } }; empty ("") is untranslated yet. A name that's among the
// strings and not the nouns is that, in any form.
//
// Only what's drawn and said is translated, never what happens: game logic goes by ids, never by
// these words, so a journey plays, replays and scores the same in every language. (Nor is this file
// one of game.js SIM_FILES.)
import { settings, setSetting } from "./settings.js";

// The languages there are (each with its file, but English), by their own names
export const LANGUAGES = { "zh-CN": "简体中文", en: "English" };
// The language picked ("auto": the browser's, if there's one of ours like it, else English)
export const pickedLanguage = () => (settings.lang in LANGUAGES ? settings.lang : "auto");
// ...each there is to pick, in turn, and how a list shows it (in its own name; "auto" with the browser's)
export const languagePicks = () => ["auto", ...Object.keys(LANGUAGES)];
export const languageName = code => (code === "auto" ? tl("Auto ({name})", { name: LANGUAGES[browserLanguage()] }) : LANGUAGES[code]);
// ("?lang=<code>" in the address tries out a language's file, listed or not: a translator's draft)
let asked = globalThis.location ? new URLSearchParams(location.search).get("lang") : null;
function wanted() {
  if (asked && /^[a-z]{2}(-[A-Z]{2})?$/.test(asked)) return asked;
  if (settings.lang in LANGUAGES) return settings.lang;
  return browserLanguage();
}
// The browser's language, if there's one of ours like it, else English (what "auto" picks)
export function browserLanguage() {
  for (const l of globalThis.navigator?.languages ?? [globalThis.navigator?.language ?? "en"]) {
    const tag = String(l), base = tag.split("-")[0].toLowerCase();
    const code = Object.keys(LANGUAGES).find(c => c.toLowerCase() === tag.toLowerCase())
      ?? Object.keys(LANGUAGES).find(c => c.split("-")[0] === base);
    if (code) return code;
  }
  return "en";
}

let lang = "en", strings = new Map(), nouns = new Map(), plurals = new Intl.PluralRules("en");
export const language = () => lang;
async function load(code) {
  let file = {};
  if (code !== "en") file = await fetch(new URL(`./lang/${code}.json`, import.meta.url)).then(r => (r.ok ? r.json() : {})).catch(() => ({}));
  lang = code;
  strings = new Map(Object.entries(file.strings ?? {}).filter(([, s]) => s));
  nouns = new Map(Object.entries(file.nouns ?? {}));
  plurals = new Intl.PluralRules(code);
  if (globalThis.document) document.documentElement.lang = code;
}
await load(wanted());
// Picks a language ("auto" for the browser's), and loads it; what's shown from then on is in it
// (what's already in the log stays as it was said)
export async function setLanguage(code) {
  asked = null;                    // (a pick in the settings over the address's)
  setSetting("lang", code);
  await load(wanted());
}

// Marks text kept in a constant, to be translated where it's shown (see above)
export const english = s => s;
// A thing's name, to fill a blank with: in `ink`, if it's for tr(); `proper` if English gives it no
// article (a spell's, "You drop Firebolt")
export const noun = (name, ink, proper = false) => ({ noun: name, ink, proper });

const cap = s => s.charAt(0).toLocaleUpperCase(lang) + s.slice(1);
// A name in a form (see above)
function named(name, form = "", proper = false) {
  const owned = name.match(/^(.+)'s (.+)$/);
  if (lang !== "en" && owned && nouns.has(owned[2])) {
    return tl("{owner}'s {spell}", { owner: named(owned[1]), spell: named(owned[2]) });
  }
  const lower = form.charAt(0).toLowerCase() + form.slice(1), own = nouns.get(name);
  let s = own?.[lower] || (lang === "en" && !proper ? englishForm(name, lower) : null) || own?.[""] || strings.get(name) || name;
  if (lower === "low" && !own?.low) s = s.toLocaleLowerCase(lang);   // (lower case in any language, unless a name says otherwise)
  return form && form !== lower ? cap(s) : s;
}
const englishForm = (name, form) => form === "a" ? (/^[aeiou]/i.test(name) ? "an " : "a ") + name : form === "the" ? `the ${name}`
  : form === "pl" ? `${name}s` : form === "low" ? name.toLowerCase() : null;

// The text of a blank: [text, ink] as its parts (an ink of null keeps the sentence's)
function blank(body, vars) {
  const bar = body.indexOf("|");
  if (bar >= 0) {                  // {n|one:...|other:...}
    const n = Number(vars[body.slice(0, bar)]), cases = Object.fromEntries(body.slice(bar + 1).split("|").map(c => {
      const i = c.indexOf(":");
      return [c.slice(0, i), c.slice(i + 1)];
    }));
    return [cases[plurals.select(n)] ?? cases.other ?? "", null];
  }
  const [name, form] = body.split(":"), v = vars[name];
  if (v == null) return [`{${body}}`, null];
  if (v.noun !== undefined) return [named(v.noun, form, v.proper), v.ink ?? null];
  if (Array.isArray(v)) return [String(v[0]), v[1] ?? null];
  return [String(v), null];
}

// The sentence, translated, as runs of [text, ink]: its own words in `ink`, a blank's in its own
const parse = text => text.split(/(\{[^{}]+\}|<\/?[\w]*>)/);
export function tr(text, vars = {}, ink) {
  const runs = [], inks = [ink];
  for (const part of parse(strings.get(text) ?? (nouns.get(text)?.[""] || text))) {
    if (!part) continue;
    if (part === "</>") { if (inks.length > 1) inks.pop(); continue; }
    const tag = /^<(\w+)>$/.exec(part);
    if (tag && tag[1] in vars) { inks.push(vars[tag[1]]); continue; }
    const [s, own] = part.startsWith("{") && part.endsWith("}") ? blank(part.slice(1, -1), vars) : [part, null];
    const k = own ?? inks.at(-1), last = runs.at(-1);
    if (last && last[1] === k) last[0] += s;
    else runs.push(k === undefined ? [s] : [s, k]);
  }
  return runs;
}
// ...and as a string
// (a line alone that's a name is found among the names too)
export const tl = (text, vars) => (vars || /[{<]/.test(text) ? tr(text, vars).map(([s]) => s).join("") : strings.get(text) ?? (nouns.get(text)?.[""] || text));
// A name alone, translated (the form, if asked for, as above)
export const nameOf = (name, form) => named(name, form);
