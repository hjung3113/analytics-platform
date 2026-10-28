# 저장된 뷰 서버는 객체 ACL만 판정하고, 메뉴·Scope는 실제 데이터 경계가 판정한다

상태: **Decided (2026-10-29)**, 서버 모듈 구현됨(#1105a, §5·§6). HTTP 저장소·브라우저 이전 실행·사람 이름 표시는 구현 전(#1105b).
- 결정자: 사용자 — [#1105 결정 댓글](https://github.com/hjung3113/analytics-platform/issues/1105)(2026-10-29): 권한 권위 분리, 공식 승인 `console:access`, 사람 조회 원천, 조직 팀 공유 미구현. 나머지 세부 설계(전송 모양·상한·이전 프로토콜·공식 회수 정책)는 팀장(사용자 위임, 되돌릴 수 있음).
- 관련: [ADR-0092](0092-saved-view-units-tiers-and-groups.md) §3을 **부분 대체**한다(아래 §1; 0092 본문은 역사로 보존). [ADR-0095](0095-dual-backend-fastify-core-fastapi-analytics.md)(Fastify core), [ADR-0097](0097-platform-features-and-role-based-names.md)(서버는 `@ap/contract-schemas`를 런타임 import, `@ap/contracts`는 안 함), [ADR-0098](0098-adapter-preferences-people-notices-ports.md)(사람 정확 조회, 상한 규칙). 계약 본문 `docs/contract/kernel.md` §21. 스키마 원본 `packages/sdk/contract-schemas/src/saved-view-commands.ts`.

## 결정

### 1. 권한 권위는 둘로 나뉜다 (ADR-0092 §3 부분 대체)

- 저장된 뷰 서버는 **객체 ACL만** 판정한다: 누가 이 뷰를 보고·복제하고·고치고·공유하고·승인하고·회수하는가. 메뉴·Scope·room 권한은 판정하지 않는다.
- 뷰를 열거나 복원할 때의 메뉴·Scope 판정은 **실제 데이터 경계**(`menuQuery` 등 데이터 요청)가 한다. 공유는 데이터 권한을 주지 않는다는 0092 §3의 원칙은 그대로다. 바뀐 것은 판정 주체뿐이다.
- 목록·단건은 읽을 때마다 객체 ACL을 다시 판정한다. 권한 밖 항목은 `{ id, denied: true, reason }`만 낸다. 제목·소유자·그룹·본문을 노출하지 않는다(ACL 비누설).
- 클라이언트가 준 역할·grant는 권위가 아니다. 객체 capability(`canView…canRevoke`)는 서버가 세션과 저장된 ACL에서 계산한다.

### 2. 소유·공유·공식 승인

- 소유자는 세션 사용자이며 서버가 발급한다(`ownerId`, 뷰 id, 버전, 시각은 서버 값). 원작자는 공식 게시·회수를 거쳐도 소유를 유지한다.
- 공유 경로는 여러 개일 수 있다: 소유, 사람 지정, 커스텀 그룹, 공식. 접근은 경로의 합집합이고, 한 경로(예: 그룹 멤버 제거)를 끊어도 다른 유효 경로는 남는다.
- 그룹은 **커스텀 그룹만** 구현한다(0092 첫 구현 범위). 관리자(`managerIds`)와 플랫폼 관리자가 멤버를 고친다. 멤버십은 객체 접근만 주고 메뉴·Scope 권한은 주지 않는다. 조직 팀(`org-team`) 공유는 구현하지 않는다 — 이유: 믿을 만한 멤버십 원천이 없다. 다시 여는 조건: SSO 동기화 또는 `core.teams` 멤버십 원천이 생길 때(backlog).
- **공식 승인 권한은 기존 `console:access`**(workspace.admin 매핑)다. 새 역할 이름을 만들지 않고, 클라이언트가 준 역할을 믿지 않는다.
- 공식 신청은 대기 제안(pending proposal)이다. 일반 열람자에게는 마지막 승인본이 계속 보이고, 대기 제안은 신청자와 승인 권한자에게만 보인다. 승인하면 제안이 승인본이 된다. 거절하면 사유와 함께 남고 재신청할 수 있다.
- **회수**: 소유자 비공개로 돌아가고 승인본 내용은 유지되며 대기 제안은 지운다(`approved → none`, 공개 대상 `private`). 공식 회수 뒤 임의 재게시는 없다.
- **개인 기본**은 사용자·메뉴별 설정이다. 접근을 잃은 기본(공유 해제·회수·그룹 이탈)은 다른 사람에게 복원하거나 노출하지 않고 읽을 때 해제 또는 거부한다.
- 사람 조회는 같은 workspace의 활성 구성원이고 `affiliation`은 빈 문자열이다(원천 없음). 정확한 불투명 id 조회로만 표시 이름을 얻는다. 검색 결과는 표시용이며 권한이 아니다. 새 구성원·소속을 만들어 내지 않는다.

### 3. 전송: 명령 하나, 엄격한 판별 합집합

- `POST /api/v1/platform/saved-views/commands`. 쿠키 세션 + CSRF + 활성 workspace + `Cache-Control: no-store`를 읽기 명령에도 적용한다. 범용 RPC·임의 SQL은 없다.
- 본문은 `{ version: 1, op, … }`의 엄격한 객체다. `op`는 `SavedViewStore` 메서드 이름과 같다(`list get save update remove setDefault getDefaultId setVisibility requestOfficial decide revoke listApprovalRequests listGroups createGroup updateGroup searchPeople`)에 `importLocal`을 더한다. `searchPeople`의 `signal`은 전송 전용이라 제외한다. `key`는 `menuId`만 싣는다(`userId` 없음 — 서버가 세션에서 읽는다). 알 수 없는 `op`·`version`·키는 거부한다(위조한 `ownerId`·`visibility`·`id`·`version` 포함).
- 쓰기는 `expectedVersion`을 싣고, 서버는 비교와 갱신을 한 원자 단계로 한다(승인·회수 동시 요청 포함, 판정과 쓰기 사이 ACL 틈 없음). 어긋나면 `conflict`.
- **응답은 ApiResponse로 감싸지 않는다.** 명령마다 포트의 반환 타입 그대로다: 변경 명령은 `Result<T>`, 읽기는 배열·항목·`null`·문자열. 도메인 실패는 200의 `Result`(`conflict`/`forbidden`/`invalid`), 인증·전송 실패는 HTTP 상태다. 변경 명령의 전송 실패는 `unavailable`로, 읽기의 전송 실패는 reject로 어댑터가 옮긴다. 응답 스키마는 `savedViewResponseSchemas[op]`로 명령별로 검증한다.
- 초안 모양은 `validateSavedView`와 같다: 지원 Context 키만(`scopeId`는 저장 불가 키), page·chartOptions·layout은 `isForbiddenSavedViewKey` 이름을 재귀적으로 거부하고 Scope라는 이름의 키는 거부하지 않는다. `panels`는 불투명 슬롯이라 유한 JSON인지만 보고 내용은 보지 않는다. 와이어 스키마는 알 수 없는 키를 거부하므로 SDK보다 엄격하다.
- **전송 상한**(보안·자원 이유): 명령 본문 직렬화 262,144 바이트, 중첩 깊이 32(본문 루트가 0). 이 상한은 SDK 검증은 통과하는 초안을 거부할 수 있다 — 정확한 수용 동치를 주장하지 않는다. 거부는 복구 가능한 `invalid`(변경 명령은 `{ ok: false, reason: 'invalid', detail }`)이며 사용자 입력은 보존된다. 스키마는 재귀 파싱 전에 깊이·크기를 검사한다. 상한은 JSON Schema 산출물로 표현되지 않아 산출물만 쓰는 소비자는 직접 적용한다.

### 4. 브라우저 로컬 이전(`importLocal`)

- 명령: `importToken`(한 번의 이전에 고정된 토큰), `rows`(`legacyKey` + 초안, 최대 200), `defaults`(`key.menuId` + 가리키는 `legacyKey`). 현재 행위자의 키만 가져오며, 공유·그룹·관리자 능력과 원래 소유·공개 대상은 권위로 받지 않는다(초안은 엄격하므로 거부).
- 서버는 행마다 비공개 뷰를 서버 발급 id로 만든다. 결과는 행별이다: `imported`(새 id), `already_imported`(같은 토큰의 재시도, 같은 id), `rejected`(사유). 재시도는 중복·부활을 만들지 않는다. 개인 기본은 커밋된 행에만 매핑한다.
- 클라이언트는 **커밋된 행(id가 있는 결과)만** 승인(ack)하고 지운다. 거부된 행은 로컬에 남겨 복구할 수 있게 하고 보고한다. 전체 전송 실패면 아무것도 지우지 않는다. 같은 토큰을 재사용해 부분 실패 뒤 다시 보낸다.
- 감사: 게시·승인·회수·그룹 멤버 변경·이전은 코어 감사 서비스에 남긴다. 페이로드(뷰 본문)·비밀은 감사 내용에 넣지 않는다.

### 5. 구현 상태 (이번 단계)

| 항목 | 상태 |
| --- | --- |
| 이 ADR의 결정 | Decided |
| `@ap/contract-schemas`의 명령·응답 스키마 | 구현(이번 단계) |
| 서버 모듈·Drizzle·ACL·감사 | 구현(#1105a, `apps/platform-api/src/modules/platform-saved-views`, 마이그레이션 0078) |
| HTTP 저장소(`@ap/http-adapter`)·브라우저 이전·사람 이름 표시 | **구현 안 함** — #1105b |
| 조직 팀 공유 | **구현 안 함**(위 이유·재개 조건) |

### 6. 서버 구현에서 정한 세부 (#1105a, 되돌릴 수 있음)

- **저장**: `platform` 스키마. 뷰 행(현재/승인본 `content`, 공식 사본의 변경본 `pending`, `version`, `updated_at_ms`, `visibility_kind`, `approval`), 사람 지정·그룹 공유 관계, 커스텀 그룹과 멤버(`is_member`·`is_manager`), 사용자·메뉴별 기본, 이전 매핑(`saved_view_imports`, 뷰 FK 없음 — 삭제 뒤에도 남는 tombstone). 모든 쿼리는 workspace로 거른다. id·소유자는 서버 값이며 소유자는 세션 `core.actors.id`(문자열 UUID)다.
- **직렬화**: 모든 변경은 workspace 단위 advisory lock 아래 한 트랜잭션에서 ACL·`expectedVersion` 비교와 쓰기·감사를 한다. 실패·충돌·변화 없는 호출(같은 내용 update, 같은 공개 대상, 실효 변화 없는 그룹 수정)은 행과 감사를 바꾸지 않는다(버전도 오르지 않는다). 읽기는 repeatable read 스냅샷 하나다.
- **접근**: 소유자 ∪ 사람 지정 ∪ 공유 그룹의 멤버·관리자 ∪ 공식 ∪ (승인 권한자의 대기 신청). 읽을 때마다 다시 판정하며 기본(default)도 같다 — 접근을 잃은 기본은 `getDefaultId`가 `null`이고, 회수·공개 대상 변경은 해당 사용자의 기본 행을 지운다. `get`은 존재하나 접근 밖이면 `{id, denied, reason}`, 없거나 UUID가 아니거나 다른 workspace면 `null`이다. `list`는 접근 가능한 항목만 낸다(목록에 denied 항목을 만들지 않는다 — 메뉴·Scope 거부가 서버 몫이 아니기 때문). 소유자·그룹 관리자·승인 권한자가 아닌 열람자에게 `visibility.userIds/groupIds`는 본인 몫만 보인다.
- **승인**: 승인 권한 = `holdsPlatformPermission(console:access)`. 소유자와 승인자가 같은 사람이어도 막지 않는다(기존 로컬 동작). 첫 신청은 뷰 행의 `approval`, 승인된 공식 사본의 편집은 `pending`에 두고 일반 열람자는 승인본을 본다. 회수는 비공개·`approval none`·메모·`pending` 삭제·소유 유지·승인본 유지.
- **사람**: `core.actors`에는 비활성 열이 없다. 같은 workspace의 `actor_type = 'internal_member'` 행이 현재 디렉터리 구성원이다(system·다른 workspace 제외). 활성 로그인 세션을 활성으로 보지 않는다. 소속은 `''`. 검색은 표시 이름 부분 일치(최대 20건)에 더해 질의가 정확한 id이면 그 한 명을 상한과 무관하게 맨 앞에 둔다. 정확 조회(`POST /people/lookup`)는 UUID 아닌 불투명 문자열·미지의 id를 조용히 뺀다.
- **불투명 입력**: UUID가 아닌 id는 DB에 캐스트하지 않는다(`get`은 `null`, 변경은 `invalid`/`forbidden`). 공유·그룹 대상으로 알 수 없는·다른 workspace·UUID 아닌 값은 존재 여부를 알리지 않고 `invalid`(`unknown person`/`unknown group`), 볼 수 없는 그룹도 같다(로컬 mock의 `forbidden`과 다른 점). NUL·짝 없는 서로게이트는 `invalid`(`detail: 'unicode'`)이고 읽기 질의는 빈 결과다. 상한: 대상 200, 그룹 멤버 500, 이름 100자, 메모 2000자, 검색 20건.
- **그룹**: 만든 사람이 관리자. 관리자·승인 권한자가 멤버를 고친다. 마지막 관리자는 제거할 수 없다(`last-manager`). 멤버 상한 500과 변화 없음 판정은 제거 뒤 추가를 적용한 최종 집합 기준이다. 승인 권한(`console:access`)은 workspace 잠금 뒤 같은 트랜잭션에서 다시 판정한다. 그룹 삭제는 포트에 없다.
- **이전**: 행마다 savepoint로 서버 id를 발급해 `(workspace, actor, importToken, legacyKey)` 매핑(내용 해시 포함)을 남긴다. 같은 재시도는 `already_imported`(삭제 뒤에도 같은 id, 부활 없음), 같은 토큰·행 키에 다른 내용은 `rejected invalid import-token-reuse`, `importToken`의 NUL·짝 없는 서로게이트는 SQL 전에 요청 전체 `invalid unicode`, `legacyKey`나 초안의 같은 값은 그 행만 `rejected invalid unicode`(거부된 행은 매핑을 남기지 않아 고쳐 다시 보낼 수 있다). 기본은 커밋된 본인 소유 행에만, 이미 쓸 수 있는 서버 기본이 없을 때만 매핑하고 응답에는 실제로 적용된(또는 이미 같은) 기본만 담는다. 와이어 스키마가 구조 오류(미지의 키, 중복 `legacyKey`)를 요청 전체 HTTP 422로 거부하므로 행 단위 `invalid`는 서버 판정(유니코드·토큰 재사용)만이다.
- **감사**: `saved_view_official_{requested,approved,rejected,revoked}`, `saved_view_visibility_changed`, `saved_view_group_{created,updated}`, `saved_view_import_submitted`(`@ap/feature-shared`). 공식본 편집이 새 신청을 만들 때도 새 버전의 `requested`를 같은 트랜잭션에 남긴다. 상세는 id·버전·개수뿐이다. 감사 투영의 subject 허용 목록은 바꾸지 않아 이 이벤트는 플랫폼 감사 조회에 나오지 않는다.
- **HTTP**: 변경 명령의 스키마 위반은 HTTP 422 `validation.malformed_request`(어댑터가 변경 명령은 `invalid`로 옮긴다), 인증 없음 401, CSRF 불일치 403. 사람 정확 조회(`/people/lookup`)는 상태를 바꾸지 않는 읽기 `POST`라서 쿠키 세션·활성 workspace·`no-store`는 같고 CSRF 토큰은 요구하지 않는다(기존 `lookupPeople` 어댑터 호출과 [http-adapter-contract](../integration/http-adapter-contract.md) §1·§6의 읽기 `POST` 규칙). CSRF는 `saved-views/commands`의 모든 명령에만 적용한다. 전역 분당 한도만 적용한다.

## 결과

- 0092 §3의 "열람·복원 때마다 서버가 Scope·room·메뉴 권한을 다시 판정"은 이 ADR §1로 부분 대체된다. 0092의 단위·단계·그룹 불변식은 유지한다.
- `docs/contract/kernel.md` §21은 결정된 정책과 구현된 서버 모듈, 아직 구현되지 않은 HTTP 저장소·브라우저 이전 실행(#1105b)을 구분해 적는다. `real-server-checklist`·`platform-packages` 갱신은 서버 구현 단계가 한다.
- 되돌리기: 정책 선택(회수 뒤 비공개, 승인 권한, 상한)은 이 ADR을 고쳐 바꾼다. 권한 권위 분리는 사용자 결정이다.
