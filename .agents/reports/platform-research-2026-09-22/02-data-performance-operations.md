# 02. 데이터 계약·성능·백엔드·운영 리서치

작성일: 2026-09-22
담당: B — 데이터 계약·성능·백엔드·운영
상태: 조사 및 제안. 아래 내용은 채택·구현 승인이나 성능 검증 결과가 아니다.

조사 기준점은 플랫폼 저장소 `e999c997a4282e9b88b6fb3df36c6212b8adf2e4`와 독립 서브모듈 `products/feedbackops`의 `b5dd614ac8da3792cb1627e7daeffb8fc9c4944e`다. 공식 자료와 저장소 문서는 2026-09-22에 확인했다. 실제 플랫폼 런타임, 부하 테스트, 마이그레이션, PostgreSQL 서버 실행은 이 조사에서 수행하지 않았다. 따라서 숫자로 된 지연시간·처리량·보존기간·SLO는 모두 **측정 전 가정**으로 표시한다.

## 1. 핵심 권고와 가장 먼저 피할 실패

1. **작게 PostgreSQL부터 시작한다.** parser 데이터베이스에는 읽기 전용 역할로 접근하고, 플랫폼 스키마에 호환성 view와 generation-keyed mart를 둔다. SQL-first API와 작은 작업 실행기만으로 첫 수직 흐름을 만들고, 별도 OLAP·브로커·워크플로 엔진은 측정 조건이 생길 때까지 보류한다. 이는 `docs/01_architecture_and_data_contract.md`의 “same instance, parser read-only, platform schema” 방향과 `docs/03_backend_stack.md`의 SQL/API/worker 역할 분리를 그대로 구체화한다.

