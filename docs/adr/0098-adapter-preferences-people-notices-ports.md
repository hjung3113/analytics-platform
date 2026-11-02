# PlatformAdapter에 사용자 설정·사람 조회·공지 포트를 더하고 `defaultRangeTo`를 null로 넓힌다

상태: **Decided (2026-10-28)** — 결정 기록이며 서버·마이그레이션 구현 완료를 뜻하지 않는다.
- 결정자: 사용자 — [#1096 결정 댓글](https://github.com/hjung3113/analytics-platform/issues/1096): 서버 사용자 설정 포트와 1회 이전, nullable `defaultRangeTo`, 저장된 뷰의 사람 조회, 공지 CRUD, SDK `sdk-v0.21.0`.
- 팀장(사용자 위임, 되돌릴 수 있음): 이 ADR의 저장·이전·포트 모양 설계 전부(키 문법·크기 상한 포함). 스키마 원본 경계는 이 ADR이 고르지 않는다 — [ADR-0097](0097-platform-features-and-role-based-names.md) 「서버 경계」가 소유하며, 새 포트의 Zod 원본은 `@ap/contract-schemas`에 두고 서버가 런타임에 직접 import한다(서버 쪽 사본·drift 테스트 없음). `@ap/contracts`는 손으로 쓴 의존성 없는 타입으로 남고 `equivalence.test.ts`가 `tsc`로 같음을 증명한다.
- 구현 범위: #1103은 계약·mock·HTTP 어댑터·적합성·문서만 낸다. 서버 모듈은 #1104(설정)·#1105(사람 조회 화면 통합)·#1106(공지)이, 브라우저 저장소 → 서버 이전의 런타임은 #1104가 구현한다. 이 이슈는 런타임 저장소를 바꾸지 않는다.

## 결정

### 1. 사용자 설정은 사용자별 이름공간 키와 JSON 값이다

- 서버가 보존하는 것은 인증된 세션 사용자의 키-값이다. 클라이언트는 사용자 id를 보내지 않으며(알 수 없는 키는 거부) 서버가 세션에서 읽는다.
- **키 문법**: `favorites`, `recents`, `lastScope`, `lang`, `columns:<preferenceKey>`(`<preferenceKey>`는 `[A-Za-z0-9_.-]{1,100}`). 계정 식별자는 키에 들어가지 않는다. 데이터·필터·이력·보드 레이아웃 payload는 키 문법 밖이라 거부된다(보드 레이아웃은 #1096이 범위 밖으로 정했다). 문법을 넓히려면 이 ADR을 개정한다.
- **크기 상한**(보안·자원 이유: 사용자가 보낸 JSON이 서버 메모리·DB 행·응답 크기를 키우는 입구이므로): 요청당·계정당 키 200개, 값 하나 직렬화 UTF-8 65,536 바이트, 요청 본문 262,144 바이트. 값은 유한한 JSON(깊이 32 이하)이다. 상수는 `@ap/contracts`(`PREFERENCE_*`)와 `@ap/contract-schemas`에 같은 값으로 있고 테스트가 일치를 확인한다. JSON Schema로 표현하지 못하는 제약(바이트 크기, set/remove 키 겹침, 계정 전체 키 수 200, 값의 JSON 깊이 32)은 런타임 경계에서 강제한다. `@ap/contract-schemas`의 `jsonValueSchema`는 재귀 파싱 전에 깊이를 검사해 깊은 입력을 예외 없이 거부하지만, JSON 산출물(`jsonValue.json`)은 제한 없는 재귀 `$ref`만 담으므로 산출물만으로 검증하는 소비자는 깊이와 계정 전체 키 수를 직접 적용해야 한다. 계정 전체 키 수는 변경 뒤 상태로 판정하고, 초과하면 `too_large`와 함께 아무 값도 `importedAt`도 바꾸지 않는다.
- **쓰기는 키 패치다**: `{ set?, remove? }`. `set`은 값을 저장하고(`null`은 `null`로 저장), `remove`는 삭제한다. 같은 키가 둘 다 있으면 거부한다. 계정 전체를 덮어쓰지 않는다. 읽기·패치·가져오기의 답은 `ApiResponse<PreferencesSnapshot>`(`trust: null`, `assessments: []`)이고 `PortError`를 쓰지 않는다. 판정 실패는 `error`(크기 초과는 `too_large`)다.
- **읽기 모양**: `{ values, importedAt: string | null }`. `importedAt`은 가져오기가 커밋된 시각이다.

### 2. 브라우저 저장소 → 서버 1회 이전

- `importPreferences({ values })`는 **원자적**이다. 서버가 이미 가진 키는 서버 값이 이기고, 없는 키만 한 커밋에서 저장하며, 같은 커밋에서 `importedAt`을 찍는다. 답은 커밋 뒤 스냅샷이므로 `importedAt !== null`이 완료 확인(acknowledgement)이다.
- 완료 뒤의 호출은 **영구 no-op**이다(현재 스냅샷만 답한다). 다른 기기에서 지운 키가 되살아나지 않게 하려는 것이다.
- **클라이언트 절차(구현은 #1104)**: 인증된 첫 읽기 성공 뒤, 일반 쓰기 전에 `importedAt === null`이면 가져온다. 실패하면 다시 시도하고, 확인을 받아야만 완료로 표시한다. 확인 전에는 로컬 데이터를 지우지 않는다. 한 사용자의 키를 다른 사용자 계정으로 가져오지 않는다: 사용자 이름이 붙은 로컬 키는 접미사가 인증된 사용자와 같을 때만 가져온다. 브라우저 전체 설정인 언어·표 열 설정은 사용자별로 없는 키만 가져온다. 데이터·필터·이력·보드 payload는 가져오지 않는다. 탭 안에서만 쓰는 상태(공간 마지막 화면, 활용 세션)는 `sessionStorage`에 남는다.
- 이 ADR은 이전을 명세할 뿐 런타임 저장소를 바꾸지 않는다. Kernel은 아직 localStorage를 읽고 쓴다.

### 3. 사람 조회는 정확한 id 일괄 조회다

`lookupPeople(ids)`는 불투명 id 목록(최대 200, 중복 없음)을 받아 `readonly GroupMember[]`(`{ userId, displayName, affiliation }`, 저장된 뷰의 기존 어휘)를 돌려준다. 새 `{id, name}` DTO를 만들지 않고 콘솔 역할·부여 데이터를 싣지 않는다. 서버는 세션 사용자가 볼 수 있는 사람만 걸러 답하며, 없거나 볼 수 없는 id는 단지 빠진다(비공개 데이터 유출 없음). 호출자는 id 대체 표기를 유지한다. 정확 조회를 이름 검색의 상한으로 대체하지 않는다. 입력 오류(목록 형식·상한)만 `PortError('invalid_input')`다. 화면 연결은 #1105 몫이다.

### 4. 공지 포트는 플랫폼 서비스다 (일반 규칙의 예외)

메뉴 어휘를 포트에 넣지 않는 규칙의 예외다: 공지는 특정 메뉴가 아니라 ADR-0066의 공통 어댑터 책임이며 #1103이 포트를 명시한다. `listNotices`는 만료 건을 포함한 **관리 목록**이다(`notice:view`) — Home 배너를 위한 둘째 엔드포인트가 아니다. Home은 `home.notices` 메뉴 조회로 남는다(#1106). 쓰기는 `console:access`(기존 권한, 어휘 변경 없음)다. `saveNotice`·`deleteNotice`는 `ActionResponse`를 돌려주고(`ApiResponse`에는 `conflict`가 없다) 요청에 `idempotencyKey`, 수정·삭제에 `expectedVersion`을 싣는다. 서버가 id·작성자·시각을 찍고, 만들기에 id·작성자·시각·알 수 없는 키가 있으면 거부한다. 수정·삭제는 낙관적 버전, 재시도는 같은 키로 재생된다. `Notice`는 Home 필드(`id`, `title: Text`, `scopeId`, `until`)에 `content`와 `version`을 더한다. 실서버 조립은 `saveNotice`·`deleteNotice` 뒤 `home.notices` 캐시만 갱신한다(#1106, 아래 런타임 상태).

**런타임 상태 (#1106, 구현됨 — 실서버 검사 완료):** 코어 서버가 `platform.notices`(migration 0079)와 `GET /api/v1/platform/notices`·`POST …/notices/save|delete`, 그리고 첫 업무 `menuQuery` 경로 `POST /api/v1/menu-query`(`home.notices`만)를 제공한다. 정한 동작:

- 쓰기 순서: 활성 세션·workspace → CSRF → `console:access` → 본문·헤더 모양(`Idempotency-Key`는 UUID이고 본문 키와 같아야 하며, 수정·삭제의 `If-Match`는 `expectedVersion`과 같아야 한다 — 어긋나면 `error`, 변경 없음) → 같은 (행위자, 키) 직렬화 → 같은 트랜잭션에서 `console:access` 재판정 → 재생 조회 → 행 잠금 → `console:access` 재판정(수정·삭제) → 없음·버전 → 쓰기. 권한이 재생·버전보다 먼저고 잠금을 기다린 뒤에 다시 판정하므로, 대기 중 권한을 잃으면(회수·거부·만료) 재생도 충돌도 데이터를 드러내지 않고 아무것도 쓰지 않는다(`forbidden`). 판정된 결과는 모두 HTTP 200 `ActionResponse`이고, 없거나 만료·회수된 세션은 CSRF를 보기 전에 401이고(다른 workspace의 세션은 같은 자리에서 403 `auth.workspace_mismatch`), 활성 세션의 틀리거나 빠진 CSRF는 403이다. `Idempotency-Key`는 본문과의 일치를 원문 그대로 비교한 뒤 소문자 UUID로 정규화해 잠금·조회·영수증에 쓰므로 같은 UUID의 대소문자 표기는 한 키다(지문에는 키가 들어가지 않는다). 같은 키를 다른 입력·다른 연산에 재사용하면 `invalid` + `fieldErrors:[{path:["idempotencyKey"],code:"reused"}]`다(ADR-0054의 menuAction 규칙은 공지에 적용하지 않는다).
- 재생 저장: Core의 `core.idempotency_keys`와 24시간 purge를 그대로 쓴다. 공지의 정상 응답은 2×(200+10000) UTF-16 단위의 이중 언어 본문을 담을 수 있어 Core 기본 16 KiB를 넘을 수 있으므로, 호출마다 선택하는 서버 전용 응답 크기 상한을 더하고(`record(…, { responseBodyMaxBytes })`, 기본 16 KiB는 모든 기존 호출자에게 그대로) 공지는 128 KiB로 고정한다. `ok`만 기록하고 `conflict`·`not_found`·`invalid`는 기록하지 않는다. 삭제 뒤에도 같은 키는 원래 결과를 `replayed:true`로 받는다.
- 서버가 id(UUID)·작성자·시각을 찍고, 응답은 `author`와 시각을 싣지 않는다. 버전은 불투명 `v<revision>`이다. UUID가 아닌 객체 id는 `not_found`다.
- `listNotices`는 만료 포함 목록이고 **전역(`scopeId:null`) 공지만** 돌려준다. site 지정 공지는 그 site를 부여받은 세션에게만 보여야 하는데 서버는 아직 권위 있는 site 부여를 모른다(`scopes: []`).
- **구현 안 함 — site 지정 공지 작성:** 위와 같은 이유로 `scopeId`가 null이 아닌 저장은 `invalid`(`path:["scopeId"]`)다. 다시 여는 조건: 서버가 세션별 site 부여를 권위 있게 공급할 때(그때 목록 데이터 범위와 작성 검증을 함께 연다). 클라이언트가 보낸 부여는 믿지 않는다.
- `home.notices`: 세션 워크스페이스, 정확한 `targetScopeId` 일치(null은 전역만), `until`이 Asia/Seoul wall-clock 현재(초 단위)보다 **뒤**인 것만, 결정적 순서로 `id`·`title`·`scopeId`·`until`만 돌려준다. 순서는 체크리스트 §3(요청 모양 → params 값 → `notice:view` → 핸들러)이고 미지원 엔드포인트·키는 HTTP 200 `error`다. 분석 엔드포인트를 대신 답하지 않는다(구현 안 함 — 백로그).
- Home 갱신: 앱 조립(`apps/platform-web/src/real`)이 실어댑터의 `saveNotice`·`deleteNotice`를 한 번 감싸 `ok`·`conflict`·`unknown`(과 던진 호출) 뒤에 앱이 선언한 `home.notices`를 목표 무효화(`refreshEpochs.bump`)한다. `adapter.subscribe`의 전체 무효화는 쓰지 않고 Kernel은 메뉴 이름을 모른다. 공지 CRUD 화면은 이 릴리스에 없다(소유자 제외, 백로그).

### 5. `defaultRangeTo`는 `string | null`이다

`null`은 서버에 기준점이 없다는 뜻이다. 브라우저 `Date.now()`, 시간대 변환, epoch, 지어낸 날짜로 채우지 않는다. 명시한 기간은 그대로 동작하고, 상대 기본 기간은 없는 채로 남아 필수 기간 게이트가 설명한다. 앵커 없는 상대 저장 뷰는 기존 `SelectOutcome` 이유 `unavailable`로 실패하고 절대 뷰는 복원된다. 전역 Context 바·조회 바의 상대 프리셋(최근 24시간·7일·오늘)은 기존 disabled 모양으로 꺼지고 직접 편집기는 빈 값으로 시작한다. `isTrailingPeriod(g, null, h)`는 false다. HTTP 부트스트랩의 `null`은 유효하고 새로고침 전까지 고정이다(키 누락·형식 오류는 계속 거부). 새 시각 디자인은 없다.

### 6. 클라이언트 구현 상태 (#1104b, 2026-10-29)

팀장(사용자 위임, 되돌릴 수 있음, 2026-10-29): 아래 이전 범위와 원본 보존 정책.

- **배선**: Kernel이 `PlatformProvider serverPreferences`(조립이 켠다; 생략하면 기존 브라우저 저장소 그대로)로 어댑터의 세 포트 위에 도메인을 모르는 설정 컨트롤러를 둔다. 컨트롤러는 어댑터·사용자·revision마다 하나(세대)이고, 오래된 세대의 읽기·가져오기·쓰기 결과는 버린다. 앱은 전송(어댑터)만 주입한다. 실서버 조립(`src/real/http-assembly.tsx`)만 켜고 mock은 켜지 않는다(mock 서버 설정은 메모리뿐).
- **절차**: 인증된 첫 읽기 성공 뒤 `importedAt === null`이면 한 번 가져오고, 그 사이의 쓰기는 대기했다가 준비된 뒤 이름 붙은 키만 패치로 보낸다. 첫 읽기 실패는 로컬 데이터를 건드리지 않고 서버가 비었다고 가정하지 않는다. 가져오기·패치 실패는 로컬 원본과 대기 쓰기를 보존하고 토스트로 알린다.
- **이전 후보(원본 보존 정책)**: 현재 사용자의 정확한 `platform:favorites:<id>`·`platform:recent:<id>`·`platform:lastScope:<id>`, 브라우저 전체 언어 `platform:lang`(en/ko), 그리고 예약 이름공간 `platform:table:<이름>`의 엄격한 표 모양(`sizing`·`visibility`·`pinning`, 그리고 선택으로 문자열 배열 `order`만 — 2026-11-01 정정, #556a)뿐이다. 다른 사용자의 접미사 키는 가져오지 않는다. 가져오기 확인(스냅샷 `importedAt`)만으로는 어느 기기가 커밋했는지 알 수 없으므로 **모든 원본을 지우지 않고 남긴다**. 서버 값이 이기고, 남은 원본은 서버 값을 덮지 않는 브라우저 전용 기록이다.
- **알려진 한계(출처 한계)**: 이름공간 밖 표 키(`equipment-master:columns:v1`, `admin-*:columns:v1`, `hw-time-table:columns:v1:L*`, `cycle-time-slow` 등)는 모양이 같아도 가져오지 않고 그대로 둔다. 키만으로는 표 설정인지 확신할 수 없고 사내 배포 전이라 잃는 이전 범위가 작다. 서버 표 키는 원본 키 UTF-8의 전체 SHA-256으로 `columns:h1_<64자 hex>`를 만든다(계정 식별자 없음, 콜론·유니코드·긴 id가 서로 다르게 유지됨). WebCrypto가 없으면 이전을 보류하고 복구 가능한 실패로 알린다.
- **세대 교체와 해제 중 쓰기**: 컨트롤러는 어댑터가 현재 세션의 사용자 id가 자기 사용자와 같을 때만 보낸다(어댑터는 현재 세션으로 보내므로). 세대가 끝날 때(해제·`revision` 교체·계정 교체) 아직 못 보낸 쓰기(대기·전송 중이던 것, 해시 계산 중이던 표 쓰기 포함)는 버리지 않고 (어댑터, 사용자)별 보관소에 둔다. 같은 계정이고 이전까지 끝났으면 즉시 신호 없이 보내고, 같은 계정의 다음 세대가 시작하면 보관소의 것을 대기열에 이어받는다(더 새 변경이 이긴다). 다른 계정의 세대는 그 계정 몫을 이어받지도 보내지도 않는다. 표 훅은 대기 중인 너비를 만들 때의 컨트롤러에 묶어 그 컨트롤러로 보낸다. 한계: pagehide 직전의 `fetch`는 브라우저가 중단할 수 있고(어댑터 포트에 keepalive 없음), 이미 정리된 세대에 늦게 도착한 쓰기는 같은 계정의 새 세대가 이미 시작했다면 다음 시작 때까지 보관소에 머문다.
- **한도**: 완전한 가져오기 요청(값별 깊이·바이트, 본문 바이트, 서버 키와 후보 키의 합집합 200)을 보내기 전에 검증하고, 안 들어가면 보내지도 확인하지도 않고 모든 원본을 남긴다.

## 이유와 대안

- 서버 보존 대신 localStorage만 두면 기기 간 동기와 서버 검증이 없다. 사용자가 서버 포트와 1회 이전을 승인했다.
- 계정 전체 덮어쓰기는 두 기기의 마지막 쓰기가 서로의 키를 지운다 → 키 패치.
- 가져오기를 일반 패치 모드로 두면 완료 표식과 원자성을 서버가 보장하지 못한다 → 전용 연산.
- `GroupMember`를 재사용하지 않고 `{id,name}`을 새로 두는 안은 저장된 뷰 어휘와 이중이 된다 → 재사용.
- 공지를 `menuQuery`/`menuAction`으로만 두는 안은 메뉴 어휘 규칙에는 맞지만 관리 목록이 Home 메뉴의 권한(`notice:view`)과 한 선언에 묶인다. 사용자가 명시 포트를 승인했다.

## 소유 문서

[kernel.md §6.3·사용자 설정](../contract/kernel.md), [전송 형식](../integration/http-adapter-contract.md) §1, [체크리스트](../integration/real-server-checklist.md) §2, [패키지 경계 §4](../integration/platform-packages.md).
