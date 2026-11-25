---
version: alpha
name: analytics-platform-design
description: >
  Platform visual extensions and data-workspace patterns on the shared design system.
  Shared tokens, fonts and primitives are owned by the platform (@ap/ui, ADR-0043/0046;
  tokens, utils and primitives moved from FeedbackOps a8d768b8 in #441, other groups follow);
  shell structure and behavior remain owned by the platform UI contract.
sources:
  sharedTokens: packages/sdk/ui/src/styles/tokens.css
  sharedTypography: packages/feature/screens/docs/tokens.md
  sharedPrimitives: packages/feature/screens/docs/ui-design-system.md
  consumptionContract: docs/adr/history/feedbackops/0058-tailwind-v4-css-first-theme.md
  shellContract: docs/contract/platform-ui-contract.md
  extensionValues: packages/sdk/ui/src/styles/platform-tokens.css
  extensionMappings: packages/sdk/ui/src/styles/index.css
colors:
  accent-primary: "var(--color-neon-lime)"
  accent-primary-hover: "#102080"
  accent-primary-soft: "#e4e8f6"
  accent-info: "var(--color-cyan-spark)"
  accent-success: "var(--color-emerald)"
  accent-success-soft: "#e3f5ed"
  accent-warn: "var(--color-amber)"
  accent-warn-soft: "#f4ece0"
  accent-danger: "var(--color-warning-red)"
  accent-danger-soft: "#fae5e7"
  accent-neutral: "var(--color-storm-cloud)"
  accent-neutral-soft: "var(--color-deep-slate)"
  border-control: "var(--color-storm-cloud)"
  surface-sunken: "var(--color-deep-slate)"
  cat-purple: "#a23e8c"
  cat-teal: "#0b7f75"
  cat-amber: "#c8690a"
  cat-amber-stroke: "#c8690a"
  chart-blue: "#2e6bd9"
  chart-teal: "#0b7f75"
  chart-green: "#57822b"
  chart-series-1: "#2e6bd9"
  chart-series-1-stroke: "#2e6bd9"
  chart-series-2: "#0b7f75"
  chart-series-2-stroke: "#0b7f75"
  chart-series-3: "#c8690a"
  chart-series-3-stroke: "#c8690a"
  chart-series-4: "#a23e8c"
  chart-series-4-stroke: "#a23e8c"
  chart-series-5: "var(--chart-green)"
  chart-series-5-stroke: "var(--chart-series-5)"
  chart-heat-seq-0: "#e3edfb"
  chart-heat-seq-1: "#afcdf5"
  chart-heat-seq-2: "#7faeec"
  chart-heat-seq-3: "#2b6bcb"
  chart-heat-seq-4: "#123a7a"
  chart-heat-div-0: "#1b4fa3"
  chart-heat-div-1: "#afcdf5"
  chart-heat-div-2: "#f1f4f8"
  chart-heat-div-3: "#e8796b"
  chart-heat-div-4: "#c4281c"
  chart-status-good: "var(--accent-success)"
  chart-status-warn: "var(--accent-warn)"
  chart-status-critical: "var(--accent-danger)"
  chart-no-data: "#e5eaf0"
  chart-no-data-pattern: "#667083"
  chart-selection-outline: "var(--accent-primary)"
  chart-median-on-fill: "var(--surface-card)"
  chart-remainder: "#94a3b8"
  chart-grid: "#eef1f5"
  icon-blue-soft: "#e3efff"
  icon-teal-soft: "#dcf8ef"
typography:
  t-page-title: { fontSize: 24px, lineHeight: 32px, fontWeight: 600, letterSpacing: -0.3px }
  t-section-title: { fontSize: 18px, lineHeight: 28px, fontWeight: 600 }
  t-card-title: { fontSize: 14px, lineHeight: 20px, fontWeight: 600 }
  t-stat: { fontSize: 32px, lineHeight: 1.1, fontWeight: 600, letterSpacing: -0.5px, fontVariantNumeric: "tabular-nums lining-nums" }
  t-stat-2: { fontSize: 22px, lineHeight: 1.2, fontWeight: 600, letterSpacing: -0.3px, fontVariantNumeric: "tabular-nums lining-nums" }
  t-delta: { fontSize: 12px, lineHeight: 1.4, fontWeight: 600, fontVariantNumeric: "tabular-nums lining-nums" }
  t-caption: { fontSize: 12px, lineHeight: 16px }
  t-table-header: { fontSize: 12px, lineHeight: 1.3, fontWeight: 600, letterSpacing: 0.3px }
  t-badge: { fontSize: 11px, lineHeight: 1.3, fontWeight: 600, letterSpacing: 0.2px }
  t-nav-group: { fontSize: 11px, lineHeight: 1.3, fontWeight: 600, letterSpacing: 0.5px, textTransform: uppercase }
  t-mono: { fontFamily: "var(--font-mono)", fontSize: 12px, lineHeight: 1.4 }
  tabular: { fontVariantNumeric: "tabular-nums lining-nums" }
rounded:
  xs: "var(--radius-sm)"
layout:
  breakpoint-wide: 90rem
  page-condition-layer-width: 360px
components:
  table-density:
    rowMinHeight: 32px
    headerMinHeight: 32px
    cellPadding: 4px 16px
  stat-card:
    valueTypography: t-stat
    secondaryValueTypography: t-stat-2
    deltaTypography: t-delta
  data-table-header-row:
    backgroundColor: "var(--surface-sunken)"
    textColor: "var(--text-secondary)"
    typography: t-table-header
  table-selection:
    targetMinSize: 24px
    borderColor: "var(--border-control)"
  current-position:
    accentBarWidth: 2px
    accentColor: "var(--accent-primary)"
---

## Overview

> 디자인 시스템 결정과 공유 토큰·폰트·primitive의 원본은 플랫폼 `@ap/ui`다([ADR-0043](docs/adr/0043-platform-sdk-is-the-app-contract-and-unified-framework.md), [ADR-0046](docs/adr/0046-design-system-source-moves-to-platform-whole-package.md)). 본문의 "공유 원본" 표기는 도입 당시 값의 출처를 뜻한다. 현행 값과 변경 제안은 `packages/sdk/ui/`를 기준으로 한다.

이 문서는 **공유 디자인 시스템 위에 얹는 플랫폼 디자인 확장**의 원본이다. 공유 디자인 시스템을 다시 정의하지 않는다. [ADR-0010](docs/adr/0010-feedbackops-design-system-shared-on-tailwind-v4.md)의 직접 소비 방식과 [ADR-0011](docs/adr/0011-design-direction-feedbackops-shell.md)의 승인된 프로토타입 C안을 따른다. #193의 토큰 이행과 #194의 밝은 셸 규칙을 반영한다. 이 문서 갱신은 새 프로토타입 승인이나 런타임 검증 기록이 아니다.

메뉴 화면은 Kernel·공통 컴포넌트·차트 계약·Page Archetype·메뉴간 연결을 검증하는 Consumer다. 화면마다 새 팔레트나 부품 체계를 만들지 않는다. 행동·권한·Context·상태 의미는 [06](docs/contract/platform-ui-contract.md)이 우선한다.

| 소유자 | 소유하는 규칙 | 이 문서의 관계 |
| --- | --- | --- |
| 플랫폼 [tokens.css](packages/sdk/ui/src/styles/tokens.css)·[semantic.css](packages/sdk/ui/src/styles/semantic.css)(FeedbackOps `a8d768b8`에서 이전, ADR-0046), 기능 화면 [tokens.md](packages/feature/screens/docs/tokens.md)(이전 시점 설명) | 공유 색·표면·간격·반경·폰트·본문 타이포·AA 의미 label 쌍 | 원본은 플랫폼; 값 스케일을 복제하지 않고 semantic token을 소비 |
| 플랫폼 `@ap/ui`(원본, ADR-0046). 기능 화면 [ui-design-system.md](packages/feature/screens/docs/ui-design-system.md)·[ADR-0058](docs/adr/history/feedbackops/0058-tailwind-v4-css-first-theme.md)는 이전 시점(`a8d768b8`)의 참고 문서 | primitive의 모양·상태, CSS-first 소비·폰트 로딩 계약. 이전 뒤 변경은 `@ap/ui`에서 한다 | `@ap/ui`를 통한 공개 primitive·CSS 소비 |
| [06 §7–9](docs/contract/layout.md#7-application-shell), [07](docs/design/app-shell.md) | 셸 구조·치수·슬롯·navigation IA·시나리오 | 구조를 복사하지 않고 플랫폼 시각 보완만 정의 |
| DESIGN.md | 플랫폼 확장 token의 역할·값 출처, 허용 전경/표면, 분석·KPI·표·차트 시각 패턴 | 아래 정의가 원본 |
| [플랫폼 확장 CSS](packages/sdk/ui/src/styles/platform-tokens.css), [매핑·역할 유틸리티](packages/sdk/ui/src/styles/index.css) | 확장 구현 | 문서와 대조; 불일치는 별도 보고 |

## Platform extension layer

아래 `--*`는 CSS 변수명이다. 공유 palette 참조는 공유 원본을 따르며, literal은 플랫폼이 소유한다. raw palette를 컴포넌트에서 직접 쓰지 않는다. `tokens.css`는 RGB triple을 사용한다. front matter의 literal은 hex, 공유 참조는 공유 CSS 변수명이다.

### Colours and surfaces

| 플랫폼 token | 역할·사용 시점 | 값 출처 |
| --- | --- | --- |
| `accent-primary` | 주요 동작·링크·현재 위치·focus 계열의 일관된 강조 | 공유 `color-neon-lime` 참조 |
| `accent-primary-hover` | primary 동작 hover | 플랫폼 literal `#102080` |
| `accent-primary-soft` | 선택 요약·강조의 옅은 배경; 선택 표식 동반 | 플랫폼 literal `#e4e8f6` |
| `accent-info` / `accent-success` / `accent-warn` / `accent-danger` | 의미 dot·icon·tint; 작은 의미 글자에 쓰지 않음 | 공유 `color-cyan-spark` / `color-emerald` / `color-amber` / `color-warning-red` 참조 |
| `accent-success-soft` | 긍정 의미 배경·delta/badge fill | 플랫폼 literal `#e3f5ed` |
| `accent-warn-soft` | 경고 의미 배경 | 플랫폼 literal `#f4ece0` |
| `accent-danger-soft` | 오류 의미 배경 | 플랫폼 literal `#fae5e7` |
| `accent-neutral` / `accent-neutral-soft` | 미평가·보조 상태의 dot 및 배경 | 공유 `color-storm-cloud` / `color-deep-slate` 참조 |
| `border-control` | 입력·select·checkbox 등 식별에 필요한 interactive 경계 | 공유 `color-storm-cloud` 참조 |
| `surface-sunken` | 표 열 머리·검색 배경·progress track·recessed 보조 영역 | 공유 `color-deep-slate` 참조 |
| `chart-series-1` / `chart-series-2` / `chart-series-3` / `chart-series-4` / `chart-series-5` | 기본 범주 색 순서 | 1–4는 `#2e6bd9` / `#0b7f75` / `#c8690a` / `#a23e8c` (#2724), 5는 `chart-green` 별칭 (#2945) |
| `chart-series-1-stroke` / `chart-series-2-stroke` / `chart-series-3-stroke` / `chart-series-4-stroke` / `chart-series-5-stroke` | 얇은 선·외곽선과 선 범례에 사용. 카드 대비 ≥3:1 | 각 계열의 채움과 같은 값. `chart-series-5-stroke`는 `chart-series-5` 별칭 |
| `chart-heat-seq-0..4` | 값이 낮음에서 높음으로 가는 순차 heatmap ramp | 플랫폼 literal `#e3edfb` → `#afcdf5` → `#7faeec` → `#2b6bcb` → `#123a7a` |
| `chart-heat-div-0..4` | 목표와 방향이 정의된 경우의 diverging heatmap ramp | 플랫폼 literal `#1b4fa3` → `#afcdf5` → `#f1f4f8` → `#e8796b` → `#c4281c` |
| `chart-status-good` / `chart-status-warn` / `chart-status-critical` | 승인된 실제 판정의 상태색만; 작은 글자는 의미 label token을 사용 | `accent-success` / `accent-warn` / `accent-danger` alias |
| `chart-no-data` / `chart-no-data-pattern` | 결측값은 0·최저값·기타와 구분해 빗금으로 표시 | 플랫폼 literal `#e5eaf0` / `#667083` |
| `chart-selection-outline` | 선택·hover 강조 외곽선; series 색 정체성은 보존 | `accent-primary` alias |
| `chart-median-on-fill` | 진한 box fill 위 불투명 median 선 | `surface-card` alias |
| `cat-purple` / `cat-teal` / `cat-amber` | 범주 tag·series 구분; 성공·실패 판정이나 CTA에 쓰지 않음 | 플랫폼 literal `#a23e8c` / `#0b7f75` / `#c8690a` |
| `chart-blue` / `chart-teal` / `chart-green` | series 정체성; 의미 있는 얇은 선 대비는 Chart stroke 결정 참고 | 플랫폼 literal `#2e6bd9` / `#0b7f75` / `#57822b` (3번째 주황은 `chart-series-3`; `chart-purple`은 sdk-v0.48.0에서 제거, #2796) |
| `chart-blue-stroke` / `chart-teal-stroke` / `cat-amber-stroke` | 얇은 line/outline mark와 해당 line legend 전용; fill과 작은 글자에는 쓰지 않음 | v3 literal `#2e6bd9` / `#0b7f75` / `#c8690a` (fill과 같은 값) |
| `chart-remainder` | 이름과 분모가 확인된 나머지 범주 | 플랫폼 literal `#94a3b8` |
| `chart-grid` | 보조 grid; 의미 있는 데이터 선에 쓰지 않음 | 플랫폼 literal `#eef1f5` |
| `icon-blue-soft` / `icon-teal-soft` | KPI·분석 범주 icon chip 배경; navigation 그룹에는 채운 chip을 만들지 않음 | 플랫폼 literal `#e3efff` / `#dcf8ef` |

작은 의미 label은 공유 시스템 소유의 `--text-{success,info,warning,danger}-label` 쌍과 `text-text-{success,info,warning,danger}-label` 유틸리티를 사용한다. 플랫폼은 이를 다시 별칭으로 선언하지 않는다. `text-text-success-label` 같은 label 유틸리티는 공유 vivid 의미 색 `text-text-success`와 구별한다. 표면·경계 유틸리티는 `bg-surface-sunken`, `border-border-control`; 구조 구분선은 공유 `border-border-subtle`이다.

### Typography roles

공유 font family·본문·font loading은 [기능 화면 타이포 원본](packages/feature/screens/docs/tokens.md#tokens--typography)과 [ADR-0058 §2](docs/adr/history/feedbackops/0058-tailwind-v4-css-first-theme.md#2-theme-inline-because-theme-namespaces-overlap-token-names)을 따른다. 라틴/한글은 공유 `--font-sans`(Inter + Pretendard), 기술 문자열은 공유 `--font-mono`를 상속한다. 플랫폼은 별도 body scale을 만들지 않는다. 한국어 UI 문구는 단어 단위 줄바꿈(`break-keep`)을 쓴다 (근거 #1167).

아래 역할 값은 플랫폼 literal이며 [index.css](packages/sdk/ui/src/styles/index.css)의 클래스와 일치한다. line-height는 px 표기 또는 unitless 배수다. 지정하지 않은 font family·weight·tracking은 공유/상위 값을 상속한다.

| 역할 클래스 | 크기 / line-height / weight | 추가 속성 | 사용 |
| --- | --- | --- | --- |
| `t-page-title` | 24px / 32px / 600 | tracking -0.3px | 본문 수준의 큰 제목; 한 줄 셸 머리의 강제 기본값 아님 |
| `t-section-title` | 18px / 28px / 600 | — | 셸 페이지 제목, 분석·목록 section 제목 |
| `t-card-title` | 14px / 20px / 600 | — | compact panel 제목 |
| `t-stat` | 32px / 1.1 / 600 | tracking -0.5px, tabular lining numbers | primary KPI |
| `t-stat-2` | 22px / 1.2 / 600 | tracking -0.3px, tabular lining numbers | secondary KPI·donut 값 |
| `t-delta` | 12px / 1.4 / 600 | tabular lining numbers | 기준이 있는 delta |
| `t-caption` | 12px / 16px / 상속 | — | 보조 설명·단위·출처; opacity 없이 허용 pairing 사용 |
| `t-table-header` | 12px / 1.3 / 600 | tracking 0.3px, 선언한 대소문자 | 기술 열 머리 역할 |
| `t-badge` | 11px / 1.3 / 600 | tracking 0.2px | 짧은 상태 label |
| `t-nav-group` | 11px / 1.3 / 600 | tracking 0.5px, uppercase | 비인터랙티브 그룹 section label |
| `t-mono` | 12px / 1.4 / 상속 | 공유 `--font-mono` | ID·기술 값·correlation ID |
| `tabular` | 크기·weight 상속 | tabular-nums lining-nums | 수치 열·분모·비교 값 |

크기 전용 `text-caption`도 `--text-caption`의 12px을 쓰며 line-height는 상속한다. 사이드바 그룹 제목은 `t-nav-group`, 「예정」·개수 표시는 `t-badge`를 쓴다. 그룹 제목의 여백만 각 자리에서 정한다.

표 헤더와 PlatformDataTable의 정렬 버튼은 `t-table-header`를 사용하며 선언한 대소문자를 그대로 표시한다(Decided, #2541). 그룹 제목은 탐색 영역의 section label로 기존 대문자 표기를 쓴다.

실제 시점은 목록에서는 로컬 절대 시각, 요약에서는 짧은 로컬 시각, 알림과 활동 피드에서는 상대 시각과 전체 시각 `title`로 표시한다. [Kernel §6.3](docs/contract/kernel.md)의 표기 함수를 쓴다.

### Radius and layout extensions

| token | 역할·사용 | 값 출처 |
| --- | --- | --- |
| `radius-xs` | 작은 inline chip/아이콘 버튼의 compact 반경 alias | `index.css`의 `var(--radius-sm)` → 공유 반경; 별도 literal 아님 |
| `breakpoint-wide` | 넓은 분석 grid를 전환하는 `wide:` 기준 | 플랫폼 literal `90rem` |
| `detail-panel-width` | 셸 고정 상세 슬롯 폭 | 공유 토큰; 소비 시 fallback·clamp는 06 §7 |
| `rounded-inset-md` (utility) | 2px 여백을 둔 `rounded-md` 틀 안쪽 칸(segmented·filter toggle)의 반경 | `compat.css`의 `calc(var(--radius-md) - 2px)`; 별도 literal 아님 |
| `scrollbar-panel` (utility) | 테두리 상자 안 스크롤 영역의 얇은 스크롤바(트랙 없음). `shell-scroll`은 별칭 | `compat.css`; `--border-strong` 색 |
| `surface-hatched` (utility) | 결측 셀·범례의 대각선 빗금. 0·일반 중립 셀과 모양으로 구별 | `compat.css`; 기존 `--surface-sunken`·`--border-subtle` 색 변수를 사용해 테마를 따름. 새 색 token 없음 |

사용하지 않는 overlay 전용 `width-detail-panel`/`w-detail-panel` 확장은 ADR-0013으로 폐기했다. 상세 슬롯은 공유 `--detail-panel-width`를 직접 소비한다. 반응형 정책의 상태·MVP 범위는 [06 §25](docs/contract/layout.md#25-responsive-strategy)와 [05](docs/overview/roadmap-and-open-questions.md#mvp-지원-환경--데스크톱-웹만-decided-2026-09-27)를 따른다. DetailDrawer는 지원 데스크톱에서 고정 슬롯을 유지한다.

## Accessibility pairing rules

[06 §26](docs/contract/platform-ui-contract.md#26-accessibility-baseline)의 색+shape/text, visible focus, 차트 대체 경로 의무를 소비한다. 아래는 플랫폼의 구체 token pairing 규칙이다. 작은 일반 글자는 최소 4.5:1, 의미 있는 control 경계는 최소 3:1을 확보한다. **필수 글자에 opacity fade를 적용하지 않는다.** `text-disabled`는 실제 비활성 표현에만 쓰고 그룹 제목·현재 Scope·도움말·상태·단위에 쓰지 않는다.

### Allowed foreground/surface pairs

label 행은 #210(공유 원본 값), 나머지 행은 #193/#194 UI/UX 리뷰의 opaque sRGB token 계산이다. 렌더 검증을 대신하지 않는다. `surface-popover`는 sunken과 같은 공유 palette를 쓰므로 동일 제한을 받는다.

| 전경 | 허용 표면 / 대비 | 제한·적용 예 |
| --- | --- | --- |
| `text-primary`, `text-secondary` | canvas/card/sidebar/sunken/hover/selected | 필수 제목·검색 입력·열 머리·popover 설명. secondary는 sunken 9.23:1, sidebar/hover/selected 9.310/8.909/8.218:1 |
| `text-muted` | canvas 4.931:1, card 5.536:1, sidebar 5.001:1 | opaque 보조 문구·section label; fade 금지 |
| `text-muted` | sunken 4.960:1, hover 4.785:1, selected **4.414:1** | selected에서 필수 작은 글자에 금지. 상태 변화에도 읽기 여유를 유지하도록 hover/selected 행의 작은 메타 글자는 `text-secondary`로 — 목록 행은 `data-list-row`(선택 중 `data-selected`)를 달고 메타 글자에 `row-meta`를 쓴다 |
| 공유 `text-text-success-label` | card 5.877:1, success-soft 5.191:1; canvas/sunken/hover/selected 포함 최저 4.686:1 | 작은 성공 의미 글자; vivid success는 dot/icon/tint로 분리 |
| 공유 `text-text-info-label` | card 5.674:1, primary-soft 4.639:1; 동일 표면 집합 최저 4.523:1 | 작은 정보 의미 글자 |
| 공유 `text-text-warning-label` | card 6.088:1, warn-soft 5.195:1; 동일 표면 집합 최저 4.854:1 | 작은 경고 의미 글자 |
| 공유 `text-text-danger-label` | card 6.700:1, danger-soft 5.560:1; 동일 표면 집합 최저 5.342:1 | 작은 오류 의미 글자 |
| `text-secondary` (neutral label) | sunken/neutral-soft 9.23:1 | 중립 배지·필수 미평가 설명 |
| `border-control` | card/canvas/sunken/hover/selected 4.988/4.442/4.469/4.311/3.977:1; sidebar 4.505:1 | interactive control 식별 경계로 모두 ≥3:1; text-muted와 독립된 중립 색 |
| `border-subtle` | 구조 divider·card·행 구분 | 입력/checkbox의 유일한 식별 경계로 사용 금지 |
| 공유 `focus-ring` / 플랫폼 `accent-primary` | sidebar/hover/selected 10.304/9.859/9.095:1 | opaque focus/current 막대; 색 외 형태 단서 동반 |

허용 표에 없는 새 fill·opacity 조합은 자동 허용하지 않고 실제 전경/표면을 계산한다. vivid dot/icon 역시 의미를 단독 전달하면 비텍스트 대비를 확인해야 한다. 차트 palette의 알려진 부족과 후속 구현은 아래 Chart stroke 결정 및 #203에서 추적한다.

## Shell visual rules

셸 구조·치수·본문 여백·gap·sticky 배치의 원본은 [06 §7 Baseline](docs/contract/layout.md#7-application-shell)과 [07 §4](docs/design/app-shell.md)다. 이 문서는 아래 시각 보완만 소유하며 구조 값을 다시 정의하지 않는다.

- B안 Context 바는 적용 배지를 생략하고 참조/미지원 capability만 배지로 표시한다. control 표면은 유지한다. 넘침 버튼은 숨은 조건을 대신하는 Context 칩이라 이웃 칩과 같은 칩 모양(플랫폼 확장, `packages/sdk/shell/src/context/contextChip.ts`)을 쓰며 숨은 조건 수와 적용 수를 표시하고, 축약된 기간·아이콘 동작은 전체 접근 이름과 title을 제공한다(06 §7, ADR-0015).
- 상세 슬롯은 공유 `surface-detail` 표면과 왼쪽 1px `border-subtle` 구분선으로 본문과 나눈다. 셸 전체 높이를 쓰고 그림자·scrim은 없다. 내부 상세 탭 내용은 독립 스크롤하며 폭은 06 §7 Baseline을 소비한다(ADR-0013).
- 분석 레이아웃은 KPI 띠 위에 보조 글꼴의 얇은 제목·접기 머리 줄을 두며, “접힌 항목” 줄과 작은 보조 칩은 펼쳐진 카드보다 낮은 시각 위계를 쓴다(ADR-0022).
- 드릴다운 경로 바(`DrillPath`)는 본문 맨 위의 `text-xs` 칩 줄이다. 앞 단계 칩은 `text-secondary`에 hover 때 `surface-sunken`, 현재 단계 칩만 `accent-primary-soft` 바탕에 `font-medium`이고, 칩 사이는 `text-muted` ChevronRight 아이콘이다. 형제 바꾸기 ▾와 행 끝 들어가기 버튼은 24px 아이콘 버튼이다. 메뉴 위치 breadcrumb·복귀 버튼(secondary `sm`)과 모양을 섞지 않는다(06 §12.7, ADR-0025).
- 관리 화면에는 필터 레일이 없다. 필터는 표 위 필터 줄의 칩과 열 머리 편집기로 두고, 빠른 검색은 표 툴바 줄에 둔다([ADR-0105](docs/adr/0105-one-table-filter-model.md), ADR-0022 보충).
- 공유 `surface-sidebar` 위에 Registry 그룹을 **section label**로 표시한다. 활성 탐색 제목에 `text-disabled`를 쓰지 않는다. 주 메뉴 navigation과 즐겨찾기/최근 section을 구별한다.
- 현재 메뉴/공간은 공유 selected 표면 + text weight + **2px accent 막대**로 구별한다. `aria-current`를 유지하고 hover가 막대를 지우지 않는다. 보조 즐겨찾기/최근 링크에 현재 위치 표식을 중복하지 않는다.
- 탭 선택은 2px `accent-primary` 아래 막대 + `font-semibold`, 비선택은 `text-secondary`, 목록 기준선은 1px `border-subtle`로 표시한다(ADR-0023 개정, #340). `overflow="menu"`의 `더보기` 버튼도 숨은 탭이 선택됐을 때 같은 막대와 `font-semibold`를 쓴다(#1190).
- hover는 공유 row-hover, focus는 opaque 2px outline과 offset을 사용한다. hover/selected 안의 작은 필수 글자(‘예정’, Scope 상태·room, 언어)는 secondary 또는 허용 label로 유지한다.
- 접으면 사이드바 전체가 사라지고 레일만 남는다(06 §7). Scope 선택·검증 상태는 페이지 제목 줄의 Scope 칩이 늘 보인다. 칩의 Tooltip과 accessible description은 이름·상태·room을 보존하고 live announcement는 상태 문자열만 전달한다.
- 펼친 사이드바는 즐겨찾기·최근 section과 빈 안내를 유지한다. 빈 안내는 가짜 링크가 아니다.
- 한 줄 50px 머리는 머리 컨테이너 폭(뷰포트 아님)이 줄면 이 순서로 양보한다. 설명이 먼저 접혀 제목 옆 정보 아이콘의 툴팁으로 남고, 다음은 Data Trust 요약이 아이콘·축약(이름은 tooltip·aria)으로, 그다음 잠정 배지다. 제목은 말줄임하되 최소 폭을 지켜 0이 되지 않고, 전체 이름은 제목 툴팁과 `title`로 남는다. 주 동작은 줄지 않는다. 보조 동작은 있으면 ⋯ 메뉴에 두며 없으면 ⋯도 없다. 다시 넓어지면 설명·요약·배지만 돌아오고 보조 동작은 메뉴에 남는다. 접힌 단계는 경계보다 넓은 폭에서 되돌려 진동하지 않게 한다. 줄바꿈은 쓰지 않는다. 모든 양보 뒤에도 들어가지 않을 때(예: 1024px + 펼친 사이드바 + 상세 패널)만 머리가 가로로 스크롤된다. 주 동작은 Tab 포커스나 스크롤로 닿으며, 포커스한 컨트롤은 머리의 보이는 범위로 스크롤된다. 시각 스크롤바는 감추지 않는다. 정상 폭(1280px 이상 + 상세 패널)에서는 스크롤이 생기지 않는다. 제목·즐겨찾기는 스크롤 위치에 따라 보이는 영역을 벗어날 수 있다([ADR-0035](docs/adr/0035-page-header-yield-order.md)).
- 언어 동작의 접근성 이름은 현재 언어와 다음 전환 목적을 함께 전달한다. 번역 범위와 Context 보존은 06 §23을 따른다.

## Layout and analysis composition

정보 밀도는 장식 여백보다 우선한다. 정확한 비교는 표, 변화·분포는 차트, 요약은 KPI로 나눈다. 카드마다 동일한 시각 강도를 주는 card soup를 피하고 공유 surface/border로 계층을 만든다. 공유 반경·primitive 모양은 공유 원본을 따르며 버튼·input을 독자적으로 재설계하지 않는다. 크기도 공유 variant로 고른다 — 작은 동작 버튼 `size="toolbar"`, 아이콘 버튼 `icon-xs`/`icon-sm`, 그 밖 `sm`; 켜고 끄는 도구 버튼(`aria-pressed`)은 `variant="toggle"`로 켜진 상태를 선택 면·선택 테두리로 표시한다(#2720); 팝오버·드롭다운·툴팁은 공유 표면, segmented 선택은 공유 segmented `RadioGroup`([ADR-0023](docs/adr/0023-feedbackops-primitive-shapes-and-sizes.md)). 공유에 없는 모양은 아래 접근성 예외를 제외하면 플랫폼에서 덮어쓰지 않고 공유 variant로 제안한다. 예외는 접근성 하한 넷 — 입력·select·체크박스 경계의 `border-control`, `aria-disabled` 버튼의 비활성 모양, 메뉴 항목 키보드 포커스 링, `@ap/ui`가 정의하는 탭 선택 표식(ADR-0023 개정) — 뿐이다. 소비자는 primitive 모양을 덮어쓰지 않는다. 카드 그림자를 겹치지 않고, floating surface의 공유 처리는 06 §23을 따른다.

### 표면 위계·선택 표시 — Decided (#2456)

페이지 제목은 `t-section-title`로 표시해 50px 헤더 안에서 위계를 구분한다. 최상위 카드와 분석 패널은 `elevation-panel`(`shadow-sm`)로 캔버스와 분리하며, 카드·상세 표면(`surface-card`·`surface-detail`)이나 도킹 패널 안에서는 그림자를 겹치지 않는다. 목록 선택은 selected surface와 2px `border-selected` 막대(`RowSelectionBar`)를 함께 써서 색과 형태로 현재 행을 표시한다. 캔버스 띠는 카드 밖에서 캔버스 표면 위에 놓인 가로 컨트롤 줄(조회·Context 막대, 도구줄)이다. 띠 소유자가 자기 요소에 `data-canvas-band`를 단다(셸의 Context·조회 막대, 페이지·보드 머리, 목록 도구줄, 리치 에디터 도구줄, 화면이 직접 그린 도구줄: 설문 빌더·결과 머리, 모델 프로필 섹션 이동). 카드 안 캔버스색 우물, sticky 아래 줄, 페이지 셸처럼 띠가 아닌 캔버스색 영역은 표식이 없어 그 안 컨트롤이 제 면을 유지한다. 캔버스 띠 위의 컨트롤은 `on-canvas-band:` variant로 띠의 표면색을 따른다. 도킹 패널 사이 간격은 캔버스 표면색을 쓴다.

### 표면·선·그림자 v3 — Decided (#2722)

캔버스 `#eceff3`, 크롬(사이드바·레일·캔버스 띠) 흰색 `surface-band`·`surface-sidebar`, 크롬과 캔버스가 만나는 선 `border-chrome` `#e3e7ec`(페이지 sticky 머리 아래 포함). 최상위 카드와 도킹 그룹은 `elevation-panel`이 `border-card` `#dce1e7`·`radius-card` 10px·두 겹 `shadow-sm`을 주고, 카드 안 보조 면은 `surface-sunken` `#f6f8fa`다(`elevation-panel`·도킹 그룹이 `surface-sunken`을 `surface-sunken-in-card`로 바꾼다). 카드 안 선 `border-subtle` `#e5eaf0`, 표 행 선 `border-row` `#eef1f5`, 열린 상세 서랍과 팝오버는 L3 `shadow-xl`/`shadow-md`, 그 표면은 흰색이다. `text-muted` `#5b6678`은 캔버스에서 5.03:1. 입력 경계 `border-control`은 3:1 하한 때문에 프로토타입의 `#cbd5e1`(1.48:1) 대신 기존 값을 유지한다.

**강조색 테마 (#2723).** 기본은 파랑이다. 루트에 `data-theme="violet"`을 달면 강조색 계열(`accent-primary`·hover·soft, 선택 행·선택 경계·focus)만 `#635bce`로 바뀌고 표면·상태·차트 계열 색은 그대로다. 정의는 `@ap/ui/styles/themes.css`. 캔버스에 토큰 색을 직접 그리는 부품은 `useThemeRevision()`(`@ap/ui/theme`)을 다시 그리는 의존성에 넣는다.

### Compact analysis — Decided (#1141)

Opt-in page density and embedded chart/table chrome follow [06 §12](docs/contract/layout.md#12-canonical-page-archetypes). Every page defaults to compact density; developers can declare `density="comfortable"` explicitly (owner 2026-11-01, #1217). This changes spacing only: table rows, fonts, controls and page headers keep their existing sizes. Gentle bar emphasis follows [06 §16](docs/contract/chart.md#16-analysis-chart-contract); native center/edge Dock previews follow [analysis board §4](docs/design/analysis-board.md#4-화면-구조-decided). [ADR-0103](docs/adr/0103-compact-analysis-and-snap-dock.md) records the composition boundary. Embedded chrome (no border/radius/outer padding) follows the container — panel or board pane — at any density, so a panel or pane shows one border ([#1166](docs/adr/0103-compact-analysis-and-snap-dock.md)). The page-level rows above the content (context extension, return row) use the same 16px inset as the content. In compact: the collapsed QueryBar row insets 16px so `조회 조건` lines up with the content's left edge (comfortable 12px); `StatCard` uses 12px inner padding and an 8px icon–body gap (comfortable 16px/12px; number sizes unchanged); sibling panels on a page are 12px apart; the same-context `갱신 중` label of a query view sits inside the view's top-right corner on a compact page (above the view it would fall in the previous panel). A table's status line shows the data-trust summary as one line (dot + short status + `자세히`, full items in the popover) only when the full line does not fit its own container (the space left after the result count and refreshing label; a hidden probe of the full line is measured, whatever is shown), and a mixed-version signal stays on the warning dot and the accessible name; a right- or left-pinned column keeps an opaque surface and a 20px fade on its inner edge while the row area overflows and is not scrolled to that end, so a half-clipped column does not read as cut text.

### Dashboard composition and focal point

플랫폼 Overview/Analysis Workspace의 시각 패턴은 [06 §12](docs/contract/layout.md#12-canonical-page-archetypes)를 소비한다. 요약 → 주요 분석 → 예외 → 상세 근거로 읽을 수 있어야 한다. KPI는 5–6개 이하로 제한하고 모든 tile을 hero 크기로 만들지 않는다. 주요 과제 하나에 넓이·순서·제목의 우선순위를 준다.

산업 로그 분석 reference는 5개 KPI → pipeline 왼쪽/operations 오른쪽(약 64/36) → lifecycle 왼쪽/quality 오른쪽(약 47/53) → 전체 폭 equipment table의 구성이었다. quality는 **3개 ring + 1개 bar**이며 네 번째 donut을 만들지 않는다. pipeline-status가 첫 주요 행의 넓은 focal region이라는 판단은 **Candidate**다. 실제 사용자 과제가 예외 처리를 우선하면 재검토한다. 모든 메뉴의 필수 배치가 아니다.

넓은 화면은 비교 패널을 나란히 두고 좁은 desktop은 column 수를 줄이거나 보조 패널을 접근 가능한 drawer로 옮긴다(06 §25 Candidate). pipeline 순서는 유지하고 필요하면 영역 안에서 가로 스크롤한다. 표 글자를 줄여 맞추지 않는다. 지원·캡처 범위는 루트 [AGENTS.md의 Desktop capture scope](AGENTS.md#verification)를 따른다.

### KPI tiles and supporting copy

- icon·label·값·단위·기준이 있는 delta·보조 caption으로 구성한다. 한 tile에 무관한 두 primary 값을 쌓지 않는다.
- `StatCard`의 icon chip은 `blue`(`icon-blue-soft`)·`teal`(`icon-teal-soft`) 두 가지이며 연결된 현재 지표의 차트 색과 맞춘다. `purple`·`amber`는 deprecated 값으로 한 릴리스 동안 각각 `teal`·`blue`와 같은 클래스로 표시한다. 메뉴는 다음 SDK minor 전에 이전한다.
- primary 값은 `t-stat`, 보조 값은 `t-stat-2`; 숫자는 tabular, 단위는 덜 강조하되 읽을 수 있게 한다. delta는 비교 기간·분모를 함께 설명하고 증가 자체를 성공으로 판단하지 않는다.
- 값 → 원천 표/상세로 추적할 수 있어야 한다. 갱신 시각·coverage·정의 버전은 DataTrust 계약과 함께 표시한다. unknown을 0 또는 0%로 만들지 않는다.
- 보조 문구는 현재 조건과 다음 행동을 짧게 설명한다. sunken/hover/selected의 필수 문구는 secondary, 의미 문구는 공유 `text-text-*-label` 쌍을 사용한다. screenshot의 Live 표시는 실제 feed의 근거가 있을 때만 쓴다.

## Charts

[차트 고르기](docs/contract/chart.md#차트-고르기)

[06 §16](docs/contract/chart.md#16-analysis-chart-contract)과 [§26](docs/contract/platform-ui-contract.md#26-accessibility-baseline)의 Chart Frame/interaction 계약을 따른다. 모든 차트에는 **title, unit, textual summary, 동일 데이터 table 접근 경로**가 있다. legend는 이름+선 모양/기호+색을 제공한다. Tooltip은 hover와 keyboard focus에 대응하고 label/value/unit을 포함한다. passive mark에 가짜 pressed 동작을 넣지 않는다.

기본 범주 색 순서는 `chart-series-1` → `chart-series-2` → `chart-series-3` → `chart-series-4` → `chart-series-5`다. 다섯 번째 자동색은 도넛에 적용한다. 기존 `chart-blue` / `chart-teal` / `chart-green`도 계속 유효하다(`chart-purple`은 sdk-v0.48.0에서 제거, `chart-series-3`을 쓴다). series fill 정체성은 `chart-*`, 범주 구분은 `cat-*`, 상태 판정은 별도 label vocabulary로 표현한다. `chart-status-*`는 실제 판정일 때만 쓴다. 얇은 line/outline mark는 `chart-*-stroke` 별칭을 쓰고 legend도 같은 stroke 색을 사용한다. 이전 기간의 `cat-amber` 선·외곽선 마크는 `cat-amber-stroke` 별칭을 쓴다. stroke 별칭은 EChart의 JS 매핑(`EChart.tsx` `strokeAliases`)으로만 쓰며 Tailwind 유틸리티가 아니다. 기준선은 `text-secondary` 점선과 label을 쓰고 null은 빗금으로 구분한다. 막대와 영역, series symbol, 선택/annotation fill은 기존 fill token을 유지한다. P50 solid / P95 dashed처럼 색 이외의 구별을 유지한다. 선택/brush/drill-down이 전역 Context를 바꾸는지는 명시적으로 구분하고 단순 chart click으로 조용히 조건을 바꾸지 않는다.

reference quality recipe는 coverage→blue, traceability→teal, consistency→green, missing/untraced→이름 있는 remainder, inconsistent→cat-amber다. 분자·분모를 detail/table에서 제공하며 donut/gauge의 기본 허용 범위는 [06 §24](docs/contract/platform-ui-contract.md#decorative-visualization)를 따른다. defect bar는 zero baseline·정수 ticks·날짜·단위를 갖고 max는 데이터로 산정한다. queue/progress는 완료율과 성공률을 분리하고 분모 없는 회색 remainder를 만들어내지 않는다. pipeline/queue/lifecycle의 도메인 의미는 Consumer 후보이며 반복 확인 전 범용 플랫폼 컴포넌트로 승격하지 않는다.

## Tables

- 열 묶음 편집은 «컬럼» 팝오버 안의 별도 선택 화면에서 한다. 선택 체크박스는 «열 이름 선택», 숨은 열은 «숨김»으로 구별하고 이동·핀·보이기 컨트롤은 함께 놓지 않는다. 일반 목록의 묶음 행은 기존 컨트롤 옆 `icon-xs` 메뉴 하나로 편집하며, footer는 «묶음 만들기» 다음 «기본값으로»다([ADR-0167](docs/adr/0167-editable-column-groups.md)).

- 열 묶음 헤더는 sunken 헤더 띠 안에서 문구만 표시한다. 열 헤더와 같은 글자 역할이며 묶음 span 아래에 `border-subtle` 선을 둔다. 맨 위 묶음이 시작하고 끝나는 자리에는 헤더부터 본문 끝까지(행 그룹 행 포함) 1px `border-control` 경계선을 둔다 — 오른쪽 고정 동작 열 경계와 같은 선이고, `border-strong`은 행 구분선(`border-subtle`)과 거의 같아 묶음이 갈려 보이지 않는다. 묶음을 선언한 표에만 있다. 이름은 자기 span 안에서 왼쪽을 따라오고 말줄임·`title`을 제공한다. 새 토큰은 없다([ADR-0166](docs/adr/0166-table-column-groups.md)).
- 열 구분선은 선택 옵션 `columnDividers`다: 열 헤더 줄과 본문의 열 사이에 1px `border-subtle`(기본은 행 구분선만). 묶음 경계 자리는 묶음 경계선이 이긴다.
- 폭을 선언한 열 묶음의 묶음 넘김 경계는 기존 pinned-column fade와 같은 gradient pseudo-element를 안쪽 가장자리에 쓴다(그림자 없음). 헤더·본문·행 그룹 행의 배경과 hover·선택·활성 배경을 따른다. 숨은 내용이 있을 때만 `grab`, 끄는 동안 `grabbing` 커서와 기존 visible focus ring을 쓴다.

플랫폼 table 동작은 [06 §15](docs/contract/components.md#15-platform-data-table-contract)가 소유한다. 이 문서의 `components.table-density`가 기본 시각 밀도의 원본이다:

```yaml
rowMinHeight: 32px
headerMinHeight: 32px
cellPadding: 4px 16px
```

줄바꿈·font fallback·visible focus·최소 24px desktop target에 따라 행은 커질 수 있다. 행 영역 높이는 내용만큼이고 페이지에 남은 높이(최소 240px)까지만 커진다. 동작 열은 오른쪽에 고정하고 `toolbar`(32px) 버튼을 쓰며, 선택 열은 선택을 쓰는 기능이 있는 표에만 둔다([ADR-0037](docs/adr/0037-table-filter-consistency.md)). screenshot의 compact 밀도는 기본값을 낮추는 근거가 아니다. 표 셀은 이미 coarse pointer에서 44px target(`pointer-coarse:min-h-11`)을 쓰며, 나머지 화면의 44px target은 MVP 이후 정책이다.

표가 컨테이너보다 좁으면 남는 폭을 사용자가 폭을 바꾸지 않은 일반 열에 기본 폭 비율로 나눠 컨테이너를 채운다(선택·동작 열, 왼쪽 고정 열, 사용자가 조절한 열은 그대로). 컨테이너보다 넓으면 가로로 스크롤한다. 오른쪽 고정 동작 열은 `border-control` 색 왼쪽 선으로 가장자리를 보이고(그림자 없음), 헤더 글자는 줄바꿈하지 않고 한 줄에서 말줄임(…)하며 전체 이름은 `title`로 준다(정렬·크기 조절 표시는 그대로 보인다). 셀·헤더 좌우 여백은 16px다. 본문 셀은 기존대로 어디서나 줄바꿈한다(#1166).

- 헤더 sunken + secondary, 데이터 primary, 수치 우측 정렬+tabular, ID mono. 상태와 범주 label을 구별한다. 열 제목 case는 Typography roles를 따른다.
- row divider는 border-subtle; checkbox·검색·filter 경계는 border-control. hover에서 focus와 selected checkbox/표식이 사라지지 않는다.
- 열 너비는 머리 오른쪽 끝을 끌어서만 바꾼다 — 늘 보이는 1px `border-subtle` 구분선, hover·끄는 동안 `accent-primary`, 더블클릭은 기본 너비. "컬럼" 팝오버는 보이기 체크박스와 줄 끝 핀 토글, 고정 묶음을 위에, 맨 아래 "기본값으로"([ADR-0024](docs/adr/0024-table-column-controls-drag-width-pin-in-list.md)).
- 표 toolbar는 한 줄이고 컨트롤은 모두 32px다(`Button size="toolbar"`, `@ap/ui` `Input inputSize="toolbar"` — 32px, `surface-sunken`, 13px). 왼쪽은 제목(설명은 ⓘ 툴팁)과 검색, 화면 키, 필터 줄이고 오른쪽은 결과 건수·신뢰와 그룹·표 크기·컬럼·복사·내보내기이며 ▾는 메뉴 버튼에만 둔다. 이 한 줄이 폭에 안 맞을 때만 필터·결과 줄을 아래 줄로 내린다(작업공간 패널 표는 늘 두 줄, 06 §15). 폭이 부족하면 `복사 → 그룹 → 표 크기 → 컬럼 → 내보내기` 순으로 `⋯` 메뉴에 들어간다(06 §15, 노드 1217c·1217d). 표 크기(작게·보통·크게)는 본문 글자와 행 높이를 함께 바꾸는, 맥락 기본값에 대한 상대 단계이고 보통은 지금 모습 그대로다(작게 12px·28px, 크게 15px·40px, 머리글 11/12/14px). 체크박스는 어느 크기에서나 14×14다. 그 밖의 toolbar는 제목/설명과 검색·filter·동작을 분리해 정렬하고 폭이 부족하면 wrap한다. 가로 overflow는 표 영역에 가두고 toolbar 접근을 유지한다.
- selection은 대상·선택 수·clear를 보여 준다. 현재 page 선택과 전체 결과 선택을 혼동하지 않는다. Context/Scope 변경 시 selection을 해제한다. nested 버튼이 있는 행을 통째 clickable wrapper로 만들지 않는다.
- sort는 `aria-sort`, bulk action은 권한·대상이 명확해야 한다. copy/export 동작·고정 toolbar는 [ADR-0008](docs/adr/0008-table-owned-export-fixed-toolbar.md)의 현재 계약을 따른다. 이 문서가 새로운 backend 작업을 추가하지 않는다.
- copy Tooltip과 표 column menu도 공유 floating 표면(그림자 포함)을 쓴다([ADR-0023](docs/adr/0023-feedbackops-primitive-shapes-and-sizes.md)). 표에 따로 둔 border-only 처리는 없다.

## Status & Badges

[SeverityIndicator 사용 규칙](docs/contract/components.md#ui-primitive)

`StatusBadge` vocabulary는 **success / warning / danger / neutral / info**다. 실제 데이터 판정은 [06 §19](docs/contract/components.md#19-loading--empty--error-taxonomy)의 원천·관측 시각에 근거한다. success는 확인된 긍정, warning은 확인된 주의, danger는 확인된 실패, neutral은 미평가/보조, info는 정보 전달의 시각 역할이다. unknown·permission 제한·미수집을 화면 임의로 success/failure로 바꾸지 않는다.

작은 badge text는 공유 `text-text-*-label`, neutral은 secondary이며 soft fill/dot은 별도 vivid accent를 쓴다. text+icon/shape로 의미를 함께 전달한다. 평범한 label에 새 상태 색을 만들지 않는다. 범주/제품 milestone label은 성공 판정과 다르다. 새로운 Tone은 플랫폼 디자인 결정으로 다룬다.

`Badge`의 `secondary`는 `bg-surface-sunken` 바탕과 `border-border-subtle` 테두리를 쓴다. Hover는 `hover:bg-surface-sunken/80`으로 표시한다.

`SeverityIndicator` 미지정 표시는 막대 폭에 맞춘 `min-w-4` 안에 가운데 정렬한 줄표(—)다. `text-sm`, `leading-tight`, `text-text-secondary`를 쓴다.

## Reference component bindings

기존 time-control 소비자 링크를 유지하기 위한 절이다. reference recipe는 동작 원본을 재정의하지 않는다.

### Filter bar

Apply-mode QueryBar follows the delegated #553 B groups with C collapsed summary ([06 §11](docs/contract/kernel.md#11-global-context-bar)). Main editors wrap whole semantic groups; controls and actions remain reachable. Board keeps its 48px row and uses an anchored, viewport-bounded scrolling editor. Full draft/applied values remain accessible beyond the compact summary. The result strip belongs below the normal header, or inside pane content without a duplicate title/header. PageFilterBar draft presentation has no second Apply. Live-mode overflow and immediate behavior below remain unchanged.

전역 기간은 Context bar의 동일한 control 하나다. page-owned 검색·stage/status filter는 content toolbar에 두고 전역 Context를 보존한다. 적용된 조건은 보이며 persistent accessible label을 제공한다. page-owned toolbar는 폭이 부족하면 wrap하고 active filter를 숨기지 않는다. 전역 Context 바는 [06 §7](docs/contract/layout.md#7-application-shell)의 우선순위 넘침을 소비하며 한 줄을 유지한다. 입력/검색 문구가 sunken이면 secondary를 사용한다.

#54의 PageFilterBar B안은 card 표면과 `border-subtle` 경계를 쓰며, 보이는 label을 각 control 위에 둔다. 필드는 한 행에서 시작해 폭이 부족하면 모두 보이도록 줄바꿈한다. `@ap/ui` Input과 Select는 공유 기본 표면·문구·크기(40px)를 쓰고 높이를 덮어쓰지 않으며 경계만 `border-control`로 둔다(접근성 예외, [ADR-0023](docs/adr/0023-feedbackops-primitive-shapes-and-sizes.md), [ADR-0037](docs/adr/0037-table-filter-consistency.md)). 검색 필드의 아이콘 자리 왼쪽 여백은 이유를 단 예외로 둔다(공유와 같은 처리). Search 아이콘은 검색 필드에만 두며 정확 일치 텍스트와 시각 입력에는 붙이지 않는다. 초기화·적용은 소비 화면이 actions 슬롯에 제공한다. 관리 화면의 `적용`은 바뀐 필드 수를 `적용 (n)`으로 보이고 변경이 없으면 꺼지며, 접힌 필터 버튼은 미적용 변경을 `미적용 n` 글로 표시한다.

접기(ADR-0029)는 opt-in이며, 접힌 줄은 chevron·`필터`·필드명/값 요약을 담은 secondary 버튼 하나와 오른쪽 독립 초기화다. 요약은 한 줄이 기본이지만 폭이 부족하면 `필드명 값` 항목 단위로 줄바꿈하되 요약은 왼쪽 정렬을 유지하고 구분점 `·`은 다음 항목 앞이 아니라 앞 항목 끝에 붙이며, 긴 값은 단어 내부에서라도 줄바꿈한다 — 말줄임·`+n`·title 전용 치환으로 조건을 숨기지 않는다. 펼친 입력 줄 끝의 `⌃ 접기`는 그 줄 actions 버튼과 같은 크기·variant를 쓰며, 미적용 변경이 있으면 요약 끝에 `미적용 변경 있음`을 함께 보인다.

Live 기간 preset은 `1일 / 7일 / 사용자 지정`; Apply 조회 바의 달력·기간 preset은 06 §6.3을 따른다. rolling wall-clock Δ와 `[from,to)` 물질화는 [06 시간 계약](docs/contract/kernel.md#ctx-time)을 따른다. screenshot의 기간 preset을 제품 의미로 복사하지 않는다. segment는 이름 있는 single-select/radio+selected 표식, custom picker는 Apply 때 반영하고 Cancel/Escape는 기존 구간을 보존한다. 현재 적용 구간과 draft를 구별하고 browser now로 기본값을 새로 만들지 않는다. 최초 기본 Δ·shift/business-day는 원본의 Open 상태를 따른다.

### Page condition layer — Candidate (#2339)

선언형 페이지 조건은 기존 요약 자리에 범주당 칩 하나(`라벨: 값`)를 두고 항목 단위로 줄바꿈한다. 생략·`+n`·말줄임을 쓰지 않는다. 칩의 ×와 「모두 지우기」를 구별한다. 본문 시작 가장자리의 레이어는 `--page-condition-layer-width: 360px`(공유 layout 값 파일 `tokens.css`)이며 좁은 보드 칸에서는 칸 폭 이하로 제한한다. `surface-card`·`border-subtle`·공유 `shadow-xl`로 콘텐츠 위의 떠 있는 표면을 표시하고 scrim은 두지 않는다. 제목/읽기 전용 Context 요약과 footer는 고정하고 범주 편집기 안에 스크롤 하나를 둔다. 포커스 링·명시적 닫기·비활성 사유는 기존 primitive를 따른다. 배치/쌓임과 키보드 규칙의 원본은 [Layout §8](docs/contract/layout.md#8-shell-slots)·[Components §13](docs/contract/components.md#13-shared-component-layers)이다. 소유자가 캡처로 확인하기 전 Candidate다.

### Other reference recipes

stat/pipeline icon은 compact soft chip, navigation 그룹 icon은 unboxed outline을 사용한다. outline family는 Lucide 결정이며 icon-only 동작에 이름을 붙이고 장식 icon은 숨긴다. scheduler recipe는 queue+processing-window 두 보조 영역과 전체 폭 alert list다. alert는 icon/message/time/action을 읽을 수 있게 배치하며 장식 full-row tint로 모든 항목을 강조하지 않는다. queue total/running/pending/remainder의 일관된 분모와 processing-window의 원천 시각이 필요하다. lifecycle complete/pending/unknown은 checked/hollow/label을 병행하며 제품 milestone의 의미는 도메인 소유다. 실제 profile/bulk action inventory는 계정 capability를 따르고 screenshot에서 발명하지 않는다.

## Shared interaction and data states

primitive 상태·keyboard 동작의 원본은 `@ap/ui`(ADR-0046)이고, [공유 UI 계약](packages/feature/screens/docs/ui-design-system.md)은 이전 시점의 참고 문서다. 플랫폼 조합에서는 아래 역할을 연결한다.

| Family | Hover / pressed / selected | Focus / disabled / busy |
| --- | --- | --- |
| Button·toolbar·icon trigger | 공유 neutral hover/pressed, primary는 primary-hover; open trigger의 상태 표시 | opaque focus, 실제 disabled와 이유, busy width+spinner/label 유지·중복 제출 방지 |
| Navigation | 공유 hover/selected + 현재 위치 막대/weight | 이름·aria-current·focus 유지; 권한 visibility는 Registry 소유 |
| Range·checkbox | 공유 hover + radio/checked/mixed shape | native semantics·focus 유지 |
| Search/filter | border-control, 입력 secondary/primary; error label+aria-invalid | read-only/disabled 구별, refresh 때 draft 보존 |
| Menu | hover/keyboard highlight + 선택 check | primitive managed focus·Escape·trigger 복귀 |
| Table | hover + selected checkbox/shape | focus-within이 cell을 가리지 않음; busy도 헤더 유지 |
| Chart·linked KPI | series/outline 강조; 의미 색 바꾸지 않음 | actionable mark만 focus/drill-down; 동일 tooltip/table 접근 |

첫 load는 reserved geometry와 region `aria-busy`를 유지하며 fabricated 값을 만들지 않는다. 공유 Skeleton의 기본 fill은 공유 UI 계약이 소유하며, 플랫폼 호출부(PlatformDataTable·StateView·EChart lazy)는 크기만 지정하고 fill을 덮어쓰지 않는다(ADR-0023). 동일 Context refresh는 값+Refreshing을 유지할 수 있다. Context/Scope가 바뀌면 이전 결과를 새 결과처럼 표시하지 않고 권한을 재검증한다(06 §11). 부분 실패는 해당 widget에 국한하고 정상 panel을 유지한다.

Empty/error는 원인 설명·허용된 다음 행동·추적 번호를 읽을 수 있게 표시한다. [06 §19](docs/contract/components.md#19-loading--empty--error-taxonomy)의 no-match/not-collected/delayed/coverage/forbidden/too-large/unknown을 하나로 합치지 않는다. 조회 0건에서 수집/파서 지연을 추론하지 않는다. 실제 비활성·busy도 필요한 이유를 opacity로 숨기지 않는다.

[EmptyState 사용 규칙](docs/contract/components.md#ui-primitive)

`live-dot`은 기본 static이다. pulse는 **Candidate**로 실제 live freshness source가 확인될 때만 허용하며 label/layout을 움직이지 않는다. reduced-motion에서는 animation을 끄고 freshness가 사라지면 Updated/Data through/Unknown으로 전환한다. Live는 completeness의 증거가 아니다. optional breadcrumb는 nested page의 ancestor link와 current page를 구별하고 Context를 보존한다.

### Shared outcome banner and compact widget state

[06 §19](docs/contract/components.md#19-loading--empty--error-taxonomy)의 A안(#2535). 원인과 복구 값이 같은 위젯이 두 개 이상이면 본문 상단에 띠 하나를 둔다. 집계 불가·오류·시간 초과는 danger-soft와 danger-label, 권한 없음·조회 한도는 warn-soft와 warning-label, 0건은 sunken과 control border를 쓴다. 원인과 허용된 복구 동작을 띠에 두며 원인을 해소하는 동작 하나까지 강조한다. 긴 문구는 한 줄로 줄일 수 있고 「자세히」에서 전체 문구와 소속 위젯 이름을 볼 수 있다. 그룹 상태는 scope의 기존 live 채널에서 한 번 안내한다.

그룹 위젯은 sunken 표면에 이름, 안내 한 줄(문구는 [06 §19](docs/contract/components.md#19-loading--empty--error-taxonomy)), 접힌 「기술 정보」를 표시하며 `aria-describedby`로 띠와 연결한다. 기술 정보에서 위젯별 추적 번호와 서버 원문을 읽을 수 있다. 안내는 secondary 글자를 쓰고 opacity로 흐리게 하지 않는다. 위젯이 하나면 인라인 카드를 쓴다. 오류 카드(`StateMessage tone="danger"`)는 danger-soft 배경과 danger-label 경계선·제목, danger 아이콘, secondary 본문·추적 번호를 쓴다.

마운트된 페이지의 렌더 오류는 머리와 기간·대상을 보존하고 본문과 같은 여백에 오류 카드를 둔다. 추적 번호·다시 시도·홈을 제공하며, 사용 가능한 VOC 목적지가 있을 때 「이 오류 신고」를 제공한다. 예정 메뉴는 공통 `Panel` 한 곳에서 준비 중인 메뉴 이름과 현재 열 수 있는 화면 링크를 보여 준다.

## Do's and Don'ts

| Do | Don't |
| --- | --- |
| 공유 semantic token/primitive를 `@ap/ui`로 소비 | 공유 palette·본문·반경을 이 문서나 메뉴에 다시 정의 |
| primary 강조를 주요 동작·위치·focus에 집중 | 범주 palette로 두 번째 brand CTA 제작 |
| 필수 sunken 문구 secondary, 의미 문구 공유 `text-text-*-label` | muted-on-sunken을 4.5:1로 반올림하거나 opacity로 fade |
| control 경계 border-control, 구조선 border-subtle | 모든 divider를 진하게 하거나 input 경계를 hairline만으로 식별 |
| 색+shape/weight/text로 선택·상태 표시 | 색만으로 현재 위치·성공·실패 전달 |
| KPI→차트→동일 데이터 표/근거로 추적 | unknown을 0으로 만들거나 screenshot 숫자·Live를 제품 사실로 사용 |
| 공유 표면/반경·일관된 numeric alignment | 카드마다 그림자 스택·pill 버튼·hero KPI 추가 |
| 플랫폼 공통 계약 우선, 반복된 Consumer 패턴만 승격 | 메뉴 화면을 목적으로 연속 제작하거나 도메인 queue/lifecycle을 조기 범용화 |

## Sources

| Source | 보존한 원칙·증거 | 현재 권한 / 대체된 부분 |
| --- | --- | --- |
| 공유 tokens.md / tokens.css / UI system / ADR-0058 | 제품 UI 기반·공유 typography·primitive·소비 계약 | **공유 디자인 원본**; 이전 플랫폼 공유 값/독자 font/primitive 설명을 대체 |
| ADR-0010 / ADR-0011, 승인 prototype `prototype/52-fops-design` (`.agents/reports/design/shots/52-fops/`, 원격 브랜치 `prototype/52-fops-design`의 커밋에만 있다) | 직접 소비, 프로토타입 C안의 밝은 AppFrame | **Decided**; 이전 어두운 navigation·상단 구성·shell 측정값을 대체 |
| 06 / 07 | 플랫폼 행동·상태·접근성 및 셸 구조 | **계약 원본**; reference navigation·시간·권한보다 우선 |
| #193 UIUX-193-03/04/05, #194 P3-D1·수용된 shell 수정 | label/control pairing·sunken 제한·stroke 대비·현재 위치·collapsed 규칙 | 이 문서의 pairing 및 chart 결정 배경; 렌더/동작 통과를 새로 주장하지 않음 |
| `.agents/references/design-md/`의 linear.app | 단일 강조·중립 hierarchy | 원칙만 보존; brand 값·독자 공유 token·marketing layout은 공유로 대체/미채택 |
| 같은 참고자료의 clickhouse | flat hierarchy·shadow stack 회피 | 원칙만; 독자 radius와 전역 shadow 금지는 공유 primitive/06 규칙으로 대체 |
| 같은 참고자료의 supabase | ink hierarchy·기술 도구의 절제 | 원칙만; font·surface·radius literal은 공유로 대체 |
| 같은 참고자료의 mongodb | 범주색은 series/tag에 제한 | 원칙만; dark hero·pricing·pill CTA 미채택 |
| Industrial Log Analytics screenshot, 1672×941, 기존 업로드 ID `00521d63-05d6-4f35-b771-a2b8bc1da6b7/0f3b051c-image.png` | KPI/pipeline/queue/lifecycle, 3 rings+bar, equipment table 구성의 provenance | 역사적 시각 입력; shell/폰트/색 측정값은 공유로 대체. 원본은 저장소 밖이며 이번 작업에서 재검증하지 않음 |
| interface-design / ui-ux-pro-max의 당시 review | focal region·numeric alignment·visible focus | 검토 provenance; 계약을 덮어쓰지 않음 |

posthog와 sentry(Sentry 스타일) 자료는 당시 illustration/mascot 중심 marketing 방향이라 미채택했다. 원본 raster에서 exact CSS·source font·animation·business priority를 확정하지 않는다. Reference 배치는 Consumer 후보이며 새로운 플랫폼 API나 도메인 화면 구현을 승인하지 않는다.

## Design Decisions

### Detail panel — Decided (B, 2026-10-04)

상세 패널은 셸 소유 고정 슬롯(B)으로 컨펌됐다. [ADR-0013](docs/adr/0013-detail-panel-shell-docked-slot.md)이 ADR-0011에서 남긴 별도 결정을 닫는다. 배치·동작 원본은 06 §7·§13, 표면·경계는 위 Shell visual rules를 따른다.

### Chart stroke contrast — Decided (B, 2026-10-04)

v2 팔레트에서 카드 위 thin line mark의 `chart-blue`는 **2.79:1**, `chart-teal`은 **2.98:1**이며 `chart-purple` bar는 **3.25:1**이다(#193 리뷰). 2px 선에서 blue/teal은 의미 있는 비텍스트 mark의 3:1 기준에 부족하다. solid/dashed legend와 동일 데이터 table은 series 구분/대체 경로를 제공하지만 선 자체 대비를 높이지 않는다.

| 선택지 | 효과·비용 |
| --- | --- |
| A. 현재 palette 유지 | 승인 palette/범주 identity 유지; 선 대비 부족은 남고 contrast-safe outline 또는 다른 표현의 별도 검증이 필요 |
| B. thin line mark용 더 진한 stroke alias 추가, category fill 유지 | 범주 identity·soft fill을 보존하며 line/outline 대비를 조정; 새 alias와 표면별 ≥3:1 검증 필요 |
| C. palette 자체 변경 | 모든 mark의 일관된 재조정 가능; 승인 palette·category fill·legend 소비자까지 영향과 prototype 재확인 필요 |

**B 구현 — 사용자 결정, 2026-10-04.** [ADR-0012](docs/adr/0012-chart-thin-line-stroke-aliases.md)에 따라 thin line/outline 전용 stroke alias를 추가했고 category fill·기존 palette는 유지한다. 아래 표는 v2 팔레트에서 사용자가 확인한 B2 값과 각 표면 대비다. 현행 값은 표 아래 v3 문단이 정한다.

| Stroke alias | 값 | 카드 `#ffffff` | 캔버스 `#eef2f9` | Sunken `#edf3fb` |
| --- | --- | ---: | ---: | ---: |
| `chart-blue-stroke` | `#2577cc` | 4.58:1 | 4.08:1 | 4.10:1 |
| `chart-teal-stroke` | `#008090` | 4.68:1 | 4.17:1 | 4.19:1 |
| `chart-purple-stroke` | `#8154ce` | 5.13:1 | 4.57:1 | 4.60:1 |
| `cat-amber-stroke` | `#b45309` | 5.02:1 | 4.47:1 | 4.50:1 |

**v3 팔레트(#2724)** 이후 stroke 별칭은 fill과 같은 값이며 모두 3:1을 넘는다: 카드 / 캔버스 `#eceff3` / sunken `#f8fafc` 기준 blue `#2e6bd9` 4.97 / 4.31 / 4.75, teal `#0b7f75` 4.88 / 4.23 / 4.66, 주황 `#c8690a`(`chart-series-3`·amber 자리) 3.83 / 3.32 / 3.66. 막대 안 값 label은 흰 글자 4.5:1을 넘는 blue·teal·green·magenta에 `text-on-accent`, 주황(흰 3.83:1, 진한 글자 4.63:1)과 회색 기타에 `text-primary`를 쓴다(`chartValueLabels.ts`). `chart-green` `#57822b`는 흰 글자 4.53:1을 넘도록 정한 값이다.

`AnalysisChartFrame`은 blue/teal/`chart-series-1…5`/amber 시리즈 선, 선 범례 견본, 브러시 외곽선에 해당하는 stroke 별칭을 쓴다. 막대·영역 채움과 선 위 심볼은 원래 채움 색을 유지하고, 그래서 툴팁 마커(심볼 색을 따름)도 채움 색이다. 녹색 계열의 얇은 선은 `chart-series-5`를 지정해 `chart-series-5-stroke`를 쓴다. `chart-green`은 채움 이름으로 쓴다.

### Chart legend and series encoding — Decided (B, 2026-10-04)

사용자는 #207의 실제 차트 화면 `?variant=` 프로토타입에서 B를 선택했다. [ADR-0014](docs/adr/0014-chart-legend-period-grouping.md)에 기록한다.

- Compare가 켜져 있고 현재 메뉴 manifest가 Compare를 제공할 때만 범례를 `현재 기간` / `이전 기간` 두 행으로 묶는다. 그 외에는 그룹 제목 없는 일반 범례다. 제목은 `@ap/kernel` i18n 사전을 사용한다.
- 시리즈 소비자는 `dashed`와 색을 선언한다. 현재 기간의 실선은 `'solid'`, 대시는 `[8, 4]`를 쓴다. 이전 기간의 비점선은 `[2, 2]`, 대시는 `[8, 3, 2, 3]`으로 변환한다. ECharts 선과 SVG 선 견본은 같은 dash 배열을 쓴다.
- 막대 범례는 12px 채운 사각형이며 2px 외곽선은 stroke alias를 쓴다. 이름 있는 나머지 `chart-remainder`는 `border-control`로 둘러싼다.
- `cat-amber-stroke`는 이전 기간 amber 차트 선·외곽선에만 쓰며 작은 글자에는 쓰지 않는다. P95/reference `markLine`과 라벨은 모든 경우 `text-secondary`다.
- 사이클타임 상세의 이전 P50/P95는 각각 현재 대응 시리즈의 `dashed` 선언을 따른다. 생산성 개요의 P95도 점선으로 맞추며 해당 manifest의 Compare 기능은 바꾸지 않는다.

### Round result workbench — Decided (2026-11-12)

#1809 수정 A는 결과 우선 배치다. 모델·SW/개발 건·Round와 실행/판정을 짧게 표시하고, 규칙 결과 아래에 서버가 제공한 미해결 결함을 둔다. Gate는 헤더 상태와 같은 우측 상세 슬롯으로 제공한다. 메타데이터·해시·시도 이력은 기본 숨김 탭에 둔다. 기존 표·탭·상태 배지·DetailDrawer와 토큰을 재사용한다. 상세와 URL 계약은 [Log Lifecycle §12.1](docs/design/features/log-lifecycle/README.md#121-결과-중심-round-workbench-1809)을 따른다.

## Open Decisions

### Remaining decisions and reference limits

- Dark mode는 [05 상태 추적](docs/overview/roadmap-and-open-questions.md)의 **Deferred**, 현재 light design을 단순 invert하지 않는다.
- 차트 렌더러는 ECharts Canvas로 Decided([ADR-0021](docs/adr/0021-echarts-canvas-renderer.md), 04 기술 스택·[05 결정 상태](docs/overview/roadmap-and-open-questions.md)와 같다). 이 문서가 새로운 chart theme 구현을 뜻하지 않는다.
- 언어 번역 범위는 06 §23의 **Decided**, 계정 저장 선호는 **Candidate**다. Lucide는 기존 **Decided**를 유지한다.
- pipeline focal priority·live pulse·reference queue/lifecycle의 domain 의미는 **Candidate/Open**이며 원천이 확인되기 전 실제 운영 데이터로 주장하지 않는다.

Feature-screen references: [tokens](packages/feature/screens/docs/tokens.md) (Pack 17 light, FO ADR-0021), [component behavior](packages/feature/screens/docs/ui-design-system.md), and runtime R G B triples in `@ap/ui/styles/tokens.css`. These pointers share the platform visual authority above.
