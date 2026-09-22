# R1 — GLM 독립 입장문 (OMP zai/glm-5.3 Max)

- 검토일: 2026-09-22 (Asia/Seoul)
- 검토자: OMP zai/glm-5.3. 사용자 지정 역할은 "zai/glm-5.3 Max"다. 세션 환경변수에는 thinking/max 설정이 노출되지 않아(printenv 확인) "Max" 적용 여부는 세션에서 증거를 확보하지 못했다 **[미검증]**. 모델 지정 자체는 워크스테이션 메타데이터로 확인했다 **[사실]**.
- 대상: `docs/research/platform-build-2026-09-22/01-kernel-frontend.md`, `02-data-performance-operations.md`, `03-reuse-security-integration.md` (이하 01/02/03).
- 초점: FeedbackOps 재사용 경계, 권한/인증/감사/export, 운영 실행 가능성 중심으로 전 영역 검토.
- 검증 방법: BRIEF가 허용한 범위에서 로컬 대조만 수행했다. 계약 문서(docs/00~07, 05/06 전문·주요 절), FeedbackOps 고정 커밋 `b5dd614` 코드·package.json·모듈 목록, `docs/integration/repository-layout.md`, FileGateway 로컬 문서를 읽었다. 웹 출처 재확인, 설치, 서버·테스트·DB 실행은 하지 않았다. 다른 리뷰어의 R1은 읽지 않았다(BRIEF R2 절차 준수).
- 소유 산출물: 이 파일 하나만 작성했다.

## 0. 요약 결론

1. 세 보고서의 저장소 인용은 대체로 정확하다. 내가 대조한 인용(HEAD/서브모듈 pin, 의존성 버전, 모듈 부재, 권한·감사·세션 코드, NAV_TREE, FileGateway 시간 해석, 문서 계약 문구)에서 사실 오류는 1건(집합 중복 실패 모드, §5 R4), Decided 계약과의 불일치 2건(DP-05 R미존재 확대, A6 §13 충돌 미표기), 설계 갭 3건(쿼리 키 세대 내장, export 다운로드 재검증, 멱등 키 정정 구분)이다.
2. 최우선 수정은 프론트의 "query key에 세대 내장"(01 A3)과 export의 "다운로드 시점 권한 재검증 누락"(02 DP-04)이다. 둘 다 첫 수직 슬라이스가 잘못 굳어지는 지점이라 P0 반영이 필요하다.
3. 세대 프레임워크는 코디네이터 요청대로 "대표 흐름에 필요한 최소 read-basis 규칙"으로 줄였다(§7.5). 전체 manifest/GC/rollback 프레임워크는 최소안이 증명된 뒤 확장한다.
4. 백엔드 언어는 Fastify+Drizzle+pg-boss라는 검증된 실구현 자산 존재를 근거로 Node/Fastify 조기 확정을 권고한다(docs/03 FastAPI 기본 추천은 "지표 DSL/Python 분석 요구가 실제로 생길 때"로 재평가). 논거는 §2 권고 4.

## 1. 검증 결과 — 원본 주장 대 저장소 사실

