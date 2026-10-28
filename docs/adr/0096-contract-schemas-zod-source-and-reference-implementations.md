# 서버 계약 원본은 TS의 Zod 스키마이고, SDK는 계약에 더해 선택해서 쓰는 참조 구현을 낸다

- Status: Decided (2026-10-28)
- Decider: 사용자(소유자, [#531](https://github.com/hjung3113/analytics-platform/issues/531)·[#148](https://github.com/hjung3113/analytics-platform/issues/148), 2026-10-20 "기술적인 건 추천대로"). 되돌릴 수 있다.
- Scope: 메뉴 조회 포트 엔드포인트 선언(`EndpointSpec`)과 응답·파라미터 모양의 원본, 언어 중립 산출물, SDK가 서버에 대해 내는 것의 범위. 관련: [ADR-0019](0019-menu-query-endpoint-declaration.md) Q2, 06 §6.1([kernel.md](../contract/kernel.md#61-식별자와-url-소유-상태-decided)), [HTTP 어댑터 계약](../integration/http-adapter-contract.md) §8, [실서버 체크리스트](../integration/real-server-checklist.md) §3.

## 맥락

실서버(FastAPI 등)는 요청이 아니라 자기 쪽 선언 사본으로 판정해야 한다. 그 사본의 원본이 정해지지 않았고(#148, ADR-0019 Q2), 06 §6.1의 공개 스키마 구현 형식(OpenAPI/JSON Schema/codegen)도 Candidate였다. 또 SDK는 "서버는 계약만 정하고 구현을 덮지 않는다"를 전제해 왔는데, 계약이 TS 선언에만 있으면 계약만으로는 다른 스택의 서버가 따를 산출물이 없다. FeedbackOps(`@fops/shared`의 Zod)와 EV(`@eqv/core`의 Zod + JSON Schema 내보내기, 스냅샷 드리프트 게이트)는 이미 모두 TS/Zod가 원본이다.

## 대안

- A. TS `EndpointSpec`이 원본(선택). 응답·파라미터 모양은 Zod 스키마이고, Zod 4 내장 JSON Schema(2020-12) 내보내기로 언어 중립 산출물을 만든다. Python 서버는 그 JSON Schema에서 Pydantic 모델을 생성하고, Node 서버는 Zod를 그대로 쓴다.
- B. FastAPI(Pydantic) 라우트 → OpenAPI → TS 선언 생성. `apply`·`assessments`·`limits` 같은 플랫폼 고유 필드를 OpenAPI 확장으로 실어야 하고, 메뉴 개발이 서버 먼저가 되며, 지금 TS 선언·lint·생성기(`gen:menu`)를 다시 짜야 하고, FO·EV와 방향이 반대라 SDK 선언 체계가 둘로 갈라져 기각.
- C. 양쪽이 각자 선언하고 CI에서 비교. 원본이 둘이라 갈라질 수 있고 비교 검사를 따로 만들어야 해 기각.

## 결정

- **원본은 A.** 방향은 한쪽뿐이다: Zod → JSON Schema(2020-12) → (선택) Pydantic. 06 §6.1의 "공개 스키마 구현 형식"은 이 방향으로 Decided가 된다. OpenAPI 문서는 원본이 아니다.
- **새 패키지 `@ap/contract-schemas`**(런타임 의존은 zod만)에 envelope·Assessment·Trust·MenuQuery를 먼저 두고, 이어서 포트 DTO와 엔드포인트별 params/data를 둔다. `EndpointSpec`의 선언부(`endpoints.json`의 모양)도 스키마로 둔다. 타입의 원본은 이 스키마이고 `@ap/contracts`의 기존 손으로 쓴 타입은 타입 동치 테스트(`z.infer`와 서로 대입 가능)로 묶는다. `@ap/contracts`는 외부 런타임 라이브러리를 import하지 않는 규칙이라 `z.infer`로 바로 바꾸지 않고, 바꾸는 시점은 `@ap/contract-schemas`가 tarball로 나가는 때(첫 Node 런타임 소비자)다. 그때까지 같은 모양이 두 곳에 있어도 동치 테스트가 어긋남을 막는다.
- **산출물:** JSON Schema는 `schemas/*.json`, 그 밖에 `endpoints.json`·`vocab.json`을 `sdk-v*` Release에 싣는다. 산출물이 원본과 어긋나는 것은 스냅샷 drift 게이트가 막는다(EV 방식). 산출물 형식 규칙(2020-12, 정수·시각의 표현)은 구현 PR이 [`sdk-git-tag-consumption.md`](../integration/sdk-git-tag-consumption.md)에 적는다.
- **Zod 버전:** 레포의 zod 3.25.x가 내는 `zod/v4` 서브패스의 `toJSONSchema`를 쓴다. 2026-10-28 PoC에서 `target: 'draft-2020-12'` 출력, 정수(`min/max`가 안전 정수 범위로 붙음), `datetime`(긴 `pattern`이 붙음), 판별 유니온(`anyOf`)을 확인했다. 기존 FeedbackOps의 `zod` 3 루트 import와는 서브패스가 달라 같이 설치돼도 충돌하지 않는다.
- **SDK 범위를 넓힌다:** "서버는 계약만"에서 "계약 + 선택해서 쓰는 참조 구현"으로. 계약(산출물과 적합성 검사)이 의무이고 참조 구현은 쓰든 말든 서버 팀의 선택이다. 참조 구현의 대상은 FastAPI와 Node(Fastify) × PostgreSQL·MSSQL이고, 그 밖의 스택(Spring 등)은 HTTP 적합성 검사만 쓴다.
- **FastAPI 쪽 약속:** 공개 계약 모델은 JSON Schema에서 생성하고 손으로 쓰지 않는다. 생성 도구와 CI 방식은 구현 때 정한다.

## 이 결정에 넣지 않은 것

- 두 백엔드(Fastify 코어 + FastAPI)의 분담, 참조 엔진의 위치, Python CI를 필수 검사로 둘지: [#940](https://github.com/hjung3113/analytics-platform/issues/940)의 결정. 그 ADR이 이 ADR을 링크한다.
- 내부 신원 토큰 스키마: 권한 설계 뒤.

## 결과와 한계

- 구현 1단계: `@ap/contract-schemas`와 JSON Schema 내보내기·스냅샷 게이트·Release 산출물([#1086](https://github.com/hjung3113/analytics-platform/issues/1086)). 처음에는 envelope·Assessment·Trust·MenuQuery만 옮긴다.
- 구현 안 함(이유·다시 여는 조건은 #531): Pydantic 생성·Python CI·FastAPI 참조 어댑터·Fastify 참조 엔진(#940 결정과 `apps/analytics-api` 뒤), PostgreSQL·MSSQL 적합성 CI(참조 어댑터 뒤).
- 경계 lint 규칙 11(FeedbackOps 런타임 의존은 `@ap/ui`만)은 FeedbackOps가 `@ap/contract-schemas`를 런타임에 import할 때만 닿는다. 이 ADR은 규칙을 바꾸지 않는다. Fastify 참조 엔진을 FO 백엔드가 쓰게 되면 [ADR-0073](0073-feedbackops-backend-tests-may-import-conformance-and-http-adapter.md)을 개정한다.
- 선언 버전 헤더(`X-Platform-Declarations`)는 `endpoints.json` 해시로 만들 수 있게 됐지만 켜는 것은 [#154](https://github.com/hjung3113/analytics-platform/issues/154) 몫이다.
