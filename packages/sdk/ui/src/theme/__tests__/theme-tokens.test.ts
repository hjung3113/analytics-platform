import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { generateThemeTokens } from '../../../scripts/gen-theme-tokens.mjs';
import { THEME_COLOR_FALLBACK, THEME_COLOR_TOKENS, type ThemeColorToken } from '../tokens.generated';
import { isThemeColorToken, readColorToken } from '../index';

const tokensCss = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');
const platformCss = readFileSync(join(process.cwd(), 'src/styles/platform-tokens.css'), 'utf8');
const sharedThemeCss = readFileSync(join(process.cwd(), 'src/styles/theme.css'), 'utf8');
const themeCss = readFileSync(join(process.cwd(), 'src/styles/index.css'), 'utf8');
const themeJson = readFileSync(join(process.cwd(), 'src/theme/theme-tokens.json'), 'utf8');
const themeTs = readFileSync(join(process.cwd(), 'src/theme/tokens.generated.ts'), 'utf8');
const manifest = JSON.parse(themeJson) as {
  color: Record<string, { $type: string; $value: { colorSpace: string; components: number[]; hex: string } }>;
};

const newChartTokens = [
  'chart-series-1', 'chart-series-1-stroke', 'chart-series-2', 'chart-series-2-stroke',
  'chart-series-3', 'chart-series-3-stroke', 'chart-series-4', 'chart-series-4-stroke',
  'chart-series-5', 'chart-series-5-stroke',
  'chart-heat-seq-0', 'chart-heat-seq-1', 'chart-heat-seq-2', 'chart-heat-seq-3', 'chart-heat-seq-4',
  'chart-heat-div-0', 'chart-heat-div-1', 'chart-heat-div-2', 'chart-heat-div-3', 'chart-heat-div-4',
  'chart-status-good', 'chart-status-warn', 'chart-status-critical',
  'chart-no-data', 'chart-no-data-pattern', 'chart-selection-outline', 'chart-median-on-fill',
] as const;

const classChartTokens = [
  'chart-series-1', 'chart-series-2', 'chart-series-3', 'chart-series-4', 'chart-series-5', 'chart-no-data',
  'chart-status-good', 'chart-status-warn', 'chart-status-critical',
] as const;

const chartStatusAliases = [
  ['chart-status-good', 'accent-success'],
  ['chart-status-warn', 'accent-warn'],
  ['chart-status-critical', 'accent-danger'],
] as const;

