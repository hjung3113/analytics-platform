# Astra R1 — 플랫폼 계약·최소 아키텍처·근거 독립 검토

작성: 2026-09-22. 상태: **검토·권고이며 채택/구현 승인이 아님**. 다른 리뷰어의 R1은 읽지 않았다. BRIEF와 Luna 원본 [A](../01-kernel-frontend.md), [B](../02-data-performance-operations.md), [C](../03-reuse-security-integration.md)를 검토했다. 도중 코디네이터가 제시한 A1 중복, DP-05 R 부재, DP-06 멱등 키 논점은 현재 계약과 직접 대조했다.

표기: **[사실]** 현재 파일/공식 자료에서 확인, **[추론]** 그 근거에서 도출한 설계 판단, **[미검증]** 실행·운영 또는 별도 원본 확인을 하지 않은 사항. 근거 경로는 별도 표시가 없으면 저장소 루트 기준이다. 로컬 기준점은 root `e999c997a4282e9b88b6fb3df36c6212b8adf2e4`, FeedbackOps `b5dd614ac8da3792cb1627e7daeffb8fc9c4944e`로 직접 확인했다.

## 1. 핵심 권고 — 5개

1. **AR-1: URL 계약은 채택하되 A1의 구현 안내를 수정한다.** 단일값 중복 거부와 집합 중복 제거를 구분하고, raw query의 카디널리티/문자열 의미가 라우터 파싱 전에 보존되도록 한다. 스키마 artifact의 공동 소비는 이미 Decided지만 TypeScript/codegen 방식은 Candidate다. Menu Registry는 코드 내부 선언으로 충분하다.
2. **AR-2: 브라우저 요청 식별자와 서버 결과 세대를 분리한다.** 첫 분석 흐름에는 하나의 검증된 결과 세트와 chart/table/CSV가 공유하는 명시적 결과 식별자가 필요하다. 모든 dataset을 한 공개 포인터에 묶는 범용 staging 체계는 필수가 아니다. 다중 mart 원자 공개가 실제로 필요한 일관성 단위에서만 확장한다.
3. **AR-3: FeedbackOps는 독립 유지하면서 얇은 adapter와 선별 UI 재사용을 우선한다.** Fastify를 실제 코드가 있는 TypeScript 백엔드 후보로 올려 FastAPI/Nest와 비교한다. 인증·권한·Audit 전체를 공통 패키지로 추출하는 것은 보류한다. Entity Link는 관계 이력 경계이지 모든 제품 읽기/쓰기의 유일한 API가 아니다.
4. **AR-4: PostgreSQL+실행기 경로는 지지하되 자작 큐를 최소라고 단정하지 않는다.** 취소 후 DB 정리, 재시도와 정정 revision 구분, 세대 폐기·export 다운로드 재인가를 첫 비동기 기능의 필수 acceptance로 둔다. H/TTL/timeout/성능 수치는 Open을 유지한다.
5. **AR-5: TanStack/Radix/ECharts는 비용이 낮아 보이는 검증 후보이며 성능·접근성 통과 증거는 아니다.** URL·권한·결과 일치 계약부터 확인하고 표/차트 공통 추상화는 실제 반복 범위만 승격한다. BI/admin/IdP/정책/OLAP 완제품은 부분 역할로 비교하며 Kernel의 소유권을 넘기지 않는다.

## 2. 동의·반대 표

| 원본 주장 | 입장 | 이유 및 수정 방향 |
| --- | --- | --- |
| A1 공개 codec / A2 내부 registry | 동의, 명세 보정 | 06 §5/§6.1에 이미 공동 artifact와 코드 내 선언이 있다. A1의 집합 중복 실패 판단은 계약과 반대다. AR-F1/F2 참조. |
| A3 query key/취소/commit gate | 부분 동의 | 요청 경쟁과 계산 세대는 별개다. 새 범용 store/coordinator를 먼저 만들 필요는 없다. 권한 변경과 사용자 전환의 캐시 수명도 포함해야 한다. |
| A4/A5 headless table + chart adapter | 조건부 동의 | 서버 계산·fallback·Data Trust 책임은 맞다. 첫 화면부터 범용 Table/Chart API 전체를 확정하지 않는다. 06 §14의 승격 규칙 유지. |
| A6 Radix 계열 우선 | 동의, 채택 미확정 | 현재 제품 자산이 있어 비교 시작점으로 합리적이다. 제품 wrapper의 의존성/토큰을 검토한 뒤 선정한다. |
| A8 BI를 Kernel 대체에서 제외 | 동의 | 단, 별도 BI 요구까지 영구 제외하는 판단과 구별한다. Admin 완제품 비교는 원본에 사실상 비어 있다. |
| B DP-03 전역 generation manifest/pointer P0 | 부분 반대 | 혼합 세대 금지는 Decided이나 전역 포인터·모든 staging mart·rollback 보존 정책은 구현 후보다. 단일 결과 세트부터 시작할 수 있다. |
| B DP-04 조회 경계/비동기 export | 동의, 누락 보강 | 생성 시 권한 snapshot만으로 나중 다운로드를 허용할 수 없다. cancel 이후 rollback/풀 반환과 세대 GC 경쟁이 필요하다. |
| B DP-05 R 부재 시 auto publish 중단 | 반대 | 05는 자동 재집계만 보류한다. 첫 세대·명시적 정정·독립 유효한 기본 기간까지 금지하는 것은 확대 해석이다. |
| B DP-06 자작 job table 기본값 | 부분 반대 | lease/retry/DLQ/cancel 복구를 직접 만들면 작은 도구 수와 작은 유지 비용이 달라진다. Node 선택 시 기존 pg-boss 선례도 같은 출발선에서 비교한다. |
| C 인증/Scope/Audit pattern 재사용 | 동의, 근거 강도 보정 | 제품 스키마를 독립 유지하는 방향은 맞다. Tx-only라는 이름만으로 실제 transaction 원자성이 증명되지 않는다. |
| C Entity Link가 유일한 읽기/쓰기 seam | 반대 | 관계 이력과 approved domain command는 다르다. 현재 provider도 제품 DB/type에 묶여 있어 범용 플랫폼 API가 아니다. |
| C 알림/저장 뷰·evidence adapter 후순위 | 동의 | 요구를 확인한 뒤 선택한다. 정적 lineage hash가 runtime completeness를 뜻하지 않는 구분은 유지한다. |

