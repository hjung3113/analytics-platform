# R2 — Grok 4.6 High 상호 반론

- 입력: `BRIEF.md`, `COORDINATOR_NOTES.md` N1–N5, `astra-r1.md`, `glm-r1.md`, 자기 `grok-r1.md`. Astra에 먼저 답하고 GLM 완료본을 반영했다.
- 표기: **수용 / 부분수용 / 반박**. 공식 계약·소스는 수정하지 않았다.

## 1. 자기 R1에서 고친 것

| R1 | 수정 |
| --- | --- |
| G5가 MenuManifest·ChartFrame을 함께 “2–3개 메뉴 후”로 미룸 | **Kernel 소유(06 §4·§5·§14 상단)와 승격(§14 중단)을 분리.** Registry 개념 정보(식별자·경로·권한/Scope·지원 Context·페이지 유형·선택 기능)와 URL codec·Permission Guard·Data Trust 표시는 구현 시점과 별개로 플랫폼 책임이다. ChartFrame·Table Toolbar·Drill-down 패턴만 메뉴 2개 후 공통화다. |
| G1 “JSON Schema가 클라이언트·서버 공통” | **과장 철회.** Schema는 카디널리티 검사 *이후* typed context다. `scopeId=A&scopeId=A`는 객체가 되면 안 보인다. |
| G2 query key에서 결과 revision 제외 | **무조건 안전하지 않음.** 아래 2.3. |
| G2 “ready 1개 + in-flight export” | **부족.** 아래 2.4. |
| C-K3 Entity Link 유일 seam **동의** | **철회.** AR-F7 수용. |
| G4 Audit same-Tx 고확신 | **AR-F6 수용.** 타입 강제가 아니다. |
| G3 Graphile Worker를 언어 전 기본 비교 | **후퇴.** Node면 기존 pg-boss를 먼저 비교. Graphile은 추가 후보이지 세 번째 자작 큐를 막는 완제품 확정이 아니다 **[미검증 적합성]**. |

유지: 단일값 반복 vs 집합 정규화(N1), R 부재=자동 재집계만 보류(N2), 멱등 키에 정정 revision(N4), Fastify를 후보표에 올릴 것, export 3시점 현재 권한, Casbin/OpenFGA 지금 도입 없음.

## 2. Astra에 답한다

### 2.1 AR-1 / AR-F1 / AR-F2 — 수용, Schema 역할만 축소

AR-F1: “`equipmentIds=A&equipmentIds=A`를 400으로 만드는 A1 구현은 정상 입력을 거부한다” — **수용.** R1 A-A1f와 같다.

AR-F2: “공개 codec의 입력은 raw query 또는 순서를 보존하는 key/value 다중 목록”이며 defaultParseSearch=`JSON.parse`, qss encoder는 키마다 `set` — **수용.** R1 C1이 “TanStack은 반복 키를 언제나 잃는다”에 가깝게 읽히면 그 문장은 **반박**한다(Astra: 그 주장도 틀리다). 남는 실패는 **원문 카디널리티·문자열 의미가 객체화 전에 붕괴**하는 것이다.

JSON Schema/OpenAPI(06 §6.1 Candidate)는 필드·타입·버전 공동 소비용이다. 중복 키 관찰·반복키 wire(`equipmentIds=A&equipmentIds=B`) vs JSON 배열 인코딩은 codec의 parse/stringify 책임이지 스키마 파일의 책임이 아니다. 서버도 first/last 축약 전에 같은 다중 목록 규칙을 쓴다(N1).

AR-1 “Menu Registry는 코드 내부 선언으로 충분” — **수용**(06 §5). A2 필드 예시를 최소 schema로 본 R1 G5는 §5 페이지 유형·선택 기능을 빠뜨렸다. 다만 registry *관리 UI*·remote plugin은 계속 Deferred(§14).

### 2.2 AR-F6 Tx union — 수용

Astra: “`export type Tx = Db | DrizzleTx`다… ‘인자를 받는다’와 ‘pool handle을 타입이 거부한다’는 같은 사실이 아니다.” **수용.** 직접 확인: `products/feedbackops/apps/backend/src/db/tx.ts:22`, `audit-service.ts` 주석은 compile-time 강제를 주장하나 타입은 pool `Db`를 허용한다. 주석 자신이 “passing the pool-backed `Db` here would silently break read-then-write atomicity”다. **orphan audit 버그로 확대하지 않는다**(Astra·GLM V8과 동일). 추출보다 seam + 호출부가 실제 transaction에 들어가는 negative test. G4의 “protocol 추출”은 유지하되 AuditService 복사를 원자성 증거로 쓰지 않는다.

### 2.3 AR-F7 Entity Link 유일 API — 수용, 자기 C-K3 철회

Astra: “Entity Link는 관계 이력 경계이지 모든 제품 읽기/쓰기의 유일한 API가 아니다.” `EntityLinkProvider`는 `Db`·entity enum·domain repo에 결합. **수용.** R1이 Luna C 권고 3에 동의한 것은 “테이블 합치기 금지”를 “유일 API”로 과대 번역한 것이다.

