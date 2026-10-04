# 페이지 필터는 공통 PageFilterBar의 보이는 한 줄로 표시한다

상태: **Decided (2026-10-04)**.
- 결정자: 사용자 — 실제 앱 위 `?variant=` 프로토타입에서 A(화면별 네이티브) / B(공통 필터 행) / C(팝오버 + 칩) 중 B를 선택했다(#54, 브랜치 `hjung3113/proto-m2-batch2`).

세부 컴포넌트 계약은 [06 §13·§15](../06_platform_ui_contract.md#13-shared-component-layers), 시각 규칙은 [DESIGN.md Filter bar](../../DESIGN.md#filter-bar), 구현 범위는 [#54](https://github.com/hjung3113/analytics-platform/issues/54)가 소유한다. 이 ADR은 결정과 이유를 기록한다.

설비·지표·감사 등 다섯 곳에서 라벨, 입력, 기본 select를 각자 만들고 있어 일관된 접근성과 동작을 유지하기 어렵다. 실제 메뉴 세 곳에서 패턴이 반복됐으므로 06 §24 공통화 조건을 충족한다.

## 결정

- `@ap/components`가 소비자 주도 `PageFilterBar`를 제공한다. 검색·정확 일치 텍스트·분류 선택 필드에 항상 보이는 label을 두고, 한 행에서 시작해 폭이 부족하면 줄바꿈한다. Granularity 같은 소비자 control은 맞춤형 필드로 넣을 수 있다.
- 입력은 `@ap/ui` `Input`, 분류 선택은 `@ap/ui` Select를 쓴다. 검색 아이콘은 실제 검색 필드에만 표시하고 정확 일치 텍스트와 시간 필드에는 붙이지 않는다.
- 값·callback·URL page key·`page` 초기화·reset·draft 적용 의미는 소비 화면이 소유한다. 공통 컴포넌트는 메뉴나 URL 키를 알지 않는다. 현재 선택값이 등록 옵션에 없으면 그 값을 선택 옵션으로 표시한다.
- 프로토타입의 임시 switch와 C안 popover/chip UI는 제품 코드에 넣지 않는다.

## Considered Options

- **(A) 화면별 기본 control 유지**: 각 화면 변경은 적지만, 같은 필터 행의 label·높이·접근성·Select 동작이 계속 달라진다.
- **(B, 채택) 공통으로 항상 보이는 필터 행**: 현재 조건을 숨기지 않고 여러 화면에서 같은 control 계약을 쓴다. 각 소비자가 field와 actions를 전달하므로 페이지별 URL 의미와 draft 적용을 보존한다.
- **(C) popover와 선택 chip**: 행 높이는 줄지만 필드 상태가 chip 뒤에 숨는다. 단일값 page key가 많은 화면에서 여러 조건을 chip으로 옮기면 현재 상태를 찾고 수정하기 어려워져 선택하지 않았다.

## 결과

- `PageFilterBar`는 공통 배치와 `Input`/Select 표시를 소유하고, 메뉴는 필터 의미·URL 키·조회와 reset/apply callback을 소유한다.
- 설비·지표·감사 화면과 추가 native-select 필터를 같은 컴포넌트로 옮긴다. 표의 컬럼·복사·내보내기 툴바는 범위에 포함하지 않는다.
- 05의 Decided 상태, 06의 공통 컴포넌트·필터 경계, DESIGN의 필터 행 규칙을 함께 갱신한다.
