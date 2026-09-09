# Extraction scripts

Run these in the page context via your browser automation tool. Do not hand-write substitutes and do not measure properties one at a time — a partial extraction is how guessed values reach a spec.

**Keep output compact.** Tool responses truncate, and a truncated extraction silently drops the fields at the bottom. Every script below returns a dense string rather than pretty-printed JSON for exactly this reason. If you add a field, add it near the top.

## 1. Asset discovery

Run **after** a full scroll pass. Lazy-loaded images report `naturalWidth: 0` and may not be in the DOM at all until they enter the viewport, so enumerating a freshly-loaded page undercounts and records zero dimensions.

```javascript
(function () {
  const imgs = [...document.querySelectorAll('img')];
  const name = (u) => {
    // CDN transform URLs end in a query-ish segment (f=auto,fit=scale-down,width=2560),
    // so the last path segment is NOT a filename. Fall back to a hash of the full URL.
    const clean = u.split('?')[0];
    const last = clean.split('/').pop() || '';
    const ok = /^[\w.-]+\.(png|jpe?g|webp|avif|gif|svg|mp4|webm)$/i.test(last);
    if (ok) return last;
    let h = 0; for (let i = 0; i < u.length; i++) h = (h * 31 + u.charCodeAt(i)) | 0;
    const ext = (u.match(/\.(png|jpe?g|webp|avif|gif|svg|mp4|webm)/i) || [, 'webp'])[1];
    return 'asset-' + Math.abs(h).toString(36) + '.' + ext;
  };
  const rows = imgs.map(i => {
    const u = i.currentSrc || i.src;
    const p = i.parentElement;
    const sibs = p ? p.querySelectorAll('img').length : 0;
    const pos = getComputedStyle(i).position;
    const layered = sibs > 1 || pos === 'absolute' || pos === 'fixed';
    return name(u) + ' [' + i.naturalWidth + 'x' + i.naturalHeight + ']' + (layered ? ' LAYERED' : '') + ' <- ' + u.slice(0, 100);
  });
  const bgs = [...document.querySelectorAll('*')]
    .filter(e => { const b = getComputedStyle(e).backgroundImage; return b && b !== 'none'; })
    .map(e => (e.tagName + '.' + (e.className?.toString().split(' ')[0] || '')) + ' => ' + getComputedStyle(e).backgroundImage.slice(0, 70));
  return [
    'COUNTS imgs=' + imgs.length + ' zeroDim=' + imgs.filter(i => !i.naturalWidth).length +
      ' videos=' + document.querySelectorAll('video').length +
      ' svgs=' + document.querySelectorAll('svg').length +
      ' canvas=' + document.querySelectorAll('canvas').length +
      ' bgImages=' + bgs.length,
    'IMAGES:', ...rows.slice(0, 60),
    'BACKGROUNDS:', ...bgs.slice(0, 30)
  ].join('\n');
})();
```

`zeroDim > 0` means you enumerated too early — scroll and re-run. `LAYERED` marks a composition: a background plus a foreground mockup plus an overlay, all of which must be downloaded. Use the emitted names as download filenames; the hash fallback is what stops several CDN-transformed images collapsing onto one file.

A page can carry hundreds of inline `<svg>` elements. Deduplicate by hashing the concatenated `<path d>` values before creating icon components, or you will generate one component per occurrence rather than per icon.

## 2. Token harvest

Run once during Phase 2. Frequency ordering separates real tokens from one-offs.

```javascript
(function () {
  const tally = (arr, n) => Object.entries(arr.reduce((a, v) => (v && (a[v] = (a[v] || 0) + 1), a), {}))
    .sort((a, b) => b[1] - a[1]).slice(0, n).map(([v, c]) => v + ' ×' + c);
  const els = [...document.querySelectorAll('body *')].slice(0, 3000);
  const cs = els.map(getComputedStyle);
  const root = getComputedStyle(document.documentElement);
  // Build-tool-generated names (--sx-ljw4h1, --tw-xxx) are noise, not a design vocabulary.
  const vars = [...root].filter(p => p.startsWith('--') && !/^--(sx|tw|chakra|mui|radix)-|^--[a-z]{1,3}-?[0-9a-z]{5,}$/i.test(p));
  return [
    'FONTS: ' + tally(cs.map(s => s.fontFamily), 4).join(' | '),
    'SIZES: ' + tally(cs.map(s => s.fontSize), 12).join(' | '),
    'WEIGHTS: ' + tally(cs.map(s => s.fontWeight), 6).join(' | '),
    'LINEHEIGHT: ' + tally(cs.map(s => s.lineHeight), 8).join(' | '),
    'COLORS: ' + tally(cs.map(s => s.color), 12).join(' | '),
    'BACKGROUNDS: ' + tally(cs.map(s => s.backgroundColor).filter(v => v !== 'rgba(0, 0, 0, 0)'), 10).join(' | '),
    'RADII: ' + tally(cs.map(s => s.borderRadius).filter(v => v !== '0px'), 8).join(' | '),
    'SHADOWS: ' + tally(cs.map(s => s.boxShadow).filter(v => v !== 'none'), 5).join(' | '),
    'EASING: ' + tally(cs.map(s => s.transitionTimingFunction).filter(v => v !== 'ease'), 5).join(' | '),
    'DURATION: ' + tally(cs.map(s => s.transitionDuration).filter(v => v !== '0s'), 5).join(' | '),
    'VARS ' + vars.length + ' meaningful of ' + [...root].filter(p => p.startsWith('--')).length + ' total:',
    ...vars.slice(0, 60).map(p => '  ' + p + '=' + root.getPropertyValue(p).trim().slice(0, 60))
  ].join('\n');
})();
```

