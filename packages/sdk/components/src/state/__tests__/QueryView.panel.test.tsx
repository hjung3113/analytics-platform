import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { I18nProvider, type QueryState } from '@ap/kernel';
import type { ApiResponse } from '@ap/contracts';
import { QueryView } from '../../StateView';
import { OutcomeBanners, OutcomeScope } from '../../filters/OutcomeScope';
import { QueryBarStatusContext } from '../../filters/QueryBarStatus';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const reply = (outcome: ApiResponse<string>['outcome']): ApiResponse<string> => ({
  outcome, data: outcome === 'ok' ? '결과 A' : null, assessments: [], trust: null,
  correlationId: 'trace-A', ...(outcome === 'error' && { message: 'Server failed', recovery: { retryable: true } }),
});
const query = (status: QueryState<string>['status'], response: ApiResponse<string> | null = null): QueryState<string> =>
  ({ status, response, refetch: vi.fn(), missing: [], completedAt: null });
const panel = { title: '추세', kind: 'chart', height: 400 } as const;
const view = (result: QueryState<string>) => <I18nProvider><QueryView query={result} panel={panel}>{data => <p>{data}</p>}</QueryView></I18nProvider>;

it('keeps the declared plot height and dims the previous success when the read fails', () => {
  const { rerender } = render(view(query('loading')));
  const plot = screen.getByRole('status', { name: '불러오는 중…' }).parentElement;
  expect(plot).toHaveStyle({ minHeight: '400px' });
  rerender(view(query('done', reply('ok'))));
  const result = screen.getByText('결과 A');
  expect(plot).toContainElement(result);
  rerender(view({ ...query('done', reply('error')), previousResult: { response: reply('ok'), completedAt: new Date(2026, 10, 26, 9, 2).getTime() } }));
  expect(plot).toHaveStyle({ minHeight: '400px' });
  expect(plot).toContainElement(result);
  expect(result.parentElement).toHaveClass('opacity-40', 'grayscale');
  expect(result.parentElement).not.toHaveAttribute('inert');
  expect(screen.getByRole('status', { name: '추세' })).toHaveTextContent('불러오지 못함 · 이전 결과 · 09:02');
  expect(screen.getByText('이전 결과 · 09:02')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '불러오지 못함' }));
  expect(screen.getByRole('button', { name: '오류 내용 ▸' })).toBeVisible();
  expect(screen.getByRole('button', { name: '다시 시도' })).toBeVisible();
});

it('reserves a minimum and lets successful content grow without an inner scroll', () => {
  const { rerender } = render(view(query('loading')));
  const plot = screen.getByRole('status', { name: '불러오는 중…' }).parentElement!;
  rerender(view(query('done', reply('ok'))));
  expect(plot).toContainElement(screen.getByText('결과 A'));
  expect(plot).toHaveStyle({ minHeight: '400px' });
  expect(plot.style.height).toBe('');
  expect(plot.style.maxHeight).toBe('');
  expect(plot).not.toHaveClass('overflow-auto', 'overflow-y-auto', 'overflow-scroll', 'overflow-y-scroll');
});

it('draws faint, short bars against the chart placeholder axis', () => {
  render(view(query('loading')));
  const skeleton = screen.getByRole('status', { name: '불러오는 중…' });
  const bars = [...skeleton.querySelectorAll('.bg-border-row')].map(bar => bar.parentElement);
  expect(bars).toHaveLength(6);
  expect(bars[0]?.parentElement).toHaveClass('border-b', 'border-l', 'h-40');
  for (const bar of bars) expect(bar).toHaveClass('opacity-70');
  expect(bars[3]).toHaveClass('h-1/2');
});

