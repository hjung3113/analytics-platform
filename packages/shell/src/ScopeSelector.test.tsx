import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useLayoutEffect, useRef } from 'react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlatformAdapter, ScopeCheck, Session } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform } from '@ap/kernel';
import { ScopeSelector } from './ScopeSelector';

const none = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const registry = createRegistry({
  spaces: [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, homeMenuId: 'home' }],
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }],
  menus: [{ id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: true, context: none, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});

const forbidden = { outcome: 'forbidden' as const, data: null, assessments: [], trust: null, correlationId: 'fixture' };
function adapterWith(validateScope: PlatformAdapter['validateScope'], scopes: Session['scopes'] = []): PlatformAdapter {
  const session: Session = { user: { id: 'u1', name: 'u', title: { ko: 'u', en: 'u' }, permissions: ['platform:view'] }, scopes };
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

describe('ScopeSelector Scope pill: validation failure (#167)', () => {
  it('labels a failed Scope check as check-failed, not validating', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH');
    const adapter = adapterWith(async (): Promise<ScopeCheck> => { throw new Error('down'); });
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><ScopeSelector /></PlatformProvider></I18nProvider>);
    expect(await screen.findByText(/확인 실패/)).toBeTruthy();
    const pill = screen.getByRole('button', { name: 'Scope: ICH' });
    expect(pill.textContent).not.toContain('검증 중');
    expect(pill.querySelector('.text-warning-label')).toBeTruthy();
    expect(pill.querySelector('.animate-spin')).toBeNull();
  });
});

describe('ScopeSelector Scope pill follow-ups (#183)', () => {
  const scopes = [
    { id: 'ICH', label: 'ICH · 청주', grantedRooms: 3, totalRooms: 5 },
    { id: 'XIA', label: 'XIA · 안양', grantedRooms: 1, totalRooms: 4 },
  ];

  /** Records the header text of every commit, so the one-frame state between a switch and its effect is visible. */
  function PillRecorder({ frames }: { frames: string[] }) {
    usePlatform(); // consume the context: Provider's stable `children` prop alone would bail this subtree out
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => { frames.push(ref.current?.textContent ?? ''); });
    return <div ref={ref}><ScopeSelector /></div>;
  }

  function openScopeMenu(id: string) {
    // The pill names itself after the ScopeOption label (`Scope: <label>`); match by the id prefix.
    // Radix opens the menu on the trigger's pointerdown and checks button === 0, which RTL's generic
    // pointer event lacks — dispatch a MouseEvent typed `pointerdown` instead.
    const trigger = screen.getByRole('button', { name: new RegExp(`^Scope: ${id}`) });
    act(() => { trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })); });
  }

  it('retries the validation when the current Scope is re-picked from a failed check', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH');
    let fail = true;
    let calls = 0;
    const adapter = adapterWith(async (): Promise<ScopeCheck> => { calls++; if (fail) throw new Error('down'); return { status: 'valid', grantedRooms: [] }; }, scopes);
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><ScopeSelector /></PlatformProvider></I18nProvider>);
    expect(await screen.findByText(/확인 실패/)).toBeTruthy();
    expect(calls).toBe(1);

    openScopeMenu('ICH');
    fail = false;
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /ICH/ }));
    expect(await screen.findByText(/서버 검증됨/)).toBeTruthy();
    expect(calls).toBe(2);
  });

  it('does not re-validate when the current Scope is re-picked from a valid pill', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH');
    let calls = 0;
    const adapter = adapterWith(async (): Promise<ScopeCheck> => { calls++; return { status: 'valid', grantedRooms: [] }; }, scopes);
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><ScopeSelector /></PlatformProvider></I18nProvider>);
    expect(await screen.findByText(/서버 검증됨/)).toBeTruthy();
    expect(calls).toBe(1);

    openScopeMenu('ICH');
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /ICH/ }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(calls).toBe(1);
  });

  it('shows validating — never the previous Scope status — in the frame right after a switch', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH');
    const adapter = adapterWith(scopeId => scopeId === 'ICH'
      ? Promise.reject(new Error('down'))
      : new Promise<ScopeCheck>(() => { /* the new Scope never settles */ }), scopes);
    const frames: string[] = [];
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><PillRecorder frames={frames} /></PlatformProvider></I18nProvider>);
    expect(await screen.findByText(/확인 실패/)).toBeTruthy();
    const before = frames.length;

    openScopeMenu('ICH');
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /XIA/ }));

    const after = frames.slice(before);
    expect(after.length).toBeGreaterThan(0);
    for (const frame of after) {
      expect(frame).not.toContain('확인 실패');
      expect(frame).toContain('검증 중');
    }
  });
});

