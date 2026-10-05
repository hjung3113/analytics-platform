# @ap/components

Platform Component 층(06 §13) + 차트 계약(§16) + 페이지 archetype 골격(§12). 메뉴가 조립하는 부품이다.

## 파일

- `PlatformPage.tsx` — 페이지 최상위. 제목·액션·`contextExtension`·`dataTrustSummary`·breadcrumb 슬롯, Scope 게이트, 전역 Context Bar는 `slots.contextBar`로 받아 렌더(셸을 import하지 않음). 본문 영역은 `data-platform-page-content` 속성으로 식별한다(헤더·전역 Context·페이지 extension 제외, Scope 게이트도 이 영역에 렌더). 계약 검사는 스타일 클래스 대신 이 안정된 hook을 사용한다.
- `ManagementLayout.tsx` — 관리 화면의 filter/table/drawer 슬롯. 자기 폭에 따른 접을 수 있는 sticky 필터 레일과 좁은 폭 팝오버, 공통 접힘 기억·포커스 이동을 소유한다(06 §12.6, ADR-0022).
- `PageFilterBar.tsx` — consumer가 정의한 검색·텍스트·Select·custom 필드와 actions를 표시한다. field value·URL key·변경·reset/apply 의미는 consumer가 소유하며, 현재 알 수 없는 Select 값은 표시 옵션으로 유지한다(#54, 06 §13·§15).
- `StateView.tsx` — §19 상태 분류(`QueryView`), `OutcomeScope.tsx`는 PlatformPage 본문별 위젯 응답 배너(#55, ADR-0017). 세부는 `OutcomeScope.test.tsx`.
- `PlatformDataTable.tsx` — 서버 페이징 표. `loadPage`는 `@ap/contracts`의 `PageQuery`·`PageResult` 모양을 쓰고, 열은 엔진 무관 `PlatformColumn<T>`(TanStack `ColumnDef` 변환은 비공개 `columnDef.ts`)만 받으며 정렬은 `PageSort[]`다. 정렬·페이지는 `urlState`로 제어하고 코덱 `parsePageIndex`·`parseTableSort`·`encodeTableSort`를 쓴다(키 이름·값 도메인은 페이지 소유). 표 엔진(`@tanstack/*`)은 여기 내부이고 메뉴 import는 lint가 막는다. 요청 취소 판정은 표 자신의 `controller.signal.aborted` 하나다(타임아웃 `AbortError`는 오류로 보인다). 그 밖에 `DetailDrawer.tsx`(+`Field`), `AuditTimeline.tsx`, `DataTrustIndicator.tsx`, `StatCard.tsx`, `RadioGroup.tsx`.
- `AnalysisChartFrame.tsx`(Zoom/Brush/Reset/Compare/Annotate/Export), `EChart.tsx`(ECharts adapter). Compare·Annotate·Export는 현재 메뉴 manifest `features`가 켠 것만 그리고, 주석은 `adapter.listAnnotations`·`saveAnnotation`(키 `chartId + scopeId`, `usePlatformQuery` 'session' 식별자에 Scope 포함)으로만 읽고 쓴다 — 모듈 전역 저장소를 두지 않는다(06 §16, #103). Compare 범례는 두 기간을 이름으로 연결한 그룹으로 표시하고 plot과 SVG swatch가 같은 선 패턴을 쓴다(ADR-0014).
- `styles.css` — Tailwind `@source`. `a11y.test.tsx` — 드로어·라디오 키보드·포커스 접근성 테스트. `xlsxTestReader.ts` — 테스트 전용 XLSX 판독기(fflate, devDependency).

## 규칙

**표 소유 내보내기·복사(#173·#174, [ADR-0008](../../docs/adr/0008-table-owned-export-fixed-toolbar.md), 06 §15).** 메뉴는 `exportRows(request, signal)`(선택 ids 또는 필터 전체 + 표의 활성 `sorting`)·`exportNote`·`exportFilterSummary`·`exportContext`만 주고, outcome 처리·CSV/XLSX 직렬화·파일·토스트·[복사]는 `PlatformDataTable`이 소유한다. 직렬화기는 내부 모듈 `src/tableExport.ts`(`index.ts` 비공개). 화면에 보이는 값만 나가며 라벨·시간 열은 `PlatformColumn.exportValue`로 같은 텍스트를 준다. 게이트는 manifest `features.export`. XLSX(`write-excel-file/browser`)는 클릭 때 동적 `import()`로만 불러 별도 청크에 둔다. 툴바 순서·거절 문구·시트 구성·클립보드 경로의 세부는 `PlatformDataTable.test.tsx`·`PlatformDataTable.copy.test.tsx`·`tableExport.test.ts`가 고정하고, 테스트가 고정하지 않는 접근성·클립보드 규칙은 06 §15 "표 내보내기·복사 구현 계약"에 있다 — 바꾸면 테스트·06 §15·ADR-0008부터 고친다.

- import 가능: `@ap/contracts`, `@ap/kernel`, `@ap/ui`와 표·차트 라이브러리. `@ap/shell`, 앱, mock, 메뉴 화면 import 금지.
- 컴포넌트는 도메인 의미(설비, 지표 이름)를 모른다. 컬럼·셀·탭 내용은 props로 주입받는다.
- 06 §19 상태, §18 Data Trust, 접근성(키보드·포커스 복귀·레이블) 의무를 컴포넌트가 소유한다. 페이지가 따로 구현하게 두지 않는다.
- 차트 클릭으로 전역 Context를 조용히 바꾸지 않는다. 명시적 콜백(`onPointClick`, "분석 구간 적용")만 제공한다.
- 새 컴포넌트는 실제 메뉴 2~3곳 반복이 확인된 뒤 올린다(06 §24). 스타일은 `@ap/ui` 토큰 유틸리티만.
- `DetailDrawer`는 셸 상세 슬롯에 portal로 내용을 넘긴다(ADR-0013, 06 §13). AppShell 또는 같은 `DetailPanelSlotProvider` 아래에서만 쓴다.

## 검증

`pnpm --filter @ap/components test`로 좁혀 본 뒤 루트 검사(루트 `AGENTS.md`). 소비 화면을 `pnpm dev`로 확인.
