import assert from 'node:assert/strict';
import {readFile,readdir,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {wrapChinese} from '../dist/zh-layout.js';
const reference = JSON.parse(await readFile(new URL('./reference-es.json',import.meta.url)));
const zh = JSON.parse(await readFile(new URL('../dist/lang/zh-CN.json',import.meta.url)));
const supplemental = JSON.parse(await readFile(new URL('./strings-dynamic.json',import.meta.url)));
assert.deepEqual(Object.keys(zh.strings).sort(), [...new Set([...Object.keys(reference.strings), ...Object.keys(supplemental)])].sort());
assert.deepEqual(Object.keys(zh.nouns).sort(),Object.keys(reference.nouns).sort());
const placeholders = s => [...new Set([...s.matchAll(/\{([^{}]+)\}/g)].map(m => m[1].split(/[|:]/)[0]))].sort();
for(const [key,value] of Object.entries(zh.strings)) {
 assert.ok(value,`Empty translation: ${key}`);
 // Chinese plural branches need no plural placeholder; the numeric variable must remain.
 assert.deepEqual(placeholders(value),placeholders(key),`Variables: ${key}`);
 assert.deepEqual((value.match(/<\/?\w*>/g)||[]).sort(),(key.match(/<\/?\w*>/g)||[]).sort(),`Color tags: ${key}`);
}
for(const [key,value] of Object.entries(zh.nouns)) assert.ok(value[''] && /[\u3400-\u9fff]/u.test(value['']),`Missing Chinese noun: ${key}`);
// Regression: shared English quality affixes must respect the kind of noun.
const contexts = JSON.parse(await readFile(new URL('./noun-contexts.json',import.meta.url)));
for (const creature of contexts.creatures) {
 for (const name of [`Superior ${creature}`, `superior ${creature}`]) {
  const key = Object.keys(zh.nouns).find(k => k.toLowerCase() === name.toLowerCase());
  if (key) assert.ok(zh.nouns[key][''].startsWith('精英'), `Creature quality: ${key}`);
 }
}
for (const [key,value] of Object.entries({
 'Superior Slime':'精英史莱姆', 'superior slime':'精英史莱姆',
 'Superior Iron Sword':'精良的铁剑', 'Enchanted Iron Sword':'附魔的铁剑',
 'Superior Firebolt':'强效火焰箭', 'Weak Firebolt':'弱效火焰箭',
 'Enchanted Slime':'魔化史莱姆', 'Cursed Slime':'受诅咒的史莱姆',
 'Summon Superior Yig Warrior':'召唤精英伊格战士'
})) assert.equal(zh.nouns[key][''],value,`Contextual translation: ${key}`);
for (const affix of ['Weak','Superior','Cursed','Enchanted']) {
 assert.equal(zh.nouns[`Summon ${affix} Yig Warrior`][''], '召唤'+zh.strings[affix]+zh.nouns['Yig Warrior'][''], `Summon/display consistency: ${affix}`);
}
const sample='恢复 20 HP，随后获得石肤效果。';
const lines=wrapChinese(sample,s=>[...s].length,8);
assert.ok(lines.every(s=>[...s].length<=8));
assert.equal(lines.join('').replace(/\s/g,''),sample.replace(/\s/g,''));
assert.ok(lines.every(s=>! /^[，。！？；：、]/.test(s)));
for(const f of await readdir(new URL('../dist/',import.meta.url))) if(f.endsWith('.js')) {
 const result=spawnSync(process.execPath,['--check',new URL('../dist/'+f,import.meta.url).pathname],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 const source=await readFile(new URL('../dist/'+f,import.meta.url),'utf8');
 for(const [,dep] of source.matchAll(/(?:from\s*|import\s*)["'](\.\/[^"']+)["']/g)) await access(new URL('../dist/'+dep,import.meta.url));
}
console.log(`PASS: ${Object.keys(zh.strings).length} strings, ${Object.keys(zh.nouns).length} nouns, placeholders, color tags, Chinese wrapping, module syntax and imports.`);
const {default:offlineWorker} = await import('../dist/_worker.js');
const offline = await offlineWorker.fetch(new Request('https://dosage.bitfroth.com/scores?v=test'), {});
assert.equal(offline.status,503);
assert.ok((await offline.json()).error);
const assetResponse = await offlineWorker.fetch(new Request('https://dosage.bitfroth.com/index.html'), {ASSETS:{fetch:async()=>new Response('asset')}});
assert.equal(await assetResponse.text(),'asset');
async function checkPublicFiles(dir) {
 for (const entry of await readdir(dir,{withFileTypes:true})) {
  assert.ok(!/^(?:\.env(?:\.|$)|\.git$|node_modules$)/.test(entry.name),`Private file in public assets: ${entry.name}`);
  if (entry.isDirectory()) await checkPublicFiles(new URL(entry.name+'/',dir));
 }
}
await checkPublicFiles(new URL('../dist/',import.meta.url));
console.log('PASS: offline API responses, static fallback, public asset file boundaries.');

await import('./check-dynamic.mjs');
