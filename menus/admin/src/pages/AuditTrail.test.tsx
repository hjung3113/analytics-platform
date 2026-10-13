import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ApiResponse, AuditEvent, AuditTrailPage, AuditTrailQuery, PlatformAdapter, Session } from '@ap/contracts';
import { House } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { manifests } from '../index';
import AuditTrail from './AuditTrail';

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
beforeAll(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterAll(() => {
  if (originalScrollIntoView) HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
});

const registry = createRegistry({
  spaces: [{ id: 'operations', label: { ko: '운영 콘솔', en: 'Operations console' }, description: { ko: '목적', en: 'Purpose' }, permission: 'console:access', homeMenuId: 'admin-roles' }],
  groups: [{ id: 'admin', label: { ko: '관리·감사', en: 'Administration' }, icon: House, space: 'operations' }],
  menus: [...manifests, {
    // The row link's destination (audit-destination → equipment-detail); the admin manifests alone don't register it.
    id: 'equipment-detail', group: 'admin', label: { ko: '설비 상세', en: 'Equipment detail' }, description: { ko: '', en: '' },
    path: '/admin/fixture-detail/:equipmentId', icon: House, permission: 'platform:view', requiresScope: true, pageType: 'catalog',
    context: { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' },
    features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], navHidden: true,
  }],
});

const session: Session = {
  user: { id: 'admin-a', name: 'admin-a', title: { ko: '관리자', en: 'Administrator' }, permissions: ['console:access', 'platform:view'] },
  scopes: [],
};
const FROM = '2026-09-26T02:00:00.000Z';
const TO = '2026-09-26T03:00:00.000Z';

function fixture(items: AuditEvent[] = []) {
  const calls: AuditTrailQuery[] = [];
  const response: ApiResponse<AuditTrailPage> = {
    outcome: 'ok', data: { items, total: items.length }, assessments: [], trust: null, correlationId: 'fixture',
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
    recordUsage: async () => ({ accepted: 0 }),
    listAnnotations: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    saveAnnotation: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    reportClientError: async () => ({ accepted: true }),
    usageSummary: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    auditTrail: async (query: AuditTrailQuery) => { calls.push(query); return response; },
    entityAudit: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    accessDirectory: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    subscribe: () => () => undefined,
  };
  return { adapter, calls };
}

function renderAudit(path: string, items: AuditEvent[] = []) {
  window.history.replaceState(null, '', path);
  const f = fixture(items);
  render(<I18nProvider><PlatformProvider adapter={f.adapter} registry={registry}><AuditTrail /></PlatformProvider></I18nProvider>);
  return f;
}

const EVENT: AuditEvent = {
  id: 'a1', at: '2026-09-26T02:10:00.000Z', actor: 'admin-a', action: 'update', source: 'user',
  target: { type: 'equipment', id: 'ICH-ETCH-0101', scopeId: 'ICH' }, changes: { status: ['idle', 'maintenance'] },
};

const fromInput = () => screen.getByRole('textbox', { name: /From instant|시각 이상/ });
const toInput = () => screen.getByRole('textbox', { name: /To instant|시각 미만/ });
const targetIdInput = () => screen.getByRole('textbox', { name: /Exact target id|대상 ID 정확/ });
const typeSelect = () => screen.getByRole('combobox', { name: /Type|대상 유형/ });
const applyButton = () => screen.getByRole('button', { name: /Apply|적용/ });
const clearButton = () => screen.getByRole('button', { name: /Clear filters|필터 초기화/ });
const chooseType = async (value: string) => {
  fireEvent.keyDown(typeSelect(), { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('option', { name: value }));
};

beforeEach(() => {
  window.history.replaceState(null, '', '/admin/audit');
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 1200, height: 98, x: 0, y: 0, top: 0, left: 0, right: 1200, bottom: 98, toJSON() {} });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('AuditTrail text filters (issue #50 review)', () => {
  it('keeps filter controls mounted while editing and applies the complete range together', async () => {
    const f = renderAudit('/admin/audit');
    expect(screen.getByTestId('page-filter-bar')).toBeTruthy();
    await waitFor(() => expect(f.calls).toHaveLength(1));
    f.calls.length = 0;

    fireEvent.change(targetIdInput(), { target: { value: 'ICH-ETCH-0101' } });
    expect(typeSelect()).toBeTruthy();
    expect(new URLSearchParams(window.location.search).has('targetId')).toBe(false);
    await chooseType('설비');
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

  // #302 C-07: 출처·대상 유형은 표시 라벨로, URL과 adapter 인자는 원문 값으로 유지한다.
  it('shows source and target type as display labels while URL and adapter keep the raw values', async () => {
    // jsdom zero layout empties the virtual range; the #160-block fixed metrics let the row render.
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return (this as Element).getAttribute('role') === 'row' ? 32 : 420; } });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return 800; } });
    try {
      const f = renderAudit(`/admin/audit?${new URLSearchParams({ type: 'equipment', source: 'user' })}`, [EVENT]);
      const table = await screen.findByRole('table', { name: '변경 감사 목록' });
      expect(within(table).getByText('ICH-ETCH-0101')).toBeTruthy();
      // Source badge and target-type cell render the label, not the wire value.
      expect(within(table).getByText('사용자')).toBeTruthy();
      expect(within(table).getByText('설비')).toBeTruthy();
      // The column header joins the page language.
      expect(within(table).getByRole('columnheader', { name: '대상 ID' })).toBeTruthy();
      expect(within(table).queryByText('equipment')).toBeNull();
      // The URL and the adapter call keep the raw filter values.
      expect(new URLSearchParams(window.location.search).get('type')).toBe('equipment');
      expect(new URLSearchParams(window.location.search).get('source')).toBe('user');
      expect(f.calls[0]).toMatchObject({ type: 'equipment', source: 'user' });
    } finally {
      if (originalOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
      if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth);
    }
  });
});