describe('ScopeSelector Scope retry menu item (#183)', () => {
  const scopes = [
    { id: 'ICH', label: 'ICH · 청주', grantedRooms: 3, totalRooms: 5 },
    { id: 'XIA', label: 'XIA · 안양', grantedRooms: 1, totalRooms: 4 },
  ];

  function openScopeMenu(id: string) {
    const trigger = screen.getByRole('button', { name: new RegExp(`^Scope: ${id}`) });
    act(() => { trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })); });
  }

  it('offers a re-check item for a requested Scope absent from the list whose check failed, and retrying validates it', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=GHOST');
    let fail = true;
    let calls = 0;
    const adapter = adapterWith(async (): Promise<ScopeCheck> => { calls++; if (fail) throw new Error('down'); return { status: 'valid', grantedRooms: [] }; }, scopes);
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><ScopeSelector /></PlatformProvider></I18nProvider>);
    expect(await screen.findByText(/확인 실패/)).toBeTruthy();
    expect(calls).toBe(1);

    openScopeMenu('GHOST');
    fail = false;
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Scope 다시 확인' }));
    expect(await screen.findByText(/서버 검증됨/)).toBeTruthy();
    expect(calls).toBe(2);
  });

  it('shows the re-check item only while the check failed', async () => {
    const scenarios: Array<[string, PlatformAdapter['validateScope'], string]> = [
      ['valid', async () => ({ status: 'valid', grantedRooms: [] }), '서버 검증됨 · room 3/5'],
      ['validating', () => new Promise<ScopeCheck>(() => { /* never settles */ }), '검증 중… · room 3/5'],
      ['forbidden', async () => ({ status: 'forbidden', grantedRooms: [] }), '접근 불가 · room 3/5'],
    ];
    for (const [name, validateScope, pillText] of scenarios) {
      window.history.replaceState(null, '', '/?v=1&scopeId=ICH');
      render(<I18nProvider><PlatformProvider adapter={adapterWith(validateScope, scopes)} registry={registry}><ScopeSelector /></PlatformProvider></I18nProvider>);
      await waitFor(() => expect(screen.getByRole('button', { name: 'Scope: ICH · 청주' })).toHaveAccessibleDescription(pillText));
      openScopeMenu('ICH');
      expect(screen.queryByRole('menuitem', { name: 'Scope 다시 확인' })).toBeNull();
      cleanup();
    }
  });
});


