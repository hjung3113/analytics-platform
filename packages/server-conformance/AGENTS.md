# @ap/server-conformance

서버 경계 적합성 묶음(#145, #152). `PlatformAdapter` 전체를 어댑터 구현과 무관하게 — mock·실어댑터를 같은 잣대로 — 검사한다. 검사 목록은 엔드포인트 선언과 하네스 `ports` 표본에서 도출되고, 표본이 없으면 `skipped`로 남는다(통과로 세지 않음). 검사 범위와 사내 준비물은 [체크리스트 §4](../../docs/integration/real-server-checklist.md)가 원본이다. 앱 통합 테스트가 mock으로 돌리고, FeedbackOps 백엔드 통합 테스트가 실서버·실어댑터로 돌린다(#674, 테스트 코드 devDependency — ADR-0073).

## 파일

- `src/types.ts` — 공개 타입. 하네스 타입 `ServerConformanceHarness`(어댑터 전체, 표본 요청, 포트 표본 `ports`, 부여된 site·기간, 부여 안 된 site, `asGranted`·`withoutPermission`·`asConsole`·`asOtherAnnotator`, 쓰기 표본 `actions`(`ActionCase`) — `menuAction` 검사는 표본이 없으면 `actions: no sample` 건너뜀 한 건).
- `src/index.ts` — 공개 이름만 다시 내보내는 배럴(타입 + `planServerConformance`·`runServerConformance`·`describeServerConformance`). `src/helpers.ts` — 상수·응답 형태 도우미. `src/plan/endpoints.ts` — `planServerConformance`(선언에서 검사 목록 도출, 동기)와 `declareGaps`. `src/plan/actions.ts`·`src/plan/conditions.ts` — 쓰기·Condition 검사. `src/plan/ports/` — 포트 검사를 구간별 파일(`sites`·`snapshots`·`entity`·`entity-audit`·`console`·`annotations`·`usage`·`client-error`)로 나눠 `index.ts`의 `planPortChecks`가 원래 순서대로 잇고, `selection-ports.ts`는 옵션 포트 검사. `src/run.ts` — `runServerConformance`(실행 결과), `describeServerConformance`(vitest 묶음 등록).
- `src/__tests__/conformance.test.ts` — 규칙을 일부러 깬 어댑터에서 해당 검사가 실패하는지(묶음 자체의 회귀 테스트).
- 실행 중 건너뜀(#826, ADR-0085): `entityAudit` 쪽 나누기 검사 9건은 첫 쪽 응답에 `nextCursor` 키가 없으면 `server does not page entityAudit`로, 표본에 감사 행이 없으면 `the sample has no audit events to page (…)`로 `skipped`가 된다(통과로 세지 않고, 이 두 경우에는 `cursor`를 보내지 않는다). 표본이 한 쪽에 들어가 발급 커서가 없으면 발급 커서가 필요한 4건만 건너뛰고 나머지 5건은 돈다.
- 선언한 빈틈(#674): 하네스 `implemented`(서버가 구현한 포트 메서드)·`siteGrants: false`(site 부여 없는 서버)와 site 없는 목적지 표본(`scopeId: null`)은 해당 검사를 이유를 단 `skipped`로 바꾼다. 검사마다 정의하는 자리에서 `uses`(부르는 메서드)·`needsSites`를 직접 단다 — id에서 추론하지 않는다. `uses`가 빈 검사는 계획 단계에서 오류이고, `__tests__/conformance.test.ts`가 검사마다 기록 어댑터로 실제 부른 메서드가 `uses` 안에 있는지 확인한다. Scope가 필요한 엔드포인트·액션의 검사는 모든 요청이 `context.scopeId`를 보내므로 전부 `needsSites`다.

## 규칙

- vitest는 peer(`^3.2.7`)다. FeedbackOps 백엔드는 vitest 2.1.8로 이 묶음을 돌리는데(#674), 묶음의 `describe`·`it`·`expect`는 import 시점에 실행 중인 vitest 인스턴스에 붙으므로 그대로 동작한다. pnpm은 이 peer 불일치를 경고만 한다. 묶음이 vitest 3 전용 API를 쓰기 시작하면 FeedbackOps 쪽 vitest를 먼저 올린다.
- import 가능: `@ap/contracts`와 vitest만. `mock-server`·메뉴·React 금지 — 실서버를 mock과 같은 잣대로 판정해야 하므로 어떤 구현도 알지 않는다(lint 프리셋 `serverConformance`).
- 검사는 선언에서 도출할 수 있는 것만 넣는다. 메뉴별 데이터 기대값(수치·행)은 이 묶음이 아니라 메뉴 테스트가 맡는다.
- 계약 규칙(06 §5·§19, 패키지 경계 §4)을 바꾸면 여기 검사와 체크리스트 문서를 같은 PR에서 고친다.

## 검증

`pnpm --filter @ap/server-conformance test`, 그리고 앱 통합 테스트 `pnpm --filter @ap/platform-web test`.
