import { StrictMode, useState, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, type QueryState } from '@ap/kernel';
import type { ApiResponse, Assessment } from '@ap/contracts';
import { OutcomeBanners, OutcomeScope, useSharedOutcome } from '../OutcomeScope';
import { OutcomeView, QueryView, StateMessage } from '../../StateView';
import { DetailDrawer } from '../../drawer/DetailDrawer';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { useI18n } from '@ap/kernel';

const response = (outcome: ApiResponse<unknown>['outcome'] = 'error', message = 'Same response', assessments: Assessment[] = []): ApiResponse<unknown> =>
  ({ outcome, message, assessments, data: null, trust: null, correlationId: 'corr-widget' });
const query = (r = response(), retry = vi.fn()): QueryState<unknown> => ({ response: r, refetch: retry, missing: [], completedAt: null, status: 'done' });
const Widget = ({ q, name = 'Widget A', hide = false }: { q: QueryState<unknown>; name?: string; hide?: boolean }) =>
  <QueryView query={q} widgetName={name} hideWidgetName={hide}>{() => <p>Success</p>}</QueryView>;
const Page = ({ children }: { children: ReactNode }) => <I18nProvider><div data-outcome-focus-target role="region" aria-label="Page content" tabIndex={-1}><OutcomeScope><OutcomeBanners />{children}</OutcomeScope></div></I18nProvider>;
function textWithoutDetail(node: HTMLElement) {
  const clone = node.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[role="note"]').forEach(note => note.remove());
  return clone.textContent ?? '';
}
afterEach(cleanup);

it('unregisters grouped outcomes when their queries become idle without leaving a retry banner', () => {
  const first = query(); const second = query();
  const view = render(<Page><Widget q={first} /><Widget q={second} name="Widget B" /></Page>);
  expect(screen.getByRole('group', { name: '위젯 상태 요약' })).toBeVisible();
  const idle: QueryState<unknown> = { status: 'idle', response: null, completedAt: null, missing: [], refetch: vi.fn() };
  view.rerender(<Page><Widget q={idle} /><Widget q={idle} name="Widget B" /></Page>);
  expect(screen.queryByRole('group', { name: '위젯 상태 요약' })).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();
  expect(screen.getAllByText('아직 조회하지 않았습니다')).toHaveLength(2);
});