| # | 원본 주장 (위치) | 대조 근거 | 판정 |
|---|---|---|---|
| V1 | root `e999c997…`, submodule `b5dd614…` (01 §2.2, 02 §7.1, 03 §2.1) | `git rev-parse HEAD`, `git submodule status` | **사실 일치** |
| V2 | 프론트 고정 버전: router 1.170.1, query 5.62.7, React 19.0.0, Zod 3.25.67, Zustand 5.0.2, Tailwind 3.4.17 (01 §2.2) | `apps/frontend/package.json` | **사실 일치** |
| V3 | 백엔드: Fastify 5.2.0, Drizzle 0.38.2, pg 8.13.1, pg-boss ^12.18.2, Pino 9.5.0, openid-client ^6.8.8 (02 §2.2, 03 §3) | `apps/backend/package.json` | **사실 일치** |
| V4 | ECharts·AG Grid·TanStack Table/Virtual·Base UI·React Aria 미포함 (01 §2.2) | `apps/frontend/package.json` 전체 dep | **사실 일치** |
| V5 | 알림/inbox 구현·테이블 부재 `[U]` (03 C-05) | `apps/backend/src/modules/` 17개 모듈 목록에 notification/inbox 없음 | **사실 일치** |
| V6 | 권한: explicit deny 우선, grant attribution, requestable (03 §2.2) | `permissions/check-service.ts:10-27` 체크 순서 주석 및 `Decision` 타입 | **사실 일치** |
| V7 | Scope: workspace-wide grant − scoped deny (03 §2.2) | `permissions/scope-service.ts:30-46` — 단, 차원이 **Managed System 집합**이다(§5 R6 관련) | **사실, 해석 보강 필요** |
| V8 | Audit: Tx-only 공개 API, same-Tx insert (03 §2.2) | `core/audit/audit-service.ts:4-14,38` — 다만 `db/tx.ts:22`의 `Tx = Db \| DrizzleTx`라 **pool 전달이 타입상 가능**. "컴파일 타임 강제"는 관례+리뷰 보장이지 타입 보장이 아니다. 제품 버그로 확대하지 않는다(호출 관례가 same-Tx를 지키는지 별도 실행 확인 필요) | **사실, 과장 정정** |
| V9 | 세션: 12시간 opaque random, atomic load-and-touch/revoke (03 §2.2) | `auth/session-service.ts:46-47,196-203,236-261` — `expires_at = 발급+12h` **절대 만료**(touch는 만료 연장 아님, `last_seen_at`만 갱신) | **사실, 절대/슬라이딩 구분 필요(§5 R5보강)** |
| V10 | `fops_app` DML 전용·부팅 가드 (03 §2.2) | `db/runtime-role.ts:3-21` | **사실 일치** |
| V11 | `NAV_TREE` 하드코드, label/href/icon/countKey (01 §2.2) | `routes/_authed.tsx:12-45` | **사실 일치** |
| V12 | API client `AbortSignal` 전달 선례 (01 §2.2) | `lib/api/client.ts:21` 및 전 모듈 `signal` 옵션 | **사실 일치** |
| V13 | FileGateway offsetless 값을 `Asia/Seoul`로 해석 (03 C-06) | `FileGateway/docs/05-api-interface.md:135` | **사실 일치** — docs/06 §6.3 naive wall-clock/TZ-미확인 계약과의 충돌 지적도 타당 |
| V14 | docs/06 계약 인용: URL 비권한·매 요청 재검증, half-open naive, 단일값 중복=형식오류, 미지원 Context 보존, `outcome\|assessments[]` 2층 (01/02/03 각처) | `docs/06_platform_ui_contract.md` §§6.1–6.4(204-272), §17(703-735), §18-19(739-821), §21-22(855-908) | **사실 일치** |
| V15 | docs/05 Decided: 폴링+세대 기반 캐시 재검증, 같은 인스턴스·read-only·플랫폼 스키마, `[R-H,R)`·R 없으면 자동 재집계만 보류 (02 §2.1) | `docs/05:51,55,59-61` | **사실 일치** — 단 02 본문이 이를 준수하지 않는다(§5 R5) |
| V16 | docs/06이 primitive 기반으로 "shadcn/ui + Base UI" 명시 (01은 미인용) | `docs/06:534` | **원본 누락** — 01 A6 권고와 충돌(§5 R3) |
| V17 | UI 패키지가 Radix 계열 (01 §2.2) | `packages/ui/package.json:22-34` `@radix-ui/*` 13종, `@base-ui` 없음 | **사실 일치** |

집합 키 정규화 근거: `docs/06:216` "유효 ID 1개 이상이면 선택 집합이며 **중복은 제거하고**"(Decided). 단일값 중복만 `docs/06:218` 형식 오류다. — §5 R4의 근거.

## 2. 핵심 권고 (5)

