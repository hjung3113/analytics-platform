import { cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlatformAdapter, ScopeCheck, Session } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { TopBar } from './TopBar';

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

describe('TopBar Scope pill: validation failure (#167)', () => {
  it('labels a failed Scope check as check-failed, not validating', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH');
    const adapter = adapterWith(async (): Promise<ScopeCheck> => { throw new Error('down'); });
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><TopBar /></PlatformProvider></I18nProvider>);
    expect(await screen.findByText('· 확인 실패')).toBeTruthy();
    const pill = screen.getByRole('button', { name: 'Scope: ICH' });
    expect(pill.textContent).not.toContain('검증 중');
    expect(pill.className).toContain('bg-accent-warn-soft');
    expect(pill.querySelector('.animate-spin')).toBeNull();
  });
});
