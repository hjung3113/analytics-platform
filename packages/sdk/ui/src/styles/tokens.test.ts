import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

function properties(path: string): Set<string> {
  const css = readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]));
}

it('keeps platform extension tokens disjoint from the shared token files', () => {
  const extension = properties('./platform-tokens.css');
  const upstream = new Set([
    ...properties('./tokens.css'),
    ...properties('./semantic.css'),
  ]);
  expect(extension.size).toBeGreaterThan(0);
  expect(upstream.size).toBeGreaterThan(0);
  expect([...extension].filter(name => upstream.has(name))).toEqual([]);
});

function values(path: string): Map<string, string> {
  const css = readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return new Map([...css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]));
}

const palette = new Map([
  ...values('./tokens.css'),
  ...values('./semantic.css'),
  ...values('./platform-tokens.css'),
]);

it('keeps the v3 surfaces and muted text independent of the unchanged palette aliases (#2722)', () => {
  expect(rgb('surface-canvas')).toEqual([236, 239, 243]);
  expect(rgb('surface-card')).toEqual([255, 255, 255]);
  expect(rgb('text-muted')).toEqual([91, 102, 120]);
  expect(rgb('color-pitch-black')).toEqual([236, 239, 243]);
  expect(rgb('color-storm-cloud')).toEqual([102, 112, 131]);
  expect(rgb('surface-list')).toEqual([236, 239, 243]);
  expect(contrast('text-muted', 'surface-canvas')).toBeCloseTo(5.03, 2);
  expect(palette.get('--row-accent-width')).toBe('3px');
  for (const surface of ['surface-canvas', 'surface-card', 'surface-sidebar', 'surface-sunken', 'surface-row-hover', 'surface-band', 'surface-popover']) {
    expect(contrast('text-muted', surface), surface).toBeGreaterThanOrEqual(4.5);
  }
  // Rows still switch meta text to secondary on the selected fill (row-meta); muted alone now clears AA there too.
  expect(contrast('text-muted', 'surface-row-selected')).toBeGreaterThanOrEqual(4.5);
  expect(contrast('text-secondary', 'surface-row-selected')).toBeGreaterThanOrEqual(4.5);
});

function rgb(name: string): number[] {
  const value = palette.get(`--${name}`);
  if (!value) throw new Error(`Missing token: ${name}`);
  const alias = /^var\(--([\w-]+)\)$/.exec(value);
  return alias ? rgb(alias[1]) : value.split(/\s+/).map(Number);
}

function luminance(color: number[]): number {
  const linear = color.map(channel => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(foreground: string, background: string): number {
  const [lo, hi] = [luminance(rgb(foreground)), luminance(rgb(background))].sort((a, b) => a - b);
  return (hi + 0.05) / (lo + 0.05);
}

it('keeps small semantic labels readable on their soft fills and card/row states', () => {
  const softFills = {
    success: 'accent-success-soft', info: 'accent-primary-soft',
    warning: 'accent-warn-soft', danger: 'accent-danger-soft',
  };
  for (const [tone, soft] of Object.entries(softFills)) {
    for (const background of [soft, 'surface-card', 'surface-canvas', 'surface-sunken', 'surface-row-hover', 'surface-row-selected']) {
      expect(contrast(`text-${tone}-label`, background), `${tone} on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});

it('keeps control boundaries identifiable on enabled, hovered and selected surfaces', () => {
  for (const background of ['surface-card', 'surface-canvas', 'surface-sunken', 'surface-row-hover', 'surface-row-selected']) {
    expect(contrast('border-control', background), background).toBeGreaterThanOrEqual(3);
  }
});


it('keeps shell planned labels, normal Scope grants and language readable in sidebar row states', () => {
  for (const background of ['surface-sidebar', 'surface-row-hover', 'surface-row-selected']) {
    expect(contrast('text-secondary', background), `secondary on ${background}`).toBeGreaterThanOrEqual(4.5);
    expect(contrast('text-warning-label', background), `warning on ${background}`).toBeGreaterThanOrEqual(4.5);
  }
});

it('keeps chart stroke aliases identifiable on every chart surface (#203, #207)', () => {
  for (const foreground of ['chart-blue-stroke', 'chart-teal-stroke', 'chart-purple-stroke', 'cat-amber-stroke']) {
    for (const background of ['surface-card', 'surface-canvas', 'surface-sunken']) {
      expect(contrast(foreground, background), `${foreground} on ${background}`).toBeGreaterThanOrEqual(3);
    }
  }
});

it('keeps the previous-period amber stroke at the confirmed opaque value (#207, v3 palette #2724)', () => {
  expect(rgb('cat-amber-stroke')).toEqual([200, 105, 10]);
});

it('keeps chart-green readable under white segment labels and visible on a white card (#2724)', () => {
  expect(rgb('chart-green')).toEqual([87, 130, 43]);
  expect(contrast('text-on-accent', 'chart-green')).toBeGreaterThanOrEqual(4.5);
  expect(contrast('chart-green', 'surface-card')).toBeGreaterThanOrEqual(3);
});

it('leaves reduced motion to the shared compat rule (06 §26, #289)', () => {
  const repo = join(process.cwd(), '../../..');
  const platform = readFileSync(join(repo, 'packages/sdk/ui/src/styles/index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const shared = readFileSync(join(repo, 'packages/sdk/ui/src/styles/compat.css'), 'utf8');
  expect(shared).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation-duration: 0\.01ms !important/);
  expect(platform).not.toMatch(/prefers-reduced-motion/);
});
