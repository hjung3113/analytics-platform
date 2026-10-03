# 실어댑터 전송 형식 (HTTP 경계) — 초안

> 상태: **Candidate** — 2026-10-02 에이전트 초안(#149). 사내 백엔드(FastAPI) 담당과 합의하기 전까지 구현 지시가 아니다. 실어댑터(이 저장소, #154)와 FastAPI 플랫폼 API(사내, #155)가 이 문서 하나를 보고 따로 구현할 수 있게 하는 것이 목적이다. 각 절의 표기: **[제안]** 에이전트 제안, **[백엔드]** 사내 백엔드 담당 확인, **[#151]** 배포·인프라, **[#150]** 사내 SSO, **[#148]** 선언 원본 결정, **[#165]**/**[#155]** 세대 신호.

## 읽는 순서·관계

- 메서드의 **의미**(무엇을 지키는가)의 원본은 [실서버 연결 체크리스트](real-server-checklist.md) §2(메서드 표·네 묶음), §3(`menuQuery` 판정 순서), §5(세션·사용자·시각), §6(시간). 이 문서는 그것을 **HTTP로 어떻게 나르는가**만 정한다. 충돌하면 체크리스트와 [06](../06_platform_ui_contract.md)(§4 Correlation ID·Error Boundary, §6.3 wall-clock/instant, §19 envelope)을 따른다.
- 남은 사람 결정 목록은 체크리스트 §7과 [사내 적용 가이드](in-house-rollout.md) §2–§3. 이 문서의 질문 목록(§10)은 가이드 §3.3의 #149 항목을 펼친 것이다.
- 실어댑터는 `#platform-assembly`의 `createAssembly` 모듈로 꽂는다([ADR-0009](../adr/0009-production-assembly-injection.md), 구현 [#154](https://github.com/hjung3113/analytics-platform/issues/154)). 서버 구현은 [#155](https://github.com/hjung3113/analytics-platform/issues/155), 폴링·세대 재검증은 [#165](https://github.com/hjung3113/analytics-platform/issues/165).
- 타입 원본: `packages/contracts/src/adapter.ts`(`PlatformAdapter`), `response.ts`(`ApiResponse`), `menu-query.ts`(`MenuQuery`).

## 1. 메서드 → HTTP 매핑

**[제안]** 공통 규칙:

- 접두사 하나: `/api/v1`. 플랫폼 포트는 `/api/v1/platform/...`, 메뉴 조회는 `/api/v1/menu-query` 한 경로.
- 요청·응답 본문은 JSON(`Content-Type: application/json; charset=utf-8`). 필드 이름은 `@ap/contracts` 타입 그대로(camelCase) — 어댑터가 이름을 바꾸지 않는다. 모르는 키는 체크리스트대로 서버가 거부한다(요청 쪽). 반대로 **어댑터는 응답의 모르는 키를 무시한다** — 서버가 필드를 더해도(§4 후보 (c), §8) 구버전 어댑터가 깨지지 않게.
- **[제안] 모든 `/api/**` 응답은 `Cache-Control: no-store`.** `bootstrap`(csrfToken 포함)·`session-state`·`validateScope`·`contextOptions`·`listAnnotations`·`usageSummary`가 사용자별 GET이라, 사내 프록시·브라우저 휴리스틱 캐시가 재사용하면 낡은 권한 판정이나 다른 사용자의 응답이 보일 수 있다. 프록시 캐시 설정은 [#151].
- **배열·객체가 들어가는 조회 조건은 `POST` 본문**으로 보낸다(`menuQuery`·`evaluateSelection`·`auditTrail`·`accessDirectory`). 이유: `Condition`·`IdSet`·`sort`는 중첩·배열이라 쿼리스트링 인코딩 규칙(반복 키·대괄호·쉼표)을 양쪽이 따로 정해야 하고, 설비 Selection은 URL 길이 한도를 넘을 수 있으며, 쿼리스트링은 프록시·접근 로그에 남는다. 이 `POST`들은 상태를 바꾸지 않는 읽기다(CSRF 대상 아님 — §6).
- 스칼라 몇 개뿐인 읽기는 `GET` + 쿼리스트링(`validateScope`·`contextOptions`·`listAnnotations`·`usageSummary`).
- 목적지 단건(`getEntity`·`entityAudit`)은 `type`/`id`를 경로에 넣지 않고 `POST` 본문으로 보낸다. id는 opaque라 경로 인코딩·로그 노출을 피하고, `scopeId: null`(site 없는 type)을 그대로 보낼 수 있다.

| 메서드 | HTTP | 요청 | 응답 본문 |
| --- | --- | --- | --- |
| `session()` | (부트스트랩) `GET /api/v1/platform/bootstrap` | — | `{ session, publishedMetrics, defaultRangeTo, sessionVersion, csrfToken, generation? }` — §3 |
| `publishedMetrics()` | (부트스트랩) 같은 응답 | — | 위 `publishedMetrics` |
| `defaultRangeTo()` | (부트스트랩) 같은 응답 | — | 위 `defaultRangeTo`(naive wall-clock `YYYY-MM-DDTHH:mm:ss`, 06 §6.3) |
| `subscribe(onChange)` | (네트워크 없음) 어댑터 내부 등록 + 폴링 `GET /api/v1/platform/session-state` | — | `{ sessionVersion: string, generation?: string }` — §4 |
| `validateScope(scopeId)` | `GET /api/v1/platform/scopes/{scopeId}/check` | 경로 `scopeId` | `ScopeCheck` |
| `contextOptions(scopeId)` | `GET /api/v1/platform/context-options?scopeId=…` | 쿼리 `scopeId` | `ConditionOptions` |
| `evaluateSelection(input)` | `POST /api/v1/platform/selection/evaluate` | `SelectionInput` | `SelectionEvaluation` |
| `getEntity(ref)` | `POST /api/v1/platform/entity` | `EntityRef` | `ApiResponse<unknown>` |
| `menuQuery(req)` | `POST /api/v1/menu-query` | `MenuQuery`(`{ endpoint, context, params }` 그대로) | `ApiResponse<unknown>` |
| `recordUsage(events)` | `POST /api/v1/platform/usage-events` | `{ events: UsageEvent[] }` | `{ accepted: number }` |
| `reportClientError(report)` | `POST /api/v1/platform/client-errors` | `ClientErrorReport` | `{ accepted: boolean }` |
| `usageSummary(range)` | `GET /api/v1/platform/usage-summary?preset=all` 또는 `?from=…&to=…`(epoch ms) | 쿼리 | `ApiResponse<UsageSummary>` |
| `auditTrail(query)` | `POST /api/v1/platform/audit-trail/search` | `AuditTrailQuery` | `ApiResponse<AuditTrailPage>` |
| `entityAudit(ref)` | `POST /api/v1/platform/entity/audit` | `EntityRef` | `ApiResponse<{ events: AuditEvent[] }>` |
| `accessDirectory(query)` | `POST /api/v1/platform/access-directory/search` | `AccessDirectoryQuery` | `ApiResponse<AccessDirectoryPage>` |
| `listAnnotations(ref)` | `GET /api/v1/platform/annotations?chartId=…&scopeId=…` | 쿼리(`scopeId` 없으면 빼고 보냄 → 서버 `forbidden`) | `ApiResponse<{ items: ChartAnnotation[] }>` |
| `saveAnnotation(input)` | `POST /api/v1/platform/annotations` | `AnnotationInput`(작성자·`at`·`id` 없음 — 있으면 거부) | `ApiResponse<ChartAnnotation>` |

`recordUsage`의 본문을 배열이 아닌 `{ events }`로 감싸는 이유: 최상위 JSON 배열은 나중에 필드(예: 배치 id)를 더할 수 없다.

**`menuQuery`의 엔드포인트 id는 경로가 아니라 본문에 둔다** [제안]. 이유: (1) 경로 하나라 프록시·인증·로그·rate limit 설정이 한 번이다. (2) 서버는 어차피 본문의 `endpoint`로 자기 선언 사본을 찾는다(체크리스트 §3 1단계 — "등록된 엔드포인트"도 요청 모양 판정의 일부) — 경로에도 있으면 둘이 다를 때의 규칙이 하나 더 생긴다. (3) 클라이언트가 경로를 조립하지 않으므로 `MenuQuery`를 그대로 직렬화하면 끝이다. 대안(한 줄): `POST /api/v1/menu-query/{endpointId}` — 접근 로그에서 엔드포인트별 집계가 쉽지만, 같은 정보는 서버가 구조화 로그에 `endpoint` 필드로 남기면 된다.

다른 대안(한 줄씩): 메서드마다 REST 리소스로 나누기(`GET /audit-events?...`) — 중첩 필터를 쿼리스트링에 인코딩해야 해서 기각. JSON-RPC 한 경로(`POST /api/v1/rpc { method, args }`) — 프록시·로그에서 메서드 구분이 안 되고 FastAPI 라우팅·OpenAPI 이점을 잃어서 기각.

## 2. HTTP 상태와 `outcome`

**[제안] 판정된 결과는 전부 HTTP 200.** envelope 메서드는 서버가 판정한 모든 결과(`ok`·`empty`·`forbidden`·`too_large`·`timeout`·판정 단계의 `error`)를 **200 + envelope**로 답한다. 클라이언트는 상태 코드를 `outcome`으로 바꾸는 표를 갖지 않는다 — `outcome`의 원본은 하나(본문)다. 권한 거부도 403이 아니라 200 + `forbidden`이다(체크리스트 §3 3·4단계, 거부 응답에는 데이터·행 필드 없음).

비 envelope 메서드(`validateScope`·`contextOptions`·`evaluateSelection`)도 판정 결과는 200 + 자기 타입이다(`ScopeCheck.status: 'forbidden'`도 200). 요청 모양이 틀린 경우(모르는 키 등)는 422.

**[제안] fire-and-forget(`recordUsage`·`reportClientError`)의 판정된 거부는 200 + `{ accepted: 0 }`/`{ accepted: false }`** — 필수다(체크리스트 §2 "거부는 `accepted: 0`/`false`", 적합성 묶음 `expectAccepted`/`expectReported`는 resolve를 기대하고 reject를 실패로 센다). 모르는 키(`userId`·`url` 등)도 판정된 거부다. 422는 본문이 JSON으로 파싱조차 안 되는 경우에만 쓰고, 어댑터는 그 422도 `{ accepted: 0 }`/`{ accepted: false }`로 **푼다**(§2.2).

**[제안] FastAPI 기본 422를 envelope 경로에서 피한다.** FastAPI는 본문 모델 검증에 실패하면 핸들러보다 먼저 422 `{ detail: [...] }`를 돌려준다(Pydantic `extra='forbid'`면 모르는 키도). 그러면 체크리스트 §3 1단계(모르는 키·등록 안 된 endpoint → `error` envelope + 서버 `correlationId`)와 `saveAnnotation`의 작성자·`at`·`id` 거부가 envelope가 아니라 `http_422`가 되어 서버 로그와 잇는 id와 `message`를 잃는다. 그래서 envelope 경로와 fire-and-forget 경로는 본문을 원시 dict(`Body()`/`await request.json()`)로 받아 1단계 형식 판정을 직접 하거나, 그 경로에 한해 `RequestValidationError` 핸들러가 200 + `error` envelope(fire-and-forget는 200 + `accepted` 0/false)를 돌려준다 [백엔드].

**[제안] 서버 `message`는 사용자에게 보일 수 있는 짧은 문장이나 코드다.** `StateView`는 `forbidden`·`too_large`·`error`의 `message`를 화면에 그대로 렌더한다. 예외 문자열(`str(exc)`)·SQL·테이블명·스택·행 id·개인 값은 싣지 않는다(#101과 같은 이유). 상세는 서버 로그에 correlationId로 남긴다.

200이 아닌 것은 **전송·인프라 실패에만** 쓴다:

| HTTP | 뜻 | 누가 |
| --- | --- | --- |
| 401 | 세션 없음·만료 | 서버 인증 계층(§6) |
| 403 | CSRF 토큰 불일치(§6). 권한 판정에는 쓰지 않는다 | 서버 |
| 404 | 경로 없음(배포·버전 불일치). 모르는 엔드포인트 id는 404가 아니라 200 + `error`(§3 1단계) | 서버·프록시 |
| 413 | 본문이 프록시·서버 한도를 넘음 | 프록시 |
| 422 | 비 envelope 메서드의 요청 모양 거부. fire-and-forget는 JSON 파싱 불가일 때만(어댑터가 `accepted` 0/false로 변환 — §2.2) | 서버 |
| 429 | rate limit(FeedbackOps ADR-0015처럼 `Retry-After`) | 서버 |
| 5xx·502/503/504 | 처리 중 예외, 프록시·게이트웨이 | 서버·프록시 |

FeedbackOps ADR-0012는 오류를 상태 코드 + `{ code, message, detail }`로 나른다. 이 플랫폼은 06 §19 envelope가 이미 결과를 나르므로 그 모양을 envelope 메서드에 쓰지 않는다. 200이 아닌 응답의 본문은 FeedbackOps 모양(`{ code, message }`)을 써도 되지만 어댑터는 본문을 해석하지 않는다(아래 표). 대안(한 줄): 403/413/504를 `forbidden`/`too_large`/`timeout`에 매핑 — 프록시가 만든 403·504와 서버 판정이 구분되지 않고, 거부에도 `assessments`·`correlationId`가 필요해서 기각.

### 2.1 어댑터 변환 표 — envelope 메서드

envelope 메서드는 **reject하지 않는다**(체크리스트 §2). 실패는 아래처럼 envelope로 바꾼다. 모든 변환 envelope는 `data: null`, `assessments: []`, `trust: null`.

| 상황 | `outcome` | `message` | `correlationId` |
| --- | --- | --- | --- |
| 200 + 올바른 envelope | 그대로 | 그대로 | 서버 값 |
| Kernel이 넘긴 `signal`로 중단 | (outcome 아님) — 결과를 쓰지 않는다. 어댑터는 `AbortError`로 reject해도 되고 Kernel은 그 identity의 결과를 버린다(superseded) | — | — |
| 어댑터 내부 타임아웃(§5) | `timeout` | `client_timeout` | 요청 헤더로 보낸 id |
| 네트워크 실패(`fetch` reject: DNS·연결 끊김·CORS) | `error` | `network_error` | 요청 헤더로 보낸 id |
| 401 | `error` + 세션 재확인 시작(§4) | `session_expired` | 응답 헤더 id, 없으면 요청 id |
| 403(CSRF)·404·413·422·429·5xx | `error`(504도 `error` — 게이트웨이 타임아웃은 서버 판정이 아니다) | `http_<status>` | 응답 헤더 id, 없으면 요청 id |
| 200인데 JSON 아님 / 파싱 실패 | `error` | `invalid_response` | 응답 헤더 id, 없으면 요청 id |
| 200 JSON인데 envelope 아님(`outcome`이 6개 밖, `assessments` 배열 아님, `correlationId` 없음 등 — 모르는 키는 무시하고 판정하지 않는다) | `error` | `invalid_envelope` | 같음 |
| 3xx·`opaqueredirect`(SSO 게이트웨이 리다이렉트 — §6) | `error` + 세션 재확인 시작(§4) — 401과 같이 처리 | `session_expired` | 요청 id |

`message`는 짧은 코드 문자열이다(URL·응답 본문·스택을 싣지 않는다 — #101의 "자유 문장 금지"와 같은 이유). 선언 kind 검사(`contract_violation`)는 어댑터가 아니라 Kernel이 한다(체크리스트 §3 끝) — 어댑터는 envelope 모양만 본다. 어댑터가 만드는 코드(`http_503`·`network_error` 등)도 화면에 그대로 보이므로 같은 규칙을 지킨다.

### 2.2 그 밖의 묶음

- **비 envelope 비동기**(`validateScope`·`contextOptions`·`evaluateSelection`): 위 실패 상황에서 **reject**한다. 응답 모양 검사는 위 표의 실패 상황(JSON 아님·필수 필드 없음)만 보고, 모르는 키는 무시한다. **어댑터 내부 타임아웃은 `AbortError`로 reject하지 않는 것을 권한다** — `AbortSignal.timeout`(`TimeoutError`)을 쓰거나 `AbortError`가 아닌 오류로 감싼다. Kernel은 `AbortError`라는 이름으로 취소를 판정하지 않는다(#183 — 취소 판정은 `kernelSignal.aborted`뿐이다), 그래서 이 표기는 이제 로그·디버깅 가독성을 위한 취향일 뿐 필수가 아니다. `validateScope`는 어댑터가 내부에서 짧게 재시도해도 된다(체크리스트 §2) [제안: 네트워크 실패·502/503에 한해 1회].
- **fire-and-forget**(`recordUsage`·`reportClientError`): 200이면 본문(`{ accepted }`), 422면 `{ accepted: 0 }`/`{ accepted: false }`로 **푼다**(필수 — §2, 적합성 묶음이 거부 호출의 resolve를 기대한다). 그 밖의 전송 실패(네트워크·5xx 등)는 reject해도 된다(Kernel이 무시). 재시도하지 않는다.
- **동기 스냅샷**은 네트워크를 타지 않는다(§3).

## 3. 부트스트랩과 동기 메서드

`session()`·`publishedMetrics()`·`defaultRangeTo()`는 동기다. **[제안]** Provider가 마운트되기 전에 한 번 읽는다:

```
GET /api/v1/platform/bootstrap
200 { "session": Session, "publishedMetrics": PublishedMetric[], "defaultRangeTo": "2026-10-02T09:00:00",
      "sessionVersion": "…", "csrfToken": "…", "generation": "…" }
401 → 로그인 필요(§6)
```

- `sessionVersion`은 세션 내용(사용자·권한·부여 Scope)이 바뀔 때만 바뀌는 opaque 토큰 [제안]. 기본 만드는 법 [제안]: 세션 응답(`Session`)의 정규화 JSON 해시 — 사용자 교체, 라벨·부여 수 변화가 자동으로 포함된다. `generation`은 §4의 계산 세대(Open).
- **조립에서 받는 법(#154 구현 세부, 코드는 이 이슈에서 바꾸지 않음)**: 지금 `CreateAssembly`는 동기(`({ registry }) => { adapter, topBarTools }`)다. 두 안: (A) 실조립이 `createAssembly` 전에 끝나는 부트스트랩 promise를 내보내고 컴포지션 루트(`main.tsx`)가 그것을 기다린 뒤 `createRoot`; (B) `CreateAssembly`를 `Promise`를 돌려도 되게 넓히고 `main.tsx`가 `await`. [제안] (B) — 조립 계약 하나로 끝나고 mock 조립은 `Promise.resolve`로 같은 모양이 된다. (B)의 `main.tsx` top-level await는 Vite 7 기본 target에서 되고, `.then(createRoot…)`도 된다. (B)면 `typecheck-assembly.ts`와 그 테스트, `mock-assembly.tsx`도 함께 바뀐다 — #154 메모. 어느 쪽이든 ADR-0009 조립 계약 변경이므로 #154에서 정한다. 부트스트랩 실패(네트워크·5xx) 때 앱 전체 오류 화면을 보일지는 #154 화면 결정.
- **identity 규칙 [제안] — 둘로 나눈다**:
  1. **세션 스냅샷 객체**(`session()` identity): 어댑터는 스냅샷 하나를 들고 `session()`마다 **같은 객체**를 돌려준다. 새 부트스트랩 결과의 `sessionVersion`이 다를 때만 새 객체로 바꾸고, 같으면 스냅샷은 그대로 둔다(Kernel이 identity로 Scope 재검증 여부를 정한다 — 체크리스트 §2).
  2. **전송 자격(`csrfToken`)**: 부트스트랩을 받을 때마다 `sessionVersion`과 무관하게 **항상 새 값으로 바꾼다**. 토큰은 세션 내용이 아니라 세션(쿠키) 자체에 묶여 있어서, 만료 뒤 같은 사용자가 재로그인하면 `sessionVersion`은 같아도 토큰은 바뀐다. 스냅샷과 함께 버리면 이후 상태 변경 호출이 전부 403이 되고 새로고침 전까지 복구되지 않는다.
  - 상태 변경 호출이 403(CSRF)을 받으면 어댑터는 재부트스트랩(§4 3단계)으로 토큰을 갱신한다. 그 호출을 자동으로 다시 보내지는 않는다(`Idempotency-Key`가 합의되면 그때 1회 재전송을 검토 — §6).
- `publishedMetrics()`·`defaultRangeTo()`는 **페이지 수명 동안 고정**이고 새로고침해야 갱신된다 [제안]. Kernel은 두 값을 렌더할 때만 읽어서, `onChange` 없이 값을 바꾸면 반영되지 않고 `onChange`를 부르면 결과가 숨겨진다. 하루 넘게 열린 탭의 기준이 낡는 문제는 05 기본 Δ와 함께 Open이고, 결과를 숨기지 않는 세대 경로(#165)로 갱신하는 것이 후보다.

대안(한 줄): 세 값을 각각 `GET`(세 왕복, 부분 실패 상태가 생김 — 기각); HTML에 서버가 JSON을 심기(정적 산출물 + 프록시 배포와 맞지 않음 — [#151] 답에 따라 재검토).

## 4. `subscribe` — 세션·서버 상태 변화 알림

05/01 실시간성(Decided): 클라이언트 폴링 5분 + 계산 세대 기반 재검증. **[제안]**:

> **Candidate — 포트 의미 변경**: 아래는 `subscribe`를 세션·권한 변경 전용으로 좁힌다. 포트 원본(`adapter.ts` `subscribe` 주석 "session or server-side state changed", 체크리스트 §2 `subscribe` 행)은 아직 "서버 상태 변경"을 포함한다. 플랫폼 레벨 결정이므로 합의 전에는 원본이 우선이고, 합의 뒤 원본을 고친다(§9).

1. **5분 폴링**: 어댑터가 `GET /api/v1/platform/session-state` → `{ sessionVersion, generation? }`를 5분마다 읽는다(가벼운 읽기, DB 세션 조회 하나). 응답의 `sessionVersion`이 스냅샷과 다르면 3단계로 간다.
2. **401 감지**: 어떤 호출이든 401(또는 3xx·`opaqueredirect` — §6)이면 즉시 재확인을 시작한다.
3. 재확인 = `GET /api/v1/platform/bootstrap`. `sessionVersion`이 바뀌었으면 스냅샷을 바꾸고 `onChange`를 부른다(Kernel이 세션을 다시 읽고 이전 결과를 숨긴다). 그대로면 부르지 않는다(`csrfToken`은 어느 쪽이든 갱신 — §3).
   - **[제안] single-flight + 백오프**: 동시에 401이 여러 건 와도 재확인은 하나만 진행하고 나머지는 그 결과를 기다린다. 부트스트랩도 401·실패면 바로 다시 시도하지 않고 백오프(예: 5초 → 30초 → 5분)한다.
4. 폴링 중단 조건(탭 비활성 등)은 05 Open — 운영 설정으로 구현 때 정한다.
5. **[백엔드] 폴링은 세션 유휴 시간을 연장하지 않는다**: 서버 세션이 sliding expiry라면 `session-state`·`bootstrap` 폴링을 활동으로 세지 않는다. 그렇지 않으면 열어 둔 탭이 5분마다 세션을 살려 #150에서 정할 유휴 만료를 무력화한다.

**세대(generation)는 `subscribe`로 알리지 않는다** [제안]. `onChange`는 Kernel이 이전 결과를 **숨기는** 신호인데(체크리스트 §2), #165는 세대가 바뀌면 결과를 숨기지 않고 `refreshing`으로 갱신하라고 한다. 둘을 한 신호로 묶으면 5분마다 화면이 깜빡인다. 그래서 `subscribe`는 세션·권한 변경 전용으로 두고, 세대는 #165가 정할 별도 경로로 Kernel에 전한다(포트 추가 여부도 #165).

세대 신호가 어디로 오는지는 **Open([#165]·[#155])** — 후보: (a) 위 `session-state` 응답의 `generation` 필드(폴링 한 번에 둘 다), (b) 모든 envelope 응답 헤더 `X-Platform-Generation`, (c) envelope 필드 추가(06 §19 변경 — 플랫폼 결정). 에이전트 선호는 (a)(+ 원하면 (b)) — envelope 계약을 건드리지 않는다. 세대가 전역 하나인지 site·mart별인지도 #155가 정한다.

대안(한 줄): SSE `GET /api/v1/platform/events` — 05가 정한 재평가 조건(초 단위 갱신·동시 편집 요구) 전에는 쓰지 않는다. 프록시 버퍼링·연결 수 설정도 필요해 후속 선택지로 둔다.

## 5. 취소·타임아웃

- Kernel이 넘긴 `AbortSignal`을 `fetch`에 넘긴다 — `AbortSignal.any([kernelSignal, AbortSignal.timeout(30_000)])` 또는 같은 동작의 수동 연결(Kernel 신호 리스너 + 타이머). `AbortSignal.any`는 Chrome·Edge 116+, Firefox 124+, Safari 17.4+에서만 되고 사내 표준 브라우저는 [#151] Open이다(이 절은 Chromium 116+를 가정). 수동 연결이면 내부 타임아웃을 `AbortError`로 만들지 않는 것을 권한다(§2.2 — 취향일 뿐 필수는 아니다). 취소 판정은 `kernelSignal.aborted`로 한다(#183 — 오류 이름으로 판정하지 않는다). Kernel 신호로 인한 중단은 outcome이 아니다(superseded — §2.1).
- **클라이언트 타임아웃 30초** [제안] — mock의 30초 예산과 같은 값. 어댑터 타임아웃은 envelope 메서드에서 `timeout` + `message: 'client_timeout'`(§2.1 — 짧은 코드), 비 envelope 메서드에서는 reject. 이 30초에는 브라우저 연결 큐 대기도 들어간다 — HTTP/1.1이면 출처당 6연결 제한이라 위젯이 많은 화면은 큐에서 기다리는 시간도 예산을 쓴다. 타이머를 큐 대기와 떼어 둘 수 없으므로 프록시 HTTP/2 여부를 [#151]에 묻는다.
- **서버 쿼리 타임아웃**: 서버는 자기 예산(예: 25초 — 클라이언트 30초보다 짧게 해서 서버 판정이 먼저 오게)을 넘기면 200 + `timeout` envelope로 답하고 DB 쿼리를 취소한다 [백엔드]. 프록시 read timeout은 둘보다 길게(예: 60초) [#151].
- 클라이언트 중단 시 서버는 연결 끊김을 감지하면 쿼리를 취소해도 된다(선택) [백엔드].
- fire-and-forget는 `signal`이 없다 — 어댑터가 짧은 타임아웃(예: 10초)만 건다.
- **[제안] `recordUsage`는 `fetch(..., { keepalive: true })`로 보낸다.** Kernel은 `visibilitychange: hidden`에서 dwell을 보내는데, 탭을 닫거나 이동하면 일반 `fetch`는 취소된다. `keepalive`는 본문 64KB 한도 안에서 헤더(`X-CSRF-Token`)를 쓸 수 있다. `sendBeacon`은 CSRF 헤더를 붙일 수 없어 쓰지 않는다.

대안(한 줄): 엔드포인트마다 다른 타임아웃 — 선언(`EndpointSpec`)에 필드가 필요해 #148 뒤로 미룬다.

## 6. 세션·CSRF

- **같은 출처 배포**를 기본 가정으로 둔다: 정적 산출물과 `/api`를 같은 호스트에서 리버스 프록시로 나눈다 [#151 확인]. 그러면 CORS가 없고 쿠키가 그대로 간다. 어댑터는 상대 경로(`/api/v1/...`)만 쓰고 `credentials: 'same-origin'`.
- 세션: 서버 저장 세션 + **httpOnly·Secure·SameSite=Lax** 쿠키(03 인증 행, FeedbackOps ADR-0006과 같은 구조). 어댑터는 쿠키를 읽지 않는다. HTTPS가 아니면 `Secure`를 못 쓴다 — [#151] 사내 HTTPS 여부.
- **CSRF**: SameSite=Lax가 기본 방어지만, SameSite는 같은 **사이트**(등록 도메인) 단위라 같은 사이트의 다른 출처(`*.corp.example`의 형제 서브도메인 — 다른 사내 앱이나 그 앱의 XSS)에서 오는 POST에는 쿠키가 실린다. 그래서 **[제안] 서버는 모든 POST에서 `Content-Type: application/json`을 요구한다**(FastAPI 기본 동작과 같다) — JSON 본문과 커스텀 헤더가 교차 출처 preflight를 강제한다. 상태를 바꾸는 호출(`saveAnnotation`·`recordUsage`·`reportClientError`)은 추가로 헤더 토큰 `X-CSRF-Token`을 보낸다 [제안] — 값은 부트스트랩 응답의 `csrfToken`(세션에 묶인 값, 이중 제출 쿠키가 아니라 세션 저장). 서버는 상태 변경 경로에서 토큰이 없거나 다르면 403. 토큰 갱신·403 뒤 처리는 §3 identity 규칙 2. 읽기 `POST`(§1)는 토큰 검사 대상이 아니다 — 응답을 공격자가 읽을 수 없다(같은 출처, CORS 없음). FeedbackOps ADR-0006/0015는 SameSite=Lax 쿠키와 보안 헤더를 정했고 별도 CSRF 토큰은 명시하지 않는다 — 두 앱이 SSO를 공유하게 되면 정책을 맞춘다 [백엔드].
- 멱등성: `saveAnnotation`에 FeedbackOps ADR-0015의 선택적 `Idempotency-Key`를 쓸지는 [백엔드] — 이 초안은 요구하지 않는다(재시도하지 않으므로). 근거로 볼 경우: `saveAnnotation`이 클라이언트 30초 타임아웃이나 네트워크 실패를 만나도 서버에는 저장됐을 수 있는데 화면은 실패로 보여, 사용자가 다시 저장하면 중복이 생긴다. 키가 있으면 403(CSRF) 뒤 1회 재전송도 안전해진다(§3).
- **[제안] `/api/**`는 미인증이면 302가 아니라 401을 답한다**(SSO 게이트웨이·OIDC 미들웨어 설정 포함) [#150]·[#151]. 헤더 주입형 리버스 프록시나 일부 OIDC 미들웨어는 만료 세션의 API 호출에 302(IdP 로그인)로 답하는데, `fetch`가 리다이렉트를 따라가면 교차 출처 IdP는 CORS 실패(`network_error`), 같은 출처 로그인 페이지는 200 HTML(`invalid_response`)이 되어 §4의 재확인이 일어나지 않는다. 어댑터는 `redirect: 'manual'`을 쓰고 `opaqueredirect`·3xx를 401과 같이 처리한다(§2.1).
- **401·세션 만료 동작 — Open([#150])**: 후보 (a) 어댑터가 `onChange` + 재부트스트랩, 부트스트랩도 401이면 로그인 경로(예: `/auth/login?return_to=<현재 경로>`, FeedbackOps ADR-0006 모양)로 이동; (b) 화면에 "세션이 만료되었습니다 + 다시 로그인" 배너만. 에이전트 선호는 (a)지만 `return_to`가 URL Context를 운반하므로 URL 보안 경계(06)와 함께 #150 답 뒤 정한다.

## 7. Correlation ID

- **헤더 이름 `X-Correlation-Id`** [제안]. FeedbackOps ADR-0013은 로그 필드 `request_id`(요청마다)·`correlation_id`(작업)를 쓰지만 HTTP 헤더 이름은 정하지 않았다. 사내 프록시·로그 수집기에 표준 헤더(`X-Request-Id` 등)가 있으면 그것을 따른다 [#151].
- 어댑터는 요청마다 id를 만들어 헤더로 보낸다(`req-<epoch16>-<rand>` [제안]). Kernel은 `client-…`를 "서버에 닿지 않은 응답"에 쓰므로 다른 접두사를 써서, 화면 id만 보고 서버 로그를 찾을지 판단할 수 있게 한다. 난수는 `crypto.getRandomValues`로 만든다 — `crypto.randomUUID`는 보안 컨텍스트(HTTPS)에서만 되고 HTTP 가능성은 [#151] Open이다. 서버는 받은 id를 로그 `correlation_id`로 쓰고 **envelope `correlationId`에 그대로 되돌린다**. 헤더가 없으면 서버가 만들어 응답 헤더와 envelope에 싣는다.
- **[백엔드] 받은 id 검증**: 형식(예: `^[A-Za-z0-9._-]{1,128}$`)이 맞을 때만 쓰고, 아니면 서버가 새로 만들어 응답 헤더와 envelope에 싣는다 — 로그 주입(개행·제어문자)과 아주 긴 값을 막는다.
- 변환 envelope(§2.1)는 요청 id(또는 응답 헤더 id)를 쓴다 — 실패해도 화면의 id로 서버 로그를 찾을 수 있다.
- 렌더 실패(#101)의 `ClientErrorReport.correlationId`는 Kernel Error Boundary가 만든 `client-…` id이고, `reportClientError` 요청 헤더에도 같은 id를 실어 보낸다 [제안] — 화면 id → 오류 보고 행 → 서버 로그가 한 id로 이어진다.
- 서버 로그 수집처와 검색 방법은 [#151] (가이드 §3.2).

## 8. 버전

- 경로 버전 `/api/v1` [제안]. 호환이 깨지는 변경만 `/api/v2`(필드 추가는 v1 안에서 — 단, 서버가 모르는 키를 거부하므로 **요청** 필드 추가는 서버 먼저 배포).
- 클라이언트 번들과 서버의 엔드포인트 선언 사본이 다를 때: 모르는 엔드포인트 id는 200 + `error`(체크리스트 §3 1단계), 선언과 다른 kind는 Kernel `contract_violation`. 이것만으로도 화면에 드러나지만 원인이 버전 차이인지 알 수 없다.
- 선언 버전 헤더(예: 클라이언트가 `X-Platform-Declarations: <hash>`를 보내고 서버가 다르면 응답에 표시)를 둘지는 **Open([#148])** — 선언 원본이 TS 하나면 빌드 해시를 양쪽이 공유할 수 있고, FastAPI 원본이면 생성 시 버전을 박는다. 결정 뒤 이 절을 고친다.

대안(한 줄): 헤더 버전(`Accept: application/vnd...v1+json`) — 프록시·로그에서 보이지 않아 기각.

## 9. 합의 뒤 할 일

- 이 문서를 Decided로 바꾸고, 바뀐 결정을 [05](../05_roadmap_and_open_questions.md)에 행으로 올린다(대안이 있던 결정은 ADR).
- [체크리스트](real-server-checklist.md) §1 전송 형식 항목·§7 #149 행을 Decided로.
- [사내 적용 가이드](in-house-rollout.md) §2 #149 행·§3.3 체크박스.
- `packages/contracts/src/adapter.ts` `subscribe` 주석 갱신(세션·권한 변경 전용, 세대는 별도 경로 — §4 Candidate가 합의되면), 체크리스트 §2 `subscribe` 행도 Decided로.
- #154(실어댑터)·#155(서버)·#165(세대 신호) 이슈 본문에 결정 링크. 부트스트랩 조립(§3 A/B)은 #154에서 ADR-0009 갱신.

## 10. 사내 백엔드 담당에게 물을 것

정할 것은 본문에 [제안]으로 적었다(fire-and-forget 거부 200 + `accepted` 0/false — §2, `csrfToken` 갱신 — §3, `Cache-Control: no-store` — §1, 서버 `message` 규칙 — §2, 401 대신 302 금지 — §6, POST `Content-Type` — §6, Correlation ID 검증 — §7, `keepalive` — §5). 아래는 그 제안에 대한 **확인**만 남긴다.

1. 경로 접두사 `/api/v1/platform/...`·`/api/v1/menu-query`와 엔드포인트 id를 본문에 두는 것에 동의하는가? 모든 `/api/**` 응답에 `Cache-Control: no-store`를 붙일 수 있는가? (§1)
2. 배열·객체가 있는 읽기를 `POST` 본문으로 받는 것이 FastAPI·사내 프록시·감사 규칙에 문제가 없는가? (§1)
3. 판정된 결과(권한 거부, fire-and-forget의 거부 포함)를 전부 200 + envelope(또는 `accepted` 0/false)로 답하는 것이 가능한가? 사내 표준이 403을 요구하는가? FastAPI 기본 422를 envelope·fire-and-forget 경로에서 원시 dict 판정이나 `RequestValidationError` 핸들러로 바꾸는 데 동의하는가? (§2)
4. 200이 아닌 응답 본문을 FeedbackOps ADR-0012 모양(`{ code, message }`)으로 둘 것인가? 서버 `message`에 예외 문자열·SQL·스택·개인 값을 싣지 않는 규칙에 동의하는가? (§2)
5. 부트스트랩 한 번에 세션·게시 지표·`defaultRangeTo`·`sessionVersion`·`csrfToken`을 줄 수 있는가? `sessionVersion`을 `Session` 정규화 JSON 해시로 만드는 데 동의하는가? 세션이 갱신(재로그인)될 때 `csrfToken`도 바뀌는가? (§3)
6. 5분마다 `session-state`를 읽는 부하가 괜찮은가(동시 ~100명)? 그 폴링을 세션 유휴 시간 연장에서 뺄 수 있는가(#150 세션 정책과 연결)? 세대 신호를 거기에 실을 수 있는가, 세대는 전역 하나인가 site·mart별인가? (§4, #165·#155·#150)
7. 서버 쿼리 타임아웃 예산(제안 25초)과 DB 쿼리 취소가 가능한가? 클라이언트 30초에 동의하는가? (§5)
8. CSRF를 세션 저장 토큰 + `X-CSRF-Token` 헤더로 할 것인가, FeedbackOps와 같은 정책(SameSite만)으로 맞출 것인가? "SameSite만"을 고르면 형제 서브도메인에서 오는 쓰기 위험을 받아들이는 것이다. 세션이 갱신될 때 토큰도 바뀌는가? `saveAnnotation`에 `Idempotency-Key`가 필요한가(타임아웃 뒤 중복 저장 — §6)? (§6)
9. 세션 만료 때 로그인 경로와 `return_to` 규칙(FeedbackOps `/auth/login`과 공유?)은? 미인증 `/api/**`가 302가 아니라 401을 답하게 게이트웨이를 설정할 수 있는가? (§6, [#150]·[#151])
10. Correlation ID 헤더 이름 — 사내 표준이 있는가? 받은 id를 형식 검사(`^[A-Za-z0-9._-]{1,128}$`) 뒤 envelope `correlationId`에 그대로 되돌려 줄 수 있는가? (§7, #151)
11. rate limit을 둘 것인가, 둔다면 429 + `Retry-After`인가? (§2)
12. 선언 버전 불일치를 헤더로 알릴지 — #148 선언 원본 결정과 함께. (§8)
