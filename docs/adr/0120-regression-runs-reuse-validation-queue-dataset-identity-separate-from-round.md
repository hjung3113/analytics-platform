# 회귀 실행은 검증 요청 큐를 요청 주체 확장으로 재사용하고, Dataset 식별자는 Round와 분리한다

상태: **Proposed (2026-11-07, 설계 PR 대기).** 결정자: 소유자(미결). 초안: 설계 레인, 근거 [#1345](https://github.com/hjung3113/analytics-platform/issues/1345), 설계 [`log-test-datasets`](../design/features/log-test-datasets/README.md). [ADR-0117](0117-validation-request-queue-claim-lease-heartbeat.md) 개정을 포함한다. 번호 0119는 같은 릴리스의 로그 탐색 설계 ADR이 예약했다(병합 순서에 따라 push 전 `docs/adr`를 다시 확인한다).

## 배경

테스트 Dataset·Expected Baseline은 여러 모델·Round·Validator 버전에서 되풀이해 쓰는 자산이고, 회귀 실행은 개발 과제나 Round 없이 그 Dataset을 고정 프로파일로 다시 돌린다. 현재 설계는 `execution_request.round_id`를 필수로 두었다([log-lifecycle §3](../design/features/log-lifecycle/README.md)). 실행·claim·lease·멱등 결과는 ADR-0117이 이미 정했다.

## 결정

1. **Dataset·DatasetRevision·ExpectedBaseline은 Round와 별도 ID와 이력을 가진다.** 같은 Dataset이 여러 Round에서 쓰여도 실행 이력은 Run 단위로 분리된다. 처음부터 Round에 종속시키지 않는다.
2. **회귀 실행은 기존 검증 요청 큐를 쓴다.** `execution_request`는 `round_id` 또는 `suite_run_item_id` 중 **하나만** 가진다(CHECK 제약). 작업자 REST 4개와 lease·heartbeat·멱등 결과·verdict 계산(ADR-0117 결정 1–6)은 그대로이고, `claim` 응답이 두 주체 중 하나의 샘플 목록을 준다. `execution_attempt`·`rule_result`는 바뀌지 않는다.
3. **Baseline은 실행 결과로 자동 갱신하지 않는다.** 결과는 새 draft로 **복사**만 할 수 있고 승인은 세션 전용 sensitive capability를 가진 사람이 한다. 승인 후 내용은 불변이며 변경은 새 revision(이전은 `superseded`).
4. **비교는 읽을 때 계산한다.** Baseline 기대와 `rule_result`를 복사하지 않고 분류(`unchanged`·`regressed`·`fixed`·`new`·`not_comparable`·`missing`)한다. 미지원·오류·원본 부재는 PASS로 세지 않는다. false-positive/negative는 사람의 triage 라벨이다.
5. 실제 엔진 인터페이스·Parser 기능 확인 전에는 합성 Dataset과 stub만 쓰고 운영 연동 완료로 표시하지 않는다.

## 대안과 버리는 이유

- **A. 회귀마다 «회귀 Round»를 만들어 기존 필수 `round_id`를 그대로 쓴다:** 개발 과제가 없는 Round를 만들어야 하고 Round 목록·모델 개발 단계 화면이 회귀 실행으로 오염된다. 기각.
- **C. 회귀 전용 큐를 따로 만든다:** claim/lease/멱등 로직을 중복 구현하고 작업자 두 갈래를 유지해야 한다. 기각.
- **Dataset을 Round의 `sample_set`의 부분 타입으로 둔다:** 재사용 수요(여러 Round·모델)와 Baseline 이력을 Round 수명에 묶는다. 기각.
- **Baseline을 마지막 성공 Run으로 자동 갱신(스냅샷 테스트 방식):** 회귀가 조용히 기준이 되어 Baseline의 목적이 사라진다. 기각.

## 결과

- 이 결정은 ADR-0117과 log-lifecycle 스키마(`execution_request`)의 변경을 포함한다. 소유자가 승인하면 ADR-0117에 개정 절을 추가하고 log-lifecycle 설계의 `round_id` 문구를 고친다. v0.30.0 노드 c·d(#1444·#1445) 병합 후 별도 노드로 적용한다.
- 시험: CHECK 제약(둘 다/둘 다 아님 거절), 두 주체의 claim 응답, 같은 결과 replay 멱등, 이중 실행(`idempotencyKey`), 타 Workspace 거절, 원본 부재, Baseline 자동 변경 불가.
