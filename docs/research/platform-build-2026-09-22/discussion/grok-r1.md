# R1 반대 검토 — Grok 4.6 High

- 작성: 2026-09-22
- 역할: 반대 검토자. OSS 완제품 활용 기회 누락, 자체 구현 과잉, 성능/정합성 실패 조건을 전 영역에 적용한다.
- 입력: `docs/research/platform-build-2026-09-22/{01,02,03}-*.md`, `discussion/BRIEF.md`, `docs/00`–`07`, `docs/integration/*`, FeedbackOps 고정 커밋 `b5dd614ac8da3792cb1627e7daeffb8fc9c4944e` 읽기.
- 상태: 검토·권고. Decided 계약·구현을 변경하지 않는다. 이 파일만 작성했다.
- 표기: **[사실]** 문서·코드·공식 페이지에서 확인. **[추론]** 그 사실에서 도출한 설계 판단. **[미검증]** 실행·측정·운영 확인 없음.

---

## 1. 입장 요약

세 원본은 계약을 대체로 올바르게 인용하고, “라이브러리 성능 광고 ≠ 통과 증거”, “FeedbackOps 테이블을 공용으로 복사하지 말 것”, “ClickHouse/Temporal/OpenFGA를 지금 넣지 말 것”은 동의한다. 반대하는 축은 다른 데 있다.

원본은 **플랫폼이 소유해야 할 의미**와 **그 의미를 실현하는 최소 구현**을 한 덩어리로 묶는다. 그 결과 (1) TanStack/Postgres/FeedbackOps 선례를 쓰면서도 그 도구의 기본 파서·폴백·큐가 계약을 깨는 지점을 못 막고, (2) 없는 런타임 위에 generation manifest·job table·MenuManifest·OTel·WAL drill을 P0로 쌓으며, (3) 이미 있는 Fastify/pg-boss/CheckService와 Graphile Worker·JSON Schema·Casbin 같은 **완제품/기존 구현**을 후보표에서 빠뜨린다.

가장 비싼 실패는 mixed-generation 화면이 아니라, **라우터가 계약을 조용히 보정한 URL로 조회가 성공하는 것**과 **권한 회수 뒤 export가 남는 것**이다. 둘 다 원본이 “실패 모드”로 적어 두고도 최소 조합에서는 구현 프레임워크로 치환하지 못했다.

---

## 2. 핵심 권고 (5)

1. **URL codec은 라우터 파싱 전의 raw query string을 소유한다.** 공유 산출물은 TypeScript가 아니라 `docs/06` §6.1이 이미 Candidate로 둔 JSON Schema/OpenAPI다. TanStack Router 기본 JSON search·`.catch()`/`.default()`/FeedbackOps `.strict()`는 계약과 충돌하므로 adapter로만 쓴다. (G1, C1)
2. **서버 계산 세대와 브라우저 요청 경쟁을 같은 `generation`으로 부르지 않는다.** chart/table/CSV 일치의 최소 계약은 “첫 성공 응답의 `calculationGenerationId`를 이후 요청에 바인딩”이다. staging 테이블 + current pointer + GC + rollback 프레임워크는 재집계 *쓰기* 원자성이 필요할 때 도입한다. (G2, C2)
3. **백엔드 1차 후보는 FastAPI/Nest가 아니라, 이미 있는 Fastify 5.2.0 + Zod + `pg` + pg-boss 패턴을 adapter로 재평가하는 것이다.** 커스텀 `SKIP LOCKED` job table은 Graphile Worker(Node) 또는 pg-boss를 언어 결정 전에 기각한 뒤에만 만든다. (G3)
4. **권한/Audit는 FeedbackOps protocol을 복사하지 말고 추출한다.** OpenFGA/OPA/Keycloak은 원본대로 보류. 빠진 비교 대상은 프로세스 내 Casbin이지 새 `PermissionDecision` 프레임워크가 아니다. 첫 slice는 menu→route→query→export가 같은 decision fingerprint를 쓰는 네 표면이다. (G4)
5. **MenuManifest 완전체, ChartFrame, OTel, WAL/PITR drill, FileGateway/ProjectGraph adapter는 메뉴 2–3개 반복 또는 실측 게이트 전 P0가 아니다.** `docs/06` §1·§24·§28은 반복 확인 전 승격을 금지한다. 세대는 전 플랫폼 프레임워크가 아니라 대표 흐름의 **read-basis 보존/만료**만 둔다. (G5)

