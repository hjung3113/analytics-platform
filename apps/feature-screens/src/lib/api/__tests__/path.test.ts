// #2041/#2049: a path segment is never taken from a URL or a response without validation, a detail
// answers for the id it was asked for, and a file download is never an API success body.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { revokeApiToken } from '../api-tokens';
import { apiClient, apiRequest } from '../client';
import { listFindingComments } from '../findings-comments';
import { getMilestone } from '../milestones';
import { archiveNotification, markNotificationRead } from '../notifications';
import { ApiPathError, apiPath, segment } from '../path';
import { decidePermissionRequest, fetchPermissionRequestAdminDetail, revokePermission } from '../permission-admin';
import { fetchPermissionRequestOwnerDetail, withdrawPermissionRequest } from '../permission-requests';
import { fetchRecoveryDetail } from '../recovery';
import { deleteSavedView } from '../saved-views';
import { getTaskRequest, approveTaskRequest } from '../task-requests';
import { getTask, updateTaskStatus, assignTaskMilestone } from '../tasks';
import { listTaskComments } from '../tasks-comments';
import { fetchVocOwnerCandidates } from '../voc-owner-candidates';
import { ApiParseError } from '../types';

const ID = 'abcdef12-1111-4111-8111-1111111111ab';
const OTHER = '22222222-2222-4222-8222-222222222222';
const U = '33333333-3333-4333-8333-333333333333';
const AT = '2026-01-01T00:00:00.000Z';

const fetchMock = vi.fn();
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function respond(body: unknown, headers: Record<string, string> = {}) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json', ...headers },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
}

const NOT_IDS = ['', 'abc', '..', '.', '../vocs', `..%2Fvocs%2F${ID}`, `${ID}/..`, `${ID}/download`, `${ID}?x=1`, `${ID}#x`, ` ${ID}`];

describe('apiPath', () => {
  it('passes a UUID id through and encodes a wrapped segment', () => {
    expect(apiPath`/tasks/${ID}/comments`).toBe(`/tasks/${ID}/comments`);
    expect(apiPath`/x/${segment('a/b c')}/${ID}`).toBe(`/x/a%2Fb%20c/${ID}`);
  });

  it.each(NOT_IDS)('throws on the id %j, without echoing it', (value) => {
    expect(() => apiPath`/tasks/${value}`).toThrow(ApiPathError);
    try {
      apiPath`/tasks/${value}`;
    } catch (error) {
      if (value !== '') expect((error as Error).message).not.toContain(value);
    }
  });

  it.each(['', '.', '..'])('throws on the segment %j', (value) => {
    expect(() => apiPath`/x/${segment(value)}`).toThrow(ApiPathError);
  });
});

// Every id-in-path function in lib/api refuses a non-UUID id before any request.
const CALLS: [string, (bad: string) => Promise<unknown>][] = [
  ['getTask', (bad) => getTask(bad)],
  ['updateTaskStatus', (bad) => updateTaskStatus(bad, 'doing', { ifMatch: AT, idempotencyKey: ID })],
  ['assignTaskMilestone', (bad) => assignTaskMilestone(bad, { milestone_id: null }, ID, AT)],
  ['listTaskComments', (bad) => listTaskComments(bad)],
  ['listFindingComments', (bad) => listFindingComments(bad)],
  ['getTaskRequest', (bad) => getTaskRequest(bad)],
  ['approveTaskRequest', (bad) => approveTaskRequest(bad, {} as never, ID)],
  ['getMilestone', (bad) => getMilestone(bad)],
  ['markNotificationRead', (bad) => markNotificationRead(bad)],
  ['archiveNotification', (bad) => archiveNotification(bad)],
  ['fetchVocOwnerCandidates', (bad) => fetchVocOwnerCandidates(bad)],
  ['deleteSavedView', (bad) => deleteSavedView(bad)],
  ['revokeApiToken', (bad) => revokeApiToken(false, bad)],
  ['revokePermission', (bad) => revokePermission('grants', bad, 'r', ID)],
  ['decidePermissionRequest', (bad) => decidePermissionRequest(bad, 'reject', 'r', ID, 1)],
  ['fetchPermissionRequestAdminDetail', (bad) => fetchPermissionRequestAdminDetail(bad)],
  ['fetchPermissionRequestOwnerDetail', (bad) => fetchPermissionRequestOwnerDetail(bad)],
  ['withdrawPermissionRequest', (bad) => withdrawPermissionRequest(bad, {} as never, ID)],
];

describe('id-in-path API functions', () => {
  it.each(CALLS)('%s rejects a non-UUID id and makes no request', async (_name, call) => {
    vi.stubGlobal('fetch', fetchMock);
    for (const bad of ['abc', '..', `..%2Fvocs%2F${ID}`]) {
      await expect(call(bad)).rejects.toBeInstanceOf(ApiPathError);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the opaque recovery token as an encoded segment and refuses parent-directory forms', async () => {
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchRecoveryDetail('..')).rejects.toBeInstanceOf(ApiPathError);
    expect(fetchMock).not.toHaveBeenCalled();
    respond({});
    await fetchRecoveryDetail('../x').catch(() => undefined);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/dashboard/recovery-items/..%2Fx');
  });
});