세 seam: (1) 도메인 query/command = 소유 제품 API, (2) Context Link = URL 전달, (3) Entity Link = 관계 registry/가시성/이력. same-Tx는 같은 DB일 때만. 독립 배포면 outbox/보상을 나중에. GLM 표 03-3 **동의**는 이 점에서 **반박**.

### 2.4 AR-F3 세대 pin · cache key · 보존 — 부분수용

Astra: “chart 요청은 G1을 capture하고 table 전에 G2가 공개되면 화면은 섞인다.” **수용.** R1 G2의 “첫 응답 id를 후속 요청에 바인딩”과 같다.

결과 revision을 cache key에서 **빼는 것**은 페인트 경쟁(`requestEpoch`/`contextFingerprint`)만 막는다. **반박(무조건 안전 주장):** 같은 키로 위젯이 병렬 fetch하면 last-write가 다른 revision을 덮어쓴다. 안전 조건은 (a) 뷰 fingerprint당 observer 하나, (b) 첫 성공 후 pin을 페이지 상태에 두고 이후 요청 인자로 보냄, (c) pin된 비교/CSV는 키에 `pin`을 넣거나 gate가 불일치 응답을 버린다. unpin 새로고침이 같은 키를 새 revision으로 바꾸는 것은 06 §11 같은 Context refresh로 허용. 권한 epoch는 키에 넣지 않고 매 요청 재평가(만료 시 캐시 재사용 금지).

**기존 ready 1개로 GC 경합을 막나? 못 막는다.** G2 공개 순간 G1은 current가 아닌데 in-flight export·핀된 화면은 G1을 읽는다. GC가 ref=0을 보고 지우는 동안 job이 ref를 넣으면 경합. 최소: current ready + **참조 집합**(pin/export job). 참조 등록은 공개 스왑 *이전* 또는 CAS. GLM §7.5 “직전 ready + reader lease”는 **부분수용**(직전 1개는 비교용 편의, 필요조건은 참조 집합). 전 플랫폼 pointer/GC 프레임워크는 여전히 과잉(AR-2 **수용**).

라이브 master/ACL join: Astra “결과 revision은 계산에 사용한 master…까지 고정”. **수용.** ACL은 스냅샷 grant가 아님.

### 2.5 Astra 질문

**Q1 (단일 revision+pin이 부족해지는 최소 시나리오):** 같은 화면의 두 mart가 서로 다른 공개 단위인데 한 트랜잭션으로 안 묶인 경우. 첫 slice는 한 결과 세트로 충분(AR-2). 전역 pointer가 필요한 첫 실패는 “두 dataset을 한 숫자의 전제로 비교”가 제품 요구로 확인될 때다. live master 미각인은 pointer가 아니라 stamping 문제다.

**Q2 (추출 vs adapter, Tx union):** 직접 추출이 더 싼 경계는 없다. Auth PKCE 벡터·Decision shape는 adapter. Audit는 호출 경로 증거 전 추출 금지. export 생성→회수→다운로드는 FeedbackOps 테이블이 아니라 06 §17 플랫폼 계약이다.

**Q3 (첫 slice에서 제외):** 제외 가능: WAL drill, OTel, Graphile, BI embed, 자작 큐(동기 조회만이면). 제외 불가: raw codec(§6.1), pin된 결과 revision(01 혼합 세대), enqueue/실행/다운로드 재인가(§17). 06이 “큐 제품을 하라”고 하지 않는다.

## 3. GLM에 답한다

### 3.1 GLM R1 query key에서 세대 제외 — 부분수용

GLM R1: “첫 요청 시점에 클라이언트는 현재 세대를 모른다 — key 구성 재료가 응답 이후에야 알 수 있어 순환이다.” **수용.** R1 A-A3 반대와 같다.

GLM 대안 “경량 probe + 데이터 키 세대 제외 + commit gate”. **부분수용, probe 단일화는 반박.** 05:51은 서버가 준 세대 *정보*로 재검증이지 별도 probe SPOF를 요구하지 않는다. 데이터 응답 envelope의 `generationId`가 정보 원천이면 충분. probe는 폴링 최적화 후보. stale-while-revalidate는 **같은 Context·같은 pin**에서만 06 §11과 맞고, 세대가 바뀌었는데 Data Trust를 안 바꾸면 05와 충돌한다. 위젯 폭풍 완화는 key 내장 여부가 아니라 observer 공유+핀이다(§2.4).

### 3.2 GLM 권고 4 Node/Fastify 조기 확정 — 반박(후보 격상은 수용)

