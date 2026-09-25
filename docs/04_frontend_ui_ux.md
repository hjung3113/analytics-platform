# 04. 프론트엔드 기술 스택 및 UI/UX 설계 (프론트엔드 담당자용)

백엔드 스택은 `03_backend_stack.md`를 본다.

## 제품 제약과 구현 후보

**Decided product constraints**는 `06_platform_ui_contract.md`의 Desktop-first, 메뉴 공통 계약, Context/URL 재현, 서버 권한 재검증, 접근성 및 데이터 상태 근거 규칙이다. 이 제약들은 특정 프레임워크를 요구하지 않는다.

아래 대시보드 편집 후보(react-grid-layout)만 여전히 **implementation candidate**다 — 해당 기능 자체가 Deferred이기 때문이며, 채택 시점에 버전·성능을 재검증한다.

## 프론트엔드 기술 스택 (Decided, 2026-09-25)

**결정 근거**: FeedbackOps(`products/feedbackops/apps/frontend`, `packages/ui`)가 실사용 중인 비-백엔드 스택을 그대로 가져온다 — 이미 검증되고 채택 경험이 있어 마이그레이션 부담이 적다는 것이 사용자 판단이다. 테이블/차트는 FeedbackOps에 선례가 없어, 이 세션에서 Astra↔Opus 교차 검토로 실제 동작을 검증한 것을 그대로 채택한다(Unit B `prototypes/kernel-chart-frame/`, Unit C `prototypes/kernel-platform-table/`, 별도 worktree/브랜치 `hjung3113/kernel-context-url-scope`). FeedbackOps 자체 코드는 이 결정으로 소급 변경하지 않는다(AGENTS.md FeedbackOps 서브모듈 경계).

| 계층 | 채택 | 근거 |
| --- | --- | --- |
| Frontend 기반 | React + TypeScript + Vite | FeedbackOps `apps/frontend`와 동일 |
| 스타일링 | **Tailwind CSS v4** | FeedbackOps는 v3(`packages/ui/tailwind.preset.ts`, "Tailwind 3 syntax only. No `@theme` v4 blocks" 명시, ADR-0021 semantic token 방식). 이 플랫폼은 v4로 가고 FeedbackOps의 시맨틱 토큰 네이밍(ADR-0021)만 이식한다 — 문법을 `@theme` 블록으로 옮기는 건 이 플랫폼 쪽 마이그레이션 작업이며, FeedbackOps 자체를 v4로 올리는 것은 별도 과제(강제하지 않음) |
| UI 컴포넌트 | **shadcn/ui + Radix**(FeedbackOps `packages/ui/src/components/shadcn/`의 22개 컴포넌트 소스를 이식) + 자체 확장 컴포넌트(`ChipPicker`/`AnalyticsAreaPicker` 등 패턴 참고) | shadcn은 설치형 패키지가 아니라 소스 복사 방식이라 FeedbackOps가 이미 커스터마이즈해 둔 실제 파일을 그대로 가져올 수 있다. `cn()` 헬퍼(clsx+tailwind-merge)도 동일하게 이식 |
| 라우팅 | TanStack Router | FeedbackOps와 동일. 타입 있는 검색 파라미터로 06 §6.4 URL 계약을 타입 안전하게 관리하되, 버전·폐기 필드·미지원 필터 처리는 이 문서 §6.4 메커니즘을 별도로 구현해야 한다 |
| 서버 상태 | TanStack Query | FeedbackOps와 동일 |
| UI 상태 | Zustand | FeedbackOps와 동일 |
| Form | react-hook-form + zod (+ `@hookform/resolvers`) | FeedbackOps와 동일 |
| 아이콘 | lucide-react | FeedbackOps와 동일. 2026-09-22 grilling에서 이미 Candidate→Decided([PLATFORM_REQUIREMENTS](../PLATFORM_REQUIREMENTS.md) 아이콘 항목)로 확정된 것과 일치 |
| Toast | sonner | FeedbackOps와 동일 |
| Command Palette | cmdk | FeedbackOps와 동일. §4 Kernel 책임의 Command Palette를 이 라이브러리로 구현 |
| 테이블/가상화 | TanStack Table + TanStack Virtual | FeedbackOps에 선례 없음. 이 세션 Unit C(`prototypes/kernel-platform-table/`)에서 서버사이드 sort/filter·virtualization·column 선호 저장·multi-select를 Playwright/Chromium으로 실검증(23 tests) |
| 차트 | Apache ECharts (SVG 렌더러) | FeedbackOps에 선례 없음. 이 세션 Unit B(`prototypes/kernel-chart-frame/`)에서 실제 SVG SSR 렌더링·4층 상태 분리·Toolbar 7종을 검증(23 tests) |
| 테스트 | Playwright(e2e/visual) + Vitest(unit) | FeedbackOps와 동일, 이 세션 프로토타입도 동일 조합 사용 |
| 조회 레이아웃 | CSS Grid | 고정 화면은 react-grid-layout보다 단순·안정적 |

