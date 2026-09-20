#!/usr/bin/env python3
"""Inventory every animation and interaction a page ships, so none is cloned "half way".

Usage
  python3 motion-inventory.py <url | saved.html> [--out docs/research/<site>/MOTION.md]   build the checklist
  python3 motion-inventory.py --check docs/research/<site>/MOTION.md                       gate: exit 1 while any row is open

What it reads (static analysis only; it never runs the page)
  * CSS: every @keyframes and where it is used (selector, duration, easing), scroll/view timelines, @property, and the
    distinct transition durations in use.
  * JS: every module the page loads (<script src>, modulepreload, <astro-island component-url>), searched for motion:
    timers, requestAnimationFrame, IntersectionObserver, scroll/pointer listeners, WAAPI (.animate), GSAP, framer-motion,
    springs, number/text animation libraries, WebGL/canvas, Lottie, video.

Each row gets Status `[ ]`. A row is closed by editing the file: `[x] built <story or file>`, or
`[-] not cloned: <reason> APPROVED: <who said so>`. `[n/a]` rows (keyframes unused on this page) are closed automatically. A `[-]` without APPROVED, or any `[ ]`, fails --check. A component that
"moves on the source but is a still in the clone" is never an acceptable end state; ask the user before substituting.
Static analysis misses effects driven by data (a script that changes a class on a timer is found; what the class does is in
the CSS rows), so also watch the page while it runs and add rows for anything this list lacks.
"""
import re
import sys
import urllib.parse
import urllib.request

UA = {'User-Agent': 'Mozilla/5.0 (motion-inventory)'}
SIGNATURES = [
    ('timer', r'setInterval\(', 'setInterval'),
    ('timeout', r'setTimeout\(', 'setTimeout'),
    ('raf', r'requestAnimationFrame\(', 'requestAnimationFrame'),
    ('observer', r'IntersectionObserver', 'IntersectionObserver'),
    ('scroll', r'''addEventListener\(\s*['"]scroll['"]''', 'scroll listener'),
    ('pointer', r'''addEventListener\(\s*['"](?:mousemove|pointermove|mouseenter|pointerenter)['"]''', 'pointer listener'),
    ('waapi', r'\.animate\(\s*[\[{]', 'Web Animations (.animate)'),
    ('gsap', r'power[1-4]\.(?:in|out|inOut)|\.timeline\(|gsap', 'GSAP'),
    ('framer', r'(?:initial|animate|exit):\s*\{[^}]*(?:opacity|x|y|scale)', 'framer-motion variants'),
    ('spring', r'stiffness\s*:', 'spring physics'),
    ('numberflow', r'number-flow|NumberFlow', 'number roll library'),
    ('webgl', r'''WebGLRenderer|getContext\(\s*['"]webgl''', 'WebGL / three.js'),
    ('canvas', r'''getContext\(\s*['"]2d''', 'canvas 2D'),
    ('lottie', r'lottie', 'Lottie'),
    ('video', r'HTMLVideoElement|\.play\(\)', 'video playback'),
    ('media', r'prefers-reduced-motion', 'reduced-motion aware'),
]


def fetch(url):
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read().decode('utf-8', 'replace')
    except Exception as e:  # noqa: BLE001
        return f'/* fetch failed: {e} */'


def load(target):
    if target.startswith('http'):
        return fetch(target), target
    return open(target, encoding='utf-8', errors='replace').read(), 'file://' + target


def absolute(base, href):
    return urllib.parse.urljoin(base, href)


def in_use(name, selectors, haystack):
    """True when the keyframe name, or a class used in one of its rules, appears in the page HTML or any script."""
    if re.search(r'(?<![\w-])' + re.escape(name) + r'(?![\w-])', haystack):
        return True
    for sel in selectors:
        for tok in re.findall(r'\.((?:\\.|[\w-])+)', sel):
            plain = tok.replace('\\', '')
            if plain and plain in haystack:
                return True
    return False


def css_inventory(html, base):
    sheets = re.findall(r'<link[^>]+rel=["\']stylesheet["\'][^>]*href=["\']([^"\']+)["\']', html)
    sheets += re.findall(r'<link[^>]+href=["\']([^"\']+\.css[^"\']*)["\']', html)
    css = '\n'.join(re.findall(r'<style[^>]*>(.*?)</style>', html, flags=re.S))
    for href in dict.fromkeys(sheets):
        css += '\n' + fetch(absolute(base, href))
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    keyframes = sorted(set(re.findall(r'@keyframes\s+([\w-]+)', css)))
    uses = {}
    for m in re.finditer(r'([^{}@]+)\{([^{}]*animation[^{}]*)\}', css):
        sel, body = m.group(1).strip()[:70], m.group(2)
        a = re.search(r'animation(?:-name)?\s*:\s*([^;]+)', body)
        if not a:
            continue
        for name in keyframes:
            if re.search(r'(?<![\w-])' + re.escape(name) + r'(?![\w-])', a.group(1)):
                uses.setdefault(name, []).append((sel, a.group(1).strip()[:70]))
    timelines = sorted(set(re.findall(r'((?:animation|view|scroll)-timeline\s*:[^;}]+)', css)))
    props = sorted(set(re.findall(r'@property\s+(--[\w-]+)', css)))
    trans = {}
    for d in re.findall(r'transition(?:-duration)?\s*:[^;}]*?(\d*\.?\d+m?s)', css):
        trans[d] = trans.get(d, 0) + 1
    return keyframes, uses, timelines, props, trans


