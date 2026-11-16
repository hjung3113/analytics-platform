import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '@tailwindcss/node';
import { expect, it } from 'vitest';

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

it.each(Object.entries(recipes))('publishes thin scrollbars through the %s recipe', async (recipe, imports) => {
  const compiler = await compile(imports.join('\n'), { base, onDependency: () => {} });
  const css = compiler.build(['scrollbar-panel', 'shell-scroll']).replace(/\s+/g, ' ');
  expect(css).toMatch(/\.scrollbar-panel \{(?=[^}]*scrollbar-width: thin;)(?=[^}]*scrollbar-color: rgb\(var\(--border-strong\)\) transparent;)/);
  if (recipe === 'platform') {
    expect(css).toMatch(/\.shell-scroll \{(?=[^}]*scrollbar-width: thin;)(?=[^}]*scrollbar-color: rgb\(var\(--border-strong\)\) transparent;)/);
  }
});

it('contains pasted tables and wraps unbroken cell text in editor and reader CSS', async () => {
  const compiler = await compile(recipes.shared.join('\n'), { base, onDependency: () => {} });
  const css = compiler.build([]).replace(/\s+/g, ' ');
  expect(css).toMatch(/th, td \{[^}]*overflow-wrap: anywhere;/);
  expect(css).toMatch(/\.rich-editor\[data-surface="voc-description"\] \.ProseMirror \.tableWrapper, \.rich-content\[data-rich-extended\] \[data-rich-table-scroll\] \{[^}]*overflow-x: auto;/);
});

it('publishes the inset radius without changing the outer radius token', async () => {
  const compiler = await compile(recipes.shared.join('\n'), { base, onDependency: () => {} });
  const css = compiler.build(['rounded-inset-md']).replace(/\s+/g, ' ');
  expect(css).toContain('.rounded-inset-md { border-radius: calc(var(--radius-md) - 2px); }');
});