## 3. 근거 있는 반론 및 원본 정정

### AR-F1 — 높음: 집합 중복 거부와 지표 쌍 일괄 거부는 현행 계약을 좁힌다

**대상:** A §2.1/A1의 “duplicate rejection”, “duplicate set을 dedupe함” 실패 모드, one-sided metric pair 검증 및 C §2.1의 포괄적 duplicate/불완전 pair 표현.

**[사실]** `docs/06_platform_ui_contract.md:214–229`는 반복 키를 집합 표현으로 사용하고, 유효한 집합 ID 중복은 제거하며, 단일값 키 반복만 같은 값이어도 거부한다. 지표 ID만 있는 경우도 초기화를 선언한 진입점에서 서버 게시 버전을 URL에 물질화할 수 있다. 버전만 있는 경우 목적지 경로가 소유 ID를 유일하게 정의하면 쌍을 완성한다.

**반례:** `equipmentIds=A&equipmentIds=A`를 400으로 만드는 A1 구현은 정상 입력을 거부한다. 반대로 `scopeId=S&scopeId=S`를 집합처럼 합치면 오류 입력이 성공한다. `/metric/M?metricVersion=7`도 경로 계약이 허용한 물질화라면 무조건 오류로 취급해서는 안 된다.

**정정:** “등록된 키의 카디널리티에 따라 판정한다. 집합 중복은 정규화하고 단일값 반복은 오류다. 지표 쌍 미완성은 §6.1의 명시적 초기화/경로 소유 예외만 적용한다.” 계약 재결정 없이 원본 조사만 바로잡을 수 있다.

### AR-F2 — 높음: validateSearch를 codec 호출부로 두는 설명만으로 wire 계약을 지킬 수 없다

**대상:** A1/A §5.2의 route validation 중심 경로.

