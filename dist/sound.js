// Synthesised sound, no audio files: a soft footstep per step, chops and blows, a chime when
// something drops, the handling of things (picking up, a chest's lid, putting down, gear and
// spells changing places), the frost and thunder of spells, a ghost's wail, and a quiet forest bed (wind through leaves, now and then a bird;
// at night crickets instead, and now and then an owl, see night()), which gives way to a
// heartbeat when health runs low, or to Byzantine chant inside a church. Since v0.12 also the
// journey's moments (a level, death, the days' turns), finds worth a second look, digging and
// mining, the class skills and the tier IV spells, the hunters, and beds of their own for the
// dead wood and the cave, with what's heard near lava, crystals, a burning bush, a village or a
// void orb (see surroundings()). Browsers only allow audio after the player
// does something, so everything starts on the first key press or tap. M mutes.

const STEP_VOLUME = 0.32;
const CHOP_VOLUME = 0.3;
const HIT_VOLUME = 0.35;
const WHIFF_VOLUME = 0.12;
const LOOT_VOLUME = 0.09;
const HANDLE_VOLUME = 0.16;
const SPELL_VOLUME = 0.12;     // an Ice Ring's freeze and a Thunderbolt's thunder    // picking up, putting down, a chest's lid, gear and spells changing places
const WAIL_VOLUME = 0.035;
const WIND_VOLUME = 0.05;
const BIRD_VOLUME = 0.025;
const BIRD_GAP = [4, 12];      // seconds between birds, min..max
const HEART_VOLUME = 0.55;
const HEART_GAP = { slow: 1.1, fast: 0.52 };   // seconds between beats (about 55 and 115 a minute)
const AMBIENT_FADE = 0.6;      // seconds (time constant) for the forest to fall quiet or return
// The forest at night (see night()): the wind down to `wind` of itself, no birds, and crickets
// instead, sung as field crickets do: `crickets` of them, each at its own pitch (`pitch`, Hz,
// min..max) and its own distance (`near`, a share of full volume, min..max: the further off,
// the quieter and duller), chirping at a steady pace of its own (one every `period` s, min..max,
// a little uneven), each chirp `syllables` (min..max) short pulses `sylMs` long, `sylEvery` ms
// apart, gliding down a touch; now and then (`rest` of the chirps) one falls silent for `restS`
// s (min..max). Under them all a faint far-off trill (`chorus`), and now and then an owl's two
// hoots, `owlGap` s (min..max) apart. `fade` s (a time constant) to cross over.
const NIGHT = { wind: 0.55, crickets: 5, pitch: [4200, 4900], near: [0.25, 1], period: [0.45, 0.9], syllables: [3, 5],
  sylMs: 15, sylEvery: 34, rest: 0.05, restS: [2, 7], cricketVolume: 0.014, chorus: 0.0025,
  owlVolume: 0.03, owlGap: [14, 32], fade: 3 };

import { settings, onSettings } from "./settings.js";

// Everything goes through `top` (muted with M); the forest's and the beds' sounds, the church's
// choir and the title's tune through `env`, at the settings' Environment volume, and the rest,
// the game's own, through `master`, at its Gameplay volume (settings.js; the user's, 2026-10-18)
let ctx = null, master = null, noise = null, top = null, env = null;
const volume = n => (n / 100) ** 2;   // (the slider's tens, heard as even steps)
onSettings(s => {
  if (!ctx) return;
  master.gain.setTargetAtTime(volume(s.gameplay), ctx.currentTime, 0.05);
  env.gain.setTargetAtTime(volume(s.env), ctx.currentTime, 0.05);
});
let ambient = null;            // the forest bed's own level, under the master
let heartRate = null, heartTimer = null, onBeatFn = null;
let chanting = false, choir = null;   // (see chant())
let titling = false, harp = null;     // (see titleTune())
let nighttime = false, windGain = null, nightBed = null;   // (see night())
let outdoors = null;           // the forest's wind, birds and night, under the ambient
let muted = false;
try { muted = localStorage.getItem("mektxt.muted") === "1"; } catch {}
let away = false;              // on the website: silent too, but not by choice (see setAway())
const silent = () => muted || away;
const hushed = () => !!heartRate || chanting || titling;   // (the forest's bed gives way)

// Two seconds of white noise, reused by every sound
function noiseBuffer() {
  const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function start() {
  if (ctx) { if (ctx.state !== "running") ctx.resume()?.catch?.(() => {}); return; }   // (suspended, or "interrupted": iOS, after another app; refused, it's asked again at the next press)
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  // iOS plays a page's sound as "ambient" otherwise, which Silent mode (the iPad's Control Center
  // bell, the iPhone's switch) mutes outright; a game's sound is what it's played for
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch {}
  // (a phone's audio, given the shortest buffer it can, runs dry under load and crackles; a little
  // more latency there is worth it, unheard in a game of turns)
  ctx = new AC({ latencyHint: matchMedia("(pointer: coarse)").matches ? "playback" : "interactive" });
  top = ctx.createGain();
  top.gain.value = silent() ? 0 : 1;
  // a limiter last, so a pile of sounds at once is held under full scale rather than clipping,
  // which a phone's speaker gives as a burst of noise
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20;
  limiter.attack.value = 0.002; limiter.release.value = 0.1;
  top.connect(limiter).connect(ctx.destination);
  master = ctx.createGain();
  master.gain.value = volume(settings.gameplay);
  master.connect(top);
  env = ctx.createGain();
  env.gain.value = volume(settings.env);
  env.connect(top);
  ambient = ctx.createGain();
  plug(ambient, env, hushed() ? 0 : 1);
  noise = noiseBuffer();
  outdoors = ctx.createGain();     // (the forest's own: wind, birds, the night; off in the cave, see BED)
  plug(outdoors, ambient, 1);
  startWind();
  scheduleBird();
  nightBed = ctx.createGain();
  plug(nightBed, outdoors, nighttime && heard().bed === "forest" ? 1 : 0);
  if (nighttime) windGain.gain.value = NIGHT.wind;
  for (let i = 0; i < NIGHT.crickets; i++) cricket(NIGHT.pitch[0] + Math.random() * (NIGHT.pitch[1] - NIGHT.pitch[0]));
  chorus();
  scheduleOwl();
  if (heartRate) beat();
  if (chanting) startChoir();
  if (titling) startHarp();
  startBeds();
}

// A bus that's fallen silent is unplugged from where it goes, so what's under it (oscillators,
// noise loops, filters) isn't worked out at all till it's heard again: some forty of them always
// running, the beds' and the crickets', were more than a phone's audio could keep up with, and it
// crackled. plug() sets one up at `v`; fade() eases it to `v` over the time constant `tc`.
function plug(g, to, v) {
  g.to = to; g.gain.value = v; g.plugged = v > 0;
  if (g.plugged) g.connect(to);
}
function fade(g, v, tc) {
  g.gain.setTargetAtTime(v, ctx.currentTime, tc);
  clearTimeout(g.unplug);
  if (v > 0) { if (!g.plugged) g.connect(g.to), g.plugged = true; }
  else if (g.plugged) g.unplug = setTimeout(() => { g.disconnect(); g.plugged = false; }, tc * 7000);
}

// Nothing's heard while the page is hidden (the phone locked, another tab): the audio stops
// working too, and starts again on coming back (or, if that's refused, at the next press)
document.addEventListener("visibilitychange", () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend()?.catch?.(() => {});
  else ctx.resume()?.catch?.(() => {});
});

// Wind: looping noise through a low band-pass whose level and pitch drift slowly
function startWind() {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass"; band.frequency.value = 500; band.Q.value = 0.7;
  const low = ctx.createBiquadFilter();
  low.type = "lowpass"; low.frequency.value = 1200;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.gain.linearRampToValueAtTime(WIND_VOLUME, ctx.currentTime + 3); // fade in
  windGain = ctx.createGain();     // (quieter at night, see night())
  src.connect(band).connect(low).connect(gain).connect(windGain).connect(outdoors);

  // slow gusts: two LFOs at unrelated rates so it never loops audibly
  const lfo = (rate, depth, target) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = rate; g.gain.value = depth;
    o.connect(g).connect(target);
    o.start();
  };
  lfo(0.07, WIND_VOLUME * 0.5, gain.gain);
  lfo(0.13, 180, band.frequency);
  src.start();
}

// Bird: two or three quick falling chirps, panned somewhere off to the side
function bird() {
  const t0 = ctx.currentTime;
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (pan) { pan.pan.value = (Math.random() * 2 - 1) * 0.8; pan.connect(outdoors); }
  const base = 2600 + Math.random() * 1400;
  const chirps = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < chirps; i++) {
    const t = t0 + i * (0.11 + Math.random() * 0.05);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(base * 1.25, t);
    o.frequency.exponentialRampToValueAtTime(base * 0.8, t + 0.07);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(BIRD_VOLUME, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g).connect(pan || outdoors);
    o.start(t);
    o.stop(t + 0.1);
  }
}

function scheduleBird() {
  const [lo, hi] = BIRD_GAP;
  setTimeout(() => { if (ctx.state === "running" && !nighttime && heard().bed === "forest") bird(); scheduleBird(); }, (lo + Math.random() * (hi - lo)) * 1000);
}

