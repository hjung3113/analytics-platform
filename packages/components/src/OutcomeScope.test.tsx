import { StrictMode, useState, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, type QueryState } from '@ap/kernel';
import type { ApiResponse, Assessment } from '@ap/contracts';
import { OutcomeBanners, OutcomeScope, useSharedOutcome } from './OutcomeScope';
import { OutcomeView, QueryView, StateMessage } from './StateView';
import { DetailDrawer } from './DetailDrawer';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { useI18n } from '@ap/kernel';

const response = (outcome: ApiResponse<unknown>['outcome'] = 'error', message = 'Same response', assessments: Assessment[] = []): ApiResponse<unknown> =>
  ({ outcome, message, assessments, data: null, trust: null, correlationId: 'corr-widget' });
const query = (r = response(), retry = vi.fn()): QueryState<unknown> => ({ response: r, refetch: retry, status: 'done' });
const Widget = ({ q, name = 'Widget A', hide = false }: { q: QueryState<unknown>; name?: string; hide?: boolean }) =>
  <QueryView query={q} widgetName={name} hideWidgetName={hide}>{() => <p>Success</p>}</QueryView>;
const Page = ({ children }: { children: ReactNode }) => <I18nProvider><div data-outcome-focus-target role="region" aria-label="Page content" tabIndex={-1}><OutcomeScope><OutcomeBanners />{children}</OutcomeScope></div></I18nProvider>;
afterEach(cleanup);

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
      expect(state).toHaveTextContent('Same response');
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
    expect(screen.getByRole('group', { name: 'Widget A' })).toHaveTextContent('Same response');
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('orders every qualifying group largest first and updates on response changes', () => {
    const a = query(); const b = query(); const c = query(); const empty = query(response('empty'));
    const view = render(<Page><Widget q={empty} /><Widget q={empty} /><Widget q={a} /><Widget q={b} /><Widget q={c} /></Page>);
    const banners = view.container.querySelectorAll('[data-outcome-banner]');
    expect(banners).toHaveLength(2); expect(banners[0]).toHaveTextContent('위젯 3개'); expect(banners[1]).toHaveTextContent('위젯 2개');
    view.rerender(<Page><Widget q={{ ...a, response: null, status: 'loading' }} /><Widget q={b} /></Page>);
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
    const view = render(<Page><Widget q={a} /><Widget q={{ ...b, response: null, status: 'loading' }} name="Widget B" /></Page>);
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
      return <Page>{retries.map((retry, i) => <Widget key={i} name={`Widget ${i}`} q={{ response: r, status: pending ? 'refreshing' : 'done', refetch: () => { retry(); setPending(true); } }} />)}</Page>;
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
    view.rerender(page({ ...a, status: 'refreshing' }, { ...b, status: 'refreshing' }));
    const settledA = { ...a, response: response() }; const settledB = { ...b, response: response() };
    view.rerender(page(settledA, { ...b, status: 'refreshing' }));
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
    const view = render(<Page><Widget q={a} /><Arrival q={{ ...b, response: null, status: 'loading' }} /></Page>);
    view.rerender(<Page><Widget q={a} /><Arrival q={b} /></Page>);
    expect(decisions[0]).toBe(true);
  });
});
