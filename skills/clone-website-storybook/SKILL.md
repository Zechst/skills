---
name: clone-website-storybook
description: Reverse-engineer one or more live websites into a Storybook component library organised by atomic design — extract computed CSS, assets, content and behaviour section by section, write a spec per component, then build atoms, molecules, organisms, templates and pages with one story per extracted state. Use when the user wants to clone, replicate, rebuild or copy a website, asks for a pixel-perfect clone, or wants a design system extracted from a live site.
license: MIT
---

# Clone Website → Storybook

Reverse-engineer the target URL(s) into a **Storybook** component library organised by **atomic design**.

If no URL was supplied, ask for one before doing anything else.

You are a **foreman walking the job site**, not a two-phase inspect-then-build pipeline. As you inspect each section you write a **spec** to a file, then build (or dispatch) from that spec. Extraction is meticulous and produces auditable artifacts; construction follows the spec exactly.

## The deliverable

A running Storybook is the primary output — not a page in a web app. Success means:

- Every component lives at its correct **tier** with a colocated `.stories.tsx`
- **One state, one story.** Every state you extracted — default, hover, scrolled, each tab, each breakpoint — is a named story export. A state you cannot select in the Storybook sidebar is a state you did not extract.
- Design tokens are a real token module surfaced as a Storybook docs page
- `npm run build-storybook` passes — the library stays **green**
- The assembled page story is visually indistinguishable from the original

An app route rendering the clone is optional. Build one only if the user asks, and only after the library is green.

## Tiers

Atomic design is the file layout, the split heuristic, and the build order. Classify every extracted element into exactly one tier:

| Tier | What it is | Test |
|---|---|---|
| **atom** | Indivisible primitive — button, icon, badge, input, heading, logo, divider | Composes no other component |
| **molecule** | A few atoms doing one job — search field, nav item, avatar+name, stat pair, card header | Composes only atoms |
| **organism** | A distinct page section — navbar, hero, feature grid, pricing table, footer | Composes molecules and atoms; owns section layout |
| **template** | Page skeleton — grid, scroll container, z-index layers, sticky slots. No real content | Composes organisms as slots; renders with placeholder content |
| **page** | Template filled with the real extracted content | Composes one template |

```
src/
  tokens/<site-key>.ts
  components/<site-key>/
    atoms/Button/{Button.tsx,Button.stories.tsx}
    molecules/NavItem/{NavItem.tsx,NavItem.stories.tsx}
    organisms/SiteHeader/{SiteHeader.tsx,SiteHeader.stories.tsx}
    templates/MarketingLayout/{...}
    pages/<page-key>/{HomePage.tsx,HomePage.stories.tsx}
public/<site-key>/{images,video,fonts}/
docs/research/<site-key>/           # BEHAVIORS.md, TOPOLOGY.md, INVENTORY.md, specs/
docs/design-references/<site-key>/  # screenshots
```

Story titles mirror the tree: `<Site>/Atoms/Button`, `<Site>/Organisms/SiteHeader`, `<Site>/Pages/Home`. The sidebar has exactly these sections — `Foundations` (tokens, theme) then `Atoms`, `Molecules`, `Organisms`, `Templates`, `Pages` — and nothing else. Storybook sorts alphabetically by default, which puts Pages before Templates, so set `storySort` (see `references/storybook-setup.md`).

**Primitives are atoms.** Styled headless primitives — Button, Tabs, Select, Dialog, Popover, Tooltip — are atoms even when the library builds them from several parts (`TabsList`, `TabsTab`, …): from your side they are one indivisible primitive. Do **not** create a separate `ui/` layer or a `UI/…` story section because the shadcn CLI does; point its `ui` alias at the atoms folder (`components.json`: `"ui": "@/atoms"`) and classify whatever it adds. A wrapper that only forwards to another atom is a variant of that atom, not a new one.

