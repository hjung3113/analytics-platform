# ADR-0080 — Inspector: 섹션을 한 번 선언하고 두 형태(`stack`·`rail`)로 보인다

- Status: Decided (2026-10-24)
- Decider: 코디네이터(2026-10-24), 되돌릴 수 있다. 계획 문서의 Design(#690 S3)을 구현하는 결정이다.
- Scope: [#690](https://github.com/hjung3113/analytics-platform/issues/690) 노드 690e. 관련: [06 §13](../06_platform_ui_contract.md#13-shared-component-layers)(`Inspector`), [ADR-0029](0029-page-filter-bar-collapse-summary.md)(접힘 요약)는 건드리지 않는다.

## 맥락

분석 화면의 보조 설정(대상, 범례, 옵션)은 화면마다 개수가 다르고, 어떤 화면은 차트에 폭을 더 주려고 좁은 레일을 원한다. 조사(`docs/research/2026-10-23-dense-drill-workspace-patterns.md` 질문 1)가 비교한 대안은 셋이다.

## 대안

- **A. 아코디언 스택.** WAI-ARIA APG 아코디언(제목 안의 버튼, `aria-expanded`/`aria-controls`, Enter/Space)을 따른다. Carbon처럼 여러 섹션을 함께 열 수 있고 전체가 스크롤한다. 접힌 섹션의 요약이 머리에 남는다. 폭을 계속 쓴다.
- **B. 레일 + peek.** 40 px 아이콘 열에서 섹션 하나를 비모달 Popover로 잠깐 연다. 폭은 가장 적게 쓰지만 열려 있는 동안 다른 섹션을 같이 볼 수 없다.
- **C. 탭.** 섹션 하나만 보인다. 섹션 사이 값을 대조할 수 없고, 접힌 상태의 요약을 줄 자리가 없다.

## 결정

**A와 B를 하나의 부품 `Inspector`의 두 `form`으로 낸다.** 섹션(`id`·`title`·`icon`·`summary`·`render`)은 한 번 선언하고, 메뉴가 `form`을 고른다. C는 만들지 않는다.

- 부품을 둘로 나누면 메뉴가 같은 섹션을 두 번 선언하고 접근성 계약(APG, 포커스 복귀)을 두 곳에서 지켜야 한다. 한 부품이면 선언이 하나이고 형태 전환은 `form` 값 하나다.
- **여러 섹션을 동시에 여는 것이 기본이다**(`defaultExpanded` 생략 = 모두 열림). 이유: 이 화면의 섹션은 서로 대조하며 쓰는 설정이다(범례를 보며 대상을 확인). 하나만 열면 섹션을 오갈 때마다 다른 섹션이 닫혀 값을 잃는 것처럼 보인다. 하나만 열기는 소비자가 `expanded`/`onExpandedChange`로 직접 정할 수 있다(controlled).
- **섹션 내용은 질의를 소유하지 않는다.** 질의는 Inspector 위에 두고 결과만 `render`에 넘긴다. `stack`은 접힌 섹션도 마운트를 유지하고(`hidden`), `rail`은 peek 중인 섹션만 마운트한다. `form`을 바꾸면 섹션 내용은 다시 마운트되지만(상태 초기화) 호출자의 질의는 그대로다.
- 펼침 집합의 기억은 `useCollapsePreference` 계열의 키 규칙(`platform:<선호>:<key>`)과 `readLocalStorage`/`writeLocalStorage`를 쓴다. 단일 불리언인 그 훅은 확장하지 않는다(집합이고, 반대쪽 버튼 포커스 이동이 필요 없다).

## 하지 않는 것

"섹션을 모두 접으면 레일이 된다"는 새 전이라 사용자 변형 컨펌이 먼저다(계획 D5). 끌어서 재정렬, 검색, 중첩 섹션도 만들지 않는다.

## 되돌리기

`form`은 부품 안의 선택이라 한 형태를 빼도 다른 형태의 소비자는 영향이 없다. 새 공개 export이므로 소비자가 생기기 전에는 이름과 모양을 자유롭게 고칠 수 있다.
