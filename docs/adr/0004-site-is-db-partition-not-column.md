# Site는 조회 조건이 아니라 물리적으로 분리된 DB다

설비 마스터 테이블에는 Site 컬럼이 없다 — Site 단위로 DB 자체가 분리돼 있다(2026-09-24 도메인 인터뷰 확인). 따라서 Site 선택은 같은 DB 안의 필터 조건이 아니라 "어느 DB 연결로 조회할지"를 고르는 문제다.

## Consequences

- **EquipmentID는 모든 Site에 걸쳐 전역적으로 유일하다.** Site DB 간 동일 ID 충돌은 없다. 그래도 Site를 EquipmentID만으로 역조회·자동 해석하지 않는다. 설비 ID를 사용하는 시점에는 활성 세션/선택 Scope에서 Site가 이미 확립되어 있어야 하며, 딥링크도 이 전제를 따른다. Site 결정은 ID lookup 문제가 아니라 활성 Scope의 선행 조건이다.

- Scope 선택기(`docs/06_platform_ui_contract.md` §6.2)가 Site를 Line과 같은 방식의 필터 컬럼으로 구현하면 안 된다 — Site 전환은 연결 대상 자체가 바뀌는 동작이다.
- 여러 Site를 동시에 비교·조회하는 기능은 단일 DB 쿼리로 처리할 수 없고, DB별 연결을 오가며 합쳐야 한다 — v1의 단일 Scope 선택 제약([06 §6.2](../06_platform_ui_contract.md#62-scope와-권한-decided--open), [ADR-0005](0005-scope-room-name-line-independent.md))과 맞물려 있다.