**Import direction.** A component imports only from strictly lower tiers, and never from a sibling in its own tier. Constants, types and content that two siblings both need (nav items, tab definitions, copy) live in a `data/` or `lib/` module, not in one of the components. If a molecule needs a molecule, either the inner one is really an atom (it composes nothing), or the outer one is really an organism, or — often best — the outer one takes the inner one as a **slot** (a `renderX` prop or `children`) that the organism above fills in. Reclassify or slot; don't work around it. Record any genuine exception, with the reason, in the library's `docs/STORYBOOK.md` and pass it to the audit with `--allow`.

**Splitting rule.** A component that spans more than one tier must be split — an organism containing an unbuilt card is two units of work, not one. If a spec exceeds ~150 lines you have misclassified the tier; go down a level. This is mechanical. Do not override it with "but it's all related."

**Reuse rule.** Before creating *any* component, at any tier, search for an existing piece that already does the job and compose it: read `INVENTORY.md`, then look through the `atoms/` and `molecules/` folders (and `data/` for shared content) by **structure**, not just by name. An organism is assembled from existing molecules and atoms first; a new atom or molecule is created only when none fits, and the spec's `Composes` field must name the pieces it reuses. Two things that compute to the same structure are one component with variants, not two: a nav link and a footer link, a menu row on desktop and the same row in a mobile panel, a "See all" link in three flyouts. Record every new atom and molecule in `INVENTORY.md` as you create it, and say in the spec why no existing one fit. This is what makes the output a design system rather than a pile of sections.

## Requirements

**Browser automation is mandatory.** You need a tool that can (a) execute JavaScript in the page context and return the result, and (b) capture screenshots at a set viewport. Chrome DevTools MCP, Playwright (MCP or library), Puppeteer, or Browserbase all qualify. If several are available prefer Chrome DevTools MCP. If none is available, ask the user which they have and how to connect it, then stop — this skill cannot run without it.

**A Storybook project.** If one exists, use it and match its conventions. If not, scaffold per `references/storybook-setup.md`.

**Decide where the clone lives and how it is styled — before writing any code.** Ask the user (or infer from the host project) three things, because changing them later is a migration, not a tweak:

1. *Isolation.* Will the clone share a project with an existing app or design system? If the host has its own theme (`--radius`, `--accent`, font, Tailwind config), a clone in the same project will collide with it. Prefer a **separate project/repo** with its own Storybook whenever the host has a theme of its own; nest it only for throw-away studies.
2. *Styling system.* Match the source stack you detect in Phase 0. A Tailwind + shadcn/Radix site is best cloned with Tailwind + a headless primitive library, using the site's own token names, so its class strings can be copied nearly verbatim. Plain scoped CSS is only a stop-gap for a first pass (scope every rule under one root class): before the library is called done, port it to Tailwind utilities written in the JSX (shadcn style: `cva` variants, `cn()`, `data-slot` on parts, `data-[state]:` variants). Do it tier by tier, and prove each batch with `scripts/style-snapshot.mjs` (snapshot every story's rects and computed styles at 1710/768/390 before, snapshot again after, diff; classify every difference as invisible, intended or a bug). Leave in the stylesheet only what utilities cannot express (`@keyframes`, scroll timelines, generated CSS such as the beam). Tests and stories must hook `data-slot`/`data-*` attributes, never styling class names. Close the manual rows of the motion inventory with scripts, not by eye: `scripts/hover-audit.mjs` (force `:hover` on every control, transitions off, diff the changed properties original vs clone), `scripts/tab-order-audit.mjs` (Tab through the page, diff the focus order) and `scripts/scroll-audit.mjs` (scroll to fixed offsets, diff the header state). A plain mouse move is unreliable on a heavy clone (frames starve and transitions do not finish), and some originals carry inline styles that neutralise their own hover classes, so trust the computed result over the class string.
3. *Behaviour layer.* Prefer a headless primitive library (Base UI, Radix) for tabs, selects, dialogs and menus over hand-rolled `role` attributes — you get keyboard navigation, focus handling and ARIA for free, and the source site almost certainly does the same.

