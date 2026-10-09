# packages/mock-server — 개발용 서버 대역

`@ap/mock-server`는 실제 백엔드가 없는 개발 환경에서 서버 역할을 흉내내는 패키지다. 커널·공통 컴포넌트는 이 패키지를 모르고, 절대 import하지 않는다. 앱(`apps/platform-web`)의 mock 조립 `src/dev/mock-assembly.tsx`가 `createMockAdapter({ endpoints: MOCK_ENDPOINTS, registry })` 결과를 `#platform-assembly`로 `main.tsx`에 넘기고, dev·`--mode mock`·vitest에서만 쓰인다 — 운영 빌드에는 없음(#153, ADR-0009).

## 파일

- `src/world.ts` — 설비·사이트·사용자 마스터와 `PUBLISHED_METRICS`.
- `src/server.ts` — 엔진 내부 `serve()`(공개 export 아님), 역할(localStorage `platform:role`)·시나리오, `getEntity`·`recordUsage`·`reportClientError`·`usageSummary`. 권한·Scope 재검증은 요청이 아니라 서버 쪽 선언 사본/서버 소유 map으로 판정한다([체크리스트 §2-§3](../../docs/integration/real-server-checklist.md)).
- `src/annotations.ts` — 차트 주석 저장소(06 §16, #103). `listAnnotations`·`saveAnnotation`은 권한(`analytics:view`) → 시나리오 → 검증 → Site 경계 순으로 판정하고, 행은 작성 당시 `scopeId`를 갖고 모든 조회가 `scopeId`로 거른다(`chartId`만으로 고르지 않는다). 작성자·시각은 서버가 찍고 wire 입력에 없다(알 수 없는 키는 거부). 비mart 데이터라 trust는 null.
- `src/access.ts`·`src/audit.ts`(+`audit-fixtures.ts`) — 권한/역할 조회(`accessDirectory`, #49)와 변경 감사(`auditTrail`·`entityAudit`, #50) 핸들러·픽스처.
- `src/jobs.ts` — 작업(job) 합성 데이터와 조회 함수.
- `src/adapter.ts` — `createMockAdapter({ endpoints, registry })`: 포트 구현 + 선언 기반 `menuQuery`. 엔드포인트 등록 검증 7가지의 원본은 [체크리스트 §3 "등록 검증"](../../docs/integration/real-server-checklist.md).
- `src/endpoints.ts` — `MockEndpoint`·`defineMockEndpoint`·`serveEndpoint`(선언 기반 판정 순서 = 체크리스트 §3), `MockRegistrationError`·`MockRequestError`. `mart: false`는 비 mart 원천(Trust 없음, mart 시나리오 미적용).
- `src/index.ts` — 공개 진입점. 명시적 export만 한다(`export *` 금지).

## 규칙

- 의존성은 `@ap/contracts` 하나뿐이다. React도, 다른 `@ap/*`도 import하지 않는다.
- 앱(`apps/*`)이나 메뉴(`menus/*`)를 import하지 않는다. 메뉴별 mock 핸들러와 계산은 각 메뉴 패키지의 `src/mock/`에 둔다.
- mock과 화면 계산을 함께 보는 테스트는 이 패키지에 두지 않는다. 지표 발행 버전은 `menus/metrics/src/mock/published-pointers.test.ts`(카탈로그 포인터 비교)·`menus/analytics/src/resolve-metric.test.ts`(페이지 기본 버전)·`apps/platform-web/src/published-metrics.test.ts`(kernel `classifyMetricInit` + mock)가 나눠 본다. 패키지가 앱·메뉴를 import하게 만들지 않는다.
- 각 메뉴의 `src/mock/**` handler는 이 패키지를 import할 수 있다. `serve()`는 엔진 내부 단계라 공개 export하지 않는다. 앱에서는 `src/dev/**`(mock 조립·`DevTools.tsx`)와 앱 통합 테스트 `src/server-conformance.test.ts`·`src/published-metrics.test.ts`만 import한다 — `main.tsx`는 lint가 막는다(#153). 메뉴 페이지는 mock handler를 상대 import하지 않고 앱이 메뉴의 `/mock` 서브패스로 등록한다. 생산성·사이클 집계는 메뉴 쪽에 둔다.
- 메뉴 데이터 접점은 각 메뉴의 엔드포인트 선언(`menus/<group>/src/endpoints.ts`)과 그 mock 핸들러(`src/mock/`)다. 이 패키지는 메뉴를 모른다.
- `MockEndpoint.provisional`은 메뉴가 대상 데이터 시점으로 Trust를 판정하는 선택 훅이다. 정상·비어 있지 않은 mart 응답에서만 기간 길이 판정을 대체하며, 미지정·빈 응답·오류·malformed는 기존 판정을 유지한다. execution occurrence는 `anchor >= DATA_THROUGH − 24h`로 판정한다(참조 기간 미적용).

## 검증

`pnpm --filter @ap/mock-server test`로 좁혀 본 뒤 루트 검사(루트 `AGENTS.md`).
