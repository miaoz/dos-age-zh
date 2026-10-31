from pathlib import Path
import json
ROOT = Path(__file__).resolve().parents[1]
ref=json.loads((ROOT/'tools/reference-es.json').read_text())
base=dict(l.split('\t') for l in (ROOT/'tools/nouns-base.tsv').read_text().splitlines() if l.strip())
materials={'Iron':'铁','Steel':'钢','Gold':'金','Golden':'黄金','Blood':'血','Spirit':'灵魂','Leather':'皮革','Fustian':'粗棉'}
items={'Axe':'斧','Pickaxe':'镐','Dagger':'匕首','Sword':'剑','Staff':'长杖','Wand':'魔杖','Chalice':'圣杯','Cuirass':'胸甲','Shield':'盾','Gambeson':'软甲','Jacket':'夹克','Manteau':'披风','Robe':'长袍','Hat':'帽'}
for mat,m in materials.items():
    for item,n in items.items(): base[f'{mat} {item}']=m+n
base={k.lower():v for k,v in base.items()}
# English shares affixes across living creatures, equipment and spells.
# Keep those contexts explicit: a monster is an elite, not a quality product.
contexts=json.loads((ROOT/'tools/noun-contexts.json').read_text())
creatures=set(contexts['creatures'])
skills=set(contexts['skills'])
adjectives={
    'equipment': {'weak':'劣质的','normal':'普通的','superior':'精良的','cursed':'诅咒的','enchanted':'附魔的',
                  'rusted':'锈蚀的','crude':'粗制的','bent':'弯曲的','tarnished':'黯淡的','broken':'破损的'},
    'creature': {'weak':'虚弱的','normal':'普通的','superior':'精英','cursed':'受诅咒的','enchanted':'魔化'},
    'skill': {'weak':'弱效','normal':'普通','superior':'强效','cursed':'诅咒','enchanted':'增幅'},
}
def translate(k):
    lower=k.lower()
    if lower in base: return base[lower]
    # Here the adjective qualifies the summoned creature, not the summoning spell.
    if lower.startswith('summon '): return '召唤'+translate(k[7:])
    for adj in adjectives['equipment']:
        if lower.startswith(adj+' '):
            rest=k[len(adj)+1:]
            context='creature' if rest.lower() in creatures else 'skill' if rest.lower() in skills else 'equipment'
            return adjectives[context][adj]+translate(rest)
    raise ValueError('Untranslated noun: '+k)
nouns={k:{'':translate(k)} for k in ref['nouns']}
strings={}
for p in sorted((ROOT/'tools').glob('strings-*.json')): strings.update(json.loads(p.read_text()))
for k in list(strings):
    if k in nouns: strings[k]=nouns[k]['']
(ROOT/'dist/lang').mkdir(exist_ok=True)
(ROOT/'dist/lang/zh-CN.json').write_text(json.dumps({'strings':strings,'nouns':nouns},ensure_ascii=False,indent=2)+'\n')
print(f'{len(strings)}/{len(ref["strings"])} strings; {len(nouns)}/{len(ref["nouns"])} nouns')