// Night or day (true or false); like heartbeat(), safe to call every frame, and one made before
// sound has started applies once it does
export function night(on) {
  if (on === nighttime) return;
  nighttime = on;
  if (!ctx) return;
  fade(nightBed, on && heard().bed === "forest" ? 1 : 0, NIGHT.fade);
  windGain.gain.setTargetAtTime(on ? NIGHT.wind : 1, ctx.currentTime, NIGHT.fade);
}
// A cricket (heard only at night): a tone and its octave, quiet between chirps, somewhere off to
// the side, chirping for ever. Its chirps are timed on the audio clock, so its pace stays steady.
function cricket(pitch) {
  const pick = ([lo, hi]) => lo + Math.random() * (hi - lo), near = pick(NIGHT.near), period = pick(NIGHT.period);
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null, g = ctx.createGain(), lp = ctx.createBiquadFilter();
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g2 = ctx.createGain();
  o.type = o2.type = "sine";
  o.frequency.value = pitch;
  o2.frequency.value = pitch * 2;
  g2.gain.value = 0.12;            // (the octave, faint: the wing's rasp)
  lp.type = "lowpass"; lp.frequency.value = 3000 + near * 7000;
  g.gain.value = 0;
  o.connect(g); o2.connect(g2).connect(g);
  g.connect(lp);
  if (pan) { pan.pan.value = (Math.random() * 2 - 1) * 0.9; lp.connect(pan).connect(nightBed); }
  else lp.connect(nightBed);
  o.start(); o2.start();
  let next = ctx.currentTime + Math.random() * period;
  const chirp = () => {
    if (next < ctx.currentTime) next = ctx.currentTime + 0.05;
    if (nighttime && ctx.state === "running") {
      const n = Math.round(pick(NIGHT.syllables)), len = NIGHT.sylMs / 1000, vol = NIGHT.cricketVolume * near;
      for (let i = 0; i < n; i++) {
        const t = next + i * NIGHT.sylEvery / 1000, v = vol * (i === 0 ? 0.7 : 1 - i * 0.04);  // (the first a little softer)
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(v, t + 0.003);
        g.gain.setValueAtTime(v, t + len - 0.004);
        g.gain.linearRampToValueAtTime(0, t + len);
        o.frequency.setValueAtTime(pitch * 1.008, t);
        o.frequency.linearRampToValueAtTime(pitch * 0.99, t + len);
        o2.frequency.setValueAtTime(pitch * 2.016, t);
        o2.frequency.linearRampToValueAtTime(pitch * 1.98, t + len);
      }
    }
    next += Math.random() < NIGHT.rest ? pick(NIGHT.restS) : period * (0.96 + Math.random() * 0.08);
    setTimeout(chirp, Math.max(0, (next - ctx.currentTime - 0.1) * 1000));
  };
  chirp();
}
// The far-off crickets: noise narrowed to a high whine, trilling (a fast, slightly wavering
// pulse) at a whisper, under the near ones
function chorus() {
  const src = ctx.createBufferSource(), band = ctx.createBiquadFilter(), g = ctx.createGain(), trill = ctx.createGain();
  src.buffer = noise; src.loop = true;
  band.type = "bandpass"; band.frequency.value = 4500; band.Q.value = 25;
  g.gain.value = NIGHT.chorus;
  trill.gain.value = 0.5;
  const lfo = ctx.createOscillator(), depth = ctx.createGain(), wobble = ctx.createOscillator(), wd = ctx.createGain();
  lfo.type = "square"; lfo.frequency.value = 28;
  depth.gain.value = 0.5;
  lfo.connect(depth).connect(trill.gain);
  wobble.frequency.value = 0.3; wd.gain.value = 3;  // (its pace wavers, as a crowd's does)
  wobble.connect(wd).connect(lfo.frequency);
  src.connect(band).connect(trill).connect(g).connect(nightBed);
  src.start(); lfo.start(); wobble.start();
}
// An owl: two soft, low hoots, the second longer, sliding down a little, somewhere far off
function owl() {
  const t0 = ctx.currentTime, pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (pan) { pan.pan.value = (Math.random() * 2 - 1) * 0.7; pan.connect(nightBed); }
  const base = 330 + Math.random() * 60;
  for (const [at, len] of [[0, 0.28], [0.42, 0.55]]) {
    const t = t0 + at, o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = "triangle";
    o.frequency.setValueAtTime(base * 1.04, t);
    o.frequency.exponentialRampToValueAtTime(base * 0.94, t + len);
    lp.type = "lowpass"; lp.frequency.value = 900;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(NIGHT.owlVolume, t + 0.06);
    g.gain.setTargetAtTime(0, t + len * 0.6, len / 4);
    o.connect(lp).connect(g).connect(pan || nightBed);
    o.start(t);
    o.stop(t + len + 0.5);
  }
}
function scheduleOwl() {
  const [lo, hi] = NIGHT.owlGap;
  setTimeout(() => { if (ctx.state === "running" && nighttime) owl(); scheduleOwl(); }, (lo + Math.random() * (hi - lo)) * 1000);
}

// Footstep: a short thud of low-passed noise, a little different every time
export function footstep() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const low = ctx.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.setValueAtTime(900 + Math.random() * 300, t);
  low.frequency.exponentialRampToValueAtTime(200, t + 0.08);
  const g = ctx.createGain();
  g.gain.setValueAtTime(STEP_VOLUME * (0.8 + Math.random() * 0.2), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  src.connect(low).connect(g).connect(master);
  src.start(t, Math.random() * 1.5, 0.1);
}

// Chop: an axe biting wood, a hollow knock over a short crack; the felling blow is lower
// and rings on a little longer
export function chop(felled = false) {
  if (!ctx) return;
  const t = ctx.currentTime, len = felled ? 0.3 : 0.14;
  const o = ctx.createOscillator(), og = ctx.createGain();
  o.type = "triangle";
  o.frequency.setValueAtTime((felled ? 150 : 210) * (0.95 + Math.random() * 0.1), t);
  o.frequency.exponentialRampToValueAtTime(felled ? 60 : 110, t + len);
  og.gain.setValueAtTime(CHOP_VOLUME, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(og).connect(master);
  o.start(t);
  o.stop(t + len);
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass"; band.frequency.value = 1800 + Math.random() * 600; band.Q.value = 1.2;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(CHOP_VOLUME * 0.8, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  src.connect(band).connect(ng).connect(master);
  src.start(t, Math.random() * 1.5, 0.06);
}

// Hit: a blow landing, a dull low knock with a rattle of bone over it
export function hit() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(), og = ctx.createGain();
  o.type = "square";
  o.frequency.setValueAtTime(120 * (0.9 + Math.random() * 0.2), t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  og.gain.setValueAtTime(HIT_VOLUME * 0.5, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  o.connect(og).connect(master);
  o.start(t);
  o.stop(t + 0.12);
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass"; band.frequency.value = 2600 + Math.random() * 800; band.Q.value = 3;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(HIT_VOLUME, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  src.connect(band).connect(ng).connect(master);
  src.start(t, Math.random() * 1.5, 0.08);
}

// Whiff: a blow that's dodged, a quick rising swish of air
export function whiff() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass"; band.Q.value = 2;
  band.frequency.setValueAtTime(500, t);
  band.frequency.exponentialRampToValueAtTime(2500, t + 0.15);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(WHIFF_VOLUME, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  src.connect(band).connect(g).connect(master);
  src.start(t, Math.random() * 1.5, 0.17);
}

// Loot: something dropped for the character, a soft clink as it lands and two small notes
// stepping up after it; pleasant, not a fanfare
// Wail: a ghost's, soft and far off: two thin voices a little apart, rising then sinking away
// over a couple of seconds, wavering, with a breath of wind under them
export function wail() {
  if (!ctx) return;
  const t = ctx.currentTime, len = 2.6, base = 520 + Math.random() * 90;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(WAIL_VOLUME, t + 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  const low = ctx.createBiquadFilter();
  low.type = "lowpass"; low.frequency.value = 1400;
  low.connect(g).connect(master);
  const waver = ctx.createOscillator(), depth = ctx.createGain();
  waver.frequency.value = 5; depth.gain.value = 7;
  waver.connect(depth);
  for (const detune of [1, 1.012]) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(base * detune, t);
    o.frequency.linearRampToValueAtTime(base * detune * 1.26, t + 0.9);
    o.frequency.exponentialRampToValueAtTime(base * detune * 0.72, t + len);
    depth.connect(o.frequency);
    o.connect(low);
    o.start(t);
    o.stop(t + len);
  }
  waver.start(t);
  waver.stop(t + len);
  const src = ctx.createBufferSource(), band = ctx.createBiquadFilter(), breath = ctx.createGain();
  src.buffer = noise;
  band.type = "bandpass"; band.frequency.value = base * 2; band.Q.value = 6;
  breath.gain.value = 0.5;
  src.connect(band).connect(breath).connect(g);
  src.start(t, Math.random(), len);
}

export function loot() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass"; band.frequency.value = 3200; band.Q.value = 6;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(LOOT_VOLUME, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  src.connect(band).connect(ng).connect(master);
  src.start(t, Math.random() * 1.5, 0.05);
  [[659.25, 0.05], [987.77, 0.13]].forEach(([freq, at]) => { // E5, then B5
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t + at);
    g.gain.exponentialRampToValueAtTime(LOOT_VOLUME, t + at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.22);
    o.connect(g).connect(master);
    o.start(t + at);
    o.stop(t + at + 0.24);
  });
}

// A burst of filtered noise at t: `type` filter at `freq` (with `q`), `level` loud, over `len` s
function burst(t, type, freq, q, level, len) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 1.5, len + 0.01);
}
// A short tone at t: `type` wave from `from` Hz to `to`, `level` loud, over `len` s
function blip(t, type, from, to, level, len) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + len);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + len + 0.01);
}

// Freeze: an Ice Ring, a cold breath of high hiss rushing out and a scatter of glassy tinkles
// over it, like ice crystals forming, ending on a faint crackle
export function freeze() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass"; band.Q.value = 4;
  band.frequency.setValueAtTime(9000, t);
  band.frequency.exponentialRampToValueAtTime(3500, t + 0.6);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(SPELL_VOLUME * 0.6, t + 0.06);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  src.connect(band).connect(g).connect(master);
  src.start(t, Math.random() * 1.2, 0.72);
  for (let i = 0; i < 6; i++) {
    const f = 1800 + Math.random() * 2600, at = t + 0.03 + i * 0.055 + Math.random() * 0.03;
    blip(at, "sine", f, f * 1.015, SPELL_VOLUME * 0.35, 0.28);
  }
  for (let i = 0; i < 3; i++) burst(t + 0.45 + i * 0.06, "highpass", 5000, 1, SPELL_VOLUME * 0.3, 0.02);
}

// Thunder: a Thunderbolt, a sharp electric crack with a buzz falling through it, then a low
// rumble rolling away
export function thunder() {
  if (!ctx) return;
  const t = ctx.currentTime;
  burst(t, "highpass", 2500, 0.7, SPELL_VOLUME * 2.2, 0.08);
  burst(t + 0.03, "bandpass", 1200, 1.5, SPELL_VOLUME * 1.2, 0.12);
  blip(t, "sawtooth", 1800, 90, SPELL_VOLUME * 0.45, 0.2);
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const low = ctx.createBiquadFilter();
  low.type = "lowpass"; low.Q.value = 0.8;
  low.frequency.setValueAtTime(400, t + 0.05);
  low.frequency.exponentialRampToValueAtTime(90, t + 1.6);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t + 0.05);
  g.gain.exponentialRampToValueAtTime(SPELL_VOLUME * 3, t + 0.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
  src.connect(low).connect(g).connect(master);
  src.start(t + 0.05, Math.random() * 0.2, 1.7);
}

// Pick up: taking something, a quick rustle of cloth and a soft blip rising after it
export function pickUp() {
  if (!ctx) return;
  const t = ctx.currentTime;
  burst(t, "bandpass", 1400, 0.8, HANDLE_VOLUME * 0.6, 0.07);
  blip(t + 0.04, "triangle", 520, 880, HANDLE_VOLUME * 0.7, 0.1);
}

// Creak: a chest's lid lifting, a wooden groan sliding up, then a knock as it falls open
export function creak() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(), band = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(70, t);
  o.frequency.linearRampToValueAtTime(110 + Math.random() * 20, t + 0.28);
  band.type = "bandpass"; band.frequency.value = 900; band.Q.value = 4;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(HANDLE_VOLUME * 0.9, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  o.connect(band).connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.31);
  blip(t + 0.3, "triangle", 160, 70, HANDLE_VOLUME, 0.12);
  burst(t + 0.3, "lowpass", 700, 0.7, HANDLE_VOLUME * 0.8, 0.06);
}

