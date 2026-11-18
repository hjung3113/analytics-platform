# Analysis 메뉴의 기본 조회는 Apply이며 저장된 뷰를 켠다

상태: **Decided (2026-11-18, 사용자 결정 #2503)**.

기간과 조회 대상을 함께 바꾸는 분석은 조건이 준비됐을 때 한 번 실행하고, 적용한 조건을 다음 분석에도 재사용한다. 사용자가 Analysis 유형 전체에 공통 조회 막대와 저장된 뷰를 기본으로 두기로 결정했다.

## 결정

- Registry는 Analysis 유형의 조회 모드를 Apply로, Apply Analysis의 저장된 뷰를 켬으로 해석한다. 기능 여부를 결정하지 않은 공통 `NO_FEATURES`에는 `savedView`를 두지 않는다.
- 개별 분석 화면은 `query: { mode: 'live' }`로 두 기능을 끌 수 있다. 일괄 적용만 필요한 화면은 `features.savedView: false`를 따로 선언한다. Apply는 주소에 조회 기간을 재현할 수 있어야 하므로 시간 capability가 `apply`여야 한다.
- 기본 조회로 전환한 CLAS와 HW Time은 첫 진입에 공통 자동 적용을 사용한다. HW Time은 기간이 없는 이전 조건 링크에도 기본 기간을 보완해 기존 조건을 재현한다.
- Wafer Journey, MCC, RCC, WPT는 아직 조회 화면이 없어 live를 명시한다. 기간 조회 화면을 구현할 때 Apply와 저장된 뷰 사용 여부를 다시 정한다.
- 메뉴·조회 선언의 세부 규칙은 [커널 §5](../contract/kernel.md#5-menu-extension-contract)와 [§21](../contract/kernel.md#21-saved-view-contract), 화면 배치는 [레이아웃 §12.2](../contract/layout.md#122-analysis-workspace)를 따른다.

## Considered Options

- **메뉴별 opt-in 유지**. 조회를 지원하는 새 분석 메뉴에서 공통 경험이 빠질 수 있다.
- **시간 capability를 보고 모드 자동 판정**. 기간을 선언하지 않은 설정 오류와 live를 의도한 화면을 구별할 수 없다.
- **Analysis 기본값과 명시 opt-out (채택)**. 분석 메뉴의 기본 경험을 통일하고 예외의 의도를 manifest에 남긴다.
