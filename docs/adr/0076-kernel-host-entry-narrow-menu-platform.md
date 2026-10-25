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

## 보충 (#824, 2026-10-26)

- 문제: `usePlatform()`의 값은 렌더마다 새 객체였고 `recent`·`toasts`·팔레트·전환기 상태가 그 안에 있었다. 토스트 한 번, 팔레트 열기, URL 이동 한 번에 메뉴·차트·표의 소비자가 모두 다시 렌더됐다.
- 결정: 자주 바뀌는 여섯 값을 `HostPlatform`·`MenuPlatform`과 병합 값에서 빼고 관심사별 컨텍스트 셋으로 옮겼다. 서로 깨우지 않는다.
  - 토스트: `toasts` → `@ap/kernel/host` `useToastList()`
  - 오버레이: `paletteOpen`·`paletteSession`·`switcherOpen`·`switcherSession` → `@ap/kernel/host` `useOverlayState()`
  - 최근 방문: `recent` → root `useRecentVisits()`(메뉴 소비자는 홈 하나), 이벤트 처리용 `HostPlatform.readRecent()`(호출 때 최신 값, 안정된 함수)
  - 테스트: `@ap/kernel/testing`의 `ToastProbe`·`useToastsForTest()`(ADR-0040)
  - 옮기지 않는 것: `favorites`·`toggleFavorite`·`lastScope`(`PlatformPage`가 모든 페이지에서 읽고 사용자 동작으로만 드물게 바뀐다), 안정된 함수 `toast`·`dismissToast`·`holdToast`·`setPaletteOpen`·`setSwitcherOpen`.
- 값 안정화: `PlatformProvider`의 `pub`·`AppValue`는 `useMemo`, `MainScreenProvider`는 `memo`다. `useScreenState`의 `screen`·`queryPolicy`는 `useMemo`/동등 비교로 같은 내용이면 같은 참조를 돌려주고, 멤버(`queryDraft`·`queryHistory`·`metricInit`·가려진 `scopeView`·`missing`)도 만드는 쪽에서 안정화했다. `queryHistory`는 `useMemo`한 객체이고 메서드는 렌더의 현재 입력을 닫는다. 가린 행은 enabled·rows·권한이 같으면 같은 참조로 `useMemo`한다. 다른 세션·revision·Scope에서 붙든 옛 객체의 메서드는 `current()` 검사로 여전히 거부된다.
- 셸 배치: 바뀌는 값은 라우트 출력·칸·슬롯 본문을 자식으로 그리지 않는 잎에서만 구독한다(`Toasts`·`CommandPalette`·`SystemSwitcher`·`SidebarRecent`). `BoardScreen`은 구독하지 않고 이벤트 처리에서 `readRecent()`를 읽는다.
- 측정(코디네이터, 같은 하네스, jsdom): `PlatformProvider` 아래 메뉴 소비자 하나와 `PaneScreenProvider` 아래 소비자 하나의 재렌더 수.

  | 동작 | 메뉴 전 → 후 | 칸 전 → 후 |
  | --- | --- | --- |
  | 토스트 띄우기·닫기, 팔레트·전환기 열기·닫기 | 1 → 0 | 1 → 0 |
  | 메인 `navigate`(같은 공간), 메인 `setPage` | 2 → 1 | 2 → 1(테스트 상한 ≤1) |
  | `toggleFavorite`(옮기지 않음, 측정만) | 1 → 1 | 1 → 1 |

  검증 `platform.render-count.test.tsx`(kernel), `AppShell.render-count.test.tsx`·`board/BoardScreen.test.tsx`(shell).
- 한계: 메인 주소가 바뀌면 `resolveLink`가 `url`·`global`·`page`를 따라 바뀌고 `spaceResume`→`mainBound`가 따라 바뀌어 칸 소비자가 한 번 깬다. 이 이슈는 `resolveLink`·`spaceResume`·`mainBound`를 손대지 않는다(기대값 칸 ≤1). 남은 부분은 [백로그](../../.planning/backlog.md)에 있다.
- 기각한 대안:
  - (a) `useMemo`만 — 바뀌는 값이 deps에 들어가 메모가 무효다.
  - (b) `useSyncExternalStore` 셀렉터 store — React state 여섯 개라 컨텍스트로 충분하고 셀렉터 API를 새로 만들 근거가 없다.
  - (c) 한 묶음 `useShellState()` — 토스트가 팔레트·사이드바를 깨운다.
  - (d) `favorites`·`lastScope`까지 이동 — `PlatformPage`가 모든 페이지에서 읽어 이득이 없다.
  - (e) root `useToasts()` — 메뉴 프로덕션 소비자가 0이고 테스트 전용은 testing 진입점(ADR-0040)이다.
- 결과: `@ap/kernel` 깨지는 변경이다(저장소 밖 소비자가 없어 `@deprecated` 재export 없이 뺐다). 기록은 [변경 기록](../integration/sdk-git-tag-consumption.md#변경-기록).

