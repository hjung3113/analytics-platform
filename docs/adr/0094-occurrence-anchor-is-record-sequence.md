# Occurrence anchor는 파서의 RecordSequence(불투명 숫자 문자열)이고 시작 시각은 별도 표시 필드다

- Status: Decided (2026-10-27)
- Decider: 사용자(소유자, [#1007](https://github.com/hjung3113/analytics-platform/issues/1007), 2026-10-27). 되돌릴 수 있다.
- Scope: occurrence 식별키 `(equipmentId, entityType, anchor)`의 `anchor` 값. 관련: 06 §6.1([kernel.md](../contract/kernel.md#61-식별자와-url-소유-상태-decided)), 파서 `docs/11` §14·`docs/18`, 파서 이슈 hjung3113/context_recognized_parser#159·#157.

## 맥락

anchor는 지금 실행 시작 시각(`YYYY-MM-DDTHH:mm:ss`)이다. 같은 설비에서 같은 초에 시작한 실행 둘은 이 키로 구분되지 않고, 서버가 파서의 정확한 행으로 돌아갈 수도 없다.

## 대안

- A. RecordSequence를 불투명 숫자 문자열로 anchor에 싣는다(선택). 키가 시각을 담지 않고, 시작 시각은 별도 필드로 내려간다.
- B. `시각#순번` 합성값. 키가 여전히 시각을 담고, 파서가 저장하지 않는 동순위 구분자가 필요해 기각.
- C. 시각을 유지하고 서버가 해소한다. 같은 초의 실행을 구분할 수 없어 서버가 파서의 정확한 행으로 돌아가지 못해 기각.

## 결정

- `anchor`는 파서의 RecordSequence를 담은 불투명 10진 문자열이다. 구문 검사는 정규형 bigint 10진(`/^(0|[1-9][0-9]{0,18})$/`)뿐이다. 숫자로 해석·비교·정렬하지 않고 한 `equipmentId` 안에서 같음만 비교한다. 설비가 다르면 같은 값이 서로 다른 occurrence다.
- 시작 시각은 키의 일부가 아닌 별도 필드(`startedAt`, 벽시계 naive 문자열)로 표시·집계·정렬에만 쓴다.
- 안정 범위: 같은 입력을 같은 순서로 처음부터 처리하면 같은 값이다. 체인을 다시 만들거나 재처리하면 바뀔 수 있고, 그때 저장된 링크는 기존 `missing` 응답을 받는다(새 상태 없음). 시각 모양의 옛 anchor도 같다.
- 실행 표의 시간 열 정렬 id는 `anchor`에서 `startedAt`으로 바꾼다(`sort=startedAt:asc|desc`). 옛 `sort=anchor:*`는 등록되지 않은 정렬 값으로 거절하고 바꿔 주지 않는다.
- 범위 밖: `prc_step` 합성처럼 한 행을 고르지 않는 키, `entityType` 확장(`job`만), 실제 파서 연동.

## 결과와 한계

- mock은 설비·일 단위로 시작 시각 순서대로 순번을 부여한다(`일수 × 1000 + 순번`). 실서버 값의 모양은 파서가 정한다.
- 06 §6.1·용어집·사이클타임 와이어프레임을 같은 PR에서 고쳤다.
