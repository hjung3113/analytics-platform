import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '@tailwindcss/node';
import { expect, it } from 'vitest';

it('ships sticky fallback and contextual block space through the documented SDK stylesheet recipe', async () => {
  const compiler = await compile([
    "@import 'tailwindcss';",
    "@import './src/styles/tokens.css' layer(base);",
    "@import './src/styles/semantic.css' layer(base);",
    "@import './src/styles/theme.css';",
    "@import './src/styles/compat.css';",
  ].join('\n'), { base: resolve(dirname(fileURLToPath(import.meta.url)), '../../..'), onDependency: () => {} });
  const css = compiler.build(['sticky', 'top-(--rich-editor-toolbar-offset,0px)', 'top-(--rich-context-top)', 'left-(--rich-context-left)']).replace(/\s+/g, ' ');
  expect(css).toContain('top: var(--rich-editor-toolbar-offset,0px)');
  expect(css).toContain('top: var(--rich-context-top)');
  expect(css).toContain('left: var(--rich-context-left)');
  expect(css).toContain('.rich-editor .ProseMirror[contenteditable="true"] .tableWrapper');
  expect(css).toContain('padding-block-start: calc(var(--spacing) * 10)');
  expect(css).toContain('padding-inline-start: calc(var(--spacing) * 9)');
});
