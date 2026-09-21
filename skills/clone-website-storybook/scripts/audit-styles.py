#!/usr/bin/env python3
"""Style-family audit. A library that ships two styles (e.g. a brand's marketing style and its product/dashboard style) keeps each
in its own folder: src/atoms/primitives/<family>/. This fails when a family leaks into the other:
  - a `product/` file uses a marketing token class or imports from `marketing/`
  - a `marketing/` file uses a product (Kumo) token class or imports from `product/`
Usage: audit-styles.py [src-dir] [--product NAME] [--marketing NAME] [--product-token kumo] [--marketing-tokens REGEX]
Defaults match cloudflare-cn: families `marketing` and `product`, product tokens contain `kumo`, marketing tokens are read from
src/styles/theme.css (--color-* names outside the kumo namespace)."""
import glob, os, re, sys

src = 'src'; fam_a, fam_b, ptok = 'marketing', 'product', 'kumo'
args = sys.argv[1:]
while args:
    a = args.pop(0)
    if a == '--marketing': fam_a = args.pop(0)
    elif a == '--product': fam_b = args.pop(0)
    elif a == '--product-token': ptok = args.pop(0)
    else: src = a

theme = open(os.path.join(src, 'styles', 'theme.css')).read()
names = sorted({m for m in re.findall(r'^\s*--color-([\w-]+):', theme, re.M) if ptok not in m and not re.match(r'(neutral|red|blue|orange|green|teal|emerald|white|black)', m)})
util = r'(?:bg|text|border|ring|outline|fill|stroke|from|to|via|divide|placeholder|caret|decoration)'
marketing_tok = re.compile(r'(?<![\w-])(?:[\w\[\]&:>*()=.-]+:)*' + util + r'-(?:' + '|'.join(re.escape(n) for n in names) + r')(?![\w-])|(?<![\w-])shadow-stack(?![\w-])')
product_tok = re.compile(r'(?<![\w-])(?:[\w\[\]&:>*()=.-]+:)*' + util + '-' + ptok + r'-[\w-]+')

problems = []
for f in sorted(glob.glob(os.path.join(src, '**', '*.ts*'), recursive=True)):
    fam = fam_a if f'/{fam_a}/' in f else fam_b if f'/{fam_b}/' in f else None
    if not fam: continue
    text = open(f).read()
    other = fam_b if fam == fam_a else fam_a
    for m in re.finditer(r"from\s+['\"]([^'\"]+)['\"]", text):
        if f'/{other}/' in m.group(1) or m.group(1).endswith(f'/{other}'):
            problems.append(f'IMPORT  {f}: {fam} imports from {other}: {m.group(1)}')
    code = re.sub(r'//[^\n]*|/\*.*?\*/', '', text, flags=re.S)
    tok = marketing_tok if fam == fam_b else product_tok
    for m in sorted({x.group(0) for x in tok.finditer(code)}):
        problems.append(f'TOKEN   {f}: {fam} file uses a {other} token: {m}')
if problems:
    print('\n'.join(problems)); print(f'\n{len(problems)} style-family problem(s)'); sys.exit(1)
print(f'OK: {fam_a} and {fam_b} stay in their own token sets and never import each other')
