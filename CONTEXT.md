# Analytics Platform

설비 계측 데이터를 Scope(조회 범위)로 좁혀 분석하는 사내 플랫폼의 핵심 도메인 개념. 현행 용어와 관계를 아래에 정의한다. 전역 소비 계약은 [06](docs/06_platform_ui_contract.md), 결정 근거는 [ADR](docs/adr/)을 따른다.

## Language

### 물리 조직과 접근 범위

**Site**:
공장이 위치한 최상위 물리 조직 단위. 여러 room_name과 Line을 포함한다. 접근 범위의 관계는 Site → room_name → StGroup → Equipment이며, Line은 room_name과 교차하는 독립 축이다.
_Avoid_: 사업장 — 기존 문서에서 느슨하게 쓰이던 표현으로, 앞으로는 Site로 통일한다.

**Line**:
Site 내부의 실제 생산 라인. 생산·조회에 쓰이는 독립 축이며 room_name을 포함하는 상위 접근 범위가 아니다. 하나의 room_name이나 StGroup이 여러 Line에 걸칠 수 있다. Factory는 별도 Scope 레벨로 모델링하지 않는다.
_Avoid_: 공장, Factory — 구어로는 Line과 같은 뜻으로 쓰이지만, 공식 계층에는 Factory 레벨이 없으므로 Line만 쓴다. 근거: [ADR-0005](docs/adr/0005-scope-room-name-line-independent.md).

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
실제 설비 한 대를 가리키는 식별자. 모든 Site에 걸쳐 전역적으로 유일하다. Maker → Model → ChamberType → EquipmentID 설비 분류 계층의 최하위이며, 설비 내부 이벤트에는 이보다 세부적인 Module/Slot 단위가 있다.

**EquipmentName**:
설비의 사람이 읽는 이름. EquipmentID(식별 키)와는 별개 값이다. EquipmentName이 바뀌면 다른 설비로 취급하여 새 EquipmentID로 재등록하며, 기존 ID는 사용중지되고 다른 용도로 재사용하지 않는다.
_Avoid_: 설비명을 EquipmentID와 같은 값으로 취급하지 않는다.

### 공정 범위와 설비 그룹

**room_name**:
설비가 설치된 공정 구역이자 Site 내 권한·조회 범위의 기준 축. 하나의 room_name이 여러 Line에 걸칠 수 있으며 Maker/Model 계층과도 독립적이다. 보통 등록 시 정해진 값이 유지되지만 드물게 바뀔 수 있고, 이때도 같은 EquipmentID를 유지한다. 다른 설비로 취급하여 재등록하는 기준은 room_name 변경이 아니라 EquipmentName 변경이다.
_Avoid_: Process, 공정 구역 — "Process"는 이 프로젝트에서 여러 의미로 겹쳐 쓰여 혼동되므로 room_name으로 통일한다.

**StGroup** (`stgroup`):
하나의 Operation(제품 라우팅 작업 단위, 아래 참고)을 상호 대체 수행할 수 있는 **설비 단위**(챔버·모듈 단위 아님) 묶음. 담당자·조직이 아닌 **공정 능력(capability) 단위**다. Site와 room_name 경계를 넘지 않으며, 여러 Line에 걸칠 수 있다. Maker/Model 분류와는 별개다. 소속은 가변적이고 외부 시스템에서 공급받는다. 현재 소속을 기준으로 조회하며 과거 시점 소속의 재구성은 별도 개념이다.
_Avoid_: 분임조 — 분임조는 StGroup과 별개의 값이다(아래 참고).

**분임조**:
그 범위의 설비들을 관리하는 **엔지니어들의 묶음**(조직·담당자 단위). StGroup(공정 능력 단위)과 이름은 비슷하지만 완전히 다른 축이다 — 분임조는 사람을 묶고, StGroup은 설비의 공정 대체 가능성을 묶는다. 소속 정보는 외부 시스템에서 공급받는다.

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

**Recipe** (`prc_name`):
PRC 로그의 `RecipeId`에 대응하는 값 — Lot이 특정 챔버에서 진행하는 PRC 단계의 레서피다. 설비 자체의 고정 속성이 아니라 Lot(그리고 그 안의 PRC 단계)마다 달라질 수 있다. 지표 산출과 분석 모두에서 가장 많이 쓰이는 1급 분류 축이다.

### 제품 라우팅

**Operation**:
제품(웨이퍼)이 처음부터 끝까지 거쳐야 하는 라우팅상의 작업 단위(순서 있음). 이 정보는 파서 로그에 없으며 **외부 시스템에서 공급받는다**(Lot 참고). PPID 및 PRC 실행 단계와 구별되는 라우팅 개념이다.
_Avoid_: Step — PRC 로그의 기존 Step/StepNo/StepSeq(공정 실행 계층)와 이름이 겹쳐 혼동되므로 Operation으로 통일한다(임시 명명, 최종 확정 전).

**PPID**:
LEH 로그의 `FlowId` 필드 값 — 하나의 Operation을 수행하는 방법(레서피 흐름) 하나. PPID 한 개는 여러 Recipe로 구성되며, 같은 Recipe가 여러 PPID에서 재사용될 수 있다(PPID:Recipe = N:M).
_Avoid_: FlowId — 파서(`context_recognized_parser`) 쪽 raw 필드명이며, 플랫폼에서는 PPID로 통일.
