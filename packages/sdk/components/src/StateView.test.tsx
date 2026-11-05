import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, type QueryState } from '@ap/kernel';
import type { ApiResponse } from '@ap/contracts';
import { QueryView } from './StateView';
import { InWorkspacePanelProvider } from './workspace/panelContext';
import { QueryBarStatusContext } from './filters/QueryBarStatus';
import { PageDensityProvider } from './pageDensity';
import { AnalysisSectionContext } from './archetypes/AnalysisSectionContext';

afterEach(cleanup);

function textWithoutDetail(node: HTMLElement) {
  const clone = node.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[role="note"]').forEach(note => note.remove());
  return clone.textContent ?? '';
}

const errorResponse = (): ApiResponse<unknown> =>
  ({ outcome: 'error', message: 'boom', data: null, assessments: [], trust: null, correlationId: 'c1' });
const query = (): QueryState<unknown> => ({ response: errorResponse(), refetch: vi.fn(), missing: [], completedAt: null, status: 'done' });

/** Outside an OutcomeScope the widget never groups (UXA-3): the compact state must still name its widget. */
function View({ hide = false }: { hide?: boolean }) {
  return <I18nProvider><QueryView query={query()} widgetName="지표 쌍 검증" compact hideWidgetName={hide}>{() => null}</QueryView></I18nProvider>;
}

