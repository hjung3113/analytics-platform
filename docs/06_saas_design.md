# 06. SaaS Design System & Platform UI Contract

> Status: Draft  
> Scope: Analytics Platform UI / Platform Shell / Extension Contract  
> Related: `00_overview.md`, `02_domain_menus.md`, `04_frontend_ui_ux.md`, `05_roadmap_and_open_questions.md`

## 1. 문서 목적

이 문서는 개별 메뉴의 화면 디자인을 정의하는 문서가 아니다.

이 프로젝트의 1차 목적은 **설비관리·분석·지표·VOC 같은 개별 기능을 만드는 것보다, 서로 다른 업무 메뉴가 같은 규칙으로 올라갈 수 있는 분석 플랫폼 자체를 만드는 것**이다.

따라서 UI 설계의 우선순위도 다음 순서를 따른다.

1. Platform Kernel
2. Platform-wide UX Contract
3. Menu Extension Contract
4. Shared Components / Patterns
5. Domain-specific Pages

개별 메뉴는 플랫폼을 검증하는 대표 Consumer다. 첫 분석 화면이나 설비관리 화면을 잘 만드는 것 자체가 성공 기준이 아니라, 그 과정에서 만든 계약을 두 번째·세 번째 메뉴가 재사용할 수 있어야 한다.

단, 플랫폼을 목표로 한다는 이유만으로 처음부터 범용 위젯 엔진·외부 플러그인 SDK·저코드 빌더를 만들지는 않는다. `05_roadmap_and_open_questions.md`의 Phase 4 원칙대로 **실제 메뉴 2~3개에서 반복이 확인된 책임만 플랫폼 기능으로 승격**한다.

---

## 2. Product Design Direction

이 플랫폼은 마케팅형 SaaS가 아니라 **고밀도 Enterprise Analytics / Operations SaaS**다.

시각적으로는 다음 성격을 결합한다.

| 영역 | 참고할 UX 성격 |
| --- | --- |
| Application Shell | 운영 SaaS처럼 빠른 탐색, 명확한 내비게이션 |
| Analytics | BI처럼 재현 가능한 필터·드릴다운·지표 문맥 |
| Time-series | Ops 도구처럼 시간범위·Brush·주석·상태 가시성 |
| Master Data | Admin 도구처럼 고밀도 Table·Drawer·Audit |

핵심 인상은 **Professional / Technical / Calm / Dense / Precise**다.

### 디자인 원칙

1. **Platform before Page** — 페이지마다 새 패턴을 만들지 않는다.
2. **Context First** — 현재 기간·설비·Lot·Metric Version·Scope를 항상 식별 가능하게 한다.
3. **State is Visible** — Freshness, Coverage, Permission Scope, Filter, Version을 숨기지 않는다.
4. **Dense, not Crowded** — 정보 밀도는 높게, 장식 밀도는 낮게 유지한다.
5. **Progressive Disclosure** — 세부 정보는 Drawer/Popover/Drill-through로 확장한다.
6. **Reproducible Navigation** — 화면 이동은 분석 문맥을 잃지 않아야 한다.
7. **Partial Failure Tolerance** — 한 위젯 실패가 전체 페이지 실패가 되지 않게 한다.
8. **No Silent State Change** — 사용자가 모르는 사이 필터·지표 버전·Scope가 바뀌지 않는다.

---

## 3. Platform UI Architecture

```text
┌───────────────────────────────────────────────────────────────┐
│                     Platform Kernel                           │
│                                                               │
│  App Shell / Auth Context / Menu Registry / Route Contract   │
│  Global Context / Permission Scope / Command Palette          │
│  Saved View / Data Trust / Audit-aware UX                     │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│                    Platform UI Services                       │
│                                                               │
│  Page Layout / Filter Bar / Data Table / Chart Frame          │
│  Detail Drawer / State Feedback / Export / Context Link       │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│                    Menu Extension Contract                    │
│                                                               │
│  manifest + route + permission + supported context            │
│  page actions + data trust + deep-link behavior               │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│                       Domain Menus                            │
│                                                               │
│  Equipment / Master Data / Analytics / Metrics / VOC / ...   │
└───────────────────────────────────────────────────────────────┘
```

