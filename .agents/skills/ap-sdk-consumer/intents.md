# Intent table

Hand-written. Public names are checked against `tooling/sdk/api/*.api.txt` on every PR. It covers common needs, not the whole SDK.

| Need | Public pieces | Contract | Note |
| --- | --- | --- | --- |
| 표, 목록, 그리드, 표 검색, table, grid | `@ap/components#PlatformDataTable`, `@ap/components#TableQuickSearch`, `@ap/components#useTableUrlState` | [§15](../../../docs/contract/components.md#15-platform-data-table-contract) | Sort, paging, selection and states are the platform's. The menu declares columns |
| 차트, 시계열, 비교 차트, 차트 틀, chart | `@ap/components#AnalysisChart`, `@ap/components#AnalysisChartFrame` | [§16](../../../docs/contract/chart.md#16-analysis-chart-contract) | Do not draw a chart directly with the engine |
| 범례 트리, 계층 표시 선택, legend tree | `@ap/components#LegendTree` | [§16](../../../docs/contract/chart.md#16-analysis-chart-contract) | |
| KPI, 지표 카드, stat | `@ap/components#StatCard` | [§13](../../../docs/contract/components.md#13-shared-component-layers) | One metric per tile |
| 페이지 틀, 페이지 머리 | `@ap/components#PlatformPage` | [§8](../../../docs/contract/layout.md#8-shell-slots) | |
| 분석 화면 배치 | `@ap/components#AnalysisLayout` | [§12.2](../../../docs/contract/layout.md#122-analysis-workspace) | |
| 관리 화면 배치 | `@ap/components#ManagementLayout` | [§12.3](../../../docs/contract/layout.md#123-management) | |
| 패널 여러 개, 분할, 도킹, 패널 재배치, split | `@ap/components#PanelWorkspace` | [§12.8](../../../docs/contract/layout.md#128-panelworkspace-decided-adr-0067-결정-391822) | For dense analysis menus with several panels |
| 드릴다운, 단계별로 내려가기 | `@ap/components#DrillLayout`, `@ap/kernel#useDrill` | [§12.7](../../../docs/contract/layout.md#127-드릴다운-레이아웃-decided-adr-0025) | The menu declares the steps |
| 페이지 필터, 조건 입력, 적용된 필터, filter | `@ap/components#PageFilterBar`, `@ap/ui#ActiveFilterBar` | [Platform Component](../../../docs/contract/components.md#platform-component) | The page owns draft values and apply |
| 상세 패널, 서랍, drawer | `@ap/components#DetailDrawer` | [DetailDrawer](../../../docs/contract/components.md#detaildrawer--docked-shell-slot-decided-adr-0013) | URL-controlled, rendered in the shell slot |
| 변경 이력, 감사, audit | `@ap/components#AuditTimeline`, `@ap/kernel#useEntityAudit` | [§13](../../../docs/contract/components.md#13-shared-component-layers) | |
| 데이터 신뢰, 최신성, 출처 | `@ap/components#DataTrustIndicator` | [§18](../../../docs/contract/components.md#18-data-trust-contract) | |
| 로딩, 빈 상태, 오류 | `@ap/components#QueryView`, `@ap/ui#EmptyState` | [§19](../../../docs/contract/components.md#19-loading--empty--error-taxonomy) | `QueryView` wraps a query result |
| 서버 조회, fetch, 엔드포인트 선언 | `@ap/kernel#useMenuQuery`, `@ap/contracts#defineEndpoint` | [§5](../../../docs/contract/kernel.md#5-menu-extension-contract) | Declare permission, Context and params in `src/endpoints.ts` |
| 서버 쓰기, 저장 동작 | `@ap/kernel#useMenuAction`, `@ap/contracts#defineAction` | [§5](../../../docs/contract/kernel.md#5-menu-extension-contract) | |
| 전역 Context 읽기, 기간·사업장, 패널 입력 | `@ap/kernel#useQueryContext`, `@ap/contracts#projectContext` | [§6](../../../docs/contract/kernel.md#6-context-capability-contract) | No panel Context API exists |
| 세션, 권한에 따른 표시 | `@ap/kernel#usePlatform` | [§17](../../../docs/contract/kernel.md#17-permission-aware-ux-contract) | Display only. The server decides |
| 다른 메뉴로 이동, 링크 | `@ap/kernel#PlatformLink` | [§22](../../../docs/contract/cross-menu-links.md#22-cross-menu-context-link) | Never build a URL by hand |
| 저장된 뷰 | `@ap/components#ViewSelector`, `@ap/kernel#useSavedViewSupport` | [§21](../../../docs/contract/kernel.md#21-saved-view-contract) | |
| 상태 배지 | `@ap/ui#StatusBadge` | [DESIGN.md](../../../DESIGN.md) | Do not invent per-screen colors |
| 버튼, 입력, 선택, 대화상자, 탭 | `@ap/ui#Button`, `@ap/ui#Input`, `@ap/ui#Select`, `@ap/ui#Dialog`, `@ap/ui#Tabs` | [UI Primitive](../../../docs/contract/components.md#ui-primitive) | |
