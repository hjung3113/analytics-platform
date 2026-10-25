# ADR-0082 — 재집계 규칙은 `@ap/contracts`의 한 어휘다

- Status: Decided (2026-10-25)
- Decider: 코디네이터(사용자 위임), 되돌릴 수 있다.
- Scope: [#580](https://github.com/hjung3113/analytics-platform/issues/580) 노드 580a. 관련: [docs/01 §집계 가능성 계약](../01_architecture_and_data_contract.md#집계-가능성-계약).

## 맥락

"비율은 분자·분모를 따로 합산하고, P95를 평균하지 않는다"는 규칙의 코드 형태는 지표 메뉴 `menus/metrics/metrics/src/endpoints.ts`의 `MetricVersion.reaggregationRule`(`ratioOfSums`·`recomputeFromDistribution`·`sum`)뿐이다. 차트가 구간을 더해 합계를 만들 수 있는지는 플랫폼 계약으로 물을 수 없다.

## 대안

- **a. 새 집계 어휘**(`sum/count/rate/weightedAvg/min/max/nonAdditive`). 일반 집계 함수 이름이라 익숙하지만 카탈로그가 이미 쓰는 값과 둘이 되어 서버·내보내기·카탈로그·차트가 서로 번역해야 한다.
- **b. 카탈로그의 `reaggregationRule`에서 유도해 contracts에 둔다(선택).** 세 값을 그대로 두고 클라이언트가 합산하면 안 되는 값을 위한 `none`만 더한다. `canClientSum`은 `sum`일 때만 true다.
- **c. 메뉴 안에 그대로 둔다.** 변경이 없지만 차트와 내보내기가 같은 규칙을 다시 쓰게 된다.

## 결정

**b.** 서버·내보내기·카탈로그·차트가 하나의 어휘를 공유한다(계획 리뷰 P4). 카탈로그에는 `none` 지표가 없으므로 `reaggregationRule`은 `Exclude<Reaggregation, 'none'>`이고 필드 이름과 동작은 그대로다.

## 되돌리기

타입과 함수 하나뿐이라 지우고 메뉴의 리터럴 유니온으로 되돌리면 된다. 소비자가 생기기 전까지 비용이 없다.
