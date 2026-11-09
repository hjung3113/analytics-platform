# Knowledge search — evaluation and load report (#1508, S-e)

Measures the criteria of [README §6](README.md#6-품질성능-측정-수용-기준). **All data is synthetic. These numbers are not production quality**: the corpus is made-up words, one viewer, one workspace, a throwaway Postgres on a WSL2 laptop. They show where the PG adapter breaks, not how the real catalog will behave.

## Method

- **Corpus**: `apps/platform-api/src/modules/log-knowledge/__tests__/search-eval/corpus.ts` — deterministic generator (`buildCorpus`, seed 1508). Probe Items with hand-stated ground truth plus filler Items drawn from a disjoint made-up vocabulary. Ground truth is stated by intent; direction truth is computed from each Item's relation records, never by calling the search.
- **Quality run**: `PLATFORM_API_ENV_FILE=<throwaway env file> pnpm --filter @ap/platform-api search:eval` (`run-eval.ts`). Loads the corpus into a workspace of its own, builds the index with the real backfill + outbox consumer, runs `ANALYZE`, sends every query through `runSearch` (the function behind `logKnowledge.search`, page size 20), scores Recall@20, Precision@10, MRR per type, counts direction counter-examples, exits 1 if any. JSON goes to `SEARCH_EVAL_OUT`.
- **Load run**: `... pnpm --filter @ap/platform-api search:load` (`run-load.ts`). Fixed workspace, 100,000 Items by SQL `generate_series` (batches of 5,000; one relation record per Item, 20 Models), index by the real consumer, `ANALYZE`, then per coverage: 30 concurrent clients, page size 20, a fixed mix of query shapes (word 25 %, phrase 15 %, Event key 10 %, direction 20 % + 8 % with the opposite section, Korean 12 %, typo 10 %). Resumable (items continue from the highest `item_no`, the index from its backfill progress, a coverage with a result file is skipped); Node runs under `--max-old-space-size=1024`.
- **Latency scope**: wall time of `runSearch` against a 32-connection pool (database + application work of the read: page statement, capped count, display read, related counts, index-lag hint). It does **not** include HTTP, JSON or the session layer, so a real request is slower. Statement timeout of the pool: 60 s. The runner counts any failed request (not classified; a timeout is the likely cause but the reason is not recorded) inside the measured sample as `failures`, and failures of the 100 warmup requests separately as `warmupFailures`.
- **Access coverage c %**: c % of the Items are `restricted` (a third of those have an allow rule for the viewer), c % of the 20 Models are `restricted` (every second one has an allow rule). The visibility predicate is the unchanged `visibleItemSql`; nothing was weakened. The visible count is measured, not assumed.
- **Postgres limits the lane needs** for the 100k run: the index build keeps ~100k rows of `search_document` with two GIN indexes (about 1–2 GB on disk with the corpus); give the container `--memory=4g`, `shared_buffers=1GB`, default `work_mem` (4 MB) to reproduce the numbers below (the temp-file spill in the EXPLAIN excerpts depends on it). For the #1508 baseline I could not inspect the actual container of the measuring database, so its settings are not recorded; the #1593 re-measurement used exactly these settings. Treat the absolute numbers as indicative.
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

Measured again for #1593 after two changes: the guard now runs on the matched hit rows instead of every Item (see «What changed»), and `relatedCounts` counts published Items only. Same runner, same 300 measured requests per coverage, same query mix; one run per coverage, so read the figures as indicative. Database: a container of its own (`--memory=4g`, `shared_buffers=1GB`, default `work_mem`), removed afterwards. The earlier figures are kept in the «Before» column.

| Access coverage | Visible Items | Requests | Failed requests (measured sample / warmup, unclassified) | p50 ms | p95 ms | p99 ms | p95 before (#1508) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 % | 100,000 | 300 | 13 / 7 | 4,946 | 19,668 | 23,286 | 107,892 |
| 5 % | 92,333 | 300 | 17 / 8 | 4,632 | 20,206 | 23,431 | 82,515 |
| 30 % | 69,000 | 300 | 33 / 4 | 4,235 | 21,304 | 23,824 | 63,744 |

**Failure figure.** `failures` is now counted over the measured sample only (`warmupFailures` apart). The runner records that `runSearch` rejected, not why; the reasons were not kept, so the failures are unclassified and may be timeouts under 30-way queueing. They are not zero, so the earlier «0 failures at 5 % and 30 %» no longer stands. An intermediate run (only `NOT MATERIALIZED`, 300 requests) gave p95 60,175 / 64,971 / 52,202 ms with 79 / 0 / 0 failures.

p95 per query shape at 0 % (ms): phrase 7,563, typo 5,623, direction 5,278, direction + opposite 5,738, word 21,276, Korean 21,132, Event key 24,295. With 30 clients all sharing the machine the numbers include queueing; the single-statement times below show the cost without it.

**Result: the 300 ms p95 hypothesis is still missed**, now by about 65×, down from about 360×. One statement alone is 0.8 s for a word query and 0.05–0.15 s for a direction query, so the miss under load is mostly queueing of 0.8 s statements on a machine shared by 30 clients.

### What changed

The `items` CTE (published Items that pass the guard) was referenced by every hit stage, so Postgres materialized it and ran the guard over all 100,000 Items before any hit narrowed the set. `NOT MATERIALIZED` alone did not fix it: the guard is an `exists(...)` that the planner turns into a semi join over the whole Item table and drives the plan from. So the guard moved: `items` is now an unguarded, inlined CTE, and the hit rows of every stage go through `hits_raw AS MATERIALIZED (…)` and then `hits AS (… WHERE <guard>(item_id))`. The guard is still the one `visibleItemSql` predicate, applied at one place in the adapter, before ranking, counting, paging and the opposite section; the suggestion statement keeps the guard on its Item set. No ACL is copied into the index (ADR-0124, design D6).

### EXPLAIN (ANALYZE, BUFFERS), one client alone

| Query | Coverage | Page statement ms (before) | Count statement ms (before) |
| --- | --- | --- | --- |
| word | 0 % | 810 (22,048) | 780 (21,342) |
| word | 5 % | 808 (14,943) | 777 (15,235) |
| word | 30 % | 793 (11,451) | 837 (11,394) |
| Korean term | 0 % | 889 (20,717) | 882 (20,962) |
| Korean term | 5 % | 852 (14,794) | 840 (14,776) |
| Korean term | 30 % | 863 (11,330) | 813 (11,167) |
| direction (+ opposite section) | 0 % | 51 (opposite 134) (1,549 / 892) | 51 (1,448) |
| direction (+ opposite section) | 5 % | 51 (opposite 133) (1,609 / 1,156) | 50 (1,534) |
| direction (+ opposite section) | 30 % | 53 (opposite 153) (1,152 / 1,094) | 51 (1,116) |

Word query at 0 % now: the exact-token stage reads 1,708 rows through `search_document_term_trgm_idx` in about 12 ms and probes the Item by primary key; the guard runs on the 5,856 hit rows (a nested-loop semi join). What remains is stage 6: `d.tsv @@ plainto_tsquery(…) OR <query> <% d.term_text` is one OR condition and the planner answers it with a **parallel sequential scan of `search_document`** (about 700 ms for 100,000 documents). That is candidate generation, not access judgement.

Reopen condition and next step are in the backlog (design §9): split stage 6 into a full-text branch and a trigram branch that each use their GIN index, then rerun `search:load`.

Excerpt, word query at 0 % (full plans: `explain-<coverage>-<name>.txt` in `SEARCH_EVAL_OUT`):

```
Append (hits_raw, rows=5856, 721 ms)
  -> Nested Loop (exact_token)  Bitmap Index Scan on search_document_term_trgm_idx (rows=3416, 2 ms), Items by pkey (rows=1708, 12 ms)
  -> Gather (text)  Parallel Seq Scan on search_document (rows=1383 x 3, ~670 ms)    <- tsv OR trigram, no index used
Nested Loop Semi Join (guard on the hit rows)  rows=5856, ~740 ms total
```

Design D6 («do not move the access decision into the index to save time») is **not** triggered: the guard cost is gone from the plan and nothing was weakened. The remaining time is in the text stage.

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
