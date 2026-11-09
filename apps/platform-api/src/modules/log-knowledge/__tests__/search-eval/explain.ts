// EXPLAIN (ANALYZE, BUFFERS) of the statements the search read really sends (#1508 S-e). The search runs once through a recording
// handle that forwards every `execute`; the two statements of the SearchPort (page and capped count) are then replayed under EXPLAIN
// with their own parameters. Nothing is rewritten, so the plan is the one the guard-carrying statement gets.

import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

import type { DbHandle } from '../../../../db/client.js';
import { type SearchInput, runSearch } from '../../repositories/search-read.js';

export interface ExplainedStatement {
  label: 'page' | 'count';
  executionMs: number | null;
  planningMs: number | null;
  /** Full `EXPLAIN (ANALYZE, BUFFERS)` text, one line per entry. */
  plan: string[];
}

const dialect = new PgDialect();

export async function explainSearch(handle: DbHandle, viewer: { workspaceId: string; actorId: string }, input: SearchInput): Promise<ExplainedStatement[]> {
  const recorded: { text: string; params: unknown[] }[] = [];
  const recorder = {
    execute: (query: SQL) => {
      const { sql: text, params } = dialect.sqlToQuery(query);
      recorded.push({ text, params });
      return handle.db.execute(query);
    },
  };
  const out = await runSearch(recorder as unknown as typeof handle.db, viewer, input);
  if (!out.ok) throw new Error(out.message);
  const targets = recorded.filter((s) => s.text.includes('ranked AS'));
  const explained: ExplainedStatement[] = [];
  for (const s of targets) {
    const rows = (await handle.pool.query(`EXPLAIN (ANALYZE, BUFFERS) ${s.text}`, s.params)).rows as Record<string, string>[];
    const plan = rows.map((r) => r['QUERY PLAN'] ?? '');
    const ms = (label: string) => {
      const line = plan.find((l) => l.startsWith(label));
      const m = line ? /([\d.]+) ms/.exec(line) : null;
      return m ? Number(m[1]) : null;
    };
    explained.push({ label: s.text.includes('count(*)') ? 'count' : 'page', executionMs: ms('Execution Time'), planningMs: ms('Planning Time'), plan });
  }
  return explained;
}
