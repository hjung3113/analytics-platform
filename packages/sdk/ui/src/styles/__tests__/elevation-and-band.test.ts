import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '@tailwindcss/node';
import { expect, it } from 'vitest';

// v0.41 review-quality Q1/Q2 and review C1: one card-elevation utility and one canvas-band variant, in both CSS recipes.
const base = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const recipes = {
  platform: ["@import 'tailwindcss';", "@import './src/styles/index.css';"],
  shared: [
    "@import 'tailwindcss';",
    "@import './src/styles/tokens.css' layer(base);",
    "@import './src/styles/semantic.css' layer(base);",
    "@import './src/styles/theme.css';",
    "@import './src/styles/compat.css';",
  ],
};

it.each(Object.entries(recipes))('publishes elevation-panel and on-canvas-band through the %s recipe', async (_recipe, imports) => {
  const compiler = await compile(imports.join('\n'), { base, onDependency: () => {} });
  const css = compiler.build(['elevation-panel', 'elevation-flat', 'shadow-lg', 'shadow-none', 'on-canvas-band:bg-transparent']).replace(/\s+/g, ' ');
  expect(css).toMatch(/\.elevation-panel \{ --tw-shadow: var\(--shadow-sm\);/);
  // The nested guard outranks a plain caller shadow (:is keeps the ancestor's specificity).
  expect(css).toMatch(/:is\(\.bg-surface-card, \.bg-surface-detail, \.dv-groupview\) & \{ --tw-shadow: 0 0 #0000;/);
  // A caller's plain shadow utility comes later, so it still sets top-level elevation.
  expect(css.indexOf('.elevation-panel {')).toBeLessThan(css.indexOf('.shadow-lg {'));
  expect(css.indexOf('.elevation-panel {')).toBeLessThan(css.indexOf('.shadow-none {'));
  // elevation-flat is the guard alone: no default shadow, same nested reset.
  expect(css).toMatch(/:is\(\.bg-surface-card, \.bg-surface-detail, \.dv-groupview\) \.elevation-flat \{ --tw-shadow: 0 0 #0000;/);
  expect(css).not.toMatch(/[};] \.elevation-flat \{/);
  expect(css).toContain('.on-canvas-band\\:bg-transparent:where([data-canvas-band] *) { background-color: transparent; }');
});

// #2482 (v0.41 review-quality Q6): one row-meta rule for list rows' small meta text, in both CSS recipes.
it.each(Object.entries(recipes))('publishes row-meta through the %s recipe', async (_recipe, imports) => {
  const compiler = await compile(imports.join('\n'), { base, onDependency: () => {} });
  const css = compiler.build(['row-meta']).replace(/\s+/g, ' ');
  // The colour comes from the nearest row's inherited property, so an outer row's hover or selection never reaches a
  // nested row's meta text (no descendant selector from a row to .row-meta).
  expect(css).toMatch(/\.row-meta \{ color: var\(--row-meta-color, var\(--color-text-muted\)\); \}/);
  expect(css).toMatch(/\[data-list-row\] \{ --row-meta-color: var\(--color-text-muted\); \}/);
  expect(css).toMatch(/\[data-list-row\]:hover, \[data-list-row\]\[data-selected\] \{ --row-meta-color: var\(--color-text-secondary\); \}/);
  expect(css).not.toMatch(/\[data-list-row\][^{]*\.row-meta/);
});
