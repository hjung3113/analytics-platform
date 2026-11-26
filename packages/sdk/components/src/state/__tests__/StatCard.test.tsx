import { cleanup, render, screen } from '@testing-library/react';
import { I18nProvider, useI18n } from '@ap/kernel';
import { Timer } from 'lucide-react';
import { useLayoutEffect } from 'react';
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
  const amount = screen.getByText('4초');
  const pill = amount.closest('.t-delta');
  expect(pill).toHaveClass('t-delta', tone, 'min-w-min', 'grid-cols-[auto_minmax(0,1fr)]');
  expect(amount).toHaveClass('truncate');
  expect(screen.getByText('▲')).toHaveClass('col-start-1');
  if (status) expect(screen.getByText(status)).toHaveClass('sr-only');
  else expect(pill?.className).not.toMatch(/(?:success|danger)/);
  expect(screen.getByText('전기 대비 · 이전 8초')).toBeVisible();
});

it('includes the boundary in the neutral no-change band', () => {
  render(<I18nProvider><StatCard label="사이클타임" value="12" comparison={{ ...comparison, good: 'up', noChangeBand: 4 }} /></I18nProvider>);
  // Inside the band the pill says only «변화 없음»: no arrow or change that would contradict it (#2743).
  const pill = screen.getByText('변화 없음', { selector: '.t-delta' });
  expect(pill).toHaveClass('text-text-secondary', 'bg-surface-sunken');
  expect(pill).toHaveClass('shrink-0');
  expect(pill).not.toHaveClass('truncate');
  expect(pill).toHaveTextContent(/^변화 없음$/);
  expect(screen.queryByText(/[▲▼]/)).toBeNull();
});

it.each([
  [0.8, 0.7, 0.1, true],
  [0.800000000000001, 0.7, 0.1, false],
  [0.8, 0.7, Infinity, false],
  [0.8, 0.7, NaN, false],
  [0.8, 0.7, -1, false],
  [0.7, 0.7, -1, true],
  [0.8, 0.7, 0, false],
] as const)('compares %s and %s in band %s (flat: %s)', (current, previous, noChangeBand, flat) => {
  const { container } = render(<I18nProvider><StatCard label="사이클타임" value={current} comparison={{ ...comparison, current, previous, noChangeBand }} /></I18nProvider>);
  expect(screen.queryByText('변화 없음')).toBe(flat ? container.querySelector('.t-delta') : null);
});

it('shows the difference, not the prior value, for an absolute decrease (#2743)', () => {
  const { container } = render(<I18nProvider><StatCard label="처리량" value="108" comparison={{ ...comparison, current: 108, previous: 120, formatValue: v => `${v}건`, formatChange: v => `${v}건` }} /></I18nProvider>);
  expect(container.querySelector('.t-delta')).toHaveClass('text-text-secondary');
  expect(screen.getByText('▼')).toBeVisible();
  expect(screen.getByText('12건')).toBeVisible();
  expect(screen.getByText('전기 대비 · 이전 120건')).toBeVisible();
});

it.each([
  ['value', 12, 8, '이전 8초', null],
  ['absolute', 12, 8, '▲ 4초', '8초'],
  ['percent', 12, 8, '▲ +50.0%', '8초'],
  ['percent', -6, -4, '▼ −50.0%', '-4초'],
  ['percent', 12, 0, '▲ 12초', '0초'],
  ['percent', 12, Number.MIN_VALUE, '▲ 12초', '5e-324초'],
  ['percent', Infinity, 8, '—', '8초'],
  ['percent', 12, null, '—', '—'],
  ['value', null, 8, '—', '8초'],
] as const)('shows %s for current %s and prior %s', (kind, current, previous, inline, prior) => {
  const { container } = render(<I18nProvider><StatCard label="사이클타임" value={current ?? '—'} comparison={{ ...comparison, kind, current, previous }} /></I18nProvider>);
  const pill = container.querySelector('.t-delta');
  expect(pill).toBeVisible();
  const visibleText = Array.from(pill!.childNodes)
    .filter(node => !(node instanceof HTMLElement && node.classList.contains('sr-only')))
    .map(node => node.textContent).join('');
  expect(visibleText).toBe(inline);
  // A labelled prior value in the pill is not repeated on the comparison line, and carries no arrow.
  if (prior === null) expect(screen.queryByText(/전기 대비/)).toBeNull();
  else expect(screen.getByText(`전기 대비 · 이전 ${prior}`)).toBeVisible();
  if (inline === '—') expect(pill).toHaveClass('text-text-secondary');
});

