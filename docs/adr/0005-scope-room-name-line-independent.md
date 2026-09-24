# 권한·조회 Scope는 room_name 기준이며 Line은 독립 축이다

상태: **Decided (2026-09-24)**. [ADR-0001](0001-scope-hierarchy-site-line-only.md)의 Site→Line 2단계 Scope 및 Line이 최상위 실무 Scope라는 주장을 대체한다. Factory를 별도 Scope로 모델링하지 않는 결정은 유지한다.

실제 권한·조회 범위는 “포토 공정 담당자”처럼 Site 내 room_name을 기준으로 부여한다. 하나의 room_name은 여러 Line에 걸칠 수 있다. 따라서 포함 관계는 **Site → room_name → StGroup → Equipment**이며, Line은 이 관계와 교차하는 독립 생산·조회 축이다. Site는 물리 DB 분리 경계([ADR-0004](0004-site-is-db-partition-not-column.md))이고, StGroup은 설비의 공정 능력 묶음이다. 이 관계를 UI의 고정 4단 선택기나 각 단계별 별도 권한 역할로 강제하지 않는다.

## Considered Options

- **(채택) room_name 기준 Scope, Line 독립 축**: 실제 담당 범위와 여러 Line에 걸친 room_name/StGroup을 그대로 표현한다. 기존 Line 중심 Scope 가정과 소비 문서를 함께 수정해야 한다.
- **Site→Line Scope 유지**: 기존 계약은 유지되지만 한 담당 범위를 Line별로 분할하거나 중복 부여해야 하며, Line을 넘는 StGroup을 예외로 취급하게 된다.

## Consequences

- 권한 검증은 Site와 room_name 기준을 따른다. Line·StGroup·분임조·Maker/Model 필터를 권한 증명으로 사용하지 않는다.
- Line은 유용한 생산·조회 축으로 유지하지만 room_name을 포함하는 상위 Scope나 최대 Scope 단위로 표시하지 않는다.
- v1의 단일 요청 `scopeId`와 매 요청 서버 검증은 유지한다. Site 선택은 DB 연결 선택이며, 부모·자식 권한 상속과 조회 필터 자동 포함의 세부 규칙은 여전히 Open이다.
- [06 §6.2](../06_platform_ui_contract.md#62-scope와-권한-decided--open)가 전역 소비 계약을 소유한다. 기존 Scope 식별값의 공개 표현·마이그레이션은 구현 시 확정하며, 기존 값을 새 의미로 조용히 재해석하지 않는다.
