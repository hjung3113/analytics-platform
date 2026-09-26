# apps/platform-web — 조립 지점

플랫폼 패키지를 조립하고 mock 서버를 두는 앱. 메뉴 화면은 [`menus/*`](../../menus/AGENTS.md) 패키지가 두고, 앱은 조립 지점이다(루트 `AGENTS.md`).

## 폴더

- `src/main.tsx` — `I18nProvider` → `PlatformProvider adapter registry slots` → `AppShell` + `RouteOutlet`. 조립만 한다.
- `src/menus.ts` — IA 그룹(`GROUPS`)과 7개 `@ap/menu-*` 패키지 `manifests`의 연결(`MENUS`), `createRegistry` 호출. 화면 lazy import는 각 메뉴 패키지가 소유한다.
- 메뉴 화면과 그 화면 전용 합성 데이터(`data.ts`)는 `menus/<group>/src/pages/`에 있다.
- 서버 대역은 `packages/mock-server`(`@ap/mock-server`). 앱에 남는 것은 `main.tsx`의 `mockAdapter` 주입, `src/dev/DevTools.tsx`, 그리고 실제 Registry가 필요한 통합 테스트다: `src/url-contract.test.ts`·`src/return-to.test.ts`, 그리고 `published-metrics`의 kernel `classifyMetricInit`+mock 부분을 남긴 `src/published-metrics.test.ts`(`jobs-population`은 `@ap/menu-analytics`로, `published-metrics`의 발행 포인터 비교는 `@ap/menu-metrics`, 페이지 기본 버전 검증은 `@ap/menu-analytics`로 이동).
- `src/dev/DevTools.tsx` — 역할 전환·응답 시나리오 시뮬레이터(탑바 슬롯). 운영 코드 아님.
- `src/url-contract.test.ts`, `src/return-to.test.ts` — 실제 메뉴 Registry로 URL·복귀 경로를 보는 통합 테스트.
- `reports/` — 화면 제작·리뷰 기록(역사 기록, 수정하지 않음).

## 규칙

- 메뉴 화면 작성법은 [README "페이지 작성 가이드"](README.md#페이지-작성-가이드-consumer-규칙)가 원본이다. 요약: 최상위 `PlatformPage`, 조회는 `usePlatformQuery` + `QueryView`, 이동은 `linkTo()`, page 상태는 등록된 `pageKeys`만.
- 페이지는 `packages/*`를 수정하지 않는다. 공통 부품이 부족하면 필요 사항을 보고하고 플랫폼 작업으로 올린다.
- 메뉴를 추가하면 해당 그룹 패키지(`menus/<group>/src/index.ts`)의 `manifests`에 선언하고 06 §5(Menu Extension Contract)·§29(Platform Done)를 확인한다. 메뉴 화면 3개 이상 연속 제작은 사용자에게 범위를 먼저 확인한다.
- mock은 서버 역할을 흉내낸다: Scope·room 허용 범위와 데이터 권한은 `serve()`가 재검증하고 페이지는 판단하지 않는다. **메뉴 권한은 mock이 재검증하지 않는다** — 지금은 클라이언트 라우트 게이트뿐인 알려진 공백이다(README "남은 플랫폼 과제"). 새 화면을 서버 권한으로 보호된다고 가정하지 않는다. 역할은 요청 시점에 고정한다(localStorage `platform:role`).
- `@ap/mock-server`를 화면이 직접 import하지 않는다. 각 메뉴 패키지의 `src/api.ts`만 import하고, 화면은 `api.ts`가 다시 내보낸 `serve`를 쓴다. 상세 규칙은 [`menus/AGENTS.md`](../../menus/AGENTS.md). 앱 런타임에서 mock을 쓰는 곳은 `mockAdapter` 주입과 DevTools뿐이다. 테스트로는 kernel `classifyMetricInit`과 mock 발행 지표를 함께 보는 앱 통합 테스트 `src/published-metrics.test.ts`가 직접 import한다(위층 통합 테스트라 허용, 패키지 경계 §3 규칙 6).

## 검증

루트 `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, `pnpm dev`(http://127.0.0.1:5173)로 역할 전환·시나리오 시뮬레이터를 써서 화면을 확인한다. lint는 `@ap/mock-server` import를 `src/main.tsx`, `src/dev/**`, `src/published-metrics.test.ts`에서만 허용하고, `src/menus.ts`와 URL 테스트는 대상이 아니다(D2).
