import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const ACTION_KO = { create: '생성', update: '변경', retire: '사용중지', sync: '동기화', delete: '삭제' } as const;

const line = () => document.querySelector<HTMLElement>('[data-filter-line]')!;
const body = (id: string) => line().querySelector<HTMLElement>(`[data-filter-body="${id}"]`)!;
const chip = (id: string) => line().querySelector<HTMLElement>(`[data-column-filter-chip="${id}"]`);
const NAME: Record<string, string> = { at: '시각', actor: '행위자', action: '작업', source: '출처', targetType: '대상 유형', targetId: '대상 ID' };
const openField = async (id: string) => {
  fireEvent.click(body(id));
  return screen.findByRole('dialog', { name: NAME[id] });
};
const apply = (dialog: HTMLElement) => fireEvent.click(within(dialog).getByRole('button', { name: '적용' }));
const applyText = async (id: string, value: string) => {
  const dialog = await openField(id);
  fireEvent.change(within(dialog).getByRole('textbox', { name: '값' }), { target: { value } });
  apply(dialog);
};
const applyOne = async (id: string, label: string) => {
  const dialog = await openField(id);
  fireEvent.click(within(dialog).getByRole('radio', { name: label }));
  apply(dialog);
};
const pick = (id: string) => waitFor(() => { const el = document.querySelector<HTMLElement>(`[data-filter-pick="${id}"]`); if (!el) throw new Error('no pick'); return el; });
const url = () => new URLSearchParams(window.location.search);
// The editor reads and writes datetime-local text in the machine zone, so expected instants are derived the same way.
const localIso = (text: string) => new Date(text).toISOString();

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