// Thud: something put down on the ground, a soft low bump and a little tap
export function thud() {
  if (!ctx) return;
  const t = ctx.currentTime;
  burst(t, "lowpass", 500, 0.7, HANDLE_VOLUME * 1.4, 0.1);
  blip(t, "sine", 140, 60, HANDLE_VOLUME * 1.2, 0.12);
  burst(t + 0.05, "bandpass", 2400, 4, HANDLE_VOLUME * 0.35, 0.03);
}

// Clasp: gear or spells changing places, a small metal click-clack
export function clasp() {
  if (!ctx) return;
  const t = ctx.currentTime;
  burst(t, "bandpass", 4200, 5, HANDLE_VOLUME * 0.9, 0.035);
  blip(t, "square", 1300, 900, HANDLE_VOLUME * 0.25, 0.04);
  burst(t + 0.07, "bandpass", 3000, 5, HANDLE_VOLUME * 0.7, 0.04);
  blip(t + 0.07, "square", 1000, 700, HANDLE_VOLUME * 0.2, 0.05);
}

// v0.12's sounds (2026-10-12; all Claude's, the user's ask: every skill quiet, being cast over
// and over, and the Screech most of all, so it never grates or makes anyone anxious)
const MOMENT_VOLUME = 0.1;     // a level, death, the days' turns, the hunters
const SKILL_VOLUME = 0.07;     // the class skills and the tier IV spells
const SCREECH_VOLUME = 0.09;   // (louder than the rest since 2026-10-26, the user's: a siren's cry, see screech())
const FIND_VOLUME = 0.08;      // a find worth a second look
const UI_VOLUME = 0.05;        // the tape, a mode picked, a chat line

// A random panner, `wide` of the way to either side, into `to`
function panned(to, wide = 0.8) {
  if (!ctx.createStereoPanner) return to;
  const p = ctx.createStereoPanner();
  p.pan.value = (Math.random() * 2 - 1) * wide;
  p.connect(to);
  return p;
}
// A bell struck at t: `freq`'s partials (a bell's, not a string's: a minor third and the rest
// out of tune) dying away over `len` s, `level` loud, through `to`
function bell(t, freq, level, len, to = master) {
  for (const [ratio, amp, decay] of [[0.5, 0.5, 1], [1, 1, 1], [1.2, 0.45, 0.7], [1.5, 0.3, 0.6], [2, 0.35, 0.5], [2.74, 0.18, 0.35], [3.76, 0.1, 0.25]]) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq * ratio * (1 + (Math.random() - 0.5) * 0.002);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level * amp, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len * decay);
    o.connect(g).connect(to);
    o.start(t);
    o.stop(t + len * decay + 0.02);
  }
}
// A lowpass at `freq` into `to`: what's far off
function far(freq, to = master) {
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = freq;
  lp.connect(to);
  return lp;
}
// A swish of noise at t, its band sliding `from` Hz to `to`, swelling to `level` at `peak` of `len` s
function swish(t, from, to, level, len, peak = 0.35, q = 1.5) {
  const src = ctx.createBufferSource(), band = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noise;
  band.type = "bandpass"; band.Q.value = q;
  band.frequency.setValueAtTime(from, t);
  band.frequency.exponentialRampToValueAtTime(to, t + len);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + len * peak);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(band).connect(g).connect(master);
  src.start(t, Math.random() * 1.2, len + 0.02);
}
// A held tone at t: `type` at `freq`, rising over `attack` s to `level`, dying over `len` s, into `to`
function tone(t, type, freq, level, len, attack = 0.01, to = master) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(to);
  o.start(t);
  o.stop(t + len + 0.02);
  return o;
}