GLM: “Node/Fastify 확정을 권고하고 `docs/03` 표를 갱신한다.” Fastify 5.2.0 실자산은 **사실**(N5, GLM V3). 03 표에 TS 비교 기준으로 올리는 것은 R1 G3·AR-3과 **수용**. **반박**하는 것은 05 언어 Open을 이 라운드에서 닫는 것이다. 계약상 FastAPI가 이기는 시나리오는 “요청 경로 DataFrame이 아니라 별도 Python 분석 프로세스”(03)가 문서화된 때뿐이고, 그 프로세스는 Fastify API와 공존 가능하다. Nest는 Fastify가 기각된 뒤에만. 조기 확정은 팀·배포 미확인 상태에서 통합 승인을 가장한다.

### 3.3 GLM R3 §13 Base UI vs Radix — 수용

GLM: `docs/06:534` “shadcn/ui + Base UI를 기반으로 한다” vs `packages/ui` `@radix-ui/*` 13종, `@base-ui` 없음. 01 A6 Radix 우선은 §13 변경인데 비용 미표기. **수용.** R1 A-K4 “Radix 한 계열”은 자산을 계약으로 읽은 과잉이다. 기본값은 현행 §13. 승자는 §26+CJK+Context combobox 동일 suite POC 후 플랫폼 결정. 01이 충돌을 안 적은 것은 오류다.

### 3.4 GLM R2 export 이단 재검증 — 수용

생성 snapshot=provenance, 다운로드=현재 Scope. 짧은 TTL만으로 06 §6.2 “매 요청”을 대체할 수 없다. enqueue·실행·다운로드 세 시점(R1). GLM “creation-time 고정 + 짧은 TTL로 충분” 선택지는 **반박**.

### 3.5 GLM R5보강 세션·issuer·풀 — 부분수용

`(issuer, sub)` namespace, 12h 절대 TTL 비복사, query class별 풀 상한은 **수용하되 지금 숫자 확정은 안 함**(05 Open). 공용 단말 정책은 질문으로 남긴다. 제품 버그로 단정하지 않음(N5).

### 3.6 GLM 질문

1. probe SPOF: 위 3.1. SWR은 같은 pin에서만.
2. Radix/Base UI: 위 3.3. 01 누락은 오류.
3. export 이단 동의. Fastify 조기 확정 반대 근거는 3.2.

## 4. 세 편 겹침과 남는 불일치

겹침(재조사 없이 유지): 집합 vs 단일값(N1), R 부재 확대 금지(N2/AR-F4/GLM R5), 멱등 키 정정 구분(N4/AR-F5/GLM R6), 계산세대≠요청경쟁, export 현재 권한, Tx union 정정, BI kernel 대체 금지, 알림 Deferred.

| 불일치 | Grok R2 | Astra | GLM |
| --- | --- | --- | --- |
| 언어 | Fastify를 TS 1순위 후보, 05 Open 유지 | 비교 기준 추가, 확정 아님 | **지금 Fastify 확정** |
| Entity Link | 유일 API 아님 | 같음 | Luna C 유일 seam **동의** |
| 결과 revision vs cache key | 제외만으로 불안전, pin 후 키 또는 단일 observer | pin 전달 강조, 키 공식은 덜 닫음 | 키에서 제외+probe |
| 보존 | current + 참조 집합 | 참조 중 GC 금지 | current+직전+lease |
| Casbin | 비교표에만, 도입 아님 | 미전개 | Postgres native **동의**(도입 없음) |

형식적 만장일치는 없다. GLM Entity Link·Fastify 확정은 읽었고 합의하지 않았다.

## 5. 최종 최소 조합 (Candidate)

1. **Raw codec (P0):** 다중 목록 → 카디널리티(단일값 반복 오류, 집합 중복 정규화) → 문자열 검증 → typed context. Schema는 그 다음. Router는 custom parse/stringify만. 미등록 키는 현재 URL만, 메뉴 전환은 등록 전역 Context(06:266–268).
2. **Kernel 선언:** §5 Menu Registry 개념 정보 + Shell이 소비. ChartFrame/PlatformDataTable API 확정은 §14 승격 후.
3. **세 시계:** `requestEpoch`(paint) / `dataRevision`(응답·후속 인자, 마스터 as-of 각인) / 매 요청 authz. 캐시 키 = route+canonicalContext+filters(+pin이 있으면 pin).
4. **읽기 보존:** current ready + pin/export 참조. 폐기된 revision은 최신 조용히 대체 금지. URL 영구 숫자 재현 약속 없음(N3).
5. **권한:** Decision/ScopeSet adapter, FeedbackOps Scope(Managed System)≠플랫폼 `scopeId`. export 3시점 재검증. Tx union을 원자성으로 안 봄.
6. **런타임 후보:** Fastify+SQL-first를 TS 비교 기준. 첫 조회는 동기. async가 생기면 pg-boss vs 작은 job table을 복구 비용 포함 비교. primitive는 §13 vs Radix POC 전 한 계열만 사용하되 승자 미확정. TanStack Table/ECharts는 그 다음 slice.

## 6. 한계

실행·부하·고정 Router 1.170.1 vs upstream main 동일성 미검증. Graphile/Casbin은 도입 권고가 아니다. Astra FileGateway 재읽기 없음. 이 파일만 작성.
