import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAdapter, Session } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { AnalysisLayout } from './AnalysisLayout';
import { AnalysisChartFrame } from './AnalysisChartFrame';
import { PlatformDataTable } from './PlatformDataTable';

vi.mock('./EChartImpl', () => ({ default: ({ ariaLabel }: { ariaLabel: string }) => <div role="img" aria-label={ariaLabel} /> }));

const none = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const registry = createRegistry({
  spaces: [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, homeMenuId: 'home' }],
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }],
  menus: [{ id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: none, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});

const session: Session = {
  user: { id: 'user-a', name: 'a', title: { ko: 'a', en: 'a' }, permissions: ['platform:view'] }, scopes: [],
};
const adapter: PlatformAdapter = {
  menuQuery: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
  session: () => session,
  validateScope: async () => ({ status: 'valid', grantedRooms: [] }),
  publishedMetrics: () => [],
  defaultRangeTo: () => '2026-09-26T09:00:00',
  contextOptions: async () => ({ stgroup: [], team: [], makerModel: [] }),
  evaluateSelection: async () => ({ inCondition: [], outOfCondition: [] }),
  getEntity: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'c' }),
  auditTrail: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'c' }),
  entityAudit: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'c' }),
  accessDirectory: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'c' }),
  recordUsage: async () => ({ accepted: 0 }),
  usageSummary: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'c' }),
  listAnnotations: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
  saveAnnotation: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
  reportClientError: async () => ({ accepted: true }),
  subscribe: () => () => {},
};

let width = 1200;
let callbacks: Set<() => void>;
let observed: Set<Element>;
let storage: Map<string, string>;
const key = 'platform:analysis-collapsed:home';
beforeEach(() => {
  width = 1200;
  callbacks = new Set();
  observed = new Set();
  storage = new Map();
  window.history.replaceState(null, '', '/');
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: () => void) {}
    observe(element: Element) { observed.add(element); if (element.classList.contains('@container/analysis')) callbacks.add(this.callback); }
    unobserve() {}
    disconnect() { callbacks.delete(this.callback); }
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    width, height: 600, x: 0, y: 0, top: 0, left: 0, right: width, bottom: 600, toJSON() {},
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const chart = (title: string) => <AnalysisChartFrame chartId={title} title={title} series={[]} unit="min" />;
const table = <PlatformDataTable<{ id: string }> title="표" ariaLabel="표 목록" columns={[{ id: 'id', header: 'ID' }]} getRowId={row => row.id}
  preferenceKey="analysis-test" filterKey="all" loadPage={async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'c' })} />;
function mount(extraChart = false, layout = true, lang: 'ko' | 'en' = 'ko') {
  if (lang === 'en') storage.set('platform:lang', lang);
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
    {layout ? <AnalysisLayout kpi={{ id: 'kpi', title: '요약', node: <p>KPI 내용</p> }}
      charts={[{ id: 'trend', title: '추세', node: <div aria-busy={false} className="relative">{chart('추세')}</div> },
        { id: 'dist', title: '분포', node: chart('분포') }, ...(extraChart ? [{ id: 'third', title: '세번째', node: chart('세번째') }] : [])]}
      breakdown={{ id: 'table', title: '표', node: table }} /> : <>{chart('추세')}{table}</>}
  </PlatformProvider></I18nProvider>);
}
function DelayedChart() {
  const [ready, setReady] = useState(false);
  useEffect(() => { let active = true; void Promise.resolve().then(() => { if (active) setReady(true); }); return () => { active = false; }; }, []);
  return ready ? chart('지연 차트') : <p>조회 중</p>;
}
const collapse = (title: string) => screen.getByRole('button', { name: `${title} 접기` });
const expand = (title: string) => screen.getByRole('button', { name: `${title} 펼치기` });
function setWidth(next: number) { act(() => { width = next; callbacks.forEach(callback => callback()); }); }

