---
name: clone-website
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

Story titles mirror the tree: `<Site>/Atoms/Button`, `<Site>/Organisms/SiteHeader`, `<Site>/Pages/Home`.

**Splitting rule.** A component that spans more than one tier must be split — an organism containing an unbuilt card is two units of work, not one. If a spec exceeds ~150 lines you have misclassified the tier; go down a level. This is mechanical. Do not override it with "but it's all related."

**Reuse rule.** Before creating any atom or molecule, check `INVENTORY.md` for an existing one on this site. A nav link and a footer link that compute to the same styles are one atom with two stories, not two atoms. This is what makes the output a design system rather than a pile of sections. Record every new atom and molecule in `INVENTORY.md` as you create it.

## Requirements

**Browser automation is mandatory.** You need a tool that can (a) execute JavaScript in the page context and return the result, and (b) capture screenshots at a set viewport. Chrome DevTools MCP, Playwright (MCP or library), Puppeteer, or Browserbase all qualify. If several are available prefer Chrome DevTools MCP. If none is available, ask the user which they have and how to connect it, then stop — this skill cannot run without it.

**A Storybook project.** If one exists, use it and match its conventions. If not, scaffold per `references/storybook-setup.md`.

Examples below use `npm`; substitute the project's package manager.

## Non-negotiables

These are the differences between a clone and a "close enough" mess.

1. **Extract, never estimate.** Every value in a spec comes from `getComputedStyle()`. "It looks like `text-lg`" is wrong when the computed value is `18px/24px` and `text-lg` is `18px/28px`. If a builder has to guess a colour, a font size, or a padding value, extraction failed.

2. **Identify the interaction model before building.** Scroll through a section slowly *before* clicking anything. If content changes on its own as you scroll, it is scroll-driven — find the mechanism (`IntersectionObserver`, `scroll-snap`, `position: sticky`, `animation-timeline`, scroll listener). Only if nothing moves on scroll do you click and hover to test. Building click-based tabs when the original is scroll-driven is the most expensive error available to you: it is a rewrite, not a CSS fix. Record the verdict in the spec as `INTERACTION MODEL: <static | click | scroll | hover | time>`.

3. **Every state, not just the default.** Click every tab and extract each one's content. Capture computed styles at scroll 0 *and* past the trigger, then diff them — the diff is the behaviour spec. Each state becomes a story export.

4. **Real content, real assets.** Pull actual text via `textContent`, download every image and video, inline every SVG as a component. A section that looks like one image is often layered — background gradient, foreground UI mockup, absolutely-positioned overlay icon. Enumerate *all* `<img>` and background images in a container's subtree; a missed overlay makes the clone look empty even when the background is right. Check for `<video>`, Lottie, or canvas before building an elaborate HTML mockup of what a video shows. Generate content only for genuinely per-session server data, or via the approved fallback in `references/generated-asset-fallback.md`.

5. **The spec file is the contract.** Every component gets a spec written *before* any code. Builders receive the spec contents inline in their prompt — never "go read the spec file", never "see TOKENS.md for colours". A builder should need zero external reads. The file persists as the artifact you audit when something looks wrong.

6. **Stay green.** Typecheck after every component; `npm run build-storybook` after every tier. A broken library is never acceptable, even temporarily.

## Phase 1 — Reconnaissance

Assign each target a readable `<site-key>` (origin slug) and `<page-key>` (pathname slug, `root` for `/`). Append a 6-char hash only if two targets would otherwise collide. Inspect existing components, tokens, research folders and asset namespaces; never overwrite another site's namespace. If a planned namespace already exists, stop and ask whether to update, rename, or skip.

**Screenshots.** Full-page at 1440px and 390px, saved to `docs/design-references/<site-key>/<page-key>/`. These are your master reference.

**Global extraction.** Fonts (every `<link>`, plus computed `font-family` on headings, body, code, labels — record every family, weight and style actually used). Colours across the page. Favicons and meta. Site-wide CSS or JS: custom scrollbars, page-level scroll-snap, global keyframes, backdrop filters, and **smooth-scroll libraries** — check for `.lenis`, `.locomotive-scroll`, or a custom scroll wrapper. Native scrolling feels visibly different and the user will spot it.

**Interaction sweep.** A dedicated pass, after screenshots and before anything else, because none of this is visible in a still.

- *Scroll:* descend the page slowly. Where does the header change, and at what scroll position? What animates into view, and how? Does a sidebar or tab indicator auto-switch? Any scroll-snap containers?
- *Click:* every button, tab, pill, link, card. For tab groups, click **each** one and record the content per state.
- *Hover:* every button, card, link, nav item, image — record the property change and the transition timing.
- *Responsive:* 1440 / 768 / 390. Note which sections change layout and at roughly which breakpoint.

