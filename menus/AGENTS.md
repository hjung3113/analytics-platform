# menus/ — 메뉴 Consumer 패키지

Registry 7개 그룹마다 하나의 패키지(`@ap/menu-<group>`)다. 메뉴가 `manifests`를 선언하고, 앱(`apps/platform-web/src/menus.ts`)이 이어 붙여 Kernel에 등록한다. 메뉴 화면은 플랫폼 다섯 갈래(루트 `AGENTS.md`)를 검증하는 Consumer다.

| 패키지 | 그룹 | 화면 |
| --- | --- | --- |
| `@ap/menu-home` | `overview` | OperationsHome |
| `@ap/menu-equipment` | `equipment` | EquipmentMaster, EquipmentDetail |
| `@ap/menu-master-data` | `masterData` | 없음(계획 메뉴 manifest만) |
| `@ap/menu-analytics` | `analytics` | ProductivityOverview, CycleTimeDrilldown, ExecutionDetail + Wafer Journey(계획) |
| `@ap/menu-metrics` | `metrics` | MetricCatalog, MetricDetail |
| `@ap/menu-notice-voc` | `noticeVoc` | MyVocHistory(내 VOC, #60 — 조회는 메뉴 엔드포인트 `noticeVoc.myVocHistory`·`mySurveyHistory`, #131) + 공지(계획) |
| `@ap/menu-admin` | `admin` | AccessDirectory(권한/역할 조회 전용, #49), AuditTrail(변경 감사, #50), UsageOverview, RegistryCatalog |

## 규칙

- `src/index.ts`는 `manifests: MenuEntry[]`만 export한다. 페이지·집계(`METRICS`, `resolveMetric` 등)를 재export하지 않는다 — 앱이 `manifests`만 import해도 라우트 lazy가 깨지지 않아야 한다. 앱이 메뉴에 설정값을 넣어야 하면 index가 아니라 별도 서브패스로 내보낸다(예: `@ap/menu-notice-voc/feedbackops-origin`, `@ap/menu-<g>/mock`; origin 서브패스는 앱 `main.tsx`만, `/mock`은 앱 mock 조립 `src/dev/mock-assembly.tsx`(`pnpm gen:menu`가 마커 영역에 등록)와 서버 적합성 테스트만 import 가능 — lint가 강제, 운영 빌드에는 실리지 않는다(#153).
- `@ap/menu-*`끼리 서로 import하지 않는다. 교차 메뉴 이동은 `linkTo(menuId)`뿐이다(06 §22).
- 표 엔진(`@tanstack/react-table`·`@tanstack/react-virtual`·`@tanstack/table-core`·`@tanstack/virtual-core`, 하위 경로 포함 — 목록 원본은 `tooling/eslint/src/index.js` `TABLE_ENGINE_PACKAGES`)은 `@ap/components` 내부이므로 메뉴가 import하지 않는다(#160, `src/mock/**` 포함) — 열은 `PlatformDataTable`의 `PlatformColumn<T>`로 선언하고, 정렬 상태는 `@ap/contracts`의 `PageSort[]`를 쓴다. 경계 lint(`tooling/eslint` 메뉴 프리셋)가 강제한다.
- 메뉴의 `src/mock/**`에는 mock handler를 두고 `@ap/mock-server`, `@ap/contracts`, 자기 `src/endpoints.ts`를 import할 수 있다(react·react-dom는 금지). 이행 중에 쓰던 `src/api.ts`와 lint 예외는 없어졌다(#129·#132) — `@ap/mock-server`는 `src/mock/**`에서만 import한다. 상대 import는 lint 강제 허용목록으로 제한된다 — `src/mock/**` 안에서 resolve 대상이 자기 `src/mock/**` 또는 자기 `src/endpoints`일 때만 허용되고, 그 외(`../pages`, `../api`, `../index`, `../../package.json` 등)는 에러다(5단계의 `../pages` 임시 허용은 #127에서 닫았다). 즉 mock handler는 메뉴 내부 모듈이 아니라 `@ap/mock-server`·`@ap/contracts`를 직접 import하고, 화면과 서버가 함께 쓰는 순수 계약(지표 버전 해석·anchor·bin 같은 코덱)은 `src/endpoints.ts`에 둔다. `src/pages/**`와 `src/mock/**` 밖의 메뉴 파일은 `mock/`을 상대 import하지 않는다 — 앱 `main.tsx`가 `@ap/menu-<g>/mock`을 통해 handler를 등록한다.
- 이 패턴의 첫 소비자는 `@ap/menu-analytics`다 — `productivity-overview` 화면이 `src/endpoints.ts`(엔드포인트 선언 + 클라이언트 타입·상수)과 `src/mock/`(계산·핸들러, `package.json`의 `./mock` export)로 조회한다(#114). 두 번째 소비자인 `execution-detail`은 모든 Context가 `reference`인 경로다: 목적지 ID와 화면이 해석한 metric version을 params로 보내고, Context 필터는 적용하지 않는다(#115). `cycle-time`은 표 페이지·내보내기를 Kernel `useMenuFetch`로 부르고, 지표 버전은 서버가 적용된 metric 쌍에서 해석한다(#127). `equipment-master`(#128)·`home`(#130)·`metrics`(#129)도 이전했다 — `home` 공지는 엔드포인트 권한 `notice:view`가 메뉴 권한 `platform:view`와 다른 사례이고, `metrics`는 전역 지표 쌍을 서버가 카탈로그로 판정한다(06 §6.1). 이제 `serve`를 쓰는 화면은 없다(`LEGACY_SERVE_PATHS` 비어 있음).
- 표 내보내기를 메뉴가 직접 만들지 않는다(#173): 화면은 `PlatformDataTable`에 `exportRows`(선택 ids·필터 전체를 서버에서 읽는 법 — 요청에 표의 활성 정렬 `sorting`이 함께 실려 내보내기 순서 = 화면 순서)와 `exportNote`, XLSX "조회 정보"용 페이지 필터 요약 `exportFilterSummary`만 주고, CSV·Excel 직렬화·파일 다운로드·outcome 토스트는 표가 소유한다. 내보내기 엔드포인트는 행 배열을 돌려주게 `src/endpoints.ts`에 선언하고 `limits.maxRows`를 붙인다. 렌더 게이트로 전체 목록을 읽지 않는다 — 선택지 같은 작은 값은 별도 엔드포인트(예: `equipment.master.makers`)로 받는다.
- 화면이 없는 그룹도 계획 메뉴의 manifest로 자기 그룹을 소유한다. `component` 없는 항목에 화면을 얹는 것이 이 패키지 분리의 목적이 아니다 — 새 화면 추가는 별도 요청·검증(06 §5, §29)이 필요하다.
- 페이지는 `@ap/contracts`·`@ap/kernel`·`@ap/components`·`@ap/ui`(공개 진입점만)와 자기 `src/endpoints.ts`를 import할 수 있다. 기간 계산 `periodHours`·`bucketStart`는 `@ap/contracts`(`period.ts`)에서, 표시용 상수는 자기 `src/endpoints.ts`에서 가져온다. mock handler의 의존은 위 `src/mock/**` 규칙을 따른다. 앱(`apps/*`)과 다른 `@ap/menu-*`는 import하지 않는다(패키지 경계 §3). Node API를 쓰지 않는 메뉴 패키지에 `@types/node`를 선언하지 않는다(의존 방향·호스트 타입은 루트 `AGENTS.md`).

## 새 그룹 패키지

새 그룹은 사람이 먼저 `GroupId` 리터럴(`packages/contracts/src/menu.ts`)과 `GROUPS` 행(라벨·아이콘·공간 `space` — 06 §9.1, `apps/platform-web/src/menus.ts`)을 추가한 뒤 `pnpm gen:menu <group> --label-ko … --label-en …`을 돌리고 `pnpm install`한다. 생성 패키지는 menu-query 패턴으로 시작한다(#126) — `src/endpoints.ts`(표본 엔드포인트 1개, manifest와 같은 권한), `src/mock/index.ts`(`./mock` export), 페이지의 `useMenuQuery` 호출, 앱 mock 조립 `apps/platform-web/src/dev/mock-assembly.tsx` 마커 영역의 mock 등록(#153 — 운영 빌드에는 실리지 않는다). `src/api.ts`/`serve`는 더 이상 생성되지 않는다. 결과는 스켈레톤이지 Domain Done이 아니므로, 이후 화면 작업은 별도 요청·검증(06 §29)으로 진행한다. 실제 메뉴를 여러 개 한 번에 생성하지 않는다. `overview`는 `menus/home`이 그대로 소유한다.

## 검증

- 루트 네 명령(`pnpm lint && pnpm typecheck && pnpm test && pnpm build`, 루트 `AGENTS.md`). `test` 스크립트(vitest)는 `@ap/menu-master-data`를 뺀 모든 메뉴 패키지에 있다. 화면이 바뀌면 `pnpm dev`로 브라우저에서 확인한다. lint상 `@ap/mock-server`를 import하는 메뉴 파일은 `src/mock/**`뿐이며, 테스트(`*.test.ts`)도 이 규칙의 면제 대상이 아니다.

다음 단계: 화면 작성법은 [apps/platform-web README "페이지 작성 가이드"](../apps/platform-web/README.md#페이지-작성-가이드-consumer-규칙), 메뉴 선언 계약은 06 §5.
