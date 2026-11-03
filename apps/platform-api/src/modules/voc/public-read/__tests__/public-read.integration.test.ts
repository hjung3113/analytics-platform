// VOC public read (#1288 g, ADR-0110 decision 3): verdict matrix, allowlist leak surface, fail-closed
// platform arm, existence probe and the operator gates that must not move. Throwaway DB only.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  type PublicVocListItem,
  type PublicVocView,
  publicVocListResponseSchema,
  publicVocViewSchema,
} from '@ap/feature-shared';

import { seedSecondWorkspace } from '../../../../test-support/seed-second-workspace.js';
import { type World, createWorld, runIntegration } from './_world.js';

const TAG = 'it-pubread';
const OPERATOR_KEYS = [
  'reporter_id',
  'owner_user_id',
  'owner_team_id',
  'severity',
  'triage_state',
  'primary_managed_system_id',
  'similar',
  'links',
  'linked_execution',
  'permission_decisions',
  'conversation_timeline',
  'analytics_area_id',
  'source_context',
  'attachment_count',
];

describe.skipIf(!runIntegration)('GET /vocs/public (#1288 g)', () => {
  let w: World;
  let secondWorkspaceId = '';

  beforeAll(async () => {
    w = await createWorld(TAG);
    secondWorkspaceId = (await seedSecondWorkspace(w.migrate)).workspaceId;
  });
  afterAll(async () => {
    await w.migrate.pool.query(`delete from core.managed_systems where workspace_id = $1 and slug like $2`, [
      secondWorkspaceId,
      `${TAG}-%`,
    ]);
    await w?.teardown();
  });
  beforeEach(async () => {
    await w.migrate.pool.query(`delete from voc.vocs where primary_managed_system_id in (select id from core.managed_systems where slug like $1)`, [`${TAG}-%`]);
    // Only the base 「플랫폼」 system carries the key between tests.
    await w.migrate.pool.query(`update core.managed_systems set external_key = null where slug like $1 and id <> $2`, [`${TAG}-%`, w.systems.platform]);
    await w.migrate.pool.query(`update core.managed_systems set external_key = 'platform', archived_at = null where id = $1`, [w.systems.platform]);
    await w.clearRateLimits();
  });

  async function list(who: Parameters<World['get']>[1], query = ''): Promise<PublicVocListItem[]> {
    const res = await w.get(`/vocs/public${query}`, who);
    expect(res.statusCode).toBe(200);
    return publicVocListResponseSchema.parse(res.json()).items;
  }
  const ids = (items: PublicVocListItem[]) => items.map((i) => i.id).sort();

  async function fixture() {
    const own = await w.insertVoc(w.systems.a, 'reporter', 'own in A');
    const aOther = await w.insertVoc(w.systems.a, 'admin', 'other in A');
    const bOther = await w.insertVoc(w.systems.b, 'admin', 'other in B');
    const plat = await w.insertVoc(w.systems.platform, 'admin', 'platform VOC');
    return { own, aOther, bOther, plat };
  }

  describe('verdict matrix', () => {
    it('a User with no grant sees exactly own VOCs + 「플랫폼」 VOCs; mine=true only own', async () => {
      const f = await fixture();
      expect(ids(await list('reporter'))).toEqual([f.own, f.plat].sort());
      expect(ids(await list('reporter', '?mine=true'))).toEqual([f.own]);
      // Positive control for the zero-grant case: an actor that reported nothing sees only the platform VOC.
      expect(ids(await list('plain'))).toEqual([f.plat]);
      expect(await list('plain', '?mine=true')).toEqual([]);
    });

    it('voc.read_public on A adds A, never B', async () => {
      const f = await fixture();
      expect(ids(await list('granted'))).toEqual([f.own, f.aOther, f.plat].sort());
    });

    it('a grant on B does not reveal A; it reveals B', async () => {
      const f = await fixture();
      const seen = ids(await list('publicOnlyB'));
      expect(seen).toEqual([f.bOther, f.plat].sort());
      expect(seen).not.toContain(f.aOther);
    });

    it('an operator with voc.read on B sees B through the public shape, not A', async () => {
      const f = await fixture();
      const res = await w.get('/vocs/public', 'operatorB');
      const body = res.json<{ items: Array<Record<string, unknown>> }>();
      expect(body.items.map((i) => i.id as string).sort()).toEqual([f.bOther, f.plat].sort());
      for (const item of body.items) for (const key of OPERATOR_KEYS) expect(item).not.toHaveProperty(key);
    });

    it('admin (voc.read all) sees every VOC', async () => {
      const f = await fixture();
      expect(ids(await list('admin'))).toEqual(expect.arrayContaining(Object.values(f)));
    });

    it('managed_system_id and q narrow inside the visible set; a filter never widens', async () => {
      const f = await fixture();
      expect(ids(await list('granted', `?managed_system_id=${w.systems.a}`))).toEqual([f.own, f.aOther].sort());
      expect(await list('granted', `?managed_system_id=${w.systems.b}`)).toEqual([]);
      expect(ids(await list('granted', '?q=platform'))).toEqual([f.plat]);
      expect(await list('plain', '?q=other%20in%20A')).toEqual([]);
    });

    it('paginates with a cursor and caps the page at 50', async () => {
      const made: string[] = [];
      for (let i = 0; i < 3; i += 1) made.push(await w.insertVoc(w.systems.platform, 'admin', `page ${i}`));
      const first = await w.get('/vocs/public?limit=2', 'plain');
      const p1 = publicVocListResponseSchema.parse(first.json());
      expect(p1.items).toHaveLength(2);
      expect(p1.page.has_more).toBe(true);
      const second = await w.get(`/vocs/public?limit=2&cursor=${encodeURIComponent(p1.page.cursor ?? '')}`, 'plain');
      const p2 = publicVocListResponseSchema.parse(second.json());
      expect(p2.items).toHaveLength(1);
      expect(p2.page.has_more).toBe(false);
      expect(ids([...p1.items, ...p2.items])).toEqual([...made].sort());
      expect((await w.get('/vocs/public?limit=51', 'plain')).statusCode).toBe(422);
      expect((await w.get('/vocs/public?cursor=not-a-cursor', 'plain')).statusCode).toBe(422);
    });
  });

  describe('allowlist', () => {
    it('detail carries the exact key set and no operator key, even when the VOC has severity, owner and internal rows', async () => {
      const voc = await w.insertVoc(w.systems.platform, 'reporter', 'rich VOC', { severity: 'high' });
      await w.migrate.pool.query(`update voc.vocs set owner_user_id = $2 where id = $1`, [voc, w.actors.admin]);
      const seeded = await w.seedConversationAndAttachments(voc);

      for (const who of ['plain', 'reporter'] as const) {
        const res = await w.get(`/vocs/public/${voc}`, who);
        expect(res.statusCode).toBe(200);
        const raw = res.json<Record<string, unknown>>();
        const view: PublicVocView = publicVocViewSchema.parse(raw);
        expect(Object.keys(raw).sort()).toEqual(
          ['id', 'display_id', 'title', 'description_rich_content', 'reporter_facing_status', 'managed_system', 'created_at', 'updated_at', 'mine', 'entries', 'attachments'].sort(),
        );
        for (const key of OPERATOR_KEYS) expect(raw).not.toHaveProperty(key);
        expect(view.mine).toBe(who === 'reporter');
        expect(view.managed_system).toEqual({ id: w.systems.platform, name: '플랫폼' });
        // Recursive: only public_update entries with a body; no reply, internal comment or skipped update.
        expect(view.entries.map((e) => e.id)).toEqual([seeded.publicUpdate]);
        for (const entry of raw.entries as Array<Record<string, unknown>>) {
          expect(Object.keys(entry).sort()).toEqual(['id', 'kind', 'body_rich_content', 'created_at', 'attachments'].sort());
        }
        const attachmentIds = [...view.attachments, ...view.entries.flatMap((e) => e.attachments)].map((a) => a.id).sort();
        expect(attachmentIds).toEqual([seeded.bodyAttachment, seeded.publicUpdateAttachment].sort());
        for (const a of [...(raw.attachments as object[]), ...(raw.entries as Array<{ attachments: object[] }>).flatMap((e) => e.attachments)]) {
          expect(Object.keys(a).sort()).toEqual(['id', 'name', 'size_bytes', 'mime_type', 'created_at', 'linked_at'].sort());
        }
        const serialized = res.body;
        for (const secret of ['storage_key', 'storage_uri', 'uploaded_by_actor_id', w.actors.admin, w.actors.reporter, seeded.reporterReplyAttachment, seeded.internalCommentAttachment]) {
          expect(serialized).not.toContain(secret);
        }
      }
    });

    it('list responses carry only list-item keys', async () => {
      await w.insertVoc(w.systems.platform, 'admin', 'listed', { severity: 'high' });
      const res = await w.get('/vocs/public', 'plain');
      for (const item of res.json<{ items: Array<Record<string, unknown>> }>().items) {
        expect(Object.keys(item).sort()).toEqual(
          ['id', 'display_id', 'title', 'reporter_facing_status', 'managed_system', 'created_at', 'updated_at', 'mine'].sort(),
        );
      }
    });
  });

  describe('existence probe', () => {
    it('nonexistent, invisible and archived ids give the identical 404', async () => {
      const f = await fixture();
      const archived = await w.insertVoc(w.systems.platform, 'admin', 'archived');
      await w.migrate.pool.query(`update voc.vocs set archived_at = now() where id = $1`, [archived]);
      const missing = '00000000-0000-4000-8000-00000000dead';
      const res = await Promise.all([missing, f.bOther, f.aOther, archived].map((id) => w.get(`/vocs/public/${id}`, 'plain')));
      for (const r of res) {
        expect(r.statusCode).toBe(404);
        expect(r.json()).toMatchObject({ code: 'not_found.record' });
      }
      const strip = (r: (typeof res)[number]) => {
        const { correlation_id: _c, request_id: _r, trace_id: _t, ...rest } = r.json<Record<string, unknown>>();
        return rest;
      };
      expect(strip(res[1] as (typeof res)[number])).toEqual(strip(res[0] as (typeof res)[number]));
      expect(strip(res[2] as (typeof res)[number])).toEqual(strip(res[0] as (typeof res)[number]));
      expect(strip(res[3] as (typeof res)[number])).toEqual(strip(res[0] as (typeof res)[number]));
      // Positive controls: the same actor can read a visible one; a malformed id is a validation error.
      expect((await w.get(`/vocs/public/${f.plat}`, 'plain')).statusCode).toBe(200);
      expect((await w.get('/vocs/public/not-a-uuid', 'plain')).statusCode).toBe(422);
    });

    it('a grant on A: A detail 200, B detail 404', async () => {
      const f = await fixture();
      expect((await w.get(`/vocs/public/${f.aOther}`, 'granted')).statusCode).toBe(200);
      expect((await w.get(`/vocs/public/${f.bOther}`, 'granted')).statusCode).toBe(404);
    });
  });

  describe('「플랫폼」 arm fails closed (platformManagedSystemId)', () => {
    it('exactly one live row opens the arm; no active row closes it, and a duplicate cannot exist', async () => {
      const f = await fixture();
      expect(ids(await list('plain'))).toEqual([f.plat]);

      // Migration 0086 (#1289 node i): a second live `platform` row is refused by the unique index, so the
      // "two or more rows → null" branch of platformManagedSystemId is defensive only.
      await expect(w.insertSystem('dup', { externalKey: 'platform' })).rejects.toMatchObject({ code: '23505' });
      expect(ids(await list('plain'))).toEqual([f.plat]);

      // The only matching row archived while a VOC still references it → zero live rows → closed;
      // reporter and granted access continue.
      await w.migrate.pool.query(`update core.managed_systems set archived_at = now() where id = $1`, [w.systems.platform]);
      expect(await list('plain')).toEqual([]);
      expect((await w.get(`/vocs/public/${f.plat}`, 'plain')).statusCode).toBe(404);
      expect(ids(await list('reporter'))).toEqual([f.own]);
      expect(ids(await list('granted'))).toEqual([f.own, f.aOther].sort());
    });

    it('a same-key row in another workspace neither enables nor disables the arm', async () => {
      const f = await fixture();
      await w.insertSystem('other workspace', { externalKey: 'platform', workspaceId: secondWorkspaceId });
      expect(ids(await list('plain'))).toEqual([f.plat]); // does not disable (no duplicate)
      await w.migrate.pool.query(`update core.managed_systems set external_key = null where id = $1`, [w.systems.platform]);
      expect(await list('plain')).toEqual([]); // does not enable (no live row in this workspace)
    });
  });

  describe('operator surfaces do not move for a public-only grant', () => {
    it('inbox is the existing 403, detail/conversation the existing 404, view=my only own', async () => {
      const f = await fixture();
      const grantedOwn = await w.insertVoc(w.systems.a, 'granted', 'own of the public-only actor');
      const inbox = await w.get('/vocs?view=inbox', 'granted');
      expect(inbox.statusCode).toBe(403);
      expect(inbox.json()).toMatchObject({ code: expect.stringMatching(/^permission\./) });
      expect((await w.get(`/vocs/${f.aOther}`, 'granted')).statusCode).toBe(404);
      expect((await w.get(`/vocs/${f.aOther}/conversation`, 'granted')).statusCode).toBe(404);
      const my = await w.get('/vocs?view=my', 'granted');
      expect(my.statusCode).toBe(200);
      expect(my.json<{ items: Array<{ id: string }> }>().items.map((i) => i.id)).toEqual([grantedOwn]);

      // Positive control: the voc.read operator on B gets B on the operator surfaces, and not A.
      const opInbox = await w.get(`/vocs?view=inbox&managed_system_id=${w.systems.b}`, 'operatorB');
      expect(opInbox.statusCode).toBe(200);
      expect(opInbox.json<{ items: Array<{ id: string }> }>().items.map((i) => i.id)).toEqual([f.bOther]);
      expect((await w.get(`/vocs/${f.bOther}`, 'operatorB')).statusCode).toBe(200);
      expect((await w.get(`/vocs/${f.aOther}`, 'operatorB')).statusCode).toBe(404);
    });

    it('platform VOCs stay invisible on the operator detail for a User who did not report them', async () => {
      const f = await fixture();
      expect((await w.get(`/vocs/${f.plat}`, 'plain')).statusCode).toBe(404);
      expect((await w.get(`/vocs/${f.plat}/conversation`, 'plain')).statusCode).toBe(404);
    });
  });
});