페이지는 App Shell을 직접 수정하지 않는다. 플랫폼 기능은 개별 메뉴 import 관계를 알지 못해야 한다.

---

## 4. Platform Kernel Responsibilities

Platform Kernel이 소유해야 하는 UI 책임:

- Application Shell
- Menu Registry
- Route/Search Parameter Contract
- Global Context
- Permission / Scope Context
- Breadcrumb 생성
- Command Palette
- Favorite / Recent Menu
- Saved View 진입점
- Page-level Action Slot
- Data Trust 표시 표준
- 전역 Error Boundary / Correlation ID 표시
- Toast / Confirm / Modal infrastructure
- Theme / Design Token
- 공통 Keyboard Shortcut

### Kernel이 소유하지 않는 것

- Equipment-specific business logic
- 특정 지표 계산 로직
- 특정 분석 차트 configuration
- VOC 상태 전이 규칙
- 개별 메뉴만 사용하는 Form schema

Domain logic이 Kernel로 역류하지 않도록 한다.

---

## 5. Menu Extension Contract

초기에는 외부 설치형 플러그인이 아니라 **코드 내부 선언형 Menu Registry**로 시작한다.

개념적 manifest:

```ts
interface MenuManifest {
  id: string
  group: string
  title: string
  route: string
  icon?: string

  requiredPermissions: string[]
  requiredScopes?: string[]

  supportedContext: {
    timeRange?: boolean
    equipment?: boolean
    lot?: boolean
    process?: boolean
    metricVersion?: boolean
  }

  pageType: 'overview' | 'analysis' | 'management' | 'catalog' | 'workflow'

  capabilities?: {
    export?: boolean
    savedView?: boolean
    annotation?: boolean
    compare?: boolean
  }
}
```

정확한 TypeScript API는 구현 시 변경할 수 있지만 **메뉴가 자신의 기능을 선언하고 Shell이 이를 소비하는 방향**은 유지한다.

### 금지

- 신규 메뉴 추가 때 Sidebar JSX 직접 수정
- 메뉴마다 Breadcrumb 수동 구현
- 페이지마다 별도의 Date Picker 구현
- 페이지가 권한에 따라 메뉴 숨김 로직을 직접 구현
- 메뉴별 임의 query parameter 규칙 생성

---

## 6. Context Capability Contract

전역 Context를 모든 메뉴가 무조건 소비하는 것은 아니다.

각 메뉴는 어떤 Context를 지원하는지 선언한다.

예:

| Menu | Time | Equipment | Lot | Metric Version |
| --- | --- | --- | --- | --- |
| Equipment Master | △ | O | X | X |
| Occupancy Analysis | O | O | △ | O |
| Wafer Journey | O | O | O | △ |
| Metric Catalog | X | △ | X | O |
| VOC | △ | △ | △ | △ |

`O`: 직접 필터로 적용  
`△`: 전달/참조 가능하지만 직접 조회 필터는 아닐 수 있음  
`X`: 미지원

### 규칙

다른 메뉴에서 전달된 Context를 대상 메뉴가 지원하지 않으면 조용히 폐기하지 않는다.

예:

```text
Inherited context
Equipment: EQP-013
Lot: A1023   · Not used on this page
```

Global Context와 Page-local Filter를 같은 Chip 스타일로 혼용하지 않는다.

상태 계층은 다음처럼 분리한다.

1. **Global Context** — 메뉴 간 전달
2. **Page Filter** — 현재 메뉴 조회에만 적용
3. **Visualization State** — Zoom / Brush / Series visibility
4. **Persistent Annotation** — 저장되는 도메인 객체

