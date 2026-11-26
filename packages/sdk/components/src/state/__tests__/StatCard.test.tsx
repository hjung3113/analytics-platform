import { cleanup, render, screen } from '@testing-library/react';
import { I18nProvider } from '@ap/kernel';
import { Timer } from 'lucide-react';
import { afterEach, expect, it, vi } from 'vitest';
import { PageDensityProvider } from '../../pageDensity';
import { EmbeddedPane, InWorkspacePanelProvider } from '../../workspace/panelContext';
import { WorkspaceQueryBarContext } from '../../archetypes/WorkspaceQueryBar';
import { StatCard } from '../StatCard';

afterEach(cleanup);
const card = () => screen.getByText('사이클타임').closest('div') as HTMLElement;
const mount = (density?: 'compact' | 'comfortable') => render(density
  ? <PageDensityProvider value={density}><StatCard icon={Timer} label="사이클타임" value="12" /></PageDensityProvider>
  : <StatCard icon={Timer} label="사이클타임" value="12" />);

it('compact page: 12px inner padding and an 8px icon–body gap; number sizes unchanged', () => {
  mount('compact');
  expect(card().className).toContain('p-3');
  expect(card().className).toContain('gap-2');
  expect(card().className).not.toMatch(/\bp-4\b|\bgap-3\b/);
  expect(screen.getByText('12').className).toContain('t-stat');
});

it.each([[undefined], ['comfortable' as const]])('comfortable (%s): 16px padding and 12px gap as before', density => {
  mount(density);
  expect(card().className).toContain('p-4');
  expect(card().className).toContain('gap-3');
  expect(card().className).not.toMatch(/\bp-3\b|\bgap-2\b/);
});

it.each([
  ['purple', 'teal'],
  ['amber', 'blue'],
] as const)('deprecated %s chip renders exactly like %s for the migration release', (legacy, supported) => {
  const { container, rerender } = render(<StatCard icon={Timer} label="사이클타임" value="12" chip={legacy} />);
  const legacyClass = container.querySelector('span')!.className;
  rerender(<StatCard icon={Timer} label="사이클타임" value="12" chip={supported} />);
  expect(legacyClass).toBe(container.querySelector('span')!.className);
  expect(legacyClass).toContain(`bg-icon-${supported}-soft`);
});

const foldedWorkspace = { status: null, parameterTarget: null, setParameterTarget: () => {}, toolbarTarget: null, setToolbarTarget: () => {} };
it.each(['compact', 'comfortable'] as const)('folded workspace StatCard has one pane border at %s density, retaining rounded selection and hover', density => {
  const view = render(<WorkspaceQueryBarContext.Provider value={foldedWorkspace}><PageDensityProvider value={density}><InWorkspacePanelProvider value><StatCard icon={Timer} label="사이클타임" value="12" active onClick={() => {}} /></InWorkspacePanelProvider></PageDensityProvider></WorkspaceQueryBarContext.Provider>);
  const tile = screen.getByRole('button', { name: /사이클타임/ });
  expect(tile).not.toHaveClass('border');
  expect(tile).toHaveClass('rounded-lg', 'ring-1', 'ring-accent-primary', 'hover:bg-surface-row-hover');
  view.rerender(<StatCard icon={Timer} label="사이클타임" value="12" />);
  expect(card()).toHaveClass('border', 'border-border-subtle');
});

it('board pane StatCards keep their existing border', () => {
  render(<EmbeddedPane><StatCard icon={Timer} label="사이클타임" value="12" /></EmbeddedPane>);
  expect(card()).toHaveClass('border', 'border-border-subtle');
});

it('keeps workspace StatCard borders when that workspace is inside a board pane (#1941)', () => {
  render(<EmbeddedPane><InWorkspacePanelProvider value><StatCard icon={Timer} label="사이클타임" value="12" /></InWorkspacePanelProvider></EmbeddedPane>);
  expect(card()).toHaveClass('border', 'border-border-subtle');
});

const comparison = {
  current: 12,
  previous: 8,
  kind: 'absolute',
  formatValue: (value: number) => `${value}초`,
  formatChange: (magnitude: number) => `${magnitude}초`,
} as const;