Non-standard weights (510, 590) are the signature of a **variable font** — load the variable file and set the exact numeric weight rather than rounding to 500 or 600.

Adopt the site's own custom-property names only where they survive the filter. A page can publish 400+ variables of which most are compiler output; matching a generated hash name buys nothing and makes every later spec harder to read.

## 3. Per-component extraction

Run once per component, against its selector. This is the source of every value in a spec. Define it once as `window.__cap` so the state-diff script below can reuse it.

```javascript
window.__cap = function (selector) {
  const el = document.querySelector(selector);
  if (!el) return { error: 'not found: ' + selector };
  const props = [
    'fontSize','fontWeight','fontFamily','lineHeight','letterSpacing','color',
    'textTransform','textDecoration','backgroundColor','background',
    'padding','paddingTop','paddingRight','paddingBottom','paddingLeft',
    'margin','marginTop','marginRight','marginBottom','marginLeft',
    'width','height','maxWidth','minWidth','maxHeight','minHeight',
    'display','flexDirection','justifyContent','alignItems','gap',
    'gridTemplateColumns','gridTemplateRows',
    'borderRadius','border','borderTop','borderBottom','borderLeft','borderRight',
    'boxShadow','overflow','overflowX','overflowY',
    'position','top','right','bottom','left','zIndex',
    'opacity','transform','transition','cursor',
    'objectFit','objectPosition','mixBlendMode','filter','backdropFilter',
    'whiteSpace','textOverflow','WebkitLineClamp'
  ];
  const skip = new Set(['none','normal','auto','0px','rgba(0, 0, 0, 0)']);
  const extract = (e) => { const s = getComputedStyle(e), o = {}; props.forEach(p => { const v = s[p]; if (v && !skip.has(v)) o[p] = v; }); return o; };
  const walk = (e, d) => d > 3 ? null : ({
    tag: e.tagName.toLowerCase(),
    cls: e.className?.toString().split(' ')[0],
    attrs: [...e.attributes].filter(a => a.name !== 'style').map(a => a.name + '=' + a.value).join(';'),
    text: e.childNodes.length === 1 && e.childNodes[0].nodeType === 3 ? e.textContent.trim().slice(0, 200) : null,
    styles: extract(e),
    image: e.tagName === 'IMG' ? { src: e.currentSrc || e.src, alt: e.alt, w: e.naturalWidth, h: e.naturalHeight } : null,
    children: [...e.children].slice(0, 12).map(c => walk(c, d + 1)).filter(Boolean)
  });
  return walk(el, 0);
};
'__cap ready';
```

Read the result back in slices (`JSON.stringify(window.__cap('header').styles)`, then per child) rather than dumping the whole tree in one response, which truncates on any real component.

## 4. State diff

Capture, trigger, capture and diff **inside the page**, returning only the diff. Do not round-trip two JSON trees through the conversation — they truncate, and the diff is all you need.

```javascript
(function () {
  window.__diff = function (a, b) {
    const out = [];
    const walk = (x, y, path) => {
      if (!x || !y) return;
      if (x.cls !== y.cls) out.push(path + ' :: className :: ' + x.cls + '  ->  ' + y.cls);
      if (x.attrs !== y.attrs) out.push(path + ' :: attributes :: changed');
      const keys = new Set([...Object.keys(x.styles || {}), ...Object.keys(y.styles || {})]);
      keys.forEach(k => { if (x.styles?.[k] !== y.styles?.[k]) out.push(path + ' :: ' + k + ' :: ' + (x.styles?.[k] ?? 'unset') + '  ->  ' + (y.styles?.[k] ?? 'unset')); });
      (x.children || []).forEach((c, i) => walk(c, y.children?.[i], path + '>' + (c.cls || c.tag)));
    };
    walk(a, b, a.tag || 'root');
    return out;
  };
  '__diff ready';
})();
```

