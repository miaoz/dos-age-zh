from pathlib import Path
R=Path(__file__).resolve().parents[1]
def load(name): return (R/'tools/original'/name).read_text()
def save(name,s): (R/'dist'/name).write_text(s)
s=load('lang.js')
a=s.index('export const LANGUAGES = '); b=s.index(';',a)
s=s[:a]+'export const LANGUAGES = { "zh-CN": "简体中文", en: "English" }'+s[b:]
# Composite ally spell names are internal identifiers too (buff detection uses English).
# Translate their parts only when displayed, preserving gameplay identifiers.
s=s.replace('const lower = form.charAt(0)', """const owned = name.match(/^(.+)'s (.+)$/);
  if (lang !== "en" && owned && nouns.has(owned[2])) {
    return tl("{owner}'s {spell}", { owner: named(owned[1]), spell: named(owned[2]) });
  }
  const lower = form.charAt(0)""")
save('lang.js',s)
s=load('settings.js').replace('lang: "auto"','lang: "zh-CN"').replace('"dosage.settings"','"dosage.zh.settings"')
save('settings.js',s)
s=load('text.js')
s='import { isCJK, CJK_ADVANCE, drawCJK, cjkReady } from "./zh-font.js";\n'+s
s=s.replace('export const fontReady = loaded(strip);', 'export const fontReady = Promise.all([loaded(strip), cjkReady]);')
s=s.replace('const glyph = ch => glyphs[ch] || glyphs["?"];', 'const glyph = ch => isCJK(ch) ? [0, CJK_ADVANCE] : glyphs[ch] || glyphs["?"];')
s=s.replace('const [gx, adv] = glyph(ch);','if (isCJK(ch)) { drawCJK(ctx, ch, x, y, f, colour); x += CJK_ADVANCE * f; continue; }\n      const [gx, adv] = glyph(ch);')
s=s.replace('const sansGlyph = (ch, font = sansFont) => font.glyphs[ch] ?', 'const sansGlyph = (ch, font = sansFont) => isCJK(ch) ? [font, [0, CJK_ADVANCE]] : font.glyphs[ch] ?')
s=s.replace('const [from, [gx, adv]] = sansGlyph(ch, font);', 'if (isCJK(ch)) { drawCJK(ctx, ch, x, y, f, colour); x += CJK_ADVANCE * f; continue; }\n      const [from, [gx, adv]] = sansGlyph(ch, font);')
save('text.js',s)
s=load('game.js')
# Keep floor numbers as variables, and translate when entering (not when caching a map).
for old, new in [
    ('says: `You climb back up to floor ${depth - 1} of the cave.`',
     'get says() { return tl("You climb back up to floor {n} of the cave.", { n: depth - 1 }); }'),
    ('says: depth > 1 ? `You climb down to floor ${depth} of the cave.` : "You climb down into the cave. It\'s dark."',
     'get says() { return depth > 1 ? tl("You climb down to floor {n} of the cave.", { n: depth }) : tl("You climb down into the cave. It\'s dark."); }'),
    ('english("freezes solid")', 'english("{foe:The} freezes solid!")'),
    ('english("is paralysed")', 'english("{foe:The} is paralysed!")'),
    ('skill.held ? "{foe:The} is stunned!" : `{foe:The} ${says}!`',
     'skill.held ? "{foe:The} is stunned!" : says'),
]:
    assert s.count(old) == 1, f'Localization patch no longer matches: {old}'
    s=s.replace(old,new)
s='import { wrapChinese, chineseTokens } from "./zh-layout.js";\n'+s
s=s.replace('function wrap(text, colour, w, scale) {','function wrap(text, colour, w, scale) {\n  if (/[\\u2e80-\\u9fff]/u.test(tl(text))) return wrapChinese(tl(text), t => Math.round((textWidth([[t]]) - 1) * scale), w).map(t => [[t, colour]]);')
s=s.replace('function sheetWrap(text, ink, w, size, font) {','function sheetWrap(text, ink, w, size, font) {\n  if (/[\\u2e80-\\u9fff]/u.test(text)) return wrapChinese(text, t => sheetW([[t]], size, font), w).map(t => [[t, ink]]);')
s=s.replace('...text.split(/\\s+/).map(word => sheetW([[word]], size, font))','...chineseTokens(text).map(word => sheetW([[word]], size, font))')
s=s.replace('const ABOUT_URL = "https://about.dos-age.com/";', 'const ABOUT_URL = "/about.html";')
s=s.replace('const trying = local || query.has("debug");', 'const trying = query.has("debug");')
s=s.replace('setAttribute("aria-label", "Chat")', 'setAttribute("aria-label", "聊天（本地版离线）")').replace('setAttribute("aria-label", "Your name for the scoreboard")', 'setAttribute("aria-label", "排行榜昵称")')
s=s.replace('function connectChat() {','function connectChat() {\n  return; // Local edition: no official chat backend.\n')
s=s.replace('function humanToken() {','function humanToken() {\n  return Promise.resolve(null); // Local edition has no leaderboard ticket service.\n')
s=s.replace('function askTicket(tries = TICKET.tries) {','function askTicket(tries = TICKET.tries) {\n  return; // Local edition: no telemetry or leaderboard submissions.\n')
s=s.replace('function fault(msg) {','function fault(msg) {\n  return; // Errors remain in the local console.\n')
s=s.replace('ariaLabel: "Chat"','ariaLabel: "聊天（本地版离线）"').replace('ariaLabel: "Your name for the scoreboard"','ariaLabel: "排行榜昵称"')
save('game.js',s)
save('kofi.js','''// Preserve author attribution without loading a third-party payment widget.
export function showKofi(on, phone) {
 const host = document.getElementById("kofi");
 if (host) host.hidden = !on;
}
''')

s=load('title.js')
s='import { wrapChinese } from "./zh-layout.js";\n'+s
s=s.replace('function wrap(text, w, k) {','function wrap(text, w, k) {\n  if (/[\\u2e80-\\u9fff]/u.test(text)) return wrapChinese(text, t => sansWidth([[t]]) * k, w);')
save('title.js',s)
