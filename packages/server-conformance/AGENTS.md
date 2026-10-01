# @ap/server-conformance

서버 경계 적합성 묶음(#145). `PlatformAdapter.menuQuery` 구현이 메뉴 조회 계약(06 §5·§19, [실서버 연결 체크리스트](../../docs/integration/real-server-checklist.md))을 지키는지, 엔드포인트 선언과 성공하는 표본 요청 하나만으로 판정한다. 지금은 앱 통합 테스트(`apps/platform-web/src/server-conformance.test.ts`)가 mock 어댑터로 돌리고, 사내 실서버 어댑터가 생기면 같은 하네스로 돌린다.

## 파일

- `src/index.ts` — 하네스 타입 `ServerConformanceHarness`(어댑터, 표본 요청, 부여된 site·기간, 부여 안 된 site, `asGranted`·`withoutPermission`), `planServerConformance`(선언에서 검사 목록 도출, 동기), `runServerConformance`(실행 결과), `describeServerConformance`(vitest 묶음 등록).
- `src/index.test.ts` — 규칙을 일부러 깬 어댑터에서 해당 검사가 실패하는지(묶음 자체의 회귀 테스트).

## 규칙

- import 가능: `@ap/contracts`와 vitest만. `mock-server`·메뉴·React 금지 — 실서버를 mock과 같은 잣대로 판정해야 하므로 어떤 구현도 알지 않는다(lint 프리셋 `serverConformance`).
- 검사는 선언에서 도출할 수 있는 것만 넣는다. 메뉴별 데이터 기대값(수치·행)은 이 묶음이 아니라 메뉴 테스트가 맡는다.
- 계약 규칙(06 §5·§19, 패키지 경계 §4)을 바꾸면 여기 검사와 체크리스트 문서를 같은 PR에서 고친다.

## 검증

`pnpm --filter @ap/server-conformance test`, 그리고 앱 통합 테스트 `pnpm --filter @ap/platform-web test`.