describe('AuditTrail filter model (ADR-0105, #1217 e2)', () => {
  it('has the table filter line and no rail: 작업 and 행위자 pinned in that order, the rest under + 필터', async () => {
    const f = renderAudit('/admin/audit');
    await waitFor(() => expect(f.calls).toHaveLength(1));
    expect(screen.queryByTestId('page-filter-bar')).toBeNull();
    expect(screen.queryByRole('region', { name: '필터' })).toBeNull();
    expect([...line().querySelectorAll('[data-filter-body]')].map(b => b.getAttribute('data-filter-body'))).toEqual(['action', 'actor']);
    expect(line().querySelector('[data-filter-add]')).toBeTruthy();
    expect(f.calls[0]).toEqual({ page: 1, pageSize: 25 });
  });

  it('maps 행위자 (exact, case-sensitive) and 작업 (one value) onto the port query and keeps the address clean', async () => {
    const f = renderAudit('/admin/audit?sort=actor:desc');
    await waitFor(() => expect(f.calls).toHaveLength(1));
    await applyText('actor', 'Park.Seo');
    await waitFor(() => expect(f.calls).toHaveLength(2));
    expect(f.calls[1]).toMatchObject({ actor: 'Park.Seo', page: 1, sort: { field: 'actor', desc: true } });
    await applyOne('action', ACTION_KO.update);
    await waitFor(() => expect(f.calls).toHaveLength(3));
    expect(f.calls[2]).toMatchObject({ actor: 'Park.Seo', action: 'update' });
    expect(url().has('filter')).toBe(false);
    expect(url().get('sort')).toBe('actor:desc');
    expect(chip('actor')!.textContent).toContain('Park.Seo');
  });

  it('offers 작업 and 출처 as single-choice (radio) lists', async () => {
    renderAudit('/admin/audit');
    const dialog = await openField('action');
    expect(within(dialog).queryAllByRole('checkbox')).toHaveLength(0);
    expect(within(dialog).getAllByRole('radio').map(r => r.closest('li')!.textContent)).toEqual(Object.values(ACTION_KO));
  });

  it('applies a 시각 range from the editor as half-open instants (from inclusive, to exclusive) and keeps one end open', async () => {
    const f = renderAudit('/admin/audit');
    await waitFor(() => expect(f.calls).toHaveLength(1));
    fireEvent.click(line().querySelector('[data-filter-add]')!);
    fireEvent.click(await pick('at'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('시작 (이상)'), { target: { value: '2026-09-26T11:00' } });
    apply(dialog);
    await waitFor(() => expect(f.calls).toHaveLength(2));
    expect(f.calls[1]).toMatchObject({ fromAt: localIso('2026-09-26T11:00') });
    expect(f.calls[1].toAt).toBeUndefined();
    const edit = await openField('at');
    fireEvent.change(within(edit).getByLabelText('끝 (미만)'), { target: { value: '2026-09-26T12:00' } });
    apply(edit);
    await waitFor(() => expect(f.calls).toHaveLength(3));
    expect(f.calls[2]).toMatchObject({ fromAt: localIso('2026-09-26T11:00'), toAt: localIso('2026-09-26T12:00') });
  });

  it('대상 ID needs 대상 유형: it cannot be added before the type, and removing the type removes it', async () => {
    const f = renderAudit('/admin/audit');
    await waitFor(() => expect(f.calls).toHaveLength(1));
    fireEvent.click(line().querySelector('[data-filter-add]')!);
    expect((await pick('targetId')).getAttribute('aria-disabled')).toBe('true');
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    fireEvent.click(line().querySelector('[data-filter-add]')!);
    fireEvent.click(await pick('targetType'));
    const typeDialog = await screen.findByRole('dialog');
    fireEvent.change(within(typeDialog).getByRole('textbox', { name: '값' }), { target: { value: 'equipment' } });
    apply(typeDialog);
    await waitFor(() => expect(f.calls).toHaveLength(2));
    fireEvent.click(line().querySelector('[data-filter-add]')!);
    fireEvent.click(await pick('targetId'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: '값' }), { target: { value: 'MEM-ETCH-0101' } });
    apply(dialog);
    await waitFor(() => expect(f.calls).toHaveLength(3));
    expect(f.calls[2]).toMatchObject({ type: 'equipment', targetId: 'MEM-ETCH-0101' });
    fireEvent.click(within(chip('targetType')!).getByRole('button', { name: /지우기/ }));
    await waitFor(() => expect(f.calls).toHaveLength(4));
    expect(f.calls[3]).toEqual({ page: 1, pageSize: 25 });
  });

  it('old ?actor= link: the same query, the address loses the key, the chip says 행위자', async () => {
    const f = renderAudit('/admin/audit?actor=park.seo');
    await waitFor(() => expect(f.calls[0]).toMatchObject({ actor: 'park.seo', page: 1, pageSize: 25 }));
    await waitFor(() => expect(url().has('actor')).toBe(false));
    expect(url().has('filter')).toBe(false);
    expect(chip('actor')!.textContent).toContain('행위자');
  });

  it('every old key maps to the same port query and leaves the address', async () => {
    const q = new URLSearchParams({ type: 'Future.Type:v2', targetId: 'abc', actor: 'a', action: 'sync', source: 'system', fromAt: FROM, toAt: TO });
    const f = renderAudit(`/admin/audit?${q}`);
    await waitFor(() => expect(f.calls.at(-1)).toEqual({ type: 'Future.Type:v2', targetId: 'abc', actor: 'a', action: 'sync', source: 'system', fromAt: FROM, toAt: TO, page: 1, pageSize: 25 }));
    await waitFor(() => expect([...q.keys()].some(k => url().has(k))).toBe(false));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a one-sided old fromAt link is an open range', async () => {
    const f = renderAudit(`/admin/audit?${new URLSearchParams({ fromAt: FROM })}`);
    await waitFor(() => expect(f.calls).toHaveLength(1));
    expect(f.calls[0]).toMatchObject({ fromAt: FROM, page: 1, pageSize: 25 });
    expect(f.calls[0].toAt).toBeUndefined();
  });

  it('keeps an old link with seconds exact: the instant is not rounded to the minute unless the user edits it', async () => {
    const from = '2026-09-26T02:00:00.500Z';
    const f = renderAudit(`/admin/audit?${new URLSearchParams({ fromAt: from })}`);
    await waitFor(() => expect(f.calls[0]).toMatchObject({ fromAt: from }));
    await applyText('actor', 'x');
    await waitFor(() => expect(f.calls.at(-1)).toMatchObject({ actor: 'x', fromAt: from }));
  });

  it.each([
    ['a calendar-invalid fromAt', { fromAt: '2026-02-30T00:00:00.000Z' }, '시각 이후'],
    ['a malformed type', { type: '9bogus' }, '대상 유형'],
    ['a target id without a type', { targetId: 'EQ-1' }, '대상 ID'],
    ['an unknown action', { action: 'explode' }, '작업'],
    ['a malformed actor', { actor: 'a b' }, '행위자'],
  ])('%s in an old link: a filter warning, no query, nothing repaired', (_name, params, fragment) => {
    const f = renderAudit(`/admin/audit?${new URLSearchParams(params)}`);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('필터 값이 올바르지 않습니다');
    expect(alert.textContent).not.toContain('정렬·페이지');
    expect(alert.textContent).toContain(Object.values(params)[0]!);
    expect(alert.textContent).toContain(fragment);
    expect(f.calls).toHaveLength(0);
    expect(Object.keys(params).every(k => url().has(k))).toBe(true);
  });

  it('a reversed old window is not repaired: the port is asked as written and answers its own error', async () => {
    const f = renderAudit(`/admin/audit?${new URLSearchParams({ fromAt: TO, toAt: FROM })}`);
    await waitFor(() => expect(f.calls[0]).toMatchObject({ fromAt: TO, toAt: FROM }));
  });

  it('filter warning reset (recoverKeys) clears the bad old keys only and keeps the sort', () => {
    renderAudit(`/admin/audit?${new URLSearchParams({ type: '9bogus', actor: 'ok', sort: 'actor:desc' })}`);
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: '초기화' }));
    expect(url().has('type')).toBe(false);
    expect(url().has('actor')).toBe(false);
    expect(url().get('sort')).toBe('actor:desc');
    expect(document.activeElement).not.toBe(document.body);
  });

  it('sort only: the sort/page title, the reset drops sort and keeps the conditions', async () => {
    renderAudit(`/admin/audit?${new URLSearchParams({ actor: 'park', sort: 'bogus' })}`);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('정렬·페이지 값이 올바르지 않습니다');
    fireEvent.click(within(alert).getByRole('button', { name: '초기화' }));
    expect(url().has('sort')).toBe(false);
    await waitFor(() => expect(chip('actor')).toBeTruthy());
  });

  it('a bad filter and a bad sort together: the combined title, one reset clears both', () => {
    renderAudit(`/admin/audit?${new URLSearchParams({ type: '9bogus', sort: 'bogus' })}`);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('정렬·페이지·필터 값이 올바르지 않습니다');
    fireEvent.click(within(alert).getByRole('button', { name: '초기화' }));
    expect(url().has('type')).toBe(false);
    expect(url().has('sort')).toBe(false);
  });

  it('a well-formed unknown type is queried as written', async () => {
    const f = renderAudit('/admin/audit?type=Future.Type%3Av2&targetId=abc');
    await waitFor(() => expect(f.calls[0]).toMatchObject({ type: 'Future.Type:v2', targetId: 'abc' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a malformed old type alerts and never issues an All query', () => {
    const f = renderAudit('/admin/audit?type=bad%20type');
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(f.calls).toHaveLength(0);
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
      // The adapter call keeps the raw filter values; the old keys are rewritten away.
      expect(f.calls[0]).toMatchObject({ type: 'equipment', source: 'user' });
      await waitFor(() => expect(new URLSearchParams(window.location.search).has('type')).toBe(false));
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

  it('#1159 UX-4 states the sort and room rule without calling the events synthetic, ko and en', async () => {
    // 1217c: the description sits in the ⓘ tooltip of the table toolbar, opened by focus.
    renderAudit('/admin/audit');
    fireEvent.focus(await screen.findByRole('button', { name: '설명' }));
    expect((await screen.findByRole('tooltip')).textContent).toBe('기본 정렬은 최신순이며 room 필터를 적용하지 않습니다.');
    expect(document.body.textContent).not.toMatch(/합성/);
    cleanup();
    const storage = memoryStorage();
    storage.setItem('platform:lang', 'en');
    vi.stubGlobal('localStorage', storage);
    renderAudit('/admin/audit');
    fireEvent.focus(await screen.findByRole('button', { name: 'Description' }));
    expect((await screen.findByRole('tooltip')).textContent).toBe('Default sort is newest first; no room filter is applied.');
    expect(document.body.textContent).not.toMatch(/Synthetic/i);
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
