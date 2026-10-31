// Immutable 2D cache recovery. CPU ImageData survives a GPU backing-store reset.
// No document/prototype patching, network telemetry, or gameplay mutations.
const records = new WeakMap(), refs = new Set(), observers = new Set();
const KEY = 'dosage.render-health.v1', LIMIT = 160;
let events = [], state = () => ({}), cursor = 0, lastFrame = 0, recoveries = 0;
try { events = JSON.parse(sessionStorage.getItem(KEY) || '[]').slice(-LIMIT); } catch {}
const run = Date.now().toString(36);
const short = value => String(value ?? '').slice(0, 800);
export function recordRenderEvent(type, detail = {}) {
  const event = { at: new Date().toISOString(), run, type, detail };
  if (/lost|restored|unhealthy|failed|error/.test(type)) {
    try { event.game = state(); } catch {}
    event.visibility = typeof document === 'undefined' ? null : document.visibilityState;
    event.frameAgeMs = lastFrame ? Math.round(performance.now() - lastFrame) : null;
  }
  const prev = events.at(-1);
  if (prev?.run === run && prev.type === type && JSON.stringify(prev.detail) === JSON.stringify(detail) && Date.now() - Date.parse(prev.at) < 5000) {
    prev.count = (prev.count || 1) + 1;
  } else events.push(event);
  events = events.slice(-LIMIT);
  try { sessionStorage.setItem(KEY, JSON.stringify(events)); } catch {}
  for (const notify of observers) notify(event);
}
export function setRenderState(read) { state = read; }
export function renderHeartbeat() { lastFrame = performance.now(); }

