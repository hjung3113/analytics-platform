# @ap/server-conformance

서버 경계 적합성 묶음(#145, #152). `PlatformAdapter` 전체를 어댑터 구현과 무관하게 — mock·실어댑터를 같은 잣대로 — 검사한다. 검사 목록은 엔드포인트 선언과 하네스 `ports` 표본에서 도출되고, 표본이 없으면 `skipped`로 남는다(통과로 세지 않음). 검사 범위와 사내 준비물은 [체크리스트 §4](../../docs/integration/real-server-checklist.md)가 원본이다. 앱 통합 테스트가 mock으로 돌리고 사내 실어댑터가 생기면 같은 하네스로 돌린다.

## 파일

- `src/index.ts` — 하네스 타입 `ServerConformanceHarness`(어댑터 전체, 표본 요청, 포트 표본 `ports`, 부여된 site·기간, 부여 안 된 site, `asGranted`·`withoutPermission`·`asConsole`), `planServerConformance`(선언에서 검사 목록 도출, 동기), `runServerConformance`(실행 결과), `describeServerConformance`(vitest 묶음 등록).
- `src/index.test.ts` — 규칙을 일부러 깬 어댑터에서 해당 검사가 실패하는지(묶음 자체의 회귀 테스트).

## 규칙

- import 가능: `@ap/contracts`와 vitest만. `mock-server`·메뉴·React 금지 — 실서버를 mock과 같은 잣대로 판정해야 하므로 어떤 구현도 알지 않는다(lint 프리셋 `serverConformance`).
- 검사는 선언에서 도출할 수 있는 것만 넣는다. 메뉴별 데이터 기대값(수치·행)은 이 묶음이 아니라 메뉴 테스트가 맡는다.
- 계약 규칙(06 §5·§19, 패키지 경계 §4)을 바꾸면 여기 검사와 체크리스트 문서를 같은 PR에서 고친다.

## 검증

`pnpm --filter @ap/server-conformance test`, 그리고 앱 통합 테스트 `pnpm --filter @ap/platform-web test`.