`04_frontend_ui_ux.md`의 URL/deep-link 계약이 상세 규칙의 authoritative source다.

---

## 7. Application Shell

Desktop-first를 기본으로 한다.

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Product / Workspace     Site ▼    Search ⌘K        Help   User      │
├──────────────┬──────────────────────────────────────────────────────┤
│              │ Breadcrumb                                           │
│ Overview     │ Page Title                             Page Actions    │
│              ├──────────────────────────────────────────────────────┤
│ Equipment    │ Global Context Bar                                  │
│ Master Data  │ [Date] [Equipment] [Lot] [Scope]      Save View     │
│ Analytics    ├──────────────────────────────────────────────────────┤
│ Metrics      │                                                      │
│ Notice/VOC   │                   Page Content                       │
│ Admin        │                                                      │
│              │                                                      │
├──────────────┴──────────────────────────────────────────────────────┤
│ Data status / calculation basis / coverage                         │
└─────────────────────────────────────────────────────────────────────┘
```

### 권장 Baseline

```text
Sidebar expanded   240px
Sidebar collapsed   64px
Top header           56px
Page header          56~64px
Global context bar   48px
Content padding      24px
Section gap          24px
Component gap        12~16px
```

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
├─ contextExtension
├─ content
└─ dataTrustSummary
```

이 Slot 외의 위치에 페이지가 직접 전역 UI를 삽입하지 않는다.

### 이유

메뉴가 수십 개로 늘어나면 화면 자체보다 다음 문제가 먼저 발생한다.

- Action 위치 불일치
- Filter 위치 불일치
- Export 버튼 중복
- Help/설명 위치 불일치
- Data Freshness 표기 방식 불일치

Shell Slot은 이를 방지하는 플랫폼 계약이다.

---

## 9. Information Architecture

최상위 Navigation Group:

```text
Overview

Equipment
Master Data
Analytics
Metrics
Notice & VOC
Administration
```

정확한 그룹 명칭은 `02_domain_menus.md`와 최종 통일해야 한다.

Sidebar 기능:

- Collapse / Expand
- Search Menu
- Favorite
- Recent
- Permission-aware visibility
- Command Palette

메뉴가 늘어날수록 평면적인 Sidebar 확장은 금지한다.

---

## 10. Command Palette as Platform Navigation

메뉴 수가 증가하면 Sidebar만으로 탐색하지 않는다.

Command Palette는 플랫폼 공통 기능으로 둔다.

지원 후보:

```text
Go to Occupancy Analysis
Go to Equipment EQP-013
Open Metric "Cycle Time P95"
Open recent view
Open saved view
Create VOC from current context
```

Phase 1에서는 메뉴 이동 중심으로 시작하고, Entity Search나 Action Command는 실제 수요가 확인될 때 확장한다.

---

## 11. Global Context Bar

플랫폼에서 가장 중요한 공통 UI 중 하나다.

```text
┌────────────────────────────────────────────────────────────────────┐
│ Sep 01–17 × │ EQP-001 +3 × │ Lot: All │ + Filter │                │
│                                             Reset    Save View      │
└────────────────────────────────────────────────────────────────────┘
```

대표 Context:

- Time Range
- Equipment
- Equipment Group
- Lot
- Process
- Metric Version
- Scope

### Context 변경 규칙

- 사용자가 명시적으로 바꾼 값만 전역 상태를 변경한다.
- 단순 Chart Zoom은 Global Context를 변경하지 않는다.
- Brush 후 `Analyze selected range` 같은 명시적 Action이 있어야 Global Context로 승격한다.
- Scope 변경 시 이전 Scope의 데이터는 stale-while-revalidate로 유지하지 않는다.
- 지원하지 않는 Context는 명시적으로 표시한다.

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

---

## 13. Shared Component Layers

컴포넌트는 세 층으로 나눈다.

