# 공통 컴포넌트

> Scope: PlatformDataTable·DetailDrawer·DataTrustIndicator 등 공통 컴포넌트 계약과 디자인 토큰.  
> 포함 절: §13, §14, §15, §18, §19, §20, §23  
> 색인과 「절 → 문서」 대응표: [06. Platform UI Contract](platform-ui-contract.md)  
> 상태 표기(Decided / Candidate / Open / Deferred): [문서 소유권과 결정 상태](platform-ui-contract.md#문서-소유권과-결정-상태)

## 13. Shared Component Layers

### 페이지 조건 레이어 (Candidate, #2339)

`PageConditionLayer`는 `PageConditionCategories`의 선언 순서·범주별 「지우기」·section 접기를 담는 비모달 편집 표면이다. 제목은 「페이지 조건」이며 전역 Context(기간·Scope·Condition·Selection 등)는 읽기 전용 요약과 「조회 조건에서 바꾸기」 진입으로만 제공한다. 전역 편집은 기존 Context 바에서 한다. body overlay의 위치·폭·쌓임은 [Layout §8](layout.md#8-shell-slots)이 소유한다. 적용 모드에서 층이 열려 있는 동안 조회 줄의 「적용」은 같은 자리에서 비활성이 되고(`QueryBarExtension.applyHint`, 툴팁·보조 설명) 층 바닥 「적용」이 하나뿐인 적용 동작으로 남는다(같은 draft·같은 `apply`). 층 머리의 전역 Context 요약은 적용 대기 중인 조회 조건 변경 건수를 함께 알린다. 둘 다 시안 단계의 Candidate이며 소유자 확인으로 되돌릴 수 있다.

`PlatformPage`가 메뉴 선언을 읽어 자동 조립한다. 메뉴는 동적 옵션이 있으면 S2의 `usePageConditionOptionsLoader` 결과(`loadOptions`, `ready`)와 옵션 입력 신원(`inputsKey`)만 `pageConditionOptions`로 전달한다. SDK가 세션 세대·Scope·Context와 합쳐 옵션 요청을 취소/재시작한다. 선언 키의 요약은 S1 파생 함수가, 나머지 키의 요약은 메뉴의 `queryBarExtension`이 소유한다. 동적 요약에서 확인되지 않은 옵션은 원래 id를 보존한다.

트리거는 `aria-expanded`·`aria-controls`를 가지고, 범주별 칩 ×와 「모두 지우기」는 레이어 소유 page key만 지운다. Apply 메뉴에서는 초안만 바꾸고 「미적용 변경 있음」을 남긴다. 전역 Context와 패널 필터는 지우지 않는다. 여러 키를 가진 date/groupedChecks도 범주당 칩 하나다. `~none`은 「선택한 항목 없음」이고 제약 없음과 다르다.

레이어는 `role=dialog`, `aria-modal=false`, 제목 연결을 가지며, 열 때 제목으로 포커스를 옮긴다. 필수 범주 누락이나 codec 문제가 있으면 자동으로 열고 첫 문제 범주로 포커스를 옮긴다. 그 밖에는 닫힌 채 시작한다. 바깥 클릭으로 닫히지 않으며 결과를 읽거나 Tab으로 레이어 밖으로 나갈 수 있다. Esc는 포커스가 안에 있을 때만, 내부 Select/popover가 먼저 받은 뒤 한 단계씩 닫는다. 닫으면 트리거로 복귀한다. 닫힌 동안 적용 요약이 바뀐 경우만 마운트된 polite 영역에서 한 번 알리고, 열기·닫기 자체는 알리지 않는다.

Apply footer의 「적용」·「되돌리기」는 Context 바와 같은 `useQueryDraft` 동작이다([Kernel §11](kernel.md#11-global-context-bar)). live 메뉴는 footer Apply가 없고 변경마다 `setPage`로 반영한다. 한 번 연 세션의 첫 변경만 push하고 나머지는 replace하여 뒤로가기 한 번으로 진입 전 조건으로 돌아간다. 열림 상태는 저장하지 않는다. pin·전역 편집은 범위 밖이다. 시각은 소유자 캡처 확인 전 Candidate다.

> 디자인 시스템 원본은 SDK `@ap/ui`가 소유한다([ADR-0043](../adr/0043-platform-sdk-is-the-app-contract-and-unified-framework.md), [ADR-0046](../adr/0046-design-system-source-moves-to-platform-whole-package.md)). 기능 화면은 SDK 부품을 `@ap/ui`에서 직접 소비하고, `src/ui`는 기능 도메인 표현 부품을 소유한다.


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

### PanelWorkspace menu-declared panel actions

Decided (#2432). `PanelWorkspaceProps.panelMenuItems?: (panelId: string) => readonly { id: string; label: Text; onSelect: () => void }[]` lets a menu declare actions for each active panel. Translated items follow **all** platform items (collapse/float included), preceded by one separator. Absent or empty results leave the existing menu unchanged. The SDK does not filter primary panels: the menu decides by returning items or an empty list. Items use the existing dropdown keyboard selection, close and trigger-focus return behavior. Selection calls `onSelect`; the SDK owns no menu content or panel presentation state.

`PanelWorkspaceProps.analysisPanelAddition?: AnalysisPanelAddition` (#2734)는 `PanelAddItem` 목록과 `onAdd(draft: AnalysisPanelDraft)`를 받는다. 작업 영역은 이미 표시하거나 접거나 띄운 패널을 제외하고, 차트는 현재 메뉴에서 분석 선택 키를 읽는 패널을 고른다. 추가 요청은 `{ source: '<menuId>/<panelId>', inputs: { [outputKey]: AnalysisSelection } }`다. 작업 영역을 조립하는 메뉴는 이 요청으로 패널을 열고, 패널은 URL의 선택 입력을 따라간다. 이 옵션을 생략하면 차트에서 패널을 추가할 수 없다.

### Panel recipe

Decided (#2471, look confirmed in #2432). `panelRecipe({ panel, menu, context, host, labels?, shape?, code? })` builds a panel's recipe from the Registry panel (`registry.panels(menuId)`), the menu's `features` and the hosting workspace's facts (`add`, `pin`, `hide`, `layout`, `maximize`, `range`, optional `image` and `csv`); the SDK reads no menu-only declaration field. Annotate and CSV follow `features` (CSV needs a chart piece or `host.csv`), empty and error states follow a `QueryView` piece, the permission note lists the grants registration derived, link is always on (Kernel URL contract) and audit stays unknown. Words for page keys, grains and output actions, the shape name and code line counts are optional menu inputs; a missing word shows its id, and without `code` the summary drops the line count. `PanelRecipeBack` draws three columns (menu → SDK → platform); `PanelRecipeFrame` swaps front and back and returns focus to the frame when closed from inside; its `back` render prop may be a lazy component, with the front shown while it loads.


### PanelWorkspace edge collapse, peek and float

Decided (#2435, owner-confirmed c3, 2026-11-17). Every `PanelWorkspace` enables left and top edges and in-workspace Dockview floating groups by default. BoardDock is unchanged. Nothing starts collapsed. Panel `⋯` offers «왼쪽으로 접기», «위로 접기», «띄우기»; the primary panel can never collapse or float. `collapse?: false | { summary?: Text }` removes collapse actions or supplies the summary; `float?: false` removes floating; workspace `edges?: ('left' | 'top')[]` defaults to both and limits collapse destinations. The deprecated `minimize.summary` is a fallback for `collapse.summary`; there is no minimize button.

The left rail is 36px (`w-9`), with 32px `icon-sm` buttons. Panel `icon?: LucideIcon` uses the same type as existing SDK icon declarations; absent icons use the translated title's first character. `@ap/ui` Tooltip shows the title on hover and keyboard focus. The top strip shows a single truncated «title · summary» line with full title/accessible name and a bottom border on the peeked item. Both strips are toolbars with arrow-key roving focus, Home/End and native Enter/Space activation. Loading never moves focus; closing peek returns focus to its edge button.

Peek is a non-modal temporary floating group to the right of the rail or under the top tab's x position. It starts 48px below the dock top, leaving the first group header visible, and fits measured content plus its single tabbar header within 560×440 and the available space below that offset. For fill-height content its body height floor is the largest of 200px, the panel's preferred height and its minimum height, still capped with the header at 440px and the available space. Long content scrolls in the panel. Outside click, Esc and re-click close it; «고정해서 펼치기» runs the existing show-panel placement. Esc closes an open menu first, then peek, then maximize. Persistent floating survives outside click and Esc; its X collapses to the remembered edge, or top. Its menu offers «왼쪽 위 / 가운데» and «작게 / 크게». Floating groups stay inside the workspace, contain one panel and accept no tab drops, preserving primary/opt-out constraints. Cross-workspace drops remain refused; there is no browser popout.

Collapse unmounts like hide. Queries and zoom/legend state that must survive collapse belong above the workspace (ADR-0067 decision 19); re-expanding panels whose query owner stays mounted causes no adapter request. This does not change Kernel query freshness: a `useMenuQuery` owned inside an unmounted panel can refetch on remount with the current stale-time policy.

The existing local preference and v1 schema gain optional `collapsed: Record<panelId, 'left' | 'top'>` (edge memory, including while shown) and `floating: { panelId, x, y, width, height }[]`. Unknown/primary ids, duplicate floating ids and invalid geometry are dropped; geometry is clamped into the container on load. Old v1 preferences still load. Peek and narrow projection are not stored; no field enters URL/share state. Panels displayed on an enabled edge or in a floating group are excluded from «숨긴 패널 n». Explicit «숨기기» chooses the hidden list and clears that panel's edge destination; it creates no strip and adds no height to a stacked workspace. Below 692px, strips and floating disappear and all collapsed/floating panels remain available in «숨긴 패널 n». Restoring one there clears that panel's floating preference; otherwise widening restores its float. The independent `compactBelow` threshold (default 900px, 0 disables) retains the one-group projection or the declared `compactPreset`. Layout and height contracts remain in [§12.8](layout.md#128-panelworkspace-decided-adr-0067-결정-391822).

### HierarchyNav

Decided (#1448, [ADR-0118](../adr/0118-dynamic-hierarchy-navigation-sdk-piece.md)). `@ap/components`의 `HierarchyNav`는 메뉴가 준 `HierarchySource`를 지연 로딩·가상화하는 동적 사이드바 조각이다. `menuId`, `label`, `source`, 선택 `mode`(기본 `drill`), `currentNodeId`, `levelIcon`, `pageSize`, `state`, `onNavigate`를 받는다. `useHierarchyNavState(menuId)`가 만든 `HierarchyNavState`를 셸이 보유해 펼친 구역과 접힌 팝오버가 같은 페이지·조상·검색·확장 상태를 읽는다. 키는 메뉴 ID + 사용자 ID + Kernel revision이며 세대가 바뀐 렌더에서 이전 노드는 숨긴다. 저장소·URL에 이 탐색 상태를 쓰지 않는다. 페이지 규칙은 페이지 조건 트리와 같다(#2360): 한 커서 체인에서 노드 id는 유일하고(사이드바는 페이지 사이 중복 id를 걸러 내고, 값을 모으는 페이지 조건 트리는 오류로 본다), 요청한 `limit`을 넘는 응답·반복되거나 순환하는 커서·바뀐 `totalCount`·마지막 페이지가 총개수와 다른 목록은 «끝»이 아니라 `error`다.

`HierarchyNav`의 항목 라벨은 `TooltipProvider` 밖에서 렌더링하면 오류가 난다.

- 순수 계약은 `@ap/contracts`의 `HierarchyNode`(`id`, `parentId?`, `kind`, `label`, `hasChildren`, 선택 `target: { menuId, params?, page? }`), `HierarchyPage`(`nodes`, `nextCursor?`, `totalCount?`), `HierarchySource`다. `listChildren({ parentId, cursor?, limit?, signal? })`, `resolveAncestors(nodeId, signal?)`, 선택 `searchNodes({ query, cursor?, limit?, signal? })`를 받는다. 조상은 루트부터 바로 위 부모까지이며 요청 노드는 제외한다. 개수 생략은 알 수 없음이고 0이 아니다.
- 한 호출은 기본 50개·최대 200개(성능)다. 첫 렌더에 전체 트리를 받지 않는다. 페이지는 ID로 중복 제거하고 긴 목록은 가상화한다. 검색은 200ms 지연 후 요청하고 이전 요청은 취소한다. 자신의 취소된 signal만 결과를 버리는 근거다(정합성); 다른 `AbortError`는 재시도 가능한 오류다. 논리 깊이·선택 수 제한은 없다.
- `drill`은 한 단계 목록과 루트에서 숨기는 뒤로 행을 쓴다. `tree`는 평탄화된 `tree/treeitem`, `aria-level`, `aria-posinset`, 알려진 `aria-setsize`(미상은 -1), `aria-expanded`와 ↑↓←→·Home·End·Enter·Space를 지원한다(접근성). 시각 들여쓰기는 60px에서 멈추지만 논리 깊이는 계속된다. target 열기와 하위 탐색은 별도 조작이다.
- 목적지는 Kernel `resolveLink(menuId, { params, page })`로 검증하고 허용된 것만 `PlatformLink via="sidebar"`로 연다. 미등록 메뉴·불완전 경로·거부된 대상은 href 없는 행이다. 현재 노드는 `aria-current="location"`, 고정 메뉴의 유일한 `aria-current="page"`는 유지한다.
- 깊은 링크는 조상을 복원하고 필요한 경로의 커서 페이지를 찾아 현재 행에 `scrollIntoView({ block: 'nearest' })`만 한다. 최초 로드에 focus를 옮기지 않는다. 키보드 조작 뒤에만 행 포커스를 옮긴다. 경로를 끝까지 읽어도 대상이 없으면 삭제 상태를 보인다.
- `HierarchyFailure`는 `forbidden | deleted | error`로 거부하고 `isHierarchyFailure`가 구조로 확인한다(패키지 사본 간 `instanceof` 금지). 로딩·빈·오류+재시도·권한 없음·삭제 상태를 구분한다. 서버는 권한이 있는 노드만 돌려주며 SDK는 경로로 권한을 추론하지 않는다. 모든 안내는 Kernel ko/en i18n이다.
- 행은 `@ap/ui`의 CVA 기반 `navRowVariants`(`active`, `collapsed`, `inset`, 기존 기능 행용 `feature`), `NavCurrentMarker`, `navDrillAffordance`를 공유한다. `Button variant="navigation"`은 선택 옵션이다. `SearchInput size="toolbar"`는 `aria-label`·`clearLabel`을 받고, native cancel을 숨기고 입력 안 지우기 하나와 Esc만 쓴다. 기존 기본 모양은 유지한다. 잘린 라벨만 ResizeObserver로 확인해 tooltip을 열고, 별도의 행별 TooltipProvider나 native title은 없다. 목록은 남은 공간을 행 피치 배수·최대 10행으로 쓰며 목록 안 스크롤 하나만 둔다.

합성 소비자는 제품 메뉴가 아닌 테스트 Registry다. `@ap/components/testing`의 `createSyntheticHierarchySource({ nodes, depth, delayMs?, failures? })`는 기본 5,000개·6단계, 커서·검색·취소를 제공한다. `failures` 키는 `children:root`, `children:<id>`, `ancestors:<id>`, `search:<query>`이며 값은 실패 kind다. `stubHierarchyGeometry()`는 jsdom 가상화가 0행으로 통과하지 않도록 실제 치수·스크롤을 모사한다. 본문 `HierarchyExplorer`·`HierarchyBreadcrumb`은 미구현·보류다([백로그](../../.planning/backlog.md)).

### ObjectLinks (Decided, #1930)

`@ap/components`의 본문 배치 조각. `kind`·`id`와 링크 옵션 `returnTo?`·`page?`·`global?`, 행의 `compact?`를 받는다. Kernel `objectLinks` 목록을 0개면 생략하고 1개면 목적지 이름의 `RowAction` + `PlatformLink`, 여러 개면 `RowAction` 모양의 «다른 화면» Popover로 그린다. Enter로 열고 Escape로 닫으면 트리거에 포커스를 돌려준다. 여러 항목의 접근성 이름은 «{id} 다른 화면에서 열기», title은 compact만 쓴다. 거부 항목은 disabled + `menuDenied`, 같은 이름은 공간 둘째 줄로 구분한다. `RowAction.menu?`는 같은 노드를 유지하는 본문 Popover 합성 옵션이며 기본은 기존 동작이다. 머리 배치는 `PlatformPage`가 `subjectLinks`로 소유하고 내부 묶음은 export하지 않는다. 자세한 선언·표시·의도 규칙은 [§22](cross-menu-links.md#22-cross-menu-context-link).

`RowAction`의 `menu` 팝오버는 `open`, `defaultOpen`, `onOpenChange`를 받는다. 생략하면 닫힌 채 시작하고 사용자 동작으로 열린 상태가 바뀐다.

### PermissionBlockedPanel (#2534)

`PermissionBlockedPanel`(`@ap/ui`)에 `layout="card"`를 주면 잠금 아이콘과 설명을 가운데 카드에 표시한다. `layout="panel"`(기본값)은 기존 배치·상태별 아이콘·요청 버튼·`requiredScope` 출력과 문구를 그대로 쓴다. 카드의 `missing={{ permission, system? }}`에는 사람이 읽는 권한명과 시스템명을 넣는다. 카드에서는 `requiredScope`를 표시하지 않는다. `lang`은 `ko`(기본값) 또는 `en`이다.

카드의 `missing` 블록에는 «필요한 권한»을 표시한다. 소비자는 `requestStatus`에 맞춰 `requestAction`에 요청 또는 상태 버튼을, `exitAction`에 허용된 이동 버튼을 전달한다. 카드는 본문과 왼쪽을 맞춘 한 줄에 `requestAction`, `exitAction` 순서로 놓는다. 메뉴·Scope 게이트에서는 `none`일 때 기본 강조 버튼 «권한 요청», `pending`일 때 상태 주소가 있으면 보조 버튼 «내 권한 요청 보기»를 먼저 놓는다. `approved-partial`은 승인 아이콘·«승인됨 · 아직 필요한 것»과 «남은 권한 요청» 버튼을 쓴다. `not-requestable`이면 요청 버튼을 생략한다. 열 수 있는 홈이 있으면 각 상태에서 같은 보조 버튼 «홈으로»를 `exitAction`으로 전달한다. 페이지 이동은 `Button asChild`와 `PlatformLink`를 조합해 버튼 모양의 링크로 표시한다. 제자리에서 요청 대화상자를 여는 동작은 버튼으로 표시한다.

`description`을 생략하면 카드가 상태에 맞는 설명을 표시한다. `pending`은 «검토 중» 배지 없이 본문으로 알리며, 본문에 `role="status"`를 둔다. 페이지 게이트는 `headingLevel={2}`와 `announceBody`를 쓰며 버튼은 알림 영역 밖에 둔다. 요청 대상과 제출 자격은 소비자와 서버가 판정한다. 카드는 조회·권한 판정·신청을 실행하지 않는다. 요약과 감사 메타데이터에는 기존 `summary`, `decisionId`, `evaluatedRelative` props를 쓴다.

#2640의 `useAccessRequestState`(`@ap/components`)는 메뉴·Scope 게이트와 기능의 페이지 링크형 요청 입구에 같은 확인 상태와 문구를 제공한다. 기능 다리는 이 훅을 기능 화면에 전달한다. 확인 중에는 요청 버튼을 포커스할 수 있지만 실행할 수 없고 `aria-busy`를 붙인다. 각 대상의 확인은 최대 8초이며, 실패하면 상태를 알리고 다시 읽을 수 있을 때 «다시 시도»를 표시한다. 메뉴와 Scope 슬롯은 원본 확인 상태, 재시도 함수, 세션·대상을 담은 `readKey`를 넘긴다. `useAccessRequestRead`가 제한 시간과 재시도를 한 곳에서 관리하고, 대상이 바뀌면 새로 시작한다. 확인이나 재시도 중 포커스한 버튼이 사라지면 남은 동작이나 페이지로 포커스를 옮긴다.

### UI Primitive

shadcn/ui + Radix 조합은 [04 프론트엔드 기술 스택](../architecture/frontend-ui-ux.md#프론트엔드-기술-스택-decided-2026-09-25)에서 Decided(2026-09-25)다. primitive 구현과 공개 export는 SDK `@ap/ui`가 소유하며, 소비자는 `@ap/ui`에서 직접 import한다([ADR-0043](../adr/0043-platform-sdk-is-the-app-contract-and-unified-framework.md)·[ADR-0046](../adr/0046-design-system-source-moves-to-platform-whole-package.md)). `TabsList`·`TabsTrigger`는 같은 패키지의 shadcn 탭을 감싼 플랫폼 선택 표식 구현이다([ADR-0023 개정](../adr/0023-feedbackops-primitive-shapes-and-sizes.md#개정--탭-선택-표식-2026-10-15)). `TabsList`는 선택 prop `overflow`(`'scroll'` 기본 = 넘치면 가로 스크롤, `'menu'`)와 `moreLabel`(기본 `더보기`, `@ap/ui`는 i18n을 모르므로 메뉴가 자기 문구를 넘긴다)을 받는다. `overflow="menu"`는 들어가지 않는 탭을 마지막 보이는 탭 바로 뒤의 `더보기 ⌄` 메뉴로 옮기고(선택 탭이 숨으면 버튼이 그 탭 이름과 선택 막대를 보인다), 목록 자신의 상자 너비를 재므로 컨테이너가 확정된 너비를 줘야 한다(flex 행이면 `min-w-0 flex-1`). 숨은 탭은 DOM에 `hidden`으로 남아 `TabsContent`의 `aria-labelledby`가 계속 풀린다. 키보드는 ←/→/Home/End가 [보이는 탭…, 더보기 버튼] 순서를 돌고, 버튼에서 Enter/Space/↓로 메뉴(`menuitemradio`)를 열며, Tab 정거장은 목록 하나(선택 탭이 숨었으면 더보기 버튼)다. `src/ui`는 표식 없는 `TabsListBase`·`TabsTriggerBase`를 각각 `TabsList`·`TabsTrigger`라는 기능 이름으로 재수출한다. 아래 primitive 역할 예시는 그 구체 컴포넌트 매핑까지 확정하는 것은 아니다.

`ListTabs`·`ListToolbar`(`@ap/ui`)의 선택 prop `maxVisible?: number`(`ListToolbar`는 `tabsMaxVisible`로 넘긴다, #1291)는 `TabsList overflow="menu"`와 별개인 개수 기준 접기다. 값이 없으면(기본) 지금과 같다. 값이 있고 탭이 그보다 많으면 앞 N개만 탭 줄에 두고 나머지는 「더보기 ‹숨은 수›」 메뉴 버튼 하나에 담는다(메뉴 항목은 아이콘·라벨·tip·숫자를 그대로 싣는다). 더보기 버튼은 마지막으로 보이는 탭 바로 뒤에 둔다. 선택된 탭이 숨은 쪽이면 마지막 보이는 자리에 올리고 밀려난 탭이 메뉴로 간다(선택 필터는 항상 보인다). 탭 목록의 화살표 키는 그대로이고, 메뉴 버튼은 Tab으로 닿아 Enter·Space·↓로 열며 Esc로 닫으면 포커스가 그 버튼으로 돌아온다. 이유: 한 줄 툴바가 빠른 필터 몇 개만 보여 주고 나머지를 접을 수 있어야 메뉴마다 같은 방식으로 쓴다(도메인을 모르는 조각, [ADR-0052](../adr/0052-rich-content-stays-in-the-sdk.md)). `ListToolbar`는 `tabs`이나 `title`이 주어질 때만 탭·제목 블록(`data-list-toolbar-main`, `basis-[22rem]`)을 그리고, 둘 다 없으면 액션만의 한 줄(액션도 없으면 `min-h-toolbar`의 빈 막대)이다(#1364).

`InfoTip`(`@ap/ui`, #2300): props `{ label: string; children: ReactNode; descriptionId?: string }`. 24px ⓘ 버튼(`<button type="button" aria-label={label}>`)이고, hover·포커스로 tooltip(`TooltipContent portal size="sm"`, 최대 18rem)이 열리며 Esc로 닫힌다. 같은 글은 늘 있는 `sr-only` 설명 칸(`div`라 목록 같은 블록 설명도 올바르게 담는다) 하나에 두고 버튼이 `aria-describedby`로 가리킨다(`descriptionId`를 주면 그 id, 섹션도 같은 칸을 가리킬 수 있다). 정적 안내 문장에만 쓴다: 경고·부분 데이터·미완료 상태·권한 안내·상태 배지는 ⓘ로 숨기지 않고 보이는 글로 둔다(첫 화면 점검 원칙). 표 툴바 ⓘ(`ToolbarDescription`)는 이 조각에 기본 라벨 「설명」만 채운다. 차트 머리의 ⓘ(compact 차트의 `description`, 라벨 「차트 설명」)와 `LaneTimeline`의 「조작 방법」 ⓘ도 이 조각이다(#2364).

`FieldList layout="inline"`(#2300, 선택): 객체 메타를 한 줄로 둔다. `dl`이 `flex flex-wrap`이 되고 안의 `FieldRow`는 라벨(muted, `text-xs`)·값(`text-sm`) 가로 쌍이 되며 `dt`/`dd`는 그대로다. 넘치면 줄을 바꾸고 값을 자르지 않는다. 행의 `layout`이 목록 값보다 우선하고, `FieldRow layout="inline"`은 목록 밖에서도 `span` 쌍으로 쓴다. stepper·Gate·경고 같은 배지는 `dl` 밖 형제로 둔다. 값을 주지 않은 `FieldList`·`FieldRow`는 바뀌지 않는다.

`Callout size="compact"`(#2300, 선택, 기본 `default`): 주 내용 카드 안 얇은 알림 한 줄. 패딩(`px-2.5 py-1.5`)·줄 높이·제목 글자(12px)만 줄이고 tone·아이콘·제목·동작과 본문 글자(12px)는 그대로다. 글은 그대로 보인다(hover 전용 금지).

예:

- Button
- Input
- Select
- Dialog
- Popover
- Tabs
- Badge
- `SeverityIndicator`는 심각도를 막대로 표시할 때 쓰며, 옆에 심각도 라벨을 이미 표시하면 `decorative`로 접근 이름이 중복되지 않게 한다.
- `EmptyState`는 목록이나 패널에 표시할 항목이 없을 때 쓰며, 제목에 비어 있는 상태나 다음 할 일을 적고, 필요하면 설명이나 다음 동작을 함께 표시한다.

`Badge variant="secondary"`의 바탕·테두리·hover는 [DESIGN의 배지 규칙](../../DESIGN.md#status--badges)을 따른다. `SeverityIndicator`에 `severity={null}`을 주면 막대 폭에 맞춰 가운데에 줄표(—)를 표시한다. 기본 접근 이름은 「심각도 미지정」이며 `label`로 지정할 수 있다. `decorative`를 주면 보조 기술에서 숨긴다.

**Dialog 닫은 뒤 포커스 (#1169):** `DialogContent`·`DialogContentBare`·`AlertDialogContent`는 열릴 때 `document.activeElement`를 기억하고, 닫을 때 Radix 기본 처리 뒤에도 포커스가 `body`에 있으면(`DialogTrigger`가 없어 Radix가 null 트리거에 포커스를 보낸 경우) 그 요소가 연결돼 있을 때 되돌린다. Escape·닫기 버튼 모두 같다. 트리거가 있는 대화상자는 Radix가 트리거로 보내므로 달라지지 않는다. 소비자의 `onCloseAutoFocus`가 `preventDefault`하면 소비자가 이긴다(다른 요소로 보내거나 되돌리지 않을 때). 오버레이 scope가 숨겨져 `useScopedAutofocus`가 이벤트를 막은 경로는 소비자 호출도 복원도 하지 않는다. 화면은 이 동작을 손으로 되풀이하지 않고, 열기 요소와 다른 대상(행 트리거·목록 제목 등)으로 보낼 때만 `onCloseAutoFocus`를 쓴다.

**미저장 변경 이동 확인 (ADR-0115):** 셸의 `LeaveConfirmDialog`가 Kernel `useLeaveRequest()`의 대기 요청 하나를 표준 `AlertDialog`(`alertdialog`)로 그린다. 메뉴가 주는 상세는 「이동하면 변경이 사라집니다.」 위에 더하고, 알려진 목적지 이름은 별도 줄에 둔다. 목적지가 지금 메뉴이면(메뉴 안 page 키 변경) 그 줄을 뺀다. `머무르기`는 기본 포커스·primary, `변경 버리고 이동`은 destructive다. Escape·바깥 클릭도 머무르기이며, 취소·확인의 포커스는 [§26](platform-ui-contract.md#26-accessibility-baseline)을 따른다. 팔레트에서 취소하면 검색어·선택 결과·검색 칸 포커스를 유지한다.

- 기본 `ToggleGroup`의 켠 항목에는 선택 면·테두리·글자 굵기를 함께 적용한다. `appearance="filter"`와 `variant="outline"`은 기존처럼 표시한다 (#2950).

### RichEditor / RichContentRenderer (Decided, ADR-0127)

SDK `@ap/ui`는 도메인을 모르는 Tiptap JSON 편집·읽기를 제공한다([ADR-0052](../adr/0052-rich-content-stays-in-the-sdk.md), [ADR-0127](../adr/0127-sdk-rich-editor-extensions-and-inline-attachment-images.md)). `surface`의 capability 집합이 편집 확장·툴바·슬래시 메뉴·선택 서식·블록 손잡이를 함께 선택한다. 기본 공개 진입점 `RichEditor` 안에서 편집 구현을 지연 로딩한다. 제목 서식을 지원하는 표면의 기본 툴바와 편집 조작은 [ADR-0127의 2026-11-08 개정](../adr/0127-sdk-rich-editor-extensions-and-inline-attachment-images.md#amendment--toolbar-layout-1529-2026-11-08)의 A안을 따른다. `toolbar`를 생략한 표면에 제목 서식 capability가 없으면 굵게·기울임·글머리 목록·번호 목록·링크 중 허용된 항목을 한 줄에 둔다 (#2950). 호스트는 선택 `toolbarStickyOffset`(숫자는 px, 문자열은 CSS 길이) 또는 `--rich-editor-toolbar-offset`으로 sticky 위치를 준다(기본 0). `RichContentRenderer`는 편집 인스턴스와 편집 플러그인 없이 같은 노드를 정적으로 읽고 코드 강조·제목 목차를 계산한다. 본문 링크는 `text-link` 색을 쓰고 hover에서 밑줄을 긋는다.

`onAttach(file)`는 소비자가 업로드한 첨부 envelope를 반환한다. 선택 `resolveAttachmentUrl?: (id: string) => string | null`은 두 부품이 첨부 이미지를 그릴 때만 사용하며 JSON에 URL을 넣지 않는다. 생략하거나 null을 반환하면 기존 첨부 칩으로 읽는다. 선택 `resolveMentionLabel?: (actorId: string) => string | null | undefined`은 두 부품이 멘션 칩에 보일 이름을 구한다. 멘션 JSON은 `actor_id`만 가지며, 생략하거나 이름을 못 구하면 `@멘션`을 보이고 id는 보이지 않는다. 이미 그린 편집기 멘션 칩은 resolver 결과가 바뀌어도 갱신되지 않으므로 소비자는 마운트 전에 이름을 준비해야 한다. 편집기가 내보내는 값은 모든 surface에서 서버가 받는 문서다: surface 허용 목록에 없는 속성 키와 null 속성을 빼고, href가 없거나 서버 URL 검사를 통과하지 못하는 링크는 글자를 남기고 링크 mark만 뺀다. 링크 입력·HTML 붙여넣기도 같은 검사를 적용해 이메일·허용 밖 프로토콜·상대 href는 글자로 유지하며, 주소만 입력한 `example.com`은 기존처럼 `http://` 자동 링크가 된다(링크 capability가 있는 surface). 그 밖의 노드·글자와 글자 수·노드 수·깊이 한도를 넘은 내용은 지우지 않는다. 번호 목록은 `start`를 저장하지 않아 늘 1부터 시작한다(허용 목록과 서버에 `orderedList.start`가 생기면 다시 연다). 한도를 넘으면 편집기가 경고 문구를 보이고, 서버가 저장을 거절한다. 부모가 그 값을 되돌려 줘도 정리된 속성 차이만으로는 문서를 바꾸지 않는다(커서 유지). `toolbar` render-prop의 선택 `api.renderControls({ hideAttach?, onAttachError? })`는 SDK capability 툴바를 소비자 어댑터에서 재사용한다. 준비되지 않았거나 비활성인 편집기에 대한 `api.attach(file)` 호출은 업로드 전에 실패한다. 편집 중 시작한 업로드가 비활성 상태에서 완료되면 결과를 보관했다가 다시 활성화할 때 한 번 삽입한다. 서버 권한·첨부와 부모 연결·전송 필드·목록은 소비자 책임이다. surface별 노드·속성·허용 동작의 원본은 [VOC §5.7](../../packages/feature/screens/docs/specs/voc.md#57-richeditor-per-surface-contract)이며 SDK 사본과 원본·서버 사이의 전체 schema 동등성을 테스트한다.

멘션을 허용하는 표면에서도 `actor_id`가 UUID 형식이 아니거나 빠진 멘션은 편집기와 렌더러의 허용 목록 검사에서 제거된다.

### Platform Component

여러 도메인에서 동일한 플랫폼 의미를 갖는 컴포넌트다.

`AnalysisSelectionChipZone` (`@ap/components`, #2733)은 현재 화면의 [분석 선택 모델](chart.md#분석-선택-전달-decided-adr-0175-2732)을 읽어 차원·값과 출력 패널 이름을 표시한다. 패널 이름에 미해결 치환자가 있으면 칩 라벨을 접근성 이름으로 쓰고 툴팁을 생략한다. 값이 가용하지 않으면 «해당 없음»을 붙인다. 수신 전용 키를 읽는 조회·표시 패널이 하나도 없으면 Kernel이 `applied: false`를 반환한다(#2876). 이때 칩에 같은 흐린 스타일과 «적용 안 됨»을 적용하고, 접근성 설명으로 화면이 이 선택을 조회에 쓰지 않는다고 안내한다. `applied`가 생략되면 적용된 것으로 본다. 칩 본문은 편집 팝오버를 열고, «적용»은 해당 선택의 값 묶음이나 범위를 바꾼다. 칩의 ×는 해당 선택을, «모두 지우기»는 분석 선택 전체를 지운다. 접힌 줄 배치는 [Layout §12.2](layout.md#122-analysis-workspace)를 따른다.

칩의 ⋯는 선택의 동작과 «지우기»를 제공한다(#2734). Tab으로 이동하고 Enter·Space·아래쪽 화살표로 연다. Esc로 닫거나 칩이 남는 동작을 고르면 ⋯로 포커스를 돌려준다. 기간 적용을 취소하면 출발한 칩의 ⋯로 포커스를 돌려준다. 접힌 목록에서 시작했다면 목록을 다시 연다. 비활성 항목에는 행과 같은 사유를 표시한다.

수신 전용 칩은 차원과 값을 표시하며 ⋯에는 «지우기»만 둔다. [도착 칩](cross-menu-links.md#22-cross-menu-context-link)은 칩 영역 맨 앞에 두고 공간이 부족하면 첫 도착 칩을 남긴다. ←는 선택이 담긴 복귀 주소로 이동한다.

`PlatformPage` 내부 브리지가 주 화면의 조회 바와 패널을 연결한다. 차트는 출력 패널 ID와 키로 동작을 등록하고, 패널이 가려지거나 내려가거나 출력을 중단하면 등록을 해제한다. 칩은 출력 선언과 객체 링크로 표준 동작을 구한다. 출처 패널을 소유한 `PanelWorkspace`가 한 곳이고 그곳에서 추가를 지원할 때 «새 패널»을 표시한다. 차트에서 등록한 동작은 같은 출력 패널 ID와 키로 등록한 차트가 하나일 때 공유한다. `AnalysisChartFrame.selectionActions`에 `ChartSelectionAction[]`을 넘기면 범위 동작을 행과 칩에 함께 표시한다. 렌더 함수가 돌려주는 노드와 차트 주석 동작은 차트에서 제공한다.

예:

- GlobalContextBar (`@ap/shell`)
- PlatformPage (페이지 머리·슬롯, §8. 별도 PageHeader 컴포넌트는 없다)
- PageFilterBar
- DataTrustIndicator
- AnalysisChartFrame. `analysisSelectionOutput?: { panelId; key } | null`로 범위와 값 묶음을 메뉴 URL에 연결하며, `null`은 출력을 중단한다. `nextAnalysis?: boolean`으로 «다음 분석» 행을 켜고, 여러 차트가 있는 패널에서는 `nextAnalysisTarget?: HTMLElement | null`로 패널 하단에 배치할 수 있다. [출력 선언과 키보드 동작은 §16](chart.md#분석-선택-전달-decided-adr-0175-2732)을 따른다. 출처 강조 `highlightedValues?: readonly string[]`의 그리기 규칙도 [§16](chart.md#분석-선택-전달-decided-adr-0175-2732)이 소유한다.
- OrderedIntervalTrack (순서 축 구간·점의 범용 트랙, 선언·상태·성능 경계는 아래, 상호작용은 [§16](chart.md#orderedintervaltrack-순서-트랙-decided-adr-0121))
- AnalysisChart (heatmap·donut·scatter·boxPlot·pareto·topNBar·histogram의 데이터·표·CSV 프레임, 종류별 로컬 선택, [§16](chart.md#16-analysis-chart-contract), [ADR-0058](../adr/0058-analysis-chart-spec-union.md))
- LegendTree (계층 범례의 보이기·단일 현재 항목 또는 드릴 현재 단계(`onDrill`·`currentId`·`drillOnly`·`canDrill`, 보이기와 분리)·키보드 행 이동, [§16](chart.md#16-analysis-chart-contract), [ADR-0057](../adr/0057-legend-tree-arrow-key-row-navigation.md))
- PlatformDataTable
- DetailDrawer
- GroupedSelectionList (`@ap/ui`, 분류된 체크박스·radio 선택과 검색·다중 선택 프리셋, 아래 계약)
- AuditTimeline
- QueryView / OutcomeView / StateMessage (응답 상태, EmptyState 역할), PlatformPage-provided shared outcome scope / banner (§19)
- `RecoverButton.primary?: boolean`은 공유 조회 복구에서 한 동작을 기본 버튼으로 강조한다. 생략하면 보조 버튼이다. `AccessRequestEntry.emphasis?: 'primary'`는 같은 강조를 신청 동작에 적용한다. `size="field"`는 필드 안의 기존 버튼을 쓴다.
- `PlatformPageBodyBoundary`는 호스트가 마운트된 `PlatformPage`의 본문을 감싸는 Context다. 본문을 받아 렌더할 노드를 돌려준다. 셸은 여기서 오류를 받아 머리와 조회 조건을 유지한다([Kernel §4](kernel.md#4-platform-kernel-responsibilities)). 제공하지 않으면 페이지가 본문을 직접 렌더한다.
- StatCard / Panel (icon chip 팔레트와 deprecated 값의 이전 규칙: [DESIGN — KPI tiles](../../DESIGN.md#kpi-tiles-and-supporting-copy))
  `StatCard`는 `secondary`를 `value`와 `unit` 사이에 표시하므로 `secondary`에 같은 단위를 넣으면 화면에 두 번 나온다.
- DrillPath / DrillLayout (드릴다운 경로 바, 대안 기준 표시, 복구 안내와 단계 본문, [§12.7](layout.md#127-드릴다운-레이아웃-decided-adr-0025))
- Inspector (분석 화면 보조 섹션을 한 번 선언해 `stack`·`rail` 두 형태로 보인다, [ADR-0080](../adr/0080-inspector-forms.md))
- HeaderOverflowItem (`@ap/components`, 페이지 머리 `⋯` 메뉴의 항목 한 줄. `allowed: false`면 숨기지 않고 비활성 + `reason`을 보인다. 셸 슬롯 `analysisActions`의 `Actions`가 이것으로 항목을 그린다, [layout.md](layout.md) 슬롯, §22, #1424)
- ReturnLink (다른 메뉴에서 출발 화면으로 돌아가는 버튼, §22)
- FloatingWindow (`@ap/components`, 도메인을 모르는 비모달 창 틀 — 배경 차단막·포커스 가두기·외부 클릭 닫기 없음, 제목줄 끌기·8방향 핸들·방향키(Alt=크기)·`⋯` 메뉴(위치 5·크기 3)의 같은 결과, 호출자가 준 `area` 안에서만 그리고 `mode`(`window`/`fill`/`off`)가 바뀌어도 children은 재마운트되지 않는다. 창으로 못 그리는 폭은 `fitsArea`로 판정해 호출자가 `fill`을 고른다, #893)
  `FloatingWindow`는 `minSize`를 생략하면 기본 최소 크기 640×420px(`FLOATING_MIN_SIZE`)를 사용하며, `window` 모드에서 최소보다 작은 폭이나 높이는 각각 `area`가 허용하는 만큼 그 최소값까지 키워 그린다(`fill`은 영역 전체, `off`는 창 크기를 쓰지 않는다).
  - `window`와 `fill`은 제목과 호출자의 `actions`를 같은 제목줄에 그린다. 이동·크기 조절·위치 메뉴는 `window`에서만 제공한다. `off`는 제목줄을 그리지 않는다 (#2950).

`Inspector`(`@ap/components`, **Decided**, [ADR-0080](../adr/0080-inspector-forms.md))는 분석 화면의 보조 설정(대상·범례·옵션)을 `sections`(`id`·`title`·`icon`·`summary?`·`render`)로 한 번 선언하고 `form`으로 보인다. `stack`은 [WAI-ARIA APG 아코디언](https://www.w3.org/WAI/ARIA/apg/patterns/accordion/)을 따른다: 제목(`h3`) 안의 버튼이 `aria-expanded`·`aria-controls`를 갖고 Enter·Space로 바뀌며, 여러 섹션을 함께 열 수 있는 것이 기본이다(`defaultExpanded` 생략 = 모두 열림). 제목은 줄어들지 않고 접힌 섹션의 `summary`는 머리에 말줄임과 `title` 속성으로 남으며, 스택 전체가 스크롤하고 섹션 안은 스크롤하지 않는다([Carbon 아코디언](https://carbondesignsystem.com/components/accordion/usage/)의 원칙). 내용 패널은 `region`이 아니다(APG의 landmark 남용 경고). `rail`은 40 px 열에 섹션당 아이콘 버튼 하나이고, 버튼은 섹션 제목을 접근 가능한 이름으로 갖고 `@ap/ui` Tooltip이 포커스에서도 보인다. 클릭·Enter는 그 섹션을 비모달 Popover peek로 열고(오른쪽으로, 맨 위에 섹션 제목(`h3`)이 보이고 peek의 이름이 된다), Escape는 닫고 포커스를 그 버튼으로 돌리며, peek은 한 번에 하나다. 열린 버튼은 색만이 아니라 막대 표시와 `aria-expanded`로 드러난다. **섹션 내용은 질의를 소유하지 않는다**: 질의는 Inspector 위(메뉴)에 두고 결과를 `render`에 넘긴다. 섹션 토글·peek·`form` 전환은 Inspector 밖의 어떤 것도 다시 실행하지 않는다(`stack`은 섹션을 마운트한 채 유지, `rail`은 peek 중인 섹션만 마운트하고 닫힌 섹션의 `render`는 호출하지 않으며 `form` 전환 때 섹션 내용은 다시 마운트된다). 펼침 집합은 `persistKey`(정적 id)로 `platform:inspector-expanded:v1:<user>:<menu>:<persistKey>`에 기억하며(PanelWorkspace와 같은 사용자·메뉴 범위, 사용자나 라우팅된 메뉴가 없으면 메모리에만 둔다) `expanded`/`onExpandedChange`로 controlled도 된다. "모두 접으면 레일" 전이는 만들지 않는다(사용자 변형 컨펌 선행).

후보(미구현): `PermissionGuard`(현재는 셸 `RouteOutlet`의 권한 게이트).

| 페이지 조건 조각 | 상태 | 경계 |
| --- | --- | --- |
| `PageConditionCategories` (`@ap/components`, #2338) | Candidate | `MenuMeta.pageConditions`의 범주 입력만 렌더링. 선언·codec은 [Kernel §5·§6.4](kernel.md#5-menu-extension-contract), 표 필터 모델·FilterLine은 §15. |

`PageConditionCategories`는 `declaration`, S1 `values`(디코딩된 키 맵), `onChange(categoryId, nextDecoded \| null)`을 받는다. callback은 해당 범주 소유 키 맵 전체를 교체하고 `null`은 그 범주의 키를 모두 제거한다(제약 없음). multi·groupedChecks·tree의 마지막 체크 해제는 빈 배열을 남겨 `선택한 항목 없음`으로 보인다. select·multi·search·range·date·groupedChecks·tree 입력, 범주별 `지우기`, 보이는 비활성 사유를 제공한다. 숫자·시각 입력은 미완성 문자열을 내부 입력 버퍼에 보존하고 blur 때 S1 codec과 범위 경계를 검증해 전달한다. 날짜는 기존 표 편집기와 같은 `@ap/ui Input`의 `datetime-local`·초 단위를 사용하며 시간대 변환하지 않는다.

`multi`·`groupedChecks`의 선언 `absent: 'all'`(#2341)은 키 없음을 «모든 옵션 체크»로 보이게 한다. 첫 해제는 전체에서 빼서 목록을 쓰고, 다시 전체가 되면 값 목록 대신 키를 지운다. 사용 불가 사유가 있는 옵션은 «모두»에 넣지 않고, `required`와는 함께 쓸 수 없다(Registry 거부). `~none`은 그대로 빈 선택이며 URL 문법·저장 상태·기본 동작(`absent` 없음)은 바뀌지 않는다.

`loadOptions(category, { signal })`은 S1 옵션 응답을 돌려준다. `inputsKey`는 호출자가 세션 세대·Scope·투영 Context(적용 기준 — 적용 전 draft Context는 옵션 조회를 다시 시작하지 않는다)·엔드포인트 입력·준비 상태를 포함한 전체 입력 정체성으로 제공한다. 변경·unmount 때 요청을 취소하고 이전 옵션을 즉시 가리며 늦은 응답은 버린다. 로딩·빈 목록·실패/재시도는 §19 상태 조각을 쓰고 부분 목록은 명시한다. `usePageConditionOptionsLoader(spec, params)`는 엔드포인트 소유 선언을 확인하고 Kernel `useMenuFetch`의 게이트·signal·서버 outcome을 유지하는 연결 훅이다. 여러 엔드포인트 loader의 선택은 호출자가 조립한다. 응답은 범주 전체의 값 유일성·라벨·선언 목록을 검증한 뒤 표시한다.

`tree`는 `treeSources`의 선언 `kind.source` 엔드포인트 id에 대응하는 `HierarchySource`로 읽는다(#2340, Candidate). 선언형 층에서는 `PlatformPage.pageConditionOptions.treeSources`가 같은 맵을 층까지 전달한다. 머리는 다른 범주와 같은 한 줄(`role=heading` `tabIndex=-1` 라벨·선택 수·지우기)이고 키 없음은 `제약 없음`, `~none`만 `선택한 항목 없음`이다. 독립 조각 `PageConditionTree`도 같은 제어 입력과 `category`, `source`, 선택 `pageSize`를 받는다. 연결한 source는 메뉴가 Kernel 요청 게이트와 서버 권한 판정을 보존해 제공한다. `inputsKey` 변경은 페이지·경로·검색·선택 중인 요청을 취소하고 캐시를 즉시 버린다. 기본 50개·최대 200개 페이지, 필요할 때만 자식 펼치기와 `더 불러오기`, 200ms 검색 지연을 쓴다. 검색 결과와 미로딩 선택값은 `resolveAncestors`와 대상의 부모 페이지로 `A › B › C` 경로를 복원한다. 조상 응답은 대상 자신을 포함하지 않는다. 로딩·실패는 값 부재로 추정하지 않으며 삭제 확인 또는 끝까지 조회한 부모 목록에 없는 값만 `이 화면에서 쓸 수 없는 값`으로 남긴다. `HierarchyFailure`의 권한 없음·삭제·오류는 각 상태와 재시도를 보인다. 노드 `target`은 사용하지 않는다.

- `value: 'nodes'`: 선택한 노드 id 하나가 앞으로 로딩할 자손까지 포함한다. 포함된 자손은 체크 상태와 상위 포함 사유로 표시하며 개별 토글로 상위 선택을 해제하지 않는다. 상위를 선택하면 이미 선택한 것으로 확인된 자손 id를 대체한다. 선택되지 않은 상위에 로딩된 선택 자손이 있으면 `mixed`다.
- `value: 'leaves'`: 선택한 잎 id만 전달한다. 상위 체크는 페이지를 끝까지 순회해 잎을 수집하고 전체 후보를 S1 인코더로 검증한 후 한 번만 전달한다. 범주 50값·메뉴 인코딩 2400자 상한 또는 조회 실패면 현재 값을 보존하고 사유를 안에 표시한다. 자르지 않는다. 선택 중 취소·지우기·입력 변경·unmount 시 늦은 완료는 전달하지 않는다. 로딩된 자손이 일부 체크되면 `mixed`, 모든 자손 페이지가 완성되고 모든 잎이 체크되면 `true`다.
- `role=tree`·`treeitem`, `aria-checked=true/mixed/false`, 논리 `aria-level`·형제 위치·펼침 상태와 로빙 포커스를 제공한다. HierarchyNav와 같은 ↑↓←→·Home·End 이동, Enter 펼치기, Space 체크다. 시각 들여쓰기는 60px에서 멈추며 논리 깊이는 제한하지 않는다. 마지막 값 해제는 빈 배열(`~none`), 범주 `지우기`는 키 제거다. 자체 스크롤·overlay·URL 소유권은 없다.

로드한 옵션에 없는 값은 `이 화면에서 쓸 수 없는 값: <원문>`으로 남겨 개별 제거할 수 있다. 로딩·실패 중에는 부재를 단정하지 않고 `현재 값: <원문>`으로 표시한다. S1 codec이 오류 범주를 반환하지 않으므로 호출자는 `issues`와 원래 `rawPairs`를 함께 전달해 입력 원문·사유를 보존한다. 상한은 S1 인코더로 검사해 사유와 함께 거부하며 자르지 않는다. 범주 선언 순서를 지키고 `sections`는 제목 있는 접기로만 묶는다(비연속 범주는 순서를 유지한 연속 구간별 접기). 컨트롤·그룹은 라벨과 사유 설명을 가지며 선택 토글은 라이브 알림을 만들지 않는다. 자체 overlay·portal·고정 폭·scroll layer·적용 수단은 없고 `PageFilterBar` 내용과 ADR-0160 팝오버의 폭을 따른다.

저장된 뷰 선택 조각은 `ViewSelector`로 공개돼 있다(`@ap/components`, §21 Decided, #1011). 기존 버튼 대신 다른 도구 동작에서 선택기를 열려면 `picker?: { open, onOpenChange, anchorRef, note? }`를 넘긴다(#2539). 선택기와 저장 메뉴는 그 앵커에 열리고 닫힐 때 포커스를 돌려준다. `note`는 선택기에 뷰의 상태와 함께 표시하는 선택 설명이다. `picker`를 생략하면 선택·저장 버튼을 기존 위치에 그린다. 저장소 구현과 실서버 검증 범위는 §21 및 `.planning/README.md`를 따른다.

`FacetedSetDialog`의 `applyMode?: 'manual' | 'direct'`는 기본 `manual`이다. `direct`는 편집 후 표의 규칙 결과가 준비될 때까지 기본 버튼을 진행 중으로 표시한다. 준비되면 적용 버튼 한 번으로 선택을 제출한다. 규칙 모드의 `조건 적용 · N대`는 현재 규칙에 맞는 결과 수를, 고정 모드의 `고정 N대 적용`은 체크한 ID 수를 표시한다. 고정 모드의 수에는 현재 규칙 밖에 남겨 둔 체크 ID도 포함된다. 별도 조회 단계 없이 결과 표를 계속 표시한다. Escape는 마지막으로 연 분류를 먼저 닫고 대화창은 다음 Escape에서 닫는다. `initialFacet?: string`으로 기존 facet id를 넘기면 열 때 그 분류를 펼친다. 생략하거나 알 수 없는 id면 기존 선택에 따라 펼친다(#2539).

분류 버튼은 들여쓰기 없이 한 줄(넘치면 줄바꿈)로 놓고, 분류끼리는 AND다. 각 값의 개수는 다른 분류 조건을 모두 만족하는 항목 수이며, 0이 된 값은 숨기지 않고 흐리게 남긴다(#2600). 좁힌 분류 버튼에는 첫 값과 나머지 개수(«외 N»), 제한 없는 분류에는 후보 개수가 보인다. 선택적 `settingsSlot`은 편집 중인 값과 결과 준비 상태를 받아 적용 버튼 위에 설정을 렌더링하고, 설정값이 유효하지 않을 때 적용을 비활성화할 수 있다(#2586).

펼친 조회 바는 기간(시작일·포함 종료일·단축 범위), 대상, 선언한 조건 묶음을 한 줄에 두고 폭이 부족하면 줄을 바꾼다. 적용 동작은 별도 줄에 둔다. 대상 대화창에는 적용할 수 있는 분류와 그 결과 열이 표시된다. 소속 기준은 하단 설정에서 대상과 함께 적용하며 대상 요약에는 «그 시점 소속»만 덧붙인다. 날짜와 기존 링크의 편집 규칙은 [Kernel §6.3](kernel.md#ctx-time)을 따른다.

`useReportQueryBarStatus`의 선택적 `conditionEditorKeys`는 편집기를 직접 열 수 있는 Context 키이고 `periodAwaitingApply`는 초안의 기간을 아직 적용하지 않았음을 뜻한다. `useRegisterContextEditorFocus`의 콜백은 선택적으로 `{ key, opener }`를 받아 해당 조건을 열고, 생략된 요청에는 기존 일반 편집기 열기 동작을 제공한다. `QueryView`의 조회 전 상태는 같은 페이지의 조회 바가 제공한 키에 대해 조건 버튼을 그린다(#2539).

`PageFilterBar`는 메뉴가 전달한 검색·정확 일치 텍스트·분류 선택·맞춤형 필드를 라벨과 함께 한 줄에 배치하고 공간이 부족하면 줄바꿈한다. 입력은 `@ap/ui` `Input`(40px), 분류 값은 `Select`를 사용하며 높이를 덮어쓰지 않는다. 막대는 초안(draft) 표시 전용이고 자체 적용 수단이 없다 — `onApply`와 submit `<form>`(#1218, [ADR-0112](../adr/0112-catalog-joins-table-filter-model-analysis-bar-keeps-apply-once.md)에서 제거)은 없으며, 적용 경계는 소비 화면이 소유한다(표 조건은 §15의 조건마다 적용, 분석 조회는 초안 + 적용 한 번). `mode="draft"`는 조회 초안(ADR-0037) 제어 필드의 표식이고 동작을 바꾸지 않는다. 필드 의미·URL page key·값 변경·초기화·draft 적용은 소비 화면이 소유하며, 알 수 없는 현재 Select 값은 선택 가능한 표시값으로 남긴다(ADR-0016). 선택 `defaultCollapsed?: boolean`(기본 false)은 저장된 선호가 없을 때만 초기 접힘을 정한다. 저장된 사용자 선호가 항상 우선한다(#1473).

막대는 접이식 하나뿐이다(ADR-0029): 행 모드(비접이식, `onApply` form)는 소비처가 없어 #1218에서 삭제됐고 접기가 기본이자 유일한 형태다. 접힘 줄은 소비자가 제공한 `summaryItems`(필드명+현재값) 전체를 담은 펼치기 버튼 하나와 독립된 접힘 액션이며, 공통 부품은 조건을 생략·요약하지 않는다(말줄임·`+n` 금지, 폭이 부족하면 항목 단위 줄바꿈). 요약값은 펼친 입력과 같은 표시 모델에서 만들고 잘못된 값·미확정 상태도 사실대로 보인다. 접힘 기억(`preferenceKey`별 저장)·펼침/접힘 포커스 이동·disclosure aria는 공통 부품이 소유한다.

선택 옵션 `appliedChips`(`PageFilterAppliedChip` — `PageFilterSummaryItem`에 `title?`·`onClear?`·`clearLabel?`)은 적용된 조건의 칩 줄 하나를 입력 영역 아래 경계선과 함께 더한다(ADR-0112). 칩은 소비자가 계산한 적용 상태에서 파생되고 초안을 반영하지 않으며, 상태와 지우기 소유권은 소비자다. `onClear`가 있는 칩만 × 지우기 버튼을 갖고(`clearLabel` 기본은 번역된 `<라벨> 필터 지우기`), 값은 28자 폭에서 줄여 보이고 전체 라벨·값은 칩의 `title`과 접근 이름에 남는다 — 소비자 `title`이 있으면 툴팁만 대신한다. 줄은 `적용됨`(`Applied`) 머리 글자와 `적용된 조건`(`Applied conditions`) 그룹 이름을 갖고 접힌 상태에서도 보인다. 칩 모양·지우기 버튼은 표 필터 칩과 같은 어휘를 쓰고 표 출력은 바뀌지 않는다. prop을 빼거나 비우면 기존 DOM이 그대로다.

`AuditTimeline`이 보이는 이벤트 타입은 `@ap/contracts`의 `AuditEvent`다. 시각은 `formatFeedTime(at)`의 `text`를 피드에 표시한다(§6.3). 같은 `<time>` 요소의 `title`에는 전체 로컬 시각을, `dateTime`에는 응답의 ISO 시각 `at`을 그대로 넣는다. `target`은 목적지 참조(§22)이지 분석 Context가 아니다. 전역 감사 조회(`auditTrail`)와 목적지 감사 — 설비 상세 감사 탭, 지표 상세 변경 이력(`entityAudit`, 지표는 `scopeId: null`) — 는 같은 저장소를 어댑터 포트([패키지 경계](../integration/platform-packages.md) §4)로 읽으며 셸 위젯이 아니다(#50, #90). 메뉴가 소유한 대상의 감사 기록은 mock에서 메뉴가 시드로 내고 앱 조립이 넣는다([ADR-0048](../adr/0048-menu-audit-seeds-join-shared-mock-audit-store.md)); 사유·값은 기록된 문자열 그대로다.

선택 `fields?: Readonly<Record<string, { label: Text; format?: (value: unknown) => string }>>`는 원본 감사 기록을 바꾸지 않고 필드명과 전후 값(null 포함)의 표시만 바꾼다(#2444). 선언하지 않은 키·값은 기존 그대로이며 접근 이름에도 같은 번역 라벨을 쓴다. 작업자 이름은 선택 동기 resolver `actorName(actor): string | undefined`의 반환값 → 이벤트의 `actorLabel` → 원본 `actor` ID 순으로 표시한다. 표시 이름이 원본 ID와 다르면 `title`에 원본 ID를 남긴다. 타임라인에는 별도의 내보내기·복사 동작이 없다.

`AuditTimeline`의 페이지 계약([ADR-0085](../adr/0085-entity-audit-cursor-pages.md), #826): 목적지 감사(`entityAudit`)는 서버가 쪽 크기를 정하고(상한 `ENTITY_AUDIT_PAGE_MAX` = 50, 클라이언트 `limit` 없음) `at` 내림차순(instant)·같으면 `id` 오름차순으로 keyset 커서(`nextCursor`, 불투명 문자열)를 준다. 마지막 쪽은 `nextCursor: null`이고 키가 없는 응답은 끝으로 읽는다. `AuditTimeline({ events, more? })`의 `more`는 Kernel `useEntityAudit`이 만든 `AuditMore`(`status` idle·loading·error·end, `load()`, `error`, `last`)다. 첫 쪽이 끝이면 버튼도 캡션도 없고(지금 모양), 더 있으면 목록 끝에 `이전 변경 이력 더 보기` 버튼(secondary·sm)을 둔다. 불러오는 동안은 `aria-disabled`·`aria-busy`로 라벨·폭을 유지하고, 성공하면 포커스가 아직 그 버튼에 있을 때만 붙인 첫 항목(없으면 끝 캡션)으로 옮기며 polite 상태 영역이 `변경 이력 N건을 더 불러왔습니다.`를 알린다. 끝에는 캡션 `더 이전 변경 이력이 없습니다.`, 실패는 목록을 그대로 둔 채 같은 버튼이 `다시 시도`로 바뀌고 `role=alert`(+ Correlation ID)가 뜬다. `forbidden`이면 버튼 없이 권한 안내 문장이다(첫 쪽 §19 배너에는 넣지 않는다). 붙인 쪽 수는 URL에 두지 않고, ref·Scope·세션이 바뀌거나 같은 대상을 다시 조회하면 첫 쪽부터 다시 읽는다.

### TreeMatrix — 서버 윈도 트리 행렬 (Decided, ADR-0169, #1768)

`TreeMatrix`는 한 계층 축(행) × 한 평면 축(열)의 선택형 SDK 부품이다. `PlatformDataTable`의 기본 동작·파일은 바꾸지 않는다. 선택된 A′ 시각을 범용 부품으로 옮긴 결정과 대안은 [ADR-0169](../adr/0169-tree-matrix.md)에 둔다.

- **모델·서버 계약:** `@ap/contracts`의 `MatrixNode`는 `id`, 0부터 시작하는 `level`, `kind: 'group' | 'leaf'`, `hasChildren`, `expanded`, `label`, 선택 `count`를 갖는다. `MatrixColumn`은 `id`, `label`, 선택 `headerNote`, `width` 프리셋(`identity`, `compact`, `value`, `wide`), `pin: 'left' | 'right'`, `alwaysVisible`을 갖는다. `MatrixWindowQuery`는 `{ levels, expanded, filters?, offset, limit }`, `MatrixWindow<N>`은 `{ nodes, offset, totalVisible }`다. `count`와 `totalVisible`은 **전체 필터 결과에 대한 서버 값**이며 브라우저가 받은 행으로 집계하지 않는다. 소비자가 자기 매개변수를 합쳐 Kernel `useMenuQuery`로 조회하고, 한 윈도의 `nodes/offset/totalVisible`과 조회 `windowSize`(limit)를 넘긴다. 전체 결과를 브라우저에 보내지 않는다.
- **렌더·고정·크기:** 소비자가 `identityColumn`을 선언하고 `renderCell(node, column)`로 내용을 그린다. 식별 열은 항상 왼쪽에 고정한다. 나머지는 왼쪽 고정 → 일반 → 오른쪽 고정 순서이며 각각 누적 폭으로 고정한다. 머리 행은 상단에, 그룹 행은 그룹 표면에 둔다. `headerNote`는 열 문구 뒤 짧은 표식이다. `useTableSize`와 `--ap-table-row-h` 계열을 공유해 행·가상 여백의 높이를 함께 바꾼다. `fill`은 내부 page-bound 등록으로 `PlatformPage layout="fill"`의 남은 본문을 채운다.
- **윈도·접기:** 앞뒤 가상 여백으로 전체 보이는 트리의 스크롤 길이를 유지한다. 스크롤·윈도 밖 키보드 이동은 `onWindowChange(offset)`만 호출하며, 소비자가 조회·취소·응답 세대를 관리한다. 접기·펼치기는 `onToggle(nodeId)`이며 서버가 새 평탄화 순서와 합계를 돌려준다. 열 수는 소비자가 정한다. 열 가상화는 제공하지 않는다.
- **가로 맞춤:** 고정하지 않은 `compact` 열은 컨테이너 폭을 나눠 쓰며 spacing 16단계까지 줄어든다. 고정 열과 다른 프리셋은 선언 폭을 유지한다. 더 줄일 수 없을 때는 가로 스크롤과 방향별 표면 그라데이션을 표시한다 (#2950).
- **톤·범례:** `cellTone`은 `info`, `danger`, `missing`, `muted` 또는 없음이다. 기존 primary-soft + semibold, danger-soft, `surface-hatched`, muted 글자 토큰으로 옮긴다. 색의 업무 의미와 색 외 표식·문구는 소비자 책임이다. `MatrixToneLegend`는 소비자 문구로 같은 표본을 그린다. 결측 빗금 유틸리티는 기존 테마 색만 사용한다.
- **선택·키보드·활성화:** 제어형 `selectedCell: { row, column } | null`과 `onSelectCell`을 쓴다. 선택은 row-selected 표면 + 안쪽 2px selected ring이다. 셀은 2차원 roving focus이며 화살표, 행 Home/End, Ctrl+Home/End, 가시 행 수만큼 PageUp/PageDown을 지원한다(PlatformDataTable 셀 선택과 같은 키 표, #2549). 윈도 밖 이동은 요청을 유지하고 해당 응답이 온 뒤 포커스·선택을 옮긴다. 식별 셀/펼침 버튼의 오른쪽·왼쪽 화살표는 닫힌 그룹을 펼치고 열린 그룹을 접는다. `onActivate(node, column)`의 포인터 제스처는 소비자가 `activateOn: 'enter' | 'click' | 'doubleClick'`으로 선언한다(기본 `enter`). **수식키 없는 Enter는 포인터 제스처 선언과 관계없이 항상 활성화**한다. 포인터 선택을 쓰는 소비자도 동등한 키보드 경로가 필요하기 때문이다. Ctrl·Alt·Shift·Meta와 함께 누른 Enter와 펼침 화살표는 아무 일도 하지 않는다(PlatformDataTable과 같은 규칙, #2549). 클릭은 Global Context를 바꾸지 않는다. 중첩 버튼·입력의 키/클릭은 자기 기능으로 남는다. `keepSelectionInView`(기본 꺼짐)를 켜면 뷰포트 크기가 바뀔 때(예: 아래 패널이 열려 행렬이 줄 때) 선택한 행을 행렬 안에서만 세로로 스크롤해 고정 머리 아래에 다시 보이고, 이미 보이면 그대로 둔다(페이지는 스크롤하지 않음, #2518).
- **서버 탐색과 reveal:** 다음/이전 항목의 의미·목적지·조상 펼침·목적 윈도 조회는 소비자가 소유한다. 소비자가 `reveal: { row, column? }`을 넘기면 해당 윈도가 도착하고 busy가 풀린 뒤 셀을 고정 머리/열 안쪽으로 드러낸다. SDK는 알 수 없는 행의 위치를 추측하지 않는다.
- **단계 순서:** `MatrixLevelOrder`는 소비자 `levels: { id, label }[]`, `value`, `defaultValue`, `onChange`를 받는다. 순서 있는 부분집합이며 최소 한 단계다. 체크박스와 이름 있는 위/아래 버튼, «기본값으로»를 표 «컬럼» 팝오버와 같은 primitive·간격으로 제공한다. 소비자가 page key에 저장하고 서버가 재그룹한다.
  팝오버는 `open`, `defaultOpen`, `onOpenChange`를 받는다. 생략하면 닫힌 채 시작하고 사용자 동작으로 열린 상태가 바뀐다.
- **필터 (행렬 바깥):** 필터 줄은 행렬 밖, 소비자의 툴바에 둔다. 소비자가 단계 키·열 값 필드를 `useTableFilterDeclaration(key, fields, { lang, validate? })`에 `column: false`로 선언하고 표의 `FilterLine`에 선언의 `filterFields`(`fields={filterFields}`)·현재 조건·`onChange`를 넘긴다(같은 editor/operator 문구, `text`·`number`·`enum`). 변경은 소비자가 `encodeFilterParams`로 자기 반복 page key에 기록하고 offset을 초기화한다. 원문이 잘못됐으면 `usePageKeyRules`/`PageKeyWarning`으로 거절하고 고치지 않는다. 필터는 서버가 전체 결과에 적용한다. 행렬 바깥에 두는 이유: 결과가 0건·오류여도 필터 줄이 남아야 조건을 고칠 수 있고, `QueryView`가 그 상태를 그리는 동안 행렬은 마운트되지 않는다. `TreeMatrix`에는 내장 필터·툴바가 없다(#2523).
- **열 숨김:** `hiddenColumns`는 소비자 입력이다. 식별 열·왼쪽/오른쪽 고정 열·`alwaysVisible` 열은 숨김과 아래 강조 열 좁히기에서도 남는다.
- **행별 강조:** `emphasis: MatrixEmphasisRule[]`, `onEmphasisChange`, `valueOf(node, column)`은 제어형이다. 규칙은 `{ row, match: { kind: 'range', min?, max? } | { kind: 'values', values: (string | number)[] } }`다. 숫자 범위는 양끝 포함이고 문자열을 숫자로 바꾸지 않으며 `null`은 언제나 제외한다. 자기 행의 로드된 값만 비교하고 같은 행의 여러 규칙은 합집합으로 표시한다. 식별 셀의 hover/focus 때 보이는 «⋯»는 Tab 순서에 항상 남고, «이 행에서 강조…» 한 항목에서 편집기를 연다. 모든 비결측 값이 숫자면 min/max, 그 밖에는 타입을 보존한 고유값 체크리스트 + 개수다. 적용/지우기를 제공하고 `sameValueRule`은 소비자의 선택 셀 버튼용 규칙 또는 결측이면 `null`을 돌려준다.
- **강조 표시·수명:** 일치 셀은 **채움 없이 안쪽 1px 점선**만 추가하며 톤과 2px 선택 ring을 유지한다. 규칙이 하나라도 있을 때만 오른쪽 고정 개수 열이 생기며 강조된 행의 일치 열 수를 표시한다. 소비자가 행동·칩·열·개수 문구를 바꿀 수 있고 기본은 중립적인 «N개 해당»이다. `MatrixEmphasisBar`는 강조 개수, 행별 삭제, 모두 지우기, «이 열만 보기» 토글을 제공한다. `onlyMatchingColumns`는 규칙이 일치한 열들의 합집합과 고정/alwaysVisible 열만 남기고 `hiddenColumns`를 함께 적용한다. 윈도 이동 때 데이터 행은 보관하지 않고 강조한 행별 일치 열 id만 기억한다. 소비자는 세션·Scope·필터·정렬/펼침 등 평탄화 순서가 바뀌는 조회 세대마다 `generation`을 바꾸거나 컴포넌트를 remount하고 선택·강조 상태도 해당 조회에 맞춘다. 기억한 id·대기 포커스·열린 필터/행 편집기의 draft는 세대 경계를 넘지 않는다. 강조는 chart zoom처럼 **일시적**이며 URL·사용자 설정·Saved View에 저장하지 않는다(§21.1).
- **접근성:** `role="treegrid"`, 전체 `aria-rowcount/colcount`, 절대 `aria-rowindex`, 행 `aria-level/expanded`, 셀 `aria-colindex/selected`, `aria-busy`를 둔다. 값은 셀의 접근 가능한 내용으로 유지한다. 그룹 단추, 행 메뉴, 단계 위/아래 단추는 이름과 키보드 경로를 갖는다. 개수 열은 읽기 전용으로 선택/활성화 대상에서 제외한다.

설비 기준 보기는 소비자가 설비를 행에, 계층의 잎을 열에 두고 [§15의 열 그룹 표](#15-platform-data-table-contract)로 조립한다(#2498). 표에 열 가상화가 없으므로 소비자가 DOM 크기·머리 가독성·스크린리더 탐색을 고려해 열 한도를 선언한다. Configuration은 잠정 한도를 200개로 정하고, 초과 시 열과 값 대신 초과 여부와 전체 잎 개수를 반환한다.

### GroupedSelectionList — 분류된 선택 목록 (Decided, ADR-0155)

`@ap/ui`의 도메인 없는 제어형 목록. 기능 패키지는 플랫폼 중 `@ap/ui`만 import할 수 있어서(경계 게이트 `ops/platform-api/scripts/check-boundaries.mjs`, [ADR-0097](../adr/0097-platform-features-and-role-based-names.md)) 토큰 발급·권한 부여 화면이 쓰는 이 조각은 `@ap/ui`에 두고, `@ap/ui`는 Kernel에 의존하지 않으므로 문구를 prop으로 받는다. 소비자는 `{ id, label, items: { id, label, description?, badge?: { label, tone? }, disabledReason? }[] }[]`와 검색 placeholder·목록 `aria-label`을 선언한다. 각 id는 목록 전체에서 유일해야 한다. 문구는 `messages?: Partial<GroupedSelectionMessages>`이고 비운 키는 한국어 기본값이다. `GROUPED_SELECTION_MESSAGES`가 ko/en 표를 내보내므로 `useI18n`을 쓰는 메뉴는 `GROUPED_SELECTION_MESSAGES[lang]`을 넘긴다.

- `mode: 'multiple'`은 `value: readonly string[]`와 `onChange(ids)`를 받는다. Checkbox 행, 현재 검색에 보이는 활성 행만 대상으로 하는 그룹 3상태 선택·`n/m`, 전체 선택 수, 모두 해제를 제공한다. `presets?: { id, label, description, itemIds }[]`는 활성 항목을 기존 선택에 더한다. 설명은 공유 Tooltip과 버튼의 접근성 설명으로 제공한다.
- `mode: 'single'`은 `value: string | null`과 `onChange(id)`를 받는다. RadioGroup/RadioGroupItem을 사용하고 선택한 행 이름을 표시한다. 프리셋은 다중 선택 전용으로 타입에서도 금지하며 그룹 전체 선택·개수를 보이지 않는다.
- 프리셋의 선택 옵션 `onApply?()`는 프리셋 적용의 `onChange` 다음에 실행한다. 소비자가 선택 출처를 기록할 수 있으며 수동 행 선택에는 실행하지 않는다. 생략하면 기존 동작 그대로다.
- 검색은 그룹 이름·항목 이름·설명·id를 대소문자 구분 없이 찾는다. 검색과 프리셋 머리는 소비자가 소유한 한 스크롤 층 안에서 sticky다. 목록은 자체 높이 제한이나 스크롤 층을 만들지 않는다.
- 비활성 항목은 설명 아래 이유를 표시하고 조작·프리셋·그룹 선택으로 바꾸지 않는다. 배지는 SDK가 StatusBadge로 렌더링한다. 키보드와 포커스는 공유 Checkbox·RadioGroup primitive를 따른다.
- 선택 수는 기본 `role=status`로 알린다. `announceSelection={false}`는 수를 그대로 보이되 라이브 알림만 끈다(페이지 조건 편집기 등 소유 폼이 선택 표시를 맡는 경우).
- 표시 옵션(#2405, 모두 옵트인, 생략하면 위 기본 모양 그대로):
  - `density: 'compact'`: 행 한 줄. 설명은 행 끝 ⓘ 툴팁(`InfoTip`과 같은 모양)으로 옮기되 ⓘ는 Tab 순서에서 빼고 체크박스·radio의 접근성 설명이 설명과 비활성 이유를 갖는다(행마다 Tab 정지점 하나). 키보드로 그 체크박스·radio에 오면 같은 툴팁이 열리고 Esc로 닫힌다(마우스 클릭으로는 열지 않음, hover는 ⓘ에서). 비활성 행의 이유는 툴팁에만 두지 않고 라벨 아래 글로 보인다.
  - `hideDisabled`: 비활성이면서 선택되지 않은 행을 목록 끝 토글 뒤로 접는다. 토글 문구 `messages.hiddenItems(count)`는 소비자가 이유를 담아 준다(예: «로그인 세션에서만 쓰는 권한이라 토큰으로 못 받음 18개»). 펼친 행은 이유를 글로 보인다. 선택된 비활성 행은 접지 않는다. 개수는 현재 검색에 맞는 접힌 행만 세며, 접힌 행만 검색에 맞으면 «검색 결과 없음» 대신 토글이 남는다. 단일 모드에서도 쓸 수 있다.
  - `selectionSummary: 'chips'`(다중 전용): sticky 머리에 선택 항목을 칩(× 해제, 비활성 항목은 해제 버튼 없음)으로 보인다. 6개를 넘으면 머리 안에서 따로 스크롤하지 않고 «+N»으로 접고, 누르면 펼치며 «접기»로 돌아간다. 머리 아래 경계선이 지나가는 행이 비치지 않게 닫는다.
  - `presetPreview`(다중 전용): 프리셋을 sticky 머리 위의 «버튼 | 추가될 항목» 줄로 옮기고, 추가될 활성 항목을 줄임표 없이 모두 나열한다. 모두 이미 선택돼 있으면 «추가할 항목 없음». 프리셋 설명은 기존처럼 툴팁과 접근성 설명이다.
  - 새 문구 키는 `GroupedSelectionOptionMessages`로 따로 두어 기존 `GroupedSelectionMessages` 전체 객체를 만드는 소비자 타입이 깨지지 않는다. `GROUPED_SELECTION_MESSAGES` ko/en 표는 두 타입을 모두 채운다.
  - 첫 소비자: 서비스·개인 토큰 발급 드로어가 네 옵션을 모두 켠다(소유자 시안 V1 선택, 2026-11-17).

### OrderedIntervalTrack — 선언과 상태 (Decided, ADR-0121)

`@ap/components`의 선택 조각 `OrderedIntervalTrack`은 `lanes`(`laneKey`, `label`), `items`(공통 `id`, `laneKey`, `orderStart`, `state`, `label`; 구간은 `kind?: 'interval'`, `orderEnd?`, `carryover?`; 점은 `kind: 'point'`), `states`(키 → `label`, `ThemeColorToken`), 명시적 유한 증가 `domain`을 받는다. 선택 입력 `axisLabel?: string`은 소비자가 주는 축 이름·단위이며 생략하면 이름을 그리지 않는다. 짝 맞추기·전이 판정·도메인 용어를 알지 않는다. `orderEnd` 없음은 열린 구간이고 점선 끝과 텍스트 «종료 미확인 · 불완전», `carryover`는 꺾쇠와 이월 문구로 구분한다. 잘못된 범위·비유한 좌표·중복 항목 ID는 표시하지 않는다. 무효 색 토큰은 `chart-no-data`로 대체한다. 선택 입력 `partialGaps?: readonly { orderStart: number; orderEnd: number }[]`는 소비자가 선언한 미수신 순서 범위다. 유한 증가 범위만 현재 창으로 잘라 쓰며 생략·빈 배열이면 미수신 표시를 추가하지 않는다. 항목 부재만으로 미수신을 추론하지 않는다. 시각·텍스트 표현은 [§16](chart.md#orderedintervaltrack-순서-트랙-decided-adr-0121)을 따른다.

`state`는 소비자의 `kind`(`ready`, `loading`, `empty`, `error`, `partial`, `forbidden`, `unsupported`)·`title`·이유 `body`·`retryLabel`·`onRetry`를 받는다. 빈 결과의 이유와 부분 결과의 범위 설명은 소비자가 제공한다. 권한 없음은 항목·범례·요약·신뢰 footer를 가린다. 첫 로딩은 보이는 `LoadingBlock`, 범위 갱신은 받은 항목을 흐리게 유지하고 `aria-busy`와 범위 요약 옆 «불러오는 중»으로 알린다. 오류는 받은 항목을 유지하며 재시도한다. 소비자 `error`에서 `onRetry`가 없어도 `onRangeRequest`가 있으면 재시도는 현재 범위를 다시 요청하고 이전 오류·취소 상태를 지운다. `onLoadStateChange`(`loading`, `ready`, `error`)로 소비자가 페이지 머리 신뢰 지표에도 범위 요청 실패를 반영한다. 프레임은 LaneTimeline과 같은 제목·도구줄·선택 요약·신뢰 footer 문법이다.

**성능 경계:** 초기 `items`와 각 `onRangeRequest(orderFrom, orderTo, signal)` 응답은 `ORDERED_TRACK_RESPONSE_LIMIT = 10,000`항목 이하이다. 초과 응답은 성공으로 자르지 않고 오류로 처리하며 받은 결과를 유지한다. 이 상한은 DOM·캔버스·텍스트 대안의 응답 처리 비용을 제한하기 위한 것이며 줄 수·계층·도메인 제한은 없다. 창이 바뀌거나 unmount·권한/지원 상태가 바뀌면 앞 요청을 abort하고, 취소를 무시한 오래된 응답·실패도 현재 창을 덮지 않는다. 가로·세로 가시 창만 그린다. 공개 타입은 `OrderedIntervalTrackProps`, `OrderedTrackLane`, `OrderedTrackItem`, `OrderedTrackState`, `OrderedTrackMarker`, `OrderedTrackStatus`, `OrderedTrackLoadState`다. [ADR-0121](../adr/0121-ordered-interval-track-sdk-piece.md).

### DetailDrawer — docked shell slot (Decided, ADR-0013)

- 렌더 대상은 셸 소유 오른쪽 고정 상세 슬롯이다. 이름 있는 `aside` landmark 안에 제목으로 이름 붙인 비모달 상세 dialog를 둔다. 기본 도킹 상태에서는 본문이 폭을 양보하며 목록을 계속 조작할 수 있고 scrim·본문 inert·overlay를 쓰지 않는다. **상세 패널 크게 보기**([ADR-0126](../adr/0126-detail-panel-content-region-expansion.md), #1459)는 같은 패널을 실제 sticky 페이지 머리 아래의 본문 영역으로 펼친다. 셸이 본문 영역과 머리의 경계를 측정해 fixed 배치하고, 사이드바·레일·머리는 계속 보이고 사용할 수 있다. 덮인 본문만 `PlatformPage`가 `inert`로 만든다. scrim·포커스 trap은 없다.
- 폭은 §7 Baseline을 따른다. 열림/닫힘은 페이지가 등록한 `focus` 키로 결정하고 `tab`으로 탭을 복원한다. 닫기 버튼·패널 안 Esc는 페이지의 `onClose`를 호출해 `focus`를 지운다. 딥링크·새로고침·Back/Forward 복원을 유지한다.
- 기본 머리는 `h-toolbar` 높이에서 제목을 한 줄로 표시한다. 소비자는 표시용 `id`와 `title`을 따로 넘긴다. 모노 ID 뒤에 `t-section-title` 제목을 놓고 `fullPageHref`가 있으면 제목에서 전체 화면으로 이동한다. 링크는 hover 밑줄과 키보드 포커스를 표시한다. 목적지가 같은 탭을 지원하면 소비자가 링크에 `tab`을 넘긴다. 오른쪽에는 링크 복사·크게 보기·닫기 순으로 `icon-sm` 버튼과 `size-4` 아이콘, 툴팁을 둔다. `focus`가 있으면 적용된 Context와 등록된 페이지 상태를 공유 링크로 복사한다. 숨은 키도 포함하며 `expand`·`returnTo`·미등록 키는 제외한다. `copyPage`로 복사할 등록 키의 값을 바꿀 수 있다. `{}`는 `focus` 없이 복사를 표시하고 `null`은 복사를 숨긴다.
- 긴 제목이 본문과 겹치지 않도록 `DetailDrawer`와 `DetailPanelHeader`에 `titleLines={2}`를 넘기면 제목을 최대 두 줄로 표시하고 머리는 `min-h-toolbar`에서 내용에 맞춰 높이를 늘린다. 이때 종류 표시와 보조 글자(`subtitle`·`metadata`)는 제목 옆이 아니라 제목 아래 줄에 둔다. 기본값 `1`은 고정 높이에서 한 줄 말줄임을 적용한다.
- 확정된 목록 결과에 선택 ID가 없으면 소비자가 `isInList={false}`를 넘긴다. 조회 중이거나 결과를 확인할 수 없으면 생략한다. 서랍은 자동 닫기에 `onListLeave`를 쓰고 생략되면 `onClose`를 호출한다. 소비자는 적용한 필터를 유지하고 `focus`를 지운다. 서랍은 닫힌 뒤 `listFocusRef`의 목록에 포커스를 옮기고 셸 토스트 «열린 항목이 목록에서 빠져 닫았습니다»로 알린다.
- 삭제 또는 조회 권한 없음이 확인된 경우 소비자는 `missing`과 요청한 `id`를 넘긴다. 서랍은 모노 ID 제목과 닫기 버튼, 공유 `StateMessage` «이 항목을 찾을 수 없습니다 — 삭제되었거나 볼 권한이 없습니다»를 표시한다. «선택 해제»는 `onClose`로 선택을 지운다.
- 닫기 왼쪽 `@ap/ui` `Button` `ghost`·`icon-sm`은 «크게 보기»/«원래 크기로» 접근 이름과 아이콘 툴팁을 갖는다(ko/en). 펼쳐도 입력·리치 에디터·본문 스크롤 DOM을 다시 마운트하지 않는다. `DetailPanelReadingColumn`은 `regions`를 선언하지 않은 펼친 내용과 모든 footer를 가운데 48rem 이내로 맞추고 하단 조작은 고정한다. 버튼으로 펼치거나 줄이면 같은 버튼에 포커스가 남고, Escape로 줄이면 그 버튼으로 복귀한다. 열린 팝업·메뉴가 Escape를 먼저 처리하고, 다음 Escape는 크게 보기를 해제하며, 그다음 Escape는 기존 `onClose`를 부른다. 닫기 버튼은 바로 `onClose`를 부른다(미저장 가드 유지). `전체 화면`은 목적지 이동이고 크게 보기는 같은 패널의 배치 변경이다.
- `DetailPanelFullscreenToggle`은 `AppShell`이나 `@ap/ui`의 `DetailPanelSlotProvider`가 제공하는 크게 보기 Context 밖에서는 아무것도 그리지 않는다.
- 열리면 닫기 버튼으로 포커스를 옮긴다. URL 도착(링크·팔레트·공간 전환·복귀·첫 로드·새로고침)으로 함께 열린 패널은 포커스를 가져가지 않고 §26의 제목 규칙을 따른다([ADR-0032](../adr/0032-arrival-focus-wins-over-restored-detail-panel.md)). 닫힐 때 패널에 포커스가 남아 있으면 연결된 트리거로 복귀하고, 트리거가 없거나 제거됐으면 main으로 복귀한다. 사용자가 이미 목록으로 옮긴 포커스는 빼앗지 않는다. 포커스 trap은 없으며 패널 밖 Esc는 상세를 닫지 않는다. 탭 전환으로 포커스된 컨트롤이 사라지면(§26) 선택된 탭 트리거로, 트리거가 없으면 패널로 옮긴다. 탭이 하나뿐이면 탭 줄을 그리지 않고 그 내용만 그린다 — 고를 것이 없고, 상세 안의 내용이 자기 탭을 가지면 탭 줄이 두 겹이 된다(사용자 결정 2026-10-26, #886 UX-8). 내용은 tabpanel처럼 키보드로 스크롤할 수 있는 영역(`role="region"`, 패널 제목으로 이름, Tab 정지점)이다. 탭 수가 둘에서 하나로 줄면 탭 줄이 함께 사라지고 포커스는 위 규칙대로 패널로 간다. 탭 수가 1과 2 사이에서 바뀌면 보이던 내용이 다시 마운트되어 그 안의 입력 상태는 남지 않는다(탭 전환이 비활성 내용을 내리는 것과 같다).
- **선택 영역 선언(Decided, #1530, [ADR-0126 개정](../adr/0126-detail-panel-content-region-expansion.md#개정--폭별-배치)):** 각 `DetailDrawerTab`은 기존 `{ id, label, content }` 또는 `{ id, label, regions: DetailDrawerRegions }`다. `content`와 `regions`를 함께 주는 것은 타입 오류다. `regions`는 필수 `body: ReactNode`와 선택 `properties`·`activity`를 받는다. 영역이 없는 기존 호출은 DOM·포커스·읽기 폭·탭 테스트를 그대로 유지한다.
- 선언한 패널의 named container `detail-panel` 자체 폭이 **960px(60rem) 미만**이면 한 열·한 스크롤이며 순서는 **본문 → 속성 → 대화**다. **960px 이상**이면 왼쪽은 본문 다음 대화, 오른쪽은 고정 **18rem 속성 track**이다. 뷰포트 media query를 쓰지 않는다. 오른쪽은 sticky·독립 세로 스크롤이고 왼쪽 본문·대화는 하나의 바깥 스크롤을 공유한다. 속성은 그 안에 중첩된 스크롤 영역이므로 좁은 배치의 DOM 순서와 같은 노드를 유지한다. 속성 안 wheel은 넓은 배치에서 바깥으로 이어지지 않는다. 좁을 때 속성은 별도 스크롤을 만들지 않는다.
- 선언한 본문에는 48rem 중앙 읽기 폭을 적용하지 않는다. 본문·속성·대화의 가로 여백은 제목과 같은 `px-5` 한 번이며 소비자는 추가 가로 inset·스크롤 frame을 넣지 않는다. `footer`는 기존 읽기 폭·고정 위치를 유지한다. 열 경계·펼침·접힘에서 입력·편집기·스크롤 노드를 복제하거나 다시 마운트하지 않는다.
- 본문·대화 스크롤과 속성 스크롤은 `role="region"`, Kernel i18n의 `detailBodyActivity`(본문 및 대화 / Body and activity)·`detailProperties`(속성 / Properties), `tabIndex={0}`, 공유 focus-visible ring(2px, inset, offset 0)을 쓴다. 본문·대화 section도 `detailBody`·`detailActivity`로 이름 붙인다. 좁을 때도 같은 이름·Tab 정지점을 유지한다. DOM·보조기술·Tab 순서는 본문 → 속성 → 대화이므로 넓을 때는 왼쪽 → 오른쪽 → 왼쪽으로 이동하며 양수 tabindex로 바꾸지 않는다.
- `properties`가 `undefined`·`null`·`false`면 속성 section·18rem track을 만들지 않고 본문·대화가 전체 폭을 쓴다. `activity`도 같은 생략 규칙이다. `body` 키는 필수이며 로딩·실패·권한 제한 상태 컴포넌트를 줄 수 있다. 속성·대화의 상태 컴포넌트는 그 영역을 유지한다. 렌더 결과가 빈 컴포넌트를 SDK가 추측하지 않으므로 영역을 생략하려면 메뉴가 없는 값으로 선언한다.
- **선택 `navigation` 슬롯(Decided, #1570):** `regions.navigation?: (scrollRoot: RefObject<HTMLElement | null>) => ReactNode`. 메뉴가 좁은 폭의 섹션 이동(예: `DetailPanelSectionNav`)을 선언하면 `DetailDrawer`가 본문·대화 스크롤 영역 **위** 형제로 놓고 그 영역(모든 영역의 anchor를 담은 공유 scroll root)의 ref를 넘긴다. 같은 container query(`@[60rem]/detail-panel:hidden`)로 두 열 폭에서 숨기므로 폭만이 결정하고 메뉴는 배치·폭을 정하지 않는다. 두 열에서는 속성 열이 따로 스크롤되어 anchor가 갈리기 때문에 좁을 때만 둔다. 선언하지 않으면 DOM이 늘지 않아 기존 소비자의 출력은 그대로다.
- 선택 `identity?: string | number`는 지금 보여 주는 대상(행 id·레코드 키)이다(#1890). 열린 채 `identity`가 바뀌면 탭 내용을 새로 마운트해 스크롤은 맨 위, 비제어 탭은 첫 탭으로 돌아간다. 서랍 자체(머리·펼침·포커스 요청·footer)는 다시 마운트하지 않고, 제어 `tab`은 페이지 값을 따른다. 생략하면 대상이 바뀌어도 스크롤·탭이 그대로다(기존 동작). 메뉴가 `key`로 서랍 전체를 다시 마운트하던 우회는 이 prop으로 대체할 수 있다.
- 선택 `returnFocusRef`는 열릴 때 비활성화되는 트리거를 명시한다. 닫기 commit에서 트리거가 다시 활성화된 뒤 공유 포커스 복귀 경로를 사용하고, 그 사이 사용자가 옮긴 포커스는 유지한다. 생략하면 기존 opener 감지와 복귀 동작을 유지한다.
- 선택 `footer?: ReactNode`는 단일·다중 탭 모두 스크롤 본문 뒤의 `shrink-0` 영역에 렌더한다. 저장·확인 같은 범용 조작이 본문을 스크롤해도 보이며, 키보드는 본문 다음 footer 조작으로 이동한다. 생략하면 DOM·동작·닫기 포커스 복귀는 그대로다.
- 크게 보기 상태의 소유자는 `DetailPanelSlotProvider` 하나다(controlled `expanded`·`onExpandedChange` 또는 기존 uncontrolled). 내용 등록과 portal 등록 모두 같은 context를 받고, 열려 있는 상세 교체는 펼침을 이어받는다. 닫힘·비움·일시 정지는 끝내며, 초기 빈 슬롯은 새로고침 복원 키를 지우지 않는다. 셸은 이 상태를 VOC에도 쓴다. 주소·보드 예외는 [Kernel §6.4](kernel.md)를 따른다.
- 한 셸에 상세 슬롯은 하나이며 마지막 등록이 이기고 개발 환경에서 중복 등록을 경고한다. 등록자가 unmount되면 해제하고, 이전 등록자가 살아 있으면 그 내용이 다시 보인다. 분석 보드에서는 다른 칸의 상세가 슬롯을 차지하면 앞 칸의 상세는 복귀하지 않고 닫힌다([16 §6](../design/analysis-board.md#6-메뉴-쪽-요구-decided)). 같은 칸 안의 다른 상세(같은 칸 두 번째 표의 «보기» 등)가 슬롯을 넘겨받는 것은 닫기가 아니다. 앞 상세의 `onClose`를 부르지 않아 그 URL 키가 남고, 넘겨받은 상세가 닫히면 페이지에서처럼 앞 상세가 다시 보인다(#3002). 슬롯은 등록자의 `scope`(칸 id)로 이를 가린다. 그 뒤 다른 칸이나 칸 밖의 상세가 슬롯을 차지하면 보이던 상세와 넘겨받기로 뒤에 있던 같은 칸 상세가 함께 닫히고, 다시 보인 상세는 처음 열었던 버튼으로 포커스를 돌려준다. `scope`만 바뀌는 것은 다시 등록이 아니다. 내용 갱신만으로 등록 우선순위를 바꾸지 않는다. 등록 방식은 둘(DOM host에 직접 portal / 노드를 맡기는 `useDetailPanelContent`, 셸 `detailPanel` prop)이지만 활성 등록자는 하나다([ADR-0047](../adr/0047-detail-panel-slot-single-registrant-model.md)). 등록 primitive는 `@ap/ui`에 있으며 DetailDrawer는 AppShell(또는 같은 슬롯 Provider·host) 아래에서 사용한다.
- 오른쪽 자리는 한 번에 하나다. 상세와 VOC 등록 드로어(§8)은 서로 바꿔 열린다. 바꿔 열어도 등록 초안과 상세 선택(`focus`)은 남고, 돌아오면 다시 보인다. 상세에 저장하지 않은 편집이 있을 때의 처리는 아래 `activation` 규칙이 정한다([ADR-0070](../adr/0070-global-features-platform-menu-and-voc-drawer.md)). 상세가 **새로 보이게 되면**(새 등록자, 닫힘→열림; 열려 있는 상세의 재렌더·닫힘·해제·복귀는 아니다. 호스트 hook의 `activation`) 그 상세가 오른쪽 자리를 가져가고 열려 있던 VOC 등록 드로어는 초안을 둔 채 숨는다. 레일 버튼이 다시 패널을 보이고 상세를 숨긴다.

결정과 비교 선택지는 [ADR-0013](../adr/0013-detail-panel-shell-docked-slot.md), 배치는 [07](../design/app-shell.md), 시각 규칙은 [DESIGN](../../DESIGN.md#shell-visual-rules)을 따른다.

### PanelSettingsDrawer (Decided, #2762)

`PanelWorkspacePanel.onOpenSettings`를 선언하면 패널 ⋯ 메뉴에 «패널 설정»이 생긴다. 단일 차트와 패널이 머리줄을 공유하면 차트의 «더보기»에 이 항목을 둔다. `PanelSettingsDrawer`는 패널 이름을 제목으로 쓰고, 공용 상세 슬롯에 `Inspector` 스택의 «연결» 구역을 연다. Escape로 닫으면 서랍을 연 ⋯ 또는 «더보기» 버튼으로 포커스가 돌아간다. 다른 상세가 열리면 설정 서랍을 닫는다. 소비자는 조회·Context 변경 시 서랍을 닫고, 검사를 통과한 `MenuViewPanels` 편집은 저장된 뷰 슬롯에 남긴다.

새 연결의 발신 출력은 소비자가 `sourceReference`로 지정한다(`<인스턴스 id>.<출력 키>`). 저장된 연결은 기존 `from`을 유지한다.

저장 슬롯이 후보 그래프를 따로 구성하면 소비자가 `projectCandidate`를 지정한다. 서랍은 편집한 패널을 이 함수에 넘기고 반환된 그래프를 검사한다. 검사를 통과한 그래프는 `onChange`로 전달한다. 기본 동작은 `value`에서 편집한 패널의 입력을 교체한다.

소비자는 `validateCandidate?: (candidate: MenuViewPanels) => Text | undefined`로 저장 후보에 적용할 검사를 추가할 수 있다(#3004). 서랍은 투영을 마친 그래프를 넘긴다. `Text`를 받으면 그 사유를 알리고 편집을 반영하지 않는다. 함수를 생략하거나 `undefined`를 받으면 SDK가 그래프를 검사하고 거르기 연결의 순환 등 기존 오류를 표시한다.

### FormField — 라벨·입력·도움말·오류 (Decided, #1890, [ADR-0161](../adr/0161-form-field-hint-always-visible-render-function.md))

- `@ap/ui`의 `FormField({ label, required?, showRequiredMark?, requiredMark?, requiredText?, tip?, hint?, error?, errorRole?, id?, describedBy?, className?, children })`. `children`은 렌더 함수이고 `control`(`id`·`aria-describedby`·`aria-invalid`·`aria-required`)을 라벨 가능한 입력 **하나**에 펼친다(`<Input {...control} />`). `id` 기본값은 `useId()`이고 `describedBy`는 도움말·오류 id 뒤에 붙는다. 한 필드에 입력이 여럿이면 `FormField`를 나눈다.
- 순서는 라벨 → 입력 → 도움말 → 오류, 간격 6px. 라벨은 `FieldLabel`(필수 `*`, 선택 `tip`). 도움말(`text-xs text-text-muted`)은 **항상 보이고** 오류가 나도 남는다. 오류(`text-xs text-text-danger-label`)는 그 아래에 더하고 문구는 `break-keep`이다.
- `aria-describedby`는 도움말 id, 오류 id, `describedBy` 순서이며 있는 것만 넣는다. `aria-invalid`는 오류가 있을 때만, `aria-required`는 `required`일 때만 입력에 닿는다. `Combobox`는 트리거 button에 둘 다 전달하고, `MultiCombobox`는 `aria-required`를 button에 넘기지 않는다.
- 오류에는 기본적으로 `role="alert"`·`aria-live`를 쓰지 않는다. 여러 필드가 한꺼번에 오류를 내므로 필드마다 알리지 않는다(§26/§19 한 알림자). 한 필드에 대한 서버 거절을 즉시 알려야 할 때만 `errorRole="alert"`을 선택적으로 쓴다. 호출하는 쪽은 제출하거나 칸을 벗어날 때 `error`를 넣고(글자마다 넣지 않는다), 제출이 막히면 첫 잘못된 입력으로 포커스를 옮긴다.
- 오류 테두리는 각 입력이 칠한다: `Input`·`Textarea`·`SelectTrigger`·`Combobox` 트리거는 `aria-invalid:border-accent-danger`, `MultiCombobox`는 바깥 div의 `has-[[aria-invalid=true]]:border-accent-danger`. 감싸개는 테두리를 칠하지 않는다.
- 이전: 손으로 만든 사본(이슈의 4곳과 `log-knowledge` `SpecField`, `log-analysis` `KnowledgeHandoffDialog`·`HandoffOwnerFields`)은 이전하지 않았다(`.planning/backlog.md`). `notice-voc`가 이미 `type FormField`를 내보내므로 이전 때 별칭이 필요하다.

폼 검증 조각은 모두 옵트인이고 기존 기본값은 바뀌지 않는다.

- `FieldLabel`·`FormField`의 `requiredMark?: 'asterisk' | 'text'` 기본값은 `'asterisk'`다. `'text'`는 «· 필수»를 표시하고, `requiredText`로 소비자가 Kernel i18n의 `requiredMark` 번역을 넘길 수 있다. `FormField.showRequiredMark`는 입력의 `aria-required`를 유지하면서 외부 라벨에 이미 표시한 시각 표식을 숨길 때만 사용하며 기본값은 `true`다. `RequiredMark`는 두 표식 모양을 같은 방식으로 그린다. `FormField.errorRole="alert"`은 단일 서버 거절에만 사용하고 여러 필드의 입력 검증에는 사용하지 않는다. `@ap/kernel` 메시지 `requiredMark`는 ko/en을 제공한다.
- `useValidatedSubmit({ validate, onValid })`는 제출 값을 검증하고 필드별 `errors`와 `handleSubmit(values)`를 돌려준다. 오류가 있으면 렌더 후 폼 안의 첫 `[aria-invalid="true"]` 컨트롤로 포커스를 옮긴다. 한 필드를 수정할 때는 `clearError(field)`로 그 오류만 지우고, `clearErrors()`는 닫기·초기화·모드 변경처럼 폼 전체가 리셋될 때 사용한다. `FormField`의 render-prop `control`을 실제 입력에 펼쳐야 한다.
- 선택 적용 가능한 의사결정 규칙 조각(`DecisionRuleKind`, `createDecisionUndoToastAction`, `DecisionReasonField`, `requiredDecisionReasonError`, `DecisionImpactConfirmDialog`)의 공개 API와 사용법은 [`@ap/ui` 문서](../../packages/sdk/ui/docs/decision-rules.md)를 따른다.
- `Button.disabledReason?: ReactNode`는 버튼이 `disabled` 또는 `loading`일 때만 보이는 설명을 그려 `aria-describedby`로 연결한다. 이 prop을 전달하면 설명이 숨겨져 있는 동안에도 같은 wrapper를 유지해 버튼 노드와 ref가 바뀌지 않는다. 입력 오류 때문에 제출을 막는 방식 대신 제출 시 필드 오류를 보인다.
- `validateLines(text, rule, { maxLines, maxLinesMessage? })`는 CRLF·LF·CR 줄을 1부터 검사하고 상한 다음 줄을 오류로 보고한다. 마지막 줄바꿈 하나로 생긴 빈 줄은 세지 않으며, 상한 뒤 내용을 조용히 버리지 않는다. `LineErrorList`는 선택적 `id`를 받고 처음 5개 오류와 «외 n건»을 표시하며 `messages`로 Kernel `lineError`·`lineErrorMore` 번역을 연결할 수 있다. 상한 메시지는 Kernel `lineLimitExceeded`를 넘긴다.

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

`focus=` 이외의 식별자로 상세를 복원하는 소비자는 `DetailDrawer`의 선택 prop `focusOnOpen`으로 도착(`false`)과 사용자가 연 상세(`true`)를 전달한다. 생략하면 Kernel의 기존 `focus=` 도착 판정을 따른다. 포커스 이동과 닫힐 때 복귀는 서랍이 소유한다.

열었던 버튼이 다시 마운트되거나 접힌 목록 안에 있을 수 있으면 `DetailDrawer.returnFocus?: () => boolean`으로 복귀를 맡길 수 있다. 콜백이 `false`를 반환하면 서랍은 기존 복귀 규칙을 따른다.

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

선언형 페이지 조건 레이어는 §13의 페이지 키 편집기다(Candidate, #2339). 표 열 필터·패널 필터와 별개이며 그 상태를 지우지 않는다. 기존 `PageFilterBar` 소비자를 자동 이관하지 않는다.

Table은 플랫폼 핵심 UI다.

### Static Table selection (#2192)

표의 `ColumnFilter[]`·FilterLine은 아래 표 필터 계약을 따른다. 페이지 선언 범주를 편집하는 `PageConditionCategories`(§13)는 이 모델이나 표 툴바를 대체하지 않는다.

Static `Table` is for small, fully given, read-only tables (summaries, previews, diffs, dialog lists) with no paging, filtering, export, column controls or selection; anything needing one of those, or whose row count is not bounded by the screen, uses `PlatformDataTable` (`rows` mode for given data).

The static header uses the same tokens as `PlatformDataTable`: `t-table-header`, `bg-surface-sunken`, `text-text-secondary`, `h-8` / `px-4`. Headers preserve the declared letter case. The piece carries no copy; captions, labels and sort handlers belong to the consumer. Numeric headers and cells use `align="end"`. Optional `density="compact"` matches PlatformDataTable table size 작게 (28px rows, 12px font); 12px side padding instead of 16px lets six-column summaries fit a side panel. There is no third size. `TableRow current` marks the row the screen is on (accent surface and `aria-current`); the row's own text shape and weight stay with the consumer. Borders belong to header/body cells, with separate border layout, so a sticky header keeps its bottom line; final body-row cell bottom borders are omitted.

### PlatformDataTable features

- **페이지 소유 도구행 (#2498):** `pageOwnedToolbar?: { columnVisibility?: Record<string, boolean> }`을 주면 표 내부 도구행과 결과 줄을 생략한다. 페이지가 조회 조작, 결과 요약, 열 보이기를 제공한다. 빠진 열 id는 보인다. 기본 도구행·열 환경설정은 이 옵션을 생략하면 그대로 쓴다. 페이지가 창 전체를 공급해 `externalPagination.controls`도 비우면 빈 페이지 이동 줄을 그리지 않는다.
- **셀 톤·선택 (#2498):** `PlatformColumn.cellTone`은 TreeMatrix와 같은 토큰을 셀 전체에 적용한다. `cellLabel`로 업무 의미를 접근 이름에도 전달하고 `headerLabel`로 짧은 표시 제목에 전체 열 이름을 연결할 수 있다. `selectedCell: { row, column } | null`(`TableCell` = contracts `MatrixCell`)과 `onSelectCell`을 쓰면 현재 창의 보이는 데이터 셀을 TreeMatrix와 같은 격자 키(내부 순수 함수 `gridKeyTarget`, #2549)로 탐색한다: 화살표, 행 Home/End, Ctrl+Home/End, 보이는 행 수만큼 PageUp/PageDown. `selectableCell: false`인 열과 내부 제어 열은 건너뛴다. 다른 페이지의 행은 위치를 알 수 없어 넘겨 탐색하지 않는다. `onActivateCell`은 더블클릭과 Enter를 함께 지원한다. 중첩 조작은 그 조작에 남기고 기본 표에는 셀 포커스를 넣지 않는다.
- **선언 고정 (#2498):** `PlatformColumn.initialPin: 'left'`는 사용자 설정이 없을 때 적용되며, 저장된 빈 목록도 사용자 결정으로 우선한다. `pinnedRowId`는 읽은 행 한 개를 머리글 바로 아래에 고정하고 스크롤 목록에서 제외한다. 현재 창에 없거나 행 그룹이 있는 경우에는 적용하지 않는다. 추가 조회나 그룹 순서 변경을 일으키지 않기 위해서다.

기본 기능:

- Server-side sort/filter
- Column resize
- Column visibility
- Column pin
- Multi-select
- Virtualization
- **브라우저 선호 키 (Decided, #2194):** 열 설정은 `platform:columns:v1:<userId>:<preferenceKey>`. 접힘은 같은 `platform:<kind>:v1:<userId>:<rest>` 규칙이며 kind는 `page-filter-collapsed`, `page-head-collapsed`, `analysis-collapsed`, `sidebar-collapsed`, `query-bar-collapsed`다. rest는 필터 키·메뉴 ID, 분석 섹션은 `<menuId>:<sectionId>`, 사이드바는 빈 문자열. 세션이 없으면 userId는 `anon`. 접힘 값은 JSON boolean이다. 새 키가 없으면 유효한 이전 값을 옮기고 이전 키를 삭제한다. 잘못된 이전 값은 삭제하고 기본값을 사용한다. 저장소 거부 시 현재 페이지의 메모리 선택을 유지하고 계정 변경 시 다시 읽는다. 서버 선호 계약은 바꾸지 않는다.
- Saved column preference — 보이기·너비·왼쪽 고정에 열 순서(`order`, #556a)가 더해진다. 「컬럼」 팝오버의 모든 데이터 열(보이기를 못 끄는 열 포함)에 「위로」「아래로」 버튼과 목록 안 포인터 끌기가 있고, 이동은 고정됨/나머지 묶음 안에서만 한다(묶음을 넘는 것은 핀 토글). 화면·복사·CSV·XLSX는 같은 순서(고정 열 먼저, 각 묶음은 저장된 순서)를 쓰고, 순서를 바꾼 적 없는 표는 선언 순서 그대로다. 「기본값으로」는 순서도 되돌린다.
- Column filters (#556b, [ADR-0104](../adr/0104-table-column-filters-selection-groups.md), opt-in): `PlatformColumn.filter?: ColumnFilterSpec` (`text` · `number` · `date` · `enum` with `options`) makes the column filterable: a header funnel and an entry on the filter line, both opening the one filter editor (below, ADR-0105; the #556b header popover with two fixed operators per kind and the chip row with 「필터 모두 해제」 are replaced). A table with no filterable field draws neither. The table never filters rows itself: `loadPage` receives `TableQuery = PageQuery & { filters?: ColumnFilter[] }` and the server applies them (AND), keyed by the column id. `filters` is sent **only when non-empty**; `PageQuery` is unchanged and a menu endpoint lists `filters` in `paramKeys` only when it opts in. Filterable fields are declared by `PlatformColumn.filter` and, for non-column fields, `filterFields`. The condition list is one `ColumnFilter[]`. Operators and empty-value meaning follow the operator vocabulary below; sharing, restore and the optional internal state follow the URL-held column filters bullet. Quick search and the global Context are separate. A filter change returns to page 1, clears the selection and aborts an in-flight export/copy. Export: `exportRows` receives the active conditions as top-level `filters` (not inside `scope`) for the `filtered` and `all` scopes, and the XLSX 「조회 정보」 sheet lists each active condition. `@ap/contracts` `filterRows(rows, filters, accessor)` implements the rules for mock endpoints.
- URL-held column filters (ADR-0105, opt-in): a page that lists one **repeated** (normally also **hidden**) page key in its menu hands the table its conditions with `useTableUrlState(allowedSort, { filters: { key, specs, labels?, legacy?, validate? } })`.
  `urlState.filters` is then the table's filter state (the filter line and editor read and write it; a change calls `urlState.onChange({ page: null, sorting, filters }, 'user' | 'reset')`, which writes the encoded values and `page` in one `setPage`); without `urlState.filters` the table keeps its internal state and every patch is byte-identical to before.
  The table never knows the key name.
  Codec (`@ap/contracts` `encodeFilterParam`/`parseFilterParams`): one value per condition, `<id>:<op>[:<value>]` split on the first two `:` (a value keeps its own `:`); `isEmpty`/`isNotEmpty` have no value part; numbers are `String(n)`; `between` is `from~to` (an absent date/instant end is empty); `in`/`notIn` items are joined by `~`; inside a text value or list item `%`, `~`, `\`, `#`, `/` and control characters are written `%XX` (upper-case hex; the Kernel's same-origin guard refuses a decoded `\`, `#`, `//` or control character in a written address, so the codec avoids them itself; a scalar text value keeps `~` literal; nothing else is escaped: `,` `:` spaces and Korean pass through; commas are never separators, kernel.md §URL).
  Parsing validates through `validateFilters` (undeclared field/op, shape, `requires`, `multiple: false`, a second condition on one field) and rejects, never repairs or drops.
  Caps (`FILTER_PARAM_LIMITS`): 20 conditions, 50 list items, and 2400 characters of condition length as the address/share serializer (`URLSearchParams`, key and `&` included) writes it, which leaves room for the path and typical Context under the 4000-character share limit (the whole-link limit stays authoritative for large Context); `filterParamLimit(values, key?)` tells an editor which cap an Apply would break.
  **Legacy aliases:** the page declares `legacy: [{ key, toFilter(raw) }]` (no SDK constants); present legacy keys are converted (`null` = invalid), merged after the key's own conditions (a legacy key and a condition on the same field is invalid; the one exception is two legacy keys that each give one end of the same `between` range field — `fromAt` + `toAt` — which merge into one range) and the URL is rewritten once with `replace` into the filter key with the legacy keys removed; every later filter write also clears them.
  Legacy keys must be listed in the menu's `pageKeys`.
  **Page value check (opt-in):** `validate?: (filter) => Text | null` (`FilterValueCheck`) is the page's own rule beyond the wire shape (a token rule the port applies, membership in a registry); default none, so a field with dynamic options is not constrained.
  It runs on every condition read from the address (the key's own and converted legacy values) — a refusal is one ADR-0034 sentence whose cause is the check's own reason, the query is not sent and the Reset recovers — and the table hands the same function (`urlState.validate`) to the editor, which shows the reason inline and disables `적용`.
  **Rejection:** a bad condition, legacy value or cap makes `urlState` `undefined` and adds one ADR-0034 sentence (`<field label> “<raw condition>”은 … 쓸 수 없는 필터입니다. 조건을 초기화하세요.` followed by a translated cause per reason — unknown field, unsupported condition, bad value, missing dependency, duplicate, unreadable, caps, old-address value; the label comes from `labels`, else the field id; a cap names 「필터」); `requires` is judged once on the merged set (new conditions + converted legacy values); `useTableUrlWarning().recoverKeys` lists exactly the bad keys — `sort`+`page` when either is bad, the filter key + legacy keys when a filter is bad — and `<TableUrlWarning recoverKeys={…} />` clears them in one `setPage` (default `sort`+`page`, unchanged).
  **Warning title:** `useTableUrlWarning().cause` (`'sortPage' | 'filter' | 'both'`) and `<TableUrlWarning cause={…} />` name the title after what is actually wrong — 「정렬·페이지 값이 올바르지 않습니다」 (default, sort/page only), 「필터 값이 올바르지 않습니다」 (only a condition), 「정렬·페이지·필터 값이 올바르지 않습니다」 (both).
  XLSX 조회 정보: one `필터 · <label>` row per condition, the label is the column header or the non-column field's label (the id when unknown); operators read with `FILTER_OP_LABELS` (the words the filter editor reuses).
- Filter operator vocabulary (ADR-0105, additive). `@ap/contracts` `ColumnFilter` is a closed union per kind; a spec's `ops` is the server-supported subset (absent = all of the kind); field ids contain no `:`.

  | Kind | Operators | Value |
  | --- | --- | --- |
  | text | `contains` `notContains` `startsWith` `endsWith` `equals` `notEquals` | `string` (case-insensitive; `caseSensitive: true` on the spec compares exactly) |
  | text, number, date, instant, enum | `isEmpty` `isNotEmpty` | none |
  | number | `eq` `neq` `gt` `gte` `lt` `lte` | `number` |
  | number | `between` | `[min, max]` inclusive both ends |
  | date | `between` | `{ from?, to? }` wall-clock `YYYY-MM-DD`, `from` inclusive, `to` exclusive |
  | date | `before` / `after` | `YYYY-MM-DD`; `before` = `< day`, `after` = `>=` the next day |
  | instant | `between` | `{ from?, to? }` ISO instants with offset or `Z`, half-open `[from, to)` |
  | enum | `in` `notIn` | non-empty `string[]` (`multiple: false`: exactly one value; the spec's optional `cell: 'many'` says the row value is an array of option values, see below) |

  Blank = `null | undefined | ''` for text, `null | undefined` otherwise (an enum spec with `cell: 'many'`: `null | undefined | []`). An enum spec's optional `cell?: 'scalar' | 'many'` (absent = `'scalar'`, ADR-0105 amendment) declares whether the row value is one option value or an ARRAY of them; the wire `ColumnFilter` and the URL codec are the same. With `'many'`, `in` matches when ANY element is in the filter value (server: EXISTS element ∈ values), `notIn` when the row has at least one element and NONE is in it, `isEmpty` when there is no element, `isNotEmpty` otherwise; a blank row (`[]`) is excluded by `in`/`notIn` like any blank, and `filterRows` treats a bare non-array value as a one-element array. Positive operators never match a blank; the negated ones (`notContains` `notEquals` `neq` `notIn`) exclude blanks too (SQL `NOT x` with NULL is not true) — ask for blanks with `isEmpty`/`isNotEmpty`. A spec's `requires: string[]` makes its condition valid only when the listed fields have a condition. A `between` must run forward (`betweenOrdered(kind, value)`): date and instant `from` strictly before `to` (the window is half-open, so equal ends are empty), number `min <= max` (inclusive, so equal is one value); a one-ended range is always ordered; a reversed one is `bad-value` in `validateFilters`, the URL codec and the editor. `validateFilters(filters, specs)` returns `{ ok: true } | { ok: false, reason, filter }` (`invalid-id` `undeclared-field` `duplicate-field` `op-not-allowed` `bad-value` `multiple-not-allowed` `requires-unmet`); mocks and servers reject with it, while `filterRows` stays permissive. The wire shape is mirrored for non-TS servers by `@ap/contract-schemas` (`columnFilter`, `columnFilterSpec`).
- Highlighted rows (opt-in): `PlatformDataTable.highlightedRowIds?: readonly string[]`. A row whose `getRowId` value is listed gets a one-spacing-unit accent edge at the start of its first data cell, from the same accent family as the [chart §16](chart.md#분석-선택-전달-decided-adr-0175-2732) highlight. The surfaces under text and status cells keep their colors, and screen readers hear «분석 선택에 포함» (SDK message). Omitted or empty = no highlight.
- Analysis selection from cells (#2748, opt-in): `PlatformColumn.analysisSelectionOutput = { panelId, key }` references a panel's declared `set` output ([chart §16](chart.md#분석-선택-전달-decided-adr-0175-2732)). The accessor returns the non-blank string in the output's dimension. Click, Enter or Space replaces the set with that value. ⌘ or Shift toggles membership. The Context Menu key, Shift+F10 and right-click open «이 값으로 좁히기» and «선택에 추가» / «선택에서 빼기». Esc returns focus to the cell. Cells follow the table's roving navigation. An output cell's selection gesture takes precedence over row selection or opening. The other cells and the action column keep their row actions, and the column's header filter remains independent. The page key, undo history, receiving panels and analysis-selection chip use the existing analysis-selection model.
  A table leaves output availability unknown because its rows represent a view of the dimension. A selected cell has the `surface-row-selected` surface and inset `border-selected` ring. A highlighted row uses the accent edge described above and retains its own surface. If both apply to the first cell, the selected cell's visual takes precedence and the row's accessible highlight description remains.
- Selected rows: a checked row uses `aria-selected` and the selected-row surface independently of cell selection. Analysis selections published from table cells and their chips (#2748) stay distinct from passive highlight. When a highlighted row is selected or becomes the active row, the selected or active surface wins and the edge is dropped; the keyboard focus ring stays.

- Muted rows (opt-in): `PlatformDataTable.isRowMuted?: (row: T) => boolean`. A row it accepts has `data-muted="true"` and its data cells take `text-text-muted` at rest and `text-text-secondary` while hovered, selected (`aria-selected`) or active (`activeRowId`) — muted text is below the required contrast on those surfaces (DESIGN.md §색). `_select` and `_action` cells and content that carries its own colour class (badges, links) are untouched. Visual only: selection, focus, row action and export are unchanged, so the meaning (e.g. 비활성) must also be in a visible cell such as a status badge. Absent = no row is muted. Verified by `table/__tests__/PlatformDataTable.mutedRows.test.tsx`.
- Single filter declaration (opt-in, #1233): `useTableFilterDeclaration(key, fields, { lang, validate? })` derives `{ urlFilters, filterColumnProps, filterFields }`. Each `TableFilterDeclaration` has `id`, `label` (`Text` or a resolved string), optional `spec`, `pinned` and `entry` (omit `spec` for display-only column labels that URL warnings must retain); `column: false` sends it to `filterFields`. Spread `filterColumnProps(id)` on a column to get its id, header, filter label, spec, pin and instant-entry options; pass `urlFilters` to `useTableUrlState`. Memoize the declarations and validator on their language/spec/registry inputs: unchanged inputs keep the derived option, specs, labels, validator and column pieces stable across rerenders. Duplicate ids, ids containing `:` and undeclared column lookups throw. `filterColumnProps(id, options?)` may supply late enum choices for the editor; URL wire rules keep the declared spec (enum membership remains a page-owned validator). Existing table props remain supported.
- Empty-result clear action (opt-in, #1233): `useClearFiltersAction({ filterKey, hasFilters, extraKeys? })` returns the existing `type="button"`, secondary, sm `Button` with the i18n `clearFilters` wording, or literal `null` when `hasFilters` is false (so the empty-state action wrapper also stays absent). The page decides whether conditions or extra values exist. One click clears the declared filter key, `page` and every `extraKeys` entry in one `setPage`; the SDK knows no page-specific keys. Pass the returned node to `emptyAction`.
- Default empty action (#1940): when a `PlatformDataTable` result is `empty`, the `emptyAction` prop is absent and column filters are applied, the table draws a secondary sm `조건 초기화` button (i18n `clearConditions`) that clears those filters. With no filter applied there is no button; a passed `emptyAction` (including `useClearFiltersAction`) replaces the default. Reason: the table knows its own filters, so every menu gets the way out without wiring it.
- Filter line and editor (ADR-0105, `src/table/filterLine.tsx` · `filterEditor.tsx` · `filterFields.ts`).
  **Declaration:** a column is filterable with `PlatformColumn.filter?: ColumnFilterSpec` (wire meaning only) plus the display options `filterPinned?: boolean | number` and `filterLabel?: string` (default = `header`); a field that is not a column is `PlatformDataTable.filterFields?: TableFilterField[]`, `TableFilterField = { id; label: Text; spec: ColumnFilterSpec; pinned?: boolean | number }` (a components type, not a contract).
  Ids are unique across columns and `filterFields` and contain no `:`; a clash throws at render.
  The label (`filterLabel` ?? header, or the field's `label`) is the one name for the line, the editor, the funnel and the XLSX 조회 정보 row.
  **Filter line** (the left part of the result line, only when at least one field is filterable): pinned fields as `상태 ▾` buttons in pinned order (a number is the pinned position, 1 first; unnumbered `true` pins follow in column order, then `filterFields` order — so a menu can match its approved order without reordering its columns; the same order groups 고정 in `+ 필터`) that become the chip `상태: 사용중 ×` in the same slot (the body button is the same element, so focus stays); every other active condition as a chip after them in condition order (never collapsed into `+n`, they wrap); `+ 필터` (a list of every filterable field grouped 고정 / 열 / 기타, a field search once there are more than 8, a set field shows ✓ and its value, a field whose `requires` has no condition is listed `aria-disabled` with 「먼저 ‹label› 조건이 필요합니다」, ArrowUp/Down move through the items, choosing one turns the same popover into that field's editor); `모두 지우기` when any condition exists.
  A chip is 24px (`accent-primary-soft`, `border-subtle`); its text reads 「필드: 값, 값」 for a set (`in`) and 「필드 값-문구」 otherwise (table below), its body button edits and the × (24px, named 「‹label› 필터 지우기」) removes.
  **Outside a table (#2334):** `FilterLine({ fields: readonly TableFilterField[], filters: readonly ColumnFilter[], onChange(next: ColumnFilter[]), validate?: FilterValueCheck, scopeLabel?: Text, 'aria-label'? })` (`@ap/components`) is the same line — pinned buttons and chips, `+ 필터`, 모두 지우기, the one editor and the codec caps — for a screen without a table (a chart panel). It is controlled: every gesture calls `onChange` with the next whole list, and a removal drops the conditions whose `requires` field lost its condition and says so on the line, as in the table. `validate` is the page's value check (the editor refuses inline). `scopeLabel` draws a scope marker before the conditions (e.g. 「이 패널만」); `aria-label` names the group (default 「필터」). It knows no table or chart: what the conditions narrow, and keeping a panel's conditions inside an inherited menu filter (pinned chips or leaving fields out), is the consumer's. A list the consumer sets from elsewhere (a restored view) clears a removal note that no longer holds. The table's own line is the same component with its defaults, so its output is unchanged (`table/__tests__/PlatformDataTable.filterEditor.test.tsx` pins its markup against the base). Verified by `filters/__tests__/FilterLine.test.tsx`.
  **Header funnel:** an icon button in each filterable column header (`aria-label` 「‹label› 필터」, `aria-pressed` while the column is filtered; quiet until the header is hovered or focused, always visible while filtered).
  **One editor** (a dialog named by the field label; the entry points are `+ 필터`, a chip body, a pinned button and the funnel): a header row — the field label (left) and the operator `@ap/ui` Select (right, compact; no native `<select>`) listing only the field's `ops` (else every operator of its kind) in the `FILTER_OP_LABELS` words —, then the value control; a value control per kind — text input; number input(s) (`between` takes two, sorted); date input(s) (wall-clock; 「~부터」 / 「~까지 (포함)」 sent as an exclusive +1 day; `before`/`after` take one date); instant range (`datetime-local` in the viewer's zone sent as ISO instants, 「시작 (이상)」 / 「끝 (미만)」); enum checklist as a group with a value search (from 6 options) and the operators 다음 중 하나 / 다음 중 아님, a radio choice when `multiple: false`; no value control for `isEmpty`/`isNotEmpty`.
  Footer after a divider: `지우기` (left, ghost; clears this field) and `적용` (right, primary; disabled while the draft is incomplete).
  A reopened instant condition keeps its full ISO bounds (seconds, milliseconds) until the user edits that bound.
  **Instant entry (opt-in display options):** `PlatformColumn.filterEntry` / `TableFilterField.entry` = `InstantEntry { timeZone?: string (IANA); precision?: 'minute' | 'second' }`.
  Absent = unchanged (the browser's zone, minutes).
  With either set the editor shows and parses the inputs in `timeZone` (default: the browser's) through the strict `instantToLocalField`/`localFieldToInstant` (exported from `@ap/components`): a local time that does not exist there (DST gap) or exists twice (DST fold) is refused inline with a reason and `적용` is disabled — never moved or guessed; `precision: 'second'` gives the inputs `step=1` and shows seconds.
  The editor also refuses a reversed or empty range inline (「시작은 끝보다 앞이어야 합니다」).
  `모두 지우기` writes with reason `user` (like a chip removal), so a page that closes its focused row on a user filter change (`extraPatch`) closes it for a clear too; `reset` stays the table's own return to page 1. **Apply is refused** (no write; the editor stays open with the draft and an inline translated reason) when the complete proposed list would break a codec cap (`filterParamLimit` under the default key `filter`): 20 conditions, 50 list items, 2400 encoded characters; 지우기 is never refused.
  **IME:** Enter inside a composition or right after `compositionend` never applies (the guard `useImeEnterGuard` of the ui package, #2215); a plain Enter in any value input, including the enum value search, applies once.
  A `filterFields` id must not equal any column id (filterable or not).
  **Operator and chip words (ko; en in `FILTER_OP_LABELS`):** text `포함` → chip `필드 포함 "v"`, `포함하지 않음` → `필드 포함하지 않음 v`, `다음으로 시작` → `필드 "v"로 시작`, `다음으로 끝남` → `필드 "v"로 끝남`, `같음` → `필드 같음 "v"`, `같지 않음` → `필드 같지 않음 v`; number `같음`/`같지 않음`/`초과`/`이상`/`미만`/`이하` → `= n`/`같지 않음 n`/`초과 n`/`≥ n`/`미만 n`/`≤ n`, `범위` → `a ~ b`; date `범위`/`이전`/`이후` → `a ~ b`/`이전 d`/`이후 d`; enum `다음 중 하나` → `필드: 값, 값`, `다음 중 아님` → `필드 다음 중 아님 값, 값`; `비어 있음`/`비어 있지 않음` → `필드 비어 있음`/`필드 비어 있지 않음`.
  The XLSX 조회 정보 sheet uses the same value phrases.
  **Apply:** `적용`/Enter applies this one condition (one query, one history entry through `urlState.onChange`, page 1); Esc or an outside click discards the draft; a chip × and `모두 지우기` apply at once.
  Removing a condition also removes the conditions that `require` it, and the filter line says so (a `role=status` note 「‹label› 조건도 함께 지웠습니다」) instead of letting chips vanish.
  A condition whose `requires` field has no condition is never applied and dropped: the editor shows 「‹label›은 ‹required label›과 함께 있어야 합니다.」 inline, keeps the draft and disables `적용`.
  A chip, the filter-line `aria` text and the XLSX 조회 정보 row format an `instant` bound with the field's `entry` (zone, and seconds when `precision: 'second'`); without `entry` they read as before.
  Focus returns to the opener: the header funnel, `+ 필터`, or the chip when the opener was a pinned button that turned into one (the opener wins over the result); when the opener is gone (a removed chip) it moves to `+ 필터`.
  **Modes:** with `urlState.filters` the editor reads and writes those conditions; without it the same UI drives the table's internal state (one condition per field, page reset, selection reset, export carries the filters) — behaviour of the #556b column filters.
- Select all results (#556c, [ADR-0104](../adr/0104-table-column-filters-selection-groups.md), opt-in `selectAllResults`, default off): once every row of the current page is checked and `total` is larger than the page, a bar above the rows offers 「필터 결과 전체 M행 선택」 (Gmail pattern); choosing it makes the selection `TableSelection = { kind: 'ids'; ids } | { kind: 'all'; excludedIds; total }` — an **exclusion model**: no id list is built or sent, state size is the number of excluded ids whatever the page count. In `all` mode rows on every page render checked unless excluded; unchecking adds to `excludedIds`, re-checking removes; the header checkbox is checked (indeterminate with exclusions) and clicking it clears the selection; the count reads 「전체 M행 선택」 / 「전체 M행 중 K행 제외」 and the bar offers 「선택 해제」. 「복사」 is disabled with a reason (copy reads loaded rows only). Sort and page changes keep the selection; column-filter, page-filter, Context and `filterKey` changes reset it through the Context identity. `total` is a display snapshot: at action time the server recomputes the set from Context + page filters + column filters − `excludedIds` and re-checks permission/Scope. `bulkActions(selectedIds)` keeps working for `ids` selections and is hidden in `all` mode; `bulkSelectionActions(selection: TableSelection, { filters, sorting })` renders in both modes and receives the active column filters (including table-owned filters) and sorting. The menu combines them with its Context/page filters when submitting an action; existing one-argument callbacks remain valid. Export: `@ap/components` exports `TableExportRequest` (`scope: { kind: 'selected'; ids } | { kind: 'filtered' } | { kind: 'all'; excludedIds }`, `sorting`, optional `filters`) and `exportScopeIds(scope)` for menu helpers, which must handle `all-except` (support it or refuse it); a table that never enables `selectAllResults` never sends `all`. `tableExportParams(request, { selectAll? })` (#1974) turns the request into server parameters `TableExportParams` (`ids` — `null` = every filtered row —, `excludedIds` only for an `all` scope, `sorting`, `filters` only when the request has some); the menu declares only `selectAll` (its table enabled `selectAllResults`) and spreads its own page filters beside the result. The SDK throws on an `all` scope without `selectAll`. Reason (data integrity): `ids: null` alone would make the server export the rows the user excluded, so a menu cannot drop the exclusion by omission. Tables without the prop render no bar and behave as before.
- Toolbar line and result line (`src/table/tableToolbar.tsx`, wiring in `PlatformDataTable.tsx`).
  **Toolbar line** — one row, every control 32px (`size="toolbar"`, same weight; ▾ only on a button that picks a value or opens a menu): left = the title (`h2`, truncates, full text in `title`) with a 24px ⓘ button whose tooltip carries `subtitle` (there is no second text line), then the optional **quick search slot**; right = `그룹: 없음 ▾` (a menu button with a radio list, only when a column is `groupable`; replaces the native select), `표 크기: 보통 ▾` (Table size, below), `컬럼`, `복사`, `내보내기 ▾`, then `⋯` when something collapsed.
  An optional `hideTitle?: boolean` (default `false`) declares that the page already shows the title: the table keeps its `h2` screen-reader only.
  **Merged band (R2, #1234):** with `hideTitle` and no quick search, outside a workspace panel, filters (pinned buttons, chips, `+ 필터`) sit on the left of the toolbar band; the result summary and controls sit on the right.
  The ⓘ sits immediately before the result count in the same non-wrapping pair, retaining its accessible name, tooltip and `aria-describedby`; one persistent `sr-only` description paragraph still describes the section.
  There is no separate result band.
  **One band by default (#2310):** a table with a visible title or a quick search, outside a workspace panel, is one band too — left: the title with its ⓘ and the quick search (one lead of fixed shape: the title truncates past 320px, the search is 224px), page controls, the filter line; right: the result count and trust, then the controls. It falls back to the two bands (toolbar line, then the filter and result line) only when the measured lead, page controls and controls, the filter basis (160px beside a lead, else 320px; when filterable) and fixed room for the count (120px; a longer count wraps inside the band) and the collapsed trust summary (160px) do not fit the toolbar width. Only widths that hold in both layouts and through loading and paging decide the band, so the choice neither feeds back nor flips when rows arrive. While a popover anchored in the toolbar or result line is open (a filter editor with its draft, `+ 필터`, the trust details) the band holds through a width change and follows the measurement when it closes, because switching bands remounts the filter and result lines. The P10 collapse order, the accessible names and the `aria-live` result line are unchanged; a hidden title without search keeps merging at every width (R2).
  Workspace panels retain their current two bands and visible ⓘ (`useInWorkspacePanel` still hides their `h2`).
  **Page controls slot (#2299)** — `PlatformDataTable.pageControls?: ReactNode` places screen keys that lie outside the table filter model (a view switch, a range) in the toolbar line: after the quick search and before the filter line (the band still merges when it fits; its width fit subtracts the measured controls before reserving the filter basis). No width cap; the controls wrap.
  Boundary: column conditions belong in `filterFields` ([ADR-0105](../adr/0105-one-table-filter-model.md)); `pageControls` carries only page-owned keys, which the page reads and writes itself, so moving them there keeps link state. Without the prop the markup is unchanged.
  **Quick search slot** — `PlatformDataTable.search?: ReactNode` (chosen over a declared config because the page already owns the field, its page key and its IME handling; the table only places it, max 20rem wide, shrinkable).
  `ManagementLayout` carries no search: the page puts its field on this prop.
  그 조각으로 `TableQuickSearch`(`src/table/TableQuickSearch.tsx`, #1232)이 있다: 메뉴가 자기 page key(`pageKey`, 예: `q`)와 `label`(접근 이름이자 기본 placeholder; 선택 `placeholder`·`resetKeys`, `resetKeys` 기본 `['page']`)을 주면 적용값을 `pageParam(pageKey)`로 읽고 `setPage` 한 번으로 쓴다(빈 문자열은 `null`로, `resetKeys`도 함께 지운다).
  초안은 Enter에만 적용되고, 비우면(네이티브 × 포함) 곧바로 적용되며, 밖에서(뒤로/앞으로·지우기) 적용값이 바뀌면 초안을 다시 맞추고, 조합 Enter(isComposing·keyCode 229·compositionend 직후의 Safari Enter)는 적용하지 않는다(가드는 ui 패키지의 `useImeEnterGuard`).
  다른 모양의 검색 칸은 페이지가 직접 만든다: `@ap/ui` `Input inputSize="toolbar"` (32px, `surface-sunken`, 13px).
  **Result line** — always rendered (`data-table-status-line`), inside the toolbar for the merged band and under it otherwise: left = the filter line when the table has a filterable field (it owns no border or padding of its own), right = `N건 · p/P쪽 · ● trust summary` (the former status row; the trust summary still drops to the one-line form only when it does not fit).
  A table without a filterable field shows only the right part.
  **Overflow (P10)** — the toolbar's own content-box width decides (the whole merged band when merged, not the remaining space after filters/results): below 640px `복사` moves into `⋯`, below 520px `그룹`, below 470px `표 크기`, below 420px `컬럼`, below 300px `내보내기` (it becomes a submenu), in that order (표 크기 right after 그룹: both change what the rows show) and never reordered; the `⋯` menu lists what it holds in toolbar order (그룹 and 표 크기 submenus, 컬럼 opens the same popover anchored to `⋯`, 복사 disabled without a selection, 내보내기 submenu with the same items).
  At 220px the controls collapse to `⋯`; default panel/board tables keep their title treatment, while an opted-in merged table keeps its filters and result summary within the same wrapping band.
  An unmeasured width collapses nothing.
  The band keeps its 56px (`min-h-14`) page / 40px embedded baseline; merged filters and the right-hand group may wrap within that band when space is insufficient.
  The merged trust fit uses the band content box minus the independently measured controls, the measured title and search lead (when shown) and page controls, and gaps, reserving the filter basis (160px beside a lead, else 320px) when the count and description fit beside it (otherwise the right-hand group wraps).
  Only a hidden title without search (R2) carries ⓘ beside the count: subtract its 24px and 8px gap there before comparing the count, refresh text and full trust probe.
  Neither available width nor the full probe depends on the displayed trust form, so widening the band restores full trust details.

  **Table size (`src/table/tableSize.ts`, menu in `tableToolbar.tsx`)** — `표 크기: 보통 ▾`, a 32px menu button like 그룹 with a radio list 작게 / 보통 / 크게 (keyboard: Enter opens, arrows move, Enter chooses; in `⋯` a submenu). The header, body and virtualizer share the same row height through `--ap-table-row-h`: 28px / 32px / 40px in every context. Body, header and mono typography use the [shared roles](../../DESIGN.md#typography-roles) at all three sizes. 작게 caps row buttons at 24px, with checkboxes staying centred at 14×14 (`size-3.5`) in every size. 크게 multiplies default column widths by 15/13. 작게 keeps the default widths. Date-time and badge floors scale with the default widths and apply only to defaults. Saved or dragged widths keep their values within the general resize bounds (60–600px) at every table size. Pinned columns, headers and body cells use the same widths. **Persistence:** one per-user setting for all tables, not per table — browser: `localStorage['platform:table-size:<userId>']` per account (`small` or `large`; absent = 보통; a refused write keeps the choice in memory for the page); with the Kernel's server preference seam (ADR-0098) it is written through `usePreferenceController` `setTable('platform:table-size', size)`, i.e. under the hashed `columns:h1_…` key that table preferences already use (so no new server key shape), and shown from the server only. Tables on one page change together; it survives a reload.
- Row groups (#556d, [ADR-0104](../adr/0104-table-column-filters-selection-groups.md), opt-in): `PlatformColumn.groupable` columns feed a toolbar 「그룹: 없음 ▾」 menu (before 「컬럼」; 「그룹 없음」 default; absent when no column is groupable). Choosing one sends `TableQuery.groupBy: <column id>` — **one level**; a future multi-level form would be a new additive field (`groupBy: string[]`), not a type change — and returns to page 1, expands every group and **keeps the selection** (by row id). The server answers rows ordered by group key then the request sorting, plus `GroupedPageResult.groups: PageGroup[]` (`{ key, label, count, subtotals?, continued? }`) for each group that has rows on this page, each describing the **whole filtered result**. The table renders group header rows as virtual items keyed `group:<key>`: a sticky leading cell (collapse button with `aria-expanded`, name 「‹label› 그룹 접기/펼치기」, label, `N행 (전체 결과)`) and subtotal cells under columns declared `PlatformColumn.subtotal` (display only; labelled 「합계」 and, for assistive tech, 「전체 결과 합계」). `subtotal` follows ADR-0082: declare it only for a column whose reaggregation is `sum`; the server computes it and the table never groups or sums a server page. A group that starts on an earlier page repeats its header with 「(이어서)」 — shown only when the server answers `PageGroup.continued: true` (the table never infers it from counts). The leading label cell stops before the first `subtotal` column in the displayed column order (left-pinned, centre, right-pinned), so every subtotal stays under its own column; when the first displayed column is itself a subtotal column, the label and that total share its cell. Collapsing hides that group's rows on the current page only (state keyed by group key, reset on group/Context change); 「현재 쪽 전체 선택」 still covers collapsed rows and the count adds 「접힌 그룹의 N행 포함」. While grouped, `aria-rowcount="-1"` (unknown to a page-window) and `aria-rowindex` follows the rendered order (header rows included). Export stays flat rows. A table without a groupable column, or a response without `groups`, renders exactly as before. `groupPage(rows, { groupBy, sorting, subtotalColumns, accessor, page, pageSize })` in `@ap/contracts` is the mock endpoint's half: group key then **all** sorting keys (null/undefined/`''` normalized to one empty bucket, sorted last, and the sorting applies inside it), empty key = `''` labelled 「(값 없음)」, `continued` set on the page's first group when the row before the slice has the same key, sums only the declared columns.
- Row action
- 서버 페이징 표의 조회 신원과 내보내기 머리말의 전역 Context는 Condition 프리셋이 있는 메뉴에서 **적용된** 활성 프리셋의 축만 남긴 값(`useQueryContext()`)을 쓴다(§6.4, ADR-0083, #819). Apply 메뉴의 미적용 프리셋 전환이나 프리셋 밖 축의 변경은 (활성 프리셋과 다른 조회 입력 — page 필터·초기화 키 — 이 그대로일 때. 프리셋 키가 없어 조건 편집으로 추정 프리셋이 바뀌면 다시 조회한다) 표를 다시 조회하거나 선택을 버리지 않고, 프리셋이 없는 메뉴는 전과 같다.
- 서버 페이징 표의 `onPageReadyChange`는 현재 요청이 성공했을 때 `true`를 알린다. 빈 결과도 성공이다. 조회 중·실패·페이지 범위 보정 중에는 `false`를 알린다. 목록 전체에서 선택 항목이 빠졌는지는 소비자가 판단한다.
- Cell display defaults (#2747): `PlatformColumn.cellKind` overrides inference from `filter.kind` (`number` or `instant`), with `text` as the fallback. `number` aligns right and uses tabular digits. `instant` and `instant-seconds` keep date-time values on one line with tabular digits and minimum widths of 136px and 176px at the normal size. `badge` has a 128px minimum at the normal size. These floors scale with the default column widths (크게 ×15/13) and apply to default widths only. Saved or dragged widths follow the general resize bounds. The kind sets display defaults; the consumer still formats the value.
  A badge column shows plain text for a single non-empty value when the whole result is loaded or a one-value enum filter (`in` with one option) on the column's own field guarantees it across all pages and the column uses `row[id]`. A text `equals` filter does not count: it compares the value as a string. It reads the label from the string `exportValue`, then the enum label or the raw value. A partial page, including a window with external pagination, does not establish uniformity on its own. For a non-empty `longText` cell with a non-empty string accessor, the SDK displays that text with an ellipsis in place of a custom `cell` renderer. Pointer hover and keyboard focus reveal the full text when `useIsTruncated` measures clipping. `isCellEmpty(row)` mutes a consumer's empty-value label without italics.
- Width and chrome (#1166): a table narrower than its scrollport grows its unfixed columns (not selection/action, left-pinned or user-resized ones) in proportion to their size so it fills the width; wider, the row area scrolls horizontally. The right-pinned action column has one 1px `border-strong` left edge and an opaque surface. While content scrolls behind it, the 20px fade sits outside the line. Column-group edges use `border-control`. A header stays on one line, truncates with an ellipsis and names the full label in `title`; body cells keep wrapping anywhere. Inside a panel or board pane (`EmbeddedPane`) the table draws no border, radius or outer padding at any density.
- Keyset page presentation (#1443): optional `externalPagination={{ summary, controls }}` lets a consumer own the page summary and cursor controls when its data source has no total count. The shared toolbar, columns and density remain table-owned. The table shows neither its offset pager nor a derived total in this mode, and uses `aria-rowcount=-1` for the unknown full row count. Without the prop, existing pagination is unchanged. `loadPage` supplies the current chunk; caller-owned metadata changes must also change `filterKey` so the table requests the new chunk; `total` in that envelope describes only that chunk and is never presented as the overall total.
- Read again after a write (#1672, [ADR-0137](../adr/0137-table-refresh-on-and-given-rows.md), opt-in): `refreshOn?: readonly { id: string }[]` lists the endpoints this table's `loadPage` reads (the endpoint declarations a menu already has; `loadPage` is opaque to the table). After a `useMenuAction` whose `invalidates` names a listed endpoint settles (`ok`, `conflict` or `unknown`, [ADR-0054](../adr/0054-write-port-declared-actions-idempotency-version.md)), the table calls `loadPage` again for the same page: Kernel `useEndpointRefreshEpoch(ids)` joins the request identity, never the Context identity, so page and selection stay and the previous rows stay visible with `aria-busy` while loading. A page that disappeared is clamped by the existing past-the-end rule. Without `refreshOn`, or for an unlisted endpoint, requests are unchanged. `filterKey` is Context identity: it must not carry a data version (it returns to page 1 and clears selection); a page-owned search or query given through `rows` still changes `filterKey`.
- Keep results across remounts (#2380, opt-in): `cacheKey?: string` (`loadPage` branch only) keeps each answered page (`isAnswered` outcomes) in the Kernel query engine (ADR-0086) under `cacheKey` plus the full request identity (Context, page, sort, filters, group, data version) and the page size. A remounted table whose request is kept shows it at once without calling `loadPage` and without `aria-busy`, and keeps showing it while the next unkept page loads. Failures are never kept. Kept pages leave with the session generation (adapter, revision, user) and after the engine's `gcTime` (5 minutes). Writes the table sees arrive through `refreshOn`, whose epoch is part of the identity; after a write the table cannot see, the screen passes a new `cacheKey`, which reads again at once (the same Context's rows stay while it loads). Kept pages outlive the screen, so a write counter that restarts on remount needs a per-mount part in the key. The key must be unique in the app (start it with the menu id). Without the prop requests are unchanged.
- Given rows (#1672, opt-in): `rows: readonly T[]` (+ `rowsLoading?: boolean`) replaces `loadPage` (the two are exclusive in the type; `refreshOn` and `selectAllResults` belong to `loadPage`). The table builds its own loader and §19 envelope (`ok`/`empty` by row count, `trust: null`, no assessments). Without `externalPagination` it filters (`validateFilters`, a failing filter is an `error` state as on a server), groups (`groupable`, `subtotal`) or sorts, and pages locally, all through the column value `value?.(row) ?? row[id]`, so a sortable column's id need not be a row property. With `externalPagination` the menu owns the window: every given row shows in the given order, and `filter`, `filterFields` and `groupable` are ignored (one development warning) because they need the whole result, which the table does not have. Without `urlState`, column sorting controls are also disabled (included in the development warning): sorting a window cannot order the whole result. With `urlState`, sorting remains available so the menu can request the sorted window. A new `rows` reference or a `rowsLoading` change reads again through the request identity like `refreshOn`, so page, selection and visible rows survive. `rows` is a successful result: a failed read stays with `QueryView`, never `rows={[]}`; `rowsLoading` shows the table's loading state. A `rows` table shows no Data Trust, so the page shows it when the read carries one. Memoize `rows`: a new reference on every parent render re-runs the local read.
- Export entry — 표 소유 내보내기(#173): `PlatformDataTable`이 `exportRows`·`exportNote` 계약으로 직렬화·파일·토스트까지 소유한다([ADR-0008](../adr/0008-table-owned-export-fixed-toolbar.md)). 선택 행 복사(#174)도 같은 게이트·직렬화를 쓰는 내보내기다. 아래 "표 내보내기·복사 구현 계약"

Baseline (Decided — `DESIGN.md` `table-density` 토큰과 일치):

```text
Row height       32px (보통 크기 기준; 작게 28px, 크게 40px — Table size)
Header height    32px (보통 크기 기준)
Cell padding     4px 16px
```

표의 결과 줄(예전 상태 줄, 오른쪽 부분)은 전체 Data Trust 줄이 자기 컨테이너(뷰포트가 아님)의 가로 공간(결과 수·갱신 중 표시와 간격을 뺀 나머지)에 들어가지 않을 때만 한 줄 요약(점 + 짧은 상태 + `자세히`)으로 줄이고 전체 항목은 팝오버에 둔다. 들어가면 전체 줄을 보인다. 판단은 보이는 형태와 별개로 전체 줄을 숨겨 둔 측정용 복사본(aria-hidden, 포커스·낭독 없음)의 폭으로 한다. 요약에서도 로직 버전 혼재는 경고 점과 접근 가능한 이름·`title`의 `로직 버전 혼재`로 남는다(§18). 고정 열(오른쪽 동작 열, 왼쪽 고정 열)은 머리·본문·hover·선택 행 모두 셀 전체가 불투명 배경이고, 행 영역이 가로로 넘치고 그 쪽 끝까지 스크롤하지 않은 동안 안쪽 가장자리에 20px 페이드(셀 자신의 pseudo-element, 포인터 무시)를 그려 반쯤 잘린 열의 글자가 보이지 않게 한다(#1166).

보통 크기의 행·머리 높이 기준은 32px이고, 사용자 표 크기(작게 28px·보통 32px·크게 40px)는 위 Table size 계약을 따른다. 행 높이는 줄바꿈·포커스·24px 최소 타겟에 따라 선택한 크기보다 늘어날 수 있으며, coarse-pointer(터치) 행은 44px 타겟까지 커진다. 동작 열 버튼은 `toolbar`(32px) 크기라 동작 열 셀은 위아래 여백이 없고 행은 32px에 머문다.

표 높이·열 규칙([ADR-0037](../adr/0037-table-filter-consistency.md)): 행 영역은 내용 높이만큼이고 최대 `max(240px, R)`까지만 커진다(R = 스크롤 컨테이너 가시 높이 − 고정 머리 − 표 위쪽 내용 − 표 아래 쪽 넘김·형제 내용·본문 아래 여백, 맨 위로 스크롤한 상태 기준). 명시한 `height`는 분석 표의 상한이다. 선택 열은 선택을 읽는 기능(내보내기·복사, `bulkActions`)이 있는 표에만 있다. `rowAction`이 있으면 동작 열은 오른쪽에 고정하고(불투명 배경·왼쪽 경계선), 스크롤 영역이 사용자 왼쪽 고정 열 + 동작 열(128px) + 120px보다 좁아도 사용자 왼쪽 고정 열 + 72px + 120px 이상이면 동작 열은 72px 아이콘 전용 compact 형태로 계속 고정한다(`rowAction(row, { compact })`; 모든 동작은 같은 접근 가능한 이름의 아이콘 버튼·링크이고 툴팁이 가린 글자를 hover와 키보드 포커스에서 보인다, 공통 부품 `RowAction` — 같은 요소를 두 형태로 그려 compact ↔ 일반 전환에도 DOM 노드와 포커스가 유지된다). 그보다 좁으면 고정하지 않고 일반(글자) 형태로 스크롤에 섞인다. 행 영역이 800px보다 넓어도, 첫 가로 위치에서 일반 동작 열이나 그 페이드에 가려진 데이터 열이 compact 동작 열과 그 페이드 앞에 온전히 드러나면 compact로 고정한다. 각 형태의 페이드는 가로로 더 스크롤할 수 있을 때만 감안한다. 너비를 지정한 열 그룹은 첫 위치에서 그룹 안에 온전히 들어오는 말단 열을 기준으로 판단한다. 동작 열은 사용자가 고정할 수 없고 저장되지 않는다. 행 영역은 기본으로 휠을 가둔다(`overscroll-contain`, 흐름 페이지·서랍). 작업 영역 패널이나 보드 칸 안에서는 본문도 스크롤하므로 행 영역 끝에서 휠이 바깥 컨테이너로 이어진다(`overscroll-auto`, #700).
- **선택 높이 채움(#1473):** `PlatformDataTable.fill?: boolean`은 기본 `false`다. `fill`이면 부모 flex 영역의 남은 높이를 상한으로 쓰고 행 영역만 스크롤하며 `tableFit`의 높이 상한은 쓰지 않는다. `height`를 명시하면 그 행 영역 상한도 지킨다. 행이 적을 때는 내용만큼만 자라고 빈 고정 높이를 만들지 않는다. 메뉴는 높이를 DOM으로 재지 않고 `PlatformPage layout="fill"`의 남은 영역을 flex로 전달한다. `fill` 표가 보이는 동안에만 가장 가까운 `layout="fill"` 페이지가 본문을 컨테이너 높이로 묶는다(`min-h-0`, 내부 등록, 공개 prop 없음). 표가 없거나 `fill`이 아닌 페이지의 크기는 그대로다. 기본값과 기존 소비자의 상한 계산은 그대로다.

숫자는 오른쪽 정렬하고 `tabular-nums`를 사용한다.

대규모 데이터에서는 브라우저에 전체 데이터를 전달하지 않는다. 서버가 선언 행 상한(`limits.maxRows`)으로 판정한다 — [실서버 연결 체크리스트](../integration/real-server-checklist.md) §3(#175).

메모리 정렬(`sortRows`·`sortAndPage`, mock 서버·내보내기·행을 직접 넘기는 표, #2218)은 문자열 쌍을 `Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })`로 비교해 자연 순서(`EQ-2`가 `EQ-10` 앞, 대소문자 무시)를 쓰고, 숫자와 날짜는 `<`, 값 종류가 섞인 열은 종류 순서(숫자, 불리언, 문자열, 그 밖의 값)를 먼저 따라 순서가 순환하지 않게 하며(결정: 리뷰 지적 반영, 되돌릴 수 있음), null은 오름차순 맨 뒤, 같으면 안정 순서다. locale은 실행 환경 기본이다(`PageQuery`에 언어가 없다). mock의 정렬 순서는 실서버와 맞춰야 하는 계약이 아니다 — 실서버는 DB collation으로 정렬한다.

표 URL 상태: 페이지 키 `page`는 1부터이며 생략=1, 정렬 키는 `<열 id>:asc|desc` 한 개다. 허용 열·키 이름은 페이지가 소유하고, 형식 오류는 보정하지 않고 거부한다(§6.4). 성공 응답(`ok`·`empty`)이 범위 밖 페이지이면 표가 마지막 페이지로 맞추고 페이지는 URL `page`를 replace로 고친다(0건이면 첫 페이지, 실패 응답은 맞추지 않음 — §19). 결정: 사용자, 2026-10-15, #314.

### 열 묶음 (Decided, ADR-0166, #2418)

`PlatformColumn.columnGroup?: readonly string[]`는 바깥→안쪽 묶음 id 경로이고, `PlatformDataTable.columnGroups?: Readonly<Record<string, string | PlatformColumnGroup>>`는 id→헤더 선언이다. `PlatformColumnGroup = { label: string; width?: number }`는 `@ap/components`의 공개 타입이며 문자열은 문구만 지정한다. 엔진 타입은 비공개다. 같은 묶음의 열은 `columns`에서 연속이어야 한다. 경로의 모든 id에 문구가 있어야 하며, 묶음 id는 열 id·`_select`·`_action`과 겹치거나 서로 다른 부모 경로에 쓰일 수 없다. 엔진 id와 헤더 연결이 유일해야 하므로 개발 시 `console.error`로 선언 오류를 알리고 운영에서는 조용히 둔다.

| 항목 | 규칙과 이유 |
| --- | --- |
| 순서 | `groupedOrder()` 하나가 저장 순서에서 흩어진 묶음을 첫 구성원 위치에 모은다. 화면·열 설정·이동 시작 순서·내보내기·복사가 이를 공유하므로 병합 헤더와 실제 열이 어긋나지 않는다. 읽기만으로 저장값을 쓰지 않는다. |
| 이동 | 구성 열은 자기 부모 묶음 안에서만, 묶음은 한 블록으로 형제 묶음·묶이지 않은 열 사이를 이동한다. 팝오버 묶음 소제목에도 위/아래와 끌기 손잡이가 있고, 이동 알림은 묶음 이름을 말한다. 고정됨/나머지 구간은 넘지 않는다. |
| 고정 | 최상위 묶음 단위이며 소제목에 핀 버튼을 둔다. 구성 열에는 개별 핀 버튼이 없다. 저장된 왼쪽 핀에 보이는 구성원이 하나라도 있으면 전체 묶음을 `groupedOrder` 순서로 연속 고정한다(저장 순서가 없어도 같다). 다음 핀 조작은 전체 구성원을 저장하므로 과거의 부분 핀도 일관되게 읽힌다. |
| 숨기기 | 열마다 숨긴다. 폭 미선언 묶음 폭은 보이는 구성 열 폭 합이고, 폭 선언 묶음은 선언 폭을 유지한다. 모두 숨기면 묶음 헤더도 없다. 묶음 전체 숨기기는 두지 않는다. |
| 헤더 조작 | 정렬·필터는 실제 열 헤더에서만 한다. 폭 미선언 묶음의 실제 열만 폭을 조절한다. 묶음 이름은 자기 칸 안에서 가로 스크롤의 왼쪽을 따라오고, 말줄임과 `title`로 전체 이름을 제공한다. 편집 가능한 최상위 묶음만 오른쪽 끝 끌기로 묶음 폭을 정하며, 그 순간 폭 선언 묶음과 같이 동작한다. |
| 묶음 경계선 | 맨 위 묶음이 시작하거나 끝나는 열의 왼쪽에 헤더부터 본문·행 그룹 행까지 1px `border-control` 선을 긋는다. 묶음 이름 줄의 선만으로는 본문에서 어느 묶음인지 읽히지 않기 때문이다. 폭 선언 묶음은 이 선을 넘겨도 움직이지 않는 잘림 상자에 둔다. 묶음을 선언하지 않은 표에는 없다. 선택 옵션 `columnDividers`는 열 헤더 줄과 본문의 다른 열 사이에 1px `border-subtle` 선을 더한다(기본 꺼짐: 모든 표 기본값을 바꾸지 않는다). |
| 고정 경계 | 왼쪽/중앙/오른쪽 헤더를 따로 만든 뒤 잇는다. 묶이지 않은 열·선택·행 동작 위의 빈 헤더도 해당 열의 sticky·핀 가장자리 스타일을 따른다. `_action` 경계를 묶음으로 합치지 않는다. |
| 접근성 | 묶음 헤더에 `aria-colspan`, 빈 칸은 이름 없는 `columnheader`를 남겨 열 위치를 보존한다. 실제 열 접근 이름 앞에 sr-only 묶음 경로를 붙인다(div 표의 다단 연결은 화면 낭독기마다 다르기 때문). `aria-rowcount`와 데이터·행 그룹의 `aria-rowindex`에 헤더 줄 수를 반영한다. 결과 전체가 미상인 표의 `-1`은 유지한다. |

XLSX는 여러 헤더 줄을 `{ value, columnSpan }`와 `null` 채움으로 병합하고, 복사 HTML도 여러 줄과 `colspan`을 쓴다. CSV·복사 TSV는 한 줄 `바깥 묶음 › 안쪽 묶음 › 열`이다. 보이는 내보내기 가능 열만 대상으로 같은 순서를 쓴다. 선언이 없는 표는 한 헤더 줄·기존 DOM·파일 문자열·저장 객체 모양을 유지한다. 표 크기·행 그룹·소계·서버 및 `useRowsSource` 계약은 바뀌지 않는다. 결정 이유와 대안은 [ADR-0166](../adr/0166-table-column-groups.md).

#### 사용자가 편집하는 열 묶음

`editableColumnGroups?: boolean`은 기본 `false`다([ADR-0167](../adr/0167-editable-column-groups.md), #2481). 켜면 «컬럼» 팝오버에서 개발자 선언 최상위 묶음과 사용자 묶음을 만들기·이름 바꾸기·열 넣고 빼기·풀기 할 수 있다. 꺼진 표는 새 컨트롤을 보이지 않고 저장된 묶음도 적용하지 않으며, 다른 설정 쓰기는 그 값을 보존한다. «기본값으로»는 켜짐 여부와 관계없이 묶음 snapshot을 지우고 선언 묶음과 기존 보이기·폭·핀·순서 기본값을 복원한다.

기존 사용자별 열 설정(`useColumnPreferences`, 브라우저/서버 seam 동일 객체)에 다음 선택 키를 둔다. snapshot은 최상위 소속 전체를 대체하며, 생략은 개발자 기본값, `items: []`는 모두 풀린 상태다.

```ts
groups?: {
  basis: string;
  items: { id: string; label?: string; members: string[]; width?: number }[];
}
```

- `basis`는 묶인 선언 열의 id·전체 경로와 최상위 선언 id를 선언 순서로 직렬화한 안정 문자열이다. 일반 열·문구·폭은 제외한다. 현재 선언과 다르면 snapshot을 읽기에서 무시하고 선언을 보이며 저장을 고치지 않는다. 다음 편집은 현재 선언에서 새 snapshot을 만든다.
- 첫 편집은 `{ id, members }`만 복사한다. 선언 id의 `label`은 선택이며 명시적으로 이름을 바꿀 때만 쓴다. 생성 id는 열·선언 묶음과 겹치지 않는 `u:` 접두사의 짧은 난수이며 문구가 필수다. 이름은 trim 후 1–60자, 폭은 유한수·최소 60(보통 표 크기 px)이다. 형식이 잘못된 항목을 거부하며, 알 수 없는 구성원·열 id나 `_select`·`_action`과 겹치는 묶음·빈 묶음은 읽기에서 제외하고 중복 소속은 먼저 나온 묶음이 가진다. 읽기만으로 저장하지 않는다.
- 저장 문구·폭이 선언보다 우선한다. 저장 폭이 없으면 선언 폭을 따른다. 선언과 같은 최상위 id에 속한 구성원은 선언 하위 경로를 보존하고, 다른 곳에서 온 구성원은 `[groupId]`, 어느 묶음에도 없는 열은 경로 없음으로 읽는다. `effectiveColumnGroups`에서 열·문구 쌍을 한 번 치환해 기존 모델·레이아웃·`groupedOrder`·`groupedPins`·엔진·전송·접근 이름에 전달한다. 병합 후 `groupedOrder` 순서에서 `columnGroupErrors`가 있으면 쌍 전체를 선언으로 되돌린다. 개발자 console 검사는 원래 선언을 계속 본다.
- 만들기는 열 2개 이상과 이름이 필요하다. 인접하지 않은 열은 첫 선택 열의 표시 위치로 모으고 `order`도 같은 쓰기에 저장한다. 이미 묶인 열도 선택할 수 있어 기존 묶음에서 빠지며, 빈 묶음은 없애고 한 열이 남은 묶음은 유지한다. 구성 변경 저장은 최소 1개이며 0개로 만들려면 «묶음 풀기»를 쓴다. 숨긴 열도 고를 수 있고 계속 숨겨 둔다.
- 선택은 같은 팝오버의 별도 화면이다. 모든 데이터 열의 «열 이름 선택» 체크박스와 «숨김»·기존 묶음 이름 표식을 제공하며, 보이기 체크박스·이동 손잡이·위아래·핀은 두지 않는다. 선택 수 다음 한 줄에 이름 입력·묶기/저장·취소를 둔다. Escape는 팝오버를 닫지 않고 목록으로 돌아간다. 일반 묶음 행은 손잡이·위아래·핀과 메뉴 하나만 두며, 이름 바꾸기는 인라인 Enter/blur 저장·Escape 취소다. 생성·변경·풀기는 ko/en toast와 live region으로 알린다.
- 편집 가능한 묶음 헤더의 끝 끌기와 ←/→(20 표시 px), Home·더블클릭(폭 override 해제)을 제공한다. `widthScale`로 나눠 보통 크기 px로 저장하고 마지막 변경 후 300 ms에 한 번 쓴다. 폭이 있으면 기존 폭 선언 묶음의 clip/pan과 구성 열 폭 무시를 그대로 따르며, 구성 열의 저장 폭은 지우지 않아 해제 후 복귀한다.

메뉴 뷰는 편집 가능한 메인 표의 열 묶음을 함께 저장·적용한다([ADR-0168](../adr/0168-saved-view-table-state.md), [kernel §21](kernel.md#21-saved-view-contract)). 별도 version 필드는 추가하지 않는다.

#### 묶음 폭과 묶음 넘김

`columnGroups={{ A: { label: '설비 A', width: 320 } }}`처럼 최상위 묶음에만 `width`를 선언할 수 있다. 보통 표 크기의 px이며 크게에서는 열의 선언 `size`와 같은 `widthScale`로 늘어난다. 중첩 묶음의 폭, 유한수가 아니거나 60 미만인 폭은 같은 개발 시 선언 오류로 알린다. 중첩 폭은 겹치는 넘김 영역을 만들기 때문에 지원하지 않는다.

| 항목 | 규칙과 이유 |
| --- | --- |
| 표시 영역 | 헤더·본문·행 그룹 행 모두 묶음을 정확히 선언 폭 W로 배치한다. 공용 표시 단위 seam이 `role=none`, `data-column-group-clip`, `data-group-id`인 clip box와 내부 `role=none` flex를 만든다. box는 `width: W; overflow: clip; flex-shrink: 0`, 내부는 묶음별 CSS 변수의 음수 offset만큼 `translateX`한다. `overflow: clip`은 스크롤 컨테이너가 아니므로 포커스가 box를 몰래 스크롤하지 않고 sticky의 기준은 표 scrollport로 남는다. 셀 역할·DOM 순서·접근성 트리는 보존한다. |
| 폭 계산 | 보이는 구성원 합이 W보다 작으면 표 fill과 같은 기본 폭 비율로 W까지 늘리고 넘기지 않는다. 표 전체 폭·fill·좌우 핀 offset·왼쪽 고정 폭·동작 열 fit·행 그룹 lead 폭과 sticky offset은 공용 displayed-width helper로 묶음을 W 한 번만 센다. 묶음 구성원은 표 전체 fill에서 제외한다. 원래 열 폭의 합을 쓰면 고정 영역이 겹치거나 동작 열이 불필요하게 풀리기 때문이다. 왼쪽 고정은 구성 셀이 아니라 모든 행 종류의 clip box에 적용한다. |
| 크기 조절 | 폭 선언 묶음의 구성 열은 `enableResizing: false`이며 엔진에 넘기는 sizing state에서 제외한다. 저장된 sizing은 지우지 않아 폭 선언을 해제하면 다시 적용한다. 기본은 묶음 헤더에 resize handle을 두지 않으며, 위 사용자 편집 옵션을 켠 최상위 묶음만 끝 handle로 폭 override를 조절한다. 넘김은 handle에서 시작하지 않아 두 제스처를 구별한다. |
| 넘김 상태 | 묶음 id별 px offset을 `[0, content − W]`로 clamp한다. 페이지 이동·데이터 재조회에도 유지하고 열·가시성·표 크기가 바뀌면 다시 clamp한다. 스크롤 위치 같은 일시적인 화면 상태이므로 저장·URL·내보내기에 넣지 않는다. CSS 변수는 순번이 아닌 id별 안정된 map으로 정하고 pointer 이동 중에는 `role=table` ref에 RAF로 쓰며 release에서 React state에 반영한다. |
| Pointer | 표에 위임한 primary `pointerdown`이 가장 가까운 clip box를 찾는다. 수평 이동이 4px보다 크고 수직 이동보다 클 때만 pointer capture·선택 방지·grabbing을 시작한다. up/cancel/lostcapture에서 끝낸다. 끄는 동안은 자유롭게 움직이고, 끝낼 때 offset을 가장 가까운 구성 열 경계(max보다 작은 경계) 또는 max에 맞춰 commit한다. 묶음 시작에 반쪽 열이 남지 않게 하기 위해서다(소유자 확인). 휠·키보드는 맞춤 없이 그대로 둔다. 넘김을 끝낸 pointerup과 같은 task의 click만 capture 단계에서 막고, 그 listener는 실행 여부와 관계없이 다음 `setTimeout(0)`에서 제거한다. 작은 이동의 행 동작·정렬 클릭은 보존한다. box는 `touch-action: pan-y`, 숨은 내용이 있을 때만 grab이며, armed 동안 내부 dragstart를 막는다. resize handle·input·textarea·select·contenteditable에서는 시작하지 않는다. |
| Wheel | 표에 native non-passive wheel listener를 둔다. box 위 `deltaX` 또는 Shift+`deltaY`로 그 묶음만 넘기며 해당 방향으로 움직일 수 있을 때만 `preventDefault`한다. 끝에서는 표 가로 스크롤에 넘겨, 내부 영역에 사용자를 가두지 않는다. |
| 키보드·포커스 | 숨은 내용이 있을 때만 묶음 헤더를 Tab 정지점으로 둔다. ←/→는 이전/다음 구성 열 경계, Home/End는 양 끝으로 넘긴다. ko/en 안내 문구와 기존 visible focus ring을 제공한다. 잘린 셀의 링크·버튼·체크박스로 Tab 포커스가 들어오면 그 셀을 보이는 데 필요한 만큼만 넘긴다. 마우스 없이도 모든 구성 열의 기능에 접근하기 위해서다. |
| 경계 표시 | 숨은 내용이 있는 내부 가장자리에 기존 pinned-column fade와 같은 gradient pseudo-element를 그린다(그림자 없음). 헤더·본문·행 그룹 행과 hover·선택·활성 배경을 따른다. offset commit과 0/max 경계 통과에서 갱신하고 매 pointer frame에 React를 갱신하지 않는다. |
| 행 그룹 | `groupHeaderLayout`은 표시 단위를 받아 폭 선언 묶음을 쪼개지 않는다. 첫 subtotal이 묶음 안에 있으면 lead는 묶음 시작에서 끝나고, 묶음의 subtotal·빈 셀 모두 본문과 같은 box·translate wrapper 안에 둔다. 헤더와 소계의 열 정렬을 유지하기 위해서다. |
| 전송·설정 | 내보내기·복사·컬럼 팝오버는 offset과 관계없이 `groupedOrder`의 모든 해당 구성원을 사용한다. 넘김은 시각 위치만 바꾸며 데이터나 설정의 순서를 바꾸지 않는다. |

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

페이지 조건의 초안 막대와 입력 primitive는 `PageFilterBar`(초안·접이식)가 공통화한다. 관리 화면의 필터 초안·적용(`useFilterDraft`·`useManagementFilters`·`FilterApplyButton`)은 한 표 필터 모델(ADR-0105)로 바뀌어 지웠고, 지표 카탈로그도 같은 모델로 옮겨 `PageFilterBar`의 행 모드(비접이식·`onApply` form)는 소비처가 없어 삭제됐다(ADR-0112). 메뉴는 필터 의미·URL page key·초기화 키 목록을 소유한다. 이 경계는 표 툴바의 컬럼·복사·내보내기 동작을 바꾸지 않는다(ADR-0016).

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

Trust의 시각(`updatedAt`·`dataThrough`·평가 `observedAt`)은 오프셋이 붙은 실제 시점이다. 한 줄·Popover·차트 꼬리말·표 내보내기 「조회 정보」 시트·잠정 데이터 토스트는 모두 `@ap/components`의 같은 Trust 표시 함수를 거친다: `formatInstant`로 보는 사람의 시간대에 맞추고(한 줄·꼬리말 `MM-DD HH:mm`, Popover·시트·토스트 `YYYY-MM-DD HH:mm`), 커버리지 없음은 어디서나 「미확인」이다. 오프셋 없는 값은 화면을 깨뜨리지 않고 「—」로 보인다(#2009, #2044).

`DataTrustIndicator`는 `trust`가 null이면 기본으로 아무것도 그리지 않는다. 응답에 Trust는 없고 평가 항목만 있을 때는 선택 옵션 `showWithoutTrust`가 평가 항목만으로 한 줄과 Popover를 그린다. 이때 갱신·커버리지·확정/잠정 행은 빼고 «응답에 Trust 없음»을 보이며, 메뉴는 Trust를 지어내 넘기지 않는다(서버가 말하지 않은 «확정»을 만들기 때문이다). 평가 항목이 비면 이 옵션에서도 그리지 않는다.

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

- QueryState는 idle/loading/refreshing/done과 response, missing, completedAt(number|null), refetch를 제공한다.
  Apply 게이트의 idle은 중립적인 “아직 조회하지 않았습니다”와 번역된 누락 사유 목록이며 skeleton·empty·오류가 아니다.
  같은 페이지의 조회 바가 지금 모든 누락 항목(같은 `key`)의 사유를 그리고 있으면 목록을 빼고 “위 조회 조건의 안내를 확인하세요.” 한 줄만 둔다(칸의 바도 같다).
  바가 일부만 덮거나(초안은 고쳤지만 적용 전이라 적용값 기준 누락이 남는 경우), 바가 없으면 목록을 그대로 둔다(#1170).
  이전 결과·시각을 즉시 가리고 진행 요청을 취소하며 늦은 응답을 버린다.
  refetch·refreshEpoch도 닫힌 게이트를 열지 않는다.
  **예외(opt-in, ADR-0114):** `useMenuQuery(spec, params, { keepPrevious: true })`는 같은 훅이 받아들인 마지막 `ok`·`empty` 결과를, *그 엔드포인트의 페이지 입력 `params`만* 바뀌고 세션 세대·투영 Context(Scope·기간 포함)·엔드포인트·게이트(열림, idle 아님)가 같은 동안, 새 응답이 올 때까지 `refreshing`으로 남긴다.
  `params`가 또 바뀌면 그 사이 요청의 응답은 보이지 않고 마지막 요청만 받아들인다.
  새 `params`의 응답이 오면 오류·금지·시간 초과·너무 큼을 포함해 `response`를 바로 대체한다. `QueryView`의 선언 패널은 아래 규칙에 따라 별도 `previousResult`를 표시할 수 있다.
  남긴 동안 `completedAt`은 *남긴 결과를 받아들인 시각* 그대로라 신선도 표시가 정직하고, 새 응답이 오면 새 시각이 된다.
  옵션이 없으면(기본) 위 규칙 그대로 즉시 가린다.
  `keepPrevious`를 켠 `useMenuQuery`의 결과는 추가 선택 필드 둘을 갖는다: `resultParams`(지금 보이는 결과를 불러온 `params`; 보이는 결과가 없으면 `undefined`; `useMenuQuery<P,T>`의 반환 타입 `MenuQueryState<P,T>`에서는 엔드포인트의 `P`로 타입이 정해지고, 다른 훅의 `QueryState<T>`에서는 `unknown`이다)와 `showingPrevious`(남긴 결과의 `params`가 지금 `params`와 다르면 `true`, 라이브 결과면 `false`; 비교는 조회 키와 같은 구조 비교).
  옵션이 꺼졌거나(없음·`false`) 다른 훅이면 두 필드 모두 `undefined`다(`false`가 아니다) — 화면은 이 값으로 옵션을 켠 조회와 아닌 조회를 구분하고, 켜지 않은 조회의 모양·동작은 이전과 같다.
  남긴 결과가 보이는 동안 화면의 제목·설명·드릴/클릭 핸들러·내보내기·쓰기 동작은 현재 선택이 아니라 `resultParams` 기준으로 만들거나 `showingPrevious`일 때 막는다(데이터는 이전 `params`의 것이다).
  남긴 결과는 `QueryView`의 `refreshing` 표시(상태 라벨 `role=status`+접근 가능한 이름, 영역 `aria-busy`)와 함께만 보이고, `showingPrevious`이면 라벨은 「이전 선택의 결과 · 갱신 중」(en `Previous selection · updating`), 같은 `params`의 재조회이면 「같은 조건으로 갱신 중」이다.
  옵션을 나중에 켜면(이미 받아들인 결과가 있는 상태) 그 결과가 바로 남길 범위로 갱신되어 첫 `params` 전환부터 남는다.
  기존 enabled=false·Scope 검증·live 의미는 유지한다.
  신원이 바뀌면 *이전 신원의* 결과를 즉시 가린다.
  같은 신원의 결과가 메모리(5분 이내)에 남아 있으면 다시 읽는 동안 `refreshing`으로 보인다(공유 키를 가진 메뉴·목적지 조회만, ADR-0086).
  `enabled=false`인 인스턴스는 자기가 열려 있을 때 수락한 결과만 보인다. Scope·기간·화면 준비 게이트가 닫히면 노출을 멈춘다. 관찰을 다시 열면 새 요청의 결과를 기다린다.
  세션 세대(어댑터·revision·사용자)가 바뀌면 이전 세대의 결과는 보이지도 남지도 않는다.
  같은 키(메뉴 조회는 엔드포인트·투영 Context·입력, 목적지는 ref)의 열린 인스턴스는 요청 하나를 나눈다. Scope 검증으로 보호하는 메뉴 조회는 현재 검증 세대도 키에 포함한다. 조회 컴포넌트를 다시 마운트해도 이전 검증 세대의 결과는 보이지 않는다. 조회 중(오프라인 대기 포함)에 같은 키의 열린 인스턴스가 하나도 남지 않으면 진행 요청을 취소한다.
  쓰기 `invalidates`는 그 엔드포인트의 진행 중 읽기(첫 읽기 포함)를 취소하고 다시 읽는다(ADR-0054·0086).
- **갱신 표시 띠(ADR-0114, #2381):** `QueryView`는 `status=refreshing`인 동안에만(남긴 결과 `showingPrevious=true`와 같은 `params` 재조회 모두) 조회 구역 아래쪽 가장자리에 **겹쳐 띄우는 전체 폭 띠** 하나를 그린다(`absolute inset-x-0 bottom-0`, 24px 고정 높이, `pointer-events-none`이라 아래 결과의 클릭을 막지 않는다). 문구는 「이전 선택의 결과 · 갱신 중」 또는 「같은 조건으로 갱신 중」이고 `text-xs`·secondary 글자·sunken 배경·위 경계선을 쓰며 글자 대비는 4.5:1 이상이다. 긴 문구는 한 줄 말줄임하되 전체 문구를 접근 가능한 이름으로 유지한다. 띠는 흐름 밖이라 평상시에도 갱신 중에도 행·padding·차트 트랙을 예약하거나 더하지 않는다: 본문 위치, 차트 크기, 제목 줄과 차트 도구 줄은 갱신 전후로 같고 띠가 제목·도구 줄 위에 놓이지 않는다. 화면 밀도(compact)·분석 구역 종류(차트·KPI·breakdown)·패널에 따라 위치를 바꾸지 않는다. 띠는 보이는 결과의 맨 아래 24px(표의 마지막 행·pagination 일부)를 갱신 동안 덮을 수 있다. 남긴 본문에만 옅은 tint를 겹친다. 옵션이 꺼진 조회(`showingPrevious=undefined`)는 결과 감싸개를 더하지 않고 기존처럼 본문을 바로 그린다. 옵션이 켜진 조회(`showingPrevious=false | true`)만 실제 레이아웃 상자인 결과 컨테이너를 유지해 라이브↔이전 결과 전환에 본문을 재마운트하지 않으며, `display: contents`를 쓰지 않아 부모의 형제 간격을 유지한다. **옵션은 첫 렌더부터 켠다(turn the option on from the first render).** 나중에 켜거나 끄면(`undefined`↔정의된 메타데이터) 결과 컨테이너가 생기거나 사라져 본문이 한 번 재마운트되고 본문 로컬 상태·포커스가 초기화될 수 있다. 나중에 켜도 Kernel은 이미 받아들인 결과를 첫 `params` 전환부터 남긴다. `refreshNotice?: 'visible' | 'hidden'`(기본 `visible`)은 같은 전환을 다른 구역이 이미 알릴 때 중복 띠만 숨기며 `aria-busy`·tint를 없애지 않는다. 띠에는 `role=status`와 문구 전체의 접근 가능한 이름을 주고 spinner는 reduced-motion에서 정지한다.
- **선언 패널 (#2746):** `QueryView`의 `panel`에 `title`, 본문 `height`(px), `kind`(`kpi`·`chart`·`table`·`chart-table`)를 선언한다. `kpi`는 상태 화면에도 남길 `columns` 이름을 받는다. 제목과 메뉴, 본문, 원천 푸터를 같은 순서로 유지한다. 선언 높이는 본문 최솟값이다. 더 큰 결과는 페이지 흐름에서 본문을 늘린다. 조회 중에는 종류별 중립 뼈대를 사용한다. 갱신 안내는 제목 옆에 두고 3초부터 경과 시간, 10초부터 「조건 좁히기」와 조회가 지원할 때 「취소」를 보여준다. 머리 폭이 좁으면 두 동작은 패널 더보기에 둔다. `refreshNotice="hidden"`은 갱신 중 제목 안내를 숨기고, 지원되는 「취소」는 10초부터 더보기에 둔다. 첫 오류의 복구 동작도 머리 폭이 좁으면 더보기에 둔다. 오류명은 머리의 오류 상세 버튼에 남긴다. `emptyAction`은 빈 결과에서 표시한다. `cancel`은 이 조회 관찰을 멈추고 같은 요청을 보는 다른 관찰자가 없으면 전송을 취소한다. `refetch`는 정지한 관찰을 다시 시작한다.
- 오류·시간 초과에서만 `previousResult`를 쓸 수 있다. 그 값은 같은 세션과 조회 신원에서 받아들인 마지막 `ok` 응답과 완료 시각을 담는다. `keepPrevious`를 켠 메뉴 조회는 기존 투영 Context 범위 안에서 보존하며 해당 결과의 `params`도 제공한다. 게이트 닫힘, 권한 거부, 송신 전 차단은 이 기록을 비운다. 게이트가 열린 뒤 시작한 요청부터 다시 수락한다. 취소한 관찰자도 현재 키의 권한 거부와 송신 전 차단을 반영하고 수락한 결과를 폐기한다. 선언 패널은 이전 결과를 회색으로 낮추고 제목 옆에 시각을 표시한다. 값과 표는 계속 읽을 수 있다. 렌더 함수의 세 번째 인자 `{ stale }`로 이전 결과에 대한 내보내기·드릴·쓰기 동작을 막고, 현재 조회 입력은 `panel.controls`로 결과 바깥에 둔다. 일반 조회 화면은 현재 `response`를 표시한다.
- 선언 패널의 `DataTrustIndicator`는 현재 조회를 직접 받아 「확인 중」·「확인 불가」·「결과 없음」을 표시한다. 정상 응답에 Trust가 있으면 기존 신뢰 요약을 그린다. 0건의 원인이 선택임이 확인된 호출만 `panel.selection`에 선택 이름과 지우기 동작을 제공한다. 공유 안내는 원인별 한 줄로 묶으며 이름 버튼으로 해당 패널에 포커스를 옮기고 「모두 다시 시도」를 제공한다. 공유 안내가 있을 때만 본문 상단에 띠 공간을 쓴다.
- `QueryView.panel`은 페이지 흐름의 패널 프레임을 소유한다. `PanelWorkspace`에서는 일반 `QueryView`를 사용한다. 작업 영역 탭·더보기·본문 크기와 선언 패널 상태를 연결하는 작업은 후속 범위다.
- completedAt은 현재 identity에 수락한 모든 종결 응답(오류·timeout·클라이언트 합성 오류 포함)의 클라이언트 epoch ms이며 trust.updatedAt(원천 갱신 시각)과 다르다. 동일 identity refresh는 이전 결과·시각을 유지하고 완료 때 갱신한다. 다시 마운트한 인스턴스가 메모리에 남은 같은 신원의 결과를 보일 때도 그 결과의 `completedAt`(원래 수락 시각)을 보이고 다시 읽은 응답으로 갱신한다. identity 교체·idle에서는 둘 다 null이고 취소·stale 응답은 시각을 찍지 않는다. 초안 편집만으로 적용 결과·시각을 무효화하지 않는다.
- `Not collected`, `Processing delayed`, `Insufficient coverage` 등 원인을 주장하는 상태는 Backend/status source가 현재 요청 Context에 대해 그 원인을 확인한 경우에만 표시한다. 상태 원천과 관측 기준시각을 연결할 수 있어야 하며, UI가 행 수만으로 원인을 추론하지 않는다.
- 성공한 조회가 0건이라는 사실만 확인되면 `No matching result`를 표시한다. 원인/가용성 상태를 확인할 수 없으면 `Unknown`으로 표시한다. **0건 ≠ 수집 중단·미수집·파서 지연**이다. 권한 제한 역시 서버가 확인한 경우에만 그 사유를 표시한다.
- 상태 원천이 아직 없거나 원천 조회에 실패했다면 원인을 단정하지 않는다. taxonomy의 존재가 해당 상태 판정 기능의 구현을 뜻하지 않는다.

**사용자 문구 (Decided, 사용자 2026-10-15, #304, [ADR-0034](../adr/0034-user-facing-copy-no-contract-vocabulary.md)):** 사용자에게 보이는 문구에는 계약 상태어(Candidate·Open·Deferred), 상태 enum 원문(`unknown`·`source_unavailable`·`clear`·`unsupported`·`apply`), 수식 표기(`[from, to)`, 초 정렬), 계약 문장(세션값을 자동 적용하지 않는다, 다른 Scope로 조용히 대체하지 않는다)을 쓰지 않는다. 이미 있는 번역 라벨(참조만, 이 화면에서 미사용)을 쓴다. 서버 `message`는 본문에 넣지 않고 추적 번호(`추적 번호`, 영어 `Trace ID`; 표 내보내기 파일의 `Correlation ID` 열 이름은 파일 형식이라 그대로) 옆의 접힌 「기술 정보」 안(펴면 접근 가능한 이름 `서버 세부`)에만 보인다. 본문은 계약 오류 코드별 원인과 행동이며, 매핑되지 않는 코드는 일반 오류 문구다. 이 문단은 문구 원칙이고 §19 상태 분류와 `outcome` 분기는 바꾸지 않는다.

### 공유 위젯 응답 (Decided, #2535 A안)

- `error`·`timeout`·`empty`·`forbidden`·`too_large` 응답의 상태·메시지·확정된 빈 결과 근거·복구 값이 같은 위젯이 두 개 이상이면 묶는다. 근거와 설비 ID의 순서는 무관하다. 복구 값이나 설명·원천·관측 시점이 다르면 각각 표시한다. 하나뿐이면 이름 있는 인라인 상태 카드를 쓴다.
- `PlatformPage`는 flow와 fill 본문 상단에 그룹별 띠를 하나씩 배치한다. 큰 그룹이 먼저다. 띠에 상태 접두·설명 또는 요약·동작을 두고, 전체 문구는 `title`과 「자세히」 Popover에서 읽을 수 있다. Popover 접근 이름은 상태 제목이다. 위젯 이름을 알고 있으면 띠의 접근 가능한 설명과 Popover에서 읽을 수 있다. `DetailDrawer`는 자체 scope와 상세 상단의 전체 배너를 쓴다.
- 위 띠가 원인을 말하므로, 불러오지 못한 위젯은 이름과 한 줄 「불러오지 못함」만 표시한다. 한 화면에 띠가 둘 이상이면 어느 띠인지 알 수 있게 「불러오지 못함(집계 불가)」처럼 상태를 붙인다. 결과를 받은 0건 위젯은 「위 안내 참고(0건)」를 유지한다(#2604). `aria-describedby`로 해당 띠를 연결하며, 접힌 「기술 정보」에 위젯별 추적 번호와 서버 진단을 제공한다. 집계 거부와 설비 복구 응답의 진단에는 알려진 집계 사유 코드만 표시하고, 설비 근거는 요청과 권한을 대조한 구조화 값으로 표시한다. 위젯 이름이 없으면 추정하지 않으며, 이미 위에 보이는 이름은 접근 이름으로 유지할 수 있다. `PlatformDataTable`은 `ariaLabel`로 참여한다. `OutcomeView`는 독립 카드로 그린다.
- 집계 불가·서버 오류·시간 초과는 danger, 조회 전 막힘(`customGroup blocked:`)·0건은 neutral/sunken, 권한 없음·조회 한도는 warning이다. scope의 assertive·polite 채널이 그룹별 요약과 갱신을 한 번 안내한다. 그룹의 개별 위젯은 이름 있는 일반 group으로 표시한다. [DESIGN](../../DESIGN.md#shared-outcome-banner-and-compact-widget-state).
- 띠 또는 카드마다 원인을 해결하는 주 동작을 하나까지 둔다. 조건 열기·초기화·재시도는 보조 동작이다. 검증한 설비 제외와 기간 단축을 모두 제공할 때는 설비 제외를 강조한다. 기술 정보와 띠의 「자세히」는 계속 열 수 있다.
- 응답이나 전송 계층이 일시 오류를 확인해 `retryable: true`를 보낸 경우에만 재시도를 제공한다. 응답이 영구 실패, 입력 오류, 권한 거부 또는 집계·조회 한도를 확인하면 원인에 맞는 동작을 제공한다. 그룹 재시도 버튼은 구성 위젯 전체를 재조회한다. 갱신 동안 버튼의 아이콘·busy·중복 실행 방지와 포커스를 유지한다. 띠가 사라지면 그 띠나 자체 Popover에 남은 포커스를 상세 패널 또는 페이지 본문으로 옮긴다. 이미 다른 곳으로 옮긴 포커스는 유지한다. 빈 결과에는 적용된 조건을 열 수 있는 동작을 두고, 명시적 설비 공집합에서는 필터 초기화도 제공한다.

**조회 응답 복구 값 (#2535)**

`ApiResponse<T>.recovery?: QueryRecovery`는 그 요청에서 확인한 내용만 선택 필드로 보낸다. 설비 제외, 기간 단축, 권한 요청에는 유효한 복구 값이 필요하다. 현재 화면 또는 칸의 편집기가 열기 동작을 등록했을 때 「조건 열기」를 제공한다.

- `affectedEquipmentIds`와 `authorizedEquipmentIds`는 설비 ID 집합이다. 두 번째 집합은 제출한 대상에 권한과 요청 조건을 적용한 뒤 제외하기 전의 설비다. 영향 설비가 그 집합에 속하고, 제외 후 조회 가능하다고 확인된 설비가 남아 있을 때만 두 집합을 보낸다. SDK는 현재 요청의 응답에 한해 제출한 Scope와 Selection 및 부여된 공정의 설비 목록을 대조한다. 설비 ID를 확인할 수 없거나 새 조회가 진행 중이면 그 응답의 설비를 표시하거나 주소에 쓰지 않는다.
- `maxHours`는 이 거부 사유를 해소할 수 있다고 확인된 양의 정수 시간 한도다. 현재 응답이 제공한 한도는 설비 제외 가능 여부와 별도로 적용한다. 현재 범위가 한도보다 길다면 종료 시각을 유지하고 최대 하루로 줄인다. 한도 자체가 하루보다 짧으면 그 한도를 사용한다. 적용할 수 있는 복구 동작이 없으면 편집기가 등록된 경우 조건 열기를 제공한다.
- `retryable: true`는 일시 오류를 표시한다. `false`이거나 값이 없으면 재시도 동작을 제공하지 않는다. 예를 들어 표의 로컬 필터 검증 실패는 `retryable: false`를 보내고 필터를 수정하거나 지워서 복구한다.
- `deniedScope`는 권한을 거부한 `{kind: 'site', site}` 또는 `{kind: 'site_room', site, room}`이다. 제출한 Scope와 맞고 신청 슬롯이 대상 고정을 지원하며 실서버 세션에서 신청할 수 있을 때 대상 그대로를 [`accessRequest` 슬롯](layout.md#8-shell-slots)에 준다. 기능 권한 거부나 대상을 특정할 수 없는 복합 거부에서 site·room을 추정하지 않는다. 접수 안내와 대기 상태는 실제 서비스 응답을 반영한다.

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

`coverage`의 `statusSource: "upstream-routing"`은 라우팅된 대상 일부가 답하지 않았음을 뜻하며, `clear`는 라우팅된 대상이 모두 답했다는 뜻만 가진다.

`Loading`/`Refreshing same context`는 이 응답 페이로드에 없다(클라이언트 요청 생명주기). `Partial widget failure`는 위젯 결과가 섞일 때 페이지가 종합해 도출한다.

`explainsEmpty`(이름 Candidate)는 `outcome=empty`이고 해당 평가가 `confirmed`이며 원천이 **그 요청 결과의 0건 원인**을 확인한 경우에만 true다(기본 false). UI는 배열 순서·행 수로 인과를 추론하지 않는다. 복수 원인이 확인되면 모두 유지한다. `No matching result`만 보이는 조건은 `outcome=empty`이고 표시할 `explainsEmpty=true` finding이 없을 때다 — 원인 원천이 없다는 것이 `empty`의 필수조건은 아니다. 표시할 finding이 있으면 제목은 `No matching result`가 아니라 확인된 원인의 kind(수집·처리 지연·커버리지·시간역·응답 이력)별 문구이고, finding에 `detail`이 없으면 kind 문구로 만든 기본 문장을 본문에 쓴다. 공유 상태 묶음의 제목도 같은 판정을 쓴다(#1886).

개별 원천 서비스의 실제 구현·응답 스키마 세부는 Open이며, 이 계약이 그 구현을 뜻하지 않는다.

---

## 20. Detail Surface Contract

### 의사결정 규칙 (Decided, 2026-11-19, [ADR-0174](../adr/0174-decision-rules-opt-in.md))

소비자는 동작별로 의사결정 종류를 명시해 적용한다. 적용하지 않은 동작은 기존 행동을 유지한다.

- **되돌릴 수 있음:** 즉시 실행한다. 소비자의 기존 명령으로 이전 상태를 복구할 수 있을 때만 «실행 취소» 토스트를 제공하고, 상태 아래 이력 한 줄을 계속 표시한다. 확인 대화상자는 띄우지 않는다.
- **판단 기록:** 결정과 함께 필수 한 줄 사유를 기록한다. «· 필수» 표식을 보이고 §13 폼 계약에 따라 오류를 입력 아래 표시하며, 제출이 막히면 잘못된 입력으로 포커스를 옮긴다. 결정 이력은 시간 순서로 보이고 본인 승인을 표시한다.
- **되돌릴 수 없음:** 실행 전에 확인한다. 한 문장에 영향을 받는 대상·범위·잃게 되는 기능을 쓴다. 확인 뒤에만 명령을 보내며, 취소하면 명령을 보내지 않고 트리거로 포커스를 돌린다.

#2540은 Finding «조치 불필요», Gate 결정, 권한 취소에 이 규칙을 적용한다.

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

> 디자인 시스템 원본은 SDK `@ap/ui`가 소유한다([ADR-0043](../adr/0043-platform-sdk-is-the-app-contract-and-unified-framework.md), [ADR-0046](../adr/0046-design-system-source-moves-to-platform-whole-package.md)). 기능 화면은 SDK 부품을 `@ap/ui`에서 직접 소비하고, `src/ui`는 기능 도메인 표현 부품을 소유한다.


**한/영 지원 범위(Decided, 2026-09-24):** UI 문구와 정적 본문만 번역한다. VOC·공지의 사용자 입력 본문, EquipmentID·room_name·분임조 이름 등 마스터 값과 식별자는 번역하지 않는다. 언어 설정은 `PlatformProvider.serverPreferences`를 켠 조립에서 사용자 설정 포트로 서버에 저장한다. 해당 옵션이 없는 조립은 브라우저 localStorage를 사용한다. 저장 포트와 이전 범위는 [Kernel §4](kernel.md)와 ADR-0098을 따른다. 언어 변경이 Context 값이나 URL 식별자를 바꾸지 않는다. CJK 폰트는 FO ADR-0058의 Inter + Pretendard Variable 소비 계약을 따른다.

**문구 표 (Decided, 2026-11-14, #2174):** 화면에 보이는 한·영 문구는 문구 표에 둔다. SDK 화면이 같이 쓰는 말은 Kernel 사전(`useI18n().t`), 한 패키지(SDK 패키지·메뉴·플랫폼 기능)만 쓰는 문구는 그 패키지의 `messages.ts`(키 → `Text` = `{ ko, en }`)에 두고 `useMessages(표)`나 `formatText(문구, lang, 값)`로 읽는다. 값을 끼우는 자리는 `{name}`으로 적는다. 한 파일로 모으지 않는 이유는 Kernel이 메뉴를 알게 되어 의존 방향을 깨기 때문이다. `@ap/ui`는 Kernel을 모르므로 문구를 prop으로 받고 ko/en 표를 내보낸다. 코드 안의 `lang === 'ko' ? '…' : '…'` 삼항은 lint `ap/no-lang-copy-ternary`가 막는다(한 말이 파일마다 다르게 번역되고, 영문 누락을 찾을 수 없으며, 문구를 한곳에서 검수할 수 없다). 문구가 아닌 분기(한국어 조사, 날짜 형식)는 사유를 붙인 `eslint-disable-next-line`으로 남긴다. 시험 파일은 두 언어의 기대 문구를 쓸 수 있다. 규칙은 kernel·shell·components, 모든 메뉴·플랫폼 기능 패키지와 앱(`apps/platform-web`)에 켜져 있다.

### Token value source (Decided — ADR-0011)

공유 색·반경·간격·폰트·본문 값의 원본은 플랫폼이다: [tokens.css](../../packages/sdk/ui/src/styles/tokens.css)·[semantic.css](../../packages/sdk/ui/src/styles/semantic.css)·[theme.css](../../packages/sdk/ui/src/styles/theme.css)·[compat.css](../../packages/sdk/ui/src/styles/compat.css)는 FeedbackOps `a8d768b8`에서 `@ap/ui`로 옮겼고([ADR-0046](../adr/0046-design-system-source-moves-to-platform-whole-package.md), #441) 값은 그대로다. 소비 순서·본문·레이어 없는 webfont 규칙은 [FO ADR-0058](../adr/history/feedbackops/0058-tailwind-v4-css-first-theme.md) §2(이전 시점의 설명)를 따른다. 기능 `src/ui`는 SDK의 토큰·primitive를 소비하며 도메인 배지·선택기·관계 표현을 소유한다. 공유 디자인 토큰의 별도 사본을 소유하지 않는다. 플랫폼이 별도 값 스케일을 만들지 않는다([ADR-0011](../adr/0011-design-direction-feedbackops-shell.md)).

플랫폼 전용 theme 키·차트/카테고리/아이콘 색·`t-*` 역할·반응형/detail-panel 확장과 label/control pairing의 설계 원본은 [DESIGN 플랫폼 확장](../../DESIGN.md#platform-extension-layer) 및 [허용 전경/표면](../../DESIGN.md#allowed-foregroundsurface-pairs)이다. `packages/sdk/ui/src/styles/`는 그 구현을 소유한다(플랫폼 확장 값은 `platform-tokens.css`). 제거된 어두운 navigation 확장은 다시 도입하지 않는다.

### Semantic Colors

Component에서 Tailwind primitive 색을 직접 의미로 사용하지 않는다. 의미 토큰 이름·값은 `packages/sdk/ui/src/styles/theme.css`와 [DESIGN](../../DESIGN.md#platform-extension-layer) 플랫폼 확장 층이 소유한다.

Shadow보다 Border를 기본으로 하고 Shadow는 Popover/Dropdown/Drawer/Modal 같은 floating surface에 제한한다.
