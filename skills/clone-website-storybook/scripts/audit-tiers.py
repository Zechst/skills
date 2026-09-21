#!/usr/bin/env python3
"""Audit an atomic-design Storybook library.

Usage:  python3 audit-tiers.py [src-dir] [--allow Importer>Imported ...] [--alias @/=src/]

Checks, and exits 1 if any fails:
  1. TIER DIRECTION  a component imports only from strictly lower tiers
                     (atoms < molecules < organisms < templates < pages). Shared constants and types belong in a
                     data/ or lib/ module, never in a sibling component. Non-component modules (.ts) are ignored.
  2. STORY COVERAGE  every component file under a tier folder has a colocated story
                     (`<Name>.stories.tsx`, any `*.stories.*` beside it when each component has its own folder,
                     or a shared story in the same folder that imports it).
  3. STORY TITLES    every story's title has the tier as its second segment and matches the folder
                     (`<Site>/Atoms/Button` for a file under atoms/).
  4. SIDEBAR ORDER   .storybook/preview.* sets `storySort` so tiers sort smallest to largest.

Tiers are recognised by a folder named atoms / molecules / organisms / templates / pages anywhere in the path, so both
`src/atoms/brand/Button.tsx` and `src/components/<site>/atoms/Button/Button.tsx` work. Use --allow for a documented exception,
e.g. --allow SiteHeader>MainNav (matches on file stems).
"""
import glob
import os
import re
import sys

TIERS = ['atoms', 'molecules', 'organisms', 'templates', 'pages']
RANK = {t: i for i, t in enumerate(TIERS)}
IMPORT_RE = re.compile(r"""(?:from|import)\s+['"]([^'"]+)['"]""")
TITLE_RE = re.compile(r"""title\s*:\s*['"]([^'"]+)['"]""")
SKIP_STEMS = {'index', 'decorators'}


def tier_of(path):
    parts = path.replace('\\', '/').split('/')
    for p in parts:
        if p in RANK:
            return p
    return None


def resolve(importer, spec, alias):
    if spec.startswith('.'):
        base = os.path.normpath(os.path.join(os.path.dirname(importer), spec))
    else:
        base = None
        for prefix, target in alias.items():
            if spec.startswith(prefix):
                base = os.path.normpath(spec.replace(prefix, target, 1))
        if base is None:
            return None
    for cand in (base + '.tsx', base + '.jsx', os.path.join(base, 'index.tsx'), base if base.endswith(('.tsx', '.jsx')) else None):
        if cand and os.path.isfile(cand):
            return cand
    return None


def main(argv):
    root = 'src'
    allow = set()
    alias = {}
    args = list(argv)
    while args:
        a = args.pop(0)
        if a == '--allow':
            allow.add(args.pop(0))
        elif a == '--alias':
            k, v = args.pop(0).split('=', 1)
            alias[k] = v
        else:
            root = a
    files = [f for f in glob.glob(os.path.join(root, '**', '*.tsx'), recursive=True)]
    comps = [f for f in files if '.stories.' not in f and '.test.' not in f and tier_of(f) and os.path.splitext(os.path.basename(f))[0] not in SKIP_STEMS]
    problems = []

    # 1. tier direction
    for f in sorted(comps):
        t = tier_of(f)
        stem = os.path.splitext(os.path.basename(f))[0]
        for spec in IMPORT_RE.findall(open(f).read()):
            target = resolve(f, spec, alias)
            if not target or target == f:
                continue
            tt = tier_of(target)
            if not tt or '.stories.' in target:
                continue
            if RANK[tt] >= RANK[t]:
                tstem = os.path.splitext(os.path.basename(target))[0]
                if f'{stem}>{tstem}' in allow:
                    continue
                problems.append(f'DIRECTION  {t[:-1]:9} {f}  imports {tt[:-1]:9} {target}')

    # 2. story coverage
    for f in sorted(comps):
        d = os.path.dirname(f)
        stem = os.path.splitext(os.path.basename(f))[0]
        own = glob.glob(os.path.join(d, stem + '.stories.*'))
        folder_layout = os.path.basename(d) == stem
        anyone = glob.glob(os.path.join(d, '*.stories.*')) if folder_layout else []
        # a shared story (e.g. one Icons story for a folder of icons) covers every component it imports
        shared = [x for x in glob.glob(os.path.join(d, '*.stories.*')) if re.search(r"from\s+['\"]\./" + re.escape(stem) + r"['\"]", open(x).read())]
        if not own and not anyone and not shared:
            problems.append(f'NO STORY   {tier_of(f)[:-1]:9} {f}')

    # 3. story titles
    for s in sorted(f for f in files if '.stories.' in f):
        t = tier_of(s)
        m = TITLE_RE.search(open(s).read())
        if not m:
            problems.append(f'NO TITLE   {s}')
            continue
        segs = m.group(1).split('/')
        if t and (len(segs) < 3 or segs[1].lower() != t):
            problems.append(f'TITLE      {s}: "{m.group(1)}" should be <Site>/{t.capitalize()}/<Name>')
        if not t and len(segs) > 1 and segs[1].lower() in ('ui', 'components', 'primitives'):
            problems.append(f'TITLE      {s}: "{m.group(1)}" uses a non-tier section; primitives are atoms')

    # 4. sidebar order
    previews = glob.glob(os.path.join('.storybook', 'preview.*'))
    if previews and not any('storySort' in open(p).read() for p in previews):
        problems.append('SORT       .storybook/preview has no storySort: sidebar falls back to alphabetical (Pages before Templates)')

    n = len(comps)
    if problems:
        print('\n'.join(problems))
        print(f'\n{len(problems)} problem(s) across {n} components')
        return 1
    print(f'OK: {n} components, no tier violations, every component has a story, titles match tiers, storySort set')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
