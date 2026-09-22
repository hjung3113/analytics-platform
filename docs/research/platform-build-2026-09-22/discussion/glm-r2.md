# R2 — GLM(zai/glm-5.3 Max) 상호 반론 응답

- 작성: 2026-09-22. 입력: `BRIEF.md`, `COORDINATOR_NOTES.md` N1–N5, `astra-r1.md`, `grok-r1.md`, `astra-r2.md`, `grok-r2.md`, `ORCHESTRATION.md`, 내 `glm-r1.md`. 두 상대의 R2를 모두 읽고 답한다.
- **R1 정정(모델 설정):** R1 머리말의 "Max **[미검증]**" 표기를 철회한다. 코디네이터가 실행 세션 metadata에서 `model_change zai/glm-5.3`(`resolvedModelIsFallback=false`)과 `thinking_level_change max`(2026-09-22T03:19:47.205Z)를 확인했고 같은 근거가 `ORCHESTRATION.md`에 기록돼 있다. 환경변수 부재를 미적용으로 해석한 내 R1의 판단이었다면 그 해석이 틀렸다.
- 표기: **수용 / 부분수용 / 반박**. 근거는 상대 보고서의 주장 ID·인용과 저장소 사실. 이 파일만 작성했다.

## 1. 자기 R1에서 고친 것

| R1 주장 | R2 수정 |
| --- | --- |
| R1 "세대는 key가 아니라 응답 계약"(probe+key 세대 제외) | **수정 — 2단 캐시 신원 수용.** 모르는 세대는 key에 못 넣고(순환, 유지), pin된 세대는 key에 들어간다. A2-G3/§2.4 수용. |
| R1 "세대 key 내장 = 캐시 폭풍" | **철회(과장).** key당 fetch 중복 제거·observer 공유·화면 단위 전환 정책으로 완화된다(grok-r2 §3.1). 잔여 위험은 전환 정책이 소유. |
| R1 "경량 current-generation probe(폴링 대상)" | **후퇴 — 독립 probe는 필수 계약이 아님.** 세대 정보의 원천은 데이터 응답 envelope(`docs/05:51`은 "정보 기반 재검증"을 요구). 탐색 조회가 곧 probe 역할이며 상시 probe endpoint는 폴링 최적화 후보(grok-r2 §3.1 수용). |
| R1 §7.5 "current + 직전 ready 1개 보존 + reader lease/grace" | **수정 — 개수 기반 폐기 철회.** Astra 반례(G1 열람 중 G2/G3 공개 후 export 시작)와 Grok 반례(ref=0 GC와 참조 등록 경합)가 둘 다 유효. retire→drain→GC 수명주기로 대체. |
| R1 03-3 "Entity Link 유일 seam 동의" | **철회.** Luna C의 "유일한 읽기/쓰기 seam"은 과대 표현. 3분할(도메인 command / Context Link / Entity Link 관계 이력) 수용(AR-F7, grok-r2 §2.3). |
| R1 권고 4 "Node/Fastify 지금 확정 권고" | **수정 — "TS 기본 비교 기준 + 즉시 결정 게이트"로.** 팀 언어·배포·보안 표준은 내가 확인 못 한 실재 입력이므로 이번 라운드 확정은 과속(astra-r2 A2-L3, grok-r2 §3.2 수용). |
| R1 R3 "Radix 우선은 docs/06 §13 '계약 변경' 결정" | **완화 — 절차 수정.** §13은 Decided 표기 절이 아니므로(§6.1/§6.3/§6.4/§19만 명시 Decided) "계약 변경 승인"이 아니라 §13 문구 상태를 04/05 Candidate와 정렬하는 문서 정비 + POC 후 3문서 동시 갱신(A2-L2 수용). |
| R1 §7.3 "FeedbackOps 패턴: … job table+SKIP LOCKED" | **정정(오기).** FeedbackOps 실선례는 pg-boss 등록(`voc/jobs/embed-voc.ts`)이고 `SKIP LOCKED` job table은 Luna 02의 신규 제안이다. 자작 큐 전에 pg-boss(기존 의존성)와 복구 비용 비교. |
| R1 §7.5 "각인 불가 라이브 join은 basis 기록, 못 남기면 unknown" | **범위 축소.** 비교 대상(chart/표/CSV 동일 조건)은 master/분류/metric 기준 각인 필수, 미각인 비교는 거부. unknown 표시는 보조 상태 표시에만(A2-L4 수용). |

