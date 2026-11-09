# SDK 소비 지원은 스킬과 손으로 쓴 의도어 표로 시작하고, 생성형 Catalog는 만들지 않는다

상태: **Decided (2026-11-10)**. 구현은 [#1207](https://github.com/hjung3113/analytics-platform/issues/1207)이다.
- 결정자: 사용자(소유자) — 2026-11-10. "여러 개발자가 이 저장소에서 개발하는 전제로 **외부 배포는 이번에서 뺍니다.** 2026-11-09의 외부 사용 결정을 대체합니다."
- 결정자: 코디네이터(사용자 위임) — 리드, 2026-11-10, 독립 리뷰 반영. "첫 전달은 `ap-sdk-consumer` 스킬, 손으로 쓴 의도어 표 20행 안팎, 이름 존재 검사, 메뉴 작업 3건의 사용 전후 비교입니다. `inspect`와 `check`가 기존 `.api.txt`, lint, tsc와 겹치기 때문입니다." 이름, `*.api.txt` 재사용, Context 안내도 여기서 정했다. 되돌릴 수 있다.

여러 개발자와 에이전트가 이 저장소에서 메뉴를 만든다. 사내 메뉴는 [사내 적용 가이드 §5](../integration/in-house-rollout.md#5-사내-메뉴-개발-가이드)대로 이 저장소의 `menus/`에 더한다. 에이전트가 SDK에 있는 부품을 다시 만들거나 잘못된 경로로 import하지 않게 도와야 한다. 세부는 [SDK 소비자 스킬 설계](../design/devkit-sdk-consumer-skill.md)가 소유한다.

## 결정

- **첫 전달은 스킬 하나와 의도어 표다.** 표는 손으로 쓰고 흔한 필요만 담는다.
- **이름 검사는 기존 스냅샷을 쓴다.** `tooling/sdk/api/*.api.txt`를 읽고 새 생성기를 두지 않는다.
- **효과는 실제 비교로 판단한다.** 메뉴 작업 3건의 사용 전후를 [기록](../research/2026-11-10-sdk-consumer-skill-comparison.md)으로 남겼다. 기준선의 잘못된 import와 중복 구현이 이미 0건이어서 효과는 측정되지 않았고, 리드가 2026-11-10 생성형 Catalog를 계속 닫아 두기로 했다.
- **Context는 있는 것만 안내한다.** `useQueryContext`와 `projectContext`를 안내하고 `candidate` 행을 두지 않는다. #911과 #1210을 기다리지 않는다.

## Considered Options

- **(A, 채택) 스킬과 의도어 표.** 작고, 효과를 먼저 잴 수 있다. 표는 손으로 고쳐야 하고 이름만 검사된다.
- **(B) 생성형 Catalog와 `find`·`inspect`·`check` CLI.** 공개 API를 빠짐없이 다루지만 기존 `.api.txt`, lint, tsc와 겹치고 효과가 측정된 적이 없다. [설계안](../research/2026-11-10-devkit-generated-catalog-deferred-design.md)을 남겨 둔다.
- **(C) `sdk-v*` 릴리스에 함께 배포.** 실재하는 외부 소비자가 `sdk-v0.19.0`에 고정된 EV 하나다.

## Deferred (구현 안 함)

- 생성형 Catalog 전체, `inspect`, `check` 묶음. 이유: 기존 `.api.txt`, lint, tsc와 겹친다. 다시 여는 조건: 실제 메뉴 PR이나 리뷰에서 의도어 표와 이름 검사가 막지 못한 잘못된 SDK import나 중복 구현된 SDK 부품이 나올 때.
- `ap-devkit` tarball, 저장소 밖 `check`, 소비자 유형 판별. 이유: 지금 실재하는 외부 소비자는 `sdk-v0.19.0`에 고정된 EV 하나다. 다시 여는 조건: 저장소 밖 패키지(현재 EV 외의 소비자, 또는 EV가 최신 SDK로 올리는 시점)가 이 도구나 확장을 실제로 필요로 할 때.

## 결과

- 에이전트는 메뉴 작업에서 스킬과 표를 쓰고, 금지 import는 지금처럼 경계 lint가 막는다.
- SDK 릴리스 산출물은 그대로다. [ADR-0056](0056-sdk-release-github-release-tarballs.md)은 바뀌지 않는다.
