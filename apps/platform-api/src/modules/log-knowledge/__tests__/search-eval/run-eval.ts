// Quality runner of the knowledge search evaluation (#1508 S-e, design log-knowledge-search §6).
//   PLATFORM_API_ENV_FILE=<abs path of the lane's env file> pnpm --filter @ap/platform-api search:eval
// Loads the synthetic corpus into a workspace of its own in the THROWAWAY database named by the env file, builds the index with the
// real consumer, runs every query through `runSearch`, prints JSON + a table and exits 1 when a direction counter-example exists.
// Env: SEARCH_EVAL_FILLER (noise Items, default 5000), SEARCH_EVAL_OUT (output directory, default <tmp>/search-eval).

import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createDb } from '../../../../db/client.js';
import { buildCorpus } from './corpus.js';
import { evaluate, formatTable } from './evaluate.js';
import { guardDatabase } from './guard.js';
import { analyzeTables, indexWorkspace, loadCorpus, removeWorkspace } from './load-corpus.js';

async function main(): Promise<number> {
  const { appUrl, migrateUrl } = guardDatabase();
  const filler = Number(process.env.SEARCH_EVAL_FILLER ?? 5000);
  const corpus = buildCorpus({ fillerItems: filler });
  const app = createDb(appUrl);
  const migrate = createDb(migrateUrl);
  let workspaceId: string | null = null;
  try {
    const started = Date.now();
    const loaded = await loadCorpus(migrate.pool, corpus, `SEV${Date.now().toString(36).toUpperCase()}`);
    workspaceId = loaded.workspaceId;
    const tLoaded = Date.now();
    const indexed = await indexWorkspace(app.db, loaded.workspaceId);
    await analyzeTables(migrate.pool);
    const tIndexed = Date.now();
    const report = await evaluate(app.db, loaded, corpus);
    console.info(`seconds: load ${(tLoaded - started) / 1000}, index ${(tIndexed - tLoaded) / 1000}, queries ${(Date.now() - tIndexed) / 1000}`);
    const out = process.env.SEARCH_EVAL_OUT ?? join(tmpdir(), 'search-eval');
    mkdirSync(out, { recursive: true });
    const file = join(out, 'eval.json');
    writeFileSync(file, JSON.stringify({ items: corpus.items.length, queryCount: corpus.queries.length, indexed, seconds: (Date.now() - started) / 1000, ...report }, null, 2));
    console.info(`corpus: ${corpus.items.length} Items (${filler} filler), ${corpus.queries.length} queries, indexed ${indexed}; JSON: ${file}`);
    console.info(formatTable(report));
    const slow = [...report.queries].sort((a, b) => b.ms - a.ms).slice(0, 5);
    console.info(`slowest: ${slow.map((x) => `${x.id} ${x.ms.toFixed(0)}ms`).join(', ')}`);
    const misses = report.queries.filter((q) => q.score.recall20 < 1);
    console.info(`queries below Recall@20 = 1: ${misses.length} of ${report.queries.length}${misses.length > 0 ? ` (${misses.slice(0, 12).map((m) => m.id).join(', ')}${misses.length > 12 ? ', …' : ''})` : ''}`);
    return report.directionCounterExamples > 0 ? 1 : 0;
  } finally {
    if (workspaceId) await removeWorkspace(migrate.pool, workspaceId);
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