유지: 집합 중복=정규화·단일값 중복=형식 오류(R4), R 부재는 자동 재집계만 보류(R5), 멱등 키에 정정 식별자(R6), export 다운로드 현재 권한 재검증(R2), 세션 12h 절대 만료 비복사·`(issuer,sub)` namespace·query class 자원 예산(R5보강), Tx union 한계(V8), 측정 전 수치 금지.

## 2. Astra 주장에 답한다

### A2-G3 "탐색/고정 캐시 신원 분리면 순환 없음, revision 없는 키는 G1/G2 충돌" — 수용

"같은 Context의 G1/G2 요청이 동일 key를 쓰면 G1 소비자가 G2 캐시를 받거나 두 revision의 fetch가 같은 query로 취급될 수 있다"(astra-r2 A2-G3)는 반례가 내 설계의 실제 결함이다. 내 R1의 commit gate는 contextFingerprint만 비교했으므로 같은 Context 안에서의 세대 전환이 gate를 통과해 혼합 화면을 만든다(`docs/01` 재집계 절의 혼합 세대 금지 위반). 절차적으로도 "query 함수가 의존하는 변경 변수를 key에 포함"이라는 공식 Query 근거가 pin된 revision에는 성립한다. **수정된 계약:** ① 탐색 조회 key = `route+canonicalContext+pageFilters(+사용자 캐시 경계)`, 세대 미포함, 응답 envelope가 `calculationGenerationId`(이름 Candidate) 전달 — 순환 없음. ② 첫 성공 응답의 검증된 revision을 분석 세션에 pin, 이후 표/차트/CSV/export는 요청 인자 + **캐시 key 양쪽에** pin 포함(grok-r2 §5.3 "pin이 있으면 pin"과 동일 결론). ③ 세대 전환은 화면 단위 정책(각 위젯 조용히 독립 갱신 금지, astra-r2 §3). 잔여 불일치 없음.

### A2-G4 "활성 browser read도 보호하거나 명시적 만료 필요" — 수용

내 "직전 ready 1개" 보존은 "G1을 보다가 G2·G3가 공개되고 export를 아직 안 누른" 반례를 못 막고(개수 기반 폐기), "in-flight 참조만" 보호도 참조 획득·삭제 경합을 못 막는다(grok-r2 §2.4). **최소 수명주기 계약으로 대체:** 공개 스왑 트랜잭션에서 이전 ready를 `retired`로 전환(신규 참조는 지원 기간 내에서만 획득, 획득 판정·삭제 판정은 원자적 또는 삭제 중 신규 참조 거부) → 활성 참조(pin 화면·export 잡) 종료 대기(drain) → GC. 지원 기간이 지났거나 운영자 강제 폐기면 이후 읽기/다운로드는 **명시적 만료**(재조회 유도, 원인 표시)이고 최신 조용히 대체 금지. 만료 응답은 `docs/06` §19의 `outcome=error`+사유 assessment로 표현(열거형 확장 불필요). 기간·보유량 숫자는 Open.

### A2-G5 "Entity Link는 유일 제품 API 아님" — 수용

`EntityLinkProvider`가 제품 `Db`·enum·domain repo에 결합된 내부 인터페이스인 한 "유일한 읽기/쓰기 seam"은 성립하지 않는다. 3분할 채택: 도메인 query/command=소유 제품 API, Context Link=URL 전달, Entity Link=관계 registry/가시성/이력. same-Tx 원자성 요구는 같은 DB 경계에서만(독립 배포 시 outbox/보상은 필요 시점에 별도 설계). 내 동의가 지키려던 실질(테이블 합치기 금지·상태 소유 유지)은 Luna C-04의 provider 제안에 그대로 남는다.

### A2-G6 "강제 선택 순서는 계약이 요구 안 함" — 수용, 노트 하나