describe('AnalysisLayout', () => {
  it('measures its own width and gives paired charts shared header/body rows', () => {
    const { container } = mount();
    expect(observed.has(container.firstElementChild!)).toBe(true);
    const grid = container.querySelector('[data-analysis-chart-grid]')!;
    expect(grid).toHaveClass('grid-cols-2', 'items-stretch', 'gap-4');
    expect(container.querySelectorAll('[data-analysis-chart-head]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-analysis-chart-body]')).toHaveLength(2);
    setWidth(959);
    expect(grid).toHaveClass('grid-cols-1');
    setWidth(960);
    expect(grid).toHaveClass('grid-cols-2');
  });

  it('collapses, persists by menu, reflows and restores in original order with focus', () => {
    const { container } = mount();
    fireEvent.click(collapse('추세'));
    expect(screen.queryByRole('region', { name: '추세' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: '접힌 항목' })).toBeInTheDocument();
    expect(expand('추세')).toHaveFocus();
    expect(storage.get(key)).toBe('["trend"]');
    expect(container.querySelector('[data-analysis-chart-grid]')).toHaveClass('grid-cols-1');
    fireEvent.click(expand('추세'));
    expect(collapse('추세')).toHaveFocus();
    expect([...container.querySelectorAll('[data-analysis-kind="chart"]')].map(node => node.getAttribute('data-analysis-section'))).toEqual(['trend', 'dist']);
    expect(screen.queryByRole('group', { name: '접힌 항목' })).not.toBeInTheDocument();
    expect(storage.get(key)).toBe('[]');
  });

  it('spans the last odd chart and recomputes spans after collapsing', () => {
    const { container } = mount(true);
    expect(container.querySelector('[data-analysis-section="third"]')).toHaveClass('col-span-2');
    fireEvent.click(collapse('분포'));
    expect(container.querySelector('[data-analysis-section="third"]')).not.toHaveClass('col-span-2');
  });

  it('restores known stored ids, ignoring unknown ids and non-string entries', () => {
    storage.set(key, '["dist","gone",4]');
    mount();
    expect(expand('분포')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '분포' })).not.toBeInTheDocument();
    expect(screen.queryByText('gone')).not.toBeInTheDocument();
    fireEvent.click(collapse('요약'));
    expect(JSON.parse(storage.get(key)!)).toEqual(['kpi', 'dist']);
  });

  it('collapses KPI and table separately and restores their collapse focus', async () => {
    mount();
    fireEvent.click(collapse('요약'));
    expect(expand('요약')).toHaveFocus();
    expect(screen.queryByText('KPI 내용')).not.toBeInTheDocument();
    fireEvent.click(collapse('표'));
    expect(expand('표')).toHaveFocus();
    expect(screen.queryByRole('region', { name: '표 목록' })).not.toBeInTheDocument();
    fireEvent.click(expand('표'));
    await waitFor(() => expect(collapse('표')).toHaveFocus());
    fireEvent.click(expand('요약'));
    expect(collapse('요약')).toHaveFocus();
    expect(screen.getByText('KPI 내용')).toBeInTheDocument();
  });

  it('keeps working when storage reads and writes throw', () => {
    vi.stubGlobal('localStorage', { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
    mount();
    fireEvent.click(collapse('분포'));
    expect(expand('분포')).toHaveFocus();
    fireEvent.click(expand('분포'));
    expect(collapse('분포')).toHaveFocus();
  });

  it('defaults to expanded for malformed storage', () => {
    storage.set(key, '{broken');
    mount();
    expect(collapse('분포')).toBeInTheDocument();
  });

  it('uses English accessible names', () => {
    mount(false, true, 'en');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse 분포' }));
    expect(screen.getByRole('group', { name: 'Collapsed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand 분포' })).toHaveFocus();
  });

  it('restores focus when an expanded chart mounts after an asynchronous query', async () => {
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
      <AnalysisLayout charts={[{ id: 'delayed', title: '지연 차트', node: <DelayedChart /> }]} />
    </PlatformProvider></I18nProvider>);
    fireEvent.click(await screen.findByRole('button', { name: '지연 차트 접기' }));
    fireEvent.click(expand('지연 차트'));
    await waitFor(() => expect(collapse('지연 차트')).toHaveFocus());
  });

  it('adds no collapse actions or chart wrappers outside AnalysisLayout', () => {
    const { container } = mount(false, false);
    expect(screen.queryByRole('button', { name: /접기/ })).not.toBeInTheDocument();
    expect(container.querySelector('[data-analysis-chart-head]')).toBeNull();
    expect(screen.getByRole('region', { name: '추세' }).firstElementChild?.tagName).toBe('HEADER');
  });
});
