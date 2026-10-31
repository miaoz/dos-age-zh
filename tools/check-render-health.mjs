import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// Exercise production recovery against an in-memory Canvas model. Browser fault
// injection additionally verifies real drawImage/getImageData on the running game.
let now = 10000;
class Canvas extends EventTarget {
  constructor(w = 2, h = 2) {
    super(); this.w = w; this.h = h; this.data = new Uint8ClampedArray(w * h * 4); this.lost = false;
    this.g = {
      isContextLost: () => this.lost,
      getImageData: (x, y, w, h) => {
        const data = new Uint8ClampedArray(w * h * 4);
        if (!this.lost) for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
          data.set(this.data.subarray(((y + yy) * this.w + x + xx) * 4, ((y + yy) * this.w + x + xx) * 4 + 4), (yy * w + xx) * 4);
        }
        return { width: w, height: h, data };
      },
      putImageData: img => { if (!this.lost) this.data.set(img.data); },
    };
  }
  get width() { return this.w; }
  set width(v) { this.w = v; this.data = new Uint8ClampedArray(this.w * this.h * 4); }
  get height() { return this.h; }
  set height(v) { this.h = v; this.data = new Uint8ClampedArray(this.w * this.h * 4); }
  getContext() { return this.g; }
}
const saved = new Map(), gameplay = { turns: 7, hp: 43, x: 1, y: 29 };
const context = {
  WeakMap, WeakRef, Set, Map, Date, JSON, performance: { now: () => now },
  sessionStorage: { getItem: k => saved.get(k), setItem: (k, v) => saved.set(k, v) },
  document: { visibilityState: 'visible' }, navigator: { userAgent: 'test', onLine: true },
  devicePixelRatio: 1, innerWidth: 100, innerHeight: 100,
};
const source = (await readFile(new URL('../dist/render-health.js', import.meta.url), 'utf8')).replaceAll('export function ', 'function ');
const api = runInNewContext(source + '\n({retainCanvas, checkRenderCaches, renderReport, recordRenderEvent, setRenderState, watchScreen})', context);
api.setRenderState(() => ({ ...gameplay }));
const c = new Canvas(); c.data.set([7, 19, 36, 255, 10, 20, 30, 255]);
const original = c.data.slice();
api.retainCanvas(c, 'tiles', true);
// Silent all-zero cache, with a healthy context: the original production symptom.
const font = new Canvas(); font.data.set([1, 2, 3, 255]);
api.retainCanvas(font, 'font');
c.data.fill(0); font.data.fill(0);
assert.equal(api.checkRenderCaches(false).repaired, 2);
assert.equal(font.data[3], 255);
assert.deepEqual(c.data, original);
assert.equal(api.checkRenderCaches(false).damaged, 0);
assert.deepEqual(gameplay, { turns: 7, hp: 43, x: 1, y: 29 });
// The 2D loss event must remain uncancelled; restoration needs the original backup.
now += 3000; c.data.fill(0); c.lost = true;
const lost = new Event('contextlost', { cancelable: true });
c.dispatchEvent(lost);
assert.equal(lost.defaultPrevented, false);
assert.equal(api.checkRenderCaches(false).repaired, 0);
c.lost = false; c.dispatchEvent(new Event('contextrestored'));
assert.deepEqual(c.data, original);
// Empty glyphs/masks are legitimate and must not trigger repair loops.
api.retainCanvas(new Canvas(), 'space');
assert.equal(api.checkRenderCaches().damaged, 0);
// Canvas dimension resets must also restore the original dimensions and pixels.
now += 3000; c.width = 1;
assert.equal(api.checkRenderCaches().repaired, 1);
assert.equal(c.width, 2); assert.deepEqual(c.data, original);
const screen = new Canvas(); api.watchScreen(screen);
screen.g.imageSmoothingEnabled = true; screen.dispatchEvent(new Event('contextrestored'));
assert.equal(screen.g.imageSmoothingEnabled, false);
const report = api.renderReport();
for (const type of ['cache-unhealthy', 'cache-restored', '2d-context-lost', '2d-context-restored']) assert.ok(report.events.some(e => e.type === type), type);
assert.equal(report.events.find(e => e.type === 'cache-unhealthy').game.hp, 43);
// Bounded records, persistence across reload, and unavailable storage.
for (let i = 0; i < 180; i++) api.recordRenderEvent('test', { i });
assert.equal(api.renderReport().events.length, 160);
assert.equal(JSON.parse(saved.get('dosage.render-health.v1')).length, 160);
const reloaded = runInNewContext(source + '\nrenderReport()', { ...context });
assert.equal(reloaded.events.length, 160);
context.sessionStorage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
runInNewContext(source + '\nrecordRenderEvent("storage-blocked");', { ...context });
console.log('PASS: silent cache clearing, context loss/restoration, preserved gameplay, empty caches, resize, bounded persisted diagnostics and blocked storage.');
