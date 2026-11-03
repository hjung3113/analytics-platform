// A public-only `voc.read_public` grant must not open any protected VOC caller (#1288 g, review F2).
// One fixture per gate, each with a positive control proving the route reaches the gate it names.
// Throwaway DB only.
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { insertActorRow } from '../../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../../test-support/auth.js';
import { buildServer } from '../../../../server.js';
import { loadConfig } from '../../../../config.js';
import { insertFindingRow } from '../../../../test-support/findings-fixtures.js';
import { insertPermissionRequestRow } from '../../../../test-support/permissions-fixtures.js';
import { grantCapability } from '../../../../test-support/permissions-fixtures.js';
import { SESSION_COOKIE_NAME } from '../../../../middleware/require-session.js';
import { deriveVocEmbeddingInput } from '../../embedding/text.js';
import { type World, WORKSPACE_ID, createWorld, runIntegration } from './_world.js';

const TAG = 'it-pubcallers';
const VERSION = 1;

describe.skipIf(!runIntegration)('public-only voc.read_public grant vs protected callers (#1288 g)', () => {
  let w: World;
  const extra: string[] = [];
  const cookies = {} as Record<'finderPublic' | 'finderRead' | 'mixed', string>;
  const ids = {} as Record<'finderPublic' | 'finderRead' | 'mixed', string>;

  beforeAll(async () => {
    process.env.EMBEDDING_PROVIDER = 'fake';
    w = await createWorld(TAG);
    // Two Developers with finding.manage on A: one holds only the public read, the other voc.read.
    for (const [name, readCap] of [
      ['finderPublic', 'voc.read_public'],
      ['finderRead', 'voc.read'],
    ] as const) {
      const externalId = `${TAG}-${name}`;
      const { id } = await insertActorRow(w.migrate, { workspaceId: WORKSPACE_ID, externalId, roleLevel: 'developer' });
      extra.push(id);
      ids[name] = id;
      cookies[name] = await loginAs(w.app, externalId);
      await grantCapability(w.migrate, WORKSPACE_ID, id, readCap, w.systems.a, w.actors.admin);
      await grantCapability(w.migrate, WORKSPACE_ID, id, 'finding.manage', w.systems.a, w.actors.admin);
      await grantCapability(w.migrate, WORKSPACE_ID, id, 'finding.read', w.systems.a, w.actors.admin);
    }
    // One actor with voc.read on B and voc.read_public on A: A must stay public-only for it.
    const mixedExternal = `${TAG}-mixed`;
    const mixed = await insertActorRow(w.migrate, { workspaceId: WORKSPACE_ID, externalId: mixedExternal, roleLevel: 'developer' });
    extra.push(mixed.id);
    ids.mixed = mixed.id;
    cookies.mixed = await loginAs(w.app, mixedExternal);
    await grantCapability(w.migrate, WORKSPACE_ID, mixed.id, 'voc.read', w.systems.b, w.actors.admin);
    await grantCapability(w.migrate, WORKSPACE_ID, mixed.id, 'voc.read_public', w.systems.a, w.actors.admin);
  });

  afterAll(async () => {
    if (w) await cleanFixtures();
    if (w && extra.length > 0) {
      const q = (sql: string) => w.migrate.pool.query(sql, [extra]);
      await q(`delete from core.idempotency_keys where actor_id = any($1::uuid[])`);
      await q(`delete from permission.permission_grants where actor_id = any($1::uuid[])`);
      await q(`delete from core.sessions where actor_id = any($1::uuid[])`);
      await q(`delete from core.audit_log where actor_id = any($1::uuid[])`);
      await q(`delete from core.actors where id = any($1::uuid[])`);
    }
    await w?.teardown();
  });

  const ours = `(select id from core.managed_systems where slug like $1)`;
  async function cleanFixtures(): Promise<void> {
    const run = (sql: string) => w.migrate.pool.query(sql, [`${TAG}-%`]);
    await run(`delete from core.entity_links where workspace_id = '${WORKSPACE_ID}' and (source_id in (select id from voc.vocs where primary_managed_system_id in ${ours}) or target_id in (select id from voc.vocs where primary_managed_system_id in ${ours}))`);
    await run(`delete from core.entity_links where workspace_id = '${WORKSPACE_ID}' and (source_id in (select id from finding.findings where primary_managed_system_id in ${ours}) or target_id in (select id from finding.findings where primary_managed_system_id in ${ours}))`);
    await run(`delete from core.notifications where subject_id in (select id from voc.vocs where primary_managed_system_id in ${ours})`);
    await run(`delete from permission.permission_requests where requested_managed_system_id in ${ours}`);
    await run(`delete from voc.voc_cluster_suggestions where primary_managed_system_id in ${ours}`);
    await run(`delete from finding.evidence_highlights where finding_id in (select id from finding.findings where primary_managed_system_id in ${ours})`);
    await w.migrate.pool.query(`delete from voc.voc_similarity_preview_requests where actor_id = any($1::uuid[])`, [extra]);
    await w.migrate.pool.query(`delete from voc.voc_similarity_preview_budgets where actor_id = any($1::uuid[])`, [extra]);
    await run(`delete from task_request.task_requests where primary_managed_system_id in ${ours}`);
    await run(`delete from finding.findings where primary_managed_system_id in ${ours}`);
    await run(`delete from voc_cluster.voc_cluster_members where cluster_id in (select id from voc_cluster.voc_clusters where primary_managed_system_id in ${ours})`);
    await run(`delete from voc_cluster.voc_clusters where primary_managed_system_id in ${ours}`);
    await run(`delete from voc.vocs where primary_managed_system_id in ${ours}`);
    await run(`delete from core.responsibility_default_failures where managed_system_id in ${ours}`);
  }
  beforeEach(async () => {
    await w.clearRateLimits();
    await cleanFixtures();
  });

  const send = (method: 'GET' | 'POST', url: string, cookie: string, payload?: Record<string, unknown>) =>
    w.app.inject({
      method,
      url,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        ...(method === 'POST' ? { 'idempotency-key': randomUUID() } : {}),
      },
      ...(payload ? { payload } : {}),
    });

  async function embed(vocId: string, enabled = true): Promise<void> {
    if (!enabled) return;
    await w.migrate.pool.query(
      `insert into voc.voc_embeddings
         (voc_id, workspace_id, embedding_version, provider, model, dimensions, embedding, source_hash)
       values ($1, $2, $3, 'test', 'callers', 3, '[1,0,0]'::vector, $4)`,
      [vocId, WORKSPACE_ID, VERSION, `callers-${vocId}`],
    );
  }

  const bodyOf = <T = Record<string, unknown>>(res: { json: () => unknown }) => res.json() as T;

  async function embedDerived(vocId: string): Promise<void> {
    const row = (
      await w.migrate.pool.query<{ title: string; description_rich_content: unknown }>(
        `select title, description_rich_content from voc.vocs where id = $1`,
        [vocId],
      )
    ).rows[0];
    if (!row) throw new Error('voc fixture missing');
    const hash = deriveVocEmbeddingInput({ title: row.title, descriptionRichContent: row.description_rich_content as never }).sourceHash;
    await w.migrate.pool.query(
      `insert into voc.voc_embeddings
         (voc_id, workspace_id, embedding_version, provider, model, dimensions, embedding, source_hash)
       values ($1, $2, $3, 'test', 'callers', 3, '[1,0,0]'::vector, $4)`,
      [vocId, WORKSPACE_ID, VERSION, hash],
    );
  }

  describe('pre-submit peers', () => {
    it('lists only the actor’s own A VOC, not an operator-reported one', async () => {
      const own = await w.insertVoc(w.systems.a, 'granted', 'own A');
      const other = await w.insertVoc(w.systems.a, 'admin', 'someone else A');
      const res = await send('GET', `/vocs/pre-submit-peers?managed_system_id=${w.systems.a}`, w.cookies.granted);
      expect(res.statusCode).toBe(200);
      const text = JSON.stringify(res.json());
      expect(text).toContain(own); // positive control: the route reached the peer query
      expect(text).not.toContain(other);
      // Positive control for the negative: a voc.read holder on A sees `other`.
      const reader = await send('GET', `/vocs/pre-submit-peers?managed_system_id=${w.systems.a}`, cookies.finderRead);
      expect(JSON.stringify(reader.json())).toContain(other);
    });
  });

  describe('similar peers (VOC detail and list similar_count)', () => {
    it('a public-only owner of one A VOC sees only own peers; a voc.read holder sees all', async () => {
      const source = await w.insertVoc(w.systems.a, 'granted', 'similar source');
      const ownPeer = await w.insertVoc(w.systems.a, 'granted', 'own peer');
      const foreignPeer1 = await w.insertVoc(w.systems.a, 'admin', 'foreign peer 1');
      const foreignPeer2 = await w.insertVoc(w.systems.a, 'admin', 'foreign peer 2');
      const own = await send('GET', `/vocs/${source}`, w.cookies.granted);
      expect(own.statusCode).toBe(200);
      // The public-only grant keeps the actor in the reporter arm: no peer data at all, so no count of the restricted VOCs.
      const ownBody = bodyOf<{ similar_count?: number; similar?: unknown }>(own);
      expect(ownBody.similar_count).toBeUndefined();
      expect(ownBody.similar).toBeUndefined();
      // Positive control: the same source seen with voc.read counts every peer.
      const reader = bodyOf<{ similar_count: number; similar: { items: Array<{ id: string }> } }>(
        await send('GET', `/vocs/${source}`, cookies.finderRead),
      );
      expect(reader.similar_count).toBe(3);
      expect(reader.similar.items.map((p) => p.id).sort()).toEqual([ownPeer, foreignPeer1, foreignPeer2].sort());
      // The list face of the same projection: similar_count is absent for the public-only actor too.
      const list = bodyOf<{ items: Array<{ id: string; similar_count?: number }> }>(
        await send('GET', '/vocs?view=my', w.cookies.granted),
      );
      expect(list.items.map((i) => i.id)).toContain(source);
      expect(list.items.find((i) => i.id === source)?.similar_count ?? 0).toBe(0);
    });
  });

  describe('recommendations', () => {
    it('an owned source ranks the actor’s own candidate and never a non-owned A candidate', async () => {
      const source = await w.insertVoc(w.systems.a, 'granted', 'source');
      const ownCandidate = await w.insertVoc(w.systems.a, 'granted', 'own candidate');
      const otherCandidate = await w.insertVoc(w.systems.a, 'admin', 'foreign candidate');
      for (const id of [source, ownCandidate, otherCandidate]) await embed(id);
      const res = await send('GET', `/vocs/${source}/recommendations`, w.cookies.granted);
      expect(res.statusCode).toBe(200);
      const body = JSON.stringify(res.json());
      expect(body).toContain(ownCandidate); // embeddings match, the route reached candidate filtering
      expect(body).not.toContain(otherCandidate);
      const reader = await send('GET', `/vocs/${source}/recommendations`, cookies.finderRead);
      expect(JSON.stringify(reader.json())).toContain(otherCandidate); // broader grant sees it
    });

    it('a non-owned A source is the existing 404', async () => {
      const source = await w.insertVoc(w.systems.a, 'admin', 'foreign source');
      await embed(source);
      expect((await send('GET', `/vocs/${source}/recommendations`, w.cookies.granted)).statusCode).toBe(404);
      expect((await send('GET', `/vocs/${source}/recommendations`, cookies.finderRead)).statusCode).toBe(200);
    });
  });

  describe('conversation', () => {
    it('own VOC conversation opens, a non-owned A VOC conversation is 404', async () => {
      const own = await w.insertVoc(w.systems.a, 'granted', 'own');
      const other = await w.insertVoc(w.systems.a, 'admin', 'foreign');
      expect((await w.get(`/vocs/${own}/conversation`, 'granted')).statusCode).toBe(200);
      expect((await w.get(`/vocs/${other}/conversation`, 'granted')).statusCode).toBe(404);
      expect((await send('GET', `/vocs/${other}/conversation`, cookies.finderRead)).statusCode).toBe(200);
    });
  });

  describe('inbox', () => {
    it('a public-only actor gets the existing 403, not an empty list', async () => {
      await w.insertVoc(w.systems.a, 'granted', 'own A');
      const res = await send('GET', '/vocs?view=inbox', w.cookies.granted);
      expect(res.statusCode).toBe(403);
      expect(bodyOf<{ code: string }>(res).code).toBe('permission.denied');
      expect((await send('GET', '/vocs?view=inbox', cookies.finderRead)).statusCode).toBe(200);
    });

    it('voc.read on B + voc.read_public on A: B is returned, A is excluded', async () => {
      const a = await w.insertVoc(w.systems.a, 'admin', 'A restricted');
      const b = await w.insertVoc(w.systems.b, 'admin', 'B readable');
      const res = await send('GET', '/vocs?view=inbox', cookies.mixed);
      expect(res.statusCode).toBe(200);
      const items = bodyOf<{ items: Array<{ id: string }> }>(res).items.map((i) => i.id);
      expect(items).toContain(b);
      expect(items).not.toContain(a);
      // Control: a voc.read holder on A does get A in the inbox.
      const reader = bodyOf<{ items: Array<{ id: string }> }>(await send('GET', '/vocs?view=inbox', cookies.finderRead));
      expect(reader.items.map((i) => i.id)).toContain(a);
    });
  });

  describe('clusters', () => {
    async function seedCluster() {
      const restrictedMember = await w.insertVoc(w.systems.a, 'admin', 'restricted member');
      const ownMember = await w.insertVoc(w.systems.a, ids.finderPublic, 'own member');
      const restrictedPeer = await w.insertVoc(w.systems.a, 'admin', 'restricted peer');
      const ownPeer = await w.insertVoc(w.systems.a, ids.finderPublic, 'own peer');
      const created = await send('POST', '/voc-clusters', w.cookies.admin, {
        title: 'cluster A',
        primary_managed_system_id: w.systems.a,
      });
      expect(created.statusCode).toBe(201);
      const clusterId = bodyOf<{ id: string }>(created).id;
      for (const voc of [restrictedMember, ownMember]) {
        const added = await send('POST', `/voc-clusters/${clusterId}/vocs`, w.cookies.admin, { voc_id: voc });
        expect([200, 201]).toContain(added.statusCode);
      }
      return { clusterId, restrictedMember, ownMember, restrictedPeer, ownPeer };
    }
    type Detail = { member_count: number; members: Array<{ voc_id: string }> };
    type Peers = { candidates: Array<{ voc_id: string }> };

    it('detail shows only readable members and a matching member_count', async () => {
      const f = await seedCluster();
      const reader = await send('GET', `/voc-clusters/${f.clusterId}`, cookies.finderRead);
      expect(reader.statusCode).toBe(200);
      expect(bodyOf<Detail>(reader).member_count).toBe(2);
      expect(bodyOf<Detail>(reader).members.map((m) => m.voc_id).sort()).toEqual([f.restrictedMember, f.ownMember].sort());
      const pub = await send('GET', `/voc-clusters/${f.clusterId}`, cookies.finderPublic);
      expect(pub.statusCode).toBe(200); // finding.read opens the cluster ...
      expect(bodyOf<Detail>(pub).members.map((m) => m.voc_id)).toEqual([f.ownMember]); // ... only the own member stays
      expect(bodyOf<Detail>(pub).member_count).toBe(1);
    });

    it('candidate peers list only readable non-members', async () => {
      const f = await seedCluster();
      const reader = await send('GET', `/voc-clusters/${f.clusterId}/candidate-peers`, cookies.finderRead);
      expect(reader.statusCode).toBe(200);
      expect(bodyOf<Peers>(reader).candidates.map((c) => c.voc_id).sort()).toEqual([f.restrictedPeer, f.ownPeer].sort());
      const pub = await send('GET', `/voc-clusters/${f.clusterId}/candidate-peers`, cookies.finderPublic);
      expect(pub.statusCode).toBe(200);
      expect(bodyOf<Peers>(pub).candidates.map((c) => c.voc_id)).toEqual([f.ownPeer]);
    });

    it('an actor without finding.read gets the existing inaccessible-cluster 404', async () => {
      const f = await seedCluster();
      for (const url of [`/voc-clusters/${f.clusterId}`, `/voc-clusters/${f.clusterId}/candidate-peers`]) {
        const res = await send('GET', url, w.cookies.granted);
        expect(res.statusCode).toBe(404);
        expect(bodyOf<{ code: string }>(res).code).toBe('not_found.record');
        expect((await send('GET', url, cookies.finderRead)).statusCode).toBe(200);
      }
    });
  });

  describe('Finding and Task Request creation from a VOC', () => {
    const finding = { title: 'f', summary: 's', severity: 'low' };
    const taskRequest = { evidence_summary: 'e', requested_outcome: 'o' };

    it('Finding creation: public-only source is 404, voc.read source passes the same gate', async () => {
      const voc = await w.insertVoc(w.systems.a, 'admin', 'source');
      const denied = await send('POST', `/vocs/${voc}/create-finding`, cookies.finderPublic, finding);
      expect(denied.statusCode).toBe(404);
      const ok = await send('POST', `/vocs/${voc}/create-finding`, cookies.finderRead, finding);
      expect(ok.statusCode).toBe(201);
    });

    it('Task Request creation: public-only source is 404, voc.read source creates the request', async () => {
      const voc = await w.insertVoc(w.systems.a, 'admin', 'source');
      const denied = await send('POST', `/vocs/${voc}/request-task`, cookies.finderPublic, taskRequest);
      expect(denied.statusCode).toBe(404);
      const count = () =>
        w.migrate.pool.query<{ n: number }>(
          `select count(*)::int as n from task_request.task_requests where primary_managed_system_id = $1`,
          [w.systems.a],
        );
      expect((await count()).rows[0]?.n).toBe(0);
      const ok = await send('POST', `/vocs/${voc}/request-task`, cookies.finderRead, taskRequest);
      expect(ok.statusCode, ok.body).toBe(201);
      expect((await count()).rows[0]?.n).toBe(1);
    });
  });

  describe('Finding evidence, VOC evidence projection', () => {
    async function seedFinding(restricted: string) {
      const finding = await insertFindingRow(w.migrate, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: w.systems.a,
        sourceType: 'voc',
        sourceId: restricted,
        createdBy: w.actors.admin,
      });
      return finding.id;
    }
    const SECRET = 'restricted-evidence-quote';

    it('adding VOC evidence needs a readable source: public-only is 404, voc.read is 201', async () => {
      const restricted = await w.insertVoc(w.systems.a, 'admin', 'restricted evidence source');
      const findingId = await seedFinding(restricted);
      const payload = { source_type: 'voc', source_id: restricted, quote_or_summary: SECRET };
      expect((await send('POST', `/findings/${findingId}/evidence-highlights`, cookies.finderPublic, payload)).statusCode).toBe(404);
      expect((await send('POST', `/findings/${findingId}/evidence-highlights`, cookies.finderRead, payload)).statusCode).toBe(201);
    });

    it('listing and the inventory hide quote and source of a restricted VOC from a public-only reader', async () => {
      const restricted = await w.insertVoc(w.systems.a, 'admin', 'restricted evidence title');
      const own = await w.insertVoc(w.systems.a, ids.finderPublic, 'own evidence title');
      const findingId = await seedFinding(restricted);
      for (const [voc, quote] of [
        [restricted, SECRET],
        [own, 'own-evidence-quote'],
      ] as const) {
        await w.migrate.pool.query(
          `insert into finding.evidence_highlights
             (workspace_id, finding_id, primary_managed_system_id, source_type, source_id, quote_or_summary, created_by)
           values ($1, $2, $3, 'voc', $4, $5, $6)`,
          [WORKSPACE_ID, findingId, w.systems.a, voc, quote, w.actors.admin],
        );
      }
      for (const url of [`/findings/${findingId}/evidence-highlights`, `/evidence-highlights?managed_system_id=${w.systems.a}`]) {
        const reader = await send('GET', url, cookies.finderRead);
        expect(reader.statusCode).toBe(200);
        expect(JSON.stringify(reader.json())).toContain(SECRET); // control: broader grant sees the quote
        expect(JSON.stringify(reader.json())).toContain('restricted evidence title');
        const pub = await send('GET', url, cookies.finderPublic);
        expect(pub.statusCode).toBe(200);
        const text = JSON.stringify(pub.json());
        expect(text).not.toContain(SECRET);
        expect(text).not.toContain('restricted evidence title');
        expect(text).toContain('own-evidence-quote'); // the own-VOC evidence is still shown
        expect(text).toContain('own evidence title');
      }
    });
  });

  describe('permission-request source summary', () => {
    async function requestFor(requester: string, source: string): Promise<string> {
      const { id } = await insertPermissionRequestRow(w.migrate, {
        workspaceId: WORKSPACE_ID,
        requesterActorId: requester,
        requestedCapability: 'voc.read',
        requestedManagedSystemId: w.systems.a,
        reason: 'callers',
      });
      await w.migrate.pool.query(
        `update permission.permission_requests set source_object_type = 'voc', source_object_id = $2 where id = $1`,
        [id, source],
      );
      return id;
    }
    type Detail = { source_summary: { id: string; display_id: string } | null };

    it('a public-only requester gets no summary of a restricted VOC but gets one for an own VOC', async () => {
      const restricted = await w.insertVoc(w.systems.a, 'admin', 'restricted source');
      const own = await w.insertVoc(w.systems.a, ids.finderPublic, 'own source');
      const onRestricted = await requestFor(ids.finderPublic, restricted);
      const onOwn = await requestFor(ids.finderPublic, own);
      const reader = await requestFor(ids.finderRead, restricted);
      const denied = await send('GET', `/permission-requests/${onRestricted}`, cookies.finderPublic);
      expect(denied.statusCode, denied.body).toBe(200);
      expect(bodyOf<Detail>(denied).source_summary).toBeNull();
      const allowedOwn = await send('GET', `/permission-requests/${onOwn}`, cookies.finderPublic);
      expect(allowedOwn.statusCode).toBe(200);
      expect(bodyOf<Detail>(allowedOwn).source_summary?.id).toBe(own);
      const control = await send('GET', `/permission-requests/${reader}`, cookies.finderRead);
      expect(control.statusCode).toBe(200);
      expect(bodyOf<Detail>(control).source_summary?.id).toBe(restricted);
    });
  });

  describe('entity-link provider', () => {
    it('listing links of a VOC the actor cannot read as source is refused, a voc.read holder lists', async () => {
      const voc = await w.insertVoc(w.systems.a, 'admin', 'linked');
      const url = `/entity-links?source_type=voc&source_id=${voc}`;
      const denied = await send('GET', url, w.cookies.granted);
      expect([403, 404]).toContain(denied.statusCode);
      expect((await send('GET', url, cookies.finderRead)).statusCode).toBe(200);
    });
  });

  describe('dashboard', () => {
    it('area report: a public-only actor gets the system row without VOC counts, voc.read gets exact counts', async () => {
      const r1 = await w.insertVoc(w.systems.a, 'admin', 'report one');
      await w.insertVoc(w.systems.a, 'admin', 'report two');
      await insertFindingRow(w.migrate, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: w.systems.a,
        sourceType: 'voc',
        sourceId: r1,
        createdBy: w.actors.admin,
      });
      type Report = { items: Array<{ managed_system_id: string; voc?: { total: { count: number } }; finding?: unknown }> };
      const url = `/dashboard/analytics-areas?managed_system_id=${w.systems.a}`;
      const reader = bodyOf<Report>(await send('GET', url, cookies.finderRead)).items.find((i) => i.managed_system_id === w.systems.a);
      expect(reader?.voc?.total.count).toBe(2);
      const pub = await send('GET', url, cookies.finderPublic);
      expect(pub.statusCode).toBe(200);
      const row = bodyOf<Report>(pub).items.find((i) => i.managed_system_id === w.systems.a);
      expect(row?.finding).toBeDefined(); // the row is reached through finding.read
      expect(row?.voc).toBeUndefined();
    });

    it('recovery items: voc.read sees the unassigned VOC, a public-only actor does not', async () => {
      const voc = await w.insertVoc(w.systems.a, 'admin', 'unassigned recovery');
      const url = `/dashboard/recovery-items?category=unassigned-voc&managed_system_id=${w.systems.a}`;
      const reader = await send('GET', url, cookies.finderRead);
      expect(reader.statusCode, reader.body).toBe(200);
      expect(JSON.stringify(reader.json())).toContain(voc);
      const pub = await send('GET', url, cookies.finderPublic);
      expect(pub.statusCode, pub.body).toBe(200);
      expect(JSON.stringify(pub.json())).not.toContain(voc);
    });
  });

  describe('nav counts', () => {
    it('same VOC set: voc.read holder counts all, a public-only actor gets no VOC count keys', async () => {
      await w.insertVoc(w.systems.a, 'admin', 'A one');
      await w.insertVoc(w.systems.a, 'admin', 'A two');
      await w.insertVoc(w.systems.a, 'granted', 'A own');
      const url = `/nav/counts?managed_system_id=${w.systems.a}`;
      const reader = bodyOf<{ counts: Record<string, number> }>(await send('GET', url, cookies.finderRead)).counts;
      expect(reader['voc.inbox']).toBe(3); // control: the three A VOCs
      const pub = await send('GET', url, w.cookies.granted);
      expect(pub.statusCode).toBe(200);
      const counts = bodyOf<{ counts: Record<string, number> }>(pub).counts;
      expect(Object.keys(counts).filter((k) => k.startsWith('voc.') && k !== 'voc.my' && k !== 'voc.clusters')).toEqual([]);
      // The owner view is the actor's own VOC only, never the operator population.
      expect(counts['voc.my'] ?? 0).toBeLessThanOrEqual(1);
    });
  });

  describe('notifications', () => {
    async function notify(actor: string, voc: string): Promise<string> {
      const res = await w.migrate.pool.query<{ id: string }>(
        `insert into core.notifications
           (workspace_id, actor_id, event_type, subject_type, subject_id, summary, correlation_id)
         values ($1, $2, 'voc.reporter_replied', 'voc', $3, 'callers notification', $4) returning id`,
        [WORKSPACE_ID, actor, voc, randomUUID()],
      );
      return res.rows[0]?.id ?? '';
    }
    type List = { items: Array<{ id: string; subject_id: string; subject_ref: Record<string, unknown> }> };

    it('a restricted VOC subject is unavailable to a public-only recipient, an own VOC is allowed, a reader sees it', async () => {
      const restricted = await w.insertVoc(w.systems.a, 'admin', 'restricted subject');
      const own = await w.insertVoc(w.systems.a, 'granted', 'own subject');
      const nRestricted = await notify(w.actors.granted, restricted);
      const nOwn = await notify(w.actors.granted, own);
      const nReader = await notify(ids.finderRead, restricted);
      const nOtherRecipient = await notify(ids.finderRead, own);
      const pub = await send('GET', '/notifications', w.cookies.granted);
      expect(pub.statusCode).toBe(200);
      const items = bodyOf<List>(pub).items;
      expect(items.map((i) => i.id).sort()).toEqual([nRestricted, nOwn].sort());
      expect(items.find((i) => i.id === nRestricted)?.subject_ref).toEqual({ visibility_state: 'unavailable' });
      const ownRef = items.find((i) => i.id === nOwn)?.subject_ref;
      expect(ownRef).toMatchObject({ visibility_state: 'allowed' });
      expect(JSON.stringify(ownRef)).toContain('own subject');
      expect(JSON.stringify(pub.json())).not.toContain('restricted subject');
      const reader = bodyOf<List>(await send('GET', '/notifications', cookies.finderRead));
      expect(reader.items.map((i) => i.id).sort()).toEqual([nReader, nOtherRecipient].sort());
      const readerRef = reader.items.find((i) => i.id === nReader)?.subject_ref;
      expect(readerRef).toMatchObject({ visibility_state: 'allowed' });
      expect(JSON.stringify(readerRef)).toContain('restricted subject');
    });
  });

  describe('similarity preview and cluster suggestions (stub embedding provider)', () => {
    let aiApp: Awaited<ReturnType<typeof buildServer>>;
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Description' }] }] };
    beforeAll(async () => {
      const identity = { provider: 'test', model: 'callers', dimensions: 3 };
      aiApp = await buildServer({
        config: { ...loadConfig(), EMBEDDING_PROVIDER: 'fake', EMBEDDING_VERSION: VERSION, VOC_SIMILARITY_PREVIEW: 'enabled' },
        dbHandle: w.appHandle,
        embeddingProvider: {
          identity: () => identity,
          embed: async () => ({ ...identity, embeddingVersion: VERSION, vectors: [[1, 0, 0]] }),
        },
      });
      await aiApp.ready();
    });
    afterAll(async () => {
      await aiApp?.close();
    });
    const sendAi = (method: 'GET' | 'POST', url: string, cookie: string, payload?: Record<string, unknown>) =>
      aiApp.inject({
        method,
        url,
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
          'content-type': 'application/json',
          ...(method === 'POST' ? { 'idempotency-key': randomUUID() } : {}),
        },
        ...(payload ? { payload } : {}),
      });

    it('preview returns the actor’s own matching VOC and never a restricted one; voc.read gets both', async () => {
      const restricted = await w.insertVoc(w.systems.a, 'admin', 'preview restricted');
      const own = await w.insertVoc(w.systems.a, ids.finderPublic, 'preview own');
      await embed(restricted);
      await embed(own);
      const draft = { primary_managed_system_id: w.systems.a, title: 'Draft', description_rich_content: doc };
      type Preview = { available: boolean; items: Array<{ id: string }> };
      const reader = await sendAi('POST', '/vocs/similarity-preview', cookies.finderRead, draft);
      expect(reader.statusCode, reader.body).toBe(200);
      expect(bodyOf<Preview>(reader).items.map((i) => i.id).sort()).toEqual([restricted, own].sort());
      const pub = await sendAi('POST', '/vocs/similarity-preview', cookies.finderPublic, draft);
      expect(pub.statusCode, pub.body).toBe(200);
      expect(bodyOf<Preview>(pub).available).toBe(true);
      expect(bodyOf<Preview>(pub).items.map((i) => i.id)).toEqual([own]);
    });

    it('cluster suggestions: a pair with a restricted VOC is hidden from a public-only actor, an own-VOC pair is shown', async () => {
      const restrictedA = await w.insertVoc(w.systems.a, 'admin', 'suggest restricted a');
      const restrictedB = await w.insertVoc(w.systems.a, 'admin', 'suggest restricted b');
      const ownA = await w.insertVoc(w.systems.a, ids.finderPublic, 'suggest own a');
      const ownB = await w.insertVoc(w.systems.a, ids.finderPublic, 'suggest own b');
      for (const id of [restrictedA, restrictedB, ownA, ownB]) await embedDerived(id);
      const suggest = async (x: string, y: string) => {
        const [a, b] = [x, y].sort();
        const res = await w.migrate.pool.query<{ id: string }>(
          `insert into voc.voc_cluster_suggestions(workspace_id,primary_managed_system_id,voc_a_id,voc_b_id,
             provider,model,dimensions,embedding_version,source_hash_a,source_hash_b,embedding_watermark_a,embedding_watermark_b,score,cut,run_correlation_id)
           select $1,$2,$3::uuid,$4::uuid,e.provider,e.model,e.dimensions,$6,e.source_hash,f.source_hash,e.updated_at,f.updated_at,(1-(e.embedding <=> f.embedding)),0.85,$5
           from voc.voc_embeddings e cross join voc.voc_embeddings f
           where e.voc_id=$3::uuid and f.voc_id=$4::uuid and e.embedding_version=$6 and f.embedding_version=$6 returning id`,
          [WORKSPACE_ID, w.systems.a, a, b, randomUUID(), VERSION],
        );
        return res.rows[0]?.id ?? '';
      };
      const restrictedPair = await suggest(restrictedA, restrictedB);
      const ownPair = await suggest(ownA, ownB);
      type List = { available: boolean; items: Array<{ id: string }> };
      const reader = bodyOf<List>(await sendAi('GET', `/voc-cluster-suggestions?managed_system_id=${w.systems.a}`, cookies.finderRead));
      expect(reader.available).toBe(true);
      expect(reader.items.map((i) => i.id).sort()).toEqual([restrictedPair, ownPair].sort());
      const pub = bodyOf<List>(await sendAi('GET', `/voc-cluster-suggestions?managed_system_id=${w.systems.a}`, cookies.finderPublic));
      expect(pub.items.map((i) => i.id)).toEqual([ownPair]);
    });
  });

  describe('one actor with voc.read on B and voc.read_public on A', () => {
    it('operator surfaces open B and stay closed for A', async () => {
      const a = await w.insertVoc(w.systems.a, 'admin', 'A foreign');
      const b = await w.insertVoc(w.systems.b, 'admin', 'B foreign');
      expect((await send('GET', `/vocs/${b}`, cookies.mixed)).statusCode).toBe(200);
      expect((await send('GET', `/vocs/${a}`, cookies.mixed)).statusCode).toBe(404);
      expect((await send('GET', `/vocs/${a}/conversation`, cookies.mixed)).statusCode).toBe(404);
      expect((await send('GET', `/vocs/public/${a}`, cookies.mixed)).statusCode).toBe(200);
    });
  });
});
