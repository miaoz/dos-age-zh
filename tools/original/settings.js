// The player's settings (the settings panel, see game.js SETTINGS; the user's, 2026-10-18), kept
// in this browser: the environment's and the gameplay's volume (0-100, in tens), whether blood is
// shown, whether motion's reduced (on top of the device's own setting), the keys that move (`move`:
// "wasd", "vim", or "custom", the custom ones `keys`, up, down, left and right, by where they are
// on the keyboard), the key that uses and talks (`use`, as game.js keyOf() reads it), and on a
// touch screen whether there's a d-pad to walk with (`dpad`) and which side it's on (`dpadSide`). They
// change only what's drawn, heard and pressed, never what happens: replays and scores are the same.
// And whether the screen's bowed like a tube's glass (`curve`, crt.js CURVE, 2026-10-27).
// And the language (`lang`: "auto", the browser's, or one of lang.js LANGUAGES, 2026-10-26).
const KEY = "dosage.settings";
export const DEFAULTS = { env: 100, gameplay: 100, blood: true, calm: false, curve: true, move: "wasd", keys: ["KeyW", "KeyS", "KeyA", "KeyD"], use: "KeyF",
  dpad: false, dpadSide: "right", lang: "auto" };
// The moves' keys, up, down, left and right (the arrows always move too)
export const MOVES = { wasd: ["KeyW", "KeyS", "KeyA", "KeyD"], vim: ["KeyK", "KeyJ", "KeyH", "KeyL"] };
const copy = o => JSON.parse(JSON.stringify(o));
export const settings = (() => {
  try { return { ...copy(DEFAULTS), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return copy(DEFAULTS); }
})();
export const moveKeys = () => MOVES[settings.move] ?? settings.keys;

const listeners = [];
// fn now, and again whenever a setting changes
export function onSettings(fn) { listeners.push(fn); fn(settings); }
export function setSetting(k, v) { settings[k] = v; saved(); }
export function resetSettings() { Object.assign(settings, copy(DEFAULTS)); saved(); }
function saved() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {}
  listeners.forEach(fn => fn(settings));
}
