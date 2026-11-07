// #1451 — linkAttachments with parent kinds against a real Postgres (throwaway DB only). Needs migration 0105.
// A VOC link records parent kind 'voc' (VOC behaviour otherwise unchanged); a round link records the round id with
// voc_id / comment_id NULL; a linked row, of either kind, is never linkable again.

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../db/client.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { deleteRecoveryFixtureParents } from '../../../test-support/recovery-fixtures.js';
import { cleanupTestActorsByExternalIdPrefix, insertVocDirectly } from '../../../test-support/voc-fixtures.js';
import { LinkAttachmentsRejected, linkAttachments } from '../repo.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);

describe.skipIf(!runIntegration)('linkAttachments parent kinds (#1451)', () => {
  const prefix = `it-1451-link-${randomUUID()}`;
  let handle: DbHandle;
  let actor = '';
  let ms = '';
  let voc = '';
  const keys: string[] = [];

  const seed = async (): Promise<string> => {
    const id = randomUUID();
    const key = `${WORKSPACE_ID}/${id}/e.txt`;
    keys.push(key);
    await handle.pool.query(
      `insert into voc.voc_attachments (id, name, size_bytes, mime_type, storage_key, uploaded_by_actor_id) values ($1,'e.txt',1,'text/plain',$2,$3)`,
      [id, key, actor],
    );
    return id;
  };
  const row = async (id: string) =>
    (await handle.pool.query('select voc_id, comment_id, parent_kind, parent_id, linked_at from voc.voc_attachments where id = $1', [id])).rows[0] as {
      voc_id: string | null;
      comment_id: string | null;
      parent_kind: string | null;
      parent_id: string | null;
      linked_at: Date | null;
    };
  const link = (ids: string[], parent: Parameters<typeof linkAttachments>[1]['parent']) =>
    handle.db.transaction((tx) => linkAttachments(tx, { attachmentIds: ids, parent, uploaderActorId: actor }));

  beforeAll(async () => {
    handle = createDb(APP_URL);
    actor = (await insertActorRow(handle, { workspaceId: WORKSPACE_ID, externalId: prefix, roleLevel: 'admin' })).id;
    ms = await insertMsDirectly(handle, WORKSPACE_ID, prefix, 'Link parent kind');
    voc = (await insertVocDirectly(handle, WORKSPACE_ID, ms, actor, prefix)).id;
  });
  afterAll(async () => {
    await handle.pool.query('delete from voc.voc_attachments where storage_key = any($1::text[])', [keys]);
    await handle.pool.query('delete from voc.vocs where primary_managed_system_id = $1', [ms]);
    await deleteRecoveryFixtureParents(handle, 'delete from core.managed_systems where id = $1', [ms]);
    await cleanupTestActorsByExternalIdPrefix(handle, WORKSPACE_ID, prefix);
    await handle.close();
  });

  it('a VOC link keeps voc_id and records parent kind voc', async () => {
    const id = await seed();
    await link([id], { kind: 'voc', vocId: voc });
    const r = await row(id);
    expect(r).toMatchObject({ voc_id: voc, comment_id: null, parent_kind: 'voc', parent_id: null });
    expect(r.linked_at).not.toBeNull();
  });

  it('a round link records the round id and leaves voc_id and comment_id NULL', async () => {
    const id = await seed();
    const round = randomUUID();
    await link([id], { kind: 'validation_round', roundId: round });
    expect(await row(id)).toMatchObject({ voc_id: null, comment_id: null, parent_kind: 'validation_round', parent_id: round });
  });

  it.each([
    ['a VOC-linked row', { kind: 'voc', vocId: randomUUID() } as const],
    ['a round-linked row', { kind: 'validation_round', roundId: randomUUID() } as const],
  ])('%s cannot be linked again to a round', async (_label, first) => {
    const id = await seed();
    await handle.pool.query(
      first.kind === 'voc'
        ? 'update voc.voc_attachments set voc_id = $2, parent_kind = $3, linked_at = now() where id = $1'
        : 'update voc.voc_attachments set parent_id = $2, parent_kind = $3, linked_at = now() where id = $1',
      [id, first.kind === 'voc' ? voc : first.roundId, first.kind === 'voc' ? 'voc' : 'validation_round'],
    );
    await expect(link([id], { kind: 'validation_round', roundId: randomUUID() })).rejects.toMatchObject({
      reason: 'already_linked',
    });
    await expect(link([id], { kind: 'validation_round', roundId: randomUUID() })).rejects.toBeInstanceOf(LinkAttachmentsRejected);
  });

  it('the check constraint refuses a round parent that also carries voc_id', async () => {
    const id = await seed();
    await expect(
      handle.pool.query("update voc.voc_attachments set voc_id = $2, parent_kind = 'validation_round', parent_id = $3 where id = $1", [id, voc, randomUUID()]),
    ).rejects.toThrow(/voc_attachments_parent_kind_check/);
  });

  it('the check constraint refuses a NULL parent_kind that carries parent_id (UNKNOWN is not accepted)', async () => {
    const id = await seed();
    await expect(
      handle.pool.query('update voc.voc_attachments set parent_id = $2 where id = $1', [id, randomUUID()]),
    ).rejects.toThrow(/voc_attachments_parent_kind_check/);
  });
});