it.each([
  { lang: 'ko', width: 500, elapsed: '조회 중 · 3초', slow: '오래 걸립니다', narrow: '조건 좁히기', cancel: '취소', menu: '추세 더보기' },
  { lang: 'en', width: 500, elapsed: 'Loading · 3s', slow: 'Taking longer', narrow: 'Narrow conditions', cancel: 'Cancel', menu: 'More for 추세' },
  { lang: 'ko', width: 800, elapsed: '조회 중 · 3초', slow: '오래 걸립니다', narrow: '조건 좁히기', cancel: '취소', menu: null },
])('signals at three and ten seconds and fits $lang actions at $width px', ({ lang, width, elapsed, slow, narrow, cancel: cancelLabel, menu }) => {
  vi.useFakeTimers();
  const storage = memoryStorage();
  storage.setItem('platform:lang', lang);
  vi.stubGlobal('localStorage', storage);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValueOnce(DOMRect.fromRect({ width }));
  const cancel = vi.fn();
  const focus = vi.fn();
  render(<QueryBarStatusContext.Provider value={{ status: null, report: vi.fn(), editorFocus: focus }}>
    {view({ ...query('loading'), cancel })}
  </QueryBarStatusContext.Provider>);
  vi.restoreAllMocks();
  expect(screen.getByRole('heading', { name: '추세' })).toHaveClass('min-w-16');
  act(() => vi.advanceTimersByTime(2999));
  expect(screen.queryByText(elapsed)).toBeNull();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByText(elapsed)).toBeVisible();
  act(() => vi.advanceTimersByTime(7000));
  expect(screen.getByText(slow).parentElement).toHaveClass('whitespace-nowrap');
  if (menu) {
    expect(screen.queryByRole('button', { name: narrow })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: menu }));
  }
  fireEvent.click(screen.getByRole('button', { name: narrow }));
  if (menu) fireEvent.click(screen.getByRole('button', { name: menu }));
  fireEvent.click(screen.getByRole('button', { name: cancelLabel }));
  expect(focus).toHaveBeenCalledOnce();
  expect(cancel).toHaveBeenCalledOnce();
});

it('shows one shared-policy action and focuses the panel when retrying from the popover', () => {
  const failure = query('done', reply('error'));
  const { rerender } = render(view(failure));
  expect(screen.getAllByRole('button', { name: '다시 시도' })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: '불러오지 못함' }));
  expect(within(screen.getByRole('dialog')).queryByRole('button', { name: '다시 시도' })).toBeNull();
  rerender(view({ ...failure, response: { ...reply('error'), recovery: { retryable: true, maxHours: 24 } } }));
  expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();
  rerender(view({ ...failure, previousResult: { response: reply('ok'), completedAt: Date.now() } }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '다시 시도' }));
  expect(failure.refetch).toHaveBeenCalledOnce();
  expect(screen.getByRole('region', { name: '추세' })).toHaveFocus();
});

it.each([
  { lang: 'ko', failed: '불러오지 못함', retry: '다시 시도', menu: '추세 더보기' },
  { lang: 'en', failed: 'Could not load', retry: 'Retry', menu: 'More for 추세' },
])('keeps the first error reachable and moves recovery into More at 280 px ($lang)', async ({ lang, failed, retry, menu }) => {
  const storage = memoryStorage();
  storage.setItem('platform:lang', lang);
  vi.stubGlobal('localStorage', storage);
  const measure = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValueOnce(DOMRect.fromRect({ width: 280 }));
  const failure = query('done', reply('error'));
  render(view(failure));
  measure.mockRestore();
  const header = screen.getByRole('heading', { name: '추세' }).closest('header')!;
  const error = within(header).getByRole('button', { name: failed });
  expect(error).toHaveTextContent(failed);
  expect(error).toBeVisible();
  await userEvent.tab();
  expect(error).toHaveFocus();
  expect(within(header).queryByRole('button', { name: retry })).toBeNull();
  fireEvent.click(within(header).getByRole('button', { name: menu }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: retry }));
  expect(failure.refetch).toHaveBeenCalledOnce();
  expect(screen.getByRole('region', { name: '추세' })).toHaveFocus();
});