describe('shared outcome contract #55', () => {
  it('announces one error banner, preserves named compact states and retries exactly its members', () => {
    const a = query(); const b = query(); const other = query(response('error', 'Different'));
    render(<StrictMode><Page><Widget q={a} /><Widget q={b} name="Widget B" /><Widget q={other} name="Other" /></Page></StrictMode>);
    const banner = screen.getByRole('group', { name: '위젯 상태 요약' });
    expect(banner).toHaveTextContent('위젯 2개에서 같은 응답(서버 오류)이 확인되었습니다.');
    expect(banner).not.toHaveTextContent('corr-widget');
    expect(within(banner).getAllByRole('button')).toHaveLength(1);
    for (const name of ['Widget A', 'Widget B']) {
      const state = screen.getByRole('group', { name });
      expect(state).toHaveTextContent(name);
      expect(within(state).getByRole('note', { name: '서버 세부' })).toHaveTextContent('Same response');
      expect(textWithoutDetail(state)).not.toContain('Same response');
      expect(state).toHaveTextContent('corr-widget');
      expect(within(state).queryByRole('alert')).toBeNull();
    }
    fireEvent.click(within(banner).getByRole('button', { name: '다시 시도' }));
    expect(a.refetch).toHaveBeenCalledTimes(1); expect(b.refetch).toHaveBeenCalledTimes(1); expect(other.refetch).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('group', { name: 'Widget A' })).getByRole('button', { name: '다시 시도' }));
    expect(a.refetch).toHaveBeenCalledTimes(2); expect(b.refetch).toHaveBeenCalledTimes(1);
  });
  it('uses a neutral empty banner and keeps confirmed explanations, individual retry and ID', () => {
    const assessments: Assessment[] = [{ kind: 'collection', state: 'confirmed', explainsEmpty: true, detail: 'Confirmed explanation', statusSource: 'worker', observedAt: '2026-10-04' }];
    render(<Page><Widget q={query(response('empty', '', assessments))} /><Widget q={query(response('empty', '', assessments))} name="Widget B" /></Page>);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('group', { name: '위젯 상태 요약' })).toHaveTextContent('위젯 2개');
    const state = screen.getByRole('group', { name: 'Widget A' });
    expect(state).toHaveTextContent('Confirmed explanation'); expect(state).toHaveTextContent('corr-widget');
    expect(within(state).getByRole('button', { name: '다시 시도' })).toBeVisible();
  });
  it('does not group different messages or explanation evidence', () => {
    const a: Assessment = { kind: 'collection', state: 'confirmed', explainsEmpty: true, detail: 'one', statusSource: 'worker', observedAt: '2026-10-04' };
    render(<Page><Widget q={query(response('error', 'one'))} /><Widget q={query(response('error', 'two'))} />
      <Widget q={query(response('empty', '', [a]))} /><Widget q={query(response('empty', '', [{ ...a, statusSource: 'other' }]))} /></Page>);
    expect(screen.queryByRole('group', { name: '위젯 상태 요약' })).toBeNull();
    expect(screen.queryByRole('group', { name: '위젯 상태 요약' })).toBeNull();
    expect(screen.queryByRole('group')).toBeNull();
  });
  it.each(['forbidden', 'too_large', 'ok', 'unknown'] as const)('never groups %s', outcome => {
    const r = response(outcome as ApiResponse<unknown>['outcome']);
    render(<Page><Widget q={query(r)} /><Widget q={query(r)} /></Page>);
    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.queryByRole('group', { name: '위젯 상태 요약' })).toBeNull();
    expect(screen.queryByRole('group', { name: '위젯 상태 요약' })).toBeNull();
  });
  it('keeps a single failure full, and unregisters on unmount', () => {
    const a = query(); const b = query();
    const view = render(<Page><Widget q={a} /><Widget q={b} name="Widget B" /></Page>);
    expect(screen.getByRole('group', { name: '위젯 상태 요약' })).toBeVisible();
    view.rerender(<Page><Widget q={a} /></Page>);
    expect(screen.queryByRole('group', { name: '위젯 상태 요약' })).toBeNull();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveClass('min-h-24');
  });
  it('keeps standalone QueryViews unchanged', () => {
    render(<I18nProvider><Widget q={query()} /><Widget q={query()} /></I18nProvider>);
    expect(screen.getAllByRole('alert')).toHaveLength(2); expect(screen.queryByRole('group')).toBeNull();
  });
  it('shows timeout advice directly and omits duplicate widget headings', () => {
    render(<Page><h2>Widget A</h2><Widget q={query(response('timeout'))} hide /><Widget q={query(response('timeout'))} name="Widget B" /></Page>);
    expect(screen.getAllByText('Widget A')).toHaveLength(1);
    expect(screen.getByRole('group', { name: 'Widget A' })).toHaveTextContent('기간을 줄이거나 집계 단위를 키워 다시 시도하세요.');
    expect(within(screen.getByRole('group', { name: 'Widget A' })).getByRole('note', { name: '서버 세부' })).toHaveTextContent('Same response');
    expect(textWithoutDetail(screen.getByRole('group', { name: 'Widget A' }))).not.toContain('Same response');
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('orders every qualifying group largest first and updates on response changes', () => {
    const a = query(); const b = query(); const c = query(); const empty = query(response('empty'));
    const view = render(<Page><Widget q={empty} /><Widget q={empty} /><Widget q={a} /><Widget q={b} /><Widget q={c} /></Page>);
    const banners = view.container.querySelectorAll('[data-outcome-banner]');
    expect(banners).toHaveLength(2); expect(banners[0]).toHaveTextContent('위젯 3개'); expect(banners[1]).toHaveTextContent('위젯 2개');
    view.rerender(<Page><Widget q={{ ...a, response: null, missing: [], completedAt: null, status: 'loading' }} /><Widget q={b} /></Page>);
    expect(view.container.querySelectorAll('[data-outcome-banner]')).toHaveLength(0);
  });
  it('keeps neighboring page scopes isolated', () => {
    render(<I18nProvider><OutcomeScope><OutcomeBanners /><Widget q={query()} /></OutcomeScope>
      <OutcomeScope><OutcomeBanners /><Widget q={query()} /></OutcomeScope></I18nProvider>);
    expect(screen.queryByRole('group', { name: '위젯 상태 요약' })).toBeNull();
    expect(screen.getAllByRole('alert')).toHaveLength(2);
  });
  it('groups reordered confirmed explanations but ignores unconfirmed findings', () => {
    const a: Assessment = { kind: 'collection', state: 'confirmed', explainsEmpty: true, detail: 'a', statusSource: 'worker', observedAt: '2026-10-04' };
    const b: Assessment = { ...a, kind: 'processing_delay', detail: 'b' };
    render(<Page><Widget q={query(response('empty', '', [a, b]))} />
      <Widget q={query(response('empty', '', [b, a, { kind: 'coverage', state: 'unknown', reason: 'source_unavailable' }]))} /></Page>);
    expect(screen.getByRole('group', { name: '위젯 상태 요약' })).toHaveTextContent('위젯 2개');
  });

});


