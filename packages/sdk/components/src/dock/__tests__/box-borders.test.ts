import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

it('removes gap borders while preserving pointer resize and keyboard focus affordances', () => {
  const css = source('../dock.css');
  expect(css).toContain('--dv-separator-border: transparent;');
  expect(css).toContain('--dv-active-sash-color: var(--color-accent-primary);');
  const separators = source('../DockSeparators.tsx');
  expect(separators).toContain('focus-visible:ring-2 focus-visible:ring-focus-ring');
  expect(separators).toContain('role="separator"');
});

it('uses thin scrollbars on the rounded dock panel body', () => {
  expect(source('../DockEngine.tsx')).toMatch(/data-dock-panel=\{id\}[^\n]*className="[^"]*scrollbar-panel[^\"]*overflow-auto/);
});

it.each([
  '../../drawer/DetailDrawer.tsx',
  '../../table/PlatformDataTable.tsx',
  '../../inspector/Inspector.tsx',
  '../../saved-view/ViewSelector.tsx',
  '../../saved-view/ViewManagement.tsx',
  '../../saved-view/ApprovalQueue.tsx',
  '../../saved-view/ShareTargetPicker.tsx',
  '../../saved-view/GroupEditor.tsx',
  '../../chart/LaneTimeline.tsx',
  '../../chart/OrderedIntervalPlot.tsx',
])('uses the shared scrollbar style in %s bordered surfaces', path => {
  expect(source(path)).toContain('scrollbar-panel');
});

it('paints only the dock root canvas while panels retain their card surface, border and shadow', () => {
  const css = source('../dock.css');
  expect(css).toMatch(/\.ap-dock \.dv-dockview\s*\{\s*background-color: var\(--color-surface-canvas\);\s*\}/);
  expect(css).toContain('--dv-group-view-background-color: var(--color-surface-card);');
  expect(css).toMatch(/\.ap-dock \.dv-groupview\s*\{[^}]*border: 1px solid rgb\(var\(--border-card\)\);[^}]*box-shadow: var\(--shadow-sm\);/);
});

it('keeps the content source ring inset from the keyboard focus ring', () => {
  const css = source('../dock.css');
  const sourceRing = css.match(/\[data-dock-panel\]\[data-analysis-source-highlighted\] > \[data-dock-panel-content\]::after\s*\{([^}]+)\}/)?.[1];
  expect(sourceRing).toContain('inset: 4px;');
  expect(sourceRing).toContain('pointer-events: none;');
  expect(css).toMatch(/\[data-dock-panel\]:focus-visible\[data-analysis-source-highlighted\] > \[data-dock-panel-content\]::after\s*\{[^}]*outline: 2px solid var\(--color-focus-ring\);[^}]*outline-offset: 2px;/);
});