Examples below use `npm`; substitute the project's package manager.

## Non-negotiables

These are the differences between a clone and a "close enough" mess.

1. **Extract, never estimate.** Every value in a spec comes from the page itself: `getComputedStyle()` for what renders, and the page's own source (`:root` token blocks, compiled CSS, class strings, framework props — see `references/source-recon.md`) for what it declares. "It looks like `text-lg`" is wrong when the computed value is `18px/24px` and `text-lg` is `18px/28px` — and sites redefine scales (a theme where `text-sm` is 13px and `text-base` is 14px), so never assume a framework's defaults. If a builder has to guess a colour, a font size, or a padding value, extraction failed. If a value truly cannot be extracted (tooling blocked, time-boxed), write it in the spec as an **ASSUMPTION** with the reason, never as a fact.

2. **Identify the interaction model before building.** Scroll through a section slowly *before* clicking anything. If content changes on its own as you scroll, it is scroll-driven — find the mechanism (`IntersectionObserver`, `scroll-snap`, `position: sticky`, `animation-timeline`, scroll listener). Only if nothing moves on scroll do you click and hover to test. Building click-based tabs when the original is scroll-driven is the most expensive error available to you: it is a rewrite, not a CSS fix. Record the verdict in the spec as `INTERACTION MODEL: <static | click | scroll | hover | time>`.

3. **Every state, not just the default — and prove the trigger fired.** Click every tab and extract each one's content. Capture computed styles at scroll 0 *and* past the trigger, then diff them; the diff is the behaviour spec, and each state becomes a story export.

   An empty diff is ambiguous. It means either the component is genuinely static *or* your trigger never engaged, and those demand opposite responses. Never read one as the other. Resolve it with a positive assertion that the trigger actually fired — `el.matches(':hover')` for hover, a changed `scrollY` for scroll, a changed `aria-selected` or panel for tabs — and diff `className` and attributes alongside computed styles, since many sites swap a class rather than an inline style. Only when the trigger provably fired *and* nothing changed do you record `static`.

4. **Real content, real assets.** Pull actual text via `textContent`, download every image and video, inline every SVG as a component. A section that looks like one image is often layered — background gradient, foreground UI mockup, absolutely-positioned overlay icon. Enumerate *all* `<img>` and background images in a container's subtree; a missed overlay makes the clone look empty even when the background is right. Check for `<video>`, Lottie, or canvas before building an elaborate HTML mockup of what a video shows. Generate content only for genuinely per-session server data, or via the approved fallback in `references/generated-asset-fallback.md`.

5. **The spec file is the contract.** Every component gets a spec written *before* any code. Builders receive the spec contents inline in their prompt — never "go read the spec file", never "see TOKENS.md for colours". A builder should need zero external reads. The file persists as the artifact you audit when something looks wrong.

6. **Stay green.** Typecheck after every component; `npm run build-storybook` after every tier. A broken library is never acceptable, even temporarily.
7. **Clone every animation and every interaction — no stills, no "good enough".** If the source moves, the clone moves, with the source's own timings, easings, sequencing and restart behaviour. If it responds to hover, focus, click, scroll or keyboard, the clone does too. A component that animates on the source and is a static picture in the clone is *unfinished*, not "a known gap". What moves is decided by a **motion inventory** you generate, not by what you happened to notice (see Phase 1 and `references/motion.md`). The only way an item leaves the inventory unbuilt is the user explicitly approving its omission, recorded in the file.

## Phase 0 — Source recon

Before opening the browser, read what the page publishes about itself. Follow `references/source-recon.md`:

1. `curl` the HTML and every stylesheet.
2. **Detect the stack** (Astro/Next islands, shadcn `data-slot`, Radix ids, Tailwind theme variables, SVG sprite) and record it in `TOPOLOGY.md`. It decides the styling system and the primitive library.
3. Pull the **token blocks** (`:root`, dark selector) and fonts verbatim; parse framework **props** for copy, lists and data tables; download an **icon sprite** once instead of extracting hundreds of SVGs.