it.each([
  [undefined, 'text-text-secondary', undefined],
  ['up', 'text-text-success-label', '좋아짐'],
  ['down', 'text-text-danger-label', '나빠짐'],
] as const)('compares an increase with good direction %s', (good, tone, status) => {
  render(<I18nProvider><StatCard label="사이클타임" value="12" comparison={{ ...comparison, good }} /></I18nProvider>);
  const pill = screen.getByText('▲ 4초');
  expect(pill).toHaveClass('t-delta', tone);
  if (status) expect(screen.getByText(status)).toHaveClass('sr-only');
  else expect(pill.className).not.toMatch(/(?:success|danger)/);
  expect(screen.getByText('전기 대비 · 이전 8초')).toBeVisible();
});

it('includes the boundary in the neutral no-change band', () => {
  render(<I18nProvider><StatCard label="사이클타임" value="12" comparison={{ ...comparison, good: 'up', noChangeBand: 4 }} /></I18nProvider>);
  expect(screen.getByText('변화 없음')).toBeVisible();
  expect(screen.getByText('▲ 4초 ·')).toHaveClass('text-text-secondary', 'bg-surface-sunken');
});

it.each([
  ['value', 12, 8, '▲ 8초', '8초'],
  ['absolute', 12, 8, '▲ 4초', '8초'],
  ['percent', 12, 8, '▲ +50.0%', '8초'],
  ['percent', -6, -4, '▼ −50.0%', '-4초'],
  ['percent', 12, 0, '▲ 12초', '0초'],
  ['percent', 12, null, '—', '—'],
  ['value', null, 8, '—', '8초'],
] as const)('shows %s for current %s and prior %s', (kind, current, previous, inline, prior) => {
  render(<I18nProvider><StatCard label="사이클타임" value={current ?? '—'} comparison={{ ...comparison, kind, current, previous }} /></I18nProvider>);
  expect(screen.getByText(inline, { selector: '.t-delta' })).toBeVisible();
  expect(screen.getByText(`전기 대비 · 이전 ${prior}`)).toBeVisible();
  if (inline === '—') expect(screen.getByText(inline, { selector: '.t-delta' })).toHaveClass('text-text-secondary');
});

it('keeps the existing delta and icon tile', () => {
  const { container } = render(<StatCard icon={Timer} label="사이클타임" value="12" delta={{ value: '+4초', direction: 'up', good: false }} />);
  expect(screen.getByText('+4초')).toHaveClass('t-delta', 'text-text-danger-label');
  expect(container.querySelector('.bg-icon-blue-soft svg')).toHaveClass('lucide-timer');
});

it('keeps the basis on one line and retains native selection without an icon tile', () => {
  const caption = '완료 작업 123건 / 전체 200건 · v3';
  const onClick = vi.fn();
  const { container } = render(<I18nProvider><StatCard label="사이클타임" value="12" comparison={comparison} caption={caption} onClick={onClick} active /></I18nProvider>);
  const button = screen.getByRole('button', { pressed: true });
  expect(button).toHaveAttribute('type', 'button');
  expect(button).toHaveClass('border-accent-primary', 'stat-card-compact-border', 'h-26');
  expect(button).not.toHaveClass('ring-1');
  button.click();
  expect(onClick).toHaveBeenCalledOnce();
  expect(screen.getByText(caption)).toHaveClass('truncate');
  expect(screen.getByText(caption)).toHaveAttribute('title', caption);
  expect(container.querySelector('.bg-icon-blue-soft')).toBeNull();
});

it('uses a supplied tooltip for a formatted compact caption', () => {
  render(<StatCard label="사이클타임" value="12" caption={<b>v3</b>} captionTitle="지표 버전 3" />);
  expect(screen.getByTitle('지표 버전 3')).toHaveTextContent('v3');
});

it('draws a decorative trend with gaps and marks the last observed point', () => {
  const { container } = render(<StatCard label="사이클타임" value="12" trend={[1, 2, null, 3, 4, null]} />);
  const trend = container.querySelector('svg')!;
  expect(trend).toHaveAttribute('aria-hidden', 'true');
  expect(trend).toHaveAttribute('viewBox', '0 0 80 28');
  expect(trend.querySelectorAll('path')).toHaveLength(2);
  expect(trend.querySelectorAll('circle')).toHaveLength(1);
  expect(trend.querySelector('circle')).toHaveAttribute('cx', '61.6');
});

it('omits a trend with only missing points', () => {
  const { container } = render(<StatCard label="사이클타임" value="12" trend={[null, null]} />);
  expect(container.querySelector('svg')).toBeNull();
});
