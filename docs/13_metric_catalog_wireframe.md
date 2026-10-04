# 13. 지표관리 — 카탈로그/상세 요구사항·와이어프레임

상태: 화면 계약 노트 / Catalog. 구현은 `menus/metrics`(읽기 전용, 합성 데이터)이다. 공개 필드명·버전 수명주기 세부는 Candidate이며 승인을 뜻하지 않는다.

범위 원본: [02 도메인 capability catalog](02_domain_menus.md#도메인-capability-catalog)의 지표관리. 전역 계약은 [06](06_platform_ui_contract.md), 셸은 [07](07_app_shell_wireframe.md), 스타일은 [DESIGN](../DESIGN.md)이 소유한다. 이 문서는 **지표 정의와 버전의 등록·발행 원본**을 설계한다. [11](11_productivity_overview_wireframe.md)과 [12](12_cycle_time_drilldown_wireframe.md)는 그 식별 쌍의 소비자이며 여기서 재설계하지 않는다.

## 1. USER TASK

- 사용자: 정의를 확인하는 분석 사용자, 정의를 등록·발행하는 지표 담당자. 역할명·발행 권한 배정은 Open.
- 주 작업: 카탈로그 검색 → 지표/버전 선택 → grain·분자/분모·기간·커버리지 기준 확인 → 사용처 확인. 담당자의 구조화된 초안 등록 → 검증 → 발행(작성 모드)은 Deferred다(§4).
- 결정: 이 정의가 분석 목적에 맞는가, 어떤 **명시적 버전**을 참조할 것인가, 변경이 어느 소비 화면에 영향을 주는가.
- 대상: 안정적인 `metricId` 아래의 `metricVersion` 레코드. occurrence anchor나 EquipmentID를 지표의 식별키로 쓰지 않는다.
- 빈도·규모: 분석 중 반복 참조, 정의 변경 시 간헐적 작성. 지표/버전/사용처 수는 Open; Desktop-first, 서버 조회·페이지네이션을 전제로 한다.
- 제외: 계산 엔진, SQL/수식/DSL 편집기, 범용 metric builder, Coverage 계산, 재집계 실행, 승인 워크플로, 다른 분석 화면 구현.

## 2. IA / SCREEN INVENTORY

[06 §12.4](06_platform_ui_contract.md#124-catalog)의 Catalog List / Definition Detail / Version / Ownership / Coverage / Usage-Dependency / History를 사용한다. [06 §20](06_platform_ui_contract.md#20-detail-surface-contract)의 **Metric Definition = Full Page**에 따라 상세를 큰 편집 Drawer로 만들지 않는다.

- 카탈로그(`/metrics`): 지표당 한 행, 게시 버전과 초안을 따로 표시
- 정의 상세 Full Page(`/metrics/:metricId`, 선택 버전은 page key `version`): 목적지 지표 + 선택 버전
  - Version: 게시/초안 목록, 명시적 버전 전환
  - Definition Detail: grain / 단위 / 기간 / 집계 계약
  - Ownership: 정의 책임자 / 소유 조직
  - Coverage: 정의의 적용 모집단 / 포함·제외 / 분모 기준
  - Usage / Dependency: 선택한 쌍의 소비 화면과 근거
  - History: 등록·변경·발행 who/when/before-after

목록 → 상세 → 목록 복귀 시 목록 조건 유지. 분석에서 다른 지표 상세를 열었더라도 “분석으로 돌아가기”는 진입 전 Context(그룹 Condition/Selection 포함)를 그대로 복원하며, 목적지 지표나 상세에서 고른 값으로 출발 조건을 덮어쓰지 않는다(`06` §6.4). 신규 등록과 새 버전 작성(작성 모드)은 Deferred다(§4).

## 3. SCREEN SPECIFICATION

로딩·빈 상태·오류는 영역별 상태(§7)와 `06` §17/§19가 기준이다. 아래 §3.1–3.3이 이 화면의 Context·진입·수명주기 계약이다.

### 3.1 Context Capability / 상태 소유 (매니페스트 `menus/metrics`)

[06 §6](06_platform_ui_contract.md#6-context-capability-contract)의 Metric Catalog 예시와 같은 선언이다. 목록(`metric-catalog`)과 상세(`metric-detail`) 모두 같다.

| Time | Equipment | Lot | Metric Version |
| --- | --- | --- | --- |
| unsupported | selection `reference` — 전달·참조, 정의 목록 필터 아님 | unsupported | metric `apply` — 같은 지표의 해당 버전 조회 |

roomNames·Condition·PPID·Recipe는 `unsupported`다. 둘 다 `pageType: catalog`, 권한 `metrics:view`, `requiresScope: false`다. 카탈로그 정의를 Scope별로 복제할지/공유할지는 Open이므로 그 결정 전까지 Scope 선택을 요구하지 않으며, 결정되면 이 선언을 다시 본다. 이는 Scope 접근 검증을 생략할 이유가 아니다. Scope 선택기는 사이드바 머리 하나다(06 §7). Site→room_name→StGroup→Equipment 관계와 독립 Line 축을 따른다([06 §6.2](06_platform_ui_contract.md), [ADR-0005](adr/0005-scope-room-name-line-independent.md)).

전달된 Time/Lot/PPID/Recipe/room_name과 Equipment 선택은 URL에 보존하고 "이 페이지 미적용"으로 표시한다. Equipment는 참조만 가능하며 명시적 공집합도 카탈로그 결과를 0건으로 바꾸지 않는다. Equipment Group의 Condition과 고정 Selection을 사용한 축(StGroup / 분임조 / Maker+Model) 그대로 보존하며, 이 화면은 둘 다 정의 목록 필터로 적용하지 않는다([06 §6.1/§6.4](06_platform_ui_contract.md), [ADR-0002](adr/0002-stgroup-materializes-to-equipment-ids.md)).

page-owned 키(등록: [06 §6.1](06_platform_ui_contract.md)): 목록은 `q`(이름 또는 metricId 검색)·`status`·`domain`·`sort`·`page`(Global Context가 바뀌면 `page`를 지운다), 상세는 `tab`(영역 이동)·`version`(목적지 버전)·`returnTo`다. 등록 값 밖의 값은 다른 값으로 바꾸지 않고 오류로 보인다. 목록 조건은 전역 Context 칩으로 위장하지 않는다.

### 3.2 목적지 객체와 전역 쌍

공개 쌍의 스키마/라우팅은 Kernel 소유이고, **그 쌍이 가리키는 정의·버전·게시 상태의 원본은 이 Catalog**다. 서버 소비 계층은 SQL/컬럼/계산 매핑을 소유한다([06 §6.1](06_platform_ui_contract.md), [01 아키텍처](01_architecture_and_data_contract.md)).

라우트는 `/metrics`(목록)와 `/metrics/:metricId`(상세)다. 버전은 경로가 아니라 상세의 page key `version`으로 지정하며 별도 버전 경로는 만들지 않는다. query의 전역 `(metricId, metricVersion)`과 상세의 객체 `(metricId, version)`은 별개 역할이다.

| 진입 상태 | 처리 — [06 §6.1 전체 불변식](06_platform_ui_contract.md) 적용 |
| --- | --- |
| query에 둘 다 있음 | 서버가 소속·유효성·권한 검증. 같은 지표면 해당 버전만 적용; 무효이면 오류. 최신 대체 없음 |
| query에 ID만 있음 | 초기화를 선언(`initializesMetric`)한 메뉴 — 현재 상세 `metric-detail`만 — 에서만 서버가 **게시된 버전**을 확인하고 URL 쌍을 먼저 완성한 뒤 조회. 확인 불가/게시 없음이면 버전 선택 안내. 선언하지 않은 메뉴(목록 포함)는 계약 오류로 거절한다 |
| query에 버전만 있음 | 목적지 경로가 유일하게 지표를 식별할 때만 경로 ID를 query에 복사. 목록에서는 오류; 세션·이전 화면으로 추정 금지 |
| query에 둘 다 없음 | 목록은 선택 상태. 상세는 선언된 초기화로 게시 버전을 URL에 기록 후 조회. page key `version`이 있으면 그 버전이 목적지 객체이고 전역 쌍은 없음 |
| 객체 B + 전역 A | A를 보존·미적용 표시하고 객체 B만 조회. 목적지 B로 전역 A를 덮어쓰지 않음 |
| 객체 B v3(page key `version`) + 전역 B v2 | 같은 지표에 상충한 버전은 오류; page key/전역 우선순위로 보정하지 않음. 전역 버전을 페이지에서 보는 동작만 제공 |
| 쌍의 일부 제거·단일 키 중복 | 쌍은 함께 보존·변경·제거. 단일 키 반복은 같은 값이어도 오류 |

목록의 링크는 page key `version`으로 목적지 버전을 정확히 지정한다(게시 포인터가 없으면 카탈로그 버전). 전역 쌍은 상세의 "이 버전을 분석 Context로 사용"으로만 바꾸며 쌍 전체를 바꾼다. 다른 지표의 전역 쌍이 있으면 바뀌는 내용을 표시하고, 초안 버전은 분석 Context로 쓸 수 없다. 초기화로 어떤 게시 버전을 고를지(기본 게시 포인터 등)는 Open이며 클라이언트가 최대 버전 번호를 고르지 않는다. 이미 완성된 URL은 신규 발행·새로고침·뒤로가기에도 자동 갱신되지 않는다. 버전 없는 객체 B 상세에 전역 A가 있으면 A를 B의 버전으로 쓰지 않고 B의 명시적 버전 선택을 요구한다. 객체 B를 초기화하며 전역 A를 덮어쓰지 않는다.

### 3.3 버전 수명주기 — Candidate 설계, 발행 의미는 필수

`draft(초안) → published(게시)`를 분리한다. 초안은 담당자가 명시적으로 선택한 Catalog 작성/조회에서만 접근하고 게시 초기화 후보나 분석 참조 가능 버전으로 반환하지 않는다. 잘못 전달된 초안을 분석 화면에서 게시 버전으로 치환하지 않는다. 공개 enum/분석 사용 가능성 검증 API는 Open.

Candidate로 최초 등록은 서버 발급 `metricId`와 초안을 만들고, 새 버전은 같은 ID 아래 새 `metricVersion`을 예약한다. ID/버전 채번·동시 작성 정책은 Open. 초안 저장은 발행이 아니다. 게시 후 정의 필드를 덮어쓰지 않고 새 버전을 만든다. 발행은 서버가 스키마·권한·충돌을 재검증한 후 정의 스냅샷/게시 상태/감사 이력을 일관되게 기록한 성공 응답으로만 확정한다. 실패·응답 유실은 확인 중/실패로 남기며 재조회로 확인한다.

게시 v3 뒤에 v4를 발행해도 v3 링크는 v3를 유지한다. 게시 취소·폐기·보존 기간은 Open이며 이번 UI에는 삭제/자동 대체 동작을 넣지 않는다. 유효하지 않게 된 참조는 명시적 오류이지 최신값 대체 사유가 아니다. 발행 완료는 mart 재계산 완료를 뜻하지 않는다([01 mart 재계산 트리거](01_architecture_and_data_contract.md#mart-재계산-트리거)).

## 4. LAYOUT BOUNDARY

배치는 구현(`menus/metrics/src/pages`)이 기준이다. 셸은 현재 [07](07_app_shell_wireframe.md)의 배치와 [06 §7](06_platform_ui_contract.md#7-application-shell)의 치수·여백, FeedbackOps 공유 토큰 및 [DESIGN](../DESIGN.md)의 플랫폼 확장·pairing을 소비한다. 카탈로그 목록은 게시 버전과 초안을 별개로 보이고 초안은 분석의 기본 버전으로 쓰이지 않는다. 표는 모든 게시 버전을 나열하지 않고 확인된 대표 게시 버전을 보이며(대표 선택 규칙 Open) 행이 최신 버전을 보장한다고 표기하지 않는다. 버전 전체는 상세 Version 영역에서 확인한다.

상세는 Definition/Coverage/Usage/History를 숨은 탭으로 감추지 않고 한 Full Page에 두며 `tab`은 영역 이동일 뿐이다. 좌열의 Version/Ownership은 관리용 Drawer가 아니다. History는 지표 전체 흐름을 버전 라벨과 함께 보여주며 Usage는 **선택 쌍**만 조회한다.

**작성 모드(Deferred)**: 정의 등록·새 버전 초안·발행 확인은 만들지 않았다. 구현은 읽기 전용 카탈로그이며 `정의 등록` 컨트롤이 없다. 도입한다면 구조화 필드만 받고 계산식 입력은 없다. `초안 저장`과 `발행`을 구분하고, 발행 확인 Modal에는 ID/버전/변경 요약/확인된 사용처 범위/기존 참조 유지/재계산과 발행의 차이를 표시한다. 게시/초안 동작은 권한 검증 결과에 따라 제공한다.

## 5. CONCEPTUAL COMPONENT MAP

| 계층 | 재사용 / 화면 책임 |
| --- | --- |
| Kernel / Shell | Registry, Scope/permission, Breadcrumb, GlobalContextBar, 등록된 URL 계약, Context Link helper |
| Platform | PageHeader, PlatformDataTable(정렬·컬럼·선택·내보내기·가상화), 상태 피드백, 확인 Modal, AuditTimeline |
| Domain | MetricCatalogRows, MetricDefinitionRecord, MetricVersionSelector, OwnershipSection, MetricCoverageBasis, MetricUsageDependencies, 초안 필드 검증 |

개념적 이름이며 구현 컴포넌트 확정이 아니다. 지표 집계 스키마·버전 수명주기를 Kernel에 넣지 않는다. Catalog용 범용 builder를 추출하지 않는다([06 §4/§13/§14/§24](06_platform_ui_contract.md)).

## 6. DATA REQUIREMENTS

각 행은 필요 데이터와 근거를 함께 기록한다. 필드명·enum은 Candidate, source에 없는 업무 규칙은 Open이다.

| 데이터 | 구조·검증 / 소유 | 근거 |
| --- | --- | --- |
| 정체성 | `metricId`, `metricVersion`, 이름, 설명. 쌍 유일성·버전 소속 검증, ID 안정성. 메타 DB의 지표 정의/버전 원본 | [06 §6.1](06_platform_ui_contract.md), [01 아키텍처 구성](01_architecture_and_data_contract.md), [02 지표관리](02_domain_menus.md) |
| 발행 | `publicationState=draft/published`, 등록·갱신·발행 주체/시각, 변경 사유, 후보 `revision` 충돌 토큰. 게시 초기화 응답은 게시 상태 근거 필요; 선택 정책 Open | [02 등록·발행·이력](02_domain_menus.md), [06 §6.1](06_platform_ui_contract.md); 수명주기 구체화는 §3.3 Candidate |
| 정의 기준 | `grain`, `unit`, `periodBasis`, null 의미, `sourceContractRef`와 지원 원천 버전. 기간 기준은 메타데이터이며 이 화면의 전역 Time 필터가 아님 | [01 대응](01_architecture_and_data_contract.md#대응), [02](02_domain_menus.md), [06 §6.3](06_platform_ui_contract.md#ctx-time) |
| 비율 집계 스키마 | `metricKind=ratio`이면 `numerator={measureRef,unit,aggregation:sum}`와 `denominator={measureRef,unit,aggregation:sum}` 필수, `reaggregationRule=ratioOfSums`, `aggregationSafety={averageOfRatiosAllowed:false,validationState}`. 서버 등록·발행 검증이 쌍 누락/단순 평균/단위·grain 부적합을 거부. 참조는 소비 계약 measure ID이지 수식 텍스트가 아님 | [01 집계 가능성 계약](01_architecture_and_data_contract.md#집계-가능성-계약), [02 지표관리](02_domain_menus.md); 스키마 필드 모양 Candidate |
| 집계 안전성 조건 | sum 허용은 같은 정의·호환 grain·겹치지 않는 기초 관측·기간/단위 조건 충족 시에만 유효. 분모 0/null 처리와 물리 점유율의 중첩/모집단 세부는 Open. `validationState=unverified`를 안전 판정으로 표시하지 않음; 발행 전 충족해야 할 서버 검증 규칙 확정 필요 | [01 대응/집계 가능성](01_architecture_and_data_contract.md), [06 §19](06_platform_ui_contract.md); 가드 표현 Candidate |
| 분위수/계수 구분 | `metricKind=quantile`이면 비율 분자·분모는 notApplicable, `reaggregationRule=recomputeFromDistribution`, `averageOfQuantilesAllowed=false`, 기초 분포 계약 참조 필수. P50/P95는 cycle-time의 같은 버전 소비. count는 허용되는 가산 grain·단위 명시. 분위수 알고리즘/merge 가능한 통계 구조는 Open | [01 집계 가능성](01_architecture_and_data_contract.md#집계-가능성-계약), [11 §3.1](11_productivity_overview_wireframe.md), [12 §6](12_cycle_time_drilldown_wireframe.md). P95를 비율처럼 분자/분모 합산으로 계산하지 않음 |
| Coverage 기준 | `coverageBasis={populationRef,includedBasis,excludedBasis,denominatorBasis,sourceRef}`를 버전별 정의 속성으로 표시. 지표 값의 denominator와 Coverage denominator는 별도 필드. 참조 불명확 시 미정/Unknown. 런타임 비율/관측 건수는 이 레코드에 만들어 넣지 않음 | [02 공통 지표 정의 관리](02_domain_menus.md), [06 §12.4/§18](06_platform_ui_contract.md), [11 §6](11_productivity_overview_wireframe.md). 두 Coverage 계약의 직접 연결은 Open |
| Ownership | `ownerRef`, `organizationRef`(미정 가능), 정의 책임과 발행 권한은 별도. 조직·역할 매핑 Open | [06 §12.4/§17](06_platform_ui_contract.md); 세부 Candidate |
| 사용처 추적 | 선택 쌍을 키로 `consumerMenuId/screenId`, 소비 위치, 명시적 버전 binding, `evidenceSource`, `observedAt`, 조회 범위/완전성 상태. 화면 등록/배포 의존 선언 또는 관측 중 어떤 것이 원천인지는 Open. 소스 미연결은 Unknown; 0건 성공과 다름 | [06 §12.4/§22/§19](06_platform_ui_contract.md), [02 다른 분석 메뉴 참조](02_domain_menus.md), [11 §3.1](11_productivity_overview_wireframe.md), [12 §3.2](12_cycle_time_drilldown_wireframe.md) |
| 사용처 예시 매핑 | occupancy/v3 → 11 물리 점유율 KPI; cycle-time → 11 사이클 P50/P95 및 12 사이클 상세. 지표별 버전 page key 등록 여부는 결정 대기([11 §3.1](11_productivity_overview_wireframe.md))이고 실제 ID 매핑은 두 소비자 문서에서 Open이므로 실제 등록 실적이라고 주장하지 않음 | [11 §3.1](11_productivity_overview_wireframe.md), [12 §6](12_cycle_time_drilldown_wireframe.md) |
| 이력 | event ID, metricId/version, actor, 시각, action, before/after, 변경 사유. 메타 정의 발행 이력과 mart 계산 세대는 구별 | [02 Audit Trail](02_domain_menus.md), [01 mart 재계산 트리거](01_architecture_and_data_contract.md#mart-재계산-트리거) |
| 요청/권한/상태 | Scope·목적지·전역 쌍 재검증. 목록·정의·사용처·이력 각 outcome와 선언된 assessments, 근거 시각/원천, Correlation ID. Catalog에 의미 없는 runtime coverage assessment를 억지로 추가하지 않음; 적용 kind 목록 Open | [06 §6.2/§17/§19](06_platform_ui_contract.md) |

## 7. INTERACTION RULES

| 규칙 | 근거 / 상태 |
| --- | --- |
| 초기화에서는 서버가 확인한 게시 버전을 URL에 기록한 뒤 조회; 초안만 있거나 확인 불가이면 선택 안내. 완성된 쌍은 자동 변경하지 않음 | [06 §6.1](06_platform_ui_contract.md), [02 발행](02_domain_menus.md) / Decided 경계 |
| 명시적 버전 선택은 목적지/전역 쌍 충돌을 검증하고 새 버전 내용 로딩. browser back/forward는 등록된 URL 상태로 재검증하며 이전 버전을 최신으로 승격하지 않음 | [06 §6.1/§6.4/§11](06_platform_ui_contract.md) |
| 작성 모드 도입 시: 초안 저장과 발행을 분리; 게시본 직접 편집 대신 새 초안. 검증 오류/권한 오류/동시 변경은 값을 보존하고 해당 원인과 재조회 경로 제공 | [02 등록·발행·이력](02_domain_menus.md), [06 §17/§19/§20](06_platform_ui_contract.md) / 구체 UI·충돌 정책 Candidate |
| 작성 모드 도입 시: 발행 확인은 정확한 쌍과 변경 요약을 표시. 서버 성공 전 게시 배지로 바꾸지 않음. 기존 소비자의 버전 일괄 변경 없음 | [06 §6.1/§20](06_platform_ui_contract.md), [02](02_domain_menus.md) / Candidate 실행 흐름 |
| 사용처 클릭은 helper를 사용, 같은 metricId의 해당 버전을 지원할 때만 적용. 필요한 Time/Scope 등이 없으면 목적지 규칙에 따른 선택/초기화; 임의 분석 기간 생성 금지 | [06 §6.1/§6.3/§6.4/§22](06_platform_ui_contract.md) |
| 사용처 원천 미연결·대상 등록 전에는 준비 중으로 설명. 권한 없음은 별도 사유, 타 Scope 소비자 이름/건수도 서버 노출 범위 안에서만 표시 | [06 §5/§17/§19](06_platform_ui_contract.md) / 준비 중 표현 Candidate |
| 목록과 내보내기는 같은 필터·Scope·권한을 검증; 테이블의 resize/visibility/pin/selection/preference는 공통 계약 소비. 일괄 발행/삭제는 없음 | [06 §15/§17](06_platform_ui_contract.md), [02](02_domain_menus.md) |
| Scope 변경/권한 재검증 중에는 기존 정의·사용처를 숨김. 같은 요청 재조회만 이전 데이터+Refreshing 허용. 늦은 응답을 새 쌍의 결과로 채택하지 않음 | [06 §11/§19](06_platform_ui_contract.md) |
| 장기 조회는 취소·검색 범위 축소; 사용처·이력은 서버 페이지네이션, 전체 관계를 브라우저에 내려 계산하지 않음 | [06 §15/§27](06_platform_ui_contract.md) |

### 영역별 상태

| 상황 | 표시 / 복구 |
| --- | --- |
| Scope 미선택 | 명시적 Scope 선택 안내; 임의 기본 Scope 없음 |
| 정의 조회 forbidden | 권한 제한; 데이터 없음 문구 금지 |
| 버전이 존재하지 않음/지표 소속 다름 | 요청 버전 오류 + 목록 복귀/명시적 재선택; 자동 fallback 없음 |
| 게시 버전 없음 | 게시된 버전 없음 / 권한 있는 담당자에게 초안 명시 진입 |
| 사용처 소스 미구현/조회 실패 | Unknown 또는 Server error + 재시도/Correlation ID; 사용처 없음으로 보정 금지 |
| 사용처 성공 0건 | 확인된 범위의 사용처 0건; 전 플랫폼 미사용이라고 확대하지 않음 |
| Coverage 기준 필드 미정 | 정의 기준 미정; 0%나 Insufficient coverage를 추정하지 않음 |
| History만 실패 | 이력 영역 오류, 정의는 유지; 발행 상태의 서버 확인을 이력 실패로 대체하지 않음 |

상태의 근거는 [06 §6.2/§17/§19](06_platform_ui_contract.md)이며 원인 주장은 서버 status source 확인 시만 허용한다.

## 8. DESIGN DECISIONS / OPEN QUESTIONS

**원본 계약 준수:** Catalog 원본/소비자 구분, 단일 전역 쌍, 게시 초기화와 최신 자동 대체 금지, 비율 분자·분모 개별 합산 및 P95 평균 금지, room_name 기준 Scope와 독립 Line 축, 공통 권한·상태 계약. 이 문서가 플랫폼 Decided를 새로 만들지 않는다.

**Candidate 판단:** 초안→게시와 게시 스냅샷 불변/새 버전 작성, 구조화 union 스키마, Ownership 배치, 사용처 근거/확인 범위 모델, 충돌 토큰. 소스의 "등록·발행·버전"을 구체화한 설계 제안이다. 경로(`/metrics`, `/metrics/:metricId`)·page key·초기화 선언은 구현된 매니페스트 값을 따른다(§3.1–3.2).

**Deferred:** 작성 모드(정의 등록·새 버전 초안·발행 UI).

**Open:** 게시 초기화 선택 정책, 채번/동시 초안/게시 취소·보존, 정의 소유 조직/권한·Scope 공유 모델(정해지면 `requiresScope` 재검토), 실제 grain·기간 귀속·분모 0/null·모집단·집계 검증, 분위수 계산 계약, 원천 참조/분석 버전 binding, Coverage 기준과 runtime Coverage 연결, 사용처 추적 공급자/완전성/갱신·개인정보 노출, 정의 발행→mart 재계산의 준비 상태 계약.

## OPEN QUESTIONS / RISKS

- 게시 초기화와 초안의 구분이 서버 계약에 없으면 이 화면의 배지만으로 분석 참조 안전성을 보장할 수 없다.
- 게시 정의를 덮어쓰거나 소비자의 binding을 자동 변경하면 저장된 `metricId`+`metricVersion` 링크의 의미가 변한다.
- `ratioOfSums` 표기만으로 중복 관측·시간 중첩·분모 누락이 해결되지는 않는다. 실제 source/grain/검증 계약 확정이 발행 구현의 전제다.
- 사용처 예시 행은 추적 기능의 구현 증거가 아니다. 공급자/권한 필터/관측 시각/조회 범위가 없으면 의존성 완전성이나 미사용을 단정할 수 없다.
- Coverage 정의 기준을 11의 런타임 Coverage 수치로 읽게 만들면 신뢰 상태가 왜곡된다. 이 화면은 비율을 표시하지 않으며 연결 계약은 Open이다.
- 발행 후 mart 준비·계산 세대 정합성은 [01](01_architecture_and_data_contract.md)의 별도 책임이다. 게시되었다는 이유로 분석 계산 완료를 주장하지 않는다.
