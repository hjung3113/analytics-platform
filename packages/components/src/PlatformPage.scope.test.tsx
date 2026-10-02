import { act, cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlatformAdapter, ScopeCheck, Session } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
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
