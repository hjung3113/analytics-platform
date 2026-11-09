// Load + EXPLAIN runner of the knowledge search (#1508 S-e, design log-knowledge-search §6).
//   PLATFORM_API_ENV_FILE=<abs path of the lane's env file> NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @ap/platform-api search:load
// Fixed synthetic workspace in the THROWAWAY database of the env file: 100,000 Items by SQL generate_series (batches of 5,000),
// index by the real consumer, then for each access-rule coverage 0 / 5 / 30 % : 30 concurrent clients, page size 20, p50/p95/p99 of
// `runSearch` (database + application time of the read, NOT HTTP or JSON) and EXPLAIN (ANALYZE, BUFFERS) of the search statements.
// RESUMABLE: item batches continue from the highest item_no, the index continues from its backfill progress, and a coverage whose
// result file already exists in the output directory is skipped. Env: SEARCH_LOAD_ITEMS (default 100000), SEARCH_LOAD_QUERIES
// (measured requests per coverage, default 3000), SEARCH_LOAD_CONCURRENCY (30), SEARCH_LOAD_COVERAGE ("0,5,30"),
// SEARCH_LOAD_RESET=1 (delete the workspace first), SEARCH_EVAL_OUT (default <tmp>/search-eval).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import { sql } from 'drizzle-orm';

import { createDb } from '../../../../db/client.js';
import { visibleItemSql } from '../../repositories/access-visibility.js';
import { rowsOf } from '../../repositories/search-outbox.js';
import { type SearchInput, runSearch } from '../../repositories/search-read.js';
import { explainSearch } from './explain.js';
import { guardDatabase } from './guard.js';
import { indexWorkspace, removeWorkspace } from './load-corpus.js';
import { percentile } from './metrics.js';

const WORKSPACE = '15080000-0000-4000-8000-000000000001';
const MODELS = 20;
const BATCH = 5000;
const SYL = ['ka', 'vo', 'mi', 'ze', 'tu', 'ra', 'ni', 'so', 'be', 'lu', 'qua', 'fi', 'do', 'xa', 'pe', 'gro'];
const KOREAN = ['압력센서', '진공펌프', '웨이퍼정렬', '냉각수누수', '가스유량', '히터온도'];
const PARTICLES = ['', '는', '를', '에서', '이'];

