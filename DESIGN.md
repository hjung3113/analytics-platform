---
version: alpha
name: analytics-platform-design
description: >
  Platform visual extensions and data-workspace patterns on FeedbackOps.
  Shared tokens, fonts and primitives remain owned by FeedbackOps;
  shell structure and behavior remain owned by the platform UI contract.
sources:
  sharedTokens: products/feedbackops/packages/ui/src/styles/tokens.css
  sharedTypography: products/feedbackops/docs/frontend/tokens.md
  sharedPrimitives: products/feedbackops/docs/frontend/ui-design-system.md
  consumptionContract: products/feedbackops/docs/adr/0058-tailwind-v4-css-first-theme.md
  shellContract: docs/06_platform_ui_contract.md
  extensionValues: packages/ui/src/styles/tokens.css
  extensionMappings: packages/ui/src/styles/index.css
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
  cat-purple: "#7c3aed"
  cat-teal: "#0d9488"
  cat-amber: "#d97706"
  cat-amber-stroke: "#b45309"
  chart-blue: "#3b9cff"
  chart-teal: "#00a3b5"
  chart-green: "#00bc8b"
  chart-purple: "#a174f5"
  chart-remainder: "#cbd2e3"
  chart-grid: "#edf1f7"
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
  t-table-header: { fontSize: 12px, lineHeight: 1.3, fontWeight: 600, letterSpacing: 0.3px, textTransform: uppercase }
  t-badge: { fontSize: 11px, lineHeight: 1.3, fontWeight: 600, letterSpacing: 0.2px }
  t-nav-group: { fontSize: 11px, lineHeight: 1.3, fontWeight: 600, letterSpacing: 0.5px, textTransform: uppercase }
  t-mono: { fontFamily: "var(--font-mono)", fontSize: 12px, lineHeight: 1.4 }
  tabular: { fontVariantNumeric: "tabular-nums lining-nums" }
rounded:
  xs: "var(--radius-sm)"
layout:
  breakpoint-wide: 90rem
components:
  table-density:
    rowMinHeight: 32px
    headerMinHeight: 32px
    cellPadding: 4px 12px
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

이 문서는 **FeedbackOps 위에 얹는 플랫폼 디자인 확장**의 원본이다. 공유 디자인 시스템을 다시 정의하지 않는다. [ADR-0010](docs/adr/0010-feedbackops-design-system-shared-on-tailwind-v4.md)의 직접 소비 방식과 [ADR-0011](docs/adr/0011-design-direction-feedbackops-shell.md)의 승인된 프로토타입 C안을 따른다. #193의 토큰 이행과 #194의 밝은 셸 규칙을 반영한다. 이 문서 갱신은 새 프로토타입 승인이나 런타임 검증 기록이 아니다.

메뉴 화면은 Kernel·공통 컴포넌트·차트 계약·Page Archetype·메뉴간 연결을 검증하는 Consumer다. 화면마다 새 팔레트나 부품 체계를 만들지 않는다. 행동·권한·Context·상태 의미는 [06](docs/06_platform_ui_contract.md)이 우선한다.

