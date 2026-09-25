# Unit B — AnalysisChartFrame Compliance Review

- 대상: `.agents/reports/kernel-work-order-analysis-chart-frame-draft.md`(work order), `prototypes/kernel-chart-frame/`(untracked)
- 기준 revision: HEAD `479699c14856be25f5209afb55712b34c6a48c66`
- 기준 문서: `AGENTS.md`, `docs/06_platform_ui_contract.md` §6/§6.1, §13, §16, §28–29, `docs/04_frontend_ui_ux.md` "차트/도식 자유도 요구사항", `DESIGN.md`(alpha)
- 역할: compliance-only review. 코드·work order·원본 계약 문서는 수정하지 않았다.
- 리뷰 날짜: 2026-09-25

## 전체 판정

**PASS (조건부) — BLOCKING 0건, MINOR 9건.**

Unit B 한정 Platform Done 수용 사례 1–7은 코드와 테스트에서 모두 확인했다. 6개 Frame 영역과 7개 Toolbar는 실제로 렌더되고 조작된다. 4층 상태는 서로 다른 소유자(App / App / ChartFixture / AnnotationRepository)로 구조적으로 나뉘어 있다. Brush 입력만으로는 Global Context가 바뀌지 않고 명시적 Apply 후에만 바뀐다. ECharts 6.1.0 SVG 렌더러는 실제로 쓰인다. 아래 MINOR 항목은 이 fixture를 공통 컴포넌트로 승격하거나 다음 Unit에서 재사용하기 전에 다룰 과제다. 조건부인 이유는 M1(Interaction Contract가 공통 Frame이 아니라 fixture host 안에 구현됨)과 M2(Empty 오분류) 때문이다.

## 1. 재실행 결과 (직접 실행)

```sh
cd prototypes/kernel-chart-frame && npm ci --cache .npm-cache --no-audit --no-fund && npm test && npm run build
```

실제 출력 발췌:

```text
added 114 packages in 1s
EXIT ci=0

 ✓ src/plot.test.ts (4 tests) 32ms
 ✓ src/App.test.tsx (11 tests) 494ms
 Test Files  2 passed (2)
      Tests  15 passed (15)
EXIT test=0

> tsc --noEmit && vite build
vite v7.3.6 building client environment for production...
✓ 619 modules transformed.
dist/assets/index-D-XrYhzv.js   716.15 kB │ gzip: 239.68 kB
(!) Some chunks are larger than 500 kB after minification.
✓ built in 1.12s
EXIT build=0
```

- 테스트 **15 passed / 0 failed**(파일 2/2). TypeScript와 Vite build 모두 성공했다. 번들 크기 경고(716.15 kB)는 work order에 적힌 값과 일치한다.
- `package-lock.json`의 `node_modules/echarts` 버전은 `6.1.0`이다. work order와 README의 값과 일치한다.
- `verification.log`에는 첫 TypeScript 오류(TS2769, TS2352)와 수정 뒤 성공 기록이 함께 남아 있다. work order의 설명과 일치한다.
- npm이 `esbuild`/`fsevents` install-scripts 경고를 냈다. build 결과에는 영향이 없다.

추가 probe(리뷰어가 scratchpad에서 `vite-node`로 실행했고 저장소 파일은 바꾸지 않았다):

| Probe | 결과 |
|---|---|
| 주석 text `<img src=x onerror=alert(1)>`를 실제 ECharts SVG로 렌더 | 원시 `<img` 없음, `&lt;img`로 escape됨. `dangerouslySetInnerHTML` 경로는 현재 안전함 |
| `visibleA=false`, compare off, brush [4,12], 주석 1개 | series 0개 → SVG에 Brush·주석 markArea가 모두 사라짐(M4) |
| compare on, 주석 1개 | 주석 label이 SVG에 2번 나타남(series마다 markArea 중복, M4) |
| threshold 50, brush [0,1] | Brush 안 A 0점, 전체 A 4점 → UI가 "Empty: 조건에 맞는 표시 데이터 없음"을 표시함(M2) |

## 2. Work order 인용·revision 정확성

