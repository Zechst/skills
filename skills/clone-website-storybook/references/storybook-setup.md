# Storybook setup

If the project already has Storybook, match its conventions instead of imposing these — read `.storybook/main.ts` first and adapt.

## Scaffold

```bash
npm create storybook@latest
```

Renderer choice: match the host project. Greenfield with no framework, choose React + Vite. If a Next.js app already exists, choose the Next.js framework so the clone can later mount into a route. Angular, Vue, Svelte, Lit and Web Components are equally valid targets — the tier structure below is renderer-agnostic; only the story syntax changes.

Import types from the framework package the scaffold generated (`@storybook/react-vite`, `@storybook/nextjs`, `@storybook/vue3-vite`, …), not from a guessed package name.

## After scaffolding

Two things the generator leaves behind:

- **Delete `src/stories/`** once you have confirmed it holds only the generator's files. The scaffold ships a demo Button/Header/Page design system. It clutters the sidebar with components you are not cloning, and its files fail a strict `tsc --noEmit` with `TS6133`, so an agent inherits a red typecheck it did not cause.
- **Do not re-add the default addons.** Current scaffolds already install the a11y, vitest and docs addons. Read `main.ts` and add only what is genuinely missing.

## `.storybook/main.ts`

Edit the generated file rather than replacing it — the generator writes `framework` as a bare string, which is valid, and rewriting it to the object form gains nothing. The one change usually needed is `staticDirs`:

```ts
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [/* keep the generated list */],
  staticDirs: ['../public'],
  framework: '@storybook/react-vite',
};

export default config;
```

`staticDirs` is what makes downloaded assets resolvable. With `['../public']`, a file at `public/<site-key>/images/hero.webp` is referenced from a story as `/<site-key>/images/hero.webp`. Verify one asset renders before building anything that depends on many.

## `.storybook/preview.tsx`

The generator writes `preview.tsx`, not `preview.ts` — edit the file that exists rather than creating a second one beside it.

**Fix the sidebar order.** Storybook sorts alphabetically, which puts `Pages` before `Templates` and can wedge `Foundations` between `Atoms` and `Molecules`. Set an explicit order, smallest to largest. There is no site root section: one repo and one Storybook per site, so titles start at the tier.

```tsx
parameters: {
  options: {
    storySort: {
      order: ['Foundations', 'Atoms', 'Molecules', 'Organisms', 'Templates', 'Pages'],
    },
  },
},
```

Anything not listed sorts after the listed sections. `<skill-dir>/scripts/audit-tiers.py` fails if `storySort` is missing, and flags any story whose section is not one of the tiers (for example a `UI/…` section for primitives — those are atoms).

The rest of the file has three jobs: load the extracted fonts, load the token custom properties, and register the capture viewports. Add a background matching the site's page colour, or every dark-site story renders on white.

```tsx
import type { Preview } from '@storybook/react-vite';
import './fonts.css';
import '../src/tokens/<site-key>.css';

const preview: Preview = {
  parameters: {
    viewport: {
      options: {
        desktop: { name: 'Desktop', styles: { width: '1440px', height: '900px' } },
        tablet:  { name: 'Tablet',  styles: { width: '768px',  height: '1024px' } },
        mobile:  { name: 'Mobile',  styles: { width: '390px',  height: '844px' } },
      },
    },
    backgrounds: { options: { site: { name: 'Site', value: 'rgb(8, 9, 10)' } } },
  },
  initialGlobals: {
    viewport: { value: 'desktop', isRotated: false },
    backgrounds: { value: 'site' },
  },
};

export default preview;
```

The three widths are the ones the extraction sweep uses. Keeping them identical is what lets you diff a story against a reference screenshot without rescaling.

## Story format

CSF 3. One file per component, colocated. Title mirrors the tier path.

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SiteHeader } from './SiteHeader';

const meta = {
  title: 'Acme/Organisms/SiteHeader',
  component: SiteHeader,
} satisfies Meta<typeof SiteHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { variant: 'top' } };

export const Scrolled: Story = {
  args: { variant: 'floating' },
  parameters: { docs: { description: { story: 'Past 50px scroll: maxWidth 1200px, radius 16px, shadow appears.' } } },
};

export const Mobile: Story = {
  args: { variant: 'top' },
  globals: { viewport: { value: 'mobile', isRotated: false } },
};
```

**One state, one story.** Each state recorded in the spec gets an export. Name it after the state, not the tier — `Scrolled`, `TabProductivity`, `Hovered`, `Mobile`.

Prefer driving a state through props over faking it in a decorator. A scroll-driven header should take a `variant` prop so both states are directly selectable, with the real scroll listener living in the template or page that owns it. That is what makes the state reviewable in isolation.

## Interaction tests

Any component whose spec is not `INTERACTION MODEL: static` gets a `play` function asserting the behaviour.

```tsx
import { expect } from 'storybook/test';

export const TabSwitching: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('tab', { name: 'Productivity' }));
    await expect(canvas.getByText('Focus mode')).toBeInTheDocument();
  },
};
```

Scroll-driven components are asserted at the prop level (render both variants and check the computed difference), not by simulating scroll — the trigger belongs to the owning template, and that is where the observer is tested.

## Scripts

```json
{
  "storybook": "storybook dev -p 6006",
  "build-storybook": "storybook build",
  "test-storybook": "vitest --project=storybook"
}
```

`build-storybook` is the green gate run at the end of every tier. `test-storybook` runs every `play` function plus the a11y checks; wire it if `@storybook/addon-vitest` is installed.

## Tokens docs page

Tokens are a deliverable, not an implementation detail. Add `src/tokens/<site-key>.mdx` rendering colour swatches with their hex values and token names, the full type scale at real sizes, the spacing ramp, radii and shadows. This is the page a human opens to check the extraction was faithful before reviewing a single component.
