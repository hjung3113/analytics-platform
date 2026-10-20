import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { generateThemeTokens } from '../../scripts/gen-theme-tokens.mjs';
import { THEME_COLOR_FALLBACK, THEME_COLOR_TOKENS } from './tokens.generated';
import { isThemeColorToken, readColorToken } from './index';

const tokensCss = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');
const platformCss = readFileSync(join(process.cwd(), 'src/styles/platform-tokens.css'), 'utf8');
const themeJson = readFileSync(join(process.cwd(), 'src/theme/theme-tokens.json'), 'utf8');
const themeTs = readFileSync(join(process.cwd(), 'src/theme/tokens.generated.ts'), 'utf8');
const manifest = JSON.parse(themeJson) as {
  color: Record<string, { $type: string; $value: { colorSpace: string; components: number[]; hex: string } }>;
};

function cssProperties(): Map<string, string> {
  const declarations = `${tokensCss}\n${platformCss}`.replace(/\/\*[\s\S]*?\*\//g, '');
  return new Map([...declarations.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]));
}

function resolveCssColor(name: string): [number, number, number] {
  const properties = cssProperties();
  let value = properties.get(name);
  const seen = new Set<string>();
  while (value) {
    const alias = /^var\(--([\w-]+)\)$/.exec(value);
    if (!alias) break;
    if (seen.has(alias[1])) throw new Error(`CSS alias cycle: ${name}`);
    seen.add(alias[1]);
    value = properties.get(alias[1]);
  }
  const triple = /^(\d+)\s+(\d+)\s+(\d+)$/.exec(value ?? '');
  if (!triple) throw new Error(`Not an RGB triple: ${name}`);
  return [Number(triple[1]), Number(triple[2]), Number(triple[3])];
}

function hex([red, green, blue]: [number, number, number]): string {
  return `#${[red, green, blue].map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
}

it('commits byte-for-byte generator output from the source CSS', () => {
  const generated = generateThemeTokens({ tokensCss, platformCss });
  expect(generated.json).toBe(themeJson);
  expect(generated.ts).toBe(themeTs);
});

it('fails closed when a new colour token has no classification', () => {
  const injectedCss = `${tokensCss}\n:root { --new-unclassified: 12 34 56; }`;
  expect(() => generateThemeTokens({ tokensCss: injectedCss, platformCss })).toThrow(/--new-unclassified/);
});

it('uses platform CSS when both source files declare the same token', () => {
  const generated = generateThemeTokens({
    tokensCss: ':root { --text-primary: 1 2 3; }',
    platformCss: ':root { --text-primary: 9 8 7; }',
  });
  const color = JSON.parse(generated.json).color['text-primary'];
  expect(color.$value.hex).toBe('#090807');
});

it('omits primitives and FeedbackOps domain roles from the public manifest', () => {
  const names = Object.keys(manifest.color);
  const excludedPrefixes = [
    'color-', 'status-reporter-', 'status-internal-', 'accent-voc', 'accent-task',
    'entity-icon-', 'managed-system-', 'confidence-',
  ];
  expect(names.some(name => excludedPrefixes.some(prefix => name.startsWith(prefix)))).toBe(false);
  expect(names).not.toContain('surface-field');
});

it('resolves every manifest hex from CSS and pins representative values', () => {
  for (const [name, entry] of Object.entries(manifest.color)) {
    expect(entry.$value.hex, name).toBe(hex(resolveCssColor(name)));
  }
  expect(manifest.color['text-primary'].$value.hex).toBe('#101828');
  expect(manifest.color['chart-blue-stroke'].$value.hex).toBe('#2577cc');
  expect(manifest.color['accent-primary'].$value.hex).toBe('#1428a0');
});

it('writes valid DTCG sRGB colour leaves', () => {
  for (const entry of Object.values(manifest.color)) {
    expect(entry.$type).toBe('color');
    expect(entry.$value.colorSpace).toBe('srgb');
    expect(entry.$value.components).toHaveLength(3);
    for (const component of entry.$value.components) {
      expect(component).toBeGreaterThanOrEqual(0);
      expect(component).toBeLessThanOrEqual(1);
    }
    expect(entry.$value.hex).toMatch(/^#[0-9a-f]{6}$/);
  }
});

it('reads an RGB triple from the requested element style', () => {
  const element = document.createElement('div');
  element.style.setProperty('--text-primary', '12 34 56');
  document.body.append(element);
  try {
    expect(readColorToken('text-primary', element)).toBe('rgb(12,34,56)');
  } finally {
    element.remove();
  }
});

it('uses the static fallback for an absent CSS variable and without window', () => {
  const root = document.documentElement;
  const previous = root.style.getPropertyValue('--text-primary');
  root.style.removeProperty('--text-primary');
  try {
    expect(readColorToken('text-primary')).toBe(THEME_COLOR_FALLBACK['text-primary']);
    expect(readColorToken('text-primary')).not.toBe('#000');

    vi.stubGlobal('window', undefined);
    expect(readColorToken('text-primary')).toBe(THEME_COLOR_FALLBACK['text-primary']);
  } finally {
    vi.unstubAllGlobals();
    if (previous) root.style.setProperty('--text-primary', previous);
  }
});

it('recognizes only exported theme colour names', () => {
  expect(isThemeColorToken(THEME_COLOR_TOKENS[0])).toBe(true);
  expect(isThemeColorToken('color-porcelain')).toBe(false);
});

const invalidReadColorToken = () => {
  // @ts-expect-error Raw palette primitives are not public theme colour tokens.
  readColorToken('color-porcelain');
};
void invalidReadColorToken;