1. **첫 수직 슬라이스 P0를 4계약+1검증으로 고정한다.** PublicContext codec(+test vector), MenuManifest+Shell slot, PermissionDecision/ScopeSet seam, 응답 envelope(`outcome`+`assessments[]`+`generationId`+`statusSource`). 검증은 한 분석 메뉴에서 같은 fixture의 chart·표·CSV 일치(01 §5.2 흐름 수용)로 한다. 이는 `docs/05` Deferred Phase 1–2 가설과 충돌하지 않는 범위의 최소다.
2. **세대 전달은 "정보 기반 캐시 재검증"이지 캐리시 키 내장이 아니다.** 클라이언트 데이터 쿼리 키는 `routeId+canonicalContext+pageFilters+metricPair`로 하고, 경량 current-generation probe(폴링 대상)와 응답 envelope의 `generationId`를 commit gate에서 비교한다(§5 R1). 01 A3의 `serverGeneration` 키 포함은 철회 수정.
3. **Export는 이단(二段) 권한 계약으로 소유한다.** 생성 시 scope/generation snapshot은 provenance로 기록하고, **다운로드 요청마다 현재 ScopeSet을 재검증**한다. artifact TTL, 생성/다운로드/거부 감사 이벤트, 취소 시 잡·쿼리 종료를 함께 계약화한다(§5 R2). 권한 snapshot을 authorization으로 쓰지 않는다는 코디네이터 방향과 일치.
4. **FeedbackOps 재사용에 3가지 경계를 추가하고, 백엔드 언어를 조기 확정한다.** (a) 권한 의미는 이식하되 차원은 재정의: FeedbackOps `Scope`는 Managed System 집합(`scope-service.ts:22`)이고, 플랫폼은 `scopeId`(사이트→공장→라인, `docs/06` §6.2 Open)다. Decision/ScopeSet shape만 가져가고 매핑 계약을 새로 만든다. (b) 세션 정책은 플랫폼 소유: 12h 절대 TTL 상수 복사 금지, 공용 단말 idle/max lifetime/revoke 전파를 결정 항목으로 추가. (c) 신원 namespace를 `(issuer, sub)` 조합으로 미리 정의한다(§5 R5보강). 언어는 Fastify 자산(01 §2.2가 아닌 02 §2.2의 실구현: tx 관례, same-Tx 감사, runtime-role 가드, job table 패턴) 재사용 비용이 가장 낮다. FastAPI 우위(지표 DSL·Python 분석)는 그 요구가 문서화될 때까지 가설이므로 **Node/Fastify 확정을 권고**하고 `docs/03` 표를 갱신한다. NestJS는 Fastify 대비 신규 학습·이중 프레임 비용만 추가된다.
5. **UI primitive 계열은 POC로 결정하고 승자를 docs/06 §13에 일원화한다.** 현재 계약(§13 "shadcn/ui + Base UI")과 실자산(Radix wrapper)이 충돌한다. Radix 우선 채택은 §13 계약 변경이므로 동일 acceptance suite(§26 접근성·CJK·필수 조합 범위) 비교 후 문서를 고친다(AGENTS.md: 개별 변경이 공통 계약과 충돌하면 플랫폼 레벨 결정).

## 3. BRIEF 논점별 입장 (요약)

| 논점 | 입장 |
|---|---|
| 1. codec/Registry 수준, 라우터 파싱 전 보장 | codec+Registry는 Platform 필수(P0). 중복 단일값 거부·반복 집합 정규화·미등록 보존은 codec 계약 자체에 포함되고 라우터는 thin adapter다. 단 "집합 dedupe"는 Decided 정규화이므로 실패 모드에서 빼야 한다(§5 R4). |
| 2. 세대 오해, 최소 계약 vs staging/pointer 과잉 | 브라우저 requestEpoch와 서버 generation은 다른 축이다. 최소안: 응답 envelope 세대+current pointer 단일 트랜잭션+reader 1회 capture(§7.5). manifest 전체 필드·GC·rollback 프레임워크는 P1+ 확장. |
| 3. FeedbackOps 추출/adapter/독립, FastAPI/Nest 재평가 | "protocol/decision/event shape 복제, 코드·스키마·역어휘 비복사"(03) 지지. Fastify 실구현 자산을 근거로 Node/Fastify 조기 확정 권고(§2 권고 4). |
| 4. PostgreSQL+작업실행기 한계, 취소/TTL/권한변경-export/rollback | 02의 경계(timeout/cancel/COPY/async job) 수용하되 (a) export 다운로드 재검증 추가, (b) query class별 커넥션 풀·동시성 상한 계약 추가(§5 R2, §6). |
| 5. TanStack/Radix/ECharts 근거, BI 완제품 대체 | TanStack 계열·ECharts POC 유지. Radix는 §13 충돌 해소 후(§5 R3). BI 완제품 kernel 대체 불가 판정(01 §3 표)에 동의. |
| 6. 지금 결정 vs 미룰 것 | 지금: 언어(Node/Fastify 권고), issuer namespace, 세션 정책 질문 등록, export 이단 재검증 문안. 미룰 것: polling 주기 숫자, primitive 승자(POC 후), saved view·위젯 프레임워크, OLAP 분기(DP-09 게이트 유지). |

## 4. 동의/반대 표 — 원본 핵심 권고 15건

