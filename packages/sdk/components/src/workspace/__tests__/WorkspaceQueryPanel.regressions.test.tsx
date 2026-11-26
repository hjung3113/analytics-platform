import { readFileSync } from 'node:fs';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import { I18nProvider, useI18n, type QueryState, type TextParams } from '@ap/kernel';
import type { ApiResponse } from '@ap/contracts';
import { AnalysisChartFrame } from '../../chart/AnalysisChartFrame';
import { useDockChartHead } from '../../dock/DockChartHead';
import { group, installResizeObserver } from '../../dock/__tests__/harness';
import { QueryView } from '../../StateView';
import { PanelWorkspace } from '../PanelWorkspace';

const { plot, groupActions, siblingDockReader } = vi.hoisted(() => ({ plot: vi.fn(), groupActions: vi.fn(), siblingDockReader: vi.fn() }));
vi.mock('../../chart/EChartImpl', () => ({ default: ({ option }: { option: unknown }) => {
  plot(option);
  return <div role="img" aria-label="plot" />;
} }));
vi.mock('@ap/kernel', async importOriginal => {
  const actual = await importOriginal<typeof import('@ap/kernel')>();
  return { ...actual, useMessages: (dictionary: Parameters<typeof actual.useMessages>[0]) => {
    const messages = actual.useMessages(dictionary);
    return (key: string, args?: TextParams) => {
      if (key === 'workspaceActions') groupActions(args?.title);
      return messages(key, args);
    };
  } };
});

const Note = createContext('body default');
const TitleNote = () => <span>{useContext(Note)}</span>;
function English({ children }: { children: ReactNode }) {
  const { lang, setLang } = useI18n();
  useLayoutEffect(() => { setLang('en'); }, [setLang]);
  return lang === 'en' ? children : null;
}
const trust = { source: 'trend-source', coverage: 0.987, provisional: true, updatedAt: '2026-01-01T00:00:00Z', dataThrough: null };
const ok: ApiResponse<string> = { outcome: 'ok', data: 'A', assessments: [], trust, correlationId: 'ok' };
const error: ApiResponse<string> = { ...ok, outcome: 'error', data: null, correlationId: 'error', recovery: { retryable: true } };
const query = (status: QueryState<string>['status'], response: ApiResponse<string> | null = null): QueryState<string> =>
  ({ status, response, refetch: vi.fn(), missing: [], completedAt: null });
function SiblingDockReader() {
  useDockChartHead('sibling-probe', { mounted: false });
  siblingDockReader();
  return <div>Other</div>;
}
const title = { ko: '추세', en: 'Trend' };
const sibling = { ko: '다른 패널', en: 'Other panel' };
const points: [string, number][] = Array.from({ length: 12 }, (_, i) => [String(i), i + 1]);

let observer: ReturnType<typeof installResizeObserver>;
beforeEach(() => { observer = installResizeObserver(); observer.resize(1200, 600); });
afterEach(() => { cleanup(); vi.useRealTimers(); window.localStorage?.removeItem('platform:lang'); observer.restore(); vi.clearAllMocks(); });

async function mount({ chart = false, zoomOnly = false, twoGroups = false, localLanguage = false } = {}) {
  let update!: (value: QueryState<string>) => void;
  function PanelBody() {
    const [value, setValue] = useState(() => query('done', ok));
    update = setValue;
    const content = <Note.Provider value="local title note"><QueryView query={value} panel={{ title: title.ko, kind: 'chart', height: 800, titleNote: <TitleNote /> }}>
      {data => <><button type="button">{data}</button>{chart && <AnalysisChartFrame chartId="trend" title="차트" unit="s" xType="category"
        series={[{ id: 'value', name: 'Value', color: 'chart-blue', points }]} zoomOnly={zoomOnly} trust={trust} metricVersion="v3" />}</>}
    </QueryView></Note.Provider>;
    return localLanguage ? <I18nProvider><English>{content}</English></I18nProvider> : content;
  }
  render(<I18nProvider><PanelWorkspace label={title} panels={[
    { id: 'trend', title, primary: true, render: () => <PanelBody /> },
    ...(twoGroups ? [{ id: 'other', title: sibling, render: () => <SiblingDockReader /> }] : []),
  ]} presets={[{ id: 'fit', label: title, layout: twoGroups
    ? { type: 'branch', dir: 'row', sizes: [50, 50], children: [group(['trend']), group(['other'])] }
    : group(['trend']) }]} initialPreset="fit" initialMode="fit" persistKey="query-panel-regression" /></I18nProvider>);
  const tab = await screen.findByRole('tab', { name: title.ko });
  const body = (await screen.findByRole('button', { name: 'A' })).closest('section')!;
  const head = within(tab.closest('.dv-tabs-and-actions-container') as HTMLElement);
  if (chart) await head.findByRole('button', { name: '더보기' });
  return { body, head, update: (value: QueryState<string>) => act(() => update(value)) };
}

it.each(['error', 'more'] as const)('returns focus when the dock %s trigger disappears', async trigger => {
  const { body, head, update } = await mount({ chart: trigger === 'more' });
  if (trigger === 'error') update(query('done', error));
  act(() => head.getByRole('button', { name: trigger === 'error' ? '불러오지 못함' : '더보기' }).focus());
  update(trigger === 'error' ? query('done', ok) : query('loading'));
  expect([body, head.getByRole('button', { name: '추세 동작' })]).toContain(document.activeElement);
});

it('does not render a sibling group action reader when a query ticks or overflows', async () => {
  const { body, head, update } = await mount({ twoGroups: true });
  expect(groupActions).toHaveBeenCalledWith(sibling.ko);
  observer.touch(target => body.contains(target), 320);
  groupActions.mockClear();
  vi.useFakeTimers();
  update({ ...query('refreshing', ok), cancel: vi.fn() });
  act(() => vi.advanceTimersByTime(3_000));
  expect(head.getByText('조회 중 · 3초')).toBeVisible();
  act(() => vi.advanceTimersByTime(7_000));
  expect(head.getByRole('status')).toHaveTextContent('오래 걸립니다');
  expect(groupActions).not.toHaveBeenCalledWith(sibling.ko);
});

it('keeps sibling dock readers untouched when a discarded chart releases its slots', async () => {
  const { head, update } = await mount({ chart: true, twoGroups: true });
  expect(siblingDockReader).toHaveBeenCalled();
  siblingDockReader.mockClear();
  update(query('loading'));
  expect(head.getByRole('button', { name: '추세 동작' })).toBeVisible();
  expect(siblingDockReader).not.toHaveBeenCalled();
});

it('renders the title note with its query-local provider', async () => {
  const { head } = await mount();
  expect(head.getByText('local title note')).toBeVisible();
});

it('documents how the declared height is applied in each layout', () => {
  const source = readFileSync('src/state/QueryPanel.tsx', 'utf8');
  expect(source).toMatch(/\/\*\* [^\n]*[Pp]age flow[^\n]*[Ww]orkspace[^\n]*\*\/\s*height: number/);
});

it('uses the query-local language for overflow recovery', async () => {
  const { body, head, update } = await mount({ localLanguage: true });
  observer.touch(target => body.contains(target), 320);
  const failure = query('done', error);
  update(failure);
  act(() => head.getByRole('button', { name: '추세 동작' }).focus());
  await userEvent.keyboard('{Enter}');
  const retry = screen.getByRole('menuitem', { name: 'Retry' });
  act(() => retry.focus());
  await userEvent.keyboard('{Enter}');
  expect(failure.refetch).toHaveBeenCalledOnce();
});
