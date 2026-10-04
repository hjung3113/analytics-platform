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

- `src/index.ts`는 `manifests: MenuEntry[]`만 export한다. 페이지·집계(`METRICS`, `resolveMetric` 등)를 재export하지 않는다 — 앱이 `manifests`만 import해도 라우트 lazy가 깨지지 않아야 한다. 앱이 메뉴에 설정값을 넣어야 하면 index가 아니라 별도 서브패스로 내보낸다(예: `@ap/menu-notice-voc/feedbackops-origin`, `@ap/menu-<g>/mock`; origin 서브패스는 앱 `main.tsx`만, `/mock`은 앱 mock 조립 `src/dev/mock-assembly.tsx`(`pnpm gen:menu`가 `MOCK_ENDPOINTS` 마커 영역에 등록)만 import 가능 — 서버 적합성 테스트는 그 `MOCK_ENDPOINTS`를 읽는다. lint가 강제, 운영 빌드에는 실리지 않는다.
- `@ap/menu-*`끼리 서로 import하지 않는다. 교차 메뉴 이동은 `linkTo(menuId)`뿐이다(06 §22).
- 표 엔진(`@tanstack/*` 4종)은 `@ap/components` 내부다. 메뉴는 `PlatformColumn<T>`·`PageSort[]`만 쓴다(lint `TABLE_ENGINE_PACKAGES`가 강제, `src/mock/**` 포함).
- 메뉴 `src/mock/**`에는 mock handler를 두고 `@ap/mock-server`·`@ap/contracts`·자기 `src/endpoints.ts`만 import한다(react 금지, 상대 import는 자기 `src/mock/**`·`src/endpoints`로 한정 — lint `ap/no-menu-mock-import`가 강제). 화면과 서버가 함께 쓰는 순수 계약(코덱·지표 버전 해석)은 `src/endpoints.ts`에 둔다. handler는 앱 `src/dev/mock-assembly.tsx`의 `MOCK_ENDPOINTS`(생성기 마커)가 `@ap/menu-<g>/mock`으로 등록한다(운영 빌드 제외, ADR-0009).
- 조회 패턴의 기준 구현은 `@ap/menu-analytics`다(`productivity-overview` = apply 경로, `execution-detail` = 모든 Context `reference`).
- 표 내보내기·복사는 `PlatformDataTable`이 소유한다([components/AGENTS.md](../packages/components/AGENTS.md), 06 §15). 메뉴는 `exportRows`·`exportNote`·`exportFilterSummary`만 주고, 내보내기 엔드포인트는 행 배열 + `limits.maxRows`로 `src/endpoints.ts`에 선언한다. 렌더 게이트로 전체 목록을 읽지 않는다.
- 화면이 없는 그룹도 계획 메뉴의 manifest로 자기 그룹을 소유한다. `component` 없는 항목에 화면을 얹는 것이 이 패키지 분리의 목적이 아니다 — 새 화면 추가는 별도 요청·검증(06 §5, §29)이 필요하다.
- 페이지는 `@ap/contracts`·`@ap/kernel`·`@ap/components`·`@ap/ui`(공개 진입점만)와 자기 `src/endpoints.ts`를 import할 수 있다. 기간 계산 `periodHours`·`bucketStart`는 `@ap/contracts`(`period.ts`)에서, 표시용 상수는 자기 `src/endpoints.ts`에서 가져온다. mock handler의 의존은 위 `src/mock/**` 규칙을 따른다. 앱(`apps/*`)과 다른 `@ap/menu-*`는 import하지 않는다(패키지 경계 §3).

## 새 그룹 패키지

새 그룹은 사람이 먼저 `GroupId`(`packages/contracts/src/menu.ts`)와 `GROUPS` 행(`apps/platform-web/src/menus.ts`)을 추가한 뒤 `pnpm gen:menu <group> --label-ko … --label-en …`, `pnpm install` 순으로 만든다(생성물·배선은 [tooling/AGENTS.md](../tooling/AGENTS.md)). 결과는 스켈레톤이지 Domain Done이 아니며 메뉴를 여러 개 한 번에 생성하지 않는다. `overview`는 `menus/home`이 소유한다.

## 검증

- `pnpm --filter @ap/menu-<group> test`로 좁혀 본 뒤 루트 검사(루트 `AGENTS.md`). `test` 스크립트(vitest)는 `@ap/menu-master-data`를 뺀 모든 메뉴 패키지에 있다. 화면이 바뀌면 `pnpm dev`로 브라우저에서 확인한다. lint상 `@ap/mock-server`를 import하는 메뉴 파일은 `src/mock/**`뿐이며, 테스트(`*.test.ts`)도 이 규칙의 면제 대상이 아니다.

다음 단계: 화면 작성법은 [apps/platform-web README "페이지 작성 가이드"](../apps/platform-web/README.md#페이지-작성-가이드-consumer-규칙), 메뉴 선언 계약은 06 §5.
