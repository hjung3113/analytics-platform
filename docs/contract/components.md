# 공통 컴포넌트

> Scope: PlatformDataTable·DetailDrawer·DataTrustIndicator 등 공통 컴포넌트 계약과 디자인 토큰.  
> 포함 절: §13, §14, §15, §18, §19, §20, §23  
> 색인과 「절 → 문서」 대응표: [06. Platform UI Contract](platform-ui-contract.md)  
> 상태 표기(Decided / Candidate / Open / Deferred): [문서 소유권과 결정 상태](platform-ui-contract.md#문서-소유권과-결정-상태)

## 13. Shared Component Layers

> 디자인 시스템 원본은 SDK `@ap/ui`가 소유한다([ADR-0043](../adr/0043-platform-sdk-is-the-app-contract-and-unified-framework.md), [ADR-0046](../adr/0046-design-system-source-moves-to-platform-whole-package.md)). 기능 화면은 SDK 부품을 `@ap/ui`에서 직접 소비하고, `@ap/feature-ui`는 기능 도메인 표현 부품을 소유한다.


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

shadcn/ui + Radix 조합은 [04 프론트엔드 기술 스택](../architecture/frontend-ui-ux.md#프론트엔드-기술-스택-decided-2026-09-25)에서 Decided(2026-09-25)다. primitive 구현과 공개 export는 SDK `@ap/ui`가 소유하며, 소비자는 `@ap/ui`에서 직접 import한다([ADR-0043](../adr/0043-platform-sdk-is-the-app-contract-and-unified-framework.md)·[ADR-0046](../adr/0046-design-system-source-moves-to-platform-whole-package.md)). `TabsList`·`TabsTrigger`는 같은 패키지의 shadcn 탭을 감싼 플랫폼 선택 표식 구현이다([ADR-0023 개정](../adr/0023-feedbackops-primitive-shapes-and-sizes.md#개정--탭-선택-표식-2026-10-15)). `TabsList`는 선택 prop `overflow`(`'scroll'` 기본 = 넘치면 가로 스크롤, `'menu'`)와 `moreLabel`(기본 `더보기`, `@ap/ui`는 i18n을 모르므로 메뉴가 자기 문구를 넘긴다)을 받는다. `overflow="menu"`는 들어가지 않는 탭을 마지막 보이는 탭 바로 뒤의 `더보기 ⌄` 메뉴로 옮기고(선택 탭이 숨으면 버튼이 그 탭 이름과 선택 막대를 보인다), 목록 자신의 상자 너비를 재므로 컨테이너가 확정된 너비를 줘야 한다(flex 행이면 `min-w-0 flex-1`). 숨은 탭은 DOM에 `hidden`으로 남아 `TabsContent`의 `aria-labelledby`가 계속 풀린다. 키보드는 ←/→/Home/End가 [보이는 탭…, 더보기 버튼] 순서를 돌고, 버튼에서 Enter/Space/↓로 메뉴(`menuitemradio`)를 열며, Tab 정거장은 목록 하나(선택 탭이 숨었으면 더보기 버튼)다. `@ap/feature-ui`는 표식 없는 `TabsListBase`·`TabsTriggerBase`를 각각 `TabsList`·`TabsTrigger`라는 기능 이름으로 재수출한다. 아래 primitive 역할 예시는 그 구체 컴포넌트 매핑까지 확정하는 것은 아니다.

예:

- Button
- Input
- Select
- Dialog
- Popover
- Tabs
- Badge

**Dialog 닫은 뒤 포커스 (#1169):** `DialogContent`·`DialogContentBare`·`AlertDialogContent`는 열릴 때 `document.activeElement`를 기억하고, 닫을 때 Radix 기본 처리 뒤에도 포커스가 `body`에 있으면(`DialogTrigger`가 없어 Radix가 null 트리거에 포커스를 보낸 경우) 그 요소가 연결돼 있을 때 되돌린다. Escape·닫기 버튼 모두 같다. 트리거가 있는 대화상자는 Radix가 트리거로 보내므로 달라지지 않는다. 소비자의 `onCloseAutoFocus`가 `preventDefault`하면 소비자가 이긴다(다른 요소로 보내거나 되돌리지 않을 때). 오버레이 scope가 숨겨져 `useScopedAutofocus`가 이벤트를 막은 경로는 소비자 호출도 복원도 하지 않는다. 화면은 이 동작을 손으로 되풀이하지 않고, 열기 요소와 다른 대상(행 트리거·목록 제목 등)으로 보낼 때만 `onCloseAutoFocus`를 쓴다.

### Platform Component

여러 도메인에서 동일한 플랫폼 의미를 갖는 컴포넌트다.

예:

- GlobalContextBar (`@ap/shell`)
- PlatformPage (페이지 머리·슬롯, §8. 별도 PageHeader 컴포넌트는 없다)
- PageFilterBar
- DataTrustIndicator
- AnalysisChartFrame
- AnalysisChart (종류별 데이터·로컬 선택·표·CSV 프레임, [§16](chart.md#16-analysis-chart-contract), [ADR-0058](../adr/0058-analysis-chart-spec-union.md))
- LegendTree (계층 범례의 보이기·단일 현재 항목 또는 드릴 현재 단계(`onDrill`·`currentId`·`drillOnly`·`canDrill`, 보이기와 분리)·키보드 행 이동, [§16](chart.md#16-analysis-chart-contract), [ADR-0057](../adr/0057-legend-tree-arrow-key-row-navigation.md))
- PlatformDataTable
- DetailDrawer
- AuditTimeline
- QueryView / OutcomeView / StateMessage (응답 상태, EmptyState 역할), PlatformPage-provided shared outcome scope / banner (§19)
- StatCard / Panel
- DrillPath / DrillLayout (드릴다운 경로 바와 단계 본문, §12.7)
- Inspector (분석 화면 보조 섹션을 한 번 선언해 `stack`·`rail` 두 형태로 보인다, [ADR-0080](../adr/0080-inspector-forms.md))
- ReturnLink (다른 메뉴에서 출발 화면으로 돌아가는 버튼, §22)
- FloatingWindow (`@ap/components`, 도메인을 모르는 비모달 창 틀 — 배경 차단막·포커스 가두기·외부 클릭 닫기 없음, 제목줄 끌기·8방향 핸들·방향키(Alt=크기)·`⋯` 메뉴(위치 5·크기 3)의 같은 결과, 호출자가 준 `area` 안에서만 그리고 `mode`(`window`/`fill`/`off`)가 바뀌어도 children은 재마운트되지 않는다. 창으로 못 그리는 폭은 `fitsArea`로 판정해 호출자가 `fill`을 고른다, #893)

`Inspector`(`@ap/components`, **Candidate**)는 분석 화면의 보조 설정(대상·범례·옵션)을 `sections`(`id`·`title`·`icon`·`summary?`·`render`)로 한 번 선언하고 `form`으로 보인다. `stack`은 [WAI-ARIA APG 아코디언](https://www.w3.org/WAI/ARIA/apg/patterns/accordion/)을 따른다: 제목(`h3`) 안의 버튼이 `aria-expanded`·`aria-controls`를 갖고 Enter·Space로 바뀌며, 여러 섹션을 함께 열 수 있는 것이 기본이다(`defaultExpanded` 생략 = 모두 열림). 제목은 줄어들지 않고 접힌 섹션의 `summary`는 머리에 말줄임과 `title` 속성으로 남으며, 스택 전체가 스크롤하고 섹션 안은 스크롤하지 않는다([Carbon 아코디언](https://carbondesignsystem.com/components/accordion/usage/)의 원칙). 내용 패널은 `region`이 아니다(APG의 landmark 남용 경고). `rail`은 40 px 열에 섹션당 아이콘 버튼 하나이고, 버튼은 섹션 제목을 접근 가능한 이름으로 갖고 `@ap/ui` Tooltip이 포커스에서도 보인다. 클릭·Enter는 그 섹션을 비모달 Popover peek로 열고(오른쪽으로, 맨 위에 섹션 제목(`h3`)이 보이고 peek의 이름이 된다), Escape는 닫고 포커스를 그 버튼으로 돌리며, peek은 한 번에 하나다. 열린 버튼은 색만이 아니라 막대 표시와 `aria-expanded`로 드러난다. **섹션 내용은 질의를 소유하지 않는다**: 질의는 Inspector 위(메뉴)에 두고 결과를 `render`에 넘긴다. 섹션 토글·peek·`form` 전환은 Inspector 밖의 어떤 것도 다시 실행하지 않는다(`stack`은 섹션을 마운트한 채 유지, `rail`은 peek 중인 섹션만 마운트하고 닫힌 섹션의 `render`는 호출하지 않으며 `form` 전환 때 섹션 내용은 다시 마운트된다). 펼침 집합은 `persistKey`(정적 id)로 `platform:inspector-expanded:v1:<user>:<menu>:<persistKey>`에 기억하며(PanelWorkspace와 같은 사용자·메뉴 범위, 사용자나 라우팅된 메뉴가 없으면 메모리에만 둔다) `expanded`/`onExpandedChange`로 controlled도 된다. "모두 접으면 레일" 전이는 만들지 않는다(사용자 변형 컨펌 선행).

후보(미구현): `PermissionGuard`(현재는 셸 `RouteOutlet`의 권한 게이트).

저장된 뷰 선택 조각은 `ViewSelector`로 공개돼 있다(`@ap/components`, §21 Decided, #1011). 저장소 구현과 실서버 검증 범위는 §21 및 `.planning/README.md`를 따른다.

`PageFilterBar`는 메뉴가 전달한 검색·정확 일치 텍스트·분류 선택·맞춤형 필드를 라벨과 함께 한 줄에 배치하고 공간이 부족하면 줄바꿈한다. 입력은 `@ap/ui` `Input`(40px), 분류 값은 `Select`를 사용하며 높이를 덮어쓰지 않는다. `onApply`를 주면 막대가 `<form>`이 되어 submit(적용 버튼·텍스트 입력의 Enter)만 적용으로 보낸다. 한글 조합 중 Enter는 적용하지 않는다. 필드 의미·URL page key·값 변경·초기화·draft 적용은 소비 화면이 소유하며, 알 수 없는 현재 Select 값은 선택 가능한 표시값으로 남긴다(ADR-0016).

row 방향 소비자는 opt-in `collapsible`로 입력 영역만 접을 수 있다(ADR-0029). 접힘 줄은 소비자가 제공한 `summaryItems`(필드명+현재값) 전체를 담은 펼치기 버튼 하나와 독립된 접힘 액션이며, 공통 부품은 조건을 생략·요약하지 않는다(말줄임·`+n` 금지, 폭이 부족하면 항목 단위 줄바꿈). 요약값은 펼친 입력과 같은 표시 모델에서 만들고 잘못된 값·미확정 상태도 사실대로 보인다. 접힘 기억(`preferenceKey`별 저장)·펼침/접힘 포커스 이동·disclosure aria는 공통 부품이 소유하고, column 레일 소비자는 이 접기를 켜지 않는다.

`AuditTimeline`이 보이는 이벤트 타입은 `@ap/contracts`의 `AuditEvent`다. `at`은 실제 시점이라 `formatInstant`로 표시한다(§6.3). `target`은 목적지 참조(§22)이지 분석 Context가 아니다. 전역 감사 조회(`auditTrail`)와 목적지 감사 — 설비 상세 감사 탭, 지표 상세 변경 이력(`entityAudit`, 지표는 `scopeId: null`) — 는 같은 저장소를 어댑터 포트([패키지 경계](../integration/platform-packages.md) §4)로 읽으며 셸 위젯이 아니다(#50, #90). 메뉴가 소유한 대상의 감사 기록은 mock에서 메뉴가 시드로 내고 앱 조립이 넣는다([ADR-0048](../adr/0048-menu-audit-seeds-join-shared-mock-audit-store.md)); 사유·값은 기록된 문자열 그대로다.

`AuditTimeline`의 페이지 계약([ADR-0085](../adr/0085-entity-audit-cursor-pages.md), #826): 목적지 감사(`entityAudit`)는 서버가 쪽 크기를 정하고(상한 `ENTITY_AUDIT_PAGE_MAX` = 50, 클라이언트 `limit` 없음) `at` 내림차순(instant)·같으면 `id` 오름차순으로 keyset 커서(`nextCursor`, 불투명 문자열)를 준다. 마지막 쪽은 `nextCursor: null`이고 키가 없는 응답은 끝으로 읽는다. `AuditTimeline({ events, more? })`의 `more`는 Kernel `useEntityAudit`이 만든 `AuditMore`(`status` idle·loading·error·end, `load()`, `error`, `last`)다. 첫 쪽이 끝이면 버튼도 캡션도 없고(지금 모양), 더 있으면 목록 끝에 `이전 변경 이력 더 보기` 버튼(secondary·sm)을 둔다. 불러오는 동안은 `aria-disabled`·`aria-busy`로 라벨·폭을 유지하고, 성공하면 포커스가 아직 그 버튼에 있을 때만 붙인 첫 항목(없으면 끝 캡션)으로 옮기며 polite 상태 영역이 `변경 이력 N건을 더 불러왔습니다.`를 알린다. 끝에는 캡션 `더 이전 변경 이력이 없습니다.`, 실패는 목록을 그대로 둔 채 같은 버튼이 `다시 시도`로 바뀌고 `role=alert`(+ Correlation ID)가 뜬다. `forbidden`이면 버튼 없이 권한 안내 문장이다(첫 쪽 §19 배너에는 넣지 않는다). 붙인 쪽 수는 URL에 두지 않고, ref·Scope·세션이 바뀌거나 같은 대상을 다시 조회하면 첫 쪽부터 다시 읽는다.

### DetailDrawer — docked shell slot (Decided, ADR-0013)

- 이름과 props는 유지하고 렌더 대상은 셸 소유 오른쪽 고정 상세 슬롯이다. 이름 있는 `aside` landmark 안에 제목으로 이름 붙인 비모달 상세 dialog를 둔다. 본문은 폭을 양보하며 목록을 계속 조작할 수 있다. scrim·본문 inert·overlay·페이지 머리 아래 fixed 배치는 쓰지 않는다.
- 폭은 §7 Baseline을 따른다. 열림/닫힘은 페이지가 등록한 `focus` 키로 결정하고 `tab`으로 탭을 복원한다. close 버튼·패널 안 Esc는 페이지의 `onClose`를 호출해 `focus`를 지운다. 딥링크·새로고침·Back/Forward 복원과 `전체 화면` 이동 동작을 유지한다. `전체 화면`은 보던 탭을 목적지에 같은 탭이 있으면 `tab`으로 넘긴다.
- 열리면 닫기 버튼으로 포커스를 옮긴다. URL 도착(링크·팔레트·공간 전환·복귀·첫 로드·새로고침)으로 함께 열린 패널은 포커스를 가져가지 않고 §26의 제목 규칙을 따른다([ADR-0032](../adr/0032-arrival-focus-wins-over-restored-detail-panel.md)). 닫힐 때 패널에 포커스가 남아 있으면 연결된 트리거로 복귀하고, 트리거가 없거나 제거됐으면 main으로 복귀한다. 사용자가 이미 목록으로 옮긴 포커스는 빼앗지 않는다. 포커스 trap은 없으며 패널 밖 Esc는 상세를 닫지 않는다. 탭 전환으로 포커스된 컨트롤이 사라지면(§26) 선택된 탭 트리거로, 트리거가 없으면 패널로 옮긴다. 탭이 하나뿐이면 탭 줄을 그리지 않고 그 내용만 그린다 — 고를 것이 없고, 상세 안의 내용이 자기 탭을 가지면 탭 줄이 두 겹이 된다(사용자 결정 2026-10-26, #886 UX-8). 내용은 tabpanel처럼 키보드로 스크롤할 수 있는 영역(`role="region"`, 패널 제목으로 이름, Tab 정지점)이다. 탭 수가 둘에서 하나로 줄면 탭 줄이 함께 사라지고 포커스는 위 규칙대로 패널로 간다. 탭 수가 1과 2 사이에서 바뀌면 보이던 내용이 다시 마운트되어 그 안의 입력 상태는 남지 않는다(탭 전환이 비활성 내용을 내리는 것과 같다).
- 한 셸에 상세 슬롯은 하나이며 마지막 등록이 이기고 개발 환경에서 중복 등록을 경고한다. 등록자가 unmount되면 해제하고, 이전 등록자가 살아 있으면 그 내용이 다시 보인다. 분석 보드에서는 다른 칸의 상세가 슬롯을 차지하면 앞 칸의 상세는 복귀하지 않고 닫힌다([16 §6](../design/analysis-board.md#6-메뉴-쪽-요구-decided)). 내용 갱신만으로 등록 우선순위를 바꾸지 않는다. 등록 방식은 둘(DOM host에 직접 portal / 노드를 맡기는 `useDetailPanelContent`, 셸 `detailPanel` prop)이지만 활성 등록자는 하나다([ADR-0047](../adr/0047-detail-panel-slot-single-registrant-model.md)). 등록 primitive는 `@ap/ui`에 있으며 DetailDrawer는 AppShell(또는 같은 슬롯 Provider·host) 아래에서 사용한다.
- 오른쪽 자리는 한 번에 하나다. 상세와 VOC 등록 드로어(§8)은 서로 바꿔 열린다. 바꿔 열어도 등록 초안과 상세 선택(`focus`)은 남고, 돌아오면 다시 보인다. 상세에 저장하지 않은 편집이 있을 때의 처리는 아래 `activation` 규칙이 정한다([ADR-0070](../adr/0070-global-features-platform-menu-and-voc-drawer.md)). 상세가 **새로 보이게 되면**(새 등록자, 닫힘→열림; 열려 있는 상세의 재렌더·닫힘·해제·복귀는 아니다. 호스트 hook의 `activation`) 그 상세가 오른쪽 자리를 가져가고 열려 있던 VOC 등록 드로어는 초안을 둔 채 숨는다. 레일 버튼이 다시 패널을 보이고 상세를 숨긴다.

결정과 비교 선택지는 [ADR-0013](../adr/0013-detail-panel-shell-docked-slot.md), 배치는 [07](../wireframes/app-shell.md), 시각 규칙은 [DESIGN](../../DESIGN.md#shell-visual-rules)을 따른다.

### Domain Component

업무 의미가 있는 컴포넌트다.

예:

- EquipmentValidityTimeline
- MetricVersionDiff
- WaferJourneyTimeline
- VOCStatusTimeline

Domain Component를 억지로 Platform Component로 승격하지 않는다.

---

분석 보드의 활동 범위(최대화·최소화·닫기)와 복원 칩·레일 상태 표시는 [docs/16 §4](../design/analysis-board.md#4-화면-구조-decided)와 [ADR-0087](../adr/0087-board-minimize-restore-history.md)이 소유한다.

**소유 표면 중지(Decided, [ADR-0088](../adr/0088-surface-pause-detail-slot.md)):** 등록자를 소유한 화면이 잠시 가려졌지만 마운트는 남아 있으면(`@ap/ui` `SurfacePauseScope`, 예: 최소화된 보드) 그 등록자는 상세 슬롯의 자리를 지키되 보이지 않는다. 슬롯은 닫힌 것으로 보고(`open` false, 셸 aside 숨김), `activation`을 올리지 않고, `onSuperseded`·`onClose`를 부르지 않는다 — 중지는 종료가 아니다. 더 새 등록자가 슬롯을 가져가면 위 규칙대로 기존 등록자는 종료되고, 재개했을 때 여전히 승자인 등록자만 다시 보이며 그때 `activation`이 +1이라 VOC 드로어는 새로 보이는 상세에게 자리를 내준다. 중지된 상태로 새로 등록하는 등록자는 보이는 상세를 밀어내지 않는다. 중지된 `DetailDrawer`는 자기 transient UI를 닫고 포커스를 가져오거나 앞 화면으로 돌려주지 않는다. 최소화·복원 때 상세 우선권은 [ADR-0088](../adr/0088-surface-pause-detail-slot.md)의 표(①–④)가 정한다.

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
- Saved View Entry (§21 Decided, ADR-0092; 구현 #1011, mock 범위)
- Error / Empty / Loading

### 메뉴에서 생긴 도메인 패턴: 2개 이상 메뉴에서 확인 후 공통화

도메인을 모르는 범용 SDK 조각은 이 반복 기준의 대상이 아니다. 편입 기준은 [06 §24 적용 범위](platform-ui-contract.md#24-visual-anti-patterns), 결정 이유는 [ADR-0052 보충](../adr/0052-rich-content-stays-in-the-sdk.md)을 따른다.

- Table Toolbar 패턴
- 특정 Filter 조합
- Analysis Drill-down 패턴
- Detail Summary Layout

### 반복 수요 검증 전까지 Deferred로 둔다

범용 엔진·빌더·플러그인 체계는 처음부터 만들지 않는다(06 §1). 도메인을 모르는 개별 부품(예: 주석 편집기)은 위 범용 SDK 조각 기준을 따른다.

- 자유 배치 Widget Framework
- Dashboard Builder
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
- Saved column preference — 보이기·너비·왼쪽 고정에 열 순서(`order`, #556a)가 더해진다. 「컬럼」 팝오버의 모든 데이터 열(보이기를 못 끄는 열 포함)에 「위로」「아래로」 버튼과 목록 안 포인터 끌기가 있고, 이동은 고정됨/나머지 묶음 안에서만 한다(묶음을 넘는 것은 핀 토글). 화면·복사·CSV·XLSX는 같은 순서(고정 열 먼저, 각 묶음은 저장된 순서)를 쓰고, 순서를 바꾼 적 없는 표는 선언 순서 그대로다. 「기본값으로」는 순서도 되돌린다.
- Column filters (#556b, [ADR-0104](../adr/0104-table-column-filters-selection-groups.md), opt-in): `PlatformColumn.filter?: ColumnFilterSpec` (`text` · `number` · `date` · `enum` with `options`) makes the column filterable: a header funnel and an entry on the filter line, both opening the one filter editor (below, ADR-0105; the #556b header popover with two fixed operators per kind and the chip row with 「필터 모두 해제」 are replaced). A table with no filterable field draws neither. The table never filters rows itself: `loadPage` receives `TableQuery = PageQuery & { filters?: ColumnFilter[] }` and the server applies them (AND), keyed by the column id. `filters` is sent **only when non-empty**; `PageQuery` is unchanged and a menu endpoint lists `filters` in `paramKeys` only when it opts in. Operators: text `contains`/`equals` (case-insensitive); number `eq`/`gte`/`lte`/`between` (inclusive both ends); date `between` `{ from?, to? }` wall-clock `YYYY-MM-DD` (06 §6.3) with `from` inclusive and `to` **exclusive** on the wire (the UI's inclusive 「~까지」 is sent as +1 day); enum `in` (`string[]`). A missing value matches no filter. Column filters join the table's Context identity: a change returns to page 1, clears the selection and aborts an in-flight export/copy; they survive page-filter (`filterKey`, ADR-0037) changes, which reset page and selection but not them. Page filters are the page's business conditions and URL keys; column filters are table-local narrowing; both apply (AND) and one field is not declared in both. Export: `exportRows` receives top-level `filters` (not inside `scope`) for the `filtered` and `all` scopes, and the XLSX 「조회 정보」 sheet lists each active column filter. `@ap/contracts` `filterRows(rows, filters, accessor)` implements the rules for mock endpoints. Not shared by URL (backlog).
- URL-held column filters (ADR-0105, node 1217a2c, opt-in): a page that lists one **repeated** (normally also **hidden**) page key in its menu hands the table its conditions with `useTableUrlState(allowedSort, { filters: { key, specs, labels?, legacy? } })`. `urlState.filters` is then the table's filter state (the filter line and editor read and write it; a change calls `urlState.onChange({ page: null, sorting, filters }, 'user' | 'reset')`, which writes the encoded values and `page` in one `setPage`); without `urlState.filters` the table keeps its internal state and every patch is byte-identical to before. The table never knows the key name. Codec (`@ap/contracts` `encodeFilterParam`/`parseFilterParams`): one value per condition, `<id>:<op>[:<value>]` split on the first two `:` (a value keeps its own `:`); `isEmpty`/`isNotEmpty` have no value part; numbers are `String(n)`; `between` is `from~to` (an absent date/instant end is empty); `in`/`notIn` items are joined by `~`; inside a text value or list item `%`, `~`, `\`, `#`, `/` and control characters are written `%XX` (upper-case hex; the Kernel's same-origin guard refuses a decoded `\`, `#`, `//` or control character in a written address, so the codec avoids them itself; a scalar text value keeps `~` literal; nothing else is escaped: `,` `:` spaces and Korean pass through; commas are never separators, kernel.md §URL). Parsing validates through `validateFilters` (undeclared field/op, shape, `requires`, `multiple: false`, a second condition on one field) and rejects, never repairs or drops. Caps (`FILTER_PARAM_LIMITS`): 20 conditions, 50 list items, and 2400 characters of condition length as the address/share serializer (`URLSearchParams`, key and `&` included) writes it, which leaves room for the path and typical Context under the 4000-character share limit (the whole-link limit stays authoritative for large Context); `filterParamLimit(values, key?)` tells an editor which cap an Apply would break. **Legacy aliases:** the page declares `legacy: [{ key, toFilter(raw) }]` (no SDK constants); present legacy keys are converted (`null` = invalid), merged after the key's own conditions (a legacy key and a condition on the same field is invalid) and the URL is rewritten once with `replace` into the filter key with the legacy keys removed; every later filter write also clears them. Legacy keys stay in the menu's `pageKeys` for the alias release. **Rejection:** a bad condition, legacy value or cap makes `urlState` `undefined` and adds one ADR-0034 sentence (`<field label> “<raw condition>”은 … 쓸 수 없는 필터입니다. 조건을 초기화하세요.` followed by a translated cause per reason — unknown field, unsupported condition, bad value, missing dependency, duplicate, unreadable, caps, old-address value; the label comes from `labels`, else the field id; a cap names 「필터」); `requires` is judged once on the merged set (new conditions + converted legacy values); `useTableUrlWarning().recoverKeys` lists exactly the bad keys — `sort`+`page` when either is bad, the filter key + legacy keys when a filter is bad — and `<TableUrlWarning recoverKeys={…} />` clears them in one `setPage` (default `sort`+`page`, unchanged). XLSX 조회 정보: one `필터 · <label>` row per condition, the label is the column header or the non-column field's label (the id when unknown); operators read with `FILTER_OP_LABELS` (the words the filter editor reuses).
- Filter operator vocabulary (ADR-0105, additive; the UI still produces only the first rows' operators until the editor node). `@ap/contracts` `ColumnFilter` is a closed union per kind; a spec's `ops` is the server-supported subset (absent = all of the kind); field ids contain no `:`.

  | Kind | Operators | Value |
  | --- | --- | --- |
  | text | `contains` `notContains` `startsWith` `endsWith` `equals` `notEquals` | `string` (case-insensitive; `caseSensitive: true` on the spec compares exactly) |
  | text, number, date, instant, enum | `isEmpty` `isNotEmpty` | none |
  | number | `eq` `neq` `gt` `gte` `lt` `lte` | `number` |
  | number | `between` | `[min, max]` inclusive both ends |
  | date | `between` | `{ from?, to? }` wall-clock `YYYY-MM-DD`, `from` inclusive, `to` exclusive |
  | date | `before` / `after` | `YYYY-MM-DD`; `before` = `< day`, `after` = `>=` the next day |
  | instant | `between` | `{ from?, to? }` ISO instants with offset or `Z`, half-open `[from, to)` |
  | enum | `in` `notIn` | non-empty `string[]` (`multiple: false`: exactly one value) |

  Blank = `null | undefined | ''` for text, `null | undefined` otherwise. Positive operators never match a blank; the negated ones (`notContains` `notEquals` `neq` `notIn`) exclude blanks too (SQL `NOT x` with NULL is not true) — ask for blanks with `isEmpty`/`isNotEmpty`. A spec's `requires: string[]` makes its condition valid only when the listed fields have a condition. `validateFilters(filters, specs)` returns `{ ok: true } | { ok: false, reason, filter }` (`invalid-id` `undeclared-field` `duplicate-field` `op-not-allowed` `bad-value` `multiple-not-allowed` `requires-unmet`); mocks and servers reject with it, while `filterRows` stays permissive. The wire shape is mirrored for non-TS servers by `@ap/contract-schemas` (`columnFilter`, `columnFilterSpec`).
- Filter line and editor (ADR-0105, node 1217b, `src/table/filterLine.tsx` · `filterEditor.tsx` · `filterFields.ts`). **Declaration:** a column is filterable with `PlatformColumn.filter?: ColumnFilterSpec` (wire meaning only) plus the display options `filterPinned?: boolean` and `filterLabel?: string` (default = `header`); a field that is not a column is `PlatformDataTable.filterFields?: TableFilterField[]`, `TableFilterField = { id; label: Text; spec: ColumnFilterSpec; pinned? }` (a components type, not a contract). Ids are unique across columns and `filterFields` and contain no `:`; a clash throws at render. The label (`filterLabel` ?? header, or the field's `label`) is the one name for the line, the editor, the funnel and the XLSX 조회 정보 row. **Filter line** (the left part of the result line, only when at least one field is filterable): pinned fields in declaration order as `상태 ▾` buttons that become the chip `상태: 사용중 ×` in the same slot (the body button is the same element, so focus stays); every other active condition as a chip after them in condition order (never collapsed into `+n`, they wrap); `+ 필터` (a list of every filterable field grouped 고정 / 열 / 기타, a field search once there are more than 8, a set field shows ✓ and its value, a field whose `requires` has no condition is listed `aria-disabled` with 「먼저 ‹label› 조건이 필요합니다」, ArrowUp/Down move through the items, choosing one turns the same popover into that field's editor); `모두 지우기` when any condition exists. A chip is 24px (`accent-primary-soft`, `border-subtle`); its text reads 「필드: 값, 값」 for a set (`in`) and 「필드 값-문구」 otherwise (table below), its body button edits and the × (24px, named 「‹label› 필터 지우기」) removes. **Header funnel:** an icon button in each filterable column header (`aria-label` 「‹label› 필터」, `aria-pressed` while the column is filtered; quiet until the header is hovered or focused, always visible while filtered). **One editor** (a dialog named by the field label; the entry points are `+ 필터`, a chip body, a pinned button and the funnel): a header row — the field label (left) and the operator `@ap/ui` Select (right, compact; no native `<select>`) listing only the field's `ops` (else every operator of its kind) in the `FILTER_OP_LABELS` words —, then the value control; a value control per kind — text input; number input(s) (`between` takes two, sorted); date input(s) (wall-clock; 「~부터」 / 「~까지 (포함)」 sent as an exclusive +1 day; `before`/`after` take one date); instant range (`datetime-local` in the viewer's zone sent as ISO instants, 「시작 (이상)」 / 「끝 (미만)」); enum checklist as a group with a value search (from 6 options) and the operators 다음 중 하나 / 다음 중 아님, a radio choice when `multiple: false`; no value control for `isEmpty`/`isNotEmpty`. Footer after a divider: `지우기` (left, ghost; clears this field) and `적용` (right, primary; disabled while the draft is incomplete). A reopened instant condition keeps its full ISO bounds (seconds, milliseconds) until the user edits that bound. **Apply is refused** (no write; the editor stays open with the draft and an inline translated reason) when the complete proposed list would break a codec cap (`filterParamLimit` under the default key `filter`): 20 conditions, 50 list items, 2400 encoded characters; 지우기 is never refused. **IME:** Enter inside a composition or right after `compositionend` never applies (the `PageFilterBar` guard, `filters/useImeEnterGuard.ts`); a plain Enter in any value input, including the enum value search, applies once. A `filterFields` id must not equal any column id (filterable or not). **Operator and chip words (ko; en in `FILTER_OP_LABELS`):** text `포함` → chip `필드 포함 "v"`, `포함하지 않음` → `필드 포함하지 않음 v`, `다음으로 시작` → `필드 "v"로 시작`, `다음으로 끝남` → `필드 "v"로 끝남`, `같음` → `필드 같음 "v"`, `같지 않음` → `필드 같지 않음 v`; number `같음`/`같지 않음`/`초과`/`이상`/`미만`/`이하` → `= n`/`같지 않음 n`/`초과 n`/`≥ n`/`미만 n`/`≤ n`, `범위` → `a ~ b`; date `범위`/`이전`/`이후` → `a ~ b`/`이전 d`/`이후 d`; enum `다음 중 하나` → `필드: 값, 값`, `다음 중 아님` → `필드 다음 중 아님 값, 값`; `비어 있음`/`비어 있지 않음` → `필드 비어 있음`/`필드 비어 있지 않음`. The XLSX 조회 정보 sheet uses the same value phrases. **Apply:** `적용`/Enter applies this one condition (one query, one history entry through `urlState.onChange`, page 1); Esc or an outside click discards the draft; a chip × and `모두 지우기` apply at once. Removing a condition also removes the conditions that `require` it. Focus returns to the opener: the header funnel, `+ 필터`, or the chip when the opener was a pinned button that turned into one (the opener wins over the result); when the opener is gone (a removed chip) it moves to `+ 필터`. **Modes:** with `urlState.filters` the editor reads and writes those conditions; without it the same UI drives the table's internal state (one condition per field, page reset, selection reset, export carries the filters) — behaviour of the #556b column filters. Not in this node: the rail removal (1217f).
- Select all results (#556c, [ADR-0104](../adr/0104-table-column-filters-selection-groups.md), opt-in `selectAllResults`, default off): once every row of the current page is checked and `total` is larger than the page, a bar above the rows offers 「필터 결과 전체 M행 선택」 (Gmail pattern); choosing it makes the selection `TableSelection = { kind: 'ids'; ids } | { kind: 'all'; excludedIds; total }` — an **exclusion model**: no id list is built or sent, state size is the number of excluded ids whatever the page count. In `all` mode rows on every page render checked unless excluded; unchecking adds to `excludedIds`, re-checking removes; the header checkbox is checked (indeterminate with exclusions) and clicking it clears the selection; the count reads 「전체 M행 선택」 / 「전체 M행 중 K행 제외」 and the bar offers 「선택 해제」. 「복사」 is disabled with a reason (copy reads loaded rows only). Sort and page changes keep the selection; column-filter, page-filter, Context and `filterKey` changes reset it through the Context identity. `total` is a display snapshot: at action time the server recomputes the set from Context + page filters + column filters − `excludedIds` and re-checks permission/Scope. `bulkActions(selectedIds)` keeps working for `ids` selections and is hidden in `all` mode; `bulkSelectionActions(selection: TableSelection)` renders in both modes. Export: `@ap/components` exports `TableExportRequest` (`scope: { kind: 'selected'; ids } | { kind: 'filtered' } | { kind: 'all'; excludedIds }`, `sorting`, optional `filters`) and `exportScopeIds(scope)` for menu helpers, which must handle `all-except` (support it or refuse it); a table that never enables `selectAllResults` never sends `all`. Tables without the prop render no bar and behave as before.
- Toolbar line and result line (node 1217c, `src/table/tableToolbar.tsx`, wiring in `PlatformDataTable.tsx`). **Toolbar line** — one row, every control 32px (`size="toolbar"`, same weight; ▾ only on a button that picks a value or opens a menu): left = the title (`h2`, truncates, full text in `title`) with a 24px ⓘ button whose tooltip carries `subtitle` (there is no second text line), then the optional **quick search slot**; right = `filters` (the narrow rail button), `그룹: 없음 ▾` (a menu button with a radio list, only when a column is `groupable`; replaces the native select), `표 크기: 보통 ▾` (node 1217d, below), `컬럼`, `복사`, `내보내기 ▾`, then `⋯` when something collapsed. A panel title (`useInWorkspacePanel`) stays screen-reader only (the `h2` is `sr-only`, no visible title), but the ⓘ stays visible in every mode when a description exists — the description carries the population and basis and has no other place on screen. **Quick search slot** — `PlatformDataTable.search?: ReactNode` (chosen over a declared config because the page already owns the field, its page key and its IME handling; the table only places it, max 20rem wide, shrinkable). `ManagementLayout` takes `search` and hands it to `table(filterSlot, search)`; it is shown whether or not the filter rail is rendered. Use `@ap/ui` `Input inputSize="toolbar"` (32px, `surface-sunken`, 13px). **Result line** — always rendered under the toolbar (`data-table-status-line`): left = the filter line when the table has a filterable field (it owns no border or padding of its own), right = `N건 · p/P쪽 · ● trust summary` (the former status row; the trust summary still drops to the one-line form only when it does not fit). A table without a filterable field shows only the right part. **Overflow (P10)** — the toolbar's own width decides: below 640px `복사` moves into `⋯`, below 520px `그룹`, below 470px `표 크기`, below 420px `컬럼`, below 300px `내보내기` (it becomes a submenu), in that order (표 크기 right after 그룹: both change what the rows show) and never reordered; the `⋯` menu lists what it holds in toolbar order (그룹 and 표 크기 submenus, 컬럼 opens the same popover anchored to `⋯`, 복사 disabled without a selection, 내보내기 submenu with the same items). A panel or board cell (220px) keeps the title and `⋯`. An unmeasured width collapses nothing. The band is 56px (`min-h-14`) on a page, 40px inside a workspace panel or board pane.

  **Table size (node 1217d, `src/table/tableSize.ts`, menu in `tableToolbar.tsx`)** — `표 크기: 보통 ▾`, a 32px menu button like 그룹 with a radio list 작게 / 보통 / 크게 (keyboard: Enter opens, arrows move, Enter chooses; in `⋯` a submenu). Body font and row height move together, the header takes the same row height and its own font step, through the section's CSS variables `--ap-table-font`, `--ap-table-head-font`, `--ap-table-mono-font` (`.t-mono`, one px smaller) and `--ap-table-row-h`; the virtualizer's row estimate is the same height. **The size is a step relative to the context baseline (P10), not an absolute size:** the baseline is today's row (32px row height, `text-sm` 13px, header 12px) in every context — page (compact or comfortable), workspace panel, board pane and board cell — and 작게 is −4px row height (12px body, 11px header), 크게 +8px (15px body, 14px header). 보통 adds no class, variable-driven style or width change: it renders exactly as before. 작게 additionally caps row buttons at 24px. Checkboxes (header and rows) stay 14×14 (`size-3.5`) and centred in every size: the 작게 button rule excludes `role=checkbox`. Row actions and `.t-mono` follow the size; pinned columns, header and body stay aligned (same widths). 크게 multiplies the DEFAULT column widths by the font ratio 15/13 (declared `size` or the 150px default); a width the user dragged (stored `sizing`) is untouched and 작게 keeps the defaults. **Persistence:** one per-user setting for all tables, not per table — browser: `localStorage['platform:table-size:<userId>']` per account (`small` or `large`; absent = 보통; a refused write keeps the choice in memory for the page); with the Kernel's server preference seam (ADR-0098) it is written through `usePreferenceController` `setTable('platform:table-size', size)`, i.e. under the hashed `columns:h1_…` key that table preferences already use (so no new server key shape), and shown from the server only. Tables on one page change together; it survives a reload.
- Row groups (#556d, [ADR-0104](../adr/0104-table-column-filters-selection-groups.md), opt-in): `PlatformColumn.groupable` columns feed a toolbar 「그룹: 없음 ▾」 menu (before 「컬럼」; 「그룹 없음」 default; absent when no column is groupable). Choosing one sends `TableQuery.groupBy: <column id>` — **one level**; a future multi-level form would be a new additive field (`groupBy: string[]`), not a type change — and returns to page 1, expands every group and **keeps the selection** (by row id). The server answers rows ordered by group key then the request sorting, plus `GroupedPageResult.groups: PageGroup[]` (`{ key, label, count, subtotals?, continued? }`) for each group that has rows on this page, each describing the **whole filtered result**. The table renders group header rows as virtual items keyed `group:<key>`: a sticky leading cell (collapse button with `aria-expanded`, name 「‹label› 그룹 접기/펼치기」, label, `N행 (전체 결과)`) and subtotal cells under columns declared `PlatformColumn.subtotal` (display only; labelled 「합계」 and, for assistive tech, 「전체 결과 합계」). `subtotal` follows ADR-0082: declare it only for a column whose reaggregation is `sum`; the server computes it and the table never groups or sums a server page. A group that starts on an earlier page repeats its header with 「(이어서)」 — shown only when the server answers `PageGroup.continued: true` (the table never infers it from counts). The leading label cell stops before the first `subtotal` column in the displayed column order (left-pinned, centre, right-pinned), so every subtotal stays under its own column; when the first displayed column is itself a subtotal column, the label and that total share its cell. Collapsing hides that group's rows on the current page only (state keyed by group key, reset on group/Context change); 「현재 쪽 전체 선택」 still covers collapsed rows and the count adds 「접힌 그룹의 N행 포함」. While grouped, `aria-rowcount="-1"` (unknown to a page-window) and `aria-rowindex` follows the rendered order (header rows included). Export stays flat rows. A table without a groupable column, or a response without `groups`, renders exactly as before. `groupPage(rows, { groupBy, sorting, subtotalColumns, accessor, page, pageSize })` in `@ap/contracts` is the mock endpoint's half: group key then **all** sorting keys (null/undefined/`''` normalized to one empty bucket, sorted last, and the sorting applies inside it), empty key = `''` labelled 「(값 없음)」, `continued` set on the page's first group when the row before the slice has the same key, sums only the declared columns.
- Row action
- 서버 페이징 표의 조회 신원과 내보내기 머리말의 전역 Context는 Condition 프리셋이 있는 메뉴에서 **적용된** 활성 프리셋의 축만 남긴 값(`useQueryContext()`)을 쓴다(§6.4, ADR-0083, #819). Apply 메뉴의 미적용 프리셋 전환이나 프리셋 밖 축의 변경은 (활성 프리셋과 다른 조회 입력 — page 필터·초기화 키 — 이 그대로일 때. 프리셋 키가 없어 조건 편집으로 추정 프리셋이 바뀌면 다시 조회한다) 표를 다시 조회하거나 선택을 버리지 않고, 프리셋이 없는 메뉴는 전과 같다.
- Width and chrome (#1166): a table narrower than its scrollport grows its unfixed columns (not selection/action, left-pinned or user-resized ones) in proportion to their size so it fills the width; wider, the row area scrolls horizontally. The right-pinned action column shows a `border-control` left edge. A header stays on one line, truncates with an ellipsis and names the full label in `title`; body cells keep wrapping anywhere. Inside a panel or board pane (`EmbeddedPane`) the table draws no border, radius or outer padding at any density.
- Export entry — 표 소유 내보내기(#173): `PlatformDataTable`이 `exportRows`·`exportNote` 계약으로 직렬화·파일·토스트까지 소유한다([ADR-0008](../adr/0008-table-owned-export-fixed-toolbar.md)). 선택 행 복사(#174)도 같은 게이트·직렬화를 쓰는 내보내기다. 아래 "표 내보내기·복사 구현 계약"

Baseline (Decided — `DESIGN.md` `table-density` 토큰과 일치):

```text
Row height       32px (최소, 데스크톱 기본)
Header height    32px (최소)
Cell padding     4px 16px
```

표의 결과 줄(예전 상태 줄, 오른쪽 부분)은 전체 Data Trust 줄이 자기 컨테이너(뷰포트가 아님)의 가로 공간(결과 수·갱신 중 표시와 간격을 뺀 나머지)에 들어가지 않을 때만 한 줄 요약(점 + 짧은 상태 + `자세히`)으로 줄이고 전체 항목은 팝오버에 둔다. 들어가면 전체 줄을 보인다. 판단은 보이는 형태와 별개로 전체 줄을 숨겨 둔 측정용 복사본(aria-hidden, 포커스·낭독 없음)의 폭으로 한다. 요약에서도 로직 버전 혼재는 경고 점과 접근 가능한 이름·`title`의 `로직 버전 혼재`로 남는다(§18). 고정 열(오른쪽 동작 열, 왼쪽 고정 열)은 머리·본문·hover·선택 행 모두 셀 전체가 불투명 배경이고, 행 영역이 가로로 넘치고 그 쪽 끝까지 스크롤하지 않은 동안 안쪽 가장자리에 20px 페이드(셀 자신의 pseudo-element, 포인터 무시)를 그려 반쯤 잘린 열의 글자가 보이지 않게 한다(#1166).

행 높이는 줄바꿈·포커스·24px 최소 타겟에 따라 32px보다 늘어날 수 있으며, coarse-pointer(터치) 행은 44px 타겟까지 커진다. 동작 열 버튼은 `toolbar`(32px) 크기라 동작 열 셀은 위아래 여백이 없고 행은 32px에 머문다.

표 높이·열 규칙([ADR-0037](../adr/0037-table-filter-consistency.md)): 행 영역은 내용 높이만큼이고 최대 `max(240px, R)`까지만 커진다(R = 스크롤 컨테이너 가시 높이 − 고정 머리 − 표 위쪽 내용 − 표 아래 쪽 넘김·형제 내용·본문 아래 여백, 맨 위로 스크롤한 상태 기준). 명시한 `height`는 분석 표의 상한이다. 선택 열은 선택을 읽는 기능(내보내기·복사, `bulkActions`)이 있는 표에만 있다. `rowAction`이 있으면 동작 열은 오른쪽에 고정하고(불투명 배경·왼쪽 경계선), 스크롤 영역이 사용자 왼쪽 고정 열 + 동작 열(128px) + 120px보다 좁아도 사용자 왼쪽 고정 열 + 72px + 120px 이상이면 동작 열은 72px 아이콘 전용 compact 형태로 계속 고정한다(`rowAction(row, { compact })`; 모든 동작은 같은 접근 가능한 이름의 아이콘 버튼·링크이고 툴팁이 가린 글자를 hover와 키보드 포커스에서 보인다, 공통 부품 `RowAction` — 같은 요소를 두 형태로 그려 compact ↔ 일반 전환에도 DOM 노드와 포커스가 유지된다). 그보다 좁으면 고정하지 않고 일반(글자) 형태로 스크롤에 섞인다. 동작 열은 사용자가 고정할 수 없고 저장되지 않는다. 행 영역은 기본으로 휠을 가둔다(`overscroll-contain`, 흐름 페이지·서랍). 작업 영역 패널이나 보드 칸 안에서는 본문도 스크롤하므로 행 영역 끝에서 휠이 바깥 컨테이너로 이어진다(`overscroll-auto`, #700).

숫자는 오른쪽 정렬하고 `tabular-nums`를 사용한다.

대규모 데이터에서는 브라우저에 전체 데이터를 전달하지 않는다. 서버가 선언 행 상한(`limits.maxRows`)으로 판정한다 — [실서버 연결 체크리스트](../integration/real-server-checklist.md) §3(#175).

표 URL 상태: 페이지 키 `page`는 1부터이며 생략=1, 정렬 키는 `<열 id>:asc|desc` 한 개다. 허용 열·키 이름은 페이지가 소유하고, 형식 오류는 보정하지 않고 거부한다(§6.4). 성공 응답(`ok`·`empty`)이 범위 밖 페이지이면 표가 마지막 페이지로 맞추고 페이지는 URL `page`를 replace로 고친다(0건이면 첫 페이지, 실패 응답은 맞추지 않음 — §19). 결정: 사용자, 2026-10-15, #314.

### 표 내보내기·복사 구현 계약

툴바 순서·메뉴 항목·거절 문구·시트 구성·파일 이름·복사 라벨·단축키 조건은 `PlatformDataTable` 테스트(`PlatformDataTable.test.tsx`·`PlatformDataTable.copy.test.tsx`·`PlatformDataTable.export-abort.test.tsx`·`tableExport.test.ts`)가 원본이다. 테스트가 고정하지 않는 다음 규칙을 함께 지킨다.

- 진행 안내용 sr-only `role="status"` 영역은 **항상 마운트해 두고 글자만 바꾼다**(채워진 채 나타나는 영역은 스크린리더가 읽지 않는다). 복사 안내와 내보내기 안내는 따로 두고, 한쪽이 끝나도 다른 쪽을 지우지 않는다.
- 내보내기 메뉴 항목은 그림자 없는 메뉴 전용 모양 + inset 초점 링을 쓴다. 공유 Radix primitive는 바꾸지 않는다. 복사 중에는 `aria-busy`와 함께 스피너를 보인다.
- 클립보드 경로는 오류 폴백이 아니라 **기능 감지**(`isSecureContext && navigator.clipboard.write && ClipboardItem`)로 고른다. 보안 컨텍스트는 클릭·keydown 안에서 `clipboard.write([ClipboardItem({ text/plain, text/html: Promise<Blob> })])`를 부르고 내용은 `exportRows`가 끝난 뒤 채운다(여러 페이지 선택도 전부 복사). Promise 값 `ClipboardItem`을 동기적으로 거부하는 브라우저는 비보안 경로(현재 페이지에 불러온 선택 행만)로 내려가며, 버튼과 단축키가 같은 경로를 쓴다.
- 비보안 경로는 클릭·keydown 안에서 document 수준 일회성 capture `copy` 리스너(text/plain·text/html 설정 + `preventDefault`)를 걸고 `execCommand('copy')`를 부르며, `finally`에서 리스너를 반드시 제거한다. 표 `section`에 리스너를 달지 않는다(Chromium은 이 이벤트를 selection 노드나 `<body>`로 보낸다).
- 글자만 복사하는 곳(상세 패널 링크 복사 등)은 `@ap/ui`의 `copyText`를 쓴다. 같은 기능 감지 규칙이다: 보안 컨텍스트는 `writeText`가 resolve해야 성공이고 거절은 실패로 알린다(폴백 없음). 비보안 컨텍스트는 위 capture `copy` 리스너 + `execCommand('copy')`이고, 리스너가 실제로 글자를 채워야 성공이다(#673).

### 메뉴 선언 Workbook 내보내기(#860)

표 하나의 내보내기(위, 데이터 + 조회 정보 2시트)로 담을 수 없는 파일 — 차트·요약·원본·조회 정보를 메뉴가 정한 이름의 여러 시트로 — 은 `@ap/components`의 `useWorkbookExport()`로 만든다. 메뉴는 `exportWorkbook(build, { fileName?, trust? })`에 `WorkbookSheet[]`(`name`, 선택 `header`, `rows`: 문자열·숫자·`null` 셀)를 돌려주는 `build(signal)`를 주고, 게이트·직렬화·파일·토스트는 SDK가 소유한다. 결과는 `'done' | 'refused' | 'too-large' | 'failed' | 'cancelled' | 'ignored'`라 메뉴는 성공일 때만 대화상자를 닫을 수 있다.

- 게이트는 manifest `features.export`다(`canExport`가 거짓이면 아무것도 하지 않고, 메뉴는 버튼을 숨기거나 비활성으로 둔다). 진행 중 두 번째 호출은 무시하고, `cancel()`·unmount는 `build`의 `signal`을 끊어 조용히 끝낸다. `build`가 스스로 낸 `AbortError`·`TimeoutError`는 서버 `timeout` 거절과 같이 시간 초과로 알린다(결과 `refused`). 서버 조회가 거절되면 `build`가 `WorkbookRefusal(response)`를 던지고, SDK가 표 내보내기와 같은 원인·다음 행동·서버 세부(메시지·correlationId)를 토스트로 보인다(§26). 진행 중 표시는 메뉴 몫이다(`exporting`으로 버튼을 busy로) — SDK는 끝만 알린다.
- 시트 이름은 Excel 규칙을 따른다: 1–31자, `: \ / ? * [ ]` 없음, `'`로 시작·끝나지 않음, 제어 문자 없음, `History` 아님, 대소문자 무시 중복 없음. 이것과 시트 0개·21개 이상은 메뉴 선언 결함이라 개발 중 콘솔 오류와 일반 실패 토스트다.
- 셀: 숫자는 숫자 셀(비유한 값은 빈 셀), 문자열은 문자열 셀로 수식으로 실행되지 않는다(표 XLSX와 같다). 설비 wall-clock 문자열은 날짜로 바꾸지 않고 원형 그대로, `null`·`''`는 빈 셀(머리 줄도 같다), 32,767자를 넘는 글자는 표와 같은 표식으로 자른다.
- 상한(`WORKBOOK_LIMITS`): 시트 20개, 시트마다 100,000행(표 내보내기 상한과 같음)·16,384열(Excel 폭), 셀 합계 2,000,000개. 파일을 사용자 브라우저 메모리에서 만들기 때문이고, 행·열·셀 상한을 넘으면 "필터를 좁혀 주세요" 경고 토스트를 띄우고 파일을 만들지 않는다. 더 큰 파일은 서버 비동기 내보내기(#555) 몫이다.
- 파일 이름은 `<fileName 또는 메뉴 id>-<yyyyMMdd-HHmm>.xlsx`다. 메뉴 id는 `A-Za-z0-9._-` 밖 글자를, 메뉴가 준 `fileName`(한글 가능)은 OS가 받지 않는 글자(`\ / : * ? " < > |`)와 제어 문자만 `-`로 바꾸고, 남는 글자가 없으면 메뉴 id를 쓴다. `trust.provisional`이면 표처럼 `-provisional`이 붙고 토스트에 잠정 데이터 안내가 붙는다. `write-excel-file/browser`는 표와 같이 클릭 때 지연 청크로 불러온다. 순수 함수 `checkWorkbook`·`toWorkbookXlsx(sheets, signal?)`도 공개한다. 세부는 `workbook.test.ts`·`useWorkbookExport.test.tsx`가 고정한다.

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

페이지 필터 행과 입력 primitive는 `PageFilterBar`가 공통화하고 초안 값·변경 수는 `useFilterDraft`가, 적용의 `page: null`과 초기화 배선은 `useManagementFilters`가 맡지만, 메뉴는 필터 의미·URL page key·초기화 키 목록·적용 patch 구성(검증 포함)을 소유한다. 이 경계는 표 툴바의 컬럼·복사·내보내기 동작을 바꾸지 않는다(ADR-0016).

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

원천이 확인한 문제가 없을 때 한 줄로 압축할 수 있다(`clear`는 '건강' 선언이 아니다, §19).

```text
● 확인된 이슈 없음 · Coverage 98.7% · Updated 10:32
```

상세는 Popover로 확장한다.

숫자를 보이지 않는 절(예: 지표 상세의 정의)에는 Data Trust를 그리지 않는다. 응답 봉투의 trust는 그 조회의 신뢰이지 절이 말하는 대상(버전의 발행·초안·폐기 상태)의 신뢰가 아니다(사용자 결정 2026-10-13, #299).

### Data Trust를 페이지마다 새로 설계하지 않는다

플랫폼 공통 모델로 최소 다음 의미를 정의한다.

- freshness
- calculation basis time
- coverage
- completeness / provisional state
- metric version
- source logic versions
- source / lineage entry

실제 값의 계산 책임은 Backend/Data layer에 있고 UI는 이를 표준적으로 표현한다.

**원천 로직 버전(`Trust.sourceLogicVersions`, Decided — 사용자 컨펌 2026-10-28, A안, #1008):** 조회 구간에 쓰인 파서 로직 버전의 목록이다. 파서는 insert-only라 로직이 바뀌기 전에 쓴 행을 다시 채우지 않으므로 한 구간에 여러 버전이 섞일 수 있다. 값은 서버가 주는 불투명 표시 문자열이고(semver로 해석하지 않음) 배열 순서는 의미가 없다 — 클라이언트는 정렬하거나 "최신"을 추정하지 않는다. 있으면 비어 있지 않은 배열이고 항목은 서로 다른 비어 있지 않은 문자열이다. 서버가 모르면 **필드를 생략**하고 `[]`로 보내지 않는다(적합성 검사가 `[]`를 위반으로 본다). 표시 규칙: 둘 이상이면 지표에 "원천 로직 버전 혼재"를 드러내고, 하나면 Trust 상세에만 보이며, 필드가 없으면 아무것도 보이지 않는다 — "모두 같은 버전"이라는 가짜 판정을 만들지 않는다(가짜 정상 금지와 같은 원칙, §19). 보이는 형태는 **Decided (사용자 컨펌 2026-10-28, A안 — 잠정 배지 옆 「로직 버전 혼재」 배지, 상세에 「원천 로직 버전」 한 줄, 좁은 헤더는 주황 점+읽기 이름)**이다([실제 앱 시안](https://claude.ai/artifact/EouSRL2bwf2W3JGLPt2WBD)). 혼재 배지는 잠정 배지와 함께 폭을 양보하고, 상세는 서버가 준 순서대로 표시한다. 접근 이름은 펼친 요약이 「데이터 신뢰 · 로직 버전 혼재」, 축약 요약이 상태·커버리지·갱신에 혼재 문구를 붙인 요약 이름이다(명시적 aria-label이 보이는 배지 글자를 가리므로).

---

## 19. Loading / Empty / Error Taxonomy

`No Data` 하나로 합치지 않는다.

최소 상태:

```text
Idle (not yet queried / required conditions missing)
Loading
Refreshing same context
No matching result
Not collected
Processing delayed
Insufficient coverage
Permission restricted
Query too large
Query timed out
Partial widget failure
Server error
Unknown
```

### 규칙

- QueryState는 idle/loading/refreshing/done과 response, missing, completedAt(number|null), refetch를 제공한다. Apply 게이트의 idle은 중립적인 “아직 조회하지 않았습니다”와 번역된 누락 사유 목록이며 skeleton·empty·오류가 아니다. 같은 페이지의 조회 바가 지금 모든 누락 항목(같은 `key`)의 사유를 그리고 있으면 목록을 빼고 “위 조회 조건의 안내를 확인하세요.” 한 줄만 둔다(칸의 바도 같다). 바가 일부만 덮거나(초안은 고쳤지만 적용 전이라 적용값 기준 누락이 남는 경우), 바가 없으면 목록을 그대로 둔다(#1170). 이전 결과·시각을 즉시 가리고 진행 요청을 취소하며 늦은 응답을 버린다. refetch·refreshEpoch도 닫힌 게이트를 열지 않는다. 기존 enabled=false·Scope 검증·live 의미는 유지한다. 신원이 바뀌면 *이전 신원의* 결과를 즉시 가린다. 같은 신원의 결과가 메모리(5분 이내)에 남아 있으면 다시 읽는 동안 `refreshing`으로 보인다(공유 키를 가진 메뉴·목적지 조회만, ADR-0086). 열려 있지 않은(`enabled=false`·준비 전) 인스턴스는 자기가 열려 있을 때 수락한 결과만 보이고 다른 칸이 같은 키로 읽은 결과는 보이지 않는다. 세션 세대(어댑터·revision·사용자)가 바뀌면 이전 세대의 결과는 보이지도 남지도 않는다. 같은 키(메뉴 조회는 엔드포인트·투영 Context·입력, 목적지는 ref)의 열린 인스턴스는 요청 하나를 나누고, 조회 중(오프라인 대기 포함)에 열린 인스턴스가 하나도 남지 않으면 진행 요청을 취소한다. 쓰기 `invalidates`는 그 엔드포인트의 진행 중 읽기(첫 읽기 포함)를 취소하고 다시 읽는다(ADR-0054·0086).
- completedAt은 현재 identity에 수락한 모든 종결 응답(오류·timeout·클라이언트 합성 오류 포함)의 클라이언트 epoch ms이며 trust.updatedAt(원천 갱신 시각)과 다르다. 동일 identity refresh는 이전 결과·시각을 유지하고 완료 때 갱신한다. 다시 마운트한 인스턴스가 메모리에 남은 같은 신원의 결과를 보일 때도 그 결과의 `completedAt`(원래 수락 시각)을 보이고 다시 읽은 응답으로 갱신한다. identity 교체·idle에서는 둘 다 null이고 취소·stale 응답은 시각을 찍지 않는다. 초안 편집만으로 적용 결과·시각을 무효화하지 않는다.
- `Not collected`, `Processing delayed`, `Insufficient coverage` 등 원인을 주장하는 상태는 Backend/status source가 현재 요청 Context에 대해 그 원인을 확인한 경우에만 표시한다. 상태 원천과 관측 기준시각을 연결할 수 있어야 하며, UI가 행 수만으로 원인을 추론하지 않는다.
- 성공한 조회가 0건이라는 사실만 확인되면 `No matching result`를 표시한다. 원인/가용성 상태를 확인할 수 없으면 `Unknown`으로 표시한다. **0건 ≠ 수집 중단·미수집·파서 지연**이다. 권한 제한 역시 서버가 확인한 경우에만 그 사유를 표시한다.
- 상태 원천이 아직 없거나 원천 조회에 실패했다면 원인을 단정하지 않는다. taxonomy의 존재가 해당 상태 판정 기능의 구현을 뜻하지 않는다.

**사용자 문구 (Decided, 사용자 2026-10-15, #304, [ADR-0034](../adr/0034-user-facing-copy-no-contract-vocabulary.md)):** 사용자에게 보이는 문구에는 계약 상태어(Candidate·Open·Deferred), 상태 enum 원문(`unknown`·`source_unavailable`·`clear`·`unsupported`·`apply`), 수식 표기(`[from, to)`, 초 정렬), 계약 문장(세션값을 자동 적용하지 않는다, 다른 Scope로 조용히 대체하지 않는다)을 쓰지 않는다. 이미 있는 번역 라벨(참조만, 이 화면에서 미사용)을 쓴다. 서버 `message`는 본문에 넣지 않고 Correlation ID 옆 세부(접근 가능한 이름)로만 보인다. 본문은 계약 오류 코드별 원인과 행동이며, 매핑되지 않는 코드는 일반 오류 문구다. 이 문단은 문구 원칙이고 §19 상태 분류와 `outcome` 분기는 바꾸지 않는다.

### 공유 위젯 응답 (Decided, 사용자 2026-10-04, #55 B안)

- 페이지에서 `outcome ∈ {error, timeout, empty}`·`message`·확정된 empty 설명(`explainsEmpty && state === confirmed`)의 근거 전체가 같은 위젯이 두 개 이상이면 한 그룹으로 묶는다. 평가 순서는 무관하며 원천·관측시각·설명이 다르면 묶지 않는다. `forbidden`, `too_large`, `ok`, 알 수 없는 상태는 묶지 않는다. 같은 응답에서 수집·상위 시스템 원인을 추론하지 않는다.
- 각 그룹은 본문 상단에 Callout 배너 하나를 표시한다: 의미 아이콘·§19 상태 제목·“위젯 N개에서 같은 응답(서버 오류)이 확인되었습니다” 형태의 한/영 요약·그룹의 모든 조회를 다시 실행하는 재시도 하나. 배너에는 Correlation ID를 표시하지 않는다. 여러 그룹이 있으면 모두 표시하며 큰 그룹이 먼저다.
- 그룹 위젯은 이름을 유지하는 중립 간결 상태로 표시한다. 제목·아이콘에만 의미 톤을 적용하고 본문(시간 초과 조언 포함)을 직접 노출한다. 개별 재시도와 Correlation ID는 위젯에 남긴다. 좁은 카드에서는 본문을 독립 행에 놓고 동작·ID는 다음 행에서 줄바꿈한다. Consumer가 같은 제목을 바로 위에 보여주면 중복 visible 제목은 생략하고 등록·접근 이름은 유지한다.
- **얇은 띠 (fill 페이지, Decided, 사용자 2026-10-23, #680, [ADR-0075](../adr/0075-page-head-one-line-fold-thin-outcome-strip.md)):** `layout="fill"` 페이지의 배너는 한 줄 띠다 — 아이콘, 짧은 상태 접두(`서버 오류 ·`), 요약 문장(줄이면 `title`로 전체), `자세히`(Popover만: 클릭·Enter·Space — 상태 제목과 전체 요약을 보이고, Popover의 접근 이름은 그 상태 제목이다), `다시 시도`. 같은 `data-outcome-banner`·`role=group`·이름·live 안내·danger/neutral 톤·그룹당 하나(큰 그룹 먼저)·재시도 busy·중복 활성화 방지·포커스 복귀 규칙이다. 띠가 사라질 때 `자세히`가 열려 있으면 먼저 닫고 포커스가 그 띠 자신의 Popover 안에 있을 때만(다른 그룹의 Popover는 아니다) 아래 복귀 대상으로 간다. 요약 문장을 줄이고 `title`로 전체를 주는 것은 띠에서만 허용하고 전체 배너는 문장을 그대로 둔다. flow 페이지와 `DetailDrawer`는 전체 배너를 쓴다.
- error/timeout 배너는 danger, empty 배너는 neutral이며 보이는 배너는 non-live `role=group`이다. scope는 처음부터 빈 assertive/polite live region을 유지하고, danger 요약은 assertive 채널, neutral 요약은 polite 채널의 문구를 갱신해 한 번 안내한다. 보이는 배너와 위젯은 별도 live 채널을 만들지 않는다. 그룹 위젯은 live region 없는 이름 있는 group으로 두어 같은 응답을 반복 announce하지 않는다(§26). 한 위젯만 실패하면 배너 없이 기존 전체 StateMessage를 유지한다.
- 그룹 재시도 중에는 배너 버튼이 busy 상태를 표시하며 중복 활성화를 막고 폭·포커스를 유지한다. 그룹별 갱신 문구는 기존 알림 채널 한 곳에서 안내한다. 각 위젯의 `aria-busy`는 유지하되 반복 `role=status` 갱신 label은 표시하지 않는다. 배너가 사라질 때 포커스가 그 안에 있으면 이름 있는 상세 패널(dialog) 또는 `main` 랜드마크(셸 밖에서는 페이지 본문 요소)로 이동하며 다른 곳으로 이동한 포커스는 빼앗지 않는다. 페이지 본문 주위에 랜드마크를 더하지 않는다.
- 그룹에 속한 empty 위젯에는 개별 retry와 Correlation ID를 추가한다(확정된 사용자 결정). 한 개뿐인 empty 위젯은 기존 표시·emptyAction을 그대로 유지하며 retry·ID를 추가하지 않는다.
- DetailDrawer는 페이지와 독립된 scope 및 상세 상단 배너를 제공하며 두 표면의 위젯을 함께 묶지 않는다. 위젯 이름이 없으면 visible 이름·접근 이름을 발명하지 않는다. 보이는 이름은 non-heading label과 aria-labelledby로 연결하고 이름을 숨길 때만 aria-label을 사용한다.
- `PlatformPage`가 페이지별 scope와 배너 위치를 제공하고 `QueryView`가 현재 응답·refetch·선택적 위젯 이름을 가장 가까운 scope에 등록한다. `PlatformDataTable`도 `ariaLabel`을 위젯 이름으로 같은 scope에 등록한다(그룹이면 이름 줄 없이 간결 상태, 재시도는 표 재조회, 혼자이거나 scope 밖이면 기존 전체 상태). scope 밖의 QueryView는 기존 동작을 유지한다. 등록 갱신·그룹 판정 방식과 결정 배경은 [ADR-0017](../adr/0017-shared-outcome-banner.md)을 따른다.

### 가공 상태 원천과 트레이스 노출 수준 (Decided, 2026-09-26)

- **원천:** 설비·기간별 가공(수집→변환→파싱→적재→검증) 상태의 `statusSource`는 **적재 워커의 단계별 처리 결과 보고**다. 플랫폼이 적재 결과 행 수로 원인을 추론하지 않는다. 보고 스키마와 파서 저장소 변경은 [01 가공 상태 보고](../architecture/architecture-and-data-contract.md#processing-status-report)를 따른다. 이 원천이 구현되기 전까지 07/08의 수집 상태 위젯 보류 결정은 유지된다.
- **사용자용 가공 상태 조회(분석 공간):** 단계별 상태, 원인 분류(예: 파일 미수신, 형식 오류, 처리 대기), 원천이 제공한 경우의 예상 해소 시점, 현재 Context를 담은 "VOC로 문의" 동작을 보여준다. 원시 오류 메시지·스택·단계 로그·재처리 동작은 노출하지 않는다.
- **개발자용 트레이스(운영 콘솔):** 같은 원천의 원시 오류, 단계별 로그, 재처리 동작까지 보여준다. 원문 로그·설정 파일 drill-through는 [05](../overview/roadmap-and-open-questions.md#결정-상태)의 defer 결정을 따르며 이 결정으로 열리지 않는다.
- **가공 실패는 별도 상태가 아니다(2026-09-28):** 적재 워커가 실패를 보고해도 사용자 화면은 `Processing delayed` + 원인 분류(예: 원천 형식 오류, 처리 오류)로 보인다. 사용자에게 실패와 대기는 모두 "아직 가공되지 않음"이고 대응 경로(VOC 문의)도 같다. 실패·재시도 구분은 개발자용 트레이스가 보인다. 원인 분류 목록은 [적재 워커 상태 기록 스키마](../integration/ingest-status-schema.md) §4를 따른다.
- 두 화면은 같은 원천을 공유하고 표시 수준만 다르다. 사용자에게 보이는 상태와 내부 처리 상태를 자동으로 동일시하지 않는다(FO ADR-0005 원칙과 같음).

### 응답 스키마 형태 (Decided; 필드명·enum 문자열은 Candidate)

위젯/조회 단위 응답은 두 층으로 구성한다.

1. **`outcome`(배타값):** `ok | empty | error | forbidden | too_large | timeout`. `empty`는 성공한 조회의 0건을 뜻하며, 본 조회 자체가 실패했다면 빈 배열 유무와 무관하게 `empty`가 아니라 `error`다. `error`는 나머지 구체 값에 해당하지 않는 잔여 실패다. `too_large`는 선언한 한도(`limits.maxHours`·`maxRows`)를 넘은 조회다 — 판정 기준과 순서는 [실서버 연결 체크리스트](../integration/real-server-checklist.md) §3이다(#175).
2. **`assessments[]`(이름 Candidate):** 그 조회 계약이 선언한 **적용 kind**를 빠짐없이 1회씩 담는다. 각 항목은 `state = confirmed | clear | unknown`이다. 플랫폼이 kind **어휘**를 소유하고, 각 조회 계약(공개 스키마/메뉴 선언)이 그 조회에 **적용되는 kind 목록**을 선언한다. 원천이 아직 미구현이라는 이유로 적용 kind를 목록에서 빼지 않는다 — 그 경우 `unknown`으로 응답한다(의미상 해당하지 않는 kind만 목록에서 제외). 적용 목록의 누락·중복·잘못된 상태 조합은 응답 계약 위반이며, 클라이언트는 생략을 `clear`로 보정하지 않는다. **예외(2026-10-01):** 요청이 적용 집합 키에 명시적 공집합(§6)을 실어 원천 조회를 하지 않은 경우, 응답은 `outcome=empty`에 `assessments` 없음·Trust 없음이다(평가할 원천 결과가 없다). 클라이언트는 요청에 명시적 공집합이 있을 때만 이 모양을 계약 위반으로 보지 않는다. 현재 kind 어휘(이름 Candidate)는 `collection`·`processing_delay`·`coverage`·`time_domain`·`respondent_history`이며, 새 kind는 플랫폼 어휘 변경이다(메뉴 단독 추가 불가).

`clear`는 "그 kind가 표현하는 문제가 해당 Context에 없음을 원천이 실제로 확인했다"는 제한적 주장이며 전반적 데이터 건강/완전성 선언이 아니다(가짜 `clear` 금지). `confirmed`/`clear`는 논리적 `statusSource`(원천 서비스 id)와 `observedAt`이 필수다. `unknown`은 생략하지 않으며 `source_unavailable`/`check_failed`(현재 코드 어휘)와 `retention_expired`(원천 보존 기간 밖, 적재 워커 스키마 합의 뒤 추가 — 이름 Candidate) 같은 평가 불가 이유를 명시한다.

`Loading`/`Refreshing same context`는 이 응답 페이로드에 없다(클라이언트 요청 생명주기). `Partial widget failure`는 위젯 결과가 섞일 때 페이지가 종합해 도출한다.

`explainsEmpty`(이름 Candidate)는 `outcome=empty`이고 해당 평가가 `confirmed`이며 원천이 **그 요청 결과의 0건 원인**을 확인한 경우에만 true다(기본 false). UI는 배열 순서·행 수로 인과를 추론하지 않는다. 복수 원인이 확인되면 모두 유지한다. `No matching result`만 보이는 조건은 `outcome=empty`이고 표시할 `explainsEmpty=true` finding이 없을 때다 — 원인 원천이 없다는 것이 `empty`의 필수조건은 아니다.

개별 원천 서비스의 실제 구현·응답 스키마 세부는 Open이며, 이 계약이 그 구현을 뜻하지 않는다.

---

## 20. Detail Surface Contract

### Drawer

셸 고정 상세 슬롯과 상호작용은 §13 DetailDrawer 계약을 따른다.

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

## 23. Design Tokens

> 디자인 시스템 원본은 SDK `@ap/ui`가 소유한다([ADR-0043](../adr/0043-platform-sdk-is-the-app-contract-and-unified-framework.md), [ADR-0046](../adr/0046-design-system-source-moves-to-platform-whole-package.md)). 기능 화면은 SDK 부품을 `@ap/ui`에서 직접 소비하고, `@ap/feature-ui`는 기능 도메인 표현 부품을 소유한다.


**한/영 지원 범위(Decided, 2026-09-24):** UI 문구와 정적 본문만 번역한다. VOC·공지의 사용자 입력 본문, EquipmentID·room_name·분임조 이름 등 마스터 값과 식별자는 번역하지 않는다. 언어 설정은 `PlatformProvider.serverPreferences`를 켠 조립에서 사용자 설정 포트로 서버에 저장한다. 해당 옵션이 없는 조립은 브라우저 localStorage를 사용한다. 저장 포트와 이전 범위는 [Kernel §4](kernel.md)와 ADR-0098을 따른다. 언어 변경이 Context 값이나 URL 식별자를 바꾸지 않는다. CJK 폰트는 FO ADR-0058의 Inter + Pretendard Variable 소비 계약을 따른다.

### Token value source (Decided — ADR-0011)

공유 색·반경·간격·폰트·본문 값의 원본은 플랫폼이다: [tokens.css](../../packages/sdk/ui/src/styles/tokens.css)·[semantic.css](../../packages/sdk/ui/src/styles/semantic.css)·[theme.css](../../packages/sdk/ui/src/styles/theme.css)·[compat.css](../../packages/sdk/ui/src/styles/compat.css)는 FeedbackOps `a8d768b8`에서 `@ap/ui`로 옮겼고([ADR-0046](../adr/0046-design-system-source-moves-to-platform-whole-package.md), #441) 값은 그대로다. 소비 순서·본문·레이어 없는 webfont 규칙은 [FO ADR-0058](../adr/history/feedbackops/0058-tailwind-v4-css-first-theme.md) §2(이전 시점의 설명)를 따른다. 기능 `@ap/feature-ui`는 SDK의 토큰·primitive를 소비하며 도메인 배지·선택기·관계 표현을 소유한다. 공유 디자인 토큰의 별도 사본을 소유하지 않는다. 플랫폼이 별도 값 스케일을 만들지 않는다([ADR-0011](../adr/0011-design-direction-feedbackops-shell.md)).

플랫폼 전용 theme 키·차트/카테고리/아이콘 색·`t-*` 역할·반응형/detail-panel 확장과 label/control pairing의 설계 원본은 [DESIGN 플랫폼 확장](../../DESIGN.md#platform-extension-layer) 및 [허용 전경/표면](../../DESIGN.md#allowed-foregroundsurface-pairs)이다. `packages/sdk/ui/src/styles/`는 그 구현을 소유한다(플랫폼 확장 값은 `platform-tokens.css`). 제거된 어두운 navigation 확장은 다시 도입하지 않는다.

### Semantic Colors

Component에서 Tailwind primitive 색을 직접 의미로 사용하지 않는다. 의미 토큰 이름·값은 `packages/sdk/ui/src/styles/theme.css`와 [DESIGN](../../DESIGN.md#platform-extension-layer) 플랫폼 확장 층이 소유한다.

Shadow보다 Border를 기본으로 하고 Shadow는 Popover/Dropdown/Drawer/Modal 같은 floating surface에 제한한다.
