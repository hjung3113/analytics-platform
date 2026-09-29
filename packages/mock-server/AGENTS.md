# packages/mock-server — 개발용 서버 대역

`@ap/mock-server`는 실제 백엔드가 없는 개발 환경에서 서버 역할을 흉내내는 패키지다. 커널·공통 컴포넌트는 이 패키지를 모르고, 절대 import하지 않는다. 앱(`apps/platform-web`)의 `main.tsx`가 `createMockAdapter({ endpoints, registry })` 결과를 `PlatformAdapter`로 주입한다.

## 파일

- `src/world.ts` — 설비·사이트·사용자 마스터와 `PUBLISHED_METRICS`.
- `src/server.ts` — `serve()`: 데이터 권한·Scope 재검증·응답 envelope·시나리오·역할(localStorage `platform:role`). 조회는 읽는 데이터·엔드포인트의 권한을 필수 옵션 `permission`으로 받고, 요청 시점에 고정된 역할로 판정한다. 보통은 소유 메뉴의 권한이다. `reportClientError`는 `recordUsage`와 같은 자세로 정확한 wire 모양만 받고(알 수 없는 키·절대/프로토콜 상대 URL path·식별자 모양이 아닌 `name`은 통째 거부, 자유 문장 `message` 필드는 없음) 서버가 사용자·시각을 기록한다(200건 상한, 콘솔 읽기는 아직 없음). 시나리오 `malformed`는 ok 응답의 `data`를 `{}`로 바꿔 데이터를 믿는 화면이 렌더 중 예외를 던지게 한다(Error Boundary 확인용). `getEntity(ref)`(§22 목적지 단건 조회)는 권한을 클라이언트 인수로 받지 않는다 — 서버 소유 map(`equipment` → `equipment:view`)으로 판정하고 site 검증 뒤 그 설비의 room을 다시 검증하며, 거부 응답에 row 필드를 노출하지 않는다.
- `src/annotations.ts` — 차트 주석 저장소(06 §16, #103). `listAnnotations`·`saveAnnotation`은 권한(`analytics:view`) → 시나리오 → 검증 → Site 경계 순으로 판정하고, 행은 작성 당시 `scopeId`를 갖고 모든 조회가 `scopeId`로 거른다(`chartId`만으로 고르지 않는다). 작성자·시각은 서버가 찍고 wire 입력에 없다(알 수 없는 키는 거부). 비mart 데이터라 trust는 null.
- `src/jobs.ts` — 작업(job) 합성 데이터와 조회 함수.
- `src/adapter.ts` — `createMockAdapter({ endpoints, registry })`(등록 검증 5가지): 기존 포트 구현과 선언 기반 `menuQuery`를 조립한다.
- `src/endpoints.ts` — `MockEndpoint`·`defineMockEndpoint`·`serveEndpoint`(선언 기반 판정 순서, 미적용 Context 키 중립화, 파이프라인 예외는 abort를 제외하고 error envelope로 변환)·`MockRegistrationError`.
- `src/index.ts` — 공개 진입점. 명시적 export만 한다(`export *` 금지).

## 규칙

- 의존성은 `@ap/contracts` 하나뿐이다. React도, 다른 `@ap/*`도 import하지 않는다.
- 앱(`apps/*`)이나 메뉴(`menus/*`)를 import하지 않는다. 화면 전용 데이터와 집계는 각 메뉴 패키지(`menus/<group>/src/pages`)에 둔다.
- mock과 화면 계산을 함께 보는 테스트는 이 패키지에 두지 않는다. `jobs-population`은 `@ap/menu-analytics`에, `published-metrics`는 발행 포인터 비교(`@ap/menu-metrics`)·페이지 기본 버전 검증(`@ap/menu-analytics`)·kernel+mock 통합 부분(`apps/platform-web/src/published-metrics.test.ts`)으로 나뉘어 있다. 패키지가 앱·메뉴를 import하게 만들지 않는다.
- 메뉴 코드는 이 패키지를 직접 import하지 않는다. 각 메뉴 패키지의 `src/api.ts`(4개 그룹), 앱 조립(`main.tsx`, `src/dev/DevTools.tsx`), 앱 통합 테스트 `src/published-metrics.test.ts`만 import한다. 생산성·사이클 집계는 메뉴 쪽에 둔다.
- 이 패키지에 `api.ts`를 만들지 않는다. 데이터 접점 `api.ts`는 각 메뉴 패키지(`menus/<group>/src/api.ts`)가 소유한다.

## 검증

`pnpm --filter @ap/mock-server test`로 먼저 좁혀 본 뒤 루트 네 명령(`pnpm lint && pnpm typecheck && pnpm test && pnpm build`, 루트 `AGENTS.md`).