Nest를 Fastify 기각 후로 강제하는 순서는 없다는 지지(운영·배포 제약도 근거). 단 비교표에는 "Nest는 Fastify(또는 Express) 어댑터 위에 올라타는 층"이라는 구조적 사실을 근거로 남긴다. `PermissionDecision`(출력 계약)과 Casbin(평가 구현)이 대체 관계가 아니라는 구분도 수용 — Casbin은 비교행 추가, 도입 아님. Grok의 Graphile Worker 행도 같은 취급(비교 후보, 적합성 미검증).

### A2-L1(GLM R1 반박 + Q1 답) — 수용

probe 도입 후에도 revision별 캐시 구분이 필요하다는 것에 동의하며 그 구분을 A2-G3 형태로 받아들였다. probe 실패 시 마지막 검증 동일-Context 결과를 유효 수명 내 유지+실패/최신성 미확인 표시, 권한·수명 무효 시 유지 금지 — 수용. 이 조건의 SWR는 `docs/06:816`(동일 Context 재조회 시 기존 데이터 유지+`Refreshing`)과 양립한다. 내 R1 Q1은 이 답변으로 종결.

### A2-L2 "§13 문구 누락은 수용, Decided 단정은 부분 반박" — 부분수용

§13에 "(Decided)" 표기가 없고 04/05가 프론트 라이브러리를 Candidate로 추적한다는 지적은 사실이므로, "Radix 우선 = Decided 계약 변경 승인"이라던 내 R1의 절차적 프레임을 완화한다(§1 표). 다만 두 가지는 유지한다: ① POC 전의 **작동 기본값은 현행 §13 문구**라는 것(grok-r2 §3.3과 동일), ② 01 A6이 §13 문구를 인용·표기하지 않은 것은 오류라는 것(Astra도 R1 누락을 인정). 실행: §13 상태 표기를 04/05와 정렬하는 문서 정비 → Astra Q2 답의 기준(키보드/focus trap·return/SR 이름, CJK 200% 확대, Dialog/Select/Popover+tokens)과 내 §26 기준을 합친 동일 suite POC → 승자를 §13·04·05에 동시 반영. 승자 사전 확정 없음.

### A2-L3 "Fastify 조기 비교 수용, 확정 유보" — 부분수용

"조직의 Python 운영·배포/보안 표준이 확정되면 FastAPI가 적합할 수 있으며 현재 미확인" — 이 입력이 실재하고 확인 가능하다는 점을 인정해 "지금 확정"을 철회한다(§1 표). 대체 안: docs/03 표에 Fastify+Drizzle+pg를 **TS 기본 비교 기준**으로 올리고, docs/05 Open의 언어 항목에 즉시 닫을 수 있는 결정 게이트(팀 언어 표준·배포 환경·Python 분석 프로세스 요구 문서화 여부·보안 승인)를 명시한다. 게이트 입력이 Fastify불리 결정적 근거를 주지 못하면 Fastify 확정을 권고한다 — "유예 없는 Open"이 아니라 "입력 확인 즉시 닫는 창"이다.

### A2-L4 "unknown live-basis는 정직해도 같은 계산 기준을 보장 못 함" — 부분수용

비교 대상 결과에 대해서는 완전히 수용한다: chart/표/CSV 동등성 검증은 master/분류/metric 기준이 세대에 각인(또는 고정 입력)된 경우에만 성립하고, 미각인 비교는 거부/새 revision 명시 갱신이다. ACL은 각인 대상이 아니며 현재 권한으로 거절하는 것과 계산 기준 고정은 독립 책임인 구분도 유지한다. 내 "basis 기록 또는 unknown"은 보조 상태 표시(예: 라이브 운영 지표·현재 권한 안내)에만 적용한다.

## 3. Grok 주장에 답한다

