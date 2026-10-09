# 페이지 필터 접기는 값 요약 버튼으로 하고 조건을 생략하지 않는다

상태: **Decided (2026-10-10)**.
- 결정자: 사용자 — 이 결정을 Astra(gpt-6-astra high) 리뷰에 위임(2026-10-10)했고, 그 권고를 그대로 채택했다(DEC-230). | 플랫폼 — ADR-0016의 현재 조건 가시성 원칙과 #230의 요구(한 줄 요약·접힘 기억·공통 부품)에서 유도.

#230은 분석 화면 페이지 필터 줄의 접기를 요구했다(#156 후속). 접으면 현재 조건이 입력 뒤로 숨으므로, 접힘 상태에서도 조건을 읽을 수 있게 하는 방법이 문제였다. 세 시안(A 한 줄 값 요약 / B 개수 배지 / C 칩 스트립)을 실제 앱 위에서 비교했고(#230, 브랜치 `hjung3113/proto-230-filter-collapse`), 사용자가 A·B·C 선택을 위임했다. 세부 계약은 [06 §13·§15](../06_platform_ui_contract.md#13-shared-component-layers), 시각 규칙은 [DESIGN.md Filter bar](../../DESIGN.md#filter-bar)가 소유한다.

## 결정

- A의 한 줄 값 요약에 C의 필드명 표시를 결합한다. 접힘 줄은 왼쪽 chevron + `필터` + `라벨 값 · 라벨 값 …`을 담은 펼치기 버튼 하나이고, 초기화 같은 접힘 액션은 오른쪽 독립 버튼으로 남는다. 펼친 입력 줄 끝에는 명시적 `⌃ 접기` 버튼을 두고 별도 상단 헤더는 두지 않는다(C).
- 개수 배지(`필터 3`), 접힘 요약 칩, `변경 n`은 채택하지 않는다. 요약은 소비자가 `summaryItems`(`{ key, label, value }`)로 제공하며, 공통 부품은 활성 조건을 생략·추측하지 않는다. `+n`·CSS 말줄임·title 전용 치환은 금지이고, 폭이 부족하면 `필드명 값` 항목 단위로 줄바꿈한다(긴 값은 단어 내부 줄바꿈 허용).
- 접힘 기억(`platform:page-filter-collapsed:<preferenceKey>`, 실패 시 메모리), 펼침/접힘 포커스 이동, disclosure aria는 PageFilterBar가 소유한다. ManagementLayout column 레일은 자체 접기가 있으므로 이 접기를 켜지 않는다.

## Considered Options

- **(A) 한 줄 값 요약**: 조건값을 보여 주지만 값만 나열하면 `전체 · 전체`처럼 의미가 모호해진다. 시안 원형은 3개 이후 `…`와 truncate로 조건을 다시 숨겼고, 요약이 별도 div라 요약 전체가 키보드 영역이 아니었다.
- **(B) 개수 배지 `필터 3`**: 조건값을 전혀 알려 주지 않는다. title/aria에만 값을 넣으면 눈으로 읽는 현재 상태가 숨고, `fields.length`는 활성 조건 개수도 아니다.
- **(C) 접힘 칩 스트립**: AnalysisLayout의 칩은 누르는 복원 버튼인데 읽기 전용 칩은 모양과 행동이 어긋나고, 많은 값에서 테두리·패딩 비용이 커지며 `+n`은 조건을 다시 숨긴다. 필드명 표시와 펼친 줄의 명시적 `접기`만 취한다.

## 결과

- `PageFilterBar`에 opt-in 접기를 추가한다(`collapsible`, `preferenceKey`, `summaryItems`, `collapsedActions`, `hasPendingChanges`). 기본은 펼침이며 기존 소비자의 fieldset·testid 계약은 그대로다. CycleTimeDrilldown이 첫 소비자이고, 요약은 편집 필드와 같은 label·표시값을 쓰며 잘못된 URL 값은 `알 수 없는 값: <원문>`, 미확정은 `확인 중`으로 사실대로 표시한다.
- #230의 페이지 필터 접기는 입력 영역만 접으며, 현재 조건의 필드명과 값을 표시하는 요약 버튼과 초기화 접근을 남긴다. 기본은 한 줄이고 폭이 부족하면 조건을 생략하지 않고 줄바꿈한다.
- 요약은 조건 편집 UI가 아니며, 누르면 기존 라벨과 입력을 인라인으로 다시 펼친다. ADR-0016이 기각한 popover+선택 칩 편집안과 필터 값·URL·초기화·draft 적용의 소비자 소유권은 유지한다.
- 접힘 기억·포커스·접근성 동작은 PageFilterBar가 제공한다. 구체 계약은 06 §13·§15, 시각 규칙은 DESIGN의 Filter bar 절이 소유한다. ADR-0016의 “항상 보이는 필터”는 조건값이 항상 보인다는 뜻까지 포함하며([ADR-0016](0016-page-filter-bar.md) 보강 줄), ManagementLayout 레일 접기(ADR-0022)와는 별개다.
- ProductivityOverview·EquipmentMaster의 이관은 별도 이슈로 한다.
