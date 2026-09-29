import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ApiResponse, AuditTrailPage, AuditTrailQuery, PlatformAdapter, Session } from '@ap/contracts';
import { House } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { manifests } from '../index';
import AuditTrail from './AuditTrail';

const registry = createRegistry({
  spaces: [{ id: 'operations', label: { ko: '운영 콘솔', en: 'Operations console' }, permission: 'console:access', homeMenuId: 'admin-roles' }],
  groups: [{ id: 'admin', label: { ko: '관리·감사', en: 'Administration' }, icon: House, space: 'operations' }],
  menus: manifests,
});

const session: Session = {
  user: { id: 'admin-a', name: 'admin-a', title: { ko: '관리자', en: 'Administrator' }, permissions: ['console:access', 'platform:view'] },
  scopes: [],
};
const FROM = '2026-09-26T02:00:00.000Z';
const TO = '2026-09-26T03:00:00.000Z';

function fixture() {
  const calls: AuditTrailQuery[] = [];
  const response: ApiResponse<AuditTrailPage> = {
    outcome: 'ok', data: { items: [], total: 0 }, assessments: [], trust: null, correlationId: 'fixture',
  };
  const adapter: PlatformAdapter = {
    session: () => session,
    validateScope: async () => ({ status: 'valid', grantedRooms: [] }),
    publishedMetrics: () => [],
    defaultRangeTo: () => '2026-09-26T09:00:00',
    contextOptions: async () => ({ stgroup: [], team: [], makerModel: [] }),
    evaluateSelection: async () => ({ inCondition: [], outOfCondition: [] }),
    getEntity: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    recordUsage: async () => ({ accepted: 0 }),
    listAnnotations: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    saveAnnotation: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    reportClientError: async () => ({ accepted: true }),
    usageSummary: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    auditTrail: async (query: AuditTrailQuery) => { calls.push(query); return response; },
    entityAudit: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    accessDirectory: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    myVocHistory: async () => ({ outcome: 'ok', data: { items: [], nextCursor: null }, assessments: [], trust: null, correlationId: 'fixture' }),
    mySurveyHistory: async () => ({ outcome: 'ok', data: { items: [] }, assessments: [], trust: null, correlationId: 'fixture' }),
    subscribe: () => () => undefined,
  };
  return { adapter, calls };
}

function renderAudit(path: string) {
  window.history.replaceState(null, '', path);
  const f = fixture();
  render(<I18nProvider><PlatformProvider adapter={f.adapter} registry={registry}><AuditTrail /></PlatformProvider></I18nProvider>);
  return f;
}

const fromInput = () => screen.getByRole('textbox', { name: /From instant|시각 이상/ });
const toInput = () => screen.getByRole('textbox', { name: /To instant|시각 미만/ });
const targetIdInput = () => screen.getByRole('textbox', { name: /Exact target id|대상 ID 정확/ });
const typeSelect = () => screen.getByRole('combobox', { name: /Type|대상 유형/ });
const applyButton = () => screen.getByRole('button', { name: /Apply|적용/ });
const clearButton = () => screen.getByRole('button', { name: /Clear filters|필터 초기화/ });

beforeEach(() => { window.history.replaceState(null, '', '/admin/audit'); });
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

describe('AuditTrail text filters (issue #50 review)', () => {
  it('keeps filter controls mounted while editing and applies the complete range together', async () => {
    const f = renderAudit('/admin/audit');
    await waitFor(() => expect(f.calls).toHaveLength(1));
    f.calls.length = 0;

    fireEvent.change(targetIdInput(), { target: { value: 'ICH-ETCH-0101' } });
    expect(typeSelect()).toBeTruthy();
    expect(new URLSearchParams(window.location.search).has('targetId')).toBe(false);
    fireEvent.change(typeSelect(), { target: { value: 'equipment' } });
    await waitFor(() => expect(f.calls).toHaveLength(1));
    expect(new URLSearchParams(window.location.search).get('type')).toBe('equipment');
    expect(new URLSearchParams(window.location.search).has('targetId')).toBe(false);
    f.calls.length = 0;

    fireEvent.change(fromInput(), { target: { value: FROM } });
    expect(fromInput()).toBeTruthy();
    expect(toInput()).toBeTruthy();
    expect(typeSelect()).toBeTruthy();
    expect(new URLSearchParams(window.location.search).has('fromAt')).toBe(false);

    fireEvent.change(toInput(), { target: { value: TO } });
    fireEvent.click(applyButton());

    await waitFor(() => expect(f.calls).toHaveLength(1));
    expect(f.calls[0]).toMatchObject({ type: 'equipment', targetId: 'ICH-ETCH-0101', fromAt: FROM, toAt: TO, page: 1, pageSize: 25 });
    expect(new URLSearchParams(window.location.search).has('page')).toBe(false);
  });

  it('keeps an invalid one-sided URL editable and queries after the missing bound is applied', async () => {
    const f = renderAudit(`/admin/audit?${new URLSearchParams({ fromAt: FROM })}`);
    expect(screen.getByRole('alert').textContent).toMatch(/Invalid filter value|필터 값이 잘못되었습니다/);
    expect(clearButton()).toBeTruthy();
    expect((fromInput() as HTMLInputElement).value).toBe(FROM);
    expect((toInput() as HTMLInputElement).value).toBe('');
    expect(f.calls).toHaveLength(0);

    fireEvent.change(toInput(), { target: { value: TO } });
    fireEvent.click(applyButton());

    await waitFor(() => expect(f.calls).toHaveLength(1));
    expect(f.calls[0]).toMatchObject({ fromAt: FROM, toAt: TO, page: 1, pageSize: 25 });
  });
});