describe('Fix round 1 regressions', () => {
  it('never commits transient widget alerts on fresh grouped retry responses', async () => {
    const a = query(); const b = query();
    const view = render(<Page><Widget q={a} /><Widget q={b} name="Widget B" /></Page>);
    const alerts: Element[] = [];
    const collect = (node: Node) => {
      if (node instanceof Element) {
        if (node.matches('[role="alert"]:not([data-outcome-banner])')) alerts.push(node);
        alerts.push(...node.querySelectorAll('[role="alert"]:not([data-outcome-banner])'));
      }
    };
    const observer = new MutationObserver(records => records.forEach(record => {
      if (record.type === 'attributes') collect(record.target);
      record.addedNodes.forEach(collect);
    }));
    observer.observe(view.container, { subtree: true, childList: true, attributes: true });
    view.rerender(<Page><Widget q={{ ...a, response: response() }} /><Widget q={{ ...b, response: response() }} name="Widget B" /></Page>);
    await act(async () => { await Promise.resolve(); });
    observer.disconnect();
    expect(alerts).toHaveLength(0);
  });
  it('renders the second matching arrival compact on its first commit', async () => {
    const a = query(); const b = query();
    const view = render(<Page><Widget q={a} /><Widget q={{ ...b, response: null, missing: [], completedAt: null, status: 'loading' }} name="Widget B" /></Page>);
    const alerts: Element[] = [];
    const observer = new MutationObserver(records => records.forEach(record => {
      if (record.attributeName === 'role' && record.oldValue === 'alert' && record.target instanceof Element) alerts.push(record.target);
      record.addedNodes.forEach(node => {
        if (node instanceof Element) {
          if (node.matches('[role="alert"]')) alerts.push(node);
          alerts.push(...node.querySelectorAll('[role="alert"]'));
        }
      });
    }));
    observer.observe(view.container, { subtree: true, childList: true, attributes: true, attributeOldValue: true });
    view.rerender(<Page><Widget q={a} /><Widget q={b} name="Widget B" /></Page>);
    await act(async () => { await Promise.resolve(); });
    observer.disconnect(); expect(alerts).toHaveLength(0);
  });
  it('announces group refreshing once and guards a second activation while pending', () => {
    const retries = [vi.fn(), vi.fn()];
    function Retrying() {
      const [pending, setPending] = useState(false);
      const [r] = useState(response);
      return <Page>{retries.map((retry, i) => <Widget key={i} name={`Widget ${i}`} q={{ missing: [], completedAt: null, response: r, status: pending ? 'refreshing' : 'done', refetch: () => { retry(); setPending(true); } }} />)}</Page>;
    }
    const view = render(<Retrying />);
    const button = within(screen.getByRole('group', { name: '위젯 상태 요약' })).getByRole('button');
    button.focus(); fireEvent.click(button); fireEvent.click(button);
    expect(retries[0]).toHaveBeenCalledTimes(1); expect(retries[1]).toHaveBeenCalledTimes(1);
    expect(button).toHaveFocus(); expect(button).toHaveAttribute('aria-busy', 'true'); expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveTextContent('다시 시도');
    expect(view.container.querySelectorAll('[aria-busy="true"]')).toHaveLength(3);
    const live = [...view.container.querySelectorAll('[aria-live], [role="status"]')].filter(node => node.textContent?.includes('같은 조건으로 갱신 중'));
    expect(live).toHaveLength(1); expect(live[0]).toHaveAttribute('aria-live', 'assertive');
  });
  it.each(['error', 'empty'] as const)('keeps the %s announcement channel mounted before qualification', outcome => {
    const a = query(response(outcome)); const b = query(response(outcome));
    const view = render(<Page><Widget q={a} /></Page>);
    const channel = view.container.querySelector(`[data-outcome-announcer="${outcome === 'empty' ? 'polite' : 'assertive'}"]`);
    expect(channel).not.toBeNull(); expect(channel).toBeEmptyDOMElement();
    view.rerender(<Page><Widget q={a} /><Widget q={b} name="Widget B" /></Page>);
    expect(view.container.querySelector(`[data-outcome-announcer="${outcome === 'empty' ? 'polite' : 'assertive'}"]`)).toBe(channel);
    expect(channel).toHaveTextContent('위젯 2개에서 같은 응답');
    const banner = screen.getByRole('group', { name: '위젯 상태 요약' });
    expect(banner).not.toHaveAttribute('aria-live'); expect(banner).not.toHaveAttribute('role', 'alert');
  });
  it.each(['recovered', 'single'] as const)('returns focus to a stable target on %s', result => {
    const a = query(); const b = query();
    const view = render(<Page><Widget q={a} /><Widget q={b} name="Widget B" /></Page>);
    within(screen.getByRole('group', { name: '위젯 상태 요약' })).getByRole('button').focus();
    view.rerender(<Page><Widget q={result === 'single' ? a : query(response('ok'))} /><Widget q={query(response('ok'))} name="Widget B" /></Page>);
    expect(screen.getByRole('region', { name: 'Page content' })).toHaveFocus();
  });
  it.each([['main', true], ['page content', false]] as const)('inside the platform layout returns focus to %s without an extra landmark', (_, withMain) => {
    const a = query(); const b = query();
    const Layout = ({ children }: { children: ReactNode }) => {
      const content = <div data-platform-page-content tabIndex={-1}><OutcomeScope><OutcomeBanners />{children}</OutcomeScope></div>;
      return <I18nProvider>{withMain ? <main tabIndex={-1}>{content}</main> : content}</I18nProvider>;
    };
    const view = render(<Layout><Widget q={a} /><Widget q={b} name="Widget B" /></Layout>);
    within(screen.getByRole('group', { name: '위젯 상태 요약' })).getByRole('button').focus();
    view.rerender(<Layout><Widget q={query(response('ok'))} /><Widget q={query(response('ok'))} name="Widget B" /></Layout>);
    const expected = withMain ? screen.getByRole('main') : view.container.querySelector<HTMLElement>('[data-platform-page-content]')!;
    expect(expected).toHaveFocus();
    expect(screen.queryByRole('region')).toBeNull();
  });
  it('does not steal focus that has moved out of the banner', () => {
    const a = query(); const b = query();
    const view = render(<Page><button>Elsewhere</button><Widget q={a} /><Widget q={b} /></Page>);
    const outside = screen.getByRole('button', { name: 'Elsewhere' }); outside.focus();
    view.rerender(<Page><button>Elsewhere</button><Widget q={query(response('ok'))} /><Widget q={query(response('ok'))} /></Page>);
    expect(outside).toHaveFocus();
  });
  it('does not re-render successful widget children for an unrelated registration', () => {
    let renderCount = 0;
    const b = query(response('ok'));
    function ChangingA() {
      const [r, setResponse] = useState(response);
      return <><button onClick={() => setResponse(response('error', 'new message'))}>Change A</button><Widget q={query(r)} /></>;
    }
    render(<Page><ChangingA /><Widget q={query(response('error', 'new message'))} name="Peer C" /><QueryView query={b} widgetName="B">{() => { renderCount++; return <p>Stable B</p>; }}</QueryView></Page>);
    const before = renderCount; fireEvent.click(screen.getByRole('button', { name: 'Change A' }));
    expect(renderCount).toBe(before);
  });
  it('omits invented names and labels for unnamed grouped widgets', () => {
    const view = render(<Page><QueryView query={query()}>{() => null}</QueryView><QueryView query={query()}>{() => null}</QueryView></Page>);
    const states = view.container.querySelectorAll('[data-widget-state]'); expect(states).toHaveLength(2);
    for (const state of states) { expect(state).not.toHaveAttribute('aria-label'); expect(state).not.toHaveAttribute('aria-labelledby'); }
    expect(screen.queryByText('위젯', { exact: true })).toBeNull();
  });
  it('names visible widgets through their non-heading label, and hidden names via aria-label', () => {
    render(<Page><Widget q={query()} /><Widget q={query()} name="Widget B" hide /></Page>);
    const a = screen.getByRole('group', { name: 'Widget A' }); const b = screen.getByRole('group', { name: 'Widget B' });
    expect(a).toHaveAttribute('aria-labelledby'); expect(a).not.toHaveAttribute('aria-label');
    expect(document.getElementById(a.getAttribute('aria-labelledby')!)?.tagName).toBe('P');
    expect(b).toHaveAttribute('aria-label', 'Widget B'); expect(b).not.toHaveAttribute('aria-labelledby');
    expect(within(a).queryByRole('heading')).toBeNull();
  });
});

