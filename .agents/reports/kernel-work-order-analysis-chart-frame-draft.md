# Unit B — AnalysisChartFrame work order (Draft)

## 목표와 원본
합성 fixture, 실제 메뉴 아님. 플랫폼 다섯 갈래 중 공통 컴포넌트 및 차트 Interaction Contract만 검증한다. 승인된 이번 요청이 프로토타입 구현 범위의 근거다.

원본 revision: `479699c14856be25f5209afb55712b34c6a48c66` (작업 시작 HEAD).
- `docs/06_platform_ui_contract.md` (Draft): §6/§6.1 명시적 Brush 적용과 상태 계층, §13 Platform Component, §16 전문의 Frame/Toolbar/4층 상태, §28–29 Governance/Platform Done.
- `docs/04_frontend_ui_ux.md` 차트/도식 자유도 요구사항: ECharts primary candidate; 주석 편집기 직접 연결 필요, 대용량 우위는 미검증 가설.
- `DESIGN.md` alpha: 기존 표면·색·타이포 기준을 소비하며 수정하지 않는다.

## 포함 / 제외
포함: React/TS/Vite, AnalysisChartFrame, 7개 Toolbar, 비시간 숫자 인덱스 0–20의 합성 A/B 시리즈, threshold page filter, Zoom/Pan/visibility, Brush 후 적용, Compare overlay, 별도 in-memory annotation repository, 자동 테스트와 실행 로그.
제외: 실제 메뉴/업무 지표, §6.3 시간 계약, 실 URL codec/Scope 권한 연동, DB/서버 영속화, 실제 Export 포맷, 대용량 성능 검증, 범용 위젯 엔진, Unit A 및 원본 문서 변경.

## USER TASK / IA / SCREEN INVENTORY
사용자: 플랫폼 개발자/검토자. 반복 조작으로 상태 전파 경계를 확인한다. 데이터는 21개 좌표 × 2 series. Desktop-first 단일 fixture harness이며 메뉴/내비게이션은 만들지 않는다.
IA: Fixture host → read-only Global Context → Page Filter → AnalysisChartFrame → annotation repository.
화면 목록: 독립 검증 harness 1개. 이동/딥링크는 없음.

## WIREFRAME / COMPONENT MAP
```text
Synthetic fixture — 실제 메뉴 아님
Global Context (host-owned, read-only display)
Page Filter (threshold)
┌ Title                              Actions (7 tools)
│ Description / Metric Version (fixture version)
│ Legend (A solid / B dashed)
│ Plot (ECharts SVG)
│ Selection Summary + Brush numeric controls + Apply
└ Source · Updated · Coverage
Persistent Annotation list / editor (separate repository)
```
AnalysisChartFrame은 metadata/legend/plot/summary/footer 슬롯을 제공한다. Fixture host는 상태 소유권을 나누고 ECharts renderer는 plot만 책임진다.

## 입력 / 출력 / 실패 조건 / INTERACTION RULES
- Global: readonly synthetic scope + applied index range. 유일한 변경 경로는 유효한 Brush의 명시적 Apply 요청이다. URL 쓰기 없음.
- Page: threshold 0–100; 필터는 표시 데이터만 바꾸고 global/local/annotations를 초기화하지 않는다.
- Chart local: viewport, Brush draft, series visibility, Compare. Zoom/Pan 및 visibility는 로컬이며 Reset은 이 층만 초기화한다. 페이지 필터/annotation/global 보존.
- Annotation: 좌표 구간 + text를 독립 repository에 저장한다. chart remount/Reset 후 복원되고 full reload에는 소멸하는 서버 대역이다. 실제 영속성 주장 없음.
- Brush: 숫자 유한값, 0 ≤ start < end ≤ 20. 잘못된 입력은 오류/Apply 비활성, global 불변. 구간은 합성 좌표 양끝 포함이며 시간 half-open 구간을 흉내내지 않는다.
- Compare: B overlay + 별도 Legend/summary, 색 외 dashed line 구분.
- Empty: Page Filter와 viewport 기준 데이터가 0건일 때만 명시적 empty이며 series visibility/Brush는 판정에서 제외한다. 대상 series는 A 및 Compare가 켜진 경우 B다. 데이터가 있을 때 전체 숨김은 “선택된 series 없음”, Brush 선택 0건은 “Brush 범위 안에 데이터 없음”으로 구분한다. Loading: 동기 fixture로 없음. Error: 잘못된 Brush/빈 annotation 표시. Permission: 권한 데이터가 없는 fixture임을 명시.
- Export: 클릭 시 실제 다운로드 미구현 설명을 출력하는 허용된 stub. More: viewport/renderer 상세를 펼침.

## Platform Done 수용 사례
1. Frame의 6개 영역 및 Toolbar vocabulary 7개가 노출되고 조작된다.
2. Page filter/Zoom/Pan/visibility는 Global Context와 URL에 영향을 주지 않는다.
3. Brush 변경만으로 global은 불변이고 Apply 후에만 선택 구간이 바뀐다.
4. Compare 시 실제 렌더 옵션/SVG에 A/B가 함께 있고 Legend/summary도 구분된다.
5. Annotation은 Reset 및 chart remount 뒤 유지되며 page filter/global도 Reset에서 보존된다.
6. remount의 초기 chart local state가 global/URL로 누출되지 않는다.
7. Source/Updated/Coverage와 empty/invalid 상태가 읽힌다.
이는 Unit B 한정 Platform Done이다. 다른 메뉴 연결·실 권한·URL back/forward·운영 Data Trust 통합은 미검증이며 전체 플랫폼 완료로 간주하지 않는다.