// Level up: four notes stepping up a major chord, then a sparkle over them; bright, short
export function levelUp() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    tone(t + i * 0.075, "triangle", f, MOMENT_VOLUME * 0.9, i === 3 ? 0.75 : 0.45);
    tone(t + i * 0.075, "sine", f * 2, MOMENT_VOLUME * 0.12, 0.3);
  });
  for (let i = 0; i < 6; i++) blip(t + 0.3 + i * 0.045, "sine", 2400 + i * 300, 2500 + i * 300, MOMENT_VOLUME * 0.12, 0.18);
  swish(t + 0.05, 1500, 7000, MOMENT_VOLUME * 0.18, 0.5, 0.8, 0.8);
}
// Death: a low bell tolling twice, the second further off
export function toll() {
  if (!ctx) return;
  const t = ctx.currentTime;
  bell(t, 98, MOMENT_VOLUME * 0.9, 5, far(1400));
  bell(t + 2.4, 98, MOMENT_VOLUME * 0.5, 5, far(900));
}
// The days run out: three bells stepping down to rest, gentler than death's
export function endOfDays() {
  if (!ctx) return;
  const t = ctx.currentTime, to = far(2400);
  [392, 329.63, 261.63].forEach((f, i) => bell(t + i * 0.55, f, MOMENT_VOLUME * (0.45 - i * 0.05), i === 2 ? 4 : 2.2, to));
}
// Dawn: a far-off morning bell, twice
export function morningBell() {
  if (!ctx) return;
  const t = ctx.currentTime, to = panned(far(2000), 0.5);
  bell(t, 587.33, MOMENT_VOLUME * 0.35, 3, to);
  bell(t + 1.1, 587.33, MOMENT_VOLUME * 0.28, 3.5, to);
}
// Nightfall: a dark swell, two low tones a semitone apart under a closing filter, and one deep
// bell far off in it
export function nightFalls() {
  if (!ctx) return;
  const t = ctx.currentTime, len = 3.6, lp = ctx.createBiquadFilter(), g = ctx.createGain();
  lp.type = "lowpass"; lp.Q.value = 2;
  lp.frequency.setValueAtTime(120, t);
  lp.frequency.exponentialRampToValueAtTime(700, t + 1.2);
  lp.frequency.exponentialRampToValueAtTime(100, t + len);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(MOMENT_VOLUME * 0.6, t + 1.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  lp.connect(g).connect(master);
  for (const f of [55, 58.27, 110]) {
    const o = ctx.createOscillator();
    o.type = "sawtooth"; o.frequency.value = f;
    o.connect(lp);
    o.start(t); o.stop(t + len + 0.05);
  }
  bell(t + 0.9, 73.42, MOMENT_VOLUME * 0.4, 4, far(600));
}
// A find worth a second look (game.js rarity()): 1, a clink and three notes up with a glint over
// them; 2 (rare), five, with more glints and a shimmer left ringing
export function rareFind(level = 1) {
  if (!ctx) return;
  const t = ctx.currentTime, notes = level > 1 ? [659.25, 830.61, 987.77, 1318.5, 1661.2] : [659.25, 987.77, 1318.5];
  burst(t, "bandpass", 3400, 6, FIND_VOLUME, 0.04);
  notes.forEach((f, i) => tone(t + 0.05 + i * 0.07, "triangle", f, FIND_VOLUME * 0.8, 0.35 + (i === notes.length - 1 ? 0.5 : 0)));
  for (let i = 0; i < (level > 1 ? 9 : 4); i++) {
    const f = 3000 + Math.random() * 3500;
    blip(t + 0.15 + i * 0.05 + Math.random() * 0.03, "sine", f, f * 1.01, FIND_VOLUME * 0.25, 0.15);
  }
  if (level > 1) for (const f of [1318.5, 1323]) tone(t + 0.45, "sine", f, FIND_VOLUME * 0.2, 1.4, 0.15);
}

// Dig: a spade into dirt, a crunch of grit over a dull knock; the last, digging through, longer,
// with the dirt falling and pebbles after it
export function dig(through = false) {
  if (!ctx) return;
  const t = ctx.currentTime, n = through ? 10 : 5, len = through ? 0.35 : 0.12;
  for (let i = 0; i < n; i++) burst(t + Math.random() * len, "bandpass", 500 + Math.random() * 900, 1, CHOP_VOLUME * (0.5 + Math.random() * 0.4), 0.03 + Math.random() * 0.03);
  blip(t, "sine", through ? 110 : 140, 50, CHOP_VOLUME * 0.7, 0.12);
  if (!through) return;
  burst(t + 0.05, "lowpass", 220, 0.7, CHOP_VOLUME * 0.9, 0.45);
  for (let i = 0; i < 4; i++) burst(t + 0.18 + Math.random() * 0.35, "bandpass", 2600 + Math.random() * 1200, 5, CHOP_VOLUME * 0.25, 0.02);
}
// A pickaxe on crystal: a glassy chink, its partials out of tune; the last shatters it, a bright
// rush and a fall of shards
export function crystalHit(shatter = false) {
  if (!ctx) return;
  const t = ctx.currentTime, f = 1500 + Math.random() * 400;
  burst(t, "highpass", 6000, 0.8, CHOP_VOLUME * 0.5, 0.02);
  for (const [r, a] of [[1, 1], [2.76, 0.5], [5.4, 0.25]]) blip(t, "sine", f * r, f * r * 0.998, CHOP_VOLUME * 0.3 * a, shatter ? 0.2 : 0.35);
  if (!shatter) return;
  burst(t + 0.02, "highpass", 3000, 0.7, CHOP_VOLUME * 0.6, 0.3);
  for (let i = 0; i < 12; i++) {
    const g = 2500 + Math.random() * 4500, at = t + 0.05 + i * 0.04 + Math.random() * 0.03;
    blip(at, "sine", g, g * 0.995, CHOP_VOLUME * 0.2 * (1 - i / 14), 0.12 + Math.random() * 0.1);
  }
}

// Screech (the user's, 2026-10-26: louder, and to be feared; till then a bat's soft chirps): a
// siren's cry. A rough voice (three saws, one a semitone sharp and one an octave under, grated
// through a soft clip) shrieks up to its height, trembles there, its tremble quickening, and falls
// away; a throat's vowel (two formant bands) shapes it, a breath of noise rides on it, a low thud
// lands under its start, and it rings back off the walls round the character, darker each time
export function screech() {
  if (!ctx) return;
  const t = ctx.currentTime, len = 0.95, V = SCREECH_VOLUME;
  // its echo: off the walls, a little darker each time round
  const lp = ctx.createBiquadFilter(), echo = ctx.createDelay(), back = ctx.createGain(), dark = ctx.createBiquadFilter(), wet = ctx.createGain();
  lp.type = "lowpass"; lp.frequency.value = 5200;   // (harsh, but nothing that stings)
  echo.delayTime.value = 0.17; back.gain.value = 0.42; wet.gain.value = 0.5;
  dark.type = "lowpass"; dark.frequency.value = 2400;
  lp.connect(master);
  lp.connect(echo); echo.connect(dark).connect(back).connect(echo); dark.connect(wet).connect(master);
  // the voice: its pitch up, a tremble, then down; the tremble quickening as it goes
  const pitch = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
  lfo.type = "sine";
  lfo.frequency.setValueAtTime(6, t);
  lfo.frequency.linearRampToValueAtTime(13, t + len);
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(70, t + 0.2);
  lfo.connect(depth);
  const clip = ctx.createWaveShaper(), curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(2.5 * x); }
  clip.curve = curve;
  const f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(), body = ctx.createGain();
  f1.type = "bandpass"; f1.frequency.value = 1100; f1.Q.value = 3;
  f2.type = "bandpass"; f2.frequency.value = 2700; f2.Q.value = 5;
  body.gain.setValueAtTime(0.0001, t);
  body.gain.exponentialRampToValueAtTime(V, t + 0.06);
  body.gain.setValueAtTime(V, t + 0.45);
  body.gain.exponentialRampToValueAtTime(0.0001, t + len);
  clip.connect(f1).connect(body); clip.connect(f2).connect(body); body.connect(lp);
  for (const [ratio, amp] of [[1, 0.5], [1.06, 0.35], [0.5, 0.4]]) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(620 * ratio, t);
    o.frequency.exponentialRampToValueAtTime(1500 * ratio, t + 0.14);
    o.frequency.setValueAtTime(1500 * ratio, t + 0.42);
    o.frequency.exponentialRampToValueAtTime(480 * ratio, t + len);
    depth.connect(o.detune);
    g.gain.value = amp;
    o.connect(g).connect(clip);
    o.start(t); o.stop(t + len + 0.02);
  }
  lfo.start(t); lfo.stop(t + len + 0.02);
  // a breath of noise riding on it
  const src = ctx.createBufferSource(), band = ctx.createBiquadFilter(), ng = ctx.createGain();
  src.buffer = noise;
  band.type = "bandpass"; band.Q.value = 2;
  band.frequency.setValueAtTime(1800, t);
  band.frequency.exponentialRampToValueAtTime(3600, t + 0.15);
  band.frequency.exponentialRampToValueAtTime(1200, t + len);
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(V * 0.5, t + 0.05);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(band).connect(ng).connect(lp);
  src.start(t); src.stop(t + len + 0.02);
  // a low thud under its start
  const sub = ctx.createOscillator(), sg = ctx.createGain();
  sub.type = "sine";
  sub.frequency.setValueAtTime(70, t);
  sub.frequency.exponentialRampToValueAtTime(38, t + 0.5);
  sg.gain.setValueAtTime(0.0001, t);
  sg.gain.exponentialRampToValueAtTime(V * 1.6, t + 0.02);
  sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
  sub.connect(sg).connect(master);
  sub.start(t); sub.stop(t + 0.6);
  setTimeout(() => { lp.disconnect(); echo.disconnect(); dark.disconnect(); }, 3500);
}
// A bow loosed (Shoot, and a skeleton archer's): the string's twang and snap, and the arrow off
// with a swish
export function twang() {
  if (!ctx) return;
  const t = ctx.currentTime, o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(230, t);
  o.frequency.exponentialRampToValueAtTime(200, t + 0.25);
  lp.type = "lowpass"; lp.Q.value = 4;
  lp.frequency.setValueAtTime(2200, t);
  lp.frequency.exponentialRampToValueAtTime(300, t + 0.25);
  g.gain.setValueAtTime(SKILL_VOLUME * 0.8, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  o.connect(lp).connect(g).connect(master);
  o.start(t); o.stop(t + 0.3);
  burst(t, "bandpass", 2500, 3, SKILL_VOLUME, 0.02);
  swish(t + 0.03, 900, 2400, SKILL_VOLUME * 0.6, 0.2, 0.3, 2);
}
// An arrow sticking in wood (or anything solid it stops at): a knock and a quiver
export function thunk() {
  if (!ctx) return;
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), trem = ctx.createOscillator(), depth = ctx.createGain();
  blip(t, "triangle", 320, 140, SKILL_VOLUME * 1.2, 0.08);
  burst(t, "bandpass", 1000, 2, SKILL_VOLUME * 0.8, 0.04);
  o.type = "triangle"; o.frequency.value = 190;
  trem.frequency.value = 26; depth.gain.value = SKILL_VOLUME * 0.15;
  g.gain.setValueAtTime(SKILL_VOLUME * 0.3, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  trem.connect(depth).connect(g.gain);
  o.connect(g).connect(master);
  o.start(t + 0.03); o.stop(t + 0.32); trem.start(t); trem.stop(t + 0.32);
}
// Hammertime: the ground struck, a deep boom and a rattle of rubble round it
export function hammer() {
  if (!ctx) return;
  const t = ctx.currentTime;
  blip(t, "sine", 75, 28, SKILL_VOLUME * 3, 0.55);
  burst(t, "lowpass", 260, 0.7, SKILL_VOLUME * 2.2, 0.6);
  burst(t, "bandpass", 900, 1, SKILL_VOLUME * 1.2, 0.08);
  for (let i = 0; i < 7; i++) burst(t + 0.08 + Math.random() * 0.45, "bandpass", 1200 + Math.random() * 2000, 4, SKILL_VOLUME * 0.4, 0.025);
}
// Lunge: a dash, a rush of air rising, and the foot coming down
export function lunge() {
  if (!ctx) return;
  const t = ctx.currentTime;
  swish(t, 250, 1800, SKILL_VOLUME * 1.6, 0.24, 0.6, 1.2);
  blip(t + 0.2, "sine", 120, 55, SKILL_VOLUME * 1.2, 0.08);
}
// Charm: a soft glissando up five notes, each wavering, and a shimmer under them
export function enthral() {
  if (!ctx) return;
  const t = ctx.currentTime, vib = ctx.createOscillator(), depth = ctx.createGain();
  vib.frequency.value = 6; depth.gain.value = 8;
  vib.connect(depth);
  [523.25, 587.33, 659.25, 783.99, 880].forEach((f, i) => {
    const o = tone(t + i * 0.06, "sine", f, SKILL_VOLUME * 0.5, 0.6 + i * 0.08, 0.02);
    depth.connect(o.detune);
  });
  vib.start(t); vib.stop(t + 1.2);
  for (const f of [1760, 1767]) tone(t + 0.2, "sine", f, SKILL_VOLUME * 0.12, 1, 0.2);
}
// A void orb put down: a deep "whum", the air sucked in to it
export function orbDrop() {
  if (!ctx) return;
  const t = ctx.currentTime;
  blip(t, "sine", 160, 42, SKILL_VOLUME * 2, 0.55);
  swish(t, 2500, 300, SKILL_VOLUME * 0.8, 0.4, 0.7, 1);
}
// Reaper: a scythe's swing, a long swish falling, and its blade ringing
export function reaper() {
  if (!ctx) return;
  const t = ctx.currentTime;
  swish(t, 3500, 500, SKILL_VOLUME * 1.6, 0.4, 0.4, 1.4);
  for (const f of [2093, 2101, 3140]) tone(t + 0.12, "sine", f, SKILL_VOLUME * 0.18, 0.8, 0.005);
  blip(t + 0.1, "sine", 90, 40, SKILL_VOLUME, 0.3);
}
// Drain: life drawn in, a rising suck cut short, and a small warm note as it reaches the character
export function siphon() {
  if (!ctx) return;
  const t = ctx.currentTime;
  swish(t, 400, 2600, SKILL_VOLUME * 1.2, 0.36, 0.95, 2);
  blip(t, "sine", 700, 160, SKILL_VOLUME * 0.6, 0.36);
  tone(t + 0.38, "triangle", 880, SKILL_VOLUME * 0.4, 0.4, 0.02);
  tone(t + 0.38, "sine", 1320, SKILL_VOLUME * 0.15, 0.4, 0.02);
}
// Barrier: a glassy chord swelling up round the character and ringing a while
export function ward() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const f of [440, 443, 659.25, 880, 1318.5]) tone(t, "sine", f, SKILL_VOLUME * 0.25, 1.1, 0.15);
  swish(t, 4000, 8000, SKILL_VOLUME * 0.3, 0.5, 0.4, 1);
}
// Stoneskin: stone grinding over the skin, a gravelly crackle over a low hum
export function stoneskin() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 9; i++) burst(t + i * 0.04 + Math.random() * 0.03, "bandpass", 400 + Math.random() * 500, 0.9, SKILL_VOLUME * (0.7 + Math.random() * 0.5), 0.05);
  tone(t, "triangle", 82, SKILL_VOLUME * 0.8, 0.45, 0.05);
}
// Rage: a low growl, two rough tones rolling, rising and gone
export function rage() {
  if (!ctx) return;
  const t = ctx.currentTime, lp = ctx.createBiquadFilter(), g = ctx.createGain(), trem = ctx.createOscillator(), depth = ctx.createGain();
  lp.type = "lowpass"; lp.frequency.value = 520;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(SKILL_VOLUME * 1.1, t + 0.12);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  trem.frequency.value = 17; depth.gain.value = SKILL_VOLUME * 0.5;
  trem.connect(depth).connect(g.gain);
  lp.connect(g).connect(master);
  for (const f of [72, 76]) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * 1.3, t + 0.45);
    o.connect(lp);
    o.start(t); o.stop(t + 0.62);
  }
  trem.start(t); trem.stop(t + 0.62);
}
// Adrenaline: two quick heartbeats, then a rush rising
export function adrenaline() {
  if (!ctx) return;
  const t = ctx.currentTime;
  thump(t, 0.16);
  thump(t + 0.13, 0.11);
  blip(t + 0.22, "sine", 300, 900, SKILL_VOLUME * 0.4, 0.3);
  swish(t + 0.22, 500, 3000, SKILL_VOLUME * 0.5, 0.3, 0.7, 1);
}
// Sneak: a hush, a soft breath of high air
export function sneak() {
  if (!ctx) return;
  swish(ctx.currentTime, 5000, 3500, SKILL_VOLUME * 0.45, 0.5, 0.3, 1.5);
}

