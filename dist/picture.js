// An image the game can't start without, made sure of: one that fails to decode, or decodes
// 0 px wide (a load cut short: Safari can say a broken one decoded), is asked for again, past
// the cache, after each of `waits` ms (a phone's network dropping out for a moment); if the
// last fails too it rejects, naming the file (the dashboard's Health tab shows it, and the game
// shows #load-error). A decode() that's refused for an image that loaded all the same (some
// browsers refuse one in a tab that's hidden) counts as loaded. (3 tries more since 2026-10-25,
// once till then: "couldn't load font.png" was the Health tab's most common error)
const PICTURE = { waits: [0, 1500, 4000] };
export async function loaded(img) {
  for (let tries = 0; ; tries++) {
    if (await shows(img)) return img;
    const file = img.src.split("?")[0];
    if (tries >= PICTURE.waits.length) throw new Error(`couldn't load ${file.split("/").pop()}`);
    await new Promise(go => setTimeout(go, PICTURE.waits[tries]));
    img.src = `${file}?retry=${Date.now()}`;
  }
}
// Whether it's there to draw, once it's done loading
async function shows(img) {
  try { await img.decode(); } catch {
    if (!img.complete) await new Promise(done => { img.addEventListener("load", done, { once: true }); img.addEventListener("error", done, { once: true }); });
  }
  return img.complete && img.naturalWidth > 0;
}
