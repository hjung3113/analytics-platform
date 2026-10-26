# Equipment Group URL은 Condition과 Selection 두 층으로 나눈다

상태: **Decided (2026-10-21 부분 개정)**. 단일축 제한과 과거 소속 미도입은 [ADR-0059](0059-app-injected-equipment-axes-and-condition.md)가 대체하며 Condition/Selection 분리는 유지한다. 기존 “StGroup 선택 즉시 전체 멤버를 equipmentIds로 물질화” 결정을 대체한다. 기존 참조를 유지하기 위해 파일명은 바꾸지 않는다.

StGroup·분임조·Maker+Model 및 향후 그룹 축에서 “어떤 조건으로 설비를 찾는가”와 “그 결과에서 어떤 설비를 명시적으로 골랐는가”는 다른 상태다. 선언한 소속 기준·속성으로 결과를 다시 찾는 수요와 특정 이상 설비 집합을 유지하는 수요를 하나의 키로 충족할 수 없으므로, 모든 축에 동일한 **Condition/Selection 두 층**을 적용한다.

- **Condition**: 조회에 실제 사용한 그룹 축과 조건을 보존한다. 앱이 주입한 여러 축·값을 조합하고 선언한 소속 기준으로 재평가하는 live reference다. 다중축 AND / 같은 축 값 OR와 소속 기준은 [ADR-0059](0059-app-injected-equipment-axes-and-condition.md)를 따른다.
- **Selection**: 조건 결과에서 사용자가 명시적으로 고른 설비는 항상 **고정된 EquipmentID 목록**으로 물질화한다. 조건 축 종류에 따른 예외가 없으며 재방문 시 현재 그룹 멤버로 목록을 다시 만들지 않는다.

## Considered Options

- **(채택) Condition live reference + Selection 고정 ID 목록**: 조건의 최신성과 명시 선택의 재현성을 각각 보장한다. 두 상태를 URL·UI·Context 전달에서 구분하는 비용이 있다.
- **모든 그룹 조건을 즉시 ID 목록으로 물질화**: 설비 집합은 고정되지만 원래 조회 의도와 현재 그룹을 재조회하는 기능을 잃는다.
- **조건만 보존하고 선택도 재평가**: URL은 단순하지만 사용자가 골랐던 설비 집합이 소속 변경으로 바뀌어 드릴다운 문맥을 보존하지 못한다.

## Consequences

- 같은 조건 URL은 선언한 소속 기준의 멤버/매칭 설비나 이력이 바뀌면 결과도 바뀔 수 있다. UI는 적용한 소속 기준을 표시하고, 결과에는 평가 기준시각을 연결한다. 딥링크 재현성은 조건과 명시 선택의 재현이며 결과 불변 보장이 아니다.
- 선택 목록은 조건을 역산하거나 현재 멤버로 확장·교체·축소하지 않는다. 권한·Scope는 매번 재검증하며 고정 선택이 권한을 부여하지 않는다.
- 공개 키 후보와 기존 `equipmentIds`의 대응은 [06 §6.1/§6.4](../contract/platform-ui-contract.md)가 소유한다. StGroup을 포함한 모든 주입 축의 그 시점 소속 / 지금 소속은 [ADR-0059](0059-app-injected-equipment-axes-and-condition.md)를 따른다. 이력 없는 축은 지금 소속만 허용한다.
- 상세를 본 뒤 분석으로 돌아오면 진입 전 Condition/Selection을 그대로 복원한다. 목적지 EquipmentID가 기존 선택 밖이어도 선택을 변경하지 않는다.
