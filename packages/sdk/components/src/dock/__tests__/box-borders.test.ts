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
