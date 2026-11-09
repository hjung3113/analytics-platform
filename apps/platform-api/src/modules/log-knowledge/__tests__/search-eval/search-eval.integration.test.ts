// #1508 S-e — cheap regression subset of the knowledge search evaluation, against a real Postgres (throwaway DB only;
// `pnpm --filter @ap/platform-api test:integration`). Small corpus, the real index consumer, the real read path. The full
// evaluation and the 100k load run are the scripts `search:eval` / `search:load` (see docs/design/features/log-knowledge-search/results.md).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDb } from '../../../../db/client.js';
import { buildCorpus } from './corpus.js';
import { type EvalReport, evaluate, formatTable } from './evaluate.js';
import { analyzeTables, indexWorkspace, loadCorpus, removeWorkspace } from './load-corpus.js';
import type { QueryType } from './corpus.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

/**
 * Recall@20 floors per query type on the 440-Item corpus (140 probe + 300 filler). They sit below the numbers measured when this node landed, so a ranking
 * regression fails CI while normal tuning does not. `snake_camel` (0.75 measured) and `typo` (0.83 measured) have lower floors
 * because the baseline already misses some of their queries (see results.md). `alias` has no queries (no alias in code).
 * Raise a floor when the ranking improves.
 */
const RECALL_FLOOR: Record<QueryType, number> = {
  exact_token: 0.9,
  snake_camel: 0.5,
  alias: 0,
  typo: 0.6,
  korean: 0.9,
  direction_forward: 0.9,
  direction_reverse: 0.9,
  observed_expected: 0.9,
  same_event_other_sw: 0.9,
};

describe.skipIf(!runIntegration)('knowledge search evaluation subset (#1508 S-e)', () => {
  const app = createDb(APP_URL);
  const migrate = createDb(MIGRATE_URL);
  const corpus = buildCorpus({ fillerItems: 300 });
  let workspaceId = '';
  let report: EvalReport;

  beforeAll(async () => {
    const loaded = await loadCorpus(migrate.pool, corpus, `SEV${Math.random().toString(36).slice(2, 8).toUpperCase()}`);
    workspaceId = loaded.workspaceId;
    await indexWorkspace(app.db, workspaceId);
    await analyzeTables(migrate.pool);
    report = await evaluate(app.db, loaded, corpus);
    console.warn(`\n${formatTable(report)}`);
  }, 25_000);

  afterAll(async () => {
    if (workspaceId) await removeWorkspace(migrate.pool, workspaceId);
    await app.close();
    await migrate.close();
  });

  it('never mixes forward and reverse results', () => {
    expect(report.queries.filter((q) => q.directionCounterExamples.length > 0).map((q) => q.id)).toEqual([]);
    expect(report.directionCounterExamples).toBe(0);
  });

  it('never returns an Item whose matching records are only of the other kind (observed / expected)', () => {
    expect(report.queries.filter((q) => q.kindViolations.length > 0).map((q) => q.id)).toEqual([]);
  });

  it.each(Object.entries(RECALL_FLOOR))('%s keeps its Recall@20 floor (%s)', (type, floor) => {
    const summary = report.byType[type as QueryType];
    if (!summary) {
      expect(corpus.skipped.some((s) => s.type === type)).toBe(true);
      return;
    }
    expect(summary.recall20).toBeGreaterThanOrEqual(floor);
  });
});
