# ADR-0073 — FeedbackOps 백엔드 테스트는 `@ap/server-conformance`·`@ap/http-adapter`를 devDependencies로 import할 수 있다(테스트 코드만). 런타임 코드는 `@ap/ui` 밖의 `@ap/*`를 계속 import하지 않는다

- Status: Decided (2026-10-23), 구현됨 — [#674](https://github.com/hjung3113/analytics-platform/issues/674)(PR [#677](https://github.com/hjung3113/analytics-platform/pull/677), [#671](https://github.com/hjung3113/analytics-platform/issues/671) B7).
- Decider: 사용자 — [#670](https://github.com/hjung3113/analytics-platform/issues/670) D4의 추천(devDependencies·테스트 코드에만 허용, 런타임 import는 금지 검사)을 그대로 채택했다(2026-10-23).
- 보충(2026-10-23, 코디네이터 — 사용자 위임 범위, 되돌릴 수 있음): 구현(#674)에서 어휘 drift 테스트가 TS 소스 파싱 대신 `@ap/contracts/vocab.json`을 읽도록 `@ap/contracts`도 같은 조건(devDependencies, 테스트 코드만)으로 추가했다. 런타임 금지 검사는 `products/feedbackops/scripts/check-boundaries.mjs` 규칙 11.
- Scope: 2026-10-22 전체 리뷰(아키텍처 H2·테스트 H1) 후속. [ADR-0066](0066-feedbackops-merges-into-platform.md) 합류 경계의 예외다. 바탕: [ADR-0069](0069-platform-port-in-feedbackops-backend.md)(플랫폼 포트는 FeedbackOps 백엔드의 `/api/v1/platform` 모듈).

## 맥락

ADR-0066 결정 6으로 플랫폼 실서버는 FeedbackOps 백엔드에서 출발하고, ADR-0069가 그 안에 플랫폼 포트 모듈(`apps/backend/src/modules/platform-port`)을 두었다. 합류 경계에서 FeedbackOps가 받는 플랫폼 패키지는 `@ap/ui` 하나다(루트 AGENTS "FeedbackOps", [저장소 구성](../integration/repository-layout.md) "원본 및 버전": `@ap/ui`는 `workspace:*`로 받는다). 의존 방향은 SDK ← 제품이다([ADR-0043](0043-platform-sdk-is-the-app-contract-and-unified-framework.md)).

플랫폼에는 서버 계약 적합성 묶음 `@ap/server-conformance`(`describeServerConformance`)와 실어댑터 `@ap/http-adapter`(`bootstrapHttpAdapter`)가 있다. mock 서버는 이 묶음을 통과하지만, 실서버인 FeedbackOps 플랫폼 포트는 한 번도 이 잣대로 검사받지 않았다. 지금 경계로는 FeedbackOps 테스트가 두 패키지를 import할 수 없어서 이 공백을 메울 방법이 없다.

## 결정

1. **FeedbackOps 백엔드 테스트는 `@ap/server-conformance`와 `@ap/http-adapter`를 import할 수 있다.** 두 패키지는 `@fops/backend`의 `devDependencies`(`workspace:*`)로만 둔다. import는 테스트 파일(`*.test.ts`·`__tests__/`·통합 테스트 하네스)에서만 한다.
2. **런타임 코드(`src`의 테스트가 아닌 파일)는 `@ap/ui` 밖의 `@ap/*`를 import하지 않는다.** FeedbackOps 백엔드는 플랫폼 계약을 구현할 뿐 플랫폼 패키지에 런타임으로 의존하지 않는다. 운영 의존 그래프는 그대로다.
3. **2를 기계 검사로 막는다.** FeedbackOps 게이트(`scripts/ci/gate.sh static`)에 검사 하나를 둔다. 테스트가 아닌 파일의 `@ap/*` import(`@ap/ui` 제외)와 `dependencies`의 `@ap/*`(`@ap/ui` 제외)를 실패로 본다. 방식(Biome 규칙 또는 스크립트)은 구현에서 고른다.
4. 다른 `@ap/*` 패키지(`@ap/kernel`·`@ap/contracts` 직접 import 등)를 테스트에서 쓰는 것은 이 결정에 들어 있지 않다. 필요해지면 이 ADR을 고친다.

## Considered Options

- **(A) 경계 유지 — 플랫폼 쪽에서만 검사**: 플랫폼 CI가 FeedbackOps 백엔드를 띄워 검사한다. FeedbackOps는 플랫폼 패키지를 모른다. 하지만 Postgres와 FeedbackOps 부트스트랩을 플랫폼 CI가 알아야 해서 경계가 반대로 샌다. FeedbackOps 변경이 적합성을 깨도 FeedbackOps 게이트는 모른다.
- **(B, 채택) 테스트 코드만 devDependencies로 허용 + 런타임 금지 검사**: 실서버가 같은 잣대(`describeServerConformance`)를 FeedbackOps 자기 게이트에서 받는다. 런타임 그래프는 `@ap/ui`만이라는 경계는 검사로 지킨다.
- **(C) 런타임 import까지 허용**: FeedbackOps가 `@ap/contracts` 타입을 직접 써서 대응표 drift를 컴파일 시점에 잡을 수 있다. 대신 제품 런타임이 SDK 계약 패키지 판에 묶이고, ADR-0069가 둔 "포트 모듈이 계약을 구현한다"는 경계가 흐려진다.

## 결과

- ADR-0066에 이 예외를 가리키는 날짜 줄을 둔다(본문은 고치지 않는다).
- 구현([#671](https://github.com/hjung3113/analytics-platform/issues/671) B7, #674·PR #677): FeedbackOps 통합 단계에서 `bootstrapHttpAdapter` → `describeServerConformance`를 돌렸다. contracts 어휘를 JSON 산출물(`@ap/contracts/vocab.json`)로 내보내 FeedbackOps drift 테스트가 읽게 했다. 결정 3의 금지 검사는 `products/feedbackops/scripts/check-boundaries.mjs` 규칙 11로 넣었다. 세 패키지는 `@fops/backend`의 `devDependencies`에 있다.
- vitest 판을 맞춰야 한다. `@ap/server-conformance`는 `vitest ^3.2.7`을 peer로 요구하고, `@fops/backend`는 지금 `vitest 2.1.8`이다. 판 올림은 B7 구현에서 한다.
- [저장소 구성](../integration/repository-layout.md)의 FeedbackOps 의존 서술은 구현 PR에서 이 예외를 더한다.