2. **계산 완료 세대를 하나의 공개 포인터로 관리한다.** 재집계는 staging 세대에서 수행하고 grain·coverage·metric/contract version·시간역을 검증한 뒤, 한 트랜잭션에서 ready generation을 공개한다. chart, table, CSV는 요청 초기에 같은 `generationId`를 고정한다. PostgreSQL materialized view 자체는 결과를 저장하는 유용한 단일 객체지만, `REFRESH MATERIALIZED VIEW`가 여러 mart를 함께 공개해 주지는 않는다는 점은 PostgreSQL 문서로부터의 설계 추론이다. [PostgreSQL `REFRESH MATERIALIZED VIEW`](https://www.postgresql.org/docs/18/sql-refreshmaterializedview.html)

3. **원천 watermark와 계산 완료를 분리하고 시간 의미를 보존한다.** parser의 naive equipment wall-clock, `[from,to)` half-open, `defaultRangeTo`, `source watermark R`, `calculated_at`, completeness/provisional 상태, metric/contract version을 서로 다른 필드로 남긴다. timezone을 모르면 UTC로 추측하거나 서로 다른 시간역을 합치지 않는다. 이는 `docs/01`과 `docs/03`, `docs/06` §6.3·§18·§19의 현재 계약을 바꾸지 않으면서 실행 가능한 데이터 계약으로 만드는 방법이다.

4. **모든 읽기와 작업에 경계를 둔다.** 요청별 scope 재검증은 C/플랫폼 권한 계약의 책임으로 두되, B의 데이터 경계에는 고정된 SQL shape, server-side filter/sort, row/point/export 상한, per-transaction `statement_timeout`·`lock_timeout`, 드라이버 취소, 큰 재집계·export의 비동기 작업을 포함한다. 작은 CSV는 서버가 고정된 `COPY (SELECT ...) TO STDOUT`을 스트리밍하고, 큰 결과는 세대와 context hash를 고정한 불변 산출물로 만든다. 사용자 입력을 `COPY ... PROGRAM`이나 임의 SQL로 넘기지 않는다. [PostgreSQL `COPY`](https://www.postgresql.org/docs/18/sql-copy.html), [client connection defaults](https://www.postgresql.org/docs/18/runtime-config-client.html)

5. **운영 증거를 계약의 일부로 만든다.** 세대·watermark·metric version·job/query fingerprint·context/correlation ID를 로그·트레이스·상태 응답으로 연결하고, freshness와 readiness를 분리한다. PostgreSQL 통계는 지연되고 트랜잭션 내 캐시될 수 있으므로 정확한 완료 증거가 아니라 운영 신호로 사용한다. WAL/PITR, restore drill, 재빌드·멱등 retry·repair runbook을 검증한다. 규모가 실제로 초과될 때 TimescaleDB나 ClickHouse를 비교하되, 먼저 같은 데이터 계약과 세대 정합성을 보존하는 benchmark를 통과시킨다. [OpenTelemetry context propagation](https://opentelemetry.io/docs/concepts/context-propagation/), [PostgreSQL cumulative statistics](https://www.postgresql.org/docs/18/monitoring-stats.html), [PostgreSQL continuous archiving/PITR](https://www.postgresql.org/docs/18/continuous-archiving.html)

**가장 먼저 피할 실패는 부분 공개 또는 혼합 세대다.** 한 chart는 새 계산, table은 이전 계산, CSV는 아직 공개되지 않은 mart를 읽거나, 원천 watermark가 앞섰다는 이유로 결과가 완전하다고 표시하면 숫자 비교와 감사가 깨진다. 두 번째로 긴급한 실패는 0행을 “미수집” 또는 “지연”으로 임의 해석하거나 naive wall-clock을 UTC로 바꾸는 것이다. 모두 현재 문서 계약의 의미를 조용히 바꾸는 동작이다.

## 2. 현행 상태

### 2.1 문서에 이미 정해진 계약

| 영역 | 현행 계약 | 근거 |
| --- | --- | --- |
| 데이터 경계 | parser PostgreSQL은 읽기 전용으로 소비하고, 플랫폼 소유 호환성 view와 분석 mart를 분리한다. API가 이를 읽고 UI가 사용한다. | `docs/01_architecture_and_data_contract.md` §1 “Architecture” |
| 스키마 변화 | DB migration, parser logic/data-generation time, snapshot serialization version, platform analysis contract version, metric definition version을 분리한다. view는 rename 흡수만 하며 grain·관계·의미를 바꾸지 않는다. | `docs/01_architecture_and_data_contract.md` §2 “Contract boundaries” |
| grain/집계 | id·grain·unit·time·null·quality·source version을 명시한다. 비가산 P95를 equipment P95의 평균으로 만들지 않고, 비율은 numerator/denominator를 다시 집계한다. downsampling은 metric 계산과 분리한다. | `docs/01_architecture_and_data_contract.md` §2, §3 |
| 재집계 | late arrival, master retroactive correction, module class 재분류, metric definition 변경이 재집계 사유다. chart/table/CSV가 서로 다른 generation을 섞지 않아야 한다. `pg_cron`은 scheduler일 뿐 consistency를 보장하지 않는다. | `docs/01_architecture_and_data_contract.md` §3 |
| 시간 | parser source는 timezone 없는 equipment wall-clock이다. URL v1은 naive `YYYY-MM-DDTHH:mm:ss`, `[from,to)`, `Z`/offset/fraction 금지다. unknown timezone을 UTC로 추측하지 않으며, 시간역 병합은 `(equipmentId,timeDomainId,validFrom,validTo)` server assertion이 있어야 한다. | `docs/03_backend_stack.md` §3; `docs/06_platform_ui_contract.md` §6.3 |
| 완료 의미 | `source watermark`는 mart 완료를 의미하지 않는다. polling과 completed generation/cache revalidation으로 새 계산을 표시한다. `defaultRangeTo`는 completeness가 아닌 server-provided exclusive upper bound다. | `docs/05_roadmap_and_open_questions.md` §6; `docs/06_platform_ui_contract.md` §6.3 |
| 응답 신뢰 | freshness, calculation basis time, coverage/completeness/provisional, metric version, source/lineage를 Data Trust vocabulary로 노출한다. outcome(`ok|empty|error|forbidden|too_large|timeout`)과 assessments를 분리한다. 0행은 원인 증명이 아니다. | `docs/06_platform_ui_contract.md` §18–§19; `docs/03_backend_stack.md` §4 |
| 읽기 경계 | table은 server-side sort/filter와 virtualization/export를 사용하고 모든 행을 브라우저로 보내지 않는다. chart/table/CSV의 같은 조건 검증이 후보 acceptance다. | `docs/06_platform_ui_contract.md` §15–§16; `docs/05_roadmap_and_open_questions.md` §3 |
| 권한 경계 | URL의 `scopeId`는 권한이 아니며 매 요청 권한·scope를 재검증한다. B의 데이터 파이프라인은 결과·export·drill까지 이 경계에 연결될 수 있어야 한다. | `docs/06_platform_ui_contract.md` §6.2, §17 |
| 범위 | 플랫폼 kernel을 먼저 만들고, generic workflow/alert engine·외부 BI·arbitrary SQL/DSL은 현재 제외 또는 Deferred다. | `docs/00_overview.md`; `docs/06_platform_ui_contract.md` §24, §29 |

`docs/05_roadmap_and_open_questions.md`는 backend 언어, SSO, tenant/site, 배포, 동시성, volume/retention, late horizon `H`, 실제 site timezone을 아직 Open으로 둔다. 따라서 이 보고서의 Python/FastAPI, Node/pg-boss, TimescaleDB, ClickHouse 선택은 결정이 아니라 조건부 후보이다.

### 2.2 구현 존재와 재사용 근거

#### 플랫폼 저장소

root `e999c997a4282e9b88b6fb3df36c6212b8adf2e4`의 파일 목록과 상태를 확인한 결과, 플랫폼에는 `src/`, API/backend runtime, migration, SQL schema, package/runtime manifest, test suite가 없다. 현재는 설계·요구사항 문서 상태다. 따라서 “PostgreSQL view/mart가 이미 구현되었다”, “세대 공개가 동작한다”, “어떤 수치의 성능을 달성했다”고 말할 근거가 없다.

#### 독립 FeedbackOps 서브모듈

FeedbackOps는 root의 공용 구현이 아니라 `products/feedbackops`의 독립 제품이다. 하위 `AGENTS.md`와 root `AGENTS.md`의 경계에 따라 다음은 **재사용 가능한 패턴의 관찰 근거**일 뿐 플랫폼 채택 또는 통합 검증이 아니다.

- `products/feedbackops/apps/backend/src/db/client.ts`는 `createDb(url)`에서 `pg.Pool`과 Drizzle을 만들고 app role과 migrate role을 나누는 경계를 보여 준다.
- `products/feedbackops/apps/backend/src/db/tx.ts`는 mutating service가 transaction을 받아 read-then-write 원자성을 유지하게 한다.
- `products/feedbackops/apps/backend/src/lib/health.ts`의 readiness는 Postgres/pg-boss/storage를 병렬 probe하고 2초 timeout으로 fail closed한다. 이는 DB 준비 상태이지 분석 데이터 freshness 증명이 아니다.
- `products/feedbackops/apps/backend/src/lib/job-log.ts`는 correlation ID, retry count, bounded job event와 error code를 기록하되 raw payload/stack을 노출하지 않는다.
- `products/feedbackops/apps/backend/src/modules/voc/jobs/embed-voc.ts`는 VOC version별 sole writer, retryable/non-retryable 구분, pg-boss 등록의 예를 보여 준다. 플랫폼 분석 mart의 세대 공개나 generation manifest는 구현하지 않는다.
- `products/feedbackops/apps/backend/src/lib/rate-limit-pg-store.ts`는 Postgres `UPSERT` 기반 원자 카운터를 사용한다.
- `products/feedbackops/apps/backend/package.json`의 의존성에는 Fastify 5.2.0, Drizzle 0.38.2, `pg` 8.13.1, `pg-boss` `^12.18.2`, Pino 9.5.0, Zod 3.25.67이 기록되어 있다. 이 버전은 독립 제품 선언이며 플랫폼 런타임의 승인 버전이 아니다.

따라서 재사용 경계는 “transaction 전달, bounded job log, health probe, DB pool 설정의 아이디어”까지다. FeedbackOps의 테이블·권한·queue·logger를 플랫폼에 자동으로 shared module로 복사하거나 플랫폼 계약을 소급 적용하지 않는다.

### 2.3 구현·측정이 아직 확인되지 않은 사항

- parser의 실제 schema/dump, compatibility view, source watermark 제공 방법, 시간역 관리 테이블과 실제 timezone 값은 이 저장소에서 확인되지 않았다.
- 하루 원천 행 수·보존 연수·동시 interactive query/export·최대 chart point·late arrival 빈도·재집계 시간·DB CPU/IO/memory/lock 여유가 없다.
- backend 언어와 worker 배포 수명주기, object storage, backup provider, RPO/RTO, multi-site/tenant 격리가 결정되지 않았다.
- Postgres 버전/extension 허용 정책과 관리형 서비스의 `pg_cron`, `pg_stat_statements`, WAL/PITR 지원은 운영 환경에서 확인해야 한다.
- chart/table/CSV가 같은 generation을 읽는 실제 endpoint나 contract test는 없다. 아래 검증은 처음 구현할 때의 최소 합격 기준이다.

## 3. 후보 비교

### 3.1 저장·계산 경로 후보

| 문제 | 후보/버전·에디션 | 계약 적합성과 공백 | 라이선스·유료 경계 | 운영·통합·이탈 비용 | 권고 | 근거 |
| --- | --- | --- | --- | --- | --- | --- |
| 작은 조회와 기본 aggregate를 빨리 시작 | PostgreSQL 지원 버전 + platform schema의 compatibility view, SQL-first API | 현재 `docs/01` 구조와 가장 잘 맞는다. 단일 view만으로는 late arrival, generation snapshot, 장시간 export를 해결하지 못한다. | PostgreSQL License는 permissive하고 별도 사용료가 없다. 법률 적합성 자체는 별도 검토 대상이다. [PostgreSQL License](https://www.postgresql.org/about/licence/) | 운영 요소가 적고 이탈이 쉽다. 다만 쿼리 shape·인덱스·timeout·큰 작업 경계는 직접 소유한다. | **유지 + 보강 / 최소 시작** | root에는 아직 runtime이 없고 문서가 same-instance 방향을 정했다. |
| mart 재집계와 큰 export 실행 | PostgreSQL generation tables/manifest + 작은 worker + `pg_cron` trigger; 필요할 때 native job table | 세대 포인터·멱등성·retry·취소를 자체 계약으로 명시할 수 있다. `pg_cron`은 scheduling만 하므로 cross-mart publication/watermark를 대신하지 않는다. | pg_cron 저장소는 PostgreSQL License로 배포된다. `shared_preload_libraries`, DB당 설정, hot standby pause 등 운영 조건이 있다. [pg_cron 공식 저장소](https://github.com/citusdata/pg_cron) | 초기에는 worker 하나와 Postgres job table로 운영 가능하다. lease·retry·DLQ·HA를 직접 검증해야 한다. pg_cron 장애가 계산 의미를 바꾸지 않게 enqueue만 담당시킨다. | **유지 + 보강 / 최소 조합** | 공식 README의 “one instance of each job, second waits”, preload와 scheduler 특성; 현재 문서의 late horizon/완료 generation 계약. |
| 하나의 무거운 조회를 빠르게 제공 | PostgreSQL materialized view, `REFRESH MATERIALIZED VIEW [CONCURRENTLY]` | persisted result와 index에는 맞지만, concurrent refresh에는 모든 행을 덮는 unique index가 필요하고 한 MV당 한 refresh만 가능하다. 여러 mart의 원자적 공개·공통 generation은 제공하지 않는다. 이것은 단일 MV의 제한에서 도출한 설계 추론이다. | PostgreSQL License. 별도 유료 경계 없음. | 객체 수가 늘면 refresh 순서·락·실패 복구를 직접 관리해야 한다. native MV에 플랫폼 전체 일관성을 기대하면 이탈 비용이 커진다. | **참고 / 제한적 유지** | [Materialized Views](https://www.postgresql.org/docs/17/rules-materializedviews.html), [`REFRESH MATERIALIZED VIEW`](https://www.postgresql.org/docs/18/sql-refreshmaterializedview.html) |
| dense time-series, hypertable/시계열 함수가 실제 병목 | TimescaleDB extension; Apache 2 edition 또는 Community/TSL edition 구분 | PostgreSQL 위에서 시간계열 저장·압축·집계 후보가 될 수 있다. 그러나 platform의 wall-clock/timeDomain/세대 계약과 mart 공개를 자동으로 해결하지 않는다. extension version과 managed edition 차이를 운영 계약에 추가한다. | 공식 edition 문서상 Apache 2 edition과 Community/TSL edition의 기능·배포 조건이 다르다. Community는 TSL이며 self-host 무료 범위와 서비스 제공 제한을 포함하므로 법률·배포 검토가 필요하다. [Timescale editions](https://github.com/timescale/docs/blob/latest/about/timescaledb-editions.md), [TimescaleDB](https://github.com/timescale/timescaledb) | extension upgrade, backup/restore, managed feature parity가 추가된다. 먼저 Postgres benchmark가 있어야 이탈 비용을 정당화할 수 있다. | **대체 후보 / 측정 후 보류** | API/계약을 유지한 채 storage/rollup 후보로 비교하되 현재 도입 근거는 없다. |
| broad scan, 높은 동시성, 장기 보존이 Postgres 측정 한계를 넘음 | PostgreSQL source of truth + ClickHouse analytics mirror/CDC | columnar scan·분산 분석 후보이지만 mirror freshness, CDC replay, backfill, generation/watermark, ACL/scope lineage가 새 계약이 된다. Postgres와 ClickHouse가 서로 다른 세대를 공개하면 현재 실패를 확대한다. | ClickHouse 오픈소스 핵심 저장소는 Apache-2.0으로 표시된다. Cloud/managed 서비스 비용과 별도 기능 경계는 배포판별 확인이 필요하다. [ClickHouse 공식 저장소](https://github.com/ClickHouse/ClickHouse) | CDC·스키마 진화·이중 모니터링·재동기화·운영 인력이 필요하다. API seam은 유지할 수 있으나 데이터 계보와 복구가 복잡해진다. | **대규모 조건부 대체 / 보류** | [Postgres + ClickHouse OSS architecture](https://clickhouse.com/blog/postgres-clickhouse-oss), 제품 주장 자체는 benchmark 근거가 아님. |

### 3.2 작업 실행 도구 후보

| 도구 | 잘 맞는 사용 | 경계와 실패 모드 | 권고 |
| --- | --- | --- | --- |
| Postgres job table + `FOR UPDATE SKIP LOCKED` | 한정된 수의 worker가 재집계·export task를 claim하는 최소 경로 | `SKIP LOCKED`는 queue-like table에 적합하지만 일관된 일반 조회가 아니며, lease expiry·retry count·DLQ·idempotency를 직접 정의해야 한다. [PostgreSQL `SELECT`](https://www.postgresql.org/docs/18/sql-select.html) | **최소 시작 후보**. task state와 generation manifest를 같은 DB transaction 경계에서 연결한다. |
| pg_cron | 정해진 시간에 enqueue하거나 watermark scan을 깨우는 trigger | 한 job의 중복 실행 방지와 스케줄링은 제공하지만 계산 결과의 세대 공개·재시도·취소·상태 원장은 아니다. 설치 시 preload/restart와 hot standby 조건이 있다. | **보강 후보**. scheduler를 의미 계층으로 승격하지 않는다. |
| pg-boss | Node/TypeScript를 선택했고 Postgres 기반 retry, backoff, DLQ, exactly-once delivery claim이 필요한 경우 | Node >=22.12, PostgreSQL >=13 조건과 library migration이 따른다. 플랫폼 backend 언어가 Open이며 FeedbackOps 의존성을 곧바로 공유할 수 없다. upstream package는 조사 시 12.33.3, 로컬 FeedbackOps 선언은 `^12.18.2`로 서로 다르다. [pg-boss 공식 저장소](https://github.com/timgit/pg-boss) | **언어 결정 뒤 조건부 후보**. 생성 세대 계약은 별도로 소유한다. MIT라고 표시된 upstream license도 법률 승인으로 간주하지 않는다. |
| Temporal 등 범용 workflow engine | 여러 서비스·긴 종속 작업·승인·human intervention이 실제로 필요할 때 | 현재 문서가 generic workflow/approval engine을 제외/Deferred로 둔다. 도입하면 worker history·운영 cluster·versioning을 추가한다. | **지금 도입하지 않음 / 측정·업무 요구 전 보류** |

## 4. 항목별 적용 카드

아래 `generationId`, `sourceWatermark`, `calculationBasisTime` 등의 이름은 설명용 Candidate 이름이다. 실제 public schema 이름은 구현 시 API/계약 결정으로 고정해야 한다.

### DP-01 — parser 소비 계약과 호환성 view

- **사용자·운영 문제:** parser schema가 바뀔 때 platform API가 조용히 다른 grain·null·unit을 읽으면, 숫자는 응답하지만 비교와 감사가 불가능하다.
- **현재 근거:** `docs/01_architecture_and_data_contract.md` §1–§2가 parser read-only, platform-owned thin compatibility view, mart 분리와 id/grain/unit/time/null/quality/source-version 명시를 요구한다. 실제 parser dump/view는 현재 checkout에서 확인되지 않았다.
- **제안:** parser schema를 직접 API에 노출하지 말고, `equipment_master`, `occurrence_directory`, `(equipment_id, anchor)` 같은 플랫폼 view를 명시적 컬럼·source schema version과 함께 만든다. rename/alias만 view에서 흡수하고, 의미·관계·grain 변경은 contract version 상승 및 fixture 검증으로 중단시킨다.
- **플랫폼이 소유할 책임:** source-to-platform mapping, column/grain/null/unit/time-domain contract, schema version compatibility, read-only role, contract failure 상태.
- **재사용 경계:** FeedbackOps의 Drizzle repository나 테이블을 parser adapter로 복사하지 않는다. `createDb`의 pool/role 분리 아이디어만 참고한다.
- **실패 모드:** source column이 없어졌는데 `NULL`로 채워 정상 응답; equipment ID가 재사용되어 다른 설비로 join; source version을 무시한 상태에서 old/new grain 혼합.
- **최소 검증:** 대표 dump fixture로 view snapshot을 만들고, expected columns·unique key·grain·unit·null rule·time domain을 검증한다. **합격:** snapshot과 contract version이 일치하고 의도한 rename만 허용. **탈락:** unknown column/duplicate key/wrong grain이 조용히 통과.
- **우선순위·선행:** P0; parser dump/schema version과 data owner 확인이 선행.
- **문서 반영:** `docs/01` §1 뒤에 “platform compatibility view는 rename만 흡수하고 contract version/grain 변경은 검증 실패” 문단 추가. `docs/05`에 parser schema fixture 제공 여부를 Open으로 기록.
- **확신도:** 높음 — 현재 문서 계약은 명확하나 실제 source는 미확인.

### DP-02 — 시간·grain·집계 가능성·metric 계약

- **사용자·운영 문제:** 차트의 기간 경계와 표/CSV가 다르거나, 장비 P95를 평균해 전체 P95처럼 표시하면 사용자가 수치를 재현할 수 없다.
- **현재 근거:** `docs/01`은 non-additive P95와 ratio 재계산을 명시한다. `docs/03`과 `docs/06` §6.3은 naive wall-clock, `[from,to)`, unknown timezone, valid interval을 명시한다.
- **제안:** 각 metric에 `metricDefinitionVersion`, input grain, unit, numerator/denominator 또는 mergeable state, time basis, null/quality rule, downsample rule을 등록한다. `event_time`/validity는 source wall-clock의 의미를 유지하고, 운영 기록용 `calculated_at`은 별도 `timestamptz`로 둔다. P95를 저장해야 한다면 원자료 또는 검증된 mergeable sketch/state의 요구를 metric별로 결정한다.
- **플랫폼이 소유할 책임:** canonical interval parsing, timeDomain coverage assertion, aggregateability metadata, metric version과 query shape, chart downsample과 metric 계산 분리.
- **재사용 경계:** UI chart library의 sampling이나 PostgreSQL `date_trunc`를 domain metric 정의로 간주하지 않는다. frontend는 frame/interaction을 소유하고 B는 계산 의미를 소유한다.
- **실패 모드:** `to`를 inclusive로 처리해 경계 이중 집계; timezone 미상 값을 UTC로 변환; ratio of averages; `calculated_at`을 source freshness로 표시.
- **최소 검증:** 경계 시각 행, 두 timeDomain, late row, numerator/denominator fixture로 같은 조건의 chart/table/CSV를 비교한다. **합격:** `[from,to)`와 metric contract를 세 출력이 공유하고 provenance가 동일. **탈락:** 경계 중복, unknown domain 병합, aggregateability 위반.
- **우선순위·선행:** P0; DP-01 mapping과 metric owner가 선행.
- **문서 반영:** `docs/01` §2–§3에 event/source wall-clock, `calculated_at`, mergeable state/P95와 downsample 분리를 명시. `docs/03` §3의 “calculation basis time”에 field-level 예시 추가. `docs/06` §18 Data Trust에 metric basis/grain을 연결.
- **확신도:** 높음.

### DP-03 — generation manifest와 원자적 공개

- **사용자·운영 문제:** 계산 중인 mart나 서로 다른 계산 세대가 한 화면/CSV에 섞이면 숫자가 같은 조건을 가져도 서로 다르다.
- **현재 근거:** `docs/01`은 chart/table/CSV가 generation을 섞지 않아야 한다고 하며, `docs/05`는 source watermark와 completed generation을 구분한다. PostgreSQL MV 문서는 MV 단위 refresh의 동작만 정의한다.
- **제안:** 다음과 같은 manifest를 플랫폼 소유 계약으로 만든다: `generationId`, 대상 dataset/metric set, `sourceWatermark`(timeDomain별 naive exclusive R), `metricDefinitionVersion`, `analysisContractVersion`, `calculatedAt`, coverage/completeness/provisional, status source, job/correlation ID, 생성 상태(`building|ready|failed|superseded`). 모든 staging mart는 generation을 포함한다. 모든 artifact 검증이 통과한 뒤 한 transaction에서 current pointer를 ready generation으로 교체하며, 이전 ready 세대를 rollback/비교용으로 보존한다. 읽기는 시작 시 pointer를 한 번 capture하고 chart/table/CSV query에 같은 ID를 전달한다.
- **플랫폼이 소유할 책임:** manifest schema, readiness criteria, publication transaction, current pointer, retention/GC, rollback와 mixed-generation 방지.
- **재사용 경계:** `REFRESH MATERIALIZED VIEW CONCURRENTLY`나 pg_cron 성공을 generation ready로 해석하지 않는다. FeedbackOps job log는 correlation 기록 참고일 뿐 manifest가 아니다.
- **실패 모드:** mart A만 성공한 뒤 pointer를 갱신; pointer 갱신 후 일부 row가 삭제/overwrite; export가 생성 중인 테이블을 읽음; old generation GC가 진행 중인 요청의 row를 삭제.
- **최소 검증:** 동일 filter로 chart/table/CSV를 동시에 요청하면서 새 generation을 publish하고, publish 전후에 각 응답의 ID·row/point·metric version을 비교한다. **합격:** 각 응답이 하나의 ready ID만 사용하고 중간 상태는 old ready 또는 명시적 `refreshing`이다. **탈락:** 출력 간 generation 불일치, building 세대 노출, ready pointer가 없는 상태의 성공 응답.
- **우선순위·선행:** P0; DP-01/02와 transaction/worker 경계 결정이 선행.
- **문서 반영:** `docs/01` §3 뒤에 “generation manifest and publication” 절 추가. `docs/05` §6의 completed generation 항목에 pointer/rollback을 명시. `docs/06` §18–§19의 Data Trust/assessments에 `generationId`, `sourceWatermark`, `calculationBasisTime`를 추가하는 문안은 별도 contract review로 결정.
- **확신도:** 높음 — mixed generation 금지는 이미 결정됐고 manifest 구현만 후보.

### DP-04 — 조회·취소·export의 공통 경계

- **사용자·운영 문제:** 고해상도 chart, 전체 row table, 대규모 CSV가 web request를 붙잡아 DB와 다른 사용자의 분석을 막는다. 사용자가 취소했는데 DB query가 계속 실행되면 운영자가 원인을 추적하기 어렵다.
- **현재 근거:** `docs/06` §15와 §27은 server-side table와 성능 UX를 요구하고, `PLATFORM_REQUIREMENTS.md`는 async export/reaggregation/cancel을 backlog로 둔다. 현재 API/worker는 없다.
- **제안:** 요청마다 정규화된 query plan을 만들고 scope/time/metric/column/ordering을 allowlist로 검증한다. `SET LOCAL statement_timeout`과 `SET LOCAL lock_timeout`을 transaction에 적용하고 API disconnect/explicit cancel을 DB driver cancel과 작업 상태에 연결한다. interactive result에는 row/point/byte/time budget을 둔다(값은 **측정 전 가정**). 작은 CSV는 고정된 SQL의 `COPY TO STDOUT`; 큰 export는 generation/context hash와 권한 snapshot을 기록한 async job 및 immutable artifact로 처리한다. keyset pagination과 deterministic order를 사용한다.
- **플랫폼이 소유할 책임:** query class별 budget, cancellation state, export generation binding, output contract와 bounded error (`too_large|timeout|forbidden`). Auth decision 자체는 C/권한 계약에서 제공받는다.
- **재사용 경계:** `COPY ... PROGRAM`은 shell 실행이므로 user input을 넣지 않는다. 임의 SQL/DSL, browser-side full data, per-request DataFrame은 도입하지 않는다. FeedbackOps의 job wrapper를 export ownership으로 간주하지 않는다.
- **실패 모드:** timeout은 API에서 끝났지만 DB query는 남음; export가 최신 pointer를 다시 읽어 chart와 다른 세대; `LIMIT`만 사용해 tail row가 사라짐; 사용자가 제공한 PID로 `pg_cancel_backend` 실행.
- **최소 검증:** 작은/큰 result, client disconnect, explicit cancel, lock contention, export 권한 변경을 재현한다. **합격:** 취소 후 bounded time에 DB query/job 상태가 종료 또는 cancelled이고, 결과가 허용 scope와 고정 generation만 포함한다. **탈락:** unbounded query, orphan task, mixed generation, arbitrary shell/SQL.
- **우선순위·선행:** P0 interactive query, P1 large export; DP-03과 C의 scope/permission seam이 선행.
- **문서 반영:** `docs/03` §2 뒤에 query class/timeout/cancel/export worker 표 추가. `docs/06` §15·§19에 `too_large|timeout`, generation-bound export와 cancel 상태 연결을 보강. `PLATFORM_REQUIREMENTS.md`의 async export 항목을 해당 합격 기준으로 구체화.
- **확신도:** 높음 — 경계 계약은 문서에 있으나 수치·driver는 Open.

### DP-05 — late arrival·backfill·재집계 실행

- **사용자·운영 문제:** 늦게 들어온 event나 master 정정이 과거 숫자를 바꾸지만, 어느 범위를 언제 다시 계산했는지 모르면 사용자는 freshness와 calculation basis를 구분할 수 없다.
- **현재 근거:** `docs/01`은 late arrival/master correction/class reclassification/metric change를 재집계 trigger로 둔다. `docs/05` §6은 `[R-H,R)` 자동 범위, H 명시, R이 없으면 자동 재계산 중지 및 후보 보존을 정한다.
- **제안:** source progress wall-clock boundary `R`과 late horizon `H`를 timeDomain별로 기록한다. R이 있으면 `[R-H,R)`을 idempotent candidate로 만들고, H 밖의 후보는 버리지 않고 explicit backfill로 남긴다. source correction과 metric version change는 범위를 별도로 계산한다. staging generation에서 recompute하고 DP-03 publication을 거친다. R이 없거나 mapping이 불완전하면 자동 publish를 멈추고 Data Trust에 원인을 표시한다.
- **플랫폼이 소유할 책임:** trigger taxonomy, R/H semantics, candidate queue, dedupe/idempotency key, backfill authorization/status, generation provenance.
- **재사용 경계:** pg_cron/pg-boss retry는 실행 trigger일 뿐 late horizon 판단이나 source completeness를 소유하지 않는다. 0행을 late 없음으로 추론하지 않는다.
- **실패 모드:** `R`을 server now로 대체; H 밖의 late row 삭제; 같은 candidate가 중복 실행되어 합계 증가; source watermark는 갱신됐지만 mart는 old generation.
- **최소 검증:** R/H 경계의 on-time/late row, master correction, metric version change, R missing을 넣는다. **합격:** 범위가 half-open으로 재현되고 duplicate run이 같은 generation/result를 만들며 R missing 시 auto publish가 멈춘다. **탈락:** 범위 누락, 이중 집계, 근거 없는 complete 표시.
- **우선순위·선행:** P0; DP-01/02/03, parser watermark owner와 R/H 정책이 선행.
- **문서 반영:** `docs/05` §6에 candidate state와 generation/job link 추가. `docs/01` §3에 late source와 master/metric correction을 별도 trigger 및 backfill provenance로 구체화.
- **확신도:** 중간 이상 — contract 방향은 높지만 실제 R 제공 방식과 H 값은 Open.

### DP-06 — 작업 실행 도구와 멱등성

- **사용자·운영 문제:** 재집계·export가 retry되거나 worker가 죽을 때 중복 결과·유실·무한 retry가 발생한다. 운영자는 어느 작업이 현재 generation을 만들었는지 알아야 한다.
- **현재 근거:** FeedbackOps `embed-voc.ts`는 version별 sole writer, retryable/non-retryable error, pg-boss wrapper를 실제 코드로 보여 준다. 그러나 FeedbackOps는 독립 제품이고 플랫폼 작업은 구현되지 않았다.
- **제안:** backend 언어가 결정되기 전에는 최소 Postgres job table을 기준 후보로 둔다. task에는 stable idempotency key `(dataset, input scope, range, metric version, source version)`, lease/heartbeat, attempt, next retry, terminal reason, generation/job link를 둔다. Node/TS로 결정되고 DLQ/backoff 요구가 커지면 pg-boss를 adapter로 평가한다. pg_cron은 enqueue trigger로만 사용한다.
- **플랫폼이 소유할 책임:** task state machine, idempotency, retry/DLQ/cancel semantics, job-to-generation provenance, operator repair command의 허용 범위.
- **재사용 경계:** FeedbackOps package와 queue schema를 shared platform DB에 직접 결합하지 않는다. 범용 workflow/approval engine은 현재 제품 범위를 벗어난다.
- **실패 모드:** worker retry가 같은 generation row를 append; lease 만료 후 두 worker가 publish; non-retryable contract failure를 무한 재시도; cancel된 export가 다시 enqueue.
- **최소 검증:** worker kill/restart, duplicate enqueue, transient DB failure, contract failure, cancellation, DLQ repair를 반복한다. **합격:** 한 idempotency key가 한 ready generation 또는 명확한 terminal failure를 가지며 orphan lease가 회복된다. **탈락:** double publish, silent drop, unbounded retry.
- **우선순위·선행:** P1(첫 async job 전); DP-03과 backend/worker 언어 결정이 선행.
- **문서 반영:** `docs/03`에 job table/pg_cron/pg-boss의 역할과 “executor does not own data trust” 문안 추가. `docs/05` Open에 runtime 선택을 남긴다.
- **확신도:** 중간 — reference code는 존재하지만 플랫폼 요구량은 미측정.

### DP-07 — Data Trust, 관측성, 상태 source

- **사용자·운영 문제:** 화면의 “최신”이 source 수집 완료인지, mart 계산 완료인지, 일부 coverage인지 알 수 없으면 현장 판단과 장애 대응이 충돌한다.
- **현재 근거:** `docs/06` §18–§19는 freshness, calculation basis, coverage, metric version, source/lineage와 outcome/assessment를 요구한다. FeedbackOps health/readiness는 Postgres 연결성만 확인하고, job-log는 bounded event를 남긴다.
- **제안:** 응답/로그/trace에 `analysisContextId`, `generationId`, time range/timeDomain, `sourceWatermark`, `calculatedAt`, metric/contract versions, job ID, query class/fingerprint, outcome을 연결한다. raw SQL, query payload, token, 전체 URL, 민감한 source row는 로그하지 않는다. OpenTelemetry W3C context propagation과 semantic conventions를 적용 후보로 삼되, high-cardinality metric label은 제한한다. readiness와 data freshness endpoint를 분리하고, 각 assessment에 authoritative `statusSource`를 둔다.
- **플랫폼이 소유할 책임:** status vocabulary, provenance schema, correlation propagation, cardinality/redaction policy, freshness/coverage evaluator의 source owner.
- **재사용 경계:** FeedbackOps Pino redaction과 health probe shape는 참고 패턴이다. 실제 platform status source/metric lineage를 대체하지 않는다.
- **실패 모드:** readiness green을 data complete로 표시; trace baggage에 민감정보를 넣음; generation ID를 매 log line에 넣지 않거나 unbounded URL label을 만듦; 0행 원인을 임의 추론.
- **최소 검증:** source slow, mart building, no coverage, forbidden, timeout, partial coverage를 각각 생성한다. **합격:** UI/API/worker/DB log가 같은 correlation/context/generation을 연결하고 각 원인이 근거 있는 status source로만 표시된다. **탈락:** green readiness=complete, raw payload 노출, 원인 없는 “not collected”.
- **우선순위·선행:** P0; DP-03과 C의 scope/auth status contract가 선행.
- **문서 반영:** `docs/06` §18–§19에 field-level provenance와 `generationId/sourceWatermark/statusSource` 추가 문안 제안. `docs/03`에 OTel/log redaction과 DB statistics의 “signal only” 한계 추가.
- **확신도:** 높음.

### DP-08 — 백업·복구·재빌드

- **사용자·운영 문제:** DB 장애나 잘못 공개된 generation 이후 source·mart·export를 어떤 순서로 되돌릴지 모르면 숫자와 운영 이력이 함께 손실된다.
- **현재 근거:** 현재 root에는 DB/배포/backup 설정이 없고, `docs/05`의 deployment/operations 질문이 Open이다. PostgreSQL 공식 문서는 base backup+continuous WAL로 PITR/warm standby를 구성할 수 있지만 archiver와 restore procedure를 검증하라고 한다.
- **제안:** source와 manifest를 기준으로 mart를 재빌드할 수 있게 하고, ready pointer rollback, failed generation 격리, export artifact retention/삭제, operator repair audit을 runbook으로 만든다. WAL archive와 base backup을 채택한다면 RPO/RTO를 먼저 결정하고 정기 restore drill로 측정한다. DB backup이 generation manifest와 export object를 모두 커버하는지 확인한다.
- **플랫폼이 소유할 책임:** backup/restore contract와 drill evidence, generation rollback/GC, rebuild/checksum, repair authority와 audit.
- **재사용 경계:** managed DB provider의 PITR를 자동으로 플랫폼 RPO 충족으로 간주하지 않는다. FeedbackOps storage/health adapter는 독립 제품 책임이다.
- **실패 모드:** WAL archive 정체로 disk full; DB는 복구했지만 manifest/export가 유실; 복구 후 current pointer가 building 세대; restore가 실행되지 않아 RTO 추정만 존재.
- **최소 검증:** 의도적 restore를 격리 환경에서 수행하고 source watermark·manifest·ready pointer·대표 CSV hash를 대조한다. **합격:** 선언한 RPO/RTO(값은 측정 전 가정)를 증거로 만족하고 failed generation은 재공개되지 않는다. **탈락:** archive gap, mixed pointer, 수동 undocumented repair.
- **우선순위·선행:** P1; 배포/backup provider, RPO/RTO, artifact storage 결정이 선행.
- **문서 반영:** `docs/05` Open에 backup/restore/RPO/RTO를 추가. `docs/01` generation 절에 rebuild/rollback/GC와 source of truth를 추가. 운영 runbook 위치는 구현 단계에서 정한다.
- **확신도:** 중간 — 원칙은 공식 문서와 맞지만 인프라 미확인.

### DP-09 — 규모 확장 분기와 측정 게이트

- **사용자·운영 문제:** 실제 병목을 재지 않고 ClickHouse, TimescaleDB, Redis, Kafka, workflow engine을 미리 넣으면 운영 surface와 계보가 늘어나는 반면 사용자에게 보이는 개선은 증명되지 않는다.
- **현재 근거:** `docs/05`는 volume/retention/concurrency를 Open으로 두고, `docs/06`은 Platform-first를 요구한다. PostgreSQL partitioning 문서도 큰 테이블·접근 파티션 집중·bulk load/delete일 때 이점을 보지만 파티션이 많으면 planning/memory 비용이 늘 수 있다고 설명한다. [PostgreSQL partitioning](https://www.postgresql.org/docs/18/ddl-partitioning.html)
- **제안:** benchmark 전에 목표 지표를 선언한다: p50/p95 interactive latency, query timeout/error, DB CPU/IO/memory/lock wait, ingest lag, generation rebuild duration, export throughput/queue age, freshness lag, restore time. 각 지표의 허용값은 **측정 전 가정**으로 표시한다. 인덱스·query shape·mart/partitioning을 먼저 개선한 뒤에도 gate를 넘지 못할 때 TimescaleDB, 그 다음 broad scan/retention/동시성이 검증되면 ClickHouse를 비교한다.
- **플랫폼이 소유할 책임:** benchmark dataset/traffic model, contract-preserving comparison, decision record, migration/backfill/reconciliation plan, exit criterion.
- **재사용 경계:** vendor/product 성능 광고를 local evidence로 쓰지 않는다. ClickHouse CDC mirror의 freshness·ACL·generation을 검증하지 않은 상태에서 “채택”으로 표현하지 않는다.
- **실패 모드:** 평균 latency만 보고 tail/lock을 놓침; benchmark가 실제 wall-clock·late/backfill·권한 조건을 포함하지 않음; dual store 숫자 불일치; partition 수를 무제한 증가.
- **최소 검증:** 고정된 sanitized fixture와 재현 가능한 workload로 C0(Postgres)와 후보를 같은 chart/table/CSV/late/backfill 계약 아래 비교한다. **합격:** declared gate와 reconcile 0 mismatch를 충족하며 복구·CDC lag도 허용 범위. **탈락:** 성능 향상은 있으나 generation/ACL/provenance 불일치, 혹은 운영 비용이 측정되지 않음.
- **우선순위·선행:** P1/Deferred; DP-01–DP-08 최소 계약, 실제 volume/concurrency/SLO가 선행.
- **문서 반영:** `docs/05` Open/Deferred에 gate 측정 항목과 “benchmark 전에는 대체 도입 보류” 문장 추가. `docs/03`에 scale branch 표와 exit cost 기록 의무를 추가.
- **확신도:** 높음 — 후보 성능 자체가 아니라 측정 절차를 권고한다.

## 5. 추천 최소 조합과 대안

### 5.1 첫 구현의 최소 조합

다음은 현재 계약과 미확인 운영 조건을 전제로 한 **Candidate minimum**이다.

1. 조직이 지원하는 PostgreSQL 한 major 버전과 단일 분석 database/cluster를 사용한다. parser schema는 read-only role로 읽고 platform-owned schema에서 compatibility view를 만든다.
2. 기본 조회는 SQL-first API가 담당한다. API는 scope/time/metric/column을 검증하고 PostgreSQL이 filtering/join/basic aggregate/validated mart query를 수행한다. per-request DataFrame과 arbitrary SQL/DSL은 사용하지 않는다.
3. mart가 필요한 metric은 generation column을 가진 staging table에 만들고, `analysis_generation`과 current pointer를 둔다. 모든 artifact를 검증한 뒤 pointer 한 번만 교체한다. native MV는 단일 빠른 read model이 명확할 때만 내부 구성요소로 사용한다.
4. 작은 async 작업은 Postgres job table과 `SKIP LOCKED` claim으로 시작한다. pg_cron은 idempotent enqueue/periodic trigger가 필요할 때만 추가한다. Node/TypeScript와 queue 요구가 확정된 뒤 pg-boss를 adapter로 benchmark한다.
5. interactive query는 `SET LOCAL statement_timeout`/`lock_timeout`, row/point/byte budget, driver cancel, deterministic pagination을 갖는다. 작은 CSV는 고정 query의 `COPY TO STDOUT`, 큰 CSV/reaggregation은 generation-bound async job으로 분리한다.
6. 모든 결과에 calculation basis, generation, watermark, metric/contract version, coverage/provisional와 status source를 연결한다. OpenTelemetry correlation과 bounded/redacted structured log를 사용하되, 현재 FeedbackOps 로그를 플랫폼 공용으로 가정하지 않는다.
7. Postgres stats/progress view, WAL/archive/backup, restore drill을 운영 증거로 만든다. `pg_stat_activity`로 장기 query를 확인하고, operator가 승인된 DB-side cancel을 수행할 수 있는 경계를 정한다. [PostgreSQL admin functions](https://www.postgresql.org/docs/18/functions-admin.html)

이 조합에서 **가정으로 시작할 수 있는 수치**는 예컨대 “interactive p95를 몇 초 안에, 최대 몇 point/row, export를 몇 분 안에, freshness lag를 얼마 안에”와 같은 항목뿐이다. 실제 값은 representative fixture와 부하 모델을 측정한 뒤 `docs/05`의 Open에서 결정한다. 숫자를 지금 계약에 하드코딩하지 않는다.

### 5.2 대안과 결정을 바꾸는 조건

| 관찰된 측정/운영 조건 | 다음 비교 | 바꾸기 전 필요한 증거 |
| --- | --- | --- |
| 인덱스·query shape·validated mart·합리적 partitioning 이후에도 interactive p95/timeout/CPU·IO가 가정 SLO를 넘음 | TimescaleDB를 같은 API/contract로 비교. | 같은 fixture의 wall-clock/timeDomain/late row, chart/table/CSV generation 일치, extension backup/restore와 edition/license 확인. |
| 재집계가 late horizon 안에 끝나지 않거나 source 읽기/쓰기 경합이 지속됨 | generation build를 incremental/partitioned로 보강하고, 이후 columnar/rollup 후보를 비교. | rebuild time, lock wait, source impact, retry/recovery와 R/H coverage 증거. |
| broad historical scan, peak concurrency, retention이 Postgres capacity를 넘고 CDC freshness를 운영할 수 있음 | Postgres source of truth + ClickHouse mirror를 비교. | CDC lag/replay/backfill, generation/watermark reconciliation, scope/ACL lineage, dual-store restore와 운영 인력/비용. |
| task dependency·long-running resume·operator repair가 job table/pg-boss 범위를 반복적으로 초과 | 범용 workflow engine을 조사. | 실제 workflow graph, retry/approval 필요, worker/cluster 운영 비용, audit와 idempotency 책임. |
| single DB restore가 선언한 RPO/RTO를 못 맞춤 | replica/managed DB/object storage/분리 read path를 비교. | restore drill와 장애 시나리오, WAL/archive 상태, 비용과 데이터 계보. |

### 5.3 지금 도입하지 않을 것

- 측정 전 ClickHouse, TimescaleDB, Redis, Kafka, Temporal 등 별도 분산/시계열/워크플로 스택.
- chart/table/CSV를 각각 구현하는 독립 metric SQL, generation을 숨긴 `now()` 기반 freshness, client-side 전체 행 전송.
- generic workflow/approval/alert engine, arbitrary SQL/DSL, 외부 BI 연결, multi-tenant/RLS를 요구사항 증거 없이 platform kernel에 넣는 것.
- FeedbackOps의 queue/schema/logger를 “이미 존재하는 플랫폼 공용”으로 복사하는 것.

### 5.4 작은 수직 검증 흐름

1. **Fixture:** 두 equipment와 두 timeDomain의 naive wall-clock event, valid interval 경계, null/quality, late row, master correction, ratio와 non-additive P95 후보를 고정한다. source watermark R과 metric/contract version도 fixture에 넣는다.
2. **Consume:** read-only parser adapter와 compatibility view가 expected grain/unit/null/time contract를 통과한다. unknown source version·duplicate key는 성공 응답이 아니라 명시적 contract error가 된다.
3. **Build:** generation `G1`을 staging에서 만들고 coverage/metric/row count/uniqueness를 검증한다. manifest를 ready로 공개한 뒤 chart/table/CSV를 같은 조건으로 요청해 모두 `G1`을 반환한다.
4. **Change:** late row와 master correction을 넣고 `[R-H,R)` candidate `G2`를 재계산한다. R이 없는 경우 auto publish를 멈추고 provisional/unknown status를 확인한다. `G1`과 `G2`를 한 응답 안에 섞지 않는다.
5. **Stress/cancel:** 제한된 concurrent interactive query, lock contention, large export, client disconnect를 실행한다. timeout/cancel 후 DB query와 job이 종료되고, authorized scope 밖 row가 결과에 나타나지 않는 것을 확인한다.
6. **Recover:** worker kill/retry, failed publish, pointer rollback, backup/restore 또는 격리 재빌드를 수행한다. generation manifest, source watermark, representative CSV hash와 log/trace correlation을 대조한다.

이 흐름은 실제 성능 합격을 주장하는 테스트가 아니라 최초 구현 전에 계약을 깨는 지점을 찾는 검증 계획이다. fixture 통과만으로 운영 규모나 provider 적합성을 결론내리지 않는다.

## 6. 충돌·중복·미결 질문

### 6.1 발견한 충돌과 중복

- `docs/01`의 “mart를 사용”과 `docs/05`의 “pg_cron은 scheduler”는 충돌하지 않는다. 전자는 read model이고 후자는 trigger이므로, 이 보고서는 둘 사이에 generation manifest/publication을 추가하는 해석을 제안한다.
- `docs/03`의 “Postgres filtering/joins/basic aggregates”와 `docs/06`의 “table/chart platform frame”은 서로 다른 소유권이다. API가 metric 의미와 결과 신뢰를 소유하고 frontend가 presentation/interaction을 소유하도록 유지한다.
- `source watermark`, `defaultRangeTo`, `calculation basis time`, `calculated_at`, freshness가 유사한 단어로 소비될 위험이 있다. 각각 source 진행 경계, server query upper bound, 계산이 근거로 삼은 시간/세대, 계산 실행 시각, 사용자에게 표시하는 최신성으로 명시해야 한다.
- native materialized view, generation mart, export artifact가 모두 “캐시”로 불리면 공개 완료 의미가 흐려진다. MV는 저장된 read model, generation은 공개 가능한 분석 결과 집합, export는 고정 generation 산출물로 구분한다.
- FeedbackOps의 pg-boss·Pino·health 코드는 실행/운영 패턴의 관찰 근거이지 platform ownership evidence가 아니다. 이 경계를 흐리면 독립 제품의 schema/권한/배포 전제가 root로 침투한다.
- `docs/00`와 `docs/06`의 범용 workflow/alert/BI 제외와 async export/reaggregation 요구는 모순이 아니다. 필요한 소수의 데이터 작업 실행기는 platform contract의 일부로 만들되, 범용 업무 엔진으로 확대하지 않는다.

### 6.2 사용자에게 필요한 질문(최대 5개)과 답이 없을 때의 범위

1. **backend/worker 언어와 배포 모델은 무엇인가?** Python/FastAPI면 native worker/SQL 도구를 우선하고, Node/TypeScript면 pg-boss를 조건부 평가한다. 답이 없으면 Postgres job table + 얇은 adapter를 기준으로 두고 library lock-in을 피한다.
2. **대표 데이터 규모는 어느 정도인가?** 하루 행 수, 보존 연수, peak interactive query/export, 동시 사용자, 최대 chart point를 알려야 partition/columnar gate를 정할 수 있다. 답이 없으면 “Postgres가 충분하다”가 아니라 작은 fixture로만 시작하고 scale 결정을 Deferred로 둔다.
3. **freshness, interactive latency, export/rebuild 시간과 RPO/RTO 목표는 무엇인가?** 답이 없으면 모든 수치는 측정 전 가정으로 문서에 남기고, declared benchmark를 먼저 만든다.
4. **실제 equipment wall-clock의 timeDomain/TZ mapping과 source watermark R, late horizon H 제공자는 누구인가?** 답이 없으면 unknown timezone을 merge하지 않고, R이 없을 때 자동 재집계를 멈추며, H 밖은 보존 후보로 둔다.
5. **장기 작업의 dependency/approval, tenant isolation, CDC가 첫 릴리스에 필요한가?** 답이 없으면 범용 workflow engine, RLS/multi-tenant, ClickHouse mirror를 도입하지 않고, single-scope/read-only source 경로를 유지한다. 필요한 시점에는 C(권한/통합)와 함께 별도 플랫폼 결정을 올린다.

## 7. 출처와 검증 한계

### 7.1 저장소 근거

- 현재 계약: [`docs/INDEX.md`](../../../docs/INDEX.md), [`docs/00_overview.md`](../../../docs/00_overview.md), [`docs/01_architecture_and_data_contract.md`](../../../docs/01_architecture_and_data_contract.md), [`docs/03_backend_stack.md`](../../../docs/03_backend_stack.md), [`docs/05_roadmap_and_open_questions.md`](../../../docs/05_roadmap_and_open_questions.md), [`docs/06_platform_ui_contract.md`](../../../docs/06_platform_ui_contract.md), [`PLATFORM_REQUIREMENTS.md`](../../../PLATFORM_REQUIREMENTS.md), [`DESIGN.md`](../../../DESIGN.md), `docs/integration/*`를 2026-09-22에 읽었다.
- 현재 root 기준점: `e999c997a4282e9b88b6fb3df36c6212b8adf2e4`. 플랫폼 runtime/migration/test의 존재를 확인하지 못했다.
- 독립 참고 기준점: `products/feedbackops` `b5dd614ac8da3792cb1627e7daeffb8fc9c4944e`. `products/feedbackops/AGENTS.md`와 backend 하위 지침을 적용해 읽기만 했다. 실제 참고 경로는 §2.2에 기록했다.

### 7.2 공식 기술 자료

확인일은 모두 2026-09-22이며, PostgreSQL 링크는 조사 시 최신 18 문서(페이지가 18.6 및 지원 major 18/17/16/15/14를 표시)를 기준으로 했다. 릴리스별 동작·managed service 지원은 실제 배포 환경에서 다시 확인해야 한다.

- PostgreSQL [Materialized Views](https://www.postgresql.org/docs/17/rules-materializedviews.html), [`REFRESH MATERIALIZED VIEW`](https://www.postgresql.org/docs/18/sql-refreshmaterializedview.html), [MVCC introduction](https://www.postgresql.org/docs/16/mvcc-intro.html), [`SET TRANSACTION`](https://www.postgresql.org/docs/17/sql-set-transaction.html): persisted result, refresh/concurrent unique index, snapshot/isolation 근거.
- PostgreSQL [client connection defaults](https://www.postgresql.org/docs/18/runtime-config-client.html): `statement_timeout`과 `lock_timeout`을 session/transaction 범위로 둘 수 있으며 global 설정의 주의점.
- PostgreSQL [`COPY`](https://www.postgresql.org/docs/18/sql-copy.html): query 결과의 STDOUT streaming과 progress view. `PROGRAM`은 shell 실행이므로 사용자 입력을 허용하지 않는다는 운영 경계.
- PostgreSQL [cumulative statistics](https://www.postgresql.org/docs/18/monitoring-stats.html) 및 [admin functions](https://www.postgresql.org/docs/18/functions-admin.html): stats lag/transaction cache와 privileged `pg_cancel_backend`/`pg_terminate_backend`.
- PostgreSQL [partitioning](https://www.postgresql.org/docs/18/ddl-partitioning.html), [continuous archiving/PITR](https://www.postgresql.org/docs/18/continuous-archiving.html), [license](https://www.postgresql.org/about/licence/): scale·복구·라이선스 근거.
- [pg_cron 공식 GitHub](https://github.com/citusdata/pg_cron): PostgreSQL 안의 scheduler, preload/DB/standby/동시 실행 조건과 PostgreSQL License. README의 현재 main을 확인했으며 고정 release 채택을 뜻하지 않는다.
- [pg-boss 공식 GitHub](https://github.com/timgit/pg-boss): Node/PostgreSQL queue, `SKIP LOCKED`, retry/backoff/DLQ/cron/dependency/exactly-once delivery claim, Node/PG 요구조건과 MIT 표시. 조사 시 upstream package 버전은 12.33.3으로 보였으며, 로컬 FeedbackOps 선언 `^12.18.2`와 동일하다고 가정하지 않는다.
- [TimescaleDB 공식 저장소](https://github.com/timescale/timescaledb) 및 [공식 editions 문서](https://github.com/timescale/docs/blob/latest/about/timescaledb-editions.md): Apache 2 edition과 Community/TSL edition의 배포·기능·라이선스 경계를 확인했다. 특정 기능의 현재 유료/무료 경계는 실제 edition과 서비스 약관 확인이 필요하다.
- [ClickHouse 공식 저장소](https://github.com/ClickHouse/ClickHouse), [Postgres + ClickHouse OSS architecture](https://clickhouse.com/blog/postgres-clickhouse-oss): Apache-2.0 core와 Postgres source-of-truth + ClickHouse analytics mirror 사례를 확인했다. 제품 페이지/블로그의 성능·확장성 주장은 local benchmark로 사용하지 않았다.
- OpenTelemetry [context propagation](https://opentelemetry.io/docs/concepts/context-propagation/), [semantic conventions](https://opentelemetry.io/docs/concepts/semantic-conventions/), [signals](https://opentelemetry.io/docs/concepts/signals/), [logs](https://opentelemetry.io/docs/specs/otel/logs/): trace/log correlation과 민감한 baggage/label 제한의 근거.

### 7.3 검증 한계

- PostgreSQL 서버를 설치·기동하거나 실제 parser dump를 읽지 않았고, schema/migration/extension 지원을 실행으로 확인하지 않았다.
- representative row volume, concurrent load, lock contention, late/backfill, export size, restore time을 측정하지 않았다. 따라서 “Postgres가 성능상 충분하다”, “Timescale/ClickHouse가 더 빠르다”, 특정 p95/SLO를 달성한다는 주장은 하지 않는다.
- 공식 자료가 제공하는 기능/제약·라이선스 표시와 이 저장소 계약을 비교했을 뿐, 보안·법률·유료 서비스 적합성, managed provider의 실제 edition을 승인하지 않았다.
- FeedbackOps 경로는 읽기 전용으로 확인한 독립 제품 사례다. 플랫폼으로의 코드 재사용, 인증/권한 통합, queue 운영, production health는 검증하지 않았다.
- 이 보고서 작성으로 수정한 파일은 이 파일 하나이며, 구현 코드·source docs·dependency·submodule·migration·commit/push는 변경하지 않았다.
