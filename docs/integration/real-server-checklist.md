# 실서버 연결 체크리스트 (사내 적용)

> 상태: **Candidate** — 지금 mock(`@ap/mock-server`)이 하는 일을 기준으로 실서버·실어댑터가 지켜야 할 것을 모은 목록(#145). 계약의 원본은 [06](../contract/platform-ui-contract.md) §5·§6·§17·§19·§22와 [패키지 경계](platform-packages.md) §4이고, 이 문서는 사내 구현자가 한 번에 보도록 묶은 것이다. 충돌하면 원본을 따른다. 본문의 Q3·Q5·Q9는 [ADR-0019](../adr/0019-menu-query-endpoint-declaration.md)의 결정 항목이다.

## 1. 무엇을 바꾸나

앱은 서버를 `PlatformAdapter` 하나로만 만난다. `apps/platform-web/src/main.tsx`는 `#platform-assembly`의 `createAssembly({ registry })`가 돌려준 어댑터를 주입한다(#153, [ADR-0009](../adr/0009-production-assembly-injection.md)). 지금 dev·mock 빌드에서는 `src/dev/mock-assembly.tsx`가 `createMockAdapter({ endpoints, registry, auditEvents })`를 돌려준다(지표 감사 시드, ADR-0048 — 실서버에서는 서버 감사 저장소가 같은 자리를 채운다) — 실어댑터를 돌려주는 조립 모듈을 만들어 운영 빌드에 꽂는 것이 사내 적용의 전부다. Kernel·셸·공통 컴포넌트·메뉴 화면은 고치지 않는다.

- 실어댑터(클라이언트)는 각 포트 메서드를 서버 호출로 옮긴다. 전송 형식(HTTP 경로·JSON 모양·상태 코드·부트스트랩·CSRF·Correlation ID)은 [전송 형식 초안](http-adapter-contract.md)(Candidate, 합의 대기 — [사내 적용 가이드](in-house-rollout.md) §2)에 있다.
- 서버는 mock 엔진이 하는 판정을 그대로 한다. 판정의 기준은 요청이 아니라 **서버가 가진 엔드포인트 선언 사본**이다.
- 운영 빌드에서는 dev 도구(역할 전환·응답 시나리오, `src/dev/DevTools.tsx`)를 빼고, `menus/*/*/src/mock/`은 번들에 넣지 않는다 — #153이 보장한다: `main.tsx`는 mock을 import하지 않고(lint), 운영 mode는 `AP_PLATFORM_ASSEMBLY`가 가리키는 조립 모듈을 쓰며 없으면 빌드가 실패한다(대체 어댑터 없음). CI `check:prod-graph`가 조립을 external로 둔 운영 모듈 그래프에 `@ap/mock-server`·`menus/*/*/src/mock/`·`src/dev/`가 없음을 확인하고, 모든 운영 빌드(`build:prod`)는 빌드 단계 검사(`prodGraphGuard`)로 실조립을 포함한 자기 전체 그래프에 같은 규칙을 적용한다 — 걸리면 빌드 실패, 끌 수 없다(ADR-0009). CI 검사만으로는 실조립을 보지 않으므로 실조립 쪽 보장은 이 빌드 단계 검사다.
- 이 레포의 실서버 조립은 `apps/platform-web/src/real/http-assembly.tsx`(`@ap/http-adapter`의 `bootstrapHttpAdapter`를 기다린다)이고 `pnpm --filter @ap/platform-web dev:real`(vite mode `real`)로 로컬 백엔드에 붙여 본다. 아래는 사내가 자기 조립 모듈을 직접 꽂는 경우다. `createAssembly`는 `Promise`를 돌려줘도 되고(로그인 이동은 `{ redirect }`, 연결 실패 화면은 `{ screen }` — [전송 형식](http-adapter-contract.md) §3), 실어댑터 꽂기(#154): `import type { CreateAssembly } from '#platform-assembly'`로 `export const createAssembly: CreateAssembly = ({ registry }) => ({ adapter, topBarTools: null })`를 export하는 모듈을 만들고(선언과 별개로 시그니처를 손으로 쓰지 않는다) `AP_PLATFORM_ASSEMBLY=<경로> pnpm --filter @ap/platform-web build:prod`로 빌드한다. 운영 조립은 `topBarTools: null`을 쓴다. `build:prod`는 번들 전에 `scripts/typecheck-assembly.ts`로 그 모듈의 `createAssembly`가 `CreateAssembly`를 만족하는지 `tsc`로 검사한다(앱 `tsc --noEmit`은 주입 모듈을 보지 않는다) — 필드를 빠뜨리거나 모양이 다르면 빌드가 실패한다.

## 2. `PlatformAdapter` 메서드별로 지킬 것

| 메서드 | 지킬 것 |
| --- | --- |
| `session()` | 동기 스냅샷(사용자 + 접근 가능한 Scope). 세션이 바뀔 때까지 **같은 객체**를 돌려준다 — Kernel이 객체 identity로 Scope 재검증 여부를 정한다. 실어댑터는 Provider 마운트 전에 세션을 받아 둔다(부트스트랩). |
| `subscribe(onChange)` | 재로그인·권한 변경·서버 상태 변경을 알린다. Kernel은 알림마다 `session()`을 다시 읽고 revision을 올려 이전 결과를 한 프레임도 보이지 않게 숨긴다(`kernel/adapter.test.tsx`가 고정). Candidate: 세대 신호는 별도 경로 — #165, [전송 형식 초안](http-adapter-contract.md) §4(합의 전에는 이 행이 원본). |
| `validateScope(scopeId)` | 그 사용자에게 site가 부여됐는지와 부여된 room. 클라이언트 상태가 아니라 서버 판정이다(06 §6.2). |
| `publishedMetrics()` | 지표별 게시 버전 스냅샷 — `metricId`만 온 진입점을 보완한다. |
| `contextOptions`·`evaluateSelection` | 조건 축 선택지, 조건 결과·조건 밖 선택. 조건 판정은 서버 책임이다. |
| `defaultRangeTo()` | 기본 기간의 기준 시각(wall-clock, 06 §6.3). |
| `menuQuery(req)` | §3 판정 순서 전부. 메뉴 데이터는 모두 이 한 메서드로 온다. |
| `menuAction(req)` | §3 `menuAction` 판정 순서. 쓰기는 선언한 동작 하나씩 이 한 메서드로 온다([ADR-0054](../adr/0054-write-port-declared-actions-idempotency-version.md)). 답은 `ActionResponse`(`outcome`·`data`·`version`·`fieldErrors`·`replayed`·`correlationId`)이고 `ApiResponse` envelope 규칙(assessments·trust, 06 §19)은 적용되지 않는다 — `ApiResponse`·`Outcome`은 그대로다. 응답을 받지 못해 반영 여부를 모르는 전송 실패는 `unknown`이지 `error`가 아니다(`error`는 서버가 답했고 아무것도 바꾸지 않았다는 뜻). 판정된 요청에는 던지지 않는다. |
| `listAxisOptions`·`searchEquipment`·`resolveSelection` | 인증·Scope·room 부여만으로 쓰는 비 envelope 조회. 입력·권한·커서/이력 실패는 PortError로 reject, 전송 실패도 reject한다. 빈 페이지는 성공이며 ID별 forbidden은 제출 ID·상태 외 필드가 없다. 입력·시간·커서·캐시·세션 재검사는 [06 §6.4](../contract/kernel.md#64-url-계약-decided-필드명enum-문자열은-candidate), Candidate HTTP 변환은 [HTTP §2.2](http-adapter-contract.md#22-그-밖의-묶음)를 따른다. |
| `getEntity(ref)` | §22 목적지 단건. 권한은 클라이언트 인수가 아니라 서버 소유 map(예: `equipment` → `equipment:view`)으로 판정하고, site 검증 뒤 그 객체의 room을 다시 검증한다. 등록 안 된 type은 `error`다. 거부 응답에 행 필드를 싣지 않는다. 전역 Context·Selection으로 대체하지 않는다. |
| `auditTrail`·`entityAudit` | 변경 감사. 전역은 `console:access`, 단건은 그 목적지의 조회 권한. 클라이언트는 actor·at을 보내지 않는다(서버가 기록). 조건에 맞는 것이 없으면 `empty`(빈 목록의 `ok`가 아니다). 전역(`auditTrail`)에서 결과가 있는데 범위를 넘은 페이지는 `ok`에 `items: []`와 실제 `total` — 1페이지로 바꿔 답하지 않는다. 단건(`entityAudit`)은 `getEntity`와 같은 게이트 — 목적지 type의 조회 권한, site가 있는 type은 site·room 부여(부여 안 된 site·null Scope는 `forbidden`), site가 없는 type(지표)은 `scopeId: null`, 등록 안 된 type은 `error`. 단건(`entityAudit`)은 커서로 쪽을 나눈다(ADR-0085): 요청은 `EntityRef` + 선택 `cursor`, 한 쪽은 최대 `ENTITY_AUDIT_PAGE_MAX`(50)건이고 `at` 내림차순(instant)·같으면 `id` 오름차순의 keyset이다. 응답 `nextCursor`는 불투명 문자열이며 마지막 쪽은 `null`(빈 쪽에 non-null 커서를 주지 않는다). 첫 쪽이 0건이면 `empty`, 뒤쪽이 0건이면 `ok`+`events: []`+`nextCursor: null`. 형식이 틀렸거나 다른 대상에 묶인 커서는 `error`(`Invalid cursor`). 커서는 위 게이트를 모두 지난 뒤에만 해석한다. `nextCursor` 키가 없는 응답은 끝으로 읽는다(쪽을 나누지 않는 서버). |
| `accessDirectory` | 권한/역할 조회 전용(`console:access`). 부여·회수 쓰기는 원천 결정(#98) 전에는 없다. 조건에 맞는 것이 없으면 `empty`(빈 목록의 `ok`가 아니다). 결과가 있는데 범위를 넘은 페이지는 `ok`에 `items: []`와 실제 `total` — 1페이지로 바꿔 답하지 않는다. |
| `recordUsage`·`usageSummary` | 활용률 이벤트 적재(userId 없음 — 서버가 세션 사용자로 기록)와 집계 읽기(`console:access`). `usageSummary`는 해당 메뉴가 없어도 `ok`에 `menus: []`다 — `empty`가 아니라(콘솔은 방문 0 메뉴를 left-join해서 보여준다; `empty`면 그 메뉴들이 숨겨진다). 보존 기간 밖 범위도 `ok`·`menus: []`로 답한다. 조회조건 수집 여부는 #75 결정 대기. |
| `reportClientError` | 렌더 실패 보고. 식별 필드만 정확한 모양으로 받고, 알 수 없는 키·URL·자유 문장은 통째 거부. 서버가 세션 사용자·시각을 기록한다. |
| `listAnnotations`·`saveAnnotation`·`deleteAnnotation` | 차트 주석은 서버 소유, `(chartId, scopeId)` 키. 차트 권한과 그 site 부여를 검증한다(06 §16). 목록·저장 응답의 `mine`은 요청 사용자가 쓴 주석인지의 표시 힌트이고 작성자 id는 내보내지 않는다. 삭제는 작성자만 할 수 있고(남의 주석 `forbidden`), 그 `(chartId, scopeId)`에 없는 id는 `empty`이며 다른 site·다른 작성자의 행을 드러내지 않는다. 삭제는 감사 기록을 남긴다(ADR-0041). |

메서드는 반환 모양에 따라 네 묶음이다. 이 분류의 원본은 여기다.

- **쓰기 메서드** — `menuAction`. `ActionResponse`로 답한다(위 행). envelope 메서드와 같이 판정된 요청에는 던지지 않고, Kernel이 넘긴 `signal`이 중단돼도 보낸 쓰기는 되돌릴 수 없다(ADR-0054: Kernel은 쓰기에 `signal`을 넘기지 않는다).
- **envelope 메서드** — `menuQuery`·`getEntity`·`auditTrail`·`entityAudit`·`accessDirectory`·`usageSummary`·`listAnnotations`·`saveAnnotation`·`deleteAnnotation`. 06 §19 envelope(`outcome` 하나 + 선언한 `assessments` + `trust`)로 답한다. 예외를 던지지 않는다 — 전송 실패도 `error` envelope다. 예외: Kernel이 넘긴 `signal`로 중단된 경우는 reject해도 된다(`AbortError` — Kernel이 그 결과를 버린다).
- **동기 스냅샷** — `session`·`publishedMetrics`·`defaultRangeTo`. 부트스트랩에서 받아 둔 값을 돌려준다(던지지 않음).
- **비 envelope 비동기** — `validateScope`·`contextOptions`·`evaluateSelection`·`listAxisOptions`·`searchEquipment`·`resolveSelection`. 새 세 포트는 성공 타입만 resolve하고 판정 실패는 `PortError(code,message,field?)`(`code`가 `@ap/contracts`의 `PORT_ERROR_CODES` 중 하나인 `name: 'PortError'` 오류 — Kernel·적합성 하네스는 `instanceof`가 아니라 `isPortError`로 판별하므로 어댑터가 자기 contracts 사본으로 던져도 된다, [ADR-0074](../adr/0074-port-failures-three-surfaces-structural-port-error.md)), 전송·타임아웃 실패는 reject한다. 빈 후보는 `{items:[],nextCursor:null}` 성공이며 실패를 빈 성공이나 ApiResponse로 바꾸지 않는다. 자기 반환 타입 그대로다. `contextOptions`·`evaluateSelection`은 전송 실패 때 reject해도 된다(Kernel이 오류·재시도를 보인다). `validateScope`는 실어댑터가 전송 실패를 내부에서 재시도해도 되고, 끝내 실패하면 reject한다 — Kernel은 Scope를 `error`로 두고 "Scope를 확인하지 못했습니다 + 다시 시도"를 보이며, 그동안 Scope가 필요한 요청은 보내지 않는다(#167). Kernel은 자동 재시도하지 않는다. 취소로 보는 것은 Kernel이 넘긴 `signal`이 중단된 경우뿐이다 — 어댑터 내부 타임아웃·중단으로 호출이 끝나면 오류 이름(`AbortError` 포함)과 무관하게 실패로 reject한다.
- **fire-and-forget** — `recordUsage`·`reportClientError`는 `{ accepted }`를 돌려준다(거부는 `accepted: 0`/`false`). 전송 실패로 reject해도 Kernel이 조용히 무시한다.

그 밖에 `subscribe(onChange)`는 동기 등록이고 해제 함수를 돌려준다.

## 3. `menuQuery` 판정 순서

서버는 요청이 아니라 자기 선언 사본(엔드포인트 id → `EndpointSpec` + 핸들러)으로 판정한다. 순서도 계약이다(앞 단계가 뒤 단계보다 우선).

1. **요청 모양** → 어긋나면 `error`: 최상위 키는 `endpoint`·`context`·`params`뿐, 등록된 엔드포인트, GlobalContext 필드만, `paramKeys` 밖 params 키 없음, 선언이 적용하지 않는 Context 키 없음(Q3), 적용 키 누락 없음(Q9), Condition은 null 또는 축이 하나 이상인 plain object이며 각 축 값은 비공백 문자열의 비어 있지 않은 배열, IdSet은 null 또는 비공백 문자열 배열, `membershipBasis`는 null 또는 `asOf`이고 `asOf`에는 Condition 또는 PRC 그룹 필요, `time` 적용이면 `from`·`to`가 non-null 문자열, `metric` 적용이면 `metricVersion`은 `metricId` 없이 오지 않음.
2. **params 값** → 엔드포인트의 값 검증(예: 계열에 없는 `metricVersion`)이 거부하면 `error`. 잘못된 요청이지 빈 결과가 아니다.
3. **권한** → 엔드포인트 권한(데이터 접근 권한, 메뉴 권한과 다를 수 있음 — Q5)이 없으면 `forbidden`. 요청 시점의 세션 사용자로 판정하고, 비행 중 역할이 바뀌어도 보낸 사람 기준이다.
4. **Scope** → `requiresScope`면 site 부여 → room 부여 → 조건 → Selection으로 설비 집합을 해석하고, 부여 밖이면 `forbidden`(Scope `null`도 `forbidden`).
5. **한도** → `limits.maxHours`를 넘고 좁은 Selection이 없으면 `too_large`.
6. **명시적 공집합** → 적용된 집합 키가 `[]`면 원천을 읽지 않고 `empty`, assessments 없음, trust `null`(06 §19).
7. **시간 도메인** → `mergeTimeDomain`이면 2대 이상을 한 시간축에 합칠 수 있는지 §6.3 판정, 안 되면 `error`.
8. **핸들러** → 해석된 설비, 적용 Context만 남긴 값(비적용 키는 "제약 없음"), params, 세션 사용자를 받아 계산. 데이터로만 판정할 수 있는 잘못된 요청(예: 다른 사용자에게 발급한 커서)은 `error`.
9. **행 상한** → `limits.maxRows`를 선언한 비페이지 엔드포인트(내보내기·탐색)는 핸들러가 돌려준 결과 **전체**(페이지가 아님)로 판정한다. 배열 길이가 `maxRows`를 넘으면 데이터 없이 `too_large`(원천을 다 읽기 전에 판정할 수 있으면 그렇게 — 단, 1–8단계 판정이 언제나 앞선다). ids를 params로 받는 선택 내보내기(#173)는 ids로 거른 **뒤의 크기**가 기준이라 큰 필터 결과 안의 작은 선택도 내보낼 수 있다. 선언했는데 핸들러가 배열이 아닌 값을 돌려주면 데이터 답이 아니라 계약 `error`(선언 오용)다. 페이지 엔드포인트에 선언하면 등록 검증이 거부한다.
10. **응답** → `assessments`는 선언한 kind마다 정확히 하나. mart 데이터면 `trust`(갱신 시각·데이터 기준 시각·커버리지·지표 버전·잠정 여부·원천), FeedbackOps 같은 비 mart 원천이면 `trust: null`. 원천 의존 kind(`collection`·`processing_delay`·`coverage`)의 원천이 아직 없으면(적재 워커 기록 구현 전 — 스키마는 #37로 Decided) 빼지 않고 `state: 'unknown'`, `reason: 'source_unavailable'`로 답한다(06 §19 — 생략은 계약 위반, 행 수로 `clear`를 추론하지 않음). Trust는 키가 모두 필수이고 모르는 값(`dataThrough`·`coverage`)은 `null`(06 §18, `@ap/contracts` `Trust`).

**필수 Context:** requiredContext의 의미·등록 검증은 [06 §5·§11](../contract/platform-ui-contract.md)이 소유한다. 모든 투영 필드의 구조적 존재 검사를 유지하고 required의 null을 원천 조회 전에 error로 거부한다. 공집합은 기존 empty 예외를 따른다. ConformanceCase.context에 부여 계정이 성공하는 필수값 표본을 제공한다(공통 Scope·기간과 합친 뒤 투영). 표본이 없으면 해당 엔드포인트의 검사는 required Context: no valid sample로 명시적으로 건너뛴다. 표본이 있으면 각 required 키의 null·필드 생략 변이를 다른 필드와 독립적으로 검사한다.

Kernel은 받은 `ok`/`empty`의 kind가 선언과 다르면 `contract_violation` 오류로 바꾼다 — 서버가 틀리면 화면에 그대로 드러난다.

**내보내기 엔드포인트(#173, [ADR-0008](../adr/0008-table-owned-export-fixed-toolbar.md))** — 표가 파일을 만들고 서버는 행만 준다. 핸들러가 지킬 것:

- 행 배열을 돌려주고 `limits.maxRows`를 선언한다(위 9단계).
- `sorting`(`PageSort[]`)을 받아 **같은 메뉴의 페이지 엔드포인트와 같은 정렬**(같은 ORDER BY와 결정적인 동순위 기준)으로 돌려준다 — 화면에서 본 순서와 파일 순서가 같아야 한다.
- 선택 내보내기의 `ids`는 부여된 Scope·페이지 필터를 적용한 **뒤** 거른다 — ids로 Scope를 넓힐 수 없다. 9단계 행 상한은 이 결과의 크기로 판정한다.

### 등록 검증 (서버 기동 시)

앱이 넘긴 메뉴 Registry로 엔드포인트 목록을 검증하고 하나라도 어긋나면 기동을 거부한다: 엔드포인트 id 중복 없음, `menuId`가 Registry에 있음, 권한 이름이 어떤 메뉴가 선언한 권한임, 엔드포인트가 `apply`한 키를 소유 메뉴도 `apply`함, 메뉴가 Scope를 요구하면 엔드포인트도 요구, Scope 없는 엔드포인트는 site 종속 키(`roomNames`·`condition`·`selection`·`lot`·`recipe`·`ppid`)를 `apply`할 수 없음(규칙 6), `limits.maxRows`는 양의 정수이고 페이지·커서 엔드포인트(`page`·`pageSize`·`cursor` paramKeys)가 아닐 것(규칙 7, #175). 원본: `packages/adapters/mock-server/src/adapter.ts` `createMockAdapter`.

### `menuAction` 판정 순서

서버는 요청이 아니라 자기 선언 사본(동작 id → `ActionSpec` + 핸들러)으로 판정한다. 순서도 계약이다([ADR-0054](../adr/0054-write-port-declared-actions-idempotency-version.md)).

1. **요청 모양** → 어긋나면 `error`: 최상위 키는 `action`·`context`·`input`·`idempotencyKey`뿐(버전 방식 동작은 `expectedVersion`도), `action`·`context`·`input`은 필수(`idempotencyKey`는 이 단계에서 없거나 틀려도 2단계가 판정), 등록된 동작, `context`는 `scopeId`만 담고 `requiresScope`일 때만(그때는 반드시) 가짐, `input`은 평범한 객체, `expectedVersion`은 버전 방식 동작에만(그때는 반드시, 문자열).
2. **멱등 키** → 없거나 비었거나 UUID가 아니면 `invalid`, `fieldErrors: [{ path: ['idempotencyKey'], code: 'required' | 'malformed' }]`.
3. **권한** → 동작 권한이 없으면 `forbidden`. 요청 시점의 세션 사용자로 판정한다.
4. **Scope** → `requiresScope`면 site 부여를 확인하고 `null`·모르는 id·부여 밖은 `forbidden`.
5. **재생** → `(사용자, 키)` 기록이 있고 정규화한 요청(`action`·`scopeId`·`expectedVersion`·`input`, 키 정렬)이 같으면 저장한 답을 `replayed: true`로 돌려준다. 같은 키에 다른 요청이면 `error`(`idempotency_key_reuse`). 권한·Scope를 재생보다 먼저 보므로 권한을 잃은 사용자는 같은 키로도 저장된 답을 받지 못한다.
6. **입력 값** → `inputKeys` 밖 키는 `invalid`, 키마다 `{ path: [키], code: 'unexpected_field' }`(행위자·시각 필드가 여기서 걸린다). 그다음 동작의 값 검증이 거부하면 `invalid`와 그 필드 오류.
7. **버전** → 버전 방식이면 대상이 없으면 `not_found`, `expectedVersion`이 현재와 다르면 `conflict`이고 `version`에 현재 버전을 싣는다.
8. **핸들러** → 쓰기를 적용하고 `ok`에 `data`와 쓴 뒤의 `version`을 싣는다.

`replayed`는 새 답에서 항상 `false`다. 기록하는 것은 핸들러가 상태를 바꾼 `ok`뿐이다 — `invalid`·`conflict`·`not_found`·`forbidden`·`error`는 같은 키로 다시 보내면 처음부터 다시 판정한다. 보관 기간은 서버가 정하며 24시간 이상이다(mock은 기한 없이 보관). 감사는 핸들러가 같은 트랜잭션에서 남긴다 — 플랫폼 엔진은 감사 행을 쓰지 않으며, 계약은 입력에 행위자·시각이 오는 것만 금지한다(6단계).

전송은 `POST` + `Idempotency-Key`·`If-Match` 헤더가 기본 후보지만 정하는 주체는 HTTP 어댑터(#149)다 — 이 문서는 라우트나 헤더를 확정하지 않는다.

**등록 검증 (서버 기동 시)** — 동작도 엔드포인트처럼 검증하고 하나라도 어긋나면 기동을 거부한다: 동작 id 중복 없음, `menuId`가 Registry에 있음, 권한 이름이 어떤 메뉴가 선언한 권한임, 메뉴가 Scope를 요구하면 동작도 요구, `invalidates`의 각 항목이 같은 `menuId`의 등록된 엔드포인트임, `concurrency: 'version'` 동작에는 현재 버전을 읽는 핸들러가 있음. 원본: `packages/adapters/mock-server/src/adapter.ts` `createMockAdapter`.

## 4. 적합성 묶음으로 확인하기

필수 조회조건의 원본은 [플랫폼 계약 §5·§11](../contract/platform-ui-contract.md)이다. `EndpointSpec.requiredContext`는 apply capability만 선언하고, 구조적 투영 검사에 더해 null/누락을 거부한다. `[]`는 존재하는 명시적 공집합이다. `ConformanceCase.context?: Partial<GlobalContext>`에는 그 엔드포인트가 성공할 수 있는 앱 소유 표본을 넣는다. 하네스 Scope·기간과 합친 뒤 투영하며, 필수값의 유효 표본이 없으면 해당 엔드포인트 검사들을 `required Context: no valid sample`로 건너뛰었다고 표시한다(통과로 세지 않음). 표본이 있으면 관련 필드만 null/누락으로 바꾸어 각각 오류·데이터 없음 봉투를 검사한다. 보조 엔드포인트는 더 작은 투영을 가질 수 있다.

[`@ap/server-conformance`](../../packages/adapters/server-conformance/AGENTS.md)는 §3의 1·3·4·6·10(그리고 표본이 있으면 9)을 엔드포인트 선언에서 도출해 검사한다(엔드포인트마다 성공 요청, 알 수 없는 키·비적용 키·적용 키 누락·`from` null·`metricVersion` 단독 거부, 권한 없으면 `forbidden`, 부여 안 된 site·`null` Scope `forbidden`, 명시적 공집합, kind 정확히 일치). 선언한 `maxRows`가 있고 표본 요청이 `oversizeParams`를 갖고 있으면(#175), 그 요청이 `too_large`로 데이터 없이 답하는지도 검사한다. 지금은 `apps/platform-web/src/server-conformance.test.ts`가 앱의 모든 메뉴 엔드포인트와 mock 어댑터로 돌리고, FeedbackOps 백엔드 통합 테스트 `apps/fo-backend/src/modules/platform-port/__tests__/platform-conformance.integration.test.ts`가 실서버에 실어댑터(`app.inject` 위 `fetch`)로 돌린다(#674) — 아직 없는 포트는 건너뛴 검사로 남아 실서버 준비 현황표가 된다.

실어댑터를 붙이면 같은 하네스를 실어댑터로 만든다. 사내에서 준비할 것:

- `adapter`: 실어댑터(테스트 환경 서버를 가리킴).
- `cases`: 엔드포인트 선언과 표본 요청 — 앱 테스트의 `PARAMS` 표를 그대로 쓸 수 있다.
- `implemented`(선택, #674): 서버가 구현한 `PlatformAdapter` 메서드 목록. 없으면 전부 구현한 것으로 본다. 목록 밖 메서드를 부르는 검사는 id 끝에 ` — not implemented: <메서드>`를 단 건너뛴 검사가 된다(통과·실패로 세지 않음). 표본이 없어 이미 건너뛴 검사도 그 메서드를 함께 적는다.
- `siteGrants`(선택, #674): site 부여가 아직 없는 서버(`session().scopes`가 `[]` — FeedbackOps, ADR-0069 결정 8)는 `false`. 부여된 site가 필요한 검사가 ` — no site grants`로 건너뛰어지고, `context.scopeId`·`foreignScopeId`·`otherGrantedScopeId`는 어떤 실행 검사도 읽지 않는 자리값이 된다.
- `context`·`foreignScopeId`: 테스트 계정에 부여된 site·기간, 부여되지 않은 site. `foreignScopeId`는 **서버가 아는** site여야 한다 — 모르는 id를 고르면 `validateScope(foreign site) → forbidden` 검사가 `unknown_scope`를 만나 실패한다.
- `ports`: 포트 표본 — 목적지 표본(`EntityRef`와 그 조회 권한, 같은 site의 부여받지 않은 room에 있는 실제 목적지 `ungrantedRoomRef` — 선택), 주석 대상 chartId·권한·그 차트 축의 유효 범위 `from`·`to`(시간축이면 wall-clock, 범주축이면 범주 라벨 — 06 §16), 활용률 이벤트의 식별 필드 표본(`menuId`·`spaceId`·`path`·`sessionId` — 부여 계정이 기록할 수 있는 이벤트; `name`·`at`·dwell 필드는 무시 — 묶음이 자체 entry/dwell을 만든다), 오류 보고 표본, 두 번째 부여 site. 전역 메뉴 표본을 따로 넘기지 않아도 묶음이 활용률·오류 보고 표본을 `spaceId: null`로 복제해 검사한다(이 포트에서 null은 항상 유효하다). 목적지 표본은 **site가 있는 type**이면 `context.scopeId`에 둬야 하고 그 계정이 부여받은 room이어야 한다. site 없는 type(지표, FeedbackOps VOC·Finding·Task)의 표본은 `scopeId: null`로 주고, 그러면 getEntity·entityAudit의 부여 안 된 site·null Scope 검사 네 건이 ` — siteless destination type`으로 건너뛰어진다(#674). `ungrantedRoomRef`를 주지 않으면 getEntity·entityAudit의 room 재검사 두 건은 건너뛴 것으로 표시된다(통과로 세지 않는다).
- `ports.options`(선택): 축 ID와 서로 다른 부여 값 두 개 이상, 알려진 축소 검색어/값, 부여 설비 전체 summary, 같은 Site의 거부 room/ID, 다른 Site의 실제 ID, 확실히 없는 ID. 부모 검사는 부모축·값·자식 값, 거부 전용 옵션 검사는 그 값을 추가한다. foreignScopeId는 하네스 원본을 재사용한다. 전역 옵션 검사는 선택적 `globalOptions`에 `axisId: lineNames | prcGroups`, 전체 부여 값 `values`, 다른 전역 키 부모 `parents`, 부모로 좁힌 부여 값 `parentValues`를 주며 키별 표본이 없으면 개별 skip이다. 상한 검사는 독립적으로 알려진 200개 초과의 upperOptions/upperEquipment 표본이 있어야 실행하며 없으면 개별 skip이다. mock 데이터만으로 200 상한이 증명됐다고 주장하지 않는다. 페이지 ID 중복·커서 진행·종료는 최대 1000페이지 안에 확인하며 부여/비노출·요청 오류·검색/부모·메뉴 권한 독립성을 검사한다. 선택 표본이 없으면 각 검사가 개별 skip으로 표시된다.
- `asGranted`·`withoutPermission`: 모든 엔드포인트 권한을 가진 테스트 계정과, 권한 하나씩만 뺀 계정(또는 그렇게 세션을 바꾸는 테스트 훅). 부여 계정은 목적지 조회 권한·주석 권한도 있어야 하고 site 둘에 부여돼 있어야 한다. `withoutPermission`은 모든 엔드포인트 권한과 `ports.entity.permission`·`ports.annotation.permission`·동작 권한·`console:access`로 불린다 — 부여 계정이 안 가진 권한(예: `console:access`)을 빼면 부여 계정 자신으로 돌아가므로, 권한 하나씩만 뺀 계정을 따로 만드는 팀은 이 목록이 곧 준비할 계정 목록이다.
- `asConsole`: `console:access`를 가진 계정(콘솔 조회·활용률 집계 검사가 이 계정으로 돈다).
- `asOtherAnnotator`: 부여 계정과 **다른 사용자**로, 주석 권한(`ports.annotation.permission`)과 `context.scopeId` 부여가 있는 계정(작성자 삭제 검사의 "다른 사용자"). 콘솔 전용 계정은 차트 권한 단계에서 거부되어 작성자 판정을 증명하지 못하므로, 묶음이 먼저 이 계정으로 자기 주석을 저장·삭제할 수 있는지 확인하고 못 하면 실패로 처리한다.
- 시계: 수신 시각 검사는 **테스트 러너 시각**의 ±10분 창을 서버의 수신 스탬프와 비교한다 — 러너와 서버 시계를 몇 분 이내로 맞춘다(NTP). 1970-01-01 창도 읽는다 — 보존 기간이 제한된 서버도 그 창에는 `ok`(0건)로 답해야 한다.
- `oversizeParams`(`maxRows`를 선언한 엔드포인트마다): 테스트 서버에서 선언 상한을 넘는 결과가 나오는 표본 요청. 앱 테스트의 `PARAMS` 표에는 없다(mock 데이터가 작다) — 테스트 환경에 상한보다 많은 행을 준비해야 한다. 표본이 없으면 그 검사는 건너뛰었다고 표시된다.

포트 메서드도 같은 묶음이 검사한다(#152):

- 세션 identity·부여 site 목록, `subscribe` 해제 함수(한 번만 호출 — 해제 함수의 멱등성은 계약이 요구하지 않는다), `validateScope` 네 상태(부여·두 번째 부여·미부여·알 수 없음 site), `publishedMetrics` 포인터 모양(`metricId` 비지 않은 문자열, `publishedVersion` 문자열 또는 null), `defaultRangeTo` naive wall-clock(`YYYY-MM-DDTHH:mm:ss`, 지역·오프셋 없음 — 06 §6.3), `contextOptions` 선택지 목록(`stgroup`·`team` 문자열 배열, `makerModel` `{maker, model}`), `evaluateSelection` 부여 room 필터·미부여 site 0건(거부 응답도 통과)
- `getEntity`·`entityAudit` 권한·site·room 재검증(`ungrantedRoomRef` 표본 있을 때)·null Scope·미등록 type
- `entityAudit` 쪽 나누기(ADR-0085): 한 쪽 ≤ 50건, `nextCursor`를 끝까지 따라가면 중복 없이 정렬 순서대로 모두 나오고 마지막은 `null`, 틀린 커서는 `error`, 커서를 붙여도 site·권한 게이트가 같다. 서버가 실제로 발급한 커서를 다른 대상·다른 site·권한 없는 계정·권한 없는 room에 보내도 표본의 행이 나오지 않는다(다른 site·권한 없는 계정·권한 없는 room은 커서 없는 요청과 같이 `forbidden`, 다른 대상은 게이트를 지난 뒤 `error`; 커서 전용 검사 9건, site 없는 목적지는 site 검사 건너뜀, 한 쪽짜리 표본은 발급 커서 4건 건너뜀). **자동 skip:** 첫 쪽 응답에 `nextCursor` 키가 없는 서버(옛 서버)는 이 9건이 `server does not page entityAudit`로 건너뛴 것으로 표시되고(통과로 세지 않는다) 서버에 `cursor`를 보내지 않는다. 표본에 감사 행이 없어 첫 쪽이 `ok`가 아니어도 같은 방식으로 건너뛴다
- 콘솔 조회 권한(`auditTrail`·`accessDirectory`·`usageSummary`의 `console:access`)과 0건 outcome(`auditTrail`·`accessDirectory`는 `empty`, `usageSummary`는 `ok`·`menus: []`)
- 주석: 저장·같은 site 재조회(저장자에게 `mine: true`), site 격리(다른 부여 site에 보이지 않음), 부여 없는 site·null Scope `forbidden`, 클라이언트 `at`·`id`·`user` 거부(거부한 주석은 저장 안 됨), 비 mart 응답(assessments 없음·trust null), 차트 권한 재검증, 삭제(작성자는 삭제되어 목록에서 사라짐·다른 사용자는 `forbidden`이고 주석이 남음·이 site에 없는 id는 `empty`·부여 없는 site, null Scope와 권한 없음은 `forbidden`). 작성자 검사는 부여 계정과 `asOtherAnnotator` 계정을 번갈아 쓰므로 혼자 차례로 돈다
- 활용률: 유효 entry·dwell 적재, 하나라도 어긋나면 전체 거부(unknown key·클라이언트 userId·query 붙은 path·비숫자 `at`·비숫자 `enteredAt`·음수 `dwellMs`), `spaceId: null`(전역 메뉴) 수락, 선택 필드 `source`(없음·`main`·`board`)와 `board` 전용 `stayId` 수락(알 수 없는 `source`·`board` 아닌 `stayId`는 전체 거부), 본 화면 `entry` 전용 `via`(닫힌 집합)·`fromMenuId`(메뉴 id 또는 `null`) 수락(집합 밖 `via`는 전체 거부, `dwell`·`board` 이벤트에 있으면 전체 거부 — mock이 지킨다), 제거된 `feedback`과 그 밖 알 수 없는 공간 id 거부, 수신 시각 집계(클라이언트 `at`이 아니라 서버 수신 시각으로 집계) — 이 수신 시각 검사는 **부여 계정으로 기록하고 콘솔 계정으로 집계를 읽는다**(하네스가 보장하는 건 부여 계정의 기록 권한뿐이라 콘솔 전용 계정이 기록하지 못하는 것은 적합하다). 혼자 차례로 돌므로 검사 안에서 actor를 전환한다
- 오류 보고: 유효 표본 적재(positive), `spaceId: null` 수락, 거부(자유 문장 message·절대 URL path·query 붙은 path·자유 문장 name·누락 필드·제거된 `feedback`과 알 수 없는 공간 id)
- 응답 모양 — 거부에 데이터 없음, 누락된 envelope 키 지적(`assessments`·`trust`), 평가 항목 06 §19, Trust 06 §18

- 쓰기(`menuAction`, `harness.actions`): 동작마다 성공 뒤 같은 키·입력의 재생(`replayed: true`와 같은 `data`), 같은 키에 다른 입력 `error`, 키 없음·빈 키·UUID 아님 `invalid`(경로 `idempotencyKey`), `inputKeys` 밖 키 `invalid`(`unexpected_field`), 버전 방식의 낡은 `expectedVersion` `conflict`(현재 `version` 포함), 권한이 재생보다 앞섬(같은 키로 성공한 뒤 권한을 뺀 계정의 같은 요청이 `forbidden`), `requiresScope` 동작의 미부여 site `forbidden`, `invalid` 답은 기록되지 않음(같은 키로 유효 요청이 새로 `ok`). 표본(`ActionCase`)은 동작 선언과 부여 계정이 성공하는 `input`이고, 버전 방식이면 대상의 현재 버전을 읽는 `currentVersion`도 필요하다(없으면 그 동작의 검사는 건너뛴 것으로 표시된다). 표본이 없으면 `actions: no sample` 한 건이 건너뛴 것으로 표시된다. 계정: `asGranted`는 동작 권한도 가져야 하고 `currentVersion` 읽기도 그 안에서 돈다. `withoutPermission`은 동작 권한으로도 불린다 — 부여 계정과 같은 계정을 돌려줘도(§4 위 설명) 권한이 재생보다 앞서는지가 증명되고, 권한 하나씩만 뺀 계정을 쓰면 `forbidden`만 증명된다. **묶음은 테스트 서버에 동작 표본을 실제로 쓴다.**

**주의: 묶음은 테스트 서버에 주석·활용률 이벤트·오류 보고를 실제로 쓴다 — 운영 서버에 돌리지 않는다.**

묶음이 다루지 않는 것(메뉴별 수치·행, `maxHours` 등 한도 경계값 — `maxRows`는 초과 표본만 검사한다, 시간 도메인 경계값, 메뉴 조회 원천의 비 mart `trust: null` — 주석·`accessDirectory`의 비 mart 응답은 검사한다)은 메뉴 테스트와 E2E(`pnpm e2e`)가 맡는다.

## 5. 세션·사용자

- 클라이언트는 사용자 id·actor를 보내지 않는다. 사용자는 서버가 세션으로 찍는다(활용률·오류 보고·감사·내 VOC).
- 시각은 계약마다 다르다. 감사·차트 주석·오류 보고는 서버가 기록 시각을 찍는다. 활용률 이벤트는 서버가 **수신 시각**을 찍고, `usageSummary`의 기간 필터·`lastUsedAt`은 그 수신 시각으로 계산한다. 이벤트의 `at`·`enteredAt`(클라이언트 epoch ms)은 모양(유한한 숫자 — FeedbackOps 구현(#622)은 정수 열에 담으려고 안전 정수만 받는다)을 검사한 뒤 버리지 않고 저장한다 — 하나라도 어긋나면 호출 전체를 거부한다. `enteredAt`은 같은 진입의 dwell을 하나로 합치는 키이고(보드 칸 이벤트는 `source: 'board'`와 `stayId`를 함께 저장하고 그 dwell은 (사용자, 세션, 메뉴, `source`, `stayId`)로 합친다), `dwellMs`는 클라이언트가 계산한 값이다(서버가 다시 계산하지 않음). 원본 동작: `packages/adapters/mock-server/src/server.ts` `recordUsage`·`aggregateUsage`.
- 인증은 FeedbackOps 방식(AuthProvider: Mock + OIDC 계열, 서버 세션)으로 정했다(#35). 실제 IdP 설정값은 사내 SSO 사양 확인 뒤.
- 역할 소속의 원천은 IdP 그룹 claim 사양이 나올 때까지 보류(#98). 그 전에는 부여·회수 쓰기를 만들지 않는다.

## 6. 시간

- 설비 wall-clock(분석 기간·`startedAt`)은 naive 문자열로 주고받고 time zone으로 옮기지 않는다(`formatDateTime`). 발생 식별 키 `anchor`는 시각이 아니라 불투명 숫자 문자열이다(Kernel §6.1). 실제 시점(감사·활용률 epoch·timestamptz)은 `formatInstant`(06 §6.3).
- `from`/`to`는 `[from, to)`. 기본 기간은 `defaultRangeTo()` 기준으로 클라이언트가 절대값으로 채운 뒤 요청한다.

## 7. 아직 사람 결정이 필요한 것

남은 사람 결정은 [사내 적용 가이드](in-house-rollout.md) §2-§3.

### Condition map conformance (ADR-0059, #552)

`ports.condition` supplies app-owned axis IDs and fixture values: cross-axis AND must narrow, within-axis OR equals the union, legacy v1 single-axis decoding preserves results, and `asOf` on a non-history axis returns an error. The sample also pins rejection of malformed Condition maps, empty axis arrays, scalar axis values, blank value IDs, scalar Line/PRC sets, invalid membership bases and orphaned `asOf`. `evaluateSelection` must explicitly reject invalid input; `menuQuery` returns an error envelope for fields the sampled endpoint applies. Without the sample the kit reports one visible skipped check. `lineNames` and `prcGroups` follow IdSet filtering; PRC membership history is server-owned. The mock alone evaluates PRC-only `asOf` as current membership because it has no history data.
