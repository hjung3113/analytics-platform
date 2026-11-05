import type { PermissionGrantAdminItem } from '@ap/feature-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HostSeamProvider } from '@/lib/host/host-seam';
import { SystemVocPermissions, type SystemPermissionRow } from './VocPermissions';

const P = '00000000-0000-4000-8000-000000000001';
const A = '00000000-0000-4000-8000-000000000002';
const B = '00000000-0000-4000-8000-000000000003';
const U = '00000000-0000-4000-8000-000000000004';
const V = '00000000-0000-4000-8000-000000000005';
const G = '00000000-0000-4000-8000-000000000006';
const rows: SystemPermissionRow[] = [
  { key: P, id: P, name: '플랫폼', kind: 'platform', platform: true, archived: false, business: '—', link: '플랫폼 기본' },
  { key: A, id: A, name: '생산 분석', kind: 'space', platform: false, archived: false, business: '생산', link: '연결됨' },
  { key: B, id: B, name: '설비 점검', kind: 'manual', platform: false, archived: false, business: '—', link: '플랫폼 밖' },
];
const grant = (id = G, actor_id = U): PermissionGrantAdminItem => ({ id, actor_id, capability: 'voc.create', managed_system_id: A, granted_by_actor_id: V, granted_at: '2026-11-01T00:00:00Z', expires_at: null });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let modes: Record<string, 'open' | 'restricted'>;
let grants: ReturnType<typeof grant>[];
let writes: { method: string; path: string; body: Record<string, unknown> }[];
let fail: string;
let denied: boolean;
let failStatus: number;
let failRead: string;
let omitSystem: string;
beforeEach(() => {
  modes = { [P]: 'open', [A]: 'restricted', [B]: 'restricted' };
  grants = [grant()]; writes = []; fail = ''; denied = false; failStatus = 403; failRead = ''; omitSystem = '';
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input); const method = init?.method ?? 'GET';
    if (method !== 'GET') {
      const body = JSON.parse(String(init?.body)); writes.push({ method, path, body });
      if (fail && path.includes(fail)) return json({ code: 'permission.denied', message: failStatus === 422 ? 'platform_always_open' : 'denied' }, failStatus);
      if (method === 'PATCH') { const id = path.split('/').at(-1) ?? ''; modes[id] = body.voc_create_mode; return json({ id, voc_create_mode: modes[id] }); }
      if (path.endsWith('/revoke')) { grants = grants.filter(g => !path.includes(g.id)); return json({ id: G, revoked_at: '2026-11-05T00:00:00Z' }); }
      const next = { ...grant('00000000-0000-4000-8000-000000000007', String(body.actor_id)), managed_system_id: String(body.managed_system_id) };
      grants.push(next); return json(next, 201);
    }
    if (failRead && path.includes(failRead)) return json({ code: 'internal.unexpected', message: 'read failed' }, 500);
    if (path.includes('/me/permissions/check')) return json({ state: denied ? 'blocked_non_requestable' : 'approved', decision: { allow: !denied } });
    if (path.includes('/permissions/grants')) return json({ items: grants });
    if (path.includes('/actors?')) return json({ actors: [{ id: U, display_name: '김민서', email: 'u@example.com', role_level: 'user', actor_type: 'internal_member' }, { id: V, display_name: '이지훈', email: 'v@example.com', role_level: 'developer', actor_type: 'internal_member' }] });
    if (path.includes('/managed-systems?')) return json({ items: rows.filter(r => r.id !== omitSystem).map(r => ({ id: r.id, name: r.name, voc_create_mode: modes[r.id], archived_at: null })), total: rows.filter(r => r.id !== omitSystem).length });
    return json({}, 500);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={qc}><HostSeamProvider value={{ canLink: () => false, Link: ({ children }) => <span>{children}</span>, notifyError: () => {}, notifySuccess: () => {}, notify: () => 'notice', dismiss: () => {}, useHere: () => '/admin/managed-systems' }}><SystemVocPermissions rows={rows} fallback={<p>read only</p>} renderDetail={parts => <section role="dialog" aria-label={String(parts.title)}><button type="button" onClick={parts.requestClose}>닫기</button>{parts.body}</section>} /></HostSeamProvider></QueryClientProvider>);
  return qc;
}
async function open(name = '생산 분석') { fireEvent.click(await screen.findByRole('button', { name: `${name} VOC 등록 설정` })); return screen.getByRole('dialog'); }