it('keeps the first-error retry in the header of a half-width panel (540 px)', () => {
  const measure = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValueOnce(DOMRect.fromRect({ width: 540 }));
  const failure = query('done', reply('error'));
  render(view(failure));
  measure.mockRestore();
  const header = screen.getByRole('heading', { name: '추세' }).closest('header')!;
  fireEvent.click(within(header).getByRole('button', { name: '다시 시도' }));
  expect(failure.refetch).toHaveBeenCalledOnce();
});

it('offers cancellation in More for a hidden refresh notice without announcing it twice', () => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  render(<I18nProvider>
    <QueryView query={{ ...query('refreshing', reply('ok')), cancel }} panel={panel} refreshNotice="hidden">{data => data}</QueryView>
  </I18nProvider>);
  act(() => vi.advanceTimersByTime(3_000));
  expect(screen.queryByText('조회 중 · 3초')).toBeNull();
  act(() => vi.advanceTimersByTime(7_000));
  expect(screen.queryByText('오래 걸립니다')).toBeNull();
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.queryByRole('button', { name: '취소' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '추세 더보기' }));
  const menu = within(screen.getByRole('dialog'));
  expect(menu.queryByText('오래 걸립니다')).toBeNull();
  fireEvent.click(menu.getByRole('button', { name: '취소' }));
  expect(cancel).toHaveBeenCalledOnce();
});

it('keeps emptyAction and hides only the refresh notice when requested', () => {
  vi.useFakeTimers();
  const ui = (result: QueryState<string>) => <I18nProvider>
    <QueryView query={result} panel={panel} emptyAction={<button type="button">조건 초기화</button>} refreshNotice="hidden">{data => data}</QueryView>
  </I18nProvider>;
  const { rerender } = render(ui(query('done', reply('empty'))));
  expect(screen.getByRole('button', { name: '조건 초기화' })).toBeVisible();
  rerender(ui({ ...query('refreshing', reply('ok')), showingPrevious: true }));
  act(() => vi.advanceTimersByTime(10_000));
  expect(screen.queryByText('오래 걸립니다')).toBeNull();
  expect(screen.getByText('결과 A').closest('[aria-busy="true"]')).toBeInTheDocument();
  expect(screen.getByText('결과 A')).toHaveClass('opacity-40');
});

it('keeps four KPI columns and the same source footer through a zero result', () => {
  const columns = ['가동률', '체류', '사이클', '처리량'];
  const renderKpi = (result: QueryState<string>) => <I18nProvider><QueryView query={result} panel={{ title: '지표', kind: 'kpi', height: 128, columns }}>
    {() => columns.map(label => <p key={label}>{label}</p>)}
  </QueryView></I18nProvider>;
  const { rerender } = render(renderKpi(query('loading')));
  const footer = screen.getByText('원천', { exact: false }).closest('footer');
  const plot = screen.getByRole('status', { name: '불러오는 중…' }).parentElement;
  for (const result of [query('done', reply('ok')), query('done', reply('empty'))]) {
    rerender(renderKpi(result));
    expect(plot).toHaveStyle({ minHeight: '128px' });
    expect(footer).toBeInTheDocument();
    for (const label of columns) expect(screen.getByText(label)).toBeVisible();
  }
  expect(screen.getByText('결과 0건')).toBeVisible();
});

it.each([
  [query('loading'), '확인 중'],
  [query('done', reply('error')), '확인 불가'],
  [query('done', reply('empty')), '결과 없음'],
])('continues to report data trust for %s', (result, label) => {
  render(view(result));
  expect(screen.getByText(label)).toBeVisible();
});

it('keeps describing the drawn result instead of «확인 중» while it refreshes', () => {
  render(view({ ...query('refreshing', reply('ok')), showingPrevious: true }));
  expect(screen.getByText('결과 A')).toBeInTheDocument();
  expect(screen.queryByText('확인 중')).toBeNull();
});

