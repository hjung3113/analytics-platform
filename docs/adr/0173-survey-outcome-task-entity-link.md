# Outcome Survey가 측정할 Task를 Entity Link로 기록한다

상태: **Decided (2026-11-19)**.
- 결정자: 플랫폼 — 기존 Entity Linking 규칙을 #2540 자문 결정에 적용한다. 소유자는 되돌릴 수 있다.

Outcome Survey가 어떤 Task의 효과를 확인하는지 남길 선택적 관계가 필요하다. Entity Linking은 여러 도메인 객체 사이의 선택적 관계와 양쪽 읽기 권한을 소유하므로, Survey 테이블에 Task 외래 키를 추가하지 않는다. 상세 명령과 가시성 규칙은 [Entity Linking contract](../architecture/platform-api/06-entity-linking-contract.md)와 [Survey API](../architecture/platform-api/api/surveys.md)가 소유한다.

## 결정

- `(survey, task, measures_outcome_of)`를 새 등록 tuple로 둔다. Survey가 source이며 Survey마다 활성 링크는 최대 하나, Task는 여러 Survey와 연결할 수 있다.
- Survey 생성과 초안 수정 명령만 링크를 설정·교체·해제한다. Outcome Survey만 연결할 수 있고, Task와 Survey는 같은 Managed System이어야 한다. Survey를 연 뒤에는 링크가 고정된다.
- 링크는 `internal_only`다. 일반 endpoint 및 workspace 목록은 양쪽 읽기 권한에 따라 보여 주며, 일반 생성은 거부하고 일반 detach는 비공개 `404`를 반환한다.
- Survey 제공자는 안전한 Survey 요약만 제공한다. 응답 수, 결과, 후속 조치 상태를 Task 측에 노출하지 않는다.
- 이 링크는 수동으로 선택한 맥락이다. Task 실행, Follow-up 분류, Dashboard 복구 수치, Milestone 동작을 바꾸지 않는다.

## Considered Options

- **(A) `survey.outcome_task_id` 열**: Entity Links를 우회하고 Task 측 역방향 읽기 및 별도 가시성 규칙을 만든다.
- **(B, 채택) Entity Link**: 기존 선택적 관계, 권한, 이력 경계를 재사용하고 generic write 차단과 양방향 읽기를 유지한다.
- **(C) 보류**: #2540의 Outcome Survey가 측정할 대상을 기록하지 못한다.

## 결과

- `POST /surveys`와 초안 `PATCH /surveys/:id`가 Entity Links 서비스와 같은 트랜잭션에서 연결과 감사를 기록한다.
- 화면은 Survey 상세와 초안 편집에서 Task 연결을 읽고, Task 상세에는 허용된 Survey만 표시한다.
- Entity Link 계약, Survey API, 제품 요구사항, 데이터 계약, 용어집을 이 결정에 맞춘다.
