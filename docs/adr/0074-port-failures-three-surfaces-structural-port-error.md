# ADR-0074 — 포트 실패는 세 갈래를 유지하고, 규칙 원본·코드 목록 원본을 하나씩 두며, `PortError`는 구조로 판별한다

- Status: Decided (2026-10-23)
- Decider: 코디네이터 — 사용자가 [#670](https://github.com/hjung3113/analytics-platform/issues/670) D5에서 위임했다(2026-10-23).
- Scope: [#671](https://github.com/hjung3113/analytics-platform/issues/671) B8. 관련: [ADR-0054](0054-write-port-declared-actions-idempotency-version.md)(쓰기), [ADR-0059](0059-app-injected-equipment-axes-and-condition.md)(비 envelope 조회 포트).

## 맥락

envelope 읽기와 쓰기는 실패를 값으로, 비 envelope 조회(`listAxisOptions`·`searchEquipment`·`resolveSelection`)는 판정 실패를 throw로 돌려준다. 이 규칙이 문서 세 곳(06 §6.4, HTTP 계약 §2, 실서버 체크리스트 §2)에 흩어져 있다.

`PortError` 판별이 `instanceof`라서 외부 어댑터가 자기 `@ap/contracts` 사본으로 `PortError`를 던지면 Kernel(`selection-port-cache.ts`)이 판정 실패를 `{ code: null, retryable: true }`로 바꾼다. 금지·잘못된 요청이 재시도 루프가 된다. 판정 코드 목록의 원본도 `contracts`와 `http-adapter` 둘이다.

## 결정

- 세 갈래를 유지한다. 규칙 원본은 [실서버 체크리스트 §2](../integration/real-server-checklist.md#2-platformadapter-메서드별로-지킬-것) 하나이고 06 §6.4·HTTP 계약 §2는 한 문장과 링크만 둔다.
- 판정 코드 원본은 `@ap/contracts`의 `PORT_ERROR_CODES` 하나다. 판별은 `isPortError`(`name === 'PortError'` + 알려진 `code`)이며 Kernel·적합성 하네스는 `instanceof`를 쓰지 않는다.
- 전송 실패 코드는 `@ap/http-adapter` 내부(`TransportError`)에 둔다.
- `ContractError`도 `name`을 갖는다(검사 방식은 바꾸지 않는다).

## Considered Options

- **A (채택)** 위 결정.
- **B** 비 envelope 포트도 값으로 통일 — ADR-0059를 뒤집고 외부 어댑터가 깨진다.
- **C** `TransportFailureCode`를 contracts에 둔다 — 읽는 곳이 없다.

## 결과

추가만 있는 SDK 변경이다(외부 어댑터는 그대로). `PortError`의 이름과 범위("비 envelope 조회 포트의 판정 실패")는 유지한다. 다시 열 조건: Kernel이 전송 원인으로 분기해야 할 때(C).