// The iron hound let out: a howl far off, rising, held wavering, falling away
export function howl() {
  if (!ctx) return;
  const t = ctx.currentTime, len = 2.4, band = ctx.createBiquadFilter(), g = ctx.createGain(), vib = ctx.createOscillator(), depth = ctx.createGain();
  band.type = "bandpass"; band.frequency.value = 1000; band.Q.value = 1.5;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(MOMENT_VOLUME * 1.1, t + 0.5);
  g.gain.setValueAtTime(MOMENT_VOLUME * 1.1, t + 1.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  band.connect(g).connect(panned(far(1800), 0.6));
  vib.frequency.value = 5; depth.gain.value = 9;
  vib.connect(depth);
  for (const d of [1, 1.01]) {
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(330 * d, t);
    o.frequency.exponentialRampToValueAtTime(620 * d, t + 0.5);
    o.frequency.setValueAtTime(620 * d, t + 1.3);
    o.frequency.exponentialRampToValueAtTime(380 * d, t + len);
    depth.connect(o.frequency);
    o.connect(band);
    o.start(t); o.stop(t + len);
  }
  vib.start(t); vib.stop(t + len);
}
// The demons coming: a roar, low and torn, swelling and gone
export function roar() {
  if (!ctx) return;
  const t = ctx.currentTime, len = 1.6, shaper = ctx.createWaveShaper(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 4); }
  shaper.curve = curve;
  lp.type = "lowpass"; lp.frequency.setValueAtTime(400, t); lp.frequency.linearRampToValueAtTime(900, t + 0.4); lp.frequency.exponentialRampToValueAtTime(200, t + len);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(MOMENT_VOLUME * 0.55, t + 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  shaper.connect(lp).connect(g).connect(far(1500));
  for (const f of [58, 61, 87]) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * 1.15, t + 0.4);
    o.frequency.exponentialRampToValueAtTime(f * 0.8, t + len);
    o.connect(shaper);
    o.start(t); o.stop(t + len);
  }
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.connect(shaper);
  src.start(t, Math.random(), len);
}
// A strong foe (superior, cursed, enchanted) first seen: a quiet low sting, two notes a
// semitone apart
export function omen() {
  if (!ctx) return;
  const t = ctx.currentTime, to = far(800);
  for (const f of [164.81, 174.61]) tone(t, "triangle", f, MOMENT_VOLUME * 0.3, 1.3, 0.04, to);
}
// The villagers turning on the character: a crowd's shout, a few voices on "ah" rising together
export function alarm() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 4; i++) {
    const at = t + i * 0.03 + Math.random() * 0.04, f = 170 + Math.random() * 110, o = ctx.createOscillator(), g = ctx.createGain(), sum = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f, at);
    o.frequency.linearRampToValueAtTime(f * 1.35, at + 0.18);
    o.frequency.exponentialRampToValueAtTime(f * 0.95, at + 0.5);
    for (const [ff, q, a] of [[750, 6, 1], [1150, 9, 0.5]]) {
      const bp = ctx.createBiquadFilter(), bg = ctx.createGain();
      bp.type = "bandpass"; bp.frequency.value = ff * (0.95 + Math.random() * 0.1); bp.Q.value = q; bg.gain.value = a;
      o.connect(bp).connect(bg).connect(sum);
    }
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(MOMENT_VOLUME * 1.2, at + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
    sum.connect(g).connect(panned(master, 0.5));
    o.start(at); o.stop(at + 0.52);
  }
}
// A goblin feast heard from near its room (game.js FEAST), muffled by the walls: three goblins
// cackling, each a run of quick high "heh"s hopping in pitch, over a bone or two snapping (a
// crack of clicks) and a wet tear of meat
export function feast() {
  if (!ctx) return;
  const t = ctx.currentTime, to = far(1700), voices = ctx.createGain();
  voices.gain.value = MOMENT_VOLUME * 0.55;
  voices.connect(to);
  for (let v = 0; v < 3; v++) {
    const pan = panned(voices, 0.6), base = 330 + v * 70 + Math.random() * 40;
    let at = t + v * 0.18 + Math.random() * 0.12;
    for (let n = 4 + Math.floor(Math.random() * 4); n > 0; n--, at += 0.085 + Math.random() * 0.05) {
      const f = base * (1 + (Math.random() - 0.3) * 0.25), o = ctx.createOscillator(), g = ctx.createGain(), vowel = ctx.createBiquadFilter();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f * 1.1, at);
      o.frequency.exponentialRampToValueAtTime(f * 0.85, at + 0.06);
      vowel.type = "bandpass"; vowel.frequency.value = 1300 + Math.random() * 300; vowel.Q.value = 5;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(1, at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.065);
      o.connect(vowel).connect(g).connect(pan);
      o.start(at); o.stop(at + 0.07);
    }
  }
  // the bones: a crack, a few clicks close together
  for (const at of [t + 0.25 + Math.random() * 0.2, t + 0.9 + Math.random() * 0.3])
    for (let c = 0; c < 4; c++) {
      const src = ctx.createBufferSource(), band = ctx.createBiquadFilter(), g = ctx.createGain(), when = at + c * (0.012 + Math.random() * 0.02);
      src.buffer = noise;
      band.type = "bandpass"; band.frequency.value = 1800 + Math.random() * 1200; band.Q.value = 3;
      g.gain.setValueAtTime(MOMENT_VOLUME * (c ? 0.4 : 0.8), when);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.025);
      src.connect(band).connect(g).connect(to);
      src.start(when, Math.random() * 1.5, 0.03);
    }
  // the tear: a short low rip
  const at = t + 0.55 + Math.random() * 0.2, src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noise;
  lp.type = "lowpass"; lp.Q.value = 4;
  lp.frequency.setValueAtTime(300, at);
  lp.frequency.exponentialRampToValueAtTime(1100, at + 0.18);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(MOMENT_VOLUME * 0.5, at + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
  src.connect(lp).connect(g).connect(to);
  src.start(at, Math.random() * 1.5, 0.27);
}