| 소유자 | 소유하는 규칙 | 이 문서의 관계 |
| --- | --- | --- |
| FeedbackOps [tokens.md](products/feedbackops/docs/frontend/tokens.md), [tokens.css](products/feedbackops/packages/ui/src/styles/tokens.css) | 공유 색·표면·간격·반경·폰트·본문 타이포·AA 의미 label 쌍 | 값 스케일을 복제하지 않고 semantic token을 소비 |
| FeedbackOps [ui-design-system.md](products/feedbackops/docs/frontend/ui-design-system.md), [ADR-0058](products/feedbackops/docs/adr/0058-tailwind-v4-css-first-theme.md) | primitive의 모양·상태, CSS-first 소비·폰트 로딩 계약 | `@ap/ui`를 통한 공개 primitive·CSS 소비 |
| [06 §7–9](docs/06_platform_ui_contract.md#7-application-shell), [07](docs/07_app_shell_wireframe.md) | 셸 구조·치수·슬롯·navigation IA·시나리오 | 구조를 복사하지 않고 플랫폼 시각 보완만 정의 |
| DESIGN.md | 플랫폼 확장 token의 역할·값 출처, 허용 전경/표면, 분석·KPI·표·차트 시각 패턴 | 아래 정의가 원본 |
| [플랫폼 CSS](packages/ui/src/styles/tokens.css), [매핑·역할 유틸리티](packages/ui/src/styles/index.css) | 확장 구현 | 문서와 대조; 불일치는 별도 보고 |

## Platform extension layer

아래 `--*`는 CSS 변수명이다. 공유 palette 참조는 FeedbackOps 원본을 따르며, literal은 플랫폼이 소유한다. raw palette를 컴포넌트에서 직접 쓰지 않는다. `tokens.css`는 RGB triple을 사용한다. front matter의 literal은 hex, 공유 참조는 FeedbackOps CSS 변수명이다.

### Colours and surfaces

| 플랫폼 token | 역할·사용 시점 | 값 출처 |
| --- | --- | --- |
| `accent-primary` | 주요 동작·링크·현재 위치·focus 계열의 일관된 강조 | FeedbackOps `color-neon-lime` 참조 |
| `accent-primary-hover` | primary 동작 hover | 플랫폼 literal `#102080` |
| `accent-primary-soft` | 선택 요약·강조의 옅은 배경; 선택 표식 동반 | 플랫폼 literal `#e4e8f6` |
| `accent-info` / `accent-success` / `accent-warn` / `accent-danger` | 의미 dot·icon·tint; 작은 의미 글자에 쓰지 않음 | FeedbackOps `color-cyan-spark` / `color-emerald` / `color-amber` / `color-warning-red` 참조 |
| `accent-success-soft` | 긍정 의미 배경·delta/badge fill | 플랫폼 literal `#e3f5ed` |
| `accent-warn-soft` | 경고 의미 배경 | 플랫폼 literal `#f4ece0` |
| `accent-danger-soft` | 오류 의미 배경 | 플랫폼 literal `#fae5e7` |
| `accent-neutral` / `accent-neutral-soft` | 미평가·보조 상태의 dot 및 배경 | FeedbackOps `color-storm-cloud` / `color-deep-slate` 참조 |
| `border-control` | 입력·select·checkbox 등 식별에 필요한 interactive 경계 | FeedbackOps `color-storm-cloud` 참조 |
| `surface-sunken` | 표 열 머리·검색 배경·progress track·recessed 보조 영역 | FeedbackOps `color-deep-slate` 참조 |
| `cat-purple` / `cat-teal` / `cat-amber` | 범주 tag·series 구분; 성공·실패 판정이나 CTA에 쓰지 않음 | 플랫폼 literal `#7c3aed` / `#0d9488` / `#d97706` |
| `chart-blue` / `chart-teal` / `chart-green` / `chart-purple` | series 정체성; 의미 있는 얇은 선 대비는 Chart stroke 결정 참고 | 플랫폼 literal `#3b9cff` / `#00a3b5` / `#00bc8b` / `#a174f5` |
| `chart-blue-stroke` / `chart-teal-stroke` / `chart-purple-stroke` / `cat-amber-stroke` | 얇은 line/outline mark와 해당 line legend 전용; fill과 작은 글자에는 쓰지 않음 | B2 platform literal `#2577cc` / `#008090` / `#8154ce` / `#b45309` |
| `chart-remainder` | 이름과 분모가 확인된 나머지 범주 | 플랫폼 literal `#cbd2e3` |
| `chart-grid` | 보조 grid; 의미 있는 데이터 선에 쓰지 않음 | 플랫폼 literal `#edf1f7` |
| `icon-blue-soft` / `icon-teal-soft` | KPI·분석 범주 icon chip 배경; navigation 그룹에는 채운 chip을 만들지 않음 | 플랫폼 literal `#e3efff` / `#dcf8ef` |

작은 의미 label은 FeedbackOps 소유의 `--text-{success,info,warning,danger}-label` 쌍과 `text-text-{success,info,warning,danger}-label` 유틸리티를 사용한다. 플랫폼은 이를 다시 별칭으로 선언하지 않는다. `text-text-success-label` 같은 label 유틸리티는 공유 vivid 의미 색 `text-text-success`와 구별한다. 표면·경계 유틸리티는 `bg-surface-sunken`, `border-border-control`; 구조 구분선은 공유 `border-border-subtle`이다.

### Typography roles

공유 font family·본문·font loading은 [FeedbackOps 타이포 원본](products/feedbackops/docs/frontend/tokens.md#tokens--typography)과 [ADR-0058 §2](products/feedbackops/docs/adr/0058-tailwind-v4-css-first-theme.md#2-theme-inline-because-theme-namespaces-overlap-token-names)을 따른다. 라틴/한글은 공유 `--font-sans`(Inter + Pretendard), 기술 문자열은 공유 `--font-mono`를 상속한다. 플랫폼은 별도 body scale을 만들지 않는다.

아래 역할 값은 플랫폼 literal이며 [index.css](packages/ui/src/styles/index.css)의 클래스와 일치한다. line-height는 px 표기 또는 unitless 배수다. 지정하지 않은 font family·weight·tracking은 공유/상위 값을 상속한다.

| 역할 클래스 | 크기 / line-height / weight | 추가 속성 | 사용 |
| --- | --- | --- | --- |
| `t-page-title` | 24px / 32px / 600 | tracking -0.3px | 본문 수준의 큰 제목; 한 줄 셸 머리의 강제 기본값 아님 |
| `t-section-title` | 18px / 28px / 600 | — | 분석·목록 section 제목 |
| `t-card-title` | 14px / 20px / 600 | — | compact panel 제목 |
| `t-stat` | 32px / 1.1 / 600 | tracking -0.5px, tabular lining numbers | primary KPI |
| `t-stat-2` | 22px / 1.2 / 600 | tracking -0.3px, tabular lining numbers | secondary KPI·donut 값 |
| `t-delta` | 12px / 1.4 / 600 | tabular lining numbers | 기준이 있는 delta |
| `t-caption` | 12px / 16px / 상속 | — | 보조 설명·단위·출처; opacity 없이 허용 pairing 사용 |
| `t-table-header` | 12px / 1.3 / 600 | tracking 0.3px, uppercase | 기술 열 머리 역할 |
| `t-badge` | 11px / 1.3 / 600 | tracking 0.2px | 짧은 상태 label |
| `t-nav-group` | 11px / 1.3 / 600 | tracking 0.5px, uppercase | 비인터랙티브 그룹 section label |
| `t-mono` | 12px / 1.4 / 상속 | 공유 `--font-mono` | ID·기술 값·correlation ID |
| `tabular` | 크기·weight 상속 | tabular-nums lining-nums | 수치 열·분모·비교 값 |

표 header row는 승인된 프로토타입과 front matter binding대로 `t-table-header`를 사용한다(uppercase; 한국어 label은 대소문자 변환의 영향을 받지 않는다). PlatformDataTable의 sort button도 같은 uppercase 규칙을 따른다. 그룹 제목은 heading/disclosure가 아닌 section label이며 CSS uppercase가 navigation 동작을 뜻하지 않는다.

### Radius and layout extensions

| token | 역할·사용 | 값 출처 |
| --- | --- | --- |
| `radius-xs` | 작은 inline chip/아이콘 버튼의 compact 반경 alias | `index.css`의 `var(--radius-sm)` → FeedbackOps 공유 반경; 별도 literal 아님 |
| `breakpoint-wide` | 넓은 분석 grid를 전환하는 `wide:` 기준 | 플랫폼 literal `90rem` |
| `detail-panel-width` | 셸 고정 상세 슬롯 폭 | FeedbackOps 공유 토큰; 소비 시 fallback·clamp는 06 §7 |

사용하지 않는 overlay 전용 `width-detail-panel`/`w-detail-panel` 확장은 ADR-0013으로 폐기했다. 상세 슬롯은 공유 `--detail-panel-width`를 직접 소비한다. 반응형 정책의 상태·MVP 범위는 [06 §25](docs/06_platform_ui_contract.md#25-responsive-strategy)와 [05](docs/05_roadmap_and_open_questions.md#mvp-지원-환경--데스크톱-웹만-decided-2026-09-27)를 따른다. DetailDrawer는 지원 데스크톱에서 고정 슬롯을 유지한다.

## Accessibility pairing rules

[06 §26](docs/06_platform_ui_contract.md#26-accessibility-baseline)의 색+shape/text, visible focus, 차트 대체 경로 의무를 소비한다. 아래는 플랫폼의 구체 token pairing 규칙이다. 작은 일반 글자는 최소 4.5:1, 의미 있는 control 경계는 최소 3:1을 확보한다. **필수 글자에 opacity fade를 적용하지 않는다.** `text-disabled`는 실제 비활성 표현에만 쓰고 그룹 제목·현재 Scope·도움말·상태·단위에 쓰지 않는다.

### Allowed foreground/surface pairs

label 행은 #210(FeedbackOps 원본 값), 나머지 행은 #193/#194 UI/UX 리뷰의 opaque sRGB token 계산이다. 렌더 검증을 대신하지 않는다. `surface-popover`는 sunken과 같은 공유 palette를 쓰므로 동일 제한을 받는다.

| 전경 | 허용 표면 / 대비 | 제한·적용 예 |
| --- | --- | --- |
| `text-primary`, `text-secondary` | canvas/card/sidebar/sunken/hover/selected | 필수 제목·검색 입력·열 머리·popover 설명. secondary는 sunken 9.23:1, sidebar/hover/selected 9.310/8.909/8.218:1 |
| `text-muted` | canvas 4.642:1, card 4.892:1, sidebar 4.505:1 | 원래 opaque 값으로 보조 문구·section label; sidebar에서도 여유가 작으므로 fade 금지 |
| `text-muted` | sunken **4.469:1** (약 4.47), hover 4.311:1, selected 3.977:1 | **필수 작은 글자에 금지**. sunken 열 머리·검색 문구·popover, hover/selected 상태 label은 `text-secondary`로 |
| FeedbackOps `text-text-success-label` | card 5.764:1, success-soft 5.191:1; canvas/sunken/hover/selected 포함 최저 4.686:1 | 작은 성공 의미 글자; vivid success는 dot/icon/tint로 분리 |
| FeedbackOps `text-text-info-label` | card 5.564:1, primary-soft 4.639:1; 동일 표면 집합 최저 4.523:1 | 작은 정보 의미 글자 |
| FeedbackOps `text-text-warning-label` | card 5.971:1, warn-soft 5.195:1; 동일 표면 집합 최저 4.854:1 | 작은 경고 의미 글자 |
| FeedbackOps `text-text-danger-label` | card 6.571:1, danger-soft 5.560:1; 동일 표면 집합 최저 5.342:1 | 작은 오류 의미 글자 |
| `text-secondary` (neutral label) | sunken/neutral-soft 9.23:1 | 중립 배지·필수 미평가 설명 |
| `border-control` | card/canvas/sunken/hover/selected 4.892/4.642/4.469/4.311/3.977:1; sidebar 4.505:1 | interactive control 식별 경계로 모두 ≥3:1; text-muted와 같은 값이어도 비텍스트 기준은 다름 |
| `border-subtle` | 구조 divider·card·행 구분 | 입력/checkbox의 유일한 식별 경계로 사용 금지 |
| 공유 `focus-ring` / 플랫폼 `accent-primary` | sidebar/hover/selected 10.304/9.859/9.095:1 | opaque focus/current 막대; 색 외 형태 단서 동반 |

허용 표에 없는 새 fill·opacity 조합은 자동 허용하지 않고 실제 전경/표면을 계산한다. vivid dot/icon 역시 의미를 단독 전달하면 비텍스트 대비를 확인해야 한다. 차트 palette의 알려진 부족과 후속 구현은 아래 Chart stroke 결정 및 #203에서 추적한다.

## Shell visual rules

셸 구조·치수·본문 여백·gap·sticky 배치의 원본은 [06 §7 Baseline](docs/06_platform_ui_contract.md#7-application-shell)과 [07 §4](docs/07_app_shell_wireframe.md)다. 이 문서는 아래 시각 보완만 소유하며 구조 값을 다시 정의하지 않는다.

- B안 Context 바는 모든 control에 적용/참조/미사용 capability 배지를 표시한다. 적용 상태 문구는 `적용` / `Applied`(`capApplied`)이며 편집기의 `적용` / `Apply` 동작과 구분한다. control 표면은 유지한다. 넘침 버튼은 숨은 조건 수와 적용 수를 표시하고, 축약된 기간·아이콘 동작은 전체 접근 이름과 title을 제공한다(06 §7, ADR-0015).
- 상세 슬롯은 공유 `surface-detail` 표면과 왼쪽 1px `border-subtle` 구분선으로 본문과 나눈다. 셸 전체 높이를 쓰고 그림자·scrim은 없다. 내부 상세 탭 내용은 독립 스크롤하며 폭은 06 §7 Baseline을 소비한다(ADR-0013).
- 공유 `surface-sidebar` 위에 Registry 그룹을 **section label**로 표시한다. 활성 탐색 제목에 `text-disabled`를 쓰지 않는다. 주 메뉴 navigation과 즐겨찾기/최근 section을 구별한다.
- 현재 메뉴/공간은 공유 selected 표면 + text weight + **2px accent 막대**로 구별한다. `aria-current`를 유지하고 hover가 막대를 지우지 않는다. 보조 즐겨찾기/최근 링크에 현재 위치 표식을 중복하지 않는다.
- hover는 공유 row-hover, focus는 opaque 2px outline과 offset을 사용한다. hover/selected 안의 작은 필수 글자(‘예정’, Scope 상태·room, 언어)는 secondary 또는 허용 label로 유지한다.
- collapsed에서는 Scope 선택·검증 상태와 주 메뉴를 남긴다. 아이콘은 이름 있는 동작이며 hover/focus Tooltip에 전체 이름을 제공한다. Scope Tooltip과 accessible description은 이름·상태·room을 보존하고 live announcement는 상태 문자열만 전달한다.
- collapsed에서 즐겨찾기/최근은 숨겨 주 메뉴와 중복 아이콘이 섞이지 않게 한다. expanded에서는 두 section과 빈 안내를 유지한다. 빈 안내는 가짜 링크가 아니다.
- 한 줄 머리에서는 설명이 먼저 폭을 양보한다. 제목·부모 링크가 축약되면 전체 문자열에 접근할 수 있어야 하고 동작·즐겨찾기는 가려지지 않는다. 고정 동작만으로 폭이 넘는 경우 header 내부 가로 스크롤로 접근한다. 제목을 키우려고 한 줄 계약을 바꾸지 않는다.
- 언어 동작의 접근성 이름은 현재 언어와 다음 전환 목적을 함께 전달한다. 번역 범위와 Context 보존은 06 §23을 따른다.

## Layout and analysis composition

정보 밀도는 장식 여백보다 우선한다. 정확한 비교는 표, 변화·분포는 차트, 요약은 KPI로 나눈다. 카드마다 동일한 시각 강도를 주는 card soup를 피하고 공유 surface/border로 계층을 만든다. 공유 반경·primitive 모양은 FeedbackOps 원본을 따르며 버튼·input을 독자적으로 재설계하지 않는다. 카드 그림자를 겹치지 않고, floating surface의 공유 처리는 06 §23을 따른다.

### Dashboard composition and focal point

플랫폼 Overview/Analysis Workspace의 시각 패턴은 [06 §12](docs/06_platform_ui_contract.md#12-canonical-page-archetypes)를 소비한다. 요약 → 주요 분석 → 예외 → 상세 근거로 읽을 수 있어야 한다. KPI는 5–6개 이하로 제한하고 모든 tile을 hero 크기로 만들지 않는다. 주요 과제 하나에 넓이·순서·제목의 우선순위를 준다.

산업 로그 분석 reference는 5개 KPI → pipeline 왼쪽/operations 오른쪽(약 64/36) → lifecycle 왼쪽/quality 오른쪽(약 47/53) → 전체 폭 equipment table의 구성이었다. quality는 **3개 ring + 1개 bar**이며 네 번째 donut을 만들지 않는다. pipeline-status가 첫 주요 행의 넓은 focal region이라는 판단은 **Candidate**다. 실제 사용자 과제가 예외 처리를 우선하면 재검토한다. 모든 메뉴의 필수 배치가 아니다.

넓은 화면은 비교 패널을 나란히 두고 좁은 desktop은 column 수를 줄이거나 보조 패널을 접근 가능한 drawer로 옮긴다(06 §25 Candidate). pipeline 순서는 유지하고 필요하면 영역 안에서 가로 스크롤한다. 표 글자를 줄여 맞추지 않는다. MVP는 desktop web이며 1024 미만/터치 전용 재구성은 이후 과제다.

### KPI tiles and supporting copy

- icon·label·값·단위·기준이 있는 delta·보조 caption으로 구성한다. 한 tile에 무관한 두 primary 값을 쌓지 않는다.
- primary 값은 `t-stat`, 보조 값은 `t-stat-2`; 숫자는 tabular, 단위는 덜 강조하되 읽을 수 있게 한다. delta는 비교 기간·분모를 함께 설명하고 증가 자체를 성공으로 판단하지 않는다.
- 값 → 원천 표/상세로 추적할 수 있어야 한다. 갱신 시각·coverage·정의 버전은 DataTrust 계약과 함께 표시한다. unknown을 0 또는 0%로 만들지 않는다.
- 보조 문구는 현재 조건과 다음 행동을 짧게 설명한다. sunken/hover/selected의 필수 문구는 secondary, 의미 문구는 FeedbackOps `text-text-*-label` 쌍을 사용한다. screenshot의 Live 표시는 실제 feed의 근거가 있을 때만 쓴다.

## Charts

[06 §16](docs/06_platform_ui_contract.md#16-analysis-chart-contract)과 [§26](docs/06_platform_ui_contract.md#26-accessibility-baseline)의 Chart Frame/interaction 계약을 따른다. 모든 차트에는 **title, unit, textual summary, 동일 데이터 table 접근 경로**가 있다. legend는 이름+선 모양/기호+색을 제공한다. Tooltip은 hover와 keyboard focus에 대응하고 label/value/unit을 포함한다. passive mark에 가짜 pressed 동작을 넣지 않는다.

series fill 정체성은 `chart-*`, 범주 구분은 `cat-*`, 상태 판정은 별도 label vocabulary로 표현한다. 얇은 line/outline mark는 `chart-*-stroke` 별칭을 쓰고 legend도 같은 stroke 색을 사용한다. 이전 기간의 `cat-amber` 선·외곽선 마크는 `cat-amber-stroke` 별칭을 쓴다. 막대와 영역, series symbol, 선택/annotation fill은 기존 fill token을 유지한다. P50 solid / P95 dashed처럼 색 이외의 구별을 유지한다. 선택/brush/drill-down이 전역 Context를 바꾸는지는 명시적으로 구분하고 단순 chart click으로 조용히 조건을 바꾸지 않는다.

reference quality recipe는 coverage→blue, traceability→teal, consistency→green, missing/untraced→이름 있는 remainder, inconsistent→cat-amber다. 분자·분모를 detail/table에서 제공하며 donut/gauge의 기본 허용 범위는 [06 §24](docs/06_platform_ui_contract.md#decorative-visualization)를 따른다. defect bar는 zero baseline·정수 ticks·날짜·단위를 갖고 max는 데이터로 산정한다. queue/progress는 완료율과 성공률을 분리하고 분모 없는 회색 remainder를 만들어내지 않는다. pipeline/queue/lifecycle의 도메인 의미는 Consumer 후보이며 반복 확인 전 범용 플랫폼 컴포넌트로 승격하지 않는다.

## Tables

플랫폼 table 동작은 [06 §15](docs/06_platform_ui_contract.md#15-platform-data-table-contract)가 소유한다. 이 문서의 `components.table-density`가 기본 시각 밀도의 원본이다:

```yaml
rowMinHeight: 32px
headerMinHeight: 32px
cellPadding: 4px 12px
```

줄바꿈·font fallback·visible focus·최소 24px desktop target에 따라 행은 커질 수 있다. screenshot의 compact 밀도는 기본값을 낮추는 근거가 아니다. coarse pointer의 44px target은 MVP 이후 정책이다.

- 헤더 sunken + secondary, 데이터 primary, 수치 우측 정렬+tabular, ID mono. 상태와 범주 label을 구별한다. 열 제목 case는 Typography roles를 따른다.
- row divider는 border-subtle; checkbox·검색·filter 경계는 border-control. hover에서 focus와 selected checkbox/표식이 사라지지 않는다.
- toolbar는 제목/설명과 검색·filter·동작을 분리해 정렬하고 폭이 부족하면 wrap한다. 가로 overflow는 표 영역에 가두고 toolbar 접근을 유지한다.
- selection은 대상·선택 수·clear를 보여 준다. 현재 page 선택과 전체 결과 선택을 혼동하지 않는다. Context/Scope 변경 시 selection을 해제한다. nested 버튼이 있는 행을 통째 clickable wrapper로 만들지 않는다.
- sort는 `aria-sort`, bulk action은 권한·대상이 명확해야 한다. copy/export 동작·고정 toolbar는 [ADR-0008](docs/adr/0008-table-owned-export-fixed-toolbar.md)의 현재 계약을 따른다. 이 문서가 새로운 backend 작업을 추가하지 않는다.
- copy Tooltip과 표 column menu의 border-only 처리는 현재 table 패턴이다. 이 국소 처리를 공유 floating primitive 전체의 shadow 금지로 확대하지 않는다.

## Status & Badges

`StatusBadge` vocabulary는 **success / warning / danger / neutral / info**다. 실제 데이터 판정은 [06 §19](docs/06_platform_ui_contract.md#19-loading--empty--error-taxonomy)의 원천·관측 시각에 근거한다. success는 확인된 긍정, warning은 확인된 주의, danger는 확인된 실패, neutral은 미평가/보조, info는 정보 전달의 시각 역할이다. unknown·permission 제한·미수집을 화면 임의로 success/failure로 바꾸지 않는다.

작은 badge text는 FeedbackOps `text-text-*-label`, neutral은 secondary이며 soft fill/dot은 별도 vivid accent를 쓴다. text+icon/shape로 의미를 함께 전달한다. 평범한 label에 새 상태 색을 만들지 않는다. 범주/제품 milestone label은 성공 판정과 다르다. 새로운 Tone은 플랫폼 디자인 결정으로 다룬다.

## Reference component bindings

기존 time-control 소비자 링크를 유지하기 위한 절이다. reference recipe는 동작 원본을 재정의하지 않는다.

### Filter bar

전역 기간은 Context bar의 동일한 control 하나다. page-owned 검색·stage/status filter는 content toolbar에 두고 전역 Context를 보존한다. 적용된 조건은 보이며 persistent accessible label을 제공한다. page-owned toolbar는 폭이 부족하면 wrap하고 active filter를 숨기지 않는다. 전역 Context 바는 [06 §7](docs/06_platform_ui_contract.md#7-application-shell)의 우선순위 넘침을 소비하며 한 줄을 유지한다. 입력/검색 문구가 sunken이면 secondary를 사용한다.

기간 preset은 `1일 / 7일 / 사용자 지정`; rolling wall-clock Δ와 `[from,to)` 물질화는 [06 시간 계약](docs/06_platform_ui_contract.md#ctx-time)을 따른다. screenshot의 기간 preset을 제품 의미로 복사하지 않는다. segment는 이름 있는 single-select/radio+selected 표식, custom picker는 Apply 때 반영하고 Cancel/Escape는 기존 구간을 보존한다. 현재 적용 구간과 draft를 구별하고 browser now로 기본값을 새로 만들지 않는다. 최초 기본 Δ·shift/business-day는 원본의 Open 상태를 따른다.

### Other reference recipes

stat/pipeline icon은 compact soft chip, navigation 그룹 icon은 unboxed outline을 사용한다. outline family는 Lucide 결정이며 icon-only 동작에 이름을 붙이고 장식 icon은 숨긴다. scheduler recipe는 queue+processing-window 두 보조 영역과 전체 폭 alert list다. alert는 icon/message/time/action을 읽을 수 있게 배치하며 장식 full-row tint로 모든 항목을 강조하지 않는다. queue total/running/pending/remainder의 일관된 분모와 processing-window의 원천 시각이 필요하다. lifecycle complete/pending/unknown은 checked/hollow/label을 병행하며 제품 milestone의 의미는 도메인 소유다. 실제 profile/bulk action inventory는 계정 capability를 따르고 screenshot에서 발명하지 않는다.

## Shared interaction and data states

primitive 상태·keyboard 동작은 [FeedbackOps UI 계약](products/feedbackops/docs/frontend/ui-design-system.md)이 원본이다. 플랫폼 조합에서는 아래 역할을 연결한다.

| Family | Hover / pressed / selected | Focus / disabled / busy |
| --- | --- | --- |
| Button·toolbar·icon trigger | 공유 neutral hover/pressed, primary는 primary-hover; open trigger의 상태 표시 | opaque focus, 실제 disabled와 이유, busy width+spinner/label 유지·중복 제출 방지 |
| Navigation | 공유 hover/selected + 현재 위치 막대/weight | 이름·aria-current·focus 유지; 권한 visibility는 Registry 소유 |
| Range·checkbox | 공유 hover + radio/checked/mixed shape | native semantics·focus 유지 |
| Search/filter | border-control, 입력 secondary/primary; error label+aria-invalid | read-only/disabled 구별, refresh 때 draft 보존 |
| Menu | hover/keyboard highlight + 선택 check | primitive managed focus·Escape·trigger 복귀 |
| Table | hover + selected checkbox/shape | focus-within이 cell을 가리지 않음; busy도 헤더 유지 |
| Chart·linked KPI | series/outline 강조; 의미 색 바꾸지 않음 | actionable mark만 focus/drill-down; 동일 tooltip/table 접근 |

첫 load는 reserved geometry와 region `aria-busy`를 유지하며 fabricated 값을 만들지 않는다. 공유 Skeleton의 기본 fill은 FeedbackOps UI 계약이 소유한다. 플랫폼 PlatformDataTable/StateView는 현재 `bg-surface-sunken`으로 공유 기본 `surface-blocked`를 덮어쓴다. 이 플랫폼 override의 시각 규칙은 이 문서가 소유하며 #55에서 재검토할 수 있다. 동일 Context refresh는 값+Refreshing을 유지할 수 있다. Context/Scope가 바뀌면 이전 결과를 새 결과처럼 표시하지 않고 권한을 재검증한다(06 §11). 부분 실패는 해당 widget에 국한하고 정상 panel을 유지한다.

Empty/error는 원인 설명·허용된 다음 행동·Retry·correlation ID를 읽을 수 있게 표시한다. [06 §19](docs/06_platform_ui_contract.md#19-loading--empty--error-taxonomy)의 no-match/not-collected/delayed/coverage/forbidden/too-large/unknown을 하나로 합치지 않는다. 조회 0건에서 수집/파서 지연을 추론하지 않는다. 실제 비활성·busy도 필요한 이유를 opacity로 숨기지 않는다.

`live-dot`은 기본 static이다. pulse는 **Candidate**로 실제 live freshness source가 확인될 때만 허용하며 label/layout을 움직이지 않는다. reduced-motion에서는 animation을 끄고 freshness가 사라지면 Updated/Data through/Unknown으로 전환한다. Live는 completeness의 증거가 아니다. optional breadcrumb는 nested page의 ancestor link와 current page를 구별하고 Context를 보존한다.

## Do's and Don'ts

| Do | Don't |
| --- | --- |
| FeedbackOps semantic token/primitive를 `@ap/ui`로 소비 | 공유 palette·본문·반경을 이 문서나 메뉴에 다시 정의 |
| primary 강조를 주요 동작·위치·focus에 집중 | 범주 palette로 두 번째 brand CTA 제작 |
| 필수 sunken 문구 secondary, 의미 문구 FeedbackOps `text-text-*-label` | muted-on-sunken을 4.5:1로 반올림하거나 opacity로 fade |
| control 경계 border-control, 구조선 border-subtle | 모든 divider를 진하게 하거나 input 경계를 hairline만으로 식별 |
| 색+shape/weight/text로 선택·상태 표시 | 색만으로 현재 위치·성공·실패 전달 |
| KPI→차트→동일 데이터 표/근거로 추적 | unknown을 0으로 만들거나 screenshot 숫자·Live를 제품 사실로 사용 |
| 공유 표면/반경·일관된 numeric alignment | 카드마다 그림자 스택·pill 버튼·hero KPI 추가 |
| 플랫폼 공통 계약 우선, 반복된 Consumer 패턴만 승격 | 메뉴 화면을 목적으로 연속 제작하거나 도메인 queue/lifecycle을 조기 범용화 |

## Sources

| Source | 보존한 원칙·증거 | 현재 권한 / 대체된 부분 |
| --- | --- | --- |
| FeedbackOps tokens.md / tokens.css / UI system / ADR-0058 | 제품 UI 기반·공유 typography·primitive·소비 계약 | **공유 디자인 원본**; 이전 플랫폼 공유 값/독자 font/primitive 설명을 대체 |
| ADR-0010 / ADR-0011, 승인 prototype `prototype/52-fops-design` (`.agents/reports/design/shots/52-fops/`) | 직접 소비, 프로토타입 C안의 밝은 AppFrame | **Decided**; 이전 어두운 navigation·상단 구성·shell 측정값을 대체 |
| 06 / 07 | 플랫폼 행동·상태·접근성 및 셸 구조 | **계약 원본**; reference navigation·시간·권한보다 우선 |
| #193 UIUX-193-03/04/05, #194 P3-D1·수용된 shell 수정 | label/control pairing·sunken 제한·stroke 대비·현재 위치·collapsed 규칙 | 이 문서의 pairing 및 chart 결정 배경; 렌더/동작 통과를 새로 주장하지 않음 |
| `.agents/references/design-md/`의 linear.app | 단일 강조·중립 hierarchy | 원칙만 보존; brand 값·독자 공유 token·marketing layout은 FeedbackOps로 대체/미채택 |
| 같은 참고자료의 clickhouse | flat hierarchy·shadow stack 회피 | 원칙만; 독자 radius와 전역 shadow 금지는 공유 primitive/06 규칙으로 대체 |
| 같은 참고자료의 supabase | ink hierarchy·기술 도구의 절제 | 원칙만; font·surface·radius literal은 FeedbackOps로 대체 |
| 같은 참고자료의 mongodb | 범주색은 series/tag에 제한 | 원칙만; dark hero·pricing·pill CTA 미채택 |
| Industrial Log Analytics screenshot, 1672×941, 기존 업로드 ID `00521d63-05d6-4f35-b771-a2b8bc1da6b7/0f3b051c-image.png` | KPI/pipeline/queue/lifecycle, 3 rings+bar, equipment table 구성의 provenance | 역사적 시각 입력; shell/폰트/색 측정값은 FeedbackOps로 대체. 원본은 저장소 밖이며 이번 작업에서 재검증하지 않음 |
| interface-design / ui-ux-pro-max의 당시 review | focal region·numeric alignment·visible focus | 검토 provenance; 계약을 덮어쓰지 않음 |

posthog와 sentri(Sentry 스타일) 자료는 당시 illustration/mascot 중심 marketing 방향이라 미채택했다. 원본 raster에서 exact CSS·source font·animation·business priority를 확정하지 않는다. Reference 배치는 Consumer 후보이며 새로운 플랫폼 API나 도메인 화면 구현을 승인하지 않는다.

## Design Decisions

### Detail panel — Decided (B, 2026-10-04)

상세 패널은 셸 소유 고정 슬롯(B)으로 컨펌됐다. [ADR-0013](docs/adr/0013-detail-panel-shell-docked-slot.md)이 ADR-0011에서 남긴 별도 결정을 닫는다. 배치·동작 원본은 06 §7·§13, 표면·경계는 위 Shell visual rules를 따른다.

### Chart stroke contrast — Decided (B, 2026-10-04)

현재 카드 위 thin line mark의 `chart-blue`는 **2.79:1**, `chart-teal`은 **2.98:1**이며 `chart-purple` bar는 **3.25:1**이다(#193 리뷰). 2px 선에서 blue/teal은 의미 있는 비텍스트 mark의 3:1 기준에 부족하다. solid/dashed legend와 동일 데이터 table은 series 구분/대체 경로를 제공하지만 선 자체 대비를 높이지 않는다.

| 선택지 | 효과·비용 |
| --- | --- |
| A. 현재 palette 유지 | 승인 palette/범주 identity 유지; 선 대비 부족은 남고 contrast-safe outline 또는 다른 표현의 별도 검증이 필요 |
| B. thin line mark용 더 진한 stroke alias 추가, category fill 유지 | 범주 identity·soft fill을 보존하며 line/outline 대비를 조정; 새 alias와 표면별 ≥3:1 검증 필요 |
| C. palette 자체 변경 | 모든 mark의 일관된 재조정 가능; 승인 palette·category fill·legend 소비자까지 영향과 prototype 재확인 필요 |

**B 구현 — 사용자 결정, 2026-10-04.** [ADR-0012](docs/adr/0012-chart-thin-line-stroke-aliases.md)에 따라 thin line/outline 전용 stroke alias를 추가했고 category fill·기존 palette는 유지한다. 사용자가 확인한 B2 값과 각 표면 대비는 아래와 같다.

| Stroke alias | 값 | 카드 `#fbfdff` | 캔버스 `#f3f7fe` | Sunken `#edf3fb` |
| --- | --- | ---: | ---: | ---: |
| `chart-blue-stroke` | `#2577cc` | 4.49:1 | 4.26:1 | 4.10:1 |
| `chart-teal-stroke` | `#008090` | 4.59:1 | 4.35:1 | 4.19:1 |
| `chart-purple-stroke` | `#8154ce` | 5.03:1 | 4.78:1 | 4.60:1 |
| `cat-amber-stroke` | `#b45309` | 4.93:1 | 4.67:1 | 4.50:1 |

`AnalysisChartFrame`은 blue/teal/purple/amber 시리즈 선, 선 범례 견본, 브러시 외곽선에 해당하는 stroke 별칭을 쓴다. 막대·영역 채움과 선 위 심볼은 원래 채움 색을 유지하고, 그래서 툴팁 마커(심볼 색을 따름)도 채움 색이다. `chart-green`은 얇은 선으로 쓰는 곳이 없어 stroke 값을 두지 않았다.

### Chart legend and series encoding — Decided (B, 2026-10-04)

사용자는 #207의 실제 차트 화면 `?variant=` 프로토타입에서 B를 선택했다. [ADR-0014](docs/adr/0014-chart-legend-period-grouping.md)에 기록한다.

- Compare가 켜져 있고 현재 메뉴 manifest가 Compare를 제공할 때만 범례를 `현재 기간` / `이전 기간` 두 행으로 묶는다. 그 외에는 그룹 제목 없는 일반 범례다. 제목은 `@ap/kernel` i18n 사전을 사용한다.
- 시리즈 소비자는 `dashed`와 색을 선언한다. 현재 기간의 실선은 `'solid'`, 대시는 `[8, 4]`를 쓴다. 이전 기간의 비점선은 `[2, 2]`, 대시는 `[8, 3, 2, 3]`으로 변환한다. ECharts 선과 SVG 선 견본은 같은 dash 배열을 쓴다.
- 막대 범례는 12px 채운 사각형이며 2px 외곽선은 stroke alias를 쓴다. 이름 있는 나머지 `chart-remainder`는 `border-control`로 둘러싼다.
- `cat-amber-stroke`는 이전 기간 amber 차트 선·외곽선에만 쓰며 작은 글자에는 쓰지 않는다. P95/reference `markLine`과 라벨은 모든 경우 `text-secondary`다.
- 사이클타임 상세의 이전 P50/P95는 각각 현재 대응 시리즈의 `dashed` 선언을 따른다. 생산성 개요의 P95도 점선으로 맞추며 해당 manifest의 Compare 기능은 바꾸지 않는다.

## Open Decisions

### Remaining decisions and reference limits

- Dark mode는 [05 상태 추적](docs/05_roadmap_and_open_questions.md)의 **Deferred**, 현재 light design을 단순 invert하지 않는다.
- ECharts renderer/stack와 현재 코드 차이는 [05 결정 상태](docs/05_roadmap_and_open_questions.md)의 **Open**을 따른다. 이 문서가 새로운 chart theme 구현을 뜻하지 않는다.
- 언어 번역 범위는 06 §23의 **Decided**, 계정 저장 선호는 **Candidate**다. Lucide는 기존 **Decided**를 유지한다.
- pipeline focal priority·live pulse·reference queue/lifecycle의 domain 의미는 **Candidate/Open**이며 원천이 확인되기 전 실제 운영 데이터로 주장하지 않는다.
