import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { instantEpochMs, type ApiResponse, type AuditEvent, type AuditTrailPage, type AuditTrailQuery, groupId, spaceId } from '@ap/contracts';
import { House } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '../index';
import AuditTrail from './AuditTrail';

const viewerTz = vi.hoisted(() => ({ value: 'Asia/Seoul' }));
vi.mock('../audit-window', async () => {
  const actual = await vi.importActual<typeof import('../audit-window')>('../audit-window');
  return { ...actual, viewerTimeZone: () => viewerTz.value };
});

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
beforeAll(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterAll(() => {
  if (originalScrollIntoView) HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
});

const registry = createRegistry({
  spaces: [{ id: spaceId('operations'), label: { ko: '운영 콘솔', en: 'Operations console' }, description: { ko: '목적', en: 'Purpose' }, permission: 'console:access', homeMenuId: 'admin-roles' }],
  groups: [{ id: groupId('admin'), label: { ko: '관리·감사', en: 'Administration' }, icon: House, space: spaceId('operations') }],
  menus: [...manifests, {
    // The row link's destination (audit-destination → equipment-detail); the admin manifests alone don't register it.
    id: 'equipment-detail', group: groupId('admin'), label: { ko: '설비 상세', en: 'Equipment detail' }, description: { ko: '', en: '' },
    path: '/admin/fixture-detail/:equipmentId', icon: House, permission: 'platform:view', requiresScope: true, pageType: 'catalog',
    context: { time: 'unsupported', roomNames: 'unsupported', line: 'unsupported', prcGroup: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' },
    features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], navHidden: true,
  }],
});

const session = testSession(['console:access', 'platform:view'], { user: { id: 'admin-a', name: 'admin-a', title: { ko: '관리자', en: 'Administrator' } } });
const FROM = '2026-09-26T02:00:00.000Z';
const TO = '2026-09-26T03:00:00.000Z';

function fixture(items: AuditEvent[] = [], options?: { filterWindow?: boolean }) {
  const calls: AuditTrailQuery[] = [];
  const rowsFor = (query: AuditTrailQuery): AuditEvent[] => {
    if (!options?.filterWindow) return items;
    return items.filter(row => {
      const at = instantEpochMs(row.at);
      if (query.fromAt !== undefined && at < instantEpochMs(query.fromAt)) return false;
      if (query.toAt !== undefined && at >= instantEpochMs(query.toAt)) return false;
      return true;
    });
  };
  const adapter = testAdapter({
    session: () => session,
    auditTrail: async (query: AuditTrailQuery) => {
      calls.push(query);
      const rows = rowsFor(query);
      const response: ApiResponse<AuditTrailPage> = {
        outcome: 'ok', data: { items: rows, total: rows.length }, assessments: [], trust: null, correlationId: 'fixture',
      };
      return response;
    },
  });
  return { adapter, calls };
}

function renderAudit(path: string, items: AuditEvent[] = [], options?: { filterWindow?: boolean }) {
  window.history.replaceState(null, '', path);
  const f = fixture(items, options);
  render(<I18nProvider><PlatformProvider equipmentAxes={equipmentAxes} adapter={f.adapter} registry={registry}><AuditTrail /></PlatformProvider></I18nProvider>);
  return f;
}

const EVENT: AuditEvent = {
  id: 'a1', at: '2026-09-26T02:10:00.000Z', actor: 'admin-a', action: 'update', source: 'user',
  target: { type: 'equipment', id: 'MEM-ETCH-0101', scopeId: 'MEM' }, changes: { status: ['idle', 'maintenance'] },
};

const fromInput = () => screen.getByRole('textbox', { name: /^(At or after|시각 이후)$/ });
const toInput = () => screen.getByRole('textbox', { name: /^(Before|시각 미만)$/ });
const actorInput = () => screen.getByRole('textbox', { name: /Exact actor|행위자 정확 일치/ });
const targetIdInput = () => screen.getByRole('textbox', { name: /Exact target id|대상 ID 정확/ });
const typeSelect = () => screen.getByRole('combobox', { name: /Type|대상 유형/ });
const applyButton = () => screen.getByRole('button', { name: /^(Apply|적용)( \(\d+\))?$/ });
const clearButton = () => screen.getByRole('button', { name: /Clear filters|필터 초기화/ });
const chooseType = async (value: string) => {
  fireEvent.keyDown(typeSelect(), { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('option', { name: value }));
};
const pressEnter = (input: HTMLElement) => {
  const key = { key: 'Enter', code: 'Enter', charCode: 13, keyCode: 13 };
  // jsdom has no keyboard default actions: emulate implicit submission only for an uncancelled Enter.
  if (fireEvent.keyDown(input, key) && fireEvent.keyPress(input, key)) {
    const form = input.closest('form')!;
    act(() => form.requestSubmit(form.querySelector<HTMLButtonElement>('button[type="submit"]')!));
  }
  fireEvent.keyUp(input, key);
};

beforeEach(() => {
  window.history.replaceState(null, '', '/admin/audit');
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 1200, height: 98, x: 0, y: 0, top: 0, left: 0, right: 1200, bottom: 98, toJSON() {} });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  viewerTz.value = 'Asia/Seoul';
  window.history.replaceState(null, '', '/');
});

