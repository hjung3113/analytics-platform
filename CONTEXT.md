# Analytics Platform

설비 계측 데이터를 Scope(조회 범위)로 좁혀 분석하는 사내 플랫폼의 핵심 도메인 개념. 현행 용어와 관계를 아래에 정의한다. 전역 소비 계약은 [06](docs/06_platform_ui_contract.md), 결정 근거는 [ADR](docs/adr/)을 따른다.

## Language

### 물리 조직과 접근 범위

**Site**:
공장이 위치한 최상위 물리 조직 단위. 여러 room_name과 Line을 포함한다. 접근 범위의 관계는 Site → room_name → StGroup → Equipment이며, Line은 room_name과 교차하는 독립 축이다. Site별로 물리 DB가 분리돼 있어 Site는 DB 연결 경계이며, 설비 ID를 쓰기 전에 활성 Scope에서 먼저 확립돼 있어야 한다([ADR-0004](docs/adr/0004-site-is-db-partition-not-column.md)).
_Avoid_: 사업장 — 기존 문서에서 느슨하게 쓰이던 표현으로, 앞으로는 Site로 통일한다.

**Line**:
Site 내부의 실제 생산 라인. 생산·조회에 쓰이는 독립 축이며 room_name을 포함하는 상위 접근 범위가 아니다. 하나의 room_name이나 StGroup이 여러 Line에 걸칠 수 있다. Factory는 별도 Scope 레벨로 모델링하지 않는다.
_Avoid_: 공장, Factory — 구어로는 Line과 같은 뜻으로 쓰이지만, 공식 계층에는 Factory 레벨이 없으므로 Line만 쓴다. 근거: [ADR-0005](docs/adr/0005-scope-room-name-line-independent.md).

