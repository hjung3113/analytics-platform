# packages/mock-server — 개발용 서버 대역

`@ap/mock-server`는 실제 백엔드가 없는 개발 환경에서 서버 역할을 흉내내는 패키지다. 커널·공통 컴포넌트는 이 패키지를 모르고, 절대 import하지 않는다. 앱(`apps/platform-web`)의 `main.tsx`가 `mockAdapter`를 `PlatformAdapter`로 주입한다.

## 파일

- `src/world.ts` — 설비·사이트·사용자 마스터와 `PUBLISHED_METRICS`.
- `src/server.ts` — `serve()`: Scope 재검증·응답 envelope·시나리오·역할(localStorage `platform:role`).
- `src/jobs.ts` — 작업(job) 합성 데이터와 조회 함수.
- `src/adapter.ts` — `PlatformAdapter` 구현(`mockAdapter`).
- `src/index.ts` — 공개 진입점. 명시적 export만 한다(`export *` 금지).

## 규칙

- 의존성은 `@ap/contracts` 하나뿐이다. React도, 다른 `@ap/*`도 import하지 않는다.
- 페이지(`apps/*`)나 메뉴 화면을 import하지 않는다. 화면 전용 데이터는 앱 쪽에 둔다.
- mock과 화면 계산을 함께 보는 테스트는 이 패키지에 두지 않는다. `jobs-population`은 `@ap/menu-analytics`에, `published-metrics`는 발행 포인터 비교(`@ap/menu-metrics`)·페이지 기본 버전 검증(`@ap/menu-analytics`)·kernel+mock 통합 부분(`apps/platform-web/src/published-metrics.test.ts`)으로 나뉘어 있다. 패키지가 앱·메뉴를 import하게 만들지 않는다.
- 메뉴 코드는 이 패키지를 직접 import하지 않는다. 각 메뉴 패키지의 `src/api.ts`(4개 그룹)와 앱 조립(`main.tsx`, `src/dev/DevTools.tsx`)만 import한다. 생산성·사이클 집계는 메뉴 쪽에 둔다.
- 이 패키지에 `api.ts`를 만들지 않는다. 그것은 5b의 앱 쪽 작업이다.

## 검증

`pnpm --filter @ap/mock-server test`, 이후 루트에서 `pnpm typecheck && pnpm test && pnpm build`.