describe('production system VOC permissions', () => {
  it('lists saved counts, warns for zero, locks platform and sorts/filters the column', async () => {
    mount();
    const table = await screen.findByRole('table');
    await screen.findByText('지정 1명');
    expect(within(table).getByText('지정 0명')).toBeInTheDocument();
    expect(within(table).getByText('Admin만 등록 가능')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '플랫폼 선택' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'VOC 등록 정렬' }));
    expect(table.querySelector('tbody tr:last-child')).toHaveTextContent('생산 분석');
    fireEvent.click(screen.getByRole('combobox', { name: 'VOC 등록 필터' }));
    fireEvent.click(await screen.findByRole('option', { name: '모두' }));
    expect(within(table).queryByText('생산 분석')).not.toBeInTheDocument();
  });
  it('saves mode plus scoped people adds/removes through the real APIs', async () => {
    mount(); const dialog = await open();
    fireEvent.click(await within(dialog).findByRole('button', { name: '김민서 제거' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '이지훈 추가' }));
    fireEvent.click(within(dialog).getByRole('radio', { name: '모두' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    await waitFor(() => expect(writes.filter(w => w.method === 'PATCH')).toHaveLength(1));
    await waitFor(() => expect(within(dialog).getByText('저장됨 · 모두')).toBeInTheDocument());
    expect(writes.find(w => w.path.endsWith('/permissions/grants'))?.body).toMatchObject({ capability: 'voc.create', managed_system_id: A, actor_id: V });
    expect(writes.some(w => w.path.endsWith(`/${G}/revoke`))).toBe(true);
    expect(modes[A]).toBe('open');
  });
  it('keeps per-system drafts across switching/close and discards explicitly', async () => {
    mount(); let dialog = await open();
    fireEvent.click(await within(dialog).findByRole('button', { name: '이지훈 추가' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }));
    await open('설비 점검');
    dialog = await open();
    expect(within(dialog).getByText('미저장 · 지정 2명')).toBeInTheDocument();
    expect(within(dialog).getByText('저장됨 · 지정 1명')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '초안 버리기' }));
    expect(within(dialog).queryByText(/미저장 ·/)).not.toBeInTheDocument();
    expect(writes).toHaveLength(0);
  });
  it('previews bulk impact, applies only modes, preserves drafts and undoes', async () => {
    mount(); const dialog = await open();
    fireEvent.click(await within(dialog).findByRole('button', { name: '이지훈 추가' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '생산 분석 선택' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '설비 점검 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '모두로' }));
    expect(writes).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '일괄 변경 취소' }));
    fireEvent.click(screen.getByRole('button', { name: '모두로' }));
    fireEvent.click(screen.getByRole('button', { name: '2개 시스템에 적용' }));
    await waitFor(() => expect(modes[A]).toBe('open'));
    await waitFor(() => expect(modes[B]).toBe('open'));
    expect(within(dialog).getByText('미저장 · 지정 2명')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: '일괄 변경 되돌리기' }));
    await waitFor(() => expect(modes[A]).toBe('restricted'));
    await waitFor(() => expect(modes[B]).toBe('restricted'));
    expect(writes.every(w => w.method === 'PATCH' && Object.keys(w.body).join() === 'voc_create_mode')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '지정한 사람만으로' }));
    expect(screen.getByText('이 중 1개는 지정 인원이 없어 Admin만 등록 가능')).toBeInTheDocument();
  });
  it('keeps a failed partial save draft and identifies completed and failed steps', async () => {
    mount(); const dialog = await open();
    fireEvent.click(await within(dialog).findByRole('button', { name: '이지훈 추가' }));
    fireEvent.click(within(dialog).getByRole('radio', { name: '모두' }));
    fail = `/managed-systems/${A}`;
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('등록 모드 저장 실패');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('사람 추가 1건');
    expect(within(dialog).getByText('미저장 · 모두')).toBeInTheDocument();
    fail = '';
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    await waitFor(() => expect(within(dialog).getByText('저장됨 · 모두')).toBeInTheDocument());
    expect(writes.filter(w => w.path.endsWith('/permissions/grants'))).toHaveLength(1);
  });
  it.each([403, 422])('keeps the drawer draft after a %s grant failure', async status => {
    mount(); const dialog = await open();
    fireEvent.click(await within(dialog).findByRole('button', { name: '이지훈 추가' }));
    fail = '/permissions/grants'; failStatus = status;
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('사람 추가 실패');
    expect(within(dialog).getByText('미저장 · 지정 2명')).toBeInTheDocument();
    expect(writes.some(w => w.method === 'PATCH')).toBe(false);
  });
  it('reports partial bulk failure and can undo only confirmed changes', async () => {
    mount(); await screen.findByText('지정 1명');
    fireEvent.click(screen.getByRole('checkbox', { name: '생산 분석 선택' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '설비 점검 선택' }));
    fail = `/managed-systems/${B}`; failStatus = 422;
    fireEvent.click(screen.getByRole('button', { name: '모두로' }));
    fireEvent.click(screen.getByRole('button', { name: '2개 시스템에 적용' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('설비 점검');
    expect(screen.getByRole('alert')).toHaveTextContent('완료 1개');
    expect(modes[A]).toBe('open'); expect(modes[B]).toBe('restricted');
    fail = '';
    await waitFor(() => expect(screen.getByRole('button', { name: '일괄 변경 되돌리기' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '일괄 변경 되돌리기' }));
    await waitFor(() => expect(modes[A]).toBe('restricted'));
    await waitFor(() => expect(screen.queryByRole('region', { name: '일괄 변경 적용 전 확인' })).not.toBeInTheDocument());
    expect(writes.filter(w => w.path.endsWith(B))).toHaveLength(1);
  });
  it('counts only active system-scoped grants and explains workspace grants separately', async () => {
    grants.push({ ...grant('00000000-0000-4000-8000-000000000008', V), managed_system_id: null });
    grants.push({ ...grant('00000000-0000-4000-8000-000000000009', V), expires_at: '2020-01-01T00:00:00Z' });
    grants.push({ ...grant('00000000-0000-4000-8000-000000000010', V), capability: 'voc.read' });
    mount(); const dialog = await open();
    expect(await within(dialog).findByText('저장됨 · 지정 1명')).toBeInTheDocument();
    expect(within(dialog).getByText(/워크스페이스 전체 VOC 등록 권한도/)).toBeInTheDocument();
  });
  it('invalidates a bulk undo snapshot when an affected system is individually saved', async () => {
    mount(); await screen.findByText('지정 1명');
    fireEvent.click(screen.getByRole('checkbox', { name: '생산 분석 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '모두로' }));
    fireEvent.click(screen.getByRole('button', { name: '1개 시스템에 적용' }));
    await screen.findByRole('button', { name: '일괄 변경 되돌리기' });
    const dialog = await open();
    fireEvent.click(within(dialog).getByRole('radio', { name: '지정한 사람만' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    await waitFor(() => expect(within(dialog).getByText('저장됨 · 지정 1명')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: '일괄 변경 되돌리기' })).not.toBeInTheDocument();
  });
  it('shows unknown settings on a failed read, disables writes, and retries', async () => {
    failRead = '/permissions/grants'; mount();
    await screen.findByText('VOC 등록 설정을 불러오지 못했습니다.');
    expect(screen.queryByText('지정 0명')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '생산 분석 선택' })).toBeDisabled();
    failRead = '';
    fireEvent.click(screen.getByRole('button', { name: '설정 다시 불러오기' }));
    await screen.findByText('지정 1명');
    expect(screen.getByRole('checkbox', { name: '생산 분석 선택' })).toBeEnabled();
  });
  it('keeps a missing linked system unknown and uneditable', async () => {
    omitSystem = B; mount(); await screen.findByText('지정 1명');
    const row = screen.getByRole('row', { name: '설비 점검 VOC 등록 설정 행' });
    expect(within(row).getByText('확인 필요')).toBeInTheDocument();
    expect(within(row).getByRole('checkbox')).toBeDisabled();
    const dialog = await open('설비 점검');
    expect(within(dialog).getByRole('radio', { name: '지정한 사람만' })).toBeDisabled();
  });
  it('has a locked platform drawer and never writes for a denied admin gate', async () => {
    mount(); const dialog = await open('플랫폼');
    expect(within(dialog).getByRole('radio', { name: '지정한 사람만' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: '저장' })).toBeDisabled();
    cleanup(); denied = true; mount();
    expect(await screen.findByText('read only')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(writes).toHaveLength(0);
  });
});