// The blacksmith at his anvil (game.js SMITH), heard from off in the dark (`near`: in his room,
// not muffled): three or four strikes, "tink-tink-tink", each a clink of noise and a ring of iron
// (partials out of tune with each other, the high ones dying first)
export function anvil(near = false) {
  if (!ctx) return;
  const t = ctx.currentTime, to = near ? panned(master, 0.3) : far(2600);
  for (let n = 0, at = t; n < 3 + Math.floor(Math.random() * 2); n++, at += 0.42 + Math.random() * 0.08) {
    const loud = MOMENT_VOLUME * (near ? 0.5 : 0.8) * (n ? 0.8 + Math.random() * 0.2 : 1);
    for (const [f, k, len] of [[1180, 1, 0.5], [2950, 0.45, 0.25], [4710, 0.25, 0.12]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.01);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(loud * k, at + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      o.connect(g).connect(to);
      o.start(at); o.stop(at + len + 0.02);
    }
    const src = ctx.createBufferSource(), band = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise;
    band.type = "bandpass"; band.frequency.value = 3500; band.Q.value = 2;
    g.gain.setValueAtTime(loud * 0.7, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.02);
    src.connect(band).connect(g).connect(to);
    src.start(at, Math.random() * 1.5, 0.03);
  }
}
// ...and his hammer whispering as it takes its price: breath through two vowels drifting about,
// low and close, rising and falling twice
export function hammerWhispers() {
  if (!ctx) return;
  const t = ctx.currentTime, len = 1.8, src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = noise;
  g.gain.setValueAtTime(0.0001, t);
  for (const [at, v] of [[0.25, 1], [0.6, 0.35], [1.05, 0.9], [1.4, 0.3]]) g.gain.linearRampToValueAtTime(MOMENT_VOLUME * 0.9 * v, t + at);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  for (const [lo, hi] of [[600, 1100], [1700, 2500]]) {
    const band = ctx.createBiquadFilter();
    band.type = "bandpass"; band.Q.value = 9;
    band.frequency.setValueAtTime(lo + Math.random() * (hi - lo), t);
    for (let at = 0.3; at < len; at += 0.3) band.frequency.linearRampToValueAtTime(lo + Math.random() * (hi - lo), t + at);
    src.connect(band).connect(g);
  }
  g.connect(panned(master, -0.2));
  src.start(t, Math.random() * 0.15, len);   // (the noise is 2 s long)
}

// The replay's tape deck: "play" (a clunk, the motor spinning up), "pause" (a clunk, spinning
// down) or "speed" (the motor whirring up a moment)
export function tape(what) {
  if (!ctx) return;
  const t = ctx.currentTime, o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
  if (what !== "speed") {
    blip(t, "triangle", 140, 60, UI_VOLUME * 1.4, 0.07);
    burst(t, "bandpass", 1800, 3, UI_VOLUME * 1.2, 0.03);
  }
  const [from, to, len] = what === "play" ? [20, 60, 0.45] : what === "pause" ? [60, 18, 0.4] : [55, 120, 0.3];
  o.type = "sawtooth";
  o.frequency.setValueAtTime(from, t + 0.04);
  o.frequency.exponentialRampToValueAtTime(to, t + 0.04 + len);
  lp.type = "lowpass"; lp.frequency.value = 500;
  g.gain.setValueAtTime(0.0001, t + 0.04);
  g.gain.exponentialRampToValueAtTime(UI_VOLUME * 0.6, t + 0.04 + len * 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04 + len);
  o.connect(lp).connect(g).connect(master);
  o.start(t + 0.04); o.stop(t + 0.06 + len);
}
// A press on anything of the game's boxes, a button, a tab, a list, a chip, a cell of the bag: a
// soft click, under whatever the press then does (the user's ask, 2026-10-27)
let clicked = -Infinity;
export function click() {
  if (!ctx) return;
  const t = ctx.currentTime;
  clicked = performance.now();
  blip(t, "square", 1400, 1100, UI_VOLUME * 0.25, 0.025);
  burst(t, "bandpass", 3200, 3, UI_VOLUME * 0.5, 0.015);
}
// A mode picked on the NEW GAME box: a small tick (not on top of a click, which it'd only double)
export function tock() {
  if (!ctx || performance.now() - clicked < 60) return;
  const t = ctx.currentTime;
  blip(t, "square", 1800, 1500, UI_VOLUME * 0.35, 0.03);
  burst(t, "bandpass", 4000, 4, UI_VOLUME * 0.6, 0.02);
}
// Someone else's line in the chat: two soft notes up, no more than one every `PING_GAP` s
const PING_GAP = 1.5;
let pinged = -Infinity;
export function ping() {
  if (!ctx || ctx.currentTime - pinged < PING_GAP) return;
  const t = pinged = ctx.currentTime;
  tone(t, "sine", 1318.5, UI_VOLUME * 0.5, 0.15);
  tone(t + 0.09, "sine", 1760, UI_VOLUME * 0.45, 0.22);
}

// BED: what's heard round the character besides the forest's own, all under the ambient (so a
// heartbeat silences it too) but the void orb's hum. surroundings() each frame: `bed` "forest", "dead"
// (the dead wood, forest-3 and on: no birds or crickets, the wind thinner, a low drone and now
// and then ravens) or "cave" (no wind, birds or night: a low room tone and water dripping in an
// echo; on cave-4 and below, `deep`, the drips give way to the earth rumbling), and how near (0..1) lava (a deep bubbling), crystals (a faint glassy hum), a burning bush
// (crackling flames and an otherworldly chord), a village (people talking, too far to make out)
// are, and whether a void orb's on the map (a low wobbling hum). `fade` s (a time constant) to
// cross over; the rest the levels at full, gaps (s, min..max) between drips and ravens.
const BED = { fade: 1.2, deadWind: 0.6, drone: 0.014, raven: [9, 24], ravenVolume: 0.022, room: 0.05, drip: [0.5, 2.6],
  dripVolume: 0.03, deep: 0.06, groan: [7, 18], lava: 0.07, crystals: 0.01, bush: 0.035, village: 0.02, orb: 0.035 };
const scene = { bed: "forest", deep: false, lava: 0, crystals: 0, bush: 0, village: 0, orb: false };
let testScene = null;              // the debug bar's, over the game's (see testBed())
let beds = null, sceneKey = "";
const heard = () => testScene ?? scene;
// The game's, every frame: { bed, deep, lava, crystals, bush, village, orb }; only a change does anything
export function surroundings(s) {
  Object.assign(scene, s);
  applyScene();
}
// For trying the beds out (game.js's debug bar): one held over whatever the game says, or null
// to give it back
export function testBed(s) {
  testScene = s && { ...scene, deep: false, lava: 0, crystals: 0, bush: 0, village: 0, orb: false, ...s };
  applyScene();
}
function applyScene() {
  if (!beds) return;
  const s = heard(), k = [s.bed, s.deep, s.lava, s.crystals, s.bush, s.village, s.orb].map(v => (typeof v === "number" ? v.toFixed(2) : v)).join();
  if (k === sceneKey) return;
  sceneKey = k;
  const set = (g, v) => fade(g, v, BED.fade);
  set(outdoors, s.bed === "cave" ? 0 : s.bed === "dead" ? BED.deadWind : 1);
  set(nightBed, nighttime && s.bed === "forest" ? 1 : 0);
  set(beds.dead, s.bed === "dead" ? 1 : 0);
  set(beds.cave, s.bed === "cave" ? 1 : 0);
  beds.drip.gain.setTargetAtTime(s.deep ? 0 : 1, ctx.currentTime, BED.fade);   // (only drips under it, and two ways out)
  set(beds.deep, s.bed === "cave" && s.deep ? BED.deep : 0);
  set(beds.lava, s.lava * BED.lava);
  set(beds.crystals, s.crystals * BED.crystals);
  set(beds.bush, s.bush * BED.bush);
  set(beds.village, s.village * BED.village);
  set(beds.orb, s.orb ? BED.orb : 0);
}
function startBeds() {
  const bus = to => { const g = ctx.createGain(); plug(g, to, 0); return g; };
  beds = { dead: bus(ambient), cave: bus(ambient), deep: bus(ambient), lava: bus(ambient), crystals: bus(ambient), bush: bus(ambient), village: bus(ambient), orb: bus(master) };
  const loop = (filter, freq, q, to) => {
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter();
    src.buffer = noise; src.loop = true;
    f.type = filter; f.frequency.value = freq; f.Q.value = q;
    src.connect(f).connect(to);
    src.start(0, Math.random() * 1.5);
    return f;
  };
  const hum = (type, freq, level, to) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = level;
    o.connect(g).connect(to);
    o.start();
    return o;
  };
  const every = ([lo, hi], fn) => {   // (fn now and then, while it's heard)
    const next = () => setTimeout(() => { if (ctx.state === "running") fn(); next(); }, (lo + Math.random() * (hi - lo)) * 1000);
    next();
  };
  // the dead wood: a low drone, and ravens
  const drone = far(260, beds.dead);
  for (const f of [55, 55.6]) hum("sine", f, BED.drone, drone);
  hum("triangle", 82.4, BED.drone * 0.5, drone);
  every(BED.raven, () => heard().bed === "dead" && raven());
  // the cave: a room tone, and drips in an echo
  const roomTone = ctx.createGain();
  roomTone.gain.value = BED.room;
  roomTone.connect(beds.cave);
  loop("lowpass", 160, 0.7, roomTone);
  const echo = ctx.createDelay(), back = ctx.createGain();
  echo.delayTime.value = 0.21; back.gain.value = 0.38;
  echo.connect(back).connect(echo); echo.connect(beds.cave);
  beds.drip = ctx.createGain(); beds.drip.connect(beds.cave); beds.drip.connect(echo);
  every(BED.drip, () => heard().bed === "cave" && !heard().deep && drip());
  // deep down (cave-4 on): the earth rumbling, two low roars swelling slowly out of step, and
  // now and then a groan of rock shifting somewhere far off
  for (const [freq, swell] of [[48, 0.06], [85, 0.09]]) {
    const g = ctx.createGain();
    g.gain.value = 0.5;
    g.connect(beds.deep);
    loop("lowpass", freq, 0.9, g);
    hum("sine", swell, 0.35, g.gain);
  }
  every(BED.groan, () => heard().bed === "cave" && heard().deep && groan());
  // lava: a deep rolling rumble, and bubbles popping
  const rumble = ctx.createGain();
  rumble.gain.value = 0.6;
  rumble.connect(beds.lava);
  loop("lowpass", 180, 1.5, rumble);
  hum("sine", 0.3, 0.3, rumble.gain);   // (rolling)
  every([0.08, 0.5], () => heard().lava > 0 && bubble());
  // crystals: three high tones a hair out of tune, beating slowly
  for (const f of [1318.5, 1319.2, 1975.5, 2637]) hum("sine", f, 0.25, beds.crystals);
  // the burning bush: flames (a roar of low noise and crackles) and a chord that's not of here
  loop("bandpass", 420, 0.8, beds.bush);
  every([0.03, 0.18], () => heard().bush > 0 && crackle());
  const choir = ctx.createGain();
  choir.gain.value = 0.12;
  choir.connect(beds.bush);
  hum("sine", 0.11, 0.05, choir.gain);   // (swelling slowly)
  for (const f of [220, 220.8, 329.6, 440, 554.4, 659.3]) hum("sine", f, 0.18, choir);
  // a village: three voices, too far to make out, talking in turn
  const talk = far(1200, beds.village);
  for (let i = 0; i < 3; i++) villager(talk, 120 + i * 45 + Math.random() * 30);
  // a void orb: a low hum wobbling
  const wob = ctx.createGain();
  wob.gain.value = 0.6;
  wob.connect(beds.orb);
  hum("sine", 4, 0.4, wob.gain);
  hum("sine", 55, 0.7, wob);
  const sq = far(320, wob);
  hum("square", 110.5, 0.25, sq);
  applyScene();
}
// A raven, far off: two or three harsh caws
function raven() {
  const t = ctx.currentTime, to = panned(beds.dead, 0.9), n = 2 + Math.floor(Math.random() * 2), f = 420 + Math.random() * 120;
  for (let i = 0; i < n; i++) {
    const at = t + i * (0.32 + Math.random() * 0.1), o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f * 1.1, at);
    o.frequency.exponentialRampToValueAtTime(f * 0.85, at + 0.2);
    bp.type = "bandpass"; bp.frequency.value = 1300; bp.Q.value = 2.5;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(BED.ravenVolume, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    o.connect(bp).connect(g).connect(to);
    o.start(at); o.stop(at + 0.24);
  }
}
// A drip: a quick watery plink, rising, somewhere off to the side
function drip() {
  const t = ctx.currentTime, f = 900 + Math.random() * 900, o = ctx.createOscillator(), g = ctx.createGain(), v = BED.dripVolume * (0.4 + Math.random() * 0.6);
  o.type = "sine";
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * 1.7, t + 0.05);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  o.connect(g).connect(panned(beds.drip, 0.8));
  o.start(t); o.stop(t + 0.1);
}
// Rock shifting far off, deep down: a long low groan of noise, the pitch rising and falling
function groan() {
  const t = ctx.currentTime, len = 2 + Math.random() * 2, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noise; src.loop = true;
  f.type = "lowpass"; f.Q.value = 4;
  f.frequency.setValueAtTime(35, t);
  f.frequency.linearRampToValueAtTime(90 + Math.random() * 50, t + len * 0.4);
  f.frequency.linearRampToValueAtTime(30, t + len);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.9, t + len * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(f).connect(g).connect(panned(beds.deep, 0.5));
  src.start(t, Math.random() * 1.5); src.stop(t + len + 0.05);
}
// A bubble of lava popping: a low thick blip
function bubble() {
  const t = ctx.currentTime, f = 70 + Math.random() * 110, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * 2.2, t + 0.07);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5 + Math.random() * 0.5, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  o.connect(g).connect(panned(beds.lava, 0.6));
  o.start(t); o.stop(t + 0.1);
}
// A crackle of the bush's flames: a tiny snap of bright noise
function crackle() {
  const t = ctx.currentTime, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noise;
  f.type = "highpass"; f.frequency.value = 1500 + Math.random() * 3000;
  g.gain.setValueAtTime(0.3 + Math.random() * 1.2, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.01 + Math.random() * 0.02);
  src.connect(f).connect(g).connect(panned(beds.bush, 0.4));
  src.start(t, Math.random() * 1.5, 0.04);
}
// One of a village's voices at `pitch`: syllables on changing vowels, a phrase, then quiet a while
function villager(to, pitch) {
  const o = ctx.createOscillator(), g = ctx.createGain(), f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(), g2 = ctx.createGain();
  o.type = "sawtooth"; o.frequency.value = pitch;
  f1.type = f2.type = "bandpass"; f1.Q.value = 5; f2.Q.value = 8; g2.gain.value = 0.5;
  g.gain.value = 0;
  o.connect(f1).connect(g); o.connect(f2).connect(g2).connect(g);
  g.connect(panned(to, 0.7));
  o.start();
  const vowels = Object.values(VOWELS);
  const phrase = () => {
    let t = ctx.currentTime + 0.05;
    if (heard().village > 0 && ctx.state === "running") {
      const n = 3 + Math.floor(Math.random() * 7);
      for (let i = 0; i < n; i++) {
        const len = 0.1 + Math.random() * 0.14, [a, b] = vowels[Math.floor(Math.random() * vowels.length)];
        f1.frequency.setTargetAtTime(a, t, 0.02); f2.frequency.setTargetAtTime(b, t, 0.02);
        o.frequency.setTargetAtTime(pitch * (0.9 + Math.random() * 0.25), t, 0.04);
        g.gain.setTargetAtTime(0.5 + Math.random() * 0.5, t, 0.015);
        g.gain.setTargetAtTime(0.05, t + len * 0.7, 0.02);
        t += len;
      }
      g.gain.setTargetAtTime(0, t, 0.03);
    }
    setTimeout(phrase, (t - ctx.currentTime + 0.8 + Math.random() * 3) * 1000);
  };
  phrase();
}