function DrawerSlot() {
  const host = useDetailPanelSlotHost();
  return <aside ref={host.ref} aria-label="Drawer slot" />;
}

describe('Fix round 1 boundaries', () => {
  it('isolates matching page and drawer failures, with drawer-local banners', () => {
    const a = query(); const b = query(); const c = query();
    const makePage = (two: boolean) => <Page><DetailPanelSlotProvider><Widget q={a} />
      <DetailDrawer title="Drawer" onClose={() => {}} tabs={[{ id: 'one', label: 'Details', content: <><Widget q={b} name="Drawer B" />{two && <Widget q={c} name="Drawer C" />}</> }]} />
      <DrawerSlot /></DetailPanelSlotProvider></Page>;
    const view = render(makePage(false));
    expect(view.container.querySelectorAll('[data-outcome-banner]')).toHaveLength(0);
    expect(view.container.querySelectorAll('[data-widget-state]')).toHaveLength(0);
    view.rerender(makePage(true));
    const dialog = screen.getByRole('dialog', { name: 'Drawer' });
    expect(within(dialog).getByRole('group', { name: '위젯 상태 요약' })).toHaveTextContent('위젯 2개');
    expect(view.container.querySelectorAll('[data-outcome-banner]')).toHaveLength(1);
    expect(screen.getAllByRole('alert')).toHaveLength(1); // The page failure is still full.
  });
  it('does not expose grouping through the standalone public APIs', () => {
    // @ts-expect-error Scope-only grouping cannot be supplied to StateMessage.
    const state = <StateMessage grouped widgetName="Bypass" icon={null} title="State" tone="danger" />;
    // @ts-expect-error Scope-only grouping cannot be supplied to OutcomeView.
    const outcome = <OutcomeView grouped widgetName="Bypass" response={response()} onRetry={() => {}}>{() => null}</OutcomeView>;
    render(<I18nProvider>{state}{outcome}</I18nProvider>);
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(screen.queryByRole('group')).toBeNull();
  });
  it('uses dictionary interpolation and translations for group summary and region labels', () => {
    function Language() {
      const { setLang } = useI18n();
      return <><button onClick={() => setLang('en')}>English</button><button onClick={() => setLang('ko')}>Korean</button></>;
    }
    const view = render(<Page><Language /><Widget q={query()} /><Widget q={query()} name="Widget B" /></Page>);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('group', { name: 'Widget state summary' })).toHaveTextContent('2 widgets report the same response (server error).');
    expect(view.container.querySelector('[aria-live="assertive"]')).toHaveTextContent('2 widgets report the same response (server error).');
    fireEvent.click(screen.getByRole('button', { name: 'Korean' }));
  });
});


