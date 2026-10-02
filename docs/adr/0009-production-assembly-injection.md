# 운영 빌드는 조립 모듈을 주입받고, CI가 운영 모듈 그래프에 mock이 없음을 확인한다

상태: **Candidate (2026-10-02)**.
- 결정자: 에이전트 — #153이 구현 때 정하도록 위임, 사용자 확인 전 Candidate.

세부(스크립트·lint 허용 범위·생성기 마커 위치)는 [`apps/platform-web/AGENTS.md`](../../apps/platform-web/AGENTS.md)와 [실서버 연결 체크리스트](../integration/real-server-checklist.md) §1이 소유한다. 이 ADR은 결정과 이유만 둔다.

#153 전까지 `apps/platform-web/src/main.tsx`가 `@ap/mock-server`·메뉴 `/mock`·`src/dev/DevTools`를 무조건 import했다. 그래서 `pnpm build` 산출물에 mock 계산과 DevTools(역할 전환·응답 시나리오)가 늘 들어갔고, 이를 막거나 알아챌 장치가 없었다.

## 결정

- **조립 주입 계약 `#platform-assembly`**: `main.tsx`는 mock·`src/dev/**`를 import하지 않고 `#platform-assembly`의 `createAssembly({ registry })`에서 `{ adapter, topBarTools? }`를 받는다. 계약 타입은 `src/platform-assembly.d.ts`.
- **Vite가 mode로 경로를 고른다**(`vite.config.ts`): `development`(dev 서버)·`mock`·vitest → `src/dev/mock-assembly.tsx`(메뉴 mock 등록 + `createMockAdapter` + `<DevTools />`). 그 밖의 mode(운영) → env `AP_PLATFORM_ASSEMBLY`가 가리키는 모듈. 없으면 설정이 예외를 던져 빌드가 실패한다 — 대체(placeholder) 어댑터는 어디에도 없다.
- **스크립트**: `build`는 `vite build --mode mock`(데모·CI·CSS selector 비교가 쓰는 mock 산출물, 이전과 같은 앱), `build:prod`는 운영 빌드(#154 전에는 설계상 실패), `check:prod-graph`는 운영 그래프 검사.
- **CI 검사**(`scripts/check-prod-graph.ts`, `Platform workspace` Job의 `pnpm build` 다음): Vite `build()`로 운영 그래프를 메모리에서 만들되(`write: false`) `#platform-assembly`는 external로 남긴다. 번들된 모듈 중 `packages/mock-server/`·`@ap/mock-server`·`menus/*/src/mock/`·`apps/platform-web/src/dev/`가 하나라도 있거나 조립 모듈이 external로 남지 않았으면 실패한다. 이 검사만 `AP_PROD_GRAPH_CHECK=1`로 설정의 env 요구를 건너뛴다. `--force-mock`은 조립을 mock으로 묶어 검사가 실제로 실패하는지 보인다.
- **lint**: `src/main.tsx`와 `src/dev/**` 밖의 앱 소스는 `@ap/mock-server`·메뉴 `/mock`·`./dev/**`를 import할 수 없다(서버 적합성 테스트·`published-metrics.test.ts`의 기존 허용만 유지).

## Considered Options

- **(a) `import.meta.env` 분기 + 동적 import**: 한 진입점에서 `if (import.meta.env.DEV) await import('./dev/...')`. 운영 번들에서 빠지는지는 dead-code 제거에 기대고, 누가 실수로 정적 import 한 줄을 더하면 mock이 조용히 운영에 실린다. 막는 장치가 결국 따로 필요하다.
- **(b) 별도 HTML 진입점·두 번째 앱**: mock 앱과 운영 앱을 나눈다. 조립 지점(Registry·Provider·셸·FeedbackOps origin)이 두 벌이 되어 서로 어긋난다.
- **(c) 운영에서 대체(placeholder) 어댑터**: 실어댑터가 없을 때 빈 어댑터로 빌드가 통과한다. #153이 금지했다 — 잘못된 산출물이 "성공"으로 보인다.
- **(d, 채택) 별칭으로 주입하는 조립 모듈 + 운영 빌드는 `AP_PLATFORM_ASSEMBLY` 없으면 실패 + CI가 조립을 external로 둔 운영 모듈 그래프를 검사**: 조립 지점은 하나로 남고, mock은 mode가 고른 모듈에만 있으며, 정적 import 실수는 lint와 그래프 검사 두 곳에서 걸린다.

## Consequences

- #154(실어댑터)는 `createAssembly({ registry })`를 구현한 모듈을 만들고 운영 빌드에 `AP_PLATFORM_ASSEMBLY=<그 경로>`를 준다. 반환 모양은 `{ adapter: PlatformAdapter; topBarTools?: ReactNode }` — 운영은 보통 `topBarTools`를 비운다.
- 메뉴 mock 등록(`pnpm gen:menu`의 `// <gen:menu-mock-imports>`·`// <gen:menu-mock-spreads>` 마커)은 `src/dev/mock-assembly.tsx`에 있다.
- e2e·dev 서버는 계속 mock(development mode)을 쓴다. `pnpm build` 산출물도 여전히 mock 앱이다 — 운영 산출물은 `build:prod`뿐이다.
- 사용자가 다른 방식을 고르면 이 ADR을 고쳐 Decided로 올리거나 대체한다.