| 항목 | 판정 | 근거 |
|---|---|---|
| 원본 revision `479699c…` = 작업 시작 HEAD | PASS | 현재 HEAD와 같다. 두 원본 문서 모두 그 뒤 변경이 없다(마지막 변경 `a698dcb`) |
| docs/06 상태 "Draft" | PASS | docs/06 머리말 `Status: Draft` |
| §6 상태 계층, §6.1 "Brush 후 명시적 적용만 전역" | PASS | §6 "상태 계층" 4항목, §6.1 "단순 차트 줌은 로컬 상태다. Brush 후 명시적인 분석 구간 적용만 전역 Context/URL로 전달한다." |
| §13 Platform Component | PASS | §13 목록에 `AnalysisChartFrame`이 있다 |
| §16 Frame/Toolbar/4층 | PASS | Toolbar 7개, Frame 6영역, 상태 분리 4개를 정확히 옮겼다 |
| §28–29 | PASS | Governance Interaction 항목과 Platform Done 두 층을 인용했다. 수용 사례를 "Unit B 한정 Platform Done"으로 한정했다 |
| docs/04 "ECharts primary candidate, 주석 편집기 직접 연결 필요, 대용량 우위 미검증 가설" | PASS | docs/04 L87(graphic 레이어는 완성된 편집기가 아님), L88/L92(우위는 POC로 검증할 가설), docs/06 §16 "Primary candidate". 6.1.0도 docs/04 L94와 일치 |
| `DESIGN.md` alpha 소비, 수정하지 않음 | PASS(표현 일부 부정확 → M8) | `version: alpha`. DESIGN.md는 수정되지 않았다. 다만 series 색상은 chart-* 토큰이 아니다 |

## 3. 항목별 검증

### 3.1 Frame 6영역(§16) — PASS

`AnalysisChartFrame.tsx`가 다음 영역을 차례로 렌더한다.

1. `header` 안의 `h2` 제목과 `role="toolbar"` Actions
2. `<p>{description} / Metric Version: {version}</p>`
3. `aria-label="Legend"`
4. `aria-label="Plot"`
5. `section aria-label="Selection Summary"`
6. `<footer>Source · Updated · Coverage</footer>`

테스트 `renders frame regions and seven toolbar actions`가 Legend/Plot/Selection Summary 영역과 Metric Version, Source…Coverage 문자열을 확인한다. MINOR M3 참고: Selection Summary 슬롯 안에 Pan 버튼, Brush 편집기, Apply 버튼 같은 컨트롤이 함께 들어 있다.

### 3.2 Toolbar 7개 — PASS

toolbar 버튼 순서가 `['Zoom','Brush','Reset','Compare','Annotate','Export','More']`임을 테스트가 단언한다. 모든 버튼은 native `<button>`이고 실제 핸들러가 연결돼 있다.

- Zoom: 중앙 절반으로 확대(`zoom()`). 확대만 되고 축소는 Reset으로만 가능하다(M6).
- Brush: 숫자 편집기를 토글하고 로컬 brush를 설정한다.
- Reset: `initialChart()`, `brushing=false`, draft 기본값으로 되돌린다.
- Compare: `aria-pressed` 토글로 B overlay를 켜고 끈다.
- Annotate: 주석 폼을 연다.
- Export: 안내 stub이며 Open 결정 #3에 맞다.
- More: 렌더러 상세를 펼치고 접는다.

Export와 More의 동작은 테스트가 확인한다.

### 3.3 4층 상태 분리 — PASS

| 층 | 실제 소유 위치 | 확인 |
|---|---|---|
| Global Context | `App`의 `useState<GlobalContext>` | 변경 경로는 `ChartFixture`의 `onApply` 콜백 하나다. `validRange`를 다시 검증한 뒤 `indexRange`만 교체한다 |
| Page Filter | `App`의 별도 `useState<PageFilter>` | `ChartFixture`에는 prop으로 읽기 전용으로 전달된다. Reset 경로에서는 접근하지 않는다 |
| Chart Local State | `ChartFixture`의 `useState(initialChart)` 및 brushing/draft | `App`은 이 상태를 볼 수 없다. remount하면 초기값으로 돌아간다 |
| Persistent Annotation | `AnnotationRepository` 인스턴스(모듈 싱글턴 또는 주입) | 방어적 복사로 snapshot을 반환한다. chart state와 분리돼 있다 |

- **Reset은 Chart Local State만 초기화한다 — PASS.** Reset 핸들러는 `setLocal`/`setBrushing`/`setDraft`만 호출한다. `global`과 `filter`는 상위 컴포넌트 소유라 접근 경로가 없고, repository는 호출하지 않는다. 테스트 3개가 Reset 뒤에도 Global `3–12`/`4–12`, threshold `100`/`30`, 주석이 보존됨을 확인한다.
- **Page Filter가 URL/Global로 새지 않는다 — PASS.** `src/` 전체에 `history`/`location`/`URLSearchParams`/`localStorage`/`pushState` 사용이 없다(grep 결과 테스트 단언에만 나온다). filter setter는 `setFilter` 하나뿐이다. 다만 URL 불변 단언은 URL codec이 아예 없는 상태에서 참이 되는 것이다(M5).
- **Brush 변경만으로는 Global이 바뀌지 않고 명시적 Apply 후에만 바뀐다 — PASS(§6.1).** `changeDraft`는 `setLocal(brush)`만 호출한다. `setGlobal`은 `적용` 버튼의 `onApply`에서만 실행된다. 이 버튼은 `!validDraft || !local.brush`이면 비활성이다. 테스트 `brush changes global only after explicit Apply…`는 입력 → Global 불변 → Apply → Global `3–12` → 끝값 변경 → Global 여전히 `3–12` 순서로 확인한다. `rejects reversed, empty and out-of-domain Brush…`는 15, 공백, -1, 21 입력에서 Apply 비활성, alert 표시, Global 불변을 확인한다.
- §6.1 뒷부분의 "초 정렬 `[from,to)` 미리보기와 확인" 규칙은 비시간 합성 index라서 적용되지 않는다. work order와 README가 명시적으로 범위에서 제외했다(M7 참고).

