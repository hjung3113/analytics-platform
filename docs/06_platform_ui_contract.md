# 06. Platform UI Contract

> Status: Draft  
> Scope: Analytics Platform UI / Platform Shell / Extension Contract  
> Related: `00_overview.md`, `02_domain_menus.md`, `04_frontend_ui_ux.md`, `05_roadmap_and_open_questions.md`

## 문서 소유권과 결정 상태

이 문서는 플랫폼 전역 UX / Scope / Context / URL / Menu Extension / Shell Slot / navigation IA의 단일 authoritative source다. `02_domain_menus.md`는 도메인 capability catalog, `04_frontend_ui_ux.md`는 구현 후보·리서치·화면 패턴, `05_roadmap_and_open_questions.md`는 결정 상태·미결 질문 및 Deferred 구현 가설, `07_app_shell_wireframe.md`는 이 계약을 소비하는 셸 설계다. 외부 디자인 참고자료와 에이전트 스킬은 제품 계약의 근거가 아니다.

- **Decided**: 플랫폼 책임 경계와 명시적인 계약 규칙. 구현 완료를 뜻하지 않는다.
- **Candidate**: 배치·치수·토큰·페이지 예시. 독립 초안끼리 일치해도 승인으로 간주하지 않는다.
- **Open**: 아래에 미결로 기록한 URL 세부 정책·Scope 계층·시간 의미 등.
- **Deferred**: 저장된 뷰 등 후속 구현 범위. 이 설계가 기능 제공 시점을 확정하지 않는다.

§5~6, §8~9, §11, §17, §19의 책임·행동 규칙은 Decided다. 화면 배치와 시각 토큰(§7, §23, §25, §31)은 Candidate다. 구현 일정은 아직 확정하지 않았으며 `05_roadmap_and_open_questions.md`의 Phase 표는 non-authoritative 가설이다.

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

단, 플랫폼을 목표로 한다는 이유만으로 처음부터 범용 위젯 엔진·외부 플러그인 SDK·저코드 빌더를 만들지는 않는다. **실제 메뉴 2~3개에서 반복이 확인된 책임만 플랫폼 기능으로 승격**한다.

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

메뉴가 선언하는 개념적 정보(Decided):

| 정보 | 책임 |
| --- | --- |
| 식별자·그룹·이름·경로·아이콘 | 메뉴 탐색과 현재 위치 표시 |
| 필요한 권한·Scope | 플랫폼의 노출 판단과 서버의 접근 검증 |
| 지원 Context | 기간·설비·Lot·공정·지표 버전의 지원 여부 명시 |
| 페이지 유형 | overview / analysis / management / catalog / workflow |
| 선택 기능 | 내보내기·저장된 뷰·주석·비교 지원 여부 |

메뉴가 선언하고 Shell이 소비한다. 필드명·TypeScript 타입·등록 방식은 구현 설계에서 구체화한다.

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

### 6.1 식별자와 URL 소유 상태 (Decided)

- 목적지 객체 식별자와 전달하는 분석 Context를 분리한다. `(equipmentId, entityType, anchor)`는 **occurrence 전용 식별키**다. `lotId` 같은 업무 ID는 occurrence 검색 보조이며 anchor 없는 occurrence 조인에 쓰지 않는다.
- 설비 마스터는 `equipment_id`만으로 열 수 있다. VOC는 `vocId`, 지표는 `metricId`와 `metricVersion`으로 식별한다. 도메인 객체에 occurrence 키를 강제하지 않는다. DB 이름과 URL 직렬화 이름의 매핑은 Open이다.
- URL은 요청한 `scopeId`, `from`/`to`, `equipmentIds`, `lotIds`, `metricVersion`, 해당 화면의 탭/저장된 조회조건 식별자 및 해당하는 경우 occurrence anchor를 소유한다. 객체 ID는 목적지 경로/계약에 따라 별도로 전달한다.
- 딥링크 왕복은 조회조건과 지표 버전을 재현한다. 지연 완료·마스터 정정으로 숫자는 달라질 수 있으므로 결과에는 계산 기준시각을 표시한다.
- 단순 차트 줌은 로컬 상태다. Brush 후 명시적인 분석 구간 적용만 전역 Context/URL로 전달한다.
- 미지원 Context는 조용히 버리지 않고 적용되지 않음을 표시한다. 보존·재적용 방식은 §6.4의 Open 결정으로 남긴다.
- `savedViewToken`은 긴 URL을 대체할 후보 계약으로 예약한다(Deferred). 저장된 뷰 구현 전에는 토큰 생성이나 비활성 버튼을 셸 필수 요소로 두지 않는다.

