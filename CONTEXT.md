# Analytics Platform

설비 계측 데이터를 Scope(조회 범위)로 좁혀 분석하는 사내 플랫폼의 핵심 도메인 개념. 아래 용어는 2026-09-22 그릴링 세션(`docs/05_roadmap_and_open_questions.md`, `docs/adr/0001-scope-hierarchy-site-line-only.md`)에서 확정됐다.

## Language

### 물리 계층

**Site**:
공장이 위치한 최상위 물리 조직 단위. 여러 Line을 포함한다.
_Avoid_: 사업장 — 기존 문서에서 느슨하게 쓰이던 표현으로, 앞으로는 Site로 통일한다.

**Line**:
Site 내부의 실제 생산 라인. 이 플랫폼이 모델링하는 가장 큰 Scope 단위다. 물리적으로는 하나의 Factory가 여러 Line을 포함하지만, 사내 데이터가 전부 Line 단위로 조직돼 있어 Factory 그룹핑은 이 시스템에서 의미가 없다 — Factory는 별도 Scope 레벨로 모델링하지 않는다.
_Avoid_: 공장, Factory — 구어로는 Line과 같은 뜻으로 쓰이지만, 공식 계층에는 Factory 레벨이 없으므로 Line만 쓴다. 근거: [ADR-0001](docs/adr/0001-scope-hierarchy-site-line-only.md).

### 설비 식별 계층

**Maker**:
설비를 만든 제조사. Model의 상위 개념이며, 하나의 Maker가 여러 Process에 걸쳐 설비를 공급할 수 있다.
_Avoid_: 벤더, Vendor

**Model**:
특정 Maker가 만든 설비 기종. Maker 아래, EquipmentID 위의 계층.

**EquipmentID**:
실제 설비 한 대를 가리키는 최소 식별 단위. Maker → Model → EquipmentID 계층의 최하위이자, 파서가 데이터를 적재하는 가장 작은 키.

### 교차 분류 축 (계층이 아님)

**Process** (`room_name`):
설비가 설치된 공정 구역. Maker/Model 계층과는 독립된(직교하는) 분류 축이다 — 한 Maker의 Model이 여러 Process에 존재할 수 있고, 한 Process에 여러 Maker의 설비가 있을 수 있다. 설비 등록 시점에 고정되며 이후 바뀌지 않는다. 실제 공정이 바뀌면 기존 설비를 수정하는 게 아니라 새 EquipmentID로 재등록한다.

**StGroup** (`stgroup`, 분임조):
설비를 담당자 단위로 묶는 그룹. Process/Maker와도 독립된 축이다. 대부분 하나의 Line 안에 속하지만, 여러 Line에 걸칠 수도 있다(Factory 개념이 없어서 생기는 경우 — [ADR-0001](docs/adr/0001-scope-hierarchy-site-line-only.md) 참고). 소속은 가변적이며, v1의 분석/조회는 **현재 소속 기준**만 사용한다. 과거 시점 소속 재구성(소급)은 EquipmentID가 파서 적재의 최소 키이므로 구조적으로는 가능하지만, 수요 빈도가 낮아 아직 구현하지 않는다. 이 가변성 때문에 딥링크 URL은 `stGroupId`를 직접 소유하지 않고 선택 시점의 EquipmentID 목록으로 물질화한다 — [ADR-0002](docs/adr/0002-stgroup-materializes-to-equipment-ids.md) 참고.
_Avoid_: 팀, 그룹 — StGroup으로 통일.

### 생산 실행

**Lot** (Job):
설비에서 실행된 생산 작업 단위. Recipe를 속성으로 가진다.
_Avoid_: Job — Lot으로 통일(원본 시스템에서 Job으로도 불리나 이 문서에서는 Lot만 쓴다).

**Recipe** (`prc_name`):
Lot 실행에 붙는 속성 — 설비 자체의 고정 속성이 아니라 Lot마다 달라질 수 있다. 지표 산출과 분석 모두에서 가장 많이 쓰이는 1급 분류 축이다.
