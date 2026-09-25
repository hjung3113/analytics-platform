# Unit B — AnalysisChartFrame

**합성 fixture, 실제 메뉴 아님.** 플랫폼 공통 컴포넌트/Chart Interaction Contract의 독립 실험이다. 숫자 index 0–20과 합성 A/B 값만 사용한다. **이 Unit은 §6.3 시간 계약을 구현하지 않는다.** 실제 업무 지표·메뉴·권한·URL 연동을 구현하거나 검증한 것이 아니다.

원본 및 수용 사례: [work order](../../.agents/reports/kernel-work-order-analysis-chart-frame-draft.md). 원본 revision `479699c14856be25f5209afb55712b34c6a48c66`, docs/06 §6/13/16/28–29 및 docs/04 차트/도식 자유도 요구사항을 따른다.

## 실행

```sh
cd prototypes/kernel-chart-frame
npm ci --cache .npm-cache --no-audit --no-fund
npm run dev
npm run typecheck
npm test
npm run build
```

잠금 파일로 의존성 버전을 고정했다. 검증 출력은 `verification.log`에 있다.

## 구조와 상태 경계

| 층 | 소유자 | 동작 / 수명 |
|---|---|---|
| Global Context | `App` host | readonly 표시; 유효한 Brush의 명시적 적용 callback에서만 변경 |
| Page Filter | `App`의 별도 `PageFilter` | threshold가 데이터만 필터링; Zoom/Reset/Global과 독립 |
| Chart Local State | `ChartFixture`의 `ChartLocalState` | viewport/Brush/visibility/Compare; Reset으로 초기화, remount도 초기값, URL에 저장 안 함 |
| Persistent Annotation | 별도 `AnnotationRepository` | 데이터 좌표/내용 저장; Reset 및 component remount 후 복원; 전체 reload에는 소멸 |

Unit A Python codec/registry를 직접 연결하지 않았다. 비시간 숫자 index는 Unit A 공개 시간 Context에 유효한 값이 아니므로 synthetic host context와 명시적 callback 경계를 사용한다. `indexRange`는 실험 내부 값이지 새로운 공개 URL 키 제안이 아니다. 합성 구간은 양끝 포함이며 wall-clock/초 정렬/half-open 계약 검증을 주장하지 않는다.

`AnalysisChartFrame.tsx`는 §16의 Title/Actions → Description/Metric Version → Legend → Plot → Selection Summary → Source/Updated/Coverage 슬롯만 책임진다. `App.tsx`가 fixture 행동을 제공하고 `plot.ts`는 ECharts 렌더링 adapter다. metadata의 version/updated는 fixture revision이며 실제 지표 버전이나 계산 시각이 아니다.

## 조작

- Zoom은 현재 viewport를 중앙 절반으로 축소한다. Pan left/right는 경계 내에서 두 index씩 이동한다.
- Brush를 누르고 시작/끝을 입력하면 로컬 선택 영역과 요약만 바뀐다. **적용**을 눌러야 synthetic Global Context 표시가 바뀐다. 빈 값/역전/범위 초과는 거부한다. Brush를 닫으면 draft를 버리고 Apply도 숨긴다. 다시 열면 기본값 4–12로 시작하며 이미 적용된 Global은 보존한다.
- Reset은 Chart Local State와 Brush 편집값만 초기화한다. Global Context, threshold, 저장 주석은 보존한다.
- Compare는 Synthetic B를 dashed line/diamond로 overlay한다. Legend checkbox로 시리즈를 숨길 수 있고 summary는 보이는 시리즈별 선택 데이터 개수를 표시한다.
- Annotate는 현재 Brush 또는 viewport 좌표에 텍스트 주석을 저장한다. 주석과 Brush는 series visibility와 독립된 전용 markArea 레이어에 한 번만 표시한다. 주석은 별도 목록에도 표시한다. 운영 영속 모델·권한·Audit은 구현하지 않는다.
- Export는 클릭 가능한 안내 stub이다. More는 렌더러/로컬 상태 설명을 펼친다.
- 키보드 숫자 입력, native buttons/checkboxes, 선 형태, 선택 요약, 동일 fixture 원자료 표를 제공한다. 실제 메뉴용 공통 DataTable은 만들지 않는다.

## ECharts 선택과 검증 한계

Apache ECharts를 실제 채택했다(정확한 버전은 package-lock.json). ECharts의 SVG SSR API를 브라우저에서도 호출하여 SVG를 생성한다. Canvas/node-canvas 설치 없이 실제 ECharts renderer가 선·시리즈·주석 영역을 그린다. 직접 SVG 도형을 그리는 대체 구현은 사용하지 않았다.

이번 실험의 입력은 외부 React controls가 담당하며 Zoom/Pan/Brush 변경 때 ECharts option을 다시 렌더한다. ECharts native drag/dataZoom/brush event adapter, pointer drawing, freehand annotation editor는 검증하지 않는다. responsive SVG viewBox로 축소하지만 대용량/다중차트 동기화 성능을 검증하지 않는다. docs/04의 primary candidate 추천을 제품 채택 결정으로 승격하지 않는다.

테스트는 UI 행동 16개와 실제 ECharts SVG/모델/토큰 7개, 총 23개(기존 15 + 신규 8)다. jsdom UI 테스트는 SVG 생성 함수만 대역으로 교체하며, 별도 Node 테스트에서 실제 ECharts SVG 생성과 두 시리즈/주석/스타일을 검증한다. 전체 브라우저 E2E 및 수동 시각 검수는 수행하지 않았다. 테스트 remount는 전체 새로고침의 서버 영속성을 증명하지 않는다.

사용자 확인 필요는 6개: 제품 ECharts 채택, Annotation 영구 저장 모델, Export 실제 포맷, Interaction Contract 승격(Deferred), Summary/Toolbar 위치(Open), Zoom-out/viewport 복귀 vocabulary(Open). 상세는 work order 표에 있다.

최종 실행 결과: ECharts **6.1.0**, Vitest **23/23 통과**, TypeScript/Vite build 성공. 빌드 JS 717.09 kB로 Vite의 500 kB 경고가 발생했다. 최적화/제품 번들 규모 검증은 이번 실험에 포함하지 않는다. `verification.log`는 첫 타입 검사 오류 및 수정 후 최종 성공 이력을 함께 보존한다.

색상은 DESIGN.md alpha의 기존 토큰을 로컬 design-tokens.ts에서 공유한다. style.css는 main.tsx가 설치한 CSS 변수를 참조하고, ECharts SSR은 동일한 chart-blue/chart-purple/chart-grid 값을 직접 소비한다.

Empty는 Page Filter와 viewport를 적용한 데이터 결과에만 사용한다. 전체 series 숨김과 Brush 범위의 선택 0건은 별도 메시지다. 회귀 초기 실패 요약은 regression-red.log에 기록했다.