### 3.4 Annotation 별도 repository와 Reset/remount 생존 — PASS

`AnnotationRepository`는 chart state와 무관한 클래스다. `list()`는 방어적 복사본을 반환하고(plot.test가 외부 변형으로부터 격리됨을 확인), `add()`는 유효하지 않은 구간과 빈 text를 거부한다. 테스트 `annotation repository survives Reset and remount…`의 흐름은 다음과 같다: 저장 → threshold 30 → Zoom → Reset → 목록 유지, Global 유지, threshold 유지 → `unmount` 후 같은 repository로 다시 render → 주석이 복원되고 viewport는 `0–20`으로 돌아온다. 저장은 데이터 좌표(range)로 한다. docs/04 L107의 "픽셀이 아니라 데이터 좌표" 원칙에 맞다. 영속·권한·Audit은 Open #2로 남겨 두었다.

### 3.5 ECharts SVG 렌더러가 실제인지 — PASS

`plot.ts`는 `echarts/core`와 `LineChart`, `GridComponent`, `MarkAreaComponent`, `SVGRenderer`를 `use`한다. 그 뒤 `echarts.init(null, undefined, { renderer: 'svg', ssr: true })`와 `renderToSVGString()`을 호출한다. 직접 SVG 도형을 그리는 코드는 없다. `plot.test.ts`(node 환경, mock 없음)가 실제 출력에 다음이 들어 있는지 단언한다: `<svg`, `<path`, 주석 text `Saved note`, `Brush`, dashed line의 `stroke-dasharray`. 또 zoom, Compare, visibility 상태마다 SVG 문자열이 서로 달라짐을 확인한다. 한계도 있다. App UI 테스트 11개는 `renderPlot`을 `<svg aria-hidden>`로 mock한다. 그래서 브라우저 DOM에 실제 SVG가 주입되는 경로는 build와 타입 검사로만 보장된다. 이 방식은 정적 SSR 문자열이라 ECharts의 native dataZoom/brush/graphic 상호작용은 검증하지 않았다(work order에 명시됨).

### 3.6 Compare / Legend / Summary — PASS

B는 dashed line과 diamond symbol로 그려져 색에만 의존하지 않고 구분된다. Legend 라벨은 `Synthetic B ┄ dashed`이고, summary는 series별 개수를 보여 준다. 테스트와 plot.test가 이를 확인한다.

### 3.7 Data Trust / Empty / Invalid(Platform Done #7) — PASS(M2 결함 있음)

footer의 Source/Updated/Coverage와 invalid Brush alert는 정상 동작한다. Empty 판정 로직에는 오분류가 있다(M2).

### 3.8 "사용자 확인 필요" 표 — PASS(임의 결정 없음)

표의 3개 항목은 모두 Candidate 또는 Open 상태를 유지한다. 1) 제품 ECharts 채택은 Candidate다. 2) Annotation 영속·권한·Audit·편집 모델은 Open이다. 3) Export 포맷은 Open이다. docs/06 §16과 docs/04 L92가 ECharts를 "primary candidate"로 두는 것과 맞고, 채택을 확정하지 않았다. 양끝 포함 합성 구간, `brush ?? viewport` 주석 좌표, `indexRange` 같은 fixture 내부 선택은 "공개 Context 키 제안이 아님"과 "§6.3 시간 계약을 구현하지 않음"으로 명시돼 있다. 따라서 플랫폼 결정으로 승격되지 않았다. 원본 계약 문서와 Unit A는 변경되지 않았다(`git status`: untracked 2경로뿐).

## 4. BLOCKING

없음.

## 5. MINOR

