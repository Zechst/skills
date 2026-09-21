# Source recon (Phase 0)

Do this **before** opening the browser. A page's own source usually carries the exact values, copy and data that you would otherwise reconstruct from the rendered DOM — and it is not blocked, throttled or lazy-loaded. Use the browser to *verify* and to measure behaviour; use the source to *read*.

Save everything to the scratchpad or `docs/research/<site-key>/source/`, never into the project's `src/`.

## 1. Fetch the HTML and the stylesheets

```bash
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36'
curl -sL -A "$UA" "$URL" -o home.html -w '%{http_code} %{size_download}\n'
grep -o '<link[^>]*stylesheet[^>]*>' home.html          # CSS bundles
grep -o '<script[^>]*src="[^"]*"' home.html | head      # JS bundles (rarely needed)
# then: curl -sL "$ORIGIN/path/to/bundle.css" -o bundle.css
```

A 200 with a large body means the page is server-rendered and the markup is real. A tiny body full of `<div id="root">` means client-rendered: fall back to the browser for content, but still fetch the CSS.

## 2. Detect the stack (it decides everything downstream)

| Signal in the HTML/CSS | Meaning | What it gives you |
|---|---|---|
| `<astro-island … props="…">` | Astro + hydrated components | Component **props as JSON** — full copy, lists, pricing tables, tab labels. Parse them (below). |
| `__NEXT_DATA__`, `self.__next_f` | Next.js | Page props / RSC payload |
| `data-slot="…"`, classes like `focus-visible:ring-ring/50`, `aria-invalid:border-destructive` | **shadcn/ui** | The primitives are Radix or Base UI; behaviour is standard, styling is custom |
| `radix-…` ids, `data-radix-*`, `data-state` | Radix UI | Headless primitive to mirror |
| `--color-*`, `--text-*`, `--radius-*`, `--spacing` in `:root` | **Tailwind v4 theme** | The whole token set, verbatim |
| Long utility-class strings | Tailwind | Exact spacing/size values live in the classes |
| `<symbol id=…>` in a fetched `icons.svg`, `<use href="/icons.svg#…">` | SVG sprite | One file holds every icon and often the company logos |

State the detected stack in `TOPOLOGY.md`. If it is shadcn/Radix/Base UI + Tailwind, the clone should be built the same way (see the styling-stack decision in `SKILL.md`).

## 3. Read the token blocks — don't infer them

Tailwind v4 sites publish their whole theme in `:root` (light) and a dark selector. Adopt these verbatim; only fall back to the frequency tally in `extraction-scripts.md` when no such block exists.

```python
import re, json
css = open('bundle.css').read()
i = css.find('--color-background-100')            # any token you know exists
a = css.rfind('}', 0, i) + 1                       # start of the enclosing rule
print(css[a:css.find('{', a)][:80])                # selector — confirm it is :root / :host or .dark
block = css[css.find('{', a) + 1 : css.find('}', i)]
props = [p.strip() for p in block.split(';') if p.strip()]
# drop noise: vendor design-system tokens and the default Tailwind palette you get for free
keep = [p for p in props if not re.search(r'kumo|oklch', p)]
json.dump(keep, open('light-theme.json', 'w'))
```

Look for **redefined scales**: a site that sets `--text-sm: 13px` and `--text-base: 14px` breaks any assumption that `text-sm` is 14px. Read the scale, do not assume Tailwind's defaults.

Also grab: `@font-face` rules (file names + weights), keyframes, and the `heading-*`/`type-*` custom properties that define the type scale (they often differ per breakpoint and per `[data-type=…]` scope — keep the desktop value and note that mobile is unextracted).

## 4. Parse framework island / page props

```python
import re, html, json
h = open('home.html').read()
def un(v):                                         # Astro serialises props as [type, value]
    if isinstance(v, list) and len(v) == 2 and isinstance(v[0], int):
        t, x = v
        if t == 0: return {k: un(y) for k, y in x.items()} if isinstance(x, dict) else x
        if t == 1: return [un(y) for y in x]
    return v
def island(name):
    m = re.search(r'<astro-island[^>]*component-export="%s"[^>]*props="([^"]*)"' % name, h)
    return {k: un(v) for k, v in json.loads(html.unescape(m.group(1))).items()} if m else None
print(re.findall(r'component-export="([A-Za-z]+)"', h))     # every island on the page
```

Islands whose props are `{}` (canvas, WebGL, waveforms, toasts) carry their content in the JS bundle — those need a screenshot and a stand-in, and go on the *known gaps* list.

## 5. Condense markup before reading it

Raw HTML is dominated by scripts, inline SVG and long class strings. Strip them so the structure is legible:

```python
def clean(s):
    s = re.sub(r'<script.*?</script>', '', s, flags=re.S)
    s = re.sub(r'<style.*?</style>', '', s, flags=re.S)
    s = re.sub(r'<svg.*?</svg>', '<svg/>', s, flags=re.S)
    s = re.sub(r'props="[^"]{200,}"', 'props="…"', s)
    return re.sub(r'\s+', ' ', s)
```

Section ids may carry an unstable numeric suffix that changes between loads (`home-title-22` vs `home-title-1`). Record ids as a pattern and never select by the number.

## 6. Assets that arrive as one file

If the page uses an SVG sprite, download it **once** (`/icons.svg`) and reference symbols with `<use href="…#id">`. Generate a `viewBox` map from the `<symbol viewBox=…>` attributes so components size correctly. This is one download instead of hundreds of extracted SVGs, and it usually already contains the third-party logos.

## What this replaces and what it doesn't

Source recon replaces the *reading* half of extraction (tokens, copy, data, class strings). It does **not** replace measuring: layout, computed sizes at a viewport, scroll behaviour and every interactive state still come from the browser (`extraction-scripts.md`, `layout-diff.md`). Where you take a value from source and it affects layout, verify it against the DOM once.

## 5. Look for a published component library

Before measuring primitives (inputs, checkboxes, menus, tooltips…) search for the brand's own library: `npm view @<brand>/<name>`, `github.com/<brand>`, the CSS for token prefixes that name a library (Cloudflare's `--color-kumo-*`), and the product's dashboard or docs, which often use it. Check the licence. If it is permissive, `npm pack` it, extract it into the scratchpad, and read `dist/` for the class strings and the registry/typings for props; its docs site usually renders every component publicly, so you can measure without an account. Watch three traps: a library's stylesheet may pin light values behind its own `data-mode` switch (strip it if your theme toggles `color-scheme` or a `.dark` class), Tailwind v4 only emits `@theme` variables that a class uses (use `@theme static` for a token file), and its type scale may clash with yours (compare before importing). Log in through the user's own signed-in browser only if there is no public source, and never store account content.
