// #1358 fix round (F1–F3): create-targets invalidation, saves judged against the latest server state, idempotency-key lifetime.
import type { PermissionGrantAdminItem } from '@ap/feature-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VOC_CREATE_TARGETS_QUERY_KEY } from '@/lib/api/voc-create-targets';
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
const grant = (id = G, actor_id = U, managed_system_id = A): PermissionGrantAdminItem => ({ id, actor_id, capability: 'voc.create', managed_system_id, granted_by_actor_id: V, granted_at: '2026-11-01T00:00:00Z', expires_at: null });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let modes: Record<string, 'open' | 'restricted'>;
let grants: PermissionGrantAdminItem[];
let writes: { method: string; path: string; body: Record<string, unknown>; key: string }[];
let failPatch: boolean;
let patchReturns: 'open' | 'restricted' | null;
let loseAddResponse: boolean;
let nextGrant: number;
beforeEach(() => {
  modes = { [P]: 'open', [A]: 'restricted', [B]: 'restricted' };
  grants = [grant()]; writes = []; failPatch = false; patchReturns = null; loseAddResponse = false; nextGrant = 7;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input); const method = init?.method ?? 'GET';
    if (method !== 'GET') {
      const body = JSON.parse(String(init?.body));
      writes.push({ method, path, body, key: String((init?.headers as Record<string, string>)['Idempotency-Key']) });
      if (method === 'PATCH') {
        if (failPatch) return json({ code: 'permission.denied', message: 'denied' }, 403);
        const id = path.split('/').at(-1) ?? ''; if (!patchReturns) modes[id] = body.voc_create_mode;
        return json({ id, voc_create_mode: patchReturns ?? modes[id] });
      }
      if (path.endsWith('/revoke')) { grants = grants.filter(g => !path.includes(g.id)); return json({ id: G, revoked_at: '2026-11-05T00:00:00Z' }); }
      const next = grant(`00000000-0000-4000-8000-0000000000${String(nextGrant++).padStart(2, '0')}`, String(body.actor_id), String(body.managed_system_id));
      grants.push(next);
      if (loseAddResponse) { loseAddResponse = false; throw new TypeError('network'); }
      return json(next, 201);
    }
    if (path.includes('/me/permissions/check')) return json({ state: 'approved', decision: { allow: true } });
    if (path.includes('/permissions/grants')) return json({ items: grants });
    if (path.includes('/actors?')) return json({ actors: [{ id: U, display_name: '김민서', email: 'u@example.com', role_level: 'user', actor_type: 'internal_member' }, { id: V, display_name: '이지훈', email: 'v@example.com', role_level: 'developer', actor_type: 'internal_member' }] });
    if (path.includes('/managed-systems?')) return json({ items: rows.map(r => ({ id: r.id, name: r.name, voc_create_mode: modes[r.id], archived_at: null })), total: rows.length });
    return json({}, 500);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={qc}><HostSeamProvider value={{ canLink: () => false, Link: ({ children }) => <span>{children}</span>, notifyError: () => {}, notifySuccess: () => {}, notify: () => 'notice', dismiss: () => {}, useHere: () => '/admin/managed-systems' }}><SystemVocPermissions rows={rows} fallback={<p>read only</p>} renderDetail={parts => <section role="dialog" aria-label={String(parts.title)}><button type="button" onClick={parts.requestClose}>닫기</button>{parts.body}</section>} /></HostSeamProvider></QueryClientProvider>);
  return qc;
}
async function open(name = '생산 분석') { fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${name} VOC 등록 설정,`) })); return screen.getByRole('dialog'); }
const seedTargets = (qc: QueryClient) => qc.setQueryData(VOC_CREATE_TARGETS_QUERY_KEY, [{ managed_system_id: A, allowed: true }]);
const targetsInvalidated = (qc: QueryClient) => qc.getQueryState(VOC_CREATE_TARGETS_QUERY_KEY)?.isInvalidated === true;
const patches = () => writes.filter(w => w.method === 'PATCH');

describe('F1 · the real create-targets cache is invalidated', () => {
  it('after a save', async () => {
    const qc = mount(); seedTargets(qc); const dialog = await open();
    fireEvent.click(await within(dialog).findByRole('radio', { name: '모두' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    await waitFor(() => expect(within(dialog).getByText('저장됨 · 모두')).toBeInTheDocument());
    expect(targetsInvalidated(qc)).toBe(true);
  });
  it('after a partial save failure', async () => {
    const qc = mount(); seedTargets(qc); const dialog = await open();
    fireEvent.click(await within(dialog).findByRole('button', { name: '이지훈 추가' }));
    fireEvent.click(within(dialog).getByRole('radio', { name: '모두' }));
    failPatch = true;
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    await within(dialog).findByRole('alert');
    expect(targetsInvalidated(qc)).toBe(true);
  });
  it('after a bulk apply and after its undo', async () => {
    const qc = mount(); seedTargets(qc); await screen.findByText('지정 1명');
    fireEvent.click(screen.getByRole('checkbox', { name: '생산 분석 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '모두로' }));
    fireEvent.click(screen.getByRole('button', { name: '1개 시스템에 적용' }));
    await screen.findByRole('button', { name: '일괄 변경 되돌리기' });
    await waitFor(() => expect(targetsInvalidated(qc)).toBe(true));
    seedTargets(qc); expect(targetsInvalidated(qc)).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '일괄 변경 되돌리기' }));
    await waitFor(() => expect(modes[A]).toBe('restricted'));
    await waitFor(() => expect(targetsInvalidated(qc)).toBe(true));
  });
});

describe('F2 · modes are judged against the latest server state', () => {
  it('keeps the server mode a concurrent admin set when the draft only changes people, and says so', async () => {
    mount(); const dialog = await open();
    fireEvent.click(await within(dialog).findByRole('button', { name: '이지훈 추가' }));
    modes[A] = 'open'; // another admin, after this screen loaded
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    await waitFor(() => expect(within(dialog).getByText(/저장됨 ·/)).toBeInTheDocument());
    expect(patches()).toHaveLength(0);
    expect(modes[A]).toBe('open');
    expect(within(dialog).getByText('저장됨 · 모두')).toBeInTheDocument();
    expect(screen.getByText(/다른 관리자가 등록 모드를 바꿔 서버 값을 유지/)).toBeInTheDocument();
  });
  it('writes a mode the admin chose even when the cached mode already matched', async () => {
    mount(); const dialog = await open();
    fireEvent.click(await within(dialog).findByRole('radio', { name: '모두' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    await waitFor(() => expect(within(dialog).getByText('저장됨 · 모두')).toBeInTheDocument());
  });
  it('treats a PATCH result that differs from the request as a failure and keeps the draft', async () => {
    mount(); const dialog = await open();
    fireEvent.click(await within(dialog).findByRole('radio', { name: '모두' }));
    patchReturns = 'restricted';
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('등록 모드 저장 실패');
    expect(within(dialog).getByText('미저장 · 모두')).toBeInTheDocument();
    expect(screen.queryByText('VOC 등록 권한을 저장했습니다.')).not.toBeInTheDocument();
  });
  it('bulk skips a system whose latest server mode already equals the target', async () => {
    mount(); await screen.findByText('지정 1명');
    fireEvent.click(screen.getByRole('checkbox', { name: '생산 분석 선택' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '설비 점검 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '모두로' }));
    modes[B] = 'open';
    fireEvent.click(screen.getByRole('button', { name: '2개 시스템에 적용' }));
    await waitFor(() => expect(modes[A]).toBe('open'));
    await screen.findByRole('button', { name: '일괄 변경 되돌리기' });
    expect(patches().map(w => w.path.split('/').at(-1))).toEqual([A]);
    // Undo restores only what this bulk changed: B was never changed here.
    fireEvent.click(screen.getByRole('button', { name: '일괄 변경 되돌리기' }));
    await waitFor(() => expect(modes[A]).toBe('restricted'));
    expect(modes[B]).toBe('open');
  });
  it('undo does not overwrite a system someone else changed after the bulk, and reports it', async () => {
    mount(); await screen.findByText('지정 1명');
    fireEvent.click(screen.getByRole('checkbox', { name: '생산 분석 선택' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '설비 점검 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '모두로' }));
    fireEvent.click(screen.getByRole('button', { name: '2개 시스템에 적용' }));
    await screen.findByRole('button', { name: '일괄 변경 되돌리기' });
    await waitFor(() => expect(patches()).toHaveLength(2));
    modes[A] = 'restricted'; // changed by someone else after the bulk
    fireEvent.click(screen.getByRole('button', { name: '일괄 변경 되돌리기' }));
    await waitFor(() => expect(modes[B]).toBe('restricted'));
    expect(patches().filter(w => w.path.endsWith(A))).toHaveLength(1);
    expect(await screen.findByText(/다른 관리자가 먼저 바꿔 되돌리지 않음/)).toHaveTextContent('생산 분석');
  });
});

describe('F3 · idempotency intent ends once a refetch confirms it', () => {
  it('a lost add response is retried safely, but a later remove-then-re-add uses a new key', async () => {
    mount(); const dialog = await open();
    fireEvent.click(await within(dialog).findByRole('button', { name: '이지훈 추가' }));
    loseAddResponse = true;
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('사람 추가 실패');
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' })); // the grant exists now: confirmed, nothing to resend
    await waitFor(() => expect(within(dialog).getByText('저장됨 · 지정 2명')).toBeInTheDocument());
    fireEvent.click(within(dialog).getByRole('button', { name: '이지훈 제거' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    await waitFor(() => expect(within(dialog).getByText('저장됨 · 지정 1명')).toBeInTheDocument());
    fireEvent.click(within(dialog).getByRole('button', { name: '이지훈 추가' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    await waitFor(() => expect(within(dialog).getByText('저장됨 · 지정 2명')).toBeInTheDocument());
    const adds = writes.filter(w => w.path.endsWith('/permissions/grants'));
    expect(adds).toHaveLength(2);
    expect(adds[1]?.key).not.toBe(adds[0]?.key);
    expect(grants.filter(g => g.actor_id === V)).toHaveLength(1);
  });
  it('an unconfirmed retry keeps its key', async () => {
    mount(); const dialog = await open();
    fireEvent.click(await within(dialog).findByRole('button', { name: '이지훈 추가' }));
    const original = fetch;
    let first = true;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (first && init?.method === 'POST') { first = false; writes.push({ method: 'POST', path: String(input), body: JSON.parse(String(init.body)), key: String((init.headers as Record<string, string>)['Idempotency-Key']) }); return json({ code: 'internal.unexpected', message: 'x' }, 500); }
      return original(input, init);
    }));
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    await within(dialog).findByRole('alert');
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    await waitFor(() => expect(within(dialog).getByText('저장됨 · 지정 2명')).toBeInTheDocument());
    const adds = writes.filter(w => w.path.endsWith('/permissions/grants'));
    expect(adds).toHaveLength(2);
    expect(adds[1]?.key).toBe(adds[0]?.key);
  });
});
