# Context 바는 우선순위 넘침으로 한 줄을 유지한다 (프로토타입 B안)

상태: **Decided (2026-10-04)**.
- 결정자: 사용자 — 실제 앱 위 `?variant=` 프로토타입에서 A(wrap) / B(priority overflow) / C(summary + disclosure) 중 B를 선택했다(#56, 브랜치 `hjung3113/proto-m2-batch2`).

세부 동작·우선순위·접근성은 [06 §7](../06_platform_ui_contract.md#7-application-shell), 배치는 [07 앱 셸 와이어프레임](../07_app_shell_wireframe.md), 시각 보완은 [DESIGN.md](../../DESIGN.md#shell-visual-rules)가 소유한다. 이 ADR은 결정과 이유만 둔다.

기존 Context 바는 1440px 생산성 개요에서 49px 한 줄이지만, 1280px 설비 마스터에서 상세 슬롯을 열면 89px 두 줄, 1024px에서는 148px 세 줄이었다. #205의 고정 상세 슬롯은 뷰포트 변화 없이 본문 폭을 줄이므로 viewport breakpoint만으로는 대응할 수 없다. 같은 1024px 상세 열림 조건에서 B 프로토타입은 48px이었다.

## 결정

- **B 우선순위 넘침을 채택한다.** 바 자체 폭에 맞춰 기간을 남기고 다른 조건을 하나의 넘침 팝오버에서 편집한다. 한 줄 Baseline과 기존 Context 의미를 유지한다.
- 컨펌된 스펙은 `hjung3113/proto-m2-batch2`의 B안(`d29bec0`, 병합 안 함)과 `.agents/reports/design/shots/m2-batch2`(원격 브랜치 `hjung3113/proto-m2-batch2`의 커밋에만 있다)의 비교 캡처다. 프로토타입 코드와 variant 전환기는 본 코드에 넣지 않는다.

## Considered Options

- **(A) wrap 유지**: 모든 편집기가 즉시 보이지만 상세 슬롯이 열리면 바 높이가 두세 줄로 늘어 콘텐츠를 밀고 48px Baseline을 지키지 못한다.
- **(B, 채택) priority overflow**: 기간은 바로 편집하고 나머지는 우선순위에 따라 넘긴다. 적용된 숨은 조건 수와 capability 표시는 유지한다.
- **(C) summary + disclosure**: 요약은 짧지만 편집에 추가 펼침이 필요하고 1024px에서 요약 자체가 잘린다.

## 결과

- 셸의 공통 Context 배치 책임으로 구현한다. 메뉴별 압축을 만들지 않고 기존 편집기·어댑터·Kernel setter·URL 계약을 소비한다. Scope 선택기는 사이드바의 하나를 유지한다.
- 바 자체의 ResizeObserver와 intrinsic 측정이 필요하다. 측정 레이어는 상호작용·접근성 트리에서 제외하고 중복 조회를 만들지 않는다.
- 숨은 조건은 넘침에서 원래 편집기로 접근하고 명시적 빈 선택도 적용 수에 포함한다. 기간과 아이콘 동작은 전체 접근 이름을 유지한다.
- 06·07·05·DESIGN과 폭별 계약 검사를 함께 갱신한다.