This is often faster and more exact than DOM extraction, and it is unaffected by lazy loading or browser-tool restrictions. It does not replace measuring layout and behaviour in the browser.

## Phase 1 — Reconnaissance

Assign each target a readable `<site-key>` (origin slug) and `<page-key>` (pathname slug, `root` for `/`). Append a 6-char hash only if two targets would otherwise collide. Inspect existing components, tokens, research folders and asset namespaces; never overwrite another site's namespace. If a planned namespace already exists, stop and ask whether to update, rename, or skip.

**Screenshots.** Full-page at 1440px and 390px, saved to `docs/design-references/<site-key>/<page-key>/`. These are your master reference.

**Global extraction.** Fonts (every `<link>`, plus computed `font-family` on headings, body, code, labels — record every family, weight and style actually used). Colours across the page. Favicons and meta. Site-wide CSS or JS: custom scrollbars, page-level scroll-snap, global keyframes, backdrop filters, and **smooth-scroll libraries** — check for `.lenis`, `.locomotive-scroll`, or a custom scroll wrapper. Native scrolling feels visibly different and the user will spot it.

**Interaction sweep.** A dedicated pass, after screenshots and before anything else, because none of this is visible in a still.

- *Scroll:* descend the page slowly. Where does the header change, and at what scroll position? What animates into view, and how? Does a sidebar or tab indicator auto-switch? Any scroll-snap containers?
- *Click:* every button, tab, pill, link, card. For tab groups, click **each** one and record the content per state.
- *Hover:* every button, card, link, nav item, image — record the property change and the transition timing.
- *Responsive:* 1440 / 768 / 390. Note which sections change layout and at roughly which breakpoint.

**Motion inventory.** Motion hides in three places that computed styles never show: CSS keyframes and scroll timelines, JavaScript in framework islands and bundles (timers, GSAP/framer-motion timelines, springs, number and text effects, WebGL/canvas), and behaviour wired to events. Generate the checklist, then read the source of every scripted row:

```bash
python3 <skill-dir>/scripts/motion-inventory.py <url> --out docs/research/<site-key>/MOTION.md
```

It lists every `@keyframes` and where it is used, scroll/view timelines and `@property`, and every script the page loads with the motion it contains. Fetch and read each scripted component (`references/motion.md` says how): the numbers you need — durations, easings, stagger, intervals, spring stiffness, random ranges, which state follows which — are in the source. Add rows for anything you see moving that the tool cannot know. Every row starts `[ ]`.

Write findings to `docs/research/<site-key>/BEHAVIORS.md`. This is your behaviour bible; every spec references it.

**Topology.** Map every section top to bottom with a working name, its visual order, whether it is flow content or a fixed overlay, its z-index layer, and its interaction model. Assign each section a provisional tier. Write to `docs/research/<site-key>/TOPOLOGY.md`.

**Geometry.** After a slow scroll pass, record every section's `[top, height]` and the page's total height at the reference viewport width (script in `references/layout-diff.md`) and put it in the topology table. This table is the acceptance test for Phase 5 — without it you can only judge the clone by eye, and layout drift of 100+ px is invisible by eye. Also note section ids that change between loads (numeric suffixes) so nothing selects by them.

Phase 1 is done when `BEHAVIORS.md`, `TOPOLOGY.md` and `MOTION.md` exist, and every section in the topology carries a tier, an interaction model, and measured geometry.

**If the browser tooling blocks, filters or freezes**, see `references/blocked-tooling.md` before falling back to estimates.

## Phase 2 — Foundation

Sequential, and you do it yourself — it touches shared files. Follow `references/storybook-setup.md` for scaffolding and config.

