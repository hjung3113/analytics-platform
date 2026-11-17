import { afterEach, expect, it, vi } from 'vitest';
import { configureApiClient } from '../client';
import { fetchPermissionGroup, decidePermissionRequestBatch, submitMoreInfoPermissionRequestBatch } from '../permission-groups';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const row = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
afterEach(() => { vi.unstubAllGlobals(); configureApiClient({ basePath: '' }); });

it.each(['approve', 'reject', 'need-more-info'] as const)('sends the %s whole-batch decision with revisions and optional approve_ids', async action => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ batch_id: id, items: [{ id: row, status: 'rejected' }] })));
  vi.stubGlobal('fetch', fetch);
  configureApiClient({ basePath: '/api/features' });
  const body = { action, expected_revisions: { [row]: 2 }, reason: '검토 사유', ...(action === 'approve' ? { approve_ids: [row] } : {}) };
  await decidePermissionRequestBatch(id, body, id);
  expect(fetch).toHaveBeenCalledWith(`/api/features/permissions/requests/batch/${id}/decide`, expect.objectContaining({ method: 'POST' }));
  expect(JSON.parse(fetch.mock.calls[0]?.[1].body as string)).toEqual(body);
});

it('rejects malformed share-link ids before transport', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  await expect(fetchPermissionGroup('../secret')).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});

it('sends one answer and every revision and accepts the documented result', async () => {
  const result = { batch_id: id, items: [{ id: row, status: 'pending', revision: 4 }] };
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  await expect(submitMoreInfoPermissionRequestBatch(id, { note: '回答', expected_revisions: { [row]: 3 } }, id)).resolves.toEqual(result);
  expect(fetch).toHaveBeenCalledWith(`/permission-requests/batch/${id}/submit-more-info`, expect.objectContaining({ method: 'POST' }));
});

it.each([null, {}, { batch_id: id, items: [{ id: row, status: 'rejected' }] }])('rejects an absent or malformed supplement result %j', async result => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(result === null ? null : JSON.stringify(result), { status: result === null ? 204 : 200 })));
  await expect(submitMoreInfoPermissionRequestBatch(id, { note: '回答', expected_revisions: { [row]: 3 } }, id)).rejects.toThrow();
});
