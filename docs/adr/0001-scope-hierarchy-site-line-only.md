# Scope 계층은 Site→Line 2단계이며 Factory는 모델링하지 않는다

물리적으로는 하나의 Factory가 여러 Line을 포함하지만, 사내 시스템 전체가 데이터를 Line 단위로만 조직하고 있어 Factory 단위로 묶는 것 자체가 의미가 없다(2026-09-22 도메인 인터뷰 확인). 기존 문서(`docs/06_platform_ui_contract.md`)가 가정했던 Site→공장→라인 3단계 가설을 폐기하고, 이 플랫폼은 Scope를 **Site → Line 2단계**로만 모델링하며 Factory를 별도 Scope 레벨로 두지 않는다.

## Consequences

- StGroup(분임조)은 원래 하나의 Factory 안에서 여러 Line에 걸쳐 구성될 수 있는데, Factory 개념이 없으므로 이 경우 StGroup이 여러 Line Scope 값에 걸치는 것으로 나타난다. 이는 버그가 아니라 이 결정의 직접적인 결과다.
- 나중에 Factory 단위 집계·조회가 실제로 필요해지면, 사내 어디에도 없는 Factory-Line 매핑을 새로 소싱해야 한다 — 기존 데이터에서 유도할 수 없다.
