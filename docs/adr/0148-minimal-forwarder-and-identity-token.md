# 전달기는 menu-query 경로와 신원 토큰만 먼저 만든다 (Candidate)

상태: **Candidate (2026-11-12)** — 소유자 확인 대기. 전달기 범위(결정 1·2)는 [ADR-0095](0095-dual-backend-fastify-core-fastapi-analytics.md)가 이미 정한 입구·분담을 v0.36.0 몫으로 좁힌 고문 검토(2026-11-11, [#1729](https://github.com/hjung3113/analytics-platform/issues/1729) 범위 정리)의 추천이고, 토큰의 Scope claim과 회수 반영(결정 4·5)은 [#1087](https://github.com/hjung3113/analytics-platform/issues/1087) 질문 3·4의 소유자 답이 없다. 소유자가 답하면 Decided로 올린다.
- 결정자: 미정(소유자). 소유자가 이미 정한 것은 [ADR-0146](0146-core-server-loads-in-house-declarations-from-deployment-config.md)의 입구·상류 분리와 [ADR-0147](0147-scope-grants-come-from-an-injected-resolver.md)의 resolver·단위뿐이다.
- Scope: [#1729](https://github.com/hjung3113/analytics-platform/issues/1729), [#1087](https://github.com/hjung3113/analytics-platform/issues/1087). 관련: [ADR-0095](0095-dual-backend-fastify-core-fastapi-analytics.md) 결정 2·5·9와 「설계 남음」, [ADR-0146](0146-core-server-loads-in-house-declarations-from-deployment-config.md), [ADR-0147](0147-scope-grants-come-from-an-injected-resolver.md).
- 이미 소유자 결정인 것: 결정 3(#1700 결정 7). Candidate 범위는 결정 1·2·4·5다.
- Amends: [ADR-0095](0095-dual-backend-fastify-core-fastapi-analytics.md) — 분석 서버 위치에 한 줄 보충(결정 3, 근거 #1700 결정 7).
- 구현 없음.

## 맥락

[ADR-0095](0095-dual-backend-fastify-core-fastapi-analytics.md)는 Fastify가 유일한 입구이고 소유자 표(`server-routing.json`)를 보고 상류로 넘긴다고 정했지만(결정 2), 전달기와 신원 토큰은 구현되지 않았다(P1). 토큰의 확정된 claim은 `sub`(행위자), `wid`, `sv`(sessionVersion), `cid`(correlation id)이고, 권한 claim(`perms`·`scopes`) 모양과 회수 반영은 «설계 남음»이다. 사내 실데이터 시험의 입구도 이 전달기다([ADR-0146](0146-core-server-loads-in-house-declarations-from-deployment-config.md)).

## 결정

1. **v0.36.0이 정하는 범위는 menu-query 경로와 신원 토큰뿐이다.** 동작(menu-action), 엔티티·감사·export 경로, 큐는 이 ADR 범위 밖이다.
2. **전달기는 ADR-0095 결정 2·9를 그대로 지킨다.** 소유자 표로 상류를 고르고, 등록된 id인지만 판정하고, outcome을 만들거나 응답 본문을 고치지 않는다. 브라우저가 상류를 직접 부르지 않는다. 시간 예산은 ADR-0095의 값(어댑터 30초 > 상류 27초 > 상류 판정 25초)이다.
3. **분석 서버 위치 보충([#1700](https://github.com/hjung3113/analytics-platform/issues/1700) 결정 7, 소유자 «추천대로» 2026-11-11).** 골격·합성 핸들러·적합성 검사는 공개 저장소가 소유하고, 실제 핸들러는 사내 데이터 서버가 소유한다. ADR-0095의 «FastAPI 분석 서버»와 이 문서들의 «사내 데이터 서버»는 같은 서버다. 사내 데이터 서버가 FastAPI라는 구현 선택은 이 ADR이 정하지 않는다.
4. **(Candidate) 토큰은 요청마다 해석한 Scope 집합을 `scopes` claim으로 싣는다.** 확정된 claim 위에, 전달기가 요청마다 resolver([ADR-0147](0147-scope-grants-come-from-an-injected-resolver.md))로 해석한 허용 site·room 집합을 싣는다. 상류는 부여를 다시 계산하지 않고 담긴 집합만 확인한다. 이유: 상류가 Fastify에 되묻는 동기 호출은 ADR-0095 금지 8번이고, 토큰은 요청마다 발급되어 `exp`가 30초라 부여를 바꾸거나 회수하면 **다음 요청부터** 반영된다. `perms`(권한 목록)는 싣지 않는다. 권한 판정은 코어 서버 한 곳이 하고 상류는 사본을 계산하지 않는다.
5. **(Candidate) 토큰은 부여의 사본을 저장하지 않는다.** 상류는 토큰의 집합을 캐시하지 않는다. 회수 반영의 상한은 «이미 발급된 토큰의 남은 `exp`(최대 30초)»이고, 그동안 진행 중인 요청은 끝까지 간다.

## Considered Options

- **(A, 채택) 요청마다 해석한 집합을 짧은 토큰에 싣는다.** 상류가 단순하고 회수가 다음 요청부터 반영된다.
- **(B) 토큰에 `perms`·`scopes`를 모두 싣는다.** 권한 계산의 사본이 상류에 생긴다(ADR-0095 금지 2번).
- **(C) 상류가 Fastify의 부여 API를 호출한다.** 요청 처리 중 상류 → Fastify 동기 호출이다(금지 8번).

## Deferred (구현 안 함)

- menu-action·엔티티·감사·export 경로의 전달, mTLS, 서명 키 회전. 이유: v0.36.0 범위 밖이다. 다시 여는 조건: v0.37.0 이후 해당 경로의 첫 사내 요구.
- 이 ADR을 Decided로 올리는 일. 이유: 소유자의 [#1087](https://github.com/hjung3113/analytics-platform/issues/1087) 질문 3·4 답과 전달기 범위 확인이 없다. 다시 여는 조건: 소유자 답.

## 결과

- v0.37.0 구현 문장은 «전달기(menu-query) + 신원 토큰 최소 + 설정 선언 + 권한 표 + Scope resolver, 상류는 합성»이다([#1729](https://github.com/hjung3113/analytics-platform/issues/1729)).
- 키트(#1790)의 실어댑터 조립이 이 서버에서 사내 역할 엔드포인트를 조회하는 것이 v0.37.0 수용 기준이다.