**[사실]** 직접 확인한 공식 upstream `searchParams.ts`는 `defaultParseSearch = parseSearchWith(JSON.parse)`이며 decode 뒤 문자열의 JSON 해석을 시도한다. `qss.ts`는 숫자/boolean 변환과 반복 키 배열화를 하고 encoder는 키마다 `set`한다. 따라서 “TanStack은 반복 키를 언제나 잃는다”는 주장도 틀리지만 **원래 문자열·키 반복 표현이 제품 계약 그대로 남는다**고 가정할 수도 없다. [공식 searchParams 소스](https://raw.githubusercontent.com/TanStack/router/main/packages/router-core/src/searchParams.ts), [공식 qss 소스](https://raw.githubusercontent.com/TanStack/router/main/packages/router-core/src/qss.ts). 확인 대상은 upstream main이며 로컬 고정 1.170.1의 구현을 실행 검증한 것은 아니다.

**[추론]** raw query를 잃은 다음 객체 스키마만 검사하면 등록되지 않은 JSON 유사 문자열/반복 표현을 정규화 과정에서 바꿀 수 있다. 배열을 기본 JSON 방식으로 출력하는 경로는 §6.1의 반복 키 wire 형식과 맞지 않는다.

**정정:** 공개 codec의 입력은 raw query 또는 순서를 보존하는 key/value 다중 목록으로 정의한다. (1) 디코드 및 등록 키 카디널리티 확인, (2) 문자열 의미 검증, (3) 집합 정규화, (4) 등록 전역/페이지 소유/미등록 분류를 수행한 뒤 라우터의 custom parse/stringify 경계로 연결한다. 서버도 프레임워크의 first/last-value 축약 이전에 동일 규칙을 적용한다. 특정 라이브러리의 custom hook 구현은 채택 버전에서 재검증한다.

미등록 키는 **현재 URL**에 보존하며 검증된 query에는 넣지 않는다. 메뉴 전환 때는 등록 전역 Context만 전달한다(`06:266–268`). 모든 미등록 값을 모든 메뉴로 전파하거나 모든 query key에 넣는 것도 오답이다. 최소 fixture: 단일값 동일/상이 중복, 집합 반복/공집합 충돌, 문자열 `123`/`true`/JSON 유사 ID, 미지원 등록 Context 왕복, 미등록 키 현재 URL 유지와 메뉴 전환 미전달.

### AR-F3 — 높음: 세대 ID가 세 출력에 적혔다고 같은 읽기 집합이 되지는 않는다

**대상:** A3 `serverGeneration`과 `requestGeneration`, B DP-03의 “요청 초기에 pointer capture”.

**[사실]** `06` §11/§19는 새 Context 아래 이전 결과 표시를 금지하고, `01`의 mart 재계산 절은 여러 mart/차트/표/CSV의 혼합 세대를 금지한다. `03` 재현성 절은 URL 재방문 때 같은 숫자를 보장하지 않는다. 이 세 요구는 서로 다르다.

**반례:** chart 요청은 G1을 capture하고 table 요청 전에 G2가 공개되면, 각 요청 내부에서는 하나의 ready 세대만 읽어도 화면은 G1/G2가 섞인다. 각 응답의 “한 세대만 사용” 검증만으로 B의 전체 합격 조건을 증명할 수 없다. Context A→B→A 전환에서 첫 A 응답과 두 번째 A 요청의 fingerprint가 같은 경우도 단순 Context 비교만으로 요청 경쟁을 모두 설명하지 못한다.

**권고:** 브라우저 `requestEpoch`(로컬 경쟁/paint 소유)와 서버 `resultRevision`(완료된 계산 결과 식별, 이름 Candidate)을 분리한다. 분석 세션/첫 응답에서 얻은 revision을 표 페이지·차트·CSV에 명시적으로 전달하고, 서버가 반환한 revision/조건을 확인한다. 권한은 각 요청에서 현재 상태로 다시 판정한다. 캐시 격리를 위한 authorization epoch/권한 revision은 이 둘과도 별개이며, epoch 값 자체를 접근 허가 증명으로 쓰지 않는다. 서버 revision의 문자열/숫자 크기를 최신 순서로 추정하지 않는다. rollback으로 이전 결과를 재공개할 때도 새 publication 사건과 결과 revision을 구분해야 단조 증가 가정에 갇히지 않는다.

**추가 읽기 기준:** 같은 revision의 mart라도 조회 시 변경 가능한 master를 다시 join하면 숫자·분류가 바뀔 수 있다. 결과 revision은 계산에 사용한 master/분류/metric revision까지 고정하거나 그 값을 결과에 물질화해야 한다. ACL은 과거 snapshot으로 고정하지 않고 현재 권한을 재확인한다. 권한 변경으로 이전 결과 범위를 더는 허용할 수 없다면 전체 요청을 거절하거나 명시적으로 새로운 허용 범위의 결과를 만들며, 같은 비교 결과인 것처럼 조용히 축소하지 않는다.

**최소성:** 최초 한 계산 결과에서 차트·표·CSV를 파생하면 하나의 버전 붙은 결과 세트로 충분할 수 있다. 다중 mart build가 실제로 필요할 때 manifest/pointer를 해당 dataset/metric 일관성 단위에 추가한다. 서버의 같은 DB snapshot은 한 transaction 내부 비교를 도울 수 있으나 독립 HTTP 요청과 뒤늦은 CSV 재현을 자동 보장하지 않는다. PostgreSQL 공식 문서는 Read Committed의 명령별 snapshot과 Repeatable Read의 transaction snapshot을 구분한다. [격리 수준](https://www.postgresql.org/docs/current/transaction-iso.html)

**[사실/추론 구분]** `REFRESH MATERIALIZED VIEW`가 단일 MV 대상이며 unique index 등의 concurrent 조건이 있다는 것은 사실이다. 거기서 “여러 MV는 어떤 transaction 구성으로도 함께 공개 불가” 또는 “반드시 범용 staging 프레임워크 필요”를 도출하면 과장이다. 원본의 “자동으로 공통 세대를 제공하지 않는다” 수준으로 한정하고, 선택한 publication/reader 격리 방식은 별도 검증한다. [REFRESH 공식 문서](https://www.postgresql.org/docs/current/sql-refreshmaterializedview.html)

### AR-F4 — 높음: R 부재를 모든 공개 중단으로 확장하면 bootstrap이 막힌다

**대상:** B DP-05 및 §5.4의 R missing → auto publish 중단 문구.

**[사실]** `05` 지연 완료 절은 “R이 없으면 자동 재집계만 보류하며 지연완료 식별·후보 보존은 계속”이라고 정한다. `06:256`은 R이 없어도 독립적으로 유효한 `defaultRangeTo`는 자동 물질화할 수 있게 한다. 마스터 소급·재분류·지표 변경은 R/H 자동 창과 다른 trigger다.

**반례:** 첫 generation 생성 전 R 제공이 중단돼도 이미 검증 가능한 제한 데이터로 수동 초기 계산을 만들 수 있는지를 별도 판정해야 한다. R 부재만으로 조회/기본 기간/모든 publish를 막으면 현행 계약보다 강한 전면 중단이다.

**정정:** “R/H가 불충족이면 해당 자동 지연완료 재집계를 시작하지 않고 후보를 보존한다. 초기 계산·명시적 backfill·별도 정정 trigger와 결과 공개는 각 입력/시간역/권한/검증 근거로 따로 판정한다.” R을 임의 now로 만들거나 completeness를 주장하는 것은 계속 금지한다. 모든 publication을 R 필수로 바꾸려면 `05`/`06` 재결정과 bootstrap 비용 설명이 필요하다.

### AR-F5 — 높음: 멱등 키는 같은 작업의 재시도와 새로운 정정을 구별해야 한다

**대상:** B DP-06 `(dataset, input scope, range, metric version, source version)` 및 DP-05 “duplicate run이 같은 generation/result”.

**[사실]** `01`은 source 구조·parser logic·분석 계약·지표 정의 버전을 구분하고 마스터 소급·재분류도 재계산 trigger로 둔다. DP-06의 source version이 이 변경 사건 전체를 유일하게 식별한다는 정의는 없다.

**반례/추론:** schema/parser version이 그대로인 채 새 late row 또는 마스터 정정이 들어오면 동일 키가 이전 성공 작업과 충돌해 필요한 재계산을 억제할 수 있다. 반대로 retry마다 새 키를 만들면 실패 복구가 중복 공개로 바뀐다.

**정정:** 작업 종류와 검증된 input revision/정정 사건 식별자를 포함하고, 동일 논리 작업의 retry는 같은 키를 유지한다. 물리 attempt ID와 공개 결과 revision은 별개다. source 진행 경계만으로 과거 마스터 정정을 식별할 수 있다고 가정하지 않는다. claim lease가 만료된 구 worker는 fencing/CAS 같은 검증 경계로 publish 권한을 잃어야 한다. 구현 방식은 Candidate이며 lock/lease만 있다는 것으로 보장했다고 쓰지 않는다.

### AR-F6 — 높음: Audit의 Tx 인자는 현재 타입으로 transaction-only가 아니다

**대상:** C §2.2 “Tx 없는 public write를 제공하지 않는다”, C-03의 강한 구현 확신; B의 transaction 전달 선례 해석.

**[사실]** `products/feedbackops/apps/backend/src/modules/core/audit/audit-service.ts`의 `record(tx: Tx, input)`은 event/detail을 검증하고 `tx.insert(auditLog)`를 호출한다. 그러나 `apps/backend/src/db/tx.ts` 마지막 선언은 **`export type Tx = Db | DrizzleTx`**다. `createDb`의 `Db`는 pool에 연결된 Drizzle handle이다. 따라서 “인자를 받는다”와 “pool handle을 타입이 거부한다”는 같은 사실이 아니다. backend AGENTS의 transaction-only 의도와 현재 alias 사이에도 간극이 있다.

**정정:** “same-Tx 설계와 전달 패턴을 확인했다. 현재 Tx union 자체는 실제 transaction handle만을 강제하지 않으므로 각 호출부의 transaction 참여와 rollback 검증이 필요하다.” 이번에는 모든 호출부를 검증하지 않았으므로 실제 orphan audit 버그가 있다고 단정하지 않는다. 직접 추출보다 seam/negative test 설계를 재사용하며 FeedbackOps 소스/ADR를 이 dispatch에서 바꾸지 않는다.

### AR-F7 — 중간: Entity Link를 유일한 제품 API로 승격하면 도메인 명령이 사라진다

**대상:** C 핵심 권고 3, C-04의 플랫폼 registry/원자적 link mutation.

**[사실]** `products/feedbackops/AGENTS.md`는 제품 상태를 각 모듈이 소유하고 approved application command를 호출하게 한다. `apps/backend/src/modules/entity-links/service.ts`의 `EntityLinkProvider`는 내부 interface이며 `Db`, 제품 entity enum, `TaskReporterSummary`, 역할 enum과 여러 domain repository에 결합돼 있다. 이것은 배포 경계를 넘는 완성된 protocol이 아니다. `docs/integration/repository-layout.md`도 단일 서버/DB/배포를 확정하지 않았다.

**정정:** Entity Link는 관계 registry/가시성/이력 seam, Context Link는 URL 전달 seam, 도메인 query/command는 소유 제품의 API로 나눈다. 같은 DB 트랜잭션일 때만 link+변경+audit 원자성을 직접 요구할 수 있다. 독립 배포의 경우 원격 제품 command와 플랫폼 link가 원자적으로 commit된다고 주장하지 말고, 필요해질 때 idempotent command/outbox 또는 보상·복구 상태를 별도 설계한다. 단순 외부 링크 연동 단계에서 분산 transaction을 먼저 만들지 않는다.

## 4. 가장 작은 실행 가능한 조합과 확대 조건

이 절은 후속 착수 시 사용할 **Candidate 검증 순서**이며 이번 실행 지시가 아니다.

### 4.1 첫 수직 흐름

`내부 MenuManifest → raw URL codec → 인증된 actor + 현재 Scope 재검증 → 하나의 SQL-first 분석 결과 revision → 표/차트/CSV → Context Link`

- 등록 artifact에는 `06` §5의 메뉴 ID/group/route/권한·Scope/supported Context/page archetype/선택 기능을 포함한다. A2의 필드 예시는 page archetype·선택 기능·필요 Scope가 빠져 있으므로 완료된 최소 schema라고 하지 않는다. callback/plugin SDK, remote manifest, registry 관리 UI는 추가하지 않는다.
- 공개 URL 필드·카디널리티·버전·테스트 벡터를 하나의 authority로 두고 client/server가 소비한다. 모든 공개 계약을 순수 TypeScript에서 생성해야 한다는 요구는 두지 않는다. Python/C# 선택 시 언어 중립 artifact 또는 공통 conformance vector가 더 적합할 수 있다.
- React/TS + TanStack Router/Query + 선별 Radix wrapper를 우선 비교한다. `main.tsx`의 현재 제품은 `createRouter({ routeTree })`, Query retry policy를 사용하고 API client는 signal을 fetch에 넘긴다. 이 사실은 public codec·DB 취소·플랫폼 권한 캐시가 완성됐다는 뜻이 아니다.
- 첫 화면에는 TanStack Table 후보와 하나의 ECharts 렌더 adapter를 적용할 수 있다. Virtual은 실제 행 규모·focus 요구를 확인해 추가한다. ChartFrame의 trust/summary 책임을 정하되 특정 옵션/모든 차트 종류를 감추는 범용 DSL은 만들지 않는다. 32px 최소 행 및 25px compact 시각 목표는 `DESIGN.md:729–731`을 유지한다.
- 백엔드는 **Fastify+SQL-first**를 TypeScript 후보의 비교 기준으로 추가한다. 실제 `apps/backend/src/server.ts:114`의 `buildServer`와 Fastify 5.2.0 manifest가 근거다. FastAPI는 Python 운영/분석 팀 사유가 있을 때, Nest는 별도 구조/운영 편익이 기존 Fastify 패턴보다 클 때 비교한다. 기존 코드 존재만으로 언어 선택이나 제품 서버 흡수를 확정하지 않는다.
- PostgreSQL 하나에서 parser read-only 소비와 platform schema를 분리하고, 한 metric/결과 세트의 grain·시간역·version·outcome/assessments부터 검증한다. async 요구가 생기면 Node일 경우 pg-boss와 작은 job table을 **복구 비용 포함** 비교한다. 언어 미정이라는 이유만으로 자작 queue 구현을 선행시키지 않는다.

### 4.2 필수 실패 시나리오 — 숫자는 모두 미정

| 경계 | 최소 acceptance / 실패 조건 |
| --- | --- |
| 요청 경쟁/캐시 | Context A→B 및 A→B→A, 동일 Context refresh, logout/다른 actor 로그인, 권한 회수 뒤 캐시 재사용을 검증. 범용 store 복제 없이 Query의 key/observer 수명으로 만족하면 별도 request coordinator는 생략. 필요한 외부 side effect만 epoch guard. 서버 revision pin과는 별개. |
| 취소/DB 풀 | browser abort는 최선 노력 transport 신호다. 서버 소유 query/job에만 취소를 연결하고 DB timeout을 별도로 둔다. transaction 오류 후 rollback 완료 또는 연결 폐기 후 풀 반환, 늦은 cancel이 재사용 연결의 다음 쿼리를 죽이지 않음, 정상 요청에서 timeout 설정 누수 없음까지 확인. |
| 공개/세대 폐기 | building/failed 결과는 읽히지 않음. 진행 중 read/export가 참조하는 revision을 GC하지 않음. 폐기된 revision 요청은 명시적으로 만료/재계산 요구를 내고 최신으로 조용히 대체하지 않음. 보유 lease/reference 정책 및 TTL 값은 결정 필요. |
| export 다운로드 | enqueue의 actor/Scope 기록은 감사 근거일 뿐 현재 권한 증명 아님. enqueue/실제 실행/다운로드에 현재 권한·대상·컬럼 재확인. 첫 다운로드는 서버 인증 경로로 제공하는 후보가 단순함. 일단 발급한 직접 object URL의 회수 가능성은 storage별 검증 전 주장하지 않음. 이미 전달한 바이트를 회수한다는 보장도 하지 않음. |
| retry/rollback | 같은 작업 재시도는 중복 publish 없음. 새 정정 revision은 재계산 가능. lease 만료 구 worker publish 차단. rollback 대상 데이터/계약이 아직 유효하고 남아 있는지 확인하며 현재 ACL을 함께 되돌리지 않음. |
| 계산 동등성 | chart downsample과 table raw row를 바이트 동일로 비교하지 않음. 동일 조건/revision/metric 정의로부터 파생한 값·단위·기간·coverage가 일치해야 함. CSV의 정렬/선택 컬럼 의미도 고정. |

[공식 TanStack Query v5 취소 문서](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation)는 signal 소비와 미사용 query의 기본 동작을 구분한다. [node-postgres transaction 문서](https://node-postgres.com/features/transactions)는 한 transaction에서 동일 client를 사용하고 rollback/release하는 경로를 설명한다. [Pool API](https://node-postgres.com/apis/pool)는 client 반환/폐기 API를 제공한다. [PostgreSQL timeout 문서](https://www.postgresql.org/docs/current/runtime-config-client.html)는 statement/lock timeout을 구분한다. 위 표의 종단 간 취소·재인가·GC 보장은 이 기능 목록에서 자동 도출되는 사실이 아니라 **구현·실패 검증이 필요한 제안**이다.

### 4.3 재사용·대체 경계

| 영역 | 우선 방식 | 확대/교체 조건 및 미검증 |
| --- | --- | --- |
| FeedbackOps UI | 제품 의존성 없는 primitive wrapper만 선별 source 재사용 후보 | AppFrame/NAV_TREE/업무 화면 통째 추출은 보류. 플랫폼 tokens/slots/권한 의미와 동일 acceptance를 통과해야 함. |
| 인증 | 기존 OIDC flow의 protocol adapter/실패 벡터 참고 | 제품 session 테이블·Workspace·role은 독립 유지. SSO 공급자/조직 매핑 전 플랫폼 공통 인증 패키지로 이동하지 않음. |
| 권한/Audit | platform contract를 작게 정의하고 제품 owner adapter 연결 | Tx 타입만으로 원자성을 주장하지 않음. 두 실제 소비자와 동일 의미가 확인된 구현만 추출 후보. |
| BI | 외부 BI 필요 시 별도 context/권한 adapter 비교 | Superset/Metabase를 Kernel 대체에서 제외하는 방향은 지지. 최신 edition/guest security/license 주장은 이번 R1에서 재검증하지 않았으므로 원본 조사 근거 수준. |
| Admin 완제품 | 범용 CRUD가 확정될 경우 React-admin/Refine 같은 범주를 비교 목록에 추가 | 원본은 BI와 admin을 함께 제목에 썼지만 admin 비교 근거가 부족함. 현재 capability/license/플랫폼 적합성은 미확인으로 두며 도입 권고하지 않음. |
| IdP/정책 | corporate IdP 우선 여부 확인, app Scope는 별도 | Keycloak은 IdP 운영 필요, OpenFGA/OPA는 관계/정책 복잡도와 운영 편익을 실제로 확인할 때. 최신 기능·가격 검증 없이 우열 단정 안 함. |
| OLAP | PostgreSQL query/mart/workload 검증부터 | Timescale→ClickHouse를 필수 단계 순서로 만들지 않음. 시계열/rollup 병목과 broad scan/CDC 운영 요구에 따라 별도 분기. 라이브러리 존재는 성능 증거가 아님. |
| FileGateway/ProjectGraph | 수요가 생기면 server-to-server/정적 artifact adapter | 원본의 timeDomain/권한/정적 lineage 한계 구분은 타당. 이 R1에서는 두 외부 로컬 repo 원본을 다시 읽지 않았으므로 실제 구현 적합성은 미검증. |

## 5. 원본 보고서 수정 목록

공식 계약/원본 보고서는 이번에 수정하지 않았다. 다음은 후속 편집 요청이다.

| 위치 | 구체 수정 |
| --- | --- |
| A1 / A §2.1 / C §2.1 | AR-F1 문안으로 단일값·집합·metric 초기화 예외 분리. “중복 전부 거부” 요약 삭제. |
| A1 / A §5.2 | raw 다중 값 → codec → router custom parse/stringify → route validation 순서와 서버 parity fixture 추가. 공개 artifact 공동 소비는 기존 Decided, codegen은 Candidate로 표시. |
| A2 | 06 §5의 page archetype, optional capabilities, required Scope를 manifest 개념 정보에 연결. 필드 타입을 제품 계약으로 확정하지 않음. |
| A3 / B DP-03 | 브라우저 epoch와 서버 revision 분리, 최초 결과 pin/후속 요청 전달, 권한 캐시 수명 추가. 전역 포인터 P0 단정 제거. |
| A5 | “brush가 URL 없이 화면만 바꿈” 실패 조건을 “명시적 Apply 후 URL 없이 전역 조회가 바뀜”으로 좁힘. 로컬 brush 자체는 06 §6.1이 허용. |
| A7 / B DP-07 | `statusSource` 및 적용 assessment kind의 빠짐없는 1회 선언, unknown reason 요구를 명시. generation/watermark를 무조건 assessment kind로 추가하지 말고 provenance와 구분. |
| B DP-05 / §5.4 | R 부재 시 자동 지연완료 재집계만 보류. bootstrap/명시적 정정/기본 기간을 별도 판정. |
| B DP-06 | input revision/정정 ID, retry attempt 분리 및 lease fencing 보강. 자작 queue가 기본적으로 더 작다는 결론을 조건부로 수정. |
| B DP-04/08 | 취소 후 rollback/연결 반환, export 다운로드 재인가, GC read/export 참조 보호, 만료와 rollback 조건 추가. |
| C §2.2/C-03 | Tx union을 명시하여 same-Tx의 의도/호출 관례/실행 증거를 구분. 플랫폼 논의 때문에 제품 ADR-0008을 자동 수정한다는 제안 제거. |
| C 권고 3/C-04 | Entity Link/Context Link/domain command 세 책임을 분리. 동일 DB 보장과 독립 배포 가정을 섞지 않음. |
| A/B/C 로컬 인용 | 원본은 번호 없는 docs/01·03·05에 §2/§3/§6 등을 사용한다. 실제 절 제목과 경로 또는 행으로 교체. Query 취소 링크도 v4에서 확인한 v5 문서로 갱신. |

## 6. 공식 문서 반영표 — 제안 문안과 결정 게이트

아래 문장은 채택 후 반영할 **초안**이다. 같은 내용을 모든 문서에 복제하지 않는다. `06`은 전역 의미, `01`은 데이터 근거, `03/04`는 구현 후보, `05`는 상태, `07`은 Shell 소비, `DESIGN`은 시각 규격을 소유한다.

| 소유 문서·위치 | 구체 반영 초안 | 현재 상태 / 재결정·비용 |
| --- | --- | --- |
| `06` §6.1/§6.4 | “공개 URL 검증은 라우터·서버 query parser의 축약/자동 형변환으로 카디널리티와 문자열 의미가 소실되기 전에 수행한다. 집합 중복 제거와 단일값 중복 오류는 동일 conformance vector로 검증한다.” | 기존 Decided의 구현 판정 기준 보강 후보. 의미 변경 없음. 도구 API는 여기 넣지 않음. |
| `06` §5 | “메뉴 선언은 필요한 Scope, 페이지 유형, 선택 기능과 지원 Context를 제공하며 page-owned 키는 공개 schema 등록을 따른다.” | 현행 의미 재확인; 기존 표로 충분하면 추가 문장 없이 연구 문서에서 참조. |
| `06` §11/§18 | “클라이언트 요청 경쟁 식별자와 서버 완료 결과 revision을 구분한다. 함께 비교하는 차트·표·내보내기는 같은 결과 revision을 사용하며 만료 시 최신으로 묵시 대체하지 않는다.” | revision 이름·보유 수명·최초 pin 절차는 Candidate. URL 영구 숫자 재현 계약으로 확대하지 않음. |
| `06` §17/§19 | “비동기 export 생성 당시 권한 기록은 다운로드 권한을 대신하지 않는다. 다운로드 시 현재 권한을 재검증하고 권한 변경 뒤 보호 결과 캐시를 재사용하지 않는다.” | per-request 원칙 구체화 후보. 이미 다운로드된 데이터 회수/실시간 취소 보장까지 확정하지 않음. |
| `01` mart 재계산 절 | “공개 일관성 단위를 dataset/metric 결과 세트로 명시한다. ready 결과 식별과 관련 읽기 고정은 필수이며 staging/pointer/GC 구현은 mart 수와 재빌드/보존 요구에 따라 선택한다.” | 설계 후보. 전역 프레임워크 도입 승인 아님. 영속 revision 보관을 채택하면 저장·GC 운영 비용 있음. |
| `01` 재계산 trigger 절 | “동일 논리 작업 retry와 새 원천/마스터 정정 revision을 구분한다. R/H 자동 창 밖의 별도 trigger를 같은 dedupe 키로 억제하지 않는다.” | 기존 trigger 의미 보강. source revision 제공자는 Open. |
| `03` 기술 스택 표 | “TypeScript 후보에 FeedbackOps의 실제 Fastify+pg/Drizzle 선례를 포함한다. FastAPI/Nest/ASP.NET 선택은 팀·배포·작업 실행 및 기존 코드 재사용 비용으로 비교한다.” | Candidate 추가. 기존 언어 Open 유지, 서버 통합 결정 아님. |
| `03` SQL-first 역할 뒤 | “요청별 timeout/cancel 뒤 transaction 종료와 pool 반환·폐기를 검증한다. 큰 export는 결과 revision/소유자를 기록하고 다운로드에서 현재 권한을 확인한다.” | 실행 recipe 후보. timeout/TTL 숫자는 05 Open. |
| `04` 후보표/차트 절 | “TanStack/Radix/ECharts는 URL conformance, CJK·keyboard/focus, 결과 parity와 대표 workload를 통과한 범위에서 채택한다. 공통 frame 소유와 library option API를 분리한다.” | Candidate 유지. benchmark 전 성능 우열 없음. admin 제품은 별도 조사 공백으로 연결. |
| `05` 결정 상태/Open | “공개 의미와 혼합 세대 금지는 Decided다. runtime 선택, 결과 revision pin·보유/폐기, download revocation 경계, input revision source, queue 선택과 운영 수치는 Open/Candidate다.” | 기존 Decided를 재개방하지 않음. 범용 pointer/분산 outbox/BI/OLAP는 요구 전 Deferred. |
| `integration/repository-ideas.md` | “직접 재사용은 제품 독립 primitive부터 검토한다. 인증·권한·Audit·관계 이력은 adapter 계약과 호출 증거를 대조하며, FeedbackOps 내부 타입/테이블을 플랫폼 계약으로 승격하지 않는다.” | Candidate. 실제 추출에는 두 소비자·버전 관리·회귀 검증 비용 필요. |
| `07` Screen Specification / `DESIGN` 상태·표 token | “Shell은 06의 registry/Context/권한 상태를 소비한다.” / 기존 row/focus/token을 사용 | backend schema·큐·세대 표를 이 문서에 넣지 않음. 새 시각 변경은 이번 논의에서 요구하지 않음. |

**지금 합의할 것:** 계약 오류 정정, raw codec의 authority, 세대 두 종류와 pin 범위, domain/API 소유권, 보안·복구 acceptance. **실제 요구까지 미룰 것:** 전역 pointer framework, 장기 snapshot/영구 재현, remote plugin, 공통 annotation editor, notifications/saved view 구현, 외부 정책/IdP 운영·OLAP 도입. **숫자 결정 전 필요한 입력:** 대표 volume/concurrency, 늦은 정정 빈도, 권한 회수 요구, export 크기·보유 수명, 배포/운영 담당자와 RPO/RTO.

## 7. 다른 두 리뷰어에게 묻는 질문 — 3개

다른 R1의 내용을 아직 읽지 않았으므로 실제 주장에 동의했다고 쓰지 않는다. R2에서 아래를 각 상대의 주장 ID에 연결해 답변받고 싶다.

1. **리뷰어 B — 데이터·운영 관점:** AR-F3의 단일 결과 revision+명시적 pin으로 시작하면 부족해지는 가장 작은 실제 시나리오는 무엇인가? multi-mart 전체 pointer가 필요한지, 동일 transaction/단일 결과 세트로 충분한지 실패 순서와 읽기 계약으로 반박해 달라.
2. **리뷰어 C — 보안·통합 관점:** AR-F6/AR-F7의 `Tx = Db | DrizzleTx` 및 제품 결합 provider를 감안할 때, 직접 추출이 adapter보다 적은 변경으로 같은 원자성·권한 의미를 증명할 수 있는 구체 경계는 어디인가? export 생성→권한 회수→다운로드도 그 경계에서 설명 가능한가?
3. **두 리뷰어 공통:** AR-1/AR-4의 URL conformance·revision·복구 계약 중 지금 첫 slice에서 제외해도 되는 것은 무엇이며 그 제외를 허용하는 06의 조항은 무엇인가? 반대로 생략할 수 없는 운영 비용이 있다면 자작 queue/Fastify 재사용/BI 대체 각각에서 어떤 증거로 비교해야 하는가?

리뷰어 B/C는 상대 인명이 제공되기 전의 질문 수신 역할 표기이며 Luna 원본 담당 B/C와 R2 상대가 동일하다고 가정하지 않는다.

## 8. 검증 범위와 한계

- BRIEF, 세 원본 조사, AGENTS/INDEX, 관련 00~07·DESIGN·integration을 대조했고 인용한 FeedbackOps 소스의 실제 symbol/type을 읽었다. 외부 기술 반론은 공개 공식 TanStack/PostgreSQL/node-postgres 문서·소스로 직접 확인했다. 사설 코드/데이터는 웹 요청에 전송하지 않았다.
- TanStack upstream main은 현재 참고이며 FeedbackOps 고정 버전의 동일 동작 증명이 아니다. 공식 자료의 capability는 현장 성능/보안/접근성 통과 증거가 아니다. BI/정책/IdP의 최신 edition/license와 FileGateway/ProjectGraph 원본은 이번 R1에서 독립 재검증하지 않았다.
- install/server/test/DB/benchmark/migration/commit/push를 수행하지 않았다. 제시한 시나리오는 미실행 acceptance 제안이다. 따라서 플랫폼 구현 완료, live IdP/권한 연동, 취소 성공, same-Tx 동작, PostgreSQL 처리량을 주장하지 않는다.
- 최종 상태 확인에서 `docs/INDEX.md` 변경도 보였으나 이 worker가 작성한 변경은 아니며 보존했다. 서브모듈 작업 트리는 깨끗했고 `git diff --check`에서 오류가 없었다.
- 작성 파일은 `docs/research/platform-build-2026-09-22/discussion/astra-r1.md` 하나다. 공식 계약·원본 조사·서브모듈은 수정하지 않았다. R2와 문서 반영은 후속 dispatch/별도 결정의 작업이다.