```text
UI Primitive
    ↓
Platform Component
    ↓
Domain Component
```

예:

```text
Button
  ↓
PageActionButton
  ↓
EquipmentDeactivateButton
```

### UI Primitive

shadcn/ui + Base UI를 기반으로 한다.

예:

- Button
- Input
- Select
- Dialog
- Popover
- Tabs
- Badge

### Platform Component

여러 도메인에서 동일한 플랫폼 의미를 갖는 컴포넌트다.

예:

- GlobalContextBar
- PageHeader
- DataTrustIndicator
- AnalysisChartFrame
- PlatformDataTable
- DetailDrawer
- AuditTimeline
- EmptyState
- PermissionGuard
- SavedViewSelector

### Domain Component

업무 의미가 있는 컴포넌트다.

예:

- EquipmentValidityTimeline
- MetricVersionDiff
- WaferJourneyTimeline
- VOCStatusTimeline

Domain Component를 억지로 Platform Component로 승격하지 않는다.

---

## 14. Platform Component Promotion Rule

플랫폼 개발에서 가장 위험한 것은 **너무 늦은 공통화와 너무 이른 공통화** 둘 다다.

아래 규칙을 기본값으로 한다.

### 바로 Platform Component로 만든다

플랫폼 계약에 해당하는 것:

- Page Header
- Navigation
- Global Context
- Permission Guard
- Data Trust
- Saved View Entry
- Error / Empty / Loading

### 2개 이상 메뉴에서 확인 후 공통화

- Table Toolbar 패턴
- 특정 Filter 조합
- Analysis Drill-down 패턴
- Detail Summary Layout

### 3개 이상 반복 또는 Phase 4까지 기다린다

- 자유 배치 Widget Framework
- Dashboard Builder
- Domain-independent Annotation Editor
- 외부 설치형 Plugin SDK

공통화를 위해 Domain 요구를 왜곡하지 않는다.

---

## 15. Platform Data Table Contract

Table은 플랫폼 핵심 UI다.

기본 기능:

- Server-side sort/filter
- Column resize
- Column visibility
- Column pin
- Multi-select
- Virtualization
- Saved column preference
- Row action
- Export entry

Baseline:

```text
Row height       40px
Header height    40px
Cell padding     12px
```

숫자는 오른쪽 정렬하고 `tabular-nums`를 사용한다.

대규모 데이터에서는 브라우저에 전체 데이터를 전달하지 않는다.

### Platform Table과 Domain Table의 경계

Platform이 소유:

- interaction
- loading/error
- column preference
- selection model
- toolbar layout

Domain이 소유:

- column definition
- cell business meaning
- row actions
- domain filter

---

## 16. Analysis Chart Contract

Primary candidate는 `04_frontend_ui_ux.md`에 따라 Apache ECharts다.

플랫폼은 Chart의 비즈니스 정의가 아니라 **Chart Frame과 Interaction Contract**를 소유한다.

공통 Toolbar vocabulary:

```text
Zoom
Brush
Reset
Compare
Annotate
Export
More
```

Chart Frame:

```text
Title                         Actions
Description / Metric Version
Legend
Plot
Selection Summary
Source · Updated · Coverage
```

### 상태 분리

- Global Context
- Page Filter
- Chart Local State
- Persistent Annotation

차트마다 이 상태를 섞어 구현하지 않는다.

---

## 17. Permission-aware UX Contract

권한은 메뉴 노출만의 문제가 아니다.

같은 권한/Scope 규칙이 다음에 모두 적용되어야 한다.

- Menu visibility
- Route access
- Filter option
- Query result
- Saved View
- Export
- Drill-through
- Context Link
- VOC related analysis link

### UI 규칙

권한 없음과 데이터 없음은 구분한다.

```text
No matching data
```

와

```text
You do not have access to this scope
```

는 같은 Empty State를 사용하지 않는다.

