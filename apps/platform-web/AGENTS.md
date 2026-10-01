# apps/platform-web — 조립 지점

플랫폼 패키지를 조립하고 mock 서버를 두는 앱. 메뉴 화면은 [`menus/*`](../../menus/AGENTS.md) 패키지가 두고, 앱은 조립 지점이다(루트 `AGENTS.md`).

## 폴더

- `src/main.tsx` — `I18nProvider` → `PlatformProvider adapter registry slots` → `AppShell` + `RouteOutlet`. 조립만 한다. 메뉴 mock 엔드포인트도 여기서 등록한다 — 각 메뉴의 `@ap/menu-<g>/mock`가 내보내는 `<g>Mock` 배열을 `createMockAdapter({ endpoints, registry })`에 spread한다(#114, #126). `/mock` import와 `endpoints` spread는 `// <gen:menu-mock-imports>`·`// <gen:menu-mock-spreads>` 마커 영역으로 `pnpm gen:menu`가 쓴다(analytics mock도 같은 영역에 들어 있다) — 등록 자체는 손으로 쓰지 않고, 영역 밖 배선은 손으로 쓴다.
- `src/menus.ts` — IA 공간(`SPACES`)·그룹(`GROUPS`, 행마다 `space`)과 7개 `@ap/menu-*` 패키지 `manifests`의 연결(`MENUS`), `createRegistry` 호출. 화면 lazy import는 각 메뉴 패키지가 소유한다. 패키지 연결(import·spread)은 `gen:menu` 마커 영역이며 `pnpm gen:menu`가 쓴다 — `SPACES`·`GROUPS`는 손으로 쓴다.
- 메뉴 화면과 그 화면 전용 합성 데이터(`data.ts`)는 `menus/<group>/src/pages/`에 있다(이행한 화면의 계산은 `src/mock/`).
- 서버 대역은 `packages/mock-server`(`@ap/mock-server`). 앱에 남는 것은 `main.tsx`의 `createMockAdapter({ endpoints, registry })` 결과 주입, `src/dev/DevTools.tsx`, 그리고 실제 Registry가 필요한 통합 테스트다: `src/url-contract.test.ts`·`src/return-to.test.ts`, `published-metrics`의 kernel `classifyMetricInit`+mock 부분을 남긴 `src/published-metrics.test.ts`, 그리고 앱이 등록한 모든 메뉴 엔드포인트를 mock 어댑터로 적합성 묶음(`@ap/server-conformance`)에 돌리는 `src/server-conformance.test.ts`(#145 — `main.tsx`와 같은 메뉴 `/mock` 허용을 lint가 준다. 새 메뉴 mock을 `main.tsx` 마커에 등록하면 이 테스트의 `MOCKS`와 params 표에도 넣는다 — 빠지면 테스트가 실패한다)(`jobs-population`은 `@ap/menu-analytics`로, `published-metrics`의 발행 포인터 비교는 `@ap/menu-metrics`, 페이지 기본 버전 검증은 `@ap/menu-analytics`로 이동).
- `src/dev/DevTools.tsx` — 역할 전환·응답 시나리오 시뮬레이터(탑바 슬롯). 운영 코드 아님.
- `src/url-contract.test.ts`, `src/return-to.test.ts` — 실제 메뉴 Registry로 URL·복귀 경로를 보는 통합 테스트.
- `reports/` — 화면 제작·리뷰 기록(역사 기록, 수정하지 않음).

## 규칙

- 메뉴 화면 작성법은 [README "페이지 작성 가이드"](README.md#페이지-작성-가이드-consumer-규칙)가 원본이다. 요약: 최상위 `PlatformPage`, 조회는 `usePlatformQuery` + `QueryView`, 이동은 `linkTo()`, page 상태는 등록된 `pageKeys`만.
- 페이지는 `packages/*`를 수정하지 않는다. 공통 부품이 부족하면 필요 사항을 보고하고 플랫폼 작업으로 올린다.
- 메뉴를 추가하면 해당 그룹 패키지(`menus/<group>/src/index.ts`)의 `manifests`에 선언하고 06 §5(Menu Extension Contract)·§29(Platform Done)를 확인한다. 메뉴 화면 3개 이상 연속 제작은 사용자에게 범위를 먼저 확인한다.
- mock은 서버 역할을 흉내낸다: Scope·room 허용 범위와 데이터 권한은 mock 엔진(`serveEndpoint`)이 엔드포인트 선언 사본으로 재검증하고 페이지는 판단하지 않는다 — 권한은 읽는 데이터·엔드포인트의 선언 권한이고, 서버가 요청 시점에 고정된 역할로 판정한다. 보통은 화면이 속한 메뉴의 권한이다. OperationsHome은 home manifest가 `platform:view`여도 공지를 `notice:view`로 읽는다. 클라이언트 라우트 게이트는 UX일 뿐이다. 역할은 요청 시점에 고정한다(localStorage `platform:role`).
- `@ap/mock-server`를 화면이 직접 import하지 않는다. 모든 화면은 `useMenuQuery`·`useMenuFetch`로 자기 메뉴 `src/endpoints.ts`의 선언을 조회한다(`serve`는 #132에서 공개 export가 아니다). 상세 규칙은 [`menus/AGENTS.md`](../../menus/AGENTS.md). 앱 런타임에서 mock을 쓰는 곳은 `createMockAdapter(...)` 결과 주입과 DevTools뿐이다. 테스트로는 kernel `classifyMetricInit`과 mock 발행 지표를 함께 보는 앱 통합 테스트 `src/published-metrics.test.ts`가 직접 import한다(위층 통합 테스트라 허용, 패키지 경계 §3 규칙 6).

## 검증

루트 네 명령(`pnpm lint && pnpm typecheck && pnpm test && pnpm build`, 루트 `AGENTS.md`)에 더해 `pnpm dev`(http://127.0.0.1:5173)로 역할 전환·시나리오 시뮬레이터를 써서 화면을 확인한다. lint는 `@ap/mock-server` import를 `src/main.tsx`, `src/dev/**`, `src/published-metrics.test.ts`에서만 허용하고, `src/menus.ts`와 URL 테스트는 대상이 아니다(D2).
