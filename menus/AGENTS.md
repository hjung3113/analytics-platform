# menus/ — 메뉴 Consumer 패키지

업무 시스템(도메인) 메뉴 Consumer 패키지만 둔다: `menus/<system>/<group>/`, 두 단계다. Registry 그룹마다 하나의 패키지(`@ap/menu-<group>`)이고, 메뉴가 `manifests`를 선언하면 앱(`apps/platform-web/src/menus.ts`)이 이어 붙여 Kernel에 등록한다. 메뉴 화면은 플랫폼 다섯 갈래(루트 `AGENTS.md`)를 검증하는 Consumer다. 플랫폼 기능(홈·내 활동·공지·운영 콘솔·FeedbackOps 화면)은 한 단계 `platform/<feature>/`에 있다([`platform/AGENTS.md`](../platform/AGENTS.md)). 아래 규칙은 두 루트의 `@ap/menu-*` 패키지에 같이 적용된다.

그룹 단위 소유는 `.github/CODEOWNERS`에 시스템·그룹 폴더로 기록하며 새 그룹 폴더를 만들면 해당 줄을 추가한다(ADR-0090 D4). `menus/_global/`·`menus/feedbackops/`·`menus/operations/`는 없다. 세 곳의 패키지는 `platform/`으로 옮겼다([ADR-0097](../docs/adr/0097-platform-features-and-role-based-names.md), #1098).

| 패키지 | 폴더 | 그룹 | 화면 |
| --- | --- | --- | --- |
| `@ap/menu-equipment` | `menus/mars/equipment` | `equipment` | EquipmentMaster, EquipmentDetail |
| `@ap/menu-master-data` | `menus/mars/master-data` | `masterData` | 없음(계획 메뉴 manifest만) |
| `@ap/menu-analytics` | `menus/mars/analytics` | `analytics` | ProductivityOverview, CycleTimeDrilldown(두 화면의 틀린 page key는 SDK `usePageKeyRules`·`PageKeyWarning`으로 거부, #924), ExecutionDetail, ChartCatalog + Wafer Journey(계획) |
| `@ap/menu-hw-time` | `menus/mars/hw-time` | `hwTime` | `HW Time 단계별`(`/mars/hw-time-steps`, ADR-0078 — `DrillLayout fill`+`summary`, Inspector `stack`, 행 26px 상세 hero와 접히는 추세). `HW Time 비교`(`/mars/hw-time-compare`, 드릴해도 위 단계 패널을 남기는 `PanelWorkspace`(`persistKey` `hw-compare`, 패널 `summary`|`module`|`detail`+`trend` 탭, 패널마다 자기 조회 `{}`·`{drillModule}`·`{drillModule, drillMotion}`, 비면 기다림 문구, `revealTrend` 끔, #912), Motion 단계에서는 구성|상세 두 Frame이 `row` 페이지 키로 행 강조 공유, Inspector `rail`, `행 스크롤 보기`·`최소·최대`·`시작 위치 맞춤` 옵션). `HW Time 개요`(`/mars/hw-time-overview`, `PanelWorkspace initialMode="stack"`, 레벨별 `hw-overview-l1|l2|l3`, 순위·단계·문맥·상세·추세·범례 패널과 `badge`(추세 행 수·일부 미측정), 범례는 패널이고 Inspector `rail`은 분석 대상·옵션). `HW Time 표`(`/mars/hw-time-table`, `PlatformDataTable` 서버 페이징+`DetailDrawer`(그 행의 쌓기 막대·추세), 내보내기는 표가 소유, 진입은 시리즈 칸의 `<값> 들어가기` 버튼). 네 메뉴가 함께 쓰는 조회 선언 `hwTime.levelRows`·`trend`·`tableRows`·`exportRows`(소유 메뉴 `hw-time-steps`), 결정적 mock, `useMenuQuery` 조회 훅, 공유 패널 `src/shared/panels/`(#690). 단계별·비교·개요가 함께 쓰는 레벨 상태 훅 `useHwTimeLevelState` — 틀린 `sort`·`trend`·`row` page key는 고치지 않고 SDK `usePageKeyRules`·`PageKeyWarning`으로 거부해 안내한다(#828, #852) |
| `@ap/menu-rcc` | `menus/mars/rcc` | `rcc` | 없음(계획 메뉴 manifest만) |
| `@ap/menu-mcc` | `menus/mars/mcc` | `mcc` | 없음(계획 메뉴 manifest만) |
| `@ap/menu-wpt` | `menus/mars/wpt` | `wpt` | 없음(계획 메뉴 manifest만) |
| `@ap/menu-configuration` | `menus/mars/configuration` | `configuration` | 없음(계획 메뉴 manifest만) |
| `@ap/menu-metrics` | `menus/bravo/metrics` | `metrics` | MetricCatalog(틀린 `status`·`domain`은 고치지 않고 SDK `usePageKeyRules`·`PageKeyWarning`으로 거부, #924), MetricDetail |
| `@ap/menu-clas` | `menus/clas/clas` | `clas` | OperationTime |
| `@ap/menu-log-my-work`·`-log-models`·`-log-cross`·`-log-rules` | `menus/log-dev/*` | `logMyWork`·`logModels`·`logCross`·`logRules` | 없음(계획 메뉴 manifest만, ADR-0065) |
| `@ap/menu-imp-my-work`·`-imp-tasks`·`-imp-reports` | `menus/improvement/*` | `impMyWork`·`impTasks`·`impReports` | 없음(계획 메뉴 manifest만, ADR-0065) |

## 규칙

- 메뉴 동작·화면이 바뀌면 내부 버전의 minor 또는 patch를 올리고 같은 PR의 CHANGELOG에 한 줄을 기록한다. 발행·태그는 하지 않으며 기대 SDK 태그 범위는 package.json `ap.sdk`에 둔다. SDK 태그를 올릴 때 메뉴들의 `ap.sdk`와 생성기 `SDK_RANGE`를 함께 갱신한다.

- `src/index.ts`는 `manifests: MenuEntry[]`만 export한다. 페이지·집계(`METRICS`, `resolveMetric` 등)를 재export하지 않는다 — 앱이 `manifests`만 import해도 라우트 lazy가 깨지지 않아야 한다. 앱이 메뉴에 설정값을 넣어야 하면 index가 아니라 별도 서브패스로 내보낸다(예: `@ap/menu-<g>/mock`; origin 서브패스와 `@ap/feature-bridge`의 `fo-api`·`notifications-slot`·`voc-compose-slot`·`home-todo-slot`(다리를 import하는 Kernel 슬롯 값, #652·#655·#657) 서브패스는 앱 `main.tsx`만, `/mock`은 앱 mock 조립 `src/dev/mock-assembly.tsx`(`pnpm gen:menu`가 `MOCK_ENDPOINTS` 마커 영역에 등록)만 import 가능 — 서버 적합성 테스트는 그 `MOCK_ENDPOINTS`를 읽는다. lint가 강제, 운영 빌드에는 실리지 않는다.
- `@ap/menu-*`끼리 서로 import하지 않는다. 교차 메뉴 이동은 `linkTo(menuId)`뿐이다(06 §22).
- 표 엔진(`@tanstack/*` 4종)은 `@ap/components` 내부다. 메뉴는 `PlatformColumn<T>`·`PageSort[]`만 쓴다(lint `TABLE_ENGINE_PACKAGES`가 강제, `src/mock/**` 포함).
- 메뉴 `src/mock/**`에는 mock handler를 두고 `@ap/mock-server`·`@ap/contracts`·자기 `src/endpoints.ts`만 import한다(react 금지, 상대 import는 자기 `src/mock/**`·`src/endpoints`로 한정 — lint `ap/no-menu-mock-import`가 강제). 화면과 서버가 함께 쓰는 순수 계약(코덱·지표 버전 해석)은 `src/endpoints.ts`에 둔다. handler는 앱 `src/dev/mock-assembly.tsx`의 `MOCK_ENDPOINTS`(생성기 마커)가 `@ap/menu-<g>/mock`으로 등록한다(운영 빌드 제외, ADR-0009).
- 조회 패턴의 기준 구현은 `@ap/menu-analytics`다(`productivity-overview` = apply 경로, `execution-detail` = 모든 Context `reference`).
- 표 내보내기·복사는 `PlatformDataTable`이 소유한다([components/AGENTS.md](../packages/sdk/components/AGENTS.md), 06 §15). 메뉴는 `exportRows`·`exportNote`·`exportFilterSummary`만 주고, 내보내기 엔드포인트는 행 배열 + `limits.maxRows`로 `src/endpoints.ts`에 선언한다. 렌더 게이트로 전체 목록을 읽지 않는다.
- 화면이 없는 그룹도 계획 메뉴의 manifest로 자기 그룹을 소유한다. `component` 없는 항목에 화면을 얹는 것이 이 패키지 분리의 목적이 아니다 — 새 화면 추가는 별도 요청·검증(06 §5, §29)이 필요하다.
- 페이지는 `@ap/contracts`·`@ap/kernel`·`@ap/components`·`@ap/ui`(공개 진입점만)와 자기 `src/endpoints.ts`를 import할 수 있다. 기간 계산 `periodHours`·`bucketStart`는 `@ap/contracts`(`period.ts`)에서, 표시용 상수는 자기 `src/endpoints.ts`에서 가져온다. mock handler의 의존은 위 `src/mock/**` 규칙을 따른다. 앱(`apps/*`)과 다른 `@ap/menu-*`는 import하지 않는다(패키지 경계 §3).

## 새 그룹 패키지

새 그룹은 사람이 먼저 `GROUPS` 행(`apps/platform-web/src/menus.ts`, id는 `groupId('…')`)을 추가한 뒤(계약 패키지는 고치지 않는다, ADR-0072. 패키지는 자기 그룹·권한을 `const GROUP = groupId('…')`·`menuPermission('…')` 한 곳에 쓰고 새 권한은 앱의 `PERMISSIONS`에도 선언한다) `pnpm gen:menu <group> --label-ko … --label-en …`, `pnpm install` 순으로 만든다(생성물·배선은 [tooling/AGENTS.md](../tooling/AGENTS.md)). 생성기는 `GROUPS` 행의 `space`에 따라 `menus/<space>/<group>/`에 만든다. `space: null`이거나 `--platform`을 주면 한 단계 `platform/<group>/`에 만든다(플랫폼 기능, `platform/AGENTS.md`). `menus/` 아래 폴더 공간은 `repo-invariants`가 `GROUPS`의 `space`와 일치하는지 검사한다([ADR-0031](../docs/adr/0031-menu-folders-by-space.md)). `platform/`은 폴더 이름으로 공간을 정하지 않는다. `SPACES` 목록은 앱 조립 지점에서 관리한다. 결과는 스켈레톤이지 Domain Done이 아니며 메뉴를 여러 개 한 번에 생성하지 않는다. `overview`는 `platform/home`이 소유한다.

## 검증

- `pnpm --filter @ap/menu-<group> test`로 좁혀 본 뒤 루트 검사(루트 `AGENTS.md`). `test` 스크립트(vitest)는 계획 메뉴만 가진 패키지(`@ap/menu-master-data`, `menus/log-dev/*`, `menus/improvement/*`)를 뺀 모든 메뉴 패키지에 있다. 화면이 바뀌면 `pnpm dev`로 브라우저에서 확인한다. lint상 `@ap/mock-server`를 import하는 메뉴 파일은 `src/mock/**`뿐이며, 테스트(`*.test.ts`)도 이 규칙의 면제 대상이 아니다.

다음 단계: 화면 작성법은 [apps/platform-web README "페이지 작성 가이드"](../apps/platform-web/README.md#페이지-작성-가이드-consumer-규칙), 메뉴 선언 계약은 06 §5.
