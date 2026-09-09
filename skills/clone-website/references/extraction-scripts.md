# Extraction scripts

Run these in the page context via your browser automation tool and capture the full output. Do not hand-write substitutes and do not measure properties one at a time — a partial extraction is how guessed values reach a spec.

## 1. Asset discovery

Run once per page during Phase 2, before downloading anything.

```javascript
JSON.stringify({
  images: [...document.querySelectorAll('img')].map(img => ({
    src: img.src || img.currentSrc,
    alt: img.alt,
    width: img.naturalWidth,
    height: img.naturalHeight,
    parentClasses: img.parentElement?.className?.toString(),
    siblingImages: img.parentElement ? [...img.parentElement.querySelectorAll('img')].length : 0,
    position: getComputedStyle(img).position,
    zIndex: getComputedStyle(img).zIndex
  })),
  videos: [...document.querySelectorAll('video')].map(v => ({
    src: v.src || v.querySelector('source')?.src,
    poster: v.poster, autoplay: v.autoplay, loop: v.loop, muted: v.muted
  })),
  backgroundImages: [...document.querySelectorAll('*')].filter(el => {
    const bg = getComputedStyle(el).backgroundImage;
    return bg && bg !== 'none';
  }).map(el => ({
    url: getComputedStyle(el).backgroundImage,
    element: el.tagName + '.' + el.className?.toString().split(' ')[0]
  })),
  svgCount: document.querySelectorAll('svg').length,
  favicons: [...document.querySelectorAll('link[rel*="icon"]')].map(l => ({ href: l.href, sizes: l.sizes?.toString() }))
}, null, 2);
```

`siblingImages > 1` or a non-static `position` is the signal for a **layered composition** — a background plus a foreground mockup plus an overlay. Enumerate all of them.

## 2. Token harvest

Run once during Phase 2. The output seeds `src/tokens/<site-key>.ts`; frequency ordering tells you which values are real tokens and which are one-offs.

```javascript
(function () {
  const tally = (arr) => Object.entries(arr.reduce((a, v) => (v && (a[v] = (a[v] || 0) + 1), a), {}))
    .sort((a, b) => b[1] - a[1]);
  const els = [...document.querySelectorAll('body *')].slice(0, 3000);
  const cs = els.map(getComputedStyle);
  return JSON.stringify({
    colors:      tally(cs.map(s => s.color)).slice(0, 30),
    backgrounds: tally(cs.map(s => s.backgroundColor)).filter(([v]) => v !== 'rgba(0, 0, 0, 0)').slice(0, 30),
    fontFamilies:tally(cs.map(s => s.fontFamily)).slice(0, 10),
    fontSizes:   tally(cs.map(s => s.fontSize)).slice(0, 20),
    fontWeights: tally(cs.map(s => s.fontWeight)).slice(0, 10),
    lineHeights: tally(cs.map(s => s.lineHeight)).slice(0, 20),
    radii:       tally(cs.map(s => s.borderRadius)).filter(([v]) => v !== '0px').slice(0, 15),
    shadows:     tally(cs.map(s => s.boxShadow)).filter(([v]) => v !== 'none').slice(0, 15),
    easings:     tally(cs.map(s => s.transitionTimingFunction)).slice(0, 10),
    durations:   tally(cs.map(s => s.transitionDuration)).filter(([v]) => v !== '0s').slice(0, 10),
    cssVars: (() => {
      const root = getComputedStyle(document.documentElement);
      return [...root].filter(p => p.startsWith('--')).map(p => [p, root.getPropertyValue(p).trim()]);
    })()
  }, null, 2);
})();
```

If `cssVars` comes back populated, the site already publishes its own token names. Adopt them — matching the original's vocabulary makes every later spec easier to read.

## 3. Per-component extraction

Run once per component, against its selector. This is the source of every value in a spec.

```javascript
(function (selector) {
  const el = document.querySelector(selector);
  if (!el) return JSON.stringify({ error: 'Element not found: ' + selector });
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
  const extract = (e) => {
    const s = getComputedStyle(e), out = {};
    props.forEach(p => { const v = s[p]; if (v && !skip.has(v)) out[p] = v; });
    return out;
  };
  const walk = (e, depth) => depth > 4 ? null : ({
    tag: e.tagName.toLowerCase(),
    classes: e.className?.toString().split(' ').slice(0, 5).join(' '),
    text: e.childNodes.length === 1 && e.childNodes[0].nodeType === 3 ? e.textContent.trim().slice(0, 200) : null,
    styles: extract(e),
    image: e.tagName === 'IMG' ? { src: e.src, alt: e.alt, naturalWidth: e.naturalWidth, naturalHeight: e.naturalHeight } : null,
    childCount: e.children.length,
    children: [...e.children].slice(0, 20).map(c => walk(c, depth + 1)).filter(Boolean)
  });
  return JSON.stringify(walk(el, 0), null, 2);
})('SELECTOR');
```

## 4. State diff

The diff between two runs of script 3 *is* the behaviour spec. Capture state A, trigger the change through the real mechanism (scroll to the threshold, click the tab, hover the element), capture state B, then diff.

```javascript
(function (a, b) {
  const walk = (x, y, path, out) => {
    if (!x || !y) return out;
    Object.keys({ ...x.styles, ...y.styles }).forEach(k => {
      if (x.styles?.[k] !== y.styles?.[k]) out.push({ path, prop: k, from: x.styles?.[k] ?? null, to: y.styles?.[k] ?? null });
    });
    (x.children || []).forEach((c, i) => walk(c, y.children?.[i], path + ' > ' + (c.tag || '?'), out));
    return out;
  };
  return JSON.stringify(walk(a, b, a.tag || 'root', []), null, 2);
})(STATE_A_JSON, STATE_B_JSON);
```

Record each entry in the spec as: *property `X` goes `from` → `to`, triggered by TRIGGER, transition TRANSITION_CSS.* An empty diff means you did not actually trigger the state — check the mechanism before concluding the component is static.

## 5. Interaction model probe

Run before clicking anything, to settle the single most expensive question in the clone.

```javascript
JSON.stringify({
  scrollSnap: [...document.querySelectorAll('*')].filter(e => {
    const t = getComputedStyle(e).scrollSnapType; return t && t !== 'none';
  }).map(e => e.tagName + '.' + e.className?.toString().split(' ')[0]),
  sticky: [...document.querySelectorAll('*')].filter(e => ['sticky','fixed'].includes(getComputedStyle(e).position))
    .map(e => ({ el: e.tagName + '.' + e.className?.toString().split(' ')[0], position: getComputedStyle(e).position, top: getComputedStyle(e).top, zIndex: getComputedStyle(e).zIndex })),
  animationTimeline: [...document.querySelectorAll('*')].filter(e => {
    const t = getComputedStyle(e).animationTimeline; return t && t !== 'auto' && t !== 'none';
  }).length,
  smoothScrollLib: {
    lenis: !!document.querySelector('.lenis, [data-lenis], html.lenis'),
    locomotive: !!document.querySelector('[data-scroll-container], .has-scroll-smooth'),
    htmlScrollBehavior: getComputedStyle(document.documentElement).scrollBehavior
  },
  tabLike: [...document.querySelectorAll('[role="tab"], [role="tablist"], [aria-selected]')].length,
  observers: typeof IntersectionObserver !== 'undefined'
}, null, 2);
```

A populated `scrollSnap`, `sticky`, or `animationTimeline` alongside tab-looking markup means the tabs are almost certainly scroll-driven, not click-driven. Confirm by scrolling before you click. A truthy `smoothScrollLib` entry must be reproduced — native scrolling feels visibly different.
