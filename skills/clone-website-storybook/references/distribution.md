# Distribution: one source, generated outputs

The clone is going to be reused as a design kit, and not everyone uses React, Base UI or Tailwind. Do not hand-write a second copy. Keep **one source** and **generate** everything else, so the copies cannot drift.

## The rule

| | What | Edited by hand? |
|---|---|---|
| **Source** | React components + Base UI behaviour + Tailwind utilities on the markup, with stories | yes, the only place |
| **Tokens** | `theme.css` variables (colours incl. `.dark`, type, radii, shadows, easings, keyframes) exported as `tokens.css` and `tokens.json` | no, generated |
| **CSS** | Compiled Tailwind for the classes the components use → `dist/kit.css` | no, generated |
| **HTML snippets** | Each component's markup per state, rendered from its stories with `renderToStaticMarkup` → `dist/html/<Tier>/<Name>.html` | no, generated |
| **Behaviour** | A small vanilla script that flips the same `data-*` attributes Base UI sets (`data-open`, `data-selected`, `data-active`, `data-disabled`, `data-hidden`) | yes, once, shared |

Because the styling is Tailwind utilities on the markup, the generated HTML carries the same classes as React: the look is identical by construction. Interactive styles must key off `data-*` attributes (never React state or JS-set inline styles), so the vanilla script needs no styling of its own.

## Rules that keep it clean

1. **Never edit `dist/`.** CI regenerates it and fails when the committed output differs.
2. **The data-attribute names are the contract** between React, the snippets and the vanilla script. A test drives each interactive component in both and compares the attributes after the same steps.
3. **Say what each component supports** in a table (`dist/SUPPORT.md`, generated from a `support` field in each story's parameters): `static`, `static + vanilla JS`, or `React only`. Springs, WebGL, canvas and beams are `React only`; the kit does not promise them.
4. **Two packages, one direction:** `@brand/css` (tokens, CSS, snippets, script) has no React dependency; `@brand/react` may depend on it, never the reverse.
5. **Vanilla behaviour covers a short list** (tabs, dialog, dropdown, tooltip, accordion, select). Anything needing measurement or springs stays React-only.

## Do not

- Rewrite components twice (HTML/CSS source, then React).
- Add Web Components as a third layer.
- Write per-component plain CSS files — that undoes the utility-class approach and reintroduces drift.

## Steps

1. Export tokens from `theme.css` (`tokens.css`, `tokens.json`).
2. Build `kit.css` with the Tailwind CLI, scanning `src/**`.
3. Render each story to HTML (skip stories marked `React only`), one file per component/state.
4. Write the vanilla behaviour script for the shared list; test it against the snippets in a browser.
5. Generate `SUPPORT.md`; add the CI drift check (`generate && git diff --exit-code dist/`).
6. Open one snippet and one page in plain HTML with only `kit.css` linked, and compare with the story.

## Primitive coverage

A brand kit needs the basics a new product or marketing page uses, not every shadcn component. Add a primitive when a live page of the brand shows it, and mark each one **extracted** (measured from a live page, with the URL) or **derived** (built from the brand's tokens because no live example exists). Never present a derived one as a clone. Skip generic, unbranded ones (calendar, chart, resizable, sidebar) until a project needs them; Base UI covers most, so adding one later is cheap.