### 6.2 Scope와 권한 (Decided / Open)

- Scope는 사용자가 요청하는 조직·데이터 접근 범위다. `scopeId`는 URL에 담지만 권한 증명이 아니다. 서버는 **매 요청마다** 사용자 권한과 요청 Scope를 재검증한다.
- 접근할 수 없는 Scope는 명시적 오류/선택 상태로 처리하며 다른 Scope로 조용히 대체하지 않는다. 같은 URL이 다른 사용자에게 같은 접근 권한을 부여하지 않는다.
- 세션·최근방문 값은 미검증 후보이며, 재적용 전에 현재 Scope에서 설비·Lot 선택과 권한의 유효성을 다시 검증한다.
- 구체 계층(사이트 → 공장 → 라인), 부모·자식 상속, 복수 Scope 선택, 설비 소속 규칙은 **Open domain decision**이다. 셸은 고정 3단 선택기를 계약으로 요구하지 않는다.

### 6.3 시간 계약 (Decided / Open)

기간은 파서 원본과 같은 시간대 없는 설비 wall-clock으로 전달하며 임의로 UTC로 변환하지 않는다. 시간의 원천 의미는 `03_backend_stack.md`를 따른다. 구간 포함/제외 경계, 원천 시간대 미확인 시 처리, 다중 사업장의 같은 날짜 의미, 날짜만 선택한 경우 시각 해석은 Open이다. 확정 전에는 서로 다른 사업장 시각을 동일 축으로 합친 조회를 보장하지 않는다.

### 6.4 아직 열려 있는 URL 결정

- URL과 세션/최근방문 값의 충돌 시 우선순위와 누락값 처리
- URL 계약 버전, 폐기된 필드, 잘못된 값 처리 및 객체 ID 직렬화
- 뒤로가기 복원 범위와 미지원 Context 보존·재적용 방식
- 복수 Scope와 시간 계약이 해결되기 전 허용할 조회 범위

이 결정들을 확정하기 전에는 완성된 URL API나 프로토타입 검증을 주장하지 않는다.

---

## 7. Application Shell