describe('non-grouped compact state names its widget (UXA-3)', () => {
  it('draws the widget name line above a compact error StateMessage', () => {
    render(<View />);
    expect(screen.getByRole('group', { name: '지표 쌍 검증' })).toBeInTheDocument();
    expect(screen.getByText('지표 쌍 검증')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('데이터를 불러오지 못했습니다');
    const alert = screen.getByRole('alert');
    expect(within(alert).getByRole('note', { name: '서버 세부' })).toHaveTextContent('boom');
    expect(textWithoutDetail(alert)).not.toContain('boom');
  });

  it.each([
    ['error', 'time_domain_unverified: MEM-PHOTO-0103, MEM-PHOTO-0105', 'alert', ['함께 집계할 수 없습니다', '설비를 좁히거나 기간을 줄이세요'], true],
    ['forbidden', 'no grant', 'status', ['관리자에게 요청하세요'], false],
    ['too_large', 'row cap', 'status', ['조회 조건을 좁혀 다시 시도하세요'], false],
    ['timeout', 'Upstream mart query failed', 'alert', ['조회가 제한 시간 안에 끝나지 않았습니다', '기간을 줄이거나 집계 단위를 키워 다시 시도하세요'], true],
  ] as const)('standalone %s keeps the server message in the named detail', (outcome, message, role, phrases, retry) => {
    const response: ApiResponse<unknown> = { outcome, message, data: null, assessments: [], trust: null, correlationId: 'c-stand' };
    const q: QueryState<unknown> = { response, refetch: vi.fn(), missing: [], completedAt: null, status: 'done' };
    render(<I18nProvider><QueryView query={q}>{() => null}</QueryView></I18nProvider>);
    const region = screen.getByRole(role);
    for (const phrase of phrases) expect(textWithoutDetail(region)).toContain(phrase);
    expect(textWithoutDetail(region)).not.toContain(message);
    expect(within(region).getByRole('note', { name: '서버 세부' })).toHaveTextContent(message);
    expect(region).toHaveTextContent('c-stand');
    if (retry) expect(within(region).getByRole('button', { name: '다시 시도' })).toBeTruthy();
  });

  it('hideWidgetName keeps the name out', () => {
    render(<View hide />);
    expect(screen.queryByText('지표 쌍 검증')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

it('renders idle with localized missing reasons and without loading or outcome content', () => {
  const query: QueryState<unknown> = { status: 'idle', response: null, refetch: vi.fn(), missing: [{ key: 'time', label: { ko: '기간', en: 'Period' } }], completedAt: null };
  render(<I18nProvider><QueryView query={query}>{() => <span>result</span>}</QueryView></I18nProvider>);
  expect(screen.getByRole('status')).toHaveTextContent('아직 조회하지 않았습니다');
  expect(screen.getByRole('listitem')).toHaveTextContent('기간을 선택하세요');
  expect(screen.queryByText('불러오는 중')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('renders the roomNames missing item as 공정 with the object particle', () => {
  const query: QueryState<unknown> = { status: 'idle', response: null, refetch: vi.fn(), missing: [{ key: 'roomNames', label: { ko: '공정', en: 'Process' } }], completedAt: null };
  render(<I18nProvider><QueryView query={query}>{() => <span>result</span>}</QueryView></I18nProvider>);
  expect(screen.getByRole('listitem')).toHaveTextContent('공정을 선택하세요');
});

describe('QueryView inside a workspace panel', () => {
  const ok = (): QueryState<string> => ({ response: { outcome: 'ok', data: 'x', assessments: [], trust: null, correlationId: 'c' }, refetch: vi.fn(), missing: [], completedAt: null, status: 'done' });

  it('takes the panel height so a fill chart inside has a bounded parent; elsewhere it is unchanged', () => {
    const { container, unmount } = render(<I18nProvider><InWorkspacePanelProvider value><QueryView query={ok()}>{data => <p>{data}</p>}</QueryView></InWorkspacePanelProvider></I18nProvider>);
    expect(container.querySelector('p')!.parentElement).toHaveClass('h-full', 'min-h-0');
    unmount();
    const plain = render(<I18nProvider><QueryView query={ok()}>{data => <p>{data}</p>}</QueryView></I18nProvider>);
    expect(plain.container.querySelector('p')!.parentElement).not.toHaveClass('h-full');
  });
});

describe('QueryView idle beside the query bar (#1170)', () => {
  const idle = (keys: string[]): QueryState<unknown> => ({ status: 'idle', response: null, refetch: vi.fn(), missing: keys.map(key => ({ key, label: { ko: key === 'time' ? '기간' : '공정', en: key } })), completedAt: null });
  const withBar = (reasonKeys: string[], keys: string[]) => (
    <I18nProvider><QueryBarStatusContext.Provider value={{ status: { folded: false, editing: false, reasonKeys }, report: () => {} }}><QueryView query={idle(keys)}>{() => <span>result</span>}</QueryView></QueryBarStatusContext.Provider></I18nProvider>);
  it('omits the list and points to the bar when the bar covers every missing item', () => {
    render(withBar(['time', 'roomNames', 'scope'], ['time', 'roomNames']));
    expect(screen.getByRole('status')).toHaveTextContent('아직 조회하지 않았습니다');
    expect(screen.getByRole('status')).toHaveTextContent('위 조회 조건의 안내를 확인하세요.');
    expect(screen.queryByRole('listitem')).toBeNull();
  });
  it('keeps the list when the bar covers only some of the missing items', () => {
    render(withBar(['roomNames'], ['time', 'roomNames']));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByText('위 조회 조건의 안내를 확인하세요.')).toBeNull();
  });
  it('keeps the list when no bar reports', () => {
    render(<I18nProvider><QueryView query={idle(['time'])}>{() => <span>result</span>}</QueryView></I18nProvider>);
    expect(screen.getByRole('listitem')).toHaveTextContent('기간을 선택하세요');
  });
});

describe('QueryView same-context refresh label (#1166 UX-2)', () => {
  const okResponse = (): ApiResponse<unknown> => ({ outcome: 'ok', data: {}, assessments: [], trust: null, correlationId: 'c' });
  const refreshing = (): QueryState<unknown> => ({ response: okResponse(), refetch: vi.fn(), missing: [], completedAt: null, status: 'refreshing' });
  const label = () => screen.getByText('같은 조건으로 갱신 중').closest('[role="status"]')!;
  it('comfortable pages keep the label above the view', () => {
    render(<I18nProvider><QueryView query={refreshing()}>{() => <p>body</p>}</QueryView></I18nProvider>);
    expect(label()).toHaveClass('-top-7', 'right-0', 'absolute');
  });
  it('compact pages (12px panel gap) put the label inside the view top-right, out of flow, never above it', () => {
    render(<I18nProvider><PageDensityProvider value="compact"><QueryView query={refreshing()}>{() => <p>body</p>}</QueryView></PageDensityProvider></I18nProvider>);
    expect(label()).toHaveClass('absolute', 'top-2', 'right-3');
    expect(label().className).not.toContain('-top-7');
  });
  it('keeps the previous content visible with a named status and aria-busy (kept result of a params change, #1365)', () => {
    const { container } = render(<I18nProvider><QueryView query={refreshing()}>{() => <p>body</p>}</QueryView></I18nProvider>);
    expect(screen.getByText('body')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('같은 조건으로 갱신 중');
    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true');
  });
  it('says the result is of the previous selection when a kept result of other params shows (#1365)', () => {
    render(<I18nProvider><QueryView query={{ ...refreshing(), showingPrevious: true }}>{() => <p>body</p>}</QueryView></I18nProvider>);
    expect(screen.getByRole('status', { name: '이전 선택의 결과 · 갱신 중' })).toBeVisible();
    expect(screen.queryByText('같은 조건으로 갱신 중')).toBeNull();
  });
  it('names the plain refresh status by its label', () => {
    render(<I18nProvider><QueryView query={refreshing()}>{() => <p>body</p>}</QueryView></I18nProvider>);
    expect(screen.getByRole('status', { name: '같은 조건으로 갱신 중' })).toBeVisible();
  });
  it('is not busy and draws no status once the status is done', () => {
    const { container } = render(<I18nProvider><QueryView query={{ ...refreshing(), status: 'done' }}>{() => <p>body</p>}</QueryView></I18nProvider>);
    expect(screen.queryByRole('status')).toBeNull();
    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'false');
  });
});

describe('previous-selection refresh presentation (#1365 FIXV)', () => {
  const response: ApiResponse<string> = { outcome: 'ok', data: '42', assessments: [], trust: null, correlationId: 'previous' };
  const view = (showingPrevious: boolean, status: 'refreshing' | 'done' = 'refreshing') => <I18nProvider>
    <QueryView query={{ response, refetch: vi.fn(), missing: [], completedAt: null, status, showingPrevious }}>
      {data => <table><thead><tr><th>Value</th><th><button>Open</button></th></tr></thead><tbody><tr><td>{data}</td></tr></tbody></table>}
    </QueryView>
  </I18nProvider>;

  it.each(['standalone', 'compact', 'panel', 'kpi', 'chart', 'breakdown'] as const)('shows readable previous-selection text at the section edge in %s', kind => {
    const content = view(true);
    const { container } = render(kind === 'compact' ? <PageDensityProvider value="compact">{content}</PageDensityProvider>
      : kind === 'panel' ? <InWorkspacePanelProvider value>{content}</InWorkspacePanelProvider>
      : kind === 'standalone' ? content : <AnalysisSectionContext.Provider value={{ title: 'Results', kind, collapse: vi.fn() }}>{content}</AnalysisSectionContext.Provider>);
    const status = screen.getByRole('status', { name: '이전 선택의 결과 · 갱신 중' });
    expect(status).toHaveTextContent('이전 선택의 결과 · 갱신 중');
    expect(status).not.toHaveClass('sr-only');
    expect(status.querySelector('.sr-only')).toBeNull();
    expect(status).toHaveClass('text-xs', 'text-text-secondary', 'bg-surface-sunken');
    expect(status).toHaveClass('absolute', 'right-3', '-top-2.5', 'border', 'border-border-subtle');
    expect(status.parentElement).toBe(container.querySelector('[aria-busy="true"]'));
    expect(status.parentElement).not.toHaveClass('pt-8');
    expect(status.parentElement?.querySelector('.h-8')).toBeNull();
    expect(screen.getByRole('button', { name: 'Open' }).closest('[role="status"]')).toBeNull();
  });

  it('dims only the stale body with a non-interactive tint, leaving text opacity intact', () => {
    const { container } = render(view(true));
    const tint = container.querySelector('[data-query-stale-tint]');
    expect(tint).toHaveClass('pointer-events-none', 'absolute', 'inset-0', 'bg-surface-sunken/20', 'mix-blend-multiply');
    expect(tint).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('42')).toBeVisible();
    expect(container.querySelector('[aria-busy]')).not.toHaveClass('opacity-90');
  });

  it('keeps the same unpadded wrapper and mounted body across live, previous and settled states', () => {
    const result = render(view(false, 'done'));
    const wrapper = result.container.firstElementChild;
    const body = screen.getByRole('table');
    const classes = wrapper?.className;
    expect(wrapper).not.toHaveClass('pt-8');
    expect(screen.queryByRole('status')).toBeNull();
    result.rerender(view(true));
    expect(result.container.firstElementChild?.className).toBe(classes);
    expect(screen.getByRole('table')).toBe(body);
    result.rerender(view(false, 'done'));
    expect(result.container.firstElementChild?.className).toBe(classes);
    expect(screen.getByRole('table')).toBe(body);
    expect(result.container.querySelector('[data-query-stale-tint]')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it.each([undefined, false, true])('reserves no row or padding at rest (showingPrevious=%s)', showingPrevious => {
    const { container } = render(<I18nProvider><QueryView query={{ response, refetch: vi.fn(), missing: [], completedAt: null, status: 'done', showingPrevious }}>{data => <p>{data}</p>}</QueryView></I18nProvider>);
    expect(container.firstElementChild).not.toHaveClass('pt-8');
    expect(container.querySelector('.h-8')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(container.querySelector('[data-query-stale-tint]')).toBeNull();
    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'false');
  });

  it.each([undefined, false])('reserves no row or padding for a same-params refresh (showingPrevious=%s)', showingPrevious => {
    const { container } = render(<I18nProvider><QueryView query={{ response, refetch: vi.fn(), missing: [], completedAt: null, status: 'refreshing', showingPrevious }}>{data => <p>{data}</p>}</QueryView></I18nProvider>);
    expect(container.firstElementChild).not.toHaveClass('pt-8');
    expect(container.querySelector('.h-8')).toBeNull();
    expect(screen.getByRole('status', { name: '같은 조건으로 갱신 중' })).toHaveClass('text-text-muted');
    expect(screen.getByRole('status')).not.toHaveClass('border');
  });

  it.each([true, false])('can suppress a duplicate notice without suppressing busy or stale semantics (previous=%s)', showingPrevious => {
    const renderView = (refreshNotice: 'visible' | 'hidden') => <I18nProvider><QueryView refreshNotice={refreshNotice} query={{ response, refetch: vi.fn(), missing: [], completedAt: null, status: 'refreshing', showingPrevious }}>{data => <p>{data}</p>}</QueryView></I18nProvider>;
    const result = render(renderView('hidden'));
    const body = screen.getByText('42');
    expect(screen.queryByRole('status')).toBeNull();
    expect(result.container.firstElementChild).toHaveAttribute('aria-busy', 'true');
    expect(!!result.container.querySelector('[data-query-stale-tint]')).toBe(showingPrevious);
    result.rerender(renderView('visible'));
    expect(screen.getByRole('status', { name: showingPrevious ? '이전 선택의 결과 · 갱신 중' : '같은 조건으로 갱신 중' })).toBeVisible();
    expect(screen.getByText('42')).toBe(body);
  });

  it('escapes a clipping ancestor without a portal, moving or remounting the result', () => {
    const result = render(<div data-testid="clip">{view(false, 'done')}</div>);
    const clip = screen.getByTestId('clip');
    clip.style.overflow = 'hidden';
    const body = screen.getByRole('table');
    let anchorTop = 40;
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const top = this === clip ? 40 : this.getAttribute('role') === 'status' ? anchorTop - 21 : anchorTop;
      return { top, bottom: top + 200, left: 20, right: 320, width: 300, height: this.getAttribute('role') === 'status' ? 22 : 200, x: 20, y: top, toJSON: () => ({}) };
    });
    const show = vi.fn();
    const hide = vi.fn();
    const oldShow = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'showPopover');
    const oldHide = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'hidePopover');
    Object.defineProperty(HTMLElement.prototype, 'showPopover', { configurable: true, value: show });
    Object.defineProperty(HTMLElement.prototype, 'hidePopover', { configurable: true, value: hide });
    try {
      result.rerender(<div data-testid="clip">{view(true)}</div>);
      const status = screen.getByRole('status', { name: '이전 선택의 결과 · 갱신 중' });
      expect(status.parentElement).toBe(clip.firstElementChild);
      expect(status).toHaveAttribute('popover', 'manual');
      expect(status.style.position).toBe('fixed');
      expect(status.style.top).toBe('19px');
      expect(status).toHaveClass('backdrop:pointer-events-none', 'backdrop:bg-transparent');
      expect(show).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('table')).toBe(body);
      expect(body.parentElement).toHaveAttribute('aria-busy', 'true');
      anchorTop = 30;
      clip.dispatchEvent(new Event('scroll'));
      expect(status.style.top).toBe('9px');
      expect(status.style.visibility).toBe('hidden');
      anchorTop = 41;
      window.dispatchEvent(new Event('resize'));
      expect(status.style.top).toBe('20px');
      expect(status.style.visibility).toBe('visible');
      expect(show).toHaveBeenCalledTimes(1);
      result.rerender(<div data-testid="clip">{view(false, 'done')}</div>);
      expect(hide).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.getByRole('table')).toBe(body);
    } finally {
      rect.mockRestore();
      if (oldShow) Object.defineProperty(HTMLElement.prototype, 'showPopover', oldShow);
      else Reflect.deleteProperty(HTMLElement.prototype, 'showPopover');
      if (oldHide) Object.defineProperty(HTMLElement.prototype, 'hidePopover', oldHide);
      else Reflect.deleteProperty(HTMLElement.prototype, 'hidePopover');
    }
  });

  it('keeps the light label without a stale tint for same-params refetches', () => {
    const { container } = render(view(false));
    expect(screen.getByRole('status', { name: '같은 조건으로 갱신 중' })).toHaveClass('text-text-muted');
    expect(screen.queryByText('이전 선택의 결과 · 갱신 중')).toBeNull();
    expect(container.querySelector('[data-query-stale-tint]')).toBeNull();
  });

  it.each([true, false])('disables spinner motion for reduced motion (previous=%s)', showingPrevious => {
    render(view(showingPrevious));
    expect(screen.getByRole('status').querySelector('svg')).toHaveClass('animate-spin', 'motion-reduce:animate-none');
  });
});
