import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useLayoutEffect, useRef } from 'react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlatformAdapter, ScopeCheck, Session } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform } from '@ap/kernel';
import { PlatformPage } from './PlatformPage';
import { QueryView } from './StateView';

const none = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const registry = createRegistry({
  spaces: [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, homeMenuId: 'home' }],
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }],
  menus: [{ id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: true, context: none, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});

const forbidden = { outcome: 'forbidden' as const, data: null, assessments: [], trust: null, correlationId: 'fixture' };
function adapterWith(validateScope: PlatformAdapter['validateScope']): PlatformAdapter {
  const session: Session = { user: { id: 'u1', name: 'u', title: { ko: 'u', en: 'u' }, permissions: ['platform:view'] }, scopes: [] };
  return {
    menuQuery: async () => forbidden, session: () => session, validateScope,
    publishedMetrics: () => [], defaultRangeTo: () => '2026-09-26T09:00:00',
    contextOptions: async () => ({ stgroup: [], team: [], makerModel: [] }),
    evaluateSelection: async () => ({ inCondition: [], outOfCondition: [] }),
    getEntity: async () => forbidden, auditTrail: async () => forbidden, entityAudit: async () => forbidden, accessDirectory: async () => forbidden,
    recordUsage: async () => ({ accepted: 0 }), usageSummary: async () => forbidden,
    listAnnotations: async () => forbidden, saveAnnotation: async () => forbidden,
    reportClientError: async () => ({ accepted: true }), subscribe: () => () => {},
  };
}

afterEach(cleanup);

describe('PlatformPage Scope gate: validation failure (#167)', () => {
  it('shows the check-failed message with a retry that re-validates and then renders the page', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH');
    let fail = true;
    let calls = 0;
    const adapter = adapterWith(async (): Promise<ScopeCheck> => { calls++; if (fail) throw new Error('down'); return { status: 'valid', grantedRooms: [] }; });
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><PlatformPage><p>page body</p></PlatformPage></PlatformProvider></I18nProvider>);
    expect(await screen.findByText('Scope를 확인하지 못했습니다')).toBeTruthy();
    expect(screen.getByText(/서버에 닿지 못했습니다/)).toBeTruthy();
    expect(screen.getByText('scopeId=ICH')).toBeTruthy();
    expect(screen.queryByText('page body')).toBeNull();

    fail = false;
    act(() => screen.getByRole('button', { name: '다시 시도' }).click());
    expect(await screen.findByText('page body')).toBeTruthy();
    expect(calls).toBe(2);
  });
});

describe('PlatformPage Scope gate follow-ups (#183)', () => {
  /** Records the page text of every commit, so the one-frame state between a switch and its effect is visible. */
  function GateRecorder({ frames }: { frames: string[] }) {
    usePlatform(); // consume the context: Provider's stable `children` prop alone would bail this subtree out
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => { frames.push(ref.current?.textContent ?? ''); });
    return <div ref={ref}><PlatformPage><p>page body</p></PlatformPage></div>;
  }

  function SwitchScope() {
    const { setGlobal } = usePlatform();
    return <button type="button" data-testid="switch" onClick={() => setGlobal({ scopeId: 'XIA' })}>switch</button>;
  }

  it('shows the validating gate — never the previous status or scopeId — in the frame right after a switch', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH');
    const adapter = adapterWith(scopeId => scopeId === 'ICH'
      ? Promise.reject(new Error('down'))
      : new Promise<ScopeCheck>(() => { /* the new Scope never settles */ }));
    const frames: string[] = [];
    render(
      <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
        <GateRecorder frames={frames} />
        <SwitchScope />
      </PlatformProvider></I18nProvider>,
    );
    expect(await screen.findByText('Scope를 확인하지 못했습니다')).toBeTruthy();
    const before = frames.length;

    fireEvent.click(screen.getByTestId('switch'));

    const after = frames.slice(before);
    expect(after.length).toBeGreaterThan(0);
    expect(after.some(frame => frame.includes('검증 중'))).toBe(true);
    for (const frame of after) {
      expect(frame).not.toContain('확인하지 못했습니다');
      expect(frame).not.toContain('scopeId=ICH');
    }
  });
});