function cssProperties(): Map<string, string> {
  const declarations = `${tokensCss}\n${platformCss}`.replace(/\/\*[\s\S]*?\*\//g, '');
  return new Map([...declarations.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].flatMap(([, name, value]) => (name && value ? [[name, value.trim()] as const] : [])));
}

function resolveCssColor(name: string): [number, number, number] {
  const properties = cssProperties();
  let value = properties.get(name);
  const seen = new Set<string>();
  while (value) {
    const target = /^var\(--([\w-]+)\)$/.exec(value)?.[1];
    if (!target) break;
    if (seen.has(target)) throw new Error(`CSS alias cycle: ${name}`);
    seen.add(target);
    value = properties.get(target);
  }
  const triple = /^(\d+)\s+(\d+)\s+(\d+)$/.exec(value ?? '');
  const [, red, green, blue] = triple ?? [];
  if (!red || !green || !blue) throw new Error(`Not an RGB triple: ${name}`);
  return [Number(red), Number(green), Number(blue)];
}

function hex([red, green, blue]: [number, number, number]): string {
  return `#${[red, green, blue].map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
}

function relativeLuminance([red, green, blue]: [number, number, number]): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const [lighter = 0, darker = 0] = [relativeLuminance(a), relativeLuminance(b)].sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
}

it('no longer accepts the removed chart-purple token (#2796)', () => {
  // @ts-expect-error chart-purple was removed in sdk-v0.48.0; use chart-series-3.
  const removed: ThemeColorToken = 'chart-purple';
  expect(THEME_COLOR_TOKENS).not.toContain(removed);
  expect(THEME_COLOR_TOKENS).not.toContain('chart-purple-stroke');
  expect(isThemeColorToken('chart-purple')).toBe(false);
});

it('publishes text-link as an alias of the primary accent', () => {
  expect(tokensCss).toContain('--text-link: var(--accent-primary);');
  expect(sharedThemeCss).toContain('--color-text-link: rgb(var(--text-link));');
  expect(THEME_COLOR_FALLBACK).toMatchObject({ 'text-link': THEME_COLOR_FALLBACK['accent-primary'] });
});

it('commits byte-for-byte generator output from the source CSS', () => {
  const generated = generateThemeTokens({ tokensCss, platformCss });
  expect(generated.json).toBe(themeJson);
  expect(generated.ts).toBe(themeTs);
});

it('fails closed when a new colour token has no classification', () => {
  const injectedCss = `${tokensCss}\n:root { --new-unclassified: 12 34 56; }`;
  expect(() => generateThemeTokens({ tokensCss: injectedCss, platformCss })).toThrow(/--new-unclassified/);
});

it.each([
  ['transparent', 'transparent'],
  ['rgb with alpha', 'rgb(0 0 0 / .4)'],
  ['rgba', 'rgba(0, 0, 0, 0.4)'],
  ['hex', '#123456'],
  ['hex with alpha', '#1234'],
  ['named colour', 'rebeccapurple'],
  ['hsl', 'hsl(0 0% 0% / .4)'],
  ['oklch', 'oklch(0 0 0 / .4)'],
  ['var fallback', 'var(--missing-overlay, #000)'],
])('fails closed for an unclassified colour value: %s', (_label, value) => {
  const injectedCss = `${tokensCss}\n:root { --new-overlay: ${value}; }`;
  expect(() => generateThemeTokens({ tokensCss: injectedCss, platformCss })).toThrow(/--new-overlay/);
});

it('fails closed when a colour alias resolves to a non-RGB colour value', () => {
  const injectedCss = `${tokensCss}\n:root { --new-overlay: var(--overlay-value); --overlay-value: rgb(0 0 0 / .4); }`;
  expect(() => generateThemeTokens({ tokensCss: injectedCss, platformCss })).toThrow(/--new-overlay/);
});

it('matches exact exclusions without excluding a same-prefix published role', () => {
  const names = Object.keys(JSON.parse(generateThemeTokens({ tokensCss, platformCss }).json).color);
  expect(names).not.toContain('surface-field');
  expect(names).toContain('surface-field-filled');
});

it('ignores non-colour composite values such as shadows', () => {
  const injectedCss = `${tokensCss}\n:root { --new-shadow: rgba(0, 0, 0, .4) 0px 2px 4px; --new-font: 12px sans-serif; }`;
  expect(() => generateThemeTokens({ tokensCss: injectedCss, platformCss })).not.toThrow();
});

it('uses platform CSS when both source files declare the same token', () => {
  const generated = generateThemeTokens({
    tokensCss: ':root { --text-primary: 1 2 3; }',
    platformCss: ':root { --text-primary: 9 8 7; }',
  });
  const color = JSON.parse(generated.json).color['text-primary'];
  expect(color.$value.hex).toBe('#090807');
});

it('omits primitives and feature domain roles from the public manifest', () => {
  const names = Object.keys(manifest.color);
  const excludedPrefixes = [
    'color-', 'status-reporter-', 'status-internal-', 'entity-icon-', 'managed-system-', 'confidence-',
  ];
  expect(names.some(name => excludedPrefixes.some(prefix => name.startsWith(prefix)))).toBe(false);
  expect(names).not.toContain('accent-voc');
  expect(names).not.toContain('accent-task');
  expect(names).not.toContain('surface-field');
});

it('resolves every manifest hex from CSS and pins representative values', () => {
  for (const [name, entry] of Object.entries(manifest.color)) {
    expect(entry.$value.hex, name).toBe(hex(resolveCssColor(name)));
  }
  expect(manifest.color['text-primary']?.$value.hex).toBe('#101828');
  expect(manifest.color['chart-blue-stroke']?.$value.hex).toBe('#2e6bd9');
  expect(manifest.color['accent-primary']?.$value.hex).toBe('#1428a0');
});

it('publishes and resolves every adopted chart colour token', () => {
  for (const name of newChartTokens) {
    expect(THEME_COLOR_TOKENS, name).toContain(name);
    expect(manifest.color[name], name).toBeDefined();
    expect(readColorToken(name as ThemeColorToken), name).toBe(`rgb(${resolveCssColor(name).join(',')})`);
  }
});

it('keeps every categorical stroke token at least 3:1 against the card surface', () => {
  const card = resolveCssColor('surface-card');
  for (const name of newChartTokens.filter(token => token.endsWith('-stroke'))) {
    expect(contrastRatio(resolveCssColor(name), card), name).toBeGreaterThanOrEqual(3);
  }
});

it.each(['chart-series-5', 'chart-series-5-stroke'] as const)('uses the existing chart green for %s', name => {
  expect(resolveCssColor(name)).toEqual(resolveCssColor('chart-green'));
});

it('aliases chart status roles to their semantic accent tokens', () => {
  const properties = cssProperties();
  for (const [chartStatus, accent] of chartStatusAliases) {
    expect(properties.get(chartStatus)).toBe(`var(--${accent})`);
    expect(resolveCssColor(chartStatus)).toEqual(resolveCssColor(accent));
  }
});

it('adds Tailwind aliases only for the chart roles consumed as classes', () => {
  for (const name of classChartTokens) {
    expect(themeCss).toContain(`--color-${name}: rgb(var(--${name}));`);
  }
  expect(themeCss).not.toContain('--color-chart-series-1-stroke:');
  expect(themeCss).not.toContain('--color-chart-series-5-stroke:');
  expect(themeCss).not.toContain('--color-chart-heat-seq-0:');
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