def js_inventory(html, base, limit=250, sources=None):
    urls = re.findall(r'<script[^>]+src=["\']([^"\']+)["\']', html)
    urls += re.findall(r'<link[^>]+rel=["\']modulepreload["\'][^>]+href=["\']([^"\']+)["\']', html)
    islands = re.findall(r'<astro-island[^>]*?component-url=["\']([^"\']+)["\'][^>]*?component-export=["\']([^"\']+)["\']', html)
    names = {u: n for u, n in islands}
    urls += [u for u, _ in islands]
    rows = []
    for u in list(dict.fromkeys(urls))[:limit]:
        if not u.split('?')[0].endswith(('.js', '.mjs')) and '/_astro/' not in u and 'script' not in u:
            continue
        src = fetch(absolute(base, u))
        if sources is not None:
            sources.append(src)
        found = []
        for key, pat, label in SIGNATURES:
            n = len(re.findall(pat, src))
            if n:
                found.append((key, label, n))
        motion = [f for f in found if f[0] not in ('media', 'timeout', 'video')] or []
        if motion or any(f[0] == 'timeout' for f in found) and names.get(u):
            rows.append((names.get(u, ''), u, found, len(src)))
    return rows


def load_statuses(path):
    """Statuses already recorded in an earlier run, keyed by the row text after the status cell."""
    known = {}
    try:
        for line in open(path):
            if line.startswith('|') and not line.startswith('|---') and 'Status' not in line:
                cells = line.rstrip('\n').split('|')
                if len(cells) > 3 and not cells[1].strip().startswith('[ ]'):
                    known['|'.join(cells[2:]).strip()] = cells[1].strip()
    except OSError:
        pass
    return known


def build(target, out):
    html, base = load(target)
    keyframes, uses, timelines, props, trans = css_inventory(html, base)
    sources = []
    rows = js_inventory(html, base, sources=sources)
    haystack = html + '\n' + '\n'.join(sources)
    known = load_statuses(out) if out else {}
    props = [p for p in props if not p.startswith('--tw-')]  # Tailwind internals, not design motion

    def status(rest, default='[ ]'):
        return known.get(rest.strip(), default)

    o = [f'# Motion inventory: {target}', '',
         'Generated by `scripts/motion-inventory.py`. Close every row (`[x] built <where>`, or `[-] not cloned: <reason> APPROVED: <who>`),',
         'then run `motion-inventory.py --check <this file>`. `[n/a]` rows were closed automatically: the keyframes are defined but neither their',
         'name nor any class that uses them appears in this page or its scripts. Re-running keeps the statuses you set. Add rows for anything you',
         'see moving that the tool cannot know.', '',
         '## CSS keyframes', '', '| Status | Keyframes | Used by (selector: animation) |', '|---|---|---|']
    for k in keyframes:
        used = uses.get(k, [])
        u = '; '.join(f'`{sel}`: {a}' for sel, a in used[:3]) or '(defined; no rule uses it in static CSS)'
        rest = f' `{k}` | {u} |'
        auto = '[ ]' if in_use(k, [sel for sel, _ in used], haystack) else '[n/a]'
        o.append(f'| {status(rest, auto)} |{rest}')
    if timelines or props:
        o += ['', '## Scroll / view timelines and animatable custom properties', '', '| Status | Item |', '|---|---|']
        for t in timelines:
            o.append(f'| {status(f" `{t}` |")} | `{t}` |')
        for pr in props:
            o.append(f'| {status(f" `@property {pr}` |")} | `@property {pr}` |')
    o += ['', '## Transitions in use (distinct durations, count of rules)', '',
          ', '.join(f'{d} ×{n}' for d, n in sorted(trans.items(), key=lambda x: -x[1])[:14]),
          '', '## Scripted components (each may contain timers, springs, GSAP/framer timelines, WebGL, listeners)', '',
          '| Status | Component | Script | Motion signatures |', '|---|---|---|---|']
    for name, u, found, size in rows:
        sig = ', '.join(f'{label} ×{n}' for _, label, n in found)
        rest = f' {name or "(module)"} | `{u.split("/")[-1]}` ({size // 1024}KB) | {sig} |'
        o.append(f'| {status(rest)} |{rest}')
    o += ['', '## Interactions and states not visible in static analysis (add by hand while using the page)', '',
          '| Status | Interaction |', '|---|---|']
    for item in ['hover states of every link/button/card', 'keyboard: Tab order, Escape, arrow keys',
                 'scroll-driven changes (header, reveals, sticky) at each breakpoint', 'open/close states (menus, dialogs, selects)']:
        o.append(f'| {status(f" {item} |")} | {item} |')
    text = '\n'.join(o) + '\n'
    if out:
        with open(out, 'w') as f:
            f.write(text)
        n_open = sum(1 for l in o if l.startswith('| [ ]'))
        print(f'wrote {out}: {len(keyframes)} keyframes, {len(rows)} scripted components, {n_open} rows open')
    else:
        print(text)


def check(path):
    bad = []
    for n, line in enumerate(open(path), 1):
        if not line.startswith('|') or 'Status' in line or line.startswith('|---'):
            continue
        cell = line.split('|')[1].strip()
        if cell.startswith('[ ]'):
            bad.append(f'{n}: OPEN      {line.strip()[:110]}')
        elif cell.startswith('[-]') and 'APPROVED' not in line:
            bad.append(f'{n}: UNAPPROVED {line.strip()[:110]}')
    if bad:
        print('\n'.join(bad))
        print(f'\n{len(bad)} row(s) not closed: every animation and interaction is cloned, or its omission is approved by the user')
        return 1
    print('OK: every motion row is built or explicitly approved as not cloned')
    return 0


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a:
        print(__doc__)
        sys.exit(2)
    if a[0] == '--check':
        sys.exit(check(a[1]))
    out = a[a.index('--out') + 1] if '--out' in a else None
    build(a[0], out)