**Scope** (`scopeId`):
사용자가 조회 한 번에 고르는 단일 접근·조회 범위. Site 안의 room_name 기준으로 부여되며, 서버가 요청마다 권한을 다시 검증한다. v1은 단일 Scope 선택이다([06 §6.2](docs/06_platform_ui_contract.md#62-scope와-권한-decided--open)).

### 설비 식별 계층

**Maker**:
설비를 만든 제조사. Model의 상위 개념이며, 하나의 Maker가 여러 room_name에 걸쳐 설비를 공급할 수 있다.
_Avoid_: 벤더, Vendor

**Model**:
특정 Maker가 만든 설비 기종. Maker 아래, ChamberType 위의 계층.

**ChamberType**:
Model보다 더 세부적으로 설비를 분류하는 값. 외부 시스템에서 공급되며, 이 플랫폼이 직접 산출하지 않는다.
_Avoid_: 챔버, Chamber — ChamberType으로 통일.

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
_Avoid_: Process, 공정 구역 — "Process"는 이 프로젝트에서 여러 의미로 겹쳐 쓰여 혼동되므로 room_name으로 통일한다.

**StGroup** (`stgroup`):
하나의 Operation(제품 라우팅 작업 단위, 아래 참고)을 상호 대체 수행할 수 있는 **설비 단위**(챔버·모듈 단위 아님) 묶음. 담당자·조직이 아닌 **공정 능력(capability) 단위**다. Site와 room_name 경계를 넘지 않으며, 여러 Line에 걸칠 수 있다. Maker/Model 분류와는 별개다. 소속은 가변적이고 외부 시스템에서 공급받는다. 현재 소속을 기준으로 조회하며 과거 시점 소속의 재구성은 별도 개념이다.
_Avoid_: 분임조 — 분임조는 StGroup과 별개의 값이다(아래 참고).

**분임조** (`team`):
그 범위의 설비들을 관리하는 **엔지니어들의 묶음**(조직·담당자 단위). StGroup(공정 능력 단위)과 이름은 비슷하지만 완전히 다른 축이다 — 분임조는 사람을 묶고, StGroup은 설비의 공정 대체 가능성을 묶는다. 소속 정보는 외부 시스템에서 공급받는다.

**Equipment Group Condition / Selection** (`equipmentGroup` / `selectedEquipmentIds`):
설비를 묶는 축은 StGroup(`stgroup`), 분임조(`team`), Maker+Model(`makerModel`) 중 하나만 고른다. Condition은 그 축과 조건으로 현재 소속·속성에 맞는 설비를 다시 찾는 조건이고, Selection은 그 결과에서 사용자가 명시적으로 고른 EquipmentID 목록이다. 둘은 서로 다른 상태다([ADR-0002](docs/adr/0002-stgroup-materializes-to-equipment-ids.md), [06 §6.1](docs/06_platform_ui_contract.md#61-식별자와-url-소유-상태-decided)).

### 설비 내부 단위와 설정

**Module / Slot**:
EquipmentID로 식별되는 설비 내부의 세부 단위. XFR/FNC/PRC 이벤트 로그는 Module/Slot 단위로 기록된다. 설비 분류값인 ChamberType과는 다른 개념이다.

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
파서가 완료한 실행 한 건을 가리키는 식별 키이며 세 값의 조합이다. Lot ID로 대체하지 않는다. anchor는 원천 시각의 전체 정밀도를 보존하는 불투명 키다. 분석 Context와 별개인 목적지 객체 ID로 전달한다([06 §6.1](docs/06_platform_ui_contract.md#61-식별자와-url-소유-상태-decided)).

**Recipe** (`prc_name`):
PRC 로그의 `RecipeId`에 대응하는 값 — Lot이 특정 챔버에서 진행하는 PRC 단계의 레서피다. 설비 자체의 고정 속성이 아니라 Lot(그리고 그 안의 PRC 단계)마다 달라질 수 있다. 지표 산출과 분석 모두에서 가장 많이 쓰이는 1급 분류 축이다.

### 제품 라우팅

**Operation**:
제품(웨이퍼)이 처음부터 끝까지 거쳐야 하는 라우팅상의 작업 단위(순서 있음). 이 정보는 파서 로그에 없으며 **외부 시스템에서 공급받는다**(Lot 참고). PPID 및 PRC 실행 단계와 구별되는 라우팅 개념이다.
_Avoid_: Step — PRC 로그의 기존 Step/StepNo/StepSeq(공정 실행 계층)와 이름이 겹쳐 혼동되므로 Operation으로 통일한다(임시 명명, 최종 확정 전).

**PPID**:
LEH 로그의 `FlowId` 필드 값 — 하나의 Operation을 수행하는 방법(레서피 흐름) 하나. PPID 한 개는 여러 Recipe로 구성되며, 같은 Recipe가 여러 PPID에서 재사용될 수 있다(PPID:Recipe = N:M).
_Avoid_: FlowId — 파서(`context_recognized_parser`) 쪽 raw 필드명이며, 플랫폼에서는 PPID로 통일.

### 업무 시스템과 협업

**업무 시스템** (워크스페이스, 공간):
플랫폼 위에 올라가는 독립된 업무 단위 — 생산성 분석, 지표관리, 표준 로그 개발, 개선 실행, 그리고 지원용 개발·운영 콘솔. 시스템마다 고유한 메뉴와 업무 객체를 소유하고, 다른 시스템의 객체를 흡수하지 않는다.
_Avoid_: 앱, 모듈 — 화면 묶음이 아니라 업무와 데이터 소유의 경계다.

**Managed System**:
FeedbackOps가 VOC·Task·설문을 묶는 협업 범위. 업무 시스템이나 Scope(room_name)와 같은 개념이 아니며 1:1로 대응한다고 가정하지 않는다.

**전체 협업 허브**:
권한이 있는 협업 담당자가 여러 Managed System의 VOC·Task·설문을 한곳에서 분류·추적하는 진입. 별도 데이터 저장소가 아니고, 허브에 들어갈 수 있다고 각 시스템의 내용을 볼 권한이 생기지 않는다.

**FeedbackOps Task**:
제품 개선·개발 요청을 처리하는 공통 협업 객체. 로그 결함·검증 Round(표준 로그 개발), 개선 과제·실적(개선 실행), 지표 정의·버전(지표관리)과 이름이 비슷해도 다른 객체이며 관계만 링크한다.
_Avoid_: 이슈 — 시스템마다 뜻이 달라 단독으로 쓰지 않는다.
