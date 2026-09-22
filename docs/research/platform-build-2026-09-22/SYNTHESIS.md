# 플랫폼 구축 조사·토론 종합안

2026-09-22 · **Research / Candidate** · 코디네이터 판단. 기존 Decided를 변경하거나 구현 착수를 승인하지 않는다.

## 1. 결론

**플랫폼 고유 계약은 직접 소유하고, 실행 도구는 기존 구현과 OSS를 먼저 검증한다.** 첫 결과물은 메뉴 목록 확장이 아니라, 한 분석 메뉴가 Registry·Context·URL·현재 권한·동일 계산 기준·Data Trust 위에서 표/차트/CSV까지 일관되게 동작하는 흐름이어야 한다.

FeedbackOps에 실제 Fastify·TanStack·pg-boss·OIDC·권한·감사 자산이 있으므로 백지에서 스택을 고를 이유가 줄었다. 그러나 독립 제품의 DB·정책·시간 의미를 플랫폼에 그대로 복사할 근거는 없다. **Fastify와 pg-boss를 우선 검증 후보에 올리고, 제품 통합 경계와 이식 비용을 확인한 뒤 선택**하는 것이 권고다.

06 §13에는 Base UI 기반이라는 문구가 있지만, 04/05는 라이브러리 선택을 Candidate로 둔다. 기존 Radix wrapper를 곧바로 승자로 삼거나 Base UI를 확정 기술로 단정하지 않는다. 문서 간 상태를 정렬하고 동일 접근성·CJK 시나리오로 비교한 뒤 선택을 기록한다.

근거는 Luna Max의 [기능·프론트](01-kernel-frontend.md), [데이터·성능](02-data-performance-operations.md), [재사용·보안](03-reuse-security-integration.md), 세 모델의 R1/R2와 [코디네이터 원문 대조](discussion/COORDINATOR_NOTES.md)다. 원본에는 아래 정정이 있으므로 단독 실행 지침으로 사용하지 않는다.

## 2. 토론 방식과 증거 수준

- Luna Max 3개 병렬 조사 → Astra Medium / Grok **4.6 High** / OMP `zai/glm-5.3` Max의 독립 R1 → 상대 주장에 응답하는 R2 → 코디네이터 종합 순서다.
- [실행 기록](discussion/ORCHESTRATION.md)에 Orca Run·Task·Dispatch, 모델 설정의 실제 확인 근거와 완료 상태를 남긴다.
- 문서·코드 존재는 사실, 채택 우선순위와 실패 시나리오는 설계 판단, 성능·운영·실통합 적합성은 미검증이다. 모델 수나 동의를 벤치마크 대신 사용하지 않는다.
- 시작 root HEAD는 `e999c997a4282e9b88b6fb3df36c6212b8adf2e4`, FeedbackOps pin은 `b5dd614ac8da3792cb1627e7daeffb8fc9c4944e`다. package 선언과 최신 upstream 자료를 설치된 실행 버전으로 혼동하지 않는다.

## 3. 원본 조사에서 반드시 정정할 사항

| 원본 주장 | 종합 판정 | 근거·영향 |
| --- | --- | --- |
| 01 A1: 집합 중복 dedupe를 실패 취급 | 집합 ID는 중복 제거·정규화. 단일값 키는 같은 값의 반복도 오류 | 06 §6.1. raw 반복 정보를 잃기 전에 구별 |
| metric pair가 한쪽만 있으면 언제나 거부 | 초기화 및 path-owned 예외까지 현행 계약에 맞춰 검증 | Astra AR-F1. 일반 규칙만 복사하면 정상 진입을 막음 |
| 02 DP-05: R 없으면 auto publish 중단 | 자동 지연완료 재집계만 보류. 후보 보존·최초 build·수동 정정은 각 입력 조건으로 판단 | 05 및 06 §6.3. R을 now로 대체하지 않음 |
| ready pointer 교체로 일관성 확보 완료 | 공개 원자성 외에 원천·마스터·지표 입력 기준과 후속 읽기 수명 필요 | 코디네이터 N3. build 입력 혼합은 pointer가 해결하지 않음 |
| version 조합만으로 작업 멱등성 완성 | 같은 논리 작업 retry와 새로운 데이터/마스터 정정 revision을 구별 | N4. schema version이 같아도 재계산 필요 |
| 03: Audit Tx-only가 컴파일 타임에 강제됨 | 현재 `Tx = Db \| DrizzleTx`. same-Tx 설계 관례는 있으나 타입만으로 보장되지 않음 | Astra AR-F6, GLM V8. 실제 감사 누락 버그로 단정하지 않음 |
| Entity Link가 유일한 제품 통합 API | 관계·이력, Context Link, domain query/command를 구분 | Astra AR-F7. 내부 provider는 제품 타입과 DB에 결합 |
| Radix 우선이 현행 계약과 자연스럽게 일치 | 06 §13은 shadcn/ui + Base UI, 04/05는 Candidate. 선택 상태 정렬 필요 | GLM R3. 기존 wrapper 존재는 채택 승인 아님 |

