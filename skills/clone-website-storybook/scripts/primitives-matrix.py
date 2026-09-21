#!/usr/bin/env python3
"""Regenerates the parity table in docs/PRIMITIVES.md from src/atoms/primitives/{marketing,product}/ (between the markers)."""
import os, re
root = 'src/atoms/primitives'
# Kumo's name for a primitive that marketing calls something else: the file keeps Kumo's name, the matrix joins the rows.
ALIAS = {'Banner': 'Alert'}
fam = {f: sorted(x[:-4] for x in os.listdir(f'{root}/{f}') if x.endswith('.tsx') and '.stories' not in x) for f in ('marketing', 'product')}
canon = lambda n: ALIAS.get(n, n)
names = sorted({canon(n) for f in fam for n in fam[f]})
file_of = lambda f, n: next((x for x in fam[f] if canon(x) == n), None)
def kit(f, n):
    s = open(f'{root}/{f}/{n}.stories.tsx').read()
    m = re.search(r"kit: '([\w-]+)'", s)
    return m.group(1) if m else 'static'
rows = ['| Primitive | Marketing | Product | Kit support (marketing / product) |', '|---|---|---|---|']
for n in names:
    fa, fb = file_of('marketing', n), file_of('product', n)
    k = ' / '.join(kit(f, x) if x else '—' for f, x in (('marketing', fa), ('product', fb)))
    label = n + (f' (product: {fb})' if fb and fb != n else '')
    rows.append(f"| {label} | {'✓' if fa else '—'} | {'✓' if fb else '—'} | {k} |")
both = sum(1 for n in names if file_of('marketing', n) and file_of('product', n))
table = '\n'.join(rows) + f"\n\n{len(fam['marketing'])} marketing, {len(fam['product'])} product, {both} in both, {len(names)} distinct."
p = 'docs/PRIMITIVES.md'
s = open(p).read()
s = re.sub(r'(<!-- matrix:start -->\n).*?(\n<!-- matrix:end -->)', lambda m: m.group(1) + table + m.group(2), s, flags=re.S)
open(p, 'w').write(s)
print(table.splitlines()[-1])