Scroll state, in one call — note that it asserts the scroll actually moved:

```javascript
const SEL = 'header';
window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 600));
const a = window.__cap(SEL), y0 = window.scrollY;
window.scrollTo(0, 1200); await new Promise(r => setTimeout(r, 900));
const b = window.__cap(SEL), y1 = window.scrollY;
const d = window.__diff(a, b);
'TRIGGER FIRED: ' + (y1 !== y0) + ' (' + y0 + ' -> ' + y1 + ')\nDIFF ' + d.length + ':\n' + d.join('\n');
```

**An empty diff is ambiguous.** It means the component is genuinely static *or* the trigger never engaged, and those need opposite responses. `TRIGGER FIRED: true` with an empty diff is a real `static` verdict. `TRIGGER FIRED: false` means the page scrolls an inner container, not the window — find the scroll container from script 5's `scrollSnap` list and scroll that element instead.

Record each surviving entry in the spec as: *property `X` goes `from` → `to`, triggered by TRIGGER, transition TRANSITION_CSS.*

## 5. Hover state

`:hover` needs a real pointer; synthetic events do not trigger it, and a `transition` declaring `color` proves only that a transition exists, not that hover changes colour. Hover with your browser tool at the element's centre, then assert the hover registered before trusting the result.

```javascript
const el = [...document.querySelectorAll('header a')].find(a => a.textContent.trim() === 'Pricing');
const r = el.getBoundingClientRect();
window.__hoverEl = el;
JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2),
  restColor: getComputedStyle(el).color, restBg: getComputedStyle(el).backgroundColor,
  declaredTransition: getComputedStyle(el).transition });
```

Hover those coordinates, then:

```javascript
const el = window.__hoverEl, c = getComputedStyle(el);
JSON.stringify({ hoverRegistered: el.matches(':hover'), color: c.color, background: c.backgroundColor, transform: c.transform, opacity: c.opacity });
```

`hoverRegistered: false` means you missed the element — re-hover before concluding anything. `hoverRegistered: true` with unchanged values is a real finding: **no hover story**, however much the declared transition suggests otherwise. Build only what you extracted.

## 6. Interaction model probe

Run before clicking anything, to settle the most expensive question in the clone.

```javascript
(function () {
  const nm = e => e.tagName + '.' + (e.className?.toString().split(' ')[0] || '');
  const all = [...document.querySelectorAll('*')];
  return [
    'SCROLLSNAP: ' + all.filter(e => { const t = getComputedStyle(e).scrollSnapType; return t && t !== 'none'; }).map(nm).join(', '),
    'STICKY: ' + all.filter(e => ['sticky','fixed'].includes(getComputedStyle(e).position))
      .slice(0, 10).map(e => nm(e) + '(' + getComputedStyle(e).position + ' top:' + getComputedStyle(e).top + ' z:' + getComputedStyle(e).zIndex + ')').join(', '),
    'ANIMATION_TIMELINE: ' + all.filter(e => { const t = getComputedStyle(e).animationTimeline; return t && t !== 'auto' && t !== 'none'; }).length,
    'SCROLL_CONTAINERS: ' + all.filter(e => e.scrollHeight > e.clientHeight + 50 && ['auto','scroll'].includes(getComputedStyle(e).overflowY)).slice(0, 6).map(nm).join(', '),
    'SMOOTH_SCROLL: lenis=' + !!document.querySelector('.lenis, [data-lenis], html.lenis') +
      ' locomotive=' + !!document.querySelector('[data-scroll-container], .has-scroll-smooth') +
      ' scrollBehavior=' + getComputedStyle(document.documentElement).scrollBehavior,
    'ARIA_TABS: ' + document.querySelectorAll('[role="tab"], [role="tablist"], [aria-selected]').length,
    'CLICKABLE_GROUPS: ' + all.filter(e => e.children.length >= 2 && [...e.children].every(c => c.tagName === 'BUTTON' || getComputedStyle(c).cursor === 'pointer')).slice(0, 6).map(nm).join(', ')
  ].join('\n');
})();
```

`ARIA_TABS: 0` does **not** mean there are no tabs — plenty of sites build them from unlabelled `div`s, which is why `CLICKABLE_GROUPS` is listed alongside it. Treat a populated `SCROLLSNAP`, `ANIMATION_TIMELINE`, or `SCROLL_CONTAINERS` next to a clickable group as strong evidence the group is scroll-driven, and confirm by scrolling before you click. A populated `SCROLL_CONTAINERS` also tells you which element to scroll when `window.scrollTo` leaves the diff empty. Any truthy `SMOOTH_SCROLL` entry must be reproduced — native scrolling feels visibly different.