describe('AuditTrail text filters (issue #50 review)', () => {
  it('keeps filter controls mounted while editing and applies the complete range together', async () => {
    const f = renderAudit('/admin/audit');
    expect(screen.getByTestId('page-filter-bar')).toBeTruthy();
    await waitFor(() => expect(f.calls).toHaveLength(1));
    f.calls.length = 0;

    fireEvent.change(targetIdInput(), { target: { value: 'MEM-ETCH-0101' } });
    expect(typeSelect()).toBeTruthy();
    expect(new URLSearchParams(window.location.search).has('targetId')).toBe(false);
    await chooseType('설비');
    // The Select is a draft like the text fields: nothing is written or fetched before Apply.
    expect(new URLSearchParams(window.location.search).has('type')).toBe(false);
    expect(f.calls).toHaveLength(0);

    fireEvent.change(fromInput(), { target: { value: '2026-09-26 11:00:00' } });
    expect(fromInput()).toBeTruthy();
    expect(toInput()).toBeTruthy();
    expect(typeSelect()).toBeTruthy();
    expect(new URLSearchParams(window.location.search).has('fromAt')).toBe(false);

    fireEvent.change(toInput(), { target: { value: '2026-09-26 12:00:00' } });
    expect(applyButton().textContent).toMatch(/^적용 \(4\)$/);
    fireEvent.click(applyButton());

    await waitFor(() => expect(f.calls).toHaveLength(1));
    expect(f.calls[0]).toMatchObject({ type: 'equipment', targetId: 'MEM-ETCH-0101', fromAt: FROM, toAt: TO, page: 1, pageSize: 25 });
    expect(new URLSearchParams(window.location.search).has('page')).toBe(false);
  });

  it('treats a one-sided URL as an open range shown in viewer-local time', async () => {
    const f = renderAudit(`/admin/audit?${new URLSearchParams({ fromAt: FROM })}`);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(clearButton()).toBeTruthy();
    expect((fromInput() as HTMLInputElement).value).toBe('2026-09-26 11:00:00');
    expect((toInput() as HTMLInputElement).value).toBe('');
    await waitFor(() => expect(f.calls).toHaveLength(1));
    expect(f.calls[0]).toMatchObject({ fromAt: FROM, page: 1, pageSize: 25 });
    expect(f.calls[0].toAt).toBeUndefined();
  });

  it('names a calendar-invalid deeplink and queries after that field is corrected', async () => {
    const f = renderAudit(`/admin/audit?${new URLSearchParams({ fromAt: '2026-02-30T00:00:00.000Z', toAt: TO })}`);
    expect(screen.getByRole('alert').textContent).toContain('시각 이후 “2026-02-30T00:00:00.000Z”');
    expect(screen.getByRole('alert').textContent).not.toContain('필터 값이 잘못되었습니다.');
    expect((fromInput() as HTMLInputElement).value).toBe('2026-02-30T00:00:00.000Z');
    expect((toInput() as HTMLInputElement).value).toBe('2026-09-26 12:00:00');
    expect(f.calls).toHaveLength(0);

    fireEvent.change(fromInput(), { target: { value: '2026-09-26 11:00:00' } });
    fireEvent.click(applyButton());

    await waitFor(() => expect(f.calls).toHaveLength(1));
    expect(f.calls[0]).toMatchObject({ fromAt: FROM, toAt: TO, page: 1, pageSize: 25 });
  });

  it('tells a nonexistent date deeplink from an unreadable format, ko and en', () => {
    renderAudit(`/admin/audit?${new URLSearchParams({ fromAt: '2026-02-30T00:00:00Z' })}`);
    expect(screen.getByRole('alert').textContent).toContain('시각 이후 “2026-02-30T00:00:00Z”');
    expect(screen.getByRole('alert').textContent).toContain('달력에 없는 날짜입니다.');
    expect(screen.getByRole('alert').textContent).not.toContain('필터 값이 잘못되었습니다.');
    cleanup();
    renderAudit(`/admin/audit?${new URLSearchParams({ fromAt: '2026-02-30T00:00:00' })}`);
    expect(screen.getByRole('alert').textContent).toContain('시각 이후 “2026-02-30T00:00:00”');
    expect(screen.getByRole('alert').textContent).toContain('날짜·시각 형식을 읽을 수 없습니다.');
    expect(screen.getByRole('alert').textContent).not.toContain('필터 값이 잘못되었습니다.');
    cleanup();
    const storage = memoryStorage();
    storage.setItem('platform:lang', 'en');
    vi.stubGlobal('localStorage', storage);
    renderAudit(`/admin/audit?${new URLSearchParams({ fromAt: '2026-02-30T00:00:00Z' })}`);
    expect(screen.getByRole('alert').textContent).toContain('At or after “2026-02-30T00:00:00Z”');
    expect(screen.getByRole('alert').textContent).toContain('The date does not exist on the calendar.');
    expect(screen.getByRole('alert').textContent).not.toContain('Invalid filter value.');
    cleanup();
    renderAudit(`/admin/audit?${new URLSearchParams({ fromAt: '2026-02-30T00:00:00' })}`);
    expect(screen.getByRole('alert').textContent).toContain('At or after “2026-02-30T00:00:00”');
    expect(screen.getByRole('alert').textContent).toContain('The date and time format cannot be read.');
    expect(screen.getByRole('alert').textContent).not.toContain('Invalid filter value.');
  });

  it('a single bad key outside the time fields quotes the field and raw value and adds no cause line', () => {
    renderAudit('/admin/audit?type=bogus');
    const alert = screen.getByRole('alert');
    expect([...alert.querySelectorAll('p')].map(p => p.textContent)).toEqual(['대상 유형 “bogus”은 이 화면에서 쓸 수 없는 값입니다. 조건을 초기화하세요.']);
    expect(alert.textContent).toContain('필터 값이 올바르지 않습니다');
    expect(alert.textContent).not.toContain('필터 값이 잘못되었습니다.');
  });

  it('a target id without a type keeps its cause sentence under the filter title', () => {
    renderAudit('/admin/audit?targetId=EQ-1');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('대상 ID는 대상 유형과 함께 있어야 합니다.');
    expect(alert.textContent).not.toContain('필터 값이 잘못되었습니다.');
  });

  it('keeps a reversed deeplink editable until the end is later than the start', async () => {
    const f = renderAudit(`/admin/audit?${new URLSearchParams({ fromAt: TO, toAt: FROM })}`);
    expect(screen.getByRole('alert').textContent).toMatch(/시각 미만은 시각 이후보다 뒤여야/);
    expect(screen.getByRole('alert').textContent).not.toContain('필터 값이 잘못되었습니다.');
    expect((fromInput() as HTMLInputElement).value).toBe('2026-09-26 12:00:00');
    expect((toInput() as HTMLInputElement).value).toBe('2026-09-26 11:00:00');
    expect(f.calls).toHaveLength(0);

    fireEvent.change(toInput(), { target: { value: '2026-09-26 13:00:00' } });
    fireEvent.click(applyButton());

    await waitFor(() => expect(f.calls).toHaveLength(1));
    expect(instantEpochMs(f.calls[0]?.fromAt ?? '')).toBe(instantEpochMs(TO));
    expect(f.calls[0]?.toAt).toBe('2026-09-26T04:00:00.000Z');
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
      // Rows arrive after the table mounts (loading state); wait for them before reading cells synchronously.
      await within(table).findByText('MEM-ETCH-0101');
      expect(within(table).getByText('MEM-ETCH-0101')).toBeTruthy();
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

  // #399 UX-1: 삭제한 주석 문구가 reason에 남으므로 감사 표에서 읽을 수 있어야 한다(길면 말줄임, 전문은 title).
  it('shows the recorded reason in its own column, with the full text in the title and a dash when empty', async () => {
    const restore = withRowLayout();
    try {
      const reason = '삭제된 주석 문구가 아주 길어서 셀 폭을 넘는 경우에도 전문을 title로 읽을 수 있어야 한다';
      renderAudit('/admin/audit', [{ ...EVENT, reason }, { ...EVENT, id: 'a2', changes: undefined, target: { ...EVENT.target, id: 'MEM-ETCH-0102' } }]);
      const table = await screen.findByRole('table', { name: '변경 감사 목록' });
      // Rows arrive after the table mounts (loading state); wait for them before reading cells synchronously.
      await within(table).findByText('MEM-ETCH-0101');
      const headers = within(table).getAllByRole('columnheader');
      const index = headers.findIndex(h => h.textContent?.includes('사유'));
      expect(index).toBeGreaterThan(-1);
      expect(headers.at(-1)?.textContent).toContain('동작');
      const cellOf = (id: string) => within(within(table).getByText(id).closest('[role="row"]') as HTMLElement).getAllByRole('cell')[index];
      expect(within(cellOf('MEM-ETCH-0101')).getByText(reason).getAttribute('title')).toBe(reason);
      expect(cellOf('MEM-ETCH-0102').textContent).toBe('—');
      fireEvent.click(screen.getByRole('button', { name: '컬럼' }));
      expect(await screen.findByRole('checkbox', { name: /사유/ })).toBeTruthy();
    } finally { restore(); }
  });

  // W-302 FIX1: 알 수 없는 대상 유형은 원문으로 보인다. `constructor`·`toString`·`__proto__` 같은 상속 키도
  // 빈 셀이 되지 않는다(원래 Object.prototype의 속성을 찾아 label이 undefined였다).
  it('shows unknown target types as raw wire values, including inherited-key names', async () => {
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return (this as Element).getAttribute('role') === 'row' ? 32 : 420; } });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return 800; } });
    try {
      renderAudit('/admin/audit', [{ ...EVENT, id: 'a2', target: { type: 'constructor', id: 'X-1', scopeId: null } }]);
      const table = await screen.findByRole('table', { name: '변경 감사 목록' });
      // Rows arrive after the table mounts (loading state); wait for them before reading cells synchronously.
      await within(table).findByText('constructor');
      expect(within(table).getByText('constructor')).toBeTruthy();
    } finally {
      if (originalOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
      if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth);
    }
  });

  function withRowLayout() {
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return (this as Element).getAttribute('role') === 'row' ? 32 : 420; } });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return 800; } });
    return () => {
      if (originalOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
      if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth);
    };
  }

  it('applies the viewer-local time of a shown row as that row instant and excludes the row at the end bound', async () => {
    const restore = withRowLayout();
    try {
      const local = '2026-09-26 11:10:00';
      const f = renderAudit('/admin/audit', [EVENT], { filterWindow: true });
      const table = await screen.findByRole('table', { name: '변경 감사 목록' });
      // Rows arrive after the table mounts (loading state); wait for them before reading cells synchronously.
      await within(table).findByText('MEM-ETCH-0101');
      expect(within(table).getByText(/11:10/)).toBeTruthy();
      expect(within(table).queryByText(/02:10/)).toBeNull();
      expect(within(table).getByText('MEM-ETCH-0101')).toBeTruthy();

      fireEvent.change(fromInput(), { target: { value: local } });
      fireEvent.click(applyButton());
      await waitFor(() => expect(f.calls.some(call => call.fromAt !== undefined)).toBe(true));
      const fromCall = f.calls.at(-1);
      expect(instantEpochMs(fromCall?.fromAt ?? '')).toBe(instantEpochMs(EVENT.at));
      expect(instantEpochMs(new URLSearchParams(window.location.search).get('fromAt') ?? '')).toBe(instantEpochMs(EVENT.at));
      expect(await screen.findByText('MEM-ETCH-0101')).toBeTruthy();

      fireEvent.change(fromInput(), { target: { value: '' } });
      fireEvent.change(toInput(), { target: { value: local } });
      fireEvent.click(applyButton());
      await waitFor(() => expect(f.calls.at(-1)?.toAt).toBe(EVENT.at));
      const toCall = f.calls.at(-1);
      expect(toCall?.fromAt).toBeUndefined();
      expect(instantEpochMs(new URLSearchParams(window.location.search).get('toAt') ?? '')).toBe(instantEpochMs(EVENT.at));
      expect(new URLSearchParams(window.location.search).has('fromAt')).toBe(false);
      await waitFor(() => expect(screen.queryByText('MEM-ETCH-0101')).toBeNull());
    } finally {
      restore();
    }
  });

  it('writes the original instant back when only the actor draft changes', async () => {
    const from = '2026-09-26T02:00:00.500Z';
    const to = '2026-09-26T05:00:00.500Z';
    renderAudit(`/admin/audit?${new URLSearchParams({ fromAt: from, toAt: to })}`);
    expect((fromInput() as HTMLInputElement).value).toBe('2026-09-26 11:00:00');
    expect((toInput() as HTMLInputElement).value).toBe('2026-09-26 14:00:00');
    fireEvent.change(actorInput(), { target: { value: 'park.seo' } });
    fireEvent.click(applyButton());
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('actor')).toBe('park.seo'));
    expect(new URLSearchParams(window.location.search).get('fromAt')).toBe(from);
    expect(new URLSearchParams(window.location.search).get('toAt')).toBe(to);
  });

  it('keeps each New York fold instant when the time fields are not edited', async () => {
    viewerTz.value = 'America/New_York';
    const to = '2026-11-01T12:00:00.000Z';
    for (const from of ['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z']) {
      cleanup();
      renderAudit(`/admin/audit?${new URLSearchParams({ fromAt: from, toAt: to })}`);
      expect((fromInput() as HTMLInputElement).value).toBe('2026-11-01 01:30:00');
      expect(fromInput().hasAttribute('aria-invalid')).toBe(false);
      fireEvent.change(actorInput(), { target: { value: 'park.seo' } });
      fireEvent.click(applyButton());
      await waitFor(() => expect(new URLSearchParams(window.location.search).get('actor')).toBe('park.seo'));
      expect(new URLSearchParams(window.location.search).get('fromAt')).toBe(from);
      expect(new URLSearchParams(window.location.search).get('toAt')).toBe(to);
      expect(screen.queryByRole('alert')).toBeNull();
    }
  });

  it('marks a bad time field and does not change the URL', async () => {
    const f = renderAudit('/admin/audit?type=equipment');
    await waitFor(() => expect(f.calls).toHaveLength(1));
    fireEvent.change(fromInput(), { target: { value: '2026-02-30 10:00:00' } });
    fireEvent.click(applyButton());
    expect(fromInput().getAttribute('aria-invalid')).toBe('true');
    const describedBy = fromInput().getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? '')?.textContent).toMatch(/없는 날짜/);
    expect(new URLSearchParams(window.location.search).has('fromAt')).toBe(false);
    expect(new URLSearchParams(window.location.search).get('type')).toBe('equipment');
    expect(f.calls).toHaveLength(1);

    fireEvent.change(fromInput(), { target: { value: '2026-09-26 12:00:00' } });
    fireEvent.change(toInput(), { target: { value: '2026-09-26 11:00:00' } });
    fireEvent.click(applyButton());
    expect(toInput().getAttribute('aria-invalid')).toBe('true');
    expect(fromInput().hasAttribute('aria-invalid')).toBe(false);
    expect(document.getElementById(toInput().getAttribute('aria-describedby') ?? '')?.textContent).toMatch(/뒤여야/);
    expect(new URLSearchParams(window.location.search).has('toAt')).toBe(false);
    expect(new URLSearchParams(window.location.search).get('type')).toBe('equipment');
  });

  it('labels the time fields in English without contract words', () => {
    const storage = memoryStorage();
    storage.setItem('platform:lang', 'en');
    vi.stubGlobal('localStorage', storage);
    renderAudit('/admin/audit');
    const bar = screen.getByTestId('page-filter-bar');
    expect(bar.textContent).not.toMatch(/ISO|instant/i);
    expect(screen.getByRole('textbox', { name: 'At or after' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Before' })).toBeTruthy();
  });
});

describe('AuditTrail draft + apply (ADR-0037)', () => {
  it('keeps Apply disabled until a field changed, counts changed fields, and hides the reset without an applied filter', async () => {
    const f = renderAudit('/admin/audit');
    await waitFor(() => expect(f.calls).toHaveLength(1));
    expect((applyButton() as HTMLButtonElement).disabled).toBe(true);
    expect(applyButton().textContent).toMatch(/^(적용|Apply)$/);
    expect(screen.queryByRole('button', { name: /Clear filters|필터 초기화/ })).toBeNull();
    fireEvent.change(actorInput(), { target: { value: 'a' } });
    fireEvent.change(actorInput(), { target: { value: 'ab' } });
    expect((applyButton() as HTMLButtonElement).disabled).toBe(false);
    expect(applyButton().textContent).toMatch(/^적용 \(1\)$/);
    fireEvent.change(actorInput(), { target: { value: '' } });
    expect((applyButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it('writes every drafted field and the page reset in one navigation', async () => {
    const f = renderAudit('/admin/audit?page=1');
    await waitFor(() => expect(f.calls).toHaveLength(1));
    const push = vi.spyOn(window.history, 'pushState');
    await chooseType('설비');
    fireEvent.change(actorInput(), { target: { value: 'park.seo' } });
    fireEvent.click(applyButton());
    expect(push).toHaveBeenCalledTimes(1);
    expect(new URLSearchParams(window.location.search).get('type')).toBe('equipment');
    expect(new URLSearchParams(window.location.search).get('actor')).toBe('park.seo');
    await waitFor(() => expect(f.calls.at(-1)).toMatchObject({ type: 'equipment', actor: 'park.seo', page: 1 }));
    expect((applyButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it('clears applied values and drafts together, and the reset is shown only while a filter is applied', async () => {
    const f = renderAudit('/admin/audit?type=equipment');
    await waitFor(() => expect(f.calls).toHaveLength(1));
    fireEvent.change(actorInput(), { target: { value: 'draft-only' } });
    fireEvent.click(clearButton());
    await waitFor(() => expect(new URLSearchParams(window.location.search).has('type')).toBe(false));
    expect((actorInput() as HTMLInputElement).value).toBe('');
    expect((applyButton() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /Clear filters|필터 초기화/ })).toBeNull();
  });

  it('offers the clear in the empty state while a filter is applied, and it clears the filter', async () => {
    window.history.replaceState(null, '', '/admin/audit?type=equipment');
    const adapter = testAdapter({
      session: () => session,
      auditTrail: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }) satisfies ApiResponse<AuditTrailPage>,
    });
    render(<I18nProvider><PlatformProvider equipmentAxes={equipmentAxes} adapter={adapter} registry={registry}><AuditTrail /></PlatformProvider></I18nProvider>);
    await screen.findByText(/조건에 맞는 결과가 없습니다|No matching result/);
    const clears = screen.getAllByRole('button', { name: /Clear filters|필터 초기화/ });
    expect(clears).toHaveLength(2);
    fireEvent.click(clears.find(button => !button.closest('form'))!);
    await waitFor(() => expect(new URLSearchParams(window.location.search).has('type')).toBe(false));
  });

  it.each([
    ['fromAt', fromInput, FROM],
    ['toAt', toInput, FROM],
  ] as const)('applies a changed custom %s time once on Enter and keeps input focus', async (key, getInput, instant) => {
    const f = renderAudit('/admin/audit?page=1');
    await waitFor(() => expect(f.calls).toHaveLength(1));
    const push = vi.spyOn(window.history, 'pushState');
    const input = getInput();
    fireEvent.change(input, { target: { value: '2026-09-26 11:00:00' } });
    input.focus();
    expect(push).not.toHaveBeenCalled();
    expect(f.calls).toHaveLength(1);

    pressEnter(input);

    await waitFor(() => expect(f.calls).toHaveLength(2));
    expect(push).toHaveBeenCalledTimes(1);
    expect(new URLSearchParams(window.location.search).get(key)).toBe(instant);
    expect(new URLSearchParams(window.location.search).has('page')).toBe(false);
    expect(f.calls[1]).toMatchObject({ [key]: instant, page: 1 });
    expect((applyButton() as HTMLButtonElement).disabled).toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it('keeps focus on Apply when validation fails', () => {
    renderAudit('/admin/audit');
    fireEvent.change(fromInput(), { target: { value: '2026-02-30 10:00:00' } });
    applyButton().focus();
    fireEvent.click(applyButton());
    expect(fromInput().getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(applyButton());
  });

  it('keeps the reset in the invalid-URL alert even when no filter key is applied', () => {
    renderAudit('/admin/audit?sort=bogus');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('정렬 “bogus”');
    expect(within(alert).getByRole('button', { name: /^(Reset|초기화)$/ })).toBeTruthy();
    expect(within(alert).queryByRole('button', { name: /Clear filters|필터 초기화/ })).toBeNull();
  });

  it('sort only: 초기화 keeps the applied filters and drops sort', () => {
    renderAudit('/admin/audit?type=equipment&actor=lee.s&sort=nope');
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: '초기화' }));
    const params = new URLSearchParams(window.location.search);
    expect(params.get('type')).toBe('equipment');
    expect(params.get('actor')).toBe('lee.s');
    expect(params.has('sort')).toBe(false);
  });

  it('a filter key error wins over a bad sort, and its 필터 초기화 leaves focus off BODY', () => {
    renderAudit('/admin/audit?type=bogus&sort=nope');
    const alert = screen.getByRole('alert');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(within(alert).queryByRole('button', { name: '초기화' })).toBeNull();
    fireEvent.click(within(alert).getByRole('button', { name: '필터 초기화' }));
    expect(window.location.search).not.toMatch(/type=|sort=/);
    expect(document.activeElement).not.toBe(document.body);
  });

  describe('draft reconciliation with the URL', () => {
    const visit = (query: Record<string, string>) => act(() => {
      window.history.pushState(null, '', `/admin/audit?${new URLSearchParams(query)}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    const A = '2026-09-26T02:00:00.100Z';
    const B = '2026-09-26T02:00:00.900Z';

    it('rebases on Back/Forward between raw instants whose displayed text is equal, and keeps the new raw instant on apply', async () => {
      renderAudit(`/admin/audit?${new URLSearchParams({ fromAt: A })}`);
      expect((fromInput() as HTMLInputElement).value).toBe('2026-09-26 11:00:00');
      fireEvent.change(actorInput(), { target: { value: 'edit' } });
      visit({ fromAt: B });
      expect((actorInput() as HTMLInputElement).value).toBe('');
      expect((fromInput() as HTMLInputElement).value).toBe('2026-09-26 11:00:00');
      fireEvent.change(actorInput(), { target: { value: 'park.seo' } });
      fireEvent.click(applyButton());
      await waitFor(() => expect(new URLSearchParams(window.location.search).get('actor')).toBe('park.seo'));
      expect(new URLSearchParams(window.location.search).get('fromAt')).toBe(B);
    });

    it('clears the time metadata (touched, error) on navigation and preserves the new raw instant on actor-only apply', async () => {
      const f = renderAudit('/admin/audit');
      fireEvent.change(fromInput(), { target: { value: '2026-02-30 10:00:00' } });
      fireEvent.click(applyButton());
      expect(fromInput().getAttribute('aria-invalid')).toBe('true');
      visit({ fromAt: A });
      expect(fromInput().hasAttribute('aria-invalid')).toBe(false);
      expect((fromInput() as HTMLInputElement).value).toBe('2026-09-26 11:00:00');
      fireEvent.change(actorInput(), { target: { value: 'park.seo' } });
      fireEvent.click(applyButton());
      await waitFor(() => expect(f.calls.at(-1)).toMatchObject({ actor: 'park.seo', fromAt: A }));
      expect(new URLSearchParams(window.location.search).get('fromAt')).toBe(A);
    });

    it('rebases the displayed time when the viewer time zone changes', () => {
      renderAudit(`/admin/audit?${new URLSearchParams({ fromAt: FROM })}`);
      expect((fromInput() as HTMLInputElement).value).toBe('2026-09-26 11:00:00');
      viewerTz.value = 'America/New_York';
      visit({ fromAt: FROM, sort: 'actor:desc' });
      expect((fromInput() as HTMLInputElement).value).toBe('2026-09-25 22:00:00');
    });

    it('rebases on a Select-only applied change', () => {
      renderAudit('/admin/audit');
      fireEvent.change(actorInput(), { target: { value: 'edit' } });
      visit({ source: 'user' });
      expect((actorInput() as HTMLInputElement).value).toBe('');
      expect((applyButton() as HTMLButtonElement).disabled).toBe(true);
    });

    it('keeps edits across an unchanged-applied rerender and a non-filter URL change', async () => {
      renderAudit('/admin/audit');
      fireEvent.change(actorInput(), { target: { value: 'edit' } });
      fireEvent.change(fromInput(), { target: { value: '2026-02-30 10:00:00' } });
      visit({ sort: 'actor:desc' });
      expect((actorInput() as HTMLInputElement).value).toBe('edit');
      expect((fromInput() as HTMLInputElement).value).toBe('2026-02-30 10:00:00');
      expect(applyButton().textContent).toMatch(/^적용 \(2\)$/);
    });
  });
});

describe('AuditTrail out-of-range page (#314)', () => {
  it('replaces page with the last page, keeps the sort, and does not push history', async () => {
    const items = Array.from({ length: 26 }, (_, i) => ({ ...EVENT, id: `a${i}` }));
    const start = window.history.length;
    const push = vi.spyOn(window.history, 'pushState');
    const replace = vi.spyOn(window.history, 'replaceState');
    const f = renderAudit('/admin/audit?sort=actor:desc&page=9', items);
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('page')).toBe('2'));
    expect(new URLSearchParams(window.location.search).get('sort')).toBe('actor:desc');
    expect(window.history.length).toBe(start);
    expect(push).not.toHaveBeenCalled();
    expect(replace.mock.calls.some(call => String(call[2]).includes('page=2'))).toBe(true);
    // The URL is replaced before the table refetches page 2, so wait for the fetch too (CI flake, slice 14).
    await waitFor(() => expect(f.calls.map(call => call.page)).toEqual([9, 2]));
    expect(f.calls.every(call => call.sort?.field === 'actor' && call.sort.desc === true)).toBe(true);
  });
});

const equipmentAxes = [
  { id: 'stgroup', label: { ko: 'StGroup', en: 'StGroup' }, membershipHistory: false },
  { id: 'team', label: { ko: '분임조', en: 'Team' }, membershipHistory: false },
  { id: 'maker', label: { ko: 'Maker', en: 'Maker' }, membershipHistory: false },
  { id: 'model', label: { ko: 'Model', en: 'Model' }, membershipHistory: false, dependsOn: 'maker' },
];