| 원본 권고 | 입장 | 비고 |
|---|---|---|
| 01-1 codec·Registry를 Kernel 계약으로 선행 | **동의** | R4(집합 중복)만 수정 |
| 01-2 TanStack 흐름을 출발점으로, 제품 코드 비복사 | **동의** | |
| 01-3 Table+Virtual, ECharts adapter POC | **동의** | chart/table parity 검증이 선행 조건 |
| 01-4 primitive 한 계열, Radix+checked-in 우선 | **조건부 동의** | docs/06 §13(Base UI 기반)과 충돌 → POC 후 계약 일원화(§5 R3) |
| 01-5 fallback/자동 retry/guest 권한 오인을 blocker로 | **동의** | |
| 02-1 작은 PostgreSQL 시작, read-only·호환 view | **동의** | 풀·동시성 상한 계약 보강 필요(§6) |
| 02-2 계산 완료 세대를 단일 공개 포인터로 | **동의(축소)** | 최소 read-basis안 우선, 전체 프레임은 P1+(§7.5) |
| 02-3 watermark와 계산 완료 분리, 시간 의미 보존 | **동의** | |
| 02-4 조회·작업 경계(timeout/cancel/COPY/async) | **조건부 동의** | export 다운로드 재검증 누락(§5 R2) |
| 02-5 운영 증거를 계약의 일부로 | **동의** | |
| 03-1 인증 흐름 adapter 재사용, 테이블/Workspace 비복사 | **동의** | 세션 정책·issuer namespace 보강(§5 R5) |
| 03-2 OpenFGA/OPA 없이 플랫폼 Postgres 권한 경계 | **동의** | 단 차원 재정의 필수(§2 권고 4a) |
| 03-3 Entity Link를 유일 통합 seam으로 | **동의** | |
| 03-4 FileGateway/ProjectGraph adapter 한정 | **동의** | Seoul 해석 충돌(V13) 확인 |
| 03-5 알림 미채택 | **동의** | 모듈 부재 확인(V5) |

## 5. 반론 (근거 명시)

### R1. 01 A3 — 세대를 query key에 넣는 설계는 부트스트랩 순환이자 캐시 폭풍을 만든다

- **반대 대상:** 01 §4 A3 "TanStack Query key를 `routeId + canonicalContext + pageFilters + metricPair + serverGeneration`으로 만든다."
- **근거:** (a) 첫 요청 시점에 클라이언트는 현재 세대를 모른다 — key 구성 재료가 응답 이후에야 알 수 있어 순환이다. (b) TanStack Query는 key를 캐시 신원으로 쓴다(공식 query keys 문서, 01도 인용). 세대가 바뀌면 해당 context의 **모든** 캐시 엔트리가 무효화되어 위젯 전반이 일제 재요청된다. (c) `docs/05:51`의 Decided는 "폴링 + **서버가 제공하는 완료된 계산 세대/갱신 정보 기반 캐시 재검증**"이다 — 정보를 받아 재검증하는 것이지 키 내장을 요구하지 않는다. (d) 01 자신이 A7에서 신뢰의 원천을 응답 envelope로 두었다. 세대의 권위도 envelope이어야 일관된다.
- **대안:** 경량 probe(context fingerprint → 현재 ready `generationId`, 폴링 대상) + 데이터 query key는 세대 제외 + commit gate가 응답 envelope의 `generationId`와 probe/contextFingerprint를 비교. 세대 전환 시 위젯별 재요청은 probe 결과로 개별 결정하므로 폭풍이 완화된다. 코디네이터 구분에 따라 브라우저 requestEpoch(관측 순서, gate용)와 서버 generation(계산 기준)은 별개 축으로 취급한다.
- **확신도:** 높음(계약 문구+Query 공식 문서 기준). probe 자체의 폴링 비용·실패 처리는 설계 여지 **[추론]**.

### R2. 02 DP-04 — export "권한 snapshot 기록"은 다운로드 시점 재검증을 생략하는 유출 경로다

- **반대 대상:** 02 §4 DP-04 "큰 export는 generation/context hash와 **권한 snapshot을 기록한** async job 및 immutable artifact로 처리한다."
- **근거:** snapshot이 생성 시점 권한 고정을 의미하면, 권한 박탈 뒤에도 artifact가 TTL 동안 다운로드 가능하다. `docs/06` §17(703-717)은 Export를 포함한 전 surface에 동일 권한/Scope 규칙을 요구하고 §6.2(236)는 "매 요청마다 재검증"이 Decided다. `PLATFORM_REQUIREMENTS.md:111` "[3/3] Must — 전 경로 권한/Scope 집행(메뉴·URL·필터·조회·캐시·**내보내기**·딥링크·저장된 뷰 전부 동일 정책, 서버 매 요청 재검증)". 다운로드도 요청이다.
- **대안 계약:** artifact metadata에 (생성 시) `query scope+generationId+생성 actor`를 provenance로 기록하고, 다운로드 요청마다 (a) artifact 소유자/수신자 확인, (b) **현재** ScopeSet으로 원 조회 scope 재검증. 실패 시 `forbidden` + artifact 격리. 감사는 `export.requested/created/downloaded/denied`를 구분해 남긴다. authorization epoch는 재사용하지 않는다(생성 시 판정을 다운로드에 상속하지 않는다는 뜻).
- **확신도:** 높음(계약 근거 직접 확인).

