# 목적지 감사 이력은 서버 상한과 keyset 커서로 쪽을 나누고 목록 끝 버튼으로 이어 붙인다

- Status: Decided (2026-10-26)
- Decider: 코디네이터(사용자 지시: "시안은 opus xhigh 리뷰받고 결정"), 되돌릴 수 있다.
- Scope: [#826](https://github.com/hjung3113/analytics-platform/issues/826). 관련: [docs/06 §13·§26](../06_platform_ui_contract.md), [ADR-0048](0048-menu-audit-seeds-join-shared-mock-audit-store.md), [ADR-0074](0074-port-failures-three-surfaces-structural-port-error.md).

## 맥락

`entityAudit(ref)`(설비 상세 감사 탭, 지표 상세 변경 이력)은 상한도 커서도 없어 목적지의 모든 변경을 한 번에 받고 `AuditTimeline`이 전부 복사·정렬해 그린다. 오래 쓴 대상은 변경이 수백~수천 건이 될 수 있다.

## 대안

실제 앱 시안 A/B/C를 캡처해 review-ux(Opus xhigh)가 판정했다.

- **A. 목록 끝 버튼, 커서만(선택).** 첫 쪽만 읽고 `이전 변경 이력 더 보기`로 이어 붙인다. 총건수를 모른다.
- **B. 총건수·`N/M건` 표시.** 진행 정도를 보이지만 count 쿼리가 더 들고, 쪽을 넘기는 사이 새 변경이 생기면 건수와 목록이 어긋난다. 이득이 비용보다 작다.
- **C. 상한을 넘으면 전역 감사 화면(`auditTrail`)으로 넘기기.** `auditTrail`은 `console:access`가 필요해, 그 권한이 없는 엔지니어는 설비 감사 탭에서 51번째부터 볼 수 없다. 권한 모델이 달라 blocker.

## 결정

A.

**포트(선택 필드, 깨지지 않음).**

- `entityAudit(req: EntityAuditRequest, signal?)`, `EntityAuditRequest = EntityRef & { cursor?: string }`. 응답 data는 `{ events; nextCursor?: string | null }`.
- 쪽 크기는 서버가 정하며 상한은 `ENTITY_AUDIT_PAGE_MAX = 50`(`@ap/contracts`). 클라이언트 `limit`은 없다(소비자가 없다).
- 순서는 `at` 내림차순(instant), 같으면 `id` 오름차순. 커서는 마지막 행의 `(at, id)` keyset이며 불투명 문자열이다.
- 마지막 쪽은 `nextCursor: null`(서버는 한 건을 더 읽어 판단한다). 빈 쪽에 non-null 커서를 주지 않는다. `nextCursor` 키가 없는 응답(옛 서버)은 끝으로 읽는다.
- 틀린 형식이거나 다른 대상에 묶인 커서는 outcome `error`(`Invalid cursor`). 첫 쪽이 0건이면 `empty`, 뒤쪽이 0건이면 `ok` + `events: []` + `nextCursor: null`.
- 권한·Scope·room 게이트 순서는 그대로이고 커서는 게이트를 모두 지난 뒤에만 해석한다(커서가 게이트를 우회하거나 다른 대상 행을 섞지 않는다).

**적합성 자동 skip.** server-conformance는 커서 검사 9건(한 쪽 ≤ 50, 끝까지 따라가면 중복 없이 정렬 순서로 모두·마지막 `null`, 틀린 커서 `error`, 틀린 커서를 붙여도 다른 site·권한 없음은 `forbidden`, 그리고 서버가 실제로 발급한 커서를 다른 대상·다른 site·권한 없는 계정·권한 없는 room에 보내면 커서 없는 요청과 같이 거절되고 표본의 행이 하나도 나오지 않음)을 더한다. site 검사는 site 없는 목적지(`scopeId: null`) 표본이면 건너뛴다. 발급 커서가 필요한 4건은 표본이 한 쪽에 들어가 커서가 없으면 이유를 단 skipped다. 첫 쪽 응답에 `nextCursor` 키가 없는 서버는 이 검사들을 이유(`server does not page entityAudit`)를 단 skipped로 바꾸고 `cursor`를 보내지 않는다 — 통과로 세지 않는다. FeedbackOps 백엔드의 `entityAudit`은 아직 쪽을 나누지 않으므로 코드를 바꾸지 않고도 CI가 깨지지 않으며, 구현은 [#857](https://github.com/hjung3113/analytics-platform/issues/857)이다.

**Kernel과 화면.** `useEntityAudit(ref, enabled?)`(`@ap/kernel`)가 첫 쪽(`query`, `QueryView`용)과 `timeline = { events, more }`를 준다. 커서를 이어 붙이는 일(누적, id 중복 제거, 같은 커서 재시도, 정체성 변경 시 abort, 끝 판정, 전진하지 않는 커서는 `error`)은 도메인을 모르는 내부 모듈 `cursor-pages.ts`가 맡는다. `AuditTimeline({ events, more? })`는 `more`가 없으면 지금과 같은 마크업이고, 있으면 목록 끝에 버튼·끝 캡션·실패 재시도·권한 안내와 상태 알림을 그린다(문구와 상태는 06 §13).

**포커스 예외(06 §26).** 같은 화면 안 상태 변경은 포커스를 옮기지 않는다는 규칙에 예외 하나를 더한다 — `이전 변경 이력 더 보기`가 성공하면 붙은 첫 항목(없으면 끝 캡션)으로 옮기되, 포커스가 아직 그 버튼에 있을 때만이다. 키보드 사용자가 새 항목을 처음부터 이어 읽게 하고, 그 사이 다른 곳으로 옮긴 사용자의 포커스는 뺏지 않는다.

**설비 감사 탭의 정체성은 session이다.** `useEntityAudit`의 첫 쪽은 `useEntityQuery`와 같은 session 정체성(revision·user·ref, ref가 `scopeId`를 싣는다)이다. 설비 감사 탭이 context 정체성(전역 Context가 바뀌면 다시 읽음)에서 session으로 바뀌므로, 기간·조건을 바꿔도 다시 읽지 않는다 — 감사 기록은 전역 기간으로 거르지 않기 때문이다. Scope·사용자·revision이 바뀌거나 같은 정체성을 다시 조회하면 붙인 쪽을 버리고 첫 쪽부터 읽는다. 첫 쪽은 응답 객체가 아니라 조회가 시작될 때마다 오르는 읽기 세대로 구분한다(어댑터가 같은 응답 객체를 돌려줘도 붙인 쪽을 버리고, 다시 읽는 동안에는 붙인 쪽을 보이지 않는다). 불러온 쪽 수는 URL에 두지 않는다.

## 되돌리기

필드는 모두 선택이다. `more`를 넘기지 않으면 `AuditTimeline`은 이전 모양이고, 쪽을 나누지 않는 서버는 계속 동작한다. 서버가 쪽을 나누도록 바꾸는 일은 서버별 후속(#857)이다.

## 범위 밖

FeedbackOps 백엔드 쪽 나누기(#857), 관리자용 "변경 감사에서 보기" 링크(공통 부품은 메뉴를 모른다), mock 시드 확대, 전역 `auditTrail` 페이지, 조회 캐시(#825).
