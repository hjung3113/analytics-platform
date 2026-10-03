import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useLayoutEffect, useRef } from 'react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlatformAdapter, ScopeCheck, Session } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform } from '@ap/kernel';
import { PlatformPage } from './PlatformPage';

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
