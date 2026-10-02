# 실서버 연결 체크리스트 (사내 적용)

> 상태: **Candidate** — 지금 mock(`@ap/mock-server`)이 하는 일을 기준으로 실서버·실어댑터가 지켜야 할 것을 모은 목록(#145). 계약의 원본은 [06](../06_platform_ui_contract.md) §5·§6·§17·§19·§22와 [패키지 경계](platform-packages.md) §4이고, 이 문서는 사내 구현자가 한 번에 보도록 묶은 것이다. 충돌하면 원본을 따른다.

## 1. 무엇을 바꾸나

앱은 서버를 `PlatformAdapter` 하나로만 만난다. 지금 `apps/platform-web/src/main.tsx`가 `createMockAdapter({ endpoints, registry })`를 주입하는 자리를 실어댑터로 바꾸는 것이 사내 적용의 전부다. Kernel·셸·공통 컴포넌트·메뉴 화면은 고치지 않는다.

- 실어댑터(클라이언트)는 각 포트 메서드를 서버 호출로 옮긴다. 전송 형식(HTTP 경로·JSON 모양)은 아직 정하지 않았다(§7).
- 서버는 mock 엔진이 하는 판정을 그대로 한다. 판정의 기준은 요청이 아니라 **서버가 가진 엔드포인트 선언 사본**이다.
- 운영 빌드에서는 dev 도구(역할 전환·응답 시나리오, `src/dev/DevTools.tsx`)를 빼고, `menus/*/src/mock/`은 번들에 넣지 않는다 — 지금은 이를 보장하는 장치가 없다(`main.tsx`가 무조건 import). 분리와 번들 검사는 #153.

## 2. `PlatformAdapter` 메서드별로 지킬 것

| 메서드 | 지킬 것 |
| --- | --- |
| `session()` | 동기 스냅샷(사용자 + 접근 가능한 Scope). 세션이 바뀔 때까지 **같은 객체**를 돌려준다 — Kernel이 객체 identity로 Scope 재검증 여부를 정한다. 실어댑터는 Provider 마운트 전에 세션을 받아 둔다(부트스트랩). |
| `subscribe(onChange)` | 재로그인·권한 변경·서버 상태 변경을 알린다. Kernel은 알림마다 `session()`을 다시 읽고 revision을 올려 이전 결과를 한 프레임도 보이지 않게 숨긴다(`kernel/adapter.test.tsx`가 고정). |
| `validateScope(scopeId)` | 그 사용자에게 site가 부여됐는지와 부여된 room. 클라이언트 상태가 아니라 서버 판정이다(06 §6.2). |
| `publishedMetrics()` | 지표별 게시 버전 스냅샷 — `metricId`만 온 진입점을 보완한다. |
| `contextOptions`·`evaluateSelection` | 조건 축 선택지, 조건 결과·조건 밖 선택. 조건 판정은 서버 책임이다. |
| `defaultRangeTo()` | 기본 기간의 기준 시각(wall-clock, 06 §6.3). |
| `menuQuery(req)` | §3 판정 순서 전부. 메뉴 데이터는 모두 이 한 메서드로 온다. |
| `getEntity(ref)` | §22 목적지 단건. 권한은 클라이언트 인수가 아니라 서버 소유 map(예: `equipment` → `equipment:view`)으로 판정하고, site 검증 뒤 그 객체의 room을 다시 검증한다. 거부 응답에 행 필드를 싣지 않는다. 전역 Context·Selection으로 대체하지 않는다. |
| `auditTrail`·`entityAudit` | 변경 감사. 전역은 `console:access`, 단건은 그 목적지의 조회 권한. 클라이언트는 actor·at을 보내지 않는다(서버가 기록). |
| `accessDirectory` | 권한/역할 조회 전용(`console:access`). 부여·회수 쓰기는 원천 결정(#98) 전에는 없다. |
| `recordUsage`·`usageSummary` | 활용률 이벤트 적재(userId 없음 — 서버가 세션 사용자로 기록)와 집계 읽기(`console:access`). 조회조건 수집 여부는 #75 결정 대기. |
| `reportClientError` | 렌더 실패 보고. 식별 필드만 정확한 모양으로 받고, 알 수 없는 키·URL·자유 문장은 통째 거부. 서버가 세션 사용자·시각을 기록한다. |
| `listAnnotations`·`saveAnnotation` | 차트 주석은 서버 소유, `(chartId, scopeId)` 키. 차트 권한과 그 site 부여를 검증한다(06 §16). |

메서드는 반환 모양에 따라 네 묶음이다. 이 분류의 원본은 여기다.

- **envelope 메서드** — `menuQuery`·`getEntity`·`auditTrail`·`entityAudit`·`accessDirectory`·`usageSummary`·`listAnnotations`·`saveAnnotation`. 06 §19 envelope(`outcome` 하나 + 선언한 `assessments` + `trust`)로 답한다. 예외를 던지지 않는다 — 전송 실패도 `error` envelope다.
- **동기 스냅샷** — `session`·`publishedMetrics`·`defaultRangeTo`. 부트스트랩에서 받아 둔 값을 돌려준다(던지지 않음).
- **비 envelope 비동기** — `validateScope`·`contextOptions`·`evaluateSelection`. 자기 반환 타입 그대로다. `contextOptions`·`evaluateSelection`은 전송 실패 때 reject해도 된다(Kernel이 오류·재시도를 보인다). `validateScope`는 지금 reject되면 Kernel이 Scope를 `validating`에 둔 채 멈춘다 — #167 전까지 실어댑터는 전송 실패를 내부 재시도로 흡수하고, 끝내 실패할 때만 reject한다.
- **fire-and-forget** — `recordUsage`·`reportClientError`는 `{ accepted }`를 돌려준다(거부는 `accepted: 0`/`false`). 전송 실패로 reject해도 Kernel이 조용히 무시한다.

그 밖에 `subscribe(onChange)`는 동기 등록이고 해제 함수를 돌려준다.

## 3. `menuQuery` 판정 순서

서버는 요청이 아니라 자기 선언 사본(엔드포인트 id → `EndpointSpec` + 핸들러)으로 판정한다. 순서도 계약이다(앞 단계가 뒤 단계보다 우선).

1. **요청 모양** → 어긋나면 `error`: 최상위 키는 `endpoint`·`context`·`params`뿐, 등록된 엔드포인트, GlobalContext 필드만, `paramKeys` 밖 params 키 없음, 선언이 적용하지 않는 Context 키 없음(Q3), 적용 키 누락 없음(Q9), `time` 적용이면 `from`·`to`가 non-null 문자열, `metric` 적용이면 `metricVersion`은 `metricId` 없이 오지 않음.
2. **params 값** → 엔드포인트의 값 검증(예: 계열에 없는 `metricVersion`)이 거부하면 `error`. 잘못된 요청이지 빈 결과가 아니다.
3. **권한** → 엔드포인트 권한(데이터 접근 권한, 메뉴 권한과 다를 수 있음 — Q5)이 없으면 `forbidden`. 요청 시점의 세션 사용자로 판정하고, 비행 중 역할이 바뀌어도 보낸 사람 기준이다.
4. **Scope** → `requiresScope`면 site 부여 → room 부여 → 조건 → Selection으로 설비 집합을 해석하고, 부여 밖이면 `forbidden`(Scope `null`도 `forbidden`).
5. **한도** → `limits.maxHours`를 넘고 좁은 Selection이 없으면 `too_large`.
6. **명시적 공집합** → 적용된 집합 키가 `[]`면 원천을 읽지 않고 `empty`, assessments 없음, trust `null`(06 §19).
7. **시간 도메인** → `mergeTimeDomain`이면 2대 이상을 한 시간축에 합칠 수 있는지 §6.3 판정, 안 되면 `error`.
8. **핸들러** → 해석된 설비, 적용 Context만 남긴 값(비적용 키는 "제약 없음"), params, 세션 사용자를 받아 계산. 데이터로만 판정할 수 있는 잘못된 요청(예: 다른 사용자에게 발급한 커서)은 `error`.
9. **행 상한** → `limits.maxRows`를 선언한 비페이지 엔드포인트(내보내기·탐색)는 핸들러가 돌려준 결과 **전체**(페이지가 아님)로 판정한다. 배열 길이가 `maxRows`를 넘으면 데이터 없이 `too_large`(원천을 다 읽기 전에 판정할 수 있으면 그렇게 — 단, 1–8단계 판정이 언제나 앞선다). ids를 params로 받는 선택 내보내기(#173)는 ids로 거른 **뒤의 크기**가 기준이라 큰 필터 결과 안의 작은 선택도 내보낼 수 있다. 선언했는데 핸들러가 배열이 아닌 값을 돌려주면 데이터 답이 아니라 계약 `error`(선언 오용)다. 페이지 엔드포인트에 선언하면 등록 검증이 거부한다.
10. **응답** → `assessments`는 선언한 kind마다 정확히 하나. mart 데이터면 `trust`(갱신 시각·데이터 기준 시각·커버리지·지표 버전·잠정 여부·원천), FeedbackOps 같은 비 mart 원천이면 `trust: null`. 원천 의존 kind(`collection`·`processing_delay`·`coverage`)의 원천이 아직 없으면(#37 합의 전) 빼지 않고 `state: 'unknown'`, `reason: 'source_unavailable'`로 답한다(06 §19 — 생략은 계약 위반, 행 수로 `clear`를 추론하지 않음). Trust는 키가 모두 필수이고 모르는 값(`dataThrough`·`coverage`)은 `null`(06 §18, `@ap/contracts` `Trust`).

Kernel은 받은 `ok`/`empty`의 kind가 선언과 다르면 `contract_violation` 오류로 바꾼다 — 서버가 틀리면 화면에 그대로 드러난다.

**내보내기 엔드포인트(#173, [ADR-0008](../adr/0008-table-owned-export-fixed-toolbar.md))** — 표가 파일을 만들고 서버는 행만 준다. 핸들러가 지킬 것:

- 행 배열을 돌려주고 `limits.maxRows`를 선언한다(위 9단계).
- `sorting`(`PageSort[]`)을 받아 **같은 메뉴의 페이지 엔드포인트와 같은 정렬**(같은 ORDER BY와 결정적인 동순위 기준)으로 돌려준다 — 화면에서 본 순서와 파일 순서가 같아야 한다.
- 선택 내보내기의 `ids`는 부여된 Scope·페이지 필터를 적용한 **뒤** 거른다 — ids로 Scope를 넓힐 수 없다. 9단계 행 상한은 이 결과의 크기로 판정한다.

### 등록 검증 (서버 기동 시)

앱이 넘긴 메뉴 Registry로 엔드포인트 목록을 검증하고 하나라도 어긋나면 기동을 거부한다: 엔드포인트 id 중복 없음, `menuId`가 Registry에 있음, 권한 이름이 어떤 메뉴가 선언한 권한임, 엔드포인트가 `apply`한 키를 소유 메뉴도 `apply`함, 메뉴가 Scope를 요구하면 엔드포인트도 요구, Scope 없는 엔드포인트는 site 종속 키(`roomNames`·`condition`·`selection`·`lot`·`recipe`·`ppid`)를 `apply`할 수 없음(규칙 6), `limits.maxRows`는 양의 정수이고 페이지·커서 엔드포인트(`page`·`pageSize`·`cursor` paramKeys)가 아닐 것(규칙 7, #175). 원본: `packages/mock-server/src/adapter.ts` `createMockAdapter`.

## 4. 적합성 묶음으로 확인하기

[`@ap/server-conformance`](../../packages/server-conformance/AGENTS.md)는 §3의 1·3·4·6·10(그리고 표본이 있으면 9)을 엔드포인트 선언에서 도출해 검사한다(엔드포인트마다 성공 요청, 알 수 없는 키·비적용 키·적용 키 누락·`from` null·`metricVersion` 단독 거부, 권한 없으면 `forbidden`, 부여 안 된 site·`null` Scope `forbidden`, 명시적 공집합, kind 정확히 일치). 선언한 `maxRows`가 있고 표본 요청이 `oversizeParams`를 갖고 있으면(#175), 그 요청이 `too_large`로 데이터 없이 답하는지도 검사한다. 지금은 `apps/platform-web/src/server-conformance.test.ts`가 앱의 모든 메뉴 엔드포인트와 mock 어댑터로 돌린다.

실어댑터를 붙이면 같은 하네스를 실어댑터로 만든다. 사내에서 준비할 것:

- `adapter`: 실어댑터(테스트 환경 서버를 가리킴).
- `cases`: 엔드포인트 선언과 표본 요청 — 앱 테스트의 `PARAMS` 표를 그대로 쓸 수 있다.
- `context`·`foreignScopeId`: 테스트 계정에 부여된 site·기간, 부여되지 않은 site.
- `asGranted`·`withoutPermission`: 모든 엔드포인트 권한을 가진 테스트 계정과, 권한 하나씩만 뺀 계정(또는 그렇게 세션을 바꾸는 테스트 훅).
- `oversizeParams`(`maxRows`를 선언한 엔드포인트마다): 테스트 서버에서 선언 상한을 넘는 결과가 나오는 표본 요청. 앱 테스트의 `PARAMS` 표에는 없다(mock 데이터가 작다) — 테스트 환경에 상한보다 많은 행을 준비해야 한다. 표본이 없으면 그 검사는 건너뛰었다고 표시된다.

지금 묶음은 `menuQuery`만 검사한다. §2의 나머지 포트 메서드로 넓히는 일은 #152.

묶음이 다루지 않는 것(메뉴별 수치·행, `maxHours` 등 한도 경계값 — `maxRows`는 초과 표본만 검사한다, 시간 도메인 경계값, 비 mart `trust: null`)은 메뉴 테스트와 E2E(`pnpm e2e`)가 맡는다.

## 5. 세션·사용자

- 클라이언트는 사용자 id·actor를 보내지 않는다. 사용자는 서버가 세션으로 찍는다(활용률·오류 보고·감사·내 VOC).
- 시각은 계약마다 다르다. 감사·차트 주석·오류 보고는 서버가 기록 시각을 찍는다. 활용률 이벤트는 서버가 **수신 시각**을 찍고, `usageSummary`의 기간 필터·`lastUsedAt`은 그 수신 시각으로 계산한다. 이벤트의 `at`·`enteredAt`(클라이언트 epoch ms)은 모양(유한한 숫자)을 검사한 뒤 버리지 않고 저장한다 — 하나라도 어긋나면 호출 전체를 거부한다. `enteredAt`은 같은 진입의 dwell을 하나로 합치는 키이고, `dwellMs`는 클라이언트가 계산한 값이다(서버가 다시 계산하지 않음). 원본 동작: `packages/mock-server/src/server.ts` `recordUsage`·`aggregateUsage`.
- 인증은 FeedbackOps 방식(AuthProvider: Mock + OIDC 계열, 서버 세션)으로 정했다(#35). 실제 IdP 설정값은 사내 SSO 사양 확인 뒤.
- 역할 소속의 원천은 IdP 그룹 claim 사양이 나올 때까지 보류(#98). 그 전에는 부여·회수 쓰기를 만들지 않는다.

## 6. 시간

- 설비 wall-clock(분석 기간·anchor)은 naive 문자열로 주고받고 time zone으로 옮기지 않는다(`formatDateTime`). 실제 시점(감사·활용률 epoch·timestamptz)은 `formatInstant`(06 §6.3).
- `from`/`to`는 `[from, to)`. 기본 기간은 `defaultRangeTo()` 기준으로 클라이언트가 절대값으로 채운 뒤 요청한다.

## 7. 아직 사람 결정이 필요한 것

순서·담당자별 질문 목록은 [사내 적용 가이드](in-house-rollout.md) §2–§3, 진행은 지도 이슈 [#157](https://github.com/hjung3113/analytics-platform/issues/157).

| 결정 | 왜 필요한가 |
| --- | --- |
| 메뉴 조회 포트 Q2(#148) — 선언 원본을 TS로 두고 서버가 읽을지, FastAPI에서 생성할지 | 서버의 "선언 사본"을 어디서 가져올지. 공개 스키마·codegen(PLATFORM_REQUIREMENTS)도 여기에 달려 있다. |
| 전송 형식(#149, 초안 → 합의) — HTTP 경로·메서드·JSON 모양, 취소(`AbortSignal`)·타임아웃 | 실어댑터와 서버의 경계. mock은 함수 호출이라 정해진 게 없다. |
| 사내 SSO 사양(#150)·역할 소속 원천(#98) | 세션·권한의 원천. |
| 적재 워커 상태 스키마(#37) | 데이터 신뢰(`trust`, `collection`·`processing_delay`·`coverage` assessment)의 원천. 합의 전 서버 동작은 §3-10. 합의 뒤 모니터링(#51). |
| FeedbackOps API(#84 설문 응답 읽기, #85 신고자 딥링크, #86 실제 VOC 어댑터) | 내 VOC·설문 화면의 비 mart 원천. |
| 배포·인프라 환경(#151) | 같은 출처 배포·쿠키·CSRF, 망분리 빌드, CI 위치. 전송 형식 합의가 여기에 기댄다. |
