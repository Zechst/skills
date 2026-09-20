# When the browser tooling fights back

Browser-automation tools sometimes filter, truncate, throttle or freeze. That is not a reason to start estimating values. Work through this list in order; stop and ask the user after two or three failed attempts at the *same* approach.

## Output is blocked or filtered

Symptom: the result is replaced by a message such as `[BLOCKED: Cookie/query string data]` even though your script returned only styles or text.

- Some tools scan return values for cookie-like or query-string-like patterns. The trigger is not always obvious: large style dumps and `key=value` strings can fire it where `JSON.stringify(...)` of small arrays does not.
- Return **`JSON.stringify` of compact arrays or objects**, not templated `key=value` strings.
- Strip URLs down to their path (`u.split('?')[0]`) or return only a hostname/extension.
- Return **numbers and short labels** first (`[tag, width, height, fontSize]`), and expand only what you need.
- Query one property on one element to find where the filter sits, then widen.
- Do **not** encode, obfuscate or split output to slip past a filter. If narrowing legitimately does not work, use the source route instead.

## The source route (always available)

If the DOM route is blocked, most values are still readable without the browser: HTML, compiled CSS, token blocks, framework props and sprites — see `source-recon.md`. You lose `getComputedStyle()` at a viewport and live state, so verify layout with small numeric queries or screenshots, and record in the spec which values came from source rather than the DOM.

## Freezes and timeouts

Symptom: `Runtime.evaluate timed out`, or a tab that stops responding after a long-running script (many `scrollTo` calls with waits, or a polling loop).

- Keep scripts short. Split a long scroll-and-measure loop into several calls of a few steps each.
- Do not retry the same heavy script. Reload the tab, then run a lighter version.
- Non-essential measurements (an exact scroll threshold) can be recorded as an **assumption** in the spec instead of blocking the run. Mark it clearly so it is not mistaken for an extracted value.

## Tab/session problems

- If a call fails with "couldn't determine which page this action targets", re-read the tab context and use the fresh tab id.
- Closing the tab that anchors the automation group can drop the group; recreate it rather than reusing stale ids.
- Use a tab you created for the session; do not reuse another session's ids.

## Hidden tab

A tab that is not visible does not run animation frames. See `layout-diff.md` §4 — force a frame with a screenshot before measuring anything transition- or observer-driven.