/** Deterministic vocabulary: ~380 made-up words and every Korean term with five particle forms. */
function vocabulary(): { words: string[]; korean: string[] } {
  const set = new Set<string>();
  for (let i = 0; set.size < 380; i++) set.add(`${SYL[i % 16]}${SYL[Math.floor(i / 16) % 16]}${SYL[(i * 7 + 3) % 16]}${Math.floor(i / 256) > 0 ? i : ''}`);
  const korean = KOREAN.flatMap((t) => PARTICLES.map((p) => `${t}${p}`));
  return { words: [...set, ...korean], korean };
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Shape = 'word' | 'phrase' | 'event_key' | 'direction' | 'direction_opposite' | 'korean' | 'typo';
interface LoadQuery {
  shape: Shape;
  input: SearchInput;
}
const base = (q: string, over: Partial<SearchInput> = {}): SearchInput => ({ q, owner: null, relation: null, kind: 'all', includeOpposite: false, cursor: null, limit: 20, ...over });

function queryMix(count: number, words: string[], seed: number): LoadQuery[] {
  const random = rng(seed);
  const plain = words.slice(0, 380);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;
  const out: LoadQuery[] = [];
  for (let n = 0; n < count; n++) {
    const r = random();
    if (r < 0.25) out.push({ shape: 'word', input: base(pick(plain)) });
    else if (r < 0.4) out.push({ shape: 'phrase', input: base(`${pick(plain)} ${pick(plain)}`) });
    else if (r < 0.5) out.push({ shape: 'event_key', input: base(`evt_${Math.floor(random() * 2000)}`) });
    else if (r < 0.78) {
      const g = 1 + Math.floor(random() * 99_000);
      // Pair of the generator: source EVT_(g % 2000) -> target EVT_((7g + 1) % 2000), module keys MOD(g % 50) / MOD((3g) % 50).
      out.push({ shape: r < 0.7 ? 'direction' : 'direction_opposite', input: base(`EVT_${g % 2000} before EVT_${(g * 7 + 1) % 2000}`, { includeOpposite: r >= 0.7 }) });
    } else if (r < 0.9) out.push({ shape: 'korean', input: base(pick(KOREAN)) });
    else {
      const w = pick(plain);
      out.push({ shape: 'typo', input: base(w.length > 4 ? w.slice(0, 2) + w.slice(3) : `${w}x`) });
    }
  }
  return out;
}

async function main(): Promise<number> {
  const { appUrl, migrateUrl } = guardDatabase();
  const total = Number(process.env.SEARCH_LOAD_ITEMS ?? 100_000);
  const measured = Number(process.env.SEARCH_LOAD_QUERIES ?? 3000);
  const concurrency = Number(process.env.SEARCH_LOAD_CONCURRENCY ?? 30);
  const coverages = (process.env.SEARCH_LOAD_COVERAGE ?? '0,5,30').split(',').map(Number);
  const out = process.env.SEARCH_EVAL_OUT ?? join(tmpdir(), 'search-eval');
  mkdirSync(out, { recursive: true });
  const app = createDb(appUrl, { budgets: { poolMax: concurrency + 2, acquireTimeoutMs: 60_000, statementTimeoutMs: 60_000, lockTimeoutMs: 5000, idleInTransactionTimeoutMs: 60_000 } });
  const migrate = createDb(migrateUrl);
  const q = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const log = (m: string) => console.info(`[${new Date().toISOString()}] ${m}`);
  try {
    if (process.env.SEARCH_LOAD_RESET === '1') {
      log('reset: removing the load workspace');
      await removeWorkspace(migrate.pool, WORKSPACE);
    }
    const { words } = vocabulary();

    // ---- fixtures (idempotent) ----
    await q(`insert into core.workspaces (id, name) values ($1, 'search-load') on conflict (id) do nothing`, [WORKSPACE]);
    const actor = async (name: string) => {
      const r = await q(
        `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type) values ($1,$2,$2 || '@local',$2,'admin','internal_member')
         on conflict (workspace_id, external_id) do update set email = excluded.email returning id`,
        [WORKSPACE, `search-load-${name}`],
      );
      return r.rows[0].id as string;
    };
    const creator = await actor('creator');
    const viewer = await actor('viewer');
    await q(`insert into knowledge.vendor (workspace_id, code, code_key, name, created_by, updated_by) values ($1,'LOADV','LOADV','Synthetic vendor',$2,$2) on conflict do nothing`, [WORKSPACE, creator]);
    const vendor = (await q(`select id from knowledge.vendor where workspace_id = $1 and code_key = 'LOADV'`, [WORKSPACE])).rows[0].id as string;
    for (let m = 1; m <= MODELS; m++) {
      const code = `LOADM${String(m).padStart(2, '0')}`;
      await q(`insert into knowledge.equipment_model (workspace_id, vendor_id, code, code_key, name, created_by, updated_by) values ($1,$2,$3,$3,$3,$4,$4) on conflict do nothing`, [WORKSPACE, vendor, code, creator]);
    }
    const modelIds = (await q(`select id from knowledge.equipment_model where workspace_id = $1 order by code_key`, [WORKSPACE])).rows.map((r) => r.id as string);

    // ---- Items in batches (resumable by highest item_no) ----
    let have = Number((await q(`select coalesce(max(item_no), 0) as n from knowledge.knowledge_item where workspace_id = $1`, [WORKSPACE])).rows[0].n);
    log(`items present: ${have} of ${total}`);
    while (have < total) {
      const from = have + 1;
      const to = Math.min(total, have + BATCH);
      const client = await migrate.pool.connect();
      try {
        await client.query('begin');
        await client.query(
          `insert into knowledge.knowledge_item (id, workspace_id, item_no, owner_model_id, latest_revision_no, publication_state, created_by, updated_by)
           select gen_random_uuid(), $1, g, ($2::uuid[])[1 + g % cardinality($2::uuid[])], 1, 'published', $3, $3 from generate_series($4::int, $5::int) g`,
          [WORKSPACE, modelIds, creator, from, to],
        );
        await client.query(
          `insert into knowledge.knowledge_item_revision (workspace_id, item_id, revision_no, title, type_code, observation, published_by, published_at)
           select $1, i.id, 1,
             ($5::text[])[1 + (i.item_no * 7) % cardinality($5::text[])] || ' ' || ($5::text[])[1 + (i.item_no * 13) % cardinality($5::text[])] || ' ' || ($5::text[])[1 + (i.item_no * 31) % cardinality($5::text[])],
             'anomaly',
             ($5::text[])[1 + (i.item_no * 3) % cardinality($5::text[])] || ' ' || ($5::text[])[1 + (i.item_no * 17) % cardinality($5::text[])] || ' ' || ($5::text[])[1 + (i.item_no * 29) % cardinality($5::text[])] || ' ' || ($5::text[])[1 + (i.item_no * 37) % cardinality($5::text[])] || ' observed during the shift',
             $2, now() - (i.item_no || ' seconds')::interval
           from knowledge.knowledge_item i where i.workspace_id = $1 and i.item_no between $3 and $4`,
          [WORKSPACE, creator, from, to, words],
        );
        await client.query(
          `insert into knowledge.item_event_relation_record (workspace_id, item_id, revision_no, ordinal, kind, source_key, predicate, target_key, resolved)
           select $1, i.id, 1, 1, case when i.item_no % 5 = 0 then 'expected' else 'observed' end,
             format('MOD%s/EVT_%s', i.item_no % 50, i.item_no % 2000), 'before', format('MOD%s/EVT_%s', (i.item_no * 3) % 50, (i.item_no * 7 + 1) % 2000), true
           from knowledge.knowledge_item i where i.workspace_id = $1 and i.item_no between $2 and $3`,
          [WORKSPACE, from, to],
        );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
      have = to;
      log(`items inserted up to ${have}`);
    }

    // ---- index (resumable through the backfill progress; a short index is rebuilt) ----
    const docs = Number((await q(`select count(*) as n from knowledge.search_document where workspace_id = $1`, [WORKSPACE])).rows[0].n);
    if (docs < total) {
      if (docs > 0) await q(`delete from knowledge.search_backfill_progress where workspace_id = $1`, [WORKSPACE]);
      log(`index has ${docs} of ${total} documents: building`);
      const t0 = performance.now();
      const n = await indexWorkspace(app.db, WORKSPACE, 200);
      log(`index drained ${n} notifications in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
    }
    for (const t of ['knowledge_item', 'knowledge_item_revision', 'item_event_relation_record', 'search_document', 'equipment_model']) await q(`analyze knowledge.${t}`);

    // ---- per coverage ----
    const input = (qq: string, over: Partial<SearchInput> = {}) => base(qq, over);
    for (const c of coverages) {
      const file = join(out, `load-${c}.json`);
      if (existsSync(file)) {
        log(`coverage ${c}%: result exists, skipped (${file})`);
        continue;
      }
      await q(`update knowledge.knowledge_item set access_mode = 'internal' where workspace_id = $1 and access_mode <> 'internal'`, [WORKSPACE]);
      await q(`update knowledge.equipment_model set access_mode = 'internal' where workspace_id = $1 and access_mode <> 'internal'`, [WORKSPACE]);
      await q(`delete from knowledge.object_access_rule where workspace_id = $1`, [WORKSPACE]);
      if (c > 0) {
        // c % of the Items are restricted, a third of those carry an allow rule for the viewer; c % of the Models are restricted and every second one has an allow rule.
        await q(`update knowledge.knowledge_item set access_mode = 'restricted' where workspace_id = $1 and item_no % 100 < $2`, [WORKSPACE, c]);
        await q(
          `insert into knowledge.object_access_rule (workspace_id, target_kind, target_id, grantee_id, effect, created_by)
           select workspace_id, 'item', id, $2, 'allow', $3 from knowledge.knowledge_item where workspace_id = $1 and access_mode = 'restricted' and item_no % 3 = 0`,
          [WORKSPACE, viewer, creator],
        );
        const restrictedModels = modelIds.slice(0, Math.round((MODELS * c) / 100));
        await q(`update knowledge.equipment_model set access_mode = 'restricted' where workspace_id = $1 and id = any($2::uuid[])`, [WORKSPACE, restrictedModels]);
        await q(
          `insert into knowledge.object_access_rule (workspace_id, target_kind, target_id, grantee_id, effect, created_by)
           select $1, 'model', m, $3, 'allow', $4 from unnest($2::uuid[]) with ordinality as t(m, n) where n % 2 = 0`,
          [WORKSPACE, restrictedModels, viewer, creator],
        );
      }
      await q('analyze knowledge.knowledge_item');
      await q('analyze knowledge.object_access_rule');
      await q('analyze knowledge.equipment_model');
      const viewerRef = { workspaceId: WORKSPACE, actorId: viewer };
      const [visible] = rowsOf<{ n: number }>(await app.db.execute(sql`select count(*)::int as n from knowledge.knowledge_item i where i.workspace_id = ${WORKSPACE}::uuid and ${visibleItemSql(viewerRef, sql`i.id`)}`));

      const mix = queryMix(measured + 100, words, 1508 + c);
      const durations: { shape: Shape; ms: number }[] = [];
      let next = 0;
      let failures = 0;
      const t0 = performance.now();
      await Promise.all(
        Array.from({ length: concurrency }, async () => {
          for (;;) {
            const i = next++;
            if (i >= mix.length) return;
            const item = mix[i] as LoadQuery;
            const s = performance.now();
            const res = await runSearch(app.db, viewerRef, item.input).catch(() => null);
            const ms = performance.now() - s;
            if (!res?.ok) failures++;
            if (i >= 100) durations.push({ shape: item.shape, ms }); // the first 100 requests warm the caches
          }
        }),
      );
      const wall = (performance.now() - t0) / 1000;
      const all = durations.map((d) => d.ms);
      const byShape: Record<string, { n: number; p50: number; p95: number; p99: number }> = {};
      for (const shape of new Set(durations.map((d) => d.shape))) {
        const list = durations.filter((d) => d.shape === shape).map((d) => d.ms);
        byShape[shape] = { n: list.length, p50: percentile(list, 50), p95: percentile(list, 95), p99: percentile(list, 99) };
      }
      const explainCases: [string, SearchInput][] = [
        ['word', input(words[10] as string)],
        ['direction', input('EVT_7 before EVT_50', { includeOpposite: true })],
        ['korean', input(KOREAN[0] as string)],
      ];
      const explained: Record<string, unknown> = {};
      for (const [name, inp] of explainCases) {
        const statements = await explainSearch(app, viewerRef, inp);
        writeFileSync(join(out, `explain-${c}-${name}.txt`), statements.map((s) => `-- ${s.label}\n${s.plan.join('\n')}`).join('\n\n'));
        explained[name] = statements.map((s) => ({ label: s.label, executionMs: s.executionMs, planningMs: s.planningMs }));
      }
      const result = { coverage: c, items: total, visibleItems: visible?.n ?? null, concurrency, measuredRequests: all.length, failures, wallSeconds: wall, p50: percentile(all, 50), p95: percentile(all, 95), p99: percentile(all, 99), byShape, explain: explained };
      writeFileSync(file, JSON.stringify(result, null, 2));
      log(`coverage ${c}%: visible ${visible?.n} of ${total}; p50 ${result.p50.toFixed(0)} p95 ${result.p95.toFixed(0)} p99 ${result.p99.toFixed(0)} ms; failures ${failures}`);
    }
    const files = coverages.map((c) => join(out, `load-${c}.json`)).filter(existsSync);
    console.info(`${'coverage'.padEnd(10)}${'visible'.padEnd(10)}${'p50 ms'.padEnd(9)}${'p95 ms'.padEnd(9)}p99 ms`);
    for (const f of files) {
      const r = JSON.parse(readFileSync(f, 'utf8')) as { coverage: number; visibleItems: number; p50: number; p95: number; p99: number };
      console.info(`${(`${r.coverage}%`).padEnd(10)}${String(r.visibleItems).padEnd(10)}${r.p50.toFixed(0).padEnd(9)}${r.p95.toFixed(0).padEnd(9)}${r.p99.toFixed(0)}`);
    }
    return 0;
  } finally {
    await app.close();
    await migrate.close();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(2);
  },
);