URL Context는 보안 경계가 아니며 서버가 항상 재검증한다.

---

## 18. Data Trust Contract

분석 플랫폼에서는 숫자 자체만큼 **숫자의 상태**가 중요하다.

필요할 때 다음 정보를 같은 Vocabulary로 표시한다.

```text
Updated       10:32
Data through  10:00
Coverage      98.7%
Metric        v3
Status        Provisional
```

상태가 정상이라면 한 줄로 압축할 수 있다.

```text
● Data healthy · 98.7% coverage · Updated 10:32
```

상세는 Popover로 확장한다.

### Data Trust를 페이지마다 새로 설계하지 않는다

플랫폼 공통 모델로 최소 다음 의미를 정의한다.

- freshness
- calculation basis time
- coverage
- completeness / provisional state
- metric version
- source / lineage entry

실제 값의 계산 책임은 Backend/Data layer에 있고 UI는 이를 표준적으로 표현한다.

---

## 19. Loading / Empty / Error Taxonomy

`No Data` 하나로 합치지 않는다.

최소 상태:

```text
Loading
Refreshing same context
No matching result
Not collected
Processing delayed
Insufficient coverage
Permission restricted
Query too large
Partial widget failure
Server error
Unknown
```

### 규칙

- 동일 Context 재조회라면 기존 데이터를 유지하며 `Refreshing` 표시 가능
- Equipment/기간/Scope가 바뀌었다면 이전 값을 새 Context 결과처럼 보여주지 않음
- Dashboard 한 영역 실패 시 나머지 영역 유지
- 오류에는 Query ID / Correlation ID 제공
- 장기 Query에는 취소/기간축소/집계수준 변경 경로 제공

---

## 20. Detail Surface Contract

### Drawer

사용:

- Table row 상세
- Context를 유지한 조회/수정
- Audit/History 확인

### Modal

사용:

- Confirmation
- 짧은 입력
- 단일 의사결정

### Full Page

사용:

- 복잡한 분석 Workspace
- Metric Definition
- 장시간 편집
- Deep-link 대상이 되어야 하는 상세 작업

큰 Form을 Modal에 넣지 않는다.

---

## 21. Saved View Contract

Saved View는 단순 Filter 저장 기능이 아니라 플랫폼 공통 자산이다.

최소 저장 대상 후보:

- route
- supported global context
- page filter
- table column state
- analysis display state 중 재현에 필요한 일부

저장하지 않는 기본값:

- 일시적 hover
- 단순 chart zoom
- modal open state

`04_frontend_ui_ux.md`의 `savedViewToken` 계약과 맞춘다.

Saved View가 권한을 우회하지 않도록 복원 시 서버 Scope를 다시 검증한다.

---

## 22. Cross-menu Context Link

플랫폼의 핵심 가치는 메뉴 수가 아니라 **메뉴 사이를 문맥과 함께 이동할 수 있는 것**이다.

예:

```text
Cycle Time P95
   ↓
Slow executions
   ↓
Execution detail
   ↓
Wafer / Process timeline
   ↓
Create VOC with current context
```

각 메뉴가 서로의 URL 문자열을 직접 조립하지 않는다.

가능하면 Platform Context Link helper를 통해:

- destination
- transferable context
- unsupported context
- permission

을 공통 처리한다.

---

## 23. Design Tokens

### Radius

```text
sm   4px
md   6px
lg   8px
```

과도한 roundness를 사용하지 않는다.

### Spacing

4px 기반:

```text
4  8  12  16  20  24  32  40  48
```

### Typography

```text
Page Title       24 / 32 / 600
Section Title    18 / 28 / 600
Component Title  14 / 20 / 600
Body             14 / 20 / 400
Secondary        13 / 18 / 400
Caption          12 / 16 / 400
Primary KPI      30~36 / 600
Secondary KPI    20~24 / 600
```

### Semantic Colors