### R3. 01 A6 — Radix 우선 권고는 docs/06 §13과 충돌하는 계약 변경인데 비용·재결정이 표기되지 않았다

- **반대 대상:** 01 §4 A6/§3 표 "Radix primitive + checked-in source를 우선 후보" 및 반영표(§13 언급 없음).
- **근거:** `docs/06:534` "UI Primitive — **shadcn/ui + Base UI를 기반으로 한다**"(V16). 실자산은 Radix 계열(V17). A6의 Radix 우선은 §13을 사실상 뒤집지만, 01은 이를 충돌로 명시하지 않았고 반영표에도 §13 수정 행이 없다. BRIEF §9와 루트 AGENTS.md는 "확정 계약 개선 제안은 가능하되 변경 비용과 재결정 필요성을 분명히 하라"고 요구한다.
- **대안:** ① §13 현행 유지가 기본값, ② Radix wrapper 승격을 원하면 동일 acceptance suite(§26 키보드 전면·focus trap/return·SR 이름·200% zoom·CJK) 비교 POC를 통과시키고 §13을 갱신하는 플랫폼 결정으로 처리, ③ 승자 문구를 §13에 일원화(한 계열만). checked-in source라 유지보수 리스크가 낮다는 방어는 가능하나 upstream 보안/a11y 수정 미반영 비용은 POC 항목에 포함해야 한다.
- **확신도:** 높음(양쪽 원문 직접 확인).

### R4. 01 A1 — "집합 중복 dedupe"를 실패 모드로 적은 것은 Decided 정규화와 반대다

- **반대 대상:** 01 §4 A1 실패 모드 "duplicate set을 dedupe함" 및 최소 검증 "duplicate ID"(구분 없음).
- **근거:** `docs/06:216` — 집합 키의 중복 제거·무순서는 **Decided 정규화** 그 자체다("유효 ID 1개 이상이면 선택 집합이며 중복은 제거하고"). 형식 오류인 것은 §6.1/§6.4(218)의 **단일값 키 중복**과 "빈 ID 1개"(`equipmentIds=`)뿐이다. A1 문장대로라면 계약이 요구하는 동작을 실패로 취급하게 된다. (코디네이터 논점 지시를 원문 대조로 확정했다.)
- **수정:** 실패 모두에서 "duplicate set을 dedupe함" 삭제, 최소 검증을 "집합 반복 키 중복 → 정규화(제거 후 동일 집합)"와 "단일값 키 중복 → 형식 오류"로 분리.
- **확신도:** 높음.

### R5. 02 DP-05 — "R 없으면 자동 publish 중지"는 Decided 범위(자동 재집계 보류)를 초과 확대한다

- **반대 대상:** 02 §4 DP-05 제안 "R이 없거나 mapping이 불완전하면 **자동 publish를 멈추고**", §5.4 4단 "R이 없는 경우 **auto publish를 멈추고**", 최소 검증 "R missing 시 auto publish가 멈춘다".
- **근거:** `docs/05:61` "R이 없으면 **자동 재집계만 보류**하며 지연완료 식별·후보 보존은 계속한다"(V15). `docs/06:256`은 "R이 아직 없는 경우(첫 mart 세대 생성 전…) defaultRangeTo가 독립적으로 유효하면 그대로 자동 물질화하고, 자동 재집계만 보류한다". 02의 문구는 (a) 지연완료 식별·후보 보존 계속을 떨어뜨리고, (b) 초기 부트스트랩(첫 세대 전 R 미공급)에서 최초 발행까지 막히는 것으로 읽혀진다.
- **수정:** "자동 재집계(창 연산)만 보류, 식별·후보 보존·최초/수동 발행은 계속"으로 문안 통일.
- **확신도:** 높음(양쪽 원문 직접 대조).

### R6. 02 DP-06 — 멱등 키가 같은 source version 내 마스터 정정·재분류를 구분하지 못한다

