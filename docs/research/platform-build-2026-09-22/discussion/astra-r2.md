# Astra R2 — 최소 구현의 경계와 상대 주장 검토

작성일: 2026-09-22. 상태: 검토·권고이며 공식 계약 변경이나 구현 승인이 아니다.
표기: **[사실]** 직접 읽은 문서/코드, **[추론]** 그 근거에서 도출한 판단, **[미검증]** 실행·운영 확인 없음.
근거 경로는 저장소 루트 기준이다. R1의 상세 근거는 [astra-r1](astra-r1.md), 쟁점 묶음은 [COORDINATOR_NOTES](COORDINATOR_NOTES.md)를 참조한다.

## 1. Grok 주장에 대한 판정

### A2-G1 — G5의 Kernel 승격 지연: 부분수용, Registry/Slots까지 미루는 해석은 반박

[grok-r1](grok-r1.md) G5는 “MenuManifest 완전체 … 메뉴 2–3개 반복 또는 실측 게이트 전 P0가 아니다”, §7.2는 “Shell slot 완전체는 반복 확인 후”라고 한다.
**[사실]** `06` §5는 초기 코드 내부 선언형 Registry를 정하고, §8은 title/action/context/content/dataTrustSummary 슬롯 경계를 정한다.
§14는 플랫폼 소유 책임과 반복 후 승격할 Table Toolbar/Filter/Drill-down 패턴을 명시적으로 나눈다.
**판정:** remote plugin/범용 ChartFrame/도메인 조합의 사전 일반화는 보류한다. 그러나 Kernel 계약 준수까지 2–3메뉴 반복 조건에 종속시키면 §5·§8·§14와 충돌한다.
네 필드 `id, route, requiredPermission, supportedContext`만으로는 §5의 그룹/이름/필요 Scope/페이지 유형/선택 기능 정보를 다 표현하지 못한다.
그 정보는 작은 정적 선언으로 제공하면 된다. 비채택 Saved View는 지원하지 않음으로 선언하고 비활성 버튼/구현을 강제하지 않는다.
**자기 입장 보정:** 내 AR-1도 “모든 Kernel 기능을 지금 완성”이 아니다. 첫 메뉴가 소비하는 얇은 계약부터 만들되, 채택된 공통 책임을 메뉴별 임시 코드로 우회하지 않는다는 뜻이다.

### A2-G2 — G1/C1의 JSON Schema 대체: raw 경계 수용, 자동 의미 보장과 형식 확정은 반박

