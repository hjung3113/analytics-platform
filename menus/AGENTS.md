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
- 메뉴의 `src/mock/**`에는 mock handler를 두고 `@ap/mock-server`, `@ap/contracts`, 자기 `src/endpoints.ts`를 import할 수 있다(react·react-dom는 금지). 이행 중에는 `src/api.ts`도 `@ap/mock-server`를 import할 수 있다. 예외로 `src/mock/**`에서 자기 `../pages/**` 상대 import는 임시 허용이다 — 5단계에서 `jobs-population` 테스트가 `src/mock/**`로 이동할 때까지이며, 그 후 닫는다. `src/pages/**`와 `src/mock/**` 밖의 메뉴 파일은 `mock/`을 상대 import하지 않는다 — 앱 `main.tsx`가 `@ap/menu-<g>/mock`을 통해 handler를 등록한다.
- `serve`를 메뉴 `api`에서 새로 import하거나 재export하지 않는다(레거시 파일도 재export는 금지 — 레거시 면제는 import에만 적용된다). 허용된 레거시 페이지 경로 목록(패키지 한정 키)은 `tooling/eslint/src/index.js`의 `LEGACY_SERVE_PATHS` 한 곳에 있고, 이행 단계에서 줄여 제거한다.
- 화면이 없는 그룹도 계획 메뉴의 manifest로 자기 그룹을 소유한다. `component` 없는 항목에 화면을 얹는 것이 이 패키지 분리의 목적이 아니다 — 새 화면 추가는 별도 요청·검증(06 §5, §29)이 필요하다.
- 페이지는 `@ap/contracts`·`@ap/kernel`·`@ap/components`·`@ap/ui`(공개 진입점만)와 자기 `src/endpoints.ts`를 import할 수 있다. mock handler의 의존은 위 `src/mock/**` 규칙을 따른다. 앱(`apps/*`)과 다른 `@ap/menu-*`는 import하지 않는다(패키지 경계 §3). Node API를 쓰지 않는 메뉴 패키지에 `@types/node`를 선언하지 않는다(의존 방향·호스트 타입은 루트 `AGENTS.md`).

## 새 그룹 패키지

새 그룹은 사람이 먼저 `GroupId` 리터럴(`packages/contracts/src/menu.ts`)과 `GROUPS` 행(라벨·아이콘·공간 `space` — 06 §9.1, `apps/platform-web/src/menus.ts`)을 추가한 뒤 `pnpm gen:menu <group> --label-ko … --label-en …`을 돌리고 `pnpm install`한다. 결과는 스켈레톤이지 Domain Done이 아니므로, 이후 화면 작업은 별도 요청·검증(06 §29)으로 진행한다. 실제 메뉴를 여러 개 한 번에 생성하지 않는다. `overview`는 `menus/home`이 그대로 소유한다.

## 검증

루트 네 명령(`pnpm lint && pnpm typecheck && pnpm test && pnpm build`, 루트 `AGENTS.md`). `test` 스크립트(vitest)는 `@ap/menu-master-data`를 뺀 모든 메뉴 패키지에 있다. 화면이 바뀌면 `pnpm dev`로 브라우저에서 확인한다. lint상 `src/api.ts`가 그 패키지에서 `@ap/mock-server`를 import하는 유일한 파일이며, 테스트(`*.test.ts`)도 이 규칙의 면제 대상이 아니다.

다음 단계: 화면 작성법은 [apps/platform-web README "페이지 작성 가이드"](../apps/platform-web/README.md#페이지-작성-가이드-consumer-규칙), 메뉴 선언 계약은 06 §5.
