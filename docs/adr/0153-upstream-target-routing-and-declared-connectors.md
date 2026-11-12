# 코어 서버가 기존 시스템에 직접 붙는다: 상류 대상 표·Scope 키 라우팅·fan-out 병합·선언형 연결기

상태: **Decided (2026-11-12)** — 방향과 규칙. 정확한 필드 이름은 구현 노드가 정하고 이 문서를 고친다.
- 결정자: 사용자(소유자) — 2026-11-12 [#1839](https://github.com/hjung3113/analytics-platform/issues/1839) 지시 «설계하고 고문한테 리뷰 받고 빨리 구현해»와 그날 팀장이 전달한 소유자 답: (1) 사내 적용은 기존 시스템의 백엔드·DB를 고치지 않고 사내에 새 서버를 두지 않는다(새 사내 서버 안은 기각), (2) 한 Site가 여러 DB 서버로 나뉘고 DB 하나가 여러 Site를 서비스한다, (3) HTTP API를 여는지 DB 접속만 되는지는 시스템마다 다르며 첫 사내 대상은 DB 직접 접속이다, (4) #1839 범위는 빼지 않고 우선순위만 둔다.
- 소유자 답 (1)·(3)이 직접 덮는 것: 06 계약(kernel.md §6.2 Site)의 변경, [ADR-0004](0004-site-is-db-partition-not-column.md) 대체, [ADR-0095](0095-dual-backend-fastify-core-fastapi-analytics.md) D1(분석 `menuQuery`의 FastAPI 소유)·금지 7·12의 개정, [ADR-0148](0148-minimal-forwarder-and-identity-token.md) 결정 2 대체. 모두 «사내에 새 서버를 두지 않는다»의 직접 결과다.
- 나머지 세부(병합 규칙·시간 배분·연결기 모양·Scope 집행 방식)는 위 답에서 유도한 에이전트 결정이고, 고문 리뷰(2026-11-12, APPROVE-WITH-CHANGES)를 반영했다. 구현 노드가 되돌릴 수 있다.
- 사내 사실 가정(되돌릴 수 있음): 첫 사내 대상은 저장 프로시저를 호출해 읽는 MSSQL로 가정한다([기존 시스템](../product/existing-systems.md)). 답이 다르면 노드 b2만 바뀐다.
- Scope 부여의 원천은 플랫폼이다(소유자 2026-11-12: 운영자 부여 + 사용자 신청, [#1844](https://github.com/hjung3113/analytics-platform/issues/1844)). 이 ADR은 부여를 읽지 않고 Scope resolver 포트가 준 집합만 쓴다(결정 9).
- Scope: [#1839](https://github.com/hjung3113/analytics-platform/issues/1839). 관련: [#1836](https://github.com/hjung3113/analytics-platform/issues/1836), [#1729](https://github.com/hjung3113/analytics-platform/issues/1729), [#1087](https://github.com/hjung3113/analytics-platform/issues/1087), [#1844](https://github.com/hjung3113/analytics-platform/issues/1844), [#155](https://github.com/hjung3113/analytics-platform/issues/155).
- Supersedes: [ADR-0004](0004-site-is-db-partition-not-column.md)(Site = 물리 DB 경계).
- Amends: [ADR-0095](0095-dual-backend-fastify-core-fastapi-analytics.md) 결정 1(분석 `menuQuery` 행)·2(시간 예산의 `timeout` 판정자)·3(파서 DB 직접 읽기)·5(토큰 `aud`)·금지 7·10·12, [ADR-0146](0146-core-server-loads-in-house-declarations-from-deployment-config.md) 결정 1·2와 Deferred의 1729a 줄(`limits.maxRows`), [ADR-0148](0148-minimal-forwarder-and-identity-token.md) 결정 2·4.

## 전제 규칙

**사내 적용은 기존 시스템의 백엔드·DB를 고치지 않고, 사내에 새 서버를 두지 않는다. 계약 맞춤은 플랫폼(코어 서버 설정·연결기)이 한다.**

이유: 소유자 원래 계획이고(2026-11-12 재확인), 기존 시스템 담당과의 합의·배포를 기다리지 않고 붙일 수 있는 유일한 길이다. 결과: 사내가 준비하는 것은 계정과 주소뿐이다 — 읽기 전용 DB 계정(또는 지정 프로시저 실행 권한), HTTP API 자격 증명, 코어 서버에서 대상으로 가는 네트워크, 선언 묶음 파일. 플랫폼은 어느 한 시스템에 맞춘 코드·이름·기본값을 두지 않고, 시스템마다 다른 것(접속 종류, 나뉜 방식, site·room 표기, 거를 수 있는지)은 모두 선언 묶음([ADR-0146](0146-core-server-loads-in-house-declarations-from-deployment-config.md))이 받는다. 저장소에는 사내 시스템 이름·주소·어휘를 쓰지 않는다.

## 맥락

- 지금 전달기([ADR-0148](0148-minimal-forwarder-and-identity-token.md), #1729 h)는 상류가 (1) 주소 하나(`MENU_UPSTREAM_BASE_URL`), (2) 신원 토큰 검증과 `scopes` 해석, (3) 06 §19 envelope 응답을 한다고 가정한다. 손대지 않은 기존 백엔드는 셋 다 하지 않는다.
- Scope 부여는 운영 resolver가 `POST {base}/scopes/resolve` 계약의 부여 서비스를 부른다(`http-scope-resolver.ts`). 사내에 그런 서비스를 두지 않으므로 부여의 원천은 플랫폼으로 옮긴다([#1844](https://github.com/hjung3113/analytics-platform/issues/1844)).
- 기존 시스템 하나의 한 Site가 여러 DB 서버(백엔드 겸)로 나뉘어 있고, DB 하나가 여러 Site를 서비스하는 경우도 있다. 무엇으로 나뉘는지(room·설비 묶음·기간·부하 분산)도 시스템마다 다르다. 첫 대상은 표 SELECT가 아니라 저장 프로시저를 호출해 읽을 수 있다.
- 화면·Kernel 코드는 DB를 모른다 — Scope는 site·room 값이다. 그러나 ADR-0004·kernel.md §6.2·GLOSSARY Site는 «Site = 물리 DB 연결 경계»라고 적었다.
- 권한(capability)과 Scope(site·room) 판정은 이미 코어 서버가 요청마다 끝낸다(`query.ts` 3·4단계, `resolveRequestScopes`). 전달기는 그 뒤의 `handle`이다.
- 세션 스냅샷은 아직 `scopes: []`이고 `validateScope`(`GET …/scopes/{id}/check`)를 답하는 라우트가 없어, 부여가 있어도 Kernel이 Scope가 필요한 조회를 보내지 않는다(kernel §6.2). 이것은 [#1844](https://github.com/hjung3113/analytics-platform/issues/1844)가 맡는다.

## 결정

### 1. Site는 부여 축이고 DB 배치는 배포 라우팅이다 (ADR-0004 대체)

Site는 공장의 최상위 조직 단위이자 Scope 부여 키다. 어느 서버·DB가 그 Site의 데이터를 갖는지는 배포 설정의 라우팅 표가 정하며 N:M이다. ADR-0004의 나머지 규칙은 Scope 규칙으로 남는다: 설비 ID로 Site를 역산하지 않고, 설비 ID를 쓰기 전에 활성 Scope의 Site가 확립돼 있어야 하며, 요청 `scopeId`는 하나다(kernel §6.2).

### 2. 상류 대상 표와 엔드포인트 라우팅은 선언 묶음에 둔다

선언 묶음에 선택 필드 `targets`를 더하고, `endpointOwners`의 값은 지금의 문자열(경로) 또는 라우팅 객체다.

- **대상(`targets`):** id → `{ kind, … }`. `kind`는 `http`·`sql` 둘이다(결정 7·8). 비밀(토큰·DB 접속 문자열)은 묶음에 쓰지 않고 파일 경로로 가리키며, 기동 때 읽고 실패하면 기동 실패다. 오류·로그에 비밀과 접속 문자열을 싣지 않는다.
- **값 대응표(선택, 대상 또는 경로에):** 플랫폼의 site·room 값 ↔ 그 시스템의 표기. 나가는 바인딩과 들어오는 행 확인에 같은 표를 쓴다. 표를 둔 대상에서 표에 없는 값은 닫힌 쪽이다(나가는 값이면 요청 실패, 들어오는 행이면 Scope 위반으로 본다). 이유: 플랫폼 Scope 값이 한 시스템의 표기에 맞춰지지 않게 한다.
- **문자열 행은 지금 그대로다.** `"endpointId": "/path"`는 기본 상류(`MENU_UPSTREAM_BASE_URL`)의 envelope 전달이다. `targets`를 쓰지 않는 묶음은 지금과 같은 바이트로 동작한다(기본 동작 불변). `MENU_UPSTREAM_BASE_URL`·`MENU_IDENTITY_KEY_FILE`·`MENU_IDENTITY_KEY_ID`는 envelope로 가는 행(문자열 행이나 envelope 대상)이 하나라도 있을 때만 필수다.
- **라우팅 객체:** `{ routes, call, scopeCheck, merge?, unroutedRooms? }`.
  - `routes`: `{ sites?, rooms?, targets: [id, …] }`의 목록. 라우팅 키는 Scope 키(site, room)뿐이다 — 코어가 판정한 값이라서다.
  - **N site → 1 대상:** 한 경로가 `sites`에 여럿을 적는다. 대상은 요청의 site를 바인딩 값으로 받는다.
  - **1 site → N 대상(선언 키로 하나 고르기):** 같은 site의 경로를 `rooms`로 나눈다. 요청의 room들이 한 경로에만 걸치면 그 대상 하나에만 묻는다.
  - **플랫폼이 볼 수 없는 키로 나뉜 경우(설비 묶음·기간 등):** 한 경로의 `targets`에 여럿을 적으면 모두에 묻고 병합한다(결정 5). 같은 데이터의 복제본(부하 분산)은 `targets`가 아니라 대상 하나의 주소 목록이다 — 구현 노드가 대상 모양에 둔다.
  - `call`: 엔드포인트의 기본 요청·응답 변환(결정 7·8). 경로가 자기 `call`을 가지면 그것이 이긴다(같은 엔드포인트가 site마다 다른 시스템을 읽는 경우). `call`의 종류는 대상의 `kind`와 맞아야 한다.
  - `scopeCheck`: Scope 집행 방식(결정 6). 코어가 응답을 만드는 `requiresScope` 엔드포인트에 필수다.
  - `unroutedRooms`(선택, 기본 `"error"`): `"skip"`은 «이 엔드포인트의 이 site 데이터는 경로에 적힌 room에만 있다»는 선언이다(결정 3.4).
- **코어가 응답을 만드는 엔드포인트의 묶음 행:** 06 §19 assessment kind 목록 `kinds`(없으면 `[]`), `limits.maxRows`(비페이지) 또는 `merge.maxWindow`(페이지) 중 하나 필수, 바인딩되는 `params`마다 형과 상한(결정 4).
- **기동 검증(닫힌 쪽으로 실패, ADR-0146 결정 4):** 없는 대상 id, `kind`와 맞지 않는 `call`, `requiresScope` 엔드포인트인데 `sites` 없는 경로, Scope 없는 엔드포인트에 `sites`/`rooms`가 있는 경로, 한 site에서 `rooms` 없는 경로와 `rooms` 있는 경로의 공존, 같은 site의 경로끼리 room이 겹침(같은 행을 두 번 읽는다), `scopeCheck` 누락이나 결정 6의 방식별 조건 위반, 형 선언 없는 `params` 키의 바인딩, 페이지 엔드포인트에 `maxRows`·`filters`, `merge.partial`과 페이지의 조합, envelope 대상 둘 이상을 고르는 경로는 기동 실패다.

### 선언 필드의 구체 모양 (1839a1)

- `scopeCheck.mode`: `verify-rows` / `drop-rows` / `resolve-keys`. `siteField`·`roomField`는 JSON 포인터다. `resolve-keys`는 같은 연결기 종류의 `lookup` 호출과 `keys` 바인딩을 갖는다. 키 없는 집계는 `keys: { const: [] }`로 명시한다. 생략이나 다른 빈 값으로 추측하지 않으며, 본 호출에 `scope.rooms`가 필요하다.
- `unroutedRooms`: `"skip"` / `"error"`; 생략은 `"error"`다. `coverage` assessment kind와 구분하기 위해 누락 room 처리의 이름을 따로 둔다. `"skip"`은 이 엔드포인트의 데이터가 선언된 room에만 있다는 배포자의 선언이다.
- 라우팅 객체의 `call`은 자기 `call`이 없는 경로의 기본값이다. 그런 경로가 있는데 기본값이 없거나, 모든 경로가 덮어써 기본값이 쓰이지 않으면 기동 실패다. 쓰이지 않는 기본값은 대상이 없어 판정할 dialect도 없기 때문이다.
- `merge.sort`: `{ field, direction: "asc" | "desc", unique?: boolean }[]`. 마지막 항목에 `unique: true`가 필수다. 행 식별자의 이름을 플랫폼이 추측하지 않도록 배포자가 동률 깨기 키를 명시한다.
- HTTP `mapped`: 경로 조각 `{name}`의 바인딩 표는 `pathParams`다. 이름 집합은 경로 변수와 정확히 같아야 한다. `arrayStyle`은 `{ mode: "repeat" }` 또는 `{ mode: "join", separator }`다. `response.fields`는 `{ out: { from: "/pointer", type?: "number" | "string" | "wallclock" } }`다.
- SQL 프로시저의 `listJoin`은 인자 이름 → 구분자 표다. 대상 `pool`은 `{ max, concurrency }`, DB 응용 이름은 `applicationName`이다. SQL도 `response.fields`를 사용한다.
- `paramTypes`의 `maxLength`·`maxItems`·`enum`은 선택 필드이며, 주어지면 양의 상한과 선언 형에 맞는 enum 값이어야 한다. 문자열 배열은 `maxLength`를 항목 길이, `maxItems`를 항목 수에 쓴다. `kinds` 생략은 빈 kind 목록이다.
- 비밀 파일은 선언 검증 뒤 읽는다. setup의 `targetSecrets`는 JSON·로그 검사에 내용이 드러나지 않는 값이며 연결기만 명시적으로 꺼낸다. 단일 대상 라우팅은 연결기 factory가 있을 때만 기동하며, factory 없는 종류는 `connector kind <k> is not available`로 거부한다. 여러 대상을 적은 경로는 노드 d1, `merge.partial`·페이지는 노드 d2까지 기동 거부한다.

### 실행 인터페이스의 구체 모양 (1839a2)

- 연결기는 `query(leg, { signal, deadlineMs, rowCap }) → AsyncIterable<row>`다. `deadlineMs`는 호출 시 남은 코어 시간에서 2초를 뺀 밀리초 예산이며, `rowCap`은 초과 판정용 한 행을 포함한다. `signal` 중단과 iterator `return`은 드라이버 취소로 이어져야 한다. 대상 판정 제한은 고정 메시지의 `TargetJudgmentTimeout`, 전송·코어 마감은 `MenuUpstreamError`로 구분한다.
- `resolve-keys`의 `lookup`은 키별로 한 번 호출하고 정확히 한 행으로 풀려야 한다. `keys`와 같은 바인딩을 현재 키로 대체하며 배열 바인딩은 한 항목 배열을 유지한다. 선언된 lookup은 그 바인딩을 사용해야 한다. 동적인 빈 키 목록은 `forbidden`이며 집계는 `{ const: [] }`만 허용한다.
- 경로 `valueMap`은 축별로 대상의 표를 덮어쓰며, 없는 축은 대상의 표를 쓴다. `fields`의 JSON 포인터는 own property만 읽고, `wallclock` 입력은 시간대 없는 문자열로 받는다.

### fan-out 병합의 구체 모양 (1839d1)

- 비페이지 fan-out은 한 경로의 여러 대상과 room별 여러 경로 모두 실행한다. a1·a2의 fan-out 거부를 해제한다. `merge.partial`과 페이지는 아래 1839d2 규칙을 따른다.
- 모든 leg는 요청 도착 기준 마감 하나와 취소 신호를 공유한다. 연결기를 부를 때마다 남은 시간에서 2초를 뺀 `deadlineMs`를 준다. 실패 즉시 형제 leg의 signal과 iterator `return`으로 취소하고, 정착한 실패의 우선순위는 `502 > 504 > timeout`이다. 형제 취소 자체는 실패 등급에 넣지 않는다.
- leg별 원본 읽기는 `maxRows + 1`에서 멈춘다. 한 leg가 넘으면 형제도 취소하고 `rowsRead` 초과 표식을 `query.ts`에 넘겨 `too_large`, `data: null`을 판정하게 한다. leg별 상한 안에서도 투영 후 합친 행 수가 상한을 넘으면 같은 판정을 쓴다.
- 순수 함수 `mergeRows`는 경로·대상 선언 순서와 leg 안의 행 순서를 보존하거나 `merge.sort`로 정렬한다. 문자열은 Unicode 코드포인트 순서, 숫자는 수치 순서이며 `null`은 방향과 무관하게 끝이다. 정렬 필드의 누락·지원하지 않는 값·혼합 형과 leg 사이의 마지막 유일 키 중복은 값 없는 고정 `MenuUpstreamError('unavailable')`로 실패한다.
- `resolve-keys`의 `lookup` 결과는 그 leg의 room(R ∩ 경로 rooms)으로 판정한다. 요청 전체 R이 아니다. 다른 leg의 room이나 `unroutedRooms: "skip"`으로 빠진 room으로 풀리는 키는 `forbidden`이고 본 호출은 돌지 않는다. 이유: `resolve-keys`에서는 본 호출 행을 다시 검사하지 않으므로, 넓은 집합으로 판정하면 다른 room의 키를 이 대상에서 읽는다. 단일 대상 `skip`에서 이전에 받아들이던 조회가 거부로 바뀐다(닫힌 쪽).

### coverage·페이지 fan-out의 구체 모양 (1839d2)

- `merge.partial: "coverage"`는 성공한 leg를 기다려 합치며 `coverage`를 한 번 싣는다. 모두 성공하면 `clear`, 일부 실패하면 `confirmed`이고 `detail`은 빠진 대상 수의 십진 문자열 하나다. `observedAt`은 `new Date().toISOString()`의 ISO instant이며 `statusSource`는 `upstream-routing`이다. 다른 선언 kind는 `unknown/source_unavailable`이다. 엔드포인트의 중복 kind 선언은 기동 시 거부한다. 전부 실패하면 `502 > 504 > timeout`, Scope 행 위반·키 조회 거부는 전체 실패, 한 leg라도 상한을 넘으면 `too_large`다. 공유 코어 마감·요청 취소 뒤 성공 응답을 만들지 않는다.
- 페이지는 단일 대상도 같은 코어 병합 경로로 처리한다. 종전 단일 대상 페이지도 d2 기동 거부 아래 있었으므로 기존 지원 동작을 바꾸지 않는다. 각 leg를 `merge.maxWindow + 1`까지만 읽고 초과하면 `too_large`; 병합 후 0부터 시작하는 `page`와 양의 정수 `pageSize`로 자른다. `total`은 자르기 전 전체 행 수다. 빈 페이지도 `{ rows: [], total }`이다.
- 요청 `sorting`은 `PageSort[]`(`{ id, desc }`)이며 생략하면 빈 목록이다. `merge.sort`에 적은 필드가 정렬 허용 목록이다. 요청 키 순서 뒤에 나머지 선언 키를 붙이고 선언의 마지막 유일 키를 항상 마지막에 둔다(그 키의 요청 방향은 허용). 코어 페이지는 마지막 키가 `unique: true`인 `merge.sort` 선언이 없으면 엔드포인트 이름을 명시해 기동을 거부한다. 페이지 값·정렬 값이 틀리면 대상 호출 전에 `error`다. 대상 호출·바인딩 문장은 고치지 않는다.
- 부분 응답·페이지 경로도 결정 3.5의 다리별 라우팅 로그(행위자·correlation id·엔드포인트 id·대상 id)를 남긴다. 응답에는 대상 id·주소·원본 오류·원본 행을 싣지 않고(`detail`은 빠진 대상 수만), 로그에도 원본 오류·행은 싣지 않는다. 페이지+부분 실패, coverage kind 없는 부분 실패, 코어 응답의 `filters`, envelope fan-out 거부는 유지한다.

### 3. 요청마다의 라우팅과 Scope 판정의 끝

1. 형태·params·권한·Scope·한도 판정은 지금 순서 그대로 코어가 끝낸다(체크리스트 §3 1~6단계). 라우팅은 그 뒤 `handle` 안에서만 일어난다.
2. **허용 room 집합 R:** 엔드포인트가 `roomNames`를 적용하고 요청 값이 배열이면 그 배열(이미 부여의 부분집합으로 판정됨). 적용하지 않거나 요청 값이 `null`(제약 없음)이면 그 site에서 부여받은 room 전체. **R은 언제나 유한한 명시적 목록이다** — 대상에 «room 제약 없음»(`null`·빈 목록)을 넘기는 경우는 없다. 빈 R은 데이터 없이 `empty`이고 대상을 부르지 않는다.
3. 요청 site가 `sites`에 있고 `rooms`가 없거나 R과 겹치는 경로를 고른다. 각 대상에는 **site와 R ∩ 경로 rooms만** 넘긴다. 부여 집합 전체·다른 site는 넘기지 않는다.
4. **덮이지 않는 범위:** 요청 site에 맞는 경로가 없으면 데이터 없이 `error`(설정 결함)다. R의 room 중 어느 경로에도 없는 것이 있으면 — `unroutedRooms: "skip"`이면 그 room은 «데이터가 없는 room»으로 묻지 않고 건너뛴다(남는 room이 없으면 `empty`), 기본(`"error"`)이면 데이터 없이 `error`다. 이유: 선언 없는 누락은 조용한 부분 답이고, 선언이 있으면 부여 변경(이 시스템에 없는 room을 받은 사용자)이 장애가 되지 않는다.
   `loadMenuDeclarationSetup`에 기동 시 고정된 `scopeCatalog`가 주어지면 room으로 나눈 site의 `unroutedRooms: "error"` 엔드포인트는 카탈로그의 모든 room을 경로가 덮어야 하며, 빠지면 endpoint·site·room을 이름으로 기동 실패한다(카탈로그가 없으면 검사 생략).
5. **신원 토큰을 검증하지 못하는 대상(`http` 변환형, `sql`):** 권한·Scope 판정은 코어에서 끝나고(fail-closed), 대상은 플랫폼의 서비스 계정으로만 접근된다. 대상 쪽 감사는 사용자를 모르므로 코어가 요청마다 행위자·correlation id·대상 id를 로그에 남긴다(행·바인딩 값·비밀은 남기지 않는다).
6. **envelope 대상의 토큰:** 문자열 행(기본 상류)은 지금 그대로다. 라우팅 객체로 고른 envelope 대상의 토큰 `scopes` claim에는 요청 site와 그 경로 몫의 room만 싣고(ADR-0148 결정 4 개정), `aud`는 대상 선언값이다(기본 `analytics`, ADR-0095 결정 5 개정) — 한 대상이 받은 토큰을 30초 안에 다른 대상에 다시 쓰지 못하게 한다.

### 4. 바인딩과 값 검증

- 바인딩 어휘(닫힌 목록): `scope.site`, `scope.rooms`(결정 3의 그 대상 몫), `context.<적용된 wire 필드>`, `params.<선언된 키>`, 상수. 식·템플릿 언어·코드는 없다(ADR-0146 결정 2).
- 바인딩되는 `params` 키마다 형(`string`·`number`·`boolean`·`string[]`)과 상한(문자열 길이, 배열 개수, 필요하면 허용 값 목록)을 묶음에 선언하고, 체크리스트 §3 2단계에서 어긋나면 `error`로 거부한다(대상까지 가지 않는다). 지금 선언 엔드포인트의 «값 검증은 상류 몫»(`declared-endpoints.ts`)은 envelope 대상에만 남는다.

### 5. fan-out과 병합

한 요청이 대상 여럿에 걸치면 코어가 동시에 묻고 합친다. 모든 대상은 같은 행 모양(결정 7·8의 `fields` 투영 뒤)을 낸다.

- **시간 예산(ADR-0095 30/27/25, 결정 2 개정):** 어댑터 30초 > 코어의 상류 마감 `MENU_UPSTREAM_TIMEOUT_MS`(27초, **요청 도착 시각부터** 잰다 — Scope resolver 시간이 그 안에 든다). fan-out 전체가 이 마감 하나를 나눠 쓴다. 대상의 판정 제한은 남은 마감에서 2초를 뺀 값이고(`sql`은 dialect의 문장 시간 제한 + 취소, `http`는 요청 시간 제한), 연결 풀 대기도 마감에 든다.
  - 대상의 **판정 제한 초과**(문장·요청 시간 제한)는 코어가 판정자이므로 200 `timeout` envelope다(화면은 «범위를 좁혀 다시»). **코어 마감 초과**는 504, 연결 실패·비 2xx·모양 오류는 502다(지금 `MenuUpstreamError`와 같다).
- **부분 실패:** 기본은 **전부 아니면 실패**다. 대상 하나라도 실패하면 나머지 요청을 끊고 데이터 없이 실패한다 — 대상 실패 중 가장 강한 것을 고른다(502 > 504 > `timeout`). 이유: 06 §19에 부분 outcome이 없고, 조용히 빠진 대상의 행은 틀린 숫자다.
  - 선택(`merge.partial: "coverage"`): 이 엔드포인트의 `kinds`에 `coverage`가 있어야 한다. 그러면 응답에 `coverage` assessment를 **항상** 한 개 싣는다 — 모든 대상이 성공하면 `state: clear`, 일부가 실패하면 성공한 대상의 행으로 `ok`/`empty`를 내고 `state: confirmed`(`statusSource: "upstream-routing"`, `observedAt`, `detail`에 빠진 대상 수 — 대상 id·주소는 싣지 않는다). 모든 대상이 실패하면 기본처럼 실패다. 페이지 엔드포인트에는 쓰지 못한다(`total`이 틀어진다).
  - `kinds`의 나머지 kind(원천 의존)는 코어가 원천 상태를 모르므로 `state: unknown`, `reason: source_unavailable`로 싣는다(06 §19: 선언한 kind마다 정확히 하나).
- **정렬:** `merge.sort`(필드·방향 목록, 마지막 필드는 행마다 유일한 동률 깨기 키)가 있으면 합친 뒤 코어가 정렬한다. 비교는 숫자는 수치, 문자열은 코드포인트, `null`은 끝. 대상 사이에 동률 깨기 키가 겹치면(경계에서 같은 행을 두 대상이 냄) 실패다. 정렬 선언이 없으면 경로 선언 순서 → 대상 안의 행 순서다.
- **행 상한(`limits.maxRows`, 비페이지):** 대상마다 `maxRows + 1`행째가 오면 그 대상의 읽기를 끊는다(스트림 취소 — 문장에 `LIMIT`을 끼우지 않는다). 합친 행이 `maxRows`를 넘으면 데이터 없이 `too_large`. 이 판정은 코어의 것이다(금지 7 개정, 결정 10).
- **페이지:** 페이지 엔드포인트(`page`·`pageSize`·`sorting` 계약, `{ rows, total }`)도 fan-out 할 수 있다. 첫 판은 대상마다 `maxWindow + 1`행까지 그대로 읽어 코어가 정렬하고 해당 페이지를 자르며, `total`은 합친 행 수다. 어느 대상이든 `maxWindow`를 넘으면 `too_large`. 요청 `sorting`은 묶음에 선언된 정렬 가능 필드 안에서만, 코어 정렬에만 쓴다(대상 문장에 `ORDER BY`·`LIMIT`·`COUNT`를 덧붙이지 않는다 — 요청 값으로 SQL을 짜지 않고, DB 정렬 규칙과 코어 비교의 차이로 틀린 행을 자르지 않는다). 열 필터 `filters`(체크리스트 §3)는 코어가 응답을 만드는 엔드포인트에서 기동 거부다(Deferred).
- **메모리 상한(금지 10 관련):** 요청 하나가 코어에 올리는 행은 대상 수 × (`maxRows` 또는 `maxWindow` + 1)이고, 대상마다 응답 바이트 상한을 둔다. 원천 행을 데이터프레임으로 만들지 않는다.
- **envelope 대상은 fan-out 하지 않는다.** envelope 대상의 `assessments`·`trust`를 합치는 규칙은 계약에 없다(Deferred).

### 6. Scope 집행 방식 — 원본 행이 새지 않게

코어가 응답을 만드는 `requiresScope` 엔드포인트는 `scopeCheck`에 셋 중 하나를 선언한다. 없으면 기동 실패다.

1. **`verify-rows`(대상이 거를 수 있고 행에 site·room이 있다):** 응답 변환에 행의 room 필드(대상이 여러 site를 서비스하면 site 필드도)를 선언한다. 기동 검사: 호출이 `scope.rooms`를 바인딩하고, 대상이 여러 site를 서비스하면 `scope.site`도 바인딩해야 한다. 코어는 병합 전에 모든 행이 그 대상에 넘긴 site·room 안인지 확인하고, 하나라도 벗어나면 **그 응답 전체를 데이터 없이 실패**시킨다(502와 같은 경로, 로그에 엔드포인트·대상 id만). 걸러 내지 않는 이유: 거를 수 있다고 선언한 대상의 벗어난 행은 선언(SQL·매핑) 결함의 증거다.
2. **`drop-rows`(대상이 거르지 못하지만 행에 site·room이 있다):** 코어가 범위 밖 행을 버리고 나머지로 답한다. 버린 행은 코어 밖으로 나가지 않는다(응답·로그·오류 어디에도). 행 상한은 버린 뒤가 아니라 읽은 행에 건다(대상 부하 상한). `total`이 틀어지므로 페이지 엔드포인트에는 금지. 결함 은폐가 아니라 «대상이 거를 수 없다»는 선언이다.
3. **`resolve-keys`(행에 room이 없다 — 집계, 설비 하나를 받는 조회):** 본 호출 전에 묶음이 선언한 조회 하나(같은 연결기, 같은 바인딩 어휘)로 요청이 가리키는 키(예: 선택된 설비 id)를 (site, room)으로 푼다. 모든 키가 풀리고 그 site·room이 요청 site와 R 안일 때만 본 호출을 한다. 키가 하나라도 풀리지 않거나 밖이면 데이터 없이 `forbidden`이다. 가리키는 키가 없는 집계는 R 전체를 바인딩해야 한다(기동 검사: `scope.rooms` 바인딩). [ADR-0147](0147-scope-grants-come-from-an-injected-resolver.md) Deferred의 «설비별 접근 판정»이 이 길이다.

### 7. HTTP 연결기 (`kind: "http"`)

- **`call.mode: "envelope"`:** 지금의 전달기 그대로다 — 원래 요청 본문, 신원 토큰, 응답을 고치지 않는다(ADR-0148 결정 2 유지). 대상의 `baseUrl`이 `MENU_UPSTREAM_BASE_URL` 대신 쓰이고 토큰은 결정 3.6을 따른다.
- **`call.mode: "mapped"`(선언적 요청·응답 변환):**
  - 요청: `method`(`GET`|`POST`), `path`(고정 경로, 변수는 경로 조각 전체 `{name}`만, 조각 단위로 인코딩하며 빈 값·`.`·`..`은 요청 `error`), `query`·`body`(이름 → 바인딩, 배열 값의 query 직렬화 방식 — 반복 키 또는 구분자 — 를 선언), 정적 헤더(값은 비밀 파일). 주소의 호스트·스킴은 대상 선언에서만 온다. `redirect: error`.
  - 응답: `rows`(JSON 포인터, 기본 루트), `fields`(출력 이름 → `{ 행 안 JSON 포인터, type? }`; 없으면 행 그대로), 페이지 엔드포인트가 아니면 `total`은 쓰지 않는다. 2xx와 배열이면 행, 아니면 502. 응답 바이트 상한을 둔다.
  - 이 모드에서 대상은 신원 토큰을 받지 않는다(결정 3.5).

### 8. DB 연결기 (`kind: "sql"`) — dialect 중립

- **대상:** `dialect`, 접속 문자열 파일, 풀 상한과 동시 조회 상한(기본 작게 — 대상은 운영 중인 기존 DB다), 사내 DBA가 식별할 `application_name`(지원하는 dialect에서). 첫 dialect는 둘이다: `postgres`(이미 쓰는 드라이버, CI에서 시험한다)와 `mssql`(첫 사내 대상 가정, 드라이버 하나 추가). 다른 dialect는 같은 인터페이스의 드라이버 모듈로 더한다.
- **`call`:** 둘 중 하나다.
  - `statement`: 문장 한 개와 `:name` 자리표시자, `params`(이름 → 바인딩). 자리표시자 분석은 문자열·주석·인용 식별자·달러 인용·`::` 캐스트를 건너뛰는 토크나이저로 한다(`x::int`의 `:int`는 자리표시자가 아니다).
  - `procedure`: 프로시저 이름(묶음의 식별자, 기동 때 식별자 문법만 허용)과 인자(이름 → 바인딩). 드라이버의 프로시저 호출 수단으로 부르며 문장을 짜지 않는다.
  - 값은 항상 드라이버 파라미터로 묶는다. 목록 값(`scope.rooms`, `string[]` params)은 드라이버 배열이 있으면 배열 하나로, 없으면 코어가 자리표시자 **개수만** 늘린다(`:rooms` → `@p1, @p2, …`). 값을 문장에 끼우지 않는다. 자리표시자·인자 이름과 선언이 정확히 맞지 않으면 기동 실패다. 프로시저가 목록 인자를 받지 않으면 `string` 바인딩에 선언된 구분자로 이어 붙인다(값 자체는 그대로 파라미터).
- **실행:** 항상 확장(준비된) 프로토콜로 보낸다 — 여러 문장은 프로토콜에서 거부된다. 문장 시간 제한은 결정 5의 판정 제한을 dialect의 수단으로 걸고(`postgres`는 트랜잭션 안의 `SET LOCAL`, 풀 연결에 남지 않게) 넘으면 취소한다. 행은 스트림으로 받아 결정 5의 상한에서 취소한다. 요청 취소·마감이면 쿼리를 취소한다.
- **값의 형:** `fields`의 `type`(`number`·`string`·`wallclock`)으로 정한다. `number`는 유한하고 안전 정수 범위 안이어야 하며(벗어나면 그 응답이 실패), 선언이 없는 정밀 수(`int8`·`numeric`·`decimal`)는 문자열이다. 날짜·시각은 시간대 변환 없이 벽시계 `YYYY-MM-DDTHH:mm:ss`(kernel §6.3)로 낸다.
- **드라이버 오류:** 그대로 던지거나 로그에 넘기지 않는다 — 드라이버 오류에는 행 값·문장 조각이 실린다. 고정 메시지의 `MenuUpstreamError`(또는 결정 5의 `timeout`)로 바꾸고 `cause`를 달지 않는다.
- **읽기 전용의 근거는 계정이다.** 사내가 주는 계정 권한(읽기, 또는 지정 프로시저 실행만)이 1차이자 모든 dialect에서의 보장이다. `postgres`는 여기에 읽기 전용 트랜잭션을 더한다. 프로시저 호출이나 읽기 전용 트랜잭션이 없는 dialect에서는 계정 한 겹뿐이다. `statement`의 «SELECT/WITH로 시작» 기동 검사는 오타 방지일 뿐 보장이 아니다(`WITH … DELETE … RETURNING`, 부작용 있는 함수). 문장·프로시저는 대상 DB에서만 실행되며 코어 프로세스 안에서 실행되는 코드가 아니다(ADR-0146 결정 2 개정).

### 연결기의 구체 모양 (1839b)

- PostgreSQL 대상별 기본 풀 상한 4, 동시 조회 2(실효값은 풀 상한 이하). 운영 중인 DB 부담을 작게 두면서 한 조회의 대기가 다른 조회를 모두 막지 않게 한다. 취소는 조회별 별도 제어 연결 하나(기본 최대 2개)를 쓰며 즉시 닫는다. 기본 `application_name`에 시스템 이름을 추측하지 않으며 배포자가 `applicationName`을 정한다.
- 설치된 `pg`의 확장 프로토콜로 `DECLARE … NO SCROLL CURSOR` / `FETCH FORWARD 1` / `CLOSE`를 실행한다. 추가 커서 의존성 없이 서버 커서로 행 상한에서 읽기를 멈추며, 중단·iterator 반환은 별도 연결의 `pg_cancel_backend`와 롤백·연결 해제로 이어진다. 원래 문장에는 값·정렬·행 제한을 삽입하지 않는다.
- 풀에만 적용한 text parser로 `int8`·`numeric`·`timestamp`·`date`를 원문 문자열로 받는다. 전역 parser는 바꾸지 않으며 벽시계 투영은 기존 `fields.type: wallclock`이 맡는다.

### 9. Scope 부여는 resolver 포트에서 받는다 (#1844)

- 이 ADR의 라우팅·Scope 집행은 요청마다 Scope resolver 포트(`ScopeResolver`, `buildServer` 옵션)가 준 `[{ site, rooms }]` 집합만 쓴다. 부여를 직접 읽는 연결기는 두지 않는다.
- 부여의 원천은 플랫폼이다 — 운영자 직접 부여와 사용자 신청·승인(소유자 2026-11-12, [#1844](https://github.com/hjung3113/analytics-platform/issues/1844)). 세션 `scopes`·`validateScope`도 그 이슈가 같은 원천으로 답한다. ADR-0147과의 관계는 #1844의 ADR이 정한다.
- 부여할 수 있는 site·room 목록을 이 ADR의 라우팅 선언에서 낼지는 #1844가 정한다. 라우팅에 없는 site·room의 부여는 결정 3.4대로 다뤄진다.

### 10. 개정되는 기존 결정

- **ADR-0148 결정 2(전달기는 응답 본문을 고치지 않는다):** envelope 대상에는 그대로다. 변환형 HTTP·SQL 대상에서는 코어가 판정자다 — 행을 읽고, `ok`/`empty`/`too_large`/`timeout`을 정하고, 결정 5의 assessment와 `trust: null`(마트가 아닌 원천)로 envelope를 만든다. **결정 4:** 결정 3.6.
- **ADR-0095:** 결정 1의 «분석 `menuQuery` → FastAPI, Site별 DB», 결정 3의 «Fastify는 파서 DB를 직접 읽지 않는다», 금지 7·12는 선언 묶음이 대상을 선언한 배포에서는 적용하지 않는다. 그 배포의 코어 서버는 기존 시스템 DB를 연결기로 읽고 outcome을 만든다. 결정 2의 `timeout` envelope는 그 배포에서 코어가 낸다(결정 5). 결정 5의 `aud`는 결정 3.6. 금지 10은 결정 5의 메모리 상한으로 지킨다.
  - **이 ADR은 `menuQuery`와 Scope 부여만 다룬다.** ADR-0095 결정 1이 FastAPI 원천으로 둔 다른 포트(조건 축 선택지·설비 검색·Selection 해석·설비 `getEntity`·`publishedMetrics`·`defaultRangeTo`·site 레지스트리)는 원천이 없으면 지금처럼 답하지 않는다. 첫 사내 메뉴가 그중 무엇을 쓰는지는 사내 준비물 목록에서 확인한다(Deferred).
- **ADR-0146 결정 1(사내 데이터 핸들러는 전달기 뒤 사내 데이터 서버):** 핸들러는 묶음의 선언(변환·SQL·프로시저)일 수도 있다. 사내 코드를 코어 프로세스에 넣지 않는다는 규칙은 그대로다. **결정 2:** 결정 8 끝 문장. **Deferred 1729a 줄(`limits.maxRows`는 기동 실패):** 문자열 행·envelope 대상에는 그대로, 코어가 응답을 만드는 엔드포인트에는 필수다.
- **ADR-0004:** Superseded(결정 1).
- 체크리스트 §3 9단계·등록 검증 규칙 7(`maxWindow`), [http-adapter 계약](../integration/http-adapter-contract.md)의 시간 값, [components.md §19](../contract/components.md)의 `coverage` 출처(노드 d2)는 구현 노드가 같은 PR에서 고친다. 코어가 내는 `coverage`의 `statusSource`는 `upstream-routing`이고 `clear`는 «라우팅된 대상이 모두 답했다»만 뜻한다.

### 11. 구현 노드와 순서 (빼는 것 없음, 우선순위만)

노드마다 끝나는 대로 병합한다. `targets`를 쓰지 않는 묶음은 어느 노드에서도 동작이 바뀌지 않으므로(노드 a1의 고정 시험) 중간 병합이 안전하다. #1838(1729h) 위에 쌓고, 그것이 병합되면 `main`으로 옮긴다.

| 노드 | 내용 | 선행 |
| --- | --- | --- |
| 1839a1 | 묶음 스키마·기동 검증 전부(결정 2·4·6·7·8의 선언 모양), `limits.maxRows` 전환(envelope 거부 / 코어 응답 필수), envelope 전용 설정의 조건부 필수, 기본 상류 불변 고정 시험(문자열 행 묶음의 요청·응답 바이트). 런타임 동작 없음 | — |
| 1839a2 | 요청 라우팅(결정 3), 바인딩·값 검증(결정 4), Scope 집행 `verify-rows`·`drop-rows`·`resolve-keys`(결정 6), dialect 중립 연결기 인터페이스(행 상한 취소·판정 시간 초과 구분 포함), `handle` 연결, 단일 대상 | a1 |
| 1839b | DB 연결기 `postgres`(결정 8) + 사내 준비물 목록·합성 설정 예시 | a2 |
| 1839d1 | fan-out 기본 병합: 마감 공유·전부 아니면 실패·`maxRows`·코어 정렬 | a2 (b와 병렬) |
| 1839b2 | DB 연결기 `mssql`(프로시저 호출, 드라이버 의존성 추가) | b |
| 1839c | HTTP 연결기 `mapped`·라우팅된 `envelope`(결정 7, 결정 3.6) | a2 |
| 1839d2 | `coverage` 부분 실패·페이지 fan-out(결정 5) | d1 |
| 1839e | 남은 문서: 체크리스트 §3·부여 계약, http-adapter 시간 값, `in-house-rollout.md` §3.3·§4 | 각 노드의 몫은 그 노드 PR에 |

시험(#1839 수용 기준): 합성 대상으로 N site → 1 대상, 1 site → N 대상(단일 대상 라우팅과 fan-out 병합), 기본 단일 상류 불변. 부정 시험: 무부여, 다른 room, `null` roomNames, 대상 일부 실패, 판정 시간 초과와 마감 초과, `maxRows` 초과, 행 Scope 위반(`verify-rows`), 범위 밖 행(`drop-rows` — 응답·로그에 없음), 풀리지 않는 키(`resolve-keys`), 덮이지 않는 room, 대응표 밖 값 — 모두 원본 행이 응답에 없다. SQL 시험은 합성 스키마·표에만 `USAGE`·`SELECT`를 받은 기존 `platform_app` 계정으로 붙어 쓰기 거부를 확인한다. 같은 표에 `DELETE`를 추가 부여해도 PostgreSQL 읽기 전용 트랜잭션이 쓰기를 거부하는 것을 별도로 확인하고 시험 뒤 권한과 스키마를 회수한다. 사내 운영 대상은 전용 읽기 전용 계정을 준비하며, 연결기가 빈 room 목록을 대상에 보내지 않는 것을 확인한다.

## Considered Options

- **(A, 채택) 코어 서버가 설정 선언과 범용 연결기로 기존 시스템에 직접 붙는다.** 기존 시스템도 새 사내 서버도 바뀌지 않고, 시스템별 차이는 데이터(선언)로만 받는다. 대가: 코어가 일부 대상에서 outcome을 만들고(금지 7 개정), DB를 직접 읽는다(금지 12 개정).
- **(B) 사내에 새 데이터 서버(FastAPI)를 두고 거기서 계약을 맞춘다(ADR-0095 원안).** 소유자가 기각했다(전제 규칙). 서버 신설·배포·담당 합의가 선행되어 아침 목표를 못 맞춘다.
- **(C) 기존 백엔드가 신원 토큰·envelope를 말하게 고친다.** 전제 규칙 위반이다.
- **(D) 대상마다 TypeScript 어댑터 코드를 공개 저장소에 둔다.** 한 시스템에 맞춘 코드·이름이 공개 저장소에 들어가고(ADR-0146 결정 1·6), 시스템이 늘 때마다 코어 릴리스가 필요하다.
- **(E) Site를 DB 연결 하나에 고정(ADR-0004 그대로).** N:M 사실과 맞지 않는다.
- **부분 실패 기본을 «성공한 대상만 돌려준다»로:** 기각. 빠진 대상이 화면에 드러나지 않아 틀린 숫자가 된다. 원하는 엔드포인트만 `coverage`로 켠다.
- **거르지 못하는 대상을 받지 않는다(`verify-rows`만):** 기각. 손대지 않은 프로시저·API는 room 인자를 받지 않거나 행에 room이 없는 경우가 보통이라 그런 엔드포인트를 못 싣는다. `drop-rows`·`resolve-keys`를 선언으로 연다.
- **페이지를 대상에 내려보낸다(`ORDER BY`·`LIMIT`·`COUNT` 덧붙이기):** 첫 판에서 기각. 요청 값으로 SQL을 짜야 하고 dialect마다 문법이 다르며, DB 정렬 규칙과 코어 비교가 다르면 잘린 행이 틀린다.

## Deferred (구현 안 함)

- envelope 대상의 fan-out(여러 상류의 `assessments`·`trust` 합치기). 이유: 계약에 합치는 규칙이 없다. 다시 여는 조건: envelope를 말하는 사내 서버가 여러 대로 나뉠 때.
- 커서 페이지의 fan-out. 이유: 대상마다 커서를 묶는 토큰 모양이 계약에 없다. 다시 여는 조건: 커서 엔드포인트를 쓰는 사내 메뉴.
- 정렬·창을 대상에 내려보내는 페이지 최적화. 이유: 위 Considered Options. 다시 여는 조건: `maxWindow` 읽기의 측정된 비용 문제.
- 코어가 응답을 만드는 엔드포인트의 열 필터 `filters`. 이유: 필터를 대상에 넘기려면 요청 값으로 조건을 짜야 하고, 코어에서 거르면 `maxWindow` 뒤 결과가 틀린다. 다시 여는 조건: 열 필터가 필요한 첫 사내 메뉴.
- `postgres`·`mssql` 밖의 dialect 드라이버. 이유: 첫 대상 밖의 DB 종류가 정해지지 않았다. 다시 여는 조건: 그 DB를 쓰는 사내 대상.
- 기간 값(`from`/`to`)으로 대상을 고르는 라우팅. 이유: 라우팅 키는 Scope 키뿐이다. 기간으로 나뉜 시스템은 지금 fan-out으로 맞다(비용만 크다). 다시 여는 조건: 측정된 fan-out 비용 문제.
- `menuQuery` 밖의 FastAPI 원천 포트(조건 축 선택지·설비 검색·Selection 해석·설비 `getEntity`·`publishedMetrics`·`defaultRangeTo`)를 연결기로 받는 일. 이유: 이 ADR 범위 밖이다. 다시 여는 조건: 첫 사내 메뉴가 그중 하나를 쓸 때.

## 결과

- 사내 준비물은 계정·주소·선언 묶음뿐이다(서버 신설 없음). [사내 적용 가이드](../integration/in-house-rollout.md)의 «사내 백엔드 담당이 FastAPI를 만든다»(#155) 전제는 이 결정으로 바뀐다: #155는 선택(envelope 대상)이 된다.
- kernel.md §6.2와 GLOSSARY의 «Site = 물리 DB 경계» 문장은 결정 1로 고친다(이 ADR과 같은 PR).
