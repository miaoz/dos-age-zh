import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const zh = JSON.parse(await readFile(new URL('../dist/lang/zh-CN.json', import.meta.url)));
const game = await readFile(new URL('../dist/game.js', import.meta.url), 'utf8');
const realFetch = globalThis.fetch;
// Exercise the production translation module with the checked-in language asset.
let lang;
try {
  globalThis.fetch = async url => {
    assert.equal(new URL(url).pathname, new URL('../dist/lang/zh-CN.json', import.meta.url).pathname);
    return new Response(JSON.stringify(zh));
  };
  lang = await import('../dist/lang.js');
  const {tl, tr, noun, nameOf, english, setLanguage} = lang;
  // Evaluate the actual map getters so numeric interpolation before lookup cannot regress.
  const getters = [...game.matchAll(/get says\(\) \{ return [^\n]+?; \}/g)].map(m => m[0]);
  assert.equal(getters.length, 2);
  const maps = [2, 3, 12].map(depth => getters.map(getter => runInNewContext(`({${getter}})`, {tl, depth})));
  for (const [i, depth] of [2, 3, 12].entries()) {
    assert.equal(maps[i][0].says, `你向上爬回了洞穴第 ${depth - 1} 层。`);
    assert.equal(maps[i][1].says, `你向下爬到了洞穴第 ${depth} 层。`);
  }
  const first = runInNewContext(`({${getters[1]}})`, {tl, depth: 1});
  assert.equal(first.says, zh.strings["You climb down into the cave. It's dark."]);
  await setLanguage('en');
  assert.equal(maps[0][1].says, 'You climb down to floor 2 of the cave.');
  assert.equal(maps[0][0].says, 'You climb back up to floor 1 of the cave.');
  assert.equal(nameOf("Yig Mage's Superior Firebolt"), "Yig Mage's Superior Firebolt");
  await setLanguage('zh-CN');
  assert.equal(maps[0][1].says, '你向下爬到了洞穴第 2 层。');
  // Run the real status-effect log path, retaining its colors and game-state updates.
  const afflictSource = game.slice(game.indexOf('function afflict('), game.indexOf('// A fire dwindles', game.indexOf('function afflict(')));
  const said = [];
  const afflict = runInNewContext(`(${afflictSource})`, {
    tr, noun, english, random: () => 0, nextBlowAt: 100, FIGHT: {gapMs: 10},
    HELD: {freeze: 2, paralyse: 3, ink: {freeze: '#5fcde4', paralyse: '#fbf236'}},
    say: runs => said.push(runs)
  });
  for (const [skill, expected, state, turns, color] of [
    [{freeze: 100}, '史莱姆冻成了冰块！', 'frozen', 2, '#5fcde4'],
    [{paralyse: 100}, '史莱姆麻痹了！', 'paralysed', 3, '#fbf236'],
    [{freeze: 100, held: 4}, '史莱姆被击晕了！', 'frozen', 4, '#5fcde4']
  ]) {
    const foe = {called: 'Slime'};
    afflict(foe, skill, 1, 0);
    assert.equal(foe[state], turns);
    assert.equal(said.at(-1).map(([s]) => s).join(''), expected);
    assert.ok(said.at(-1).every(([, ink]) => ink === color));
  }
  assert.equal(nameOf("Yig Mage's Superior Firebolt"), '伊格法师的强效火焰箭');
  assert.equal(nameOf("精英伊格灵体's Haste"), '精英伊格灵体的加速');
  assert.equal(tl('Your {by} hits', {by: noun("Yig Mage's Superior Firebolt")}), '你的伊格法师的强效火焰箭命中');
} finally {
  globalThis.fetch = realFetch;
}
// Source-level coverage supplements the upstream catalog, which missed dynamic messages.
// This checks literal first arguments and stored `says` text, not arbitrary dataflow.
for (const file of await readdir(new URL('../dist/', import.meta.url))) {
  if (!file.endsWith('.js')) continue;
  const source = await readFile(new URL('../dist/'+file, import.meta.url), 'utf8');
  for (const match of source.matchAll(/\b(?:tl|tr|english|say|tell|nameOf)\(\s*("(?:[^"\\]|\\.)*")|\bsays:\s*("(?:[^"\\]|\\.)*")/g)) {
    const key = JSON.parse(match[1] || match[2]);
    if (!/[a-zA-Z]{2}/.test(key) || /^#[\da-f]+$/i.test(key)) continue;
    assert.ok(zh.strings[key] || zh.nouns[key], `Uncatalogued text in ${file}: ${key}`);
  }
}
console.log('PASS: cave transitions, cached-map language switching, combat status logs, ally spell names, source text coverage.');
