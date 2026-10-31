"""Recovery hooks applied after localization; keep generated modules reproducible."""
def patch_render_recovery(name, s):
    if name not in ('game.js', 'text.js', 'title.js'):
        return s
    def once(old, new):
        nonlocal s
        assert s.count(old) == 1, f'Render recovery patch no longer matches {name}: {old[:80]}'
        s = s.replace(old, new)
    imports = 'retainCanvas'
    if name == 'game.js':
        imports += ', watchScreen, setRenderState, renderHeartbeat, recordRenderEvent'
        once('const ctx = canvas.getContext("2d");', 'const ctx = canvas.getContext("2d");\nwatchScreen(canvas);')
        once('  try { drawFrame(page); }', '  try { drawFrame(page); renderHeartbeat(); }')
        once('    console.error(err);', '    console.error(err);\n    recordRenderEvent("frame-error", { message: String(err?.message ?? err).slice(0, 800), stack: String(err?.stack ?? "").slice(0, 1600) });')
        once('tiles = withAllyTiles(withNoteTiles(withFloorDots(tiles)));',
             'tiles = retainCanvas(withAllyTiles(withNoteTiles(withFloorDots(tiles))), "tiles", true);')
        once('// (a picture that wouldn\'t load even asked for twice:', '''setRenderState(() => ({ turns, hp: stats.hp, map: map.id, x: player.x, y: player.y,
  cls: charClass, dead: !!dead, opening: opening?.step ?? null,
  screen: { width: canvas.width, height: canvas.height, lost: ctx.isContextLost?.() ?? null,
    alpha: ctx.globalAlpha, composite: ctx.globalCompositeOperation } }));

// (a picture that wouldn't load even asked for twice:''')
        for var, key, label in [('channelAtlases','k','channel-atlas'), ('warmths','k','warmth'),
                                ('recoloured','k','recoloured-tile'), ('tintedLooks','k','class-icon'), ('dpadLooks','lit','dpad')]:
            canvas = 'disc' if var == 'warmths' else 'c'
            once(f'{var}.set({key}, {canvas});', f'{var}.set({key}, retainCanvas({canvas}, "{label}"));')
        once('stoneAtlasMade = c;', 'stoneAtlasMade = retainCanvas(c, "stone-atlas");')
        # Only immutable results; scratch canvases and per-frame layers must not be backed up.
        for start, end, label in [('const gapMasks =', 'const gapCell =', 'gap-mask'),
                                  ('function invertAtlas(', 'function shock(', 'inverted-atlas')]:
            a=s.index(start); b=s.index(end,a)
            part=s[a:b]; assert part.count('return c;') == 1
            s=s[:a]+part.replace('return c;',f'return retainCanvas(c, "{label}");')+s[b:]
        once('    rows.forEach((row, y) => [...row].forEach((ch, x) => {\n      if (!NOTE_INK[ch]) return;',
             '    if (glow) retainCanvas(glow, "relic-glow");\n    rows.forEach((row, y) => [...row].forEach((ch, x) => {\n      if (!NOTE_INK[ch]) return;')
    elif name == 'text.js':
        assert s.count('tinted.set(colour, c);') == 2
        s=s.replace('tinted.set(colour, c);', 'tinted.set(colour, retainCanvas(c, "font-strip"));')
    elif name == 'title.js':
        for cache,key,canvas in [('arts','k','c'), ('logos','k','c'), ('masks','key','tile'), ('classPictures','group','c')]:
            once(f'{cache}.set({key}, {canvas});', f'{cache}.set({key}, retainCanvas({canvas}, "title-{cache}"));')
        once('const art = { canvas: c, data: img.data };', 'const art = { canvas: retainCanvas(c, "class-art"), data: img.data };')
    return f'import {{ {imports} }} from "./render-health.js";\n' + s
