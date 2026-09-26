# menus/ — 메뉴 Consumer 패키지

Registry 7개 그룹마다 하나의 패키지(`@ap/menu-<group>`)다. 메뉴가 `manifests`를 선언하고, 앱(`apps/platform-web/src/menus.ts`)이 이어 붙여 Kernel에 등록한다. 메뉴 화면은 플랫폼 다섯 갈래(루트 `AGENTS.md`)를 검증하는 Consumer다.

| 패키지 | 그룹 | 화면 |
| --- | --- | --- |
| `@ap/menu-home` | `overview` | OperationsHome |
| `@ap/menu-equipment` | `equipment` | EquipmentMaster, EquipmentDetail |
| `@ap/menu-master-data` | `masterData` | 없음(계획 메뉴 manifest만) |
| `@ap/menu-analytics` | `analytics` | ProductivityOverview, CycleTimeDrilldown, ExecutionDetail + Wafer Journey(계획) |
| `@ap/menu-metrics` | `metrics` | MetricCatalog, MetricDetail |
| `@ap/menu-notice-voc` | `noticeVoc` | 없음(공지·VOC 계획) |
| `@ap/menu-admin` | `admin` | 없음(관리 3종 계획) |

## 규칙

- `src/index.ts`는 `manifests: MenuEntry[]`만 export한다. 페이지·집계(`METRICS`, `resolveMetric` 등)를 재export하지 않는다 — 앱이 `manifests`만 import해도 라우트 lazy가 깨지지 않아야 한다.
- `@ap/menu-*`끼리 서로 import하지 않는다. 교차 메뉴 이동은 `linkTo(menuId)`뿐이다(06 §22).
- `@ap/mock-server`는 그 패키지의 `src/api.ts` 한 파일만 import한다. `src/pages/*`는 `../api`를 import한다.
- 화면이 없는 그룹도 계획 메뉴의 manifest로 자기 그룹을 소유한다. `component` 없는 항목에 화면을 얹는 것이 이 패키지 분리의 목적이 아니다 — 새 화면 추가는 별도 요청·검증(06 §5, §29)이 필요하다.
- import 가능: `@ap/contracts`·`@ap/kernel`·`@ap/components`·`@ap/ui`(공개 진입점만) + `api.ts`에 한해 `@ap/mock-server`. 앱(`apps/*`)과 다른 `@ap/menu-*`는 import하지 않는다(패키지 경계 §3).
- 알려진 debt: `home`·`equipment`·`analytics`·`metrics`가 `@types/node`를 devDependency로 선언한다. `@ap/ui` `Button.tsx`의 `process.env` 때문에 타입 그래프에 `@types/node`가 필요하다(기존 소비자 `@ap/shell`·앱과 같은 패턴). `@ap/ui`가 이 의존을 없애면 네 패키지에서 함께 뺀다.

## 검증

루트에서 `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. `test` 스크립트(vitest)는 `@ap/menu-analytics`·`@ap/menu-metrics`(node 환경)와 `@ap/menu-home`(jsdom, 공지 닫기 수명)에만 있다. 화면이 바뀌면 `pnpm dev`로 브라우저에서 확인한다. lint상 `src/api.ts`가 그 패키지에서 `@ap/mock-server`를 import하는 유일한 파일이며, 테스트(`*.test.ts`)도 이 규칙의 면제 대상이 아니다.

다음 단계: 화면 작성법은 [apps/platform-web README "페이지 작성 가이드"](../apps/platform-web/README.md#페이지-작성-가이드-consumer-규칙), 메뉴 선언 계약은 06 §5.