G1의 “공유 산출물은 TypeScript가 아니라 … JSON Schema/OpenAPI”, §9의 “원문 query string을 같은 JSON Schema로 소비”는 구분이 필요하다.
**[사실]** `06` §6.1은 같은 공개 산출물 소비를 Decided로, OpenAPI/JSON Schema/codegen 형식을 Candidate로 둔다.
[JSON Schema 공식 설명](https://json-schema.org/understanding-json-schema/about)은 구조 검증과 별도 의미 검증의 역할을 구분한다.
**[추론]** 이미 `scopeId=A&scopeId=A`를 `{scopeId:'A'}`로 축약했다면 JSON Schema는 잃은 반복 횟수를 되살릴 수 없다.
raw key/value 다중 목록 → 카디널리티·문자열 검사 → 의미 검증/집합 정규화 → 라우터·서버 소비의 순서가 필요하며 schema는 그중 일부를 표현한다.
TS 구현도 언어 중립 artifact를 생성하고 서버와 같은 검증 벡터를 소비한다면 배제할 이유가 없다. 반대로 JSON Schema 파일만 공유해도 wire 계약은 미완성이다.
C1의 Router 반복 키 “붕괴”도 항상 단일값 소실로 단정하면 과장이다. 직접 확인한 [upstream qss](https://raw.githubusercontent.com/TanStack/router/main/packages/router-core/src/qss.ts)는 반복 값을 배열화하지만 숫자/boolean 변환도 한다.
이는 고정 Router 1.170.1의 실행 증거가 아니다. 핵심은 lossless 경계이며 raw 문자열 또는 동등한 다중 목록이면 된다.
FeedbackOps `vocs.tsx`의 `.strict()`는 플랫폼에 그대로 이식할 수 없는 선례지만 독립 제품의 결함으로 소급 판단하지 않는다.
“.strict()/.catch() 전면 금지”보다 미등록 URL 보존과 등록 키 오류 거부를 보장한다는 규칙이 정확하다. 분류 후 typed subset에 strict 검증을 쓰는 것은 가능하다.

### A2-G3 — G2/A-A3/§7.6의 generation 없는 Query key: 반박, 두 단계 조회로 수정

Grok은 “계산 세대는 응답에서 읽어 표시/후속 요청에만 사용”하고 key를 `route+canonicalContext+pageFilters`로 제안한다.
**반례 [추론]:** 같은 Context의 G1/G2 요청이 동일 key를 쓰면 G1 소비자가 G2 캐시를 받거나 두 revision의 fetch가 같은 query로 취급될 수 있다.
서버 generation을 query key에 넣는 행위 자체가 혼합 세대를 만드는 것이 아니라, 위젯이 서로 다른 generation을 선택하도록 둔 조립이 문제다.
[공식 Query key 문서](https://raw.githubusercontent.com/TanStack/query/main/docs/framework/react/guides/query-keys.md)는 query 함수가 의존하는 변경 변수를 key에 포함하도록 한다.
최초 revision을 모르므로 **탐색용 key**로 ready revision을 얻고, **고정 조회 key**는 Context/page 조건/결과 revision/사용자 캐시 경계를 포함한다.
첫 데이터 응답으로 revision을 얻는 방식도 가능하다. 그 응답을 검증해 고정 revision 캐시에 연결한 뒤 후속 표·CSV 요청을 시작한다.
`requestEpoch`는 로컬 응답 경쟁, 결과 revision은 숫자의 계산 기준, authorization epoch는 보호 캐시 수명의 구분이다. 권한 epoch 자체는 grant가 아니다.
**자기 입장 변경:** AR-F3에 없던 “탐색과 고정 조회의 캐시 식별 분리”를 명시적으로 추가한다. 브라우저 epoch를 모든 query key에 넣는 것은 권하지 않는다.

### A2-G4 — C2/§5.3의 retention 최소안: 프레임워크 보류 수용, 수명 계약 보류는 반박

Grok C2는 “현재 ready 1개 + … in-flight export”, §5.3은 “이전 ready 1개만 유지”를 제안한다.
**반례 [추론]:** G1 차트를 보는 동안 G2/G3가 공개되고 export 버튼을 아직 누르지 않았다면 export 참조 수는 0이다. 이전 세대 1개만 남기면 G1 CSV의 기준이 사라진다.
따라서 두 세대라는 개수도, export 참조만이라는 집합도 일반적인 정합성 보장이 아니다. 삭제와 신규 참조 획득의 경쟁도 닫아야 한다.
**최소안:** 후속 조회를 허용한 기간에는 관련 read/export가 기준을 획득하도록 보호하고, 더는 보장하지 못하면 명시적 만료/전체 새로고침으로 전환한다.
유효 참조와 삭제 판단은 원자적으로 조정하거나, 삭제 중 새 참조를 거부하는 동등한 방법을 택한다. 무한 browser 세션으로 무한 보존을 약속하지 않는다.
숫자 TTL·보유량은 Open이고 GC 서비스/rollback UI는 Deferred일 수 있다. 그러나 지원 수명·만료 응답·활성 읽기 보호는 첫 지연 CSV 기능 전에 정해야 한다.
운영자 폐기도 보호 중인 읽기를 조용히 훼손하는 예외가 아니다. 강제 철회라면 이후 읽기/다운로드를 거부하고 원인을 표시한다.
**자기 입장 보정:** AR-F3의 revision pin만으로 충분하다는 오독을 막기 위해 “pin 획득 가능 여부와 만료 동작도 같은 최소 계약”으로 강화한다.

### A2-G5 — C-K3/G4의 유일 seam·protocol 추출: 관계 이력은 수용, 일반화는 반박

Grok C-K3은 “Entity Link가 유일한 제품 간 seam”에 동의하고 G4는 권한/Audit protocol 추출을 권한다.
**[사실]** FeedbackOps `entity-links/service.ts`의 `EntityLinkProvider`는 내부 `Db`·제품 enum·`TaskReporterSummary`를 사용한다. 제품 query/approved command를 대체하는 중립 원격 API가 아니다.
관계 registry/visibility/history는 Entity Link, URL 전달은 Context Link, 상태 변경은 해당 domain command가 소유한다(`products/feedbackops/AGENTS.md`, 통합 repository-layout).
권한 protocol은 필요한 부분을 명세화할 수 있지만 기존 deny/role/Managed System의 전체 정책을 플랫폼 기본값으로 복사하면 안 된다.
`audit-service.ts::record(tx,input)`과 `db/tx.ts::Tx = Db | DrizzleTx`를 재확인했다. 같은 Tx의 설계 의도와 타입 강제·실제 rollback 증거는 다르다.
그러므로 호출 경계/rollback 증거를 확인하기 전 “안전한 공통 구현으로 추출”을 채택하지 않는다. 현재 orphan audit 버그가 있다는 주장도 하지 않는다.

### A2-G6 — G3/C3 후보 확장 및 export 권한: 대체로 수용, 강제 선택 순서는 유보

실제 Fastify/pg-boss 자산을 후보에 넣고 custom queue가 최소라는 단정을 철회하는 데 동의한다. Graphile Worker/Casbin은 비교 공백으로 남긴다.
다만 Fastify가 기각돼야만 Nest를 비교하거나 FastAPI를 API 후보에서 제거해야 한다는 순서는 현행 계약이 요구하지 않는다. 조직 운영·배포 제약도 선택 근거다.
`PermissionDecision`은 출력 계약이고 Casbin은 평가 구현 후보여서 대체 관계로 놓을 수 없다. 도구가 달라도 Scope 의미와 결과 계약은 필요하다.
enqueue/실행/다운로드 현재 권한 확인, snapshot은 감사 근거라는 구분을 수용한다. revoke 즉시 실행 중 모든 계산이 멈춘다는 보장은 별도 메커니즘 없이는 미검증이다.
이미 전송된 바이트 회수, 직접 발급 object URL의 즉시 철회도 약속하지 않는다. 첫 export는 인증 서버 다운로드 경로와 발행 전 재인가를 우선 후보로 둔다.
Grok의 원천 `R` 또는 정정 revision 키 제안은 후자까지 필요하다. R이 그대로여도 master 정정은 새 계산이므로 R만으로 멱등 키를 완성할 수 없다.

## 2. Grok의 Q1~Q3에 대한 답

- **Q1:** raw query 의미 보존은 첫 URL slice의 필수 경계다. custom parse/stringify와 서버 parity를 우선하며 JSON Schema 채택 여부와 분리한다(A2-G2).
- **Q2:** 전체 pointer 프레임워크는 필요하지 않다. 하지만 G1 열람 중 G2/G3 공개 후 export를 시작하는 반례 때문에 in-flight export만 보호하는 최소안은 불충분하다(A2-G4).
- **Q3:** 현재 계약에 FastAPI/Nest를 Fastify보다 의무 우선할 이유는 없다. 그렇다고 제품 서버 직접 흡수·큐 재사용이 승인된 것은 아니며 운영 제약과 이식 검증으로 선택한다(A2-G6).

## 3. 수정된 최소 조합과 결정 게이트

최소 조합은 구현 후보이며 착수 승인이 아니다. **Registry/Slots → raw codec → 현재 인증·Scope 판정 → 고정 결과 기준 → chart/table/CSV → 만료·재조회**의 한 흐름으로 평가한다.

| 경계 | 첫 흐름에 필요한 책임 | 지금 보류할 것 |
| --- | --- | --- |
| Kernel | §5의 정적 메뉴 개념 정보, §8 슬롯, Context Link·권한·Data Trust 계약 소비 | remote plugin/registry 관리 UI/범용 widget SDK |
| URL | raw 다중 값 보존, 카디널리티·집합 정규화, 미등록 현재 URL 보존, 공통 검증 벡터 | JSON Schema/TS/OpenAPI 형식의 근거 없는 확정 |
| 조회 | ready revision 탐색 → revision을 포함한 고정 캐시/요청, 결과의 입력·master·metric 기준 확인 | 전 플랫폼 pointer 서비스·모든 메뉴 공통 query DSL |
| 수명 | 후속 조회 가능 여부, 활성 read/export 보호, 명시적 만료와 일괄 재조회 | 숫자 TTL 임의 결정, 무한 과거 결과 재현, 범용 GC UI |
| 권한 | 현재 actor/Scope 판정, cache 격리, export enqueue/실행/발행·다운로드 검증 | 과거 허용 snapshot을 grant로 사용, 원격 제품과 단일 Tx 가정 |
| 작업 | 필요한 async job만, retry/input revision/fencing, timeout·rollback/풀 정리 | 큐 엔진 직접 제작 기본값, queue exactly-once를 외부 효과 보장으로 확대 |
| UI/백엔드 | TanStack/Radix 및 제한 ECharts 후보, Fastify+SQL-first와 다른 runtime 비교 | 도구 목록을 성능/접근성/운영 통과로 간주 |

결과 기준은 입력 수집 → 계산 → 검증 → 공개 → pin → 만료로 나눈다(COORDINATOR_NOTES N3). 공개 원자성만으로 build 중 입력 일관성이 증명되지 않는다.
서로 다른 revision이 있어도 비교 대상의 조립은 한 revision으로 유지한다. 새 ready를 발견하면 전체 전환 정책을 따르며 각 위젯을 조용히 독립 갱신하지 않는다.
권한 변경 시 계산 기준을 과거 ACL로 고정하지 않는다. 기존 허용 범위를 더는 제공할 수 없으면 실패/명시적 재조회로 전환하고 silent scope 축소로 parity를 위장하지 않는다.
R 부재는 자동 지연완료 재집계만 보류한다(N2). 첫 build·수동 backfill·master 정정은 별도 입력 검증을 따르며 R을 now로 조작하지 않는다.

## 4. 공식 문서 반영 방향과 남은 쟁점

| 소유 문서 | 채택 후 넣을 구체 문장 | 상태 |
| --- | --- | --- |
| `06` §5/§14 | “Kernel 책임은 반복 수요 승격 기준과 구분한다. 메뉴 내부 반복 패턴만 반복 확인 후 공통화한다.” | 기존 의미 재확인; 신설 프레임워크 지시 아님 |
| `06` §6.1 | “공통 artifact를 소비하기 전에 raw query의 카디널리티와 문자열 의미가 소실되지 않아야 한다.” | 기존 Decided의 검증 기준; 형식은 Candidate |
| `06` §11/§18 | “비교 결과 revision과 요청 경쟁 식별자를 구분하고, 후속 요청·캐시는 고정 결과 기준을 식별한다.” | 구현 후보, 필드명 미확정 |
| `01` mart 절 | “입력/마스터 기준을 검증해 공개하고, 유효한 read/export 참조를 보호하며 폐기 기준 요청은 명시적으로 만료 처리한다.” | Candidate; 장기 보존 숫자 Open |
| `03`/통합 문서 | “기존 Fastify/큐/권한 코드는 이식 후보이며 제품 DB·정책·Audit transaction 경계를 증명한 범위만 재사용한다.” | 선택 비교 보강, 제품 변경 승인 아님 |
| `05` | “공개 형식, read-basis 보유/만료, revoke 반영 경계, runtime/큐 선택은 별도 결정이며 구현 일정은 Deferred다.” | 기존 상태 유지 |

남은 쟁점은 schema 형식 선택, 권한 변경 감지/캐시 무효화 방식, 제한된 read-basis의 보유 수명과 원자 참조 방식, 실제 입력 revision 공급자다.
Grok과의 불일치는 Kernel 반복 대기, generation 없는 캐시 key, Entity Link 유일 API, 도구 비교 강제 순서다. 상대 R2가 이를 바꿨는지는 이 보고서가 주장하지 않는다.
이 불일치는 단순 문장 정리만으로 모두 닫히지 않는다. 캐시·retention·권한 전파는 실패 시나리오의 acceptance와 소유자 결정이 필요하다.

## 5. GLM R1 주장과 질문에 대한 답

[glm-r1](glm-r1.md) 전체를 읽었다. 아래 R1/R2/R3/R5보강/§7.5는 GLM 보고서 내부 ID다.

### A2-L1 — GLM R1의 “query key 세대 내장은 부트스트랩 순환/캐시 폭풍”: 반박

탐색 probe는 수용하지만 세대를 key에서 빼는 결론은 A2-G3의 같은 이유로 반박한다. probe 이후 고정 revision을 알면 순환은 없다.
새 key는 기존 엔트리 전부를 자동 무효화한다는 뜻이 아니다. 새 결과의 fetch 여부/시점은 구독·enabled·갱신 정책으로 조정할 문제다(공식 Query key 근거: A2-G3).
**Q1 답:** probe를 도입해도 revision별 캐시 구분이 필요하다. probe 실패 시 마지막 검증된 동일 Context 결과를 유효 수명 안에서 유지하고 실패/최신성 미확인을 표시할 수 있다.
권한이나 결과 수명이 무효화됐으면 유지하지 않는다. 이 조건의 stale-while-revalidate는 `06` §19의 same-context Refreshing과 양립한다. 실제 비용·폴링 수치는 미검증이다.

### A2-L2 — GLM R3의 Base UI 충돌 발견: 문구 누락은 수용, Decided 단정은 부분 반박

**[사실]** `06` §13에 “shadcn/ui + Base UI를 기반으로 한다”는 문장이 있다. 내 R1은 이 명시적 문구를 놓쳤으므로 충돌 후보로 추가한다.
그러나 `04`는 UI 계열 비교를 Candidate로 명시하고 `05`도 프론트 라이브러리 선택 전체를 Candidate로 추적한다. §13은 `06` 서두의 명시적 Decided 절 목록에도 없다.
따라서 Base UI가 이미 확정됐다고 단정해 Radix 비교 자체를 계약 위반으로 처리하지 않는다. §13의 단정 문구와 04/05의 상태를 먼저 정렬해야 한다.
**Q2 답:** 동일 기준 ① 키보드/focus trap·return/SR 이름 ② CJK 긴 레이블·200% 확대에서 오류/잘림 ③ 필요한 Dialog/Select/Popover 조합과 tokens 통합을 비교한다.
Radix를 승자로 선결정하지 않는다. 보안·접근성 수정 반영 비용까지 평가하고 선정 시 04/05와 06 §13의 문구를 함께 일치시킨다. POC 자체는 미실행이다.

### A2-L3 — GLM R2/권고4/R5보강의 보안·운영: 수용, 일부 보장·선택 범위 축소

**Q3 답:** creation-time 권한+짧은 TTL은 다운로드 재인가를 대체하지 못한다. 현재 Scope로 enqueue/실행/발행·다운로드를 검증한다. artifact 격리 방식은 별도 후보이며 모든 denial에 영구 폐기를 의무화할 필요는 없다.
`session-service.ts::SESSION_TTL_MS`, `loadAndTouch`를 확인했다. 12h는 절대 만료이며 touch는 last_seen_at만 바꾼다는 GLM V9/R5보강을 수용한다.
공용 단말 idle/max lifetime과 revoke 반영은 질문으로 등록한다. 12h 제품 상수 복사는 금지하되 새로운 시간 숫자는 정하지 않는다.
issuer/sub namespace와 제품 Managed System Scope를 플랫폼 단일 scopeId에 자동 동일시하지 않는 보강도 수용한다(N5). 기존 단일 issuer 제품의 버그로 단정하지 않는다.
query class별 자원 예산/동시성 경계를 수용하되 **별도 물리 풀**은 구현 후보다. 여러 pool이 같은 DB 총 연결 예산을 초과하지 않게 함께 검증해야 한다.
Node/Fastify 조기 **비교**에는 동의하나 지금 **확정**에는 유보한다. 조직의 Python 운영·배포/보안 지원 표준이 확정된다면 FastAPI API가 적합할 수 있으며 현재 그 사실은 미확인이다.
GLM §7.3의 “FeedbackOps 패턴 … job table+SKIP LOCKED”를 직접 자작 큐 존재 증거로 쓰지 않는다. 직접 확인한 `voc/jobs/embed-voc.ts`의 작업 등록은 PgBoss 의존 경로다.

### A2-L4 — GLM §7.5의 최소 read-basis: 부분수용, unknown fallback은 반박

reader pin/lease와 만료 구분은 수용한다. “각인 불가 라이브 join은 자기 basis, 못 남기면 unknown”은 Data Trust 정직성에는 도움이 되지만 chart/table/CSV의 같은 계산 기준을 보장하지 않는다.
가변 master가 바뀌면 같은 generation 표기라도 숫자가 달라질 수 있으므로, 고정 가능한 입력/결과를 사용하거나 해당 비교를 거부/새 revision으로 명시 갱신해야 한다.
ACL은 과거 결과에 각인해 권한을 동결할 대상이 아니다. 현재 권한으로 거절하는 것과 계산 기준을 고정하는 것은 독립 책임이다.
직전 ready 한 개/고정 grace TTL도 실행 중 reader 보호를 자동 증명하지 않는다. 갱신·만료·중단·삭제 경쟁을 A2-G4처럼 명시해야 한다.
GLM의 03-3 “Entity Link 유일 seam” 동의에는 A2-G5의 반박을 그대로 적용한다. V8의 Tx union 한계 인정은 수용하며 same-Tx 실행 보장은 여전히 미검증이다.
GLM R5의 “최초/수동 발행은 계속”도 입력 부족과 무관한 무조건 허용으로 읽지 않는다. 자동 창과 분리해 각 작업의 검증 조건을 판정한다.

## 6. 최종 입장 변경 및 검증 한계

R1에서 유지: raw codec 소유, 단일값/집합 분리, 입력·결과 세대와 권한 분리, Tx 근거 강도 제한, 작은 결과 세트 우선, 공식계약/도구 채택 상태 분리.
R1에서 보강: 탐색/고정 revision 캐시의 명시적 분리, export 시작 전 대기 중인 화면의 만료 처리, GLM이 발견한 Base UI 문구와 Candidate 상태 충돌, 절대 세션 만료·issuer namespace·총 DB 자원 예산.
남은 불일치: 두 상대의 revision 없는 key, 두 상대의 Entity Link 유일 API, GLM의 Node/Fastify 즉시 확정 및 unknown live-basis 허용, Grok의 Kernel 반복 대기 해석이다. 형식적 합의로 덮지 않는다.
**Grok R1과 GLM R1 모두 읽었고 두 보고서의 질문 Q1~Q3/§8 질문 1~3에 답했다.** 다른 리뷰어의 R2나 합의 결과는 읽었다고 주장하지 않는다.
문서/코드 정적 대조와 공식 JSON Schema/TanStack 자료 확인만 수행했다. 실행 테스트·install·server·DB·하위에이전트·commit/push는 하지 않았다.
작성 파일은 `discussion/astra-r2.md` 하나이며 기존 R1·원본 조사·공식 문서·서브모듈은 수정하지 않았다. 모든 구체 구현안과 acceptance는 미실행 Candidate다.
