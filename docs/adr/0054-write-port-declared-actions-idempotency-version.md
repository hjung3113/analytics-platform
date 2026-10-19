# 쓰기는 메뉴가 선언한 동작과 범용 요청 하나로 하고, Kernel이 멱등 키를 붙이며 동시성은 불투명 버전으로 확인한다

상태: **Decided (2026-10-20, 결정자: 코디네이터 — 사용자 "sdk 아직 완성 아니잖아, 이어서 하자"에 따른 SDK 다음 슬라이스 [포괄 목록](../integration/sdk-coverage-inventory.md) §5-3. 되돌릴 수 있음)**. 근거는 FeedbackOps의 쓰기 규약(FO ADR-0015 멱등성, ADR-0012 오류 계약, `docs/implementation/03-api-contracts.md` 동시성 토큰, ADR-0008 감사)과 이 저장소의 조회 계약([ADR-0019](0019-menu-query-endpoint-declaration.md))이다. 구현은 두 이슈로 나눈다: 계약 타입·mock 서버·적합성 묶음 [#501](https://github.com/hjung3113/analytics-platform/issues/501), 그다음 Kernel 훅·호스트 포트 [#502](https://github.com/hjung3113/analytics-platform/issues/502).

플랫폼에는 일반 쓰기 경로가 없다. 서버에 쓰는 것은 차트 주석(`saveAnnotation`·`deleteAnnotation`, 포트 전용 메서드)뿐이다. 다른 저장소의 모듈(EV 초안·Publish, FeedbackOps 설문 응답 파일럿)과 사용자 설정 저장(#421)이 이 경로를 기다린다([탑재 설계](../integration/platform-hosting-design.md) Q8·P1). FeedbackOps는 쓰기 규약을 이미 운영하지만 라우트마다 다르게 적용한다. 키를 요구하는 라우트, 받기만 하는 라우트, 키를 읽지 않는 라우트가 섞여 있고, 동시성 토큰도 세 가지다(VOC `updated_at`, ISO 시각 `If-Match`, 본문 `expected_revision`). 키를 다시 쓰는 시점도 호출 지점마다 손으로 정한다(`useIdempotencyKey`·`markConsumed`, 약 16곳). 플랫폼은 한 번 정해 모든 쓰기에 같은 규칙을 강제한다.

## 결정

- **동작 선언 `ActionSpec`(`defineAction`, `@ap/contracts`):** 메뉴(또는 모듈)가 서버 쓰기마다 선언한다. 담는 것:
  - 전송 키 `id`, 소유 메뉴 `menuId`
  - 허용 입력 키 `inputKeys`
  - 권한 `permission`: 메뉴 권한과 달라도 된다. 요청에는 싣지 않는다.
  - `requiresScope`
  - 동시성 방식 `concurrency: 'none' | 'version'`
  - 성공 뒤 다시 읽을 조회 `invalidates`: `EndpointSpec` 참조 목록이다.

  서버는 조회와 같이 요청이 아니라 자기 선언 사본으로 판정한다(ADR-0019).
- **포트 메서드 하나 `PlatformAdapter.menuAction(req)`:** 요청 `MenuAction`은 다음을 담는다. 동작 id, `context`, `input`, `idempotencyKey`, 버전 방식일 때의 `expectedVersion`. `context`에는 `requiresScope`일 때의 `scopeId`만 싣는다. 쓰기는 분석 Context(기간·조건·Selection 등)를 투영하지 않고, 입력에 필요한 값을 명시한다. 조회처럼 어댑터는 던지지 않는다.
- **결과는 쓰기 전용 봉투 `ActionResponse<T>`:**
  - 필드: `outcome`, `data`, `version`(쓴 뒤의 새 버전, 없으면 `null`), `fieldErrors: { path, code }[]`, `replayed`, `correlationId`, `message?`.
  - `outcome`은 `ok`·`invalid`·`conflict`·`forbidden`·`not_found`·`error`·`unknown` 중 하나다. `invalid`는 입력 검증 실패이고 필드 오류를 담는다. `conflict`는 버전이 맞지 않음이고 `version`에 현재 버전을 담는다. `unknown`은 응답을 받지 못해 반영됐는지 모른다는 뜻이다.
  - 조회 봉투 `ApiResponse`의 `Outcome`은 넓히지 않는다. 쓰기에는 assessments·trust가 없고, 조회 쪽 `outcome` 분기를 깨지 않는다.
- **멱등 키는 Kernel이 붙인다:**
  - 화면은 키를 만들지 않는다. 호출 하나(사용자 동작 하나)마다 Kernel이 UUIDv4를 새로 발급한다.
  - `error`·`unknown` 결과는 `retry()`를 함께 준다. 같은 키·입력·버전으로 다시 보내므로, "다른 입력에 같은 키"는 구조상 생기지 않는다.
  - 같은 화면 인스턴스에서 같은 동작을 다시 부르면, 앞 호출이 끝나기 전에는 같은 결과를 기다린다(single-flight). 두 번 눌러도 쓰기는 하나다.
  - 서버는 `(사용자, 키)`로 결과를 기록하고, 같은 입력이면 저장한 결과를 `replayed: true`로 돌려준다. 같은 키에 다른 입력이 오면 `error`다. 키가 없거나 형식이 틀리면 `invalid`이고 필드 경로는 `idempotencyKey`다. 보관 기간은 서버가 정하며, 기준은 FO와 같은 24시간 이상이다.
- **동시성은 불투명 버전 문자열 하나:**
  - `concurrency: 'version'`인 동작은 `expectedVersion` 없이 부르면 보내기 전에 `RangeError`다. Kernel의 프로그래머 오류 관례를 따른다.
  - 버전은 화면이 조회 데이터에서 받은 값이다. 서버가 `updated_at`이든 정수 revision이든 문자열로 내고, Kernel은 해석하지 않는다.
  - 맞지 않으면 `conflict`다. 자동 병합이나 자동 재시도는 하지 않는다(FO 03-api-contracts와 같다).
- **비행 중 취소는 없다:** Kernel은 쓰기 요청에 해제 신호를 넘기지 않는다. 보낸 쓰기는 되돌릴 수 없다(FO triage-transport의 같은 판단). 화면이 해제되거나 세션 세대가 바뀌면, 그 호출을 기다리는 쪽만 `AbortError`로 끝난다. 다시 읽기는 그래도 일어난다.
- **성공·충돌·모름 뒤 다시 읽기:** `ok`·`conflict`·`unknown`이면 Kernel이 `invalidates`에 든 조회를 다시 읽는다. 이전 결과는 그대로 두고 `refreshing`으로 표시하며, 결과 정체성은 바꾸지 않는다. `invalid`·`forbidden`·`not_found`·`error`는 서버 상태를 바꾸지 않았으므로 다시 읽지 않는다.
- **감사·행위자는 서버 몫:** 서버가 세션 사용자와 시각을 같은 트랜잭션에서 찍는다. 입력에 행위자·시각 필드가 오면 `invalid`다(FO ADR-0012 `unexpected_field`).
- **서버 판정 순서:** 요청 모양 → 키 형식 → 권한 → Scope → 재생 → 입력 값 → 버전 → 핸들러 → 응답. 권한·Scope를 재생보다 먼저 본다. 권한을 잃은 사용자는 같은 키로도 저장된 결과를 받지 못한다(FO ADR-0066과 같은 순서). 서버가 기록하는 것은 핸들러가 상태를 바꾼 `ok` 결과뿐이다. 그 밖의 결과는 아무것도 바꾸지 않았으므로, 같은 키로 다시 보내면 판정을 처음부터 다시 한다. 세부 순서의 원본은 [실서버 체크리스트](../integration/real-server-checklist.md)다. 계약 타입 이슈에서 그 문서에 절을 더한다.
- **화면 쪽 길:** 이 저장소의 메뉴는 Kernel 훅 `useMenuAction(spec)`(`{ ready, pending, run }`)을 쓴다. 모듈은 호스트 포트의 선택 기능 `write`(`host.act(spec, input, { expectedVersion })`)를 쓴다. `write`는 [ADR-0053](0053-host-module-contract-v1.md)의 기능 검사에 올라탄다. `contract` 정수는 1 그대로다. `requires: ['write']`를 모르는 호스트는 등록에서 이미 거부하므로(fail closed), 더하는 것만으로 1판 모듈이 깨지지 않는다.

## Considered Options

- **(a, 채택) 선언 동작 + 범용 요청 하나 + Kernel 소유 키·버전:** 조회 계약과 같은 모양이라 서버 사본·등록 검증·적합성 묶음을 그대로 넓힌다. 키와 재시도를 Kernel이 쥐어서, FO의 라우트별 차이와 호출 지점별 키 관리가 생기지 않는다.
- **(b) 포트에 쓰기 메서드를 동작마다 추가(지금 주석 방식):** 포트가 메뉴 수에 비례해 커진다. ADR-0019의 포트 판정 규칙 ③(메뉴 어휘 금지)에 어긋난다.
- **(c) 화면이 키를 만들게 한다(FO `useIdempotencyKey` 방식):** 유연하지만 "언제 새 키를 만드나"를 호출 지점마다 맞혀야 한다. FO에는 키 형식이 틀리는 fallback(`useTaskStatusTransition`)과 키를 읽지 않는 라우트가 실제로 있다.
- **(d) 조회 봉투 `ApiResponse`를 넓혀 쓰기에도 쓴다:** 타입 하나로 끝나지만 `outcome` 합집합이 넓어져 조회 화면 분기가 모두 영향을 받는다. 쓰기에 없는 assessments·trust가 필수 필드로 남는다.
- **(e) 동시성 방식을 FO처럼 여럿 둔다(`If-Match` 시각·본문 revision):** 서버 구현 차이를 클라이언트 계약에 새긴다. 불투명 문자열 하나면 어떤 서버 표현도 담는다.

## 결과

- 쓰기를 더하는 데 필요한 것이 동작 선언 + 서버 사본 핸들러로 줄어든다. 포트와 앱 주입 지점은 늘지 않는다.
- 주석 저장·삭제(`saveAnnotation`·`deleteAnnotation`)는 이번에 옮기지 않는다. 동작으로 바꿔도 화면 동작이 같고 diff만 생긴다. 다시 여는 조건: 주석에 버전 충돌이나 재시도가 필요해질 때, 또는 포트 메서드를 줄이는 정리 이슈가 생길 때([백로그](../../.planning/backlog.md)).
- 권한 부여·회수 쓰기(#98)는 이 결정과 별개다. 그 원천이 정해질 때까지 그 화면과 동작은 만들지 않는다.
- 모듈 동작의 `permission`은 지금 `EndpointSpec`처럼 플랫폼 `Permission`이다. 모듈 접두사 권한은 [#492](https://github.com/hjung3113/analytics-platform/issues/492)가 조회와 함께 연다.
- 실서버(FastAPI) 쪽 전송은 `POST` + `Idempotency-Key`·`If-Match` 헤더가 기본 후보다(체크리스트 절에 적음). 정하는 주체는 HTTP 어댑터(#149)다.
