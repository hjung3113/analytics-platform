# Platform App — 통합 인터랙티브 프로토타입

**합성 데이터 프로토타입.** 실제 파서 데이터·SSO·권한 서버·mart가 없다. `@ap/mock-server`(`packages/mock-server`)이 서버 역할(Scope/room 재검증, `outcome`+`assessments[]` 응답 envelope)을 흉내낸다. Kernel은 mock을 직접 import하지 않고 `@ap/contracts`의 `PlatformAdapter`를 통해서만 서버에 닿는다(`mockAdapter`를 `main.tsx`가 주입).

기존 4개 Kernel 유닛(`kernel-app-shell`, `kernel-chart-frame`, `kernel-platform-table`, `kernel-context-url-scope`)을 하나의 앱으로 통합해, 플랫폼 다섯 갈래가 실제 메뉴 화면(Consumer) 아래에서 함께 동작하는지 검증한다. 기존 유닛은 수정하지 않았다.

2026-09-26 `prototypes/platform-app`에서 pnpm 모노레포의 `apps/platform-web`(`@ap/platform-web`)으로 옮겼다. 패키지 분리 계획은 [플랫폼 모노레포 패키지 경계](../../docs/integration/platform-packages.md)를 따른다. `reports/`의 `prototypes/platform-app/...` 경로는 당시 기록이라 그대로 둔다.

저장소 루트에서 실행한다(Node 26.7.0, pnpm 11.1.1):

```sh
pnpm install
pnpm dev           # http://127.0.0.1:5173
pnpm typecheck
pnpm test
pnpm build
```

## 다섯 갈래 ↔ 코드

| 갈래 (AGENTS.md) | 위치 |
| --- | --- |
| Kernel: Menu Registry, 전역 Context, URL 계약, 권한·Scope, 즐겨찾기/최근/활용 계측 | `packages/kernel`(`@ap/kernel`: `createRegistry`, `PlatformProvider`, `usePlatformQuery`, i18n), 메뉴 선언은 `menus/<group>/src/index.ts`(앱 `src/menus.ts`가 연결), URL codec·manifest·응답 envelope 타입은 `packages/contracts` |
| 공통 컴포넌트 | `packages/components`(`@ap/components`) — `PlatformPage`(§8 Slot: Context Bar는 `slots.contextBar`로 주입), `PlatformDataTable`, `DetailDrawer`, `AuditTimeline`, `DataTrustIndicator`, `StateView`(§19), `StatCard`. UI primitive·`StatusBadge`·토큰은 `packages/ui`(`@ap/ui`) |
| 차트 계약 | `packages/components/src/AnalysisChartFrame.tsx` (Zoom/Brush/Reset/Compare/Annotate/Export/More, 4층 상태 분리), `EChart.tsx` |
| 레이아웃 | `packages/shell`(`@ap/shell`: AppShell 270/64/54, Sidebar 아코디언, TopBar, GlobalContextBar, CommandPalette, RouteOutlet) + 페이지 archetype |
| 메뉴간 연결 | `usePlatform().linkTo()` Context Link helper, `returnTo` 복귀 |

## 페이지 작성 가이드 (Consumer 규칙)

페이지는 `menus/<group>/src/pages/*.tsx`에 default export로 두고 그룹 패키지 `src/index.ts`의 `component`로 lazy 등록되며, 앱 `src/menus.ts`는 `@ap/menu-*` 패키지의 `manifests`를 이어 붙인다. **페이지는 `packages/*`(kernel/shell/components/ui/contracts/mock-server)를 수정하지 않는다.** 공통 컴포넌트가 부족하면 수정하지 말고 필요 사항을 보고한다.

