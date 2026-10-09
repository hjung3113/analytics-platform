import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAdapter, Session } from '@ap/contracts';
import { I18nProvider, PlatformProvider, usePlatform } from '@ap/kernel';
import { GROUPS, SPACES, registry } from './menus';

describe('workspace assembly (#260)', () => {
  it('registers three spaces and the decided group order', () => {
    expect(GROUPS.map(group => [group.id, group.space])).toEqual([
      ['overview', null],
      ['noticeVoc', null],
      ['analytics', 'analytics'],
      ['equipment', 'analytics'],
      ['masterData', 'analytics'],
      ['metrics', 'metrics'],
      ['admin', 'operations'],
    ]);
    expect(SPACES.map(space => space.id)).toEqual(['analytics', 'metrics', 'operations']);
    expect(SPACES[0]).toMatchObject({
      label: { ko: '생산성 분석', en: 'Productivity analysis' },
      description: { ko: '설비·기간별 생산성과 사이클타임을 분석합니다.', en: 'Analyze productivity and cycle time by equipment and period.' },
      homeMenuId: 'productivity-overview',
    });
    expect(SPACES[0].permission).toBeUndefined();
    expect(SPACES[1]).toMatchObject({
      label: { ko: '지표관리', en: 'Metrics' },
      description: { ko: '지표 정의·버전·발행을 관리합니다.', en: 'Manage metric definitions, versions, and releases.' },
      homeMenuId: 'metric-catalog',
    });
    expect(SPACES[1].permission).toBeUndefined();
    expect(SPACES[2]).toMatchObject({
      label: { ko: '운영 콘솔', en: 'Operations console' },
      description: { ko: '권한·감사·메뉴 활용률을 운영합니다.', en: 'Operate permissions, audit, and menu usage.' },
      permission: 'console:access',
      homeMenuId: 'admin-roles',
    });
    expect(registry.menuById('home').label).toEqual({ ko: '플랫폼 홈', en: 'Platform home' });
    expect(registry.menuById('equipment-master').path).toBe('/equipment');
    expect(registry.menuById('notices').path).toBe('/notices');
    expect(registry.menuById('voc').path).toBe('/voc');
  });

  it('gives a viewer one space and the global utilities, and the app does not pass feedbackOps', () => {
    // jsdom does not give import.meta.url a file: scheme; the package script runs from the app root.
    expect(readFileSync(join(process.cwd(), 'src/main.tsx'), 'utf8')).not.toContain('feedbackOps');
    const session: Session = {
      user: { id: 'viewer', name: 'viewer', title: { ko: '현업 문의자', en: 'Field requester' }, permissions: ['platform:view', 'metrics:view', 'notice:view', 'voc:view'] },
      scopes: [],
    };
    const adapter: PlatformAdapter = {
      menuQuery: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
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
      listAnnotations: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
      saveAnnotation: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
      reportClientError: async () => ({ accepted: true }),
      subscribe: () => () => {},
    };
    function Probe() {
      const { accessibleSpaces, resolveLink, slots } = usePlatform();
      return <div>
        <p data-testid="spaces">{accessibleSpaces.map(space => `${space.id}:${space.label.ko}`).join(',')}</p>
        <p data-testid="allowed">{['home', 'notices', 'voc'].map(id => `${id}:${resolveLink(id).allowed}`).join(',')}</p>
        <p data-testid="slot">{slots.feedbackOps === undefined ? 'absent' : 'present'}</p>
      </div>;
    }
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
    window.history.replaceState(null, '', '/');
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Probe /></PlatformProvider></I18nProvider>);
    expect(screen.getByTestId('spaces').textContent).toBe('metrics:지표관리');
    expect(screen.getByTestId('allowed').textContent).toBe('home:true,notices:true,voc:true');
    expect(screen.getByTestId('slot').textContent).toBe('absent');
    cleanup();
    vi.unstubAllGlobals();
  });
});

afterEach(() => { cleanup(); });
