# 레이아웃

> Scope: 셸 구조·Shell Slot·Page Archetype·반응형 전략.  
> 포함 절: §7, §8, §12, §25  
> 색인과 「절 → 문서」 대응표: [06. Platform UI Contract](platform-ui-contract.md)  
> 상태 표기(Decided / Candidate / Open / Deferred): [문서 소유권과 결정 상태](platform-ui-contract.md#문서-소유권과-결정-상태)

## 7. Application Shell

Desktop-first를 기본으로 한다.

구조는 FeedbackOps AppFrame을 따른다(Decided, 2026-10-04, [ADR-0011](../adr/0011-design-direction-feedbackops-shell.md)). 셸은 플랫폼 `@ap/shell`이 그리며 FeedbackOps 앱 코드를 가져오지 않는다.

셸 배치도(레일·사이드바·페이지 머리·Context 바·콘텐츠 슬롯, 상세가 열린 상태 포함)는 [07 §4](../wireframes/app-shell.md#4-wireframe-decided-구조-2026-10-04--adr-0011)에 하나만 둔다.

- **레일** (위 → 아래): `시스템 및 플랫폼 메뉴` 전환기(맨 위, §9.1, ADR-0070) → 현재 시스템의 섹션 버튼(그룹 단위, 공간 밖 화면에서는 비어 있음) → 공통 도구(명령 팔레트 §10) → 앱이 주입하는 도구 슬롯(`topBarTools`, ADR-0009 이름 유지), 도움말, 사용자 메뉴(`언어`를 품는다, ADR-0070; `FeedbackOps 전체` 링크는 없앴다, ADR-0081 결정 6, #764 p2). 공통 도구는 시스템을 바꿔도 같은 자리다. 배치·치수 원본은 [15 §3.2](../design/multi-workspace-ui.md#32-시스템별-레일-decided-2026-10-19-adr-0042), 방향은 [ADR-0042](../adr/0042-system-switcher-and-system-owned-rail.md)다.
- **사이드바**: 머리에 공간 이름과 현재 섹션 이름(같으면 한 줄)과 접기. 그 아래 Scope 선택기와 검증 상태가 있고, 현재 섹션(그룹)의 메뉴, 즐겨찾기·최근이 이어진다(§9). 미등록 경로·공간 진입 거부의 fallback 사이드바는 접근 가능한 공간의 모든 그룹을 그대로 그린다.
- **상단 바는 없다.** 페이지 머리는 한 줄에 위치·제목·설명·동작을 둔다(§8 슬롯).

Scope는 개념적으로 Global Context에 포함되지만 선택기는 **사이드바 머리에 하나만** 둔다. Context Bar에 두 번째 Scope 선택기를 만들지 않는다. 예외: 분석 보드([16](../design/analysis-board.md))에는 업무 시스템 사이드바가 없으므로, 보드 Context 바의 Scope가 **선택된 칸의 Scope이자 그 화면의 유일한 Scope 선택기**다(§6.5, [ADR-0051](../adr/0051-analysis-board-pane-header-signal-chips-numbered-selection.md)). 구체 셸 배치는 `../wireframes/app-shell.md`를 따른다.

### Context 바 우선순위 넘침 (Decided, 2026-10-04 — #56, [ADR-0015](../adr/0015-context-bar-priority-overflow.md))

- Context 바는 모든 폭에서 **한 줄 48px**을 유지한다. 뷰포트가 아닌 바 자체 폭을 측정해 상세 슬롯·사이드바 변화에도 반응하며, 측정용 레이어는 inert·접근성 제외·중복 데이터 조회 없음으로 유지한다. 재측정 조건 등 구현 세부는 [ADR-0015](../adr/0015-context-bar-priority-overflow.md)를 따른다.
- 기간은 항상 보인다. Context 바는 "전역 Context" 라벨을 그리지 않고 region 이름(접근 이름)으로만 둔다(2026-10-26 사용자 결정, #914). 폭이 부족하면 기간 프리셋(1일/7일/사용자 지정)을 기간 팝오버로 옮긴다. 기간 버튼은 축약할 수 있으나 전체 범위를 접근 이름과 title로 제공한다.
- 기간 표기는 `@ap/contracts`의 `formatPeriod(from, to, lang)` 하나다(`MM-DD HH:mm → MM-DD HH:mm (길이)`, 길이는 48시간 미만 `24h`·이상 `7d`/`7일`, 열린 끝은 `—`이고 반열린 기간은 길이 없음, 연도 없음 — [backlog](../../.planning/backlog.md) #914 UX-3). Context 바 기간 버튼의 글자·접근 이름·title, `querySummaryItems`의 시간 항목, `QueryBar` 기간 편집이 모두 이것을 쓴다(#913).
- 표시 대상인 나머지 키는 `roomNames → condition → selection → lot → ppid → recipe → metric` 순서로 남기며 뒤쪽부터 하나의 넘침 팝오버로 옮긴다. B안은 예외인 참조만·미지원 capability만 배지로 표시하고 적용 상태 배지는 생략하며, 팝오버에서도 동일한 전체 편집기를 제공한다.
- 넘침 버튼은 `조건 N개 더` / `N more`다. 숨은 키 중 기본값이 아닌 값이 M개 있으면 ` · M개 적용 중` / ` · M applied`를 붙이고 M=0이면 생략한다. 명시적 빈 선택은 기본값과 다르므로 센다.
- 좁을 때 링크 복사·초기화는 아이콘만 보이고 접근 이름과 title을 유지한다. 편집·초기화·링크·URL·권한·미지원 보존 의미는 §6을 그대로 따른다.

### Baseline (Decided, 2026-10-04 — FeedbackOps 레이아웃 토큰)

```text
Rail                 52px   (--rail-width)
Sidebar expanded    240px   (--sidebar-width)
Sidebar collapsed    56px   (--sidebar-width-collapsed)
Detail slot         440px   (--detail-panel-width; 미제공 시 440px, 360–520px clamp; 비어 있으면 0)
Top header           없음
Page header          50px   (--toolbar-height)
Global context bar   48px
Content padding      FeedbackOps PageShell 기준 (좌우 32px / 위 28px / 아래 36px)
Section gap          24px
Component gap        12~16px
```

치수 값의 단일 원본은 FeedbackOps `packages/ui/src/styles/tokens.css`의 레이아웃 토큰이다. 셸은 이 토큰과 같은 값을 쓴다(페이지 머리 50px·Context 바 48px는 코드 리터럴). DESIGN은 [셸 시각 보완](../../DESIGN.md#shell-visual-rules)만 소유하며 이 Baseline을 재정의하지 않는다.

50px 페이지 머리와 live 모드 Context Bar는 스크롤되는 main 안에서 하나의 sticky 래퍼로 유지한다. Apply 모드는 페이지 머리만 이 래퍼에 두며 펼친 조회 편집기는 래퍼 밖에서 본문과 함께 스크롤한다. 접힌 조회 요약·동작 행만 페이지 머리 바로 아래에 sticky로 유지하며, sticky offset에는 이 접힌 행의 높이만 더한다. 본문은 FeedbackOps `PageShell`의 여백을 사용하며 분석 페이지에 폭 제한은 추가하지 않는다. 페이지 머리는 한 줄을 유지하고, 머리 자신 폭이 줄면 설명·Data Trust 요약·잠정 배지·제목 말줄임 순으로 양보하며 주 동작은 남긴다. 보조 동작은 ⋯ 팝오버의 이름 있는 동작 그룹에 둔다. 모든 양보 뒤에도 들어가지 않을 때(예: 1024px + 펼친 사이드바 + 상세 패널)만 머리가 가로로 스크롤된다. 주 동작은 Tab 포커스나 스크롤로 닿으며, 포커스한 컨트롤은 머리의 보이는 범위로 스크롤된다. 시각 스크롤바는 감추지 않는다. 정상 폭(1280px 이상 + 상세 패널)에서는 스크롤이 생기지 않는다(시각 순서는 [DESIGN 셸 시각 보완](../../DESIGN.md#shell-visual-rules), [ADR-0035](../adr/0035-page-header-yield-order.md)).

분석 페이지에는 임의의 좁은 `max-width`를 적용하지 않는다.

---

## 8. Shell Slots

페이지가 Shell과 결합하는 지점을 정해둔다.

```text
Page
├─ title
├─ description
├─ primaryAction
├─ secondaryActions
├─ contextNotes
├─ contextExtension
├─ content
├─ dataTrustSummary
└─ detail (셸 소유 오른쪽 고정 슬롯, §13)
```

`contextNotes`(`ReactNode[]`, 요소 하나가 안내 하나; `null`·`false` 요소는 세지도 그리지도 않는다)는 `contextExtension` 위에 그리는 설명 안내 슬롯이다. 페이지가 필터 컨트롤(`contextExtension`)과 설명 문장을 한 덩어리로 섞어 넘기면 접힌 줄이 안내 개수를 알 수 없고 안내만 따로 위·아래로 둘 수도 없다 — 그래서 별도 슬롯으로 둔다(#680, [ADR-0075](../adr/0075-page-head-one-line-fold-thin-outcome-strip.md)). 머리 영역은 `(contextNotes가 비어 있지 않음 || contextExtension) && 게이트 없음`일 때 그린다. flow 페이지는 안내를 확장 위에 항상 그리고(접기 없음), fill 페이지는 §12.8의 머리 접기를 쓴다.

이 Slot 외의 위치에 페이지가 직접 전역 UI를 삽입하지 않는다. 상세 내용은 등록 경계로 넘기고, 셸이 main 옆의 전체 높이 오른쪽 aside 배치를 소유한다(§13).

**VOC 등록 드로어(Decided, 2026-10-22, [ADR-0070](../adr/0070-global-features-platform-menu-and-voc-drawer.md)):** 셸이 소유하는 오른쪽 자리이고 페이지 슬롯이 아니다. 레일 `VOC 등록`이 연다. 상세 슬롯처럼 본문을 밀어내는 도킹 패널이며 overlay·scrim·본문 inert를 쓰지 않는다. 열 때 지금 화면의 Context를 고정해 지울 수 있는 칩으로 보인다 — 시스템·메뉴, 등록된 URL page key, 집계 단위, 시각까지 쓴 기간, Global Context(Condition·Selection 포함), 열려 있는 상세 엔티티, 보이는 Correlation ID. 지운 칩은 첨부하지 않는다(첨부되는 주소에서도 빠진다). Managed System·Analytics Area는 [ADR-0068](../adr/0068-permission-scope-and-business-system-link.md)의 연결에서 채우고, 연결이 없으면 사용자가 고른다. 화면 이름으로 추정하지 않는다. 내용이 있는 초안을 닫으면 패널 안에서 `작성 중인 내용을 버릴까요?`를 묻는다. Esc는 포커스가 패널 안에 있을 때만 받고, 닫히면 포커스가 트리거로 돌아간다. 모달이 열리면 맨 위 포커스·Esc는 모달이 갖는다. 열 때 초안이 없으면 Context를 고정하고(초안이 남아 있으면 같은 고정 Context·같은 내용 인스턴스를 다시 보인다), 칩을 지우면 칩 목록과 첨부 주소(`href`)가 그 칩의 키를 함께 뺀다 — 주소는 고정한 원본 Context와 page 쌍에서 남은 칩만으로 다시 만들고 `extras`는 붙이지 않는다. Kernel 세션이 바뀌거나 `vocCompose` 슬롯이 사라지면 고정 Context·초안을 버리고 닫힌 채 시작하며, 끝난 초안의 `Compose` 콜백(`onSubmitted`·`onCancel`·`onDirtyChange`)은 무시한다. 보이는 Correlation ID 칩은 Kernel이 읽는 값을 내기 전까지 고정하지 않는다([백로그](../../.planning/backlog.md)). 내용(#656, `@ap/menu-my-activity`의 `vocCompose` 구현)은 FeedbackOps 작성 화면이고, 남은 칩을 설명 끝 `화면 정보` 블록(굵은 문단·목록·`화면 열기` 링크)으로 붙인다([ADR-0045](../adr/0045-feedbackops-entry-link-mapping-and-scope.md) 개정). 에디터 첨부와 첨부 영역을 합쳐 10개를 넘으면 제출하지 않고 안내한다. 성공하면 내용이 `접수 완료: <VOC 번호>` 토스트를 내고 셸이 닫으며, 제출 중 401은 토스트 없이 세션 종료로 간다. 상세 슬롯과의 관계는 §13. `feedbackOps` 슬롯의 전체 링크는 레일 대신 사용자 메뉴에 그린다(구현 #594).

앱이 조립 때 주입하는 셸 슬롯은 `PlatformSlots`의 `contextBar`(PlatformPage가 페이지 머리 아래에 그린다), `topBarTools`(레일 아래 도구), `feedbackOps`(공간별 FeedbackOps 진입. `overall` 필드는 SDK 타입에 남아 있고 다른 앱이 쓸 수 있지만 이 앱은 늘 `null`이라 사용자 메뉴 `FeedbackOps 전체`는 없다, #764 p2. 진입 항목은 합 타입이다 — `{ key, label, href, icon }`은 FeedbackOps를 새 탭으로 열고(`href: null`은 비활성), `{ key, label, menuId, page?, icon }`은 등록된 메뉴를 같은 탭에서 연다: 셸이 `resolveLink(menuId, { global: emptyGlobal, page, returnTo: true })`로 풀고 `allowed`일 때만 그린다(전역 Context는 싣지 않고 `page`와 `returnTo`만, #760). 선택 `permission`은 블록 게이트로, 있으면 셸이 `can(permission)`일 때만 블록을 그린다(셸은 앱 권한 이름을 모른다, ADR-0081 결정 8). [ADR-0027](../adr/0027-feedbackops-stays-standalone-entry-links.md)·[ADR-0028](../adr/0028-workspace-shell-launcher-pinned-feedbackops-global-utilities.md)), `scopeControl`(`{ For(spaceId) }` — 사이드바 Scope 자리에 그 공간 전용 선택기 컴포넌트(`{ collapsed }`를 받음)를 돌려주고 `null`이면 분석 `ScopeSelector`를 그대로 쓴다. 슬롯인 이유: 공간의 목록 범위가 분석 Scope가 아닌 경우(예: FeedbackOps Managed System)에도 선택기는 §7의 사이드바 Scope 자리 하나에 두고 셸이 메뉴를 import하지 않으려는 것이다. 넘기지 않으면 모든 공간이 `ScopeSelector`를 쓴다, [ADR-0081](../adr/0081-feedbackops-operator-screens-platform-frame.md) 결정 4, #759). `plannedSpaces`(전환기의 `준비 중` 행 `{ id, label, subtitle?, icon }[]`), `boardEntry`(보드 지원 메뉴의 본 화면 페이지 머리 `⋯`에 PlatformPage가 덧붙이는 `분석 보드에 열기…` 항목, [16 §6](../design/analysis-board.md#6-메뉴-쪽-요구-decided) — 컴포넌트가 셸을 import하지 않도록 앱이 넘긴다. 슬롯이 없거나 메뉴가 보드를 지원하지 않거나 열 수 없거나 칸 안이면 항목도 `⋯`도 만들지 않는다. 항목의 대화상자는 `⋯` 메뉴가 닫혀도 남도록 머리가 들고 있다), `notifications`(`{ menuId, UnreadCount, Recent }` — 레일 `알림` 종과 플랫폼 메뉴 배지(전환기·플랫폼 사이드바). 셸이 버튼·팝오버 틀·배지·접근 이름을 그리고 슬롯은 건수(`children(count)` 렌더 함수, `null`이면 배지 없음)와 팝오버 본문(`Recent`)만 준다. 넘기지 않으면 종과 배지를 그리지 않는다. [ADR-0070](../adr/0070-global-features-platform-menu-and-voc-drawer.md) 결정 4, #652)다. `vocCompose`(`{ Compose }` — 레일 `VOC 등록` 드로어의 본문. 위치·고정 Context 칩·초안 유지·닫기 확인·Esc·포커스는 셸이, 폼과 제출은 슬롯이 가진다. `Compose`는 `{ context, onSubmitted, onCancel, onDirtyChange }`를 받고 `context`는 지우지 않은 칩 `items`와 그 칩으로 다시 만든 절대 주소 `href`(보드이거나 `menu` 칩을 지우면 null)와 기본값 전용 `spaceId`·`menuId`다. 슬롯인 이유: 셸은 메뉴를 import하지 않고([ADR-0071](../adr/0071-feedbackops-screen-bridge-and-api-fo-edge-prefix.md) 결정 6) 폼은 메뉴 패키지가 가진다. 넘기지 않으면 레일 버튼도 없다, [ADR-0070](../adr/0070-global-features-platform-menu-and-voc-drawer.md) 결정 5, #655). `homeTodo`(`{ Todo }` — 홈 `내 할 일` 구역. 홈 메뉴가 `usePlatform().homeTodo`로만 읽고(`MenuPlatform`으로 올린 필드, [ADR-0076](../adr/0076-kernel-host-entry-narrow-menu-platform.md)) 셸은 읽지 않는다. 메뉴끼리 import하지 않으려는 슬롯이다. `Todo`는 보일 것이 없으면 아무것도 그리지 않고, 넘기지 않으면 구역이 없다, [ADR-0070](../adr/0070-global-features-platform-menu-and-voc-drawer.md) 결정 8, #657). 앱이 `feedbackOps`를 넘기지 않거나 `overall`이 `null`이면 셸은 블록(또는 사용자 메뉴의 전체 링크)을 그리지 않는다. `plannedSpaces`는 아직 들어갈 수 없는 업무 시스템을 알리는 표시용이라 Registry에 넣지 않는다(공간·메뉴·권한이 없고 이동하지 않는다). 앱이 넘기지 않으면 전환기는 `준비 중` 영역을 그리지 않는다([ADR-0042](../adr/0042-system-switcher-and-system-owned-rail.md), 15 §3.2). 페이지는 `crumbs`로 현재 위치(부모 메뉴 뒤 추가 경로)를 확장할 수 있다. 사이드바 슬롯 둘(#761, Candidate): `navCounts`(`{ For(spaceId) }` — 그 공간 사이드바의 메뉴·하위 항목 건수 배지. `For`는 `children(counts)` 렌더 함수를 부르는 컴포넌트를 돌려주고 셸이 메뉴 목록 둘레에 한 번 그린다(`NotificationsSlot`과 같은 모양이라 공간을 바꿔도 훅 순서가 바뀌지 않는다). 키는 메뉴 행 `menuId`, 하위 항목 `` `${menuId}/${viewId}` ``이고 `null`이거나 없는 키는 배지가 없다. 건수는 접근 이름에 들어가며(`수신함, 48건` — `unreadNamed`와 다른 문구) 접힌 점은 그리지 않는다. 읽지 않음 알림 배지 동작은 그대로다)와 `spaceNavSection`(`{ For(spaceId) }` → `{ label, Body } | null` — `주 메뉴` 다음, 즐겨찾기 앞의 그 공간 구역. 펼친 사이드바만, 셸이 `<section aria-label>`와 즐겨찾기와 같은 제목 모양을 그리고 `Body`는 props 없이 `usePlatform().route`로 자기 표면을 고른다). 두 `For`가 돌려주는 컴포넌트는 모듈 수준(안정된 정체성)이어야 한다 — `scopeControl`과 같다. 슬롯인 이유: 셸은 메뉴를 모르고(ADR-0052), FeedbackOps가 첫 사용자다. 넘기지 않으면 오늘의 사이드바 그대로다. `VocComposeContext.carried`는 고정한 화면의 공간 `carriedPageKeys` 값(없으면 빈 객체, 칩을 지운 키 포함, 첨부하지 않음 — 기본값 전용)이다. 새 슬롯은 이 절에 근거를 먼저 적는다.

### 이유

메뉴가 수십 개로 늘어나면 화면 자체보다 다음 문제가 먼저 발생한다.

- Action 위치 불일치
- Filter 위치 불일치
- Export 버튼 중복
- Help/설명 위치 불일치
- Data Freshness 표기 방식 불일치

Shell Slot은 이를 방지하는 플랫폼 계약이다.

---

## 12. Canonical Page Archetypes

플랫폼이 처음부터 모든 화면을 자유롭게 만들게 하지 않는다.

초기에는 아래 Archetype을 제공하고, 실제 반복이 확인되면 추가한다.

### 12.1 Overview

사용 목적: 상태 요약 + 다음 행동 진입.

```text
Page Header
Global Context
Primary KPI / Summary
Main Trend or Status
Attention List
Data Trust
```

### 12.2 Analysis Workspace

사용 목적: 조건 설정 → 시각화 → 선택 → Drill-down → Detail 검증.

```text
Page Header
Global Context
KPI Summary
Primary Chart
Selection / Annotation
Breakdown Table
Data Trust
```

### 12.3 Management

사용 목적: Master / 기준정보 / 사용자 / 설정 관리.

```text
Page Header
Search + Filter
Data Table
Selection Actions
Detail Drawer
History / Audit
```

### 12.4 Catalog

사용 목적: Metric처럼 정의·버전·사용처가 중요한 객체.

```text
Catalog List
Definition Detail
Version
Ownership
Coverage
Usage / Dependency
History
```

### 12.5 Workflow

사용 목적: VOC처럼 상태 전이가 있는 객체.

```text
Queue/List
Status/Priority/Owner Filter
Detail
Timeline
Comments
Related Context
```

Domain 메뉴는 가능하면 이 Archetype을 조합하고, 새로운 Page Type을 만들 때는 기존 패턴으로 표현할 수 없는 이유를 기록한다.

### 12.6 pageType의 현재 계약과 레이아웃 슬롯 (#104, #156)

**지금 pageType이 강제하는 것:** manifest의 `pageType`(5종 중 하나)과, 생성기(`pnpm gen:menu --page-type`)가 만드는 화면 뼈대의 콘텐츠 슬롯(위 12.1–12.5의 슬롯 이름, 읽는 순서 그대로)이다. Page Header·Global Context는 셸 슬롯(§8)이라 `PlatformPage`·셸이 이미 그리므로 뼈대에 다시 넣지 않는다. Data Trust는 12.1·12.2가 슬롯으로 적으므로 뼈대에 `trust` 슬롯으로 넣는다 — `PlatformPage`는 소비자가 넘긴 `dataTrustSummary`만 그리므로 신뢰 정보를 가진 화면이 그 슬롯을 채워야 한다. 슬롯 이름은 12.1–12.5의 영문 표기 그대로다. Management 공통 레이아웃은 `ManagementLayout`, Analysis 공통 레이아웃은 `AnalysisLayout`으로 제공한다. Management 뼈대는 filter·table 자리표시를 공통 레이아웃 안에, actions·drawer·history를 레이아웃 아래에 렌더한다. Analysis 뼈대는 kpi·chart·breakdown 자리표시를 공통 레이아웃 안에 렌더하며, annotation은 chart 노드 안에서 chart 자리표시 바로 뒤에, trust는 레이아웃 아래에 두어 kpi → chart → annotation → breakdown → trust 읽는 순서를 유지한다. 나머지 archetype 뼈대는 점선 구획으로 렌더한다.

**Management — Decided ([ADR-0022](../adr/0022-management-filter-rail-analysis-two-column.md)):** `ManagementLayout`은 `filter`/`table`/`drawer` 슬롯을 제공한다. 자기 폭 960px 이상에서는 260px 왼쪽 필터 레일과 표를 16px 간격으로 나란히 둔다. 레일은 페이지 sticky 머리 아래에 머물고 본문만 스크롤한다. 접기·펼치기와 공통 접힘 기억을 제공하며, 접힘·좁음에서는 표 툴바의 `필터 · N` 버튼(적용 수 0이면 숫자 생략)으로 접근한다. 좁음에서는 팝오버로 필터를 편집하며 접힘 기억을 바꾸지 않는다. 필터 필드는 [PageFilterBar](../adr/0016-page-filter-bar.md)의 column 배치로 소비하고, 상세는 셸 슬롯(ADR-0013)에 둔다. 드로어 열림은 URL page key(§6.1)다. **필터 적용 (Decided, [ADR-0037](../adr/0037-table-filter-consistency.md)):** 관리 화면 필터는 텍스트와 Select 모두 초안이고 `적용`(`적용 (n)`: 적용된 값과 다른 필드 수, 바뀐 것이 없으면 꺼짐)으로 `setPage` 한 번에 반영한다. 초안은 `ManagementLayout` 위의 화면이 소유해 레일·팝오버 이동과 접힘에서도 남고, 적용된 URL 값이 바뀌면(이동·뒤로/앞으로·초기화) 초안을 다시 맞춘다. 접힌·좁은 `필터 · N` 버튼에는 `미적용 n` 글 표식과 "적용된 필터 N개, 미적용 변경 n개" 설명이 붙고, 레일 머리에는 `· 미적용 변경 n개`가 붙는다. `필터 초기화`는 적용된 필터가 있을 때만 보인다. 카탈로그·분석 막대의 필터는 즉시 반영을 유지한다.

**Analysis — Decided ([ADR-0022](../adr/0022-management-filter-rail-analysis-two-column.md)):** `AnalysisLayout`은 `kpi`/`chart`/`breakdown` 슬롯을 KPI 띠·차트·분해 표 순서로 16px 간격으로 배치한다. 기본 `density: 'regular'`에서는 자기 폭 960px 이상이고 펼친 차트가 2개 이상이면 차트는 2열이며 홀수 개의 마지막 차트는 전체 폭을 쓴다. 좁거나 펼친 차트가 하나면 1열이다. 같은 행의 차트는 머리·범례 높이를 공유하여 그림 영역 윗변을 맞추고 카드가 행 높이를 채운다. KPI·분해 표는 전체 폭이다. KPI 띠·각 차트·분해 표를 각각 접을 수 있으며 접은 단위는 배치에서 빠지고 맨 위 “접힌 항목” 칩으로 원래 순서에 복원한다. 접으면 칩으로, 펼치면 접기 버튼으로 포커스가 이동한다. 접힌 단위 id는 메뉴별 localStorage `platform:analysis-collapsed:<menuId>`에 기억하고 모르는 id는 무시한다. 조회 중단은 보장하지 않으며 펼칠 때 차트·표 로컬 상태는 초기화될 수 있다. 사내에서 분석 메뉴를 새로 만드는 플랫폼 목적에 따라 사용자 결정으로 §24의 반복 기준(소비자 2–3곳)보다 먼저 공통 레이아웃으로 올린다.

**크기·밀도 선택지 (Decided, #547):** 기본 2열(A)은 그대로이며, 차트 섹션의 `span: 'full'`은 열 수와 무관하게 행 전체를 쓰는 hero(B)다. `AnalysisLayout`의 `density: 'compact'`(C)는 자기 폭 640px 미만 1열, 640px 이상 2열, 960px 이상 3열, 1280px 이상 4열이고 마지막 홀수 차트를 늘리지 않는다. 명시한 full 섹션은 compact에서도 전체 열을 쓴다. 읽는 순서를 유지하며 빈 칸을 앞선 항목으로 메우지 않는다. 같은 행은 머리·범례와 본문의 두 행을 공유하고 그림 영역 윗변·최소 폭 보호, KPI·분해 표 전체 폭, 접기·복원 순서·포커스·메뉴별 기억은 모든 밀도에서 유지한다.

`AnalysisChart`·`AnalysisChartFrame`의 `size`는 명시한 값 → 차트 섹션의 명시한 full이면 hero → compact 레이아웃이면 compact → regular 순서로 정한다(KPI·분해 표·독립 차트는 상속하지 않는다). 그림 기본 높이는 hero 360px, compact 200px, regular는 각각 280px·260px다. 명시한 `height`는 그림 높이만 덮어쓰며 상속한 compact 콘텐츠 처리는 유지한다. compact는 ReactNode 설명을 이름 있는 정보 버튼의 hover·키보드 포커스 Tooltip으로 제공하고 지표 버전은 계속 표시한다. 범례 글자는 `text-tiny`로 줄이되 기호·선 패턴·Compare 기간 구분과 동작 이름·보이는 글자는 유지한다. 크기·밀도 변경은 차트 로컬 상태와 포커스를 보존하며 접어서 언마운트하는 기존 의미는 그대로다. 모든 크기에서 §16 상호작용과 §26 접근성 계약을 따른다.

`size="fill"`의 바닥은 기본 320px이고 `AnalysisChartFrame`의 `fillMin`으로 160px까지 낮출 수 있다(§12.8 높이 채움, §16). `AnalysisChart`는 320px 그대로다.

승격 판단은 §24(실제 소비자 2–3곳 반복)를 따르고, 패턴별 소비자 현황은 이슈 #104·#156에서 추적한다.

### 12.7 드릴다운 레이아웃 (Decided, [ADR-0025](../adr/0025-drilldown-level-page-keys-path-bar-layout.md))

단계 이동이 함께 지우는 page key(`drill.resetKeys`)의 규칙은 [§6.4](kernel.md#64-url-계약-decided-필드명enum-문자열은-candidate)가 소유한다.

`DrillLayout`은 페이지 본문 맨 위에 경로 바(`DrillPath`)를 두고 그 아래에 현재 단계의 본문을 그린다. `DrillLayout`은 단계마다 본문에 key를 주거나 본문을 다시 마운트하지 않는다. 단계별 본문은 메뉴가 정하고, SDK는 앞 단계 본문을 스스로 남기지 않는다. 0단계(단계 키 없음)에서는 경로 바를 숨기고 메뉴의 요약 본문을 그대로 둔다. 형식 오류(§6.4)와 결과에 없는 값은 `DrillLayout`이 본문 자리에 명시적 상태로 그린다.

- 경로 바는 `전체 › <단계 이름>: <값> › …` 칩이고 마지막 칩이 현재 단계(`aria-current="step"`)다. 앞 칩을 누르면 그 단계로 올라간다. 칩이 5개 이상(깊이 4 이상)이면 `전체`와 마지막 2개만 두고 가운데를 `…` 메뉴로 접는다.
- 메뉴가 같은 단계의 다른 값 목록을 주면 그 칩 옆 ▾ 메뉴로 바로 바꾼다(형제 비교).
- 경로 바는 `PlatformPage`의 고정 breadcrumb(메뉴 위치)과도, 다른 메뉴로 돌아가는 복귀 버튼(§22)과도 다른 요소다.
- 단계 진입은 행 끝 들어가기 버튼(접근 이름 `<값> 들어가기`)처럼 눈에 보이는 동작으로 한다. 메뉴가 §16의 `pointActivation`을 선택하고 키보드로 같은 동작을 실행할 수 있으면 차트 지점 활성화로도 진입할 수 있다. 행 전체 클릭은 진입 동작으로 쓰지 않는다(교차 필터와 구분).
- 객체 하나인 마지막 단계는 오른쪽 상세 슬롯(ADR-0013)으로 연다. 슬롯을 닫으면 바로 앞 단계로 올라간다.
- 메뉴가 **현재 단계 본문의 일부로 선언한** 부모 맥락 패널은 허용한다(예: 3단계에서 선택한 Motion 옆에 그 Module의 Motion 전체를 보인다). `DrillLayout`은 단계마다 본문에 key를 주거나 다시 마운트하지 않으며, 단계별 본문은 메뉴가 정한다. 메뉴가 단계가 바뀌어도 같은 자리에 선언한 맥락 패널은 인스턴스·선택·스크롤을 유지한다. SDK는 앞 단계 본문을 스스로 남기지 않는다([ADR-0078](../adr/0078-hw-time-layout-recipes.md)).
- `DrillPath`·`DrillLayout`의 선택 `summary`([ADR-0078](../adr/0078-hw-time-layout-recipes.md))는 경로 바와 같은 줄에 한 줄 요약을 둔다(경로 바가 길어 폭이 모자라면 요약이 경로 바 아래 자기 줄로 내려가며 사라지지 않는다). `<nav>` 목록 밖의 형제이며, `summary` prop을 넘기는 한(값이 `null`이어도, 조회 중에도) 바깥 래퍼가 같아 요약이 늦게 와도 `<nav>`와 그 포커스가 유지된다(prop을 아예 넘기지 않는 소비자는 래퍼 없는 `<nav>` 그대로), 문자열이면 말줄임표로 줄이고 전체 문장을 `title`에 담으며, ReactNode이면 그 노드가 자기 `title`을 가진다. 0단계에서는 경로 바처럼 숨기고, 정적 텍스트이므로 라이브 리전이 아니다(단계 이동 안내는 §26 포커스 규칙이 맡는다).

- `DrillLayout`의 선택 `fill`(`QueryView`의 선택 `fill`과 함께)은 부모 높이를 채우는 열을 만든다. 래퍼는 `flex min-h-0 flex-1 flex-col`, 본문 영역은 `min-h-0 flex-1`이고 경로 바·요약은 스크롤 밖에 남는다. 없으면 출력은 이전과 같다(`space-y-4`). `PlatformPage layout="fill"` 안에서 `size="fill"` 차트가 정해진 높이를 받게 하는 용도다.

### 12.8 PanelWorkspace (Decided, [ADR-0067](../adr/0067-dockview-layout-engine-board-v2.md) 결정 3–9·18–22)

패널이 4개 이상인 밀집 분석 메뉴가 쓰는 선택 레이아웃이다. 메뉴가 패널·프리셋·기본 패널을 선언하고, 탭·끌기·나누기·최대화·숨긴 패널 목록·기본 배치·브라우저 로컬 선호는 플랫폼이 소유한다. 그 밖의 메뉴는 `AnalysisLayout`(§12.6)을 그대로 쓴다. `@ap/components` 루트의 `PanelWorkspace`이고(메뉴는 `@ap/components/dock`을 import할 수 없다), 두 번째 실제 소비자(HW Time 비교·개요, #690)가 쓰면서 공개 API는 Decided다(ADR-0067 결정 22). 휠: 탭 줄은 넘치지 않으면 세로 휠을 바깥으로 넘기고([16 §4.1](../design/analysis-board.md)), 그림은 수정키 없는 휠을 막지 않으며(§16), 패널 안 표 행 영역은 끝에서 휠을 넘긴다(§15)(#700).

- **props:** `panels`(`id`·`title`·`render`·`primary?`·`minWidth?`·`minHeight?` — 기본 패널은 정확히 하나, 숨길 수 없고 비는 자리를 먼저 얻는다), `presets`(`id`·`label`·`layout`: 그룹 `{type:'group', panels, active?}` 또는 `{type:'branch', dir, sizes(비율), children}`)·`initialPreset`·`compactPreset?`·`persistKey`·`label`·`compactBelow?`(기본 900px, 컨테이너 폭). 패널 id와 `persistKey`는 `^[a-z][a-z0-9._-]{0,63}$` 정적 식별자다(저장 키에 데이터 값이 들어가지 않게).
- **`initialMode` (#690, [ADR-0077](../adr/0077-workspace-stack-mode-rows-keep-own-height.md) 보충):** 선택 prop `'fit' | 'stack'`(기본 `fit`). 아무도 만지지 않은 작업 영역(저장값 없음, 또는 읽을 수 없는 저장값)의 높이 방식만 정한다. 저장된 선호는 `화면 맞춤`이어도 항상 이기고, `mode`가 없는 옛 저장값은 `initialMode`가 아니라 화면 맞춤으로 읽는다(사용자가 정한 방식은 사용자 것이다). `stack`의 줄 px는 저장된 `stack` 모드와 같은 경로로 한 번 잰다. `compactBelow` 미만에서는 화면 맞춤이 보이고 저장값은 그대로다. `기본 배치`는 사용자의 현재 높이 방식을 바꾸지 않는다(`initialMode`로도 `fit`으로도 되돌리지 않는다 — 줄 px만 프리셋에서 다시 구한다).
- **`revealRequest` (#690):** 선택 prop `{ panelId, seq } | null`. `seq`가 바뀌면 `panelId`를 자기 그룹의 활성 탭으로 만든다(순수 `activatePanel`, 사용자의 탭 선택과 같이 저장). 메뉴는 상태로 몬다(`setReveal({ panelId: 'trend', seq: n + 1 })`). 규칙: (1) **숨긴 패널은 다시 보이게 하지 않는다** — 숨기기는 사용자의 결정이고 알림은 패널 배지가 맡는다. 아무 일도 없다. (2) **다른 패널의 최대화는 끝내지 않는다** — 사용자가 고른 집중이다. 최대화 중에는 아무 일도 없고 대기열에 넣지 않는다(최대화가 끝나도 적용되지 않는다). (3) **포커스는 움직이지 않는다.** (4) 모르는 `panelId`는 아무 일도 없고 개발 중에는 진단을 남긴다. (5) 같은 `seq` 반복과 `null`은 아무 일도 없고, 마운트 때 이미 있던 요청은 적용하지 않는다. 리마운트·재조회는 없다. `WorkspaceCommandsHost` 안에서도 같고 명령 목록은 바뀌지 않는다. 좁은 폭(compact 배치·한 묶음 표시)에서도 같다: 대상 패널이 보이는 탭이 되고(메모리 선택, 이후 사용자 선택이 이긴다), 숨긴 패널은 전달되지 않는다.
- **패널 배지 `badge` (#690):** 패널의 선택 필드 `{ count?, tone?: 'neutral' | 'warning', description: Text }`. 배경 탭이나 숨긴 패널이 "무언가 있다"(`추세 · 2 rows added`, 일부 데이터 없음)를 알리는 자리다. 탭 안에 `StatusBadge` 어휘로 그리고(99 초과는 `99+`, `warning`은 삼각형 아이콘을 더해 색만으로 알리지 않는다), 배지는 접근성 트리에서 빼서 탭 이름은 패널 제목 그대로다 — 제목에는 배지를 붙이지 않는다(탭 이름·경계 이름·명령 이름이 제목을 쓴다). `description`은 탭의 `aria-description`으로 읽고 라이브 영역으로 알리지 않는다. 좁은 폭의 배경 탭에서도 남는다(`data-dock-tab-shrinkable`을 붙이지 않는다). 숨긴 패널은 `warning` 배지가 하나라도 있으면 도구줄 `숨긴 패널 n` 버튼에 경고 표시를 달고(이름은 그대로, 설명에 경고 문구), 각 `다시 보기` 항목(도구줄·보드 호스트 메뉴, `WorkspaceCommand.description`)이 그 패널의 `description`을 함께 보인다. `badge`를 바꿔도 패널은 리마운트되지 않는다. `badge`가 없으면 탭 마크업은 그대로다.
- **리마운트 0:** 프리셋 전환·`기본 배치`·이동·나누기·탭 선택·최대화는 이미 마운트된 패널을 재배치하므로 상태와 조회가 유지된다. 숨긴 패널의 하위 트리는 내려가므로 숨겨도 살아야 하는 상태는 workspace 위에 둔다.
- **도구줄 또는 호스트 명령:** 단독이면 프리셋 선택(`SegmentedRadio`)·높이 방식 선택(`화면 맞춤`/`아래로 쌓기`, 아래 "높이 방식")·`숨긴 패널 n`(0이면 꺼짐, 누르면 다시 보기 목록)·`기본 배치` 한 줄이 위에 붙는다. `WorkspaceCommandsHost`(`@ap/components/dock`, 호스트 전용) 안이면 도구줄이 없고 같은 명령이 `useWorkspaceCommands()`로 호스트의 메뉴(보드 칸 메뉴)에 간다. 라디오 명령은 `WorkspaceCommand.group`(없으면 프리셋, `'mode'`는 높이 방식)별로 독립 묶음이 되고 도구줄과 칸 메뉴 모두 묶음마다 하나의 라디오 그룹·체크 하나로 그린다(`radioGroupsOf`). 패널 그룹 띠는 보드의 확정 띠(칩 C)와 같다: 최대화 토글과 `<제목> 동작` `⋯`(최대화·복원, 그룹에 패널 둘 이상이면 나누기, `<제목> 묶음으로 옮기기`, `숨기기` — 기본 패널은 없음). 메뉴 항목 계산은 보드와 공유하는 `dockLayoutMenu`다. 이동·나누기·숨기기·다시 보기를 메뉴로 실행하면 메뉴가 닫힌 뒤 포커스는 옮긴 패널의 탭으로(숨기기는 그 그룹에서 활성이 된 탭, 그룹이 없어졌으면 기본 패널의 탭) 간다. `다시 보기`는 기본 패널을 가리지 않는다: 현재 프리셋에서 같은 그룹이던 패널 중 보이는 것의 그룹(그 그룹이 기본 패널의 그룹이면 기본 패널이 활성으로 남는다) → 없으면 읽기 순서 첫 비기본 그룹 → 그것도 없으면 기본 패널 오른쪽 분할. 보드 칸 메뉴에서는 작업 영역 묶음 위에 `화면 배치` 이름표(항목 아님)가 붙는다.
- **좁은 폭:** `compactBelow`보다 좁으면 `compactPreset` 배치를 메모리에서만 그린다(그 사이 한 변경은 저장하지 않고 넓어지면 저장된 배치로 돌아온다). `compactPreset`이 없으면 한 탭 그룹으로 쌓아 보이기만 한다. 쌓여 보이는 동안 프리셋 선택은 꺼지고(`title`·`aria-describedby`·명령의 `disabled`) 이유 `좁은 폭에서는 한 묶음으로 보입니다`를 보인다. `숨긴 패널`·`기본 배치`는 그대로 쓴다. 패널의 `minWidth`·`minHeight`는 separator의 방향키·Home/End 한계에도 쓰인다(묶음의 한계는 탭 중 가장 큰 값).
- **로컬 선호:** `platform:workspace:v1:<사용자>:<메뉴>:<persistKey>`(`{v, preset, layout, hidden, mode?, rows?}`; 최대화는 저장하지 않음. `mode`는 `'stack'`이거나 없음(= 화면 맞춤), `rows`는 쌓기의 최상위 줄 px — 아래 "높이 방식"). 마운트 때 한 번 읽고(조회 없음) 변경 300ms 뒤 쓰며 언마운트·`pagehide`에 즉시 쓴다. 저장소 접근은 모두 try/catch이고 사용자·메뉴가 없으면 메모리에만 둔다. 같은 메뉴·키를 보이는 두 칸은 하나를 공유하고 마지막 쓴 쪽이 이긴다. 깨진 값은 고쳐서 쓴다(`normalizeWorkspaceState`).
- **높이 방식 (Decided, 사용자 2026-10-23, #686 C안, [ADR-0077](../adr/0077-workspace-stack-mode-rows-keep-own-height.md)):** 라디오 묶음 `높이 방식`(`화면 맞춤` 기본 / `아래로 쌓기`)을 도구줄과 호스트 `⋯` 메뉴에 둔다. 작업 영역마다 고르고 레이아웃과 함께 저장한다. 모드를 바꿔도 패널은 리마운트되지 않고 조회도 없다.
  - **화면 맞춤:** 위 "높이 채움" 그대로다.
  - **줄 모델(쌓기):** 최상위 레이아웃은 줄의 열이다(루트가 열이 아니면 루트 전체가 한 줄). 줄마다 px 높이를 갖고 페이지가 스크롤된다. 작업 영역은 엔진 상자(줄 px의 합 + 줄 사이 간격, 아래 "경계")와 그 아래 띠(`여기에 놓으면 아래에 새 줄`, 72px, 위 여백 8px)로 이뤄진다. 줄 px가 원본이고 최상위 비율은 그 투영이다. 쌓기로 들어갈 때 줄 px = `round(비율 × max(화면 맞춤 높이, 줄 수 × 360))`(화면 맞춤 높이 = 맞춤 모드가 레이아웃에 주는 높이, 직접 잰 값 또는 마지막으로 잰 값; 쌓기만 본 적 없으면 보이는 영역 − 도구줄로 가늠). 줄 최소 = `max(200, 줄 안 재귀 최소 + 그룹마다 띠 40px)`, 줄 최대 = 보이는 영역 높이(가장 가까운 스크롤 컨테이너 높이 − 같은 페이지에서 그 위에 고정되는 머리 `[data-page-sticky-header]` 높이 − 접힌 조회 조건 줄 `[data-query-bar][data-query-bar-collapsed]` 높이(Apply 페이지는 이 줄이 머리 밖에서 따로 고정된다, 펼치고 접으면 최대도 따라 바뀐다), 보드 칸에서는 둘 다 없는 칸 본문 높이; `visibleArea.ts`, `--page-sticky-offset`과 같은 합). 줄의 최소가 보이는 영역보다 크면 최소를 지키고 넘친다(예외). 들어갈 때·복원(보이는 영역을 처음 잰 순간 한 번)·`기본 배치`·새 줄·크기 조절은 [최소, 최대]로 맞추지만 그 뒤 창 크기 변화는 저장된 px를 다시 쓰지 않는다. 그래서 보이는 영역이 줄어든 뒤의 줄은 최대보다 클 수 있고, 그 줄의 경계는 실제 한계로 `max(줄 최대, 지금 px)`를 쓴다(`aria-valuemax`, End, 끌기 한계가 같다). 줄이기는 언제든 된다. `기본 배치`·프리셋은 쌓기에서도 마지막 화면 맞춤 높이로 줄 px를 다시 정하므로 반복해도 높이가 쌓이지 않는다.
  - **경계:** 최상위 줄마다 그 아래에 `role="separator"`가 있다(마지막 줄 아래 포함). 이름은 줄 사이면 `<위 줄 제목> · <아래 줄 제목> 사이 높이`, 마지막 줄 아래면 `<위 패널 제목> 아래 높이`다. 끌기(포인터)와 키가 그 위 줄만 바꾸고 아래 줄은 px를 지키며 작업 영역이 같은 만큼 늘거나 준다. 방향키 ±24px, Home=최소, End=최대, `aria-valuenow`·`min`·`max`는 px다. 엔진 자체의 최상위 가로 sash는 이 모드에서 비활성이다(줄 사이에서 높이를 주고받지 않음). 줄 안 경계는 오늘처럼 비율·5%다. 끄는 도중 건드리지 않은 줄의 px는 변하지 않는다(높이와 비율을 한 프레임에 적용). 작업 영역 상자는 줄 px의 합에 엔진이 최상위 줄 사이에 두는 간격(테마 gap 6px × (줄 수 − 1))을 더한 높이라서 각 그룹이 자기 px로 그려진다. 엔진의 최상위 sash 비활성은 작업 영역 자신의 격자에만 적용되고 패널 안에 중첩된 레이아웃의 sash는 그대로다.
  - **아래 새 줄:** 마지막 줄 아래 띠에 탭 하나를 놓거나(묶음 전체·다른 작업 영역/보드의 탭·바깥 데이터는 거절) 그룹 `⋯`의 `아래 새 줄로 옮기기`(이미 마지막 줄에 혼자면 숨김)를 쓰면 그 패널이 360px 새 마지막 줄이 된다(경계 안으로 맞춤). 줄의 마지막 패널이 나가면(이동·숨김) 줄이 사라지고 다른 줄은 px를 지킨다. 줄은 출신으로 맞춘다: 편집이 만든 줄(새 줄로 옮기기·띠에 놓기·위/아래로 나누기, 엔진 끌기로 그룹 가장자리에 놓아 혼자 선 탭)은 항상 새 줄(360px)이고 살아남은 줄의 px를 가져가지 않으며, 같은 패널 구성이 먼저, 그다음 겹침이 큰 순서로 이어받는다. 띠가 하나이므로 놓는 탭이 끌린 것인 경우 띠는 그 드래그를 소비해 위쪽 레이아웃(보드)이 같은 놓기를 받지 않는다. 다시 보기는 줄을 만들지 않는다(기존 규칙대로 묶음에 붙음).
  - **저장:** `v:1`·키 그대로, 선택 필드 `mode?: 'stack'`·`rows?: number[]`. 정규화는 `mode`가 `'stack'`이 아니면 화면 맞춤으로 읽고 `rows`를 버리며, `rows`가 유한한 양수가 아니거나 최상위 줄 수와 다르면 `rows`만 버리고(다시 잰다) 각 줄을 최소로 올린다. 던지지 않는다.
  - **좁은 폭:** `compactBelow` 미만(compact 배치 또는 한 묶음 표시)에서는 쌓기가 꺼져 화면 맞춤으로 보이고 페이지 흐름·띠도 없으며 모드 라디오는 이유(`좁은 폭에서는 화면 맞춤으로 보입니다`)와 함께 비활성이다. 저장된 모드와 줄 px는 compact 편집에 덮이지 않고 넓어지면 돌아온다.
  - **페이지:** `PlatformPage layout="fill"`에서 쌓기 작업 영역이 보이는 동안 페이지는 흐름 크기(루트 `min-h-full`, 본문 슬롯은 작업 영역 크기)로 바뀌어 main이 스크롤된다. 머리 접기·얇은 띠는 `layout="fill"` 조건 그대로 켜 둔다(ADR-0075). 연결은 내부 등록 컨텍스트이며(공개 prop 없음) 가장 가까운 페이지가 받고, 작업 영역이 쌓기를 멈추거나 사라지면 고정 fill로 돌아온다. dock 패널은 이 연결의 경계다: 패널 안에서 렌더되는 내용은 바깥 페이지의 등록을 받지 않고(안쪽 `PlatformPage`는 자기 것을 낸다), 패널 안 쌓기 작업 영역은 바깥 fill 페이지의 크기를 바꾸지 못한다. 보드 칸 안에서는 칸 본문(이미 `overflow-auto`)이 스크롤된다.
  - **이 단계에서 하지 않는 것(#701, `.planning/backlog.md`):** 포커스·이동한 줄 스크롤, 보이는 영역으로 최대화 한계, 끌기 중 가장자리 자동 스크롤, 끌기 중 띠 고정, 패널 선호 높이·표 채움, 기본값 전환. 쌓기의 최대화는 오늘처럼 쌓기 전체를 채운다.

- **높이 채움:** `PlatformPage layout="fill"`이면 페이지가 컨테이너(본 화면 main, 보드 칸 본문) 높이를 채우고 본문이 머리 아래 남은 높이를 차지하되 최소 520px(그림 300px + 카드 머리)을 지킨다(본문 슬롯 `data-platform-page-fill`은 flex 열이라 `flex-1`인 자식, 예: `DrillLayout fill`이 남은 높이를 받는다. 그 안의 `PlatformDataTable` 행 영역은 늘어나지 않고 `tableFit`이 정하는 상한까지만 커진다 — 본문의 마지막 자식이 이 슬롯이고 표가 그 안에 있으면 `tableFit`은 슬롯의 늘어난 아래 끝이 아니라 표 아래로 이어지는 내용(페이저·형제·패딩)의 자연 끝을 쓰므로, 상한이 슬롯의 남은 높이를 표 아래 내용으로 세어 줄지 않는다. 표가 슬롯 안에 없는 fill 페이지와 flow 페이지의 상한은 그대로다(보드 칸에 연 fill 페이지도 같은 규칙을 따른다), #690k; 머리가 펼쳐져 뷰포트를 채우면 작업 영역이 찌그러지는 대신 페이지가 스크롤된다 — 머리는 아래 접기로 한 줄이 기본이며, 사용자가 펼치거나 펼침 선호를 복원하거나 잘못된 페이지 키 때문에 처음부터 펼쳐질 때 생긴다; `data-page-layout="fill"`, 기본 `flow`는 그대로). 차트의 `size="fill"`은 그림 상자가 컨테이너가 남기는 높이(최소 기본 320px, `AnalysisChartFrame`의 선택 `fillMin`으로 낮출 수 있고 바닥은 160px — 그 아래에서는 축과 라벨을 읽을 수 없어 160으로 올리고 개발 중 경고한다, §16 — 남는 높이가 모자라면 그림 상자 안이 아니라 카드가 커지고 패널 본문이 스크롤된다, 측정 전에는 해석된 바닥 — 기본 320px, `fillMin`을 주면 그 값(160 이상) — 단 TopN 막대는 측정 전 `max(120, 행 수·28+24)`px를 쓰고 측정되면 같은 규칙으로 채운다)를 쓴다. 패널 안에서는 카드·차트 제목 `<h2>`가 탭과 겹치므로 시각적으로만 숨긴다(`sr-only`, 접근 이름 유지).

- **머리 한 줄 접기 (Decided, 사용자 2026-10-23, #680 B안, [ADR-0075](../adr/0075-page-head-one-line-fold-thin-outcome-strip.md)):** `layout="fill"` 페이지에 `contextExtension`이나 비지 않은 `contextNotes`가 있으면(게이트 없음) 머리 영역(안내 + 확장)이 접기를 갖는다. 둘 다 없으면 접기도 빈 줄도 그리지 않고, flow 페이지는 접기 없이 그대로다.
  - **접힌 줄(기본):** 왼쪽부터 `queryBarExtension.appliedPageSummary`의 요약 칩(없을 때만 `pageSummary` — 접힌 줄은 결과 위에 있어 초안 라벨이 결과를 설명하면 안 된다), 그리고 줄어들지 않고 잘리지 않는 `미적용 변경 있음`·`확인 필요 N`·`안내 N`·`펼치기`. 넘치면 칩 목록만 줄어든다. 칩은 항목 단위이고, 줄이 칩보다 좁으면 목록이 가로로 스크롤되되 스크롤바는 숨기고 넘칠 때만 오른쪽 가장자리에 페이드를 보인다 — 가장자리가 마지막 항목을 자를 수 있다. 전체 요약은 `title`이고 펼치기 버튼의 `aria-describedby`가 가리킨다(§13, ADR-0029).
  - **버튼:** 펼치기(보이는 글 `펼치기`, 접근 이름 `페이지 머리 펼치기`, `aria-expanded=false`, `aria-controls` → 머리 내용)와 접기(펼친 상태, 내용 아래 오른쪽 정렬, 보이는 글 `접기`, 접근 이름 `페이지 머리 접기`, `aria-expanded=true`). 누르면 포커스가 반대 토글로 간다.
  - **마운트 유지:** 접어도 머리 내용은 `hidden`으로 마운트돼 같은 id와 소비자 상태가 남는다. 토글은 안내하지 않고, 접힌 동안 요약·미적용·확인 필요 표식이 바뀌면 항상 마운트된 polite 영역이 한 번 안내한다(PageFilterBar와 같은 규칙).
  - **기본·기억:** fill 페이지의 기본은 접힘이고 메뉴별로 localStorage `platform:page-head-collapsed:<menuId>`(boolean JSON)에 기억한다. 보드 칸도 같은 접기를 그리고 같은 키를 공유한다.
  - **상태를 숨기지 않는다:** (1) 적용된 버킷·분포 칩은 `appliedPageSummary`로 접힌 줄에 칩으로 보인다. 그 해제(×)는 펼친 뒤에 닿는다. 칩 줄을 두 번 그리지 않는다. (2) 이 메뉴의 `pageKeys` 중 하나라도 초안과 적용이 다르면(`queryDraft.dirty`) `미적용 변경 있음`을 보인다 — 전역 Context 변경은 조회 바가 이미 보인다(`적용 안 된 변경 N개`). 즉시 반영 메뉴는 `dirty`가 비어 표식이 없다. (3) `queryBarExtension.issues`가 비지 않으면(잘못된 페이지 키) 접힌 줄에 `확인 필요 N`을 보이고 저장값과 무관하게 펼친 채 마운트한다(저장값은 덮어쓰지 않는다) — 본문 메시지가 가리키는 `페이지 조건 기본값`이 머리 안에 있기 때문이다. (4) Data Trust(머리)·조회 바·권한/Scope 게이트는 머리 영역 밖이라 그대로다. 응답 오류는 머리 영역 밖(§19)이다.
  - PageFilterBar의 `collapsible`(자기 접기)은 머리 안에서 그대로 쓴다(두 단계).

- **첫 소비자:** 사이클타임 드릴다운(`CycleTimeDrilldown`)이 `PanelWorkspace`(`persistKey="drilldown"`, 프리셋 `balanced`·`focus`·`column`(`세로`: 추세 / 요약 | 분포 / 느린 실행, 쌓기의 자연스러운 시작))를 쓴다(ADR-0067 3b, ADR-0077). `balanced`는 행 `[추세 68, 열[요약 38, 묶음[분포·느린 실행(분포가 앞) ] 62] 32]`로 추세가 작업 영역 전체 높이와 가장 넓은 폭을 갖고, `focus`는 추세 70 | 나머지 한 묶음 30이다. 엔진이 그룹 컨테이너에 다는 `region`·`aria-label`은 지워 패널 안 카드와 이름이 겹치지 않게 하고 그룹의 탭 패널은 탭 이름으로 읽힌다. 보드 칸 안에서는 도구줄 없이 프리셋·숨긴 패널 다시 보기·`기본 배치`가 칸 `⋯` 메뉴의 내용 그룹과 배치 그룹 사이에 붙는다.

---

## 25. Responsive Strategy

이 제품은 Desktop-first다. **MVP는 데스크톱 웹만 지원한다(Decided, 2026-09-27, [05](../overview/roadmap-and-open-questions.md#mvp-지원-환경--데스크톱-웹만-decided-2026-09-27)).** 아래 `< 1024px` 항목은 MVP 이후 과제다.

### ≥ 1440px

Full experience.

### 1024–1439px

- Sidebar collapse — 구현 현황: 1440px 미만은 기본 접힘(사용자가 저장한 선택이 있으면 그 값).
- Secondary panel Drawer 전환은 Candidate; DetailDrawer는 이 폭에서도 §13 고정 슬롯 유지
- Grid column 축소

### < 1024px

조회/간단 관리 중심으로 제한할 수 있다.

복잡한 분석 Workspace를 억지로 모바일 UX로 재설계하지 않는다.
