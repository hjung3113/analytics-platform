# ADR-0076 — 메뉴는 좁은 `MenuPlatform`을 보고, 셸·공통 컴포넌트·앱은 `@ap/kernel/host`를 쓴다

- Status: Decided (2026-10-23)
- Decider: 코디네이터 — 사용자가 2026-10-23 [#671](https://github.com/hjung3113/analytics-platform/issues/671) 진행을 승인하며 SDK 구조 판단을 맡겼다.
- Scope: [#671](https://github.com/hjung3113/analytics-platform/issues/671) B8. 관련: [ADR-0053](0053-host-module-contract-v1.md)(견본 메뉴는 `usePlatform()`을 계속 쓴다), [ADR-0067](0067-dockview-layout-engine-board-v2.md)(host-only 진입점의 선례).

## 맥락

`Platform`은 64개 필드로 메뉴 계약과 셸 전용 UI 상태가 섞여 root 스냅샷에 올라 있다. 셸 필드 하나를 바꿔도 모든 메뉴에 깨지는 변경이 된다. 셸 전용 Provider·hook도 root에서 나간다.

## 결정

- 런타임 값은 하나로 두고 `MenuPlatform`/`HostPlatform` 두 타입으로 나눈다. root의 `usePlatform()`은 `MenuPlatform`(메뉴가 읽는 필드만)을, `@ap/kernel/host`의 `useHostPlatform()`은 전체 `HostPlatform`을 돌려준다. `Platform`은 root에서 나가지 않는다.
- 셸 전용 심볼(`PaneScreenProvider`·`PaneQueryDraftProvider`·`useModuleHost`·`withPaneContext`·`paneHref`·`useQueryHistory`·`useAdapterRequest`·`BOARD_PATH`·`hasDotSegment` 등)은 `@ap/kernel/host`로 옮기고, lint(host-only subpath)로 메뉴·메뉴 mock·호스트 모듈의 import를 막는다.
- `adapter`·`PlatformProvider`는 root에 남긴다(콘솔·감사 포트와 my-activity 세션 세대가 `adapter`를 읽고, 메뉴 테스트가 Provider를 올린다).

## Considered Options

- **A (채택)** 위 결정.
- **B** 필드를 좁은 hook 여러 개로 나눈다 — 메뉴 20개 파일과 components까지 모두 바뀌고 소비 근거가 없다.
- **C** 문서·`@internal` 표시만 둔다 — 강제할 수 없다.

## 결과

`@ap/kernel` 깨지는 변경이다. 저장소 밖 소비자가 없어 `@deprecated` 재export 없이 root에서 뺐고, [변경 기록](../integration/sdk-git-tag-consumption.md#변경-기록)에 남겼다. ADR-0053의 "견본 메뉴는 `usePlatform()`을 계속 쓴다"는 유효하다. 다시 볼 조건: 메뉴가 host 필드를 필요로 하는 사례가 생기면 그 필드를 `MenuPlatform`으로 올리는 것으로 푼다(host 허용이 아니라). 첫 적용: `homeTodo`(#657) — 홈 ↔ FeedbackOps 경계. 기각: 홈을 my-activity로 옮기기, 메뉴에 host 허용.
