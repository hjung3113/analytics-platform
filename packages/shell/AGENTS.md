# @ap/shell

App Shell(06 §8–9, 화면 설계 [07](../../docs/07_app_shell_wireframe.md)). 메뉴 목록은 주입된 Registry에서, 선택지·세션은 어댑터에서 읽는다.

## 파일

- `AppShell.tsx` — 레일(52px)·밝은 사이드바(240/56px)·스크롤 main·전체 높이 오른쪽 상세 aside 배치(06 §13, ADR-0013). `[` 단축키와 `platform:sidebar-collapsed` 저장 키·1440px 미만 기본 접힘 유지. 상단 바 없음.
- `AppRail.tsx` — 맨 위 `SystemSwitcher`, 구분선, 현재 시스템의 섹션 버튼(`systemSections.ts`의 `useSystemSections` — `currentSpace`가 사이드바 공간과 같을 때만, 그룹당 하나, 현재 메뉴의 그룹에 `aria-current="true"`, 현재 섹션 클릭은 아무 일 없음, 다른 섹션은 그 그룹 첫 보이는 메뉴로 Kernel 링크 이동), 명령 팔레트, `feedbackOps.overall`이 있고 사용자가 그 `permission`을 가질 때만 새 탭 링크, 레일 아래 `slots.topBarTools`·도움말·언어·사용자 메뉴. 공간 마지막 화면 복원 규칙은 여기 복사하지 않는다 — [06 §9.1](../../docs/06_platform_ui_contract.md#91-워크스페이스-decided-2026-09-26), 검증은 Kernel `src/platform.space-resume.test.tsx`.
- `SystemSwitcher.tsx` — 레일 맨 위 업무 시스템 전환기(15 §3.2, ADR-0042). `@ap/ui` Popover(modal, focus trap), 카드 = `accessibleSpaces` ∧ `spaceEntry` 있는 것(보조 문구 `이어서`/`시작`은 `entry.menuId`·`resumed`), `slots.plannedSpaces` 표시 전용 행, `/` 메뉴를 열 수 있을 때만 `플랫폼 홈`. 이동은 팝오버를 먼저 닫고 `onCloseAutoFocus`(트랩 해제 뒤)에서 실행해 Kernel 도착 포커스(ADR-0032)가 새 제목에 남는다. 현재 카드 재선택·Esc·바깥 클릭은 전환기 버튼으로 복귀. 팝오버가 열린 동안의 도착(뒤로/앞으로 등)은 팔레트와 같은 Kernel 포커스 게이트(`switcherSession`)로 제목 포커스를 지키고, 대기 중인 이동은 언마운트·Provider 세션 교체 때 버린다. 테스트: `SystemSwitcher.test.tsx`(실제 Provider·PlatformPage), `SystemSwitcher.entry.test.tsx`(`spaceEntry` 래핑).
- `AppSidebar.tsx` — 전역 화면과 접근 가능한 공간이 0개일 때는 그리지 않는다. 공간 머리(50px: 공간 이름 + 현재 섹션 이름, 같으면 한 줄)·접기, Scope 선택기, 현재 섹션(그룹)의 권한 기반 메뉴만(그룹 제목은 섹션 이름과 같아 생략, 미등록 경로·공간 진입 거부 fallback은 모든 그룹을 그대로), 즐겨찾기·최근(펼친 모드만), 그 아래 스크롤 밖 FeedbackOps 블록(그려지는 `sidebarSpace`가 `accessibleSpaces`에 있고 라우트가 그 공간 메뉴일 때만 `entriesFor(sidebarSpace.id)`. 비어 있거나 진입 거부·미등록 경로면 그리지 않음. 접힘이면 아이콘만. `href: null` 항목은 같은 행 모양의 비활성 `<span role="link" aria-disabled="true">`로 그리고 이유를 접근 이름·툴팁에 붙인다). 그룹 표시는 Registry `GroupDef`(`hideLabelWhenSingle`)만 따른다 — 그룹·메뉴 id를 코드에 쓰지 않는다(lint `ap/no-shell-id-literal-comparison`, `no-group-id-literals.test.ts`). 접근성 이름·landmark 구조는 `AppShell.test.tsx`가 고정한다. 메뉴 검색은 팔레트만.
- `ScopeSelector.tsx` — Scope 선택(`session.scopes`)과 검증 상태·room 부여 수, `error`에서 현재 Scope를 다시 고르면 `retryScope()`(다른 상태에서는 Kernel 동작 없음, #183), `error`일 때 'Scope 다시 확인'(목록에 없는 Scope도). 접힌 사이드바에서도 이름과 상태·room 설명(aria-describedby) 및 Tooltip을 유지. status만 polite live region으로 알린다.
- `CommandPalette.tsx` — 메뉴 검색 이동(행 보조줄 `<시스템> › <섹션> › <메뉴>`, 연속 같은 이름은 한 번). 닫으면 연 요소로 복귀(#296), 다른 pathname 메뉴를 고르면 Kernel의 `page` 요청을 Dialog close autofocus 뒤에 넘겨 새 화면 제목에 포커스(#339, 06 §26). 세대 번호 대신 `paletteSession`의 `claim(owner)`·`release(owner)`·`isCurrent()`만 사용한다. 언마운트 해제는 FocusScope passive cleanup 뒤 `setTimeout(0)`으로 미룬다.
- `GlobalContextBar.tsx` — 기간·room_name·Condition·Selection·전달 Context 표시/편집. 선택지는 `useAdapterRequest`로 조회하고 실패 시 오류와 재시도를 제공한다. Selection 평가(`evaluateSelection`)는 바 수준의 한 조회 소유자가 실제·측정·인라인/넘침 편집기에 결과를 공유한다.
- `ContextBarLayout.tsx` — 06 §7·ADR-0015의 한 줄 우선순위 넘침. 바 자체·intrinsic probe의 ResizeObserver, 요청 없는 inert 측정 레이어(`MeasuringContext`), 고정 키 우선순위와 인라인/넘침 위의 편집 초안·포커스 복귀를 소유한다.
- `RouteOutlet.tsx` — 현재 경로의 메뉴 화면 또는 미등록·계약 오류·권한 없음·미구현 상태. 모듈 메뉴(`moduleScreen`)는 `ModuleScreen`으로 그리고 키가 `메뉴 id+params|revision`이라 세대가 바뀌면 다시 마운트한다. 모듈 메뉴는 구현된 것으로 보므로 사이드바·팔레트에 '예정' 표시가 없다.
- `ModuleScreen.tsx` — 모듈 화면을 `{ params, host }`로 그린다(ADR-0053). 바깥 소유자가 `status`(`ready`/`auth_required`/`identity_mismatch`/`unavailable`)를 들고, 안쪽 준비 인스턴스가 `useModuleHost`를 호출한다. 준비가 아닌 상태는 인스턴스를 내리고(= 해제) `StateMessage`와 '다시 시도'를 그리며 다시 시도는 새 인스턴스를 마운트한다. 해제된 인스턴스의 `status`·`detail`·`focusTarget` 호출은 무시한다. `detail`(`detailSlot` 선언 시)은 노드를 `useDetailPanelContent`에 올리고(라벨은 `aria-label` 영역으로 감싼다) 내림·상태 변화·키 변화·언마운트에서 비운다. 도착 포커스는 Kernel `pageNavigation.consume`을 직접 불러(차단 해제 알림 구독 포함) 등록된 `focusTarget`, 없으면 `focusPageFallback`으로 옮긴다. 고정 fixture 모듈은 `src/__fixtures__/module-fixture/`(패키지 아님, 앱에 마운트하지 않음, `@ap/contracts`·`@ap/ui`와 자기 디렉터리만 import — `eslint.config.js`의 `hostModuleDir`). 검증 `ModuleScreen.test.tsx`.
- `RouteErrorBoundary.tsx` — 메뉴 화면의 렌더 실패를 콘텐츠 슬롯 안에 가두고 Correlation ID(`usePlatform().reportError`)와 다시 시도·홈을 보인다(06 §4). 홈은 열 수 있는 `/` 메뉴이고, 없거나 못 열면 열 수 있는 사이드바 공간 홈, 그것도 없으면 그리지 않는다(`HomeLink`). 메뉴·params·서버 revision이 바뀌면 풀리고, lazy 청크 로드 실패의 다시 시도는 페이지 새로고침이다. 이벤트 핸들러·비동기 오류는 대상이 아니다.

## 규칙

- import 가능: `@ap/contracts`, `@ap/kernel`, `@ap/components`, `@ap/ui`. 앱·mock·메뉴 화면 import 금지. 특정 메뉴 id를 코드에 쓰지 않는다.
- 도메인 선택지(설비·room·조건 목록)를 셸이 계산하지 않는다. 어댑터가 세션 권한으로 거른 결과를 표시만 한다.
- 개발 전용 도구(역할 전환, 응답 시나리오)는 셸에 넣지 않는다. 앱이 `slots.topBarTools`로 주입하고 레일 아래에 렌더한다(ADR-0009 슬롯 이름 유지).
- 레이아웃 치수·IA 변경은 07/06 §9 변경이다. 워크스페이스 층(06 §9.1)도 여기와 Registry에 얹는다.

- 상세 슬롯 aside는 셸이 소유한다. 상세가 없으면 폭 0, 열리면 공유 폭 토큰을 06 §7 범위로 clamp하며 본문을 overlay·scrim·inert로 막지 않는다(ADR-0013, 06 §13).

## 검증

`pnpm --filter @ap/shell test`(경계 단위 테스트)로 좁혀 본 뒤 루트 검사(루트 `AGENTS.md`)에 더해 `pnpm dev`로 사이드바·레일·Context Bar·역할 전환 후 메뉴 노출을 직접 확인.