- **반대 대상:** 02 §4 DP-06 멱등 키 `(dataset, input scope, range, metric version, source version)`.
- **근거:** `docs/01`(재집계 트리거)와 `docs/05:59`는 트리거를 4종으로 구분한다: 지연 완료 / **마스터 소급 정정** / **재분류** / 지표 정의 변경. 마스터 정정·재분류는 원천 로그 버전 없이 발생할 수 있어 같은 키로 충돌한다 — 재실행이 duplicate로 간주되어 정정이 누락되거나, 반대로 같은 키의 재발행으로 이전 결과를 조용히 덮게 된다. (코디네이터 지시 논점.)
- **수정:** 키에 `triggerType`과 정정 식별자(예: master revision/backfill id, metric version의 경우 기존 필드로 충분)를 포함하고, "한 키 = 한 ready generation 또는 명시적 terminal failure" 불변식은 유지한다.
- **확신도:** 높음(트리거 목록은 계약 문서 확인, 충돌 양상은 설계 추론 **[추론]**).

### R5보강(반론은 아니고 계약 누락 보강) — 세션 만료 의미·공용 단말·issuer namespace·풀 격리

- **세션:** FeedbackOps 세션은 발급 시 12h **절대** 만료이고 idle timeout이 없다(V9, `session-service.ts:46,196`; `loadAndTouch`는 `last_seen_at`만 갱신). 사무용 웹 제품으로는 합리적이나, 현장 공용 단말에서 12시간 로그인 유지는 무단 사용·권한 박탈 지연 리스크다. 플랫폼 세션 계약(idle/max lifetime, 공용 단말 정책, revoke 전파)은 플랫폼 소유 결정 항목이며 12h 상수를 복사하지 않는다. `docs/05` Open "인증 방식"에 하위 질문으로 추가한다.
- **issuer namespace:** actor lookup/provision이 `(workspaceId, sub)`다(03 §2.2, `session-service.ts:70` 부근). 단일 issuer 제품(`config-oidc.ts`의 exact issuer 검증)에서는 정합적이지만, 플랫폼이 다중 issuer/issuer 교체를 하면 `(issuer, sub)` 없이는 신원 충돌이 생긴다. 지금 결정하면 싸고 나중에 결정하면 비싼 항목이다 — C-01 보강으로 `(issuer, sub)` 신원 namespace와 deprovision(=세션 revoke+actor 비활성) 의미를 별도 결정한다. 제품 버그가 아니다.
- **풀 격리:** 같은 인스턴스 정책(`docs/05:55`)에서 플랫폼 OLTP(세션·감사·잡)와 분석 스캔/재집계가 경합한다. 02는 statement/lock timeout·cancel을 다루지만 query class별 커넥션 풀·동시성 상한 계약이 없다. PostgreSQL 연결·메모리는 인스턴스 전역 자원이므로(공식 문서 기반 **추론**, 미측정) interactive/worker/export 풀 분리와 상한, 그리고 "재집계 실행 중 대화형 지연" 측정을 DP-04 최소 검증에 추가한다.

## 6. 기존 보고서 수정 사항 (문안 제안)

| 대상 | 수정 |
|---|---|
| 01 §4 A3 | key 식에서 `+serverGeneration` 삭제 → "세대는 current-generation probe가 소유하고 commit gate가 응답 envelope의 `generationId`와 비교한다." 최소 검증에 "발행 직후 probe↔데이터 경합" 추가 |
| 01 §4 A1 | 실패 모드 "duplicate set을 dedupe함" 삭제. 최소 검증을 "집합 반복 키 → 정규화"와 "단일값 중복 → 형식 오류"로 분리 (§5 R4) |
| 01 §4 A6·§3 표·문서 반영 | docs/06 §13 "shadcn/ui + Base UI 기반" 인용 추가, "Radix 우선은 §13 변경을 수반하므로 POC 후 플랫폼 결정" 문장과 반영표 §13 행 추가 (§5 R3) |
| 02 §4 DP-04 | "권한 snapshot 기록" → "scope/generation snapshot은 provenance로 기록, **다운로드 요청마다 현재 ScopeSet 재검증(실패 시 forbidden+격리)**, 감사에 requested/created/downloaded/denied". 최소 검증에 "권한 박탈 후 다운로드 거부" 추가. query class별 풀/동시성 상한 문항 추가 (§5 R2, R5보강) |
| 02 §4 DP-05 | "자동 publish 중지" → "자동 재집계만 보류, 식별·후보 보존·최초/수동 발행 계속" (§5 R5) |
| 02 §4 DP-06 | 멱등 키에 `triggerType`+정정 식별자(master revision/backfill id) 포함 (§5 R6) |
| 03 §2.2 감사 행·C-03 | "컴파일 타임 강제" 표현 완화 — `Tx = Db \| DrizzleTx`(`db/tx.ts:22`)라 pool 전달이 타입 가능하며 same-Tx는 관례·리뷰로 보장된다. 플랫폼 계약은 mutation 경로에서 tx를 강제로 개통하는 호출 규칙을 명시적으로 검증한다 (V8) |
| 03 §4 C-01 | 재사용 경계에 "SESSION_TTL_MS 12h 절대 만료·idle 없음은 제품 정책" 추가. 보강 항목으로 `(issuer, sub)` 신원 namespace·deprovision 의미 결정 추가 (§5 R5보강) |
| 03 §4 C-02 | FeedbackOps `Scope`가 Managed System 집합임을 명시하고 "플랫폼 `scopeId`(§6.2 단일, 계층 Open) → 데이터 필터 매핑"이 adapter 계약의 핵심 문제라고 서술 (§2 권고 4a) |

