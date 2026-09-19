# Layout diff and refactor diff

A clone that "looks right" can be hundreds of pixels off in total height and nobody sees it in a screenshot. Measure it, with numbers, against the original — and use the same discipline when refactoring your own components.

## 1. Section geometry: record on the original, diff on the clone

**On the original** (after a slow scroll pass so lazy content has rendered), record `[top, height]` for each section from `TOPOLOGY.md`:

```javascript
const sel = { hero: '#home-hero', region: '#home-region', /* …one per topology row… */ footer: 'footer' };
window.scrollTo({ top: 0, behavior: 'instant' });
const out = {};
for (const [k, s] of Object.entries(sel)) {
  const r = document.querySelector(s).getBoundingClientRect();
  out[k] = [Math.round(r.top + scrollY), Math.round(r.height)];
}
out.total = document.documentElement.scrollHeight;
JSON.stringify(out);
```

Save the result in `TOPOLOGY.md` as a table (`section | top | height`). Use the same **viewport width** for both measurements; note it.

**On the clone**, run the same script and print the *delta* per section:

```javascript
JSON.stringify([sel.map((s,i)=>{const r=document.querySelector(s).getBoundingClientRect();
  return [Math.round(r.top+scrollY)-live[i][0], Math.round(r.height)-live[i][1]]}),
  document.documentElement.scrollHeight-liveTotal]);
```

Read the output top to bottom. **The first non-zero height is the bug; every later top offset is just its shadow.** Fix the first mismatch, re-measure, repeat. Tolerance: heights exact, tops within 1px (sub-pixel accumulation).

When a section's height is off, measure its **children** on the original the same way (`top` and `height` of heading, sub-copy, media, grid…) and diff those. Typical causes found this way:

- a global reset (`h1,h2,p { margin: 0 }`) out-ranking utility margins on paragraphs
- inline controls (copy-link buttons) that make a heading box taller than its text
- a section-level `margin-top` that the original places on the *title* instead
- gaps that live on the parent flex/grid, not on the children
- browser-default line-height (`normal`) versus the site's inherited `1.5`
- panels of a tab group sharing one grid cell, so the tallest one sets everyone's height
- `min-height: 100vh` blocks (footers) that depend on the viewport

## 2. Refactor diff: prove a change changed nothing

Use this whenever you swap an implementation (hand CSS → Tailwind, hand-rolled tabs → a headless primitive, adding a global reset).

1. **Snapshot before.** For every element in the region, record its rect and the computed properties that matter, keyed by role/text (not by DOM index — the structure will change):

```javascript
const P = ['color','backgroundColor','borderTopWidth','borderTopColor','borderBottomWidth','borderBottomColor',
  'borderTopLeftRadius','paddingTop','paddingLeft','fontSize','fontWeight','lineHeight','boxShadow','opacity','display'];
window.__cap = () => { const o = {}, seen = {};
  document.querySelectorAll('[role=tab],[role=tablist],button,[role=tabpanel]').forEach(e => {
    const k = ((e.getAttribute('role')==='tab'||e.tagName==='BUTTON') ? 'T' : (e.getAttribute('role')||e.tagName))
              + ':' + e.textContent.trim().slice(0,22);
    seen[k] = (seen[k]||0)+1; const r = e.getBoundingClientRect(), c = getComputedStyle(e);
    o[k+'#'+seen[k]] = [Math.round(r.x), Math.round(r.y+scrollY), +r.width.toFixed(1), +r.height.toFixed(1), ...P.map(p=>c[p])]; });
  return o; };
sessionStorage.setItem('base:stateA', JSON.stringify(window.__cap()));   // survives navigation on the same origin
```

2. Change the code. 3. Reload, take the same snapshot, and diff key by key.
4. **Classify every difference.** Only three outcomes are acceptable, and you must write down which: *invisible* (a colour on a 0px border, `9999px` vs `calc(infinity*1px)` radius, srgb vs oklab serialisation of the same colour), *intended* (state that moved to a new element), or *a bug to fix*. Do not wave through a difference you cannot explain — several here were real (`text-sm` was 13px in the site's theme, not 14px).

**Capture every state, and verify each baseline is real.** A baseline recorded right after a programmatic click can capture the *unchanged* state if the UI had not re-rendered yet. Compare state B to state A before trusting it; if they are identical, the baseline is invalid — recapture, or verify that state by inspection instead.

## 3. Whole-page fingerprint (cheap smoke test)

Hash each section's subtree (tag + rect size + ~24 computed properties for every element) into one number per section. Equal hashes before/after mean no visual change; a changed hash tells you *which section* moved, then step 2 tells you why. Never compare hashes across a change that legitimately alters computed values (adding a reset) — diff per property instead and classify.

## 4. Automation caveats that will waste your time

- **A backgrounded/hidden browser tab does not run animation frames.** `document.visibilityState === 'hidden'`. Anything that completes on `requestAnimationFrame` or `ResizeObserver` (headless-primitive panel unmounting, indicator measurement, transitions) stalls: an outgoing panel stays mounted, an indicator measures with the fallback font. A screenshot forces a frame, so take one (tiny scale is fine) between the interaction and the measurement.
- **Web fonts load after first paint.** Measure after `document.fonts` reports `loaded`, or after a forced frame.
- **Do not judge by eye at reduced scale.** Sub-pixel and spacing errors of 20–100px hide inside a 0.5×-scaled screenshot.
