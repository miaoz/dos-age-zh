import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const source = await readFile(new URL('../dist/game.js', import.meta.url), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const failOnline = () => assert.fail('Game over attempted online submission or name entry');
// Run the actual death/end-of-days transition without a backend.
for (const timeUp of [false, true]) {
  const timers = [], logs = [];
  const context = {
    dead: null, board: null, watching: null, local: false, journal: null, chat: null,
    MAPS: {outside: {}}, map: {}, player: {x: 1, y: 1}, INK: {}, held: ['Up'],
    clock: () => 100, setTimeout: fn => timers.push(fn),
    mourn() {}, keepOwnGhost() {}, ghostOf: () => ({}), journeyScore: () => ({score: 1234}),
    endOfDays() {}, toll() {}, tellRun() {}, BUILD: () => Promise.resolve('build'),
    say: value => logs.push(value), fetch: failOnline, rankScore: failOnline, typeName: failOnline,
    nameInput: {focus: failOnline},
  };
  const die = runInNewContext(`(${section('function die(', '// The scoreboard')})`, context);
  die(100, {timeUp});
  timers.forEach(fn => fn());
  assert.equal(context.dead.step, 'finished');
  assert.equal(context.dead.timeUp, timeUp);
  assert.equal(context.dead.score.score, 1234);
  assert.equal(context.board.state, 'offline');
  assert.equal(context.held.length, 0);
  assert.equal(logs.length, 1);
}
// Inspect the real result panel specification for both end states, without rasterizing it.
for (const timeUp of [false, true]) {
  let spec;
  const block = (type, ...args) => ({type, args});
  const sheet = Object.fromEntries(['lines','row','text','padded'].map(k => [k, (...args) => block(k,...args)]));
  const sheetParts = Object.fromEntries(['box','cta'].map(k => [k, (...args) => block(k,...args)]));
  const context = {
    dead: {at: 0, timeUp, score: {score: 1234}}, GAME_OVER: {ink: {}}, SHEET: {ink: {}},
    SCENE: {classes: {warrior: {right: 0}}}, charClass: 'warrior', lift: 0, CW: 16, CH: 16, SANS: {},
    sheet, sheetParts, sheetButton: (key, label, kind, options) => ({key, label, kind, ...options}),
    tl: s => s, dayNumber: () => 3, dailyMode: () => false, centre: x => x, cardPanelW: n => n,
    drawSheet: s => { spec = s; return {start: [0,0,10,10], title: [0,10,10,10]}; },
    fetch: failOnline, typeName: failOnline
  };
  const draw = runInNewContext(`(${section('function drawGameOver(', '// Shared by pointer/touch')})`, context);
  draw(100, true);
  const text = JSON.stringify(spec);
  for (const unwanted of ['Submit Score','Submit Name','Share to X','Leaderboard','CLASS RANK']) assert.ok(!text.includes(unwanted), unwanted);
  assert.ok(text.includes('1,234'));
  assert.ok(text.includes('Restart Game') && text.includes('Return to Title'));
  assert.ok(text.includes('scores are not submitted online'));
}
// Both input paths must invoke the same local navigation actions.
const calls = [];
const action = runInNewContext(`(${section('function gameOverAction(', '// (a part with each')})`, {
  startOver: (...args) => calls.push(args), watching: null, gameMode: 'competitive'
});
action('start'); action('title'); action('submit');
assert.deepEqual(calls, [['competitive', true], []]);
const keys = section('  if (dead && !ranking) {          // Local results', '  if (lookout)');
for (const code of ['KeyR','KeyT','Escape']) {
  const actions = [];
  runInNewContext(`(() => {${keys}})()`, {
    dead: {}, ranking: null, e: {code, repeat: false}, gameOverAction: a => actions.push(a)
  });
  assert.deepEqual(actions, [code === 'KeyR' ? 'start' : 'title']);
}
console.log('PASS: offline death/time-up, immediate result actions, no submission calls, restart/title keyboard routes.');