- **§3.1 "probe SPOF 반박": 수용.** 05:51은 별도 probe를 요구하지 않고 envelope의 세대 정보로 재검증한다. 탐색 조회가 세대 획득 경로고 경량 probe는 폴링 최적화 후보로 강등했다(§1 표).
- **§2.1/AR-F2 겹침(raw codec): 수용.** "TanStack이 반복 키를 언제나 잃는다"는 단정이 과장이라는 Astra의 정정과, 남는 실패가 "객체화 전 카디널리티·문자열 의미 붕괴"라는 귀결을 받는다. 내 R1 A1 수용에 빠졌던 **lossless 경계(raw query/다중 목록 입력)** 를 codec 계약의 필수 조건으로 추가한다. 산출물 형식(JSON Schema vs TS+공통 conformance 벡터)은 Candidate — 형식이 아니라 "같은 벡터를 클라이언트·서버가 소비"하는 것이 계약.
- **§2.4 "pin 후 키 또는 단일 observer": 수용.** A2-G3에서 채택한 2단 구조와 동일 결론. "권한 epoch는 키에 넣지 않고 매 요청 재평가(만료 시 캐시 재사용 금지)"도 전원 일치.
- **G5→§2.1 수정(Kernel/승격 분리): 수용.** Grok이 스스로 수정했으므로 잔여 불일치 없음. 네 필드 최소 주장은 철회됐고 §5 개념 정보(식별자·권한/Scope·지원 Context·페이지 유형·선택 기능)가 최소 선언이다.
- **§3.4/3.5: 수용.** export 이단(사실상 삼점: enqueue/실행(발행 포함)/다운로드) 현재 권한, 세션·issuer·풀 예산의 "지금 숫자 없음" — 모두 내 입장과 일치. revoke 즉시 실행 중 계산 중단은 별도 메커니즘 없이 보장하지 않는다는 Astra 한정도 받아들여 합격 기준에 "발행 직전 재검증"으로 반영한다.
- **§2.2(AR-F6): 수용 확인.** 내 V8과 동일 결론(`tx.ts:22` `Tx = Db | DrizzleTx`), orphan bug 단정 아님, 호출부 negative test 필요.

## 4. 수정된 최소 조합 (GLM R2 안, Candidate)

1. **URL codec(P0):** 입력은 raw query/순서 보존 다중 목록. 카디널리티 판정(단일값 반복=형식 오류, 집합 중복=정규화·정렬) → 문자열 의미 검증(naive `[from,to)`, 공집합 표식) → typed context 분류(등록/미등록). 미등록 키는 현재 URL 보존, 메뉴 전환은 등록 전역 Context만. 라우터·서버가 같은 conformance 벡터 소비. Router 기본 JSON parse·`.catch()`/fallback 사용 금지는 구현 지침으로.
2. **Kernel 선언:** §5 개념 정보 MenuManifest + Shell slot 소비. 관리 UI·remote plugin·범용 widget SDK는 Deferred.
3. **조회 세 계약:** 탐색 key(세대 없음) → 첫 응답 envelope의 `calculationGenerationId` pin → 고정 key/요청 인자에 pin. 화면 단위 전환. `requestEpoch`(paint 경쟁)·세 계산 기준·매 요청 authz의 3축 유지.
4. **read-basis 수명:** retire→drain→GC(§2 A2-G4 안). 폐기 요청은 명시적 만료. URL 영구 숫자 재현 약관 없음(N3).
5. **권한:** CheckService/ScopeSet **protocol** 추출(차원은 플랫폼 scopeId로 재정의), export는 enqueue/실행(발행)/다운로드 각각 현재 권한, snapshot은 감사 근거. Casbin/OpenFGA/OPA 도입 없음(비교행만).
6. **런타임:** Fastify+Drizzle+pg를 TS 기본 비교 기준, 결정 게이트 입력 확인 후 확정 권고. async 필요 시 pg-boss(기존 의존성) vs 작은 job table을 복구 비용(rollback·풀 반환·fencing) 포함 비교, Graphile Worker는 추가 후보[미검증]. 멱등 키에 `triggerType`+정정 식별자.
7. **프론트:** primitive는 §13 정렬+POC 전까지 한 계열(Radix wrapper 사용은 임시 구현 상태로 표기, 계약 승리 아님). TanStack Table/Virtual·ECharts adapter는 codec·세대·권한 slice 이후.
8. **세션/신원:** 12h 상수 비복사, idle/max lifetime·공용 단말 정책·`(issuer,sub)` namespace는 docs/05 Open 질문으로.

## 5. 끝내 남는 불일치