원본 세 파일은 조사 당시 기록으로 변경하지 않았다. 이 표와 토론 기록이 정정 근거다.

## 4. 항목별 적용·재사용·대체 권고

| 영역 | 권고와 이유 | 재사용/대체 경계 | 채택 전 확인 |
| --- | --- | --- | --- |
| App Shell / Registry | 정적 선언형 메뉴와 필요한 슬롯부터 구현 후보로 삼음 | 직접 소유할 Kernel 계약. remote plugin/관리 UI는 보류 | 한 메뉴가 Context·권한·Data Trust를 같은 계약으로 소비 |
| URL / Context codec | raw key/value 다중 목록부터 공통 검증·정규화 | Router/Zod/schema는 수단. FE/BE 공통 artifact 형식은 Candidate | 단일값 중복, 집합 중복, 빈 값, 미등록 키, metric 예외의 parity |
| 요청·캐시 | 탐색용 조회와 고정 결과 revision 조회 분리 | TanStack Query 활용, 필요 이상 별도 coordinator 제작 보류 | G1/G2 캐시 충돌·늦은 응답·사용자 전환 방지 |
| 표·차트 | TanStack Table/Virtual, 제한된 ECharts adapter를 평가 | OSS로 rendering/virtualization 대체. 지표 의미·CSV parity는 직접 소유 | 실제 한국어 라벨·대량 행·키보드·숫자 일치 |
| UI primitive | 06 §13 문구와 04/05 Candidate 상태를 정렬하고 Base UI/Radix 비교 | FeedbackOps wrapper는 코드·token·접근성 점검 후 선택 이식 | focus 복귀, dialog, SR 이름, zoom, CJK, upstream 수정 반영 비용 |
| 백엔드 | Fastify를 우선 실증 후보로 추가 | 실제 제품 자산 활용. FastAPI/Nest 제거를 지금 확정하지 않음 | 배포/팀 운영, SQL 경계, 라이브러리 호환, 이식 비용 |
| 저장·집계 | 현행 PostgreSQL/read-only 원천/플랫폼 스키마 경계에서 시작 | SQL·호환 view·필요한 mart. 원천 스키마 소유권 침범 금지 | grain·단위·집계 가능성·naive wall-clock `[from,to)` |
| 결과 공개 | 한 흐름의 불변 read-basis와 검증 후 공개 | 작은 메타데이터/트랜잭션부터. 전 플랫폼 generation 서비스 보류 | 입력 확보→계산→검증→공개→pin→만료 |
| 작업 실행 | pg-boss 기존 자산과 Graphile Worker 비교 후보 | retry/lease 실행기를 직접 만드는 것을 기본값으로 삼지 않음 | 정정 revision, stale writer fencing, 중복 delivery, 재시작 복구 |
| 인증·권한 | OIDC/session 흐름 및 Decision 개념을 adapter 후보로 활용 | Workspace/Managed System/플랫폼 Scope 동치 가정 금지 | issuer+sub namespace, scope 매핑, idle/max lifetime, revoke |
| 감사 | 제품 내부 same-Tx 패턴과 runtime DB role guard 참고 | 원격 제품 사이 단일 Tx 가정 금지. 구현 추출 전 검증 | domain 변경과 audit rollback, correlation, 민감정보 최소화 |
| 내보내기 | 현재 권한 검증 + 고정 결과 기준 + 만료 정책 | 생성 당시 권한은 provenance. 영구 다운로드 권한이 아님 | enqueue/실행/발행·다운로드 재인가, TTL, 취소·DB 정리 |
| 제품 통합 | FeedbackOps 독립 유지, 관계/URL/domain 경계 분리 | Entity Link와 허용된 제품 API 조합 | 원격 오류·권한 불일치·중복 명령의 계약 |
| FileGateway / lineage | 증거 링크·추적 adapter로 제한 | FileGateway의 Seoul 해석을 플랫폼 시간 의미로 복사하지 않음 | offsetless 의미, 원본 접근권한, lineage source 신뢰 |
| BI·정책·OLAP | 목적이 맞는 기능에 한해 비교 후보 유지 | 완제품 BI로 Kernel 대체하지 않음. Casbin/OPA/OpenFGA는 정책 의미 대체물이 아님 | 실제 운영/규모/정책 복잡성으로 필요성 입증 |
| 알림·Saved View·widget | 구체 요구와 반복 패턴을 확인한 뒤 확장 | 범용 inbox/workflow/dashboard builder 선제 도입 보류 | 미지원 기능 선언, 기존 제품 요구와 플랫폼 공통 수요 구분 |

