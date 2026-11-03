// GET /attachments/:id/download — the public-read arm (#1288 g, ADR-0110 decision 3). A VOC-body or
// `public_update` attachment of a publicly readable VOC downloads; reporter-reply and internal-comment
// attachments keep today's 403; a VOC the actor cannot read publicly stays 403; another workspace's key is 404.
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  type MemoryStorage,
  type World,
  WORKSPACE_ID,
  createMemoryStorage,
  createWorld,
  runIntegration,
} from '../../voc/public-read/__tests__/_world.js';

const TAG = 'it-pubatt';

describe.skipIf(!runIntegration)('attachment download: public-read arm (#1288 g)', () => {
  let w: World;
  let storage: MemoryStorage;

  beforeAll(async () => {
    storage = createMemoryStorage();
    w = await createWorld(TAG, { storage });
  });
  afterAll(async () => {
    await w?.teardown();
  });
  beforeEach(async () => {
    await w.migrate.pool.query(
      `delete from voc.vocs where primary_managed_system_id in (select id from core.managed_systems where slug like $1)`,
      [`${TAG}-%`],
    );
    await w.migrate.pool.query(`update core.managed_systems set external_key = null where slug like $1 and id <> $2`, [`${TAG}-%`, w.systems.platform]);
    await w.clearRateLimits();
  });

  const status = async (id: string, who: Parameters<World['get']>[1]) => (await w.get(`/attachments/${id}/download`, who)).statusCode;

  it('a User with no grant: platform body and public-update attachments 200; reply and internal 403', async () => {
    const voc = await w.insertVoc(w.systems.platform, 'reporter', 'platform VOC');
    const s = await w.seedConversationAndAttachments(voc);
    expect(await status(s.bodyAttachment, 'plain')).toBe(200);
    expect(await status(s.publicUpdateAttachment, 'plain')).toBe(200);
    expect(await status(s.reporterReplyAttachment, 'plain')).toBe(403);
    expect(await status(s.internalCommentAttachment, 'plain')).toBe(403);
    // Controls: the reporter keeps the reply (existing rule); the internal comment stays closed to them.
    expect(await status(s.reporterReplyAttachment, 'reporter')).toBe(200);
    expect(await status(s.internalCommentAttachment, 'reporter')).toBe(403);
    // Admin (triage) reads all four through the existing rule.
    expect(await status(s.internalCommentAttachment, 'admin')).toBe(200);
  });

  it('voc.read_public on A opens A, not B', async () => {
    const inA = await w.seedConversationAndAttachments(await w.insertVoc(w.systems.a, 'admin', 'A VOC'));
    const inB = await w.seedConversationAndAttachments(await w.insertVoc(w.systems.b, 'admin', 'B VOC'));
    expect(await status(inA.bodyAttachment, 'granted')).toBe(200);
    expect(await status(inA.publicUpdateAttachment, 'granted')).toBe(200);
    expect(await status(inA.internalCommentAttachment, 'granted')).toBe(403);
    expect(await status(inB.bodyAttachment, 'granted')).toBe(403);
    expect(await status(inB.publicUpdateAttachment, 'granted')).toBe(403);
    // A User with nothing: A is closed too.
    expect(await status(inA.bodyAttachment, 'plain')).toBe(403);
  });

  it('a platform arm that fails closed (duplicate key) closes the platform attachments again', async () => {
    const s = await w.seedConversationAndAttachments(await w.insertVoc(w.systems.platform, 'admin', 'platform VOC'));
    expect(await status(s.bodyAttachment, 'plain')).toBe(200);
    await w.insertSystem('dup', { externalKey: 'platform' });
    expect(await status(s.bodyAttachment, 'plain')).toBe(403);
    expect(await status(s.publicUpdateAttachment, 'plain')).toBe(403);
  });

  it('an attachment whose key belongs to another workspace is 404, even on a public VOC', async () => {
    const voc = await w.insertVoc(w.systems.platform, 'admin', 'platform VOC');
    const row = await w.migrate.pool.query<{ id: string }>(
      `insert into voc.voc_attachments (voc_id, name, size_bytes, mime_type, storage_key, uploaded_by_actor_id, linked_at)
       values ($1, 'x.png', 1, 'image/png', $2, $3, now()) returning id`,
      [voc, `22222222-2222-2222-2222-222222222222/${randomUUID()}/x.png`, w.actors.admin],
    );
    expect(await status(row.rows[0]?.id ?? '', 'plain')).toBe(404);
    expect(WORKSPACE_ID).not.toBe('22222222-2222-2222-2222-222222222222');
  });

  it('an unlinked attachment stays uploader-only', async () => {
    const row = await w.migrate.pool.query<{ id: string }>(
      `insert into voc.voc_attachments (name, size_bytes, mime_type, storage_key, uploaded_by_actor_id)
       values ('u.png', 1, 'image/png', $1, $2) returning id`,
      [`${WORKSPACE_ID}/${randomUUID()}/u.png`, w.actors.admin],
    );
    expect(await status(row.rows[0]?.id ?? '', 'plain')).toBe(403);
    expect(await status(row.rows[0]?.id ?? '', 'admin')).toBe(200);
  });
});
