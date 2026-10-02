# @ap/server-conformance

서버 경계 적합성 묶음(#145, #152). `PlatformAdapter` 전체를 받아 검사한다 — `menuQuery`는 메뉴 조회 계약(06 §5·§19, [실서버 연결 체크리스트](../../docs/integration/real-server-checklist.md))대로, 나머지 포트는 체크리스트 §2·§5에서 선언만으로 도출되는 규칙대로(`session` 객체 identity·부여 site 목록, `subscribe` 해제 함수(한 번만 호출 — 멱등성은 계약이 요구하지 않는다), `validateScope` 부여/두 번째 부여/미부여/알 수 없음 site, `publishedMetrics` 포인터 모양, `defaultRangeTo` naive wall-clock, `contextOptions` 선택지 목록, `evaluateSelection` 부여 room 필터·미부여 site 0건, `getEntity`·`entityAudit` 권한·site·room 재검증(표본 있을 때)·미등록 type, 콘솔 조회 `auditTrail`·`accessDirectory`·`usageSummary`의 `console:access`, 주석 저장·같은 site 재조회·site 격리·null Scope·클라이언트 `at`·`id`·`user` 거부·비 mart 응답, 활용률 전체 거부·수신 시각 집계, 오류 보고 positive·거부). 거부 응답(`forbidden`·`error`·`too_large`·`timeout`)은 데이터를 싣지 않는다고 검사하고, 성공 응답의 `assessments`(06 §19)와 `trust`(06 §18) 모양도 검사한다. 포트 표본은 하네스의 `ports`(목적지 `EntityRef`·주석 대상 chartId·권한·축 범위·활용률 이벤트·오류 보고 표본·두 번째 부여 site)가 주고, 콘솔 읽기는 `asConsole` 계정으로 돌며 수신 시각 집계 검사는 `sequential` 모드로 혼자 차례로 돌면서 스스로 actor를 전환한다(기록은 부여 계정, 집계 읽기는 콘솔 계정). 기본은 성공하는 요청 하나이고, 선언한 `limits.maxRows`가 있는 엔드포인트는 그것을 넘는 표본(`oversizeParams`)을 추가로 받아 `too_large`·데이터 없음을 검사한다(#175). 표본이 없으면 그 검사는 조용히 빠지지 않는다 — skipped 검사로 계획되어 run 결과에 `status: 'skipped'`로 남고(통과로 세지 않는다) vitest 묶음에는 `it.skip`으로 표시된다. 반대로 `maxRows`를 선언하지 않은 엔드포인트에 `oversizeParams`를 주면 하네스 실수로 실패시킨다. 어댑터 구현과 무관 — mock·실어댑터를 같은 잣대로. 앱 통합 테스트가 돌리고, 사내 실서버 어댑터가 생기면 같은 하네스로 돌린다.

## 파일

- `src/index.ts` — 하네스 타입 `ServerConformanceHarness`(어댑터 전체, 표본 요청, 포트 표본 `ports`, 부여된 site·기간, 부여 안 된 site, `asGranted`·`withoutPermission`·`asConsole`), `planServerConformance`(선언에서 검사 목록 도출, 동기), `runServerConformance`(실행 결과), `describeServerConformance`(vitest 묶음 등록).
- `src/index.test.ts` — 규칙을 일부러 깬 어댑터에서 해당 검사가 실패하는지(묶음 자체의 회귀 테스트).

## 규칙

- import 가능: `@ap/contracts`와 vitest만. `mock-server`·메뉴·React 금지 — 실서버를 mock과 같은 잣대로 판정해야 하므로 어떤 구현도 알지 않는다(lint 프리셋 `serverConformance`).
- 검사는 선언에서 도출할 수 있는 것만 넣는다. 메뉴별 데이터 기대값(수치·행)은 이 묶음이 아니라 메뉴 테스트가 맡는다.
- 계약 규칙(06 §5·§19, 패키지 경계 §4)을 바꾸면 여기 검사와 체크리스트 문서를 같은 PR에서 고친다.

## 검증

`pnpm --filter @ap/server-conformance test`, 그리고 앱 통합 테스트 `pnpm --filter @ap/platform-web test`.