## 5. 가장 중요한 설계 보강

### 5.1 세 가지 유효성을 분리한다

`requestEpoch`는 브라우저 요청 경쟁, `resultRevision`은 숫자의 계산 기준, 현재 actor/Scope 판정은 접근 가능성을 설명한다. 하나의 generation 값으로 세 가지를 대체하지 않는다. 이름은 예시이며 필드 확정이 아니다.

최초에는 탐색 query로 ready 기준을 얻거나 첫 데이터 응답에서 기준을 획득한다. 그 뒤 표·차트·CSV는 같은 기준을 요청하고, **결과가 의존하는 revision은 고정 조회 캐시의 식별에 포함**한다. 모든 브라우저 요청 순번을 key에 넣으라는 뜻은 아니다. 탐색 응답보다 새 공개가 먼저 일어나도 요청한 기준을 읽거나 명시적으로 만료시켜야 한다.

이 기준은 [TanStack Query의 query key 지침](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys)과 일치하는 설계 판단이다. poll 때마다 전체 화면을 무조건 재조회할 필요는 없다. 무효화/전환 정책과 캐시 신원은 별개의 선택이다.

새 ready가 생기면 비교 대상 전체가 함께 전환하거나 기존 기준을 유지한다. 한 위젯만 새 revision으로 조용히 바꾸지 않는다. 권한이 줄어들었을 때 과거 ACL로 결과를 제공하거나 일부 Scope를 몰래 잘라 이전 결과와 일치하는 척하지 않는다.

### 5.2 최소 구현에서도 읽기 수명은 빠질 수 없다

G1 차트를 보는 동안 G2/G3가 공개된 뒤 CSV를 누르는 반례를 기준으로 삼는다. 이전 세대 1개 보존이나 실행 중 export만 보호하는 방식은 이 경우를 보장하지 못한다.

지원 기간 안의 read/export는 기준을 획득할 수 있어야 하고 삭제와 획득의 경쟁을 닫아야 한다. 지원 기간 밖이면 만료와 전체 새로고침을 명시한다. TTL 숫자·보관량·GC 관리 UI는 미룰 수 있지만 만료 동작 자체는 후속 CSV 제공 전에 필요하다. URL은 조건 재현이며 숫자의 영구 재현 약속이 아니다.

