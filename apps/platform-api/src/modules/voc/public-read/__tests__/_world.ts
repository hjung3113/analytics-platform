// Shared fixture world for the public-read integration suites (#1288 g). Throwaway DB only.
// The app handle is the low-privilege role; fixture writes and teardown use platform_migrate.
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

import { loadConfig } from '../../../../config.js';
import { type DbHandle, createDb } from '../../../../db/client.js';
import type { StorageBackend } from '../../../../lib/storage/index.js';
import { SESSION_COOKIE_NAME } from '../../../../middleware/require-session.js';
import { buildServer } from '../../../../server.js';
import { insertActorRow } from '../../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../../test-support/auth.js';
import { insertMsDirectly } from '../../../../test-support/core-fixtures.js';
import { grantCapability } from '../../../../test-support/permissions-fixtures.js';
import { insertPublicUpdate, insertVocDirectly } from '../../../../test-support/voc-fixtures.js';
import { insertInternalComment, insertLinkedAttachment, insertReporterReply } from '../../__tests__/_seed-helpers.js';

export const APP_URL = process.env.DATABASE_URL ?? '';
export const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
export const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
export const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

export type Who = 'admin' | 'plain' | 'reporter' | 'granted' | 'operatorB' | 'publicOnlyB';

export interface MemoryStorage extends StorageBackend {
  store: Map<string, Buffer>;
}

export function createMemoryStorage(): MemoryStorage {
  const store = new Map<string, Buffer>();
  return {
    store,
    async put(input) {
      store.set(input.key, Buffer.isBuffer(input.bytes) ? input.bytes : Buffer.from([]));
      return { key: input.key };
    },
    async get(key) {
      const bytes = store.get(key) ?? Buffer.from('bytes');
      return { stream: Readable.from(bytes), mimeType: 'image/png', size: bytes.byteLength };
    },
    async delete(key) {
      store.delete(key);
    },
    async exists(key) {
      return store.has(key);
    },
  };
}

export interface World {
  app: FastifyInstance;
  appHandle: DbHandle;
  migrate: DbHandle;
  tag: string;
  actors: Record<Who, string>;
  cookies: Record<Who, string>;
  /** Managed Systems A, B and the 「플랫폼」 system (external_key = 'platform'). */
  systems: { a: string; b: string; platform: string };
  get(url: string, who?: Who): Promise<LightMyRequestResponse>;
  insertSystem(name: string, opts?: { externalKey?: string; archived?: boolean; workspaceId?: string }): Promise<string>;
  insertVoc(system: string, reporter: Who | string, title: string, opts?: { severity?: 'low' | 'high' }): Promise<string>;
  clearRateLimits(): Promise<void>;
  teardown(): Promise<void>;
  seedConversationAndAttachments(vocId: string): Promise<{
    bodyAttachment: string;
    publicUpdate: string;
    publicUpdateAttachment: string;
    skippedUpdate: string;
    reporterReply: string;
    reporterReplyAttachment: string;
    internalComment: string;
    internalCommentAttachment: string;
  }>;
}

