# 사내 적용 가이드 (mock → 실어댑터·실서버)

> 상태: **Candidate** — 2026-10-02 작성. 사내 적용의 **순서·확인할 것·사람이 할 일**을 한 곳에 모은 안내서다. 서버·어댑터가 지켜야 할 **규칙**의 원본은 [실서버 연결 체크리스트](real-server-checklist.md)이고, 계약 원본은 [06](../contract/platform-ui-contract.md)·[패키지 경계](platform-packages.md)다. 충돌하면 원본을 따른다. 진행 추적은 지도 이슈 [#157](https://github.com/hjung3113/analytics-platform/issues/157)과 마일스톤 `M4 사내 적용`.

## 0. 지금 어디까지 왔나

- 플랫폼 쪽 준비는 끝났다. 메뉴 데이터는 모두 범용 조회 포트(`menuQuery`, #100)로 오고, 서버 경계 적합성 묶음(`@ap/server-conformance`, #145·#152)이 어떤 어댑터든 같은 잣대로 판정한다 — `menuQuery`와 포트 메서드 전부(세션·Scope·조건 편집기 포트·목적지·감사·콘솔 조회·주석·활용률·오류 보고)를 지금 mock으로 모든 메뉴 엔드포인트가 통과한다(oversize 표본이 없는 `maxRows` 검사 3개는 건너뜀 — 통과로 세지 않는다).
- 사내 메뉴는 이 저장소 밖의 조립 저장소에서 시작 키트(`ap-start-kit-<버전>.tgz`)로 만든다: [시작 키트 안내](../guides/standalone-start-kit.md). 키트의 실조립 빌드는 `pnpm build:real`이고, 아래 `AP_PLATFORM_ASSEMBLY … build:prod`는 이 저장소에서 조립을 꽂는 길이다.
- 사내 적용은 `#platform-assembly` 조립 모듈(dev·mock은 `apps/platform-web/src/dev/mock-assembly.tsx`의 `createMockAdapter(...)`)을 **실어댑터를 돌려주는 조립 모듈로 바꿔 꽂는 일**이다(`AP_PLATFORM_ASSEMBLY`, #153·ADR-0009). Kernel·셸·공통 컴포넌트·메뉴 화면은 고치지 않는다(체크리스트 §1).
- 남은 일의 대부분은 **사내 입력**(SSO 사양, 배포 환경, 백엔드 담당과의 합의)에 막혀 있다. 외부 입력 없이 할 수 있는 플랫폼 작업은 §4의 작은 후속뿐이다.
- 디자인(M2)은 v0.1.0으로 끝났고 이 트랙과 별개다.

## 1. 무엇이 바뀌고 무엇이 그대로인가

**전제 규칙([ADR-0153](../adr/0153-upstream-target-routing-and-declared-connectors.md)):** 사내 적용은 기존 시스템의 백엔드·DB를 고치지 않고, 사내에 새 서버를 두지 않는다. 계약 맞춤은 플랫폼(코어 서버 설정·연결기)이 한다. 사내가 준비하는 것은 계정·주소·선언 묶음 파일이다.

| 바뀌는 것 | 그대로인 것 |
| --- | --- |
| 운영 조립 모듈(`createAssembly` → 실어댑터, `AP_PLATFORM_ASSEMBLY`, #154; 이 레포의 실서버 조립은 `apps/platform-web/src/real/http-assembly.tsx` + `@ap/http-adapter`) | Kernel(`@ap/kernel`)·셸·공통 컴포넌트·`@ap/contracts` 타입 |
| 운영 빌드에서 mock 핸들러·dev 도구 제외(#153 완료 — CI `check:prod-graph`) | 메뉴 화면(`menus/*/*/src/pages`·`platform/*/src/pages`)과 엔드포인트 선언(`menus/*/*/src/endpoints.ts`·`platform/*/src/endpoints.ts`) |
| 서버: 메뉴 `src/mock/` 계산 → 코어 서버의 선언 묶음이 기존 시스템에 직접 붙는다 — 상류 대상 표·Scope 키 라우팅·읽기 전용 DB 연결기·HTTP 연결기([ADR-0153](../adr/0153-upstream-target-routing-and-declared-connectors.md), #1839). 기존 시스템의 백엔드·DB는 고치지 않고 사내에 새 서버를 두지 않는다 | 판정 규칙(체크리스트 §3 순서), 06 §19 응답 envelope, URL·딥링크 계약 |
| 인증: Mock 역할 전환 → 사내 SSO 세션(#150) | 개발·E2E는 계속 mock으로 돈다(`pnpm dev`·`pnpm e2e`) |

## 2. 전체 순서

| 단계 | 할 일 | 이슈 | 선행 | 누가 | 끝났다는 기준 |
| --- | --- | --- | --- | --- | --- |
| 1. 확인 | 사내 SSO 사양·설정값 | [#150](https://github.com/hjung3113/analytics-platform/issues/150) | — | 사용자(사내 SSO 담당 문의) | §3.1 질문에 답이 있고 05 Open이 Decided |
| 1. 확인 | 배포·인프라 환경 | [#151](https://github.com/hjung3113/analytics-platform/issues/151) | — | 사용자(인프라 담당 문의) | §3.2 질문에 답이 있음 |
| 1. 결정 | 엔드포인트 선언의 원본 — **끝: TS(Zod) 원본, [ADR-0096](../adr/0096-contract-schemas-zod-source-and-reference-implementations.md)** | [#148](https://github.com/hjung3113/analytics-platform/issues/148) | — | 사용자 | 결정이 06 §6.1·[ADR-0019](../adr/0019-menu-query-endpoint-declaration.md) Q2에 반영됨 |
| 1. 결정 | 전송 형식(HTTP 경계) | [#149](https://github.com/hjung3113/analytics-platform/issues/149) | 초안 작성(Candidate) — 합의 대기. 합의는 #151 답 뒤가 낫다 | 에이전트 초안 → 백엔드 담당 합의 | `http-adapter-contract.md`가 Decided |
| 2. 구현 | 실어댑터(HTTP) + 적합성 묶음을 사내 테스트 서버로 | [#154](https://github.com/hjung3113/analytics-platform/issues/154) | #148·#149·#150 | 에이전트(사내 실행은 사람) | 사내 테스트 서버 대상 적합성 묶음 전부 통과 |
| 2. 구현 | Kernel 5분 폴링·계산 세대 재검증 | [#165](https://github.com/hjung3113/analytics-platform/issues/165) | #149(+#155 세대 신호) | 에이전트 | 세대가 바뀔 때만 다시 읽고 갱신 표시, Kernel 테스트·E2E |
| 2. 구현 | 기존 시스템 연결: 선언 묶음(대상·라우팅·연결기·부여 조회) | [#1839](https://github.com/hjung3113/analytics-platform/issues/1839) | #150 | 에이전트(공개 코드) + 사용자(사내 계정·주소·묶음 파일) | 합성 대상 통합 시험 통과, 사내 대상에서 첫 메뉴 조회 |
| 2. 구현(선택) | 사내 데이터 서버(FastAPI) — 06 §19 envelope를 말하는 서버를 따로 둘 때만, envelope 대상 하나로 붙는다 | [#155](https://github.com/hjung3113/analytics-platform/issues/155) | #148·#149·#150, 신뢰 원천은 #37 | 사내 백엔드 담당 | 체크리스트 §2·§3 전부 + 적합성 묶음 통과 |
| 3. 운영 | §6 완료 기준 확인 → 첫 사내 메뉴 | — | 2단계 | 사내 메뉴 개발자 | §6 체크 전부 |

1단계 네 개는 서로 독립이라 동시에 물어도 된다.

## 3. 사내에서 확인할 것 (담당자별 질문 목록)

이슈 본문에 같은 질문이 있다. 답을 받으면 해당 이슈에 남기고, 결정은 05와 그 결정의 원본 문서(03·06 등)를 Decided로 고친 뒤 여기 체크박스를 고친다. 이 가이드는 Candidate 안내서라 Decided를 붙이지 않는다.

### 3.1 SSO·보안 담당 — [#150](https://github.com/hjung3113/analytics-platform/issues/150)

- [ ] 프로토콜(OIDC / SAML / 헤더 주입형 프록시)
- [ ] issuer·메타데이터 URL, 클라이언트 등록 절차와 소요 기간, 환경별 redirect URI
- [ ] 받을 수 있는 claim — 계정 id, 이름, 부서, **그룹·역할 claim의 유무와 모양**(역할 소속 원천 #98이 여기에 걸림)
- [ ] 세션 만료·재인증 주기·단일 로그아웃 요구
- [ ] 기능과 IdP 클라이언트 공유 가능 여부(M3 SSO 공유)
- [ ] 망분리에서 서버의 IdP 백채널 접근 가능 여부
- [ ] 테스트 계정: 모든 엔드포인트 권한 계정 + 권한 하나씩 뺀 계정(또는 세션 전환 훅), `console:access` 계정(`asConsole`), 주석 가능한 두 번째 사용자 계정(`asOtherAnnotator`), 부여 계정의 site 둘 부여·목적지/주석 권한 — 적합성 묶음에 필요(체크리스트 §4)

### 3.2 인프라 담당 — [#151](https://github.com/hjung3113/analytics-platform/issues/151)

- [ ] 정적 산출물(`apps/platform-web/dist`) + `/api`·`/auth` 리버스 프록시 → Fastify `platform-api`(같은 출처) 구조 가능 여부, 컨테이너인지 VM인지
- [ ] 같은 출처 배포 가능 여부(쿠키 세션·CSRF 설계가 달라짐)
- [ ] 망분리 빌드: npm·PyPI 사내 미러, Node 26.7.0·pnpm 11.1.1 설치(폰트는 이미 자체 호스팅)
- [ ] CI: GitHub Actions 사용 가능 여부 / 사내 CI로 이행 여부, 저장소를 사내 Git으로 옮기는지(이슈·PR 흐름이 GitHub 전제)
- [ ] 사내 표준 브라우저와 버전(MVP는 데스크톱 웹만)
- [ ] 사내 주소가 HTTPS인지 — 표 행 복사(#174)는 보안 컨텍스트에서만 여러 페이지 선택을 서버에서 읽어 복사하고, HTTP면 현재 페이지에 보이는 선택 행만 복사한다(버튼·Ctrl/⌘+C 같은 경로; 현재 페이지에 선택 행이 없으면 복사하지 않고 그 페이지로 가라고 안내) HTTP면 최근 조회 조건(06 §11)은 `navigator.locks`가 없어 꺼진다(다른 쓰기·파일 선택은 UUID 조각 `randomUuidV4()`로 동작한다).
- [ ] 환경 수(개발·스테이징·운영)와 환경별 URL — IdP redirect URI와 환경별 플랫폼 origin
- [ ] 운영 데이터는 `SEED_MODE=bootstrap`(Workspace·system Actor만)으로 시작하고 첫 관리자는 `set-actor-role`로 올린다 — 절차 [첫 관리자 부트스트랩](../../ops/platform-api/docs/release/first-admin-bootstrap.md)
- [ ] 파서 Postgres 접근: 같은 인스턴스·별도 스키마·read-only 계정 요청 절차(03)
- [ ] 서버 로그 수집처 — 오류 보고·Correlation ID 추적 경로
- [ ] 프록시 read timeout 60초 이상 가능 여부(서버 25초·클라이언트 30초보다 길게 — [전송 형식 초안](http-adapter-contract.md) §5)
- [ ] 프록시·서버 본문 크기 한도(초과 시 413 — 초안 §2)
- [ ] 사내 표준 요청 id 헤더(`X-Request-Id` 등)가 있는지 — 있으면 `X-Correlation-Id` 대신 그것을 쓴다(초안 §7)
- [ ] 프록시 HTTP/2 여부(HTTP/1.1이면 출처당 6연결 큐 대기가 30초 타임아웃에 들어간다 — 초안 §5)와 `/api/**` 캐시 설정(`Cache-Control: no-store` 존중 — 초안 §1)
- [ ] SSO 게이트웨이가 미인증 `/api/**`에 302가 아니라 401을 답하게 설정할 수 있는지(초안 §6, #150과 함께)
- [ ] 사내 표준 브라우저가 `AbortSignal.any`(Chromium 116+)를 지원하는지 — 전송 초안 §5가 Chromium 116+를 가정

### DB 대상 준비물

- [ ] 읽기 전용 로그인 계정. 필요한 스키마의 `USAGE`와 조회할 표·뷰의 `SELECT`만 부여. 프로시저 대상은 지정 프로시저 실행 권한만 부여(PostgreSQL 연결기는 프로시저 호출 불가, MSSQL 연결기만 호출).
- [ ] MSSQL 대상: 지정 프로시저의 `EXECUTE`만 가진 계정(프로시저 대상) 또는 조회할 표·뷰의 `SELECT`만 가진 계정(문장 대상). MSSQL에는 읽기 전용 트랜잭션이 없어 계정 권한이 유일한 보장. 목록 인자는 `listJoin` 구분자로 이은 문자열 하나로 전달되므로 프로시저가 그 구분자로 나누는지 확인. 문장의 목록 자리표시자는 값 개수만큼 `@p1, @p2, …`로 늘어나며 2000개 초과 시 거부. 결과 집합은 하나만 읽고, `datetimeoffset`·이진·`sql_variant`·UDT 열과 중복 열 이름은 거부되므로 해당 열은 문자열로 변환해 조회.
- [ ] 코어 서버에서 DB 주소·포트로 가는 네트워크와 TLS 설정 확인.
- [ ] DBA가 감시할 `applicationName` 지정(PostgreSQL `application_name`, MSSQL `appName`). 생략 시 드라이버 기본값. 대상별 풀 `pool.max`·동시 조회 `pool.concurrency` 합의. 생략 시 4연결·2조회, 취소 중 별도 제어 연결 최대 2개.
- [ ] 문장 시간 제한 확인. 풀 대기도 대상 예산에 포함하며, PostgreSQL은 읽기 전용 트랜잭션의 `SET LOCAL statement_timeout`으로 제한. MSSQL은 요청별 `requestTimeout`으로 제한하고 초과 시 요청 취소. 기본 코어 27초 마감의 남은 시간에서 2초를 뺀 값 사용.
- [ ] 접속 문자열 파일을 코어 서버만 읽는 위치에 배치(예: `/synthetic/secrets/shared`, 소유자 전용 `0600`). MSSQL 파일은 ADO 형식 한 줄(예: `Server=syn-db.invalid,1433;Database=synthetic;User Id=syn_reader;Password=…;Encrypt=true`). 선언의 `connectionFile`에는 경로만 기록. 접속 문자열은 저장소·응답·로그에 기록 금지.
- [ ] Site·room별 대상 배치, 열 대응, Scope 검증 방식과 행 상한 확인. [합성 선언 묶음 예시](examples/routed-declarations.example.json)는 여러 Site의 공용 대상과 한 Site의 room별 분할 대상, `listJoin`을 쓰는 MSSQL 프로시저 대상, 기존 문자열 경로를 함께 제시.
- [ ] 플랫폼은 쓰기·DDL을 수행하지 않으며, 조회 SQL에 `LIMIT`·`ORDER BY`·`COUNT`를 덧붙이지 않음. 선언된 문장·프로시저를 파라미터로 실행하고 행 상한에서 커서를 닫거나(PostgreSQL) 요청을 취소(MSSQL). 읽기 전용 계정 권한이 1차 보장([ADR-0153 결정 8](../adr/0153-upstream-target-routing-and-declared-connectors.md)).

### 선언 묶음과 메뉴 선언 스냅샷

- [ ] 웹 빌드(키트 `build:real`)가 빌드 출력에 쓴 `menu-declarations.snapshot.json`을 코어 서버가 읽는 위치에 둔다. 손으로 만들거나 고치지 않는다. 메뉴 선언이 바뀌면 웹을 다시 빌드하고 이 파일도 함께 바꾼다.
- [ ] 코어 서버 설정 `MENU_DECLARATIONS_SNAPSHOT_FILE`에 그 경로를 준다. `MENU_DECLARATIONS_FILE`이 있으면 필수다. 묶음의 엔드포인트·동작이 이 스냅샷의 메뉴 선언과 다르면 서버가 뜨지 않고, 어느 행의 어느 필드인지 알려 준다([ADR-0156](../adr/0156-core-server-checks-the-bundle-against-a-built-menu-snapshot.md)).
- [ ] 묶음의 엔드포인트 행은 `{ id }`만 쓴다. 배포가 정하는 `paramTypes`·`limits`만 덧붙이고, 메뉴 소유 필드(`menuId`·권한·Scope·Context·`paramKeys` 등)는 서버가 스냅샷에서 채운다. 그래서 메뉴 선언이 바뀌어도 묶음은 고치지 않는다. 새 엔드포인트에 남는 손 작업은 소유자 표(`endpointOwners`) 한 행이다. 동작 행은 모든 필드를 적는다.
- [ ] **한계:** 실서버에서 선언 묶음의 쓰기 동작(`actions`)은 아직 안 된다(미구현, [ADR-0148](../adr/0148-minimal-forwarder-and-identity-token.md) 미룸). 스키마는 `actions`를 받지만 묶음에 동작이 한 줄이라도 있으면 코어 서버가 기동을 거부한다(`declared actions are refused … ADR-0148`). 쓰기는 mock에서만 동작하므로, 저장소 밖 메뉴의 쓰기는 실서버 통과로 세지 않는다. 다시 여는 조건과 추적은 `.planning/backlog.md`.

### Scope 카탈로그와 첫 부여

사내는 `MENU_DECLARATIONS_FILE` 묶음의 `scopeCatalog`에 `{ site, label, rooms: [room_name, …] }` 값을 준비한다. 부여 서비스는 준비하지 않는다. 원천 선택·검증 계약은 [체크리스트의 Scope 부여 서비스 계약](real-server-checklist.md#scope-부여-서비스-계약), 결정 근거는 [ADR-0154](../adr/0154-site-and-room-grants-are-platform-owned.md)다.

- site·room을 없애거나 이름을 바꾸기 전에 해당 값의 부여를 먼저 회수한다. 카탈로그 밖 부여는 판정에서 제외되지만 행은 남으므로 같은 이름이 돌아오면 접근이 되살아날 수 있다.
- 첫 배포는 카탈로그 설정 → 서버 기동 → Admin의 첫 Scope 부여 순서다. `permission_self_approval: forbidden`이면 첫 부여를 위해 Admin이 두 명 이상 필요하다.

### 선언 capability (메뉴 권한 단위)

사내 메뉴 권한은 묶음의 `capabilities`에 `ext.<모듈>.<동작>` 이름으로 선언하고 권한 행이 그 이름을 가리키게 한다([ADR-0157](../adr/0157-bundle-declares-menu-capabilities.md)). 규칙과 기본값은 [05 권한 정책 «Declared capabilities»](../architecture/platform-api/05-permission-policy.md#declared-capabilities-adr-0157-1902)가 원천이다. 메타를 비우면 가장 닫힌 기본값(민감, Admin 우회 없음, 세션 전용, Admin·Developer만)이 된다.

- 전환 순서: 묶음에 capability 선언 → 서버 재기동 → 필요한 사람에게 부여 → 권한 행을 새 capability로 바꾸고 재기동. 선언 없이 권한 행부터 바꾸면 기동이 실패하고, 부여 전에 권한 행을 바꾸면 전원이 막힌다.
- 은퇴 순서: 권한 행에서 뺌 → 그 capability의 부여·거부·대기 신청 회수(부여 목록에 «선언에 없음»으로 남은 행) → 선언 삭제. 선언을 먼저 지우면 부여 행은 판정에서 거부되지만 남아 있어서, 같은 이름을 다시 선언하면 옛 부여가 되살아난다. 기동 로그의 경고 수가 0인지 본다.
- `sensitive: true → false`로 바꾸면 그 capability의 지난 권한 행 중 `detail.sensitive` 표식이 없는 행(승인·부여·회수 등)도 감사 화면에 나온다. 신청 행은 표식이 있어 계속 빠진다.
- 되돌리기: 묶음을 이전 판으로 되돌리면 권한 행이 이전의 넓은 대응(예: `workspace.read`)으로 돌아간다. 마이그레이션 0131을 되돌릴 때는 머리의 되돌리기 줄을 따른다(감사 함수 0130 본문 복원, 동기화 함수와 표 삭제). 선언 capability 이름의 부여·신청 행은 지우지 않으며, 선언이 없으면 판정에서 읽히지 않는다.

### 3.3 기존 시스템 연결·서버 계약 담당 — [#148](https://github.com/hjung3113/analytics-platform/issues/148)·[#149](https://github.com/hjung3113/analytics-platform/issues/149)·[#155](https://github.com/hjung3113/analytics-platform/issues/155)

- [ ] 선언 원본은 TS(Zod) → JSON Schema로 정해졌다(ADR-0096). 백엔드 담당은 생성한 Pydantic 모델·`endpoints.json`을 쓰는 데 이의가 없는지 확인 — #148(닫힘)
- [ ] 전송 형식 초안 검토: HTTP 상태와 `outcome` 관계, 부트스트랩 엔드포인트, 알림 경로(폴링·SSE), 타임아웃 값, CSRF, Correlation ID 헤더 — #149. 초안과 질문 목록: [전송 형식 초안](http-adapter-contract.md) §10
- [ ] [ADR-0095](../adr/0095-dual-backend-fastify-core-fastapi-analytics.md) §1·§3의 코어/분석 스키마 소유와 교차 접근 경계를 사내 구성에 반영할 수 있는지 확인한다. site·site_room 부여는 ADR-0154의 플랫폼 부여 표와 배포 Scope 카탈로그를 따른다.
- [ ] **기존 시스템을 선언 묶음으로 붙일 때 시스템마다 정해 주는 것**([ADR-0153](../adr/0153-upstream-target-routing-and-declared-connectors.md), 합성 예시 [routed-declarations.example.json](examples/routed-declarations.example.json)). 새 서버·백엔드 수정은 필요 없다.
  - 연결 방식 하나: HTTP 변환형(`mapped`: 코어가 요청·응답을 선언대로 바꿔 부른다), envelope(그 시스템이 06 §19 envelope와 신원 토큰을 말할 때만), DB 읽기 전용(`statement`) 또는 프로시저(`procedure`). 코어에는 HTTP(`mapped`·envelope)와 DB(`postgres` 문장, `mssql` 문장·프로시저) 연결기가 있다. `postgres` 프로시저는 기동 거부다.
  - 라우팅 키: Scope 키(site, room)로 어느 대상이 어느 데이터를 갖는지 — N site → 1 대상, 한 site를 room별 여러 대상으로, 또는 플랫폼이 볼 수 없는 기준(설비 묶음·기간)으로 나뉘면 모두에 묻고 병합. 대상에 없는 room이 부여될 수 있으면 `unroutedRooms: "skip"`으로 둘지 정한다.
  - 응답 행에 site·room이 있는지, 호출이 room으로 거를 수 있는지: 있고 거를 수 있으면 `verify-rows`(벗어난 행이 하나라도 있으면 응답 전체 실패), 있지만 못 거르면 `drop-rows`, 행에 room이 없으면 `resolve-keys`(키를 site·room으로 푸는 조회 하나). site·room 표기가 플랫폼 값과 다르면 대응표(`valueMap`).
  - 엔드포인트마다 행 상한(`limits.maxRows`, 페이지는 `merge.maxWindow`), 행을 합칠 때의 유일한 정렬 키, 읽기 전용 계정·주소·비밀 파일(위 «DB 대상 준비물»).
- [ ] 체크리스트를 읽고 "기존 시스템에서 이 규칙을 지킬 수 없다"는 항목 — 있으면 계약 변경 결정으로 올린다(루트 `AGENTS.md`)

### 3.4 파서 담당 — [#37](https://github.com/hjung3113/analytics-platform/issues/37)

- [x] 적재 워커 상태 스키마([ingest-status-schema.md](ingest-status-schema.md)) 합의(2026-10-26) — 데이터 신뢰(`trust`, 미수집·처리 지연·커버리지)의 원천. 합의 전 서버 동작은 체크리스트 §3-10(추측으로 채우지 않음). 합의 뒤 모니터링·트레이스(#51).

### 3.5 feature — M3

- [ ] 내 설문 응답 이력 읽기 API(#84 = FeedbackOps#548), 신고자용 `view=my&selected=` 딥링크(#85 = FeedbackOps#549), 딥링크 확장(#81). 실제 VOC 어댑터(#86)는 세션 토큰 공유(#150) 뒤.

### 3.6 사용자(제품 결정)

- [ ] 활용률 이벤트에 조회조건을 넣을지(#75)
- [ ] 전역 감사 조회에 room 권한을 적용할지(#91)
- [ ] 역할 소속 원천(#98) — §3.1 그룹 claim 답 뒤

## 4. 지금 바로 할 수 있는 일 (외부 입력 없음)

- 작은 후속: #122(목적지 단건 provisional), #90(지표 이력을 감사 저장소로).

[ADR-0153](../adr/0153-upstream-target-routing-and-declared-connectors.md) 조각 중 지금 쓸 수 있는 것과 사내 입력이 필요한 것:

| 조각 | 상태 |
| --- | --- |
| 선언 묶음 스키마·기동 검증, 문자열 행(기본 상류) 불변 | 지금 가능 — 합성 묶음으로 시험됨 |
| Scope 키 라우팅(N site → 1 대상, room별 분할), `verify-rows`·`drop-rows`·`resolve-keys`, `unroutedRooms` | 지금 가능 — 사내 입력은 시스템별 site·room 표기와 거를 수 있는지 |
| fan-out 병합(정렬·`maxRows`·페이지·`coverage` 부분 실패) | 지금 가능 — 사내 입력은 유일한 정렬 키 |
| PostgreSQL 읽기 전용 연결기 | 지금 가능 — 사내 입력은 시스템별 대상 종류, 읽기 전용 계정, 주소·네트워크 |
| mssql 문장·프로시저, HTTP `mapped`·라우팅된 envelope | 지금 가능 — 사내 입력은 시스템별 대상 종류, DB 계정·HTTP 자격 증명, 코어 서버에서 대상으로 가는 네트워크 |
| 카탈로그 기반 Scope 부여 | 지금 가능 — 사내 입력은 `scopeCatalog`의 site·room 목록 |

사내 입력은 모두 계정·주소·선언 묶음 파일이며 사내 서버를 새로 두는 일은 없다.

## 5. 사내 메뉴 개발 가이드

> 사내 조립 저장소에서 메뉴를 만드는 개발자는 이 순서 대신 릴리스 자산 `ap-start-kit-<버전>.tgz`로 시작한다: [시작 키트 안내](../guides/standalone-start-kit.md), 반입은 [승인 릴리스 반입 묶음](approved-release-bundle.md), 방향은 [ADR-0141](../adr/0141-in-house-assembly-in-separate-repository.md). 아래 순서는 이 저장소의 `menus/`에 견본 메뉴를 더는 길이다.

실제 메뉴는 사내에서 새로 만든다. 이 저장소의 메뉴 화면은 플랫폼 계약을 검증하는 견본이다. 이 저장소의 견본 메뉴를 더할 때는 아래 순서를 따르고, 규칙의 원본은 각 링크다.

1. **시작 전:** [06](../contract/platform-ui-contract.md) §5 Menu Extension Contract와 §29 Platform-first Definition of Done을 읽고, Page Archetype(§12)·쓸 공통 컴포넌트·연결할 메뉴(§22)를 먼저 적는다. 화면 설계는 [설계 스킬](../../.agents/skills/analysis-platform-wireframe/SKILL.md) 절차(Requirements → IA → Screen Spec → Wireframe → Open Decisions).
2. **그룹·패키지:** 기존 그룹에 manifest를 추가한다. 새 그룹은 사람이 앱 조립 파일(`apps/platform-web/src/menus.ts`)의 `GROUPS` 행을 먼저 추가한 뒤(그룹 id는 `groupId('…')`, 새 공간·권한도 같은 파일의 `SPACES`·`PERMISSIONS`에 선언하고 계약 패키지는 고치지 않는다, ADR-0072) `pnpm gen:menu`로 만든다. 새 공간이면 [Adding a space](../../apps/platform-web/AGENTS.md#adding-a-space)의 네 군데 등록도 함께 한다(빠지면 그 자리를 가리키는 시험이 실패한다). 패키지 규칙은 [menus/AGENTS.md](../../menus/AGENTS.md).
3. **조회 선언:** `menus/<space>/<g>/src/endpoints.ts`에 `defineEndpoint`로 권한(데이터 접근 권한 — 메뉴 권한과 다를 수 있음)·적용 Context·params 키·assessment kind·한도를 선언한다. 서버 판정 규칙은 [체크리스트 §3](real-server-checklist.md), 결정은 [ADR-0019](../adr/0019-menu-query-endpoint-declaration.md).
   - HTTP 연결기 `mapped` 호출의 query에서 `null` 값은 키를 생략한다. 객체 바인딩(`context.condition` 등)은 query·pathParams에 쓸 수 없고 기동 검사가 거부한다([ADR-0153](../adr/0153-upstream-target-routing-and-declared-connectors.md) 결정 7).
4. **화면:** [페이지 작성 가이드](../../apps/platform-web/README.md#페이지-작성-가이드-consumer-규칙). 다른 메뉴로 가는 링크의 목적지는 manifest `linkTargets`로 적는다. 조립 안 없는 `required` 목적지는 `startAppHost`에서 고정 문구의 시작 오류로만 보이므로, 어느 목적지가 없는지는 `buildRegistry(declarations)`를 따로 부르는 조립 시험에서 `RegistryError` 문구와 `registry.missingLinkTargets`로 읽는다([§22](../contract/cross-menu-links.md#22-cross-menu-context-link), [ADR-0158](../adr/0158-unregistered-link-destinations-and-declared-link-targets.md)).
5. **서버 쪽:** 개발 중에는 `menus/<space>/<g>/src/mock/`에 핸들러를 둔다(생성기가 앱 mock 조립에 등록하고 운영 빌드에는 실리지 않는다). 실서버는 새 핸들러를 만들지 않는다: 코어 서버의 선언 묶음이 같은 엔드포인트 id를 기존 시스템의 연결기에 붙인다([ADR-0153](../adr/0153-upstream-target-routing-and-declared-connectors.md), 위 §3.3; 선언 사본은 `sdk-v*` 산출물 `endpoints.json`·`schemas/*.json`, ADR-0096).
6. **적합성 묶음 등록(이 저장소):** 시작 키트에서는 메뉴 폴더마다 `conformance.ts`가 사례를 내고 키트의 `src/conformance.test.tsx`가 모은다([시작 키트 안내](../guides/standalone-start-kit.md)). [`apps/platform-web/src/server-conformance.test.ts`](../../apps/platform-web/src/server-conformance.test.ts)는 mock 조립의 `MOCK_ENDPOINTS`(생성기가 등록)를 그대로 쓰므로 mock은 따로 넣지 않는다. 엔드포인트가 params를 선언하면 `PARAMS` 표에 표본 params를 넣는다(빠지면 테스트가 실패한다). 표본 params는 하네스의 권한 있는 역할(`engineer` — `console:access` 없음), site `MEM`, 하네스 기간으로 `ok` 또는 `empty`가 나와야 한다. 엔드포인트가 `console:access`를 요구하면 그 하네스로는 성공 요청을 만들 수 없으니 먼저 묻는다. 메뉴에 쓰기 동작이 있으면 생성된 `src/mock/index.ts`의 `<group>ActionsMock`에 핸들러를, `<group>WriteSamples`에 동작마다 입력 표본(키는 전체 동작 id `<group>.<action>`)을 함께 넣는다. `pnpm gen:menu`가 두 목록을 앱의 `MOCK_ACTIONS`·`MOCK_WRITE_SAMPLES`에 이미 등록했으므로 앱은 고치지 않는다. 표본이 없는 동작은 적합성 시험이 그 동작 id를 들어 실패한다.
7. **검증:** [루트 AGENTS.md의 검증 규칙](../../AGENTS.md#verification)을 따른다. 변경 패키지와 영향받는 describe로 좁혀 검증하고, 화면 변경은 브라우저로 확인한다. 실서버 브라우저 실행은 [실서버 체크리스트 §8](real-server-checklist.md#8-실서버-브라우저-계약-검사-593)을 따른다.

하지 말 것: 메뉴 작업 중에 `packages/*`를 고치지 않는다(부족하면 이슈로 올려 플랫폼 작업으로 한다). 새 메뉴 데이터를 위해 `PlatformAdapter` 포트 메서드를 늘리지 않는다. 그 밖의 금지(표 엔진 import, 메뉴 간 import, URL 직접 조립, 화면의 권한 판단, wall-clock TZ 변환)는 [menus/AGENTS.md](../../menus/AGENTS.md)·페이지 작성 가이드·06 §6.3·§22가 원본이다. 메뉴 화면 3개 이상을 연속으로 만들 때는 먼저 범위를 확인한다(루트 `AGENTS.md`).

## 6. 사내 적용 완료 기준

- [ ] 사내 테스트 서버 대상 적합성 묶음 전부 통과(#152로 넓힌 범위 포함) — 실행 기록을 #154에 남긴다.
- [ ] 체크리스트 §2 표의 메서드 전부가 실어댑터로 동작, §3 판정 순서·등록 검증이 서버에 있음.
- [ ] 운영 빌드는 빌드 단계에서 mock·dev 모듈 금지 검사(#153); 실어댑터 조립을 넣은 운영 빌드 통과는 #154다. 그 증거는 조립을 주입한 빌드(`AP_PLATFORM_ASSEMBLY=… build:prod`, 가드가 실어댑터를 포함한 전체 그래프를 검사한다)이고, 기본 `check:prod-graph`는 조립을 제외(external)하므로 실어댑터 그래프의 증거가 아니다.
- [ ] 사내 SSO로 로그인 → 세션 부트스트랩 → 권한 다른 두 계정에서 메뉴·데이터 범위가 다르게 보임(서버 판정).
- [ ] 세션 만료·재로그인 때 이전 결과가 한 프레임도 보이지 않음(체크리스트 §2 `subscribe`).
- [ ] 오류 화면의 Correlation ID로 서버 로그를 찾을 수 있음.
- [ ] 데이터 신뢰: #37 합의 전 동작이 체크리스트 §3-10대로다 — 원천 의존 kind(`collection`·`processing_delay`·`coverage`)는 빼지 않고 `unknown`, Trust의 모르는 값은 `null`.
- [ ] `pnpm dev`·`pnpm e2e`는 여전히 mock으로 돈다(개발 경로 유지). 실서버 대상 E2E를 돌릴지는 2단계에서 따로 정한다 — 지금 E2E는 mock 시나리오(`malformed` 등)에 기댄다.

## 7. 관련 문서

- [실서버 연결 체크리스트](real-server-checklist.md) — 서버·어댑터 규칙 원본
- [`@ap/server-conformance`](../../packages/adapters/server-conformance/AGENTS.md) — 적합성 묶음과 하네스
- [패키지 경계](platform-packages.md) §3–§5 — 의존 방향, 포트 메서드 기준
- [ADR-0019 메뉴 조회 포트](../adr/0019-menu-query-endpoint-declaration.md) — Q2(선언 원본) 배경
- [03 백엔드 스택](../architecture/backend-stack.md) — FastAPI·SQL-first·인증 구조·Alembic
- [적재 워커 상태 스키마](ingest-status-schema.md) — #37
- [플랫폼 인바운드 링크 계약](platform-inbound-links.md) — M3

## 로그 탐색 Consumer (#1473)

`menus/log-dev/log-analysis` composes the SDK table (`fill`) and `OrderedIntervalTrack` with the merged investigation and Source reads. The synthetic fixture is development-only. Real usage requires a Source adapter and current Source-owner permissions; no connected Source is shown as 원본 없음. The confirmed list/right-drawer screen is implemented; REST export transport, time-range filters, and rule-result evidence linking remain explicitly unimplemented (see [backlog](../../.planning/backlog.md)). Handoff is #1474. Browser/E2E and SDK API snapshot gates must pass before this node is accepted.