---

## 3. 동의 / 반대 표

| ID | 원본 주장 | 판정 | 이유 |
| --- | --- | --- | --- |
| A-K1 | Public URL codec + Menu Registry는 OSS 밖 Kernel 계약 | **부분수용** | codec 소유는 맞다. Menu Registry를 P0 완전체로 올리는 것은 §24에 반한다. |
| A-K2 | FeedbackOps TanStack Router/Query/Zod를 출발점으로, 제품 코드는 복사하지 않음 | **부분수용** | 출발점은 맞다. 그 선례의 `.strict()`와 Router JSON search는 계약 위반 후보다. |
| A-K3 | 표=TanStack Table+Virtual, 차트=ECharts adapter POC | **동의** | 라이브러리가 서버 filter/sort/downsample을 주지 않는다는 한계 명시는 정확하다. 성능 미측정. |
| A-K4 | UI primitive는 Radix 한 계열 | **동의** | 한 family 고정. Base UI/React Aria는 같은 acceptance 전 교체 금지. |
| A-K5 | 라이브러리 fallback/clamp/guest embed를 계약으로 오인하지 말 것 | **동의** | 가장 강한 원본 문장. 다만 자기 최소 조합이 Router `validateSearch`에 의존해 같은 함정에 빠진다. |
| A-A1 | `PublicContextV{n}` TypeScript artifact + decode/validate/canonicalize/encode | **반대** | 공유 산출물 형식은 06이 JSON Schema/OpenAPI를 Candidate로 이미 둔다. TS-only는 FastAPI 후보와 모순. |
| A-A1f | “duplicate set을 dedupe함”을 실패 모드로 적음 | **반대** | 06 §6.1은 집합 ID 중복 제거가 Decided. 실패는 **단일값 키 반복**과 **파서 전 붕괴**다. |
| A-A3 | Query key에 `serverGeneration`을 넣고 commit gate | **반대** | 요청 경쟁 세대와 계산 세대를 한 키에 넣으면 첫 fetch 전에 키를 못 만들고, 넣으면 위젯마다 다른 세대를 commit한다. |
| A-A8 | Superset/Metabase는 kernel 대체 제외 | **부분수용** | kernel 대체 제외는 맞다. 문서화된 SQL view의 *외부* 소비(00 YAGNI)와 Grafana Context Link 참고(04)까지 Deferred로 묶으면 과하다. |
| B-K1 | PostgreSQL 작게 시작, OLAP/브로커 보류 | **동의** | 05 volume Open, 01 same-instance 정책과 일치. |
| B-K2 | 계산 완료 세대를 공개 포인터 하나로 관리 | **부분수용** | 쓰기 공개 원자성은 필요. 읽기 일치의 최소 조건은 포인터 프레임워크가 아니다. |
| B-K3 | watermark / `defaultRangeTo` / `calculated_at` 분리 | **동의** | 05·06과 일치. DP-05가 이 분리를 스스로 흐린다. |
| B-DP03 | staging mart + manifest + current pointer + rollback/GC | **반대(과잉)** | 첫 수직 흐름에 전체 프레임워크. 최소는 immutable `generation_id` 컬럼 + 단일 공개 트랜잭션. |
| B-DP04 | `statement_timeout` + driver cancel + COPY/async export | **부분수용** | 경계는 맞다. HTTP abort → pool 반환이 곧 cancel이 아님을 최소 계약에 넣지 않으면 실패한다. |
| B-DP05 | `R` 없으면 auto publish 중단 | **반대** | 05는 자동 *재집계*만 보류하고, `R` 없어도 `defaultRangeTo`가 독립 유효하면 기본 구간 물질화를 허용한다. |
| B-DP06 | 최소 Postgres job table; pg-boss는 Node 결정 후 | **반대** | Graphile Worker/pg-boss를 “언어 전 기각”하지 않은 채 큐를 직접 짜는 것은 과잉. idempotency key가 source *스키마* version만 보면 새 행/마스터 정정을 삼킨다. |
| B-DP08/09 | WAL/PITR, restore drill, Timescale/CH 측정 게이트 | **부분수용** | 게이트 절차는 옳다. 첫 slice P1로 올리면  Premature. |
| C-K1 | AuthProvider 흐름 재사용, Workspace/role 복사 금지 | **동의** | |
| C-K2 | 처음엔 OpenFGA/OPA 없이 Postgres 권한 경계 | **부분수용** | 외부 서비스 보류는 맞다. Casbin 등 in-process 비교가 빠져 자체 구현을 기본값으로 고정한다. |
| C-K3 | Entity Link가 유일한 제품 간 seam | **동의** | VOC/Finding/Task 테이블 합치기 금지는 유지. |
| C-K4/K5 | FileGateway/ProjectGraph는 adapter, 알림 비채택 | **동의** | 우선순위는 P0가 아니다. |
| C-01~03 | OIDC/Scope/Audit를 platform-owned seam으로 | **부분수용** | seam은 필요. Fastify 구현을 두고 FastAPI/Nest를 동등 후보로 남겨 둔 03을 재평가하지 않은 것이 공백. |

