# 합성 분석 데이터셋을 엔진에 싣기 — PostgreSQL loader와 #1704·#2918의 쓰임

상태: **Candidate** — [#3204](https://github.com/hjung3113/analytics-platform/issues/3204) 조각 3. 생성기 자체(데이터셋 2종, golden, 독립 oracle)의 규칙은 [server-conformance §Synthetic datasets](../../packages/host/server-conformance/AGENTS.md#synthetic-datasets-datasets-3204)가 소유한다. 이 문서는 생성기의 공개 API(`@ap/server-conformance/datasets`의 `generateSyntheticDataset`)만 쓰는 엔진 쪽을 적는다.

## 1. 무엇을 증명하고 무엇을 증명하지 않는가

- 증명하는 것: 같은 seed·`SYNTHETIC_DATASET_VERSION`·파라미터로 만든 같은 논리 행을 PostgreSQL에 실었을 때, SQL이 생성된 행에서 직접 계산한 답과 같다는 것. 기대값은 시험이 생성된 행에서 계산하고 loader나 SQL에서 가져오지 않는다.
- 증명하지 않는 것: **사내 성능 PASS도, 업무 의미 PASS도 아니다.** 행은 모두 가상이고(가상 2030년, `R-000001` 꼴 합성 키) 기본 파라미터는 임의 시험값이다. 사내 실제 규모·분포·파라미터와 baseline은 사내에서만 넣고 관리한다([#2974](https://github.com/hjung3113/analytics-platform/issues/2974), [환류 절차 §3](upstream-feedback-procedure.md#3-나가도-되는-것과-안-되는-것)). 이 저장소에 그 값을 올리지 않는다.

## 2. PostgreSQL loader

| 무엇 | 어디 |
| --- | --- |
| loader (`loadSyntheticDataset`, `dropSyntheticSchema`) | `apps/platform-api/src/test-support/synthetic-datasets-pg.ts` |
| loader 단위 시험 (DB 없음, 기본 CI) | `apps/platform-api/src/test-support/__tests__/synthetic-datasets-pg.test.ts` |
| PostgreSQL 시험 (opt-in, 기본 CI 밖) | `apps/platform-api/src/__tests__/synthetic-datasets.pg.test.ts` |

- 데이터셋 하나를 **자기 schema 하나**에 싣는다(표마다 한 table, 열 이름은 snake case). 제품 table은 건드리지 않는다. 한 transaction이고 실패하면 되돌린다. schema 이름은 소문자 식별자만 받고 `public`·`pg_*`는 거절한다.
- 열은 표마다 선언한다(시각은 `timestamptz`, `elapsed`는 밀리초일 수 있어 `bigint`). 생성기가 필드를 더하거나 빼면 SQL을 내기 전에 `columnsFor`가 실패한다(기본 CI의 단위 시험이 두 데이터셋 전부를 대조).
- 기본·외래 키를 두지 않는다. 반복 키, revision, 짝 없는 관계가 데이터셋에 일부러 들어 있기 때문이다.
- test code다. loader는 `@ap/server-conformance`를 import하지 않는다(이미지 빌드가 그 패키지를 manifest만 설치하므로, `image-build-tsconfig.test.ts`). 생성기를 import하는 두 시험 파일은 `tsconfig.json` `exclude`와 `tsconfig.platform-tests.json` `include`에 있고, 단위 시험이 실제 생성 데이터셋을 loader에 넘겨 모양을 맞춘다.

### 실행 (opt-in)

```bash
# scratch schema를 만들어도 되는 DB. 끝나면 schema를 지운다. 제품 table을 비우는 integration globalSetup은 돌지 않는다.
SYNTHETIC_DATASETS_PG_URL=postgres://… pnpm --filter @ap/platform-api exec vitest run src/__tests__/synthetic-datasets.pg.test.ts
```

`SYNTHETIC_DATASETS_PG_URL`이 없으면 시험은 건너뛴다. 기본 `test`와 `test:integration`은 이 변수를 두지 않으므로 PR CI·integration 묶음에서는 돌지 않는다. 확인할 때는 레인 검증 DB(`ops/platform-api/conductor/scripts/verify-db.sh create <n>`, 끝나면 `drop <n>`)를 쓴다.

### 시험하는 규칙 (#1704의 반례)

| 규칙 | SQL | 비교 |
| --- | --- | --- |
| 부모 합은 부모 단위로 센다 | 최신 revision(`DISTINCT ON`)의 `sum(quantity)` | 생성된 행의 합과 같다. 자식과 join한 합은 다르다(부풀음) |
| 단위가 섞인 시간은 한 단위로 더한다 | `elapsed_unit`별 `CASE` | 초 단위 합과 같다 |
| `ratioOfSums` ≠ 비율의 평균 | `sum(amount) / sum(분)` 대 `avg(amount / 분)` | 각각 생성된 행의 값과 같고 둘은 다르다 |
| 물리 이벤트 수 ≠ 참여 객체 수 ≠ 덮인 시간 | `count(*)`, join 뒤 `count(DISTINCT object_key)`, 자원별 `range_agg(tstzrange(…))` | 각각 같고, 덮인 시간은 겹침을 두 번 센 합보다 작다 |

## 3. #1704가 쓰는 법

- [#1704](https://github.com/hjung3113/analytics-platform/issues/1704)(Dataset·Field·Metric 의미 계약)의 수용 기준 «합성 dataset 2종의 metric·grain·unit·time·join 호환/비호환을 서버 계약으로 판정»의 입력이 이 두 데이터셋이다. 계약 초안이 정해지면, 공개 PG 기반 최소 계약 시험은 §2의 loader로 같은 행을 싣고 그 계약이 거절하거나 표시해야 할 경우(비율 평균, join 부풀음, 단위 차이, 짝 없는 관계)를 위 표의 SQL 모양으로 확인한다.
- 기대값은 생성기 행에서 계산하거나 server-conformance의 독립 oracle(`packages/host/server-conformance/src/__tests__/datasets/oracle.test-support.ts`)과 같은 규칙을 쓴다. loader나 엔진의 출력을 기대값으로 삼지 않는다.
- 계약 타입, 서버 판정 및 착수 조건(#531·#540 경계 ADR)은 [#1704](https://github.com/hjung3113/analytics-platform/issues/1704)에서 추적한다.

## 4. #2918이 쓰는 법

- [#2918](https://github.com/hjung3113/analytics-platform/issues/2918)(공용 분석 엔진·Rust 검토)의 측정 B·C(10만·100만 행의 JSON 대 Arrow, 브라우저 재집계)는 같은 생성기로 행을 만든다. 엔진마다 loader를 따로 두되 입력 행과 기대값은 위와 같은 것을 쓴다. 대량 행은 조각 2의 묶음 생성·NDJSON/CSV 작성기로 만든다(#3204 조각 2).
- 측정 수치는 합성 데이터의 수치다. 사내 성능 판단은 사내에서 사내 파라미터로 다시 잰다.

## 5. 하지 않은 것

| 무엇 | 이유 | 다시 여는 조건 |
| --- | --- | --- |
| PostgreSQL 밖 엔진(DuckDB, DataFusion, Polars, Arrow 전송)의 loader | 엔진 선택이 #2918의 측정 결과에 달려 있고 아직 측정하지 않았다 | #2918에서 후보 엔진의 측정을 시작할 때 |
| 대량 규모를 PostgreSQL에 싣기(COPY 경로) | 지금 시험은 작은 seed로 규칙만 본다. 대량 측정의 실행 환경·프로필은 조각 2의 몫이다 | #2918 측정 B를 PostgreSQL로 잴 때 |
| CI에서 opt-in 시험 돌리기 | 기본 CI에 DB·대량 파일을 더하지 않는다는 #3204 범위 | #1704 계약 시험이 생겨 PR마다 돌아야 할 때 |