const task = (id: string) => ({
  id,
  workspace_id: U,
  display_id: 'T-1',
  primary_managed_system_id: U,
  title: 't',
  status: 'doing',
  priority: 'low',
  assignee_actor_id: null,
  assignee_team_id: null,
  due_date: null,
  milestone_id: null,
  analytics_area_id: null,
  source_task_request_id: null,
  created_by: U,
  created_at: AT,
  updated_at: AT,
  source: null,
});
const taskRequest = (id: string) => ({
  id,
  workspace_id: U,
  display_id: 'TR-1',
  source_type: 'finding',
  source_id: U,
  primary_managed_system_id: U,
  evidence_summary: 'e',
  requested_outcome: 'o',
  requester_actor_id: U,
  status: 'pending_review',
  assigned_reviewer_actor_id: null,
  assigned_reviewer_team_id: null,
  reviewer_actor_id: null,
  decision_reason: null,
  decided_at: null,
  created_at: AT,
  updated_at: AT,
});
const milestone = (id: string) => ({
  id,
  workspace_id: U,
  display_id: 'M-1',
  primary_managed_system_id: U,
  title: 'm',
  why: 'w',
  status: 'planned',
  owner_actor_id: U,
  analytics_area_id: null,
  start_date: '2026-01-01',
  target_date: '2026-02-01',
  created_by: U,
  created_at: AT,
  updated_at: AT,
  progress: { released_done: 0, in_flight: 0, queued: 0, total: 0, percent: 0 },
  source_finding: null,
});

describe('runtime types', () => {
  it.each([[42], [null], [undefined], [{ toString: () => ID }], [['x']], [true]])(
    'apiPath refuses a non-string value %#: ApiPathError, no request',
    (value) => {
      expect(() => apiPath`/tasks/${value as never}`).toThrow(ApiPathError);
    },
  );
  it('apiPath refuses a forged segment object', () => {
    expect(() => apiPath`/x/${{ fake: '..' } as never}`).toThrow(ApiPathError);
  });
  it('segment refuses a non-string value', () => {
    expect(() => segment(7 as never)).toThrow(ApiPathError);
  });
  it('a response id of another runtime type stops before the request (deleteSavedView)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(deleteSavedView(42 as never)).rejects.toBeInstanceOf(ApiPathError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('detail responses', () => {
  it.each([
    ['getTask', getTask, task],
    ['getTaskRequest', getTaskRequest, taskRequest],
    ['getMilestone', getMilestone, milestone],
  ] as const)('%s accepts its own id (any case) and refuses another id as a parse error', async (_name, get, dto) => {
    respond(dto(ID));
    await expect(get(ID.toUpperCase())).resolves.toMatchObject({ id: ID });
    respond(dto(OTHER));
    const error = await get(ID).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiParseError);
    expect((error as ApiParseError).envelope.detail).toMatchObject({ issues: [{ path: ['id'] }] });
  });

  it('getTask parses its response: a non-UUID id is a parse error', async () => {
    respond({ ...task(ID), id: '../x' });
    const error = await getTask(ID).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiParseError);
    expect((error as ApiParseError).envelope.detail).toMatchObject({ issues: [{ path: ['id'] }] });
  });

  it('getTask parses its response: a non-UUID related id is a parse error', async () => {
    respond({ ...task(ID), milestone_id: 'm-1' });
    await expect(getTask(ID)).rejects.toBeInstanceOf(ApiParseError);
  });
});

describe('file downloads are never an API success body', () => {
  const schema = { parse: (data: unknown) => data };
  it.each(['attachment; filename="a.json"', 'ATTACHMENT', ' attachment ;filename*=UTF-8\'\'a.json'])(
    'apiRequest and apiClient refuse Content-Disposition %j',
    async (disposition) => {
      respond({ ok: true }, { 'content-disposition': disposition });
      await expect(apiRequest('GET', '/x', schema)).rejects.toBeInstanceOf(ApiParseError);
      respond({ ok: true }, { 'content-disposition': disposition });
      await expect(apiClient('GET', '/x')).rejects.toBeInstanceOf(ApiParseError);
    },
  );

  it('still accepts an inline or absent disposition', async () => {
    respond({ ok: true }, { 'content-disposition': 'inline' });
    await expect(apiRequest('GET', '/x', schema)).resolves.toMatchObject({ data: { ok: true } });
    respond({ ok: true });
    await expect(apiClient('GET', '/x')).resolves.toMatchObject({ data: { ok: true } });
  });
});
