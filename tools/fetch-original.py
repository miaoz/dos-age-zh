"""Fetch public game resources, following only same-site script and asset references."""
from pathlib import Path
from urllib.request import urlopen
from urllib.parse import urljoin, urlparse
import re, concurrent.futures, subprocess

ROOT = Path(__file__).resolve().parents[1] / 'dist'
BASE = 'https://dos-age.com/'
seen = set()
pending = {'game.js', 'web/site.css', 'favicon.svg'}
def fetch(path):
    dest = ROOT / path
    if not dest.exists():
        data = subprocess.check_output(['curl', '-fsSL', '--max-time', '40', BASE + path])
        if data.lstrip().lower().startswith(b'<!doctype'):
            return path, [], 'not a resource'
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
    refs = []
    if dest.suffix in ('.js', '.css'):
        text = dest.read_text()
        for ref in re.findall(r'''(?:from\s*|import\s*)["']([^"']+)["']''', text):
            if ref.startswith('.'):
                refs.append(urlparse(urljoin(BASE + path, ref)).path.lstrip('/'))
        refs += re.findall(r'''["'(]((?:assets/|\.?\.?/assets/)[^"'`)\s${}]+\.(?:png|webp|jpg|svg|woff2|mp3|ogg|wav))["')]''', text)
        refs = [urlparse(urljoin(BASE + path, r)).path.lstrip('/') if r.startswith('.') else r for r in refs]
    return path, refs, None
while pending:
    batch = pending - seen
    if not batch: break
    seen.update(batch); pending = set()
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for path, refs, error in pool.map(fetch, sorted(batch)):
            print(path, error or 'OK', flush=True)
            pending.update(refs)
