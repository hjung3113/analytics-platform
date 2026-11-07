# Event 순서 검색은 본문 해석이 아니라 Revision이 구조화해 적은 Event 관계 기록으로 한다

상태: **Decided (2026-11-08, 소유자 답 반영 — 추천대로).** 결정자: 소유자(2026-11-08). 초안: 설계 레인, 근거 [#1199](https://github.com/hjung3113/analytics-platform/issues/1199), 설계 [`log-knowledge-search`](../design/features/log-knowledge-search/README.md) §3.1·§4.1.

## 배경

#1199는 `Event A BEFORE B`와 `B BEFORE A`, 관찰(`observed`)과 기대(`expected`)를 구분하라고 한다. 지금 Item Revision의 관찰·기대는 자유 텍스트이고, `spec_event_relation`은 모델 명세가 **선언한** 순서일 뿐 Item이 «거꾸로 관찰했다»를 담지 못한다. 외부 AI 호출은 쓰지 않는다(사내 규칙).

## 결정

1. Item Revision이 **Event 관계 기록**(`kind` = `observed`·`expected`, `source_key`, `predicate`, `target_key`)을 구조화해 적는다. 추가 전용이고 안정 키(`moduleKey/eventKey`)로 명세를 가리킨다.
2. `predicate`는 닫힌 목록 `before`로 시작하고 `after`는 저장하지 않는다(입력 때 뒤집어 `before`로). 같은 사실이 한 행으로 모이고 반대 방향은 다른 행이다.
3. 방향 일치는 기록에서만 만든다. 본문 문장을 해석해 방향을 뽑지 않고, 기록이 없는 기존 Item은 방향 일치에 오르지 않는다(본문 검색 결과로만 나온다).
4. 질의의 방향은 사용자가 명시한 조건이나 닫힌 연산어일 때만 켜지고, 해석 결과를 화면에 항상 보인다.
5. 다른 Model/SW의 같은 Event 키는 동치로 합치지 않는다. 사람이 `confirmed` + `equivalent`로 확정한 개념 매핑으로만 후보를 넓힌다.

## 대안과 버리는 이유

- **본문(관찰·기대)에서 규칙·사전으로 방향 추출:** `B 전에 A가 아니다`, 수동·부정·한국어 어순에서 틀리고 틀렸을 때 «반대 방향 결함이 같은 결함으로» 나오는 것이 이 이슈가 막으려는 오류다. 기각.
- **외부/사내 LLM으로 방향 판정:** 외부 AI 호출 금지, 사내 모델 능력 측정 전. 기각(미구현 목록에 다시 여는 조건).
- **`spec_event_relation`만으로 방향 검색:** 명세의 선언(기대)만 있어 «관찰된 역순»을 표현하지 못한다. 기각.
- **방향 검색 포기, 텍스트 검색만:** 수용 기준(관계 방향 반례 테스트)을 못 채운다. 소유자가 고를 수 있는 대안이다.

## 결과

- Item 쓰기 입력에 `relations[]`가 추가되고 편집 서랍에 입력 칸이 생긴다(시안 컨펌 필요). 새 테이블은 추가 전용이라 ADR-0109의 Revision 불변과 맞는다.
- 기존 Item은 기록이 비어 있다. 채우는 일은 사람이 한다(소급 해석 없음).
- 시험: 정/역 질의 교차, `after` 표기 정규화, 관찰/기대 구분, 다른 SW 같은 키, `proposed` 매핑 미사용, 기록 없는 Item의 방향 비일치.
