# skills

Agent Skills for coding agents, in the portable [`SKILL.md`](https://skills.sh) format. Works with Claude Code, Cursor, Codex, Copilot, Windsurf, Cline, OpenCode and the other agents the `skills` CLI targets.

## Install

```bash
npx skills add douglasswm/skills
```

Or a single skill, globally:

```bash
npx skills add douglasswm/skills --skill clone-website --global
```

Try one without installing:

```bash
npx skills use douglasswm/skills@clone-website
```

## Skills

### `clone-website`

Reverse-engineers a live website into a **Storybook** component library organised by **atomic design**.

It walks the page as a foreman: extracts computed CSS, assets, verbatim content and behaviour section by section, writes a spec file per component, then builds atoms → molecules → organisms → templates → pages. Every state it extracts — hover, scrolled, each tab, each breakpoint — becomes a named story export, so a state that is not selectable in the Storybook sidebar is a state that was not extracted.

**Requires** a browser automation tool that can execute JavaScript in the page and take screenshots: Chrome DevTools MCP, Playwright, Puppeteer, or Browserbase.

```
/clone-website https://example.com
```

| | |
|---|---|
| Output | Storybook library + auditable specs, not a one-off page |
| Structure | Atomic design tiers, deduplicated via a component inventory |
| Verification | `build-storybook` green per tier, `play` functions per interaction, side-by-side visual QA |

## Licence

MIT