| # | 위치 | 내용 | 권고 |
|---|---|---|---|
| M1 | `AnalysisChartFrame.tsx`, `App.tsx` `ChartFixture` | 공통 Frame은 레이아웃 슬롯(`actions: ReactNode`)만 제공한다. 7개 Toolbar vocabulary, Reset 의미론(로컬만 초기화), Brush→Apply 콜백 경계 같은 §16의 **Interaction Contract**는 fixture host에만 있다. 두 번째 consumer가 Frame을 쓰면 이 계약을 다시 구현해야 하고, 어겨도 막을 장치가 없다 | 승격 전에 Toolbar 구성, local-state reducer, `onApplyRange` 경계 중 무엇을 Platform Component가 소유할지 정한다. 반복이 2개 이상 확인된 뒤 추출한다(§14/§24) |
| M2 | `App.tsx` Empty 판정 `activeNames.every(count===0)` | (a) `count`가 Brush 범위로 제한돼 있다. 그래서 threshold 50, brush [0,1]이면 plot에는 A 4점이 보이는데도 "Empty: 조건에 맞는 표시 데이터 없음"이 뜬다. (b) 사용자가 모든 series를 숨기면 빈 배열의 `every`가 true가 되어 Empty가 뜬다. "사용자가 숨김"과 "데이터 없음"이 섞이므로 §19 taxonomy와 §28 Data Trust "Empty/Error 구분"에 어긋난다 | Empty는 Page Filter와 viewport 기준으로 판정하고, 숨김이나 Brush 선택 0건은 별도 상태로 표시한다 |
| M3 | Selection Summary 슬롯 | Pan left/right, Brush 숫자 편집기, Apply 버튼이 Summary 영역 안에 있다. §16 Frame에서 Summary는 선택 결과를 보여 주는 영역이다. Pan은 Toolbar vocabulary 밖의 컨트롤인데 위치가 정해지지 않았다 | Brush 편집기와 Apply를 둘 슬롯(Actions의 popover나 별도 slot)과 Pan의 vocabulary 위치(Zoom의 하위인지 More인지)를 정한다 |
| M4 | `plot.ts` markArea를 series마다 부착 | 보이는 series가 없으면 Brush와 주석 영역이 SVG에서 사라진다(probe). Compare on에서는 주석 label이 2번 렌더된다(probe). 주석을 볼 수 있는지가 series visibility(Chart Local)에 묶여 층 분리가 시각적으로 흐려진다 | 주석과 Brush 오버레이를 series와 독립된 레이어(`graphic` 또는 전용 보이지 않는 series)로 둔다 |
| M5 | 테스트의 `window.location.href` 불변 단언 | URL codec이 전혀 없으니 이 단언은 조건 없이 참이다. 따라서 "Apply만 URL로 간다"는 §6.1 후반부는 검증되지 않았다. Global 쪽만 검증됐다 | Unit A codec과 연결할 때 Apply→URL, 비-Apply 비전파를 양방향으로 테스트한다(work order가 이미 범위 밖이라고 명시함) |
| M6 | Zoom | 확대만 가능하고 축소나 단계별 복귀는 Reset뿐이다. Reset은 Brush와 visibility까지 함께 지운다 | Zoom out 또는 viewport 전용 복귀를 vocabulary 안에서 정의한다 |
| M7 | Brush 편집기 `step="any"` | 0.2–0.8처럼 데이터 좌표가 하나도 없는 소수 구간도 그대로 Global에 적용된다. 합성 index라 §6.1의 초 정렬 규칙은 적용 대상이 아니지만, 실제 시간축으로 옮기면 외향 정렬 미리보기와 확인 단계가 필요하다 | 시간축 Unit에서 §6.1 "줌 vs 명시적 구간 적용" 확인 플로우를 Apply 경계에 넣는다 |
| M8 | `style.css`, `plot.ts` 색상 | 값은 DESIGN.md 토큰과 같지만 CSS 변수나 토큰 참조 없이 hex를 하드코딩했다. series 색이 `primary`(#2563eb, "scarce" accent)와 `accent-purple`이고 `chart-blue`/`chart-purple` 같은 chart-* series 토큰을 쓰지 않았다. work order의 "기존 DESIGN token을 사용"이라는 서술이 일부 부정확하다 | chart series는 chart-* 토큰을 쓰고 토큰을 참조한다 |
| M9 | Brush 토글 off | 편집기를 닫아도 `local.brush`가 남는다. Summary와 plot에는 Brush가 계속 보이지만 Apply에는 접근할 수 없다 | 토글 off 시 draft를 유지할지 폐기할지 정한다 |

## 6. 검증하지 않은 것(리뷰어도 미실행)

- 브라우저 E2E와 수동 시각 검수(`npm run dev`로 확인하지 않음). 실제 DOM의 SVG 주입, 반응형, 키보드 흐름 전체
- ECharts native pointer 상호작용(dataZoom/brush 이벤트, graphic 드래그), 대용량 성능, 번들 크기 최적화
- 실제 URL codec, Scope 권한, back/forward, 다른 메뉴와의 Context 연결(§29 "다른 메뉴와 Context가 연결됨"). work order도 Unit B 범위 밖으로 명시했다