1. **Tokens.** If Phase 0 found the site's own token block, **adopt it verbatim** — keep the site's variable names (in a Tailwind project, as the `@theme`, so the site's class strings like `bg-accent-100` work unchanged) and include the dark set if present. Otherwise write `src/tokens/<site-key>.ts` — colours, type scale, spacing, radii, shadows, easings — from the extracted computed values. Either way expose them as CSS custom properties and add a Storybook docs page rendering swatches and the type scale; prove the theme by rendering every colour with *only* utility classes and asserting the computed values match the source. This page is a deliverable. Note that a global reset (Tailwind preflight) changes computed values across the whole page (default `line-height`, borders, button font) — turn it on deliberately and diff the result (`layout-diff.md` §2).
2. **Fonts.** Load the real families. Register them in `.storybook/preview.ts` so every story renders in the right typeface.
3. **Assets.** Scroll the full page first — lazy-loaded images report `naturalWidth: 0` and may not exist in the DOM until they enter the viewport, so enumerating before a scroll pass silently undercounts. Then enumerate with the discovery script in `references/extraction-scripts.md` and download into `public/<site-key>/` with a uniquely-named script (`scripts/download-<site-key>-<page-key>.mjs`), batched 4 at a time with error handling. Derive filenames per that script's rule, never from the URL's last path segment — CDN transform URLs end in `f=auto,fit=scale-down,width=2560`, so a naive basename collides every transformed image onto one file. Confirm `staticDirs` in `.storybook/main.ts` serves the directory.
4. **Icons.** Extract inline SVGs as components under `atoms/icons/`, named by visual function (`SearchIcon`, `ArrowRightIcon`, `LogoIcon`). Deduplicate across the site.
5. **Types.** Namespaced interfaces for the content structures observed.

Delete the scaffold's own demo content (`src/stories/`) before writing anything. It ships stories that fail a strict typecheck and clutter the sidebar with a fake design system that is not the one you are extracting.

Foundation is done when `npm run storybook` boots, the tokens docs page renders, and a smoke story displays a downloaded asset in the correct font.

## Phase 3 — Spec and build, tier by tier

Work **atoms → molecules → organisms → templates → pages**. Tier order is the dependency order, so nothing is ever blocked on an unbuilt child, and shared atoms are built once rather than raced by parallel builders.

Within a tier, for each component:

**Extract.** Screenshot the component in isolation. Run the per-component extraction script from `references/extraction-scripts.md` against its selector — do not hand-measure properties. For every multi-state element, capture state A, trigger the change, capture state B, and record the diff explicitly: *property X goes VALUE_A → VALUE_B, triggered by TRIGGER, transition TRANSITION_CSS*. Pull verbatim text, alt text, aria labels, placeholders. Identify which downloaded assets and icon components it needs, checking for layered images.

**Spec.** Write `docs/research/<site-key>/specs/<Tier>-<Name>.spec.md` using the template in `references/spec-template.md`. Fill every section. Write "N/A" only after actually checking — even a footer has link hover states.

**Build.** If your harness supports parallel subagents, dispatch one per component within the tier, each receiving its spec inline. Otherwise build them yourself in the same order. Either way the component is not done until it has:
- The implementation at its tier path
- A colocated `.stories.tsx` with **one export per state in the spec**
- A `play` function asserting the interaction for any non-static component
- A passing typecheck

Run `npm run build-storybook` at the end of each tier before starting the next. Fix breakage immediately; never carry a red library into the next tier.

A tier is done when every component in it is green, every spec state has a story, `INVENTORY.md` lists every atom and molecule created, **and the tier audit passes**:

```bash
python3 <skill-dir>/scripts/audit-tiers.py src          # or the folder that contains your atoms/ molecules/ … dirs
```

It fails on (1) a component importing the same or a higher tier, (2) a component without a colocated story, (3) a story title whose section does not match its folder, and (4) a missing `storySort`. Run it after every tier and again before the report — components added later (a flyout, a text effect, a shared constant) are exactly where drift creeps in. Fix by reclassifying or moving code, not by loosening the check.

**Motion gate.** As you build each component, close its rows in `MOTION.md` with `[x] built <story or file>` — the story must actually show the motion (a play function that samples a computed style over time, or a story that runs it). Before Phase 5 run `python3 <skill-dir>/scripts/motion-inventory.py --check docs/research/<site-key>/MOTION.md`; it fails while any row is open or marked `[-] not cloned` without `APPROVED: <who>`. Never write "GAP: … is a still" in a spec or the report to close a row — build it, or ask the user.

## Phase 4 — Assembly

Build the template, then the page.

The **template** encodes the page-level layout from `TOPOLOGY.md` — scroll container, column structure, sticky positioning, z-index layering — with organisms as slots and placeholder content. It gets its own story so the skeleton is inspectable independently.

The **page** fills the template with real content and wires the page-level behaviours: scroll snap, scroll-driven animations, intersection observers, theme transitions between sections, and the smooth-scroll library if the original used one.

Assembly is done when the page story renders the full clone and `npm run build-storybook` passes.

## Phase 5 — Visual QA

Do not declare the clone complete at the end of Phase 4.

1. **Run the layout diff first** (`references/layout-diff.md` §1): section `[top, height]` and total page height on the clone versus the topology table. Fix the *first* non-zero height, re-measure, repeat. Heights must match exactly and tops within 1px before you move on to eyeballing. Do this at 1440px, then at 390px.
2. Put the original and the page story side by side at 1440px, then at 390px. Compare section by section, top to bottom — at full scale, not a reduced screenshot.
3. For each discrepancy: check the spec first. If the spec is wrong, re-extract, update the spec, then fix the component. If the spec is right and the build diverged, fix the build. Never patch a component without reconciling its spec — the spec is what the next run reads.
4. Exercise every interaction: scroll the whole page, click every tab, hover every interactive element, and use the **keyboard** (arrow keys through tabs, Tab order, Escape on overlays). Confirm scroll feel, header transitions, tab switching and entrance animations.
5. Watch the original and the clone run side by side for at least a minute per section and confirm every motion row: timings, loops, what triggers it, what it does on hover, focus and keyboard, and under reduced motion. Anything the inventory missed becomes a new row and gets built. Then run `motion-inventory.py --check` again.
6. Run `scripts/audit-tiers.py` one last time and open the Storybook sidebar: it should read Foundations, Atoms, Molecules, Organisms, Templates, Pages, in that order, with no other sections.
7. Run `npm run test-storybook` if the project has it configured. If the test browser is not installed, say so in the report instead of skipping silently.

**Refactoring later?** Any swap of implementation (hand CSS → utility classes, hand-rolled widgets → a headless primitive, adding a reset) needs a *snapshot → change → diff* pass with every difference classified as invisible, intended, or a bug (`layout-diff.md` §2). Capture every state, and confirm each baseline is real before trusting it.

## Pre-build checklist

Before writing code for any component, verify every box. If you cannot, go back and extract more.

- [ ] Spec file exists with every section filled
- [ ] Every CSS value came from `getComputedStyle()`, none estimated
- [ ] Tier is assigned and the component composes only lower tiers (`audit-tiers.py` passes; shared constants are in `data/`, not a sibling)
- [ ] `INVENTORY.md` **and** the `atoms/` and `molecules/` folders searched by structure for an existing piece that covers this; `Composes` lists what is reused, and a new component states why nothing fit
- [ ] Interaction model identified by scrolling *before* clicking
- [ ] The component's rows in `MOTION.md` are read from the source (script and CSS), each with trigger, timings, easing, loop/restart and reduced-motion behaviour in the spec's Motion section
- [ ] Every state's content and computed styles captured
- [ ] Scroll-driven: trigger threshold, before/after styles, and transition recorded
- [ ] Hover: before/after values and transition timing recorded
- [ ] All images identified, including overlays and layered compositions
- [ ] Responsive behaviour documented for desktop and mobile with the breakpoint
- [ ] Text is verbatim, not paraphrased
- [ ] Tokens/copy/data taken from the page's own source where it publishes them (Phase 0), not re-derived
- [ ] Any value that could not be extracted is marked ASSUMPTION in the spec
- [ ] Interactive widgets use the headless primitive the source uses (or its closest equivalent), with keyboard behaviour checked
- [ ] Spec is under ~150 lines; if not, drop a tier and split

## What not to do

Lessons from failed clones, each of which cost hours. The non-negotiables above cover the rest.

- **Don't build one monolithic commit.** The point of tier-by-tier progress is a verified-green library at every step.
- **Don't let an organism absorb its children.** Handing one agent "build the features section" produces approximated spacing and guessed font sizes. Handing it a single molecule with exact values produces an exact match.
- **Don't treat a new target as permission to replace existing work.** Preserve other sites' namespaces, tokens, and stories. Ask before touching an existing one.
- **Don't skip the story for a state you already built.** An unexported state is invisible to review and to the test runner, which is the same as not having extracted it.
- **Don't ship a still where the source moves.** "Static stand-in", "the toasts are a still", "hover preview not built" are unfinished work, not documented gaps. Motion the user has not approved dropping gets built.
- **Don't stop at CSS keyframes.** Most of what moves on a modern marketing site is driven by JavaScript: GSAP and framer-motion timelines, intervals, springs, number-roll and text-effect libraries, canvas/WebGL. `getComputedStyle` and the keyframes list show none of it. Read the component scripts.
- **Don't add a `ui/` tier or a `UI/…` sidebar section.** Styled Button/Tabs/Select/Dialog are atoms. A parallel primitives layer is how a Storybook ends up with a fifth section, primitives without stories, and molecules that "compose" them from the wrong side.
- **Don't add a component after the tiers are "done" without re-running the audit.** Later additions (menus, text effects, shared constants) are where molecules start importing molecules and a story quietly never gets written.
- **Don't put page-specific styling in a global stylesheet.** Scope it to the site's token namespace or the template, or it will bleed into every other site's stories.
- **Don't clone into a project whose theme you don't control.** Its tokens, resets and fonts will fight the clone's. Separate project first; port later is a full rewrite.
- **Don't judge fidelity by eye.** Section heights can be off by 100+ px and look fine. Diff geometry against the original with numbers.
- **Don't write your own global resets alongside a framework reset.** A `h1,p { margin: 0 }` rule out-ranked every utility margin on paragraphs and silently deleted spacing for the whole page. Rely on the one reset, and check specificity before adding another.
- **Don't trust a baseline you did not verify.** A snapshot taken right after a programmatic click can record the unchanged state. Compare state B to state A before using it.
- **Don't assume a framework's scale.** Sites redefine `text-sm`, spacing and radii; read the theme.
- **Don't stall on tooling.** If extraction is blocked or a tab freezes, switch to the source route (`source-recon.md`), record assumptions honestly, and continue — see `blocked-tooling.md`.
- **Don't hide state with `[hidden]` in a stacked layout.** A reset that forces `[hidden] { display: none !important }` breaks tab groups whose panels must share one grid cell so the tallest sets the height; hide with `visibility`/`opacity` and switch the attribute off.

## Report

- Source URL → story path for every page built
- Component count by tier, and reuse count (atoms shared across organisms)
- Spec files written, which must equal the component count
- Stories written, and total states covered
- Assets downloaded by type
- `build-storybook` result and `test-storybook` result (and, if the test browser was unavailable, that the `play` tests did not run)
- **Layout diff:** per-section `[top, height]` deltas versus the original and the total page-height delta
- Detected source stack and which values came from source versus the DOM
- Existing namespaces preserved, and any replacement the user approved
- **Assumptions** (values not extracted, with reasons) and **known gaps** (animated/WebGL pieces replaced by stand-ins, unbuilt states, unextracted breakpoints) and remaining visual discrepancies
