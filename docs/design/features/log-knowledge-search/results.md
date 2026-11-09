# Knowledge search — evaluation and load report (#1508, S-e)

Measures the criteria of [README §6](README.md#6-품질성능-측정-수용-기준). **All data is synthetic. These numbers are not production quality**: the corpus is made-up words, one viewer, one workspace, a throwaway Postgres on a WSL2 laptop. They show where the PG adapter breaks, not how the real catalog will behave.

## Method

- **Corpus**: `apps/platform-api/src/modules/log-knowledge/__tests__/search-eval/corpus.ts` — deterministic generator (`buildCorpus`, seed 1508). Probe Items with hand-stated ground truth plus filler Items drawn from a disjoint made-up vocabulary. Ground truth is stated by intent; direction truth is computed from each Item's relation records, never by calling the search.
- **Quality run**: `PLATFORM_API_ENV_FILE=<throwaway env file> pnpm --filter @ap/platform-api search:eval` (`run-eval.ts`). Loads the corpus into a workspace of its own, builds the index with the real backfill + outbox consumer, runs `ANALYZE`, sends every query through `runSearch` (the function behind `logKnowledge.search`, page size 20), scores Recall@20, Precision@10, MRR per type, counts direction counter-examples, exits 1 if any. JSON goes to `SEARCH_EVAL_OUT`.
- **Load run**: `... pnpm --filter @ap/platform-api search:load` (`run-load.ts`). Fixed workspace, 100,000 Items by SQL `generate_series` (batches of 5,000; one relation record per Item, 20 Models), index by the real consumer, `ANALYZE`, then per coverage: 30 concurrent clients, page size 20, a fixed mix of query shapes (word 25 %, phrase 15 %, Event key 10 %, direction 20 % + 8 % with the opposite section, Korean 12 %, typo 10 %). Resumable (items continue from the highest `item_no`, the index from its backfill progress, a coverage with a result file is skipped); Node runs under `--max-old-space-size=1024`.
- **Latency scope**: wall time of `runSearch` against a 32-connection pool (database + application work of the read: page statement, capped count, display read, related counts, index-lag hint). It does **not** include HTTP, JSON or the session layer, so a real request is slower. Statement timeout of the pool: 60 s. The runner counts any failed request (not classified; a timeout is the likely cause but the reason is not recorded) inside the measured sample as `failures`, and failures of the 100 warmup requests separately as `warmupFailures`.
- **Access coverage c %**: c % of the Items are `restricted` (a third of those have an allow rule for the viewer), c % of the 20 Models are `restricted` (every second one has an allow rule). The visibility predicate is the unchanged `visibleItemSql`; nothing was weakened. The visible count is measured, not assumed.
- **Postgres limits the lane needs** for the 100k run: the index build keeps ~100k rows of `search_document` with two GIN indexes (about 1–2 GB on disk with the corpus); give the container `--memory=4g`, `shared_buffers=1GB`, default `work_mem` (4 MB) to reproduce the numbers below (the temp-file spill in the EXPLAIN excerpts depends on it). I could not inspect the actual container of the measuring database, so its settings are not recorded here; treat the absolute numbers as indicative.
- **Hardware**: WSL2 on a developer machine (shared with other lanes while this ran). No isolation, no repeated runs.

## Quality (5,140 Items: 140 probe + 5,000 filler; 72 queries)

| Query type | Queries | Recall@20 | Precision@10 | MRR |
| --- | --- | --- | --- | --- |
| exact token (word, Event key) | 8 | 1.000 | 0.300 | 1.000 |
| snake / camel variant | 8 | 0.750 | 0.225 | 0.750 |
| alias | — | skipped | skipped | skipped |
| typo | 6 | 0.833 | 0.250 | 0.833 |
| Korean term (base and particle forms) | 6 | 1.000 | 0.400 | 1.000 |
| direction, forward (`A before B`, `A→B`, `B after A`) | 15 | 1.000 | 0.400 | 1.000 |
| direction, reverse | 15 | 1.000 | 0.400 | 1.000 |
| observed / expected filter | 10 | 1.000 | 0.200 | 1.000 |
| same Event in another SW / Model, concept mapping | 4 | 1.000 | 0.400 | 1.000 |

- **Direction counter-examples: 0** (forward/reverse mixed in the main section or the opposite section). Observed/expected violations: 0.
- Precision@10 divides the relevant hits in the top 10 by 10 (a fixed ten slots, so a short list is not rewarded). It is therefore capped by the number of relevant Items per query: 0.3 for exact token (3 relevant), 0.4 where a query has 4 relevant Items, 0.2 for observed/expected (2 relevant). Read it against that cap, not against 1.0; a type sitting at its cap has no irrelevant result in its top 10. Snake/camel (0.225) and typo (0.250) fall below their caps only through the queries that miss.
- **alias skipped**: no alias exists in code (design §3.3; the adapter has no `approved_alias` stage). Add alias queries with the alias node.
- **Misses** (Recall@20 = 0): `gasLineClog` and `edgeRingWear` — a camelCase query against documents written `gas_line_clog` / `edge_ring_wear`; and the typo `intelrock` for `interlock` (a transposition; other typos, a dropped, doubled or substituted letter, hit). Snake-case queries against camelCase documents hit. Particle forms (`압력센서가` against `압력센서는` etc.) all hit on this corpus — the Korean vocabulary is six terms, so this says little about real text.
- The quality run needs `ANALYZE` after the build: before it, the same 72 queries took 7.5 s each on a 440-Item corpus because the fresh tables had no planner statistics. The runner analyzes; production needs it after a backfill (backlog below).

## Load (100,000 Items, concurrency 30, page size 20)

| Access coverage | Visible Items | Requests | Failed requests (unclassified) | p50 ms | p95 ms | p99 ms |
| --- | --- | --- | --- | --- | --- | --- |
| 0 % | 100,000 | 3,000 | 93 (see note) | 9,664 | 107,892 | 116,916 |
| 5 % | 92,333 | 300 | 0 | 15,180 | 82,515 | 88,847 |
| 30 % | 69,000 | 300 | 0 | 13,590 | 63,744 | 68,167 |

**Failure figure.** The 93 was counted by the earlier runner over warmup + measured requests together (3,100 requests) and the error reasons were not kept, so it is neither a measured-only count nor known to be timeouts. The measured-only count for the 0 % row is **not re-measured**; reopen: rerun `search:load` (about 47 minutes at 3,000 requests), which now reports `failures` (measured sample) and `warmupFailures` separately. The 5 % and 30 % rows (0) were counted by the same earlier runner, so they bound both parts at 0.

The 0 % row used 3,000 requests (47 minutes); the 5 % and 30 % rows used 300 each because of that duration, so their tails rest on fewer samples. p95 per query shape at 0 %: phrase 9.2 s, typo 10.1 s, direction 13.6 s, opposite 17.7 s, Event key 23.3 s, word 113 s, Korean 115 s. With 30 clients all sharing the machine, the numbers include queueing; the single-statement times below show the cost without it.

**Result: the 300 ms p95 hypothesis is missed by two orders of magnitude** — not by tuning distance.

### EXPLAIN (ANALYZE, BUFFERS), one client alone

| Query | Coverage | Page statement ms | Count statement ms |
| --- | --- | --- | --- |
| word | 0 % | 22,048 | 21,342 |
| word | 5 % | 14,943 | 15,235 |
| word | 30 % | 11,451 | 11,394 |
| Korean term | 0 % | 20,717 | 20,962 |
| Korean term | 5 % | 14,794 | 14,776 |
| Korean term | 30 % | 11,330 | 11,167 |
| direction (+ opposite section) | 0 % | 1,549 (opposite 892) | 1,448 |
| direction (+ opposite section) | 5 % | 1,609 (opposite 1,156) | 1,534 |
| direction (+ opposite section) | 30 % | 1,152 (opposite 1,094) | 1,116 |

Excerpt, word query at 0 % (full plans: `explain-<coverage>-<name>.txt` in `SEARCH_EVAL_OUT`):

```
Limit (actual time=22045.625..22045.646 rows=21)
  Buffers: shared hit=811432, temp read=1931170 written=1130
  CTE items
    -> Hash Left Join (rows=4975 estimated, 100000 actual, 234..689 ms)
         -> HashAggregate  Group Key: acc_i.id           (the visibility predicate, evaluated for all 100,000 Items)
              -> Nested Loop Anti Join ... Seq Scan on knowledge_item acc_i
    -> CTE Scan on items (rows=100000, loops=1708)
  ... Bitmap Index Scan on search_document_term_trgm_idx  (rows=3416, 1.3 ms)
       Bitmap Heap Scan: rows=1708 kept, 1708 removed by filter (19.6 ms)
```

What this shows:

1. The statement is built as `WITH items AS (published Items that pass the guard) …`; the `items` CTE is referenced by the hit queries, the ranking and the dedupe, so Postgres materializes it. The guard is therefore evaluated for **every published Item of the workspace** (0.7 s for 100k) before the text/trigram hit narrows anything; the trigram index returns 3,416 candidate rows in 1.3 ms and the heap filter keeps 1,708 documents, but the join back to the 100,000-row materialized `items` rescans that CTE once per kept document (`loops=1708`), reading a spilled temp file (`temp read=1.93M` blocks). The planner estimates 4,975 rows for the CTE and gets 100,000.
2. Restricting access makes the statement *faster* (fewer rows survive the guard), so the cost is not the rule lookup itself; at 30 % coverage the rule indexes (`object_access_rule_target_idx`) are used and the CTE is still full-size. The 0 / 5 / 30 % spread is small compared with the CTE cost.
3. Direction queries (≈1.1–1.6 s) go through the relation-record index and avoid the text stage; they are also far over 300 ms.

Design D6 («do not move the access decision into the index to save time») is **not** triggered by these numbers: the cost comes from where the guard sits in the statement, not from the live rule check. No ranking or adapter code was changed in this node.

## Backlog (not implemented)

The backlog (reason and reopen condition per item) lives once, in the [design README §9](README.md#9-미구현-목록-다시-여는-조건).

## Reproduce

```
export PLATFORM_API_ENV_FILE=<abs path of the throwaway env file>   # port must not be 5434
pnpm --filter @ap/platform-api search:eval                           # quality, ~1 min with 5,000 filler
NODE_OPTIONS=--max-old-space-size=1024 SEARCH_EVAL_OUT=/tmp/search-eval-load SEARCH_LOAD_QUERIES=300 \
  pnpm --filter @ap/platform-api search:load                         # 100k load: ~11 min index build + ~7 min per coverage at 300 requests
```

CI runs only the small subset `__tests__/search-eval/search-eval.integration.test.ts` (440 Items: 140 probe + 300 filler, ~5 s): direction counter-examples must be 0, observed/expected violations 0, and each type keeps a Recall@20 floor set below the numbers above (0.9 for exact token, direction, observed/expected, same-Event and Korean; 0.5 snake/camel; 0.6 typo).
