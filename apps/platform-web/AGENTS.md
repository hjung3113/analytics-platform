# apps/platform-web — 조립 지점

플랫폼 패키지를 조립하는 앱(dev·테스트에서는 mock 어댑터를 주입한다). 메뉴 화면은 [`menus/*`](../../menus/AGENTS.md) 패키지가 두고, 앱은 조립 지점이다(루트 `AGENTS.md`).

## 폴더

- `src/main.tsx` — `I18nProvider` → `PlatformProvider adapter registry slots` → `AppShell` + `RouteOutlet`. 조립만 한다(FeedbackOps origin env는 `src/feedbackops-origin.ts`가 읽어 메뉴 서브패스에 넣는다, #60). mock·`src/dev/**`를 import하지 않는다(#153, [ADR-0009](../../docs/adr/0009-production-assembly-injection.md)) — 어댑터와 레일 도구는 `#platform-assembly`의 `createAssembly({ registry })`에서 받는다(계약 타입 `src/platform-assembly.d.ts`). `vite.config.ts`가 mode로 경로를 고른다: dev 서버·`--mode mock`·vitest → `src/dev/mock-assembly.tsx`, 그 밖(운영) → env `AP_PLATFORM_ASSEMBLY`(실어댑터 조립, #154), 없으면 빌드 실패.
- `src/dev/mock-assembly.tsx` — mock 조립: 메뉴 mock 엔드포인트를 여기서 `export const MOCK_ENDPOINTS` 하나에 등록하고(`createMockAdapter`와 서버 적합성 테스트가 같은 목록을 읽는다) — 각 메뉴의 `@ap/menu-<g>/mock`가 내보내는 `<g>Mock` 배열을 `MOCK_ENDPOINTS`에 spread한다(#114, #126, #153). `/mock` import와 `MOCK_ENDPOINTS` spread는 `// <gen:menu-mock-imports>`·`// <gen:menu-mock-spreads>` 마커 영역으로 `pnpm gen:menu`가 쓴다(analytics mock도 같은 영역에 들어 있다) — 등록 자체는 손으로 쓰지 않고, 영역 밖 배선은 손으로 쓴다.
- `src/menus.ts` — IA 공간(`SPACES`)·그룹(`GROUPS`, 행마다 `space`; `hideLabelWhenSingle`은 선택적 사이드바 표시 선언)과 7개 `@ap/menu-*` 패키지 `manifests`의 연결(`MENUS`), `createRegistry` 호출. 화면 lazy import는 각 메뉴 패키지가 소유한다. 패키지 연결(import·spread)은 `gen:menu` 마커 영역이며 `pnpm gen:menu`가 쓴다 — `SPACES`·`GROUPS`는 손으로 쓴다.
- 메뉴 화면과 그 화면 전용 합성 데이터(`data.ts`)는 `menus/<group>/src/pages/`에 있다(이행한 화면의 계산은 `src/mock/`).
- 서버 대역은 `packages/mock-server`다. 앱에 남는 것은 `src/dev/mock-assembly.tsx`·`src/dev/DevTools.tsx`와 실제 Registry·contracts를 함께 보는 통합 테스트 `src/*.test.ts`(파일명 = 검증 대상)다. 적합성 묶음 `src/server-conformance.test.ts`는 `MOCK_ENDPOINTS`를 그대로 읽고(lint가 그 import만 허용), 엔드포인트가 params를 선언하면 이 테스트의 `PARAMS` 표에 표본을 넣어야 통과한다.
- `src/dev/DevTools.tsx` — 역할 전환·응답 시나리오 시뮬레이터(`topBarTools` 슬롯, 레일 아래). 운영 코드 아님.

## 규칙

- 메뉴 화면 작성법은 [README "페이지 작성 가이드"](README.md#페이지-작성-가이드-consumer-규칙)가 원본이다. 요약: 최상위 `PlatformPage`, 조회는 `usePlatformQuery` + `QueryView`, 이동은 `linkTo()`, page 상태는 등록된 `pageKeys`만.
- 페이지는 `packages/*`를 수정하지 않는다. 공통 부품이 부족하면 필요 사항을 보고하고 플랫폼 작업으로 올린다.
- 메뉴를 추가하면 해당 그룹 패키지(`menus/<group>/src/index.ts`)의 `manifests`에 선언하고 06 §5(Menu Extension Contract)·§29(Platform Done)를 확인한다. 메뉴 화면 3개 이상 연속 제작은 사용자에게 범위를 먼저 확인한다.
- `@ap/mock-server`는 화면이 직접 import하지 않는다 — 규칙은 [menus/AGENTS.md](../../menus/AGENTS.md). 운영 빌드 제외는 `check:prod-graph`.
- FeedbackOps CSS(`@fops/ui/styles/*`)는 앱이 직접 가져오지 않는다 — `src/style.css`는 `@ap/ui/styles.css`만 `@import`한다([packages/ui/AGENTS.md](../../packages/ui/AGENTS.md)).

## 검증

`pnpm --filter @ap/platform-web test`로 좁혀 본 뒤 루트 검사(루트 `AGENTS.md`)에 더해 `pnpm dev`(http://127.0.0.1:5173)로 역할 전환·시나리오 시뮬레이터를 써서 화면을 확인한다.

스크립트(#153): `build`는 mock 데모(`--mode mock`, CI와 CSS selector 비교가 쓴다), `build:prod`는 `AP_PLATFORM_ASSEMBLY`가 없으면 실패하고 `scripts/typecheck-assembly.ts`로 조립 모듈 타입을 검사한다, `check:prod-graph`는 운영 모듈 그래프에 mock·`src/dev`가 없음을 확인한다(CI는 `--force-mock`·`--force-mock-build`로 검사가 아직 무는지도 확인). 설계 이유는 [ADR-0009](../../docs/adr/0009-production-assembly-injection.md)·[체크리스트 §1](../../docs/integration/real-server-checklist.md), 조립 계약 타입은 `src/platform-assembly.d.ts`다.

lint(#153): `@ap/mock-server`는 `src/dev/**`·`src/server-conformance.test.ts`·`src/published-metrics.test.ts`에서만, 메뉴 `/mock` 서브패스는 `src/dev/**`에서만 import할 수 있고 `src/main.tsx`는 FeedbackOps origin 서브패스만 허용된다. 원본은 `tooling/eslint/src/index.js`(`app` 프리셋). `import.meta.glob('./dev/*')`은 lint가 못 보므로 `check:prod-graph`가 잡는다.
