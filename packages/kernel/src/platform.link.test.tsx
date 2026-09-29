import { cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlatformAdapter, Session, SpaceDef } from '@ap/contracts';
import type { LinkOptions, LinkResolution } from './platform';
import { I18nProvider } from './i18n';
import { PlatformProvider, usePlatform } from './platform';
import { createRegistry } from './registry';

const none = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };
const entry = (id: string, group: 'equipment' | 'admin', path: string, permission: 'platform:view' | 'analytics:view' | 'console:access', pageKeys: string[]) => ({
  id, group, label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission, requiresScope: false, context: none, pageType: 'analysis' as const, features: noFeatures, pageKeys,
});

const spaces: SpaceDef[] = [
  { id: 'analytics', label: { ko: '분석', en: 'Analytics' }, homeMenuId: 'source' },
  { id: 'operations', label: { ko: '운영 콘솔', en: 'Operations console' }, permission: 'console:access', homeMenuId: 'ops-home' },
];
const registry = createRegistry({
  spaces,
  groups: [
    { id: 'equipment', label: { ko: '설비관리', en: 'Equipment' }, icon: House, space: 'analytics' },
    { id: 'admin', label: { ko: '관리·감사', en: 'Administration' }, icon: House, space: 'operations' },
  ],
  menus: [
    { ...entry('source', 'equipment', '/source', 'platform:view', []), primary: true },
    entry('analysis', 'equipment', '/analysis', 'analytics:view', ['tab']),
    { ...entry('ops-home', 'admin', '/ops', 'console:access', []), primary: true },
    // Weaker menu permission than its space's gate: only the space entry can deny it.
    entry('ops-child', 'admin', '/ops/child', 'platform:view', []),
  ],
});

const URL_ICH = '/source?v=1&scopeId=ICH&roomNames=PH-101&selectedEquipmentIds=E1&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00';
const ANALYST: Session['user']['permissions'] = ['platform:view', 'analytics:view'];
const VIEWER: Session['user']['permissions'] = ['platform:view'];

function fixture(permissions: Session['user']['permissions']) {
  // One stable snapshot object: useSyncExternalStore compares by identity on every render.
  const session: Session = { user: { id: 'u1', name: 'u', title: { ko: 'u', en: 'u' }, permissions }, scopes: [] };
  const adapter: PlatformAdapter = {
    session: () => session,
    validateScope: async () => ({ status: 'valid', grantedRooms: [] }),
    publishedMetrics: () => [],
    defaultRangeTo: () => '2026-09-26T09:00:00',
    contextOptions: async () => ({ stgroup: [], team: [], makerModel: [] }),
    evaluateSelection: async () => ({ inCondition: [], outOfCondition: [] }),
    getEntity: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    auditTrail: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    entityAudit: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    accessDirectory: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    recordUsage: async () => ({ accepted: 0 }),
    usageSummary: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    myVocHistory: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    mySurveyHistory: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    reportClientError: async () => ({ accepted: true }),
    subscribe: () => () => {},
  };
  return adapter;
}


let captured: ((id: string, options?: LinkOptions) => LinkResolution) | null = null;
function Probe() {
  const { resolveLink } = usePlatform();
  captured = resolveLink;
  return <p data-testid="ready">ready</p>;
}
function resolve(url: string, permissions: Session['user']['permissions'], menuId: string, options?: LinkOptions): LinkResolution {
  window.history.replaceState(null, '', url);
  render(<I18nProvider><PlatformProvider adapter={fixture(permissions)} registry={registry}><Probe /></PlatformProvider></I18nProvider>);
  screen.getByTestId('ready');
  return captured!(menuId, options);
}
const query = (href: string) => new URLSearchParams(href.slice(href.indexOf('?') + 1));

afterEach(() => { cleanup(); captured = null; });

describe('resolveLink (06 §22, issue #102)', () => {
  it('says whether the user may open the destination: menu permission and space entry', () => {
    expect(resolve(URL_ICH, ANALYST, 'analysis').allowed).toBe(true);
    cleanup();
    expect(resolve(URL_ICH, VIEWER, 'analysis').allowed).toBe(false);
    cleanup();
    // ops-child needs only platform:view, but its space needs console:access.
    expect(resolve(URL_ICH, VIEWER, 'ops-child').allowed).toBe(false);
    cleanup();
    expect(resolve(URL_ICH, [...VIEWER, 'console:access'], 'ops-child').allowed).toBe(true);
  });

  it('applies the site boundary: a different scopeId drops carried site-bound sets, explicit ones for the destination stay', () => {
    const cleared = query(resolve(URL_ICH, ANALYST, 'analysis', { global: { scopeId: 'CJU' } }).href);
    expect(cleared.get('scopeId')).toBe('CJU');
    expect(cleared.has('roomNames')).toBe(false);
    expect(cleared.has('selectedEquipmentIds')).toBe(false);
    expect(cleared.get('from')).toBe('2026-09-25T09:00:00');
    cleanup();
    const explicit = query(resolve(URL_ICH, ANALYST, 'analysis', { global: { scopeId: 'CJU', selection: ['CJU-1'] } }).href);
    expect(explicit.get('selectedEquipmentIds')).toBe('CJU-1');
    expect(explicit.has('roomNames')).toBe(false);
  });

  it('keeps carried sets when the scope is unchanged or not mentioned', () => {
    const same = query(resolve(URL_ICH, ANALYST, 'analysis', { global: { scopeId: 'ICH' } }).href);
    expect(same.get('roomNames')).toBe('PH-101');
    expect(same.get('selectedEquipmentIds')).toBe('E1');
    cleanup();
    const none = query(resolve(URL_ICH, ANALYST, 'analysis').href);
    expect(none.get('roomNames')).toBe('PH-101');
  });

  it('reports the page keys the destination does not register instead of dropping them silently', () => {
    const link = resolve(URL_ICH, ANALYST, 'analysis', { page: { tab: 'a', nope: 'b' } });
    expect(link.droppedPageKeys).toEqual(['nope']);
    expect(query(link.href).get('tab')).toBe('a');
    expect(query(link.href).has('nope')).toBe(false);
  });
});
