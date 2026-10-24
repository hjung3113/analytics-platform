# menus/ — 메뉴 Consumer 패키지

Registry 그룹마다 하나의 패키지(`@ap/menu-<group>`)다. 메뉴가 `manifests`를 선언하고, 앱(`apps/platform-web/src/menus.ts`)이 이어 붙여 Kernel에 등록한다. 메뉴 화면은 플랫폼 다섯 갈래(루트 `AGENTS.md`)를 검증하는 Consumer다.

| 패키지 | 폴더 | 그룹 | 화면 |
| --- | --- | --- | --- |
| `@ap/menu-home` | `menus/_global/home` | `overview` | OperationsHome(홈 `내 할 일`은 Kernel 슬롯 `homeTodo`로만 온다 — 홈은 `@fops/*`도 다른 메뉴도 import하지 않는다, #657) |
| `@ap/menu-equipment` | `menus/analytics/equipment` | `equipment` | EquipmentMaster, EquipmentDetail |
| `@ap/menu-master-data` | `menus/analytics/master-data` | `masterData` | 없음(계획 메뉴 manifest만) |
| `@ap/menu-analytics` | `menus/analytics/analytics` | `analytics` | ProductivityOverview, CycleTimeDrilldown, ExecutionDetail, ChartCatalog + Wafer Journey(계획) |
| `@ap/menu-hw-time` | `menus/analytics/hw-time` | `hwTime` | `HW Time 단계별`(`/hw-time/steps`, ADR-0078 — `DrillLayout fill`+`summary`, Inspector `stack`, 행 26px 상세 hero와 접히는 추세). `HW Time 비교`(`/hw-time/compare`, 레벨별 `PanelWorkspace` 프리셋 `hw-compare-l1|l2|l3`, L3는 문맥|상세 두 Frame이 `row` 페이지 키로 행 강조 공유, Inspector `rail`, `행 스크롤 보기`·`최소·최대`·`시작 위치 맞춤` 옵션). `HW Time 개요`(`/hw-time/overview`, `PanelWorkspace initialMode="stack"`, 레벨별 `hw-overview-l1|l2|l3`, 순위·단계·문맥·상세·추세·범례 패널과 `badge`(추세 행 수·일부 미측정), 범례는 패널이고 Inspector `stack`은 분석 대상·옵션). 네 메뉴가 함께 쓰는 조회 선언 `hwTime.levelRows`·`trend`·`tableRows`·`exportRows`(소유 메뉴 `hw-time-steps`), 결정적 mock, `useMenuQuery` 조회 훅, 공유 패널 `src/shared/panels/`(#690) |
| `@ap/menu-metrics` | `menus/metrics/metrics` | `metrics` | MetricCatalog, MetricDetail |
| `@ap/menu-notice-voc` | `menus/_global/notice-voc` | `noticeVoc` | 없음(공지 manifest만; 내 VOC는 `@ap/menu-my-activity`로 옮겼다, #654) |
| `@ap/menu-my-activity` | `menus/_global/my-activity` | `myActivity` | Notifications(알림 — FeedbackOps `InboxPanel`을 다리 `@fops/frontend/global-screens`로 올림, mock에서는 `실서버 필요`, ADR-0071, #651; 레일 알림 종·플랫폼 메뉴 배지의 슬롯 `notifications-slot`, #652) + MyVoc·VocDetail(내 VOC — FeedbackOps `MyVocListScreen`/`ReporterVocDetail`을 다리로 올림, `/voc`는 목록 + 셸 상세 패널 `focus`, `/voc/:vocId`는 `내 VOC` 아래 navHidden, 읽기 전용, 권한은 Kernel `voc:view`, #654) + Surveys(설문 — FeedbackOps `SurveyParticipationScreen`/`RespondSurveyScreen`을 다리로 올림, `/surveys/:surveyId/respond`는 `설문` 아래 navHidden, #653) + 권한 요청(FeedbackOps `PermissionRequestsScreen`을 다리로 올림 — 요청·내 요청 상태·철회, mock에서는 `실서버 필요`, 권한은 `platform:view`, ADR-0070, #657) + 홈 `내 할 일`(슬롯 `home-todo-slot` — FeedbackOps `HomeTodoPanel`을 다리로 올림, 세션이 `ready`일 때만 그린다: mock·세션 전·401 뒤에는 아무것도 없다, #657 2부). 이 패키지만 `@fops/frontend/global-screens`와 `/core`(영구 로드 코드용 부분집합)를 import할 수 있다(패키지 경계 규칙 8의 예외) |
| `@ap/menu-clas` | `menus/clas/clas` | `clas` | OperationTime |
| `@ap/menu-admin` | `menus/operations/admin` | `admin` | AccessDirectory(권한/역할 조회 전용, #49), AuditTrail(변경 감사, #50), UsageOverview, RegistryCatalog |
| `@ap/menu-log-my-work`·`-log-models`·`-log-cross`·`-log-rules` | `menus/log-dev/*` | `logMyWork`·`logModels`·`logCross`·`logRules` | 없음(계획 메뉴 manifest만, ADR-0065) |
| `@ap/menu-imp-my-work`·`-imp-tasks`·`-imp-reports` | `menus/improvement/*` | `impMyWork`·`impTasks`·`impReports` | 없음(계획 메뉴 manifest만, ADR-0065) |

## 규칙

- `src/index.ts`는 `manifests: MenuEntry[]`만 export한다. 페이지·집계(`METRICS`, `resolveMetric` 등)를 재export하지 않는다 — 앱이 `manifests`만 import해도 라우트 lazy가 깨지지 않아야 한다. 앱이 메뉴에 설정값을 넣어야 하면 index가 아니라 별도 서브패스로 내보낸다(예: `@ap/menu-my-activity/fo-api`, `@ap/menu-my-activity/notifications-slot`, `@ap/menu-<g>/mock`; origin·`fo-api`·`notifications-slot`·`voc-compose-slot`·`home-todo-slot`(다리를 import하는 Kernel 슬롯 값, #652·#655·#657) 서브패스는 앱 `main.tsx`만, `/mock`은 앱 mock 조립 `src/dev/mock-assembly.tsx`(`pnpm gen:menu`가 `MOCK_ENDPOINTS` 마커 영역에 등록)만 import 가능 — 서버 적합성 테스트는 그 `MOCK_ENDPOINTS`를 읽는다. lint가 강제, 운영 빌드에는 실리지 않는다.
- `@ap/menu-*`끼리 서로 import하지 않는다. 교차 메뉴 이동은 `linkTo(menuId)`뿐이다(06 §22).
- 표 엔진(`@tanstack/*` 4종)은 `@ap/components` 내부다. 메뉴는 `PlatformColumn<T>`·`PageSort[]`만 쓴다(lint `TABLE_ENGINE_PACKAGES`가 강제, `src/mock/**` 포함).
- 메뉴 `src/mock/**`에는 mock handler를 두고 `@ap/mock-server`·`@ap/contracts`·자기 `src/endpoints.ts`만 import한다(react 금지, 상대 import는 자기 `src/mock/**`·`src/endpoints`로 한정 — lint `ap/no-menu-mock-import`가 강제). 화면과 서버가 함께 쓰는 순수 계약(코덱·지표 버전 해석)은 `src/endpoints.ts`에 둔다. handler는 앱 `src/dev/mock-assembly.tsx`의 `MOCK_ENDPOINTS`(생성기 마커)가 `@ap/menu-<g>/mock`으로 등록한다(운영 빌드 제외, ADR-0009).
- 조회 패턴의 기준 구현은 `@ap/menu-analytics`다(`productivity-overview` = apply 경로, `execution-detail` = 모든 Context `reference`).
- 표 내보내기·복사는 `PlatformDataTable`이 소유한다([components/AGENTS.md](../packages/components/AGENTS.md), 06 §15). 메뉴는 `exportRows`·`exportNote`·`exportFilterSummary`만 주고, 내보내기 엔드포인트는 행 배열 + `limits.maxRows`로 `src/endpoints.ts`에 선언한다. 렌더 게이트로 전체 목록을 읽지 않는다.
- 화면이 없는 그룹도 계획 메뉴의 manifest로 자기 그룹을 소유한다. `component` 없는 항목에 화면을 얹는 것이 이 패키지 분리의 목적이 아니다 — 새 화면 추가는 별도 요청·검증(06 §5, §29)이 필요하다.
- 페이지는 `@ap/contracts`·`@ap/kernel`·`@ap/components`·`@ap/ui`(공개 진입점만)와 자기 `src/endpoints.ts`를 import할 수 있다. 기간 계산 `periodHours`·`bucketStart`는 `@ap/contracts`(`period.ts`)에서, 표시용 상수는 자기 `src/endpoints.ts`에서 가져온다. mock handler의 의존은 위 `src/mock/**` 규칙을 따른다. 앱(`apps/*`)과 다른 `@ap/menu-*`는 import하지 않는다(패키지 경계 §3).

## 새 그룹 패키지

새 그룹은 사람이 먼저 `GROUPS` 행(`apps/platform-web/src/menus.ts`, id는 `groupId('…')`)을 추가한 뒤(계약 패키지는 고치지 않는다, ADR-0072. 패키지는 자기 그룹·권한을 `const GROUP = groupId('…')`·`menuPermission('…')` 한 곳에 쓰고 새 권한은 앱의 `PERMISSIONS`에도 선언한다) `pnpm gen:menu <group> --label-ko … --label-en …`, `pnpm install` 순으로 만든다(생성물·배선은 [tooling/AGENTS.md](../tooling/AGENTS.md)). 생성기는 `GROUPS` 행의 `space`에 따라 `menus/<space>/<group>/`에 만들고, `space: null`은 `menus/_global/`에 둔다. 그룹 소속의 원본은 폴더이며 `repo-invariants`가 선언과 일치하는지 검사한다([ADR-0031](../docs/adr/0031-menu-folders-by-space.md)). `SPACES` 목록은 앱 조립 지점에서 관리한다. 결과는 스켈레톤이지 Domain Done이 아니며 메뉴를 여러 개 한 번에 생성하지 않는다. `overview`는 `menus/_global/home`이 소유한다.

## 검증

- `pnpm --filter @ap/menu-<group> test`로 좁혀 본 뒤 루트 검사(루트 `AGENTS.md`). `test` 스크립트(vitest)는 계획 메뉴만 가진 패키지(`@ap/menu-master-data`, `@ap/menu-notice-voc`, `menus/log-dev/*`, `menus/improvement/*`)를 뺀 모든 메뉴 패키지에 있다. 화면이 바뀌면 `pnpm dev`로 브라우저에서 확인한다. lint상 `@ap/mock-server`를 import하는 메뉴 파일은 `src/mock/**`뿐이며, 테스트(`*.test.ts`)도 이 규칙의 면제 대상이 아니다.

다음 단계: 화면 작성법은 [apps/platform-web README "페이지 작성 가이드"](../apps/platform-web/README.md#페이지-작성-가이드-consumer-규칙), 메뉴 선언 계약은 06 §5.