describe('Fix round 1 refresh settlement', () => {
  it('keeps retry guarded until all members settle, then restores retry without losing focus', () => {
    const a = query(); const b = query();
    const page = (qa: QueryState<unknown>, qb: QueryState<unknown>) => <Page><Widget q={qa} /><Widget q={qb} name="Widget B" /></Page>;
    const view = render(page(a, b));
    const button = within(screen.getByRole('group', { name: '위젯 상태 요약' })).getByRole('button');
    button.focus(); fireEvent.click(button);
    view.rerender(page({ ...a, missing: [], completedAt: null, status: 'refreshing' }, { ...b, missing: [], completedAt: null, status: 'refreshing' }));
    const settledA = { ...a, response: response() }; const settledB = { ...b, response: response() };
    view.rerender(page(settledA, { ...b, missing: [], completedAt: null, status: 'refreshing' }));
    expect(button).toHaveAttribute('aria-busy', 'true'); fireEvent.click(button);
    expect(a.refetch).toHaveBeenCalledTimes(1); expect(b.refetch).toHaveBeenCalledTimes(1);
    view.rerender(page(settledA, settledB));
    expect(button).toHaveAttribute('aria-busy', 'false'); expect(button).toHaveFocus();
    fireEvent.click(button); expect(a.refetch).toHaveBeenCalledTimes(2); expect(b.refetch).toHaveBeenCalledTimes(2);
  });
});


