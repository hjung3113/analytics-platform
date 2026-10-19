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

it('keeps the previous-period amber stroke at the confirmed opaque value (#207)', () => {
  expect(rgb('cat-amber-stroke')).toEqual([180, 83, 9]);
});

it('leaves reduced motion to the shared compat rule (06 §26, #289)', () => {
  const repo = join(process.cwd(), '../..');
  const platform = readFileSync(join(repo, 'packages/ui/src/styles/index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const shared = readFileSync(join(repo, 'packages/ui/src/styles/compat.css'), 'utf8');
  expect(shared).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation-duration: 0\.01ms !important/);
  expect(platform).not.toMatch(/prefers-reduced-motion/);
});