**아직 Candidate로 남는 것**: 대시보드 편집(react-grid-layout, Deferred 기능이라 채택 보류), 정확한 라이브러리 버전 고정(실제 구현 착수 시 재검증), FeedbackOps 컴포넌트/토큰 이식의 세부 매핑(실제 포팅 작업에서 확정).

Node/NestJS는 프론트와의 언어 통일·SQL-first 관점에서 비교했던 대안이다. 현재 백엔드는 FastAPI 방향이 Decided이며 세부 버전·구성은 Candidate다([05 결정 상태](05_roadmap_and_open_questions.md), [03 백엔드 스택](03_backend_stack.md)).

## UI/UX 리서치 (codex gpt-5.6-luna, 실제 웹 검색 기반, 2026-09-17 확인)

이 플랫폼과 정확히 같은 단일 상용 제품은 없다. 가장 현실적인 참고 조합:

| 영역 | 참고 제품 |
| --- | --- |
| 운영 앱 셸·CRUD | Retool |
| 지표 거버넌스·드릴스루·필터 전달 | Looker, Power BI |
| 고밀도 시계열·주석·컨텍스트 링크 | Grafana, Datadog, New Relic |
| 대시보드·필터·권한·버전이력 단일 참고 | Apache Superset |
| 제조 도메인 참고 | AVEVA PI Vision, Seeq |