describe('Fix round 1 peer lookup', () => {
  it('recognizes a matching peer before the new response is registered', () => {
    const decisions: boolean[] = [];
    function Arrival({ q }: { q: QueryState<unknown> }) {
      const grouped = useSharedOutcome(q.response, q.refetch, 'Arrival', q.status);
      if (q.response) decisions.push(grouped);
      return <span>{grouped ? 'Compact arrival' : 'Full arrival'}</span>;
    }
    const a = query(); const b = query();
    const view = render(<Page><Widget q={a} /><Arrival q={{ ...b, response: null, missing: [], completedAt: null, status: 'loading' }} /></Page>);
    view.rerender(<Page><Widget q={a} /><Arrival q={b} /></Page>);
    expect(decisions[0]).toBe(true);
  });
});

describe('server message is detail, not the body (#304)', () => {
  it.each([
    ['error', 'time_domain_unverified: MEM-PHOTO-0103, MEM-PHOTO-0105', ['함께 집계할 수 없습니다', '설비를 좁히거나 기간을 줄이세요']],
    ['timeout', 'Upstream mart query failed', ['조회가 제한 시간 안에 끝나지 않았습니다', '기간을 줄이거나 집계 단위를 키워 다시 시도하세요']],
    ['empty', 'same empty message', ['조건에 맞는 결과가 없습니다', '조회는 성공했고 결과가 0건입니다']],
  ] as const)('groups two %s widgets and keeps the server message in each named detail', (outcome, message, phrases) => {
    const q = () => query(response(outcome, message));
    render(<Page><Widget q={q()} /><Widget q={q()} name="Widget B" /></Page>);
    const summary = screen.getByRole('group', { name: '위젯 상태 요약' });
    expect(summary).toBeTruthy();
    expect(within(summary).queryByRole('alert')).toBeNull();
    expect(within(summary).queryByRole('status')).toBeNull();
    for (const name of ['Widget A', 'Widget B']) {
      const state = screen.getByRole('group', { name });
      expect(within(state).queryByRole('alert')).toBeNull();
      expect(within(state).queryByRole('status')).toBeNull();
      const body = textWithoutDetail(state);
      for (const phrase of phrases) expect(body).toContain(phrase);
      expect(body).not.toContain(message);
      expect(within(state).getByRole('note', { name: '서버 세부' })).toHaveTextContent(message);
      expect(state).toHaveTextContent('corr-widget');
      expect(within(state).getByRole('button', { name: '다시 시도' })).toBeTruthy();
    }
  });

  it('keeps a confirmed empty explanation in the body and the server message in the detail', () => {
    const assessments: Assessment[] = [{ kind: 'collection', state: 'confirmed', explainsEmpty: true, detail: 'Confirmed explanation', statusSource: 'worker', observedAt: '2026-10-04' }];
    const message = 'same empty message';
    render(<Page><Widget q={query(response('empty', message, assessments))} /><Widget q={query(response('empty', message, assessments))} name="Widget B" /></Page>);
    const state = screen.getByRole('group', { name: 'Widget A' });
    expect(textWithoutDetail(state)).toContain('Confirmed explanation');
    expect(textWithoutDetail(state)).not.toContain(message);
    expect(within(state).getByRole('note', { name: '서버 세부' })).toHaveTextContent(message);
  });
});

