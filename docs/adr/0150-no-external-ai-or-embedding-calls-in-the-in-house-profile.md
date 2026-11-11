# 사내 프로필에서는 외부 AI·임베딩 호출을 하지 않고, 시작 검사로 지킨다

상태: **Decided (2026-11-11)** — 규칙. 시작 검사의 구현은 [#1705](https://github.com/hjung3113/analytics-platform/issues/1705)가 이어받는다.
- 결정자: 사용자(소유자) — 2026-11-11, [#1700](https://github.com/hjung3113/analytics-platform/issues/1700) 보강 §3의 소유자 결정 13행 전부에 «추천대로». 이 ADR은 그중 10번이다.
- Scope: [#1705](https://github.com/hjung3113/analytics-platform/issues/1705), [#1711](https://github.com/hjung3113/analytics-platform/issues/1711), [#1714](https://github.com/hjung3113/analytics-platform/issues/1714). 관련: [ADR-0095](0095-dual-backend-fastify-core-fastapi-analytics.md) P4(외부 AI API 금지는 유지), [ADR-0125](0125-event-order-search-uses-structured-event-relation-records.md), [로그 지식 검색 설계](../design/features/log-knowledge-search/README.md) §9.
- 구현 없음.

## 맥락

«사내 규칙: 외부 AI 호출 없음, 임베딩 비활성»은 여러 문서에 흩어져 있지만 플랫폼 규칙으로 올라 있지 않다. 코어 서버 설정에는 외부 공급자로 켤 수 있는 코드가 있다: `EMBEDDING_PROVIDER`는 `voyage`·`fake`·`disabled`이고 기본은 `disabled`다(`apps/platform-api/src/config.ts`). 설정 하나로 사내 데이터가 외부로 나갈 수 있는 길이 열린다.

## 결정

1. **사내 프로필에서 플랫폼은 외부 AI·임베딩 공급자를 호출하지 않는다.** 외부 공급자란 요청 내용이 사내 밖의 서비스로 나가는 모든 호출이다.
2. **시작 검사로 지킨다.** 코어 서버는 사내 프로필로 기동할 때 외부 공급자를 가리키는 설정(현재는 `EMBEDDING_PROVIDER=voyage`)을 보면 기동을 거부한다. 프로필의 이름과 검사 목록은 #1705가 정한다. 새 공급자 설정이 생기면 같은 목록에 넣는다.
3. **공개 저장소의 기본값은 지금처럼 꺼짐이다.** 사내 프로필이 아닌 개발·시험 환경의 `fake` 공급자는 외부로 나가지 않으므로 허용한다.
4. **사내 모델은 이 규칙의 대상이 아니다.** 사내에서 도는 모델은 [ADR-0095](0095-dual-backend-fastify-core-fastapi-analytics.md) P4가 따로 다룬다.

## Considered Options

- **(A, 채택) 규칙 + 시작 검사.** 설정 실수로 외부 호출이 켜지는 것을 기동 때 막는다.
- **(B) 문서 규칙만 둔다.** 지금 상태다. 설정 하나로 규칙이 깨져도 알 수 없다.
- **(C) 외부 공급자 코드를 제거한다.** 개발 환경의 시험 편의가 줄고 공개 기능이 줄어든다.

## Deferred (구현 안 함)

- 사내 프로필의 정의와 시작 검사, 외부 공급자 목록. 이유: #1705(공개 CI 검사 / 사내 정책)가 소유한다. 다시 여는 조건: #1705 착수.
- 사내 조립 저장소에서 외부 클라우드 코딩 에이전트·원격 LLM을 쓰는 문제(소유자 결정 9: 사내 규정 확인 전에는 쓰지 않는 것이 기본값). 이 ADR은 플랫폼의 런타임 호출만 정한다. 기본값 문장은 시작 키트 README에 넣는다([#1790](https://github.com/hjung3113/analytics-platform/issues/1790)).

## 결과

- 로그 지식 검색 등 기존 «외부 AI 호출 없음» 서술은 이 ADR을 가리키는 링크로 읽을 수 있다. 문서를 일괄로 고치지는 않는다.
