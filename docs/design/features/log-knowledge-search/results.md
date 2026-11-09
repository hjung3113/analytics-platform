# Knowledge search — evaluation and load report (#1508, S-e)

Measures the criteria of [README §6](README.md#6-품질성능-측정-수용-기준). **All data is synthetic. These numbers are not production quality**: the corpus is made-up words, one viewer, one workspace, a throwaway Postgres on a WSL2 laptop. They show where the PG adapter breaks, not how the real catalog will behave.

## Method

- **Corpus**: `apps/platform-api/src/modules/log-knowledge/__tests__/search-eval/corpus.ts` — deterministic generator (`buildCorpus`, seed 1508). Probe Items with hand-stated ground truth plus filler Items drawn from a disjoint made-up vocabulary. Ground truth is stated by intent; direction truth is computed from each Item's relation records, never by calling the search.
- **Quality run**: `PLATFORM_API_ENV_FILE=<throwaway env file> pnpm --filter @ap/platform-api search:eval` (`run-eval.ts`). Loads the corpus into a workspace of its own, builds the index with the real backfill + outbox consumer, runs `ANALYZE`, sends every query through `runSearch` (the function behind `logKnowledge.search`, page size 20), scores Recall@20, Precision@10, MRR per type, counts direction counter-examples, exits 1 if any. JSON goes to `SEARCH_EVAL_OUT`.
- **Load run**: `... pnpm --filter @ap/platform-api search:load` (`run-load.ts`). Fixed workspace, 100,000 Items by SQL `generate_series` (batches of 5,000; one relation record per Item, 20 Models), index by the real consumer, `ANALYZE`, then per coverage: 30 concurrent clients, page size 20, a fixed mix of query shapes (word 25 %, phrase 15 %, Event key 10 %, direction 20 % + 8 % with the opposite section, Korean 12 %, typo 10 %). Resumable (items continue from the highest `item_no`, the index from its backfill progress, a coverage with a result file is skipped); Node runs under `--max-old-space-size=1024`.
- **Latency scope**: wall time of `runSearch` against a 32-connection pool (database + application work of the read: page statement, capped count, display read, related counts, index-lag hint). It does **not** include HTTP, JSON or the session layer, so a real request is slower. Statement timeout of the pool: 60 s. The runner counts any failed request inside the measured sample as `failures` (failures of the 100 warmup requests separately as `warmupFailures`) and classifies each by reason (`failureClasses`, first message per class in `failureSamples`). After the search requests it runs a separate pass of suggestion requests (`suggest`: count, failures, p50/p95/p99) outside the search wall timer.
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

Measured again for #1599 after splitting stage 6 of the text hit query (see «What changed»). Runner `run-load.ts`: 100,000 Items, 30 clients without think time, **3,000 measured requests** per coverage (the #1593 run used 300), the same query mix, plus 200 suggestion requests. One run per coverage, so read the figures as indicative. Database: a container of its own on a 16-CPU / 23 GB host (`--memory=4g`, `--shm-size=1g`, `shared_buffers=1GB`, default `work_mem`, pool of 32 connections), removed afterwards. Failures are now classified by reason.

| Access coverage | Visible Items | Failed requests (measured / warmup) | p50 ms | p95 ms | p99 ms | Suggest p50 / p95 ms | p95 before (#1593) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 % | 100,000 | 0 / 0 | 4,351 | 23,262 | 27,488 | 4,833 / 6,534 | 19,668 |
| 5 % | 92,333 | 0 / 0 | 4,623 | 22,185 | 27,359 | 4,805 / 6,967 | 20,206 |
| 30 % | 69,000 | 0 / 0 | 4,106 | 25,129 | 28,764 | 3,971 / 5,212 | 21,304 |

Pool of 10 connections (the production default `DB_POOL_MAX`), 0 % only: p50 6,767, p95 13,384, p99 15,456 ms, suggest p95 5,666 ms, 0 failures.

**Failures.** The #1593 run counted 13 / 17 / 33 failed requests without keeping their reasons, so they stay unclassified. A rerun with failure classes (`/dev/shm` still 64 MB) counted 243–268 failed requests per coverage, all in class `other`, and the first message kept was `could not resize shared memory segment … No space left on device`; the failed requests were not each inspected, so shared-memory exhaustion is reproduced and consistent with the older failures, not proven for them. The load container's `/dev/shm` was Docker's default 64 MB and the parallel workers of the text stage exhaust it. With `--shm-size=1g` every class is 0 (`statement_timeout`, `pool_acquire`, `connection`, `shared_memory`, `refused`, `other`). Consequence for operation: a Postgres container serving this search needs a `/dev/shm` of at least several hundred MB (design §9), or parallel queries can fail under load.

p95 per query shape at 0 % (ms): phrase 4,987, typo 5,420, direction 4,625, direction + opposite 5,360, word 6,859 (was 21,276), Korean 27,371, Event key 27,283. Event key and Korean are the two shapes that still dominate.

**Result: the 300 ms p95 hypothesis is still missed**, by about 75–80×. The time is split between two causes that can be told apart with numbers:

1. **The query (what this issue could fix).** One request is two statements (page + count). Alone on the machine: direction 0.06 + 0.06 s (+ 0.14–0.17 s for the opposite section), word 0.57 + 0.56 s (was 0.81 + 0.78 s), Korean 0.47 + 0.44 s when the trigram branch uses its index but 3.4 + 3.3 s when the planner chooses a sequential scan for it. Even the cheapest shape is above 300 ms for word and Korean, so the target cannot be met by the pool or concurrency settings alone.
2. **Concurrency.** 30 clients with no think time are a closed loop: mean latency = 30 / throughput. The runs finished 3,000 requests in about 735–750 s wall (which includes 100 warmup requests, so about 4 requests/s is approximate), whatever the pool size, so the mean is about 7.5 s. A *mean* of 300 ms with 30 clients would need about 100 requests/s, 25× the measured throughput; a p95 of 300 ms does not follow from that arithmetic alone (a skewed distribution can have a low p95 and a high mean), but measured p50 is 4.1–4.6 s, so more than half of the requests are far above 300 ms anyway. A pool of 10 gives p95 13.4 s against 23.3 s with 32: fewer concurrent scans thrash less. So 30 simultaneous no-think-time clients on one database is a pool/capacity question, not only a query-limit question; the CPU service demand per request (word and Korean use parallel workers, 2–3 cores for 0.5 s) bounds what 16 cores carry.

### What changed

#1593 made the guard run on the matched hit rows. #1599 does two things in `textHits` (stage 6, `search-pg-adapter.ts`): `d.tsv @@ … OR … <% d.term_text` is now two selects (full text; trigram word similarity excluding what full text already matched) with the same score expression, each using its GIN index, and the document scan sits in an `OFFSET 0` subquery so the planner plans it on its own (joined to `items` it chose a parallel sequential scan for the trigram branch, about 0.8 s). The search ranking is unchanged: `search:eval` gives the same numbers as before (Recall@20 / Precision@10 / MRR per type identical, direction counter-examples 0, observed/expected violations 0, 3 of 72 queries below Recall 1 as in the table above).

### EXPLAIN (ANALYZE, BUFFERS), one client alone, after #1599

| Query | Coverage | Page statement ms | Count statement ms |
| --- | --- | --- | --- |
| word | 0 % | 568 | 564 |
| word | 5 % | 534 | 515 |
| word | 30 % | 452 | 442 |
| Korean term | 0 % | 3,422 | 3,258 |
| Korean term | 5 % | 2,854 | 2,486 |
| Korean term | 30 % | 2,878 | 2,785 |
| direction (+ opposite section) | 0 % | 58 (opposite 157) | 57 |
| direction (+ opposite section) | 5 % | 60 (opposite 172) | 61 |
| direction (+ opposite section) | 30 % | 54 (opposite 141) | 52 |

Word at 0 % (plan of the published run): the full-text branch is an index scan (about 40 ms); the trigram branch is a bitmap scan on `search_document_term_trgm_idx` that returns about 14,500 candidate rows, of which 2,440 survive the `word_similarity` recheck and the exclusion of full-text matches (about 350 ms of the 568, because the recheck runs on a ~400-byte `term_text` per candidate). The guard on the 5,856 hit rows is cheap.

Korean: the Korean term is in 6,827 of 100,000 documents (7 %). In the pool-32 runs the planner chose a **sequential scan** for the trigram branch (2.3 s, `word_similarity` on every row); in the pool-10 run and an earlier 30-query run on the same data it chose the bitmap scan (0.47 + 0.44 s). The choice flips on near-equal estimated cost (about 10,000 for the sequential scan against about 9,000 for the bitmap scan), and the cost model does not charge `<%` per row. This is the remaining query-side cause; the levers are in the backlog (design §9).

Design D6 («do not move the access decision into the index to save time») is **not** triggered: the guard cost is gone from the plan and nothing was weakened. The remaining time is in candidate generation (stage 6 trigram recheck) and in the 30-client queue.

### Earlier numbers (#1593), kept for comparison

p95 19,668 / 20,206 / 21,304 ms at 0 / 5 / 30 %, with 13 / 17 / 33 failures whose reasons were not recorded; single statements word 0.81 + 0.78 s, Korean 0.89 + 0.88 s, direction 0.05 s. An intermediate run with only `NOT MATERIALIZED` gave p95 60,175 / 64,971 / 52,202 ms.

## Backlog (not implemented)

The backlog (reason and reopen condition per item) lives once, in the [design README §9](README.md#9-미구현-목록-다시-여는-조건).

## Reproduce

```
export PLATFORM_API_ENV_FILE=<abs path of the throwaway env file>   # port must not be 5434
pnpm --filter @ap/platform-api search:eval                           # quality, ~1 min with 5,000 filler
NODE_OPTIONS=--max-old-space-size=1024 SEARCH_EVAL_OUT=/tmp/search-eval-load SEARCH_LOAD_QUERIES=3000 \
  pnpm --filter @ap/platform-api search:load                         # 100k load: ~11 min index build + ~12 min per coverage at 3,000 requests (30 clients); `SEARCH_LOAD_POOL=<n>` sets the runner pool, `SEARCH_LOAD_COVERAGE=0` limits the run to one coverage
```

CI runs only the small subset `__tests__/search-eval/search-eval.integration.test.ts` (440 Items: 140 probe + 300 filler, ~5 s): direction counter-examples must be 0, observed/expected violations 0, and each type keeps a Recall@20 floor set below the numbers above (0.9 for exact token, direction, observed/expected, same-Event and Korean; 0.5 snake/camel; 0.6 typo).
