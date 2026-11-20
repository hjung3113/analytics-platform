import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { featureQueryClient } from '@ap/feature-bridge';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { mountAt, warmPages } from './test-support';

// TipTap cannot be typed into under JSDOM; a textarea stands in so the real composer and mutation hook can publish.
vi.mock('@ap/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ap/ui')>();
  return {
    ...actual,
    RichEditor: ({ surface, onChange }: { surface?: string; onChange?: (doc: unknown) => void }) => (
      <textarea
        data-testid={`rich-editor-${surface ?? 'default'}`}
        onChange={event => onChange?.({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: event.target.value }] }] })}
      />
    ),
  };
});

const SYSTEM = '33333333-3333-4333-8333-333333333333';
const ID = '00000000-0000-4000-8000-000000000101';
const DETAIL_KEY = ['voc', ID] as const;
const DETAIL_PATH = `/api/features/vocs/${ID}`;
const PUBLIC_UPDATE_PATH = `/api/features/vocs/${ID}/public-updates`;
const FULL_TITLE = 'Full VOC title';
const FULL_BODY = 'Full VOC body';
const ME = {
  actor: { id: '00000000-0000-4000-8000-000000000099', external_id: 'admin-1', email: 'admin@platform.local', display_name: '관리자', role_level: 'admin' },
  workspace_id: '00000000-0000-4000-8000-000000000001',
};
const ROW = {
  id: ID, display_id: 'VOC-LATE', title: FULL_TITLE,
  primary_managed_system_id: SYSTEM, analytics_area_id: null, reporter_id: '00000000-0000-4000-8000-000000000060',
  owner_user_id: null, owner_team_id: null, severity: 'high',
  reporter_facing_status: 'received', triage_state: 'untriaged', source_context: 'direct_use',
  created_at: '2026-10-08T00:00:00.000Z', updated_at: '2026-10-08T00:00:00.000Z',
  similar_count: 0, attachment_count: 0,
};
const DETAIL = {
  ...ROW,
  description_rich_content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: FULL_BODY }] }] },
  similar: { items: [] }, next_actions: [],
  next_reporter_states: { allowed: [], forbidden: {} },
  linked_execution: { findingRef: null, taskRef: null },
  conversation_timeline: [], conversation_page: { has_more: false },
  permission_decisions: {}, attachments: [],
};
/** The response the server composed while the operator could still read the record: it carries the full detail. */
const LATE_PUBLIC_UPDATE = {
  public_update: {
    id: '00000000-0000-4000-8000-000000000333', voc_id: ID,
    body_rich_content: { type: 'doc', content: [] },
    reporter_facing_status_before: 'received', reporter_facing_status_after: 'received',
    skip_public_update: false, skip_reason: null, created_at: '2026-10-08T00:01:00.000Z',
  },
  voc: { ...DETAIL, updated_at: '2026-10-08T00:01:00.000Z' },
};
const PAGE = { items: [ROW], page: { has_more: false } };
const DENIAL = { code: 'permission.denied', message: 'VOC read denied' };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const isList = (path: string) => path.startsWith('/api/features/vocs?');

beforeEach(async () => {
  vi.stubGlobal('localStorage', memoryStorage());
  featureQueryClient.clear();
  setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() });
  await warmPages();
});
afterEach(() => { cleanup(); setFeatureApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

it('keeps a late Public Update response out of the detail cache after an Inbox denial closed the drawer', async () => {
  let denied = false;
  let detailPending = false;
  let releasePublicUpdate: (response: Response) => void = () => {};
  const calls: Array<{ path: string; method: string }> = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push({ path, method });
    if (path === '/api/features/me') return json(ME);
    if (isList(path)) return denied ? json(DENIAL, 403) : json(PAGE);
    if (path === PUBLIC_UPDATE_PATH && method === 'POST') return new Promise<Response>(resolve => { releasePublicUpdate = resolve; });
    if (path === DETAIL_PATH) return detailPending ? new Promise<Response>(() => {}) : json(DETAIL);
    return json({ items: [] });
  }));
  const detailReads = () => calls.filter(call => call.path === DETAIL_PATH);
  const publicUpdatePosts = () => calls.filter(call => call.path === PUBLIC_UPDATE_PATH && call.method === 'POST');
  const publicUpdateMutation = () => featureQueryClient.getMutationCache().getAll().at(-1)?.state.status;
  const reopen = () => act(async () => {
    window.history.pushState(null, '', `/flow/inbox?focus=${ID}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  mountAt(`/flow/inbox?focus=${ID}`);
  expect(await screen.findByRole('dialog', { name: FULL_TITLE })).toBeTruthy();
  fireEvent.change(await screen.findByTestId('rich-editor-public-update'), { target: { value: '담당자 답변' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^답변 공개$/ })); });
  await waitFor(() => expect(publicUpdatePosts()).toHaveLength(1));
  expect(publicUpdateMutation()).toBe('pending');

  denied = true;
  await act(async () => { await featureQueryClient.refetchQueries({ queryKey: ['vocs', 'inbox', 'pages'], type: 'active' }); });
  await screen.findByRole('heading', { name: 'VOC 처리함', level: 3 });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(featureQueryClient.getQueryState(DETAIL_KEY)).toBeUndefined();

  await act(async () => { releasePublicUpdate(json(LATE_PUBLIC_UPDATE, 201)); });
  await waitFor(() => expect(publicUpdateMutation()).toBe('success'));

  detailPending = true;
  await reopen();
  await waitFor(() => expect(featureQueryClient.getQueryState(DETAIL_KEY)).toBeDefined());
  const assertNoFullDetail = () => {
    expect(featureQueryClient.getQueryData(DETAIL_KEY)).toBeUndefined();
    expect(screen.queryByRole('dialog', { name: FULL_TITLE })).toBeNull();
    expect(screen.queryByText(FULL_TITLE)).toBeNull();
    expect(screen.queryByText(FULL_BODY)).toBeNull();
  };
  assertNoFullDetail();
  await waitFor(() => expect(detailReads()).toHaveLength(2));
  expect(featureQueryClient.getQueryState(DETAIL_KEY)?.fetchStatus).toBe('fetching');
  assertNoFullDetail();
});
