# Finding and cloning motion

`getComputedStyle`, screenshots and the keyframes list see only a fraction of what moves on a modern site. Use this order.

## 1. Generate the inventory
`python3 scripts/motion-inventory.py <url> --out docs/research/<site-key>/MOTION.md` lists CSS keyframes (with the rules that use them), scroll/view timelines, `@property`, and every script the page loads with the motion signatures inside it. Treat the list as a minimum. Add rows for anything you see moving that it lacks.

## 2. Read each scripted component
Framework islands and bundles carry the numbers you need.

- **Astro:** each `<astro-island component-url="/_astro/x.js" component-export="Name" props="…">`. Fetch the script, and decode `props` (Astro serialises values as `[0, value]` and arrays as `[1, [...]]`).
- **Next/Vite/others:** the page's `<script src>` and `modulepreload` list; bundles are minified but the strings survive.
- Fetch with `curl -sL` and search for: `setInterval`/`setTimeout` (cycles), `duration`, `ease`, `stagger`, `delay`, `stiffness`/`damping` (springs), `initial:`/`animate:`/`exit:` (framer-motion), `power2.out`/`.timeline(` (GSAP), `.animate(` (WAAPI), `IntersectionObserver`, `addEventListener('scroll'…)`, `dispatchEvent`/`CustomEvent` (components talking to each other), `Math.random` (randomised timings: record the ranges and draw them once per mount).
- Timing tokens are often imported from a small module (`{FAST:.2, NORMAL:.4}`): fetch that file too.
- Libraries ship their own curves (number-roll, text-scramble, springs). Copy the curve; do not approximate it.
- **Coupled components:** note events one component dispatches and another listens to (a rotating subtitle switching a counter). Clone the coupling, not just each part.

## 3. Reproduce with the same mechanism, at the smallest tier that fits
Timelines and loops become atoms (a `Drifter`, a `RollingNumber`, a `CrossfadeText`); a molecule composes them with the card or pill; the organism supplies content and timing data. Prefer the Web Animations API or CSS to adding the source's animation library, unless the library's own maths matters (spring solvers). Write the source's constants down in the spec's Motion section.

## 4. Prove it moves
A still screenshot proves nothing. A story's `play` function should sample a computed style over time (opacity, transform, `--custom-property`) or wait for the state change the motion produces. To eyeball it, note that a backgrounded automation tab does not run animation frames: take a screenshot between samples to force them, and never `await` a `requestAnimationFrame` loop in the page (it never resolves).

## 5. Reduced motion
Read what the source does under `prefers-reduced-motion` and match it; when the source ignores it, the clone should still rest in a sensible state rather than animate.