Desktop-first를 기본으로 한다.

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Product / Workspace     Scope ▼    Search ⌘K        Help   User      │
├──────────────┬──────────────────────────────────────────────────────┤
│              │ Breadcrumb                                           │
│ Overview     │ Page Title                             Page Actions    │
│              ├──────────────────────────────────────────────────────┤
│ Equipment    │ Global Context Bar                                  │
│ Master Data  │ [Date] [Equipment] [Lot]                            │
│ Analytics    ├──────────────────────────────────────────────────────┤
│ Metrics      │                                                      │
│ Notice/VOC   │                   Page Content                       │
│ Admin        │                                                      │
│              │                                                      │
├──────────────┴──────────────────────────────────────────────────────┤
│ Data status / calculation basis / coverage                         │
└─────────────────────────────────────────────────────────────────────┘
```

Scope는 개념적으로 Global Context에 포함되지만 이 Candidate 배치에서는 헤더에만 선택기를 둔다. Context Bar에 두 번째 Scope 선택기를 만들지 않는다. 구체 셸 설계는 `07_app_shell_wireframe.md`를 따른다.

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

이 7그룹을 navigation IA의 단일 기준으로 둔다(Decided). 표시명은 운영 개요 / 설비관리 / 기준정보관리 / 생산성 분석 / 지표관리 / 공지·VOC / 관리·감사다. `02_domain_menus.md`의 6개 도메인 중 공지와 VOC가 한 그룹을 공유하고, 운영 개요·관리·감사는 플랫폼 기능이다. 도메인 개수와 내비게이션 그룹 개수를 같게 맞출 필요는 없다. 하위 화면 배치와 표시명 변경은 별도 설계 결정이다.

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

메뉴 이동을 기본 책임으로 둔다. Entity Search와 Action Command는 수요 검증 후 채택할 Deferred 후보이며 구현 시점은 정하지 않는다.

---

## 11. Global Context Bar

플랫폼에서 가장 중요한 공통 UI 중 하나다.

```text
┌────────────────────────────────────────────────────────────────────┐
│ Sep 01–17 × │ EQP-001 +3 × │ Lot: All │ + Filter │                │
│                                             Reset                   │
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
- Scope·설비·기간 등 Context가 바뀌면 이전 결과를 새 조건의 결과처럼 표시하지 않는다. 이전 요청이 늦게 완료돼도 새 Context 결과로 채택하지 않는다. 동일 Context 재조회에서만 이전 결과와 갱신 중 표시를 함께 유지할 수 있다. 권한 변경/Scope 전환에서는 이전 결과를 숨기고 현재 권한을 재검증한다.
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

### 플랫폼이 소유하는 책임 (구현 시점과 별개)

플랫폼 계약에 해당하는 것:

- Page Header
- Navigation
- Global Context
- Permission Guard
- Data Trust
- Saved View Entry (기능 채택 시; 현재 Deferred)
- Error / Empty / Loading

### 2개 이상 메뉴에서 확인 후 공통화

- Table Toolbar 패턴
- 특정 Filter 조합
- Analysis Drill-down 패턴
- Detail Summary Layout

### 반복 수요 검증 전까지 Deferred로 둔다

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

- `Not collected`, `Processing delayed`, `Insufficient coverage` 등 원인을 주장하는 상태는 Backend/status source가 현재 요청 Context에 대해 그 원인을 확인한 경우에만 표시한다. 상태 원천과 관측 기준시각을 연결할 수 있어야 하며, UI가 행 수만으로 원인을 추론하지 않는다.
- 성공한 조회가 0건이라는 사실만 확인되면 `No matching result`를 표시한다. 원인/가용성 상태를 확인할 수 없으면 `Unknown`으로 표시한다. **0건 ≠ 수집 중단·미수집·파서 지연**이다. 권한 제한 역시 서버가 확인한 경우에만 그 사유를 표시한다.
- 상태 원천이 아직 없거나 원천 조회에 실패했다면 원인을 단정하지 않는다. 개별 원천 서비스·응답 스키마는 Open이며 taxonomy의 존재가 해당 상태 판정 기능의 구현을 뜻하지 않는다.
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

이 문서 §6.1의 `savedViewToken` 계약을 따른다. 기능 제공 순서는 Deferred이며 `05_roadmap_and_open_questions.md`의 가설은 구현 승인이 아니다.

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

## 30. 구현 계획과의 경계

구현 순서·배치 시점은 Deferred다. `05_roadmap_and_open_questions.md`는 설계 결정과 Open Questions를 추적하고 과거 Phase roadmap을 non-authoritative 가설로 보존한다. 이 문서의 계약은 각 기능이 구현될 때 따라야 할 조건이며, 와이어프레임에 표현됐다는 이유만으로 해당 기능의 구현이 승인되지는 않는다.

---

## 31. App Shell 설계 산출물

구체 셸 배치·사용자 작업·상태 시나리오는 `07_app_shell_wireframe.md`에서 관리한다. §7의 레이아웃은 Shell Slot 관계를 설명하는 Candidate 예시이며 독립적인 화면 명세가 아니다.

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