---

## 4. 근거 있는 반론

### C1. 라우터 뒤 codec은 단일값 중복·반복 집합·미등록 키를 보장하지 못한다

**원본:** A1은 `validateSearch`를 codec의 thin adapter로 두고, 실패 모드에 “duplicate set을 dedupe함”, “unsupported key를 삭제함”을 적는다 (`01` A1).

**계약 [사실]:** `docs/06` §6.1.

- 집합 키는 반복 쿼리 `equipmentIds=A&equipmentIds=B`. 유효 ID 중복은 **제거하고** 정규 URL은 정렬한다.
- 카디널리티 1 키(`scopeId`/`from`/`to`/`v`/`metricId`/`metricVersion`)가 반복되면 **같은 값이어도 형식 오류**.
- 미등록 키는 URL에 **남기되** 조회조건으로 쓰지 않는다.
- 공개 계약 산출물 형식은 OpenAPI/JSON Schema/codegen이 **Candidate**.

**도구 [사실]:**

- TanStack Router는 기본이 JSON-first search다. 배열은 `includeCategories=%5B%22electronics%22...`처럼 JSON 인코딩되며, 문서는 `URLSearchParams`가 고급 상태에 부족하다고 한다. [Search Params](https://tanstack.com/router/latest/docs/framework/react/guide/search-params)
- 공식 검증 가이드는 malformed 값에 `.default()` / `fallback` / `.catch()`를 권하고, “사용자 경험을 중단하지 말라”고 한다. 커스텀 `validateSearch` 예시는 잘못된 page를 1로 채운다. [validate-search-params](https://tanstack.com/router/latest/docs/how-to/validate-search-params)
- FeedbackOps `vocs.tsx`는 `z.object({...}).strict()`로 **unknown query key를 reject**한다. 주석: “reject unknown query keys — prevents link-poisoning”. `products/feedbackops/apps/frontend/src/routes/_authed/vocs.tsx`

**반론:** “Router 위에 codec”은 파서가 이미 (a) 반복 키를 JSON 배열/단일 문자열로 붕괴시키고, (b) 미등록 키를 객체에서 빼거나 `.strict()`로 라우트를 깨며, (c) `.catch()`로 단일값 오류를 채운 뒤에야 codec이 실행되게 한다. 06의 세 불변식 — 중복 단일값 거부, 반복 집합 보존 후 정규화, 미등록 키 보존 — 은 **history.search 원문**에서만 검사할 수 있다. 집합 중복 제거 자체를 실패로 적은 A1은 계약을 거꾸로 읽었다(코디네이터 지적과 일치).

**[추론]** 서버도 같은 산출물로 raw query를 검증해야 한다. 클라이언트만 고치면 봇/공유 링크가 다른 해석을 갖는다.

**놓친 OSS:** 새 TS codec이 아니라 JSON Schema(+Ajv/codegen)가 06 Candidate다. `nuqs`도 기본이 라우터/문자열 파서에 의존하므로 raw-string 게이트를 대체하지 못한다. **[미검증]** 현재 고정 Router 1.170.1이 repeated key를 `string | string[]`로 넘기는지는 이 세션에서 실행하지 않았다. 기본 문서 동작만으로도 계약을 기본값에 맡기면 안 된다는 점은 충분하다.

### C2. 계산 세대와 요청 경쟁을 한 `generation`으로 묶고, staging/pointer를 읽기 일치의 최소 조건으로 승격했다

**원본:** A3 query key = `routeId + canonicalContext + ... + serverGeneration`. B 핵심 2·DP-03: staging에서 만들고 한 트랜잭션으로 current pointer를 갈아끼운 뒤, “요청 초기에 같은 `generationId`를 고정”.

**계약 [사실]:**

- 01: chart/table/CSV가 서로 다른 갱신 세대를 섞지 말 것. `pg_cron`은 정합성 보장이 아니다.
- 05: 폴링 + **서버가 제공하는 완료된 계산 세대**로 캐시 재검증. 원천 watermark ≠ mart 완료.
- 06 §11: Context 변경 중 이전 결과가 새 Context 아래 나타나면 안 된다. 같은 Context refresh는 이전 결과를 유지할 수 있다.

**실패 조건 [추론]:**

| 현상 | 원인 | 최소 대응 | 과잉 |
| --- | --- | --- | --- |
| 위젯 A는 G2, 위젯 B는 G1 | 각 HTTP가 pointer를 따로 capture | 첫 성공 응답의 `calculationGenerationId`를 이후 table/CSV/export가 **필수 인자**로 보냄. 생략 시 서버는 현재 ready만. | 모든 읽기 앞에 pointer 서비스 |
| Context 변경 후 이전 페인트 | 늦은 응답 commit | `requestSeq`/`contextFingerprint` + AbortSignal. **계산 세대와 다른 필드** | query key에 아직 모르는 `serverGeneration` |
| 부분 공개 | mart A만 커밋 | 쓰기 트랜잭션에서 해당 dataset의 ready 포인터만 교체 | 전 플랫폼 단일 포인터 + GC/rollback UI |
| 빌드 중 읽기 | building 행을 current로 노출 | 읽기는 `status=ready`만 | staging 스키마 프레임워크 |
| export가 최신 pointer를 재조회 | async job이 시작 시 ID를 안 고정 | job payload에 generationId + 다운로드 시 **권한 재검증** | artifact 스토리지 + TTL 정책 전부 P0 |

한 요청 안의 Postgres 스냅샷은 그 연결에만 적용된다. **[사실]** 기본 isolation은 `read committed` ([client connection defaults](https://www.postgresql.org/docs/18/runtime-config-client.html)). 세 HTTP가 각각 시작 시 pointer를 읽으면 pointer가 그 사이에 바뀌어 불일치한다. 따라서 “요청 초기 capture”는 **클라이언트 바인딩 또는 배치 엔드포인트**가 없으면 실패한다.

**세 시계를 섞지 말 것 [추론, 코디네이터 후속 반영].**

| 이름(설명용) | 소유 | 하는 일 | 하지 않는 일 |
| --- | --- | --- | --- |
| `requestEpoch` | 브라우저 | Context 변경·경쟁 응답 페인트 차단 | 데이터 의미, 권한 |
| `calculationGenerationId` | 서버 mart 공개 | 그 계산이 쓴 원천/지표 버전의 숫자 | 이후 마스터 정정·ACL 변경을 얼림 |
| `authorizationEpoch` | 매 요청 권한 결정 | enqueue/실행/다운로드 각각 현재 Scope | job에 저장된 허용 스냅샷을 grant로 재사용 |

같은 `calculationGenerationId`라도 **live master 또는 live ACL을 조인하면** 차트/표/CSV가 달라진다. 01이 요구하는 유효구간 마스터는 계산 시점 as-of로 mart에 물질화해야 세대가 숫자를 고정한다. ACL/Scope는 물질화하지 않는다 — 스냅샷은 감사 증거일 뿐 다운로드 권한이 아니다.

**대표 흐름의 최소 read-basis 보존 [추론]:** 현재 ready 세대 1개 + 그것을 참조 중인 in-flight export가 끝나는 동안만 그 행을 유지. 만료는 “참조 0 또는 운영자가 폐기”이지 전 플랫폼 GC 프레임워크가 아니다. 숫자 TTL은 측정 전 가정으로 두지 않는다.

### C3. 자체 큐·자체 권한 엔진·FastAPI 기본값은 이미 있는 완제품/구현을 건너뛴다

**원본:** B DP-06은 언어 전 Postgres job table을 최소 후보이고, pg-boss는 Node 결정 뒤, Temporal은 제외. C는 OpenFGA/OPA/Keycloak만 비교하고 in-process 라이브러리를 빼며, Fastify 존재를 적고도 03의 FastAPI/Nest Open을 재평가하지 않는다.

**존재하는 구현 [사실]:**

- FeedbackOps backend: Fastify 5.2.0, Drizzle 0.38.2, `pg` 8.13.1, `pg-boss` ^12.18.2, `openid-client`, Zod, Pino. `products/feedbackops/apps/backend/package.json`
- 03은 FastAPI를 표의 기본 추천, TS면 Nest를 동등 후보로 적는다. Fastify는 없다.
- 통합 레이아웃은 `products/feedbackops/apps/backend/`를 “기존 Fastify 백엔드”로 명시. `docs/integration/repository-layout.md`

**놓친 OSS [사실, 도입 승인은 아님]:**

| 문제 | 원본 후보 | 빠진 완제품 | 공식 근거 | 왜 과잉이 되는가 |
| --- | --- | --- | --- | --- |
| 재집계/export 큐 | 직접 `SKIP LOCKED` 테이블 | [Graphile Worker](https://worker.graphile.org/docs) (MIT, `SKIP LOCKED`, `job_key` 중복 제거, retry/backoff, crontab) | 공식 intro | lease/DLQ/heartbeat를 플랫폼이 처음부터 소유할 이유 없음. 세대 공개 트랜잭션만 소유 |
| 같은 큐, Node 확정 시 | pg-boss “조건부” | **이미 의존성으로 있는** pg-boss | FeedbackOps package.json | 새 job table은 세 번째 구현 |
| 권한 평가 | 새 `PermissionDecision` | [Casbin](https://github.com/casbin/casbin) Apache-2.0, in-process enforce. 사용자 목록은 관리하지 않음 | Casbin README “does NOT manage users” | OpenFGA는 네트워크 hop+dual-write. 첫 matrix는 CheckService protocol 추출로 충분하고, 정책 파일이 필요해지면 Casbin이 더 싸다 |
| 큰 CSV | 직접 COPY/async | DuckDB postgres scanner / `COPY` to parquet ([postgres extension](https://duckdb.org/docs/stable/extensions/postgres.html)) | 공식 | 지금은 과잉일 수 있으나 “Postgres만 vs ClickHouse” 이분법의 빈 칸이다. **측정 전 도입 금지** |
| URL/API 산출물 | TS `PublicContext` | JSON Schema/OpenAPI (06 Candidate) | 06 §6.1 | 언어 독립. FastAPI를 열어 둔 채 TS artifact를 P0로 두면 이중 계약 |
| 작업 UX 셸 | 직접 MenuManifest+Slots | 해당 없음(맞음). 다만 Grafana/Datadog Context Link는 04가 이미 참고 | 04 | kernel 대체는 금지, 링크 의미 복제는 금지. “BI 전부 Deferred”는 04와 불일치 |

**FastAPI/Nest 재평가 [추론]:** SQL-first면 API는 얇다. Python이 필요한 지점은 “별도 작업 프로세스의 분석”(03)뿐이고, 그 프로세스는 Fastify API와 공존할 수 있다. Nest는 Fastify 위에 올라타는 프레임워크라, 이미 Fastify 제품이 있는 팀에 동등 후보로 올리는 비용이 더 크다. **채택 결정은 여전히 05 Open** — 다만 후보표에서 Fastify를 빼는 것은 부정확하다.

**idempotency [사실+추론]:** DP-06 키 `(dataset, input scope, range, metric version, source version)`은 source *스키마* version과 데이터 revision을 구별하지 않는다. 01의 재계산 트리거(지연 완료, 마스터 소급, 재분류, 지표 정의) 중 스키마 version이 안 바뀌는 항목이 세 개다. 같은 키면 “한 ready generation”이 새 행을 삼킨다. 키에 `sourceWatermark R` 또는 정정 revision/content hash가 있어야 한다(코디네이터 지적과 일치).

---

## 5. 성능·정합성 실패 조건 (원본이 약하게 닫은 것)

실행하지 않았다. 아래는 계약·공식 문서에서 닫아야 할 **실패 조건**이다. 숫자 SLO는 넣지 않는다.

1. **HTTP 취소 ≠ DB 취소.** `SET LOCAL statement_timeout`은 문장 시계다 ([statement_timeout](https://www.postgresql.org/docs/18/runtime-config-client.html)). node-pg Pool은 반납(`release`)이 기본이고, 순수 JS 클라이언트 cancel은 별도 연결의 cancel 메시지/`pg_cancel_backend`가 필요하며, 잘못된 PID는 **다른 쿼리를 끊는다** ([node-pg cancel 논의](https://github.com/brianc/node-postgres/pull/1392)). 타임아웃 후 풀에 바쁜 커넥션이 남으면 동시 사용자 전체가 멈춘다. FeedbackOps backend `src`에서 cancel 심볼은 이 검토에서 찾지 못했다. **[미검증]** 실제 pool 고갈.
2. **권한 변경 후 export 다운로드.** 05 검증 기준에 “권한 변경 후 비노출”이 있다. 실패: enqueue 때 허용 스냅샷을 grant로 저장 → 실행/다운로드에서 재검증하지 않음. 세 시점(enqueue, 실행, 다운로드) 모두 현재 `authorizationEpoch`로 Scope를 본다. 스냅샷은 audit detail이다. 실행 중 revoke면 산출물을 만들지 않고, 다운로드 시 revoke면 바이트를 주지 않는다.
3. **GC vs 진행 중 읽기.** pointer를 G2로 돌린 뒤 G1 row를 지우면, G1을 바인딩한 CSV/차트가 빈 결과 또는 혼합 행을 본다. GC는 “이 ID를 참조하는 job/세션 0” 증거가 필요. 첫 slice에서는 이전 ready 1개만 유지하는 편이 싸다.
4. **`R` 없음 ≠ 조회 금지.** 05: `R`이 없으면 자동 재집계만 보류, `defaultRangeTo`가 독립 유효하면 물질화. DP-05의 “auto publish 중단”은 첫 세대도 못 만드는 해석으로 확대된다. 실패: 파서 watermark 연동 전에 분석 URL이 전부 error.
5. **poll + 계산 세대를 query key에 넣기.** 새 세대가 키를 바꾸면 캐시가 갈라지고, 같은 화면의 차트/표가 다른 키로 따로 fetch한다. 폴링은 “현재 ready id”만 보고, 데이터가 바뀐 뒤에 바인딩을 갱신할지 사용자/정책이 정한다(05 주기 Open).
6. **가상 스크롤을 전체 데이터로 오인** — A4가 이미 적음. 추가 실패: 서버 sort와 클라이언트 sort가 함께 켜져 CSV 순서와 불일치.

---

## 6. 원본 보고서 수정 사항 (원본 파일은 이 dispatch에서 고치지 않음)

| 위치 | 문제 | 수정 방향 |
| --- | --- | --- |
| 01 A1 실패 모드 | 집합 dedupe를 실패로 기술 | 집합 중복 제거는 Decided. 단일값 반복 거부·raw 보존과 분리 |
| 01 A1 제안 | TS `PublicContextV{n}` | JSON Schema/OpenAPI 공유, 언어별 codec 생성. raw query round-trip 테스트 벡터를 산출물로 |
| 01 A3 | `serverGeneration` in query key | `requestSeq`/`contextFingerprint`와 `calculationGenerationId`를 분리. 후자는 응답 필드 + 후속 요청 인자 |
| 01 §3 표 | TanStack Router “유지 후보”만 | “기본 JSON search/fallback은 계약 위반 후보다. `parseSearch`/`stringifySearch` 교체 필수” |
| 01 A8 / 5.4 | BI 전부 Deferred | kernel embed 제외는 유지. 04 Grafana Context Link·00 “view를 SQL로 문서화 후 나중에 BI”는 별 행 |
| 02 DP-03 | pointer 프레임워크 P0 | P0는 generation 컬럼 + ready 공개 트랜잭션 + 응답 바인딩. pointer 테이블/GC/rollback은 P1 조건부 |
| 02 DP-05 | `R` 없음 → auto publish 중단 | 05 문안: 자동 재집계 보류. `defaultRangeTo` 독립 유효. publish와 재집계를 구분 |
| 02 DP-06 | 커스텀 job table 기본, 키에 source version | 후보에 Graphile Worker/pg-boss. 키에 watermark/정정 revision |
| 02 §3.2 | Temporal만 범용 엔진으로 제외 | Graphile Worker를 “최소 Postgres 큐 완제품”으로 한 행 |
| 02 DP-04 | timeout+cancel | pool `release` vs `pg_cancel_backend` vs 연결 destroy를 합격 조건에 명시. 잘못된 PID 금지 |
| 03 §3 | FastAPI/Nest만 언어 후보로 인용 | Fastify 5.2.0 구현 존재를 1등 재평가 후보로 표에 추가. Nest는 Fastify가 기각된 뒤 |
| 03 §3 | OpenFGA/OPA만 | Casbin in-process 행. “지금 도입”이 아니라 “자체 엔진 vs embeddable 라이브러리” 비교 |
| 03 C-02 | 새 adapter 정의 | FeedbackOps `check-service`/`scope-service`의 Decision/ScopeSet **protocol** 추출이 기본, 테이블 복사는 금지 유지 |

---

## 7. 실행 가능한 최소 조합

언어/규모/IdP는 05 Open. 아래는 **그 Open을 닫지 않고** 첫 수직 흐름만 닫는 Candidate다.

1. **Raw URL codec (P0):** `history.search` 원문 → 단일값 중복 오류, 집합 반복 키 수집, 미등록 키 opaque 보존, 집합 정규화(정렬·중복 제거), 공집합 표식, naive `[from,to)`. JSON Schema가 클라이언트·서버 공통. Router는 `parseSearch`에서 이 함수만 호출. Zod `.strict()`/`.catch()` 금지.
2. **한 분석 route + 한 관리 route:** Menu 등록은 `id, route, requiredPermission, supportedContext` 네 필드면 충분. Shell slot 완전체는 반복 확인 후.
3. **조회 계약:** 응답 `outcome` + `assessments[]` + `calculationGenerationId` + `sourceWatermark?` + `calculationBasisTime`. chart와 table이 같은 fingerprint. 두 번째 요청부터 generationId 필수.
4. **쓰기(재집계) 최소:** platform schema mart에 `generation_id`, 마스터 유효구간은 그 세대 as-of로 물질화, 한 트랜잭션으로 ready 표시. 보존은 “현재 ready 1 + in-flight export 참조”. 스케줄은 pg_cron enqueue만. 실행기는 언어 확정 전 기존 pg-boss 또는 얇은 SQL worker — **새 상태기계·전 플랫폼 pointer/GC는 설계하지 말 것**. Graphile Worker는 Node 확정 시 비교 후보(capability는 공식 문서, 이 워크로드 적합성은 미검증).
5. **권한:** OIDC adapter(C-01 흐름) + 요청마다 Scope 재검증. export는 enqueue/실행/다운로드가 각각 현재 권한을 본다. CheckService와 같은 deny-precedence protocol. Casbin/OpenFGA 도입 없음.
6. **프론트 조립:** TanStack Query는 key=`route+canonicalContext+pageFilters` + AbortSignal + commit gate(`contextFingerprint`,`requestSeq`). 계산 세대는 응답에서 읽어 표시/후속 요청에만 사용. Table+Virtual, ECharts는 그 다음 slice. Radix 한 계열.
7. **명시적 비범위:** 알림, Saved View 플랫폼화, FileGateway/ProjectGraph, ClickHouse/Timescale, OTel 전체, WAL drill, Menu plugin SDK, FastAPI 기본 채택.

작은 검증 순서: invalid URL 벡터(단일값 중복, `equipmentIds=A&equipmentIds=B`, 미등록 키 보존, `from>=to`) → 같은 fixture chart/table이 동일 `calculationGenerationId` → Context 변경 중 늦은 응답 비페인트 → revoke 후 동일 export URL forbidden → worker kill 후 중복 ready 없음.

---

## 8. 다른 두 리뷰어에게 묻는 질문

**Q1 → 01(프론트) 담당:** TanStack Router 기본 JSON search를 유지한 채 06의 반복 키·미등록 키 보존을 만족시킬 수 있다고 보는가, 아니면 `parseSearch`/`stringifySearch`를 raw query-string codec으로 **교체하는 것이 P0**라고 보는가? 후자가 아니면 서버와 브라우저가 다른 중복 단일값을 수용하는 실패를 어떻게 막나?

**Q2 → 02(데이터) 담당:** chart/table/CSV 일치 합격에 **current pointer 테이블과 staging/GC**가 왜 필요한가? 첫 응답의 `calculationGenerationId` 바인딩 + 마스터 as-of 물질화 + in-flight export만 이전 ready를 붙잡는 최소 read-basis로 부족한 반례를 한 개만 대라. live ACL 조인이나 다운로드 재검증은 권한 시계이지 계산 세대 프레임워크가 아니다.

**Q3 → 03(재사용) 담당:** Fastify+pg-boss+CheckService가 고정 커밋에 있는데, 플랫폼이 FastAPI 또는 Nest를 고를 **계약상 이유**(언어 취향 제외)는 무엇인가? 없다면 03의 “Postgres native 권한”과 02의 “커스텀 job table”을 FeedbackOps protocol + Graphile Worker/pg-boss 재평가보다 우선한 근거를 밝혀 달라.

---

## 9. 문서 반영표

지금은 권고만. 공식 문서 수정은 별도 결정.

| 문서 | 반영할 문안(초안) | 지금 결정? | 미룰 것 |
| --- | --- | --- | --- |
| `docs/06` §6.1 | “클라이언트 라우터와 서버는 **원문 query string**을 같은 JSON Schema로 소비한다. 라우터 기본 JSON search·unknown strip·singleton first/last는 계약 위반.” 집합 중복 제거 vs 단일값 반복 오류를 인접 문장으로 재강조 | **예** — Decided와 충돌하는 구현 오독을 막기. 필드명/codegen은 Candidate 유지 | OpenAPI vs JSON Schema 파일 위치 |
| `docs/06` §11 / query lifecycle | `requestSeq`/`contextFingerprint`(페인트 게이트) ≠ `calculationGenerationId`(데이터 세대). 후자는 응답·후속 요청 필드 | **예** 용어 분리 | 폴링 주기 |
| `docs/06` §17 | export는 enqueue·실행·다운로드 각각 현재 Scope. 권한 스냅샷은 audit이지 grant가 아님 | **예** 05 검증 기준과 맞추기 | artifact TTL 숫자 |
| `docs/04` | Router를 “codec 소비자. 기본 parse/fallback 사용 금지”로 격하. Fastify를 백엔드 후보와 교차 참조 | 선택 시 | 라이브러리 버전 고정 |
| `docs/03` | 언어 후보표에 Fastify(구현 존재)를 Nest보다 앞에 적고, 작업 실행기에 Graphile Worker/pg-boss/직접 SQL을 동등 후보로. FastAPI는 Python worker가 필요할 때의 API가 아니라 worker 쪽 후보 | **예** 후보 수정. 채택은 Open | 팀 언어 |
| `docs/01` §3 | “혼합 세대 금지” 다음에 “읽기 바인딩은 클라이언트가 받은 generation id. 쓰기 공개는 한 트랜잭션. 이 둘이 같은 프레임워크일 필요 없음” | **예** | staging 물리 모델 |
| `docs/05` | Open에 유지: 언어, 큐 제품, IdP, H 숫자, volume. DP-05와 충돌하지 않게 “R 없음 = 자동 재집계 보류, 조회/defaultRangeTo와 독립”을 한 줄 더 명시 | **부분** 재강조만 | SLO, CH/Timescale |
| `docs/00` exclusion | 외부 BI 제외 유지. “mart/view SQL 문서화 후 나중에 붙인다”는 유지하고 01 A8이 이를 덮어쓰지 못하게 05에 한 줄 | 유지 | embed 보안 POC |
| FeedbackOps 소스 / 06 본문 확정 구현 | 이 라운드에서 수정하지 않음 | 금지 | — |

확정 계약을 바꾸자는 제안은 **용어 분리와 구현 금지 목록**뿐이다. URL 반복 키·wall-clock·Scope 비증명·혼합 세대 금지는 유지. 변경 비용은 문서 문장 수준이고 재결정은 “산출물 형식 JSON Schema 확정”과 “Fastify를 언어 후보에 올릴지” 두 개면 충분하다.

---

## 10. 검증 한계

- 플랫폼 root runtime/migration/test 없음 (`docs/INDEX.md`). 성능·동시성·CJK·AT·IdP·parser dump는 미실행.
- TanStack Router 1.170.1의 repeated-key 실제 파싱, node-pg 8.13.1 cancel, pg-boss 12 vs Graphile Worker 운영 특성은 공식 문서/소스 읽기만. **[미검증]**
- Casbin Apache-2.0·Graphile Worker MIT 표시는 공식 저장소/문서 스냅샷이다. 법률 검토·이 워크로드 적합성·운영 난이도는 **미검증**. 라이선스 문자열은 도입 승인이 아니다. DuckDB postgres scanner는 capability 참고만.
- FileGateway/ProjectGraph/parser는 03이 읽은 커밋을 재실행하지 않았고, 로컬 dirty 트리는 건드리지 않았다.
- 하위 에이전트·install·server·commit/push·공식 문서 수정 없음.
