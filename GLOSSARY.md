# Analytics Platform

설비 계측 데이터를 Scope(조회 범위)로 좁혀 분석하는 사내 플랫폼의 핵심 도메인 개념. 현행 용어와 관계를 아래에 정의한다. 전역 소비 계약은 [06](docs/contract/platform-ui-contract.md), 결정 근거는 [ADR](docs/adr/)을 따른다.

## Language

견본 메뉴가 쓰는 지표·업무 용어의 정의는 **견본 정의**다. 사내 적용(M4) 때 도메인 담당이 준 정의로 바꾼다(사용자 2026-10-27). 실제 메뉴가 쓸 이름을 이 용어집에 미리 넣지 않는다.

### 물리 조직과 접근 범위

**Site**:
공장이 위치한 최상위 물리 조직 단위. 여러 room_name과 Line을 포함한다. 접근 범위의 관계는 Site → room_name → StGroup → Equipment이며, Line은 room_name과 교차하는 독립 축이다. Site별로 물리 DB가 분리돼 있어 Site는 DB 연결 경계이며, 설비 ID를 쓰기 전에 활성 Scope에서 먼저 확립돼 있어야 한다([ADR-0004](docs/adr/0004-site-is-db-partition-not-column.md)).
사이트는 MEM(메모리)·FDRY(파운드리)다(mock 값).
_Avoid_: 사업장 — 기존 문서에서 느슨하게 쓰이던 표현으로, 앞으로는 Site로 통일한다.

**Line** (`lineNames`):
Site 내부의 실제 생산 라인. room_name과 교차하는 독립 조회축이며 권한 레벨이나 room_name을 포함하는 상위 접근 범위가 아니다. 하나의 room_name이나 StGroup이 여러 Line에 걸칠 수 있다. Factory는 별도 Scope 레벨로 모델링하지 않는다.
_Avoid_: 공장, Factory — 구어로는 Line과 같은 뜻으로 쓰이지만, 공식 계층에는 Factory 레벨이 없으므로 Line만 쓴다. 근거: [ADR-0005](docs/adr/0005-scope-room-name-line-independent.md).