describe('required text keeps the allowed foreground without opacity fade (#301)', () => {
  const hasFade = (el: Element, prefix: 'opacity-' | 'text-text-') => Array.from(el.classList).some(c => c.startsWith(prefix));
  it('renders a standalone neutral StateMessage body and Correlation ID unfaded, inheriting secondary', () => {
    render(<I18nProvider><StateMessage icon={null} title="상태" body="본문 설명" correlationId="corr-standalone" /></I18nProvider>);
    const root = screen.getByRole('status');
    expect(root).toHaveClass('text-text-secondary'); // sunken surface pairing: the required text inherits secondary
    const body = within(root).getByText('본문 설명');
    const correlation = within(root).getByText(/corr-standalone/).closest('span');
    expect(correlation).not.toBeNull();
    for (const el of [body, correlation!]) {
      expect(hasFade(el, 'opacity-')).toBe(false);
      expect(hasFade(el, 'text-text-')).toBe(false); // no per-node override; the root's secondary applies
    }
  });
});

describe('compact outcome strip on fill pages (#680)', () => {
  const CompactPage = ({ children }: { children: ReactNode }) => <I18nProvider><div data-outcome-focus-target role="region" aria-label="Page content" tabIndex={-1}><OutcomeScope><OutcomeBanners compact />{children}</OutcomeScope></div></I18nProvider>;

  it('draws one thin strip per group with the status prefix, the truncated sentence (title) and 자세히 / 다시 시도', () => {
    const a = query(); const b = query();
    const empty = query(response('empty', 'No rows'));
    render(<CompactPage><Widget q={a} /><Widget q={b} name="Widget B" /><Widget q={empty} name="C" /><Widget q={query(response('empty', 'No rows'))} name="D" /></CompactPage>);
    const strips = screen.getAllByRole('group', { name: '위젯 상태 요약' });
    expect(strips).toHaveLength(2);
    expect(strips[0]).toHaveAttribute('data-outcome-banner');
    expect(strips[0]).toHaveAttribute('data-outcome-compact');
    expect(strips[0]).toHaveTextContent('서버 오류 ·');
    expect(strips[0]).not.toHaveTextContent('데이터를 불러오지 못했습니다');
    const sentence = within(strips[0]).getByText('위젯 2개에서 같은 응답(서버 오류)이 확인되었습니다.');
    expect(sentence).toHaveAttribute('title', '위젯 2개에서 같은 응답(서버 오류)이 확인되었습니다.');
    expect(sentence).toHaveClass('truncate');
    expect(strips[0]).toHaveClass('border-text-danger-label');
    expect(strips[1]).toHaveClass('border-border-control');
    expect(strips[1]).toHaveTextContent('0건 ·');
    fireEvent.click(within(strips[0]).getByRole('button', { name: '다시 시도' }));
    expect(a.refetch).toHaveBeenCalledTimes(1); expect(b.refetch).toHaveBeenCalledTimes(1);
  });

  it('opens the full title and sentence from 자세히 (Popover), and keeps the live announcers', () => {
    render(<CompactPage><Widget q={query()} /><Widget q={query()} name="Widget B" /></CompactPage>);
    const strip = screen.getByRole('group', { name: '위젯 상태 요약' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(within(strip).getByRole('button', { name: '자세히' }));
    expect(within(screen.getByRole('dialog')).getByText('데이터를 불러오지 못했습니다')).toBeVisible();
    expect(screen.getByRole('dialog')).toHaveTextContent('위젯 2개에서 같은 응답(서버 오류)이 확인되었습니다.');
    expect(document.querySelector('[data-outcome-announcer="assertive"]')).toHaveTextContent('위젯 2개에서 같은 응답(서버 오류)이 확인되었습니다.');
  });

  it('returns focus to the page target when the strip disappears while focus is inside its open details', () => {
    const view = render(<CompactPage><Widget q={query()} /><Widget q={query()} name="Widget B" /></CompactPage>);
    const trigger = screen.getByRole('button', { name: '자세히' });
    fireEvent.click(trigger);
    const popover = screen.getByRole('dialog');
    act(() => { popover.focus(); });
    expect(popover.contains(document.activeElement)).toBe(true);
    const idle: QueryState<unknown> = { status: 'idle', response: null, completedAt: null, missing: [], refetch: vi.fn() };
    view.rerender(<CompactPage><Widget q={idle} /><Widget q={idle} name="Widget B" /></CompactPage>);
    expect(screen.queryByRole('group', { name: '위젯 상태 요약' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Page content' })).toHaveFocus();
  });

  it('names the details popover by its title', () => {
    render(<CompactPage><Widget q={query()} /><Widget q={query()} name="Widget B" /></CompactPage>);
    fireEvent.click(screen.getByRole('button', { name: '자세히' }));
    expect(screen.getByRole('dialog', { name: '데이터를 불러오지 못했습니다' })).toBeVisible();
  });

  it('leaves focus in group A\'s open details when only group B disappears', () => {
    const missing = (message: string) => query(response('error', message));
    const idle: QueryState<unknown> = { status: 'idle', response: null, completedAt: null, missing: [], refetch: vi.fn() };
    const a1 = missing('A'); const a2 = missing('A'); const b1 = missing('B'); const b2 = missing('B');
    const tree = (bGone: boolean) => <CompactPage>
      <Widget q={a1} name="A1" /><Widget q={a2} name="A2" />
      <Widget q={bGone ? idle : b1} name="B1" /><Widget q={bGone ? idle : b2} name="B2" />
    </CompactPage>;
    const view = render(tree(false));
    const strips = screen.getAllByRole('group', { name: '위젯 상태 요약' });
    expect(strips).toHaveLength(2);
    fireEvent.click(within(strips[0]).getByRole('button', { name: '자세히' }));
    const popover = screen.getByRole('dialog');
    act(() => { popover.focus(); });
    view.rerender(tree(true));
    expect(screen.getAllByRole('group', { name: '위젯 상태 요약' })).toHaveLength(1);
    expect(screen.getByRole('dialog')).toBe(popover);
    expect(popover.contains(document.activeElement)).toBe(true);
  });

  it('keeps the full banner without the compact flag (flow pages, DetailDrawer)', () => {
    render(<Page><Widget q={query()} /><Widget q={query()} name="Widget B" /></Page>);
    const banner = screen.getByRole('group', { name: '위젯 상태 요약' });
    expect(banner).not.toHaveAttribute('data-outcome-compact');
    expect(banner).toHaveTextContent('데이터를 불러오지 못했습니다');
    expect(within(banner).queryByRole('button', { name: '자세히' })).toBeNull();
  });
});