## 7. 실행 가능한 최소 조합 (GLM 안)

### 7.1 계약 산출물 (P0)

1. `PublicContextV{n}` codec + test vector(01 A1 수용, R4 수정 반영).
2. `MenuManifest` + Shell slot(01 A2 수용).
3. `PermissionDecision`/`ScopeSet` seam(03 C-02 수용, 차원 재정의 포함) + same-Tx 감사·runtime-role 가드 관례(03 C-03, V8 정정 반영).
4. 응답 envelope `outcome`+`assessments[]`+`generationId`+`statusSource`(docs/06 §19 + 02 DP-07 문안).

### 7.2 프론트엔드

TanStack Router(thin codec adapter)·Query(probe+commit gate)·Table+Virtual·ECharts adapter POC(01 §5.1 수용). primitive는 §13 충돌 해소(§2 권고 5) 후 단일 계열.

### 7.3 백엔드·데이터

Node/Fastify + Drizzle + pg(FeedbackOps 패턴 재사용: tx 관례, same-Tx 감사, runtime-role, job table+`SKIP LOCKED`; pg-boss는 DLQ/backoff 요구가 확인된 뒤 adapter 평가). 파서 read-only 역할·플랫폼 스키마(docs/05 Decided). interactive는 `SET LOCAL` timeout·row/point budget·driver cancel, 작은 CSV `COPY TO STDOUT`, 큰 export는 이단 권한 계약(§2 권고 3)의 비동기 잡.

### 7.4 검증 흐름 (01 §5.2와 03 §5.1 병합)

같은 fixture로 ① codec 오류 벡터 ② 세대 전환 중 첫 응답 미채택(gate) ③ chart/표/CSV 동일 `generationId` ④ 권한 변경 후 export 다운로드 거부 ⑤ revoke 후 딥링크 forbidden ⑥ 취소 후 DB 잡·쿼리 종료 ⑦ 재집계 실행 중 대화형 지연 측정. 수치 목표는 측정 전 가정으로만(DP-09 수용).

### 7.5 세대·권한 수명 최소 계약 (코디네이터 요청 안)

- **3축 구분:** 브라우저 `requestEpoch`(클라이언트 관측 순서, commit gate 정렬용) / 서버 `generationId`(계산 기준) / authorization(매 요청 평가, epoch 재사용 금지. export는 생성·다운로드 각각 평가).
- **가변 join 규칙:** 같은 `generationId`라도 라이브 조인되는 가변 master/ACL 때문에 결과가 달라질 수 있다. 최소 규칙: (a) 첫 슬라이스는 의미 있는 차원을 전부 generation에 각인(stamping)해 문제를 제거하거나, (b) 각인 불가한 라이브 join은 응답에 자기 basis(예: master revision 또는 평가 시각)를 남기고, 못 남기면 `unknown`.
- **retention/expiry 최소:** current ready pointer + 직전 ready 세대 보존(비교·되돌림). 진행 중 reader가 pin한 세대는 GC 유예(reader lease 또는 grace TTL). export artifact는 generation 고정 + TTL + 다운로드 재검증. authorization 판정은 artifact에 각인하지 않는다.
- 전체 manifest 필드·GC/rollback 절차·backfill 운영 UI는 위 최소가 대표 흐름에서 증명된 뒤 확장한다.