**Scope** (`scopeId`):
사용자가 조회 한 번에 고르는 단일 접근·조회 범위로, 단위는 Site다 — 데이터가 Site별로 나뉘어 있고 사용 권한도 보통 Site 단위로 나뉜다. 그 Site 안에서는 부여된 room_name만 보이며, 서버가 요청마다 권한을 다시 검증한다. v1은 단일 Scope 선택이다([06 §6.2](docs/contract/kernel.md#62-scope와-권한-decided--open)).
_Avoid_: 범위, 조회 범위(단독) — 화면 문구도 `Scope`로 쓴다. 결과 크기를 말할 때는 범위 대신 조건·결과를 쓴다.

### 설비 식별 계층

**Maker**:
설비를 만든 제조사. Model의 상위 개념이며, 하나의 Maker가 여러 room_name에 걸쳐 설비를 공급할 수 있다.
_Avoid_: 벤더, Vendor

**Model**:
특정 Maker가 만든 설비 기종. Maker 아래, ChamberType 위의 계층.

**ChamberType**:
Model보다 더 세부적으로 설비를 분류하는 값. 외부 시스템에서 공급되며, 이 플랫폼이 직접 산출하지 않는다.
_Avoid_: 분류값을 `챔버`(단독)로 부르기 — 분류값은 ChamberType으로 쓴다. 화면의 `챔버 유형`은 ChamberType의 한국어 이름이다.

**Chamber** (`챔버`):
설비 안의 개별 챔버를 가리키는 말. 설비를 나누는 분류값인 ChamberType과 구별한다(ChamberType은 분류, Chamber는 개별 대상). Module/Slot과의 정확한 관계는 도메인 담당 확인 전이라 임시다(사용자 2026-10-27: 개별 챔버도 용어로 둔다. 화면 문구는 그대로).

**EquipmentID**:
실제 설비 한 대를 가리키는 식별자이자 사람이 부르는 이름이다. 모든 Site에 걸쳐 전역적으로 유일하며, 설비를 가리키는 키는 이것 하나다. Maker → Model → ChamberType → EquipmentID 설비 분류 계층의 최하위이며, 설비 내부 이벤트에는 이보다 세부적인 Module/Slot 단위가 있다.
_Avoid_: 설비명, EquipmentName — EquipmentID와 별개인 설비 이름은 없다.

**유효구간** (`validFrom` / `validTo`):
설비 마스터 속성이 유효한 `[valid_from, valid_to)` 이력 구간. 설비 사용중지는 물리 삭제가 아니라 그 ID 이력의 `valid_to` 종료이며, 종료된 ID는 다른 용도로 재사용하지 않는다([ADR-0003](docs/adr/0003-equipment-master-platform-owned-target.md)).

**설비 상태** (`status`):
샘플 설비 메뉴 코드는 `active`·`idle`·`maintenance`·`retired` 네 값을 쓴다. 이 값들의 도메인 의미와 소유자는 정해지지 않았다. 문서가 정의하는 상태는 사용중지(유효구간 종료)뿐이다.

### 공정 범위와 설비 그룹

**room_name** (`room`, URL 키 `roomNames`):
설비가 속한 공정의 이름(예: PHOTO, ETCH)이자 Site 내 권한·조회 범위의 기준 축. 같은 room_name이 여러 Site에 있을 수 있으며 Site 안에서 구분된다. 하나의 room_name이 여러 Line에 걸칠 수 있으며 Maker/Model 계층과도 독립적이다. 보통 등록 시 정해진 값이 유지되지만 드물게 바뀔 수 있고, 이때도 같은 EquipmentID를 유지한다.
화면 이름은 `공정`(en `Process`)이다(사용자 2026-10-23, 2026-10-27 확정). 코드·문서의 이름은 room_name이다.
_Avoid_: 공정 구역 — `Process`는 room_name의 화면 영어 이름으로만 쓰고 다른 의미와 섞지 않는다. Job 안의 PRC 실행 시간대는 `공정 구간`이 아니라 `PRC 구간`이라 쓴다.

**StGroup** (`stgroup`):
하나의 Operation(제품 라우팅 작업 단위, 아래 참고)을 상호 대체 수행할 수 있는 **설비 단위**(Module/Slot 단위 아님) 묶음. 담당자·조직이 아닌 **공정 능력(capability) 단위**다. Site와 room_name 경계를 넘지 않으며, 여러 Line에 걸칠 수 있다. Maker/Model 분류와는 별개다. 소속은 가변적이고 외부 시스템에서 공급받는다. 사용자가 그 시점 소속 / 지금 소속을 골라 조회하며, 소속 이력이 없는 축은 지금 소속만 허용한다([ADR-0059](docs/adr/0059-app-injected-equipment-axes-and-condition.md)).
_Avoid_: 분임조 — 분임조는 StGroup과 별개의 값이다(아래 참고).

**PRC 그룹** (`prcGroups`):
제품을 만드는 과정에서 실행되는 레시피를 실행할 수 있는 **설비 단위**의 묶음으로, Job이나 PRC 실행 이벤트 및 Operation 대체 수행 기준의 StGroup과 구별한다. 설비는 한 시점에 PRC 그룹 하나에만 속하며 소속은 기간에 따라 바뀔 수 있다. 서버가 소속 이력을 공급하고 `membershipBasis=asOf`로 그 시점 소속을 조회한다(소유자 #513).

**분임조** (`team`):
그 범위의 설비들을 관리하는 **엔지니어들의 묶음**(조직·담당자 단위). StGroup(공정 능력 단위)과 이름은 비슷하지만 완전히 다른 축이다 — 분임조는 사람을 묶고, StGroup은 설비의 공정 대체 가능성을 묶는다. 소속 정보는 외부 시스템에서 공급받는다.

Line·PRC 그룹은 독립 전역 집합 키 `lineNames`·`prcGroups`이며 Condition 축이 아니다(2026-10-21 사용자 정정 — 소유자 #552·#513, [06 §6.1](docs/contract/kernel.md#61-식별자와-url-소유-상태-decided)).

**Equipment Group Condition / Selection** (`equipmentGroup` / `selectedEquipmentIds`):
Condition은 앱이 제공한 설비 묶음 축의 조건으로 선언한 소속 기준에 맞는 설비를 다시 찾는 질의이며, 여러 축은 AND·같은 축의 여러 값은 OR로 결합한다. Selection은 사용자가 명시적으로 고른 고정 EquipmentID 목록으로 Condition과 별개의 상태다([ADR-0059](docs/adr/0059-app-injected-equipment-axes-and-condition.md), [06 §6.1](docs/contract/kernel.md#61-식별자와-url-소유-상태-decided)).

### 설비 내부 단위와 설정

**Module / Slot**:
EquipmentID로 식별되는 설비 내부의 세부 단위. XFR/FNC/PRC 이벤트 로그는 Module/Slot 단위로 기록된다. 설비 분류값인 ChamberType과는 다른 개념이다.
_Avoid_: 모듈·슬롯(단독) — 호스트 모듈·셸 슬롯과 섞인다.

**Motion** (`drillMotion`):
Module이 수행하는 동작 한 종류(예: Chuck·Dechuck·Pump·Vent·Transfer)로, 동작시간분석 드릴의 두 번째 단계다. Module → Motion 순으로 좁히고, 어떤 Module이 기록하지 않는 Motion은 그 Module에서 값이 없다.
_Avoid_: 동작(단독) — CLAS의 `설비 동작시간` 메뉴와 섞인다.

**동작시간분석** (`hwTime` 메뉴 그룹, en `Operation time analysis`):
MARS의 메뉴 그룹. 설비 동작시간을 Module·Motion 단계로 드릴해 보는 HW Time 메뉴 네 개(단계별·비교·개요·표)를 묶는다. 네 메뉴는 같은 데이터를 쓰고 화면 배치만 다르다([ADR-0078](docs/adr/0078-hw-time-layout-recipes.md)).
_Avoid_: 설비 동작시간 — CLAS의 다른 메뉴다.

**RCC**:
프로세스 시간 분석.

**MCC**:
설비 사이클 분석.

**WPT**:
웨이퍼 사이클 분석.

**Configuration**:
파라미터 분석.

**CFG** (설비 설정):
설비 단위의 설정 기록. 원천은 이벤트 로그·별도 파일·외부 시스템에 걸쳐 있다. 개별 값 안에 특정 Module을 대상으로 하는 속성이 들어갈 수 있지만, 설정 기록의 귀속 단위는 설비다. Job 분석에서 유효 설정은 **Job 시작 시점의 값**이며, Job 중간이나 개별 구간마다 바뀌는 값을 구분할 필요는 없다.

### 생산 실행

**Carrier**:
Wafer를 담는 **물리적** 용기. 재사용되며, 시간에 따라 서로 다른 여러 Lot을 담을 수 있다.

**Lot**:
Wafer가 속하는 **논리적** 개념. Carrier와 1:1이 아니다 — 한 Lot이 제품이 만들어지는 과정에서 여러 Carrier를 거치기도 한다. Operation(아래 참고)을 여러 개 거치며, 그 경로 정보(해당 Lot의 제품이 전체적으로 진행할 Operation 목록)는 외부 시스템에서 공급받는다.
_Avoid_: Job — Lot과 Job은 다른 개념이다(아래 Job 참고). Carrier와도 다른 개념이다.

**Job**:
한 Lot이 **특정 시점에** 수행하는 작업(실행 인스턴스). 한 Lot이 하나의 Operation을 수행할 때도 여러 Job으로 나뉠 수 있다 — Lot:Job은 1:1이 아니다. XFR/FNC/PRC 동작의 시간 기반 생산성 분석은 이 Job 단위로 이뤄진다.

**Occurrence** (`equipmentId`, `entityType`, `anchor`):
파서가 완료한 실행 한 건을 가리키는 식별 키이며 세 값의 조합이다. Lot ID로 대체하지 않는다. anchor는 파서의 RecordSequence를 담은 불투명 숫자 문자열로 시각이 아니며 한 설비 안에서만 같음을 비교한다. 시작 시각은 키와 별도 표시 필드다([ADR-0094](docs/adr/0094-occurrence-anchor-is-record-sequence.md)). 분석 Context와 별개인 목적지 객체 ID로 전달한다([06 §6.1](docs/contract/kernel.md#61-식별자와-url-소유-상태-decided)).

**Recipe** (`prc_name`):
PRC 로그의 `RecipeId`에 대응하는 값 — Lot이 특정 Module/Slot에서 진행하는 PRC 단계의 레시피다. 설비 자체의 고정 속성이 아니라 Lot(그리고 그 안의 PRC 단계)마다 달라질 수 있다. 지표 산출과 분석 모두에서 가장 많이 쓰이는 1급 분류 축이다.

### 제품 라우팅

**Operation**:
제품(웨이퍼)이 처음부터 끝까지 거쳐야 하는 라우팅상의 작업 단위(순서 있음). 이 정보는 파서 로그에 없으며 **외부 시스템에서 공급받는다**(Lot 참고). PPID 및 PRC 실행 단계와 구별되는 라우팅 개념이다.
_Avoid_: Step — PRC 로그의 기존 Step/StepNo/StepSeq(공정 실행 계층)와 이름이 겹쳐 혼동되므로 Operation으로 통일한다(임시 명명, 최종 확정 전).

**PPID**:
LEH 로그의 `FlowId` 필드 값 — 하나의 Operation을 수행하는 방법(레시피 흐름) 하나. PPID 한 개는 여러 Recipe로 구성되며, 같은 Recipe가 여러 PPID에서 재사용될 수 있다(PPID:Recipe = N:M).
_Avoid_: FlowId — 파서(`context_recognized_parser`) 쪽 raw 필드명이며, 플랫폼에서는 PPID로 통일.

### 플랫폼 구성

위계는 플랫폼 → 업무 시스템 → 메뉴 그룹 → 메뉴 → 메뉴 화면이다. 어느 업무 시스템에도 속하지 않는 것은 플랫폼 메뉴다.

**플랫폼**:
업무 시스템들이 얹히는 공통 기반. 셸·Kernel·공통 컴포넌트·차트 계약·페이지 유형·메뉴 간 연결을 제공하고, 업무 화면 자체는 소유하지 않는다.
_Avoid_: 포털, 앱 — 앱은 이 플랫폼을 조립해 띄우는 단위(`apps/*`)다.

**플랫폼 기능** (platform feature):
플랫폼이 공통으로 제공하는 VOC·설문·Task·Finding·관리 같은 사용자 기능. SDK 위에서 동작하는 Consumer이며 업무 시스템 메뉴와 구별한다([ADR-0097](docs/adr/0097-platform-features-and-role-based-names.md)). 메뉴 조립 패키지는 한 단계 `platform/<feature>/`에 두고 업무 시스템 메뉴는 두 단계 `menus/<system>/<group>/`에 둔다. 공간은 폴더가 아니라 `GROUPS`가 정한다.
_Avoid_: FeedbackOps, 피드백 운영 — 과거 제품·업무 시스템 이름이다.

**Kernel** (`@ap/kernel`):
메뉴를 모르는 플랫폼 런타임 — Registry, 분석 Context, 딥링크·URL, 권한·Scope, 감사를 맡는다.
_Avoid_: 플랫폼 — 플랫폼 전체와 섞인다.

**셸** (App Shell, `@ap/shell`):
모든 메뉴 화면을 감싸는 플랫폼 틀. 레일, 사이드바, Context 바, 상세 패널 자리를 그린다.

**SDK**:
업무 시스템과 제품이 받아 쓰는 플랫폼 공개 패키지 묶음(`@ap/contracts`·`@ap/ui`·`@ap/kernel`·`@ap/components`·`@ap/shell`). 하나의 묶음 버전으로 릴리스한다([ADR-0043](docs/adr/0043-platform-sdk-is-the-app-contract-and-unified-framework.md), [ADR-0044](docs/adr/0044-sdk-source-in-platform-repo-released-separately.md)).

**업무 시스템** (코드 이름 `Space`):
플랫폼 위에 올라가는 독립된 업무 단위. 자기 메뉴 그룹·메뉴·업무 객체와 진입 권한을 소유하고, 다른 시스템의 객체를 흡수하지 않는다. 지금 등록된 것은 MARS·CLAS(생산성 분석), BRAVO(지표관리), 표준 로그 개발, 개선 실행, 운영 콘솔이다. VOC·설문·Task·Finding은 별도 피드백 운영 시스템이 아닌 플랫폼 기능이고, 운영 화면은 `운영 콘솔` 하나에 있다([ADR-0097](docs/adr/0097-platform-features-and-role-based-names.md), [ADR-0100](docs/adr/0100-feature-navigation-and-independent-access.md)).
CLAS는 약어 그대로 쓰고 영어 풀이 이름은 쓰지 않는다(어차피 바뀔 이름, 사용자 2026-10-27). 메뉴·설명에도 `Equipment operation`·`operation time` 같은 풀이를 두지 않는다. MARS와 CLAS는 메뉴가 달라 별도 시스템으로 둔다(이 플랫폼의 CLAS에는 견본 메뉴 하나가 있고, 기존 CLAS 화면 이전은 계획).
_Avoid_: 워크스페이스, 공간, 앱, 모듈 — 워크스페이스는 코어 서버의 workspace(테넌트)·작업 영역과, 모듈은 호스트 모듈·설비 Module과 섞인다. 화면 문구는 `업무 시스템`(짧게 `시스템`)이고, `Space`는 코드 이름으로만 쓴다.

**메뉴 그룹** (`GroupDef`):
업무 시스템 사이드바의 한 묶음이자 레일의 섹션 하나(예: MARS의 생산성 분석·설비관리·기준정보관리). 업무 시스템 소속은 메뉴 그룹에 걸리고, 메뉴는 그룹만 고른다. 메뉴 패키지 하나가 그룹 하나를 소유한다.
_Avoid_: 그룹(단독) — 설비 그룹·PRC 그룹·StGroup·작업 영역의 묶음과 섞인다.

**메뉴** (manifest, `MenuEntry`):
Registry에 등록된 진입점 하나. manifest에서 경로·권한·Context 지원 방식·페이지 유형을 선언하고 메뉴 화면 하나를 연다. 공간 메뉴의 manifest 경로는 별칭이 될 수 있고 Registry의 `path`는 정규 경로다([06 §6.4](docs/contract/kernel.md#64-url-계약-decided-필드명enum-문자열은-candidate)). 화면이 아직 없는 메뉴는 **예정 메뉴**로, 사이드바에 `예정`으로 보이고 열리지 않는다.

**정규 경로** (canonical path):
Registry가 메뉴의 대표 주소로 제공하는 경로([06 §6.4](docs/contract/kernel.md#64-url-계약-decided-필드명enum-문자열은-candidate)).

**별칭** (alias):
같은 메뉴로 들어오는 이전 경로([06 §6.4](docs/contract/kernel.md#64-url-계약-decided-필드명enum-문자열은-candidate)).

**플랫폼 홈** (platform home):
앱이 Registry에 지정하는 공간 없는 홈 메뉴([06 §6.4](docs/contract/kernel.md#64-url-계약-decided-필드명enum-문자열은-candidate)).

**Context 지원 방식** (`Capability`):
메뉴가 분석 Context 키마다 선언하는 쓰임 — 적용(`apply`, 조회 조건으로 씀), 참조만(`reference`, 보이고 이어지지만 조회에 안 씀), 미사용(`unsupported`, 보존만 함).
_Avoid_: Capability(단독), Context Capability — 공정 능력(StGroup)·기능 권한 어휘와 섞인다.

**페이지 유형** (Page Archetype, `pageType`):
메뉴 화면이 따르는 배치 틀 다섯 — Overview, Analysis Workspace, Management, Catalog, Workflow([06 §12](docs/contract/platform-ui-contract.md)).
_Avoid_: 템플릿.

**플랫폼 메뉴** (`space: null`):
어느 업무 시스템에도 속하지 않고 자기 권한으로만 열리는 메뉴 — 홈, 알림, 내 VOC, 내 Task, 응답 설문, 권한 요청, 공지(`내 활동`은 알림 → 내 VOC → 내 Task → 응답 설문 → 권한 요청, [ADR-0100](docs/adr/0100-feature-navigation-and-independent-access.md)). 전역 화면에서는 사이드바로, 업무 시스템 안에서는 전환기 팝오버로 닿는다([ADR-0070](docs/adr/0070-global-features-platform-menu-and-voc-drawer.md)). 접근 가능한 업무 시스템 수에 들지 않는다.
_Avoid_: 전역 유틸리티 메뉴 — ADR-0028 때의 이름이다.

**레일** (접근 이름 `시스템 레일`):
셸 맨 왼쪽의 세로 띠. 위에서부터 전환기, 현재 업무 시스템의 메뉴 그룹(섹션), 시스템을 바꿔도 그대로인 공통 도구(메뉴 검색·분석 보드·VOC 등록·알림), 도움말·사용자 순이다([15 §3.2](docs/design/multi-workspace-ui.md)).
_Avoid_: 앱 레일.

**전환기** (`시스템 및 플랫폼 메뉴`):
레일 맨 위 버튼과 그 팝오버. 위쪽은 플랫폼 메뉴, 아래쪽은 권한 있는 업무 시스템 카드다([ADR-0042](docs/adr/0042-system-switcher-and-system-owned-rail.md), ADR-0070).

**상세 패널** (`DetailDrawer`):
메뉴 화면 오른쪽에 목적지 객체 하나의 상세를 여는 셸 자리. 분석 보드에서는 새 칸의 상세가 이전 칸의 상세를 닫는다.
_Avoid_: 패널(단독) — 작업 영역 패널과 섞인다.

**VOC 등록 드로어**:
레일의 `VOC 등록`으로 여는 오른쪽 도킹 드로어. 지금 화면을 떠나지 않고 VOC를 쓴다([ADR-0070](docs/adr/0070-global-features-platform-menu-and-voc-drawer.md)).
_Avoid_: VOC 등록 패널 — 상세 패널과 섞인다.

**목적지 객체 ID**:
메뉴 간 이동이나 상세 패널에서 열 객체 하나를 가리키는 ID(예: Occurrence, EquipmentID). 단독 `목적지`는 이동할 화면을 뜻하고, 객체는 늘 `목적지 객체 ID`로 쓴다. 분석 Context와 따로 전달하고, 그 값으로 분석 Context를 추정하지 않는다([06 §22](docs/contract/platform-ui-contract.md)).

**호스트 모듈** (`ModuleManifest`):
플랫폼 밖 제품이 자기 메뉴 그룹·메뉴 화면을 가지고 플랫폼에 올라오는 단위. 플랫폼(호스트)이 주는 기능만 쓴다([ADR-0053](docs/adr/0053-host-module-contract-v1.md)).
_Avoid_: 모듈(단독) — 설비 Module/Slot과 섞인다. 업무 시스템을 모듈이라 부르지 않는다.

**서버 어댑터** (`PlatformAdapter`):
플랫폼이 서버와 주고받는 계약 함수 묶음. 앱이 mock이나 실서버 구현을 주입하고, Kernel·셸·메뉴는 구현을 모른다.
_Avoid_: 서버 포트, API(단독) — 포트는 네트워크 포트와, API는 서버의 HTTP 엔드포인트와 섞인다.

**응답 봉투** (envelope):
조회 응답이 데이터와 함께 싣는 공통 겉 — 결과 상태(`outcome`: 정상·빈 결과·오류·권한 없음·너무 큼·시간 초과), 판정(`assessments`), Data Trust([06 §18–19](docs/contract/components.md#18-data-trust-contract)).

### 업무 시스템과 협업

VOC·Task·설문·알림의 정의와 관계는 이 용어집의 기능 도메인 절이 원본이다.

**Managed System**:
플랫폼이 피드백과 개선 작업을 추적하는 사내 시스템 하나. 업무 시스템은 Managed System 하나에 연결될 수 있지만 같은 개념이 아니다 — 업무 시스템 둘이 같은 Managed System을 가리킬 수 있고, 연결은 기본값과 이동에만 쓰이며 권한을 주지 않는다([ADR-0068](docs/adr/0068-permission-scope-and-business-system-link.md)). Scope(room_name)와도 다르다.
_Avoid_: Customer system, external service

**전체 협업 허브** (폐기된 화면 문구 `FeedbackOps 전체`):
여러 Managed System의 협업 기능을 묶던 이전 진입점. 현재 운영 기능은 운영 콘솔에, 개인 기능은 전역 내 활동과 플랫폼 메뉴에 배치된다([ADR-0100](docs/adr/0100-feature-navigation-and-independent-access.md)). 별도 저장소나 권한 경계가 아니다.

**피드백 운영** (폐기된 업무 시스템 이름):
FeedbackOps의 운영 화면(수신함·Triage·Finding·Task·설문 관리·설정 등)을 올릴 업무 시스템으로 계획했으나 만들지 않는다. 그 화면들은 `운영 콘솔`의 VOC·Finding·Task 관리·설문 관리·대시보드·연동·기능 관리 섹션이다([ADR-0100](docs/adr/0100-feature-navigation-and-independent-access.md)). 모든 사용자가 쓰는 VOC 등록·내 VOC·설문 응답은 여기가 아니라 플랫폼 메뉴와 레일이다.

**발행** (지표 버전, en `Released`):
지표 버전 하나를 분석이 기본으로 쓰는 버전으로 공개하는 것. BRAVO가 소유한다.
_Avoid_: 게시, Published — 같은 동작을 두 이름으로 부르지 않는다(사용자 2026-10-23, 2026-10-27 `발행`/`Released`로 통일).

**VOC 등록** / **신고자**:
VOC를 처음 쓰는 동작은 `등록`이고, 등록한 사람은 `신고자`(Reporter)다. 신고자에게 보이는 담당자의 글은 `담당자 답변`이라 하며 VOC의 Public Update다. 신고자가 다시 쓰는 글은 `신고자 답글`(Reporter Reply)이다.
_Avoid_: 접수 — 등록과 같은 동작을 다른 말로 부르지 않는다.

### 분석 조건과 분석 보드

**분석 Context**:
화면 하나가 따르는 분석 조건 전체 — 기간·Scope·설비 그룹·지표 같은 공통 키의 값. 본 화면에는 하나, 분석 보드에는 칸마다 하나 있다. 목적지 객체 ID와 구분한다.
본 화면의 분석 Context 중 메뉴를 옮겨도 이어지는 공통 키 집합을 **전역 Context**라 한다(URL 전역 키). 보드에서는 칸마다 따로 있으므로 "칸의 분석 Context"라 쓴다.
_Avoid_: 분석 조건(단독) — 메뉴 화면의 페이지 필터와 섞인다.

**Context 바** (`GlobalContextBar`):
메뉴 화면 위에서 전역 Context(분석 보드에서는 선택된 칸의 분석 Context)를 보이고 바꾸는 셸 자리.

**조회 바** (`QueryBar`):
초안/적용 방식 메뉴에서 Context 바가 바뀌는 모양. 조건을 모아 `적용`으로 한 번에 조회한다. 바꾸는 즉시 적용되는 메뉴에는 없다.

**최소화 / 복원 (분석 보드)**:
열린 분석 보드가 일반 화면을 보여 주는 동안 숨은 채 남는 상태와 그 되돌림. 최소화 중에는 왼쪽 아래 칩과 레일 버튼이 상태를 알리고 한 번 눌러 복원한다. 닫기(열린 보드를 끝냄)와 다르며, 닫아도 저장된 시트는 남는다.

**본 화면**:
메뉴를 눌러 여는 보통의 메뉴 화면. URL 하나가 화면 하나이고, 분석 Context가 하나뿐인 칸으로 본다.

**분석 보드**:
사용자가 여러 분석 화면을 나란히 놓고 비교하는 셸 제공 화면. 페이지 유형이 아니고 업무 시스템에 속하지 않으며, 시트 여러 장을 가진다.
_Avoid_: 워크스페이스, 대시보드, 작업대 — 업무 시스템·Analysis Workspace 페이지 유형과 섞인다.

**시트**:
분석 보드 화면 아래 **시트 띠**에 놓인 한 장. 칸을 8개까지 가지며(표시 영역은 4개까지, 표시 영역이 이미 4개일 때 더하는 칸은 기존 영역의 탭으로 겹친다, [ADR-0089](docs/adr/0089-board-tab-cap-split.md)), 칸은 탭으로 겹치거나 나누어 놓인다(기본은 도킹 배치, 1×1 · 1×2 · 2×1 · 2×2 격자는 대체 렌더러, [ADR-0067](docs/adr/0067-dockview-layout-engine-board-v2.md)).
_Avoid_: 탭 — 브라우저 탭·작업 영역 탭과 섞인다. 시트 줄은 `시트 띠`라 쓴다.

**칸**:
시트의 자리 하나(코드 이름 `pane`). 메뉴 화면 하나와 그 화면의 분석 Context·page 상태를 가진다. 만들 때 기본 조건을 복사해 시작하고, 그 뒤로는 다른 칸과 연결이 없다.
_Avoid_: 패널, 패인 — 상세 패널·작업 영역 패널과 섞인다. `pane`은 코드 이름으로만 쓴다.

**기본 조건**:
새 칸이 처음 받는 분석 Context. `분석 보드에 열기`로 넣으면 누른 화면의 조건, 보드에서 직접 넣으면 마지막으로 본 본 화면의 조건이다. 복사일 뿐 상속이 아니다.

### 메뉴 화면 안 배치

**작업 영역** (`PanelWorkspace`):
메뉴 화면 한 장 안에서 내용을 여러 패널로 나누어 놓는 영역. 패널을 탭으로 겹치고, 끌어 옮기고, 나누고, 최대화하고, 숨길 수 있다. 메뉴는 패널·프리셋·기본 패널만 선언하고 조작은 플랫폼이 소유한다(06 §12.8, [ADR-0067](docs/adr/0067-dockview-layout-engine-board-v2.md)). 분석 보드는 화면 여러 개를 나란히 놓고, 작업 영역은 화면 하나의 내용을 나눈다.
_Avoid_: 워크스페이스, 대시보드 — 분석 보드·Analysis Workspace 페이지 유형과 섞인다.

**페이지 머리**:
메뉴 화면 제목 줄 아래, 본문 위의 영역. 메뉴가 넘긴 안내(`contextNotes`)와 페이지 필터·칩(`contextExtension`)이 놓인다. 높이 채움(fill) 화면에서는 한 줄로 접힐 수 있다(06 §12.8, [ADR-0075](docs/adr/0075-page-head-one-line-fold-thin-outcome-strip.md)).
_Avoid_: 헤더 — 제목·동작 줄(06 §8)과 섞인다. Context 바와도 다르다.

**패널**:
작업 영역을 이루는 조각 하나. 제목(탭 이름)을 가지며 차트·표·요약 같은 내용 하나를 담는다. 예: 사이클타임 상세의 추세·요약·분포·느린 실행.
_Avoid_: 칸, 패인 — 칸은 분석 보드 시트의 자리다. 상세 패널(DetailDrawer)과 구분해 필요하면 "작업 영역 패널"이라 쓴다.

**기본 패널**:
메뉴가 지정한 작업 영역의 주인공 패널. 숨길 수 없고, 다른 패널을 다시 보여도 가려지지 않는다. 사이클타임 상세에서는 추세다.

**묶음**:
작업 영역에서 패널 여러 개가 한 자리를 탭으로 나누어 쓰는 단위. 한 번에 패널 하나만 보이고 묶음 위 띠의 탭으로 바꾼다. 화면 문구는 `<제목> 묶음으로 옮기기`다(예: `요약 묶음으로 옮기기`, 보드는 `칸 3 묶음으로 옮기기`).
_Avoid_: 그룹 — 메뉴 그룹(Registry `GroupId`)·설비 그룹과 섞인다. 코드(dockview)의 group은 이 묶음이다. 사이드바의 한 묶음은 묶음이 아니라 메뉴 그룹이다.

**탭** (작업 영역):
묶음 위 띠에 붙은 패널 이름표. 누르면 그 패널이 보이고, 끌면 패널을 다른 자리로 옮긴다. 띠 오른쪽에 최대화와 `⋯` 동작 메뉴가 있다.

**분할선**:
작업 영역에서 이웃한 묶음 사이의 선. 끌거나 키보드로 옮겨 양쪽 크기를 바꾼다. 패널마다 선언한 최소 크기 밑으로는 줄지 않는다.

**높이 방식**:
작업 영역이 세로 공간을 쓰는 방법을 고르는 선택. 도구줄과 칸 `⋯` 메뉴의 라디오 묶음이고 작업 영역마다 저장한다. `화면 맞춤`(기본)과 `아래로 쌓기` 두 가지(06 §12.8, [ADR-0077](docs/adr/0077-workspace-stack-mode-rows-keep-own-height.md)).

**화면 맞춤**:
높이 방식의 하나. 패널이 보이는 화면 높이를 나눠 쓰고 한 경계를 옮기면 이웃이 함께 변한다.

**아래로 쌓기**:
높이 방식의 하나. 줄마다 자기 높이(px)를 갖고 작업 영역이 줄의 합만큼 커져 페이지가 스크롤된다. 경계는 그 위 줄만 바꾼다.

**줄**:
`아래로 쌓기`에서 작업 영역 맨 위 단계의 가로 한 층. 한 줄에 패널이 나란히 여럿 있을 수 있고 줄이 높이의 단위다. `아래 새 줄로 옮기기`가 360px 새 줄을 만든다.
_Avoid_: 행 — 표 행·보드 격자의 행과 섞인다.

**프리셋**:
메뉴가 미리 선언한 작업 영역 배치. 도구줄에서 고르고, `기본 배치`는 지금 프리셋의 처음 모양으로 되돌린다. 배치를 되돌리는 말은 `기본 배치`, 조건을 비우는 말은 `초기화`다. 사이클타임 상세는 `기본`(balanced)·`집중`(focus)·`세로`(column) 세 가지다.

### 조회·드릴·데이터 신뢰

**page key** (`pageKeys`):
메뉴가 manifest에 선언하고 URL에 쓰는 그 화면 고유의 상태 키(예: 표 페이지 번호, 드릴 단계 값, `returnTo`). 전역 Context 키가 아니다. 그중 `contextResetKeys`에 함께 선언한 키는 사용자가 전역 Context를 바꾸면 지워진다([06 §6.4](docs/contract/platform-ui-contract.md)).

**드릴** (드릴 단계, `drill.levels`):
한 화면 안에서 단계별로 좁혀 들어가는 조회(예: room_name → StGroup → 설비). 메뉴가 manifest에 단계 순서(page key와 표시 이름)를 선언하고 단계 수에 상한이 없다. 단계마다 page key 하나를 URL에 쓰고, 올라가거나 값을 바꾸면 뒤 단계 키를 지운다. 경로 바로 보이고 단계마다 본문을 바꾼다([ADR-0025](docs/adr/0025-drilldown-level-page-keys-path-bar-layout.md), [ADR-0063](docs/adr/0063-consumer-owned-chart-pieces-and-unbounded-drill.md)).
_Avoid_: 드릴다운 메뉴 — 별도 메뉴가 아니라 한 메뉴 안의 단계다.

**초안 / 적용** (Draft / Apply, `query.mode: 'apply'`):
여러 조회 조건을 모아 한 번에 실행하는 메뉴의 조회 방식. 편집 중인 조건은 칸의 초안에만 있고, `적용`을 눌러야 URL(적용 주소)에 쓰이고 조회가 실행된다. 선언이 없는 메뉴는 바꾸는 즉시 적용되는 live 모드다. 필수 조건이 비면 조회하지 않는 idle 상태다([ADR-0061](docs/adr/0061-query-draft-applied-address-and-required-gate.md)).

**Data Trust** (`trust`):
조회 결과 숫자의 상태 — 갱신 시각(`updatedAt`), 데이터 기준 시각(`dataThrough`), Coverage, 지표 버전, 잠정(provisional) 여부, 원천. 응답 봉투의 `trust`로 오고 `DataTrustIndicator`가 같은 어휘로 보인다. 그 조회의 신뢰이며 화면이 말하는 대상의 상태가 아니다([06 §18](docs/contract/components.md#18-data-trust-contract)). Coverage는 늘 이 Data Trust 필드를 뜻하며, 견본 표시나 기능 연동 화면에 쓰지 않는다.

### 기능 도메인

Workspace는 기능 데이터의 tenant 경계이며 분석 작업 영역과 다르다. Managed System Permission Scope는 Scope(room_name)와 별개의 권한 개념이다.


**Workspace**:
The outermost tenant boundary for platform feature-domain records. Every domain record belongs to exactly one **Workspace**, and no cross-**Workspace** links exist in MVP.
_Avoid_: Tenant, Organization, Account, Instance

**Actor**:
An AD-authenticated internal person whose permissions are evaluated inside a workspace.
_Avoid_: External user, anonymous user

**Role Level**:
The hierarchical authority level assigned to an **Actor**: Admin, Developer, or User.
_Avoid_: Persona, reporter, managed system

**Admin**:
The highest **Role Level**, allowed to manage feature settings, permissions, and operating policy.
_Avoid_: Customer, account, reporter

**Developer**:
The middle **Role Level**, allowed to investigate or execute improvement work within granted **Managed System Permission Scopes**.
_Avoid_: Customer, contact, reporter

**User**:
The lowest **Role Level**, allowed to submit VOC and access their own allowed work.
_Avoid_: Customer, contact, reporter

**Reporter**:
The **Actor** who submitted a specific **VOC**.
_Avoid_: Customer contact, account, role

**VOC**:
A voice item directly submitted by an internal **Actor** to capture customer or user feedback, complaints, requests, questions, or praise.
_Avoid_: Survey response, task, finding

**Finding**:
An evidence-based judgment object that summarizes a problem, pattern, or execution candidate for one **Managed System**.
_Avoid_: Task, survey result, VOC

**Evidence Highlight**:
A compact evidence fragment stored on one **Finding**, taken from a **VOC**, a Survey Response, or a manual note, that explains why the **Finding** exists. It keeps its source reference and its visibility never exceeds its source's; a Survey Response highlight is an approved, redacted excerpt, never respondent identity or raw response text (FO ADR-0033, FO ADR-0064). Its text is available only while the exact approval is active and source/target access permits it; Survey-derived Finding summaries contain source metadata only.
_Avoid_: Quote, tag, attachment

**Approved Survey Excerpt**:
A redacted fragment explicitly approved as Survey evidence. Result readers may reuse it only when result privacy rules allow it and they can manage the target **Finding**; personal-response access is not required for this safe reuse (FO ADR-0064). Revocation withdraws future evidence reads without erasing independently authored prose.
_Avoid_: Raw response, respondent identity, permanent public quote

**Task Request**:
A reviewed execution candidate for one **Managed System**.
_Avoid_: Task, VOC follow-up note

**Task Request Review**:
The decision to approve, reject, request more evidence for, convert, or link a **Task Request**.
_Avoid_: Admin-only approval, automatic task creation

**Task Request Self-Approval**:
A **Sensitive Permission** allowing a **Developer** to approve a **Task Request** they created within the same **Managed System Permission Scope**.
_Avoid_: default developer approval, unaudited shortcut

**Permission Request**:
An **Actor**'s ask for capability access within supported workspace or **Managed System Permission Scope**, reviewed through administrative authority. Requested and granted scope may differ by supported narrowing. It does not promote **Role Level**; decisions and requester changes are audited (FO ADR-0066).
_Avoid_: Access ticket, permission grant, role change request

**Permission Grant**:
Capability authority granted to an **Actor** for a supported scope, optionally expiring. It can follow an approved **Permission Request** or a governed direct grant; it does not change **Role Level**.
_Avoid_: Promotion, request approval record

**Request Withdrawal**:
The requester closes an open **Permission Request** as `cancelled`, retaining history. It neither revokes a **Permission Grant** nor denies access (FO ADR-0066).
_Avoid_: Rejection, grant revocation, deletion

**Sensitive Permission**:
A permission whose grant or use requires a written reason and explicit audit metadata, not granted by default. Includes **Task Request Self-Approval**.
_Avoid_: Restricted action, locked feature

**Task**:
Internal execution work for one **Managed System**. 요청 단계는 Task Request다. 로그 결함·검증 Round(표준 로그 개발), 개선 과제·실적(개선 실행), 지표 정의·버전(지표관리)과 다른 객체이며 관계만 링크한다.
_Avoid_: Reporter-facing VOC status, 이슈 — 시스템마다 뜻이 달라 단독으로 쓰지 않는다. 개선 실행의 `과제`를 영어로 Task라 쓰지 않는다.

**Progress note**:
An append-only internal comment on one **Finding** or one **Task**. A person writes a `note`; a successful status change writes a `status_change`. Finding reads and Task reads do not use the same permission gate.
_Avoid_: VOC Internal Comment, Public Update, Reporter Reply

**My Work**:
An actor-centered queue that gathers assigned VOC triage work, Task Requests, Tasks, Surveys, and review actions. Not an MVP surface (FO ADR-0038, FO ADR-0040): Home's assigned-work panel and `/tasks?view=my` cover the need.
_Avoid_: Domain owner, task board

**Inbox**:
An ambiguous label for three distinct surfaces: **VOC Inbox** (`/vocs?view=inbox`), the Tasks list (`/tasks?view=inbox`), and the Home notification Inbox (`/home?tab=inbox`). Name the surface when referring to one.
_Avoid_: Unqualified inbox

**Notification**:
A per-**Actor** in-app row (`core.notifications`) about an event directed at that Actor, such as an assignment, a Reporter Reply, or a Task Request or Permission Request decision, with an optional email copy per event type. It is read and archived per Actor and shown in the Home notification Inbox; it is not an audit record (FO ADR-0014).
_Avoid_: Audit event, Dashboard action queue

**Survey**:
A structured question set for one **Managed System**.
_Avoid_: VOC, task

**Outcome Survey**:
A **Survey** of type `outcome`, used to check whether released work improved the experience. A closed Outcome Survey with a poor result (a rating answer in the low band) and no follow-up decision is a follow-up gap; follow-up goes through a **Finding**, never directly from a Survey Response to a **Task Request** (FO ADR-0055).
_Avoid_: Requested outcome (a **Task Request** field), VOC


**Managed System Registry**:
The workspace-managed list of **Managed Systems** and their defaults.
_Avoid_: Project registry, customer registry

**Analytics Program**:
A concrete example of a **Managed System**, such as Tableau, Power BI, or Looker.
_Avoid_: Customer, project, analytics area

**Analytics Area**:
A managed analytical menu, report group, or business analysis area inside one **Managed System**.
_Avoid_: Managed system, app route, code module, permission boundary

**Work Initiative**:
A larger improvement effort that may group tasks or milestones after triage.
_Avoid_: Managed system, analytics area, project

**Milestone**:
A lightweight Task-system grouping for work larger than one **Task**, with a Why, an owner **Actor**, start and target dates, and exactly one **Primary Managed System** (immutable after create). Its status is one of `planning`, `in_progress`, `blocked`, or `released` (FO ADR-0050) and does not depend on child **Task** status.
_Avoid_: Work Initiative, project, sprint

**Managed System Permission Scope**:
An authorization boundary granting an **Actor** access to work for one **Managed System**.
_Avoid_: Project scope, analytics-area permission

**Primary Managed System**:
The single **Managed System** that owns the scope, permissions, defaults, and dashboard grouping for a record.
_Avoid_: Multi-system ownership

**Default Owner**:
The **Actor** or team used as the creation-time responsibility default for **VOC**, **Finding**, or **Task** in a **Managed System**. Assignment does not complete triage or start execution. FO ADR-0067 accepts this close-out behavior; it is implemented.
_Avoid_: Final assignee, triage decision

**Default Reviewer**:
The **Actor** or team used as the creation-time review routing default for a **Task Request**; it is distinct from the **Actor** who actually decides the request. Assignment does not grant review authority or self-approval.
_Avoid_: Decision Actor, exclusive approver

**Fallback Queue**:
The existing authorized operational queue for unassigned work within its **Managed System Permission Scope**, used when automatic responsibility cannot resolve. It preserves actionable intake without granting access.
_Avoid_: Assigned team, new permission scope

**Recovery Item**:
A shared identity for one category of workflow gap on a source record. Source-owned repairs determine resolution; personal hiding changes only the current **Actor**'s presentation of the current occurrence. A reopened gap is a new occurrence of the same item.
_Avoid_: Independent work object, dismiss decision, duplicate assignment

**VOC Source Context**:
The situation in which a VOC was submitted, such as direct use, proxy registration from a user report, or operational discovery.
_Avoid_: Reporter role, customer type

**Direct Use**:
A **VOC Source Context** where the **Reporter** experienced the issue while using the **Managed System**.
_Avoid_: Proxy report

**Proxy Report**:
A **VOC Source Context** where the **Reporter** registers feedback on behalf of another internal user.
_Avoid_: Reporter identity

**Operational Discovery**:
A **VOC Source Context** where the feedback is discovered through operations, monitoring, or investigation.
_Avoid_: Direct use

**Stakeholder Request**:
A **VOC Source Context** where feedback originates from a meeting, request thread, or planning discussion.
_Avoid_: Survey response

**Reporter Summary**:
A limited, public-safe summary of linked work shown to the **Reporter** of a **VOC**.
_Avoid_: Task detail, finding detail, internal comment

**Public Update**:
A reporter-visible message about VOC progress or resolution.
_Avoid_: Internal comment, developer note

**Internal Comment**:
A private operational note for Admins and scoped Developers working on VOC or execution work.
_Avoid_: Public update, reporter message

**Reporter Reply**:
A reporter-authored message or attachment added to the public VOC conversation.
_Avoid_: Internal comment, public update

**Rich Content Editor**:
An intuitive WYSIWYG editor for VOC descriptions, public conversations, and internal notes that supports images, tables, and pasted content without requiring users to write Markdown or HTML.
_Avoid_: Markdown-only input, raw HTML input, plain textarea for rich VOC detail

**Inline Attachment**:
An uploaded file, usually an image, displayed inside rich content while being stored and governed as an attachment.
_Avoid_: Base64 body image, raw external URL

**Rich Table**:
A table embedded inside rich content as structured editor content.
_Avoid_: Screenshot table, spreadsheet attachment

**VOC Triage State**:
The internal operational state used to process and classify a **VOC**.
_Avoid_: Reporter-facing status, task status

**Severity**:
The operational impact level assigned to a **VOC** during triage. Describes how serious the problem is, not the order in which work is done. Canonical enum in `docs/product/features/15-data-contracts.md`, locked by FO ADR-0004.
_Avoid_: Priority, urgency, P0/P1, user-submitted urgency, reporter emotion

**Priority**:
The execution-order signal carried by **Task** during planning (a **Finding** carries Severity and Confidence, not Priority). Decided after triage, distinct from **Severity**. Not exposed to **Reporters**.
_Avoid_: Severity, impact, importance, business value

**Reporter-Facing VOC Status**:
The public progress state shown to the **Reporter** of a **VOC**.
_Avoid_: Task status, triage state

**Task Status**:
The internal execution state of a **Task**.
_Avoid_: Reporter-facing VOC status, 이슈 — 시스템마다 뜻이 달라 단독으로 쓰지 않는다. 개선 실행의 `과제`를 영어로 Task라 쓰지 않는다.

**Display ID**:
The human-readable identifier of a record: a prefix plus a per-**Workspace** sequence number (`VOC-`, `FIN-`, `CLU-`, `REQ-`, `TASK-`, `SRV-`, `MLS-`), unique within the **Workspace** and assigned at creation. The UUID `id` stays the primary key; the Display ID is the label people and the command palette use (FO ADR-0029).
_Avoid_: Ticket number, primary key

**Workflow Template**:
The shared default status configuration used by all **Managed Systems** in MVP.
_Avoid_: Per-system custom workflow

**Managed System Workflow**:
A future per-**Managed System** customization of status configuration managed by Admins.
_Avoid_: MVP workflow, ad hoc status

**Entity Link**:
A typed loose-coupling relation between two domain records (source and target) within one **Workspace**, used for cross-system context without forcing direct ownership. Carries `relation_type` and `visibility`.
_Avoid_: Foreign key, parent-child relation, hard reference, related record

**Relation Type**:
The named kind of an **Entity Link**, drawn from a controlled vocabulary (e.g. `related_to`, `created_finding`, `evidence_of`, `requested_task`, `converted_to`).
_Avoid_: Tag, category, free-form label

**Visibility**:
The stored audience policy carried by an **Entity Link** (and by other visibility-controlled records). Canonical enum in `docs/product/features/15-data-contracts.md`: `internal_only | summary_visible | visible_to_reporter | admin_only`. Enforced on every read path.
_Avoid_: Access level, role, permission scope

**UI Visibility Decision**:
The backend-computed rendering state for a linked object; the current effective Entity Link set is `allowed | hidden | summary_visible | denied`. `request_access` remains reserved and is not emitted until a requestable link target exists (FO ADR-0023 §B). It is derived from stored **Visibility**, the requesting **Actor**'s role, source/target readability, summary availability, and reporter identity. This Entity Link vocabulary is distinct from Permission Decision states (`request_access | summary_visible | denied | blocked_not_requestable`) and permission frontend states (`approved | blocked_non_requestable | request_access | pending_request | hidden_existence | rejected | expired | revoked | summary_visible`); they are not one shared enum and are not stored.
_Avoid_: Visibility, permission, frontend filter

**Dashboard**:
An action-queue surface that groups outstanding **VOC**, **Task Request**, **Task**, **Survey**, and **Finding** work needing an **Actor**'s attention within their **Managed System Permission Scope**. Not a chart-only reporting page.
_Avoid_: Chart page, BI report, analytics view, KPI tile board

**Analytics Area operational report**:
A current operational snapshot of readable **VOC**, **Finding**, **Task**, and **Survey** work grouped by each object's own current **Analytics Area** within its **Managed System**, used by **Admin** and same-scope **Developer** to open the work needing attention. Unclassified work remains valid; linked objects do not inherit attribution, **Task Request** has no Area total, and Survey follow-up counts Surveys rather than responses (FO ADR-0069).
_Avoid_: Funnel, improvement score, historical Area snapshot

**Coverage**:
The ratio of records that have an expected follow-up to all records of that kind (for example **VOC** records linked to a **Task**, active **Findings** with execution work, released **Tasks** with a **Public Update**), shown as value, total, percent, and a good/warn/bad status on the **Dashboard** and `/integration/coverage` (FO ADR-0067 adds configurable per-metric bands and neutral `집계 대상 없음` for an empty denominator; unavailable data remains distinct), so partial integration is not mistaken for total system truth.

The ratio of records with the defined connection to eligible records of that kind (for example **VOC** records linked to a **Task**, active **Findings** with execution work, released **Tasks** with a **Public Update**), shown as value, total, percent, and a good/warn/bad status on the **Dashboard** and `/integration/coverage`, so partial integration is not mistaken for total system truth.
_Avoid_: Test coverage, BI metric

**VOC Cluster**:
A manually curated grouping of related **VOC** records used by **Developer** and **Admin** for internal triage and bulk operations. **VOC** records remain independent and are not merged. Not visible to **Reporters** in MVP.
_Avoid_: VOC merge, deduplication, duplicate group, parent VOC

**VOC Cluster Suggestion**:
An automatically proposed pair of existing **VOC** records for an authorized **Developer** or **Admin** to review. It is not a **VOC Cluster**; only human confirmation creates the curated grouping, and rejection prevents automatic re-proposal unless promptly undone (FO ADR-0068).
_Avoid_: Auto Cluster, provisional Cluster, Cluster Candidate, merged VOC

**Draft Similar-VOC Preview**:
An optional similarity check of unsaved **VOC** prose that helps the author find an existing authorized **VOC** before submission. It permits navigation only and creates no **VOC** or relationship (FO ADR-0068).
_Avoid_: Draft VOC, automatic duplicate decision, join mutation

**Cluster Candidate**:
A **VOC** selected as a target of a cluster-scoped bulk action; bulk actions apply individually to each candidate rather than to the cluster as a single record.
_Avoid_: Cluster member as a single bulk target, merged record, bare "candidate" (the code also uses it for a candidate peer in the cluster membership picker, a similar-VOC recommendation candidate, and a Public Update review candidate created when a linked **Task** is released; name which one)

## Relationships

- A **Workspace** contains many **Managed Systems** via its **Managed System Registry**.
- **VOC**, **Finding**, **Task Request**, **Task**, **Survey**, **Analytics Area**, Permission Request, and Entity Link all carry exactly one **Workspace** in MVP.
- Cross-**Workspace** entity links are forbidden in MVP.
- An **Actor** may submit many **VOC** records.
- A **VOC** has exactly one **Reporter** in MVP.
- A **Reporter** is always an **Actor** in MVP.
- An **Actor** has one effective **Role Level** per relevant permission scope.
- **Role Level** authority narrows in this order: **Admin** > **Developer** > **User**.
- **Admin**, **Developer**, and **User** may all submit **VOC**.
- A **VOC** must reference exactly one **Primary Managed System** it is about.
- A **Managed System** may have many **VOC** records.
- A **Managed System Registry** contains many **Managed Systems** in one workspace.
- A **Managed System** may have many **Analytics Areas**.
- An **Analytics Area** belongs to exactly one **Managed System**.
- A **VOC** must reference one **Primary Managed System** and may reference one **Analytics Area** within that system.
- The core server **Analytics Area** catalog is the MVP source of truth; external analytics menu identifiers are optional metadata only.
- Automatic BI menu import or synchronization is not an MVP feature.
- **Analytics Area** owner teams are routing/defaulting hints only and do not grant authorization.
- **Analytics Area** is an optional classification aid on VOC, Finding, Task, and Survey records; absence of Analytics Area is valid in MVP.
- A **Finding** must reference exactly one **Primary Managed System**.
- A **Task Request** must reference exactly one **Primary Managed System**.
- A **Task** must reference exactly one **Primary Managed System**.
- A **Survey** must reference exactly one **Primary Managed System**.
- Multi-system impact is represented by description, tags, separate linked records, or entity links; it does not create multi-system ownership in MVP.
- A **Managed System** may define a **Default Owner**.
- A **Default Owner** may prefill actual **VOC** ownership, but the **VOC** still starts as untriaged.
- Default owner or reviewer resolution may create assigned-but-untriaged or assigned-but-pending-review work.
- **Managed System Permission Scope** is the MVP default scope for triage, Finding, Task Request, Dashboard, and permission requests.
- **Analytics Area** does not define MVP permission boundaries.
- A **Developer** role may be granted for one **Managed System** without granting access to sibling **Managed Systems**.
- **Admin** is workspace-level in MVP.
- A **Work Initiative** may group execution work, but it is not the MVP scope owner for VOC.
- **VOC Source Context** describes why the VOC was submitted; it does not replace **Reporter**.
- **VOC Source Context** is optional in MVP and defaults to **Direct Use**.
- MVP **VOC Source Context** values are **Direct Use**, **Proxy Report**, **Operational Discovery**, and **Stakeholder Request**.
- MVP does not track a separate affected user for **Proxy Report**; the problem context belongs in the VOC description.
- **Severity** is assigned during triage by an authorized **Developer** or **Admin**, not by the **Reporter** at VOC creation.
- A **Reporter** may optionally select **Analytics Area** at VOC creation, but only from the chosen **Primary Managed System**.
- **Developer** or **Admin** may correct **Analytics Area** during triage.
- A **Reporter** may edit VOC title, description, or attachments only before triage begins.
- After triage begins, the original VOC description is preserved and additional information is captured through **Reporter Reply**.
- A **Reporter** cannot change the **Primary Managed System** after VOC creation.
- **VOC** description, **Reporter Reply**, **Public Update**, and **Internal Comment** should use a **Rich Content Editor** when rich input is needed.
- **Rich Content Editor** user experience must be WYSIWYG-first; Markdown or HTML may be internal formats or optional shortcuts, but must not be required from users.
- MVP **Rich Content Editor** must support inline images for VOC description and preserve reporter-safe rendering for public-facing fields.
- **Rich Content Editor** uses one shared editor foundation across VOC description, **Reporter Reply**, **Public Update**, and **Internal Comment**.
- Each rich-content surface may restrict toolbar actions, embeds, and rendering according to visibility and safety needs.
- Images pasted or dropped into **Rich Content Editor** should appear inline to the user.
- Inline images are stored as **Inline Attachments** and referenced from rich content rather than embedded as base64 body data.
- **Inline Attachments** are governed by attachment permissions, size limits, file type rules, and visibility checks.
- Rich content must not render external image URLs inline in MVP.
- External URLs may be stored as links, but images must be uploaded and governed as **Inline Attachments** before inline display.
- **Rich Table** support is spike-gated in MVP; when enabled, tables created or pasted in **Rich Content Editor** are stored as structured editor content.
- Large spreadsheet-like data should be attached as a file rather than stored as an oversized **Rich Table**.
- Public-facing surfaces may restrict **Rich Table** size or availability.
- **Finding** is optional; simple VOC follow-up may go directly to **Task Request** without creating a **Finding**.
- **Finding** is used when multiple evidence sources, clusters, survey results, or explicit analysis need to be summarized before execution.
- **VOC** follow-up creates a **Task Request**, not a **Task** directly.
- **Task** is created after **Task Request** review, except for standalone internal work created from the Tasks surface (standalone create is deferred, FO ADR-0027).
- **Task Request Review** may be performed by workspace **Admin** or by **Developer** within the same **Managed System Permission Scope**.
- A **Developer** cannot review **Task Requests** for sibling **Managed Systems** without that scope.
- MVP allows the same **Developer** to create and approve a **Task Request** only when they have **Task Request Self-Approval** capability within their **Managed System Permission Scope**.
- **Task Request Self-Approval** requires a reason and explicit audit metadata.
- **Task Request Review** decisions are audited.
- A **Task** converted from an approved **Task Request** starts in Backlog by default.
- Approval means the work is accepted into the execution backlog; it does not mean immediate execution has started.
- A Backlog **Task** may have an assignee, but execution has not started until it moves to Todo or Doing.
- Assigned Backlog **Tasks** may appear in My Tasks (`/tasks?view=my`) as planned work.
- Assigned-work views (Home's assigned-work panel, `/tasks?view=my`) aggregate work assigned to an **Actor**; they do not own the lifecycle of VOC, Task Request, Task, Survey, or Finding.
- A **Reporter** may see reporter-facing VOC status, public updates, and **Reporter Summary** for linked work on their own **VOC**.
- **Reporter Summary** must not expose **Finding** detail, **Task** internal comments, backlog priority, or Developer discussion.
- **Reporter Summary** may include public title, reporter-facing status, owning team public name, expected resolution date, last public update time, and a public update excerpt.
- **Reporter Summary** must not include internal priority, individual Developer names, internal due dates, root-cause analysis detail, severity, confidence, or private notes.
- **Reporter Summary** must not expose raw **Task Status** values; the canonical enum is defined in `docs/product/features/06-task-project-system.md` and locked by FO ADR-0003.
- Internal **Task Status** may inform public-safe **Reporter-Facing VOC Status**, but only through VOC-owned review/update behavior.
- **Public Update** may be written by workspace **Admin** or by **Developer** within the same **Managed System Permission Scope**.
- **User** cannot write **Public Updates**.
- **Internal Comment** and **Public Update** are separate communication types.
- MVP VOC conversation is an append-only timeline, not real-time chat.
- MVP has a public VOC conversation timeline for **Reporter Reply** and **Public Update**, and a separate internal timeline for **Internal Comment**.
- The public VOC conversation has no mentions, reactions, read receipts, threaded replies, or general message editing; **Internal Comments** and **Finding**/**Task** **Progress notes** allow @mentions.
- A **Reporter** may add **Reporter Replies** to their own **VOC**.
- **Reporter Reply** belongs to the public VOC conversation and is visible to scoped **Developer** and **Admin** users.
- **Reporter Reply** must not be stored as **Internal Comment**.
- A **Reporter Reply** may return a Waiting Reporter VOC to an active triage or follow-up queue.
- When a **Reporter Reply** arrives for a Waiting Reporter **VOC**, the internal queue state moves to follow-up needed or needs review.
- **Reporter Reply** does not automatically change **Reporter-Facing VOC Status**.
- **VOC Cluster** is not reporter-visible in MVP.
- **VOC Cluster** does not merge **VOC** records; each **VOC** remains independent.
- MVP **VOC Cluster** supports manual create, add/remove membership, and confirm; confirming a **VOC Cluster Suggestion** creates a human-curated Cluster. Suggestions themselves are not execution evidence or linkable records (FO ADR-0068). Cluster merge/split is a later feature.
- Cluster bulk update behavior is candidate-only; selected **VOC** records receive individual **Public Updates**.
- **VOC Triage State**, **Reporter-Facing VOC Status**, and **Task Status** are separate state machines with no automatic cross-mapping; canonical enums in `docs/product/features/15-data-contracts.md`, locked by FO ADR-0005.
- **Task Status** reaching Released may create a reporter-facing status review candidate; it does not automatically resolve the **VOC**.
- MVP uses one shared **Workflow Template** across all **Managed Systems**.
- **Managed System Workflow** customization is a future extension, not an MVP feature.
- An **Entity Link** connects two records of type **VOC**, Survey Response, **Finding**, **VOC Cluster**, **Task Request**, or **Task** within one **Workspace**, and only for the source/target/relation pairs in the runtime registry (`docs/architecture/platform-api/06-entity-linking-contract.md`).
- **Entity Link** carries one **Relation Type** from the controlled vocabulary; ad hoc strings are not allowed.
- Cross-system history is canonical through **Entity Link**, not via convenience columns on each table.
- **Entity Link** does not grant write ownership; the source-shaped route does not own the target.
- **Dashboard** surfaces actionable records; it does not aggregate chart metrics as its primary purpose in MVP.
- **Dashboard** is scoped by **Managed System Permission Scope** and is not duplicated per **Analytics Area** in MVP.
- Assigned-work views are filtered by assignee = the current **Actor**; **Dashboard** is filtered by **Managed System Permission Scope** regardless of assignee.
- A record may appear in both an assigned-work view (because it is assigned to me) and **Dashboard** (because it is in my scope); these are independent views, not different storage.
- Assigned-work views never widen beyond the current **Actor**; **Dashboard** never narrows to one assignee by default.
- A **Permission Request** is created by the requesting **Actor** and decided by an **Admin** within the same **Workspace**.
- A **Permission Request** decision may be `approved`, `rejected`, or `needs_more_info`; `needs_more_info` preserves identity for resubmission. The requester may edit a pending ask or withdraw an open ask to `cancelled`, retaining identity and history (FO ADR-0066; implemented #1080–#1086).
- A governed direct **Permission Grant** uses the same supported scope and self-approval policy as approval; an overlapping Explicit Deny must be lifted explicitly, and a matching open ask goes through review. Neither path changes **Role Level** (FO ADR-0066).
- **Sensitive Permission** grants and uses require a reason and are audited.
- Rejected **Permission Requests** must not be immediately resubmitted for the same scope without new justification.

## Example Dialogue

> **Dev:** "Can only Users submit VOC?"
> **Domain expert:** "No. Admins, Developers, and Users are all AD-authenticated Actors and can submit VOC. The Reporter is whoever submitted the VOC; source context explains whether it came from direct use, proxy registration, or operational discovery."
>
> **Dev:** "Can a VOC be created without selecting whether it is about Tableau, Power BI, or Looker?"
> **Domain expert:** "No. Every VOC must belong to exactly one Managed System so triage, ownership defaults, permissions, and dashboard filters have a clear scope."
>
> **Dev:** "If Tableau has a default owner, does that mean the VOC is already triaged?"
> **Domain expert:** "No. The default owner pre-fills the actual owner field, so the VOC is assigned but still untriaged. A manager can still review, classify, and change the owner during triage."
>
> **Dev:** "Should we model Tableau as a Project?"
> **Domain expert:** "No. Tableau is a Managed System. A future Work Initiative can group execution work, but VOC scope and defaults come from the Managed System."
>
> **Dev:** "Is 'permission management' one shared Analytics Area across Tableau and Power BI?"
> **Domain expert:** "No. Analytics Areas are managed under one Managed System. Tableau permission management and Power BI permission management may share a name, but they are separate Analytics Areas."
>
> **Dev:** "Can a Tableau manager see Power BI VOC?"
> **Domain expert:** "Only if they also have Power BI scope or admin access. MVP permissions are scoped by Managed System, not Analytics Area."
>
> **Dev:** "If someone is a Power BI Developer, can they process Tableau VOC?"
> **Domain expert:** "No. Developer authority is granted inside Managed System scope. Power BI Developer access does not imply Tableau access."
>
> **Dev:** "Can a Finding or Task exist without a Managed System if it came from linked evidence?"
> **Domain expert:** "No. VOC, Finding, Task Request, Task, and Survey all carry exactly one Managed System in MVP. Links preserve context; they do not replace scope."
>
> **Dev:** "What if the same login issue affects Tableau and Power BI?"
> **Domain expert:** "Choose one Primary Managed System for the record. If both systems need separate handling, create separate records and link them as related."
>
> **Dev:** "Can the Reporter see the Task linked to their VOC?"
> **Domain expert:** "Only through Reporter Summary. They can see public-safe progress context, not internal task detail, finding detail, comments, or backlog discussion."
>
> **Dev:** "Can we show the linked Task's internal priority to the Reporter?"
> **Domain expert:** "No. Reporter Summary uses public-safe fields only, such as public title, public status, owning team public name, expected resolution date, and public update excerpt."
>
> **Dev:** "If a Task is Released, do we automatically mark the VOC as solved?"
> **Domain expert:** "No. Released work creates a reporter-facing status review candidate. The VOC public status changes only through the VOC-owned review/update flow."
>
> **Dev:** "Can Tableau and Power BI have different VOC statuses in MVP?"
> **Domain expert:** "No. MVP uses the same workflow template for every Managed System. Admin-managed per-system workflows are a later extension."
>
> **Dev:** "If a Developer registers a VOC after hearing a complaint from a User, who is the Reporter?"
> **Domain expert:** "The Developer is the Reporter because they submitted it. The source context is Proxy Report."
>
> **Dev:** "Do we need to store the person who originally felt the pain in a proxy report?"
> **Domain expert:** "No. MVP tracks the submitted problem, not a separate affected user. Put that context in the VOC description when useful."
>
> **Dev:** "Should the VOC creation form ask the Reporter to choose severity?"
> **Domain expert:** "No. Reporters describe the problem. Severity is an operational triage decision made later by Developer or Admin."
>
> **Dev:** "Can the Reporter choose Analytics Area?"
> **Domain expert:** "Yes, optionally. The choices must be limited to the selected Managed System and can be corrected during triage."
>
> **Dev:** "Can the Reporter rewrite the VOC after triage starts?"
> **Domain expert:** "No. Preserve the original description after triage starts. Additional details should be added as Reporter Replies."
>
> **Dev:** "Should users type Markdown or HTML to add screenshots and tables?"
> **Domain expert:** "No. The editor must be intuitive and WYSIWYG-first. Storage format is an implementation detail."
>
> **Dev:** "Do we need separate editors for VOC body, replies, public updates, and internal comments?"
> **Domain expert:** "No. Use one shared editor foundation and restrict features per surface."
>
> **Dev:** "If a user pastes a screenshot into the VOC body, is it just an attachment at the bottom?"
> **Domain expert:** "No. It should appear inline in the body. The system stores it as an attachment behind the scenes and references it from the rich content."
>
> **Dev:** "Is a pasted Excel range an image attachment?"
> **Domain expert:** "Not automatically for MVP. Rich Table support is spike-gated; large spreadsheets should be uploaded as attachments."
>
> **Dev:** "Can a user embed an external image URL in a VOC?"
> **Domain expert:** "No. External URLs can be links, but inline images must be uploaded as Inline Attachments so permissions and security checks apply."
>
> **Dev:** "Does every VOC need a Finding before work can start?"
> **Domain expert:** "No. Finding is optional. Use it when evidence or analysis needs to be summarized; simple VOC follow-up can go directly to Task Request."
>
> **Dev:** "Can a VOC create a Task directly?"
> **Domain expert:** "No. VOC follow-up becomes a Task Request first. A reviewed Task Request can be converted to a Task; standalone internal Tasks are created from the Tasks surface (standalone create is deferred, FO ADR-0027)."
>
> **Dev:** "Who can approve a Task Request?"
> **Domain expert:** "Workspace Admins can review all Task Requests. Developers can review Task Requests only inside their Managed System scope."
>
> **Dev:** "Can the same Developer create and approve a Task Request?"
> **Domain expert:** "Only if they have Task Request Self-Approval capability for that Managed System scope. They must provide a reason, and the decision is audited as self-approved."
>
> **Dev:** "When a Task Request becomes a Task, does it start in Todo?"
> **Domain expert:** "No. It starts in Backlog by default. Moving it to Todo is a separate execution planning decision."
>
> **Dev:** "Can a Backlog Task already have an assignee?"
> **Domain expert:** "Yes. Assignment can indicate planned ownership, but the work has not started until the Task moves to Todo or Doing."
>
> **Dev:** "Can the Reporter see that their linked Task is in Backlog?"
> **Domain expert:** "No. Raw Task Status values are internal. Reporter Summary shows public-safe progress through Reporter-Facing VOC Status and public updates."
>
> **Dev:** "Can a Developer publish an update to the Reporter?"
> **Domain expert:** "Yes, inside their Managed System scope. Users cannot write Public Updates, and Internal Comments remain private."
>
> **Dev:** "Can the Reporter answer when more information is requested?"
> **Domain expert:** "Yes. Their answer is a Reporter Reply in the public VOC conversation, not an Internal Comment, and it can move the VOC back into an active queue."
>
> **Dev:** "When the Reporter replies, do we automatically change the public status?"
> **Domain expert:** "No. The reply reactivates the internal follow-up queue. Public status changes remain an explicit VOC-owned decision."

## Flagged Ambiguities

- "Reporter" was used like a role and also like a customer person. Resolved: in MVP, **Reporter** is the **Actor** who submitted a specific **VOC**, not a standalone role or external **Contact**.
- "Customer" was used for the people who provide VOC. Resolved: this product is internal-only, so use **User** for the lowest internal role level; avoid external-customer language in MVP domain docs.
- "Project" can be confused with **Managed System** when users say things like "Tableau project" or "Power BI project." Resolved for MVP discussion: Tableau, Power BI, and Looker-like independent analytics programs are **Managed Systems**, and every **VOC** must select one.
- "Project Registry" was carrying Managed System responsibilities such as scope, defaults, and filters. Resolved: MVP uses **Managed System Registry** for those responsibilities; broader execution grouping should use **Work Initiative** only if it becomes necessary.
