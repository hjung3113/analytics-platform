import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from '@tailwindcss/node';
import { expect, it } from 'vitest';
// Tailwind v4 migration of the FeedbackOps v3 preset: every ported token must yield a utility that still composes opacity.
const tokens = [...readFileSync('src/styles/tokens.css', 'utf8').matchAll(/^\s+--([a-z-]+): (\d+ \d+ \d+);/gm)].map(match => match[1]);
it('exposes every R G B triple token as an opacity-composable @theme color utility', async () => {
  expect(tokens.length).toBeGreaterThan(30);
  const compiler = await compile(readFileSync('src/style.css', 'utf8'), { base: resolve('src'), onDependency: () => {} });
  const css = compiler.build([...tokens.map(token => `bg-${token}`), 'bg-accent-primary/15', 'bg-surface-field', 'rounded-sm', 'rounded-lg']);
  for (const token of tokens) expect(css).toContain(`.bg-${token} {\n    background-color: rgb(var(--${token}));`);
  expect(css).toContain('color-mix(in oklab, rgb(var(--accent-primary)) 15%, transparent)');
  expect(css).toContain('--accent-primary: 37 99 235;');
  expect(css).toContain('background-color: transparent;');
  expect(css).toMatch(/\.rounded-sm \{\n\s+border-radius: 4px;/); expect(css).toMatch(/\.rounded-lg \{\n\s+border-radius: 8px;/);
});