it('identifies an empty selection and clears only that selection on request', () => {
  const clear = vi.fn();
  render(<I18nProvider><QueryView query={query('done', reply('empty'))} panel={{ ...panel, selection: { label: '추세 02:00–04:00', clear } }}>
    {data => data}
  </QueryView></I18nProvider>);
  expect(screen.getByText('선택 추세 02:00–04:00에 해당하는 데이터 없음')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '선택 지우기' }));
  expect(clear).toHaveBeenCalledOnce();
});

it('names panels in one shared banner, moves focus, and retries individually or together', () => {
  const first = query('done', reply('error'));
  const second = query('done', reply('error'));
  render(<I18nProvider><OutcomeScope><OutcomeBanners compact />
    <QueryView query={first} panel={panel}>{data => data}</QueryView>
    <QueryView query={second} panel={{ ...panel, title: '표' }}>{data => data}</QueryView>
  </OutcomeScope></I18nProvider>);
  const banner = screen.getByRole('group', { name: '패널 상태 요약' });
  fireEvent.click(within(banner).getByRole('button', { name: '표' }));
  const table = screen.getByRole('region', { name: '표' });
  expect(table).toHaveFocus();
  fireEvent.click(within(table).getAllByRole('button', { name: '다시 시도' })[0]);
  expect(second.refetch).toHaveBeenCalledOnce();
  expect(first.refetch).not.toHaveBeenCalled();
  fireEvent.click(within(banner).getByRole('button', { name: '모두 다시 시도' }));
  expect(first.refetch).toHaveBeenCalledOnce();
  expect(second.refetch).toHaveBeenCalledTimes(2);
});

it.each([
  ['too_large', '조회 과대', 'Row limit exceeded'],
  ['forbidden', '권한 없음', 'Missing capability'],
] as const)('names a grouped %s in the panel header and keeps its technical information (#3068)', (outcome, label, message) => {
  const refusal = query('done', { ...reply(outcome), message });
  const failure = query('done', reply('error'));
  render(<I18nProvider><OutcomeScope><OutcomeBanners compact />
    <QueryView query={refusal} panel={panel}>{data => data}</QueryView>
    <QueryView query={refusal} panel={{ ...panel, title: '표' }}>{data => data}</QueryView>
    <QueryView query={failure} panel={{ ...panel, title: '오류 지표' }}>{data => data}</QueryView>
    <QueryView query={failure} panel={{ ...panel, title: '오류 추세' }}>{data => data}</QueryView>
  </OutcomeScope></I18nProvider>);
  const failurePanel = within(screen.getByRole('region', { name: '오류 지표' }));
  const failureButton = failurePanel.getByRole('button', { name: '불러오지 못함' });
  expect(failureButton.querySelector('svg')).toHaveClass('text-text-danger');
  expect(failurePanel.getByRole('group', { name: '오류 지표' })).toHaveTextContent('불러오지 못함');
  expect(failurePanel.queryByRole('alert')).toBeNull();

  const refusalPanel = within(screen.getByRole('region', { name: '추세' }));
  const header = within(refusalPanel.getByRole('heading', { name: '추세' }).closest('header')!);
  const status = header.getByRole('button', { name: label });
  expect(status).toHaveTextContent(label);
  expect(status.querySelector('svg')).toBeNull();
  expect(refusalPanel.getByText(`위 안내 참고(${label})`)).toBeVisible();
  expect(refusalPanel.queryByText('불러오지 못함')).toBeNull();
  expect(refusalPanel.queryByRole('alert')).toBeNull();
  expect(refusalPanel.queryByText(message)).toBeNull();
  fireEvent.click(status);
  const details = within(screen.getByRole('dialog', { name: label }));
  expect(details.queryByRole('note')).toBeNull();
  fireEvent.click(details.getByRole('button', { name: /기술 정보/ }));
  const note = details.getByRole('note', { name: '서버 세부' });
  expect(note).toHaveTextContent('추적 번호: trace-A');
  expect(note).toHaveTextContent(message);
});
