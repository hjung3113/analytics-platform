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

메뉴 어휘를 포트에 넣지 않는 규칙의 예외다: 공지는 특정 메뉴가 아니라 ADR-0066의 공통 어댑터 책임이며 #1103이 포트를 명시한다. `listNotices`는 만료 건을 포함한 **관리 목록**이다(`notice:view`) — Home 배너를 위한 둘째 엔드포인트가 아니다. Home은 `home.notices` 메뉴 조회로 남는다(#1106). 쓰기는 `console:access`(기존 권한, 어휘 변경 없음)다. `saveNotice`·`deleteNotice`는 `ActionResponse`를 돌려주고(`ApiResponse`에는 `conflict`가 없다) 요청에 `idempotencyKey`, 수정·삭제에 `expectedVersion`을 싣는다. 서버가 id·작성자·시각을 찍고, 만들기에 id·작성자·시각·알 수 없는 키가 있으면 거부한다. 수정·삭제는 낙관적 버전, 재시도는 같은 키로 재생된다. `Notice`는 Home 필드(`id`, `title: Text`, `scopeId`, `until`)에 `content`와 `version`을 더한다. 직접 포트를 부르는 것만으로는 Home 배너가 갱신되지 않는다 — `home.notices` 캐시 갱신 연결은 #1106에서 구현한다(구현 안 함, 다시 여는 조건: #1106 착수).

### 5. `defaultRangeTo`는 `string | null`이다

`null`은 서버에 기준점이 없다는 뜻이다. 브라우저 `Date.now()`, 시간대 변환, epoch, 지어낸 날짜로 채우지 않는다. 명시한 기간은 그대로 동작하고, 상대 기본 기간은 없는 채로 남아 필수 기간 게이트가 설명한다. 앵커 없는 상대 저장 뷰는 기존 `SelectOutcome` 이유 `unavailable`로 실패하고 절대 뷰는 복원된다. 전역 Context 바·조회 바의 상대 프리셋(최근 24시간·7일·오늘)은 기존 disabled 모양으로 꺼지고 직접 편집기는 빈 값으로 시작한다. `isTrailingPeriod(g, null, h)`는 false다. HTTP 부트스트랩의 `null`은 유효하고 새로고침 전까지 고정이다(키 누락·형식 오류는 계속 거부). 새 시각 디자인은 없다.

## 이유와 대안

- 서버 보존 대신 localStorage만 두면 기기 간 동기와 서버 검증이 없다. 사용자가 서버 포트와 1회 이전을 승인했다.
- 계정 전체 덮어쓰기는 두 기기의 마지막 쓰기가 서로의 키를 지운다 → 키 패치.
- 가져오기를 일반 패치 모드로 두면 완료 표식과 원자성을 서버가 보장하지 못한다 → 전용 연산.
- `GroupMember`를 재사용하지 않고 `{id,name}`을 새로 두는 안은 저장된 뷰 어휘와 이중이 된다 → 재사용.
- 공지를 `menuQuery`/`menuAction`으로만 두는 안은 메뉴 어휘 규칙에는 맞지만 관리 목록이 Home 메뉴의 권한(`notice:view`)과 한 선언에 묶인다. 사용자가 명시 포트를 승인했다.

## 소유 문서

[kernel.md §6.3·사용자 설정](../contract/kernel.md), [전송 형식](../integration/http-adapter-contract.md) §1, [체크리스트](../integration/real-server-checklist.md) §2, [패키지 경계 §4](../integration/platform-packages.md).
