# 검증 요청 큐: 등록하면 외부 작업자가 유휴 시간에 가져가 결과를 저장한다

상태: **Decided (2026-11-07, v0.30.0 구현 착수 — 소유자 답 반영, 서비스 토큰 발급 주체는 관리자만).** 결정자: 소유자(2026-11-07). 초안: 설계 레인, 근거 [#1420](https://github.com/hjung3113/analytics-platform/issues/1420), [#1330](https://github.com/hjung3113/analytics-platform/issues/1330), [#1346](https://github.com/hjung3113/analytics-platform/issues/1346) P0-3. 데이터 모델과 화면은 [log-lifecycle 설계](../design/features/log-lifecycle/README.md)가 소유하고 이 ADR은 큐 계약만 정한다.

## 배경

검증 요청을 목록에 등록해 두면 외부 작업자가 새벽·주말에 가져가 검증하고 결과를 올린다. 로그 수집은 당분간 외부 도구가 하므로 플랫폼은 **요청 등록·가져가기·결과 저장**만 맡는다. 사내 Validator·LLM은 개발 중이라 플랫폼이 그쪽을 호출하지 않고 작업자가 플랫폼에서 가져가는 방향(pull)이 인터페이스 실사 전에도 성립한다. 작업자는 API 토큰([ADR-0116](0116-platform-api-tokens-personal-and-service.md))으로 인증한다.

## 결정

1. **pull 모델**(소유자 2026-11-07). 작업자가 `claim`으로 요청 하나를 받고(lease), `heartbeat`로 연장하고, `result`로 제출한다. 플랫폼은 작업자를 부르지 않는다.
2. **상태 전이.** `queued →(claim) claimed →(result ok) succeeded`, `claimed →(fail) failed`, `claimed →(lease 만료) queued`(시도 번호 +1; `max_attempts` 소진이면 `expired`), `queued|claimed →(사람 취소) cancelled`. 종료 상태는 되돌리지 않고 다시 하려면 새 요청(새 시도 행)이다. 한 요청이 동시에 두 작업자의 lease를 갖지 못한다.
3. **claim 구현.** 한 트랜잭션에서 `select … for update skip locked`로 가장 높은 우선순위·오래된 `queued`(`not_before` 지남) 한 건을 잠그고 `claimed`·lease(기본 5분; 설정)·`execution_attempt` 행을 만든다. 내줄 것이 없으면 `204`. 이 선택이라 별도 큐 인프라가 없다.
4. **lease·heartbeat.** 하트비트는 lease를 현재 시각 + 기간으로 연장한다. lease가 만료된 요청은 claim 호출이나 주기 작업이 `queued`로 되돌린다. 만료 뒤 도착한 하트비트·결과는 이미 다른 시도가 있으면 `409 lease_lost`, 아무도 가져가지 않았으면 그 시도로 받는다(결과를 버리지 않는다).
5. **멱등 결과.** 결과 제출의 키는 `(요청, 시도 번호, result_digest)`다. 같은 digest 재전송은 같은 응답을 돌려주고 새 행을 만들지 않는다. 같은 시도에 다른 digest는 `409 conflict.stale_write`다.
6. **판정 축 분리.** 서버는 규칙별 결과에서 `verdict`(`pass`·`fail`·`incomplete`)를 **계산**한다. 작업자의 요약은 참고로만 저장한다. 필수 규칙의 `ERROR`·`NOT_CHECKED`·`SKIPPED`와 샘플 매니페스트 digest 불일치는 `incomplete`다. 결과 API는 AI 의견으로 규칙 결과를 바꾸는 경로를 두지 않으며, AI 의견은 **별도 테이블·별도 필드**로 붙는다(개정 2). AI 의견이 스크립트 `FAIL`을 덮지 못한다(#1346 P0-3).
7. **저장 범위 — 로그 발췌도 허용한다**(소유자 2026-11-07; 추천 «위치·해시만»과 다름). 결과는 규칙 ID·결과·필수 여부·기대/관측·근거 위치(`fileRef`, 줄, 파일 해시)·실행기 버전/해시에 더해 **짧은 로그 발췌**를 저장한다. 원본 파일 전체나 발췌 범위를 넘는 본문은 받지 않는다. 근거 위치는 Round 샘플 목록에 있는 `fileRef`여야 한다. 발췌는 민감도가 높아 다음을 계약으로 둔다.
   - **크기 상한(시작값, 측정 후 조정):** 근거 하나의 발췌 2,000자, 규칙 결과당 근거 20개, 시도당 발췌 합계 256KB. 넘으면 `validation.failed`로 거절하고 자르지 않는다.
   - **분리 저장·기본 숨김.** 발췌는 `rule_result_excerpt` 별도 테이블에 둔다. 규칙 결과 목록 응답에는 발췌 유무(`hasExcerpt`)만 있고, 본문은 상세에서 «발췌 보기»를 눌렀을 때만 내려간다.
   - **열람 권한 = 원본 Source ACL을 따른다.** Round `sample_set.sourceOwner`가 발췌의 출처다. 발췌 읽기는 capability `lifecycle.excerpt.read`를 해당 `sourceOwner` 범위로 가진 사용자만 받는다(워크스페이스 사용자 전체에 열지 않는다). 출처의 접근 권한이 철회되면 같은 호출부터 거절된다. 열람마다 감사 로그에 남기되 **감사 로그·알림·검색 인덱스·내보내기에는 발췌 본문을 쓰지 않는다**.
   - **보관·삭제.** Round가 닫힌 뒤 90일(워크스페이스 설정)이 지나면 발췌 본문을 삭제하고 위치·해시·규칙 결과는 남긴다. 관리자는 Round·시도 단위로 즉시 삭제할 수 있고(사유 필수, 감사), 삭제된 발췌는 `삭제됨`으로 보인다.
   - **입력 검사.** 서버는 제어 문자를 제거하고, 인증 토큰 형식(`ap_` 접두사 등)과 흔한 비밀키 패턴이 보이면 거절한다. 마스킹은 작업자 책임이며 플랫폼은 마지막 방어선일 뿐이다.
   - **신뢰하지 않는 입력.** 발췌는 화면에 텍스트로만 그리고(HTML 해석 금지) 후속 AI 입력으로 쓸 때는 신뢰하지 않는 입력으로 취급한다.
8. **유휴 시간은 서버가 판단하고, 요청별 「즉시」를 고를 수 있다**(소유자 2026-11-07; 추천 «시간대만»과 다름). 기본은 워크스페이스 설정의 실행 시간대(시작값 평일 22–06시, 주말 종일, IANA 시간대 기준 서버 시각)에서만 `claim`이 요청을 내주는 것이다. 요청 등록 때 `immediate: true`를 고르면 그 요청만 시간대 밖에서도 내준다(우선순위와는 별개 필드). 남용 방지:
   - 「즉시」는 요청자가 이미 가진 `lifecycle.round.manage` 안에서만 고를 수 있고 별도 권한을 만들지 않는다.
   - 사유 입력은 필수가 아니지만 요청 행에 «즉시» 표시와 요청자가 남고, 등록·취소가 감사 로그에 기록된다.
   - 사용자당 «즉시» 대기 요청은 동시에 5건까지(설정값), 넘으면 `queue.immediate_limit`로 거절한다.
   - 작업자는 `claim`이 내준 요청만 받는다. 「즉시」 요청도 작업자 토큰이 없으면 실행되지 않는다.
   - 관리자 목록에서 «즉시» 요청 비율을 필터·집계로 볼 수 있다. 시간대 변경은 관리자만 하고 감사한다.
   작업자 스케줄에만 맡기면 낮 시간 부하를 서버가 막을 수 없어 서버 판단을 기본으로 둔다.
9. **권한**(Gate 결정 세션 전용: 소유자 2026-11-07). 작업자 호출은 토큰 scope `validation.worker`만 받는다. 사람 세션에는 이 capability를 주지 않는다. 요청 등록·취소는 `lifecycle.round.manage`(사람 세션 또는 토큰). Gate 결정은 세션 전용이다([ADR-0116](0116-platform-api-tokens-personal-and-service.md) 결정 4).
10. **잠정 `v0`.** 요청·응답 스키마는 `@ap/contract-schemas`에 `v0`로 낸다. 참조 작업자(통합 테스트·dev 시드용 스크립트)는 «합성 fixture»이고 실제 사내 Validator 연동 증거가 아니다.

## 개정 1 (2026-11-08, [#1479](https://github.com/hjung3113/analytics-platform/issues/1479), 결정자: 소유자 2026-11-07 «요청 주체 확장 B»)

회귀 실행([log-test-datasets §4](../design/features/log-test-datasets/README.md), [ADR-0120](0120-regression-runs-reuse-validation-queue-dataset-identity-separate-from-round.md))은 Round가 없다. 아래만 바뀌고 결정 1–10의 나머지(상태 전이, lease, 멱등 결과, 권한)는 그대로다.

1. **요청 주체(subject)는 `round_id` XOR `suite_run_item_id`.** DB CHECK `execution_request_subject_check`가 정확히 하나를 강제한다. 기존 행은 `round_id`를 그대로 가진다(가산 변경). 회귀 항목 요청은 `suite_run_id`와 등록 시점에 고정한 샘플 목록(`subject_sample_set`·`subject_sample_manifest_digest`)을 같은 행에 가진다. 이유: claim 응답이 요청 행만으로 만들어져 log-lifecycle이 log-datasets를 import하지 않는다(의존 방향 유지). `suite_run_item_id`는 평범한 uuid이고 교차 스키마 FK는 없다. 이 열들은 생성 뒤 가드 트리거가 바꾸지 못하게 한다.
2. **작업자 REST는 그대로(4개 경로).** `claim` 응답의 `request`는 `roundId`와 `suiteRunItemId` 중 하나만 채우고 다른 쪽은 `null`이며, `sampleSet`·`sampleManifestDigest`는 그 주체의 것이다(`specPin`은 회귀 항목에서 `null`). `execution_attempt`·`rule_result`는 변경 없다. 결과의 근거 위치 `fileRef`는 그 주체의 샘플 목록에 있어야 하고, 서버 verdict 규칙(입력 manifest digest 불일치 = `incomplete`)도 같다.
3. **발췌 보관 시계(결정 7 확장, 소유자 확인 필요).** 회귀 항목에는 Round 닫힘 사건이 없다. 시계는 **그 suite 실행이 끝난 시각**이다: 실행의 모든 요청이 `queued`·`claimed`를 벗어나고 가장 늦은 `ended_at`이 보관 일수(워크스페이스 설정, 기본 90일)보다 오래됐을 때 본문을 지운다. 아직 열린 형제 요청이 있으면 지우지 않는다. 같은 정의기(`erase_excerpts`)가 두 주체를 처리한다. 대안은 «항목 요청 자신의 종료 시각»(구현이 더 단순, 형제 대기가 길면 더 일찍 지워짐)이다.
4. **Round 요청 화면·취소는 Round 요청만 본다.** `logLifecycle.requests`·`requestDetail`·`requestCancel`은 Round 조인을 하므로 회귀 항목 요청을 목록·열기·취소하지 않는다(suite 실행의 취소와 운영 목록은 backlog). 회귀 항목 요청은 우선순위 0(가장 낮음), 즉시 아님으로 등록한다.

## 개정 2 (2026-11-11, [#1778](https://github.com/hjung3113/analytics-platform/issues/1778), 결정자: 소유자 2026-11-11)

결정 6이 미뤄 둔 «나중에 별도 테이블·별도 필드»를 지금 만든다: 규칙 결과 단위의 **의견**(rule result opinion). 결정 1–10의 상태 전이·lease·멱등 결과·verdict 계산은 그대로다.

1. **의견은 규칙 결과에 붙는 추가 전용 행이다.** 테이블 `log_lifecycle.rule_result_opinion`(규칙 결과 FK, 작성 actor·토큰, 등급 키, 표식 키(선택), 메모, 근거 번호, 작성 시각). 갱신·삭제는 없고 정정은 새 행이다. 규칙 결과의 현재 의견은 가장 늦은 행이며 이력은 따로 읽는다. `verdict`·`rule_result`·Gate 결정·Knowledge 상태는 이 테이블을 읽지도 쓰지도 않는다(결정 6 유지: 의견이 스크립트 `FAIL`을 덮지 못한다). 이 불변식은 시험으로 고정한다.
2. **등급과 표식의 값은 사내가 선언하고 플랫폼은 값을 갖지 않는다.** 선언은 워크스페이스의 `queue_settings.opinion_scale`(`{ grades: [{ key, label }], marks: [{ key, label }] }`, 순서는 배열 순서)에 두고 관리자가 `logLifecycle.queueSettingsUpdate`로 바꾼다(`console:access`, 감사). 플랫폼이 내는 기본값은 빈 선언이고, 선언이 비면 의견 쓰기는 `opinion.scale_undeclared`로 거절된다. 키는 `^[a-z0-9_-]{1,32}$`, 라벨은 40자 이하 텍스트, 등급·표식 각 12개 이하. 쓰기는 선언된 키만 받고, 선언에서 빠진 키의 기존 행은 라벨 없이 키 텍스트로 보인다. 대안과 버리는 이유: (a) 작업자가 요청마다 값 목록을 같이 보냄 — 순서·라벨이 흔들리고 화면이 비교할 기준이 없다. (b) 배포 설정 파일·환경변수 — 바꾸려면 배포가 필요하고 감사가 없다. (c) 코드 상수 — 사내 어휘가 저장소에 들어온다.
3. **쓰기는 작업자 토큰 전용이다.** `POST /api/v1/validation-queue/requests/:id/attempts/:attemptNo/opinions`, 권한은 결정 9와 같은 `validation.worker`(서비스 토큰 전용 scope). 사람 세션과 scope 없는 토큰은 403이다. 사람이 직접 쓰는 경로는 이번에 만들지 않는다(다시 여는 조건은 backlog). 의견은 `succeeded` 시도의 규칙 결과에만 붙고, 그 시도를 가져간 작업자가 아니어도 된다(평가 작업자가 따로 있을 수 있다). Round 상태와 무관하다.
4. **메모는 신뢰하지 않는 입력이다.** 결정 7의 입력 검사(제어 문자 제거, 비밀·토큰 패턴 거절, 길이 상한)를 그대로 쓰고, 화면은 텍스트로만 그린다. 메모는 로그 발췌가 아니며(작업자 계약: 로그 본문을 붙이지 않는다) 목록 응답에는 `hasNote`만 있고 본문은 상세 읽기에서만 내려간다. 감사 로그·알림·검색 인덱스·내보내기에는 메모 본문을 쓰지 않는다. 플랫폼은 메모에 로그 본문이 섞였는지 판정할 수 없으므로 이를 작업자 책임으로 계약에 적는다.
5. **멱등.** 키는 `(규칙 결과, 작성 actor, opinion_digest)`다. 같은 digest 재전송은 새 행 없이 같은 응답, 다른 내용은 새 행이다.
6. **감사.** 쓰기는 `lifecycle.opinion.recorded`(주체 `execution_request`, 시도 번호와 건수만, 본문 없음)를 남긴다.
7. **잠정 `v0`.** 스키마는 `@ap/contract-schemas`의 `validationOpinion*`.

## 대안과 버리는 이유

- **플랫폼이 Validator를 호출(push):** 사내 API·CLI·인증이 아직 없어 어댑터를 가짜로 만들게 된다(#1330 §9 금지). pull은 인터페이스가 없어도 계약이 선다.
- **pg-boss 등 기존 잡 큐:** 이 저장소는 pg-boss를 쓰지만 큐 이름을 허용 목록으로 제한하고, 요청은 사람이 목록에서 보고 취소·우선순위를 바꾸는 **업무 객체**다. 도메인 테이블이 원본이어야 하고 외부 작업자가 lease를 직접 다뤄야 해서 테이블 + `skip locked`로 간다.
- **작업자 스케줄에만 맡김(유휴 판단):** 서버가 부하를 통제하지 못한다.
- **결과에 원본 전체 저장:** 용량·민감도·소유자 권한 재검증이 모두 플랫폼으로 넘어온다. 그래서 원본은 위치·해시만 두고, 소유자가 허용한 짧은 발췌만 상한·ACL·보관 기한 아래 둔다(결정 7).
- **발췌 금지(위치·해시만, 추천이었음):** 가장 안전하지만 소유자가 실패 지점 확인에 발췌가 필요하다고 판단했다(2026-11-07).
- **요청을 Round와 분리(#1420 본문 3번):** 같은 릴리스에 Round가 들어가면 샘플 위치·해시의 모양이 둘이 된다. `round_id`를 필수로 한다(소유자 2026-11-07). 개정 1이 회귀 실행을 위해 이를 «Round XOR suite 실행 항목»으로 바꾼다.

## 결과

- 소유 문서(구현 때): 발췌 보관 기한·「즉시」 한도는 워크스페이스 설정 문서도 소유한다. `docs/architecture/platform-api/api/log-lifecycle.md`(토큰 호출 REST 4개, 오류 코드 `queue.lease_lost` 등), `04-database-and-migrations.md`, workspace 설정 문서(실행 시간대).
- 구현 노드 d. 시험 필수: 동시 claim 두 개, lease 만료 복귀, 만료 뒤 늦은 결과, 같은 digest 재전송, 다른 digest 충돌, 유휴 시간 밖 claim, AI 의견 경로가 없음, 토큰으로 Gate 결정 거절.
- 열린 것: 발췌 상한 값과 90일 보관(시작값), 「즉시」 동시 5건, lease 기본값(5분), `max_attempts`(3), 하트비트 간격 권고, 시간대의 표준 시간대 표기(IANA).