// Every sound, by group, for the debug bar's list (game.js): a one-off plays; a bed's held till
// another's picked, or "as in the game"
export const SOUND_TEST = {
  "Moments": { "Level up": levelUp, "Death": toll, "Time up": endOfDays, "Dawn": morningBell, "Nightfall": nightFalls,
    "Find (uncommon)": () => rareFind(1), "Find (rare)": () => rareFind(2), "Loot (plain)": loot },
  "Digging": { "Dig": () => dig(), "Dig through": () => dig(true), "Crystal": () => crystalHit(), "Crystal shatters": () => crystalHit(true), "Chop (tree)": () => chop() },
  "Fighting": { "Hit": hit, "Whiff": whiff, "Shoot": twang, "Arrow in wood": thunk, "Strong foe seen": omen },
  "Skills": { "Screech": screech, "Hammertime": hammer, "Lunge": lunge, "Sneak": sneak, "Adrenaline": adrenaline, "Rage": rage, "Stoneskin": stoneskin, "Barrier": ward,
    "Charm": enthral, "Void Orb": orbDrop, "Reaper": reaper, "Drain": siphon },
  "Creatures": { "Iron hound": howl, "Demons": roar, "Villagers turn": alarm, "Ghost": wail, "Goblin feast": feast,
    "Blacksmith (far)": () => anvil(), "Blacksmith (near)": () => anvil(true), "Hammer whispers": hammerWhispers },
  "UI": { "Tape: play": () => tape("play"), "Tape: pause": () => tape("pause"), "Tape: speed": () => tape("speed"), "Mode picked": tock, "Chat line": () => { pinged = -Infinity; ping(); } },
  "Beds (held)": { "As in the game": () => testBed(null), "Forest": () => testBed({ bed: "forest" }), "Dead wood": () => testBed({ bed: "dead" }),
    "Cave": () => testBed({ bed: "cave" }), "Cave, lava": () => testBed({ bed: "cave", lava: 1 }), "Cave, crystals": () => testBed({ bed: "cave", crystals: 1 }),
    "Cave, deep (cave-4)": () => testBed({ bed: "cave", deep: true }),
    "Burning bush": () => testBed({ bush: 1 }), "Village": () => testBed({ village: 1 }), "Void orb": () => testBed({ orb: true }) },
};

// Heartbeat: "slow", "fast", "still" (stopped, the forest quiet: the character is dead) or
// null (none). With one, the forest falls quiet and the beat takes over; without, the
// forest comes back. Safe to call every frame: only a change does
// anything, and one made before sound has started applies once it does.
export function heartbeat(rate) {
  if (rate === heartRate) return;
  const was = heartRate;
  heartRate = rate;
  if (!ctx) return;
  fade(ambient, hushed() ? 0 : 1, AMBIENT_FADE);
  if (!was && rate) beat();        // a beat already going keeps its rhythm and takes the new pace
}

// Called with the rate ("slow" or "fast") on every beat, muted or not, so the game can
// tremble along with it
export function onBeat(fn) { onBeatFn = fn; }

// One beat, "lub-dub", then the next after the current gap, for as long as there's a rate
function beat() {
  clearTimeout(heartTimer);
  if (!HEART_GAP[heartRate]) return;
  const t = ctx.currentTime;
  thump(t, 1);
  thump(t + 0.16, 0.6);
  onBeatFn?.(heartRate);
  heartTimer = setTimeout(beat, HEART_GAP[heartRate] * 1000);
}

// A soft, low thump: a sine sliding down, over before it can ring
function thump(t, level) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(70, t);
  o.frequency.exponentialRampToValueAtTime(38, t + 0.12);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(HEART_VOLUME * level, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.18);
}

// Byzantine chant, while the character's in a church: CHANTS sung in turn by a men's choir
// over the ison (a drone on the mode's base, Pa, and softer an octave under it), `pause` s
// apart, all on the one ison, `base` (Hz, C), so it never moves. Each voice is a few detuned
// saws through two vowel formants, with a slow vibrato, all in a big stone reverb. Each chant's
// `notes` are [semitones over the ison, seconds], taken down by ear from a recording (machine
// pitch-tracking of the melody over the ison, one statement of it, cleaned up): Christos
// Anesti, the old melody, as the Choir of Vatopedi Fathers sing it ("Melos Arheon", Agion
// Pascha, 2002; a semitone lower than their C sharp); the Trisagion with Dynamis as Vatopaidi
// sings it; and Kyrie Eleison as Sergei's recording has it. They're sung smoother than they
// were taken down (see smooth()), the voice gliding from note to note over `glide` s (a time
// constant) for each `glideStep` semitones it moves, a whole step's worth at the least. The words' vowels (`words`, a letter a syllable) go one to a note, the first and
// the longest ones (see syllables()), so the choir's colour follows the text.
const CHANT_VOLUME = 0.32;
const CHANT_FADE = 1.2;        // seconds (time constant) for it to come in or die away
const CHANT = { base: 130.81, pause: 6, ison: 0.55, isonLow: 0.3, reverb: 3.6, wet: 0.7, vibrato: [5.2, 10],
  glide: 0.18, glideStep: 2, minNote: 0.6, flick: 1 };
const VOWELS = { a: [730, 1090], e: [530, 1840], i: [300, 2000], o: [570, 840], n: [480, 1000] };
const CHANTS = [
  { name: "Christos Anesti",
    // Chri-stos a-ne-sti ek ne-kron, tha-na-to tha-na-ton pa-ti-sas, kai tis en tis mni-ma-si, zo-in cha-ri-sa-me-nos
    words: "ioaeieeoaaoaaoaiaaieiiaioiaiaeo",
    notes: [[7, 1.11], [5, 0.6], [7, 0.84], [5, 0.56], [6, 0.28], [7, 2.14], [10, 0.6], [8, 0.56], [7, 0.65], [5, 1.11],
      [7, 0.33], [3, 0.56], [5, 0.37], [7, 0.33], [5, 0.32], [7, 1.44], [8, 0.19], [7, 0.65], [5, 0.88], [8, 0.56], [7, 0.28],
      [6, 0.19], [5, 1.39], [7, 0.46], [8, 0.33], [7, 0.6], [5, 0.7], [3, 0.7], [2, 0.28], [3, 0.31], [2, 0.32], [5, 0.23],
      [3, 1.53], [6, 0.56], [7, 0.84], [8, 0.46], [10, 0.46], [7, 0.6], [8, 0.19], [7, 0.56], [6, 0.19], [7, 0.65], [9, 0.42],
      [7, 0.42], [10, 1.07], [8, 0.6], [7, 0.74], [5, 0.79], [7, 0.65], [8, 0.6], [10, 0.51], [7, 1.21], [5, 1.25], [7, 0.28],
      [3, 1.39], [5, 0.42], [7, 0.42], [6, 0.37], [7, 1.35], [5, 0.84], [7, 0.7], [9, 0.28], [8, 0.56], [7, 0.37], [5, 0.7],
      [4, 0.23], [5, 2.23], [0, 2.2]] },
  { name: "Kyrie Eleison",
    // Ky-ri-e e-le-i-son
    words: "iieeeio",
    notes: [[3, 0.8], [7, 0.8], [5, 0.61], [7, 1.35], [9, 0.19], [7, 0.33], [10, 1.58], [7, 0.19], [9, 0.33], [10, 0.43],
      [12, 0.37], [10, 0.37], [8, 0.23], [7, 0.7], [8, 0.61], [7, 0.79], [3, 0.42], [2, 0.52], [3, 0.7], [5, 0.59], [8, 0.33],
      [7, 0.28], [3, 0.37], [2, 0.42], [3, 0.47], [7, 0.56], [9, 0.28], [3, 0.28], [2, 0.85], [0, 2.2]] },
  { name: "Trisagion",
    // A-gi-os o The-os, A-gi-os I-schy-ros, A-gi-os A-tha-na-tos, e-le-i-son i-mas
    words: "aiooeoaioiioaioaaaoeeioia",
    notes: [[2, 0.46], [3, 0.6], [2, 0.51], [3, 0.65], [7, 0.37], [3, 0.65], [5, 0.23], [8, 0.28], [5, 0.42], [4, 0.28],
      [2, 0.79], [7, 1.07], [4, 0.46], [7, 0.51], [4, 0.23], [7, 1.58], [8, 0.37], [5, 1.11], [10, 0.93], [9, 0.23], [8, 0.42],
      [7, 0.28], [8, 0.28], [5, 0.79], [8, 0.28], [7, 0.51], [9, 0.47], [5, 0.23], [10, 0.74], [8, 0.65], [7, 0.79], [5, 0.74],
      [3, 0.6], [2, 0.23], [3, 0.32], [5, 0.42], [4, 0.23], [2, 0.56], [0, 0.28], [7, 0.23], [5, 0.28], [7, 0.65], [5, 0.33],
      [3, 1.53], [5, 0.19], [10, 0.37], [5, 0.56], [4, 0.37], [7, 0.37], [8, 0.19], [7, 0.6], [5, 0.88], [0, 0.19], [5, 0.56],
      [7, 0.23], [5, 1.11], [3, 0.56], [4, 0.23], [5, 0.6], [2, 0.33], [7, 0.33], [5, 0.37], [2, 0.37], [5, 0.33], [7, 0.23],
      [2, 0.39], [3, 0.37], [2, 0.46], [3, 1.02], [5, 0.51], [3, 0.51], [4, 0.23], [5, 0.37], [7, 0.42], [5, 0.32], [4, 0.42],
      [2, 0.84], [4, 0.23], [5, 0.23], [3, 0.79], [0, 2.2]] },
];
// A chant's notes as they're sung: one shorter than `minNote` s folds into the note before it,
// and a quick turn away and back (shorter than `flick` s, between two of the same note) is
// sung as the note it turned from, so the line moves in fewer, longer steps
function smooth(notes) {
  const out = [];
  for (const [s, d] of notes) {
    if (out.length && (d < CHANT.minNote || out.at(-1)[0] === s)) out.at(-1)[1] += d;
    else out.push([s, d]);
  }
  for (let i = 1; i < out.length - 1; i++) {
    if (out[i][1] >= CHANT.flick || out[i - 1][0] !== out[i + 1][0]) continue;
    out[i - 1][1] += out[i][1] + out[i + 1][1];
    out.splice(i, 2);
    i -= 1;
  }
  return out;
}
const SUNG = CHANTS.map(c => ({ ...c, notes: smooth(c.notes) }));
// Which of a chant's notes start a syllable, and on which vowel: the first, then as many of
// the others as there are syllables left, the longest ones, in order
function syllables({ notes, words }) {
  const longest = notes.slice(1).map(([, d], i) => [d, i + 1]).sort((a, b) => b[0] - a[0]).slice(0, words.length - 1).map(([, i]) => i);
  const starts = new Set([0, ...longest]);
  let v = 0;
  return notes.map((_, i) => (starts.has(i) ? words[v++] : null));
}
// In (true) or out (false); like heartbeat(), safe to call every frame, and one made before
// sound has started applies once it does
export function chant(on) {
  if (on === chanting) return;
  chanting = on;
  if (!ctx) return;
  fade(ambient, hushed() ? 0 : 1, AMBIENT_FADE);
  if (on) startChoir();
  else if (choir) {
    const c = choir;
    c.out.gain.setTargetAtTime(0, ctx.currentTime, CHANT_FADE);
    c.stopping = setTimeout(() => { if (choir === c) stopChoir(); }, CHANT_FADE * 6000);
  }
}
// A stereo hall: noise falling away over `secs` s
function hall(secs = CHANT.reverb) {
  const n = Math.floor(ctx.sampleRate * secs), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3;
  }
  const conv = ctx.createConvolver();
  try { conv.buffer = b; } catch {}   // (Chrome refuses it once the device's rate has changed under the context: then no echo)
  return conv;
}
// One voice of the choir at `freq`, on a vowel, into `to`: { osc (its saws), formants, gain }
function choirVoice(freq, vowel, to, level) {
  const sum = ctx.createGain(), gain = ctx.createGain();
  sum.gain.value = 0.25;
  gain.gain.value = level;
  const osc = [-7, 0, 6].map(cents => {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = freq;
    o.detune.value = cents;
    o.connect(sum);
    return o;
  });
  const formants = VOWELS[vowel].map((f, i) => {
    const bp = ctx.createBiquadFilter(), g = ctx.createGain();
    bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = i ? 9 : 5;
    g.gain.value = i ? 0.5 : 1;
    sum.connect(bp).connect(g).connect(gain);
    return bp;
  });
  const [rate, depth] = CHANT.vibrato, lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
  lfo.frequency.value = rate * (0.9 + Math.random() * 0.2);
  lfoGain.gain.value = depth;
  lfo.connect(lfoGain);
  for (const o of osc) { lfoGain.connect(o.detune); o.start(); }
  lfo.start();
  gain.connect(to);
  return { osc: [...osc, lfo], formants, gain };
}
function startChoir() {
  if (choir) {                     // still dying away: bring it back
    clearTimeout(choir.stopping);
    choir.out.gain.setTargetAtTime(CHANT_VOLUME, ctx.currentTime, CHANT_FADE);
    return;
  }
  const out = ctx.createGain(), bus = ctx.createGain(), wet = ctx.createGain(), room = hall();
  out.gain.value = 0;
  out.gain.setTargetAtTime(CHANT_VOLUME, ctx.currentTime, CHANT_FADE);
  wet.gain.value = CHANT.wet;
  bus.connect(out);
  bus.connect(room).connect(wet).connect(out);
  out.connect(env);
  const { base } = CHANT;
  const ison = choirVoice(base, "n", bus, CHANT.ison), low = choirVoice(base / 2, "o", bus, CHANT.isonLow);
  const melody = choirVoice(base, "a", bus, 0);
  choir = { out, ison, low, melody, next: 0, timer: null, stopping: null };
  sing(ctx.currentTime + 0.5);
}
// The next of CHANTS from `t0`, all of it, then the one after it once it's done and the pause
function sing(t0) {
  const { melody } = choir, chant = SUNG[choir.next], { base, glide, glideStep } = CHANT;
  choir.next = (choir.next + 1) % SUNG.length;
  const vowels = syllables(chant);
  let t = t0;
  chant.notes.forEach(([semis, secs], i) => {
    const f = base * 2 ** (semis / 12), tc = glide * Math.max(1, Math.abs(semis - (chant.notes[i - 1]?.[0] ?? semis)) / glideStep);
    for (const o of melody.osc.slice(0, 3)) o.frequency.setTargetAtTime(f, t - tc / 2, tc);
    if (vowels[i]) {               // a new syllable: its vowel, and a slight lift in the voice
      VOWELS[vowels[i]].forEach((fr, j) => melody.formants[j].frequency.setTargetAtTime(fr, t - 0.05, 0.1));
      melody.gain.gain.setTargetAtTime(0.9, t - 0.08, 0.05);
      melody.gain.gain.setTargetAtTime(1, t + 0.04, 0.12);
    }
    t += secs;
  });
  melody.gain.gain.setTargetAtTime(0, t - 0.3, 0.12);   // a breath
  const next = t + CHANT.pause;
  choir.timer = setTimeout(() => { if (choir) sing(next); }, Math.max(0, next - ctx.currentTime - 1) * 1000);
}
function stopChoir() {
  clearTimeout(choir.timer);
  for (const o of [...choir.ison.osc, ...choir.low.osc, ...choir.melody.osc]) o.stop();
  choir.out.disconnect();
  choir = null;
}