export async function createWorld(tag: string, opts: { storage?: StorageBackend } = {}): Promise<World> {
  process.env.NODE_ENV = 'test';
  const appHandle = createDb(APP_URL);
  const migrate = createDb(MIGRATE_URL);
  const app = await buildServer({
    config: loadConfig(),
    dbHandle: appHandle,
    ...(opts.storage ? { storage: opts.storage } : {}),
  });
  await app.ready();
  await appHandle.pool.query(`delete from core.rate_limits where key like '127.0.0.%'`);

  const admin = await migrate.pool.query<{ id: string }>(
    `select id from core.actors where workspace_id = $1 and external_id = 'mock-admin-1'`,
    [WORKSPACE_ID],
  );
  const adminId = admin.rows[0]?.id ?? '';
  if (!adminId) throw new Error('seed admin actor not found');

  const actors = { admin: adminId } as Record<Who, string>;
  const cookies = {} as Record<Who, string>;
  cookies.admin = await loginAs(app, 'mock-admin-1');
  const specs: Array<[Exclude<Who, 'admin'>, 'user' | 'developer']> = [
    ['plain', 'user'],
    ['reporter', 'user'],
    ['granted', 'user'],
    ['operatorB', 'developer'],
    ['publicOnlyB', 'user'],
  ];
  for (const [who, role] of specs) {
    const externalId = `${tag}-${who}`;
    const { id } = await insertActorRow(migrate, { workspaceId: WORKSPACE_ID, externalId, roleLevel: role });
    actors[who] = id;
    cookies[who] = await loginAs(app, externalId);
  }

  const slug = (n: string) => `${tag}-${n}-${randomUUID().slice(0, 6)}`;
  const a = await insertMsDirectly(migrate, WORKSPACE_ID, slug('a'), 'Public Read A');
  const b = await insertMsDirectly(migrate, WORKSPACE_ID, slug('b'), 'Public Read B');
  const platform = await insertMsDirectly(migrate, WORKSPACE_ID, slug('platform'), '플랫폼');
  await migrate.pool.query(`update core.managed_systems set external_key = 'platform' where id = $1`, [platform]);
  const systems = { a, b, platform };

  await grantCapability(migrate, WORKSPACE_ID, actors.granted, 'voc.read_public', a, adminId);
  await grantCapability(migrate, WORKSPACE_ID, actors.operatorB, 'voc.read', b, adminId);
  await grantCapability(migrate, WORKSPACE_ID, actors.publicOnlyB, 'voc.read_public', b, adminId);

  const world: World = {
    app,
    appHandle,
    migrate,
    tag,
    actors,
    cookies,
    systems,
    get: (url, who = 'plain') =>
      app.inject({ method: 'GET', url, headers: { cookie: `${SESSION_COOKIE_NAME}=${cookies[who]}` } }),
    async insertSystem(name, o = {}) {
      const id = await insertMsDirectly(migrate, o.workspaceId ?? WORKSPACE_ID, slug('x'), name);
      if (o.externalKey !== undefined) {
        await migrate.pool.query(`update core.managed_systems set external_key = $2 where id = $1`, [id, o.externalKey]);
      }
      if (o.archived) {
        await migrate.pool.query(`update core.managed_systems set archived_at = now() where id = $1`, [id]);
      }
      return id;
    },
    async insertVoc(system, reporter, title, o = {}) {
      const reporterId = reporter in actors ? actors[reporter as Who] : reporter;
      const voc = await insertVocDirectly(migrate, WORKSPACE_ID, system, reporterId, title, {
        ...(o.severity ? { severity: o.severity } : {}),
      });
      return voc.id;
    },
    clearRateLimits: async () => {
      await appHandle.pool.query(`delete from core.rate_limits where key like '127.0.0.%'`);
    },
    async seedConversationAndAttachments(vocId) {
      const reporterId = (
        await migrate.pool.query<{ reporter_id: string }>(`select reporter_id from voc.vocs where id = $1`, [vocId])
      ).rows[0]?.reporter_id ?? '';
      const att = (parent: Parameters<typeof insertLinkedAttachment>[2]) =>
        insertLinkedAttachment(migrate, WORKSPACE_ID, parent, reporterId).then((r) => r.id);
      const publicUpdate = await insertPublicUpdate(migrate, vocId, adminId);
      const skipped = await migrate.pool.query<{ id: string }>(
        `insert into voc.voc_public_updates
           (voc_id, actor_id, body_rich_content, reporter_facing_status_before, reporter_facing_status_after, skip_public_update, skip_reason)
         values ($1, $2, NULL, 'received', 'reviewing', true, 'no change needed') returning id`,
        [vocId, adminId],
      );
      const reporterReply = await insertReporterReply(migrate, vocId, reporterId);
      const internalComment = await insertInternalComment(migrate, vocId, adminId);
      return {
        bodyAttachment: await att({ kind: 'voc', vocId }),
        publicUpdate,
        publicUpdateAttachment: await att({ kind: 'public_update', commentId: publicUpdate }),
        skippedUpdate: skipped.rows[0]?.id ?? '',
        reporterReply,
        reporterReplyAttachment: await att({ kind: 'reporter_reply', commentId: reporterReply }),
        internalComment,
        internalCommentAttachment: await att({ kind: 'internal_comment', commentId: internalComment }),
      };
    },
    async teardown() {
      const ids = Object.values(actors).filter((id) => id !== adminId);
      await migrate.pool.query(`delete from voc.voc_attachments where storage_key like $1 || '/%'`, [WORKSPACE_ID]);
      await migrate.pool.query(
        `delete from voc.vocs where primary_managed_system_id in (select id from core.managed_systems where slug like $1)`,
        [`${tag}-%`],
      );
      await migrate.pool.query(`delete from permission.permission_grants where actor_id = any($1::uuid[])`, [ids]);
      await migrate.pool.query(`delete from core.managed_systems where slug like $1`, [`${tag}-%`]);
      await migrate.pool.query(`delete from core.sessions where actor_id = any($1::uuid[])`, [ids]);
      await migrate.pool.query(`delete from core.audit_log where actor_id = any($1::uuid[])`, [ids]);
      await migrate.pool.query(`delete from core.actors where id = any($1::uuid[])`, [ids]);
      await app.close();
      await appHandle.close();
      await migrate.close();
    },
  };
  return world;
}