describe('PlatformPage 50px header (#194)', () => {
  it('keeps title, full description, favorite and actions in one sticky header above Context and padded content', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH');
    const adapter = adapterWith(async () => ({ status: 'valid', grantedRooms: [] }));
    const view = render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry} slots={{ contextBar: <div>global context</div> }}>
      <PlatformPage title="Custom title" description="A long full description" dataTrustSummary={<span>trust</span>} secondaryActions={<button>secondary</button>} primaryAction={<button>primary</button>}><p>page body</p></PlatformPage>
    </PlatformProvider></I18nProvider>);
    await screen.findByText('page body');
    const header = view.container.querySelector('header')!;
    expect(header.className).toContain('h-[50px]');
    expect(header.parentElement).toHaveClass('sticky', 'top-0');
    expect(header).not.toHaveClass('sticky');
    expect(header.parentElement?.contains(screen.getByText('global context'))).toBe(true);
    expect(header.querySelector('h1')?.textContent).toBe('Custom title');
    expect(screen.getByText('A long full description').getAttribute('title')).toBe('A long full description');
    expect(header.textContent).toContain('trust');
    expect(header.contains(screen.getByRole('button', { name: 'secondary' }))).toBe(true);
    expect(header.contains(screen.getByRole('button', { name: 'primary' }))).toBe(true);
    expect(header.nextElementSibling?.textContent).toBe('global context');
    const content = view.container.querySelector('[data-platform-page-content]');
    expect(content).toBe(screen.getByText('page body').parentElement);
    expect(view.container.querySelectorAll('[data-platform-page-content]')).toHaveLength(1);
    expect(content?.className).toContain('px-8');
    expect(content?.contains(header)).toBe(false);
    expect(content?.contains(screen.getByText('global context'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '즐겨찾기에 추가' }));
    expect(screen.getByRole('button', { name: '즐겨찾기에서 제거' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('retains header identity and Context but gates trust, actions, extension and body until Scope is valid', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH');
    const adapter = adapterWith(async () => ({ status: 'forbidden', grantedRooms: [] }));
    const view = render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry} slots={{ contextBar: <div>global context</div> }}>
      <PlatformPage title="Gated title" description="Gated description" dataTrustSummary={<span>trust</span>} secondaryActions={<button>secondary</button>} primaryAction={<button>primary</button>} contextExtension={<div>extension</div>}><p>page body</p></PlatformPage>
    </PlatformProvider></I18nProvider>);
    await screen.findByText('이 Scope에 접근 권한이 없습니다');
    expect(view.container.querySelector('header')?.className).toContain('h-[50px]');
    expect(screen.getByRole('heading', { name: 'Gated title' })).toBeTruthy();
    expect(screen.getByText('global context')).toBeTruthy();
    expect(view.container.querySelector('[data-platform-page-content]')?.textContent).toContain('이 Scope에 접근 권한이 없습니다');
    for (const text of ['trust', 'secondary', 'primary', 'extension', 'page body']) expect(screen.queryByText(text)).toBeNull();
  });
});


describe('page header width (#194 FIX2)', () => {
  it('allows breadcrumb and rich title to shrink, yields description first and reserves favorite/actions', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH');
    render(<I18nProvider><PlatformProvider adapter={adapterWith(async () => ({ status: 'valid', grantedRooms: [] }))} registry={registry}>
      <PlatformPage title={<span>Long object ID</span>} description="Description" crumbs={[{ label: 'Long parent', href: '/' }]} primaryAction={<button>Save</button>}><p>body</p></PlatformPage>
    </PlatformProvider></I18nProvider>);
    await screen.findByText('body');
    const title = screen.getByRole('heading', { name: 'Long object ID' });
    expect(title).toHaveClass('min-w-0', 'shrink', 'truncate');
    expect(title).not.toHaveClass('shrink-0');
    expect(title).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveClass('min-w-0');
    expect(screen.getByRole('link', { name: 'Long parent' })).toHaveClass('truncate');
    expect(screen.getByText('Description')).toHaveClass('min-w-0', 'basis-0');
    expect(screen.getByRole('button', { name: '즐겨찾기에 추가' })).toHaveClass('shrink-0');
    expect(screen.getByRole('button', { name: 'Save' }).parentElement).toHaveClass('shrink-0', 'flex-nowrap');
    fireEvent.focus(title);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Long object ID');
  });

  it.each(['', '   '])('does not create an empty description tab stop (%j)', async description => {
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH');
    const view = render(<I18nProvider><PlatformProvider adapter={adapterWith(async () => ({ status: 'valid', grantedRooms: [] }))} registry={registry}>
      <PlatformPage description={description}><p>body</p></PlatformPage>
    </PlatformProvider></I18nProvider>);
    await screen.findByText('body');
    expect(view.container.querySelector('header div[tabindex="0"]')).toBeNull();
  });

  it('keeps the actual parent link shrinkable and exposes its full label', async () => {
    const detailRegistry = createRegistry({ spaces: registry.spaces, groups: registry.groups, menus: [
      ...registry.menus, { ...registry.menus[0], id: 'detail', path: '/detail', primary: false, navHidden: true, parent: 'home' },
    ] });
    window.history.replaceState(null, '', '/detail?v=1&scopeId=ICH');
    render(<I18nProvider><PlatformProvider adapter={adapterWith(async () => ({ status: 'valid', grantedRooms: [] }))} registry={detailRegistry}>
      <PlatformPage title="Detail"><p>body</p></PlatformPage>
    </PlatformProvider></I18nProvider>);
    await screen.findByText('body');
    const parent = screen.getByRole('link', { name: '홈' });
    expect(parent).toHaveClass('min-w-0', 'truncate');
    expect(parent).toHaveAttribute('title', '홈');
  });

});


describe('PlatformPage shared outcome placement (#55)', () => {
  it('provides the scope automatically and places one banner before the page body', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH');
    const adapter = adapterWith(async () => ({ status: 'valid', grantedRooms: [] }));
    const response = { ...forbidden, outcome: 'error' as const, message: 'Same response' };
    const query = { response, status: 'done' as const, refetch: () => {} };
    const view = render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
      <PlatformPage><section data-testid="consumer-body">
        <QueryView query={query} widgetName="First">{() => null}</QueryView>
        <QueryView query={query} widgetName="Second">{() => null}</QueryView>
      </section></PlatformPage>
    </PlatformProvider></I18nProvider>);
    expect(await screen.findByRole('group', { name: '위젯 상태 요약' })).toHaveTextContent('위젯 2개');
    const content = view.container.querySelector('[data-platform-page-content]')!;
    expect(content.querySelector('[data-outcome-banner]')?.nextElementSibling).toHaveAttribute('data-testid', 'consumer-body');
    expect(content).toHaveAttribute('tabindex', '-1');
    // No extra landmark around page content: chart/section regions stay the only regions inside <main>.
    expect(content).not.toHaveAttribute('role');
    expect(screen.queryByRole('region')).toBeNull();
    expect(content.lastElementChild).toHaveAttribute('data-testid', 'consumer-body');
  });
});
