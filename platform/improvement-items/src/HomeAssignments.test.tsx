import { Suspense } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { filterRows, groupId, validateFilters, type ApiResponse, type PlatformAdapter, type Session } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { manifests } from './index';
import { filterSpecs, type ListParams, type Status } from './endpoints';
import { filtersForView } from './model';
import { improvementHomeTodoSlot } from './home-todo-slot';

const registry = createRegistry({ spaces: [testSpace({ homeMenuId: 'test-home' })], menus: [...manifests, { ...manifests[0]!, id: 'test-home', path: '/test-home', group: groupId('test'), primary: true }], groups: [{ id: groupId('test'), label: { ko: 'Test', en: 'Test' }, icon: manifests[0]!.icon, space: testSpace().id }, { id: groupId('improvementItems'), label: { ko: '개선 아이템', en: 'Improvement items' }, icon: manifests[0]!.icon, space: null }] });
const persisted = memoryStorage();
const reply = (total: number): ApiResponse<unknown> => ({ outcome: total ? 'ok' : 'empty', data: { rows: [], total }, assessments: [], trust: null, correlationId: 'fixture' });
function mount(menuQuery: PlatformAdapter['menuQuery'], lang = 'ko', permissions: Session['user']['permissions'] = ['platform:view']) {
  persisted.setItem('platform:lang', lang);
  window.history.replaceState(null, '', '/test-home?v=1&scopeId=MEM');
  const session = testSession(permissions);
  const adapter = testAdapter({ session: () => session, menuQuery });
  const { Todo } = improvementHomeTodoSlot;
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Suspense fallback={null}><Todo /></Suspense></PlatformProvider></I18nProvider>);
}
beforeEach(() => { persisted.clear(); vi.stubGlobal('localStorage', persisted); vi.stubGlobal('sessionStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('home improvement assignments (#1328 e2)', () => {
  it('reserves the card while both counts load', async () => {
    mount(() => new Promise(() => {}));
    const card = await screen.findByRole('region', { name: '내 담당 개선 아이템' });
    expect(card.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByText('불러오는 중…')).toBeTruthy();
    expect(screen.queryByText('담당 건수 없음')).toBeNull();
  });
  it.each(['ko', 'en'])('shows an explicit quiet zero and keeps the saved-view link (%s)', async lang => {
    mount(async () => reply(0), lang);
    expect(await screen.findByText(lang === 'ko' ? '담당 건수 없음' : 'No assigned items')).toBeTruthy();
    expect(screen.getByRole('link', { name: lang === 'ko' ? '내 담당 개선 아이템 0건 · 목록 열기' : '0 open improvement items assigned to me · Open list' })).toBeTruthy();
    expect(screen.queryByText(/조치 완료 · 효과 확인 대기/)).toBeNull();
  });
  it.each(['ko', 'en'])('counts the same open assignments as the saved view, including done, from total (%s)', async lang => {
    const rows = [
      ...(['open', 'in_progress', 'done', 'verified', 'dropped'] as Status[]).map(status => ({ status, assignee: 'me' })),
      { status: 'open', assignee: 'other' }, { status: 'done', assignee: 'other' }, { status: 'open', assignee: null },
    ];
    const requests: ListParams[] = [];
    mount(async request => {
      expect(request.endpoint).toBe('improvement.items');
      const params = request.params as ListParams;
      requests.push(params);
      expect(validateFilters(params.filters ?? [], filterSpecs).ok).toBe(true);
      const matching = filterRows(rows, params.filters, (row, id) => row[id as keyof typeof row], { specs: filterSpecs });
      return { ...reply(matching.length), data: { rows: matching.slice(0, params.pageSize), total: matching.length } };
    }, lang);
    const link = await screen.findByRole('link', { name: lang === 'ko' ? '내 담당 개선 아이템 3건 · 목록 열기' : '3 open improvement items assigned to me · Open list' });
    expect(screen.getByText(lang === 'ko' ? '조치 완료 · 효과 확인 대기 1건' : 'Done · Awaiting effect check: 1')).toBeTruthy();
    expect(requests).toHaveLength(2);
    expect(requests.every(p => p.page === 0 && p.pageSize === 1)).toBe(true);
    expect(requests.some(p => JSON.stringify(p.filters) === JSON.stringify(filtersForView('mine')))).toBe(true);
    const url = new URL(link.getAttribute('href')!, window.location.origin);
    expect(url.pathname).toBe('/improvement-items');
    expect(url.searchParams.get('view')).toBe('mine');
    expect(url.searchParams.get('scopeId')).toBe('MEM');
    expect(url.searchParams.getAll('filter')).toEqual(['assignee:in:me', 'status:notIn:verified~dropped']);
    for (const key of ['q', 'page', 'sort', 'focus', 'origin']) expect(url.searchParams.has(key)).toBe(false);
  });
  it('recovers both reads on retry without displaying a raw error', async () => {
    let failed = true;
    mount(async () => failed ? { ...reply(0), outcome: 'error', data: null, error: { message: 'private backend exception' } } : reply(2));
    expect(await screen.findByText('담당 건수를 불러오지 못했습니다.')).toBeTruthy();
    expect(document.body.textContent).not.toContain('private backend exception');
    failed = false;
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByRole('link', { name: '내 담당 개선 아이템 2건 · 목록 열기' })).toBeTruthy();
  });
  it('does not claim zero when the secondary count is refused', async () => {
    mount(async request => (request.params as ListParams).filters?.some(f => f.id === 'status' && f.op === 'in') ? { ...reply(0), outcome: 'forbidden', data: null } : reply(3));
    expect(await screen.findByText('담당 건수를 볼 권한이 없습니다.')).toBeTruthy();
    expect(screen.queryByText('담당 건수 없음')).toBeNull();
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();
  });
  it('does not request data when the menu is unavailable', async () => {
    const read = vi.fn(async () => reply(3));
    mount(read, 'ko', []);
    expect(await screen.findByText('담당 건수를 볼 권한이 없습니다.')).toBeTruthy();
    expect(read).not.toHaveBeenCalled();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
