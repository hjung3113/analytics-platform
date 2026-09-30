# menus/ — 메뉴 Consumer 패키지

Registry 7개 그룹마다 하나의 패키지(`@ap/menu-<group>`)다. 메뉴가 `manifests`를 선언하고, 앱(`apps/platform-web/src/menus.ts`)이 이어 붙여 Kernel에 등록한다. 메뉴 화면은 플랫폼 다섯 갈래(루트 `AGENTS.md`)를 검증하는 Consumer다.

| 패키지 | 그룹 | 화면 |
| --- | --- | --- |
| `@ap/menu-home` | `overview` | OperationsHome |
| `@ap/menu-equipment` | `equipment` | EquipmentMaster, EquipmentDetail |
| `@ap/menu-master-data` | `masterData` | 없음(계획 메뉴 manifest만) |
| `@ap/menu-analytics` | `analytics` | ProductivityOverview, CycleTimeDrilldown, ExecutionDetail + Wafer Journey(계획) |
| `@ap/menu-metrics` | `metrics` | MetricCatalog, MetricDetail |
| `@ap/menu-notice-voc` | `noticeVoc` | MyVocHistory(내 VOC, #60) + 공지(계획) |
| `@ap/menu-admin` | `admin` | AccessDirectory(권한/역할 조회 전용, #49), AuditTrail(변경 감사, #50), UsageOverview, RegistryCatalog |

## 규칙

- `src/index.ts`는 `manifests: MenuEntry[]`만 export한다. 페이지·집계(`METRICS`, `resolveMetric` 등)를 재export하지 않는다 — 앱이 `manifests`만 import해도 라우트 lazy가 깨지지 않아야 한다. 앱이 메뉴에 설정값을 넣어야 하면 index가 아니라 별도 서브패스로 내보낸다(예: `@ap/menu-notice-voc/feedbackops-origin`, `@ap/menu-<g>/mock`; 앱 `main.tsx`만 import 가능 — lint가 강제).
- `@ap/menu-*`끼리 서로 import하지 않는다. 교차 메뉴 이동은 `linkTo(menuId)`뿐이다(06 §22).
- 메뉴의 `src/mock/**`에는 mock handler를 두고 `@ap/mock-server`, `@ap/contracts`, 자기 `src/endpoints.ts`를 import할 수 있다(react·react-dom는 금지). 이행 중에는 `src/api.ts`도 `@ap/mock-server`를 import할 수 있다. 상대 import는 lint 강제 허용목록으로 제한된다 — `src/mock/**` 안에서 resolve 대상이 자기 `src/mock/**`, 자기 `src/endpoints`, (임시) 자기 `src/pages/**` 중 하나일 때만 허용되고, 그 외(`../api`, `../index`, `../../package.json` 등)는 에러다. 즉 mock handler는 메뉴 내부 모듈(`../api` 등)이 아니라 `@ap/mock-server`·`@ap/contracts`를 직접 import한다. 예외로 `src/mock/**`에서 자기 `../pages/**` 상대 import는 임시 허용이다 — `jobs-population` 테스트가 5단계에서 `src/mock/**`로 이동했고 `execution-detail` handler(`mock/execution.ts`가 `pages/cycleData.ts`의 `lookupOccurrence`를 import)도 마찬가지로 `cycleData` 계산이 9단계에 옮겨올 때까지 필요하므로 그때 같이 닫는다. `src/pages/**`와 `src/mock/**` 밖의 메뉴 파일은 `mock/`을 상대 import하지 않는다 — 앱 `main.tsx`가 `@ap/menu-<g>/mock`을 통해 handler를 등록한다.
- 이 패턴의 첫 소비자는 `@ap/menu-analytics`다 — `productivity-overview` 화면이 `src/endpoints.ts`(엔드포인트 선언 + 클라이언트 타입·상수)과 `src/mock/`(계산·핸들러, `package.json`의 `./mock` export)로 조회한다(#114). 두 번째 소비자인 `execution-detail`은 모든 Context가 `reference`인 경로다: 목적지 ID와 화면이 해석한 metric version을 params로 보내고, Context 필터는 적용하지 않는다(#115). `cycle-time`은 9단계 이전까지 `src/api.ts`의 `serve`를 쓴다.
- `serve`를 메뉴 `api`에서 새로 import하거나 재export하지 않는다(레거시 파일도 재export는 금지 — 레거시 면제는 import에만 적용된다). 별칭도 추적한다 — `import { serve as x }`로 만든 지역 바인딩을 `export { x }`, `export { x as y }`, `export default x`로 내보내면 어떤 파일(레거시 포함)에서든 에러다. 허용된 레거시 페이지 경로 목록(패키지 한정 키)은 `tooling/eslint/src/index.js`의 `LEGACY_SERVE_PATHS` 한 곳에 있고, 이행 단계에서 줄여 제거한다.
- 화면이 없는 그룹도 계획 메뉴의 manifest로 자기 그룹을 소유한다. `component` 없는 항목에 화면을 얹는 것이 이 패키지 분리의 목적이 아니다 — 새 화면 추가는 별도 요청·검증(06 §5, §29)이 필요하다.
- 페이지는 `@ap/contracts`·`@ap/kernel`·`@ap/components`·`@ap/ui`(공개 진입점만)와 자기 `src/endpoints.ts`를 import할 수 있다. 이행 중 이전한 페이지도 `../api`의 표시용 상수·`periodHours`는 쓸 수 있다(11단계에서 contracts로 옮기거나 제거). mock handler의 의존은 위 `src/mock/**` 규칙을 따른다. 앱(`apps/*`)과 다른 `@ap/menu-*`는 import하지 않는다(패키지 경계 §3). Node API를 쓰지 않는 메뉴 패키지에 `@types/node`를 선언하지 않는다(의존 방향·호스트 타입은 루트 `AGENTS.md`).

## 새 그룹 패키지

새 그룹은 사람이 먼저 `GroupId` 리터럴(`packages/contracts/src/menu.ts`)과 `GROUPS` 행(라벨·아이콘·공간 `space` — 06 §9.1, `apps/platform-web/src/menus.ts`)을 추가한 뒤 `pnpm gen:menu <group> --label-ko … --label-en …`을 돌리고 `pnpm install`한다. 결과는 스켈레톤이지 Domain Done이 아니므로, 이후 화면 작업은 별도 요청·검증(06 §29)으로 진행한다. 실제 메뉴를 여러 개 한 번에 생성하지 않는다. `overview`는 `menus/home`이 그대로 소유한다.

## 검증

- 루트 네 명령(`pnpm lint && pnpm typecheck && pnpm test && pnpm build`, 루트 `AGENTS.md`). `test` 스크립트(vitest)는 `@ap/menu-master-data`를 뺀 모든 메뉴 패키지에 있다. 화면이 바뀌면 `pnpm dev`로 브라우저에서 확인한다. lint상 `@ap/mock-server`를 import하는 메뉴 파일은 `src/mock/**`과 이행 중인 `src/api.ts`뿐이며, 테스트(`*.test.ts`)도 이 규칙의 면제 대상이 아니다.

다음 단계: 화면 작성법은 [apps/platform-web README "페이지 작성 가이드"](../apps/platform-web/README.md#페이지-작성-가이드-consumer-규칙), 메뉴 선언 계약은 06 §5.
