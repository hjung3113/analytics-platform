# @ap/components

Platform Component 층(06 §13) + 차트 계약(§16) + 페이지 archetype 골격(§12). 메뉴가 조립하는 부품이다.

## 파일

- `PlatformPage.tsx` — 페이지 최상위. 제목·액션·`contextExtension`·`dataTrustSummary`·breadcrumb 슬롯, Scope 게이트, 전역 Context Bar는 `slots.contextBar`로 받아 렌더(셸을 import하지 않음).
- `StateView.tsx` — §19 상태 분류(`QueryView`: 로딩/갱신/empty/forbidden/too_large/timeout/error).
- `PlatformDataTable.tsx`, `DetailDrawer.tsx`(+`Field`), `AuditTimeline.tsx`, `DataTrustIndicator.tsx`, `StatCard.tsx`, `RadioGroup.tsx`.
- `AnalysisChartFrame.tsx`(Zoom/Brush/Reset/Compare/Annotate/Export), `EChart.tsx`(ECharts adapter).
- `styles.css` — Tailwind `@source`. `a11y.test.tsx` — 드로어·라디오 키보드·포커스 접근성 테스트.

## 규칙

- import 가능: `@ap/contracts`, `@ap/kernel`, `@ap/ui`와 표·차트 라이브러리. `@ap/shell`, 앱, mock, 메뉴 화면 import 금지.
- 컴포넌트는 도메인 의미(설비, 지표 이름)를 모른다. 컬럼·셀·탭 내용은 props로 주입받는다.
- 06 §19 상태, §18 Data Trust, 접근성(키보드·포커스 복귀·레이블) 의무를 컴포넌트가 소유한다. 페이지가 따로 구현하게 두지 않는다.
- 차트 클릭으로 전역 Context를 조용히 바꾸지 않는다. 명시적 콜백(`onPointClick`, "분석 구간 적용")만 제공한다.
- 새 컴포넌트는 실제 메뉴 2~3곳 반복이 확인된 뒤 올린다(06 §24). 스타일은 `@ap/ui` 토큰 유틸리티만.

## 검증

`pnpm --filter @ap/components test`, 루트 `pnpm typecheck && pnpm build`, 소비 화면을 `pnpm dev`로 확인.
