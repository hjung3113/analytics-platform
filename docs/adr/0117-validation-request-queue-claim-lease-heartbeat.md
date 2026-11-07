# 검증 요청 큐: 등록하면 외부 작업자가 유휴 시간에 가져가 결과를 저장한다

상태: **Proposed (2026-11-07, 초안 — 소유자 답 전).** 결정자: 소유자(대기). 초안: 설계 레인, 근거 [#1420](https://github.com/hjung3113/analytics-platform/issues/1420), [#1330](https://github.com/hjung3113/analytics-platform/issues/1330), [#1346](https://github.com/hjung3113/analytics-platform/issues/1346) P0-3. 데이터 모델과 화면은 [log-lifecycle 설계](../design/features/log-lifecycle/README.md)가 소유하고 이 ADR은 큐 계약만 정한다.

## 배경

검증 요청을 목록에 등록해 두면 외부 작업자가 새벽·주말에 가져가 검증하고 결과를 올린다. 로그 수집은 당분간 외부 도구가 하므로 플랫폼은 **요청 등록·가져가기·결과 저장**만 맡는다. 사내 Validator·LLM은 개발 중이라 플랫폼이 그쪽을 호출하지 않고 작업자가 플랫폼에서 가져가는 방향(pull)이 인터페이스 실사 전에도 성립한다. 작업자는 API 토큰([ADR-0116](0116-platform-api-tokens-personal-and-service.md))으로 인증한다.

## 결정 (추천)

1. **pull 모델.** 작업자가 `claim`으로 요청 하나를 받고(lease), `heartbeat`로 연장하고, `result`로 제출한다. 플랫폼은 작업자를 부르지 않는다.
2. **상태 전이.** `queued →(claim) claimed →(result ok) succeeded`, `claimed →(fail) failed`, `claimed →(lease 만료) queued`(시도 번호 +1; `max_attempts` 소진이면 `expired`), `queued|claimed →(사람 취소) cancelled`. 종료 상태는 되돌리지 않고 다시 하려면 새 요청(새 시도 행)이다. 한 요청이 동시에 두 작업자의 lease를 갖지 못한다.
3. **claim 구현.** 한 트랜잭션에서 `select … for update skip locked`로 가장 높은 우선순위·오래된 `queued`(`not_before` 지남) 한 건을 잠그고 `claimed`·lease(기본 5분; 설정)·`execution_attempt` 행을 만든다. 내줄 것이 없으면 `204`. 이 선택이라 별도 큐 인프라가 없다.
4. **lease·heartbeat.** 하트비트는 lease를 현재 시각 + 기간으로 연장한다. lease가 만료된 요청은 claim 호출이나 주기 작업이 `queued`로 되돌린다. 만료 뒤 도착한 하트비트·결과는 이미 다른 시도가 있으면 `409 lease_lost`, 아무도 가져가지 않았으면 그 시도로 받는다(결과를 버리지 않는다).
5. **멱등 결과.** 결과 제출의 키는 `(요청, 시도 번호, result_digest)`다. 같은 digest 재전송은 같은 응답을 돌려주고 새 행을 만들지 않는다. 같은 시도에 다른 digest는 `409 conflict.stale_write`다.
6. **판정 축 분리.** 서버는 규칙별 결과에서 `verdict`(`pass`·`fail`·`incomplete`)를 **계산**한다. 작업자의 요약은 참고로만 저장한다. 필수 규칙의 `ERROR`·`NOT_CHECKED`·`SKIPPED`와 샘플 매니페스트 digest 불일치는 `incomplete`다. 결과 API는 AI 의견으로 규칙 결과를 바꾸는 경로를 두지 않으며, AI 의견은 나중에 **별도 테이블·별도 필드**로 붙는다. AI 의견이 스크립트 `FAIL`을 덮지 못한다(#1346 P0-3).
7. **저장 범위.** 결과는 규칙 ID·결과·필수 여부·짧은 기대/관측·근거 위치(`fileRef`, 줄, 파일 해시)·실행기 버전/해시만 저장한다. 원본 로그·본문은 받지 않고 길이·형식 검사로 거절한다. 근거 위치는 Round 샘플 목록에 있는 `fileRef`여야 한다.
8. **유휴 시간은 서버가 판단한다.** 워크스페이스 설정의 실행 시간대(예: 평일 22–06시, 주말 종일, 시간대 기준 서버 시각)에서만 `claim`이 요청을 내준다. 밖에서는 `204`다. 작업자 스케줄에만 맡기면 낮 시간 부하를 서버가 막을 수 없다. 관리자만 시간대를 바꾸고(감사), 사람이 등록한 `긴급` 요청도 시간대를 우회하지 않는다 — 우회가 필요하면 시간대를 바꾼다.
9. **권한.** 작업자 호출은 토큰 scope `validation.worker`만 받는다. 사람 세션에는 이 capability를 주지 않는다. 요청 등록·취소는 `lifecycle.round.manage`(사람 세션 또는 토큰). Gate 결정은 세션 전용이다([ADR-0116](0116-platform-api-tokens-personal-and-service.md) 결정 4).
10. **잠정 `v0`.** 요청·응답 스키마는 `@ap/contract-schemas`에 `v0`로 낸다. 참조 작업자(통합 테스트·dev 시드용 스크립트)는 «합성 fixture»이고 실제 사내 Validator 연동 증거가 아니다.

## 대안과 버리는 이유

- **플랫폼이 Validator를 호출(push):** 사내 API·CLI·인증이 아직 없어 어댑터를 가짜로 만들게 된다(#1330 §9 금지). pull은 인터페이스가 없어도 계약이 선다.
- **pg-boss 등 기존 잡 큐:** 이 저장소는 pg-boss를 쓰지만 큐 이름을 허용 목록으로 제한하고, 요청은 사람이 목록에서 보고 취소·우선순위를 바꾸는 **업무 객체**다. 도메인 테이블이 원본이어야 하고 외부 작업자가 lease를 직접 다뤄야 해서 테이블 + `skip locked`로 간다.
- **작업자 스케줄에만 맡김(유휴 판단):** 서버가 부하를 통제하지 못한다.
- **결과에 원본 저장:** 용량·민감도·소유자 권한 재검증이 모두 플랫폼으로 넘어온다. 위치·해시만 두면 소유자 권한이 원본에서 유지된다. 비용: 원본이 사라지면 `unresolved`.
- **요청을 Round와 분리(#1420 본문 3번):** 같은 릴리스에 Round가 들어가면 샘플 위치·해시의 모양이 둘이 된다. 이 초안은 `round_id` 필수로 이탈한다 — 소유자 확인 항목.

## 결과

- 소유 문서(구현 때): `docs/architecture/platform-api/api/log-lifecycle.md`(토큰 호출 REST 4개, 오류 코드 `queue.lease_lost` 등), `04-database-and-migrations.md`, workspace 설정 문서(실행 시간대).
- 구현 노드 d. 시험 필수: 동시 claim 두 개, lease 만료 복귀, 만료 뒤 늦은 결과, 같은 digest 재전송, 다른 digest 충돌, 유휴 시간 밖 claim, AI 의견 경로가 없음, 토큰으로 Gate 결정 거절.
- 열린 것: lease 기본값(5분), `max_attempts`(3), 하트비트 간격 권고, 시간대의 표준 시간대 표기(IANA).