function live() {
  const all = [];
  for (const ref of refs) {
    const c = ref.deref();
    if (c) all.push([c, records.get(c)]); else refs.delete(ref);
  }
  return all;
}
function probe(c, r) {
  const g = c.getContext('2d');
  if (g.isContextLost?.()) return 'context-lost';
  if (c.width !== r.pixels.width || c.height !== r.pixels.height) return 'size-changed';
  if (r.point < 0) return 'empty-by-design';
  const p = r.point, x = p % c.width, y = Math.floor(p / c.width);
  // A known nontransparent pixel is sufficient to detect the all-zero failure.
  return g.getImageData(x, y, 1, 1).data[3] === 0 ? 'blank' : 'ok';
}
function restore(c, r, reason) {
  if (c.getContext('2d').isContextLost?.()) return false;
  const now = performance.now();
  if (now - r.lastAttempt < 2000) return false;
  r.lastAttempt = now;
  try {
    // Restoring an immutable cache must not reset game state or rebuild mutable SCENE tables.
    c.width = r.pixels.width; c.height = r.pixels.height;
    c.getContext('2d').putImageData(r.pixels, 0, 0);
    const status = probe(c, r);
    if (status !== 'ok' && status !== 'empty-by-design') throw new Error(status);
    r.lastStatus = status;
    recoveries++;
    recordRenderEvent('cache-restored', { label: r.label, reason, width: c.width, height: c.height });
    return true;
  } catch (error) {
    recordRenderEvent('cache-restore-failed', { label: r.label, reason, message: short(error.message) });
    return false;
  }
}
export function retainCanvas(c, label, critical = false) {
  if (records.has(c)) return c;
  try {
    const g = c.getContext('2d');
    if (g.isContextLost?.()) throw new Error('context already lost at cache creation');
    const pixels = g.getImageData(0, 0, c.width, c.height);
    let point = -1;
    for (let i = 3; i < pixels.data.length; i += 4) if (pixels.data[i]) { point = (i - 3) / 4; break; }
    const r = { label, critical, pixels, point, lastAttempt: -Infinity };
    records.set(c, r); refs.add(new WeakRef(c));
    // Do not preventDefault on the 2D event: that would opt out of automatic restoration.
    c.addEventListener('contextlost', e => recordRenderEvent('2d-context-lost', { label, trusted: e.isTrusted }));
    c.addEventListener('contextrestored', e => {
      recordRenderEvent('2d-context-restored', { label, trusted: e.isTrusted });
      restore(c, r, 'contextrestored');
    });
  } catch (error) { recordRenderEvent('cache-backup-failed', { label, message: short(error.message) }); }
  return c;
}
// The screen is redrawn every frame; only its reset drawing state needs restoring.
export function watchScreen(c) {
  c.addEventListener('contextlost', e => recordRenderEvent('2d-context-lost', { label: 'screen', trusted: e.isTrusted }));
  c.addEventListener('contextrestored', e => {
    c.getContext('2d').imageSmoothingEnabled = false;
    recordRenderEvent('2d-context-restored', { label: 'screen', trusted: e.isTrusted });
    checkRenderCaches(true);
  });
}
export function checkRenderCaches(full = true) {
  const all = live(), ordinary = all.filter(([, r]) => !r.critical);
  const chosen = full ? all : all.filter(([, r]) => r.critical).concat(
    Array.from({ length: Math.min(8, ordinary.length) }, (_, i) => ordinary[(cursor + i) % ordinary.length]));
  cursor = ordinary.length ? (cursor + 8) % ordinary.length : 0;
  let damaged = 0, repaired = 0;
  for (const [c, r] of chosen) {
    try {
      const status = probe(c, r);
      if (status === 'ok' || status === 'empty-by-design') { r.lastStatus = status; continue; }
      damaged++;
      if (r.lastStatus !== status) recordRenderEvent('cache-unhealthy', { label: r.label, status, width: c.width, height: c.height });
      r.lastStatus = status;
      if (status !== 'context-lost' && restore(c, r, status)) repaired++;
    } catch (error) { recordRenderEvent('cache-probe-failed', { label: r.label, message: short(error.message) }); }
  }
  // A damaged atlas usually means other GPU-backed caches were cleared too.
  // Sweep fonts/effects immediately instead of waiting for the rotating probes.
  if (!full && damaged) {
    const rest = checkRenderCaches(true);
    return { checked: chosen.length + rest.checked, damaged: damaged + rest.damaged, repaired: repaired + rest.repaired };
  }
  return { checked: chosen.length, damaged, repaired };
}
export function renderReport() {
  let game;
  try { game = state(); } catch (error) { game = { error: short(error.message) }; }
  return {
    format: 1, build: 'render-recovery-1', exportedAt: new Date().toISOString(), run,
    environment: { userAgent: navigator.userAgent, dpr: devicePixelRatio,
      viewport: [innerWidth, innerHeight], visibility: document.visibilityState, online: navigator.onLine },
    frameAgeMs: lastFrame ? Math.round(performance.now() - lastFrame) : null, recoveries, game,
    caches: live().map(([c, r]) => ({ label: r.label, width: c.width, height: c.height,
      backupBytes: r.pixels.data.byteLength, lost: c.getContext('2d').isContextLost?.() ?? null })),
    events: events.map(e => ({ ...e }))
  };
}
export function mountRenderDiagnostics() {
  const host = document.createElement('details');
  host.id = 'render-diagnostics';
  host.innerHTML = '<summary>画面诊断</summary><p role="status">正在监测画面。记录仅保存在本机当前标签页。</p><button type="button" data-action="check">检查并恢复画面</button> <button type="button" data-action="export">下载诊断记录</button><p>出现异常时先下载记录，再尝试恢复。刷新可能丢失当前对局。</p>';
  const style = document.createElement('style');
  style.textContent = '#render-diagnostics{position:fixed;z-index:100;right:10px;top:76px;max-width:min(320px,85vw);color:#c7bbb2;background:#071324ee;border:1px solid #3f3f74;padding:7px;font:14px/1.5 sans-serif}#render-diagnostics summary{cursor:pointer}#render-diagnostics p{margin:8px 0}#render-diagnostics button{font:inherit;background:#222034;color:#fff;border:1px solid #847e87;padding:6px;cursor:pointer}';
  document.head.append(style); document.body.append(host);
  const status = host.querySelector('[role="status"]');
  observers.add(e => {
    if (e.type === 'cache-restored') status.textContent = `已自动恢复画面缓存（${recoveries} 项）。可下载记录查看原因。`;
    else if (/failed|unhealthy|lost|error/.test(e.type)) status.textContent = '已记录画面异常。可下载诊断记录或尝试恢复。';
  });
  host.querySelector('[data-action="check"]').addEventListener('click', () => {
    recordRenderEvent('manual-check');
    const r = checkRenderCaches();
    status.textContent = `检查 ${r.checked} 项，异常 ${r.damaged} 项，恢复 ${r.repaired} 项。`;
  });
  host.querySelector('[data-action="export"]').addEventListener('click', () => {
    // Export before attempting repairs, preserving the failure evidence.
    const url = URL.createObjectURL(new Blob([JSON.stringify(renderReport(), null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url;
    a.download = `dosage-diagnostics-${Date.now()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  // Canvas game keyboard handlers are on window; prevent UI keystrokes becoming moves.
  for (const type of ['keydown', 'keyup']) window.addEventListener(type, e => {
    if (host.contains(e.target)) e.stopImmediatePropagation();
  }, true);
  setInterval(() => { if (!document.hidden) checkRenderCaches(false); }, 2000);
  document.addEventListener('visibilitychange', () => {
    recordRenderEvent('visibility', { state: document.visibilityState });
    if (!document.hidden) checkRenderCaches(true);
  });
  window.addEventListener('pageshow', e => recordRenderEvent('pageshow', { persisted: e.persisted }));
  window.addEventListener('pagehide', e => recordRenderEvent('pagehide', { persisted: e.persisted }));
  window.addEventListener('error', e => {
    if (e.message) recordRenderEvent('window-error', { message: short(e.message), line: e.lineno, column: e.colno });
    else if (e.target?.src || e.target?.href) {
      const url = new URL(e.target.src || e.target.href, location.href);
      if (url.origin === location.origin) recordRenderEvent('resource-error', { path: url.pathname });
    }
  }, true);
  window.addEventListener('unhandledrejection', e => recordRenderEvent('unhandled-rejection', { message: short(e.reason?.message ?? e.reason) }));
  recordRenderEvent('monitor-start');
}
