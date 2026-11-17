import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '@tailwindcss/node';
import { expect, it } from 'vitest';

const base = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
it.each([
  ["@import 'tailwindcss';", "@import './src/styles/index.css';"],
  ["@import 'tailwindcss';", "@import './src/styles/tokens.css' layer(base);", "@import './src/styles/semantic.css' layer(base);", "@import './src/styles/theme.css';", "@import './src/styles/compat.css';"],
])('publishes a hatch using existing theme variables through either CSS entry', async (...imports) => {
  const compiler = await compile(imports.join('\n'), { base, onDependency: () => {} });
  const css = compiler.build(['surface-hatched']).replace(/\s+/g, ' ');
  expect(css).toMatch(/\.surface-hatched \{[^}]*repeating-linear-gradient\(/);
  const utility = css.match(/\.surface-hatched \{([^}]+)\}/)?.[1] ?? '';
  expect(utility).toContain('rgb(var(--surface-sunken))');
  expect(utility).toContain('rgb(var(--border-subtle))');
  expect(utility).not.toMatch(/#[0-9a-f]{3,8}/i);
});