1. 최상위는 반드시 `<PlatformPage>`. 슬롯: `title`, `description`, `primaryAction`, `secondaryActions`, `contextExtension`(page-owned 필터), `dataTrustSummary`, `crumbs`, `children`. 전역 Context Bar·Scope 게이트·Breadcrumb·즐겨찾기는 PlatformPage가 자동 렌더링한다 — 페이지가 날짜 선택기·Scope 선택기를 따로 만들지 않는다(§5 금지).
2. 데이터 조회는 `usePlatformQuery(signal => serve({...}), pageInputs)` → `<QueryView query={q}>{data => ...}</QueryView>`. `serve`는 `@ap/mock-server`가 아니라 그룹 패키지의 `../api`(`menus/<group>/src/api.ts`)에서 온다. 데이터 원천 import는 `api.ts` 한 파일. 다른 메뉴 폴더를 import하지 않고 이동은 `linkTo`만. 로딩/갱신/empty/forbidden/too_large/timeout/error 분기는 QueryView가 한다. 위젯마다 따로 조회하면 부분 실패가 그 위젯에만 머문다(§19).
   - `serve({ global, signal, compute: ({ equipment }) => ..., isEmpty, kinds, maxHours, metricVersion, mergeTimeDomain })` — `equipment`는 Scope→허가 room→room_name→Condition→Selection으로 이미 해석된 설비 목록이다. 페이지가 권한 판단을 하지 않는다. `mergeTimeDomain` defaults to true: 2대 이상과 `[from, to)`가 있으면 서버 assertion 없이 시간축을 합치지 않는다. 마스터 목록·카탈로그·공지·occurrence 단건은 `mergeTimeDomain: false`.
   - 0건을 수집 중단/지연으로 해석하지 않는다. `null` 값은 0이 아니라 “미확인”이다.
3. 전역 Context 읽기: `const { global } = usePlatform()` (`from`,`to`,`roomNames`,`condition`,`selection`,`lotIds`,`ppid`,`recipeIds`,`metricId`,`metricVersion`, `scopeId`). 전역 변경은 사용자의 명시적 액션일 때만 `setGlobal(patch)`.
4. Page-owned URL 상태: registry의 `pageKeys`에 등록된 키만 `pageParam(key)` / `setPage({key: value|null}, {replace?})`. 미등록 키를 쓰지 않는다. 탭·필터·정렬처럼 공유 링크로 재현돼야 하는 것만 URL에 둔다.
5. 다른 메뉴로 이동은 반드시 `linkTo(menuId, { params, page, global, returnTo: true })` + `<PlatformLink href>` 또는 `navigate()`. URL 문자열을 직접 조립하지 않는다(§22). 목적지 객체 ID(`params`)와 분석 Context(`global`)는 분리한다 — 상세로 갈 때 Selection을 목적지 ID로 바꾸지 않는다. 상세의 “분석으로 돌아가기”는 `pageParam('returnTo')`로 받은 URL을 그대로 `navigate()`한다(§6.4).
6. 차트는 `AnalysisChartFrame`으로 감싼다. 시리즈 색은 `packages/ui/src/styles/tokens.css` 변수명(`chart-blue`, `chart-teal`, `chart-green`, `chart-purple`, `accent-warn` …). 차트 클릭으로 전역 Context를 조용히 바꾸지 않는다 — 드릴다운은 `onPointClick`의 명시적 이동, 구간 승격은 프레임의 “분석 구간 적용”.
7. 표는 `PlatformDataTable` (`loadPage`가 `serve()` envelope 반환, `sortAndPage` 헬퍼), 상세는 `DetailDrawer` + `Field` + `AuditTimeline`.
8. 스타일은 DESIGN.md 토큰 유틸리티만 사용: `bg-surface-card`, `border-border-subtle`, `text-text-muted`, `bg-accent-primary-soft`, `t-page-title`/`t-section-title`/`t-card-title`/`t-stat`/`t-caption`/`t-mono`/`tabular` 등. 임의 hex·그림자 스택·pill 버튼 금지. 상태 색은 `StatusBadge`(success/warning/danger/neutral/info)만.
9. UI 문구는 `const { tx, lang } = useI18n()`로 한/영 모두 제공(`lang === 'ko' ? … : …` 또는 `tx({ko, en})`). 설비 ID·팀명 같은 마스터 값은 번역하지 않는다.
10. 합성 데이터는 해당 페이지 폴더 안(`menus/<group>/src/pages/data.ts`)에 둔다. `EQUIPMENT`는 각 화면이 `serve`의 `compute`로 받은 목록을 쓰고, metrics 카탈로그는 월드 표를 직접 읽지 않는다.

## 확인된 동작 (셸/Kernel)

