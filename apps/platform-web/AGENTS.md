# apps/platform-web — 조립 지점

플랫폼 패키지를 조립하고 mock 서버를 두는 앱. 메뉴 화면은 [`menus/*`](../../menus/AGENTS.md) 패키지가 두고, 앱은 조립 지점이다(루트 `AGENTS.md`).

## 폴더

- `src/main.tsx` — `I18nProvider` → `PlatformProvider adapter registry slots` → `AppShell` + `RouteOutlet`. 조립만 한다. mock·`src/dev/**`를 import하지 않는다(#153, [ADR-0009](../../docs/adr/0009-production-assembly-injection.md)) — 어댑터와 레일 도구는 `#platform-assembly`의 `createAssembly({ registry })`에서 받는다(계약 타입 `src/platform-assembly.d.ts`). `vite.config.ts`가 mode로 경로를 고른다: dev 서버·`--mode mock`·vitest → `src/dev/mock-assembly.tsx`, 그 밖(운영) → env `AP_PLATFORM_ASSEMBLY`(실어댑터 조립, #154), 없으면 빌드 실패.
- `src/dev/mock-assembly.tsx` — mock 조립: 메뉴 mock 엔드포인트를 여기서 `export const MOCK_ENDPOINTS` 하나에 등록하고(`createMockAdapter`와 서버 적합성 테스트가 같은 목록을 읽는다) — 각 메뉴의 `@ap/menu-<g>/mock`가 내보내는 `<g>Mock` 배열을 `MOCK_ENDPOINTS`에 spread한다(#114, #126, #153). `/mock` import와 `MOCK_ENDPOINTS` spread는 `// <gen:menu-mock-imports>`·`// <gen:menu-mock-spreads>` 마커 영역으로 `pnpm gen:menu`가 쓴다(analytics mock도 같은 영역에 들어 있다) — 등록 자체는 손으로 쓰지 않고, 영역 밖 배선은 손으로 쓴다.
- `src/menus.ts` — IA 공간(`SPACES`)·그룹(`GROUPS`, 행마다 `space`; `hideLabelWhenSingle`은 선택적 사이드바 표시 선언)과 7개 `@ap/menu-*` 패키지 `manifests`의 연결(`MENUS`), `createRegistry` 호출. 화면 lazy import는 각 메뉴 패키지가 소유한다. 패키지 연결(import·spread)은 `gen:menu` 마커 영역이며 `pnpm gen:menu`가 쓴다 — `SPACES`·`GROUPS`는 손으로 쓴다.
- 메뉴 화면과 그 화면 전용 합성 데이터(`data.ts`)는 `menus/<group>/src/pages/`에 있다(이행한 화면의 계산은 `src/mock/`).
- 서버 대역은 `packages/mock-server`(`@ap/mock-server`). 앱에 남는 것은 `src/dev/mock-assembly.tsx`의 `createMockAdapter({ endpoints, registry })` 결과 주입, `src/dev/DevTools.tsx`, 그리고 실제 Registry가 필요한 통합 테스트다: `src/url-contract.test.ts`·`src/return-to.test.ts`, `published-metrics`의 kernel `classifyMetricInit`+mock 부분을 남긴 `src/published-metrics.test.ts`, 그리고 앱이 등록한 모든 메뉴 엔드포인트를 mock 어댑터로 적합성 묶음(`@ap/server-conformance`)에 돌리는 `src/server-conformance.test.ts`(#145 — 엔드포인트 목록은 mock 조립이 export하는 `MOCK_ENDPOINTS` 하나를 그대로 쓴다(#153, lint가 이 파일에만 `./dev/mock-assembly` import를 허용). 새 메뉴 mock은 `pnpm gen:menu`가 `MOCK_ENDPOINTS` 마커에 등록하면 자동으로 들어오고, 엔드포인트가 params를 선언할 때만 이 테스트의 `PARAMS` 표에 표본을 넣는다 — 빠지면 테스트가 실패한다)(`jobs-population`은 `@ap/menu-analytics`로, `published-metrics`의 발행 포인터 비교는 `@ap/menu-metrics`, 페이지 기본 버전 검증은 `@ap/menu-analytics`로 이동).
- `src/dev/DevTools.tsx` — 역할 전환·응답 시나리오 시뮬레이터(`topBarTools` 슬롯, 레일 아래). 운영 코드 아님.
- `src/url-contract.test.ts`, `src/return-to.test.ts` — 실제 메뉴 Registry로 URL·복귀 경로를 보는 통합 테스트.
- `reports/` — 화면 제작·리뷰 기록(역사 기록, 수정하지 않음).

## 규칙

- 메뉴 화면 작성법은 [README "페이지 작성 가이드"](README.md#페이지-작성-가이드-consumer-규칙)가 원본이다. 요약: 최상위 `PlatformPage`, 조회는 `usePlatformQuery` + `QueryView`, 이동은 `linkTo()`, page 상태는 등록된 `pageKeys`만.
- 페이지는 `packages/*`를 수정하지 않는다. 공통 부품이 부족하면 필요 사항을 보고하고 플랫폼 작업으로 올린다.
- 메뉴를 추가하면 해당 그룹 패키지(`menus/<group>/src/index.ts`)의 `manifests`에 선언하고 06 §5(Menu Extension Contract)·§29(Platform Done)를 확인한다. 메뉴 화면 3개 이상 연속 제작은 사용자에게 범위를 먼저 확인한다.
- mock은 서버 역할을 흉내낸다: Scope·room 허용 범위와 데이터 권한은 mock 엔진(`serveEndpoint`)이 엔드포인트 선언 사본으로 재검증하고 페이지는 판단하지 않는다 — 권한은 읽는 데이터·엔드포인트의 선언 권한이고, 서버가 요청 시점에 고정된 역할로 판정한다. 보통은 화면이 속한 메뉴의 권한이다. OperationsHome은 home manifest가 `platform:view`여도 공지를 `notice:view`로 읽는다. 클라이언트 라우트 게이트는 UX일 뿐이다. 역할은 요청 시점에 고정한다(localStorage `platform:role`).
- `@ap/mock-server`를 화면이 직접 import하지 않는다. 모든 화면은 `useMenuQuery`·`useMenuFetch`로 자기 메뉴 `src/endpoints.ts`의 선언을 조회한다(`serve`는 #132에서 공개 export가 아니다). 상세 규칙은 [`menus/AGENTS.md`](../../menus/AGENTS.md). 앱 런타임에서 mock을 쓰는 곳은 `src/dev/`의 mock 조립(`createMockAdapter(...)` 결과 주입)과 DevTools뿐이고, 운영 빌드에는 둘 다 실리지 않는다(`check:prod-graph`). 테스트로는 kernel `classifyMetricInit`과 mock 발행 지표를 함께 보는 앱 통합 테스트 `src/published-metrics.test.ts`가 직접 import한다(위층 통합 테스트라 허용, 패키지 경계 §3 규칙 6).
- FeedbackOps CSS(`@fops/ui/styles/*`)는 앱이 직접 가져오지 않는다. `@ap/ui/styles.css`가 자기 의존(`@fops/ui`)으로 가져오고, 앱은 지금처럼 `src/style.css`에서 `@ap/ui/styles.css`만 `@import`한다. 앱은 `@fops/ui`에 의존하지 않으므로 `src/style.css`의 `@import '@fops/ui/…'`는 해석되지 않는다. JS/TS import는 경계 lint가 막는다.

## 검증

루트 네 명령(`pnpm lint && pnpm typecheck && pnpm test && pnpm build`, 루트 `AGENTS.md`)에 더해 `pnpm dev`(http://127.0.0.1:5173)로 역할 전환·시나리오 시뮬레이터를 써서 화면을 확인한다.

스크립트(#153): `build`는 `tsc --noEmit && vite build --mode mock`(mock 데모 산출물 — CI·CSS selector 비교가 쓴다), `build:prod`는 `tsc --noEmit && node scripts/typecheck-assembly.ts && vite build`(`AP_PLATFORM_ASSEMBLY` 없으면 실패 — #154 전에는 설계상 실패). `typecheck-assembly`는 `AP_PLATFORM_ASSEMBLY`를 앱 디렉터리 기준으로 풀어(Vite alias와 같게) `os.tmpdir()`에 임시 프로젝트를 쓰고 그 모듈의 `createAssembly`를 `CreateAssembly`에 대입해 워크스페이스 `tsc`로 검사한다 — 앱 `tsc --noEmit`은 주입 모듈을 보지 않으므로 이게 실조립의 타입 보장이다(회귀 테스트 `scripts/typecheck-assembly.test.ts`), `check:prod-graph`는 `node scripts/check-prod-graph.ts` — 조립 모듈을 external로 둔 운영 모듈 그래프를 메모리에서 만들어 `packages/mock-server/`·`@ap/mock-server`·`menus/*/src/mock/`·`src/dev/`가 있으면 실패한다(CI `platform-workspace`의 `pnpm build` 다음 단계). `--force-mock`은 조립을 mock으로 묶어 검사가 실패하는지 보이고, `--force-mock-build`는 `AP_PLATFORM_ASSEMBLY=<mock 조립>` 운영 빌드가 빌드 단계 검사에서 실패하는지 보인다(CI가 둘 다 실패를 확인). 빌드 단계 검사는 `scripts/prod-graph.ts`의 `prodGraphGuard()` — `vite.config.ts`가 mock이 아닌 모든 빌드에 붙여 실조립을 포함한 전체 그래프를 같은 `findForbiddenModules`로 검사한다(끌 수 없다). 조립 계약은 `src/platform-assembly.d.ts`의 `CreateAssembly` — 구현은 `export const createAssembly: CreateAssembly`로 쓴다(`src/assembly-contract.type-test.ts`가 typecheck로 계약을 고정). `vite preview`만 env 요구에서 빠지고, 운영 mode dev 서버는 같은 안내로 멈춘다. `AP_PROD_GRAPH_CHECK=1`은 이 검사만 쓰는 설정 신호다(운영 env 요구를 건너뛰고 조립을 미해결로 남김) — 빌드 단계 검사는 끄지 않는다. 검사 실행 중에도 가드가 켜져 있어, 걸리는 그래프는 빌드 안에서 멈추고 스크립트가 그 목록을 보고한다.

lint(#153): `@ap/mock-server`는 `src/dev/**`·`src/server-conformance.test.ts`·`src/published-metrics.test.ts`에서만, 메뉴 `/mock` 서브패스는 `src/dev/**`에서만 허용한다. `src/server-conformance.test.ts`는 `./dev/mock-assembly` 하나만 import할 수 있다(`MOCK_ENDPOINTS`). `src/main.tsx`는 FeedbackOps origin 서브패스만 허용되고 mock은 금지다. `src/dev/**` 밖의 앱 소스는 `./dev/**`(상대)·`/src/dev/**`(Vite 루트 절대)를 import할 수 없다(정적·동적 모두, 대소문자 무관). `import.meta.glob('./dev/*')`은 lint가 보지 못한다 — 운영 그래프 검사만 잡는다. `src/menus.ts`와 URL 테스트는 mock 대상이 아니다(D2).