describe('sidebar Scope selector (#194)', () => {
  it('keeps label, state and room grants accessible in collapsed mode, and opens the same single-select menu', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH');
    const scopes = [{ id: 'ICH', label: 'ICH · 청주', grantedRooms: 3, totalRooms: 5 }];
    render(<I18nProvider><PlatformProvider adapter={adapterWith(async () => ({ status: 'valid', grantedRooms: [] }), scopes)} registry={registry}><ScopeSelector collapsed /></PlatformProvider></I18nProvider>);
    const trigger = screen.getByRole('button', { name: 'Scope: ICH · 청주' });
    await waitFor(() => expect(trigger).toHaveAccessibleDescription('서버 검증됨 · room 3/5'));
    fireEvent.focus(trigger);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('ICH · 청주 · 서버 검증됨 · room 3/5');
    expect(trigger).toHaveAccessibleDescription('서버 검증됨 · room 3/5');
    fireEvent.blur(trigger);
    fireEvent.pointerMove(trigger);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('ICH · 청주 · 서버 검증됨 · room 3/5');
    expect(trigger.querySelector('.sr-only')?.textContent).toContain('room 3/5');
    act(() => { trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })); });
    expect(await screen.findByRole('menuitemradio', { name: 'ICH · 청주 room 3/5' })).toBeTruthy();
  });

  it('shows no-Scope and unknown-Scope text without substituting an available Scope', async () => {
    const scopes = [{ id: 'ICH', label: 'ICH · 청주', grantedRooms: 3, totalRooms: 5 }];
    window.history.replaceState(null, '', '/?v=1');
    render(<I18nProvider><PlatformProvider adapter={adapterWith(async () => ({ status: 'valid', grantedRooms: [] }), scopes)} registry={registry}><ScopeSelector /></PlatformProvider></I18nProvider>);
    expect(screen.getByRole('button', { name: 'Scope: Scope 선택' })).toBeTruthy();
    cleanup();
    window.history.replaceState(null, '', '/?v=1&scopeId=GHOST');
    render(<I18nProvider><PlatformProvider adapter={adapterWith(async () => ({ status: 'unknown_scope', grantedRooms: [] }), scopes)} registry={registry}><ScopeSelector /></PlatformProvider></I18nProvider>);
    expect(await screen.findByText('알 수 없는 Scope')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Scope: GHOST' })).toBeTruthy();
  });
});


describe('Scope accessible status (#194 FIX2)', () => {
  const scopes = [{ id: 'ICH', label: 'ICH · 청주', grantedRooms: 3, totalRooms: 5 }];
  const scenarios: Array<[string, PlatformAdapter['validateScope'], string, string]> = [
    ['valid', async () => ({ status: 'valid', grantedRooms: [] }), 'ICH', '서버 검증됨'],
    ['validating', () => new Promise<ScopeCheck>(() => {}), 'ICH', '검증 중…'],
    ['none', async () => ({ status: 'valid', grantedRooms: [] }), '', 'Scope 선택'],
    ['error', async () => { throw new Error('down'); }, 'ICH', '확인 실패'],
    ['forbidden', async () => ({ status: 'forbidden', grantedRooms: [] }), 'ICH', '접근 불가'],
    ['unknown_scope', async () => ({ status: 'unknown_scope', grantedRooms: [] }), 'GHOST', '알 수 없는 Scope'],
  ];
  it.each(scenarios)('describes and politely announces %s in both modes', async (_state, validate, scopeId, status) => {
    for (const collapsed of [false, true]) {
      window.history.replaceState(null, '', `/?v=1${scopeId ? `&scopeId=${scopeId}` : ''}`);
      render(<I18nProvider><PlatformProvider adapter={adapterWith(validate, scopes)} registry={registry}><ScopeSelector collapsed={collapsed} /></PlatformProvider></I18nProvider>);
      const trigger = screen.getByRole('button', { name: `Scope: ${scopeId === 'ICH' ? 'ICH · 청주' : scopeId || 'Scope 선택'}` });
      const descriptionId = trigger.getAttribute('aria-describedby');
      await waitFor(() => expect(trigger).toHaveAccessibleDescription(`${status}${scopeId === 'ICH' ? ' · room 3/5' : ''}`));
      expect(trigger.getAttribute('aria-describedby')).toBe(descriptionId);
      expect(screen.getByRole('status')).toHaveTextContent(status);
      expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
      expect(screen.getByRole('status')).not.toHaveTextContent('room');
      const description = document.getElementById(descriptionId!);
      expect(description).toHaveClass(['error', 'forbidden', 'unknown_scope'].includes(_state) ? 'text-warning-label' : 'text-text-secondary');
      cleanup();
    }
  });
});
