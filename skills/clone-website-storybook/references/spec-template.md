# Component spec template

One file per component at `docs/research/<site-key>/specs/<Tier>-<Name>.spec.md`, written **before** any code. The builder receives these contents inline and must need no other reading.

Fill every heading. Write "N/A" only after checking — a footer still has link hover states.

```markdown
# <ComponentName>

## Placement
- **Tier:** atom | molecule | organism | template | page
- **Implementation:** `src/components/<site-key>/<tier>/<Name>/<Name>.tsx`
- **Stories:** `src/components/<site-key>/<tier>/<Name>/<Name>.stories.tsx`
- **Story title:** `<Site>/<Tier>/<Name>`
- **Composes:** <existing lower-tier atoms/molecules reused, or "none"; if this is a new atom/molecule, one line on why no existing one fits>
- **Reused by:** <which organisms/pages consume it — fill in as you discover them>
- **Reference screenshot:** `docs/design-references/<site-key>/<page-key>/<name>.png`

## Interaction model
`static | click | scroll | hover | time`

<One line on the mechanism: "IntersectionObserver, rootMargin -30% 0px" or "click switches panel with 200ms opacity crossfade".>

## Props
| Prop | Type | Purpose |
|---|---|---|
| variant | 'top' \| 'floating' | Selects the scroll state so both are directly renderable |

State that the original derives at runtime becomes a prop here, so every state is selectable in isolation. The real trigger lives in the owning template or page.

## DOM structure
<Element hierarchy — what contains what, with the tag and role of each node.>

## Computed styles

### Container
- display: ...
- padding: ...
- maxWidth: ...

### <Child 1>
- fontSize: ...
- color: ...

### <Child N>
...

Every value from `getComputedStyle()`. No estimates, no Tailwind class guesses.

## States

One subsection per state. Each becomes a story export named after the state.

### <StateName> → story export `<StateName>`
- **Trigger:** <scroll past 50px | click .tab-button[data-id=x] | hover | 4s interval>
- **Before:** maxWidth: 100vw, boxShadow: none, borderRadius: 0
- **After:** maxWidth: 1200px, boxShadow: 0 4px 20px rgba(0,0,0,0.1), borderRadius: 16px
- **Transition:** all 0.3s cubic-bezier(0.4, 0, 0.2, 1)
- **Implementation:** <CSS transition + prop | IntersectionObserver in parent | animation-timeline>
- **Play assertion:** <what the play function should assert, or "N/A — static">

## Per-state content
Only for stateful components. One block per state, with the full content set.

### State: Featured
- Title: "..."
- Cards: [{ title, description, image, href }, ...]

## Assets
- `/<site-key>/images/<file>.webp` — background layer
- `/<site-key>/images/<file>.png` — foreground overlay
- Icons: `<ArrowRightIcon>`, `<SearchIcon>` from `atoms/icons`

Paths are as referenced from a story through `staticDirs`, not filesystem paths.

## Text content (verbatim)
<Copy-pasted from the live site. Not paraphrased.>

## Responsive
- **Desktop 1440px:** <layout>
- **Tablet 768px:** <what changes>
- **Mobile 390px:** <what changes>
- **Breakpoint:** switches at ~<N>px
- **Story coverage:** which widths need their own story export

## Source and layout
- **Values from:** <page source (token block / class strings / props) | DOM (getComputedStyle) | both>
- **Measured geometry:** <section or element `[top, height]` on the original at the reference width, from `layout-diff.md`>

## Assumptions and known gaps
Anything not extracted, one line each with the reason — never state a guess as a fact.
- ASSUMPTION: <e.g. header switches at scrollY 600 — measuring froze the tab; only known: absent at 0, present at 900>
- GAP: <e.g. WebGL globe replaced by a static stand-in; animated toasts are a still>
```

## Worked fragment

For a scroll-driven header, the states section reads:

```markdown
## Interaction model
`scroll` — window scroll listener on the page; header receives `variant` as a prop.

## States

### Top → story export `Default`
- **Trigger:** scrollY < 50
- **Before/After:** N/A — this is the initial state
- **Styles:** maxWidth: 100vw, borderRadius: 0px, boxShadow: none, background: rgb(255,255,255)

### Floating → story export `Scrolled`
- **Trigger:** scrollY >= 50
- **Before:** maxWidth: 100vw, borderRadius: 0px, boxShadow: none
- **After:** maxWidth: 1200px, borderRadius: 16px, boxShadow: 0 4px 20px rgba(0,0,0,0.1)
- **Transition:** all 0.3s cubic-bezier(0.4, 0, 0.2, 1)
- **Implementation:** `variant` prop drives a class; the page owns the scroll listener
- **Play assertion:** render with variant="floating", expect computed borderRadius 16px

### Mobile → story export `Mobile`
- **Trigger:** viewport <= 768px
- **After:** nav links collapse to a hamburger, logo shrinks to 32px
```

Three states, three exports, and a reviewer can select each one from the sidebar without touching the page.
