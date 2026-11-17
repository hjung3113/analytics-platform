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
  const css = compiler.build(['elevation-panel', 'shadow-lg', 'shadow-none', 'on-canvas-band:bg-transparent']).replace(/\s+/g, ' ');
  expect(css).toMatch(/\.elevation-panel \{ --tw-shadow: var\(--shadow-sm\);/);
  // The nested guard outranks a plain caller shadow (:is keeps the ancestor's specificity).
  expect(css).toMatch(/:is\(\.bg-surface-card, \.bg-surface-detail, \.dv-groupview\) & \{ --tw-shadow: 0 0 #0000;/);
  // A caller's plain shadow utility comes later, so it still sets top-level elevation.
  expect(css.indexOf('.elevation-panel {')).toBeLessThan(css.indexOf('.shadow-lg {'));
  expect(css.indexOf('.elevation-panel {')).toBeLessThan(css.indexOf('.shadow-none {'));
  expect(css).toContain('.on-canvas-band\\:bg-transparent:where(.bg-surface-canvas:not([data-shell], .rich-editor) *) { background-color: transparent; }');
});
