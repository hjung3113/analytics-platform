// Loads a synthetic evaluation corpus into a throwaway workspace and indexes it (#1508 S-e). Fixtures go through the migrate role
// (like every integration suite); the index is built by the real outbox consumer, not by hand.

import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import type { Db } from '../../../../db/client.js';
import { toCodeKey } from '../../domain/code-key.js';
import { backfillWorkspace, drainBatch } from '../../repositories/search-index.js';
import type { Corpus } from './corpus.js';

export interface LoadedCorpus {
  workspaceId: string;
  viewerId: string;
  creatorId: string;
  /** Corpus item key -> database id, and the reverse. */
  itemId: Map<string, string>;
  itemKey: Map<string, string>;
  modelId: Map<string, string>;
  softwareId: Map<string, string>;
}

const CHUNK = 2000;
function chunks<T>(list: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export async function loadCorpus(migrate: pg.Pool, corpus: Corpus, tag: string): Promise<LoadedCorpus> {
  const workspaceId = randomUUID();
  const q = async (text: string, params: unknown[] = []) => migrate.query(text, params);
  const one = async (text: string, params: unknown[]) => (await q(text, params)).rows[0]?.id as string;
  await q('insert into core.workspaces (id, name) values ($1, $2)', [workspaceId, `${tag}-${workspaceId.slice(0, 4)}`]);
  const actor = async (name: string) =>
    one(`insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type) values ($1,$2,$2 || '@local',$2,'admin','internal_member') returning id`, [workspaceId, `${tag}-${name}`]);
  const creatorId = await actor('creator');
  const viewerId = await actor('viewer');
  const vendor = await one(`insert into knowledge.vendor (workspace_id, code, code_key, name, created_by, updated_by) values ($1,$2,$3,'Synthetic vendor',$4,$4) returning id`, [workspaceId, `${tag}V`, toCodeKey(`${tag}V`), creatorId]);
  const modelId = new Map<string, string>();
  for (const m of corpus.models) {
    const code = `${tag}${m}`;
    modelId.set(m, await one(`insert into knowledge.equipment_model (workspace_id, vendor_id, code, code_key, name, created_by, updated_by) values ($1,$2,$3,$4,$3,$5,$5) returning id`, [workspaceId, vendor, code, toCodeKey(code), creatorId]));
  }
  const softwareId = new Map<string, string>();
  for (const s of corpus.software) {
    const label = `${tag}${s.code}`;
    softwareId.set(s.code, await one(`insert into knowledge.software_version (workspace_id, model_id, version_label, version_key, name, created_by, updated_by) values ($1,$2,$3,$4,'',$5,$5) returning id`, [workspaceId, modelId.get(s.model), label, toCodeKey(label), creatorId]));
  }

  const itemId = new Map<string, string>();
  const itemKey = new Map<string, string>();
  for (const it of corpus.items) {
    const id = randomUUID();
    itemId.set(it.key, id);
    itemKey.set(id, it.key);
  }
  for (const part of chunks(corpus.items.map((it, i) => ({ it, no: i + 1 })))) {
    const owner = (o: (typeof part)[number]['it']['owner']) => ('model' in o ? [modelId.get(o.model) ?? null, null] : [null, softwareId.get(o.software) ?? null]);
    const ids = part.map((p) => itemId.get(p.it.key));
    await q(
      `insert into knowledge.knowledge_item (id, workspace_id, item_no, owner_model_id, owner_software_id, latest_revision_no, publication_state, created_by, updated_by)
       select u.id, $1, u.no, u.m, u.s, 1, 'published', $2, $2 from unnest($3::uuid[], $4::int[], $5::uuid[], $6::uuid[]) as u(id, no, m, s)`,
      [workspaceId, creatorId, ids, part.map((p) => p.no), part.map((p) => owner(p.it.owner)[0]), part.map((p) => owner(p.it.owner)[1])],
    );
    await q(
      `insert into knowledge.knowledge_item_revision (workspace_id, item_id, revision_no, title, type_code, observation, published_by, published_at)
       select $1, u.id, 1, u.title, 'anomaly', u.obs, $2, now() - (u.no || ' seconds')::interval from unnest($3::uuid[], $4::text[], $5::text[], $6::int[]) as u(id, title, obs, no)`,
      [workspaceId, creatorId, ids, part.map((p) => p.it.title), part.map((p) => p.it.observation), part.map((p) => p.no)],
    );
    const rel = part.flatMap((p) => p.it.relations.map((r, n) => ({ id: itemId.get(p.it.key), ordinal: n + 1, ...r })));
    if (rel.length > 0) {
      await q(
        `insert into knowledge.item_event_relation_record (workspace_id, item_id, revision_no, ordinal, kind, source_key, predicate, target_key, resolved)
         select $1, u.id, 1, u.ord, u.kind, u.s, 'before', u.t, true from unnest($2::uuid[], $3::int[], $4::text[], $5::text[], $6::text[]) as u(id, ord, kind, s, t)`,
        [workspaceId, rel.map((r) => r.id), rel.map((r) => r.ordinal), rel.map((r) => r.kind), rel.map((r) => r.source), rel.map((r) => r.target)],
      );
    }
  }

  for (const c of corpus.concepts) {
    const label = `${tag} ${c.label}`;
    const concept = await one(`insert into knowledge.common_concept (workspace_id, kind, canonical_label, label_key, created_by) values ($1,'event',$2,$3,$4) returning id`, [workspaceId, label, toCodeKey(label), creatorId]);
    for (const m of c.members) {
      await q(
        `insert into knowledge.spec_concept_mapping (workspace_id, concept_id, model_id, target_kind, target_key, relation_kind, review_state, origin, reject_reason, proposed_by, reviewed_by, reviewed_at)
         values ($1,$2,$3,'event',$4,'equivalent',$5,'human',$6,$7,$8,$9)`,
        [workspaceId, concept, modelId.get(m.model), m.key, m.state, m.state === 'rejected' ? 'no' : null, creatorId, m.state === 'proposed' ? null : creatorId, m.state === 'proposed' ? null : new Date().toISOString()],
      );
    }
  }
  return { workspaceId, viewerId, creatorId, itemId, itemKey, modelId, softwareId };
}

/** Builds the index through the real backfill + outbox consumer. Returns how many notifications were processed. */
export async function indexWorkspace(db: Db, workspaceId: string, batchSize = 200): Promise<number> {
  await backfillWorkspace(db, workspaceId);
  let done = 0;
  for (;;) {
    const r = await drainBatch(db, { workspaceId, batchSize });
    done += r.done;
    if (r.dead > 0) throw new Error(`search index drain left ${r.dead} dead notification(s)`);
    if (r.claimed === 0) return done;
  }
}

/** Removes everything `loadCorpus` created, children first. */
export async function removeWorkspace(migrate: pg.Pool, workspaceId: string): Promise<void> {
  const tables = [
    'knowledge.search_document',
    'knowledge.search_outbox',
    'knowledge.search_backfill_progress',
    'knowledge.search_index_pointer',
    'knowledge.object_access_rule',
    'knowledge.item_event_relation_record',
    'knowledge.item_revision_subject',
    'knowledge.knowledge_item_revision',
    'knowledge.knowledge_item',
    'knowledge.spec_concept_mapping',
    'knowledge.common_concept',
    'knowledge.software_version',
    'knowledge.equipment_model',
    'knowledge.vendor',
    'core.actors',
    'core.workspaces',
  ];
  for (const t of tables) await migrate.query(`delete from ${t} where ${t === 'core.workspaces' ? 'id' : 'workspace_id'} = $1`, [workspaceId]);
}

/** Fresh tables have no planner statistics until autovacuum runs; an unanalysed corpus measured the planner's guesses, not the statement. */
export async function analyzeTables(migrate: pg.Pool): Promise<void> {
  for (const t of ['knowledge_item', 'knowledge_item_revision', 'item_event_relation_record', 'item_revision_subject', 'spec_concept_mapping', 'search_document', 'object_access_rule', 'equipment_model', 'software_version']) {
    await migrate.query(`analyze knowledge.${t}`);
  }
}