// The title screen's tune (game.js, while the title's up): slow and melancholic, and a little
// frightening, on a medieval harp, in place of the forest (the user's ask, 2026-10-13, after the
// chant). Each string a pluck (harpString()): its few partials dying away, the high ones
// first, in a stone hall `reverb` s long (`wet` of it echo). D minor in the old
// modes: the bass a rolled open fifth and octave (no third, as medieval music has it) at each of
// a phrase's `bass` [root in semitones from D3, beat]; over it the melody (`notes`: [semitones
// from D4, beats], a beat `beat` s, each a little early or late as a hand plays it), the
// Phrygian E♭ rubbing against the D now and then, the lines mostly falling. Kept smooth (the
// user's ask, 2026-10-13: the harp alone, no bell): each pluck eased in over `attack` s, its
// partials in tune and the high ones few and soft, so it rings warm rather than bright, and
// long, so the notes run into each other. Four phrases of Claude's (LAMENT), `rest` beats
// between them. `volume` at full, `fade` s (a time
// constant) to come in or die away.
const TITLE_HARP = { volume: 0.47, fade: 2.5, beat: 1, d3: 146.83, reverb: 5, wet: 0.8, rest: 3, melody: 0.5, bass: 0.3,
  attack: 0.012, ring: 5 };
const LAMENT = [
  { bass: [[0, 0], [-4, 4]], notes: [[7, 1], [8, 0.5], [7, 0.5], [5, 1], [3, 1], [2, 0.5], [3, 0.5], [0, 3]] },
  { bass: [[0, 0], [-2, 4]], notes: [[0, 1], [3, 1], [5, 1], [7, 1.5], [8, 0.5], [7, 1], [5, 1], [3, 3]] },
  { bass: [[-4, 0], [0, 4]], notes: [[12, 1], [10, 0.5], [8, 0.5], [7, 1], [1, 1.5], [0, 0.5], [1, 1], [0, 3]] },
  { bass: [[-5, 0], [-4, 2], [0, 4]], notes: [[7, 1], [3, 1], [2, 1], [-2, 1.5], [-5, 0.5], [0, 4]] },
];
// On (true) or off; safe to call every frame, and one made before sound has started applies once it does
export function titleTune(on) {
  if (on === titling) return;
  titling = on;
  if (!ctx) return;
  fade(ambient, hushed() ? 0 : 1, AMBIENT_FADE);
  if (on) startHarp();
  else if (harp) {
    const h = harp;
    h.out.gain.setTargetAtTime(0, ctx.currentTime, TITLE_HARP.fade);
    h.stopping = setTimeout(() => { if (harp === h) stopHarp(); }, TITLE_HARP.fade * 6000);
  }
}
function startHarp() {
  const T = TITLE_HARP;
  if (harp) {                      // still dying away: bring it back
    clearTimeout(harp.stopping);
    harp.out.gain.setTargetAtTime(T.volume, ctx.currentTime, T.fade);
    return;
  }
  const out = ctx.createGain(), bus = ctx.createGain(), wet = ctx.createGain(), room = hall(T.reverb);
  out.gain.value = 0;
  out.gain.setTargetAtTime(T.volume, ctx.currentTime, T.fade);
  wet.gain.value = T.wet;
  bus.connect(out);
  bus.connect(room).connect(wet).connect(out);
  out.connect(env);
  harp = { out, bus, next: 0, timer: null, stopping: null };
  harpPhrase(ctx.currentTime + 0.8);
}
// One string plucked at t: `freq`, `level` loud, ringing about `len` s, into `to`
function harpString(t, freq, level, len, to) {
  const g = ctx.createGain(), tone = ctx.createBiquadFilter();
  tone.type = "lowpass"; tone.Q.value = 0.5;
  tone.frequency.setValueAtTime(Math.min(3500, freq * 5), t);
  tone.frequency.exponentialRampToValueAtTime(Math.min(1800, freq * 2), t + len * 0.5);   // (it mellows as it rings)
  g.connect(tone).connect(to);
  for (const [k, amp] of [[1, 1], [2, 0.35], [3, 0.12]]) {
    const o = ctx.createOscillator(), a = ctx.createGain(), dies = len / k ** 0.5;
    o.frequency.value = freq * k;
    a.gain.setValueAtTime(0.0001, t);
    a.gain.exponentialRampToValueAtTime(level * amp, t + TITLE_HARP.attack);
    a.gain.exponentialRampToValueAtTime(0.0001, t + dies);
    o.connect(a).connect(g);
    o.start(t); o.stop(t + dies + 0.05);
  }
}
// The next of LAMENT from `t0`, then the one after it, `rest` beats between
function harpPhrase(t0) {
  const T = TITLE_HARP, { bus } = harp, phrase = LAMENT[harp.next];
  harp.next = (harp.next + 1) % LAMENT.length;
  const at = beats => t0 + beats * T.beat + (Math.random() - 0.5) * 0.02;   // (a hand, not a clock)
  for (const [root, b] of phrase.bass) {                                   // rolled up from the bottom
    const f = T.d3 * 2 ** ((root - 12) / 12), t = at(b);
    [1, 1.5, 2].forEach((ratio, i) => harpString(t + i * 0.12, f * ratio, T.bass * (i ? 0.6 : 1), T.ring + 1, bus));
  }
  let beats = 0;
  for (const [step, n] of phrase.notes) {
    harpString(at(beats), T.d3 * 2 * 2 ** (step / 12), T.melody, T.ring, bus);
    beats += n;
  }
  const next = t0 + (beats + T.rest) * T.beat;
  harp.timer = setTimeout(() => { if (harp) harpPhrase(next); }, Math.max(0, next - ctx.currentTime - 1) * 1000);
}
function stopHarp() {
  clearTimeout(harp.timer);
  harp.out.disconnect();
  harp = null;
}

function apply() {
  if (top) top.gain.setTargetAtTime(silent() ? 0 : 1, ctx.currentTime, 0.05);
  muteListeners.forEach(fn => fn(silent()));
}
export function toggleMute() {
  // muted for the website: unmuting there brings the sound on, as it'd be in the game
  if (away && !muted) away = false;
  else muted = !muted, away = false;
  try { localStorage.setItem("mektxt.muted", muted ? "1" : "0"); } catch {}
  apply();
}
// The website mutes the game while it's up, without touching M's own setting; back in the game,
// that setting's what it is again
export function setAway(on) {
  if (away === on) return;
  away = on;
  apply();
}
// For the website's header, whose speaker shows whether it's muted (by M, a click, or the website)
const muteListeners = [];
export const isMuted = silent;
export function onMuteChange(fn) { muteListeners.push(fn); }

// (iOS lets sound back on only as a tap ends, and some versions only on touchend or click, not pointerup)
for (const type of ["keydown", "pointerdown", "pointerup", "touchend", "click"]) addEventListener(type, start, { capture: true });