function SetLanguage({ lang }: { lang: 'ko' | 'en' }) {
  const { setLang } = useI18n();
  useLayoutEffect(() => setLang(lang), [lang, setLang]);
  return null;
}

it.each([
  ['ko', 'absolute', 12, '증가'],
  ['ko', 'absolute', 4, '감소'],
  ['en', 'value', 12, 'up'],
  ['en', 'value', 4, 'down'],
] as const)('announces the %s %s comparison direction for %s without a declared good direction', (lang, kind, current, direction) => {
  render(<I18nProvider><SetLanguage lang={lang} /><StatCard label="사이클타임" value={current} comparison={{ ...comparison, current, kind }} /></I18nProvider>);
  expect(screen.getByText(direction)).toHaveClass('sr-only');
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
  expect(button).toHaveClass('stat-card-selected', 'h-26');
  expect(button).not.toHaveClass('ring-1');
  button.click();
  expect(onClick).toHaveBeenCalledOnce();
  expect(screen.getByText(caption)).toHaveClass('truncate');
  expect(screen.getByText(caption)).toHaveAttribute('title', caption);
  expect(container.querySelector('.bg-icon-blue-soft')).toBeNull();
});

it('uses a supplied tooltip for a formatted compact caption', () => {
  render(<StatCard label="사이클타임" value="12" caption={<><span className="block">기준</span><br /><b>v3</b></>} captionTitle="지표 버전 3" />);
  const caption = screen.getByTitle('지표 버전 3');
  expect(caption).toHaveTextContent('v3');
  expect(caption).toHaveClass('truncate', '[&_*]:inline!', '[&_br]:hidden!');
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

it('keeps the value in row 2 when a trend-only card gains observations', () => {
  const { container, rerender } = render(<StatCard label="사이클타임" value="12" caption="기준" trend={[null, null]} />);
  expect(container.querySelector('svg')).toBeNull();
  const valueRow = screen.getByText('12').parentElement;
  expect(valueRow).toHaveClass('col-span-full', 'row-start-2');
  rerender(<StatCard label="사이클타임" value="12" caption="기준" trend={[1, 2]} />);
  expect(screen.getByText('12').parentElement).toBe(valueRow);
  expect(valueRow).toHaveClass('row-start-2');
  expect(screen.getByText('기준')).toHaveClass('row-start-3');
  expect(container.querySelector('svg')).toHaveClass('col-start-2', 'row-start-3', 'row-span-2');
});

it('keeps trend coordinates finite when the range overflows', () => {
  const { container } = render(<StatCard label="사이클타임" value="12" trend={[-Number.MAX_VALUE, 0, Number.MAX_VALUE]} />);
  expect(container.querySelector('path')).toHaveAttribute('d', 'M4,24 L40,14 L76,4');
});

it('compares whole-number changes strictly against the band (#2743 R2 C4)', () => {
  render(<I18nProvider><StatCard label="건수" value="9000000000000002" comparison={{ ...comparison, current: 9_000_000_000_000_002, previous: 9_000_000_000_000_000, noChangeBand: 1 }} /></I18nProvider>);
  expect(screen.queryByText('변화 없음')).toBeNull();
  expect(screen.getByText('2초')).toBeVisible();
});

it('keeps the prior line when a value comparison cannot show its prior label (#2743 R2 C11)', () => {
  render(<I18nProvider><StatCard label="사이클타임" value="—" comparison={{ ...comparison, kind: 'value', current: Infinity, previous: 8 }} /></I18nProvider>);
  expect(screen.getByText('전기 대비 · 이전 8초')).toBeVisible();
});

it('keeps the footnote below the caption with or without a trend (#2743 R2 C10)', () => {
  const card = (trend: readonly (number | null)[]) => <I18nProvider><StatCard label="사이클타임" value="12" caption="기준" footnote="각주" trend={trend} comparison={{ ...comparison, kind: 'value' }} /></I18nProvider>;
  const { rerender } = render(card([null, null]));
  expect(screen.getByText('각주')).toHaveClass('row-start-5');
  rerender(card([8, 12]));
  expect(screen.getByText('각주')).toHaveClass('row-start-5');
});
