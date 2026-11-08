import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import { expect, it } from 'vitest';

it('code comment foreground clears 4.5:1 against the actual code surface token', () => {
  const props = new Map<string, string>();
  for (const file of ['tokens.css', 'theme.css']) {
    postcss.parse(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')).walkDecls(/^--/, decl => { props.set(decl.prop, decl.value); });
  }
  const css = postcss.parse(fs.readFileSync(path.resolve(__dirname, '../compat.css'), 'utf8'));
  let foreground = ''; let background = '';
  css.walkRules(rule => {
    if (rule.selector === '.hljs-comment') rule.walkDecls('color', decl => { foreground = decl.value; });
    if (rule.selector === 'pre') rule.walkAtRules('apply', at => {
      const token = at.params.split(/\s+/).find(value => value.startsWith('bg-'));
      if (token) background = `var(--color-${token.slice(3)})`;
    });
  });
  const resolve = (value: string): number[] => {
    const expanded = value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => {
      const token = props.get(name);
      if (!token) throw new Error(`Missing token ${name}`);
      return resolveValue(token);
    });
    return expanded.replace(/^rgb\(|\)$/g, '').trim().split(/\s+/).map(Number);
  };
  function resolveValue(value: string): string {
    return value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => resolveValue(props.get(name)!));
  }
  const luminance = (rgb: number[]) => rgb.reduce((sum, channel, index) => {
    const srgb = channel / 255;
    return sum + [0.2126, 0.7152, 0.0722][index]! * (srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4);
  }, 0);
  expect(foreground).not.toBe('');
  expect(background).not.toBe('');
  const a = luminance(resolve(foreground)); const b = luminance(resolve(background));
  expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
});
