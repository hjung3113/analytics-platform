# @ap/components

Platform Component 층(06 §13) + 차트 계약(§16) + 페이지 archetype 골격(§12). 메뉴가 조립하는 부품이다.

## 파일

- `PlatformPage.tsx` — 페이지 최상위. 제목·액션·`contextExtension`·`dataTrustSummary`·breadcrumb 슬롯, Scope 게이트, 전역 Context Bar는 `slots.contextBar`로 받아 렌더(셸을 import하지 않음).
- `StateView.tsx` — §19 상태 분류(`QueryView`: 로딩/갱신/empty/forbidden/too_large/timeout/error).
- `PlatformDataTable.tsx`(`loadPage`의 `PageQuery`·`PageResult`·`sortAndPage`는 `@ap/contracts` 소유를 재export — 서버 mock도 같은 모양을 쓴다, 정렬·페이지는 `urlState`로 제어 가능, 페이지 키 코덱 `parsePageIndex`·`parseTableSort`·`encodeTableSort` — 키 이름·값 도메인은 페이지가 소유, #45; 열은 엔진 무관 타입 `PlatformColumn<T>`(#160)만 받고 TanStack `ColumnDef` 변환은 내부 모듈 `columnDef.ts`에서만 한다 — `index.ts`가 내보내지 않으며 테스트가 고정, 정렬 상태도 contracts의 `PageSort[]`, 표 엔진(`@tanstack/react-table`·`react-virtual`·`table-core`·`virtual-core`)은 여기 내부이며 메뉴 import는 lint 금지), `DetailDrawer.tsx`(+`Field`), `AuditTimeline.tsx`, `DataTrustIndicator.tsx`, `StatCard.tsx`, `RadioGroup.tsx`.
- `AnalysisChartFrame.tsx`(Zoom/Brush/Reset/Compare/Annotate/Export), `EChart.tsx`(ECharts adapter). Compare·Annotate·Export는 현재 메뉴 manifest `features`가 켠 것만 그리고, 주석은 `adapter.listAnnotations`·`saveAnnotation`(키 `chartId + scopeId`, `usePlatformQuery` 'session' 식별자에 Scope 포함)으로만 읽고 쓴다 — 모듈 전역 저장소를 두지 않는다(06 §16, #103).
- `styles.css` — Tailwind `@source`. `a11y.test.tsx` — 드로어·라디오 키보드·포커스 접근성 테스트.

## 규칙

**표 소유 내보내기(#173, 06 §15).** 내보내기는 `PlatformDataTable`이 소유한다 — 메뉴는 `exportRows(request, signal)`(`request.scope`가 선택이면 ids, 아니면 필터 전체를 서버에서 읽는 법, `request.sorting`은 표의 활성 정렬 — 내보내기 순서 = 화면 순서, UX P2-6), 안내 문구 `exportNote`, XLSX "조회 정보"용 읽을 수 있는 페이지 필터 `exportFilterSummary`([label, value] 쌍, 미설정 필터는 생략)만 주고, outcome 처리·선택 재조정·클라이언트 상한·CSV·XLSX 직렬화·파일·토스트는 표가 한다. 직렬화기(`exportColumns`·`exportCell`·`toCsv`·`toTsv`·`toXlsx`)는 내부 모듈 `src/tableExport.ts`이며 `index.ts`가 내보내지 않는다(`columnDef.ts`와 같은 취급). 화면이 보여 주는 값만 나간다 — 라벨·시간 포맷 열은 `PlatformColumn.exportValue`로 같은 텍스트를 주고, 숫자 열은 `number`를 지킨다. 직렬화 버그는 서버 실패와 구분한다(서버 요청 try 밖에서 계산, dev는 `console.error`가 열 id를 말한다). 게이트는 manifest `features.export` 그대로. 툴바는 확정안 D(#172) 고정 순서 [컬럼] [복사(#174)] [내보내기 ▾]: 메뉴는 선택이 없으면 "필터 결과 전체 N행" 한 묶음(ok 결과가 없으면 "필터 결과 전체" — 개수를 지어내지 않는다), 선택이 있으면 "선택 N행" + 구분선 + "필터 결과 전체 N행" 두 묶음(각 Excel (.xlsx) → CSV) — 대상은 고른 항목이 정한다(선택이 있어도 전체를 받을 수 있다). 항목 접근 이름에 대상 포함, 이 메뉴만 그림자 없음·초점 링(inset ring, `focus-visible:ring-focus-ring`; 공유 primitive는 그대로), 실행 중 트리거는 native `disabled`가 아니라 `aria-disabled`+`aria-busy`(포커스 가능 → Radix 메뉴 닫힌 뒤 포커스 복귀, 실행 중에는 키보드로 메뉴가 열려도 항목이 `disabled` — 두 번째 선택이 조용히 무시되지 않게, `runExport` 가드도 유지) + 스크린리더용 sr-only `role="status"` "…준비 중입니다" 안내(폭 유지; 내보내기가 가능하면 항상 마운트돼 있고 글자만 바뀐다 — 채워진 채 나타나는 영역은 읽히지 않으므로). 거절 토스트 문구도 표 소유: 원인마다 다음 행동을 함께 말하고(timeout "다시 시도", forbidden "현재 Scope와 접근 권한 확인" — 원인을 단정하지 않음, error는 응답 `message`가 있으면 그 문구, 없으면 "재시도 후 관리자 문의" + 응답 correlationId), 한/영 모두. 잠정 응답은 완료 토스트에 "잠정 데이터(데이터 기준 시각 …)"를 붙인다(`dataThrough` 기준, `updatedAt` 대체 금지; 미확인이면 미확인이라고). XLSX는 `write-excel-file/browser`를 클릭 때 동적 `import()`로만 불러 별도 청크에 둔다(메인 청크 금지; 청크 생성 중 취소도 파일 없음). 시트 이름과 표가 쓰는 라벨은 UI 언어를 따른다(ko "데이터"/"조회 정보", en "Data"/"Query info"; 전역 키 라벨은 `CONTEXT_LABELS.*[lang]`, 메뉴의 `exportFilterSummary`도 `lang` 라벨). 시트 "데이터"(CSV와 같은 직렬화, 숫자는 숫자 셀, 문자열은 수식 방지 접두사 없음, 32,767자 초과는 "…(잘림)"으로 자르되 서로게이트 쌍은 가르지 않음)와 "조회 정보"(메뉴·대상·내보낸 시각·Scope(메뉴가 `requiresScope`일 때만)·기간(manifest `context.time === 'apply'`일 때만)·`exportFilterSummary`·이 메뉴가 적용하는 전역 Context 키(읽을 수 있는 표기, 미적용·부재 키는 행 자체를 생략, 전역 id 집합은 "N개"/"N ids" — 내보낸 행이 아니므로 "행"을 쓰지 않는다)·응답 trust의 갱신 시각/데이터 기준 시각/커버리지("97.0%" 문자열)/지표 버전/잠정 여부/원천·correlationId — 없는 값은 비움, 시각은 화면처럼 공백 구분). 파일 이름 base는 `[A-Za-z0-9._-]`만 남긴다. 문구 단위는 "행"(선택 바 "N행 선택"), 이름은 "Excel". 테스트 전용 XLSX 판독기 `src/xlsxTestReader.ts`(fflate, devDependency).

- import 가능: `@ap/contracts`, `@ap/kernel`, `@ap/ui`와 표·차트 라이브러리. `@ap/shell`, 앱, mock, 메뉴 화면 import 금지.
- 컴포넌트는 도메인 의미(설비, 지표 이름)를 모른다. 컬럼·셀·탭 내용은 props로 주입받는다.
- 06 §19 상태, §18 Data Trust, 접근성(키보드·포커스 복귀·레이블) 의무를 컴포넌트가 소유한다. 페이지가 따로 구현하게 두지 않는다.
- 차트 클릭으로 전역 Context를 조용히 바꾸지 않는다. 명시적 콜백(`onPointClick`, "분석 구간 적용")만 제공한다.
- 새 컴포넌트는 실제 메뉴 2~3곳 반복이 확인된 뒤 올린다(06 §24). 스타일은 `@ap/ui` 토큰 유틸리티만.

## 검증

`pnpm --filter @ap/components test`로 먼저 좁혀 본 뒤 루트 네 명령(`pnpm lint && pnpm typecheck && pnpm test && pnpm build`, 루트 `AGENTS.md`). 소비 화면을 `pnpm dev`로 확인.