Component에서 Tailwind primitive 색을 직접 의미로 사용하지 않는다.

```text
--background
--surface
--surface-subtle
--text-primary
--text-secondary
--text-muted
--border
--border-strong
--accent
--success
--warning
--danger
--info
```

Shadow보다 Border를 기본으로 하고 Shadow는 Popover/Dropdown/Drawer/Modal 같은 floating surface에 제한한다.

---

## 24. Visual Anti-patterns

### Card Soup

모든 데이터를 독립 Card로 감싸지 않는다.

### Hidden Context

Equipment / 기간 / Metric Version / Scope가 분석 중 사라지지 않아야 한다.

### Silent Drill-down

차트 클릭이 모르게 Global Filter를 바꾸지 않는다.

### Filter Duplication

페이지별 Date Picker / Equipment Selector를 따로 만들지 않는다.

### Domain Leakage into Shell

`if menu === equipment` 같은 Domain 분기를 Shell에 추가하지 않는다.

### Premature Platformization

한 화면에서만 쓰이는 복잡한 도메인 컴포넌트를 범용 프레임워크로 일반화하지 않는다.

### Decorative Visualization

업무 판단에 기여하지 않는 Gauge, Gradient, 3D Chart를 사용하지 않는다.

---

## 25. Responsive Strategy

이 제품은 Desktop-first다.

### ≥ 1440px

Full experience.

### 1024–1439px

- Sidebar collapse
- Secondary panel Drawer 전환
- Grid column 축소

### < 1024px

조회/간단 관리 중심으로 제한할 수 있다.

복잡한 분석 Workspace를 억지로 모바일 UX로 재설계하지 않는다.

---

## 26. Accessibility Baseline

분석 UI라고 접근성을 후순위로 두지 않는다.

최소 원칙:

- 색만으로 상태 구분 금지
- Keyboard focus visible
- Dialog / Drawer focus trap
- Chart title / unit / textual summary 제공
- Chart와 동일 데이터의 Table 접근 경로 제공
- icon-only action에는 accessible label
- 오류 메시지는 원인/행동을 텍스트로 제공
- 선택 상태는 색 + shape/text 병행

---

## 27. Performance UX Baseline

플랫폼의 성능 문제를 Skeleton으로 숨기지 않는다.

UI 계약:

- Query timeout / cancellation
- Progressive or partial rendering where meaningful
- large table virtualization
- server-side aggregation/downsampling
- stale data 여부 표시
- route transition 중 Context 혼동 방지

차트에 원본 로그 전체를 내려보내고 프론트에서 DataZoom으로 해결하는 방식은 금지한다.

---

## 28. Platform Governance

새 메뉴 PR은 UI가 예쁜지만 보지 않는다.

다음을 리뷰한다.

### Platform Contract

- Menu Registry를 통해 등록됐는가?
- 지원 Context를 선언했는가?
- 공통 Page Slot을 사용하는가?
- Route/Deep-link 규칙을 따르는가?
- Permission Scope가 전 구간에 적용되는가?

### Reuse

- 기존 Platform Component로 해결 가능한가?
- 페이지 전용 구현이 플랫폼 기능을 중복하고 있지 않은가?
- 반대로 한 번만 쓰는 기능을 과도하게 일반화하지 않았는가?

### Data Trust

- 데이터 기준시각을 확인할 수 있는가?
- 필요한 지표 버전/coverage를 확인할 수 있는가?
- Empty/Error/Permission 상태가 구분되는가?

### Interaction

- Global / Page / Chart 상태가 분리됐는가?
- 메뉴 이동 시 Context 전달이 명시적인가?
- Browser back/forward 동작이 예측 가능한가?

---

## 29. Platform-first Definition of Done

새 기능의 완료를 다음 두 층으로 나눈다.

### Domain Done

- 해당 메뉴 요구사항이 동작함
- 숫자/CRUD/상태전이가 정확함