공개 pointer는 building 결과 노출을 막는 후보일 뿐 입력 snapshot을 대신하지 않는다. PostgreSQL Read Committed의 연속 SELECT는 같은 트랜잭션에서도 다른 snapshot을 볼 수 있다. [공식 격리 수준 문서](https://www.postgresql.org/docs/18/transaction-iso.html)

### 5.3 권한과 취소는 서버 경계까지 확인한다

export의 조회 조건·생성 actor·resultRevision·생성 당시 판정은 추적 정보다. 실제 접근은 현재 권한으로 확인한다. 첫 구현 후보는 인증 서버를 통하는 다운로드이며, 직접 object URL이 즉시 철회된다고 가정하지 않는다. 이미 전송한 바이트의 회수는 약속할 수 없다.

브라우저 AbortSignal 전달과 DB 쿼리 취소 성공은 서로 다른 증거다. timeout, 취소 후 rollback, 커넥션 반환, 동시 export 상한을 함께 검증한다. queue의 delivery 보장도 외부 부작용 exactly-once 보장으로 확대하지 않는다.

### 5.4 성능 개선은 측정값으로 고른다

첫 실측에서는 대표 범위·큰 범위·동시 조회/export를 분리하고 p50/p95, 실행 계획, 읽은 행/바이트, pool 대기, 취소 지연, mart build 지연, artifact 크기와 메모리를 기록한다. 목표 수치는 실제 데이터량·동시 사용자·운영 SLO를 받은 뒤 결정한다.

먼저 쿼리/인덱스/grain/사전 집계/동시성 제한을 확인한다. 병목이 입증될 때 read replica·별도 분석 저장소·DuckDB/OLAP 같은 분기를 비교한다. 라이브러리 소개나 합성 microbenchmark만으로 운영 성능 통과를 선언하지 않는다.

## 6. 첫 수직 검증 범위

작업 착수 시 권고하는 범위이며 이 조사에서 구현한 것은 아니다.

1. 정적 Registry에 대표 분석 메뉴 하나를 등록하고 Shell 슬롯 및 Context 연결을 확인한다.
2. 동일 raw URL 벡터를 FE/BE에 적용한다. wall-clock 의미, 단일값/집합 카디널리티, 미등록 키 보존과 메뉴 간 전달 규칙을 확인한다.
3. 서로 다른 actor/Scope fixture로 메뉴·직접 URL·조회·캐시·export의 현재 권한 판정을 검증한다.
4. 입력/마스터/지표 기준이 식별되는 작은 결과를 계산·검증·공개한다. 차트·표·CSV는 같은 기준을 사용한다.
5. G1 조회 중 G2/G3 공개, 늦은 응답, 권한 철회, 기준 만료, worker 재시도·lease 만료를 주입한다. 혼합 숫자·권한 누출·늦은 공개를 거부한다.
6. `outcome`과 `assessments[]`를 별도로 검증한다. 적용되는 assessment kind는 한 번씩, confirmed/clear는 source·observedAt, unknown은 사유를 포함한다. UI Loading을 서버 결과 상태로 섞지 않는다.
7. 대표 성능과 취소/복구 결과를 기록한 뒤 도구 선택과 두 번째 메뉴의 공통화 범위를 결정한다.

Kernel 책임은 첫 메뉴부터 지켜야 한다. 반면 범용 Table Toolbar·ChartFrame·필터 조합 등은 실제 2~3개 메뉴에서 반복을 확인한 뒤 공통화한다. 이 둘을 같은 승격 기준으로 묶지 않는다.

## 7. 문서별 반영 제안

현재 변경은 연구 문서와 INDEX 진입점이다. 아래는 채택 후 각 소유 문서에 반영할 변경안이며 이미 적용했다는 뜻이 아니다.

| 소유 문서 | 개선·보강 내용 | 결정 상태 |
| --- | --- | --- |
| [06 플랫폼 계약](../../06_platform_ui_contract.md) | raw codec 손실 방지 검증, 요청/결과/권한 구분, 후속 조회·캐시의 기준, export 재인가·만료 | 기존 계약 명확화와 신규 Candidate 구분. §13과 04/05의 선택 상태를 함께 정렬 |
| [01 데이터](../../01_architecture_and_data_contract.md) | 입력/마스터 revision 공급자, grain·집계 가능성, 공개 전 검증, read-basis 수명 | 구체 저장 구조·TTL Open |
| [03 백엔드](../../03_backend_stack.md) | Fastify·pg-boss 실제 자산 추가, runtime/큐 비교와 취소·복구 검증 | 스택 확정 전 Candidate |
| [04 프론트](../../04_frontend_ui_ux.md) | 탐색/고정 query 구분, raw parser adapter, table/chart parity, primitive 비교 | 라이브러리 POC 후보 |
| [05 결정 상태](../../05_roadmap_and_open_questions.md) | 아래 Open 질문과 채택 게이트 추적. Deferred Phase를 구현 승인으로 승격하지 않음 | Open/Candidate/Deferred 유지 |
| [통합 경계](../../integration/repository-layout.md) | 독립 제품·adapter·domain API·관계 링크의 책임, 이식 검증 범위 | 제품 코드/서브모듈 변경 별도 |
| [DESIGN](../../../DESIGN.md) | 결정된 primitive와 시각 token/component 표현만 반영 | URL/권한/상태 의미를 이 문서로 이동하지 않음 |

## 8. 아직 결정할 입력

- 실제 규모: 원천/집계 건수, 조회 범위, 동시 사용자/export, 허용 지연과 복구 목표.
- 원천·마스터·지표의 불변 revision을 누가 공급하는지, 정정 이벤트를 어떻게 식별할지.
- 결과 기준의 지원 수명과 만료 UX, 활성 읽기/삭제의 조정 방식.
- 조직 IdP·공용 단말 세션 정책·issuer 이전·Scope 계층 매핑·권한 변경 전파.
- 실제 배포/운영 책임과 Python 분석 요구: Fastify 재사용 이점을 뒤집을 구체 조건.

이 정보가 없어도 계약 벡터와 작은 fixture 검증은 진행할 수 있다. 운영 용량 숫자와 특정 기술의 최종 채택은 확정할 수 없다.

## 9. 검증 한계

문서·선별 코드·공식 자료를 대조했다. 플랫폼 서버·DB·IdP·부하·접근성 실기기·장애 복구 테스트는 실행하지 않았다. OSS 라이선스/edition/버전은 원본의 조사 시점 후보 정보이며 채택할 정확한 버전과 배포 방식에서 다시 검토해야 한다. 조사 결과는 실통합 완료나 성능 보장이 아니다.

## 10. 상호 반론 이후 최종 판정

[아스트라 R2](discussion/astra-r2.md), [Grok R2](discussion/grok-r2.md), [GLM R2](discussion/glm-r2.md)를 모두 읽은 코디네이터의 판정이다. Astra/Grok은 상대 R1에 답했고 GLM은 두 R2까지 읽었으므로, 앞선 보고서의 ‘남은 불일치’ 목록을 그대로 최종 합의표로 사용하지 않았다.

| 쟁점 | 토론에서 실제 바뀐 입장 | 코디네이터 최종 권고 |
| --- | --- | --- |
| Registry와 반복 후 공통화 | Grok이 Kernel 지연안을 철회, GLM도 수용 | Kernel은 첫 메뉴부터. 반복 패턴의 범용화만 뒤로 |
| revision 없는 캐시 | Grok이 무조건 제외를 철회, GLM이 탐색/고정 2단 구조 수용 | §5.1처럼 고정 조회의 신원에 revision 포함. 별도 probe endpoint 필수 아님 |
| 이전 결과 1개 보관 | 양측이 개수만으로 보호되지 않음을 수용 | 지원 수명·획득/삭제 경쟁·명시적 만료 필요. 특정 GC 프레임워크는 미채택 |
| Entity Link 유일 API | Grok과 GLM 모두 철회 | domain API / Context Link / 관계 이력 분리 |
| Base UI 확정 여부 | GLM이 Decided 단정을 완화, Astra는 상태 불일치 지적 | 06/04/05를 정렬. 어느 primitive도 이번에 승자 확정하지 않음 |
| Fastify 즉시 확정 | GLM이 ‘지금 확정’을 철회하고 게이트 확인 직후 확정 선호 | 우선 비교하되, 반대 근거 부재만으로 채택하지 않음. 실제 이식·운영 적합성의 긍정적 증거 필요 |
| master 기준을 unknown으로 대체 | GLM이 비교 결과에 대한 허용을 철회 | 숫자 비교는 고정 가능한 기준 필요. unknown 표시는 정합성 대체물이 아님 |

완전히 합의했다고 볼 수 없는 구현 세부도 남는다. 다음 세 가지는 리뷰어 제안을 그대로 채택하지 않는다.

- GLM R2의 `outcome=error + 새 사유 assessment kind`는 미채택이다. 만료 원인의 정확한 wire 표현은 06 §19의 기존 필드·허용 kind와 먼저 대조해야 한다. 원인 하나마다 assessment kind를 늘리지 않는다.
- Router 기본 parse나 `.catch()`를 이름만 보고 전면 금지하지 않는다. 공개 URL의 손실 없는 입력, 등록 키 오류 처리, 미등록 키 보존을 만족하는지가 판단 기준이다. 내부 typed subset의 검증 방식은 구현 선택이다.
- 권한 epoch를 캐시 key에 반드시 넣거나 반드시 빼는 합의는 없다. 사용자 간 격리, 권한 변경 시 보호 캐시 무효화, 서버 현재 권한 검증을 보장해야 한다. key와 무효화 메커니즘은 이를 만족하도록 정한다.

백엔드 결정 시점, 라이브러리 선택, 수명 숫자·권한 전파 방식은 여전히 Open/Candidate다. 위 판정은 표결 결과가 아니라 계약·코드와 구체 반례에 근거한 권고다.