## DESIGN DECISIONS / 사용자 확인 필요
| # | 상태 | 항목 | 이번 실험 경계 |
|---|---|---|---|
| 1 | Decided (2026-09-25, [docs/04_frontend_ui_ux.md](../../docs/04_frontend_ui_ux.md) §프론트엔드 기술 스택) — Apache ECharts(SVG 렌더러) 제품 채택 확정; 버전 고정과 대용량·상호작용 성능 재검증은 실제 구현 착수 시 | 실제 제품 ECharts 채택 | SVG 작은 fixture만 검증 |
| 2 | Open | Annotation 영구 저장·권한·Audit·편집 모델 | 독립 in-memory repository만 사용 |
| 3 | Open | Export 실제 포맷·범위 | 클릭 가능한 안내 stub |
| 4 (M1) | Deferred | Interaction Contract 승격 | Toolbar 구성·Reset 의미론·Brush→Apply 경계가 공통 Frame이 아니라 fixture host에만 구현돼 있다. §14 Promotion Rule(2개 이상 메뉴에서 확인 후 공통화)에 따라 두 번째 consumer가 생기기 전에는 의도적으로 승격하지 않는다 |
| 5 (M3) | Open | Selection Summary와 Toolbar 위치 | Selection Summary 슬롯 안에 Pan/Brush 편집기/Apply가 함께 있어 Toolbar vocabulary와 위치가 겹친다 — 정리 방식은 Open |
| 6 (M6) | Open | Zoom-out/viewport 복귀 vocabulary | Zoom은 확대만 가능하고 축소/단계 복귀는 Reset뿐이다 — zoom-out 또는 viewport 복귀를 vocabulary에 넣을지는 Open |

## UX REVIEW / 위험
Global/Page/Chart/Annotation 영역을 구분하며 숫자 Brush 입력은 키보드로 조작 가능하다. Legend의 선 형태, 선택 요약, 원자료 표를 제공한다. DESIGN.md의 기존 색 토큰을 fixture의 design-tokens.ts로 옮겨 CSS 변수와 ECharts 옵션에서 공유한다(chart-blue/chart-purple series, chart-grid 격자). 새로운 플랫폼 토큰을 정의하지 않고 새 디자인 시스템/메뉴는 만들지 않는다. 합성 index 적용은 공개 Context 키 제안이 아니며 §6.3 시간 계약을 구현하지 않는다.

## 실행 결과
- Apache ECharts **6.1.0**, 실제 SVG SSR renderer 채택. 외부 React controls로 상태를 전달하며 native pointer drag/brush 이벤트는 검증 범위 밖이다.
- Vitest **23/23 통과** (기존 15 + 신규 8; UI 계약 16 + 실제 ECharts/모델/토큰 7), TypeScript 및 Vite production build 성공.
- `prototypes/kernel-chart-frame/verification.log`에 첫 TypeScript 검사 실패와 수정 후 최종 성공을 모두 보존했다.
- Vite 경고: minified JS 717.09 kB (>500 kB); 성능 최적화/제품 채택 판단은 이번 범위 밖이다.
- 원본 계약 및 기존 Unit A/App Shell 변경 없음. 브라우저 E2E/수동 시각 검수 미실행. 사용자 확인 필요 6개(Candidate 1 / Open 4 / Deferred 1). M1/M3/M6 코드 변경 없음.

## 리뷰 후 수정 결정 (M2/M4/M8/M9)
- M2: 데이터 결과 Empty, 전체 series 숨김, Brush 선택 0건을 분리했다. 선택 개수도 viewport와 Page Filter를 적용한 뒤 Brush로 좁힌다.
- M4: Brush와 주석 markArea는 항상 존재하는 별도 silent series에 한 번만 부착한다. 모든 데이터 series를 숨겨도 남고 Compare에서 주석 label이 중복되지 않는다.
- M8: DESIGN.md에 chart-* 토큰이 존재한다. 원본은 수정하지 않았으며 로컬 어댑터를 CSS 변수로 설치하고 ECharts SVG SSR은 같은 어댑터 값을 직접 참조한다(SSR에 DOM/CSS 변수 해석을 요구하지 않음).
- M9 (Decided, fixture 한정): Brush 편집기 toggle off 시 local.brush를 null로 만들고 입력 draft도 기본값 4–12로 초기화한다. 닫힌 편집기에 적용할 수 없는 선택을 남기지 않도록 Apply도 함께 숨긴다(실행 불가). 다시 열면 새 기본 선택으로 시작하고 이미 적용된 Global/저장 주석은 보존한다.
- 회귀 증거: regression-red.log의 초기 실패를 기록했다. 리뷰의 M2 probe 3개와 viewport, M4 실제 SVG 2개, M9 닫기/재열기, chart 토큰 렌더 검증을 추가했다.