### Platform Done

- 공통 계약 위에 올라가 있음
- 다른 메뉴와 Context가 연결됨
- 권한/Scope가 일관됨
- 공통 Loading/Error/Data Trust 규칙을 사용함
- 재사용할 가치가 확인된 책임은 Platform Component로 추출됨
- 추출하지 않은 Domain-specific 책임도 명확함

**Domain Done만 만족하면 플랫폼 개발 관점에서는 완료가 아니다.**

---

## 30. Phase Alignment

이 문서는 기존 로드맵을 대체하지 않고 UI 관점으로 정렬한다.

### Phase 1 — Platform Kernel

우선 구현:

- App Shell
- Menu Registry
- Route/Search Param Contract
- Global Context
- Permission-aware navigation
- Page Layout / Slot
- 기본 Table / Feedback primitives

이 단계에서 Dashboard Builder는 만들지 않는다.

### Phase 2 — Platform Validation through One Vertical Slice

첫 분석 화면을 이용해 검증:

- Context propagation
- Chart Frame
- Table
- Data Trust
- Drill-through
- Export
- Partial error
- minimal annotation

첫 화면은 제품 목적이 아니라 플랫폼 계약의 실전 테스트다.

### Phase 3 — Reuse Validation

두 번째 분석 메뉴와 Saved View를 추가하며:

- 첫 화면에서 만든 abstraction이 실제 재사용 가능한지 검증
- 필요하면 abstraction을 깨고 다시 단순화

### Phase 4 — Confirmed Platform Expansion

반복이 확인된 이후에만:

- Common Widget Framework
- Dashboard Layout Builder
- External-install Plugin Registry
- Advanced Annotation Editor

을 추진한다.

---

## 31. Canonical Wireframe — Platform Shell

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Analytics Platform     Site A ▼     Search ⌘K          Help      User    │
├────────────────┬─────────────────────────────────────────────────────────┤
│ Overview       │ Equipment / Analytics                                  │
│                │                                                        │
│ Equipment      │ Physical Occupancy                      [Export] [⋯]    │
│ Master Data    │ Equipment occupancy based on occurrence data           │
│                ├────────────────────────────────────────────────────────┤
│ Analytics      │ Sep 01–17 × │ EQP-01 +3 × │ Process: All │ + Filter   │
│  ├ Occupancy   ├────────────────────────────────────────────────────────┤
│  ├ Journey     │                                                        │
│  └ Cycle Time  │ KPI / Main Analysis                                   │
│                │                                                        │
│ Metrics        │                                                        │
│ Notice & VOC   ├────────────────────────────────────────────────────────┤
│ Admin          │ Breakdown / Detail                                     │
│                │                                                        │
│                ├────────────────────────────────────────────────────────┤
│                │ Healthy · Coverage 98.7% · Data through 10:00 · v3     │
└────────────────┴─────────────────────────────────────────────────────────┘
```

중요한 것은 이 배치 자체보다 **모든 메뉴가 같은 Shell과 상태 Vocabulary를 사용한다는 것**이다.

---

## 32. Final Design Target

목표는 특정 SaaS의 외관을 복제하는 것이 아니다.

최종 플랫폼은 다음 특성을 가져야 한다.

> **정돈된 SaaS Shell**  
> + **고밀도 운영 UI**  
> + **재현 가능한 분석 Context**  
> + **시계열 Interaction**  
> + **명시적 Data Trust**

그리고 가장 중요한 기준은 다음이다.

> 새 메뉴가 추가될 때 플랫폼 코드를 계속 고쳐야 한다면 플랫폼 설계가 실패한 것이다.

반대로 모든 것을 범용화하느라 첫 메뉴조차 느리게 개발된다면 그것도 실패다.

이 플랫폼은 **작은 Kernel + 명시적 Contract + 검증된 Shared Component + 독립적인 Domain Menu** 구조를 목표로 한다.