- **Grafana**: 대시보드 링크/패널 링크/데이터 링크를 구분하고 현재 시간범위·변수까지 링크에 포함 — "설비 점유율 차트 → 이송분포 화면" 이동에 특히 적합. ([공식 문서](https://grafana.com/docs/grafana-cloud/learn-and-build/visualizations/dashboards/build-dashboards/manage-dashboard-links/))
- **Datadog**: Template Variable/저장된 View/시간범위·필터·기간을 포함하는 Context Link 제공. 단 클릭한 데이터 포인트의 시간 버킷을 전달할 수 있어 "현재 페이지 전체 기간"과는 구분해야 함. ([공식 문서](https://docs.datadoghq.com/dashboards/guide/context-links/))
- **Metabase**: 전역/카드 필터 범위를 명시적으로 구분하는 게 장점. ([공식 문서](https://www.metabase.com/docs/latest/dashboards/filters))
- **Power BI**: 드릴스루는 맥락(설비·Lot·기간)을 유지한 채 상세 페이지로 이동하는 좋은 참고. "URL 필터는 보안 경계가 아니다"는 Microsoft 공식 입장. ([공식 문서](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-drillthrough))
- **PI Vision / Seeq**: 제조 특화 제품 중 가장 유용 — PI Vision은 자산 중심 화면·실시간 트렌드, Seeq는 신호 검색→구간 표시→계산→공유 분석 흐름. 다만 파서의 완료된 occurrence 데이터에 적용할 때 실시간 센서 분석과 같은 데이터 가용성을 전제하면 안 됨.
- **Superset**: 필터바·대시보드 탭·레이아웃 편집·권한·버전이력을 한 제품에서 제공하는 가장 가까운 단일 참고. 단 확인된 공식 문서는 "Version: Next" 표기였고, 과거 대시보드 미리보기에도 현재 차트 정의가 쓰이며 권한 변경은 버전이력에 포함되지 않음 — 이 플랫폼의 완전한 감사·재현성 모델과 동일시하지 말 것.

## 정보구조·Context·딥링크 계약의 소유권

플랫폼 전역 계약은 `06_platform_ui_contract.md`가 소유한다: §6은 occurrence 식별자와 목적지 객체 ID 분리, URL 상태, Scope/서버 권한 검증, 시간 의미와 Open 결정; §9는 navigation IA; §11은 Context 변경과 이전 데이터 차단 규칙이다. 이 문서에서 별도 규칙을 재정의하지 않는다.

TanStack Router는 계약의 구현 후보다. URL 직렬화·집합/단일값 키의 중복 규칙은 [06 전역 계약](06_platform_ui_contract.md) §6.1, 세션 우선순위·버전 `v` 수명주기·잘못된 값·뒤로가기/미지원 Context 복원 메커니즘은 §6.4에서 Decided다. 공개 필드명·enum 문자열 및 공유 산출물 형식(OpenAPI/JSON Schema/codegen)은 Candidate이며, 구현·라이브러리 채택·완성된 URL API를 이 결정만으로 주장하지 않는다. 구체 셸 배치는 [07 App Shell](07_app_shell_wireframe.md)을 참조한다.

## 페이지별 UI 패턴

### 설비·기준정보 CRUD

필터바+테이블+선택 액션바, 행 클릭 시 상세 Drawer/Split View, 삭제보다 비활성화/유효기간 종료 우선, 설비 유효구간은 타임라인+구간 테이블 함께, 겹치는 구간은 저장 전 차단/경고, Audit Trail은 숨은 메뉴가 아니라 상세 화면의 탭/우측 패널로 노출.

### 생산성 분석

KPI 카드 수 제한 후 핵심 지표 하나를 가장 크게, 주 차트-상세 테이블 연결, 차트 클릭 시 필터 칩 생성, "현재 범위/기준선/이벤트/주석" 시각적 구분, 차트 도구(확대/초기화/Brush/주석/비교/내보내기) 일관화, 차트마다 로컬 상태와 페이지 전역 필터를 분리.

### 지표 카탈로그

지표카드/상세에 계산식, 단위·grain, 데이터 원천, 담당 조직, 버전·유효기간, 승인상태(워크플로가 아니라 초안/발행/폐기 같은 상태 필드 — YAGNI로 뺀 승인 워크플로와는 별개), 적용 가능 설비/공정 범위, 데이터 품질상태, 사용 중인 대시보드, 이전 버전과의 차이를 함께 표시. 대시보드는 "현재 최신 지표"를 암묵적으로 쓰지 않고 게시 시점의 지표 버전을 고정(예: "점유율 지표 v3로 계산됨 · 현재 승인 버전은 v4").

### 공지·VOC

VOC는 분석 화면과 시각 언어를 일부 공유하되 접수/담당자/상태전이/댓글은 VOC 자체 도메인 모델(Audit Trail이 대체하지 않음) — 접수/담당/상태/우선순위 필터, 설비·Lot·지표로부터 VOC 생성, VOC에서 원본 분석 화면으로 돌아가는 링크, 분석 화면에는 열람 권한 범위 내의 관련 VOC 수만 표시(VOC 열람 권한이 원본 분석 권한을 자동 부여하지 않음). 상세는 `02_domain_menus.md`.

## 로딩·빈 상태·오류

"데이터가 없음"의 의미가 여러 가지라 상태를 세분화해야 한다: 아직 수집안됨 / 파서 처리 지연 / 필터 결과 0건 / 권한으로 인해 비노출 / 데이터 품질 경고 / 쿼리 결과 과대 / 실제 서버 오류. 각 상태는 화면 밖의 근거(어느 서비스가 그 사실을 확정하는지)가 필요하다 — 근거 없이는 "원인 미확인"(`06_platform_ui_contract.md` §19가 표시 근거 규칙을 소유하며 원천 제약은 `03_backend_stack.md` 참조).

권장 동작:

- 로딩 중에는 표의 행/차트 축 형태를 유지하는 Skeleton
- 새로고침 중에도 이전 데이터 유지 + "갱신중" 표시(단, 설비·기간 등 컨텍스트가 바뀐 뒤에는 이전 값을 새 필터 결과처럼 보이게 하지 않는다 — 동일 컨텍스트 재조회에만 적용, 권한 스코프 전환 시에는 이전 결과를 유지하지 않음)
- 위젯별 재시도, 실패한 위젯만 오류 처리(대시보드 전체 아님)
- 마지막 갱신 시각/원천 기준 시각/데이터 완전성 표시
- 장시간 쿼리는 취소/집계수준 변경/기간 축소 제안
- 오류 화면에는 Query ID/Correlation ID 제공

## 차트/도식 자유도 요구사항

요구사항: 확대/축소, 특정 구간 확대, 차트 위에 그리기(주석/영역 표시) 등 차트 기반 커스텀 기능.

| 라이브러리 | 줌/팬 | 영역 선택 | 그리기(주석) | 비고 |
| --- | --- | --- | --- | --- |
| Apache ECharts | 기본 제공(dataZoom) | 기본 제공(brush) | graphic 커스텀 레이어 — 완성된 주석 편집기는 아니며 드래그·좌표변환·리사이즈 갱신을 직접 연결해야 함 | 대용량 시계열 캔버스 렌더(large, sampling:'lttb')에 강함, React 래퍼 존재 |
| Plotly.js | 기본 제공 | 사각형·lasso 선택 기본 제공 | 선·사각형·원·경로 그리기 및 삭제 도구 기본 제공 | 통계 차트 풍부, 대용량·다중 차트 브러시 동기화는 ECharts가 더 유리하다는 것은 확정 사실이 아니라 POC로 검증할 가설 |
| visx/D3 (React) | 직접 구현 | 직접 구현 | 자유도 최고 | 구현 비용 큼 |
| Recharts/Nivo | 약함 | 약함 | 약함 | 선언적이라 쉽지만 커스텀 인터랙션엔 부적합 |

**추천: Apache ECharts 유지.** 대용량 시계열·다중 차트 브러시 동기화에서 우위가 있을 것이라는 가설로 최종 추천은 유지하되, 대표 화면 POC에서 검증한다.

ECharts 6.x(2026-05-19 기준 6.1.0)는 대용량 시계열·Canvas/SVG·progressive rendering·DataZoom·Brush·MarkArea·Graphic을 지원한다. ([릴리스 노트](https://echarts.apache.org/en/changelog.html))

차트 상태는 4층으로 분리:

1. 전역 필터(기간·설비·Lot)
2. 차트 로컬 상태(확대 범위·Brush·표시 시리즈)
3. 영속 주석(작성자·시간구간·설명·분류·권한·Audit이 있는 도메인 객체) — 플랫폼이 소유하는 도메인 모델이며, 공통 위젯 프레임워크(Deferred)는 이를 편집·표시하는 기능만 재사용한다
4. 이벤트/알람(주석과 별개의 운영 이벤트)

DataZoom만으로 대용량 문제를 해결하지 말고 백엔드에서 화면 픽셀 폭에 맞는 해상도·집계 수준을 선택할 것(원본 로그 전체를 브라우저로 보내지 않음). Canvas 차트의 접근성 보완으로 차트 제목/단위, 선택 구간 텍스트 요약, 동일 데이터의 상세 표, 키보드 구간선택 컨트롤, 색 외 선 형태/아이콘 표시를 갖춘다.

### 주석 저장 모델 (진짜 설계 과제)

라이브러리 선택보다 중요한 것은 **주석 저장 모델**이다. 그린 영역/필기를 화면 픽셀이 아니라 시간구간·데이터 좌표·대상 occurrence 기준으로 저장하고, 자유 필기 메모와 분석 필터용 선택 영역을 구분한다. 대표 화면 하나로 줌/팬/영역선택 동기화, 주석 이동·수정·삭제, 리사이즈·줌 후 위치 유지, 저장 후 복원까지 검증한 뒤 라이브러리 선택을 고정한다. 영역 주석 최소형과 자유 필기·고급 편집기는 서로 다른 범위 후보다. 구현 순서와 배치 시점은 Deferred이며 `05_roadmap_and_open_questions.md`의 과거 Phase 표는 확정 계획이 아니다.

## 최종 권장안

1. 앱 셸은 운영 시스템처럼(사이드바·Breadcrumb·전역 필터바·권한별 메뉴), 분석 화면은 BI처럼(지표 인증·데이터 기준시각·교차필터·드릴스루·저장된 보기), 차트는 옵스 도구처럼(시간범위·Brush·주석·컨텍스트 링크), 마스터데이터는 CRUD 도구처럼(테이블·Drawer·유효기간·diff·Audit) 설계한다.
2. URL은 필터 공유 계약으로 쓰지만 보안 경계로 쓰지 않는다.
3. 기본 테이블은 TanStack 계열로 시작하고 초대형 분석 그리드만 AG Grid(Enterprise 필요 여부 먼저 확인)를 검토한다.
4. 대시보드 저장 모델은 레이아웃 라이브러리와 분리한다.

## 확인 한계

제품 공식 문서 중심으로 2026-09-17 기준 상태를 확인했으나, 각 SaaS의 실제 로그인 화면 UI, 한국어/CJK 데이터에서의 그리드 성능, 실제 파서 산출물 규모에 대한 독립 벤치마크는 확인하지 못했다. AG Grid·Glide·Retool의 성능 수치는 공급자 설명으로 취급하고, 도입 전 실제 로그 cardinality와 CJK 데이터로 짧은 POC가 필요하다(향후 검증 후보로 기록, `05_roadmap_and_open_questions.md`).
