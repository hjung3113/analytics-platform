# 공개 저장소의 기존 도메인 어휘는 허용 목록으로 동결하고, 목록 밖 신규만 막는다

상태: **Decided (2026-11-11)** — 규칙. 목록과 검사의 구현은 [#1705](https://github.com/hjung3113/analytics-platform/issues/1705)·[#1706](https://github.com/hjung3113/analytics-platform/issues/1706)이 이어받는다.
- 결정자: 사용자(소유자) — 2026-11-11, [#1700](https://github.com/hjung3113/analytics-platform/issues/1700) 보강 §3의 소유자 결정 13행 전부에 «추천대로». 이 ADR은 그중 8번이다. 열린 결정 [#232](https://github.com/hjung3113/analytics-platform/issues/232)의 첫 질문에 해당하며, #232는 [ADR-0141](0141-in-house-assembly-in-separate-repository.md)의 발효 조건에서 닫는다.
- Scope: [#1705](https://github.com/hjung3113/analytics-platform/issues/1705), [#1706](https://github.com/hjung3113/analytics-platform/issues/1706).
- 구현 없음.

## 맥락

사내 조립을 저장소 밖으로 내는 목적은 사내 의미를 공개 저장소에 두지 않는 것이다([ADR-0141](0141-in-house-assembly-in-separate-repository.md)). 그러나 공개 저장소의 어휘가 이미 사내 도메인 어휘다: `apps/platform-web/src/menus.ts`의 공간·그룹 식별자, 조직 축 이름(`apps/platform-web/src/equipmentAxes.ts`), 도메인 Context 필드명(`url.ts`). «민감한 메타데이터를 공개에 넣지 않는다»는 기준은 지금 상태로는 통과 기준을 정할 수 없다([#1700](https://github.com/hjung3113/analytics-platform/issues/1700) 보강의 공개 범위 점검).

## 결정

1. **지금 있는 도메인 어휘를 허용 목록으로 동결한다.** 목록은 저장소에 두고, 이미 공개된 것은 그대로 둔다. 소급해서 이름을 바꾸거나 지우지 않는다.
2. **검사는 «목록 밖 신규 금지»다.** 공개 저장소의 새 변경이 허용 목록에 없는 도메인 어휘를 더하면 CI가 실패한다. 목록에 더하는 일은 사람이 검토하는 변경이다.
3. **합성 예시는 합성 이름만 쓴다.** 시작 키트·조립 시험 픽스처·공개 이슈의 예시는 실제 사내 식별자·컬럼명을 쓰지 않는다.
4. **어휘의 범위(무엇이 도메인 어휘인가)는 #1705가 정한다.** 공간·그룹·메뉴 id·축 이름·Context 필드명·권한 이름·엔드포인트 id를 후보로 한다.

## Considered Options

- **(A, 채택) 동결 + 신규 금지.** 지금 상태를 합의된 기준선으로 삼고 늘어나는 것만 막는다.
- **(B) 이미 있는 어휘를 모두 일반화·비식별화한다.** 이름 변경이 마이그레이션(URL, 저장된 뷰, 권한)을 부르고 비용이 크다.
- **(C) 검사 없이 리뷰에 맡긴다.** 지금 상태이며 신규가 조용히 늘어난다.

## Deferred (구현 안 함)

- 허용 목록 파일, 검사 스크립트, CI 연결. 이유: #1705·#1706이 소유한다. 다시 여는 조건: 두 이슈 착수.
- 기존 어휘의 일반화·이름 변경. 이유: 위 B. 다시 여는 조건: 사내 정책이 특정 이름의 공개를 막는다고 확인될 때.

## 결과

- 사내 조립 저장소가 생긴 뒤에도 공개 저장소의 어휘 표면이 더 넓어지지 않는다.