## 8. 다른 두 리뷰어에게 묻는 질문 (3)

1. **(세대·캐시)** probe 단일화(probe endpoint가 폴링·재검증의 단일 실패점이 됨)에 대한 반론이 있는가? 세대 전환 시 위젯 일제 재요청을 key 내장 없이 어디까지 완화할 수 있다고 보는지 — stale-while-revalidate 형태가 `docs/05:51` "세대 기반 캐시 재검증" Decided와 충돌한다고 보는지도 답해달라.
2. **(프론트·계약)** Radix(wrapper 자산) vs Base UI(docs/06 §13 기명) 비교 POC의 합격 기준 최소 셋을 무엇으로 잡을지(§26 접근성·CJK·필수 컴포넌트 범위). 그리고 01이 §13 충돌을 언급하지 않은 것을 오류로 보는지.
3. **(보안·운영)** export 다운로드 시점 재검증 이안(二段) 계약에 동의하는지, creation-time 고정 + 짧은 artifact TTL로 충분하다고 보는지. 그리고 백엔드 언어 조기 확정(Node/Fastify)에 반대 근거(Python/FastAPI가 우위인 구체 시나리오)가 있다면 밝혀달라.

## 9. 문서 반영표

| 문서·위치 | 반영 내용 | 시기 |
|---|---|---|
| docs/06 §17 | Export 생성·다운로드 이단 권한 재검증 문안(§2 권고 3) | 지금(승인 후 반영; Decided §17의 명시화) |
| docs/06 §11 | current-generation probe + commit gate, requestEpoch/generation 구분 문양(§5 R1) | 지금 제안 |
| docs/06 §13 | primitive 계열 POC 후 승자 일원화(§5 R3) | POC 후 |
| docs/06 §18–19 | `generationId`/`statusSource` 필드 결합, 가변 join basis 규칙(§7.5; 02 DP-07 문안 수용) | 구현 계약 확정 시 |
| docs/03 스택 표·§2 뒤 | 백엔드 언어 재평가 근거(Fastify 실구현 자산) 갱신 + query class별 풀/동시성 상한 표(§5 R5보강) | 지금 제안 |
| docs/05 Open | 세션 정책(공용단말 idle/max lifetime), issuer namespace `(issuer,sub)`, export artifact TTL, 백엔드 언어 근거 갱신 | 지금 |
| docs/01 | 재집계 트리거별 멱등 키 구분(§5 R6), generation 최소안 우선순위 표기(§7.5) | 구현 착수 시 |
| docs/04 | primitive 비교 POC 항목 추가(ECharts POC는 기존 문구 유지, V13 대조) | 지금(항목만) |
| docs/02 | 변경 없음 — VOC 자체 도메인·권한 분리 원문 유지 | — |
| DESIGN.md | token/component 소유권만(01 A6 수용) | primitive 결정 후 |
| PLATFORM_REQUIREMENTS.md | 내보내기 항목(:121)에 이단 재검증·TTL 구체화 | 지금 |

## 10. 검증 한계

- 실행 기반 검증 없음: 의존성 설치·서버/DB/IdP 기동·테스트 실행을 하지 않았다. FeedbackOps 코드 주장은 정적 읽기 기반이며, same-Tx 감사의 실제 rollback 거동, `AbortSignal`의 fetch 전 소비, 권한 판정의 런타임 일관성은 미확증이다 **[미검증]**.
- 웹 출처는 재확인하지 않았다. 3종 보고서의 라이선스/버전/공식 문서 인용(TanStack, ECharts 6.1.0, AG Grid, PostgreSQL 18, pg-boss 12.33.3, Keycloak 26.7.4 등)은 Luna 제공 링크의 스냅샷으로 남기며, 내 반론 6건은 로컬 근거만으로 성립하도록 설계했다. 외부 사실을 근거로 한 주장은 없다.
- FileGateway/ProjectGraph는 문서 일부만 대조했다(경로·commit은 03 기술 신뢰). parser(`context_recognized_parser`)는 미확인 **[미검증]**.
- 세대·권한 수명 최소안(§7.5)과 probe 설계는 계약 문서에 근거한 설계 제안이지 구현 검증이 아니며, 세대 전환·GC 유예의 구체 동작은 구현 시 계약 테스트로 확정해야 한다 **[추론]**.
- 이 보고서 작성으로 수정한 파일은 이 파일 하나다. 공식 설계 문서·서브모듈·다른 보고서는 수정하지 않았다.