| # | 항목 | GLM | Astra | Grok | 처리 제안 |
| --- | --- | --- | --- | --- | --- |
| 1 | 백엔드 확정 시점 | 게이트 입력 확인 즉시 Fastify 확정 권고 | 비교 기준 추가, 확정 유보 | 05 Open 유지 | 절차 차이는 작다(모두 Fastify 우선 비교에 동의). 확정 시점은 코디네이터가 게이트 항목 조회 시점과 함께 결정할 사항. |
| 2 | 세대 재검증 캐리어 | 탐색 조회/envelope(독립 probe 불필요) | 탐색 key 강조 | envelope, probe는 최적화 후보 | 실질 수렴. 잔여는 "갱신 알림 채널(폴링 외) 필요 여부"뿐 — 05 실시간성 Open(폴링 주기)과 묶어 결정. |
| 3 | retired 세대의 신규 참조 허용 기간 | "지원 기간" 정책(숫자 Open) | 같음(숫자 Open) | 참조 집합 강조, 기간 미언급 | 기간·운영자 폐기 절차는 구현 시 acceptance로 확정. 불일치라기보다 미결정. |
| 4 | §13 Base UI의 상태 해석 | 작동 기본값=현행 §13+상태 표기 정비 | Candidate 정렬 먼저 | 기본값=현행 §13 | 절차를 합침(§2 A2-L2): 정비→POC→3문서 동시 갱신. 잔여 없음. |

형식적 만장일치를 주장하지 않는다. 위 1번만이 실질적 선택 차이고, 2~4는 미결정 사항의 소유자 문제다.

## 6. 문서 반영안 (R1 표에서 변경/확정된 것)

| 문서·위치 | 반영 문안(초안) | 시기·상태 |
| --- | --- | --- |
| docs/06 §11 | "클라이언트 요청 경쟁 식별자와 서버 결과 revision을 구분한다. 함께 비교하는 차트·표·내보내기는 같은 결과 revision을 사용하며 만료 시 묵시 최신 대체를 하지 않는다."(astra-r2와 동일 문양 수렴) | 지금 제안. 필드명 Candidate |
| docs/06 §19 | 만료 read-basis의 표현: `outcome=error`+사유 assessment(kind Candidate). 열거형 확장 없음 | 지금 제안 |
| docs/06 §13 | 상태 표기를 04/05 Candidate와 정렬하는 문서 정비 → POC 후 승자 일원화 | 정비 지금, 승자 POC 후 |
| docs/06 §17 | export enqueue/실행(발행)/다운로드 각각 현재 권한, snapshot은 감사 근거(R1안 확정, 3자 수렴) | 지금 제안 |
| docs/03 표·§2 | Fastify+Drizzle+pg를 TS 기본 비교 기준으로 추가, 결정 게이트 항목 명시, 취소 후 rollback/풀 반환·fencing 합격 조건, query class 자원 예산(총 연결 예산 포함) | 지금 제안 |
| docs/01 재계산 절 | 멱등 키 `triggerType`+정정 식별자(N4/R6), retire→drain→GC 수명주기, 비교 대상 각인 필수 | 구현 착수 시 |
| docs/05 Open | 백엔드 언어 결정 게이트, 세션 정책(공용단말 idle/max), `(issuer,sub)` namespace, export artifact 만료 정책, retired 세대 허용 기간 | 지금 등록 |
| docs/04 | Router를 "raw codec 소비자, 기본 parse/fallback 금지"로 표기, primitive POC 항목 | 지금(항목만) |

## 7. 검증 한계

- 이번 라운드는 새 조사 없이 기존 보고서·계약·코드 인용의 재대조만 수행했다. TanStack Router 1.170.1의 반복 키 파싱, node-pg cancel/풀 반환, pg-boss·Graphile Worker·Casbin의 이 워크로드 적합성은 전원 **[미검증]** 상태를 유지한다(상대 보고서의 공식 문서 근거를 재확인하지 않았다).
- 세대 캐시 2단 구조·retire/drain/GC·결정 게이트는 계약 문서와 상대 반례에서 도출한 설계 제안이며 구현·실행 검증이 없다.
- 실행·install·서버·DB·하위에이전트·commit/push 없음. 수정한 파일은 `discussion/glm-r2.md` 하나다.