- 7그룹 아코디언 사이드바(270px) ↔ 64px 아이콘 레일(플라이아웃), `[` 단축키, 메뉴 필터, 즐겨찾기/최근 방문.
- 권한 기반 메뉴 노출(역할 전환: 탑바의 개발 도구 `src/dev/DevTools.tsx`, SSO 대역), 직접 URL은 서버 거부 화면.
- Scope 단일 선택 + 서버 재검증(검증 중/검증됨/접근 불가), Scope 전환 시 Site 경계 Context 명시 초기화.
- 기간 `1일/7일/사용자 지정`, 사용자 지정 날짜(양끝 포함)→`[D1T00:00:00,(D2+1)T00:00:00)`, 초 단위 입력.
- room_name / Condition(StGroup·분임조·Maker+Model 중 하나) / Selection(부재·명시·명시적 빈 집합), 조건 밖 선택 경고(자동 제거 없음).
- 미지원 Context는 URL에 보존되고 “이 화면에서 미사용”으로 표시.
- URL 계약 오류(`v=2`, 한쪽 기간, 공집합 표식 충돌 등)는 보정 없이 오류 화면.
- 응답 시나리오 시뮬레이터(플라스크 아이콘, 같은 개발 도구)로 §19 taxonomy 전 상태 재현 + 계약 검증 링크.

## Candidate / Open으로 남긴 것

- 최초 진입 기본 기간 Δ=24h(1일) — 결정 문서상 Open, 여기서는 Candidate.
- Registry `primary`(그룹 대표 목적지) 필드 — 08 §8의 Open 스키마 작업을 Candidate로 추가.
- 대표 목적지 권한 없음 그룹 카드: 비활성 + 사유 표시 (08 §8 Open).
- 주석 저장소는 메모리(새로고침 시 소멸), Export는 CSV 다운로드만.

## Consumer 화면 (2026-09-26, 워커 병렬 제작 → coordinator 브라우저 검증)

| 화면 | Archetype | 검증한 플랫폼 갈래 | 제작 | 보고서 |
| --- | --- | --- | --- | --- |
| 운영 개요 (08) | Overview(랜딩) | Registry 노출·즐겨찾기·최근방문·미적용 Context 보존 | coordinator | — |
| 설비 마스터/상세 (09) | Management | PlatformDataTable·DetailDrawer(링크 가능 `focus`)·AuditTimeline·Full Page·returnTo | Codex GPT‑6 Astra | `reports/equipment-master.md` |
| 생산성 개요 (11) | Overview | StatCard·AnalysisChartFrame·위젯별 부분 실패·page-owned `granularity`·교차 링크 | OMP GLM‑5.3 | `reports/productivity-overview.md` |
| 사이클타임 상세 → 실행 상세 (12) | Analysis Workspace | Brush→전역 기간 승격·histogram 선택·occurrence 키 분리·returnTo 복귀 | Grok 4.7 | `reports/cycle-time.md` |
| 지표 카탈로그/상세 (13) | Catalog | `metricId`+`metricVersion` 쌍 소유·다른 지표 보존·비소속 버전 오류 | Grok 4.7 | `reports/metric-catalog.md` |

검증한 교차 흐름: 생산성 개요(roomNames=CVD-201) → 주의 항목 → 사이클타임(`selectedEquipmentIds` 명시 교체, room 보존) → 실행 상세(occurrence 키 별도, `returnTo`) → 돌아가기 시 출발 URL 정확 복원.

Kernel 규약 추가: `metricVersion`은 bare 토큰(`'3'`), 표시는 `formatMetricVersion()` → `v3`.

## 남은 플랫폼 과제 (워커 보고 기반)

- 표 정렬/페이지, 사이클타임 버킷·분포 선택, 설비 드로어 탭의 page key 미등록 → URL/복귀 링크에 남지 않음.
- 생산성 개요의 지표별 버전 page key(`occupancyVersion` 등, wireframe 11 Candidate) 미등록, Trust envelope `metricVersion` 단일 필드.
- 목적지 객체 단건 조회 API 부재(설비 상세가 request-only Context 복사로 우회), export/facet은 대량 데이터용 서버 엔드포인트 필요.
- 드로어·팝오버 overlay 그림자(DESIGN no-shadow 규칙과 overlay elevation 경계 미정).
- AnalysisChartFrame compare의 이전 기간 x축 정렬 옵션 부재(페이지가 bucket index 정렬로 우회).
- 번들 672kB(ECharts) — 코드 분할 미적용.
- 메뉴 권한을 mock 서버(`serve()`)가 재검증하지 않음 — 클라이언트 라우트 게이트만 있음(교차 리뷰 P2-3, 보류).
- Lot·PPID·Recipe·지표 쌍을 Context Bar에서 새로 지정하는 편집기 없음 — 전달된 값의 제거만 가능(교차 리뷰 P2-4, 도메인 선택지 정의 후).
