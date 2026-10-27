# packages/adapters/mock-server — 개발용 서버 대역

`@ap/mock-server`는 실제 백엔드가 없는 개발 환경에서 서버 역할을 흉내내는 패키지다. 커널·공통 컴포넌트는 이 패키지를 모르고, 절대 import하지 않는다. 앱(`apps/platform-web`)의 mock 조립 `src/dev/mock-assembly.tsx`가 `createMockAdapter({ endpoints: MOCK_ENDPOINTS, registry, auditEvents: MOCK_AUDIT_EVENTS })` 결과를 `#platform-assembly`로 `main.tsx`에 넘기고, dev·`--mode mock`·vitest에서만 쓰인다 — 운영 빌드에는 없음(#153, ADR-0009).

## 파일

- `src/world.ts` — 설비·사이트·사용자 마스터와 `PUBLISHED_METRICS`. 역할별 권한은 앱 조립이 `createMockAdapter({ permissions: [...registry.permissions, ...modulePermissions(registry)] })`로 넘긴 목록에서 만든다(`createUsers`: admin 전부, engineer는 콘솔·FeedbackOps 제외, viewer는 명시 권한만). 앱이 마운트한 외부 모듈의 권한(`eqv:view` 등)은 앱이 `modulePermissions(registry)`로 모아 그 목록에 더해 넘긴다 — 이 패키지는 모듈을 모르고 바뀐 것이 없다(admin·engineer는 받고 viewer는 못 받아 서버가 `forbidden`을 낸다, #801). 목록을 넘기지 않으면 Kernel 권한 + 견본 메뉴 권한 네 개(`WORLD_PERMISSIONS`)가 기본이다(ADR-0072, 앱 import 없음). 사용 계측의 공간 id는 앱의 공간 목록을 모르므로 모양만 검사한다.
- `src/server.ts` — 엔진 내부 `serve()`(공개 export 아님), 역할(localStorage `platform:role`)·시나리오, `getEntity`·`recordUsage`·`reportClientError`·`usageSummary`. 권한·Scope 재검증은 요청이 아니라 서버 쪽 선언 사본/서버 소유 map으로 판정한다([체크리스트 §2-§3](../../../docs/integration/real-server-checklist.md)).
- 응답 지연(#917, 2026-10-26 결정): 조회 기본값은 `DEFAULT_QUERY_LATENCY_MS`(120 ms) + 0–60 ms 흔들림이다(`queryDelay`). 예전 450 ms + 0–200 ms는 데모(`/demo/`)에서 드릴 단계와 메뉴 전환마다 약 0.5초 로딩을 만들어 느리게 보였다(운영 빌드 측정: 단계 전환 약 1.0 s 중 mock 몫 약 550 ms). 쓰기·감사·주석은 80 ms 그대로다. `slow` 시나리오의 +2.2 s와 호출이 주는 `latency`(테스트·E2E 고정값)는 그대로 유지한다. 로딩 상태를 보려면 DevTools의 `slow` 시나리오를 쓴다. 되돌리려면 상수 한 곳만 바꾼다.
- `src/audit/annotations.ts` — 차트 주석 저장소(06 §16, #103). `listAnnotations`·`saveAnnotation`·`deleteAnnotation`은 권한(`analytics:view`) → 시나리오 → 검증 → Site 경계 순으로 판정하고, 행은 작성 당시 `scopeId`를 갖고 모든 조회가 `scopeId`로 거른다(`chartId`만으로 고르지 않는다). 작성자·시각은 서버가 찍고 wire 입력에 없다(알 수 없는 키는 거부). 비mart 데이터라 trust는 null. `mine`은 응답마다 요청 역할로 계산해 저장하지 않고, 삭제는 작성자만 하며 성공하면 `auditTrail`이 합쳐 읽는 런타임 감사 행(`delete`·`annotation`)을 남긴다(ADR-0041).
- `src/access/access.ts`·`src/audit/audit.ts`(+`audit/audit-fixtures.ts`) — 권한/역할 조회(`accessDirectory`, #49)와 변경 감사(`auditTrail`·`entityAudit`, #50) 핸들러·픽스처.
- `src/actions/jobs.ts` — 작업(job) 합성 데이터와 조회 함수.
- `src/adapter.ts` — `createMockAdapter({ endpoints, actions?, registry, auditEvents? })`: 포트 구현 + 선언 기반 `menuQuery`·`menuAction`. `auditEvents`는 메뉴가 소유한 감사 대상(지표)의 시드로, 설비 이벤트와 한 저장소로 `auditTrail`·`entityAudit`에 쓰인다. 등록 때 id 중복·대상 유형(설비 제외)·지표 `scopeId: null`·zone 있는 instant를 검사한다([ADR-0048](../../../docs/adr/0048-menu-audit-seeds-join-shared-mock-audit-store.md)). 엔드포인트 등록 검증 7가지의 원본은 [체크리스트 §3 "등록 검증"](../../../docs/integration/real-server-checklist.md).
- `src/query/endpoints.ts` — `MockEndpoint`·`defineMockEndpoint`·`serveEndpoint`(선언 기반 판정 순서 = 체크리스트 §3), `MockRegistrationError`·`MockRequestError`. `mart: false`는 비 mart 원천(Trust 없음, mart 시나리오 미적용).
- `src/actions/actions.ts` — `MockAction`·`defineMockAction`·`serveAction`(쓰기 판정 순서 = 체크리스트 §3 `menuAction`, ADR-0054): 모양 → 멱등 키 → 권한 → Scope → 재생 → 입력 → 버전 → 핸들러. `ok`만 `(행위자, 키)`로 기록하고(기한 없음) 엔진은 감사 행을 쓰지 않는다 — 감사는 핸들러 몫. `createMockAdapter({ actions? })`가 등록 검증(id 중복·`menuId`·권한·Scope·`invalidates`·`version` 핸들러)을 한다.
- `src/index.ts` — 공개 진입점. 명시적 export만 한다(`export *` 금지).

## 규칙

- 의존성은 `@ap/contracts` 하나뿐이다. React도, 다른 `@ap/*`도 import하지 않는다.
- 앱(`apps/*`)이나 메뉴(`menus/*/*`)를 import하지 않는다. 메뉴별 mock 핸들러와 계산은 각 메뉴 패키지의 `src/mock/`에 둔다.
- mock과 화면 계산을 함께 보는 테스트는 이 패키지에 두지 않는다. 지표 발행 버전은 `menus/bravo/metrics/src/mock/published-pointers.test.ts`(카탈로그 포인터 비교)·`menus/mars/analytics/src/resolve-metric.test.ts`(페이지 기본 버전)·`apps/platform-web/src/published-metrics.test.ts`(kernel `classifyMetricInit` + mock)가 나눠 본다. 패키지가 앱·메뉴를 import하게 만들지 않는다.
- 각 메뉴의 `src/mock/**` handler는 이 패키지를 import할 수 있다. `serve()`는 엔진 내부 단계라 공개 export하지 않는다. 앱에서는 `src/dev/**`(mock 조립·`DevTools.tsx`)와 앱 통합 테스트 `src/server-conformance.test.ts`·`src/published-metrics.test.ts`만 import한다 — `main.tsx`는 lint가 막는다(#153). 메뉴 페이지는 mock handler를 상대 import하지 않고 앱이 메뉴의 `/mock` 서브패스로 등록한다. 생산성·사이클 집계는 메뉴 쪽에 둔다.
- 메뉴 데이터 접점은 각 메뉴의 엔드포인트 선언(`menus/<space>/<group>/src/endpoints.ts`)과 그 mock 핸들러(`src/mock/`)다. 이 패키지는 메뉴를 모른다.
- `MockEndpoint.provisional`은 메뉴가 대상 데이터 시점으로 Trust를 판정하는 선택 훅이다. 정상·비어 있지 않은 mart 응답에서만 기간 길이 판정을 대체하며, 미지정·빈 응답·오류·malformed는 기존 판정을 유지한다. execution occurrence는 `anchor >= DATA_THROUGH − 24h`로 판정한다(참조 기간 미적용).

## 검증

`pnpm --filter @ap/mock-server test`로 좁혀 본 뒤 루트 검사(루트 `AGENTS.md`).

## 폴더 배치

`src/`는 갈래 폴더로 나뉜다: `access/`(권한·검증), `audit/`(감사·차트 주석), `actions/`(쓰기 동작·작업), `query/`(엔드포인트·선택 포트). 루트에는 공개 진입점 `index.ts`와 `server`·`adapter`·`world`, vitest `setupFiles`가 가리키는 `test-setup.ts`만 둔다. 테스트는 소속 폴더의 `__tests__/`에, 어느 한 폴더에 속하지 않는 통합 성격 테스트는 `src/__tests__/`에 둔다(ADR-0090, #713).