Write findings to `docs/research/<site-key>/BEHAVIORS.md`. This is your behaviour bible; every spec references it.

**Topology.** Map every section top to bottom with a working name, its visual order, whether it is flow content or a fixed overlay, its z-index layer, and its interaction model. Assign each section a provisional tier. Write to `docs/research/<site-key>/TOPOLOGY.md`.

Phase 1 is done when `BEHAVIORS.md` and `TOPOLOGY.md` exist and every section in the topology carries a tier and an interaction model.

## Phase 2 — Foundation

Sequential, and you do it yourself — it touches shared files. Follow `references/storybook-setup.md` for scaffolding and config.

1. **Tokens.** Write `src/tokens/<site-key>.ts` — colours, type scale, spacing, radii, shadows, easings — from the extracted computed values. Expose them as CSS custom properties and add a Storybook docs page rendering swatches and the type scale. This page is a deliverable.
2. **Fonts.** Load the real families. Register them in `.storybook/preview.ts` so every story renders in the right typeface.
3. **Assets.** Enumerate with the discovery script in `references/extraction-scripts.md`, then download into `public/<site-key>/` with a uniquely-named script (`scripts/download-<site-key>-<page-key>.mjs`), batched 4 at a time with error handling. Never write a generic filename over another page's asset. Confirm `staticDirs` in `.storybook/main.ts` serves the directory.
4. **Icons.** Extract inline SVGs as components under `atoms/icons/`, named by visual function (`SearchIcon`, `ArrowRightIcon`, `LogoIcon`). Deduplicate across the site.
5. **Types.** Namespaced interfaces for the content structures observed.

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

A tier is done when every component in it is green, every spec state has a story, and `INVENTORY.md` lists every atom and molecule created.

## Phase 4 — Assembly

Build the template, then the page.

The **template** encodes the page-level layout from `TOPOLOGY.md` — scroll container, column structure, sticky positioning, z-index layering — with organisms as slots and placeholder content. It gets its own story so the skeleton is inspectable independently.

The **page** fills the template with real content and wires the page-level behaviours: scroll snap, scroll-driven animations, intersection observers, theme transitions between sections, and the smooth-scroll library if the original used one.

Assembly is done when the page story renders the full clone and `npm run build-storybook` passes.

## Phase 5 — Visual QA

Do not declare the clone complete at the end of Phase 4.

1. Put the original and the page story side by side at 1440px, then at 390px.
2. Compare section by section, top to bottom.
3. For each discrepancy: check the spec first. If the spec is wrong, re-extract, update the spec, then fix the component. If the spec is right and the build diverged, fix the build. Never patch a component without reconciling its spec — the spec is what the next run reads.
4. Exercise every interaction: scroll the whole page, click every tab, hover every interactive element. Confirm scroll feel, header transitions, tab switching and entrance animations.
5. Run `npm run test-storybook` if the project has it configured.

## Pre-build checklist

Before writing code for any component, verify every box. If you cannot, go back and extract more.

- [ ] Spec file exists with every section filled
- [ ] Every CSS value came from `getComputedStyle()`, none estimated
- [ ] Tier is assigned and the component composes only lower tiers
- [ ] `INVENTORY.md` checked for an existing atom or molecule that covers this
- [ ] Interaction model identified by scrolling *before* clicking
- [ ] Every state's content and computed styles captured
- [ ] Scroll-driven: trigger threshold, before/after styles, and transition recorded
- [ ] Hover: before/after values and transition timing recorded
- [ ] All images identified, including overlays and layered compositions
- [ ] Responsive behaviour documented for desktop and mobile with the breakpoint
- [ ] Text is verbatim, not paraphrased
- [ ] Spec is under ~150 lines; if not, drop a tier and split

## What not to do

Lessons from failed clones, each of which cost hours. The non-negotiables above cover the rest.

- **Don't build one monolithic commit.** The point of tier-by-tier progress is a verified-green library at every step.
- **Don't let an organism absorb its children.** Handing one agent "build the features section" produces approximated spacing and guessed font sizes. Handing it a single molecule with exact values produces an exact match.
- **Don't treat a new target as permission to replace existing work.** Preserve other sites' namespaces, tokens, and stories. Ask before touching an existing one.
- **Don't skip the story for a state you already built.** An unexported state is invisible to review and to the test runner, which is the same as not having extracted it.
- **Don't put page-specific styling in a global stylesheet.** Scope it to the site's token namespace or the template, or it will bleed into every other site's stories.

## Report

- Source URL → story path for every page built
- Component count by tier, and reuse count (atoms shared across organisms)
- Spec files written, which must equal the component count
- Stories written, and total states covered
- Assets downloaded by type
- `build-storybook` result and `test-storybook` result
- Existing namespaces preserved, and any replacement the user approved
- Known gaps and remaining visual discrepancies
