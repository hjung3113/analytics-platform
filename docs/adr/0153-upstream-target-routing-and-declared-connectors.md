# 코어 서버가 기존 시스템에 직접 붙는다: 상류 대상 표·Scope 키 라우팅·fan-out 병합·선언형 연결기

상태: **Decided (2026-11-12)** — 방향과 규칙. 정확한 필드 이름은 구현 노드가 정하고 이 문서를 고친다.
- 결정자: 사용자(소유자) — 2026-11-12 [#1839](https://github.com/hjung3113/analytics-platform/issues/1839) 지시 «설계하고 고문한테 리뷰 받고 빨리 구현해»와 그날 팀장이 전달한 소유자 답: (1) 사내 적용은 기존 시스템의 백엔드·DB를 고치지 않고 사내에 새 서버를 두지 않는다(새 사내 서버 안은 기각), (2) 한 Site가 여러 DB 서버로 나뉘고 DB 하나가 여러 Site를 서비스한다, (3) HTTP API를 여는지 DB 접속만 되는지는 시스템마다 다르며 첫 사내 대상은 DB 직접 접속이다, (4) #1839 범위는 빼지 않고 우선순위만 둔다. 06 계약(kernel.md §6.2 Site) 변경과 [ADR-0148](0148-minimal-forwarder-and-identity-token.md) 결정 2 대체는 이 지시가 덮는다.
- 결정 4~9의 세부(병합 규칙·시간 배분·연결기 모양)는 위 답에서 유도한 에이전트 결정이고 구현 노드가 되돌릴 수 있다.
- Scope: [#1839](https://github.com/hjung3113/analytics-platform/issues/1839). 관련: [#1836](https://github.com/hjung3113/analytics-platform/issues/1836), [#1729](https://github.com/hjung3113/analytics-platform/issues/1729), [#155](https://github.com/hjung3113/analytics-platform/issues/155).
- Supersedes: [ADR-0004](0004-site-is-db-partition-not-column.md)(Site = 물리 DB 경계).
- Amends: [ADR-0148](0148-minimal-forwarder-and-identity-token.md) 결정 2, [ADR-0095](0095-dual-backend-fastify-core-fastapi-analytics.md) 결정 1(분석 `menuQuery` 행)·3·금지 7·12, [ADR-0146](0146-core-server-loads-in-house-declarations-from-deployment-config.md) 결정 1.

## 전제 규칙

**사내 적용은 기존 시스템의 백엔드·DB를 고치지 않고, 사내에 새 서버를 두지 않는다. 계약 맞춤은 플랫폼(코어 서버 설정·연결기)이 한다.**

이유: 소유자 원래 계획이고(2026-11-12 재확인), 기존 시스템 담당과의 합의·배포를 기다리지 않고 붙일 수 있는 유일한 길이다. 결과: 사내가 준비하는 것은 계정과 주소뿐이다 — 읽기 전용 DB 계정, HTTP API 자격 증명, 코어 서버에서 대상으로 가는 네트워크, 선언 묶음 파일. 플랫폼은 어느 한 시스템에 맞춘 코드·이름·기본값을 두지 않고, 시스템마다 다른 것은 모두 선언 묶음([ADR-0146](0146-core-server-loads-in-house-declarations-from-deployment-config.md))이 받는다. 저장소에는 사내 시스템 이름·주소·어휘를 쓰지 않는다.

## 맥락

- 지금 전달기([ADR-0148](0148-minimal-forwarder-and-identity-token.md), #1729 h)는 상류가 (1) 주소 하나(`MENU_UPSTREAM_BASE_URL`), (2) 신원 토큰 검증과 `scopes` 해석, (3) 06 §19 envelope 응답을 한다고 가정한다. 손대지 않은 기존 백엔드는 셋 다 하지 않는다.
- 기존 시스템 하나의 한 Site가 여러 DB 서버(백엔드 겸)로 나뉘어 있고(예: 5대), DB 하나가 여러 Site를 서비스하는 경우도 있다. 무엇으로 나뉘는지(room·설비 묶음·기간·부하 분산)도 시스템마다 다르다.
- 화면·Kernel 코드는 DB를 모른다 — Scope는 site·room 값이다. 그러나 ADR-0004·kernel.md §6.2·GLOSSARY Site는 «Site = 물리 DB 연결 경계»라고 적는다.
- 권한(capability)과 Scope(site·room) 판정은 이미 코어 서버가 요청마다 끝낸다(`query.ts` 3·4단계, `resolveRequestScopes`). 전달기는 그 뒤의 `handle`이다.

## 결정

### 1. Site는 부여 축이고 DB 배치는 배포 라우팅이다 (ADR-0004 대체)

Site는 공장의 최상위 조직 단위이자 Scope 부여 키다. 어느 서버·DB가 그 Site의 데이터를 갖는지는 배포 설정의 라우팅 표가 정하며 N:M이다. ADR-0004의 나머지 규칙은 Scope 규칙으로 남는다: 설비 ID로 Site를 역산하지 않고, 설비 ID를 쓰기 전에 활성 Scope의 Site가 확립돼 있어야 하며, 요청 `scopeId`는 하나다(kernel §6.2).

### 2. 상류 대상 표와 엔드포인트 라우팅은 선언 묶음에 둔다

선언 묶음에 선택 필드 `targets`를 더하고, `endpointOwners`의 값은 지금의 문자열(경로) 또는 라우팅 객체다.

- **대상(`targets`):** id → `{ kind, … }`. `kind`는 `http`·`sql` 둘이다(결정 6·7). 비밀(토큰·DB 접속 문자열)은 묶음에 쓰지 않고 파일 경로로 가리키며, 기동 때 읽고 실패하면 기동 실패다. 오류·로그에 비밀과 접속 문자열을 싣지 않는다.
- **문자열 행은 지금 그대로다.** `"endpointId": "/path"`는 기본 상류(`MENU_UPSTREAM_BASE_URL`)의 envelope 전달이다. `targets`를 쓰지 않는 묶음은 지금과 같은 바이트로 동작한다(기본 동작 불변). `MENU_UPSTREAM_BASE_URL`은 문자열 행이 하나라도 있을 때만 필수다.
- **라우팅 객체:** `{ routes, call, merge? }`.
  - `routes`: `{ sites?, rooms?, targets: [id, …] }`의 목록. 라우팅 키는 Scope 키(site, room)뿐이다 — 코어가 판정한 값이라서다.
  - **N site → 1 대상:** 한 경로가 `sites`에 여럿을 적는다. 대상은 요청의 site를 바인딩 값으로 받는다.
  - **1 site → N 대상(선언 키로 하나 고르기):** 같은 site의 경로를 `rooms`로 나눈다. 요청의 room들이 한 경로에만 걸치면 그 대상 하나에만 묻는다.
  - **플랫폼이 볼 수 없는 키로 나뉜 경우(설비 묶음·기간·부하 분산 등):** 한 경로의 `targets`에 여럿을 적으면 모두에 묻고 병합한다(결정 4). 같은 데이터의 복제본(부하 분산)은 `targets`가 아니라 대상 하나의 주소 목록이다 — 구현 노드가 대상 모양에 둔다.
  - `call`: 엔드포인트의 기본 요청·응답 변환(결정 6·7). 경로가 자기 `call`을 가지면 그것이 이긴다(같은 엔드포인트가 site마다 다른 시스템을 읽는 경우). `call`의 종류는 대상의 `kind`와 맞아야 한다.
- **기동 검증(닫힌 쪽으로 실패, ADR-0146 결정 4):** 없는 대상 id, `kind`와 맞지 않는 `call`, `requiresScope` 엔드포인트인데 `sites` 없는 경로, 한 site에서 `rooms` 없는 경로와 `rooms` 있는 경로의 공존, 같은 site의 경로끼리 room이 겹침(같은 행을 두 번 읽는다), Scope 없는 엔드포인트에 `sites`/`rooms`가 있는 경로, 결정 5의 행 Scope 필드 누락은 기동 실패다.

### 3. 요청마다의 라우팅과 Scope 판정의 끝

1. 형태·params·권한·Scope·한도 판정은 지금 순서 그대로 코어가 끝낸다(체크리스트 §3 1~6단계). 라우팅은 그 뒤 `handle` 안에서만 일어난다.
2. **허용 room 집합 R:** 엔드포인트가 `roomNames`를 적용하면 요청의 `roomNames`(이미 부여의 부분집합으로 판정됨), 아니면 그 site에서 부여받은 room 전체.
3. 요청 site가 `sites`에 있고 `rooms`가 없거나 R과 겹치는 경로를 고른다. 각 대상에는 **site와 R ∩ 경로 rooms만** 넘긴다. 부여 집합 전체·다른 site는 넘기지 않는다.
4. **덮이지 않는 범위는 실패다.** 요청 site에 맞는 경로가 없거나, R의 room 중 어느 경로에도 없는 것이 있으면 데이터 없이 `error`(설정 결함)다. 덮인 일부만 조용히 돌려주지 않는다.
5. **신원 토큰을 검증하지 못하는 대상(`http` 변환형, `sql`):** 권한·Scope 판정은 코어에서 끝나고(fail-closed), 대상은 플랫폼의 서비스 계정으로만 접근된다. 대상 쪽 감사는 사용자를 모르므로 코어가 요청마다 행위자·correlation id·대상 id를 로그에 남긴다(행·바인딩 값·비밀은 남기지 않는다).

### 4. fan-out과 병합

한 요청이 대상 여럿에 걸치면 코어가 동시에 묻고 합친다. 모든 대상은 같은 행 모양(결정 6·7의 `fields` 투영 뒤)을 낸다.

- **시간 예산(ADR-0095 30/27/25):** 어댑터 30초 > 코어의 상류 예산 `MENU_UPSTREAM_TIMEOUT_MS`(27초) — fan-out 전체가 이 마감 하나를 나눠 쓴다(대상마다 27초가 아니다) > 대상 판정: `sql`의 `statement_timeout`은 마감보다 2초 짧게(기본 25초), `http`는 남은 마감까지. 연결 풀 대기도 마감에 든다.
- **부분 실패:** 기본은 **전부 아니면 실패**다. 대상 하나라도 실패하면 나머지 요청을 끊고 데이터 없이 실패한다 — 연결 실패·비 2xx·모양 오류는 502, 마감 초과는 504(지금 `MenuUpstreamError`와 같다). 이유: 06 §19에 부분 outcome이 없고, 조용히 빠진 대상의 행은 틀린 숫자다.
  - 선택(`merge.partial: "coverage"`): 엔드포인트가 켜면, 실패한 대상이 있어도 성공한 대상의 행으로 `ok`/`empty`를 내고 `assessments`에 `coverage` 한 항목(`state: confirmed`, `statusSource: "upstream-routing"`, `observedAt`, `detail`에 빠진 대상 수 — 대상 id·주소는 싣지 않는다)을 담는다. 모든 대상이 실패하면 위 기본처럼 실패다. 화면은 06 §19의 «Insufficient coverage»로 보인다.
- **정렬:** `merge.sort`(필드·방향 목록, 마지막 필드는 행마다 유일한 동률 깨기 키)가 있으면 합친 뒤 정렬한다. 비교는 숫자는 수치, 문자열은 코드포인트, `null`은 끝. 없으면 경로 선언 순서 → 대상 안의 행 순서다.
- **행 상한(`limits.maxRows`):** 코어가 응답을 만드는 엔드포인트(결정 6 변환형·결정 7)에는 **필수**다. 대상마다 최대 `maxRows + 1`행만 읽고(`sql`은 드라이버 수준 상한, `http`는 응답 바이트 상한과 행 수), 합친 행이 `maxRows`를 넘으면 데이터 없이 `too_large`. 이 판정은 코어의 것이다(금지 7 개정, 결정 8).
- **페이지:** 페이지 엔드포인트(`page`·`pageSize`·`sorting` 계약, `{ rows, total }`)도 fan-out 할 수 있다. 각 대상에 `merge.sort`(또는 허용 목록 안의 요청 `sorting` + 동률 깨기 키) 순서로 앞에서 `(page + 1) × pageSize`행과 전체 건수를 묻고, 합쳐 정렬한 뒤 해당 페이지를 자른다. `total`은 대상 건수의 합이다. 깊이 상한 `merge.maxWindow`(`(page + 1) × pageSize`의 상한)를 넘는 요청은 `too_large`다. 페이지 엔드포인트에는 지금처럼 `maxRows`를 두지 않는다(체크리스트 규칙 7) — `maxWindow`가 그 몫이다. 커서 페이지는 범위 밖이다(Deferred).
- **envelope 대상은 fan-out 하지 않는다.** envelope 대상의 `assessments`·`trust`를 합치는 규칙은 계약에 없다. envelope 대상이 둘 이상 고르는 경로는 기동 실패다(Deferred).

### 5. 행 Scope 확인 — 원본 행이 새지 않게

코어가 응답을 만드는 `requiresScope` 엔드포인트는 응답 변환에 `rowScope`(행의 site 필드, room 필드)를 선언해야 한다. 코어는 병합 전에 모든 행이 요청 site와 그 대상에 넘긴 room 안인지 확인하고, 하나라도 벗어나면 **그 응답 전체를 데이터 없이 실패**시킨다(502와 같은 경로, 로그에 엔드포인트·대상 id만). 걸러 내지 않는 이유: 벗어난 행은 선언(SQL·매핑) 결함의 증거이고, 조용히 거르면 결함이 숨는다. 대상이 한 site만 서비스하면 site 필드는 생략할 수 있다(기동 검증이 확인). 행에 room이 없는 집계 조회는 Deferred다.

### 6. HTTP 연결기 (`kind: "http"`)

- **`call.mode: "envelope"`:** 지금의 전달기 그대로다 — 원래 요청 본문, 신원 토큰, 응답을 고치지 않는다(ADR-0148 결정 2 유지). 대상의 `baseUrl`이 `MENU_UPSTREAM_BASE_URL` 대신 쓰인다.
- **`call.mode: "mapped"`(선언적 요청·응답 변환):**
  - 요청: `method`(`GET`|`POST`), `path`(고정 경로, 변수는 경로 조각 전체 `{name}`만, 조각 단위로 인코딩), `query`·`body`(이름 → 바인딩), 정적 헤더(값은 비밀 파일). 주소의 호스트·스킴은 대상 선언에서만 온다. `redirect: error`.
  - 바인딩 어휘(닫힌 목록): `scope.site`, `scope.rooms`(결정 3의 그 대상 몫), `context.<적용된 wire 필드>`, `params.<선언된 키>`, 상수. 식·템플릿 언어·코드는 없다(ADR-0146 결정 2).
  - 응답: `rows`(JSON 포인터, 기본 루트), `fields`(출력 이름 → 행 안 JSON 포인터, 없으면 행 그대로), 페이지 엔드포인트는 `total` 포인터. 2xx와 배열이면 행, 아니면 실패. 응답 바이트 상한을 둔다.
  - 이 모드에서 대상은 신원 토큰을 받지 않는다(결정 3.5).

### 7. DB 연결기 (`kind: "sql"`, 읽기 전용)

- 대상: `dialect`, 접속 문자열 파일, 풀 크기(기본 작게). 첫 dialect는 `postgres`(이미 쓰는 드라이버)이고, dialect는 드라이버 하나를 더하는 자리다. 다른 dialect는 같은 규칙을 지키는 드라이버 모듈로 더한다.
- `call`: `statement`(SELECT/WITH 한 문장, `:name` 자리표시자)와 `params`(이름 → 결정 6의 바인딩). 값은 항상 드라이버 파라미터로 묶고 문장에 끼워 넣지 않는다. 자리표시자와 선언 이름이 정확히 맞지 않으면 기동 실패다.
- 실행: 읽기 전용 트랜잭션, `statement_timeout`(결정 4), 행 상한 `maxRows + 1`(페이지는 결정 4의 창과 건수). 요청 취소·마감이면 쿼리를 취소한다. 날짜·시각 값은 드라이버 문자열 그대로(시간대 변환 없음, kernel §6.3 벽시계 계약), 정밀도를 잃는 수(`int8`·`numeric`)는 문자열이다.
- 읽기 전용은 세 겹이다: 사내가 주는 읽기 전용 계정(1차), 코어의 읽기 전용 트랜잭션(2차), 한 문장·SELECT/WITH 기동 검사(3차). 문장은 대상 DB에서만 실행되며 코어 프로세스 안에서 실행되는 코드가 아니다.

### 8. 개정되는 기존 결정

- **ADR-0148 결정 2(전달기는 응답 본문을 고치지 않는다):** envelope 대상에는 그대로다. 변환형 HTTP·SQL 대상에서는 코어가 판정자다 — 행을 읽고, `ok`/`empty`/`too_large`를 정하고, `assessments: []`(결정 4의 `coverage`는 예외)·`trust: null`(마트가 아닌 원천)로 envelope를 만든다.
- **ADR-0095:** 결정 1의 «분석 `menuQuery` → FastAPI, Site별 DB», 결정 3의 «Fastify는 파서 DB를 직접 읽지 않는다», 금지 7·12는 선언 묶음이 대상을 선언한 배포에서는 적용하지 않는다. 그 배포의 코어 서버는 기존 시스템 DB를 읽기 전용 연결기로 읽고 outcome을 만든다. 사내 데이터 서버(FastAPI)는 필수가 아니다 — 있으면 envelope 대상 하나로 붙는다.
- **ADR-0146 결정 1(사내 데이터 핸들러는 전달기 뒤 사내 데이터 서버):** 핸들러는 묶음의 선언(변환·SQL)일 수도 있다. 사내 코드를 코어 프로세스에 넣지 않는다는 규칙은 그대로다.
- **ADR-0004:** Superseded(결정 1).

### 9. 구현 노드와 순서 (소유자 우선순위, 빼는 것 없음)

노드마다 끝나는 대로 병합한다. #1838(1729h) 위에 쌓고, 그것이 병합되면 `main`으로 옮긴다.

| 노드 | 내용 | 주요 파일 | 선행 |
| --- | --- | --- | --- |
| 1839a | 상류 표·라우팅 객체 스키마, 기동 검증, 단일 대상 라우팅(결정 2·3), 연결기 인터페이스, 행 Scope 확인(결정 5), 기본 상류 불변 | `menu-dispatch/declarations-file.ts`, 새 `routing.ts`, `declared-endpoints.ts`, `menu-declarations.ts`, `config.ts` | — |
| 1839b | DB 연결기(`postgres`, 결정 7) + 통합 시험(이슈 DB 5439의 합성 스키마·읽기 전용 role) | 새 `connectors/sql/**` | a |
| 1839c | HTTP 연결기 `mapped`·`envelope`(결정 6) | 새 `connectors/http/**`, `forwarder.ts` | a |
| 1839d | fan-out 병합(결정 4: 마감 공유·전부 아니면 실패·`coverage`·정렬·`maxRows`·페이지) | 새 `merge.ts`, `routing.ts` 호출부 | a (b·c와 파일이 안 겹침) |
| 1839e | 문서: kernel §6.2(147·193행), GLOSSARY Site, ADR-0004 상태, `in-house-rollout.md` §1·§2·§3.3, `real-server-checklist.md`, 사내 설정 예시(합성 값)와 사내 준비물 목록 | `docs/**` | a (내용), 병합은 마지막 |

b·c·d는 a 뒤에 동시에 돌린다. 작업자가 모자라면 b(DB)를 c(HTTP)보다 먼저 한다(첫 사내 대상이 DB 직접 접속).

시험(#1839 수용 기준): 합성 대상으로 N site → 1 대상, 1 site → N 대상(단일 대상 라우팅과 fan-out 병합), 기본 단일 상류 불변. 부정 시험: 무부여, 다른 room, 대상 일부 실패, 마감 초과, `maxRows` 초과, 행 Scope 위반, 덮이지 않는 room — 모두 원본 행이 응답에 없다.

## Considered Options

- **(A, 채택) 코어 서버가 설정 선언과 범용 연결기로 기존 시스템에 직접 붙는다.** 기존 시스템도 새 사내 서버도 바뀌지 않고, 시스템별 차이는 데이터(선언)로만 받는다. 대가: 코어가 일부 대상에서 outcome을 만들고(금지 7 개정), DB를 직접 읽는다(금지 12 개정).
- **(B) 사내에 새 데이터 서버(FastAPI)를 두고 거기서 계약을 맞춘다(ADR-0095 원안).** 소유자가 기각했다(전제 규칙). 서버 신설·배포·담당 합의가 선행되어 아침 목표를 못 맞춘다.
- **(C) 기존 백엔드가 신원 토큰·envelope를 말하게 고친다.** 전제 규칙 위반이다.
- **(D) 대상마다 TypeScript 어댑터 코드를 공개 저장소에 둔다.** 한 시스템에 맞춘 코드·이름이 공개 저장소에 들어가고(ADR-0146 결정 1·6), 시스템이 늘 때마다 코어 릴리스가 필요하다.
- **(E) Site를 DB 연결 하나에 고정(ADR-0004 그대로).** N:M 사실과 맞지 않는다.
- **부분 실패 기본을 «성공한 대상만 돌려준다»로:** 기각. 빠진 대상이 화면에 드러나지 않아 틀린 숫자가 된다. 원하는 엔드포인트만 `coverage`로 켠다.

## Deferred (구현 안 함)

- envelope 대상의 fan-out(여러 상류의 `assessments`·`trust` 합치기). 이유: 계약에 합치는 규칙이 없다. 다시 여는 조건: envelope를 말하는 사내 서버가 여러 대로 나뉠 때.
- 커서 페이지의 fan-out. 이유: 대상마다 커서를 묶는 토큰 모양이 계약에 없다. 다시 여는 조건: 커서 엔드포인트를 쓰는 사내 메뉴.
- 행에 room이 없는 집계 조회의 행 Scope 확인. 이유: 코어가 누출을 확인할 수 없다. 다시 여는 조건: 첫 집계 엔드포인트 — 그때 «대상이 room 하나만 서비스» 같은 선언 규칙을 정한다.
- `postgres` 밖의 dialect 드라이버. 이유: 사내 대상의 DB 종류가 아직 공개되지 않았다. 다시 여는 조건: 첫 사내 대상의 DB 종류 확인(사내 준비물 목록에 둔다).
- 기간 값(`from`/`to`)으로 대상을 고르는 라우팅. 이유: 라우팅 키는 Scope 키뿐이다. 기간으로 나뉜 시스템은 지금 fan-out으로 맞다(비용만 크다). 다시 여는 조건: 측정된 fan-out 비용 문제.

## 결과

- 사내 준비물은 계정·주소·선언 묶음뿐이다(서버 신설 없음). `in-house-rollout.md`의 «사내 백엔드 담당이 FastAPI를 만든다»(#155) 전제는 이 결정으로 바뀐다: #155는 선택(envelope 대상)이 된다.
- kernel.md §6.2와 GLOSSARY의 «Site = 물리 DB 경계» 문장은 결정 1로 고친다(노드 1839e).
